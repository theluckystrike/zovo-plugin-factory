/* Zovo APK Inspector Online (TOOLCHK3, wave18). The file is read in this tab and never sent anywhere: the page CSP
   sets connect-src 'none'. The readers of the APK Analyzer extension for VS Code run in worker.js, which reads only the
   central directory, the manifest, the DEX files and the signature data with FileReaderSync, so big assets are never
   read. The worker is stopped after 30 seconds. Every value is written as text, never as HTML. */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const ROWS = 2000;           // rows drawn per table (filter to see others)
const TIME = 30000;          // worker time limit

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

/* ---------- reading ---------- */
let worker = null, timer = 0, model = null;
function stop() { if (worker) worker.terminate(); worker = null; clearTimeout(timer); }
function open(file) {
  stop();
  if (!file) return;
  const t0 = performance.now();
  say(`Reading ${file.name} (${size(file.size)}) ...`);
  worker = new Worker('worker.js');
  timer = setTimeout(() => { stop(); say(`Reading ${file.name} took more than ${TIME / 1000} seconds, so it was stopped. The file may be damaged or built to be slow to read.`, true); }, TIME);
  worker.onmessage = ev => {
    stop();
    const r = ev.data;
    if (!r.ok) {
      const why = r.code === 'NOT_APK' ? `${file.name} is not an Android package. An APK is a ZIP archive, and this file has no ZIP end record. (Alpine Linux .apk packages are gzip tar files, not Android apps.)` : `${file.name} could not be read: ${r.error}`;
      say(why, true); return;
    }
    model = r.model;
    show(file, model);
    const all = Math.max(1, Math.ceil(file.size / 65536));
    say(`Opened in ${Math.round(performance.now() - t0)} ms. Read ${int(model.blocksRead)} of ${int(all)} blocks of 64 KB${model.blocksRead < all ? ', only the parts needed' : ''}.`);
  };
  worker.onerror = e => { stop(); say(`${file.name} could not be read: ${e.message || 'the reader stopped'}.`, true); };
  worker.postMessage({ file });
}

/* ---------- view ---------- */
const TABS = [
  ['overview', 'Overview'], ['manifest', 'Manifest'], ['permissions', 'Permissions'], ['components', 'Components'], ['dex', 'DEX'],
  ['packages', 'Packages'], ['classes', 'Classes'], ['folders', 'Folders'], ['types', 'Types'], ['files', 'Files'], ['natives', 'Native'], ['signing', 'Signing'], ['inner', 'APKs inside'],
];
let curTab = 'overview';
function show(file, m) {
  $('fname').textContent = file.name;
  $('fmeta').textContent = `${size(file.size)} · ${m.format}`;
  $('atitle').textContent = m.title;
  const w = $('warns'); w.replaceChildren(...m.warnings.map(x => el('li', x)));
  $('warnBox').hidden = !m.warnings.length;
  const have = new Set(m.tables.map(t => t.id));
  const tabs = TABS.filter(([id]) => id === 'overview' || (id === 'manifest' && (m.manifestXml || m.manifestNote)) || have.has(id));
  const bar = $('tabs'); bar.replaceChildren();
  const panes = $('panes'); panes.replaceChildren();
  for (const [id, label] of tabs) {
    const t = m.tables.find(x => x.id === id);
    const b = el('button', t ? `${label} (${int(t.rows.length)})` : label);
    b.type = 'button'; b.id = 'tab-' + id; b.setAttribute('role', 'tab'); b.dataset.tab = id;
    b.addEventListener('click', () => select(id));
    bar.append(b);
    const p = el('div', null, 'apkpane'); p.id = 'pane-' + id; p.setAttribute('role', 'tabpanel'); p.hidden = true;
    panes.append(p);
    if (id === 'overview') overview(p, m);
    else if (id === 'manifest') manifest(p, m);
    else table(p, t);
  }
  $('drop').hidden = true; $('view').hidden = false;
  select(tabs.some(([id]) => id === curTab) ? curTab : 'overview');
  self.zovoState = { format: m.format, title: m.title, summary: m.summary, tables: Object.fromEntries(m.tables.map(t => [t.id, t.rows.length])), warnings: m.warnings.length, manifestChars: (m.manifestXml || '').length };
}
function select(id) {
  curTab = id;
  for (const b of $('tabs').children) b.setAttribute('aria-selected', String(b.dataset.tab === id));
  for (const p of $('panes').children) p.hidden = p.id !== 'pane-' + id;
}
function overview(p, m) {
  const tb = el('table', null, 'kv');
  for (const [k, v] of m.summary) { const tr = el('tr'); tr.append(el('th', k), el('td', v)); tb.append(tr); }
  p.append(tb);
  const dex = m.tables.find(t => t.id === 'dex');
  if (dex && dex.rows.length) {
    p.append(el('h3', 'Method references per DEX file'));
    const box = el('div', null, 'apkbars');
    const ci = dex.columns.findIndex(c => c.n === 'Method refs');
    for (const r of dex.rows) {
      const n = r[ci], pct = Math.min(100, n / 65536 * 100);
      const row = el('div', null, 'apkbar'); row.append(el('span', r[0], 'mono'));
      const track = el('span', null, 'track'); const fill = el('span', null, 'fill' + (n > 60000 ? ' hi' : '')); fill.style.width = pct.toFixed(2) + '%'; track.append(fill);
      row.append(track, el('span', `${int(n)} of 65,536 (${pct.toFixed(1)} %)`, 'small mut'));
      box.append(row);
    }
    p.append(box);
    p.append(el('p', 'A DEX file can address at most 65,536 methods. Apps with more methods are split into classes2.dex, classes3.dex and so on (multidex).', 'small mut'));
  }
}
function manifest(p, m) {
  if (m.manifestNote) p.append(el('p', m.manifestNote, 'small'));
  if (!m.manifestXml) return;
  const bar = el('div', null, 'docbar');
  const copy = el('button', 'Copy XML'); copy.type = 'button';
  copy.addEventListener('click', () => navigator.clipboard.writeText(m.manifestXml).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy XML'; }, 1500); }, () => say('The browser did not allow copying. Select the text and copy it instead.', true)));
  const save = el('button', 'Save AndroidManifest.xml'); save.type = 'button';
  save.addEventListener('click', () => download(new Blob([m.manifestXml], { type: 'text/xml' }), 'AndroidManifest.xml'));
  bar.append(copy, save, el('span', `${int(m.manifestXml.split('\n').length)} lines. Resource references stay as ids such as @0x7f0e001b, because resources.arsc is not read.`, 'small mut'));
  p.append(bar, el('pre', m.manifestXml, 'apkxml'));
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function cell(v, type) {
  if (v === null || v === undefined || v === '') return '';
  if (type === 'b') return size(Number(v));
  if (type === 'd') return int(v);
  return String(v);
}
function table(p, t) {
  if (t.id === 'signing') p.append(el('p', 'The page shows the signature data that is there. It does not verify the signatures.', 'small mut'));
  if (t.id === 'packages') p.append(el('p', 'Method references count every method a DEX file calls or defines, which is what counts against the 65,536 limit. Defined methods are the ones its classes contain.', 'small mut'));
  const bar = el('div', null, 'docbar');
  const f = el('input'); f.type = 'search'; f.placeholder = 'Filter rows'; f.setAttribute('aria-label', `Filter ${t.title}`); f.autocomplete = 'off';
  const note = el('span', '', 'small mut');
  bar.append(f, note);
  const wrap = el('div', null, 'tblwrap tall'), tb = el('table', null, 'dtab'), thead = el('thead'), body = el('tbody');
  const htr = el('tr');
  let sortCol = -1, dir = 1;
  t.columns.forEach((c, i) => {
    const th = el('th'); const b = el('button', c.n, 'sort'); b.type = 'button';
    b.addEventListener('click', () => { dir = sortCol === i ? -dir : (c.t === 's' ? 1 : -1); sortCol = i; draw(); });
    th.append(b); if (c.t !== 's') th.className = 'num'; htr.append(th);
  });
  thead.append(htr); tb.append(thead, body); wrap.append(tb);
  p.append(bar, wrap);
  function draw() {
    const q = f.value.trim().toLowerCase();
    let rows = t.rows;
    if (q) rows = rows.filter(r => r.some((v, i) => cell(v, t.columns[i].t).toLowerCase().includes(q)));
    if (sortCol >= 0) {
      const ty = t.columns[sortCol].t;
      rows = rows.slice().sort((a, b) => {
        const x = a[sortCol], y = b[sortCol];
        if (ty === 's') return String(x ?? '').localeCompare(String(y ?? '')) * dir;
        return ((Number(x) || 0) - (Number(y) || 0)) * dir;
      });
    }
    const frag = document.createDocumentFragment();
    for (const r of rows.slice(0, ROWS)) {
      const tr = el('tr');
      r.forEach((v, i) => { const td = el('td', cell(v, t.columns[i].t)); if (t.columns[i].t !== 's') td.className = 'num'; tr.append(td); });
      frag.append(tr);
    }
    body.replaceChildren(frag);
    for (const [i, th] of [...htr.children].entries()) th.setAttribute('aria-sort', i === sortCol ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    note.textContent = (rows.length > ROWS ? `Showing ${int(ROWS)} of ${int(rows.length)} rows. Filter to find others.` : `${int(rows.length)} row${rows.length === 1 ? '' : 's'}`) + (q ? ` match "${f.value.trim()}".` : '.');
  }
  f.addEventListener('input', draw);
  draw();
}

/* ---------- open ---------- */
async function sample() {
  try {
    const { SAMPLE } = await import('./sample.js');
    const bin = atob(SAMPLE.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    open(new File([u8], SAMPLE.name, { type: SAMPLE.type }));
  } catch (e) { say('The sample could not be loaded: ' + e.message, true); }
}
$('pick').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('pick2').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('sample').addEventListener('click', sample);
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
