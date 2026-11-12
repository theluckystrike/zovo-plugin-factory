/* Zovo JavaScript and TypeScript Playground (TOOLCHK3, wave18). Code runs only when you press Run (or Ctrl+Enter),
   inside a Web Worker made from a blob: URL. The worker inherits this page's Content Security Policy, so
   connect-src 'none' blocks fetch, XHR and WebSocket there too, and the runtime removes those APIs as well.
   A run is stopped at the time limit. The page itself never calls eval or new Function; the prepared code becomes
   the worker's script. Opening a file only loads it into the editor. */
import { prepare, workerSource } from './core.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAXFILE = 2 * 1024 * 1024, MAXROWS = 2000, INLINE = 160;
const KEY = 'zovo-js-scratch';

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
const src = $('src'), mirror = $('mirror'), gut = $('gut');

/* ---------- state ---------- */
let ann = new Map();      // line -> { vals: [], extra: 0, logs: [], errs: [] }
let rows = [];            // output table rows in order
let worker = null, timer = 0, started = 0, fileName = 'scratch.js', stale = false, cut = 0, nlogs = 0, logCut = 0;
const lineAnn = l => { let a = ann.get(l); if (!a) { a = { vals: [], extra: 0, logs: [], errs: [] }; ann.set(l, a); } return a; };

function inlineText(a) {
  const parts = [];
  if (a.vals.length) {
    const n = a.vals.length + a.extra;
    parts.push(n === 1 ? a.vals[0] : a.vals.slice(0, 8).join(' · ') + (n > 8 ? ` … (+${int(n - 8)} more)` : ''));
  }
  for (const l of a.logs.slice(0, 3)) parts.push('› ' + l);
  if (a.logs.length > 3) parts.push(`(+${a.logs.length - 3} more lines)`);
  for (const e of a.errs.slice(0, 1)) parts.push('✖ ' + e);
  return parts;
}

/* ---------- editor: mirror with values, gutter ---------- */
let mirrorQueued = false;
function renderMirror() {
  mirrorQueued = false;
  const lines = src.value.split('\n');
  const frag = document.createDocumentFragment();
  let buf = '';
  for (let i = 0; i < lines.length; i++) {
    const a = ann.get(i + 1);
    buf += lines[i];
    if (a) {
      frag.append(buf); buf = '';
      const parts = inlineText(a);
      let txt = '   ' + parts.join('   ');
      if (txt.length > INLINE) txt = txt.slice(0, INLINE) + '…';
      frag.append(el('span', txt, a.errs.length && !a.vals.length && !a.logs.length ? 'je' : a.errs.length ? 'je' : a.logs.length && !a.vals.length ? 'jl' : 'jv'));
    }
    buf += i < lines.length - 1 ? '\n' : '\n ';
  }
  frag.append(buf);
  mirror.replaceChildren(frag);
  mirror.classList.toggle('stale', stale);
  const want = lines.length;
  if (gut.dataset.n !== String(want)) { let g = ''; for (let i = 1; i <= want; i++) g += i + '\n'; gut.textContent = g + ' '; gut.dataset.n = String(want); }
  syncScroll();
  showLine();
}
const queueMirror = () => { if (!mirrorQueued) { mirrorQueued = true; requestAnimationFrame(renderMirror); } };
function syncScroll() { mirror.scrollTop = src.scrollTop; mirror.scrollLeft = src.scrollLeft; gut.scrollTop = src.scrollTop; }
src.addEventListener('scroll', syncScroll);
function curLine() { return src.value.slice(0, src.selectionStart).split('\n').length; }
function showLine() {
  const l = curLine(), a = ann.get(l);
  if (!a) { $('lineBox').textContent = ''; return; }
  const all = [];
  if (a.vals.length) all.push(a.vals.join(' · ') + (a.extra ? ` … (+${int(a.extra)} more values)` : ''));
  for (const x of a.logs) all.push('› ' + x);
  for (const x of a.errs) all.push('✖ ' + x);
  let t = `Line ${l}: ` + all.join('\n');
  if (t.length > 4000) t = t.slice(0, 4000) + '…';
  $('lineBox').textContent = t;
}
src.addEventListener('keyup', showLine); src.addEventListener('click', showLine);

let escPressed = false, liveT = 0, saveT = 0;
src.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
  if (e.key === 'Escape') { escPressed = true; return; }
  if (e.key === 'Tab' && !escPressed && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    const s = src.selectionStart, en = src.selectionEnd, v = src.value;
    if (e.shiftKey) {  // outdent the current line
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      if (v.startsWith('  ', ls)) { src.setRangeText('', ls, ls + 2, 'preserve'); src.selectionStart = src.selectionEnd = Math.max(ls, s - 2); }
    } else src.setRangeText('  ', s, en, 'end');
    edited();
    return;
  }
  escPressed = false;
});
function edited() {
  if (ann.size) stale = true;
  queueMirror();
  clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ name: fileName, lang: $('lang').value, code: src.value.length < 500000 ? src.value : '' })); } catch (e) { /* full or private */ } }, 500);
  if ($('live').checked) { clearTimeout(liveT); liveT = setTimeout(run, 400); }
}
src.addEventListener('input', edited);

/* ---------- output table ---------- */
let rowsQueued = false;
function addRow(line, kind, text) {
  if (rows.length >= MAXROWS) { cut++; return; }
  rows.push([line, kind, text]);
  if (!rowsQueued) { rowsQueued = true; requestAnimationFrame(renderRows); }
}
function renderRows() {
  rowsQueued = false;
  const tb = $('out').tBodies[0], frag = document.createDocumentFragment();
  for (let i = tb.rows.length; i < rows.length; i++) {
    const [line, kind, text] = rows[i], tr = document.createElement('tr');
    tr.append(el('td', line ? String(line) : '', 'ix'), el('td', kind, 'k-' + kind), el('td', text.length > 2000 ? text.slice(0, 2000) + '…' : text));
    frag.append(tr);
  }
  tb.append(frag);
  $('outNote').textContent = rows.length ? `${int(rows.length)} entries` + (cut ? `, ${int(cut)} more not listed (the table keeps the first ${int(MAXROWS)})` : '') + '.' : '';
}

/* ---------- run ---------- */
function stop(reason) {
  if (worker) { worker.terminate(); worker = null; }
  clearTimeout(timer);
  $('stop').hidden = true; $('run').disabled = false;
  if (reason) say(reason, true);
}
function resetOut() { ann = new Map(); rows = []; cut = 0; nlogs = 0; logCut = 0; stale = false; $('out').tBodies[0].replaceChildren(); $('outNote').textContent = ''; }
function finish() {
  const ms = Math.round(performance.now() - started);
  const nv = [...ann.values()].reduce((s, a) => s + a.vals.length + a.extra, 0), nl = nlogs + logCut, ne = rows.filter(r => r[1] === 'error').length;
  stop();
  say(`Ran in ${int(ms)} ms: ${int(nv)} value${nv === 1 ? '' : 's'}, ${int(nl)} console line${nl === 1 ? '' : 's'}` + (logCut ? ` (the first ${int(nlogs)} are kept)` : '') + (ne ? `, ${ne} error${ne === 1 ? '' : 's'} (see the line marked ✖).` : '.'), ne > 0);
  self.zovoState = { status: ne ? 'error' : 'done', values: nv, logs: nl, errors: ne, ms };
  queueMirror();
}
function onMsg(ev) {
  const m = ev.data;
  if (!m || typeof m !== 'object') return;
  if (m.t === 'v') { lineAnn(m.line).vals.push(m.text); addRow(m.line, 'value', m.text); }
  else if (m.t === 'pr') { const a = lineAnn(m.line), i = a.vals.findIndex(v => v.endsWith('Promise (pending)')); if (i >= 0) a.vals[i] = m.text; else a.vals.push(m.text); addRow(m.line, 'value', m.text); }
  else if (m.t === 'n') { for (const [l, n] of m.c) lineAnn(l).extra = n; }
  else if (m.t === 'log') { nlogs++; if (m.line) lineAnn(m.line).logs.push(m.text); addRow(m.line, m.level, m.text); }
  else if (m.t === 'logcut') { logCut = Math.max(logCut, m.n); }
  else if (m.t === 'err') { if (m.line) lineAnn(m.line).errs.push(m.text); addRow(m.line, 'error', m.text); }
  else if (m.t === 'main') { say('Waiting for timers and promises ...'); }
  else if (m.t === 'done') { finish(); return; }
  queueMirror();
}
function run() {
  stop();
  resetOut();
  const code = src.value, ts = $('lang').value === 'ts';
  if (/\.(jsx|tsx)$/i.test(fileName)) { say('JSX does not run here (and not in the extension either). Remove the JSX or rename the file to .js or .ts.', true); }
  const t0 = performance.now();
  const p = prepare(code, ts);
  if (p.error) {
    for (const e of p.errors || [p.error]) { lineAnn(e.line).errs.push(e.message); addRow(e.line, 'error', e.message); }
    say(`Not run: line ${p.error.line}, ${p.error.message}`, true);
    self.zovoState = { status: 'syntax', line: p.error.line };
    queueMirror(); return;
  }
  const { source, offset } = workerSource(p.code, 100);
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try { worker = new Worker(url); }
  catch (e) { URL.revokeObjectURL(url); say('This browser did not start the sandbox worker: ' + e.message, true); return; }
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  worker.onmessage = onMsg;
  worker.onerror = e => { e.preventDefault(); const line = e.lineno > offset ? e.lineno - offset : 0; if (line) lineAnn(line).errs.push(e.message); addRow(line, 'error', e.message || 'The code stopped with an error.'); queueMirror(); };
  started = t0;
  const lim = Number($('limit').value) * 1000;
  timer = setTimeout(() => {
    stop(`Stopped after ${lim / 1000} s: the code was still running (an endless loop, or a timer that never ends). Values up to that point are shown.`);
    addRow(0, 'error', `Stopped after ${lim / 1000} s.`);
    self.zovoState = { status: 'timeout' };
    queueMirror();
  }, lim);
  $('stop').hidden = false; $('run').disabled = true;
  say('Running ...');
  self.zovoState = { status: 'running' };
}
$('run').addEventListener('click', run);
$('stop').addEventListener('click', () => { stop('Stopped.'); queueMirror(); });
$('clear').addEventListener('click', () => { resetOut(); queueMirror(); say(''); });
$('lang').addEventListener('change', () => { if (ann.size) stale = true; edited(); });

/* ---------- copy and save ---------- */
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  return Promise.reject(new Error('no clipboard'));
}
$('copymd').addEventListener('click', () => {
  const lines = src.value.split('\n').map((l, i) => { const a = ann.get(i + 1); if (!a) return l; let c = inlineText(a).join('   '); if (c.length > 200) c = c.slice(0, 200) + '…'; return l + '  // ' + c.replace(/\n/g, ' '); });
  const lang = $('lang').value === 'ts' ? 'ts' : 'js';
  copyText('```' + lang + '\n' + lines.join('\n') + '\n```\n').then(() => say('Copied the code with its values as Markdown.'), () => say('The browser did not allow copying. Select the code and copy it by hand.', true));
});
$('save').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([src.value], { type: 'text/plain' }));
  a.download = fileName || ($('lang').value === 'ts' ? 'scratch.ts' : 'scratch.js');
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

/* ---------- open ---------- */
function setDoc(name, text, lang) {
  stop(); resetOut();
  fileName = name; src.value = text;
  $('lang').value = lang || (/\.(ts|mts|cts|tsx)$/i.test(name) ? 'ts' : 'js');
  $('fname').textContent = name;
  $('fmeta').textContent = `${size(new Blob([text]).size)}, ${int(text.split('\n').length)} lines`;
  src.scrollTop = 0; src.selectionStart = src.selectionEnd = 0;
  edited();
}
async function open(f) {
  if (!f) return;
  if (f.size > MAXFILE) { say(`${f.name} is ${size(f.size)}. This page opens code files up to 2 MB.`, true); return; }
  const t0 = performance.now();
  const text = await f.text();
  if (/\u0000/.test(text.slice(0, 4096))) { say(`${f.name} looks like a binary file, not code.`, true); return; }
  setDoc(f.name, text);
  say(`Opened ${f.name} in ${Math.round(performance.now() - t0)} ms. Nothing has run yet: press Run (or Ctrl+Enter) to run it in the sandbox.`);
  self.zovoState = { status: 'opened', lines: text.split('\n').length };
  $('view').scrollIntoView({ block: 'start' });
}
for (const id of ['pick', 'pick2']) $(id).addEventListener('change', async e => { try { await open(e.target.files[0]); } catch (err) { say('The browser could not read this file: ' + err.message, true); } e.target.value = ''; });
$('sample').addEventListener('click', async () => {
  const { SAMPLE } = await import('./sample.js');
  setDoc(SAMPLE.name, SAMPLE.data, SAMPLE.lang);
  $('view').scrollIntoView({ block: 'start' });
  run();
});
const dz = $('drop');
dz.classList.add('compact');  // the editor is the main thing here: keep the drop zone small
dz.addEventListener('keydown', e => { if (e.target === dz && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f).catch(err => say('The browser could not read this file: ' + err.message, true)); });

/* ---------- start: the last code from this browser, or a short starter; nothing runs until Run ---------- */
(() => {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { st = null; }
  if (st && typeof st.code === 'string' && st.code) { fileName = String(st.name || 'scratch.js'); src.value = st.code; $('lang').value = st.lang === 'ts' ? 'ts' : 'js'; $('fname').textContent = fileName; }
  else src.value = "// Type JavaScript here and press Run (or Ctrl+Enter).\nconst words = ['pear', 'fig', 'apple'];\nwords.sort();\nconst lengths = words.map(w => w.length);\nconsole.log('longest:', Math.max(...lengths));\n";
  renderMirror();
})();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
