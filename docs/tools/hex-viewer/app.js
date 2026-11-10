/* Zovo Hex Viewer Online. The file is read with the File API in this tab and never sent anywhere (CSP:
   connect-src 'none'). Only the visible rows are read (64 KB blocks), so a 50 MB or 5 GB file opens at once.
   File content is only ever written with textContent, never as HTML. */
(function () {
  'use strict';
  const B = window.ZovoHex.bytes;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const RH = 20, BLOCK = 1 << 16, MAX_BLOCKS = 96, MAXH = 4e6;
  const S = { file: null, size: 0, bpr: 16, rows: 0, vis: 0, top: 0, sel: 0, selEnd: 0, cache: new Map(), token: 0, le: true, struct: null, structId: 0, findJob: 0 };
  let worker = null, pool = [];

  // ---------- theme ----------
  const root = document.documentElement;
  const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  $('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  });

  // ---------- reading ----------
  async function block(k) {
    if (S.cache.has(k)) { const b = S.cache.get(k); S.cache.delete(k); S.cache.set(k, b); return b; }
    const f = S.file;
    const b = new Uint8Array(await f.slice(k * BLOCK, Math.min(S.size, (k + 1) * BLOCK)).arrayBuffer());
    if (f !== S.file) throw new Error('stale');
    S.cache.set(k, b);
    if (S.cache.size > MAX_BLOCKS) S.cache.delete(S.cache.keys().next().value);
    return b;
  }
  async function range(off, n) {
    n = Math.max(0, Math.min(n, S.size - off));
    const out = new Uint8Array(n);
    let got = 0;
    while (got < n) {
      const k = Math.floor((off + got) / BLOCK), b = await block(k), s = off + got - k * BLOCK, take = Math.min(b.length - s, n - got);
      if (take <= 0) break;
      out.set(b.subarray(s, s + take), got); got += take;
    }
    return out;
  }

  // ---------- grid ----------
  const grid = $('grid'), rowsBox = $('rows'), pad = $('pad');
  function layout() {
    S.bpr = grid.clientWidth < 600 ? 8 : 16;
    S.rows = Math.max(1, Math.ceil(S.size / S.bpr));
    S.vis = Math.max(1, Math.floor(grid.clientHeight / RH));
    const total = Math.min(S.rows * RH, MAXH);
    rowsBox.style.height = (S.vis * RH) + 'px';
    pad.style.height = Math.max(0, total - S.vis * RH) + 'px';
    rowsBox.textContent = ''; pool = [];
    for (let r = 0; r < S.vis; r++) {
      const row = el('div', 'row'), off = el('span', 'off'), hex = el('span', 'hx'), txt = el('span', 'tx');
      const hs = [], ts = [];
      for (let i = 0; i < S.bpr; i++) {
        const h = el('span', 'b'); h.dataset.i = i; hex.append(h); hs.push(h);
        const t = el('span', 'c'); t.dataset.i = i; txt.append(t); ts.push(t);
      }
      row.dataset.r = r; row.append(off, hex, txt); rowsBox.append(row); pool.push({ row, off, hs, ts });
    }
    draw();
  }
  const maxTop = () => Math.max(0, S.rows - S.vis);
  function topFromScroll() {
    const span = grid.scrollHeight - grid.clientHeight;
    return span > 0 ? Math.round(grid.scrollTop / span * maxTop()) : 0;
  }
  function scrollToRow(r) {
    r = Math.max(0, Math.min(maxTop(), r));
    const span = grid.scrollHeight - grid.clientHeight;
    S.top = r;
    grid.scrollTop = maxTop() ? r / maxTop() * span : 0;
    draw();
  }
  function reveal(off) {
    const r = Math.floor(off / S.bpr);
    if (r < S.top || r >= S.top + S.vis) scrollToRow(r - Math.floor(S.vis / 3)); else draw();
  }
  async function draw() {
    if (!S.file) return;
    const t = ++S.token, start = S.top * S.bpr, len = S.vis * S.bpr;
    let data;
    try { data = await range(start, len); } catch (e) { return; }
    if (t !== S.token) return;
    const w = S.size > 0xffffffff ? 12 : 8, lo = Math.min(S.sel, S.selEnd), hi = Math.max(S.sel, S.selEnd);
    for (let r = 0; r < pool.length; r++) {
      const p = pool[r], rs = start + r * S.bpr, n = Math.max(0, Math.min(S.bpr, S.size - rs));
      p.row.hidden = n === 0 && r > 0;
      p.off.textContent = n ? B.hexOffset(rs, w) : '';
      const cells = n ? B.textCells(data.subarray(r * S.bpr, r * S.bpr + n), n, 'latin1', rs, false) : [];
      for (let i = 0; i < S.bpr; i++) {
        const o = rs + i, inF = i < n, on = inF && o >= lo && o <= hi, v = inF ? data[r * S.bpr + i] : 0;
        p.hs[i].textContent = inF ? B.hex2(v) : '  ';
        p.hs[i].className = 'b' + (on ? ' on' : '') + (inF && v === 0 ? ' z' : '') + (o === S.sel && inF ? ' cur' : '');
        p.ts[i].textContent = inF ? cells[i].ch : ' ';
        p.ts[i].className = 'c' + (on ? ' on' : '') + (inF && cells[i].kind !== 'p' ? ' np' : '');
      }
    }
    $('pos').textContent = `Offset 0x${B.hexOffset(S.sel, 1)} (${B.fmtInt(S.sel)})` + (hi > lo ? `, ${B.fmtInt(hi - lo + 1)} bytes selected` : '');
    inspector();
  }
  let ticking = false;
  grid.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { ticking = false; const t = topFromScroll(); if (t !== S.top) { S.top = t; draw(); } });
  }, { passive: true });
  function pick(e, extend) {
    const span = e.target.closest('.b, .c'), row = e.target.closest('.row');
    if (!span || !row) return;
    const o = (S.top + Number(row.dataset.r)) * S.bpr + Number(span.dataset.i);
    if (o >= S.size) return;
    if (extend) S.selEnd = o; else { S.sel = o; S.selEnd = o; }
    draw();
  }
  rowsBox.addEventListener('mousedown', e => { if (e.button === 0) { pick(e, e.shiftKey); grid.focus({ preventScroll: true }); } });
  rowsBox.addEventListener('mousemove', e => { if (e.buttons === 1) pick(e, true); });
  grid.addEventListener('keydown', e => {
    if (!S.file) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -S.bpr, ArrowDown: S.bpr, PageUp: -S.bpr * S.vis, PageDown: S.bpr * S.vis }[e.key];
    let to = null;
    if (step !== undefined) to = S.sel + step;
    else if (e.key === 'Home') to = e.ctrlKey || e.metaKey ? 0 : S.sel - (S.sel % S.bpr);
    else if (e.key === 'End') to = e.ctrlKey || e.metaKey ? S.size - 1 : S.sel - (S.sel % S.bpr) + S.bpr - 1;
    if (to === null) return;
    e.preventDefault();
    to = Math.max(0, Math.min(S.size - 1, to));
    if (e.shiftKey) S.selEnd = to; else { S.sel = to; S.selEnd = to; }
    reveal(to);
  });
  new ResizeObserver(() => { if (S.file) { const keep = S.sel; layout(); reveal(keep); } }).observe(grid);

  // ---------- inspector ----------
  $('endian').addEventListener('change', e => { S.le = !e.target.checked; inspector(); });
  async function inspector() {
    const tb = $('insp'), off = Math.min(S.sel, S.selEnd);
    let b;
    try { b = await range(off, 16); } catch (e) { return; }
    tb.textContent = '';
    for (const [k, v] of B.inspect(b, off, S.le)) {
      if (k === 'Offset') continue;
      const tr = el('tr'); tr.append(el('th', null, k), el('td', null, v || '-')); tb.append(tr);
    }
  }

  // ---------- structure (free: the top level, like the extension) ----------
  function structUI(m) {
    const box = $('struct'); box.textContent = '';
    if (m.id !== S.structId) return;
    if (m.none) { box.append(el('p', 'mut', 'No built-in template matches this file. The hex view, find and the inspector still work.')); return; }
    if (m.error && !m.tree) { box.append(el('p', 'warn', m.error)); return; }
    const head = el('p', 'shead'); head.append(el('b', null, m.name), el('span', 'mut', ` template, ${B.fmtInt((m.tree.c || []).length)} top-level fields`));
    box.append(head);
    if (m.error) box.append(el('p', 'warn', m.error));
    const list = el('ol', 'tree');
    for (const f of m.tree.c || []) {
      const li = el('li'), btn = el('button', 'fld' + (f.e ? ' bad' : ''));
      btn.type = 'button';
      btn.append(el('span', 'fn', f.l || f.n), el('span', 'fv', f.v !== undefined ? String(f.v) : f.t), el('span', 'fo', `0x${B.hexOffset(f.o, 1)} · ${B.fmtInt(f.s)} B`));
      btn.title = `${f.n} (${f.t}) at 0x${B.hexOffset(f.o, 1)}, ${B.fmtInt(f.s)} bytes` + (f.e ? `\n${f.e}` : '') + (f.m ? `\n${f.m}` : '');
      btn.addEventListener('click', () => { S.sel = f.o; S.selEnd = Math.max(f.o, Math.min(S.size - 1, f.o + Math.max(1, f.s) - 1)); reveal(f.o); });
      li.append(btn);
      if (f.p) {
        const a = el('a', 'nest', `${B.fmtInt(f.p)} nested field${f.p === 1 ? '' : 's'}: Zovo Pro in VS Code`); a.href = '#pro'; li.append(a);
      }
      list.append(li);
    }
    box.append(list);
    if (m.nested) box.append(el('p', 'mut small', `The top level is free here and in the extension. The ${B.fmtInt(m.nested)} nested fields open with Zovo Pro in Hex Viewer for VS Code and Cursor.`));
    if (m.others && m.others.length) box.append(el('p', 'mut small', 'Other templates that also match: ' + m.others.join(', ') + '.'));
  }

  // ---------- find and go to ----------
  $('gotoForm').addEventListener('submit', e => {
    e.preventDefault();
    const r = B.parseOffset($('goto').value, S.sel, S.size);
    $('msg').textContent = r.ok ? '' : r.error;
    if (r.ok || r.offset !== undefined) { S.sel = S.selEnd = r.ok ? r.offset : r.offset; reveal(S.sel); }
  });
  $('findForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!S.file || !worker) return;
    S.findJob++;
    $('msg').textContent = 'Searching...';
    worker.postMessage({ type: 'find', query: $('findq').value, mode: $('findmode').value, ignoreCase: $('findmode').value === 'text', from: S.findHit === S.sel ? S.sel + 1 : S.sel });
  });

  // ---------- open ----------
  function startWorker() {
    if (worker) worker.terminate();
    worker = new Worker('worker.js');
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'struct') { clearTimeout(S.structTimer); structUI(m); }
      else if (m.type === 'progress') $('msg').textContent = `Searching... ${Math.floor(m.done / Math.max(1, m.total) * 100)} %`;
      else if (m.type === 'found') {
        if (m.error) { $('msg').textContent = m.error; return; }
        if (m.at < 0) { $('msg').textContent = 'Not found in this file.'; return; }
        S.sel = m.at; S.selEnd = m.at + m.len - 1; S.findHit = m.at;
        $('msg').textContent = `Found at 0x${B.hexOffset(m.at, 1)}` + (m.wrapped ? ' (search went past the end and started again from the top).' : '.');
        reveal(m.at);
      }
    };
    worker.onerror = () => { $('struct').textContent = 'The structure reader stopped on this file. The hex view still works.'; };
  }
  function open(file) {
    if (!file) return;
    S.file = file; S.size = file.size; S.cache.clear(); S.sel = S.selEnd = 0; S.top = 0; S.findHit = -1;
    $('drop').hidden = true; $('viewer').hidden = false;
    $('fname').textContent = file.name || 'file';
    $('fmeta').textContent = B.fmtSize(file.size) + (file.size >= 1024 ? ` (${B.fmtInt(file.size)} bytes)` : '');
    $('msg').textContent = file.size ? '' : 'This file is empty (0 bytes).'; $('ftype').textContent = '';
    range(0, 64).then(b => { if (S.file === file) $('ftype').textContent = B.detectType(b) || 'Unknown type'; }).catch(() => {});
    startWorker();
    worker.postMessage({ type: 'file', file });
    const id = ++S.structId;
    $('struct').textContent = 'Reading the structure...';
    worker.postMessage({ type: 'struct', id });
    S.structTimer = setTimeout(() => { if (S.structId === id) { startWorker(); worker.postMessage({ type: 'file', file }); $('struct').textContent = 'The structure took longer than 10 seconds, so it stopped. The hex view still works.'; } }, 10000);
    grid.scrollTop = 0;
    layout();
    grid.focus({ preventScroll: true });
  }
  $('pick').addEventListener('change', e => open(e.target.files[0]));
  $('pick2').addEventListener('change', e => open(e.target.files[0]));
  $('sample').addEventListener('click', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAANHRFWHRDb21tZW50AFNhbXBsZSBmaWxlIG1hZGUgYnkgdGhlIFpvdm8gSGV4IFZpZXdlciBwYWdlkcwiewAAAGxJREFUeNoNyUEBADAIAzGkVApSKqVSkMLzZCBlyzdVhYouXKSYYosrqoREC4uIEStOPxo13bhJM8021z+MTBubmDFrzj+CQgeHhAkbLj8GDT14yDDDDjc/Fi29eMkyyy63Pw4dffjIMccedzy85GoBj1LkgAAAAABJRU5ErkJggg==';
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    open(new File([u], 'sample.png', { type: 'image/png' }));
  });
  const dz = $('drop');
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });

  // works offline after the first load
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
