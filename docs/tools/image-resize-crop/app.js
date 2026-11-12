/* Zovo Image Resize and Crop Online (TOOLCHK3, wave18). The image is read in this tab with the File API and never
   sent anywhere: the page CSP sets connect-src 'none'. The type comes from the first bytes, the size in the header is
   checked before the browser decodes anything, and the browser decoder draws the pixels (EXIF orientation applied).
   Crop, rotate and flip are kept as settings over the original pixels; the saved file is drawn from the original once,
   then scaled down in halving steps for a sharp result, and encoded with canvas.toBlob. Plain JavaScript, no libraries. */
import { makeSample } from './sample.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAX_MP = 50e6, MAX_SIDE = 32767, MAX_OUT_SIDE = 16384, PREV = 1600;

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
const int = n => Number(n).toLocaleString('en-US');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- type and header size from the bytes ---------- */
const ORIENT = { 1: 'normal', 2: 'mirrored', 3: 'upside down', 4: 'mirrored upside down', 5: 'mirrored, turned 90° left', 6: 'turned 90° right', 7: 'mirrored, turned 90° right', 8: 'turned 90° left' };
function sniff(u) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), s = (a, b) => String.fromCharCode(...u.subarray(a, b));
  const r = { type: null, w: 0, h: 0 };
  if (u.length >= 24 && u[0] === 0x89 && s(1, 4) === 'PNG') { r.type = 'PNG'; r.mime = 'image/png'; r.w = dv.getUint32(16); r.h = dv.getUint32(20); }
  else if (u.length >= 10 && (s(0, 6) === 'GIF87a' || s(0, 6) === 'GIF89a')) { r.type = 'GIF'; r.mime = 'image/gif'; r.w = dv.getUint16(6, true); r.h = dv.getUint16(8, true); }
  else if (u.length >= 26 && s(0, 2) === 'BM') {
    r.type = 'BMP'; r.mime = 'image/bmp';
    const hs = dv.getUint32(14, true);
    if (hs === 12) { r.w = dv.getUint16(18, true); r.h = dv.getUint16(20, true); } else { r.w = Math.abs(dv.getInt32(18, true)); r.h = Math.abs(dv.getInt32(22, true)); }
  } else if (u.length >= 30 && s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') {
    r.type = 'WebP'; r.mime = 'image/webp';
    const c = s(12, 16);
    if (c === 'VP8 ') { r.w = dv.getUint16(26, true) & 0x3fff; r.h = dv.getUint16(28, true) & 0x3fff; }
    else if (c === 'VP8L') { const b = dv.getUint32(21, true); r.w = (b & 0x3fff) + 1; r.h = ((b >>> 14) & 0x3fff) + 1; }
    else if (c === 'VP8X') { r.w = 1 + (u[24] | u[25] << 8 | u[26] << 16); r.h = 1 + (u[27] | u[28] << 8 | u[29] << 16); r.anim = !!(u[20] & 2); }
  } else if (u.length >= 4 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) {
    r.type = 'JPEG'; r.mime = 'image/jpeg';
    let i = 2;
    while (i + 9 < u.length) {
      if (u[i] !== 0xff) { i++; continue; }
      const m = u[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = dv.getUint16(i + 2);
      if (m === 0xe1 && s(i + 4, i + 10) === 'Exif\0\0') exif(u, i + 10, Math.min(u.length, i + 2 + len), r);
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { r.h = dv.getUint16(i + 5); r.w = dv.getUint16(i + 7); break; }
      if (m === 0xda || len < 2) break;
      i += 2 + len;
    }
  }
  return r;
}
function exif(u, t0, end, r) {  // TIFF header inside APP1: orientation (0x0112) and a GPS pointer (0x8825) in IFD0
  try {
    const dv = new DataView(u.buffer, u.byteOffset, end), le = u[t0] === 0x49;
    const g16 = o => dv.getUint16(t0 + o, le), g32 = o => dv.getUint32(t0 + o, le);
    const ifd = g32(4), n = g16(ifd);
    for (let k = 0; k < n && k < 400; k++) {
      const e = ifd + 2 + k * 12, tag = g16(e);
      if (tag === 0x0112) r.orient = g16(e + 8);
      if (tag === 0x8825) r.gps = true;
      if (tag === 0x010f || tag === 0x0110) r.camera = true;
    }
  } catch (e) { /* cut short: no EXIF facts */ }
}

/* ---------- state ---------- */
let src = null, prev = null, W = 0, H = 0, info = null, fileName = 'image', fileSize = 0;
let rot = 0, fh = false, fv = false, crop = null, ratio = null;
let rs = { mode: 'px', w: 0, h: 0, pct: 50, keep: true, touched: false };
const OW = () => rot % 180 ? H : W, OH = () => rot % 180 ? W : H;

async function decode(file, mime) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {  // older browsers: an <img> from a blob URL (img-src blob: is allowed, the blob never leaves the tab)
    const url = URL.createObjectURL(file.type ? file : new Blob([file], { type: mime }));
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return c;
    } finally { URL.revokeObjectURL(url); }
  }
}

async function open(file) {
  if (!file) return;
  const t0 = performance.now();
  say('Reading ' + file.name + ' ...');
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 1 << 20)).arrayBuffer());
  const r = sniff(head);
  if (!r.type) { say('This file is not a PNG, JPEG, WebP, GIF or BMP image: its first bytes do not match any of them, whatever its name says. TIFF, HEIC, AVIF and SVG are not opened here.', true); return; }
  if (r.w && r.h && (r.w * r.h > MAX_MP || r.w > MAX_SIDE || r.h > MAX_SIDE)) { say(`This ${r.type} is ${int(r.w)} × ${int(r.h)} pixels (${(r.w * r.h / 1e6).toFixed(0)} megapixels). This page opens images up to 50 megapixels, so a browser tab does not run out of memory.`, true); return; }
  let bmp;
  try { bmp = await decode(file, r.mime); } catch (e) { say(`The ${r.type} could not be decoded. It may be cut short or damaged.`, true); return; }
  if (!bmp.width || !bmp.height) { say(`The ${r.type} could not be decoded. It may be cut short or damaged.`, true); return; }
  if (bmp.width * bmp.height > MAX_MP) { say('This image is larger than 50 megapixels, the limit of this page.', true); return; }
  if (src && src.close) src.close();
  src = bmp; W = bmp.width; H = bmp.height; info = r; fileName = file.name.replace(/\.[^.]+$/, '') || 'image'; fileSize = file.size;
  const s = Math.min(1, PREV / Math.max(W, H));
  prev = document.createElement('canvas'); prev.width = Math.max(1, Math.round(W * s)); prev.height = Math.max(1, Math.round(H * s));
  const pc = prev.getContext('2d'); pc.imageSmoothingQuality = 'high'; pc.drawImage(src, 0, 0, prev.width, prev.height);
  rot = 0; fh = fv = false; crop = { x: 0, y: 0, w: W, h: H }; ratio = null; $('ratio').value = 'free'; $('customBox').hidden = true;
  rs = { mode: 'px', w: W, h: H, pct: 50, keep: true, touched: false }; $('rmode').value = 'px'; $('keep').checked = true;
  $('fmt').value = r.type === 'JPEG' ? 'image/jpeg' : r.type === 'WebP' ? 'image/webp' : 'image/png';  // keep the format by default
  $('fname').textContent = file.name;
  $('fmeta').textContent = `${r.type}, ${int(W)} × ${int(H)} pixels, ${size(file.size)}`;
  showInfo();
  $('drop').hidden = true; $('view').hidden = false;
  update();
  say(`Opened in ${Math.round(performance.now() - t0)} ms.`);
}

function showInfo() {
  const rows = [['Type', info.type + ' (from the file bytes)'], ['Size', `${int(W)} × ${int(H)} pixels`], ['Megapixels', (W * H / 1e6).toFixed(2)], ['File size', size(fileSize)]];
  if (info.type === 'JPEG') rows.push(['EXIF orientation', info.orient ? `${info.orient}, ${ORIENT[info.orient] || 'unknown'}${info.orient > 1 ? '. Applied, so the image shows the right way up' : ''}` : 'none']);
  if (info.gps || info.camera) rows.push(['Photo data', (info.gps ? 'GPS position' : '') + (info.gps && info.camera ? ' and ' : '') + (info.camera ? 'camera model' : '') + ' in the file. A saved copy has pixels only, so this is not in it.']);
  if (info.type === 'GIF' || info.anim) rows.push(['Frames', 'The first frame is used.']);
  const t = $('iinfo'); t.replaceChildren();
  for (const [k, v] of rows) { const tr = t.insertRow(), th = document.createElement('th'); th.textContent = k; tr.append(th); tr.insertCell().textContent = v; }
}

/* ---------- preview canvas and crop box ---------- */
function drawPreview() {
  const cv = $('cv'), s = prev.width / W, pw = Math.round(OW() * s), ph = Math.round(OH() * s);
  cv.width = Math.max(1, pw); cv.height = Math.max(1, ph);
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
  c.translate(cv.width / 2, cv.height / 2); c.scale(fh ? -1 : 1, fv ? -1 : 1); c.rotate(rot * Math.PI / 180);
  c.drawImage(prev, -prev.width / 2, -prev.height / 2);
}
function geom() {
  const cv = $('cv'), st = $('stage'), a = cv.getBoundingClientRect(), b = st.getBoundingClientRect();
  return { k: a.width / OW(), ox: a.left - b.left - st.clientLeft, oy: a.top - b.top - st.clientTop, a };
}
function placeBox() {
  if (!crop) return;
  const g = geom(), box = $('box'), sh = $('shade');
  const l = g.ox + crop.x * g.k, t = g.oy + crop.y * g.k, w = crop.w * g.k, h = crop.h * g.k;
  for (const e of [box, sh]) { e.style.left = l + 'px'; e.style.top = t + 'px'; e.style.width = w + 'px'; e.style.height = h + 'px'; e.hidden = false; }
  $('boxSize').textContent = `${int(crop.w)} × ${int(crop.h)}`;
  $('boxSize').hidden = w < 70 || h < 22;
}

function fitRatio(r) {  // the biggest box of ratio r, centred
  const ow = OW(), oh = OH();
  let w = ow, h = Math.round(ow / r);
  if (h > oh) { h = oh; w = Math.round(oh * r); }
  return { x: Math.floor((ow - w) / 2), y: Math.floor((oh - h) / 2), w: Math.max(1, w), h: Math.max(1, h) };
}
function norm(c) {
  const ow = OW(), oh = OH();
  let w = clamp(Math.round(c.w), 1, ow), h = clamp(Math.round(c.h), 1, oh);
  return { x: clamp(Math.round(c.x), 0, ow - w), y: clamp(Math.round(c.y), 0, oh - h), w, h };
}

/* resize the box from a handle (n, s, e, w or a corner) to point p, keeping the ratio when one is set */
function resizeBox(c0, hd, p) {
  const ow = OW(), oh = OH();
  let l = c0.x, t = c0.y, r = c0.x + c0.w, b = c0.y + c0.h;
  const px = clamp(p.x, 0, ow), py = clamp(p.y, 0, oh);
  if (hd.includes('w')) l = Math.min(px, r - 1);
  if (hd.includes('e')) r = Math.max(px, l + 1);
  if (hd.includes('n')) t = Math.min(py, b - 1);
  if (hd.includes('s')) b = Math.max(py, t + 1);
  if (!ratio) return { x: l, y: t, w: r - l, h: b - t };
  const horiz = /[ew]/.test(hd), vert = /[ns]/.test(hd);
  let w = r - l, h = b - t;
  if (horiz && vert) {
    if (w / h > ratio) w = h * ratio; else h = w / ratio;
    const maxW = hd.includes('w') ? c0.x + c0.w : ow - c0.x, maxH = hd.includes('n') ? c0.y + c0.h : oh - c0.y;
    w = Math.min(w, maxW, maxH * ratio); h = w / ratio;
    const x = hd.includes('w') ? c0.x + c0.w - w : c0.x, y = hd.includes('n') ? c0.y + c0.h - h : c0.y;
    return { x, y, w, h };
  }
  if (horiz) {
    const cy = c0.y + c0.h / 2, maxW = hd.includes('w') ? c0.x + c0.w : ow - c0.x;
    w = Math.min(w, maxW, 2 * Math.min(cy, oh - cy) * ratio); h = w / ratio;
    return { x: hd.includes('w') ? c0.x + c0.w - w : c0.x, y: cy - h / 2, w, h };
  }
  const cx = c0.x + c0.w / 2, maxH = hd.includes('n') ? c0.y + c0.h : oh - c0.y;
  h = Math.min(h, maxH, 2 * Math.min(cx, ow - cx) / ratio); w = h * ratio;
  return { x: cx - w / 2, y: hd.includes('n') ? c0.y + c0.h - h : c0.y, w, h };
}

let drag = null;
$('stage').addEventListener('pointerdown', e => {
  if (!src || e.button > 0) return;
  const g = geom(), p = { x: (e.clientX - g.a.left) / g.k, y: (e.clientY - g.a.top) / g.k };
  const hd = e.target.dataset && e.target.dataset.h;
  if (hd) drag = { mode: 'resize', hd, c0: { ...crop }, p0: p };
  else if (e.target === $('box') || e.target === $('boxSize')) drag = { mode: 'move', c0: { ...crop }, p0: p };
  else if (p.x >= 0 && p.y >= 0 && p.x <= OW() && p.y <= OH()) drag = { mode: 'new', a: { x: clamp(p.x, 0, OW()), y: clamp(p.y, 0, OH()) }, moved: false };
  else return;
  e.preventDefault(); try { $('stage').setPointerCapture(e.pointerId); } catch (x) { /* synthetic events */ }
});
$('stage').addEventListener('pointermove', e => {
  if (!drag) return;
  const g = geom(), p = { x: (e.clientX - g.a.left) / g.k, y: (e.clientY - g.a.top) / g.k };
  if (drag.mode === 'move') {
    crop = norm({ ...drag.c0, x: drag.c0.x + p.x - drag.p0.x, y: drag.c0.y + p.y - drag.p0.y });
  } else if (drag.mode === 'resize') {
    crop = norm(resizeBox(drag.c0, drag.hd, p));
  } else {
    if (!drag.moved && Math.hypot(p.x - drag.a.x, p.y - drag.a.y) * g.k < 4) return;
    drag.moved = true;
    const hd = (p.y < drag.a.y ? 'n' : 's') + (p.x < drag.a.x ? 'w' : 'e');
    crop = norm(resizeBox({ x: drag.a.x, y: drag.a.y, w: 0, h: 0 }, hd, p));
  }
  update(true);
});
const endDrag = () => { if (drag) { drag = null; update(); } };
$('stage').addEventListener('pointerup', endDrag);
$('stage').addEventListener('pointercancel', endDrag);
$('box').addEventListener('keydown', e => {
  const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!k || !crop) return;
  e.preventDefault();
  const st = Math.max(1, Math.round(1 / geom().k)) * (e.altKey ? 10 : 1);
  if (e.shiftKey) crop = norm(resizeBox(crop, k[0] ? 'e' : 's', { x: crop.x + crop.w + k[0] * st, y: crop.y + crop.h + k[1] * st }));
  else crop = norm({ ...crop, x: crop.x + k[0] * st, y: crop.y + k[1] * st });
  update();
});

/* ---------- rotate and flip: the crop box turns with the image ---------- */
const INV = { '4:3': '3:4', '3:4': '4:3', '3:2': '2:3', '2:3': '3:2', '16:9': '9:16', '9:16': '16:9' };
function turn(deg) {
  // deg is the turn on screen. The flips are kept in screen space (preview: flip after rotate), so with exactly one
  // flip on, a turn to the right on screen is a turn to the left of the pixels.
  const ow = OW(), oh = OH(), c = crop;
  if (deg === 90) crop = { x: oh - c.y - c.h, y: c.x, w: c.h, h: c.w };
  else if (deg === 270) crop = { x: c.y, y: ow - c.x - c.w, w: c.h, h: c.w };
  else crop = { x: ow - c.x - c.w, y: oh - c.y - c.h, w: c.w, h: c.h };
  rot = (rot + (deg !== 180 && fh !== fv ? 360 - deg : deg)) % 360;
  if (deg !== 180) {
    if (ratio) ratio = 1 / ratio;
    const v = $('ratio').value;
    if (INV[v]) $('ratio').value = INV[v]; else if (v === 'custom') { const a = $('rw').value; $('rw').value = $('rh').value; $('rh').value = a; }
    if (rs.touched) { const a = rs.w; rs.w = rs.h; rs.h = a; }
  }
  crop = norm(crop); update();
}
$('rotR').addEventListener('click', () => turn(90));
$('rotL').addEventListener('click', () => turn(270));
$('rot180').addEventListener('click', () => turn(180));
$('flipH').addEventListener('click', () => { fh = !fh; crop = norm({ ...crop, x: OW() - crop.x - crop.w }); update(); });
$('flipV').addEventListener('click', () => { fv = !fv; crop = norm({ ...crop, y: OH() - crop.y - crop.h }); update(); });
$('reset').addEventListener('click', () => {
  rot = 0; fh = fv = false; ratio = null; $('ratio').value = 'free'; $('customBox').hidden = true; crop = { x: 0, y: 0, w: W, h: H };
  rs = { mode: 'px', w: W, h: H, pct: 50, keep: true, touched: false }; $('rmode').value = 'px'; $('keep').checked = true; update();
});

/* ---------- crop and resize fields ---------- */
function ratioFromSelect() {
  const v = $('ratio').value;
  $('customBox').hidden = v !== 'custom';
  if (v === 'free') return null;
  if (v === 'orig') return OW() / OH();
  if (v === 'custom') { const a = Number($('rw').value), b = Number($('rh').value); return a > 0 && b > 0 ? a / b : null; }
  const [a, b] = v.split(':').map(Number); return a / b;
}
function onRatio() { ratio = ratioFromSelect(); crop = ratio ? fitRatio(ratio) : crop; update(); }
$('ratio').addEventListener('change', onRatio);
$('rw').addEventListener('change', onRatio); $('rh').addEventListener('change', onRatio);
for (const id of ['cx', 'cy', 'cw', 'ch']) $(id).addEventListener('change', () => {
  let c = { x: Number($('cx').value) || 0, y: Number($('cy').value) || 0, w: Number($('cw').value) || 1, h: Number($('ch').value) || 1 };
  if (ratio && id === 'cw') c.h = c.w / ratio;
  if (ratio && id === 'ch') c.w = c.h * ratio;
  if (ratio && (c.w > OW() || c.h > OH())) { const f = Math.min(OW() / c.w, OH() / c.h); c.w *= f; c.h *= f; }
  crop = norm(c); update();
});
$('nocrop').addEventListener('click', () => { ratio = null; $('ratio').value = 'free'; $('customBox').hidden = true; crop = { x: 0, y: 0, w: OW(), h: OH() }; update(); });
$('rmode').addEventListener('change', () => { rs.mode = $('rmode').value; update(); });
$('pct').addEventListener('input', () => { rs.pct = clamp(Number($('pct').value) || 100, 1, 400); update(); });
$('ow').addEventListener('change', () => { rs.touched = true; rs.w = Math.max(1, Math.round(Number($('ow').value) || 1)); if (rs.keep) rs.h = Math.max(1, Math.round(rs.w * crop.h / crop.w)); else rs.h = outDims().h; update(); });
$('oh').addEventListener('change', () => { rs.touched = true; rs.h = Math.max(1, Math.round(Number($('oh').value) || 1)); if (rs.keep) rs.w = Math.max(1, Math.round(rs.h * crop.w / crop.h)); else rs.w = outDims().w; update(); });
$('keep').addEventListener('change', () => { rs.keep = $('keep').checked; if (rs.keep && rs.touched) rs.h = Math.max(1, Math.round(rs.w * crop.h / crop.w)); update(); });
for (const b of document.querySelectorAll('[data-fit]')) b.addEventListener('click', () => {
  const n = Number(b.dataset.fit);
  rs.mode = 'px'; $('rmode').value = 'px'; rs.keep = true; $('keep').checked = true;
  if (!n) { rs.touched = false; } else { const f = Math.min(1, n / Math.max(crop.w, crop.h)); rs.touched = true; rs.w = Math.max(1, Math.round(crop.w * f)); rs.h = Math.max(1, Math.round(crop.h * f)); }
  update();
});
$('fmt').addEventListener('change', () => update());
$('q').addEventListener('input', () => { $('qv').textContent = $('q').value; update(); });

let capNote = '';
function outDims() {
  let w, h;
  if (rs.mode === 'pct') { w = crop.w * rs.pct / 100; h = crop.h * rs.pct / 100; }
  else if (!rs.touched) { w = crop.w; h = crop.h; }
  else { w = rs.w; h = rs.keep ? rs.w * crop.h / crop.w : rs.h; }
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  capNote = '';
  const f = Math.min(1, MAX_OUT_SIDE / Math.max(w, h), Math.sqrt(MAX_MP / (w * h)));
  if (f < 1) { w = Math.max(1, Math.floor(w * f)); h = Math.max(1, Math.floor(h * f)); capNote = 'The size was capped at 16,384 pixels a side and 50 megapixels. '; }
  return { w, h };
}

/* ---------- update all views, then make the file after a short pause ---------- */
function update(dragging) {
  if (!src) return;
  drawPreview(); placeBox();
  $('cx').value = crop.x; $('cy').value = crop.y; $('cw').value = crop.w; $('ch').value = crop.h;
  for (const id of ['cx', 'cw']) $(id).max = OW();
  for (const id of ['cy', 'ch']) $(id).max = OH();
  $('pctBox').hidden = rs.mode !== 'pct'; $('pxBox').hidden = rs.mode !== 'px';
  const o = outDims();
  $('ow').value = o.w; $('oh').value = o.h; $('pct').value = rs.pct;
  $('qBox').hidden = $('fmt').value === 'image/png';
  self.zovoState = { type: info.type, w: W, h: H, rot, fh, fv, crop: { ...crop }, outW: o.w, outH: o.h, outBytes: null, outType: null };
  if (!dragging) schedule();
}

let timer = 0, seq = 0, lastUrl = '', cache = { key: '', canvas: null };
function schedule() {
  clearTimeout(timer);
  $('save').setAttribute('aria-disabled', 'true');
  $('out').textContent = 'Working out the file size ...';
  timer = setTimeout(makeFile, 250);
}
function halve(c) {
  const n = document.createElement('canvas'); n.width = Math.max(1, Math.round(c.width / 2)); n.height = Math.max(1, Math.round(c.height / 2));
  const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height); return n;
}
function pixels(o) {
  const key = [rot, fh, fv, crop.x, crop.y, crop.w, crop.h, o.w, o.h].join(',');
  if (cache.key === key) return cache.canvas;
  let c = document.createElement('canvas'); c.width = crop.w; c.height = crop.h;
  const x = c.getContext('2d');
  x.translate(-crop.x, -crop.y); x.translate(OW() / 2, OH() / 2); x.scale(fh ? -1 : 1, fv ? -1 : 1); x.rotate(rot * Math.PI / 180);
  x.drawImage(src, -W / 2, -H / 2);
  while (c.width / 2 >= o.w && c.height / 2 >= o.h && c.width > 1) c = halve(c);  // downscale in steps for a sharp result
  if (c.width !== o.w || c.height !== o.h) {
    const n = document.createElement('canvas'); n.width = o.w; n.height = o.h;
    const y = n.getContext('2d'); y.imageSmoothingQuality = 'high'; y.drawImage(c, 0, 0, o.w, o.h); c = n;
  }
  cache = { key, canvas: c };
  return c;
}
async function makeFile() {
  const my = ++seq, o = outDims(), type = $('fmt').value, q = Number($('q').value) / 100;
  let c;
  try { c = pixels(o); } catch (e) { $('out').textContent = 'This size is too big for the browser to draw. Pick a smaller size.'; return; }
  if (type === 'image/jpeg') {  // JPEG has no transparency: put the pixels on white
    const n = document.createElement('canvas'); n.width = c.width; n.height = c.height;
    const x = n.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, n.width, n.height); x.drawImage(c, 0, 0); c = n;
  }
  const blob = await new Promise(r => c.toBlob(r, type, q));
  if (my !== seq) return;
  if (!blob) { $('out').textContent = 'The browser could not encode this image. Try another format or a smaller size.'; return; }
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] || 'png';
  const name = `${fileName}-${o.w}x${o.h}.${ext}`;
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const a = $('save'); a.href = lastUrl; a.download = name; a.removeAttribute('aria-disabled'); const fmt = ext === 'jpg' ? 'JPEG' : ext === 'webp' ? 'WebP' : 'PNG';
  a.textContent = 'Save ' + fmt + ' (' + size(blob.size) + ')';
  $('out').replaceChildren();
  const b = document.createElement('b'); b.textContent = `${fmt}, ${int(o.w)} × ${int(o.h)} pixels, ${size(blob.size)}`;
  const pc = fileSize ? Math.round(100 * blob.size / fileSize) : 0;
  $('out').append(b, document.createTextNode(` (the file you opened is ${size(fileSize)}${pc ? ', this is ' + pc + ' % of it' : ''}).`));
  let note = capNote;
  if (blob.type !== type) note += `Your browser cannot write ${type === 'image/webp' ? 'WebP' : type}, so this is a ${fmt} file. `;
  if (type === 'image/jpeg') note += 'JPEG has no transparency: clear parts become white. ';
  note += `File name: ${name}. The copy has pixels only, no EXIF data.`;
  $('outNote').textContent = note;
  const px = (x0, y0) => {  // corner colours, for the page test (one 1-pixel canvas each, so no repeated readback)
    const t = document.createElement('canvas'); t.width = t.height = 1; const k = t.getContext('2d'); k.drawImage(c, x0, y0, 1, 1, 0, 0, 1, 1);
    return [...k.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(',');
  };
  Object.assign(self.zovoState, { outBytes: blob.size, outType: blob.type, outName: name, corners: [px(0, 0), px(c.width - 1, 0), px(0, c.height - 1), px(c.width - 1, c.height - 1)] });
}

/* ---------- wiring ---------- */
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(placeBox, 80); });
if (self.ResizeObserver) new ResizeObserver(() => placeBox()).observe($('stage'));
$('pick').addEventListener('change', e => open(e.target.files[0]));
$('pick2').addEventListener('change', e => open(e.target.files[0]));
$('sample').addEventListener('click', async () => { say('Reading the sample ...'); open(await makeSample()); });
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });
addEventListener('paste', e => {  // paste a screenshot from the clipboard
  const f = [...(e.clipboardData ? e.clipboardData.files : [])].find(x => x.type.startsWith('image/'));
  if (f) open(new File([f], f.name && f.name !== 'image.png' ? f.name : 'pasted-image.png', { type: f.type }));
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
