/* Zovo SQL Formatter Online (TOOLCHK3, wave18). The SQL is read in this tab and never sent anywhere: the page CSP
   sets connect-src 'none'. Formatting runs in worker.js, which holds the format engine of the SQL Formatter
   extension for VS Code (MIT) and the sql-formatter library (MIT). The SQL is never run, only re-laid out, and
   every result is checked token by token: if anything other than whitespace or keyword case would change, the
   page shows the text unchanged and names the line. File text is always written as text, never as HTML. */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAX = 16 * 1024 * 1024;     // like the extension's sqlFormatter.maxFileSizeMB default
const LIMIT = 30000;              // ms, like sqlFormatter.timeLimitSeconds
const DIALECTS = [['auto', 'Auto (from the file and the text)'], ['sql', 'Standard SQL'], ['postgresql', 'PostgreSQL'], ['mysql', 'MySQL'], ['mariadb', 'MariaDB'],
  ['transactsql', 'T-SQL (SQL Server)'], ['plsql', 'Oracle PL/SQL'], ['sqlite', 'SQLite'], ['bigquery', 'BigQuery'], ['snowflake', 'Snowflake'],
  ['redshift', 'Amazon Redshift'], ['spark', 'Spark SQL'], ['hive', 'Hive'], ['db2', 'IBM Db2'], ['db2i', 'IBM Db2 for i'], ['duckdb', 'DuckDB'],
  ['trino', 'Trino / Presto'], ['n1ql', 'Couchbase N1QL'], ['singlestoredb', 'SingleStore'], ['tidb', 'TiDB'], ['clickhouse', 'ClickHouse']];

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const lines = t => t ? t.split('\n').length - (t.endsWith('\n') ? 1 : 0) : 0;
const plural = (n, one, many) => int(n) + ' ' + (n === 1 ? one : (many || one + 's'));

for (const [v, label] of DIALECTS) { const o = el('option', label); o.value = v; $('dialect').append(o); }

/* ---------- worker ---------- */
let worker = null, seq = 0, timer = 0, busy = null, fileName = '', last = null, opened = 0;
function startWorker() {
  worker = new Worker('worker.js');
  worker.onmessage = ev => done(ev.data);
  worker.onerror = e => { e.preventDefault(); clearTimeout(timer); busy = null; say('The formatter stopped with an error. Your SQL is unchanged.', true); };
}
function opts() {
  const ind = $('indent').value;
  return { dialect: $('dialect').value, keywordCase: $('kw').value, tabWidth: ind === 'tab' ? 4 : Number(ind), useTabs: ind === 'tab',
    commaPosition: $('comma').value, expressionWidth: Number($('width').value), procedureLayout: $('proc').checked };
}
function run() {
  const text = $('src').value;
  if (text.length > MAX) { say(`This text is ${size(text.length)}. The page formats up to 16 MB; the VS Code extension formats bigger files in several threads.`, true); return; }
  if (!worker) startWorker();
  if (busy) { worker.terminate(); startWorker(); }  // a newer edit wins
  const id = ++seq;
  busy = { id, t0: performance.now(), text };
  say(text.length > 200000 ? `Formatting ${size(text.length)} ...` : 'Formatting ...');
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!busy || busy.id !== id) return;
    worker.terminate(); worker = null; busy = null;
    say('Formatting took longer than 30 seconds and was stopped. Your SQL is unchanged.', true);
  }, LIMIT);
  worker.postMessage({ id, text, opts: opts(), fileName });
}
let debounce = 0;
const later = () => { clearTimeout(debounce); debounce = setTimeout(run, 350); };

function done(r) {
  if (!busy || r.id !== busy.id) return;
  clearTimeout(timer);
  const ms = Math.round(performance.now() - busy.t0), text = busy.text;
  busy = null;
  if (!r.ok) { last = null; showRefuse(`Not formatted: ${r.message}.`, r.line); $('out').value = text; say('Not formatted. The text is unchanged.', true); return; }
  last = r;
  const auto = $('dialect').value === 'auto';
  $('outNote').textContent = (auto ? `${r.name}, ${r.source === 'content' ? 'found from the text' : r.source === 'extension' ? 'found from the file name' : 'no dialect hints found'}` : r.name);
  const n = r.statements.filter(s => !s.client).length, client = r.statements.length - n;
  if (r.error) {
    showRefuse(`Not formatted: ${r.error.message} at line ${r.error.line}. Nothing was changed.`, r.error.line);
    $('out').value = text;
    say(`Checked ${plural(n, 'statement')} in ${ms} ms. ${plural(r.kept.length, 'statement')} could not be formatted safely, so the text is unchanged.`, true);
  } else {
    $('refuse').hidden = true;
    $('out').value = r.full;
    say(`${opened ? 'Opened and formatted' : 'Formatted'} ${plural(n, 'statement')} in ${ms} ms. Every token was checked: only whitespace${$('kw').value === 'preserve' ? '' : ' and keyword case'} changed.`);
  }
  opened = 0;
  table(r);
  self.zovoState = { statements: n, client, dialect: r.dialect, error: r.error, kept: r.kept.length, outLen: $('out').value.length };
}

function showRefuse(t, line) {
  $('refuseMsg').textContent = t;
  $('refuse').hidden = false;
  $('goLine').hidden = !line;
  $('goLine').onclick = () => goLine(line);
  $('rest').hidden = !(last && last.rest != null);
}
$('rest').addEventListener('click', () => {
  if (!last || last.rest == null) return;
  $('out').value = last.rest;
  $('refuse').hidden = true;
  say(`Formatted every statement it could read. ${plural(last.kept.length, 'statement')} kept exactly as written (line ${last.kept.slice(0, 8).join(', ')}${last.kept.length > 8 ? ' ...' : ''}).`);
});
$('tryDialect').addEventListener('click', () => { $('dialect').focus(); $('dialect').scrollIntoView({ block: 'center' }); });

function goLine(line) {
  const ta = $('src'), v = ta.value;
  let at = 0;
  for (let k = 1; k < line && at >= 0; k++) at = v.indexOf('\n', at) + 1 || -1;
  if (at < 0) at = v.length;
  const end = v.indexOf('\n', at);
  ta.focus();
  ta.setSelectionRange(at, end < 0 ? v.length : end);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 19;
  ta.scrollTop = Math.max(0, (line - 4) * lh);
}

function table(r) {
  const tb = $('stmts').tBodies[0];
  const rows = r.statements.slice(0, 2000);
  tb.replaceChildren(...rows.map(s => {
    const tr = el('tr');
    tr.tabIndex = 0;
    tr.append(el('td', s.client ? '' : String(s.n), 'ix'), el('td', String(s.line)), el('td', s.client ? 'Client line: ' + s.kind : s.kind || 'other'),
      el('td', s.client ? '' : (s.tables || []).join(', '), 'tb'));
    const res = s.client ? el('td', 'kept as written', 'mut') : s.error ? el('td', `${s.error.message} (line ${s.error.line})`, 'bad') : el('td', 'formatted', 'ok');
    tr.append(res);
    const go = () => goLine(s.error ? s.error.line : s.line);
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return tr;
  }));
  const n = r.statements.filter(s => !s.client).length;
  const kinds = {};
  for (const s of r.statements) if (!s.client) { const k = (s.kind || 'other').replace(/^WITH \.\.\. /, ''); kinds[k] = (kinds[k] || 0) + 1; }
  const tables = new Set(); for (const s of r.statements) for (const t of s.tables || []) tables.add(t.toLowerCase());
  const kindTxt = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${int(c)} ${k}`).join(', ');
  const client = r.statements.length - n;
  $('sumNote').textContent = `${plural(n, 'statement')}${kindTxt ? ' (' + kindTxt + ')' : ''}, ${plural(tables.size, 'table name')} referenced` +
    (client ? `, ${plural(client, 'client line')} (DELIMITER, GO, / or psql commands) kept as written` : '') + '.' +
    (r.statements.length > rows.length ? ` The table lists the first ${int(rows.length)}.` : '') + ' Click a row to go to its line.';
}

/* ---------- open ---------- */
async function open(file) {
  if (!file) return;
  if (file.size > MAX) { say(`${file.name} is ${size(file.size)}. The page formats files up to 16 MB; the VS Code extension formats bigger ones.`, true); return; }
  say(`Reading ${file.name} ...`);
  let text;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.subarray(0, 8000).includes(0) && !(buf[0] === 0xff && buf[1] === 0xfe) && !(buf[0] === 0xfe && buf[1] === 0xff)) { say(`${file.name} is not a text file (it has zero bytes). Open a .sql file.`, true); return; }
    text = buf[0] === 0xff && buf[1] === 0xfe ? new TextDecoder('utf-16le').decode(buf) : buf[0] === 0xfe && buf[1] === 0xff ? new TextDecoder('utf-16be').decode(buf) : new TextDecoder('utf-8').decode(buf);
  } catch (e) { say(`${file.name} could not be read: ${e.message}`, true); return; }
  show(file.name, `${size(file.size)}, ${plural(lines(text), 'line')}`, text);
}
function show(name, meta, text) {
  fileName = name;
  $('fname').textContent = name;
  $('fmeta').textContent = meta;
  $('src').value = text.replace(/^﻿/, '');
  $('drop').hidden = true; $('pasteRow').hidden = true; $('view').hidden = false;
  opened = 1;
  run();
}
$('src').addEventListener('input', () => { $('fmeta').textContent = `${plural(lines($('src').value), 'line')}, edited here`; later(); });
for (const id of ['dialect', 'kw', 'indent', 'comma', 'width', 'proc']) $(id).addEventListener('change', run);
$('paste').addEventListener('click', () => { show('Your SQL', 'typed or pasted here', ''); say('Type or paste SQL in the left box. It is formatted as you type.'); $('src').focus(); });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('out').value); say('Copied the formatted SQL.'); }
  catch (e) { $('out').select(); say('Select all and copy with Ctrl+C or Cmd+C (the browser did not allow the copy button).', true); }
});
$('save').addEventListener('click', () => {
  const name = (fileName && fileName !== 'Your SQL' ? fileName.replace(/(\.[^.]+)?$/, '.formatted$1') : 'formatted.sql').replace(/\.formatted$/, '.formatted.sql');
  const a = el('a'); a.href = URL.createObjectURL(new Blob([$('out').value], { type: 'application/sql' })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  say(`Saved ${name} to your downloads.`);
});
$('sample').addEventListener('click', async () => {
  const { SAMPLE } = await import('./sample.js');
  show(SAMPLE.name, 'sample, ' + plural(lines(SAMPLE.data), 'line'), SAMPLE.data);
});
$('pick').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('pick2').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
