/* Zovo Linker Map Viewer Online (TOOLCHK3, wave18). The map is read in this tab with the File API and never sent
   anywhere: the page CSP sets connect-src 'none'. worker.js (the Linker Map Viewer extension's own parser, MIT)
   reads the file in 4 MB slices in a background worker, so a map of hundreds of MB never freezes the tab, and it
   sends back only the rows on screen. Every value is written as text, never as HTML. */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const PAGE = 500;
const TABS = [['sections', 'Sections'], ['objects', 'Object files'], ['archives', 'Libraries'], ['symbols', 'Symbols'], ['inputs', 'Input sections'], ['discarded', 'Discarded']];

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const fsize = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
let unit = 'b';
const sz = n => {
  if (n == null || n === '') return '';
  const v = Number(n);
  if (unit === 'hex') return '0x' + Math.round(v).toString(16);
  if (unit === 'kb') return (v / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' KB';
  return int(v);
};
const human = n => n >= 1048576 ? (n / 1048576).toFixed(n % 1048576 ? 2 : 0) + ' MB' : n >= 1024 ? (n / 1024).toFixed(n % 1024 ? 1 : 0) + ' KB' : int(n) + ' B';

/* ---------- worker ---------- */
let worker = null, seq = 0, waits = new Map(), sum = null, cur = null, fileName = '', mapFile = null, t0 = 0;
function call(cmd, args) {
  return new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); worker.postMessage(Object.assign({ id, cmd }, args)); });
}
function newWorker() {
  if (worker) worker.terminate();
  for (const w of waits.values()) w.rej(new Error('stopped'));
  waits = new Map();
  worker = new Worker('worker.js');
  worker.onmessage = e => {
    const m = e.data;
    if (m.event === 'progress') { say(`Reading ... ${Math.min(99, Math.round(m.bytes / m.total * 100))} % of ${fsize(m.total)}`); return; }
    const w = waits.get(m.id); if (!w) return;
    waits.delete(m.id);
    if (m.ok) w.res(m.result); else w.rej(Object.assign(new Error(m.error.message), { code: m.error.code }));
  };
  worker.onerror = e => { for (const w of waits.values()) w.rej(new Error(e.message || 'the parser stopped')); waits = new Map(); };
}

/* ---------- open ---------- */
const NOTMAP = m => m.empty ? 'The file is empty.' : m.binary ? 'This is a binary file, not a linker map. Map files are text.' :
  m.sourceMap ? 'This is a JavaScript or CSS source map (JSON), not a linker map.' : m.json ? 'This is a JSON file, not a linker map.' :
  'This does not look like a linker map. The page reads maps from GNU ld, LLVM lld, IAR ILINK and Arm Compiler armlink (Keil).';
async function open(file, script) {
  if (!file) return;
  newWorker(); t0 = performance.now();
  say('Reading ' + file.name + ' (' + fsize(file.size) + ') ...');
  let r;
  try { r = await call('open', { file, script: script || null }); }
  catch (e) { return say(e.code === 'NOREGIONS' ? e.message : 'The map could not be read: ' + e.message, true); }
  if (r.notMap) return say(NOTMAP(r.notMap), true);
  mapFile = file; fileName = file.name; sum = r.summary;
  cur = { kind: 'sections', sort: null, desc: false, filter: '', offset: 0, ids: [], cols: [] };
  showSummary(script);
  await Promise.all([showTop(), showTable(true)]);
  $('drop').hidden = true; $('view').hidden = false;
  say(`Opened in ${Math.round(performance.now() - t0)} ms.` + (script ? ` Memory regions from ${script.name}.` : ''));
  const c = sum.counts;
  self.zovoState = { format: sum.format, regions: sum.regions.map(x => [x.name, x.used, x.length]), sections: sum.sections, objects: c.objects, archives: c.archives, symbols: c.symbols, discarded: c.discarded, totals: sum.totals, berkeley: sum.berkeley };
}

function showSummary(script) {
  const c = sum.counts, st = sum.stats || {};
  $('fname').textContent = fileName;
  $('fmeta').textContent = `${sum.formatLabel} · ${fsize(st.bytes || 0)} · ${int(st.lines || 0)} lines`;
  const w = $('warns'); w.replaceChildren();
  for (const t of (sum.warnings || []).slice(0, 8)) w.appendChild(el('div', t));
  w.hidden = !w.childElementCount;
  const box = $('regions'); box.replaceChildren();
  for (const r of sum.regions) {
    const row = el('div', null, 'reg' + (r.length > 0 && r.used > r.length ? ' over' : ''));
    const nm = el('div', r.name, 'rn'); nm.appendChild(el('small', r.origin + (r.attrs ? ' (' + r.attrs + ')' : '')));
    const bar = el('div', null, 'rbar'); bar.setAttribute('role', 'img');
    const pct = r.length > 0 ? r.used / r.length * 100 : 0;
    bar.setAttribute('aria-label', `${r.name}: ${int(r.used)} of ${int(r.length)} bytes used, ${pct.toFixed(1)} %`);
    if (r.length > 0) (r.cats || []).forEach((v, i) => { if (v > 0) { const seg = el('i', null, 'c' + i); seg.style.width = Math.min(100, v / r.length * 100) + '%'; seg.title = ['Code', 'RO data', 'RW data', 'Zero-init', 'Other'][i] + ': ' + int(v) + ' bytes'; bar.appendChild(seg); } });
    const val = el('div', r.length > 0 ? `${human(r.used)} of ${human(r.length)} · ${pct.toFixed(pct < 10 ? 2 : 1)} %` : `${human(r.used)} used`, 'rv');
    row.append(nm, bar, val); box.appendChild(row);
  }
  $('regNote').textContent = sum.regions.length ? 'Used bytes per region, split by kind. A RAM section that is loaded from flash counts in both. Discarded sections are never counted.'
    : 'This map lists no memory regions (lld and Rust maps do not). Add the linker script with its MEMORY block to see the region bars.';
  if ((sum.notes || []).length) $('regNote').textContent += ' ' + sum.notes.slice(0, 4).join(' ');
  $('ldBtn').hidden = !!sum.regions.length && !script;
  $('catLegend').hidden = !sum.regions.length;
  const t = sum.totals, tiles = [['Code', t.code], ['RO data', t.ro], ['RW data', t.data], ['Zero-init', t.bss], ['Padding', sum.padding], ['Sections', null, sum.sections], ['Object files', null, c.objects], ['Symbols', null, c.symbols]];
  const tb = $('totals'); tb.replaceChildren();
  for (const [k, v, n] of tiles) { const d = el('div', null, 'st'); d.append(el('b', v != null ? sz(v) : int(n)), el('span', k)); tb.appendChild(d); }
  const tabs = $('tabs'); tabs.replaceChildren();
  const counts = { sections: sum.sections, objects: c.objects, archives: c.archives, symbols: c.symbols, inputs: c.inputs, discarded: c.discarded };
  for (const [k, label] of TABS) {
    const b = el('button', `${label} (${int(counts[k] || 0)})`); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.k = k;
    b.setAttribute('aria-selected', k === cur.kind ? 'true' : 'false');
    b.addEventListener('click', () => { cur = { kind: k, sort: null, desc: false, filter: $('filter').value, offset: 0 }; for (const x of tabs.children) x.setAttribute('aria-selected', x.dataset.k === k ? 'true' : 'false'); showTable(true); });
    tabs.appendChild(b);
  }
}
async function showTop() {
  const [o, s] = await Promise.all([call('page', { q: { kind: 'objects', limit: 30 } }), call('page', { q: { kind: 'symbols', limit: 20 } })]);
  const fill = (id, rows) => { const tb = $(id).tBodies[0]; tb.replaceChildren(); for (const [n, v, est] of rows) { const tr = el('tr'); tr.append(el('td', n), el('td', (est ? '~' : '') + sz(v), 'num')); tb.appendChild(tr); } if (!rows.length) { const tr = el('tr'); tr.appendChild(el('td', 'None in this map', 'mut')); tb.appendChild(tr); } };
  fill('topObj', o.rows.filter(r => !/^\*(fill|linker)\*$/.test(r[0]) && r[2] > 0).slice(0, 20).map(r => [r[1] ? r[1] + '(' + r[0] + ')' : r[0], r[2]]));
  fill('topSym', s.rows.filter(r => r[2] > 0).slice(0, 20).map(r => [r[0], r[2], r[5]]));
}

/* ---------- the table ---------- */
async function showTable(reset) {
  if (reset) { cur.offset = 0; $('rows').tBodies[0].replaceChildren(); }
  const q = { kind: cur.kind, sort: cur.sort, desc: cur.desc, filter: cur.filter, offset: cur.offset, limit: PAGE };
  let p;
  try { p = await call('page', { q }); } catch (e) { return say('The table could not be read: ' + e.message, true); }
  cur.cols = p.columns; cur.sortKey = p.sort; cur.sortDesc = p.desc;
  if (reset) {
    const tr = el('tr');
    for (const c of p.columns) {
      const th = el('th', null, /size|int/.test(c.type) ? 'num' : '');
      const b = el('button', c.label + (c.key === p.sort ? (p.desc ? ' ↓' : ' ↑') : ''), 'sort'); b.type = 'button';
      if (c.title) b.title = c.title;
      b.addEventListener('click', () => { cur.desc = cur.sortKey === c.key ? !cur.sortDesc : /size|int/.test(c.type); cur.sort = c.key; showTable(true); });
      th.appendChild(b); tr.appendChild(th);
    }
    $('rows').tHead.replaceChildren(tr);
  }
  const tb = $('rows').tBodies[0];
  p.rows.forEach((r, i) => {
    const tr = el('tr'); tr.tabIndex = 0;
    p.columns.forEach((c, j) => {
      let v = r[j];
      if (c.type === 'size') v = (cur.kind === 'symbols' && c.key === 'size' && r[5] ? '~' : '') + sz(v);
      else if (c.type === 'int') v = int(v);
      tr.appendChild(el('td', v == null ? '' : String(v), c.type === 'hex' ? 'mono' : /size|int/.test(c.type) ? 'num' : ''));
    });
    const id = p.ids[i];
    const pickRow = () => { for (const x of tb.querySelectorAll('tr.on')) x.classList.remove('on'); tr.classList.add('on'); detail(id, r); };
    tr.addEventListener('click', pickRow);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickRow(); } });
    tb.appendChild(tr);
  });
  cur.offset = p.offset + p.rows.length;
  $('count').textContent = `${int(p.total)} row${p.total === 1 ? '' : 's'}` + (cur.offset < p.total ? `, ${int(cur.offset)} shown` : '');
  $('more').hidden = cur.offset >= p.total;
}
async function detail(id, row) {
  const box = $('detail'); box.replaceChildren();
  const kv = (k, v) => { const p = el('p'); p.append(el('span', k + ': ', 'mut'), el('span', v)); box.appendChild(p); };
  if (cur.kind !== 'objects' && cur.kind !== 'symbols') {
    box.appendChild(el('h4', String(row[0])));
    cur.cols.forEach((c, j) => { if (j) kv(c.label, c.type === 'size' ? sz(row[j]) : c.type === 'int' ? int(row[j]) : String(row[j] ?? '')); });
    return;
  }
  let d;
  try { d = await call('detail', { kind: cur.kind, rowId: id }); } catch (e) { box.appendChild(el('p', 'No details: ' + e.message, 'warn')); return; }
  box.appendChild(el('h4', d.name));
  if (d.kind === 'symbols') {
    kv('Address', d.addr); kv('Size', (d.est ? '~' : '') + sz(d.size) + (d.est ? ' (to the next symbol)' : ''));
    if (d.section) kv('Section', d.section);
    if (d.input) kv('Input section', d.input);
    if (d.obj) kv('Object file', d.obj);
    if (d.script) kv('Defined by', 'the linker script');
    if (d.usedBy && d.usedBy.length) { box.appendChild(el('p', `Used by ${int(d.usedByCount)} file${d.usedByCount === 1 ? '' : 's'}:`, 'mut')); const ul = el('ul'); for (const u of d.usedBy.slice(0, 50)) ul.appendChild(el('li', u)); box.appendChild(ul); }
  } else {
    if (d.archive) kv('Library', d.archive);
    kv('Total', sz(d.total));
    if (d.sections && d.sections.length) { box.appendChild(el('p', 'Sections:', 'mut')); const ul = el('ul'); for (const s of d.sections.slice(0, 60)) ul.appendChild(el('li', `${s.name}: ${sz(s.size)}`)); box.appendChild(ul); }
  }
  if (d.why) kv('Pulled in', `${d.why.by} needs ${d.why.sym}`);
}

/* ---------- controls ---------- */
let fTimer = 0;
$('filter').addEventListener('input', () => { clearTimeout(fTimer); fTimer = setTimeout(() => { cur.filter = $('filter').value; showTable(true); }, 200); });
$('more').addEventListener('click', () => showTable(false));
$('unit').addEventListener('change', e => { unit = e.target.value; showSummary(); showTop(); showTable(true); });
$('csv').addEventListener('click', async () => {
  try {
    const r = await call('export', { q: { kind: cur.kind, sort: cur.sort, desc: cur.desc, filter: cur.filter } });
    const a = el('a'); a.href = URL.createObjectURL(new Blob([r.text], { type: 'text/csv' }));
    a.download = fileName.replace(/\.[^.]*$/, '') + '-' + cur.kind + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`Saved ${int(r.rows)} rows as CSV.`);
  } catch (e) { say('The table could not be saved: ' + e.message, true); }
});
$('pickld').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f && mapFile) open(mapFile, f); });
$('pick').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('pick2').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('sample').addEventListener('click', async () => {
  try { const { SAMPLE } = await import('./sample.js'); open(new File([SAMPLE.text], SAMPLE.name, { type: 'text/plain' })); }
  catch (e) { say('The sample could not be loaded: ' + e.message, true); }
});
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('dragging');
  const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  const map = fs.find(f => !/\.(ld|lds|x)$/i.test(f.name)), ld = fs.find(f => /\.(ld|lds|x)$/i.test(f.name));
  if (map) open(map, ld); else if (ld && mapFile) open(mapFile, ld);
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
