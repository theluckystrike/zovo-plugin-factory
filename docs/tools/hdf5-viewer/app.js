/* Zovo HDF5 and NetCDF Viewer Online (WEB4, wave18). The file is read in this tab and never sent anywhere: the page
   CSP sets connect-src 'none'. A background worker (worker.js) reads it with h5wasm 0.10.3 from cdn.jsdelivr.net
   (pinned, its sha384 from the import map below is checked before it runs) and only the bytes it needs. The page
   shows the group tree, attributes, the first values and a line chart or heatmap. Every name and value is written
   as text, never as HTML. */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAXROWS = 5000;  // tree rows drawn at once (the filter finds the rest)

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
const fnum = v => !Number.isFinite(v) ? (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Inf' : '-Inf') : Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : String(Number(v.toPrecision(6)));
const ord = n => int(n) + ([11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
const shapeStr = s => !s ? 'null (no values)' : s.length ? s.map(int).join(' x ') : 'scalar';

/* ---------- the worker ---------- */
const lock = JSON.parse(document.querySelector('script[type="importmap"]').textContent);
const LIB = lock.imports.h5wasm, SRI = lock.integrity[LIB];
let worker = null, ready = null, seq = 0, slowT = 0;
const pending = new Map();
function start() {
  if (ready) return ready;
  worker = new Worker('worker.js');
  worker.onmessage = e => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); e.data.ok ? p.ok(e.data.res) : p.no(new Error(e.data.err)); };
  worker.onerror = e => { e.preventDefault(); for (const p of pending.values()) p.no(new Error('The reader stopped: ' + (e.message || 'unknown error'))); pending.clear(); };
  ready = call('load', { url: LIB, integrity: SRI }).catch(err => { ready = null; throw new Error(/integrity|digest/i.test(err.message) ? 'The HDF5 reader file did not match its pinned hash, so it was not run.' : err.message.startsWith('The HDF5') ? err.message : 'The HDF5 reader could not be loaded, or it did not match its pinned hash and was not run. Check your connection and try again; after one visit it works offline.'); });
  return ready;
}
function call(op, data = {}) {
  return new Promise((ok, no) => {
    const id = ++seq; pending.set(id, { ok, no }); worker.postMessage({ id, op, ...data });
    clearTimeout(slowT); slowT = setTimeout(() => { if (pending.size) $('stop').hidden = false; }, 1500);
  }).finally(() => { if (!pending.size) { clearTimeout(slowT); $('stop').hidden = true; } });
}
$('stop').addEventListener('click', () => {  // a very slow read: stop the worker, start a fresh one with the same file
  worker.terminate(); worker = null; ready = null;
  for (const p of pending.values()) p.no(new Error('stopped'));
  pending.clear(); $('stop').hidden = true;
  if (cur) { const f = cur.file; say('Stopped. Opening the file again...'); open(f, true); }
});

/* ---------- state ---------- */
let cur = null;   // { file, info: open result, sel: path }
let shown = null; // the detail result on screen
let lead = [], cfOn = true;

async function open(file, again) {
  if (!file) return;
  if (!file.size) { say('This file is empty (0 bytes).', true); return; }
  say(ready ? 'Opening ' + file.name + '...' : 'Loading the HDF5 reader, then opening ' + file.name + '...');
  const t0 = performance.now();
  try {
    await start();
    const info = await call('open', { file });
    cur = { file, info, sel: '/' };
    $('fname').textContent = file.name;
    const pl = (n, w) => `${int(n)} ${w}${n === 1 ? '' : 's'}`;
    $('fmeta').textContent = `${size(file.size)} · ${info.fmt} · ` + (info.nc3 ? `${pl(info.datasets, 'variable')}, ${pl(info.dims.length, 'dimension')}` : `${pl(info.groups, 'group')}, ${pl(info.datasets, 'dataset')}`);
    $('view').hidden = false; $('filter').value = '';
    tree();
    await select('/');
    if (info.short) say(`Opened, but the file is cut short: ${int(info.short)} bytes are missing at the end, so some values cannot be read. Copy or download it again.`, true);
    else if (!again) say(`Opened in ${int(Math.round(performance.now() - t0))} ms. Click a dataset to see its values.`);
  } catch (err) {
    if (err.message === 'stopped') return;
    say(err.message, true);
  }
}

/* ---------- tree ---------- */
const KINDS = { g: 'group', d: 'dataset', dim: 'dimension', l: 'link', x: 'external link', t: 'datatype', '?': 'object' };
function tree() {
  const tb = $('tree').tBodies[0], q = $('filter').value.trim().toLowerCase(), out = [];
  const nodes = cur.info.nodes;
  const rootRow = { p: '/', n: '/ (file)', d: -1, k: 'g' };
  for (const n of q ? nodes.filter(x => x.p.toLowerCase().includes(q)) : [rootRow, ...nodes]) { if (out.length >= MAXROWS) break; out.push(n); }
  const rows = out.map(n => {
    const tr = el('tr'); tr.tabIndex = 0; tr.dataset.p = n.p;
    const name = el('td', q ? n.p : n.n, 'mono'); name.style.setProperty('--d', q ? 0 : n.d + 1);
    name.prepend(el('span', n.k === 'g' ? '▸ ' : n.k === 'dim' ? '↔ ' : n.k === 'd' ? (n.scale ? '◆ ' : '▪ ') : '↪ ', 'ico'));
    tr.append(name, el('td', n.shape ? shapeStr(n.shape) : n.k === 'g' ? '' : '', 'mut'), el('td', n.t || KINDS[n.k], 'mut'));
    tr.title = n.p + ' (' + (n.k === 'd' && n.scale ? 'coordinate' : KINDS[n.k]) + ')';
    if (cur.sel === n.p) tr.className = 'on';
    return tr;
  });
  tb.replaceChildren(...rows);
  const total = q ? nodes.filter(x => x.p.toLowerCase().includes(q)).length : nodes.length;
  $('treeNote').textContent = (q ? `${int(total)} of ${int(nodes.length)} objects match.` : `${int(nodes.length)} objects.`) + (out.length < (q ? total : total + 1) ? ` Showing the first ${int(MAXROWS)}; type in the filter to find the others.` : '') + (cur.info.more ? ' The file has more than 20,000 objects; only the first 20,000 are listed.' : '');
}
$('filter').addEventListener('input', () => cur && tree());
$('tree').addEventListener('click', e => { const tr = e.target.closest('tr'); if (tr) select(tr.dataset.p); });
$('tree').addEventListener('keydown', e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(tr.dataset.p); }
  else if (e.key === 'ArrowDown' && tr.nextElementSibling) { e.preventDefault(); tr.nextElementSibling.focus(); }
  else if (e.key === 'ArrowUp' && tr.previousElementSibling) { e.preventDefault(); tr.previousElementSibling.focus(); }
});

/* ---------- one object ---------- */
async function select(path, keepLead) {
  if (!cur) return;
  const node = cur.info.nodes.find(n => n.p === path);
  if (!keepLead) lead = node && node.shape && node.shape.length > 2 ? new Array(node.shape.length - 2).fill(0) : [];
  cur.sel = path;
  for (const tr of $('tree').tBodies[0].rows) tr.classList.toggle('on', tr.dataset.p === path);
  $('oname').textContent = path === '/' ? cur.file.name : path;
  try {
    const r = await call('detail', { path, lead, cf: cfOn });
    shown = r; info(r); attrs(); values();
  } catch (err) {
    if (err.message === 'stopped') return;
    shown = null; $('valBox').hidden = true; say(err.message, true);
  }
}
function kv(rows) {
  $('oinfo').replaceChildren(...rows.filter(r => r[1] !== null && r[1] !== undefined && r[1] !== '').map(([k, v]) => { const tr = el('tr'); tr.append(el('th', k), el('td', String(v), 'mono')); return tr; }));
}
function info(r) {
  const i = r.info, node = cur.info.nodes.find(n => n.p === i.path) || {};
  if (i.path === '/') {
    kv([['Format', cur.info.fmt + (cur.info.sb !== undefined ? ` (superblock version ${cur.info.sb})` : '')], ['Size', size(cur.file.size) + ` (${int(cur.file.size)} bytes)`],
      ['Groups', cur.info.nc3 ? null : int(cur.info.groups)], [cur.info.nc3 ? 'Variables' : 'Datasets', int(cur.info.datasets)],
      ['Dimensions', cur.info.dims ? cur.info.dims.map(d => d[0] + ' = ' + d[1]).join(', ') : null]]);
    return;
  }
  if (i.kind === 'g') { kv([['Kind', 'group'], ['Path', i.path], ['Members', int(i.children || 0)]]); return; }
  if (i.kind !== 'd') { kv([['Kind', KINDS[node.k] || 'object'], ['Path', i.path], ['Points to', node.t && node.t.includes(' to ') ? node.t.split(' to ').slice(1).join(' to ') : null], ['Length', i.dimOnly != null ? int(i.dimOnly) : null]]); return; }
  const dims = i.shape && i.shape.length && i.dims && i.dims.some(Boolean) ? i.shape.map((n, k) => (i.dims[k] || 'dim ' + k) + ' = ' + int(n)).join(', ') : null;
  const bytes = i.shape ? i.shape.reduce((a, b) => a * b, 1) * i.esize : 0;
  kv([['Kind', node.k === 'dim' ? 'dimension (no values of its own)' : node.scale ? 'coordinate (dimension scale)' : 'dataset'], ['Type', i.type], ['Shape', shapeStr(i.shape)], ['Dimensions', dims],
    ['Max shape', i.maxshape && i.shape && i.maxshape.some((m, k) => m !== i.shape[k]) ? i.maxshape.map(m => m === null || m < 0 || m > 1e18 ? 'unlimited' : int(m)).join(' x ') : (i.unlimited ? 'first dimension unlimited' : null)],
    ['Chunks', i.chunks ? i.chunks.map(int).join(' x ') : null], ['Compression', i.filters && i.filters.length ? i.filters.join(', ') : null],
    ['Size in memory', bytes ? size(bytes) : null], ['Virtual', i.virtual ? `made of ${i.virtual} source datasets` : null]]);
}
function attrs() {
  const list = shown.info.attrs || [], all = $('internal').checked, tb = $('attrs').tBodies[0];
  const vis = list.filter(a => all || !a[3]);
  tb.replaceChildren(...vis.map(a => { const tr = el('tr'); tr.append(el('td', a[0], 'mono'), el('td', a[1], 'mut'), el('td', a[2], 'mono wrap')); return tr; }));
  if (!vis.length) { const tr = el('tr'); tr.append(el('td', list.length ? `${list.length} internal attributes are hidden.` : 'No attributes.', 'mut')); tr.firstChild.colSpan = 3; tb.append(tr); }
  $('attrHead').textContent = `Attributes (${vis.length}${list.length > vis.length ? ` of ${list.length}` : ''})`;
}
$('internal').addEventListener('change', () => shown && attrs());

/* ---------- values: slice box, stats, chart, first values ---------- */
function values() {
  const r = shown, i = r.info;
  $('valBox').hidden = i.kind !== 'd';
  if (i.kind !== 'd') { if (cur.sel !== '/') say(''); return; }
  const nd = i.shape ? i.shape.length : 0;
  // slice box for the leading axes
  const lb = $('leadBox'); lb.replaceChildren();
  if (nd > 2) {
    lb.append(el('span', 'Slice', 'mut'));
    for (let k = 0; k < nd - 2; k++) {
      const id = 'lead' + k, lab = el('label', (i.dims && i.dims[k] || 'axis ' + k) + ' '), inp = el('input');
      lab.htmlFor = id; inp.id = id; inp.type = 'number'; inp.min = '0'; inp.max = String(i.shape[k] - 1); inp.step = '1'; inp.value = String(lead[k] || 0);
      inp.addEventListener('change', () => { lead[k] = Math.max(0, Math.min(i.shape[k] - 1, Math.round(+inp.value) || 0)); inp.value = lead[k]; select(cur.sel, true); });
      lb.append(lab, inp, el('span', `of ${int(i.shape[k])}`, 'mut small'));
    }
  }
  $('cfBox').hidden = !r.cf && !(i.attrs || []).some(a => ['scale_factor', 'add_offset', '_FillValue', 'missing_value'].includes(a[0]));
  $('sliceBar').hidden = nd <= 2 && $('cfBox').hidden;
  // messages
  const note = r.note || r.err || '';
  if (note) say(note, !!r.err); else say(r.ms != null ? `Read in ${int(r.ms)} ms.` : '');
  // first values
  const t = $('rows'); t.replaceChildren();
  if (r.scalar !== undefined) {
    t.append(el('tbody')); const tr = el('tr'); tr.append(el('th', 'value', 'ix'), el('td', r.scalar, 'mono wrap')); t.tBodies[0].append(tr);
    $('rowsNote').textContent = 'A scalar dataset: one value.';
  } else if (r.table) {
    const T = r.table, head = el('thead'), hr = el('tr');
    const colName = nd === 1 ? [i.dims && i.dims[0] ? i.dims[0] : 'index', 'value'] : null;
    if (nd === 1) hr.append(el('th', colName[0], 'ix'), el('th', colName[1]));
    else { hr.append(el('th', '', 'ix')); for (let c = 0; c < T.C; c++) hr.append(el('th', String(c), 'mono')); }
    head.append(hr); t.append(head);
    const body = el('tbody');
    T.rows.forEach((row, rr) => { const tr = el('tr'); tr.append(el('th', String(rr), 'ix mono')); for (const v of row) tr.append(el('td', v, v === 'fill' ? 'nul mono' : 'mono')); body.append(tr); });
    t.append(body);
    const where = nd > 2 ? ` of slice [${lead.join(', ')}, :, :]` : '';
    $('rowsNote').textContent = nd === 1 ? `The first ${int(T.R)} of ${int(T.totalR)} values.` : `Rows 0 to ${int(T.R - 1)} of ${int(T.totalR)} and columns 0 to ${int(T.C - 1)} of ${int(T.totalC)}${where}.` + (r.cfScaled ? ' Values are decoded with scale_factor and add_offset.' : '') + (r.cf ? ' "fill" marks _FillValue or missing_value.' : '');
  } else $('rowsNote').textContent = '';
  stats(); draw();
}
function stats() {
  const box = $('stats'); box.replaceChildren();
  const c = shown && shown.chart; if (!c) return;
  let mn = Infinity, mx = -Infinity, s = 0, s2 = 0, k = 0, nan = 0;
  for (const v of c.v) { if (Number.isNaN(v)) { nan++; continue; } if (!Number.isFinite(v)) continue; if (v < mn) mn = v; if (v > mx) mx = v; s += v; s2 += v * v; k++; }
  c.min = k ? mn : NaN; c.max = k ? mx : NaN;
  const mean = k ? s / k : NaN, sd = k ? Math.sqrt(Math.max(0, s2 / k - mean * mean)) : NaN;
  const tile = (key, v) => { const d = el('div', null, 'stat'); d.append(el('span', key, 'k'), el('span', v, 'v mono')); d.title = key + ': ' + v; box.append(d); };
  tile('min', fnum(c.min)); tile('max', fnum(c.max)); tile('mean', fnum(mean)); tile('std', fnum(sd));
  tile('values used', int(c.v.length)); tile(shown.cf ? 'fill' : 'NaN', int(shown.cf ? c.fills : nan));
  if (shown.cf && nan - c.fills > 0) tile('NaN', int(nan - c.fills));
}
$('cf').addEventListener('change', () => { cfOn = $('cf').checked; if (cur) select(cur.sel, true); });

/* ---------- chart (same palette and layout as the NPY viewer) ---------- */
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
function ticks(lo, hi) {
  if (hi <= lo) hi = lo + 1;
  const raw = (hi - lo) / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, out = [];
  for (let v = a; v <= b + step / 2 && out.length < 12; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}
const tickText = v => Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(Number(v.toPrecision(6)));
function gutter(g, ts) { g.font = '12px system-ui, sans-serif'; return Math.ceil(Math.max(...ts.map(v => g.measureText(tickText(v)).width))) + 14; }
let geom = null;
function draw() {
  $('legend').replaceChildren(); $('tip').hidden = true; geom = null;
  const c = shown && shown.chart, wrap = $('chartWrap');
  wrap.hidden = !c; $('chartCap').textContent = '';
  if (!c) return;
  const P = isDark() ? PAL.dark : PAL.light, cv = $('chart'), w = wrap.clientWidth || 600;
  const h = c.kind === 'heat' ? Math.min(Math.max(260, w * c.hr / Math.max(1, c.hc) + 40), 560) : 280, dpr = devicePixelRatio || 1;
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = P.surf; g.fillRect(0, 0, w, h);
  if (!Number.isFinite(c.min)) { g.fillStyle = P.ink2; g.font = '14px system-ui'; g.fillText('No finite values to draw.', 20, 30); return; }
  const i = shown.info;
  if (c.kind === 'line') {
    const ts = ticks(c.min === c.max ? c.min - 1 : c.min, c.min === c.max ? c.max + 1 : c.max), lo = ts[0], hi = ts[ts.length - 1];
    const x0 = gutter(g, ts), x1 = w - 10, y0 = h - 28, y1 = 12, n = c.v.length;
    g.font = '12px system-ui, sans-serif'; g.fillStyle = P.ink2; g.strokeStyle = P.grid; g.lineWidth = 1; g.textAlign = 'right'; g.textBaseline = 'middle';
    const Y = v => y0 - (v - lo) / (hi - lo) * (y0 - y1);
    for (const v of ts) { const y = Y(v); g.beginPath(); g.moveTo(x0, Math.round(y) + .5); g.lineTo(w - 8, Math.round(y) + .5); g.stroke(); g.fillText(tickText(v), x0 - 6, y); }
    const X = k => x0 + (n === 1 ? (x1 - x0) / 2 : k * (x1 - x0) / (n - 1));
    g.strokeStyle = P.s1; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); let pen = false;
    for (let k = 0; k < n; k++) { const v = c.v[k]; if (!Number.isFinite(v)) { pen = false; continue; } pen ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v)); pen = true; }
    g.stroke();
    if (n < 60) { g.fillStyle = P.s1; for (let k = 0; k < n; k++) if (Number.isFinite(c.v[k])) { g.beginPath(); g.arc(X(k), Y(c.v[k]), 2.5, 0, 7); g.fill(); } }
    g.fillStyle = P.ink2; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText('0', x0, h - 8);
    g.textAlign = 'right'; g.fillText(int((n - 1) * c.step), x1, h - 8); g.textAlign = 'center'; g.fillText(i.dims && i.dims[0] ? `index along ${i.dims[0]}` : 'index', (x0 + x1) / 2, h - 8);
    geom = { kind: 'line', x0, x1, n, X, Y, y0, y1, step: c.step };
    $('chartCap').textContent = (c.step > 1 ? `Every ${ord(c.step)} value of ${int(c.n)}` : `All ${int(n)} values`) + (c.n < c.all ? ` (the first ${int(c.n)} of ${int(c.all)})` : '') + ', in file order.';
  } else {
    const div = c.min < 0 && c.max > 0, M = Math.max(Math.abs(c.min), Math.abs(c.max)) || 1, lo = c.min, hi = c.max;
    const color = v => div ? (v < 0 ? ramp([P.mid, ...P.seq.slice(2, 6)], -v / M) : ramp([P.mid, ...P.red], v / M)) : ramp(P.seq, hi === lo ? 0.5 : (v - lo) / (hi - lo));
    const off = document.createElement('canvas'); off.width = c.hc; off.height = c.hr;
    const og = off.getContext('2d'), img = og.createImageData(c.hc, c.hr), bg = hex(P.surf);
    for (let k = 0; k < c.hr * c.hc; k++) { const v = c.v[k], o = k * 4; const col = Number.isFinite(v) ? color(v) : bg; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255; }
    og.putImageData(img, 0, 0);
    const top = 8, left = 54, aw = w - left - 10, ah = h - top - 30, sc = Math.min(aw / c.hc, ah / c.hr), dw = c.hc * sc, dh = c.hr * sc, dx = left + (aw - dw) / 2;
    g.imageSmoothingEnabled = false; g.drawImage(off, dx, top, dw, dh);
    const nd = i.shape.length, rn = i.dims && i.dims[nd - 2] || `axis ${nd - 2}`, cn = i.dims && i.dims[nd - 1] || `axis ${nd - 1}`;
    g.fillStyle = P.ink2; g.font = '12px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('0', dx - 6, top); g.textBaseline = 'bottom'; g.fillText(int(c.R - 1), dx - 6, top + dh);
    g.textBaseline = 'top'; g.textAlign = 'left'; g.fillText('0', dx, top + dh + 6); g.textAlign = 'right'; g.fillText(int(c.C - 1), dx + dw, top + dh + 6);
    g.textAlign = 'center'; g.fillText(cn, dx + dw / 2, top + dh + 6);
    g.save(); g.translate(14, top + dh / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(rn, 0, 0); g.restore();
    geom = { kind: 'heat', dx, top, dw, dh, c };
    const lg = $('legend'), bar = document.createElement('canvas'), lw = 220; bar.width = lw; bar.height = 10; bar.className = 'lgbar';
    const bgc = bar.getContext('2d');
    for (let x = 0; x < lw; x++) { const v = div ? -M + 2 * M * x / (lw - 1) : lo + (hi - lo) * x / (lw - 1); bgc.fillStyle = `rgb(${color(v)})`; bgc.fillRect(x, 0, 1, 10); }
    lg.append(el('span', fnum(div ? -M : lo), 'mono small'), bar, el('span', fnum(div ? M : hi), 'mono small'));
    if (div) lg.append(el('span', 'gray = 0, blue below, red above', 'small mut'));
    const units = (i.attrs || []).find(a => a[0] === 'units'); if (units) lg.append(el('span', units[2], 'small mut mono'));
    $('chartCap').textContent = (nd > 2 ? `Slice [${lead.join(', ')}, :, :]. ` : '') + `${rn} top to bottom, ${cn} left to right, as stored (no map projection).` +
      (c.rs > 1 || c.cs > 1 ? ` Every ${c.rs > 1 ? ord(c.rs) + ' row' : 'row'} and ${c.cs > 1 ? ord(c.cs) + ' column' : 'column'} is drawn.` : '') + (c.fills || c.v.some(Number.isNaN) ? ' Fill and NaN cells are left blank.' : '');
  }
}
$('chart').addEventListener('mousemove', e => {
  const tip = $('tip'); if (!geom) { tip.hidden = true; return; }
  const rct = e.target.getBoundingClientRect(), x = e.clientX - rct.left, y = e.clientY - rct.top;
  let text = null;
  if (geom.kind === 'line') {
    const k = Math.round((x - geom.x0) / (geom.x1 - geom.x0) * (geom.n - 1));
    if (k >= 0 && k < geom.n) text = `index ${int(k * geom.step)}\nvalue ${fnum(shown.chart.v[k])}`;
  } else {
    const c = geom.c, cc = Math.floor((x - geom.dx) / geom.dw * c.hc), rr = Math.floor((y - geom.top) / geom.dh * c.hr);
    if (cc >= 0 && cc < c.hc && rr >= 0 && rr < c.hr) { const v = c.v[rr * c.hc + cc]; text = `row ${int(rr * c.rs)}, column ${int(cc * c.cs)}\nvalue ${Number.isNaN(v) ? 'fill or NaN' : fnum(v)}`; }
  }
  if (!text) { tip.hidden = true; return; }
  tip.textContent = text; tip.hidden = false;
  const bw = e.target.parentElement.clientWidth, tw = tip.offsetWidth;
  tip.style.left = Math.min(bw - tw - 4, x + 14) + 'px'; tip.style.top = Math.max(0, y - 10) + 'px';
});
$('chart').addEventListener('mouseleave', () => { $('tip').hidden = true; });
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(draw, 120); });

/* ---------- wiring ---------- */
$('pick').addEventListener('change', e => open(e.target.files[0]));
$('pick2').addEventListener('change', e => open(e.target.files[0]));
$('sample').addEventListener('click', () => {
  const go = () => {
    const s = self.ZOVO_SAMPLE, bin = atob(s.b64), u = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    open(new File([u], s.name, { type: 'application/x-netcdf' }));
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
