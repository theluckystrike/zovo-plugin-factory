/* Zovo Linker Map Viewer Online (TOOLCHK3, wave18): background worker. The modules below are src/core of the Linker
   Map Viewer extension for VS Code (zovo-linker-map-viewer 0.2.1, MIT), unchanged. The map is read in 4 MB slices
   and parsed line by line; nothing in it is run. Only pages of rows go back to the page. */
'use strict';
const __mods = {};
function __def(name, fn) { __mods[name] = { fn, module: null }; }
function require(name) {
  const k = String(name).replace(/^\.\//, '');
  const m = __mods[k];
  if (!m) throw new Error('no module ' + name);
  if (!m.module) { m.module = { exports: {} }; m.fn(m.module, m.module.exports); }
  return m.module.exports;
}
__def('store', function (module, exports) {
'use strict';
// Column storage for large maps. A 200 MB map has millions of rows, so rows live in typed arrays, not objects.
// Addresses are 64-bit: they are kept as two 32-bit halves (hi, lo), because a double loses the low bits of
// kernel addresses such as 0xffffffff81000000.

class Col {
  constructor(T, n = 1024) { this.T = T; this.a = new T(n); this.n = 0; }
  push(v) {
    if (this.n === this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = v;
    return this.n - 1;
  }
  get(i) { return this.a[i]; }
  set(i, v) { this.a[i] = v; }
  get length() { return this.n; }
  /** Trim to length (keeps memory small once parsing is done). */
  seal() { if (this.a.length !== this.n) this.a = this.a.slice(0, this.n); return this; }
}

/** Interned strings: section names and object paths repeat a lot. */
class Strings {
  constructor() { this.map = new Map(); this.list = []; }
  id(s) {
    let i = this.map.get(s);
    if (i === undefined) { i = this.list.length; this.list.push(s); this.map.set(s, i); }
    return i;
  }
  get(i) { return this.list[i]; }
  has(s) { return this.map.has(s); }
  get length() { return this.list.length; }
}

const TWO32 = 4294967296;

/** Parse a hex address (no 0x; IAR apostrophes and _ already removed) into [hi, lo]. */
function hexPair(s) {
  if (s.length <= 8) return [0, parseInt(s, 16) >>> 0];
  const cut = s.length - 8;
  return [parseInt(s.slice(0, cut), 16) >>> 0, parseInt(s.slice(cut), 16) >>> 0];
}

/** a - b for two [hi, lo] addresses, exact while the result fits in 2^53. */
function subPair(ahi, alo, bhi, blo) { return (ahi - bhi) * TWO32 + (alo - blo); }

/** [hi, lo] + n (n >= 0, n < 2^53). */
function addPair(hi, lo, n) {
  const s = lo + n;
  const carry = Math.floor(s / TWO32);
  return [(hi + carry) >>> 0, (s - carry * TWO32) >>> 0];
}

function pairToBig(hi, lo) { return (BigInt(hi) << 32n) | BigInt(lo); }

/** Hex text of an address: 8 digits for 32-bit, 16 when the high half is used. */
function hexText(hi, lo) {
  const l = lo.toString(16).padStart(8, '0');
  return '0x' + (hi ? hi.toString(16).padStart(8, '0') + l : l);
}

function cmpPair(ahi, alo, bhi, blo) { return ahi !== bhi ? (ahi < bhi ? -1 : 1) : (alo < blo ? -1 : alo > blo ? 1 : 0); }

module.exports = { Col, Strings, hexPair, subPair, addPair, pairToBig, hexText, cmpPair, TWO32 };

});
__def('model', function (module, exports) {
'use strict';
// The parsed map: memory regions, output sections, input sections (one per object file contribution),
// symbols and discarded sections, with the totals the viewer shows. Built by the parsers in parse.js.
const { Col, Strings, hexPair, subPair, addPair, pairToBig, hexText, cmpPair } = require('./store');

const CAT = ['Code', 'RO data', 'RW data', 'Zero-init', 'Other', 'Not loaded'];
const C_CODE = 0, C_RO = 1, C_DATA = 2, C_BSS = 3, C_OTHER = 4, C_NOALLOC = 5;

const IN_FILL = 1, IN_COMMON = 2, IN_LINKER = 4;
const SYM_EST = 1, SYM_SCRIPT = 2, SYM_LOCAL = 4, SYM_NEEDSIZE = 8;

const RE_NOALLOC = /^\.(debug|zdebug|stab|comment|ARM\.attributes|riscv\.attributes|gnu_debug|GCC\.command\.line|gnu\.attributes|line|symtab|strtab|shstrtab|xtensa\.info|mdebug|pdr|reginfo|MIPS\.abiflags|gnu\.warning|note\.GNU-stack|llvm_addrsig|llvm\.)|^\/DISCARD\/$/;
const RE_BSS = /(^|[._])(s?bss|tbss|noinit|no_init|uninit|heap|stack|zi|ZI|COMMON)(\b|_|$)|_user_heap_stack|^\.?ram_noinit|\$\$ZI|^ZI|^\.?zero/i;
const RE_RO = /rodata|rdata|const|\.ARM\.(exidx|extab)|eh_frame|gcc_except|init_array|fini_array|preinit_array|ctors|dtors|drom|flash\.appdesc|flash\.rodata|\.srodata|\.got|\.dynsym|\.dynstr|\.rel\.|\.rela\.|\.hash|\.gnu\.hash|\.note|\.eh_frame_hdr|\.interp/i;
const RE_CODE = /text|isr_vector|vectors?\b|vector_table|^\.init\b|^\.fini\b|iram|\.code|\.plt|irom|^\.boot|\.ramfunc|\.ram_code|\.itcm|veneer|\.glue_7|\.vfp11_veneer|\.v4_bx|\.iplt|^CODE|RESET/i;
const RE_DATA = /(^|\.)(s?data|tdata|dram|dtcm|got)(\b|\.|$)|\.data|\$\$RW|^RW_/i;

function classify(name, hasLoadCopy) {
  if (RE_NOALLOC.test(name)) return C_NOALLOC;
  if (RE_BSS.test(name)) return C_BSS;
  if (hasLoadCopy) return RE_CODE.test(name) && !/data/i.test(name) ? C_CODE : C_DATA; // a RAM copy loaded from flash costs both regions
  if (RE_RO.test(name)) return C_RO;
  if (RE_CODE.test(name)) return C_CODE;
  if (RE_DATA.test(name)) return C_DATA;
  return C_OTHER;
}

const RE_ARCHIVE = /^(.*?\.(?:a|lib|rlib|l|lib\w*))\((.+)\)$/;
function splitObject(p) {
  const m = RE_ARCHIVE.exec(p);
  if (m) return { archive: m[1], member: m[2] };
  return { archive: '', member: p };
}
function baseName(p) { const s = String(p).replace(/\\/g, '/'); return s.slice(s.lastIndexOf('/') + 1); }

class Model {
  constructor(format) {
    this.format = format; // 'gnu-ld' | 'lld' | 'iar' | 'keil'
    this.regions = []; // {name, originHi, originLo, length, attrs, max?}
    this.sections = []; // {name, hi, lo, size, lmaHi, lmaLo, hasLma, alloc, cat, rv, rl, fill, nIn}
    this.str = new Strings(); // input section names
    this.objs = new Strings(); // object paths
    this.inSec = new Col(Int32Array); this.inObj = new Col(Int32Array); this.inName = new Col(Int32Array);
    this.inHi = new Col(Uint32Array); this.inLo = new Col(Uint32Array); this.inSize = new Col(Float64Array); this.inFlags = new Col(Uint8Array);
    this.symName = []; this.symHi = new Col(Uint32Array); this.symLo = new Col(Uint32Array); this.symSize = new Col(Float64Array);
    this.symIn = new Col(Int32Array); this.symSec = new Col(Int32Array); this.symFlags = new Col(Uint8Array);
    this.disName = []; this.disObj = []; this.disSize = [];
    this.why = new Map(); // archive member -> {by, sym}
    this.cref = null; // symbol name -> [object path, ...] (first = definition)
    this.warnings = [];
    this.toolSummary = []; // [{label, value}] numbers the toolchain printed itself (Keil, IAR, ld)
    this.loadRegions = []; // Keil load regions {name, hi, lo, size, max}
    this.extra = {}; // per-format notes
    this.inCat = null; // optional per-input kind (Keil, IAR: one execution region mixes code and data)
    this._symStart = -1; this._curIn = -1;
    this.done = false;
  }

  addRegion(name, originHex, lengthNum, attrs) {
    const [hi, lo] = hexPair(originHex);
    this.regions.push({ name, originHi: hi, originLo: lo, length: lengthNum, attrs: attrs || '' });
    return this.regions.length - 1;
  }

  addSection(name, hi, lo, size, lma) {
    this.endInput();
    const s = { name, hi, lo, size, lmaHi: hi, lmaLo: lo, hasLma: false, alloc: true, cat: C_OTHER, rv: -1, rl: -1, fill: 0, nIn: 0, sum: 0 };
    if (lma) { s.lmaHi = lma[0]; s.lmaLo = lma[1]; s.hasLma = lma[0] !== hi || lma[1] !== lo; }
    this.sections.push(s);
    return this.sections.length - 1;
  }

  /** Add an input section. Symbols added after this call belong to it until the next input or section. */
  addInput(sec, obj, name, hi, lo, size, flags = 0) {
    this.endInput();
    const i = this.inSec.push(sec);
    this.inObj.push(this.objs.id(obj || '')); this.inName.push(this.str.id(name || ''));
    this.inHi.push(hi); this.inLo.push(lo); this.inSize.push(size); this.inFlags.push(flags);
    if (sec >= 0) { const s = this.sections[sec]; s.nIn++; if (flags & IN_FILL) s.fill += size; }
    this._curIn = i; this._symStart = this.symName.length;
    return i;
  }

  /** flags: SYM_NEEDSIZE asks for a size from the gap to the next symbol of the same input section. */
  addSymbol(name, hi, lo, size, flags = 0, sec = -1) {
    const inp = (flags & SYM_SCRIPT) ? -1 : this._curIn;
    this.symName.push(name); this.symHi.push(hi); this.symLo.push(lo); this.symSize.push(size);
    this.symIn.push(inp); this.symSec.push(sec >= 0 ? sec : (inp >= 0 ? this.inSec.get(inp) : this.sections.length - 1));
    this.symFlags.push(flags);
    return this.symName.length - 1;
  }

  setInputCat(i, cat) {
    if (!this.inCat) { this.inCat = new Col(Int8Array, Math.max(1024, this.inSec.length * 2)); }
    while (this.inCat.length < i) this.inCat.push(-1);
    if (this.inCat.length === i) this.inCat.push(cat); else this.inCat.set(i, cat);
  }

  addDiscarded(name, obj, size) { this.disName.push(name); this.disObj.push(obj); this.disSize.push(size); }

  /** Close the current input section: give sizes to its symbols from the gaps between their addresses. */
  endInput() {
    const i = this._curIn;
    if (i < 0) return;
    this._curIn = -1;
    const a = this._symStart, b = this.symName.length;
    this._symStart = -1;
    if (b <= a) return;
    const ihi = this.inHi.get(i), ilo = this.inLo.get(i), end = this.inSize.get(i);
    let cur = end, bound = end;
    for (let k = b - 1; k >= a; k--) {
      const f = this.symFlags.get(k);
      if (this.symIn.get(k) !== i) continue;
      const off = subPair(this.symHi.get(k), this.symLo.get(k), ihi, ilo);
      if (off < cur) { bound = cur; cur = off; }
      if (f & SYM_NEEDSIZE) {
        const sz = off >= 0 && off <= end ? Math.max(0, Math.min(bound, end) - off) : 0;
        this.symSize.set(k, sz);
        this.symFlags.set(k, (f & ~SYM_NEEDSIZE) | SYM_EST);
      }
    }
  }

  inRegion(r, hi, lo, size) {
    const a = pairToBig(hi, lo), o = pairToBig(r.originHi, r.originLo);
    return a >= o && a < o + BigInt(Math.max(0, r.length)) && (size === undefined || a + BigInt(size) <= o + BigInt(r.length) + 1n);
  }

  regionOf(hi, lo) {
    for (let i = 0; i < this.regions.length; i++) if (this.inRegion(this.regions[i], hi, lo)) return i;
    return -1;
  }

  finish() {
    this.endInput();
    if (this.done) return this;
    this.done = true;
    for (const c of [this.inSec, this.inObj, this.inName, this.inHi, this.inLo, this.inSize, this.inFlags, this.symHi, this.symLo, this.symSize, this.symIn, this.symSec, this.symFlags]) c.seal();
    const nS = this.sections.length, nR = this.regions.length;
    // sections: allocated or not, kind, region
    for (const s of this.sections) {
      if (s.alloc && RE_NOALLOC.test(s.name)) s.alloc = false;
      if (s.alloc && s.cat === C_OTHER) s.cat = classify(s.name, s.hasLma && this.regionOf(s.lmaHi, s.lmaLo) !== this.regionOf(s.hi, s.lo));
      if (!s.alloc) s.cat = C_NOALLOC;
      if (s.cat === C_NOALLOC) s.alloc = false;
      if (s.alloc) {
        s.rv = this.regionOf(s.hi, s.lo);
        s.rl = s.hasLma && s.cat !== C_BSS && !s.noLmaRegion ? this.regionOf(s.lmaHi, s.lmaLo) : -1;
        if (s.rl === s.rv) s.rl = -1;
        // a section outside every region but with address 0 and regions elsewhere: not loaded (debug info in old scripts)
        if (s.rv < 0 && nR && s.hi === 0 && s.lo === 0 && s.cat === C_OTHER) { s.alloc = false; s.cat = C_NOALLOC; }
      }
    }
    // regions: used like ld --print-memory-usage (highest end - origin), and the sum of the sizes in it
    for (let r = 0; r < nR; r++) {
      const R = this.regions[r];
      R.used = 0; R.sum = 0; R.cats = [0, 0, 0, 0, 0];
      if (R.fixedUsed !== undefined) { R.used = R.fixedUsed; }
    }
    for (const s of this.sections) {
      if (!s.alloc || s.size <= 0) continue;
      for (const [r, hi, lo] of [[s.rv, s.hi, s.lo], [s.rl, s.lmaHi, s.lmaLo]]) {
        if (r < 0) continue;
        const R = this.regions[r];
        const endOff = subPair(hi, lo, R.originHi, R.originLo) + s.size;
        if (R.fixedUsed === undefined) R.used = Math.max(R.used, endOff);
        R.sum += s.size;
        R.cats[s.cat === C_NOALLOC ? C_OTHER : s.cat] += s.size;
      }
    }
    for (let i = 0; i < nS; i++) this.sections[i].sum = 0;
    for (let i = 0; i < this.inSec.length; i++) { const sec = this.inSec.a[i]; if (sec >= 0) this.sections[sec].sum += this.inSize.a[i]; }
    // totals: by section kind, or by input kind when the format gives one per row
    const tot = [0, 0, 0, 0, 0, 0];
    if (this.inCat) {
      while (this.inCat.length < this.inSec.length) this.inCat.push(-1);
      this.inCat.seal();
      for (let i = 0; i < this.inSec.length; i++) {
        const sec = this.inSec.a[i]; if (sec < 0) continue;
        const s = this.sections[sec];
        const c = this.inCat.a[i] >= 0 && s.alloc ? this.inCat.a[i] : s.cat;
        tot[c] += this.inSize.a[i];
      }
      for (const s of this.sections) { const rest = s.size - s.sum; if (rest > 0) tot[s.cat] += rest; }
      // region kinds from the inputs too
      for (const R of this.regions) R.cats = [0, 0, 0, 0, 0];
      for (let i = 0; i < this.inSec.length; i++) {
        const sec = this.inSec.a[i]; if (sec < 0) continue;
        const s = this.sections[sec]; if (!s.alloc) continue;
        const c = this.inCat.a[i] >= 0 ? this.inCat.a[i] : s.cat;
        if (s.rv >= 0) this.regions[s.rv].cats[c === C_NOALLOC ? C_OTHER : c] += this.inSize.a[i];
        if (s.rl >= 0) this.regions[s.rl].cats[c === C_NOALLOC ? C_OTHER : c] += this.inSize.a[i];
      }
    } else for (const s of this.sections) tot[s.cat] += s.size;
    this.totals = tot;
    // per object totals: by kind and by region
    const nO = this.objs.length;
    this.objCat = new Float64Array(nO * 6);
    this.objReg = new Float64Array(nO * Math.max(1, nR));
    this.objIn = new Uint32Array(nO);
    const n = this.inSec.length;
    for (let i = 0; i < n; i++) {
      const sec = this.inSec.a[i], o = this.inObj.a[i], sz = this.inSize.a[i];
      this.objIn[o]++;
      const s = sec >= 0 ? this.sections[sec] : null;
      const cat = s ? (this.inCat && this.inCat.a[i] >= 0 && s.alloc ? this.inCat.a[i] : s.cat) : C_OTHER;
      this.objCat[o * 6 + cat] += sz;
      if (s && s.alloc) {
        if (s.rv >= 0) this.objReg[o * nR + s.rv] += sz;
        if (s.rl >= 0) this.objReg[o * nR + s.rl] += sz;
      }
    }
    this.objInfo = this.objs.list.map(p => splitObject(p));
    this._cache = new Map();
    return this;
  }

  objTotal(o) { let t = 0; for (let c = 0; c < 5; c++) t += this.objCat[o * 6 + c]; return t; }

  get nInputs() { return this.inSec.length; }
  get nSymbols() { return this.symName.length; }
}

module.exports = { Model, CAT, C_CODE, C_RO, C_DATA, C_BSS, C_OTHER, C_NOALLOC, IN_FILL, IN_COMMON, IN_LINKER, SYM_EST, SYM_SCRIPT, SYM_LOCAL, SYM_NEEDSIZE, classify, splitObject, baseName, hexText, hexPair, addPair, subPair, cmpPair };

});
__def('parse', function (module, exports) {
'use strict';
// Streaming parsers for linker map files. Each parser takes one line at a time, so a 200 MB map never has to
// be in memory as one string. detect() picks the format from the first lines.
//   GNU ld (gcc, arm-none-eabi, ESP-IDF, Zephyr, Pico SDK, avr-gcc, riscv), LLVM lld (clang, Rust),
//   IAR ILINK, Keil / Arm Compiler armlink.
const { Model, IN_FILL, IN_COMMON, IN_LINKER, SYM_SCRIPT, SYM_LOCAL, SYM_NEEDSIZE, C_CODE, C_RO, C_DATA, C_BSS, C_OTHER } = require('./model');
const { hexPair, addPair } = require('./store');

const MAX_LINE = 256 * 1024; // longer lines are cut (and counted), so one huge line cannot stall the parser

const FORMAT_LABEL = { 'gnu-ld': 'GNU ld', lld: 'LLVM lld', iar: 'IAR ILINK', keil: 'Arm Compiler armlink (Keil)' };

/**
 * Look at the first lines of a file. Returns {format} or {notMap: reason}.
 * head: string with the first part of the file (64 KB or more).
 */
function sniff(head) {
  if (!head.length) return { empty: true };
  // binary: NUL bytes or many control characters
  let ctrl = 0;
  const n = Math.min(head.length, 65536);
  for (let i = 0; i < n; i++) {
    const c = head.charCodeAt(i);
    if (c === 0) return { binary: true };
    if (c < 9 || (c > 13 && c < 32) || c === 0xfffd) ctrl++;
  }
  if (ctrl > n * 0.02) return { binary: true };
  const t = head.replace(/^﻿/, '').trimStart();
  if (t[0] === '{' && /"mappings"\s*:/.test(t.slice(0, 1 << 20)) || /^\)\]\}'?\s*\{\s*"version"/.test(t)) return { sourceMap: true };
  if (t[0] === '{' || t[0] === '[') return { json: true };
  const f = detect(head);
  return f ? { format: f } : { unknown: true };
}

function detect(head) {
  const h = head.slice(0, 4 << 20);
  if (/IAR ELF Linker|\*\*\* PLACEMENT SUMMARY|\*\*\* MODULE SUMMARY|\*\*\* ENTRY LIST/.test(h)) return 'iar';
  if (/Component: (ARM|Arm) Compiler|Image Symbol Table|Memory Map of the image|Image component sizes|Execution Region \S+ \(/.test(h)) return 'keil';
  if (/^\s*(VMA\s+LMA|Address)\s+Size\s+Align\s+Out\s+In\s+Symbol\s*$/m.test(h)) return 'lld';
  if (/^(Archive member included (to satisfy reference by file|because of file) \(symbol\)|Allocating common symbols|Discarded input sections|Memory Configuration|Linker script and memory map|Cross Reference Table)\s*$/m.test(h)) return 'gnu-ld';
  // a map cut before its headings: GNU output sections and input sections
  if (/^\S+\s+0x[0-9a-fA-F]{8,16}\s+0x[0-9a-fA-F]+\s*$/m.test(h) && /^ \S+\s+0x[0-9a-fA-F]{8,16}\s+0x[0-9a-fA-F]+ \S/m.test(h)) return 'gnu-ld';
  return null;
}

// ---------------------------------------------------------------- GNU ld
const HEAD = new Map([
  ['Archive member included to satisfy reference by file (symbol)', 'archive'],
  ['Archive member included because of file (symbol)', 'archive'],
  ['As-needed library included to satisfy reference by file (symbol)', 'asneeded'],
  ['Allocating common symbols', 'common'],
  ['Discarded input sections', 'discarded'],
  ['Memory Configuration', 'memory'],
  ['Linker script and memory map', 'map'],
  ['Cross Reference Table', 'cref'],
]);
const RE_OUT = /^(\S+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s+load address 0x([0-9a-fA-F]+))?\s*$/;
const RE_NAME_ONLY = /^(\S+)\s*$/;
const RE_IN = /^ (\S+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s+(.*?))?\s*$/;
const RE_IN_NAME = /^ (\S+)\s*$/;
const RE_CONT = /^\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s+(.*?))?\s*$/;
const RE_SYM = /^\s{2,}0x([0-9a-fA-F]+)\s+(\S.*?)\s*$/;
const RE_DATA_STMT = /^\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)\s+(BYTE|SHORT|LONG|QUAD|SQUAD)\b/;
const RE_MEM = /^(\S+)\s+0x([0-9a-fA-F]+)\s+0x([0-9a-fA-F]+)(?:\s+(\S+))?\s*$/;
const RE_ASSIGN = /^(?:PROVIDE(?:_HIDDEN)?\s*\(\s*)?([A-Za-z_$.][\w$.]*)\s*=/;
const RE_ARCH = /^(\S.*?\))(?:\s+(.*?)\s+\((.*)\))?\s*$/;
const RE_ARCH_CONT = /^\s+(.*?)\s+\((.*)\)\s*$/;
const COL0_SKIP = /^(LOAD |START GROUP|END GROUP|OUTPUT\(|TARGET\(|INPUT\(|SEARCH_DIR\(|OUTPUT_FORMAT|OUTPUT_ARCH|ENTRY\(|GROUP\(|INSERT |NOCROSSREFS|\[!provide\])/;

class GnuParser {
  constructor() {
    this.m = new Model('gnu-ld');
    this.mode = 'pre';
    this.pend = null; // {kind:'out'|'in'|'dis', name}
    this.cur = -1; // current output section
    this.afterOutput = false;
    this.lastArch = null;
    this.crefSym = null;
    this.sawMap = false; this.sawOutput = false; this.sawMemory = false;
  }

  line(l) {
    if (l.length && l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1);
    const c0 = l.charCodeAt(0);
    if (c0 !== 32 && c0 !== 9 && l.length) {
      const h = HEAD.get(l.trimEnd());
      if (h) { this.flushPend(); this.m.endInput(); this.mode = h; if (h === 'map') this.sawMap = true; if (h === 'memory') this.sawMemory = true; if (h === 'cref') this.m.cref = new Map(); return; }
    }
    switch (this.mode) {
      case 'map': return this.mapLine(l, c0);
      case 'memory': return this.memLine(l);
      case 'discarded': return this.disLine(l);
      case 'archive': return this.archLine(l, c0);
      case 'cref': return this.crefLine(l, c0);
      case 'pre': return this.mapLine(l, c0); // a map cut before its headings
      default: return undefined;
    }
  }

  flushPend() { this.pend = null; }

  memLine(l) {
    const m = RE_MEM.exec(l);
    if (!m || m[1] === 'Name' || m[1] === '*default*') return;
    this.m.addRegion(m[1], m[2], parseInt(m[3], 16), m[4] || '');
  }

  disLine(l) {
    if (this.pend && this.pend.kind === 'dis') {
      const c = RE_CONT.exec(l);
      if (c) { this.m.addDiscarded(this.pend.name, c[3] || '', parseInt(c[2], 16)); this.pend = null; return; }
      this.pend = null;
    }
    const m = RE_IN.exec(l);
    if (m) { this.m.addDiscarded(m[1], m[4] || '', parseInt(m[3], 16)); return; }
    const n = RE_IN_NAME.exec(l);
    if (n) this.pend = { kind: 'dis', name: n[1] };
  }

  archLine(l, c0) {
    if (!l.trim()) return;
    if (c0 !== 32 && c0 !== 9) {
      const m = RE_ARCH.exec(l);
      if (m) { this.lastArch = m[1]; if (m[2] !== undefined) { this.m.why.set(m[1], { by: m[2], sym: m[3] }); this.lastArch = null; } }
      return;
    }
    if (this.lastArch) {
      const m = RE_ARCH_CONT.exec(l);
      if (m) this.m.why.set(this.lastArch, { by: m[1], sym: m[2] });
      this.lastArch = null;
    }
  }

  crefLine(l, c0) {
    const t = l.trim();
    if (!t) return;
    if (c0 !== 32 && c0 !== 9) {
      if (/^Symbol\s+File$/.test(t)) return;
      const m = /^(\S+)\s+(\S.*)$/.exec(l);
      if (m) { this.crefSym = m[1]; this.m.cref.set(m[1], [m[2].trim()]); } else { this.crefSym = t; this.m.cref.set(t, []); }
      return;
    }
    if (this.crefSym) { const a = this.m.cref.get(this.crefSym); if (a) a.push(t); }
  }

  mapLine(l, c0) {
    if (!l.length) return;
    // a pending name from the line before, with its address and size on this line
    if (this.pend) {
      const p = this.pend; this.pend = null;
      const c = RE_CONT.exec(l);
      if (c) {
        if (p.kind === 'out') {
          const rest = c[3] || '';
          const lm = /load address 0x([0-9a-fA-F]+)/.exec(rest);
          this.openOut(p.name, c[1], c[2], lm ? lm[1] : null);
        } else this.openIn(p.name, c[1], c[2], c[3] || '');
        return;
      }
    }
    if (c0 !== 32 && c0 !== 9) {
      if (COL0_SKIP.test(l)) { if (l.startsWith('OUTPUT(')) { this.afterOutput = true; this.sawOutput = true; this.m.endInput(); } return; }
      const m = RE_OUT.exec(l);
      if (m) { this.openOut(m[1], m[2], m[3], m[4]); return; }
      const n = RE_NAME_ONLY.exec(l);
      if (n) { this.m.endInput(); this.cur = -1; this.pend = { kind: 'out', name: n[1] }; }
      return;
    }
    if (l.charCodeAt(1) !== 32 && c0 === 32) {
      // " name addr size file" (input section) or " name" alone
      const m = RE_IN.exec(l);
      if (m) {
        if (m[2].length < 8 && /[()]/.test(l)) return; // " *(.text) ..." style lines never have two numbers
        this.openIn(m[1], m[2], m[3], m[4] || '');
        return;
      }
      const n = RE_IN_NAME.exec(l);
      if (n && !/[()]/.test(n[1]) && (n[1][0] !== '*' || n[1] === '*fill*')) { this.m.endInput(); this.pend = { kind: 'in', name: n[1] }; }
      else if (/^ \*\(|^ KEEP|^ SORT|^ EXCLUDE_FILE|^ FILL|^ \S+\(/.test(l)) this.m.endInput();
      return;
    }
    // indented: a symbol, an assignment, a data statement or "(size before relaxing)"
    const d = RE_DATA_STMT.exec(l);
    if (d) {
      if (this.cur >= 0) { const [hi, lo] = hexPair(d[1]); this.m.addInput(this.cur, '*linker*', d[3], hi, lo, parseInt(d[2], 16), IN_LINKER); }
      return;
    }
    const s = RE_SYM.exec(l);
    if (!s) return;
    const rest = s[2];
    const ch = rest.charCodeAt(0);
    if (ch === 40 /* ( */ || ch === 91 /* [ */) return;
    if (rest.startsWith('0x')) return;
    const [hi, lo] = hexPair(s[1]);
    if (rest.indexOf('=') >= 0 || rest.startsWith('PROVIDE')) {
      const a = RE_ASSIGN.exec(rest);
      if (a && a[1] !== '.' && this.cur >= 0 && !this.afterOutput) this.m.addSymbol(a[1], hi, lo, 0, SYM_SCRIPT, this.cur);
      return;
    }
    if (this.afterOutput || this.cur < 0) return;
    if (this.m._curIn < 0) { this.m.addSymbol(rest, hi, lo, 0, SYM_SCRIPT, this.cur); return; }
    this.m.addSymbol(rest, hi, lo, 0, SYM_NEEDSIZE);
  }

  openOut(name, addr, size, lma) {
    const [hi, lo] = hexPair(addr);
    this.cur = this.m.addSection(name, hi, lo, parseInt(size, 16), lma ? hexPair(lma) : null);
    if (this.afterOutput) this.m.sections[this.cur].alloc = false;
  }

  openIn(name, addr, size, file) {
    if (this.cur < 0) { this.m.endInput(); return; }
    const [hi, lo] = hexPair(addr);
    const sz = parseInt(size, 16);
    let flags = 0, obj = file.trim();
    if (name === '*fill*') { flags = IN_FILL; obj = '*fill*'; }
    else if (name === 'COMMON' || name === '.scommon' || name === 'COMMON.*') flags = IN_COMMON;
    else if (obj === '' || obj === 'linker stubs' || /^linker (stubs|created)/.test(obj)) { flags = IN_LINKER; obj = obj || '*linker*'; }
    this.m.addInput(this.cur, obj, name, hi, lo, sz, flags);
  }

  finish() {
    this.m.endInput();
    if (!this.sawMap && this.mode !== 'pre') this.m.warnings.push('The file has no "Linker script and memory map" part, so there are no sections. It may be cut short.');
    else if (this.sawMap && !this.sawOutput) this.m.warnings.push('The file ends before the OUTPUT(...) line of a GNU ld map, so it may be cut short. The totals cover the part that is there.');
    if (!this.sawMemory && this.m.sections.length) this.m.extra.noRegions = 'This map has no "Memory Configuration" table (the linker script has no MEMORY command), so there are no region bars.';
    return this.m.finish();
  }
}

// ---------------------------------------------------------------- LLVM lld
class LldParser {
  constructor() {
    this.m = new Model('lld');
    this.cols = null; this.hasLma = true; this.cur = -1;
  }
  line(l) {
    if (l.length && l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1);
    if (!this.cols) {
      const h = /^(\s*)(VMA\s+LMA|Address)\s+Size\s+Align\s+Out\s+In\s+Symbol\s*$/.exec(l);
      if (h) { this.hasLma = h[2] !== 'Address'; this.cols = { out: l.indexOf('Out'), in: l.indexOf('In', l.indexOf('Out') + 3), sym: l.indexOf('Symbol') }; }
      return;
    }
    const re = this.hasLma ? /^\s*([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+(\d+)\s/ : /^\s*([0-9a-fA-F]+)\s+([0-9a-fA-F]+)\s+(\d+)\s/;
    const m = re.exec(l);
    if (!m) return;
    const vma = m[1], lma = this.hasLma ? m[2] : m[1], size = parseInt(this.hasLma ? m[3] : m[2], 16);
    let p = m[0].length; while (p < l.length && l.charCodeAt(p) === 32) p++;
    const text = l.slice(p).trimEnd();
    if (!text) return;
    const [hi, lo] = hexPair(vma);
    if (p < this.cols.in) {
      const a = /=/.test(text) ? RE_ASSIGN.exec(text) : null;
      if (a) { this.m.endInput(); if (a[1] !== '.') this.m.addSymbol(a[1], hi, lo, 0, SYM_SCRIPT, Math.max(0, this.cur)); return; }
      this.cur = this.m.addSection(text, hi, lo, size, hexPair(lma));
      return;
    }
    if (this.cur < 0) return;
    if (p < this.cols.sym) {
      const im = /^(.*):\(([^()]*)\)$/.exec(text);
      if (im) {
        let obj = im[1], flags = 0;
        if (obj === '<internal>' || obj === '<linker>') { flags = IN_LINKER; obj = '*linker*'; }
        if (im[2] === 'COMMON') flags |= IN_COMMON;
        this.m.addInput(this.cur, obj, im[2], hi, lo, size, flags);
        return;
      }
      if (/^\.\s*=/.test(text)) { if (size > 0) this.m.addInput(this.cur, '*fill*', '*fill*', hi, lo, size, IN_FILL); return; }
      const a = RE_ASSIGN.exec(text);
      if (a) { this.m.endInput(); this.m.addSymbol(a[1], hi, lo, 0, SYM_SCRIPT, this.cur); return; }
      if (/^(BYTE|SHORT|LONG|QUAD)\s*\(/.test(text)) { this.m.addInput(this.cur, '*linker*', text.split('(')[0], hi, lo, size, IN_LINKER); return; }
      return;
    }
    const a = RE_ASSIGN.exec(text);
    if (a && text.indexOf('=') > 0 && !/^[\w$.]+$/.test(text)) { if (a[1] !== '.') this.m.addSymbol(a[1], hi, lo, 0, SYM_SCRIPT, this.cur); return; }
    if (this.m._curIn < 0) { this.m.addSymbol(text, hi, lo, size, SYM_SCRIPT, this.cur); return; }
    this.m.addSymbol(text, hi, lo, size, size ? 0 : SYM_NEEDSIZE);
  }
  finish() {
    if (!this.cols) this.m.warnings.push('No "VMA LMA Size Align Out In Symbol" header was found.');
    this.m.extra.noRegions = 'LLVM lld map files do not list the MEMORY regions of the linker script, so there are no region bars. Sizes per section, object and symbol are below.';
    return this.m.finish();
  }
}

// ---------------------------------------------------------------- Keil / Arm Compiler armlink
const KEIL_ROW = /^\s+0x([0-9a-fA-F]+)\s+(?:(0x[0-9a-fA-F]+|-|COMPRESSED)\s+)?0x([0-9a-fA-F]+)\s+(Code|Data|Zero|PAD|Ven)\b\s*(RO|RW|ZI)?\s*(\d+)?\s*(\*)?\s*(\S+)?\s*(.*?)\s*$/;
const KEIL_EXEC = /^\s*Execution Region (\S+) \((?:Exec base|Base): 0x([0-9a-fA-F]+),\s*(?:Load base: 0x([0-9a-fA-F]+),\s*)?Size: 0x([0-9a-fA-F]+),\s*Max: 0x([0-9a-fA-F]+)/;
const KEIL_LOAD = /^\s*Load Region (\S+) \(Base: 0x([0-9a-fA-F]+),\s*Size: 0x([0-9a-fA-F]+),\s*Max: 0x([0-9a-fA-F]+)/;
const KEIL_SYM = /^\s+(\S+)\s+0x([0-9a-fA-F]+)\s+(Thumb Code|ARM Code|Data|Number|Section)\s+(\d+)\s+(.*?)\s*$/;
const KEIL_TOTAL = /^\s*Total (RO|RW|ROM)\s+Size \(([^)]*)\)\s+(\d+)/;

class KeilParser {
  constructor() { this.m = new Model('keil'); this.mode = ''; this.cur = -1; this.local = false; this.pendSym = null; }
  line(l) {
    if (l.length && l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1);
    const t = l.trim();
    if (/^Image Symbol Table$/.test(t)) { this.mode = 'sym'; return; }
    if (/^Memory Map of the image$/.test(t)) { this.mode = 'mem'; return; }
    if (/^Image component sizes$/.test(t)) { this.mode = 'sizes'; this.m.endInput(); return; }
    if (/^Section Cross References$|^Removing Unused input sections from the image\.$/.test(t)) { this.mode = t.startsWith('Section') ? 'xref' : 'removed'; return; }
    if (this.mode === 'sym') {
      if (t === 'Local Symbols') { this.local = true; return; }
      if (t === 'Global Symbols') { this.local = false; return; }
      let s = KEIL_SYM.exec(l);
      if (!s && this.pendSym && /^\s+0x/.test(l)) s = KEIL_SYM.exec('    ' + this.pendSym + ' ' + t);
      this.pendSym = null;
      if (!s) { if (/^\s+\S+$/.test(l) && !/^-+$/.test(t)) this.pendSym = t; return; }
      if (s[3] === 'Section' || s[3] === 'Number') return;
      const [hi, lo] = hexPair(s[2]);
      const lo2 = s[3].endsWith('Code') ? (lo & ~1) >>> 0 : lo; // Thumb addresses have bit 0 set
      (this.syms || (this.syms = [])).push([s[1], hi, lo2, parseInt(s[4], 10), this.local, s[5]]);
      return;
    }
    if (this.mode === 'removed') {
      const r = /^\s*Removing (\S+)\((.+)\), \((\d+) bytes\)/.exec(l);
      if (r) this.m.addDiscarded(r[2], r[1], parseInt(r[3], 10));
      return;
    }
    if (this.mode === 'mem') {
      const ld = KEIL_LOAD.exec(l);
      if (ld) { const [hi, lo] = hexPair(ld[2]); this.m.loadRegions.push({ name: ld[1], hi, lo, size: parseInt(ld[3], 16), max: parseInt(ld[4], 16) }); return; }
      const ex = KEIL_EXEC.exec(l);
      if (ex) {
        const [hi, lo] = hexPair(ex[2]);
        const size = parseInt(ex[4], 16), max = parseInt(ex[5], 16);
        this.cur = this.m.addSection(ex[1], hi, lo, size, ex[3] ? hexPair(ex[3]) : null);
        const r = this.m.addRegion(ex[1], ex[2], max, /UNINIT|ZI|RW|IRAM|RAM/i.test(ex[1]) ? 'rw' : 'rx');
        this.m.regions[r].fixedUsed = size;
        this.m.sections[this.cur].noLmaRegion = true; // the RW load copy is in the load region, not in an execution region
        if (/COMPRESSED/.test(l)) this.m.extra.compressed = 'The RW data of this image is stored compressed in flash (COMPRESSED), so the load region holds less than the RW size.';
        this.m.regions[r].section = this.cur;
        return;
      }
      const r = KEIL_ROW.exec(l);
      if (r && this.cur >= 0) {
        const [hi, lo] = hexPair(r[1]);
        const size = parseInt(r[3], 16);
        let flags = 0, obj = r[9] || '', name = r[8] || '';
        if (r[4] === 'PAD') { flags = IN_FILL; obj = '*fill*'; name = '*fill*'; }
        if (r[4] === 'Ven') flags = IN_LINKER;
        const i = this.m.addInput(this.cur, obj, name, hi, lo, size, flags);
        const k = r[4] === 'Code' || r[4] === 'Ven' ? C_CODE : r[4] === 'Zero' ? C_BSS : r[5] === 'RW' ? C_DATA : r[4] === 'PAD' ? -1 : C_RO;
        (this.kinds || (this.kinds = [])).push(k);
        if (k >= 0) this.m.setInputCat(i, k);
      }
      return;
    }
    if (this.mode === 'sizes') {
      const g = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+Grand Totals\s*$/.exec(l);
      if (g) { for (const [i, lab] of [[1, 'Code'], [3, 'RO Data'], [4, 'RW Data'], [5, 'ZI Data']]) this.m.toolSummary.push({ label: `Grand Totals: ${lab}`, value: parseInt(g[i], 10), key: 'grand-' + lab.toLowerCase().replace(' ', '') }); return; }
      const tt = KEIL_TOTAL.exec(l);
      if (tt) this.m.toolSummary.push({ label: `Total ${tt[1]} Size (${tt[2]})`, value: parseInt(tt[3], 10), key: tt[1].toLowerCase() });
    }
  }
  finish() {
    this.m.endInput();
    // Execution regions hold mixed kinds: the kind of each region is its biggest kind of rows
    const k = this.kinds || [];
    const per = new Map();
    for (let i = 0; i < k.length; i++) {
      const sec = this.m.inSec.get(i);
      if (!per.has(sec)) per.set(sec, [0, 0, 0, 0]);
      if (k[i] >= 0) per.get(sec)[k[i]] += this.m.inSize.get(i);
    }
    for (const [sec, c] of per) { let b = 0; for (let j = 1; j < 4; j++) if (c[j] > c[b]) b = j; this.m.sections[sec].cat = b; }
    // A RW region's load copy: region lma differs from exec base
    // symbols: attach to the input section that holds them (by address inside the rows)
    this.m.keilKinds = k;
    if (this.syms) attachSyms(this.m, this.syms);
    return this.m.finish();
  }
}

// ---------------------------------------------------------------- IAR ILINK
const IAR_KIND = '(ro code|ro data|rw data|rw code|zero|inited|uninit|const|Veneer|ro|rw|init data|rw init|uninit data)';
const IAR_ROW = new RegExp(`^(\\s+)(\\S.*?)\\s+${IAR_KIND}\\s+0x([0-9a-fA-F']+)\\s+0x([0-9a-fA-F']+)\\s+(.*?)\\s*$`);
const IAR_BLOCK = /^(\s*)(\S.*?)\s+0x([0-9a-fA-F']+)\s+0x([0-9a-fA-F']+)\s+(<[^>]*>)\s*$/;
const IAR_PLACE = /^"([^"]+)":\s+place\s+(in|at)\s+(.*)$/;
const IAR_GROUP = /^"([^"]+)"(?:, part \d+ of \d+)?:\s+0x([0-9a-fA-F']+)\s*$/;
const IAR_ENTRY = /^(\S+)\s+0x([0-9a-fA-F']+)\s+(0x[0-9a-fA-F']+)?\s*(Code|Data|--)?\s+(Gb|Lc|Wk)\s+(.*?)\s*$/;
const IAR_ENTRY_CONT = /^\s+0x([0-9a-fA-F']+)\s+(0x[0-9a-fA-F']+)?\s*(Code|Data|--)?\s+(Gb|Lc|Wk)\s+(.*?)\s*$/;
const IAR_TOTAL = /^\s*([\d ']+) bytes of (readonly|readwrite)\s+(code|data) memory/;
const ih = s => s.replace(/'/g, '');

class IarParser {
  constructor() { this.m = new Model('iar'); this.mode = ''; this.cur = -1; this.ranges = []; this.legend = new Map(); this.pendEntry = null; this.kinds = []; this.blockDepth = null; }
  line(l) {
    if (l.length && l.charCodeAt(l.length - 1) === 13) l = l.slice(0, -1);
    const t = l.trim();
    if (/^\*\*\* PLACEMENT SUMMARY/.test(t)) { this.mode = 'place'; return; }
    if (/^\*\*\* INIT TABLE/.test(t)) { this.mode = 'init'; return; }
    if (/^\*\*\* MODULE SUMMARY/.test(t)) { this.mode = 'module'; this.m.endInput(); return; }
    if (/^\*\*\* ENTRY LIST/.test(t)) { this.mode = 'entry'; return; }
    if (/^\*\*\* (MESSAGES|RUNTIME MODEL|CROSS REFERENCE|STACK USAGE|SECTION|LINKER|CHECKSUM|RAM|ROM)/.test(t)) { this.mode = 'other'; return; }
    const lg = /^\[(\d+)\] = (.+?)\s*$/.exec(t);
    if (lg) { this.legend.set(lg[1], lg[2]); return; }
    const tot = IAR_TOTAL.exec(l);
    if (tot) { this.m.toolSummary.push({ label: `${tot[2]} ${tot[3]} memory`, value: parseInt(tot[1].replace(/[ ']/g, ''), 10), key: tot[2] + '-' + tot[3] }); return; }
    if (this.mode === 'place') return this.placeLine(l, t);
    if (this.mode === 'entry') return this.entryLine(l, t);
  }
  placeLine(l, t) {
    let p = IAR_PLACE.exec(l);
    if (!p && this.lastPlace && /^\s+\[from /.test(l)) p = [null, this.lastPlace.name, '', t];
    if (p) {
      const re = /\[from 0x([0-9a-fA-F']+) to 0x([0-9a-fA-F']+)\]/g; let r;
      const what = /\{([^}]*)\}/.exec(p[3]);
      const wt = what ? what[1].trim().replace(/\s+/g, ' ') : '';
      if (wt && this.lastPlace && this.lastPlace.name === p[1]) for (const x of this.ranges) if (x.name === p[1] && !x.what) x.what = wt;
      while ((r = re.exec(p[3]))) this.ranges.push({ from: ih(r[1]), to: ih(r[2]), name: p[1], what: wt });
      this.lastPlace = /\|\s*$/.test(l) ? { name: p[1] } : null;
      return;
    }
    this.lastPlace = null;
    const g = IAR_GROUP.exec(l);
    if (g) { this.group = g[1]; this.cur = -1; return; }
    const row = IAR_ROW.exec(l);
    if (row) {
      const [, ind, name, kind, addr, size, objRaw] = row;
      if (objRaw.startsWith('<') && objRaw.endsWith('>')) {
        // a block row (<Block>, <Init block>): its children follow, so only open a section
        this.openSection(name, addr, size, ind.length);
        return;
      }
      const sec = this.ensureSection(addr, ind.length);
      const [hi, lo] = hexPair(ih(addr));
      const obj = objRaw === '- Linker created -' ? '*linker*' : objRaw;
      const i = this.m.addInput(sec, obj, name, hi, lo, parseInt(ih(size), 16), obj === '*linker*' ? IN_LINKER : 0);
      const k = /code|Veneer/.test(kind) ? C_CODE : kind === 'zero' || /uninit/.test(kind) ? C_BSS : /inited|rw/.test(kind) ? C_DATA : C_RO;
      this.kinds.push(k);
      this.m.setInputCat(i, k);
      return;
    }
    const blk = IAR_BLOCK.exec(l);
    if (blk && /^\s/.test(l)) { this.openSection(blk[2], blk[3], blk[4], blk[1].length); return; }
  }
  openSection(name, addr, size, ind) {
    if (this.blockDepth !== null && ind > this.blockDepth && this.cur >= 0) return; // nested block: keep the outer one
    const [hi, lo] = hexPair(ih(addr));
    this.cur = this.m.addSection((this.group ? this.group + ' ' : '') + name, hi, lo, parseInt(ih(size), 16));
    this.blockDepth = ind;
  }
  ensureSection(addr, ind) {
    if (this.cur >= 0 && (this.blockDepth === null || ind > this.blockDepth)) return this.cur;
    // a row directly under a placement group: one section per group
    if (this.cur < 0 || this.blockDepth !== null) {
      const [hi, lo] = hexPair(ih(addr));
      this.cur = this.m.addSection(this.group || 'section', hi, lo, 0);
      this.m.sections[this.cur].grow = true;
      this.blockDepth = null;
    }
    return this.cur;
  }
  entryLine(l, t) {
    if (!t || /^Entry\s+Address|^-----/.test(t)) return;
    let e = IAR_ENTRY.exec(l);
    if (!e && this.pendEntry) { const c = IAR_ENTRY_CONT.exec(l); if (c) e = [null, this.pendEntry, c[1], c[2], c[3], c[4], c[5]]; }
    this.pendEntry = null;
    if (!e) { if (/^\S+$/.test(l)) this.pendEntry = t; return; }
    const [, name, addr, size, type, scope, obj] = e;
    if (!size || obj.startsWith('- Linker created')) return;
    const [hi, lo] = hexPair(ih(addr));
    const lo2 = type === 'Code' ? (lo & ~1) >>> 0 : lo;
    (this.syms || (this.syms = [])).push([name, hi, lo2, parseInt(ih(size), 16), scope === 'Lc', obj]);
  }
  finish() {
    const m = this.m;
    m.endInput();
    // sections that grew from rows: size = last end - start
    const n = m.inSec.length;
    for (let i = 0; i < n; i++) {
      const s = m.sections[m.inSec.get(i)];
      if (s.grow) { const end = (m.inHi.get(i) - s.hi) * 4294967296 + (m.inLo.get(i) - s.lo) + m.inSize.get(i); if (end > s.size) s.size = end; }
    }
    // kind per section: the biggest kind
    const per = new Map();
    for (let i = 0; i < n; i++) { const sec = m.inSec.get(i); if (!per.has(sec)) per.set(sec, [0, 0, 0, 0]); per.get(sec)[this.kinds[i]] += m.inSize.get(i); }
    for (const [sec, c] of per) { let b = 0; for (let j = 1; j < 4; j++) if (c[j] > c[b]) b = j; m.sections[sec].cat = b; }
    for (const s of m.sections) if (!per.has(m.sections.indexOf(s)) && s.cat === C_OTHER) s.cat = classify2(s.name);
    // memory ranges from the "place in [from .. to ..]" lines: one region per distinct range
    const seen = new Map();
    for (const r of this.ranges) {
      const k = r.from + '-' + r.to;
      if (seen.has(k)) { seen.get(k).names.push(r.name); continue; }
      const [fh, fl] = hexPair(r.from), [th, tl] = hexPair(r.to);
      const len = (th - fh) * 4294967296 + (tl - fl) + 1;
      seen.set(k, { from: r.from, len, names: [r.name], what: [r.what], rw: /\brw\b|zi|readwrite|block CSTACK|block HEAP|block RW|block ZI/i.test(r.what) });
    }
    // ranges of one directive that touch (P1: [a to b] | [b+1 to c]) become one region
    const list = [...seen.values()];
    for (let i = list.length - 1; i > 0; i--) {
      const a = list[i - 1], b = list[i];
      if (a.names.join() !== b.names.join()) continue;
      const [ah, al] = hexPair(a.from), [bh, bl] = hexPair(b.from);
      if ((bh - ah) * 4294967296 + (bl - al) === a.len) { a.len += b.len; list.splice(i, 1); }
    }
    for (const v of list) {
      const what = [...new Set(v.what.filter(Boolean))].join(', ');
      m.addRegion(v.names.join(', ') + (what ? ` { ${what.length > 40 ? what.slice(0, 39) + '\u2026' : what} }` : ''), v.from, v.len, v.rw ? 'rw' : 'rx');
    }
    // object names: "memcpy.o [2]" -> "dl7M_tln.a(memcpy.o)" when [2] is a library
    const L = this.legend;
    m.objs.list = m.objs.list.map(o => {
      const k = /^(.*?) \[(\d+)\]$/.exec(o);
      if (!k || !L.has(k[2])) return o;
      const lib = L.get(k[2]);
      return /\.a$|\.lib$/i.test(lib) ? `${lib}(${k[1]})` : `${lib.replace(/[\\/]+$/, '')}/${k[1]}`;
    });
    m.objs.map = new Map(m.objs.list.map((o, i) => [o, i]));
    if (this.syms) attachSyms(m, this.syms);
    return m.finish();
  }
}

function classify2(name) { return /zero|bss|noinit|stack|heap/i.test(name) ? C_BSS : /data|rw/i.test(name) ? C_DATA : /const|ro data|init/i.test(name) ? C_RO : C_OTHER; }

/** Attach symbols with known sizes to the input section that holds their address. */
function attachSyms(A, syms) {
  const n = A.inSec.length, idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => (A.inHi.get(a) - A.inHi.get(b)) || (A.inLo.get(a) - A.inLo.get(b)));
  for (const [name, hi, lo, size, local] of syms) {
    let L = 0, R = n - 1, best = -1;
    while (L <= R) { const mid = (L + R) >> 1, j = idx[mid]; const c = A.inHi.get(j) - hi || A.inLo.get(j) - lo; if (c <= 0) { best = mid; L = mid + 1; } else R = mid - 1; }
    let hit = -1;
    for (let q = best; q >= 0 && q > best - 6; q--) { const j = idx[q]; if (A.inHi.get(j) === hi && lo - A.inLo.get(j) < Math.max(1, A.inSize.get(j))) { hit = j; break; } }
    A._curIn = hit;
    A.addSymbol(name, hi, lo, size, (local ? SYM_LOCAL : 0) | (hit < 0 ? SYM_SCRIPT : 0), hit >= 0 ? A.inSec.get(hit) : (A.sections.length ? 0 : -1));
  }
  A._curIn = -1;
}

function createParser(format) {
  switch (format) {
    case 'gnu-ld': return new GnuParser();
    case 'lld': return new LldParser();
    case 'keil': return new KeilParser();
    case 'iar': return new IarParser();
    default: throw new Error('unknown format ' + format);
  }
}

/**
 * Split a stream of text chunks into lines. Lines longer than MAX_LINE are cut; the rest of such a line is skipped.
 */
class LineSplitter {
  constructor(onLine) { this.onLine = onLine; this.rest = ''; this.skipping = false; this.longLines = 0; this.lines = 0; }
  push(text) {
    let start = 0;
    for (;;) {
      const nl = text.indexOf('\n', start);
      if (nl < 0) break;
      if (this.skipping) { this.skipping = false; start = nl + 1; continue; }
      let line = text.slice(start, nl);
      if (this.rest) { line = this.rest + line; this.rest = ''; }
      if (line.length > MAX_LINE) { this.longLines++; line = line.slice(0, MAX_LINE); }
      this.lines++;
      this.onLine(line);
      start = nl + 1;
    }
    if (start < text.length && !this.skipping) {
      this.rest += text.slice(start);
      if (this.rest.length > MAX_LINE) { this.longLines++; this.lines++; this.onLine(this.rest.slice(0, MAX_LINE)); this.rest = ''; this.skipping = true; }
    }
  }
  end() { if (this.rest && !this.skipping) { this.lines++; this.onLine(this.rest); } this.rest = ''; }
}

/** Parse a whole string (tests and small files). */
function parseText(text, format) {
  format = format || detect(text);
  if (!format) throw new Error('not a linker map');
  const p = createParser(format);
  const sp = new LineSplitter(l => p.line(l));
  sp.push(text); sp.end();
  const m = p.finish();
  m.stats = { lines: sp.lines, longLines: sp.longLines, bytes: text.length };
  if (sp.longLines) m.warnings.push(`${sp.longLines} line(s) longer than 256 KB were cut.`);
  return m;
}

module.exports = { sniff, detect, createParser, LineSplitter, parseText, FORMAT_LABEL, MAX_LINE };

});
__def('query', function (module, exports) {
'use strict';
// Read-side of a parsed map: summary, sorted and filtered table pages, the treemap tree, compare and export.
// Runs in the worker thread next to the model, so only small pages cross to the extension host and the webview.
const { CAT, C_NOALLOC, IN_FILL, SYM_EST, SYM_SCRIPT, baseName, hexText, cmpPair } = require('./model');
const { FORMAT_LABEL } = require('./parse');

const PAGE_MAX = 2000;

function regionInfo(m) {
  return m.regions.map((r, i) => ({
    i, name: r.name, origin: hexText(r.originHi, r.originLo), length: r.length, attrs: r.attrs,
    used: r.used, sum: r.sum, free: Math.max(0, r.length - r.used), pct: r.length > 0 ? r.used / r.length : 0, cats: r.cats,
  }));
}

function summary(m, extra = {}) {
  const archives = new Set();
  for (const o of m.objInfo) if (o.archive) archives.add(o.archive);
  let disBytes = 0; for (const s of m.disSize) disBytes += s;
  const t = m.totals;
  const pseudo = o => { const p = m.objs.get(o); return p === '*fill*' || p === '*linker*'; };
  let padding = 0; for (let o = 0; o < m.objs.length; o++) if (m.objs.get(o) === '*fill*') padding += m.objTotal(o);
  const topObj = topN(m.objs.length, o => pseudo(o) ? -1 : m.objTotal(o), 8).map(o => ({ i: o, name: m.objs.get(o), size: m.objTotal(o) }));
  const topSym = topN(m.nSymbols, k => (m.symFlags.a[k] & SYM_SCRIPT) ? -1 : m.symSize.a[k], 8).map(k => ({ i: k, name: m.symName[k], size: m.symSize.a[k], est: !!(m.symFlags.a[k] & SYM_EST) }));
  return {
    format: m.format, formatLabel: FORMAT_LABEL[m.format] || m.format,
    regions: regionInfo(m),
    sections: m.sections.filter(s => s.alloc && s.size > 0).length,
    sectionsAll: m.sections.length,
    totals: { code: t[0], ro: t[1], data: t[2], bss: t[3], other: t[4], noalloc: t[5] },
    berkeley: { text: t[0] + t[1], data: t[2], bss: t[3] },
    padding,
    counts: { inputs: m.nInputs, objects: m.objs.length, archives: archives.size, symbols: m.nSymbols, discarded: m.disName.length, discardedBytes: disBytes, cref: m.cref ? m.cref.size : 0, why: m.why.size },
    topObjects: topObj, topSymbols: topSym,
    toolSummary: m.toolSummary, loadRegions: m.loadRegions.map(r => ({ name: r.name, base: hexText(r.hi, r.lo), size: r.size, max: r.max })),
    warnings: m.warnings, notes: Object.values(m.extra), stats: m.stats || {}, ...extra,
  };
}

function topN(n, val, k) {
  const best = [];
  for (let i = 0; i < n; i++) {
    const v = val(i);
    if (v <= 0) continue;
    if (best.length < k) { best.push([v, i]); best.sort((a, b) => b[0] - a[0]); }
    else if (v > best[k - 1][0]) { best[k - 1] = [v, i]; best.sort((a, b) => b[0] - a[0]); }
  }
  return best.map(b => b[1]);
}

// ---------------------------------------------------------------- tables
// Column types: text, hex, size, int, cat, pct, delta
function columns(m, kind) {
  const reg = m.regions.map((r, i) => ({ key: 'r' + i, label: r.name, type: 'size', title: `Bytes in memory region ${r.name} (a RAM copy loaded from flash counts in both)` }));
  switch (kind) {
    case 'sections': return [
      { key: 'name', label: 'Section', type: 'text' }, { key: 'addr', label: 'Address', type: 'hex' }, { key: 'size', label: 'Size', type: 'size' },
      { key: 'lma', label: 'Load address', type: 'hex', title: 'Where the bytes are stored in flash when they run from RAM' },
      { key: 'region', label: 'Region', type: 'text' }, { key: 'cat', label: 'Kind', type: 'text' }, { key: 'n', label: 'Inputs', type: 'int' }, { key: 'fill', label: 'Padding', type: 'size' }];
    case 'objects': return [
      { key: 'name', label: 'Object file', type: 'text' }, { key: 'archive', label: 'Library', type: 'text' }, { key: 'total', label: 'Total', type: 'size' },
      { key: 'c0', label: 'Code', type: 'size' }, { key: 'c1', label: 'RO data', type: 'size' }, { key: 'c2', label: 'RW data', type: 'size' }, { key: 'c3', label: 'Zero-init', type: 'size' }, ...reg];
    case 'archives': return [
      { key: 'name', label: 'Library', type: 'text' }, { key: 'n', label: 'Objects', type: 'int' }, { key: 'total', label: 'Total', type: 'size' },
      { key: 'c0', label: 'Code', type: 'size' }, { key: 'c1', label: 'RO data', type: 'size' }, { key: 'c2', label: 'RW data', type: 'size' }, { key: 'c3', label: 'Zero-init', type: 'size' }, ...reg];
    case 'inputs': return [
      { key: 'name', label: 'Input section', type: 'text' }, { key: 'obj', label: 'Object file', type: 'text' }, { key: 'sec', label: 'Output section', type: 'text' },
      { key: 'addr', label: 'Address', type: 'hex' }, { key: 'size', label: 'Size', type: 'size' }];
    case 'symbols': return [
      { key: 'name', label: 'Symbol', type: 'text' }, { key: 'addr', label: 'Address', type: 'hex' },
      { key: 'size', label: 'Size', type: 'size', title: m.format === 'gnu-ld' ? 'GNU ld maps do not print symbol sizes. A size marked ~ runs to the next symbol in the same input section.' : '' },
      { key: 'obj', label: 'Object file', type: 'text' }, { key: 'sec', label: 'Section', type: 'text' }];
    case 'discarded': return [
      { key: 'name', label: 'Discarded section', type: 'text' }, { key: 'obj', label: 'Object file', type: 'text' }, { key: 'size', label: 'Size', type: 'size' }];
    default: return [];
  }
}

function regionName(m, r) { return r >= 0 ? m.regions[r].name : ''; }

/** Per kind: row count, a getter for sort keys, the text a filter looks at, and the row values. */
function source(m, kind, opts = {}) {
  const nR = m.regions.length;
  switch (kind) {
    case 'sections': {
      const ids = []; for (let i = 0; i < m.sections.length; i++) if (opts.all || (m.sections[i].alloc && m.sections[i].cat !== C_NOALLOC && m.sections[i].size > 0)) ids.push(i);
      const S = i => m.sections[i];
      return {
        ids, text: i => S(i).name,
        key: (c) => ({ name: i => S(i).name, addr: i => S(i), size: i => S(i).size, lma: i => S(i).hasLma ? { hi: S(i).lmaHi, lo: S(i).lmaLo } : { hi: 0, lo: 0 }, region: i => regionName(m, S(i).rv), cat: i => CAT[S(i).cat], n: i => S(i).nIn, fill: i => S(i).fill })[c],
        row: i => { const s = S(i); return [s.name, hexText(s.hi, s.lo), s.size, s.hasLma ? hexText(s.lmaHi, s.lmaLo) : '', regionName(m, s.rv) + (s.rl >= 0 ? ' + ' + regionName(m, s.rl) : ''), CAT[s.cat], s.nIn, s.fill]; },
      };
    }
    case 'objects': {
      // scope: one section, one library
      let ids = [];
      let cat = m.objCat, reg = m.objReg, nIn = m.objIn;
      if (opts.sec !== undefined && opts.sec !== null) {
        cat = new Float64Array(m.objs.length * 6); reg = new Float64Array(m.objs.length * Math.max(1, nR)); nIn = new Uint32Array(m.objs.length);
        const s = m.sections[opts.sec];
        for (let i = 0; i < m.nInputs; i++) if (m.inSec.a[i] === opts.sec) {
          const o = m.inObj.a[i], sz = m.inSize.a[i]; cat[o * 6 + s.cat] += sz; nIn[o]++;
          if (s.rv >= 0) reg[o * nR + s.rv] += sz; if (s.rl >= 0) reg[o * nR + s.rl] += sz;
        }
      }
      for (let o = 0; o < m.objs.length; o++) {
        if (!nIn[o]) continue;
        if (opts.archive !== undefined && opts.archive !== null && m.objInfo[o].archive !== opts.archive) continue;
        ids.push(o);
      }
      const tot = o => cat[o * 6] + cat[o * 6 + 1] + cat[o * 6 + 2] + cat[o * 6 + 3] + cat[o * 6 + 4];
      const keys = { name: o => m.objs.get(o), archive: o => m.objInfo[o].archive, total: tot };
      for (let c = 0; c < 4; c++) keys['c' + c] = o => cat[o * 6 + c];
      for (let r = 0; r < nR; r++) keys['r' + r] = o => reg[o * nR + r];
      return {
        ids, text: o => m.objs.get(o), key: c => keys[c],
        row: o => [m.objInfo[o].archive ? m.objInfo[o].member : m.objs.get(o), m.objInfo[o].archive, tot(o), cat[o * 6], cat[o * 6 + 1], cat[o * 6 + 2], cat[o * 6 + 3], ...Array.from({ length: nR }, (_, r) => reg[o * nR + r])],
      };
    }
    case 'archives': {
      const map = new Map();
      for (let o = 0; o < m.objs.length; o++) {
        if (!m.objIn[o]) continue;
        const a = m.objInfo[o].archive || (m.objs.get(o) === '*fill*' ? '(padding)' : m.objs.get(o) === '*linker*' ? '(linker)' : '(object files)');
        let e = map.get(a);
        if (!e) { e = { name: a, n: 0, c: new Float64Array(6), r: new Float64Array(Math.max(1, nR)) }; map.set(a, e); }
        e.n++;
        for (let c = 0; c < 6; c++) e.c[c] += m.objCat[o * 6 + c];
        for (let r = 0; r < nR; r++) e.r[r] += m.objReg[o * nR + r];
      }
      const list = [...map.values()];
      const tot = e => e.c[0] + e.c[1] + e.c[2] + e.c[3] + e.c[4];
      const keys = { name: i => list[i].name, n: i => list[i].n, total: i => tot(list[i]) };
      for (let c = 0; c < 4; c++) keys['c' + c] = i => list[i].c[c];
      for (let r = 0; r < nR; r++) keys['r' + r] = i => list[i].r[r];
      return { ids: list.map((_, i) => i), text: i => list[i].name, key: c => keys[c], row: i => [list[i].name, list[i].n, tot(list[i]), list[i].c[0], list[i].c[1], list[i].c[2], list[i].c[3], ...Array.from(list[i].r).slice(0, nR)], archiveName: i => list[i].name };
    }
    case 'inputs': {
      const n = m.nInputs;
      let ids;
      const want = (opts.sec !== undefined && opts.sec !== null) || (opts.obj !== undefined && opts.obj !== null);
      if (want) { ids = []; for (let i = 0; i < n; i++) if ((opts.sec == null || m.inSec.a[i] === opts.sec) && (opts.obj == null || m.inObj.a[i] === opts.obj)) ids.push(i); }
      else ids = rangeIds(n);
      const sn = i => { const s = m.inSec.a[i]; return s >= 0 ? m.sections[s].name : ''; };
      return {
        ids, text: i => m.str.get(m.inName.a[i]) + '\u0000' + m.objs.get(m.inObj.a[i]),
        key: c => ({ name: i => m.str.get(m.inName.a[i]), obj: i => m.objs.get(m.inObj.a[i]), sec: sn, addr: i => ({ hi: m.inHi.a[i], lo: m.inLo.a[i] }), size: i => m.inSize.a[i] })[c],
        row: i => [m.str.get(m.inName.a[i]), m.objs.get(m.inObj.a[i]), sn(i), hexText(m.inHi.a[i], m.inLo.a[i]), m.inSize.a[i]],
      };
    }
    case 'symbols': {
      const n = m.nSymbols;
      let ids;
      const objOf = k => { const i = m.symIn.a[k]; return i >= 0 ? m.inObj.a[i] : -1; };
      if (opts.obj != null || opts.sec != null || opts.input != null) {
        ids = [];
        for (let k = 0; k < n; k++) {
          if (opts.input != null && m.symIn.a[k] !== opts.input) continue;
          if (opts.obj != null && objOf(k) !== opts.obj) continue;
          if (opts.sec != null && m.symSec.a[k] !== opts.sec) continue;
          ids.push(k);
        }
      } else ids = rangeIds(n);
      const on = k => { const o = objOf(k); return o >= 0 ? m.objs.get(o) : (m.symFlags.a[k] & SYM_SCRIPT ? '(linker script)' : ''); };
      const sn = k => { const s = m.symSec.a[k]; return s >= 0 && s < m.sections.length ? m.sections[s].name : ''; };
      return {
        ids, text: k => m.symName[k] + '\u0000' + on(k),
        key: c => ({ name: k => m.symName[k], addr: k => ({ hi: m.symHi.a[k], lo: m.symLo.a[k] }), size: k => m.symSize.a[k], obj: on, sec: sn })[c],
        row: k => [m.symName[k], hexText(m.symHi.a[k], m.symLo.a[k]), m.symSize.a[k], on(k), sn(k), (m.symFlags.a[k] & SYM_EST) ? 1 : 0], // last value: size is estimated
      };
    }
    case 'discarded': {
      return {
        ids: rangeIds(m.disName.length), text: i => m.disName[i] + '\u0000' + m.disObj[i],
        key: c => ({ name: i => m.disName[i], obj: i => m.disObj[i], size: i => m.disSize[i] })[c],
        row: i => [m.disName[i], m.disObj[i], m.disSize[i]],
      };
    }
    default: throw new Error('unknown table ' + kind);
  }
}

function rangeIds(n) { const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; }

function sortIds(ids, key, desc) {
  if (!key) return ids;
  const n = ids.length;
  const sample = n ? key(ids[0]) : 0;
  const arr = Array.from(ids);
  if (typeof sample === 'number') {
    const v = new Float64Array(n); for (let i = 0; i < n; i++) v[i] = key(arr[i]);
    const ord = rangeIds(n);
    ord.sort(desc ? (a, b) => v[b] - v[a] || a - b : (a, b) => v[a] - v[b] || a - b);
    const out = new Uint32Array(n); for (let i = 0; i < n; i++) out[i] = arr[ord[i]]; return out;
  }
  if (sample && typeof sample === 'object') {
    const hi = new Uint32Array(n), lo = new Uint32Array(n);
    for (let i = 0; i < n; i++) { const p = key(arr[i]); hi[i] = p.hi; lo[i] = p.lo; }
    const ord = rangeIds(n);
    ord.sort((a, b) => { const c = cmpPair(hi[a], lo[a], hi[b], lo[b]); return (desc ? -c : c) || a - b; });
    const out = new Uint32Array(n); for (let i = 0; i < n; i++) out[i] = arr[ord[i]]; return out;
  }
  const v = new Array(n); for (let i = 0; i < n; i++) v[i] = String(key(arr[i]) || '').toLowerCase();
  const ord = Array.from(rangeIds(n));
  ord.sort((a, b) => (v[a] < v[b] ? (desc ? 1 : -1) : v[a] > v[b] ? (desc ? -1 : 1) : a - b));
  const out = new Uint32Array(n); for (let i = 0; i < n; i++) out[i] = arr[ord[i]]; return out;
}

/** Filter words: all must appear (case-insensitive) in the row's name or object. "/re/" is a regular expression. */
function matcher(filter) {
  const f = String(filter || '').trim();
  if (!f) return null;
  const re = /^\/(.+)\/([i]?)$/.exec(f);
  if (re) { try { const r = new RegExp(re[1], 'i'); return s => r.test(s); } catch { return () => false; } }
  const words = f.toLowerCase().split(/\s+/).filter(Boolean);
  const anyUpper = /[A-Z]/.test(f);
  return anyUpper ? s => words.every(w => s.toLowerCase().includes(w)) : s => { const l = s.toLowerCase(); for (const w of words) if (!l.includes(w)) return false; return true; };
}

class Tables {
  constructor(m) { this.m = m; this.cache = new Map(); }
  view(q) {
    const scope = q.scope || {};
    const ck = JSON.stringify([q.kind, q.sort, !!q.desc, q.filter || '', scope]);
    let v = this.cache.get(ck);
    if (!v) {
      const src = source(this.m, q.kind, scope);
      const cols = columns(this.m, q.kind);
      const sortKey = q.sort || defaultSort(q.kind);
      const desc = q.sort ? !!q.desc : defaultDesc(q.kind);
      const sk = JSON.stringify([q.kind, sortKey, desc, scope]);
      let sorted = this.cache.get(sk);
      if (!sorted) { sorted = { ids: sortIds(src.ids, src.key(sortKey), desc) }; this.cache.set(sk, sorted); }
      let ids = sorted.ids;
      const match = matcher(q.filter);
      if (match) { const out = []; for (let i = 0; i < ids.length; i++) if (match(src.text(ids[i]))) out.push(ids[i]); ids = out; }
      v = { ids, src, cols, sortKey, desc };
      this.cache.set(ck, v);
      if (this.cache.size > 40) { const first = this.cache.keys().next().value; this.cache.delete(first); }
    }
    return v;
  }
  page(q) {
    const v = this.view(q);
    const off = Math.max(0, q.offset | 0), lim = Math.min(PAGE_MAX, Math.max(1, q.limit | 0 || 200));
    const rows = [], ids = [];
    for (let i = off; i < Math.min(v.ids.length, off + lim); i++) { rows.push(v.src.row(v.ids[i])); ids.push(v.src.archiveName ? v.src.archiveName(v.ids[i]) : v.ids[i]); }
    return { kind: q.kind, total: v.ids.length, offset: off, rows, ids, columns: v.cols, sort: v.sortKey, desc: v.desc };
  }
  export(q, fmt) {
    const v = this.view(q);
    const head = v.cols.map(c => c.label);
    const val = (c, x) => String(x);
    const lines = [];
    if (fmt === 'md') {
      lines.push('| ' + head.join(' | ') + ' |', '|' + v.cols.map(c => (/size|int|delta/.test(c.type) ? ' ---: ' : ' --- ')).join('|') + '|');
      const lim = Math.min(v.ids.length, 100000);
      for (let i = 0; i < lim; i++) { const r = v.src.row(v.ids[i]).slice(0, v.cols.length); lines.push('| ' + r.map((x, j) => val(v.cols[j], x).replace(/\|/g, '\\|')).join(' | ') + ' |'); }
      if (v.ids.length > lim) lines.push('', `(${v.ids.length - lim} more rows not shown; export as CSV for all rows)`);
    } else {
      const q2 = s => (/[",\n\r]/.test(s) || /^[=+\-@\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
      lines.push(head.map(q2).join(','));
      for (let i = 0; i < v.ids.length; i++) { const r = v.src.row(v.ids[i]).slice(0, v.cols.length); lines.push(r.map((x, j) => q2(val(v.cols[j], x))).join(',')); }
    }
    return { text: lines.join('\n') + '\n', rows: v.ids.length };
  }
}

function defaultSort(kind) { return kind === 'sections' ? 'addr' : (kind === 'objects' || kind === 'archives') ? 'total' : 'size'; }
function defaultDesc(kind) { return kind !== 'sections'; }

// ---------------------------------------------------------------- detail of one row
function detail(m, kind, id) {
  if (kind === 'symbols') {
    const k = id, i = m.symIn.a[k];
    const obj = i >= 0 ? m.objs.get(m.inObj.a[i]) : '';
    const refs = m.cref ? m.cref.get(m.symName[k]) : null;
    return {
      kind, name: m.symName[k], addr: hexText(m.symHi.a[k], m.symLo.a[k]), size: m.symSize.a[k], est: !!(m.symFlags.a[k] & SYM_EST),
      script: !!(m.symFlags.a[k] & SYM_SCRIPT), obj, objId: i >= 0 ? m.inObj.a[i] : null, input: i >= 0 ? m.str.get(m.inName.a[i]) : '',
      section: m.symSec.a[k] >= 0 && m.sections[m.symSec.a[k]] ? m.sections[m.symSec.a[k]].name : '', definedIn: refs ? refs[0] : null, usedBy: refs ? refs.slice(1, 200) : null, usedByCount: refs ? refs.length - 1 : 0,
      why: obj ? whyLinked(m, obj) : null,
    };
  }
  if (kind === 'objects') {
    const o = id, p = m.objs.get(o);
    const secs = new Map();
    for (let i = 0; i < m.nInputs; i++) if (m.inObj.a[i] === o) { const s = m.inSec.a[i]; secs.set(s, (secs.get(s) || 0) + m.inSize.a[i]); }
    return { kind, name: p, ...m.objInfo[o], total: m.objTotal(o), sections: [...secs].filter(([s]) => s >= 0).map(([s, size]) => ({ name: m.sections[s].name, size })).sort((a, b) => b.size - a.size), why: whyLinked(m, p) };
  }
  return { kind };
}

function whyLinked(m, obj) {
  const w = m.why.get(obj);
  return w ? { by: w.by, sym: w.sym } : null;
}

// ---------------------------------------------------------------- treemap
const MAX_KIDS = 120, MAX_SUB = 40;

function tree(m, path) {
  path = path || [];
  const node = nodeAt(m, path);
  const kids = children(m, node);
  kids.sort((a, b) => b.size - a.size);
  const out = squash(kids, MAX_KIDS);
  for (const k of out) {
    if (k.leaf || k.others) continue;
    const sub = children(m, k.node).sort((a, b) => b.size - a.size);
    k.sub = squash(sub, MAX_SUB).map(s => ({ label: s.label, size: s.size }));
    delete k.node;
  }
  for (const k of out) delete k.node;
  return { path, labels: labelsOf(m, path), size: kids.reduce((a, k) => a + k.size, 0), children: out };
}

function squash(list, max) {
  if (list.length <= max) return list;
  const rest = list.slice(max - 1);
  return [...list.slice(0, max - 1), { label: `${rest.length} more`, size: rest.reduce((a, k) => a + k.size, 0), others: true, leaf: true }];
}

function nodeAt(m, path) {
  const n = { t: 'root' };
  for (const p of path) Object.assign(n, p);
  return n;
}

function labelsOf(m, path) {
  const out = [m.regions.length ? 'All regions' : 'All sections'];
  for (const p of path) {
    if (p.t === 'region') out.push(m.regions[p.region].name);
    else if (p.t === 'section') out.push(m.sections[p.sec].name + (p.copy ? ' (load copy)' : ''));
    else if (p.t === 'archive') out.push(p.archive || '(object files)');
    else if (p.t === 'object') out.push(baseName(m.objs.get(p.obj)));
  }
  return out;
}

function children(m, n) {
  const step = (o) => ({ ...n, ...o });
  if (n.t === 'root') {
    if (m.regions.length) {
      const out = m.regions.map((r, i) => ({ label: r.name, size: r.sum, kind: 'region', path: { t: 'region', region: i }, node: step({ t: 'region', region: i }) }));
      // allocated sections outside every region
      let outside = 0; for (const s of m.sections) if (s.alloc && s.rv < 0) outside += s.size;
      if (outside > 0) out.push({ label: '(outside the regions)', size: outside, kind: 'region', path: { t: 'region', region: -1 }, node: step({ t: 'region', region: -1 }) });
      return out.filter(k => k.size > 0);
    }
    return sectionKids(m, s => s.alloc, n);
  }
  if (n.t === 'region') {
    const out = sectionKids(m, s => s.alloc && s.rv === n.region, n);
    if (n.region >= 0) m.sections.forEach((s, i) => { if (s.alloc && s.rl === n.region && s.size > 0) out.push({ label: s.name + ' (load copy)', size: s.size, kind: 'section', path: { t: 'section', sec: i, copy: true }, node: step({ t: 'section', sec: i, copy: true }) }); });
    return out;
  }
  if (n.t === 'section' && n.archive === undefined) {
    const by = new Map();
    for (let i = 0; i < m.nInputs; i++) {
      if (m.inSec.a[i] !== n.sec) continue;
      const o = m.inObj.a[i], a = m.objInfo[o].archive;
      const key = a ? 'a:' + a : 'o:' + o;
      by.set(key, (by.get(key) || 0) + m.inSize.a[i]);
    }
    const out = [];
    for (const [key, size] of by) {
      if (size <= 0) continue;
      if (key.startsWith('a:')) { const a = key.slice(2); out.push({ label: baseName(a), title: a, size, kind: 'archive', path: { t: 'archive', archive: a }, node: step({ t: 'archive', archive: a }) }); }
      else { const o = Number(key.slice(2)); const p = m.objs.get(o); out.push({ label: p === '*fill*' ? '(padding)' : baseName(p), title: p, size, kind: 'object', objId: o, path: { t: 'object', obj: o }, node: step({ t: 'object', obj: o }) }); }
    }
    return out;
  }
  if (n.t === 'archive') {
    const by = new Map();
    for (let i = 0; i < m.nInputs; i++) {
      if (m.inSec.a[i] !== n.sec) continue;
      const o = m.inObj.a[i]; if (m.objInfo[o].archive !== n.archive) continue;
      by.set(o, (by.get(o) || 0) + m.inSize.a[i]);
    }
    return [...by].filter(([, s]) => s > 0).map(([o, size]) => ({ label: m.objInfo[o].member, title: m.objs.get(o), size, kind: 'object', objId: o, path: { t: 'object', obj: o }, node: step({ t: 'object', obj: o }) }));
  }
  if (n.t === 'object') {
    const out = [];
    for (let i = 0; i < m.nInputs; i++) {
      if (m.inSec.a[i] !== n.sec || m.inObj.a[i] !== n.obj || m.inSize.a[i] <= 0) continue;
      out.push({ label: m.str.get(m.inName.a[i]), size: m.inSize.a[i], kind: 'input', inputId: i, leaf: true, objId: n.obj });
    }
    return out;
  }
  return [];
}

function sectionKids(m, pred, n) {
  const out = [];
  m.sections.forEach((s, i) => { if (pred(s) && s.size > 0) out.push({ label: s.name, size: s.size, kind: 'section', path: { t: 'section', sec: i }, node: { ...n, t: 'section', sec: i } }); });
  return out;
}

// ---------------------------------------------------------------- compare two maps
function objKey(p) {
  const s = String(p).replace(/\\/g, '/');
  const a = /^(.*?)\((.+)\)$/.exec(s);
  if (a) return baseName(a[1]) + '(' + a[2] + ')';
  return s;
}

function compare(a, b) {
  // a = older map, b = this map
  const out = {};
  // regions by name
  const ra = new Map(a.regions.map(r => [r.name, r])), rb = new Map(b.regions.map(r => [r.name, r]));
  out.regions = rowsFrom(new Set([...ra.keys(), ...rb.keys()]), k => (ra.get(k) || {}).used, k => (rb.get(k) || {}).used, k => ({ length: (rb.get(k) || ra.get(k)).length }));
  // sections (allocated) by name
  const sa = sumBy(a.sections.filter(s => s.alloc), s => s.name, s => s.size), sb = sumBy(b.sections.filter(s => s.alloc), s => s.name, s => s.size);
  out.sections = rowsFrom(new Set([...sa.keys(), ...sb.keys()]), k => sa.get(k), k => sb.get(k));
  // objects: full path first; paths that differ only in the build folder match by file name when unique
  const oa = objSizes(a), ob = objSizes(b);
  matchByBase(oa, ob);
  out.objects = rowsFrom(new Set([...oa.keys(), ...ob.keys()]), k => oa.get(k), k => ob.get(k));
  // symbols by name (sizes summed when a name repeats)
  const ya = symSizes(a), yb = symSizes(b);
  out.symbols = rowsFrom(new Set([...ya.keys(), ...yb.keys()]), k => ya.get(k), k => yb.get(k));
  const tot = m => m.totals.slice(0, 5).reduce((x, y) => x + y, 0);
  out.totals = { old: tot(a), new: tot(b), oldText: a.totals[0] + a.totals[1], newText: b.totals[0] + b.totals[1], oldData: a.totals[2], newData: b.totals[2], oldBss: a.totals[3], newBss: b.totals[3] };
  return out;
}

function sumBy(list, k, v) { const m = new Map(); for (const x of list) m.set(k(x), (m.get(k(x)) || 0) + v(x)); return m; }
function objSizes(m) {
  const r = new Map();
  for (let o = 0; o < m.objs.length; o++) { const p = m.objs.get(o); if (p === '*fill*' || p === '*linker*') continue; const t = m.objTotal(o); if (!m.objIn[o]) continue; const k = objKey(p); r.set(k, (r.get(k) || 0) + t); }
  return r;
}
function matchByBase(oa, ob) {
  const onlyA = [...oa.keys()].filter(k => !ob.has(k)), onlyB = [...ob.keys()].filter(k => !oa.has(k));
  if (!onlyA.length || !onlyB.length) return;
  const count = (list) => { const c = new Map(); for (const k of list) { const b = baseName(k); c.set(b, (c.get(b) || 0) + 1); } return c; };
  const ca = count([...oa.keys()]), cb = count([...ob.keys()]);
  const bIndex = new Map(onlyB.map(k => [baseName(k), k]));
  for (const k of onlyA) {
    const base = baseName(k);
    if (ca.get(base) !== 1 || cb.get(base) !== 1) continue;
    const kb = bIndex.get(base); if (!kb) continue;
    oa.set(kb, oa.get(k)); oa.delete(k);
  }
}
function symSizes(m) {
  const r = new Map();
  for (let k = 0; k < m.nSymbols; k++) { if (m.symFlags.a[k] & SYM_SCRIPT) continue; const n = m.symName[k]; r.set(n, (r.get(n) || 0) + m.symSize.a[k]); }
  return r;
}
function rowsFrom(keys, fa, fb, more) {
  const out = [];
  for (const k of keys) {
    const o = fa(k), n = fb(k);
    const status = o === undefined ? 'added' : n === undefined ? 'removed' : o === n ? 'same' : 'changed';
    out.push({ name: k, old: o === undefined ? null : o, new: n === undefined ? null : n, delta: (n || 0) - (o || 0), status, ...(more ? more(k) : {}) });
  }
  out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || (x.name < y.name ? -1 : 1));
  return out;
}

const CMP_COLS = [
  { key: 'name', label: 'Name', type: 'text' }, { key: 'old', label: 'Before', type: 'size' }, { key: 'new', label: 'After', type: 'size' },
  { key: 'delta', label: 'Change', type: 'delta' }, { key: 'pct', label: '%', type: 'pct' }, { key: 'status', label: 'Status', type: 'text' }];

class CompareTables {
  constructor(res) { this.res = res; this.cache = new Map(); }
  view(q) {
    const list = this.res[q.kind] || [];
    const ck = JSON.stringify([q.kind, q.sort, !!q.desc, q.filter || '', !!q.changedOnly]);
    let v = this.cache.get(ck);
    if (v) return v;
    let ids = [];
    const match = matcher(q.filter);
    for (let i = 0; i < list.length; i++) { const r = list[i]; if (q.changedOnly && r.status === 'same') continue; if (match && !match(r.name)) continue; ids.push(i); }
    if (q.sort && q.sort !== 'delta-abs') {
      const key = { name: i => list[i].name, old: i => list[i].old || 0, new: i => list[i].new || 0, delta: i => list[i].delta, pct: i => pct(list[i]), status: i => list[i].status }[q.sort];
      if (key) ids = Array.from(sortIds(ids, key, !!q.desc));
    }
    v = { ids, list }; this.cache.set(ck, v);
    return v;
  }
  page(q) {
    const v = this.view(q);
    const off = Math.max(0, q.offset | 0), lim = Math.min(PAGE_MAX, Math.max(1, q.limit | 0 || 200));
    const rows = v.ids.slice(off, off + lim).map(i => { const r = v.list[i]; return [r.name, r.old, r.new, r.delta, pct(r), r.status]; });
    return { kind: q.kind, total: v.ids.length, offset: off, rows, ids: v.ids.slice(off, off + lim), columns: CMP_COLS, sort: q.sort || 'delta-abs', desc: !!q.desc, compare: true };
  }
  export(q, fmt) {
    const v = this.view(q);
    const head = ['Name', 'Before', 'After', 'Change', '%', 'Status'];
    const cell = r => [r.name, r.old === null ? '' : String(r.old), r.new === null ? '' : String(r.new), (r.delta > 0 ? '+' : '') + r.delta, pct(r) === null ? '' : (pct(r) * 100).toFixed(1), r.status];
    const lines = [];
    if (fmt === 'md') {
      lines.push('| ' + head.join(' | ') + ' |', '| --- | ---: | ---: | ---: | ---: | --- |');
      for (const i of v.ids.slice(0, 100000)) lines.push('| ' + cell(v.list[i]).map(s => s.replace(/\|/g, '\\|')).join(' | ') + ' |');
    } else {
      const q2 = s => (/[",\n\r]/.test(s) || /^[=+\-@\t]/.test(s) && !/^[+-]\d/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
      lines.push(head.join(','));
      for (const i of v.ids) lines.push(cell(v.list[i]).map(q2).join(','));
    }
    return { text: lines.join('\n') + '\n', rows: v.ids.length };
  }
}
function pct(r) { return r.old ? r.delta / r.old : null; }

module.exports = { summary, Tables, CompareTables, columns, detail, tree, compare, matcher, sortIds, objKey, IN_FILL, source };

});
__def('regions', function (module, exports) {
'use strict';
// Memory regions for maps that do not list them (LLVM lld, Rust): read the MEMORY { } block of a linker
// script (memory.x, *.ld, *.lds), or take them from the linkerMap.memoryRegions setting.

/** Parse a number from a linker script: 0x8000, 512K, 1M, 1024, 0x100 + 0x20, (256K - 8K). */
function scriptNumber(expr) {
  const s = String(expr).trim();
  if (!/^[\s0-9a-fA-FxXkKmMgG+\-*()]+$/.test(s)) return NaN;
  const tokens = s.match(/0[xX][0-9a-fA-F]+|\d+[kKmMgG]?|[+\-*()]/g);
  if (!tokens) return NaN;
  let pos = 0;
  const val = t => {
    if (/^0[xX]/.test(t)) return parseInt(t, 16);
    const m = /^(\d+)([kKmMgG]?)$/.exec(t);
    if (!m) return NaN;
    return Number(m[1]) * ({ '': 1, k: 1024, m: 1048576, g: 1073741824 }[m[2].toLowerCase()]);
  };
  const prim = () => {
    const t = tokens[pos++];
    if (t === '(') { const v = sum(); pos++; return v; }
    if (t === '-') return -prim();
    return val(t);
  };
  const prod = () => { let v = prim(); while (tokens[pos] === '*') { pos++; v *= prim(); } return v; };
  const sum = () => { let v = prod(); while (tokens[pos] === '+' || tokens[pos] === '-') { const op = tokens[pos++]; const r = prod(); v = op === '+' ? v + r : v - r; } return v; };
  const v = sum();
  return pos === tokens.length && Number.isFinite(v) ? v : NaN;
}

/** Regions from the MEMORY block of a linker script. Comments are removed first. */
function parseMemoryBlock(text) {
  const t = String(text).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const m = /\bMEMORY\s*\{([\s\S]*?)\}/.exec(t);
  if (!m) return [];
  const out = [];
  const re = /([A-Za-z_][\w.$-]*)\s*(?:\(([^)]*)\))?\s*:\s*(?:ORIGIN|org|o)\s*=\s*([^,]+?)\s*,\s*(?:LENGTH|len|l)\s*=\s*([^\n;]+?)\s*(?=$|\n|[A-Za-z_][\w.$-]*\s*(?:\([^)]*\))?\s*:)/gm;
  let r;
  while ((r = re.exec(m[1]))) {
    const origin = scriptNumber(r[3]), length = scriptNumber(r[4]);
    if (!Number.isFinite(origin) || !Number.isFinite(length) || length <= 0) continue;
    out.push({ name: r[1], origin: '0x' + origin.toString(16), length, attrs: (r[2] || '').trim() });
  }
  return out;
}

/** Clean a list of {name, origin, length} from settings; origin may be "0x08000000" or a number. */
function cleanRegions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list.slice(0, 32)) {
    if (!r || typeof r.name !== 'string' || !r.name.trim()) continue;
    const o = typeof r.origin === 'number' ? r.origin : scriptNumber(String(r.origin || ''));
    const l = typeof r.length === 'number' ? r.length : scriptNumber(String(r.length || ''));
    if (!Number.isFinite(o) || o < 0 || !Number.isFinite(l) || l <= 0) continue;
    out.push({ name: r.name.trim().slice(0, 40), origin: '0x' + o.toString(16), length: l, attrs: String(r.attrs || '').slice(0, 8), from: r.from });
  }
  return out;
}

function regionsOverride(m, regions) {
  m.regions = [];
  for (const r of cleanRegions(regions)) m.addRegion(r.name, r.origin.replace(/^0x/, ''), r.length, r.attrs);
  if (regions[0] && regions[0].from) m.extra.noRegions = `Memory regions from ${regions[0].from} (the map itself does not list them).`;
  else delete m.extra.noRegions;
  m.done = false;
  m.finish();
}

module.exports = { scriptNumber, parseMemoryBlock, cleanRegions, regionsOverride };

});

const { sniff, createParser, LineSplitter, FORMAT_LABEL } = require('parse');
const Q = require('query');
const R = require('regions');
const CHUNK = 4 << 20, HEAD = 256 * 1024;
let model = null, tables = null, lastFile = null;

async function parseFile(file, regions) {
  const t0 = Date.now(), total = file.size;
  const head = new TextDecoder('utf-8', { fatal: false }).decode(await file.slice(0, Math.min(HEAD, total)).arrayBuffer());
  const kind = sniff(head);
  if (!kind.format) return { notMap: kind, bytes: total };
  const parser = createParser(kind.format);
  const sp = new LineSplitter(l => parser.line(l));
  const dec = new TextDecoder('utf-8', { fatal: false });
  let last = 0;
  for (let off = 0; off < total; off += CHUNK) {
    const end = Math.min(total, off + CHUNK);
    sp.push(dec.decode(new Uint8Array(await file.slice(off, end).arrayBuffer()), { stream: end < total }));
    const now = Date.now();
    if (now - last > 300) { last = now; self.postMessage({ event: 'progress', bytes: end, total }); }
  }
  sp.push(dec.decode()); sp.end();
  const m = parser.finish();
  if (regions && regions.length && !m.regions.length) R.regionsOverride(m, regions);
  m.stats = { lines: sp.lines, longLines: sp.longLines, bytes: total, ms: Date.now() - t0 };
  if (sp.longLines) m.warnings.push(`${sp.longLines} line(s) longer than 256 KB were cut, so the rows on them may be missing.`);
  if (!m.sections.length && !m.nSymbols) m.warnings.push(`No sections or symbols were found in this ${FORMAT_LABEL[m.format]} map.`);
  return { model: m };
}

const handlers = {
  async open({ file, script }) {
    let regions = null;
    if (script) {
      const text = await script.text();
      regions = R.cleanRegions(R.parseMemoryBlock(text));
      if (!regions.length) throw Object.assign(new Error('No MEMORY { } block with regions was found in ' + script.name + '.'), { code: 'NOREGIONS' });
      regions[0].from = script.name;
    }
    const r = await parseFile(file, regions);
    if (r.notMap) return { notMap: r.notMap, bytes: r.bytes };
    model = r.model; tables = new Q.Tables(model); lastFile = file;
    return { summary: Q.summary(model) };
  },
  page({ q }) { return tables.page(q); },
  detail({ kind, rowId }) { return Q.detail(model, kind, rowId); },
  export({ q }) { return tables.export(q, 'csv'); },
};

self.onmessage = async (e) => {
  const { id, cmd } = e.data;
  try {
    if (cmd !== 'open' && !model) throw new Error('no map is open');
    const result = await handlers[cmd](e.data);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: { message: String((err && err.message) || err).slice(0, 400), code: err && err.code } });
  }
};
