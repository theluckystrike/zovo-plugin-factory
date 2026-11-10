/* Zovo DOCX Viewer Online. The Word file is read in this tab by the Zovo Doc Viewer element (docx-preview) and
   never sent anywhere: the page CSP sets connect-src 'none'. Scripts, frames and javascript: links inside a
   document are removed before it shows, and the CSP blocks inline script anyway. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement, viewer = $('doc');
  const MAX = 200 * 1024 * 1024;

  const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  const syncTheme = () => viewer.setAttribute('theme', root.dataset.theme || 'auto');
  syncTheme();
  $('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
    syncTheme();
  });

  const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
  const size = n => n < 1024 * 1024 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

  async function open(file) {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (file.size > MAX) { say(`This file is ${size(file.size)}. The page opens Word files up to 200 MB.`, true); return; }
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const zip = head[0] === 0x50 && head[1] === 0x4b;
    const ole = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
    if (ole || ext === 'doc') { say('This is an old binary .doc file. The page opens .docx and .odt files. The free DOCX Viewer extension for VS Code and Cursor opens .doc files too.', true); return; }
    if (!zip) { say('This does not look like a Word file (.docx files start with the ZIP signature PK). The page opens .docx and .odt files.', true); return; }
    if (['xlsx', 'xlsm', 'pptx', 'ppsx'].includes(ext)) { say('This is an Excel or PowerPoint file. The page opens Word files (.docx and .odt).', true); return; }
    $('drop').hidden = true; $('view').hidden = false;
    $('fname').textContent = file.name; $('fmeta').textContent = size(file.size);
    say('Opening...');
    await customElements.whenDefined('zovo-doc-viewer');
    const t0 = performance.now();
    const r = await viewer.load(file, { name: file.name, format: ext === 'odt' ? 'odt' : 'docx' });
    if (r) say(`Opened in ${Math.round(performance.now() - t0)} ms` + (r.pages ? `, ${r.pages} page${r.pages === 1 ? '' : 's'}.` : '.'));
  }
  viewer.addEventListener('error', e => say((e.detail && e.detail.message) || 'This file could not be opened.', true));
  $('pick').addEventListener('change', e => open(e.target.files[0]));
  $('pick2').addEventListener('change', e => open(e.target.files[0]));
  $('sample').addEventListener('click', () => {
    const go = () => {
      const s = self.ZOVO_SAMPLE, bin = atob(s.b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      open(new File([u], s.name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    };
    if (self.ZOVO_SAMPLE) return go();
    const sc = document.createElement('script'); sc.src = 'sample.js'; sc.onload = go; document.head.append(sc);
  });
  const dz = $('drop');
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
