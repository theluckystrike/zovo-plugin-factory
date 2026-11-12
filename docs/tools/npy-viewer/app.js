/* Zovo NPY and NPZ Viewer Online (WEB3, wave18). The file is read in this tab with the File API and never sent
   anywhere: the page CSP sets connect-src 'none'. The .npy header is parsed as text (never run), object arrays
   (Python pickle) are listed and refused, and every value is written as text, never as HTML. Deflated .npz entries
   are read with fflate 0.8.2 (cdn.jsdelivr.net, pinned, SRI in the import map). Only the start of a big array is
   read: CAP bytes per array for the stats, the chart and the rows. */
import { Inflate } from 'fflate';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const CAP = 64 * 1024 * 1024;     // bytes of one array read for stats, charts and rows
const ROWS = 200, COLS = 50;      // first rows table
const HMAX = 256;                 // heatmap cells per side (block means above that)

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  draw();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => draw());

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

/* ---------- .npy header ---------- */
const KIND = { b: 'bool', i: 'int', u: 'uint', f: 'float', c: 'complex', U: 'unicode string', S: 'bytes', a: 'bytes', V: 'raw bytes', M: 'datetime64', m: 'timedelta64', O: 'Python object' };
function parseHeader(u8) {
  if (u8.length < 10 || u8[0] !== 0x93 || String.fromCharCode(...u8.subarray(1, 6)) !== 'NUMPY') throw new Error('This is not a .npy array: it does not start with \\x93NUMPY.');
  const major = u8[6], dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const hlen = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true), start = major === 1 ? 10 : 12;
  if (start + hlen > u8.length) throw new Error('The .npy header is cut short.');
  const h = new TextDecoder(major >= 3 ? 'utf-8' : 'latin1').decode(u8.subarray(start, start + hlen));
  const fo = /'fortran_order'\s*:\s*(True|False)/.exec(h), sh = /'shape'\s*:\s*\(([^)]*)\)/.exec(h);
  if (!fo || !sh) throw new Error('The .npy header could not be read: ' + h.slice(0, 120));
  const shape = sh[1].split(',').map(s => s.trim()).filter(Boolean).map(Number);
  if (shape.some(n => !Number.isFinite(n) || n < 0)) throw new Error('The .npy header has a shape that is not a list of sizes.');
  const ds = /'descr'\s*:\s*'([^']*)'/.exec(h);
  const out = { version: `${major}.${u8[7]}`, offset: start + hlen, fortran: fo[1] === 'True', shape, header: h.trim() };
  if (!ds) { out.dtype = { str: 'structured', kind: 'V', size: 0, structured: true, name: 'structured (record) dtype' }; return out; }
  out.dtype = parseDescr(ds[1]);
  return out;
}
function parseDescr(s) {
  const m = /^([<>|=]?)([a-zA-Z])(\d*)(?:\[(\w+)\])?$/.exec(s);
  if (!m) return { str: s, kind: '?', size: 0, name: s };
  const [, order, kind, n, unit] = m;
  let sz = Number(n || 0);
  if (kind === 'U') sz *= 4;
  if (kind === 'O') sz = 8;
  if (kind === 'b' && !sz) sz = 1;
  const big = order === '>';
  let name = KIND[kind] || kind;
  if ('iuf'.includes(kind)) name = name + sz * 8;
  else if (kind === 'c') name = 'complex' + sz * 8;
  else if (kind === 'U') name = `unicode string, ${n} chars`;
  else if (kind === 'S' || kind === 'a') name = `bytes, ${n} long`;
  else if (kind === 'M' || kind === 'm') name = `${KIND[kind]}[${unit || 'generic'}]`;
  return { str: s, kind, size: sz, big, unit, name, numeric: 'biufcMm'.includes(kind) };
}

/* ---------- reading values ---------- */
function decoder(dt, buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), le = !dt.big, s = dt.size;
  const n = Math.floor(buf.byteLength / Math.max(1, s));
  const k = dt.kind;
  let num, show;
  if (k === 'b') { num = i => dv.getUint8(i); show = i => dv.getUint8(i) ? 'True' : 'False'; }
  else if (k === 'i' || k === 'u' || k === 'M' || k === 'm') {
    const sg = k !== 'u';
    const get = s === 1 ? (sg ? i => dv.getInt8(i) : i => dv.getUint8(i)) : s === 2 ? (sg ? i => dv.getInt16(i * 2, le) : i => dv.getUint16(i * 2, le))
      : s === 4 ? (sg ? i => dv.getInt32(i * 4, le) : i => dv.getUint32(i * 4, le)) : (sg ? i => dv.getBigInt64(i * 8, le) : i => dv.getBigUint64(i * 8, le));
    num = s === 8 ? i => Number(get(i)) : get;
    show = i => String(get(i));
    if (k === 'M' || k === 'm') {
      const NAT = -(2n ** 63n);
      const per = { D: 864e5, h: 36e5, m: 6e4, s: 1e3, ms: 1, us: 1e-3, ns: 1e-6 }[dt.unit];
      num = k === 'm' ? (i => { const v = get(i); return v === NAT ? NaN : Number(v); }) : undefined;  // no stats or charts for dates
      show = i => {
        const v = get(i);
        if (v === NAT) return 'NaT';
        if (k === 'm') return `${v} ${dt.unit || ''}`.trim();
        if (!per) return String(v);
        const d = new Date(Number(v) * per);
        if (isNaN(d)) return String(v);
        const iso = d.toISOString();
        return dt.unit === 'D' ? iso.slice(0, 10) : iso.replace('.000Z', 'Z');
      };
    }
  } else if (k === 'f') {
    const get = s === 2 ? i => f16(dv.getUint16(i * 2, le)) : s === 4 ? i => dv.getFloat32(i * 4, le) : s === 8 ? i => dv.getFloat64(i * 8, le) : null;
    if (!get) return { n: 0 };
    num = get; show = i => fmt(get(i), s);
  } else if (k === 'c') {
    const h = s / 2, part = h === 4 ? (o => dv.getFloat32(o, le)) : (o => dv.getFloat64(o, le));
    const re = i => part(i * s), im = i => part(i * s + h);
    num = i => Math.hypot(re(i), im(i));
    show = i => { const a = re(i), b = im(i); return `${fmt(a, h)}${b < 0 || Object.is(b, -0) ? '-' : '+'}${fmt(Math.abs(b), h)}j`; };
  } else if (k === 'U') {
    show = i => { let t = ''; for (let j = 0; j < s; j += 4) { const c = dv.getUint32(i * s + j, le); if (!c) break; t += String.fromCodePoint(c > 0x10ffff ? 0xfffd : c); } return t; };
  } else if (k === 'S' || k === 'a') {
    show = i => { let t = ''; for (let j = 0; j < s; j++) { const c = dv.getUint8(i * s + j); if (!c) break; t += c >= 32 && c < 127 ? String.fromCharCode(c) : '\\x' + c.toString(16).padStart(2, '0'); } return "b'" + t + "'"; };
  } else if (k === 'V') {
    show = i => Array.from(buf.subarray(i * s, i * s + Math.min(s, 16)), b => b.toString(16).padStart(2, '0')).join(' ') + (s > 16 ? ' ...' : '');
  } else return { n: 0 };
  return { n, num, show };
}
function f16(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * f * 2 ** -24;
  if (e === 31) return f ? NaN : s * Infinity;
  return s * (1 + f / 1024) * 2 ** (e - 15);
}
function fmt(v, s) {
  if (Number.isNaN(v)) return 'nan';
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toFixed(1).replace(/\.0$/, '.');
  const p = s <= 2 ? 4 : s <= 4 ? 7 : 10;
  const a = Math.abs(v);
  return a !== 0 && (a < 1e-4 || a >= 1e10) ? v.toExponential(p - 1).replace(/\.?0+e/, 'e') : String(Number(v.toPrecision(p)));
}
const fnum = v => !Number.isFinite(v) ? (Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf') : Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : String(Number(v.toPrecision(6)));

/* ---------- .npz (zip) directory ---------- */
async function bytes(file, a, b) { return new Uint8Array(await file.slice(a, b).arrayBuffer()); }
async function zipEntries(file) {
  const tailLen = Math.min(file.size, 65557), tail = await bytes(file, file.size - tailLen, file.size);
  const dv = new DataView(tail.buffer);
  let eo = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break; }
  if (eo < 0) throw new Error('This .npz file has no ZIP directory at its end. It may be cut short.');
  let count = dv.getUint16(eo + 10, true), cdSize = dv.getUint32(eo + 12, true), cdOff = dv.getUint32(eo + 16, true);
  if (count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) {  // zip64
    const lo = eo - 20;
    if (lo >= 0 && dv.getUint32(lo, true) === 0x07064b50) {
      const z64 = Number(dv.getBigUint64(lo + 8, true)), r = await bytes(file, z64, z64 + 56), d = new DataView(r.buffer);
      if (d.getUint32(0, true) === 0x06064b50) { count = Number(d.getBigUint64(32, true)); cdSize = Number(d.getBigUint64(40, true)); cdOff = Number(d.getBigUint64(48, true)); }
    }
  }
  if (cdOff + cdSize > file.size || cdSize > 256 * 1024 * 1024) throw new Error('The ZIP directory of this .npz file points past its end.');
  const cd = await bytes(file, cdOff, cdOff + cdSize), c = new DataView(cd.buffer), out = [];
  for (let p = 0; p + 46 <= cd.length && out.length < Math.max(count, 1) + 1e5;) {
    if (c.getUint32(p, true) !== 0x02014b50) break;
    const method = c.getUint16(p + 10, true), nl = c.getUint16(p + 28, true), xl = c.getUint16(p + 30, true), cl = c.getUint16(p + 32, true);
    let csize = c.getUint32(p + 20, true), usize = c.getUint32(p + 24, true), loc = c.getUint32(p + 42, true);
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nl));
    for (let x = p + 46 + nl; x + 4 <= p + 46 + nl + xl;) {  // zip64 extra field
      const id = c.getUint16(x, true), len = c.getUint16(x + 2, true);
      if (id === 1) { let q = x + 4; if (usize === 0xffffffff) { usize = Number(c.getBigUint64(q, true)); q += 8; } if (csize === 0xffffffff) { csize = Number(c.getBigUint64(q, true)); q += 8; } if (loc === 0xffffffff) loc = Number(c.getBigUint64(q, true)); }
      x += 4 + len;
    }
    if (!name.endsWith('/')) out.push({ name, method, csize, usize, loc });
    p += 46 + nl + xl + cl;
  }
  for (const e of out) {
    const lh = await bytes(file, e.loc, e.loc + 30), l = new DataView(lh.buffer);
    if (l.getUint32(0, true) !== 0x04034b50) throw new Error(`The ZIP entry ${e.name} is damaged.`);
    e.data = e.loc + 30 + l.getUint16(26, true) + l.getUint16(28, true);
  }
  return out;
}
// The first `want` bytes of a zip entry: stored entries are sliced, deflated ones are inflated chunk by chunk.
async function entryBytes(file, e, want) {
  want = Math.min(want, e.usize || want);
  if (e.method === 0) return bytes(file, e.data, e.data + Math.min(want, e.csize));
  if (e.method !== 8) throw new Error(`The entry ${e.name} uses ZIP method ${e.method}; .npz files use stored or deflated entries.`);
  const parts = []; let got = 0, done = false;
  const inf = new Inflate((chunk, final) => { parts.push(chunk); got += chunk.length; if (final) done = true; });
  const STEP = 1 << 20;
  for (let p = 0; p < e.csize && got < want && !done; p += STEP) {
    const end = Math.min(e.csize, p + STEP);
    inf.push(await bytes(file, e.data + p, e.data + end), end >= e.csize);
  }
  const out = new Uint8Array(Math.min(got, want)); let o = 0;
  for (const c of parts) { if (o >= out.length) break; const n = Math.min(c.length, out.length - o); out.set(c.subarray(0, n), o); o += n; }
  return out;
}

/* ---------- state ---------- */
let cur = null;      // { file, arrays: [{ name, hdr, read(want) }] }
let sel = null;      // the open array: { a, hdr, dec, count, nRead, numeric }
let mode = 'line', slice = 0;

async function open(file) {
  if (!file) return;
  if (!file.size) { say('This file is empty (0 bytes).', true); return; }
  const head = await bytes(file, 0, Math.min(file.size, 65536));
  const t0 = performance.now();
  try {
    let arrays;
    if (head[0] === 0x93 && head[1] === 0x4e) {
      const hdr = parseHeader(head);
      arrays = [{ name: file.name.replace(/\.npy$/i, ''), hdr, read: want => bytes(file, hdr.offset, hdr.offset + want) }];
    } else if (head[0] === 0x50 && head[1] === 0x4b) {
      const es = (await zipEntries(file)).filter(e => /\.npy$/i.test(e.name));
      if (!es.length) throw new Error('This ZIP file holds no .npy arrays, so it is not an .npz file.');
      arrays = [];
      for (const e of es) {
        let hdr;
        try { hdr = parseHeader(await entryBytes(file, e, 65536)); } catch (err) { hdr = { error: err.message, shape: [], dtype: { name: '?' } }; }
        arrays.push({ name: e.name.replace(/\.npy$/i, ''), hdr, entry: e, read: async want => (await entryBytes(file, e, hdr.offset + want)).subarray(hdr.offset) });
      }
    } else if (head[0] === 0x80 && head[1] <= 5) {
      throw new Error('This looks like a Python pickle (for example a file from np.save with allow_pickle, or torch.save). The page reads only .npy and .npz arrays. The free NumPy Viewer extension reads PyTorch pickles as data without running them.');
    } else if (String.fromCharCode(...head.subarray(0, 4)) === 'PAR1') {
      throw new Error('This is a Parquet file. Open it in the Parquet Viewer linked below.');
    } else throw new Error('This file is not a .npy or .npz array: it does not start with \\x93NUMPY or PK.');
    cur = { file, arrays };
    $('drop').hidden = true; $('view').hidden = false;
    $('fname').textContent = file.name;
    $('fmeta').textContent = `${size(file.size)}, ${arrays.length} array${arrays.length === 1 ? '' : 's'}`;
    listArrays();
    say('');
    await pick(0);
    const m = $('msg'), warn = m.className === 'warn', note = m.textContent;  // keep a warning or a partial-read note from pick()
    say(`Opened in ${Math.round(performance.now() - t0)} ms.` + (arrays.length > 1 ? ' Click an array in the list to see it.' : '') + (note ? ' ' + note : ''), warn);
  } catch (err) {
    say(err.message || String(err), true);
  }
}

function shapeStr(s) { return '(' + s.join(', ') + (s.length === 1 ? ',' : '') + ')'; }
function count(s) { return s.reduce((a, b) => a * b, 1); }

function listArrays() {
  const tb = $('arrays').tBodies[0]; tb.replaceChildren();
  cur.arrays.forEach((a, i) => {
    const tr = el('tr'); tr.dataset.i = i; tr.tabIndex = 0;
    tr.append(el('td', a.name, 'mono'), el('td', a.hdr.error ? 'unreadable' : a.hdr.dtype.name), el('td', a.hdr.error ? '' : shapeStr(a.hdr.shape), 'mono'),
      el('td', a.hdr.error ? '' : size(count(a.hdr.shape) * (a.hdr.dtype.size || 0))));
    tr.addEventListener('click', () => pick(i));
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } });
    tb.append(tr);
  });
  $('arrBox').hidden = cur.arrays.length < 2;
}

async function pick(i) {
  const a = cur.arrays[i];
  for (const tr of $('arrays').tBodies[0].rows) tr.classList.toggle('on', Number(tr.dataset.i) === i);
  $('aname').textContent = a.name;
  const info = $('ainfo'); info.replaceChildren();
  const row = (k, v) => { const tr = el('tr'); tr.append(el('th', k), el('td', v)); info.append(tr); };
  sel = null; slice = 0;
  if (a.hdr.error) { row('Problem', a.hdr.error); hideData('This array could not be read.'); return; }
  const h = a.hdr, dt = h.dtype, n = count(h.shape), nbytes = n * dt.size;
  row('Shape', shapeStr(h.shape)); row('Type', `${dt.name} (${dt.str})`); row('Values', int(n));
  row('Size', size(nbytes)); row('Order', h.fortran ? 'Fortran (column-major)' : 'C (row-major)');
  if (a.entry) row('In the .npz', a.entry.method === 8 ? `deflated, ${size(a.entry.csize)} packed` : 'stored, not compressed');
  row('.npy version', h.version);
  if (dt.structured) { row('Note', 'Structured (record) arrays are listed but not shown here. The header is: ' + h.header); hideData('Structured arrays are not shown on this page.'); return; }
  if (dt.kind === 'O') { hideData('This array holds Python objects, which numpy stores as a pickle. The page never runs a pickle, so it does not show these values. In numpy, np.load needs allow_pickle=True for this array, which can run code from the file.'); return; }
  if (dt.kind === '?' || !dt.size) { hideData(`The type ${dt.str} is not one this page reads.`); return; }
  say('Reading values...');
  const want = Math.min(nbytes, Math.floor(CAP / dt.size) * dt.size);
  const buf = await a.read(want);
  const dec = decoder(dt, buf);
  const nRead = Math.min(n, dec.n || 0);
  sel = { a, h, dt, dec, n, nRead, numeric: !!dec.num };
  stats();
  $('dataBox').hidden = false;
  const nd = h.shape.length;
  $('tabHeat').disabled = nd < 2 || !sel.numeric;
  $('tabLine').disabled = $('tabHist').disabled = !sel.numeric;
  mode = !sel.numeric ? 'none' : nd >= 2 ? 'heat' : 'line';
  const lead = nd > 2 ? count(h.shape.slice(0, -2)) : 1;
  $('sliceBox').hidden = !(nd > 2);
  $('slice').max = String(Math.max(0, lead - 1)); $('slice').value = '0';
  $('sliceOf').textContent = nd === 3 ? `of ${int(lead)} along axis 0` : `of ${int(lead)} (axes 0 to ${nd - 3} counted as one)`;
  $('chartBox').hidden = !sel.numeric;
  table();
  draw();
  say(nRead < n ? `This array is ${size(nbytes)}. Stats, chart and rows cover its first ${int(nRead)} of ${int(n)} values (${size(want)}). The free NumPy Viewer for VS Code reads every value.` : '');
}

function hideData(t) { $('dataBox').hidden = true; $('chartBox').hidden = true; $('stats').replaceChildren(); say(t, true); }

/* ---------- stats ---------- */
function stats() {
  const box = $('stats'); box.replaceChildren();
  if (!sel.numeric) { box.append(el('p', 'Text values: no number stats.', 'small mut')); return; }
  const { dec, nRead } = sel;
  let mn = Infinity, mx = -Infinity, mean = 0, m2 = 0, c = 0, nan = 0, inf = 0, zero = 0;
  for (let i = 0; i < nRead; i++) {
    const v = dec.num(i);
    if (Number.isNaN(v)) { nan++; continue; }
    if (!Number.isFinite(v)) { inf++; continue; }
    if (v < mn) mn = v; if (v > mx) mx = v;
    if (v === 0) zero++;
    c++; const d = v - mean; mean += d / c; m2 += d * (v - mean);  // Welford
  }
  sel.min = mn; sel.max = mx;
  const cells = [['min', c ? fnum(mn) : '-'], ['max', c ? fnum(mx) : '-'], ['mean', c ? fnum(mean) : '-'], ['std', c ? fnum(Math.sqrt(m2 / c)) : '-'],
    ['zeros', int(zero)], ['NaN', int(nan)], ['Inf', int(inf)], ['values read', int(nRead)]];
  if (sel.dt.kind === 'c') cells.unshift(['of', '|z|']);
  for (const [k, v] of cells) { const d = el('div', null, 'stat'); d.append(el('span', k, 'k'), el('span', v, 'v mono')); box.append(d); }
}

/* ---------- first rows ---------- */
function strides(shape, fortran) {
  const s = new Array(shape.length); let m = 1;
  if (fortran) for (let i = 0; i < shape.length; i++) { s[i] = m; m *= shape[i]; }
  else for (let i = shape.length - 1; i >= 0; i--) { s[i] = m; m *= shape[i]; }
  return s;
}
function unravel(k, shape) { const idx = new Array(shape.length); for (let i = shape.length - 1; i >= 0; i--) { idx[i] = k % shape[i]; k = Math.floor(k / shape[i]); } return idx; }
function cell(flat) { return flat < sel.nRead ? sel.dec.show(flat) : '(not read)'; }

function table() {
  const t = $('rows'); t.replaceChildren();
  const { h } = sel, shape = h.shape, nd = shape.length, st = strides(shape, h.fortran);
  const thead = el('thead'), hr = el('tr'), tb = el('tbody');
  let note = '';
  if (nd === 0) { hr.append(el('th', 'value')); tb.append(trOf([cell(0)])); }
  else if (nd === 1) {
    hr.append(el('th', 'index', 'ix'), el('th', 'value'));
    const n = Math.min(shape[0], ROWS);
    for (let i = 0; i < n; i++) tb.append(trOf([String(i), cell(i * st[0])], true));
    if (shape[0] > n) note = `First ${int(n)} of ${int(shape[0])} values.`;
  } else {
    const R = count(shape.slice(0, -1)), C = shape[nd - 1], nr = Math.min(R, ROWS), nc = Math.min(C, COLS);
    hr.append(el('th', nd === 2 ? 'row' : 'index', 'ix'));
    for (let j = 0; j < nc; j++) hr.append(el('th', String(j)));
    for (let r = 0; r < nr; r++) {
      const lead = unravel(r, shape.slice(0, -1));
      let base = 0; for (let d = 0; d < nd - 1; d++) base += lead[d] * st[d];
      const vals = [nd === 2 ? String(r) : '[' + lead.join(', ') + ', :]'];
      for (let j = 0; j < nc; j++) vals.push(cell(base + j * st[nd - 1]));
      tb.append(trOf(vals, true));
    }
    note = `${nd === 2 ? 'Rows' : 'Rows of the last axis'}: first ${int(nr)} of ${int(R)}, columns: first ${int(nc)} of ${int(C)}.`;
  }
  thead.append(hr); t.append(thead, tb);
  $('rowsNote').textContent = note;
}
function trOf(vals, first) { const tr = el('tr'); vals.forEach((v, i) => tr.append(el(i === 0 && first ? 'th' : 'td', v, i === 0 && first ? 'ix mono' : 'mono'))); return tr; }

/* ---------- charts (canvas; one series, so no legend box; a table view is below) ---------- */
const PAL = {
  light: { surf: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', grid: '#e6e5e0', s1: '#2a78d6', mid: '#f0efec',
    seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'], red: ['#fbd6d4', '#f2a19f', '#e34948', '#b52b2b'] },
  dark: { surf: '#1a1a19', ink: '#f0efec', ink2: '#c3c2b7', grid: '#2e2e2c', s1: '#3987e5', mid: '#383835',
    seq: ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'], red: ['#5c1f1f', '#8f2c2c', '#e66767', '#f2a19f'] },
};
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t)); const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]); return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * f));
}

let geom = null;
function setup(cv) {
  const w = cv.parentElement.clientWidth, h = mode === 'heat' ? Math.min(Math.max(260, w * 0.62), 520) : 300, dpr = devicePixelRatio || 1;
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g, w, h };
}
// Rounded tick values (1, 2 or 5 times a power of ten) that cover lo..hi, and the gutter the widest label needs.
function ticks(lo, hi) {
  if (hi <= lo) hi = lo + 1;
  const raw = (hi - lo) / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, out = [];
  for (let v = a; v <= b + step / 2 && out.length < 12; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}
const tickText = v => Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(Number(v.toPrecision(6)));
function gutter(g, ts) { g.font = '12px system-ui, sans-serif'; return Math.ceil(Math.max(...ts.map(v => g.measureText(tickText(v)).width))) + 14; }
function axisY(g, P, x0, y0, y1, ts, w) {
  const lo = ts[0], hi = ts[ts.length - 1];
  g.font = '12px system-ui, sans-serif'; g.fillStyle = P.ink2; g.strokeStyle = P.grid; g.lineWidth = 1; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of ts) {
    const y = y0 - (v - lo) / (hi - lo) * (y0 - y1);
    g.beginPath(); g.moveTo(x0, Math.round(y) + .5); g.lineTo(w - 8, Math.round(y) + .5); g.stroke();
    g.fillText(tickText(v), x0 - 6, y);
  }
}

function draw() {
  for (const b of document.querySelectorAll('#chartTabs button')) b.setAttribute('aria-pressed', String(b.dataset.m === mode));
  $('legend').replaceChildren(); $('tip').hidden = true; geom = null;
  if (!sel || !sel.numeric || $('chartBox').hidden) return;
  const P = isDark() ? PAL.dark : PAL.light, cv = $('chart'), { g, w, h } = setup(cv);
  g.fillStyle = P.surf; g.fillRect(0, 0, w, h);
  const { dec, nRead } = sel;
  if (!nRead || !Number.isFinite(sel.min)) { g.fillStyle = P.ink2; g.font = '14px system-ui'; g.fillText('No finite values to draw.', 20, 30); return; }
  if (mode === 'line') {
    const ts = ticks(sel.min === sel.max ? sel.min - 1 : sel.min, sel.min === sel.max ? sel.max + 1 : sel.max), lo = ts[0], hi = ts[ts.length - 1];
    const x0 = gutter(g, ts), x1 = w - 10, y0 = h - 28, y1 = 12, W = Math.max(1, Math.floor(x1 - x0));
    axisY(g, P, x0, y0, y1, ts, w);
    const Y = v => y0 - (v - lo) / (hi - lo) * (y0 - y1);
    const cols = Math.min(W, nRead), per = nRead / cols, mins = new Float64Array(cols), maxs = new Float64Array(cols), means = new Float64Array(cols);
    for (let c = 0; c < cols; c++) {
      const a = Math.floor(c * per), b = Math.max(a + 1, Math.floor((c + 1) * per));
      let mn = Infinity, mx = -Infinity, s = 0, k = 0;
      for (let i = a; i < b; i++) { const v = dec.num(i); if (!Number.isFinite(v)) continue; if (v < mn) mn = v; if (v > mx) mx = v; s += v; k++; }
      mins[c] = k ? mn : NaN; maxs[c] = k ? mx : NaN; means[c] = k ? s / k : NaN;
    }
    const X = c => x0 + (cols === 1 ? W / 2 : c * W / (cols - 1));
    if (per > 1) {  // min to max band behind the mean line
      g.fillStyle = P.s1; g.globalAlpha = 0.28;
      for (let c = 0; c < cols; c++) if (!Number.isNaN(mins[c])) g.fillRect(X(c) - 0.5, Y(maxs[c]), 1.5, Math.max(1, Y(mins[c]) - Y(maxs[c])));
      g.globalAlpha = 1;
    }
    g.strokeStyle = P.s1; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); let pen = false;
    for (let c = 0; c < cols; c++) { const v = means[c]; if (Number.isNaN(v)) { pen = false; continue; } pen ? g.lineTo(X(c), Y(v)) : g.moveTo(X(c), Y(v)); pen = true; }
    g.stroke();
    g.fillStyle = P.ink2; g.font = '12px system-ui, sans-serif'; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText('0', x0, h - 8);
    g.textAlign = 'right'; g.fillText(int(nRead - 1), x1, h - 8); g.textAlign = 'center';
    g.fillText(sel.h.shape.length > 1 ? `flat index (${sel.h.fortran ? 'Fortran' : 'C'} order)` : 'index', (x0 + x1) / 2, h - 8);
    geom = { kind: 'line', x0, W, cols, per, mins, maxs, means, X, Y, y0, y1 };
    $('chartCap').textContent = per > 1 ? `Values in file order. Each pixel column covers about ${int(Math.round(per))} values: the line is their mean, the band their min to max.` : 'Values in file order.';
  } else if (mode === 'hist') {
    const B = 40, y0 = h - 28, y1 = 12, lo = sel.min, hi = sel.max === sel.min ? sel.min + 1 : sel.max, bins = new Float64Array(B);
    for (let i = 0; i < nRead; i++) { const v = dec.num(i); if (!Number.isFinite(v)) continue; bins[Math.min(B - 1, Math.floor((v - lo) / (hi - lo) * B))]++; }
    let top0 = 0; for (const b of bins) top0 = Math.max(top0, b);
    const ts = ticks(0, Math.max(4, top0)).map(Math.round), top = ts[ts.length - 1], x0 = gutter(g, ts), x1 = w - 10;
    axisY(g, P, x0, y0, y1, ts, w);
    const bw = (x1 - x0) / B; g.fillStyle = P.s1;
    for (let b = 0; b < B; b++) {
      if (!bins[b]) continue;
      const bh = Math.max(1, bins[b] / top * (y0 - y1)), x = x0 + b * bw + 1, ww = Math.max(1, bw - 2), r = Math.min(4, ww / 2, bh);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 - bh + r); g.quadraticCurveTo(x, y0 - bh, x + r, y0 - bh); g.lineTo(x + ww - r, y0 - bh);
      g.quadraticCurveTo(x + ww, y0 - bh, x + ww, y0 - bh + r); g.lineTo(x + ww, y0); g.closePath(); g.fill();
    }
    g.fillStyle = P.ink2; g.font = '12px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(fnum(lo), x0, h - 8); g.textAlign = 'right'; g.fillText(fnum(hi), x1, h - 8);
    g.textAlign = 'center'; g.fillText('value', (x0 + x1) / 2, h - 8);
    geom = { kind: 'hist', x0, bw, B, bins, lo, hi, y0 };
    $('chartCap').textContent = `How many values fall in each of ${B} equal bins from min to max (NaN and Inf left out).`;
  } else if (mode === 'heat') {
    const shape = sel.h.shape, nd = shape.length, R = shape[nd - 2], C = shape[nd - 1], st = strides(shape, sel.h.fortran);
    const lead = nd > 2 ? unravel(slice, shape.slice(0, -2)) : [];
    let base = 0; for (let d = 0; d < lead.length; d++) base += lead[d] * st[d];
    const rs = Math.ceil(R / HMAX), cs = Math.ceil(C / HMAX), hr = Math.ceil(R / rs), hc = Math.ceil(C / cs), m = new Float64Array(hr * hc).fill(NaN);
    let lo = Infinity, hi = -Infinity, missing = false;
    for (let r = 0; r < hr; r++) for (let c = 0; c < hc; c++) {
      let s = 0, k = 0;
      for (let i = r * rs; i < Math.min(R, (r + 1) * rs); i++) for (let j = c * cs; j < Math.min(C, (c + 1) * cs); j++) {
        const f = base + i * st[nd - 2] + j * st[nd - 1]; if (f >= sel.nRead) { missing = true; continue; }
        const v = dec.num(f); if (Number.isFinite(v)) { s += v; k++; }
      }
      if (k) { const v = s / k; m[r * hc + c] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (!Number.isFinite(lo)) { g.fillStyle = P.ink2; g.font = '14px system-ui'; g.fillText('No finite values in this slice (or it was not read).', 20, 30); return; }
    const div = lo < 0 && hi > 0, M = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    const blue = P.seq.slice(2), redArm = P.red;  // diverging: blue arm, gray midpoint, red arm
    const color = v => div ? (v < 0 ? ramp([P.mid, ...blue.slice(0, 4)], -v / M) : ramp([P.mid, ...redArm], v / M)) : ramp(P.seq, hi === lo ? 0.5 : (v - lo) / (hi - lo));
    const off = document.createElement('canvas'); off.width = hc; off.height = hr;
    const og = off.getContext('2d'), img = og.createImageData(hc, hr);
    for (let i = 0; i < m.length; i++) { const v = m[i], o = i * 4; if (Number.isNaN(v)) { img.data.set([...hex(P.surf), 255], o); continue; } const c = color(v); img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255; }
    og.putImageData(img, 0, 0);
    const top = 8, left = 50, aw = w - left - 10, ah = h - top - 30, sc = Math.min(aw / hc, ah / hr), dw = hc * sc, dh = hr * sc, dx = left + (aw - dw) / 2;
    g.imageSmoothingEnabled = false; g.drawImage(off, dx, top, dw, dh);
    g.fillStyle = P.ink2; g.font = '12px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('0', dx - 6, top); g.textBaseline = 'bottom'; g.fillText(int(R - 1), dx - 6, top + dh);
    g.textBaseline = 'top'; g.textAlign = 'left'; g.fillText('0', dx, top + dh + 6); g.textAlign = 'right'; g.fillText(int(C - 1), dx + dw, top + dh + 6);
    g.textAlign = 'center'; g.fillText(`columns (axis ${nd - 1})`, dx + dw / 2, top + dh + 6);
    geom = { kind: 'heat', dx, top, dw, dh, hr, hc, rs, cs, m, R, C };
    // legend: the color scale with its ends (and 0 for the diverging scale)
    const lg = $('legend'), bar = document.createElement('canvas'), lw = 220; bar.width = lw; bar.height = 10; bar.className = 'lgbar';
    const bg = bar.getContext('2d');
    for (let x = 0; x < lw; x++) { const v = div ? -M + 2 * M * x / (lw - 1) : lo + (hi - lo) * x / (lw - 1); const c = color(v); bg.fillStyle = `rgb(${c})`; bg.fillRect(x, 0, 1, 10); }
    lg.append(el('span', fnum(div ? -M : lo), 'mono small'), bar, el('span', fnum(div ? M : hi), 'mono small'));
    if (div) lg.append(el('span', 'gray = 0, blue below, red above', 'small mut'));
    $('chartCap').textContent = (nd > 2 ? `Showing ${sel.a.name}[${lead.join(', ')}]. ` : '') + `Rows (axis ${nd - 2}) top to bottom, columns left to right.` +
      (rs > 1 || cs > 1 ? ` Each cell is the mean of a ${rs} x ${cs} block.` : '') + (missing ? ' Empty cells were past the part of the file that was read.' : '');
  }
}

/* ---------- hover tooltip ---------- */
$('chart').addEventListener('mousemove', e => {
  const tip = $('tip'); if (!geom) { tip.hidden = true; return; }
  const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let text = null;
  if (geom.kind === 'line') {
    const c = Math.round((x - geom.x0) / geom.W * (geom.cols - 1));
    if (c >= 0 && c < geom.cols && !Number.isNaN(geom.means[c])) {
      const a = Math.floor(c * geom.per), b = Math.max(a + 1, Math.floor((c + 1) * geom.per)) - 1;
      text = geom.per > 1 ? `values ${int(a)} to ${int(b)}\nmean ${fnum(geom.means[c])}\nmin ${fnum(geom.mins[c])}, max ${fnum(geom.maxs[c])}` : `index ${int(a)}\nvalue ${fnum(geom.means[c])}`;
      cross(geom.X(c), geom.y1, geom.y0);
    }
  } else if (geom.kind === 'hist') {
    const b = Math.floor((x - geom.x0) / geom.bw);
    if (b >= 0 && b < geom.B) { const w = (geom.hi - geom.lo) / geom.B; text = `${fnum(geom.lo + b * w)} to ${fnum(geom.lo + (b + 1) * w)}\n${int(geom.bins[b])} values`; }
  } else if (geom.kind === 'heat') {
    const c = Math.floor((x - geom.dx) / geom.dw * geom.hc), rr = Math.floor((y - geom.top) / geom.dh * geom.hr);
    if (c >= 0 && c < geom.hc && rr >= 0 && rr < geom.hr) {
      const v = geom.m[rr * geom.hc + c], blk = geom.rs > 1 || geom.cs > 1;
      text = (blk ? `rows ${int(rr * geom.rs)} to ${int(Math.min(geom.R, (rr + 1) * geom.rs) - 1)}, columns ${int(c * geom.cs)} to ${int(Math.min(geom.C, (c + 1) * geom.cs) - 1)}\nmean ` : `row ${int(rr)}, column ${int(c)}\nvalue `) + (Number.isNaN(v) ? 'not read' : fnum(v));
    }
  }
  if (!text) { tip.hidden = true; $('cross').hidden = true; return; }
  tip.textContent = text; tip.hidden = false;
  const bw = e.target.parentElement.clientWidth, tw = tip.offsetWidth;
  tip.style.left = Math.min(bw - tw - 4, x + 14) + 'px'; tip.style.top = Math.max(0, y - 10) + 'px';
});
function cross(x, y1, y0) { const c = $('cross'); c.hidden = false; c.style.left = Math.round(x) + 'px'; c.style.top = y1 + 'px'; c.style.height = (y0 - y1) + 'px'; }
$('chart').addEventListener('mouseleave', () => { $('tip').hidden = true; $('cross').hidden = true; });

/* ---------- wiring ---------- */
for (const b of document.querySelectorAll('#chartTabs button')) b.addEventListener('click', () => { mode = b.dataset.m; $('cross').hidden = true; draw(); });
$('slice').addEventListener('change', () => { const v = Math.max(0, Math.min(Number($('slice').max), Math.floor(Number($('slice').value) || 0))); $('slice').value = String(v); slice = v; if (mode !== 'heat' && !$('tabHeat').disabled) mode = 'heat'; draw(); });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 120); });
$('pick').addEventListener('change', e => open(e.target.files[0]));
$('pick2').addEventListener('change', e => open(e.target.files[0]));
$('sample').addEventListener('click', () => {
  const go = () => {
    const s = self.ZOVO_SAMPLE, bin = atob(s.b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    open(new File([u], s.name, { type: 'application/zip' }));
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
