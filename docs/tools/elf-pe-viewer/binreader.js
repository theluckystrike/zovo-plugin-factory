/* ELF, PE and Mach-O reader for the ELF and PE Viewer page (TOOLCHK, wave18). Built by sprint/tools/bundle_elfpe.py from
   the ELF Viewer & PE Viewer extension (src/core, MIT, Zovo). It reads bytes only: nothing here runs code from a binary. */
'use strict';
(() => {
const fsStub = { openSync() { throw new Error('not in a browser'); }, readSync() {}, fstatSync() {}, closeSync() {} };
const M = {}, require = n => n === "fs" ? fsStub : M[n.replace(/^\.\//, "")];
M["bytes"] = (() => { const module = { exports: {} }, exports = module.exports;

// Pure byte helpers shared by the extension host and the webview: offsets, search patterns, copy formats,
// the data inspector, text-column encodings and file-type detection. No vscode, no fs, no DOM.

const HEX = '0123456789abcdef';
const HEXU = '0123456789ABCDEF';

function hex2(b) { return HEXU[b >> 4] + HEXU[b & 15]; }

/** Offset as upper-case hex with at least `width` digits (no prefix). */
function hexOffset(n, width = 8) {
  const s = Math.floor(n).toString(16).toUpperCase();
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

function fmtSize(n) {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n < 1024) return `${n} byte${n === 1 ? '' : 's'}`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${u[i]}`;
}

function fmtInt(n) { return Math.floor(n).toLocaleString('en-US'); }

/**
 * Parse a "Go to offset" entry. Accepts 0x1F, 1Fh, $1F, #1F (hex), 1234 (decimal), a leading + or - for a
 * jump relative to `current`, and "end" or "end-16". Spaces and underscores are ignored.
 * Returns { ok: true, offset } clamped to [0, size - 1] (0 for an empty file), or { ok: false, error }.
 */
function parseOffset(input, current, size) {
  let s = String(input == null ? '' : input).trim().toLowerCase().replace(/[\s_]/g, '');
  if (!s) return { ok: false, error: 'Type an offset, for example 0x1F40, 8000 or +0x100.' };
  let base = 0, sign = 0;
  const end = /^end(?:([+-])(.+))?$/.exec(s);
  if (end) {
    base = Math.max(0, size - 1);
    if (!end[1]) return { ok: true, offset: base };
    sign = end[1] === '+' ? 1 : -1; s = end[2];
  } else if (s[0] === '+' || s[0] === '-') {
    sign = s[0] === '+' ? 1 : -1; base = current || 0; s = s.slice(1);
  }
  let v;
  if (/^0x[0-9a-f]+$/.test(s)) v = parseInt(s.slice(2), 16);
  else if (/^[$#][0-9a-f]+$/.test(s)) v = parseInt(s.slice(1), 16);
  else if (/^[0-9a-f]+h$/.test(s)) v = parseInt(s.slice(0, -1), 16);
  else if (/^\d+$/.test(s)) v = parseInt(s, 10);
  else if (/^[0-9a-f]*[a-f][0-9a-f]*$/.test(s)) v = parseInt(s, 16); // plain hex digits with a letter: 1f40
  else return { ok: false, error: `"${input}" is not an offset. Use hex (0x1F40) or decimal (8000).` };
  if (!Number.isSafeInteger(v)) return { ok: false, error: 'That offset is too large.' };
  let off = sign ? base + sign * v : v;
  if (size <= 0) return { ok: true, offset: 0 };
  if (off < 0) off = 0;
  if (off > size - 1) return { ok: false, error: `Offset ${hexOffset(off, 1)}h is past the end of the file (last byte at ${hexOffset(size - 1, 1)}h).`, offset: size - 1 };
  return { ok: true, offset: off };
}

/** UTF-8 bytes of a JS string (works where TextEncoder exists and in Node). */
function utf8(s) { return new TextEncoder().encode(s); }

function utf16le(s) {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); out[2 * i] = c & 255; out[2 * i + 1] = c >> 8; }
  return out;
}

/**
 * Turn a search entry into bytes. mode: 'hex' | 'text' | 'utf16'.
 * Hex accepts "4A 5B", "4a5b", "0x4A,0x5B" and ?? (or ?) as a one-byte wildcard.
 * Text is UTF-8 (plain ASCII matches ASCII and Latin-1 files too). ignoreCase applies to A-Z only.
 * Returns { ok, bytes, mask } where mask[i] = 0 marks a wildcard byte, or { ok: false, error }.
 */
function parsePattern(query, mode, ignoreCase) {
  const q = String(query == null ? '' : query);
  if (!q) return { ok: false, error: 'Type something to search for.' };
  if (mode === 'hex') {
    const t = q.replace(/0x/gi, ' ').replace(/[,;:\-\s]+/g, ' ').trim();
    const toks = [];
    for (const part of t.split(' ')) {
      if (!part) continue;
      if (/^\?{1,2}$/.test(part)) { toks.push(null); continue; }
      if (!/^[0-9a-fA-F?]+$/.test(part)) return { ok: false, error: `"${part}" is not hex. Use pairs like 4A 5B, and ?? for any byte.` };
      if (/^\?+$/.test(part)) { for (let i = 0; i < part.length; i += 2) toks.push(null); continue; }
      if (part.length % 2) return { ok: false, error: `"${part}" has an odd number of hex digits.` };
      for (let i = 0; i < part.length; i += 2) {
        const pr = part.slice(i, i + 2);
        if (pr === '??') toks.push(null);
        else if (/\?/.test(pr)) return { ok: false, error: 'A wildcard covers a whole byte: use ??.' };
        else toks.push(parseInt(pr, 16));
      }
    }
    if (!toks.length) return { ok: false, error: 'Type hex bytes, for example 50 4B 03 04.' };
    if (toks.every(x => x === null)) return { ok: false, error: 'The pattern needs at least one byte that is not ??.' };
    if (toks.length > 4096) return { ok: false, error: 'The pattern is longer than 4,096 bytes.' };
    const bytes = new Uint8Array(toks.map(x => (x === null ? 0 : x)));
    const mask = toks.some(x => x === null) ? new Uint8Array(toks.map(x => (x === null ? 0 : 1))) : null;
    return { ok: true, bytes, mask, ignoreCase: false };
  }
  const bytes = mode === 'utf16' ? utf16le(q) : utf8(q);
  if (bytes.length > 4096) return { ok: false, error: 'The text is longer than 4,096 bytes.' };
  return { ok: true, bytes, mask: null, ignoreCase: !!ignoreCase };
}

function lowerAscii(b) { return b >= 65 && b <= 90 ? b + 32 : b; }

function matchesAt(buf, i, pat, mask, ic) {
  for (let k = 0; k < pat.length; k++) {
    if (mask && !mask[k]) continue;
    const b = ic ? lowerAscii(buf[i + k]) : buf[i + k];
    if (b !== pat[k]) return false;
  }
  return true;
}

/** Prepared pattern: lower-cased when ignoreCase, with the anchor (longest fixed run) for fast scans. */
function preparePattern(p) {
  const pat = p.ignoreCase ? Uint8Array.from(p.bytes, lowerAscii) : p.bytes;
  return { pat, mask: p.mask, ic: !!p.ignoreCase, len: pat.length };
}

/**
 * First match at index >= from in buf[0 .. limit) whose full pattern fits in buf. Returns -1 when none.
 * A plain scan; fine for 1 MB chunks (the host uses Buffer.indexOf when it can).
 */
function findForward(buf, pp, from, limit = buf.length) {
  const { pat, mask, ic, len } = pp;
  const last = Math.min(limit, buf.length) - len;
  const first = mask ? mask.indexOf(1) : 0;
  const fb = pat[first];
  for (let i = Math.max(0, from); i <= last; i++) {
    const b = ic ? lowerAscii(buf[i + first]) : buf[i + first];
    if (b === fb && matchesAt(buf, i, pat, mask, ic)) return i;
  }
  return -1;
}

/** Last match starting at index <= from (and >= lowest). Returns -1 when none. */
function findBackward(buf, pp, from, lowest = 0) {
  const { pat, mask, ic, len } = pp;
  for (let i = Math.min(from, buf.length - len); i >= Math.max(0, lowest); i--) if (matchesAt(buf, i, pat, mask, ic)) return i;
  return -1;
}

const COPY_FORMATS = [
  ['hex', 'Hex (4A5B)'],
  ['hexSpaced', 'Hex with spaces (4A 5B)'],
  ['c', 'C array'],
  ['python', 'Python bytes'],
  ['base64', 'Base64'],
  ['text', 'Text (UTF-8)'],
  ['latin1', 'Text (Latin-1)'],
];

function base64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Text for the clipboard. format is one of COPY_FORMATS. name is used for the C array name. */
function formatCopy(bytes, format, name) {
  const n = bytes.length;
  switch (format) {
    case 'hex': { let s = ''; for (let i = 0; i < n; i++) s += hex2(bytes[i]); return s; }
    case 'hexSpaced': {
      const rows = [];
      for (let i = 0; i < n; i += 16) { const r = []; for (let k = i; k < Math.min(n, i + 16); k++) r.push(hex2(bytes[k])); rows.push(r.join(' ')); }
      return rows.join('\n');
    }
    case 'c': {
      const id = String(name || 'data').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'data';
      const rows = [];
      for (let i = 0; i < n; i += 12) { const r = []; for (let k = i; k < Math.min(n, i + 12); k++) r.push('0x' + hex2(bytes[k])); rows.push('  ' + r.join(', ')); }
      return `unsigned char ${id}[${n}] = {\n${rows.join(',\n')}\n};`;
    }
    case 'python': {
      let s = "b'";
      for (let i = 0; i < n; i++) s += '\\x' + HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
      return s + "'";
    }
    case 'base64': return base64(bytes);
    case 'text': return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '');
    case 'latin1': { let s = ''; for (let i = 0; i < n; i++) s += bytes[i] ? String.fromCharCode(bytes[i]) : ''; return s; }
    default: throw new Error('unknown copy format ' + format);
  }
}

/** Parse pasted text as hex bytes (spaces, commas, 0x and \x prefixes allowed). Returns Uint8Array or null. */
function parseHexPaste(text) {
  const t = String(text || '').replace(/0x|\\x/gi, ' ').replace(/[,;\s{}\[\]]+/g, '');
  if (!t || t.length % 2 || !/^[0-9a-fA-F]+$/.test(t)) return null;
  const out = new Uint8Array(t.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(t.substr(2 * i, 2), 16);
  return out;
}

// ---- data inspector ----

function guid(b) {
  const h = i => hex2(b[i]);
  return `{${h(3)}${h(2)}${h(1)}${h(0)}-${h(5)}${h(4)}-${h(7)}${h(6)}-${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}}`;
}

function leb128(b, signed) {
  let result = 0n, shift = 0n, i = 0, byte = 0;
  do {
    if (i >= b.length || i >= 10) return null;
    byte = b[i++];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
  } while (byte & 0x80);
  if (signed && (byte & 0x40)) result -= 1n << shift;
  return { value: result, length: i };
}

function isoTime(ms) {
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return 'out of range';
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

function float16(v) {
  const s = v >> 15 ? -1 : 1, e = (v >> 10) & 31, f = v & 1023;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

function num(x) {
  if (typeof x === 'bigint') return x.toString();
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'Infinity' : '-Infinity';
  if (x !== 0 && (Math.abs(x) < 1e-6 || Math.abs(x) >= 1e15)) return x.toExponential(7);
  return String(+x.toPrecision(9));
}

/**
 * Data inspector rows for the bytes at `offset`. b holds up to 16 bytes from the offset (fewer at the end of
 * the file). Each row: [label, value]. A value is '' when there are not enough bytes.
 */
function inspect(b, offset, littleEndian) {
  const le = !!littleEndian;
  const n = b.length;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const has = k => n >= k;
  const rows = [];
  rows.push(['Offset', `0x${hexOffset(offset, 1)} (${fmtInt(offset)})`]);
  if (!n) return rows;
  rows.push(['Binary', b[0].toString(2).padStart(8, '0')]);
  rows.push(['Octal', '0o' + b[0].toString(8)]);
  rows.push(['uint8', String(dv.getUint8(0))]);
  rows.push(['int8', String(dv.getInt8(0))]);
  rows.push(['uint16', has(2) ? String(dv.getUint16(0, le)) : '']);
  rows.push(['int16', has(2) ? String(dv.getInt16(0, le)) : '']);
  rows.push(['uint24', has(3) ? String(le ? b[0] | (b[1] << 8) | (b[2] << 16) : (b[0] << 16) | (b[1] << 8) | b[2]) : '']);
  rows.push(['uint32', has(4) ? String(dv.getUint32(0, le)) : '']);
  rows.push(['int32', has(4) ? String(dv.getInt32(0, le)) : '']);
  rows.push(['uint64', has(8) ? dv.getBigUint64(0, le).toString() : '']);
  rows.push(['int64', has(8) ? dv.getBigInt64(0, le).toString() : '']);
  rows.push(['float16', has(2) ? num(float16(dv.getUint16(0, le))) : '']);
  rows.push(['float32', has(4) ? num(dv.getFloat32(0, le)) : '']);
  rows.push(['float64', has(8) ? num(dv.getFloat64(0, le)) : '']);
  const u = leb128(b, false), s = leb128(b, true);
  rows.push(['ULEB128', u ? `${u.value} (${u.length} byte${u.length > 1 ? 's' : ''})` : '']);
  rows.push(['SLEB128', s ? `${s.value} (${s.length} byte${s.length > 1 ? 's' : ''})` : '']);
  rows.push(['Unix time 32', has(4) ? isoTime(dv.getUint32(0, le) * 1000) : '']);
  rows.push(['Unix time 64', has(8) ? (() => { const v = dv.getBigInt64(0, le); return v > 253402300799n || v < -62135596800n ? 'out of range' : isoTime(Number(v) * 1000); })() : '']);
  rows.push(['Windows FILETIME', has(8) ? (() => { const v = dv.getBigUint64(0, le); if (v === 0n || v > 2650467743999999999n) return 'out of range'; return isoTime(Number(v / 10000n) - 11644473600000); })() : '']);
  rows.push(['GUID', has(16) ? guid(b) : '']);
  let ch = '';
  try {
    const len = b[0] < 0x80 ? 1 : b[0] >= 0xf0 ? 4 : b[0] >= 0xe0 ? 3 : b[0] >= 0xc0 ? 2 : 0;
    if (len && has(len)) {
      const t = new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, len));
      const cp = t.codePointAt(0);
      ch = `${cp < 32 || cp === 127 ? '(control)' : t} U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    } else ch = 'not a UTF-8 start byte';
  } catch { ch = 'not valid UTF-8'; }
  rows.push(['UTF-8 char', ch]);
  if (has(2)) {
    const cu = dv.getUint16(0, le);
    rows.push(['UTF-16 char', cu >= 0xd800 && cu <= 0xdfff ? `surrogate U+${cu.toString(16).toUpperCase()}` : `${cu < 32 ? '(control)' : String.fromCharCode(cu)} U+${cu.toString(16).toUpperCase().padStart(4, '0')}`]);
  } else rows.push(['UTF-16 char', '']);
  return rows;
}

// ---- text column ----

const EBCDIC = "\u0000\u0001\u0002\u0003\u009c\t\u0086\u007f\u0097\u008d\u008e\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u009d\u0085\b\u0087\u0018\u0019\u0092\u008f\u001c\u001d\u001e\u001f\u0080\u0081\u0082\u0083\u0084\n\u0017\u001b\u0088\u0089\u008a\u008b\u008c\u0005\u0006\u0007\u0090\u0091\u0016\u0093\u0094\u0095\u0096\u0004\u0098\u0099\u009a\u009b\u0014\u0015\u009e\u001a  âäàáãåçñ¢.<(+|&éêëèíîïìß!$*);¬-/ÂÄÀÁÃÅÇÑ¦,%_>?øÉÊËÈÍÎÏÌ`:#@'=\"Øabcdefghi«»ðýþ±°jklmnopqrªºæ¸Æ¤µ~stuvwxyz¡¿ÐÝÞ®^£¥·©§¶¼½¾[]¯¨´×{ABCDEFGHI­ôöòóõ}JKLMNOPQR¹ûüùúÿ\\÷STUVWXYZ²ÔÖÒÓÕ0123456789³ÛÜÙÚ\u009f";

const ENCODINGS = [['ascii', 'ASCII'], ['latin1', 'Latin-1'], ['utf8', 'UTF-8'], ['utf16le', 'UTF-16 LE'], ['utf16be', 'UTF-16 BE'], ['ebcdic', 'EBCDIC (CP037)']];

function isControl(cp) { return cp < 0x20 || (cp >= 0x7f && cp < 0xa0); }

function controlGlyph(cp) {
  if (cp < 0x20) return String.fromCharCode(0x2400 + cp); // ␀ .. ␟
  if (cp === 0x7f) return '␡'; // ␡
  return '·';
}

/**
 * The text-column characters for one row. bytes: the row (plus up to 3 bytes after it, for UTF-8 and UTF-16
 * characters that run past the row end). rowStart: file offset of bytes[0], used to align UTF-16 pairs.
 * count: bytes in the row. Returns an array of `count` entries: { ch, kind } where kind is
 * 'p' printable, 'c' control or non-printable, 'x' continuation byte of a multi-byte character, 'z' zero byte.
 */
function textCells(bytes, count, encoding, rowStart, glyphs) {
  const out = new Array(count);
  const ctl = cp => ({ ch: glyphs ? controlGlyph(cp) : '.', kind: cp === 0 ? 'z' : 'c' });
  if (encoding === 'utf16le' || encoding === 'utf16be') {
    const odd = rowStart % 2;
    for (let i = 0; i < count; i++) {
      if ((i + odd) % 2 === 1) { out[i] = { ch: ' ', kind: 'x' }; continue; }
      if (i + 1 >= bytes.length) { out[i] = { ch: '.', kind: 'c' }; continue; }
      const cu = encoding === 'utf16le' ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1];
      if (cu >= 0xd800 && cu <= 0xdfff) out[i] = { ch: '�', kind: 'c' };
      else if (isControl(cu)) out[i] = ctl(cu);
      else out[i] = { ch: String.fromCharCode(cu), kind: 'p' };
    }
    return out;
  }
  if (encoding === 'utf8') {
    let i = 0;
    // continuation bytes at the row start belong to a character in the row before
    while (i < count && (bytes[i] & 0xc0) === 0x80) out[i++] = { ch: ' ', kind: 'x' };
    for (; i < count; i++) {
      const b = bytes[i];
      if (b < 0x80) { out[i] = isControl(b) ? ctl(b) : { ch: String.fromCharCode(b), kind: 'p' }; continue; }
      const len = b >= 0xf0 && b < 0xf8 ? 4 : b >= 0xe0 ? 3 : b >= 0xc2 ? 2 : 0;
      let ok = len > 0 && i + len <= bytes.length;
      for (let k = 1; ok && k < len; k++) if ((bytes[i + k] & 0xc0) !== 0x80) ok = false;
      if (!ok) { out[i] = { ch: '.', kind: 'c' }; continue; }
      let cp;
      if (len === 2) cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      else if (len === 3) cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      else cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      out[i] = isControl(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? ctl(cp) : { ch: String.fromCodePoint(cp), kind: 'p' };
      for (let k = 1; k < len && i + k < count; k++) out[i + k] = { ch: ' ', kind: 'x' };
      i += len - 1;
    }
    return out;
  }
  for (let i = 0; i < count; i++) {
    const b = bytes[i];
    let cp;
    if (encoding === 'ebcdic') cp = EBCDIC.charCodeAt(b);
    else if (encoding === 'latin1') cp = b;
    else cp = b < 0x80 ? b : -1;
    if (cp < 0) out[i] = { ch: '.', kind: 'c' };
    else if (isControl(cp)) out[i] = ctl(cp);
    else out[i] = { ch: String.fromCharCode(cp), kind: 'p' };
  }
  return out;
}

/** The byte to write when a character is typed in the text column, or -1 when it has no one-byte form. */
function byteForChar(ch, encoding) {
  if (!ch || ch.length !== 1) return -1;
  const c = ch.charCodeAt(0);
  if (encoding === 'ebcdic') { const i = EBCDIC.indexOf(ch); return i >= 0x40 ? i : -1; }
  if (encoding === 'latin1') return c >= 0x20 && c <= 0xff && !(c >= 0x7f && c < 0xa0) ? c : -1;
  return c >= 0x20 && c < 0x7f ? c : -1;
}

// ---- file type ----

function startsWith(b, sig, at = 0) {
  if (b.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false;
  return true;
}

/** A short name for the file type from its first bytes, or '' when unknown. */
function detectType(b) {
  const a = s => Array.from(s, c => c.charCodeAt(0));
  if (!b || !b.length) return '';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'PNG image';
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'JPEG image';
  if (startsWith(b, a('GIF8'))) return 'GIF image';
  if (startsWith(b, a('RIFF')) && startsWith(b, a('WAVE'), 8)) return 'WAV audio';
  if (startsWith(b, a('RIFF')) && startsWith(b, a('WEBP'), 8)) return 'WebP image';
  if (startsWith(b, a('RIFF')) && startsWith(b, a('AVI '), 8)) return 'AVI video';
  if (startsWith(b, a('%PDF-'))) return 'PDF document';
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return 'ZIP archive';
  if (startsWith(b, [0x1f, 0x8b])) return 'gzip data';
  if (startsWith(b, a('7z'), 0) && startsWith(b, [0xbc, 0xaf, 0x27, 0x1c], 2)) return '7-Zip archive';
  if (startsWith(b, [0x28, 0xb5, 0x2f, 0xfd])) return 'Zstandard data';
  if (startsWith(b, a('SQLite format 3\0'))) return 'SQLite database';
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) {
    const cls = b[4] === 2 ? '64-bit' : b[4] === 1 ? '32-bit' : '';
    const end = b[5] === 1 ? 'little-endian' : b[5] === 2 ? 'big-endian' : '';
    return ['ELF', cls, end].filter(Boolean).join(' ') + ' executable';
  }
  if (startsWith(b, [0xcf, 0xfa, 0xed, 0xfe])) return 'Mach-O 64-bit executable';
  if (startsWith(b, [0xce, 0xfa, 0xed, 0xfe])) return 'Mach-O 32-bit executable';
  if (startsWith(b, [0xca, 0xfe, 0xba, 0xbe])) {
    // Java class files and Mach-O universal binaries share this magic; the class major version is >= 45.
    const v = b.length >= 8 ? (b[6] << 8) | b[7] : 0;
    return v >= 45 ? `Java class file (version ${v})` : 'Mach-O universal binary';
  }
  if (startsWith(b, a('MZ'))) return 'Windows executable (MZ/PE)';
  if (startsWith(b, [0x00, 0x61, 0x73, 0x6d])) return 'WebAssembly module';
  if (startsWith(b, a('OggS'))) return 'Ogg media';
  if (startsWith(b, a('fLaC'))) return 'FLAC audio';
  if (startsWith(b, a('ID3'))) return 'MP3 audio';
  if (b.length >= 12 && startsWith(b, a('ftyp'), 4)) return 'MP4 / QuickTime media';
  if (startsWith(b, [0xff, 0xfe])) return 'UTF-16 LE text (BOM)';
  if (startsWith(b, [0xfe, 0xff])) return 'UTF-16 BE text (BOM)';
  if (startsWith(b, [0xef, 0xbb, 0xbf])) return 'UTF-8 text (BOM)';
  if (startsWith(b, a('glTF'))) return 'GLB 3D model';
  if (startsWith(b, a('GGUF'))) return 'GGUF model';
  if (startsWith(b, [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59])) return 'NumPy array';
  if (startsWith(b, [0x89, 0x48, 0x44, 0x46])) return 'HDF5 data';
  if (startsWith(b, a('BM'))) return 'BMP image';
  if (startsWith(b, a('II*\0')) || startsWith(b, a('MM\0*'))) return 'TIFF image';
  return '';
}

module.exports = {
  hex2, hexOffset, fmtSize, fmtInt, parseOffset, parsePattern, preparePattern, findForward, findBackward, matchesAt, lowerAscii,
  COPY_FORMATS, formatCopy, parseHexPaste, inspect, guid, leb128, float16, ENCODINGS, EBCDIC, textCells, byteForChar, detectType, utf16le,
};

return module.exports; })();
M["source"] = (() => { const module = { exports: {} }, exports = module.exports;

// Bounded random access to the bytes of a binary. Every read checks its range: a read past the end throws Trunc,
// which the parsers catch per table, so a cut or hostile file gives a warning and the rest of the structure.
// A file source reads 64 KB blocks with a small cache, so a 500 MB file costs only the blocks a parser touches.
// No vscode here: the parsers run in a worker thread and in plain Node tests.
const fs = require('fs');

const BLOCK = 1 << 16;
const MAX_BLOCKS = 256; // 16 MB of cache at most

class Trunc extends Error {
  constructor(off, n, size) {
    super(`needs ${n} byte${n === 1 ? '' : 's'} at 0x${Math.max(0, off).toString(16)}, past the end of the data (0x${size.toString(16)})`);
    this.name = 'Trunc';
  }
}

class Source {
  /** readBlock(k) returns the bytes of block k (BLOCK bytes, shorter at the end). base/limit make a window (fat slices). */
  constructor(size, readBlock, base = 0, limit = size) {
    this.total = size;
    this.base = base;
    this.size = Math.max(0, Math.min(limit, size - base));
    this.readBlock = readBlock;
    this.cache = new Map();
    this.reads = 0;
  }

  static fromBuffer(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const s = new Source(b.length, null);
    s.buf = b;
    return s;
  }

  static fromFile(file) {
    const fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const s = new Source(size, (k) => {
      const len = Math.min(BLOCK, size - k * BLOCK);
      const out = Buffer.alloc(Math.max(0, len));
      let got = 0;
      while (got < len) {
        const n = fs.readSync(fd, out, got, len - got, k * BLOCK + got);
        if (n <= 0) break;
        got += n;
      }
      return new Uint8Array(out.buffer, out.byteOffset, got);
    });
    s.fd = fd;
    return s;
  }

  close() { if (this.fd !== undefined) { try { fs.closeSync(this.fd); } catch { /* already closed */ } this.fd = undefined; } }

  /** A window of this source: offsets inside it start at 0 (used for the slices of a universal Mach-O). */
  slice(off, len) {
    const s = new Source(this.total, this.readBlock, this.base + off, Math.min(len, this.size - off));
    s.buf = this.buf; s.cache = this.cache; s.parent = this;
    return s;
  }

  check(off, n) {
    if (!Number.isSafeInteger(off) || off < 0 || n < 0 || off + n > this.size) throw new Trunc(Number.isSafeInteger(off) ? off : -1, n, this.size);
  }

  block(k) {
    if (this.parent) return this.parent.block(k);
    let b = this.cache.get(k);
    if (b) { this.cache.delete(k); this.cache.set(k, b); return b; }
    this.reads++;
    b = this.readBlock(k);
    this.cache.set(k, b);
    if (this.cache.size > MAX_BLOCKS) this.cache.delete(this.cache.keys().next().value);
    return b;
  }

  /** Exactly n bytes at off (throws Trunc when they are not all there). */
  bytes(off, n) {
    this.check(off, n);
    const a = this.base + off;
    if (this.buf) return this.buf.subarray(a, a + n);
    const k0 = Math.floor(a / BLOCK), k1 = Math.floor((a + n - 1) / BLOCK);
    if (n === 0) return new Uint8Array(0);
    if (k0 === k1) { const b = this.block(k0); const s = a - k0 * BLOCK; return b.subarray(s, s + n); }
    const out = new Uint8Array(n);
    let got = 0;
    for (let k = k0; k <= k1 && got < n; k++) {
      const b = this.block(k);
      const s = k === k0 ? a - k0 * BLOCK : 0;
      const take = Math.min(b.length - s, n - got);
      if (take <= 0) break;
      out.set(b.subarray(s, s + take), got);
      got += take;
    }
    return out;
  }

  /** Up to n bytes at off (shorter at the end, empty past it). */
  bytesUpTo(off, n) {
    if (!Number.isSafeInteger(off) || off < 0 || off >= this.size) return new Uint8Array(0);
    return this.bytes(off, Math.min(n, this.size - off));
  }

  u8(off) { return this.bytes(off, 1)[0]; }
  u16(off, le) { const b = this.bytes(off, 2); return le ? b[0] | (b[1] << 8) : (b[0] << 8) | b[1]; }
  u32(off, le) { const b = this.bytes(off, 4); return le ? (b[0] | (b[1] << 8) | (b[2] << 16)) + b[3] * 0x1000000 : b[0] * 0x1000000 + ((b[1] << 16) | (b[2] << 8) | b[3]); }
  i32(off, le) { const v = this.u32(off, le); return v >= 0x80000000 ? v - 0x100000000 : v; }
  /** 64-bit value as a BigInt (addresses can be above 2^53). */
  u64(off, le) {
    const lo = this.u32(off + (le ? 0 : 4), le), hi = this.u32(off + (le ? 4 : 0), le);
    return (BigInt(hi) << 32n) | BigInt(lo);
  }
  /** 32 or 64-bit unsigned value as BigInt. */
  word(off, le, is64) { return is64 ? this.u64(off, le) : BigInt(this.u32(off, le)); }

  /** NUL-terminated string at off, at most max bytes, decoded as UTF-8 (Latin-1 for bad bytes is not needed: U+FFFD is fine). */
  cstr(off, max = 4096) {
    if (!Number.isSafeInteger(off) || off < 0 || off >= this.size) throw new Trunc(off, 1, this.size);
    const b = this.bytesUpTo(off, max);
    let end = b.indexOf(0);
    if (end < 0) end = b.length;
    return decodeName(b.subarray(0, end));
  }

  /** Fixed-length name field (Mach-O segname, PE section name): stops at the first NUL. */
  fixed(off, n) {
    const b = this.bytes(off, n);
    let end = b.indexOf(0);
    if (end < 0) end = n;
    return decodeName(b.subarray(0, end));
  }
}

const UTF8 = new TextDecoder('utf-8', { fatal: false });
function decodeName(b) {
  // Control characters would break the table and the C header: show them as \xNN.
  return UTF8.decode(b).replace(/[\x00-\x1f\x7f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

/** BigInt or number to "0x..." (upper-case digits). */
function hex(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'bigint') return (v < 0n ? '-0x' + (-v).toString(16) : '0x' + v.toString(16)).toUpperCase().replace(/^(-?)0X/, '$10x');
  if (!Number.isFinite(v)) return String(v);
  return (v < 0 ? '-0x' + (-v).toString(16) : '0x' + v.toString(16)).toUpperCase().replace(/^(-?)0X/, '$10x');
}

/** BigInt to a safe Number, or null when it is too large to be a file offset. */
function safe(v) {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null;
  return v >= 0n && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : null;
}

/** Unsigned LEB128 at off: { value: BigInt, len }. At most 10 bytes. */
function uleb(src, off, end) {
  let result = 0n, shift = 0n, len = 0;
  for (;;) {
    if (off + len >= end || len >= 10) throw new Trunc(off + len, 1, end);
    const b = src.u8(off + len);
    result |= BigInt(b & 0x7f) << shift;
    len++;
    if (!(b & 0x80)) break;
    shift += 7n;
  }
  return { value: result, len };
}

module.exports = { Source, Trunc, hex, safe, uleb, decodeName, BLOCK };

return module.exports; })();
M["model"] = (() => { const module = { exports: {} }, exports = module.exports;

// The shape every parser returns, and the limits that keep a hostile file from hanging or filling memory.
//
// model = {
//   format: 'ELF' | 'PE' | 'Mach-O' | 'Mach-O universal', title, template ('elf' | 'pe' | 'macho' | ''),
//   summary: [[label, value]], groups: [{ title, fields: [[name, value, offset?, size?]] }],
//   tables: [{ id, title, columns: [{ n, t }], rows: [[cell]], spans: [[offset, length] | null], key: [column indexes] }],
//   warnings: [text], slices: [{ arch, offset, size, model }] (universal Mach-O only)
// }
// Column types: 's' text, 'h' hex text ("0x1F"), 'd' decimal number.

const LIMITS = {
  maxRows: 100000,      // rows in one table (symbols of a big shared library fit; the rest is counted and named in a warning)
  maxSections: 20000,
  maxSegments: 4096,
  maxCommands: 8192,    // Mach-O load commands
  maxLibraries: 4096,
  maxThunks: 65536,     // PE import names per DLL
  maxSlices: 16,
  maxString: 4096,
  maxMs: 10000,         // parse time budget; the worker is killed at twice this
};

class Budget {
  constructor(limits = {}) {
    this.limits = { ...LIMITS, ...limits };
    this.t0 = Date.now();
    this.ticks = 0;
    this.timedOut = false;
  }
  /** True while there is time left. Checks the clock every 256 calls. */
  ok() {
    if (this.timedOut) return false;
    if ((++this.ticks & 255) === 0 && Date.now() - this.t0 > this.limits.maxMs) this.timedOut = true;
    return !this.timedOut;
  }
}

class Model {
  constructor(format, budget) {
    this.format = format;
    this.title = format;
    this.template = '';
    this.summary = [];
    this.groups = [];
    this.tables = [];
    this.warnings = [];
    this.budget = budget || new Budget();
  }
  warn(text) { if (this.warnings.length < 200 && !this.warnings.includes(text)) this.warnings.push(text); }
  group(title) { const g = { title, fields: [] }; this.groups.push(g); return g; }
  table(id, title, columns, key) {
    const t = { id, title, columns: columns.map(([n, t]) => ({ n, t })), rows: [], spans: [], key: key || [0], dropped: 0 };
    this.tables.push(t);
    return t;
  }
  /** Adds a row unless the table is full; returns false when the caller should stop adding. */
  row(t, cells, span) {
    if (t.rows.length >= this.budget.limits.maxRows) { t.dropped++; return false; }
    t.rows.push(cells);
    t.spans.push(span || null);
    return true;
  }
  /** Run one part of the parse; a Trunc or other error becomes a warning, the rest of the model stays. */
  part(name, fn) {
    try { fn(); } catch (e) { this.warn(`${name}: ${e && e.message ? e.message : String(e)}`); }
  }
  finish() {
    for (const t of this.tables) {
      if (t.dropped) this.warn(`${t.title}: showing the first ${t.rows.length.toLocaleString('en-US')} rows; ${t.dropped.toLocaleString('en-US')} more were not loaded.`);
    }
    if (this.budget.timedOut) this.warn(`Reading stopped after ${this.budget.limits.maxMs / 1000} seconds; the tables show what was read by then.`);
    delete this.budget;
    this.tables = this.tables.filter((t) => t.rows.length || t.keepEmpty);
    return this;
  }
}

/** Find a table of a model by id. */
function tableOf(model, id) { return (model.tables || []).find((t) => t.id === id) || null; }

module.exports = { LIMITS, Budget, Model, tableOf };

return module.exports; })();
M["elf"] = (() => { const module = { exports: {} }, exports = module.exports;

// ELF reader: ELF32 and ELF64, little and big endian. Header, program headers (segments), section headers,
// symbols (.symtab, .dynsym), dynamic section (needed libraries, SONAME, RPATH), imports with the library from the
// GNU version tables, exports, notes (build id). Every count is checked against the file size and LIMITS.
const { Trunc, hex, safe } = require('./source');
const { Model } = require('./model');

const MACHINES = {
  0: 'None', 2: 'SPARC', 3: 'x86 (i386)', 4: 'Motorola 68000', 7: 'Intel 80860', 8: 'MIPS', 10: 'MIPS RS3000 LE', 15: 'PA-RISC', 18: 'SPARC32+', 20: 'PowerPC', 21: 'PowerPC 64',
  22: 'IBM S/390', 40: 'ARM', 42: 'SuperH', 43: 'SPARC V9', 50: 'IA-64', 62: 'x86-64', 83: 'AVR', 92: 'OpenRISC', 94: 'Xtensa', 105: 'TI MSP430', 106: 'Blackfin',
  113: 'Altera Nios II', 164: 'Qualcomm Hexagon', 183: 'AArch64', 185: 'Atmel AVR32', 188: 'Tilera TILEPro', 189: 'MicroBlaze', 190: 'NVIDIA CUDA', 220: 'Z80', 224: 'AMD GPU',
  243: 'RISC-V', 247: 'Linux BPF', 252: 'C-SKY', 258: 'LoongArch',
};
const TYPES = { 0: 'NONE', 1: 'REL (relocatable object)', 2: 'EXEC (executable)', 3: 'DYN (shared object or PIE)', 4: 'CORE (core dump)' };
const OSABI = { 0: 'System V', 1: 'HP-UX', 2: 'NetBSD', 3: 'Linux (GNU)', 6: 'Solaris', 7: 'AIX', 8: 'IRIX', 9: 'FreeBSD', 10: 'Tru64', 11: 'Novell Modesto', 12: 'OpenBSD', 64: 'ARM EABI', 97: 'ARM', 255: 'Standalone' };
const PT = { 0: 'NULL', 1: 'LOAD', 2: 'DYNAMIC', 3: 'INTERP', 4: 'NOTE', 5: 'SHLIB', 6: 'PHDR', 7: 'TLS', 0x6474e550: 'GNU_EH_FRAME', 0x6474e551: 'GNU_STACK', 0x6474e552: 'GNU_RELRO', 0x6474e553: 'GNU_PROPERTY', 0x70000001: 'ARM_EXIDX', 0x70000003: 'RISCV_ATTRIBUTES', 0x65041580: 'PAX_FLAGS' };
const SHT = { 0: 'NULL', 1: 'PROGBITS', 2: 'SYMTAB', 3: 'STRTAB', 4: 'RELA', 5: 'HASH', 6: 'DYNAMIC', 7: 'NOTE', 8: 'NOBITS', 9: 'REL', 10: 'SHLIB', 11: 'DYNSYM', 14: 'INIT_ARRAY', 15: 'FINI_ARRAY', 16: 'PREINIT_ARRAY', 17: 'GROUP', 18: 'SYMTAB_SHNDX', 19: 'RELR',
  0x6ffffff5: 'GNU_ATTRIBUTES', 0x6ffffff6: 'GNU_HASH', 0x6ffffffd: 'GNU_verdef', 0x6ffffffe: 'GNU_verneed', 0x6fffffff: 'GNU_versym', 0x70000001: 'ARM_EXIDX', 0x70000003: 'ARM_ATTRIBUTES', 0x6fff4c03: 'LLVM_ADDRSIG' };
const STT = { 0: 'NOTYPE', 1: 'OBJECT', 2: 'FUNC', 3: 'SECTION', 4: 'FILE', 5: 'COMMON', 6: 'TLS', 10: 'IFUNC' };
const STB = { 0: 'LOCAL', 1: 'GLOBAL', 2: 'WEAK', 10: 'UNIQUE' };
const DT = { 1: 'NEEDED', 2: 'PLTRELSZ', 3: 'PLTGOT', 4: 'HASH', 5: 'STRTAB', 6: 'SYMTAB', 7: 'RELA', 8: 'RELASZ', 9: 'RELAENT', 10: 'STRSZ', 11: 'SYMENT', 12: 'INIT', 13: 'FINI', 14: 'SONAME', 15: 'RPATH', 16: 'SYMBOLIC', 17: 'REL', 18: 'RELSZ', 19: 'RELENT', 20: 'PLTREL', 21: 'DEBUG', 22: 'TEXTREL', 23: 'JMPREL', 24: 'BIND_NOW', 25: 'INIT_ARRAY', 26: 'FINI_ARRAY', 27: 'INIT_ARRAYSZ', 28: 'FINI_ARRAYSZ', 29: 'RUNPATH', 30: 'FLAGS', 32: 'PREINIT_ARRAY', 33: 'PREINIT_ARRAYSZ', 35: 'RELRSZ', 36: 'RELR', 37: 'RELRENT',
  0x6ffffef5: 'GNU_HASH', 0x6ffffff0: 'VERSYM', 0x6ffffff9: 'RELACOUNT', 0x6ffffffa: 'RELCOUNT', 0x6ffffffb: 'FLAGS_1', 0x6ffffffc: 'VERDEF', 0x6ffffffd: 'VERDEFNUM', 0x6ffffffe: 'VERNEED', 0x6fffffff: 'VERNEEDNUM' };
const DT_STR = new Set([1, 14, 15, 29]);

function shFlags(v) {
  const f = Number(v & 0xffffffffn), out = [];
  if (f & 1) out.push('W'); if (f & 2) out.push('A'); if (f & 4) out.push('X'); if (f & 0x10) out.push('M'); if (f & 0x20) out.push('S');
  if (f & 0x40) out.push('I'); if (f & 0x80) out.push('L'); if (f & 0x200) out.push('G'); if (f & 0x400) out.push('T'); if (f & 0x800) out.push('C');
  return out.join('');
}
function phFlags(f) { return (f & 4 ? 'R' : '-') + (f & 2 ? 'W' : '-') + (f & 1 ? 'X' : '-'); }
const name = (map, v) => (map[v] !== undefined ? map[v] : hex(v));

function isElf(src) {
  if (src.size < 16) return false;
  const b = src.bytes(0, 4);
  return b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46;
}

function parseElf(src, budget) {
  const m = new Model('ELF', budget);
  m.template = 'elf';
  const L = m.budget.limits;
  if (src.size < 16) throw new Trunc(0, 16, src.size);
  const id = src.bytes(0, 16);
  const cls = id[4], data = id[5];
  if (cls !== 1 && cls !== 2) throw new Error(`EI_CLASS is ${id[4]}; an ELF file says 1 (32-bit) or 2 (64-bit).`);
  if (data !== 1 && data !== 2) throw new Error(`EI_DATA is ${id[5]}; an ELF file says 1 (little endian) or 2 (big endian).`);
  const is64 = cls === 2, le = data === 1;
  const W = is64 ? 8 : 4;
  const ehsize = is64 ? 64 : 52;
  const u16 = (o) => src.u16(o, le), u32 = (o) => src.u32(o, le), word = (o) => src.word(o, le, is64);

  const ident = m.group('ELF identification (e_ident)');
  ident.fields.push(['Magic', '7F 45 4C 46 ("\\x7fELF")', 0, 4], ['Class', is64 ? 'ELF64' : 'ELF32', 4, 1], ['Data', le ? 'little endian (LSB)' : 'big endian (MSB)', 5, 1],
    ['Version', String(id[6]), 6, 1], ['OS/ABI', name(OSABI, id[7]), 7, 1], ['ABI version', String(id[8]), 8, 1]);

  if (src.size < ehsize) { m.warn(`The ELF header needs ${ehsize} bytes; the file has ${src.size}.`); m.title = `ELF ${is64 ? 64 : 32}-bit, header cut short`; return m.finish(); }
  const h = {
    type: u16(16), machine: u16(18), version: u32(20), entry: word(24),
    phoff: word(is64 ? 32 : 28), shoff: word(is64 ? 40 : 32), flags: u32(is64 ? 48 : 36),
    ehsize: u16(is64 ? 52 : 40), phentsize: u16(is64 ? 54 : 42), phnum: u16(is64 ? 56 : 44),
    shentsize: u16(is64 ? 58 : 46), shnum: u16(is64 ? 60 : 48), shstrndx: u16(is64 ? 62 : 50),
  };
  const o = (a, b) => (is64 ? b : a);
  const hdr = m.group('ELF header');
  hdr.fields.push(
    ['Type (e_type)', name(TYPES, h.type), 16, 2], ['Machine (e_machine)', `${name(MACHINES, h.machine)} (${h.machine})`, 18, 2], ['Version (e_version)', String(h.version), 20, 4],
    ['Entry point (e_entry)', hex(h.entry), 24, W], ['Program headers at (e_phoff)', hex(h.phoff), o(28, 32), W], ['Section headers at (e_shoff)', hex(h.shoff), o(32, 40), W],
    ['Flags (e_flags)', hex(h.flags), o(36, 48), 4], ['Header size (e_ehsize)', String(h.ehsize), o(40, 52), 2],
    ['Program header size (e_phentsize)', String(h.phentsize), o(42, 54), 2], ['Program headers (e_phnum)', String(h.phnum), o(44, 56), 2],
    ['Section header size (e_shentsize)', String(h.shentsize), o(46, 58), 2], ['Section headers (e_shnum)', String(h.shnum), o(48, 60), 2],
    ['Section name table index (e_shstrndx)', String(h.shstrndx), o(50, 62), 2]);

  const typeShort = { 1: 'relocatable', 2: 'executable', 3: 'shared object', 4: 'core dump' }[h.type] || `type ${h.type}`;
  m.title = `ELF ${is64 ? 64 : 32}-bit ${le ? 'LSB' : 'MSB'} ${typeShort}, ${name(MACHINES, h.machine)}`;
  m.summary.push(['Format', `ELF${is64 ? 64 : 32}, ${le ? 'little' : 'big'} endian`], ['Type', name(TYPES, h.type)], ['Machine', name(MACHINES, h.machine)], ['OS/ABI', name(OSABI, id[7])], ['Entry point', hex(h.entry)]);

  // ---- section headers (read first: the program headers may need the extended counts in section 0) ----
  const sections = [];
  const shoff = safe(h.shoff);
  const SHSZ = is64 ? 64 : 40;
  let shnum = h.shnum, shstrndx = h.shstrndx, phnum = h.phnum;
  m.part('Section headers', () => {
    if (!h.shoff) return;
    if (shoff === null || shoff >= src.size) { m.warn(`Section headers: e_shoff ${hex(h.shoff)} is past the end of the file.`); return; }
    if (h.shentsize < SHSZ) { m.warn(`Section headers: e_shentsize is ${h.shentsize}; ELF${is64 ? 64 : 32} needs at least ${SHSZ}. The section table is not read.`); return; }
    const readSh = (i) => {
      const b = shoff + i * h.shentsize;
      return {
        index: i, nameOff: u32(b), type: u32(b + 4), flags: word(b + 8), addr: word(b + o(12, 16)), offset: word(b + o(16, 24)), size: word(b + o(20, 32)),
        link: u32(b + o(24, 40)), info: u32(b + o(28, 44)), align: word(b + o(32, 48)), entsize: word(b + o(36, 56)), at: b,
      };
    };
    if (shnum === 0 || shstrndx === 0xffff || phnum === 0xffff) {
      const s0 = readSh(0);
      if (shnum === 0 && s0.size > 0n) shnum = safe(s0.size) || 0;
      if (shstrndx === 0xffff) shstrndx = s0.link;
      if (phnum === 0xffff) phnum = s0.info;
    }
    const fit = Math.floor((src.size - shoff) / h.shentsize);
    let n = shnum;
    if (n > fit) { m.warn(`Section headers: e_shnum says ${n}, but only ${fit} fit before the end of the file.`); n = fit; }
    if (n > L.maxSections) { m.warn(`Section headers: ${n} sections; reading the first ${L.maxSections}.`); n = L.maxSections; }
    for (let i = 0; i < n && m.budget.ok(); i++) sections.push(readSh(i));
  });

  const strAt = (secIndex, off) => {
    const s = sections[secIndex];
    if (!s || s.type === 8) throw new Error(`string table section ${secIndex} is missing`);
    const base = safe(s.offset), size = safe(s.size);
    if (base === null || size === null || off >= size) throw new Error(`name offset ${hex(off)} is outside the string table`);
    return src.cstr(base + off, Math.min(L.maxString, size - off));
  };
  for (const s of sections) {
    s.name = '';
    if (shstrndx && shstrndx < sections.length) { try { s.name = strAt(shstrndx, s.nameOff); } catch { s.name = `(name at ${hex(s.nameOff)})`; } }
  }
  const secName = (i) => (i === 0 ? 'UNDEF' : i === 0xfff1 ? 'ABS' : i === 0xfff2 ? 'COMMON' : i >= 0xff00 ? hex(i) : (sections[i] && sections[i].name) || String(i));

  // ---- program headers ----
  const segments = [];
  m.part('Program headers', () => {
    if (!h.phoff || !phnum) return;
    const phoff = safe(h.phoff);
    const PHSZ = is64 ? 56 : 32;
    if (phoff === null || phoff >= src.size) { m.warn(`Program headers: e_phoff ${hex(h.phoff)} is past the end of the file.`); return; }
    if (h.phentsize < PHSZ) { m.warn(`Program headers: e_phentsize is ${h.phentsize}; ELF${is64 ? 64 : 32} needs at least ${PHSZ}.`); return; }
    let n = phnum;
    const fit = Math.floor((src.size - phoff) / h.phentsize);
    if (n > fit) { m.warn(`Program headers: e_phnum says ${n}, but only ${fit} fit before the end of the file.`); n = fit; }
    n = Math.min(n, L.maxSegments);
    for (let i = 0; i < n; i++) {
      const b = phoff + i * h.phentsize;
      segments.push(is64
        ? { type: u32(b), flags: u32(b + 4), offset: word(b + 8), vaddr: word(b + 16), paddr: word(b + 24), filesz: word(b + 32), memsz: word(b + 40), align: word(b + 48), at: b }
        : { type: u32(b), offset: word(b + 4), vaddr: word(b + 8), paddr: word(b + 12), filesz: word(b + 16), memsz: word(b + 20), flags: u32(b + 24), align: word(b + 28), at: b });
    }
  });
  const segT = m.table('segments', 'Segments (program headers)', [['#', 'd'], ['Type', 's'], ['Offset', 'h'], ['Virtual address', 'h'], ['Physical address', 'h'], ['File size', 'h'], ['Memory size', 'h'], ['Flags', 's'], ['Align', 'h']], [1, 3]);
  segments.forEach((p, i) => {
    const off = safe(p.offset), len = safe(p.filesz);
    m.row(segT, [i, name(PT, p.type), hex(p.offset), hex(p.vaddr), hex(p.paddr), hex(p.filesz), hex(p.memsz), phFlags(p.flags), hex(p.align)],
      off !== null && len !== null && off < src.size ? [off, Math.min(len, src.size - off)] : null);
  });
  const vaddrToOff = (va) => {
    for (const p of segments) {
      if (p.type !== 1) continue;
      if (va >= p.vaddr && va < p.vaddr + p.filesz) return safe(p.offset + (va - p.vaddr));
    }
    return null;
  };

  const secT = m.table('sections', 'Sections', [['#', 'd'], ['Name', 's'], ['Type', 's'], ['Address', 'h'], ['Offset', 'h'], ['Size', 'h'], ['Entry size', 'h'], ['Flags', 's'], ['Link', 'd'], ['Info', 'd'], ['Align', 'h']], [1]);
  for (const s of sections) {
    const off = safe(s.offset), len = safe(s.size);
    m.row(secT, [s.index, s.name, name(SHT, s.type), hex(s.addr), hex(s.offset), hex(s.size), hex(s.entsize), shFlags(s.flags), s.link, s.info, hex(s.align)],
      s.type !== 8 && off !== null && len !== null && off < src.size ? [off, Math.min(len, src.size - off)] : null);
  }
  m.summary.push(['Sections', String(sections.length)], ['Segments', String(segments.length)]);

  // ---- interpreter ----
  m.part('Interpreter', () => {
    const p = segments.find((s) => s.type === 3);
    if (!p) return;
    const off = safe(p.offset);
    if (off === null) return;
    const interp = src.cstr(off, Math.min(L.maxString, safe(p.filesz) || 256));
    m.summary.push(['Interpreter', interp]);
    hdr.fields.push(['Interpreter (PT_INTERP)', interp, off, interp.length]);
  });

  // ---- version tables (for import libraries) ----
  const verNeed = new Map(); // version index -> { file, version }
  m.part('Version needs (.gnu.version_r)', () => {
    const vs = sections.find((s) => s.type === 0x6ffffffe);
    if (!vs) return;
    const base = safe(vs.offset), size = safe(vs.size);
    if (base === null || size === null) return;
    const end = Math.min(src.size, base + size);
    let off = base, guard = 0;
    const seen = new Set();
    while (off + 16 <= end && guard++ < 4096 && m.budget.ok()) {
      if (seen.has(off)) { m.warn('Version needs: the entries point back to an earlier entry (a loop); reading stopped there.'); break; }
      seen.add(off);
      const cnt = u16(off + 2), file = u32(off + 4), aux = u32(off + 8), next = u32(off + 12);
      let fname = '';
      try { fname = strAt(vs.link, file); } catch { fname = ''; }
      let a = off + aux, k = 0;
      const seenA = new Set();
      while (k < cnt && k < 4096 && a + 16 <= end) {
        if (seenA.has(a)) { m.warn('Version needs: an aux entry points back to an earlier one (a loop); reading stopped there.'); break; }
        seenA.add(a);
        const other = u16(a + 6), vname = u32(a + 8), anext = u32(a + 12);
        let v = '';
        try { v = strAt(vs.link, vname); } catch { v = ''; }
        verNeed.set(other & 0x7fff, { file: fname, version: v });
        k++;
        if (!anext) break;
        a += anext;
      }
      if (!next) break;
      off += next;
    }
  });

  // ---- symbols ----
  const symT = m.table('symbols', 'Symbols', [['Name', 's'], ['Value', 'h'], ['Size', 'd'], ['Type', 's'], ['Bind', 's'], ['Visibility', 's'], ['Section', 's'], ['Table', 's']], [0, 7]);
  const impT = m.table('imports', 'Imports', [['Name', 's'], ['Library', 's'], ['Version', 's'], ['Type', 's'], ['Bind', 's']], [1, 0]);
  const expT = m.table('exports', 'Exports', [['Name', 's'], ['Address', 'h'], ['Size', 'd'], ['Type', 's'], ['Bind', 's'], ['Section', 's']], [0]);
  const needed = [];
  const SYMSZ = is64 ? 24 : 16;
  const readSyms = (s) => {
    const base = safe(s.offset), size = safe(s.size);
    if (base === null || size === null) return [];
    if (base >= src.size) { m.warn(`${s.name || 'symbol table'}: offset ${hex(s.offset)} is past the end of the file.`); return []; }
    const ent = safe(s.entsize) || SYMSZ;
    if (ent < SYMSZ) { m.warn(`${s.name}: entry size ${ent} is too small for an ELF${is64 ? 64 : 32} symbol.`); return []; }
    let n = Math.floor(size / ent);
    const fit = Math.floor((src.size - base) / ent);
    if (n > fit) { m.warn(`${s.name}: ${n} symbols do not fit in the file; reading ${fit}.`); n = fit; }
    let versym = null;
    if (s.type === 11) {
      const vs = sections.find((x) => x.type === 0x6fffffff);
      if (vs) versym = safe(vs.offset);
    }
    const out = [];
    for (let i = 1; i < n && m.budget.ok(); i++) {
      if (out.length >= L.maxRows) { m.warn(`${s.name}: showing the first ${L.maxRows.toLocaleString('en-US')} symbols of ${n.toLocaleString('en-US')}.`); break; }
      const b = base + i * ent;
      const sym = is64
        ? { nameOff: u32(b), info: src.u8(b + 4), other: src.u8(b + 5), shndx: u16(b + 6), value: src.u64(b + 8, le), size: src.u64(b + 16, le) }
        : { nameOff: u32(b), value: BigInt(u32(b + 4)), size: BigInt(u32(b + 8)), info: src.u8(b + 12), other: src.u8(b + 13), shndx: u16(b + 14) };
      try { sym.name = sym.nameOff ? strAt(s.link, sym.nameOff) : ''; } catch { sym.name = `(name at ${hex(sym.nameOff)})`; }
      sym.type = sym.info & 15; sym.bind = sym.info >> 4; sym.vis = ['DEFAULT', 'INTERNAL', 'HIDDEN', 'PROTECTED'][sym.other & 3];
      if (versym !== null) {
        try { const v = u16(versym + i * 2) & 0x7fff; sym.ver = verNeed.get(v); } catch { /* no version for this one */ }
      }
      out.push(sym);
    }
    return out;
  };
  let dynsyms = [];
  m.part('Symbols', () => {
    for (const s of sections) {
      if (s.type !== 2 && s.type !== 11) continue;
      const tableName = s.type === 2 ? '.symtab' : '.dynsym';
      const syms = readSyms(s);
      if (s.type === 11) dynsyms = syms;
      for (const y of syms) {
        if (!y.name && y.type === 3) continue; // section symbols carry no name
        if (!m.row(symT, [y.name, hex(y.value), safe(y.size) ?? Number.MAX_SAFE_INTEGER, name(STT, y.type), name(STB, y.bind), y.vis, secName(y.shndx), tableName])) break;
      }
    }
  });

  // ---- dynamic section ----
  const dynT = m.table('dynamic', 'Dynamic section', [['Tag', 's'], ['Value', 'h'], ['Meaning', 's']], [0, 2]);
  m.part('Dynamic section', () => {
    let base = null, size = null, strIdx = -1;
    const ds = sections.find((s) => s.type === 6);
    if (ds) { base = safe(ds.offset); size = safe(ds.size); strIdx = ds.link; }
    else { const p = segments.find((s) => s.type === 2); if (p) { base = safe(p.offset); size = safe(p.filesz); } }
    if (base === null || size === null) return;
    const ent = is64 ? 16 : 8;
    const n = Math.min(Math.floor(size / ent), Math.floor(Math.max(0, src.size - base) / ent), 8192);
    const entries = [];
    for (let i = 0; i < n; i++) {
      const b = base + i * ent;
      const tag = safe(src.word(b, le, is64)) ?? -1, val = src.word(b + W, le, is64);
      if (tag === 0) break;
      entries.push({ tag, val, at: b });
    }
    // Without section headers, DT_STRTAB (an address) gives the string table.
    let strBase = null, strSize = null;
    if (strIdx >= 0 && sections[strIdx]) { strBase = safe(sections[strIdx].offset); strSize = safe(sections[strIdx].size); }
    else {
      const st = entries.find((e) => e.tag === 5), sz = entries.find((e) => e.tag === 10);
      if (st) { strBase = vaddrToOff(st.val); strSize = sz ? safe(sz.val) : 65536; }
    }
    const dstr = (v) => {
      const off = safe(v);
      if (strBase === null || off === null || off >= (strSize ?? 0)) return '';
      return src.cstr(strBase + off, Math.min(L.maxString, strSize - off));
    };
    for (const e of entries) {
      let meaning = '';
      if (DT_STR.has(e.tag)) { try { meaning = dstr(e.val); } catch { meaning = ''; } }
      if (e.tag === 1 && meaning && needed.length < L.maxLibraries) needed.push(meaning);
      if (e.tag === 14 && meaning) m.summary.push(['SONAME', meaning]);
      if ((e.tag === 15 || e.tag === 29) && meaning) m.summary.push([e.tag === 15 ? 'RPATH' : 'RUNPATH', meaning]);
      if (e.tag === 0x6ffffffb) meaning = [[1, 'NOW'], [8, 'NODELETE'], [0x8000000, 'PIE']].filter(([b]) => Number(e.val & 0xffffffffn) & b).map((x) => x[1]).join(' ');
      m.row(dynT, [name(DT, e.tag), hex(e.val), meaning], [e.at, ent]);
    }
  });
  const libT = m.table('libraries', 'Libraries', [['Library', 's'], ['How', 's']], [0]);
  for (const n of needed) m.row(libT, [n, 'DT_NEEDED']);
  if (needed.length) m.summary.push(['Needed libraries', needed.length > 6 ? `${needed.slice(0, 6).join(', ')} and ${needed.length - 6} more` : needed.join(', ')]);

  // ---- imports and exports ----
  m.part('Imports and exports', () => {
    const useDyn = dynsyms.length > 0;
    const list = useDyn ? dynsyms : [];
    if (!useDyn) {
      // Objects and static executables: the .symtab globals.
      const st = sections.find((s) => s.type === 2);
      if (st) list.push(...readSyms(st));
    }
    // Without a version entry the dynamic linker takes the symbol from the first loaded object that has it.
    const anyLib = needed.length ? '(resolved at load time)' : '';
    for (const y of list) {
      if (!y.name || y.type === 3 || y.type === 4) continue;
      const global = y.bind === 1 || y.bind === 2 || y.bind === 10;
      if (!global) continue;
      if (y.shndx === 0) {
        if (!m.row(impT, [y.name, y.ver ? y.ver.file : anyLib, y.ver ? y.ver.version : '', name(STT, y.type), name(STB, y.bind)])) break;
      } else if (y.vis === 'DEFAULT' || y.vis === 'PROTECTED') {
        if (!m.row(expT, [y.name, hex(y.value), safe(y.size) ?? 0, name(STT, y.type), name(STB, y.bind), secName(y.shndx)])) break;
      }
    }
  });
  m.summary.push(['Imports', String(impT.rows.length)], ['Exports', String(expT.rows.length)]);

  // ---- notes ----
  const noteT = m.table('notes', 'Notes', [['Owner', 's'], ['Type', 's'], ['Description', 's']], [0, 1]);
  m.part('Notes', () => {
    const areas = sections.filter((s) => s.type === 7).map((s) => [safe(s.offset), safe(s.size)]);
    if (!areas.length) for (const p of segments) if (p.type === 4) areas.push([safe(p.offset), safe(p.filesz)]);
    let count = 0;
    for (const [base, size] of areas) {
      if (base === null || size === null) continue;
      const end = Math.min(src.size, base + size);
      let off = base;
      while (off + 12 <= end && count++ < 512) {
        const nsz = u32(off), dsz = u32(off + 4), type = u32(off + 8);
        const nameOff = off + 12, descOff = nameOff + ((nsz + 3) & ~3);
        const next = descOff + ((dsz + 3) & ~3);
        if (nsz > 4096 || dsz > 1 << 20 || next > end || next <= off) break;
        const owner = nsz ? src.fixed(nameOff, nsz) : '';
        let t = String(type), desc = `${dsz} bytes`;
        if (owner === 'GNU' && type === 3) { t = 'GNU_BUILD_ID'; desc = Array.from(src.bytes(descOff, Math.min(dsz, 64)), (x) => x.toString(16).padStart(2, '0')).join(''); m.summary.push(['Build ID', desc]); }
        else if (owner === 'GNU' && type === 1 && dsz >= 16) { t = 'GNU_ABI_TAG'; desc = `${['Linux', 'Hurd', 'Solaris', 'FreeBSD'][u32(descOff)] || u32(descOff)} ${u32(descOff + 4)}.${u32(descOff + 8)}.${u32(descOff + 12)}`; }
        else if (owner === 'GNU' && type === 5) t = 'GNU_PROPERTY_TYPE_0';
        else if (owner === 'Go' && type === 4) { t = 'Go build ID'; desc = src.fixed(descOff, Math.min(dsz, 256)); }
        else if (owner === 'CORE') t = { 1: 'PRSTATUS', 2: 'FPREGSET', 3: 'PRPSINFO', 6: 'AUXV', 0x46494c45: 'FILE' }[type] || t;
        m.row(noteT, [owner, t, desc], [off, next - off]);
        off = next;
      }
    }
  });

  if (shoff !== null && h.shoff && h.shnum && sections.length === 0) m.warn('No section could be read.');
  if (!h.shoff) m.warn('This file has no section headers (stripped or packed): sections, symbols and names come from the program headers only.');
  return m.finish();
}

module.exports = { parseElf, isElf, MACHINES };

return module.exports; })();
M["pe"] = (() => { const module = { exports: {} }, exports = module.exports;

// PE reader: EXE, DLL, SYS, EFI and COFF images, PE32 and PE32+. DOS header, COFF header, optional header, data
// directories, sections, imports (by name and ordinal), delay-load imports, exports (with forwarders), debug info
// (PDB path), .NET runtime header, resources (types and sizes), Authenticode size, overlay. Every RVA is mapped
// through the section table and checked against the file; every list has a cap.
const { hex, safe } = require('./source');
const { Model } = require('./model');

const MACHINES = { 0x0: 'Unknown', 0x14c: 'x86 (i386)', 0x8664: 'x64 (AMD64)', 0x1c0: 'ARM', 0x1c4: 'ARMv7 Thumb-2', 0xaa64: 'ARM64', 0xa641: 'ARM64EC', 0xa64e: 'ARM64X', 0x200: 'Itanium (IA-64)', 0x5032: 'RISC-V 32', 0x5064: 'RISC-V 64', 0xebc: 'EFI byte code', 0x1f0: 'PowerPC', 0x166: 'MIPS R4000', 0x6232: 'LoongArch 32', 0x6264: 'LoongArch 64' };
const SUBSYSTEMS = { 0: 'Unknown', 1: 'Native (driver)', 2: 'Windows GUI', 3: 'Windows console', 5: 'OS/2 console', 7: 'POSIX console', 9: 'Windows CE GUI', 10: 'EFI application', 11: 'EFI boot service driver', 12: 'EFI runtime driver', 13: 'EFI ROM', 14: 'Xbox', 16: 'Windows boot application' };
const CHARACTERISTICS = { 0x1: 'RELOCS_STRIPPED', 0x2: 'EXECUTABLE_IMAGE', 0x4: 'LINE_NUMS_STRIPPED', 0x8: 'LOCAL_SYMS_STRIPPED', 0x20: 'LARGE_ADDRESS_AWARE', 0x100: '32BIT_MACHINE', 0x200: 'DEBUG_STRIPPED', 0x400: 'REMOVABLE_RUN_FROM_SWAP', 0x800: 'NET_RUN_FROM_SWAP', 0x1000: 'SYSTEM', 0x2000: 'DLL', 0x4000: 'UP_SYSTEM_ONLY' };
const DLL_CHARACTERISTICS = { 0x20: 'HIGH_ENTROPY_VA', 0x40: 'DYNAMIC_BASE (ASLR)', 0x80: 'FORCE_INTEGRITY', 0x100: 'NX_COMPAT (DEP)', 0x200: 'NO_ISOLATION', 0x400: 'NO_SEH', 0x800: 'NO_BIND', 0x1000: 'APPCONTAINER', 0x2000: 'WDM_DRIVER', 0x4000: 'GUARD_CF', 0x8000: 'TERMINAL_SERVER_AWARE' };
const SECTION_FLAGS = { 0x20: 'CODE', 0x40: 'INITIALIZED_DATA', 0x80: 'UNINITIALIZED_DATA', 0x200: 'INFO', 0x800: 'REMOVE', 0x1000: 'COMDAT', 0x2000000: 'DISCARDABLE', 0x4000000: 'NOT_CACHED', 0x8000000: 'NOT_PAGED', 0x10000000: 'SHARED', 0x20000000: 'EXECUTE', 0x40000000: 'READ', 0x80000000: 'WRITE' };
const DIRS = ['Export', 'Import', 'Resource', 'Exception', 'Certificate (security)', 'Base relocation', 'Debug', 'Architecture', 'Global pointer', 'TLS', 'Load config', 'Bound import', 'Import address table (IAT)', 'Delay import', '.NET (CLR) header', 'Reserved'];
const RES_TYPES = { 1: 'CURSOR', 2: 'BITMAP', 3: 'ICON', 4: 'MENU', 5: 'DIALOG', 6: 'STRING', 7: 'FONTDIR', 8: 'FONT', 9: 'ACCELERATOR', 10: 'RCDATA', 11: 'MESSAGETABLE', 12: 'GROUP_CURSOR', 14: 'GROUP_ICON', 16: 'VERSION', 17: 'DLGINCLUDE', 19: 'PLUGPLAY', 20: 'VXD', 21: 'ANICURSOR', 22: 'ANIICON', 23: 'HTML', 24: 'MANIFEST' };
const DEBUG_TYPES = { 1: 'COFF', 2: 'CodeView', 3: 'FPO', 4: 'MISC', 5: 'Exception', 6: 'Fixup', 9: 'Borland', 12: 'VC_FEATURE', 13: 'POGO', 14: 'ILTCG', 16: 'Repro', 20: 'Extended DLL characteristics' };

function flagList(v, map) {
  const out = [];
  let rest = v >>> 0;
  for (const [k, n] of Object.entries(map)) { const b = Number(k); if ((v & b) === b && b) { out.push(n); rest &= ~b; } }
  if (rest) out.push(hex(rest >>> 0));
  return out.join(' | ') || 'none';
}
const name = (map, v) => (map[v] !== undefined ? map[v] : hex(v));
const unixTime = (t) => (t ? `${new Date(t * 1000).toISOString().replace('.000Z', 'Z')} (${hex(t)})` : '0');

function isPe(src) {
  if (src.size < 2) return false;
  const b = src.bytes(0, 2);
  return b[0] === 0x4d && b[1] === 0x5a; // "MZ"
}

function parsePe(src, budget) {
  const m = new Model('PE', budget);
  m.template = 'pe';
  const L = m.budget.limits;
  const u16 = (o) => src.u16(o, true), u32 = (o) => src.u32(o, true);
  const dos = m.group('MS-DOS header');
  dos.fields.push(['Magic (e_magic)', '"MZ"', 0, 2]);
  if (src.size < 0x40) { m.title = 'MS-DOS executable, header cut short'; m.warn(`The MS-DOS header needs 64 bytes; the file has ${src.size}.`); return m.finish(); }
  const lfanew = u32(0x3c);
  dos.fields.push(['Bytes on last page (e_cblp)', String(u16(2)), 2, 2], ['Pages (e_cp)', String(u16(4)), 4, 2], ['Initial IP (e_ip)', hex(u16(0x14)), 0x14, 2], ['PE header at (e_lfanew)', hex(lfanew), 0x3c, 4]);
  if (lfanew + 24 > src.size || lfanew < 4 || u32(lfanew) !== 0x4550) {
    m.title = 'MS-DOS executable (no PE header)';
    m.summary.push(['Format', 'MS-DOS MZ executable'], ['PE header', `none at ${hex(lfanew)}`]);
    m.warn(`No "PE\\0\\0" signature at e_lfanew ${hex(lfanew)}: this is a plain MS-DOS program, or the header is damaged.`);
    return m.finish();
  }
  const c = lfanew + 4;
  const coff = { machine: u16(c), nsec: u16(c + 2), time: u32(c + 4), symptr: u32(c + 8), nsym: u32(c + 12), optsize: u16(c + 16), chars: u16(c + 18) };
  const ch = m.group('COFF file header');
  ch.fields.push(['Signature', '"PE\\0\\0"', lfanew, 4], ['Machine', `${name(MACHINES, coff.machine)} (${hex(coff.machine)})`, c, 2], ['Number of sections', String(coff.nsec), c + 2, 2],
    ['Time date stamp', unixTime(coff.time), c + 4, 4], ['Pointer to symbol table', hex(coff.symptr), c + 8, 4], ['Number of symbols', String(coff.nsym), c + 12, 4],
    ['Size of optional header', String(coff.optsize), c + 16, 2], ['Characteristics', flagList(coff.chars, CHARACTERISTICS), c + 18, 2]);

  const o = c + 20;
  let magic = 0, is64 = false, opt = {};
  const dirs = [];
  const og = m.group('Optional header');
  m.part('Optional header', () => {
    if (coff.optsize < 2) return;
    magic = u16(o);
    is64 = magic === 0x20b;
    if (magic !== 0x10b && magic !== 0x20b) { m.warn(`Optional header magic is ${hex(magic)} (PE32 is 0x10B, PE32+ is 0x20B).`); return; }
    const end = o + coff.optsize;
    const need = is64 ? 112 : 96;
    if (end > src.size) m.warn('Optional header: it runs past the end of the file.');
    opt = {
      entry: u32(o + 16), baseOfCode: u32(o + 20), imageBase: is64 ? src.u64(o + 24, true) : BigInt(u32(o + 28)),
      sectionAlign: u32(o + 32), fileAlign: u32(o + 36), osMajor: u16(o + 40), osMinor: u16(o + 42), subMajor: u16(o + 48), subMinor: u16(o + 50),
      sizeOfImage: u32(o + 56), sizeOfHeaders: u32(o + 60), checksum: u32(o + 64), subsystem: u16(o + 68), dllChars: u16(o + 70),
      linker: `${src.u8(o + 2)}.${src.u8(o + 3)}`,
    };
    og.fields.push(['Magic', `${is64 ? 'PE32+ (64-bit)' : 'PE32 (32-bit)'} (${hex(magic)})`, o, 2], ['Linker version', opt.linker, o + 2, 2],
      ['Size of code', hex(u32(o + 4)), o + 4, 4], ['Entry point (RVA)', hex(opt.entry), o + 16, 4], ['Base of code', hex(opt.baseOfCode), o + 20, 4],
      ['Image base', hex(opt.imageBase), is64 ? o + 24 : o + 28, is64 ? 8 : 4], ['Section alignment', hex(opt.sectionAlign), o + 32, 4], ['File alignment', hex(opt.fileAlign), o + 36, 4],
      ['OS version', `${opt.osMajor}.${opt.osMinor}`, o + 40, 4], ['Subsystem version', `${opt.subMajor}.${opt.subMinor}`, o + 48, 4], ['Size of image', hex(opt.sizeOfImage), o + 56, 4],
      ['Size of headers', hex(opt.sizeOfHeaders), o + 60, 4], ['Checksum', hex(opt.checksum), o + 64, 4], ['Subsystem', `${name(SUBSYSTEMS, opt.subsystem)} (${opt.subsystem})`, o + 68, 2],
      ['DLL characteristics', flagList(opt.dllChars, DLL_CHARACTERISTICS), o + 70, 2]);
    if (coff.optsize < need) { m.warn(`Optional header: ${coff.optsize} bytes is too short for the data directories.`); return; }
    const ndOff = o + (is64 ? 108 : 92);
    let nd = u32(ndOff);
    og.fields.push(['Number of data directories', String(nd), ndOff, 4]);
    const room = Math.floor((end - (ndOff + 4)) / 8);
    if (nd > 16) { m.warn(`Optional header: NumberOfRvaAndSizes is ${nd}; the format has 16. Reading 16.`); nd = 16; }
    if (nd > room) { m.warn(`Optional header: ${nd} data directories do not fit in the optional header; reading ${Math.max(0, room)}.`); nd = Math.max(0, room); }
    for (let i = 0; i < nd; i++) dirs.push({ i, rva: u32(ndOff + 4 + i * 8), size: u32(ndOff + 8 + i * 8), at: ndOff + 4 + i * 8 });
  });

  // ---- sections ----
  const secs = [];
  const secT = m.table('sections', 'Sections', [['#', 'd'], ['Name', 's'], ['Virtual address', 'h'], ['Virtual size', 'h'], ['Raw offset', 'h'], ['Raw size', 'h'], ['Characteristics', 's'], ['Flags', 'h']], [1]);
  m.part('Section table', () => {
    const base = o + coff.optsize;
    let n = coff.nsec;
    const fit = Math.max(0, Math.floor((src.size - base) / 40));
    if (n > fit) { m.warn(`Section table: ${n} sections do not fit in the file; reading ${fit}.`); n = fit; }
    n = Math.min(n, L.maxSections);
    const strtab = coff.symptr && coff.symptr + coff.nsym * 18 < src.size ? coff.symptr + coff.nsym * 18 : 0;
    for (let i = 0; i < n; i++) {
      const b = base + i * 40;
      let nm = src.fixed(b, 8);
      if (/^\/\d+$/.test(nm) && strtab) { try { nm = src.cstr(strtab + Number(nm.slice(1)), 256); } catch { /* keep "/123" */ } }
      const s = { name: nm, vsize: u32(b + 8), va: u32(b + 12), rawSize: u32(b + 16), rawPtr: u32(b + 20), chars: u32(b + 36), at: b };
      secs.push(s);
      const span = s.rawPtr < src.size && s.rawSize ? [s.rawPtr, Math.min(s.rawSize, src.size - s.rawPtr)] : null;
      m.row(secT, [i + 1, s.name, hex(s.va), hex(s.vsize), hex(s.rawPtr), hex(s.rawSize), flagList(s.chars & 0xfe0fffff, SECTION_FLAGS), hex(s.chars)], span);
      if (s.rawSize && s.rawPtr + s.rawSize > src.size) m.warn(`Section ${s.name}: raw data runs past the end of the file.`);
    }
  });

  /** RVA to file offset, or null. */
  const rvaToOff = (rva) => {
    if (opt.sizeOfHeaders && rva < opt.sizeOfHeaders) return rva < src.size ? rva : null;
    for (const s of secs) {
      const span = Math.max(s.vsize, s.rawSize);
      if (rva >= s.va && rva < s.va + span) {
        const d = rva - s.va;
        if (d >= s.rawSize) return null; // in memory only (zero-filled)
        const off = s.rawPtr + d;
        return off < src.size ? off : null;
      }
    }
    return secs.length === 0 && rva < src.size ? rva : null;
  };
  const strRva = (rva, max = L.maxString) => { const off = rvaToOff(rva); if (off === null) throw new Error(`RVA ${hex(rva)} is not in the file`); return src.cstr(off, max); };

  // ---- data directories ----
  const dirT = m.table('directories', 'Data directories', [['#', 'd'], ['Directory', 's'], ['RVA', 'h'], ['Size', 'h'], ['File offset', 'h'], ['Section', 's']], [1]);
  for (const d of dirs) {
    const off = d.i === 4 ? (d.rva < src.size ? d.rva : null) : (d.rva ? rvaToOff(d.rva) : null);
    const sec = d.i === 4 ? '(file offset)' : (secs.find((s) => d.rva >= s.va && d.rva < s.va + Math.max(s.vsize, s.rawSize)) || {}).name || '';
    if (d.rva || d.size) m.row(dirT, [d.i, DIRS[d.i], hex(d.rva), hex(d.size), off === null ? '' : hex(off), sec], off !== null ? [off, Math.min(d.size, src.size - off)] : [d.at, 8]);
  }
  const dir = (i) => dirs.find((d) => d.i === i && d.rva) || null;

  const fmt = is64 ? 'PE32+' : 'PE32';
  const isDll = !!(coff.chars & 0x2000);
  const kind = opt.subsystem === 1 ? 'driver' : isDll ? 'DLL' : (coff.chars & 2) ? 'executable' : 'object';
  m.title = `${magic ? fmt : 'COFF'} ${kind}, ${name(MACHINES, coff.machine)}${opt.subsystem !== undefined ? `, ${name(SUBSYSTEMS, opt.subsystem)}` : ''}`;
  m.summary.push(['Format', magic ? `${fmt} (${is64 ? '64' : '32'}-bit)` : 'COFF'], ['Kind', kind], ['Machine', name(MACHINES, coff.machine)], ['Built', unixTime(coff.time)]);
  if (magic) {
    m.summary.push(['Subsystem', name(SUBSYSTEMS, opt.subsystem)], ['Entry point', `${hex(opt.entry)} (RVA)`], ['Image base', hex(opt.imageBase)]);
    const sec = [];
    sec.push(opt.dllChars & 0x40 ? 'ASLR on' : 'ASLR off', opt.dllChars & 0x100 ? 'DEP on' : 'DEP off');
    if (opt.dllChars & 0x4000) sec.push('Control Flow Guard');
    if (opt.dllChars & 0x20) sec.push('high-entropy ASLR');
    m.summary.push(['Security flags', sec.join(', ')]);
  }
  m.summary.push(['Sections', String(secs.length)]);

  // ---- imports ----
  const impT = m.table('imports', 'Imports', [['Name', 's'], ['Library', 's'], ['Ordinal', 's'], ['Hint', 'd'], ['Kind', 's'], ['IAT entry (RVA)', 'h']], [1, 0, 2]);
  const libT = m.table('libraries', 'Libraries', [['Library', 's'], ['Functions', 'd'], ['How', 's']], [0]);
  const libs = new Map();
  const thunkList = (rva, dll, kindName, iatRva) => {
    const tsz = is64 ? 8 : 4;
    let off = rvaToOff(rva);
    if (off === null) { m.warn(`${dll}: the import name table at RVA ${hex(rva)} is not in the file.`); return 0; }
    let n = 0;
    for (; n < L.maxThunks && m.budget.ok(); n++) {
      if (off + tsz > src.size) { m.warn(`${dll}: the import list runs past the end of the file.`); break; }
      const v = is64 ? src.u64(off, true) : BigInt(u32(off));
      if (v === 0n) break;
      const byOrd = is64 ? (v >> 63n) === 1n : (v >> 31n) === 1n;
      let fn = '', ord = '', hint = 0;
      if (byOrd) { ord = String(Number(v & 0xffffn)); fn = `#${ord}`; }
      else {
        const hr = Number(v & 0x7fffffffn);
        const ho = rvaToOff(hr);
        if (ho === null || ho + 2 > src.size) fn = `(name at RVA ${hex(hr)})`;
        else { hint = u16(ho); try { fn = src.cstr(ho + 2, 1024); } catch { fn = `(name at RVA ${hex(hr)})`; } }
      }
      if (!m.row(impT, [fn, dll, ord, hint, kindName, hex(iatRva + n * tsz)])) break;
      off += tsz;
    }
    if (n >= L.maxThunks) m.warn(`${dll}: more than ${L.maxThunks} imported names; the rest is not listed.`);
    return n;
  };
  m.part('Import directory', () => {
    const d = dir(1);
    if (!d) return;
    let off = rvaToOff(d.rva);
    if (off === null) { m.warn(`Import directory: RVA ${hex(d.rva)} is not in the file.`); return; }
    const seen = new Set();
    for (let i = 0; i < L.maxLibraries && m.budget.ok(); i++, off += 20) {
      if (off + 20 > src.size) { m.warn('Import directory: it runs past the end of the file.'); break; }
      const oft = u32(off), nameRva = u32(off + 12), ft = u32(off + 16);
      if (!oft && !nameRva && !ft) break;
      let dll;
      try { dll = strRva(nameRva, 512); } catch { dll = `(name at RVA ${hex(nameRva)})`; }
      const key = `${oft}:${ft}:${nameRva}`;
      if (seen.has(key)) { m.warn(`Import directory: ${dll} is listed twice with the same tables; the copy is skipped.`); continue; }
      seen.add(key);
      const n = thunkList(oft || ft, dll, 'import', ft);
      libs.set(dll, { n: (libs.get(dll) || { n: 0 }).n + n, how: 'import' });
    }
  });
  m.part('Delay-load imports', () => {
    const d = dir(13);
    if (!d) return;
    let off = rvaToOff(d.rva);
    if (off === null) return;
    for (let i = 0; i < L.maxLibraries && m.budget.ok(); i++, off += 32) {
      if (off + 32 > src.size) break;
      const attrs = u32(off), nameRva = u32(off + 4), iat = u32(off + 12), intRva = u32(off + 16);
      if (!nameRva && !iat && !intRva) break;
      // Old (VC6) descriptors hold virtual addresses, not RVAs.
      const fix = (v) => (attrs & 1 || !v ? v : Number((BigInt(v) - (opt.imageBase || 0n)) & 0xffffffffn));
      let dll;
      try { dll = strRva(fix(nameRva), 512); } catch { dll = `(name at ${hex(nameRva)})`; }
      const n = thunkList(fix(intRva), dll, 'delay-load', fix(iat));
      if (!libs.has(dll)) libs.set(dll, { n, how: 'delay-load' }); else libs.get(dll).n += n;
    }
  });
  for (const [dll, v] of libs) m.row(libT, [dll, v.n, v.how]);
  if (libs.size) { const names = [...libs.keys()]; m.summary.push(['Libraries', names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more` : names.join(', ')]); }

  // ---- exports ----
  const expT = m.table('exports', 'Exports', [['Name', 's'], ['Ordinal', 'd'], ['Address (RVA)', 'h'], ['Forwarded to', 's']], [0, 1]);
  m.part('Export directory', () => {
    const d = dir(0);
    if (!d) return;
    const off = rvaToOff(d.rva);
    if (off === null || off + 40 > src.size) { m.warn(`Export directory: RVA ${hex(d.rva)} is not in the file.`); return; }
    const nameRva = u32(off + 12), base = u32(off + 16);
    let nfun = u32(off + 20), nnames = u32(off + 24);
    const afun = u32(off + 28), anames = u32(off + 32), aords = u32(off + 36);
    let dllName = '';
    try { dllName = strRva(nameRva, 512); } catch { /* unnamed */ }
    if (dllName) m.summary.push(['Export name', dllName]);
    const cap = L.maxRows;
    if (nfun > cap) { m.warn(`Export directory: NumberOfFunctions is ${nfun}; reading ${cap}.`); nfun = cap; }
    if (nnames > cap) { m.warn(`Export directory: NumberOfNames is ${nnames}; reading ${cap}.`); nnames = cap; }
    const fo = rvaToOff(afun), no = rvaToOff(anames), oo = rvaToOff(aords);
    const names = new Map();
    if (no !== null && oo !== null) {
      const fitN = Math.min(Math.floor((src.size - no) / 4), Math.floor((src.size - oo) / 2));
      if (nnames > fitN) { m.warn('Export directory: the name list runs past the end of the file.'); nnames = Math.max(0, fitN); }
      for (let i = 0; i < nnames && m.budget.ok(); i++) {
        const idx = src.u16(oo + i * 2, true);
        let nm;
        try { nm = strRva(u32(no + i * 4), 1024); } catch { nm = `(name ${i})`; }
        if (!names.has(idx)) names.set(idx, nm);
      }
    }
    if (fo === null) { if (nfun) m.warn('Export directory: the address table is not in the file.'); return; }
    const fitF = Math.floor((src.size - fo) / 4);
    if (nfun > fitF) { m.warn('Export directory: the address table runs past the end of the file.'); nfun = Math.max(0, fitF); }
    for (let i = 0; i < nfun && m.budget.ok(); i++) {
      const rva = u32(fo + i * 4);
      if (!rva && !names.has(i)) continue;
      let fwd = '';
      if (rva >= d.rva && rva < d.rva + d.size) { try { fwd = strRva(rva, 512); } catch { fwd = '(forwarder)'; } }
      if (!m.row(expT, [names.get(i) || `#${base + i}`, base + i, hex(rva), fwd])) break;
    }
  });
  m.summary.push(['Imports', String(impT.rows.length)], ['Exports', String(expT.rows.length)]);

  // ---- debug directory (PDB path) ----
  const dbgT = m.table('debug', 'Debug directory', [['Type', 's'], ['Size', 'd'], ['RVA', 'h'], ['File offset', 'h'], ['Details', 's']], [0]);
  m.part('Debug directory', () => {
    const d = dir(6);
    if (!d) return;
    const off = rvaToOff(d.rva);
    if (off === null) return;
    const n = Math.min(Math.floor(d.size / 28), 64);
    for (let i = 0; i < n; i++) {
      const b = off + i * 28;
      if (b + 28 > src.size) break;
      const type = u32(b + 12), size = u32(b + 16), rva = u32(b + 20), ptr = u32(b + 24);
      let details = '';
      if (type === 2 && ptr + 24 <= src.size && u32(ptr) === 0x53445352) { // "RSDS"
        const g = src.bytes(ptr + 4, 16);
        const h2 = (a, bb) => Array.from(g.subarray(a, bb), (x) => x.toString(16).padStart(2, '0')).join('');
        const guid = [h2(0, 4).match(/../g).reverse().join(''), h2(4, 6).match(/../g).reverse().join(''), h2(6, 8).match(/../g).reverse().join(''), h2(8, 10), h2(10, 16)].join('-').toUpperCase();
        const age = u32(ptr + 20);
        let pdb = '';
        try { pdb = src.cstr(ptr + 24, 1024); } catch { /* none */ }
        details = `PDB ${pdb}, GUID {${guid}}, age ${age}`;
        if (pdb) m.summary.push(['PDB', pdb]);
      }
      m.row(dbgT, [name(DEBUG_TYPES, type), size, hex(rva), hex(ptr), details], ptr < src.size && size ? [ptr, Math.min(size, src.size - ptr)] : [b, 28]);
    }
  });

  // ---- .NET ----
  m.part('.NET header', () => {
    const d = dir(14);
    if (!d) return;
    const off = rvaToOff(d.rva);
    if (off === null || off + 24 > src.size) return;
    const g = m.group('.NET (CLR) header');
    const rt = `${u16(off + 4)}.${u16(off + 6)}`, mdRva = u32(off + 8), flags = u32(off + 16);
    g.fields.push(['Runtime header version', rt, off + 4, 4], ['Metadata RVA', hex(mdRva), off + 8, 4], ['Flags', flagList(flags, { 1: 'IL_ONLY', 2: '32BIT_REQUIRED', 8: 'STRONG_NAME_SIGNED', 0x10: 'NATIVE_ENTRYPOINT', 0x20000: '32BIT_PREFERRED' }), off + 16, 4]);
    let ver = '';
    const mo = rvaToOff(mdRva);
    if (mo !== null && mo + 16 <= src.size && u32(mo) === 0x424a5342) { // "BSJB"
      const len = Math.min(u32(mo + 12), 255);
      ver = src.fixed(mo + 16, Math.min(len, src.size - mo - 16));
      g.fields.push(['Metadata version', ver, mo + 16, len]);
    }
    m.summary.push(['.NET', ver ? `managed assembly, runtime ${ver}` : 'managed assembly']);
    m.title += ', .NET';
  });

  // ---- resources ----
  const resT = m.table('resources', 'Resources', [['Type', 's'], ['Name', 's'], ['Language', 'd'], ['Size', 'd'], ['RVA', 'h']], [0, 1, 2]);
  m.part('Resources', () => {
    const d = dir(2);
    if (!d) return;
    const root = rvaToOff(d.rva);
    if (root === null) return;
    const seen = new Set();
    let count = 0;
    const label = (entryName, isType) => {
      if (entryName & 0x80000000) {
        const so = root + (entryName & 0x7fffffff);
        if (so + 2 > src.size) return '?';
        const len = Math.min(u16(so), 256);
        const b = src.bytesUpTo(so + 2, len * 2);
        return new TextDecoder('utf-16le').decode(b);
      }
      return isType ? name(RES_TYPES, entryName) : String(entryName);
    };
    const walk = (dirOff, depth, path) => {
      if (depth > 3 || seen.has(dirOff) || dirOff + 16 > src.size) { if (seen.has(dirOff)) m.warn('Resources: a directory points back to an earlier one (a loop); that branch is skipped.'); return; }
      seen.add(dirOff);
      const n = Math.min(u16(dirOff + 12) + u16(dirOff + 14), 4096);
      for (let i = 0; i < n && count < 10000 && m.budget.ok(); i++) {
        const e = dirOff + 16 + i * 8;
        if (e + 8 > src.size) return;
        const nm = u32(e), target = u32(e + 4);
        const here = [...path, depth === 0 ? label(nm, true) : depth === 1 ? label(nm, false) : nm];
        if (target & 0x80000000) walk(root + (target & 0x7fffffff), depth + 1, here);
        else {
          const de = root + target;
          if (de + 16 > src.size) continue;
          const rva = u32(de), size = u32(de + 4);
          const fo = rvaToOff(rva);
          count++;
          m.row(resT, [here[0] || '', here[1] || '', typeof here[2] === 'number' ? here[2] : 0, size, hex(rva)], fo !== null ? [fo, Math.min(size, src.size - fo)] : null);
        }
      }
    };
    walk(root, 0, []);
  });

  // ---- certificate and overlay ----
  m.part('Certificate', () => {
    const d = dir(4);
    if (d && d.size) m.summary.push(['Signature', d.rva + d.size <= src.size ? `Authenticode data, ${d.size.toLocaleString('en-US')} bytes at ${hex(d.rva)}` : 'Authenticode entry points past the end of the file']);
    else if (magic) m.summary.push(['Signature', 'not signed']);
  });
  m.part('Overlay', () => {
    let end = opt.sizeOfHeaders || 0;
    for (const s of secs) if (s.rawSize && s.rawPtr + s.rawSize > end) end = s.rawPtr + s.rawSize;
    const cert = dir(4);
    const certEnd = cert ? cert.rva + cert.size : 0;
    const over = src.size - Math.max(end, cert && cert.rva >= end ? certEnd : 0);
    if (end && over > 0 && end < src.size) m.summary.push(['Overlay', `${over.toLocaleString('en-US')} bytes after the last section${cert && cert.rva >= end ? ' and the signature' : ''}`]);
  });

  return m.finish();
}

module.exports = { parsePe, isPe, MACHINES };

return module.exports; })();
M["macho"] = (() => { const module = { exports: {} }, exports = module.exports;

// Mach-O reader: 32 and 64-bit, either byte order, and universal (fat) files with each slice read on its own.
// Header, load commands, segments and sections, linked libraries, imports with their library (two-level namespace),
// exports (the export trie, with loop and depth guards, or the symbol table), symbols, UUID, platform and versions,
// code signature and encryption info.
const { hex, safe, uleb } = require('./source');
const { Model } = require('./model');

const CPU = { 7: 'x86', 0x01000007: 'x86-64', 12: 'ARM', 0x0100000c: 'ARM64', 0x0200000c: 'ARM64_32', 18: 'PowerPC', 0x01000012: 'PowerPC 64', 14: 'SPARC', 1: 'VAX', 6: 'MC680x0', 13: 'MC88000' };
const FILETYPES = { 1: 'OBJECT (object file)', 2: 'EXECUTE (executable)', 3: 'FVMLIB', 4: 'CORE (core dump)', 5: 'PRELOAD', 6: 'DYLIB (dynamic library)', 7: 'DYLINKER', 8: 'BUNDLE', 9: 'DYLIB_STUB', 10: 'DSYM (debug symbols)', 11: 'KEXT_BUNDLE (kernel extension)', 12: 'FILESET' };
const HFLAGS = { 0x1: 'NOUNDEFS', 0x4: 'DYLDLINK', 0x8: 'BINDATLOAD', 0x80: 'TWOLEVEL', 0x200: 'NOMULTIDEFS', 0x2000: 'SUBSECTIONS_VIA_SYMBOLS', 0x8000: 'WEAK_DEFINES', 0x10000: 'BINDS_TO_WEAK', 0x20000: 'ALLOW_STACK_EXECUTION', 0x200000: 'PIE', 0x800000: 'HAS_TLV_DESCRIPTORS', 0x1000000: 'NO_HEAP_EXECUTION', 0x2000000: 'APP_EXTENSION_SAFE', 0x80000000: 'DYLIB_IN_CACHE' };
const LC = {
  0x1: 'SEGMENT', 0x2: 'SYMTAB', 0x3: 'SYMSEG', 0x4: 'THREAD', 0x5: 'UNIXTHREAD', 0xb: 'DYSYMTAB', 0xc: 'LOAD_DYLIB', 0xd: 'ID_DYLIB', 0xe: 'LOAD_DYLINKER', 0xf: 'ID_DYLINKER',
  0x10: 'PREBOUND_DYLIB', 0x11: 'ROUTINES', 0x12: 'SUB_FRAMEWORK', 0x13: 'SUB_UMBRELLA', 0x14: 'SUB_CLIENT', 0x15: 'SUB_LIBRARY', 0x16: 'TWOLEVEL_HINTS', 0x17: 'PREBIND_CKSUM',
  0x80000018: 'LOAD_WEAK_DYLIB', 0x19: 'SEGMENT_64', 0x1a: 'ROUTINES_64', 0x1b: 'UUID', 0x8000001c: 'RPATH', 0x1d: 'CODE_SIGNATURE', 0x1e: 'SEGMENT_SPLIT_INFO', 0x8000001f: 'REEXPORT_DYLIB',
  0x20: 'LAZY_LOAD_DYLIB', 0x21: 'ENCRYPTION_INFO', 0x22: 'DYLD_INFO', 0x80000022: 'DYLD_INFO_ONLY', 0x80000023: 'LOAD_UPWARD_DYLIB', 0x24: 'VERSION_MIN_MACOSX', 0x25: 'VERSION_MIN_IPHONEOS',
  0x26: 'FUNCTION_STARTS', 0x27: 'DYLD_ENVIRONMENT', 0x80000028: 'MAIN', 0x29: 'DATA_IN_CODE', 0x2a: 'SOURCE_VERSION', 0x2b: 'DYLIB_CODE_SIGN_DRS', 0x2c: 'ENCRYPTION_INFO_64',
  0x2d: 'LINKER_OPTION', 0x2e: 'LINKER_OPTIMIZATION_HINT', 0x2f: 'VERSION_MIN_TVOS', 0x30: 'VERSION_MIN_WATCHOS', 0x31: 'NOTE', 0x32: 'BUILD_VERSION', 0x80000033: 'DYLD_EXPORTS_TRIE',
  0x80000034: 'DYLD_CHAINED_FIXUPS', 0x80000035: 'FILESET_ENTRY', 0x36: 'ATOM_INFO',
};
const PLATFORMS = { 1: 'macOS', 2: 'iOS', 3: 'tvOS', 4: 'watchOS', 5: 'bridgeOS', 6: 'Mac Catalyst', 7: 'iOS Simulator', 8: 'tvOS Simulator', 9: 'watchOS Simulator', 10: 'DriverKit', 11: 'visionOS', 12: 'visionOS Simulator' };
const SECT_TYPES = { 0: 'REGULAR', 1: 'ZEROFILL', 2: 'CSTRING_LITERALS', 3: '4BYTE_LITERALS', 4: '8BYTE_LITERALS', 5: 'LITERAL_POINTERS', 6: 'NON_LAZY_SYMBOL_POINTERS', 7: 'LAZY_SYMBOL_POINTERS', 8: 'SYMBOL_STUBS', 9: 'MOD_INIT_FUNC_POINTERS', 10: 'MOD_TERM_FUNC_POINTERS', 11: 'COALESCED', 12: 'GB_ZEROFILL', 13: 'INTERPOSING', 14: '16BYTE_LITERALS', 15: 'DTRACE_DOF', 17: 'THREAD_LOCAL_REGULAR', 18: 'THREAD_LOCAL_ZEROFILL', 19: 'THREAD_LOCAL_VARIABLES', 20: 'THREAD_LOCAL_VARIABLE_POINTERS', 21: 'THREAD_LOCAL_INIT_FUNCTION_POINTERS', 22: 'INIT_FUNC_OFFSETS' };
const DYLIB_CMDS = { 0xc: 'load', 0x80000018: 'weak', 0x8000001f: 'reexport', 0x20: 'lazy', 0x80000023: 'upward' };

const name = (map, v) => (map[v] !== undefined ? map[v] : hex(v));
const ver = (v) => `${v >>> 16}.${(v >> 8) & 0xff}.${v & 0xff}`;
const prot = (p) => (p & 1 ? 'r' : '-') + (p & 2 ? 'w' : '-') + (p & 4 ? 'x' : '-');
function cpuName(type, sub) {
  const base = name(CPU, type >>> 0);
  const s = sub & 0xffffff;
  if ((type >>> 0) === 0x0100000c && s === 2) return 'ARM64e';
  if ((type >>> 0) === 0x01000007 && s === 8) return 'x86-64h';
  if (type === 12 && s === 9) return 'ARMv7';
  if (type === 12 && s === 11) return 'ARMv7s';
  return base;
}

const MAGICS = { 0xfeedface: [false, true], 0xfeedfacf: [true, true], 0xcefaedfe: [false, false], 0xcffaedfe: [true, false] };

/** 'thin', 'fat', or '' for the first bytes of a file. */
function machoKind(src) {
  if (src.size < 8) return '';
  const be = src.u32(0, false);
  if (MAGICS[be]) return 'thin';
  if (be === 0xcafebabe || be === 0xcafebabf) {
    const n = src.u32(4, false);
    // Java class files start with CAFEBABE too; their next word is the class version (45 or more).
    if (n > 0 && n < 40) return 'fat';
  }
  return '';
}

function parseFat(src, budget, parseThin) {
  const m = new Model('Mach-O universal', budget);
  m.template = 'macho';
  const L = m.budget.limits;
  const is64 = src.u32(0, false) === 0xcafebabf;
  let n = src.u32(4, false);
  const g = m.group('Universal (fat) header');
  g.fields.push(['Magic', is64 ? 'FAT_MAGIC_64 (0xCAFEBABF)' : 'FAT_MAGIC (0xCAFEBABE)', 0, 4], ['Architectures', String(n), 4, 4]);
  const ent = is64 ? 32 : 20;
  const fit = Math.floor((src.size - 8) / ent);
  if (n > fit) { m.warn(`Universal header: ${n} architectures do not fit in the file; reading ${fit}.`); n = fit; }
  if (n > L.maxSlices) { m.warn(`Universal header: ${n} architectures; reading the first ${L.maxSlices}.`); n = L.maxSlices; }
  const t = m.table('slices', 'Architectures', [['#', 'd'], ['Architecture', 's'], ['CPU type', 'h'], ['CPU subtype', 'h'], ['Offset', 'h'], ['Size', 'h'], ['Align', 's']], [1]);
  m.slices = [];
  const archs = [];
  for (let i = 0; i < n; i++) {
    const b = 8 + i * ent;
    const cpu = src.u32(b, false), sub = src.u32(b + 4, false);
    const off = is64 ? safe(src.u64(b + 8, false)) : src.u32(b + 8, false);
    const size = is64 ? safe(src.u64(b + 16, false)) : src.u32(b + 12, false);
    const align = src.u32(b + (is64 ? 24 : 16), false);
    const arch = cpuName(cpu, sub);
    archs.push(arch);
    const okRange = off !== null && size !== null && off > 0 && off < src.size;
    m.row(t, [i, arch, hex(cpu), hex(sub), hex(off ?? 0), hex(size ?? 0), align < 32 ? `2^${align}` : String(align)], okRange ? [off, Math.min(size, src.size - off)] : [b, ent]);
    if (!okRange) { m.warn(`${arch}: the slice at ${hex(off ?? 0)} is outside the file.`); continue; }
    if (off + size > src.size) m.warn(`${arch}: the slice runs past the end of the file; it is read up to the end.`);
    if (archs.length > 1 && m.slices.some((s) => s.offset === off)) { m.warn(`${arch}: the slice starts where another one does; it is read once.`); continue; }
    let model;
    try { model = parseThin(src.slice(off, size), m.budget); }
    catch (e) { model = { format: 'Mach-O', title: `${arch} slice that could not be read`, summary: [], groups: [], tables: [], warnings: [String(e && e.message || e)] }; }
    m.slices.push({ arch, offset: off, size, model });
  }
  m.title = `Mach-O universal binary, ${archs.length} architecture${archs.length === 1 ? '' : 's'}: ${archs.join(', ')}`;
  m.summary.push(['Format', 'Mach-O universal (fat)'], ['Architectures', archs.join(', ') || 'none']);
  return m.finish();
}

function parseThin(src, budget) {
  const m = new Model('Mach-O', budget);
  m.template = 'macho';
  const L = m.budget.limits;
  const magic = src.u32(0, false);
  const [is64, be] = MAGICS[magic] || [];
  if (is64 === undefined) throw new Error(`magic ${hex(magic)} is not a Mach-O magic`);
  const le = !be;
  const u32 = (o) => src.u32(o, le), u16 = (o) => src.u16(o, le);
  const hsize = is64 ? 32 : 28;
  if (src.size < hsize) { m.title = 'Mach-O, header cut short'; m.warn(`The Mach-O header needs ${hsize} bytes; the data has ${src.size}.`); return m.finish(); }
  const hd = { cpu: u32(4), sub: u32(8), filetype: u32(12), ncmds: u32(16), sizeofcmds: u32(20), flags: u32(24) };
  const arch = cpuName(hd.cpu, hd.sub);
  const g = m.group('Mach-O header');
  g.fields.push(['Magic', `${hex(magic)} (${is64 ? '64' : '32'}-bit, ${le ? 'little' : 'big'} endian)`, 0, 4], ['CPU type', `${arch} (${hex(hd.cpu)})`, 4, 4], ['CPU subtype', hex(hd.sub), 8, 4],
    ['File type', name(FILETYPES, hd.filetype), 12, 4], ['Load commands', String(hd.ncmds), 16, 4], ['Size of load commands', String(hd.sizeofcmds), 20, 4],
    ['Flags', Object.entries(HFLAGS).filter(([b]) => (hd.flags & Number(b)) >>> 0 === Number(b)).map((x) => x[1]).join(' | ') || 'none', 24, 4]);
  const ftShort = { 1: 'object file', 2: 'executable', 6: 'dynamic library', 8: 'bundle', 7: 'dynamic linker', 10: 'dSYM companion', 11: 'kernel extension', 4: 'core dump' }[hd.filetype] || `file type ${hd.filetype}`;
  m.title = `Mach-O ${is64 ? '64' : '32'}-bit ${ftShort}, ${arch}`;
  m.summary.push(['Format', `Mach-O ${is64 ? '64' : '32'}-bit, ${le ? 'little' : 'big'} endian`], ['Kind', name(FILETYPES, hd.filetype)], ['Architecture', arch]);

  const cmdT = m.table('loadcommands', 'Load commands', [['#', 'd'], ['Command', 's'], ['Size', 'd'], ['Offset', 'h'], ['Details', 's']], [1, 4]);
  const segT = m.table('segments', 'Segments', [['Name', 's'], ['VM address', 'h'], ['VM size', 'h'], ['File offset', 'h'], ['File size', 'h'], ['Max prot', 's'], ['Init prot', 's'], ['Sections', 'd']], [0]);
  const secT = m.table('sections', 'Sections', [['Segment', 's'], ['Section', 's'], ['Address', 'h'], ['Size', 'h'], ['Offset', 'h'], ['Align', 's'], ['Type', 's'], ['Flags', 'h']], [0, 1]);
  const libT = m.table('libraries', 'Libraries', [['Library', 's'], ['How', 's'], ['Current version', 's'], ['Compatibility version', 's']], [0]);
  const dylibs = [];
  const linkedit = {};
  let symtab = null, entry = null;
  const lcStr = (cmdOff, cmdSize, strOff) => (strOff >= 8 && strOff < cmdSize ? src.cstr(cmdOff + strOff, Math.min(L.maxString, cmdSize - strOff)) : '');

  m.part('Load commands', () => {
    let off = hsize;
    const end = Math.min(src.size, hsize + hd.sizeofcmds);
    if (hsize + hd.sizeofcmds > src.size) m.warn(`Load commands: sizeofcmds (${hd.sizeofcmds}) runs past the end of the data.`);
    let n = Math.min(hd.ncmds, L.maxCommands);
    if (hd.ncmds > L.maxCommands) m.warn(`Load commands: ${hd.ncmds} commands; reading ${L.maxCommands}.`);
    for (let i = 0; i < n && m.budget.ok(); i++) {
      if (off + 8 > end) { m.warn(`Load commands: command ${i} of ${hd.ncmds} starts past the end of the command area.`); break; }
      const cmd = u32(off), size = u32(off + 4);
      if (size < 8 || off + size > end) { m.warn(`Load commands: command ${i} (${name(LC, cmd)}) has size ${size}, which ${size < 8 ? 'is too small' : 'runs past the command area'}; reading stopped there.`); break; }
      let details = '';
      try {
        if (cmd === 0x1 || cmd === 0x19) {
          const s64 = cmd === 0x19;
          const seg = src.fixed(off + 8, 16);
          const vmaddr = s64 ? src.u64(off + 24, le) : BigInt(u32(off + 24));
          const vmsize = s64 ? src.u64(off + 32, le) : BigInt(u32(off + 28));
          const fileoff = s64 ? src.u64(off + 40, le) : BigInt(u32(off + 32));
          const filesize = s64 ? src.u64(off + 48, le) : BigInt(u32(off + 36));
          const maxp = u32(off + (s64 ? 56 : 40)), initp = u32(off + (s64 ? 60 : 44)), nsects = u32(off + (s64 ? 64 : 48));
          const fo = safe(fileoff), fs = safe(filesize);
          m.row(segT, [seg, hex(vmaddr), hex(vmsize), hex(fileoff), hex(filesize), prot(maxp), prot(initp), nsects], fo !== null && fs !== null && fo < src.size && fs ? [fo, Math.min(fs, src.size - fo)] : [off, size]);
          details = `${seg} ${hex(vmaddr)} ${prot(initp)}, ${nsects} section${nsects === 1 ? '' : 's'}`;
          const ss = s64 ? 80 : 68, first = off + (s64 ? 72 : 56);
          const room = Math.floor((off + size - first) / ss);
          if (nsects > room) m.warn(`Segment ${seg}: ${nsects} sections do not fit in its load command; reading ${Math.max(0, room)}.`);
          for (let k = 0; k < Math.min(nsects, Math.max(0, room)); k++) {
            const b = first + k * ss;
            const sect = src.fixed(b, 16), sg = src.fixed(b + 16, 16);
            const addr = s64 ? src.u64(b + 32, le) : BigInt(u32(b + 32));
            const ssize = s64 ? src.u64(b + 40, le) : BigInt(u32(b + 36));
            const soff = u32(b + (s64 ? 48 : 40)), align = u32(b + (s64 ? 52 : 44)), flags = u32(b + (s64 ? 64 : 56));
            const type = flags & 0xff;
            const zero = type === 1 || type === 12 || type === 18;
            const sz = safe(ssize);
            m.row(secT, [sg, sect, hex(addr), hex(ssize), hex(soff), align < 32 ? `2^${align}` : String(align), name(SECT_TYPES, type), hex(flags >>> 0)], !zero && soff && soff < src.size && sz ? [soff, Math.min(sz, src.size - soff)] : null);
          }
        } else if (DYLIB_CMDS[cmd] || cmd === 0xd) {
          const nm = lcStr(off, size, u32(off + 8));
          const cur = ver(u32(off + 16)), compat = ver(u32(off + 20));
          if (cmd === 0xd) { m.summary.push(['Install name', nm]); g.fields.push(['Install name (LC_ID_DYLIB)', nm, off, size]); }
          else { dylibs.push(nm); if (dylibs.length <= L.maxLibraries) m.row(libT, [nm, DYLIB_CMDS[cmd], cur, compat], [off, size]); }
          details = `${nm} (${cur})`;
        } else if (cmd === 0x2) {
          symtab = { symoff: u32(off + 8), nsyms: u32(off + 12), stroff: u32(off + 16), strsize: u32(off + 20) };
          details = `${symtab.nsyms} symbols at ${hex(symtab.symoff)}, strings at ${hex(symtab.stroff)} (${symtab.strsize} bytes)`;
        } else if (cmd === 0xe || cmd === 0xf) {
          details = lcStr(off, size, u32(off + 8));
          if (cmd === 0xe) m.summary.push(['Dynamic linker', details]);
        } else if (cmd === 0x8000001c) {
          details = lcStr(off, size, u32(off + 8));
          m.summary.push(['RPATH', details]);
        } else if (cmd === 0x1b && size >= 24) {
          const b = src.bytes(off + 8, 16);
          const h = Array.from(b, (x) => x.toString(16).padStart(2, '0').toUpperCase()).join('');
          details = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
          m.summary.push(['UUID', details]);
        } else if (cmd === 0x80000028 && size >= 24) {
          entry = src.u64(off + 8, le);
          details = `entry offset ${hex(entry)}, stack ${hex(src.u64(off + 16, le))}`;
          m.summary.push(['Entry point', `${hex(entry)} (file offset of main)`]);
        } else if (cmd === 0x32 && size >= 24) {
          const plat = u32(off + 8), minos = u32(off + 12), sdk = u32(off + 16);
          details = `${name(PLATFORMS, plat)} ${ver(minos)}, SDK ${ver(sdk)}`;
          m.summary.push(['Platform', `${name(PLATFORMS, plat)}, minimum ${ver(minos)}, SDK ${ver(sdk)}`]);
        } else if ([0x24, 0x25, 0x2f, 0x30].includes(cmd) && size >= 16) {
          const plat = { 0x24: 'macOS', 0x25: 'iOS', 0x2f: 'tvOS', 0x30: 'watchOS' }[cmd];
          details = `${plat} ${ver(u32(off + 8))}, SDK ${ver(u32(off + 12))}`;
          m.summary.push(['Platform', `${plat}, minimum ${ver(u32(off + 8))}`]);
        } else if (cmd === 0x2a && size >= 16) {
          const v = src.u64(off + 8, le);
          details = [Number(v >> 40n), Number((v >> 30n) & 0x3ffn), Number((v >> 20n) & 0x3ffn), Number((v >> 10n) & 0x3ffn), Number(v & 0x3ffn)].join('.');
        } else if ([0x1d, 0x26, 0x29, 0x80000033, 0x80000034, 0x1e, 0x2b, 0x2e].includes(cmd) && size >= 16) {
          const dataoff = u32(off + 8), datasize = u32(off + 12);
          linkedit[cmd] = { dataoff, datasize };
          details = `${datasize.toLocaleString('en-US')} bytes at ${hex(dataoff)}`;
          if (cmd === 0x1d) m.summary.push(['Code signature', `${datasize.toLocaleString('en-US')} bytes at ${hex(dataoff)}`]);
        } else if ((cmd === 0x22 || cmd === 0x80000022) && size >= 48) {
          linkedit.dyld = { exportOff: u32(off + 40), exportSize: u32(off + 44) };
          details = `export trie ${u32(off + 44)} bytes at ${hex(u32(off + 40))}`;
        } else if ((cmd === 0x21 || cmd === 0x2c) && size >= 20) {
          const cryptid = u32(off + 16);
          details = `${u32(off + 12)} bytes at ${hex(u32(off + 8))}, ${cryptid ? 'encrypted' : 'not encrypted'}`;
          if (cryptid) m.summary.push(['Encryption', `encrypted (cryptid ${cryptid})`]);
        } else if (cmd === 0x2d && size >= 12) {
          details = `${u32(off + 8)} option string(s)`;
        }
      } catch (e) { details = `could not be read: ${e.message}`; }
      m.row(cmdT, [i, `LC_${name(LC, cmd)}`, size, hex(off), details], [off, size]);
      off += size;
    }
  });
  if (dylibs.length) m.summary.push(['Libraries', dylibs.length > 6 ? `${dylibs.slice(0, 6).join(', ')} and ${dylibs.length - 6} more` : dylibs.join(', ')]);

  // ---- symbols, imports ----
  const symT = m.table('symbols', 'Symbols', [['Name', 's'], ['Value', 'h'], ['Type', 's'], ['Section', 'd'], ['External', 's'], ['Library', 's']], [0]);
  const impT = m.table('imports', 'Imports', [['Name', 's'], ['Library', 's'], ['Weak', 's']], [1, 0]);
  const expT = m.table('exports', 'Exports', [['Name', 's'], ['Address', 'h'], ['Kind', 's']], [0]);
  const libOf = (desc) => {
    const ord = (desc >> 8) & 0xff;
    if (ord === 0) return 'self';
    if (ord === 0xfe) return 'main executable';
    if (ord === 0xff) return 'flat lookup';
    return dylibs[ord - 1] || `library #${ord}`;
  };
  const defined = [];
  m.part('Symbol table', () => {
    if (!symtab) return;
    const NSZ = is64 ? 16 : 12;
    if (symtab.symoff >= src.size && symtab.nsyms) { m.warn(`Symbol table: offset ${hex(symtab.symoff)} is past the end of the data.`); return; }
    let n = symtab.nsyms;
    const fit = Math.floor((src.size - symtab.symoff) / NSZ);
    if (n > fit) { m.warn(`Symbol table: ${n} symbols do not fit in the data; reading ${fit}.`); n = fit; }
    const strEnd = Math.min(src.size, symtab.stroff + symtab.strsize);
    for (let i = 0; i < n && m.budget.ok(); i++) {
      const b = symtab.symoff + i * NSZ;
      const strx = u32(b), type = src.u8(b + 4), sect = src.u8(b + 5), desc = u16(b + 6);
      const value = is64 ? src.u64(b + 8, le) : BigInt(u32(b + 8));
      if (type & 0xe0) continue; // debugger (stab) entries
      let nm = '';
      if (strx && symtab.stroff + strx < strEnd) nm = src.cstr(symtab.stroff + strx, Math.min(L.maxString, strEnd - symtab.stroff - strx));
      if (!nm) continue;
      const ext = !!(type & 1);
      const t = type & 0x0e;
      const tName = { 0: 'undefined', 2: 'absolute', 0xe: 'section', 0xc: 'prebound', 0xa: 'indirect' }[t] || hex(t);
      const lib = t === 0 && ext ? libOf(desc) : '';
      if (!m.row(symT, [nm, hex(value), tName, sect, ext ? (type & 0x10 ? 'private extern' : 'yes') : 'no', lib])) break;
      if (t === 0 && ext) m.row(impT, [nm, lib, desc & 0x80 ? 'weak' : '']);
      else if (t === 0xe && ext && !(type & 0x10)) defined.push([nm, value]);
    }
  });

  // ---- exports: the trie when there is one, else the defined external symbols ----
  m.part('Exports', () => {
    const trie = linkedit[0x80000033] ? { off: linkedit[0x80000033].dataoff, size: linkedit[0x80000033].datasize } : linkedit.dyld && linkedit.dyld.exportSize ? { off: linkedit.dyld.exportOff, size: linkedit.dyld.exportSize } : null;
    if (trie && trie.size) {
      const start = trie.off, end = Math.min(src.size, trie.off + trie.size);
      if (start >= src.size) { m.warn(`Export trie: offset ${hex(start)} is past the end of the data.`); return; }
      const seen = new Set();
      const stack = [[0, '']];
      let loops = 0;
      while (stack.length && m.budget.ok()) {
        const [node, prefix] = stack.pop();
        const at = start + node;
        if (seen.has(at)) { loops++; continue; }
        seen.add(at);
        if (at >= end) { m.warn('Export trie: a node offset points past the trie.'); continue; }
        const t = uleb(src, at, end);
        let p = at + t.len;
        const termSize = safe(t.value) ?? 0;
        if (termSize) {
          const q = p;
          const fl = uleb(src, q, end);
          const flags = safe(fl.value) ?? 0;
          let r = q + fl.len;
          if (flags & 0x8) {
            const ord = uleb(src, r, end); r += ord.len;
            const imp = src.cstr(r, Math.min(L.maxString, Math.max(1, end - r)));
            if (!m.row(expT, [prefix, '', `re-export from ${dylibs[(safe(ord.value) || 1) - 1] || 'library'}${imp ? ` (${imp})` : ''}`])) break;
          } else {
            const addr = uleb(src, r, end);
            const kinds = [flags & 0x3 ? (flags & 0x3) === 1 ? 'thread local' : 'absolute' : 'regular'];
            if (flags & 0x4) kinds.push('weak');
            if (flags & 0x10) kinds.push('stub and resolver');
            if (!m.row(expT, [prefix, hex(addr.value), kinds.join(', ')])) break;
          }
          p = q + termSize;
        }
        if (p >= end) continue;
        const kids = src.u8(p); p++;
        const children = [];
        for (let k = 0; k < kids && p < end; k++) {
          const label = src.cstr(p, Math.min(L.maxString, end - p));
          p += Buffer.byteLength(label) + 1;
          const child = uleb(src, p, end); p += child.len;
          if (prefix.length + label.length > L.maxString) { m.warn('Export trie: a name is longer than 4096 characters; that branch is skipped.'); continue; }
          children.push([safe(child.value) ?? -1, prefix + label]);
        }
        for (let k = children.length - 1; k >= 0; k--) if (children[k][0] >= 0) stack.push(children[k]);
        if (seen.size > 2 * L.maxRows) { m.warn('Export trie: too many nodes; reading stopped.'); break; }
      }
      if (loops) m.warn(`Export trie: ${loops} node link${loops === 1 ? '' : 's'} point back to a node already read (a loop); each node was read once.`);
    } else {
      for (const [nm, v] of defined) if (!m.row(expT, [nm, hex(v), 'symbol table'])) break;
    }
  });
  m.summary.push(['Segments', String(segT.rows.length)], ['Sections', String(secT.rows.length)], ['Imports', String(impT.rows.length)], ['Exports', String(expT.rows.length)]);
  return m.finish();
}

module.exports = { machoKind, parseFat, parseThin, cpuName, MAGICS };

return module.exports; })();
M["index"] = (() => { const module = { exports: {} }, exports = module.exports;

// One entry point: detect the format from the first bytes and run its reader. No vscode, no network.
const { Source } = require('./source');
const { Budget } = require('./model');
const { parseElf, isElf } = require('./elf');
const { parsePe, isPe } = require('./pe');
const { machoKind, parseFat, parseThin } = require('./macho');
const { detectType } = require('./bytes');

/** 'ELF' | 'PE' | 'Mach-O' | 'Mach-O universal' | '' */
function detect(src) {
  try {
    if (isElf(src)) return 'ELF';
    if (isPe(src)) return 'PE';
    const k = machoKind(src);
    if (k === 'thin') return 'Mach-O';
    if (k === 'fat') return 'Mach-O universal';
  } catch { /* too short */ }
  return '';
}

/** Short guess for files that are none of the three, for the "not a binary we read" message. */
function guess(src) {
  const b = src.bytesUpTo(0, 16);
  const s = String.fromCharCode(...b);
  if (b.length === 0) return 'an empty file';
  if (s.startsWith('!<arch>')) return 'a static library archive (ar); open the object files inside it';
  if (s.startsWith('dex\n')) return 'an Android DEX file';
  // The Hex engine's file type names (core/bytes.js): PNG, ZIP, PDF, Java class, WebAssembly and more.
  const t = detectType(b);
  if (t && !/executable|universal binary/.test(t)) return `${/^[AEIOU]/.test(t) ? 'an' : 'a'} ${t}`;
  return '';
}

function parse(src, limits) {
  const budget = new Budget(limits);
  const kind = detect(src);
  if (kind === 'ELF') return parseElf(src, budget);
  if (kind === 'PE') return parsePe(src, budget);
  if (kind === 'Mach-O') return parseThin(src, budget);
  if (kind === 'Mach-O universal') return parseFat(src, budget, parseThin);
  const g = guess(src);
  const e = new Error(`This is not an ELF, PE or Mach-O file${g ? `: it looks like ${g}` : ''}.`);
  e.code = 'NOT_BINARY';
  throw e;
}

function parseBuffer(buf, limits) { return parse(Source.fromBuffer(buf), limits); }

function parseFile(file, limits) {
  const src = Source.fromFile(file);
  try { const m = parse(src, limits); m.size = src.size; return m; } finally { src.close(); }
}

module.exports = { detect, parse, parseBuffer, parseFile };

return module.exports; })();
self.ZovoBin = { detect: M.index.detect, parse: M.index.parse, parseBuffer: M.index.parseBuffer, Source: M.source.Source };
})();
