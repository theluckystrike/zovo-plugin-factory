/* Packet capture engine for the PCAP Viewer page (TOOLCHK, wave18). Built by sprint/tools/bundle_pcap.py from the
   PCAP Viewer & PCAPNG Viewer extension (src/core: capture.js, dissect.js, filter.js, engine.js, MIT, Zovo).
   It reads bytes in memory only: nothing here opens a socket, resolves a name or runs code from a capture. */
'use strict';
(() => {
class Buffer extends Uint8Array {
  static alloc(n) { return new Buffer(n); }
  static allocUnsafe(n) { return new Buffer(n); }
  static from(x, enc) {
    if (typeof x === 'string') return Buffer.from(new TextEncoder().encode(x));
    if (x instanceof ArrayBuffer) return new Buffer(x);
    if (ArrayBuffer.isView(x)) { const b = new Buffer(x.byteLength); b.set(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)); return b; }
    return new Buffer(x);
  }
  static isBuffer(x) { return x instanceof Buffer; }
  _dv() { return new DataView(this.buffer, this.byteOffset, this.byteLength); }
  readUInt8(o) { return this[o]; }
  readUInt16BE(o) { return this._dv().getUint16(o); } readUInt16LE(o) { return this._dv().getUint16(o, true); }
  readUInt32BE(o) { return this._dv().getUint32(o); } readUInt32LE(o) { return this._dv().getUint32(o, true); }
  readInt32LE(o) { return this._dv().getInt32(o, true); }
  readBigInt64BE(o) { return this._dv().getBigInt64(o); } readBigInt64LE(o) { return this._dv().getBigInt64(o, true); }
  writeUInt8(v, o) { this[o] = v; return o + 1; }
  writeUInt16LE(v, o) { this._dv().setUint16(o, v, true); return o + 2; }
  writeUInt32LE(v, o) { this._dv().setUint32(o, v >>> 0, true); return o + 4; }
  writeInt32LE(v, o) { this._dv().setInt32(o, v, true); return o + 4; }
  copy(t, ts = 0, ss = 0, se = this.length) { const s = this.subarray(ss, se); t.set(s, ts); return s.length; }
  toString(enc) { return enc === 'latin1' || enc === 'binary' ? Array.from(this, c => String.fromCharCode(c)).join('') : enc === 'hex' ? Array.from(this, c => c.toString(16).padStart(2, '0')).join('') : new TextDecoder().decode(this); }
}
const setImmediate = f => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); f(); }; c.port2.postMessage(0); });
const nope = () => { throw new Error('not available in a browser'); };
const fsStub = { openSync: nope, readSync: nope, fstatSync: nope, closeSync() {}, statSync: nope, createReadStream: nope, writeSync: nope };
const zlibStub = { createGunzip: nope };
const M = {};
const require = n => n === 'fs' ? fsStub : n === 'zlib' ? zlibStub : M[n.replace(/^\.\//, '')];
M["capture"] = (() => { const module = { exports: {} }, exports = module.exports;

// Reads pcap and pcapng captures (also gzip-compressed) and builds a packet index: where each packet's bytes
// are, their lengths, the time and the interface. Pure Node; no native code and no network.
// Every length in the file is checked against the file size and a per-packet limit, so a damaged or hostile
// file ends with a clear warning instead of a loop, a hang or a huge allocation.
const fs = require('fs');
const zlib = require('zlib');

const MAX_CAPLEN = 262144;          // the largest packet libpcap and Wireshark write (256 KB)
const MAX_BLOCK = 16 * 1048576;     // the largest pcapng block we accept (16 MB)
const CHUNK = 4 * 1048576;          // read size for local files
const ZERO_RUN = 64;                // this many all-zero pcap records in a row = the rest is padding, not packets
const BOMB_MIN_OUT = 64 * 1048576;  // past this much unpacked data ...
const BOMB_RATIO = 200;             // ... a .gz that unpacks at more than 200 times its packed size is a gzip bomb

/** Random access to the capture bytes: a local file (read in ranges) or chunks in memory (gzip). */
class FileSource {
  constructor(path) { this.fd = fs.openSync(path, 'r'); this.size = fs.fstatSync(this.fd).size; }
  read(off, len) {
    len = Math.max(0, Math.min(len, this.size - off));
    const b = Buffer.allocUnsafe(len);
    let got = 0;
    while (got < len) { const n = fs.readSync(this.fd, b, got, len - got, off + got); if (n <= 0) break; got += n; }
    return got < len ? b.subarray(0, got) : b;
  }
  close() { try { fs.closeSync(this.fd); } catch {} }
}

class ChunkSource {
  constructor(chunks) {
    this.chunks = chunks; this.starts = []; let s = 0;
    for (const c of chunks) { this.starts.push(s); s += c.length; }
    this.size = s;
  }
  read(off, len) {
    len = Math.max(0, Math.min(len, this.size - off));
    if (len === 0) return Buffer.alloc(0);
    let lo = 0, hi = this.chunks.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.starts[m] <= off) lo = m; else hi = m - 1; }
    const c = this.chunks[lo], at = off - this.starts[lo];
    if (at + len <= c.length) return c.subarray(at, at + len);
    const out = Buffer.allocUnsafe(len); let got = 0, i = lo, p = at;
    while (got < len && i < this.chunks.length) {
      const n = Math.min(len - got, this.chunks[i].length - p);
      this.chunks[i].copy(out, got, p, p + n); got += n; i++; p = 0;
    }
    return out;
  }
  /** Drop the bytes after `end` (after the last packet), so a gzip bomb or trailing junk does not stay in memory. */
  trim(end) {
    if (end >= this.size) return;
    const keep = []; let s = 0;
    for (const c of this.chunks) { if (s >= end) break; keep.push(s + c.length > end ? Buffer.from(c.subarray(0, end - s)) : c); s += c.length; }
    this.chunks = keep; this.starts = []; let t = 0; for (const c of keep) { this.starts.push(t); t += c.length; }
    this.size = t;
  }
  close() { this.chunks = []; }
}

/** Decompress a .gz file in a stream, stopping at capBytes. Resolves { source, capped, compressed }. */
function gunzipToSource(path, capBytes, onProgress) {
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0, capped = false, done = false, readBytes = 0, bomb = 0;
    const compressed = fs.statSync(path).size;
    const input = fs.createReadStream(path, { highWaterMark: 1048576 });
    const gz = zlib.createGunzip({ chunkSize: 1048576 });
    input.on('data', d => { readBytes += d.length; });
    const finish = err => {
      if (done) return; done = true;
      input.destroy(); gz.destroy();
      if (err && !total) { reject(err); return; }
      resolve({ source: new ChunkSource(chunks), capped, bomb, compressed, gzError: err ? String(err.message || err) : '' });
    };
    gz.on('data', d => {
      if (done) return;
      if (total + d.length > capBytes) { chunks.push(Buffer.from(d.subarray(0, capBytes - total))); total = capBytes; capped = true; finish(); return; }
      chunks.push(Buffer.from(d)); total += d.length;
      // Real captures unpack at a few times their size; 200 times and more is a gzip bomb, so stop early.
      if (total > BOMB_MIN_OUT && gz.bytesWritten > 0 && total / gz.bytesWritten > BOMB_RATIO) { capped = true; bomb = Math.round(total / gz.bytesWritten); finish(); return; }
      if (onProgress) onProgress(total, readBytes, compressed);
    });
    gz.on('end', () => finish());
    gz.on('error', e => finish(e));
    input.on('error', e => finish(e));
    input.pipe(gz);
  });
}

function isGzip(head) { return head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b; }

/** Growable typed arrays for the packet index. */
class Index {
  constructor() { this.n = 0; this.cap = 0; this.grow(1024); this.comments = new Map(); this.noTs = new Set(); }
  grow(c) {
    const cp = (T, old) => { const a = new T(c); if (old) a.set(old.subarray(0, this.n)); return a; };
    this.off = cp(Float64Array, this.off); this.len = cp(Uint32Array, this.len); this.orig = cp(Uint32Array, this.orig);
    this.sec = cp(Float64Array, this.sec); this.ns = cp(Uint32Array, this.ns); this.ifc = cp(Uint16Array, this.ifc);
    this.cap = c;
  }
  push(off, len, orig, sec, ns, ifc) {
    if (this.n === this.cap) this.grow(this.cap * 2);
    const i = this.n++;
    this.off[i] = off; this.len[i] = len; this.orig[i] = orig; this.sec[i] = sec; this.ns[i] = ns; this.ifc[i] = ifc;
    return i;
  }
  trim() { if (this.cap > this.n + 1024) this.grow(this.n + 1); }
}

/** A sliding read window over a source so a 1 GB file is never in memory at once. */
class Window {
  constructor(src) { this.src = src; this.buf = Buffer.alloc(0); this.base = 0; }
  /** Returns the buffer and the position of `pos` in it, with at least `len` bytes (or fewer at the end of file). */
  get(pos, len) {
    if (pos < this.base || pos + len > this.base + this.buf.length) {
      this.buf = this.src.read(pos, Math.max(CHUNK, len)); this.base = pos;
    }
    return pos - this.base;
  }
}

function hex(n) { return '0x' + n.toString(16).toUpperCase(); }
function fmt(n) { return n.toLocaleString('en-US'); }
function pk(n) { return `${fmt(n)} packet${n === 1 ? '' : 's'}`; }

/** Split a 64-bit timestamp (hi, lo) in units of 1/10^d or 1/2^b seconds into seconds and nanoseconds. */
function splitTs(hi, lo, res) {
  if (res.dec !== undefined && res.dec <= 6) {
    const v = hi * 4294967296 + lo, div = 10 ** res.dec;
    const sec = Math.floor(v / div);
    return [sec, Math.round((v - sec * div) * (10 ** (9 - res.dec)))];
  }
  const v = (BigInt(hi) << 32n) | BigInt(lo);
  if (res.dec !== undefined) {
    const div = 10n ** BigInt(res.dec);
    const sec = v / div, frac = v % div;
    const ns = res.dec >= 9 ? frac / (10n ** BigInt(res.dec - 9)) : frac * (10n ** BigInt(9 - res.dec));
    return [Number(sec), Number(ns)];
  }
  const b = BigInt(res.bin), sec = v >> b, frac = v & ((1n << b) - 1n);
  return [Number(sec), Number((frac * 1000000000n) >> b)];
}

function tsResol(byte) { return (byte & 0x80) ? { bin: byte & 0x7f } : { dec: byte }; }

/**
 * Build the packet index. Calls onPacket(i, buf, at, len, linktype) for every packet (for name harvesting)
 * and onProgress(pos, size) now and then. Returns { format, index, interfaces, names, warnings, error }.
 */
async function indexCapture(src, opts = {}) {
  const onPacket = opts.onPacket || null, onProgress = opts.onProgress || null, yieldEvery = opts.yieldEvery || 0;
  const res = { format: '', index: new Index(), interfaces: [], names: [], warnings: [], error: '', section: {} };
  const size = src.size;
  if (size === 0) { res.error = 'The file is empty (0 bytes), so there are no packets to show.'; return res; }
  const head = src.read(0, Math.min(size, 64));
  if (head.length < 4) { res.error = `The file has only ${head.length} bytes. A capture file starts with a header of at least 24 bytes.`; return res; }
  const m = head.readUInt32LE(0);
  const PCAP = { 0xa1b2c3d4: [true, false], 0xd4c3b2a1: [false, false], 0xa1b23c4d: [true, true], 0x4d3cb2a1: [false, true] };
  if (m === 0x0a0d0d0a) return indexPcapng(src, res, onPacket, onProgress, yieldEvery);
  if (PCAP[m]) return indexPcap(src, res, PCAP[m][0], PCAP[m][1], onPacket, onProgress, yieldEvery);
  if (isGzip(head)) { res.error = 'This file is gzip-compressed. Rename it to end in .gz (for example capture.pcap.gz) to open it.'; return res; }
  res.error = `This is not a pcap or pcapng capture: the first 4 bytes are ${[...head.subarray(0, 4)].map(b => b.toString(16).padStart(2, '0')).join(' ')}. `
    + 'A pcap file starts with d4 c3 b2 a1 (or a1 b2 c3 d4, 4d 3c b2 a1, a1 b2 3c 4d) and a pcapng file with 0a 0d 0d 0a.';
  return res;
}

async function maybeYield(count, every, onProgress, pos, size) {
  if (every && count % every === 0) {
    if (onProgress) onProgress(pos, size);
    await new Promise(r => setImmediate(r));
  }
}

async function indexPcap(src, res, le, nano, onPacket, onProgress, yieldEvery) {
  const size = src.size;
  res.format = nano ? 'pcap (nanosecond)' : 'pcap';
  if (size < 24) { res.error = `The pcap header is cut off: the file has ${size} bytes and the header needs 24.`; return res; }
  const h = src.read(0, 24);
  const u16 = (b, o) => le ? b.readUInt16LE(o) : b.readUInt16BE(o);
  const u32 = (b, o) => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
  const linkRaw = u32(h, 20), snap = u32(h, 16);
  const linktype = linkRaw & 0x0fffffff;
  res.section = { version: `${u16(h, 4)}.${u16(h, 6)}`, byteOrder: le ? 'little-endian' : 'big-endian', snaplen: snap, resolution: nano ? 'nanoseconds' : 'microseconds' };
  res.interfaces.push({ linktype, name: '', snaplen: snap, res: nano ? { dec: 9 } : { dec: 6 } });
  const limit = Math.max(MAX_CAPLEN, Math.min(snap, 16 * 1048576));
  const win = new Window(src);
  let pos = 24, zeros = 0, count = 0;
  const idx = res.index;
  while (pos < size) {
    if (pos + 16 > size) { res.warnings.push(`The file ends inside the header of packet ${fmt(idx.n + 1)} (${size - pos} of 16 bytes at offset ${hex(pos)}). The capture was probably cut off while it was written.`); break; }
    let at = win.get(pos, 16);
    const b = win.buf;
    const sec = u32(b, at), frac = u32(b, at + 4), caplen = u32(b, at + 8), orig = u32(b, at + 12);
    if (sec === 0 && frac === 0 && caplen === 0 && orig === 0) {
      if (++zeros >= ZERO_RUN) {
        // Drop the zero records we already counted; they were padding.
        idx.n = Math.max(0, idx.n - (ZERO_RUN - 1));
        res.warnings.push(`From offset ${hex(pos - (ZERO_RUN - 1) * 16)} on, the file holds only zero bytes, not packets. Reading stopped there.`);
        break;
      }
    } else zeros = 0;
    if (caplen > limit) {
      res.warnings.push(`Packet ${fmt(idx.n + 1)} at offset ${hex(pos)} says it has ${fmt(caplen)} bytes, more than the ${fmt(limit)}-byte limit for one packet. The file is damaged from here, so reading stopped. ${pk(idx.n)} before it ${idx.n === 1 ? 'is' : 'are'} shown.`);
      break;
    }
    if (pos + 16 + caplen > size) {
      res.warnings.push(`Packet ${fmt(idx.n + 1)} says it has ${fmt(caplen)} bytes, but the file ends ${fmt(size - pos - 16)} bytes after its header. The capture was cut off; the packets before it are shown.`);
      break;
    }
    const ns = nano ? frac : frac * 1000;
    const i = idx.push(pos + 16, caplen, orig, sec + Math.floor(ns / 1e9), ns % 1e9, 0);
    if (onPacket && caplen) { at = win.get(pos + 16, caplen); onPacket(i, win.buf, at, caplen, linktype); }
    pos += 16 + caplen; count++;
    if (yieldEvery) await maybeYield(count, yieldEvery, onProgress, pos, size);
  }
  idx.trim();
  return res;
}

function readOptions(b, at, end, le) {
  const out = [];
  while (at + 4 <= end) {
    const code = le ? b.readUInt16LE(at) : b.readUInt16BE(at), len = le ? b.readUInt16LE(at + 2) : b.readUInt16BE(at + 2);
    if (code === 0) break;
    if (at + 4 + len > end) break;
    out.push([code, b.subarray(at + 4, at + 4 + len)]);
    at += 4 + ((len + 3) & ~3);
  }
  return out;
}

function optString(v) { return Buffer.from(v).toString('utf8').replace(/\0+$/, ''); }

async function indexPcapng(src, res, onPacket, onProgress, yieldEvery) {
  const size = src.size;
  res.format = 'pcapng';
  const win = new Window(src);
  const idx = res.index;
  let pos = 0, le = true, sectionIfs = [], count = 0, sections = 0;
  while (pos < size) {
    if (pos + 12 > size) { res.warnings.push(`The file ends inside a block header at offset ${hex(pos)} (${size - pos} bytes left). The capture was probably cut off.`); break; }
    let at = win.get(pos, 12);
    let b = win.buf;
    const typeLE = b.readUInt32LE(at);
    if (typeLE === 0x0a0d0d0a) {
      const bom = b.readUInt32LE(at + 8);
      if (bom === 0x1a2b3c4d) le = true; else if (bom === 0x4d3c2b1a) le = false;
      else { res.warnings.push(`Section header at offset ${hex(pos)} has an unknown byte-order mark ${hex(bom)}. Reading stopped.`); break; }
    } else if (pos === 0) { res.error = 'This pcapng file does not start with a section header block.'; return res; }
    const type = le ? b.readUInt32LE(at) : b.readUInt32BE(at);
    const blen = le ? b.readUInt32LE(at + 4) : b.readUInt32BE(at + 4);
    if (blen < 12 || blen % 4 !== 0) {
      res.warnings.push(`The block at offset ${hex(pos)} has a length of ${fmt(blen)} bytes, which is not possible (at least 12 and a multiple of 4). The file is damaged here, so reading stopped. ${pk(idx.n)} before it ${idx.n === 1 ? 'is' : 'are'} shown.`);
      break;
    }
    if (blen > MAX_BLOCK) {
      res.warnings.push(`The block at offset ${hex(pos)} says it is ${fmt(blen)} bytes, more than the 16 MB limit for one block. The file is damaged here, so reading stopped. ${pk(idx.n)} before it ${idx.n === 1 ? 'is' : 'are'} shown.`);
      break;
    }
    if (pos + blen > size) {
      res.warnings.push(`The block at offset ${hex(pos)} says it is ${fmt(blen)} bytes, but only ${fmt(size - pos)} bytes are left in the file. The capture was cut off or damaged; ${pk(idx.n)} before it ${idx.n === 1 ? 'is' : 'are'} shown.`);
      break;
    }
    at = win.get(pos, blen); b = win.buf;
    const u16 = o => le ? b.readUInt16LE(at + o) : b.readUInt16BE(at + o);
    const u32 = o => le ? b.readUInt32LE(at + o) : b.readUInt32BE(at + o);
    const tail = u32(blen - 4);
    if (tail !== blen) res.warnings.length < 20 && res.warnings.push(`The block at offset ${hex(pos)} has different lengths at its start (${fmt(blen)}) and end (${fmt(tail)}). It was read with the first one.`);
    if (type === 0x0a0d0d0a) {
      sections++; sectionIfs = [];
      if (sections === 1 && blen >= 28) {
        const o = readOptions(b, at + 24, at + blen - 4, le), sec = { version: `${u16(12)}.${u16(14)}`, byteOrder: le ? 'little-endian' : 'big-endian' };
        for (const [c, v] of o) { if (c === 2) sec.hardware = optString(v); if (c === 3) sec.os = optString(v); if (c === 4) sec.application = optString(v); if (c === 1) sec.comment = optString(v); }
        res.section = sec;
      }
    } else if (type === 1) {
      if (blen < 20) { res.warnings.push(`Interface block at offset ${hex(pos)} is too short.`); }
      else {
        const iface = { linktype: u16(8), snaplen: u32(12), name: '', res: { dec: 6 }, tsoffset: 0, description: '' };
        for (const [c, v] of readOptions(b, at + 16, at + blen - 4, le)) {
          if (c === 2) iface.name = optString(v);
          if (c === 3) iface.description = optString(v);
          if (c === 9 && v.length >= 1) iface.res = tsResol(v[0]);
          if (c === 14 && v.length >= 8) iface.tsoffset = Number(le ? v.readBigInt64LE(0) : v.readBigInt64BE(0));
        }
        if (res.interfaces.length >= 65535) { res.warnings.push('The file has more than 65,535 interfaces. Reading stopped.'); break; }
        res.interfaces.push(iface); sectionIfs.push(res.interfaces.length - 1);
      }
    } else if (type === 6 || type === 2) {
      // Enhanced packet block (6) and the old packet block (2).
      const ifId = type === 6 ? u32(8) : u16(8);
      const caplen = u32(20), orig = u32(24);
      const g = sectionIfs[ifId];
      if (g === undefined) {
        if (res.warnings.length < 20) res.warnings.push(`Packet block at offset ${hex(pos)} names interface ${ifId}, which the file does not describe. The packet was skipped.`);
      } else if (28 + caplen > blen - 4) {
        if (res.warnings.length < 20) res.warnings.push(`Packet block at offset ${hex(pos)} says its packet has ${fmt(caplen)} bytes, more than the block holds. The packet was skipped.`);
      } else {
        const iface = res.interfaces[g];
        const [sec, ns] = splitTs(u32(12), u32(16), iface.res);
        const i = idx.push(pos + 28, caplen, orig, sec + iface.tsoffset, ns, g);
        const optAt = at + 28 + ((caplen + 3) & ~3);
        if (optAt + 4 <= at + blen - 4) for (const [c, v] of readOptions(b, optAt, at + blen - 4, le)) if (c === 1) idx.comments.set(i, optString(v).slice(0, 4000));
        if (onPacket && caplen) onPacket(i, b, at + 28, caplen, iface.linktype);
        count++;
      }
    } else if (type === 3) {
      // Simple packet block: interface 0, no time stamp.
      const g = sectionIfs[0];
      if (g !== undefined) {
        const orig = u32(8), snap = res.interfaces[g].snaplen || 0;
        const caplen = Math.min(orig, blen - 16, snap > 0 ? snap : orig);
        const i = idx.push(pos + 12, caplen, orig, 0, 0, g);
        idx.noTs.add(i);
        if (onPacket && caplen) onPacket(i, b, at + 12, caplen, res.interfaces[g].linktype);
        count++;
      }
    } else if (type === 4) {
      // Name resolution block: IPv4 and IPv6 names the capture tool resolved when it ran.
      let o = at + 8; const end = at + blen - 4;
      while (o + 4 <= end) {
        const rt = le ? b.readUInt16LE(o) : b.readUInt16BE(o), rl = le ? b.readUInt16LE(o + 2) : b.readUInt16BE(o + 2);
        if (rt === 0 || o + 4 + rl > end) break;
        const v = b.subarray(o + 4, o + 4 + rl);
        if (rt === 1 && rl > 4) { const addr = [...v.subarray(0, 4)].join('.'); for (const n of optString(v.subarray(4)).split('\0').filter(Boolean)) res.names.push([addr, n, 'NRB']); }
        if (rt === 2 && rl > 16) { const addr = ipv6Str(v, 0); for (const n of optString(v.subarray(16)).split('\0').filter(Boolean)) res.names.push([addr, n, 'NRB']); }
        o += 4 + ((rl + 3) & ~3);
      }
    }
    // Other blocks (statistics, decryption secrets, custom, unknown) are skipped by their length.
    pos += blen;
    if (yieldEvery) await maybeYield(++count, yieldEvery, onProgress, pos, size);
  }
  idx.trim();
  return res;
}

function ipv6Str(b, o) {
  const w = []; for (let i = 0; i < 8; i++) w.push(((b[o + 2 * i] << 8) | b[o + 2 * i + 1]).toString(16));
  // collapse the longest run of zero words
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8;) { if (w[i] === '0') { let j = i; while (j < 8 && w[j] === '0') j++; if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; } i = j; } else i++; }
  if (best < 0) return w.join(':');
  return w.slice(0, best).join(':') + '::' + w.slice(best + bestLen).join(':');
}

/** Write packets as a classic pcap file (one link type) or pcapng (several). */
function buildExport(src, idx, interfaces, list, write) {
  const lts = new Set(); for (const i of list) lts.add(interfaces[idx.ifc[i]].linktype);
  const parts = { push(...b) { for (const x of b) write(x); } };
  if (lts.size <= 1) {
    const lt = lts.size ? [...lts][0] : 1;
    const h = Buffer.alloc(24);
    h.writeUInt32LE(0xa1b23c4d, 0); h.writeUInt16LE(2, 4); h.writeUInt16LE(4, 6); h.writeUInt32LE(MAX_CAPLEN, 16); h.writeUInt32LE(lt, 20);
    parts.push(h);
    for (const i of list) {
      const r = Buffer.alloc(16);
      r.writeUInt32LE(idx.sec[i] >>> 0, 0); r.writeUInt32LE(idx.ns[i], 4); r.writeUInt32LE(idx.len[i], 8); r.writeUInt32LE(idx.orig[i], 12);
      parts.push(r, Buffer.from(src.read(idx.off[i], idx.len[i])));
    }
    return { format: 'pcap', linktypes: [...lts] };
  }
  const shb = Buffer.alloc(28);
  shb.writeUInt32LE(0x0a0d0d0a, 0); shb.writeUInt32LE(28, 4); shb.writeUInt32LE(0x1a2b3c4d, 8); shb.writeUInt16LE(1, 12); shb.writeUInt16LE(0, 14);
  shb.writeInt32LE(-1, 16); shb.writeInt32LE(-1, 20); shb.writeUInt32LE(28, 24);
  parts.push(shb);
  const map = new Map();
  for (const lt of lts) {
    const idb = Buffer.alloc(32);
    idb.writeUInt32LE(1, 0); idb.writeUInt32LE(32, 4); idb.writeUInt16LE(lt, 8); idb.writeUInt32LE(MAX_CAPLEN, 12);
    idb.writeUInt16LE(9, 16); idb.writeUInt16LE(1, 18); idb.writeUInt8(9, 20); idb.writeUInt32LE(32, 28);
    map.set(lt, map.size); parts.push(idb);
  }
  for (const i of list) {
    const len = idx.len[i], pad = (4 - (len % 4)) % 4, blen = 32 + len + pad;
    const h = Buffer.alloc(28);
    const t = BigInt(Math.floor(idx.sec[i])) * 1000000000n + BigInt(idx.ns[i]);
    h.writeUInt32LE(6, 0); h.writeUInt32LE(blen, 4); h.writeUInt32LE(map.get(interfaces[idx.ifc[i]].linktype), 8);
    h.writeUInt32LE(Number(t >> 32n), 12); h.writeUInt32LE(Number(t & 0xffffffffn), 16); h.writeUInt32LE(len, 20); h.writeUInt32LE(idx.orig[i], 24);
    const tail = Buffer.alloc(pad + 4); tail.writeUInt32LE(blen, pad);
    parts.push(h, Buffer.from(src.read(idx.off[i], len)), tail);
  }
  return { format: 'pcapng', linktypes: [...lts] };
}

module.exports = { FileSource, ChunkSource, gunzipToSource, isGzip, indexCapture, splitTs, ipv6Str, buildExport, MAX_CAPLEN, Index };

return module.exports; })();
M["dissect"] = (() => { const module = { exports: {} }, exports = module.exports;

// Packet dissectors in plain JS. dissect() returns the columns of the packet list, the fields the display
// filter reads, and (when asked) a protocol tree whose nodes carry the byte range they came from, so the hex
// pane can link a field to its bytes and a byte to its field. Every read is checked against the packet end:
// a short or damaged header gives a "Malformed" node, never an exception or a read past the data.
const { ipv6Str } = require('./capture');

const ETHERTYPES = { 0x0800: 'IPv4', 0x0806: 'ARP', 0x86dd: 'IPv6', 0x8100: '802.1Q VLAN', 0x88a8: '802.1ad QinQ', 0x8847: 'MPLS', 0x88cc: 'LLDP', 0x8863: 'PPPoE Discovery', 0x8864: 'PPPoE Session', 0x0842: 'Wake-on-LAN', 0x88e5: 'MACsec', 0x8035: 'RARP' };
const IPPROTO = { 0: 'Hop-by-Hop', 1: 'ICMP', 2: 'IGMP', 4: 'IPIP', 6: 'TCP', 17: 'UDP', 41: 'IPv6', 43: 'Routing', 44: 'Fragment', 47: 'GRE', 50: 'ESP', 51: 'AH', 58: 'ICMPv6', 59: 'No Next Header', 60: 'Destination Options', 89: 'OSPF', 103: 'PIM', 112: 'VRRP', 132: 'SCTP' };
const LINKTYPES = { 0: 'BSD loopback', 1: 'Ethernet', 101: 'Raw IP', 105: 'IEEE 802.11', 108: 'OpenBSD loopback', 113: 'Linux cooked (SLL)', 127: 'IEEE 802.11 + radiotap', 228: 'Raw IPv4', 229: 'Raw IPv6', 276: 'Linux cooked v2 (SLL2)', 12: 'Raw IP', 14: 'Raw IP' };
const DNSTYPES = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 35: 'NAPTR', 41: 'OPT', 43: 'DS', 46: 'RRSIG', 47: 'NSEC', 48: 'DNSKEY', 64: 'SVCB', 65: 'HTTPS', 255: 'ANY', 257: 'CAA' };
const DNSRCODE = ['No error', 'Format error', 'Server failure', 'No such name', 'Not implemented', 'Refused'];
const DHCPTYPES = ['', 'Discover', 'Offer', 'Request', 'Decline', 'ACK', 'NAK', 'Release', 'Inform'];
const TLSCT = { 20: 'Change Cipher Spec', 21: 'Alert', 22: 'Handshake', 23: 'Application Data', 24: 'Heartbeat' };
const TLSHS = { 0: 'Hello Request', 1: 'Client Hello', 2: 'Server Hello', 4: 'New Session Ticket', 8: 'Encrypted Extensions', 11: 'Certificate', 12: 'Server Key Exchange', 13: 'Certificate Request', 14: 'Server Hello Done', 15: 'Certificate Verify', 16: 'Client Key Exchange', 20: 'Finished' };
const TLSVER = { 0x0300: 'SSL 3.0', 0x0301: 'TLS 1.0', 0x0302: 'TLS 1.1', 0x0303: 'TLS 1.2', 0x0304: 'TLS 1.3' };
const TLSEXT = { 0: 'server_name', 1: 'max_fragment_length', 5: 'status_request', 10: 'supported_groups', 11: 'ec_point_formats', 13: 'signature_algorithms', 16: 'application_layer_protocol_negotiation', 18: 'signed_certificate_timestamp', 21: 'padding', 22: 'encrypt_then_mac', 23: 'extended_master_secret', 35: 'session_ticket', 41: 'pre_shared_key', 43: 'supported_versions', 45: 'psk_key_exchange_modes', 51: 'key_share', 57: 'quic_transport_parameters', 65281: 'renegotiation_info', 17513: 'application_settings' };
const ICMPTYPES = { 0: 'Echo (ping) reply', 3: 'Destination unreachable', 4: 'Source quench', 5: 'Redirect', 8: 'Echo (ping) request', 9: 'Router advertisement', 10: 'Router solicitation', 11: 'Time-to-live exceeded', 12: 'Parameter problem', 13: 'Timestamp request', 14: 'Timestamp reply' };
const ICMP6TYPES = { 1: 'Destination Unreachable', 2: 'Packet Too Big', 3: 'Time Exceeded', 4: 'Parameter Problem', 128: 'Echo (ping) request', 129: 'Echo (ping) reply', 133: 'Router Solicitation', 134: 'Router Advertisement', 135: 'Neighbor Solicitation', 136: 'Neighbor Advertisement', 137: 'Redirect', 143: 'Multicast Listener Report v2' };
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'CONNECT', 'TRACE'];
const TLS_PORTS = new Set([443, 8443, 465, 993, 995, 636, 853, 5061, 6443, 9443]);

function hex2(n) { return n.toString(16).padStart(2, '0'); }
function hexN(n, w) { return '0x' + (n >>> 0).toString(16).padStart(w, '0'); }
function mac(b, o) { return `${hex2(b[o])}:${hex2(b[o + 1])}:${hex2(b[o + 2])}:${hex2(b[o + 3])}:${hex2(b[o + 4])}:${hex2(b[o + 5])}`; }
function ip4(b, o) { return `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`; }
function u16(b, o) { return (b[o] << 8) | b[o + 1]; }
function u32(b, o) { return ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); }
function ascii(b, s, e) { let t = ''; for (let i = s; i < e; i++) { const c = b[i]; t += c >= 32 && c < 127 ? String.fromCharCode(c) : '.'; } return t; }
function latin(b, s, e) { let t = ''; for (let i = s; i < e; i++) t += String.fromCharCode(b[i]); return t; }

/** Tree builder: nodes are [label, start, length, children?]. With tree off every call is a no-op. */
class Tree {
  constructor(on) { this.on = on; this.root = []; }
  add(parent, label, s, l) {
    if (!this.on) return null;
    const n = { n: label, s, l };
    (parent ? (parent.c || (parent.c = [])) : this.root).push(n);
    return n;
  }
}

/** Collects filter fields. Multi-valued fields become arrays. */
function setF(f, k, v) {
  const o = f[k];
  if (o === undefined) f[k] = v; else if (Array.isArray(o)) o.push(v); else f[k] = [o, v];
}

function bad(ctx, parent, what, s, l) {
  ctx.malformed = true;
  ctx.t.add(parent, `[Malformed: ${what}]`, s, Math.max(0, l));
  if (!ctx.expert) ctx.expert = what;
}

/**
 * Dissect one packet.
 * @param {Uint8Array} d packet bytes (caplen)
 * @param {number} linktype
 * @param {{tree?:boolean, orig?:number, number?:number}} opts
 */
function dissect(d, linktype, opts = {}) {
  const ctx = { d, end: d.length, t: new Tree(!!opts.tree), f: {}, protos: [], proto: '', src: '', dst: '', info: '', malformed: false, expert: '', l4: null };
  ctx.f['frame.len'] = opts.orig ?? d.length;
  ctx.f['frame.cap_len'] = d.length;
  if (opts.number !== undefined) ctx.f['frame.number'] = opts.number;
  ctx.protos.push('frame');
  const fr = ctx.t.add(null, `Frame ${opts.number ?? ''}: ${opts.orig ?? d.length} bytes on wire, ${d.length} bytes captured${linktype in LINKTYPES ? ` (${LINKTYPES[linktype]})` : ''}`, 0, d.length);
  if (fr) {
    ctx.t.add(fr, `Link type: ${LINKTYPES[linktype] || 'unknown'} (${linktype})`, 0, 0);
    if (opts.time) ctx.t.add(fr, `Arrival time: ${opts.time}`, 0, 0);
    if (opts.comment) ctx.t.add(fr, `Comment: ${opts.comment}`, 0, 0);
    if ((opts.orig ?? d.length) > d.length) ctx.t.add(fr, `[Packet cut to ${d.length} of ${opts.orig} bytes when it was captured]`, 0, 0);
  }
  try {
    link(ctx, linktype);
  } catch (e) {
    bad(ctx, null, 'dissector error ' + (e && e.message), 0, 0);
  }
  if (!ctx.proto) ctx.proto = ctx.protos[ctx.protos.length - 1].toUpperCase();
  if (ctx.malformed && ctx.expert) ctx.info = (ctx.info ? ctx.info + ' ' : '') + `[Malformed: ${ctx.expert}]`;
  for (const p of ctx.protos) setF(ctx.f, '_proto', p);
  return { proto: ctx.proto, src: ctx.src, dst: ctx.dst, info: ctx.info, protos: ctx.protos, f: ctx.f, tree: ctx.t.root, malformed: ctx.malformed, l4: ctx.l4, dnsAnswers: ctx.dnsAnswers || null };
}

function link(ctx, lt) {
  const { d } = ctx;
  if (lt === 1) return ether(ctx, 0);
  if (lt === 101 || lt === 12 || lt === 14 || lt === 228 || lt === 229) return rawip(ctx, 0);
  if (lt === 0 || lt === 108) {
    if (d.length < 4) return bad(ctx, null, 'loopback header shorter than 4 bytes', 0, d.length);
    // The family is in the byte order of the machine that wrote it; 2 is IPv4, 24/28/30 are IPv6.
    let fam = d[0] | (d[1] << 8) | (d[2] << 16) | (d[3] << 24);
    if (fam > 0xffff) fam = u32(d, 0);
    const n = ctx.t.add(null, `Null/Loopback, family: ${fam === 2 ? 'IPv4' : [24, 28, 30].includes(fam) ? 'IPv6' : fam} (${fam})`, 0, 4);
    ctx.t.add(n, `Family: ${fam}`, 0, 4);
    ctx.protos.push('null');
    if (fam === 2) return ipv4(ctx, 4);
    if (fam === 24 || fam === 28 || fam === 30) return ipv6(ctx, 4);
    return data(ctx, 4, null);
  }
  if (lt === 113) return sll(ctx);
  if (lt === 276) return sll2(ctx);
  if (lt === 105) return wlan(ctx, 0);
  if (lt === 127) {
    if (d.length < 4) return bad(ctx, null, 'radiotap header too short', 0, d.length);
    const rl = d[2] | (d[3] << 8);
    const n = ctx.t.add(null, `Radiotap header, length ${rl}`, 0, Math.min(rl, d.length));
    ctx.t.add(n, `Header length: ${rl}`, 2, 2);
    ctx.protos.push('radiotap');
    if (rl > d.length) return bad(ctx, null, 'radiotap length past the packet end', 0, d.length);
    return wlan(ctx, rl);
  }
  ctx.proto = LINKTYPES[lt] || `Link type ${lt}`;
  ctx.info = `Link type ${lt} is not decoded; the bytes are in the hex pane.`;
  ctx.t.add(null, `Data (${d.length} bytes, link type ${lt})`, 0, d.length);
}

function ether(ctx, o) {
  const { d } = ctx;
  if (d.length - o < 14) return bad(ctx, null, `Ethernet header needs 14 bytes, ${d.length - o} captured`, o, d.length - o);
  const dst = mac(d, o), src = mac(d, o + 6);
  let type = u16(d, o + 12);
  const n = ctx.t.add(null, `Ethernet II, Src: ${src}, Dst: ${dst}`, o, 14);
  ctx.t.add(n, `Destination: ${dst}`, o, 6);
  ctx.t.add(n, `Source: ${src}`, o + 6, 6);
  ctx.protos.push('eth');
  setF(ctx.f, 'eth.dst', dst); setF(ctx.f, 'eth.src', src); setF(ctx.f, 'eth.addr', dst); setF(ctx.f, 'eth.addr', src);
  ctx.src = src; ctx.dst = dst;
  if (type <= 1500) {
    ctx.t.add(n, `Length: ${type}`, o + 12, 2);
    ctx.proto = 'LLC'; ctx.protos.push('llc');
    ctx.info = `802.3 frame, ${type} bytes`;
    ctx.t.add(null, 'Logical-Link Control', o + 14, Math.min(3, d.length - o - 14));
    return;
  }
  ctx.t.add(n, `Type: ${ETHERTYPES[type] || 'Unknown'} (${hexN(type, 4)})`, o + 12, 2);
  setF(ctx.f, 'eth.type', type);
  return ethertype(ctx, type, o + 14);
}

function ethertype(ctx, type, o) {
  const { d } = ctx;
  if (type === 0x8100 || type === 0x88a8) {
    if (d.length - o < 4) return bad(ctx, null, '802.1Q tag cut off', o, d.length - o);
    const tci = u16(d, o), id = tci & 0x0fff, pcp = tci >> 13, inner = u16(d, o + 2);
    const n = ctx.t.add(null, `802.1Q Virtual LAN, PRI: ${pcp}, DEI: ${(tci >> 12) & 1}, ID: ${id}`, o, 4);
    ctx.t.add(n, `Priority: ${pcp}`, o, 1);
    ctx.t.add(n, `ID: ${id}`, o, 2);
    ctx.t.add(n, `Type: ${ETHERTYPES[inner] || 'Unknown'} (${hexN(inner, 4)})`, o + 2, 2);
    ctx.protos.push('vlan');
    setF(ctx.f, 'vlan.id', id); setF(ctx.f, 'vlan.priority', pcp);
    return ethertype(ctx, inner, o + 4);
  }
  if (type === 0x0800) return ipv4(ctx, o);
  if (type === 0x86dd) return ipv6(ctx, o);
  if (type === 0x0806 || type === 0x8035) return arp(ctx, o);
  ctx.proto = ETHERTYPES[type] || `0x${type.toString(16).padStart(4, '0')}`;
  ctx.protos.push((ETHERTYPES[type] || 'ethertype').toLowerCase().replace(/[^a-z0-9]/g, ''));
  ctx.info = `Ethernet type ${hexN(type, 4)}${ETHERTYPES[type] ? ` (${ETHERTYPES[type]})` : ''}, ${d.length - o} bytes`;
  ctx.t.add(null, `Data (${d.length - o} bytes)`, o, d.length - o);
}

function sll(ctx) {
  const { d } = ctx;
  if (d.length < 16) return bad(ctx, null, 'Linux cooked header needs 16 bytes', 0, d.length);
  const ptype = u16(d, 0), alen = u16(d, 4), proto = u16(d, 14);
  const pt = ['Unicast to us', 'Broadcast', 'Multicast', 'Unicast to another host', 'Sent by us'][ptype] || ptype;
  const addr = alen === 6 ? mac(d, 6) : [...d.subarray(6, 6 + Math.min(alen, 8))].map(hex2).join(':');
  const n = ctx.t.add(null, `Linux cooked capture v1, ${pt}, Source: ${addr}`, 0, 16);
  ctx.t.add(n, `Packet type: ${pt} (${ptype})`, 0, 2);
  ctx.t.add(n, `Link-layer address type: ${u16(d, 2)}`, 2, 2);
  ctx.t.add(n, `Link-layer address length: ${alen}`, 4, 2);
  ctx.t.add(n, `Source: ${addr}`, 6, 8);
  ctx.t.add(n, `Protocol: ${ETHERTYPES[proto] || 'Unknown'} (${hexN(proto, 4)})`, 14, 2);
  ctx.protos.push('sll'); ctx.src = addr;
  setF(ctx.f, 'sll.src', addr);
  return ethertype(ctx, proto, 16);
}

function sll2(ctx) {
  const { d } = ctx;
  if (d.length < 20) return bad(ctx, null, 'Linux cooked v2 header needs 20 bytes', 0, d.length);
  const proto = u16(d, 0), ifindex = u32(d, 4), ptype = d[10], alen = d[11];
  const pt = ['Unicast to us', 'Broadcast', 'Multicast', 'Unicast to another host', 'Sent by us'][ptype] || ptype;
  const addr = alen === 6 ? mac(d, 12) : [...d.subarray(12, 12 + Math.min(alen, 8))].map(hex2).join(':');
  const n = ctx.t.add(null, `Linux cooked capture v2, ${pt}, interface ${ifindex}, Source: ${addr}`, 0, 20);
  ctx.t.add(n, `Protocol: ${ETHERTYPES[proto] || 'Unknown'} (${hexN(proto, 4)})`, 0, 2);
  ctx.t.add(n, `Interface index: ${ifindex}`, 4, 4);
  ctx.t.add(n, `Link-layer address type: ${u16(d, 8)}`, 8, 2);
  ctx.t.add(n, `Packet type: ${pt} (${ptype})`, 10, 1);
  ctx.t.add(n, `Link-layer address length: ${alen}`, 11, 1);
  ctx.t.add(n, `Source: ${addr}`, 12, 8);
  ctx.protos.push('sll'); ctx.src = addr;
  setF(ctx.f, 'sll.src', addr);
  return ethertype(ctx, proto, 20);
}

function wlan(ctx, o) {
  const { d } = ctx;
  if (d.length - o < 10) return bad(ctx, null, '802.11 header too short', o, d.length - o);
  const fc = d[o] | (d[o + 1] << 8), type = (fc >> 2) & 3, sub = (fc >> 4) & 15;
  const kinds = ['Management', 'Control', 'Data', 'Extension'];
  const mgmt = { 0: 'Association Request', 1: 'Association Response', 4: 'Probe Request', 5: 'Probe Response', 8: 'Beacon', 10: 'Disassociation', 11: 'Authentication', 12: 'Deauthentication', 13: 'Action' };
  const ctrl = { 8: 'Block Ack Request', 9: 'Block Ack', 11: 'RTS', 12: 'CTS', 13: 'Ack' };
  const name = type === 0 ? (mgmt[sub] || `Management subtype ${sub}`) : type === 1 ? (ctrl[sub] || `Control subtype ${sub}`) : type === 2 ? (sub & 8 ? 'QoS Data' : 'Data') : 'Extension';
  const a1 = mac(d, o + 4), a2 = d.length - o >= 16 ? mac(d, o + 10) : '';
  const hl = type === 1 ? (d.length - o >= 16 ? 16 : 10) : Math.min(24 + (type === 2 && (sub & 8) ? 2 : 0), d.length - o);
  const n = ctx.t.add(null, `IEEE 802.11 ${name}`, o, hl);
  ctx.t.add(n, `Frame control: ${kinds[type]} frame, subtype ${sub} (${hexN(fc, 4)})`, o, 2);
  ctx.t.add(n, `Duration: ${d[o + 2] | (d[o + 3] << 8)}`, o + 2, 2);
  ctx.t.add(n, `Receiver address: ${a1}`, o + 4, 6);
  if (a2) ctx.t.add(n, `Transmitter address: ${a2}`, o + 10, 6);
  if (type !== 1 && d.length - o >= 24) ctx.t.add(n, `BSS Id: ${mac(d, o + 16)}`, o + 16, 6);
  ctx.protos.push('wlan');
  setF(ctx.f, 'wlan.ra', a1); if (a2) setF(ctx.f, 'wlan.ta', a2);
  ctx.proto = '802.11'; ctx.src = a2 || ''; ctx.dst = a1;
  ctx.info = name + (type === 2 ? ' (body not decoded; 802.11 decoding covers the header only)' : '');
  if (d.length - o > hl) ctx.t.add(null, `Frame body (${d.length - o - hl} bytes, not decoded)`, o + hl, d.length - o - hl);
}

function rawip(ctx, o) {
  const { d } = ctx;
  if (d.length - o < 1) return bad(ctx, null, 'empty packet', o, 0);
  const v = d[o] >> 4;
  ctx.protos.push('raw');
  if (v === 4) return ipv4(ctx, o);
  if (v === 6) return ipv6(ctx, o);
  return bad(ctx, null, `raw IP packet with version ${v}`, o, 1);
}

function arp(ctx, o) {
  const { d } = ctx;
  if (d.length - o < 8) return bad(ctx, null, 'ARP header cut off', o, d.length - o);
  const hlen = d[o + 4], plen = d[o + 5], op = u16(d, o + 6);
  const n = ctx.t.add(null, `Address Resolution Protocol (${op === 1 ? 'request' : op === 2 ? 'reply' : 'opcode ' + op})`, o, Math.min(8 + 2 * hlen + 2 * plen, d.length - o));
  ctx.t.add(n, `Hardware type: ${u16(d, o)}`, o, 2);
  ctx.t.add(n, `Protocol type: ${hexN(u16(d, o + 2), 4)}`, o + 2, 2);
  ctx.t.add(n, `Hardware size: ${hlen}`, o + 4, 1);
  ctx.t.add(n, `Protocol size: ${plen}`, o + 5, 1);
  ctx.t.add(n, `Opcode: ${op === 1 ? 'request' : op === 2 ? 'reply' : op} (${op})`, o + 6, 2);
  ctx.protos.push('arp'); ctx.proto = 'ARP';
  setF(ctx.f, 'arp.opcode', op);
  if (hlen !== 6 || plen !== 4 || d.length - o < 28) { ctx.info = `ARP opcode ${op}`; if (d.length - o < 8 + 2 * hlen + 2 * plen) bad(ctx, n, 'ARP addresses cut off', o + 8, d.length - o - 8); return; }
  const sha = mac(d, o + 8), spa = ip4(d, o + 14), tha = mac(d, o + 18), tpa = ip4(d, o + 24);
  ctx.t.add(n, `Sender MAC address: ${sha}`, o + 8, 6);
  ctx.t.add(n, `Sender IP address: ${spa}`, o + 14, 4);
  ctx.t.add(n, `Target MAC address: ${tha}`, o + 18, 6);
  ctx.t.add(n, `Target IP address: ${tpa}`, o + 24, 4);
  setF(ctx.f, 'arp.src.proto_ipv4', spa); setF(ctx.f, 'arp.dst.proto_ipv4', tpa); setF(ctx.f, 'arp.src.hw_mac', sha);
  ctx.info = op === 1 ? `Who has ${tpa}? Tell ${spa}` : op === 2 ? `${spa} is at ${sha}` : `ARP opcode ${op}`;
}

function ipv4(ctx, o) {
  const { d } = ctx;
  if (d.length - o < 20) return bad(ctx, null, `IPv4 header needs 20 bytes, ${d.length - o} captured`, o, d.length - o);
  const ver = d[o] >> 4, ihl = (d[o] & 15) * 4, tos = d[o + 1], tlen = u16(d, o + 2), id = u16(d, o + 4);
  const fl = u16(d, o + 6), ttl = d[o + 8], proto = d[o + 9], ck = u16(d, o + 10);
  const src = ip4(d, o + 12), dst = ip4(d, o + 16);
  const n = ctx.t.add(null, `Internet Protocol Version 4, Src: ${src}, Dst: ${dst}`, o, Math.min(Math.max(ihl, 20), d.length - o));
  ctx.t.add(n, `Version: ${ver}`, o, 1);
  ctx.t.add(n, `Header length: ${ihl} bytes (${d[o] & 15})`, o, 1);
  ctx.t.add(n, `Differentiated services: ${hexN(tos, 2)} (DSCP ${tos >> 2}, ECN ${tos & 3})`, o + 1, 1);
  ctx.t.add(n, `Total length: ${tlen}`, o + 2, 2);
  ctx.t.add(n, `Identification: ${hexN(id, 4)} (${id})`, o + 4, 2);
  const df = (fl >> 14) & 1, mf = (fl >> 13) & 1, foff = (fl & 0x1fff) * 8;
  ctx.t.add(n, `Flags: ${hexN(fl >> 13, 1)}${df ? ', Don\'t fragment' : ''}${mf ? ', More fragments' : ''}; fragment offset ${foff}`, o + 6, 2);
  ctx.t.add(n, `Time to live: ${ttl}`, o + 8, 1);
  ctx.t.add(n, `Protocol: ${IPPROTO[proto] || 'Unknown'} (${proto})`, o + 9, 1);
  ctx.t.add(n, `Header checksum: ${hexN(ck, 4)}`, o + 10, 2);
  ctx.t.add(n, `Source address: ${src}`, o + 12, 4);
  ctx.t.add(n, `Destination address: ${dst}`, o + 16, 4);
  ctx.protos.push('ip');
  const F = ctx.f;
  setF(F, 'ip.src', src); setF(F, 'ip.dst', dst); setF(F, 'ip.addr', src); setF(F, 'ip.addr', dst);
  setF(F, 'ip.proto', proto); setF(F, 'ip.ttl', ttl); setF(F, 'ip.len', tlen); setF(F, 'ip.id', id); setF(F, 'ip.version', 4);
  setF(F, 'ip.flags.df', df); setF(F, 'ip.flags.mf', mf); setF(F, 'ip.frag_offset', foff);
  ctx.src = src; ctx.dst = dst; ctx.proto = 'IPv4';
  ctx.info = `${IPPROTO[proto] || 'Protocol ' + proto}`;
  if (ver !== 4) return bad(ctx, n, `IP version field is ${ver}, not 4`, o, 1);
  if (ihl < 20) return bad(ctx, n, `IPv4 header length ${ihl} is less than 20 bytes (IHL ${d[o] & 15} < 5)`, o, 1);
  if (o + ihl > d.length) return bad(ctx, n, `IPv4 header length ${ihl} goes past the captured data`, o, d.length - o);
  if (ihl > 20) ctx.t.add(n, `Options (${ihl - 20} bytes)`, o + 20, ihl - 20);
  if (tlen < ihl) return bad(ctx, n, `IPv4 total length ${tlen} is less than the header length ${ihl}`, o + 2, 2);
  const end = Math.min(d.length, o + tlen);
  if (o + tlen > d.length && ctx.f['frame.len'] === d.length) bad(ctx, n, `IPv4 total length ${tlen} is more than the ${d.length - o} bytes in the packet`, o + 2, 2);
  if (foff > 0) {
    ctx.info = `Fragmented IP protocol (proto=${IPPROTO[proto] || proto} ${proto}, off=${foff}, ID=${id.toString(16)})`;
    ctx.proto = 'IPv4';
    ctx.t.add(null, `Fragment data (${end - o - ihl} bytes)`, o + ihl, end - o - ihl);
    return;
  }
  ctx.ipEnd = end;
  return ipPayload(ctx, proto, o + ihl, end, src, dst, 4, ttl);
}

function ipv6(ctx, o) {
  const { d } = ctx;
  if (d.length - o < 40) return bad(ctx, null, `IPv6 header needs 40 bytes, ${d.length - o} captured`, o, d.length - o);
  const vtf = u32(d, o), plen = u16(d, o + 4);
  let nxt = d[o + 6];
  const hlim = d[o + 7], src = ipv6Str(d, o + 8), dst = ipv6Str(d, o + 24);
  const n = ctx.t.add(null, `Internet Protocol Version 6, Src: ${src}, Dst: ${dst}`, o, 40);
  ctx.t.add(n, `Version: ${vtf >>> 28}`, o, 1);
  ctx.t.add(n, `Traffic class: ${hexN((vtf >>> 20) & 0xff, 2)}`, o, 2);
  ctx.t.add(n, `Flow label: ${hexN(vtf & 0xfffff, 5)}`, o + 1, 3);
  ctx.t.add(n, `Payload length: ${plen}`, o + 4, 2);
  ctx.t.add(n, `Next header: ${IPPROTO[nxt] || 'Unknown'} (${nxt})`, o + 6, 1);
  ctx.t.add(n, `Hop limit: ${hlim}`, o + 7, 1);
  ctx.t.add(n, `Source address: ${src}`, o + 8, 16);
  ctx.t.add(n, `Destination address: ${dst}`, o + 24, 16);
  ctx.protos.push('ipv6');
  const F = ctx.f;
  setF(F, 'ipv6.src', src); setF(F, 'ipv6.dst', dst); setF(F, 'ipv6.addr', src); setF(F, 'ipv6.addr', dst);
  setF(F, 'ipv6.hlim', hlim); setF(F, 'ipv6.plen', plen);
  ctx.src = src; ctx.dst = dst; ctx.proto = 'IPv6'; ctx.info = 'IPv6';
  const end = Math.min(d.length, o + 40 + plen);
  let p = o + 40;
  // Extension headers: Hop-by-Hop, Routing, Destination Options and Fragment.
  for (let k = 0; k < 8 && [0, 43, 60, 44, 51].includes(nxt); k++) {
    if (p + 8 > end) return bad(ctx, null, `IPv6 ${IPPROTO[nxt]} header cut off`, p, end - p);
    const hn = d[p], hl = nxt === 44 ? 8 : nxt === 51 ? (d[p + 1] + 2) * 4 : (d[p + 1] + 1) * 8;
    if (p + hl > end) return bad(ctx, null, `IPv6 ${IPPROTO[nxt]} header length ${hl} goes past the packet`, p, end - p);
    const e = ctx.t.add(null, `IPv6 ${IPPROTO[nxt]} header`, p, hl);
    ctx.t.add(e, `Next header: ${IPPROTO[hn] || 'Unknown'} (${hn})`, p, 1);
    ctx.t.add(e, `Length: ${hl} bytes`, p + 1, 1);
    setF(F, 'ipv6.ext', nxt);
    if (nxt === 0) ctx.protos.push('ipv6.hopopts');
    if (nxt === 44) {
      const fo = u16(d, p + 2) & 0xfff8;
      ctx.t.add(e, `Offset: ${fo}, More fragments: ${d[p + 3] & 1}`, p + 2, 2);
      if (fo > 0) { ctx.info = `IPv6 fragment (off=${fo})`; return; }
    }
    nxt = hn; p += hl;
  }
  setF(F, 'ipv6.nxt', nxt);
  ctx.ipEnd = end;
  return ipPayload(ctx, nxt, p, end, src, dst, 6, hlim);
}

function ipPayload(ctx, proto, o, end, src, dst, ver, ttl) {
  if (proto === 6) return tcp(ctx, o, end, src, dst, ver);
  if (proto === 17) return udp(ctx, o, end, src, dst, ver);
  if (proto === 1) return icmp(ctx, o, end, ttl);
  if (proto === 58) return icmpv6(ctx, o, end);
  if (proto === 4) { ctx.protos.push('ipip'); return ipv4(ctx, o); }
  if (proto === 41) return ipv6(ctx, o);
  ctx.proto = IPPROTO[proto] || (ver === 4 ? 'IPv4' : 'IPv6');
  ctx.protos.push((IPPROTO[proto] || 'ipproto').toLowerCase().replace(/[^a-z0-9]/g, ''));
  ctx.info = `${IPPROTO[proto] || 'IP protocol ' + proto}, ${end - o} bytes`;
  if (end > o) ctx.t.add(null, `${IPPROTO[proto] || 'Data'} (${end - o} bytes)`, o, end - o);
}

function icmp(ctx, o, end, ttl) {
  const { d } = ctx;
  if (end - o < 4) return bad(ctx, null, 'ICMP header cut off', o, end - o);
  const type = d[o], code = d[o + 1];
  const n = ctx.t.add(null, 'Internet Control Message Protocol', o, end - o);
  ctx.t.add(n, `Type: ${type} (${ICMPTYPES[type] || 'Unknown'})`, o, 1);
  ctx.t.add(n, `Code: ${code}`, o + 1, 1);
  ctx.t.add(n, `Checksum: ${hexN(u16(d, o + 2), 4)}`, o + 2, 2);
  ctx.protos.push('icmp'); ctx.proto = 'ICMP';
  setF(ctx.f, 'icmp.type', type); setF(ctx.f, 'icmp.code', code);
  ctx.info = ICMPTYPES[type] || `Type ${type}, code ${code}`;
  if ((type === 0 || type === 8 || type === 13 || type === 14) && end - o >= 8) {
    const id = u16(d, o + 4), seq = u16(d, o + 6);
    ctx.t.add(n, `Identifier (BE): ${id} (${hexN(id, 4)})`, o + 4, 2);
    ctx.t.add(n, `Sequence number (BE): ${seq} (${hexN(seq, 4)})`, o + 6, 2);
    if (end - o > 8) ctx.t.add(n, `Data (${end - o - 8} bytes)`, o + 8, end - o - 8);
    setF(ctx.f, 'icmp.ident', id); setF(ctx.f, 'icmp.seq', seq);
    ctx.info += ` id=${hexN(id, 4)}, seq=${seq}/${((seq & 0xff) << 8) | (seq >> 8)}, ttl=${ttl}`;
  } else if (end - o > 8) ctx.t.add(n, `Data (${end - o - 8} bytes)`, o + 8, end - o - 8);
}

function icmpv6(ctx, o, end) {
  const { d } = ctx;
  if (end - o < 4) return bad(ctx, null, 'ICMPv6 header cut off', o, end - o);
  const type = d[o], code = d[o + 1];
  const n = ctx.t.add(null, 'Internet Control Message Protocol v6', o, end - o);
  ctx.t.add(n, `Type: ${ICMP6TYPES[type] || 'Unknown'} (${type})`, o, 1);
  ctx.t.add(n, `Code: ${code}`, o + 1, 1);
  ctx.t.add(n, `Checksum: ${hexN(u16(d, o + 2), 4)}`, o + 2, 2);
  ctx.protos.push('icmpv6'); ctx.proto = 'ICMPv6';
  setF(ctx.f, 'icmpv6.type', type); setF(ctx.f, 'icmpv6.code', code);
  ctx.info = ICMP6TYPES[type] || `Type ${type}`;
  if ((type === 128 || type === 129) && end - o >= 8) {
    const id = u16(d, o + 4), seq = u16(d, o + 6);
    ctx.t.add(n, `Identifier: ${hexN(id, 4)}`, o + 4, 2);
    ctx.t.add(n, `Sequence: ${seq}`, o + 6, 2);
    setF(ctx.f, 'icmpv6.echo.seq', seq);
    ctx.info += ` id=${hexN(id, 4)}, seq=${seq}`;
  }
  if ((type === 135 || type === 136) && end - o >= 24) {
    const tgt = ipv6Str(d, o + 8);
    ctx.t.add(n, `Target address: ${tgt}`, o + 8, 16);
    setF(ctx.f, 'icmpv6.nd.target', tgt);
    ctx.info += type === 135 ? ` for ${tgt}` : ` ${tgt}`;
  }
}

function tcp(ctx, o, end, src, dst, ver) {
  const { d } = ctx;
  if (end - o < 20) return bad(ctx, null, `TCP header needs 20 bytes, ${end - o} captured`, o, end - o);
  const sp = u16(d, o), dp = u16(d, o + 2), seq = u32(d, o + 4), ack = u32(d, o + 8);
  const doff = (d[o + 12] >> 4) * 4, flags = ((d[o + 12] & 1) << 8) | d[o + 13], win = u16(d, o + 14);
  const names = [];
  const FL = [[0x02, 'SYN'], [0x10, 'ACK'], [0x01, 'FIN'], [0x04, 'RST'], [0x08, 'PSH'], [0x20, 'URG'], [0x40, 'ECE'], [0x80, 'CWR']];
  for (const [b, nm] of FL) if (flags & b) names.push(nm);
  const n = ctx.t.add(null, `Transmission Control Protocol, Src Port: ${sp}, Dst Port: ${dp}, Seq: ${seq}${flags & 0x10 ? `, Ack: ${ack}` : ''}`, o, Math.min(Math.max(doff, 20), end - o));
  ctx.t.add(n, `Source port: ${sp}`, o, 2);
  ctx.t.add(n, `Destination port: ${dp}`, o + 2, 2);
  ctx.t.add(n, `Sequence number: ${seq}`, o + 4, 4);
  ctx.t.add(n, `Acknowledgment number: ${ack}`, o + 8, 4);
  ctx.t.add(n, `Header length: ${doff} bytes (${d[o + 12] >> 4})`, o + 12, 1);
  ctx.t.add(n, `Flags: ${hexN(flags, 3)} (${names.join(', ') || 'none'})`, o + 12, 2);
  ctx.t.add(n, `Window: ${win}`, o + 14, 2);
  ctx.t.add(n, `Checksum: ${hexN(u16(d, o + 16), 4)}`, o + 16, 2);
  ctx.t.add(n, `Urgent pointer: ${u16(d, o + 18)}`, o + 18, 2);
  ctx.protos.push('tcp'); ctx.proto = 'TCP';
  const F = ctx.f;
  setF(F, 'tcp.srcport', sp); setF(F, 'tcp.dstport', dp); setF(F, 'tcp.port', sp); setF(F, 'tcp.port', dp);
  setF(F, 'tcp.seq', seq); setF(F, 'tcp.ack', ack); setF(F, 'tcp.window_size', win); setF(F, 'tcp.flags', flags);
  setF(F, 'tcp.flags.syn', flags & 2 ? 1 : 0); setF(F, 'tcp.flags.ack', flags & 16 ? 1 : 0); setF(F, 'tcp.flags.fin', flags & 1 ? 1 : 0);
  setF(F, 'tcp.flags.reset', flags & 4 ? 1 : 0); setF(F, 'tcp.flags.push', flags & 8 ? 1 : 0);
  ctx.info = `${sp} → ${dp} [${names.join(', ')}] Seq=${seq}${flags & 0x10 ? ` Ack=${ack}` : ''} Win=${win}`;
  if (doff < 20) { setF(F, 'tcp.len', 0); return bad(ctx, n, `TCP header length ${doff} is less than 20 bytes`, o + 12, 1); }
  if (o + doff > end) { setF(F, 'tcp.len', 0); return bad(ctx, n, `TCP data offset ${doff} goes past the end of the packet (${end - o} TCP bytes)`, o + 12, 1); }
  if (doff > 20) tcpOptions(ctx, n, o + 20, o + doff);
  const plen = end - (o + doff);
  setF(F, 'tcp.len', plen);
  ctx.info += ` Len=${plen}`;
  ctx.l4 = { proto: 'tcp', src, dst, sp, dp, off: o + doff, len: plen, seq, flags };
  if (plen <= 0) return;
  return tcpPayload(ctx, o + doff, end, sp, dp);
}

function tcpOptions(ctx, parent, o, end) {
  const { d } = ctx;
  const n = ctx.t.add(parent, `Options (${end - o} bytes)`, o, end - o);
  const parts = [];
  while (o < end) {
    const k = d[o];
    if (k === 0) { ctx.t.add(n, 'End of option list', o, 1); break; }
    if (k === 1) { ctx.t.add(n, 'No-operation (NOP)', o, 1); o++; continue; }
    if (o + 1 >= end) break;
    const l = d[o + 1];
    if (l < 2 || o + l > end) { bad(ctx, n, 'TCP option length is wrong', o, end - o); break; }
    let label = `Option kind ${k}`;
    if (k === 2 && l === 4) { label = `Maximum segment size: ${u16(d, o + 2)} bytes`; parts.push(`MSS=${u16(d, o + 2)}`); }
    else if (k === 3 && l === 3) { label = `Window scale: ${d[o + 2]} (multiply by ${1 << Math.min(d[o + 2], 14)})`; parts.push(`WS=${1 << Math.min(d[o + 2], 14)}`); }
    else if (k === 4) { label = 'SACK permitted'; parts.push('SACK_PERM'); }
    else if (k === 5) label = `SACK (${(l - 2) / 8} blocks)`;
    else if (k === 8 && l === 10) { label = `Timestamps: TSval ${u32(d, o + 2)}, TSecr ${u32(d, o + 6)}`; parts.push(`TSval=${u32(d, o + 2)}`); }
    ctx.t.add(n, label, o, l);
    o += l;
  }
  if (parts.length) ctx.tcpOpt = parts.join(' ');
}

function looksTls(d, o, end) {
  return end - o >= 5 && d[o] >= 20 && d[o] <= 24 && d[o + 1] === 3 && d[o + 2] <= 4;
}

function isHttpStart(d, o, end) {
  const head = latin(d, o, Math.min(end, o + 8));
  if (head.startsWith('HTTP/1.')) return true;
  for (const m of HTTP_METHODS) if (head.startsWith(m + ' ')) return true;
  return false;
}

function tcpPayload(ctx, o, end, sp, dp) {
  const { d } = ctx;
  if ((sp === 53 || dp === 53) && end - o >= 14) {
    const l = u16(d, o);
    const n = ctx.t.add(null, `DNS over TCP, length ${l}`, o, 2);
    if (n) n.n = `Length: ${l}`;
    return dns(ctx, o + 2, Math.min(end, o + 2 + l), false);
  }
  if (isHttpStart(d, o, end)) return http(ctx, o, end);
  if (looksTls(d, o, end) && (TLS_PORTS.has(sp) || TLS_PORTS.has(dp) || d[o] === 22)) return tls(ctx, o, end);
  if (TLS_PORTS.has(sp) || TLS_PORTS.has(dp)) {
    ctx.t.add(null, `TLS continuation data (${end - o} bytes)`, o, end - o);
    ctx.proto = 'TLS'; ctx.protos.push('tls'); ctx.info = `Continuation data, ${end - o} bytes`;
    return;
  }
  if (sp === 80 || dp === 80 || sp === 8080 || dp === 8080) {
    ctx.t.add(null, `HTTP continuation or body (${end - o} bytes)`, o, end - o);
    ctx.protos.push('http'); ctx.proto = 'HTTP'; ctx.info = `Continuation, ${end - o} bytes: ${ascii(d, o, Math.min(end, o + 40))}`;
    setF(ctx.f, 'http.continuation', 1);
    return;
  }
  data(ctx, o, end);
}

function data(ctx, o, end) {
  end = end ?? ctx.d.length;
  if (end <= o) return;
  ctx.t.add(null, `Data (${end - o} bytes): ${ascii(ctx.d, o, Math.min(end, o + 48))}`, o, end - o);
  ctx.protos.push('data');
  setF(ctx.f, 'data.len', end - o);
}

function udp(ctx, o, end, src, dst, ver) {
  const { d } = ctx;
  if (end - o < 8) return bad(ctx, null, `UDP header needs 8 bytes, ${end - o} captured`, o, end - o);
  const sp = u16(d, o), dp = u16(d, o + 2), len = u16(d, o + 4);
  const n = ctx.t.add(null, `User Datagram Protocol, Src Port: ${sp}, Dst Port: ${dp}`, o, 8);
  ctx.t.add(n, `Source port: ${sp}`, o, 2);
  ctx.t.add(n, `Destination port: ${dp}`, o + 2, 2);
  ctx.t.add(n, `Length: ${len}`, o + 4, 2);
  ctx.t.add(n, `Checksum: ${hexN(u16(d, o + 6), 4)}`, o + 6, 2);
  ctx.protos.push('udp'); ctx.proto = 'UDP';
  const F = ctx.f;
  setF(F, 'udp.srcport', sp); setF(F, 'udp.dstport', dp); setF(F, 'udp.port', sp); setF(F, 'udp.port', dp); setF(F, 'udp.length', len);
  ctx.info = `${sp} → ${dp} Len=${Math.max(0, len - 8)}`;
  let pend = end;
  if (len < 8) bad(ctx, n, `UDP length ${len} is less than 8`, o + 4, 2);
  else if (o + len > end) { if (ctx.f['frame.len'] === d.length) bad(ctx, n, `UDP length ${len} is more than the ${end - o} bytes in the packet`, o + 4, 2); }
  else pend = o + len;
  const p = o + 8;
  ctx.l4 = { proto: 'udp', src, dst, sp, dp, off: p, len: Math.max(0, pend - p) };
  if (pend <= p) return;
  if (sp === 53 || dp === 53 || sp === 5353 || dp === 5353 || sp === 5355 || dp === 5355) return dns(ctx, p, pend, sp === 5353 || dp === 5353);
  if ((sp === 67 || sp === 68) && (dp === 67 || dp === 68)) return dhcp(ctx, p, pend);
  if ((sp === 443 || dp === 443 || sp === 4433 || dp === 4433) && quic(ctx, p, pend)) return;
  data(ctx, p, pend);
}

/** Read a DNS name with compression; at most 128 jumps and 255 characters, so a pointer loop ends. */
function dnsName(d, o, start, end) {
  const labels = []; let jumps = 0, len = 0, next = -1, p = o, bad = '';
  while (true) {
    if (p >= end) { bad = 'name runs past the end'; break; }
    const l = d[p];
    if (l === 0) { p++; break; }
    if ((l & 0xc0) === 0xc0) {
      if (p + 1 >= end) { bad = 'compression pointer cut off'; break; }
      const ptr = start + (((l & 0x3f) << 8) | d[p + 1]);
      if (next < 0) next = p + 2;
      if (++jumps > 128 || ptr >= end || ptr === p) { bad = 'compression pointer loop'; break; }
      p = ptr; continue;
    }
    if (l & 0xc0) { bad = 'bad label type'; break; }
    if (p + 1 + l > end) { bad = 'label runs past the end'; break; }
    labels.push(latin(d, p + 1, p + 1 + l)); len += l + 1;
    if (len > 255) { bad = 'name longer than 255 bytes'; break; }
    p += 1 + l;
  }
  return { name: labels.join('.') || '<Root>', next: next >= 0 ? next : p, bad };
}

function dns(ctx, o, end, mdns) {
  const { d } = ctx;
  ctx.protos.push(mdns ? 'mdns' : 'dns'); ctx.proto = mdns ? 'MDNS' : 'DNS';
  if (end - o < 12) return bad(ctx, null, 'DNS header cut off', o, end - o);
  const id = u16(d, o), fl = u16(d, o + 2), qd = u16(d, o + 4), an = u16(d, o + 6), ns = u16(d, o + 8), ar = u16(d, o + 10);
  const resp = fl >> 15, opcode = (fl >> 11) & 15, rcode = fl & 15;
  const n = ctx.t.add(null, `Domain Name System (${resp ? 'response' : 'query'})`, o, end - o);
  ctx.t.add(n, `Transaction ID: ${hexN(id, 4)}`, o, 2);
  const fn = ctx.t.add(n, `Flags: ${hexN(fl, 4)} ${resp ? 'Standard query response' : 'Standard query'}${resp ? ', ' + (DNSRCODE[rcode] || 'rcode ' + rcode) : ''}`, o + 2, 2);
  ctx.t.add(fn, `Response: ${resp ? 'Message is a response' : 'Message is a query'}`, o + 2, 1);
  ctx.t.add(fn, `Recursion desired: ${(fl >> 8) & 1}`, o + 2, 1);
  if (resp) ctx.t.add(fn, `Reply code: ${DNSRCODE[rcode] || rcode} (${rcode})`, o + 3, 1);
  ctx.t.add(n, `Questions: ${qd}`, o + 4, 2);
  ctx.t.add(n, `Answer RRs: ${an}`, o + 6, 2);
  ctx.t.add(n, `Authority RRs: ${ns}`, o + 8, 2);
  ctx.t.add(n, `Additional RRs: ${ar}`, o + 10, 2);
  const F = ctx.f;
  setF(F, 'dns.id', id); setF(F, 'dns.flags.response', resp); setF(F, 'dns.flags.rcode', rcode);
  let p = o + 12;
  const qs = [], ans = [];
  const qn = qd ? ctx.t.add(n, 'Queries', p, 0) : null;
  for (let i = 0; i < Math.min(qd, 64); i++) {
    const nm = dnsName(d, p, o, end);
    if (nm.bad) { bad(ctx, n, `DNS ${nm.bad}`, p, end - p); return dnsInfo(ctx, id, resp, rcode, qs, ans, opcode); }
    if (nm.next + 4 > end) { bad(ctx, n, 'DNS question cut off', p, end - p); return dnsInfo(ctx, id, resp, rcode, qs, ans, opcode); }
    const t = u16(d, nm.next), c = u16(d, nm.next + 2);
    ctx.t.add(qn, `${nm.name}: type ${DNSTYPES[t] || t}, class ${c === 1 ? 'IN' : c & 0x7fff}`, p, nm.next + 4 - p);
    setF(F, 'dns.qry.name', nm.name); setF(F, 'dns.qry.type', t);
    qs.push([nm.name, t]);
    p = nm.next + 4;
  }
  if (qn) qn.l = p - qn.s;
  const secs = [['Answers', an], ['Authoritative nameservers', ns], ['Additional records', ar]];
  for (const [title, count] of secs) {
    if (!count) continue;
    const sn = ctx.t.add(n, title, p, 0);
    for (let i = 0; i < Math.min(count, 256); i++) {
      const nm = dnsName(d, p, o, end);
      if (nm.bad) { bad(ctx, sn || n, `DNS ${nm.bad}`, p, end - p); return dnsInfo(ctx, id, resp, rcode, qs, ans, opcode); }
      const q = nm.next;
      if (q + 10 > end) { bad(ctx, sn || n, 'DNS record cut off', p, end - p); return dnsInfo(ctx, id, resp, rcode, qs, ans, opcode); }
      const t = u16(d, q), ttl = u32(d, q + 4), rl = u16(d, q + 8), r = q + 10;
      if (r + rl > end) { bad(ctx, sn || n, 'DNS record data runs past the end', p, end - p); return dnsInfo(ctx, id, resp, rcode, qs, ans, opcode); }
      let val = `${rl} bytes`;
      if (t === 1 && rl === 4) { val = ip4(d, r); if (title === 'Answers') setF(F, 'dns.a', val); }
      else if (t === 28 && rl === 16) { val = ipv6Str(d, r); if (title === 'Answers') setF(F, 'dns.aaaa', val); }
      else if (t === 5 || t === 2 || t === 12) { const x = dnsName(d, r, o, end); val = x.bad ? `[${x.bad}]` : x.name; if (t === 5) setF(F, 'dns.cname', val); if (t === 12) setF(F, 'dns.ptr.domain_name', val); }
      else if (t === 15 && rl >= 3) { const x = dnsName(d, r + 2, o, end); val = `${u16(d, r)} ${x.name}`; }
      else if (t === 16) { val = '"' + ascii(d, r + 1, Math.min(r + rl, r + 1 + d[r])) + '"'; }
      else if (t === 41) val = `OPT, UDP payload size ${u16(d, q + 2)}`;
      ctx.t.add(sn, `${nm.name}: type ${DNSTYPES[t] || t}${t === 41 ? '' : `, ttl ${ttl}`}, ${val}`, p, r + rl - p);
      if (title === 'Answers') { ans.push([nm.name, t, val]); setF(F, 'dns.resp.name', nm.name); }
      p = r + rl;
    }
    if (sn) sn.l = p - sn.s;
  }
  setF(F, 'dns.count.answers', an);
  return dnsInfo(ctx, id, resp, rcode, qs, ans, opcode);
}

function dnsInfo(ctx, id, resp, rcode, qs, ans, opcode) {
  const q = qs.map(([nm, t]) => `${DNSTYPES[t] || t} ${nm}`).join(' ');
  let s = `Standard query${resp ? ' response' : ''} ${hexN(id, 4)}${opcode ? ` opcode ${opcode}` : ''}${resp && rcode ? ' ' + (DNSRCODE[rcode] || 'rcode ' + rcode) : ''} ${q}`;
  if (ans.length) s += ' ' + ans.slice(0, 6).map(([, t, v]) => `${DNSTYPES[t] || t} ${v}`).join(' ') + (ans.length > 6 ? ' ...' : '');
  ctx.info = s.trim();
  ctx.dnsAnswers = ans;
}

function dhcp(ctx, o, end) {
  const { d } = ctx;
  ctx.protos.push('dhcp'); ctx.proto = 'DHCP';
  if (end - o < 240) return bad(ctx, null, 'DHCP message shorter than 240 bytes', o, end - o);
  const op = d[o], xid = u32(d, o + 4);
  const ci = ip4(d, o + 12), yi = ip4(d, o + 16), si = ip4(d, o + 20), ch = mac(d, o + 28);
  const n = ctx.t.add(null, 'Dynamic Host Configuration Protocol', o, end - o);
  ctx.t.add(n, `Message type: ${op === 1 ? 'Boot Request' : 'Boot Reply'} (${op})`, o, 1);
  ctx.t.add(n, `Transaction ID: ${hexN(xid, 8)}`, o + 4, 4);
  ctx.t.add(n, `Client IP address: ${ci}`, o + 12, 4);
  ctx.t.add(n, `Your (client) IP address: ${yi}`, o + 16, 4);
  ctx.t.add(n, `Next server IP address: ${si}`, o + 20, 4);
  ctx.t.add(n, `Client MAC address: ${ch}`, o + 28, 6);
  setF(ctx.f, 'dhcp.id', xid); setF(ctx.f, 'dhcp.ip.your', yi); setF(ctx.f, 'dhcp.hw.mac_addr', ch);
  let type = 0;
  if (u32(d, o + 236) !== 0x63825363) { ctx.info = `BOOTP ${op === 1 ? 'request' : 'reply'} - Transaction ID ${hexN(xid, 8)}`; ctx.proto = 'BOOTP'; return; }
  ctx.t.add(n, 'Magic cookie: DHCP', o + 236, 4);
  let p = o + 240;
  const ON = { 1: 'Subnet Mask', 3: 'Router', 6: 'Domain Name Server', 12: 'Host Name', 15: 'Domain Name', 50: 'Requested IP Address', 51: 'IP Address Lease Time', 53: 'DHCP Message Type', 54: 'DHCP Server Identifier', 55: 'Parameter Request List', 57: 'Maximum DHCP Message Size', 60: 'Vendor class identifier', 61: 'Client identifier', 81: 'Client Fully Qualified Domain Name' };
  while (p < end) {
    const k = d[p];
    if (k === 255) { ctx.t.add(n, 'Option: (255) End', p, 1); break; }
    if (k === 0) { p++; continue; }
    if (p + 1 >= end || p + 2 + d[p + 1] > end) { bad(ctx, n, 'DHCP option runs past the end', p, end - p); break; }
    const l = d[p + 1], v = p + 2;
    let val = '';
    if (k === 53 && l >= 1) { type = d[v]; val = DHCPTYPES[type] || String(type); setF(ctx.f, 'dhcp.option.dhcp', type); }
    else if ((k === 1 || k === 3 || k === 6 || k === 50 || k === 54) && l >= 4) { const ips = []; for (let i = 0; i + 4 <= l; i += 4) ips.push(ip4(d, v + i)); val = ips.join(', '); if (k === 50) setF(ctx.f, 'dhcp.option.requested_ip_address', ips[0]); }
    else if (k === 12 || k === 15 || k === 60) { val = ascii(d, v, v + l); if (k === 12) setF(ctx.f, 'dhcp.option.hostname', val); }
    else if (k === 51 && l === 4) val = `${u32(d, v)} s`;
    else val = `${l} bytes`;
    ctx.t.add(n, `Option: (${k}) ${ON[k] || 'Option'}${val ? ': ' + val : ''}`, p, 2 + l);
    p = v + l;
  }
  ctx.info = `DHCP ${DHCPTYPES[type] || 'message'} - Transaction ID ${hexN(xid, 8)}`;
}

function http(ctx, o, end) {
  const { d } = ctx;
  ctx.protos.push('http'); ctx.proto = 'HTTP';
  // Headers end at the first empty line; look at most 64 KB.
  const lim = Math.min(end, o + 65536);
  let hend = -1;
  for (let i = o; i + 3 < lim; i++) if (d[i] === 13 && d[i + 1] === 10 && d[i + 2] === 13 && d[i + 3] === 10) { hend = i + 4; break; }
  const n = ctx.t.add(null, 'Hypertext Transfer Protocol', o, (hend > 0 ? hend : lim) - o);
  let p = o, first = true;
  const F = ctx.f;
  let ctype = '';
  while (p < (hend > 0 ? hend - 2 : lim)) {
    let e = p; while (e < lim && !(d[e] === 13 && d[e + 1] === 10) && d[e] !== 10) e++;
    const line = latin(d, p, e);
    const ll = e - p + (d[e] === 13 ? 2 : 1);
    if (first) {
      first = false;
      ctx.t.add(n, line, p, ll);
      const m = /^([A-Z]+) (\S+) (HTTP\/\d\.\d)/.exec(line);
      const r = /^(HTTP\/\d\.\d) (\d{3}) ?(.*)$/.exec(line);
      if (m) { setF(F, 'http.request.method', m[1]); setF(F, 'http.request.uri', m[2]); setF(F, 'http.request', 1); ctx.info = line; }
      else if (r) { setF(F, 'http.response.code', Number(r[2])); setF(F, 'http.response.phrase', r[3]); setF(F, 'http.response', 1); ctx.info = line; }
      else ctx.info = line.slice(0, 120);
    } else if (line) {
      ctx.t.add(n, line, p, ll);
      const c = line.indexOf(':');
      if (c > 0) {
        const k = line.slice(0, c).trim().toLowerCase(), v = line.slice(c + 1).trim();
        if (k === 'host') setF(F, 'http.host', v);
        if (k === 'user-agent') setF(F, 'http.user_agent', v);
        if (k === 'content-type') { setF(F, 'http.content_type', v); ctype = v.split(';')[0]; }
        if (k === 'content-length') setF(F, 'http.content_length', Number(v) || 0);
        if (k === 'server') setF(F, 'http.server', v);
        if (k === 'cookie') setF(F, 'http.cookie', v);
      }
    }
    p = e + (d[e] === 13 ? 2 : 1);
  }
  if (hend < 0) ctx.t.add(n, '[Headers continue in the next segment]', lim, 0);
  else if (hend < end) ctx.t.add(null, `Body (${end - hend} bytes${ctype ? ', ' + ctype : ''}): ${ascii(d, hend, Math.min(end, hend + 48))}`, hend, end - hend);
  if (ctype && F['http.response']) ctx.info += `  (${ctype})`;
}

function tls(ctx, o, end) {
  const { d } = ctx;
  ctx.protos.push('tls'); ctx.proto = 'TLS';
  const infos = [];
  let p = o, helloVer = 0;
  for (let k = 0; k < 32 && p + 5 <= end; k++) {
    const ct = d[p], rv = u16(d, p + 1), rl = u16(d, p + 3);
    if (ct < 20 || ct > 24 || d[p + 1] !== 3) { ctx.t.add(null, `TLS data (${end - p} bytes, not a record start)`, p, end - p); break; }
    const avail = Math.min(rl, end - p - 5);
    const n = ctx.t.add(null, `Transport Layer Security, ${TLSVER[rv] || hexN(rv, 4)} Record: ${TLSCT[ct]}${avail < rl ? ` [${avail} of ${rl} bytes in this segment]` : ''}`, p, 5 + avail);
    ctx.t.add(n, `Content type: ${TLSCT[ct]} (${ct})`, p, 1);
    ctx.t.add(n, `Version: ${TLSVER[rv] || hexN(rv, 4)} (${hexN(rv, 4)})`, p + 1, 2);
    ctx.t.add(n, `Length: ${rl}`, p + 3, 2);
    setF(ctx.f, 'tls.record.content_type', ct); setF(ctx.f, 'tls.record.version', rv);
    if (ct === 22 && avail >= 4) {
      const hs = tlsHandshake(ctx, n, p + 5, p + 5 + avail);
      infos.push(hs.label); if (hs.ver) helloVer = hs.ver;
    } else if (ct === 23) { infos.push('Application Data'); ctx.t.add(n, `Encrypted application data (${avail} bytes)`, p + 5, avail); }
    else if (ct === 21) { infos.push(avail === 2 ? `Alert (Level: ${d[p + 5] === 2 ? 'Fatal' : 'Warning'}, Description: ${d[p + 6]})` : 'Encrypted Alert'); }
    else if (ct === 20) infos.push('Change Cipher Spec');
    else infos.push(TLSCT[ct]);
    p += 5 + rl;
  }
  // The record version is fixed at 1.0 or 1.2 for compatibility; only hellos tell the real version.
  if (helloVer === 0x0304) ctx.proto = 'TLSv1.3'; else if (helloVer === 0x0303) ctx.proto = 'TLSv1.2'; else if (helloVer === 0x0302) ctx.proto = 'TLSv1.1'; else if (helloVer === 0x0301) ctx.proto = 'TLSv1';
  ctx.info = [...new Set(infos)].join(', ') || 'TLS';
}

function tlsHandshake(ctx, parent, o, end) {
  const { d } = ctx;
  const type = d[o], len = (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3];
  const name = TLSHS[type] || `Handshake type ${type}`;
  const n = ctx.t.add(parent, `Handshake Protocol: ${name}`, o, Math.min(4 + len, end - o));
  ctx.t.add(n, `Handshake type: ${name} (${type})`, o, 1);
  ctx.t.add(n, `Length: ${len}`, o + 1, 3);
  setF(ctx.f, 'tls.handshake.type', type);
  const out = { label: name, ver: 0 };
  if (type !== 1 && type !== 2) return out;
  if (len > end - o - 4) { ctx.t.add(n, '[Hello continues in the next segment]', end, 0); }
  const e = Math.min(end, o + 4 + len);
  let p = o + 4;
  if (p + 34 > e) return out;
  const hv = u16(d, p);
  out.ver = hv;
  ctx.t.add(n, `Version: ${TLSVER[hv] || hexN(hv, 4)} (${hexN(hv, 4)})`, p, 2);
  ctx.t.add(n, 'Random: ' + [...d.subarray(p + 2, p + 34)].map(hex2).join(''), p + 2, 32);
  p += 34;
  if (p + 1 > e) return out;
  const sl = d[p]; ctx.t.add(n, `Session ID length: ${sl}`, p, 1); p += 1 + sl;
  if (type === 1) {
    if (p + 2 > e) return out;
    const cl = u16(d, p); ctx.t.add(n, `Cipher suites (${cl / 2 | 0} suites)`, p, 2 + cl); p += 2 + cl;
    if (p + 1 > e) return out;
    const ml = d[p]; ctx.t.add(n, `Compression methods (${ml})`, p, 1 + ml); p += 1 + ml;
  } else {
    if (p + 3 > e) return out;
    const cs = u16(d, p); ctx.t.add(n, `Cipher suite: ${hexN(cs, 4)}`, p, 2); setF(ctx.f, 'tls.handshake.ciphersuite', cs); p += 3;
  }
  if (p + 2 > e) return out;
  const el = u16(d, p), eend = Math.min(e, p + 2 + el);
  const en = ctx.t.add(n, `Extensions length: ${el}`, p, Math.min(2 + el, e - p));
  p += 2;
  while (p + 4 <= eend) {
    const et = u16(d, p), xl = u16(d, p + 2), v = p + 4;
    if (v + xl > eend) { bad(ctx, en, 'TLS extension runs past the end', p, eend - p); break; }
    const xn = ctx.t.add(en, `Extension: ${TLSEXT[et] || 'unknown'} (len=${xl})`, p, 4 + xl);
    if (et === 0 && xl >= 5) {
      let q = v + 2;
      while (q + 3 <= v + xl) {
        const nt = d[q], nl = u16(d, q + 1);
        if (q + 3 + nl > v + xl) break;
        if (nt === 0) {
          const sni = latin(d, q + 3, q + 3 + nl);
          ctx.t.add(xn, `Server Name: ${sni}`, q + 3, nl);
          setF(ctx.f, 'tls.handshake.extensions_server_name', sni);
          out.label = `${name} (SNI=${sni})`;
        }
        q += 3 + nl;
      }
    } else if (et === 16 && xl >= 2) {
      let q = v + 2; const list = [];
      while (q < v + xl) { const l = d[q]; if (q + 1 + l > v + xl) break; const s = latin(d, q + 1, q + 1 + l); list.push(s); ctx.t.add(xn, `ALPN Next Protocol: ${s}`, q, 1 + l); setF(ctx.f, 'tls.handshake.extensions_alpn_str', s); q += 1 + l; }
    } else if (et === 43) {
      if (type === 2 && xl === 2) { out.ver = u16(d, v); ctx.t.add(xn, `Supported version: ${TLSVER[out.ver] || hexN(out.ver, 4)}`, v, 2); setF(ctx.f, 'tls.handshake.extensions.supported_version', out.ver); }
      else if (type === 1 && xl >= 3) {
        for (let q = v + 1; q + 1 < v + 1 + d[v] && q + 1 < v + xl; q += 2) { const sv = u16(d, q); if ((sv & 0x0f0f) === 0x0a0a) continue; if (sv <= 0x0304 && sv > out.ver) out.ver = sv; ctx.t.add(xn, `Supported version: ${TLSVER[sv] || hexN(sv, 4)}`, q, 2); setF(ctx.f, 'tls.handshake.extensions.supported_version', sv); }
      }
    }
    p = v + xl;
  }
  return out;
}

function varint(d, p, end) {
  if (p >= end) return null;
  const l = 1 << (d[p] >> 6);
  if (p + l > end) return null;
  let v = d[p] & 0x3f;
  for (let i = 1; i < l; i++) v = v * 256 + d[p + i];
  return { v, l };
}

function quic(ctx, o, end) {
  const { d } = ctx;
  if (end - o < 7 || !(d[o] & 0x80) || !(d[o] & 0x40)) {
    if (end - o >= 1 && (d[o] & 0x40) && !(d[o] & 0x80)) {
      ctx.protos.push('quic'); ctx.proto = 'QUIC'; ctx.info = 'Protected Payload (short header)';
      ctx.t.add(null, `QUIC IETF, short header (${end - o} bytes, encrypted)`, o, end - o);
      return true;
    }
    return false;
  }
  const ver = u32(d, o + 1);
  const dl = d[o + 5];
  if (dl > 20 || o + 6 + dl >= end) return false;
  const dcid = [...d.subarray(o + 6, o + 6 + dl)].map(hex2).join('');
  const sp = o + 6 + dl, sl = d[sp];
  if (sl > 20 || sp + 1 + sl > end) return false;
  const scid = [...d.subarray(sp + 1, sp + 1 + sl)].map(hex2).join('');
  const lt = (d[o] >> 4) & 3;
  const kinds = ver === 0 ? 'Version Negotiation' : (['Initial', '0-RTT', 'Handshake', 'Retry'][lt]);
  const n = ctx.t.add(null, `QUIC IETF, ${kinds}`, o, end - o);
  ctx.t.add(n, `Header form: Long header (${hexN(d[o], 2)})`, o, 1);
  ctx.t.add(n, `Version: ${ver === 1 ? '1 (RFC 9000)' : ver === 0x6b3343cf ? '2 (RFC 9369)' : hexN(ver, 8)}`, o + 1, 4);
  ctx.t.add(n, `Destination connection ID length: ${dl}`, o + 5, 1);
  if (dl) ctx.t.add(n, `Destination connection ID: ${dcid}`, o + 6, dl);
  ctx.t.add(n, `Source connection ID length: ${sl}`, sp, 1);
  if (sl) ctx.t.add(n, `Source connection ID: ${scid}`, sp + 1, sl);
  let p = sp + 1 + sl;
  if (lt === 0 && ver !== 0) {
    const tl = varint(d, p, end);
    if (tl) { ctx.t.add(n, `Token length: ${tl.v}`, p, tl.l); p += tl.l + tl.v; }
  }
  if (ver !== 0 && lt !== 3) {
    const ln = varint(d, p, end);
    if (ln) { ctx.t.add(n, `Length: ${ln.v}`, p, ln.l); p += ln.l; if (p < end) ctx.t.add(n, `Protected payload (${Math.min(ln.v, end - p)} bytes)`, p, Math.min(ln.v, end - p)); }
  }
  ctx.protos.push('quic'); ctx.proto = 'QUIC';
  setF(ctx.f, 'quic.version', ver); setF(ctx.f, 'quic.dcid', dcid); setF(ctx.f, 'quic.scid', scid); setF(ctx.f, 'quic.long.packet_type', lt);
  ctx.info = `${kinds}, DCID=${dcid}${scid ? ', SCID=' + scid : ''}`;
  return true;
}

/** Names from the DNS answers in one packet, for the name column: [[address, name], ...] or null. */
function dnsNames(d, linktype) {
  const r = dissect(d, linktype, { tree: false });
  if (!r.dnsAnswers || !r.f['dns.flags.response']) return null;
  const out = [];
  for (const [name, t, val] of r.dnsAnswers) if ((t === 1 || t === 28) && name && name !== '<Root>') out.push([val, name]);
  return out.length ? out : null;
}

module.exports = { dissect, dnsNames, LINKTYPES, IPPROTO, DNSTYPES, latin, ascii, u16, u32 };

return module.exports; })();
M["filter"] = (() => { const module = { exports: {} }, exports = module.exports;

// Display filter: a subset of the Wireshark syntax.
//   tcp            a protocol name: packets that have it
//   ip.addr == 10.0.0.1, ip.src != 10.0.0.0/8, tcp.port in {80 443}, frame.len > 1000
//   dns.qry.name contains "example", http.request.method == "GET"
//   && and, || or, ! not, ( )
// compile() returns { ok, test(fields) } or { ok: false, error, at } with a plain-words error.

const PROTOCOLS = new Set(['frame', 'eth', 'vlan', 'sll', 'arp', 'ip', 'ipv6', 'icmp', 'icmpv6', 'tcp', 'udp', 'dns', 'mdns', 'dhcp', 'bootp', 'http', 'tls', 'ssl', 'quic', 'data', 'llc', 'wlan', 'radiotap', 'null', 'raw', 'igmp', 'gre', 'esp', 'sctp', 'ospf', 'pim', 'vrrp', 'lldp', 'mpls', 'ipip', 'ipv6.hopopts']);
const ALIASES = {
  ssl: 'tls', bootp: 'dhcp', 'tls.sni': 'tls.handshake.extensions_server_name', 'ssl.sni': 'tls.handshake.extensions_server_name',
  'tls.alpn': 'tls.handshake.extensions_alpn_str', 'ip.ttl': 'ip.ttl', 'dns.name': 'dns.qry.name', 'http.method': 'http.request.method',
  'http.uri': 'http.request.uri', 'http.code': 'http.response.code', 'eth.mac': 'eth.addr', 'ipv6.hlim': 'ipv6.hlim', 'frame.length': 'frame.len',
  'icmp.ident': 'icmp.ident', 'vlan': 'vlan', 'bootp.option.hostname': 'dhcp.option.hostname',
};
const FIELDS = new Set([
  'frame.len', 'frame.cap_len', 'frame.number', 'frame.time_relative', 'frame.interface_id',
  'eth.src', 'eth.dst', 'eth.addr', 'eth.type', 'vlan.id', 'vlan.priority', 'sll.src',
  'arp.opcode', 'arp.src.proto_ipv4', 'arp.dst.proto_ipv4', 'arp.src.hw_mac',
  'ip.src', 'ip.dst', 'ip.addr', 'ip.proto', 'ip.ttl', 'ip.len', 'ip.id', 'ip.version', 'ip.flags.df', 'ip.flags.mf', 'ip.frag_offset',
  'ipv6.src', 'ipv6.dst', 'ipv6.addr', 'ipv6.hlim', 'ipv6.plen', 'ipv6.nxt', 'ipv6.ext',
  'icmp.type', 'icmp.code', 'icmp.ident', 'icmp.seq', 'icmpv6.type', 'icmpv6.code', 'icmpv6.echo.seq', 'icmpv6.nd.target',
  'tcp.srcport', 'tcp.dstport', 'tcp.port', 'tcp.seq', 'tcp.ack', 'tcp.len', 'tcp.window_size', 'tcp.flags', 'tcp.flags.syn', 'tcp.flags.ack',
  'tcp.flags.fin', 'tcp.flags.reset', 'tcp.flags.push', 'tcp.stream',
  'udp.srcport', 'udp.dstport', 'udp.port', 'udp.length', 'udp.stream',
  'dns.id', 'dns.flags.response', 'dns.flags.rcode', 'dns.qry.name', 'dns.qry.type', 'dns.a', 'dns.aaaa', 'dns.cname', 'dns.resp.name', 'dns.count.answers', 'dns.ptr.domain_name',
  'dhcp.id', 'dhcp.ip.your', 'dhcp.hw.mac_addr', 'dhcp.option.dhcp', 'dhcp.option.hostname', 'dhcp.option.requested_ip_address',
  'http.request', 'http.response', 'http.request.method', 'http.request.uri', 'http.response.code', 'http.response.phrase', 'http.host', 'http.user_agent',
  'http.content_type', 'http.content_length', 'http.server', 'http.cookie', 'http.continuation',
  'tls.record.content_type', 'tls.record.version', 'tls.handshake.type', 'tls.handshake.extensions_server_name', 'tls.handshake.extensions_alpn_str',
  'tls.handshake.ciphersuite', 'tls.handshake.extensions.supported_version',
  'quic.version', 'quic.dcid', 'quic.scid', 'quic.long.packet_type', 'data.len', 'wlan.ra', 'wlan.ta', '_ws.malformed', '_ws.name',
]);

function tokenize(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two, at: i }); i += 2; continue; }
    if ('()!<>{},'.includes(c)) { out.push({ t: c === '!' || c === '<' || c === '>' ? 'op' : c, v: c, at: i }); i++; continue; }
    if (c === '=' ) { out.push({ t: 'op', v: '==', at: i }); i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, v = '';
      while (j < s.length && s[j] !== c) { if (s[j] === '\\' && j + 1 < s.length) { v += s[j + 1]; j += 2; } else v += s[j++]; }
      if (j >= s.length) return { error: 'A quoted text has no closing quote.', at: i };
      out.push({ t: 'str', v, at: i }); i = j + 1; continue;
    }
    let j = i;
    while (j < s.length && !/[\s()!<>={},"']/.test(s[j])) j++;
    if (j === i) return { error: `Unexpected character "${c}".`, at: i };
    out.push({ t: 'word', v: s.slice(i, j), at: i }); i = j;
  }
  return { tokens: out };
}

const WORD_OPS = { eq: '==', ne: '!=', gt: '>', lt: '<', ge: '>=', le: '<=', contains: 'contains', matches: 'matches', in: 'in', and: '&&', or: '||', not: '!' };

function parse(src) {
  const tk = tokenize(src);
  if (tk.error) return { ok: false, error: tk.error, at: tk.at };
  const t = tk.tokens.map(x => (x.t === 'word' && WORD_OPS[x.v.toLowerCase()] ? { t: 'op', v: WORD_OPS[x.v.toLowerCase()], at: x.at } : x));
  let i = 0;
  const peek = () => t[i], fail = (msg, at) => { throw Object.assign(new Error(msg), { at: at ?? (t[i] ? t[i].at : src.length) }); };
  const isOp = v => t[i] && t[i].t === 'op' && t[i].v === v;
  function orE() { let l = andE(); while (isOp('||')) { i++; l = { k: 'or', l, r: andE() }; } return l; }
  function andE() { let l = notE(); while (isOp('&&')) { i++; l = { k: 'and', l, r: notE() }; } return l; }
  function notE() { if (isOp('!')) { i++; return { k: 'not', e: notE() }; } return prim(); }
  function prim() {
    const x = peek();
    if (!x) fail('The filter ends too early.');
    if (x.t === '(') { i++; const e = orE(); if (!t[i] || t[i].t !== ')') fail('A "(" has no matching ")".'); i++; return e; }
    if (x.t !== 'word') fail(`Expected a field or protocol name, found "${x.v}".`, x.at);
    i++;
    let name = x.v.toLowerCase();
    name = ALIASES[name] || name;
    if (!PROTOCOLS.has(name) && !FIELDS.has(name)) fail(`"${x.v}" is not a field this viewer knows. Try ip.addr, tcp.port, udp.port, dns.qry.name, http.host, tls.sni or a protocol name such as tcp or dns.`, x.at);
    const op = peek();
    if (!op || op.t !== 'op' || ['&&', '||', '!'].includes(op.v)) return { k: 'has', name };
    i++;
    if (op.v === 'in') {
      if (!t[i] || t[i].t !== '{') fail('"in" needs a set such as {80 443}.');
      i++; const vals = [];
      while (t[i] && t[i].t !== '}') { if (t[i].t === ',') { i++; continue; } if (t[i].t !== 'word' && t[i].t !== 'str') fail('Expected a value in the set.'); vals.push(t[i].v); i++; }
      if (!t[i]) fail('A "{" has no matching "}".');
      i++;
      return { k: 'in', name, vals: vals.map(v => value(name, v, '==')) };
    }
    const v = peek();
    if (!v || (v.t !== 'word' && v.t !== 'str')) fail(`"${x.v} ${op.v}" needs a value after it.`);
    i++;
    return { k: 'cmp', name, op: op.v, val: value(name, v.v, op.v, v.at) };
  }
  function value(name, raw, op, at) {
    if (op === 'matches') { try { return { re: new RegExp(raw, 'i') }; } catch (e) { fail(`"${raw}" is not a valid regular expression.`, at); } }
    if (op === 'contains') return { s: raw };
    const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(raw);
    if (cidr) {
      const bits = Number(cidr[2]);
      if (bits > 32) fail(`"${raw}": a prefix length is 0 to 32.`, at);
      return { net: ip4num(cidr[1]), mask: bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0 };
    }
    if (/^(0x[0-9a-f]+|\d+(\.\d+)?)$/i.test(raw) && !/^\d+\.\d+\.\d+/.test(raw)) return { n: Number(raw), s: raw };
    if (raw === 'true') return { n: 1, s: raw };
    if (raw === 'false') return { n: 0, s: raw };
    return { s: /^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$/i.test(raw) ? raw.toLowerCase().replace(/-/g, ':') : raw };
  }
  try {
    if (!t.length) return { ok: true, ast: null };
    const ast = orE();
    if (i < t.length) fail(`Unexpected "${t[i].v}". Join conditions with && or ||.`, t[i].at);
    return { ok: true, ast };
  } catch (e) {
    return { ok: false, error: e.message, at: e.at };
  }
}

function ip4num(s) { const p = s.split('.').map(Number); return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0; }

function match1(fv, op, val) {
  if (val.net !== undefined) {
    if (typeof fv !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(fv)) return false;
    const inNet = ((ip4num(fv) & val.mask) >>> 0) === ((val.net & val.mask) >>> 0);
    return op === '!=' ? !inNet : inNet;
  }
  if (op === 'contains') return String(fv).includes(val.s);
  if (op === 'matches') return val.re.test(String(fv));
  if (typeof fv === 'number' && val.n !== undefined) {
    switch (op) { case '==': return fv === val.n; case '!=': return fv !== val.n; case '>': return fv > val.n; case '<': return fv < val.n; case '>=': return fv >= val.n; case '<=': return fv <= val.n; }
  }
  const a = String(fv), b = val.s;
  if (op === '==') return typeof fv === 'string' && /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(a) ? a === b.toLowerCase() : a === b;
  if (op === '!=') return a !== b;
  switch (op) { case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b; }
  return false;
}

function evalAst(n, f) {
  switch (n.k) {
    case 'and': return evalAst(n.l, f) && evalAst(n.r, f);
    case 'or': return evalAst(n.l, f) || evalAst(n.r, f);
    case 'not': return !evalAst(n.e, f);
    case 'has': {
      if (PROTOCOLS.has(n.name) && !FIELDS.has(n.name)) { const p = f._proto; return Array.isArray(p) ? p.includes(n.name) : p === n.name; }
      return f[n.name] !== undefined;
    }
    case 'in': {
      const v = f[n.name]; if (v === undefined) return false;
      const vs = Array.isArray(v) ? v : [v];
      return vs.some(x => n.vals.some(val => match1(x, '==', val)));
    }
    case 'cmp': {
      const v = f[n.name]; if (v === undefined) return false;
      const vs = Array.isArray(v) ? v : [v];
      // != is true when no value equals (Wireshark 4 meaning: "all not equal").
      if (n.op === '!=') return !vs.some(x => match1(x, '==', n.val));
      return vs.some(x => match1(x, n.op, n.val));
    }
  }
  return false;
}

function compile(src) {
  const p = parse(String(src || '').trim());
  if (!p.ok) return p;
  if (!p.ast) return { ok: true, empty: true, test: () => true };
  return { ok: true, empty: false, test: f => evalAst(p.ast, f) };
}

module.exports = { compile, parse, PROTOCOLS, FIELDS };

return module.exports; })();

async function gunzipBlob(blob, capBytes, onProgress) {
  let read = 0;
  const count = new TransformStream({ transform(c, ctl) { read += c.length; ctl.enqueue(c); } });
  const rd = blob.stream().pipeThrough(count).pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks = []; let total = 0, capped = false, bomb = 0, gzError = '';
  for (;;) {
    let r;
    try { r = await rd.read(); } catch (e) { if (!total) throw e; gzError = String(e.message || e); break; }
    if (r.done) break;
    const d = r.value;
    if (total + d.length > capBytes) { chunks.push(Buffer.from(d.subarray(0, capBytes - total))); total = capBytes; capped = true; rd.cancel().catch(() => {}); break; }
    chunks.push(Buffer.from(d)); total += d.length;
    if (total > 64 * 1048576 && read > 0 && total / read > 200) { capped = true; bomb = Math.round(total / read); rd.cancel().catch(() => {}); break; }
    if (onProgress) onProgress(total, read, blob.size);
  }
  return { source: new M.capture.ChunkSource(chunks), capped, bomb, compressed: blob.size, gzError };
}
M.capture.FileSource = class { constructor(src) { return src; } };  // Engine.open(source) takes the in-memory source
M.capture.gunzipToSource = gunzipBlob;
M["engine"] = (() => { const module = { exports: {} }, exports = module.exports;

// The capture engine: index, rows, packet details, filter, statistics, follow stream and export.
// It runs in a worker thread (src/core/worker.js) so a 1 GB capture never blocks the extension host;
// tests call it directly. All work is local; nothing here opens a socket or resolves a name on the network.
const fs = require('fs');
const { FileSource, gunzipToSource, indexCapture, buildExport } = require('./capture');
const { dissect, dnsNames, LINKTYPES } = require('./dissect');
const { compile } = require('./filter');

const tick = () => new Promise(r => setImmediate(r));

/** Cheap check for DNS before running the full dissector while indexing. */
function maybeDns(b, at, len, lt) {
  let o = at, end = at + len, et = -1;
  if (lt === 1) { if (len < 14) return false; et = (b[o + 12] << 8) | b[o + 13]; o += 14; if (et === 0x8100 && o + 4 <= end) { et = (b[o + 2] << 8) | b[o + 3]; o += 4; } }
  else if (lt === 113) { if (len < 16) return false; et = (b[o + 14] << 8) | b[o + 15]; o += 16; }
  else if (lt === 276) { if (len < 20) return false; et = (b[o] << 8) | b[o + 1]; o += 20; }
  else if (lt === 0 || lt === 108) { o += 4; et = o < end ? ((b[o] >> 4) === 6 ? 0x86dd : 0x0800) : -1; }
  else if (lt === 101 || lt === 12 || lt === 14 || lt === 228 || lt === 229) { et = o < end ? ((b[o] >> 4) === 6 ? 0x86dd : 0x0800) : -1; }
  else return false;
  let proto, p;
  if (et === 0x0800) { if (o + 20 > end) return false; proto = b[o + 9]; p = o + (b[o] & 15) * 4; }
  else if (et === 0x86dd) { if (o + 40 > end) return false; proto = b[o + 6]; p = o + 40; }
  else return false;
  if ((proto !== 17 && proto !== 6) || p + 4 > end) return false;
  const sp = (b[p] << 8) | b[p + 1], dp = (b[p + 2] << 8) | b[p + 3];
  return sp === 53 || dp === 53 || sp === 5353 || dp === 5353 || sp === 5355 || dp === 5355;
}

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

class Engine {
  constructor(post) {
    this.post = post || (() => {});
    this.src = null; this.idx = null; this.ifs = []; this.names = new Map(); this.view = null; this.info = null;
    this.analysis = null; this.analysisPromise = null; this.jobs = new Map(); this.nsRes = false;
  }

  /** opts: { gz: boolean, maxGzipMB: number, name: string } */
  async open(path, opts = {}) {
    const t0 = Date.now();
    let src, capped = false, gzInfo = null;
    try {
      if (opts.gz) {
        const cap = Math.max(1, opts.maxGzipMB || 512) * 1048576;
        const r = await gunzipToSource(path, cap, (out, inp, total) => this.post({ type: 'progress', phase: 'unzip', done: inp, total, out }));
        src = r.source; capped = r.capped; gzInfo = r;
      } else src = new FileSource(path);
    } catch (e) {
      return { error: gzErr(e), size: 0 };
    }
    this.src = src;
    const size = src.size;
    let lastPost = 0;
    const res = await indexCapture(src, {
      yieldEvery: 20000,
      onProgress: (pos, total) => { const now = Date.now(); if (now - lastPost > 150) { lastPost = now; this.post({ type: 'progress', phase: 'index', done: pos, total, packets: this.idxRef ? this.idxRef.n : 0 }); } },
      onPacket: (i, b, at, len, lt) => {
        if (maybeDns(b, at, len, lt)) {
          const pairs = dnsNames(b.subarray(at, at + len), lt);
          if (pairs) for (const [addr, name] of pairs) if (!this.names.has(addr) && this.names.size < 200000) this.names.set(addr, { name, from: `DNS answer in packet ${i + 1}` });
        }
      },
    });
    this.idxRef = res.index;
    this.idx = res.index; this.ifs = res.interfaces;
    for (const [addr, name, from] of res.names) if (!this.names.has(addr)) this.names.set(addr, { name, from: 'Name resolution block in the file' });
    const warnings = res.warnings.slice();
    if (capped && gzInfo.bomb) warnings.unshift(`This .gz file unpacks at about ${gzInfo.bomb} times its packed size, which is what a gzip bomb does. Unpacking stopped at ${Math.round(size / 1048576)} MB; the packets in that part are shown.`);
    else if (capped) warnings.unshift(`This .gz file expands to more than ${opts.maxGzipMB || 512} MB (it may be a gzip bomb, or a very large capture). Only the first ${opts.maxGzipMB || 512} MB were unpacked; the packets in that part are shown. Unzip it yourself to see the rest, or raise the setting pcapViewer.maxGzipMB.`);
    if (gzInfo && gzInfo.gzError) warnings.unshift(`The .gz data is damaged after ${(size / 1048576).toFixed(1)} MB (${gzInfo.gzError}). The packets before that point are shown.`);
    const n = this.idx.n;
    if (src.trim) { const end = n ? this.idx.off[n - 1] + this.idx.len[n - 1] : 0; const unpacked = src.size; src.trim(end); if (src.size < unpacked) this.trimmedFrom = unpacked; }
    this.nsRes = this.ifs.some(f => f.res && ((f.res.dec !== undefined && f.res.dec > 6) || f.res.bin > 20));
    let t1 = -1;
    for (let i = 0; i < n; i++) if (!this.idx.noTs.has(i)) { t1 = i; break; }
    this.first = t1 >= 0 ? [this.idx.sec[t1], this.idx.ns[t1]] : [0, 0];
    this.info = {
      error: res.error, format: res.format, count: n, size, compressed: gzInfo ? gzInfo.compressed : 0, capped, warnings,
      interfaces: this.ifs.map(f => ({ linktype: f.linktype, linkName: LINKTYPES[f.linktype] || `link type ${f.linktype}`, name: f.name || '', snaplen: f.snaplen })),
      section: res.section, names: this.names.size, ms: Date.now() - t0,
      firstTime: t1 >= 0 ? this.absTime(t1, 'utc') : '', duration: this.lastTimed(),
    };
    return this.info;
  }

  lastTimed() { for (let i = this.idx.n - 1; i >= 0; i--) if (!this.idx.noTs.has(i)) return this.relSec(i); return 0; }

  close() { if (this.src) this.src.close(); this.src = null; this.idx = null; }

  relSec(i) { return (this.idx.sec[i] - this.first[0]) + (this.idx.ns[i] - this.first[1]) / 1e9; }

  absTime(i, mode) {
    const s = this.idx.sec[i], ns = this.idx.ns[i];
    const d = new Date(s * 1000);
    const frac = this.nsRes ? pad(ns, 9) : pad(Math.floor(ns / 1000), 6);
    if (mode === 'utc') return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${frac}`;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${frac}`;
  }

  timeText(i, mode, prev) {
    if (this.idx.noTs.size && this.idx.noTs.has(i)) return 'no time (simple block)';
    if (mode === 'utc' || mode === 'local') return this.absTime(i, mode);
    if (mode === 'delta') { const p = prev >= 0 ? prev : i; const v = (this.idx.sec[i] - this.idx.sec[p]) + (this.idx.ns[i] - this.idx.ns[p]) / 1e9; return v.toFixed(this.nsRes ? 9 : 6); }
    return this.relSec(i).toFixed(this.nsRes ? 9 : 6);
  }

  bytes(i) { return this.src.read(this.idx.off[i], this.idx.len[i]); }

  lt(i) { return this.ifs[this.idx.ifc[i]].linktype; }

  dissectAt(i, tree) {
    const opts = { tree, orig: this.idx.orig[i], number: i + 1 };
    if (tree) { opts.time = this.idx.noTs.has(i) ? 'none (simple packet block)' : this.absTime(i, 'utc') + ' UTC'; opts.comment = this.idx.comments.get(i); }
    const r = dissect(this.bytes(i), this.lt(i), opts);
    if (this.ifs.length > 1) r.f['frame.interface_id'] = this.idx.ifc[i];
    r.f['frame.time_relative'] = this.relSec(i);
    if (this.analysis && this.analysis.stream[i] >= 0 && r.l4) r.f[r.l4.proto + '.stream'] = this.analysis.stream[i];
    if (r.malformed) r.f['_ws.malformed'] = 1;
    return r;
  }

  name(addr) { const e = this.names.get(addr); return e ? e.name : ''; }

  viewCount() { return this.view ? this.view.length : (this.idx ? this.idx.n : 0); }

  rows(start, count, opts = {}) {
    const out = [], n = this.viewCount();
    const end = Math.min(n, start + Math.min(count, 2000));
    for (let k = Math.max(0, start); k < end; k++) {
      const i = this.view ? this.view[k] : k;
      const prev = k > 0 ? (this.view ? this.view[k - 1] : k - 1) : -1;
      let r;
      try { r = this.dissectAt(i, false); } catch (e) { r = { proto: '?', src: '', dst: '', info: 'Could not decode: ' + e.message, protos: [], malformed: true }; }
      const src = opts.names ? (this.name(r.src) || r.src) : r.src, dst = opts.names ? (this.name(r.dst) || r.dst) : r.dst;
      out.push({ k, no: i + 1, time: this.timeText(i, opts.time || 'relative', prev), src, dst, srcAddr: r.src, dstAddr: r.dst, proto: r.proto, len: this.idx.orig[i], info: r.info.slice(0, 400), cls: rowClass(r) });
    }
    return { start, rows: out, total: n };
  }

  packet(no) {
    const i = no - 1;
    if (!this.idx || i < 0 || i >= this.idx.n) return { error: `There is no packet ${no}.` };
    const b = this.bytes(i);
    const r = this.dissectAt(i, true);
    const names = [];
    for (const a of [r.src, r.dst]) { const e = this.names.get(a); if (e) names.push({ addr: a, name: e.name, from: e.from }); }
    return { no, bytes: new Uint8Array(b), tree: r.tree, proto: r.proto, info: r.info, l4: r.l4 ? { proto: r.l4.proto } : null, names, orig: this.idx.orig[i] };
  }

  /** Run a display filter over every packet. Cancels an older filter job. */
  async filter(expr, jobId) {
    const c = compile(expr);
    if (!c.ok) return { ok: false, error: c.error, at: c.at };
    this.filterJob = jobId;
    if (/\.stream\b/.test(expr)) await this.analyze();
    if (this.filterJob !== jobId) return { ok: false, cancelled: true };
    if (c.empty) { this.view = null; return { ok: true, count: this.idx.n, total: this.idx.n }; }
    const n = this.idx.n, hits = [];
    const t0 = Date.now(); let last = 0;
    for (let i = 0; i < n; i++) {
      let r;
      try { r = this.dissectAt(i, false); } catch { continue; }
      if (c.test(r.f)) hits.push(i);
      if ((i & 4095) === 4095) {
        const now = Date.now();
        if (now - last > 200) { last = now; this.post({ type: 'progress', phase: 'filter', done: i, total: n, matches: hits.length }); }
        await tick();
        if (this.filterJob !== jobId) return { ok: false, cancelled: true };
      }
    }
    this.view = Uint32Array.from(hits);
    return { ok: true, count: hits.length, total: n, ms: Date.now() - t0 };
  }

  /** Position of packet `no` in the current view, or -1. */
  find(no) {
    if (!this.view) return no - 1 < this.viewCount() ? no - 1 : -1;
    let lo = 0, hi = this.view.length - 1; const i = no - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (this.view[m] === i) return m; if (this.view[m] < i) lo = m + 1; else hi = m - 1; }
    return -1;
  }

  /** One pass over all packets: protocol hierarchy, conversations, endpoints and stream numbers. */
  analyze() {
    if (this.analysis) return Promise.resolve(this.analysis);
    if (!this.analysisPromise) this.analysisPromise = this._analyze().then(a => { this.analysis = a; return a; });
    return this.analysisPromise;
  }

  async _analyze() {
    const n = this.idx.n;
    const stream = new Int32Array(n).fill(-1);
    const streams = new Map(), convs = new Map(), eps = new Map(), hier = new Map();
    let nextStream = { tcp: 0, udp: 0 };
    const ep = (k, kind, bytes, tx) => {
      let e = eps.get(kind + ' ' + k);
      if (!e) { if (eps.size > 300000) return; e = { kind, addr: k, packets: 0, bytes: 0, txp: 0, txb: 0, rxp: 0, rxb: 0 }; eps.set(kind + ' ' + k, e); }
      e.packets++; e.bytes += bytes; if (tx) { e.txp++; e.txb += bytes; } else { e.rxp++; e.rxb += bytes; }
    };
    const conv = (kind, a, b, bytes, t, extra) => {
      const fwd = a <= b, key = kind + ' ' + (fwd ? a + ' ' + b : b + ' ' + a);
      let c = convs.get(key);
      if (!c) { if (convs.size > 300000) return null; c = { kind, a: fwd ? a : b, b: fwd ? b : a, packets: 0, bytes: 0, abp: 0, abb: 0, bap: 0, bab: 0, start: t, end: t, ...extra }; convs.set(key, c); }
      c.packets++; c.bytes += bytes; c.end = t; if (fwd) { c.abp++; c.abb += bytes; } else { c.bap++; c.bab += bytes; }
      return c;
    };
    let last = 0;
    for (let i = 0; i < n; i++) {
      let r;
      try { r = dissect(this.bytes(i), this.lt(i), { tree: false, orig: this.idx.orig[i] }); } catch { continue; }
      const len = this.idx.orig[i], t = this.relSec(i);
      const path = r.protos.filter(p => p !== 'frame' && p !== 'raw' && p !== 'null').join('/');
      const h = hier.get(path) || { packets: 0, bytes: 0 }; h.packets++; h.bytes += len; hier.set(path, h);
      const f = r.f;
      if (f['eth.src'] !== undefined) { const s = [].concat(f['eth.src'])[0], d = [].concat(f['eth.dst'])[0]; conv('Ethernet', s, d, len, t); ep(s, 'Ethernet', len, true); ep(d, 'Ethernet', len, false); }
      const v4 = f['ip.src'] !== undefined, v6 = f['ipv6.src'] !== undefined;
      if (v4 || v6) {
        const s = [].concat(v4 ? f['ip.src'] : f['ipv6.src'])[0], d = [].concat(v4 ? f['ip.dst'] : f['ipv6.dst'])[0];
        const kind = v4 ? 'IPv4' : 'IPv6';
        conv(kind, s, d, len, t); ep(s, kind, len, true); ep(d, kind, len, false);
      }
      if (r.l4) {
        const L = r.l4, a = `${bracket(L.src)}:${L.sp}`, b = `${bracket(L.dst)}:${L.dp}`;
        const key = L.proto + ' ' + (a <= b ? a + ' ' + b : b + ' ' + a);
        let sid = streams.get(key);
        if (sid === undefined) { sid = nextStream[L.proto]++; streams.set(key, sid); }
        stream[i] = sid;
        const c = conv(L.proto.toUpperCase(), a, b, len, t, { stream: sid, first: i + 1 });
        if (c && c.stream === undefined) c.stream = sid;
        ep(a, L.proto.toUpperCase(), len, true); ep(b, L.proto.toUpperCase(), len, false);
      }
      if ((i & 4095) === 4095) {
        const now = Date.now(); if (now - last > 250) { last = now; this.post({ type: 'progress', phase: 'stats', done: i, total: n }); }
        await tick();
      }
    }
    return { stream, streams: nextStream, convs, eps, hier };
  }

  async stats() {
    const a = await this.analyze();
    const top = (m, k) => [...m.values()].sort((x, y) => y.bytes - x.bytes).slice(0, k);
    const conv = top(a.convs, 20000), eps = top(a.eps, 20000);
    for (const e of eps) { const ad = e.kind === 'TCP' || e.kind === 'UDP' ? e.addr.replace(/^\[|\]:\d+$|:\d+$/g, '') : e.addr; e.name = e.kind === 'Ethernet' ? '' : this.name(ad) || ''; }
    const hier = [...a.hier.entries()].map(([path, v]) => ({ path, ...v }));
    return { conversations: conv, endpoints: eps, hierarchy: hier, total: this.idx.n, convCount: a.convs.size, epCount: a.eps.size, names: [...this.names.entries()].slice(0, 5000).map(([addr, v]) => ({ addr, ...v })) };
  }

  /** Follow the TCP or UDP stream of packet `no`: the payloads in capture order, by direction. */
  async follow(no, maxBytes = 16 * 1048576) {
    const i0 = no - 1;
    const r0 = this.dissectAt(i0, false);
    if (!r0.l4) return { error: `Packet ${no} is not TCP or UDP, so it has no stream to follow.` };
    const a = await this.analyze();
    const sid = a.stream[i0];
    const L = r0.l4, proto = L.proto;
    const key = proto + ' ' + (() => { const x = `${bracket(L.src)}:${L.sp}`, y = `${bracket(L.dst)}:${L.dp}`; return x <= y ? x + ' ' + y : y + ' ' + x; })();
    const segs = [];
    let total = [0, 0], client = null, truncated = false;
    const nextSeq = [null, null], seen = [0, 0];
    for (let i = 0; i < this.idx.n; i++) {
      if (a.stream[i] !== sid) continue;
      const r = this.dissectAt(i, false);
      if (!r.l4 || r.l4.proto !== proto) continue;
      const l = r.l4, x = `${bracket(l.src)}:${l.sp}`, y = `${bracket(l.dst)}:${l.dp}`;
      if (proto + ' ' + (x <= y ? x + ' ' + y : y + ' ' + x) !== key) continue;
      if (client === null) client = x;
      // The side that sent the first SYN (or the first packet) is the client.
      if (proto === 'tcp' && (l.flags & 0x12) === 0x02) client = x;
      const dir = x === client ? 0 : 1;
      if (l.len <= 0) { if (proto === 'tcp' && (l.flags & 3)) nextSeq[dir] = (l.seq + 1) >>> 0; continue; }
      let off = l.off, len = l.len;
      if (proto === 'tcp' && nextSeq[dir] !== null) {
        const diff = ((nextSeq[dir] - l.seq) | 0);
        if (diff >= len) continue;               // a retransmission of data we already have
        if (diff > 0) { off += diff; len -= diff; } // partly new
      }
      if (proto === 'tcp') nextSeq[dir] = (l.seq + l.len) >>> 0;
      seen[dir]++;
      if (total[0] + total[1] + len > maxBytes) { truncated = true; break; }
      const b = this.bytes(i);
      const prev = segs[segs.length - 1];
      const chunk = new Uint8Array(b.subarray(off, off + len));
      if (prev && prev.dir === dir && prev.nos.length < 1000) { prev.parts.push(chunk); prev.nos.push(i + 1); }
      else segs.push({ dir, parts: [chunk], nos: [i + 1] });
      total[dir] += len;
    }
    const out = segs.map(s => { const n = s.parts.reduce((t, p) => t + p.length, 0); const u = new Uint8Array(n); let o = 0; for (const p of s.parts) { u.set(p, o); o += p.length; } return { dir: s.dir, bytes: u, first: s.nos[0], last: s.nos[s.nos.length - 1] }; });
    const filter = proto === 'tcp' || proto === 'udp' ? `${proto}.stream == ${sid}` : '';
    const other = client === `${bracket(L.src)}:${L.sp}` ? `${bracket(L.dst)}:${L.dp}` : `${bracket(L.src)}:${L.sp}`;
    return { proto, stream: sid, client: client || '', server: other, segments: out, bytes: total, truncated, filter };
  }

  exportTo(path, which) {
    let list;
    if (which === 'view') list = this.view ? Array.from(this.view) : Array.from({ length: this.idx.n }, (_, i) => i);
    else list = which.map(no => no - 1).filter(i => i >= 0 && i < this.idx.n).sort((a, b) => a - b);
    const fd = fs.openSync(path, 'w');
    let bytes = 0;
    try {
      const r = buildExport(this.src, this.idx, this.ifs, list, b => { fs.writeSync(fd, b); bytes += b.length; });
      return { ok: true, count: list.length, bytes, format: r.format };
    } finally { fs.closeSync(fd); }
  }
}

function bracket(a) { return a && a.includes(':') ? `[${a}]` : a; }

function rowClass(r) {
  if (r.malformed) return 'bad';
  const p = r.protos;
  if (p.includes('tcp') && (r.f['tcp.flags.reset'] === 1)) return 'rst';
  if (p.includes('tcp') && (r.f['tcp.flags.syn'] === 1 || r.f['tcp.flags.fin'] === 1)) return 'syn';
  if (p.includes('http')) return 'http';
  if (p.includes('tls') || p.includes('quic')) return 'tls';
  if (p.includes('dns') || p.includes('mdns')) return 'dns';
  if (p.includes('dhcp')) return 'dhcp';
  if (p.includes('arp')) return 'arp';
  if (p.includes('icmp') || p.includes('icmpv6')) return 'icmp';
  if (p.includes('udp')) return 'udp';
  if (p.includes('tcp')) return 'tcp';
  return '';
}

function gzErr(e) {
  const m = (e && e.message) || String(e);
  if (/incorrect header check|unknown compression/i.test(m)) return `The file ends in .gz but is not gzip data (${m}).`;
  if (/unexpected end/i.test(m)) return `The .gz file is cut off before any packet could be read (${m}).`;
  if (e && e.code === 'EACCES') return 'You do not have permission to read this file. (EACCES)';
  return m;
}

module.exports = { Engine, maybeDns, rowClass };

return module.exports; })();
self.ZovoPcap = { Engine: M.engine.Engine, ChunkSource: M.capture.ChunkSource, compile: M.filter.compile, Buffer, LINKTYPES: M.dissect.LINKTYPES };
})();
