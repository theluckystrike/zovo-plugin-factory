/* Protobuf Formatter (TOOLCHK4, wave18, 13 Nov 2026). Formats and checks .proto files with the Protobuf extension's own
   parser, formatter, import index and checks (engine.js, MIT). Pick several files, or a folder, so imports resolve.
   Files are read with the File API in this tab and never sent anywhere. File text is written with textContent only. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine;
  const MAX_BYTES = 5 * 1024 * 1024, MAX_FILES = 2000, MAX_PROBLEMS = 1000;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const n = (x) => x.toLocaleString('en-US');
  const relOf = new WeakMap();
  let files = new Map(), roots = [], ix = null, cur = '', lastFmt = null;

  const host = { readFile: (f) => (files.has(f) ? files.get(f) : null), fileExists: (f) => files.has(f), roots: () => roots, importPaths: () => [] };

  // The import message of the extension names its setting; on this page the fix is to pick the file too.
  const pageMsg = (d) => d.code === 'import-not-found'
    ? d.message.replace(/ Add the folder it is in to the "zovoProto\.importPaths" setting \(as with protoc -I\)\./, ' Pick that file too, or pick the folder that holds all your .proto files, and the types it brings are checked as well.')
    : d.message;

  // The smallest field number above every used one that is not reserved, as protoc suggests (same rule as the extension's checks).
  function nextFree(m) {
    let x = Math.max(0, ...m.fields.map((f) => f.number)) + 1;
    for (let g = 0; g < 1000; g++) { const r = [...m.reserved.ranges, ...m.extensions].find((q) => x >= q.lo && x <= q.hi); if (!r) break; x = r.hi + 1; }
    if (x >= 19000 && x <= 19999) x = 20000;
    return x;
  }

  function counts(a) {
    const c = { messages: 0, fields: 0, enums: a.enums.length, services: a.services.length, rpcs: 0 };
    const walk = (ms) => { for (const m of ms) { c.messages++; c.fields += m.fields.length; c.enums += m.enums.length; walk(m.messages); } };
    walk(a.messages);
    for (const s of a.services) c.rpcs += s.rpcs.length;
    return c;
  }

  function diagnostics(f) { return E.check(ix, f, { unusedImports: true }).sort((a, b) => a.range.line - b.range.line || a.range.col - b.range.col); }

  function renderAll() {
    const a = ix.get(cur);
    const text = files.get(cur);
    const ds = diagnostics(cur);
    const c = counts(a);
    const errs = ds.filter((d) => d.severity === 'error').length, warns = ds.filter((d) => d.severity === 'warning').length;
    const stats = $('stats'); stats.textContent = '';
    const tile = (k, v) => { const d = el('div', 'stat'); d.append(el('div', 'k', k), el('div', 'v', v)); stats.appendChild(d); };
    tile('Syntax', a.syntax === 'editions' ? 'edition ' + (a.edition || '') : a.syntax || 'proto2 (not set)');
    tile('Messages', n(c.messages)); tile('Fields', n(c.fields)); tile('Enums', n(c.enums)); tile('Services', n(c.services) + (c.rpcs ? ' (' + n(c.rpcs) + ' rpc)' : ''));
    tile('Errors', n(errs)); tile('Warnings', n(warns));
    renderProblems(ds, text);
    renderOutline(a);
    renderFormat();
    $('tabProblems').textContent = 'Problems (' + n(ds.filter((d) => d.severity !== 'hint').length) + ')';
    self.zovoState = Object.assign({ file: cur, files: files.size, errors: errs, warnings: warns, hints: ds.length - errs - warns }, c, { formatted: !!(lastFmt && lastFmt.text != null), changedLines: lastFmt ? lastFmt.changed : 0 });
    return { errs, warns, c };
  }

  function renderProblems(ds, text) {
    const box = $('problems'); box.textContent = '';
    if (!ds.length) { box.appendChild(el('p', 'ok', 'No problems found. The checks follow protoc: duplicate and reserved field numbers, unknown types, missing imports, proto3 and editions rules, map keys, enum values and more.')); return; }
    const lines = text.split(/\r?\n/);
    for (const d of ds.slice(0, MAX_PROBLEMS)) {
      const r = el('div', 'prob');
      const m = el('span', 'msg', pageMsg(d));
      const src = (lines[d.range.line] || '').trim();
      if (src) m.appendChild(el('span', 'src', src.length > 200 ? src.slice(0, 200) + '...' : src));
      r.append(el('span', 'sev ' + d.severity, d.severity === 'hint' ? 'unused' : d.severity), el('span', 'ln', 'line ' + (d.range.line + 1)), m);
      box.appendChild(r);
    }
    if (ds.length > MAX_PROBLEMS) box.appendChild(el('p', 'small mut', 'Showing the first ' + n(MAX_PROBLEMS) + ' of ' + n(ds.length) + '.'));
  }

  function fieldTable(fields) {
    const t = el('table'); const h = el('tr');
    for (const x of ['#', 'Label', 'Type', 'Name', 'Oneof']) h.appendChild(el('th', null, x));
    t.appendChild(h);
    for (const f of [...fields].sort((p, q) => p.number - q.number)) {
      const tr = el('tr');
      tr.append(el('td', 'num', String(f.number)), el('td', null, f.label || ''), el('td', 'ty', f.type), el('td', 'ty', f.name), el('td', null, f.oneof || ''));
      if (f.comment || f.trailing) tr.title = (f.comment || f.trailing).trim();
      t.appendChild(tr);
    }
    return t;
  }
  const head = (kw, name, meta) => { const d = el('div', 'hd'); d.append(el('span', 'kw', kw + ' '), document.createTextNode(name)); if (meta) d.appendChild(el('span', 'meta', meta)); return d; };
  const cmt = (box, c) => { if (c && c.trim()) box.appendChild(el('div', 'cmt', c.trim().slice(0, 600))); };
  const lineOf = (x) => (x.nameRange ? ', line ' + (x.nameRange.line + 1) : '');

  function enumBlock(e) {
    const b = el('div', 'blk'); b.appendChild(head('enum', e.name, n(e.values.length) + ' value' + (e.values.length === 1 ? '' : 's') + lineOf(e))); cmt(b, e.comment);
    const t = el('table');
    for (const v of e.values) { const tr = el('tr'); tr.append(el('td', 'num', String(v.number)), el('td', 'ty', v.name)); t.appendChild(tr); }
    b.appendChild(t); return b;
  }
  function msgBlock(m) {
    const b = el('div', 'blk');
    b.appendChild(head('message', m.name, n(m.fields.length) + ' field' + (m.fields.length === 1 ? '' : 's') + ', next free number ' + nextFree(m) + lineOf(m)));
    cmt(b, m.comment);
    if (m.fields.length) b.appendChild(fieldTable(m.fields));
    const res = [...m.reserved.ranges.map((r) => (r.lo === r.hi ? String(r.lo) : r.lo + ' to ' + (r.hi >= 536870911 ? 'max' : r.hi))), ...m.reserved.names.map((x) => '"' + (x.name || x.value || x) + '"')];
    if (res.length) b.appendChild(el('div', 'small mut', 'Reserved: ' + res.join(', ')));
    for (const e of m.enums) b.appendChild(enumBlock(e));
    for (const c of m.messages) b.appendChild(msgBlock(c));
    return b;
  }

  function renderOutline(a) {
    const box = $('outline'); box.textContent = '';
    const ol = el('div', 'ol'); box.appendChild(ol);
    const facts = el('ul');
    facts.appendChild(el('li', null, 'Package: ' + (a.package || '(none)')));
    for (const imp of a.imports) {
      const r = ix.resolveImport(cur, imp.path);
      const where = !r ? 'not found among the files you picked' : r.builtin ? 'built in (well-known type)' : 'found: ' + r.file.replace(/^\//, '');
      facts.appendChild(el('li', null, 'import ' + (imp.kind ? imp.kind + ' ' : '') + '"' + imp.path + '": ' + where));
    }
    for (const o of a.options || []) if (o.name) { const v = o.value && typeof o.value === 'object' ? (o.value.kind === 'string' ? '"' + o.value.value + '"' : o.value.value != null && typeof o.value.value !== 'object' ? String(o.value.value) : '{...}') : String(o.value == null ? '' : o.value); facts.appendChild(el('li', null, 'option ' + o.name + ' = ' + v)); }
    ol.append(el('h3', null, 'File'), facts);
    if (a.messages.length) { ol.appendChild(el('h3', null, 'Messages')); for (const m of a.messages) ol.appendChild(msgBlock(m)); }
    if (a.enums.length) { ol.appendChild(el('h3', null, 'Enums')); for (const e of a.enums) ol.appendChild(enumBlock(e)); }
    if (a.services.length) {
      ol.appendChild(el('h3', null, 'Services'));
      for (const s of a.services) {
        const b = el('div', 'blk'); b.appendChild(head('service', s.name, n(s.rpcs.length) + ' method' + (s.rpcs.length === 1 ? '' : 's') + lineOf(s))); cmt(b, s.comment);
        const ul = el('ul');
        for (const r of s.rpcs) ul.appendChild(el('li', null, 'rpc ' + r.name + '(' + (r.inputStream ? 'stream ' : '') + r.input + ') returns (' + (r.outputStream ? 'stream ' : '') + r.output + ')'));
        b.appendChild(ul); ol.appendChild(b);
      }
    }
    if (a.extends && a.extends.length) { ol.appendChild(el('h3', null, 'Extensions')); for (const x of a.extends) { const b = el('div', 'blk'); b.appendChild(head('extend', x.name || x.extendee || '', '')); if (x.fields) b.appendChild(fieldTable(x.fields)); ol.appendChild(b); } }
  }

  // Lines of the formatted text that are not in the original (longest common subsequence, up to 3,000 lines).
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
    const r = E.format(text, { indent });
    const pre = $('formatted'); pre.textContent = '';
    if (r.error) {
      lastFmt = { text: null, changed: 0 };
      $('fmtNote').textContent = 'Not formatted. ' + r.error + ' A file that does not parse is left as it is; fix the error first.';
      pre.textContent = text; $('saveFmt').disabled = true; $('copyFmt').disabled = true; return;
    }
    $('saveFmt').disabled = false; $('copyFmt').disabled = false;
    const a = text.replace(/\r\n/g, '\n').split('\n'), b = r.text.split('\n');
    const ch = changedLines(a, b);
    lastFmt = { text: r.text, changed: ch ? ch.size : -1 };
    $('fmtNote').textContent = r.text === text ? 'Already formatted: nothing to change.' : ch ? n(ch.size) + ' line' + (ch.size === 1 ? '' : 's') + ' changed (marked). Comments and their order stay as they were.' : 'Formatted.';
    b.forEach((ln, i) => { if (ch && ch.has(i)) pre.appendChild(el('span', 'chg', ln)); else pre.appendChild(document.createTextNode(ln)); if (i < b.length - 1) pre.appendChild(document.createTextNode('\n')); });
  }

  function fillSelect() {
    const sel = $('fileSel'); sel.textContent = '';
    for (const f of [...files.keys()].sort()) {
      const ds = diagnostics(f), e = ds.filter((d) => d.severity === 'error').length;
      const o = el('option', null, f.replace(/^\//, '') + (e ? '  (' + e + ' error' + (e === 1 ? '' : 's') + ')' : '')); o.value = f; sel.appendChild(o);
    }
    sel.value = cur;
    sel.hidden = $('fileSelLab').hidden = files.size < 2;
  }

  self.zovoMulti = true;
  self.zovoOpen = async (list) => {
    const arr = [...list].filter(Boolean);
    const t0 = performance.now();
    const picked = arr.filter((f) => /\.proto$/i.test(relOf.get(f) || f.webkitRelativePath || f.name) || arr.length === 1);
    if (!picked.length) throw new Error('No .proto file in what you picked.');
    const skipped = [];
    files = new Map(); roots = [];
    for (const f of picked.slice(0, MAX_FILES)) {
      if (f.size > MAX_BYTES) { skipped.push(f.name); continue; }
      const rel = relOf.get(f) || f.webkitRelativePath || f.name;
      files.set('/' + rel.replace(/^\/+/, ''), await f.text());
    }
    if (!files.size) throw new Error('Every file is over 5 MB.');
    const tops = new Set([...files.keys()].map((p) => p.split('/')[1]));
    if ([...files.keys()].every((p) => p.split('/').length > 2) && tops.size === 1) roots = ['/' + [...tops][0]];
    ix = E.createIndex(host);
    for (const [p, t] of files) ix.set(p, t, true);
    const keys = [...files.keys()].sort();
    cur = keys.find((p) => ix.get(p).services.length) || keys.find((p) => ix.get(p).messages.length) || keys[0];
    fillSelect();
    $('fname').textContent = files.size > 1 ? (roots.length ? roots[0].slice(1) + '/ (' + n(files.size) + ' .proto files)' : n(files.size) + ' .proto files') : keys[0].slice(1);
    const { errs, warns } = renderAll();
    return 'Opened ' + n(files.size) + ' file' + (files.size === 1 ? '' : 's') + ' in ' + Math.round(performance.now() - t0) + ' ms: ' + n(errs) + ' error' + (errs === 1 ? '' : 's') + ' and ' + n(warns) + ' warning' + (warns === 1 ? '' : 's') + ' in ' + cur.replace(/^\//, '') + '.'
      + (picked.length > MAX_FILES ? ' Only the first ' + n(MAX_FILES) + ' files were read.' : '') + (skipped.length ? ' Skipped (over 5 MB): ' + skipped.join(', ') + '.' : '');
  };

  $('fileSel').addEventListener('change', () => { cur = $('fileSel').value; renderAll(); });
  $('indent').addEventListener('change', () => { renderFormat(); });
  document.querySelectorAll('.pbtabs .tabb').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.pbtabs .tabb').forEach((x) => { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); $(x.dataset.pane).hidden = x !== b; });
  }));
  $('copyFmt').addEventListener('click', async () => {
    if (!lastFmt || lastFmt.text == null) return;
    try { await navigator.clipboard.writeText(lastFmt.text); self.zovoMsg('Copied the formatted file.'); } catch (e) { self.zovoMsg('The browser did not allow copying. Select the text and copy it with the keyboard.', true); }
  });
  $('saveFmt').addEventListener('click', () => {
    if (!lastFmt || lastFmt.text == null) return;
    const a = el('a'); a.href = URL.createObjectURL(new Blob([lastFmt.text], { type: 'text/plain' }));
    a.download = cur.split('/').pop() || 'formatted.proto'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('pasteGo').addEventListener('click', () => {
    const t = $('pasteText').value;
    if (!t.trim()) { self.zovoMsg('Paste a .proto file first.', true); return; }
    self.zovoOpenFiles([new File([t], 'pasted.proto', { type: 'text/plain' })]);
  });
  // A whole folder can also be picked with a second button in the drop zone.
  if ($('pick')) $('pick').multiple = true;
  const row = $('drop') && $('drop').querySelector('.filebtn') && $('drop').querySelector('.filebtn').parentElement;
  if (row) {
    const lab = el('label', 'btn filebtn', 'Choose a folder');
    const inp = el('input'); inp.type = 'file'; inp.id = 'pickDir'; inp.webkitdirectory = true; inp.multiple = true; inp.setAttribute('aria-label', 'Choose a folder');
    lab.appendChild(inp); row.insertBefore(lab, row.querySelector('#sample')); row.insertBefore(document.createTextNode(' '), row.querySelector('#sample'));
  }
  // The sample is two files of one package, placed so the import resolves (capture phase replaces the one-file sample).
  const SAMPLE_PATH = { 'order.proto': 'shop-api/shop/v1/order.proto', 'money.proto': 'shop-api/shop/v1/money.proto' };
  if ($('sample')) $('sample').addEventListener('click', (e) => {
    e.stopImmediatePropagation();
    self.zovoOpenFiles((self.ZOVO_SAMPLES || []).map((s) => { const f = self.zovoSampleFile(s.name); relOf.set(f, SAMPLE_PATH[s.name] || s.name); return f; }));
  }, true);
})();
