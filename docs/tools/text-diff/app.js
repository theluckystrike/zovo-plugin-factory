/* Zovo Text Diff Online (TOOLCHK3, wave18). Both texts are read in this tab and never sent anywhere: the page CSP
   sets connect-src 'none'. Lines are lined up with the Myers diff of jsdiff 8.0.4 (BSD-3-Clause, cdn.jsdelivr.net,
   pinned, SRI in the import map), run in small steps so the tab stays responsive, with a time limit. Changed lines
   get word highlights. Every line is written as text, never as HTML. */
import { diffArrays } from 'jsdiff/array';
import { diffWordsWithSpace, diffWords } from 'jsdiff/word';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAXFILE = 50 * 1024 * 1024;   // like the Folder Compare setting folderDiff.maxTextDiffMB
const MAXLINES = 1000000;
const TIMEOUT = 6000;                // ms for lining up the lines
const CTX = 3;                       // unchanged lines around a change (view and .patch)
const MAXROWS = 20000;               // rows drawn at once
const WORDPAIRS = 20000, WORDLEN = 5000;

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
const plural = (n, one, many) => int(n) + ' ' + (n === 1 ? one : (many || one + 's'));

/* ---------- reading files ---------- */
const side = { a: { name: '', note: '' }, b: { name: '', note: '' } };
async function readText(file) {
  if (file.size > MAXFILE) throw new Error(`${file.name} is ${size(file.size)}. The page compares text files up to 50 MB.`);
  const buf = new Uint8Array(await file.arrayBuffer());
  const head = String.fromCharCode(...buf.subarray(0, 5));
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [, ''])[1].toLowerCase();
  if (head.startsWith('PK\u0003\u0004') && /^(docx|docm|xlsx|xlsm|odt|ods|pptx)$/.test(ext))
    throw new Error(`${file.name} is a Word, Excel or OpenDocument file, not plain text. The Folder Compare extension for VS Code opens Word files as Markdown and Excel files as CSV rows side by side.`);
  if (head === '%PDF-') throw new Error(`${file.name} is a PDF, not plain text. The Folder Compare extension for VS Code compares PDFs as the text of every page.`);
  let text, note = '';
  if (buf[0] === 0xff && buf[1] === 0xfe) { text = new TextDecoder('utf-16le').decode(buf); note = 'UTF-16'; }
  else if (buf[0] === 0xfe && buf[1] === 0xff) { text = new TextDecoder('utf-16be').decode(buf); note = 'UTF-16'; }
  else {
    if (buf.subarray(0, 8000).includes(0)) throw new Error(`${file.name} looks like a binary file (it has zero bytes), so there are no lines to compare. The Folder Compare extension for VS Code shows binary files as hex lines around every range of bytes that differs.`);
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { text = new TextDecoder('windows-1252').decode(buf); note = 'read as Windows-1252 (not valid UTF-8)'; }
  }
  return { text: text.replace(/^﻿/, ''), note };
}
async function load(which, file) {
  if (!file) return false;
  say(`Reading ${file.name} ...`);
  try {
    const r = await readText(file);
    side[which] = { name: file.name, note: r.note, size: file.size, raw: r.text };  // raw keeps CRLF (a textarea turns it into LF)
    $(which === 'a' ? 'ta' : 'tb').value = r.text;
    return true;
  } catch (e) { say(e.message, true); return false; }
}
async function openFiles(files, target) {
  files = [...files].filter(Boolean);
  if (!files.length) return;
  if (files.length > 2) { say(`You picked ${files.length} files. Pick two: the original and the changed one.`, true); return; }
  if (files.length === 2) {
    const [f1, f2] = files[0].lastModified <= files[1].lastModified ? files : [files[1], files[0]];
    if (!(await load('a', f1)) || !(await load('b', f2))) return;
    showView(); compare(`The older file (${f1.name}) is on the left. Swap sides to turn it around.`);
    return;
  }
  const which = target || (!$('ta').value && !side.a.name ? 'a' : $('view').hidden ? 'a' : 'b');
  if (which === 'a' && $('view').hidden) { side.b = { name: '', note: '' }; $('tb').value = ''; }
  if (!(await load(which, files[0]))) return;
  showView();
  if (!$('tb').value && which === 'a') { refreshNames(); clearResult(); say(`Opened ${files[0].name}. Now open the changed file on the right, or paste its text.`); return; }
  compare();
}
function showView() { $('drop').hidden = true; $('pasteRow').hidden = true; $('view').hidden = false; refreshNames(); }
function refreshNames() {
  const lab = s => s.name ? s.name + (s.note ? ' (' + s.note + ')' : '') : '';
  $('nameA').textContent = lab(side.a) || 'typed or pasted';
  $('nameB').textContent = lab(side.b) || 'typed or pasted';
  $('fname').textContent = side.a.name || side.b.name ? `${side.a.name || 'Original'} vs ${side.b.name || 'Changed'}` : 'Two texts';
}

/* ---------- lines and keys ---------- */
function splitLines(text) {
  const raw = text.split('\n');
  const noEol = raw.length > 0 && raw[raw.length - 1] === '' ? false : text.length > 0;
  if (!noEol || text.length === 0) raw.pop();
  let crlf = 0;
  const lines = raw.map(l => { if (l.endsWith('\r')) { crlf++; return { t: l.slice(0, -1), cr: true }; } return { t: l, cr: false }; });
  return { lines, noEol, crlf };
}
function keys(L, o, otherNoEol) {
  return L.lines.map((l, i) => {
    let k = l.t;
    if (o.ws) k = k.replace(/\s+/g, '');
    if (o.ic) k = k.toLowerCase();
    if (!o.eol && l.cr) k += '\r';
    if (i === L.lines.length - 1 && L.noEol) k += '\u0000';  // a last line with no newline only matches the same (as in diff -u)
    return k;
  });
}

/* ---------- compare ---------- */
let seq = 0, last = null, expanded = new Set(), curHunk = -1;
function opts() { return { ws: $('ws').checked, ic: $('ic').checked, eol: $('eol').checked, fold: $('fold').checked, mode: $('mode').value }; }
function clearResult() { $('diff').replaceChildren(); $('counts').textContent = ''; $('pos').textContent = ''; $('note').textContent = ''; last = null; setNav(); }

function compare(extra) {
  const id = ++seq, o = opts(), t0 = performance.now();
  const txt = (w, id) => side[w].raw != null ? side[w].raw : $(id).value;
  const A = splitLines(txt('a', 'ta')), B = splitLines(txt('b', 'tb'));
  if (A.lines.length > MAXLINES || B.lines.length > MAXLINES) { say(`The page compares up to ${int(MAXLINES)} lines a side.`, true); return; }
  const ka = keys(A, o, B.noEol), kb = keys(B, o, A.noEol);
  say(A.lines.length + B.lines.length > 200000 ? `Comparing ${int(A.lines.length)} and ${int(B.lines.length)} lines ...` : 'Comparing ...');
  // common start and end first: the diff then only lines up the middle
  let pre = 0; const n = Math.min(ka.length, kb.length);
  while (pre < n && ka[pre] === kb[pre]) pre++;
  let suf = 0;
  while (suf < n - pre && ka[ka.length - 1 - suf] === kb[kb.length - 1 - suf]) suf++;
  const ma = ka.slice(pre, ka.length - suf), mb = kb.slice(pre, kb.length - suf);
  const finish = (changes, fellBack) => {
    if (id !== seq) return;
    const ops = [];
    const push = (t, a0, b0, n2) => { if (!n2) return; const p = ops[ops.length - 1]; if (p && p.t === t && t !== 'eq') { p.n += n2; return; } ops.push({ t, a0, b0, n: n2 }); };
    push('eq', 0, 0, pre);
    let ia = pre, ib = pre;
    if (changes) for (const c of changes) {
      const k = c.count != null ? c.count : c.value.length;
      if (c.added) { push('add', ia, ib, k); ib += k; } else if (c.removed) { push('del', ia, ib, k); ia += k; } else { push('eq', ia, ib, k); ia += k; ib += k; }
    } else { push('del', ia, ib, ma.length); ia += ma.length; push('add', ia, ib, mb.length); ib += mb.length; }
    push('eq', ia, ib, suf);
    last = { A, B, o, ops: normalise(ops), fellBack, ms: Math.round(performance.now() - t0), extra };
    expanded = new Set(); curHunk = -1;
    render();
  };
  if (!ma.length || !mb.length) { finish(null, false); return; }
  // quick pass on this thread first (most edits line up in a few ms), then small steps that keep the tab responsive
  const quick = diffArrays(ma, mb, { timeout: 250 });
  if (quick) { finish(quick, false); return; }
  diffArrays(ma, mb, { timeout: TIMEOUT, callback: ch => finish(ch, !ch) });
}
// del then add next to each other, in that order, so a change block reads old first
function normalise(ops) {
  const out = [];
  for (const op of ops) {
    const p = out[out.length - 1];
    if (p && op.t === 'del' && p.t === 'add') { out.pop(); out.push(op, p); continue; }
    out.push(op);
  }
  return out;
}

/* ---------- rows ---------- */
function blocks(ops) {
  // [{t:'eq', a0, b0, n}] and [{t:'chg', a0, na, b0, nb}]
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.t === 'eq') { out.push(op); continue; }
    const b = { t: 'chg', a0: op.a0, b0: op.b0, na: 0, nb: 0 };
    while (i < ops.length && ops[i].t !== 'eq') { if (ops[i].t === 'del') { b.na += ops[i].n; } else { b.nb += ops[i].n; } i++; }
    i--;
    out.push(b);
  }
  return out;
}
/* Pairs the old and new lines of one change block by likeness (bigram Dice score, DP in order), so a changed
   line sits next to its new version even when lines were added or removed around it. Big blocks pair by position. */
function bigrams(t) {
  const s = t.trim().toLowerCase(), m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.substr(i, 2); m.set(g, (m.get(g) || 0) + 1); }
  return { m, n: Math.max(0, s.length - 1), s };
}
function dice(x, y) {
  if (x.s === y.s) return 1;
  if (!x.n || !y.n) return 0;
  let c = 0; for (const [g, k] of x.m) { const k2 = y.m.get(g); if (k2) c += Math.min(k, k2); }
  return 2 * c / (x.n + y.n);
}
function align(A, B, b, o) {
  const out = [];
  if (!b.na || !b.nb || b.na * b.nb > 4000) {
    for (let i = 0; i < Math.max(b.na, b.nb); i++) out.push([i < b.na ? b.a0 + i : -1, i < b.nb ? b.b0 + i : -1]);
    return out;
  }
  const xa = [], xb = [];
  for (let i = 0; i < b.na; i++) xa.push(bigrams(A.lines[b.a0 + i].t.slice(0, 2000)));
  for (let j = 0; j < b.nb; j++) xb.push(bigrams(B.lines[b.b0 + j].t.slice(0, 2000)));
  const W = b.nb + 1, f = new Float64Array((b.na + 1) * W), mv = new Uint8Array((b.na + 1) * W);
  for (let i = 1; i <= b.na; i++) for (let j = 1; j <= b.nb; j++) {
    let best = f[(i - 1) * W + j], m = 1;
    if (f[i * W + j - 1] > best) { best = f[i * W + j - 1]; m = 2; }
    const sc = dice(xa[i - 1], xb[j - 1]);
    if (sc >= 0.4 && f[(i - 1) * W + j - 1] + sc > best) { best = f[(i - 1) * W + j - 1] + sc; m = 3; }
    f[i * W + j] = best; mv[i * W + j] = m;
  }
  const pairs = [];
  for (let i = b.na, j = b.nb; i > 0 && j > 0;) {
    const m = mv[i * W + j];
    if (m === 3) { pairs.push([i - 1, j - 1]); i--; j--; } else if (m === 1) i--; else j--;
  }
  pairs.reverse();
  let i = 0, j = 0;
  for (const [pi, pj] of [...pairs, [b.na, b.nb]]) {
    // lines with no partner, in order: old ones first, side by side with new ones where both are left over
    const da = pi - i, db = pj - j;
    for (let k = 0; k < Math.max(da, db); k++) out.push([k < da ? b.a0 + i + k : -1, k < db ? b.b0 + j + k : -1]);
    if (pi < b.na) out.push([b.a0 + pi, b.b0 + pj]);
    i = pi + 1; j = pj + 1;
  }
  return out;
}
function words(a, b, o) {
  if (a.length > WORDLEN || b.length > WORDLEN) return null;
  const parts = (o.ws ? diffWords : diffWordsWithSpace)(a, b, { ignoreCase: o.ic });
  let same = 0;
  for (const p of parts) if (!p.added && !p.removed) same += p.value.replace(/\s/g, '').length;
  const tot = Math.max(a.replace(/\s/g, '').length, b.replace(/\s/g, '').length, 1);
  if (same / tot < 0.25) return null;  // lines that share little: no highlight, it would only be noise
  return parts;
}
function textCell(cls, text, parts, sideName) {
  const td = el('td', null, cls);
  if (!parts) { td.textContent = text; return td; }
  for (const p of parts) {
    if (sideName === 'a' && p.added) continue;
    if (sideName === 'b' && p.removed) continue;
    td.append(p.added ? el('ins', p.value) : p.removed ? el('del', p.value) : document.createTextNode(p.value));
  }
  return td;
}

function render() {
  const L = last; if (!L) return;
  const { A, B, o } = L;
  const split = o.mode === 'split';
  const tab = $('diff');
  tab.className = 'tdtab ' + (split ? 'split' : 'inline');
  const body = el('tbody');
  const bl = blocks(L.ops);
  let added = 0, removed = 0, changed = 0, hunks = 0, rows = 0, wordPairs = 0, cut = false;
  const hunkRows = [];
  const lnA = i => String(i + 1), lnB = i => String(i + 1);
  const row = cells => { const tr = el('tr'); tr.append(...cells); body.append(tr); rows++; return tr; };
  const gap = (n, key) => {
    const tr = el('tr', null, 'gap'); const td = el('td'); td.colSpan = split ? 6 : 4;
    const btn = el('button', `Show ${plural(n, 'unchanged line')}`); btn.type = 'button';
    btn.addEventListener('click', () => { expanded.add(key); const y = $('wrap').scrollTop; render(); $('wrap').scrollTop = y; });
    td.append(btn); tr.append(td); body.append(tr); rows++;
  };
  const eqRow = (ia, ib) => {
    const a = A.lines[ia].t, b = B.lines[ib].t;
    if (split) row([el('td', lnA(ia), 'ln'), el('td', ' ', 'sg'), el('td', a, 'tx l'), el('td', lnB(ib), 'ln'), el('td', ' ', 'sg'), el('td', b, 'tx')]);
    else row([el('td', lnA(ia), 'ln'), el('td', lnB(ib), 'ln'), el('td', ' ', 'sg'), el('td', b, 'tx')]);
  };
  for (let k = 0; k < bl.length; k++) {
    const b = bl[k];
    if (rows > MAXROWS) { cut = true; }
    if (b.t === 'eq') {
      const first = k === 0, lastB = k === bl.length - 1;
      const keepTop = first ? 0 : CTX, keepEnd = lastB ? 0 : CTX;
      if (cut) continue;
      if (o.fold && b.n > keepTop + keepEnd + 1 && !expanded.has(b.a0)) {
        for (let i = 0; i < keepTop; i++) eqRow(b.a0 + i, b.b0 + i);
        gap(b.n - keepTop - keepEnd, b.a0);
        for (let i = b.n - keepEnd; i < b.n; i++) eqRow(b.a0 + i, b.b0 + i);
      } else for (let i = 0; i < b.n; i++) { if (rows > MAXROWS) { cut = true; break; } eqRow(b.a0 + i, b.b0 + i); }
      continue;
    }
    hunks++;
    const items = align(A, B, b, o);
    const pairs = items.filter(x => x[0] >= 0 && x[1] >= 0).length;
    changed += pairs; removed += b.na - pairs; added += b.nb - pairs;
    if (cut) continue;
    hunkRows.push(body.children.length);
    for (const [ia, ib] of items) {
      if (rows > MAXROWS) { cut = true; break; }
      const a = ia >= 0 ? A.lines[ia].t : null, bb = ib >= 0 ? B.lines[ib].t : null;
      const parts = a != null && bb != null && wordPairs++ < WORDPAIRS ? words(a, bb, o) : null;
      if (split) {
        row([el('td', ia >= 0 ? lnA(ia) : '', 'ln'), el('td', ia >= 0 ? '-' : '', 'sg' + (ia >= 0 ? ' del' : '')), ia >= 0 ? textCell('tx l del', a, parts, 'a') : el('td', '', 'tx l emp'),
          el('td', ib >= 0 ? lnB(ib) : '', 'ln'), el('td', ib >= 0 ? '+' : '', 'sg' + (ib >= 0 ? ' add' : '')), ib >= 0 ? textCell('tx add', bb, parts, 'b') : el('td', '', 'tx emp')]);
      } else {
        if (ia >= 0) row([el('td', lnA(ia), 'ln'), el('td', '', 'ln'), el('td', '-', 'sg del'), textCell('tx del', a, parts, 'a')]);
        if (ib >= 0) row([el('td', '', 'ln'), el('td', lnB(ib), 'ln'), el('td', '+', 'sg add'), textCell('tx add', bb, parts, 'b')]);
      }
    }
  }
  tab.replaceChildren(body);
  L.hunkRows = hunkRows; L.hunks = hunks;
  // counts and notes
  const c = $('counts'); c.replaceChildren();
  const ign = [o.ws && 'whitespace', o.ic && 'case', o.eol && (A.crlf || B.crlf) && 'line endings'].filter(Boolean);
  if (!hunks) {
    c.textContent = A.lines.length === 0 && B.lines.length === 0 ? 'Both sides are empty.' : 'No differences' + (ign.length ? ` (${ign.join(', ')} ignored)` : '') + '.';
  } else {
    c.append(el('span', `${plural(changed, 'line')} changed`), document.createTextNode(', '), el('span', `${plural(added, 'line')} added`, 'a'), document.createTextNode(', '),
      el('span', `${plural(removed, 'line')} removed`, 'd'), document.createTextNode(` in ${plural(hunks, 'place')}`));
  }
  const notes = [];
  if (L.fellBack) notes.push(`The texts differ in too many places to line up within ${TIMEOUT / 1000} seconds, so the changed middle part is shown as removed and added lines.`);
  if (!o.eol && (A.crlf || B.crlf) && (A.crlf !== A.lines.length || B.crlf !== B.lines.length)) notes.push('Line endings count: a line that differs only in CRLF or LF shows as changed with no visible change.');
  if (o.eol && (A.crlf > 0) !== (B.crlf > 0)) notes.push(`Line endings differ: the original uses ${A.crlf ? 'CRLF' : 'LF'}, the changed text ${B.crlf ? 'CRLF' : 'LF'} (ignored).`);
  if (A.noEol !== B.noEol && A.lines.length && B.lines.length) notes.push(`${A.noEol ? 'The original' : 'The changed text'} has no newline at the end.`);
  if (cut) notes.push(`Showing the first ${int(MAXROWS)} rows. Save .patch has every change.`);
  if (L.extra) notes.push(L.extra);
  $('note').textContent = notes.join(' ');
  $('fmeta').textContent = `${plural(A.lines.length, 'line')} and ${plural(B.lines.length, 'line')}`;
  say(`Opened and compared in ${L.ms} ms.`);
  setNav();
  self.zovoState = { added, removed, changed, hunks, fellBack: L.fellBack, rows, linesA: A.lines.length, linesB: B.lines.length };
}

/* ---------- next and previous change ---------- */
function setNav() {
  const n = last && last.hunkRows ? last.hunkRows.length : 0;
  $('prev').disabled = !n; $('next').disabled = !n; $('patch').disabled = !(last && last.hunks);
  $('pos').textContent = n ? (curHunk >= 0 ? `Change ${curHunk + 1} of ${n}` : `${plural(n, 'change')} shown`) : '';
}
function go(d) {
  const L = last; if (!L || !L.hunkRows.length) return;
  curHunk = curHunk < 0 ? (d > 0 ? 0 : L.hunkRows.length - 1) : (curHunk + d + L.hunkRows.length) % L.hunkRows.length;
  const rowsEl = $('diff').tBodies[0].rows;
  for (const r of $('diff').querySelectorAll('tr.cur')) r.classList.remove('cur');
  const tr = rowsEl[L.hunkRows[curHunk]];
  if (tr) {
    tr.classList.add('cur');
    const w = $('wrap');
    w.scrollTop = Math.max(0, tr.offsetTop - w.clientHeight / 3);
    if (w.getBoundingClientRect().top < 0 || w.getBoundingClientRect().top > innerHeight) w.scrollIntoView({ block: 'start' });
  }
  setNav();
}
$('next').addEventListener('click', () => go(1));
$('prev').addEventListener('click', () => go(-1));

/* ---------- unified diff ---------- */
function patchText(L) {
  const { A, B, ops } = L;
  const out = [`--- a/${side.a.name || 'original'}`, `+++ b/${side.b.name || 'changed'}`];
  // flatten to line entries
  const ents = [];
  for (const op of ops) for (let i = 0; i < op.n; i++) ents.push(op.t === 'eq' ? [' ', op.a0 + i, op.b0 + i] : op.t === 'del' ? ['-', op.a0 + i, -1] : ['+', -1, op.b0 + i]);
  const changedIdx = []; ents.forEach((e, i) => { if (e[0] !== ' ') changedIdx.push(i); });
  let k = 0;
  while (k < changedIdx.length) {
    let s = Math.max(0, changedIdx[k] - CTX), e = changedIdx[k];
    while (k + 1 < changedIdx.length && changedIdx[k + 1] - e <= 2 * CTX + 1) { k++; e = changedIdx[k]; }
    e = Math.min(ents.length - 1, e + CTX);
    const hunk = ents.slice(s, e + 1);
    const firstA = hunk.find(x => x[1] >= 0), firstB = hunk.find(x => x[2] >= 0);
    const na = hunk.filter(x => x[0] !== '+').length, nb = hunk.filter(x => x[0] !== '-').length;
    const sa = na ? firstA[1] + 1 : (firstA ? firstA[1] : startBefore(ents, s, 1)), sb = nb ? firstB[2] + 1 : (firstB ? firstB[2] : startBefore(ents, s, 2));
    out.push(`@@ -${sa}${na === 1 ? '' : ',' + na} +${sb}${nb === 1 ? '' : ',' + nb} @@`);
    for (const [t, ia, ib] of hunk) {
      const line = t === '+' ? B.lines[ib] : A.lines[ia];
      out.push(t + line.t + (line.cr ? '\r' : ''));
      const isLastA = ia === A.lines.length - 1 && A.noEol, isLastB = ib === B.lines.length - 1 && B.noEol;
      if ((t === '-' && isLastA) || (t === '+' && isLastB) || (t === ' ' && (isLastA || isLastB))) out.push('\\ No newline at end of file');
    }
    k++;
  }
  return out.join('\n') + '\n';
}
function startBefore(ents, s, col) { for (let i = s - 1; i >= 0; i--) if (ents[i][col] >= 0) return ents[i][col] + 1; return 0; }
$('patch').addEventListener('click', () => {
  if (!last || !last.hunks) return;
  const name = (side.b.name || side.a.name || 'changes').replace(/\.[^.]*$/, '') + '.patch';
  const a = el('a'); a.href = URL.createObjectURL(new Blob([patchText(last)], { type: 'text/x-diff' })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  say(`Saved ${name} (unified diff, ${CTX} lines of context) to your downloads.`);
});
self.zovoPatch = () => last && patchText(last);  // for the page test

/* ---------- events ---------- */
let debounce = 0;
for (const id of ['ta', 'tb']) $(id).addEventListener('input', () => {
  const s = side[id === 'ta' ? 'a' : 'b']; s.raw = null; if (s.name && !s.name.endsWith(' (edited)')) { s.name += ' (edited)'; refreshNames(); }
  clearTimeout(debounce); debounce = setTimeout(() => compare(), $('ta').value.length + $('tb').value.length > 2e6 ? 1200 : 400);
});
for (const id of ['ws', 'ic', 'eol']) $(id).addEventListener('change', () => compare());
for (const id of ['fold', 'mode']) $(id).addEventListener('change', () => { if (last) { last.o = Object.assign(last.o, opts()); render(); } });
$('swap').addEventListener('click', () => {
  const t = $('ta').value; $('ta').value = $('tb').value; $('tb').value = t;
  [side.a, side.b] = [side.b, side.a]; refreshNames(); compare();
});
$('paste').addEventListener('click', () => {
  side.a = { name: '', note: '' }; side.b = { name: '', note: '' }; $('ta').value = ''; $('tb').value = '';
  showView(); clearResult(); say('Paste the original text on the left and the changed text on the right. The diff updates as you type.'); $('ta').focus();
});
if (matchMedia('(max-width: 700px)').matches) $('mode').value = 'inline';  // phones: one column reads better
$('pick').multiple = true;
$('pick').addEventListener('change', e => { openFiles(e.target.files); e.target.value = ''; });
$('pick2').addEventListener('change', e => { openFiles(e.target.files); e.target.value = ''; });
$('pickA').addEventListener('change', e => { openFiles(e.target.files, 'a'); e.target.value = ''; });
$('pickB').addEventListener('change', e => { openFiles(e.target.files, 'b'); e.target.value = ''; });
$('sample').addEventListener('click', async () => {
  const { SAMPLE } = await import('./sample.js');
  side.a = { name: SAMPLE.a.name, note: '' }; side.b = { name: SAMPLE.b.name, note: '' };
  $('ta').value = SAMPLE.a.data; $('tb').value = SAMPLE.b.data;
  showView(); compare();
});
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => {
  e.preventDefault(); document.body.classList.remove('dragging');
  const files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return;
  const sideEl = e.target.closest && e.target.closest('.tdside');
  openFiles(files, files.length === 1 && sideEl ? (sideEl.querySelector('#ta') ? 'a' : 'b') : undefined);
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
