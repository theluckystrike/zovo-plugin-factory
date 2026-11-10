/* WEB4 (10 Nov 2026): a copy of the WEB3 page script (tools/web3/frame-app.js) for STL Viewer Online, DICOM Viewer
   Online and EML Viewer Online. Changes: several files can be picked at once (a glTF with its .bin and textures, a
   DICOM series), and the frame may report its own status text. WEB3 notes follow. Page script for the tools that
   run an extension's own viewer in a frame. The file is read in this tab and handed to the viewer frame
   (viewer.html, same origin) by postMessage. Nothing is uploaded: the page CSP sets connect-src 'none' and the
   frame may only load its own files. The tool is named by data-kind on #drop. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const KIND = $('drop').dataset.kind;
  const LIMIT = { model: 1024, dicom: 1024, eml: 500 }[KIND] * 1024 * 1024;
  const NOUN = { model: 'model', dicom: 'image set', eml: 'mail file' }[KIND];
  const MODEL_EXT = /\.(stl|obj|ply|glb|gltf|3mf)$/i;
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
    if (KIND === 'model') {
      if (!MODEL_EXT.test(name)) {
        if (/\.(dwg|dxf)$/i.test(name)) return 'This is a CAD drawing, not a 3D model. The DXF Viewer Online in Related tools opens DXF files.';
        if (/\.(step|stp|iges|igs|fbx|blend|dae|usdz?)$/i.test(name)) return 'This page opens STL, OBJ, PLY, GLB, glTF and 3MF. Export the model from your 3D program as STL, GLB or OBJ, then open that file.';
        return 'This page opens STL, OBJ, PLY, GLB, glTF and 3MF models (picked by file name). This file has another type.';
      }
      if (pdf) return 'This is a PDF, not a 3D model. The PDF Dark Mode Viewer in Related tools opens it.';
      return null;
    }
    if (KIND === 'dicom') {
      if (pdf) return 'This is a PDF, not a DICOM image. The PDF Dark Mode Viewer in Related tools opens it.';
      if (zip) return 'This is a ZIP archive. Unzip it first, then pick the DICOM files (or the whole folder) inside.';
      return null; // DICOM with or without the 128-byte preamble, NIfTI (.nii, .nii.gz): the reader decides
    }
    if (KIND === 'eml') {
      if (pdf) return 'This is a PDF, not an e-mail. The PDF Dark Mode Viewer in Related tools opens it.';
      if (zip) return 'This is a ZIP-based file (for example Word, Excel or a ZIP of mails), not an .eml message. Unzip it first.';
      const ole = h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0;
      if (ole) return 'This is an Outlook .msg file (or another old Office file), not an .eml message. In Outlook, drag the mail to the desktop as .eml, or use File, Save As, then open that file.';
      let zeros = 0; for (let i = 0; i < Math.min(h.length, 1024); i++) if (h[i] === 0) zeros++;
      if (zeros > 8) return 'This is a binary file, not an e-mail message (.eml, .emlx or .mbox are text).';
      return null;
    }
    return null;
  }

  async function open(list) {
    let all = Array.from(list || []).filter(f => f && f.size !== undefined);
    if (!all.length) return;
    // The main file: for a model the first file with a model extension, the rest are its neighbours (.bin, textures, .mtl).
    let f = all[0];
    if (KIND === 'model') { f = all.find(x => /\.(gltf|obj)$/i.test(x.name)) || all.find(x => MODEL_EXT.test(x.name)) || all[0]; }
    if (KIND === 'dicom') { all = all.filter(x => x.size > 0 && !/^\.|\.(txt|xml|json|jpe?g|png|html?|pdf|zip|exe|ini|inf)$/i.test(x.name)); f = all[0]; if (!f) { say('None of these files looks like a DICOM or NIfTI image.', true); return; } }
    const others = KIND === 'eml' ? [] : all.filter(x => x !== f).slice(0, 5000);
    if (!f.size) { say('This file is empty (0 bytes).', true); return; }
    const total = [f].concat(others).reduce((n, x) => n + x.size, 0);
    if (total > LIMIT) { say(`These files are ${size(total)}. The page opens up to ${size(LIMIT)}, because the browser holds the whole ${NOUN} in memory. The free VS Code extension below opens larger files.`, true); return; }
    const h = await head(f, 1024);
    const why = refuse(h, f.name);
    if (why) { say(why, true); return; }
    say(`Opening ${f.name}${others.length ? ` and ${others.length} more file${others.length === 1 ? '' : 's'}` : ''}...`);
    const bytes = await f.arrayBuffer();
    const extras = [];
    for (const x of others) extras.push({ name: x.name, bytes: await x.arrayBuffer() });
    current = { name: f.name, size: total };
    pending = { type: 'zovo-open', name: f.name, bytes, extras };
    $('fname').textContent = KIND === 'dicom' && others.length ? `${others.length + 1} files` : f.name;
    $('fmeta').textContent = size(total) + (KIND === 'model' && others.length ? ` with ${others.length} more file${others.length === 1 ? '' : 's'}` : '');
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
      frame.contentWindow.postMessage(p, location.origin, [p.bytes].concat(p.extras.map(x => x.bytes)));
    } else if (d.type === 'zovo-status') {
      if (d.ok && d.text) say(String(d.text).slice(0, 300));
      else if (d.ok) say(d.pages ? `${d.pages} page${d.pages === 1 ? '' : 's'}. Read on this computer: nothing was uploaded.` : `Opened in ${Math.round(d.ms || 0)} ms. Read on this computer: nothing was uploaded.`);
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
  if ($('pickDir')) $('pickDir').addEventListener('change', e => open(e.target.files));
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
