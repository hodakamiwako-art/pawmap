/* お気に入りと「自分のピン」の保管庫。
   端末内（localStorage）を常に正とし、ログインしていれば Supabase と往復させる。
   ログイン前に貯めたものは、初回ログイン時にそのままアカウントへ引き継ぐ。 */
'use strict';

const FAV_KEY = 'pawmap.favs.v1';
const POI_KEY = 'pawmap.pois.v1';

const Store = {
  favs: new Set(),
  pois: [],            // {id, name, note, url, lat, lng, updated_at, deleted}
  sb: null,            // supabase client
  user: null,
  syncState: 'idle',   // idle | ok | pending | error
  syncDetail: '',
  onchange: () => {},
  onauth: () => {},

  /* ---------- 端末内 ---------- */
  loadLocal() {
    try { this.favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) {}
    try { this.pois = JSON.parse(localStorage.getItem(POI_KEY) || '[]'); } catch (e) {}
  },
  saveLocal() {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...this.favs]));
      localStorage.setItem(POI_KEY, JSON.stringify(this.pois));
    } catch (e) {}
  },

  /* ---------- お気に入り ---------- */
  isFav(id) { return this.favs.has(id); },
  toggleFav(id) {
    const on = !this.favs.has(id);
    if (on) this.favs.add(id); else this.favs.delete(id);
    this.saveLocal();
    if (this.sb && this.user) {
      if (on) this.sb.from('favourites')
        .upsert({ user_id: this.user.id, place_id: id }, { onConflict: 'user_id,place_id' })
        .then(noop, noop);
      else this.sb.from('favourites').delete().match({ user_id: this.user.id, place_id: id }).then(noop, noop);
    }
    this.onchange();
    return on;
  },

  /* ---------- 自分のピン ---------- */
  livePois() { return this.pois.filter(p => !p.deleted); },
  getPoi(id) { return this.pois.find(p => p.id === id); },
  upsertPoi(poi) {
    const now = new Date().toISOString();
    const i = this.pois.findIndex(p => p.id === poi.id);
    const rec = Object.assign({ note: '', url: '', deleted: false }, poi, { updated_at: now });
    if (i >= 0) this.pois[i] = Object.assign(this.pois[i], rec); else this.pois.push(rec);
    this.saveLocal();
    this.pushPoi(rec);
    this.onchange();
    return rec;
  },
  removePoi(id) {
    const p = this.getPoi(id);
    if (!p) return;
    p.deleted = true;
    p.updated_at = new Date().toISOString();
    this.saveLocal();
    this.pushPoi(p);
    this.onchange();
  },
  pushPoi(p) {
    if (!this.sb || !this.user) return;
    this.sb.from('pins').upsert({
      id: p.id, user_id: this.user.id, name: p.name, note: p.note || '', url: p.url || '',
      lat: p.lat, lng: p.lng, deleted: !!p.deleted, updated_at: p.updated_at,
    }, { onConflict: 'id' }).then(({ error }) => {
      // url 列がまだ無いテーブルでも黙って失敗しないようにする
      if (error) { this.syncState = error.code === 'PGRST204' ? 'pending' : 'error';
                   this.syncDetail = error.message || ''; this.onchange(); }
    }, noop);
  },

  /* ---------- Supabase ---------- */
  configured() {
    const c = window.PAWMAP_CONFIG || {};
    return !!(c.supabaseUrl && c.supabaseAnonKey && window.supabase);
  },
  initAuth() {
    if (!this.configured()) return;
    const c = window.PAWMAP_CONFIG;
    this.sb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
    this.sb.auth.onAuthStateChange((_e, session) => {
      this.user = session ? session.user : null;
      this.onauth(this.user);
      if (this.user) this.sync();
    });
    this.sb.auth.getSession().then(({ data }) => {
      this.user = data.session ? data.session.user : null;
      this.onauth(this.user);
      if (this.user) this.sync();
    }, noop);
  },
  async signIn(email) {
    if (!this.sb) throw new Error('not configured');
    const { error } = await this.sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.href.split('#')[0] },
    });
    if (error) throw error;
  },
  async signOut() {
    if (this.sb) await this.sb.auth.signOut();
    this.user = null;
    this.onauth(null);
  },

  /* サーバーと端末をならす。削除はトゥームストーンで表し、
     同じ id なら updated_at が新しいほうを勝たせる。 */
  async sync() {
    if (!this.sb || !this.user) return;
    const uid = this.user.id;
    this.syncState = 'idle';

    // お気に入り: 和集合（端末で消したものはサーバーからも消えている）
    const { data: rf, error: ef } = await this.sb.from('favourites').select('place_id').eq('user_id', uid);
    if (ef) {
      // テーブル未作成なら同期だけ止め、端末内の動作は続ける
      this.syncState = ef.code === 'PGRST205' ? 'pending' : 'error';
      this.syncDetail = ef.message || '';
      this.onchange();
      return;
    }
    const remote = new Set((rf || []).map(r => r.place_id));
    const localOnly = [...this.favs].filter(id => !remote.has(id));
    if (localOnly.length) {
      await this.sb.from('favourites')
        .upsert(localOnly.map(id => ({ user_id: uid, place_id: id })), { onConflict: 'user_id,place_id' });
    }
    remote.forEach(id => this.favs.add(id));

    // ピン: id ごとに新しいほうを採用
    const { data: rp, error: ep } = await this.sb.from('pins').select('*').eq('user_id', uid);
    if (ep) {
      this.syncState = ep.code === 'PGRST205' ? 'pending' : 'error';
      this.syncDetail = ep.message || '';
      this.onchange();
      return;
    }
    const byId = new Map(this.pois.map(p => [p.id, p]));
    for (const r of rp || []) {
      const mine = byId.get(r.id);
      if (!mine || (r.updated_at || '') > (mine.updated_at || '')) {
        byId.set(r.id, { id: r.id, name: r.name, note: r.note, url: r.url || '',
                         lat: r.lat, lng: r.lng, deleted: r.deleted, updated_at: r.updated_at });
      }
    }
    this.pois = [...byId.values()];
    const remoteIds = new Set((rp || []).map(r => r.id));
    for (const p of this.pois) {
      const r = (rp || []).find(x => x.id === p.id);
      if (!r || (p.updated_at || '') > (r.updated_at || '')) this.pushPoi(p);
    }
    void remoteIds;
    this.syncState = 'ok';
    this.saveLocal();
    this.onchange();
  },

  /* ---------- バックアップ ---------- */
  exportBlob() {
    return new Blob([JSON.stringify({ favs: [...this.favs], pois: this.pois }, null, 2)],
                    { type: 'application/json' });
  },
  importObject(o) {
    if (Array.isArray(o.favs)) o.favs.forEach(id => this.favs.add(id));
    if (Array.isArray(o.pois)) {
      const byId = new Map(this.pois.map(p => [p.id, p]));
      for (const p of o.pois) {
        const mine = byId.get(p.id);
        if (!mine || (p.updated_at || '') > (mine.updated_at || '')) byId.set(p.id, p);
      }
      this.pois = [...byId.values()];
    }
    this.saveLocal();
    this.onchange();
  },
};

function noop() {}

/* 入力されたURLを http/https に限って正規化する。
   javascript: や data: をそのままリンクにしないための関門。 */
function safeUrl(raw) {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/\s/.test(v)) return null;                       // 空白入りはURLではなくメモの誤入力
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') || u.hostname.startsWith('.') || u.hostname.endsWith('.')) return null;
    return u.href;
  } catch (e) {
    return null;
  }
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
