/* ソウル犬同伴マップ */
'use strict';

const $ = id => document.getElementById(id);
const SEOUL = [37.5512, 126.9882];

const ICON_PAW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><ellipse cx="6.5" cy="9" rx="2.6" ry="3.4"/><ellipse cx="12" cy="6.6" rx="2.7" ry="3.6"/><ellipse cx="17.5" cy="9" rx="2.6" ry="3.4"/><path d="M12 12.4c3.4 0 6 2.5 6 5 0 1.7-1.4 2.9-3.2 2.9-1.1 0-1.9-.5-2.8-.5s-1.7.5-2.8.5C7.4 20.3 6 19.1 6 17.4c0-2.5 2.6-5 6-5z"/></svg>';
const ICON_IG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M3 13h18M12 13V4M12 4c-4 0-7.4 3.6-9 9M12 4c4 0 7.4 3.6 9 9M12 13v6a2 2 0 0 0 4 0"/></svg>';

let lang = detectLang();
let t = I18N[lang];

const st = { q:'', kind:'', genre:'', sido:'', sigungu:'', ter:false, favonly:false, mineonly:false,
             vet:false, shop:false, stay:false, onlylang:false, sort:'area', sel:null, selKind:null,
             here:null, placing:false, limit:200 };

let PLACES = [], SUB = null, PETS = null, STAYS = null;
let map, tiles, markers = new Map(), poiMarkers = new Map(), petMarkers = new Map(),
    stayMarkers = new Map(), subLayer, stationLayer;
let hereMarker, hereRing, fitted = false, ghost = null;
// 全国だとマーカーが5千個近くになる。DOMに載せるのは画面内だけにする
let visIds = new Set(), visPetIds = new Set(), visPoiIds = new Set(), visStayIds = new Set();

/* ---------- 地図の下地（テーマに追従） ---------- */
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
  tiles = L.tileLayer(url, { attribution: ATTR, subdomains: 'abcd', maxZoom: 20, minZoom: 6 }).addTo(map);
}
darkQ.addEventListener('change', setBasemap);

/* ---------- 外部地図へのリンク（データに持たせず、その場で組み立てる） ---------- */
const gmapUrl  = p => `https://www.google.com/maps/search/?api=1&query=${p.lat}%2C${p.lng}`;
const naverUrl = p => `https://map.naver.com/p/search/${encodeURIComponent((p.ko || '') + ' ' + (p.addr || ''))}`;
const dcUrl    = p => (p.rid ? `https://www.diningcode.com/profile.php?rid=${encodeURIComponent(p.rid)}` : '');

/* ---------- 距離 ---------- */
function distance(a, b, c, d) {
  const R = 6371000, k = Math.PI / 180;
  const dLat = (c - a) * k, dLon = (d - b) * k;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * k) * Math.cos(c * k) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const fmtDist = m => m < 950 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(m < 9500 ? 1 : 0) + 'km';

/* ---------- 起動 ---------- */
init();

async function init() {
  PLACES = await fetch('data/places.json').then(r => r.json());
  nudgeDuplicates(PLACES);

  Store.loadLocal();
  Store.onchange = () => { syncPoiMarkers(); render(); };
  Store.onauth = renderAccount;
  Store.initAuth();

  map = L.map('map', { center: SEOUL, zoom: 12, zoomControl: false, minZoom: 6, maxZoom: 20 });
  L.control.zoom({ position: 'topright' }).addTo(map);
  setBasemap();
  subLayer = L.layerGroup();
  stationLayer = L.layerGroup();

  for (const p of PLACES) {
    const m = L.marker([p.mlat, p.mlng], { icon: placeIcon(p), title: p.ja, riseOnHover: true, keyboard: true });
    m.on('click', () => select(p.id, 'place'));
    markers.set(p.id, m);
  }
  syncPoiMarkers();

  map.on('click', e => { if (st.placing) placeAt(e.latlng); });
  map.on('zoomend', updateStationVisibility);
  map.on('moveend', updateMarkersInView);

  applyLang();
  render();
  ensureSubway();

  const mapEl = $('map');
  const hasSize = () => mapEl.clientWidth > 0 && mapEl.clientHeight > 0;
  if (hasSize()) { fitted = true; homeView(); }
  new ResizeObserver(() => {
    if (!hasSize()) return;
    map.invalidateSize();
    if (!fitted) { fitted = true; homeView(); }
  }).observe(mapEl);

  wire();
}

function wire() {
  $('q').oninput      = e => { st.q = e.target.value.trim(); st.limit = PAGE; render(); };
  $('genre').onchange = e => { st.genre = e.target.value; st.limit = PAGE; render(); };
  $('sido').onchange = e => { st.sido = e.target.value; st.sigungu = ''; buildSigungu(); st.limit = PAGE; render(); };
  $('sigungu').onchange = e => { st.sigungu = e.target.value; st.limit = PAGE; render(); };
  $('sort').onchange  = e => { st.sort = e.target.value; if (st.sort === 'dist' && !st.here) locate(); render(); };
  $('ter').onchange   = e => { st.ter = e.target.checked; st.limit = PAGE; render(); };
  $('favonly').onchange  = e => { st.favonly = e.target.checked; st.limit = PAGE; render(); };
  $('mineonly').onchange = e => { st.mineonly = e.target.checked; st.limit = PAGE; render(); };
  $('vet').onchange      = e => { st.vet = e.target.checked; ensurePets(); };
  $('shop').onchange     = e => { st.shop = e.target.checked; ensurePets(); };
  $('onlylang').onchange = e => { st.onlylang = e.target.checked; st.limit = PAGE; ensurePets(); };
  $('stay').onchange     = e => { st.stay = e.target.checked; st.limit = PAGE; ensureStays(); };

  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
    st.kind = b.dataset.kind; st.limit = PAGE;
    document.querySelectorAll('.seg button').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    render();
  });
  $('reset').onclick = () => {
    Object.assign(st, { q:'', kind:'', genre:'', sido:'', sigungu:'', ter:false, favonly:false, mineonly:false, sort:'area' });
    $('q').value = ''; $('genre').value = ''; $('sido').value = ''; buildSigungu();
    $('sort').value = 'area'; $('ter').checked = $('favonly').checked = $('mineonly').checked = false;
    st.onlylang = false; $('onlylang').checked = false;
    st.limit = PAGE;
    document.querySelectorAll('.seg button').forEach((o, i) => o.setAttribute('aria-pressed', String(i === 0)));
    render();
  };
  $('ftoggle').onclick = () => {
    const open = document.body.dataset.filters !== 'closed';
    document.body.dataset.filters = open ? 'closed' : 'open';
    $('ftoggle').setAttribute('aria-expanded', String(!open));
  };
  document.body.dataset.filters = 'closed';

  $('locate').onclick = locate;
  $('fitall').onclick = fitAll;
  $('addpin').onclick = startPlacing;
  $('scrim').onclick = closeDetail;
  $('modalScrim').onclick = closeModal;
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('modal').classList.contains('open')) closeModal();
    else if (st.placing) stopPlacing();
    else closeDetail();
  });
  $('tabList').onclick = () => setView('list');
  $('tabMap').onclick  = () => setView('map');
  setView('list');

  document.querySelectorAll('.langsw button').forEach(b => b.onclick = () => setLang(b.dataset.lang));
  $('account').onclick = openAccount;
}

/* ---------- 言語 ---------- */
function setLang(l) {
  if (!I18N[l]) return;
  lang = l; t = I18N[l];
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  applyLang();
  render();
  ensureSubway();
  if (st.sel) select(st.sel, st.selKind);
}

function applyLang() {
  document.documentElement.lang = t.html_lang;
  document.querySelectorAll('.langsw button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  $('t-eyebrow').textContent = t.eyebrow;
  $('t-title').textContent = t.title;
  $('t-assurance').innerHTML = t.assurance(PLACES.length);
  $('install').textContent = t.install;
  $('tabList').textContent = t.tab_list;
  $('tabMap').textContent = t.tab_map;
  $('q').placeholder = t.search_ph;
  $('t-filters').textContent = t.filters;
  const seg = document.querySelectorAll('.seg button');
  seg[0].textContent = t.kind_all;
  seg[1].innerHTML = '<span class="dot"></span>' + t.kind_cafe;
  seg[2].innerHTML = '<span class="dot"></span>' + t.kind_meal;
  $('reset').textContent = t.reset;
  $('t-unit').textContent = $('t-unit2').textContent = t.count('').trim();
  document.querySelector('.chk.t span').textContent = t.terrace_only;
  document.querySelector('.chk.f span').textContent = t.fav_only;
  document.querySelector('.chk.m span').textContent = t.show_mine;
  document.querySelector('.chk.v span').textContent = t.show_vet;
  document.querySelector('.chk.p span').textContent = t.show_shop;
  document.querySelector('.chk.l span').textContent = t.only_lang;
  document.querySelector('.chk.h span').textContent = t.show_stay;
  $('t-legend').textContent = t.legend;
  $('t-lcafe').textContent = t.legend_cafe;
  $('t-lmeal').textContent = t.legend_meal;
  $('t-lter').textContent = t.legend_terrace;
  $('t-lmine').textContent = t.legend_mine;
  $('t-lvet').textContent = t.legend_vet;
  $('t-lshop').textContent = t.legend_shop;
  $('t-lstay').textContent = t.legend_stay;
  $('zoomhint').textContent = t.zoom_hint;
  $('locate').title = t.locate;
  $('fitall').title = t.fitall;
  $('addpin').title = t.addpin;
  buildFilters();
  renderAccount(Store.user);
  if (SUB) drawSubway();
}

function buildFilters() {
  const g = $('genre'), s = $('sort');
  g.innerHTML = ''; s.innerHTML = '';
  g.append(new Option(t.genre_all, ''));
  const genres = [...new Map(PLACES.map(p => [p.genre.ja, p.genre])).values()]
    .sort((x, y) => x[lang].localeCompare(y[lang], lang));
  for (const x of genres) g.append(new Option(x[lang], x.ja));
  for (const [v, k] of [['area','sort_area'],['dist','sort_dist'],['rating','sort_rating'],['name','sort_name']])
    s.append(new Option(t[k], v));
  g.value = st.genre; s.value = st.sort;

  const sd = $('sido');
  sd.innerHTML = '';
  sd.append(new Option(t.sido_all, ''));
  const sidos = [...new Map(PLACES.map(p => [p.sido.ko, p.sido])).values()]
    .sort((x, y) => x[lang].localeCompare(y[lang], lang));
  for (const x of sidos) sd.append(new Option(x[lang], x.ko));
  sd.value = st.sido;
  buildSigungu();
}

/* 市郡区は選ばれた広域自治体の中だけを出す */
function buildSigungu() {
  const el = $('sigungu');
  el.innerHTML = '';
  el.append(new Option(t.sigungu_all, ''));
  const pool = PLACES.filter(p => !st.sido || p.sido.ko === st.sido);
  const list = [...new Map(pool.map(p => [p.sigungu.ko, p.sigungu])).values()]
    .sort((x, y) => x[lang].localeCompare(y[lang], lang));
  for (const x of list) el.append(new Option(x[lang], x.ko));
  el.disabled = list.length <= 1;
  el.value = st.sigungu;
}

/* ---------- 重なり回避 ---------- */
function nudgeDuplicates(list) {
  const groups = new Map();
  for (const p of list) {
    const k = p.lat.toFixed(6) + ',' + p.lng.toFixed(6);
    groups.set(k, (groups.get(k) || []).concat(p));
  }
  for (const g of groups.values()) {
    if (g.length < 2) { g[0].mlat = g[0].lat; g[0].mlng = g[0].lng; continue; }
    const R = 0.00008;
    g.forEach((p, i) => {
      const a = (2 * Math.PI * i) / g.length;
      p.mlat = p.lat + R * Math.cos(a);
      p.mlng = p.lng + R * Math.sin(a) / Math.cos(p.lat * Math.PI / 180);
    });
  }
}

/* ---------- ピン ---------- */
function placeIcon(p) {
  return L.divIcon({
    className: markerClass(p),
    html: `<span class="mk${p.kind === 'meal' ? ' r' : ''}"></span>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}
function markerClass(p) {
  return 'mkw' + (p.terrace ? ' t' : '') + (Store.isFav(p.id) ? ' fav' : '') +
         (st.sel === p.id && st.selKind === 'place' ? ' on' : '');
}
function refreshMarker(p) {
  const m = markers.get(p.id);
  if (m && m._icon) m._icon.className = markerClass(p) + ' leaflet-marker-icon leaflet-div-icon leaflet-zoom-animated leaflet-interactive';
}

function syncPoiMarkers() {
  const live = new Map(Store.livePois().map(p => [p.id, p]));
  for (const [id, m] of poiMarkers) {
    if (!live.has(id)) { map.removeLayer(m); poiMarkers.delete(id); }
  }
  for (const p of live.values()) {
    let m = poiMarkers.get(p.id);
    const cls = 'mkw mine' + (st.sel === p.id && st.selKind === 'poi' ? ' on' : '');
    if (!m) {
      m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: cls, html: '<span class="mk u"></span>', iconSize: [14,14], iconAnchor: [7,7] }),
        title: p.name, riseOnHover: true,
      });
      m.on('click', () => select(p.id, 'poi'));
      poiMarkers.set(p.id, m);
    } else {
      m.setLatLng([p.lat, p.lng]);
      if (m._icon) m._icon.className = cls + ' leaflet-marker-icon leaflet-div-icon leaflet-zoom-animated leaflet-interactive';
    }
  }
}

/* ---------- 絞り込みと一覧 ---------- */
function match(p) {
  if (st.mineonly) return false;
  if (st.kind && p.kind !== st.kind) return false;
  if (st.genre && p.genre.ja !== st.genre) return false;
  if (st.sido && p.sido.ko !== st.sido) return false;
  if (st.sigungu && p.sigungu.ko !== st.sigungu) return false;
  if (st.ter && !p.terrace) return false;
  if (st.favonly && !Store.isFav(p.id)) return false;
  if (st.q) {
    const stn = p.station ? p.station.ja + p.station.en + p.station.ko : '';
    const h = (p.ko + p.ja + p.en + p.genre.ja + p.genre.en + p.detail.ja + p.detail.en +
               p.area.ja + p.area.en + p.area.ko + p.sigungu.ja + p.sigungu.en + p.sigungu.ko +
               p.sido.ja + p.sido.en + p.cat_ko + p.addr + stn).toLowerCase();
    if (!h.includes(st.q.toLowerCase())) return false;
  }
  return true;
}
function matchPoi(p) {
  if (st.favonly || st.ter || st.kind || st.genre || st.area) return st.mineonly && !st.kind;
  if (!st.q) return true;
  return ((p.name || '') + (p.note || '')).toLowerCase().includes(st.q.toLowerCase());
}

const PAGE = 200;

function render() {
  let vis = PLACES.filter(match);
  const mine = Store.livePois().filter(matchPoi);

  if (st.sort === 'dist' && st.here) {
    const d = p => distance(st.here[0], st.here[1], p.lat, p.lng);
    vis.sort((a, b) => d(a) - d(b));
    mine.sort((a, b) => d(a) - d(b));
  } else if (st.sort === 'rating') {
    vis.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0));
  } else if (st.sort === 'name') {
    vis.sort((a, b) => (a[lang] || a.ko).localeCompare(b[lang] || b.ko, lang));
  }

  const pets = (PETS || []).filter(petMatch);
  if (st.sort === 'dist' && st.here) {
    const dd = p => distance(st.here[0], st.here[1], p.lat, p.lng);
    pets.sort((a, b) => dd(a) - dd(b));
  } else if (st.sort === 'name') {
    pets.sort((a, b) => (a[lang] || a.ko).localeCompare(b[lang] || b.ko, lang));
  }
  const stays = (STAYS || []).filter(stayMatch);
  if (st.sort === 'dist' && st.here) {
    const dd = p => distance(st.here[0], st.here[1], p.lat, p.lng);
    stays.sort((a, b) => dd(a) - dd(b));
  } else if (st.sort === 'name') {
    stays.sort((a, b) => (a[lang] || a.ko).localeCompare(b[lang] || b.ko, lang));
  }
  const total = vis.length + mine.length + pets.length + stays.length;
  $('n').textContent = total;
  $('nmap').textContent = total;
  const active = [st.q, st.kind, st.genre, st.sido, st.sigungu].filter(Boolean).length +
                 (st.ter ? 1 : 0) + (st.favonly ? 1 : 0) + (st.mineonly ? 1 : 0) + (st.onlylang ? 1 : 0);
  const badge = $('fcount');
  badge.textContent = active;
  badge.hidden = active === 0;

  const list = $('list');
  list.innerHTML = '';
  if (!total) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = st.favonly ? t.empty_fav : t.empty;
    list.appendChild(li);
  }
  // 全国だと数千件になる。入力の反応を保つため、出すのは先頭から少しずつ
  const rows = [];
  for (const p of mine) rows.push(() => poiCard(p));
  for (const p of pets) rows.push(() => petCard(p));
  for (const p of stays) rows.push(() => stayCard(p));
  for (const p of vis)  rows.push(() => placeCard(p));
  const shown = Math.min(st.limit, rows.length);
  for (let i = 0; i < shown; i++) list.appendChild(rows[i]());
  if (rows.length > shown) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'more';
    b.textContent = t.show_more(rows.length - shown);
    b.onclick = () => { st.limit += PAGE; render(); };
    li.appendChild(b);
    list.appendChild(li);
  }

  visIds = new Set(vis.map(p => p.id));
  visPoiIds = new Set(mine.map(p => p.id));
  visPetIds = new Set(pets.map(p => p.id));
  visStayIds = new Set(stays.map(p => p.id));
  syncPetMarkers();
  syncStayMarkers();
  updateMarkersInView();
}

/* 画面内（少し余裕をとる）にあるものだけを地図に載せる。
   全国を一望したときは数千個になるので、上限を超えたら間引く。 */
const MARKER_CAP = 800;

function updateMarkersInView() {
  if (!map) return;
  const b = map.getBounds().pad(0.25);
  const cand = [];
  const sweep = (store, wanted) => {
    for (const [id, m] of store) {
      if (wanted.has(id) && b.contains(m.getLatLng())) cand.push(m);
      else if (map.hasLayer(m)) map.removeLayer(m);
    }
  };
  sweep(markers, visIds);
  sweep(poiMarkers, visPoiIds);
  sweep(petMarkers, visPetIds);
  sweep(stayMarkers, visStayIds);

  const capped = cand.length > MARKER_CAP;
  const step = capped ? cand.length / MARKER_CAP : 1;
  const keep = new Set();
  for (let i = 0; i < cand.length; i += step) keep.add(cand[Math.floor(i)]);
  for (const m of cand) {
    const on = !capped || keep.has(m);
    if (on && !map.hasLayer(m)) m.addTo(map);
    else if (!on && map.hasLayer(m)) map.removeLayer(m);
  }
  const hint = $('zoomhint');
  if (hint) hint.hidden = !capped;
}

function placeCard(p) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card' + (p.kind === 'meal' ? ' r' : '') +
                (st.sel === p.id && st.selKind === 'place' ? ' on' : '');
  b.id = 'card-' + p.id;
  b.innerHTML =
    `<span class="bullet${p.terrace ? ' t' : ''}"></span>` +
    `<span class="nm"></span><span class="ko"></span>` +
    `<span class="meta"><span class="tag ${p.kind === 'cafe' ? 'g' : 'o'}"></span>` +
    `${p.terrace ? `<span class="tag o">${t.terrace_yes}</span>` : ''}` +
    `<span class="ar"></span>` +
    `${p.station ? '<span class="stn-tag"></span>' : ''}` +
    `${p.insta ? '<span class="ig-tag">IG</span>' : ''}</span>` +
    `<span class="aside">${Store.isFav(p.id) ? '<span class="fav">★</span>' : ''}` +
    `${st.here ? '<span class="dist"></span>' : ''}</span>`;
  b.querySelector('.nm').textContent = p[lang] || p.ko;
  b.querySelector('.ko').textContent = p.ko;
  b.querySelector('.tag').textContent = p.genre[lang];
  b.querySelector('.ar').textContent = p.area[lang] || p.sigungu[lang] || p.area.ko;
  const stn = b.querySelector('.stn-tag');
  if (stn) stn.textContent = t.station_short(p.station[lang] || p.station.ko, p.station.m);
  const d = b.querySelector('.dist');
  if (d) d.textContent = fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng));
  b.onclick = () => select(p.id, 'place', true);
  li.appendChild(b);
  return li;
}

function poiCard(p) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card mine' + (st.sel === p.id && st.selKind === 'poi' ? ' on' : '');
  b.id = 'card-' + p.id;
  b.innerHTML = `<span class="bullet u"></span><span class="nm"></span><span class="ko"></span>` +
    `<span class="meta"><span class="tag u">${t.mine_badge}</span></span>` +
    `<span class="aside">${st.here ? '<span class="dist"></span>' : ''}</span>`;
  b.querySelector('.nm').textContent = p.name || t.mine_title;
  b.querySelector('.ko').textContent = p.note || '';
  const d = b.querySelector('.dist');
  if (d) d.textContent = fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng));
  b.onclick = () => select(p.id, 'poi', true);
  li.appendChild(b);
  return li;
}

/* ---------- 詳細 ---------- */
function select(id, kind, fly) {
  st.sel = id; st.selKind = kind;
  PLACES.forEach(refreshMarker);
  syncPoiMarkers();
  syncPetMarkers();
  syncStayMarkers();
  document.querySelectorAll('.card.on').forEach(c => c.classList.remove('on'));
  const c = $('card-' + id);
  if (c) { c.classList.add('on'); c.scrollIntoView({ block: 'nearest' }); }

  const target = kind === 'poi' ? Store.getPoi(id)
               : kind === 'pet' ? (PETS || []).find(x => x.id === id)
               : kind === 'stay' ? (STAYS || []).find(x => x.id === id)
               : PLACES.find(x => x.id === id);
  if (!target) return;
  const ll = kind === 'place' ? [target.mlat, target.mlng] : [target.lat, target.lng];
  if (fly || map.getZoom() < 15) map.flyTo(ll, Math.max(map.getZoom(), 16), { duration: .6 });
  else map.panTo(ll);
  setTimeout(updateMarkersInView, 50);
  if (window.innerWidth <= 860) setView('map');

  $('detail').innerHTML = kind === 'poi' ? poiDetail(target)
                        : kind === 'pet' ? petDetail(target)
                        : kind === 'stay' ? stayDetail(target)
                        : placeDetail(target);
  bindDetail(target, kind);
  $('detail').classList.add('open');
  $('scrim').classList.add('open');
  $('detail').scrollTop = 0;
}

function placeDetail(p) {
  const isFav = Store.isFav(p.id);
  const dist = st.here ? fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng)) : null;
  return `<div class="top">
      <div class="dbtns">
        <button class="iconbtn${isFav ? ' starred' : ''}" id="favbtn">${isFav ? '★' : '☆'}</button>
        <button class="iconbtn" id="closebtn">✕</button>
      </div>
      <div class="eyebrow">${esc(p.sido[lang])} · ${esc(p.sigungu[lang])}${p.area[lang] ? ' · ' + esc(p.area[lang]) : ''}${dist ? ' · ' + esc(t.d_dist(dist)) : ''}</div>
      <h2>${esc(p[lang] || p.ko)}</h2>
      <p class="hangul">${esc(p.ko)}</p>
      <div class="badges">
        <span class="badge in">${ICON_PAW}${t.indoor_ok}</span>
        <span class="badge ${p.terrace ? 'ter' : 'no'}">${p.terrace ? ICON_SUN + t.terrace_yes : t.terrace_no}</span>
      </div>
    </div>
    <dl class="dl">
      <dt>${t.d_genre}</dt><dd>${esc(p.genre[lang])}</dd>
      ${p.detail[lang] ? `<dt>${t.d_detail}</dt><dd>${esc(p.detail[lang])}</dd>` : ''}
      ${p.station ? `<dt>${t.d_station}</dt><dd>${esc(t.station_short(p.station[lang] || p.station.ko, p.station.m))}</dd>` : ''}
      <dt>${t.d_addr}</dt><dd class="addr">${esc(p.addr)}${p.prec === 'shop' ? '' : `<br><small>${p.prec === 'area' ? t.approx_area : t.approx}</small>`}</dd>
      ${p.tel ? `<dt>${t.d_tel}</dt><dd><a href="tel:${esc(p.tel.replace(/[^0-9+]/g, ''))}">${esc(p.tel)}</a></dd>` : ''}
      <dt>${t.d_rating}</dt><dd class="stars">${p.rating ? `★ ${p.rating} / 5　${esc(t.d_reviews(p.reviews))}` : '—'}</dd>
      <dt>${t.d_licence}</dt><dd>${esc(p.induty[lang])}</dd>
    </dl>
    <div class="phrase">
      <div class="lab">${t.phrase_label}</div>
      <div class="kq">${t.phrase_ko}</div>
      <div class="ja">${t.phrase_ja}</div>
    </div>
    <div class="links">
      <a class="primary" href="${gmapUrl(p)}" target="_blank" rel="noopener">${t.link_g}<span class="arr">↗</span></a>
      <a href="${naverUrl(p)}" target="_blank" rel="noopener">${t.link_n}<span class="arr">↗</span></a>
      ${p.insta ? `<a class="ig" href="${esc(p.insta)}" target="_blank" rel="noopener">${ICON_IG}${t.link_ig}<span class="arr">↗</span></a>` : ''}
      ${p.web ? `<a href="${esc(p.web)}" target="_blank" rel="noopener">${t.link_web}<span class="arr">↗</span></a>` : ''}
      ${p.rid ? `<a href="${dcUrl(p)}" target="_blank" rel="noopener">${t.link_d}<span class="arr">↗</span></a>` : ''}
      ${p.tel ? `<a href="tel:${esc(p.tel.replace(/[^0-9+]/g, ''))}">${t.link_tel}<span class="arr">↗</span></a>` : ''}
    </div>
    <div class="foot">${t.foot}</div>`;
}

function poiDetail(p) {
  const dist = st.here ? fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng)) : null;
  return `<div class="top">
      <div class="dbtns"><button class="iconbtn" id="closebtn">✕</button></div>
      <div class="eyebrow">${t.mine_badge}${dist ? ' · ' + esc(t.d_dist(dist)) : ''}</div>
      <h2>${esc(p.name || t.mine_title)}</h2>
      ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
    </div>
    <div class="links">
      <a class="primary" href="${gmapUrl(p)}" target="_blank" rel="noopener">${t.link_g}<span class="arr">↗</span></a>
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${t.link_mine_url}<span class="arr">↗</span></a>` : ''}
      <button class="rowbtn" id="editpin">${t.mine_name} / ${t.mine_note}</button>
      <button class="rowbtn danger" id="delpin">${t.del}</button>
    </div>`;
}

function bindDetail(target, kind) {
  $('closebtn').onclick = closeDetail;
  if (kind === 'pet' || kind === 'stay') return;
  if (kind === 'poi') {
    $('editpin').onclick = () => openPoiEditor(target);
    $('delpin').onclick = () => {
      if (confirm(t.del_confirm)) { Store.removePoi(target.id); closeDetail(); }
    };
    return;
  }
  $('favbtn').onclick = () => {
    const on = Store.toggleFav(target.id);
    $('favbtn').textContent = on ? '★' : '☆';
    $('favbtn').classList.toggle('starred', on);
  };
}

function closeDetail() {
  $('detail').classList.remove('open');
  $('scrim').classList.remove('open');
  st.sel = null; st.selKind = null;
  PLACES.forEach(refreshMarker);
  syncPoiMarkers();
  syncPetMarkers();
  syncStayMarkers();
  document.querySelectorAll('.card.on').forEach(c => c.classList.remove('on'));
}

/* ---------- 地図の操作 ---------- */
/* 最初に見せる場所。全国を一望されても掴みどころがないのでソウルから始める */
function homeView() {
  map.setView(SEOUL, 12);
  updateMarkersInView();
}

function fitAll() {
  const pts = PLACES.filter(match).map(p => [p.mlat, p.mlng])
    .concat(Store.livePois().filter(matchPoi).map(p => [p.lat, p.lng]));
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  else map.setView(SEOUL, 12);
}

function locate() {
  const btn = $('locate');
  if (!navigator.geolocation) return;
  btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition(pos => {
    btn.classList.remove('busy'); btn.classList.add('act');
    const { latitude: la, longitude: lo, accuracy: acc } = pos.coords;
    st.here = [la, lo];
    if (hereMarker) map.removeLayer(hereMarker);
    if (hereRing) map.removeLayer(hereRing);
    hereRing = L.circle([la, lo], { radius: Math.min(acc, 400), color: '#2E7DD1', weight: 1, fillOpacity: .1 }).addTo(map);
    hereMarker = L.marker([la, lo], {
      icon: L.divIcon({ className: '', html: '<span class="here"></span>', iconSize: [16,16], iconAnchor: [8,8] }),
      zIndexOffset: 1000,
    }).addTo(map);
    map.flyTo([la, lo], 15, { duration: .8 });
    $('sort').value = st.sort = 'dist';
    render();
  }, () => { btn.classList.remove('busy'); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
}

/* ---------- 地下鉄（常時表示） ---------- */
async function ensureSubway() {
  if (!SUB) SUB = await fetch('data/subway.json').then(r => r.json());
  drawSubway();
  stationLayer.addTo(map);
  updateStationVisibility();
}

function drawSubway() {
  if (!SUB) return;
  subLayer.clearLayers();
  stationLayer.clearLayers();
  for (const line of SUB.lines) {
    for (const path of line.paths) {
      L.polyline(path, { color: line.colour, weight: 3, opacity: .75, lineCap: 'round' }).addTo(subLayer);
    }
  }
  for (const s of SUB.stations) {
    const label = lang === 'ja' ? (s.ja || s.ko) : (s.en || s.ko);
    L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'stw', html: `<span class="stn"></span><span class="stl">${esc(label)}</span>`,
                        iconSize: [9, 9], iconAnchor: [4.5, 4.5] }),
      interactive: false, keyboard: false,
    }).addTo(stationLayer);
  }
}

function updateStationVisibility() {
  const z = map.getZoom();
  document.body.dataset.stations = z >= 15 ? 'labels' : (z >= 13 ? 'dots' : 'off');
  // 全国を見渡しているときに路線を描くと、ソウルが色の塊になるだけ
  const showLines = z >= 11;
  if (showLines && !map.hasLayer(subLayer)) subLayer.addTo(map);
  else if (!showLines && map.hasLayer(subLayer)) map.removeLayer(subLayer);
}

/* ---------- 動物病院・ペットショップ ---------- */
async function ensurePets() {
  if ((st.vet || st.shop) && !PETS) {
    PETS = await fetch('data/pets.json').then(r => r.json());
  }
  syncPetMarkers();
  render();
}

function petShown(p) {
  if (p.type === 'vet') return st.vet;
  return st.shop;   // shop / groom / park / train はまとめて「ペットショップ」側
}

function petMatch(p) {
  if (!petShown(p)) return false;
  // 外国語ページが確認できた病院だけに絞る（確認できたのは5軒だけ）
  if (st.onlylang && p.type === 'vet' && !p.lang) return false;
  if (st.favonly || st.ter || st.mineonly || st.kind || st.genre) return false;
  if (st.sido && p.sido.ko !== st.sido) return false;
  if (st.sigungu && p.sigungu.ko !== st.sigungu) return false;
  if (st.q) {
    const h = (p.ko + p.ja + p.en + p.kind.ja + p.kind.en + p.addr +
               p.sigungu.ja + p.sigungu.en + p.sigungu.ko).toLowerCase();
    if (!h.includes(st.q.toLowerCase())) return false;
  }
  return true;
}

function petClass(p) {
  return 'mkw pet ' + p.type + (p.h24 ? ' h24' : '') +
         (st.sel === p.id && st.selKind === 'pet' ? ' on' : '');
}

function syncPetMarkers() {
  for (const p of (PETS || [])) {
    if (!visPetIds.has(p.id)) continue;
    let m = petMarkers.get(p.id);
    if (!m) {
      m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: petClass(p),
                          html: `<span class="mk ${p.type === 'vet' ? 'vet' : 'shop'}"></span>`,
                          iconSize: [13, 13], iconAnchor: [6.5, 6.5] }),
        title: p.ja, riseOnHover: true,
      });
      m.on('click', () => select(p.id, 'pet'));
      petMarkers.set(p.id, m);
    } else if (m._icon) {
      m._icon.className = petClass(p) + ' leaflet-marker-icon leaflet-div-icon leaflet-zoom-animated leaflet-interactive';
    }
  }
}

function petCard(p) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card pet ' + p.type + (st.sel === p.id && st.selKind === 'pet' ? ' on' : '');
  b.id = 'card-' + p.id;
  b.innerHTML = `<span class="bullet ${p.type === 'vet' ? 'v' : 'p'}"></span>` +
    `<span class="nm"></span><span class="ko"></span>` +
    `<span class="meta"><span class="tag ${p.type === 'vet' ? 'v' : 'p'}"></span>` +
    `${p.h24 ? `<span class="tag h24">${t.vet_24h}</span>` : ''}` +
    `<span class="ar"></span></span>` +
    `<span class="aside">${st.here ? '<span class="dist"></span>' : ''}</span>`;
  b.querySelector('.nm').textContent = p[lang] || p.ko;
  b.querySelector('.ko').textContent = p.ko;
  b.querySelector('.tag').textContent = p.kind[lang];
  b.querySelector('.ar').textContent = p.sigungu[lang] || p.sigungu.ko;
  const d = b.querySelector('.dist');
  if (d) d.textContent = fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng));
  b.onclick = () => select(p.id, 'pet', true);
  li.appendChild(b);
  return li;
}

function petDetail(p) {
  const dist = st.here ? fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng)) : null;
  return `<div class="top">
      <div class="dbtns"><button class="iconbtn" id="closebtn">✕</button></div>
      <div class="eyebrow">${esc(p.sido[lang])} · ${esc(p.sigungu[lang])}${dist ? ' · ' + esc(t.d_dist(dist)) : ''}</div>
      <h2>${esc(p[lang] || p.ko)}</h2>
      <p class="hangul">${esc(p.ko)}</p>
      <div class="badges">
        <span class="badge ${p.type === 'vet' ? 'vet' : 'shop'}">${esc(p.kind[lang])}</span>
        ${p.h24 ? `<span class="badge h24">${t.vet_24h}</span>` : ''}
        ${p.lang ? `<span class="badge lang">${t.lang_evidence}</span>` : ''}
      </div>
    </div>
    <dl class="dl">
      <dt>${t.d_kind}</dt><dd>${esc(p.kind[lang])}（${esc(p.cate_ko)}）</dd>
      <dt>${t.d_addr}</dt><dd class="addr">${esc(p.addr)}</dd>
      ${p.tel ? `<dt>${t.d_tel}</dt><dd><a href="tel:${esc(p.tel.replace(/[^0-9+]/g, ''))}">${esc(p.tel)}</a></dd>` : ''}
    </dl>
    ${p.type === 'vet' ? `<div class="phrase vet">
      <div class="lab">${t.vet_lang_label}</div>
      <div class="kq">${t.vet_p1_ko}</div><div class="ja">${t.vet_p1_ja}</div>
      <div class="kq sep">${t.vet_p2_ko}</div><div class="ja">${t.vet_p2_ja}</div>
      <div class="kq sep">${t.vet_p3_ko}</div><div class="ja">${t.vet_p3_ja}</div>
      <p class="note">${t.vet_lang_note}</p>
    </div>` : ''}
    <div class="links">
      <a class="primary" href="${gmapUrl(p)}" target="_blank" rel="noopener">${t.link_g}<span class="arr">↗</span></a>
      <a href="${naverUrl(p)}" target="_blank" rel="noopener">${t.link_n}<span class="arr">↗</span></a>
      ${p.insta ? `<a class="ig" href="${esc(p.insta)}" target="_blank" rel="noopener">${ICON_IG}${t.link_ig}<span class="arr">↗</span></a>` : ''}
      ${p.web ? `<a href="${esc(p.web)}" target="_blank" rel="noopener">${t.link_web}<span class="arr">↗</span></a>` : ''}
      ${p.tel ? `<a href="tel:${esc(p.tel.replace(/[^0-9+]/g, ''))}">${t.link_tel}<span class="arr">↗</span></a>` : ''}
    </div>`;
}

/* ---------- 犬と泊まれる宿 ---------- */
async function ensureStays() {
  if (st.stay && !STAYS) STAYS = await fetch('data/stays.json').then(r => r.json());
  render();
}

function stayMatch(p) {
  if (!st.stay) return false;
  if (st.favonly || st.ter || st.mineonly || st.kind || st.genre) return false;
  if (st.sido && p.sido.ko !== st.sido) return false;
  if (st.sigungu && p.sigungu.ko !== st.sigungu) return false;
  if (st.q) {
    const h = (p.ko + p.ja + p.en + p.kind.ja + p.kind.en + p.addr +
               p.sigungu.ja + p.sigungu.en + p.sigungu.ko).toLowerCase();
    if (!h.includes(st.q.toLowerCase())) return false;
  }
  return true;
}

function syncStayMarkers() {
  for (const p of (STAYS || [])) {
    if (!visStayIds.has(p.id)) continue;
    let m = stayMarkers.get(p.id);
    const cls = 'mkw stay' + (st.sel === p.id && st.selKind === 'stay' ? ' on' : '');
    if (!m) {
      m = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: cls, html: '<span class="mk stay"></span>',
                          iconSize: [13, 13], iconAnchor: [6.5, 6.5] }),
        title: p.ja, riseOnHover: true,
      });
      m.on('click', () => select(p.id, 'stay'));
      stayMarkers.set(p.id, m);
    } else if (m._icon) {
      m._icon.className = cls + ' leaflet-marker-icon leaflet-div-icon leaflet-zoom-animated leaflet-interactive';
    }
  }
}

function stayCard(p) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'card stay' + (st.sel === p.id && st.selKind === 'stay' ? ' on' : '');
  b.id = 'card-' + p.id;
  b.innerHTML = `<span class="bullet h"></span><span class="nm"></span><span class="ko"></span>` +
    `<span class="meta"><span class="tag h"></span><span class="ar"></span></span>` +
    `<span class="aside">${st.here ? '<span class="dist"></span>' : ''}</span>`;
  b.querySelector('.nm').textContent = p[lang] || p.ko;
  b.querySelector('.ko').textContent = p.ko;
  b.querySelector('.tag').textContent = p.kind[lang];
  b.querySelector('.ar').textContent = p.sigungu[lang] || p.sigungu.ko;
  const d = b.querySelector('.dist');
  if (d) d.textContent = fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng));
  b.onclick = () => select(p.id, 'stay', true);
  li.appendChild(b);
  return li;
}

function stayDetail(p) {
  const dist = st.here ? fmtDist(distance(st.here[0], st.here[1], p.lat, p.lng)) : null;
  return `<div class="top">
      <div class="dbtns"><button class="iconbtn" id="closebtn">✕</button></div>
      <div class="eyebrow">${esc(p.sido[lang])} · ${esc(p.sigungu[lang])}${dist ? ' · ' + esc(t.d_dist(dist)) : ''}</div>
      <h2>${esc(p[lang] || p.ko)}</h2>
      <p class="hangul">${esc(p.ko)}</p>
      <div class="badges">
        <span class="badge stay">${esc(p.kind[lang])}</span>
        <span class="badge ${p.pet === 'flag' ? 'in' : 'no'}">${p.pet === 'flag' ? t.stay_evidence_flag : t.stay_evidence_name}</span>
      </div>
    </div>
    <dl class="dl">
      <dt>${t.d_kind}</dt><dd>${esc(p.kind[lang])}（${esc(p.cate_ko)}）</dd>
      <dt>${t.d_addr}</dt><dd class="addr">${esc(p.addr)}</dd>
      ${p.tel ? `<dt>${t.d_tel}</dt><dd><a href="tel:${esc(p.tel.replace(/[^0-9+]/g, ''))}">${esc(p.tel)}</a></dd>` : ''}
    </dl>
    <div class="phrase">
      <p class="note" style="margin:0">${t.d_stay_note}</p>
    </div>
    <div class="links">
      <a class="primary" href="${gmapUrl(p)}" target="_blank" rel="noopener">${t.link_g}<span class="arr">↗</span></a>
      <a href="${naverUrl(p)}" target="_blank" rel="noopener">${t.link_n}<span class="arr">↗</span></a>
      ${p.insta ? `<a class="ig" href="${esc(p.insta)}" target="_blank" rel="noopener">${ICON_IG}${t.link_ig}<span class="arr">↗</span></a>` : ''}
      ${p.web ? `<a href="${esc(p.web)}" target="_blank" rel="noopener">${t.link_web}<span class="arr">↗</span></a>` : ''}
      ${p.tel ? `<a href="tel:${esc(p.tel.replace(/[^0-9+]/g, ''))}">${t.link_tel}<span class="arr">↗</span></a>` : ''}
    </div>`;
}

/* ---------- 自分のピン ---------- */
function startPlacing() {
  st.placing = true;
  document.body.dataset.placing = 'on';
  $('maphint').hidden = false;
  $('maphint').textContent = t.addpin_hint;
  $('addpin').classList.add('act');
  if (window.innerWidth <= 860) setView('map');
}
function stopPlacing() {
  st.placing = false;
  delete document.body.dataset.placing;
  $('maphint').hidden = true;
  $('addpin').classList.remove('act');
  if (ghost) { map.removeLayer(ghost); ghost = null; }
}
function placeAt(latlng) {
  stopPlacing();
  openPoiEditor({ id: uuid(), name: '', note: '', lat: latlng.lat, lng: latlng.lng }, true);
}

function openPoiEditor(poi, isNew) {
  openModal(`
    <h3>${t.mine_title}</h3>
    <label class="field"><span>${t.mine_name}</span>
      <input id="pn" type="text" placeholder="${esc(t.mine_name_ph)}" value="${esc(poi.name || '')}"></label>
    <label class="field"><span>${t.mine_note}</span>
      <textarea id="pt" rows="3" placeholder="${esc(t.mine_note_ph)}">${esc(poi.note || '')}</textarea></label>
    <label class="field"><span>${t.mine_url}</span>
      <input id="pu" type="url" inputmode="url" placeholder="${esc(t.mine_url_ph)}" value="${esc(poi.url || '')}"></label>
    <p class="lead small err" id="perr" hidden></p>
    <div class="mrow">
      <button class="ghost" id="mcancel">${t.cancel}</button>
      <button class="primarybtn" id="msave">${t.save}</button>
    </div>`);
  $('pn').focus();
  $('mcancel').onclick = closeModal;
  $('msave').onclick = () => {
    const url = safeUrl($('pu').value);
    if (url === null) {                       // 空文字は許すが、壊れたURLは止める
      $('perr').textContent = t.mine_url_bad;
      $('perr').hidden = false;
      $('pu').focus();
      return;
    }
    const rec = Store.upsertPoi({ id: poi.id, name: $('pn').value.trim() || t.mine_title,
                                  note: $('pt').value.trim(), url,
                                  lat: poi.lat, lng: poi.lng });
    closeModal();
    select(rec.id, 'poi', isNew);
  };
}

/* ---------- アカウント ---------- */
function renderAccount(user) {
  $('account').innerHTML = user
    ? `<span>${esc(user.email || t.logout)}</span>`
    : `<span>${t.login}</span>`;
  $('account').classList.toggle('on', !!user);
}

function syncNote() {
  if (Store.syncState === 'pending') return `<span class="warn">${t.sync_pending}</span>`;
  if (Store.syncState === 'error') return `<span class="warn">${t.sync_error}</span>`;
  if (Store.syncState === 'ok') return `${t.synced}。${t.sync_note}`.replace('。.', '. ');
  return t.sync_note;
}

function openAccount() {
  if (Store.user) {
    openModal(`
      <h3>${t.login_title}</h3>
      <p class="lead">${esc(t.signed_as(Store.user.email || ''))}</p>
      <p class="lead small">${syncNote()}</p>
      <div class="mrow">
        <button class="ghost" id="mcancel">${t.cancel}</button>
        <button class="primarybtn" id="mout">${t.logout}</button>
      </div>`);
    $('mcancel').onclick = closeModal;
    $('mout').onclick = async () => { await Store.signOut(); closeModal(); };
    return;
  }
  if (!Store.configured()) {
    openModal(`
      <h3>${t.login_title}</h3>
      <p class="lead">${t.login_off}</p>
      <div class="mrow">
        <button class="ghost" id="mimport">${t.import}</button>
        <button class="primarybtn" id="mexport">${t.export}</button>
      </div>`);
    $('mexport').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(Store.exportBlob());
      a.download = 'pawmap-backup.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    $('mimport').onclick = () => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = 'application/json';
      i.onchange = () => {
        const f = i.files[0];
        if (!f) return;
        f.text().then(txt => { try { Store.importObject(JSON.parse(txt)); closeModal(); } catch (e) {} });
      };
      i.click();
    };
    return;
  }
  openModal(`
    <h3>${t.login_title}</h3>
    <p class="lead">${t.login_lead}</p>
    <label class="field"><span>Email</span>
      <input id="em" type="email" autocomplete="email" placeholder="${t.email_ph}"></label>
    <p class="lead small" id="msg"></p>
    <div class="mrow">
      <button class="ghost" id="mcancel">${t.cancel}</button>
      <button class="primarybtn" id="msend">${t.send_link}</button>
    </div>`);
  $('em').focus();
  $('mcancel').onclick = closeModal;
  $('msend').onclick = async () => {
    const email = $('em').value.trim();
    if (!email) return;
    $('msend').disabled = true;
    try { await Store.signIn(email); $('msg').textContent = t.sent; }
    catch (e) { $('msg').textContent = t.login_err; $('msend').disabled = false; }
  };
}

/* ---------- モーダル ---------- */
function openModal(html) {
  $('modal').innerHTML = html;
  $('modal').classList.add('open');
  $('modalScrim').classList.add('open');
}
function closeModal() {
  $('modal').classList.remove('open');
  $('modalScrim').classList.remove('open');
}

/* ---------- 画面切替 ---------- */
function setView(v) {
  document.body.dataset.view = v;
  $('tabList').setAttribute('aria-pressed', String(v === 'list'));
  $('tabMap').setAttribute('aria-pressed', String(v === 'map'));
  if (v === 'map') setTimeout(() => map.invalidateSize(), 60);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/* ---------- PWA ---------- */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e; $('install').classList.add('show');
});
$('install').onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('install').classList.remove('show');
};
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}
