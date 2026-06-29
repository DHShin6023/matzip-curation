const CACHE_NAME = 'matzip-curation-v4';
const STATIC_ASSETS = [
  '/matzip-curation/',
  '/matzip-curation/index.html',
  '/matzip-curation/style.css',
  '/matzip-curation/app.js',
  '/matzip-curation/manifest.json',
  '/matzip-curation/icons/icon-192.png',
  '/matzip-curation/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('dapi.kakao.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
