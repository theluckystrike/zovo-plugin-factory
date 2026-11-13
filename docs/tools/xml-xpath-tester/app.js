/* XPath Tester and XML Formatter (TOOLCHK5, wave18, 13 Nov 2026). Runs XPath 1.0, Copy XPath, Format and Minify with the
   XML Formatter & XPath Tools extension's own core (engine.js, MIT). The file is read with the File API in this tab and
   never sent anywhere. File text is only ever written with textContent. Entities are never expanded. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine;
  const MAX_BYTES = 50 * 1024 * 1024, MAX_RES = 2000, MAX_SHOW = 2 * 1024 * 1024, MAX_KIDS = 500;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const n = (x) => Number(x).toLocaleString('en-US');
  let cur = null, outText = '', outName = '';

  function decode(buf) {
    const u = new Uint8Array(buf);
    if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(u.subarray(2));
    if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(u.subarray(2));
    let t = new TextDecoder('utf-8').decode(u);
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    return t;
  }
  function lineStarts(text) { const a = [0]; for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) a.push(i + 1); return a; }
  function lineOf(off) { const a = cur.lines; let lo = 0, hi = a.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= off) lo = m; else hi = m - 1; } return lo + 1; }

  function stat(k, v) { const d = el('div', 'stat'); d.appendChild(el('div', 'v', v)); d.appendChild(el('div', 'k', k)); return d; }
  function depthOf(ix) { let max = 0; const d = new Int32Array(ix.count); for (let i = 0; i < ix.count; i++) { d[i] = ix.parent[i] < 0 ? 1 : d[ix.parent[i]] + 1; if (d[i] > max) max = d[i]; } return max; }

  self.zovoOpen = async (file) => {
    if (file.size > MAX_BYTES) throw new Error('the file is ' + self.zovoSize(file.size) + '. This page opens XML files up to 50 MB.');
    const t0 = performance.now();
    const text = decode(await file.arrayBuffer());
    await new Promise((r) => setTimeout(r, 0));
    const ix = E.buildIndex(text);
    cur = { name: file.name, text, ix, lines: lineStarts(text), st: { text, index: ix, dom: null, ord: null } };
    const names = new Set(); for (let i = 0; i < ix.count; i++) names.add(ix.nameId[i]);
    const s = $('stats'); s.textContent = '';
    s.appendChild(stat('elements', n(ix.count)));
    s.appendChild(stat('names', n(names.size)));
    s.appendChild(stat('depth', n(ix.count ? depthOf(ix) : 0)));
    s.appendChild(stat('lines', n(cur.lines.length)));
    s.appendChild(stat('prefixes', n(Object.keys(ix.prefixes).filter((p) => p !== 'xml' && p !== '').length)));
    const xe = $('xerr');
    if (ix.error) { xe.hidden = false; xe.textContent = 'Not well formed: ' + ix.error.message + ' (line ' + ix.error.line + ', column ' + ix.error.col + '). XPath and Format need a well-formed file; the elements before the error are listed.'; }
    else xe.hidden = true;
    const pre = Object.entries(ix.prefixes).filter(([p]) => p !== 'xml');
    const notes = [];
    if (pre.length) notes.push('Prefixes in this file: ' + pre.map(([p, u]) => (p || '(default)') + ' = ' + u).join(', ') + '.');
    if (ix.defaultNs) notes.push('Default namespace ' + ix.defaultNs + ': plain names match it unless Strict namespaces is on.');
    if (ix.doctype && ix.doctype.entities && ix.doctype.entities.count) notes.push('The DOCTYPE declares ' + n(ix.doctype.entities.count) + ' entities. They are not expanded and nothing is read.');
    $('ns').textContent = notes.join(' ');
    $('res').textContent = ''; $('paths').textContent = ''; $('paths').appendChild(el('p', 'small mut', 'Click an element in the list or a row in the XPath results.')); $('selTitle').textContent = 'XPath of the selected element';
    $('out').hidden = true; $('outBar').hidden = true; $('outNote').textContent = '';
    renderTree();
    $('expr').value = /pom\.xml$/i.test(file.name) || ix.names.includes('dependency') ? '//dependency/artifactId' : ix.count ? '//' + ix.names[ix.nameId[Math.min(1, ix.count - 1)]] : '/';
    self.zovoState = { elements: ix.count, error: ix.error ? ix.error.message : null, prefixes: pre.length, pwned: !!self.__pwned };
    if (!ix.error) runXPath();
    return 'Opened ' + file.name + ' in ' + Math.round(performance.now() - t0) + ' ms: ' + n(ix.count) + ' elements' + (ix.error ? ', not well formed (line ' + ix.error.line + ')' : '') + '.';
  };

  // Element tree: children are built when a node is opened, so a file with a million elements stays fast.
  function label(i) {
    const ix = cur.ix, f = document.createDocumentFragment();
    f.appendChild(el('span', 'tn', ix.names[ix.nameId[i]]));
    if (ix.keyName[i] != null && ix.keyName[i] !== undefined && ix.keyName[i] !== '') f.appendChild(el('span', 'ka', ' ' + ix.keyName[i] + '="' + ix.keyValue[i] + '"'));
    if (ix.preview[i]) f.appendChild(el('span', 'pv', ' ' + ix.preview[i]));
    f.appendChild(el('span', 'ln', ' line ' + n(lineOf(ix.start[i]))));
    return f;
  }
  function nodeFor(i) {
    const ix = cur.ix;
    if (ix.childCount[i] > 0) {
      const d = el('details'); const s = el('summary'); s.appendChild(label(i)); s.appendChild(el('span', 'cnt', ', ' + n(ix.childCount[i]) + (ix.childCount[i] === 1 ? ' child' : ' children')));
      s.addEventListener('click', () => select(i)); d.appendChild(s);
      d.addEventListener('toggle', () => { if (d.open && !d.dataset.built) { d.dataset.built = '1'; kids(d, i); } });
      return d;
    }
    const b = el('button', 'leaf'); b.type = 'button'; b.appendChild(label(i)); b.addEventListener('click', () => select(i)); return b;
  }
  function kids(box, i) {
    const list = E.children(cur.ix, i);
    for (const c of list.slice(0, MAX_KIDS)) box.appendChild(nodeFor(c));
    if (list.length > MAX_KIDS) box.appendChild(el('p', 'small mut', 'The first ' + n(MAX_KIDS) + ' of ' + n(list.length) + ' children are listed. Use an XPath to reach the others.'));
  }
  function renderTree() {
    const t = $('tree'); t.textContent = '';
    kids(t, -1);
    const first = t.querySelector('details'); if (first) first.open = true;
  }
  function select(i, attr) {
    const ix = cur.ix, p = $('paths'); p.textContent = '';
    $('selTitle').textContent = 'XPath of <' + ix.names[ix.nameId[i]] + '>' + (attr ? ' @' + attr : '') + ', line ' + n(lineOf(ix.start[i]));
    for (const [st, nm] of [['indexed', 'With positions'], ['predicates', 'With id or name attributes'], ['portable', 'Portable (local-name)']]) {
      const x = E.xpathFor(ix, i, st, attr);
      const row = el('div', 'xprow'); row.appendChild(el('div', 'small mut', nm)); const c = el('code', null, x); row.appendChild(c);
      const b = el('button', 'btn small', 'Copy'); b.type = 'button'; b.addEventListener('click', () => copy(x, b)); row.appendChild(b);
      const u = el('button', 'btn small', 'Run'); u.type = 'button'; u.addEventListener('click', () => { $('expr').value = x; runXPath(); }); row.appendChild(u);
      p.appendChild(row);
    }
  }
  async function copy(s, b) { try { await navigator.clipboard.writeText(s); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); } catch (e) { self.zovoMsg('The browser did not allow copying. Select the text and copy it.', true); } }

  function runXPath() {
    if (!cur) return;
    const r = $('res'); r.textContent = '';
    const expr = $('expr').value.trim(); if (!expr) return;
    if (cur.ix.error) { r.appendChild(el('p', 'warn', 'The file is not well formed, so XPath cannot run.')); return; }
    const res = E.evaluate(cur.st, expr, { strictNamespaces: $('strict').checked, maxResults: MAX_RES });
    if (!res.ok) { r.appendChild(el('p', 'warn', res.error)); if (self.zovoState) self.zovoState.last = { error: res.error }; return; }
    for (const x of res.notes || []) r.appendChild(el('p', 'small mut', x));
    if (res.type !== 'nodes') {
      const p = el('p', 'xpval'); p.appendChild(el('span', 'mut', res.type + ': ')); p.appendChild(el('code', null, res.value)); r.appendChild(p);
      self.zovoState.last = { type: res.type, value: res.value }; return;
    }
    r.appendChild(el('p', 'small mut', n(res.total) + (res.total === 1 ? ' node' : ' nodes') + ' in ' + res.ms + ' ms' + (res.total > res.items.length ? ', the first ' + n(res.items.length) + ' listed' : '') + '.'));
    self.zovoState.last = { type: 'nodes', total: res.total, first: res.items[0] ? res.items[0].name + '=' + res.items[0].value : null };
    if (!res.items.length) return;
    const w = el('div', 'tblwrap short'), tb = el('table', 'dtab pick'), hd = el('tr');
    for (const h of ['#', 'Node', 'Line', 'Value']) hd.appendChild(el('th', null, h));
    const th = el('thead'); th.appendChild(hd); tb.appendChild(th); const body = el('tbody');
    res.items.forEach((it, k) => {
      const tr = el('tr'); tr.appendChild(el('td', 'mut', String(k + 1)));
      tr.appendChild(el('td', null, it.kind === 'attribute' ? '@' + it.name : it.kind === 'element' ? '<' + it.name + '>' : it.name));
      tr.appendChild(el('td', null, it.at ? String(it.at.line) : '')); tr.appendChild(el('td', null, it.value));
      if (it.ord >= 0 && (it.kind === 'element' || it.kind === 'attribute')) { tr.tabIndex = 0; tr.addEventListener('click', () => select(it.ord, it.kind === 'attribute' ? it.name : undefined)); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(it.ord, it.kind === 'attribute' ? it.name : undefined); }); }
      body.appendChild(tr);
    });
    tb.appendChild(body); w.appendChild(tb); r.appendChild(w);
  }
  $('xform').addEventListener('submit', (e) => { e.preventDefault(); runXPath(); });
  $('strict').addEventListener('change', runXPath);

  function doFormat(min) {
    if (!cur) return;
    const iv = $('indent').value, eol = cur.text.includes('\r\n') ? '\r\n' : '\n';
    const r = min ? E.minify(cur.text, { removeComments: $('minComments').checked })
      : E.format(cur.text, { indent: iv === 'tab' ? '\t' : ' '.repeat(Number(iv)), eol, attributes: $('attrs').value });
    if (!r.ok) { $('outNote').textContent = 'Not changed: the file is not well formed. ' + r.error.message + ' (line ' + r.error.line + ', column ' + r.error.col + ').'; $('out').hidden = true; $('outBar').hidden = true; return; }
    outText = r.text; outName = cur.name.replace(/(\.[^.]+)?$/, (m) => (min ? '.min' : '.formatted') + (m || '.xml'));
    const o = $('out'); o.hidden = false; $('outBar').hidden = false;
    o.textContent = outText.length > MAX_SHOW ? outText.slice(0, MAX_SHOW) : outText;
    $('outNote').textContent = (min ? 'Minified: ' : 'Formatted: ') + n(cur.text.length) + ' to ' + n(outText.length) + ' characters' + (r.changed ? '' : ', no change') + '.' + (outText.length > MAX_SHOW ? ' The first 2 MB are shown; Save keeps all of it.' : '');
    self.zovoState.out = { min, len: outText.length, changed: r.changed };
  }
  $('fmt').addEventListener('click', () => doFormat(false));
  $('min').addEventListener('click', () => doFormat(true));
  $('copyOut').addEventListener('click', (e) => copy(outText, e.currentTarget));
  $('saveOut').addEventListener('click', () => {
    const a = el('a'); a.href = URL.createObjectURL(new Blob([outText], { type: 'application/xml' })); a.download = outName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  $('pasteGo').addEventListener('click', () => { const t = $('pasteText').value; if (t.trim()) self.zovoOpenFiles([new File([t], 'pasted.xml', { type: 'text/plain' })]); });
})();
