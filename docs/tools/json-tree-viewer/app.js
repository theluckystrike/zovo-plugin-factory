/* Zovo JSON Tree Viewer Online (TOOLCHK2, wave18). Reads a JSON file in this tab and shows it as a searchable
   tree: the JSONPath of any value, arrays of objects as a sortable table, strings that hold JSON as a nested tree,
   and 64-bit numbers kept digit for digit. JSONC (comments, trailing commas) opens too. Nothing is sent anywhere
   (CSP connect-src 'none'), and nothing from the file is ever run: keys and values are only shown as text.
   Rewritten from the HTOOL10 draft (which built paths with new Function). */
(function () {
  'use strict';
  const { $, el, say, int, plural, clip, table, kv, stats, wire, shown, done, size } = self.Z;
  const MAXROWS = 20000;
  let doc = null, sel = null, open = new Set(), hits = [], hitAt = -1, ui = null;

  /* parsing */
  class Big { constructor(s) { this.s = s; } toString() { return this.s; } }
  let bigCount = 0, srcOK = false;
  function reviver(k, v, ctx) {
    if (ctx && typeof ctx.source === 'string') srcOK = true;
    if (typeof v === 'number' && ctx && typeof ctx.source === 'string' && !Number.isSafeInteger(v) && /^-?\d+$/.test(ctx.source)) { bigCount++; return new Big(ctx.source); }
    return v;
  }
  function stripJsonc(t) {  // pass 1: // and /* */ comments to spaces (line numbers kept); pass 2: trailing commas. Strings are left alone.
    let out = '', i = 0, n = t.length, removed = 0;
    const str = (src, k) => { let j = k + 1; while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; j++; } return j; };
    while (i < n) {
      const c = t[i];
      if (c === '"') { const j = str(t, i); out += t.slice(i, j + 1); i = j + 1; continue; }
      if (c === '/' && t[i + 1] === '/') { let j = t.indexOf('\n', i); if (j === -1) j = n; out += ' '.repeat(j - i); i = j; removed++; continue; }
      if (c === '/' && t[i + 1] === '*') { const j = t.indexOf('*/', i + 2); const e = j === -1 ? n : j + 2; out += t.slice(i, e).replace(/[^\n]/g, ' '); i = e; removed++; continue; }
      out += c; i++;
    }
    let o2 = ''; i = 0; n = out.length;
    while (i < n) {
      const c = out[i];
      if (c === '"') { const j = str(out, i); o2 += out.slice(i, j + 1); i = j + 1; continue; }
      if (c === ',') { let j = i + 1; while (j < n && /\s/.test(out[j])) j++; if (out[j] === '}' || out[j] === ']') { o2 += ' '; i++; removed++; continue; } }
      o2 += c; i++;
    }
    return { text: o2, removed };
  }
  const exact = (v, ind) => JSON.stringify(v, (k, x) => x instanceof Big ? '\u0000BIG' + x.s + '\u0000' : x, ind).replace(/"\\u0000BIG(-?\d+)\\u0000"/g, '$1');
  function parseText(text) {
    bigCount = 0;
    const t = text.replace(/^﻿/, '');
    try { return { v: JSON.parse(t, reviver), jsonc: 0 }; }
    catch (e1) {
      const s = stripJsonc(t);
      if (s.removed) { try { bigCount = 0; return { v: JSON.parse(s.text, reviver), jsonc: s.removed }; } catch (e2) { throw where(e2, s.text); } }
      // JSON Lines: one value per line
      const lines = t.split(/\r?\n/).filter(l => l.trim());
      if (lines.length > 1) { try { bigCount = 0; return { v: lines.map(l => JSON.parse(l, reviver)), jsonc: 0, jsonl: lines.length }; } catch (e3) { /* not JSONL */ } }
      throw where(e1, t);
    }
  }
  function where(e, t) {
    const m = String(e.message).match(/position (\d+)/);
    if (!m) return new Error('This file is not valid JSON: ' + e.message);
    const lc = self.Z.lineCol(t, Number(m[1]));
    const line = t.split('\n')[lc.line - 1] || '';
    return new Error(`This file is not valid JSON at line ${lc.line}, column ${lc.col}: ${e.message.replace(/ in JSON at position.*$/, '').replace(/^JSON\.parse: /, '')}. The line reads: ${clip(line.trim(), 120)}`);
  }

  /* model: a node is {k (key or index), v (value), p (parent node), d (depth)} made on demand */
  const typeOf = v => v === null ? 'null' : v instanceof Big ? 'number' : Array.isArray(v) ? 'array' : typeof v;
  const isBox = v => v !== null && typeof v === 'object' && !(v instanceof Big);
  function kidsOf(node) {
    if (node.kids) return node.kids;
    let v = node.v;
    if (typeof v === 'string' && node.json !== undefined) v = node.json;
    if (!isBox(v)) return (node.kids = []);
    const ks = Array.isArray(v) ? v.map((x, i) => i) : Object.keys(v);
    node.kids = ks.map(k => ({ k, v: v[k], p: node, d: node.d + 1 }));
    for (const c of node.kids) if (typeof c.v === 'string' && c.v.length > 1 && c.v.length < 5e6 && /^\s*[[{]/.test(c.v)) { try { const r = JSON.parse(c.v, reviver); if (isBox(r)) c.json = r; } catch (e) { /* plain text */ } }
    return node.kids;
  }
  const hasKids = n => { const v = n.json !== undefined ? n.json : n.v; return isBox(v) && (Array.isArray(v) ? v.length : Object.keys(v).length) > 0; };
  const ID = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  function path(n, js) {
    const parts = [];
    for (let x = n; x && x.p; x = x.p) parts.unshift(typeof x.k === 'number' ? `[${x.k}]` : ID.test(x.k) ? `.${x.k}` : `[${JSON.stringify(x.k)}]`);
    return (js ? 'data' : '$') + parts.join('');
  }
  function preview(v, json) {
    if (json !== undefined) return { t: 's', s: '"' + clip(v, 60) + '"  (JSON text, open to see it)' };
    const t = typeOf(v);
    if (t === 'string') return { t: 's', s: JSON.stringify(clip(v, 200)) };
    if (t === 'number') return { t: 'n', s: String(v) + (v instanceof Big ? '  (kept exact)' : '') };
    if (t === 'boolean') return { t: 'b', s: String(v) };
    if (t === 'null') return { t: 'z', s: 'null' };
    if (t === 'array') return { t: 'c', s: `[${int(v.length)}]` + (v.length && isBox(v[0]) && !Array.isArray(v[0]) ? '  array of objects' : '') };
    return { t: 'c', s: `{${int(Object.keys(v).length)}}` };
  }
  function count(v) {  // nodes, depth, bigs; iterative so very deep files do not overflow the stack
    let nodes = 0, depth = 0;
    const st = [[v, 1]];
    while (st.length) {
      const [x, d] = st.pop(); nodes++; if (d > depth) depth = d;
      if (nodes > 5e6) return { nodes: '5,000,000+', depth };
      if (isBox(x)) for (const k in x) st.push([x[k], d + 1]);
    }
    return { nodes: int(nodes), depth };
  }

  /* view */
  function render(info, r) {
    const out = $('out'); out.textContent = '';
    const c = count(doc.v);
    out.append(stats([['Type', typeOf(doc.v) + (r.jsonl ? ` (JSON Lines, ${int(r.jsonl)} lines)` : '')], ['Top level', preview(doc.v).s], ['Values', c.nodes], ['Depth', int(c.depth)]]));
    const notes = [];
    if (r.jsonc) notes.push(`This is JSONC: ${plural(r.jsonc, 'comment or trailing comma', 'comments or trailing commas')} were skipped to read it.`);
    if (bigCount) notes.push(`${plural(bigCount, 'number')} too big for JavaScript ${bigCount === 1 ? 'is' : 'are'} kept digit for digit.`);
    else if (!srcOK) notes.push('This browser cannot keep numbers above 2^53 exact; they may be rounded. Chrome, Edge and Firefox keep them.');
    if (notes.length) out.append(el('p', notes.join(' '), 'small mut'));
    const q = el('input', null, null, { type: 'search', placeholder: 'Search keys and values', 'aria-label': 'Search keys and values', autocomplete: 'off' });
    const cnt = el('span', null, 'small mut');
    const bar = el('form', null, 'tcbar', null, [q, el('button', 'Previous', null, { type: 'button', id: 'hprev' }), el('button', 'Next', null, { type: 'submit' }), cnt,
      el('button', 'Expand all', null, { type: 'button', id: 'xall' }), el('button', 'Collapse all', null, { type: 'button', id: 'call' })]);
    const tree = el('div', null, 'jtree', { role: 'tree', 'aria-label': 'JSON tree', tabindex: 0 }), det = el('div', null, 'det');
    out.append(bar, el('div', null, 'tcgrid', null, [tree, det]), el('div', null, null, { id: 'tbl' }));
    ui = { q, cnt, tree, det };
    let deb = null;
    q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(search, 200); });
    bar.addEventListener('submit', e => { e.preventDefault(); step(1); });
    bar.querySelector('#hprev').addEventListener('click', () => step(-1));
    bar.querySelector('#xall').addEventListener('click', () => { expandAll(doc, 0); draw(); });
    bar.querySelector('#call').addEventListener('click', () => { open.clear(); open.add(doc); draw(); });
    tree.addEventListener('keydown', key);
    open = new Set([doc]);
    if (hasKids(doc) && kidsOf(doc).length <= 50) for (const k of kidsOf(doc)) if (hasKids(k) && kidsOf(k).length <= 20) open.add(k);
    draw(); pick(doc);
  }
  let rows = [];
  function draw() {
    const tree = ui.tree; tree.textContent = ''; rows = [];
    const frag = document.createDocumentFragment(), hitSet = new Set(hits);
    let n = 0;
    const row = node => {
      if (n >= MAXROWS) return;
      n++;
      const kids = hasKids(node), isOpen = kids && open.has(node);
      const r = el('div', null, 'r' + (node === sel ? ' on' : '') + (hitSet.has(node) ? ' hit' : ''), { role: 'treeitem', 'aria-expanded': kids ? String(isOpen) : null });
      r.style.setProperty('--d', node.d);
      const tw = el('button', kids ? (isOpen ? '▾' : '▸') : '', 'tw', { type: 'button', tabindex: -1, 'aria-label': kids ? (isOpen ? 'Collapse' : 'Expand') : null });
      tw.addEventListener('click', e => { e.stopPropagation(); toggle(node); });
      const pv = preview(node.v, node.json);
      r.append(tw);
      if (node.p) r.append(el('span', typeof node.k === 'number' ? String(node.k) : JSON.stringify(node.k), 'k'), el('span', ':', 'c'));
      else r.append(el('span', 'root', 'k'));
      r.append(el('span', pv.s, 'v ' + pv.t));
      r.addEventListener('click', () => pick(node, r));
      r.addEventListener('dblclick', () => toggle(node));
      r._node = node;
      frag.append(r); rows.push(r);
      if (isOpen) for (const k of kidsOf(node)) row(k);
    };
    row(doc);
    tree.append(frag);
    if (n >= MAXROWS) tree.append(el('p', `Only the first ${int(MAXROWS)} rows are drawn. Collapse some parts or use search.`, 'small mut'));
  }
  function toggle(node) { if (!hasKids(node)) return; if (open.has(node)) open.delete(node); else open.add(node); draw(); const r = rows.find(x => x._node === node); if (r) r.scrollIntoView({ block: 'nearest' }); }
  function expandAll(node, k) { if (k > 4000) return k; if (hasKids(node)) { open.add(node); for (const c of kidsOf(node)) { k = expandAll(c, k + 1); if (k > 4000) break; } } return k; }
  function key(e) {
    const i = rows.findIndex(r => r._node === sel); if (i === -1) return;
    const go = j => { if (rows[j]) { e.preventDefault(); pick(rows[j]._node, rows[j]); rows[j].scrollIntoView({ block: 'nearest' }); } };
    if (e.key === 'ArrowDown') go(i + 1); else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'ArrowRight' && hasKids(sel) && !open.has(sel)) { e.preventDefault(); toggle(sel); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (open.has(sel)) toggle(sel); else if (sel.p) { const j = rows.findIndex(r => r._node === sel.p); go(j); } }
  }
  function pick(node, r) {
    sel = node;
    ui.tree.querySelectorAll('.r.on').forEach(x => x.classList.remove('on'));
    (r || rows.find(x => x._node === node) || { classList: { add() {} } }).classList.add('on');
    const det = ui.det; det.textContent = '';
    const v = node.json !== undefined ? node.json : node.v, t = typeOf(v);
    const jp = path(node), jsp = path(node, true);
    det.append(el('h3', node.p ? (typeof node.k === 'number' ? `[${node.k}]` : String(node.k)) : 'root', 'mono'));
    const copy = (label, text) => { const b = el('button', label, null, { type: 'button' }); b.addEventListener('click', () => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => say(`Copied ${label.replace(/^Copy /, '')}.`), () => say('The browser did not allow copying here.', true)); }); return b; };
    det.append(kv([['JSONPath', jp], ['JS path', jsp], ['Type', t + (node.json !== undefined ? ' (a string that holds JSON, shown parsed)' : '')],
      ['Size', isBox(v) ? (Array.isArray(v) ? plural(v.length, 'item') : plural(Object.keys(v).length, 'key')) : t === 'string' ? plural(v.length, 'character') : '']]));
    let text = '';
    try { text = isBox(v) ? exact(v, 2) : v instanceof Big ? v.s : t === 'string' ? v : String(v); } catch (e) { text = String(e.message); }
    det.append(el('div', null, 'tcbar', null, [copy('Copy JSONPath', jp), copy('Copy JS path', jsp), copy('Copy value', text.length > 5e7 ? text.slice(0, 5e7) : text)]));
    if (v instanceof Big) det.append(el('p', 'This number is above 2^53. JSON.parse in JavaScript would round it; the page keeps the digits from the file.', 'small mut'));
    det.append(el('div', text.length > 20000 ? text.slice(0, 20000) + '\n...' : text, 'pre'));
    // arrays of objects as a table
    const tb = $('tbl'); tb.textContent = '';
    if (Array.isArray(v) && v.length && v.slice(0, 50).every(x => isBox(x) && !Array.isArray(x))) {
      const cols = [];
      for (const x of v.slice(0, 2000)) for (const k of Object.keys(x)) { if (!cols.includes(k)) cols.push(k); if (cols.length >= 60) break; }
      const cell = x => x === undefined ? '' : x === null ? 'null' : x instanceof Big ? x.s : isBox(x) ? clip(exact(x), 120) : String(x);
      const note = el('p', null, 'small mut');
      tb.append(el('h3', `${jp} as a table (${plural(v.length, 'row')}, ${plural(cols.length, 'column')})`), note,
        el('div', null, 'tblwrap', null, [table(['#'].concat(cols), v.map((x, i) => [i].concat(cols.map(c => cell(isBox(x) ? x[c] : undefined)))), { sort: true, max: 5000, note })]));
      if (!note.textContent) note.textContent = 'Click a column name to sort.';
    }
  }
  function search() {
    const q = ui.q.value.trim().toLowerCase();
    hits = []; hitAt = -1;
    if (!q) { ui.cnt.textContent = ''; draw(); return; }
    const t0 = performance.now();
    const st = [doc];
    while (st.length && hits.length < 10000) {
      const n = st.pop();
      const v = n.v;
      if ((n.p && String(n.k).toLowerCase().includes(q)) || (!isBox(v) && String(v instanceof Big ? v.s : v).toLowerCase().includes(q))) hits.push(n);
      if (hasKids(n)) { const ks = kidsOf(n); for (let i = ks.length - 1; i >= 0; i--) st.push(ks[i]); }
      if (performance.now() - t0 > 4000) break;
    }
    ui.cnt.textContent = hits.length ? `${int(hits.length)}${hits.length >= 10000 ? '+' : ''} found` : 'Not found';
    step(1);
  }
  function step(dir) {
    if (!hits.length) { draw(); return; }
    hitAt = (hitAt + dir + hits.length) % hits.length;
    const n = hits[hitAt];
    for (let x = n.p; x; x = x.p) open.add(x);
    draw(); pick(n);
    const r = rows.find(x => x._node === n); if (r) r.scrollIntoView({ block: 'center' });
    ui.cnt.textContent = `${int(hitAt + 1)} of ${int(hits.length)}${hits.length >= 10000 ? '+' : ''}`;
  }

  wire(async (text, info) => {
    const r = parseText(text);
    doc = { k: null, v: r.v, p: null, d: 0 }; sel = null; hits = [];
    if (typeof r.v === 'string' && /^\s*[[{]/.test(r.v)) { try { const j = JSON.parse(r.v, reviver); if (isBox(j)) doc.json = j; } catch (e) { /* plain */ } }
    shown(info, `${r.jsonl ? 'JSON Lines' : r.jsonc ? 'JSONC' : 'JSON'}, ${size(info.size)}`);
    render(info, r);
    done(info);
  }, { maxBytes: 300 * 1048576, utf8: true });
  self.zovoTest = () => doc && { rows: rows.length, first: rows.slice(0, 6).map(r => r.innerText.replace(/\n/g, ' ')), det: ui.det.innerText.slice(0, 500), tbl: ($('tbl').innerText || '').slice(0, 300), cnt: ui.cnt.textContent, bigCount };
  self.zovoReady = true;
})();
