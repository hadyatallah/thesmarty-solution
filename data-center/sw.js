/* Only the public application shell may be cached. Absolutely no Google
 * API responses, Company records, OAuth responses, or token-bearing requests. */
const CACHE_NAME = 'tss-idc-public-shell-v2';
const SHELL_PATHS = [
 '/data-center/','/data-center/index.html','/data-center/app.css',
 '/data-center/app.js','/data-center/model.mjs','/data-center/research-request.mjs','/data-center/config.js',
 '/data-center/manifest.webmanifest','/data-center/icon-192.png',
 '/data-center/icon-512.png'
];
const ALLOWED = new Set(SHELL_PATHS);
self.addEventListener('install', event => {
 event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_PATHS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tss-idc-public-shell-') && k!==CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
 const req=event.request;
 if(req.method!=='GET')return;
 const u=new URL(req.url);
 // Never intercept/cache Google token, Sheets, or other cross-origin responses.
 if(u.origin!==self.location.origin || !ALLOWED.has(u.pathname) || u.search)return;
 event.respondWith(fetch(req,{cache:'no-store'}).then(response => {
  if(response.ok && response.type==='basic'){
   const copy=response.clone();
   event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)));
  }
  return response;
 }).catch(()=>caches.match(req)));
});
