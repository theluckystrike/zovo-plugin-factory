/* SQLite Viewer Online, viewer frame. This stands in for VS Code under the SQLite Editor extension's own webview
   (webview.js): acquireVsCodeApi() talks to a Web Worker (worker.js) that runs the extension's session code on
   sql.js. The database comes from the parent page by postMessage, is read in this tab and is never sent anywhere
   (CSP connect-src 'none'; the worker has no network functions). Read-only: editing messages are dropped. */
(function () {
  'use strict';
  const ORIGIN = location.origin;
  const root = document.documentElement;
  let worker = null, ready = false, file = null, queue = [], history = [], exportFmt = null, blobReq = null, busyTimer = 0, busy = null;

  const setTheme = t => { if (t === 'dark' || t === 'light') root.dataset.theme = t; else delete root.dataset.theme; };
  setTheme((location.hash || '').slice(1));

  // Messages to the webview go through one synthetic event, marked so the guard below lets them pass.
  const SYN = new WeakSet();
  const toView = data => { const e = new MessageEvent('message', { data, origin: ORIGIN }); SYN.add(e); dispatchEvent(e); };
  const toParent = data => { try { parent.postMessage(data, ORIGIN); } catch (e) { /* no parent */ } };

  // Only two kinds of message reach the webview: ours, and the parent page's open and theme messages.
  addEventListener('message', ev => {
    if (SYN.has(ev)) return;
    ev.stopImmediatePropagation();
    if (ev.origin !== ORIGIN || ev.source !== parent || !ev.data || typeof ev.data !== 'object') return;
    const d = ev.data;
    if (d.type === 'zovo-theme') setTheme(d.theme);
    if (d.type === 'zovo-open') open(d);
  }, true);

  function startWorker() {
    if (worker) worker.terminate();
    worker = new Worker('worker.js');
    worker.onmessage = ev => fromWorker(ev.data);
    worker.onerror = e => { e.preventDefault(); toView({ type: 'error', message: 'The SQLite engine stopped: ' + (e.message || 'unknown error') + '. Reload the page and open the file again.' }); toParent({ type: 'zovo-status', ok: false }); };
  }

  function open(d) {
    file = { name: String(d.name || 'database.db').slice(0, 300), bytes: d.bytes, wal: d.wal || null };
    startWorker();
    toView({ type: 'init', fileName: file.name, history, canEdit: false, proEnabled: false, isPro: false });
    toView({ type: 'settings', autoReload: false });
    toView({ type: 'pro', visible: true, licensed: false, local: true });
    if (d.warnings && d.warnings.length) toView({ type: 'warnings', warnings: d.warnings });
    const copy = file.bytes.slice(0), wal = file.wal ? file.wal.slice(0) : null;
    worker.postMessage({ type: 'open', bytes: copy, wal }, wal ? [copy, wal] : [copy]);
  }

  // A query that runs long (a huge join, a recursive CTE) can be stopped: the worker is replaced and the file reopened.
  function markBusy(what) {
    clearTimeout(busyTimer);
    busy = what;
    busyTimer = setTimeout(() => { if (busy) toParent({ type: 'zovo-busy', what: busy }); }, 4000);
  }
  function clearBusy() { clearTimeout(busyTimer); if (busy) toParent({ type: 'zovo-busy', what: null }); busy = null; }
  addEventListener('message', ev => {
    if (ev.origin === ORIGIN && ev.source === parent && ev.data && ev.data.type === 'zovo-stop' && file) { clearBusy(); open(file); toView({ type: 'error', message: 'Stopped. The database was opened again.', transient: true }); }
  }, true);

  function fromWorker(m) {
    if (!m || typeof m !== 'object') return;
    clearBusy();
    if (m.type === 'opened') toParent({ type: 'zovo-status', ok: true, ms: m.ms });
    if (m.type === 'error' && !m.transient) toParent({ type: 'zovo-status', ok: false, message: m.message });
    if (m.type === 'copyResult') return onCopy(m);
    if (m.type === 'exportResult') return onExport(m);
    if (m.type === 'blobOut') return onBlob(m);
    toView(m);
  }

  async function onCopy(m) {
    let ok = true;
    try { await navigator.clipboard.writeText(m.text || ''); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = m.text || ''; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    if (ok) toView({ type: 'copied', rows: m.rows, format: m.format, truncated: !!m.truncated });
    else toView({ type: 'error', message: 'The browser did not allow the copy. Select the cells and press Ctrl+C or Cmd+C.', transient: true });
  }

  function save(name, data, mime) {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const base = () => file.name.replace(/\.[^.]+$/, '') || 'database';

  function onExport(m) {
    const fmt = exportFmt || m.format || 'csv';
    exportFmt = null;
    if (!m.ok) { toView({ type: 'exported', ok: false }); toView({ type: 'error', message: 'Export failed: ' + (m.error || 'unknown error'), transient: true }); return; }
    save(`${base()}-export.${fmt}`, m.text, fmt === 'json' ? 'application/json' : fmt === 'sql' ? 'application/sql' : 'text/csv');
    toView({ type: 'exported', ok: true, rows: m.rows, bytes: m.bytes, format: fmt, truncated: m.truncated });
  }

  function onBlob(m) {
    const r = blobReq; blobReq = null;
    if (!m.bytes || !r) { toView({ type: 'error', message: 'This cell has no bytes to save.', transient: true }); return; }
    save(`${base()}-row${r.row + 1}-col${r.col + 1}.bin`, m.bytes, 'application/octet-stream');
  }

  // The export format picker (VS Code shows a quick pick here).
  function pickExport() {
    const box = document.getElementById('exportPick');
    box.hidden = false;
    box.querySelector('button').focus();
    return new Promise(res => {
      const done = v => { box.hidden = true; box.removeEventListener('click', onClick); removeEventListener('keydown', onKey, true); res(v); };
      const onClick = e => { const b = e.target.closest('button'); if (b) done(b.dataset.fmt || null); };
      const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
      box.addEventListener('click', onClick);
      addEventListener('keydown', onKey, true);
    });
  }

  const FROM_VIEW = new Set(['objects', 'openTable', 'runSql', 'getRows', 'sort', 'filter', 'cell', 'count', 'schema', 'copy']);
  const api = {
    postMessage: async m => {
      if (!m || typeof m !== 'object') return;
      if (m.type === 'ready') { ready = true; return; }
      if (!worker) return;
      if (m.type === 'proTools') { toParent({ type: 'zovo-pro' }); return; }
      if (m.type === 'export') {
        const fmt = m.format || await pickExport();
        if (!fmt) return;
        exportFmt = fmt;
        toView({ type: 'exporting', format: fmt });
        markBusy('export');
        worker.postMessage({ type: 'export', format: fmt });
        return;
      }
      if (m.type === 'blobToFile') { blobReq = { row: m.row, col: m.col }; worker.postMessage({ type: 'blobOut', row: m.row, col: m.col }); return; }
      if (m.type === 'runSql' && typeof m.sql === 'string') {
        const s = m.sql.trim();
        history = [s, ...history.filter(x => x !== s)].slice(0, 30);
        toView({ type: 'history', history });
        markBusy('query');
      }
      if (m.type === 'sort' || m.type === 'filter' || m.type === 'openTable' || m.type === 'count') markBusy('query');
      if (FROM_VIEW.has(m.type)) worker.postMessage(m);
      // reload, setAutoReload, openSettings and every editing message have no meaning here.
    },
    getState: () => undefined,
    setState: () => {},
  };
  self.acquireVsCodeApi = () => api;
  // A file dropped on the viewer goes to the page, which opens it in a fresh frame.
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) toParent({ type: 'zovo-drop', files: Array.from(f) }); });
  // Ready once webview.js has run and listens.
  addEventListener('load', () => toParent({ type: 'zovo-frame-ready' }));
})();
