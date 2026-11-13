/* Nginx Config Formatter (TOOLCHK4, wave18, 13 Nov 2026). Formats and checks nginx config files with the Nginx Config
   extension's own parser, formatter, checks, directive help and include loader (engine.js, MIT). The files you pick are
   placed under /etc/nginx in memory, so relative and /etc/nginx includes among them are followed. Files are read with
   the File API in this tab and never sent anywhere. File text is written with textContent only. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine;
  const BASE = '/etc/nginx', MAX_BYTES = 16 * 1024 * 1024, MAX_FILES = 500, MAX_PROBLEMS = 1000;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const n = (x) => x.toLocaleString('en-US');
  const plural = (k, w) => n(k) + ' ' + w + (k === 1 ? '' : 's');
  const relOf = new WeakMap();
  let files = new Map(), cur = '', lastFmt = null, lastProblems = [], fixed = new Set(), dirSel = '';
  const short = (p) => (p.startsWith(BASE + '/') ? p.slice(BASE.length + 1) : p);
  const baseName = (p) => p.split('/').pop();

  const lintOf = (p) => E.lint(files.get(p), { fileName: p, unknown: 'info' })
    .sort((a, b) => a.line - b.line || (a.col || 0) - (b.col || 0));

  function mainFile() {
    const keys = [...files.keys()];
    const conf = keys.filter((p) => baseName(p) === 'nginx.conf').sort((a, b) => a.split('/').length - b.split('/').length);
    return conf[0] || cur;
  }

  function renderAll() {
    const text = files.get(cur);
    const ds = lintOf(cur);
    lastProblems = ds;
    const parsed = E.parse(text);
    let dirCount = 0, blocks = 0;
    E.walk(parsed.nodes, (x) => { if (x.type === 'directive') { dirCount++; if (x.block) blocks++; } });
    const errs = ds.filter((d) => d.severity === 'error').length, warns = ds.filter((d) => d.severity === 'warning').length;
    const ov = renderOverview();
    const stats = $('stats'); stats.textContent = '';
    const tile = (k, v) => { const d = el('div', 'stat'); d.append(el('div', 'k', k), el('div', 'v', v)); stats.appendChild(d); };
    tile('Lines', n(text.split('\n').length)); tile('Directives', n(dirCount)); tile('Servers', n(ov.servers)); tile('Locations', n(ov.locations));
    tile('Errors', n(errs)); tile('Warnings', n(warns));
    renderProblems(ds, text);
    renderFormat();
    renderDirs(parsed);
    $('tabProblems').textContent = 'Problems (' + n(ds.length) + ')';
    self.zovoState = { file: cur, files: files.size, lines: text.split('\n').length, directives: dirCount, blocks, errors: errs, warnings: warns, other: ds.length - errs - warns,
      servers: ov.servers, locations: ov.locations, upstreams: ov.upstreams, missing: ov.missing, formatted: !!(lastFmt && lastFmt.text != null), changedLines: lastFmt ? lastFmt.changed : 0 };
    return { errs, warns };
  }

  const fixable = (d) => (d.code === 'missing-semicolon' && d.fix) || (d.code === 'unknown-directive' && d.fix && d.fix.replace);

  function renderProblems(ds, text) {
    const box = $('problems'); box.textContent = '';
    const nf = ds.filter(fixable).length;
    $('applyFixes').hidden = !nf;
    $('applyFixes').textContent = 'Apply ' + plural(nf, 'quick fix').replace('fixs', 'fixes');
    $('saveFixed').hidden = !fixed.has(cur);
    if (!ds.length) { box.appendChild(el('p', 'ok', 'No problems found. The checks cover missing semicolons, braces and strings, directives in the wrong block, duplicates, servers with the same name on one port, typos in directive names and ssl on.')); return; }
    const lines = text.split(/\r?\n/);
    for (const d of ds.slice(0, MAX_PROBLEMS)) {
      const r = el('div', 'prob');
      const m = el('span', 'msg', d.message);
      if (d.code === 'missing-semicolon' && d.fix) m.appendChild(el('span', 'fix', 'Quick fix: add the missing ";".'));
      if (d.code === 'unknown-directive' && d.fix && d.fix.replace) m.appendChild(el('span', 'fix', 'Quick fix: change it to "' + d.fix.replace + '".'));
      const src = (lines[d.line] || '').trim();
      if (src) m.appendChild(el('span', 'src', src.length > 200 ? src.slice(0, 200) + '...' : src));
      r.append(el('span', 'sev ' + d.severity, d.severity), el('span', 'ln', 'line ' + (d.line + 1)), m);
      box.appendChild(r);
    }
    if (ds.length > MAX_PROBLEMS) box.appendChild(el('p', 'small mut', 'Showing the first ' + n(MAX_PROBLEMS) + ' of ' + n(ds.length) + '.'));
  }

  // The extension's two quick fixes, applied from the end of the file to the start so earlier positions stay right.
  function applyFixes() {
    const lines = files.get(cur).split('\n');
    const edits = [];
    for (const d of lastProblems) {
      if (d.code === 'missing-semicolon' && d.fix) edits.push({ line: d.fix.line, col: d.fix.col, end: d.fix.col, text: ';' });
      else if (d.code === 'unknown-directive' && d.fix && d.fix.replace && d.line === d.endLine) edits.push({ line: d.line, col: d.col, end: d.endCol, text: d.fix.replace });
    }
    edits.sort((a, b) => b.line - a.line || b.col - a.col);
    for (const e of edits) { const l = lines[e.line] || ''; lines[e.line] = l.slice(0, e.col) + e.text + l.slice(e.end); }
    files.set(cur, lines.join('\n'));
    E.mount([...files.entries()]);
    fixed.add(cur);
    const { errs, warns } = renderAll();
    $('fixNote').textContent = 'Applied ' + plural(edits.length, 'fix').replace('fixs', 'fixes') + '. Now ' + plural(errs, 'error') + ' and ' + plural(warns, 'warning') + '.';
  }

  function changedLines(a, b) {
    if (a.length > 3000 || b.length > 3000) return null;
    const m = a.length, k = b.length, w = k + 1, L = new Uint16Array((m + 1) * w);
    for (let i = m - 1; i >= 0; i--) for (let j = k - 1; j >= 0; j--) L[i * w + j] = a[i] === b[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    const out = new Set(); let i = 0, j = 0;
    while (j < k) { if (i < m && a[i] === b[j]) { i++; j++; } else if (i < m && L[(i + 1) * w + j] >= L[i * w + j + 1]) i++; else { out.add(j); j++; } }
    return out;
  }

  function renderFormat() {
    const text = files.get(cur);
    const v = $('indent').value, indent = v === 'tab' ? '\t' : ' '.repeat(Number(v));
    const r = E.format(text, { indent, maxBlankLines: Number($('blank').value) });
    const pre = $('formatted'); pre.textContent = '';
    if (r.text == null) {
      lastFmt = { text: null, changed: 0 };
      $('fmtNote').textContent = 'Not formatted: ' + String(r.reason || '').replace(/^not formatted: /, '') + '. The file is left as it is; fix that first.';
      pre.textContent = text; $('saveFmt').disabled = true; $('copyFmt').disabled = true; return;
    }
    $('saveFmt').disabled = false; $('copyFmt').disabled = false;
    const a = text.replace(/\r\n/g, '\n').split('\n'), b = r.text.replace(/\r\n/g, '\n').split('\n');
    const ch = changedLines(a, b);
    lastFmt = { text: r.text, changed: ch ? ch.size : -1 };
    $('fmtNote').textContent = r.text === text ? 'Already formatted: nothing to change.' : (ch ? plural(ch.size, 'line') + ' changed (marked). ' : '') + 'The result was read back and has the same statements and comments.';
    b.forEach((ln, i) => { if (ch && ch.has(i)) pre.appendChild(el('span', 'chg', ln)); else pre.appendChild(document.createTextNode(ln)); if (i < b.length - 1) pre.appendChild(document.createTextNode('\n')); });
  }

  function renderOverview() {
    const box = $('overview'); box.textContent = '';
    const main = mainFile();
    E.mount([...files.entries()]);
    let data;
    try { data = E.overview(E.build(E.load(main)), (f) => short(f)); }
    catch (e) { $('ovNote').textContent = 'The config could not be read: ' + e.message; return { servers: 0, locations: 0, upstreams: 0, missing: 0 }; }
    const ov = el('div', 'ov'); box.appendChild(ov);
    let locs = 0;
    const countLocs = (ls) => ls.forEach((l) => { locs++; countLocs(l.nested); });
    data.servers.forEach((s) => countLocs(s.locations));
    $('ovNote').textContent = 'Read from ' + short(main) + (data.files.length > 1 ? ' and ' + plural(data.files.length - 1, 'included file') : '') + '.'
      + (main !== cur ? ' Pick another file in the File list to check or format it; this overview always starts from nginx.conf.' : '');
    if (data.servers.length) {
      ov.appendChild(el('h3', null, 'Servers'));
      for (const s of data.servers) {
        const b = el('div', 'srv');
        const hd = el('div', 'hd', s.snippet ? '(locations without a server block)' : (s.names.length ? s.names.join(' ') : '(no server_name)'));
        hd.appendChild(el('span', 'meta', (s.snippet ? '' : 'listen ' + s.listen.join(', ') + ', ') + short(s.file) + ' line ' + s.line));
        b.appendChild(hd);
        if (s.serverAction) b.appendChild(el('div', 'small', 'Server level: ' + s.serverAction));
        if (s.locations.length) {
          const t = el('table'); const h = el('tr'); for (const x of ['Location', 'What it does', 'Where']) h.appendChild(el('th', null, x)); t.appendChild(h);
          const add = (l, depth) => {
            const tr = el('tr');
            tr.append(el('td', 'loc', ' '.repeat(depth * 3) + (l.mod ? l.mod + ' ' : '') + l.path), el('td', 'act', l.action || 'no proxy_pass, return or root of its own'), el('td', 'where', short(l.file) + ':' + l.line));
            t.appendChild(tr); l.nested.forEach((x) => add(x, depth + 1));
          };
          s.locations.forEach((l) => add(l, 0));
          b.appendChild(t);
        }
        ov.appendChild(b);
      }
    }
    if (data.upstreams.length) {
      ov.appendChild(el('h3', null, 'Upstreams'));
      for (const u of data.upstreams) { const b = el('div', 'srv'); const hd = el('div', 'hd', u.name); hd.appendChild(el('span', 'meta', (u.stream ? 'stream, ' : '') + short(u.file) + ' line ' + u.line)); b.appendChild(hd); const ul = el('ul'); u.servers.forEach((x) => ul.appendChild(el('li', null, 'server ' + x))); b.appendChild(ul); ov.appendChild(b); }
    }
    if (data.streams.length) {
      ov.appendChild(el('h3', null, 'Stream servers'));
      for (const s of data.streams) { const b = el('div', 'srv'); const hd = el('div', 'hd', 'listen ' + (s.listen.join(', ') || '(none)')); hd.appendChild(el('span', 'meta', short(s.file) + ' line ' + s.line)); b.appendChild(hd); if (s.proxyPass) b.appendChild(el('div', 'small', 'proxy_pass ' + s.proxyPass)); ov.appendChild(b); }
    }
    if (data.missing.length) {
      ov.appendChild(el('h3', null, 'Includes not found'));
      const ul = el('ul');
      data.missing.forEach((m) => ul.appendChild(el('li', null, 'include ' + m.pattern + ' (' + short(m.file) + ' line ' + m.line + ')' + (m.reason ? ': ' + m.reason : ''))));
      ov.appendChild(ul);
      ov.appendChild(el('p', 'small mut', 'Pick the whole config folder (for example /etc/nginx) so includes are found. Paths under /etc/nginx are matched to the folder you pick.'));
    }
    if (data.cycles.length) ov.appendChild(el('p', 'warn', 'An include loop: ' + data.cycles.map((c) => c.join(' > ')).join('; ')));
    if (!data.servers.length && !data.upstreams.length && !data.streams.length) ov.appendChild(el('p', 'small mut', 'No server, upstream or stream block in this config.'));
    return { servers: data.servers.length, locations: locs, upstreams: data.upstreams.length, missing: data.missing.length };
  }

  function showInfo(name) {
    dirSel = name;
    document.querySelectorAll('.ngused button').forEach((b) => b.classList.toggle('on', b.dataset.name === name));
    const box = $('dirInfo'); box.textContent = '';
    const i = E.info(name);
    box.appendChild(el('h3', null, name));
    if (!i) { box.appendChild(el('p', 'small', 'This is not a directive of nginx or of a common module that the extension knows. If it comes from a module you load, it is fine.')); return; }
    box.appendChild(el('pre', null, i.syntax));
    const dl = el('dl');
    const row = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
    row('Default', i.default || '(none)');
    row('Allowed in', i.contexts.map((c) => (c === 'lif' ? 'if in location' : c === 'sif' ? 'if in server' : c.replace('_', ' '))).join(', '));
    row('Module', i.module);
    box.appendChild(dl);
    box.appendChild(el('p', null, i.description));
    const u = E.docsUrl(name);
    if (/^https:\/\/nginx\.org\//.test(u)) { const a = el('a', null, 'nginx documentation for ' + name); a.href = u; a.rel = 'noopener'; a.target = '_blank'; box.appendChild(a); }
  }

  function renderDirs(parsed) {
    const used = new Map();
    E.walk(parsed.nodes, (x) => { if (x.type === 'directive') used.set(x.name, (used.get(x.name) || 0) + 1); });
    const box = $('dirUsed'); box.textContent = '';
    box.appendChild(el('div', 'small mut', plural(used.size, 'directive') + ' in this file'));
    for (const [name, c] of [...used.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
      const b = el('button', E.known(name) ? '' : 'unk'); b.type = 'button'; b.dataset.name = name;
      b.append(el('span', null, name), el('span', 'c', String(c)));
      b.addEventListener('click', () => showInfo(name));
      box.appendChild(b);
    }
    if (dirSel) showInfo(dirSel);
  }

  function fillSelect() {
    const sel = $('fileSel'); sel.textContent = '';
    for (const p of [...files.keys()].sort()) {
      const e = E.lint(files.get(p), { fileName: p }).filter((d) => d.severity === 'error').length;
      const o = el('option', null, short(p) + (e ? '  (' + plural(e, 'error') + ')' : '')); o.value = p; sel.appendChild(o);
    }
    sel.value = cur;
    sel.hidden = $('fileSelLab').hidden = files.size < 2;
  }

  self.zovoMulti = true;
  self.zovoOpen = async (list) => {
    const arr = [...list].filter(Boolean);
    const t0 = performance.now();
    const skipped = [];
    files = new Map(); fixed = new Set(); dirSel = '';
    const rels = arr.map((f) => relOf.get(f) || f.webkitRelativePath || f.name);
    const fromFolder = rels.every((r) => r.includes('/')) && new Set(rels.map((r) => r.split('/')[0])).size === 1;
    let i = 0;
    for (const f of arr) {
      let rel = rels[i++];
      if (fromFolder) rel = rel.slice(rel.indexOf('/') + 1);
      const nm = baseName(rel);
      if (/^\./.test(nm) || /\.(png|jpe?g|gif|ico|svg|webp|pem|crt|key|der|p12|gz|zip|so|pdf|woff2?|ttf|md|markdown|txt|json|ya?ml|html?|js|mjs|css|sh|py|rb|go|ts|lock|log)$/i.test(nm) || /^(license|changelog|readme|dockerfile|makefile)$/i.test(nm)) { skipped.push(nm); continue; }
      if (f.size > MAX_BYTES) { skipped.push(nm + ' (over 16 MB)'); continue; }
      if (files.size >= MAX_FILES) { skipped.push(nm); continue; }
      const text = await f.text();
      if (text.slice(0, 4000).includes('\u0000')) { skipped.push(nm); continue; }
      files.set(BASE + '/' + rel.replace(/^\/+/, ''), text);
    }
    if (!files.size) throw new Error('No config file in what you picked.');
    E.mount([...files.entries()]);
    const keys = [...files.keys()].sort();
    cur = keys.filter((p) => baseName(p) === 'nginx.conf').sort((a, b) => a.length - b.length)[0]
      || keys.find((p) => /\.(conf|nginx|vhost)$/i.test(p) && /server\s*\{/.test(files.get(p))) || keys[0];
    fillSelect();
    $('fname').textContent = files.size > 1 ? (fromFolder ? rels[0].split('/')[0] + '/ (' + plural(files.size, 'file') + ')' : plural(files.size, 'file')) : short(keys[0]);
    const { errs, warns } = renderAll();
    let oe = 0, ow = 0, of = 0;
    for (const p of keys) if (p !== cur) { const ds = E.lint(files.get(p), { fileName: p }); const e = ds.filter((d) => d.severity === 'error').length, w = ds.filter((d) => d.severity === 'warning').length; oe += e; ow += w; if (e + w) of++; }
    const other = of ? ' The other files have ' + plural(oe, 'error') + ' and ' + plural(ow, 'warning') + ' in ' + plural(of, 'file') + ': pick them in the File list.' : '';
    return 'Opened ' + plural(files.size, 'file') + ' in ' + Math.round(performance.now() - t0) + ' ms: ' + plural(errs, 'error') + ' and ' + plural(warns, 'warning') + ' in ' + short(cur) + '.'
      + other + (skipped.length ? ' Skipped ' + plural(skipped.length, 'file') + ' that are not config text (' + skipped.slice(0, 5).join(', ') + (skipped.length > 5 ? ', ...' : '') + ').' : '');
  };

  const save = (text, name) => {
    const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('fileSel').addEventListener('change', () => { cur = $('fileSel').value; $('fixNote').textContent = ''; renderAll(); });
  $('indent').addEventListener('change', renderFormat);
  $('blank').addEventListener('change', renderFormat);
  $('applyFixes').addEventListener('click', applyFixes);
  $('saveFixed').addEventListener('click', () => save(files.get(cur), baseName(cur)));
  document.querySelectorAll('.ngtabs .tabb').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.ngtabs .tabb').forEach((x) => { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); $(x.dataset.pane).hidden = x !== b; });
  }));
  $('copyFmt').addEventListener('click', async () => {
    if (!lastFmt || lastFmt.text == null) return;
    try { await navigator.clipboard.writeText(lastFmt.text); self.zovoMsg('Copied the formatted file.'); } catch (e) { self.zovoMsg('The browser did not allow copying. Select the text and copy it with the keyboard.', true); }
  });
  $('saveFmt').addEventListener('click', () => { if (lastFmt && lastFmt.text != null) save(lastFmt.text, baseName(cur)); });
  const dl = $('dirList');
  for (const nm of E.names().sort()) { const o = el('option'); o.value = nm; dl.appendChild(o); }
  $('dirQ').addEventListener('change', () => { const q = $('dirQ').value.trim(); if (q) showInfo(q); });
  $('dirQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const q = $('dirQ').value.trim(); if (q) showInfo(q); } });
  $('pasteGo').addEventListener('click', () => {
    const t = $('pasteText').value;
    if (!t.trim()) { self.zovoMsg('Paste a config first.', true); return; }
    self.zovoOpenFiles([new File([t], /^\s*(events|http|worker_processes|user)\b/m.test(t) ? 'nginx.conf' : 'pasted.conf', { type: 'text/plain' })]);
  });
  if ($('pick')) $('pick').multiple = true;
  const row = $('drop') && $('drop').querySelector('.filebtn') && $('drop').querySelector('.filebtn').parentElement;
  if (row) {
    const lab = el('label', 'btn filebtn', 'Choose a folder');
    const inp = el('input'); inp.type = 'file'; inp.id = 'pickDir'; inp.webkitdirectory = true; inp.multiple = true; inp.setAttribute('aria-label', 'Choose a folder');
    lab.appendChild(inp); row.insertBefore(lab, row.querySelector('#sample')); row.insertBefore(document.createTextNode(' '), row.querySelector('#sample'));
  }
  // The sample is a small config folder: nginx.conf, its conf.d sites and a snippet (capture phase replaces the one-file sample).
  const SAMPLE_PATH = { 'nginx.conf': 'nginx/nginx.conf', 'shop.conf': 'nginx/conf.d/shop.conf', 'api.conf': 'nginx/conf.d/api.conf', 'proxy-headers.conf': 'nginx/snippets/proxy-headers.conf' };
  if ($('sample')) $('sample').addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    self.zovoOpenFiles((self.ZOVO_SAMPLES || []).map((s) => { const f = self.zovoSampleFile(s.name); relOf.set(f, SAMPLE_PATH[s.name] || 'nginx/' + s.name); return f; }));
  }, true);
})();
