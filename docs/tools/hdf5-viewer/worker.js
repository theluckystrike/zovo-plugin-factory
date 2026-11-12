/* Zovo HDF5 and NetCDF Viewer Online, reader worker (WEB4, wave18). Runs in a background worker of the page.
   The file is mounted with Emscripten's WORKERFS, so HDF5 reads only the bytes it needs (FileReaderSync on slices
   of the File); nothing is copied out of the tab and nothing is sent anywhere. h5wasm 0.10.3 (HDF5 compiled to
   WebAssembly, MIT and the HDF5 license) is fetched once from cdn.jsdelivr.net at a pinned URL with its sha384
   checked by fetch(integrity) before it runs. NetCDF-3 files (CDF-1, CDF-2 and CDF-5) are not HDF5: their header
   is parsed here and values are read by byte offset. The worker makes no other request. */
'use strict';
let H = null, F = null, file = null, nc = null, mounted = false, CLS = {};
const MAXN = 20000, MAXDEPTH = 64, HEAT = 512, TROWS = 100, TCOLS = 30, LINE = 2000;

const rd = (a, b) => new Uint8Array(new FileReaderSync().readAsArrayBuffer(file.slice(a, b)));

async function load(url, integrity) {
  if (H) return;
  const r = await fetch(url, { integrity, mode: 'cors', credentials: 'omit' });
  if (!r.ok) throw new Error('The HDF5 reader could not be loaded (HTTP ' + r.status + ').');
  const u = URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: 'text/javascript' }));
  // HDF5 prints its error stack line by line on a failed read; the page shows its own message, so drop those lines.
  for (const k of ['error', 'warn']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { if (typeof a[0] === 'string' && /^(HDF5-DIAG|\s+#\d{3}:|\s+(major|minor):)/.test(a[0])) return; orig(...a); };
  }
  try { importScripts(u); } finally { URL.revokeObjectURL(u); }
  await self.h5wasm.ready;
  H = self.h5wasm;
  for (const [k, v] of Object.entries(H.Module.H5T_class_t)) if (v && typeof v.value === 'number') CLS[v.value] = k.replace('H5T_', '');
}

/* ---------- format check ---------- */
const SIG = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
function sniff() {
  const n = file.size, head = rd(0, Math.min(n, 128));
  if (!n) return { bad: 'This file is empty (0 bytes).' };
  for (let off = 0; off < n; off = off ? off * 2 : 512) {
    const b = off ? rd(off, Math.min(n, off + 8)) : head;
    if (b.length >= 8 && SIG.every((x, i) => b[i] === x)) return { fmt: 'hdf5', sig: off };
    if (off >= 1 << 20) break;
  }
  const t = String.fromCharCode(...head.subarray(0, 24));
  if (t.startsWith('CDF') && [1, 2, 5].includes(head[3])) return { fmt: 'nc3', ver: head[3] };
  if (head[0] === 0x0e && head[1] === 0x03 && head[2] === 0x13 && head[3] === 0x01) return { bad: 'This is an HDF4 file. HDF4 is an older format that HDF5 tools cannot read; convert it with h4toh5 from The HDF Group, then open the .h5 file here.' };
  if (t.startsWith('MATLAB 5.0')) return { bad: 'This is a MATLAB v5 .mat file, which is not HDF5. Save it again in MATLAB with save(filename, \'-v7.3\') and open that file here.' };
  if (t.startsWith('CDF') ) return { bad: 'This looks like a NetCDF file of an unknown version.' };
  if (t.startsWith('GRIB')) return { bad: 'This is a GRIB file, not HDF5 or NetCDF.' };
  if (head[0] === 0x50 && head[1] === 0x4b) return { bad: 'This is a ZIP file, not HDF5 or NetCDF. Zarr stores are not supported.' };
  return { bad: 'This is not an HDF5 or NetCDF file: it has no HDF5 signature and no NetCDF header. The format is found from the first bytes, not the file name.' };
}
// The superblock records the end-of-file address, so a file cut short in a copy or download can be named as such.
function hdf5End(sig) {
  try {
    const b = rd(sig, Math.min(file.size, sig + 96)), dv = new DataView(b.buffer), ver = b[8];
    const word = (o, s) => s === 8 ? Number(dv.getBigUint64(o, true)) : s === 4 ? dv.getUint32(o, true) : s === 2 ? dv.getUint16(o, true) : NaN;
    if (ver === 0 || ver === 1) { const so = b[13], at = 24 + (ver === 1 ? 4 : 0); return { ver, eof: sig + word(at, so) + word(at + 2 * so, so) }; }
    if (ver === 2 || ver === 3) { const so = b[9]; return { ver, eof: sig + word(12, so) + word(12 + 2 * so, so) }; }
    return { ver };
  } catch (e) { return {}; }
}

/* ---------- types and text ---------- */
function typeText(m) {
  const c = CLS[m.type] || 'type ' + m.type, be = m.size > 1 && !m.littleEndian ? ', big endian' : '';
  if (c === 'INTEGER') return (m.signed ? 'int' : 'uint') + m.size * 8 + be;
  if (c === 'FLOAT') return 'float' + m.size * 8 + be;
  if (c === 'STRING') return m.vlen ? 'string' : `string (${m.size} bytes)`;
  if (c === 'COMPOUND') { const ms = (m.compound_type && m.compound_type.members) || []; return 'compound {' + ms.slice(0, 8).map(x => x.name + ': ' + typeText(x)).join(', ') + (ms.length > 8 ? `, ... ${ms.length} fields` : '') + '}'; }
  if (c === 'ENUM') { const k = Object.keys((m.enum_type && m.enum_type.members) || {}); return 'enum {' + k.slice(0, 6).join(', ') + (k.length > 6 ? ', ...' : '') + '}'; }
  if (c === 'ARRAY' && m.array_type) return typeText(m.array_type) + ' [' + m.array_type.shape.join(' x ') + ']';
  if (c === 'VLEN') return 'variable-length ' + (m.vlen_type ? typeText(m.vlen_type) : '');
  if (c === 'REFERENCE') return (m.ref_type === 'region' ? 'region ' : 'object ') + 'reference';
  return c.toLowerCase();
}
const isNum = m => { const c = CLS[m.type]; return c === 'INTEGER' || c === 'FLOAT' || c === 'ENUM'; };
// Significant digits to print: float32 and float16 values are shown as they were written, not with float64 noise.
const precOf = m => { const b = m && (m.array_type || m.vlen_type || m); return b && CLS[b.type] === 'FLOAT' ? (b.size === 4 ? 7 : b.size === 2 ? 4 : 0) : 0; };
function fmtNum(v, prec) {
  if (typeof v === 'bigint') return v.toString();
  if (typeof v !== 'number') return String(v);
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? 'Inf' : '-Inf';
  return prec ? String(Number(v.toPrecision(prec))) : String(v);
}
function valText(v, m, max = 300) {
  let s;
  if (v === null || v === undefined) s = '';
  else if (typeof v === 'string') s = v;
  else if (typeof v === 'number' || typeof v === 'bigint') s = fmtNum(v, m);
  else if (typeof v === 'boolean') s = String(v);
  else if (ArrayBuffer.isView(v) || Array.isArray(v)) {
    const n = v.length, k = Math.min(n, 20), parts = [];
    for (let i = 0; i < k; i++) parts.push(valText(v[i], m, 80));
    s = (n === 1 ? parts[0] : '[' + parts.join(', ') + (n > k ? `, ... ${n.toLocaleString('en-US')} values` : '') + ']');
  } else if (typeof v === 'object') {
    try { s = JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x.toString() : ArrayBuffer.isView(x) ? Array.from(x.subarray ? x.subarray(0, 20) : x) : x); } catch (e) { s = '(value)'; }
  } else s = String(v);
  return s.length > max ? s.slice(0, max) + '...' : s;
}
const INTERNAL = new Set(['DIMENSION_LIST', 'REFERENCE_LIST', 'CLASS', 'NAME', '_Netcdf4Dimid', '_Netcdf4Coordinates', '_NCProperties', '_nc3_strict', '_IsNetcdf4']);
function attrsOf(path) {
  const out = [];
  let names = [];
  try { names = H.Module.get_attribute_names(F.file_id, path); } catch (e) { return out; }
  for (const name of names.slice(0, 2000)) {
    try {
      const a = new H.Attribute(F.file_id, path, name);
      let v; try { v = a.value; } catch (e) { v = '(this attribute type cannot be read here)'; }
      if (v && typeof v === 'object' && !ArrayBuffer.isView(v) && !Array.isArray(v) && v.constructor && /Reference/.test(v.constructor.name)) v = '(reference)';
      out.push([name, typeText(a.metadata) + (a.metadata.shape && a.metadata.shape.length ? ' [' + a.metadata.shape.join(' x ') + ']' : ''), valText(v, precOf(a.metadata), 2000), INTERNAL.has(name) ? 1 : 0, v]);
    } catch (e) { out.push([name, '', '(could not be read)', 0, null]); }
  }
  if (names.length > 2000) out.push(['...', '', `${names.length - 2000} more attributes`, 0, null]);
  return out;
}

/* ---------- HDF5 tree ---------- */
function openHdf5(s) {
  const FS = H.FS;
  if (F) { try { F.close(); } catch (e) { /* already closed */ } F = null; }
  if (mounted) { try { FS.unmount('/work'); } catch (e) { /* not mounted */ } mounted = false; }
  try { FS.mkdir('/work'); } catch (e) { /* exists */ }
  FS.mount(FS.filesystems.WORKERFS, { files: [file] }, '/work'); mounted = true;
  const sb = hdf5End(s.sig);
  if (sb.eof && sb.eof > file.size && sb.eof < 2 ** 50) throw new Error(`This HDF5 file is cut short: it should be ${sb.eof.toLocaleString('en-US')} bytes, but only ${file.size.toLocaleString('en-US')} are here, so ${(sb.eof - file.size).toLocaleString('en-US')} bytes are missing. Copy or download it again.`);
  try { F = new H.File('/work/' + file.name, 'r'); }
  catch (e) { throw new Error('HDF5 could not open this file. It may be damaged or cut short.'); }
  const M = H.Module, nodes = [], fid = F.file_id;
  let nc4 = false, more = false, groups = 0, datasets = 0;
  let rootAttrs;
  try { rootAttrs = M.get_attribute_names(fid, '/'); } catch (e) { throw new Error('HDF5 could not read the root group of this file. It may be damaged or cut short.'); }
  if (rootAttrs.includes('_NCProperties')) nc4 = true;
  const visit = (path, depth) => {
    let names;
    try { names = M.get_names(fid, path, false); } catch (e) { return; }
    names = Array.from(names).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    for (const name of names) {
      if (nodes.length >= MAXN) { more = true; return; }
      const p = (path === '/' ? '' : path) + '/' + name, node = { p, n: name, d: depth };
      let t; try { t = M.get_type(fid, p); } catch (e) { t = -1; }
      if (t === M.H5G_GROUP) { node.k = 'g'; groups++; }
      else if (t === M.H5G_DATASET) {
        node.k = 'd'; datasets++;
        try {
          const m = M.get_dataset_metadata(fid, p), an = M.get_attribute_names(fid, p);
          node.shape = m.shape; node.t = typeText(m);
          if (an.includes('_Netcdf4Dimid') || an.includes('_Netcdf4Coordinates')) nc4 = true;
          if (an.includes('CLASS') && an.includes('NAME')) {
            node.scale = 1;
            try { const nm = new H.Attribute(fid, p, 'NAME').value; if (typeof nm === 'string' && nm.startsWith('This is a netCDF dimension but not a netCDF variable')) node.k = 'dim'; } catch (e) { /* no NAME text */ }
          }
        } catch (e) { node.t = '(unreadable)'; }
      } else if (t === M.H5G_LINK) { node.k = 'l'; try { node.t = 'soft link to ' + M.get_symbolic_link(fid, p); } catch (e) { node.t = 'soft link'; } }
      else if (t === M.H5G_UDLINK) { node.k = 'x'; try { const x = M.get_external_link(fid, p); node.t = 'external link to ' + x.filename + ':' + x.obj_path; } catch (e) { node.t = 'external link'; } }
      else if (t === M.H5G_TYPE) { node.k = 't'; node.t = 'named datatype'; }
      else { node.k = '?'; node.t = 'unknown object'; }
      nodes.push(node);
      if (node.k === 'g' && depth < MAXDEPTH) visit(p, depth + 1);
    }
  };
  visit('/', 0);
  return { fmt: nc4 ? 'NetCDF-4 (HDF5)' : 'HDF5', sb: sb.ver, nodes, more, groups, datasets, size: file.size };
}

function dsDetail(path) {
  const M = H.Module, fid = F.file_id;
  if (path === '/') return { path, kind: 'g', attrs: attrsOf('/') };
  const t = M.get_type(fid, path);
  if (t === M.H5G_GROUP) return { path, kind: 'g', attrs: attrsOf(path), children: M.get_names(fid, path, false).length };
  if (t !== M.H5G_DATASET) return { path, kind: 'o', attrs: t === M.H5G_TYPE ? attrsOf(path) : [] };
  const ds = new H.Dataset(fid, path), m = ds.metadata, info = { path, kind: 'd', attrs: attrsOf(path), type: typeText(m), shape: m.shape, maxshape: m.maxshape, chunks: m.chunks, esize: m.size, numeric: isNum(m), prec: precOf(m) };
  try { info.filters = ds.filters.map(f => FILTER[f.id] || (f.name ? `${f.name} (filter ${f.id})` : `filter ${f.id}`)); } catch (e) { info.filters = []; }
  info.dims = (m.shape || []).map((_, i) => {
    try { const sc = ds.get_attached_scales(i); if (sc && sc.length) return sc[0].split('/').pop(); } catch (e) { /* no scales */ }
    try { const l = ds.get_dimension_labels()[i]; if (l) return l; } catch (e) { /* no labels */ }
    return null;
  });
  if (m.virtual_sources && m.virtual_sources.length) info.virtual = m.virtual_sources.length;
  return info;
}
const FILTER = { 1: 'deflate (gzip)', 2: 'shuffle', 3: 'fletcher32 checksum', 4: 'szip', 5: 'n-bit', 6: 'scale-offset', 32000: 'LZF', 32001: 'Blosc', 32004: 'LZ4', 32008: 'bitshuffle', 32013: 'ZFP', 32015: 'Zstd', 307: 'bzip2', 32026: 'Blosc2' };

/* ---------- reading values (HDF5 and NetCDF-3 share the same plan) ---------- */
// plan: lead = indices for all but the last two axes (or the last one for 1-D); returns
// table: { rows: [[...strings]], R, C } and chart: { kind: 'line'|'heat', v: Float64Array, ... }
function cfOf(attrs, on) {
  if (!on) return null;
  const get = n => { const a = attrs.find(x => x[0] === n); if (!a) return undefined; const v = a[4]; return ArrayBuffer.isView(v) || Array.isArray(v) ? v[0] : v; };
  const num = x => typeof x === 'bigint' ? Number(x) : typeof x === 'number' ? x : undefined;
  const sc = num(get('scale_factor')), of = num(get('add_offset')), fv = num(get('_FillValue')), mv = num(get('missing_value'));
  if (sc === undefined && of === undefined && fv === undefined && mv === undefined) return null;
  return { sc: sc === undefined ? 1 : sc, of: of === undefined ? 0 : of, fill: [fv, mv].filter(x => x !== undefined) };
}
function decode(arr, cf, out, mask) {
  const n = arr.length;
  for (let i = 0; i < n; i++) {
    let v = arr[i]; v = typeof v === 'bigint' ? Number(v) : typeof v === 'boolean' ? +v : v;
    if (typeof v !== 'number') { out[i] = NaN; continue; }
    if (cf) {
      let f = false;
      for (const x of cf.fill) if (v === x || (Number.isNaN(x) && Number.isNaN(v))) f = true;
      if (f) { out[i] = NaN; mask[i] = 1; continue; }
      v = v * cf.sc + cf.of;
    }
    out[i] = v;
  }
}
function values(req) {
  const isH = !!F && !nc;
  const info = isH ? dsDetail(req.path) : ncDetail(req.path);
  if (info.kind !== 'd') return { info };
  const shape = info.shape;
  if (!shape) return { info, note: 'This dataset has no dataspace (a null dataset), so it holds no values.' };
  const nd = shape.length, total = shape.reduce((a, b) => a * b, 1);
  if (!total) return { info, note: 'This dataset is empty: one of its dimensions has length 0.' };
  const cf = info.numeric ? cfOf(info.attrs, req.cf) : null;
  const lead = (req.lead || []).map((x, i) => Math.max(0, Math.min(shape[i] - 1, x | 0)));
  const read = ranges => isH ? h5slice(req.path, ranges) : ncSlice(req.path, ranges);
  const t0 = Date.now(), res = { info, cf: !!cf, cfScaled: !!cf && (cf.sc !== 1 || cf.of !== 0), nd };
  try {
    if (nd === 0) { const v = read([]); res.scalar = valText(v && v.length !== undefined && typeof v !== 'string' ? v[0] : v, info.prec, 5000); return res; }
    // table of first values
    const R = nd === 1 ? Math.min(shape[0], TROWS * 10) : Math.min(shape[nd - 2], TROWS), C = nd === 1 ? 1 : Math.min(shape[nd - 1], TCOLS);
    const tr = nd === 1 ? [[0, R]] : [...lead.slice(0, nd - 2).map(i => [i, i + 1]), [0, R], [0, C]];
    const tv = read(tr), rows = [];
    for (let r = 0; r < R; r++) { const row = []; for (let c = 0; c < C; c++) row.push(cellText(tv, r * C + c, info, cf)); rows.push(row); }
    res.table = { rows, R, C, totalR: nd === 1 ? shape[0] : shape[nd - 2], totalC: nd === 1 ? 1 : shape[nd - 1] };
    if (!info.numeric) return res;
    // chart: a strided read of the whole 1-D array (or its first 20 million values) or of the 2-D slice
    if (nd === 1) {
      const n = Math.min(shape[0], 20000000), step = Math.max(1, Math.ceil(n / LINE)), raw = read([[0, n, step]]);
      const v = new Float64Array(raw.length), mask = new Uint8Array(raw.length); decode(raw, cf, v, mask);
      res.chart = { kind: 'line', v, step, n, all: shape[0], fills: count1(mask) };
    } else {
      const R2 = shape[nd - 2], C2 = shape[nd - 1], rs = Math.max(1, Math.ceil(R2 / HEAT)), cs = Math.max(1, Math.ceil(C2 / HEAT));
      const raw = read([...lead.slice(0, nd - 2).map(i => [i, i + 1]), [0, R2, rs], [0, C2, cs]]);
      const v = new Float64Array(raw.length), mask = new Uint8Array(raw.length); decode(raw, cf, v, mask);
      res.chart = { kind: 'heat', v, rs, cs, hr: Math.ceil(R2 / rs), hc: Math.ceil(C2 / cs), R: R2, C: C2, fills: count1(mask) };
    }
  } catch (e) {
    res.err = readErr(e, info);
  }
  res.ms = Date.now() - t0;
  return res;
}
const count1 = m => { let k = 0; for (let i = 0; i < m.length; i++) k += m[i]; return k; };
function cellText(arr, i, info, cf) {
  if (!arr || i >= arr.length) return '';
  const v = arr[i];
  if (cf && (typeof v === 'number' || typeof v === 'bigint')) {
    const x = Number(v);
    for (const f of cf.fill) if (x === f || (Number.isNaN(f) && Number.isNaN(x))) return 'fill';
    const y = x * cf.sc + cf.of;
    return cf.sc === 1 && cf.of === 0 ? fmtNum(v, info.prec) : fmtNum(y, cf.sc === 1 ? info.prec : 7);
  }
  return valText(v, info.prec, 300);
}
function readErr(e, info) {
  const f = (info.filters || []).filter(x => !/^(deflate|shuffle|fletcher32|scale-offset|n-bit|szip)/.test(x));
  if (f.length) return `This dataset is compressed with ${f.join(' and ')}, which this page cannot decompress. The NetCDF Viewer & HDF5 Viewer extension for VS Code reads LZF, Blosc, bitshuffle, LZ4, Zstd, bzip2 and ZFP.`;
  if (info.virtual) return 'This is a virtual dataset made of other files, which a web page cannot open.';
  if (/Float16/.test(String(e && e.message))) return 'This dataset holds float16 values, which this page cannot decode yet. Its type, shape and attributes are above.';
  if (/past the end/.test(String(e && e.message))) return 'These values are past the end of the file, so the file is cut short or damaged.';
  return 'The values could not be read: ' + String(e && e.message || e).slice(0, 200) + '. The file may be damaged or cut short.';
}
function h5slice(path, ranges) {
  const ds = new H.Dataset(F.file_id, path);
  return ranges.length ? ds.slice(ranges) : ds.value;
}

/* ---------- NetCDF-3 (classic CDF-1, 64-bit offset CDF-2, 64-bit data CDF-5) ---------- */
const NCT = { 1: ['int8', 1], 2: ['char', 1], 3: ['int16', 2], 4: ['int32', 4], 5: ['float32', 4], 6: ['float64', 8], 7: ['uint8', 1], 8: ['uint16', 2], 9: ['uint32', 4], 10: ['int64', 8], 11: ['uint64', 8] };
function parseNc3(ver) {
  let buf = rd(0, Math.min(file.size, 1 << 20)), dv = new DataView(buf.buffer), p = 4;
  const need = k => {
    if (p + k <= buf.length) return;
    if (buf.length >= file.size || p + k > file.size) throw new Error('The NetCDF header is cut short or damaged.');
    const n = Math.min(file.size, Math.max(p + k, buf.length * 2));
    if (n > 256 << 20) throw new Error('The NetCDF header claims to be bigger than 256 MB, so the file is damaged.');
    buf = rd(0, n); dv = new DataView(buf.buffer);
  };
  const u32 = () => { need(4); const v = dv.getUint32(p); p += 4; return v; };
  const u64 = () => { need(8); const v = Number(dv.getBigUint64(p)); p += 8; return v; };
  const nn = () => ver === 5 ? u64() : u32();
  const off = () => ver === 1 ? u32() : u64();
  const count = (what, per = 4) => { const n = nn(); if (n > 1e7 || n * per > file.size) throw new Error(`The NetCDF header claims ${n.toLocaleString('en-US')} ${what}, more than the file can hold. The file is damaged.`); return n; };
  const name = () => { const n = count('name bytes', 1); need(n); const s = new TextDecoder().decode(buf.subarray(p, p + n)); p += (n + 3) & ~3; return s; };
  const attrs = () => {
    const tag = u32(), n = count('attributes'); if (tag === 0 && n === 0) return [];
    if (tag !== 0x0c) throw new Error('The NetCDF header is damaged (bad attribute list).');
    const out = [];
    for (let i = 0; i < n; i++) {
      const nm = name(), ty = u32(), cnt = count('attribute values', 1), T = NCT[ty];
      if (!T) throw new Error('The NetCDF header has an unknown type ' + ty + '.');
      const bytes = cnt * T[1]; need(bytes);
      const v = ncValues(new DataView(buf.buffer, buf.byteOffset + p, bytes), ty, cnt); p += (bytes + 3) & ~3;
      const value = ty === 2 ? v : cnt === 1 ? v[0] : v;
      out.push([nm, T[0] + (ty !== 2 && cnt > 1 ? ' [' + cnt + ']' : ''), valText(value, ty === 5 ? 7 : 0, 2000), 0, value]);
    }
    return out;
  };
  let numrecs = nn();
  const dims = [], vars = [];
  { const tag = u32(), n = count('dimensions'); if (!(tag === 0 && n === 0)) { if (tag !== 0x0a) throw new Error('The NetCDF header is damaged (bad dimension list).'); for (let i = 0; i < n; i++) dims.push({ name: name(), len: nn() }); } }
  const gatts = attrs();
  { const tag = u32(), n = count('variables'); if (!(tag === 0 && n === 0)) {
    if (tag !== 0x0b) throw new Error('The NetCDF header is damaged (bad variable list).');
    for (let i = 0; i < n; i++) {
      const nm = name(), nd = count('dimensions of a variable'), ids = [];
      for (let k = 0; k < nd; k++) { const id = nn(); if (id >= dims.length) throw new Error('The NetCDF header is damaged (a variable uses a missing dimension).'); ids.push(id); }
      const va = attrs(), ty = u32(), vsize = ver === 5 ? u64() : u32(), begin = off();
      if (!NCT[ty]) throw new Error('The NetCDF header has an unknown type ' + ty + '.');
      vars.push({ name: nm, ids, attrs: va, ty, vsize, begin, rec: ids.length > 0 && dims[ids[0]].len === 0 });
    }
  } }
  const recVars = vars.filter(v => v.rec);
  let recsize = recVars.reduce((a, v) => a + v.vsize, 0);
  if (recVars.length === 1) { const v = recVars[0]; recsize = v.ids.slice(1).reduce((a, id) => a * dims[id].len, 1) * NCT[v.ty][1]; }
  if ((ver === 5 ? numrecs >= 2 ** 53 : numrecs === 0xffffffff) && recsize) numrecs = Math.floor((file.size - Math.min(...recVars.map(v => v.begin))) / recsize);
  for (const v of vars) v.shape = v.ids.map(id => dims[id].len === 0 ? numrecs : dims[id].len);
  return { ver, numrecs, dims, gatts, vars, recsize };
}
function ncValues(dv, ty, n) {
  const out = ty === 2 ? null : ty === 10 ? new BigInt64Array(n) : ty === 11 ? new BigUint64Array(n) : new Float64Array(n);
  if (ty === 2) { let s = new TextDecoder('latin1').decode(new Uint8Array(dv.buffer, dv.byteOffset, n)); const z = s.indexOf('\0'); return z >= 0 ? s.slice(0, z) : s; }
  const S = NCT[ty][1];
  for (let i = 0; i < n; i++) {
    const o = i * S;
    out[i] = ty === 1 ? dv.getInt8(o) : ty === 3 ? dv.getInt16(o) : ty === 4 ? dv.getInt32(o) : ty === 5 ? dv.getFloat32(o) : ty === 6 ? dv.getFloat64(o)
      : ty === 7 ? dv.getUint8(o) : ty === 8 ? dv.getUint16(o) : ty === 9 ? dv.getUint32(o) : ty === 10 ? dv.getBigInt64(o) : dv.getBigUint64(o);
  }
  return out;
}
function openNc3(s) {
  nc = parseNc3(s.ver);
  const nodes = [];
  for (const d of nc.dims) if (!nc.vars.some(v => v.name === d.name && v.ids.length === 1)) nodes.push({ p: '/' + d.name, n: d.name, d: 0, k: 'dim', shape: [d.len === 0 ? nc.numrecs : d.len], t: d.len === 0 ? 'dimension (unlimited)' : 'dimension' });
  for (const v of nc.vars) nodes.push({ p: '/' + v.name, n: v.name, d: 0, k: 'd', shape: v.shape, t: NCT[v.ty][0], scale: v.ids.length === 1 && nc.dims[v.ids[0]].name === v.name ? 1 : 0 });
  nodes.sort((a, b) => (b.scale || 0) - (a.scale || 0) || a.n.localeCompare(b.n, 'en', { numeric: true }));
  const label = { 1: 'NetCDF-3 classic', 2: 'NetCDF-3 64-bit offset', 5: 'NetCDF CDF-5 (64-bit data)' }[s.ver];
  let want = 0;  // the size the header asks for, to name a file that is cut short
  for (const v of nc.vars) want = Math.max(want, v.rec ? v.begin + nc.numrecs * nc.recsize : v.begin + v.vsize);
  return { fmt: label, nc3: true, short: want > file.size && want < 2 ** 50 ? want - file.size : 0, nodes, more: false, groups: 0, datasets: nc.vars.length, size: file.size, dims: nc.dims.map(d => [d.name, d.len === 0 ? `${nc.numrecs} (unlimited)` : String(d.len)]) };
}
function ncDetail(path) {
  if (path === '/') return { path, kind: 'g', attrs: nc.gatts, dimsList: nc.dims.map(d => [d.name, d.len === 0 ? `${nc.numrecs} (unlimited)` : String(d.len)]) };
  const v = nc.vars.find(x => '/' + x.name === path);
  if (!v) { const d = nc.dims.find(x => '/' + x.name === path); return { path, kind: 'o', attrs: [], dimOnly: d ? (d.len === 0 ? nc.numrecs : d.len) : null }; }
  const T = NCT[v.ty];
  return { path, kind: 'd', attrs: v.attrs, type: T[0] + (T[1] > 1 ? ', big endian' : ''), shape: v.shape, dims: v.ids.map(id => nc.dims[id].name), numeric: v.ty !== 2, filters: [], esize: T[1], unlimited: v.rec, prec: v.ty === 5 ? 7 : 0 };
}
// Strided read of a NetCDF-3 variable: one file read per row of the last axis (only the bytes that row spans).
function ncSlice(path, ranges) {
  const v = nc.vars.find(x => '/' + x.name === path), S = NCT[v.ty][1], sh = v.shape, nd = sh.length;
  if (nd === 0) return ncValues(new DataView(rd(v.begin, v.begin + S).buffer), v.ty, 1);
  const rg = sh.map((n, i) => { const r = ranges[i] || [0, n, 1]; const a = Math.max(0, r[0] || 0), b = Math.min(n, r[1] ?? n), st = r[2] || 1; return { a, st, k: Math.max(0, Math.ceil((b - a) / st)) }; });
  const total = rg.reduce((x, r) => x * r.k, 1);
  const out = v.ty === 10 ? new BigInt64Array(total) : v.ty === 11 ? new BigUint64Array(total) : v.ty === 2 ? new Array(total) : new Float64Array(total);
  const inner = []; for (let i = nd - 1, s = 1; i >= 0; i--) { inner[i] = s; s *= v.rec && i === 0 ? 1 : sh[i]; }
  const last = rg[nd - 1], idx = new Array(nd - 1).fill(0);
  let o = 0;
  if (v.rec && nd === 1) {  // a 1-D record variable: its values are one record apart, so read them one by one
    for (let k = 0; k < last.k; k++) {
      const a = v.begin + (last.a + k * last.st) * nc.recsize;
      if (a + S > file.size) throw new Error('these values are past the end of the file (it is cut short)');
      const val = ncValues(new DataView(rd(a, a + S).buffer), v.ty, 1); out[o++] = v.ty === 2 ? val : val[0];
    }
    return out;
  }
  for (let row = 0; row < total / last.k; row++) {
    let base = v.begin;
    for (let i = 0; i < nd - 1; i++) { const j = rg[i].a + idx[i] * rg[i].st; base += v.rec && i === 0 ? j * nc.recsize : j * inner[i] * S; }
    const a = base + last.a * S, b = a + ((last.k - 1) * last.st + 1) * S;
    if (b > file.size) throw new Error('these values are past the end of the file (it is cut short)');
    const bytes = rd(a, b), dv = new DataView(bytes.buffer);
    if (v.ty === 2) { for (let k = 0; k < last.k; k++) out[o++] = String.fromCharCode(bytes[k * last.st * S]).replace('\0', ''); }
    else { const vals = ncValues(dv, v.ty, (last.k - 1) * last.st + 1); for (let k = 0; k < last.k; k++) out[o++] = vals[k * last.st]; }
    for (let i = nd - 2; i >= 0; i--) { if (++idx[i] < rg[i].k) break; idx[i] = 0; }
  }
  return out;
}

/* ---------- messages ---------- */
onmessage = async e => {
  const { id, op } = e.data;
  try {
    let res;
    if (op === 'load') { await load(e.data.url, e.data.integrity); res = true; }
    else if (op === 'open') {
      file = e.data.file; nc = null;
      if (F) { try { F.close(); } catch (x) { /* closed */ } F = null; }
      const s = sniff();
      if (s.bad) throw new Error(s.bad);
      if (s.fmt === 'nc3') res = openNc3(s);
      else { if (!H) throw new Error('The HDF5 reader is not loaded.'); res = openHdf5(s); }
      res.attrs = s.fmt === 'nc3' ? nc.gatts.map(a => a.slice(0, 4)) : attrsOf('/').map(a => a.slice(0, 4));
    } else if (op === 'detail') {
      const r = values(e.data);
      if (r.info && r.info.attrs) r.info.attrs = r.info.attrs.map(a => a.slice(0, 4));
      res = r;
    }
    const tr = res && res.chart ? [res.chart.v.buffer] : [];
    postMessage({ id, ok: true, res }, tr);
  } catch (err) {
    postMessage({ id, ok: false, err: String(err && err.message || err) });
  }
};
