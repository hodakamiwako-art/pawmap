/* ソウル犬同伴マップ — Leaflet 版 */
'use strict';

const $ = id => document.getElementById(id);
const SEOUL = [37.5512, 126.9882];

const ICON_PAW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><ellipse cx="6.5" cy="9" rx="2.6" ry="3.4"/><ellipse cx="12" cy="6.6" rx="2.7" ry="3.6"/><ellipse cx="17.5" cy="9" rx="2.6" ry="3.4"/><path d="M12 12.4c3.4 0 6 2.5 6 5 0 1.7-1.4 2.9-3.2 2.9-1.1 0-1.9-.5-2.8-.5s-1.7.5-2.8.5C7.4 20.3 6 19.1 6 17.4c0-2.5 2.6-5 6-5z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M3 13h18M12 13V4M12 4c-4 0-7.4 3.6-9 9M12 4c4 0 7.4 3.6 9 9M12 13v6a2 2 0 0 0 4 0"/></svg>';

const st = { q:'', kind:'', genre:'', area:'', ter:false, favonly:false, sort:'area', sel:null, here:null };
let PLACES = [], markers = new Map(), map, tiles, hereMarker, hereRing, fitted = false;

/* ---------- favourites ---------- */
const FAV_KEY = 'pawmap.favs.v1';
let favs = new Set();
try { favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) {}
const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (e) {} };

/* ---------- basemap that follows the theme ---------- */
const TILE = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const darkQ = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => document.documentElement.dataset.theme === 'dark' ||
  (document.documentElement.dataset.theme !== 'light' && darkQ.matches);

function setBasemap() {
  const url = isDark() ? TILE.dark : TILE.light;
  if (tiles) { tiles.setUrl(url); return; }
  tiles = L.tileLayer(url, { attribution: ATTR, subdomains: 'abcd', maxZoom: 20, minZoom: 10 }).addTo(map);
}
darkQ.addEventListener('change', setBasemap);

/* ---------- geo helpers ---------- */
function distance(a, b, c, d) {           // metres, haversine
  const R = 6371000, t = Math.PI / 180;
  const dLat = (c - a) * t, dLon = (d - b) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const fmtDist = m => m < 950 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(m < 9500 ? 1 : 0) + 'km';

/* ---------- boot ---------- */
init();

async function init() {
  PLACES = await fetch('data/places.json').then(r => r.json());

  map = L.map('map', { center: SEOUL, zoom: 12, zoomControl: false, preferCanvas: false });
  L.control.zoom({ position: 'topright' }).addTo(map);
  setBasemap();

  // two shops can share one building (and one coordinate) — nudge them apart
  // by ~9 m so both stay clickable, without moving the address itself
  const groups = new Map();
  for (const p of PLACES) {
    const k = p.lat.toFixed(6) + ',' + p.lng.toFixed(6);
    groups.set(k, (groups.get(k) || []).concat(p));
  }
  for (const g of groups.values()) {
    if (g.length < 2) { g[0].mlat = g[0].lat; g[0].mlng = g[0].lng; continue; }
    const R = 0.00008;                                  // ≈ 9 m
    g.forEach((p, i) => {
      const a = (2 * Math.PI * i) / g.length;
      p.mlat = p.lat + R * Math.cos(a);
      p.mlng = p.lng + R * Math.sin(a) / Math.cos(p.lat * Math.PI / 180);
    });
  }

  for (const p of PLACES) {
    const m = L.marker([p.mlat, p.mlng], {
      icon: L.divIcon({
        className: 'mkw' + (p.terrace === 'あり' ? ' t' : '') + (favs.has(p.id) ? ' fav' : ''),
        html: `<span class="mk${p.kind === 'レストラン' ? ' r' : ''}"></span>`,
        iconSize: [14, 14], iconAnchor: [7, 7]
      }),
      title: p.name_ja, riseOnHover: true, keyboard: true
    });
    m.on('click', () => select(p.id));
    markers.set(p.id, m);
  }

  buildFilters();
  render();

  // the map may start hidden (mobile list view); only fit once it has a real size
  const mapEl = $('map');
  const hasSize = () => mapEl.clientWidth > 0 && mapEl.clientHeight > 0;
  if (hasSize()) { fitted = true; fitAll(); }
  new ResizeObserver(() => {
    if (!hasSize()) return;
    map.invalidateSize();
    if (!fitted) { fitted = true; fitAll(); }
  }).observe(mapEl);

  $('q').oninput      = e => { st.q = e.target.value.trim(); render(); };
  $('genre').onchange = e => { st.genre = e.target.value; render(); };
  $('area').onchange  = e => { st.area = e.target.value; render(); };
  $('sort').onchange  = e => { st.sort = e.target.value; if (st.sort === 'dist' && !st.here) locate(); render(); };
  $('ter').onchange   = e => { st.ter = e.target.checked; render(); };
  $('favonly').onchange = e => { st.favonly = e.target.checked; render(); };
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    st.kind = b.dataset.kind;
    document.querySelectorAll('.seg button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    render();
  });
  $('reset').onclick = () => {
    Object.assign(st, { q:'', kind:'', genre:'', area:'', ter:false, favonly:false, sort:'area' });
    $('q').value = ''; $('genre').value = ''; $('area').value = '';
    $('sort').value = 'area'; $('ter').checked = false; $('favonly').checked = false;
    document.querySelectorAll('.seg button').forEach((o, i) => o.setAttribute('aria-pressed', String(i === 0)));
    render();
  };
  $('locate').onclick = locate;
  $('fitall').onclick = fitAll;
  $('scrim').onclick = closeDetail;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

  $('tabList').onclick = () => setView('list');
  $('tabMap').onclick  = () => setView('map');
  setView('list');
}

function buildFilters() {
  for (const g of [...new Set(PLACES.map(p => p.genre))].sort((a, b) => a.localeCompare(b, 'ja')))
    $('genre').append(new Option(g, g));
  for (const a of [...new Set(PLACES.map(p => p.gu_ja))].sort((a, b) => a.localeCompare(b, 'ja')))
    $('area').append(new Option(a, a));
}

function setView(v) {
  document.body.dataset.view = v;
  $('tabList').setAttribute('aria-pressed', String(v === 'list'));
  $('tabMap').setAttribute('aria-pressed', String(v === 'map'));
  if (v === 'map') setTimeout(() => map.invalidateSize(), 60);
}

/* ---------- filtering & list ---------- */
function match(p) {
  if (st.kind && p.kind !== st.kind) return false;
  if (st.genre && p.genre !== st.genre) return false;
  if (st.area && p.gu_ja !== st.area) return false;
  if (st.ter && p.terrace !== 'あり') return false;
  if (st.favonly && !favs.has(p.id)) return false;
  if (st.q) {
    const h = (p.name_ja + p.name_ko + p.genre + p.detail + p.area_ja + p.area_ko + p.gu_ja + p.cat_ko + p.addr_ko).toLowerCase();
    if (!h.includes(st.q.toLowerCase())) return false;
  }
  return true;
}

function render() {
  let vis = PLACES.filter(match);
  if (st.sort === 'dist' && st.here) {
    vis.forEach(p => p._d = distance(st.here[0], st.here[1], p.lat, p.lng));
    vis.sort((a, b) => a._d - b._d);
  } else if (st.sort === 'rating') {
    vis.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0));
  }
  $('n').textContent = vis.length;

  const list = $('list');
  list.innerHTML = '';
  if (!vis.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = st.favonly ? 'お気に入りがまだありません。詳細画面の★で登録できます。'
                                : '条件に合う店がありません。絞り込みを緩めてみてください。';
    list.appendChild(li);
  }
  for (const p of vis) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card' + (p.kind === 'レストラン' ? ' r' : '') + (st.sel === p.id ? ' on' : '');
    b.id = 'card-' + p.id;
    b.innerHTML =
      `<span class="bullet${p.terrace === 'あり' ? ' t' : ''}"></span>` +
      `<span class="nm"></span>` +
      `<span class="ko"></span>` +
      `<span class="meta"><span class="tag ${p.kind === 'カフェ' ? 'g' : 'o'}"></span>` +
      `${p.terrace === 'あり' ? '<span class="tag o">テラス席あり</span>' : ''}` +
      `<span class="ar"></span></span>` +
      `<span class="aside">${favs.has(p.id) ? '<span class="fav">★</span>' : ''}` +
      `${st.here ? '<span class="dist"></span>' : ''}</span>`;
    b.querySelector('.nm').textContent = p.name_ja;
    b.querySelector('.ko').textContent = p.name_ko;
    b.querySelector('.tag').textContent = p.genre;
    b.querySelector('.ar').textContent = p.area_ja;
    const dEl = b.querySelector('.dist');
    if (dEl) dEl.textContent = st.here ? fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng)) : '';
    b.onclick = () => select(p.id, true);
    li.appendChild(b);
    list.appendChild(li);
  }

  const ids = new Set(vis.map(p => p.id));
  for (const [id, m] of markers) {
    const on = ids.has(id);
    if (on && !map.hasLayer(m)) m.addTo(map);
    if (!on && map.hasLayer(m)) map.removeLayer(m);
  }
}

/* ---------- selection & detail ---------- */
function markerClass(p) {
  return 'mkw' + (p.terrace === 'あり' ? ' t' : '') + (favs.has(p.id) ? ' fav' : '') + (st.sel === p.id ? ' on' : '');
}
function refreshMarker(p) {
  const m = markers.get(p.id);
  if (m && m._icon) m._icon.className = markerClass(p) + ' leaflet-marker-icon leaflet-div-icon leaflet-zoom-animated leaflet-interactive';
}

function select(id, fly) {
  const p = PLACES.find(x => x.id === id);
  if (!p) return;
  const prev = st.sel;
  st.sel = id;
  if (prev) { const q = PLACES.find(x => x.id === prev); if (q) refreshMarker(q); }
  refreshMarker(p);

  document.querySelectorAll('.card.on').forEach(c => c.classList.remove('on'));
  const c = $('card-' + id);
  if (c) { c.classList.add('on'); c.scrollIntoView({ block: 'nearest' }); }

  const mp = [p.mlat ?? p.lat, p.mlng ?? p.lng];
  if (fly || map.getZoom() < 15) map.flyTo(mp, Math.max(map.getZoom(), 16), { duration: .6 });
  else map.panTo(mp);
  if (window.innerWidth <= 860) setView('map');

  const isFav = favs.has(p.id);
  const dist = st.here ? fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng)) : null;
  const d = $('detail');
  d.innerHTML =
    `<div class="top">
       <div class="dbtns">
         <button class="iconbtn${isFav ? ' starred' : ''}" id="favbtn" aria-label="お気に入り">${isFav ? '★' : '☆'}</button>
         <button class="iconbtn" id="closebtn" aria-label="閉じる">✕</button>
       </div>
       <div class="eyebrow">${p.gu_ja} · ${p.area_ja}${dist ? ' · 現在地から ' + dist : ''}</div>
       <h2></h2>
       <p class="hangul"></p>
       <div class="badges">
         <span class="badge in">${ICON_PAW}店内に入れます</span>
         <span class="badge ${p.terrace === 'あり' ? 'ter' : 'no'}">${p.terrace === 'あり' ? ICON_SUN + 'テラス席あり' : 'テラス席なし'}</span>
       </div>
     </div>
     <dl class="dl">
       <dt>ジャンル</dt><dd class="j-genre"></dd>
       <dt>料理</dt><dd class="j-detail"></dd>
       <dt>住所</dt><dd class="addr"></dd>
       <dt>評価</dt><dd class="stars"></dd>
       <dt>業態</dt><dd class="j-ind"></dd>
     </dl>
     <div class="phrase">
       <div class="lab">お店で見せる / 聞く</div>
       <div class="kq">강아지 데리고 들어가도 될까요?</div>
       <div class="ja">「犬を連れて入ってもいいですか？」</div>
     </div>
     <div class="links">
       <a class="primary" href="${p.gmap}" target="_blank" rel="noopener">Googleマップで開く<span class="arr">↗</span></a>
       <a href="${p.naver}" target="_blank" rel="noopener">NAVERマップで開く（韓国で最も正確）<span class="arr">↗</span></a>
       <a href="${p.dc}" target="_blank" rel="noopener">DiningCodeで口コミ・営業時間を見る<span class="arr">↗</span></a>
     </div>
     <div class="foot">この店は韓国・食品医薬品安全処が公開する<a href="https://www.foodsafetykorea.go.kr/portal/petKorea.do" target="_blank" rel="noopener">「반려동물 동반 가능 업소」登録リスト</a>に載っています。ただし犬種・体重の制限やケージ／カート必須といった独自ルールを設けている店もあります。訪問前に電話かSNSでご確認ください。</div>`;
  d.querySelector('h2').textContent = p.name_ja;
  d.querySelector('.hangul').textContent = p.name_ko;
  d.querySelector('.j-genre').textContent = p.genre + '（' + p.cat_ko + '）';
  d.querySelector('.j-detail').textContent = p.detail;
  d.querySelector('.addr').textContent = p.addr_ko;
  d.querySelector('.stars').textContent = p.rating ? `★ ${p.rating} / 5　口コミ ${p.reviews}件` : '—';
  d.querySelector('.j-ind').textContent = p.induty;
  $('closebtn').onclick = closeDetail;
  $('favbtn').onclick = () => {
    if (favs.has(p.id)) favs.delete(p.id); else favs.add(p.id);
    saveFavs();
    const on = favs.has(p.id);
    $('favbtn').textContent = on ? '★' : '☆';
    $('favbtn').classList.toggle('starred', on);
    refreshMarker(p);
    render();
    if (st.sel === p.id) $('card-' + p.id)?.classList.add('on');
  };
  d.classList.add('open');
  $('scrim').classList.add('open');
  d.scrollTop = 0;
}

function closeDetail() {
  $('detail').classList.remove('open');
  $('scrim').classList.remove('open');
  const prev = st.sel;
  st.sel = null;
  if (prev) { const p = PLACES.find(x => x.id === prev); if (p) refreshMarker(p); }
  document.querySelectorAll('.card.on').forEach(c => c.classList.remove('on'));
}

/* ---------- map actions ---------- */
function fitAll() {
  const pts = PLACES.filter(match).map(p => [p.mlat ?? p.lat, p.mlng ?? p.lng]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  else map.setView(SEOUL, 12);
}

function locate() {
  const btn = $('locate');
  if (!navigator.geolocation) { alert('この端末では現在地を取得できません。'); return; }
  btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition(pos => {
    btn.classList.remove('busy');
    btn.classList.add('act');
    const { latitude: la, longitude: lo, accuracy: acc } = pos.coords;
    st.here = [la, lo];
    if (hereMarker) map.removeLayer(hereMarker);
    if (hereRing) map.removeLayer(hereRing);
    hereRing = L.circle([la, lo], { radius: Math.min(acc, 400), color: '#2E7DD1', weight: 1, fillOpacity: .1 }).addTo(map);
    hereMarker = L.marker([la, lo], {
      icon: L.divIcon({ className: '', html: '<span class="here"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      zIndexOffset: 1000, title: '現在地'
    }).addTo(map);
    map.flyTo([la, lo], 15, { duration: .8 });
    $('sort').value = st.sort = 'dist';
    render();
  }, err => {
    btn.classList.remove('busy');
    const msg = err.code === 1
      ? '位置情報の利用が許可されていません。ブラウザの設定でこのサイトに許可を与えてください。'
      : '現在地を取得できませんでした。屋外や窓際でもう一度お試しください。';
    alert(msg);
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
}

/* ---------- PWA ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('install').classList.add('show');
});
$('install').onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('install').classList.remove('show');
};
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
