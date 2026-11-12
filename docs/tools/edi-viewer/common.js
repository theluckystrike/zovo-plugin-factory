/* Shared code of the TOOLCHK2 browser tools (wave18): SARIF, DBML, EDI, Intel HEX, DBC, regex, OpenAPI and JSON.
   The file you open is read in this tab with the File API and never sent anywhere: the page CSP sets
   connect-src 'none'. Everything from the file is written with textContent or as SVG text nodes, never as HTML,
   and nothing from a file is ever run. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  const th = $('theme');
  if (th) th.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  });

  /** el('td', 'text', 'cls', {title: 'x'}, [children]) - text is always set as text. */
  function el(tag, text, cls, attrs, kids) {
    const e = document.createElement(tag);
    if (text != null && text !== '') e.textContent = String(text);
    if (cls) e.className = cls;
    if (attrs) for (const k in attrs) if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : String(attrs[k]));
    if (kids) for (const k of kids) if (k) e.append(k);
    return e;
  }
  const say = (t, bad) => { const m = $('msg'); if (!m) return; m.textContent = t || ''; m.className = bad ? 'warn' : 'mut'; };
  const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
  const int = n => Number(n).toLocaleString('en-US');
  const plural = (n, one, many) => int(n) + ' ' + (n === 1 ? one : (many || one + 's'));
  const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; };

  /** A table: heads = ['A', 'B'] or [{t: 'A', cls: 'x'}], rows = arrays of cell values or Nodes.
      opts: {pick: fn(rowIndex, tr), sort: true, max: 5000, cls: 'extra', note: element for "showing N of M"} */
  function table(heads, rows, opts) {
    opts = opts || {};
    const t = el('table', null, 'dtab' + (opts.pick ? ' pick' : '') + (opts.cls ? ' ' + opts.cls : ''));
    const thead = el('thead'), hr = el('tr'), tb = el('tbody');
    let order = rows.map((r, i) => i), dir = 0, col = -1;
    const max = opts.max || 5000;
    const cellText = v => v == null ? '' : v instanceof Node ? v.textContent : String(v);
    heads.forEach((h, ci) => {
      const ho = typeof h === 'string' ? { t: h } : h;
      const th = el('th', null, ho.cls);
      if (opts.sort && rows.length > 1) {
        const b = el('button', ho.t, 'sort', { type: 'button', title: 'Sort by ' + ho.t });
        b.addEventListener('click', () => {
          dir = col === ci ? -dir : 1; col = ci;
          const num = rows.every(r => r[ci] == null || r[ci] === '' || !isNaN(Number(cellText(r[ci]))));
          order.sort((a, b2) => {
            const x = cellText(rows[a][ci]), y = cellText(rows[b2][ci]);
            const r = num ? (Number(x) || 0) - (Number(y) || 0) : x.localeCompare(y, 'en', { numeric: true });
            return r * dir || a - b2;
          });
          [...hr.children].forEach((c, i) => c.setAttribute('aria-sort', i === col ? (dir > 0 ? 'ascending' : 'descending') : 'none'));
          fill();
        });
        th.append(b);
      } else th.textContent = ho.t;
      hr.append(th);
    });
    thead.append(hr); t.append(thead, tb);
    function fill() {
      tb.textContent = '';
      const frag = document.createDocumentFragment();
      for (const i of order.slice(0, max)) {
        const tr = el('tr');
        rows[i].forEach((v, ci) => {
          const td = el('td', null, heads[ci] && heads[ci].tdcls);
          if (v instanceof Node) td.append(v); else if (v == null || v === '') td.textContent = ''; else td.textContent = String(v);
          tr.append(td);
        });
        if (opts.pick) { tr.tabIndex = 0; tr.addEventListener('click', () => opts.pick(i, tr)); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.pick(i, tr); } }); }
        if (opts.rowcls) { const c = opts.rowcls(i); if (c) tr.className = c; }
        frag.append(tr);
      }
      tb.append(frag);
    }
    fill();
    if (rows.length > max && opts.note) opts.note.textContent = `Showing the first ${int(max)} of ${int(rows.length)} rows.`;
    return t;
  }
  function kv(pairs) {
    const t = el('table', null, 'kv'), tb = el('tbody');
    for (const p of pairs) { if (!p || p[1] == null || p[1] === '') continue; const v = p[1]; tb.append(el('tr', null, null, null, [el('th', p[0]), v instanceof Node ? el('td', null, null, null, [v]) : el('td', String(v))])); }
    t.append(tb); return t;
  }
  function stats(pairs) {
    const d = el('div', null, 'stats');
    for (const [k, v, cls] of pairs) d.append(el('div', null, 'stat' + (cls ? ' ' + cls : ''), { title: k + ': ' + v }, [el('span', k, 'k'), el('span', v, 'v')]));
    return d;
  }
  function download(name, text, type) {
    const a = el('a', null, null, { download: name });
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /** Reads a picked or dropped file as text (UTF-8, or UTF-16 with a BOM, else Latin-1 when UTF-8 is invalid). */
  async function readText(file, maxBytes, utf8) {
    if (file.size > maxBytes) throw new Error(`This file is ${size(file.size)}. The page opens files up to ${size(maxBytes)}.`);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf.subarray(2));
    if (buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf.subarray(2));
    const start = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF ? 3 : 0;
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(start)); }
    catch (e) { return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(buf.subarray(start)); }  // JSON tools: keep UTF-8, bad bytes become \ufffd
  }

  /** Wires the file picker, the second picker, drag and drop, the drop zone keys and the sample button.
      open(text, {name, size}) is called with the text; it may throw an Error with a message for the user. */
  function wire(open, opts) {
    opts = opts || {};
    const max = opts.maxBytes || 200 * 1048576;
    let busy = 0;
    async function go(file) {
      if (!file) return;
      const my = ++busy;
      say('Reading ' + file.name + ' (' + size(file.size) + ')...');
      const t0 = performance.now();
      try {
        const text = await readText(file, max, !!opts.utf8);
        if (my !== busy) return;
        await open(text, { name: file.name, size: file.size, t0 });
      } catch (e) {
        if (my !== busy) return;
        say((e && e.message) || String(e), true);
        console.warn(e);
      }
    }
    const p1 = $('pick'), p2 = $('pick2');
    if (p1) p1.addEventListener('change', e => { go(e.target.files[0]); e.target.value = ''; });
    if (p2) p2.addEventListener('change', e => { go(e.target.files[0]); e.target.value = ''; });
    const dz = $('drop');
    if (dz) dz.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === dz) { e.preventDefault(); p1 && p1.click(); } });
    addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
    addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
    addEventListener('drop', e => {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) { document.body.classList.remove('dragging'); return; }  // text dragged into a box
      e.preventDefault(); document.body.classList.remove('dragging');
      const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) go(f);
    });
    const sb = $('sample');
    if (sb) sb.addEventListener('click', () => {
      const run = () => { const s = self.ZOVO_SAMPLE; go(new File([s.text], s.name, { type: 'text/plain' })); };
      if (self.ZOVO_SAMPLE) return run();
      const sc = document.createElement('script'); sc.src = 'sample.js'; sc.onload = run; document.head.append(sc);
    });
    return go;
  }
  /** After a file opened: shrink the drop zone, show the view, fill the name and facts. */
  function shown(info, meta) {
    const dz = $('drop'); if (dz) dz.classList.add('compact');
    const v = $('view'); if (v) v.hidden = false;
    if ($('fname')) $('fname').textContent = info.name;
    if ($('fmeta')) $('fmeta').textContent = meta || size(info.size);
  }
  const done = (info, extra) => say(`Opened in ${int(Math.max(1, Math.round(performance.now() - info.t0)))} ms.` + (extra ? ' ' + extra : ''));

  /** Line and column of a character offset in a text. */
  function lineCol(text, pos) {
    let line = 1, last = -1;
    for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) { line++; last = i; }
    return { line, col: pos - last };
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  self.Z = { $, el, say, size, int, plural, clip, table, kv, stats, download, readText, wire, shown, done, lineCol };
})();
