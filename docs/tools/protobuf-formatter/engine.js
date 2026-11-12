/* Zovo Protobuf & Proto3 Formatter 0.1.0 core, for the browser tool page (built by sprint/tools/bundle_tc4.py
   from protobuf-vscode commit 1093892a2688). MIT license, github.com/theluckystrike/protobuf-vscode. No network code. */
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // ../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/lexer.js
  var require_lexer = __commonJS({
    "../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/lexer.js"(exports, module) {
      "use strict";
      var SYMBOLS = /* @__PURE__ */ new Set(["{", "}", "(", ")", "[", "]", "<", ">", ";", ",", "=", ".", ":", "-", "+", "/", "*"]);
      function tokenize(text) {
        const tokens = [];
        const errors = [];
        let i = 0;
        let line = 0;
        let col = 0;
        let nl = 0;
        const n = text.length;
        const adv = (k) => {
          for (let j = 0; j < k; j++) {
            if (text.charCodeAt(i) === 10) {
              line++;
              col = 0;
            } else col++;
            i++;
          }
        };
        while (i < n) {
          const c = text[i];
          if (c === "\n") {
            nl++;
            adv(1);
            continue;
          }
          if (c === " " || c === "	" || c === "\r" || c === "\f" || c === "\v" || c === "\uFEFF") {
            adv(1);
            continue;
          }
          const start = i;
          const sl = line;
          const sc = col;
          let kind;
          if (c === "/" && text[i + 1] === "/") {
            let j = i;
            while (j < n && text[j] !== "\n") j++;
            adv(j - i);
            kind = "comment";
          } else if (c === "/" && text[i + 1] === "*") {
            const j = text.indexOf("*/", i + 2);
            if (j < 0) {
              errors.push({ message: "This block comment is not closed with */.", line: sl, col: sc, endLine: sl, endCol: sc + 2 });
              adv(n - i);
            } else adv(j + 2 - i);
            kind = "comment";
          } else if (/[A-Za-z_]/.test(c)) {
            let j = i + 1;
            while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
            adv(j - i);
            kind = "ident";
          } else if (/[0-9]/.test(c) || c === "." && /[0-9]/.test(text[i + 1] || "")) {
            let j = i;
            let isFloat = false;
            if (c === "0" && (text[i + 1] === "x" || text[i + 1] === "X")) {
              j += 2;
              while (j < n && /[0-9A-Fa-f]/.test(text[j])) j++;
            } else {
              while (j < n && /[0-9]/.test(text[j])) j++;
              if (text[j] === ".") {
                isFloat = true;
                j++;
                while (j < n && /[0-9]/.test(text[j])) j++;
              }
              if (text[j] === "e" || text[j] === "E") {
                let k = j + 1;
                if (text[k] === "+" || text[k] === "-") k++;
                if (/[0-9]/.test(text[k] || "")) {
                  isFloat = true;
                  j = k;
                  while (j < n && /[0-9]/.test(text[j])) j++;
                }
              }
              if ((text[j] === "f" || text[j] === "F") && isFloat) j++;
            }
            adv(j - i);
            kind = isFloat ? "float" : "int";
          } else if (c === '"' || c === "'") {
            let j = i + 1;
            let closed = false;
            while (j < n) {
              const d = text[j];
              if (d === "\\") {
                j += 2;
                continue;
              }
              if (d === c) {
                closed = true;
                j++;
                break;
              }
              if (d === "\n") break;
              j++;
            }
            if (!closed) errors.push({ message: "This string is not closed on its line.", line: sl, col: sc, endLine: sl, endCol: sc + (j - i) });
            adv(Math.min(j, n) - i);
            kind = "string";
          } else if (SYMBOLS.has(c)) {
            adv(1);
            kind = "sym";
          } else {
            errors.push({ message: `Unexpected character "${c}".`, line: sl, col: sc, endLine: sl, endCol: sc + 1 });
            adv(1);
            kind = "sym";
          }
          tokens.push({ kind, value: text.slice(start, i), start, end: i, line: sl, col: sc, endLine: line, endCol: col, nlBefore: nl });
          nl = 0;
        }
        return { tokens, errors, trailingNewlines: nl };
      }
      function unquote(tok) {
        const s = tok.value;
        const q = s[0];
        const body = s.endsWith(q) && s.length > 1 ? s.slice(1, -1) : s.slice(1);
        let out = "";
        for (let i = 0; i < body.length; i++) {
          const ch = body[i];
          if (ch !== "\\") {
            out += ch;
            continue;
          }
          const e = body[++i];
          if (e === "n") out += "\n";
          else if (e === "t") out += "	";
          else if (e === "r") out += "\r";
          else if (e === "a") out += "\x07";
          else if (e === "b") out += "\b";
          else if (e === "f") out += "\f";
          else if (e === "v") out += "\v";
          else if (e === "x" || e === "X") {
            const m = /^[0-9A-Fa-f]{1,2}/.exec(body.slice(i + 1));
            if (m) {
              out += String.fromCharCode(parseInt(m[0], 16));
              i += m[0].length;
            }
          } else if (e === "u" || e === "U") {
            const len = e === "u" ? 4 : 8;
            const h = body.slice(i + 1, i + 1 + len);
            if (/^[0-9A-Fa-f]+$/.test(h)) {
              out += String.fromCodePoint(parseInt(h, 16));
              i += len;
            }
          } else if (/[0-7]/.test(e || "")) {
            const m = /^[0-7]{1,3}/.exec(body.slice(i));
            out += String.fromCharCode(parseInt(m[0], 8));
            i += m[0].length - 1;
          } else if (e !== void 0) out += e;
        }
        return out;
      }
      function intValue(tok) {
        const v = tok.value;
        if (/^0[xX]/.test(v)) return parseInt(v.slice(2), 16);
        if (/^0[0-7]+$/.test(v)) return parseInt(v, 8);
        if (/^[0-9]+$/.test(v)) return Number(v);
        return NaN;
      }
      module.exports = { tokenize, unquote, intValue };
    }
  });

  // ../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/parser.js
  var require_parser = __commonJS({
    "../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/parser.js"(exports, module) {
      "use strict";
      var { tokenize, unquote, intValue } = require_lexer();
      var SCALARS = /* @__PURE__ */ new Set(["double", "float", "int32", "int64", "uint32", "uint64", "sint32", "sint64", "fixed32", "fixed64", "sfixed32", "sfixed64", "bool", "string", "bytes"]);
      var LABELS = /* @__PURE__ */ new Set(["optional", "required", "repeated"]);
      var MAX_FIELD = 536870911;
      function rangeOf(a, b) {
        b = b || a;
        return { line: a.line, col: a.col, endLine: b.endLine, endCol: b.endCol };
      }
      function cleanComment(raw) {
        if (raw.startsWith("//")) return raw.replace(/^\/\/\/?\s?/, "");
        let s = raw.replace(/^\/\*+/, "").replace(/\*+\/$/, "");
        const lines = s.split("\n").map((l) => l.replace(/^\s*\*( |$)/, "").replace(/^\s+/, (m) => m));
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length));
        return lines.map((l) => l.slice(Number.isFinite(ind) ? ind : 0)).join("\n");
      }
      function parse(text) {
        const { tokens: all, errors: lexErrors } = tokenize(text);
        const sig = [];
        const sigIndexInAll = [];
        all.forEach((t, i) => {
          if (t.kind !== "comment") {
            sig.push(t);
            sigIndexInAll.push(i);
          }
        });
        function leading(si) {
          const ai = sigIndexInAll[si];
          if (ai === void 0) return "";
          const out = [];
          let gap = all[ai].nlBefore;
          for (let k = ai - 1; k >= 0 && all[k].kind === "comment"; k--) {
            if (gap > 1) break;
            const c = all[k];
            if (c.nlBefore === 0 && k > 0) break;
            out.unshift(cleanComment(c.value));
            gap = c.nlBefore;
          }
          return out.join("\n").trim();
        }
        function trailing(si) {
          const ai = sigIndexInAll[si];
          if (ai === void 0) return "";
          const c = all[ai + 1];
          if (c && c.kind === "comment" && c.nlBefore === 0) return cleanComment(c.value).trim();
          return "";
        }
        const errors = lexErrors.map((e) => ({ ...e, severity: "error" }));
        const file = {
          syntax: null,
          syntaxRange: null,
          edition: null,
          package: null,
          packageRange: null,
          imports: [],
          options: [],
          messages: [],
          enums: [],
          services: [],
          extends: [],
          refs: [],
          optionRefs: [],
          errors,
          tokens: all,
          text
        };
        let p = 0;
        const EOF = { kind: "eof", value: "", line: sig.length ? sig[sig.length - 1].endLine : 0, col: sig.length ? sig[sig.length - 1].endCol : 0, endLine: sig.length ? sig[sig.length - 1].endLine : 0, endCol: sig.length ? sig[sig.length - 1].endCol : 0 };
        const peek = (k = 0) => sig[p + k] || EOF;
        const next = () => sig[p++] || EOF;
        const is = (v, k = 0) => {
          const t = peek(k);
          return t.kind !== "eof" && t.kind !== "string" && t.value === v;
        };
        const isIdent = (k = 0) => peek(k).kind === "ident";
        const err = (tok, message2, severity = "error") => {
          errors.push({ message: message2, line: tok.line, col: tok.col, endLine: tok.kind === "eof" ? tok.line : tok.endLine, endCol: tok.kind === "eof" ? tok.col : tok.endCol, severity });
        };
        class Stop extends Error {
        }
        const expect = (v, what) => {
          if (is(v)) return next();
          err(peek(), `Expected ${what || `"${v}"`}.`);
          throw new Stop();
        };
        const expectIdent = (what) => {
          if (isIdent()) return next();
          err(peek(), `Expected ${what}.`);
          throw new Stop();
        };
        function recover() {
          let depth = 0;
          while (peek().kind !== "eof") {
            const t = peek();
            if (t.kind === "sym" && t.value === "{") {
              depth++;
              next();
              continue;
            }
            if (t.kind === "sym" && t.value === "}") {
              if (depth === 0) return;
              depth--;
              next();
              if (depth === 0) {
                if (is(";")) next();
                return;
              }
              continue;
            }
            if (t.kind === "sym" && t.value === ";" && depth === 0) {
              next();
              return;
            }
            next();
          }
        }
        function fullIdent(allowDot) {
          const first2 = peek();
          let name = "";
          if (allowDot && is(".")) {
            next();
            name = ".";
          }
          const a = expectIdent("a name");
          name += a.value;
          let last = a;
          while (is(".") && peek(1).kind === "ident") {
            next();
            last = next();
            name += "." + last.value;
          }
          return { name, range: rangeOf(first2, last), first: first2, last };
        }
        function optionName() {
          const first2 = peek();
          let name = "";
          const ext = [];
          let last = first2;
          for (; ; ) {
            if (is("(")) {
              next();
              const f = fullIdent(true);
              last = expect(")", '")"');
              name += `(${f.name})`;
              ext.push({ name: f.name, range: f.range });
            } else {
              last = expectIdent("an option name");
              name += last.value;
            }
            if (is(".")) {
              next();
              name += ".";
              continue;
            }
            break;
          }
          return { name, range: rangeOf(first2, last), ext };
        }
        function constant() {
          const first2 = peek();
          if (is("{")) {
            let depth = 0;
            let last = first2;
            do {
              const t2 = next();
              if (t2.kind === "eof") {
                err(t2, 'Reached end of input in an option value (missing "}").');
                throw new Stop();
              }
              if (t2.kind === "sym" && t2.value === "{") depth++;
              if (t2.kind === "sym" && t2.value === "}") depth--;
              last = t2;
            } while (depth > 0);
            return { kind: "aggregate", text: text.slice(first2.start, last.end), range: rangeOf(first2, last) };
          }
          if (first2.kind === "string") {
            let s = "";
            let last = first2;
            while (peek().kind === "string") {
              last = next();
              s += unquote(last);
            }
            return { kind: "string", value: s, text: text.slice(first2.start, last.end), range: rangeOf(first2, last) };
          }
          let sign = "";
          if (is("-") || is("+")) sign = next().value;
          const t = peek();
          if (t.kind === "int" || t.kind === "float") {
            next();
            return { kind: t.kind, value: sign === "-" ? -Number(t.kind === "int" ? intValue(t) : parseFloat(t.value)) : Number(t.kind === "int" ? intValue(t) : parseFloat(t.value)), text: sign + t.value, range: rangeOf(first2, t) };
          }
          if (t.kind === "ident") {
            const f = fullIdent(false);
            return { kind: "ident", value: sign + f.name, text: sign + f.name, range: rangeOf(first2, f.last) };
          }
          err(t, "Expected a constant value.");
          throw new Stop();
        }
        function fieldOptions() {
          const list = [];
          if (!is("[")) return list;
          next();
          for (; ; ) {
            const nm = optionName();
            for (const e of nm.ext) file.optionRefs.push(e);
            expect("=", '"="');
            const v = constant();
            list.push({ name: nm.name, nameRange: nm.range, value: v });
            if (is(",")) {
              next();
              continue;
            }
            expect("]", '"]"');
            break;
          }
          return list;
        }
        function optionStatement(owner) {
          const kw = next();
          const nm = optionName();
          for (const e of nm.ext) file.optionRefs.push(e);
          expect("=", '"="');
          const v = constant();
          const end = expect(";", '";"');
          owner.push({ name: nm.name, nameRange: nm.range, value: v, range: rangeOf(kw, end) });
        }
        function typeRef(container, kind) {
          const f = fullIdent(true);
          if (!SCALARS.has(f.name)) file.refs.push({ name: f.name, range: f.range, container, kind });
          return f;
        }
        function ranges(owner, allowNames, kw) {
          const out = { ranges: [], names: [] };
          for (; ; ) {
            const t = peek();
            if (t.kind === "string" && allowNames) {
              next();
              out.names.push({ name: unquote(t), range: rangeOf(t) });
            } else if (t.kind === "ident" && allowNames && t.value !== "max") {
              next();
              out.names.push({ name: t.value, range: rangeOf(t), bare: true });
            } else {
              let neg = false;
              const st = peek();
              if (is("-")) {
                next();
                neg = true;
              }
              const a = peek();
              if (a.kind !== "int") {
                err(a, `Expected ${allowNames ? "a field number or a name" : "a field number"}.`);
                throw new Stop();
              }
              next();
              let lo = intValue(a) * (neg ? -1 : 1);
              let hi = lo;
              let endTok = a;
              if (is("to")) {
                next();
                if (is("max")) {
                  endTok = next();
                  hi = owner === "enum" ? 2147483647 : MAX_FIELD;
                } else {
                  let n2 = false;
                  if (is("-")) {
                    next();
                    n2 = true;
                  }
                  const b = peek();
                  if (b.kind !== "int") {
                    err(b, "Expected an integer.");
                    throw new Stop();
                  }
                  next();
                  endTok = b;
                  hi = intValue(b) * (n2 ? -1 : 1);
                }
              }
              if (hi < lo) err(st, "Reserved range end number must be greater than start number.");
              out.ranges.push({ lo, hi, range: rangeOf(st, endTok), text: text.slice(st.start, endTok.end) });
            }
            if (is(",")) {
              next();
              continue;
            }
            break;
          }
          void kw;
          return out;
        }
        function newMessage(nameTok, parent, extra) {
          return {
            kind: "message",
            name: nameTok.value,
            nameRange: rangeOf(nameTok),
            range: null,
            parent,
            fields: [],
            oneofs: [],
            messages: [],
            enums: [],
            extends: [],
            reserved: { ranges: [], names: [] },
            extensions: [],
            options: [],
            comment: "",
            ...extra
          };
        }
        function field(msg, oneof, inExtend) {
          const first2 = peek();
          const startIdx = p;
          let label = null;
          let labelTok = null;
          if (peek().kind === "ident" && LABELS.has(peek().value) && (isIdent(1) || is(".", 1))) {
            labelTok = next();
            label = labelTok.value;
          }
          if (is("group") && isIdent(1) && is("=", 2)) {
            const gk = next();
            const nameTok2 = next();
            if (!/^[A-Z]/.test(nameTok2.value)) err(nameTok2, "Group names must start with a capital letter.");
            next();
            const numTok2 = peek();
            if (numTok2.kind !== "int") {
              err(numTok2, "Expected field number.");
              throw new Stop();
            }
            next();
            const opts2 = fieldOptions();
            const g = newMessage(nameTok2, msg, { isGroup: true, comment: leading(startIdx) });
            expect("{", '"{"');
            messageBody(g);
            const close = expect("}", '"}"');
            g.range = rangeOf(first2, close);
            msg.messages.push(g);
            const f = {
              kind: "field",
              label,
              labelTok: labelTok && rangeOf(labelTok),
              type: nameTok2.value,
              typeRange: rangeOf(nameTok2),
              name: nameTok2.value.toLowerCase(),
              nameRange: rangeOf(nameTok2),
              number: intValue(numTok2),
              numberRange: rangeOf(numTok2),
              options: opts2,
              comment: g.comment,
              oneof: oneof ? oneof.name : null,
              group: g,
              range: rangeOf(first2, close),
              groupTok: rangeOf(gk)
            };
            file.refs.push({ name: nameTok2.value, range: rangeOf(nameTok2), container: msg, kind: "field", group: true });
            return f;
          }
          let map = null;
          let type;
          let typeRange;
          if (is("map") && is("<", 1)) {
            const mk = next();
            next();
            const k = fullIdent(false);
            expect(",", '","');
            const v = typeRef(msg, "map");
            const gt = expect(">", '">"');
            map = { key: k.name, keyRange: k.range, value: v.name, valueRange: v.range };
            type = `map<${k.name}, ${v.name}>`;
            typeRange = rangeOf(mk, gt);
          } else {
            const t = typeRef(inExtend ? inExtend.parent : msg, "field");
            type = t.name;
            typeRange = t.range;
          }
          const nameTok = expectIdent("field name");
          expect("=", '"="');
          let neg = false;
          if (is("-")) {
            next();
            neg = true;
          }
          const numTok = peek();
          if (numTok.kind !== "int") {
            err(numTok, "Expected field number.");
            throw new Stop();
          }
          next();
          const opts = fieldOptions();
          const end = expect(";", '";"');
          return {
            kind: "field",
            label,
            labelTok: labelTok && rangeOf(labelTok),
            type,
            typeRange,
            name: nameTok.value,
            nameRange: rangeOf(nameTok),
            number: intValue(numTok) * (neg ? -1 : 1),
            numberRange: rangeOf(numTok),
            options: opts,
            comment: leading(startIdx),
            trailing: trailing(p - 1),
            oneof: oneof ? oneof.name : null,
            map,
            range: rangeOf(first2, end)
          };
        }
        function statement(fn) {
          const save = p;
          try {
            fn();
          } catch (e) {
            if (!(e instanceof Stop)) throw e;
            if (p === save) next();
            recover();
          }
        }
        function messageBody(msg) {
          while (!is("}") && peek().kind !== "eof") {
            const t = peek();
            if (is(";")) {
              next();
              continue;
            }
            statement(() => {
              if (is("message") && isIdent(1) && is("{", 2)) return message(msg, msg.messages);
              if (is("enum") && isIdent(1) && is("{", 2)) return enumDef(msg, msg.enums);
              if (is("extend") && (isIdent(1) || is(".", 1))) return extend(msg, msg.extends);
              if (is("option") && (isIdent(1) || is("(", 1))) return optionStatement(msg.options);
              if (is("oneof") && isIdent(1) && is("{", 2)) return oneofDef(msg);
              if (is("reserved") && (peek(1).kind === "int" || peek(1).kind === "string" || is("-", 1) || isIdent(1) && !is("=", 2) && !is(".", 2) && !isIdent(2))) {
                const kw = next();
                const r = ranges("message", true, kw);
                const end = expect(";", '";"');
                msg.reserved.ranges.push(...r.ranges.map((x) => ({ ...x, stmt: rangeOf(kw, end) })));
                msg.reserved.names.push(...r.names);
                return;
              }
              if (is("extensions") && peek(1).kind === "int") {
                const kw = next();
                const r = ranges("message", false, kw);
                const opts = fieldOptions();
                expect(";", '";"');
                msg.extensions.push(...r.ranges.map((x) => ({ ...x, options: opts, kwRange: rangeOf(kw) })));
                return;
              }
              if (t.kind !== "ident" && !is(".")) {
                err(t, 'Expected a field, "message", "enum", "oneof", "option", "reserved" or "}".');
                throw new Stop();
              }
              msg.fields.push(field(msg, null, null));
            });
          }
        }
        function message(parent, list) {
          const kw = next();
          const startIdx = p - 1;
          const nameTok = next();
          const m = newMessage(nameTok, parent, { comment: leading(startIdx) });
          expect("{", '"{"');
          messageBody(m);
          if (peek().kind === "eof") {
            err(peek(), `Reached end of input in message definition (missing "}").`);
            m.range = rangeOf(kw, peek());
            list.push(m);
            return;
          }
          const close = next();
          m.range = rangeOf(kw, close);
          list.push(m);
        }
        function oneofDef(msg) {
          const kw = next();
          const startIdx = p - 1;
          const nameTok = next();
          const o = { kind: "oneof", name: nameTok.value, nameRange: rangeOf(nameTok), options: [], fields: [], comment: leading(startIdx), parent: msg };
          expect("{", '"{"');
          while (!is("}") && peek().kind !== "eof") {
            if (is(";")) {
              next();
              continue;
            }
            statement(() => {
              if (is("option") && (isIdent(1) || is("(", 1))) return optionStatement(o.options);
              const f = field(msg, o, null);
              o.fields.push(f);
              msg.fields.push(f);
            });
          }
          const close = expect("}", '"}"');
          o.range = rangeOf(kw, close);
          msg.oneofs.push(o);
        }
        function enumDef(parent, list) {
          const kw = next();
          const startIdx = p - 1;
          const nameTok = next();
          const e = { kind: "enum", name: nameTok.value, nameRange: rangeOf(nameTok), values: [], reserved: { ranges: [], names: [] }, options: [], comment: leading(startIdx), parent };
          expect("{", '"{"');
          while (!is("}") && peek().kind !== "eof") {
            if (is(";")) {
              next();
              continue;
            }
            statement(() => {
              if (is("option") && (isIdent(1) || is("(", 1))) return optionStatement(e.options);
              if (is("reserved") && !is("=", 1)) {
                const kw2 = next();
                const r = ranges("enum", true, kw2);
                expect(";", '";"');
                e.reserved.ranges.push(...r.ranges);
                e.reserved.names.push(...r.names);
                return;
              }
              const vStart = p;
              const nm = expectIdent("an enum value name");
              expect("=", '"="');
              let neg = false;
              if (is("-")) {
                next();
                neg = true;
              }
              const numTok = peek();
              if (numTok.kind !== "int") {
                err(numTok, "Expected integer.");
                throw new Stop();
              }
              next();
              const opts = fieldOptions();
              expect(";", '";"');
              e.values.push({ kind: "enumValue", name: nm.value, nameRange: rangeOf(nm), number: intValue(numTok) * (neg ? -1 : 1), numberRange: rangeOf(numTok), options: opts, comment: leading(vStart), trailing: trailing(p - 1), parent: e });
            });
          }
          if (peek().kind === "eof") {
            err(peek(), 'Reached end of input in enum definition (missing "}").');
            e.range = rangeOf(kw, peek());
            list.push(e);
            return;
          }
          const close = next();
          e.range = rangeOf(kw, close);
          list.push(e);
        }
        function extend(parent, list) {
          const kw = next();
          const startIdx = p - 1;
          const scope = parent;
          const t = typeRef(scope, "extend");
          const x = { kind: "extend", extendee: t.name, extendeeRange: t.range, fields: [], parent, comment: leading(startIdx) };
          expect("{", '"{"');
          while (!is("}") && peek().kind !== "eof") {
            if (is(";")) {
              next();
              continue;
            }
            statement(() => {
              const holder = parent && parent.kind === "message" ? parent : { kind: "file-scope", messages: [] };
              const f = field(holder, null, x);
              if (f.group && holder.kind === "file-scope") file.messages.push(...holder.messages.map((g) => ({ ...g, parent: null })));
              x.fields.push(f);
            });
          }
          const close = expect("}", '"}"');
          x.range = rangeOf(kw, close);
          list.push(x);
        }
        function service() {
          const kw = next();
          const startIdx = p - 1;
          const nameTok = expectIdent("service name");
          const s = { kind: "service", name: nameTok.value, nameRange: rangeOf(nameTok), rpcs: [], options: [], comment: leading(startIdx) };
          expect("{", '"{"');
          while (!is("}") && peek().kind !== "eof") {
            if (is(";")) {
              next();
              continue;
            }
            statement(() => {
              if (is("option") && (isIdent(1) || is("(", 1))) return optionStatement(s.options);
              if (!is("rpc")) {
                err(peek(), 'Expected "rpc", "option" or "}".');
                throw new Stop();
              }
              const rk = next();
              const rStart = p - 1;
              const rn = expectIdent("method name");
              expect("(", '"("');
              let inStream = false;
              if (is("stream") && !is(")", 1)) {
                next();
                inStream = true;
              }
              const it = typeRef(s, "rpc");
              expect(")", '")"');
              expect("returns", '"returns"');
              expect("(", '"("');
              let outStream = false;
              if (is("stream") && !is(")", 1)) {
                next();
                outStream = true;
              }
              const ot = typeRef(s, "rpc");
              expect(")", '")"');
              const rpc = { kind: "rpc", name: rn.value, nameRange: rangeOf(rn), input: it.name, inputRange: it.range, inputStream: inStream, output: ot.name, outputRange: ot.range, outputStream: outStream, options: [], comment: leading(rStart), parent: s };
              let end;
              if (is("{")) {
                next();
                while (!is("}") && peek().kind !== "eof") {
                  if (is(";")) {
                    next();
                    continue;
                  }
                  statement(() => {
                    if (is("option")) return optionStatement(rpc.options);
                    err(peek(), 'Expected "option" or "}".');
                    throw new Stop();
                  });
                }
                end = expect("}", '"}"');
                if (is(";")) end = next();
              } else end = expect(";", '";" or "{"');
              rpc.range = rangeOf(rk, end);
              s.rpcs.push(rpc);
            });
          }
          if (peek().kind === "eof") {
            err(peek(), 'Reached end of input in service definition (missing "}").');
            s.range = rangeOf(kw, peek());
            file.services.push(s);
            return;
          }
          const close = next();
          s.range = rangeOf(kw, close);
          file.services.push(s);
        }
        let first = true;
        while (peek().kind !== "eof") {
          if (is(";")) {
            next();
            continue;
          }
          const t = peek();
          statement(() => {
            if ((is("syntax") || is("edition")) && is("=", 1)) {
              const kw = next();
              next();
              const v = peek();
              if (v.kind !== "string") {
                err(v, "Expected a string naming the syntax or edition.");
                throw new Stop();
              }
              next();
              let val = unquote(v);
              while (peek().kind === "string") val += unquote(next());
              const end = expect(";", '";"');
              if (!first) err(kw, `"${kw.value}" must be the first statement of the file.`);
              if (kw.value === "syntax") {
                file.syntax = val;
                if (val !== "proto2" && val !== "proto3") err(v, `Unrecognized syntax identifier "${val}".  This parser only recognizes "proto2" and "proto3".`);
              } else {
                file.syntax = "editions";
                file.edition = val;
                if (!/^20\d\d$/.test(val)) err(v, `Unknown edition "${val}".`);
              }
              file.syntaxRange = rangeOf(kw, end);
              return;
            }
            first = false;
            if (is("package") && isIdent(1)) {
              const kw = next();
              const f = fullIdent(false);
              const end = expect(";", '";"');
              if (file.package !== null) err(kw, "Multiple package definitions.");
              else {
                file.package = f.name;
                file.packageRange = f.range;
                file.packageStmt = rangeOf(kw, end);
              }
              return;
            }
            if (is("import")) {
              const kw = next();
              let kind = "";
              if (is("public") || is("weak") || is("option")) kind = next().value;
              const s = peek();
              if (s.kind !== "string") {
                err(s, "Expected a string naming the file to import.");
                throw new Stop();
              }
              next();
              let path = unquote(s);
              let last = s;
              while (peek().kind === "string") {
                last = next();
                path += unquote(last);
              }
              const end = expect(";", '";"');
              file.imports.push({ path, kind, range: rangeOf(s, last), stmt: rangeOf(kw, end) });
              return;
            }
            if (is("option") && (isIdent(1) || is("(", 1))) return optionStatement(file.options);
            if (is("message") && isIdent(1)) return message(null, file.messages);
            if (is("enum") && isIdent(1)) return enumDef(null, file.enums);
            if (is("service") && isIdent(1)) return service();
            if (is("extend") && (isIdent(1) || is(".", 1))) return extend(null, file.extends);
            err(t, 'Expected top-level statement (e.g. "message").');
            throw new Stop();
          });
          if (first && p > 0) first = false;
        }
        assignNames(file);
        return file;
      }
      function assignNames(file) {
        const pkg = file.package || "";
        const defs = [];
        const join = (a, b) => a ? `${a}.${b}` : b;
        function walkMsg(m, scope) {
          m.fullName = join(scope, m.name);
          m.scope = scope;
          defs.push({ fullName: m.fullName, node: m, kind: "message" });
          for (const f of m.fields) {
            f.fullName = join(m.fullName, f.name);
            f.scope = m.fullName;
          }
          for (const o of m.oneofs) {
            o.fullName = join(m.fullName, o.name);
          }
          for (const e of m.enums) walkEnum(e, m.fullName);
          for (const c of m.messages) walkMsg(c, m.fullName);
          for (const x of m.extends) walkExt(x, m.fullName);
        }
        function walkEnum(e, scope) {
          e.fullName = join(scope, e.name);
          e.scope = scope;
          defs.push({ fullName: e.fullName, node: e, kind: "enum" });
          for (const v of e.values) {
            v.fullName = join(scope, v.name);
            v.scope = scope;
          }
        }
        function walkExt(x, scope) {
          x.scope = scope;
          for (const f of x.fields) {
            f.fullName = join(scope, f.name);
            f.scope = scope;
            f.extendee = x.extendee;
            defs.push({ fullName: f.fullName, node: f, kind: "extension" });
          }
        }
        for (const m of file.messages) walkMsg(m, pkg);
        for (const e of file.enums) walkEnum(e, pkg);
        for (const x of file.extends) walkExt(x, pkg);
        for (const s of file.services) {
          s.fullName = join(pkg, s.name);
          s.scope = pkg;
          defs.push({ fullName: s.fullName, node: s, kind: "service" });
          for (const r of s.rpcs) {
            r.fullName = join(s.fullName, r.name);
          }
        }
        for (const r of file.refs) r.scope = r.container ? r.container.fullName || pkg : pkg;
        file.defs = defs;
      }
      function optionValue(options, name) {
        const o = (options || []).find((x) => x.name === name);
        if (!o) return void 0;
        const v = o.value;
        if (v.kind === "string") return v.value;
        if (v.kind === "ident") return v.value === "true" ? true : v.value === "false" ? false : v.value;
        if (v.kind === "int" || v.kind === "float") return v.value;
        return v.text;
      }
      module.exports = { parse, optionValue, SCALARS, MAX_FIELD, cleanComment };
    }
  });

  // ../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/format.js
  var require_format = __commonJS({
    "../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/format.js"(exports, module) {
      "use strict";
      var { tokenize } = require_lexer();
      var { parse } = require_parser();
      function matchBrackets(sig) {
        const match = new Array(sig.length).fill(-1);
        const stack = [];
        const pairs = { "}": "{", ")": "(", "]": "[" };
        for (let i = 0; i < sig.length; i++) {
          const t = sig[i];
          if (t.kind !== "sym") continue;
          if (t.value === "{" || t.value === "(" || t.value === "[") stack.push(i);
          else if (pairs[t.value]) {
            const j = stack.pop();
            if (j === void 0 || sig[j].value !== pairs[t.value]) return null;
            match[i] = j;
            match[j] = i;
          }
        }
        return stack.length ? null : match;
      }
      function format(text, opts = {}) {
        const ind = opts.indent || "  ";
        const parsed = parse(text);
        const firstErr = parsed.errors.find((e) => e.severity === "error");
        if (firstErr) return { error: `Line ${firstErr.line + 1}: ${firstErr.message}`, line: firstErr.line };
        const { tokens: all } = tokenize(text);
        const sig = [];
        const sigPos = /* @__PURE__ */ new Map();
        all.forEach((t, i) => {
          if (t.kind !== "comment") {
            sigPos.set(i, sig.length);
            sig.push(t);
          }
        });
        const match = matchBrackets(sig);
        if (!match) return { error: "The brackets in this file do not balance." };
        const out = [];
        let cur = "";
        let atStart = true;
        let depth = 0;
        let wantNl = false;
        let afterOpen = false;
        let prev = null;
        let prevSig = null;
        let prevSigIdx = -1;
        const ctx = [];
        const top = () => ctx[ctx.length - 1];
        const inAgg = () => ctx.some((c) => c.type === "agg");
        function lineBreak(blank) {
          if (!atStart) {
            out.push(cur.replace(/\s+$/, ""));
            cur = "";
            atStart = true;
          }
          if (blank && out.length && out[out.length - 1] !== "" && !afterOpen) out.push("");
        }
        let trailCol = -1;
        let trailOrigCol = -1;
        let contIndent = 0;
        function put(str, space, extraIndent = 0, tok = null) {
          if (atStart) {
            const pre = ind.repeat(Math.max(0, depth + extraIndent + contIndent));
            contIndent = 0;
            if (tok && tok.kind === "comment" && tok.value.startsWith("/*") && tok.value.includes("\n")) str = reindentBlock(tok, pre.length);
            cur = pre + str;
            atStart = false;
          } else cur += (space ? " " : "") + str;
          afterOpen = false;
        }
        function reindentBlock(tok, newCol) {
          const lines = tok.value.split("\n");
          const delta = newCol - tok.col;
          return lines.map((l, i) => {
            if (i === 0 || !l.trim()) return l;
            if (delta > 0) return " ".repeat(delta) + l;
            const lead = /^ */.exec(l)[0].length;
            return l.slice(Math.min(lead, -delta));
          }).join("\n");
        }
        function lineLevel() {
          if (atStart) return depth;
          const lead = /^[ \t]*/.exec(cur)[0];
          return ind === "	" ? lead.length : Math.floor(lead.length / ind.length);
        }
        function needSpace(p, t) {
          if (!p) return false;
          const c = top();
          if (c && c.type === "ext") return t.start > p.end;
          const pv = p.value;
          const tv = t.value;
          if (p.kind === "sym" && (pv === "(" || pv === "[" || pv === "." || pv === "-" || pv === "+")) return false;
          if (p.kind === "sym" && pv === "<" && c && c.type === "angle") return false;
          if (t.kind === "sym") {
            if (tv === ";" || tv === "," || tv === ")" || tv === "]" || tv === ":") return false;
            if (tv === ">" && c && c.type === "angle") return false;
            if (tv === ".") return t.start > p.end;
            if (tv === "<") return !(p.kind === "ident" && pv === "map");
            if (tv === "(") return !(p.kind === "ident" && pv !== "returns" && pv !== "option" && pv !== "stream");
          }
          return true;
        }
        for (let ai = 0; ai < all.length; ai++) {
          const t = all[ai];
          const si = sigPos.has(ai) ? sigPos.get(ai) : -1;
          const blankBefore = t.nlBefore >= 2;
          if (t.kind === "comment") {
            const isLine = t.value.startsWith("//");
            if (t.nlBefore === 0 && prev) {
              const gapText = text.slice(prev.end, t.start);
              const gap = /^[ ]+$/.test(gapText) && gapText.length <= 40 ? gapText.length : gapText === "" && t.value.startsWith("/*") ? 0 : 1;
              if (atStart) put(t.value, false, 0, t);
              else {
                trailCol = cur.length + gap;
                trailOrigCol = t.col;
                cur += " ".repeat(gap) + t.value;
                afterOpen = false;
              }
            } else {
              lineBreak(blankBefore && prev !== null);
              wantNl = false;
              if (t.nlBefore === 1 && prev && prev.kind === "comment" && trailCol >= 0 && t.col === trailOrigCol && t.value.startsWith("//")) {
                cur = " ".repeat(trailCol) + t.value;
                atStart = false;
                afterOpen = false;
                prev = t;
                wantNl = true;
                continue;
              }
              trailCol = -1;
              const extra = top() && top().type !== "block" && !top().multi ? 1 : 0;
              put(t.value, false, extra, t);
            }
            prev = t;
            if (isLine) wantNl = true;
            else {
              const nx = all[ai + 1];
              if (nx && nx.nlBefore > 0 && (t.nlBefore > 0 || !prev)) wantNl = true;
            }
            continue;
          }
          const tv = t.value;
          const isSym = t.kind === "sym";
          const c = top();
          if (isSym && tv === ";" && prevSig && prevSig.value === "}" && wantNl && !atStart && prev === prevSig) {
            cur += ";";
            prev = t;
            prevSig = t;
            prevSigIdx = si;
            continue;
          }
          if (isSym && (tv === "}" || tv === "]" || tv === ")")) {
            const open = c;
            ctx.pop();
            if (open && open.multi) {
              lineBreak(false);
              wantNl = false;
              depth = open.type === "block" ? open.base : open.level;
              put(tv, false);
              depth = open.base;
              if (open.type === "block") wantNl = true;
            } else {
              if (wantNl) {
                lineBreak(false);
                wantNl = false;
              }
              const emptyAgg = open && open.type === "agg" && prevSig && prevSig.value === "{";
              const sp = open && open.type === "agg" && !emptyAgg;
              if (open && open.type === "agg") put(tv, sp && !atStart);
              else put(tv, needSpace(prev, t));
            }
            prev = t;
            prevSig = t;
            prevSigIdx = si;
            continue;
          }
          if (wantNl) {
            lineBreak(blankBefore);
            wantNl = false;
          } else if (c && c.multi && c.type === "agg" && prevSig && !atStart) {
            const pv = prevSig.value;
            const valueEnd = prevSig.kind === "string" || prevSig.kind === "int" || prevSig.kind === "float" || prevSig.kind === "ident" || pv === "]" || pv === "}" || pv === ">";
            if ((t.kind === "ident" || tv === "[") && valueEnd && !(prevSig.kind === "ident" && tv === ".")) lineBreak(blankBefore);
            else if (t.kind === "string" && prevSig.kind === "string" && t.nlBefore > 0) {
              lineBreak(false);
              contIndent = 2;
            }
          } else if (!atStart && t.nlBefore > 0 && (!c || c.type !== "agg" || !c.multi) && !(isSym && (tv === ";" || tv === "," || tv === ")" || tv === "]" || tv === ">" || tv === "}" || tv === "{" || tv === "."))) {
            lineBreak(false);
            contIndent = 2;
          }
          if (isSym && tv === "{") {
            const pv = prevSig ? prevSig.value : "";
            const isAgg = inAgg() || pv === "=" || pv === ":";
            const close = sig[match[si]];
            if (isAgg) {
              const multi = close.line > t.line;
              put("{", needSpace(prev, t) && !atStart);
              const lvl = lineLevel();
              ctx.push({ type: "agg", multi, base: depth, level: lvl });
              if (multi) {
                depth = lvl + 1;
                wantNl = true;
                afterOpen = true;
              }
            } else if (all[ai + 1] === close) {
              put("{}", !atStart);
              ai++;
              wantNl = true;
              prev = close;
              prevSig = close;
              prevSigIdx = match[si];
              continue;
            } else {
              put("{", !atStart);
              ctx.push({ type: "block", multi: true, base: depth });
              depth++;
              wantNl = true;
              afterOpen = true;
            }
            prev = t;
            prevSig = t;
            prevSigIdx = si;
            continue;
          }
          if (isSym && tv === "[") {
            const close = sig[match[si]];
            const pv = prevSig ? prevSig.value : "";
            let type = "opts";
            if (inAgg()) type = pv === ":" || pv === "," && top() && top().type === "list" ? "list" : "ext";
            const after = all[ai + 1];
            const multi = type === "opts" && close.line > t.line && after && after.nlBefore > 0;
            put("[", needSpace(prev, t) && !atStart);
            const lvl = lineLevel();
            ctx.push({ type, multi, base: depth, level: lvl });
            if (multi) {
              depth = lvl + 1;
              wantNl = true;
              afterOpen = true;
            }
            prev = t;
            prevSig = t;
            prevSigIdx = si;
            continue;
          }
          if (isSym && tv === "(") {
            put("(", needSpace(prev, t) && !atStart);
            ctx.push({ type: "paren", multi: false, base: depth });
            prev = t;
            prevSig = t;
            prevSigIdx = si;
            continue;
          }
          if (isSym && tv === "<" && prevSig && prevSig.kind === "ident" && prevSig.value === "map") {
            put("<", false);
            ctx.push({ type: "angle", multi: false, base: depth });
            prev = t;
            prevSig = t;
            prevSigIdx = si;
            continue;
          }
          if (isSym && tv === ">" && c && c.type === "angle") {
            ctx.pop();
            put(">", false);
            prev = t;
            prevSig = t;
            prevSigIdx = si;
            continue;
          }
          put(tv, !atStart && needSpace(prev, t));
          prev = t;
          prevSig = t;
          prevSigIdx = si;
          if (isSym && tv === ";") {
            if (!c || c.type === "block" || c.type === "agg" && c.multi) wantNl = true;
          } else if (isSym && tv === ",") {
            if (c && c.multi && (c.type === "opts" || c.type === "agg")) wantNl = true;
          }
        }
        lineBreak(false);
        while (out.length && out[out.length - 1] === "") out.pop();
        while (out.length && out[0] === "") out.shift();
        const result = out.map((l) => l.replace(/[ \t]+$/, "")).join("\n") + (out.length ? "\n" : "");
        void prevSigIdx;
        return { text: result };
      }
      function lineDiff(a, b) {
        const A = a.split("\n");
        const B = b.split("\n");
        let s = 0;
        while (s < A.length && s < B.length && A[s] === B[s]) s++;
        if (s === A.length && s === B.length) return null;
        let ea = A.length;
        let eb = B.length;
        while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) {
          ea--;
          eb--;
        }
        return { startLine: s, endLine: ea, lines: B.slice(s, eb) };
      }
      function minimalEdit(a, b) {
        if (a === b) return null;
        let p = 0;
        const max = Math.min(a.length, b.length);
        while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
        let s = 0;
        while (s < max - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
        return { start: p, end: a.length - s, text: b.slice(p, b.length - s) };
      }
      module.exports = { format, lineDiff, minimalEdit };
    }
  });

  // ../tc4/path-shim.js
  var require_path_shim = __commonJS({
    "../tc4/path-shim.js"(exports, module) {
      "use strict";
      var norm = (p) => {
        const abs = p.startsWith("/");
        const out = [];
        for (const s of p.split("/")) {
          if (!s || s === ".") continue;
          if (s === "..") {
            if (out.length && out[out.length - 1] !== "..") out.pop();
            else if (!abs) out.push("..");
          } else out.push(s);
        }
        return (abs ? "/" : "") + out.join("/") || (abs ? "/" : ".");
      };
      var basename = (p, ext) => {
        let b = String(p).replace(/\/+$/, "");
        b = b.slice(b.lastIndexOf("/") + 1);
        return ext && b.endsWith(ext) && b !== ext ? b.slice(0, -ext.length) : b;
      };
      var dirname = (p) => {
        p = String(p).replace(/\/+$/, "");
        const i = p.lastIndexOf("/");
        return i < 0 ? "." : i === 0 ? "/" : p.slice(0, i);
      };
      var extname = (p) => {
        const b = basename(p);
        const i = b.lastIndexOf(".");
        return i <= 0 ? "" : b.slice(i);
      };
      var join = (...a) => norm(a.filter((x) => x !== "").join("/"));
      var resolve = (...a) => {
        let r = "";
        for (const x of a) r = String(x).startsWith("/") ? x : r ? r + "/" + x : x;
        return norm(r.startsWith("/") ? r : "/" + r);
      };
      var relative = (from, to) => {
        const f = resolve(from).split("/").filter(Boolean), t = resolve(to).split("/").filter(Boolean);
        let i = 0;
        while (i < f.length && f[i] === t[i]) i++;
        return [...f.slice(i).map(() => ".."), ...t.slice(i)].join("/");
      };
      var isAbsolute = (p) => String(p).startsWith("/");
      var api = { sep: "/", delimiter: ":", basename, dirname, extname, join, resolve, relative, normalize: norm, isAbsolute };
      api.posix = api;
      module.exports = api;
    }
  });

  // ../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/wkt.js
  var require_wkt = __commonJS({
    "../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/wkt.js"(exports, module) {
      "use strict";
      var M = "message";
      var E = "enum";
      var FIELDS = {
        Any: [["type_url", "string", 1], ["value", "bytes", 2]],
        Duration: [["seconds", "int64", 1], ["nanos", "int32", 2]],
        Timestamp: [["seconds", "int64", 1], ["nanos", "int32", 2]],
        FieldMask: [["paths", "string", 1, "repeated"]],
        Empty: [],
        DoubleValue: [["value", "double", 1]],
        FloatValue: [["value", "float", 1]],
        Int64Value: [["value", "int64", 1]],
        UInt64Value: [["value", "uint64", 1]],
        Int32Value: [["value", "int32", 1]],
        UInt32Value: [["value", "uint32", 1]],
        BoolValue: [["value", "bool", 1]],
        StringValue: [["value", "string", 1]],
        BytesValue: [["value", "bytes", 1]]
      };
      var WKT = {
        "google/protobuf/any.proto": [["Any", M]],
        "google/protobuf/api.proto": [["Api", M], ["Method", M], ["Mixin", M]],
        "google/protobuf/duration.proto": [["Duration", M]],
        "google/protobuf/empty.proto": [["Empty", M]],
        "google/protobuf/field_mask.proto": [["FieldMask", M]],
        "google/protobuf/source_context.proto": [["SourceContext", M]],
        "google/protobuf/struct.proto": [["Struct", M], ["Value", M], ["ListValue", M], ["NullValue", E]],
        "google/protobuf/timestamp.proto": [["Timestamp", M]],
        "google/protobuf/type.proto": [["Type", M], ["Field", M], ["Field.Kind", E], ["Field.Cardinality", E], ["Enum", M], ["EnumValue", M], ["Option", M], ["Syntax", E]],
        "google/protobuf/wrappers.proto": [["DoubleValue", M], ["FloatValue", M], ["Int64Value", M], ["UInt64Value", M], ["Int32Value", M], ["UInt32Value", M], ["BoolValue", M], ["StringValue", M], ["BytesValue", M]],
        "google/protobuf/descriptor.proto": "*",
        "google/protobuf/cpp_features.proto": "*",
        "google/protobuf/java_features.proto": "*",
        "google/protobuf/go_features.proto": "*"
      };
      function builtinFile(importPath) {
        const list = WKT[importPath];
        if (!list) return null;
        const node = (n, kind) => {
          const x = { kind, name: n.split(".").pop(), fullName: `google.protobuf.${n}`, fields: [], messages: [], enums: [], values: [] };
          for (const [name, type, number, label] of FIELDS[n] || []) x.fields.push({ kind: "field", name, type, number, label: label || null, options: [] });
          return x;
        };
        const defs = list === "*" ? [] : list.map(([n, kind]) => ({ fullName: `google.protobuf.${n}`, kind, node: node(n, kind) }));
        const pkg = /_features\.proto$/.test(importPath) ? "pb" : "google.protobuf";
        return { builtin: true, path: importPath, package: pkg, wildcard: list === "*", defs, imports: [], refs: [], optionRefs: [], errors: [], messages: [], enums: [], services: [], extends: [] };
      }
      module.exports = { WKT, builtinFile };
    }
  });

  // ../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/index.js
  var require_proto = __commonJS({
    "../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/index.js"(exports, module) {
      "use strict";
      var path = require_path_shim();
      var { parse } = require_parser();
      var { builtinFile } = require_wkt();
      var TYPE_KINDS = /* @__PURE__ */ new Set(["message", "enum"]);
      function createIndex(host) {
        const files = /* @__PURE__ */ new Map();
        let gen = 0;
        const cache = /* @__PURE__ */ new Map();
        const cached = (key, fn) => {
          const c = cache.get(key);
          if (c && c.gen === gen) return c.value;
          const value = fn();
          cache.set(key, { gen, value });
          return value;
        };
        const norm = (p) => path.normalize(p);
        function set(file, text, open = false) {
          file = norm(file);
          const old = files.get(file);
          if (old && old.text === text) {
            old.open = old.open || open;
            return old.ast;
          }
          const ast = parse(text);
          ast.file = file;
          files.set(file, { text, ast, open });
          gen++;
          return ast;
        }
        function remove(file) {
          if (files.delete(norm(file))) gen++;
        }
        function has(file) {
          return files.has(norm(file));
        }
        function get(file) {
          file = norm(file);
          const e = files.get(file);
          if (e) return e.ast;
          const text = host.readFile(file);
          if (text == null) return null;
          return set(file, text);
        }
        function exists(file) {
          return files.has(norm(file)) || !!host.fileExists(norm(file));
        }
        function allFiles() {
          return [...files.keys()];
        }
        function rootFor(file) {
          const roots = (host.roots() || []).map(norm).filter((r) => file === r || file.startsWith(r + path.sep));
          roots.sort((a, b) => b.length - a.length);
          return roots[0] || null;
        }
        function resolveImport(from, importPath) {
          from = norm(from);
          return cached(`imp:${from}\0${importPath}`, () => {
            const rel = importPath.split("/").join(path.sep);
            const tried = /* @__PURE__ */ new Set();
            const candidates = [];
            for (const d of host.importPaths ? host.importPaths(from) : []) candidates.push(path.join(d, rel));
            const root = rootFor(from);
            if (root) candidates.push(path.join(root, rel));
            let dir = path.dirname(from);
            for (let k = 0; k < 30; k++) {
              candidates.push(path.join(dir, rel));
              if (root && dir === root) break;
              const up = path.dirname(dir);
              if (up === dir) break;
              dir = up;
            }
            for (const c of candidates) {
              const n = norm(c);
              if (tried.has(n)) continue;
              tried.add(n);
              if (n !== from && exists(n)) return { file: n };
            }
            const suffix = path.sep + rel;
            const hits = allFiles().filter((f) => f.endsWith(suffix) && f !== from).sort((a, b2) => a.length - b2.length);
            if (hits.length) return { file: hits[0], bySuffix: true };
            const b = builtinFile(importPath);
            if (b) return { builtin: b };
            return null;
          });
        }
        function astOf(entry) {
          return entry.builtin ? entry.builtin : get(entry.file);
        }
        function visible(file) {
          file = norm(file);
          return cached(`vis:${file}`, () => {
            const out = [];
            const seen = /* @__PURE__ */ new Set();
            const self2 = get(file);
            if (!self2) return out;
            out.push({ file, ast: self2 });
            seen.add(file);
            const queue = [];
            for (const imp of self2.imports) {
              const r = resolveImport(file, imp.path);
              if (r) queue.push(r);
            }
            while (queue.length) {
              const r = queue.shift();
              const key = r.file || `builtin:${r.builtin.path}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const ast = astOf(r);
              if (!ast) continue;
              out.push({ file: r.file || null, ast, builtin: !!r.builtin });
              if (r.file) {
                for (const imp of ast.imports) if (imp.kind === "public") {
                  const r2 = resolveImport(r.file, imp.path);
                  if (r2) queue.push(r2);
                }
              }
            }
            return out;
          });
        }
        function tableOf(list) {
          const defs = /* @__PURE__ */ new Map();
          const packages = /* @__PURE__ */ new Set();
          const wildcards = [];
          for (const v of list) {
            const a = v.ast;
            if (a.package) {
              const parts = a.package.split(".");
              for (let i = 1; i <= parts.length; i++) packages.add(parts.slice(0, i).join("."));
            }
            if (a.wildcard) wildcards.push(a.package + ".");
            for (const d of a.defs || []) if (!defs.has(d.fullName)) defs.set(d.fullName, { ...d, file: v.file, builtin: !!v.builtin });
          }
          return { defs, packages, wildcards };
        }
        function table(file) {
          return cached(`tab:${norm(file)}`, () => tableOf(visible(file)));
        }
        function globalTable() {
          return cached("global", () => tableOf(allFiles().map((f) => ({ file: f, ast: get(f) })).filter((x) => x.ast)));
        }
        function lookupIn(t, name, scope, kinds) {
          const isKind = (d) => !kinds || kinds.has(d.kind);
          const wild = (full) => t.wildcards.some((w) => full.startsWith(w));
          if (name.startsWith(".")) {
            const full = name.slice(1);
            const d = t.defs.get(full);
            if (d && isKind(d)) return { def: d };
            if (wild(full)) return { wildcard: true };
            return { error: "undefined" };
          }
          const first = name.split(".")[0];
          const parts = scope ? scope.split(".") : [];
          for (let i = parts.length; i >= 0; i--) {
            const prefix = parts.slice(0, i).join(".");
            const candFirst = prefix ? `${prefix}.${first}` : first;
            const fd = t.defs.get(candFirst);
            const isAggregate = fd && (fd.kind === "message" || fd.kind === "enum" || fd.kind === "service") || t.packages.has(candFirst);
            const full = prefix ? `${prefix}.${name}` : name;
            if (fd && !isAggregate && first === name && isKind(fd)) return { def: fd };
            if (!isAggregate) {
              if (wild(full)) return { wildcard: true };
              continue;
            }
            const d = t.defs.get(full);
            if (d && isKind(d)) return { def: d };
            if (wild(full)) return { wildcard: true };
            if (d && !isKind(d)) return { error: "kind", def: d };
            if (name !== first) return { error: "innermost", resolvedTo: full };
            return { error: "undefined" };
          }
          return { error: "undefined" };
        }
        function lookup(file, name, scope, kinds = TYPE_KINDS) {
          const r = lookupIn(table(file), name, scope, kinds);
          if (r.def || r.wildcard) return r;
          const g = lookupIn(globalTable(), name, scope, kinds);
          if (g.def && g.def.file && g.def.file !== norm(file)) return { ...r, notImported: g.def };
          return r;
        }
        function missingImports(file) {
          const a = get(file);
          if (!a) return [];
          return a.imports.filter((imp) => !resolveImport(file, imp.path)).map((imp) => ({ imp }));
        }
        function references(fullName) {
          const out = [];
          for (const f of allFiles()) {
            const a = get(f);
            if (!a) continue;
            for (const r of a.refs) {
              const res = lookup(f, r.name, r.scope, r.kind === "extend" ? /* @__PURE__ */ new Set(["message"]) : TYPE_KINDS);
              if (res.def && res.def.fullName === fullName) out.push({ file: f, range: r.range, ref: r });
            }
            for (const r of a.optionRefs) {
              const res = lookup(f, r.name, a.package || "", /* @__PURE__ */ new Set(["extension"]));
              if (res.def && res.def.fullName === fullName) out.push({ file: f, range: r.range, ref: r });
            }
          }
          return out;
        }
        function at(file, line, col) {
          const a = get(file);
          if (!a) return null;
          const inR = (r) => r && (line > r.line || line === r.line && col >= r.col) && (line < r.endLine || line === r.endLine && col <= r.endCol);
          for (const imp of a.imports) if (inR(imp.range)) return { kind: "import", imp };
          for (const r of a.refs) if (inR(r.range)) return { kind: "ref", ref: r };
          for (const r of a.optionRefs) if (inR(r.range)) return { kind: "option", ref: r };
          for (const d of a.defs) if (d.node.nameRange && inR(d.node.nameRange)) return { kind: "def", def: { ...d, file: norm(file) } };
          return null;
        }
        function definitionAt(file, line, col) {
          const hit = at(file, line, col);
          if (!hit) return null;
          if (hit.kind === "def") return { def: hit.def };
          if (hit.kind === "import") {
            const r = resolveImport(file, hit.imp.path);
            return r && r.file ? { file: r.file } : null;
          }
          if (hit.kind === "ref") {
            const r = lookup(file, hit.ref.name, hit.ref.scope, hit.ref.kind === "extend" ? /* @__PURE__ */ new Set(["message"]) : TYPE_KINDS);
            if (r.def) return { def: r.def, ref: hit.ref };
            if (r.notImported) return { def: r.notImported, ref: hit.ref, notImported: true };
            return null;
          }
          if (hit.kind === "option") {
            const a = get(file);
            const r = lookup(file, hit.ref.name, a.package || "", /* @__PURE__ */ new Set(["extension"]));
            if (r.def) return { def: r.def, ref: hit.ref };
          }
          return null;
        }
        return { set, remove, get, has, allFiles, resolveImport, visible, table, lookup, missingImports, references, at, definitionAt, rootFor, get generation() {
          return gen;
        } };
      }
      module.exports = { createIndex, TYPE_KINDS };
    }
  });

  // ../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/check.js
  var require_check = __commonJS({
    "../../../../toolchk4-work/tc4-vwpcrj66/p/src/proto/check.js"(exports, module) {
      "use strict";
      var { optionValue, SCALARS, MAX_FIELD } = require_parser();
      var { TYPE_KINDS } = require_proto();
      var MAP_KEYS = /* @__PURE__ */ new Set(["int32", "int64", "uint32", "uint64", "sint32", "sint64", "fixed32", "fixed64", "sfixed32", "sfixed64", "bool", "string"]);
      var PACKABLE = /* @__PURE__ */ new Set(["double", "float", "int32", "int64", "uint32", "uint64", "sint32", "sint64", "fixed32", "fixed64", "sfixed32", "sfixed64", "bool"]);
      function check(index, file, opts = {}) {
        const a = index.get(file);
        if (!a) return [];
        const out = [];
        const add = (range, message, severity = "error", extra = {}) => {
          if (range) out.push({ message, severity, range, ...extra });
        };
        for (const e of a.errors) add({ line: e.line, col: e.col, endLine: e.endLine, endCol: e.endCol }, e.message, e.severity || "error", { code: "syntax" });
        const syntax = a.syntax || "proto2";
        const editions = syntax === "editions";
        const firstTok = a.tokens.find((t) => t.kind !== "comment");
        if (!a.syntax && firstTok) {
          add({ line: firstTok.line, col: firstTok.col, endLine: firstTok.endLine, endCol: firstTok.endCol }, `No syntax specified for the proto file. Please use 'syntax = "proto2";' or 'syntax = "proto3";' to specify a syntax version. (Defaulted to proto2 syntax.)`, "warning", { code: "no-syntax" });
        }
        const missing = index.missingImports(file);
        const seenImp = /* @__PURE__ */ new Map();
        for (const imp of a.imports) {
          if (seenImp.has(imp.path)) add(imp.range, `Import "${imp.path}" was listed twice.`);
          seenImp.set(imp.path, imp);
        }
        for (const { imp } of missing) {
          add(imp.range, `Import "${imp.path}" was not found. Add the folder it is in to the "zovoProto.importPaths" setting (as with protoc -I).`, "warning", { code: "import-not-found" });
        }
        const incomplete = missing.length > 0;
        const usedFiles = /* @__PURE__ */ new Set();
        let unresolvedOption = false;
        const resolveRef = (r) => {
          const kinds = r.kind === "extend" ? /* @__PURE__ */ new Set(["message"]) : r.kind === "rpc" ? /* @__PURE__ */ new Set(["message"]) : TYPE_KINDS;
          const res = index.lookup(file, r.name, r.scope, kinds);
          if (res.def) {
            if (res.def.file) usedFiles.add(res.def.file);
            else if (res.def.builtin) usedFiles.add("builtin");
            return res.def;
          }
          if (res.wildcard) {
            usedFiles.add("builtin");
            return null;
          }
          if (res.notImported) {
            add(r.range, `"${r.name}" seems to be defined in "${relName(res.notImported.file)}", which is not imported by "${relName(file)}".  To use it here, please add the necessary import.`);
            return null;
          }
          if (incomplete) return null;
          if (res.error === "innermost") add(r.range, `"${r.name}" is resolved to "${res.resolvedTo}", which is not defined. The innermost scope is searched first in name resolution. Consider using a leading '.'(i.e., ".${r.name}") to start from the outermost scope.`);
          else if (res.error === "kind") add(r.range, r.kind === "rpc" || r.kind === "extend" ? `"${r.name}" is not a message type.` : `"${r.name}" is not a type.`);
          else add(r.range, `"${r.name}" is not defined.`);
          return null;
        };
        const relName = (f) => {
          const root = index.rootFor(f);
          return root ? f.slice(root.length + 1).split("\\").join("/") : f.split(/[\\/]/).pop();
        };
        const refDefs = /* @__PURE__ */ new Map();
        for (const r of a.refs) refDefs.set(r, resolveRef(r));
        for (const r of a.optionRefs) {
          const res = index.lookup(file, r.name, a.package || "", /* @__PURE__ */ new Set(["extension"]));
          if (res.def) {
            if (res.def.file) usedFiles.add(res.def.file);
          } else if (!res.wildcard) unresolvedOption = true;
        }
        const typeOf = (f) => {
          const r = a.refs.find((x) => x.range === f.typeRange || f.map && x.range === f.map.valueRange);
          return r ? refDefs.get(r) : null;
        };
        const scopes = /* @__PURE__ */ new Map();
        const define = (scope, name, range, what, owner) => {
          if (!scopes.has(scope)) scopes.set(scope, /* @__PURE__ */ new Map());
          const m = scopes.get(scope);
          if (m.has(name)) {
            const prev = m.get(name);
            if (what === "enum value" && prev === "enum value") {
              add(range, `"${name}" is already defined in "${scope}".  Note that enum values use C++ scoping rules, meaning that enum values are siblings of their type, not children of it.  Therefore, "${name}" must be unique within "${scope}", not just within "${owner || "the enum"}".`);
            } else add(range, `"${name}" is already defined in "${scope}".`);
            return;
          }
          m.set(name, what);
        };
        const pkg = a.package || "";
        function featureIn(options, name) {
          const v = optionValue(options, `features.${name}`);
          if (v !== void 0) return v;
          const agg = (options || []).find((o) => o.name === "features" && o.value.kind === "aggregate");
          if (agg) {
            const m = new RegExp(`\\b${name}\\s*:\\s*([A-Za-z_][A-Za-z0-9_]*)`).exec(agg.value.text);
            if (m) return m[1];
          }
          return void 0;
        }
        function feature(node, name) {
          for (let n = node; n; n = n.parent) {
            const v = featureIn(n.options, name);
            if (v !== void 0) return v;
          }
          return featureIn(a.options, name);
        }
        function checkEnum(e, scope) {
          define(scope, e.name, e.nameRange, "enum");
          if (!e.values.length) add(e.nameRange, "Enums must contain at least one value.");
          const open = syntax === "proto3" || editions && feature(e, "enum_type") !== "CLOSED";
          if (e.values.length && syntax === "proto3" && e.values[0].number !== 0) add(e.values[0].numberRange, "The first enum value must be zero for open enums.");
          else if (e.values.length && editions && open && e.values[0].number !== 0) add(e.values[0].numberRange, "The first enum value must be zero for open enums.");
          const alias = optionValue(e.options, "allow_alias") === true;
          const byNum = /* @__PURE__ */ new Map();
          let aliased = false;
          for (const v of e.values) {
            define(scope, v.name, v.nameRange, "enum value", e.name);
            if (v.number > 2147483647 || v.number < -2147483648) add(v.numberRange, "Integer out of range.");
            if (byNum.has(v.number)) {
              aliased = true;
              if (!alias) add(v.nameRange, `"${joinName(scope, v.name)}" uses the same enum value as "${joinName(scope, byNum.get(v.number).name)}". If this is intended, set 'option allow_alias = true;' to the enum definition. The next available enum value is ${Math.max(...e.values.map((x) => x.number)) + 1}.`);
            } else byNum.set(v.number, v);
            for (const r of e.reserved.ranges) if (v.number >= r.lo && v.number <= r.hi) add(v.numberRange, `Enum value "${v.name}" uses reserved number ${v.number}.`);
            if (e.reserved.names.some((n) => n.name === v.name)) add(v.nameRange, `Enum value "${v.name}" is reserved.`);
          }
          if (alias && !aliased && e.values.length) add(e.nameRange, `"${e.fullName}" declares support for enum aliases but no enum values share field numbers. Please remove the unnecessary 'option allow_alias = true;' declaration.`);
        }
        function checkField(f, m, inOneof) {
          if (f.number <= 0) add(f.numberRange, "Field numbers must be positive integers.");
          else if (f.number > MAX_FIELD) add(f.numberRange, `Field numbers cannot be greater than ${MAX_FIELD}.`);
          else if (f.number >= 19e3 && f.number <= 19999) add(f.numberRange, `Field numbers 19000 through 19999 are reserved for the protocol buffer library implementation.`);
          if (inOneof && f.label) add(f.labelTok, "Fields in oneofs must not have labels (required / optional / repeated).");
          if (f.map) {
            if (f.label) add(f.labelTok, "Field labels (required/optional/repeated) are not allowed on map fields.");
            if (inOneof) add(f.typeRange, "Map fields are not allowed in oneofs.");
            if (!MAP_KEYS.has(f.map.key)) add(f.map.keyRange, "Key in map fields cannot be float/double, bytes or message types.");
          }
          if (!inOneof && !f.map) {
            if (syntax === "proto2" && !f.label && !(m && m.isExtendHolder)) add(f.typeRange, 'Expected "required", "optional", or "repeated".');
            if (syntax === "proto3" && f.label === "required") add(f.labelTok, "Required fields are not allowed in proto3.");
            if (editions && f.label === "optional") add(f.labelTok, 'Label "optional" is not supported in editions. By default, all singular fields have presence unless features.field_presence is set.');
            if (editions && f.label === "required") add(f.labelTok, 'Label "required" is not supported in editions, use features.field_presence = LEGACY_REQUIRED.');
          }
          if (f.group && syntax === "proto3") add(f.groupTok, "Groups are not supported in proto3 syntax.");
          if (f.group && editions) add(f.groupTok, "Group syntax is no longer supported in editions. To get group behavior you can specify features.message_encoding = DELIMITED on a message field.");
          const dflt = (f.options || []).find((o) => o.name === "default");
          if (dflt && syntax === "proto3") add(dflt.nameRange, "Explicit default values are not allowed in proto3.");
          if (dflt && f.label === "repeated") add(dflt.nameRange, "Repeated fields can't have default values.");
          const packed = (f.options || []).find((o) => o.name === "packed");
          if (packed && (f.label !== "repeated" || SCALARS.has(f.type) && !PACKABLE.has(f.type))) add(packed.nameRange, "[packed = true] can only be specified for repeated primitive fields.");
          if (packed && editions) add(packed.nameRange, "Field option packed is not allowed under editions.  Use the repeated_field_encoding feature to control this behavior.");
          if (packed && f.label === "repeated" && !SCALARS.has(f.type)) {
            const d = typeOf(f);
            if (d && d.kind === "message") add(packed.nameRange, "[packed = true] can only be specified for repeated primitive fields.");
          }
          if (f.map && !SCALARS.has(f.map.value)) {
          }
        }
        function checkMessage(m, scope) {
          define(scope, m.name, m.nameRange, "message");
          const full = m.fullName;
          const byNum = /* @__PURE__ */ new Map();
          for (const f of m.fields) {
            define(full, f.name, f.nameRange, "field");
            const inOneof = !!f.oneof;
            checkField(f, m, inOneof);
            if (byNum.has(f.number) && f.number > 0) add(f.numberRange, `Field number ${f.number} has already been used in "${full}" by field "${byNum.get(f.number).name}". Next available field number is ${nextFree(m)}.`);
            else byNum.set(f.number, f);
            for (const r of m.reserved.ranges) if (f.number >= r.lo && f.number <= r.hi) add(f.numberRange, `Field "${f.name}" uses reserved number ${f.number}.`);
            if (m.reserved.names.some((n) => n.name === f.name)) add(f.nameRange, `Field name "${f.name}" is reserved.`);
            for (const x of m.extensions) if (f.number >= x.lo && f.number <= x.hi) add(f.numberRange, `Extension range ${x.lo} to ${x.hi} includes field "${f.name}" (${f.number}).`);
          }
          for (const o of m.oneofs) {
            define(full, o.name, o.nameRange, "oneof");
            if (!o.fields.length) add(o.nameRange, "Oneof must have at least one field.");
          }
          if (m.extensions.length && syntax === "proto3") add(m.extensions[0].kwRange, "Extension ranges are not allowed in proto3.");
          for (const x of m.extensions) {
            if (x.lo <= 0) add(x.range, "Extension numbers must be positive integers.");
            for (const r of m.reserved.ranges) if (x.lo <= r.hi && r.lo <= x.hi) add(x.range, `Extension range ${x.lo} to ${x.hi} overlaps with reserved range ${r.lo} to ${r.hi}.`);
          }
          const rs = m.reserved.ranges;
          for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
            if (rs[i].lo <= rs[j].hi && rs[j].lo <= rs[i].hi) add(rs[j].range, `Reserved range ${rs[j].lo} to ${rs[j].hi} overlaps with already-defined range ${rs[i].lo} to ${rs[i].hi}.`);
          }
          for (const e of m.enums) checkEnum(e, full);
          for (const c of m.messages) checkMessage(c, full);
          for (const x of m.extends) checkExtend(x, full);
        }
        function checkExtend(x, scope) {
          for (const f of x.fields) {
            define(scope, f.name, f.nameRange, "extension");
            checkField(f, { isExtendHolder: false }, false);
            if (f.map) add(f.typeRange, "Map fields are not allowed to be extensions.");
          }
          const r = a.refs.find((q) => q.range === x.extendeeRange);
          const d = r ? refDefs.get(r) : null;
          if (d && d.kind === "message" && d.node && d.node.extensions && !d.builtin) {
            for (const f of x.fields) {
              if (!d.node.extensions.some((e) => f.number >= e.lo && f.number <= e.hi)) add(f.numberRange, `"${d.fullName}" does not declare ${f.number} as an extension number.`);
            }
          }
        }
        for (const m of a.messages) checkMessage(m, pkg);
        for (const e of a.enums) checkEnum(e, pkg);
        for (const x of a.extends) checkExtend(x, pkg);
        for (const s of a.services) {
          define(pkg, s.name, s.nameRange, "service");
          const names = /* @__PURE__ */ new Set();
          for (const r of s.rpcs) {
            if (names.has(r.name)) add(r.nameRange, `"${r.name}" is already defined in "${s.fullName}".`);
            names.add(r.name);
          }
        }
        if (!unresolvedOption && !incomplete && opts.unusedImports !== false) {
          for (const imp of a.imports) {
            if (imp.kind === "public" || imp.kind === "weak") continue;
            const r = index.resolveImport(file, imp.path);
            if (!r) continue;
            if (r.builtin) {
              if (!usedFiles.has("builtin") && !r.builtin.wildcard) add(imp.stmt, `Import ${imp.path} is unused.`, "hint", { unnecessary: true, code: "unused-import" });
              continue;
            }
            const reach = [r.file];
            const seen = /* @__PURE__ */ new Set();
            let used = false;
            while (reach.length && !used) {
              const f = reach.pop();
              if (seen.has(f)) continue;
              seen.add(f);
              if (usedFiles.has(f)) used = true;
              const fa = index.get(f);
              if (fa) {
                for (const i2 of fa.imports) if (i2.kind === "public") {
                  const r2 = index.resolveImport(f, i2.path);
                  if (r2 && r2.file) reach.push(r2.file);
                  else if (r2 && r2.builtin && usedFiles.has("builtin")) used = true;
                }
              }
            }
            if (!used) add(imp.stmt, `Import ${imp.path} is unused.`, "hint", { unnecessary: true, code: "unused-import" });
          }
        }
        return out;
      }
      function nextFree(m) {
        let n = Math.max(0, ...m.fields.map((f) => f.number)) + 1;
        for (let guard = 0; guard < 1e3; guard++) {
          const r = [...m.reserved.ranges, ...m.extensions].find((x) => n >= x.lo && n <= x.hi);
          if (!r) break;
          n = r.hi + 1;
        }
        if (n >= 19e3 && n <= 19999) n = 2e4;
        return n;
      }
      function joinName(scope, name) {
        return scope ? `${scope}.${name}` : name;
      }
      module.exports = { check };
    }
  });

  // ../../../../toolchk4-work/tc4-vwpcrj66/entry.js
  var parser = require_parser();
  var fmt = require_format();
  var idx = require_proto();
  var chk = require_check();
  self.ZovoEngine = {
    parse: parser.parse,
    SCALARS: parser.SCALARS,
    MAX_FIELD: parser.MAX_FIELD,
    format: fmt.format,
    lineDiff: fmt.lineDiff,
    createIndex: idx.createIndex,
    check: chk.check
  };
})();
