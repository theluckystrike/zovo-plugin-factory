/* JAR Viewer and Class File Viewer Online (TOOLCHK, wave18; first draft by HTOOL3, rewritten). No library, no request.
   The archive is read in pieces with File.slice: the end record, the central directory, then one entry when you click
   it (inflated with the browser's DecompressionStream). Class files go through the JAR Viewer extension's own reader
   (classfile.js, a javap -c -p style listing in JavaScript). Nothing in the archive is run, and every name and value
   is written as text, never as HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const CF = self.ZovoClassFile;
  const MAXENTRY = 64 * 1048576, MAXCLASS = 16 * 1048576, MAXLIST = 200000, VERSCAN = 5000;
  let Z = null, stack = [], cur = null, tab = 'listing';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const size = n => self.zovoSize(n);
  const rd = async (blob, off, len) => new DataView(await blob.slice(off, off + len).arrayBuffer());
  const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
  const name437 = u8 => { let s = ''; for (const b of u8) s += b < 128 ? String.fromCharCode(b) : CP437[b - 128]; return s; };

  /* ---------------- ZIP ---------------- */
  async function readZip(blob) {
    const tailLen = Math.min(blob.size, 65557), tail = new Uint8Array(await blob.slice(blob.size - tailLen).arrayBuffer());
    const dv = new DataView(tail.buffer);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) {
      const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
      if (head[0] === 0xca && head[1] === 0xfe && head[2] === 0xba && head[3] === 0xbe) return { single: true };
      if (head[0] === 0x52 && head[1] === 0x61 && head[2] === 0x72) throw new Error('it is a RAR archive. This page reads ZIP, JAR, WAR, EAR and AAR files.');
      if (head[0] === 0x37 && head[1] === 0x7a) throw new Error('it is a 7z archive. This page reads ZIP, JAR, WAR, EAR and AAR files.');
      throw new Error('it is not a ZIP or JAR archive (no end of central directory record) and not a class file.');
    }
    let n = dv.getUint16(e + 10, true), cdSize = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
    const base = blob.size - tailLen;
    if ((n === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) && e >= 20 && dv.getUint32(e - 20, true) === 0x07064b50) {  // ZIP64
      const z64 = Number(dv.getBigUint64(e - 20 + 8, true)), r = await rd(blob, z64, 56);
      if (r.getUint32(0, true) === 0x06064b50) { n = Number(r.getBigUint64(32, true)); cdSize = Number(r.getBigUint64(40, true)); cdOff = Number(r.getBigUint64(48, true)); }
    }
    // a prefix (a self-running JAR or an installer stub) shifts every offset by the same amount
    const shift = Math.max(0, base + e - cdSize - cdOff);
    if (cdSize > 256 * 1048576) throw new Error('its central directory is ' + size(cdSize) + ', more than this page reads.');
    const cd = new Uint8Array(await blob.slice(cdOff + shift, cdOff + shift + cdSize).arrayBuffer()), c = new DataView(cd.buffer);
    const out = [];
    let p = 0;
    while (p + 46 <= cd.length && out.length < MAXLIST) {
      if (c.getUint32(p, true) !== 0x02014b50) break;
      const flags = c.getUint16(p + 8, true), method = c.getUint16(p + 10, true), time = c.getUint16(p + 12, true), date = c.getUint16(p + 14, true);
      let csize = c.getUint32(p + 20, true), usize = c.getUint32(p + 24, true), off = c.getUint32(p + 42, true);
      const nl = c.getUint16(p + 28, true), xl = c.getUint16(p + 30, true), cl = c.getUint16(p + 32, true);
      const raw = cd.subarray(p + 46, p + 46 + nl);
      const name = flags & 0x800 ? new TextDecoder().decode(raw) : /[\x80-\xff]/.test(String.fromCharCode(...raw.slice(0, 200))) ? name437(raw) : new TextDecoder().decode(raw);
      for (let x = p + 46 + nl; x + 4 <= p + 46 + nl + xl;) {  // ZIP64 extra field
        const id = c.getUint16(x, true), sz = c.getUint16(x + 2, true);
        if (id === 1) { let q = x + 4; if (usize === 0xffffffff) { usize = Number(c.getBigUint64(q, true)); q += 8; } if (csize === 0xffffffff) { csize = Number(c.getBigUint64(q, true)); q += 8; } if (off === 0xffffffff) off = Number(c.getBigUint64(q, true)); }
        x += 4 + sz;
      }
      const bad = /(^|\/)\.\.(\/|$)|^\/|^[A-Za-z]:|[\x00-\x1f]/.test(name);
      out.push({ i: out.length, name, flags, method, time, date, csize, usize, off: off + shift, dir: name.endsWith('/'), bad, enc: !!(flags & 1) });
      p += 46 + nl + xl + cl;
    }
    if (!out.length && n) throw new Error('the central directory could not be read.');
    return { entries: out, declared: n };
  }
  async function entryBytes(blob, en, max = MAXENTRY) {
    if (en.enc) throw new Error('this entry is encrypted.');
    if (en.usize > max) throw new Error('it unpacks to ' + size(en.usize) + ', more than this page opens (' + size(max) + ').');
    if (en.method === 8 && en.csize > 0 && en.usize / en.csize > 1000) throw new Error('it claims ' + Math.round(en.usize / en.csize) + ' times its packed size, which looks like a zip bomb.');
    const lh = await rd(blob, en.off, 30);
    if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('its local header is missing.');
    const start = en.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), raw = blob.slice(start, start + en.csize);
    if (en.method === 0) return new Uint8Array(await raw.arrayBuffer());
    if (en.method !== 8) throw new Error('it uses compression method ' + en.method + ', which this page does not unpack.');
    const rdr = raw.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parts = [];
    let got = 0;
    for (;;) {
      let r;
      try { r = await rdr.read(); } catch (e) { if (got) break; throw new Error('its deflate data is broken.'); }
      if (r.done) break;
      got += r.value.length;
      if (got > Math.max(en.usize, 1) + 1024 || got > max) { rdr.cancel().catch(() => {}); throw new Error('it unpacks to more than its header says, so it was stopped.'); }
      parts.push(r.value);
    }
    const u8 = new Uint8Array(got); let o = 0; for (const x of parts) { u8.set(x, o); o += x.length; }
    return u8;
  }
  async function entryHead(blob, en, n) {  // the first n bytes of an entry, without unpacking all of it
    if (en.enc || en.dir) return null;
    const lh = await rd(blob, en.off, 30);
    if (lh.getUint32(0, true) !== 0x04034b50) return null;
    const start = en.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), raw = blob.slice(start, start + Math.min(en.csize, en.method === 0 ? n : 4096));
    if (en.method === 0) return new Uint8Array(await raw.arrayBuffer());
    if (en.method !== 8) return null;
    try { const r = await raw.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader().read(); return r.value || null; } catch (e) { return null; }
  }

  /* ---------------- views ---------------- */
  const dos = (t, d) => d ? `${1980 + (d >> 9)}-${String((d >> 5) & 15).padStart(2, '0')}-${String(d & 31).padStart(2, '0')} ${String(t >> 11).padStart(2, '0')}:${String((t >> 5) & 63).padStart(2, '0')}` : '';
  const kv = rows => rows.filter(r => r[1] !== '' && r[1] != null).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  function manifest(text) { const out = {}; text.replace(/\r?\n /g, '').split(/\r?\n/).forEach(l => { const i = l.indexOf(':'); if (i > 0 && !out[l.slice(0, i)]) out[l.slice(0, i)] = l.slice(i + 1).trim(); }); return out; }

  async function overview(blob, label) {
    const E = Z.entries, classes = E.filter(e => /\.class$/i.test(e.name) && !e.dir), pk = new Set();
    for (const c of classes) pk.add(c.name.includes('/') ? c.name.slice(0, c.name.lastIndexOf('/')) : '(default package)');
    const mfE = E.find(e => /^META-INF\/MANIFEST\.MF$/i.test(e.name));
    let mf = {};
    if (mfE) try { mf = manifest(new TextDecoder().decode(await entryBytes(blob, mfE, 4 * 1048576))); } catch (e) { /* listed below */ }
    const signed = E.some(e => /^META-INF\/[^/]+\.(SF|RSA|DSA|EC)$/i.test(e.name)), nested = E.filter(e => /\.(jar|war|aar|zip)$/i.test(e.name) && !e.dir);
    const fmt = /\.war$/i.test(label) || E.some(e => e.name.startsWith('WEB-INF/')) ? 'WAR (web application)' : E.some(e => e.name.startsWith('BOOT-INF/')) ? 'Spring Boot JAR' : /\.ear$/i.test(label) ? 'EAR' : /\.aar$/i.test(label) || E.some(e => e.name === 'AndroidManifest.xml' && E.some(x => x.name === 'classes.jar')) ? 'Android library (AAR)' : mfE || classes.length ? 'JAR' : 'ZIP';
    $('ovinfo').innerHTML = kv([['Format', fmt], ['Size', size(blob.size)], ['Entries', E.length.toLocaleString('en-US') + (Z.declared > E.length ? ' of ' + Z.declared.toLocaleString('en-US') + ' (the list stops at ' + MAXLIST.toLocaleString('en-US') + ')' : '')],
      ['Classes', classes.length.toLocaleString('en-US')], ['Packages', pk.size.toLocaleString('en-US')], ['Main-Class', mf['Main-Class']], ['Start-Class', mf['Start-Class']], ['Created-By', mf['Created-By']],
      ['Build-Jdk', mf['Build-Jdk-Spec'] || mf['Build-Jdk']], ['Module name', mf['Automatic-Module-Name']], ['Multi-Release', mf['Multi-Release']], ['Implementation', [mf['Implementation-Title'], mf['Implementation-Version']].filter(Boolean).join(' ')],
      ['Signed', signed ? 'yes (META-INF holds a signature file)' : 'no'], ['Nested archives', nested.length ? nested.length + ' (click one to open it)' : ''], ['Unsafe names', E.filter(e => e.bad).length ? E.filter(e => e.bad).length + ' entries with .. or absolute paths, marked in the list' : ''], ['Encrypted entries', E.filter(e => e.enc).length || '']]);
    // Java versions of the classes, from the first 8 bytes of each
    const vers = new Map(), scan = classes.slice(0, VERSCAN);
    $('vers').textContent = scan.length ? 'Reading the Java version of ' + scan.length.toLocaleString('en-US') + ' classes...' : 'No class files.';
    for (let i = 0; i < scan.length; i += 64) {
      const heads = await Promise.all(scan.slice(i, i + 64).map(c => entryHead(blob, c, 8)));
      for (const h of heads) if (h && h.length >= 8 && h[0] === 0xca && h[1] === 0xfe) { const mj = (h[6] << 8) | h[7], mn = (h[4] << 8) | h[5]; const k = CF.javaVersion(mj, mn) + ' (class file ' + mj + ')'; vers.set(k, (vers.get(k) || 0) + 1); }
    }
    if (scan.length) {
      const rows = [...vers].sort((a, b) => b[1] - a[1]), max = rows.length ? rows[0][1] : 1;
      $('vers').innerHTML = '<table class="dtab"><tbody>' + rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.toLocaleString('en-US')}</td><td><span class="vbar"></span></td></tr>`).join('') + '</tbody></table>' + (classes.length > VERSCAN ? `<p class="small mut">The first ${VERSCAN.toLocaleString('en-US')} classes were read.</p>` : '');
      $('vers').querySelectorAll('.vbar').forEach((b, i) => { b.style.width = Math.max(2, rows[i][1] / max * 160) + 'px'; });
    }
  }

  function list() {
    const q = $('filter').value.trim().toLowerCase(), E = Z.entries;
    const shown = (q ? E.filter(e => e.name.toLowerCase().includes(q)) : E).slice(0, 5000);
    $('ents').tBodies[0].innerHTML = shown.map(e => {
      const i = e.i, inner = /\$[^/]*\.class$/i.test(e.name);
      return `<tr data-i="${i}" class="${e.dir ? 'dir' : ''}${inner ? ' inner' : ''}${e.bad ? ' badn' : ''}"><td class="mono" title="${esc(e.name)}">${esc(e.name)}${e.bad ? ' (unsafe name)' : ''}${e.enc ? ' (encrypted)' : ''}</td><td class="n">${e.dir ? '' : esc(size(e.usize))}</td><td class="n">${e.dir ? '' : esc(size(e.csize))}</td><td>${esc(dos(e.time, e.date))}</td></tr>`;
    }).join('');
    $('count').textContent = (q ? shown.length + ' match' + (shown.length === 1 ? '' : 'es') + ', ' : '') + E.length.toLocaleString('en-US') + ' entries' + (shown.length >= 5000 ? ', the first 5,000 shown, type to narrow' : '');
  }

  const hex = (u8, max = 4096) => { const L = []; for (let i = 0; i < Math.min(u8.length, max); i += 16) { const r = u8.subarray(i, Math.min(i + 16, u8.length)); L.push(i.toString(16).padStart(8, '0') + '  ' + [...r].map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(48) + '  ' + [...r].map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')); } return L.join('\n') + (u8.length > max ? '\n... the first ' + max + ' of ' + u8.length.toLocaleString('en-US') + ' bytes' : ''); };
  const TEXT = /\.(mf|sf|txt|md|xml|ya?ml|json|properties|html?|css|js|java|kt|kts|groovy|gradle|scala|sql|ini|cfg|conf|toml|csv|tsv|sh|bat|cmd|py|rb|pro|idx|list|version|factories|imports|vm|ftl|jsp|tld|xsd|dtd|wsdl|xsl|policy|providers?)$/i;

  async function showEntry(i) {
    const en = Z.entries[i];
    cur = { en, model: null };
    $('ename').textContent = en.name;
    document.querySelectorAll('#ents tr.on').forEach(x => x.classList.remove('on'));
    const tr = document.querySelector(`#ents tr[data-i="${i}"]`); if (tr) tr.classList.add('on');
    $('etabs').hidden = true; $('openNested').hidden = true; $('epre').textContent = ''; $('einfo').innerHTML = ''; $('eimg').hidden = true;
    $('einfo').innerHTML = kv([['Size', size(en.usize)], ['Packed', size(en.csize) + (en.method === 8 ? ', deflate' : en.method === 0 ? ', stored' : ', method ' + en.method)], ['Modified', dos(en.time, en.date)]]);
    if (en.dir) { $('epre').textContent = 'A folder.'; return; }
    let u8;
    try { u8 = await entryBytes(Z.blob, en, /\.class$/i.test(en.name) ? MAXCLASS : MAXENTRY); }
    catch (e) { $('epre').textContent = 'This entry cannot be shown: ' + e.message; return; }
    if (u8.length >= 4 && u8[0] === 0xca && u8[1] === 0xfe && u8[2] === 0xba && u8[3] === 0xbe) return showClass(u8);
    if (/\.(jar|war|aar|zip)$/i.test(en.name) && u8[0] === 0x50 && u8[1] === 0x4b) { $('openNested').hidden = false; $('openNested').onclick = () => openBlob(new Blob([u8]), en.name, true); $('epre').textContent = 'A nested archive of ' + size(u8.length) + '. Open it to see its entries.'; return; }
    if (/\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(en.name)) {
      const type = { svg: 'image/svg+xml', ico: 'image/x-icon' }[en.name.split('.').pop().toLowerCase()] || 'image/' + en.name.split('.').pop().toLowerCase().replace('jpg', 'jpeg');
      const url = URL.createObjectURL(new Blob([u8], { type })); $('eimg').src = url; $('eimg').hidden = false; $('eimg').onload = () => URL.revokeObjectURL(url);  // an SVG in an <img> runs no script
      return;
    }
    const looksText = TEXT.test(en.name) || /(^|\/)(LICENSE|NOTICE|README|CHANGES|services\/[^/]+)$/i.test(en.name) || !u8.subarray(0, 4096).some(b => b === 0);
    $('epre').textContent = looksText ? new TextDecoder().decode(u8.subarray(0, 2 * 1048576)) + (u8.length > 2 * 1048576 ? '\n... the first 2 MB' : '') : hex(u8);
  }

  function showClass(u8) {
    let m;
    try { m = CF.parseClass(u8, { maxMs: 6000 }); } catch (e) { $('epre').textContent = 'This class file cannot be read: ' + e.message; return; }
    cur.model = m;
    $('etabs').hidden = false;
    $('einfo').innerHTML += kv([['Class', m.name], ['Java version', m.java + ', class file ' + m.major + '.' + m.minor], ['Source file', m.sourceFile]]);
    renderTab();
  }
  function renderTab() {
    const m = cur && cur.model; if (!m) return;
    document.querySelectorAll('#etabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === tab)));
    if (tab === 'listing') $('epre').textContent = m.listing.join('\n') + (m.listingComplete ? '' : '\n(the listing was cut short)');
    else if (tab === 'members') $('epre').textContent = ['// fields'].concat(m.fields.map(f => f.decl + ';    // ' + f.descriptor), ['', '// methods'], m.methods.map(x => x.decl + ';    // ' + x.descriptor + (x.code ? ', ' + x.code.length + ' bytes of code' : ''))).join('\n');
    else if (tab === 'pool') $('epre').textContent = m.pool.map(([i, t, r, v]) => ('#' + i).padStart(6) + ' = ' + String(t).padEnd(18) + String(r).padEnd(14) + ' ' + String(v).slice(0, 300)).join('\n');
    else $('epre').textContent = [m.decl, 'flags: ' + m.access + ' (' + m.flags + ')', 'extends ' + (m.superName || 'nothing'), m.interfaces.length ? 'implements ' + m.interfaces.join(', ') : '', m.signature ? 'signature: ' + m.signature : '', m.nestHost ? 'nest host: ' + JSON.stringify(m.nestHost) : '',
      m.innerClasses.length ? 'inner classes:\n  ' + m.innerClasses.slice(0, 200).map(x => typeof x === 'string' ? x : (x.flags ? x.flags + ' ' : '') + x.inner + (x.outer ? ' of ' + x.outer : '')).join('\n  ') : '',
      'attributes:\n  ' + m.attributes.map(a => a.name + ' (' + a.length + ' bytes)' + (a.value ? ': ' + String(a.value).slice(0, 200) : '')).join('\n  '), m.warnings.length ? 'warnings:\n  ' + m.warnings.join('\n  ') : ''].filter(Boolean).join('\n');
  }

  async function openBlob(blob, label, nested) {
    const z = await readZip(blob);
    if (z.single) {  // a lone .class file
      Z = { blob, entries: [{ name: label, usize: blob.size, csize: blob.size, method: 0, off: 0, single: true }], declared: 1 };
      $('ovBox').hidden = true; $('listBox').hidden = true;
      cur = { en: Z.entries[0] };
      $('ename').textContent = label; $('einfo').innerHTML = kv([['Size', size(blob.size)]]); $('openNested').hidden = true; $('eimg').hidden = true;
      showClass(new Uint8Array(await blob.arrayBuffer()));
      return 'Opened ' + label + ', a single class file.';
    }
    if (nested) stack.push(Z); else stack = [];
    Z = { blob, entries: z.entries, declared: z.declared, label };
    $('ovBox').hidden = false; $('listBox').hidden = false;
    $('back').hidden = !stack.length; $('where').textContent = stack.length ? 'Inside ' + label : '';
    $('filter').value = ''; cur = null;
    $('ename').textContent = 'Click an entry to see it'; $('einfo').innerHTML = ''; $('epre').textContent = ''; $('etabs').hidden = true; $('openNested').hidden = true; $('eimg').hidden = true;
    list();
    await overview(blob, label);
    const mf = z.entries.findIndex(e => /^META-INF\/MANIFEST\.MF$/i.test(e.name));
    if (mf >= 0) await showEntry(mf);
    return 'Opened ' + label + ': ' + z.entries.length.toLocaleString('en-US') + ' entries.';
  }

  self.zovoOpen = async file => {
    $('fmeta').textContent = size(file.size);
    return openBlob(file, file.name, false);
  };
  $('filter').addEventListener('input', () => Z && list());
  $('ents').tBodies[0].addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) showEntry(+tr.dataset.i); });
  $('etabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) { tab = b.dataset.t; renderTab(); } });
  $('back').addEventListener('click', async () => { const prev = stack.pop(); if (!prev) return; Z = prev; $('back').hidden = !stack.length; $('where').textContent = stack.length ? 'Inside ' + Z.label : ''; list(); await overview(Z.blob, Z.label); });
})();
