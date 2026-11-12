/* Zovo TIFF Viewer Online, decoder worker (WEB4, wave18). Runs in a background worker of the page, so a slow or
   runaway decode never freezes the tab: the page stops the worker after a time limit. geotiff.js 3.0.5 (MIT) is
   fetched once from cdn.jsdelivr.net at a pinned URL, its sha384 checked by fetch(integrity) before it runs. The
   file is read with File.slice, only the parts a page needs, and nothing is sent anywhere. The page list is walked
   here first with loop detection, because a TIFF whose next-page offset points back would make a reader go round
   for ever. */
'use strict';
let G = null, file = null, tiff = null, n = 0;
const rd = (a, b) => new Uint8Array(new FileReaderSync().readAsArrayBuffer(file.slice(a, b)));

async function load(url, integrity) {
  if (G) return;
  const r = await fetch(url, { integrity, mode: 'cors', credentials: 'omit' });
  if (!r.ok) throw new Error('The TIFF reader could not be loaded (HTTP ' + r.status + ').');
  const u = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: 'text/javascript' }));
  try { importScripts(u); } finally { URL.revokeObjectURL(u); }
  G = self.GeoTIFF;
}

/* ---------- page list, with loop and bounds checks ---------- */
function walk() {
  const h = rd(0, 16), le = h[0] === 0x49, dv = new DataView(h.buffer), ver = dv.getUint16(2, le), big = ver === 43;
  const u64 = (d, o) => { const v = d.getBigUint64(o, le); return v > BigInt(Number.MAX_SAFE_INTEGER) ? Infinity : Number(v); };
  let off = big ? u64(dv, 8) : dv.getUint32(4, le), count = 0, loop = false, past = false;
  const seen = new Set();
  while (off) {
    if (off >= file.size || off < 8) { past = true; break; }
    if (seen.has(off)) { loop = true; break; }
    seen.add(off);
    const head = rd(off, Math.min(file.size, off + 8)), hv = new DataView(head.buffer);
    if (head.length < (big ? 8 : 2)) { past = true; break; }
    const k = big ? u64(hv, 0) : hv.getUint16(0, le), end = off + (big ? 8 + k * 20 : 2 + k * 12);
    if (!k || end + (big ? 8 : 4) > file.size) { past = true; break; }
    count++;
    if (count >= 100000) break;
    const nx = rd(end, end + (big ? 8 : 4)), nv = new DataView(nx.buffer);
    off = big ? u64(nv, 0) : nv.getUint32(0, le);
  }
  return { count, loop, past, big, le };
}

/* ---------- names ---------- */
const COMP = { 1: 'None', 2: 'CCITT RLE', 3: 'CCITT Group 3', 4: 'CCITT Group 4', 5: 'LZW', 6: 'old-style JPEG', 7: 'JPEG', 8: 'Deflate', 32946: 'Deflate', 32773: 'PackBits',
  34887: 'LERC', 34925: 'LZMA', 50000: 'Zstd', 50001: 'WebP', 34712: 'JPEG 2000', 33003: 'JPEG 2000', 33005: 'JPEG 2000', 34676: 'SGILog', 34677: 'SGILog24', 32809: 'ThunderScan', 34892: 'JPEG (DNG lossy)', 52546: 'JPEG XL' };
const DECODES = new Set([1, 5, 6, 7, 8, 32946, 32773, 34887, 50000, 50001]);
const EXTRA = { 33550: 'ModelPixelScale', 33922: 'ModelTiepoint', 34264: 'ModelTransformation', 34735: 'GeoKeyDirectory', 34736: 'GeoDoubleParams', 34737: 'GeoAsciiParams', 42112: 'GDAL_METADATA', 42113: 'GDAL_NODATA', 700: 'XMP', 34665: 'ExifIFD', 34853: 'GPSIFD', 34675: 'ICC profile', 33432: 'Copyright', 50838: 'ImageJ metadata byte counts', 50839: 'ImageJ metadata', 32997: 'ImageDepth (SGI)' };
const tagName = id => { try { const d = G.globals && G.globals.tagDefinitions && G.globals.tagDefinitions[id]; if (d && d.name) return d.name; } catch (e) { /* no table */ } return EXTRA[id] || 'Tag ' + id; };
const num = v => !Number.isFinite(v) ? String(v) : Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(10)));
function text(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') { const s = v.replace(/\0+$/, ''); return s.length > 600 ? s.slice(0, 600) + `... (${s.length.toLocaleString('en-US')} characters)` : s; }
  if (typeof v === 'number') return num(v);
  if (typeof v === 'bigint') return String(v);
  if (ArrayBuffer.isView(v) || Array.isArray(v)) {
    const k = Math.min(v.length, 16), parts = [];
    for (let i = 0; i < k; i++) parts.push(typeof v[i] === 'number' ? num(v[i]) : String(v[i]));
    return parts.join(', ') + (v.length > k ? `, ... (${v.length.toLocaleString('en-US')} values)` : '');
  }
  try { return JSON.stringify(v).slice(0, 600); } catch (e) { return String(v); }
}

async function tags(fd) {
  const out = [], ids = new Set([...fd.actualizedFields.keys(), ...fd.deferredFields.keys(), ...fd.deferredArrays.keys()]);
  for (const id of [...ids].sort((a, b) => a - b)) {
    let v;
    if (fd.deferredArrays.has(id)) v = `(${fd.deferredArrays.get(id).length.toLocaleString('en-US')} values, not loaded)`;
    else { try { v = text(await fd.loadValue(id)); } catch (e) { v = '(could not be read)'; } }
    out.push([id, tagName(id), v]);
  }
  return out;
}
const UNITS = { 9001: 'metres', 9002: 'feet', 9003: 'US survey feet', 9102: 'degrees' };
function geo(im, fd) {
  const has = ['ModelPixelScale', 'ModelTiepoint', 'ModelTransformation', 'GeoKeyDirectory'].some(t => { try { return fd.hasTag(t); } catch (e) { return false; } });
  if (!has) return null;
  const rows = []; let k = {};
  try { k = im.getGeoKeys() || {}; } catch (e) { rows.push(['GeoKeys', 'could not be read']); }
  const proj = k.ProjectedCSTypeGeoKey, geog = k.GeographicTypeGeoKey, model = k.GTModelTypeGeoKey;
  const epsg = proj && proj !== 32767 ? proj : geog && geog !== 32767 ? geog : null;
  rows.push(['CRS', epsg ? `EPSG:${epsg}` + (model === 2 ? ' (geographic)' : model === 1 ? ' (projected)' : '') : model === 2 ? 'geographic, user-defined' : model === 1 ? 'projected, user-defined' : null]);
  rows.push(['Citation', k.GTCitationGeoKey || k.PCSCitationGeoKey || k.GeogCitationGeoKey || null]);
  const unit = model === 2 ? 'degrees' : UNITS[k.ProjLinearUnitsGeoKey] || (proj ? 'metres' : '');
  let o = null, r = null;
  try {
    o = im.getOrigin(); r = im.getResolution(); const bb = im.getBoundingBox();
    rows.push(['Pixel size', `${num(Math.abs(r[0]))} x ${num(Math.abs(r[1]))}${unit ? ' ' + unit : ''}`]);
    rows.push(['Origin (top left)', `${num(o[0])}, ${num(o[1])}`]);
    rows.push(['Bounds', `x ${num(bb[0])} to ${num(bb[2])}, y ${num(bb[1])} to ${num(bb[3])}`]);
  } catch (e) { o = r = null; rows.push(['Placement', 'tie points without a pixel scale (not a simple grid)']); }
  rows.push(['Raster type', k.GTRasterTypeGeoKey === 2 ? 'PixelIsPoint' : k.GTRasterTypeGeoKey === 1 ? 'PixelIsArea' : null]);
  try { const nd = im.getGDALNoData(); if (nd !== null) rows.push(['Nodata (GDAL)', num(nd)]); } catch (e) { /* none */ }
  for (const [name, val] of Object.entries(k)) rows.push([name.replace(/GeoKey$/, ''), text(val)]);
  return { rows: rows.filter(x => x[1] !== null && x[1] !== ''), o, r, model };
}

/* ---------- one page ---------- */
async function page(i, maxpx, maxclaim) {
  const im = await tiff.getImage(i), fd = im.fileDirectory;
  const w = im.getWidth(), h = im.getHeight(), spp = im.getSamplesPerPixel(), bps = im.getBitsPerSample(0), sf = im.getSampleFormat(0) || 1;
  const pi = fd.getValue('PhotometricInterpretation'), comp = fd.getValue('Compression') || 1, tiled = fd.hasTag('TileWidth');
  const res = { i, w, h, spp, bps, sf, pi, comp, planar: fd.getValue('PlanarConfiguration') || 1, tiled, tw: tiled ? im.getTileWidth() : 0, th: tiled ? im.getTileHeight() : 0,
    pred: fd.hasTag('Predictor') ? fd.getValue('Predictor') : 0, tags: await tags(fd), geo: geo(im, fd), nodata: null };
  try { res.nodata = im.getGDALNoData(); } catch (e) { /* none */ }
  if (!w || !h) { res.refuse = 'This page has no pixels (its width or height is 0).'; return res; }
  if (w * h > maxclaim) { res.refuse = `This page claims ${w.toLocaleString('en-US')} x ${h.toLocaleString('en-US')} pixels, more than a browser tab can decode. Its tags are listed below.`; return res; }
  if (!DECODES.has(comp)) { res.refuse = `This page uses ${COMP[comp] || 'compression ' + comp} compression, which this page cannot decode. Its tags are listed below.`; return res; }
  if (sf === 5 || sf === 6) { res.refuse = 'This page stores complex numbers (as in radar images), which this page cannot show. Its tags are listed below.'; return res; }
  if (pi === 32844 || pi === 32845) { res.refuse = 'This page stores LogLuv light values, which this page cannot decode. Its tags are listed below.'; return res; }
  const sub = fd.getValue('YCbCrSubSampling');
  if (pi === 6 && comp !== 7 && comp !== 6 && sub && (sub[0] > 1 || sub[1] > 1)) { res.refuse = 'This page stores subsampled YCbCr pixels without JPEG, which this page cannot decode. Its tags are listed below.'; return res; }
  if (comp === 5) {  // old-style LZW (LSB first, libtiff before 1991): the decoder would not stop, so check the first bytes
    try {
      const off = await fd.loadValueIndexed(tiled ? 'TileOffsets' : 'StripOffsets', 0), b = rd(off, off + 2);
      if (b.length === 2 && b[0] === 0 && (b[1] & 1)) { res.refuse = 'This page uses old-style LZW from early TIFF writers, which this page cannot decode. Its tags are listed below.'; return res; }
    } catch (e) { /* the decode reports it */ }
  }
  const f = Math.max(1, Math.sqrt(w * h / maxpx)), dw = Math.max(1, Math.floor(w / f)), dh = Math.max(1, Math.floor(h / f));
  const rgb = [3, 5, 6, 8, 9, 10].includes(pi) || (pi === 2 && bps <= 8 && sf !== 3 && spp >= 3);
  const opt = { width: dw, height: dh, interleave: false };
  try {
    const data = rgb ? await im.readRGB({ ...opt, enableAlpha: true }) : await im.readRasters(opt);
    res.ch = Array.from(data); res.dw = dw; res.dh = dh; res.rgb = rgb;
  } catch (e) { res.err = String(e && e.message || e); }
  return res;
}
async function list(max) {
  const rows = [];
  for (let i = 0; i < Math.min(n, max); i++) {
    try {
      const im = await tiff.getImage(i), fd = im.fileDirectory, nm = fd.hasTag(285) ? text(await fd.loadValue(285)) : '';
      rows.push([i, im.getWidth(), im.getHeight(), `${im.getSamplesPerPixel() > 1 ? im.getSamplesPerPixel() + ' x ' : ''}${im.getBitsPerSample(0)}-bit ${{ 3: 'float', 2: 'int' }[im.getSampleFormat(0)] || 'uint'}`, COMP[fd.getValue('Compression') || 1] || String(fd.getValue('Compression')), nm]);
    } catch (e) { rows.push([i, 0, 0, 'could not be read', '', '']); }
  }
  return rows;
}

onmessage = async e => {
  const { id, op } = e.data;
  try {
    let res, tr = [];
    if (op === 'load') { await load(e.data.url, e.data.integrity); res = true; }
    else if (op === 'open') {
      file = e.data.file; tiff = null;
      const wk = walk();
      if (!wk.count) throw new Error(wk.loop ? 'The page list of this TIFF file loops back on itself before the first page, so it is damaged.' : 'This TIFF file has no readable page: the first page is past the end of the file or cut short.');
      n = wk.count;
      tiff = await G.fromBlob(file);
      res = { n, loop: wk.loop, past: wk.past && wk.count > 0, big: wk.big, le: wk.le };
    } else if (op === 'page') {
      res = await page(e.data.i, e.data.maxpx, e.data.maxclaim);
      if (res.ch) tr = [...new Set(res.ch.map(a => a.buffer))];
    } else if (op === 'list') res = await list(e.data.max);
    postMessage({ id, ok: true, res }, tr);
  } catch (err) {
    postMessage({ id, ok: false, err: String(err && err.message || err) });
  }
};
