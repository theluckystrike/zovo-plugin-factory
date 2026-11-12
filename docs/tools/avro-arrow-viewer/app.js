/* Avro, Arrow and Feather Viewer Online (TOOLCHK, wave18; first draft by HTOOL5, rewritten).
   Arrow IPC (file and stream) and Feather V2 are read with apache-arrow 21.2.0, the version the Avro and Arrow
   extension ships, loaded from cdn.jsdelivr.net with an SRI hash. LZ4 frame buffers are unpacked by the small
   decoder below and ZSTD buffers by fzstd 0.1.1. Avro container files are read by the decoder below (64-bit longs
   kept exact, all logical types), with the null, deflate, snappy and zstandard codecs. The file is read in this tab;
   values are written as text, never as HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const A = self.Arrow, ZSTD = self.fzstd;
  const ROWS = 1000, MAXFILE = 1.5 * 1073741824;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = n => Number(n).toLocaleString('en-US');

  /* ---------------- LZ4 frame and Snappy (small decoders) ---------------- */
  function lz4Block(src, out, op) {
    let ip = 0;
    while (ip < src.length) {
      const tok = src[ip++];
      let lit = tok >> 4;
      if (lit === 15) { let b; do { b = src[ip++]; lit += b; } while (b === 255); }
      out.set(src.subarray(ip, ip + lit), op); ip += lit; op += lit;
      if (ip >= src.length) break;
      const off = src[ip] | (src[ip + 1] << 8); ip += 2;
      let len = tok & 15;
      if (len === 15) { let b; do { b = src[ip++]; len += b; } while (b === 255); }
      len += 4;
      if (!off || off > op) throw new Error('broken LZ4 data');
      for (let i = 0; i < len; i++, op++) out[op] = out[op - off];
    }
    return op;
  }
  function lz4Frame(src) {
    if (src.length < 7 || src[0] !== 0x04 || src[1] !== 0x22 || src[2] !== 0x4d || src[3] !== 0x18) throw new Error('not an LZ4 frame');
    const flg = src[4], bd = src[5], hasSize = flg & 8, blockSum = flg & 16;
    let ip = 7 + (hasSize ? 8 : 0), total = hasSize ? Number(new DataView(src.buffer, src.byteOffset + 6, 8).getBigUint64(0, true)) : 0;
    const maxBlock = [0, 0, 0, 0, 65536, 262144, 1048576, 4194304][(bd >> 4) & 7] || 4194304;
    const parts = []; let size = 0;
    while (ip + 4 <= src.length) {
      const h = new DataView(src.buffer, src.byteOffset + ip, 4).getUint32(0, true); ip += 4;
      if (h === 0) break;
      const n = h & 0x7fffffff, raw = h >>> 31;
      const blk = src.subarray(ip, ip + n); ip += n + (blockSum ? 4 : 0);
      if (raw) { parts.push(blk.slice()); size += n; }
      else { const o = new Uint8Array(maxBlock), m = lz4Block(blk, o, 0); parts.push(o.subarray(0, m)); size += m; }
    }
    const out = new Uint8Array(total || size); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  function snappy(src) {
    let ip = 0, len = 0, shift = 0, b;
    do { b = src[ip++]; len += (b & 127) * 2 ** shift; shift += 7; } while (b & 128);
    const out = new Uint8Array(len); let op = 0;
    while (ip < src.length) {
      const t = src[ip++], k = t & 3;
      if (k === 0) {
        let n = t >> 2;
        if (n >= 60) { const c = n - 59; n = 0; for (let i = 0; i < c; i++) n |= src[ip++] << (8 * i); }
        n += 1; out.set(src.subarray(ip, ip + n), op); ip += n; op += n;
      } else {
        let n, off;
        if (k === 1) { n = ((t >> 2) & 7) + 4; off = ((t >> 5) << 8) | src[ip++]; }
        else if (k === 2) { n = (t >> 2) + 1; off = src[ip] | (src[ip + 1] << 8); ip += 2; }
        else { n = (t >> 2) + 1; off = (src[ip] | (src[ip + 1] << 8) | (src[ip + 2] << 16) | (src[ip + 3] << 24)) >>> 0; ip += 4; }
        if (!off || off > op) throw new Error('broken snappy data');
        for (let i = 0; i < n; i++, op++) out[op] = out[op - off];
      }
    }
    return out;
  }
  const aligned = u8 => (u8.byteOffset % 8 === 0 ? u8 : u8.slice());
  if (A) {
    A.compressionRegistry.set(A.CompressionType.LZ4_FRAME, { decode: b => aligned(lz4Frame(b)) });
    if (ZSTD) A.compressionRegistry.set(A.CompressionType.ZSTD, { decode: b => aligned(ZSTD.decompress(b)) });
  }

  /* ---------------- value text ---------------- */
  const hex = (u8, max = 32) => [...u8.subarray(0, max)].map(b => b.toString(16).padStart(2, '0')).join('') + (u8.length > max ? '...' : '');
  const big = v => (v <= 9007199254740991n && v >= -9007199254740991n ? Number(v) : v.toString());
  const iso = ms => { const d = new Date(Number(ms)); return isNaN(d) ? String(ms) : d.toISOString().replace('.000Z', 'Z'); };
  function plain(v, depth = 0) {
    if (v == null) return v;
    if (typeof v === 'bigint') return big(v);
    if (v instanceof Date) return iso(v.getTime());
    if (v instanceof Uint8Array) return '0x' + hex(v);
    if (depth > 8) return '...';
    if (Array.isArray(v)) return v.slice(0, 200).map(x => plain(x, depth + 1));
    if (typeof v === 'object') {
      if (typeof v.toJSON === 'function' && !(v instanceof Map)) return plain(v.toJSON(), depth + 1);
      if (v instanceof Map) { const o = {}; for (const [k, x] of v) o[k] = plain(x, depth + 1); return o; }
      const o = {}; for (const k of Object.keys(v).slice(0, 200)) o[k] = plain(v[k], depth + 1); return o;
    }
    return v;
  }
  const text = v => { const p = plain(v); return p === null || p === undefined ? null : typeof p === 'object' ? JSON.stringify(p) : String(p); };

  /* ---------------- Arrow and Feather ---------------- */
  function arrowCell(v, type) {
    if (v == null) return null;
    const T = A.Type, id = type.typeId;
    if ((id === T.Timestamp || id === T.Date || id === T.DateMillisecond || id === T.DateDay || id === T.TimestampMillisecond || id === T.TimestampMicrosecond || id === T.TimestampNanosecond || id === T.TimestampSecond) && (typeof v === 'number' || typeof v === 'bigint')) return iso(v);
    if (id === T.Decimal && v && typeof v === 'object' && typeof v.valueOf === 'function') { try { return String(v); } catch (e) { /* fall through */ } }
    return text(v);
  }
  async function arrow(file, kind) {
    if (!A) throw new Error('the Arrow library did not load. Reload the page with a connection once; it is kept for offline use after that.');
    const u8 = new Uint8Array(await file.arrayBuffer());
    const reader = A.RecordBatchReader.from(u8);
    reader.open();
    const schema = reader.schema;
    if (!schema) throw new Error('no Arrow schema was found.');
    const cols = schema.fields.map(f => ({ name: f.name, type: String(f.type), nullable: f.nullable, f, nulls: 0, min: null, max: null, num: /^(Int|Uint|Float|Decimal)/.test(String(f.type)) }));
    const rows = []; let total = 0, batches = 0, codec = '';
    for (const batch of reader) {
      batches++;
      const n = batch.numRows, base = rows.length, take = Math.max(0, Math.min(n, ROWS - base));
      for (let i = 0; i < take; i++) rows.push(new Array(cols.length).fill(null));
      for (let c = 0; c < cols.length; c++) {
        const vec = batch.getChildAt(c), col = cols[c];
        col.nulls += vec.nullCount;
        if (col.num && total < 5e6) for (let i = 0; i < n; i++) { const x = vec.get(i); if (x == null) continue; const v = typeof x === 'bigint' ? Number(x) : +x; if (!isFinite(v)) continue; if (col.min === null || v < col.min) col.min = v; if (col.max === null || v > col.max) col.max = v; }
        for (let i = 0; i < take; i++) rows[base + i][c] = arrowCell(vec.get(i), col.f.type);
      }
      total += n;
    }
    const meta = [...(schema.metadata || new Map())].map(([k, v]) => [k, v.length > 300 ? v.slice(0, 300) + '...' : v]);
    return { format: kind, rows, total, cols, facts: [['Record batches', int(batches)], ['Compression', codec || 'shown per buffer by Arrow; LZ4 and ZSTD are read']], meta };
  }

  /* ---------------- Avro ---------------- */
  class R {
    constructor(u8) { this.b = u8; this.p = 0; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
    need(n) { if (this.p + n > this.b.length) throw new Error('the data ends early'); }
    long() {  // zigzag varint, exact to 64 bits
      let n = 0, s = 0, b, bigN = null;
      do {
        this.need(1); b = this.b[this.p++];
        if (s < 49) n += (b & 127) * 2 ** s; else { if (bigN === null) bigN = BigInt(n); bigN += BigInt(b & 127) << BigInt(s); }
        s += 7; if (s > 70) throw new Error('a number is too long');
      } while (b & 128);
      if (bigN === null) return n % 2 ? -(n + 1) / 2 : n / 2;
      const v = (bigN >> 1n) ^ -(bigN & 1n);
      return big(v);
    }
    bytes() { const n = this.long(); if (n < 0) throw new Error('a negative length'); this.need(n); const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
    str() { return new TextDecoder().decode(this.bytes()); }
  }
  function avroTypes(schema) {
    const named = new Map();
    const walk = (t, ns) => {
      if (Array.isArray(t)) return t.forEach(x => walk(x, ns));
      if (!t || typeof t !== 'object') return;
      if (t.name && /^(record|error|enum|fixed)$/.test(t.type)) {
        const full = t.name.includes('.') ? t.name : (t.namespace || ns ? (t.namespace || ns) + '.' : '') + t.name;
        named.set(full, t); named.set(t.name, t);
        ns = t.name.includes('.') ? t.name.slice(0, t.name.lastIndexOf('.')) : t.namespace || ns;
      }
      if (t.fields) t.fields.forEach(f => walk(f.type, ns));
      if (t.items) walk(t.items, ns);
      if (t.values) walk(t.values, ns);
      if (typeof t.type === 'object') walk(t.type, ns);
    };
    walk(schema, '');
    return named;
  }
  function decimal(u8, scale) {
    let v = 0n; for (const b of u8) v = (v << 8n) | BigInt(b);
    if (u8.length && u8[0] & 128) v -= 1n << BigInt(u8.length * 8);
    const neg = v < 0n, s = (neg ? -v : v).toString().padStart((scale || 0) + 1, '0');
    return (neg ? '-' : '') + (scale ? s.slice(0, -scale) + '.' + s.slice(-scale) : s);
  }
  function read(t, r, named, depth = 0) {
    if (depth > 64) throw new Error('the schema nests too deep');
    if (typeof t === 'string') {
      switch (t) {
        case 'null': return null;
        case 'boolean': r.need(1); return r.b[r.p++] !== 0;
        case 'int': case 'long': return r.long();
        case 'float': { r.need(4); const v = r.dv.getFloat32(r.p, true); r.p += 4; return v; }
        case 'double': { r.need(8); const v = r.dv.getFloat64(r.p, true); r.p += 8; return v; }
        case 'bytes': return r.bytes();
        case 'string': return r.str();
        default: { const n = named.get(t); if (!n) throw new Error('the schema names an unknown type ' + t); return read(n, r, named, depth + 1); }
      }
    }
    if (Array.isArray(t)) { const i = r.long(); if (i < 0 || i >= t.length) throw new Error('a union branch is out of range'); return read(t[i], r, named, depth + 1); }
    const lt = t.logicalType;
    switch (t.type) {
      case 'record': case 'error': { const o = {}; for (const f of t.fields) o[f.name] = read(f.type, r, named, depth + 1); return o; }
      case 'enum': { const i = r.long(); return t.symbols[i] !== undefined ? t.symbols[i] : '#' + i; }
      case 'array': case 'map': {
        const out = t.type === 'array' ? [] : {};
        for (;;) {
          let n = r.long(); if (n === 0) break;
          if (n < 0) { n = -n; r.long(); }
          for (let i = 0; i < n; i++) { if (t.type === 'array') { const v = read(t.items, r, named, depth + 1); if (out.length < 10000) out.push(v); } else { const k = r.str(); out[k] = read(t.values, r, named, depth + 1); } }
        }
        return out;
      }
      case 'fixed': { r.need(t.size); const v = r.b.subarray(r.p, r.p + t.size); r.p += t.size; return lt === 'decimal' ? decimal(v, t.scale) : lt === 'duration' ? v : v; }
      default: {
        const v = read(t.type, r, named, depth + 1);
        if (lt === 'decimal' && v instanceof Uint8Array) return decimal(v, t.scale);
        if (lt === 'date' && typeof v === 'number') return new Date(v * 86400000).toISOString().slice(0, 10);
        if (/^(local-)?timestamp-millis$/.test(lt)) return iso(v) + (lt.startsWith('local') ? ' (local)' : '');
        if (/^(local-)?timestamp-micros$/.test(lt)) return iso(Math.floor(Number(v) / 1000)) + (lt.startsWith('local') ? ' (local)' : '');
        if (/^(local-)?timestamp-nanos$/.test(lt)) return iso(Math.floor(Number(v) / 1e6)) + (lt.startsWith('local') ? ' (local)' : '');
        if (lt === 'time-millis' || lt === 'time-micros') { const ms = lt === 'time-millis' ? v : v / 1000; return new Date(ms).toISOString().slice(11, 23); }
        return v;
      }
    }
  }
  const short = t => typeof t === 'string' ? t : Array.isArray(t) ? (t.length === 2 && t.includes('null') ? short(t.find(x => x !== 'null')) + ' or null' : t.map(short).join(' | ')) :
    t.logicalType ? t.logicalType + (t.logicalType === 'decimal' ? '(' + t.precision + ', ' + (t.scale || 0) + ')' : '') : t.type === 'array' ? 'array<' + short(t.items) + '>' : t.type === 'map' ? 'map<' + short(t.values) + '>' : t.type === 'record' || t.type === 'enum' || t.type === 'fixed' ? t.type + ' ' + t.name : short(t.type);
  async function inflate(raw, codec) {
    if (codec === 'null') return raw;
    if (codec === 'deflate') return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    if (codec === 'snappy') return snappy(raw.subarray(0, raw.length - 4));  // the last 4 bytes are a CRC-32
    if (codec === 'zstandard') { if (!ZSTD) throw new Error('the zstandard decoder did not load'); return ZSTD.decompress(raw); }
    throw new Error('the ' + codec + ' codec is not read on this page (null, deflate, snappy and zstandard are)');
  }
  async function avro(file) {
    const u8 = new Uint8Array(await file.arrayBuffer()), r = new R(u8);
    r.p = 4;
    const meta = {};
    for (;;) {
      let n = r.long(); if (n === 0) break;
      if (n < 0) { n = -n; r.long(); }
      for (let i = 0; i < n; i++) { const k = r.str(); meta[k] = r.bytes(); }
    }
    r.need(16); const sync = u8.subarray(r.p, r.p + 16); r.p += 16;
    let schema;
    try { schema = JSON.parse(new TextDecoder().decode(meta['avro.schema'])); } catch (e) { throw new Error('the header has no readable avro.schema.'); }
    const codec = meta['avro.codec'] ? new TextDecoder().decode(meta['avro.codec']) : 'null', named = avroTypes(schema);
    const root = typeof schema === 'string' && named.get(schema) ? named.get(schema) : schema;
    const rec = root && (root.type === 'record' || root.type === 'error');
    const cols = rec ? root.fields.map(f => ({ name: f.name, type: short(f.type), doc: f.doc || '', nulls: 0, min: null, max: null })) : [{ name: 'value', type: short(root), nulls: 0, min: null, max: null }];
    const rows = []; let total = 0, blocks = 0, note = '';
    while (r.p < u8.length) {
      const count = r.long(), size = r.long();
      if (size < 0 || r.p + size > u8.length) { note = 'The file ends inside a block, so it is cut short.'; break; }
      const raw = u8.subarray(r.p, r.p + size); r.p += size;
      if (r.p + 16 > u8.length || u8.subarray(r.p, r.p + 16).some((b, i) => b !== sync[i])) { note = 'A block is not followed by the sync marker, so the file is damaged after block ' + (blocks + 1) + '.'; total += count; blocks++; break; }
      r.p += 16; blocks++; total += count;
      if (rows.length < ROWS) {
        let data;
        try { data = await inflate(raw, codec); } catch (e) { note = 'Rows cannot be shown: ' + e.message + '.'; continue; }
        const br = new R(data);
        for (let i = 0; i < count && rows.length < ROWS; i++) {
          const v = read(root, br, named);
          rows.push(rec ? cols.map(c => text(v[c.name])) : [text(v)]);
        }
      }
    }
    for (const row of rows) row.forEach((x, c) => { if (x == null) cols[c].nulls++; else if (/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(x)) { const v = +x; if (cols[c].min === null || v < cols[c].min) cols[c].min = v; if (cols[c].max === null || v > cols[c].max) cols[c].max = v; } });
    const other = Object.keys(meta).filter(k => k !== 'avro.schema' && k !== 'avro.codec').map(k => [k, new TextDecoder().decode(meta[k]).slice(0, 300)]);
    return { format: 'Avro object container', rows, total, cols, facts: [['Codec', codec], ['Blocks', int(blocks)], ['Schema', (root && root.name ? (root.namespace ? root.namespace + '.' : '') + root.name : short(root))]], meta: other, schemaJson: JSON.stringify(schema, null, 2), note, rowStats: true };
  }

  /* ---------------- show ---------------- */
  let D = null, sortC = -1, sortD = 1;
  function draw() {
    const idx = D.rows.map((_, i) => i);
    if (sortC >= 0) idx.sort((a, b) => { const x = D.rows[a][sortC], y = D.rows[b][sortC]; if (x == null) return 1; if (y == null) return -1; const nx = +x, ny = +y; return (isFinite(nx) && isFinite(ny) && x !== '' && y !== '' ? nx - ny : x < y ? -1 : x > y ? 1 : 0) * sortD; });
    $('rows').innerHTML = '<thead><tr><th class="ix">#</th>' + D.cols.map((c, i) => `<th data-c="${i}" title="${esc(c.type)}">${esc(c.name)}${sortC === i ? (sortD > 0 ? ' &#9650;' : ' &#9660;') : ''}<small>${esc(c.type)}</small></th>`).join('') + '</tr></thead><tbody>' +
      idx.map(i => '<tr><td class="ix">' + (i + 1) + '</td>' + D.rows[i].map(x => x == null ? '<td class="nul">null</td>' : `<td title="${esc(x.length > 80 ? x.slice(0, 2000) : '')}">${esc(x.length > 200 ? x.slice(0, 200) + '...' : x)}</td>`).join('') + '</tr>').join('') + '</tbody>';
  }
  self.zovoOpen = async file => {
    if (file.size > MAXFILE) throw new Error('it is ' + self.zovoSize(file.size) + '. This page reads the whole file into the tab, up to 1.5 GB. The VS Code extension reads bigger files in parts.');
    const h = new Uint8Array(await file.slice(0, 8).arrayBuffer()), s = String.fromCharCode(...h);
    if (s.startsWith('Obj\x01')) D = await avro(file);
    else if (s.startsWith('ARROW1')) D = await arrow(file, /\.feather$/i.test(file.name) ? 'Feather V2 (Arrow IPC file)' : 'Arrow IPC file');
    else if ((h[0] === 255 && h[1] === 255 && h[2] === 255 && h[3] === 255) || (h[4] === 0 && h[0] > 0 && h[0] < 0x7f && file.size > 8)) D = await arrow(file, 'Arrow IPC stream');
    else if (s.startsWith('FEA1')) throw new Error('it is a Feather V1 file, the old format from before 2020. Save it again with pyarrow (feather.write_feather) to get Feather V2.');
    else if (s.startsWith('PAR1')) throw new Error('it is a Parquet file. Open it in the Parquet viewer of these tools.');
    else throw new Error('it is not an Avro, Arrow or Feather file.');
    sortC = -1;
    $('fmeta').textContent = self.zovoSize(file.size);
    $('ainfo').innerHTML = [['Format', D.format], ['Rows', int(D.total)], ['Columns', int(D.cols.length)]].concat(D.facts).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    $('schema').tBodies[0].innerHTML = D.cols.map(c => `<tr><td class="mono">${esc(c.name)}</td><td class="mono">${esc(c.type)}</td><td class="n">${c.nullable === false ? 'no' : int(c.nulls) + (D.rowStats ? ' in the rows shown' : '')}</td><td class="n">${c.min === null ? '' : esc(+c.min.toPrecision(8))}</td><td class="n">${c.max === null ? '' : esc(+c.max.toPrecision(8))}</td></tr>`).join('');
    $('metaBox').hidden = !D.meta.length;
    $('meta').innerHTML = D.meta.map(([k, v]) => `<tr><th class="mono">${esc(k)}</th><td class="mono">${esc(v)}</td></tr>`).join('');
    $('schemaJson').parentElement.hidden = !D.schemaJson; $('schemaJson').textContent = D.schemaJson || '';
    $('rowsNote').textContent = (D.total > D.rows.length ? 'The first ' + int(D.rows.length) + ' of ' + int(D.total) + ' rows.' : int(D.rows.length) + ' rows.') + ' Click a column title to sort them. ' + (D.note || '');
    draw();
    return 'Opened ' + file.name + ': ' + int(D.total) + ' rows, ' + D.cols.length + ' columns.' + (D.note ? ' ' + D.note : '');
  };
  $('rows').addEventListener('click', e => { const th = e.target.closest('th[data-c]'); if (!th || !D) return; const c = +th.dataset.c; if (sortC === c) sortD = -sortD; else { sortC = c; sortD = 1; } draw(); });
})();
