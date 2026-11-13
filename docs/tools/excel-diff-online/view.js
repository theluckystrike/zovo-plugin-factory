// Excel Compare webview. Every value goes on the page with textContent (never as HTML), so cells and sheet names
// from a hostile file stay text. Rows come from the extension host on request (virtual grid); nothing here talks to
// the network. Styles are set through the CSSOM because the CSP has no 'unsafe-inline'.
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');
  const ROW_H = 24, RN_W = 112, COL_W = 150, CHUNK = 200, OVERSCAN = 8;
  const KIND = { 0: '', 1: 'changed', 2: 'added', 3: 'removed', 4: 'moved', 5: 'moved changed' };
  const KIND_TEXT = { 1: 'changed', 2: 'added', 3: 'removed', 4: 'moved', 5: 'moved and changed' };
  const S = { meta: null, sheet: 0, cur: {}, chunks: new Map(), pending: new Set(), seq: 0, sel: null, pro: { show: true, tries: {} }, folder: null, rendered: false, scroll: {} };

  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return e;
  };
  const css = (e, props) => { for (const [k, v] of Object.entries(props)) e.style.setProperty(k, v); return e; };
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const post = (m) => vscode.postMessage(m);
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + 's'}`;
  function footer() { const t = document.getElementById('zovo-footer'); return t ? t.content.cloneNode(true) : null; }

  function countsText(c, sheetsA, sheetsB) {
    const parts = [];
    if (c.changed) parts.push(plural(c.changed, 'row') + ' changed');
    if (c.added) parts.push(plural(c.added, 'row') + ' added');
    if (c.removed) parts.push(plural(c.removed, 'row') + ' removed');
    if (c.moved) parts.push(plural(c.moved, 'row') + ' moved');
    if (c.cells) parts.push(plural(c.cells, 'cell') + ' changed');
    if (c.colsAdded) parts.push(plural(c.colsAdded, 'column') + ' added');
    if (c.colsRemoved) parts.push(plural(c.colsRemoved, 'column') + ' removed');
    if (sheetsA) parts.push(plural(sheetsA, 'sheet') + ' only in the first file');
    if (sheetsB) parts.push(plural(sheetsB, 'sheet') + ' only in the second file');
    return parts.join(', ');
  }
  const diffCount = (d) => d.chg.length + d.counts.colsAdded + d.counts.colsRemoved;

  function proButtons() {
    if (!S.pro.show) return null;
    const t = S.pro.tries || {};
    const tip = (name, f) => (S.pro.licensed ? `${name} (Zovo Pro)` : `${name} (Zovo Pro tool, ${t[f] === undefined ? 3 : t[f]} free ${t[f] === 1 ? 'try' : 'tries'} left)`);
    return h('span', { class: 'pro' },
      h('button', { class: 'btn', 'data-tool': 'report', title: tip('Export a diff report: XLSX with coloured cells, HTML or CSV', 'report'), onclick: () => post({ type: 'tool', tool: 'report' }), text: 'Export report' }),
      S.meta ? h('button', { class: 'btn', 'data-tool': 'key', title: tip('Match rows by key columns, such as an ID, instead of by order', 'key'), onclick: () => post({ type: 'tool', tool: 'key', sheet: S.sheet }), text: 'Match by key' }) : null,
      h('button', { class: 'btn', 'data-tool': 'folders', title: tip('Compare two folders of workbooks', 'folders'), onclick: () => post({ type: 'tool', tool: 'folders' }), text: 'Compare folders' }));
  }

  // ---------- compare view ----------

  function sheetMeta() { return S.meta && S.meta.sheets[S.sheet]; }
  function chunkKey(sheet, c) { return sheet + ':' + c; }
  function rowAt(i) {
    const c = Math.floor(i / CHUNK);
    const rows = S.chunks.get(chunkKey(S.sheet, c));
    return rows ? rows[i - c * CHUNK] : null;
  }
  function need(i0, i1) {
    const d = sheetMeta(); if (!d) return;
    for (let c = Math.floor(Math.max(0, i0) / CHUNK); c <= Math.floor(Math.min(d.n - 1, i1) / CHUNK); c++) {
      const key = chunkKey(S.sheet, c);
      if (S.chunks.has(key) || S.pending.has(key)) continue;
      S.pending.add(key);
      post({ type: 'rows', sheet: S.sheet, start: c * CHUNK, end: Math.min(d.n, (c + 1) * CHUNK), seq: S.seq });
    }
  }

  function render() {
    if (S.folder) return renderFolder();
    const m = S.meta;
    if (!m) return;
    app.textContent = '';
    const d = sheetMeta();
    const top = h('header', { class: 'top' },
      h('div', { class: 'files' },
        h('span', { class: 'side a', title: m.a.file ? 'First file (older). Click to show it in the Explorer.' : 'First file', onclick: () => post({ type: 'openFile', which: 'a' }) }, h('span', { class: 'tag', text: '1' }), h('span', { class: 'fname', text: m.a.label })),
        h('span', { class: 'arrow', text: '↔' }),
        h('span', { class: 'side b', title: m.b.file ? 'Second file (newer). Click to show it in the Explorer.' : 'Second file', onclick: () => post({ type: 'openFile', which: 'b' }) }, h('span', { class: 'tag', text: '2' }), h('span', { class: 'fname', text: m.b.label })),
        h('button', { class: 'btn ghost', title: 'Swap the two files', onclick: () => post({ type: 'swap' }), text: 'Swap' })),
      h('div', { class: 'actions' },
        h('span', { class: 'seg', role: 'group', 'aria-label': 'Compare values or formulas' },
          h('button', { class: 'btn seg-b' + (m.mode === 'values' ? ' on' : ''), 'data-mode': 'values', 'aria-pressed': String(m.mode === 'values'), title: 'Compare the cell values', onclick: () => m.mode !== 'values' && post({ type: 'mode', mode: 'values' }), text: 'Values' }),
          h('button', { class: 'btn seg-b' + (m.mode === 'formulas' ? ' on' : ''), 'data-mode': 'formulas', 'aria-pressed': String(m.mode === 'formulas'), title: 'Compare the formulas (a cell without a formula: its value)', onclick: () => m.mode !== 'formulas' && post({ type: 'mode', mode: 'formulas' }), text: 'Formulas' })),
        h('button', { class: 'btn', 'data-nav': 'prev', title: 'Previous change (P or Shift+F7)', onclick: () => step(-1), text: '◀ Previous' }),
        h('span', { class: 'pos muted', text: '' }),
        h('button', { class: 'btn', 'data-nav': 'next', title: 'Next change (N or F7)', onclick: () => step(1), text: 'Next ▶' }),
        proButtons()));
    const sum = h('div', { class: 'summary' });
    const same = !m.sheets.some((x) => diffCount(x)) && !m.sheetsOnlyA && !m.sheetsOnlyB;
    sum.append(h('span', { class: same ? 'same-all' : 'totals', text: same ? `The files are the same (${m.mode === 'formulas' ? 'formulas' : 'values'} compared).` : countsText(m.totals, m.sheetsOnlyA, m.sheetsOnlyB) + '.' }));
    if (m.keyed) sum.append(h('span', { class: 'keyed', text: ' Rows are matched by key columns. ' }), h('button', { class: 'btn ghost', onclick: () => post({ type: 'byOrder' }), text: 'Match by order' }));
    const tabs = h('nav', { class: 'tabs', role: 'tablist' }, ...m.sheets.map((x, i) => {
      const n = diffCount(x);
      const label = x.status === 'both' ? (x.nameA === x.nameB ? x.nameB : `${x.nameA} → ${x.nameB}`) : (x.nameA || x.nameB);
      return h('button', { class: 'tab' + (i === S.sheet ? ' on' : '') + (x.status !== 'both' ? ' ' + x.status : '') + (n ? ' diff' : ''), role: 'tab', 'data-sheet': String(i), 'aria-selected': String(i === S.sheet), title: x.status === 'onlyA' ? 'Only in the first file' : x.status === 'onlyB' ? 'Only in the second file' : n ? countsText(x.counts) : 'No difference', onclick: () => selectSheet(i) },
        h('span', { class: 'tname', text: label }), h('span', { class: 'count', text: x.status === 'onlyA' ? 'removed' : x.status === 'onlyB' ? 'added' : n ? fmt(n) : '=' }));
    }));
    const notes = [...m.notes, ...(d ? d.notes : [])];
    const info = h('div', { class: 'sheetinfo' },
      d ? h('span', { class: 'muted', text: d.status === 'onlyA' ? 'This sheet is only in the first file.' : d.status === 'onlyB' ? 'This sheet is only in the second file.' : (diffCount(d) ? countsText(d.counts) + '.' : 'No difference in this sheet.') + (d.keys ? ` Key column${d.keys.length > 1 ? 's' : ''}: ${d.keys.map(colName).join(', ')} (letters of the first file).` : '') }) : null,
      h('span', { class: 'legend' }, h('i', { class: 'sw changed' }), 'changed', h('i', { class: 'sw added' }), 'added', h('i', { class: 'sw removed' }), 'removed', d && d.keys ? [h('i', { class: 'sw moved' }), 'moved'] : null));
    const noteBox = notes.length ? h('ul', { class: 'notice' }, ...notes.map((n) => h('li', { text: n }))) : null;
    const detail = h('div', { class: 'detail muted', text: 'Click a cell to see its old and new value.' });
    const grid = h('div', { class: 'grid', tabindex: '0', role: 'grid', 'aria-label': 'Compared rows' });
    app.append(top, sum, tabs, info, noteBox || '', detail, grid);
    const f = footer(); if (f) app.append(f);
    S.grid = grid; S.detail = detail; S.pos = top.querySelector('.pos');
    buildGrid();
    updatePos();
    if (!S.rendered) { S.rendered = true; post({ type: 'rendered' }); }
  }

  function colName(c) { let s = ''; let n = c + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

  function buildGrid() {
    const d = sheetMeta(), grid = S.grid;
    if (!grid) return;
    grid.textContent = '';
    if (!d) return;
    const width = RN_W + d.cols.length * COL_W;
    const head = css(h('div', { class: 'ghead' }), { width: width + 'px' });
    head.append(css(h('div', { class: 'rn hd' }, h('span', { text: '1' }), h('span', { text: '2' })), { width: RN_W + 'px' }));
    d.cols.forEach((c, j) => head.append(css(h('div', { class: 'hc ' + c.s, title: `${c.l}${c.h ? ': ' + c.h : ''}${c.s ? ` (column ${c.s})` : ''}` }, h('b', { text: c.l }), c.h ? h('span', { class: 'hh', text: c.h }) : null), { left: RN_W + j * COL_W + 'px', width: COL_W + 'px' })));
    const body = css(h('div', { class: 'gbody' }), { height: d.n * ROW_H + 'px', width: width + 'px' });
    grid.append(head, body);
    S.body = body;
    grid.onscroll = () => { S.scroll[S.sheet] = [grid.scrollTop, grid.scrollLeft]; drawRows(); };
    const sc = S.scroll[S.sheet];
    if (sc) { grid.scrollTop = sc[0]; grid.scrollLeft = sc[1]; }
    drawRows();
  }

  function drawRows() {
    const d = sheetMeta(), grid = S.grid, body = S.body;
    if (!d || !grid || !body) return;
    const vh = grid.clientHeight || 600, vw = grid.clientWidth || 1000;
    const i0 = Math.max(0, Math.floor(grid.scrollTop / ROW_H) - OVERSCAN), i1 = Math.min(d.n - 1, Math.ceil((grid.scrollTop + vh) / ROW_H) + OVERSCAN);
    const c0 = Math.max(0, Math.floor((grid.scrollLeft - RN_W) / COL_W) - 1), c1 = Math.min(d.cols.length - 1, Math.ceil((grid.scrollLeft + vw) / COL_W) + 1);
    need(i0, i1);
    body.textContent = '';
    const curRow = S.cur[S.sheet] !== undefined ? d.chg[S.cur[S.sheet]] : -1;
    for (let i = i0; i <= i1; i++) {
      const r = rowAt(i);
      const row = css(h('div', { class: 'tr ' + (r ? KIND[r.k] : 'loading') + (i === curRow ? ' cur' : ''), 'data-i': String(i) }), { top: i * ROW_H + 'px', width: RN_W + d.cols.length * COL_W + 'px' });
      row.append(css(h('div', { class: 'rn', title: r ? `Row ${r.a >= 0 ? r.a + 1 : '-'} in the first file, row ${r.b >= 0 ? r.b + 1 : '-'} in the second${KIND_TEXT[r.k] ? ` (${KIND_TEXT[r.k]})` : ''}` : '' }, h('span', { text: r && r.a >= 0 ? String(r.a + 1) : '' }), h('span', { text: r && r.b >= 0 ? String(r.b + 1) : '' })), { width: RN_W + 'px' }));
      if (r) {
        for (let j = c0; j <= c1; j++) {
          const c = r.c[j];
          if (!c) continue;
          const cls = 'td' + (c[1] === 1 ? ' changed' : c[1] === 2 ? ' added' : c[1] === 3 ? ' removed' : '') + (S.sel && S.sel.i === i && S.sel.j === j ? ' sel' : '');
          const cell = css(h('div', { class: cls, 'data-j': String(j) }), { left: RN_W + j * COL_W + 'px', width: COL_W + 'px' });
          if (c[1] === 1) cell.append(h('span', { class: 'old', text: c[2] }), h('span', { class: 'new', text: c[0] }));
          else cell.textContent = c[0];
          cell.addEventListener('click', () => select(i, j));
          row.append(cell);
        }
      }
      body.append(row);
    }
  }

  function select(i, j) {
    const d = sheetMeta(), r = rowAt(i);
    if (!d || !r) return;
    S.sel = { i, j };
    const c = r.c[j], col = d.cols[j];
    const addr = `${col.l.split(' ')[0]}${r.b >= 0 ? r.b + 1 : r.a + 1}`;
    S.detail.textContent = '';
    S.detail.className = 'detail';
    const label = col.h ? `${addr} (${col.h})` : addr;
    if (c[1] === 1) S.detail.append(h('b', { text: label }), ' before: ', h('span', { class: 'old', text: c[2] || '(empty)' }), ' after: ', h('span', { class: 'new', text: c[0] || '(empty)' }));
    else S.detail.append(h('b', { text: label }), ` ${c[1] === 2 ? 'added' : c[1] === 3 ? 'removed' : 'same'}: `, h('span', { text: c[0] || '(empty)' }));
    S.detail.append(' ', h('button', { class: 'btn ghost', onclick: () => post({ type: 'copy', text: c[1] === 1 ? `${c[2]}\t${c[0]}` : c[0] }), text: 'Copy' }));
    drawRows();
  }

  function selectSheet(i) {
    if (!S.meta || i === S.sheet) return;
    S.sheet = i; S.sel = null; render();
  }

  function updatePos() {
    const d = sheetMeta();
    if (!S.pos) return;
    if (!d) { S.pos.textContent = ''; return; }
    const k = S.cur[S.sheet];
    S.pos.textContent = d.chg.length ? (k === undefined ? plural(d.chg.length, 'change') : `Change ${fmt(k + 1)} of ${fmt(d.chg.length)}`) : 'No changes';
  }

  /** Next or previous change; at the end of a sheet it goes on in the next sheet with changes. */
  function step(dir) {
    const m = S.meta; if (!m) return;
    let d = sheetMeta();
    let k = S.cur[S.sheet];
    if (d && d.chg.length) {
      const nk = k === undefined ? (dir > 0 ? 0 : d.chg.length - 1) : k + dir;
      if (nk >= 0 && nk < d.chg.length) { S.cur[S.sheet] = nk; return show(); }
    }
    for (let t = 1; t < m.sheets.length; t++) {
      const i = (S.sheet + dir * t + m.sheets.length * t) % m.sheets.length;
      if (m.sheets[i].chg.length) { S.sheet = i; S.cur[i] = dir > 0 ? 0 : m.sheets[i].chg.length - 1; S.sel = null; render(); return show(); }
    }
    if (d && d.chg.length) { S.cur[S.sheet] = dir > 0 ? 0 : d.chg.length - 1; show(); }
  }
  function show() {
    const d = sheetMeta(), grid = S.grid;
    if (!d || !grid) return;
    const i = d.chg[S.cur[S.sheet]];
    const vh = grid.clientHeight || 600;
    const y = i * ROW_H;
    if (y < grid.scrollTop + ROW_H || y > grid.scrollTop + vh - 3 * ROW_H) grid.scrollTop = Math.max(0, y - Math.floor(vh / 3));
    // the first changed cell of the row comes into view
    const r = rowAt(i);
    if (r) { const j = r.c.findIndex((c) => c[1] !== 0); if (j >= 0) { const x = RN_W + j * COL_W; if (x < grid.scrollLeft + RN_W || x + COL_W > grid.scrollLeft + grid.clientWidth) grid.scrollLeft = Math.max(0, x - RN_W - COL_W); } }
    drawRows(); updatePos();
  }

  // ---------- folder view ----------

  function renderFolder() {
    const F = S.folder;
    app.textContent = '';
    const st = { same: 0, different: 0, onlyA: 0, onlyB: 0, error: 0, waiting: 0 };
    for (const r of F.rows) st[r.status] = (st[r.status] || 0) + 1;
    const LABEL = { same: 'same', different: 'different', onlyA: 'only in the first folder', onlyB: 'only in the second folder', error: 'could not be compared', waiting: 'comparing...' };
    app.append(h('header', { class: 'top' },
      h('div', { class: 'files' }, h('span', { class: 'side a' }, h('span', { class: 'tag', text: '1' }), h('span', { class: 'fname', text: F.a })), h('span', { class: 'arrow', text: '↔' }), h('span', { class: 'side b' }, h('span', { class: 'tag', text: '2' }), h('span', { class: 'fname', text: F.b }))),
      h('div', { class: 'actions' }, proButtons())));
    app.append(h('div', { class: 'summary' }, h('span', { class: 'totals', text: `${plural(F.rows.length, 'file')}: ${Object.entries(st).filter(([, n]) => n).map(([k, n]) => `${fmt(n)} ${LABEL[k]}`).join(', ')}.${F.done ? '' : ' Comparing...'}` })));
    if (!F.rows.length) app.append(h('p', { class: 'muted', text: 'Neither folder has .xlsx, .xlsm, .xls, .ods, .csv or .tsv files.' }));
    const table = h('table', { class: 'ftable' }, h('thead', {}, h('tr', {}, ...['File', 'Status', 'Rows changed', 'Added', 'Removed', 'Cells changed', ''].map((t) => h('th', { text: t })))));
    const tb = h('tbody');
    F.rows.forEach((r, i) => {
      const t = r.totals || {};
      tb.append(h('tr', { class: 'fr ' + r.status, 'data-i': String(i) },
        h('td', { class: 'fname', text: r.rel }),
        h('td', { class: 'st', text: r.status === 'error' ? `${LABEL.error}: ${r.error || ''}` : LABEL[r.status] + (r.sheetsOnlyA || r.sheetsOnlyB ? ` (${[r.sheetsOnlyA ? plural(r.sheetsOnlyA, 'sheet') + ' removed' : '', r.sheetsOnlyB ? plural(r.sheetsOnlyB, 'sheet') + ' added' : ''].filter(Boolean).join(', ')})` : '') }),
        h('td', { class: 'num', text: r.totals ? fmt(t.changed) : '' }), h('td', { class: 'num', text: r.totals ? fmt(t.added) : '' }), h('td', { class: 'num', text: r.totals ? fmt(t.removed) : '' }), h('td', { class: 'num', text: r.totals ? fmt(t.cells) : '' }),
        h('td', {}, r.a && r.b ? h('button', { class: 'btn ghost', 'data-open': String(i), onclick: () => post({ type: 'openPair', index: i }), text: 'Open' }) : '')));
    });
    table.append(tb);
    app.append(h('div', { class: 'fwrap' }, table));
    const f = footer(); if (f) app.append(f);
  }

  // ---------- messages ----------

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || typeof m.type !== 'string') return;
    if (m.pro) S.pro = m.pro;
    switch (m.type) {
      case 'busy':
        if (!S.meta && !S.folder) { app.textContent = ''; app.append(h('p', { class: 'loading', text: m.text || 'Comparing...' })); }
        else { const p = document.querySelector('.pos'); if (p) p.textContent = m.text || ''; }
        break;
      case 'result': {
        const keepSheet = S.meta && S.meta.sheets[S.sheet] ? S.meta.sheets[S.sheet].nameB || S.meta.sheets[S.sheet].nameA : null;
        S.meta = m; S.chunks.clear(); S.pending.clear(); S.seq++; S.cur = {}; S.sel = null;
        const idx = keepSheet ? m.sheets.findIndex((x) => (x.nameB || x.nameA) === keepSheet) : -1;
        S.sheet = idx >= 0 ? idx : Math.max(0, m.sheets.findIndex((x) => diffCount(x) > 0));
        render();
        break;
      }
      case 'rows':
        if (m.seq !== S.seq) return;
        S.chunks.set(chunkKey(m.sheet, Math.floor(m.start / CHUNK)), m.rows);
        S.pending.delete(chunkKey(m.sheet, Math.floor(m.start / CHUNK)));
        if (m.sheet === S.sheet) { drawRows(); if (S.cur[S.sheet] !== undefined) updatePos(); }
        break;
      case 'error':
        S.meta = null;
        app.textContent = '';
        app.append(h('h2', { text: 'These files could not be compared' }), h('p', { class: 'errmsg', text: m.message }));
        { const f = footer(); if (f) app.append(f); }
        break;
      case 'notice': {
        const n = h('div', { class: 'toast', role: 'status', text: m.text });
        document.body.append(n); setTimeout(() => n.remove(), 6000);
        break;
      }
      case 'pro': {
        const old = document.querySelector('.pro');
        const fresh = proButtons();
        if (old) { if (fresh) old.replaceWith(fresh); else old.remove(); } else if (fresh && document.querySelector('.actions')) document.querySelector('.actions').append(fresh);
        break;
      }
      case 'folder':
        S.folder = m; renderFolder();
        break;
      default:
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!S.meta || e.target instanceof HTMLInputElement) return;
    if ((e.key === 'n' && !e.metaKey && !e.ctrlKey) || (e.key === 'F7' && !e.shiftKey)) { e.preventDefault(); step(1); }
    else if ((e.key === 'p' && !e.metaKey && !e.ctrlKey) || (e.key === 'F7' && e.shiftKey)) { e.preventDefault(); step(-1); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.meta) drawRows(); });
  window.addEventListener('resize', () => drawRows());
  post({ type: 'ready' });
})();
