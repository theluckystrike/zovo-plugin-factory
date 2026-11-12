/* Zovo AGENTS.md and CLAUDE.md Linter (TOOLCHK3, wave18). Files and folders are read in this tab with the File API and
   never sent anywhere: the page CSP sets connect-src 'none'. Pick or paste one instruction file for the checks that
   need no repo (Codex size, outline, the claims it makes), add package.json, a Makefile or .nvmrc for command and
   version checks, or choose the repo folder for every check. Every value is written as text, never as HTML. */
import { lint, isInstruction, needText, CODEX_LIMIT } from './lint.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAXTEXT = 2 * 1024 * 1024, MAXINSTR = 400, MAXPATHS = 400000;

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const int = n => Number(n).toLocaleString('en-US');
const kib = n => (n / 1024).toFixed(1) + ' KiB';
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const plural = (n, w) => `${int(n)} ${w}${n === 1 ? '' : 's'}`;

let res = null, cur = 0, repoName = '', mode = 'paste';

/* ---------- reading ---------- */
async function readText(f) { return f.size > MAXTEXT ? null : (await f.text()).replace(/^﻿/, ''); }
async function fromFiles(list) {  // files picked one by one: all sit at the top of a small repo
  const text = new Map(), paths = new Set(), instr = new Set();
  for (const f of list) {
    const p = f.name; paths.add(p);
    if (needText(p) || /\.(md|mdc|txt)$/i.test(p) || !/\.\w+$/.test(p)) { const t = await readText(f); if (t != null) { text.set(p, t); if (isInstruction(p) || (!needText(p) && /\.(md|mdc|txt)$|^\.\w*rules$/i.test(p))) instr.add(p); } }
  }
  return { mode: 'files', text, paths, dirs: new Set(), instr };
}
async function fromFolder(entries, name) {  // entries: [{ path, file }]
  const text = new Map(), paths = new Set(), dirs = new Set();
  let ni = 0, skipped = 0;
  for (const { path, file } of entries) {
    if (paths.size >= MAXPATHS) { skipped++; continue; }
    paths.add(path);
    const parts = path.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    if (needText(path)) {
      if (isInstruction(path)) { if (++ni > MAXINSTR) continue; }
      const t = await readText(file); if (t != null) text.set(path, t);
    }
  }
  return { mode: 'folder', text, paths, dirs, skipped, name };
}
const SKIPWALK = new Set(['node_modules', '.git']);
function folderFromInput(files) {
  const out = []; let name = '', git = false;
  for (const f of files) {
    const rp = f.webkitRelativePath || f.name, i = rp.indexOf('/');
    if (!name) name = i > 0 ? rp.slice(0, i) : '';
    const p = i > 0 ? rp.slice(i + 1) : rp;
    const segs = p.split('/');
    if (segs.includes('.git')) { git = true; continue; }
    if (segs.includes('node_modules')) continue;
    out.push({ path: p, file: f });
  }
  return { entries: out, name, git };
}
async function walkEntry(dirEntry) {  // a dropped folder: walk it, skipping node_modules and .git
  const out = []; let git = false;
  async function walk(d, prefix) {
    const reader = d.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) {
        if (e.isDirectory) { if (e.name === '.git') { git = true; continue; } if (SKIPWALK.has(e.name)) continue; await walk(e, prefix + e.name + '/'); }
        else if (out.length < MAXPATHS) { const file = await new Promise((res, rej) => e.file(res, rej)); out.push({ path: prefix + e.name, file }); }
      }
    }
  }
  await walk(dirEntry, '');
  return { entries: out, name: dirEntry.name, git };
}

/* ---------- run and show ---------- */
function run(repo, label, t0) {
  mode = repo.mode; repoName = label;
  const n = [...repo.text.keys()].filter(p => repo.instr ? repo.instr.has(p) : isInstruction(p)).length;
  if (!n) {
    say(repo.mode === 'folder' ? `No agent instruction file in ${label}: the linter looks for AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, .cursor/rules/*.mdc, .github/copilot-instructions.md, SKILL.md and the other files listed below.` : 'None of these files is an agent instruction file (AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, a .mdc rule, copilot-instructions.md ...).', true);
    return;
  }
  res = lint(repo);
  cur = 0;
  const tot = { error: 0, warning: 0, info: 0 };
  for (const r of res.results) for (const f of r.finds) if (!f.off) tot[f.sev]++;
  $('fname').textContent = label;
  $('fmeta').textContent = repo.mode === 'folder' ? `${int(repo.paths.size)} files in the folder, ${plural(res.results.length, 'instruction file')}` : plural(res.results.length, 'instruction file');
  const st = $('stats'); st.replaceChildren();
  for (const [k, v] of [['Instruction files', res.results.length], ['Errors', tot.error], ['Warnings', tot.warning], ['Infos', tot.info]]) { const d = el('div', null, 'stat'); d.append(el('span', k, 'k'), el('span', int(v), 'v')); st.append(d); }
  $('modeNote').textContent = repo.mode === 'folder'
    ? `Every check ran on the folder ${label}, read inside this tab` + (repo.skipped ? ` (the first ${int(MAXPATHS)} files; ${int(repo.skipped)} more were not listed)` : '') + '. node_modules and .git are skipped.'
    : repo.mode === 'files'
      ? 'Only the files you picked were read, so paths, @imports and globs were not checked. Add package.json, a Makefile or .nvmrc to check commands and versions, or choose the repo folder to run every check.'
      : 'Pasted text: the size, the outline and the claims are shown. To check commands, paths, imports and versions against your repo, choose the repo folder above.';
  const fb = $('files').tBodies[0]; fb.replaceChildren();
  res.results.forEach((r, i) => {
    const c = { error: 0, warning: 0, info: 0 }; for (const f of r.finds) if (!f.off) c[f.sev]++;
    const tr = document.createElement('tr'); tr.tabIndex = 0;
    tr.append(el('td', r.path, 'mono'), el('td', int(c.error)), el('td', int(c.warning)), el('td', int(c.info)), el('td', kib(r.bytes)), el('td', int(Math.round(r.bytes / 4))), el('td', codexText(r)));
    const pick = () => { cur = i; showFile(); };
    tr.addEventListener('click', pick); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    fb.append(tr);
  });
  $('filesBox').hidden = res.results.length < 2;
  showFile();
  $('drop').hidden = false; $('view').hidden = false;
  const ms = Math.round(performance.now() - t0);
  say(`Opened ${plural(res.results.length, 'instruction file')} in ${int(ms)} ms: ${plural(tot.error, 'error')}, ${plural(tot.warning, 'warning')}, ${plural(tot.info, 'info')}.`);
  self.zovoState = { files: res.results.length, errors: tot.error, warnings: tot.warning, infos: tot.info, mode: repo.mode };
  $('view').scrollIntoView({ block: 'start' });
}
function codexText(r) { const left = CODEX_LIMIT - r.bytes; return left >= 0 ? `${kib(left)} left` : `over by ${kib(-left)}`; }
function showFile() {
  const r = res.results[cur];
  [...$('files').tBodies[0].rows].forEach((tr, i) => tr.classList.toggle('on', i === cur));
  $('curHead').textContent = res.results.length > 1 ? `Findings in ${r.path}` : 'Findings';
  const tb = $('finds').tBodies[0]; tb.replaceChildren();
  for (const f of r.finds) {
    const tr = document.createElement('tr'); if (f.off) tr.className = 'off';
    tr.append(el('td', `${f.line}:${f.col}`, 'ix'), el('td', f.sev, 'sev-' + f.sev), el('td', f.rule), el('td', f.msg + (f.off ? ' (turned off by a context-drift-disable comment)' : '')));
    tb.append(tr);
  }
  const on = r.finds.filter(f => !f.off).length;
  $('findNote').textContent = r.finds.length ? (on < r.finds.length ? `${r.finds.length - on} finding(s) turned off by a comment in the file.` : '') : mode === 'folder' ? 'No findings: the commands, paths, imports and versions this file states match the folder.' : 'No findings from the checks that could run. See below for what was not checked.';
  const sz = $('size'); sz.replaceChildren();
  const isAgents = /(^|\/)AGENTS(\.override)?\.md$/.test(r.path);
  for (const [k, v] of [['Size', `${int(r.bytes)} bytes (${kib(r.bytes)})`], ['About tokens', `${int(Math.round(r.bytes / 4))} (bytes ÷ 4)`], ['Lines', int(r.doc.lines.length)], ['Codex 32 KiB limit', codexText(r)]]) { const tr = document.createElement('tr'); tr.append(el('th', k), el('td', v)); sz.append(tr); }
  $('sizeNote').textContent = isAgents ? 'Codex reads at most 32 KiB of AGENTS.md text by default and also counts the AGENTS.md files above the current folder.' : 'The 32 KiB limit is the one Codex applies to AGENTS.md. It is shown here to compare sizes.';
  const ob = $('outline').tBodies[0]; ob.replaceChildren();
  for (const h of r.doc.headings) { const tr = document.createElement('tr'); const td = el('td', '#'.repeat(h.level) + ' ' + h.text); td.style.setProperty('--d', h.level - 1); tr.append(el('td', String(h.line), 'ix'), td); ob.append(tr); }
  if (!r.doc.headings.length) { const tr = document.createElement('tr'); tr.append(el('td', ''), el('td', 'No headings.', 'nul')); ob.append(tr); }
  const cb = $('claims').tBodies[0]; cb.replaceChildren();
  for (const c of [...r.claims].sort((a, b) => a.line - b.line)) { const tr = document.createElement('tr'); tr.append(el('td', String(c.line), 'ix'), el('td', c.kind), el('td', c.text, 'mono'), el('td', c.checked)); cb.append(tr); }
  if (!r.claims.length) { const tr = document.createElement('tr'); tr.append(el('td', ''), el('td', ''), el('td', 'No commands, paths, imports or versions found.', 'nul'), el('td', '')); cb.append(tr); }
}
$('copy').addEventListener('click', () => {
  if (!res) return;
  const lines = [];
  let e = 0, w = 0, i = 0;
  for (const r of res.results) for (const f of r.finds) if (!f.off) { lines.push(`${r.path}:${f.line}:${f.col}: ${f.sev} ${f.rule} ${f.msg}`); if (f.sev === 'error') e++; else if (f.sev === 'warning') w++; else i++; }
  lines.push(`${res.results.length} instruction file(s) checked: ${e} error(s), ${w} warning(s), ${i} info`);
  const t = lines.join('\n') + '\n';
  (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => say('Copied the findings as text, one per line.'), () => say('The browser did not allow copying.', true));
});

/* ---------- inputs ---------- */
async function openFiles(list) {
  if (!list || !list.length) return;
  const t0 = performance.now();
  say('Reading ...');
  try { const repo = await fromFiles([...list]); run(repo, list.length === 1 ? list[0].name : `${list.length} files`, t0); }
  catch (e) { say('The browser could not read these files: ' + e.message, true); }
}
async function openFolder({ entries, name, git }) {
  const t0 = performance.now();
  if (!entries.length) { say('That folder is empty, or holds only node_modules and .git.', true); return; }
  say(`Reading ${int(entries.length)} files ...`);
  try { const repo = await fromFolder(entries, name); if (git) repo.dirs.add('.git'); run(repo, name || 'the folder', t0); }
  catch (e) { say('The browser could not read this folder: ' + e.message, true); }
}
const pick = $('pick'); pick.multiple = true;
// a folder button in the drop zone, next to the file button
const dirLabel = el('label', 'Choose a repo folder', 'btn filebtn');
const dirInput = document.createElement('input'); dirInput.type = 'file'; dirInput.id = 'pickdir'; dirInput.webkitdirectory = true; dirInput.multiple = true; dirInput.setAttribute('aria-label', 'Choose a repo folder');
dirLabel.append(dirInput);
pick.parentElement.parentElement.append(' ', dirLabel);
for (const inp of [pick, $('pick2')]) inp.addEventListener('change', async e => { await openFiles(e.target.files); e.target.value = ''; });
for (const inp of [dirInput, $('pickdir2')]) inp.addEventListener('change', async e => { await openFolder(folderFromInput(e.target.files)); e.target.value = ''; });
$('check').addEventListener('click', () => {
  const t = $('paste').value;
  if (!t.trim()) { say('Paste the text of an instruction file first.', true); return; }
  const name = $('pasteName').value;
  run({ mode: 'paste', text: new Map([[name, t]]), paths: new Set([name]), dirs: new Set() }, `Pasted ${name}`, performance.now());
});
$('sample').addEventListener('click', async () => {
  const t0 = performance.now();
  const { SAMPLE } = await import('./sample.js');
  const text = new Map(Object.entries(SAMPLE.files)), paths = new Set(text.keys()), dirs = new Set();
  for (const p of paths) { const s = p.split('/'); for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join('/')); }
  run({ mode: 'folder', text, paths, dirs }, SAMPLE.name, t0);
});
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.target === dz && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick.click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', async e => {
  e.preventDefault(); document.body.classList.remove('dragging');
  const items = e.dataTransfer && e.dataTransfer.items;
  const entry = items && items.length === 1 && items[0].webkitGetAsEntry ? items[0].webkitGetAsEntry() : null;
  if (entry && entry.isDirectory) { say('Reading the folder ...'); try { await openFolder(await walkEntry(entry)); } catch (err) { say('The browser could not read this folder: ' + err.message, true); } return; }
  const files = e.dataTransfer && e.dataTransfer.files; if (files && files.length) openFiles(files);
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
