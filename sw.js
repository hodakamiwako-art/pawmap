/* ソウル犬同伴マップ — Service Worker */
const VERSION = 'pawmap-v7';
const SHELL = VERSION + '-shell';
const TILES = VERSION + '-tiles';
const TILE_LIMIT = 400;

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'config.js',
  'i18n.js',
  'store.js',
  'data/places.json',
  'data/subway.json',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
  'vendor/supabase.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'no-cache' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  if (keys.length > TILE_LIMIT) {
    await Promise.all(keys.slice(0, keys.length - TILE_LIMIT).map(k => c.delete(k)));
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // map tiles: serve from cache when possible, refill in the background
  if (url.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); trimTiles(); }
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }

  // Google Fonts: cache once, then serve locally
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  // app shell: network first so updates land, cache as the offline fallback.
  // `cache: 'no-cache'` forces a revalidation — without it the browser's own
  // HTTP cache can hand back a stale copy for minutes after a deploy.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res && res.ok) { const c = await caches.open(SHELL); c.put(req, res.clone()); }
        return res;
      } catch (err) {
        const hit = await caches.match(req);
        return hit || caches.match('index.html');
      }
    })());
  }
});
