/* Zovo TIFF Viewer Online (WEB4, wave18). The file is read in this tab with the File API, only the parts a page
   needs, and never sent anywhere: the page CSP sets connect-src 'none'. Decoding runs in a background worker
   (worker.js) with geotiff.js 3.0.5 from cdn.jsdelivr.net (pinned, its sha384 from the import map below is checked
   before it runs); a decode that runs too long is stopped. 16-bit, 32-bit and float pages get a percentile
   stretch, and the value under the pointer is the stored value. Tag text is written as text, never as HTML. */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAXPX = 16777216;          // pixels decoded per page (bigger pages are read at a lower resolution)
const MAXCLAIM = 2 ** 31;        // a page that claims more pixels than this is refused
const PAGEROWS = 1000;           // rows in the pages table
const LIMIT = 30000;             // ms a page may take to decode before the worker is stopped

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  hist();
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const fnum = v => !Number.isFinite(v) ? (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf') : Number.isInteger(v) ? String(v) : Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3 ? v.toExponential(4) : String(Number(v.toPrecision(6)));
const COMP = { 1: 'None', 2: 'CCITT RLE', 3: 'CCITT Group 3', 4: 'CCITT Group 4', 5: 'LZW', 6: 'old-style JPEG', 7: 'JPEG', 8: 'Deflate', 32946: 'Deflate', 32773: 'PackBits',
  34887: 'LERC', 34925: 'LZMA', 50000: 'Zstd', 50001: 'WebP', 34712: 'JPEG 2000', 33003: 'JPEG 2000', 33005: 'JPEG 2000', 34676: 'SGILog', 34677: 'SGILog24' };
const PHOTO = { 0: 'WhiteIsZero (gray)', 1: 'BlackIsZero (gray)', 2: 'RGB', 3: 'Palette', 4: 'Transparency mask', 5: 'CMYK', 6: 'YCbCr', 8: 'CIELab', 9: 'ICCLab', 10: 'ITULab', 32844: 'LogL', 32845: 'LogLuv', 34892: 'LinearRaw' };
const SFMT = { 1: 'unsigned integer', 2: 'signed integer', 3: 'floating point', 4: 'undefined', 5: 'complex integer', 6: 'complex float' };

/* ---------- the worker ---------- */
const lock = JSON.parse(document.querySelector('script[type="importmap"]').textContent);
const LIB = lock.imports.geotiff, SRI = lock.integrity[LIB];
let worker = null, ready = null, seq = 0;
const pending = new Map();
function start() {
  if (ready) return ready;
  worker = new Worker('worker.js');
  worker.onmessage = e => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); clearTimeout(p.t); e.data.ok ? p.ok(e.data.res) : p.no(new Error(e.data.err)); };
  worker.onerror = e => { e.preventDefault(); fail('The decoder stopped: ' + (e.message || 'out of memory or an internal error') + '.'); };
  ready = call('load', { url: LIB, integrity: SRI }).catch(err => { ready = null; throw new Error(/integrity|digest/i.test(err.message) ? 'The TIFF reader file did not match its pinned hash, so it was not run.' : err.message.startsWith('The TIFF') ? err.message : 'The TIFF reader could not be loaded, or it did not match its pinned hash and was not run. Check your connection and try again; after one visit it works offline.'); });
  return ready;
}
function fail(text) { for (const p of pending.values()) { clearTimeout(p.t); p.no(new Error(text)); } pending.clear(); }
function call(op, data = {}, ms = 0) {
  return new Promise((ok, no) => {
    const id = ++seq, p = { ok, no };
    if (ms) p.t = setTimeout(() => {  // a runaway decode: stop the worker; the next call starts a fresh one and opens the file again
      worker.terminate(); worker = null; ready = null; opened = null;
      fail(`Decoding this page took more than ${ms / 1000} seconds, so it was stopped. The file may be damaged or very large.`);
    }, ms);
    pending.set(id, p); worker.postMessage({ id, op, ...data });
  });
}
let opened = null;  // the file the current worker has open
async function ensure(f) { await start(); if (opened !== f) { const r = await call('open', { file: f }, LIMIT); opened = f; return r; } return null; }

/* ---------- state ---------- */
let file = null, count = 0, page = 0, P = null, ticket = 0;
let view = { s: 1, tx: 0, ty: 0 }, src = null;

async function open(f) {
  if (!f) return;
  if (!f.size) { say('This file is empty (0 bytes).', true); return; }
  const h = new Uint8Array(await f.slice(0, 4).arrayBuffer());
  const le = h[0] === 0x49 && h[1] === 0x49, be = h[0] === 0x4d && h[1] === 0x4d, ver = le ? h[2] | h[3] << 8 : h[2] << 8 | h[3];
  if (!(le || be) || (ver !== 42 && ver !== 43)) { say('This is not a TIFF file: it does not start with II*, MM* or a BigTIFF header. The format is found from the first bytes, not the file name.', true); return; }
  say(ready ? 'Opening ' + f.name + '...' : 'Loading the TIFF reader, then opening ' + f.name + '...');
  const t0 = performance.now(), my = ++ticket;
  try {
    opened = null;
    const r = await ensure(f);
    if (my !== ticket) return;
    file = f; count = r.n;
    $('fname').textContent = f.name;
    $('fmeta').textContent = `${size(f.size)} · ${r.big ? 'BigTIFF' : 'TIFF'}, ${r.le ? 'little' : 'big'}-endian · ${int(count)} page${count === 1 ? '' : 's'}` + (r.loop ? ' (the page list loops back; the rest is ignored)' : r.past ? ' (the page list points past the end of the file)' : '');
    $('view').hidden = false;
    await pages();
    await show(0, t0);
  } catch (err) {
    if (my !== ticket) return;
    say(err.message, true);
  }
}
function friendly(m) {
  if (/Unknown compression|unsupported compression/i.test(m)) { const c = /(\d+)/.exec(m); return `This page uses ${c ? (COMP[c[1]] || 'compression ' + c[1]) : 'a'} compression, which this page cannot decode. Its tags are listed below.`; }
  if (/took more than|stopped/.test(m)) return m;
  return 'This page could not be decoded (' + m.slice(0, 140) + '). The file may be damaged or cut short, or use a TIFF variant this page does not read. Its tags are listed below.';
}

/* ---------- pages table ---------- */
async function pages() {
  const tb = $('pages').tBodies[0]; tb.replaceChildren();
  $('pagesBox').hidden = count < 2; $('pageBox').hidden = count < 2;
  if (count < 2) return;
  const rows = await call('list', { max: PAGEROWS }, LIMIT);
  tb.replaceChildren(...rows.map(([i, w, h, type, comp, name]) => {
    const tr = el('tr'); tr.tabIndex = 0; tr.dataset.i = i;
    tr.append(el('td', String(i + 1), 'mono'), el('td', w ? `${int(w)} x ${int(h)}` : '', 'mono'), el('td', type, 'mut'), el('td', comp, 'mut'), el('td', name, 'mono'));
    return tr;
  }));
  $('pagesNote').textContent = count > PAGEROWS ? `The first ${int(PAGEROWS)} of ${int(count)} pages are listed. Use the page buttons for the others.` : '';
}
$('pages').addEventListener('click', e => { const tr = e.target.closest('tr'); if (tr && tr.dataset.i) show(+tr.dataset.i); });
$('pages').addEventListener('keydown', e => { const tr = e.target.closest('tr'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); show(+tr.dataset.i); } });
$('prev').addEventListener('click', () => page > 0 && show(page - 1));
$('next').addEventListener('click', () => page < count - 1 && show(page + 1));

/* ---------- one page ---------- */
async function show(i, t0 = performance.now()) {
  const my = ++ticket;
  page = i; $('pageOf').textContent = `Page ${int(i + 1)} of ${int(count)}`;
  $('prev').disabled = i === 0; $('next').disabled = i >= count - 1;
  for (const tr of $('pages').tBodies[0].rows) tr.classList.toggle('on', +tr.dataset.i === i);
  say(`Reading page ${i + 1}...`);
  let r;
  try { await ensure(file); r = await call('page', { i, maxpx: MAXPX, maxclaim: MAXCLAIM }, LIMIT); }
  catch (err) { if (my === ticket) { P = null; src = null; stage(); $('stats').replaceChildren(); hist(); $('chan').replaceChildren(); say(friendly(err.message), true); } return; }
  if (my !== ticket) return;
  P = { ...r, geo: r.geo, ok: !!r.ch };
  tags(r); geo(r); facts();
  if (r.refuse || r.err) { blank(r.refuse || friendly(r.err)); return; }
  P.stats = P.ch.map(a => chStats(a, P.nodata));
  const sel = $('chan'), opts = [];
  if (P.ch.length >= 3) opts.push(['rgb', P.rgb ? (P.pi === 2 ? 'RGB' : PHOTO[P.pi] + ' as RGB') : 'RGB composite (channels 1, 2, 3)']);
  if (P.ch.length === 1) opts.push(['0', 'Gray']);
  else for (let k = 0; k < P.ch.length; k++) opts.push([String(k), P.rgb ? ['Red', 'Green', 'Blue', 'Alpha'][k] || 'Channel ' + (k + 1) : 'Channel ' + (k + 1)]);
  const keep = sel.value;
  sel.replaceChildren(...opts.map(([v, t]) => { const o = el('option', t); o.value = v; return o; }));
  sel.value = opts.some(o => o[0] === keep) ? keep : opts[0][0];
  $('stretch').value = P.rgb || (P.bps <= 8 && P.sf !== 3) ? 'full' : 'auto';
  render(); fit();
  $('viewNote').textContent = P.dw < P.w ? `This page is shown at ${int(P.dw)} x ${int(P.dh)}, about 1 in ${fnum(Math.round(P.w / P.dw * 10) / 10)} pixels each way, so a browser tab can hold it. The stats and the values under the pointer come from the shown pixels.` : '';
  say(`Page ${i + 1} opened in ${int(Math.round(performance.now() - t0))} ms.`);
}
function blank(text) {
  P.ok = false; src = null; $('chan').replaceChildren(); stage(); $('stats').replaceChildren(); $('statsCap').textContent = ''; hist(); $('viewNote').textContent = ''; say(text, true);
}

/* ---------- stats and stretch ---------- */
function chStats(a, nodata) {
  let mn = Infinity, mx = -Infinity, s = 0, k = 0, nan = 0, nd = 0;
  const n = a.length, useNd = nodata !== null && nodata !== undefined && !Number.isNaN(nodata);
  for (let i = 0; i < n; i++) {
    const v = a[i];
    if (v !== v) { nan++; continue; }
    if (useNd && v === nodata) { nd++; continue; }
    if (v === Infinity || v === -Infinity) continue;
    if (v < mn) mn = v; if (v > mx) mx = v; s += v; k++;
  }
  // percentiles from a sorted sample of up to 1,000,000 values
  const step = Math.max(1, Math.floor(n / 1000000)), smp = new Float64Array(Math.ceil(n / step)); let m = 0;
  for (let i = 0; i < n; i += step) { const v = a[i]; if (v === v && Number.isFinite(v) && !(useNd && v === nodata)) smp[m++] = v; }
  const sorted = smp.subarray(0, m).sort(), q = p => m ? sorted[Math.min(m - 1, Math.max(0, Math.round(p * (m - 1))))] : NaN;
  return { min: k ? mn : NaN, max: k ? mx : NaN, mean: k ? s / k : NaN, n: k, nan, nd, p005: q(0.005), p995: q(0.995), p02: q(0.02), p98: q(0.98) };
}
function range(c) {
  const st = P.stats[c], mode = $('stretch').value;
  let lo, hi;
  if (mode === 'auto') { lo = st.p005; hi = st.p995; }
  else if (mode === 'p2') { lo = st.p02; hi = st.p98; }
  else if (mode === 'minmax' || P.sf === 3 || P.rgb && mode !== 'full') { lo = st.min; hi = st.max; }
  else if (P.rgb) { lo = 0; hi = 255; }
  else if (P.sf === 2) { lo = -(2 ** (P.bps - 1)); hi = 2 ** (P.bps - 1) - 1; }
  else { lo = 0; hi = 2 ** Math.min(P.bps, 52) - 1; }
  if (!(hi > lo)) { hi = lo + 1; }
  return [lo, hi];
}
function render() {
  if (!P || !P.ok) return;
  const { dw, dh, ch } = P, v = $('chan').value, out = new ImageData(dw, dh), d = out.data, n = dw * dh;
  const nd = P.nodata, useNd = nd !== null && nd !== undefined && !Number.isNaN(nd), inv = P.pi === 0 && !P.rgb;
  const idx = v === 'rgb' ? [0, 1, 2] : [+v, +v, +v], rg = idx.map(range), alpha = P.rgb && ch.length >= 4 && v === 'rgb' ? ch[3] : null;
  for (let k = 0; k < 3; k++) {
    const a = ch[idx[k]], [lo, hi] = rg[k], sc = 255 / (hi - lo);
    for (let i = 0; i < n; i++) { let t = (a[i] - lo) * sc; t = t < 0 ? 0 : t > 255 ? 255 : t; d[i * 4 + k] = inv ? 255 - t : t; }
  }
  const used = [...new Set(idx)].map(c => ch[c]);
  for (let i = 0; i < n; i++) {
    let A = alpha ? alpha[i] : 255;
    for (const a of used) { const x = a[i]; if (x !== x || (useNd && x === nd)) { A = 0; break; } }
    d[i * 4 + 3] = A;
  }
  src = document.createElement('canvas'); src.width = dw; src.height = dh; src.getContext('2d').putImageData(out, 0, 0);
  stage(); statsTiles(); hist();
}
$('chan').addEventListener('change', render);
$('stretch').addEventListener('change', render);
function statsTiles() {
  const box = $('stats'); box.replaceChildren();
  const v = $('chan').value, c = v === 'rgb' ? 0 : +v, st = P.stats[c], [lo, hi] = range(c);
  const tile = (k, x) => { const d = el('div', null, 'stat'); d.append(el('span', k, 'k'), el('span', x, 'v mono')); d.title = k + ': ' + x; box.append(d); };
  tile('min', fnum(st.min)); tile('max', fnum(st.max)); tile('mean', fnum(st.mean)); tile('shown range', `${fnum(lo)} to ${fnum(hi)}`);
  if (st.nd) tile('nodata', int(st.nd)); if (st.nan) tile('NaN', int(st.nan));
  $('statsCap').textContent = (v === 'rgb' && P.ch.length > 1 ? 'Channel 1. ' : '') + (P.nodata !== null && P.nodata !== undefined ? `Nodata value ${fnum(P.nodata)} is left out and shown transparent.` : '');
}
function hist() {
  const cv = $('hist'), box = cv.parentElement, cs = getComputedStyle(box), w = Math.max(120, Math.min((box.clientWidth || 300) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), 360)), h = 70, dpr = devicePixelRatio || 1;
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  if (!P || !P.ok) return;
  const v = $('chan').value, c = v === 'rgb' ? 0 : +v, st = P.stats[c], a = P.ch[c], B = 64;
  if (!(st.max > st.min)) return;
  const bins = new Float64Array(B), sc = B / (st.max - st.min), step = Math.max(1, Math.floor(a.length / 2000000));
  for (let i = 0; i < a.length; i += step) { const x = a[i]; if (x === x && Number.isFinite(x) && x !== P.nodata) bins[Math.min(B - 1, Math.floor((x - st.min) * sc))]++; }
  const top = Math.max(...bins) || 1, dark = isDark(), bw = w / B;
  g.fillStyle = dark ? '#3987e5' : '#2a78d6';
  for (let b = 0; b < B; b++) { const bh = Math.sqrt(bins[b] / top) * (h - 6); g.fillRect(b * bw + 0.5, h - bh, Math.max(1, bw - 1), bh); }
  const [lo, hi] = range(c), X = x => (x - st.min) / (st.max - st.min) * w;
  g.strokeStyle = dark ? '#f0efec' : '#0b0b0b'; g.lineWidth = 1; g.setLineDash([3, 3]);
  for (const x of [lo, hi]) { const px = Math.round(Math.max(0, Math.min(w - 1, X(x)))) + .5; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h); g.stroke(); }
  g.setLineDash([]);
}

/* ---------- facts, GeoTIFF and tags (read by the worker) ---------- */
function kv(t, rows) { $(t).replaceChildren(...rows.filter(r => r[1] !== null && r[1] !== undefined && r[1] !== '').map(([k, v]) => { const tr = el('tr'); tr.append(el('th', k), el('td', String(v), 'mono')); return tr; })); }
function facts() {
  const p = P;
  kv('iinfo', [['Size', `${int(p.w)} x ${int(p.h)} pixels`], ['Samples', `${p.spp} per pixel, ${p.bps}-bit ${SFMT[p.sf] || ''}`], ['Color', PHOTO[p.pi] || (p.pi === undefined ? 'not set' : String(p.pi))],
    ['Compression', COMP[p.comp] || String(p.comp)], ['Layout', (p.tiled ? `tiles of ${p.tw} x ${p.th}` : 'strips') + (p.spp > 1 ? (p.planar === 2 ? ', planar' : ', interleaved') : '')],
    ['Predictor', p.pred ? ({ 1: 'none', 2: 'horizontal', 3: 'floating point' }[p.pred] || p.pred) : null]]);
}
function geo(r) { $('geoBox').hidden = !r.geo; if (r.geo) kv('ginfo', r.geo.rows); }
function tags(r) {
  $('tags').tBodies[0].replaceChildren(...r.tags.map(([id, n, v]) => { const tr = el('tr'); tr.append(el('td', String(id), 'mono mut'), el('td', n), el('td', v, 'mono wrap')); return tr; }));
  $('tagHead').textContent = `Tags of page ${r.i + 1} (${r.tags.length})`;
}

/* ---------- the stage: zoom, pan, pointer values ---------- */
const cv = $('cv'), st = $('stage');
function stage() {
  const W = st.clientWidth, H = st.clientHeight, dpr = devicePixelRatio || 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!src) return;
  g.imageSmoothingEnabled = view.s < 1; g.imageSmoothingQuality = 'high';
  g.drawImage(src, view.tx, view.ty, P.dw * view.s, P.dh * view.s);
  $('zoomTxt').textContent = Math.round(view.s * P.dw / P.w * 100) + ' %';
}
function fit() {
  if (!P || !P.ok) return;
  const W = st.clientWidth, H = st.clientHeight, s = Math.min(W / P.dw, H / P.dh);
  view = { s, tx: (W - P.dw * s) / 2, ty: (H - P.dh * s) / 2 }; stage();
}
function zoomAt(f, mx, my) {
  if (!P || !P.ok) return;
  const s = Math.max(0.01, Math.min(64 * P.dw / P.w * 8, view.s * f));
  view.tx = mx - (mx - view.tx) * s / view.s; view.ty = my - (my - view.ty) * s / view.s; view.s = s; stage();
}
$('fit').addEventListener('click', fit);
$('one').addEventListener('click', () => { if (!P || !P.ok) return; const W = st.clientWidth, H = st.clientHeight; zoomAt(P.dw / P.w / view.s, W / 2, H / 2); });
$('zin').addEventListener('click', () => zoomAt(1.25, st.clientWidth / 2, st.clientHeight / 2));
$('zout').addEventListener('click', () => zoomAt(0.8, st.clientWidth / 2, st.clientHeight / 2));
st.addEventListener('wheel', e => { if (!src) return; e.preventDefault(); const r = st.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
let drag = null;
st.addEventListener('pointerdown', e => { if (!src) return; drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }; st.setPointerCapture(e.pointerId); st.classList.add('grab'); });
st.addEventListener('pointerup', () => { drag = null; st.classList.remove('grab'); });
st.addEventListener('dblclick', fit);
st.addEventListener('pointermove', e => {
  if (drag) { view.tx = drag.tx + e.clientX - drag.x; view.ty = drag.ty + e.clientY - drag.y; stage(); return; }
  if (!P || !P.ok) return;
  const r = st.getBoundingClientRect(), x = (e.clientX - r.left - view.tx) / view.s, y = (e.clientY - r.top - view.ty) / view.s;
  if (x < 0 || y < 0 || x >= P.dw || y >= P.dh) { $('readout').textContent = ''; return; }
  const dx = Math.floor(x), dy = Math.floor(y), i = dy * P.dw + dx, fx = Math.floor(dx * P.w / P.dw), fy = Math.floor(dy * P.h / P.dh);
  const vals = P.ch.map(a => a[i]);
  let t = `x ${int(fx)}, y ${int(fy)} · ` + (vals.length === 1 ? 'value ' + fnum(vals[0]) : P.rgb ? vals.map((v, k) => 'RGBA'[k] + ' ' + fnum(v)).join(', ') : vals.map((v, k) => `C${k + 1} ${fnum(v)}`).join(', '));
  if (vals.length === 1 && P.nodata !== null && vals[0] === P.nodata) t += ' (nodata)';
  if (P.geo && P.geo.o && P.geo.r) {
    const X = P.geo.o[0] + (fx + 0.5) * P.geo.r[0], Y = P.geo.o[1] + (fy + 0.5) * P.geo.r[1];
    const m = v => String(Math.round(v * 100) / 100);
    t += P.geo.model === 2 ? ` · lon ${X.toFixed(5)}, lat ${Y.toFixed(5)}` : ` · E ${m(X)}, N ${m(Y)}`;
  }
  $('readout').textContent = t;
});
st.addEventListener('pointerleave', () => { $('readout').textContent = ''; });
st.addEventListener('keydown', e => {
  if (!src) return;
  const k = e.key, W = st.clientWidth / 2, H = st.clientHeight / 2;
  if (k === '+' || k === '=') zoomAt(1.25, W, H); else if (k === '-') zoomAt(0.8, W, H); else if (k === '0') fit(); else if (k === '1') $('one').click();
  else if (k === 'PageDown' || k === 'j') { if (page < count - 1) show(page + 1); } else if (k === 'PageUp' || k === 'k') { if (page > 0) show(page - 1); }
  else if (k.startsWith('Arrow')) { const d = 40; view.tx += k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0; view.ty += k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0; stage(); }
  else return;
  e.preventDefault();
});
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (src) fit(); hist(); }, 120); });

/* ---------- Save PNG of the page as shown ---------- */
$('png').addEventListener('click', () => {
  if (!src) return;
  src.toBlob(b => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b);
    a.download = file.name.replace(/\.(tiff?|gtiff?)$/i, '') + (count > 1 ? `-page${page + 1}` : '') + '.png';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
});

/* ---------- wiring ---------- */
$('pick').addEventListener('change', e => open(e.target.files[0]));
$('pick2').addEventListener('change', e => open(e.target.files[0]));
$('sample').addEventListener('click', () => {
  const go = () => {
    const s = self.ZOVO_SAMPLE, bin = atob(s.b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    open(new File([u], s.name, { type: 'image/tiff' }));
  };
  if (self.ZOVO_SAMPLE) return go();
  const sc = document.createElement('script'); sc.src = 'sample.js'; sc.onload = go; document.head.append(sc);
});
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
