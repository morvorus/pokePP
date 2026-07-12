/* PokePP service worker — network-first สำหรับโค้ด (freshness), cache-first สำหรับข้อมูล/ไอคอน */
const CACHE = 'pokepp-v5';
const SHELL = [
  './', './index.html', './style.css', './game.js', './cloud.js',
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

function putCache(req, res) {
  const copy = res.clone();
  caches.open(CACHE).then(c => c.put(req, copy));
  return res;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // รูปสไปรต์ข้ามโดเมน (jsDelivr) — ปล่อยให้เบราว์เซอร์จัดการ ห้ามดัก
  if (url.origin !== self.location.origin) return;

  const isCode = url.pathname === '/' || /\.(html|js|css)$/.test(url.pathname);
  if (isCode) {
    // network-first + บังคับข้าม HTTP cache ของเบราว์เซอร์ (cache:'reload') เอาโค้ดล่าสุดเสมอเมื่อออนไลน์ สำรองด้วยแคชเมื่อออฟไลน์
    e.respondWith(
      fetch(e.request, { cache: 'reload' }).then(res => putCache(e.request, res)).catch(() => caches.match(e.request))
    );
  } else {
    // cache-first: ข้อมูล/ไอคอน (เปลี่ยนน้อย โหลดเร็ว)
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => putCache(e.request, res)))
    );
  }
});
