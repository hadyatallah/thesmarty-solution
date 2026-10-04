const CACHE_NAME = 'tss-crm-pwa-v5';
const STATIC_ASSETS = [
  '/crm/manifest.webmanifest',
  '/crm/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      // CacheStorage is shared by the origin. Only retire this app's versions.
      Promise.all(keys.filter(key => /^tss-crm-pwa-v\d+$/.test(key) && key !== CACHE_NAME)
        .map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!STATIC_ASSETS.includes(url.pathname)) return;

  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      // Do not read matching responses from another application's cache.
      const cached = await cache.match(event.request);
      if (cached) return cached;
    } catch {
      // Optional static caching must not block a working network response.
    }
    const response = await fetch(event.request);
    if (cache && response.ok && !response.redirected) {
      event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
    }
    return response;
  })());
});
