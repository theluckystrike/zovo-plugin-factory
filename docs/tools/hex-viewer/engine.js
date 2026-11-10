/* Zovo Hex Viewer engine 0.3.4 (git exec13-0.3.4), MIT license, https://github.com/theluckystrike/hex-viewer-vscode.
   Bundled for the browser by factory/sprint/tools/bundle_hex.py. Templates are data, never code. */
(function (g) {
"use strict";
if (typeof g.setImmediate !== "function") g.setImmediate = function (f) { return setTimeout(f, 0); };
// core/template.js uses Node Buffer.indexOf/lastIndexOf for the "find" directive. The browser gets a small
// Uint8Array subclass with the same two calls, visible to that module only (not a global Buffer).
class WebBuf extends Uint8Array {
  indexOf(n, from) { if (typeof n === "number") return super.indexOf(n, from); var L = n.length, last = this.length - L; if (!L) return 0;
    outer: for (var i = from | 0; i <= last; i++) { for (var k = 0; k < L; k++) if (this[i + k] !== n[k]) continue outer; return i; } return -1; }
  lastIndexOf(n) { if (typeof n === "number") return super.lastIndexOf(n); var L = n.length;
    outer: for (var i = this.length - L; i >= 0; i--) { for (var k = 0; k < L; k++) if (this[i + k] !== n[k]) continue outer; return i; } return -1; }
}
var WebBuffer = { from: function (x, off, len) { return x instanceof ArrayBuffer ? new WebBuf(x, off || 0, len === undefined ? x.byteLength - (off || 0) : len) : WebBuf.from(x); } };
var M = {}, C = {};
function req(n) { if (C[n]) return C[n].exports; var m = C[n] = { exports: {} }; M[n](m, m.exports, req); return m.exports; }
M["./expr"] = function (module, exports, require) {
'use strict';
// A small, safe expression language for binary templates. No eval, no Function, no property access
// outside the template's own values. Numbers are JS numbers (u64 values above 2^53 lose precision in
// expressions; they still show exactly in the tree). Supported:
//   literals 12, 0x1F, 0b101, 'text', "text", true, false
//   names a, a.b, a[2], a.length, parent.x, root.x, _ (the current element of an array loop)
//   + - * / % (integer division with //), << >> >>> & | ^ ~, == != < <= > >=, && || !, ?: and (...)
//   functions: min max abs align(x, n) pos() size() start() end() str(x) hex(x) len(x) defined(x)
//              u8(off) u16(off) u32(off) (current byte order), u16le u16be u32le u32be: peek at file bytes
//              addr(table, a, 'vfield', 'sizefield', 'filefield'): map an address through a list of structs
//              (PE sections, ELF program headers): a - e.vfield + e.filefield for the first element e with
//              e.vfield <= a < e.vfield + e.sizefield, or -1 when no element covers a
// Every evaluation has a step budget, so a hostile template cannot hang the extension host.

const FUNCS = new Set(['min', 'max', 'abs', 'align', 'pos', 'size', 'start', 'end', 'str', 'hex', 'len', 'defined', 'oct', 'addr',
  'u8', 'u16', 'u32', 'u16le', 'u16be', 'u32le', 'u32be']);
const PEEKS = new Set(['u8', 'u16', 'u32', 'u16le', 'u16be', 'u32le', 'u32be']);
const MAX_LEN = 2000;
const MAX_STEPS = 20000;

class ExprError extends Error {}

function tokenize(src) {
  if (typeof src !== 'string') throw new ExprError('An expression must be text.');
  if (src.length > MAX_LEN) throw new ExprError(`An expression is longer than ${MAX_LEN} characters.`);
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    let m;
    const rest = src.slice(i);
    if ((m = /^0x[0-9a-f_]+|^0b[01_]+|^\d[\d_]*(\.\d+)?(e[+-]?\d+)?/i.exec(rest))) {
      const t = m[0].replace(/_/g, '');
      const v = /^0b/i.test(t) ? parseInt(t.slice(2), 2) : Number(t);
      if (!Number.isFinite(v)) throw new ExprError(`Bad number ${m[0]}.`);
      out.push({ t: 'num', v }); i += m[0].length; continue;
    }
    if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) { out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\' && j + 1 < src.length) { j++; s += src[j] === 'n' ? '\n' : src[j]; } else s += src[j]; j++; }
      if (j >= src.length) throw new ExprError('A text in quotes has no closing quote.');
      out.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if ((m = /^(>>>|<<|>>|<=|>=|==|!=|&&|\|\||\/\/|[-+*/%<>&|^~!?:().,[\]])/.exec(rest))) { out.push({ t: 'op', v: m[0] }); i += m[0].length; continue; }
    throw new ExprError(`Unexpected character "${c}" in ${src}`);
  }
  out.push({ t: 'end' });
  return out;
}

// Precedence climbing parser to a small AST.
const BIN = [
  ['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '<=', '>', '>='], ['<<', '>>', '>>>'], ['+', '-'], ['*', '/', '//', '%'],
];

function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = v => toks[p].t === 'op' && toks[p].v === v;
  const expect = v => { if (!isOp(v)) throw new ExprError(`Expected "${v}" in ${src}`); p++; };
  let depth = 0;
  const ternary = () => {
    if (++depth > 64) throw new ExprError('The expression is nested too deep.');
    const c = binary(0);
    if (isOp('?')) { p++; const a = ternary(); expect(':'); const b = ternary(); depth--; return { k: '?', c, a, b }; }
    depth--;
    return c;
  };
  const binary = lvl => {
    if (lvl >= BIN.length) return unary();
    let l = binary(lvl + 1);
    while (toks[p].t === 'op' && BIN[lvl].includes(toks[p].v)) { const op = toks[p++].v; const r = binary(lvl + 1); l = { k: 'bin', op, l, r }; }
    return l;
  };
  const unary = () => {
    if (isOp('-') || isOp('!') || isOp('~') || isOp('+')) { const op = toks[p++].v; return { k: 'un', op, x: unary() }; }
    return postfix(primary());
  };
  const primary = () => {
    const t = peek();
    if (t.t === 'num' || t.t === 'str') { p++; return { k: 'lit', v: t.v }; }
    if (t.t === 'id') {
      p++;
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (isOp('(')) {
        if (!FUNCS.has(t.v)) throw new ExprError(`Unknown function ${t.v}().`);
        p++;
        const args = [];
        if (!isOp(')')) { args.push(ternary()); while (isOp(',')) { p++; args.push(ternary()); } }
        expect(')');
        return { k: 'call', f: t.v, args };
      }
      return { k: 'name', v: t.v };
    }
    if (isOp('(')) { p++; const e = ternary(); expect(')'); return e; }
    throw new ExprError(`Unexpected ${t.t === 'end' ? 'end' : '"' + t.v + '"'} in ${src}`);
  };
  const postfix = e => {
    for (;;) {
      if (isOp('.')) { p++; const t = peek(); if (t.t !== 'id') throw new ExprError(`Expected a name after "." in ${src}`); p++; e = { k: 'get', o: e, key: { k: 'lit', v: t.v } }; }
      else if (isOp('[')) { p++; const key = ternary(); expect(']'); e = { k: 'get', o: e, key }; }
      else return e;
    }
  };
  const ast = ternary();
  if (peek().t !== 'end') throw new ExprError(`Unexpected "${peek().v}" in ${src}`);
  return ast;
}

const cache = new Map();
function compile(src) {
  if (typeof src === 'number') return { k: 'lit', v: src };
  let a = cache.get(src);
  if (!a) { a = parse(src); if (cache.size > 5000) cache.clear(); cache.set(src, a); }
  return a;
}

const num = v => (typeof v === 'bigint' ? Number(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v);
// A field value as stored in the tree: { value } for numbers and text, arrays and structs as nodes.
function unwrap(v) {
  if (v && typeof v === 'object' && v.__node) return v.kind === 'value' ? v.value : v;
  return v;
}

/**
 * Evaluate `src` in `scope`: { lookup(name), member(obj, key), pos(), size() }.
 * Returns a number, string, boolean or a node (struct/array) for member access.
 */
function evaluate(src, scope) {
  const ast = compile(src);
  let steps = 0;
  // raw(): a name or member access without unwrapping, so value fields keep .offset and .size
  const raw = n => {
    if (n.k === 'name') return scope.lookup(n.v);
    if (n.k === 'get') { const o = raw(n.o); const key = ev(n.key); return scope.member(o, key); }
    return ev(n);
  };
  const ev = n => {
    if (++steps > MAX_STEPS) throw new ExprError('The expression took too many steps.');
    switch (n.k) {
      case 'lit': return n.v;
      case 'name': return unwrap(scope.lookup(n.v));
      case 'get': return unwrap(raw(n));
      case 'un': {
        const x = num(ev(n.x));
        if (n.op === '-') return -x; if (n.op === '+') return +x; if (n.op === '!') return !x;
        return Number(~BigInt.asIntN(64, BigInt(Math.trunc(x))));
      }
      case '?': return ev(n.c) ? ev(n.a) : ev(n.b);
      case 'bin': {
        if (n.op === '&&') { const l = ev(n.l); return l ? ev(n.r) : l; }
        if (n.op === '||') { const l = ev(n.l); return l ? l : ev(n.r); }
        let l = ev(n.l), r = ev(n.r);
        if (n.op === '==' || n.op === '!=') {
          const eq = (typeof l === 'string' || typeof r === 'string') ? String(num(l)) === String(num(r)) : num(l) === num(r);
          return n.op === '==' ? eq : !eq;
        }
        if (n.op === '+' && (typeof l === 'string' || typeof r === 'string')) return String(l) + String(r);
        if (BITS.has(n.op)) return bitop(n.op, l, r);
        l = num(l); r = num(r);
        if (typeof l !== 'number' || typeof r !== 'number') throw new ExprError(`"${n.op}" needs numbers.`);
        switch (n.op) {
          case '+': return l + r; case '-': return l - r; case '*': return l * r;
          case '/': if (r === 0) throw new ExprError('Division by zero.'); return l / r;
          case '//': if (r === 0) throw new ExprError('Division by zero.'); return Math.floor(l / r);
          case '%': if (r === 0) throw new ExprError('Division by zero.'); return l % r;
          case '<': return l < r; case '<=': return l <= r; case '>': return l > r; case '>=': return l >= r;
        }
        throw new ExprError(`Unknown operator ${n.op}.`);
      }
      case 'call': {
        const a = n.args.map(ev);
        if (PEEKS.has(n.f)) {
          const off = num(a[0]);
          if (!Number.isSafeInteger(off) || off < 0) throw new ExprError(`${n.f}() needs an offset of 0 or more.`);
          return scope.peek(n.f, off);
        }
        switch (n.f) {
          case 'min': return Math.min(...a.map(num));
          case 'max': return Math.max(...a.map(num));
          case 'abs': return Math.abs(num(a[0]));
          case 'align': { const x = num(a[0]), m = num(a[1]) || 1; return Math.ceil(x / m) * m; }
          case 'pos': return scope.pos();
          case 'size': return scope.size();
          case 'start': return scope.start ? scope.start() : 0;
          case 'end': return scope.end ? scope.end() : scope.size();
          case 'str': return String(a[0]);
          case 'hex': return '0x' + Math.trunc(num(a[0])).toString(16).toUpperCase();
          case 'len': return a[0] && typeof a[0] === 'object' && Array.isArray(a[0].children) ? a[0].children.length : String(a[0] == null ? '' : a[0]).length;
          case 'defined': return a[0] !== undefined && a[0] !== null;
          case 'addr': {
            const [tab, at, vf, sf, ff] = a;
            if (!tab || typeof tab !== 'object' || !tab.__node || tab.kind !== 'array') return -1;
            if (typeof vf !== 'string' || typeof sf !== 'string' || typeof ff !== 'string') throw new ExprError('addr() needs three field names in quotes.');
            const x = num(at);
            if (typeof x !== 'number' || !Number.isFinite(x)) return -1;
            for (const e of tab.children) {
              steps += 3;
              if (steps > MAX_STEPS) throw new ExprError('The expression took too many steps.');
              if (!e || e.kind !== 'struct') continue;
              const v = num(unwrap(scope.member(e, vf))), sz = num(unwrap(scope.member(e, sf))), f = num(unwrap(scope.member(e, ff)));
              if (typeof v !== 'number' || typeof sz !== 'number' || typeof f !== 'number') continue;
              if (x >= v && x < v + sz) return x - v + f;
            }
            return -1;
          }
          case 'oct': { const t = String(a[0] == null ? '' : a[0]).replace(/[\0\s]+/g, ''); return /^[0-7]+$/.test(t) ? parseInt(t, 8) : 0; }
        }
      }
    }
    throw new ExprError('Bad expression.');
  };
  return ev(ast);
}

// Bit operations on up to 64-bit unsigned values (JS bit operators are 32-bit). u64 fields come in as BigInt
// and stay exact; the result is a Number when it fits in 2^53, else a BigInt.
const BITS = new Set(['&', '|', '^', '<<', '>>', '>>>']);
const big = v => (typeof v === 'bigint' ? v : BigInt(Math.trunc(num(v)) || 0));
function bitop(op, l, r) {
  if ((typeof l !== 'number' && typeof l !== 'bigint' && typeof l !== 'boolean') || (typeof r !== 'number' && typeof r !== 'bigint' && typeof r !== 'boolean')) throw new ExprError(`"${op}" needs numbers.`);
  const L = BigInt.asUintN(64, big(l)), R = big(r);
  let v;
  switch (op) {
    case '&': v = L & BigInt.asUintN(64, R); break;
    case '|': v = L | BigInt.asUintN(64, R); break;
    case '^': v = L ^ BigInt.asUintN(64, R); break;
    case '<<': v = BigInt.asUintN(64, L << (R & 63n)); break;
    case '>>': case '>>>': v = L >> (R & 63n); break;
  }
  return v <= 9007199254740991n ? Number(v) : v;
}

module.exports = { evaluate, compile, tokenize, ExprError, MAX_STEPS };

};
M["./template"] = function (module, exports, require) {
var Buffer = WebBuffer;
'use strict';
// Binary templates: a JSON file describes the structures of a file format; parse() reads a document with it
// and returns a tree of fields (name, offset, size, value). Templates are data, never code: expressions go
// through core/expr.js. Every parse has limits (fields, depth, array length, time), so a hostile file or a
// hostile template cannot hang or blow up the extension host. Reads go through doc.read(offset, length),
// so unsaved edits show and 4 GB files work (only the bytes a template touches are read).
//
// Template shape (see TEMPLATES.md):
//   { "id", "name", "extensions": [..], "match": [[{ "offset", "hex" } | { "offset", "type", "min", "max" }], ...],
//     "endian": "little" | "big", "root": "StructName", "structs": { "Name": [fields] | { "fields", "endian", "size", "label" } },
//     "enums": { "Name": { "1": "text" } }, "flags": { "Name": { "0x1": "text" } } }
// Field: { "name", "type", "count" | "until" | "while", "length", "size", "at", "peek", "if", "endian", "enum", "flags",
//          "format", "expect", "label", "encoding", "comment", "value" } or a directive { "seek" | "skip" | "align" | "skipWhitespace" }.
const { evaluate, ExprError } = require('./expr');

const PRIM = {
  u8: [1, 'u'], u16: [2, 'u'], u24: [3, 'u'], u32: [4, 'u'], u64: [8, 'u'],
  i8: [1, 'i'], i16: [2, 'i'], i24: [3, 'i'], i32: [4, 'i'], i64: [8, 'i'],
  f32: [4, 'f'], f64: [8, 'f'],
};
const VAR_TYPES = new Set(['bytes', 'char', 'string', 'zstring', 'asciiint', 'line', 'uleb128', 'sleb128']);
const C_TYPES = { u8: 'uint8_t', u16: 'uint16_t', u24: 'uint8_t', u32: 'uint32_t', u64: 'uint64_t', i8: 'int8_t', i16: 'int16_t', i24: 'uint8_t', i32: 'int32_t', i64: 'int64_t', f32: 'float', f64: 'double' };
const DEFAULT_LIMITS = { maxNodes: 50000, maxDepth: 48, maxArray: 100000, maxMs: 15000, maxString: 4096, maxFind: 16 << 20 };
const BLOCK = 1 << 16;
const MAX_BLOCKS = 64;

class Stop extends Error {}
class NeedRead extends Error { constructor(off, n) { super('need read'); this.off = off; this.n = n; } }

// ---------- reading with a small block cache ----------

class Reader {
  constructor(doc) { this.doc = doc; this.size = doc.size; this.blocks = new Map(); }
  async load(k) {
    if (this.blocks.has(k)) { const b = this.blocks.get(k); this.blocks.delete(k); this.blocks.set(k, b); return b; }
    const b = await this.doc.read(k * BLOCK, BLOCK);
    this.blocks.set(k, b);
    if (this.blocks.size > MAX_BLOCKS) this.blocks.delete(this.blocks.keys().next().value);
    return b;
  }
  /** Up to n bytes at off (shorter at the end of the file). */
  async bytes(off, n) {
    n = Math.max(0, Math.min(n, this.size - off));
    if (n <= 0) return new Uint8Array(0);
    const k0 = Math.floor(off / BLOCK), k1 = Math.floor((off + n - 1) / BLOCK);
    if (k0 === k1) { const b = await this.load(k0); const s = off - k0 * BLOCK; return b.subarray(s, Math.min(b.length, s + n)); }
    if (n > 4 * BLOCK) return this.doc.read(off, n);
    const out = new Uint8Array(n);
    let got = 0;
    for (let k = k0; k <= k1; k++) {
      const b = await this.load(k);
      const s = k === k0 ? off - k0 * BLOCK : 0;
      const take = Math.min(b.length - s, n - got);
      if (take <= 0) break;
      out.set(b.subarray(s, s + take), got); got += take;
    }
    return out.subarray(0, got);
  }
  /** Synchronous peek for expressions: throws NeedRead when the block is not loaded yet. */
  peekSync(off, n) {
    if (off + n > this.size) throw new ExprError(`Offset 0x${off.toString(16)} is past the end of the file.`);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const k = Math.floor((off + i) / BLOCK);
      const b = this.blocks.get(k);
      if (!b) throw new NeedRead(off, n);
      out[i] = b[off + i - k * BLOCK];
    }
    return out;
  }
}

function readNum(b, kind, size, little) {
  const dv = new DataView(b.buffer, b.byteOffset, b.length);
  if (kind === 'f') return size === 4 ? dv.getFloat32(0, little) : dv.getFloat64(0, little);
  if (size === 8) {
    const v = kind === 'u' ? dv.getBigUint64(0, little) : dv.getBigInt64(0, little);
    return v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v;
  }
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + b[little ? size - 1 - i : i];
  if (kind === 'i' && v >= 2 ** (size * 8 - 1)) v -= 2 ** (size * 8);
  return v;
}

// ---------- display ----------

const hex2 = b => (b < 16 ? '0' : '') + b.toString(16).toUpperCase();
const hexBytes = (b, max = 16) => Array.from(b.subarray(0, max), hex2).join(' ') + (b.length > max ? ' …' : '');
const hexNum = v => (typeof v === 'bigint' ? (v < 0n ? '-0x' + (-v).toString(16) : '0x' + v.toString(16)) : (v < 0 ? '-0x' + (-v).toString(16) : '0x' + v.toString(16))).toUpperCase().replace('0X', '0x');

function dosDate(v) { const d = v & 31, m = (v >> 5) & 15, y = 1980 + (v >> 9); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function dosTime(v) { return `${String(v >> 11).padStart(2, '0')}:${String((v >> 5) & 63).padStart(2, '0')}:${String((v & 31) * 2).padStart(2, '0')}`; }

function quote(s, max = 200) {
  const t = s.length > max ? s.slice(0, max) + '…' : s;
  return '"' + t.replace(/[\x00-\x1f\x7f]/g, c => (c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : c === '\0' ? '\\0' : '\\x' + hex2(c.charCodeAt(0)))) + '"';
}

function displayNum(v, f, tpl) {
  const n = typeof v === 'bigint' ? v : v;
  let base;
  if (f.format === 'hex') base = hexNum(n);
  else if (f.format === 'dec' || typeof n === 'number' && !Number.isInteger(n)) base = String(n);
  else if (f.format === 'unix' && typeof n === 'number') { const d = new Date(n * 1000); base = isNaN(d) ? String(n) : d.toISOString().replace('.000Z', 'Z') + ` (${n})`; }
  else if (f.format === 'dosdate') base = `${dosDate(Number(n))} (${hexNum(n)})`;
  else if (f.format === 'dostime') base = `${dosTime(Number(n))} (${hexNum(n)})`;
  else if (f.format === 'char' && typeof n === 'number') base = `${quote(String.fromCharCode(n))} (${hexNum(n)})`;
  else base = `${n} (${hexNum(n)})`;
  const en = lookupMap(tpl, 'enums', f.enum);
  if (en) {
    const name = en[String(n)] !== undefined ? en[String(n)] : en[hexNum(n)] !== undefined ? en[hexNum(n)] : en[hexNum(n).toLowerCase()];
    return name !== undefined ? `${name} (${f.format === 'hex' || f.format === undefined ? hexNum(n) : n})` : `${base}, unknown value`;
  }
  const fl = lookupMap(tpl, 'flags', f.flags);
  if (fl) {
    const set = [];
    const big = BigInt.asUintN(64, BigInt(typeof n === 'bigint' ? n : Math.trunc(n)));
    let rest = big;
    for (const [k, name] of Object.entries(fl)) {
      let bit; try { bit = BigInt(k); } catch { continue; }
      if (bit && (big & bit) === bit) { set.push(name); rest &= ~bit; }
    }
    if (rest) set.push(hexNum(rest));
    return `${set.length ? set.join(' | ') : 'none'} (${hexNum(n)})`;
  }
  return base;
}

function enumName(v, f, tpl) {
  const en = lookupMap(tpl, 'enums', f.enum);
  if (!en) return undefined;
  const h = hexNum(v);
  return en[String(v)] !== undefined ? en[String(v)] : en[h] !== undefined ? en[h] : en[h.toLowerCase()];
}

function lookupMap(tpl, kind, ref) {
  if (!ref) return null;
  if (typeof ref === 'object') return ref;
  return (tpl[kind] && tpl[kind][ref]) || null;
}

// ---------- template checks ----------

/** Plain-language check of a template object. Returns a list of problems (empty when it is usable). */
function checkTemplate(t) {
  const errs = [];
  if (!t || typeof t !== 'object' || Array.isArray(t)) return ['The template must be a JSON object.'];
  if (typeof t.name !== 'string' || !t.name) errs.push('"name" is missing.');
  if (!t.structs || typeof t.structs !== 'object') errs.push('"structs" is missing.');
  const root = t.root || 'File';
  if (t.structs && !t.structs[root]) errs.push(`The root struct "${root}" is not in "structs".`);
  if (t.endian && !['little', 'big'].includes(t.endian)) errs.push('"endian" must be "little" or "big".');
  if (t.match !== undefined && !Array.isArray(t.match)) errs.push('"match" must be a list.');
  const known = n => PRIM[n] || VAR_TYPES.has(n) || (t.structs && t.structs[n]);
  const visit = (fields, where) => {
    if (!Array.isArray(fields)) { errs.push(`${where}: the fields must be a list.`); return; }
    fields.forEach((f, i) => {
      if (!f || typeof f !== 'object') { errs.push(`${where}, field ${i + 1}: must be an object.`); return; }
      const directive = ['seek', 'skip', 'align', 'skipWhitespace'].some(k => k in f);
      if (directive) return;
      if (typeof f.name !== 'string' || !f.name) errs.push(`${where}, field ${i + 1}: "name" is missing.`);
      if ('value' in f) return;
      const ty = f.type;
      if (typeof ty === 'string') { if (!known(ty)) errs.push(`${where}.${f.name}: unknown type "${ty}".`); }
      else if (ty && typeof ty === 'object' && 'switch' in ty) {
        for (const c of Object.values(ty.cases || {})) if (!known(c)) errs.push(`${where}.${f.name}: unknown type "${c}" in a switch.`);
        if (ty.default && !known(ty.default)) errs.push(`${where}.${f.name}: unknown default type "${ty.default}".`);
      } else if (Array.isArray(ty)) visit(ty, `${where}.${f.name}`);
      else errs.push(`${where}.${f.name || i + 1}: "type" is missing.`);
      if (['bytes', 'char', 'string'].includes(ty) && f.length === undefined) errs.push(`${where}.${f.name}: type ${ty} needs "length".`);
    });
  };
  for (const [name, s] of Object.entries(t.structs || {})) visit(Array.isArray(s) ? s : s && s.fields, name);
  return errs;
}

// ---------- matching ----------

async function matchScore(t, reader, ext) {
  let best = 0;
  for (const alt of t.match || []) {
    let ok = alt.length > 0, score = 0;
    for (const m of alt) {
      try {
        if (m.hex) {
          const want = parseHex(m.hex);
          const off = m.offset < 0 ? reader.size + m.offset : m.offset || 0;
          const got = await reader.bytes(off, want.length);
          if (got.length !== want.length || !got.every((v, i) => v === want[i])) { ok = false; break; }
          score += want.length * 10;
        } else if (m.type && PRIM[m.type]) {
          const [sz, kind] = PRIM[m.type];
          const b = await reader.bytes(m.offset || 0, sz);
          if (b.length < sz) { ok = false; break; }
          const v = Number(readNum(b, kind, sz, m.endian !== 'big'));
          if ((m.min !== undefined && v < m.min) || (m.max !== undefined && v > m.max)) { ok = false; break; }
          score += 5;
        } else if (m.text) {
          const want = new TextEncoder().encode(m.text);
          const got = await reader.bytes(m.offset || 0, want.length);
          if (got.length !== want.length || !got.every((v, i) => v === want[i])) { ok = false; break; }
          score += want.length * 10;
        }
      } catch { ok = false; break; }
    }
    if (ok) best = Math.max(best, score);
  }
  if (!best && ext && (t.extensions || []).includes(ext)) best = 1;
  return best;
}

/** Templates that fit the document, best first: [{ template, score }]. */
async function detect(templates, doc, fileName) {
  const reader = doc instanceof Reader ? doc : new Reader(doc);
  const ext = String(fileName || '').toLowerCase().replace(/^.*\./, '');
  const out = [];
  for (const t of templates) {
    const score = await matchScore(t, reader, ext);
    if (score > 0) out.push({ template: t, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

function parseHex(s) {
  const clean = String(s).replace(/0x/gi, '').replace(/[\s,]/g, '');
  if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error(`Bad hex bytes: ${s}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

// ---------- parsing ----------

/**
 * Parse `doc` (size + read(offset, length)) with template `t`. opts: { limits, shouldStop }.
 * Returns { root, nodes, error, ms }. Nodes: { __node, kind: 'struct'|'array'|'value', name, type, offset, size,
 * value?, display?, children?, error?, label?, computed? }.
 */
async function parse(t, doc, opts = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(opts.limits || {}) };
  const shouldStop = opts.shouldStop || (() => false);
  const reader = doc instanceof Reader ? doc : new Reader(doc);
  const size = reader.size;
  const t0 = Date.now();
  let nodes = 0, lastYield = Date.now();
  const structs = t.structs || {};
  const def = name => { const s = structs[name]; return Array.isArray(s) ? { fields: s } : s; };

  const count = async () => {
    if (++nodes > limits.maxNodes) throw new Stop(`The template made more than ${limits.maxNodes.toLocaleString('en-US')} fields; the tree stops here.`);
    if (Date.now() - lastYield > 8) {
      await new Promise(r => setImmediate(r)); lastYield = Date.now();
      if (shouldStop()) throw new Stop('Stopped.');
      if (Date.now() - t0 > limits.maxMs) throw new Stop(`The template ran longer than ${limits.maxMs / 1000} seconds; the tree stops here.`);
    }
  };

  // Scope for expressions: the current struct node, then its parents.
  const scopeOf = (node, cur, extra) => ({
    lookup(name) {
      if (extra && name in extra) return extra[name];
      if (name === 'this') return node;
      if (name === 'parent') return node.parentNode || null;
      if (name === 'root') return rootNode;
      if (name === 'i') { for (let n = node; n; n = n.parentNode) if (n.loopIndex !== undefined) return n.loopIndex; }
      for (let n = node; n; n = n.parentNode) if (n.vars && n.vars.has(name)) return n.vars.get(name);
      throw new ExprError(`"${name}" is not defined yet.`);
    },
    member(o, key) {
      if (o == null) throw new ExprError(`Cannot read "${key}" of nothing.`);
      if (typeof o === 'string') { if (key === 'length') return o.length; if (Number.isInteger(key)) return o.charCodeAt(key); throw new ExprError(`Text has no "${key}".`); }
      if (o.__node && o.kind === 'array') {
        if (key === 'length') return o.children.length;
        const i = Number(key);
        if (Number.isInteger(i) && i >= 0 && i < o.children.length) return o.children[i];
        if (Number.isInteger(i) && i < 0 && -i <= o.children.length) return o.children[o.children.length + i];
        throw new ExprError(`${o.name} has no element ${key}.`);
      }
      if (o.__node && o.kind === 'struct') {
        if (key === 'offset' && !o.vars.has('offset')) return o.offset;
        if (key === 'size' && !o.vars.has('size')) return o.size;
        if (o.vars.has(key)) return o.vars.get(key);
        throw new ExprError(`${o.name} has no field "${key}".`);
      }
      if (o.__node && o.kind === 'value') { if (key === 'offset') return o.offset; if (key === 'size') return o.size; }
      throw new ExprError(`Cannot read "${key}".`);
    },
    pos: () => cur.pos,
    size: () => size,
    start: () => node.offset,
    end: () => cur.end,
    peek(fn, off) {
      const n = fn === 'u8' ? 1 : /16/.test(fn) ? 2 : 4;
      const little = /le$/.test(fn) ? true : /be$/.test(fn) ? false : cur.little;
      return readNum(reader.peekSync(off, n), 'u', n, little);
    },
  });

  // Evaluate with automatic loading of bytes that u8()/u16()/u32() need.
  const ev = async (src, node, cur, extra) => {
    for (let tries = 0; ; tries++) {
      try { return evaluate(src, scopeOf(node, cur, extra)); }
      catch (e) {
        if (e instanceof NeedRead && tries < 64) { await reader.bytes(e.off, e.n); continue; }
        if (e instanceof ExprError || e instanceof NeedRead) throw new Stop(`${e.message || 'Bad expression'} (in ${typeof src === 'string' ? src : JSON.stringify(src)})`);
        throw e;
      }
    }
  };
  const evNum = async (src, node, cur, what) => {
    const v = typeof src === 'number' ? src : await ev(src, node, cur);
    const n = typeof v === 'bigint' ? Number(v) : typeof v === 'boolean' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Stop(`${what} is not a number (${src}).`);
    return Math.trunc(n);
  };
  const endianOf = async (spec, node, cur, fallback) => {
    if (!spec) return fallback;
    if (spec === 'little' || spec === 'big') return spec === 'little';
    const v = await ev(spec, node, cur);
    if (v !== 'little' && v !== 'big') throw new Stop(`The byte order must be "little" or "big", not ${v}.`);
    return v === 'little';
  };

  const mk = (kind, name, type, offset, parentNode) => ({ __node: true, kind, name, type, offset, size: 0, parentNode, children: kind === 'value' ? undefined : [], vars: kind === 'struct' ? new Map() : undefined });

  async function resolveType(f, node, cur) {
    const ty = f.type;
    if (typeof ty === 'string' || Array.isArray(ty)) return ty;
    if (ty && typeof ty === 'object' && 'switch' in ty) {
      const v = await ev(ty.switch, node, cur);
      const key = typeof v === 'bigint' ? v.toString() : String(v);
      const cases = ty.cases || {};
      let hit = cases[key];
      if (hit === undefined && typeof v === 'number') hit = cases[hexNum(v)] !== undefined ? cases[hexNum(v)] : cases[hexNum(v).toLowerCase()];
      return hit !== undefined ? hit : (ty.default || null);
    }
    throw new Stop(`Field ${f.name} has no type.`);
  }

  /** Parse one item of type `ty` at cur.pos into a node; advances cur.pos. */
  async function one(f, ty, name, node, cur, depth) {
    await count();
    const offset = cur.pos;
    if (ty === null) {
      // switch without a match: show the bytes the size covers, if any
      const v = mk('value', name, 'bytes', offset, node);
      v.size = 0; v.display = '(no case for this value)';
      return v;
    }
    if (Array.isArray(ty) || structs[ty]) {
      if (depth > limits.maxDepth) throw new Stop(`Structs are nested more than ${limits.maxDepth} deep.`);
      const d = Array.isArray(ty) ? { fields: ty } : def(ty);
      const s = mk('struct', name, Array.isArray(ty) ? 'struct' : ty, offset, node);
      // size and byte order are evaluated in the new struct's scope: its parent is the struct that holds the field
      const little = await endianOf(d.endian, s, cur, cur.little);
      const fixed = f.size !== undefined ? await evNum(f.size, s, cur, `The size of ${name}`) : d.size !== undefined ? await evNum(d.size, s, cur, `The size of ${name}`) : null;
      if (fixed !== null && fixed < 0) throw new Stop(`${name} has a negative size (${fixed}).`);
      const inner = { pos: offset, little, end: fixed !== null ? Math.min(cur.end, offset + fixed) : cur.end };
      try {
        for (const g of d.fields || []) await field(g, s, inner, depth + 1);
      } catch (e) {
        s.size = Math.max(0, inner.pos - offset);
        if (e instanceof Stop && !s.error) s.error = e.message;
        throw Object.assign(e, { partial: s });
      }
      s.size = fixed !== null ? fixed : inner.pos - offset;
      const lab = d.label || f.label;
      if (lab) {
        // a label that names an enum field shows the enum name (LC_SEGMENT_64, not 25)
        const direct = typeof lab === 'string' && /^[A-Za-z_]\w*$/.test(lab) ? s.vars.get(lab) : null;
        if (direct && direct.enumName !== undefined) s.label = direct.enumName;
        else { try { const l = await ev(lab, s, inner); s.label = l && typeof l === 'object' ? '' : String(l); } catch { /* a label is optional */ } }
      }
      cur.pos = offset + s.size;
      return s;
    }
    if (PRIM[ty]) {
      const [sz, kind] = PRIM[ty];
      const little = await endianOf(f.endian, node, cur, cur.little);
      const v = mk('value', name, ty, offset, node);
      v.size = sz;
      if (offset + sz > size) { v.error = `Needs ${sz} bytes at 0x${offset.toString(16).toUpperCase()}, past the end of the file.`; throw Object.assign(new Stop(v.error), { partial: v }); }
      const b = await reader.bytes(offset, sz);
      v.value = readNum(b, kind, sz, little);
      v.display = displayNum(v.value, f, t);
      const en = enumName(v.value, f, t);
      if (en !== undefined) v.enumName = String(en);
      cur.pos = offset + sz;
      return v;
    }
    if (VAR_TYPES.has(ty)) {
      const v = mk('value', name, ty, offset, node);
      if (ty === 'bytes' || ty === 'char' || ty === 'string') {
        const len = await evNum(f.length, node, cur, `The length of ${name}`);
        if (len < 0) { v.error = `${name} has a negative length (${len}).`; throw Object.assign(new Stop(v.error), { partial: v }); }
        v.size = len; v.type = `${ty}[${len}]`;
        if (offset + len > size) { v.error = `${name} needs ${len.toLocaleString('en-US')} bytes, past the end of the file.`; v.size = Math.max(0, size - offset); throw Object.assign(new Stop(v.error), { partial: v }); }
        const b = await reader.bytes(offset, Math.min(len, ty === 'bytes' ? 32 : limits.maxString));
        if (ty === 'bytes') { v.display = len ? hexBytes(b) : '(empty)'; v.value = len <= 8 ? hexBytes(b, 8) : undefined; }
        else {
          // char[n] is a C text field: it ends at the first zero byte
          const z = ty === 'char' ? b.indexOf(0) : -1;
          v.value = decode(z >= 0 ? b.subarray(0, z) : b, f.encoding || (ty === 'char' ? 'latin1' : 'utf8'));
          if (len > limits.maxString && z < 0) v.value += '…';
          v.display = quote(v.value);
        }
        cur.pos = offset + len;
      } else if (ty === 'zstring' || ty === 'line') {
        const max = f.length !== undefined ? await evNum(f.length, node, cur, `The length of ${name}`) : limits.maxString;
        const b = await reader.bytes(offset, Math.min(max, limits.maxString) + 1);
        const stopAt = ty === 'zstring' ? b.indexOf(0) : b.indexOf(10);
        const n = stopAt >= 0 ? stopAt : Math.min(b.length, max);
        let text = b.subarray(0, n);
        if (ty === 'line' && text.length && text[text.length - 1] === 13) text = text.subarray(0, text.length - 1);
        v.value = decode(text, f.encoding || 'utf8'); v.display = quote(v.value);
        v.size = n + (stopAt >= 0 ? 1 : 0);
        cur.pos = offset + v.size;
      } else if (ty === 'asciiint') {
        const b = await reader.bytes(offset, 40);
        let i = 0;
        while (i < b.length && (b[i] === 32 || b[i] === 9 || b[i] === 10 || b[i] === 13 || b[i] === 12 || b[i] === 0)) i++;
        let j = i;
        if (j < b.length && (b[j] === 45 || b[j] === 43)) j++;
        while (j < b.length && b[j] >= 48 && b[j] <= 57) j++;
        const s = decode(b.subarray(i, j), 'latin1');
        if (!/\d/.test(s)) { v.size = j; v.error = 'No digits here.'; throw Object.assign(new Stop(`${name}: no number at 0x${offset.toString(16).toUpperCase()}.`), { partial: v }); }
        v.value = Number(s); v.display = displayNum(v.value, f, t); v.size = j;
        cur.pos = offset + j;
      } else {
        const b = await reader.bytes(offset, 10);
        let r = 0n, shift = 0n, i = 0, byte = 0x80;
        while (i < b.length && (byte & 0x80)) { byte = b[i++]; r |= BigInt(byte & 0x7f) << shift; shift += 7n; }
        if (byte & 0x80) { v.error = 'The LEB128 number does not end.'; throw Object.assign(new Stop(v.error), { partial: v }); }
        if (ty === 'sleb128' && (byte & 0x40)) r -= 1n << shift;
        v.value = r >= -9007199254740991n && r <= 9007199254740991n ? Number(r) : r;
        v.display = displayNum(v.value, f, t); v.size = i;
        cur.pos = offset + i;
      }
      return v;
    }
    throw new Stop(`Unknown type "${ty}" for ${name}.`);
  }

  async function field(f, node, cur, depth) {
    if (f.if !== undefined && !(await ev(f.if, node, cur))) return;
    if ('seek' in f) { cur.pos = await evNum(f.seek, node, cur, 'seek'); return; }
    if ('skip' in f) { cur.pos += await evNum(f.skip, node, cur, 'skip'); return; }
    if ('align' in f) { const a = await evNum(f.align, node, cur, 'align'); if (a > 0) cur.pos = Math.ceil(cur.pos / a) * a; return; }
    if ('skipWhitespace' in f) {
      for (let n = 0; n < 4096; n++) { const b = await reader.bytes(cur.pos, 1); if (!b.length || ![9, 10, 12, 13, 32, 0].includes(b[0])) break; cur.pos++; }
      return;
    }
    const name = f.name;
    if ('value' in f) {
      await count();
      const v = mk('value', name, 'value', cur.pos, node);
      v.computed = true;
      v.value = await ev(f.value, node, cur);
      if (v.value && typeof v.value === 'object') v.value = v.value.__node ? (v.value.kind === 'value' ? v.value.value : v.value.name) : String(v.value);
      v.display = typeof v.value === 'number' || typeof v.value === 'bigint' ? displayNum(v.value, f, t) : typeof v.value === 'string' ? quote(v.value) : String(v.value);
      if (f.hidden) { node.vars.set(name, v); return; }
      addChild(node, v);
      return;
    }
    const saved = cur.pos;
    if (f.at !== undefined) {
      cur.pos = await locate(f.at, node, cur);
    }
    if (cur.pos < 0 || cur.pos > size) throw new Stop(`${name} would start at 0x${cur.pos.toString(16).toUpperCase()}, outside the file (${size.toLocaleString('en-US')} bytes).`);
    const isArray = f.count !== undefined || f.until !== undefined || f.while !== undefined;
    let made;
    try {
      if (!isArray) {
        const ty = await resolveType(f, node, cur);
        made = await one(f, ty, name, node, cur, depth);
      } else {
        made = mk('array', name, '', cur.pos, node);
        addChild(node, made);
        node.vars.set(name, made); // elements can read earlier elements: name[i - 1]
        const n = f.count !== undefined ? await evNum(f.count, node, cur, `The count of ${name}`) : null;
        if (n !== null && n < 0) throw new Stop(`${name} has a negative count (${n}).`);
        const cap = Math.min(n === null ? Infinity : n, limits.maxArray);
        const arrEnd = f.arraySize !== undefined ? cur.pos + await evNum(f.arraySize, node, cur, `The size of ${name}`) : null;
        let i = 0, tyName = '';
        const outerIndex = node.loopIndex;
        try {
        for (; i < cap; i++) {
          node.loopIndex = i;
          if (arrEnd !== null && cur.pos >= arrEnd) break;
          if (f.while !== undefined && !(await ev(f.while, node, cur, { _: made.children[made.children.length - 1], i }))) break;
          if (f.while === undefined && n === null && f.until === 'eof' && cur.pos >= Math.min(cur.end, size)) break;
          if (f.elementAt !== undefined) {
            const at = await ev(f.elementAt, node, cur, { _: made.children[made.children.length - 1], i });
            cur.pos = typeof at === 'bigint' ? Number(at) : Math.trunc(Number(at));
            if (!Number.isFinite(cur.pos)) throw new Stop(`The offset of ${name}[${i}] is not a number.`);
            if (cur.pos < 0 || cur.pos > size) throw new Stop(`${name}[${i}] would start at 0x${cur.pos.toString(16).toUpperCase()}, outside the file.`);
          }
          const before = cur.pos;
          const ty = await resolveType(f, node, cur);
          let el;
          try { el = await one(f, ty, `${name}[${i}]`, node, cur, depth); }
          catch (e) { if (e.partial) { e.partial.name = `${name}[${i}]`; addChild(made, e.partial); e.partial = made; } throw e; }
          el.index = i;
          addChild(made, el);
          tyName = tyName === '' ? el.type : tyName === el.type ? tyName : 'mixed';
          if (f.until !== undefined && f.until !== 'eof' && (await ev(f.until, node, cur, { _: el, i }))) { i++; break; }
          if (cur.pos === before && n === null) { made.error = `${name}[${i}] is empty (0 bytes), so the list stops here.`; i++; break; }
        }
        } finally { node.loopIndex = outerIndex; }
        if (n !== null && n > limits.maxArray && i >= limits.maxArray) made.error = `${n.toLocaleString('en-US')} items; the first ${limits.maxArray.toLocaleString('en-US')} are shown.`;
        else if (n === null && i >= limits.maxArray) made.error = `More than ${limits.maxArray.toLocaleString('en-US')} items; the list stops here.`;
        made.type = `${tyName && tyName !== 'mixed' ? tyName : 'item'}[${made.children.length}]`;
        made.size = f.elementAt !== undefined ? made.children.reduce((m, c) => Math.max(m, c.offset + c.size), made.offset) - made.offset : cur.pos - made.offset;
        if (f.elementAt !== undefined && made.children.length) made.offset = Math.min(...made.children.map(c => c.offset));
        if (arrEnd !== null) { made.size = arrEnd - made.offset; cur.pos = arrEnd; }
        node.vars.set(name, made);
        if (f.peek) cur.pos = saved;
        return;
      }
    } catch (e) {
      if (e.partial && e.partial !== node) {
        if (e.partial.kind !== 'array' || !node.children.includes(e.partial)) addChild(node, e.partial);
        node.vars.set(name, e.partial);
        e.partial = null;
      }
      throw e;
    }
    if (f.expect !== undefined && made.kind === 'value') {
      const exp = f.expect;
      const ok = typeof exp === 'number' ? Number(made.value) === exp : typeof exp === 'string' && /^\s*([0-9a-f]{2}\s*)+$/i.test(exp) && made.type.startsWith('bytes')
        ? (await reader.bytes(made.offset, made.size)).every((v, k) => v === parseHex(exp)[k])
        : String(made.value) === String(exp);
      if (!ok) made.error = `Expected ${typeof exp === 'number' ? exp + ' (' + hexNum(exp) + ')' : quote(String(exp))}.`;
    }
    if (f.comment) made.comment = String(f.comment).slice(0, 300);
    if (!f.hidden) addChild(node, made);
    node.vars.set(name, made);
    if (f.peek || (f.at !== undefined && f.restore)) cur.pos = saved;
  }

  async function locate(at, node, cur) {
    if (typeof at === 'number' || typeof at === 'string') return evNum(at, node, cur, 'at');
    if (at && typeof at === 'object' && (at.find || at.findText)) {
      const needle = at.find ? parseHex(at.find) : new TextEncoder().encode(at.findText);
      const within = Math.min(at.within !== undefined ? await evNum(at.within, node, cur, 'within') : size, limits.maxFind);
      const fromEnd = at.from === 'end';
      const lo = fromEnd ? Math.max(0, size - within) : cur.pos;
      const hi = fromEnd ? size : Math.min(size, cur.pos + within);
      const CH = 1 << 20;
      if (fromEnd) {
        for (let top = hi; top > lo; top -= CH) {
          const s = Math.max(lo, top - CH);
          const b = await reader.bytes(s, Math.min(hi, top + needle.length - 1) - s);
          const i = Buffer.from(b.buffer, b.byteOffset, b.length).lastIndexOf(Buffer.from(needle));
          if (i >= 0) return s + i;
        }
      } else {
        for (let s = lo; s < hi; s += CH) {
          const b = await reader.bytes(s, Math.min(hi, s + CH + needle.length - 1) - s);
          const i = Buffer.from(b.buffer, b.byteOffset, b.length).indexOf(Buffer.from(needle));
          if (i >= 0) return s + i;
        }
      }
      throw new Stop(`${at.find ? at.find : JSON.stringify(at.findText)} was not found ${fromEnd ? `in the last ${within.toLocaleString('en-US')} bytes` : 'after 0x' + cur.pos.toString(16).toUpperCase()}.`);
    }
    throw new Stop('"at" must be an offset or { "find": ... }.');
  }

  function addChild(parent, child) { if (!parent.children.includes(child)) parent.children.push(child); }

  const rootName = t.root || 'File';
  const rootNode = mk('struct', t.name || 'File', rootName, 0, null);
  const cur = { pos: 0, little: t.endian !== 'big', end: size };
  let error = null;
  try {
    const d = def(rootName);
    if (!d) throw new Stop(`The root struct "${rootName}" is missing.`);
    cur.little = await endianOf(d.endian, rootNode, cur, cur.little);
    for (const f of d.fields || []) await field(f, rootNode, cur, 1);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    error = e.message;
  }
  rootNode.size = Math.max(...[cur.pos, ...rootNode.children.map(c => c.offset + c.size)].filter(Number.isFinite), 0) - 0;
  rootNode.size = Math.min(rootNode.size, size);
  // A field or struct that claims bytes past the end of the file is cut at the end and marked.
  const stack = [rootNode];
  while (stack.length) {
    const n = stack.pop();
    if (n.offset + n.size > size) {
      n.size = Math.max(0, size - n.offset);
      if (!n.error) n.error = 'This runs past the end of the file.';
    }
    if (n.children) for (const c of n.children) stack.push(c);
  }
  return { root: rootNode, nodes, error, ms: Date.now() - t0 };
}

function decode(b, enc) {
  try {
    if (enc === 'latin1' || enc === 'ascii') { let s = ''; for (const x of b) s += String.fromCharCode(x); return s; }
    if (enc === 'utf16le' || enc === 'utf16be') return new TextDecoder(enc === 'utf16le' ? 'utf-16le' : 'utf-16be').decode(b);
    return new TextDecoder('utf-8').decode(b);
  } catch { return ''; }
}

// ---------- output for the webview and for export ----------

/** Plain tree for postMessage: { n, t, o, s, v, e, l, c, k, x }. */
function toWire(node, budget = { left: 50000 }) {
  if (budget.left-- <= 0) return null;
  const w = { n: node.name, t: node.type, o: node.offset, s: node.size, k: node.kind[0] };
  if (node.display !== undefined) w.v = node.display;
  if (node.error) w.e = node.error;
  if (node.label) w.l = node.label;
  if (node.comment) w.m = node.comment;
  if (node.computed) w.x = 1;
  if (node.children) { w.c = []; for (const c of node.children) { const cw = toWire(c, budget); if (!cw) break; w.c.push(cw); } }
  return w;
}

/** Number of fields below `node` (all levels), counted up to `cap`. */
function countNested(node, cap = 1e6) {
  let n = 0;
  const stack = [...(node.children || [])];
  while (stack.length && n < cap) { const c = stack.pop(); n++; if (c.children) for (const k of c.children) stack.push(k); }
  return n;
}

/**
 * The free Structure view (0.3.4): the root and its direct fields only. A field with fields of its own comes
 * without them and carries p = how many nested fields it holds (Zovo Pro shows them). Same wire shape as toWire.
 */
function toWireTop(root) {
  const w = toWire({ ...root, children: [] });
  w.c = [];
  for (const c of root.children || []) {
    const cw = toWire({ ...c, children: c.children ? [] : undefined });
    if (c.children) { delete cw.c; const n = countNested(c); if (n) cw.p = n; else cw.c = []; }
    w.c.push(cw);
  }
  return w;
}

/** Values as JSON: structs become objects, arrays lists, numbers numbers (u64 above 2^53 as text). */
function toJson(node, depth = 0) {
  if (depth > 200) return null;
  if (node.kind === 'value') {
    if (typeof node.value === 'bigint') return node.value.toString();
    if (node.value === undefined) return { offset: node.offset, size: node.size, bytes: node.display };
    return node.value;
  }
  if (node.kind === 'array') return node.children.map(c => toJson(c, depth + 1));
  const o = {};
  for (const c of node.children) {
    let key = c.name, k = 2;
    while (key in o) key = `${c.name}_${k++}`;
    o[key] = toJson(c, depth + 1);
  }
  return o;
}

/**
 * C declarations for the parsed layout of `node`: one packed struct per shape, arrays with the parsed count,
 * and an initializer with the parsed values. Shapes that differ per element become byte arrays.
 */
function toC(node, fileName) {
  const types = new Map(); // signature -> name
  const decls = [];
  const ident = s => { let x = String(s).replace(/\[\d+\]$/, '').replace(/[^A-Za-z0-9_]/g, '_'); if (/^\d/.test(x)) x = '_' + x; return x || 'field'; };
  const sig = n => n.kind === 'value' ? `${n.type}` : n.kind === 'array' ? `[${n.children.length}:${n.children.length ? sig(n.children[0]) : ''}]` : `{${n.children.filter(c => !c.computed).map(c => ident(c.name) + ':' + sig(c)).join(',')}}`;
  const sameShape = arr => arr.children.length && arr.children.every(c => sig(c) === sig(arr.children[0]));
  const cType = n => {
    if (n.kind === 'value') {
      if (C_TYPES[n.type]) return { t: C_TYPES[n.type], dim: n.type === 'u24' || n.type === 'i24' ? '[3]' : '' };
      return { t: /^char|^string/.test(n.type) ? 'char' : 'uint8_t', dim: `[${n.size}]` };
    }
    if (n.kind === 'array') {
      if (!sameShape(n)) return { t: 'uint8_t', dim: `[${n.size}]`, note: 'elements differ in layout' };
      const inner = cType(n.children[0]);
      return { t: inner.t, dim: `[${n.children.length}]${inner.dim}`, note: inner.note };
    }
    const s = sig(n);
    if (types.has(s)) return { t: types.get(s), dim: '' };
    let base = ident(n.type === 'struct' ? n.name : n.type), name = base, k = 2;
    while ([...types.values()].includes(name)) name = `${base}_${k++}`;
    types.set(s, name);
    const lines = n.children.filter(c => !c.computed).map(c => {
      const ct = cType(c);
      return `    ${ct.t} ${ident(c.name)}${ct.dim};${ct.note ? ' /* ' + ct.note + ' */' : ''} /* 0x${c.offset.toString(16).toUpperCase()} */`;
    });
    decls.push(`typedef struct ${name} {\n${lines.join('\n') || '    uint8_t _empty[1];'}\n} ${name};`);
    return { t: name, dim: '' };
  };
  const init = (n, ind) => {
    const pad = '    '.repeat(ind);
    if (n.kind === 'value') {
      if (typeof n.value === 'number') return Number.isInteger(n.value) ? (n.value < 0 ? String(n.value) : '0x' + n.value.toString(16).toUpperCase()) : String(n.value);
      if (typeof n.value === 'bigint') return (n.value < 0n ? n.value.toString() : '0x' + n.value.toString(16).toUpperCase()) + 'ULL';
      if (typeof n.value === 'string' && /^char|^string/.test(n.type)) return JSON.stringify(n.value.slice(0, n.size));
      return '{ 0 } /* ' + n.size + ' bytes at 0x' + n.offset.toString(16).toUpperCase() + ' */';
    }
    if (n.kind === 'array' && !sameShape(n)) return '{ 0 } /* ' + n.size + ' bytes */';
    const kids = n.children.filter(c => !c.computed);
    if (!kids.length) return '{ 0 }';
    return '{\n' + kids.map(c => pad + '    ' + init(c, ind + 1)).join(',\n') + '\n' + pad + '}';
  };
  const top = cType(node);
  const varName = ident(String(fileName || 'data').replace(/\.[^.]*$/, '')).toLowerCase() || 'data';
  return [
    `/* ${node.name} of ${fileName || 'the file'}, from Hex Viewer Pro. Offsets are from the start of the file. */`,
    '#include <stdint.h>',
    '',
    '#pragma pack(push, 1)',
    decls.join('\n\n'),
    '#pragma pack(pop)',
    '',
    `static const ${top.t} ${varName}${top.dim} = ${init(node, 0)};`,
    '',
  ].join('\n');
}

/** Lenient JSON for template files: // and /* *\/ comments and trailing commas are allowed. */
function parseJsonc(text) {
  let out = '', i = 0, inStr = false;
  while (i < text.length) {
    const c = text[i];
    if (inStr) { out += c; if (c === '\\') { out += text[i + 1] || ''; i += 2; continue; } if (c === '"') inStr = false; i++; continue; }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === ',') { let j = i + 1; while (j < text.length && /\s/.test(text[j])) j++; if (text[j] === '}' || text[j] === ']') { i++; continue; } }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const j = text.indexOf('*/', i + 2); i = j < 0 ? text.length : j + 2; continue; }
    out += c; i++;
  }
  return JSON.parse(out);
}

module.exports = { parse, detect, checkTemplate, toWire, toWireTop, countNested, toJson, toC, parseJsonc, parseHex, Reader, PRIM, DEFAULT_LIMITS };

};
M["./bytes"] = function (module, exports, require) {
'use strict';
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

};
var BUILTIN = [{"id":"png","name":"PNG image","extensions":["png","apng"],"match":[[{"offset":0,"hex":"89 50 4E 47 0D 0A 1A 0A"}]],"endian":"big","structs":{"File":[{"name":"signature","type":"bytes","length":8,"expect":"89 50 4E 47 0D 0A 1A 0A"},{"name":"chunks","type":"Chunk","until":"_.type == 'IEND' || pos() >= size()"}],"Chunk":{"label":"type","fields":[{"name":"length","type":"u32"},{"name":"type","type":"char","length":4},{"name":"data","type":{"switch":"type","cases":{"IHDR":"IHDR","pHYs":"PHYS","tEXt":"TEXT","tIME":"TIME","gAMA":"GAMA","acTL":"ACTL","fcTL":"FCTL"},"default":"Raw"},"size":"length"},{"name":"crc","type":"u32","format":"hex"}]},"Raw":[{"name":"bytes","type":"bytes","length":"end() - pos()"}],"IHDR":{"fields":[{"name":"width","type":"u32"},{"name":"height","type":"u32"},{"name":"bit_depth","type":"u8"},{"name":"color_type","type":"u8","enum":"ColorType"},{"name":"compression","type":"u8"},{"name":"filter","type":"u8"},{"name":"interlace","type":"u8","enum":{"0":"None","1":"Adam7"}}]},"PHYS":{"fields":[{"name":"pixels_per_unit_x","type":"u32"},{"name":"pixels_per_unit_y","type":"u32"},{"name":"unit","type":"u8","enum":{"0":"Unknown","1":"Metre"}}]},"TEXT":{"fields":[{"name":"keyword","type":"zstring","length":80,"encoding":"latin1"},{"name":"text","type":"string","length":"end() - pos()","encoding":"latin1"}]},"TIME":{"fields":[{"name":"year","type":"u16"},{"name":"month","type":"u8"},{"name":"day","type":"u8"},{"name":"hour","type":"u8"},{"name":"minute","type":"u8"},{"name":"second","type":"u8"}]},"GAMA":{"fields":[{"name":"gamma_x100000","type":"u32"}]},"ACTL":{"fields":[{"name":"num_frames","type":"u32"},{"name":"num_plays","type":"u32"}]},"FCTL":{"fields":[{"name":"sequence","type":"u32"},{"name":"width","type":"u32"},{"name":"height","type":"u32"},{"name":"x_offset","type":"u32"},{"name":"y_offset","type":"u32"},{"name":"delay_num","type":"u16"},{"name":"delay_den","type":"u16"},{"name":"dispose_op","type":"u8"},{"name":"blend_op","type":"u8"}]}},"enums":{"ColorType":{"0":"Grayscale","2":"RGB","3":"Palette","4":"Grayscale + alpha","6":"RGBA"}}},{"id":"jpeg","name":"JPEG image","extensions":["jpg","jpeg","jfif","jpe"],"match":[[{"offset":0,"hex":"FF D8 FF"}]],"endian":"big","structs":{"File":[{"name":"soi","type":"u16","format":"hex","expect":65496,"comment":"Start of image (FF D8)"},{"name":"segments","type":"Segment","until":"_.type == 0xDA || _.type == 0xD9 || pos() >= size()"},{"name":"eoi","type":"u16","format":"hex","at":{"find":"FF D9","from":"end","within":"size()"},"peek":true,"if":"segments[-1].type == 0xDA","comment":"End of image (FF D9)"},{"name":"scan_data","type":"bytes","length":"eoi.offset - pos()","if":"segments[-1].type == 0xDA","comment":"Entropy-coded image data after the start of scan"}],"Segment":{"label":"name","fields":[{"name":"marker","type":"u8","format":"hex","expect":255},{"name":"type","type":"u8","enum":"Marker"},{"name":"name","value":"type == 0xC0 ? 'SOF0' : type == 0xC2 ? 'SOF2' : type == 0xC4 ? 'DHT' : type == 0xDB ? 'DQT' : type == 0xDA ? 'SOS' : type == 0xDD ? 'DRI' : type == 0xFE ? 'COM' : type >= 0xE0 && type <= 0xEF ? 'APP' + (type - 0xE0) : type >= 0xC0 && type <= 0xCF ? 'SOF' + (type - 0xC0) : hex(type)","hidden":true},{"name":"length","type":"u16","if":"!(type == 0x01 || (type >= 0xD0 && type <= 0xD9))","comment":"Includes these 2 bytes"},{"name":"body","if":"defined(length)","size":"length - 2","type":{"switch":"type","cases":{"0xE0":"APP0","0xC0":"SOF","0xC1":"SOF","0xC2":"SOF","0xDA":"SOS","0xFE":"COM","0xDD":"DRI","0xE1":"APP1"},"default":"Raw"}}]},"Raw":[{"name":"data","type":"bytes","length":"end() - pos()"}],"APP0":[{"name":"identifier","type":"zstring","length":5,"encoding":"latin1"},{"name":"version_major","type":"u8","if":"identifier == 'JFIF'"},{"name":"version_minor","type":"u8","if":"identifier == 'JFIF'"},{"name":"units","type":"u8","if":"identifier == 'JFIF'","enum":{"0":"No units (aspect ratio)","1":"Dots per inch","2":"Dots per cm"}},{"name":"x_density","type":"u16","if":"identifier == 'JFIF'"},{"name":"y_density","type":"u16","if":"identifier == 'JFIF'"},{"name":"thumbnail_width","type":"u8","if":"identifier == 'JFIF'"},{"name":"thumbnail_height","type":"u8","if":"identifier == 'JFIF'"},{"name":"rest","type":"bytes","length":"end() - pos()"}],"APP1":[{"name":"identifier","type":"zstring","length":30,"encoding":"latin1"},{"name":"data","type":"bytes","length":"end() - pos()","comment":"Exif (a TIFF structure) or XMP"}],"SOF":[{"name":"precision","type":"u8"},{"name":"height","type":"u16"},{"name":"width","type":"u16"},{"name":"component_count","type":"u8"},{"name":"components","type":"Component","count":"component_count"}],"Component":{"label":"'id ' + id","fields":[{"name":"id","type":"u8"},{"name":"sampling","type":"u8","format":"hex","comment":"High 4 bits horizontal, low 4 bits vertical"},{"name":"quant_table","type":"u8"}]},"SOS":[{"name":"component_count","type":"u8"},{"name":"components","type":[{"name":"id","type":"u8"},{"name":"tables","type":"u8","format":"hex"}],"count":"component_count"},{"name":"spectral_start","type":"u8"},{"name":"spectral_end","type":"u8"},{"name":"approx","type":"u8","format":"hex"}],"COM":[{"name":"text","type":"string","length":"end() - pos()","encoding":"latin1"}],"DRI":[{"name":"restart_interval","type":"u16"}]},"enums":{"Marker":{"0xC0":"SOF0 baseline","0xC1":"SOF1 extended","0xC2":"SOF2 progressive","0xC4":"DHT Huffman table","0xD8":"SOI","0xD9":"EOI","0xDA":"SOS start of scan","0xDB":"DQT quantization table","0xDD":"DRI restart interval","0xE0":"APP0 (JFIF)","0xE1":"APP1 (Exif / XMP)","0xE2":"APP2 (ICC profile)","0xED":"APP13 (Photoshop)","0xEE":"APP14 (Adobe)","0xFE":"COM comment"}}},{"id":"gif","name":"GIF image","extensions":["gif"],"match":[[{"offset":0,"text":"GIF87a"}],[{"offset":0,"text":"GIF89a"}]],"endian":"little","structs":{"File":[{"name":"signature","type":"char","length":6},{"name":"width","type":"u16"},{"name":"height","type":"u16"},{"name":"packed","type":"u8","format":"hex","comment":"Bit 7: global color table, bits 0-2: its size"},{"name":"background_color","type":"u8"},{"name":"aspect_ratio","type":"u8"},{"name":"global_color_table","type":"bytes","length":"3 * (1 << ((packed & 7) + 1))","if":"packed & 0x80"},{"name":"blocks","type":"Block","until":"_.introducer == 0x3B || pos() >= size()"}],"Block":{"label":"introducer == 0x2C ? 'Image' : introducer == 0x3B ? 'Trailer' : 'Extension ' + hex(label_)","fields":[{"name":"introducer","type":"u8","enum":{"0x21":"Extension","0x2C":"Image descriptor","0x3B":"Trailer"}},{"name":"label_","type":"u8","if":"introducer == 0x21","enum":{"0xF9":"Graphic control","0xFE":"Comment","0xFF":"Application","0x01":"Plain text"}},{"name":"image","type":"Image","if":"introducer == 0x2C"},{"name":"sub_blocks","type":"SubBlock","until":"_.size_ == 0","if":"introducer == 0x21"}]},"Image":[{"name":"left","type":"u16"},{"name":"top","type":"u16"},{"name":"width","type":"u16"},{"name":"height","type":"u16"},{"name":"packed","type":"u8","format":"hex","comment":"Bit 7: local color table, bit 6: interlaced, bits 0-2: table size"},{"name":"local_color_table","type":"bytes","length":"3 * (1 << ((packed & 7) + 1))","if":"packed & 0x80"},{"name":"lzw_min_code_size","type":"u8"},{"name":"data","type":"SubBlock","until":"_.size_ == 0"}],"SubBlock":[{"name":"size_","type":"u8"},{"name":"data","type":"bytes","length":"size_","if":"size_ > 0"}]}},{"id":"bmp","name":"BMP image","extensions":["bmp","dib"],"match":[[{"offset":0,"text":"BM"},{"offset":14,"type":"u32","min":12,"max":124}]],"endian":"little","structs":{"File":[{"name":"file_header","type":[{"name":"signature","type":"char","length":2,"expect":"BM"},{"name":"file_size","type":"u32"},{"name":"reserved","type":"u32"},{"name":"pixel_offset","type":"u32","format":"hex"}]},{"name":"dib_header","type":"Dib"},{"name":"color_table","type":"Rgbq","count":"dib_header.colors_used ? dib_header.colors_used : (1 << dib_header.bits_per_pixel)","if":"defined(dib_header.bits_per_pixel) && dib_header.bits_per_pixel <= 8"},{"name":"pixels","type":"bytes","at":"file_header.pixel_offset","length":"size() - file_header.pixel_offset"}],"Dib":[{"name":"header_size","type":"u32","enum":{"12":"BITMAPCOREHEADER","40":"BITMAPINFOHEADER","52":"BITMAPV2INFOHEADER","56":"BITMAPV3INFOHEADER","108":"BITMAPV4HEADER","124":"BITMAPV5HEADER"}},{"name":"width","type":"i16","if":"header_size == 12"},{"name":"height","type":"i16","if":"header_size == 12"},{"name":"width","type":"i32","if":"header_size > 12"},{"name":"height","type":"i32","if":"header_size > 12","comment":"Negative: rows run top to bottom"},{"name":"planes","type":"u16"},{"name":"bits_per_pixel","type":"u16"},{"name":"compression","type":"u32","if":"header_size > 12","enum":{"0":"BI_RGB","1":"BI_RLE8","2":"BI_RLE4","3":"BI_BITFIELDS","4":"BI_JPEG","5":"BI_PNG","6":"BI_ALPHABITFIELDS"}},{"name":"image_size","type":"u32","if":"header_size > 12"},{"name":"x_pixels_per_metre","type":"i32","if":"header_size > 12"},{"name":"y_pixels_per_metre","type":"i32","if":"header_size > 12"},{"name":"colors_used","type":"u32","if":"header_size > 12"},{"name":"colors_important","type":"u32","if":"header_size > 12"},{"name":"colors_used","value":"0","hidden":true,"if":"header_size == 12"},{"name":"masks","type":"u32","format":"hex","count":"header_size >= 56 ? 4 : header_size >= 52 ? 3 : 0","if":"header_size > 40"},{"name":"rest","type":"bytes","length":"header_size - (pos() - start())","if":"header_size > 56"}],"Rgbq":{"label":"'#' + hex(red * 65536 + green * 256 + blue)","fields":[{"name":"blue","type":"u8"},{"name":"green","type":"u8"},{"name":"red","type":"u8"},{"name":"reserved","type":"u8"}]}}},{"id":"ico","name":"ICO / CUR icon","extensions":["ico","cur"],"match":[[{"offset":0,"hex":"00 00 01 00"},{"offset":4,"type":"u16","min":1,"max":512}],[{"offset":0,"hex":"00 00 02 00"},{"offset":4,"type":"u16","min":1,"max":512}]],"endian":"little","structs":{"File":[{"name":"reserved","type":"u16","expect":0},{"name":"type","type":"u16","enum":{"1":"Icon","2":"Cursor"}},{"name":"count","type":"u16"},{"name":"entries","type":"Entry","count":"count"},{"name":"images","type":"Image","count":"count","elementAt":"entries[i].offset"}],"Entry":{"label":"(width ? width : 256) + 'x' + (height ? height : 256)","fields":[{"name":"width","type":"u8","comment":"0 means 256"},{"name":"height","type":"u8","comment":"0 means 256"},{"name":"palette_colors","type":"u8"},{"name":"reserved","type":"u8"},{"name":"planes_or_hotspot_x","type":"u16"},{"name":"bpp_or_hotspot_y","type":"u16"},{"name":"bytes","type":"u32"},{"name":"offset","type":"u32","format":"hex"}]},"Image":{"label":"u32be(start()) == 0x89504E47 ? 'PNG' : 'BMP'","fields":[{"name":"png_signature","type":"bytes","length":8,"if":"u32be(pos()) == 0x89504E47"},{"name":"bmp_header_size","type":"u32","if":"u32be(pos()) != 0x89504E47"},{"name":"width","type":"i32","if":"u32be(start()) != 0x89504E47"},{"name":"height","type":"i32","if":"u32be(start()) != 0x89504E47","comment":"Twice the icon height: the XOR image plus the AND mask"},{"name":"planes","type":"u16","if":"u32be(start()) != 0x89504E47"},{"name":"bits_per_pixel","type":"u16","if":"u32be(start()) != 0x89504E47"},{"name":"data","type":"bytes","length":"entries[i].bytes - (pos() - start())"}]}}},{"id":"tiff","name":"TIFF image (also DNG and many camera raw files)","extensions":["tif","tiff","dng","nef","cr2","arw"],"match":[[{"offset":0,"hex":"49 49 2A 00"}],[{"offset":0,"hex":"4D 4D 00 2A"}]],"structs":{"File":[{"name":"byte_order","type":"char","length":2,"comment":"II: little-endian (Intel), MM: big-endian (Motorola)"},{"name":"body","type":"Body"}],"Body":{"endian":"byte_order == 'II' ? 'little' : 'big'","fields":[{"name":"magic","type":"u16","expect":42},{"name":"first_ifd","type":"u32","format":"hex"},{"name":"ifds","type":"Ifd","count":64,"while":"!defined(_) || (_.next_ifd != 0 && _.next_ifd < size())","elementAt":"defined(_) ? _.next_ifd : first_ifd"}]},"Ifd":{"label":"entry_count + ' entries'","fields":[{"name":"entry_count","type":"u16"},{"name":"entries","type":"Entry","count":"entry_count"},{"name":"next_ifd","type":"u32","format":"hex"}]},"Entry":{"label":"tag","fields":[{"name":"tag","type":"u16","enum":"Tag"},{"name":"type","type":"u16","enum":{"1":"BYTE","2":"ASCII","3":"SHORT","4":"LONG","5":"RATIONAL","6":"SBYTE","7":"UNDEFINED","8":"SSHORT","9":"SLONG","10":"SRATIONAL","11":"FLOAT","12":"DOUBLE","13":"IFD"}},{"name":"count","type":"u32"},{"name":"value_short","type":"u16","if":"type == 3 && count == 1"},{"name":"pad","type":"u16","if":"type == 3 && count == 1"},{"name":"value_or_offset","type":"u32","if":"!(type == 3 && count == 1)","comment":"The value when it fits in 4 bytes, else the offset of the values"},{"name":"text","type":"zstring","length":"count","encoding":"latin1","if":"type == 2 && count > 4 && value_or_offset < size()","at":"value_or_offset","peek":true}]}},"enums":{"Tag":{"254":"NewSubfileType","256":"ImageWidth","257":"ImageLength","258":"BitsPerSample","259":"Compression","262":"PhotometricInterpretation","270":"ImageDescription","271":"Make","272":"Model","273":"StripOffsets","274":"Orientation","277":"SamplesPerPixel","278":"RowsPerStrip","279":"StripByteCounts","282":"XResolution","283":"YResolution","284":"PlanarConfiguration","296":"ResolutionUnit","305":"Software","306":"DateTime","315":"Artist","317":"Predictor","320":"ColorMap","322":"TileWidth","323":"TileLength","324":"TileOffsets","325":"TileByteCounts","330":"SubIFDs","338":"ExtraSamples","339":"SampleFormat","513":"JPEGInterchangeFormat","514":"JPEGInterchangeFormatLength","530":"YCbCrSubSampling","531":"YCbCrPositioning","33432":"Copyright","34665":"ExifIFD","34853":"GPSInfo","50706":"DNGVersion"}}},{"id":"webp","name":"WebP image","extensions":["webp"],"match":[[{"offset":0,"text":"RIFF"},{"offset":8,"text":"WEBP"}]],"endian":"little","structs":{"File":[{"name":"riff","type":"char","length":4},{"name":"riff_size","type":"u32","comment":"File size minus 8"},{"name":"form","type":"char","length":4},{"name":"chunks","type":"Chunk","until":"eof"}],"Chunk":{"label":"fourcc","fields":[{"name":"fourcc","type":"char","length":4},{"name":"size_","type":"u32"},{"name":"data","size":"size_","type":{"switch":"fourcc","cases":{"VP8X":"VP8X","VP8 ":"VP8","ANIM":"ANIM"},"default":"Raw"}},{"align":2}]},"Raw":[{"name":"bytes","type":"bytes","length":"end() - pos()"}],"VP8X":[{"name":"flags","type":"u8","flags":{"0x2":"Animation","0x4":"XMP","0x8":"Exif","0x10":"Alpha","0x20":"ICC profile"}},{"name":"reserved","type":"u24"},{"name":"canvas_width_minus_1","type":"u24"},{"name":"canvas_height_minus_1","type":"u24"}],"VP8":[{"name":"frame_tag","type":"u24","format":"hex"},{"name":"start_code","type":"bytes","length":3,"expect":"9D 01 2A"},{"name":"width","type":"u16","comment":"Low 14 bits: width, high 2 bits: scale"},{"name":"height","type":"u16"},{"name":"bitstream","type":"bytes","length":"end() - pos()"}],"ANIM":[{"name":"background_bgra","type":"u32","format":"hex"},{"name":"loop_count","type":"u16"}]}},{"id":"wav","name":"WAV audio (RIFF WAVE)","extensions":["wav","wave"],"match":[[{"offset":0,"text":"RIFF"},{"offset":8,"text":"WAVE"}],[{"offset":0,"text":"RF64"},{"offset":8,"text":"WAVE"}]],"endian":"little","structs":{"File":[{"name":"riff","type":"char","length":4},{"name":"riff_size","type":"u32","comment":"File size minus 8"},{"name":"form","type":"char","length":4},{"name":"chunks","type":"Chunk","until":"eof"}],"Chunk":{"label":"id","fields":[{"name":"id","type":"char","length":4},{"name":"size_","type":"u32"},{"name":"data","size":"min(size_, size() - pos())","type":{"switch":"id","cases":{"fmt ":"Fmt","LIST":"List","fact":"Fact"},"default":"Raw"}},{"align":2}]},"Raw":[{"name":"bytes","type":"bytes","length":"end() - pos()"}],"Fmt":[{"name":"audio_format","type":"u16","enum":{"1":"PCM","3":"IEEE float","6":"A-law","7":"mu-law","0x11":"IMA ADPCM","0x55":"MP3","0xFFFE":"Extensible"}},{"name":"channels","type":"u16"},{"name":"sample_rate","type":"u32"},{"name":"byte_rate","type":"u32"},{"name":"block_align","type":"u16"},{"name":"bits_per_sample","type":"u16"},{"name":"extra_size","type":"u16","if":"end() - pos() >= 2"},{"name":"valid_bits","type":"u16","if":"audio_format == 0xFFFE && end() - pos() >= 2"},{"name":"channel_mask","type":"u32","format":"hex","if":"audio_format == 0xFFFE && end() - pos() >= 4"},{"name":"sub_format","type":"bytes","length":16,"if":"audio_format == 0xFFFE && end() - pos() >= 16"},{"name":"rest","type":"bytes","length":"end() - pos()","if":"end() > pos()"}],"Fact":[{"name":"sample_count","type":"u32"}],"List":[{"name":"list_type","type":"char","length":4},{"name":"items","type":"Info","until":"eof"}],"Info":{"label":"id","fields":[{"name":"id","type":"char","length":4},{"name":"size_","type":"u32"},{"name":"text","type":"char","length":"min(size_, end() - pos())"},{"align":2}]}}},{"id":"flac","name":"FLAC audio","extensions":["flac"],"match":[[{"offset":0,"text":"fLaC"}]],"endian":"big","structs":{"File":[{"name":"marker","type":"char","length":4},{"name":"metadata","type":"Block","until":"_.header & 0x80"},{"name":"audio_frames","type":"bytes","length":"size() - pos()"}],"Block":{"label":"kind","fields":[{"name":"header","type":"u8","format":"hex","comment":"Bit 7: last block, bits 0-6: block type"},{"name":"kind","value":"(header & 0x7F) == 0 ? 'STREAMINFO' : (header & 0x7F) == 1 ? 'PADDING' : (header & 0x7F) == 2 ? 'APPLICATION' : (header & 0x7F) == 3 ? 'SEEKTABLE' : (header & 0x7F) == 4 ? 'VORBIS_COMMENT' : (header & 0x7F) == 5 ? 'CUESHEET' : (header & 0x7F) == 6 ? 'PICTURE' : 'type ' + (header & 0x7F)"},{"name":"length","type":"u24"},{"name":"data","size":"length","type":{"switch":"header & 0x7F","cases":{"0":"StreamInfo","4":"VorbisComment","6":"Picture","3":"SeekTable"},"default":"Raw"}}]},"Raw":[{"name":"bytes","type":"bytes","length":"end() - pos()"}],"StreamInfo":[{"name":"min_block_size","type":"u16"},{"name":"max_block_size","type":"u16"},{"name":"min_frame_size","type":"u24"},{"name":"max_frame_size","type":"u24"},{"name":"packed","type":"u64","format":"hex","comment":"20 bits sample rate, 3 bits channels - 1, 5 bits bits per sample - 1, 36 bits total samples"},{"name":"sample_rate","value":"packed >> 44"},{"name":"channels","value":"((packed >> 41) & 7) + 1"},{"name":"bits_per_sample","value":"((packed >> 36) & 31) + 1"},{"name":"total_samples","value":"packed & 0xFFFFFFFFF"},{"name":"md5","type":"bytes","length":16}],"SeekTable":[{"name":"points","type":[{"name":"sample","type":"u64"},{"name":"offset","type":"u64","format":"hex"},{"name":"samples","type":"u16"}],"count":"(end() - pos()) // 18"}],"VorbisComment":{"endian":"little","fields":[{"name":"vendor_length","type":"u32"},{"name":"vendor","type":"string","length":"vendor_length"},{"name":"count","type":"u32"},{"name":"comments","type":"Comment","count":"count"}]},"Comment":{"label":"text","fields":[{"name":"length","type":"u32"},{"name":"text","type":"string","length":"length"}]},"Picture":[{"name":"picture_type","type":"u32","enum":{"0":"Other","3":"Front cover","4":"Back cover","6":"Media","8":"Artist"}},{"name":"mime_length","type":"u32"},{"name":"mime","type":"string","length":"mime_length","encoding":"latin1"},{"name":"description_length","type":"u32"},{"name":"description","type":"string","length":"description_length"},{"name":"width","type":"u32"},{"name":"height","type":"u32"},{"name":"depth","type":"u32"},{"name":"colors","type":"u32"},{"name":"data_length","type":"u32"},{"name":"data","type":"bytes","length":"data_length"}]}},{"id":"mp4","name":"MP4 / MOV / M4A / HEIC (ISO base media boxes)","extensions":["mp4","m4a","m4v","mov","3gp","heic","heif","avif","m4b"],"match":[[{"offset":4,"text":"ftyp"}],[{"offset":4,"text":"moov"}],[{"offset":4,"text":"wide"}],[{"offset":4,"text":"mdat"}]],"endian":"big","structs":{"File":[{"name":"boxes","type":"Box","until":"eof"}],"Box":{"label":"type","fields":[{"name":"size_","type":"u32","comment":"1: a 64-bit size follows. 0: the box runs to the end of the file"},{"name":"type","type":"char","length":4},{"name":"large_size","type":"u64","if":"size_ == 1"},{"name":"box_size","value":"size_ == 1 ? large_size : size_ == 0 ? end() - start() : size_","hidden":true},{"name":"payload","size":"max(0, min(box_size - (pos() - parent.offset), end() - pos()))","type":{"switch":"type","cases":{"moov":"Container","trak":"Container","mdia":"Container","minf":"Container","stbl":"Container","edts":"Container","udta":"Container","dinf":"Container","mvex":"Container","moof":"Container","traf":"Container","mfra":"Container","ilst":"Container","meta":"Meta","ftyp":"Ftyp","styp":"Ftyp","mvhd":"Mvhd","tkhd":"Tkhd","mdhd":"Mdhd","hdlr":"Hdlr","stsd":"Stsd","stco":"Stco","co64":"Co64","stsz":"Stsz","stts":"Stts"},"default":"Raw"}}]},"Raw":[{"name":"bytes","type":"bytes","length":"end() - pos()"}],"Container":[{"name":"boxes","type":"Box","until":"eof"}],"Meta":[{"name":"version_flags","type":"u32","format":"hex","if":"u32be(pos() + 4) != 0x68646C72"},{"name":"boxes","type":"Box","until":"eof"}],"Ftyp":[{"name":"major_brand","type":"char","length":4},{"name":"minor_version","type":"u32"},{"name":"compatible_brands","type":"char","length":4,"count":"(end() - pos()) // 4"}],"Mvhd":[{"name":"version","type":"u8"},{"name":"flags","type":"u24","format":"hex"},{"name":"creation_time","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"},"comment":"Seconds since 1904-01-01"},{"name":"modification_time","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"}},{"name":"timescale","type":"u32"},{"name":"duration","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"}},{"name":"duration_seconds","value":"timescale ? duration / timescale : 0"},{"name":"rate","type":"u32","format":"hex","comment":"16.16 fixed point; 0x00010000 is 1.0"},{"name":"volume","type":"u16","format":"hex"},{"name":"rest","type":"bytes","length":"end() - pos()"}],"Tkhd":[{"name":"version","type":"u8"},{"name":"flags","type":"u24","flags":{"0x1":"Enabled","0x2":"In movie","0x4":"In preview"}},{"name":"creation_time","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"}},{"name":"modification_time","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"}},{"name":"track_id","type":"u32"},{"name":"reserved","type":"u32"},{"name":"duration","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"}},{"name":"reserved2","type":"bytes","length":8},{"name":"layer","type":"i16"},{"name":"alternate_group","type":"i16"},{"name":"volume","type":"u16","format":"hex"},{"name":"reserved3","type":"u16"},{"name":"matrix","type":"bytes","length":36},{"name":"width_16_16","type":"u32"},{"name":"height_16_16","type":"u32"},{"name":"width","value":"width_16_16 >> 16"},{"name":"height","value":"height_16_16 >> 16"}],"Mdhd":[{"name":"version","type":"u8"},{"name":"flags","type":"u24","format":"hex"},{"name":"creation_time","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"}},{"name":"modification_time","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"}},{"name":"timescale","type":"u32"},{"name":"duration","type":{"switch":"version","cases":{"1":"u64"},"default":"u32"}},{"name":"language","type":"u16","format":"hex","comment":"Packed ISO-639-2 code"},{"name":"pre_defined","type":"u16"}],"Hdlr":[{"name":"version_flags","type":"u32","format":"hex"},{"name":"pre_defined","type":"u32"},{"name":"handler_type","type":"char","length":4},{"name":"reserved","type":"bytes","length":12},{"name":"name","type":"zstring","length":"end() - pos()"}],"Stsd":[{"name":"version_flags","type":"u32","format":"hex"},{"name":"entry_count","type":"u32"},{"name":"entries","type":"Box","count":"entry_count","while":"pos() + 8 <= end()"}],"Stco":[{"name":"version_flags","type":"u32","format":"hex"},{"name":"entry_count","type":"u32"},{"name":"chunk_offsets","type":"u32","format":"hex","count":"min(entry_count, (end() - pos()) // 4)"}],"Co64":[{"name":"version_flags","type":"u32","format":"hex"},{"name":"entry_count","type":"u32"},{"name":"chunk_offsets","type":"u64","format":"hex","count":"min(entry_count, (end() - pos()) // 8)"}],"Stsz":[{"name":"version_flags","type":"u32","format":"hex"},{"name":"sample_size","type":"u32"},{"name":"sample_count","type":"u32"},{"name":"sizes","type":"u32","count":"min(sample_count, (end() - pos()) // 4)","if":"sample_size == 0"}],"Stts":[{"name":"version_flags","type":"u32","format":"hex"},{"name":"entry_count","type":"u32"},{"name":"entries","type":[{"name":"sample_count","type":"u32"},{"name":"sample_delta","type":"u32"}],"count":"min(entry_count, (end() - pos()) // 8)"}]}},{"id":"zip","name":"ZIP archive (also JAR, APK, DOCX, XLSX, PPTX, EPUB)","extensions":["zip","jar","apk","docx","xlsx","pptx","epub","odt","ods","whl","nupkg","vsix","aar","ipa"],"match":[[{"offset":0,"hex":"50 4B 03 04"}],[{"offset":0,"hex":"50 4B 05 06"}]],"endian":"little","structs":{"File":[{"name":"end_of_central_directory","type":"Eocd","at":{"find":"50 4B 05 06","from":"end","within":65557},"peek":true},{"name":"zip64_note","value":"'ZIP64: the real offsets are in the ZIP64 end record before this one'","if":"end_of_central_directory.cd_offset == 0xFFFFFFFF || end_of_central_directory.total_entries == 0xFFFF"},{"name":"central_directory","type":"CentralEntry","count":"end_of_central_directory.total_entries","at":"end_of_central_directory.cd_offset","peek":true,"if":"end_of_central_directory.cd_offset < size()"},{"name":"local_files","type":"LocalFile","count":"len(central_directory)","elementAt":"central_directory[i].local_offset","if":"defined(central_directory)"}],"Eocd":[{"name":"signature","type":"u32","format":"hex","expect":101010256},{"name":"disk","type":"u16"},{"name":"cd_disk","type":"u16"},{"name":"entries_on_disk","type":"u16"},{"name":"total_entries","type":"u16"},{"name":"cd_size","type":"u32"},{"name":"cd_offset","type":"u32","format":"hex"},{"name":"comment_length","type":"u16"},{"name":"comment","type":"string","length":"comment_length"}],"CentralEntry":{"label":"name","fields":[{"name":"signature","type":"u32","format":"hex","expect":33639248},{"name":"version_made_by","type":"u16"},{"name":"version_needed","type":"u16"},{"name":"flags","type":"u16","flags":"GpFlags"},{"name":"method","type":"u16","enum":"Method"},{"name":"mod_time","type":"u16","format":"dostime"},{"name":"mod_date","type":"u16","format":"dosdate"},{"name":"crc32","type":"u32","format":"hex"},{"name":"compressed_size","type":"u32"},{"name":"uncompressed_size","type":"u32"},{"name":"name_length","type":"u16"},{"name":"extra_length","type":"u16"},{"name":"comment_length","type":"u16"},{"name":"disk_start","type":"u16"},{"name":"internal_attributes","type":"u16","format":"hex"},{"name":"external_attributes","type":"u32","format":"hex"},{"name":"local_offset","type":"u32","format":"hex"},{"name":"name","type":"string","length":"name_length"},{"name":"extra","type":"bytes","length":"extra_length"},{"name":"comment","type":"string","length":"comment_length"}]},"LocalFile":{"label":"name","fields":[{"name":"signature","type":"u32","format":"hex","expect":67324752},{"name":"version_needed","type":"u16"},{"name":"flags","type":"u16","flags":"GpFlags"},{"name":"method","type":"u16","enum":"Method"},{"name":"mod_time","type":"u16","format":"dostime"},{"name":"mod_date","type":"u16","format":"dosdate"},{"name":"crc32","type":"u32","format":"hex"},{"name":"compressed_size","type":"u32"},{"name":"uncompressed_size","type":"u32"},{"name":"name_length","type":"u16"},{"name":"extra_length","type":"u16"},{"name":"name","type":"string","length":"name_length"},{"name":"extra","type":"bytes","length":"extra_length"},{"name":"data","type":"bytes","length":"compressed_size == 0xFFFFFFFF || (flags & 8 && compressed_size == 0) ? central_directory[i].compressed_size : compressed_size","comment":"Compressed file data"}]}},"enums":{"Method":{"0":"Stored","8":"Deflate","9":"Deflate64","12":"BZIP2","14":"LZMA","93":"Zstandard","95":"XZ","99":"AES encrypted"}},"flags":{"GpFlags":{"0x1":"Encrypted","0x8":"Data descriptor","0x800":"UTF-8 names"}}},{"id":"gzip","name":"GZIP compressed file","extensions":["gz","tgz","gzip"],"match":[[{"offset":0,"hex":"1F 8B"}]],"endian":"little","structs":{"File":[{"name":"magic","type":"bytes","length":2,"expect":"1F 8B"},{"name":"method","type":"u8","enum":{"8":"Deflate"}},{"name":"flags","type":"u8","flags":{"0x1":"FTEXT","0x2":"FHCRC","0x4":"FEXTRA","0x8":"FNAME","0x10":"FCOMMENT"}},{"name":"mtime","type":"u32","format":"unix"},{"name":"extra_flags","type":"u8","enum":{"0":"Default","2":"Best compression","4":"Fastest"}},{"name":"os","type":"u8","enum":{"0":"FAT","3":"Unix","7":"Macintosh","10":"NTFS","11":"Windows","255":"Unknown"}},{"name":"extra_length","type":"u16","if":"flags & 4"},{"name":"extra","type":"bytes","length":"extra_length","if":"flags & 4"},{"name":"file_name","type":"zstring","encoding":"latin1","if":"flags & 8"},{"name":"comment","type":"zstring","encoding":"latin1","if":"flags & 16"},{"name":"header_crc16","type":"u16","format":"hex","if":"flags & 2"},{"name":"deflate_data","type":"bytes","length":"size() - pos() - 8"},{"name":"crc32","type":"u32","format":"hex"},{"name":"uncompressed_size_mod_2_32","type":"u32"}]}},{"id":"tar","name":"TAR archive (ustar)","extensions":["tar"],"match":[[{"offset":257,"text":"ustar"}]],"endian":"little","structs":{"File":[{"name":"entries","type":"Entry","while":"pos() + 512 <= size() && u8(pos()) != 0","count":1000000}],"Entry":{"label":"header.name","fields":[{"name":"header","type":"Header","size":512},{"name":"data","type":"bytes","length":"min(oct(header.size_), size() - pos())"},{"align":512}]},"Header":[{"name":"name","type":"char","length":100},{"name":"mode","type":"char","length":8},{"name":"uid","type":"char","length":8},{"name":"gid","type":"char","length":8},{"name":"size_","type":"char","length":12,"comment":"Octal"},{"name":"size_bytes","value":"oct(size_)"},{"name":"mtime","type":"char","length":12,"comment":"Octal seconds since 1970"},{"name":"checksum","type":"char","length":8},{"name":"typeflag","type":"u8","format":"char","enum":{"0x30":"Regular file","0x00":"Regular file (old)","0x31":"Hard link","0x32":"Symbolic link","0x35":"Directory","0x78":"PAX header","0x67":"PAX global header","0x4C":"GNU long name"}},{"name":"linkname","type":"char","length":100},{"name":"magic","type":"char","length":6},{"name":"version","type":"char","length":2},{"name":"uname","type":"char","length":32},{"name":"gname","type":"char","length":32},{"name":"devmajor","type":"char","length":8},{"name":"devminor","type":"char","length":8},{"name":"prefix","type":"char","length":155}]}},{"id":"pdf","name":"PDF header, xref table and trailer","extensions":["pdf"],"match":[[{"offset":0,"text":"%PDF-"}]],"endian":"little","structs":{"File":[{"name":"header","type":"line","length":64,"encoding":"latin1"},{"name":"startxref","type":"StartXref","at":{"findText":"startxref","from":"end","within":4096},"peek":true},{"name":"xref","type":"Xref","at":"startxref.offset","peek":true,"if":"startxref.offset < size()"}],"StartXref":[{"name":"keyword","type":"char","length":9},{"name":"offset","type":"asciiint","format":"hex"}],"Xref":[{"name":"keyword","type":"char","length":4},{"name":"note","value":"'This is an xref stream (PDF 1.5 and later): the table is compressed inside an object'","if":"keyword != 'xref'"},{"name":"subsections","type":"Subsection","if":"keyword == 'xref'","count":10000,"while":"u8(pos()) == 10 || u8(pos()) == 13 || u8(pos()) == 32 ? (u8(pos() + 1) >= 48 && u8(pos() + 1) <= 57) || (u8(pos() + 2) >= 48 && u8(pos() + 2) <= 57) : u8(pos()) >= 48 && u8(pos()) <= 57"},{"skipWhitespace":true},{"name":"trailer","type":"char","length":7,"if":"keyword == 'xref'"},{"name":"trailer_dictionary","type":"line","length":2048,"encoding":"latin1","if":"keyword == 'xref'"}],"Subsection":{"label":"'objects ' + first + ' to ' + (first + count - 1)","fields":[{"name":"first","type":"asciiint"},{"name":"count","type":"asciiint"},{"skipWhitespace":true},{"name":"entries","type":"Entry","count":"count"}]},"Entry":{"label":"'object ' + (parent.first + i) + (kind == 'n' ? ' at ' + hex(offset) : ' free')","fields":[{"name":"offset","type":"asciiint","comment":"Byte offset of the object (in use) or the next free object number (free)"},{"name":"generation","type":"asciiint"},{"skipWhitespace":true},{"name":"kind","type":"char","length":1,"enum":{"n":"in use","f":"free"}},{"seek":"start() + 20"}]}}},{"id":"sqlite","name":"SQLite database header","extensions":["sqlite","sqlite3","db","db3"],"match":[[{"offset":0,"text":"SQLite format 3"}]],"endian":"big","structs":{"File":[{"name":"header","type":"Header"},{"name":"page1_btree","type":"BtreeHeader"},{"name":"cell_pointers","type":"u16","format":"hex","count":"min(page1_btree.cell_count, 10000)"}],"Header":[{"name":"magic","type":"char","length":16},{"name":"page_size","type":"u16","comment":"1 means 65536"},{"name":"page_size_bytes","value":"page_size == 1 ? 65536 : page_size"},{"name":"write_version","type":"u8","enum":{"1":"Legacy (rollback journal)","2":"WAL"}},{"name":"read_version","type":"u8","enum":{"1":"Legacy (rollback journal)","2":"WAL"}},{"name":"reserved_per_page","type":"u8"},{"name":"max_payload_fraction","type":"u8","expect":64},{"name":"min_payload_fraction","type":"u8","expect":32},{"name":"leaf_payload_fraction","type":"u8","expect":32},{"name":"change_counter","type":"u32"},{"name":"page_count","type":"u32"},{"name":"database_size","value":"page_count * (page_size == 1 ? 65536 : page_size)"},{"name":"first_freelist_trunk","type":"u32"},{"name":"freelist_pages","type":"u32"},{"name":"schema_cookie","type":"u32"},{"name":"schema_format","type":"u32"},{"name":"default_cache_size","type":"u32"},{"name":"largest_root_page","type":"u32","comment":"Not 0 in auto-vacuum mode"},{"name":"text_encoding","type":"u32","enum":{"1":"UTF-8","2":"UTF-16le","3":"UTF-16be"}},{"name":"user_version","type":"u32"},{"name":"incremental_vacuum","type":"u32"},{"name":"application_id","type":"u32","format":"hex"},{"name":"reserved","type":"bytes","length":20},{"name":"version_valid_for","type":"u32"},{"name":"sqlite_version","type":"u32","comment":"For example 3045001 is 3.45.1"}],"BtreeHeader":[{"name":"page_type","type":"u8","enum":{"2":"Interior index","5":"Interior table","10":"Leaf index","13":"Leaf table"}},{"name":"first_freeblock","type":"u16","format":"hex"},{"name":"cell_count","type":"u16"},{"name":"cell_content_start","type":"u16","format":"hex"},{"name":"fragmented_bytes","type":"u8"},{"name":"right_most_pointer","type":"u32","if":"page_type == 2 || page_type == 5"}]}},{"id":"elf","name":"ELF executable, object or shared library","extensions":["elf","so","o","ko","axf","out"],"match":[[{"offset":0,"hex":"7F 45 4C 46"}]],"endian":"little","structs":{"File":[{"name":"e_ident","type":"Ident"},{"name":"header","type":"Header"},{"name":"program_headers","type":{"switch":"e_ident.class","cases":{"1":"Phdr32"},"default":"Phdr64"},"count":"min(header.e_phnum, 4096)","at":"header.e_phoff","peek":true,"if":"header.e_phnum > 0 && header.e_phoff < size()"},{"name":"section_headers","type":{"switch":"e_ident.class","cases":{"1":"Shdr32"},"default":"Shdr64"},"count":"min(header.e_shnum, 65535)","at":"header.e_shoff","peek":true,"if":"header.e_shnum > 0 && header.e_shoff < size()"},{"name":"file_type","value":"header.e_type","enum":"EType"},{"name":"machine","value":"header.e_machine","enum":"Machine"},{"name":"entry_point","value":"header.e_entry","format":"hex"},{"name":"program_header_count","value":"header.e_phnum","format":"dec"},{"name":"section_count","value":"header.e_shnum","format":"dec"}],"Ident":[{"name":"magic","type":"bytes","length":4,"expect":"7F 45 4C 46"},{"name":"class","type":"u8","enum":{"1":"32-bit","2":"64-bit"}},{"name":"data","type":"u8","enum":{"1":"Little-endian","2":"Big-endian"}},{"name":"version","type":"u8"},{"name":"os_abi","type":"u8","enum":{"0":"System V","3":"Linux","6":"Solaris","9":"FreeBSD","12":"OpenBSD","97":"ARM","255":"Standalone"}},{"name":"abi_version","type":"u8"},{"name":"padding","type":"bytes","length":7}],"Header":{"endian":"e_ident.data == 2 ? 'big' : 'little'","fields":[{"name":"e_type","type":"u16","enum":"EType"},{"name":"e_machine","type":"u16","enum":"Machine"},{"name":"e_version","type":"u32"},{"name":"e_entry","type":{"switch":"e_ident.class","cases":{"1":"u32"},"default":"u64"},"format":"hex"},{"name":"e_phoff","type":{"switch":"e_ident.class","cases":{"1":"u32"},"default":"u64"},"format":"hex"},{"name":"e_shoff","type":{"switch":"e_ident.class","cases":{"1":"u32"},"default":"u64"},"format":"hex"},{"name":"e_flags","type":"u32","format":"hex"},{"name":"e_ehsize","type":"u16"},{"name":"e_phentsize","type":"u16"},{"name":"e_phnum","type":"u16"},{"name":"e_shentsize","type":"u16"},{"name":"e_shnum","type":"u16"},{"name":"e_shstrndx","type":"u16"},{"name":"shstrtab_offset","hidden":true,"value":"e_shstrndx < e_shnum && e_shoff + (e_shstrndx + 1) * e_shentsize <= size() ? u32(e_shoff + e_shstrndx * e_shentsize + (e_ident.class == 1 ? 16 : e_ident.data == 2 ? 28 : 24)) : 0"}]},"Phdr32":{"endian":"e_ident.data == 2 ? 'big' : 'little'","label":"p_type","fields":[{"name":"p_type","type":"u32","enum":"PType"},{"name":"p_offset","type":"u32","format":"hex"},{"name":"p_vaddr","type":"u32","format":"hex"},{"name":"p_paddr","type":"u32","format":"hex"},{"name":"p_filesz","type":"u32"},{"name":"p_memsz","type":"u32"},{"name":"p_flags","type":"u32","flags":"PFlags"},{"name":"p_align","type":"u32","format":"hex"}]},"Phdr64":{"endian":"e_ident.data == 2 ? 'big' : 'little'","label":"p_type","fields":[{"name":"p_type","type":"u32","enum":"PType"},{"name":"p_flags","type":"u32","flags":"PFlags"},{"name":"p_offset","type":"u64","format":"hex"},{"name":"p_vaddr","type":"u64","format":"hex"},{"name":"p_paddr","type":"u64","format":"hex"},{"name":"p_filesz","type":"u64"},{"name":"p_memsz","type":"u64"},{"name":"p_align","type":"u64","format":"hex"}]},"Shdr32":{"endian":"e_ident.data == 2 ? 'big' : 'little'","label":"defined(name) ? name : ''","fields":[{"name":"sh_name","type":"u32"},{"name":"name","type":"zstring","length":256,"encoding":"latin1","at":"header.shstrtab_offset + sh_name","peek":true,"if":"header.shstrtab_offset && header.shstrtab_offset + sh_name < size()"},{"name":"sh_type","type":"u32","enum":"ShType"},{"name":"sh_flags","type":"u32","flags":"ShFlags"},{"name":"sh_addr","type":"u32","format":"hex"},{"name":"sh_offset","type":"u32","format":"hex"},{"name":"sh_size","type":"u32"},{"name":"sh_link","type":"u32"},{"name":"sh_info","type":"u32"},{"name":"sh_addralign","type":"u32"},{"name":"sh_entsize","type":"u32"},{"name":"link_offset","hidden":true,"value":"sh_link > 0 && sh_link < header.e_shnum && header.e_shoff + (sh_link + 1) * header.e_shentsize <= size() ? u32(header.e_shoff + sh_link * header.e_shentsize + 16) : 0"},{"name":"symbol_count","value":"sh_size // sh_entsize","format":"dec","comment":"The table below shows the first 1,000 symbols.","if":"(sh_type == 2 || sh_type == 11) && sh_entsize >= 16"},{"name":"symbols","type":"Sym32","count":"min(sh_size // sh_entsize, 1000)","at":"sh_offset","peek":true,"if":"(sh_type == 2 || sh_type == 11) && sh_entsize >= 16 && sh_offset + sh_size <= size()"},{"name":"dynamic","type":"Dyn32","count":"min(sh_size // 8, 512)","until":"_.d_tag == 0","at":"sh_offset","peek":true,"if":"sh_type == 6 && sh_size >= 8 && sh_offset + sh_size <= size()"}]},"Shdr64":{"endian":"e_ident.data == 2 ? 'big' : 'little'","label":"defined(name) ? name : ''","fields":[{"name":"sh_name","type":"u32"},{"name":"name","type":"zstring","length":256,"encoding":"latin1","at":"header.shstrtab_offset + sh_name","peek":true,"if":"header.shstrtab_offset && header.shstrtab_offset + sh_name < size()"},{"name":"sh_type","type":"u32","enum":"ShType"},{"name":"sh_flags","type":"u64","flags":"ShFlags"},{"name":"sh_addr","type":"u64","format":"hex"},{"name":"sh_offset","type":"u64","format":"hex"},{"name":"sh_size","type":"u64"},{"name":"sh_link","type":"u32"},{"name":"sh_info","type":"u32"},{"name":"sh_addralign","type":"u64"},{"name":"sh_entsize","type":"u64"},{"name":"link_offset","hidden":true,"value":"sh_link > 0 && sh_link < header.e_shnum && header.e_shoff + (sh_link + 1) * header.e_shentsize <= size() ? u32(header.e_shoff + sh_link * header.e_shentsize + (e_ident.data == 2 ? 28 : 24)) : 0"},{"name":"symbol_count","value":"sh_size // sh_entsize","format":"dec","comment":"The table below shows the first 1,000 symbols.","if":"(sh_type == 2 || sh_type == 11) && sh_entsize >= 24"},{"name":"symbols","type":"Sym64","count":"min(sh_size // sh_entsize, 1000)","at":"sh_offset","peek":true,"if":"(sh_type == 2 || sh_type == 11) && sh_entsize >= 24 && sh_offset + sh_size <= size()"},{"name":"dynamic","type":"Dyn64","count":"min(sh_size // 16, 512)","until":"_.d_tag == 0","at":"sh_offset","peek":true,"if":"sh_type == 6 && sh_size >= 16 && sh_offset + sh_size <= size()"}]},"Sym32":{"label":"st_name > 0 && link_offset > 0 && link_offset + st_name < size() ? name : ''","fields":[{"name":"st_name","type":"u32"},{"name":"name","type":"zstring","length":256,"encoding":"latin1","at":"link_offset + st_name","peek":true,"if":"st_name > 0 && link_offset > 0 && link_offset + st_name < size()"},{"name":"st_value","type":"u32","format":"hex"},{"name":"st_size","type":"u32"},{"name":"st_info","type":"u8","format":"hex"},{"name":"bind","value":"st_info >> 4","enum":"SymBind"},{"name":"kind","value":"st_info & 15","enum":"SymType"},{"name":"st_other","type":"u8"},{"name":"visibility","value":"st_other & 3","enum":"SymVis"},{"name":"st_shndx","type":"u16","comment":"Section index; 0 is undefined, 0xFFF1 absolute"}]},"Sym64":{"label":"st_name > 0 && link_offset > 0 && link_offset + st_name < size() ? name : ''","fields":[{"name":"st_name","type":"u32"},{"name":"name","type":"zstring","length":256,"encoding":"latin1","at":"link_offset + st_name","peek":true,"if":"st_name > 0 && link_offset > 0 && link_offset + st_name < size()"},{"name":"st_info","type":"u8","format":"hex"},{"name":"bind","value":"st_info >> 4","enum":"SymBind"},{"name":"kind","value":"st_info & 15","enum":"SymType"},{"name":"st_other","type":"u8"},{"name":"visibility","value":"st_other & 3","enum":"SymVis"},{"name":"st_shndx","type":"u16","comment":"Section index; 0 is undefined, 0xFFF1 absolute"},{"name":"st_value","type":"u64","format":"hex"},{"name":"st_size","type":"u64"}]},"Dyn32":{"label":"d_tag","fields":[{"name":"d_tag","type":"i32","enum":"DynTag"},{"name":"d_val","type":"u32","format":"hex"},{"name":"text","type":"zstring","length":1024,"encoding":"latin1","at":"link_offset + d_val","peek":true,"if":"(d_tag == 1 || d_tag == 14 || d_tag == 15 || d_tag == 29) && link_offset > 0 && link_offset + d_val < size()"}]},"Dyn64":{"label":"d_tag","fields":[{"name":"d_tag","type":"i64","enum":"DynTag"},{"name":"d_val","type":"u64","format":"hex"},{"name":"text","type":"zstring","length":1024,"encoding":"latin1","at":"link_offset + d_val","peek":true,"if":"(d_tag == 1 || d_tag == 14 || d_tag == 15 || d_tag == 29) && link_offset > 0 && link_offset + d_val < size()"}]}},"enums":{"EType":{"0":"None","1":"Relocatable","2":"Executable","3":"Shared object / PIE","4":"Core dump"},"Machine":{"0":"None","3":"x86","8":"MIPS","20":"PowerPC","21":"PowerPC 64","40":"ARM","42":"SuperH","50":"IA-64","62":"x86-64","183":"AArch64","243":"RISC-V","247":"BPF","258":"LoongArch"},"PType":{"0":"NULL","1":"LOAD","2":"DYNAMIC","3":"INTERP","4":"NOTE","5":"SHLIB","6":"PHDR","7":"TLS","0x6474E550":"GNU_EH_FRAME","0x6474E551":"GNU_STACK","0x6474E552":"GNU_RELRO","0x6474E553":"GNU_PROPERTY"},"ShType":{"0":"NULL","1":"PROGBITS","2":"SYMTAB","3":"STRTAB","4":"RELA","5":"HASH","6":"DYNAMIC","7":"NOTE","8":"NOBITS","9":"REL","11":"DYNSYM","14":"INIT_ARRAY","15":"FINI_ARRAY","0x6FFFFFF6":"GNU_HASH","0x6FFFFFFE":"VERNEED","0x6FFFFFFF":"VERSYM"},"SymBind":{"0":"LOCAL","1":"GLOBAL","2":"WEAK","10":"GNU_UNIQUE"},"SymType":{"0":"NOTYPE","1":"OBJECT","2":"FUNC","3":"SECTION","4":"FILE","5":"COMMON","6":"TLS","10":"GNU_IFUNC"},"SymVis":{"0":"DEFAULT","1":"INTERNAL","2":"HIDDEN","3":"PROTECTED"},"DynTag":{"0":"NULL","1":"NEEDED","2":"PLTRELSZ","3":"PLTGOT","4":"HASH","5":"STRTAB","6":"SYMTAB","7":"RELA","8":"RELASZ","9":"RELAENT","10":"STRSZ","11":"SYMENT","12":"INIT","13":"FINI","14":"SONAME","15":"RPATH","16":"SYMBOLIC","17":"REL","18":"RELSZ","19":"RELENT","20":"PLTREL","21":"DEBUG","22":"TEXTREL","23":"JMPREL","24":"BIND_NOW","25":"INIT_ARRAY","26":"FINI_ARRAY","27":"INIT_ARRAYSZ","28":"FINI_ARRAYSZ","29":"RUNPATH","30":"FLAGS","32":"PREINIT_ARRAY","33":"PREINIT_ARRAYSZ","0x6FFFFEF5":"GNU_HASH","0x6FFFFFF0":"VERSYM","0x6FFFFFFB":"FLAGS_1","0x6FFFFFFE":"VERNEED","0x6FFFFFFF":"VERNEEDNUM","0x6FFFFFF9":"RELACOUNT","0x6FFFFFFA":"RELCOUNT"}},"flags":{"PFlags":{"0x1":"X","0x2":"W","0x4":"R"},"ShFlags":{"0x1":"WRITE","0x2":"ALLOC","0x4":"EXECINSTR","0x10":"MERGE","0x20":"STRINGS","0x40":"INFO_LINK","0x400":"TLS"}}},{"id":"pe","name":"Windows PE executable (EXE, DLL, SYS)","extensions":["exe","dll","sys","efi","ocx","scr","cpl"],"match":[[{"offset":0,"text":"MZ"}]],"endian":"little","structs":{"File":[{"name":"dos_header","type":"DosHeader"},{"name":"pe","type":"PeHeaders","at":"dos_header.e_lfanew","if":"dos_header.e_lfanew + 24 <= size() && u32le(dos_header.e_lfanew) == 0x4550"},{"name":"note","value":"'No PE header: an MS-DOS program'","if":"!(dos_header.e_lfanew + 24 <= size() && u32le(dos_header.e_lfanew) == 0x4550)"},{"name":"is_pe","hidden":true,"value":"dos_header.e_lfanew + 24 <= size() && u32le(dos_header.e_lfanew) == 0x4550"},{"name":"has_opt","hidden":true,"value":"is_pe && pe.coff.size_of_optional_header >= 2 && (u16le(pe.optional_header.offset) == 0x10B || u16le(pe.optional_header.offset) == 0x20B)"},{"name":"kind","value":"(pe.coff.characteristics & 0x2000) ? 'DLL' : 'Executable'","if":"is_pe"},{"name":"machine","value":"pe.coff.machine","enum":"Machine","if":"is_pe"},{"name":"subsystem","value":"pe.optional_header.common.subsystem","enum":"Subsystem","if":"has_opt"},{"name":"entry_point_rva","value":"pe.optional_header.address_of_entry_point","format":"hex","if":"has_opt"},{"name":"section_count","value":"pe.coff.number_of_sections","format":"dec","if":"is_pe"},{"name":"import_offset","hidden":true,"value":"has_opt && len(pe.optional_header.data_directories) > 1 && pe.optional_header.data_directories[1].virtual_address > 0 ? addr(pe.sections, pe.optional_header.data_directories[1].virtual_address, 'virtual_address', 'virtual_size', 'pointer_to_raw_data') : -1"},{"name":"imports","type":"ImportDescriptor","count":"min(256, (size() - import_offset) // 20)","until":"_.name_rva == 0","at":"import_offset","peek":true,"if":"import_offset > 0 && import_offset + 20 <= size()"},{"name":"resource_offset","hidden":true,"value":"has_opt && len(pe.optional_header.data_directories) > 2 && pe.optional_header.data_directories[2].virtual_address > 0 ? addr(pe.sections, pe.optional_header.data_directories[2].virtual_address, 'virtual_address', 'virtual_size', 'pointer_to_raw_data') : -1"},{"name":"resources","type":"ResourceRoot","at":"resource_offset","peek":true,"if":"resource_offset > 0 && resource_offset + 16 <= size()"}],"ImportDescriptor":{"label":"name_offset > 0 && name_offset < size() ? dll : '(end of the list)'","fields":[{"name":"original_first_thunk","type":"u32","format":"hex","comment":"RVA of the import lookup table"},{"name":"time_date_stamp","type":"u32"},{"name":"forwarder_chain","type":"u32","format":"hex"},{"name":"name_rva","type":"u32","format":"hex"},{"name":"first_thunk","type":"u32","format":"hex","comment":"RVA of the import address table"},{"name":"name_offset","hidden":true,"value":"name_rva ? addr(pe.sections, name_rva, 'virtual_address', 'virtual_size', 'pointer_to_raw_data') : -1"},{"name":"dll","type":"zstring","length":256,"encoding":"latin1","at":"name_offset","peek":true,"if":"name_offset > 0 && name_offset < size()"},{"name":"lookup_offset","hidden":true,"value":"name_rva && (original_first_thunk || first_thunk) ? addr(pe.sections, original_first_thunk ? original_first_thunk : first_thunk, 'virtual_address', 'virtual_size', 'pointer_to_raw_data') : -1"},{"name":"functions","type":{"switch":"u16le(pe.optional_header.offset)","cases":{"0x20B":"Thunk64"},"default":"Thunk32"},"count":"min(300, (size() - lookup_offset) // (u16le(pe.optional_header.offset) == 0x20B ? 8 : 4))","until":"_.raw == 0","at":"lookup_offset","peek":true,"if":"lookup_offset > 0 && lookup_offset + 4 <= size()"}]},"Thunk32":{"label":"by_ordinal ? 'ordinal ' + str(raw & 0xFFFF) : hint_offset > 0 && hint_offset + 2 < size() ? name : ''","fields":[{"name":"raw","type":"u32","format":"hex"},{"name":"by_ordinal","hidden":true,"value":"raw != 0 && (raw >> 31) == 1"},{"name":"ordinal","value":"raw & 0xFFFF","format":"dec","if":"by_ordinal"},{"name":"hint_offset","hidden":true,"value":"raw != 0 && !by_ordinal ? addr(pe.sections, raw & 0x7FFFFFFF, 'virtual_address', 'virtual_size', 'pointer_to_raw_data') : -1"},{"name":"hint","type":"u16","at":"hint_offset","peek":true,"if":"hint_offset > 0 && hint_offset + 2 < size()"},{"name":"name","type":"zstring","length":256,"encoding":"latin1","at":"hint_offset + 2","peek":true,"if":"hint_offset > 0 && hint_offset + 2 < size()"}]},"Thunk64":{"label":"by_ordinal ? 'ordinal ' + str(raw & 0xFFFF) : hint_offset > 0 && hint_offset + 2 < size() ? name : ''","fields":[{"name":"raw","type":"u64","format":"hex"},{"name":"by_ordinal","hidden":true,"value":"raw != 0 && (raw >> 63) == 1"},{"name":"ordinal","value":"raw & 0xFFFF","format":"dec","if":"by_ordinal"},{"name":"hint_offset","hidden":true,"value":"raw != 0 && !by_ordinal ? addr(pe.sections, raw & 0x7FFFFFFF, 'virtual_address', 'virtual_size', 'pointer_to_raw_data') : -1"},{"name":"hint","type":"u16","at":"hint_offset","peek":true,"if":"hint_offset > 0 && hint_offset + 2 < size()"},{"name":"name","type":"zstring","length":256,"encoding":"latin1","at":"hint_offset + 2","peek":true,"if":"hint_offset > 0 && hint_offset + 2 < size()"}]},"ResourceRoot":[{"name":"characteristics","type":"u32"},{"name":"time_date_stamp","type":"u32"},{"name":"major_version","type":"u16"},{"name":"minor_version","type":"u16"},{"name":"named_entries","type":"u16"},{"name":"id_entries","type":"u16"},{"name":"types","type":"ResourceTypeEntry","count":"min(named_entries + id_entries, 256)"}],"ResourceTypeEntry":{"label":"type","fields":[{"name":"type","type":"u32","enum":"ResType","if":"(u32le(start()) >> 31) == 0"},{"name":"name_ref","type":"u32","format":"hex","if":"(u32le(start()) >> 31) == 1"},{"name":"offset_to_data","type":"u32","format":"hex","comment":"The top bit set: a subdirectory"},{"name":"type_name","type":"ResString","at":"resource_offset + (u32le(start()) & 0x7FFFFFFF)","peek":true,"if":"(u32le(start()) >> 31) == 1 && resource_offset + (u32le(start()) & 0x7FFFFFFF) + 2 <= size()"},{"name":"entries","type":"ResourceDir","at":"resource_offset + (offset_to_data & 0x7FFFFFFF)","peek":true,"if":"(offset_to_data >> 31) == 1 && resource_offset + (offset_to_data & 0x7FFFFFFF) + 16 <= size()"}]},"ResourceDir":[{"name":"characteristics","type":"u32"},{"name":"time_date_stamp","type":"u32"},{"name":"major_version","type":"u16"},{"name":"minor_version","type":"u16"},{"name":"named_entries","type":"u16"},{"name":"id_entries","type":"u16"},{"name":"items","type":"ResourceEntry","count":"min(named_entries + id_entries, 256)"}],"ResourceEntry":{"label":"(u32le(start()) >> 31) == 1 ? 'named' : 'id ' + str(u32le(start()))","fields":[{"name":"name_or_id","type":"u32","format":"hex"},{"name":"offset_to_data","type":"u32","format":"hex","comment":"The top bit set: a subdirectory (language level)"}]},"ResString":{"label":"text","fields":[{"name":"length","type":"u16"},{"name":"text","type":"string","length":"length * 2","encoding":"utf16le"}]},"DosHeader":[{"name":"e_magic","type":"char","length":2},{"name":"e_cblp","type":"u16"},{"name":"e_cp","type":"u16"},{"name":"e_crlc","type":"u16"},{"name":"e_cparhdr","type":"u16"},{"name":"e_minalloc","type":"u16"},{"name":"e_maxalloc","type":"u16"},{"name":"e_ss","type":"u16"},{"name":"e_sp","type":"u16"},{"name":"e_csum","type":"u16"},{"name":"e_ip","type":"u16"},{"name":"e_cs","type":"u16"},{"name":"e_lfarlc","type":"u16"},{"name":"e_ovno","type":"u16"},{"name":"e_res","type":"u16","count":4},{"name":"e_oemid","type":"u16"},{"name":"e_oeminfo","type":"u16"},{"name":"e_res2","type":"u16","count":10},{"name":"e_lfanew","type":"u32","format":"hex","comment":"Offset of the PE header"}],"PeHeaders":[{"name":"signature","type":"bytes","length":4,"expect":"50 45 00 00"},{"name":"coff","type":[{"name":"machine","type":"u16","enum":"Machine"},{"name":"number_of_sections","type":"u16"},{"name":"time_date_stamp","type":"u32","format":"unix"},{"name":"pointer_to_symbol_table","type":"u32","format":"hex"},{"name":"number_of_symbols","type":"u32"},{"name":"size_of_optional_header","type":"u16"},{"name":"characteristics","type":"u16","flags":{"0x1":"RELOCS_STRIPPED","0x2":"EXECUTABLE","0x20":"LARGE_ADDRESS_AWARE","0x100":"32BIT","0x200":"DEBUG_STRIPPED","0x1000":"SYSTEM","0x2000":"DLL"}}]},{"name":"optional_header","size":"coff.size_of_optional_header","if":"coff.size_of_optional_header > 0","type":{"switch":"u16le(pos())","cases":{"0x10B":"Opt32","0x20B":"Opt64"},"default":"Raw"}},{"name":"sections","type":"Section","count":"min(coff.number_of_sections, 96)"}],"Raw":[{"name":"bytes","type":"bytes","length":"end() - pos()"}],"Opt32":[{"name":"magic","type":"u16","enum":{"0x10B":"PE32","0x20B":"PE32+"}},{"name":"linker_major","type":"u8"},{"name":"linker_minor","type":"u8"},{"name":"size_of_code","type":"u32"},{"name":"size_of_initialized_data","type":"u32"},{"name":"size_of_uninitialized_data","type":"u32"},{"name":"address_of_entry_point","type":"u32","format":"hex"},{"name":"base_of_code","type":"u32","format":"hex"},{"name":"base_of_data","type":"u32","format":"hex"},{"name":"image_base","type":"u32","format":"hex"},{"name":"common","type":"OptCommon"},{"name":"size_of_stack_reserve","type":"u32"},{"name":"size_of_stack_commit","type":"u32"},{"name":"size_of_heap_reserve","type":"u32"},{"name":"size_of_heap_commit","type":"u32"},{"name":"loader_flags","type":"u32"},{"name":"number_of_rva_and_sizes","type":"u32"},{"name":"data_directories","type":"DataDir","count":"min(number_of_rva_and_sizes, 16, (end() - pos()) // 8)"}],"Opt64":[{"name":"magic","type":"u16","enum":{"0x10B":"PE32","0x20B":"PE32+"}},{"name":"linker_major","type":"u8"},{"name":"linker_minor","type":"u8"},{"name":"size_of_code","type":"u32"},{"name":"size_of_initialized_data","type":"u32"},{"name":"size_of_uninitialized_data","type":"u32"},{"name":"address_of_entry_point","type":"u32","format":"hex"},{"name":"base_of_code","type":"u32","format":"hex"},{"name":"image_base","type":"u64","format":"hex"},{"name":"common","type":"OptCommon"},{"name":"size_of_stack_reserve","type":"u64"},{"name":"size_of_stack_commit","type":"u64"},{"name":"size_of_heap_reserve","type":"u64"},{"name":"size_of_heap_commit","type":"u64"},{"name":"loader_flags","type":"u32"},{"name":"number_of_rva_and_sizes","type":"u32"},{"name":"data_directories","type":"DataDir","count":"min(number_of_rva_and_sizes, 16, (end() - pos()) // 8)"}],"OptCommon":[{"name":"section_alignment","type":"u32","format":"hex"},{"name":"file_alignment","type":"u32","format":"hex"},{"name":"os_major","type":"u16"},{"name":"os_minor","type":"u16"},{"name":"image_major","type":"u16"},{"name":"image_minor","type":"u16"},{"name":"subsystem_major","type":"u16"},{"name":"subsystem_minor","type":"u16"},{"name":"win32_version","type":"u32"},{"name":"size_of_image","type":"u32"},{"name":"size_of_headers","type":"u32"},{"name":"checksum","type":"u32","format":"hex"},{"name":"subsystem","type":"u16","enum":"Subsystem"},{"name":"dll_characteristics","type":"u16","flags":{"0x20":"HIGH_ENTROPY_VA","0x40":"DYNAMIC_BASE","0x80":"FORCE_INTEGRITY","0x100":"NX_COMPAT","0x200":"NO_ISOLATION","0x400":"NO_SEH","0x800":"NO_BIND","0x1000":"APPCONTAINER","0x2000":"WDM_DRIVER","0x4000":"GUARD_CF","0x8000":"TERMINAL_SERVER_AWARE"}}],"DataDir":{"label":"i == 0 ? 'Export' : i == 1 ? 'Import' : i == 2 ? 'Resource' : i == 3 ? 'Exception' : i == 4 ? 'Certificate' : i == 5 ? 'Base relocation' : i == 6 ? 'Debug' : i == 7 ? 'Architecture' : i == 8 ? 'Global pointer' : i == 9 ? 'TLS' : i == 10 ? 'Load config' : i == 11 ? 'Bound import' : i == 12 ? 'IAT' : i == 13 ? 'Delay import' : i == 14 ? 'CLR runtime (.NET)' : 'Reserved'","fields":[{"name":"virtual_address","type":"u32","format":"hex"},{"name":"size_","type":"u32"}]},"Section":{"label":"name","fields":[{"name":"name","type":"char","length":8},{"name":"virtual_size","type":"u32"},{"name":"virtual_address","type":"u32","format":"hex"},{"name":"size_of_raw_data","type":"u32"},{"name":"pointer_to_raw_data","type":"u32","format":"hex"},{"name":"pointer_to_relocations","type":"u32","format":"hex"},{"name":"pointer_to_linenumbers","type":"u32","format":"hex"},{"name":"number_of_relocations","type":"u16"},{"name":"number_of_linenumbers","type":"u16"},{"name":"characteristics","type":"u32","flags":{"0x20":"CODE","0x40":"INITIALIZED_DATA","0x80":"UNINITIALIZED_DATA","0x2000000":"DISCARDABLE","0x10000000":"SHARED","0x20000000":"EXECUTE","0x40000000":"READ","0x80000000":"WRITE"}}]}},"enums":{"Machine":{"0x14C":"x86","0x8664":"x64","0x1C0":"ARM","0x1C4":"ARMv7 Thumb-2","0xAA64":"ARM64","0x200":"Itanium","0x5064":"RISC-V 64","0xEBC":"EFI byte code"},"Subsystem":{"1":"Native","2":"Windows GUI","3":"Windows console","9":"Windows CE","10":"EFI application","11":"EFI boot driver","12":"EFI runtime driver","14":"Xbox","16":"Windows boot"},"ResType":{"1":"CURSOR","2":"BITMAP","3":"ICON","4":"MENU","5":"DIALOG","6":"STRING","7":"FONTDIR","8":"FONT","9":"ACCELERATOR","10":"RCDATA","11":"MESSAGETABLE","12":"GROUP_CURSOR","14":"GROUP_ICON","16":"VERSION","17":"DLGINCLUDE","19":"PLUGPLAY","20":"VXD","21":"ANICURSOR","22":"ANIICON","23":"HTML","24":"MANIFEST"}}},{"id":"macho","name":"Mach-O executable or library (macOS, iOS), also universal binaries","extensions":["dylib","bundle","o","macho"],"match":[[{"offset":0,"hex":"CF FA ED FE"}],[{"offset":0,"hex":"CE FA ED FE"}],[{"offset":0,"hex":"FE ED FA CF"}],[{"offset":0,"hex":"FE ED FA CE"}],[{"offset":0,"hex":"CA FE BA BE"},{"offset":4,"type":"u32","endian":"big","min":1,"max":30}]],"endian":"big","structs":{"File":[{"name":"macho","type":"MachO"},{"name":"kind","value":"macho.magic","format":"hex","enum":{"0xFEEDFACE":"32-bit, big-endian","0xFEEDFACF":"64-bit, big-endian","0xCEFAEDFE":"32-bit, little-endian","0xCFFAEDFE":"64-bit, little-endian","0xCAFEBABE":"Universal (fat) binary"}},{"name":"cpu","value":"macho.header.cputype","enum":"Cpu","if":"macho.magic != 0xCAFEBABE"},{"name":"file_type","value":"macho.header.filetype","enum":{"1":"Object","2":"Executable","3":"Fixed VM library","4":"Core","5":"Preloaded","6":"Dynamic library","7":"Dynamic linker","8":"Bundle","9":"Dylib stub","10":"dSYM companion","11":"Kext bundle","12":"Fileset"},"if":"macho.magic != 0xCAFEBABE"},{"name":"load_command_count","value":"macho.header.ncmds","format":"dec","if":"macho.magic != 0xCAFEBABE"},{"name":"architecture_count","value":"macho.fat.arch_count","format":"dec","if":"macho.magic == 0xCAFEBABE"},{"name":"first_architecture","value":"macho.fat.archs[0].cputype","enum":"Cpu","if":"macho.magic == 0xCAFEBABE && macho.fat.arch_count > 0"}],"MachO":[{"name":"magic","type":"u32","format":"hex","endian":"big","enum":{"0xFEEDFACE":"32-bit, big-endian","0xFEEDFACF":"64-bit, big-endian","0xCEFAEDFE":"32-bit, little-endian","0xCFFAEDFE":"64-bit, little-endian","0xCAFEBABE":"Universal (fat) binary"}},{"name":"fat","type":"Fat","if":"magic == 0xCAFEBABE"},{"name":"header","type":"Thin","if":"magic != 0xCAFEBABE"}],"Fat":[{"name":"arch_count","type":"u32"},{"name":"archs","type":"FatArch","count":"min(arch_count, 30)"},{"name":"slices","type":"MachO","count":"len(archs)","elementAt":"archs[i].offset"}],"FatArch":{"label":"cputype","fields":[{"name":"cputype","type":"i32","enum":"Cpu"},{"name":"cpusubtype","type":"i32","format":"hex"},{"name":"offset","type":"u32","format":"hex"},{"name":"size_","type":"u32"},{"name":"align","type":"u32","comment":"Power of 2"}]},"Thin":{"endian":"magic == 0xCEFAEDFE || magic == 0xCFFAEDFE ? 'little' : 'big'","fields":[{"name":"is64","value":"magic == 0xCFFAEDFE || magic == 0xFEEDFACF","hidden":true},{"name":"cputype","type":"i32","enum":"Cpu"},{"name":"cpusubtype","type":"i32","format":"hex"},{"name":"filetype","type":"u32","enum":{"1":"Object","2":"Executable","3":"Fixed VM library","4":"Core","5":"Preloaded","6":"Dynamic library","7":"Dynamic linker","8":"Bundle","9":"Dylib stub","10":"dSYM companion","11":"Kext bundle","12":"Fileset"}},{"name":"ncmds","type":"u32"},{"name":"sizeofcmds","type":"u32"},{"name":"flags","type":"u32","flags":{"0x1":"NOUNDEFS","0x4":"DYLDLINK","0x80":"TWOLEVEL","0x200000":"PIE","0x800000":"HAS_TLV_DESCRIPTORS","0x2000000":"APP_EXTENSION_SAFE"}},{"name":"reserved","type":"u32","if":"is64"},{"name":"load_commands","type":"LoadCommand","count":"min(ncmds, 10000)"}]},"LoadCommand":{"label":"cmd","fields":[{"name":"cmd","type":"u32","enum":"Lc"},{"name":"cmdsize","type":"u32"},{"name":"body","size":"max(0, cmdsize - 8)","type":{"switch":"cmd","cases":{"0x19":"Segment64","0x1":"Segment32","0xC":"Dylib","0xD":"Dylib","0x80000018":"Dylib","0x8000001F":"Dylib","0x80000023":"Dylib","0xE":"Dylinker","0xF":"Dylinker","0x1B":"Uuid","0x80000028":"Main","0x32":"BuildVersion","0x2":"Symtab","0x1D":"LinkeditData","0x26":"LinkeditData","0x29":"LinkeditData","0x80000033":"LinkeditData","0x80000034":"LinkeditData","0x8000001C":"Rpath"},"default":"Raw"}}]},"Raw":[{"name":"bytes","type":"bytes","length":"end() - pos()"}],"Segment64":{"label":"segname","fields":[{"name":"segname","type":"char","length":16},{"name":"vmaddr","type":"u64","format":"hex"},{"name":"vmsize","type":"u64","format":"hex"},{"name":"fileoff","type":"u64","format":"hex"},{"name":"filesize","type":"u64"},{"name":"maxprot","type":"u32","flags":"Prot"},{"name":"initprot","type":"u32","flags":"Prot"},{"name":"nsects","type":"u32"},{"name":"flags","type":"u32","format":"hex"},{"name":"sections","type":"Section64","count":"min(nsects, (end() - pos()) // 80)"}]},"Section64":{"label":"sectname","fields":[{"name":"sectname","type":"char","length":16},{"name":"segname","type":"char","length":16},{"name":"addr","type":"u64","format":"hex"},{"name":"size_","type":"u64"},{"name":"offset","type":"u32","format":"hex"},{"name":"align","type":"u32"},{"name":"reloff","type":"u32","format":"hex"},{"name":"nreloc","type":"u32"},{"name":"flags","type":"u32","format":"hex"},{"name":"reserved1","type":"u32"},{"name":"reserved2","type":"u32"},{"name":"reserved3","type":"u32"}]},"Segment32":{"label":"segname","fields":[{"name":"segname","type":"char","length":16},{"name":"vmaddr","type":"u32","format":"hex"},{"name":"vmsize","type":"u32","format":"hex"},{"name":"fileoff","type":"u32","format":"hex"},{"name":"filesize","type":"u32"},{"name":"maxprot","type":"u32","flags":"Prot"},{"name":"initprot","type":"u32","flags":"Prot"},{"name":"nsects","type":"u32"},{"name":"flags","type":"u32","format":"hex"},{"name":"sections","type":"Section32","count":"min(nsects, (end() - pos()) // 68)"}]},"Section32":{"label":"sectname","fields":[{"name":"sectname","type":"char","length":16},{"name":"segname","type":"char","length":16},{"name":"addr","type":"u32","format":"hex"},{"name":"size_","type":"u32"},{"name":"offset","type":"u32","format":"hex"},{"name":"align","type":"u32"},{"name":"reloff","type":"u32","format":"hex"},{"name":"nreloc","type":"u32"},{"name":"flags","type":"u32","format":"hex"},{"name":"reserved1","type":"u32"},{"name":"reserved2","type":"u32"}]},"Dylib":{"label":"name","fields":[{"name":"name_offset","type":"u32"},{"name":"timestamp","type":"u32"},{"name":"current_version","type":"u32","format":"hex","comment":"xxxx.yy.zz"},{"name":"compatibility_version","type":"u32","format":"hex"},{"name":"name","type":"zstring","length":"end() - parent.offset - name_offset","at":"parent.offset + name_offset","peek":true}]},"Dylinker":{"label":"name","fields":[{"name":"name_offset","type":"u32"},{"name":"name","type":"zstring","length":"end() - parent.offset - name_offset","at":"parent.offset + name_offset","peek":true}]},"Rpath":{"label":"path","fields":[{"name":"path_offset","type":"u32"},{"name":"path","type":"zstring","length":"end() - parent.offset - path_offset","at":"parent.offset + path_offset","peek":true}]},"Uuid":[{"name":"uuid","type":"bytes","length":16}],"Main":[{"name":"entryoff","type":"u64","format":"hex"},{"name":"stacksize","type":"u64"}],"BuildVersion":[{"name":"platform","type":"u32","enum":{"1":"macOS","2":"iOS","3":"tvOS","4":"watchOS","5":"bridgeOS","6":"Mac Catalyst","7":"iOS simulator","8":"tvOS simulator","9":"watchOS simulator","11":"visionOS","12":"visionOS simulator"}},{"name":"minos","type":"u32","format":"hex","comment":"xxxx.yy.zz: 0x000E0000 is 14.0"},{"name":"sdk","type":"u32","format":"hex"},{"name":"ntools","type":"u32"},{"name":"tools","type":[{"name":"tool","type":"u32","enum":{"1":"clang","2":"swift","3":"ld","4":"lld"}},{"name":"version","type":"u32","format":"hex"}],"count":"min(ntools, (end() - pos()) // 8)"}],"Symtab":[{"name":"symoff","type":"u32","format":"hex"},{"name":"nsyms","type":"u32"},{"name":"stroff","type":"u32","format":"hex"},{"name":"strsize","type":"u32"}],"LinkeditData":[{"name":"dataoff","type":"u32","format":"hex"},{"name":"datasize","type":"u32"}]},"enums":{"Cpu":{"7":"x86","0x1000007":"x86-64","12":"ARM","0x100000C":"ARM64","0x200000C":"ARM64_32","18":"PowerPC","0x1000012":"PowerPC 64"},"Lc":{"0x1":"LC_SEGMENT","0x2":"LC_SYMTAB","0xB":"LC_DYSYMTAB","0xC":"LC_LOAD_DYLIB","0xD":"LC_ID_DYLIB","0xE":"LC_LOAD_DYLINKER","0xF":"LC_ID_DYLINKER","0x19":"LC_SEGMENT_64","0x1B":"LC_UUID","0x1D":"LC_CODE_SIGNATURE","0x1E":"LC_SEGMENT_SPLIT_INFO","0x21":"LC_ENCRYPTION_INFO","0x22":"LC_DYLD_INFO","0x80000022":"LC_DYLD_INFO_ONLY","0x24":"LC_VERSION_MIN_MACOSX","0x25":"LC_VERSION_MIN_IPHONEOS","0x26":"LC_FUNCTION_STARTS","0x29":"LC_DATA_IN_CODE","0x2A":"LC_SOURCE_VERSION","0x2C":"LC_ENCRYPTION_INFO_64","0x32":"LC_BUILD_VERSION","0x80000018":"LC_LOAD_WEAK_DYLIB","0x8000001C":"LC_RPATH","0x8000001F":"LC_REEXPORT_DYLIB","0x80000023":"LC_LOAD_UPWARD_DYLIB","0x80000028":"LC_MAIN","0x80000033":"LC_DYLD_EXPORTS_TRIE","0x80000034":"LC_DYLD_CHAINED_FIXUPS"}},"flags":{"Prot":{"0x1":"R","0x2":"W","0x4":"X"}}},{"id":"class","name":"Java class file","extensions":["class"],"match":[[{"offset":0,"hex":"CA FE BA BE"},{"offset":6,"type":"u16","endian":"big","min":45,"max":200}]],"endian":"big","structs":{"File":[{"name":"magic","type":"u32","format":"hex","expect":3405691582},{"name":"minor_version","type":"u16"},{"name":"major_version","type":"u16","enum":{"45":"Java 1.1","46":"Java 1.2","47":"Java 1.3","48":"Java 1.4","49":"Java 5","50":"Java 6","51":"Java 7","52":"Java 8","53":"Java 9","54":"Java 10","55":"Java 11","56":"Java 12","57":"Java 13","58":"Java 14","59":"Java 15","60":"Java 16","61":"Java 17","62":"Java 18","63":"Java 19","64":"Java 20","65":"Java 21","66":"Java 22","67":"Java 23","68":"Java 24","69":"Java 25"}},{"name":"constant_pool_count","type":"u16"},{"name":"constant_pool","type":"CpEntry","count":65535,"while":"constant_pool_count > 1 && (!defined(_) || _.next_slot < constant_pool_count)"},{"name":"access_flags","type":"u16","flags":"Access"},{"name":"this_class","type":"u16"},{"name":"super_class","type":"u16"},{"name":"interfaces_count","type":"u16"},{"name":"interfaces","type":"u16","count":"interfaces_count"},{"name":"fields_count","type":"u16"},{"name":"fields","type":"Member","count":"fields_count"},{"name":"methods_count","type":"u16"},{"name":"methods","type":"Member","count":"methods_count"},{"name":"attributes_count","type":"u16"},{"name":"attributes","type":"Attribute","count":"attributes_count"}],"CpEntry":{"label":"'#' + slot + ' ' + (tag == 1 ? body.text : tag == 7 ? 'Class #' + body.name_index : tag == 8 ? 'String #' + body.string_index : tag == 12 ? 'NameAndType' : tag == 10 ? 'Methodref' : tag == 9 ? 'Fieldref' : 'tag ' + tag)","fields":[{"name":"slot","value":"i == 0 ? 1 : constant_pool[i - 1].next_slot","hidden":true},{"name":"tag","type":"u8","enum":{"1":"Utf8","3":"Integer","4":"Float","5":"Long","6":"Double","7":"Class","8":"String","9":"Fieldref","10":"Methodref","11":"InterfaceMethodref","12":"NameAndType","15":"MethodHandle","16":"MethodType","17":"Dynamic","18":"InvokeDynamic","19":"Module","20":"Package"}},{"name":"next_slot","value":"slot + (tag == 5 || tag == 6 ? 2 : 1)","hidden":true},{"name":"body","type":{"switch":"tag","cases":{"1":"Utf8","3":"Int","4":"Flt","5":"Lng","6":"Dbl","7":"Idx1","8":"Str","16":"Idx1","19":"Idx1","20":"Idx1","9":"Ref","10":"Ref","11":"Ref","12":"Nat","15":"Handle","17":"Dyn","18":"Dyn"},"default":"Bad"}}]},"Bad":[{"name":"unknown_tag","type":"bytes","length":"-1"}],"Utf8":[{"name":"length","type":"u16"},{"name":"text","type":"string","length":"length"}],"Int":[{"name":"value","type":"i32"}],"Flt":[{"name":"value","type":"f32"}],"Lng":[{"name":"value","type":"i64"}],"Dbl":[{"name":"value","type":"f64"}],"Idx1":[{"name":"name_index","type":"u16"}],"Str":[{"name":"string_index","type":"u16"}],"Ref":[{"name":"class_index","type":"u16"},{"name":"name_and_type_index","type":"u16"}],"Nat":[{"name":"name_index","type":"u16"},{"name":"descriptor_index","type":"u16"}],"Handle":[{"name":"reference_kind","type":"u8"},{"name":"reference_index","type":"u16"}],"Dyn":[{"name":"bootstrap_method_attr_index","type":"u16"},{"name":"name_and_type_index","type":"u16"}],"Member":{"label":"'name #' + name_index + ', descriptor #' + descriptor_index","fields":[{"name":"access_flags","type":"u16","flags":"Access"},{"name":"name_index","type":"u16"},{"name":"descriptor_index","type":"u16"},{"name":"attributes_count","type":"u16"},{"name":"attributes","type":"Attribute","count":"attributes_count"}]},"Attribute":{"label":"'name #' + name_index","fields":[{"name":"name_index","type":"u16"},{"name":"length","type":"u32"},{"name":"info","type":"bytes","length":"length"}]}},"flags":{"Access":{"0x1":"public","0x2":"private","0x4":"protected","0x8":"static","0x10":"final","0x20":"super/synchronized","0x40":"volatile/bridge","0x80":"transient/varargs","0x100":"native","0x200":"interface","0x400":"abstract","0x800":"strict","0x1000":"synthetic","0x2000":"annotation","0x4000":"enum","0x8000":"module"}}},{"id":"pcap","name":"PCAP network capture (tcpdump, Wireshark)","extensions":["pcap","cap","dmp"],"match":[[{"offset":0,"hex":"D4 C3 B2 A1"}],[{"offset":0,"hex":"A1 B2 C3 D4"}],[{"offset":0,"hex":"4D 3C B2 A1"}],[{"offset":0,"hex":"A1 B2 3C 4D"}]],"endian":"big","structs":{"File":[{"name":"magic","type":"u32","format":"hex","enum":{"0xA1B2C3D4":"Microseconds, big-endian","0xD4C3B2A1":"Microseconds, little-endian","0xA1B23C4D":"Nanoseconds, big-endian","0x4D3CB2A1":"Nanoseconds, little-endian"}},{"name":"capture","type":"Capture"}],"Capture":{"endian":"magic == 0xD4C3B2A1 || magic == 0x4D3CB2A1 ? 'little' : 'big'","fields":[{"name":"version_major","type":"u16"},{"name":"version_minor","type":"u16"},{"name":"thiszone","type":"i32"},{"name":"sigfigs","type":"u32"},{"name":"snaplen","type":"u32"},{"name":"link_type","type":"u32","enum":{"0":"BSD loopback","1":"Ethernet","101":"Raw IP","105":"802.11","113":"Linux cooked (SLL)","127":"802.11 radiotap","228":"IPv4","229":"IPv6","276":"Linux cooked v2"}},{"name":"packets","type":"Packet","until":"eof"}]},"Packet":{"label":"incl_len + ' bytes'","fields":[{"name":"ts_sec","type":"u32","format":"unix"},{"name":"ts_frac","type":"u32","comment":"Microseconds or nanoseconds (see magic)"},{"name":"incl_len","type":"u32"},{"name":"orig_len","type":"u32"},{"name":"data","type":"bytes","length":"incl_len"}]}}},{"id":"uf2","name":"UF2 firmware file (USB flashing format)","extensions":["uf2"],"match":[[{"offset":0,"hex":"55 46 32 0A 57 51 5D 9E"},{"offset":508,"hex":"30 6F B1 0A"}]],"endian":"little","structs":{"File":[{"name":"flags","type":"u32","flags":"Flags","at":8,"peek":true,"comment":"Flags of the first block"},{"name":"target_address","type":"u32","format":"hex","at":12,"peek":true,"comment":"Flash address of the first block"},{"name":"payload_size","type":"u32","at":16,"peek":true,"comment":"Data bytes in the first block (256 for most boards)"},{"name":"num_blocks","type":"u32","at":24,"peek":true,"comment":"Blocks in this file, from the first block"},{"name":"family_id","type":"u32","enum":"Family","at":28,"peek":true,"if":"(u32le(8) & 0x2000) != 0","comment":"The board family the firmware is for"},{"name":"file_size","type":"u32","at":28,"peek":true,"if":"(u32le(8) & 0x2000) == 0","comment":"Without the family ID flag this word is the file size, or 0"},{"name":"blocks_in_file","value":"size() // 512","format":"dec"},{"name":"blocks","type":"Block","count":"min(size() // 512, 2048)","comment":"The first 2,048 blocks are shown."}],"Block":{"size":512,"label":"hex(target_address)","fields":[{"name":"magic_start0","type":"u32","format":"hex","expect":171066965},{"name":"magic_start1","type":"u32","format":"hex","expect":2656915799},{"name":"flags","type":"u32","flags":"Flags"},{"name":"target_address","type":"u32","format":"hex"},{"name":"payload_size","type":"u32"},{"name":"block_no","type":"u32"},{"name":"num_blocks","type":"u32"},{"name":"family_id","type":"u32","enum":"Family","if":"(flags & 0x2000) != 0"},{"name":"file_size","type":"u32","if":"(flags & 0x2000) == 0"},{"name":"data","type":"bytes","length":"min(payload_size, 476)"},{"seek":"start() + 508"},{"name":"magic_end","type":"u32","format":"hex","expect":179400496}]}},"enums":{"Family":{"0x68ED2B88":"Microchip SAMD21","0x55114460":"Microchip SAMD51","0xE48BFF56":"Raspberry Pi RP2040","0xE48BFF59":"Raspberry Pi RP2350 (Arm, secure)","0xE48BFF5A":"Raspberry Pi RP2350 (RISC-V)","0xE48BFF5B":"Raspberry Pi RP2350 (Arm, non-secure)","0xADA52840":"Nordic nRF52840","0x1B57745F":"Nordic nRF52","0x1C5F21B0":"Espressif ESP32","0xBFDD4EEE":"Espressif ESP32-S2","0xD42BA06C":"Espressif ESP32-C3","0xC47E5767":"Espressif ESP32-S3","0x540DDF62":"Espressif ESP32-C6","0x332726F6":"Espressif ESP32-H2","0x5EE21072":"ST STM32F1","0x57755A57":"ST STM32F401","0x6DB66082":"ST STM32F407","0x53B80F00":"ST STM32F7","0x00FF6919":"ST STM32L4","0x4FB2D5BD":"NXP i.MX RT10xx","0x2ABC77EC":"NXP LPC55xx","0x16573617":"Microchip ATmega32"}},"flags":{"Flags":{"0x1":"NOT_MAIN_FLASH","0x1000":"FILE_CONTAINER","0x2000":"FAMILY_ID","0x4000":"MD5_CHECKSUM","0x8000":"EXTENSION_TAGS"}}},{"id":"fdt","name":"Device tree blob (DTB, flattened device tree)","extensions":["dtb","dtbo"],"match":[[{"offset":0,"hex":"D0 0D FE ED"},{"offset":20,"type":"u32","endian":"big","min":1,"max":64}]],"endian":"big","structs":{"File":[{"name":"magic","type":"u32","format":"hex","expect":3490578157},{"name":"totalsize","type":"u32"},{"name":"off_dt_struct","type":"u32","format":"hex"},{"name":"off_dt_strings","type":"u32","format":"hex"},{"name":"off_mem_rsvmap","type":"u32","format":"hex"},{"name":"version","type":"u32"},{"name":"last_comp_version","type":"u32"},{"name":"boot_cpuid_phys","type":"u32","if":"version >= 2"},{"name":"size_dt_strings","type":"u32","if":"version >= 3"},{"name":"size_dt_struct","type":"u32","if":"version >= 17"},{"name":"memory_reservations","type":"Reservation","count":"min(1024, (size() - off_mem_rsvmap) // 16)","until":"_.address == 0 && _.size_ == 0","at":"off_mem_rsvmap","peek":true,"if":"off_mem_rsvmap > 0 && off_mem_rsvmap + 16 <= size()"},{"name":"root_node","type":"Node","at":"off_dt_struct","if":"off_dt_struct > 0 && off_dt_struct + 4 <= size() && u32(off_dt_struct) == 1"}],"Reservation":{"label":"hex(address)","fields":[{"name":"address","type":"u64","format":"hex"},{"name":"size_","type":"u64"}]},"Node":{"label":"name == '' ? '/' : name","fields":[{"name":"token","type":"u32","enum":"Token","expect":1},{"name":"name","type":"zstring","length":256},{"align":4},{"name":"items","type":{"switch":"u32(pos())","cases":{"1":"Node","3":"Prop","4":"Nop"},"default":"Unknown"},"while":"u32(pos()) != 2 && u32(pos()) != 9","count":8192},{"name":"end","type":"u32","enum":"Token","expect":2}]},"Prop":{"label":"prop_name","fields":[{"name":"token","type":"u32","enum":"Token"},{"name":"len","type":"u32"},{"name":"nameoff","type":"u32"},{"name":"prop_name","type":"zstring","length":256,"at":"off_dt_strings + nameoff","peek":true,"if":"off_dt_strings + nameoff < size()"},{"name":"text","type":"zstring","length":"len","peek":true,"if":"len > 1 && pos() + len <= size() && u8(pos() + len - 1) == 0 && u8(pos()) >= 32 && u8(pos()) < 127"},{"name":"cell","type":"u32","format":"hex","peek":true,"if":"len == 4"},{"name":"value","type":"bytes","length":"len"},{"align":4}]},"Nop":[{"name":"token","type":"u32","enum":"Token"}],"Unknown":[{"name":"token","type":"u32","enum":"Token","comment":"Not a token this place allows"}]},"enums":{"Token":{"1":"BEGIN_NODE","2":"END_NODE","3":"PROP","4":"NOP","9":"END"}}},{"id":"uimage","name":"U-Boot legacy image (uImage)","extensions":["uimg","uimage","ub"],"match":[[{"offset":0,"hex":"27 05 19 56"}]],"endian":"big","structs":{"File":[{"name":"ih_magic","type":"u32","format":"hex","expect":654645590},{"name":"ih_hcrc","type":"u32","format":"hex","comment":"CRC-32 of the 64-byte header, with this field set to 0"},{"name":"ih_time","type":"u32","format":"unix"},{"name":"ih_size","type":"u32","comment":"Size of the image data"},{"name":"ih_load","type":"u32","format":"hex","comment":"Load address"},{"name":"ih_ep","type":"u32","format":"hex","comment":"Entry point"},{"name":"ih_dcrc","type":"u32","format":"hex","comment":"CRC-32 of the image data"},{"name":"ih_os","type":"u8","enum":"Os"},{"name":"ih_arch","type":"u8","enum":"Arch"},{"name":"ih_type","type":"u8","enum":"Type"},{"name":"ih_comp","type":"u8","enum":"Comp"},{"name":"ih_name","type":"char","length":32},{"name":"data","type":"bytes","length":"ih_size","if":"ih_type != 4"},{"name":"image_sizes","type":"u32","count":64,"until":"_ == 0","if":"ih_type == 4","comment":"Multi-file image: one size per part, then 0"},{"name":"parts","type":"Part","count":"image_sizes.length - 1","if":"ih_type == 4"}],"Part":[{"name":"data","type":"bytes","length":"image_sizes[i]"},{"align":4}]},"enums":{"Os":{"0":"Invalid","1":"OpenBSD","2":"NetBSD","3":"FreeBSD","5":"Linux","14":"VxWorks","16":"QNX","17":"U-Boot","18":"RTEMS","25":"ARM Trusted Firmware","26":"TEE","27":"OpenSBI","28":"EFI"},"Arch":{"0":"Invalid","1":"Alpha","2":"ARM","3":"x86","4":"IA-64","5":"MIPS","6":"MIPS64","7":"PowerPC","8":"S390","9":"SuperH","10":"SPARC","11":"SPARC64","12":"M68K","14":"MicroBlaze","15":"Nios II","16":"Blackfin","17":"AVR32","19":"Sandbox","20":"NDS32","21":"OpenRISC","22":"ARM64","23":"ARC","24":"x86-64","25":"Xtensa","26":"RISC-V"},"Type":{"0":"Invalid","1":"Standalone program","2":"OS kernel","3":"RAM disk","4":"Multi-file image","5":"Firmware","6":"Script","7":"Filesystem","8":"Flat device tree","14":"OS kernel (no load)"},"Comp":{"0":"None","1":"gzip","2":"bzip2","3":"LZMA","4":"LZO","5":"LZ4","6":"Zstandard"}}},{"id":"bootimg","name":"Android boot image (boot.img, recovery.img)","extensions":[],"match":[[{"offset":0,"text":"ANDROID!"}]],"endian":"little","structs":{"File":[{"name":"magic","type":"char","length":8,"expect":"ANDROID!"},{"name":"hv","hidden":true,"value":"size() >= 44 ? u32le(40) : 0"},{"name":"kernel_size","type":"u32"},{"name":"kernel_addr","type":"u32","format":"hex","if":"hv < 3"},{"name":"ramdisk_size","type":"u32"},{"name":"ramdisk_addr","type":"u32","format":"hex","if":"hv < 3"},{"name":"second_size","type":"u32","if":"hv < 3"},{"name":"second_addr","type":"u32","format":"hex","if":"hv < 3"},{"name":"tags_addr","type":"u32","format":"hex","if":"hv < 3"},{"name":"page_size","type":"u32","if":"hv < 3"},{"name":"os_version","type":"u32","format":"hex","if":"hv >= 3"},{"name":"header_size","type":"u32","if":"hv >= 3"},{"name":"reserved","type":"u32","count":4,"if":"hv >= 3"},{"name":"header_version","type":"u32"},{"name":"os_version","type":"u32","format":"hex","if":"hv < 3"},{"name":"name","type":"char","length":16,"if":"hv < 3"},{"name":"cmdline","type":"char","length":512,"if":"hv < 3"},{"name":"id","type":"bytes","length":32,"if":"hv < 3","comment":"SHA-1 or SHA-256 of the parts"},{"name":"extra_cmdline","type":"char","length":1024,"if":"hv < 3"},{"name":"recovery_dtbo_size","type":"u32","if":"hv == 1 || hv == 2"},{"name":"recovery_dtbo_offset","type":"u64","format":"hex","if":"hv == 1 || hv == 2"},{"name":"header_size","type":"u32","if":"hv == 1 || hv == 2"},{"name":"dtb_size","type":"u32","if":"hv == 2"},{"name":"dtb_addr","type":"u64","format":"hex","if":"hv == 2"},{"name":"cmdline","type":"char","length":1536,"if":"hv >= 3"},{"name":"signature_size","type":"u32","if":"hv >= 4"},{"name":"android_version","value":"str((os_version >> 25) & 127) + '.' + str((os_version >> 18) & 127) + '.' + str((os_version >> 11) & 127)","if":"os_version != 0"},{"name":"security_patch","value":"str(((os_version >> 4) & 127) + 2000) + '-' + ((os_version & 15) < 10 ? '0' : '') + str(os_version & 15)","if":"os_version != 0"},{"name":"page","hidden":true,"value":"hv < 3 ? page_size : 4096"},{"name":"kernel_pages","hidden":true,"value":"page > 0 ? (kernel_size + page - 1) // page : 0"},{"name":"ramdisk_pages","hidden":true,"value":"page > 0 ? (ramdisk_size + page - 1) // page : 0"},{"name":"second_pages","hidden":true,"value":"hv < 3 && page > 0 ? (second_size + page - 1) // page : 0"},{"name":"kernel","type":"bytes","length":"kernel_size","at":"page","peek":true,"if":"page > 0 && kernel_size > 0"},{"name":"ramdisk","type":"bytes","length":"ramdisk_size","at":"page * (1 + kernel_pages)","peek":true,"if":"page > 0 && ramdisk_size > 0"},{"name":"second","type":"bytes","length":"second_size","at":"page * (1 + kernel_pages + ramdisk_pages)","peek":true,"if":"hv < 3 && page > 0 && second_size > 0"},{"name":"recovery_dtbo","type":"bytes","length":"recovery_dtbo_size","at":"recovery_dtbo_offset","peek":true,"if":"(hv == 1 || hv == 2) && recovery_dtbo_size > 0"},{"name":"dtb","type":"bytes","length":"dtb_size","at":"page * (1 + kernel_pages + ramdisk_pages + second_pages + (recovery_dtbo_size + page - 1) // max(page, 1))","peek":true,"if":"hv == 2 && page > 0 && dtb_size > 0"}]}},{"id":"wasm","name":"WebAssembly module (.wasm)","extensions":["wasm"],"match":[[{"offset":0,"hex":"00 61 73 6D"}]],"endian":"little","structs":{"File":[{"name":"magic","type":"bytes","length":4,"expect":"00 61 73 6D"},{"name":"version","type":"u32","comment":"1 for a core module"},{"name":"sections","type":"Section","until":"eof"}],"Section":{"label":"id","fields":[{"name":"id","type":"u8","enum":"SectionId"},{"name":"size_","type":"uleb128"},{"name":"body","size":"size_","type":{"switch":"id","cases":{"0":"CustomSec","1":"TypeSec","2":"ImportSec","3":"FunctionSec","5":"MemorySec","7":"ExportSec","8":"StartSec","10":"CodeSec","11":"DataSec","12":"DataCountSec"},"default":"RawSec"}}]},"RawSec":[{"name":"bytes","type":"bytes","length":"end() - pos()"}],"CustomSec":{"label":"name","fields":[{"name":"name_len","type":"uleb128"},{"name":"name","type":"string","length":"name_len"},{"name":"data","type":"bytes","length":"end() - pos()"}]},"TypeSec":[{"name":"count","type":"uleb128"},{"name":"types","type":"FuncType","count":"min(count, 10000)"}],"FuncType":[{"name":"form","type":"u8","format":"hex","expect":96},{"name":"param_count","type":"uleb128"},{"name":"params","type":"u8","enum":"ValType","count":"param_count"},{"name":"result_count","type":"uleb128"},{"name":"results","type":"u8","enum":"ValType","count":"result_count"}],"ImportSec":[{"name":"count","type":"uleb128"},{"name":"imports","type":"Import","count":"min(count, 10000)"}],"Import":{"label":"module + '.' + field","fields":[{"name":"module_len","type":"uleb128"},{"name":"module","type":"string","length":"module_len"},{"name":"field_len","type":"uleb128"},{"name":"field","type":"string","length":"field_len"},{"name":"kind","type":"u8","enum":"ExternKind"},{"name":"type_index","type":"uleb128","if":"kind == 0"},{"name":"table_type","type":"u8","enum":"ValType","if":"kind == 1"},{"name":"limits","type":"Limits","if":"kind == 1 || kind == 2"},{"name":"global_type","type":"u8","enum":"ValType","if":"kind == 3"},{"name":"mutable","type":"u8","if":"kind == 3"},{"name":"tag_attribute","type":"u8","if":"kind == 4"},{"name":"tag_type_index","type":"uleb128","if":"kind == 4"}]},"Limits":[{"name":"flags","type":"u8","format":"hex"},{"name":"min","type":"uleb128"},{"name":"max","type":"uleb128","if":"(flags & 1) != 0"}],"FunctionSec":[{"name":"count","type":"uleb128"},{"name":"type_indices","type":"uleb128","count":"min(count, 20000)"}],"MemorySec":[{"name":"count","type":"uleb128"},{"name":"memories","type":"Limits","count":"min(count, 100)"}],"ExportSec":[{"name":"count","type":"uleb128"},{"name":"exports","type":"Export","count":"min(count, 10000)"}],"Export":{"label":"name","fields":[{"name":"name_len","type":"uleb128"},{"name":"name","type":"string","length":"name_len"},{"name":"kind","type":"u8","enum":"ExternKind"},{"name":"index","type":"uleb128"}]},"StartSec":[{"name":"function_index","type":"uleb128"}],"CodeSec":[{"name":"count","type":"uleb128"},{"name":"bodies","type":"Body","count":"min(count, 10000)"}],"Body":[{"name":"size_","type":"uleb128"},{"name":"code","type":"bytes","length":"size_"}],"DataSec":[{"name":"count","type":"uleb128"},{"name":"segments","type":"bytes","length":"end() - pos()"}],"DataCountSec":[{"name":"count","type":"uleb128"}]},"enums":{"SectionId":{"0":"custom","1":"type","2":"import","3":"function","4":"table","5":"memory","6":"global","7":"export","8":"start","9":"element","10":"code","11":"data","12":"data count","13":"tag"},"ValType":{"0x7F":"i32","0x7E":"i64","0x7D":"f32","0x7C":"f64","0x7B":"v128","0x70":"funcref","0x6F":"externref"},"ExternKind":{"0":"function","1":"table","2":"memory","3":"global","4":"tag"}}},{"id":"dex","name":"Android DEX file (Dalvik bytecode)","extensions":["dex"],"match":[[{"offset":0,"hex":"64 65 78 0A"},{"offset":7,"hex":"00"}]],"endian":"little","structs":{"File":[{"name":"magic","type":"char","length":8,"comment":"dex, a line break, the format version and a zero byte"},{"name":"checksum","type":"u32","format":"hex","comment":"Adler-32 of the rest of the file"},{"name":"signature","type":"bytes","length":20,"comment":"SHA-1 of the rest of the file"},{"name":"file_size","type":"u32"},{"name":"header_size","type":"u32"},{"name":"endian_tag","type":"u32","format":"hex","expect":305419896},{"name":"link_size","type":"u32"},{"name":"link_off","type":"u32","format":"hex"},{"name":"map_off","type":"u32","format":"hex"},{"name":"string_ids_size","type":"u32"},{"name":"string_ids_off","type":"u32","format":"hex"},{"name":"type_ids_size","type":"u32"},{"name":"type_ids_off","type":"u32","format":"hex"},{"name":"proto_ids_size","type":"u32"},{"name":"proto_ids_off","type":"u32","format":"hex"},{"name":"field_ids_size","type":"u32"},{"name":"field_ids_off","type":"u32","format":"hex"},{"name":"method_ids_size","type":"u32"},{"name":"method_ids_off","type":"u32","format":"hex"},{"name":"class_defs_size","type":"u32"},{"name":"class_defs_off","type":"u32","format":"hex"},{"name":"data_size","type":"u32"},{"name":"data_off","type":"u32","format":"hex"},{"name":"string_ids","type":"StringId","count":"min(string_ids_size, 2000)","at":"string_ids_off","peek":true,"if":"string_ids_size > 0 && string_ids_off + 4 <= size()"},{"name":"type_ids","type":"TypeId","count":"min(type_ids_size, 1500)","at":"type_ids_off","peek":true,"if":"type_ids_size > 0 && type_ids_off + 4 <= size() && string_ids_size > 0 && string_ids_off + 4 <= size()"},{"name":"proto_ids","type":"ProtoId","count":"min(proto_ids_size, 500)","at":"proto_ids_off","peek":true,"if":"proto_ids_size > 0 && proto_ids_off + 12 <= size() && string_ids_size > 0 && string_ids_off + 4 <= size()"},{"name":"field_ids","type":"FieldId","count":"min(field_ids_size, 1000)","at":"field_ids_off","peek":true,"if":"field_ids_size > 0 && field_ids_off + 8 <= size() && string_ids_size > 0 && string_ids_off + 4 <= size()"},{"name":"method_ids","type":"MethodId","count":"min(method_ids_size, 1500)","at":"method_ids_off","peek":true,"if":"method_ids_size > 0 && method_ids_off + 8 <= size() && string_ids_size > 0 && string_ids_off + 4 <= size()"},{"name":"class_defs","type":"ClassDef","count":"min(class_defs_size, 500)","at":"class_defs_off","peek":true,"if":"class_defs_size > 0 && class_defs_off + 32 <= size() && type_ids_size > 0 && type_ids_off + 4 <= size() && string_ids_size > 0 && string_ids_off + 4 <= size()"},{"name":"map_list","type":"MapList","at":"map_off","peek":true,"if":"map_off > 0 && map_off + 4 <= size()"}],"StringId":{"label":"string_data_off > 0 && string_data_off < size() ? text : ''","fields":[{"name":"string_data_off","type":"u32","format":"hex"},{"name":"utf16_size","type":"uleb128","at":"string_data_off","peek":true,"if":"string_data_off > 0 && string_data_off < size()"},{"name":"text","type":"zstring","length":1024,"at":"string_data_off + utf16_size.size","peek":true,"if":"string_data_off > 0 && string_data_off < size()"},{"name":"text","hidden":true,"value":"''","if":"!(string_data_off > 0 && string_data_off < size())"}]},"TypeId":{"label":"desc","fields":[{"name":"descriptor_idx","type":"u32"},{"name":"desc","hidden":true,"value":"descriptor_idx < string_ids.length ? string_ids[descriptor_idx].text : ''"},{"name":"descriptor","value":"desc"}]},"ProtoId":{"label":"shorty_idx < string_ids.length ? string_ids[shorty_idx].text : ''","fields":[{"name":"shorty_idx","type":"u32"},{"name":"return_type_idx","type":"u32"},{"name":"parameters_off","type":"u32","format":"hex"},{"name":"shorty","value":"shorty_idx < string_ids.length ? string_ids[shorty_idx].text : ''"}]},"FieldId":{"label":"name_idx < string_ids.length ? string_ids[name_idx].text : ''","fields":[{"name":"class_idx","type":"u16"},{"name":"type_idx","type":"u16"},{"name":"name_idx","type":"u32"},{"name":"name","value":"name_idx < string_ids.length ? string_ids[name_idx].text : ''"}]},"MethodId":{"label":"name_idx < string_ids.length ? string_ids[name_idx].text : ''","fields":[{"name":"class_idx","type":"u16"},{"name":"proto_idx","type":"u16"},{"name":"name_idx","type":"u32"},{"name":"name","value":"name_idx < string_ids.length ? string_ids[name_idx].text : ''"}]},"ClassDef":{"label":"class_idx < type_ids.length ? type_ids[class_idx].desc : ''","fields":[{"name":"class_idx","type":"u32"},{"name":"access_flags","type":"u32","flags":"Access"},{"name":"superclass_idx","type":"u32"},{"name":"interfaces_off","type":"u32","format":"hex"},{"name":"source_file_idx","type":"u32"},{"name":"annotations_off","type":"u32","format":"hex"},{"name":"class_data_off","type":"u32","format":"hex"},{"name":"static_values_off","type":"u32","format":"hex"},{"name":"class_name","value":"class_idx < type_ids.length ? type_ids[class_idx].desc : ''"}]},"MapList":[{"name":"size_","type":"u32"},{"name":"items","type":"MapItem","count":"min(size_, 64)"}],"MapItem":{"label":"type","fields":[{"name":"type","type":"u16","enum":"MapType"},{"name":"unused","type":"u16"},{"name":"size_","type":"u32"},{"name":"offset","type":"u32","format":"hex"}]}},"enums":{"MapType":{"0x0":"header_item","0x1":"string_id_item","0x2":"type_id_item","0x3":"proto_id_item","0x4":"field_id_item","0x5":"method_id_item","0x6":"class_def_item","0x7":"call_site_id_item","0x8":"method_handle_item","0x1000":"map_list","0x1001":"type_list","0x1002":"annotation_set_ref_list","0x1003":"annotation_set_item","0x2000":"class_data_item","0x2001":"code_item","0x2002":"string_data_item","0x2003":"debug_info_item","0x2004":"annotation_item","0x2005":"encoded_array_item","0x2006":"annotations_directory_item","0xF000":"hiddenapi_class_data_item"}},"flags":{"Access":{"0x1":"public","0x2":"private","0x4":"protected","0x8":"static","0x10":"final","0x20":"synchronized","0x200":"interface","0x400":"abstract","0x1000":"synthetic","0x2000":"annotation","0x4000":"enum"}}}];
g.ZovoHex = { template: req("./template"), bytes: req("./bytes"), BUILTIN: BUILTIN, source: "0.3.4 exec13-0.3.4" };
})(typeof self !== "undefined" ? self : globalThis);
