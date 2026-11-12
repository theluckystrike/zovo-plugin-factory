/* Zovo Parquet Viewer Online (WEB3, wave18). The file is read in this tab with the File API, only the parts
   needed (the footer, then the column chunks of the first rows), and never sent anywhere: the page CSP sets
   connect-src 'none'. Parsing is done by hyparquet 1.32.0 with gzip, brotli and lz4 from hyparquet-compressors
   1.1.3 and zstd from fzstd 0.1.1, all from cdn.jsdelivr.net at pinned versions with SRI in the import map.
   Every value is written as text, never as HTML. */
import { parquetMetadataAsync, parquetReadObjects, parquetSchema } from 'hyparquet';
import { gunzip } from 'hyparquet-compressors/gzip';
import { decompressBrotli } from 'hyparquet-compressors/brotli';
import { decompressLz4, decompressLz4Raw } from 'hyparquet-compressors/lz4';
import { decompress as decompressZstd } from 'fzstd';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const ROWS = 1000, MAXCOLS = 200, CELL = 300;
const compressors = {
  GZIP: (input, length) => gunzip(input, new Uint8Array(length)),
  BROTLI: decompressBrotli,
  ZSTD: input => decompressZstd(input),
  LZ4: decompressLz4,
  LZ4_RAW: decompressLz4Raw,
};

const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
$('theme').addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

/* ---------- value to text ---------- */
function json(v) {
  return JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? hexOf(x) : x instanceof Date ? iso(x) : x);
}
function hexOf(u) { return '0x' + Array.from(u.subarray(0, 32), b => b.toString(16).padStart(2, '0')).join('') + (u.length > 32 ? `... (${int(u.length)} bytes)` : ''); }
function iso(d) { return isNaN(d) ? 'Invalid date' : d.toISOString().replace('T00:00:00.000Z', '').replace('.000Z', 'Z'); }
function text(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
  if (typeof v === 'bigint' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return iso(v);
  if (v instanceof Uint8Array) return hexOf(v);
  return json(v);
}

/* ---------- schema ---------- */
function typeOf(e) {
  const lt = e.logical_type, parts = [];
  if (e.type) parts.push(e.type + (e.type === 'FIXED_LEN_BYTE_ARRAY' && e.type_length ? `(${e.type_length})` : ''));
  if (lt && lt.type) {
    let l = lt.type;
    if (lt.type === 'DECIMAL') l += `(${lt.precision}, ${lt.scale})`;
    else if (lt.type === 'TIMESTAMP' || lt.type === 'TIME') l += `(${lt.unit || ''}${lt.isAdjustedToUTC ? ', UTC' : ''})`;
    else if (lt.type === 'INTEGER') l = `${lt.isSigned ? 'INT' : 'UINT'}${lt.bitWidth}`;
    parts.push(l);
  } else if (e.converted_type) parts.push(e.converted_type + (e.converted_type === 'DECIMAL' && e.precision ? `(${e.precision}, ${e.scale || 0})` : ''));
  if (!e.type && !parts.length) parts.push(e.num_children ? 'group' : '');
  return parts.join(' / ');
}
function schemaRows(node, depth, out) {
  for (const ch of node.children) {
    out.push([depth, ch.element.name, typeOf(ch.element) || (ch.children.length ? 'group' : ''), ch.element.repetition_type || '', ch.children.length]);
    schemaRows(ch, depth + 1, out);
  }
  return out;
}

/* ---------- open ---------- */
let rows = [], cols = [], sortBy = -1, sortDir = 1, cur = null;

async function open(file) {
  if (!file) return;
  if (!file.size) { say('This file is empty (0 bytes).', true); return; }
  if (file.size < 12) { say('This file is too short to be a Parquet file.', true); return; }
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer()), tail = new Uint8Array(await file.slice(file.size - 4).arrayBuffer());
  const magic = u => String.fromCharCode(...u);
  if (magic(head) !== 'PAR1') {
    if (magic(head) === 'PARE') { say('This Parquet file is encrypted (PARE). It needs its key and a tool that has it.', true); return; }
    if (head[0] === 0x93 && head[1] === 0x4e) { say('This is a NumPy .npy array. Open it in the NPY and NPZ Viewer linked below.', true); return; }
    if (head[0] === 0x50 && head[1] === 0x4b) { say('This is a ZIP file (an .xlsx, .npz or other archive), not Parquet. The Excel Viewer linked below opens .xlsx files.', true); return; }
    say('This file does not start with PAR1, so it is not a Parquet file, or it is damaged.', true); return;
  }
  if (magic(tail) !== 'PAR1') { say('This file starts like Parquet but does not end with PAR1. It may be cut short (an upload or copy that did not finish).', true); return; }
  const buf = { byteLength: file.size, slice: (a, b) => file.slice(a, b).arrayBuffer() };
  const t0 = performance.now();
  say('Reading the schema...');
  try {
    const meta = await parquetMetadataAsync(buf);
    const tree = parquetSchema(meta);
    const nRows = Number(meta.num_rows);
    cur = { file, meta, tree };
    $('drop').hidden = true; $('view').hidden = false;
    $('fname').textContent = file.name;
    const pl = (n, w) => `${int(n)} ${w}${n === 1 ? '' : 's'}`;
    $('fmeta').textContent = `${size(file.size)}, ${pl(nRows, 'row')}, ${pl(tree.children.length, 'column')}`;
    info(meta, tree);
    schema(tree);
    const top = tree.children.map(c => c.element.name);
    cols = top.slice(0, MAXCOLS);
    say('Reading the first rows...');
    const end = Math.min(nRows, ROWS);
    rows = end ? await parquetReadObjects({ file: buf, metadata: meta, compressors, rowStart: 0, rowEnd: end, columns: top.length > MAXCOLS ? cols : undefined }) : [];
    rowsWithIndex(rows);
    sortBy = -1; sortDir = 1;
    grid();
    $('rowsNote').textContent = `${nRows > rows.length ? `First ${int(rows.length)} of ${int(nRows)} rows` : rows.length === 1 ? 'The only row' : `All ${int(rows.length)} rows`}` +
      (top.length > MAXCOLS ? `, first ${MAXCOLS} of ${int(top.length)} columns` : '') + '. Click a column name to sort these rows.';
    say(`Opened in ${Math.round(performance.now() - t0)} ms.`);
  } catch (err) {
    const m = (err && err.message) || String(err);
    if (/heap|allocation|array length|out of memory/i.test(m)) { say('A value in the first rows of this file is too big for a browser tab to hold (' + m + ').', true); return; }
    say(/compressor|codec|LZO/i.test(m) ? `This file uses a compression the page cannot read (${m}). The free XLSX Viewer extension for VS Code reads snappy, gzip, zstd, brotli and lz4.` : 'This Parquet file could not be read: ' + m, true);
  }
}

function info(meta, tree) {
  const t = $('pinfo'); t.replaceChildren();
  const row = (k, v) => { const tr = el('tr'); tr.append(el('th', k), el('td', v)); t.append(tr); };
  const codecs = new Set(), encs = new Set();
  let comp = 0, raw = 0;
  for (const rg of meta.row_groups) for (const c of rg.columns) {
    const m = c.meta_data; if (!m) continue;
    codecs.add(m.codec); (m.encodings || []).forEach(e => encs.add(e));
    comp += Number(m.total_compressed_size || 0); raw += Number(m.total_uncompressed_size || 0);
  }
  row('Rows', int(meta.num_rows));
  row('Columns', `${int(tree.children.length)} top level, ${int(meta.schema.filter(e => !e.num_children).length)} leaf columns`);
  row('Row groups', int(meta.row_groups.length));
  row('Compression', [...codecs].join(', ') + (raw ? `, ${size(raw)} of data stored in ${size(comp)}` : ''));
  row('Encodings', [...encs].join(', '));
  if (meta.created_by) row('Written by', meta.created_by);
  row('Format version', String(meta.version));
  const kv = meta.key_value_metadata || [];
  if (kv.length) row('Key-value metadata', kv.map(x => `${x.key} (${size((x.value || '').length)})`).join(', '));
}

function schema(tree) {
  const tb = $('schema').tBodies[0]; tb.replaceChildren();
  for (const [d, name, type, rep, kids] of schemaRows(tree, 0, [])) {
    const tr = el('tr'), td = el('td', null, 'mono');
    td.style.setProperty('--d', d);
    td.append(el('span', (kids ? '▾ ' : '') + name, 'sname'));
    tr.append(td, el('td', type, 'mono'), el('td', rep.toLowerCase()));
    tb.append(tr);
  }
}

function grid() {
  const t = $('rows'); t.replaceChildren();
  const thead = el('thead'), hr = el('tr');
  hr.append(el('th', '#', 'ix'));
  cols.forEach((c, i) => {
    const th = el('th'), b = el('button', c + (sortBy === i ? (sortDir > 0 ? ' ▲' : ' ▼') : ''), 'sort');
    b.type = 'button'; b.title = 'Sort by ' + c;
    b.addEventListener('click', () => { sortDir = sortBy === i ? -sortDir : 1; sortBy = i; sortRows(); grid(); });
    th.append(b); hr.append(th);
  });
  thead.append(hr);
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr'); tr.append(el('th', String(r.__i + 1), 'ix mono'));
    for (const c of cols) {
      const s = text(r[c]);
      if (s === null) { tr.append(el('td', 'null', 'nul mono')); continue; }
      const td = el('td', s.length > CELL ? s.slice(0, CELL) + '...' : s, 'mono');
      if (s.length > CELL) td.title = s.slice(0, 4000);
      tr.append(td);
    }
    tb.append(tr);
  }
  t.append(thead, tb);
}
function sortRows() {
  const c = cols[sortBy];
  const key = v => v === null || v === undefined ? null : v instanceof Date ? v.getTime() : typeof v === 'object' ? json(v) : v;
  rows.sort((a, b) => {
    const x = key(a[c]), y = key(b[c]);
    if (x === null) return y === null ? a.__i - b.__i : 1;
    if (y === null) return -1;
    const r = typeof x === typeof y ? (x < y ? -1 : x > y ? 1 : 0) : String(x).localeCompare(String(y));
    return r * sortDir || a.__i - b.__i;
  });
}
const rowsWithIndex = rs => rs.forEach((r, i) => Object.defineProperty(r, '__i', { value: i, enumerable: false }));

/* ---------- CSV of the rows shown ---------- */
$('csv').addEventListener('click', () => {
  if (!rows.length) return;
  const q = s => s === null ? '' : /[",\r\n]/.test(s) || /^[=+\-@\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  const lines = [cols.map(q).join(',')];
  for (const r of rows) lines.push(cols.map(c => q(text(r[c]))).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv' }));
  a.download = cur.file.name.replace(/\.(parquet|parq|pq)$/i, '') + `-first-${rows.length}-rows.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

/* ---------- wiring ---------- */
$('pick').addEventListener('change', e => open(e.target.files[0]));
$('pick2').addEventListener('change', e => open(e.target.files[0]));
$('sample').addEventListener('click', () => {
  const go = () => {
    const s = self.ZOVO_SAMPLE, bin = atob(s.b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    open(new File([u], s.name, { type: 'application/vnd.apache.parquet' }));
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
