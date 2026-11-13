/* Excel Diff Online (TOOLCHK5, wave18, 13 Nov 2026). Compares two Excel or CSV files with the Excel Compare extension's
   own code: its reader and comparer (src/core with SheetJS, in cmp-worker.js, a Web Worker of this tab) and its own
   comparison view (media/main.js as view.js, which puts every value on the page with textContent). This file is the
   host the extension's view talks to: it reads the two files with the File API, runs the worker and passes rows to the
   view. Nothing is uploaded. Free features only: the Zovo Pro tools of the extension are not offered here. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TIMEOUT_MS = 120000;
  const sides = { a: null, b: null };
  let mode = 'values', worker = null, seq = 0, viewSeq = 0, keepOrder = false;
  const pending = new Map();
  const toView = (data) => dispatchEvent(new MessageEvent('message', { data }));
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const plural = (n, one) => `${fmt(n)} ${n === 1 ? one : one + 's'}`;

  function startWorker() {
    if (worker) return worker;
    worker = new Worker('cmp-worker.js');
    worker.onmessage = (ev) => {
      const m = ev.data || {}, p = pending.get(m.id);
      if (!p) return;
      if (m.progress) { p.progress && p.progress(m.progress); return; }
      pending.delete(m.id); clearTimeout(p.timer); p.resolve(m);
    };
    worker.onerror = (e) => { e.preventDefault(); stopWorker('The comparison stopped: ' + (e.message || 'error')); };
    return worker;
  }
  function stopWorker(why) {
    const w = worker; worker = null; if (w) w.terminate();
    for (const [id, p] of pending) { clearTimeout(p.timer); p.resolve({ id, ok: false, error: why }); }
    pending.clear();
  }
  function ask(msg, progress, transfer) {
    return new Promise((resolve) => {
      const id = ++seq, w = startWorker();
      const timer = msg.op === 'compare' ? setTimeout(() => stopWorker('The comparison took longer than ' + TIMEOUT_MS / 1000 + ' s and was stopped.'), TIMEOUT_MS) : null;
      pending.set(id, { resolve, progress, timer });
      w.postMessage(Object.assign({ id }, msg), transfer || []);
    });
  }

  function countsText(c, oa, ob) {
    const parts = [];
    if (c.changed) parts.push(plural(c.changed, 'row') + ' changed');
    if (c.added) parts.push(plural(c.added, 'row') + ' added');
    if (c.removed) parts.push(plural(c.removed, 'row') + ' removed');
    if (c.cells) parts.push(plural(c.cells, 'cell') + ' changed');
    if (c.colsAdded) parts.push(plural(c.colsAdded, 'column') + ' added');
    if (c.colsRemoved) parts.push(plural(c.colsRemoved, 'column') + ' removed');
    if (oa) parts.push(plural(oa, 'sheet') + ' only in the first file');
    if (ob) parts.push(plural(ob, 'sheet') + ' only in the second file');
    return parts.join(', ');
  }

  async function compare() {
    const t0 = performance.now();
    if (worker) stopWorker('A new comparison started.');
    const [ba, bb] = await Promise.all([sides.a.arrayBuffer(), sides.b.arrayBuffer()]);
    toView({ type: 'busy', text: 'Reading the files...' });
    const r = await ask({ op: 'compare', mode, a: { name: sides.a.name, bytes: ba }, b: { name: sides.b.name, bytes: bb } },
      (text) => { self.zovoMsg(text); toView({ type: 'busy', text }); }, [ba, bb]);
    $('fname').textContent = sides.a.name + '  and  ' + sides.b.name;
    $('fmeta').textContent = self.zovoSize(sides.a.size) + ' and ' + self.zovoSize(sides.b.size);
    if (!r.ok) {
      viewSeq++;
      toView({ type: 'error', message: r.error });
      self.zovoState = { ok: false, error: r.error, pwned: !!self.__pwned };
      throw new Error(r.error);
    }
    viewSeq++;
    const m = r.meta;
    toView(Object.assign({ type: 'result', pro: { show: false } }, m));
    const same = !m.sheets.some((x) => x.chg.length + x.counts.colsAdded + x.counts.colsRemoved) && !m.sheetsOnlyA && !m.sheetsOnlyB;
    self.zovoState = { ok: true, mode: m.mode, totals: m.totals, sheets: m.sheets.length, sheetsOnlyA: m.sheetsOnlyA, sheetsOnlyB: m.sheetsOnlyB, same,
      tabs: m.sheets.map((x) => (x.nameB || x.nameA) + ':' + x.chg.length), notes: m.notes.concat(...m.sheets.map((x) => x.notes)), pwned: !!self.__pwned };
    const ms = Math.round(performance.now() - t0);
    return same ? `The files are the same (${m.mode} compared, ${ms} ms).` : `Compared in ${ms} ms: ${countsText(m.totals, m.sheetsOnlyA, m.sheetsOnlyB)}.`;
  }

  // The extension view's requests (acquireVsCodeApi().postMessage in view.js).
  self.zovoXcHost = (m) => {
    if (!m || typeof m.type !== 'string') return;
    if (m.type === 'rows') {
      const vs = viewSeq;
      ask({ op: 'rows', sheet: m.sheet, start: m.start, end: m.end }).then((r) => {
        if (vs !== viewSeq || !r.ok || !r.rows) return;
        toView({ type: 'rows', sheet: m.sheet, start: m.start, rows: r.rows, seq: m.seq });
      });
    } else if (m.type === 'mode' && (m.mode === 'values' || m.mode === 'formulas') && sides.a && sides.b) {
      mode = m.mode; rerun();
    } else if (m.type === 'swap' && sides.a && sides.b) {
      [sides.a, sides.b] = [sides.b, sides.a]; showNames(); rerun();
    } else if (m.type === 'copy' && typeof m.text === 'string') {
      navigator.clipboard.writeText(m.text).then(() => self.zovoMsg('Copied.'), () => self.zovoMsg('Copy is blocked here.', true));
    }
    // 'ready', 'rendered', 'openFile': nothing to do in a browser tab. 'tool', 'byOrder', 'openPair': Pro or folder tools, not on this page.
  };
  for (const m of self.zovoXcQueue || []) self.zovoXcHost(m);
  self.zovoXcQueue = [];

  function rerun() {
    self.zovoMsg('Comparing...');
    compare().then((t) => self.zovoMsg(t), (e) => self.zovoMsg('Could not compare: ' + e.message, true));
  }
  function showNames() {
    $('nameA').textContent = sides.a ? sides.a.name : 'none yet';
    $('nameB').textContent = sides.b ? sides.b.name : 'none yet';
  }

  self.zovoMulti = true;
  if ($('pick')) $('pick').multiple = true;
  // Two files at once: the older one (by date) is the first file. One file: it fills the next empty side.
  self.zovoOpen = async (files) => {
    const list = [...files], ko = keepOrder; keepOrder = false;
    if (list.length > 2) throw new Error('pick two files: the first (older) and the second (newer) one.');
    if (list.length === 2) {
      const [x, y] = ko || list[0].lastModified <= list[1].lastModified ? list : [list[1], list[0]];
      sides.a = x; sides.b = y;
    } else if (!sides.a || (sides.a && sides.b)) { sides.a = list[0]; sides.b = null; }
    else sides.b = list[0];
    showNames();
    if (!sides.b) {
      $('view').hidden = true;
      return `First file: ${sides.a.name}. Now pick the second file to compare it with.`;
    }
    return compare();
  };
  const pickSide = (id, side) => $(id).addEventListener('change', () => {
    const f = $(id).files[0]; $(id).value = '';
    if (!f) return;
    sides[side] = f; showNames();
    if (sides.a && sides.b) { keepOrder = true; self.zovoOpenFiles([sides.a, sides.b]); }
    else self.zovoMsg(`${side === 'a' ? 'First' : 'Second'} file: ${f.name}. Now pick the ${side === 'a' ? 'second' : 'first'} file.`);
  });
  pickSide('pickA', 'a'); pickSide('pickB', 'b');

  // Samples come in pairs: the main sample button opens the two budget workbooks.
  const openPair = (names) => {
    const fs = names.map((n) => self.zovoSampleFile(n));
    if (fs.some((f) => !f)) return;
    keepOrder = true; self.zovoOpenFiles(fs);
  };
  if ($('sample')) $('sample').addEventListener('click', (e) => { e.stopImmediatePropagation(); openPair(['1-budget-march.xlsx', '2-budget-april.xlsx']); });
  document.querySelectorAll('[data-pair]').forEach((b) => b.addEventListener('click', () => openPair(b.dataset.pair.split(','))));
})();
