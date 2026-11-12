/* Offline copy of this tool (WEB3, wave18: tools that load pinned libraries from cdn.jsdelivr.net).
   Own files: network first, so a new version shows at once; the cache answers when offline.
   The pinned library files never change at their versioned URL, so they come from the cache first.
   Files the user opens are never fetched or stored. */
const CACHE = 'zovo-code-screenshot-6a504ee7eb5e';
const FILES = ["./", "tool.css", "app.js", "sample.js", "page.css"];
const CDN = ["https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.12.0/es/highlight.min.js"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES).then(() => Promise.all(CDN.map(u => c.add(new Request(u, { mode: 'cors', credentials: 'omit' })).catch(() => {})))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('zovo-code-screenshot-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (CDN.includes(u.href)) {
    e.respondWith(caches.match(u.href).then(r => r || fetch(e.request).then(r2 => { if (r2.ok) { const c = r2.clone(); caches.open(CACHE).then(k => k.put(u.href, c)); } return r2; })));
    return;
  }
  if (u.origin !== location.origin || !u.pathname.startsWith(new URL('./', location).pathname)) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
