/* Offline copy of this tool (WEB3, wave18: tools that load pinned libraries from cdn.jsdelivr.net).
   Own files: network first, so a new version shows at once; the cache answers when offline.
   The pinned library files never change at their versioned URL, so they come from the cache first.
   Files the user opens are never fetched or stored. */
const CACHE = 'zovo-parquet-viewer-d4aa72c118e8';
const FILES = ["./", "tool.css", "app.js", "sample.js"];
const CDN = ["https://cdn.jsdelivr.net/npm/fzstd@0.1.1/esm/index.mjs", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.bitreader.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.blocks.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.context.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.contextmap.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.dictionary.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.huffman.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.prefix.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.streams.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/brotli.transform.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/gzip.huffman.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/gzip.js", "https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.3/src/lz4.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/alp.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/assemble.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/bloom.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/column.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/constants.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/convert.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/datapage.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/delta.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/encoding.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/filter.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/geoparquet.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/index.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/indexes.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/metadata.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/plain.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/plan.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/query.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/read.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/rowgroup.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/scan.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/schema.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/snappy.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/thrift.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/utils.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/variant.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/wkb.js", "https://cdn.jsdelivr.net/npm/hyparquet@1.32.0/src/xxhash.js"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES).then(() => Promise.all(CDN.map(u => c.add(new Request(u, { mode: 'cors', credentials: 'omit' })).catch(() => {})))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('zovo-parquet-viewer-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
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
