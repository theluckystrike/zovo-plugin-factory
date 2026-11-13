/* Offline copy of this tool. Network first, so a new version shows at once; the cache answers when offline.
   Only this tool's own files are cached. Files the user opens are never fetched or stored. */
const CACHE = 'zovo-pdf-to-markdown-4162eaedd137';
const FILES = ["./", "tool.css", "app.js", "engine.js", "page.css", "htool.js", "pdfjs/pdf.min.mjs", "pdfjs/pdf.worker.min.mjs", "sample.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('zovo-pdf-to-markdown-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(new URL('./', location).pathname)) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
