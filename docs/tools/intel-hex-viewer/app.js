/* Zovo Intel HEX Viewer Online (TOOLCHK2, wave18). Reads an Intel HEX or Motorola S-record firmware image in this
   tab, checks every record (checksum, length, type, end record, count records, overlaps) and shows the memory map,
   a hex view by address and a data inspector. Nothing is sent anywhere (CSP connect-src 'none'). Rewritten from the
   HTOOL8 draft. */
(function () {
  'use strict';
  const { $, el, say, int, plural, table, kv, stats, wire, shown, done } = self.Z;
  const H = (n, w) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(w || 8, '0');
  let img = null, view = null;

  /* parsing */
  function hexBytes(s) { const out = new Uint8Array(s.length >> 1); for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16); return out; }
  function parse(text) {
    const lines = text.split(/\r\n|\r|\n/);
    const first = lines.find(l => l.trim());
    const fmt = !first ? '' : first.trim()[0] === ':' ? 'ihex' : /^S[0-9]/.test(first.trim()) ? 'srec' : '';
    if (!fmt) throw new Error('This is not an Intel HEX or S-record file: the first line should start with ":" (Intel HEX) or "S0" to "S9" (Motorola S-record).');
    const chunks = [], probs = [], types = new Map();
    let upper = 0, segBase = 0, eof = 0, start = null, header = '', dataRecs = 0, records = 0, countRec = null;
    const bad = (ln, sev, t) => { if (probs.length < 2000) probs.push({ line: ln, sev, text: t }); };
    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1, raw = lines[i].trim();
      if (!raw) continue;
      if (eof && !(fmt === 'srec' && /^S[5-9]/.test(raw))) { bad(ln, 'warning', 'Text after the end record is ignored by most programmers.'); eof = -1; }
      if (eof === -1) continue;
      records++;
      if (fmt === 'ihex') {
        if (raw[0] !== ':') { bad(ln, 'error', 'The record does not start with ":".'); continue; }
        const h = raw.slice(1);
        if (!/^[0-9A-Fa-f]*$/.test(h)) { bad(ln, 'error', 'The record has characters that are not hex digits.'); continue; }
        if (h.length % 2 || h.length < 10) { bad(ln, 'error', 'The record is too short or has an odd number of hex digits.'); continue; }
        const b = hexBytes(h), n = b[0];
        if (b.length !== n + 5) { bad(ln, 'error', `The record says ${n} data bytes but has ${b.length - 5}.`); continue; }
        let sum = 0; for (let k = 0; k < b.length - 1; k++) sum += b[k];
        const want = (0x100 - (sum & 0xFF)) & 0xFF;
        if (want !== b[b.length - 1]) bad(ln, 'error', `Checksum ${H(b[b.length - 1], 2)} is wrong; it should be ${H(want, 2)}.`);
        const off = (b[1] << 8) | b[2], type = b[3], data = b.subarray(4, 4 + n);
        types.set(type, (types.get(type) || 0) + 1);
        if (type === 0) { chunks.push({ a: (upper + segBase + off) >>> 0, d: data, line: ln }); dataRecs++; }
        else if (type === 1) eof = ln;
        else if (type === 2) { if (n !== 2) bad(ln, 'error', 'A type 02 record must have 2 data bytes.'); segBase = ((data[0] << 8 | data[1]) << 4) >>> 0; upper = 0; }
        else if (type === 4) { if (n !== 2) bad(ln, 'error', 'A type 04 record must have 2 data bytes.'); upper = ((data[0] << 8 | data[1]) << 16) >>> 0; segBase = 0; }
        else if (type === 3) { if (n === 4) start = { kind: 'CS:IP', v: `${H(data[0] << 8 | data[1], 4)}:${H(data[2] << 8 | data[3], 4)}`, lin: (((data[0] << 8 | data[1]) << 4) + (data[2] << 8 | data[3])) >>> 0 }; }
        else if (type === 5) { if (n === 4) start = { kind: 'EIP', v: H((data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3]) >>> 0), lin: (data[0] << 24 | data[1] << 16 | data[2] << 8 | data[3]) >>> 0 }; }
        else bad(ln, 'error', `Record type ${H(type, 2)} is not an Intel HEX type (00 to 05).`);
      } else {
        if (!/^S[0-9]/.test(raw)) { bad(ln, 'error', 'The record does not start with S0 to S9.'); continue; }
        const t = Number(raw[1]), h = raw.slice(2);
        if (!/^[0-9A-Fa-f]*$/.test(h) || h.length % 2 || h.length < 4) { bad(ln, 'error', 'The record has bad hex digits or an odd length.'); continue; }
        const b = hexBytes(h), n = b[0];
        if (b.length !== n + 1) { bad(ln, 'error', `The record says ${n} bytes but has ${b.length - 1}.`); continue; }
        let sum = 0; for (let k = 0; k < b.length - 1; k++) sum += b[k];
        const want = (~sum) & 0xFF;
        if (want !== b[b.length - 1]) bad(ln, 'error', `Checksum ${H(b[b.length - 1], 2)} is wrong; it should be ${H(want, 2)}.`);
        types.set('S' + t, (types.get('S' + t) || 0) + 1);
        const aw = { 0: 2, 1: 2, 2: 3, 3: 4, 5: 2, 6: 3, 7: 4, 8: 3, 9: 2 }[t];
        if (aw === undefined) { bad(ln, 'error', `S${t} is not a record type.`); continue; }
        if (n < aw + 1) { bad(ln, 'error', 'The record is too short for its address.'); continue; }
        let a = 0; for (let k = 1; k <= aw; k++) a = (a * 256 + b[k]) >>> 0;
        const data = b.subarray(1 + aw, b.length - 1);
        if (t === 0) header = new TextDecoder('latin1').decode(data).replace(/[\x00-\x1f]/g, '');
        else if (t >= 1 && t <= 3) { chunks.push({ a, d: data, line: ln }); dataRecs++; }
        else if (t === 5 || t === 6) { countRec = { line: ln, n: a }; if (a !== dataRecs) bad(ln, 'error', `The count record says ${int(a)} data records, but the file has ${int(dataRecs)} before it.`); }
        else { start = { kind: 'S' + t, v: H(a, t === 7 ? 8 : t === 8 ? 6 : 4), lin: a }; eof = ln; }
      }
    }
    if (!eof) bad(lines.length, 'warning', fmt === 'ihex' ? 'The file has no end record (:00000001FF). It may have been cut short.' : 'The file has no S7, S8 or S9 end record. It may have been cut short.');
    // segments: sort the data records by address and merge the ones that touch
    chunks.sort((x, y) => x.a - y.a || x.line - y.line);
    const segs = [];
    let overlaps = 0;
    for (const c of chunks) {
      if (!c.d.length) continue;
      const s = segs[segs.length - 1];
      if (s && c.a < s.a + s.len) {
        overlaps++;
        const ov = Math.min(s.a + s.len, c.a + c.d.length) - c.a;
        let differ = false; for (let k = 0; k < ov; k++) if (s.parts && byteAt(s, c.a + k) !== c.d[k]) { differ = true; break; }
        if (overlaps <= 50) bad(c.line, differ ? 'error' : 'warning', `Bytes at ${H(c.a)} to ${H(c.a + ov - 1)} were already written by an earlier record${differ ? ' with other values' : ' (same values)'}.`);
        if (c.a + c.d.length > s.a + s.len) { s.parts.push({ a: s.a + s.len, d: c.d.subarray(s.a + s.len - c.a) }); s.len = c.a + c.d.length - s.a; }
      } else if (s && c.a === s.a + s.len) { s.parts.push(c); s.len += c.d.length; }
      else segs.push({ a: c.a, len: c.d.length, parts: [c] });
    }
    for (const s of segs) { const d = new Uint8Array(s.len); for (const p of s.parts) d.set(p.d, p.a - s.a); s.d = d; delete s.parts; }
    return { fmt, segs, probs, types, start, header, records, dataRecs, eof, countRec, bytes: segs.reduce((a, s) => a + s.len, 0) };
  }
  function byteAt(s, addr) { for (const p of s.parts) if (addr >= p.a && addr < p.a + p.d.length) return p.d[addr - p.a]; return -1; }
  function segOf(addr) { let lo = 0, hi = img.segs.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1, s = img.segs[m]; if (addr < s.a) hi = m - 1; else if (addr >= s.a + s.len) lo = m + 1; else return s; } return null; }
  const get = addr => { const s = segOf(addr); return s ? s.d[addr - s.a] : -1; };

  /* view */
  function render() {
    const out = $('out'); out.textContent = '';
    const S = img.segs, lo = S.length ? S[0].a : 0, hi = S.length ? S[S.length - 1].a + S[S.length - 1].len : 0;
    const errs = img.probs.filter(p => p.sev === 'error').length;
    out.append(stats([['Format', img.fmt === 'ihex' ? 'Intel HEX' : 'Motorola S-record'], ['Data', `${int(img.bytes)} bytes`], ['Segments', int(S.length)], ['Problems', img.probs.length ? int(img.probs.length) : 'none', errs ? 'bad' : ''],
      ['Lowest address', S.length ? H(lo) : '-'], ['Highest address', S.length ? H(hi - 1) : '-'], ['Start address', img.start ? `${img.start.v} (${img.start.kind})` : 'none'], ['Records', int(img.records)]]));
    if (img.header) out.append(el('p', `S0 header: ${img.header}`, 'small mut'));
    // memory map: segments and gaps, each gap drawn at most as wide as the widest segment
    out.append(el('h3', 'Memory map'));
    if (S.length) {
      const bar = el('div', null, 'memmap', { role: 'img', 'aria-label': `Memory map from ${H(lo)} to ${H(hi - 1)}: ${S.length} segments` });
      const maxSeg = Math.max(...S.map(s => s.len));
      const parts = []; S.forEach((s, i) => { if (i) parts.push({ g: true, len: Math.min(s.a - (S[i - 1].a + S[i - 1].len), maxSeg), real: s.a - (S[i - 1].a + S[i - 1].len) }); parts.push({ s, len: s.len }); });
      const tot = parts.reduce((a, p) => a + p.len, 0);
      for (const p of parts) {
        const sp = el('span', null, p.g ? 'g' : 'd', { title: p.g ? `gap of ${int(p.real)} bytes` : `${H(p.s.a)} to ${H(p.s.a + p.s.len - 1)}, ${int(p.s.len)} bytes` });
        sp.style.flexGrow = String(p.len / tot); sp.style.flexBasis = '0';
        if (!p.g) sp.addEventListener('click', () => goto(p.s.a));
        bar.append(sp);
      }
      out.append(bar, el('p', 'Blue is data, blank is a gap (long gaps are drawn shorter). Click a block to see it below.', 'small mut'));
      const rows = S.map((s, i) => [H(s.a), H(s.a + s.len - 1), int(s.len), i ? int(s.a - (S[i - 1].a + S[i - 1].len)) : '']);
      out.append(el('div', null, 'tblwrap short', null, [table(['Start', 'End', 'Bytes', 'Gap before'], rows, { pick: i => goto(S[i].a) })]));
    } else out.append(el('p', 'The file has no data records.', 'warn'));
    // problems
    out.append(el('h3', 'Checks'));
    if (img.probs.length) {
      const ul = el('ul', null, 'problems small');
      for (const p of img.probs.slice(0, 300)) ul.append(el('li', null, null, null, [el('span', p.sev === 'error' ? 'Error' : 'Warning', 'sev ' + (p.sev === 'error' ? 'warn' : 'mut')), document.createTextNode(` line ${int(p.line)}: ${p.text}`)]));
      if (img.probs.length > 300) ul.append(el('li', `and ${int(img.probs.length - 300)} more`, 'mut'));
      out.append(ul);
    } else out.append(el('p', `All ${plural(img.records, 'record')} have good checksums and lengths, the end record is there, and no bytes are written twice.`, 'small ok'));
    out.append(el('p', 'Record types: ' + [...img.types].map(([k, v]) => `${typeof k === 'number' ? H(k, 2).slice(2) : k} × ${int(v)}`).join(', '), 'small mut'));
    // hex view and inspector
    const go = el('input', null, 'mono', { type: 'text', placeholder: '0x08000000', 'aria-label': 'Go to address', size: 14, autocomplete: 'off', spellcheck: 'false' });
    const gf = el('form', null, 'tcbar', null, [el('label', 'Go to address'), go, el('button', 'Go', null, { type: 'submit' }), el('button', 'Previous', null, { type: 'button', id: 'prevb' }), el('button', 'Next', null, { type: 'button', id: 'nextb' })]);
    const dump = el('div', null, 'hexdump', { tabindex: 0, 'aria-label': 'Hex view by address' }), insp = el('div', null, 'det');
    out.append(el('h3', 'Hex view'), gf, el('div', null, 'tcgrid wide', null, [dump, insp]));
    view = { dump, insp, base: lo, go };
    gf.addEventListener('submit', e => { e.preventDefault(); const v = go.value.trim().replace(/_/g, ''); const n = /^0x/i.test(v) ? parseInt(v, 16) : /^[0-9a-f]+h$/i.test(v) ? parseInt(v, 16) : /[a-f]/i.test(v) ? parseInt(v, 16) : parseInt(v, 10); if (isFinite(n)) goto(n); });
    gf.querySelector('#prevb').addEventListener('click', () => goto(view.base - 4096));
    gf.querySelector('#nextb').addEventListener('click', () => { const s = img.segs.find(x => x.a + x.len > view.base + 4096); goto(s ? Math.max(view.base + 4096, s.a) : view.base); });
    goto(lo);
  }
  function goto(addr) {
    addr = Math.max(0, Math.floor(addr / 16) * 16);
    if (!segOf(addr)) { const s = img.segs.find(x => x.a + x.len > addr); if (s && s.a > addr) addr = Math.floor(s.a / 16) * 16; }
    view.base = addr;
    const LINES = 256;
    const frag = document.createDocumentFragment();
    let a = addr, n = 0;
    while (n < LINES) {
      const row = el('div');
      row.append(el('span', a.toString(16).toUpperCase().padStart(8, '0') + '  ', 'ad'));
      let asc = '';
      for (let k = 0; k < 16; k++) {
        const v = get(a + k);
        if (v < 0) { row.append(el('span', '-- ', 'gap')); asc += ' '; }
        else { const b = el('span', v.toString(16).toUpperCase().padStart(2, '0'), 'b', { 'data-a': a + k }); row.append(b, document.createTextNode(k === 7 ? '  ' : ' ')); asc += v >= 32 && v < 127 ? String.fromCharCode(v) : '.'; }
      }
      row.append(document.createTextNode(' ' + asc));
      frag.append(row); n++; a += 16;
      if (a > 0xFFFFFFFF) break;
      // jump over long gaps
      if (!segOf(a) && !segOf(a + 15)) { const s = img.segs.find(x => x.a > a); if (!s) break; if (s.a - a > 64) { frag.append(el('div', `... gap of ${int(s.a - a)} bytes ...`, 'gap')); a = Math.floor(s.a / 16) * 16; } }
    }
    view.dump.textContent = ''; view.dump.append(frag); view.dump.scrollTop = 0;
    view.go.value = H(addr);
    inspect(segOf(addr) ? addr : (img.segs.find(x => x.a >= addr) || {}).a);
  }
  function inspect(a) {
    const box = view.insp; box.textContent = '';
    if (a == null || get(a) < 0) { box.append(el('p', 'Click a byte to see its value as numbers.', 'small mut')); return; }
    view.dump.querySelectorAll('.b.on').forEach(x => x.classList.remove('on'));
    const cell = view.dump.querySelector(`[data-a="${a}"]`); if (cell) cell.classList.add('on');
    const bytes = []; for (let k = 0; k < 8; k++) { const v = get(a + k); if (v < 0) break; bytes.push(v); }
    const dv = new DataView(new Uint8Array(8).buffer); bytes.forEach((v, k) => dv.setUint8(k, v));
    const n = bytes.length, row = (name, need, f) => [name, n >= need ? f() : ''];
    box.append(el('h3', `At ${H(a)}`, 'mono'));
    box.append(kv([row('uint8', 1, () => dv.getUint8(0)), row('int8', 1, () => dv.getInt8(0)), row('uint16 LE', 2, () => dv.getUint16(0, true)), row('uint16 BE', 2, () => dv.getUint16(0)),
      row('uint32 LE', 4, () => dv.getUint32(0, true) + ' (' + H(dv.getUint32(0, true)) + ')'), row('uint32 BE', 4, () => dv.getUint32(0) + ' (' + H(dv.getUint32(0)) + ')'),
      row('int32 LE', 4, () => dv.getInt32(0, true)), row('float32 LE', 4, () => +dv.getFloat32(0, true).toPrecision(8)), row('uint64 LE', 8, () => dv.getBigUint64(0, true).toString()),
      row('ASCII', 1, () => bytes.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''))]));
  }

  wire(async (text, info) => {
    if (text.indexOf('\0') !== -1) throw new Error('This is a binary file. Intel HEX and S-record files are text; open the .hex, .s19 or .srec file that your build writes.');
    img = parse(text);
    shown(info, `${img.fmt === 'ihex' ? 'Intel HEX' : 'S-record'}, ${int(img.bytes)} data bytes in ${plural(img.segs.length, 'segment')}, ${self.Z.size(info.size)}`);
    render();
    view.dump.addEventListener('click', e => { const t = e.target.closest('.b'); if (t) inspect(Number(t.dataset.a)); });
    done(info, img.probs.length ? `The checks found ${plural(img.probs.length, 'problem')}.` : '');
  }, { maxBytes: 200 * 1048576 });
  self.zovoTest = () => img && { fmt: img.fmt, bytes: img.bytes, segs: img.segs.map(s => H(s.a) + '+' + s.len), start: img.start && img.start.v, probs: img.probs.slice(0, 10).map(p => p.line + ': ' + p.text),
    firstDump: view && view.dump.innerText.split('\n').slice(0, 3), insp: view && view.insp.innerText.slice(0, 300) };
  self.zovoReady = true;
})();
