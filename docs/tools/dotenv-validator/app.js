/* Dotenv Validator (TOOLCHK4, wave18, 13 Nov 2026). Checks a .env file with the Dotenv extension's own parser
   (engine.js, MIT): the problems and quick fixes it shows in VS Code, the keys, ${NAME} uses, secret values hidden on
   screen, and Format. The file is read with the File API in this tab and never sent anywhere. File text is only ever
   written with textContent. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine;
  const MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 3000;
  const TEMPLATES = ['.env.example', '.env.sample', '.env.template', '.env.dist', '.env.defaults'];
  const DOTS = '•'.repeat(8);
  let name = '.env', text = '', res = null, history = [];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const n = (x) => x.toLocaleString('en-US');
  const isTemplate = () => TEMPLATES.includes(name.split('/').pop());  // the extension's default envFile.unmaskedFiles
  const masked = (key) => { const m = $('mask').value; if (m === 'off' || isTemplate()) return false; return m === 'all' || E.isSecretKey(key); };

  function analyse() {
    res = E.parse(text);
    const c = { error: 0, warning: 0, info: 0 };
    for (const p of res.problems) c[p.severity]++;
    const hidden = res.entries.filter((e) => masked(e.key)).length;
    const refs = res.entries.reduce((s, e) => s + e.refs.length, 0);
    self.zovoState = { keys: res.entries.length, problems: res.problems.length, errors: c.error, warnings: c.warning, infos: c.info, hidden, refs, lines: text.split('\n').length };
    render(c, hidden, refs);
    return c;
  }

  function render(c, hidden, refs) {
    const stats = $('stats'); stats.textContent = '';
    const tile = (k, v) => { const d = el('div', 'stat'); d.append(el('div', 'k', k), el('div', 'v', v)); stats.appendChild(d); };
    tile('Keys', n(res.entries.length)); tile('Errors', n(c.error)); tile('Warnings', n(c.warning)); tile('Notes', n(c.info));
    tile('Values hidden', isTemplate() ? 'none (template)' : n(hidden)); tile('${NAME} uses', n(refs));
    // problems
    const pb = $('probs').tBodies[0]; pb.textContent = '';
    const probs = [...res.problems].sort((a, b) => a.line - b.line || a.start - b.start);
    if (!probs.length) { const tr = el('tr'); const td = el('td', 'ok', 'No problems found. This file reads the same in dotenv, Docker Compose and a shell.'); td.colSpan = 4; tr.appendChild(td); pb.appendChild(tr); }
    for (const p of probs) {
      const tr = el('tr');
      const lv = el('span', 'lv ' + p.severity, p.severity === 'info' ? 'note' : p.severity);
      const tdl = el('td'); tdl.appendChild(lv);
      const fixTd = el('td');
      if (p.fix) { const b = el('button', null, 'Fix'); b.type = 'button'; b.title = p.fix.title; b.setAttribute('aria-label', p.fix.title); b.addEventListener('click', (ev) => { ev.stopPropagation(); edit(E.applyFixes(text, [p.fix]), p.fix.title + '.'); }); fixTd.append(b, el('span', 'small mut', ' ' + p.fix.title)); }
      tr.append(el('td', 'mono', String(p.line + 1)), tdl, el('td', null, p.message), fixTd);
      tr.addEventListener('click', () => jump(p.line));
      pb.appendChild(tr);
    }
    $('fixAll').disabled = !probs.some((p) => p.fix);
    renderKeys();
    renderSrc();
  }

  function renderKeys() {
    const q = $('q').value.trim().toLowerCase();
    const list = res.entries.filter((e) => !q || e.key.toLowerCase().includes(q));
    const kb = $('keys').tBodies[0]; kb.textContent = '';
    for (const e of list.slice(0, MAX_ROWS)) {
      const tr = el('tr'); tr.tabIndex = 0;
      const k = el('td', 'mono'); k.append(el('span', null, e.key));
      if (e.exported) k.append(el('span', 'tagx', 'export'));
      if (E.isSecretKey(e.key)) k.append(el('span', 'tagx sec', 'secret'));
      const hide = masked(e.key);
      const v = el('td', 'v' + (hide ? ' masked' : ''), hide ? (e.value ? DOTS : '(empty)') : (e.value === '' ? '(empty)' : e.value.replace(/\n/g, ' ↵ ')));
      if (!hide) v.title = e.value;
      const quotes = { '': 'none', '"': 'double', "'": 'single', '`': 'back' }[e.quote] + (e.endLine > e.line ? ', ' + (e.endLine - e.line + 1) + ' lines' : '');
      tr.append(el('td', 'mono', String(e.line + 1)), k, v, el('td', 'small', quotes), el('td', 'mono small', e.refs.map((r) => r.name).join(', ')));
      const go = () => jump(e.line);
      tr.addEventListener('click', go); tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
      kb.appendChild(tr);
    }
    $('keyCount').textContent = (list.length === res.entries.length ? n(list.length) + ' keys' : n(list.length) + ' of ' + n(res.entries.length) + ' keys') + (list.length > MAX_ROWS ? ', first ' + n(MAX_ROWS) + ' shown' : '');
  }

  // The file text with hidden values replaced by dots (line breaks kept), and problem lines marked.
  function renderSrc() {
    const ranges = res.entries.filter((e) => masked(e.key) && e.valueEnd > e.valueStart).map((e) => [e.valueStart, e.valueEnd]).sort((a, b) => a[0] - b[0]);
    let shown = '', at = 0;
    for (const [a, b] of ranges) { if (a < at) continue; shown += text.slice(at, a) + text.slice(a, b).replace(/[^\n]/g, '•').replace(/•{9,}/g, DOTS); at = b; }
    shown += text.slice(at);
    const sev = new Map(), rank = { error: 3, warning: 2, info: 1 };
    for (const p of res.problems) if ((rank[p.severity] || 0) > (rank[sev.get(p.line)] || 0)) sev.set(p.line, p.severity);
    const box = $('src'); box.textContent = '';
    const lines = shown.split('\n');
    const frag = document.createDocumentFragment();
    for (let i = 0; i < Math.min(lines.length, 20000); i++) {
      const s = lines[i].replace(/\r$/, '');
      const r = el('div', 'ln' + (sev.has(i) ? ' ' + { error: 'err', warning: 'warn', info: 'info' }[sev.get(i)] : ''));
      r.dataset.line = i;
      const c = el('span', 'c');
      const t = s.trim();
      if (t.startsWith('#')) c.append(el('span', 'cm', s));
      else { const m = /^(\s*(?:export\s+)?)([^=]*?)(\s*=.*)?$/.exec(s); if (m && m[3] !== undefined) c.append(document.createTextNode(m[1]), el('span', 'k', m[2]), document.createTextNode(m[3])); else c.textContent = s; }
      r.append(el('span', 'n', String(i + 1)), c);
      frag.appendChild(r);
    }
    box.appendChild(frag);
    if (lines.length > 20000) box.appendChild(el('p', 'small mut', 'Showing the first 20,000 lines.'));
  }

  function jump(line) {
    const r = $('src').querySelector('[data-line="' + line + '"]');
    if (!r) return;
    $('src').querySelectorAll('.flash').forEach((x) => x.classList.remove('flash'));
    r.classList.add('flash');
    $('src').scrollTop = Math.max(0, r.offsetTop - 80);
    $('src').scrollIntoView({ block: 'nearest' });
  }

  function edit(next, note) {
    if (next === text) { $('editNote').textContent = 'Nothing to change.'; return; }
    history.push(text); text = next; $('undo').disabled = false;
    $('editNote').textContent = note + ' Save to keep the change.';
    analyse();
  }

  self.zovoOpen = async (file) => {
    if (file.size > MAX_BYTES) throw new Error('the file is ' + self.zovoSize(file.size) + '. This page checks .env files up to 5 MB.');
    const t = await file.text();
    if (t.slice(0, 8000).includes('\u0000')) throw new Error('this is a binary file, not a .env text file.');
    name = file.name || '.env'; text = t.replace(/^﻿/, ''); history = []; $('undo').disabled = true; $('editNote').textContent = '';
    const c = analyse();
    const total = c.error + c.warning + c.info;
    return 'Checked ' + n(res.entries.length) + ' key' + (res.entries.length === 1 ? '' : 's') + ': ' + (total ? n(c.error) + ' error' + (c.error === 1 ? '' : 's') + ', ' + n(c.warning) + ' warning' + (c.warning === 1 ? '' : 's') + ', ' + n(c.info) + ' note' + (c.info === 1 ? '' : 's') + '.' : 'no problems.') + (isTemplate() ? ' Template file, so values are shown.' : '');
  };

  $('mask').addEventListener('change', () => { if (res) analyse(); });
  let qt; $('q').addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(renderKeys, 100); });
  $('fmt').addEventListener('click', () => { const k = E.formatEdits(text).length; edit(E.format(text), 'Format changed ' + n(k) + ' place' + (k === 1 ? '' : 's') + ' (spaces around = and trailing spaces).'); });
  $('fixAll').addEventListener('click', () => {
    const fixes = [], used = [];
    for (const p of res.problems) { if (!p.fix) continue; if (used.some(([a, b]) => p.fix.start < b && a < p.fix.end)) continue; used.push([p.fix.start, p.fix.end]); fixes.push(p.fix); }
    edit(E.applyFixes(text, fixes), 'Applied ' + n(fixes.length) + ' quick fix' + (fixes.length === 1 ? '' : 'es') + '.');
  });
  $('undo').addEventListener('click', () => { if (!history.length) return; text = history.pop(); $('undo').disabled = !history.length; $('editNote').textContent = 'Undone.'; analyse(); });
  $('save').addEventListener('click', () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name.split('/').pop() || '.env';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('pasteGo').addEventListener('click', () => { const t = $('pasteText').value; if (!t.trim()) { self.zovoMsg('Paste the text of a .env file first.', true); return; } self.zovoOpenFiles([new File([t], '.env', { type: 'text/plain' })]); });
})();
