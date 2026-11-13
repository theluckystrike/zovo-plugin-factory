/* Image Metadata Viewer (TOOLCHK5, wave18, 13 Nov 2026). Shows the type, pixel size and transparency of an image with
   the Image Preview extension's own header reader (engine.js, MIT), and its EXIF, GPS, text chunks, XMP and file
   structure with meta.js. Files are read with the File API in this tab and never sent anywhere. File text is only ever
   written with textContent. The preview is an <img> of a blob: URL, so an SVG never runs a script. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine, M = self.ZovoMeta;
  const MAX_FILES = 200, MAX_BYTES = 256 * 1024 * 1024;
  let items = [], cur = null, url = '';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const kvRow = (k, v) => { const tr = el('tr'); tr.appendChild(el('th', null, k)); const td = el('td'); if (v instanceof Node) td.appendChild(v); else td.textContent = v; tr.appendChild(td); return tr; };
  const fill = (tb, rows) => { tb.textContent = ''; for (const r of rows) { const tr = el('tr'); for (const c of r) tr.appendChild(el('td', null, c)); tb.appendChild(tr); } };
  const fx = (x, d) => String(+x.toFixed(d));

  async function analyze(file) {
    if (file.size > MAX_BYTES) throw new Error(`${file.name} is ${self.zovoSize(file.size)}; this page reads images up to 256 MB.`);
    const u8 = new Uint8Array(await file.arrayBuffer());
    const dims = E.probe(u8);
    const meta = await M.read(u8);
    return { file, u8, dims, meta };
  }

  function summaryRows(it) {
    const d = it.dims, m = it.meta, s = m.summary || {};
    const rows = [];
    rows.push(['Type', d ? d.label + (d.animated ? ' (animated)' : '') + (d.progressive ? ' (progressive)' : '') : (E.typeFromName(it.file.name) || 'unknown').toUpperCase() + ', header not recognized']);
    if (d) rows.push(['Pixels', d.width && d.height ? `${d.width} × ${d.height}` + (d.viewBox ? ` (viewBox ${d.viewBox})` : '') : 'not stated in the header']);
    rows.push(['File size', E.humanSize(it.file.size) + ' (' + it.file.size.toLocaleString('en-US') + ' bytes)']);
    if (d && 'alpha' in d) rows.push(['Transparency', d.alpha ? 'Yes' : 'No']);
    if (d && d.frames > 1) rows.push(['Images inside', String(d.frames)]);
    if (s.camera) rows.push(['Camera', s.camera]);
    if (s.lens) rows.push(['Lens', s.lens]);
    if (s.taken) rows.push(['Taken', s.taken]);
    if (s.settings) rows.push(['Settings', s.settings]);
    if (s.orientation) rows.push(['Orientation', s.orientation]);
    if (s.software) rows.push(['Software', s.software]);
    if (m.icc) rows.push(['Color profile', (m.iccDesc ? m.iccDesc + ', ' : '') + E.humanSize(m.icc)]);
    rows.push(['Metadata', [m.tiff ? 'EXIF (' + m.exifAt + ')' : '', m.gps ? 'GPS' : '', m.xmp ? 'XMP' : '', m.iptc ? 'IPTC' : '', m.texts.length ? m.texts.length + ' text ' + (m.texts.length === 1 ? 'entry' : 'entries') : ''].filter(Boolean).join(', ') || 'none found']);
    return rows;
  }

  function show(it) {
    cur = it;
    const m = it.meta, d = it.dims;
    $('fname').textContent = it.file.name;
    $('fmeta').textContent = self.zovoSize(it.file.size);
    document.querySelectorAll('#list tbody tr').forEach((tr) => tr.classList.toggle('on', tr._it === it));
    // Preview
    if (url) URL.revokeObjectURL(url);
    url = '';
    const img = $('prev');
    if (d && E.DRAWABLE.has(d.type)) {
      url = URL.createObjectURL(new Blob([it.u8], { type: d.mime }));
      img.src = url; img.hidden = false;
      $('prevNote').textContent = d.type === 'svg' ? 'Shown as a picture: scripts in the SVG do not run.' : '';
    } else {
      img.removeAttribute('src'); img.hidden = true;
      $('prevNote').textContent = d ? `Browsers do not draw ${d.label} files, so there is no preview. The facts come from the file header.` : 'No preview: the file header is not one of the image types this page knows.';
    }
    // Summary
    const sum = $('sum').tBodies[0]; sum.textContent = '';
    for (const [k, v] of summaryRows(it)) sum.appendChild(kvRow(k, v));
    const gl = $('gpsLine'); gl.textContent = '';
    if (m.gps) {
      const { lat, lon, alt } = m.gps;
      const pos = `${fx(lat, 6)}, ${fx(lon, 6)}`;
      sum.appendChild(kvRow('Location', pos + (alt != null ? `, ${fx(alt, 1)} m` : '')));
      gl.appendChild(document.createTextNode('This photo stores where it was taken. '));
      const a = el('a', null, 'Open the spot on OpenStreetMap');
      a.href = `https://www.openstreetmap.org/?mlat=${fx(lat, 6)}&mlon=${fx(lon, 6)}#map=16/${fx(lat, 6)}/${fx(lon, 6)}`;
      a.rel = 'noopener noreferrer'; a.target = '_blank';
      gl.appendChild(a);
      gl.appendChild(document.createTextNode(' (a link you choose to open; the page itself sends nothing).'));
      gl.hidden = false;
    } else gl.hidden = true;
    $('strip').hidden = !(m.format === 'jpeg' && m.strip.length);
    // Warnings
    $('warns').textContent = m.warnings.length ? 'Notes: ' + m.warnings.slice(0, 8).join(' ') : '';
    $('warns').hidden = !m.warnings.length;
    // EXIF groups
    const g = $('groups'); g.textContent = '';
    for (const [name, rows] of m.groups || []) {
      if (!rows.length) continue;
      g.appendChild(el('h3', null, name === 'GPS' ? 'GPS (location)' : name));
      const wrap = el('div', 'tblwrap'), t = el('table', 'dtab'), th = el('thead'), hr = el('tr');
      hr.appendChild(el('th', null, 'Tag')); hr.appendChild(el('th', null, 'Value')); th.appendChild(hr); t.appendChild(th);
      const tb = el('tbody'); fill(tb, rows); t.appendChild(tb); wrap.appendChild(t); g.appendChild(wrap);
    }
    if (!m.tiff) g.appendChild(el('p', 'small mut', 'No EXIF block in this file' + (m.format === 'png' || m.format === 'gif' ? ' (most PNG and GIF files have none).' : '.')));
    // Texts, facts, XMP, structure
    fill($('texts').tBodies[0], m.texts.map(([k, v]) => [k, v.length > 2000 ? v.slice(0, 2000) + ' ...' : v]));
    $('textBox').hidden = !m.texts.length;
    const ft = $('facts').tBodies[0]; ft.textContent = '';
    for (const [k, v] of m.facts) ft.appendChild(kvRow(k, v));
    $('factBox').hidden = !m.facts.length;
    $('xmp').textContent = m.xmp || '';
    $('xmpSum').textContent = m.xmp ? `XMP (${m.xmp.length.toLocaleString('en-US')} characters, click to show)` : 'XMP';
    $('xmpBox').hidden = !m.xmp;
    const rows = (m.segments || []).map(([n, o, l, w]) => [n, String(o), l.toLocaleString('en-US'), w])
      .concat((m.chunks || []).map(([n, o, l, w]) => (o < 0 ? [n, '', '', `${l} chunks in all`] : [n.trim(), String(o), l.toLocaleString('en-US'), w || ''])));
    fill($('segs').tBodies[0], rows.slice(0, 2000));
    $('segHead').textContent = m.segments ? 'JPEG segments' : 'Chunks';
    $('segBox').hidden = !rows.length;
    self.zovoState = { name: it.file.name, type: d ? d.type : '', width: d ? d.width : 0, height: d ? d.height : 0, exif: !!m.tiff, gps: m.gps || null,
      summary: m.summary || null, texts: m.texts.length, warnings: m.warnings.length, files: items.length, pwned: !!self.__pwned };
  }

  function list() {
    const tb = $('list').tBodies[0]; tb.textContent = '';
    for (const it of items) {
      const d = it.dims, s = it.meta.summary || {};
      const tr = el('tr');
      for (const c of [it.file.name, d ? d.label : '?', d && d.width ? `${d.width} × ${d.height}` : '', E.humanSize(it.file.size), s.camera || '', s.taken || '', it.meta.gps ? 'yes' : '']) tr.appendChild(el('td', null, c));
      tr._it = it; tr.tabIndex = 0;
      tr.addEventListener('click', () => show(it));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') show(it); });
      tb.appendChild(tr);
    }
    $('listBox').hidden = items.length < 2;
  }

  const save = (bytes, name, type) => {
    const a = el('a'); a.href = URL.createObjectURL(new Blob([bytes], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const base = (n) => n.replace(/\.[^.]+$/, '');
  $('saveJson').addEventListener('click', () => {
    if (!cur) return;
    const m = cur.meta, d = cur.dims;
    const out = { file: cur.file.name, bytes: cur.file.size, type: d ? d.label : null, width: d ? d.width : null, height: d ? d.height : null,
      summary: m.summary || null, gps: m.gps || null, groups: Object.fromEntries((m.groups || []).map(([n, r]) => [n, Object.fromEntries(r)])),
      texts: m.texts, encoding: Object.fromEntries(m.facts), xmp: m.xmp || null, warnings: m.warnings };
    save(JSON.stringify(out, null, 2), base(cur.file.name) + '.metadata.json', 'application/json');
    self.zovoMsg('Saved ' + base(cur.file.name) + '.metadata.json.');
  });
  $('strip').addEventListener('click', () => {
    if (!cur) return;
    const out = M.stripJpeg(cur.u8, cur.meta);
    if (!out) return;
    save(out, base(cur.file.name) + '-no-exif.jpg', 'image/jpeg');
    self.zovoMsg(`Saved ${base(cur.file.name)}-no-exif.jpg: ${self.zovoSize(out.length)}, without the EXIF, GPS, XMP and IPTC parts. The pixels are the same bytes. Note: a phone photo may then show sideways, because its Orientation tag is gone.`);
    self.zovoStripped = out.length;
  });

  self.zovoMulti = true;
  if ($('pick')) $('pick').multiple = true;
  self.zovoOpen = async (files) => {
    const list0 = [...files];
    const take = list0.slice(0, MAX_FILES);
    const t0 = performance.now();
    const done = [], bad = [];
    for (const f of take) {
      try { done.push(await analyze(f)); } catch (e) { bad.push(f.name + ': ' + (e && e.message ? e.message : e)); }
      if (done.length % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (!done.length) throw new Error(bad[0] || 'nothing to read');
    items = done;
    list();
    show(items[0]);
    const unknown = items.filter((x) => !x.dims).length;
    const ms = Math.round(performance.now() - t0);
    return (items.length === 1 ? `Read ${items[0].file.name} in ${ms} ms.` : `Read ${items.length} images in ${ms} ms. Click a row to see its metadata.`)
      + (unknown ? ` ${unknown} ${unknown === 1 ? 'file is' : 'files are'} not an image type this page knows.` : '')
      + (list0.length > MAX_FILES ? ` Showing the first ${MAX_FILES} of ${list0.length} files.` : '')
      + (bad.length ? ' Skipped: ' + bad.slice(0, 3).join('; ') : '');
  };
})();
