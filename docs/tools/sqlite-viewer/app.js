/* Zovo SQLite Viewer Online, page script. The database is read in this tab and handed to the viewer frame
   (viewer.html, same origin) by postMessage. The frame runs the SQLite Editor extension's own viewer on sql.js in a
   Web Worker. Nothing is uploaded: the CSP of both documents sets connect-src 'none'. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const MAX = 500 * 1024 * 1024;
  let frame = null, pending = null;

  const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  const themeNow = () => root.dataset.theme || '';
  $('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
    if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'zovo-theme', theme: root.dataset.theme }, location.origin);
  });

  const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
  const size = n => n < 1024 * 1024 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const MAGIC = 'SQLite format 3\u0000';

  async function head(f, n) { return new Uint8Array(await f.slice(0, n).arrayBuffer()); }
  const isSqlite = h => h.length >= 16 && String.fromCharCode.apply(null, h.subarray(0, 16)) === MAGIC;

  async function open(list) {
    const files = Array.from(list || []).filter(Boolean);
    if (!files.length) return;
    // A database can come with its -wal file (drop or pick both). The -wal holds changes not yet in the main file.
    const wal = files.find(f => /-wal$/i.test(f.name));
    const db = files.find(f => f !== wal && !/-(shm|journal)$/i.test(f.name)) || null;
    if (!db) { say(wal ? 'This is only the -wal file. Pick the database file too (both at once), or the database alone.' : 'Pick a .db, .sqlite or .sqlite3 file.', true); return; }
    if (!db.size) { say('This file is empty (0 bytes). A SQLite database is at least 512 bytes.', true); return; }
    if (db.size > MAX) { say(`This file is ${size(db.size)}. The page opens databases up to 500 MB, because the browser holds the whole file in memory. The free SQLite Editor extension for VS Code and Cursor opens larger files.`, true); return; }
    const h = await head(db, 100);
    if (!isSqlite(h)) {
      const zip = h[0] === 0x50 && h[1] === 0x4b;
      say(zip ? 'This is a ZIP archive, not a SQLite database. Unzip it first, then open the .db file inside.'
        : 'This file does not start with "SQLite format 3", so it is not a SQLite 3 database. An encrypted database (SQLCipher) looks like this too; it needs its key and a desktop tool.', true);
      return;
    }
    const warnings = [];
    let walBytes = null;
    if (wal) {
      if (wal.size > MAX) warnings.push('The -wal file is larger than 500 MB and was left out, so the newest changes may be missing.');
      else walBytes = await wal.arrayBuffer();
    }
    say(`Opening ${db.name}...`);
    const bytes = await db.arrayBuffer();
    pending = { type: 'zovo-open', name: db.name, bytes, wal: walBytes, warnings };
    $('fname').textContent = db.name + (walBytes ? ' + ' + wal.name : '');
    $('fmeta').textContent = size(db.size);
    $('drop').hidden = true; $('view').hidden = false;
    // A fresh frame for every file, so nothing of the last database stays in memory.
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.id = 'frame';
    frame.title = 'SQLite viewer for ' + db.name;
    frame.src = 'viewer.html#' + themeNow();
    $('frameBox').append(frame);
    $('stop').hidden = true;
  }

  addEventListener('message', ev => {
    if (ev.origin !== location.origin || !frame || ev.source !== frame.contentWindow || !ev.data || typeof ev.data !== 'object') return;
    const d = ev.data;
    if (d.type === 'zovo-frame-ready' && pending) {
      const p = pending; pending = null;
      frame.contentWindow.postMessage(p, location.origin, p.wal ? [p.bytes, p.wal] : [p.bytes]);
    } else if (d.type === 'zovo-status') {
      if (d.ok) say(`Opened in ${Math.round(d.ms || 0)} ms. Read-only: nothing is written to the file.`);
      else say(d.message ? String(d.message).slice(0, 400) : 'This database could not be opened.', true);
    } else if (d.type === 'zovo-drop' && Array.isArray(d.files)) {
      open(d.files.filter(f => f instanceof File));
    } else if (d.type === 'zovo-busy') {
      $('stop').hidden = !d.what;
    } else if (d.type === 'zovo-pro') {
      $('proNote').hidden = false;
      $('pro').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  $('stop').addEventListener('click', () => { $('stop').hidden = true; if (frame) frame.contentWindow.postMessage({ type: 'zovo-stop' }, location.origin); });

  $('pick').addEventListener('change', e => open(e.target.files));
  $('pick2').addEventListener('change', e => open(e.target.files));
  $('sample').addEventListener('click', () => {
    const go = () => {
      const s = self.ZOVO_SAMPLE, bin = atob(s.b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      open([new File([u], s.name, { type: 'application/vnd.sqlite3' })]);
    };
    if (self.ZOVO_SAMPLE) return go();
    const sc = document.createElement('script'); sc.src = 'sample.js'; sc.onload = go; document.head.append(sc);
  });
  const dz = $('drop');
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) open(f); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
