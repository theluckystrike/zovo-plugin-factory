/* TOOLCHK (wave18, 12 Nov 2026): shared page code for the browser tools drafted by the HTOOL lanes.
   It runs after the tool's own app.js and does the parts every page has: the theme button, the drop zone, the two
   file pickers, the sample button(s), the status line and the offline copy (sw.js).
   Contract with app.js:
     self.zovoOpen = async (file or [files]) => string | undefined   render the file into #view; throw to show an error.
                                                                      The returned string replaces the "Opened" line.
     self.zovoMulti = true                                            pass every picked or dropped file, not only the first.
   Samples: sample.js (written by build_tool_pages.py from sprint/tools/<slug>/samples/) sets self.ZOVO_SAMPLES.
   #sample opens the first one; any element with data-sample="<file name>" opens that one.
   Files are read with the File API in this tab. This file makes no network request except registering sw.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), root = document.documentElement;
  const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  self.zovoIsDark = isDark;
  if ($('theme')) $('theme').addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
    dispatchEvent(new Event('zovo-theme'));
  });

  const msg = (t, warn) => { const m = $('msg'); if (!m) return; m.textContent = t || ''; m.classList.toggle('warn', !!warn); };
  self.zovoMsg = msg;
  const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB';
  self.zovoSize = size;

  let busy = false;
  async function open(list) {
    const files = [...list].filter(Boolean);
    if (!files.length || typeof self.zovoOpen !== 'function' || busy) return;
    busy = true;
    const f = files[0], name = files.length > 1 ? files.length + ' files' : f.name;
    msg('Opening ' + name + '...');
    const t0 = performance.now();
    try {
      if ($('view')) $('view').hidden = false;
      if ($('fname')) $('fname').textContent = name;
      if ($('fmeta')) $('fmeta').textContent = size(files.reduce((a, x) => a + x.size, 0));
      const r = await self.zovoOpen(self.zovoMulti ? files : f);
      msg(typeof r === 'string' ? r : 'Opened ' + name + ' in ' + Math.round(performance.now() - t0) + ' ms.');
      if ($('view')) $('view').scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (e) {
      msg('Could not open ' + name + ': ' + (e && e.message ? e.message : String(e)), true);
    } finally { busy = false; }
  }
  self.zovoOpenFiles = open;

  for (const id of ['pick', 'pick2', 'pickDir']) {
    const el = $(id);
    if (el) el.addEventListener('change', () => { open(el.files); el.value = ''; });
  }
  const sampleFile = name => {
    const all = self.ZOVO_SAMPLES || [], s = name ? all.find(x => x.name === name) : all[0];
    if (!s) return null;
    const bin = atob(s.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], s.name, { type: s.type || '' });
  };
  self.zovoSampleFile = sampleFile;
  if ($('sample')) $('sample').addEventListener('click', () => open([sampleFile()]));
  document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => open([sampleFile(b.dataset.sample)])));

  if ($('drop') || $('view')) {
    let depth = 0;
    addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; document.body.classList.add('dragging'); } });
    addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
    addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    addEventListener('drop', e => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
      open(e.dataTransfer.files);
    });
    if ($('drop')) $('drop').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && $('pick')) { e.preventDefault(); $('pick').click(); } });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  self.zovoReady = true;  // for the page test
})();
