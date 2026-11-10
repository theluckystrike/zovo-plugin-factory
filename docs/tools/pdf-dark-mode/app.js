/* WEB3 (10 Nov 2026) page script for the tools that run an extension's own viewer in a frame: PDF Dark Mode Viewer,
   DXF Viewer Online and EPUB Reader Online. The file is read in this tab and handed to the viewer frame
   (viewer.html, same origin) by postMessage. Nothing is uploaded: the page CSP sets connect-src 'none' and the
   frame may only load its own files. The tool is named by data-kind on #drop. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const KIND = $('drop').dataset.kind;
  const LIMIT = { pdf: 1024, dxf: 500, epub: 200 }[KIND] * 1024 * 1024;
  const NOUN = { pdf: 'PDF', dxf: 'drawing', epub: 'book' }[KIND];
  let frame = null, pending = null, current = null;

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
  const ascii = (h, a, b) => String.fromCharCode.apply(null, h.subarray(a, b));
  async function head(f, n) { return new Uint8Array(await f.slice(0, n).arrayBuffer()); }

  /** A plain message for files this tool cannot open, from the first bytes. null = hand it to the viewer. */
  function refuse(h, name) {
    const zip = h[0] === 0x50 && h[1] === 0x4b && h[2] === 3 && h[3] === 4;
    const pdf = ascii(h, 0, 1024).indexOf('%PDF-') >= 0;
    const ole = h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0;
    if (KIND === 'pdf') {
      if (pdf) return null;
      if (zip) return 'This is a ZIP-based file (for example Word, Excel or EPUB), not a PDF. Open it with the matching viewer from the Related tools below.';
      if (ole) return 'This is an old Office file (.doc, .xls or .ppt), not a PDF.';
      return 'This file does not start like a PDF (no %PDF- header in its first 1 KB), so it was not opened.';
    }
    if (KIND === 'dxf') {
      if (pdf) return 'This is a PDF, not a DXF drawing. The PDF Dark Mode Viewer in Related tools opens it.';
      if (zip) return 'This is a ZIP archive, not a DXF drawing. Unzip it first, then open the .dxf file inside.';
      return null; // DXF text, binary DXF and DWG (the viewer explains DWG) go to the viewer
    }
    if (KIND === 'epub') {
      if (zip) return null;
      if (pdf) return 'This is a PDF, not an EPUB book. The PDF Dark Mode Viewer in Related tools opens it.';
      if (/\.(mobi|azw3?|kfx)$/i.test(name)) return 'This is a Kindle file (MOBI, AZW or KFX), not an EPUB. Convert it to EPUB first, for example with Calibre, then open the .epub here.';
      return 'This file is not an EPUB book (an EPUB is a ZIP archive, and this file does not start like one).';
    }
    return null;
  }

  async function open(list) {
    const f = Array.from(list || []).filter(Boolean)[0];
    if (!f) return;
    if (!f.size) { say('This file is empty (0 bytes).', true); return; }
    if (f.size > LIMIT) { say(`This file is ${size(f.size)}. The page opens files up to ${size(LIMIT)}, because the browser holds the whole ${NOUN} in memory. The free VS Code extension below opens larger files.`, true); return; }
    const h = await head(f, 1024);
    const why = refuse(h, f.name);
    if (why) { say(why, true); return; }
    say(`Opening ${f.name}...`);
    const bytes = await f.arrayBuffer();
    current = { name: f.name, size: f.size };
    pending = { type: 'zovo-open', name: f.name, bytes };
    $('fname').textContent = f.name;
    $('fmeta').textContent = size(f.size);
    $('drop').hidden = true; $('view').hidden = false;
    // A fresh frame for every file, so nothing of the last file stays in memory.
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.id = 'frame';
    frame.title = 'Viewer for ' + f.name;
    frame.src = 'viewer.html#' + themeNow();
    $('frameBox').append(frame);
  }

  addEventListener('message', ev => {
    if (ev.origin !== location.origin || !frame || ev.source !== frame.contentWindow || !ev.data || typeof ev.data !== 'object') return;
    const d = ev.data;
    if (d.type === 'zovo-frame-ready' && pending) {
      const p = pending; pending = null;
      frame.contentWindow.postMessage(p, location.origin, [p.bytes]);
    } else if (d.type === 'zovo-status') {
      if (d.ok) say(d.pages ? `${d.pages} page${d.pages === 1 ? '' : 's'}. Read on this computer: nothing was uploaded.` : `Opened in ${Math.round(d.ms || 0)} ms. Read on this computer: nothing was uploaded.`);
      else say(d.message ? String(d.message).slice(0, 400) : `This ${NOUN} could not be opened.`, true);
    } else if (d.type === 'zovo-note') {
      say(String(d.text || '').slice(0, 300));
    } else if (d.type === 'zovo-drop' && Array.isArray(d.files)) {
      open(d.files.filter(x => x instanceof File));
    } else if (d.type === 'zovo-pro') {
      $('proNote').hidden = false;
      $('pro').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  $('pick').addEventListener('change', e => open(e.target.files));
  $('pick2').addEventListener('change', e => open(e.target.files));
  $('sample').addEventListener('click', () => {
    const go = () => {
      const s = self.ZOVO_SAMPLE, bin = atob(s.b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      open([new File([u], s.name, { type: s.type || 'application/octet-stream' })]);
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
