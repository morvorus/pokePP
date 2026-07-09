/* PokePP service worker — offline app shell + sprite runtime cache */
const CACHE = 'pokepp-v1';
const SPRITE_CACHE = 'pokepp-sprites';
const SHELL = [
  './', './index.html', './style.css', './game.js',
  './monsters-data.js', './manifest.json', './icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && k !== SPRITE_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;

  // สไปรต์จาก githubusercontent -> cache-first แบบ runtime (เล่นออฟไลน์ตัวที่เคยเห็น)
  if (url.includes('githubusercontent.com')) {
    e.respondWith(caches.open(SPRITE_CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try {
        const res = await fetch(e.request);
        if (res && res.status === 200) c.put(e.request, res.clone());
        return res;
      } catch (err) { return hit || Response.error(); }
    }));
    return;
  }

  // app shell -> cache-first, สำรองด้วย network
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
