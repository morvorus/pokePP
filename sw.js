/* PokePP service worker — offline app shell (same-origin only) */
const CACHE = 'pokepp-v2';
const SHELL = [
  './', './index.html', './style.css', './game.js',
  './monsters-data.js', './manifest.json', './icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // ปล่อยรูปสไปรต์ข้ามโดเมน (jsDelivr) ให้เบราว์เซอร์จัดการเอง — ห้ามดัก
  if (url.origin !== self.location.origin) return;
  // app shell เดียวกัน: cache-first สำรองด้วย network
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
