/* XMind, FreeMind and OPML reader for the XMind Viewer page (TOOLCHK, wave18). Built by sprint/tools/bundle_xmind.py
   from the XMind Viewer extension (src/core, MIT, Zovo). It reads the file only: nothing here makes a request. */
'use strict';
(() => {
class Buffer extends Uint8Array {
  static alloc(n) { return new Buffer(n); }
  static from(x) { if (typeof x === 'string') return Buffer.from(new TextEncoder().encode(x)); if (x instanceof ArrayBuffer) return new Buffer(x); if (ArrayBuffer.isView(x)) { const b = new Buffer(x.byteLength); b.set(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)); return b; } return new Buffer(x); }
  static isBuffer(x) { return x instanceof Buffer; }
  static concat(list) { const n = list.reduce((a, x) => a + x.length, 0), out = new Buffer(n); let o = 0; for (const x of list) { out.set(x, o); o += x.length; } return out; }
  _dv() { return new DataView(this.buffer, this.byteOffset, this.byteLength); }
  readUInt16LE(o) { return this._dv().getUint16(o, true); } readUInt32LE(o) { return this._dv().getUint32(o, true); } readBigUInt64LE(o) { return this._dv().getBigUint64(o, true); }
  toString(enc, s = 0, e = this.length) { const b = this.subarray(s, e); return enc === 'latin1' || enc === 'binary' ? Array.from(b, c => String.fromCharCode(c)).join('') : enc === 'utf16le' ? new TextDecoder('utf-16le').decode(b) : enc === 'base64' ? btoa(Array.from(b, c => String.fromCharCode(c)).join('')) : new TextDecoder().decode(b); }
}
const pathStub = { basename: s => String(s).split(/[\\/]/).pop(), extname: s => { const m = /\.[^.\\/]*$/.exec(String(s).split(/[\\/]/).pop()); return m ? m[0] : ''; } };
const zlibProxy = { inflateRawSync: (d, o) => { const out = self.fflate.inflateSync(d); if (o && o.maxOutputLength && out.length > o.maxOutputLength) { const e = new Error('Cannot create a Buffer larger than the limit'); e.code = 'ERR_BUFFER_TOO_LARGE'; throw e; } return Buffer.from(out); } };
const blobReader = blob => ({ size: blob.size, async read(off, len) { return Buffer.from(await blob.slice(off, off + Math.max(0, len)).arrayBuffer()); }, async close() {} });
const M = {};
const require = n => n === 'zlib' ? zlibProxy : n === 'path' ? pathStub : n === 'fs' ? { promises: {} } : M[n.replace(/^\.\//, '')];
M["xml"] = (() => { const module = { exports: {} }, exports = module.exports;

// A small non-validating XML parser (from the Zovo PPTX viewer). It builds a plain tree:
// { name, attrs, children: [node | string] }. No DTDs, no external entities, no network.
// Shared design with the DOCX viewer: only depends on this file.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
      try { return String.fromCodePoint(cp); } catch { return ''; }
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
  });
}

const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function parseXml(text) {
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) { pushText(stack, text.slice(i)); break; }
    if (lt > i) pushText(stack, text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      const cdata = text.slice(lt + 9, end < 0 ? n : end);
      stack[stack.length - 1].children.push(cdata);
      i = end < 0 ? n : end + 3;
    } else if (text[lt + 1] === '?' || text[lt + 1] === '!') {
      const end = text.indexOf('>', lt);
      i = end < 0 ? n : end + 1;
    } else if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt);
      const name = text.slice(lt + 2, end < 0 ? n : end).trim();
      // Pop up to the matching element; tolerate bad nesting.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      i = end < 0 ? n : end + 1;
    } else {
      const end = findTagEnd(text, lt + 1);
      let body = text.slice(lt + 1, end);
      const selfClose = body.endsWith('/');
      if (selfClose) body = body.slice(0, -1);
      const sp = body.search(/[\s]/);
      const name = sp < 0 ? body : body.slice(0, sp);
      const attrs = {};
      if (sp >= 0) {
        ATTR_RE.lastIndex = 0;
        const rest = body.slice(sp);
        let m;
        while ((m = ATTR_RE.exec(rest))) attrs[m[1]] = decodeEntities(m[3] !== undefined ? m[3] : m[4]);
      }
      const node = { name, attrs, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
      i = end + 1;
    }
  }
  return root;
}

function findTagEnd(text, from) {
  let q = null;
  for (let k = from; k < text.length; k++) {
    const c = text[k];
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') return k;
  }
  return text.length;
}

function pushText(stack, raw) {
  if (!raw) return;
  stack[stack.length - 1].children.push(decodeEntities(raw));
}

// Local name without the namespace prefix: "a:t" -> "t".
function local(name) {
  const c = name.indexOf(':');
  return c < 0 ? name : name.slice(c + 1);
}

function elements(node) {
  return node && node.children ? node.children.filter((c) => typeof c !== 'string') : [];
}

// First child element with the given qualified name (e.g. "p:spTree").
function child(node, name) {
  return elements(node).find((c) => c.name === name) || null;
}

// Depth-first search for all descendants with the given qualified name.
function findAll(node, name, out = []) {
  for (const c of elements(node)) {
    if (c.name === name) out.push(c);
    findAll(c, name, out);
  }
  return out;
}

function find(node, name) {
  for (const c of elements(node)) {
    if (c.name === name) return c;
    const f = find(c, name);
    if (f) return f;
  }
  return null;
}

function textOf(node) {
  let s = '';
  for (const c of node.children || []) s += typeof c === 'string' ? c : textOf(c);
  return s;
}

module.exports = { parseXml, decodeEntities, local, elements, child, find, findAll, textOf };

return module.exports; })();
M["zip"] = (() => { const module = { exports: {} }, exports = module.exports;

// A small read-only ZIP reader for .xmind files. It reads the central directory from the end of the file with
// range reads, so a 30 MB map with pictures is never read whole. Each entry is inflated with a hard output
// limit (zlib maxOutputLength), so a zip bomb or a header that lies about the size stops at the limit.
// Entry names with "..", an absolute path, a drive letter or a backslash are refused. Nothing is ever written
// to disk: entries go to memory only.
const zlib = require('zlib');

class ZipError extends Error {
  constructor(message, code) { super(message); this.code = code || 'zip'; }
}

const MAX_ENTRIES = 50000;
const MAX_CD_BYTES = 32 * 1024 * 1024;
const MAX_RATIO = 1000; // uncompressed / compressed, checked once an entry is above 8 MB

/** A reader over a Buffer, for tests and for files that are not on a local disk. */
function bufferReader(buf) {
  return {
    size: buf.length,
    async read(offset, length) {
      if (offset < 0 || offset > buf.length) throw new ZipError('Read outside the file.', 'range');
      return buf.subarray(offset, Math.min(buf.length, offset + length));
    },
    async close() {},
  };
}

/** A reader over a local file with range reads. */
async function fileReader(fsPath) {
  const fsp = require('fs').promises;
  const fh = await fsp.open(fsPath, 'r');
  const st = await fh.stat();
  return {
    size: st.size,
    async read(offset, length) {
      const len = Math.max(0, Math.min(length, st.size - offset));
      const b = Buffer.alloc(len);
      let got = 0;
      while (got < len) {
        const { bytesRead } = await fh.read(b, got, len - got, offset + got);
        if (!bytesRead) break;
        got += bytesRead;
      }
      return got === len ? b : b.subarray(0, got);
    },
    async close() { await fh.close().catch(() => {}); },
  };
}

/** Why an entry name is not safe, or '' when it is fine. */
function unsafeName(name) {
  if (!name) return 'empty name';
  if (name.includes('\0')) return 'NUL in name';
  if (name.includes('\\')) return 'backslash in name';
  if (name.startsWith('/')) return 'absolute path';
  if (/^[a-zA-Z]:/.test(name)) return 'drive letter';
  if (name.split('/').some(s => s === '..')) return '".." in path';
  return '';
}

function isZipMagic(b) {
  return b && b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);
}

function decodeName(raw, utf8) {
  // XMind always writes UTF-8 names. Old tools may not set bit 11; UTF-8 decoding is still the best guess.
  return raw.toString('utf8');
}

/**
 * Reads the central directory. Returns { entries: Map(name -> entry), refused: [{name, reason}], count }.
 */
async function openZip(reader) {
  const size = reader.size;
  if (size < 22) throw new ZipError('The file is too small to be a ZIP package.', 'notzip');
  const head = await reader.read(0, 4);
  if (!isZipMagic(head)) throw new ZipError('This file is not a ZIP package, so it is not an XMind map. It may be damaged or an older XMind 3 file.', 'notzip');
  const tailLen = Math.min(size, 22 + 65535);
  const tail = await reader.read(size - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('The end of the ZIP directory is missing. The file may be cut off.', 'damaged');
  let count = tail.readUInt16LE(eocd + 10);
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOff = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    // ZIP64: find the ZIP64 end record through its locator.
    const loc = eocd - 20;
    if (loc < 0 || tail.readUInt32LE(loc) !== 0x07064b50) throw new ZipError('The ZIP64 directory is damaged.', 'damaged');
    const z64off = Number(tail.readBigUInt64LE(loc + 8));
    const z = await reader.read(z64off, 56);
    if (z.length < 56 || z.readUInt32LE(0) !== 0x06064b50) throw new ZipError('The ZIP64 directory is damaged.', 'damaged');
    count = Number(z.readBigUInt64LE(32));
    cdSize = Number(z.readBigUInt64LE(40));
    cdOff = Number(z.readBigUInt64LE(48));
  }
  if (count > MAX_ENTRIES) throw new ZipError(`The package has ${count} entries. More than ${MAX_ENTRIES} is not an XMind map.`, 'limit');
  if (cdSize > MAX_CD_BYTES || cdOff + cdSize > size) throw new ZipError('The ZIP directory is damaged or too large.', 'damaged');
  const cd = await reader.read(cdOff, cdSize);
  const entries = new Map();
  const refused = [];
  let p = 0;
  for (let k = 0; k < count; k++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) break;
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    let csize = cd.readUInt32LE(p + 20);
    let usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28);
    const xlen = cd.readUInt16LE(p + 30);
    const clen = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42);
    const name = decodeName(cd.subarray(p + 46, p + 46 + nlen), (flags & 0x800) !== 0);
    // ZIP64 extra field
    let x = p + 46 + nlen;
    const xend = x + xlen;
    while (x + 4 <= xend && x + 4 <= cd.length) {
      const id = cd.readUInt16LE(x), sz = cd.readUInt16LE(x + 2);
      if (id === 1) {
        let q = x + 4;
        if (usize === 0xffffffff && q + 8 <= x + 4 + sz) { usize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (csize === 0xffffffff && q + 8 <= x + 4 + sz) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (off === 0xffffffff && q + 8 <= x + 4 + sz) { off = Number(cd.readBigUInt64LE(q)); q += 8; }
      }
      x += 4 + sz;
    }
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue; // folder
    const why = unsafeName(name);
    if (why) { refused.push({ name: name.slice(0, 200), reason: why }); continue; }
    entries.set(name, { name, flags, method, csize, usize, offset: off, encrypted: (flags & 1) !== 0 });
  }
  return { entries, refused, count };
}

/**
 * Reads one entry into memory. maxBytes is the most this entry may inflate to; past it the read stops with
 * a ZipError (code 'bomb'). The declared size is not trusted.
 */
async function readEntry(reader, entry, maxBytes) {
  if (entry.encrypted) throw new ZipError(`${entry.name} is encrypted.`, 'encrypted');
  if (entry.usize > maxBytes) throw new ZipError(`${entry.name} unpacks to ${entry.usize} bytes, more than the limit of ${maxBytes}.`, 'limit');
  const lh = await reader.read(entry.offset, 30);
  if (lh.length < 30 || lh.readUInt32LE(0) !== 0x04034b50) throw new ZipError(`The entry ${entry.name} is damaged.`, 'damaged');
  const start = entry.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  if (start + entry.csize > reader.size) throw new ZipError(`The entry ${entry.name} is cut off.`, 'damaged');
  const data = await reader.read(start, entry.csize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new ZipError(`${entry.name} uses ZIP method ${entry.method}, which is not supported.`, 'method');
  // Inflate at most maxBytes + 1 bytes: one byte more than allowed proves the entry is too large.
  // The central directory size is trusted only as an upper bound: past it (plus a little slack) the entry lied.
  const limit = entry.usize > 0 ? Math.min(maxBytes, entry.usize + 65536) : maxBytes;
  let out;
  try {
    out = zlib.inflateRawSync(data, { maxOutputLength: limit + 1 });
  } catch (e) {
    if (e && (e.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength|buffer/i.test(String(e.message)))) {
      throw new ZipError(`${entry.name} unpacks to more than ${limit} bytes (the header said ${entry.usize}). This looks like a zip bomb, so it was not opened.`, 'bomb');
    }
    throw new ZipError(`${entry.name} could not be unpacked: ${e && e.message ? e.message : e}`, 'damaged');
  }
  if (out.length > limit) throw new ZipError(`${entry.name} unpacks to more than ${limit} bytes (the header said ${entry.usize}). This looks like a zip bomb, so it was not opened.`, 'bomb');
  if (out.length > 8 * 1024 * 1024 && entry.csize > 0 && out.length / entry.csize > MAX_RATIO) {
    throw new ZipError(`${entry.name} is packed ${Math.round(out.length / entry.csize)} times smaller than its content. This looks like a zip bomb, so it was not opened.`, 'bomb');
  }
  if (out.length !== entry.usize && entry.usize !== 0) {
    // A lying header. Small differences mean damage; the content is still used, with a note.
    entry.sizeMismatch = true;
  }
  return out;
}

module.exports = { openZip, readEntry, bufferReader, fileReader, unsafeName, isZipMagic, ZipError, MAX_RATIO };

return module.exports; })();
M["model"] = (() => { const module = { exports: {} }, exports = module.exports;

// Turns XMind 2020+ (content.json), XMind 8 (content.xml), FreeMind (.mm) and OPML into one plain model that
// the webview draws. Every walk is iterative, so a topic tree 100,000 levels deep cannot overflow the stack.
// Topic: { id, title, children[], markers[], labels[], note, href, image, equation, boundaries[], summaries[],
//          folded, fill, position, side }
// Sheet: { id, title, layout, structure, layoutNote, root, detached[], relationships[], counts, notes[] }
const { parseXml, local, textOf } = require('./xml');
const { unsafeName } = require('./zip');

const MAX_DEPTH = 10000;
const MAX_TITLE = 5000;
const MAX_NOTE = 20000;

const LAYOUTS = ['map', 'right', 'left', 'tree', 'org', 'orgup'];

/** XMind structure class -> { layout, note } */
function layoutOf(structure) {
  const s = String(structure || '').toLowerCase();
  if (!s) return { layout: 'map', note: '' };
  if (s.includes('.map')) return { layout: 'map', note: '' };
  if (s.includes('logic.left')) return { layout: 'left', note: '' };
  if (s.includes('logic.right')) return { layout: 'right', note: '' };
  if (s.includes('tree.')) return { layout: 'tree', note: '' };
  if (s.includes('org-chart.up')) return { layout: 'orgup', note: '' };
  if (s.includes('org-chart')) return { layout: 'org', note: '' };
  if (s.includes('fishbone')) return { layout: 'right', note: 'This sheet is a fishbone chart in XMind. It is shown as a Logic chart (right).' };
  if (s.includes('timeline')) return { layout: 'org', note: 'This sheet is a timeline in XMind. It is shown as an Org chart.' };
  if (s.includes('spreadsheet') || s.includes('treetable') || s.includes('matrix')) return { layout: 'right', note: 'This sheet is a matrix (tree table) in XMind. It is shown as a Logic chart (right).' };
  if (s.includes('brace')) return { layout: 'right', note: 'This sheet is a brace map in XMind. It is shown as a Logic chart (right).' };
  return { layout: 'map', note: '' };
}

function str(v, max) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  const s = String(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** "(0,2)" -> [0,2]; "(master)" or "master" -> 'master'; anything else -> null */
function parseRange(r, n) {
  const s = String(r || '').trim();
  if (/^\(?master\)?$/i.test(s)) return 'master';
  const m = /^\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (a > b || b >= n) return null;
  return [a, b];
}

/** "xap:resources/a.png" -> { src:'resources/a.png' } or { bad: reason } */
function imageRef(src) {
  let s = String(src || '').trim();
  if (!s) return null;
  if (/^xap:/i.test(s)) s = s.slice(4);
  else if (/^(https?:|data:|file:)/i.test(s)) return { bad: 'not inside the file (pictures are only read from inside the .xmind package)' };
  const why = unsafeName(s);
  if (why) return { bad: why };
  return { src: s };
}

function mathFromExtensions(ext) {
  if (!Array.isArray(ext)) return '';
  for (const e of ext) {
    if (!e || typeof e !== 'object' || !/math|latex|equation/i.test(String(e.provider || ''))) continue;
    const c = e.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      const hit = c.find(x => x && typeof x === 'object' && (x.name === 'content' || x.name === 'latex')) || c.find(x => x && typeof x.content === 'string');
      if (hit && typeof hit.content === 'string') return hit.content;
    }
    if (c && typeof c === 'object' && typeof c.content === 'string') return c.content;
  }
  return '';
}

class Builder {
  constructor() { this.ids = new Set(); this.seq = 0; this.notes = []; this.counts = { topics: 0, relationships: 0, boundaries: 0, summaries: 0, markers: 0, images: 0, notes: 0, labels: 0, equations: 0, links: 0 }; this.badImages = 0; this.badRanges = 0; this.depthCut = 0; this.dupIds = 0; }
  id(raw) {
    let id = typeof raw === 'string' && raw ? raw.slice(0, 200) : '';
    if (!id) id = '_t' + (++this.seq);
    if (this.ids.has(id)) { this.dupIds++; id = id + '_' + (++this.seq); }
    this.ids.add(id);
    return id;
  }
  topic(o) {
    const t = {
      id: this.id(o.id), title: str(o.title, MAX_TITLE), children: [],
      markers: [], labels: [], note: '', href: '', image: null, equation: '', boundaries: [], summaries: [], folded: !!o.folded,
    };
    this.counts.topics++;
    if (o.fill) t.fill = o.fill;
    if (o.color) t.color = o.color;
    if (o.position) t.position = o.position;
    if (o.side) t.side = o.side;
    if (o.callout) t.callout = true;
    for (const m of o.markers || []) { const id = str(m, 100); if (id) { t.markers.push(id); this.counts.markers++; } }
    for (const l of o.labels || []) { const s = str(l, 200); if (s) { t.labels.push(s); this.counts.labels++; } }
    if (o.note) { t.note = str(o.note, MAX_NOTE); if (t.note) this.counts.notes++; }
    if (o.href) { t.href = str(o.href, 4000); if (t.href) this.counts.links++; }
    if (o.image) {
      const r = imageRef(o.image.src);
      if (r && r.src) { t.image = { src: r.src, w: num(o.image.w), h: num(o.image.h) }; this.counts.images++; }
      else if (r && r.bad) { this.badImages++; t.imageRefused = r.bad; }
    }
    if (o.equation) { t.equation = str(o.equation, 4000); if (t.equation) this.counts.equations++; }
    return t;
  }
  finishNotes(sheetTitle) {
    if (this.badImages) this.notes.push(`${this.badImages} picture link(s) pointed outside the package and were not read.`);
    if (this.badRanges) this.notes.push(`${this.badRanges} boundary or summary range(s) did not match the topics and were left out.`);
    if (this.depthCut) this.notes.push(`Topics deeper than ${MAX_DEPTH} levels are not shown.`);
    if (this.dupIds) this.notes.push(`${this.dupIds} topic id(s) were used twice; the copies got new ids.`);
    return this.notes;
  }
}

function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 100000 ? n : 0; }

/**
 * Generic iterative tree build. src nodes are read through an adapter:
 *   a.fields(node) -> topic fields (title, markers, ...)
 *   a.attached(node) -> array of child src nodes
 *   a.detached(node) -> array (root only), a.summaryTopics(node) -> array, a.callouts(node) -> array (optional)
 *   a.boundaries(node) -> [{range,title}], a.summaries(node) -> [{range, topicId}]
 */
function buildTree(B, rootSrc, a) {
  const root = B.topic(a.fields(rootSrc, 0));
  const detached = [];
  const stack = [{ src: rootSrc, dst: root, depth: 0 }];
  while (stack.length) {
    const { src, dst, depth } = stack.pop();
    if (depth >= MAX_DEPTH) { B.depthCut++; continue; }
    const kids = a.attached(src);
    const pending = [];
    for (const k of kids) {
      const t = B.topic(a.fields(k, depth + 1));
      dst.children.push(t);
      pending.push({ src: k, dst: t, depth: depth + 1 });
    }
    // summary topics: built here, linked to the summary entries by id
    const sumTopics = new Map();
    for (const k of a.summaryTopics(src)) {
      const t = B.topic(a.fields(k, depth + 1));
      sumTopics.set(a.rawId(k), t);
      pending.push({ src: k, dst: t, depth: depth + 1 });
    }
    const n = dst.children.length;
    for (const b of a.boundaries(src)) {
      const r = parseRange(b.range, n);
      if (!r || (r !== 'master' && n === 0)) { B.badRanges++; continue; }
      dst.boundaries.push({ from: r === 'master' ? -1 : r[0], to: r === 'master' ? -1 : r[1], title: str(b.title, 500) });
      B.counts.boundaries++;
    }
    const usedSum = new Set();
    for (const s of a.summaries(src)) {
      const r = parseRange(s.range, n);
      if (!r || r === 'master') { B.badRanges++; continue; }
      const t = sumTopics.get(s.topicId) || null;
      if (t) usedSum.add(s.topicId);
      dst.summaries.push({ from: r[0], to: r[1], topic: t });
      B.counts.summaries++;
    }
    // A summary topic that no summary points to still shows, over all children.
    for (const [id, t] of sumTopics) if (!usedSum.has(id) && n > 0) dst.summaries.push({ from: 0, to: n - 1, topic: t, orphan: true });
    // Callouts (XMind 8 and 2020+): drawn as children after the attached ones, so boundary and summary
    // ranges (indexes into the attached children) still point at the same topics.
    for (const k of a.callouts ? a.callouts(src) : []) {
      const t = B.topic({ ...a.fields(k, depth + 1), callout: true });
      dst.children.push(t);
      pending.push({ src: k, dst: t, depth: depth + 1 });
    }
    if (depth === 0) {
      for (const k of a.detached(src)) {
        const t = B.topic(a.fields(k, 1));
        detached.push(t);
        pending.push({ src: k, dst: t, depth: 1 });
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) stack.push(pending[i]);
  }
  return { root, detached };
}

function finishSheet(B, raw) {
  const all = new Set();
  const walk = [raw.root, ...raw.detached];
  while (walk.length) {
    const t = walk.pop();
    all.add(t.id);
    for (const c of t.children) walk.push(c);
    for (const s of t.summaries) if (s.topic) walk.push(s.topic);
  }
  const rels = [];
  let badRels = 0;
  for (const r of raw.relationships || []) {
    if (!r || !all.has(r.from) || !all.has(r.to)) { badRels++; continue; } // from === to: a loop (Freeplane allows it)
    rels.push({ id: str(r.id, 200) || 'r' + rels.length, from: r.from, to: r.to, title: str(r.title, 500) });
  }
  B.counts.relationships = rels.length;
  const notes = B.finishNotes();
  if (badRels) notes.push(`${badRels} relationship(s) point to a topic that is not in this sheet and are not drawn.`);
  const lay = layoutOf(raw.structure);
  return {
    id: raw.id, title: raw.title, structure: raw.structure || '', layout: raw.layoutOverride || lay.layout, layoutNote: lay.note,
    root: raw.root, detached: raw.detached, relationships: rels, counts: B.counts, notes,
  };
}

// ---------- XMind 2020+ (content.json) ----------

const jsonAdapter = {
  rawId: o => (o && typeof o.id === 'string' ? o.id : ''),
  kids(o, key) {
    const c = o && o.children;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return [];
    const v = c[key];
    return Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : [];
  },
  attached(o) { return jsonAdapter.kids(o, 'attached'); },
  detached(o) { return jsonAdapter.kids(o, 'detached'); },
  summaryTopics(o) { return jsonAdapter.kids(o, 'summary'); },
  callouts(o) { return jsonAdapter.kids(o, 'callout'); },
  boundaries(o) { return Array.isArray(o.boundaries) ? o.boundaries.filter(b => b && typeof b === 'object').map(b => ({ range: b.range, title: b.title })) : []; },
  summaries(o) { return Array.isArray(o.summaries) ? o.summaries.filter(b => b && typeof b === 'object').map(b => ({ range: b.range, topicId: b.topicId })) : []; },
  fields(o) {
    const notes = o.notes && typeof o.notes === 'object' ? o.notes : null;
    let note = '';
    if (notes) {
      if (notes.plain && typeof notes.plain.content === 'string') note = notes.plain.content;
      else if (notes.realHTML && typeof notes.realHTML.content === 'string') note = htmlToText(notes.realHTML.content);
      else if (notes.html && typeof notes.html === 'object') note = htmlToText(JSON.stringify(notes.html));
    }
    const props = o.style && o.style.properties && typeof o.style.properties === 'object' ? o.style.properties : {};
    const img = o.image && typeof o.image === 'object' ? { src: o.image.src, w: o.image.width, h: o.image.height } : null;
    const pos = o.position && typeof o.position === 'object' && Number.isFinite(Number(o.position.x)) && Number.isFinite(Number(o.position.y)) ? { x: Number(o.position.x), y: Number(o.position.y) } : null;
    return {
      id: o.id, title: o.title, folded: o.branch === 'folded',
      markers: Array.isArray(o.markers) ? o.markers.map(m => (m && typeof m === 'object' ? m.markerId : m)) : [],
      labels: Array.isArray(o.labels) ? o.labels : [],
      note, href: typeof o.href === 'string' ? o.href : '', image: img,
      equation: mathFromExtensions(o.extensions),
      fill: colorOk(props['svg:fill']), color: colorOk(props['fo:color']), position: pos,
    };
  },
};

function colorOk(c) {
  return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : '';
}

function fromContentJson(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('content.json is not valid JSON: ' + (e && e.message ? e.message : e)); }
  if (data && !Array.isArray(data) && Array.isArray(data.sheets)) data = data.sheets;
  if (!Array.isArray(data)) throw new Error('content.json has no list of sheets.');
  const sheets = [];
  data.forEach((s, i) => {
    if (!s || typeof s !== 'object' || !s.rootTopic || typeof s.rootTopic !== 'object') return;
    const B = new Builder();
    const { root, detached } = buildTree(B, s.rootTopic, jsonAdapter);
    const rels = Array.isArray(s.relationships) ? s.relationships.filter(r => r && typeof r === 'object').map(r => ({ id: r.id, from: r.end1Id, to: r.end2Id, title: r.title })) : [];
    sheets.push(finishSheet(B, { id: str(s.id, 200) || 's' + i, title: str(s.title, 300) || `Sheet ${i + 1}`, structure: s.rootTopic.structureClass, root, detached, relationships: rels }));
  });
  if (!sheets.length) throw new Error('content.json has no sheet with a central topic.');
  return { format: 'xmind-json', sheets };
}

// ---------- XMind 8 (content.xml) ----------

const el = n => (n && n.children ? n.children.filter(c => typeof c !== 'string') : []);
const kid = (n, name) => el(n).find(c => local(c.name) === name) || null;
const kidsNamed = (n, name) => el(n).filter(c => local(c.name) === name);
const attr = (n, name) => { if (!n) return undefined; for (const k of Object.keys(n.attrs)) if (k === name || local(k) === name) return n.attrs[k]; return undefined; };

function xmlTopicsOfType(n, type) {
  const ch = kid(n, 'children');
  if (!ch) return [];
  const out = [];
  for (const ts of kidsNamed(ch, 'topics')) {
    if ((attr(ts, 'type') || 'attached') !== type) continue;
    for (const t of kidsNamed(ts, 'topic')) out.push(t);
  }
  return out;
}

const xmlAdapter = {
  rawId: n => attr(n, 'id') || '',
  attached: n => xmlTopicsOfType(n, 'attached'),
  detached: n => xmlTopicsOfType(n, 'detached'),
  summaryTopics: n => xmlTopicsOfType(n, 'summary'),
  callouts: n => xmlTopicsOfType(n, 'callout'),
  boundaries: n => { const b = kid(n, 'boundaries'); return b ? kidsNamed(b, 'boundary').map(x => ({ range: attr(x, 'range'), title: kid(x, 'title') ? textOf(kid(x, 'title')) : '' })) : []; },
  summaries: n => { const b = kid(n, 'summaries'); return b ? kidsNamed(b, 'summary').map(x => ({ range: attr(x, 'range'), topicId: attr(x, 'topic-id') })) : []; },
  fields(n) {
    const tt = kid(n, 'title');
    const notes = kid(n, 'notes');
    let note = '';
    if (notes) {
      const plain = kid(notes, 'plain');
      const html = kid(notes, 'html');
      note = plain ? textOf(plain) : html ? xmlBlocksText(html) : '';
    }
    const mr = kid(n, 'marker-refs');
    const labels = kid(n, 'labels');
    const img = kid(n, 'img');
    const pos = kid(n, 'position');
    let equation = '';
    const exts = kid(n, 'extensions');
    if (exts) for (const e of kidsNamed(exts, 'extension')) if (/math|latex|equation/i.test(attr(e, 'provider') || '')) { const c = kid(e, 'content'); equation = c ? textOf(c).trim() : textOf(e).trim(); }
    return {
      id: attr(n, 'id'), title: tt ? textOf(tt) : '', folded: attr(n, 'branch') === 'folded',
      markers: mr ? kidsNamed(mr, 'marker-ref').map(m => attr(m, 'marker-id')) : [],
      labels: labels ? kidsNamed(labels, 'label').map(l => textOf(l)) : [],
      note, href: attr(n, 'href') || '',
      image: img ? { src: attr(img, 'src'), w: attr(img, 'width'), h: attr(img, 'height') } : null,
      equation,
      position: pos && Number.isFinite(Number(attr(pos, 'x'))) ? { x: Number(attr(pos, 'x')), y: Number(attr(pos, 'y')) } : null,
    };
  },
};

function xmlBlocksText(n) {
  // Iterative text with line breaks between block elements.
  let s = '';
  const st = [n];
  while (st.length) {
    const x = st.pop();
    if (typeof x === 'string') { s += x; continue; }
    if (x === '\n') { s += '\n'; continue; }
    const ln = local(x.name);
    if (ln === 'p' || ln === 'div' || ln === 'li' || ln === 'br') st.push('\n');
    for (let i = x.children.length - 1; i >= 0; i--) st.push(x.children[i]);
  }
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

function fromContentXml(text) {
  const doc = parseXml(text);
  const top = el(doc).find(c => local(c.name) === 'xmap-content');
  if (!top) throw new Error('content.xml has no xmap-content element.');
  const sheets = [];
  kidsNamed(top, 'sheet').forEach((s, i) => {
    const rt = kid(s, 'topic');
    if (!rt) return;
    const B = new Builder();
    const { root, detached } = buildTree(B, rt, xmlAdapter);
    const relsEl = kid(s, 'relationships');
    const rels = relsEl ? kidsNamed(relsEl, 'relationship').map(r => ({ id: attr(r, 'id'), from: attr(r, 'end1'), to: attr(r, 'end2'), title: kid(r, 'title') ? textOf(kid(r, 'title')) : '' })) : [];
    const title = kid(s, 'title');
    sheets.push(finishSheet(B, { id: attr(s, 'id') || 's' + i, title: (title ? textOf(title) : '') || `Sheet ${i + 1}`, structure: attr(rt, 'structure-class'), root, detached, relationships: rels }));
  });
  if (!sheets.length) throw new Error('content.xml has no sheet with a central topic.');
  return { format: 'xmind-xml', sheets };
}

/** XMind 2020+ also writes a content.xml that only holds a warning. */
function isWarningStub(xmlText) {
  return /can ?not be opened normally|please do not modify and save/i.test(xmlText.slice(0, 4000));
}

// ---------- FreeMind / Freeplane (.mm) ----------

const FM_ICONS = { 'full-1': 'priority-1', 'full-2': 'priority-2', 'full-3': 'priority-3', 'full-4': 'priority-4', 'full-5': 'priority-5', 'full-6': 'priority-6', 'full-7': 'priority-7', 'full-8': 'priority-8', 'full-9': 'priority-9', button_ok: 'task-done', button_cancel: 'symbol-wrong', flag: 'flag-red', 'flag-green': 'flag-green', 'flag-blue': 'flag-blue', 'flag-yellow': 'flag-yellow', 'flag-orange': 'flag-orange', 'flag-black': 'flag-gray', idea: 'fm-idea', help: 'symbol-question', yes: 'star-yellow', messagebox_warning: 'symbol-exclam', stop: 'fm-stop', ksmiletris: 'smiley-smile', smiley_bad: 'smiley-cry', 'smily_bad': 'smiley-cry', go: 'fm-go', back: 'arrow-left', forward: 'arrow-right', up: 'arrow-up', down: 'arrow-down', clanbomber: 'fm-bomb', bookmark: 'fm-bookmark', info: 'fm-info', attach: 'fm-attach', password: 'fm-key', pencil: 'fm-pencil', calendar: 'fm-calendar', list: 'fm-list', 'very_positive': 'smiley-laugh', positive: 'smiley-smile', negative: 'smiley-cry', 'very_negative': 'smiley-angry' };

const fmAdapter = {
  rawId: n => attr(n, 'ID') || '',
  attached: n => kidsNamed(n, 'node'),
  detached: () => [],
  summaryTopics: () => [],
  boundaries: n => (kid(n, 'cloud') ? [{ range: 'master', title: '' }] : []),
  summaries: () => [],
  fields(n, depth) {
    let title = attr(n, 'TEXT');
    let note = '';
    for (const rc of kidsNamed(n, 'richcontent')) {
      const type = (attr(rc, 'TYPE') || '').toUpperCase();
      if (type === 'NOTE' || type === 'DETAILS') note = (note ? note + '\n' : '') + xmlBlocksText(rc);
      else if (type === 'NODE' && (title === undefined || title === '')) title = xmlBlocksText(rc);
    }
    const pos = (attr(n, 'POSITION') || '').toLowerCase();
    return {
      id: attr(n, 'ID'), title: title || '', folded: attr(n, 'FOLDED') === 'true',
      markers: kidsNamed(n, 'icon').map(i => { const b = attr(i, 'BUILTIN') || ''; return FM_ICONS[b] || (b ? 'fm-' + b : ''); }),
      labels: [], note, href: attr(n, 'LINK') || '', image: null, equation: '',
      side: depth === 1 && (pos === 'left' || pos === 'right') ? pos : '',
      fill: colorOk(attr(n, 'BACKGROUND_COLOR')), color: colorOk(attr(n, 'COLOR')),
    };
  },
};

function fromFreeMind(text, fileTitle) {
  const doc = parseXml(text);
  const map = el(doc).find(c => local(c.name) === 'map');
  const rn = map ? kid(map, 'node') : null;
  if (!rn) throw new Error('This .mm file has no <map><node> root, so it is not a FreeMind or Freeplane map.');
  const B = new Builder();
  const { root, detached } = buildTree(B, rn, fmAdapter);
  // arrow links: walk the source tree iteratively
  const rels = [];
  const st = [rn];
  while (st.length) {
    const n = st.pop();
    for (const a of kidsNamed(n, 'arrowlink')) rels.push({ id: attr(a, 'ID') || '', from: attr(n, 'ID'), to: attr(a, 'DESTINATION'), title: attr(a, 'MIDDLE_LABEL') || '' });
    for (const c of kidsNamed(n, 'node')) st.push(c);
  }
  return { format: 'freemind', sheets: [finishSheet(B, { id: 's0', title: fileTitle || 'Map', structure: '', root, detached, relationships: rels })] };
}

// ---------- OPML ----------

const opmlAdapter = {
  rawId: n => attr(n, 'id') || '',
  attached: n => kidsNamed(n, 'outline'),
  detached: () => [], summaryTopics: () => [], boundaries: () => [], summaries: () => [],
  fields(n) {
    if (n.synthetic) return { title: n.synthetic };
    return {
      title: attr(n, 'text') || attr(n, 'title') || '', note: attr(n, '_note') || attr(n, 'note') || '',
      href: attr(n, 'htmlUrl') || attr(n, 'url') || attr(n, 'xmlUrl') || '', markers: [], labels: [], folded: false,
    };
  },
};

function fromOpml(text, fileTitle) {
  const doc = parseXml(text);
  const opml = el(doc).find(c => local(c.name) === 'opml');
  const body = opml ? kid(opml, 'body') : null;
  if (!body) throw new Error('This file has no <opml><body>, so it is not an OPML outline.');
  const head = kid(opml, 'head');
  const ht = head ? kid(head, 'title') : null;
  const title = (ht ? textOf(ht).trim() : '') || fileTitle || 'Outline';
  const rootSrc = { name: 'outline', attrs: {}, children: body.children, synthetic: title };
  const B = new Builder();
  const { root, detached } = buildTree(B, rootSrc, opmlAdapter);
  return { format: 'opml', sheets: [finishSheet(B, { id: 's0', title, structure: '', layoutOverride: 'right', root, detached, relationships: [] })] };
}

module.exports = { fromContentJson, fromContentXml, fromFreeMind, fromOpml, isWarningStub, layoutOf, parseRange, imageRef, htmlToText, mathFromExtensions, LAYOUTS, MAX_DEPTH };

return module.exports; })();
M["load"] = (() => { const module = { exports: {} }, exports = module.exports;

// Opens one mind map file. .xmind is read through the range-reading ZIP reader; .mm and .opml are text.
const path = require('path');
const { openZip, readEntry, ZipError } = require('./zip');
const model = require('./model');

const MAX_CONTENT = 256 * 1024 * 1024; // content.json / content.xml after unpacking
const MAX_IMAGE = 32 * 1024 * 1024;    // one picture
const MAX_TEXT_FILE = 128 * 1024 * 1024; // .mm / .opml

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon' };

class LoadError extends Error {
  constructor(message, code) { super(message); this.code = code || 'load'; }
}

function kindOf(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  if (ext === '.xmind' || ext === '.xmt' || ext === '.xmap') return 'xmind';
  if (ext === '.mm') return 'mm';
  if (ext === '.opml') return 'opml';
  return 'xmind';
}

function decodeText(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  return buf.toString('utf8');
}

/**
 * reader: { size, read(off,len), close() } (see zip.js). Returns
 * { model: {format, sheets, notes, refused}, image(src) -> Promise<{mime, data:Buffer}>, close() }
 */
async function openMap(reader, fileName) {
  const kind = kindOf(fileName);
  const title = path.basename(String(fileName || 'map')).replace(/\.[^.]+$/, '');
  if (kind === 'mm' || kind === 'opml') {
    if (reader.size > MAX_TEXT_FILE) throw new LoadError(`This file is ${Math.round(reader.size / 1048576)} MB. Outline files above ${MAX_TEXT_FILE / 1048576} MB are not opened.`, 'size');
    const text = decodeText(await reader.read(0, reader.size));
    if (!/^\s*</.test(text.slice(0, 200).replace(/^﻿/, ''))) throw new LoadError(kind === 'mm' ? 'This .mm file is not XML, so it is not a FreeMind map.' : 'This file is not XML, so it is not an OPML outline.', 'format');
    const m = kind === 'mm' ? model.fromFreeMind(text, title) : model.fromOpml(text, title);
    m.notes = []; m.refused = [];
    return { model: m, async image() { throw new LoadError('No pictures in this file.'); }, close: () => reader.close() };
  }
  let zip;
  try { zip = await openZip(reader); } catch (e) {
    // A repository that keeps maps in Git LFS checks out a small text pointer when LFS is not installed.
    if (e.code === 'notzip' && reader.size > 0 && reader.size < 1024) {
      const head = (await reader.read(0, Math.min(reader.size, 200)).catch(() => Buffer.alloc(0))).toString('latin1');
      if (/^version https:\/\/git-lfs\.github\.com\/spec\//.test(head)) throw new LoadError('This file is a Git LFS pointer, not the map itself. The repository stores .xmind files in Git LFS. Run "git lfs install" and "git lfs pull" in the repository to download the map.', 'notzip');
    }
    throw new LoadError(e.message, e.code);
  }
  const { entries, refused } = zip;
  const notes = [];
  if (refused.length) notes.push(`${refused.length} entr${refused.length === 1 ? 'y' : 'ies'} in the package had an unsafe name (for example "${refused[0].name}": ${refused[0].reason}) and ${refused.length === 1 ? 'was' : 'were'} ignored. Nothing is written to disk.`);
  const get = async (name, max) => {
    const e = entries.get(name);
    if (!e) return null;
    try { return await readEntry(reader, e, max); } catch (err) { throw new LoadError(err.message, err.code); }
  };
  // Password: XMind keeps the encryption data in manifest.json (2020+) or META-INF/manifest.xml (XMind 8).
  // XMind 8 writes password-hint="" into the manifest of every file, also without a password, so a hint alone
  // proves nothing. A map counts as encrypted only when the manifest marks the content entry with encryption
  // data, or when the content cannot be read and the manifest says something is encrypted or has a hint.
  const manifest = await get('manifest.json', 4 * 1024 * 1024).catch(() => null);
  const manifestXml = await get('META-INF/manifest.xml', 4 * 1024 * 1024).catch(() => null);
  const info = manifestInfo(manifest ? decodeText(manifest) : '', manifestXml ? decodeText(manifestXml) : '');
  const contentName = entries.has('content.json') ? 'content.json' : 'content.xml';
  if (info.encrypted.has(contentName)) throw passwordError();
  const unreadable = what => (info.encrypted.size || info.hint)
    ? passwordError()
    : new LoadError(`${what} in this package is not readable text. The file may be damaged, or it was saved with a password by an XMind version that does not mark this in the manifest.`, 'unreadable');
  let m = null;
  const json = entries.has('content.json') ? await get('content.json', MAX_CONTENT) : null;
  if (json) {
    const text = decodeText(json);
    if (!looksLikeText(text, '{[')) throw unreadable('content.json');
    try { m = model.fromContentJson(text); } catch (e) { if (info.encrypted.size || info.hint) throw passwordError(); throw new LoadError(e.message, 'format'); }
  } else {
    const xml = await get('content.xml', MAX_CONTENT);
    if (!xml) {
      throw new LoadError(entries.size === 0 && refused.length
        ? 'Every entry in this package had an unsafe name, so nothing was read. It is not a normal XMind file.'
        : 'This package has no content.json and no content.xml, so it is not an XMind map.', 'format');
    }
    const text = decodeText(xml);
    if (!looksLikeText(text, '<')) throw unreadable('content.xml');
    if (model.isWarningStub(text) && !entries.has('content.json')) throw new LoadError('This XMind file has only the warning stub and no map content. It may be damaged.', 'format');
    try { m = model.fromContentXml(text); } catch (e) { if (info.encrypted.size || info.hint) throw passwordError(); throw new LoadError(e.message, 'format'); }
  }
  for (const e of entries.values()) if (e.sizeMismatch) notes.push(`The size stored for ${e.name} did not match its content. The file may be damaged.`);
  m.notes = notes;
  m.refused = refused;
  return {
    model: m,
    async image(src) {
      const name = String(src || '');
      const ext = path.extname(name).slice(1).toLowerCase();
      const mime = IMAGE_TYPES[ext];
      const e = entries.get(name);
      if (!e) throw new LoadError(`The picture ${name} is not in the package.`, 'missing');
      const data = await readEntry(reader, e, MAX_IMAGE).catch(err => { throw new LoadError(err.message, err.code); });
      return { mime: mime || sniff(data), data };
    },
    close: () => reader.close(),
  };
}

function passwordError() {
  return new LoadError('This map has a password. XMind encrypts the content of such files, so it can only be opened in XMind. Remove the password in XMind (File > Password) to view it here.', 'password');
}

const xmlUnescape = v => String(v).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Reads the XMind manifests. Returns { encrypted: Set of entry paths that carry encryption data, hint: string }.
 * manifest.json (XMind 2020+): {"file-entries": {"content.json": {"encryption-data": {...}}}, "password-hint": "..."}
 * META-INF/manifest.xml (XMind 8): <manifest password-hint=""><file-entry full-path="content.xml"><encryption-data .../></file-entry>
 * Only real encryption-data objects or elements count; names, attribute values and an empty hint do not.
 */
function manifestInfo(jsonText, xmlText) {
  const encrypted = new Set();
  let hint = '';
  if (jsonText) {
    let j = null;
    try { j = JSON.parse(jsonText); } catch { j = null; }
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const fe = j['file-entries'];
      if (fe && typeof fe === 'object') {
        for (const [name, v] of Object.entries(fe)) {
          if (v && typeof v === 'object' && ((v['encryption-data'] && typeof v['encryption-data'] === 'object') || (v.encryption && typeof v.encryption === 'object'))) encrypted.add(name);
        }
      }
      if (typeof j['password-hint'] === 'string') hint = j['password-hint'].trim();
    }
  }
  if (xmlText) {
    const x = xmlText.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
    const root = /<(?:[\w.-]+:)?manifest\b([^>]*)>/.exec(x);
    if (root) {
      const h = /\spassword-hint\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(root[1]);
      if (h && !hint) hint = xmlUnescape(h[1] != null ? h[1] : h[2]).trim();
    }
    const re = /<(?:[\w.-]+:)?file-entry\b([^>]*?)(\/?)>/g;
    let mt;
    while ((mt = re.exec(x))) {
      if (mt[2] === '/') continue;
      const p = /\sfull-path\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(mt[1]);
      const end = x.indexOf('file-entry>', re.lastIndex);
      const body = x.slice(re.lastIndex, end < 0 ? x.length : end);
      if (p && /<(?:[\w.-]+:)?encryption-data\b/.test(body)) encrypted.add(xmlUnescape(p[1] != null ? p[1] : p[2]));
    }
  }
  return { encrypted, hint };
}

// The content is readable when its first non-space character is one the format starts with and the start
// has no control bytes. Encrypted content is random bytes.
function looksLikeText(text, firstChars) {
  const head = text.slice(0, 512).replace(/^\uFEFF/, '');
  const t = head.trimStart();
  if (!t || !firstChars.includes(t[0])) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000E-\u001F\uFFFD]/.test(head);
}

function sniff(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
  if (/^\s*<(\?xml|svg)/.test(b.subarray(0, 100).toString('utf8'))) return 'image/svg+xml';
  return 'application/octet-stream';
}

module.exports = { openMap, kindOf, manifestInfo, LoadError, ZipError, MAX_CONTENT, MAX_IMAGE };

return module.exports; })();
self.ZovoMap = { openMap: M.load.openMap, kindOf: M.load.kindOf, blobReader };
})();
