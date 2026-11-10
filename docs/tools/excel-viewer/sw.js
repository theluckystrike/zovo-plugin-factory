/* Offline copy of this tool. Network first, so a new version shows at once; the cache answers when offline.
   Only this tool's own files are cached. Files the user opens are never fetched or stored. */
const CACHE = 'zovo-excel-viewer-75c190ff3af7';
const FILES = ["./", "tool.css", "app.js", "sample.js", "lib/zovo-doc-viewer.js", "lib/formats/sheet.js", "lib/formats/csv.js", "lib/formats/parquet.js", "lib/formats/chunks/chunk-F4533EDT.js", "lib/formats/chunks/chunk-ZGED6OEB.js", "lib/formats/chunks/chunk-YNDUCXLW.js", "lib/formats/chunks/chunk-ZMIVMEKO.js", "lib/formats/chunks/chunk-SEZRW5KK.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('zovo-excel-viewer-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(new URL('./', location).pathname)) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
