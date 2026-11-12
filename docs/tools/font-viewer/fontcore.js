/* Font reader for the Font Viewer page (TOOLCHK, wave18). Built by sprint/tools/bundle_font.py from the Font Viewer
   extension (src/core, MIT, Zovo). It reads bytes only: nothing here makes a request or runs code from a font. */
'use strict';
(() => {
class Buffer extends Uint8Array {
  static alloc(n) { return new Buffer(n); }
  static from(x) { if (x instanceof ArrayBuffer) return new Buffer(x); if (ArrayBuffer.isView(x)) { const b = new Buffer(x.byteLength); b.set(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)); return b; } return new Buffer(x); }
  static isBuffer(x) { return x instanceof Buffer; }
  static concat(list) { const n = list.reduce((a, x) => a + x.length, 0), out = new Buffer(n); let o = 0; for (const x of list) { out.set(x, o); o += x.length; } return out; }
  write(str, off = 0, len = str.length) { const n = Math.min(len, str.length, this.length - off); for (let i = 0; i < n; i++) this[off + i] = str.charCodeAt(i) & 255; return n; }
  _dv() { return new DataView(this.buffer, this.byteOffset, this.byteLength); }
  readUInt8(o) { return this[o]; } readInt8(o) { return this._dv().getInt8(o); }
  readUInt16BE(o) { return this._dv().getUint16(o); } readInt16BE(o) { return this._dv().getInt16(o); }
  readUInt32BE(o) { return this._dv().getUint32(o); } readInt32BE(o) { return this._dv().getInt32(o); }
  writeUInt8(v, o) { this[o] = v; return o + 1; } writeUInt16BE(v, o) { this._dv().setUint16(o, v); return o + 2; } writeInt16BE(v, o) { this._dv().setInt16(o, v); return o + 2; }
  writeUInt32BE(v, o) { this._dv().setUint32(o, v >>> 0); return o + 4; }
  copy(t, ts = 0, ss = 0, se = this.length) { const s = this.subarray(ss, se); t.set(s, ts); return s.length; }
  toString(enc, s = 0, e = this.length) { const b = this.subarray(s, e); return enc === 'latin1' || enc === 'binary' || enc === 'ascii' ? Array.from(b, c => String.fromCharCode(c)).join('') : enc === 'hex' ? Array.from(b, c => c.toString(16).padStart(2, '0')).join('') : new TextDecoder().decode(b); }
}
const zlibProxy = { brotliDecompressSync: (b, o) => Buffer.from(self.ZovoInflate.brotli(b, o && o.maxOutputLength)), inflateSync: b => Buffer.from(self.ZovoInflate.zlib(b)) };
const otProxy = { parse: (...a) => self.ZovoOpentype.parse(...a) };
const M = {};
const require = n => n === 'zlib' ? zlibProxy : n === 'opentype.js' ? otProxy : M[n.replace(/^\.\//, '')];
M["sfnt"] = (() => { const module = { exports: {} }, exports = module.exports;

// Font containers: detect the format, read the table directory, split a TTC, unpack WOFF,
// and write a plain sfnt (TrueType/OpenType) file from a list of tables.
const zlib = require('zlib');

class FontError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code || 'bad-font';
  }
}

const SIG = {
  0x00010000: 'ttf',
  0x74727565: 'ttf', // 'true' (old Apple TrueType)
  0x4f54544f: 'otf', // 'OTTO' (CFF outlines)
  0x774f4646: 'woff', // 'wOFF'
  0x774f4632: 'woff2', // 'wOF2'
  0x74746366: 'ttc', // 'ttcf'
};

/** Returns 'ttf' | 'otf' | 'woff' | 'woff2' | 'ttc' | null from the first 4 bytes. */
function detect(buf) {
  if (!buf || buf.length < 12) return null;
  return SIG[buf.readUInt32BE(0)] || null;
}

function tagAt(buf, off) {
  return buf.toString('latin1', off, off + 4);
}

/** Reads an sfnt table directory at `off`. Returns { flavor, tables: Map(tag -> {offset, length, checksum}) }. */
function readDirectory(buf, off = 0) {
  if (off + 12 > buf.length) throw new FontError('The file ends inside the font header.', 'truncated');
  const flavor = buf.readUInt32BE(off);
  const numTables = buf.readUInt16BE(off + 4);
  if (numTables === 0 || numTables > 1000) throw new FontError(`The font header lists ${numTables} tables, which is not valid.`);
  if (off + 12 + numTables * 16 > buf.length) throw new FontError('The file ends inside the table directory.', 'truncated');
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const r = off + 12 + i * 16;
    const tag = tagAt(buf, r);
    const offset = buf.readUInt32BE(r + 8);
    const length = buf.readUInt32BE(r + 12);
    if (offset + length > buf.length) throw new FontError(`Table '${tag.trim()}' points past the end of the file. The file may be cut off.`, 'truncated');
    tables.set(tag, { offset, length, checksum: buf.readUInt32BE(r + 4) });
  }
  return { flavor, tables };
}

/** Table data (a Buffer view) from a directory entry. */
function tableData(buf, dir, tag) {
  const t = dir.tables.get(tag);
  return t ? buf.subarray(t.offset, t.offset + t.length) : null;
}

function checksum(data) {
  let sum = 0;
  const n = data.length;
  for (let i = 0; i < n; i += 4) {
    const b0 = data[i], b1 = i + 1 < n ? data[i + 1] : 0, b2 = i + 2 < n ? data[i + 2] : 0, b3 = i + 3 < n ? data[i + 3] : 0;
    sum = (sum + ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3) >>> 0;
  }
  return sum >>> 0;
}

/**
 * Writes a plain sfnt from tables.
 * @param {number} flavor 0x00010000 or 'OTTO'
 * @param {{tag:string, data:Buffer}[]} tables
 */
function buildSfnt(flavor, tables) {
  const list = tables.slice().sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const n = list.length;
  let es = 0;
  while (1 << (es + 1) <= n) es++;
  const searchRange = (1 << es) * 16;
  const headerLen = 12 + n * 16;
  let total = headerLen;
  for (const t of list) total += (t.data.length + 3) & ~3;
  const out = Buffer.alloc(total);
  out.writeUInt32BE(flavor >>> 0, 0);
  out.writeUInt16BE(n, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(es, 8);
  out.writeUInt16BE(n * 16 - searchRange, 10);
  let off = headerLen;
  let headOff = -1;
  list.forEach((t, i) => {
    const r = 12 + i * 16;
    let data = t.data;
    if (t.tag === 'head' && data.length >= 12) {
      data = Buffer.from(data);
      data.writeUInt32BE(0, 8); // checksumAdjustment is computed below
      headOff = off;
    }
    out.write(t.tag, r, 4, 'latin1');
    out.writeUInt32BE(checksum(data), r + 4);
    out.writeUInt32BE(off, r + 8);
    out.writeUInt32BE(data.length, r + 12);
    data.copy(out, off);
    off += (data.length + 3) & ~3;
  });
  if (headOff >= 0) out.writeUInt32BE((0xb1b0afba - checksum(out)) >>> 0, headOff + 8);
  return out;
}

/** Offsets of the fonts in a TTC. */
function ttcOffsets(buf) {
  if (buf.length < 12) throw new FontError('The collection header is cut off.', 'truncated');
  const num = buf.readUInt32BE(8);
  if (num === 0 || num > 10000 || 12 + num * 4 > buf.length) throw new FontError(`The collection header lists ${num} fonts, which is not valid.`);
  const offs = [];
  for (let i = 0; i < num; i++) offs.push(buf.readUInt32BE(12 + i * 4));
  return offs;
}

/** Copies one font of a TTC into a standalone sfnt. */
function extractTtc(buf, index) {
  const offs = ttcOffsets(buf);
  if (index < 0 || index >= offs.length) throw new FontError(`The collection has ${offs.length} fonts; font ${index + 1} does not exist.`);
  const dir = readDirectory(buf, offs[index]);
  const tables = [];
  for (const [tag] of dir.tables) tables.push({ tag, data: tableData(buf, dir, tag) });
  return buildSfnt(dir.flavor, tables);
}

/** Unpacks a WOFF 1.0 file into a plain sfnt. */
function decodeWoff(buf, limits = {}) {
  if (buf.length < 44) throw new FontError('The WOFF header is cut off.', 'truncated');
  const flavor = buf.readUInt32BE(4);
  const numTables = buf.readUInt16BE(12);
  const totalSfntSize = buf.readUInt32BE(16);
  const max = limits.maxBytes || 256 * 1024 * 1024;
  if (totalSfntSize > max) throw new FontError(`The WOFF file says it unpacks to ${totalSfntSize} bytes, over the limit.`, 'too-large');
  if (44 + numTables * 20 > buf.length) throw new FontError('The file ends inside the WOFF table directory.', 'truncated');
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const r = 44 + i * 20;
    const tag = tagAt(buf, r);
    const offset = buf.readUInt32BE(r + 4);
    const compLength = buf.readUInt32BE(r + 8);
    const origLength = buf.readUInt32BE(r + 12);
    if (offset + compLength > buf.length) throw new FontError(`WOFF table '${tag.trim()}' points past the end of the file.`, 'truncated');
    let data = buf.subarray(offset, offset + compLength);
    if (compLength < origLength) {
      try {
        data = zlib.inflateSync(data, { maxOutputLength: origLength });
      } catch (e) {
        throw new FontError(`WOFF table '${tag.trim()}' could not be unpacked (${e.code || e.message}).`);
      }
    }
    if (data.length !== origLength) throw new FontError(`WOFF table '${tag.trim()}' unpacked to the wrong size.`);
    tables.push({ tag, data });
  }
  return buildSfnt(flavor, tables);
}

module.exports = { FontError, detect, readDirectory, tableData, buildSfnt, checksum, ttcOffsets, extractTtc, decodeWoff };

return module.exports; })();
M["woff2"] = (() => { const module = { exports: {} }, exports = module.exports;

// WOFF2 to sfnt. Our own MIT decoder after the W3C WOFF2 spec: Brotli comes from Node's zlib,
// and the glyf/loca and hmtx transforms are rebuilt here.
const zlib = require('zlib');
const { FontError, buildSfnt } = require('./sfnt');

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

class Reader {
  constructor(buf, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
  }
  need(n) {
    if (this.pos + n > this.end) throw new FontError('The WOFF2 data ends too early. The file may be cut off or damaged.', 'truncated');
  }
  u8() { this.need(1); return this.buf[this.pos++]; }
  u16() { this.need(2); const v = this.buf.readUInt16BE(this.pos); this.pos += 2; return v; }
  i16() { this.need(2); const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v; }
  u32() { this.need(4); const v = this.buf.readUInt32BE(this.pos); this.pos += 4; return v; }
  bytes(n) { this.need(n); const v = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return v; }
  base128() {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      if (i === 0 && b === 0x80) throw new FontError('Bad number encoding in the WOFF2 table directory.');
      if (v & 0xfe000000) throw new FontError('A number in the WOFF2 table directory is too large.');
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v >>> 0;
    }
    throw new FontError('A number in the WOFF2 table directory is too long.');
  }
  u255() {
    const c = this.u8();
    if (c === 253) return this.u16();
    if (c === 255) return this.u8() + 253;
    if (c === 254) return this.u8() + 506;
    return c;
  }
}

function readHeader(buf) {
  if (buf.length < 48) throw new FontError('The WOFF2 header is cut off.', 'truncated');
  const r = new Reader(buf, 4);
  const h = { flavor: r.u32(), length: r.u32(), numTables: r.u16() };
  r.u16();
  h.totalSfntSize = r.u32();
  h.totalCompressedSize = r.u32();
  r.pos = 48;
  h.tables = [];
  let dataOff = 0;
  for (let i = 0; i < h.numTables; i++) {
    const flags = r.u8();
    const idx = flags & 0x3f;
    const tag = idx === 63 ? r.bytes(4).toString('latin1') : KNOWN_TAGS[idx];
    if (!tag) throw new FontError('Unknown table index in the WOFF2 directory.');
    const version = (flags >> 6) & 3;
    const origLength = r.base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const transformLength = transformed ? r.base128() : origLength;
    h.tables.push({ tag, version, origLength, transformed, length: transformLength, offset: dataOff });
    dataOff += transformLength;
  }
  h.dataLength = dataOff;
  if (h.flavor === 0x74746366) throw new FontError('This is a WOFF2 font collection. Font Viewer opens single WOFF2 fonts and .ttc collections, not WOFF2 collections yet.', 'unsupported');
  h.dataStart = r.pos;
  return h;
}

function withSign(flag, v) {
  return flag & 1 ? v : -v;
}

/** Rebuilds glyf and loca from the WOFF2 transformed glyf table. */
function rebuildGlyf(data, locaOrigLength) {
  const r = new Reader(data);
  r.u16(); // reserved
  const optionFlags = r.u16();
  const numGlyphs = r.u16();
  const indexFormat = r.u16();
  const sizes = [];
  for (let i = 0; i < 7; i++) sizes.push(r.u32());
  let off = r.pos;
  const streams = sizes.map((s) => {
    const st = new Reader(data, off, off + s);
    if (off + s > data.length) throw new FontError('The WOFF2 glyph data is cut off.', 'truncated');
    off += s;
    return st;
  });
  const [nContourS, nPointsS, flagS, glyphS, compositeS, bboxS, instrS] = streams;
  let overlap = null;
  if (optionFlags & 1) overlap = data.subarray(off, off + ((numGlyphs + 7) >> 3));
  const bitmapLen = 4 * Math.floor((numGlyphs + 31) / 32);
  const bboxBitmap = bboxS.bytes(bitmapLen);
  const hasBbox = (i) => (bboxBitmap[i >> 3] & (0x80 >> (i & 7))) !== 0;
  const xMins = new Int16Array(numGlyphs);
  const parts = [];
  const loca = new Array(numGlyphs + 1);
  let pos = 0;
  const pad = indexFormat ? 4 : 2;
  for (let g = 0; g < numGlyphs; g++) {
    loca[g] = pos;
    const nContours = nContourS.i16();
    let glyph;
    if (nContours === 0) {
      if (hasBbox(g)) throw new FontError(`WOFF2 glyph ${g} is empty but has a bounding box.`);
      glyph = Buffer.alloc(0);
    } else if (nContours === -1) {
      if (!hasBbox(g)) throw new FontError(`WOFF2 composite glyph ${g} has no bounding box.`);
      const start = compositeS.pos;
      let haveInstr = false;
      let flags;
      do {
        flags = compositeS.u16();
        compositeS.u16();
        compositeS.bytes(flags & 1 ? 4 : 2);
        if (flags & 8) compositeS.bytes(2);
        else if (flags & 0x40) compositeS.bytes(4);
        else if (flags & 0x80) compositeS.bytes(8);
        if (flags & 0x100) haveInstr = true;
      } while (flags & 0x20);
      const comp = data.subarray(start, compositeS.pos);
      const bbox = bboxS.bytes(8);
      let instr = null;
      if (haveInstr) instr = instrS.bytes(glyphS.u255());
      glyph = Buffer.alloc(2 + 8 + comp.length + (instr ? 2 + instr.length : 0));
      glyph.writeInt16BE(-1, 0);
      bbox.copy(glyph, 2);
      comp.copy(glyph, 10);
      if (instr) {
        glyph.writeUInt16BE(instr.length, 10 + comp.length);
        instr.copy(glyph, 12 + comp.length);
      }
      xMins[g] = bbox.readInt16BE(0);
    } else if (nContours > 0) {
      const ends = [];
      let total = 0;
      for (let c = 0; c < nContours; c++) {
        total += nPointsS.u255();
        ends.push(total - 1);
      }
      const xs = new Int32Array(total), ys = new Int32Array(total), on = new Uint8Array(total);
      let x = 0, y = 0;
      for (let p = 0; p < total; p++) {
        let flag = flagS.u8();
        on[p] = flag >> 7 ? 0 : 1;
        flag &= 0x7f;
        let dx, dy;
        if (flag < 10) {
          dx = 0;
          dy = withSign(flag, ((flag & 14) << 7) + glyphS.u8());
        } else if (flag < 20) {
          dx = withSign(flag, (((flag - 10) & 14) << 7) + glyphS.u8());
          dy = 0;
        } else if (flag < 84) {
          const b0 = flag - 20, b1 = glyphS.u8();
          dx = withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4));
          dy = withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
        } else if (flag < 120) {
          const b0 = flag - 84, b1 = glyphS.u8(), b2 = glyphS.u8();
          dx = withSign(flag, 1 + (Math.floor(b0 / 12) << 8) + b1);
          dy = withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + b2);
        } else if (flag < 124) {
          const b1 = glyphS.u8(), b2 = glyphS.u8(), b3 = glyphS.u8();
          dx = withSign(flag, (b1 << 4) + (b2 >> 4));
          dy = withSign(flag >> 1, ((b2 & 0x0f) << 8) + b3);
        } else {
          const b1 = glyphS.u8(), b2 = glyphS.u8(), b3 = glyphS.u8(), b4 = glyphS.u8();
          dx = withSign(flag, (b1 << 8) + b2);
          dy = withSign(flag >> 1, (b3 << 8) + b4);
        }
        x += dx;
        y += dy;
        xs[p] = x;
        ys[p] = y;
      }
      const instr = instrS.bytes(glyphS.u255());
      let bbox;
      if (hasBbox(g)) {
        const b = bboxS.bytes(8);
        bbox = [b.readInt16BE(0), b.readInt16BE(2), b.readInt16BE(4), b.readInt16BE(6)];
      } else {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let p = 0; p < total; p++) {
          if (xs[p] < x0) x0 = xs[p];
          if (xs[p] > x1) x1 = xs[p];
          if (ys[p] < y0) y0 = ys[p];
          if (ys[p] > y1) y1 = ys[p];
        }
        bbox = total ? [x0, y0, x1, y1] : [0, 0, 0, 0];
      }
      xMins[g] = bbox[0];
      // Encode flags and coordinates in the normal glyf form.
      const fl = [], xb = [], yb = [];
      let px = 0, py = 0;
      const overlapFirst = overlap && (overlap[g >> 3] & (0x80 >> (g & 7)));
      for (let p = 0; p < total; p++) {
        let f = on[p] ? 1 : 0;
        if (p === 0 && overlapFirst) f |= 0x40;
        const dx = xs[p] - px, dy = ys[p] - py;
        px = xs[p];
        py = ys[p];
        if (dx === 0) f |= 0x10;
        else if (dx >= -255 && dx <= 255) { f |= 0x02 | (dx > 0 ? 0x10 : 0); xb.push(Math.abs(dx)); }
        else xb.push((dx >> 8) & 0xff, dx & 0xff);
        if (dy === 0) f |= 0x20;
        else if (dy >= -255 && dy <= 255) { f |= 0x04 | (dy > 0 ? 0x20 : 0); yb.push(Math.abs(dy)); }
        else yb.push((dy >> 8) & 0xff, dy & 0xff);
        fl.push(f);
      }
      glyph = Buffer.alloc(10 + nContours * 2 + 2 + instr.length + fl.length + xb.length + yb.length);
      let o = glyph.writeInt16BE(nContours, 0);
      for (const v of bbox) o = glyph.writeInt16BE(v, o);
      for (const e of ends) o = glyph.writeUInt16BE(e, o);
      o = glyph.writeUInt16BE(instr.length, o);
      instr.copy(glyph, o);
      o += instr.length;
      for (const arr of [fl, xb, yb]) { Buffer.from(arr).copy(glyph, o); o += arr.length; }
    } else {
      throw new FontError(`WOFF2 glyph ${g} has an invalid contour count (${nContours}).`);
    }
    parts.push(glyph);
    pos += glyph.length;
    const extra = (pad - (glyph.length % pad)) % pad;
    if (extra) { parts.push(Buffer.alloc(extra)); pos += extra; }
  }
  loca[numGlyphs] = pos;
  const glyf = Buffer.concat(parts);
  const locaBuf = Buffer.alloc((numGlyphs + 1) * (indexFormat ? 4 : 2));
  for (let i = 0; i <= numGlyphs; i++) {
    if (indexFormat) locaBuf.writeUInt32BE(loca[i], i * 4);
    else locaBuf.writeUInt16BE(loca[i] / 2, i * 2);
  }
  if (locaOrigLength != null && locaOrigLength !== locaBuf.length) throw new FontError('The rebuilt loca table has the wrong size.');
  return { glyf, loca: locaBuf, numGlyphs, xMins };
}

/** Rebuilds hmtx from the WOFF2 transformed form (version 1). */
function rebuildHmtx(data, numHMetrics, numGlyphs, xMins) {
  const r = new Reader(data);
  const flags = r.u8();
  const adv = [];
  for (let i = 0; i < numHMetrics; i++) adv.push(r.u16());
  const lsb = [];
  for (let i = 0; i < numHMetrics; i++) lsb.push(flags & 1 ? xMins[i] : r.i16());
  for (let i = numHMetrics; i < numGlyphs; i++) lsb.push(flags & 2 ? xMins[i] : r.i16());
  const out = Buffer.alloc(numHMetrics * 4 + (numGlyphs - numHMetrics) * 2);
  let o = 0;
  for (let i = 0; i < numHMetrics; i++) { o = out.writeUInt16BE(adv[i], o); o = out.writeInt16BE(lsb[i], o); }
  for (let i = numHMetrics; i < numGlyphs; i++) o = out.writeInt16BE(lsb[i], o);
  return out;
}

/**
 * Unpacks a WOFF2 file into a plain sfnt Buffer.
 * @param {Buffer} buf
 * @param {{maxBytes?:number}} [limits]
 */
function decodeWoff2(buf, limits = {}) {
  const h = readHeader(buf);
  const max = limits.maxBytes || 256 * 1024 * 1024;
  if (h.totalSfntSize > max || h.dataLength > max) throw new FontError('This WOFF2 file says it unpacks to more than the size limit.', 'too-large');
  if (h.dataStart + h.totalCompressedSize > buf.length) throw new FontError('The WOFF2 data is cut off.', 'truncated');
  let raw;
  try {
    raw = zlib.brotliDecompressSync(buf.subarray(h.dataStart, h.dataStart + h.totalCompressedSize), { maxOutputLength: Math.max(h.dataLength, 1) });
  } catch (e) {
    throw new FontError(`The WOFF2 data could not be unpacked (${e.code || e.message}).`, 'truncated');
  }
  if (raw.length < h.dataLength) throw new FontError('The WOFF2 data is shorter than its table directory says.', 'truncated');
  const get = (t) => raw.subarray(t.offset, t.offset + t.length);
  const byTag = new Map(h.tables.map((t) => [t.tag, t]));
  const out = [];
  let rebuilt = null;
  const glyfT = byTag.get('glyf');
  if (glyfT && glyfT.transformed) {
    const locaT = byTag.get('loca');
    rebuilt = rebuildGlyf(get(glyfT), locaT ? locaT.origLength : null);
  }
  for (const t of h.tables) {
    if (t.tag === 'glyf' && rebuilt) out.push({ tag: 'glyf', data: rebuilt.glyf });
    else if (t.tag === 'loca' && rebuilt) out.push({ tag: 'loca', data: rebuilt.loca });
    else if (t.tag === 'hmtx' && t.transformed) {
      if (!rebuilt) throw new FontError('The WOFF2 hmtx table is transformed but there is no transformed glyf table.');
      const hhea = byTag.get('hhea');
      if (!hhea) throw new FontError('The WOFF2 font has no hhea table.');
      const numHMetrics = get(hhea).readUInt16BE(34);
      out.push({ tag: 'hmtx', data: rebuildHmtx(get(t), numHMetrics, rebuilt.numGlyphs, rebuilt.xMins) });
    } else if (t.transformed) {
      throw new FontError(`WOFF2 table '${t.tag.trim()}' uses a transform this viewer does not know.`, 'unsupported');
    } else out.push({ tag: t.tag, data: get(t) });
  }
  return buildSfnt(h.flavor, out);
}

module.exports = { decodeWoff2, readHeader, KNOWN_TAGS };

return module.exports; })();
M["info"] = (() => { const module = { exports: {} }, exports = module.exports;

// Reads metadata from a plain sfnt: name table, head, OS/2, hhea, post, maxp, fvar, cmap and the
// OpenType feature tags of GSUB and GPOS. No outlines here (see glyphs.js).
const { FontError, readDirectory, tableData } = require('./sfnt');

const NAME_LABELS = {
  0: 'Copyright', 1: 'Family', 2: 'Subfamily', 3: 'Unique ID', 4: 'Full name', 5: 'Version', 6: 'PostScript name',
  7: 'Trademark', 8: 'Manufacturer', 9: 'Designer', 10: 'Description', 11: 'Vendor URL', 12: 'Designer URL',
  13: 'License', 14: 'License URL', 16: 'Typographic family', 17: 'Typographic subfamily', 18: 'Compatible full name',
  19: 'Sample text', 20: 'PostScript CID name', 21: 'WWS family', 22: 'WWS subfamily', 25: 'Variations PostScript prefix',
};

// Mac Roman upper half, for platform 1 names.
const MAC_ROMAN = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

function utf16be(b) {
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  return s;
}

function macRoman(b) {
  let s = '';
  for (const c of b) s += c < 128 ? String.fromCharCode(c) : MAC_ROMAN[c - 128];
  return s;
}

/** All name records, best English string per name ID. Returns { byId: {id: string}, records: number, languages: number }. */
function parseName(data) {
  if (!data || data.length < 6) return { byId: {}, records: 0, languages: 0 };
  const count = data.readUInt16BE(2);
  const strOff = data.readUInt16BE(4);
  const best = {};
  const langs = new Set();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > data.length) break;
    const pid = data.readUInt16BE(r), eid = data.readUInt16BE(r + 2), lid = data.readUInt16BE(r + 4);
    const nid = data.readUInt16BE(r + 6), len = data.readUInt16BE(r + 8), off = data.readUInt16BE(r + 10);
    const s0 = strOff + off;
    if (s0 + len > data.length) continue;
    const raw = data.subarray(s0, s0 + len);
    let text, score;
    if (pid === 3 && (eid === 1 || eid === 10 || eid === 0)) {
      text = utf16be(raw);
      score = lid === 0x409 ? 4 : 2;
      langs.add('w' + lid);
    } else if (pid === 0) {
      text = utf16be(raw);
      score = 3;
    } else if (pid === 1 && eid === 0) {
      text = macRoman(raw);
      score = lid === 0 ? 1 : 0;
      langs.add('m' + lid);
    } else continue;
    text = text.replace(/\u0000/g, '');
    if (!best[nid] || score > best[nid].score) best[nid] = { text, score };
  }
  const byId = {};
  for (const k of Object.keys(best)) byId[k] = best[k].text;
  return { byId, records: count, languages: langs.size };
}

function fixed(d, o) {
  return d.readInt32BE(o) / 65536;
}

function longDate(d, o) {
  const secs = d.readUInt32BE(o) * 4294967296 + d.readUInt32BE(o + 4);
  if (!secs) return null;
  const ms = (secs - 2082844800) * 1000;
  const dt = new Date(ms);
  return isNaN(dt.getTime()) || dt.getUTCFullYear() < 1970 || dt.getUTCFullYear() > 2200 ? null : dt.toISOString().slice(0, 10);
}

function tagList(data) {
  // GSUB / GPOS header: version (4), scriptList (2), featureList (2), lookupList (2)
  if (!data || data.length < 10) return [];
  const fl = data.readUInt16BE(6);
  if (!fl || fl + 2 > data.length) return [];
  const n = data.readUInt16BE(fl);
  const tags = new Set();
  for (let i = 0; i < n; i++) {
    const r = fl + 2 + i * 6;
    if (r + 6 > data.length) break;
    tags.add(data.toString('latin1', r, r + 4));
  }
  return [...tags].filter((t) => /^[\x20-\x7e]{4}$/.test(t)).sort();
}

function parseFvar(data, names) {
  if (!data || data.length < 16) return { axes: [], instances: [] };
  const axesOff = data.readUInt16BE(4);
  const axisCount = data.readUInt16BE(8), axisSize = data.readUInt16BE(10);
  const instCount = data.readUInt16BE(12), instSize = data.readUInt16BE(14);
  const axes = [];
  for (let i = 0; i < axisCount; i++) {
    const r = axesOff + i * axisSize;
    if (r + 20 > data.length) break;
    const tag = data.toString('latin1', r, r + 4);
    const nameId = data.readUInt16BE(r + 18);
    axes.push({ tag, min: fixed(data, r + 4), def: fixed(data, r + 8), max: fixed(data, r + 12), hidden: (data.readUInt16BE(r + 16) & 1) === 1, name: names[nameId] || AXIS_NAMES[tag] || tag });
  }
  const instances = [];
  let r = axesOff + axisCount * axisSize;
  for (let i = 0; i < instCount; i++, r += instSize) {
    if (r + 4 + axisCount * 4 > data.length) break;
    const nameId = data.readUInt16BE(r);
    const coords = {};
    axes.forEach((a, j) => { coords[a.tag] = fixed(data, r + 4 + j * 4); });
    instances.push({ name: names[nameId] || `Instance ${i + 1}`, coords });
  }
  return { axes, instances };
}

const AXIS_NAMES = { wght: 'Weight', wdth: 'Width', ital: 'Italic', slnt: 'Slant', opsz: 'Optical size' };

/** Best cmap as a Map(codePoint -> glyphId). */
function parseCmap(data) {
  const map = new Map();
  if (!data || data.length < 4) return map;
  const n = data.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) {
    const r = 4 + i * 8;
    if (r + 8 > data.length) break;
    const pid = data.readUInt16BE(r), eid = data.readUInt16BE(r + 2), off = data.readUInt32BE(r + 4);
    if (off + 2 > data.length) continue;
    const fmt = data.readUInt16BE(off);
    let score = 0;
    if (fmt === 12 && (pid === 3 && eid === 10 || pid === 0)) score = 6;
    else if (fmt === 4 && (pid === 3 && eid === 1 || pid === 0)) score = 5;
    else if (fmt === 12 || fmt === 4) score = 4;
    else if (fmt === 6 || fmt === 0) score = pid === 3 && eid === 0 ? 2 : 1; // symbol fonts or Mac Roman
    if (score) subs.push({ off, fmt, score, symbol: pid === 3 && eid === 0 });
  }
  subs.sort((a, b) => b.score - a.score);
  const s = subs[0];
  if (!s) return map;
  const d = data, o = s.off;
  try {
    if (s.fmt === 4) {
      const segX2 = d.readUInt16BE(o + 6);
      const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let i = 0; i < segX2; i += 2) {
        const end = d.readUInt16BE(ends + i), start = d.readUInt16BE(starts + i);
        const delta = d.readInt16BE(deltas + i), ro = d.readUInt16BE(ranges + i);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            const p = ranges + i + ro + (c - start) * 2;
            if (p + 2 > d.length) break;
            g = d.readUInt16BE(p);
            if (g) g = (g + delta) & 0xffff;
          }
          if (g) map.set(c, g);
        }
      }
    } else if (s.fmt === 12) {
      const groups = d.readUInt32BE(o + 12);
      for (let i = 0; i < groups && o + 16 + i * 12 + 12 <= d.length; i++) {
        const r = o + 16 + i * 12;
        const a = d.readUInt32BE(r), b = d.readUInt32BE(r + 4), g0 = d.readUInt32BE(r + 8);
        if (b - a > 0x110000) continue;
        for (let c = a; c <= b && c <= 0x10ffff; c++) map.set(c, g0 + (c - a));
      }
    } else if (s.fmt === 6) {
      const first = d.readUInt16BE(o + 6), count = d.readUInt16BE(o + 8);
      for (let i = 0; i < count; i++) { const g = d.readUInt16BE(o + 10 + i * 2); if (g) map.set(first + i, g); }
    } else if (s.fmt === 0) {
      for (let c = 0; c < 256; c++) { const g = d[o + 6 + c]; if (g) map.set(c, g); }
    }
  } catch (e) {
    // A cut-off cmap keeps what was read so far.
  }
  // Symbol fonts map their glyphs at U+F0xx. Also map them at U+00xx so typing works in the tester.
  if (s.symbol) for (const [c, g] of [...map]) if (c >= 0xf020 && c <= 0xf0ff && !map.has(c - 0xf000)) map.set(c - 0xf000, g);
  return map;
}

const EMBEDDING = (fsType) => {
  const t = fsType & 0x0f;
  let s = t & 2 ? 'Restricted license embedding' : t & 4 ? 'Preview and print embedding' : t & 8 ? 'Editable embedding' : 'Installable embedding';
  if (fsType & 0x100) s += ', no subsetting';
  if (fsType & 0x200) s += ', bitmap embedding only';
  return s;
};

/**
 * Reads the font metadata from a plain sfnt.
 * @param {Buffer} sfnt
 */
function readInfo(sfnt) {
  const dir = readDirectory(sfnt, 0);
  const t = (tag) => tableData(sfnt, dir, tag);
  if (!dir.tables.has('cmap') && !dir.tables.has('head')) throw new FontError('This file has no cmap or head table, so it is not a usable font.');
  const name = parseName(t('name'));
  const n = name.byId;
  const info = {
    outlines: dir.tables.has('CFF2') ? 'CFF2' : dir.tables.has('CFF ') ? 'CFF' : dir.tables.has('glyf') ? 'TrueType' : 'none',
    tables: [...dir.tables].map(([tag, v]) => ({ tag, length: v.length })).sort((a, b) => (a.tag < b.tag ? -1 : 1)),
    names: [],
    family: n[16] || n[1] || '',
    subfamily: n[17] || n[2] || '',
    fullName: n[4] || [n[1], n[2]].filter(Boolean).join(' '),
    postscriptName: n[6] || '',
    version: n[5] || '',
    nameRecords: name.records,
    nameLanguages: name.languages,
    color: ['COLR', 'SVG ', 'sbix', 'CBDT'].filter((x) => dir.tables.has(x)).map((x) => x.trim()),
  };
  for (const id of Object.keys(n).map(Number).sort((a, b) => a - b)) {
    if (id < 256 && n[id]) info.names.push({ id, label: NAME_LABELS[id] || `Name ${id}`, value: n[id] });
  }
  const head = t('head');
  if (head && head.length >= 54) {
    info.unitsPerEm = head.readUInt16BE(18);
    info.fontRevision = Math.round(fixed(head, 4) * 1000) / 1000;
    info.created = longDate(head, 20);
    info.modified = longDate(head, 28);
    info.bbox = [head.readInt16BE(36), head.readInt16BE(38), head.readInt16BE(40), head.readInt16BE(42)];
    info.macStyle = head.readUInt16BE(44);
  }
  if (!info.unitsPerEm || info.unitsPerEm < 16 || info.unitsPerEm > 16384) info.unitsPerEm = 1000;
  const hhea = t('hhea');
  if (hhea && hhea.length >= 36) {
    info.ascender = hhea.readInt16BE(4);
    info.descender = hhea.readInt16BE(6);
    info.lineGap = hhea.readInt16BE(8);
  }
  const os2 = t('OS/2');
  if (os2 && os2.length >= 68) {
    info.os2Version = os2.readUInt16BE(0);
    info.weightClass = os2.readUInt16BE(4);
    info.widthClass = os2.readUInt16BE(6);
    info.fsType = os2.readUInt16BE(8);
    info.embedding = EMBEDDING(info.fsType);
    info.vendor = os2.toString('latin1', 58, 62).replace(/[^\x20-\x7e]/g, '').trim();
    info.fsSelection = os2.readUInt16BE(62);
    info.italic = (info.fsSelection & 1) === 1;
    if (os2.length >= 74) {
      info.typoAscender = os2.readInt16BE(68);
      info.typoDescender = os2.readInt16BE(70);
      info.typoLineGap = os2.readInt16BE(72);
    }
    if (info.os2Version >= 2 && os2.length >= 90) {
      info.xHeight = os2.readInt16BE(86);
      info.capHeight = os2.readInt16BE(88);
    }
  } else if (info.macStyle != null) info.italic = (info.macStyle & 2) === 2;
  const post = t('post');
  if (post && post.length >= 16) {
    info.italicAngle = fixed(post, 4);
    info.fixedPitch = post.readUInt32BE(12) !== 0;
  }
  const maxp = t('maxp');
  info.numGlyphs = maxp && maxp.length >= 6 ? maxp.readUInt16BE(4) : 0;
  const fvar = parseFvar(t('fvar'), n);
  info.axes = fvar.axes;
  info.instances = fvar.instances;
  info.gsubFeatures = tagList(t('GSUB'));
  info.gposFeatures = tagList(t('GPOS'));
  if (dir.tables.has('kern') && !info.gposFeatures.includes('kern')) info.gposFeatures.push('kern');
  const cmap = parseCmap(t('cmap'));
  info.codePoints = cmap.size;
  if (info.ascender == null) {
    info.ascender = info.typoAscender != null ? info.typoAscender : Math.round(info.unitsPerEm * 0.8);
    info.descender = info.typoDescender != null ? info.typoDescender : -Math.round(info.unitsPerEm * 0.2);
  }
  return { info, cmap, dir };
}

module.exports = { readInfo, parseName, parseCmap, parseFvar, tagList, NAME_LABELS, EMBEDDING };

return module.exports; })();
M["blocks"] = (() => { const module = { exports: {} }, exports = module.exports;

// Unicode blocks from the Unicode 13.0 Blocks.txt (Unicode License, data only). Rows are [start, end, name].
const BLOCKS = [
  [0x0, 0x7F, 'Basic Latin'],
  [0x80, 0xFF, 'Latin-1 Supplement'],
  [0x100, 0x17F, 'Latin Extended-A'],
  [0x180, 0x24F, 'Latin Extended-B'],
  [0x250, 0x2AF, 'IPA Extensions'],
  [0x2B0, 0x2FF, 'Spacing Modifier Letters'],
  [0x300, 0x36F, 'Combining Diacritical Marks'],
  [0x370, 0x3FF, 'Greek and Coptic'],
  [0x400, 0x4FF, 'Cyrillic'],
  [0x500, 0x52F, 'Cyrillic Supplement'],
  [0x530, 0x58F, 'Armenian'],
  [0x590, 0x5FF, 'Hebrew'],
  [0x600, 0x6FF, 'Arabic'],
  [0x700, 0x74F, 'Syriac'],
  [0x750, 0x77F, 'Arabic Supplement'],
  [0x780, 0x7BF, 'Thaana'],
  [0x7C0, 0x7FF, 'NKo'],
  [0x800, 0x83F, 'Samaritan'],
  [0x840, 0x85F, 'Mandaic'],
  [0x860, 0x86F, 'Syriac Supplement'],
  [0x8A0, 0x8FF, 'Arabic Extended-A'],
  [0x900, 0x97F, 'Devanagari'],
  [0x980, 0x9FF, 'Bengali'],
  [0xA00, 0xA7F, 'Gurmukhi'],
  [0xA80, 0xAFF, 'Gujarati'],
  [0xB00, 0xB7F, 'Oriya'],
  [0xB80, 0xBFF, 'Tamil'],
  [0xC00, 0xC7F, 'Telug'],
  [0xC80, 0xCFF, 'Kannada'],
  [0xD00, 0xD7F, 'Malayalam'],
  [0xD80, 0xDFF, 'Sinhala'],
  [0xE00, 0xE7F, 'Thai'],
  [0xE80, 0xEFF, 'Lao'],
  [0xF00, 0xFFF, 'Tibetan'],
  [0x1000, 0x109F, 'Myanmar'],
  [0x10A0, 0x10FF, 'Georgian'],
  [0x1100, 0x11FF, 'Hangul Jamo'],
  [0x1200, 0x137F, 'Ethiopic'],
  [0x1380, 0x139F, 'Ethiopic Supplement'],
  [0x13A0, 0x13FF, 'Cherokee'],
  [0x1400, 0x167F, 'Unified Canadian Aboriginal Syllabics'],
  [0x1680, 0x169F, 'Ogham'],
  [0x16A0, 0x16FF, 'Runic'],
  [0x1700, 0x171F, 'Tagalog'],
  [0x1720, 0x173F, 'Hanunoo'],
  [0x1740, 0x175F, 'Buhid'],
  [0x1760, 0x177F, 'Tagbanwa'],
  [0x1780, 0x17FF, 'Khmer'],
  [0x1800, 0x18AF, 'Mongolian'],
  [0x18B0, 0x18FF, 'Unified Canadian Aboriginal Syllabics Extended'],
  [0x1900, 0x194F, 'Limb'],
  [0x1950, 0x197F, 'Tai Le'],
  [0x1980, 0x19DF, 'New Tai Lue'],
  [0x19E0, 0x19FF, 'Khmer Symbols'],
  [0x1A00, 0x1A1F, 'Buginese'],
  [0x1A20, 0x1AAF, 'Tai Tham'],
  [0x1AB0, 0x1AFF, 'Combining Diacritical Marks Extended'],
  [0x1B00, 0x1B7F, 'Balinese'],
  [0x1B80, 0x1BBF, 'Sundanese'],
  [0x1BC0, 0x1BFF, 'Batak'],
  [0x1C00, 0x1C4F, 'Lepcha'],
  [0x1C50, 0x1C7F, 'Ol Chiki'],
  [0x1C80, 0x1C8F, 'Cyrillic Extended-C'],
  [0x1C90, 0x1CBF, 'Georgian Extended'],
  [0x1CC0, 0x1CCF, 'Sundanese Supplement'],
  [0x1CD0, 0x1CFF, 'Vedic Extensions'],
  [0x1D00, 0x1D7F, 'Phonetic Extensions'],
  [0x1D80, 0x1DBF, 'Phonetic Extensions Supplement'],
  [0x1DC0, 0x1DFF, 'Combining Diacritical Marks Supplement'],
  [0x1E00, 0x1EFF, 'Latin Extended Additional'],
  [0x1F00, 0x1FFF, 'Greek Extended'],
  [0x2000, 0x206F, 'General Punctuation'],
  [0x2070, 0x209F, 'Superscripts and Subscripts'],
  [0x20A0, 0x20CF, 'Currency Symbols'],
  [0x20D0, 0x20FF, 'Combining Diacritical Marks for Symbols'],
  [0x2100, 0x214F, 'Letterlike Symbols'],
  [0x2150, 0x218F, 'Number Forms'],
  [0x2190, 0x21FF, 'Arrows'],
  [0x2200, 0x22FF, 'Mathematical Operators'],
  [0x2300, 0x23FF, 'Miscellaneous Technical'],
  [0x2400, 0x243F, 'Control Pictures'],
  [0x2440, 0x245F, 'Optical Character Recognition'],
  [0x2460, 0x24FF, 'Enclosed Alphanumerics'],
  [0x2500, 0x257F, 'Box Drawing'],
  [0x2580, 0x259F, 'Block Elements'],
  [0x25A0, 0x25FF, 'Geometric Shapes'],
  [0x2600, 0x26FF, 'Miscellaneous Symbols'],
  [0x2700, 0x27BF, 'Dingbats'],
  [0x27C0, 0x27EF, 'Miscellaneous Mathematical Symbols-A'],
  [0x27F0, 0x27FF, 'Supplemental Arrows-A'],
  [0x2800, 0x28FF, 'Braille Patterns'],
  [0x2900, 0x297F, 'Supplemental Arrows-B'],
  [0x2980, 0x29FF, 'Miscellaneous Mathematical Symbols-B'],
  [0x2A00, 0x2AFF, 'Supplemental Mathematical Operators'],
  [0x2B00, 0x2BFF, 'Miscellaneous Symbols and Arrows'],
  [0x2C00, 0x2C5F, 'Glagolitic'],
  [0x2C60, 0x2C7F, 'Latin Extended-C'],
  [0x2C80, 0x2CFF, 'Coptic'],
  [0x2D00, 0x2D2F, 'Georgian Supplement'],
  [0x2D30, 0x2D7F, 'Tifinagh'],
  [0x2D80, 0x2DDF, 'Ethiopic Extended'],
  [0x2DE0, 0x2DFF, 'Cyrillic Extended-A'],
  [0x2E00, 0x2E7F, 'Supplemental Punctuation'],
  [0x2E80, 0x2EFF, 'CJK Radicals Supplement'],
  [0x2F00, 0x2FDF, 'Kangxi Radicals'],
  [0x2FF0, 0x2FFF, 'Ideographic Description Characters'],
  [0x3000, 0x303F, 'CJK Symbols and Punctuation'],
  [0x3040, 0x309F, 'Hiragana'],
  [0x30A0, 0x30FF, 'Katakana'],
  [0x3100, 0x312F, 'Bopomofo'],
  [0x3130, 0x318F, 'Hangul Compatibility Jamo'],
  [0x3190, 0x319F, 'Kanbun'],
  [0x31A0, 0x31BF, 'Bopomofo Extended'],
  [0x31C0, 0x31EF, 'CJK Strokes'],
  [0x31F0, 0x31FF, 'Katakana Phonetic Extensions'],
  [0x3200, 0x32FF, 'Enclosed CJK Letters and Months'],
  [0x3300, 0x33FF, 'CJK Compatibility'],
  [0x3400, 0x4DBF, 'CJK Unified Ideographs Extension A'],
  [0x4DC0, 0x4DFF, 'Yijing Hexagram Symbols'],
  [0x4E00, 0x9FFF, 'CJK Unified Ideographs'],
  [0xA000, 0xA48F, 'Yi Syllables'],
  [0xA490, 0xA4CF, 'Yi Radicals'],
  [0xA4D0, 0xA4FF, 'Lis'],
  [0xA500, 0xA63F, 'Vai'],
  [0xA640, 0xA69F, 'Cyrillic Extended-B'],
  [0xA6A0, 0xA6FF, 'Bamum'],
  [0xA700, 0xA71F, 'Modifier Tone Letters'],
  [0xA720, 0xA7FF, 'Latin Extended-D'],
  [0xA800, 0xA82F, 'Syloti Nagri'],
  [0xA830, 0xA83F, 'Common Indic Number Forms'],
  [0xA840, 0xA87F, 'Phags-pa'],
  [0xA880, 0xA8DF, 'Saurashtra'],
  [0xA8E0, 0xA8FF, 'Devanagari Extended'],
  [0xA900, 0xA92F, 'Kayah Li'],
  [0xA930, 0xA95F, 'Rejang'],
  [0xA960, 0xA97F, 'Hangul Jamo Extended-A'],
  [0xA980, 0xA9DF, 'Javanese'],
  [0xA9E0, 0xA9FF, 'Myanmar Extended-B'],
  [0xAA00, 0xAA5F, 'Cham'],
  [0xAA60, 0xAA7F, 'Myanmar Extended-A'],
  [0xAA80, 0xAADF, 'Tai Viet'],
  [0xAAE0, 0xAAFF, 'Meetei Mayek Extensions'],
  [0xAB00, 0xAB2F, 'Ethiopic Extended-A'],
  [0xAB30, 0xAB6F, 'Latin Extended-E'],
  [0xAB70, 0xABBF, 'Cherokee Supplement'],
  [0xABC0, 0xABFF, 'Meetei Mayek'],
  [0xAC00, 0xD7AF, 'Hangul Syllables'],
  [0xD7B0, 0xD7FF, 'Hangul Jamo Extended-B'],
  [0xD800, 0xDB7F, 'High Surrogates'],
  [0xDB80, 0xDBFF, 'High Private Use Surrogates'],
  [0xDC00, 0xDFFF, 'Low Surrogates'],
  [0xE000, 0xF8FF, 'Private Use Area'],
  [0xF900, 0xFAFF, 'CJK Compatibility Ideographs'],
  [0xFB00, 0xFB4F, 'Alphabetic Presentation Forms'],
  [0xFB50, 0xFDFF, 'Arabic Presentation Forms-A'],
  [0xFE00, 0xFE0F, 'Variation Selectors'],
  [0xFE10, 0xFE1F, 'Vertical Forms'],
  [0xFE20, 0xFE2F, 'Combining Half Marks'],
  [0xFE30, 0xFE4F, 'CJK Compatibility Forms'],
  [0xFE50, 0xFE6F, 'Small Form Variants'],
  [0xFE70, 0xFEFF, 'Arabic Presentation Forms-B'],
  [0xFF00, 0xFFEF, 'Halfwidth and Fullwidth Forms'],
  [0xFFF0, 0xFFFF, 'Specials'],
  [0x10000, 0x1007F, 'Linear B Syllabary'],
  [0x10080, 0x100FF, 'Linear B Ideograms'],
  [0x10100, 0x1013F, 'Aegean Numbers'],
  [0x10140, 0x1018F, 'Ancient Greek Numbers'],
  [0x10190, 0x101CF, 'Ancient Symbols'],
  [0x101D0, 0x101FF, 'Phaistos Disc'],
  [0x10280, 0x1029F, 'Lycian'],
  [0x102A0, 0x102DF, 'Carian'],
  [0x102E0, 0x102FF, 'Coptic Epact Numbers'],
  [0x10300, 0x1032F, 'Old Italic'],
  [0x10330, 0x1034F, 'Gothic'],
  [0x10350, 0x1037F, 'Old Permic'],
  [0x10380, 0x1039F, 'Ugaritic'],
  [0x103A0, 0x103DF, 'Old Persian'],
  [0x10400, 0x1044F, 'Deseret'],
  [0x10450, 0x1047F, 'Shavian'],
  [0x10480, 0x104AF, 'Osmanya'],
  [0x104B0, 0x104FF, 'Osage'],
  [0x10500, 0x1052F, 'Elbasan'],
  [0x10530, 0x1056F, 'Caucasian Albanian'],
  [0x10600, 0x1077F, 'Linear A'],
  [0x10800, 0x1083F, 'Cypriot Syllabary'],
  [0x10840, 0x1085F, 'Imperial Aramaic'],
  [0x10860, 0x1087F, 'Palmyrene'],
  [0x10880, 0x108AF, 'Nabataean'],
  [0x108E0, 0x108FF, 'Hatran'],
  [0x10900, 0x1091F, 'Phoenician'],
  [0x10920, 0x1093F, 'Lydian'],
  [0x10980, 0x1099F, 'Meroitic Hieroglyphs'],
  [0x109A0, 0x109FF, 'Meroitic Cursive'],
  [0x10A00, 0x10A5F, 'Kharoshthi'],
  [0x10A60, 0x10A7F, 'Old South Arabian'],
  [0x10A80, 0x10A9F, 'Old North Arabian'],
  [0x10AC0, 0x10AFF, 'Manichaean'],
  [0x10B00, 0x10B3F, 'Avestan'],
  [0x10B40, 0x10B5F, 'Inscriptional Parthian'],
  [0x10B60, 0x10B7F, 'Inscriptional Pahlavi'],
  [0x10B80, 0x10BAF, 'Psalter Pahlavi'],
  [0x10C00, 0x10C4F, 'Old Turkic'],
  [0x10C80, 0x10CFF, 'Old Hungarian'],
  [0x10D00, 0x10D3F, 'Hanifi Rohingya'],
  [0x10E60, 0x10E7F, 'Rumi Numeral Symbols'],
  [0x10E80, 0x10EBF, 'Yezidi'],
  [0x10F00, 0x10F2F, 'Old Sogdian'],
  [0x10F30, 0x10F6F, 'Sogdian'],
  [0x10FB0, 0x10FDF, 'Chorasmian'],
  [0x10FE0, 0x10FFF, 'Elymaic'],
  [0x11000, 0x1107F, 'Brahmi'],
  [0x11080, 0x110CF, 'Kaithi'],
  [0x110D0, 0x110FF, 'Sora Sompeng'],
  [0x11100, 0x1114F, 'Chakma'],
  [0x11150, 0x1117F, 'Mahajani'],
  [0x11180, 0x111DF, 'Sharada'],
  [0x111E0, 0x111FF, 'Sinhala Archaic Numbers'],
  [0x11200, 0x1124F, 'Khojki'],
  [0x11280, 0x112AF, 'Multani'],
  [0x112B0, 0x112FF, 'Khudawadi'],
  [0x11300, 0x1137F, 'Grantha'],
  [0x11400, 0x1147F, 'Newa'],
  [0x11480, 0x114DF, 'Tirhuta'],
  [0x11580, 0x115FF, 'Siddham'],
  [0x11600, 0x1165F, 'Modi'],
  [0x11660, 0x1167F, 'Mongolian Supplement'],
  [0x11680, 0x116CF, 'Takri'],
  [0x11700, 0x1173F, 'Ahom'],
  [0x11800, 0x1184F, 'Dogra'],
  [0x118A0, 0x118FF, 'Warang Citi'],
  [0x11900, 0x1195F, 'Dives Akur'],
  [0x119A0, 0x119FF, 'Nandinagari'],
  [0x11A00, 0x11A4F, 'Zanabazar Square'],
  [0x11A50, 0x11AAF, 'Soyombo'],
  [0x11AC0, 0x11AFF, 'Pau Cin Ha'],
  [0x11C00, 0x11C6F, 'Bhaiksuki'],
  [0x11C70, 0x11CBF, 'Marchen'],
  [0x11D00, 0x11D5F, 'Masaram Gondi'],
  [0x11D60, 0x11DAF, 'Gunjala Gondi'],
  [0x11EE0, 0x11EFF, 'Makasar'],
  [0x11FB0, 0x11FBF, 'Lisu Supplement'],
  [0x11FC0, 0x11FFF, 'Tamil Supplement'],
  [0x12000, 0x123FF, 'Cuneiform'],
  [0x12400, 0x1247F, 'Cuneiform Numbers and Punctuation'],
  [0x12480, 0x1254F, 'Early Dynastic Cuneiform'],
  [0x13000, 0x1342F, 'Egyptian Hieroglyphs'],
  [0x13430, 0x1343F, 'Egyptian Hieroglyph Format Controls'],
  [0x14400, 0x1467F, 'Anatolian Hieroglyphs'],
  [0x16800, 0x16A3F, 'Bamum Supplement'],
  [0x16A40, 0x16A6F, 'Mro'],
  [0x16AD0, 0x16AFF, 'Bassa Vah'],
  [0x16B00, 0x16B8F, 'Pahawh Hmong'],
  [0x16E40, 0x16E9F, 'Medefaidrin'],
  [0x16F00, 0x16F9F, 'Miao'],
  [0x16FE0, 0x16FFF, 'Ideographic Symbols and Punctuation'],
  [0x17000, 0x187FF, 'Tangut'],
  [0x18800, 0x18AFF, 'Tangut Components'],
  [0x18B00, 0x18CFF, 'Khitan Small Script'],
  [0x18D00, 0x18D8F, 'Tangut Supplement'],
  [0x1B000, 0x1B0FF, 'Kana Supplement'],
  [0x1B100, 0x1B12F, 'Kana Extended-A'],
  [0x1B130, 0x1B16F, 'Small Kana Extension'],
  [0x1B170, 0x1B2FF, 'Nush'],
  [0x1BC00, 0x1BC9F, 'Duployan'],
  [0x1BCA0, 0x1BCAF, 'Shorthand Format Controls'],
  [0x1D000, 0x1D0FF, 'Byzantine Musical Symbols'],
  [0x1D100, 0x1D1FF, 'Musical Symbols'],
  [0x1D200, 0x1D24F, 'Ancient Greek Musical Notation'],
  [0x1D2E0, 0x1D2FF, 'Mayan Numerals'],
  [0x1D300, 0x1D35F, 'Tai Xuan Jing Symbols'],
  [0x1D360, 0x1D37F, 'Counting Rod Numerals'],
  [0x1D400, 0x1D7FF, 'Mathematical Alphanumeric Symbols'],
  [0x1D800, 0x1DAAF, 'Sutton SignWriting'],
  [0x1E000, 0x1E02F, 'Glagolitic Supplement'],
  [0x1E100, 0x1E14F, 'Nyiakeng Puachue Hmong'],
  [0x1E2C0, 0x1E2FF, 'Wancho'],
  [0x1E800, 0x1E8DF, 'Mende Kikakui'],
  [0x1E900, 0x1E95F, 'Adlam'],
  [0x1EC70, 0x1ECBF, 'Indic Siyaq Numbers'],
  [0x1ED00, 0x1ED4F, 'Ottoman Siyaq Numbers'],
  [0x1EE00, 0x1EEFF, 'Arabic Mathematical Alphabetic Symbols'],
  [0x1F000, 0x1F02F, 'Mahjong Tiles'],
  [0x1F030, 0x1F09F, 'Domino Tiles'],
  [0x1F0A0, 0x1F0FF, 'Playing Cards'],
  [0x1F100, 0x1F1FF, 'Enclosed Alphanumeric Supplement'],
  [0x1F200, 0x1F2FF, 'Enclosed Ideographic Supplement'],
  [0x1F300, 0x1F5FF, 'Miscellaneous Symbols and Pictographs'],
  [0x1F600, 0x1F64F, 'Emoticons'],
  [0x1F650, 0x1F67F, 'Ornamental Dingbats'],
  [0x1F680, 0x1F6FF, 'Transport and Map Symbols'],
  [0x1F700, 0x1F77F, 'Alchemical Symbols'],
  [0x1F780, 0x1F7FF, 'Geometric Shapes Extended'],
  [0x1F800, 0x1F8FF, 'Supplemental Arrows-C'],
  [0x1F900, 0x1F9FF, 'Supplemental Symbols and Pictographs'],
  [0x1FA00, 0x1FA6F, 'Chess Symbols'],
  [0x1FA70, 0x1FAFF, 'Symbols and Pictographs Extended-A'],
  [0x1FB00, 0x1FBFF, 'Symbols for Legacy Computing'],
  [0x20000, 0x2A6DF, 'CJK Unified Ideographs Extension B'],
  [0x2A700, 0x2B73F, 'CJK Unified Ideographs Extension C'],
  [0x2B740, 0x2B81F, 'CJK Unified Ideographs Extension D'],
  [0x2B820, 0x2CEAF, 'CJK Unified Ideographs Extension E'],
  [0x2CEB0, 0x2EBEF, 'CJK Unified Ideographs Extension F'],
  [0x2F800, 0x2FA1F, 'CJK Compatibility Ideographs Supplement'],
  [0x30000, 0x3134F, 'CJK Unified Ideographs Extension G'],
  [0xE0000, 0xE007F, 'Tags'],
  [0xE0100, 0xE01EF, 'Variation Selectors Supplement'],
  [0xF0000, 0xFFFFF, 'Supplementary Private Use Area-A'],
  [0x100000, 0x10FFFF, 'Supplementary Private Use Area-B'],
];

/** Index of the block that holds code point cp, or -1. Binary search. */
function blockIndex(cp) {
  let lo = 0, hi = BLOCKS.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < BLOCKS[mid][0]) hi = mid - 1;
    else if (cp > BLOCKS[mid][1]) lo = mid + 1;
    else return mid;
  }
  return -1;
}

module.exports = { BLOCKS, blockIndex };

return module.exports; })();
M["font"] = (() => { const module = { exports: {} }, exports = module.exports;

// Opens any supported font file into a plain sfnt plus metadata, and serves glyph pages.
const opentype = require('opentype.js');
const { FontError, detect, ttcOffsets, extractTtc, decodeWoff, readDirectory, tableData } = require('./sfnt');
const { decodeWoff2 } = require('./woff2');
const { readInfo, parseName } = require('./info');

const FORMAT_LABEL = { ttf: 'TrueType', otf: 'OpenType (CFF)', woff: 'WOFF', woff2: 'WOFF2', ttc: 'TrueType Collection' };
const MIME = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', ttc: 'font/collection' };
const CSS_FORMAT = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2', ttc: 'collection' };

/** Names of the faces in a TTC, for the face picker. */
function ttcFaceNames(buf) {
  return ttcOffsets(buf).map((off, i) => {
    try {
      const dir = readDirectory(buf, off);
      const n = parseName(tableData(buf, dir, 'name')).byId;
      return n[4] || [n[1], n[2]].filter(Boolean).join(' ') || `Font ${i + 1}`;
    } catch (e) {
      return `Font ${i + 1} (damaged)`;
    }
  });
}

/**
 * Opens a font file.
 * @param {Buffer} buf whole file
 * @param {{face?:number, maxBytes?:number}} [opts]
 */
function openFont(buf, opts = {}) {
  const format = detect(buf);
  if (!format) {
    const head = buf.subarray(0, 64).toString('latin1');
    if (/^\s*</.test(head)) throw new FontError('This file is text or XML, not a binary font. SVG fonts and .ttx files are not supported.', 'not-font');
    throw new FontError('This file does not start with a TrueType, OpenType, WOFF, WOFF2 or TTC signature, so it is not a font Font Viewer can read.', 'not-font');
  }
  let sfnt, faces = null, face = 0;
  const limits = { maxBytes: opts.maxBytes };
  if (format === 'woff') sfnt = decodeWoff(buf, limits);
  else if (format === 'woff2') sfnt = decodeWoff2(buf, limits);
  else if (format === 'ttc') {
    faces = ttcFaceNames(buf);
    face = Math.min(Math.max(0, opts.face | 0), faces.length - 1);
    sfnt = extractTtc(buf, face);
  } else sfnt = buf;
  const { info, cmap } = readInfo(sfnt);
  let ot = null, otError = null;
  if (info.outlines !== 'CFF2' && info.outlines !== 'none') {
    try {
      const ab = sfnt.buffer.slice(sfnt.byteOffset, sfnt.byteOffset + sfnt.byteLength);
      ot = opentype.parse(ab, { lowMemory: true });
    } catch (e) {
      otError = String((e && e.message) || e).slice(0, 200);
    }
  } else if (info.outlines === 'CFF2') otError = 'CFF2 outlines are drawn by the font itself in the type tester, not as glyph outlines.';
  info.format = format;
  info.formatLabel = FORMAT_LABEL[format];
  info.fileSize = buf.length;
  info.faces = faces;
  info.face = face;
  info.outlineError = otError;
  // The webview loads the face with the FontFace API. A TTC face is sent as its own sfnt.
  const webBytes = format === 'ttc' ? sfnt : buf;
  return new OpenedFont({ format, sfnt, info, cmap, ot, webBytes });
}

class OpenedFont {
  constructor(p) {
    Object.assign(this, p);
    // glyph id -> code points
    this.glyphCps = new Map();
    for (const [cp, g] of this.cmap) {
      const a = this.glyphCps.get(g);
      if (a) a.push(cp); else this.glyphCps.set(g, [cp]);
    }
    this._names = null;
  }

  get numGlyphs() {
    return this.ot ? this.ot.numGlyphs : this.info.numGlyphs;
  }

  glyphName(id) {
    if (this.ot) {
      try {
        const g = this.ot.glyphs.get(id);
        if (g && g.name) return String(g.name);
      } catch (e) { /* fall through */ }
    }
    const cps = this.glyphCps.get(id);
    if (cps && cps.length) return 'uni' + cps[0].toString(16).toUpperCase().padStart(4, '0');
    return id === 0 ? '.notdef' : `glyph${id}`;
  }

  /** All glyph names (computed once, for search). */
  names() {
    if (!this._names) {
      this._names = [];
      for (let i = 0; i < this.numGlyphs; i++) this._names.push(this.glyphName(i));
    }
    return this._names;
  }

  /** One glyph for the grid or the detail panel. */
  glyph(id, withPath = true) {
    const cps = (this.glyphCps.get(id) || []).slice().sort((a, b) => a - b);
    const out = { id, name: this.glyphName(id), cps, adv: null, d: null };
    if (this.ot) {
      try {
        const g = this.ot.glyphs.get(id);
        out.adv = g.advanceWidth != null ? Math.round(g.advanceWidth) : null;
        if (withPath) {
          // Font units with y flipped (SVG y goes down), baseline at y = 0.
          const p = g.getPath(0, 0, this.info.unitsPerEm);
          out.d = p.toPathData(1);
          if (out.d.length > 200000) out.d = null; // pathological glyphs are drawn from the font instead
        }
      } catch (e) {
        out.d = null;
      }
    }
    return out;
  }

  /**
   * Glyph ids matching a query. Query forms: empty (all), a glyph name part, "U+0041", "0x41", "#65" (glyph id),
   * or one typed character.
   */
  search(query, cap = 100000) {
    const q = String(query || '').trim();
    const n = this.numGlyphs;
    if (!q) return { ids: null, total: n };
    const ids = [];
    const seen = new Set();
    const add = (id) => { if (id >= 0 && id < n && !seen.has(id)) { seen.add(id); ids.push(id); } };
    const cpm = /^(?:u\+|0x)([0-9a-f]{1,6})$/i.exec(q);
    const gid = /^#(\d{1,6})$/.exec(q);
    if (cpm) {
      const cp = parseInt(cpm[1], 16);
      if (this.cmap.has(cp)) add(this.cmap.get(cp));
    } else if (gid) add(parseInt(gid[1], 10));
    else {
      const chars = [...q];
      if (chars.length <= 2) for (const ch of chars) { const g = this.cmap.get(ch.codePointAt(0)); if (g != null) add(g); }
      const ql = q.toLowerCase();
      const names = this.names();
      for (let i = 0; i < n && ids.length < cap; i++) if (names[i].toLowerCase().includes(ql)) add(i);
      if (/^[0-9a-f]{4,6}$/i.test(q)) {
        const cp = parseInt(q, 16);
        if (this.cmap.has(cp)) add(this.cmap.get(cp));
      }
    }
    return { ids, total: ids.length };
  }

  /** A page of glyphs for the grid. */
  page(query, offset, limit) {
    const s = this.search(query);
    const lim = Math.max(1, Math.min(limit | 0 || 200, 1000));
    const off = Math.max(0, offset | 0);
    const ids = s.ids ? s.ids.slice(off, off + lim) : Array.from({ length: Math.max(0, Math.min(lim, s.total - off)) }, (_, i) => off + i);
    return { total: s.total, offset: off, items: ids.map((id) => this.glyph(id)) };
  }

  /** Coverage per Unicode block, and the covered code points of one block. */
  blocks() {
    const { BLOCKS, blockIndex } = require('./blocks');
    const counts = new Map();
    let other = 0;
    for (const cp of this.cmap.keys()) {
      const i = blockIndex(cp);
      if (i < 0) other++;
      else counts.set(i, (counts.get(i) || 0) + 1);
    }
    const list = [...counts].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({ index: i, name: BLOCKS[i][2], start: BLOCKS[i][0], end: BLOCKS[i][1], covered: c, size: BLOCKS[i][1] - BLOCKS[i][0] + 1 }));
    return { list, other };
  }

  blockChars(index, cap = 4096) {
    const { BLOCKS } = require('./blocks');
    const b = BLOCKS[index];
    if (!b) return { index, start: 0, end: -1, cells: [] };
    const cells = [];
    for (let cp = b[0]; cp <= b[1] && cells.length < cap; cp++) {
      const g = this.cmap.get(cp);
      cells.push(g == null ? [cp, -1] : [cp, g]);
    }
    return { index, name: b[2], start: b[0], end: b[1], cells };
  }
}

/** unicode-range value from the cmap, as compact ranges. */
function unicodeRange(cps, maxRanges = 60) {
  const sorted = [...cps].sort((a, b) => a - b);
  const ranges = [];
  for (const c of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && c === last[1] + 1) last[1] = c;
    else ranges.push([c, c]);
  }
  // Merge the closest neighbours until the list is short enough.
  while (ranges.length > maxRanges) {
    let bi = 0, bg = Infinity;
    for (let i = 0; i + 1 < ranges.length; i++) {
      const gap = ranges[i + 1][0] - ranges[i][1];
      if (gap < bg) { bg = gap; bi = i; }
    }
    ranges[bi][1] = ranges[bi + 1][1];
    ranges.splice(bi + 1, 1);
  }
  const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
  return ranges.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(', ');
}

function cssString(s) {
  return '"' + String(s).replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, ' ') + '"';
}

/** CSS @font-face snippet for this font. */
function fontFaceCss(info, fileName, cmapKeys) {
  const family = info.family || info.postscriptName || 'My Font';
  const lines = ['@font-face {', `  font-family: ${cssString(family)};`];
  const fmt = CSS_FORMAT[info.format] || 'truetype';
  const varSuffix = info.axes && info.axes.length && info.format !== 'ttc' ? '-variations' : '';
  lines.push(`  src: url(${cssString('./' + fileName)}) format(${cssString(fmt + varSuffix)});`);
  const ax = (tag) => (info.axes || []).find((a) => a.tag === tag);
  const w = ax('wght');
  lines.push(`  font-weight: ${w ? `${Math.round(w.min)} ${Math.round(w.max)}` : info.weightClass || 400};`);
  const wd = ax('wdth');
  if (wd) lines.push(`  font-stretch: ${wd.min}% ${wd.max}%;`);
  const sl = ax('slnt');
  if (sl) lines.push(`  font-style: oblique ${-sl.max}deg ${-sl.min}deg;`);
  else lines.push(`  font-style: ${info.italic ? 'italic' : 'normal'};`);
  lines.push('  font-display: swap;');
  if (cmapKeys && cmapKeys.size) lines.push(`  unicode-range: ${unicodeRange(cmapKeys.keys ? cmapKeys.keys() : cmapKeys)};`);
  lines.push('}');
  return lines.join('\n');
}

module.exports = { openFont, OpenedFont, unicodeRange, fontFaceCss, cssString, FORMAT_LABEL, MIME, CSS_FORMAT, ttcFaceNames, FontError };

return module.exports; })();
self.ZovoFont = Object.assign({ Buffer }, M.font, { NAME_LABELS: M.info.NAME_LABELS, BLOCKS: M.blocks.BLOCKS, blockIndex: M.blocks.blockIndex });
})();
