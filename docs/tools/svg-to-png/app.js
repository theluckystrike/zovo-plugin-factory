/* SVG to PNG Converter (WEB3, 10 Nov 2026). Converts SVG files to PNG inside this tab: the SVG is drawn as an
   <img> from a blob: URL (in that mode a browser never runs scripts and never loads outside files), painted on a
   canvas at the size you pick and saved as PNG. Sizes, viewBox rules and the <use> bomb check come from the SVG
   Viewer extension's own svgcore.js (window.SvgCore). Nothing is uploaded: the CSP sets connect-src 'none'. */
(function () {
  'use strict';
  const C = self.SvgCore;
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const MAX_FILE = 50 * 1024 * 1024;
  const MAX_FILES = 200;
  const items = []; // { id, name, text, info, W, H, risk, png: {blob, url, w, h, clamped} | null, error }
  let seq = 0, renderSeq = 0;

  const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  $('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  });

  const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
  const kb = n => n < 1024 * 1024 ? Math.max(0.1, n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const num = n => C.fmtNum ? C.fmtNum(n) : String(Math.round(n * 100) / 100);

  // ---------- reading ----------
  async function readText(f) {
    const buf = new Uint8Array(await f.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) { // .svgz
      if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot unpack .svgz files. Unzip it to .svg first.');
      const out = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if (out.byteLength > MAX_FILE) throw new Error('It unpacks to more than 50 MB.');
      return new TextDecoder('utf-8').decode(out);
    }
    return new TextDecoder('utf-8').decode(buf);
  }

  function makeItem(name, text) {
    const it = { id: ++seq, name: String(name || 'image.svg').slice(0, 200), text, png: null, error: '' };
    const info = C.rootInfo(text);
    if (!info) { it.error = 'This is not an SVG file (no <svg> element found).'; return it; }
    const shapes = C.useExpansion(text, 1e6);
    if (shapes > 1e6) { it.error = 'This SVG expands to more than 1,000,000 shapes through <use> (a "billion laughs" file), so it was not drawn.'; return it; }
    if (C.riskScan(text).entities) { it.error = 'This SVG declares XML entities (<!ENTITY>), which can expand without limit, so it was not drawn.'; return it; }
    const s = C.intrinsicSize(info);
    it.info = info; it.W = s.w; it.H = s.h; it.assumed = s.assumed; it.risk = C.riskScan(text);
    return it;
  }

  async function addFiles(list) {
    const files = Array.from(list || []).filter(Boolean);
    if (!files.length) return;
    if (items.length + files.length > MAX_FILES) { say(`The page converts up to ${MAX_FILES} files at a time. Clear the list first.`, true); return; }
    let skipped = 0;
    for (const f of files) {
      if (!f.size) { items.push(Object.assign(makeItem(f.name, ''), { error: 'This file is empty (0 bytes).' })); continue; }
      if (f.size > MAX_FILE) { items.push(Object.assign(makeItem(f.name, ''), { error: `This file is ${kb(f.size)}. The page converts SVG files up to 50 MB.` })); continue; }
      try { items.push(makeItem(f.name, await readText(f))); } catch (e) { skipped++; items.push(Object.assign(makeItem(f.name, ''), { error: 'Could not read this file: ' + (e.message || e) })); }
    }
    say(skipped ? `${skipped} file${skipped > 1 ? 's' : ''} could not be read.` : '');
    renderAll();
  }

  // ---------- drawing ----------
  function opts() {
    const mode = $('scale').value === 'width' ? 'width' : 'scale';
    const bg = $('bg').value === 'custom' ? $('bgc').value : $('bg').value;
    return { mode, value: mode === 'width' ? Number($('width').value) || 1024 : Number($('scale').value) || 1, bg };
  }

  function loadImage(url) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The browser could not draw this SVG. It may be broken or use features an image cannot have.')); i.src = url; });
  }

  async function toPng(it, o) {
    const size = C.pngSize(it.W, it.H, o.mode, o.value);
    const text = C.setRootAttrs(it.text, { width: size.w, height: size.h, ...(it.info.viewBox ? {} : { viewBox: `0 0 ${it.W} ${it.H}` }) });
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    try {
      const img = await loadImage(url);
      const c = document.createElement('canvas'); c.width = size.w; c.height = size.h;
      const ctx = c.getContext('2d');
      if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, size.w, size.h); }
      ctx.drawImage(img, 0, 0, size.w, size.h);
      const blob = await new Promise((res, rej) => {
        try { c.toBlob(b => (b ? res(b) : rej(new Error('The browser could not make a PNG of this size.'))), 'image/png'); } catch (e) {
          rej(e && e.name === 'SecurityError' ? new Error('The browser blocks PNG output for this SVG, because it has a <foreignObject> (HTML inside the SVG).') : e);
        }
      });
      c.width = 0; c.height = 0;
      return { blob, url: URL.createObjectURL(blob), w: size.w, h: size.h, clamped: size.clamped };
    } finally { URL.revokeObjectURL(url); }
  }

  const pngName = n => (n.replace(/\.svgz?$/i, '') || 'image') + '.png';

  async function renderAll() {
    const my = ++renderSeq, o = opts();
    $('drop').classList.toggle('compact', items.length > 0);
    $('out').hidden = !items.length;
    const t0 = performance.now();
    for (const it of items) { if (it.png) { URL.revokeObjectURL(it.png.url); it.png = null; } }
    drawList();
    let done = 0;
    for (const it of items) {
      if (my !== renderSeq) return;
      if (it.error && !it.info) continue;
      try { it.png = await toPng(it, o); it.error = ''; done++; } catch (e) { it.error = e.message || String(e); }
      drawRow(it);
    }
    if (my !== renderSeq) return;
    const ok = items.filter(i => i.png).length;
    $('count').textContent = `${ok} of ${items.length} converted in ${Math.round(performance.now() - t0)} ms. Nothing was uploaded.`;
    $('zipAll').hidden = ok < 2;
    if (done) window.zovoLastRender = { files: items.length, ok, ms: Math.round(performance.now() - t0) };
  }

  function drawList() {
    const ul = $('list');
    ul.replaceChildren();
    for (const it of items) { const li = document.createElement('li'); li.id = 'it' + it.id; ul.append(li); drawRow(it); }
  }

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function drawRow(it) {
    const li = $('it' + it.id);
    if (!li) return;
    li.replaceChildren();
    const fig = el('div', 'thumb');
    if (it.png) { const im = document.createElement('img'); im.src = it.png.url; im.alt = 'PNG of ' + it.name; fig.append(im); }
    li.append(fig);
    const box = el('div', 'meta');
    box.append(el('div', 'name', it.name));
    if (it.png) {
      const p = el('div', 'small mut', `${it.png.w} × ${it.png.h} px PNG, ${kb(it.png.blob.size)}` + (it.info ? ` · SVG ${num(it.W)} × ${num(it.H)}${it.assumed ? ' (no size in the file, 300 × 150 assumed)' : ''}${it.info.rawViewBox ? ', viewBox ' + it.info.rawViewBox : ''}` : ''));
      box.append(p);
      if (it.png.clamped) box.append(el('div', 'small warn', 'Made smaller to fit the browser canvas limit (16,384 px a side, 268 million pixels).'));
      const r = it.risk || {};
      const blocked = [];
      if (r.scripts) blocked.push(`${r.scripts} script${r.scripts > 1 ? 's' : ''}`);
      if (r.handlers) blocked.push(`${r.handlers} event handler${r.handlers > 1 ? 's' : ''}`);
      if (r.external) blocked.push(`${r.external} outside link${r.external > 1 ? 's' : ''} (pictures or fonts from the web)`);
      if (blocked.length) box.append(el('div', 'small mut', 'Not run or loaded, as in any image: ' + blocked.join(', ') + '.'));
      const a = el('a', 'btn primary', 'Download PNG'); a.href = it.png.url; a.download = pngName(it.name);
      box.append(a);
    } else if (it.error) box.append(el('div', 'small warn', it.error));
    else box.append(el('div', 'small mut', 'Converting...'));
    li.append(box);
  }

  // ---------- ZIP (store only, the PNGs are compressed already) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function zipAll() {
    const parts = [], central = [], used = new Set();
    let off = 0;
    const enc = new TextEncoder();
    for (const it of items) {
      if (!it.png) continue;
      let n = pngName(it.name), k = 2;
      while (used.has(n.toLowerCase())) n = pngName(it.name).replace(/\.png$/, `-${k++}.png`);
      used.add(n.toLowerCase());
      const data = new Uint8Array(await it.png.blob.arrayBuffer()), name = enc.encode(n), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(ch.buffer, name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, b) => s + (b.byteLength || b.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, used.size, true); end.setUint16(10, used.size, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    const url = URL.createObjectURL(new Blob([...parts, ...central, end.buffer], { type: 'application/zip' }));
    const a = document.createElement('a'); a.href = url; a.download = 'svg-to-png.zip'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // ---------- events ----------
  $('pick').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  $('pick2').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  $('pasteGo').addEventListener('click', () => {
    const t = $('paste').value.trim();
    if (!t) { say('Paste SVG code first.', true); return; }
    if (t.length > MAX_FILE) { say('The pasted code is longer than 50 MB.', true); return; }
    items.push(makeItem('pasted.svg', t)); renderAll();
  });
  $('sample').addEventListener('click', () => {
    const go = () => { items.push(makeItem(self.ZOVO_SAMPLE.name, self.ZOVO_SAMPLE.svg)); renderAll(); };
    if (self.ZOVO_SAMPLE) return go();
    const sc = document.createElement('script'); sc.src = 'sample.js'; sc.onload = go; document.head.append(sc);
  });
  $('scale').addEventListener('change', () => { $('width').hidden = $('scale').value !== 'width'; renderAll(); });
  $('width').addEventListener('change', renderAll);
  $('bg').addEventListener('change', () => { $('bgc').hidden = $('bg').value !== 'custom'; renderAll(); });
  $('bgc').addEventListener('change', renderAll);
  $('zipAll').addEventListener('click', () => zipAll().catch(e => say('The ZIP could not be made: ' + (e.message || e), true)));
  $('clear').addEventListener('click', () => { ++renderSeq; for (const it of items) if (it.png) URL.revokeObjectURL(it.png.url); items.length = 0; $('list').replaceChildren(); $('out').hidden = true; $('drop').classList.remove('compact'); say(''); });
  const dz = $('drop');
  dz.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === dz) { e.preventDefault(); $('pick').click(); } });
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) addFiles(f); });
  addEventListener('paste', e => {
    if (e.target && (e.target.id === 'paste' || e.target.tagName === 'INPUT')) return;
    const f = e.clipboardData && e.clipboardData.files;
    if (f && f.length) { addFiles(Array.from(f).filter(x => /svg/i.test(x.type) || /\.svgz?$/i.test(x.name))); return; }
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t && /<svg[\s>]/i.test(t)) { items.push(makeItem('pasted.svg', t)); renderAll(); }
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
