/* Zovo JavaScript and TypeScript Playground (TOOLCHK3, wave18): code preparation and the worker runtime.
   prepare() parses the code with acorn (TypeScript with @sveltejs/acorn-typescript), removes TypeScript types by
   blanking them with spaces (so every line keeps its number), and adds value probes after expression statements
   and new variables. workerSource() puts the result after the runtime below; the page runs it as a blob: Worker.
   Nothing here runs the code: the page never calls eval or new Function. */
import * as acorn from 'acorn';
import { tsPlugin } from '@sveltejs/acorn-typescript';

const TSParser = acorn.Parser.extend(tsPlugin());
const OPTS = { ecmaVersion: 'latest', locations: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, allowHashBang: true };

function parse(src, ts) {
  const P = ts ? TSParser : acorn.Parser;
  try { return P.parse(src, { ...OPTS, sourceType: 'module' }); }
  catch (e1) {
    if (ts) throw e1;
    try { return P.parse(src, { ...OPTS, sourceType: 'script' }); } catch (e2) { throw e1; }
  }
}

const isConsoleCall = e => e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && !e.callee.computed &&
  e.callee.object.type === 'Identifier' && e.callee.object.name === 'console';

function bindingNames(p, out = []) {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': for (const q of p.properties) bindingNames(q.type === 'RestElement' ? q.argument : q.value, out); break;
    case 'ArrayPattern': for (const q of p.elements) bindingNames(q, out); break;
    case 'RestElement': bindingNames(p.argument, out); break;
    case 'AssignmentPattern': bindingNames(p.left, out); break;
  }
  return out;
}

const TYPE_ONLY = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSDeclareFunction', 'EmptyStatement']);
function typeOnly(ns) {  // namespace Route { export type A = ... } holds no values
  const b = ns.body;
  if (!b) return true;
  if (b.type === 'TSModuleDeclaration') return typeOnly(b);
  return (b.body || []).every(s => TYPE_ONLY.has(s.type) || (s.type === 'ExportNamedDeclaration' && (s.exportKind === 'type' || (s.declaration && (TYPE_ONLY.has(s.declaration.type) || (s.declaration.type === 'TSModuleDeclaration' && typeOnly(s.declaration)))))) || (s.type === 'TSModuleDeclaration' && typeOnly(s)));
}
const TS_DROP = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSDeclareFunction']);
const MODS = /^(public|private|protected|readonly|abstract|override|declare)\s+/;

/* Returns { code, ts, probes, notes } or { error: { line, col, message } }. */
export function prepare(src, ts) {
  let ast;
  try { ast = parse(src, ts); }
  catch (e) {
    const loc = e.loc || { line: 1, column: 0 };
    return { error: { line: loc.line, col: loc.column + 1, message: 'SyntaxError: ' + String(e.message).replace(/\s*\(\d+:\d+\)$/, '') } };
  }
  const n = src.length;
  const open = new Array(n + 1).fill(''), close = new Array(n + 1).fill(''), blank = new Uint8Array(n + 1), sub = new Map();
  const errors = [], notes = new Set();
  let probes = 0;
  const lineOf = pos => { let l = 1; for (let i = 0; i < pos; i++) if (src.charCodeAt(i) === 10) l++; return l; };
  const blankRange = (a, b, semi) => { for (let i = a; i < b; i++) blank[i] = 1; if (semi && a < b) sub.set(a, ';'); };
  const blankChar = (from, to, ch) => { const i = src.indexOf(ch, from); if (i >= 0 && i < to) blank[i] = 1; };

  function stripModifiers(node) {  // class members and parameter properties: public, private, readonly ...
    let p = node.start, m;
    while ((m = MODS.exec(src.slice(p, Math.min(node.end, p + 40))))) {
      if (src.slice(p + m[1].length).match(/^\s*[(:=;?!<]/)) break;  // a member that is named "public" or "readonly"
      blankRange(p, p + m[1].length); p += m[0].length;
    }
    if (src.startsWith('static', p)) {  // static readonly x
      const q = p + 6 + (/^\s+/.exec(src.slice(p + 6)) || [''])[0].length;
      const m2 = MODS.exec(src.slice(q, q + 40)); if (m2) blankRange(q, q + m2[1].length);
    }
  }

  function enumCode(node) {  // enum E { A, B = 5 } -> var E; (function (E) { E[E["A"] = 0] = "A"; ... })(E || (E = {}));
    const name = node.id.name, text = src.slice(node.start, node.end);
    const parts = text.split('\n').map(() => '');
    parts[0] = `var ${name};(function (${name}) {`;
    let next = 0, auto = true, prevName = null;
    for (const m of node.members) {
      const key = m.id.type === 'Identifier' ? m.id.name : String(m.id.value);
      let stmt;
      if (m.initializer) {
        const init = src.slice(m.initializer.start, m.initializer.end);
        if (m.initializer.type === 'Literal' && typeof m.initializer.value === 'number') { next = m.initializer.value + 1; auto = true; stmt = `${name}[${name}[${JSON.stringify(key)}] = ${init}] = ${JSON.stringify(key)};`; }
        else if (m.initializer.type === 'Literal' && typeof m.initializer.value === 'string') { auto = false; stmt = `${name}[${JSON.stringify(key)}] = ${init};`; }
        else { auto = null; stmt = `${name}[${name}[${JSON.stringify(key)}] = (${init})] = ${JSON.stringify(key)};`; }
      } else if (auto === true) { stmt = `${name}[${name}[${JSON.stringify(key)}] = ${next}] = ${JSON.stringify(key)};`; next++; }
      else if (auto === null && prevName) { stmt = `${name}[${name}[${JSON.stringify(key)}] = ${name}[${JSON.stringify(prevName)}] + 1] = ${JSON.stringify(key)};`; }
      else { errors.push({ line: m.loc.start.line, col: m.loc.start.column + 1, message: 'Enum member must have an initializer.' }); stmt = ''; }
      prevName = key;
      parts[m.loc.start.line - node.loc.start.line] += stmt;
    }
    parts[parts.length - 1] += `})(${name} || (${name} = {}));`;
    return parts.join('\n');
  }

  function walk(node, parent, key) {
    if (!node || typeof node.type !== 'string') return;
    const t = node.type;
    if (ts) {
      if (TS_DROP.has(t) || node.declare || (t === 'TSModuleDeclaration' && (node.declare || node.global))) { blankRange(node.start, node.end, true); return; }
      if (t === 'TSModuleDeclaration' && typeOnly(node)) { blankRange(node.start, node.end, true); return; }
      if (t === 'TSModuleDeclaration') { errors.push({ line: node.loc.start.line, col: node.loc.start.column + 1, message: 'A namespace with values does not run here. Use an object or a module instead.' }); return; }
      if (t === 'TSEnumDeclaration') { sub.set(node.start, enumCode(node)); for (let i = node.start; i < node.end; i++) blank[i] = 2; notes.add('enum'); return; }
      if (t === 'ImportDeclaration' && node.importKind === 'type') { blankRange(node.start, node.end, true); return; }
      if ((t === 'ExportNamedDeclaration' || t === 'ExportAllDeclaration') && node.exportKind === 'type') { blankRange(node.start, node.end, true); return; }
      if (t === 'TSTypeAnnotation' || t === 'TSTypeParameterDeclaration' || t === 'TSTypeParameterInstantiation') { blankRange(node.start, node.end); return; }
      if (t === 'TSAsExpression' || t === 'TSSatisfiesExpression' || t === 'TSInstantiationExpression') {
        const tail = src.slice(node.expression.end, node.end);  // keep a ")" that closes a parenthesized expression
        const m = t === 'TSInstantiationExpression' ? /</.exec(tail) : t === 'TSAsExpression' ? /(^|[\s)\]])as\b/.exec(tail) : /(^|[\s)\]])satisfies\b/.exec(tail);
        blankRange(node.expression.end + (m ? m.index + (m[1] ? m[1].length : 0) : 0), node.end);
        walk(node.expression, node, 'expression'); return;
      }
      if (t === 'TSTypeAssertion') { const gt = src.indexOf('>', node.typeAnnotation.end); blankRange(node.start, gt >= 0 && gt < node.expression.end ? gt + 1 : node.expression.start); walk(node.expression, node, 'expression'); return; }
      if (t === 'TSNonNullExpression') { blankChar(node.expression.end, node.end, '!'); walk(node.expression, node, 'expression'); return; }
      if (t === 'TSDeclareMethod' || (t === 'MethodDefinition' && node.value && node.value.type === 'TSDeclareMethod') || ((t === 'MethodDefinition' || t === 'PropertyDefinition') && (node.abstract || node.declare)) || t === 'TSIndexSignature') { blankRange(node.start, node.end, true); return; }
      if (t === 'MethodDefinition' || t === 'PropertyDefinition') {
        stripModifiers(node);
        if (node.optional || node.definite) blankChar(node.key.end, node.value ? node.value.start : node.end, node.optional ? '?' : '!');
      }
      if (t === 'ClassDeclaration' || t === 'ClassExpression') {
        if (node.abstract && src.startsWith('abstract', node.start)) blankRange(node.start, node.start + 8);
        if (node.implements && node.implements.length) {
          const from = (node.superClass || node.typeParameters || node.id || { end: node.start + 5 }).end;
          const kw = src.indexOf('implements', from);
          if (kw >= 0) blankRange(kw, node.implements[node.implements.length - 1].end);
        }
        if (node.superTypeParameters) blankRange(node.superTypeParameters.start, node.superTypeParameters.end);
      }
      if (t === 'VariableDeclarator' && node.definite && node.id.type === 'Identifier') blankChar(node.id.start + node.id.name.length, node.end, '!');
      if (t === 'Identifier' && (node.optional || node.definite) && node.typeAnnotation) blankChar(node.start + node.name.length, node.typeAnnotation.start, node.optional ? '?' : '!');
      else if (t === 'Identifier' && node.optional) blankChar(node.start + node.name.length, node.end + 1, '?');
      if (t === 'ArrowFunctionExpression' && node.returnType && src.slice(node.returnType.start, node.returnType.end).includes('\n')) {
        // no line break may come before =>: move the ")" of the parameters to the end of the blanked return type
        const rp = src.lastIndexOf(')', node.returnType.start);
        if (rp > node.start) { blank[rp] = 1; close[node.returnType.end] = ')' + close[node.returnType.end]; }
      }
      if ((t === 'FunctionDeclaration' || t === 'FunctionExpression' || t === 'ArrowFunctionExpression') && node.params) {
        const props = node.params.filter(p => p.type === 'TSParameterProperty');
        for (const p of node.params) if (p.type === 'Identifier' && p.name === 'this' && p.typeAnnotation) {  // function f(this: Foo, x)
          let e = p.end; const c = src.indexOf(',', e); blankRange(p.start, c >= 0 && c < node.body.start ? c + 1 : e);
        }
        if (props.length && node.body && node.body.type === 'BlockStatement') {
          const sup = node.body.body.find(s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && s.expression.callee.type === 'Super');
          const at = sup ? sup.end : node.body.start + 1;
          close[at] += ';' + props.map(p => { const id = p.parameter.type === 'AssignmentPattern' ? p.parameter.left : p.parameter; return `this.${id.name} = ${id.name};`; }).join(' ');
          for (const p of props) stripModifiers(p);
        }
      }
    }
    if (t === 'Decorator') { errors.push({ line: node.loc.start.line, col: node.loc.start.column + 1, message: 'Decorators do not run here.' }); return; }
    if (t === 'TSImportEqualsDeclaration') {
      if (node.importKind === 'type') { blankRange(node.start, node.end, true); return; }
      if (node.moduleReference && node.moduleReference.type === 'TSExternalModuleReference') { errors.push({ line: node.loc.start.line, col: 1, message: 'import = require() does not work here: the browser has no node_modules.' }); return; }
      const k = src.indexOf('import', node.start); if (k >= 0) { blankRange(node.start, k + 6); sub.set(node.start, 'var'); }
      return;
    }
    if (t === 'ImportDeclaration') { errors.push({ line: node.loc.start.line, col: 1, message: 'import does not work here: the browser has no node_modules. Paste the code you need, or run the file in the VS Code extension.' }); return; }
    if (t === 'ExportNamedDeclaration') {
      if (node.declaration) { blankRange(node.start, node.declaration.start); }
      else { blankRange(node.start, node.end, true); return; }
    }
    if (t === 'ExportAllDeclaration') { blankRange(node.start, node.end, true); return; }
    if (t === 'ExportDefaultDeclaration') {
      const d = node.declaration;
      if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) blankRange(node.start, d.start);
      else { sub.set(node.start, 'var __default ='); blankRange(node.start, d.start); }
    }
    // value probes in statement lists
    const list = t === 'Program' || t === 'BlockStatement' || t === 'StaticBlock' ? node.body : t === 'SwitchCase' ? node.consequent : null;
    if (list) for (const s of list) {
      const st = s.type === 'ExportNamedDeclaration' && s.declaration ? s.declaration : s;
      const line = st.loc.start.line;
      if (st.type === 'ExpressionStatement' && !st.directive && !isConsoleCall(st.expression)) {
        const e = st.expression;
        open[e.start] += `__zv(${line},(`; close[e.end] = (e.type === 'CallExpression' || (e.type === 'AwaitExpression' && e.argument.type === 'CallExpression') ? '),1)' : '))') + close[e.end]; probes++;
      } else if (st.type === 'VariableDeclaration' && !st.declare) {
        const names = st.declarations.flatMap(d => bindingNames(d.id));
        if (names.length) { close[st.end] = `;__zd(${line},${JSON.stringify(names)},[${names.join(',')}]);` + close[st.end]; probes++; }
      }
    }
    for (const k in node) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, node, k); }
      else if (v && typeof v.type === 'string') walk(v, node, k);
    }
  }
  walk(ast, null, null);
  if (errors.length) { errors.sort((a, b) => a.line - b.line); return { error: errors[0], errors }; }
  let out = '';
  for (let i = 0; i <= n; i++) {
    out += close[i] + open[i];
    if (sub.has(i)) out += sub.get(i);
    if (i === n) break;
    const c = src[i];
    out += blank[i] === 2 ? '' : blank[i] ? (c === '\n' || c === '\r' ? c : ' ') : c;
  }
  return { code: out.replace(/^#!.*/, ''), probes, notes: [...notes] };
}

/* The runtime that runs inside the Worker, before the user's code. Stringified into the blob, never called here. */
function zovoRuntime(o) {
  'use strict';
  const post = self.postMessage.bind(self);
  const OFF = o.offset, MAXV = o.maxValues, MAXLOG = 2000, MAXLEN = 2000, URL0 = self.location.href;
  for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'WebTransport', 'FileReaderSync']) {
    try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch (e) { /* not there */ }
  }
  const quote = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  const idKey = k => /^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k);
  function fmt(v, depth, seen, top) {
    try {
      const t = typeof v;
      if (v === null) return 'null';
      if (t === 'undefined') return 'undefined';
      if (t === 'string') return top === 'raw' ? v : quote(v);
      if (t === 'number') return Object.is(v, -0) ? '-0' : String(v);
      if (t === 'bigint') return v + 'n';
      if (t === 'boolean') return String(v);
      if (t === 'symbol') return v.toString();
      if (t === 'function') {
        const src = Function.prototype.toString.call(v);
        if (/^class\b/.test(src)) return `[class ${v.name || '(anonymous)'}]`;
        const kind = v.constructor && v.constructor.name === 'AsyncFunction' ? 'AsyncFunction' : v.constructor && v.constructor.name === 'GeneratorFunction' ? 'GeneratorFunction' : 'Function';
        return `[${kind}: ${v.name || '(anonymous)'}]`;
      }
      if (seen.has(v)) return '[Circular]';
      const tag = Object.prototype.toString.call(v).slice(8, -1);
      if (v instanceof Date) return isNaN(v) ? 'Invalid Date' : v.toISOString();
      if (v instanceof RegExp) return String(v);
      if (v instanceof Error) return (v.name || 'Error') + ': ' + v.message;
      if (typeof v.then === 'function' && tag === 'Promise') return 'Promise { <pending> }';
      if (tag === 'WeakMap' || tag === 'WeakSet') return tag + ' { <items unknown> }';
      if (tag === 'ArrayBuffer') return `ArrayBuffer { byteLength: ${v.byteLength} }`;
      if (depth > 2) return Array.isArray(v) ? '[Array]' : '[' + (v.constructor && v.constructor.name || 'Object') + ']';
      seen.add(v);
      let items = [], more = 0, head = '';
      const list = (arr, f) => { for (let i = 0; i < arr.length; i++) { if (i >= 50) { more = arr.length - 50; break; } items.push(f(arr[i], i)); } };
      if (Array.isArray(v)) list(v, x => x === undefined && false ? '' : fmt(x, depth + 1, seen));
      else if (ArrayBuffer.isView(v) && !(v instanceof DataView)) { head = `${v.constructor.name}(${v.length}) `; list(Array.from(v.slice(0, 51)), x => fmt(x, depth + 1, seen)); if (v.length > 50) more = v.length - 50; }
      else if (v instanceof Map) { head = `Map(${v.size}) `; list([...v].slice(0, 51), ([k, x]) => fmt(k, depth + 1, seen) + ' => ' + fmt(x, depth + 1, seen)); if (v.size > 50) more = v.size - 50; }
      else if (v instanceof Set) { head = `Set(${v.size}) `; list([...v].slice(0, 51), x => fmt(x, depth + 1, seen)); if (v.size > 50) more = v.size - 50; }
      else {
        const proto = Object.getPrototypeOf(v);
        const cn = proto === null ? '[Object: null prototype] ' : proto.constructor && proto.constructor.name && proto.constructor.name !== 'Object' ? proto.constructor.name + ' ' : '';
        head = cn;
        const keys = Object.keys(v);
        list(keys, k => idKey(k) + ': ' + fmt(v[k], depth + 1, seen));
        if (keys.length > 50) more = keys.length - 50;
      }
      seen.delete(v);
      if (more) items.push(`... ${more} more item${more > 1 ? 's' : ''}`);
      const isArr = Array.isArray(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView));
      const [a, b] = isArr ? ['[', ']'] : ['{', '}'];
      return items.length ? `${head}${a} ${items.join(', ')} ${b}` : `${head}${a}${b}`;
    } catch (e) { return '[value that cannot be read]'; }
  }
  const show = (v, raw) => { const s = fmt(v, 0, new Set(), raw ? 'raw' : true); return s.length > MAXLEN ? s.slice(0, MAXLEN) + '…' : s; };
  function lineFromStack(stack) {
    for (const ln of String(stack || '').split('\n')) {
      if (!ln.includes(URL0)) continue;
      const m = /:(\d+):(\d+)\)?\s*$/.exec(ln);
      if (m && +m[1] > OFF) return +m[1] - OFF;
    }
    return 0;
  }
  const counts = new Map();
  let extra = new Map(), last = Date.now(), logs = 0, logsCut = 0;
  const flush = () => { if (extra.size) { post({ t: 'n', c: [...extra] }); extra = new Map(); } if (logsCut) { post({ t: 'logcut', n: logsCut }); } last = Date.now(); };
  function value(line, text) {
    const c = (counts.get(line) || 0) + 1; counts.set(line, c);
    if (c <= MAXV) post({ t: 'v', line, text }); else { extra.set(line, c - MAXV); if (Date.now() - last > 120) flush(); }
  }
  let pend = 0, mainDone = false;
  const timers = new Set();
  const maybeDone = () => { if (mainDone && pend === 0 && timers.size === 0) { flush(); post({ t: 'done' }); } };
  function watchPromise(line, p, pre = '') {
    pend++;
    Promise.resolve(p).then(r => post({ t: 'pr', line, text: pre + 'Promise → ' + show(r) }), e => post({ t: 'pr', line, text: pre + 'Promise ✖ ' + show(e) }))
      .finally(() => { pend--; maybeDone(); });
  }
  Object.defineProperty(self, '__zv', { value: (line, v, call) => {
    if (call && v === undefined) return v;  // f() that returns nothing: no value to show
    if (v && typeof v === 'object' && typeof v.then === 'function') { value(line, 'Promise (pending)'); watchPromise(line, v); }
    else value(line, show(v));
    return v;
  } });
  Object.defineProperty(self, '__zd', { value: (line, names, vals) => {
    const th = v => v && typeof v === 'object' && typeof v.then === 'function';
    value(line, names.map((nm, i) => nm + ' = ' + (th(vals[i]) ? 'Promise (pending)' : show(vals[i]))).join(', '));
    vals.forEach((v, i) => { if (th(v)) watchPromise(line, v, names.length === 1 ? names[0] + ' = ' : ''); });
  } });
  function fmtArgs(args) {
    if (typeof args[0] === 'string' && /%[sdifoOjc%]/.test(args[0])) {
      let i = 1;
      const s = args[0].replace(/%([sdifoOjc%])/g, (m, c) => {
        if (c === '%') return '%';
        if (i >= args.length) return m;
        const a = args[i++];
        return c === 's' ? (typeof a === 'string' ? a : show(a)) : c === 'd' || c === 'i' ? String(parseInt(a)) : c === 'f' ? String(parseFloat(a)) : c === 'c' ? '' : show(a);
      });
      return [s, ...args.slice(i).map(a => show(a, true))].join(' ');
    }
    return args.map(a => show(a, true)).join(' ');
  }
  function log(level, text) {
    if (++logs > MAXLOG) { logsCut++; if (Date.now() - last > 120) flush(); return; }
    post({ t: 'log', level, line: lineFromStack(new Error().stack), text });
  }
  const cnt = new Map(), tm = new Map();
  const con = {
    log: (...a) => log('log', fmtArgs(a)), info: (...a) => log('info', fmtArgs(a)), debug: (...a) => log('debug', fmtArgs(a)),
    warn: (...a) => log('warn', fmtArgs(a)), error: (...a) => log('error', fmtArgs(a)), trace: (...a) => log('log', 'Trace: ' + fmtArgs(a)),
    dir: v => log('log', show(v)), table: (v) => log('log', show(v)),
    assert: (c, ...a) => { if (!c) log('error', 'Assertion failed' + (a.length ? ': ' + fmtArgs(a) : '')); },
    count: (l = 'default') => { const c = (cnt.get(l) || 0) + 1; cnt.set(l, c); log('log', `${l}: ${c}`); }, countReset: (l = 'default') => cnt.delete(l),
    time: (l = 'default') => tm.set(l, performance.now()),
    timeEnd: (l = 'default') => { if (tm.has(l)) { log('log', `${l}: ${(performance.now() - tm.get(l)).toFixed(3)} ms`); tm.delete(l); } },
    timeLog: (l = 'default', ...a) => { if (tm.has(l)) log('log', `${l}: ${(performance.now() - tm.get(l)).toFixed(3)} ms` + (a.length ? ' ' + fmtArgs(a) : '')); },
    group: (...a) => { if (a.length) log('log', fmtArgs(a)); }, groupCollapsed: (...a) => { if (a.length) log('log', fmtArgs(a)); }, groupEnd: () => {}, clear: () => {},
  };
  Object.defineProperty(self, 'console', { value: con, writable: true, configurable: true });
  self.require = m => { throw new Error(`require(${quote(String(m))}) does not work here: the browser has no Node.js and no node_modules. The VS Code extension runs it with Node.js.`); };
  const st = self.setTimeout.bind(self), si = self.setInterval.bind(self), ct = self.clearTimeout.bind(self), ci = self.clearInterval.bind(self);
  self.setTimeout = (f, ms, ...a) => { const id = st(() => { timers.delete(id); try { if (typeof f === 'function') f(...a); } finally { maybeDone(); } }, ms); timers.add(id); return id; };
  self.setInterval = (f, ms, ...a) => { const id = si(f, ms, ...a); timers.add(id); return id; };
  self.clearTimeout = id => { ct(id); timers.delete(id); maybeDone(); };
  self.clearInterval = id => { ci(id); timers.delete(id); maybeDone(); };
  const errText = e => e instanceof Error || (e && typeof e === 'object' && 'message' in e && 'name' in e) ? `${e.name}: ${e.message}` : 'Uncaught ' + show(e);
  self.addEventListener('error', ev => { ev.preventDefault(); post({ t: 'err', line: ev.error ? lineFromStack(ev.error.stack) || (ev.lineno > OFF ? ev.lineno - OFF : 0) : (ev.lineno > OFF ? ev.lineno - OFF : 0), text: ev.error ? errText(ev.error) : String(ev.message) }); maybeDone(); });
  self.addEventListener('unhandledrejection', ev => { ev.preventDefault(); const r = ev.reason; post({ t: 'err', line: lineFromStack(r && r.stack), text: 'Uncaught (in promise) ' + (r instanceof Error ? errText(r) : show(r)) }); });
  Object.defineProperty(self, '__zend', { value: (e, failed) => {
    if (failed) post({ t: 'err', line: lineFromStack(e && e.stack), text: errText(e) });
    mainDone = true; post({ t: 'main' }); maybeDone();
  } });
}

/* The source of the worker: the runtime, then the prepared code inside an async function (top-level await works). */
export function workerSource(code, maxValues = 100) {
  const head0 = `(${zovoRuntime.toString()})(__OPTS__);\nself.__zmain = (async () => {`;
  const offset = (head0.match(/\n/g) || []).length;
  const head = head0.replace('__OPTS__', JSON.stringify({ offset, maxValues }));
  return { source: `${head}${code}\n})();\nself.__zmain.then(() => self.__zend(null, false), e => self.__zend(e, true));\n`, offset };
}
