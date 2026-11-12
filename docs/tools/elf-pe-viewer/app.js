/* ELF and PE Viewer Online (TOOLCHK, wave18; first draft by HTOOL1, replaced). No library, no request.
   The binary is read in this tab and parsed by the ELF Viewer & PE Viewer extension's own readers (binreader.js,
   built from its src/core): ELF, PE (EXE and DLL) and Mach-O, universal files included. Every read is bounds-checked
   and a damaged file gives a warning plus the rest of the structure. Nothing in the file is run, and every value
   is written as text, never as HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const B = self.ZovoBin, ROWS = 2000;
  let model = null, tab = 0, sortC = -1, sortD = 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kv = rows => rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td>${r[2] != null ? `<td class="mut mono small">${esc('0x' + Number(r[2]).toString(16))}${r[3] != null ? ', ' + esc(r[3]) + ' B' : ''}</td>` : '<td></td>'}</tr>`).join('');

  function show(m) {
    model = m; tab = 0; sortC = -1;
    $('btitle').textContent = m.title;
    $('bsum').innerHTML = kv(m.summary);
    $('bwarn').textContent = m.warnings.length ? 'Notes: ' + m.warnings.join(' ') : '';
    $('bgroups').innerHTML = m.groups.map((g, i) => `<details${i === 0 ? '' : ''}><summary>${esc(g.title)} <span class="mut small">(${g.fields.length} fields)</span></summary><table class="kv">${kv(g.fields)}</table></details>`).join('');
    $('btabs').innerHTML = m.tables.map((t, i) => `<button type="button" data-t="${i}">${esc(t.title)} <span class="mut">${t.rows.length.toLocaleString('en-US')}</span></button>`).join('');
    $('tq').value = '';
    table();
  }
  function table() {
    const t = model.tables[tab];
    document.querySelectorAll('#btabs button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t === tab)));
    if (!t) { $('btable').innerHTML = ''; $('tnote').textContent = 'No tables.'; return; }
    const q = $('tq').value.trim().toLowerCase();
    let idx = t.rows.map((_, i) => i);
    if (q) idx = idx.filter(i => t.rows[i].some(c => String(c).toLowerCase().includes(q)));
    if (sortC >= 0) {
      const num = t.columns[sortC].t !== 's', val = c => num ? (typeof c === 'number' ? c : parseInt(String(c).replace(/^0x/i, ''), String(c).startsWith('0x') ? 16 : 10)) : String(c).toLowerCase();
      idx.sort((a, b) => { const x = val(t.rows[a][sortC]), y = val(t.rows[b][sortC]); return (x < y ? -1 : x > y ? 1 : 0) * sortD; });
    }
    $('btable').innerHTML = '<thead><tr>' + t.columns.map((c, i) => `<th data-c="${i}">${esc(c.n)}${sortC === i ? (sortD > 0 ? ' &#9650;' : ' &#9660;') : ''}</th>`).join('') + '</tr></thead><tbody>' +
      idx.slice(0, ROWS).map(i => '<tr>' + t.rows[i].map((c, j) => `<td class="${t.columns[j].t !== 's' ? 'n mono' : ''}" title="${esc(String(c).length > 60 ? c : '')}">${esc(typeof c === 'number' ? c.toLocaleString('en-US') : c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
    $('tnote').textContent = (q ? idx.length.toLocaleString('en-US') + ' of ' : '') + t.rows.length.toLocaleString('en-US') + ' rows' + (idx.length > ROWS ? ', the first ' + ROWS.toLocaleString('en-US') + ' shown, type to narrow' : '') + '. Click a column title to sort.';
  }
  self.zovoOpen = async file => {
    if (file.size > 1024 * 1048576) throw new Error('it is ' + self.zovoSize(file.size) + '. This page reads binaries up to 1 GB into the tab.');
    const u8 = new Uint8Array(await file.arrayBuffer());
    let m;
    try { m = B.parseBuffer(u8, { maxMs: 8000 }); } catch (e) { throw new Error(String(e.message || e).replace(/^This is not/, 'it is not').replace(/\.$/, '') + '.'); }
    $('fmeta').textContent = self.zovoSize(file.size);
    $('slices').hidden = !(m.slices && m.slices.length);
    if (m.slices && m.slices.length) {
      $('slice').innerHTML = m.slices.map((s, i) => `<option value="${i}">${esc(s.arch)} (offset 0x${s.offset.toString(16)}, ${esc(self.zovoSize(s.size))})</option>`).join('');
      $('slice').onchange = () => show(m.slices[+$('slice').value].model);
      $('sliceSum').innerHTML = kv(m.summary);
      show(m.slices[0].model);
    } else show(m);
    return 'Opened ' + file.name + ': ' + m.title + '.';
  };
  $('btabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { tab = +b.dataset.t; sortC = -1; $('tq').value = ''; table(); } });
  $('btable').addEventListener('click', e => { const th = e.target.closest('th[data-c]'); if (!th) return; const c = +th.dataset.c; if (sortC === c) sortD = -sortD; else { sortC = c; sortD = 1; } table(); });
  $('tq').addEventListener('input', () => model && table());
})();
