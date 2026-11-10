/* Zovo Excel Viewer Online. The spreadsheet is read in this tab by the Zovo Doc Viewer element (SheetJS CE for
   Excel and OpenDocument sheets, a built-in reader for CSV and TSV, hyparquet for Parquet) and never sent
   anywhere: the page CSP sets connect-src 'none'. Cell text is written as text, never as HTML, and formulas and
   macros are not run (the value Excel saved is shown). */
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

  // The format from the first bytes, so a file with the wrong name still opens right (or gets a clear message).
  function sniff(h, ext) {
    const s = String.fromCharCode.apply(null, h.subarray(0, 8));
    if (s.startsWith('PAR1')) return 'parquet';
    if (s.startsWith('%PDF')) return 'pdf';
    if (h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11 && h[3] === 0xe0) return ext === 'doc' || ext === 'ppt' ? 'office-old' : 'xls';
    if (h[0] === 0x50 && h[1] === 0x4b) return ['docx', 'docm', 'dotx', 'odt', 'pptx', 'ppsx', 'potx', 'pptm', 'odp'].includes(ext) ? 'office-other' : ext === 'ods' ? 'ods' : 'xlsx';
    if (['csv', 'tsv', 'tab', 'txt'].includes(ext)) return ext === 'tsv' || ext === 'tab' ? 'tsv' : 'csv';
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'ods') return 'broken-zip';
    if (ext === 'parquet' || ext === 'parq') return 'broken-parquet';
    // No known signature: a text file with commas or tabs is still a table.
    const t = h.subarray(0, 4096);
    let bin = 0, tab = 0;
    for (const b of t) { if (b === 0) bin++; if (b === 9) tab++; }
    return bin ? 'binary' : tab ? 'tsv' : 'csv';
  }

  async function open(file) {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!file.size) { say('This file is empty (0 bytes).', true); return; }
    if (file.size > MAX) { say(`This file is ${size(file.size)}. The page opens spreadsheets up to 200 MB. The free Excel, CSV and Parquet Viewer for VS Code and Cursor opens bigger files.`, true); return; }
    const h = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const fmt = sniff(h, ext);
    const bad = {
      pdf: 'This is a PDF, not a spreadsheet. The page opens .xlsx, .xls, .ods, .csv, .tsv and .parquet files.',
      'office-other': 'This is a Word or PowerPoint file. The page opens spreadsheets. Try the DOCX or PPTX viewer linked below.',
      'office-old': 'This is an old Word or PowerPoint file, not a spreadsheet.',
      'broken-zip': 'This file is named like an Excel file but is not a complete one (Excel files are ZIP archives that start with PK). It may be damaged or cut short.',
      'broken-parquet': 'This file is named .parquet but does not start with PAR1, so it is not a Parquet file, or it is damaged.',
      binary: 'This looks like a binary file, not a spreadsheet or a CSV. The Hex Viewer linked below shows any file.',
    }[fmt];
    if (bad) { say(bad, true); return; }
    $('drop').hidden = true; $('view').hidden = false;
    $('fname').textContent = file.name; $('fmeta').textContent = size(file.size);
    say('Opening...');
    await customElements.whenDefined('zovo-doc-viewer');
    const t0 = performance.now();
    const r = await viewer.load(file, { name: file.name, format: fmt });
    if (r) say(`Opened in ${Math.round(performance.now() - t0)} ms` + (r.pages > 1 ? `, ${r.pages} sheets.` : '.') + ' Click a column name to sort, Ctrl+F or Cmd+F to find.');
  }
  viewer.addEventListener('error', e => say((e.detail && e.detail.message) || 'This file could not be opened.', true));
  $('pick').addEventListener('change', e => open(e.target.files[0]));
  $('pick2').addEventListener('change', e => open(e.target.files[0]));
  $('sample').addEventListener('click', () => {
    const go = () => {
      const s = self.ZOVO_SAMPLE, bin = atob(s.b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      open(new File([u], s.name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
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
