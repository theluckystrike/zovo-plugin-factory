/* Zovo XML Formatter & XPath Tools core (0.1.0, commit caff0ff70618), with @xmldom/xmldom and xpath (MIT), for the browser tool page
   (bundled by TOOLCHK5 with esbuild). MIT license, github.com/theluckystrike/xml-xpath-tools-vscode. No network code. */
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/core/scan.js
  var require_scan = __commonJS({
    "src/core/scan.js"(exports, module) {
      "use strict";
      var NAME_START = "A-Za-z_:\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\uD800-\\uDBFF";
      var NAME_CHAR = NAME_START + "\\-.0-9\\u00B7\\u0300-\\u036F\\u203F\\u2040\\uDC00-\\uDFFF";
      var NAME_RE = new RegExp(`[${NAME_START}][${NAME_CHAR}]*`, "y");
      var REF_RE = new RegExp(`&(?:#[0-9]+|#x[0-9a-fA-F]+|([${NAME_START}][${NAME_CHAR}]*));`, "y");
      var PREDEFINED = /* @__PURE__ */ new Set(["lt", "gt", "amp", "apos", "quot"]);
      var XmlError = class extends Error {
        constructor(message, offset) {
          super(message);
          this.offset = offset;
        }
      };
      function lineCol(text, offset) {
        let line = 1, last = -1, i = -1;
        while ((i = text.indexOf("\n", i + 1)) !== -1 && i < offset) {
          line++;
          last = i;
        }
        return { line, col: offset - last };
      }
      function isWs(c) {
        return c === 32 || c === 10 || c === 9 || c === 13;
      }
      function firstNonWs(text, s, e) {
        for (let i = s; i < e; i++) if (!isWs(text.charCodeAt(i))) return i;
        return -1;
      }
      function skipWs(text, p, n) {
        while (p < n && isWs(text.charCodeAt(p))) p++;
        return p;
      }
      function findIn(text, sub, s, e) {
        if (e - s < sub.length) return -1;
        const k = text.slice(s, e).indexOf(sub);
        return k < 0 ? -1 : s + k;
      }
      function readDoctype(text, lt) {
        const n = text.length;
        let p = lt + 9, depth = 0, subsetStart = -1, subsetEnd = -1;
        while (p < n) {
          const c = text[p];
          if (c === '"' || c === "'") {
            const q = text.indexOf(c, p + 1);
            if (q < 0) throw new XmlError("Unclosed quote in DOCTYPE", p);
            p = q + 1;
            continue;
          }
          if (depth > 0 && c === "<" && text.startsWith("<!--", p)) {
            const q = text.indexOf("-->", p + 4);
            if (q < 0) throw new XmlError("Unclosed comment in DOCTYPE", p);
            p = q + 3;
            continue;
          }
          if (depth > 0 && c === "<" && text[p + 1] === "?") {
            const q = text.indexOf("?>", p + 2);
            if (q < 0) throw new XmlError("Unclosed processing instruction in DOCTYPE", p);
            p = q + 2;
            continue;
          }
          if (c === "[") {
            if (depth === 0) subsetStart = p + 1;
            depth++;
          } else if (c === "]") {
            depth--;
            if (depth === 0) subsetEnd = p;
            if (depth < 0) throw new XmlError('Unexpected "]" in DOCTYPE', p);
          } else if (c === ">" && depth === 0) {
            const head = text.slice(lt, subsetStart > 0 ? subsetStart : p);
            return { end: p + 1, subsetStart, subsetEnd, external: /\b(SYSTEM|PUBLIC)\b/.test(head) };
          }
          p++;
        }
        throw new XmlError("Unclosed DOCTYPE", lt);
      }
      function inspectEntities(text, s, e) {
        const out = { count: 0, external: [], names: /* @__PURE__ */ new Set(), parameter: 0, maxExpansion: 0, biggest: "" };
        if (s < 0 || e <= s) return out;
        const sub = text.slice(s, e);
        const re = /<!ENTITY\s+(%\s+)?([^\s"'>]+)\s+(?:(SYSTEM|PUBLIC)\s+(?:"[^"]*"|'[^']*')(?:\s+(?:"[^"]*"|'[^']*'))?|"([^"]*)"|'([^']*)')/g;
        const values = /* @__PURE__ */ new Map();
        let m;
        while (m = re.exec(sub)) {
          out.count++;
          if (m[1]) {
            out.parameter++;
            continue;
          }
          const name2 = m[2];
          out.names.add(name2);
          if (m[3]) {
            out.external.push(name2);
            continue;
          }
          values.set(name2, m[4] !== void 0 ? m[4] : m[5]);
        }
        const CAP = 1e15;
        const size = /* @__PURE__ */ new Map();
        const visiting = /* @__PURE__ */ new Set();
        const measure = (name2) => {
          if (size.has(name2)) return size.get(name2);
          if (visiting.has(name2)) return CAP;
          visiting.add(name2);
          const v = values.get(name2) || "";
          let total = 0, last = 0;
          const r = /&([^\s;&#]+);/g;
          let k;
          while (k = r.exec(v)) {
            total += k.index - last;
            last = r.lastIndex;
            total += values.has(k[1]) ? measure(k[1]) : k[0].length;
            if (total > CAP) {
              total = CAP;
              break;
            }
          }
          total = Math.min(CAP, total + v.length - last);
          visiting.delete(name2);
          size.set(name2, total);
          return total;
        };
        for (const name2 of values.keys()) {
          const sz = measure(name2);
          if (sz > out.maxExpansion) {
            out.maxExpansion = sz;
            out.biggest = name2;
          }
        }
        return out;
      }
      function scan(text, h, options = {}) {
        const fragment = !!options.fragment;
        const n = text.length;
        const stack = [];
        const stackAt = [];
        let pos = text.charCodeAt(0) === 65279 ? 1 : 0;
        let rootDone = false, rootSeen = false;
        let entityNames = null, anyEntity = fragment;
        let nextProgress = 1 << 20;
        const checkRefs = (s, e) => {
          let a = findIn(text, "&", s, e);
          while (a !== -1) {
            REF_RE.lastIndex = a;
            const m = REF_RE.exec(text);
            if (!m || REF_RE.lastIndex > e) throw new XmlError('"&" must start an entity or character reference; write &amp; for a plain "&"', a);
            const name2 = m[1];
            if (name2 && !PREDEFINED.has(name2) && !anyEntity && !(entityNames && entityNames.has(name2))) {
              throw new XmlError(`Entity &${name2}; is not declared`, a);
            }
            a = findIn(text, "&", REF_RE.lastIndex, e);
          }
        };
        while (pos < n) {
          if (pos >= nextProgress) {
            if (h.progress) h.progress(pos);
            nextProgress = pos + (1 << 20);
          }
          const lt = text.indexOf("<", pos);
          const tEnd = lt < 0 ? n : lt;
          if (tEnd > pos) {
            if (stack.length === 0 && !fragment) {
              const k = firstNonWs(text, pos, tEnd);
              if (k >= 0) throw new XmlError(rootDone ? "Text after the root element" : "Text before the root element", k);
            }
            checkRefs(pos, tEnd);
            const gt = findIn(text, "]]>", pos, tEnd);
            if (gt !== -1) throw new XmlError('"]]>" is not allowed in text; write ]]&gt;', gt);
            if (h.text) h.text(pos, tEnd);
          }
          if (lt < 0) break;
          const c = text.charCodeAt(lt + 1);
          if (c === 33) {
            if (text.startsWith("<!--", lt)) {
              const q = text.indexOf("-->", lt + 4);
              if (q < 0) throw new XmlError("Comment is not closed with -->", lt);
              if (h.comment) h.comment(lt, q + 3);
              pos = q + 3;
              continue;
            }
            if (text.startsWith("<![CDATA[", lt)) {
              if (stack.length === 0 && !fragment) throw new XmlError("CDATA section outside the root element", lt);
              const q = text.indexOf("]]>", lt + 9);
              if (q < 0) throw new XmlError("CDATA section is not closed with ]]>", lt);
              if (h.cdata) h.cdata(lt, q + 3);
              pos = q + 3;
              continue;
            }
            if (text.startsWith("<!DOCTYPE", lt)) {
              if (rootSeen) throw new XmlError("DOCTYPE after the root element", lt);
              const info = readDoctype(text, lt);
              info.entities = inspectEntities(text, info.subsetStart, info.subsetEnd);
              entityNames = info.entities.names;
              anyEntity = info.external || info.entities.parameter > 0;
              if (h.doctype) h.doctype(lt, info.end, info);
              pos = info.end;
              continue;
            }
            throw new XmlError('Unexpected "<!"', lt);
          }
          if (c === 63) {
            const q = text.indexOf("?>", lt + 2);
            if (q < 0) throw new XmlError("Processing instruction is not closed with ?>", lt);
            if (h.pi) h.pi(lt, q + 2);
            pos = q + 2;
            continue;
          }
          if (c === 47) {
            NAME_RE.lastIndex = lt + 2;
            const m2 = NAME_RE.exec(text);
            if (!m2) throw new XmlError("Invalid end tag", lt);
            const name3 = m2[0];
            const p2 = skipWs(text, NAME_RE.lastIndex, n);
            if (text.charCodeAt(p2) !== 62) throw new XmlError(`End tag </${name3}> is not closed with ">"`, lt);
            if (!stack.length) throw new XmlError(`End tag </${name3}> has no start tag`, lt);
            const top = stack[stack.length - 1];
            if (top !== name3) {
              const lc = lineCol(text, stackAt[stackAt.length - 1]);
              throw new XmlError(`Expected </${top}> to close <${top}> from line ${lc.line}, found </${name3}>`, lt);
            }
            stack.pop();
            stackAt.pop();
            if (h.end) h.end(name3, lt, p2 + 1);
            if (!stack.length) rootDone = true;
            pos = p2 + 1;
            continue;
          }
          NAME_RE.lastIndex = lt + 1;
          const m = NAME_RE.exec(text);
          if (!m) throw new XmlError('"<" must start a tag; write &lt; for a plain "<"', lt);
          const name2 = m[0];
          if (stack.length === 0 && rootDone && !fragment) throw new XmlError(`Second root element <${name2}>; a document has one root`, lt);
          let p = NAME_RE.lastIndex;
          const attrs = [];
          let end = -1, empty = false;
          for (; ; ) {
            const w = skipWs(text, p, n);
            if (w >= n) throw new XmlError(`Tag <${name2}> is not closed with ">"`, lt);
            const ch = text.charCodeAt(w);
            if (ch === 62) {
              end = w + 1;
              break;
            }
            if (ch === 47) {
              if (text.charCodeAt(w + 1) !== 62) throw new XmlError(`Expected "/>" in <${name2}>`, w);
              end = w + 2;
              empty = true;
              break;
            }
            if (ch === 60) throw new XmlError(`Tag <${name2}> is not closed with ">"`, lt);
            if (w === p) throw new XmlError(`Expected a space before the attribute in <${name2}>`, w);
            NAME_RE.lastIndex = w;
            const a = NAME_RE.exec(text);
            if (!a) throw new XmlError(`Invalid attribute in <${name2}>`, w);
            const ne = NAME_RE.lastIndex;
            let q = skipWs(text, ne, n);
            if (text.charCodeAt(q) !== 61) throw new XmlError(`Attribute ${a[0]} in <${name2}> needs ="value"`, w);
            q = skipWs(text, q + 1, n);
            const quote = text[q];
            if (quote !== '"' && quote !== "'") throw new XmlError(`Value of ${a[0]} in <${name2}> must be in quotes`, q);
            const qe = text.indexOf(quote, q + 1);
            if (qe < 0) throw new XmlError(`Value of ${a[0]} in <${name2}> is not closed`, q);
            const bad = findIn(text, "<", q + 1, qe);
            if (bad !== -1) throw new XmlError(`"<" is not allowed in the value of ${a[0]}; write &lt;`, bad);
            checkRefs(q + 1, qe);
            for (let k = 0; k < attrs.length; k += 4) {
              if (attrs[k + 1] - attrs[k] === ne - w && text.startsWith(a[0], attrs[k])) throw new XmlError(`Attribute ${a[0]} appears twice in <${name2}>`, w);
            }
            attrs.push(w, ne, q, qe + 1);
            p = qe + 1;
          }
          rootSeen = true;
          if (h.start) h.start(name2, lt, end, attrs, empty);
          if (!empty) {
            stack.push(name2);
            stackAt.push(lt);
          } else if (!stack.length) rootDone = true;
          pos = end;
        }
        if (stack.length) {
          throw new XmlError(`<${stack[stack.length - 1]}> is not closed`, stackAt[stackAt.length - 1]);
        }
        if (!rootSeen && !fragment) throw new XmlError("No root element", Math.min(pos, n));
        return true;
      }
      module.exports = { scan, XmlError, lineCol, firstNonWs, isWs, inspectEntities, readDoctype, NAME_RE };
    }
  });

  // src/core/index.js
  var require_core = __commonJS({
    "src/core/index.js"(exports, module) {
      "use strict";
      var { scan, XmlError, lineCol, firstNonWs } = require_scan();
      var KEY_ATTRS = ["id", "xml:id", "name", "key", "android:id", "android:name", "x:Name", "x:Key", "Name", "Id", "ID", "Include", "ref", "code", "title", "type"];
      var KEY_RANK = new Map(KEY_ATTRS.map((a, i) => [a, i]));
      function grow(a, n) {
        const b = new a.constructor(n);
        b.set(a);
        return b;
      }
      function buildIndex(text, onProgress) {
        let cap = 1024, count = 0;
        let start = new Int32Array(cap), openEnd = new Int32Array(cap), end = new Int32Array(cap);
        let parent = new Int32Array(cap), firstChild = new Int32Array(cap), nextSibling = new Int32Array(cap);
        let childCount = new Int32Array(cap), nameId = new Int32Array(cap), nsId = new Int32Array(cap), attrCount = new Int32Array(cap);
        const names = [], nameMap = /* @__PURE__ */ new Map();
        const uris = [""], uriMap = /* @__PURE__ */ new Map([["", 0]]);
        const keyName = [], keyValue = [], preview = [];
        const lastChild = [];
        const prefixes = {};
        const conflicts = /* @__PURE__ */ new Set();
        const unbound = [];
        let defaultNs = null;
        const stack = [];
        const scopes = [{ xml: "http://www.w3.org/XML/1998/namespace", "": "" }];
        const roots = [];
        let doctype = null;
        const id = (map, list, v) => {
          let k = map.get(v);
          if (k === void 0) {
            k = list.length;
            list.push(v);
            map.set(v, k);
          }
          return k;
        };
        const ensure = () => {
          if (count < cap) return;
          cap *= 2;
          start = grow(start, cap);
          openEnd = grow(openEnd, cap);
          end = grow(end, cap);
          parent = grow(parent, cap);
          firstChild = grow(firstChild, cap);
          nextSibling = grow(nextSibling, cap);
          childCount = grow(childCount, cap);
          nameId = grow(nameId, cap);
          nsId = grow(nsId, cap);
          attrCount = grow(attrCount, cap);
        };
        let error = null;
        try {
          scan(text, {
            start(name2, s, e, attrs, empty) {
              ensure();
              const i = count++;
              const p = stack.length ? stack[stack.length - 1] : -1;
              start[i] = s;
              openEnd[i] = e;
              end[i] = empty ? e : -1;
              parent[i] = p;
              firstChild[i] = -1;
              nextSibling[i] = -1;
              childCount[i] = 0;
              attrCount[i] = attrs.length / 4;
              nameId[i] = id(nameMap, names, name2);
              keyName.push("");
              keyValue.push("");
              preview.push("");
              lastChild.push(-1);
              if (p >= 0) {
                if (lastChild[p] < 0) firstChild[p] = i;
                else nextSibling[lastChild[p]] = i;
                lastChild[p] = i;
                childCount[p]++;
              } else roots.push(i);
              let scope = scopes[scopes.length - 1];
              let best = 99;
              for (let k = 0; k < attrs.length; k += 4) {
                const an = text.slice(attrs[k], attrs[k + 1]);
                const av = text.slice(attrs[k + 2] + 1, attrs[k + 3] - 1);
                if (an === "xmlns" || an.startsWith("xmlns:")) {
                  if (scope === scopes[scopes.length - 1]) scope = Object.create(scope);
                  const pre2 = an === "xmlns" ? "" : an.slice(6);
                  scope[pre2] = av;
                  if (pre2) {
                    if (!(pre2 in prefixes)) prefixes[pre2] = av;
                    else if (prefixes[pre2] !== av) conflicts.add(pre2);
                  } else if (defaultNs === null && av) defaultNs = av;
                  continue;
                }
                const r = KEY_RANK.get(an);
                if (r !== void 0 && r < best && av.length <= 200) {
                  best = r;
                  keyName[i] = an;
                  keyValue[i] = av;
                }
              }
              const c = name2.indexOf(":");
              const pre = c > 0 ? name2.slice(0, c) : "";
              const uri = scope[pre];
              if (uri === void 0) {
                unbound.push([s, pre]);
                nsId[i] = 0;
              } else nsId[i] = id(uriMap, uris, uri);
              for (let k = 0; k < attrs.length; k += 4) {
                const an = text.slice(attrs[k], attrs[k + 1]);
                const ac = an.indexOf(":");
                if (ac > 0 && !an.startsWith("xmlns:")) {
                  const ap = an.slice(0, ac);
                  if (scope[ap] === void 0) unbound.push([attrs[k], ap]);
                }
              }
              if (!empty) {
                stack.push(i);
                scopes.push(scope);
              }
            },
            end(name2, s, e) {
              const i = stack.pop();
              scopes.pop();
              end[i] = e;
            },
            text(s, e) {
              if (!stack.length) return;
              const i = stack[stack.length - 1];
              if (preview[i]) return;
              const k = firstNonWs(text, s, Math.min(e, s + 4096));
              if (k >= 0) preview[i] = text.slice(k, Math.min(e, k + 80)).replace(/\s+/g, " ").trim();
            },
            cdata(s, e) {
              if (!stack.length) return;
              const i = stack[stack.length - 1];
              if (!preview[i]) preview[i] = text.slice(s + 9, Math.min(e - 3, s + 89)).replace(/\s+/g, " ").trim();
            },
            doctype(s, e, info) {
              doctype = { start: s, end: e, subsetStart: info.subsetStart, subsetEnd: info.subsetEnd, external: info.external, entities: summarize(info.entities) };
            },
            progress: onProgress ? (off) => onProgress(off / text.length) : void 0
          });
        } catch (e) {
          if (!(e instanceof XmlError)) throw e;
          error = { message: e.message, offset: e.offset, ...lineCol(text, e.offset) };
          for (const i of stack) end[i] = text.length;
        }
        const cut = (a) => a.slice(0, count);
        return {
          count,
          start: cut(start),
          openEnd: cut(openEnd),
          end: cut(end),
          parent: cut(parent),
          firstChild: cut(firstChild),
          nextSibling: cut(nextSibling),
          childCount: cut(childCount),
          nameId: cut(nameId),
          nsId: cut(nsId),
          attrCount: cut(attrCount),
          names,
          uris,
          keyName,
          keyValue,
          preview,
          roots,
          prefixes,
          conflicts: [...conflicts],
          unbound: unbound.slice(0, 50),
          defaultNs,
          doctype,
          error,
          length: text.length
        };
      }
      function summarize(ent) {
        return { count: ent.count, external: ent.external.slice(0, 20), parameter: ent.parameter, maxExpansion: ent.maxExpansion, biggest: ent.biggest };
      }
      function elementAt(ix2, offset) {
        let lo = 0, hi = ix2.count - 1, best = -1;
        while (lo <= hi) {
          const mid = lo + hi >> 1;
          if (ix2.start[mid] <= offset) {
            best = mid;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        let i = best;
        while (i >= 0 && offset >= ix2.end[i]) i = ix2.parent[i];
        return i;
      }
      function children(ix2, i) {
        const out = [];
        for (let c = i < 0 ? -1 : ix2.firstChild[i]; c >= 0; c = ix2.nextSibling[c]) out.push(c);
        return i < 0 ? ix2.roots.slice() : out;
      }
      function localName(ix2, i) {
        const n = ix2.names[ix2.nameId[i]];
        const c = n.indexOf(":");
        return c > 0 ? n.slice(c + 1) : n;
      }
      function prefixOf(ix2, i) {
        const n = ix2.names[ix2.nameId[i]];
        const c = n.indexOf(":");
        return c > 0 ? n.slice(0, c) : "";
      }
      module.exports = { buildIndex, elementAt, children, localName, prefixOf, KEY_ATTRS };
    }
  });

  // src/core/format.js
  var require_format = __commonJS({
    "src/core/format.js"(exports, module) {
      "use strict";
      var { scan, XmlError, lineCol, firstNonWs } = require_scan();
      var K_TEXT = 1;
      var K_START = 2;
      var K_END = 3;
      var K_EMPTY = 4;
      var K_COMMENT = 5;
      var K_CDATA = 6;
      var K_PI = 7;
      var K_DOCTYPE = 8;
      var F_MIXED = 1;
      var F_MARKUP = 2;
      var F_PRESERVE = 4;
      function tokenize(text, options, onProgress) {
        const kind = [], start = [], end = [], match = [], flags = [], attrsOf = /* @__PURE__ */ new Map();
        const stack = [];
        const markParent = (f) => {
          if (stack.length) flags[stack[stack.length - 1]] |= f;
        };
        const push = (k, s, e) => {
          kind.push(k);
          start.push(s);
          end.push(e);
          match.push(-1);
          flags.push(0);
          return kind.length - 1;
        };
        scan(text, {
          text(s, e) {
            push(K_TEXT, s, e);
            if (stack.length && firstNonWs(text, s, e) >= 0) markParent(F_MIXED);
          },
          start(name2, s, e, attrs, empty) {
            markParent(F_MARKUP);
            const i = push(empty ? K_EMPTY : K_START, s, e);
            if (attrs.length) attrsOf.set(i, attrs);
            if (!empty) {
              for (let k = 0; k < attrs.length; k += 4) {
                if (attrs[k + 1] - attrs[k] === 9 && text.startsWith("xml:space", attrs[k])) {
                  if (text.slice(attrs[k + 2] + 1, attrs[k + 3] - 1).trim() === "preserve") flags[i] |= F_PRESERVE;
                }
              }
              stack.push(i);
            }
          },
          end(name2, s, e) {
            const i = push(K_END, s, e);
            const o = stack.pop();
            match[o] = i;
            match[i] = o;
          },
          comment(s, e) {
            markParent(F_MARKUP);
            push(K_COMMENT, s, e);
          },
          cdata(s, e) {
            markParent(F_MIXED);
            push(K_CDATA, s, e);
          },
          pi(s, e) {
            markParent(F_MARKUP);
            push(K_PI, s, e);
          },
          doctype(s, e) {
            push(K_DOCTYPE, s, e);
          },
          progress: onProgress ? (off) => onProgress(off / text.length) : void 0
        }, { fragment: !!options.fragment });
        return { kind, start, end, match, flags, attrsOf };
      }
      function countNl(text, s, e) {
        let c = 0;
        for (let i = s; i < e; i++) if (text.charCodeAt(i) === 10) c++;
        return c;
      }
      function hasNl(text, s, e) {
        for (let i = s; i < e; i++) {
          const c = text.charCodeAt(i);
          if (c === 10 || c === 13) return true;
        }
        return false;
      }
      function keepAsIs(T, text, i) {
        const f = T.flags[i];
        if (f & (F_MIXED | F_PRESERVE)) return true;
        if (f & F_MARKUP) return false;
        const j = T.match[i];
        return !hasNl(text, T.end[i], T.start[j]);
      }
      function tagName(text, s) {
        let p = s + 1;
        while (p < text.length) {
          const c = text.charCodeAt(p);
          if (c === 32 || c === 10 || c === 9 || c === 13 || c === 62 || c === 47) break;
          p++;
        }
        return text.slice(s + 1, p);
      }
      function format(text, options = {}, onProgress) {
        const o = {
          indent: options.indent === void 0 ? "  " : options.indent,
          eol: options.eol || "\n",
          attributes: options.attributes || "keep",
          keepBlankLines: options.keepBlankLines !== false,
          fragment: !!options.fragment,
          baseIndent: options.baseIndent || "",
          minify: !!options.minify,
          removeComments: !!options.removeComments
        };
        if (o.minify) {
          o.indent = "";
          o.eol = "";
          o.keepBlankLines = false;
          o.baseIndent = "";
          o.attributes = "oneLine";
        }
        let T;
        try {
          T = tokenize(text, o, onProgress ? (f) => onProgress(f * 0.6) : null);
        } catch (e) {
          if (e instanceof XmlError) return { ok: false, error: { message: e.message, offset: e.offset, ...lineCol(text, e.offset) } };
          throw e;
        }
        const { kind, start, end, match } = T;
        const out = [];
        const bom = text.charCodeAt(0) === 65279 ? "\uFEFF" : "";
        const indents = [o.baseIndent];
        const ind = (d) => {
          while (indents.length <= d) indents.push(indents[indents.length - 1] + o.indent);
          return indents[d];
        };
        let wrote = false;
        let blank = false;
        const newLine = (depth2) => {
          if (wrote) out.push(o.eol);
          if (blank && wrote && !o.minify) out.push(o.eol);
          blank = false;
          out.push(ind(depth2));
          wrote = true;
        };
        const tag = (i, depth2) => {
          const s = start[i], e = end[i];
          const attrs = T.attrsOf.get(i);
          const name2 = tagName(text, s);
          const empty = kind[i] === K_EMPTY;
          let close = ">";
          if (empty) {
            close = (attrs ? hasSpaceBefore(text, e - 2, attrs[attrs.length - 1]) : hasSpaceBefore(text, e - 2, s + 1 + name2.length)) ? " />" : "/>";
          }
          if (!attrs) return "<" + name2 + close;
          const parts = [];
          for (let k = 0; k < attrs.length; k += 4) parts.push(text.slice(attrs[k], attrs[k + 1]) + "=" + text.slice(attrs[k + 2], attrs[k + 3]));
          let multi = false, firstOwnLine = false;
          if (o.attributes === "onePerLine") {
            multi = parts.length > 1;
            firstOwnLine = false;
          } else if (o.attributes === "keep") {
            firstOwnLine = hasNl(text, s + 1 + name2.length, attrs[0]);
            multi = firstOwnLine;
            for (let k = 4; k < attrs.length && !multi; k += 4) multi = hasNl(text, attrs[k - 1], attrs[k]);
          }
          if (!multi) return "<" + name2 + " " + parts.join(" ") + close;
          const pad = o.eol + ind(depth2 + 1);
          return "<" + name2 + (firstOwnLine ? pad : " ") + parts.join(pad) + close;
        };
        const n = kind.length;
        let depth = 0;
        for (let i = 0; i < n; i++) {
          if (onProgress && (i & 262143) === 0) onProgress(0.6 + 0.35 * (i / n));
          const k = kind[i];
          if (k === K_TEXT) {
            const s = start[i], e = end[i];
            if (firstNonWs(text, s, e) >= 0) {
              out.push(text.slice(s, e));
              wrote = true;
              continue;
            }
            if (o.keepBlankLines && wrote && i > 0 && kind[i - 1] !== K_START && countNl(text, s, e) >= 2) {
              const next = i + 1 < n ? kind[i + 1] : 0;
              if (next && next !== K_END) blank = true;
            }
            continue;
          }
          if (k === K_COMMENT) {
            if (o.removeComments && o.minify) continue;
            const prev = i > 0 ? kind[i - 1] : 0;
            const sameLine = !o.minify && wrote && prev === K_TEXT && i > 1 && kind[i - 2] !== K_START && !hasNl(text, start[i - 1], end[i - 1]) && end[i - 1] > start[i - 1];
            if (sameLine) {
              out.push(" " + text.slice(start[i], end[i]));
              continue;
            }
            newLine(depth);
            out.push(text.slice(start[i], end[i]));
            continue;
          }
          if (k === K_PI || k === K_DOCTYPE || k === K_CDATA) {
            newLine(depth);
            out.push(text.slice(start[i], end[i]));
            continue;
          }
          if (k === K_EMPTY) {
            newLine(depth);
            out.push(tag(i, depth));
            continue;
          }
          if (k === K_START) {
            newLine(depth);
            out.push(tag(i, depth));
            const j = match[i];
            if (keepAsIs(T, text, i)) {
              out.push(text.slice(end[i], start[j]));
              out.push("</" + tagName(text, start[j] + 1).replace(/^\//, "") + ">");
              i = j;
              continue;
            }
            if (j === i + 1 || (T.flags[i] & F_MARKUP) === 0) {
              out.push("</" + tagName(text, start[j] + 1) + ">");
              i = j;
              continue;
            }
            depth++;
            continue;
          }
          if (k === K_END) {
            depth--;
            blank = false;
            newLine(depth);
            out.push("</" + tagName(text, start[i] + 1) + ">");
          }
        }
        if (!o.fragment && !o.minify && /\r?\n[ \t]*$/.test(text.slice(-64))) out.push(o.eol);
        if (o.fragment && /\r?\n$/.test(text.slice(-2))) out.push(o.eol);
        if (onProgress) onProgress(0.97);
        const result = bom + out.join("");
        return { ok: true, text: result, changed: result !== text };
      }
      function hasSpaceBefore(text, slashAt, from) {
        return slashAt > from && /\s/.test(text[slashAt - 1]);
      }
      function minify(text, options = {}, onProgress) {
        return format(text, { ...options, minify: true }, onProgress);
      }
      module.exports = { format, minify, tokenize };
    }
  });

  // node_modules/@xmldom/xmldom/lib/conventions.js
  var require_conventions = __commonJS({
    "node_modules/@xmldom/xmldom/lib/conventions.js"(exports) {
      "use strict";
      function find(list, predicate, ac) {
        if (ac === void 0) {
          ac = Array.prototype;
        }
        if (list && typeof ac.find === "function") {
          return ac.find.call(list, predicate);
        }
        for (var i = 0; i < list.length; i++) {
          if (hasOwn(list, i)) {
            var item = list[i];
            if (predicate.call(void 0, item, i, list)) {
              return item;
            }
          }
        }
      }
      function freeze(object, oc) {
        if (oc === void 0) {
          oc = Object;
        }
        if (oc && typeof oc.getOwnPropertyDescriptors === "function") {
          object = oc.create(null, oc.getOwnPropertyDescriptors(object));
        }
        return oc && typeof oc.freeze === "function" ? oc.freeze(object) : object;
      }
      function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object, key);
      }
      function assign(target, source) {
        if (target === null || typeof target !== "object") {
          throw new TypeError("target is not an object");
        }
        for (var key in source) {
          if (hasOwn(source, key)) {
            target[key] = source[key];
          }
        }
        return target;
      }
      var HTML_BOOLEAN_ATTRIBUTES = freeze({
        allowfullscreen: true,
        async: true,
        autofocus: true,
        autoplay: true,
        checked: true,
        controls: true,
        default: true,
        defer: true,
        disabled: true,
        formnovalidate: true,
        hidden: true,
        ismap: true,
        itemscope: true,
        loop: true,
        multiple: true,
        muted: true,
        nomodule: true,
        novalidate: true,
        open: true,
        playsinline: true,
        readonly: true,
        required: true,
        reversed: true,
        selected: true
      });
      function isHTMLBooleanAttribute(name2) {
        return hasOwn(HTML_BOOLEAN_ATTRIBUTES, name2.toLowerCase());
      }
      var HTML_VOID_ELEMENTS = freeze({
        area: true,
        base: true,
        br: true,
        col: true,
        embed: true,
        hr: true,
        img: true,
        input: true,
        link: true,
        meta: true,
        param: true,
        source: true,
        track: true,
        wbr: true
      });
      function isHTMLVoidElement(tagName) {
        return hasOwn(HTML_VOID_ELEMENTS, tagName.toLowerCase());
      }
      var HTML_RAW_TEXT_ELEMENTS = freeze({
        script: false,
        style: false,
        textarea: true,
        title: true
      });
      function isHTMLRawTextElement(tagName) {
        var key = tagName.toLowerCase();
        return hasOwn(HTML_RAW_TEXT_ELEMENTS, key) && !HTML_RAW_TEXT_ELEMENTS[key];
      }
      function isHTMLEscapableRawTextElement(tagName) {
        var key = tagName.toLowerCase();
        return hasOwn(HTML_RAW_TEXT_ELEMENTS, key) && HTML_RAW_TEXT_ELEMENTS[key];
      }
      function isHTMLMimeType(mimeType) {
        return mimeType === MIME_TYPE.HTML;
      }
      function hasDefaultHTMLNamespace(mimeType) {
        return isHTMLMimeType(mimeType) || mimeType === MIME_TYPE.XML_XHTML_APPLICATION;
      }
      var MIME_TYPE = freeze({
        /**
         * `text/html`, the only mime type that triggers treating an XML document as HTML.
         *
         * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
         * @see https://en.wikipedia.org/wiki/HTML Wikipedia
         * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
         * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring
         *      WHATWG HTML Spec
         */
        HTML: "text/html",
        /**
         * `application/xml`, the standard mime type for XML documents.
         *
         * @see https://www.iana.org/assignments/media-types/application/xml IANA MimeType
         *      registration
         * @see https://tools.ietf.org/html/rfc7303#section-9.1 RFC 7303
         * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
         */
        XML_APPLICATION: "application/xml",
        /**
         * `text/xml`, an alias for `application/xml`.
         *
         * @see https://tools.ietf.org/html/rfc7303#section-9.2 RFC 7303
         * @see https://www.iana.org/assignments/media-types/text/xml IANA MimeType registration
         * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
         */
        XML_TEXT: "text/xml",
        /**
         * `application/xhtml+xml`, indicates an XML document that has the default HTML namespace,
         * but is parsed as an XML document.
         *
         * @see https://www.iana.org/assignments/media-types/application/xhtml+xml IANA MimeType
         *      registration
         * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument WHATWG DOM Spec
         * @see https://en.wikipedia.org/wiki/XHTML Wikipedia
         */
        XML_XHTML_APPLICATION: "application/xhtml+xml",
        /**
         * `image/svg+xml`,
         *
         * @see https://www.iana.org/assignments/media-types/image/svg+xml IANA MimeType registration
         * @see https://www.w3.org/TR/SVG11/ W3C SVG 1.1
         * @see https://en.wikipedia.org/wiki/Scalable_Vector_Graphics Wikipedia
         */
        XML_SVG_IMAGE: "image/svg+xml"
      });
      var _MIME_TYPES = Object.keys(MIME_TYPE).map(function(key) {
        return MIME_TYPE[key];
      });
      function isValidMimeType(mimeType) {
        return _MIME_TYPES.indexOf(mimeType) > -1;
      }
      var NAMESPACE = freeze({
        /**
         * The XHTML namespace.
         *
         * @see http://www.w3.org/1999/xhtml
         */
        HTML: "http://www.w3.org/1999/xhtml",
        /**
         * The SVG namespace.
         *
         * @see http://www.w3.org/2000/svg
         */
        SVG: "http://www.w3.org/2000/svg",
        /**
         * The `xml:` namespace.
         *
         * @see http://www.w3.org/XML/1998/namespace
         */
        XML: "http://www.w3.org/XML/1998/namespace",
        /**
         * The `xmlns:` namespace.
         *
         * @see https://www.w3.org/2000/xmlns/
         */
        XMLNS: "http://www.w3.org/2000/xmlns/"
      });
      exports.assign = assign;
      exports.find = find;
      exports.freeze = freeze;
      exports.HTML_BOOLEAN_ATTRIBUTES = HTML_BOOLEAN_ATTRIBUTES;
      exports.HTML_RAW_TEXT_ELEMENTS = HTML_RAW_TEXT_ELEMENTS;
      exports.HTML_VOID_ELEMENTS = HTML_VOID_ELEMENTS;
      exports.hasDefaultHTMLNamespace = hasDefaultHTMLNamespace;
      exports.hasOwn = hasOwn;
      exports.isHTMLBooleanAttribute = isHTMLBooleanAttribute;
      exports.isHTMLRawTextElement = isHTMLRawTextElement;
      exports.isHTMLEscapableRawTextElement = isHTMLEscapableRawTextElement;
      exports.isHTMLMimeType = isHTMLMimeType;
      exports.isHTMLVoidElement = isHTMLVoidElement;
      exports.isValidMimeType = isValidMimeType;
      exports.MIME_TYPE = MIME_TYPE;
      exports.NAMESPACE = NAMESPACE;
    }
  });

  // node_modules/@xmldom/xmldom/lib/errors.js
  var require_errors = __commonJS({
    "node_modules/@xmldom/xmldom/lib/errors.js"(exports) {
      "use strict";
      var conventions = require_conventions();
      function extendError(constructor, writableName) {
        constructor.prototype = Object.create(Error.prototype, {
          constructor: { value: constructor },
          name: { value: constructor.name, enumerable: true, writable: writableName }
        });
      }
      var DOMExceptionName = conventions.freeze({
        /**
         * the default value as defined by the spec
         */
        Error: "Error",
        /**
         * @deprecated
         * Use RangeError instead.
         */
        IndexSizeError: "IndexSizeError",
        /**
         * @deprecated
         * Just to match the related static code, not part of the spec.
         */
        DomstringSizeError: "DomstringSizeError",
        HierarchyRequestError: "HierarchyRequestError",
        WrongDocumentError: "WrongDocumentError",
        InvalidCharacterError: "InvalidCharacterError",
        /**
         * @deprecated
         * Just to match the related static code, not part of the spec.
         */
        NoDataAllowedError: "NoDataAllowedError",
        NoModificationAllowedError: "NoModificationAllowedError",
        NotFoundError: "NotFoundError",
        NotSupportedError: "NotSupportedError",
        InUseAttributeError: "InUseAttributeError",
        InvalidStateError: "InvalidStateError",
        SyntaxError: "SyntaxError",
        InvalidModificationError: "InvalidModificationError",
        NamespaceError: "NamespaceError",
        /**
         * @deprecated
         * Use TypeError for invalid arguments,
         * "NotSupportedError" DOMException for unsupported operations,
         * and "NotAllowedError" DOMException for denied requests instead.
         */
        InvalidAccessError: "InvalidAccessError",
        /**
         * @deprecated
         * Just to match the related static code, not part of the spec.
         */
        ValidationError: "ValidationError",
        /**
         * @deprecated
         * Use TypeError instead.
         */
        TypeMismatchError: "TypeMismatchError",
        SecurityError: "SecurityError",
        NetworkError: "NetworkError",
        AbortError: "AbortError",
        /**
         * @deprecated
         * Just to match the related static code, not part of the spec.
         */
        URLMismatchError: "URLMismatchError",
        QuotaExceededError: "QuotaExceededError",
        TimeoutError: "TimeoutError",
        InvalidNodeTypeError: "InvalidNodeTypeError",
        DataCloneError: "DataCloneError",
        EncodingError: "EncodingError",
        NotReadableError: "NotReadableError",
        UnknownError: "UnknownError",
        ConstraintError: "ConstraintError",
        DataError: "DataError",
        TransactionInactiveError: "TransactionInactiveError",
        ReadOnlyError: "ReadOnlyError",
        VersionError: "VersionError",
        OperationError: "OperationError",
        NotAllowedError: "NotAllowedError",
        OptOutError: "OptOutError"
      });
      var DOMExceptionNames = Object.keys(DOMExceptionName);
      function isValidDomExceptionCode(value) {
        return typeof value === "number" && value >= 1 && value <= 25;
      }
      function endsWithError(value) {
        return typeof value === "string" && value.substring(value.length - DOMExceptionName.Error.length) === DOMExceptionName.Error;
      }
      function DOMException(messageOrCode, nameOrMessage) {
        if (isValidDomExceptionCode(messageOrCode)) {
          this.name = DOMExceptionNames[messageOrCode];
          this.message = nameOrMessage || "";
        } else {
          this.message = messageOrCode;
          this.name = endsWithError(nameOrMessage) ? nameOrMessage : DOMExceptionName.Error;
        }
        if (Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
      }
      extendError(DOMException, true);
      Object.defineProperties(DOMException.prototype, {
        code: {
          enumerable: true,
          get: function() {
            var code = DOMExceptionNames.indexOf(this.name);
            if (isValidDomExceptionCode(code)) return code;
            return 0;
          }
        }
      });
      var ExceptionCode = {
        INDEX_SIZE_ERR: 1,
        DOMSTRING_SIZE_ERR: 2,
        HIERARCHY_REQUEST_ERR: 3,
        WRONG_DOCUMENT_ERR: 4,
        INVALID_CHARACTER_ERR: 5,
        NO_DATA_ALLOWED_ERR: 6,
        NO_MODIFICATION_ALLOWED_ERR: 7,
        NOT_FOUND_ERR: 8,
        NOT_SUPPORTED_ERR: 9,
        INUSE_ATTRIBUTE_ERR: 10,
        INVALID_STATE_ERR: 11,
        SYNTAX_ERR: 12,
        INVALID_MODIFICATION_ERR: 13,
        NAMESPACE_ERR: 14,
        INVALID_ACCESS_ERR: 15,
        VALIDATION_ERR: 16,
        TYPE_MISMATCH_ERR: 17,
        SECURITY_ERR: 18,
        NETWORK_ERR: 19,
        ABORT_ERR: 20,
        URL_MISMATCH_ERR: 21,
        QUOTA_EXCEEDED_ERR: 22,
        TIMEOUT_ERR: 23,
        INVALID_NODE_TYPE_ERR: 24,
        DATA_CLONE_ERR: 25
      };
      var entries = Object.entries(ExceptionCode);
      for (i = 0; i < entries.length; i++) {
        key = entries[i][0];
        DOMException[key] = entries[i][1];
      }
      var key;
      var i;
      function ParseError(message, locator, cause) {
        this.message = message;
        this.locator = locator;
        this.cause = cause;
        if (Error.captureStackTrace) Error.captureStackTrace(this, ParseError);
      }
      extendError(ParseError);
      exports.DOMException = DOMException;
      exports.DOMExceptionName = DOMExceptionName;
      exports.ExceptionCode = ExceptionCode;
      exports.ParseError = ParseError;
    }
  });

  // node_modules/@xmldom/xmldom/lib/grammar.js
  var require_grammar = __commonJS({
    "node_modules/@xmldom/xmldom/lib/grammar.js"(exports) {
      "use strict";
      function detectUnicodeSupport(RegExpImpl) {
        try {
          if (typeof RegExpImpl !== "function") {
            RegExpImpl = RegExp;
          }
          var match = new RegExpImpl("\u{1D306}", "u").exec("\u{1D306}");
          return !!match && match[0].length === 2;
        } catch (error) {
        }
        return false;
      }
      var UNICODE_SUPPORT = detectUnicodeSupport();
      function chars(regexp) {
        if (regexp.source[0] !== "[") {
          throw new Error(regexp + " can not be used with chars");
        }
        return regexp.source.slice(1, regexp.source.lastIndexOf("]"));
      }
      function chars_without(regexp, search) {
        if (regexp.source[0] !== "[") {
          throw new Error("/" + regexp.source + "/ can not be used with chars_without");
        }
        if (!search || typeof search !== "string") {
          throw new Error(JSON.stringify(search) + " is not a valid search");
        }
        if (regexp.source.indexOf(search) === -1) {
          throw new Error('"' + search + '" is not is /' + regexp.source + "/");
        }
        if (search === "-" && regexp.source.indexOf(search) !== 1) {
          throw new Error('"' + search + '" is not at the first postion of /' + regexp.source + "/");
        }
        return new RegExp(regexp.source.replace(search, ""), UNICODE_SUPPORT ? "u" : "");
      }
      function reg(args) {
        var self2 = this;
        return new RegExp(
          Array.prototype.slice.call(arguments).map(function(part) {
            var isStr = typeof part === "string";
            if (isStr && self2 === void 0 && part === "|") {
              throw new Error("use regg instead of reg to wrap expressions with `|`!");
            }
            return isStr ? part : part.source;
          }).join(""),
          UNICODE_SUPPORT ? "u" : ""
        );
      }
      function regg(args) {
        if (arguments.length === 0) {
          throw new Error("no parameters provided");
        }
        return reg.apply(regg, ["(?:"].concat(Array.prototype.slice.call(arguments), [")"]));
      }
      var UNICODE_REPLACEMENT_CHARACTER = "\uFFFD";
      var Char = /[-\x09\x0A\x0D\x20-\x2C\x2E-\uD7FF\uE000-\uFFFD]/;
      if (UNICODE_SUPPORT) {
        Char = reg("[", chars(Char), "\\u{10000}-\\u{10FFFF}", "]");
      }
      var InvalidChar = new RegExp("[^" + chars(Char) + "]", UNICODE_SUPPORT ? "u" : "");
      var _SChar = /[\x20\x09\x0D\x0A]/;
      var SChar_s = chars(_SChar);
      var S = reg(_SChar, "+");
      var S_OPT = reg(_SChar, "*");
      var NameStartChar = /[:_a-zA-Z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
      if (UNICODE_SUPPORT) {
        NameStartChar = reg("[", chars(NameStartChar), "\\u{10000}-\\u{10FFFF}", "]");
      }
      var NameStartChar_s = chars(NameStartChar);
      var NameChar = reg("[", NameStartChar_s, chars(/[-.0-9\xB7]/), chars(/[\u0300-\u036F\u203F-\u2040]/), "]");
      var Name = reg(NameStartChar, NameChar, "*");
      var Name_exact = reg("^", Name, "$");
      var Nmtoken = reg(NameChar, "+");
      var EntityRef = reg("&", Name, ";");
      var CharRef = regg(/&#[0-9]+;|&#x[0-9a-fA-F]+;/);
      var Reference = regg(EntityRef, "|", CharRef);
      var PEReference = reg("%", Name, ";");
      var EntityValue = regg(
        reg('"', regg(/[^%&"]/, "|", PEReference, "|", Reference), "*", '"'),
        "|",
        reg("'", regg(/[^%&']/, "|", PEReference, "|", Reference), "*", "'")
      );
      var AttValue = regg('"', regg(/[^<&"]/, "|", Reference), "*", '"', "|", "'", regg(/[^<&']/, "|", Reference), "*", "'");
      var NCNameStartChar = chars_without(NameStartChar, ":");
      var NCNameChar = chars_without(NameChar, ":");
      var NCName = reg(NCNameStartChar, NCNameChar, "*");
      var NCName_exact = reg("^", NCName, "$");
      var QName = reg(NCName, regg(":", NCName), "?");
      var QName_exact = reg("^", QName, "$");
      var QName_group = reg("(", QName, ")");
      var SystemLiteral = regg(/"[^"]*"|'[^']*'/);
      var PI = reg(/^<\?/, "(", Name, ")", regg(S, "(?!", _SChar, ")(", Char, "*?)"), "?", /\?>/);
      var PubidChar = /[\x20\x0D\x0Aa-zA-Z0-9-'()+,./:=?;!*#@$_%]/;
      var PubidLiteral = regg('"', PubidChar, '*"', "|", "'", chars_without(PubidChar, "'"), "*'");
      var COMMENT_START = "<!--";
      var COMMENT_END = "-->";
      var Comment = reg(COMMENT_START, regg(chars_without(Char, "-"), "|", reg("-", chars_without(Char, "-"))), "*", COMMENT_END);
      var PCDATA = "#PCDATA";
      var Mixed = regg(
        reg(/\(/, S_OPT, PCDATA, regg(S_OPT, /\|/, S_OPT, QName), "*", S_OPT, /\)\*/),
        "|",
        reg(/\(/, S_OPT, PCDATA, S_OPT, /\)/)
      );
      var _children_quantity = /[?*+]?/;
      var children = reg(
        /\([^>]+\)/,
        _children_quantity
        /*regg(choice, '|', seq), _children_quantity*/
      );
      var contentspec = regg("EMPTY", "|", "ANY", "|", Mixed, "|", children);
      var ELEMENTDECL_START = "<!ELEMENT";
      var elementdecl = reg(ELEMENTDECL_START, S, regg(QName, "|", PEReference), S, regg(contentspec, "|", PEReference), S_OPT, ">");
      var NotationType = reg("NOTATION", S, /\(/, S_OPT, Name, regg(S_OPT, /\|/, S_OPT, Name), "*", S_OPT, /\)/);
      var Enumeration = reg(/\(/, S_OPT, Nmtoken, regg(S_OPT, /\|/, S_OPT, Nmtoken), "*", S_OPT, /\)/);
      var EnumeratedType = regg(NotationType, "|", Enumeration);
      var AttType = regg(/CDATA|ID|IDREF|IDREFS|ENTITY|ENTITIES|NMTOKEN|NMTOKENS/, "|", EnumeratedType);
      var DefaultDecl = regg(/#REQUIRED|#IMPLIED/, "|", regg(regg("#FIXED", S), "?", AttValue));
      var AttDef = regg(S, Name, S, AttType, S, DefaultDecl);
      var ATTLIST_DECL_START = "<!ATTLIST";
      var AttlistDecl = reg(ATTLIST_DECL_START, S, Name, AttDef, "*", S_OPT, ">");
      var ABOUT_LEGACY_COMPAT = "about:legacy-compat";
      var ABOUT_LEGACY_COMPAT_SystemLiteral = regg('"' + ABOUT_LEGACY_COMPAT + '"', "|", "'" + ABOUT_LEGACY_COMPAT + "'");
      var SYSTEM = "SYSTEM";
      var PUBLIC = "PUBLIC";
      var ExternalID = regg(regg(SYSTEM, S, SystemLiteral), "|", regg(PUBLIC, S, PubidLiteral, S, SystemLiteral));
      var ExternalID_match = reg(
        "^",
        regg(
          regg(SYSTEM, S, "(?<SystemLiteralOnly>", SystemLiteral, ")"),
          "|",
          regg(PUBLIC, S, "(?<PubidLiteral>", PubidLiteral, ")", S, "(?<SystemLiteral>", SystemLiteral, ")")
        )
      );
      var PubidLiteral_match = reg("^", PubidLiteral, "$");
      var SystemLiteral_match = reg("^", SystemLiteral, "$");
      var NDataDecl = regg(S, "NDATA", S, Name);
      var EntityDef = regg(EntityValue, "|", regg(ExternalID, NDataDecl, "?"));
      var ENTITY_DECL_START = "<!ENTITY";
      var GEDecl = reg(ENTITY_DECL_START, S, Name, S, EntityDef, S_OPT, ">");
      var PEDef = regg(EntityValue, "|", ExternalID);
      var PEDecl = reg(ENTITY_DECL_START, S, "%", S, Name, S, PEDef, S_OPT, ">");
      var EntityDecl = regg(GEDecl, "|", PEDecl);
      var PublicID = reg(PUBLIC, S, PubidLiteral);
      var NotationDecl = reg("<!NOTATION", S, Name, S, regg(ExternalID, "|", PublicID), S_OPT, ">");
      var Eq = reg(S_OPT, "=", S_OPT);
      var VersionNum = /1[.]\d+/;
      var VersionInfo = reg(S, "version", Eq, regg("'", VersionNum, "'", "|", '"', VersionNum, '"'));
      var EncName = /[A-Za-z][-A-Za-z0-9._]*/;
      var EncodingDecl = regg(S, "encoding", Eq, regg('"', EncName, '"', "|", "'", EncName, "'"));
      var SDDecl = regg(S, "standalone", Eq, regg("'", regg("yes", "|", "no"), "'", "|", '"', regg("yes", "|", "no"), '"'));
      var XMLDecl = reg(/^<\?xml/, VersionInfo, EncodingDecl, "?", SDDecl, "?", S_OPT, /\?>/);
      var DOCTYPE_DECL_START = "<!DOCTYPE";
      var CDATA_START = "<![CDATA[";
      var CDATA_END = "]]>";
      var CDStart = /<!\[CDATA\[/;
      var CDEnd = /\]\]>/;
      var CData = reg(Char, "*?", CDEnd);
      var CDSect = reg(CDStart, CData);
      exports.chars = chars;
      exports.chars_without = chars_without;
      exports.detectUnicodeSupport = detectUnicodeSupport;
      exports.reg = reg;
      exports.regg = regg;
      exports.ABOUT_LEGACY_COMPAT = ABOUT_LEGACY_COMPAT;
      exports.ABOUT_LEGACY_COMPAT_SystemLiteral = ABOUT_LEGACY_COMPAT_SystemLiteral;
      exports.AttlistDecl = AttlistDecl;
      exports.CDATA_START = CDATA_START;
      exports.CDATA_END = CDATA_END;
      exports.CDSect = CDSect;
      exports.Char = Char;
      exports.Comment = Comment;
      exports.COMMENT_START = COMMENT_START;
      exports.COMMENT_END = COMMENT_END;
      exports.DOCTYPE_DECL_START = DOCTYPE_DECL_START;
      exports.elementdecl = elementdecl;
      exports.EntityDecl = EntityDecl;
      exports.EntityValue = EntityValue;
      exports.ExternalID = ExternalID;
      exports.ExternalID_match = ExternalID_match;
      exports.Name = Name;
      exports.Name_exact = Name_exact;
      exports.NCName_exact = NCName_exact;
      exports.NotationDecl = NotationDecl;
      exports.Reference = Reference;
      exports.PEReference = PEReference;
      exports.PI = PI;
      exports.PUBLIC = PUBLIC;
      exports.PubidLiteral = PubidLiteral;
      exports.PubidLiteral_match = PubidLiteral_match;
      exports.QName = QName;
      exports.QName_exact = QName_exact;
      exports.QName_group = QName_group;
      exports.S = S;
      exports.SChar_s = SChar_s;
      exports.S_OPT = S_OPT;
      exports.SYSTEM = SYSTEM;
      exports.SystemLiteral = SystemLiteral;
      exports.SystemLiteral_match = SystemLiteral_match;
      exports.InvalidChar = InvalidChar;
      exports.UNICODE_REPLACEMENT_CHARACTER = UNICODE_REPLACEMENT_CHARACTER;
      exports.UNICODE_SUPPORT = UNICODE_SUPPORT;
      exports.XMLDecl = XMLDecl;
    }
  });

  // node_modules/@xmldom/xmldom/lib/dom.js
  var require_dom = __commonJS({
    "node_modules/@xmldom/xmldom/lib/dom.js"(exports) {
      "use strict";
      var conventions = require_conventions();
      var find = conventions.find;
      var hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
      var hasOwn = conventions.hasOwn;
      var isHTMLMimeType = conventions.isHTMLMimeType;
      var isHTMLRawTextElement = conventions.isHTMLRawTextElement;
      var isHTMLVoidElement = conventions.isHTMLVoidElement;
      var MIME_TYPE = conventions.MIME_TYPE;
      var NAMESPACE = conventions.NAMESPACE;
      var PDC = Symbol();
      var errors = require_errors();
      var DOMException = errors.DOMException;
      var DOMExceptionName = errors.DOMExceptionName;
      var g = require_grammar();
      function checkSymbol(symbol) {
        if (symbol !== PDC) {
          throw new TypeError("Illegal constructor");
        }
      }
      function notEmptyString(input) {
        return input !== "";
      }
      function splitOnASCIIWhitespace(input) {
        return input ? input.split(/[\t\n\f\r ]+/).filter(notEmptyString) : [];
      }
      function orderedSetReducer(current, element) {
        if (!hasOwn(current, element)) {
          current[element] = true;
        }
        return current;
      }
      function toOrderedSet(input) {
        if (!input) return [];
        var list = splitOnASCIIWhitespace(input);
        return Object.keys(list.reduce(orderedSetReducer, {}));
      }
      function arrayIncludes(list) {
        return function(element) {
          return list && list.indexOf(element) !== -1;
        };
      }
      function validateQualifiedName(qualifiedName) {
        if (!g.QName_exact.test(qualifiedName)) {
          throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'invalid character in qualified name "' + qualifiedName + '"');
        }
      }
      function validateAndExtract(namespace, qualifiedName) {
        validateQualifiedName(qualifiedName);
        namespace = namespace || null;
        var prefix = null;
        var localName = qualifiedName;
        if (qualifiedName.indexOf(":") >= 0) {
          var splitResult = qualifiedName.split(":");
          prefix = splitResult[0];
          localName = splitResult[1];
        }
        if (prefix !== null && namespace === null) {
          throw new DOMException(DOMException.NAMESPACE_ERR, "prefix is non-null and namespace is null");
        }
        if (prefix === "xml" && namespace !== conventions.NAMESPACE.XML) {
          throw new DOMException(DOMException.NAMESPACE_ERR, 'prefix is "xml" and namespace is not the XML namespace');
        }
        if ((prefix === "xmlns" || qualifiedName === "xmlns") && namespace !== conventions.NAMESPACE.XMLNS) {
          throw new DOMException(
            DOMException.NAMESPACE_ERR,
            'either qualifiedName or prefix is "xmlns" and namespace is not the XMLNS namespace'
          );
        }
        if (namespace === conventions.NAMESPACE.XMLNS && prefix !== "xmlns" && qualifiedName !== "xmlns") {
          throw new DOMException(
            DOMException.NAMESPACE_ERR,
            'namespace is the XMLNS namespace and neither qualifiedName nor prefix is "xmlns"'
          );
        }
        return [namespace, prefix, localName];
      }
      function copy(src, dest) {
        for (var p in src) {
          if (hasOwn(src, p)) {
            dest[p] = src[p];
          }
        }
      }
      function _extends(Class, Super) {
        var pt = Class.prototype;
        if (!(pt instanceof Super)) {
          let t = function() {
          };
          t.prototype = Super.prototype;
          t = new t();
          copy(pt, t);
          Class.prototype = pt = t;
        }
        if (pt.constructor != Class) {
          if (typeof Class != "function") {
            console.error("unknown Class:" + Class);
          }
          pt.constructor = Class;
        }
      }
      var NodeType = {};
      var ELEMENT_NODE = NodeType.ELEMENT_NODE = 1;
      var ATTRIBUTE_NODE = NodeType.ATTRIBUTE_NODE = 2;
      var TEXT_NODE = NodeType.TEXT_NODE = 3;
      var CDATA_SECTION_NODE = NodeType.CDATA_SECTION_NODE = 4;
      var ENTITY_REFERENCE_NODE = NodeType.ENTITY_REFERENCE_NODE = 5;
      var ENTITY_NODE = NodeType.ENTITY_NODE = 6;
      var PROCESSING_INSTRUCTION_NODE = NodeType.PROCESSING_INSTRUCTION_NODE = 7;
      var COMMENT_NODE = NodeType.COMMENT_NODE = 8;
      var DOCUMENT_NODE = NodeType.DOCUMENT_NODE = 9;
      var DOCUMENT_TYPE_NODE = NodeType.DOCUMENT_TYPE_NODE = 10;
      var DOCUMENT_FRAGMENT_NODE = NodeType.DOCUMENT_FRAGMENT_NODE = 11;
      var NOTATION_NODE = NodeType.NOTATION_NODE = 12;
      var DocumentPosition = conventions.freeze({
        DOCUMENT_POSITION_DISCONNECTED: 1,
        DOCUMENT_POSITION_PRECEDING: 2,
        DOCUMENT_POSITION_FOLLOWING: 4,
        DOCUMENT_POSITION_CONTAINS: 8,
        DOCUMENT_POSITION_CONTAINED_BY: 16,
        DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32
      });
      function commonAncestor(a, b) {
        if (b.length < a.length) return commonAncestor(b, a);
        var c = null;
        for (var n in a) {
          if (a[n] !== b[n]) return c;
          c = a[n];
        }
        return c;
      }
      function docGUID(doc) {
        if (!doc.guid) doc.guid = Math.random();
        return doc.guid;
      }
      function NodeList() {
      }
      NodeList.prototype = {
        /**
         * The number of nodes in the list. The range of valid child node indices is 0 to length-1
         * inclusive.
         *
         * @type {number}
         */
        length: 0,
        /**
         * Returns the item at `index`. If index is greater than or equal to the number of nodes in
         * the list, this returns null.
         *
         * @param index
         * Unsigned long Index into the collection.
         * @returns {Node | null}
         * The node at position `index` in the NodeList,
         * or null if that is not a valid index.
         */
        item: function(index) {
          return index >= 0 && index < this.length ? this[index] : null;
        },
        /**
         * Returns a string representation of the NodeList.
         *
         * Accepts the same `options` object as `XMLSerializer.prototype.serializeToString`
         * (`requireWellFormed`, `splitCDATASections`, `nodeFilter`). Passing a function is treated as
         * a legacy `nodeFilter` for backward compatibility.
         *
         * @param {Object | function} [options]
         * @param {boolean} [options.requireWellFormed=false]
         * @param {boolean} [options.splitCDATASections=true]
         * @param {function} [options.nodeFilter]
         * @returns {string}
         */
        toString: function(options) {
          var opts;
          if (typeof options === "function") {
            opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: options };
          } else if (!!options) {
            opts = {
              requireWellFormed: !!options.requireWellFormed,
              splitCDATASections: options.splitCDATASections !== false,
              nodeFilter: options.nodeFilter || null
            };
          } else {
            opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: null };
          }
          for (var buf = [], i = 0; i < this.length; i++) {
            serializeToString(this[i], buf, null, opts);
          }
          return buf.join("");
        },
        /**
         * Filters the NodeList based on a predicate.
         *
         * @param {function(Node): boolean} predicate
         * - A predicate function to filter the NodeList.
         * @returns {Node[]}
         * An array of nodes that satisfy the predicate.
         * @private
         */
        filter: function(predicate) {
          return Array.prototype.filter.call(this, predicate);
        },
        /**
         * Returns the first index at which a given node can be found in the NodeList, or -1 if it is
         * not present.
         *
         * @param {Node} item
         * - The Node item to locate in the NodeList.
         * @returns {number}
         * The first index of the node in the NodeList; -1 if not found.
         * @private
         */
        indexOf: function(item) {
          return Array.prototype.indexOf.call(this, item);
        }
      };
      NodeList.prototype[Symbol.iterator] = function() {
        var me = this;
        var index = 0;
        return {
          next: function() {
            if (index < me.length) {
              return {
                value: me[index++],
                done: false
              };
            } else {
              return {
                done: true
              };
            }
          },
          return: function() {
            return {
              done: true
            };
          }
        };
      };
      function LiveNodeList(node, refresh) {
        this._node = node;
        this._refresh = refresh;
        _updateLiveList(this);
      }
      function _updateLiveList(list) {
        var inc = list._node._inc || list._node.ownerDocument._inc;
        if (list._inc !== inc) {
          var ls = list._refresh(list._node);
          __set__(list, "length", ls.length);
          if (!list.$$length || ls.length < list.$$length) {
            for (var i = ls.length; i in list; i++) {
              if (hasOwn(list, i)) {
                delete list[i];
              }
            }
          }
          copy(ls, list);
          list._inc = inc;
        }
      }
      LiveNodeList.prototype.item = function(i) {
        _updateLiveList(this);
        return this[i] || null;
      };
      _extends(LiveNodeList, NodeList);
      function NamedNodeMap() {
        this._nsIndex = /* @__PURE__ */ Object.create(null);
        this._noNsIndex = /* @__PURE__ */ Object.create(null);
      }
      function _findNodeIndex(list, node) {
        var i = 0;
        while (i < list.length) {
          if (list[i] === node) {
            return i;
          }
          i++;
        }
      }
      function _nnmBucket(map, namespaceURI, create) {
        if (!namespaceURI) {
          return map._noNsIndex;
        }
        var bucket = map._nsIndex[namespaceURI];
        if (!bucket && create) {
          bucket = map._nsIndex[namespaceURI] = /* @__PURE__ */ Object.create(null);
        }
        return bucket;
      }
      function _nnmIndexFind(map, namespaceURI, localName) {
        var bucket = _nnmBucket(map, namespaceURI, false);
        var found = bucket && bucket[localName];
        return found ? found : null;
      }
      function _nnmIndexAdd(map, attr) {
        _nnmBucket(map, attr.namespaceURI, true)[attr.localName] = attr;
      }
      function _nnmIndexRemove(map, attr) {
        var bucket = _nnmBucket(map, attr.namespaceURI, false);
        if (bucket) {
          delete bucket[attr.localName];
        }
      }
      function _addNamedNode(el, list, newAttr, oldAttr) {
        if (oldAttr) {
          list[_findNodeIndex(list, oldAttr)] = newAttr;
        } else {
          list[list.length] = newAttr;
          list.length++;
        }
        _nnmIndexAdd(list, newAttr);
        if (el) {
          newAttr.ownerElement = el;
          var doc = el.ownerDocument;
          if (doc) {
            oldAttr && _onRemoveAttribute(doc, el, oldAttr);
            _onAddAttribute(doc, el, newAttr);
          }
        }
      }
      function _removeNamedNode(el, list, attr) {
        var i = _findNodeIndex(list, attr);
        if (i >= 0) {
          var lastIndex = list.length - 1;
          while (i <= lastIndex) {
            list[i] = list[++i];
          }
          list.length = lastIndex;
          _nnmIndexRemove(list, attr);
          if (el) {
            var doc = el.ownerDocument;
            if (doc) {
              _onRemoveAttribute(doc, el, attr);
            }
            attr.ownerElement = null;
          }
        }
      }
      NamedNodeMap.prototype = {
        length: 0,
        item: NodeList.prototype.item,
        /**
         * Get an attribute by name. Note: Name is in lower case in case of HTML namespace and
         * document.
         *
         * @param {string} localName
         * The local name of the attribute.
         * @returns {Attr | null}
         * The attribute with the given local name, or null if no such attribute exists.
         * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name
         */
        getNamedItem: function(localName) {
          if (this._ownerElement && this._ownerElement._isInHTMLDocumentAndNamespace()) {
            localName = localName.toLowerCase();
          }
          var i = 0;
          while (i < this.length) {
            var attr = this[i];
            if (attr.nodeName === localName) {
              return attr;
            }
            i++;
          }
          return null;
        },
        /**
         * Set an attribute.
         *
         * @param {Attr} attr
         * The attribute to set.
         * @returns {Attr | null}
         * The old attribute with the same local name and namespace URI as the new one, or null if no
         * such attribute exists.
         * @throws {DOMException}
         * With code:
         * - {@link INUSE_ATTRIBUTE_ERR} - If the attribute is already an attribute of another
         * element.
         * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
         */
        setNamedItem: function(attr) {
          var el = attr.ownerElement;
          if (el && el !== this._ownerElement) {
            throw new DOMException(DOMException.INUSE_ATTRIBUTE_ERR);
          }
          var oldAttr = _nnmIndexFind(this, attr.namespaceURI, attr.localName);
          if (oldAttr === attr) {
            return attr;
          }
          _addNamedNode(this._ownerElement, this, attr, oldAttr);
          return oldAttr;
        },
        /**
         * Set an attribute, replacing an existing attribute with the same local name and namespace
         * URI if one exists.
         *
         * @param {Attr} attr
         * The attribute to set.
         * @returns {Attr | null}
         * The old attribute with the same local name and namespace URI as the new one, or null if no
         * such attribute exists.
         * @throws {DOMException}
         * Throws a DOMException with the name "InUseAttributeError" if the attribute is already an
         * attribute of another element.
         * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
         */
        setNamedItemNS: function(attr) {
          return this.setNamedItem(attr);
        },
        /**
         * Removes an attribute specified by the local name.
         *
         * @param {string} localName
         * The local name of the attribute to be removed.
         * @returns {Attr}
         * The attribute node that was removed.
         * @throws {DOMException}
         * With code:
         * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given name is found.
         * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditem
         * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-name
         */
        removeNamedItem: function(localName) {
          var attr = this.getNamedItem(localName);
          if (!attr) {
            throw new DOMException(DOMException.NOT_FOUND_ERR, localName);
          }
          _removeNamedNode(this._ownerElement, this, attr);
          return attr;
        },
        /**
         * Removes an attribute specified by the namespace and local name.
         *
         * @param {string | null} namespaceURI
         * The namespace URI of the attribute to be removed.
         * @param {string} localName
         * The local name of the attribute to be removed.
         * @returns {Attr}
         * The attribute node that was removed.
         * @throws {DOMException}
         * With code:
         * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given namespace URI and local
         * name is found.
         * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditemns
         * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-namespace
         */
        removeNamedItemNS: function(namespaceURI, localName) {
          var attr = this.getNamedItemNS(namespaceURI, localName);
          if (!attr) {
            throw new DOMException(DOMException.NOT_FOUND_ERR, namespaceURI ? namespaceURI + " : " + localName : localName);
          }
          _removeNamedNode(this._ownerElement, this, attr);
          return attr;
        },
        /**
         * Get an attribute by namespace and local name.
         *
         * @param {string | null} namespaceURI
         * The namespace URI of the attribute.
         * @param {string} localName
         * The local name of the attribute.
         * @returns {Attr | null}
         * The attribute with the given namespace URI and local name, or null if no such attribute
         * exists.
         * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-namespace
         */
        getNamedItemNS: function(namespaceURI, localName) {
          if (!namespaceURI) {
            namespaceURI = null;
          }
          var i = 0;
          while (i < this.length) {
            var node = this[i];
            if (node.localName === localName && node.namespaceURI === namespaceURI) {
              return node;
            }
            i++;
          }
          return null;
        }
      };
      NamedNodeMap.prototype[Symbol.iterator] = function() {
        var me = this;
        var index = 0;
        return {
          next: function() {
            if (index < me.length) {
              return {
                value: me[index++],
                done: false
              };
            } else {
              return {
                done: true
              };
            }
          },
          return: function() {
            return {
              done: true
            };
          }
        };
      };
      function DOMImplementation() {
      }
      DOMImplementation.prototype = {
        /**
         * Test if the DOM implementation implements a specific feature and version, as specified in
         * {@link https://www.w3.org/TR/DOM-Level-3-Core/core.html#DOMFeatures DOM Features}.
         *
         * The DOMImplementation.hasFeature() method returns a Boolean flag indicating if a given
         * feature is supported. The different implementations fairly diverged in what kind of
         * features were reported. The latest version of the spec settled to force this method to
         * always return true, where the functionality was accurate and in use.
         *
         * @deprecated
         * It is deprecated and modern browsers return true in all cases.
         * @function DOMImplementation#hasFeature
         * @param {string} feature
         * The name of the feature to test.
         * @param {string} [version]
         * This is the version number of the feature to test.
         * @returns {boolean}
         * Always returns true.
         * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/hasFeature MDN
         * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-5CED94D7 DOM Level 1 Core
         * @see https://dom.spec.whatwg.org/#dom-domimplementation-hasfeature DOM Living Standard
         * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-5CED94D7 DOM Level 3 Core
         */
        hasFeature: function(feature, version) {
          return true;
        },
        /**
         * Creates a DOM Document object of the specified type with its document element. Note that
         * based on the {@link DocumentType}
         * given to create the document, the implementation may instantiate specialized
         * {@link Document} objects that support additional features than the "Core", such as "HTML"
         * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML}.
         * On the other hand, setting the {@link DocumentType} after the document was created makes
         * this very unlikely to happen. Alternatively, specialized {@link Document} creation methods,
         * such as createHTMLDocument
         * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML},
         * can be used to obtain specific types of {@link Document} objects.
         *
         * __It behaves slightly different from the description in the living standard__:
         * - There is no interface/class `XMLDocument`, it returns a `Document`
         * instance (with it's `type` set to `'xml'`).
         * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
         *
         * @function DOMImplementation.createDocument
         * @param {string | null} namespaceURI
         * The
         * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-namespaceURI namespace URI}
         * of the document element to create or null.
         * @param {string | null} qualifiedName
         * The
         * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified name}
         * of the document element to be created or null.
         * @param {DocumentType | null} [doctype=null]
         * The type of document to be created or null. When doctype is not null, its
         * {@link Node#ownerDocument} attribute is set to the document being created. Default is
         * `null`
         * @returns {Document}
         * A new {@link Document} object with its document element. If the NamespaceURI,
         * qualifiedName, and doctype are null, the returned {@link Document} is empty with no
         * document element.
         * @throws {DOMException}
         * With code:
         *
         * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
         * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
         * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed, if the qualifiedName has a
         * prefix and the namespaceURI is null, or if the qualifiedName is null and the namespaceURI
         * is different from null, or if the qualifiedName has a prefix that is "xml" and the
         * namespaceURI is different from "{@link http://www.w3.org/XML/1998/namespace}"
         * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#Namespaces XML Namespaces},
         * or if the DOM implementation does not support the "XML" feature but a non-null namespace
         * URI was provided, since namespaces were defined by XML.
         * - `WRONG_DOCUMENT_ERR`: Raised if doctype has already been used with a different document
         * or was created from a different implementation.
         * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
         * "XML" and the language exposed through the Document does not support XML Namespaces (such
         * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
         * @since DOM Level 2.
         * @see {@link #createHTMLDocument}
         * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocument MDN
         * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument DOM Living Standard
         * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-2-Core-DOM-createDocument DOM
         *      Level 3 Core
         * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocument DOM
         *      Level 2 Core (initial)
         */
        createDocument: function(namespaceURI, qualifiedName, doctype) {
          var contentType = MIME_TYPE.XML_APPLICATION;
          if (namespaceURI === NAMESPACE.HTML) {
            contentType = MIME_TYPE.XML_XHTML_APPLICATION;
          } else if (namespaceURI === NAMESPACE.SVG) {
            contentType = MIME_TYPE.XML_SVG_IMAGE;
          }
          var doc = new Document(PDC, { contentType });
          doc.implementation = this;
          doc.childNodes = new NodeList();
          doc.doctype = doctype || null;
          if (doctype) {
            doc.appendChild(doctype);
          }
          if (qualifiedName) {
            var root = doc.createElementNS(namespaceURI, qualifiedName);
            doc.appendChild(root);
          }
          return doc;
        },
        /**
         * Creates an empty DocumentType node. Entity declarations and notations are not made
         * available. Entity reference expansions and default attribute additions do not occur.
         *
         * **This behavior is slightly different from the one in the specs**:
         * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
         * - `publicId` and `systemId` contain the raw data including any possible quotes,
         *   so they can always be serialized back to the original value
         * - `internalSubset` contains the raw string between `[` and `]` if present,
         *   but is not parsed or validated in any form.
         *
         * @function DOMImplementation#createDocumentType
         * @param {string} qualifiedName
         * The {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified
         * name} of the document type to be created.
         * @param {string} [publicId]
         * The external subset public identifier. Stored verbatim including surrounding quotes.
         * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
         * if the value is non-empty and does not match the XML `PubidLiteral` production
         * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [12]). Creation-time validation is not
         * enforced — deferred to a future breaking release.
         * @param {string} [systemId]
         * The external subset system identifier. Stored verbatim including surrounding quotes.
         * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
         * if the value is non-empty and does not match the XML `SystemLiteral` production
         * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [11]). Creation-time validation is not
         * enforced — deferred to a future breaking release.
         * @param {string} [internalSubset]
         * The internal subset or an empty string if it is not present. Stored verbatim.
         * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
         * if the value contains `"]>"`. Creation-time validation is not enforced.
         * @returns {DocumentType}
         * A new {@link DocumentType} node with {@link Node#ownerDocument} set to null.
         * @throws {DOMException}
         * With code:
         *
         * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
         * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
         * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed.
         * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
         * "XML" and the language exposed through the Document does not support XML Namespaces (such
         * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
         * @since DOM Level 2.
         * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocumentType
         *      MDN
         * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype DOM Living
         *      Standard
         * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-3-Core-DOM-createDocType DOM
         *      Level 3 Core
         * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocType DOM
         *      Level 2 Core
         * @see https://github.com/xmldom/xmldom/blob/master/CHANGELOG.md#050
         * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-Core-DocType-internalSubset
         * @prettierignore
         */
        createDocumentType: function(qualifiedName, publicId, systemId, internalSubset) {
          validateQualifiedName(qualifiedName);
          var node = new DocumentType(PDC);
          node.name = qualifiedName;
          node.nodeName = qualifiedName;
          node.publicId = publicId || "";
          node.systemId = systemId || "";
          node.internalSubset = internalSubset || "";
          node.childNodes = new NodeList();
          return node;
        },
        /**
         * Returns an HTML document, that might already have a basic DOM structure.
         *
         * __It behaves slightly different from the description in the living standard__:
         * - If the first argument is `false` no initial nodes are added (steps 3-7 in the specs are
         * omitted)
         * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
         *
         * @param {string | false} [title]
         * A string containing the title to give the new HTML document.
         * @returns {Document}
         * The HTML document.
         * @since WHATWG Living Standard.
         * @see {@link #createDocument}
         * @see https://dom.spec.whatwg.org/#dom-domimplementation-createhtmldocument
         * @see https://dom.spec.whatwg.org/#html-document
         */
        createHTMLDocument: function(title) {
          var doc = new Document(PDC, { contentType: MIME_TYPE.HTML });
          doc.implementation = this;
          doc.childNodes = new NodeList();
          if (title !== false) {
            doc.doctype = this.createDocumentType("html");
            doc.doctype.ownerDocument = doc;
            doc.appendChild(doc.doctype);
            var htmlNode = doc.createElement("html");
            doc.appendChild(htmlNode);
            var headNode = doc.createElement("head");
            htmlNode.appendChild(headNode);
            if (typeof title === "string") {
              var titleNode = doc.createElement("title");
              titleNode.appendChild(doc.createTextNode(title));
              headNode.appendChild(titleNode);
            }
            htmlNode.appendChild(doc.createElement("body"));
          }
          return doc;
        }
      };
      function Node(symbol) {
        checkSymbol(symbol);
      }
      Node.prototype = {
        /**
         * The first child of this node.
         *
         * @type {Node | null}
         */
        firstChild: null,
        /**
         * The last child of this node.
         *
         * @type {Node | null}
         */
        lastChild: null,
        /**
         * The previous sibling of this node.
         *
         * @type {Node | null}
         */
        previousSibling: null,
        /**
         * The next sibling of this node.
         *
         * @type {Node | null}
         */
        nextSibling: null,
        /**
         * The parent node of this node.
         *
         * @type {Node | null}
         */
        parentNode: null,
        /**
         * The parent element of this node.
         *
         * @type {Element | null}
         */
        get parentElement() {
          return this.parentNode && this.parentNode.nodeType === this.ELEMENT_NODE ? this.parentNode : null;
        },
        /**
         * The child nodes of this node.
         *
         * @type {NodeList}
         */
        childNodes: null,
        /**
         * The document object associated with this node.
         *
         * @type {Document | null}
         */
        ownerDocument: null,
        /**
         * The value of this node.
         *
         * @type {string | null}
         */
        nodeValue: null,
        /**
         * The namespace URI of this node.
         *
         * @type {string | null}
         */
        namespaceURI: null,
        /**
         * The prefix of the namespace for this node.
         *
         * @type {string | null}
         */
        prefix: null,
        /**
         * The local part of the qualified name of this node.
         *
         * @type {string | null}
         */
        localName: null,
        /**
         * The baseURI is currently always `about:blank`,
         * since that's what happens when you create a document from scratch.
         *
         * @type {'about:blank'}
         */
        baseURI: "about:blank",
        /**
         * Is true if this node is part of a document.
         *
         * @type {boolean}
         */
        get isConnected() {
          var rootNode = this.getRootNode();
          return rootNode && rootNode.nodeType === rootNode.DOCUMENT_NODE;
        },
        /**
         * Checks whether `other` is an inclusive descendant of this node.
         *
         * @param {Node | null | undefined} other
         * The node to check.
         * @returns {boolean}
         * True if `other` is an inclusive descendant of this node; false otherwise.
         * @see https://dom.spec.whatwg.org/#dom-node-contains
         */
        contains: function(other) {
          if (!other) return false;
          var parent = other;
          do {
            if (this === parent) return true;
            parent = parent.parentNode;
          } while (parent);
          return false;
        },
        /**
         * @typedef GetRootNodeOptions
         * @property {boolean} [composed=false]
         */
        /**
         * Searches for the root node of this node.
         *
         * **This behavior is slightly different from the in the specs**:
         * - ignores `options.composed`, since `ShadowRoot`s are unsupported, always returns root.
         *
         * @param {GetRootNodeOptions} [options]
         * @returns {Node}
         * Root node.
         * @see https://dom.spec.whatwg.org/#dom-node-getrootnode
         * @see https://dom.spec.whatwg.org/#concept-shadow-including-root
         */
        getRootNode: function(options) {
          var parent = this;
          do {
            if (!parent.parentNode) {
              return parent;
            }
            parent = parent.parentNode;
          } while (parent);
        },
        /**
         * Checks whether the given node is equal to this node.
         *
         * Two nodes are equal when they have the same type, defining characteristics (for the type),
         * and the same childNodes. The comparison is iterative to avoid stack overflows on
         * deeply-nested trees. Attribute nodes of each Element pair are also pushed onto the stack
         * and compared the same way.
         *
         * @param {Node} [otherNode]
         * @returns {boolean}
         * @see https://dom.spec.whatwg.org/#concept-node-equals
         * @see ../docs/walk-dom.md.
         */
        isEqualNode: function(otherNode) {
          if (!otherNode) return false;
          var stack = [{ node: this, other: otherNode }];
          while (stack.length > 0) {
            var pair = stack.pop();
            var node = pair.node;
            var other = pair.other;
            if (node.nodeType !== other.nodeType) return false;
            switch (node.nodeType) {
              case node.DOCUMENT_TYPE_NODE:
                if (node.name !== other.name) return false;
                if (node.publicId !== other.publicId) return false;
                if (node.systemId !== other.systemId) return false;
                break;
              case node.ELEMENT_NODE:
                if (node.namespaceURI !== other.namespaceURI) return false;
                if (node.prefix !== other.prefix) return false;
                if (node.localName !== other.localName) return false;
                if (node.attributes.length !== other.attributes.length) return false;
                for (var i = 0; i < node.attributes.length; i++) {
                  var attr = node.attributes.item(i);
                  var otherAttr = other.getAttributeNodeNS(attr.namespaceURI, attr.localName);
                  if (!otherAttr) return false;
                  stack.push({ node: attr, other: otherAttr });
                }
                break;
              case node.ATTRIBUTE_NODE:
                if (node.namespaceURI !== other.namespaceURI) return false;
                if (node.localName !== other.localName) return false;
                if (node.value !== other.value) return false;
                break;
              case node.PROCESSING_INSTRUCTION_NODE:
                if (node.target !== other.target || node.data !== other.data) return false;
                break;
              case node.TEXT_NODE:
              case node.CDATA_SECTION_NODE:
              case node.COMMENT_NODE:
                if (node.data !== other.data) return false;
                break;
            }
            if (node.childNodes.length !== other.childNodes.length) return false;
            for (var i = node.childNodes.length - 1; i >= 0; i--) {
              stack.push({ node: node.childNodes[i], other: other.childNodes[i] });
            }
          }
          return true;
        },
        /**
         * Checks whether or not the given node is this node.
         *
         * @param {Node} [otherNode]
         */
        isSameNode: function(otherNode) {
          return this === otherNode;
        },
        /**
         * Inserts a node before a reference node as a child of this node.
         *
         * @param {Node} newChild
         * The new child node to be inserted.
         * @param {Node | null} refChild
         * The reference node before which newChild will be inserted.
         * @returns {Node}
         * The new child node successfully inserted.
         * @throws {DOMException}
         * Throws a DOMException if inserting the node would result in a DOM tree that is not
         * well-formed, or if `child` is provided but is not a child of `parent`.
         * See {@link _insertBefore} for more details.
         * @since Modified in DOM L2
         */
        insertBefore: function(newChild, refChild) {
          return _insertBefore(this, newChild, refChild);
        },
        /**
         * Replaces an old child node with a new child node within this node.
         *
         * @param {Node} newChild
         * The new node that is to replace the old node.
         * If it already exists in the DOM, it is removed from its original position.
         * @param {Node} oldChild
         * The existing child node to be replaced.
         * @returns {Node}
         * Returns the replaced child node.
         * @throws {DOMException}
         * Throws a DOMException if replacing the node would result in a DOM tree that is not
         * well-formed, or if `oldChild` is not a child of `this`.
         * This can also occur if the pre-replacement validity assertion fails.
         * See {@link _insertBefore}, {@link Node.removeChild}, and
         * {@link assertPreReplacementValidityInDocument} for more details.
         * @see https://dom.spec.whatwg.org/#concept-node-replace
         */
        replaceChild: function(newChild, oldChild) {
          _insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
          if (oldChild) {
            this.removeChild(oldChild);
          }
        },
        /**
         * Removes an existing child node from this node.
         *
         * @param {Node} oldChild
         * The child node to be removed.
         * @returns {Node}
         * Returns the removed child node.
         * @throws {DOMException}
         * Throws a DOMException if `oldChild` is not a child of `this`.
         * See {@link _removeChild} for more details.
         */
        removeChild: function(oldChild) {
          return _removeChild(this, oldChild);
        },
        /**
         * Appends a child node to this node.
         *
         * @param {Node} newChild
         * The child node to be appended to this node.
         * If it already exists in the DOM, it is removed from its original position.
         * @returns {Node}
         * Returns the appended child node.
         * @throws {DOMException}
         * Throws a DOMException if appending the node would result in a DOM tree that is not
         * well-formed, or if `newChild` is not a valid Node.
         * See {@link insertBefore} for more details.
         */
        appendChild: function(newChild) {
          return this.insertBefore(newChild, null);
        },
        /**
         * Determines whether this node has any child nodes.
         *
         * @returns {boolean}
         * Returns true if this node has any child nodes, and false otherwise.
         */
        hasChildNodes: function() {
          return this.firstChild != null;
        },
        /**
         * Creates a copy of the calling node.
         *
         * @param {boolean} deep
         * If true, the contents of the node are recursively copied.
         * If false, only the node itself (and its attributes, if it is an element) are copied.
         * @returns {Node}
         * Returns the newly created copy of the node.
         * @throws {DOMException}
         * May throw a DOMException if operations within {@link Element#setAttributeNode} or
         * {@link Node#appendChild} (which are potentially invoked in this method) do not meet their
         * specific constraints.
         * @see {@link cloneNode}
         */
        cloneNode: function(deep) {
          return cloneNode(this.ownerDocument || this, this, deep);
        },
        /**
         * Puts the specified node and all of its subtree into a "normalized" form. In a normalized
         * subtree, no text nodes in the subtree are empty and there are no adjacent text nodes.
         *
         * Specifically, this method merges any adjacent text nodes (i.e., nodes for which `nodeType`
         * is `TEXT_NODE`) into a single node with the combined data. It also removes any empty text
         * nodes.
         *
         * This method iterativly traverses all child nodes to normalize all descendent nodes within
         * the subtree.
         *
         * @throws {DOMException}
         * May throw a DOMException if operations within removeChild or appendData (which are
         * potentially invoked in this method) do not meet their specific constraints.
         * @since Modified in DOM Level 2
         * @see {@link Node.removeChild}
         * @see {@link CharacterData.appendData}
         * @see ../docs/walk-dom.md.
         */
        normalize: function() {
          walkDOM(this, null, {
            enter: function(node) {
              var child = node.firstChild;
              while (child) {
                var next = child.nextSibling;
                if (next !== null && next.nodeType === TEXT_NODE && child.nodeType === TEXT_NODE) {
                  var tail = [];
                  var sibling = next;
                  while (sibling !== null && sibling.nodeType === TEXT_NODE) {
                    tail.push(sibling.data);
                    sibling = sibling.nextSibling;
                  }
                  var removed = child.nextSibling;
                  while (removed !== sibling) {
                    var following = removed.nextSibling;
                    removed.parentNode = null;
                    removed.previousSibling = null;
                    removed.nextSibling = null;
                    removed = following;
                  }
                  child.nextSibling = sibling;
                  if (sibling !== null) {
                    sibling.previousSibling = child;
                  } else {
                    node.lastChild = child;
                  }
                  child.appendData(tail.join(""));
                  _onUpdateChild(node.ownerDocument, node);
                  child = sibling;
                } else {
                  child = next;
                }
              }
              return true;
            }
          });
        },
        /**
         * Checks whether the DOM implementation implements a specific feature and its version.
         *
         * @deprecated
         * Since `DOMImplementation.hasFeature` is deprecated and always returns true.
         * @param {string} feature
         * The package name of the feature to test. This is the same name that can be passed to the
         * method `hasFeature` on `DOMImplementation`.
         * @param {string} version
         * This is the version number of the package name to test.
         * @returns {boolean}
         * Returns true in all cases in the current implementation.
         * @since Introduced in DOM Level 2
         * @see {@link DOMImplementation.hasFeature}
         */
        isSupported: function(feature, version) {
          return this.ownerDocument.implementation.hasFeature(feature, version);
        },
        /**
         * Look up the prefix associated to the given namespace URI, starting from this node.
         * **The default namespace declarations are ignored by this method.**
         * See Namespace Prefix Lookup for details on the algorithm used by this method.
         *
         * **This behavior is different from the in the specs**:
         * - no node type specific handling
         * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
         *
         * @param {string | null} namespaceURI
         * The namespace URI for which to find the associated prefix.
         * @returns {string | null}
         * The associated prefix, if found; otherwise, null.
         * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespacePrefix
         * @see https://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespacePrefixAlgo
         * @see https://dom.spec.whatwg.org/#dom-node-lookupprefix
         * @see https://github.com/xmldom/xmldom/issues/322
         * @prettierignore
         */
        lookupPrefix: function(namespaceURI) {
          var el = this;
          while (el) {
            var map = el._nsMap;
            if (map) {
              for (var n in map) {
                if (hasOwn(map, n) && map[n] === namespaceURI) {
                  return n;
                }
              }
            }
            el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
          }
          return null;
        },
        /**
         * This function is used to look up the namespace URI associated with the given prefix,
         * starting from this node.
         *
         * **This behavior is different from the in the specs**:
         * - no node type specific handling
         * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
         *
         * @param {string | null} prefix
         * The prefix for which to find the associated namespace URI.
         * @returns {string | null}
         * The associated namespace URI, if found; otherwise, null.
         * @since DOM Level 3
         * @see https://dom.spec.whatwg.org/#dom-node-lookupnamespaceuri
         * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespaceURI
         * @prettierignore
         */
        lookupNamespaceURI: function(prefix) {
          var el = this;
          while (el) {
            var map = el._nsMap;
            if (map) {
              if (hasOwn(map, prefix)) {
                return map[prefix];
              }
            }
            el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
          }
          return null;
        },
        /**
         * Determines whether the given namespace URI is the default namespace.
         *
         * The function works by looking up the prefix associated with the given namespace URI. If no
         * prefix is found (i.e., the namespace URI is not registered in the namespace map of this
         * node or any of its ancestors), it returns `true`, implying the namespace URI is considered
         * the default.
         *
         * **This behavior is different from the in the specs**:
         * - no node type specific handling
         * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
         *
         * @param {string | null} namespaceURI
         * The namespace URI to be checked.
         * @returns {boolean}
         * Returns true if the given namespace URI is the default namespace, false otherwise.
         * @since DOM Level 3
         * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-isDefaultNamespace
         * @see https://dom.spec.whatwg.org/#dom-node-isdefaultnamespace
         * @prettierignore
         */
        isDefaultNamespace: function(namespaceURI) {
          var prefix = this.lookupPrefix(namespaceURI);
          return prefix == null;
        },
        /**
         * Compares the reference node with a node with regard to their position in the document and
         * according to the document order.
         *
         * @param {Node} other
         * The node to compare the reference node to.
         * @returns {number}
         * Returns how the node is positioned relatively to the reference node according to the
         * bitmask. 0 if reference node and given node are the same.
         * @since DOM Level 3
         * @see https://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-compare
         * @see https://dom.spec.whatwg.org/#dom-node-comparedocumentposition
         */
        compareDocumentPosition: function(other) {
          if (this === other) return 0;
          var node1 = other;
          var node2 = this;
          var attr1 = null;
          var attr2 = null;
          if (node1 instanceof Attr) {
            attr1 = node1;
            node1 = attr1.ownerElement;
          }
          if (node2 instanceof Attr) {
            attr2 = node2;
            node2 = attr2.ownerElement;
            if (attr1 && node1 && node2 === node1) {
              for (var i = 0, attr; attr = node2.attributes[i]; i++) {
                if (attr === attr1)
                  return DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
                if (attr === attr2)
                  return DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
              }
            }
          }
          if (!node1 || !node2 || node2.ownerDocument !== node1.ownerDocument) {
            return DocumentPosition.DOCUMENT_POSITION_DISCONNECTED + DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + (docGUID(node2.ownerDocument) > docGUID(node1.ownerDocument) ? DocumentPosition.DOCUMENT_POSITION_FOLLOWING : DocumentPosition.DOCUMENT_POSITION_PRECEDING);
          }
          if (attr2 && node1 === node2) {
            return DocumentPosition.DOCUMENT_POSITION_CONTAINS + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
          }
          if (attr1 && node1 === node2) {
            return DocumentPosition.DOCUMENT_POSITION_CONTAINED_BY + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
          }
          var chain1 = [];
          var ancestor1 = node1.parentNode;
          while (ancestor1) {
            if (!attr2 && ancestor1 === node2) {
              return DocumentPosition.DOCUMENT_POSITION_CONTAINED_BY + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
            }
            chain1.push(ancestor1);
            ancestor1 = ancestor1.parentNode;
          }
          chain1.reverse();
          var chain2 = [];
          var ancestor2 = node2.parentNode;
          while (ancestor2) {
            if (!attr1 && ancestor2 === node1) {
              return DocumentPosition.DOCUMENT_POSITION_CONTAINS + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
            }
            chain2.push(ancestor2);
            ancestor2 = ancestor2.parentNode;
          }
          chain2.reverse();
          var ca = commonAncestor(chain1, chain2);
          for (var n in ca.childNodes) {
            var child = ca.childNodes[n];
            if (child === node2) return DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
            if (child === node1) return DocumentPosition.DOCUMENT_POSITION_PRECEDING;
            if (chain2.indexOf(child) >= 0) return DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
            if (chain1.indexOf(child) >= 0) return DocumentPosition.DOCUMENT_POSITION_PRECEDING;
          }
          return 0;
        }
      };
      function _xmlEncoder(c) {
        return c == "<" && "&lt;" || c == ">" && "&gt;" || c == "&" && "&amp;" || c == '"' && "&quot;" || "&#" + c.charCodeAt() + ";";
      }
      copy(NodeType, Node);
      copy(NodeType, Node.prototype);
      copy(DocumentPosition, Node);
      copy(DocumentPosition, Node.prototype);
      function _visitNode(node, callback) {
        walkDOM(node, null, {
          enter: function(n) {
            return callback(n) ? walkDOM.STOP : true;
          }
        });
      }
      function walkDOM(node, context, callbacks) {
        var stack = [{ node, context, phase: walkDOM.ENTER }];
        while (stack.length > 0) {
          var frame = stack.pop();
          if (frame.phase === walkDOM.ENTER) {
            var childContext = callbacks.enter(frame.node, frame.context);
            if (childContext === walkDOM.STOP) {
              return walkDOM.STOP;
            }
            stack.push({ node: frame.node, context: childContext, phase: walkDOM.EXIT });
            if (childContext === null || childContext === void 0) {
              continue;
            }
            var child = frame.node.lastChild;
            while (child) {
              stack.push({ node: child, context: childContext, phase: walkDOM.ENTER });
              child = child.previousSibling;
            }
          } else {
            if (callbacks.exit) {
              callbacks.exit(frame.node, frame.context);
            }
          }
        }
      }
      walkDOM.STOP = Symbol("walkDOM.STOP");
      walkDOM.ENTER = 0;
      walkDOM.EXIT = 1;
      function Document(symbol, options) {
        checkSymbol(symbol);
        var opt = options || {};
        this.ownerDocument = this;
        this.contentType = opt.contentType || MIME_TYPE.XML_APPLICATION;
        this.type = isHTMLMimeType(this.contentType) ? "html" : "xml";
      }
      function _onAddAttribute(doc, el, newAttr) {
        doc && doc._inc++;
        var ns = newAttr.namespaceURI;
        if (ns === NAMESPACE.XMLNS) {
          el._nsMap[newAttr.prefix ? newAttr.localName : ""] = newAttr.value;
        }
      }
      function _onRemoveAttribute(doc, el, newAttr, remove) {
        doc && doc._inc++;
        var ns = newAttr.namespaceURI;
        if (ns === NAMESPACE.XMLNS) {
          delete el._nsMap[newAttr.prefix ? newAttr.localName : ""];
        }
      }
      function _onUpdateChild(doc, parent, newChild) {
        if (doc && doc._inc) {
          doc._inc++;
          var childNodes = parent.childNodes;
          if (newChild && !newChild.nextSibling) {
            childNodes[childNodes.length++] = newChild;
          } else {
            var child = parent.firstChild;
            var i = 0;
            while (child) {
              childNodes[i++] = child;
              child = child.nextSibling;
            }
            childNodes.length = i;
            delete childNodes[childNodes.length];
          }
        }
      }
      function _removeChild(parentNode, child) {
        if (parentNode !== child.parentNode) {
          throw new DOMException(DOMException.NOT_FOUND_ERR, "child's parent is not parent");
        }
        var oldPreviousSibling = child.previousSibling;
        var oldNextSibling = child.nextSibling;
        if (oldPreviousSibling) {
          oldPreviousSibling.nextSibling = oldNextSibling;
        } else {
          parentNode.firstChild = oldNextSibling;
        }
        if (oldNextSibling) {
          oldNextSibling.previousSibling = oldPreviousSibling;
        } else {
          parentNode.lastChild = oldPreviousSibling;
        }
        _onUpdateChild(parentNode.ownerDocument, parentNode);
        child.parentNode = null;
        child.previousSibling = null;
        child.nextSibling = null;
        return child;
      }
      function hasValidParentNodeType(node) {
        return node && (node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.ELEMENT_NODE);
      }
      function hasInsertableNodeType(node) {
        return node && (node.nodeType === Node.CDATA_SECTION_NODE || node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.DOCUMENT_TYPE_NODE || node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.PROCESSING_INSTRUCTION_NODE || node.nodeType === Node.TEXT_NODE);
      }
      function isDocTypeNode(node) {
        return node && node.nodeType === Node.DOCUMENT_TYPE_NODE;
      }
      function isElementNode(node) {
        return node && node.nodeType === Node.ELEMENT_NODE;
      }
      function isTextNode(node) {
        return node && node.nodeType === Node.TEXT_NODE;
      }
      function isElementInsertionPossible(doc, child) {
        var parentChildNodes = doc.childNodes || [];
        if (find(parentChildNodes, isElementNode) || isDocTypeNode(child)) {
          return false;
        }
        var docTypeNode = find(parentChildNodes, isDocTypeNode);
        return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
      }
      function isElementReplacementPossible(doc, child) {
        var parentChildNodes = doc.childNodes || [];
        function hasElementChildThatIsNotChild(node) {
          return isElementNode(node) && node !== child;
        }
        if (find(parentChildNodes, hasElementChildThatIsNotChild)) {
          return false;
        }
        var docTypeNode = find(parentChildNodes, isDocTypeNode);
        return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
      }
      function assertPreInsertionValidity1to5(parent, node, child) {
        if (!hasValidParentNodeType(parent)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Unexpected parent node type " + parent.nodeType);
        }
        if (child && child.parentNode !== parent) {
          throw new DOMException(DOMException.NOT_FOUND_ERR, "child not in parent");
        }
        if (
          // 4. If `node` is not a DocumentFragment, DocumentType, Element, or CharacterData node, then throw a "HierarchyRequestError" DOMException.
          !hasInsertableNodeType(node) || // 5. If either `node` is a Text node and `parent` is a document,
          // the sax parser currently adds top level text nodes, this will be fixed in 0.9.0
          // || (node.nodeType === Node.TEXT_NODE && parent.nodeType === Node.DOCUMENT_NODE)
          // or `node` is a doctype and `parent` is not a document, then throw a "HierarchyRequestError" DOMException.
          isDocTypeNode(node) && parent.nodeType !== Node.DOCUMENT_NODE
        ) {
          throw new DOMException(
            DOMException.HIERARCHY_REQUEST_ERR,
            "Unexpected node type " + node.nodeType + " for parent node type " + parent.nodeType
          );
        }
      }
      function assertPreInsertionValidityInDocument(parent, node, child) {
        var parentChildNodes = parent.childNodes || [];
        var nodeChildNodes = node.childNodes || [];
        if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          var nodeChildElements = nodeChildNodes.filter(isElementNode);
          if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
          }
          if (nodeChildElements.length === 1 && !isElementInsertionPossible(parent, child)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
          }
        }
        if (isElementNode(node)) {
          if (!isElementInsertionPossible(parent, child)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
          }
        }
        if (isDocTypeNode(node)) {
          if (find(parentChildNodes, isDocTypeNode)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
          }
          var parentElementChild = find(parentChildNodes, isElementNode);
          if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
          }
          if (!child && parentElementChild) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can not be appended since element is present");
          }
        }
      }
      function assertPreReplacementValidityInDocument(parent, node, child) {
        var parentChildNodes = parent.childNodes || [];
        var nodeChildNodes = node.childNodes || [];
        if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          var nodeChildElements = nodeChildNodes.filter(isElementNode);
          if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
          }
          if (nodeChildElements.length === 1 && !isElementReplacementPossible(parent, child)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
          }
        }
        if (isElementNode(node)) {
          if (!isElementReplacementPossible(parent, child)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
          }
        }
        if (isDocTypeNode(node)) {
          let hasDoctypeChildThatIsNotChild = function(node2) {
            return isDocTypeNode(node2) && node2 !== child;
          };
          if (find(parentChildNodes, hasDoctypeChildThatIsNotChild)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
          }
          var parentElementChild = find(parentChildNodes, isElementNode);
          if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
            throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
          }
        }
      }
      function _insertBefore(parent, node, child, _inDocumentAssertion) {
        assertPreInsertionValidity1to5(parent, node, child);
        if (parent.nodeType === Node.DOCUMENT_NODE) {
          (_inDocumentAssertion || assertPreInsertionValidityInDocument)(parent, node, child);
        }
        var cp = node.parentNode;
        if (cp) {
          cp.removeChild(node);
        }
        if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
          var newFirst = node.firstChild;
          if (newFirst == null) {
            return node;
          }
          var newLast = node.lastChild;
        } else {
          newFirst = newLast = node;
        }
        var pre = child ? child.previousSibling : parent.lastChild;
        newFirst.previousSibling = pre;
        newLast.nextSibling = child;
        if (pre) {
          pre.nextSibling = newFirst;
        } else {
          parent.firstChild = newFirst;
        }
        if (child == null) {
          parent.lastChild = newLast;
        } else {
          child.previousSibling = newLast;
        }
        do {
          newFirst.parentNode = parent;
        } while (newFirst !== newLast && (newFirst = newFirst.nextSibling));
        _onUpdateChild(parent.ownerDocument || parent, parent, node);
        if (node.nodeType == DOCUMENT_FRAGMENT_NODE) {
          node.firstChild = node.lastChild = null;
        }
        return node;
      }
      Document.prototype = {
        /**
         * The implementation that created this document.
         *
         * @type DOMImplementation
         * @readonly
         */
        implementation: null,
        nodeName: "#document",
        nodeType: DOCUMENT_NODE,
        /**
         * The DocumentType node of the document.
         *
         * @type DocumentType
         * @readonly
         */
        doctype: null,
        documentElement: null,
        _inc: 1,
        insertBefore: function(newChild, refChild) {
          if (newChild.nodeType === DOCUMENT_FRAGMENT_NODE) {
            var child = newChild.firstChild;
            while (child) {
              var next = child.nextSibling;
              this.insertBefore(child, refChild);
              child = next;
            }
            return newChild;
          }
          _insertBefore(this, newChild, refChild);
          newChild.ownerDocument = this;
          if (this.documentElement === null && newChild.nodeType === ELEMENT_NODE) {
            this.documentElement = newChild;
          }
          return newChild;
        },
        removeChild: function(oldChild) {
          var removed = _removeChild(this, oldChild);
          if (removed === this.documentElement) {
            this.documentElement = null;
          }
          return removed;
        },
        replaceChild: function(newChild, oldChild) {
          _insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
          newChild.ownerDocument = this;
          if (oldChild) {
            this.removeChild(oldChild);
          }
          if (isElementNode(newChild)) {
            this.documentElement = newChild;
          }
        },
        /**
         * Imports a node from another document into this document, creating a new copy owned by this
         * document. The source node and its subtree are not modified.
         *
         * @param {Node} importedNode
         * The node to import.
         * @param {boolean} deep
         * If true, the contents of the node are recursively imported.
         * If false, only the node itself (and its attributes, if it is an element) are imported.
         * @returns {Node}
         * Returns the newly created import of the node.
         * @see {@link importNode}
         * @see {@link https://dom.spec.whatwg.org/#dom-document-importnode}
         */
        importNode: function(importedNode, deep) {
          return importNode(this, importedNode, deep);
        },
        // Introduced in DOM Level 2:
        getElementById: function(id) {
          var rtv = null;
          _visitNode(this.documentElement, function(node) {
            if (node.nodeType == ELEMENT_NODE) {
              if (node.getAttribute("id") == id) {
                rtv = node;
                return true;
              }
            }
          });
          return rtv;
        },
        /**
         * Creates a new `Element` that is owned by this `Document`.
         * In HTML Documents `localName` is the lower cased `tagName`,
         * otherwise no transformation is being applied.
         * When `contentType` implies the HTML namespace, it will be set as `namespaceURI`.
         *
         * __This implementation differs from the specification:__ - The provided name is not checked
         * against the `Name` production,
         * so no related error will be thrown.
         * - There is no interface `HTMLElement`, it is always an `Element`.
         * - There is no support for a second argument to indicate using custom elements.
         *
         * @param {string} tagName
         * @returns {Element}
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement
         * @see https://dom.spec.whatwg.org/#dom-document-createelement
         * @see https://dom.spec.whatwg.org/#concept-create-element
         */
        createElement: function(tagName) {
          var node = new Element(PDC);
          node.ownerDocument = this;
          if (this.type === "html") {
            tagName = tagName.toLowerCase();
          }
          if (hasDefaultHTMLNamespace(this.contentType)) {
            node.namespaceURI = NAMESPACE.HTML;
          }
          node.nodeName = tagName;
          node.tagName = tagName;
          node.localName = tagName;
          node.childNodes = new NodeList();
          var attrs = node.attributes = new NamedNodeMap();
          attrs._ownerElement = node;
          return node;
        },
        /**
         * @returns {DocumentFragment}
         */
        createDocumentFragment: function() {
          var node = new DocumentFragment(PDC);
          node.ownerDocument = this;
          node.childNodes = new NodeList();
          return node;
        },
        /**
         * @param {string} data
         * @returns {Text}
         */
        createTextNode: function(data) {
          var node = new Text(PDC);
          node.ownerDocument = this;
          node.childNodes = new NodeList();
          node.appendData(data);
          return node;
        },
        /**
         * @param {string} data
         * @returns {Comment}
         * @see https://dom.spec.whatwg.org/#dom-document-createcomment
         * @see https://www.w3.org/TR/xml/#NT-Comment XML 1.0 production [15]
         * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.3
         *
         *      Note: no validation is performed at creation time. When the resulting document is
         *      serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
         *      if the comment data contains `--` anywhere, ends with `-`, or contains characters
         *      outside the XML Char production (W3C DOM Parsing §3.2.1.3). Without that option the
         *      data is emitted verbatim.
         */
        createComment: function(data) {
          var node = new Comment(PDC);
          node.ownerDocument = this;
          node.childNodes = new NodeList();
          node.appendData(data);
          return node;
        },
        /**
         * Returns a new CDATASection node whose data is `data`.
         *
         * __This implementation differs from the specification:__ - calling this method on an HTML
         * document does not throw `NotSupportedError`.
         *
         * @param {string} data
         * @returns {CDATASection}
         * @throws {DOMException}
         * With code `INVALID_CHARACTER_ERR` if `data` contains `"]]>"`.
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createCDATASection
         * @see https://dom.spec.whatwg.org/#dom-document-createcdatasection
         */
        createCDATASection: function(data) {
          if (data.indexOf("]]>") !== -1) {
            throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'data contains "]]>"');
          }
          var node = new CDATASection(PDC);
          node.ownerDocument = this;
          node.childNodes = new NodeList();
          node.appendData(data);
          return node;
        },
        /**
         * Returns a ProcessingInstruction node whose target is target and data is data.
         *
         * __This behavior is slightly different from the in the specs__:
         * - it does not do any input validation on the arguments and doesn't throw
         * "InvalidCharacterError".
         *
         * Note: When the resulting document is serialized with `requireWellFormed: true`, the
         * serializer throws `InvalidStateError` if `.target` is not a valid XML `NCName` (a `Name`
         * with no colon) or is an ASCII case-insensitive match for `"xml"`, or if `.data` contains
         * `?>` or characters outside the XML Char production (W3C DOM Parsing §3.2.1.7). Without that
         * option the target and data are emitted verbatim.
         *
         * @param {string} target
         * @param {string} data
         * @returns {ProcessingInstruction}
         * @see https://developer.mozilla.org/docs/Web/API/Document/createProcessingInstruction
         * @see https://dom.spec.whatwg.org/#dom-document-createprocessinginstruction
         * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.7
         */
        createProcessingInstruction: function(target, data) {
          var node = new ProcessingInstruction(PDC);
          node.ownerDocument = this;
          node.childNodes = new NodeList();
          node.nodeName = node.target = target;
          node.nodeValue = node.data = data;
          return node;
        },
        /**
         * Creates an `Attr` node that is owned by this document.
         * In HTML Documents `localName` is the lower cased `name`,
         * otherwise no transformation is being applied.
         *
         * __This implementation differs from the specification:__ - The provided name is not checked
         * against the `Name` production,
         * so no related error will be thrown.
         *
         * @param {string} name
         * @returns {Attr}
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createAttribute
         * @see https://dom.spec.whatwg.org/#dom-document-createattribute
         */
        createAttribute: function(name2) {
          if (!g.QName_exact.test(name2)) {
            throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'invalid character in name "' + name2 + '"');
          }
          if (this.type === "html") {
            name2 = name2.toLowerCase();
          }
          return this._createAttribute(name2);
        },
        _createAttribute: function(name2) {
          var node = new Attr(PDC);
          node.ownerDocument = this;
          node.childNodes = new NodeList();
          node.name = name2;
          node.nodeName = name2;
          node.localName = name2;
          node.specified = true;
          return node;
        },
        /**
         * Creates an EntityReference object.
         * The current implementation does not fill the `childNodes` with those of the corresponding
         * `Entity`
         *
         * The `name` is validated against the XML `Name` production at creation time; an invalid name
         * throws `InvalidCharacterError`. When the resulting node is serialized with
         * `requireWellFormed: true`, the serializer re-validates `nodeName` against the XML `Name`
         * production and throws `InvalidStateError` if a later `nodeName` mutation made it invalid;
         * without that option the name is emitted verbatim.
         *
         * __This implementation differs from the specification:__ xmldom does not expand entities —
         * the parser resolves entity references inline and never constructs `EntityReference` nodes,
         * so this method is the only producer.
         *
         * @deprecated
         * In DOM Level 4.
         * @param {string} name
         * The name of the entity to reference. No namespace well-formedness checks are performed.
         * @returns {EntityReference}
         * @throws {DOMException}
         * With code `INVALID_CHARACTER_ERR` when `name` is not a valid XML `Name`.
         * @throws {DOMException}
         * with code `NOT_SUPPORTED_ERR` when the document is of type `html`
         * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-392B75AE
         */
        createEntityReference: function(name2) {
          if (!g.Name_exact.test(name2)) {
            throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'not a valid xml name "' + name2 + '"');
          }
          if (this.type === "html") {
            throw new DOMException("document is an html document", DOMExceptionName.NotSupportedError);
          }
          var node = new EntityReference(PDC);
          node.ownerDocument = this;
          node.childNodes = new NodeList();
          node.nodeName = name2;
          return node;
        },
        // Introduced in DOM Level 2:
        /**
         * @param {string} namespaceURI
         * @param {string} qualifiedName
         * @returns {Element}
         */
        createElementNS: function(namespaceURI, qualifiedName) {
          var validated = validateAndExtract(namespaceURI, qualifiedName);
          var node = new Element(PDC);
          var attrs = node.attributes = new NamedNodeMap();
          node.childNodes = new NodeList();
          node.ownerDocument = this;
          node.nodeName = qualifiedName;
          node.tagName = qualifiedName;
          node.namespaceURI = validated[0];
          node.prefix = validated[1];
          node.localName = validated[2];
          attrs._ownerElement = node;
          return node;
        },
        // Introduced in DOM Level 2:
        /**
         * @param {string} namespaceURI
         * @param {string} qualifiedName
         * @returns {Attr}
         */
        createAttributeNS: function(namespaceURI, qualifiedName) {
          var validated = validateAndExtract(namespaceURI, qualifiedName);
          var node = new Attr(PDC);
          node.ownerDocument = this;
          node.childNodes = new NodeList();
          node.nodeName = qualifiedName;
          node.name = qualifiedName;
          node.specified = true;
          node.namespaceURI = validated[0];
          node.prefix = validated[1];
          node.localName = validated[2];
          return node;
        }
      };
      _extends(Document, Node);
      function Element(symbol) {
        checkSymbol(symbol);
        this._nsMap = /* @__PURE__ */ Object.create(null);
      }
      Element.prototype = {
        nodeType: ELEMENT_NODE,
        /**
         * The attributes of this element.
         *
         * @type {NamedNodeMap | null}
         */
        attributes: null,
        getQualifiedName: function() {
          return this.prefix ? this.prefix + ":" + this.localName : this.localName;
        },
        _isInHTMLDocumentAndNamespace: function() {
          return this.ownerDocument.type === "html" && this.namespaceURI === NAMESPACE.HTML;
        },
        /**
         * Implementaton of Level2 Core function hasAttributes.
         *
         * @returns {boolean}
         * True if attribute list is not empty.
         * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-NodeHasAttrs
         */
        hasAttributes: function() {
          return !!(this.attributes && this.attributes.length);
        },
        hasAttribute: function(name2) {
          return !!this.getAttributeNode(name2);
        },
        /**
         * Returns element’s first attribute whose qualified name is `name`, and `null`
         * if there is no such attribute.
         *
         * @param {string} name
         * @returns {string | null}
         */
        getAttribute: function(name2) {
          var attr = this.getAttributeNode(name2);
          return attr ? attr.value : null;
        },
        getAttributeNode: function(name2) {
          if (this._isInHTMLDocumentAndNamespace()) {
            name2 = name2.toLowerCase();
          }
          return this.attributes.getNamedItem(name2);
        },
        /**
         * Sets the value of element’s first attribute whose qualified name is qualifiedName to value.
         *
         * @param {string} name
         * @param {string} value
         */
        setAttribute: function(name2, value) {
          if (this._isInHTMLDocumentAndNamespace()) {
            name2 = name2.toLowerCase();
          }
          var attr = this.getAttributeNode(name2);
          if (attr) {
            attr.value = attr.nodeValue = "" + value;
          } else {
            attr = this.ownerDocument._createAttribute(name2);
            attr.value = attr.nodeValue = "" + value;
            this.setAttributeNode(attr);
          }
        },
        removeAttribute: function(name2) {
          var attr = this.getAttributeNode(name2);
          attr && this.removeAttributeNode(attr);
        },
        setAttributeNode: function(newAttr) {
          return this.attributes.setNamedItem(newAttr);
        },
        setAttributeNodeNS: function(newAttr) {
          return this.attributes.setNamedItemNS(newAttr);
        },
        removeAttributeNode: function(oldAttr) {
          return this.attributes.removeNamedItem(oldAttr.nodeName);
        },
        //get real attribute name,and remove it by removeAttributeNode
        removeAttributeNS: function(namespaceURI, localName) {
          var old = this.getAttributeNodeNS(namespaceURI, localName);
          old && this.removeAttributeNode(old);
        },
        hasAttributeNS: function(namespaceURI, localName) {
          return this.getAttributeNodeNS(namespaceURI, localName) != null;
        },
        /**
         * Returns element’s attribute whose namespace is `namespaceURI` and local name is
         * `localName`,
         * or `null` if there is no such attribute.
         *
         * @param {string} namespaceURI
         * @param {string} localName
         * @returns {string | null}
         */
        getAttributeNS: function(namespaceURI, localName) {
          var attr = this.getAttributeNodeNS(namespaceURI, localName);
          return attr ? attr.value : null;
        },
        /**
         * Sets the value of element’s attribute whose namespace is `namespaceURI` and local name is
         * `localName` to value.
         *
         * @param {string} namespaceURI
         * @param {string} qualifiedName
         * @param {string} value
         * @see https://dom.spec.whatwg.org/#dom-element-setattributens
         */
        setAttributeNS: function(namespaceURI, qualifiedName, value) {
          var validated = validateAndExtract(namespaceURI, qualifiedName);
          var localName = validated[2];
          var attr = this.getAttributeNodeNS(namespaceURI, localName);
          if (attr) {
            attr.value = attr.nodeValue = "" + value;
          } else {
            attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
            attr.value = attr.nodeValue = "" + value;
            this.setAttributeNode(attr);
          }
        },
        getAttributeNodeNS: function(namespaceURI, localName) {
          return this.attributes.getNamedItemNS(namespaceURI, localName);
        },
        /**
         * Returns a LiveNodeList of all child elements which have **all** of the given class name(s).
         *
         * Returns an empty list if `classNames` is an empty string or only contains HTML white space
         * characters.
         *
         * Warning: This returns a live LiveNodeList.
         * Changes in the DOM will reflect in the array as the changes occur.
         * If an element selected by this array no longer qualifies for the selector,
         * it will automatically be removed. Be aware of this for iteration purposes.
         *
         * @param {string} classNames
         * Is a string representing the class name(s) to match; multiple class names are separated by
         * (ASCII-)whitespace.
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByClassName
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
         * @see https://dom.spec.whatwg.org/#concept-getelementsbyclassname
         */
        getElementsByClassName: function(classNames) {
          var classNamesSet = toOrderedSet(classNames);
          return new LiveNodeList(this, function(base) {
            var ls = [];
            if (classNamesSet.length > 0) {
              _visitNode(base, function(node) {
                if (node !== base && node.nodeType === ELEMENT_NODE) {
                  var nodeClassNames = node.getAttribute("class");
                  if (nodeClassNames) {
                    var matches = classNames === nodeClassNames;
                    if (!matches) {
                      var nodeClassNamesSet = toOrderedSet(nodeClassNames);
                      matches = classNamesSet.every(arrayIncludes(nodeClassNamesSet));
                    }
                    if (matches) {
                      ls.push(node);
                    }
                  }
                }
              });
            }
            return ls;
          });
        },
        /**
         * Returns a LiveNodeList of elements with the given qualifiedName.
         * Searching for all descendants can be done by passing `*` as `qualifiedName`.
         *
         * All descendants of the specified element are searched, but not the element itself.
         * The returned list is live, which means it updates itself with the DOM tree automatically.
         * Therefore, there is no need to call `Element.getElementsByTagName()`
         * with the same element and arguments repeatedly if the DOM changes in between calls.
         *
         * When called on an HTML element in an HTML document,
         * `getElementsByTagName` lower-cases the argument before searching for it.
         * This is undesirable when trying to match camel-cased SVG elements (such as
         * `<linearGradient>`) in an HTML document.
         * Instead, use `Element.getElementsByTagNameNS()`,
         * which preserves the capitalization of the tag name.
         *
         * `Element.getElementsByTagName` is similar to `Document.getElementsByTagName()`,
         * except that it only searches for elements that are descendants of the specified element.
         *
         * @param {string} qualifiedName
         * @returns {LiveNodeList}
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
         * @see https://dom.spec.whatwg.org/#concept-getelementsbytagname
         */
        getElementsByTagName: function(qualifiedName) {
          var isHTMLDocument = (this.nodeType === DOCUMENT_NODE ? this : this.ownerDocument).type === "html";
          var lowerQualifiedName = qualifiedName.toLowerCase();
          return new LiveNodeList(this, function(base) {
            var ls = [];
            _visitNode(base, function(node) {
              if (node === base || node.nodeType !== ELEMENT_NODE) {
                return;
              }
              if (qualifiedName === "*") {
                ls.push(node);
              } else {
                var nodeQualifiedName = node.getQualifiedName();
                var matchingQName = isHTMLDocument && node.namespaceURI === NAMESPACE.HTML ? lowerQualifiedName : qualifiedName;
                if (nodeQualifiedName === matchingQName) {
                  ls.push(node);
                }
              }
            });
            return ls;
          });
        },
        getElementsByTagNameNS: function(namespaceURI, localName) {
          return new LiveNodeList(this, function(base) {
            var ls = [];
            _visitNode(base, function(node) {
              if (node !== base && node.nodeType === ELEMENT_NODE && (namespaceURI === "*" || node.namespaceURI === namespaceURI) && (localName === "*" || node.localName == localName)) {
                ls.push(node);
              }
            });
            return ls;
          });
        }
      };
      Document.prototype.getElementsByClassName = Element.prototype.getElementsByClassName;
      Document.prototype.getElementsByTagName = Element.prototype.getElementsByTagName;
      Document.prototype.getElementsByTagNameNS = Element.prototype.getElementsByTagNameNS;
      _extends(Element, Node);
      function Attr(symbol) {
        checkSymbol(symbol);
        this.namespaceURI = null;
        this.prefix = null;
        this.ownerElement = null;
      }
      Attr.prototype.nodeType = ATTRIBUTE_NODE;
      _extends(Attr, Node);
      function CharacterData(symbol) {
        checkSymbol(symbol);
      }
      CharacterData.prototype = {
        data: "",
        substringData: function(offset, count) {
          return this.data.substring(offset, offset + count);
        },
        appendData: function(text) {
          text = this.data + text;
          this.nodeValue = this.data = text;
          this.length = text.length;
        },
        insertData: function(offset, text) {
          this.replaceData(offset, 0, text);
        },
        deleteData: function(offset, count) {
          this.replaceData(offset, count, "");
        },
        replaceData: function(offset, count, text) {
          var start = this.data.substring(0, offset);
          var end = this.data.substring(offset + count);
          text = start + text + end;
          this.nodeValue = this.data = text;
          this.length = text.length;
        }
      };
      _extends(CharacterData, Node);
      function Text(symbol) {
        checkSymbol(symbol);
      }
      Text.prototype = {
        nodeName: "#text",
        nodeType: TEXT_NODE,
        splitText: function(offset) {
          var text = this.data;
          var newText = text.substring(offset);
          text = text.substring(0, offset);
          this.data = this.nodeValue = text;
          this.length = text.length;
          var newNode = this.ownerDocument.createTextNode(newText);
          if (this.parentNode) {
            this.parentNode.insertBefore(newNode, this.nextSibling);
          }
          return newNode;
        }
      };
      _extends(Text, CharacterData);
      function Comment(symbol) {
        checkSymbol(symbol);
      }
      Comment.prototype = {
        nodeName: "#comment",
        nodeType: COMMENT_NODE
      };
      _extends(Comment, CharacterData);
      function CDATASection(symbol) {
        checkSymbol(symbol);
      }
      CDATASection.prototype = {
        nodeName: "#cdata-section",
        nodeType: CDATA_SECTION_NODE
      };
      _extends(CDATASection, Text);
      function DocumentType(symbol) {
        checkSymbol(symbol);
      }
      DocumentType.prototype.nodeType = DOCUMENT_TYPE_NODE;
      _extends(DocumentType, Node);
      function Notation(symbol) {
        checkSymbol(symbol);
      }
      Notation.prototype.nodeType = NOTATION_NODE;
      _extends(Notation, Node);
      function Entity(symbol) {
        checkSymbol(symbol);
      }
      Entity.prototype.nodeType = ENTITY_NODE;
      _extends(Entity, Node);
      function EntityReference(symbol) {
        checkSymbol(symbol);
      }
      EntityReference.prototype.nodeType = ENTITY_REFERENCE_NODE;
      _extends(EntityReference, Node);
      function DocumentFragment(symbol) {
        checkSymbol(symbol);
      }
      DocumentFragment.prototype.nodeName = "#document-fragment";
      DocumentFragment.prototype.nodeType = DOCUMENT_FRAGMENT_NODE;
      _extends(DocumentFragment, Node);
      function ProcessingInstruction(symbol) {
        checkSymbol(symbol);
      }
      ProcessingInstruction.prototype.nodeType = PROCESSING_INSTRUCTION_NODE;
      _extends(ProcessingInstruction, CharacterData);
      function XMLSerializer() {
      }
      XMLSerializer.prototype.serializeToString = function(node, options) {
        return nodeSerializeToString.call(node, options);
      };
      Node.prototype.toString = nodeSerializeToString;
      function nodeSerializeToString(options) {
        var opts;
        if (typeof options === "function") {
          opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: options };
        } else if (options != null) {
          opts = {
            requireWellFormed: !!options.requireWellFormed,
            splitCDATASections: options.splitCDATASections !== false,
            nodeFilter: options.nodeFilter || null
          };
        } else {
          opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: null };
        }
        var buf = [];
        var refNode = this.nodeType === DOCUMENT_NODE && this.documentElement || this;
        var prefix = refNode.prefix;
        var uri = refNode.namespaceURI;
        if (uri && prefix == null) {
          var prefix = refNode.lookupPrefix(uri);
          if (prefix == null) {
            var visibleNamespaces = [
              { namespace: uri, prefix: null }
              //{namespace:uri,prefix:''}
            ];
          }
        }
        serializeToString(this, buf, visibleNamespaces, opts);
        return buf.join("");
      }
      function needNamespaceDefine(node, isHTML, visibleNamespaces) {
        var prefix = node.prefix || "";
        var uri = node.namespaceURI;
        if (!uri) {
          return false;
        }
        if (prefix === "xml" && uri === NAMESPACE.XML || uri === NAMESPACE.XMLNS) {
          return false;
        }
        var i = visibleNamespaces.length;
        while (i--) {
          var ns = visibleNamespaces[i];
          if (ns.prefix === prefix) {
            return ns.namespace !== uri;
          }
        }
        return true;
      }
      function addSerializedAttribute(buf, qualifiedName, value, requireWellFormed) {
        if (requireWellFormed && !g.QName_exact.test(qualifiedName)) {
          throw new DOMException(
            'The attribute name "' + qualifiedName + '" is not a valid XML QName',
            DOMExceptionName.InvalidStateError
          );
        }
        buf.push(" ", qualifiedName, '="', value.replace(/[<>&"\t\n\r]/g, _xmlEncoder), '"');
      }
      function serializeToString(node, buf, visibleNamespaces, opts) {
        if (!visibleNamespaces) {
          visibleNamespaces = [];
        }
        var nodeFilter = opts.nodeFilter;
        var requireWellFormed = opts.requireWellFormed;
        var splitCDATASections = opts.splitCDATASections;
        var doc = node.nodeType === DOCUMENT_NODE ? node : node.ownerDocument;
        var isHTML = doc.type === "html";
        walkDOM(
          node,
          { ns: visibleNamespaces },
          {
            enter: function(n, ctx) {
              var namespaces = ctx.ns;
              if (nodeFilter) {
                n = nodeFilter(n);
                if (n) {
                  if (typeof n == "string") {
                    buf.push(n);
                    return null;
                  }
                } else {
                  return null;
                }
              }
              switch (n.nodeType) {
                case ELEMENT_NODE:
                  var attrs = n.attributes;
                  var len = attrs.length;
                  var nodeName = n.tagName;
                  var prefixedNodeName = nodeName;
                  if (!isHTML && !n.prefix && n.namespaceURI) {
                    var defaultNS;
                    for (var ai = 0; ai < attrs.length; ai++) {
                      if (attrs.item(ai).name === "xmlns") {
                        defaultNS = attrs.item(ai).value;
                        break;
                      }
                    }
                    if (!defaultNS) {
                      for (var nsi = namespaces.length - 1; nsi >= 0; nsi--) {
                        var nsEntry = namespaces[nsi];
                        if (nsEntry.prefix === "" && nsEntry.namespace === n.namespaceURI) {
                          defaultNS = nsEntry.namespace;
                          break;
                        }
                      }
                    }
                    if (defaultNS !== n.namespaceURI) {
                      for (var nsi = namespaces.length - 1; nsi >= 0; nsi--) {
                        var nsEntry = namespaces[nsi];
                        if (nsEntry.namespace === n.namespaceURI) {
                          if (nsEntry.prefix) {
                            prefixedNodeName = nsEntry.prefix + ":" + nodeName;
                          }
                          break;
                        }
                      }
                    }
                  }
                  if (requireWellFormed && !g.QName_exact.test(prefixedNodeName)) {
                    throw new DOMException(
                      'The element name "' + prefixedNodeName + '" is not a valid XML QName',
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  buf.push("<", prefixedNodeName);
                  var childNamespaces = namespaces.slice();
                  for (var i = 0; i < len; i++) {
                    var attr = attrs.item(i);
                    if (attr.prefix == "xmlns") {
                      childNamespaces.push({
                        prefix: attr.localName,
                        namespace: attr.value
                      });
                    } else if (attr.nodeName == "xmlns") {
                      childNamespaces.push({ prefix: "", namespace: attr.value });
                    }
                  }
                  for (var i = 0; i < len; i++) {
                    var attr = attrs.item(i);
                    if (needNamespaceDefine(attr, isHTML, childNamespaces)) {
                      var attrPrefix = attr.prefix || "";
                      var uri = attr.namespaceURI;
                      addSerializedAttribute(buf, attrPrefix ? "xmlns:" + attrPrefix : "xmlns", uri, requireWellFormed);
                      childNamespaces.push({ prefix: attrPrefix, namespace: uri });
                    }
                    var filteredAttr = nodeFilter ? nodeFilter(attr) : attr;
                    if (filteredAttr) {
                      if (typeof filteredAttr === "string") {
                        buf.push(filteredAttr);
                      } else {
                        addSerializedAttribute(buf, filteredAttr.name, filteredAttr.value, requireWellFormed);
                      }
                    }
                  }
                  if (nodeName === prefixedNodeName && needNamespaceDefine(n, isHTML, childNamespaces)) {
                    var nodePrefix = n.prefix || "";
                    var uri = n.namespaceURI;
                    addSerializedAttribute(buf, nodePrefix ? "xmlns:" + nodePrefix : "xmlns", uri, requireWellFormed);
                    childNamespaces.push({ prefix: nodePrefix, namespace: uri });
                  }
                  var canCloseTag = !n.firstChild;
                  if (canCloseTag && (isHTML || n.namespaceURI === NAMESPACE.HTML)) {
                    canCloseTag = isHTMLVoidElement(nodeName);
                  }
                  if (canCloseTag) {
                    buf.push("/>");
                    return null;
                  }
                  buf.push(">");
                  if (isHTML && isHTMLRawTextElement(nodeName)) {
                    var child = n.firstChild;
                    while (child) {
                      if (child.data) {
                        buf.push(child.data);
                      } else {
                        serializeToString(child, buf, childNamespaces.slice(), opts);
                      }
                      child = child.nextSibling;
                    }
                    buf.push("</", prefixedNodeName, ">");
                    return null;
                  }
                  return { ns: childNamespaces, tag: prefixedNodeName };
                case DOCUMENT_NODE:
                case DOCUMENT_FRAGMENT_NODE:
                  if (requireWellFormed && n.nodeType === DOCUMENT_NODE && n.documentElement == null) {
                    throw new DOMException("The Document has no documentElement", DOMExceptionName.InvalidStateError);
                  }
                  return { ns: namespaces };
                case ATTRIBUTE_NODE:
                  addSerializedAttribute(buf, n.name, n.value, requireWellFormed);
                  return null;
                case TEXT_NODE:
                  if (requireWellFormed && g.InvalidChar.test(n.data)) {
                    throw new DOMException(
                      "The Text node data contains characters outside the XML Char production",
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  buf.push(n.data.replace(/[<&>]/g, _xmlEncoder));
                  return null;
                case CDATA_SECTION_NODE:
                  if (requireWellFormed && n.data.indexOf("]]>") !== -1) {
                    throw new DOMException('The CDATASection data contains "]]>"', DOMExceptionName.InvalidStateError);
                  }
                  if (splitCDATASections) {
                    buf.push(g.CDATA_START, n.data.replace(/]]>/g, "]]]]><![CDATA[>"), g.CDATA_END);
                  } else {
                    buf.push(g.CDATA_START, n.data, g.CDATA_END);
                  }
                  return null;
                case COMMENT_NODE:
                  if (requireWellFormed) {
                    if (g.InvalidChar.test(n.data)) {
                      throw new DOMException(
                        "The comment node data contains characters outside the XML Char production",
                        DOMExceptionName.InvalidStateError
                      );
                    }
                    if (n.data.indexOf("--") !== -1 || n.data[n.data.length - 1] === "-") {
                      throw new DOMException(
                        'The comment node data contains "--" or ends with "-"',
                        DOMExceptionName.InvalidStateError
                      );
                    }
                  }
                  buf.push(g.COMMENT_START, n.data, g.COMMENT_END);
                  return null;
                case DOCUMENT_TYPE_NODE:
                  var pubid = n.publicId;
                  var sysid = n.systemId;
                  if (requireWellFormed) {
                    if (!g.Name_exact.test(n.name)) {
                      throw new DOMException(
                        'The doctype name "' + n.name + '" is not a valid XML Name',
                        DOMExceptionName.InvalidStateError
                      );
                    }
                    if (pubid && !g.PubidLiteral_match.test(pubid)) {
                      throw new DOMException("DocumentType publicId is not a valid PubidLiteral", DOMExceptionName.InvalidStateError);
                    }
                    if (sysid && sysid !== "." && !g.SystemLiteral_match.test(sysid)) {
                      throw new DOMException("DocumentType systemId is not a valid SystemLiteral", DOMExceptionName.InvalidStateError);
                    }
                    if (n.internalSubset && n.internalSubset.indexOf("]>") !== -1) {
                      throw new DOMException('DocumentType internalSubset contains "]>"', DOMExceptionName.InvalidStateError);
                    }
                  }
                  buf.push(g.DOCTYPE_DECL_START, " ", n.name);
                  if (pubid) {
                    buf.push(" ", g.PUBLIC, " ", pubid);
                    if (sysid && sysid !== ".") {
                      buf.push(" ", sysid);
                    }
                  } else if (sysid && sysid !== ".") {
                    buf.push(" ", g.SYSTEM, " ", sysid);
                  }
                  if (n.internalSubset) {
                    buf.push(" [", n.internalSubset, "]");
                  }
                  buf.push(">");
                  return null;
                case PROCESSING_INSTRUCTION_NODE:
                  if (requireWellFormed) {
                    if (!g.NCName_exact.test(n.target) || n.target.toLowerCase() === "xml") {
                      throw new DOMException(
                        'The processing instruction target "' + n.target + '" is not a valid XML NCName or is reserved',
                        DOMExceptionName.InvalidStateError
                      );
                    }
                    if (g.InvalidChar.test(n.data)) {
                      throw new DOMException(
                        "The ProcessingInstruction data contains characters outside the XML Char production",
                        DOMExceptionName.InvalidStateError
                      );
                    }
                    if (n.data.indexOf("?>") !== -1) {
                      throw new DOMException('The ProcessingInstruction data contains "?>"', DOMExceptionName.InvalidStateError);
                    }
                  }
                  buf.push("<?", n.target, " ", n.data, "?>");
                  return null;
                case ENTITY_REFERENCE_NODE:
                  if (requireWellFormed && !g.Name_exact.test(n.nodeName)) {
                    throw new DOMException(
                      'The entity reference name "' + n.nodeName + '" is not a valid XML Name',
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  buf.push("&", n.nodeName, ";");
                  return null;
                //case ENTITY_NODE:
                //case NOTATION_NODE:
                default:
                  buf.push("??", n.nodeName);
                  return null;
              }
            },
            exit: function(n, childCtx) {
              if (childCtx && childCtx.tag) {
                buf.push("</", childCtx.tag, ">");
              }
            }
          }
        );
      }
      function importNode(doc, node, deep) {
        var destRoot;
        walkDOM(node, null, {
          enter: function(srcNode, destParent) {
            var destNode = srcNode.cloneNode(false);
            destNode.ownerDocument = doc;
            destNode.parentNode = null;
            if (destParent === null) {
              destRoot = destNode;
            } else {
              destParent.appendChild(destNode);
            }
            var shouldDeep = srcNode.nodeType === ATTRIBUTE_NODE || deep;
            return shouldDeep ? destNode : null;
          }
        });
        return destRoot;
      }
      function cloneNode(doc, node, deep) {
        var destRoot;
        walkDOM(node, null, {
          enter: function(srcNode, destParent) {
            var destNode = new srcNode.constructor(PDC);
            for (var n in srcNode) {
              if (hasOwn(srcNode, n)) {
                var v = srcNode[n];
                if (typeof v != "object") {
                  if (v != destNode[n]) {
                    destNode[n] = v;
                  }
                }
              }
            }
            if (srcNode.childNodes) {
              destNode.childNodes = new NodeList();
            }
            destNode.ownerDocument = doc;
            var shouldDeep = deep;
            switch (destNode.nodeType) {
              case ELEMENT_NODE:
                var attrs = srcNode.attributes;
                var attrs2 = destNode.attributes = new NamedNodeMap();
                var len = attrs.length;
                attrs2._ownerElement = destNode;
                for (var i = 0; i < len; i++) {
                  destNode.setAttributeNode(cloneNode(doc, attrs.item(i), true));
                }
                break;
              case ATTRIBUTE_NODE:
                shouldDeep = true;
            }
            if (destParent !== null) {
              destParent.appendChild(destNode);
            } else {
              destRoot = destNode;
            }
            return shouldDeep ? destNode : null;
          }
        });
        return destRoot;
      }
      function __set__(object, key, value) {
        object[key] = value;
      }
      function childrenRefresh(node) {
        var ls = [];
        var child = node.firstChild;
        while (child) {
          if (child.nodeType === ELEMENT_NODE) {
            ls.push(child);
          }
          child = child.nextSibling;
        }
        return ls;
      }
      try {
        if (Object.defineProperty) {
          Object.defineProperty(LiveNodeList.prototype, "length", {
            get: function() {
              _updateLiveList(this);
              return this.$$length;
            }
          });
          Object.defineProperty(Node.prototype, "textContent", {
            get: function() {
              if (this.nodeType === ELEMENT_NODE || this.nodeType === DOCUMENT_FRAGMENT_NODE) {
                var buf = [];
                walkDOM(this, null, {
                  enter: function(n) {
                    if (n.nodeType === ELEMENT_NODE || n.nodeType === DOCUMENT_FRAGMENT_NODE) {
                      return true;
                    }
                    if (n.nodeType === PROCESSING_INSTRUCTION_NODE || n.nodeType === COMMENT_NODE) {
                      return null;
                    }
                    buf.push(n.nodeValue);
                  }
                });
                return buf.join("");
              }
              return this.nodeValue;
            },
            set: function(data) {
              switch (this.nodeType) {
                case ELEMENT_NODE:
                case DOCUMENT_FRAGMENT_NODE:
                  while (this.firstChild) {
                    this.removeChild(this.firstChild);
                  }
                  if (data || String(data)) {
                    this.appendChild(this.ownerDocument.createTextNode(data));
                  }
                  break;
                default:
                  this.data = data;
                  this.value = data;
                  this.nodeValue = data;
              }
            }
          });
          Object.defineProperty(CharacterData.prototype, "data", {
            get: function() {
              return this._data != null ? this._data : "";
            },
            set: function(v) {
              this._data = v;
              this.length = typeof v === "string" ? v.length : 0;
            }
          });
          Object.defineProperty(CharacterData.prototype, "nodeValue", {
            get: function() {
              return this.data;
            },
            set: function(v) {
              this.data = v;
            },
            enumerable: true,
            configurable: true
          });
          Object.defineProperty(Element.prototype, "children", {
            get: function() {
              return new LiveNodeList(this, childrenRefresh);
            }
          });
          Object.defineProperty(Document.prototype, "children", {
            get: function() {
              return new LiveNodeList(this, childrenRefresh);
            }
          });
          Object.defineProperty(DocumentFragment.prototype, "children", {
            get: function() {
              return new LiveNodeList(this, childrenRefresh);
            }
          });
          __set__ = function(object, key, value) {
            object["$$" + key] = value;
          };
        }
      } catch (e) {
      }
      exports._updateLiveList = _updateLiveList;
      exports.Attr = Attr;
      exports.CDATASection = CDATASection;
      exports.CharacterData = CharacterData;
      exports.Comment = Comment;
      exports.Document = Document;
      exports.DocumentFragment = DocumentFragment;
      exports.DocumentType = DocumentType;
      exports.DOMImplementation = DOMImplementation;
      exports.Element = Element;
      exports.Entity = Entity;
      exports.EntityReference = EntityReference;
      exports.LiveNodeList = LiveNodeList;
      exports.NamedNodeMap = NamedNodeMap;
      exports.Node = Node;
      exports.NodeList = NodeList;
      exports.Notation = Notation;
      exports.Text = Text;
      exports.ProcessingInstruction = ProcessingInstruction;
      exports.walkDOM = walkDOM;
      exports.XMLSerializer = XMLSerializer;
    }
  });

  // node_modules/@xmldom/xmldom/lib/entities.js
  var require_entities = __commonJS({
    "node_modules/@xmldom/xmldom/lib/entities.js"(exports) {
      "use strict";
      var freeze = require_conventions().freeze;
      exports.XML_ENTITIES = freeze({
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        quot: '"'
      });
      exports.HTML_ENTITIES = freeze({
        Aacute: "\xC1",
        aacute: "\xE1",
        Abreve: "\u0102",
        abreve: "\u0103",
        ac: "\u223E",
        acd: "\u223F",
        acE: "\u223E\u0333",
        Acirc: "\xC2",
        acirc: "\xE2",
        acute: "\xB4",
        Acy: "\u0410",
        acy: "\u0430",
        AElig: "\xC6",
        aelig: "\xE6",
        af: "\u2061",
        Afr: "\u{1D504}",
        afr: "\u{1D51E}",
        Agrave: "\xC0",
        agrave: "\xE0",
        alefsym: "\u2135",
        aleph: "\u2135",
        Alpha: "\u0391",
        alpha: "\u03B1",
        Amacr: "\u0100",
        amacr: "\u0101",
        amalg: "\u2A3F",
        AMP: "&",
        amp: "&",
        And: "\u2A53",
        and: "\u2227",
        andand: "\u2A55",
        andd: "\u2A5C",
        andslope: "\u2A58",
        andv: "\u2A5A",
        ang: "\u2220",
        ange: "\u29A4",
        angle: "\u2220",
        angmsd: "\u2221",
        angmsdaa: "\u29A8",
        angmsdab: "\u29A9",
        angmsdac: "\u29AA",
        angmsdad: "\u29AB",
        angmsdae: "\u29AC",
        angmsdaf: "\u29AD",
        angmsdag: "\u29AE",
        angmsdah: "\u29AF",
        angrt: "\u221F",
        angrtvb: "\u22BE",
        angrtvbd: "\u299D",
        angsph: "\u2222",
        angst: "\xC5",
        angzarr: "\u237C",
        Aogon: "\u0104",
        aogon: "\u0105",
        Aopf: "\u{1D538}",
        aopf: "\u{1D552}",
        ap: "\u2248",
        apacir: "\u2A6F",
        apE: "\u2A70",
        ape: "\u224A",
        apid: "\u224B",
        apos: "'",
        ApplyFunction: "\u2061",
        approx: "\u2248",
        approxeq: "\u224A",
        Aring: "\xC5",
        aring: "\xE5",
        Ascr: "\u{1D49C}",
        ascr: "\u{1D4B6}",
        Assign: "\u2254",
        ast: "*",
        asymp: "\u2248",
        asympeq: "\u224D",
        Atilde: "\xC3",
        atilde: "\xE3",
        Auml: "\xC4",
        auml: "\xE4",
        awconint: "\u2233",
        awint: "\u2A11",
        backcong: "\u224C",
        backepsilon: "\u03F6",
        backprime: "\u2035",
        backsim: "\u223D",
        backsimeq: "\u22CD",
        Backslash: "\u2216",
        Barv: "\u2AE7",
        barvee: "\u22BD",
        Barwed: "\u2306",
        barwed: "\u2305",
        barwedge: "\u2305",
        bbrk: "\u23B5",
        bbrktbrk: "\u23B6",
        bcong: "\u224C",
        Bcy: "\u0411",
        bcy: "\u0431",
        bdquo: "\u201E",
        becaus: "\u2235",
        Because: "\u2235",
        because: "\u2235",
        bemptyv: "\u29B0",
        bepsi: "\u03F6",
        bernou: "\u212C",
        Bernoullis: "\u212C",
        Beta: "\u0392",
        beta: "\u03B2",
        beth: "\u2136",
        between: "\u226C",
        Bfr: "\u{1D505}",
        bfr: "\u{1D51F}",
        bigcap: "\u22C2",
        bigcirc: "\u25EF",
        bigcup: "\u22C3",
        bigodot: "\u2A00",
        bigoplus: "\u2A01",
        bigotimes: "\u2A02",
        bigsqcup: "\u2A06",
        bigstar: "\u2605",
        bigtriangledown: "\u25BD",
        bigtriangleup: "\u25B3",
        biguplus: "\u2A04",
        bigvee: "\u22C1",
        bigwedge: "\u22C0",
        bkarow: "\u290D",
        blacklozenge: "\u29EB",
        blacksquare: "\u25AA",
        blacktriangle: "\u25B4",
        blacktriangledown: "\u25BE",
        blacktriangleleft: "\u25C2",
        blacktriangleright: "\u25B8",
        blank: "\u2423",
        blk12: "\u2592",
        blk14: "\u2591",
        blk34: "\u2593",
        block: "\u2588",
        bne: "=\u20E5",
        bnequiv: "\u2261\u20E5",
        bNot: "\u2AED",
        bnot: "\u2310",
        Bopf: "\u{1D539}",
        bopf: "\u{1D553}",
        bot: "\u22A5",
        bottom: "\u22A5",
        bowtie: "\u22C8",
        boxbox: "\u29C9",
        boxDL: "\u2557",
        boxDl: "\u2556",
        boxdL: "\u2555",
        boxdl: "\u2510",
        boxDR: "\u2554",
        boxDr: "\u2553",
        boxdR: "\u2552",
        boxdr: "\u250C",
        boxH: "\u2550",
        boxh: "\u2500",
        boxHD: "\u2566",
        boxHd: "\u2564",
        boxhD: "\u2565",
        boxhd: "\u252C",
        boxHU: "\u2569",
        boxHu: "\u2567",
        boxhU: "\u2568",
        boxhu: "\u2534",
        boxminus: "\u229F",
        boxplus: "\u229E",
        boxtimes: "\u22A0",
        boxUL: "\u255D",
        boxUl: "\u255C",
        boxuL: "\u255B",
        boxul: "\u2518",
        boxUR: "\u255A",
        boxUr: "\u2559",
        boxuR: "\u2558",
        boxur: "\u2514",
        boxV: "\u2551",
        boxv: "\u2502",
        boxVH: "\u256C",
        boxVh: "\u256B",
        boxvH: "\u256A",
        boxvh: "\u253C",
        boxVL: "\u2563",
        boxVl: "\u2562",
        boxvL: "\u2561",
        boxvl: "\u2524",
        boxVR: "\u2560",
        boxVr: "\u255F",
        boxvR: "\u255E",
        boxvr: "\u251C",
        bprime: "\u2035",
        Breve: "\u02D8",
        breve: "\u02D8",
        brvbar: "\xA6",
        Bscr: "\u212C",
        bscr: "\u{1D4B7}",
        bsemi: "\u204F",
        bsim: "\u223D",
        bsime: "\u22CD",
        bsol: "\\",
        bsolb: "\u29C5",
        bsolhsub: "\u27C8",
        bull: "\u2022",
        bullet: "\u2022",
        bump: "\u224E",
        bumpE: "\u2AAE",
        bumpe: "\u224F",
        Bumpeq: "\u224E",
        bumpeq: "\u224F",
        Cacute: "\u0106",
        cacute: "\u0107",
        Cap: "\u22D2",
        cap: "\u2229",
        capand: "\u2A44",
        capbrcup: "\u2A49",
        capcap: "\u2A4B",
        capcup: "\u2A47",
        capdot: "\u2A40",
        CapitalDifferentialD: "\u2145",
        caps: "\u2229\uFE00",
        caret: "\u2041",
        caron: "\u02C7",
        Cayleys: "\u212D",
        ccaps: "\u2A4D",
        Ccaron: "\u010C",
        ccaron: "\u010D",
        Ccedil: "\xC7",
        ccedil: "\xE7",
        Ccirc: "\u0108",
        ccirc: "\u0109",
        Cconint: "\u2230",
        ccups: "\u2A4C",
        ccupssm: "\u2A50",
        Cdot: "\u010A",
        cdot: "\u010B",
        cedil: "\xB8",
        Cedilla: "\xB8",
        cemptyv: "\u29B2",
        cent: "\xA2",
        CenterDot: "\xB7",
        centerdot: "\xB7",
        Cfr: "\u212D",
        cfr: "\u{1D520}",
        CHcy: "\u0427",
        chcy: "\u0447",
        check: "\u2713",
        checkmark: "\u2713",
        Chi: "\u03A7",
        chi: "\u03C7",
        cir: "\u25CB",
        circ: "\u02C6",
        circeq: "\u2257",
        circlearrowleft: "\u21BA",
        circlearrowright: "\u21BB",
        circledast: "\u229B",
        circledcirc: "\u229A",
        circleddash: "\u229D",
        CircleDot: "\u2299",
        circledR: "\xAE",
        circledS: "\u24C8",
        CircleMinus: "\u2296",
        CirclePlus: "\u2295",
        CircleTimes: "\u2297",
        cirE: "\u29C3",
        cire: "\u2257",
        cirfnint: "\u2A10",
        cirmid: "\u2AEF",
        cirscir: "\u29C2",
        ClockwiseContourIntegral: "\u2232",
        CloseCurlyDoubleQuote: "\u201D",
        CloseCurlyQuote: "\u2019",
        clubs: "\u2663",
        clubsuit: "\u2663",
        Colon: "\u2237",
        colon: ":",
        Colone: "\u2A74",
        colone: "\u2254",
        coloneq: "\u2254",
        comma: ",",
        commat: "@",
        comp: "\u2201",
        compfn: "\u2218",
        complement: "\u2201",
        complexes: "\u2102",
        cong: "\u2245",
        congdot: "\u2A6D",
        Congruent: "\u2261",
        Conint: "\u222F",
        conint: "\u222E",
        ContourIntegral: "\u222E",
        Copf: "\u2102",
        copf: "\u{1D554}",
        coprod: "\u2210",
        Coproduct: "\u2210",
        COPY: "\xA9",
        copy: "\xA9",
        copysr: "\u2117",
        CounterClockwiseContourIntegral: "\u2233",
        crarr: "\u21B5",
        Cross: "\u2A2F",
        cross: "\u2717",
        Cscr: "\u{1D49E}",
        cscr: "\u{1D4B8}",
        csub: "\u2ACF",
        csube: "\u2AD1",
        csup: "\u2AD0",
        csupe: "\u2AD2",
        ctdot: "\u22EF",
        cudarrl: "\u2938",
        cudarrr: "\u2935",
        cuepr: "\u22DE",
        cuesc: "\u22DF",
        cularr: "\u21B6",
        cularrp: "\u293D",
        Cup: "\u22D3",
        cup: "\u222A",
        cupbrcap: "\u2A48",
        CupCap: "\u224D",
        cupcap: "\u2A46",
        cupcup: "\u2A4A",
        cupdot: "\u228D",
        cupor: "\u2A45",
        cups: "\u222A\uFE00",
        curarr: "\u21B7",
        curarrm: "\u293C",
        curlyeqprec: "\u22DE",
        curlyeqsucc: "\u22DF",
        curlyvee: "\u22CE",
        curlywedge: "\u22CF",
        curren: "\xA4",
        curvearrowleft: "\u21B6",
        curvearrowright: "\u21B7",
        cuvee: "\u22CE",
        cuwed: "\u22CF",
        cwconint: "\u2232",
        cwint: "\u2231",
        cylcty: "\u232D",
        Dagger: "\u2021",
        dagger: "\u2020",
        daleth: "\u2138",
        Darr: "\u21A1",
        dArr: "\u21D3",
        darr: "\u2193",
        dash: "\u2010",
        Dashv: "\u2AE4",
        dashv: "\u22A3",
        dbkarow: "\u290F",
        dblac: "\u02DD",
        Dcaron: "\u010E",
        dcaron: "\u010F",
        Dcy: "\u0414",
        dcy: "\u0434",
        DD: "\u2145",
        dd: "\u2146",
        ddagger: "\u2021",
        ddarr: "\u21CA",
        DDotrahd: "\u2911",
        ddotseq: "\u2A77",
        deg: "\xB0",
        Del: "\u2207",
        Delta: "\u0394",
        delta: "\u03B4",
        demptyv: "\u29B1",
        dfisht: "\u297F",
        Dfr: "\u{1D507}",
        dfr: "\u{1D521}",
        dHar: "\u2965",
        dharl: "\u21C3",
        dharr: "\u21C2",
        DiacriticalAcute: "\xB4",
        DiacriticalDot: "\u02D9",
        DiacriticalDoubleAcute: "\u02DD",
        DiacriticalGrave: "`",
        DiacriticalTilde: "\u02DC",
        diam: "\u22C4",
        Diamond: "\u22C4",
        diamond: "\u22C4",
        diamondsuit: "\u2666",
        diams: "\u2666",
        die: "\xA8",
        DifferentialD: "\u2146",
        digamma: "\u03DD",
        disin: "\u22F2",
        div: "\xF7",
        divide: "\xF7",
        divideontimes: "\u22C7",
        divonx: "\u22C7",
        DJcy: "\u0402",
        djcy: "\u0452",
        dlcorn: "\u231E",
        dlcrop: "\u230D",
        dollar: "$",
        Dopf: "\u{1D53B}",
        dopf: "\u{1D555}",
        Dot: "\xA8",
        dot: "\u02D9",
        DotDot: "\u20DC",
        doteq: "\u2250",
        doteqdot: "\u2251",
        DotEqual: "\u2250",
        dotminus: "\u2238",
        dotplus: "\u2214",
        dotsquare: "\u22A1",
        doublebarwedge: "\u2306",
        DoubleContourIntegral: "\u222F",
        DoubleDot: "\xA8",
        DoubleDownArrow: "\u21D3",
        DoubleLeftArrow: "\u21D0",
        DoubleLeftRightArrow: "\u21D4",
        DoubleLeftTee: "\u2AE4",
        DoubleLongLeftArrow: "\u27F8",
        DoubleLongLeftRightArrow: "\u27FA",
        DoubleLongRightArrow: "\u27F9",
        DoubleRightArrow: "\u21D2",
        DoubleRightTee: "\u22A8",
        DoubleUpArrow: "\u21D1",
        DoubleUpDownArrow: "\u21D5",
        DoubleVerticalBar: "\u2225",
        DownArrow: "\u2193",
        Downarrow: "\u21D3",
        downarrow: "\u2193",
        DownArrowBar: "\u2913",
        DownArrowUpArrow: "\u21F5",
        DownBreve: "\u0311",
        downdownarrows: "\u21CA",
        downharpoonleft: "\u21C3",
        downharpoonright: "\u21C2",
        DownLeftRightVector: "\u2950",
        DownLeftTeeVector: "\u295E",
        DownLeftVector: "\u21BD",
        DownLeftVectorBar: "\u2956",
        DownRightTeeVector: "\u295F",
        DownRightVector: "\u21C1",
        DownRightVectorBar: "\u2957",
        DownTee: "\u22A4",
        DownTeeArrow: "\u21A7",
        drbkarow: "\u2910",
        drcorn: "\u231F",
        drcrop: "\u230C",
        Dscr: "\u{1D49F}",
        dscr: "\u{1D4B9}",
        DScy: "\u0405",
        dscy: "\u0455",
        dsol: "\u29F6",
        Dstrok: "\u0110",
        dstrok: "\u0111",
        dtdot: "\u22F1",
        dtri: "\u25BF",
        dtrif: "\u25BE",
        duarr: "\u21F5",
        duhar: "\u296F",
        dwangle: "\u29A6",
        DZcy: "\u040F",
        dzcy: "\u045F",
        dzigrarr: "\u27FF",
        Eacute: "\xC9",
        eacute: "\xE9",
        easter: "\u2A6E",
        Ecaron: "\u011A",
        ecaron: "\u011B",
        ecir: "\u2256",
        Ecirc: "\xCA",
        ecirc: "\xEA",
        ecolon: "\u2255",
        Ecy: "\u042D",
        ecy: "\u044D",
        eDDot: "\u2A77",
        Edot: "\u0116",
        eDot: "\u2251",
        edot: "\u0117",
        ee: "\u2147",
        efDot: "\u2252",
        Efr: "\u{1D508}",
        efr: "\u{1D522}",
        eg: "\u2A9A",
        Egrave: "\xC8",
        egrave: "\xE8",
        egs: "\u2A96",
        egsdot: "\u2A98",
        el: "\u2A99",
        Element: "\u2208",
        elinters: "\u23E7",
        ell: "\u2113",
        els: "\u2A95",
        elsdot: "\u2A97",
        Emacr: "\u0112",
        emacr: "\u0113",
        empty: "\u2205",
        emptyset: "\u2205",
        EmptySmallSquare: "\u25FB",
        emptyv: "\u2205",
        EmptyVerySmallSquare: "\u25AB",
        emsp: "\u2003",
        emsp13: "\u2004",
        emsp14: "\u2005",
        ENG: "\u014A",
        eng: "\u014B",
        ensp: "\u2002",
        Eogon: "\u0118",
        eogon: "\u0119",
        Eopf: "\u{1D53C}",
        eopf: "\u{1D556}",
        epar: "\u22D5",
        eparsl: "\u29E3",
        eplus: "\u2A71",
        epsi: "\u03B5",
        Epsilon: "\u0395",
        epsilon: "\u03B5",
        epsiv: "\u03F5",
        eqcirc: "\u2256",
        eqcolon: "\u2255",
        eqsim: "\u2242",
        eqslantgtr: "\u2A96",
        eqslantless: "\u2A95",
        Equal: "\u2A75",
        equals: "=",
        EqualTilde: "\u2242",
        equest: "\u225F",
        Equilibrium: "\u21CC",
        equiv: "\u2261",
        equivDD: "\u2A78",
        eqvparsl: "\u29E5",
        erarr: "\u2971",
        erDot: "\u2253",
        Escr: "\u2130",
        escr: "\u212F",
        esdot: "\u2250",
        Esim: "\u2A73",
        esim: "\u2242",
        Eta: "\u0397",
        eta: "\u03B7",
        ETH: "\xD0",
        eth: "\xF0",
        Euml: "\xCB",
        euml: "\xEB",
        euro: "\u20AC",
        excl: "!",
        exist: "\u2203",
        Exists: "\u2203",
        expectation: "\u2130",
        ExponentialE: "\u2147",
        exponentiale: "\u2147",
        fallingdotseq: "\u2252",
        Fcy: "\u0424",
        fcy: "\u0444",
        female: "\u2640",
        ffilig: "\uFB03",
        fflig: "\uFB00",
        ffllig: "\uFB04",
        Ffr: "\u{1D509}",
        ffr: "\u{1D523}",
        filig: "\uFB01",
        FilledSmallSquare: "\u25FC",
        FilledVerySmallSquare: "\u25AA",
        fjlig: "fj",
        flat: "\u266D",
        fllig: "\uFB02",
        fltns: "\u25B1",
        fnof: "\u0192",
        Fopf: "\u{1D53D}",
        fopf: "\u{1D557}",
        ForAll: "\u2200",
        forall: "\u2200",
        fork: "\u22D4",
        forkv: "\u2AD9",
        Fouriertrf: "\u2131",
        fpartint: "\u2A0D",
        frac12: "\xBD",
        frac13: "\u2153",
        frac14: "\xBC",
        frac15: "\u2155",
        frac16: "\u2159",
        frac18: "\u215B",
        frac23: "\u2154",
        frac25: "\u2156",
        frac34: "\xBE",
        frac35: "\u2157",
        frac38: "\u215C",
        frac45: "\u2158",
        frac56: "\u215A",
        frac58: "\u215D",
        frac78: "\u215E",
        frasl: "\u2044",
        frown: "\u2322",
        Fscr: "\u2131",
        fscr: "\u{1D4BB}",
        gacute: "\u01F5",
        Gamma: "\u0393",
        gamma: "\u03B3",
        Gammad: "\u03DC",
        gammad: "\u03DD",
        gap: "\u2A86",
        Gbreve: "\u011E",
        gbreve: "\u011F",
        Gcedil: "\u0122",
        Gcirc: "\u011C",
        gcirc: "\u011D",
        Gcy: "\u0413",
        gcy: "\u0433",
        Gdot: "\u0120",
        gdot: "\u0121",
        gE: "\u2267",
        ge: "\u2265",
        gEl: "\u2A8C",
        gel: "\u22DB",
        geq: "\u2265",
        geqq: "\u2267",
        geqslant: "\u2A7E",
        ges: "\u2A7E",
        gescc: "\u2AA9",
        gesdot: "\u2A80",
        gesdoto: "\u2A82",
        gesdotol: "\u2A84",
        gesl: "\u22DB\uFE00",
        gesles: "\u2A94",
        Gfr: "\u{1D50A}",
        gfr: "\u{1D524}",
        Gg: "\u22D9",
        gg: "\u226B",
        ggg: "\u22D9",
        gimel: "\u2137",
        GJcy: "\u0403",
        gjcy: "\u0453",
        gl: "\u2277",
        gla: "\u2AA5",
        glE: "\u2A92",
        glj: "\u2AA4",
        gnap: "\u2A8A",
        gnapprox: "\u2A8A",
        gnE: "\u2269",
        gne: "\u2A88",
        gneq: "\u2A88",
        gneqq: "\u2269",
        gnsim: "\u22E7",
        Gopf: "\u{1D53E}",
        gopf: "\u{1D558}",
        grave: "`",
        GreaterEqual: "\u2265",
        GreaterEqualLess: "\u22DB",
        GreaterFullEqual: "\u2267",
        GreaterGreater: "\u2AA2",
        GreaterLess: "\u2277",
        GreaterSlantEqual: "\u2A7E",
        GreaterTilde: "\u2273",
        Gscr: "\u{1D4A2}",
        gscr: "\u210A",
        gsim: "\u2273",
        gsime: "\u2A8E",
        gsiml: "\u2A90",
        Gt: "\u226B",
        GT: ">",
        gt: ">",
        gtcc: "\u2AA7",
        gtcir: "\u2A7A",
        gtdot: "\u22D7",
        gtlPar: "\u2995",
        gtquest: "\u2A7C",
        gtrapprox: "\u2A86",
        gtrarr: "\u2978",
        gtrdot: "\u22D7",
        gtreqless: "\u22DB",
        gtreqqless: "\u2A8C",
        gtrless: "\u2277",
        gtrsim: "\u2273",
        gvertneqq: "\u2269\uFE00",
        gvnE: "\u2269\uFE00",
        Hacek: "\u02C7",
        hairsp: "\u200A",
        half: "\xBD",
        hamilt: "\u210B",
        HARDcy: "\u042A",
        hardcy: "\u044A",
        hArr: "\u21D4",
        harr: "\u2194",
        harrcir: "\u2948",
        harrw: "\u21AD",
        Hat: "^",
        hbar: "\u210F",
        Hcirc: "\u0124",
        hcirc: "\u0125",
        hearts: "\u2665",
        heartsuit: "\u2665",
        hellip: "\u2026",
        hercon: "\u22B9",
        Hfr: "\u210C",
        hfr: "\u{1D525}",
        HilbertSpace: "\u210B",
        hksearow: "\u2925",
        hkswarow: "\u2926",
        hoarr: "\u21FF",
        homtht: "\u223B",
        hookleftarrow: "\u21A9",
        hookrightarrow: "\u21AA",
        Hopf: "\u210D",
        hopf: "\u{1D559}",
        horbar: "\u2015",
        HorizontalLine: "\u2500",
        Hscr: "\u210B",
        hscr: "\u{1D4BD}",
        hslash: "\u210F",
        Hstrok: "\u0126",
        hstrok: "\u0127",
        HumpDownHump: "\u224E",
        HumpEqual: "\u224F",
        hybull: "\u2043",
        hyphen: "\u2010",
        Iacute: "\xCD",
        iacute: "\xED",
        ic: "\u2063",
        Icirc: "\xCE",
        icirc: "\xEE",
        Icy: "\u0418",
        icy: "\u0438",
        Idot: "\u0130",
        IEcy: "\u0415",
        iecy: "\u0435",
        iexcl: "\xA1",
        iff: "\u21D4",
        Ifr: "\u2111",
        ifr: "\u{1D526}",
        Igrave: "\xCC",
        igrave: "\xEC",
        ii: "\u2148",
        iiiint: "\u2A0C",
        iiint: "\u222D",
        iinfin: "\u29DC",
        iiota: "\u2129",
        IJlig: "\u0132",
        ijlig: "\u0133",
        Im: "\u2111",
        Imacr: "\u012A",
        imacr: "\u012B",
        image: "\u2111",
        ImaginaryI: "\u2148",
        imagline: "\u2110",
        imagpart: "\u2111",
        imath: "\u0131",
        imof: "\u22B7",
        imped: "\u01B5",
        Implies: "\u21D2",
        in: "\u2208",
        incare: "\u2105",
        infin: "\u221E",
        infintie: "\u29DD",
        inodot: "\u0131",
        Int: "\u222C",
        int: "\u222B",
        intcal: "\u22BA",
        integers: "\u2124",
        Integral: "\u222B",
        intercal: "\u22BA",
        Intersection: "\u22C2",
        intlarhk: "\u2A17",
        intprod: "\u2A3C",
        InvisibleComma: "\u2063",
        InvisibleTimes: "\u2062",
        IOcy: "\u0401",
        iocy: "\u0451",
        Iogon: "\u012E",
        iogon: "\u012F",
        Iopf: "\u{1D540}",
        iopf: "\u{1D55A}",
        Iota: "\u0399",
        iota: "\u03B9",
        iprod: "\u2A3C",
        iquest: "\xBF",
        Iscr: "\u2110",
        iscr: "\u{1D4BE}",
        isin: "\u2208",
        isindot: "\u22F5",
        isinE: "\u22F9",
        isins: "\u22F4",
        isinsv: "\u22F3",
        isinv: "\u2208",
        it: "\u2062",
        Itilde: "\u0128",
        itilde: "\u0129",
        Iukcy: "\u0406",
        iukcy: "\u0456",
        Iuml: "\xCF",
        iuml: "\xEF",
        Jcirc: "\u0134",
        jcirc: "\u0135",
        Jcy: "\u0419",
        jcy: "\u0439",
        Jfr: "\u{1D50D}",
        jfr: "\u{1D527}",
        jmath: "\u0237",
        Jopf: "\u{1D541}",
        jopf: "\u{1D55B}",
        Jscr: "\u{1D4A5}",
        jscr: "\u{1D4BF}",
        Jsercy: "\u0408",
        jsercy: "\u0458",
        Jukcy: "\u0404",
        jukcy: "\u0454",
        Kappa: "\u039A",
        kappa: "\u03BA",
        kappav: "\u03F0",
        Kcedil: "\u0136",
        kcedil: "\u0137",
        Kcy: "\u041A",
        kcy: "\u043A",
        Kfr: "\u{1D50E}",
        kfr: "\u{1D528}",
        kgreen: "\u0138",
        KHcy: "\u0425",
        khcy: "\u0445",
        KJcy: "\u040C",
        kjcy: "\u045C",
        Kopf: "\u{1D542}",
        kopf: "\u{1D55C}",
        Kscr: "\u{1D4A6}",
        kscr: "\u{1D4C0}",
        lAarr: "\u21DA",
        Lacute: "\u0139",
        lacute: "\u013A",
        laemptyv: "\u29B4",
        lagran: "\u2112",
        Lambda: "\u039B",
        lambda: "\u03BB",
        Lang: "\u27EA",
        lang: "\u27E8",
        langd: "\u2991",
        langle: "\u27E8",
        lap: "\u2A85",
        Laplacetrf: "\u2112",
        laquo: "\xAB",
        Larr: "\u219E",
        lArr: "\u21D0",
        larr: "\u2190",
        larrb: "\u21E4",
        larrbfs: "\u291F",
        larrfs: "\u291D",
        larrhk: "\u21A9",
        larrlp: "\u21AB",
        larrpl: "\u2939",
        larrsim: "\u2973",
        larrtl: "\u21A2",
        lat: "\u2AAB",
        lAtail: "\u291B",
        latail: "\u2919",
        late: "\u2AAD",
        lates: "\u2AAD\uFE00",
        lBarr: "\u290E",
        lbarr: "\u290C",
        lbbrk: "\u2772",
        lbrace: "{",
        lbrack: "[",
        lbrke: "\u298B",
        lbrksld: "\u298F",
        lbrkslu: "\u298D",
        Lcaron: "\u013D",
        lcaron: "\u013E",
        Lcedil: "\u013B",
        lcedil: "\u013C",
        lceil: "\u2308",
        lcub: "{",
        Lcy: "\u041B",
        lcy: "\u043B",
        ldca: "\u2936",
        ldquo: "\u201C",
        ldquor: "\u201E",
        ldrdhar: "\u2967",
        ldrushar: "\u294B",
        ldsh: "\u21B2",
        lE: "\u2266",
        le: "\u2264",
        LeftAngleBracket: "\u27E8",
        LeftArrow: "\u2190",
        Leftarrow: "\u21D0",
        leftarrow: "\u2190",
        LeftArrowBar: "\u21E4",
        LeftArrowRightArrow: "\u21C6",
        leftarrowtail: "\u21A2",
        LeftCeiling: "\u2308",
        LeftDoubleBracket: "\u27E6",
        LeftDownTeeVector: "\u2961",
        LeftDownVector: "\u21C3",
        LeftDownVectorBar: "\u2959",
        LeftFloor: "\u230A",
        leftharpoondown: "\u21BD",
        leftharpoonup: "\u21BC",
        leftleftarrows: "\u21C7",
        LeftRightArrow: "\u2194",
        Leftrightarrow: "\u21D4",
        leftrightarrow: "\u2194",
        leftrightarrows: "\u21C6",
        leftrightharpoons: "\u21CB",
        leftrightsquigarrow: "\u21AD",
        LeftRightVector: "\u294E",
        LeftTee: "\u22A3",
        LeftTeeArrow: "\u21A4",
        LeftTeeVector: "\u295A",
        leftthreetimes: "\u22CB",
        LeftTriangle: "\u22B2",
        LeftTriangleBar: "\u29CF",
        LeftTriangleEqual: "\u22B4",
        LeftUpDownVector: "\u2951",
        LeftUpTeeVector: "\u2960",
        LeftUpVector: "\u21BF",
        LeftUpVectorBar: "\u2958",
        LeftVector: "\u21BC",
        LeftVectorBar: "\u2952",
        lEg: "\u2A8B",
        leg: "\u22DA",
        leq: "\u2264",
        leqq: "\u2266",
        leqslant: "\u2A7D",
        les: "\u2A7D",
        lescc: "\u2AA8",
        lesdot: "\u2A7F",
        lesdoto: "\u2A81",
        lesdotor: "\u2A83",
        lesg: "\u22DA\uFE00",
        lesges: "\u2A93",
        lessapprox: "\u2A85",
        lessdot: "\u22D6",
        lesseqgtr: "\u22DA",
        lesseqqgtr: "\u2A8B",
        LessEqualGreater: "\u22DA",
        LessFullEqual: "\u2266",
        LessGreater: "\u2276",
        lessgtr: "\u2276",
        LessLess: "\u2AA1",
        lesssim: "\u2272",
        LessSlantEqual: "\u2A7D",
        LessTilde: "\u2272",
        lfisht: "\u297C",
        lfloor: "\u230A",
        Lfr: "\u{1D50F}",
        lfr: "\u{1D529}",
        lg: "\u2276",
        lgE: "\u2A91",
        lHar: "\u2962",
        lhard: "\u21BD",
        lharu: "\u21BC",
        lharul: "\u296A",
        lhblk: "\u2584",
        LJcy: "\u0409",
        ljcy: "\u0459",
        Ll: "\u22D8",
        ll: "\u226A",
        llarr: "\u21C7",
        llcorner: "\u231E",
        Lleftarrow: "\u21DA",
        llhard: "\u296B",
        lltri: "\u25FA",
        Lmidot: "\u013F",
        lmidot: "\u0140",
        lmoust: "\u23B0",
        lmoustache: "\u23B0",
        lnap: "\u2A89",
        lnapprox: "\u2A89",
        lnE: "\u2268",
        lne: "\u2A87",
        lneq: "\u2A87",
        lneqq: "\u2268",
        lnsim: "\u22E6",
        loang: "\u27EC",
        loarr: "\u21FD",
        lobrk: "\u27E6",
        LongLeftArrow: "\u27F5",
        Longleftarrow: "\u27F8",
        longleftarrow: "\u27F5",
        LongLeftRightArrow: "\u27F7",
        Longleftrightarrow: "\u27FA",
        longleftrightarrow: "\u27F7",
        longmapsto: "\u27FC",
        LongRightArrow: "\u27F6",
        Longrightarrow: "\u27F9",
        longrightarrow: "\u27F6",
        looparrowleft: "\u21AB",
        looparrowright: "\u21AC",
        lopar: "\u2985",
        Lopf: "\u{1D543}",
        lopf: "\u{1D55D}",
        loplus: "\u2A2D",
        lotimes: "\u2A34",
        lowast: "\u2217",
        lowbar: "_",
        LowerLeftArrow: "\u2199",
        LowerRightArrow: "\u2198",
        loz: "\u25CA",
        lozenge: "\u25CA",
        lozf: "\u29EB",
        lpar: "(",
        lparlt: "\u2993",
        lrarr: "\u21C6",
        lrcorner: "\u231F",
        lrhar: "\u21CB",
        lrhard: "\u296D",
        lrm: "\u200E",
        lrtri: "\u22BF",
        lsaquo: "\u2039",
        Lscr: "\u2112",
        lscr: "\u{1D4C1}",
        Lsh: "\u21B0",
        lsh: "\u21B0",
        lsim: "\u2272",
        lsime: "\u2A8D",
        lsimg: "\u2A8F",
        lsqb: "[",
        lsquo: "\u2018",
        lsquor: "\u201A",
        Lstrok: "\u0141",
        lstrok: "\u0142",
        Lt: "\u226A",
        LT: "<",
        lt: "<",
        ltcc: "\u2AA6",
        ltcir: "\u2A79",
        ltdot: "\u22D6",
        lthree: "\u22CB",
        ltimes: "\u22C9",
        ltlarr: "\u2976",
        ltquest: "\u2A7B",
        ltri: "\u25C3",
        ltrie: "\u22B4",
        ltrif: "\u25C2",
        ltrPar: "\u2996",
        lurdshar: "\u294A",
        luruhar: "\u2966",
        lvertneqq: "\u2268\uFE00",
        lvnE: "\u2268\uFE00",
        macr: "\xAF",
        male: "\u2642",
        malt: "\u2720",
        maltese: "\u2720",
        Map: "\u2905",
        map: "\u21A6",
        mapsto: "\u21A6",
        mapstodown: "\u21A7",
        mapstoleft: "\u21A4",
        mapstoup: "\u21A5",
        marker: "\u25AE",
        mcomma: "\u2A29",
        Mcy: "\u041C",
        mcy: "\u043C",
        mdash: "\u2014",
        mDDot: "\u223A",
        measuredangle: "\u2221",
        MediumSpace: "\u205F",
        Mellintrf: "\u2133",
        Mfr: "\u{1D510}",
        mfr: "\u{1D52A}",
        mho: "\u2127",
        micro: "\xB5",
        mid: "\u2223",
        midast: "*",
        midcir: "\u2AF0",
        middot: "\xB7",
        minus: "\u2212",
        minusb: "\u229F",
        minusd: "\u2238",
        minusdu: "\u2A2A",
        MinusPlus: "\u2213",
        mlcp: "\u2ADB",
        mldr: "\u2026",
        mnplus: "\u2213",
        models: "\u22A7",
        Mopf: "\u{1D544}",
        mopf: "\u{1D55E}",
        mp: "\u2213",
        Mscr: "\u2133",
        mscr: "\u{1D4C2}",
        mstpos: "\u223E",
        Mu: "\u039C",
        mu: "\u03BC",
        multimap: "\u22B8",
        mumap: "\u22B8",
        nabla: "\u2207",
        Nacute: "\u0143",
        nacute: "\u0144",
        nang: "\u2220\u20D2",
        nap: "\u2249",
        napE: "\u2A70\u0338",
        napid: "\u224B\u0338",
        napos: "\u0149",
        napprox: "\u2249",
        natur: "\u266E",
        natural: "\u266E",
        naturals: "\u2115",
        nbsp: "\xA0",
        nbump: "\u224E\u0338",
        nbumpe: "\u224F\u0338",
        ncap: "\u2A43",
        Ncaron: "\u0147",
        ncaron: "\u0148",
        Ncedil: "\u0145",
        ncedil: "\u0146",
        ncong: "\u2247",
        ncongdot: "\u2A6D\u0338",
        ncup: "\u2A42",
        Ncy: "\u041D",
        ncy: "\u043D",
        ndash: "\u2013",
        ne: "\u2260",
        nearhk: "\u2924",
        neArr: "\u21D7",
        nearr: "\u2197",
        nearrow: "\u2197",
        nedot: "\u2250\u0338",
        NegativeMediumSpace: "\u200B",
        NegativeThickSpace: "\u200B",
        NegativeThinSpace: "\u200B",
        NegativeVeryThinSpace: "\u200B",
        nequiv: "\u2262",
        nesear: "\u2928",
        nesim: "\u2242\u0338",
        NestedGreaterGreater: "\u226B",
        NestedLessLess: "\u226A",
        NewLine: "\n",
        nexist: "\u2204",
        nexists: "\u2204",
        Nfr: "\u{1D511}",
        nfr: "\u{1D52B}",
        ngE: "\u2267\u0338",
        nge: "\u2271",
        ngeq: "\u2271",
        ngeqq: "\u2267\u0338",
        ngeqslant: "\u2A7E\u0338",
        nges: "\u2A7E\u0338",
        nGg: "\u22D9\u0338",
        ngsim: "\u2275",
        nGt: "\u226B\u20D2",
        ngt: "\u226F",
        ngtr: "\u226F",
        nGtv: "\u226B\u0338",
        nhArr: "\u21CE",
        nharr: "\u21AE",
        nhpar: "\u2AF2",
        ni: "\u220B",
        nis: "\u22FC",
        nisd: "\u22FA",
        niv: "\u220B",
        NJcy: "\u040A",
        njcy: "\u045A",
        nlArr: "\u21CD",
        nlarr: "\u219A",
        nldr: "\u2025",
        nlE: "\u2266\u0338",
        nle: "\u2270",
        nLeftarrow: "\u21CD",
        nleftarrow: "\u219A",
        nLeftrightarrow: "\u21CE",
        nleftrightarrow: "\u21AE",
        nleq: "\u2270",
        nleqq: "\u2266\u0338",
        nleqslant: "\u2A7D\u0338",
        nles: "\u2A7D\u0338",
        nless: "\u226E",
        nLl: "\u22D8\u0338",
        nlsim: "\u2274",
        nLt: "\u226A\u20D2",
        nlt: "\u226E",
        nltri: "\u22EA",
        nltrie: "\u22EC",
        nLtv: "\u226A\u0338",
        nmid: "\u2224",
        NoBreak: "\u2060",
        NonBreakingSpace: "\xA0",
        Nopf: "\u2115",
        nopf: "\u{1D55F}",
        Not: "\u2AEC",
        not: "\xAC",
        NotCongruent: "\u2262",
        NotCupCap: "\u226D",
        NotDoubleVerticalBar: "\u2226",
        NotElement: "\u2209",
        NotEqual: "\u2260",
        NotEqualTilde: "\u2242\u0338",
        NotExists: "\u2204",
        NotGreater: "\u226F",
        NotGreaterEqual: "\u2271",
        NotGreaterFullEqual: "\u2267\u0338",
        NotGreaterGreater: "\u226B\u0338",
        NotGreaterLess: "\u2279",
        NotGreaterSlantEqual: "\u2A7E\u0338",
        NotGreaterTilde: "\u2275",
        NotHumpDownHump: "\u224E\u0338",
        NotHumpEqual: "\u224F\u0338",
        notin: "\u2209",
        notindot: "\u22F5\u0338",
        notinE: "\u22F9\u0338",
        notinva: "\u2209",
        notinvb: "\u22F7",
        notinvc: "\u22F6",
        NotLeftTriangle: "\u22EA",
        NotLeftTriangleBar: "\u29CF\u0338",
        NotLeftTriangleEqual: "\u22EC",
        NotLess: "\u226E",
        NotLessEqual: "\u2270",
        NotLessGreater: "\u2278",
        NotLessLess: "\u226A\u0338",
        NotLessSlantEqual: "\u2A7D\u0338",
        NotLessTilde: "\u2274",
        NotNestedGreaterGreater: "\u2AA2\u0338",
        NotNestedLessLess: "\u2AA1\u0338",
        notni: "\u220C",
        notniva: "\u220C",
        notnivb: "\u22FE",
        notnivc: "\u22FD",
        NotPrecedes: "\u2280",
        NotPrecedesEqual: "\u2AAF\u0338",
        NotPrecedesSlantEqual: "\u22E0",
        NotReverseElement: "\u220C",
        NotRightTriangle: "\u22EB",
        NotRightTriangleBar: "\u29D0\u0338",
        NotRightTriangleEqual: "\u22ED",
        NotSquareSubset: "\u228F\u0338",
        NotSquareSubsetEqual: "\u22E2",
        NotSquareSuperset: "\u2290\u0338",
        NotSquareSupersetEqual: "\u22E3",
        NotSubset: "\u2282\u20D2",
        NotSubsetEqual: "\u2288",
        NotSucceeds: "\u2281",
        NotSucceedsEqual: "\u2AB0\u0338",
        NotSucceedsSlantEqual: "\u22E1",
        NotSucceedsTilde: "\u227F\u0338",
        NotSuperset: "\u2283\u20D2",
        NotSupersetEqual: "\u2289",
        NotTilde: "\u2241",
        NotTildeEqual: "\u2244",
        NotTildeFullEqual: "\u2247",
        NotTildeTilde: "\u2249",
        NotVerticalBar: "\u2224",
        npar: "\u2226",
        nparallel: "\u2226",
        nparsl: "\u2AFD\u20E5",
        npart: "\u2202\u0338",
        npolint: "\u2A14",
        npr: "\u2280",
        nprcue: "\u22E0",
        npre: "\u2AAF\u0338",
        nprec: "\u2280",
        npreceq: "\u2AAF\u0338",
        nrArr: "\u21CF",
        nrarr: "\u219B",
        nrarrc: "\u2933\u0338",
        nrarrw: "\u219D\u0338",
        nRightarrow: "\u21CF",
        nrightarrow: "\u219B",
        nrtri: "\u22EB",
        nrtrie: "\u22ED",
        nsc: "\u2281",
        nsccue: "\u22E1",
        nsce: "\u2AB0\u0338",
        Nscr: "\u{1D4A9}",
        nscr: "\u{1D4C3}",
        nshortmid: "\u2224",
        nshortparallel: "\u2226",
        nsim: "\u2241",
        nsime: "\u2244",
        nsimeq: "\u2244",
        nsmid: "\u2224",
        nspar: "\u2226",
        nsqsube: "\u22E2",
        nsqsupe: "\u22E3",
        nsub: "\u2284",
        nsubE: "\u2AC5\u0338",
        nsube: "\u2288",
        nsubset: "\u2282\u20D2",
        nsubseteq: "\u2288",
        nsubseteqq: "\u2AC5\u0338",
        nsucc: "\u2281",
        nsucceq: "\u2AB0\u0338",
        nsup: "\u2285",
        nsupE: "\u2AC6\u0338",
        nsupe: "\u2289",
        nsupset: "\u2283\u20D2",
        nsupseteq: "\u2289",
        nsupseteqq: "\u2AC6\u0338",
        ntgl: "\u2279",
        Ntilde: "\xD1",
        ntilde: "\xF1",
        ntlg: "\u2278",
        ntriangleleft: "\u22EA",
        ntrianglelefteq: "\u22EC",
        ntriangleright: "\u22EB",
        ntrianglerighteq: "\u22ED",
        Nu: "\u039D",
        nu: "\u03BD",
        num: "#",
        numero: "\u2116",
        numsp: "\u2007",
        nvap: "\u224D\u20D2",
        nVDash: "\u22AF",
        nVdash: "\u22AE",
        nvDash: "\u22AD",
        nvdash: "\u22AC",
        nvge: "\u2265\u20D2",
        nvgt: ">\u20D2",
        nvHarr: "\u2904",
        nvinfin: "\u29DE",
        nvlArr: "\u2902",
        nvle: "\u2264\u20D2",
        nvlt: "<\u20D2",
        nvltrie: "\u22B4\u20D2",
        nvrArr: "\u2903",
        nvrtrie: "\u22B5\u20D2",
        nvsim: "\u223C\u20D2",
        nwarhk: "\u2923",
        nwArr: "\u21D6",
        nwarr: "\u2196",
        nwarrow: "\u2196",
        nwnear: "\u2927",
        Oacute: "\xD3",
        oacute: "\xF3",
        oast: "\u229B",
        ocir: "\u229A",
        Ocirc: "\xD4",
        ocirc: "\xF4",
        Ocy: "\u041E",
        ocy: "\u043E",
        odash: "\u229D",
        Odblac: "\u0150",
        odblac: "\u0151",
        odiv: "\u2A38",
        odot: "\u2299",
        odsold: "\u29BC",
        OElig: "\u0152",
        oelig: "\u0153",
        ofcir: "\u29BF",
        Ofr: "\u{1D512}",
        ofr: "\u{1D52C}",
        ogon: "\u02DB",
        Ograve: "\xD2",
        ograve: "\xF2",
        ogt: "\u29C1",
        ohbar: "\u29B5",
        ohm: "\u03A9",
        oint: "\u222E",
        olarr: "\u21BA",
        olcir: "\u29BE",
        olcross: "\u29BB",
        oline: "\u203E",
        olt: "\u29C0",
        Omacr: "\u014C",
        omacr: "\u014D",
        Omega: "\u03A9",
        omega: "\u03C9",
        Omicron: "\u039F",
        omicron: "\u03BF",
        omid: "\u29B6",
        ominus: "\u2296",
        Oopf: "\u{1D546}",
        oopf: "\u{1D560}",
        opar: "\u29B7",
        OpenCurlyDoubleQuote: "\u201C",
        OpenCurlyQuote: "\u2018",
        operp: "\u29B9",
        oplus: "\u2295",
        Or: "\u2A54",
        or: "\u2228",
        orarr: "\u21BB",
        ord: "\u2A5D",
        order: "\u2134",
        orderof: "\u2134",
        ordf: "\xAA",
        ordm: "\xBA",
        origof: "\u22B6",
        oror: "\u2A56",
        orslope: "\u2A57",
        orv: "\u2A5B",
        oS: "\u24C8",
        Oscr: "\u{1D4AA}",
        oscr: "\u2134",
        Oslash: "\xD8",
        oslash: "\xF8",
        osol: "\u2298",
        Otilde: "\xD5",
        otilde: "\xF5",
        Otimes: "\u2A37",
        otimes: "\u2297",
        otimesas: "\u2A36",
        Ouml: "\xD6",
        ouml: "\xF6",
        ovbar: "\u233D",
        OverBar: "\u203E",
        OverBrace: "\u23DE",
        OverBracket: "\u23B4",
        OverParenthesis: "\u23DC",
        par: "\u2225",
        para: "\xB6",
        parallel: "\u2225",
        parsim: "\u2AF3",
        parsl: "\u2AFD",
        part: "\u2202",
        PartialD: "\u2202",
        Pcy: "\u041F",
        pcy: "\u043F",
        percnt: "%",
        period: ".",
        permil: "\u2030",
        perp: "\u22A5",
        pertenk: "\u2031",
        Pfr: "\u{1D513}",
        pfr: "\u{1D52D}",
        Phi: "\u03A6",
        phi: "\u03C6",
        phiv: "\u03D5",
        phmmat: "\u2133",
        phone: "\u260E",
        Pi: "\u03A0",
        pi: "\u03C0",
        pitchfork: "\u22D4",
        piv: "\u03D6",
        planck: "\u210F",
        planckh: "\u210E",
        plankv: "\u210F",
        plus: "+",
        plusacir: "\u2A23",
        plusb: "\u229E",
        pluscir: "\u2A22",
        plusdo: "\u2214",
        plusdu: "\u2A25",
        pluse: "\u2A72",
        PlusMinus: "\xB1",
        plusmn: "\xB1",
        plussim: "\u2A26",
        plustwo: "\u2A27",
        pm: "\xB1",
        Poincareplane: "\u210C",
        pointint: "\u2A15",
        Popf: "\u2119",
        popf: "\u{1D561}",
        pound: "\xA3",
        Pr: "\u2ABB",
        pr: "\u227A",
        prap: "\u2AB7",
        prcue: "\u227C",
        prE: "\u2AB3",
        pre: "\u2AAF",
        prec: "\u227A",
        precapprox: "\u2AB7",
        preccurlyeq: "\u227C",
        Precedes: "\u227A",
        PrecedesEqual: "\u2AAF",
        PrecedesSlantEqual: "\u227C",
        PrecedesTilde: "\u227E",
        preceq: "\u2AAF",
        precnapprox: "\u2AB9",
        precneqq: "\u2AB5",
        precnsim: "\u22E8",
        precsim: "\u227E",
        Prime: "\u2033",
        prime: "\u2032",
        primes: "\u2119",
        prnap: "\u2AB9",
        prnE: "\u2AB5",
        prnsim: "\u22E8",
        prod: "\u220F",
        Product: "\u220F",
        profalar: "\u232E",
        profline: "\u2312",
        profsurf: "\u2313",
        prop: "\u221D",
        Proportion: "\u2237",
        Proportional: "\u221D",
        propto: "\u221D",
        prsim: "\u227E",
        prurel: "\u22B0",
        Pscr: "\u{1D4AB}",
        pscr: "\u{1D4C5}",
        Psi: "\u03A8",
        psi: "\u03C8",
        puncsp: "\u2008",
        Qfr: "\u{1D514}",
        qfr: "\u{1D52E}",
        qint: "\u2A0C",
        Qopf: "\u211A",
        qopf: "\u{1D562}",
        qprime: "\u2057",
        Qscr: "\u{1D4AC}",
        qscr: "\u{1D4C6}",
        quaternions: "\u210D",
        quatint: "\u2A16",
        quest: "?",
        questeq: "\u225F",
        QUOT: '"',
        quot: '"',
        rAarr: "\u21DB",
        race: "\u223D\u0331",
        Racute: "\u0154",
        racute: "\u0155",
        radic: "\u221A",
        raemptyv: "\u29B3",
        Rang: "\u27EB",
        rang: "\u27E9",
        rangd: "\u2992",
        range: "\u29A5",
        rangle: "\u27E9",
        raquo: "\xBB",
        Rarr: "\u21A0",
        rArr: "\u21D2",
        rarr: "\u2192",
        rarrap: "\u2975",
        rarrb: "\u21E5",
        rarrbfs: "\u2920",
        rarrc: "\u2933",
        rarrfs: "\u291E",
        rarrhk: "\u21AA",
        rarrlp: "\u21AC",
        rarrpl: "\u2945",
        rarrsim: "\u2974",
        Rarrtl: "\u2916",
        rarrtl: "\u21A3",
        rarrw: "\u219D",
        rAtail: "\u291C",
        ratail: "\u291A",
        ratio: "\u2236",
        rationals: "\u211A",
        RBarr: "\u2910",
        rBarr: "\u290F",
        rbarr: "\u290D",
        rbbrk: "\u2773",
        rbrace: "}",
        rbrack: "]",
        rbrke: "\u298C",
        rbrksld: "\u298E",
        rbrkslu: "\u2990",
        Rcaron: "\u0158",
        rcaron: "\u0159",
        Rcedil: "\u0156",
        rcedil: "\u0157",
        rceil: "\u2309",
        rcub: "}",
        Rcy: "\u0420",
        rcy: "\u0440",
        rdca: "\u2937",
        rdldhar: "\u2969",
        rdquo: "\u201D",
        rdquor: "\u201D",
        rdsh: "\u21B3",
        Re: "\u211C",
        real: "\u211C",
        realine: "\u211B",
        realpart: "\u211C",
        reals: "\u211D",
        rect: "\u25AD",
        REG: "\xAE",
        reg: "\xAE",
        ReverseElement: "\u220B",
        ReverseEquilibrium: "\u21CB",
        ReverseUpEquilibrium: "\u296F",
        rfisht: "\u297D",
        rfloor: "\u230B",
        Rfr: "\u211C",
        rfr: "\u{1D52F}",
        rHar: "\u2964",
        rhard: "\u21C1",
        rharu: "\u21C0",
        rharul: "\u296C",
        Rho: "\u03A1",
        rho: "\u03C1",
        rhov: "\u03F1",
        RightAngleBracket: "\u27E9",
        RightArrow: "\u2192",
        Rightarrow: "\u21D2",
        rightarrow: "\u2192",
        RightArrowBar: "\u21E5",
        RightArrowLeftArrow: "\u21C4",
        rightarrowtail: "\u21A3",
        RightCeiling: "\u2309",
        RightDoubleBracket: "\u27E7",
        RightDownTeeVector: "\u295D",
        RightDownVector: "\u21C2",
        RightDownVectorBar: "\u2955",
        RightFloor: "\u230B",
        rightharpoondown: "\u21C1",
        rightharpoonup: "\u21C0",
        rightleftarrows: "\u21C4",
        rightleftharpoons: "\u21CC",
        rightrightarrows: "\u21C9",
        rightsquigarrow: "\u219D",
        RightTee: "\u22A2",
        RightTeeArrow: "\u21A6",
        RightTeeVector: "\u295B",
        rightthreetimes: "\u22CC",
        RightTriangle: "\u22B3",
        RightTriangleBar: "\u29D0",
        RightTriangleEqual: "\u22B5",
        RightUpDownVector: "\u294F",
        RightUpTeeVector: "\u295C",
        RightUpVector: "\u21BE",
        RightUpVectorBar: "\u2954",
        RightVector: "\u21C0",
        RightVectorBar: "\u2953",
        ring: "\u02DA",
        risingdotseq: "\u2253",
        rlarr: "\u21C4",
        rlhar: "\u21CC",
        rlm: "\u200F",
        rmoust: "\u23B1",
        rmoustache: "\u23B1",
        rnmid: "\u2AEE",
        roang: "\u27ED",
        roarr: "\u21FE",
        robrk: "\u27E7",
        ropar: "\u2986",
        Ropf: "\u211D",
        ropf: "\u{1D563}",
        roplus: "\u2A2E",
        rotimes: "\u2A35",
        RoundImplies: "\u2970",
        rpar: ")",
        rpargt: "\u2994",
        rppolint: "\u2A12",
        rrarr: "\u21C9",
        Rrightarrow: "\u21DB",
        rsaquo: "\u203A",
        Rscr: "\u211B",
        rscr: "\u{1D4C7}",
        Rsh: "\u21B1",
        rsh: "\u21B1",
        rsqb: "]",
        rsquo: "\u2019",
        rsquor: "\u2019",
        rthree: "\u22CC",
        rtimes: "\u22CA",
        rtri: "\u25B9",
        rtrie: "\u22B5",
        rtrif: "\u25B8",
        rtriltri: "\u29CE",
        RuleDelayed: "\u29F4",
        ruluhar: "\u2968",
        rx: "\u211E",
        Sacute: "\u015A",
        sacute: "\u015B",
        sbquo: "\u201A",
        Sc: "\u2ABC",
        sc: "\u227B",
        scap: "\u2AB8",
        Scaron: "\u0160",
        scaron: "\u0161",
        sccue: "\u227D",
        scE: "\u2AB4",
        sce: "\u2AB0",
        Scedil: "\u015E",
        scedil: "\u015F",
        Scirc: "\u015C",
        scirc: "\u015D",
        scnap: "\u2ABA",
        scnE: "\u2AB6",
        scnsim: "\u22E9",
        scpolint: "\u2A13",
        scsim: "\u227F",
        Scy: "\u0421",
        scy: "\u0441",
        sdot: "\u22C5",
        sdotb: "\u22A1",
        sdote: "\u2A66",
        searhk: "\u2925",
        seArr: "\u21D8",
        searr: "\u2198",
        searrow: "\u2198",
        sect: "\xA7",
        semi: ";",
        seswar: "\u2929",
        setminus: "\u2216",
        setmn: "\u2216",
        sext: "\u2736",
        Sfr: "\u{1D516}",
        sfr: "\u{1D530}",
        sfrown: "\u2322",
        sharp: "\u266F",
        SHCHcy: "\u0429",
        shchcy: "\u0449",
        SHcy: "\u0428",
        shcy: "\u0448",
        ShortDownArrow: "\u2193",
        ShortLeftArrow: "\u2190",
        shortmid: "\u2223",
        shortparallel: "\u2225",
        ShortRightArrow: "\u2192",
        ShortUpArrow: "\u2191",
        shy: "\xAD",
        Sigma: "\u03A3",
        sigma: "\u03C3",
        sigmaf: "\u03C2",
        sigmav: "\u03C2",
        sim: "\u223C",
        simdot: "\u2A6A",
        sime: "\u2243",
        simeq: "\u2243",
        simg: "\u2A9E",
        simgE: "\u2AA0",
        siml: "\u2A9D",
        simlE: "\u2A9F",
        simne: "\u2246",
        simplus: "\u2A24",
        simrarr: "\u2972",
        slarr: "\u2190",
        SmallCircle: "\u2218",
        smallsetminus: "\u2216",
        smashp: "\u2A33",
        smeparsl: "\u29E4",
        smid: "\u2223",
        smile: "\u2323",
        smt: "\u2AAA",
        smte: "\u2AAC",
        smtes: "\u2AAC\uFE00",
        SOFTcy: "\u042C",
        softcy: "\u044C",
        sol: "/",
        solb: "\u29C4",
        solbar: "\u233F",
        Sopf: "\u{1D54A}",
        sopf: "\u{1D564}",
        spades: "\u2660",
        spadesuit: "\u2660",
        spar: "\u2225",
        sqcap: "\u2293",
        sqcaps: "\u2293\uFE00",
        sqcup: "\u2294",
        sqcups: "\u2294\uFE00",
        Sqrt: "\u221A",
        sqsub: "\u228F",
        sqsube: "\u2291",
        sqsubset: "\u228F",
        sqsubseteq: "\u2291",
        sqsup: "\u2290",
        sqsupe: "\u2292",
        sqsupset: "\u2290",
        sqsupseteq: "\u2292",
        squ: "\u25A1",
        Square: "\u25A1",
        square: "\u25A1",
        SquareIntersection: "\u2293",
        SquareSubset: "\u228F",
        SquareSubsetEqual: "\u2291",
        SquareSuperset: "\u2290",
        SquareSupersetEqual: "\u2292",
        SquareUnion: "\u2294",
        squarf: "\u25AA",
        squf: "\u25AA",
        srarr: "\u2192",
        Sscr: "\u{1D4AE}",
        sscr: "\u{1D4C8}",
        ssetmn: "\u2216",
        ssmile: "\u2323",
        sstarf: "\u22C6",
        Star: "\u22C6",
        star: "\u2606",
        starf: "\u2605",
        straightepsilon: "\u03F5",
        straightphi: "\u03D5",
        strns: "\xAF",
        Sub: "\u22D0",
        sub: "\u2282",
        subdot: "\u2ABD",
        subE: "\u2AC5",
        sube: "\u2286",
        subedot: "\u2AC3",
        submult: "\u2AC1",
        subnE: "\u2ACB",
        subne: "\u228A",
        subplus: "\u2ABF",
        subrarr: "\u2979",
        Subset: "\u22D0",
        subset: "\u2282",
        subseteq: "\u2286",
        subseteqq: "\u2AC5",
        SubsetEqual: "\u2286",
        subsetneq: "\u228A",
        subsetneqq: "\u2ACB",
        subsim: "\u2AC7",
        subsub: "\u2AD5",
        subsup: "\u2AD3",
        succ: "\u227B",
        succapprox: "\u2AB8",
        succcurlyeq: "\u227D",
        Succeeds: "\u227B",
        SucceedsEqual: "\u2AB0",
        SucceedsSlantEqual: "\u227D",
        SucceedsTilde: "\u227F",
        succeq: "\u2AB0",
        succnapprox: "\u2ABA",
        succneqq: "\u2AB6",
        succnsim: "\u22E9",
        succsim: "\u227F",
        SuchThat: "\u220B",
        Sum: "\u2211",
        sum: "\u2211",
        sung: "\u266A",
        Sup: "\u22D1",
        sup: "\u2283",
        sup1: "\xB9",
        sup2: "\xB2",
        sup3: "\xB3",
        supdot: "\u2ABE",
        supdsub: "\u2AD8",
        supE: "\u2AC6",
        supe: "\u2287",
        supedot: "\u2AC4",
        Superset: "\u2283",
        SupersetEqual: "\u2287",
        suphsol: "\u27C9",
        suphsub: "\u2AD7",
        suplarr: "\u297B",
        supmult: "\u2AC2",
        supnE: "\u2ACC",
        supne: "\u228B",
        supplus: "\u2AC0",
        Supset: "\u22D1",
        supset: "\u2283",
        supseteq: "\u2287",
        supseteqq: "\u2AC6",
        supsetneq: "\u228B",
        supsetneqq: "\u2ACC",
        supsim: "\u2AC8",
        supsub: "\u2AD4",
        supsup: "\u2AD6",
        swarhk: "\u2926",
        swArr: "\u21D9",
        swarr: "\u2199",
        swarrow: "\u2199",
        swnwar: "\u292A",
        szlig: "\xDF",
        Tab: "	",
        target: "\u2316",
        Tau: "\u03A4",
        tau: "\u03C4",
        tbrk: "\u23B4",
        Tcaron: "\u0164",
        tcaron: "\u0165",
        Tcedil: "\u0162",
        tcedil: "\u0163",
        Tcy: "\u0422",
        tcy: "\u0442",
        tdot: "\u20DB",
        telrec: "\u2315",
        Tfr: "\u{1D517}",
        tfr: "\u{1D531}",
        there4: "\u2234",
        Therefore: "\u2234",
        therefore: "\u2234",
        Theta: "\u0398",
        theta: "\u03B8",
        thetasym: "\u03D1",
        thetav: "\u03D1",
        thickapprox: "\u2248",
        thicksim: "\u223C",
        ThickSpace: "\u205F\u200A",
        thinsp: "\u2009",
        ThinSpace: "\u2009",
        thkap: "\u2248",
        thksim: "\u223C",
        THORN: "\xDE",
        thorn: "\xFE",
        Tilde: "\u223C",
        tilde: "\u02DC",
        TildeEqual: "\u2243",
        TildeFullEqual: "\u2245",
        TildeTilde: "\u2248",
        times: "\xD7",
        timesb: "\u22A0",
        timesbar: "\u2A31",
        timesd: "\u2A30",
        tint: "\u222D",
        toea: "\u2928",
        top: "\u22A4",
        topbot: "\u2336",
        topcir: "\u2AF1",
        Topf: "\u{1D54B}",
        topf: "\u{1D565}",
        topfork: "\u2ADA",
        tosa: "\u2929",
        tprime: "\u2034",
        TRADE: "\u2122",
        trade: "\u2122",
        triangle: "\u25B5",
        triangledown: "\u25BF",
        triangleleft: "\u25C3",
        trianglelefteq: "\u22B4",
        triangleq: "\u225C",
        triangleright: "\u25B9",
        trianglerighteq: "\u22B5",
        tridot: "\u25EC",
        trie: "\u225C",
        triminus: "\u2A3A",
        TripleDot: "\u20DB",
        triplus: "\u2A39",
        trisb: "\u29CD",
        tritime: "\u2A3B",
        trpezium: "\u23E2",
        Tscr: "\u{1D4AF}",
        tscr: "\u{1D4C9}",
        TScy: "\u0426",
        tscy: "\u0446",
        TSHcy: "\u040B",
        tshcy: "\u045B",
        Tstrok: "\u0166",
        tstrok: "\u0167",
        twixt: "\u226C",
        twoheadleftarrow: "\u219E",
        twoheadrightarrow: "\u21A0",
        Uacute: "\xDA",
        uacute: "\xFA",
        Uarr: "\u219F",
        uArr: "\u21D1",
        uarr: "\u2191",
        Uarrocir: "\u2949",
        Ubrcy: "\u040E",
        ubrcy: "\u045E",
        Ubreve: "\u016C",
        ubreve: "\u016D",
        Ucirc: "\xDB",
        ucirc: "\xFB",
        Ucy: "\u0423",
        ucy: "\u0443",
        udarr: "\u21C5",
        Udblac: "\u0170",
        udblac: "\u0171",
        udhar: "\u296E",
        ufisht: "\u297E",
        Ufr: "\u{1D518}",
        ufr: "\u{1D532}",
        Ugrave: "\xD9",
        ugrave: "\xF9",
        uHar: "\u2963",
        uharl: "\u21BF",
        uharr: "\u21BE",
        uhblk: "\u2580",
        ulcorn: "\u231C",
        ulcorner: "\u231C",
        ulcrop: "\u230F",
        ultri: "\u25F8",
        Umacr: "\u016A",
        umacr: "\u016B",
        uml: "\xA8",
        UnderBar: "_",
        UnderBrace: "\u23DF",
        UnderBracket: "\u23B5",
        UnderParenthesis: "\u23DD",
        Union: "\u22C3",
        UnionPlus: "\u228E",
        Uogon: "\u0172",
        uogon: "\u0173",
        Uopf: "\u{1D54C}",
        uopf: "\u{1D566}",
        UpArrow: "\u2191",
        Uparrow: "\u21D1",
        uparrow: "\u2191",
        UpArrowBar: "\u2912",
        UpArrowDownArrow: "\u21C5",
        UpDownArrow: "\u2195",
        Updownarrow: "\u21D5",
        updownarrow: "\u2195",
        UpEquilibrium: "\u296E",
        upharpoonleft: "\u21BF",
        upharpoonright: "\u21BE",
        uplus: "\u228E",
        UpperLeftArrow: "\u2196",
        UpperRightArrow: "\u2197",
        Upsi: "\u03D2",
        upsi: "\u03C5",
        upsih: "\u03D2",
        Upsilon: "\u03A5",
        upsilon: "\u03C5",
        UpTee: "\u22A5",
        UpTeeArrow: "\u21A5",
        upuparrows: "\u21C8",
        urcorn: "\u231D",
        urcorner: "\u231D",
        urcrop: "\u230E",
        Uring: "\u016E",
        uring: "\u016F",
        urtri: "\u25F9",
        Uscr: "\u{1D4B0}",
        uscr: "\u{1D4CA}",
        utdot: "\u22F0",
        Utilde: "\u0168",
        utilde: "\u0169",
        utri: "\u25B5",
        utrif: "\u25B4",
        uuarr: "\u21C8",
        Uuml: "\xDC",
        uuml: "\xFC",
        uwangle: "\u29A7",
        vangrt: "\u299C",
        varepsilon: "\u03F5",
        varkappa: "\u03F0",
        varnothing: "\u2205",
        varphi: "\u03D5",
        varpi: "\u03D6",
        varpropto: "\u221D",
        vArr: "\u21D5",
        varr: "\u2195",
        varrho: "\u03F1",
        varsigma: "\u03C2",
        varsubsetneq: "\u228A\uFE00",
        varsubsetneqq: "\u2ACB\uFE00",
        varsupsetneq: "\u228B\uFE00",
        varsupsetneqq: "\u2ACC\uFE00",
        vartheta: "\u03D1",
        vartriangleleft: "\u22B2",
        vartriangleright: "\u22B3",
        Vbar: "\u2AEB",
        vBar: "\u2AE8",
        vBarv: "\u2AE9",
        Vcy: "\u0412",
        vcy: "\u0432",
        VDash: "\u22AB",
        Vdash: "\u22A9",
        vDash: "\u22A8",
        vdash: "\u22A2",
        Vdashl: "\u2AE6",
        Vee: "\u22C1",
        vee: "\u2228",
        veebar: "\u22BB",
        veeeq: "\u225A",
        vellip: "\u22EE",
        Verbar: "\u2016",
        verbar: "|",
        Vert: "\u2016",
        vert: "|",
        VerticalBar: "\u2223",
        VerticalLine: "|",
        VerticalSeparator: "\u2758",
        VerticalTilde: "\u2240",
        VeryThinSpace: "\u200A",
        Vfr: "\u{1D519}",
        vfr: "\u{1D533}",
        vltri: "\u22B2",
        vnsub: "\u2282\u20D2",
        vnsup: "\u2283\u20D2",
        Vopf: "\u{1D54D}",
        vopf: "\u{1D567}",
        vprop: "\u221D",
        vrtri: "\u22B3",
        Vscr: "\u{1D4B1}",
        vscr: "\u{1D4CB}",
        vsubnE: "\u2ACB\uFE00",
        vsubne: "\u228A\uFE00",
        vsupnE: "\u2ACC\uFE00",
        vsupne: "\u228B\uFE00",
        Vvdash: "\u22AA",
        vzigzag: "\u299A",
        Wcirc: "\u0174",
        wcirc: "\u0175",
        wedbar: "\u2A5F",
        Wedge: "\u22C0",
        wedge: "\u2227",
        wedgeq: "\u2259",
        weierp: "\u2118",
        Wfr: "\u{1D51A}",
        wfr: "\u{1D534}",
        Wopf: "\u{1D54E}",
        wopf: "\u{1D568}",
        wp: "\u2118",
        wr: "\u2240",
        wreath: "\u2240",
        Wscr: "\u{1D4B2}",
        wscr: "\u{1D4CC}",
        xcap: "\u22C2",
        xcirc: "\u25EF",
        xcup: "\u22C3",
        xdtri: "\u25BD",
        Xfr: "\u{1D51B}",
        xfr: "\u{1D535}",
        xhArr: "\u27FA",
        xharr: "\u27F7",
        Xi: "\u039E",
        xi: "\u03BE",
        xlArr: "\u27F8",
        xlarr: "\u27F5",
        xmap: "\u27FC",
        xnis: "\u22FB",
        xodot: "\u2A00",
        Xopf: "\u{1D54F}",
        xopf: "\u{1D569}",
        xoplus: "\u2A01",
        xotime: "\u2A02",
        xrArr: "\u27F9",
        xrarr: "\u27F6",
        Xscr: "\u{1D4B3}",
        xscr: "\u{1D4CD}",
        xsqcup: "\u2A06",
        xuplus: "\u2A04",
        xutri: "\u25B3",
        xvee: "\u22C1",
        xwedge: "\u22C0",
        Yacute: "\xDD",
        yacute: "\xFD",
        YAcy: "\u042F",
        yacy: "\u044F",
        Ycirc: "\u0176",
        ycirc: "\u0177",
        Ycy: "\u042B",
        ycy: "\u044B",
        yen: "\xA5",
        Yfr: "\u{1D51C}",
        yfr: "\u{1D536}",
        YIcy: "\u0407",
        yicy: "\u0457",
        Yopf: "\u{1D550}",
        yopf: "\u{1D56A}",
        Yscr: "\u{1D4B4}",
        yscr: "\u{1D4CE}",
        YUcy: "\u042E",
        yucy: "\u044E",
        Yuml: "\u0178",
        yuml: "\xFF",
        Zacute: "\u0179",
        zacute: "\u017A",
        Zcaron: "\u017D",
        zcaron: "\u017E",
        Zcy: "\u0417",
        zcy: "\u0437",
        Zdot: "\u017B",
        zdot: "\u017C",
        zeetrf: "\u2128",
        ZeroWidthSpace: "\u200B",
        Zeta: "\u0396",
        zeta: "\u03B6",
        Zfr: "\u2128",
        zfr: "\u{1D537}",
        ZHcy: "\u0416",
        zhcy: "\u0436",
        zigrarr: "\u21DD",
        Zopf: "\u2124",
        zopf: "\u{1D56B}",
        Zscr: "\u{1D4B5}",
        zscr: "\u{1D4CF}",
        zwj: "\u200D",
        zwnj: "\u200C"
      });
      exports.entityMap = exports.HTML_ENTITIES;
    }
  });

  // node_modules/@xmldom/xmldom/lib/sax.js
  var require_sax = __commonJS({
    "node_modules/@xmldom/xmldom/lib/sax.js"(exports) {
      "use strict";
      var conventions = require_conventions();
      var g = require_grammar();
      var errors = require_errors();
      var isHTMLEscapableRawTextElement = conventions.isHTMLEscapableRawTextElement;
      var isHTMLMimeType = conventions.isHTMLMimeType;
      var isHTMLRawTextElement = conventions.isHTMLRawTextElement;
      var hasOwn = conventions.hasOwn;
      var NAMESPACE = conventions.NAMESPACE;
      var ParseError = errors.ParseError;
      var DOMException = errors.DOMException;
      var S_TAG = 0;
      var S_ATTR = 1;
      var S_ATTR_SPACE = 2;
      var S_EQ = 3;
      var S_ATTR_NOQUOT_VALUE = 4;
      var S_ATTR_END = 5;
      var S_TAG_SPACE = 6;
      var S_TAG_CLOSE = 7;
      function XMLReader() {
      }
      XMLReader.prototype = {
        parse: function(source, defaultNSMap, entityMap) {
          var domBuilder = this.domBuilder;
          domBuilder.startDocument();
          _copy(defaultNSMap, defaultNSMap = /* @__PURE__ */ Object.create(null));
          parse(source, defaultNSMap, entityMap, domBuilder, this.errorHandler);
          domBuilder.endDocument();
        }
      };
      var ENTITY_REG = /&#?\w+;?/g;
      function parse(source, defaultNSMapCopy, entityMap, domBuilder, errorHandler) {
        var isHTML = isHTMLMimeType(domBuilder.mimeType);
        if (source.indexOf(g.UNICODE_REPLACEMENT_CHARACTER) >= 0) {
          errorHandler.warning("Unicode replacement character detected, source encoding issues?");
        }
        function fixedFromCharCode(code) {
          if (code > 65535) {
            code -= 65536;
            var surrogate1 = 55296 + (code >> 10), surrogate2 = 56320 + (code & 1023);
            return String.fromCharCode(surrogate1, surrogate2);
          } else {
            return String.fromCharCode(code);
          }
        }
        function entityReplacer(a2) {
          var complete = a2[a2.length - 1] === ";" ? a2 : a2 + ";";
          if (!isHTML && complete !== a2) {
            errorHandler.error("EntityRef: expecting ;");
            return a2;
          }
          var match = g.Reference.exec(complete);
          if (!match || match[0].length !== complete.length) {
            errorHandler.error("entity not matching Reference production: " + a2);
            return a2;
          }
          var k = complete.slice(1, -1);
          if (hasOwn(entityMap, k)) {
            return entityMap[k];
          } else if (k.charAt(0) === "#") {
            return fixedFromCharCode(parseInt(k.substring(1).replace("x", "0x")));
          } else {
            errorHandler.error("entity not found:" + a2);
            return a2;
          }
        }
        function appendText(end2) {
          if (end2 > start) {
            var xt = source.substring(start, end2).replace(ENTITY_REG, entityReplacer);
            locator && position(start);
            domBuilder.characters(xt, 0, end2 - start);
            start = end2;
          }
        }
        var lineStart = 0;
        var lineEnd = 0;
        var linePattern = /\r\n?|\n|$/g;
        var locator = domBuilder.locator;
        function position(p, m) {
          while (p >= lineEnd && (m = linePattern.exec(source))) {
            lineStart = lineEnd;
            lineEnd = m.index + m[0].length;
            locator.lineNumber++;
          }
          locator.columnNumber = p - lineStart + 1;
        }
        var parseStack = [{ currentNSMap: defaultNSMapCopy }];
        var unclosedTags = [];
        var start = 0;
        while (true) {
          try {
            var tagStart = source.indexOf("<", start);
            if (tagStart < 0) {
              if (!isHTML && unclosedTags.length > 0) {
                return errorHandler.fatalError("unclosed xml tag(s): " + unclosedTags.join(", "));
              }
              if (!source.substring(start).match(/^\s*$/)) {
                var doc = domBuilder.doc;
                var text = doc.createTextNode(source.substring(start));
                if (doc.documentElement) {
                  return errorHandler.error("Extra content at the end of the document");
                }
                doc.appendChild(text);
                domBuilder.currentElement = text;
              }
              return;
            }
            if (tagStart > start) {
              var fromSource = source.substring(start, tagStart);
              if (!isHTML && unclosedTags.length === 0) {
                fromSource = fromSource.replace(new RegExp(g.S_OPT.source, "g"), "");
                fromSource && errorHandler.error("Unexpected content outside root element: '" + fromSource + "'");
              }
              appendText(tagStart);
            }
            switch (source.charAt(tagStart + 1)) {
              case "/":
                var end = source.indexOf(">", tagStart + 2);
                var tagNameRaw = source.substring(tagStart + 2, end > 0 ? end : void 0);
                if (!tagNameRaw) {
                  return errorHandler.fatalError("end tag name missing");
                }
                var endTagNameStrict = g.reg("^", g.QName_group, g.S_OPT, "$");
                var tagNameMatch = end > 0 && endTagNameStrict.exec(tagNameRaw);
                if (!tagNameMatch) {
                  var leadingTagNameMatch = end > 0 && g.reg("^", g.QName_group).exec(tagNameRaw);
                  if (isHTML && leadingTagNameMatch) {
                    errorHandler.warning('end tag name contains invalid trailing characters: "' + tagNameRaw + '"');
                    tagNameMatch = leadingTagNameMatch;
                  } else if (
                    // Backward compatibility, remove this whole `else if` arm in the next breaking release
                    // (XML then falls through to the `fatalError` below, for a clean mode split: XML fatal,
                    // HTML warning). A valid end-tag name followed by a line break and trailing content was
                    // silently accepted while `reg` still used the `m` flag; re-adding `m` here matches exactly
                    // those inputs, kept recoverable and reported.
                    leadingTagNameMatch && new RegExp(endTagNameStrict.source, endTagNameStrict.flags + "m").test(tagNameRaw)
                  ) {
                    errorHandler.error('end tag name is followed by a line break and trailing content: "' + tagNameRaw + '"');
                    tagNameMatch = leadingTagNameMatch;
                  } else {
                    return errorHandler.fatalError('end tag name contains invalid characters: "' + tagNameRaw + '"');
                  }
                }
                if (!domBuilder.currentElement && !domBuilder.doc.documentElement) {
                  return;
                }
                var currentTagName = unclosedTags[unclosedTags.length - 1] || domBuilder.currentElement.tagName || domBuilder.doc.documentElement.tagName || "";
                if (currentTagName !== tagNameMatch[1]) {
                  var tagNameLower = tagNameMatch[1].toLowerCase();
                  if (!isHTML || currentTagName.toLowerCase() !== tagNameLower) {
                    return errorHandler.fatalError('Opening and ending tag mismatch: "' + currentTagName + '" != "' + tagNameRaw + '"');
                  }
                }
                var config = parseStack.pop();
                unclosedTags.pop();
                var localNSMap = config.localNSMap;
                domBuilder.endElement(config.uri, config.localName, currentTagName);
                if (localNSMap) {
                  for (var prefix in localNSMap) {
                    if (hasOwn(localNSMap, prefix)) {
                      domBuilder.endPrefixMapping(prefix);
                    }
                  }
                }
                end++;
                break;
              // end element
              case "?":
                locator && position(tagStart);
                end = parseProcessingInstruction(source, tagStart, domBuilder, errorHandler);
                break;
              case "!":
                locator && position(tagStart);
                end = parseDoctypeCommentOrCData(source, tagStart, domBuilder, errorHandler, isHTML);
                break;
              default:
                locator && position(tagStart);
                var el = new ElementAttributes();
                var currentNSMap = parseStack[parseStack.length - 1].currentNSMap;
                var end = parseElementStartPart(source, tagStart, el, currentNSMap, entityReplacer, errorHandler, isHTML);
                var len = el.length;
                if (!el.closed) {
                  if (isHTML && conventions.isHTMLVoidElement(el.tagName)) {
                    el.closed = true;
                  } else {
                    unclosedTags.push(el.tagName);
                  }
                }
                if (locator && len) {
                  var locator2 = copyLocator(locator, {});
                  for (var i = 0; i < len; i++) {
                    var a = el[i];
                    position(a.offset);
                    a.locator = copyLocator(locator, {});
                  }
                  domBuilder.locator = locator2;
                  if (appendElement(el, domBuilder, currentNSMap)) {
                    parseStack.push(el);
                  }
                  domBuilder.locator = locator;
                } else {
                  if (appendElement(el, domBuilder, currentNSMap)) {
                    parseStack.push(el);
                  }
                }
                if (isHTML && !el.closed) {
                  end = parseHtmlSpecialContent(source, end, el.tagName, entityReplacer, domBuilder);
                } else {
                  end++;
                }
            }
          } catch (e) {
            if (e instanceof ParseError) {
              throw e;
            } else if (e instanceof DOMException) {
              return errorHandler.fatalError("Error constructing the DOM: " + e.name + ": " + e.message, e);
            }
            errorHandler.error("element parse error: " + e);
            end = -1;
          }
          if (end > start) {
            start = end;
          } else {
            appendText(Math.max(tagStart, start) + 1);
          }
        }
      }
      function copyLocator(f, t) {
        t.lineNumber = f.lineNumber;
        t.columnNumber = f.columnNumber;
        return t;
      }
      function parseElementStartPart(source, start, el, currentNSMap, entityReplacer, errorHandler, isHTML) {
        function addAttribute(qname, value2, startIndex) {
          if (hasOwn(el.attributeNames, qname)) {
            return errorHandler.fatalError("Attribute " + qname + " redefined");
          }
          if (!isHTML && value2.indexOf("<") >= 0) {
            return errorHandler.fatalError("Unescaped '<' not allowed in attributes values");
          }
          el.addValue(
            qname,
            // @see https://www.w3.org/TR/xml/#AVNormalize
            // since the xmldom sax parser does not "interpret" DTD the following is not implemented:
            // - recursive replacement of (DTD) entity references
            // - trimming and collapsing multiple spaces into a single one for attributes that are not of type CDATA
            value2.replace(/[\t\n\r]/g, " ").replace(ENTITY_REG, entityReplacer),
            startIndex
          );
        }
        var attrName;
        var value;
        var p = ++start;
        var s = S_TAG;
        while (true) {
          var c = source.charAt(p);
          if (s === S_TAG && c === "<") {
            throw new Error("unexpected < in tag name: " + source.slice(start, p));
          }
          switch (c) {
            case "=":
              if (s === S_ATTR) {
                attrName = source.slice(start, p);
                s = S_EQ;
              } else if (s === S_ATTR_SPACE) {
                s = S_EQ;
              } else {
                throw new Error("attribute equal must after attrName");
              }
              break;
            case "'":
            case '"':
              if (s === S_EQ || s === S_ATTR) {
                if (s === S_ATTR) {
                  errorHandler.warning('attribute value must after "="');
                  attrName = source.slice(start, p);
                }
                start = p + 1;
                p = source.indexOf(c, start);
                if (p > 0) {
                  value = source.slice(start, p);
                  addAttribute(attrName, value, start - 1);
                  s = S_ATTR_END;
                } else {
                  throw new Error("attribute value no end '" + c + "' match");
                }
              } else if (s == S_ATTR_NOQUOT_VALUE) {
                value = source.slice(start, p);
                addAttribute(attrName, value, start);
                errorHandler.warning('attribute "' + attrName + '" missed start quot(' + c + ")!!");
                start = p + 1;
                s = S_ATTR_END;
              } else {
                throw new Error('attribute value must after "="');
              }
              break;
            case "/":
              switch (s) {
                case S_TAG:
                  el.setTagName(source.slice(start, p));
                case S_ATTR_END:
                case S_TAG_SPACE:
                case S_TAG_CLOSE:
                  s = S_TAG_CLOSE;
                  el.closed = true;
                case S_ATTR_NOQUOT_VALUE:
                case S_ATTR:
                  break;
                case S_ATTR_SPACE:
                  el.closed = true;
                  break;
                //case S_EQ:
                default:
                  throw new Error("attribute invalid close char('/')");
              }
              break;
            case "":
              errorHandler.error("unexpected end of input");
              if (s == S_TAG) {
                el.setTagName(source.slice(start, p));
              }
              return p;
            case ">":
              switch (s) {
                case S_TAG:
                  el.setTagName(source.slice(start, p));
                case S_ATTR_END:
                case S_TAG_SPACE:
                case S_TAG_CLOSE:
                  break;
                //normal
                case S_ATTR_NOQUOT_VALUE:
                //Compatible state
                case S_ATTR:
                  value = source.slice(start, p);
                  if (value.slice(-1) === "/") {
                    el.closed = true;
                    value = value.slice(0, -1);
                  }
                case S_ATTR_SPACE:
                  if (s === S_ATTR_SPACE) {
                    value = attrName;
                  }
                  if (s == S_ATTR_NOQUOT_VALUE) {
                    errorHandler.warning('attribute "' + value + '" missed quot(")!');
                    addAttribute(attrName, value, start);
                  } else {
                    if (!isHTML) {
                      errorHandler.warning('attribute "' + value + '" missed value!! "' + value + '" instead!!');
                    }
                    addAttribute(value, value, start);
                  }
                  break;
                case S_EQ:
                  if (!isHTML) {
                    return errorHandler.fatalError(`AttValue: ' or " expected`);
                  }
              }
              return p;
            /*xml space '\x20' | #x9 | #xD | #xA; */
            case "\x80":
              c = " ";
            default:
              if (c <= " ") {
                switch (s) {
                  case S_TAG:
                    el.setTagName(source.slice(start, p));
                    s = S_TAG_SPACE;
                    break;
                  case S_ATTR:
                    attrName = source.slice(start, p);
                    s = S_ATTR_SPACE;
                    break;
                  case S_ATTR_NOQUOT_VALUE:
                    var value = source.slice(start, p);
                    errorHandler.warning('attribute "' + value + '" missed quot(")!!');
                    addAttribute(attrName, value, start);
                  case S_ATTR_END:
                    s = S_TAG_SPACE;
                    break;
                }
              } else {
                switch (s) {
                  //case S_TAG:void();break;
                  //case S_ATTR:void();break;
                  //case S_ATTR_NOQUOT_VALUE:void();break;
                  case S_ATTR_SPACE:
                    if (!isHTML) {
                      errorHandler.warning('attribute "' + attrName + '" missed value!! "' + attrName + '" instead2!!');
                    }
                    addAttribute(attrName, attrName, start);
                    start = p;
                    s = S_ATTR;
                    break;
                  case S_ATTR_END:
                    errorHandler.warning('attribute space is required"' + attrName + '"!!');
                  case S_TAG_SPACE:
                    s = S_ATTR;
                    start = p;
                    break;
                  case S_EQ:
                    s = S_ATTR_NOQUOT_VALUE;
                    start = p;
                    break;
                  case S_TAG_CLOSE:
                    throw new Error("elements closed character '/' and '>' must be connected to");
                }
              }
          }
          p++;
        }
      }
      function appendElement(el, domBuilder, currentNSMap) {
        var tagName = el.tagName;
        var localNSMap = null;
        var i = el.length;
        while (i--) {
          var a = el[i];
          var qName = a.qName;
          var value = a.value;
          var nsp = qName.indexOf(":");
          if (nsp > 0) {
            var prefix = a.prefix = qName.slice(0, nsp);
            var localName = qName.slice(nsp + 1);
            var nsPrefix = prefix === "xmlns" && localName;
          } else {
            localName = qName;
            prefix = null;
            nsPrefix = qName === "xmlns" && "";
          }
          a.localName = localName;
          if (nsPrefix !== false) {
            if (localNSMap == null) {
              localNSMap = /* @__PURE__ */ Object.create(null);
              currentNSMap = Object.create(currentNSMap);
            }
            currentNSMap[nsPrefix] = localNSMap[nsPrefix] = value;
            a.uri = NAMESPACE.XMLNS;
            domBuilder.startPrefixMapping(nsPrefix, value);
          }
        }
        var i = el.length;
        while (i--) {
          a = el[i];
          if (a.prefix) {
            if (a.prefix === "xml") {
              a.uri = NAMESPACE.XML;
            }
            if (a.prefix !== "xmlns") {
              a.uri = currentNSMap[a.prefix];
            }
          }
        }
        var nsp = tagName.indexOf(":");
        if (nsp > 0) {
          prefix = el.prefix = tagName.slice(0, nsp);
          localName = el.localName = tagName.slice(nsp + 1);
        } else {
          prefix = null;
          localName = el.localName = tagName;
        }
        var ns = el.uri = currentNSMap[prefix || ""];
        domBuilder.startElement(ns, localName, tagName, el);
        if (el.closed) {
          domBuilder.endElement(ns, localName, tagName);
          if (localNSMap) {
            for (prefix in localNSMap) {
              if (hasOwn(localNSMap, prefix)) {
                domBuilder.endPrefixMapping(prefix);
              }
            }
          }
        } else {
          el.currentNSMap = currentNSMap;
          el.localNSMap = localNSMap;
          return true;
        }
      }
      function parseHtmlSpecialContent(source, elStartEnd, tagName, entityReplacer, domBuilder) {
        var isEscapableRaw = isHTMLEscapableRawTextElement(tagName);
        if (isEscapableRaw || isHTMLRawTextElement(tagName)) {
          var closeTag = new RegExp("</" + tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ">", "ig");
          closeTag.lastIndex = elStartEnd;
          var match = closeTag.exec(source);
          var elEndStart = match ? match.index : -1;
          if (elEndStart < 0) {
            return elStartEnd + 1;
          }
          var text = source.substring(elStartEnd + 1, elEndStart);
          if (isEscapableRaw) {
            text = text.replace(ENTITY_REG, entityReplacer);
          }
          domBuilder.characters(text, 0, text.length);
          return elEndStart;
        }
        return elStartEnd + 1;
      }
      function _copy(source, target) {
        for (var n in source) {
          if (hasOwn(source, n)) {
            target[n] = source[n];
          }
        }
      }
      function parseUtils(source, start) {
        var index = start;
        function char(n) {
          n = n || 0;
          return source.charAt(index + n);
        }
        function skip(n) {
          n = n || 1;
          index += n;
        }
        function skipBlanks() {
          var blanks = 0;
          while (index < source.length) {
            var c = char();
            if (c !== " " && c !== "\n" && c !== "	" && c !== "\r") {
              return blanks;
            }
            blanks++;
            skip();
          }
          return -1;
        }
        function substringFromIndex() {
          return source.substring(index);
        }
        function substringStartsWith(text) {
          return source.substring(index, index + text.length) === text;
        }
        function substringStartsWithCaseInsensitive(text) {
          return source.substring(index, index + text.length).toUpperCase() === text.toUpperCase();
        }
        function getMatch(args) {
          var expr = g.reg("^", args);
          var match = expr.exec(substringFromIndex());
          if (match) {
            skip(match[0].length);
            return match[0];
          }
          return null;
        }
        return {
          char,
          getIndex: function() {
            return index;
          },
          getMatch,
          getSource: function() {
            return source;
          },
          skip,
          skipBlanks,
          substringFromIndex,
          substringStartsWith,
          substringStartsWithCaseInsensitive
        };
      }
      function parseDoctypeInternalSubset(p, errorHandler) {
        function parsePI(p2, errorHandler2) {
          var match = g.PI.exec(p2.substringFromIndex());
          if (!match) {
            return errorHandler2.fatalError("processing instruction is not well-formed at position " + p2.getIndex());
          }
          if (match[1].toLowerCase() === "xml") {
            return errorHandler2.fatalError(
              "xml declaration is only allowed at the start of the document, but found at position " + p2.getIndex()
            );
          }
          p2.skip(match[0].length);
          return match[0];
        }
        var source = p.getSource();
        if (p.char() === "[") {
          p.skip(1);
          var intSubsetStart = p.getIndex();
          while (p.getIndex() < source.length) {
            p.skipBlanks();
            if (p.char() === "]") {
              var internalSubset = source.substring(intSubsetStart, p.getIndex());
              p.skip(1);
              return internalSubset;
            }
            var current = null;
            if (p.char() === "<" && p.char(1) === "!") {
              switch (p.char(2)) {
                case "E":
                  if (p.char(3) === "L") {
                    current = p.getMatch(g.elementdecl);
                  } else if (p.char(3) === "N") {
                    current = p.getMatch(g.EntityDecl);
                  }
                  break;
                case "A":
                  current = p.getMatch(g.AttlistDecl);
                  break;
                case "N":
                  current = p.getMatch(g.NotationDecl);
                  break;
                case "-":
                  current = p.getMatch(g.Comment);
                  break;
              }
            } else if (p.char() === "<" && p.char(1) === "?") {
              current = parsePI(p, errorHandler);
            } else if (p.char() === "%") {
              current = p.getMatch(g.PEReference);
            } else {
              return errorHandler.fatalError("Error detected in Markup declaration");
            }
            if (!current) {
              return errorHandler.fatalError("Error in internal subset at position " + p.getIndex());
            }
          }
          return errorHandler.fatalError("doctype internal subset is not well-formed, missing ]");
        }
      }
      function parseDoctypeCommentOrCData(source, start, domBuilder, errorHandler, isHTML) {
        var p = parseUtils(source, start);
        switch (isHTML ? p.char(2).toUpperCase() : p.char(2)) {
          case "-":
            var comment = p.getMatch(g.Comment);
            if (comment) {
              domBuilder.comment(comment, g.COMMENT_START.length, comment.length - g.COMMENT_START.length - g.COMMENT_END.length);
              return p.getIndex();
            } else {
              return errorHandler.fatalError("comment is not well-formed at position " + p.getIndex());
            }
          case "[":
            var cdata = p.getMatch(g.CDSect);
            if (cdata) {
              if (!isHTML && !domBuilder.currentElement) {
                return errorHandler.fatalError("CDATA outside of element");
              }
              domBuilder.startCDATA();
              domBuilder.characters(cdata, g.CDATA_START.length, cdata.length - g.CDATA_START.length - g.CDATA_END.length);
              domBuilder.endCDATA();
              return p.getIndex();
            } else {
              return errorHandler.fatalError("Invalid CDATA starting at position " + start);
            }
          case "D": {
            if (domBuilder.doc && domBuilder.doc.documentElement) {
              return errorHandler.fatalError("Doctype not allowed inside or after documentElement at position " + p.getIndex());
            }
            if (isHTML ? !p.substringStartsWithCaseInsensitive(g.DOCTYPE_DECL_START) : !p.substringStartsWith(g.DOCTYPE_DECL_START)) {
              return errorHandler.fatalError("Expected " + g.DOCTYPE_DECL_START + " at position " + p.getIndex());
            }
            p.skip(g.DOCTYPE_DECL_START.length);
            if (p.skipBlanks() < 1) {
              return errorHandler.fatalError("Expected whitespace after " + g.DOCTYPE_DECL_START + " at position " + p.getIndex());
            }
            var doctype = {
              name: void 0,
              publicId: void 0,
              systemId: void 0,
              internalSubset: void 0
            };
            doctype.name = p.getMatch(g.Name);
            if (!doctype.name)
              return errorHandler.fatalError("doctype name missing or contains unexpected characters at position " + p.getIndex());
            if (isHTML && doctype.name.toLowerCase() !== "html") {
              errorHandler.warning("Unexpected DOCTYPE in HTML document at position " + p.getIndex());
            }
            p.skipBlanks();
            if (p.substringStartsWith(g.PUBLIC) || p.substringStartsWith(g.SYSTEM)) {
              var match = g.ExternalID_match.exec(p.substringFromIndex());
              if (!match) {
                return errorHandler.fatalError("doctype external id is not well-formed at position " + p.getIndex());
              }
              if (match.groups.SystemLiteralOnly !== void 0) {
                doctype.systemId = match.groups.SystemLiteralOnly;
              } else {
                doctype.systemId = match.groups.SystemLiteral;
                doctype.publicId = match.groups.PubidLiteral;
              }
              p.skip(match[0].length);
            } else if (isHTML && p.substringStartsWithCaseInsensitive(g.SYSTEM)) {
              p.skip(g.SYSTEM.length);
              if (p.skipBlanks() < 1) {
                return errorHandler.fatalError("Expected whitespace after " + g.SYSTEM + " at position " + p.getIndex());
              }
              doctype.systemId = p.getMatch(g.ABOUT_LEGACY_COMPAT_SystemLiteral);
              if (!doctype.systemId) {
                return errorHandler.fatalError(
                  "Expected " + g.ABOUT_LEGACY_COMPAT + " in single or double quotes after " + g.SYSTEM + " at position " + p.getIndex()
                );
              }
            }
            if (isHTML && doctype.systemId && !g.ABOUT_LEGACY_COMPAT_SystemLiteral.test(doctype.systemId)) {
              errorHandler.warning("Unexpected doctype.systemId in HTML document at position " + p.getIndex());
            }
            if (!isHTML) {
              p.skipBlanks();
              doctype.internalSubset = parseDoctypeInternalSubset(p, errorHandler);
            }
            p.skipBlanks();
            if (p.char() !== ">") {
              return errorHandler.fatalError("doctype not terminated with > at position " + p.getIndex());
            }
            p.skip(1);
            domBuilder.startDTD(doctype.name, doctype.publicId, doctype.systemId, doctype.internalSubset);
            domBuilder.endDTD();
            return p.getIndex();
          }
          default:
            return errorHandler.fatalError('Not well-formed XML starting with "<!" at position ' + start);
        }
      }
      function parseProcessingInstruction(source, start, domBuilder, errorHandler) {
        var match = source.substring(start).match(g.PI);
        if (!match) {
          return errorHandler.fatalError("Invalid processing instruction starting at position " + start);
        }
        if (match[1].toLowerCase() === "xml") {
          if (start > 0) {
            return errorHandler.fatalError(
              "processing instruction at position " + start + " is an xml declaration which is only at the start of the document"
            );
          }
          if (!g.XMLDecl.test(source.substring(start))) {
            return errorHandler.fatalError("xml declaration is not well-formed");
          }
        }
        domBuilder.processingInstruction(match[1], match[2]);
        return start + match[0].length;
      }
      function ElementAttributes() {
        this.attributeNames = /* @__PURE__ */ Object.create(null);
      }
      ElementAttributes.prototype = {
        setTagName: function(tagName) {
          if (!g.QName_exact.test(tagName)) {
            throw new Error("invalid tagName:" + tagName);
          }
          this.tagName = tagName;
        },
        addValue: function(qName, value, offset) {
          if (!g.QName_exact.test(qName)) {
            throw new Error("invalid attribute:" + qName);
          }
          this.attributeNames[qName] = this.length;
          this[this.length++] = { qName, value, offset };
        },
        length: 0,
        getLocalName: function(i) {
          return this[i].localName;
        },
        getLocator: function(i) {
          return this[i].locator;
        },
        getQName: function(i) {
          return this[i].qName;
        },
        getURI: function(i) {
          return this[i].uri;
        },
        getValue: function(i) {
          return this[i].value;
        }
        //	,getIndex:function(uri, localName)){
        //		if(localName){
        //
        //		}else{
        //			var qName = uri
        //		}
        //	},
        //	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
        //	getType:function(uri,localName){}
        //	getType:function(i){},
      };
      exports.XMLReader = XMLReader;
      exports.parseUtils = parseUtils;
      exports.parseDoctypeCommentOrCData = parseDoctypeCommentOrCData;
    }
  });

  // node_modules/@xmldom/xmldom/lib/dom-parser.js
  var require_dom_parser = __commonJS({
    "node_modules/@xmldom/xmldom/lib/dom-parser.js"(exports) {
      "use strict";
      var conventions = require_conventions();
      var dom = require_dom();
      var errors = require_errors();
      var entities = require_entities();
      var sax = require_sax();
      var DOMImplementation = dom.DOMImplementation;
      var hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
      var isHTMLMimeType = conventions.isHTMLMimeType;
      var isValidMimeType = conventions.isValidMimeType;
      var MIME_TYPE = conventions.MIME_TYPE;
      var NAMESPACE = conventions.NAMESPACE;
      var ParseError = errors.ParseError;
      var XMLReader = sax.XMLReader;
      function normalizeLineEndings(input) {
        return input.replace(/\r[\n\u0085]/g, "\n").replace(/[\r\u0085\u2028\u2029]/g, "\n");
      }
      function DOMParser(options) {
        options = options || {};
        if (options.locator === void 0) {
          options.locator = true;
        }
        this.assign = options.assign || conventions.assign;
        this.domHandler = options.domHandler || DOMHandler;
        this.onError = options.onError || options.errorHandler;
        if (options.errorHandler && typeof options.errorHandler !== "function") {
          throw new TypeError("errorHandler object is no longer supported, switch to onError!");
        } else if (options.errorHandler) {
          options.errorHandler("warning", "The `errorHandler` option has been deprecated, use `onError` instead!", this);
        }
        this.normalizeLineEndings = options.normalizeLineEndings || normalizeLineEndings;
        this.locator = !!options.locator;
        this.xmlns = this.assign(/* @__PURE__ */ Object.create(null), options.xmlns);
      }
      DOMParser.prototype.parseFromString = function(source, mimeType) {
        if (!isValidMimeType(mimeType)) {
          throw new TypeError('DOMParser.parseFromString: the provided mimeType "' + mimeType + '" is not valid.');
        }
        var defaultNSMap = this.assign(/* @__PURE__ */ Object.create(null), this.xmlns);
        var entityMap = entities.XML_ENTITIES;
        var defaultNamespace = defaultNSMap[""] || null;
        if (hasDefaultHTMLNamespace(mimeType)) {
          entityMap = entities.HTML_ENTITIES;
          defaultNamespace = NAMESPACE.HTML;
        } else if (mimeType === MIME_TYPE.XML_SVG_IMAGE) {
          defaultNamespace = NAMESPACE.SVG;
        }
        defaultNSMap[""] = defaultNamespace;
        defaultNSMap.xml = defaultNSMap.xml || NAMESPACE.XML;
        var domBuilder = new this.domHandler({
          mimeType,
          defaultNamespace,
          onError: this.onError
        });
        var locator = this.locator ? {} : void 0;
        if (this.locator) {
          domBuilder.setDocumentLocator(locator);
        }
        var sax2 = new XMLReader();
        sax2.errorHandler = domBuilder;
        sax2.domBuilder = domBuilder;
        var isXml = !conventions.isHTMLMimeType(mimeType);
        if (isXml && typeof source !== "string") {
          sax2.errorHandler.fatalError("source is not a string");
        }
        sax2.parse(this.normalizeLineEndings(String(source)), defaultNSMap, entityMap);
        if (!domBuilder.doc.documentElement) {
          sax2.errorHandler.fatalError("missing root element");
        }
        return domBuilder.doc;
      };
      function DOMHandler(options) {
        var opt = options || {};
        this.mimeType = opt.mimeType || MIME_TYPE.XML_APPLICATION;
        this.defaultNamespace = opt.defaultNamespace || null;
        this.cdata = false;
        this.currentElement = void 0;
        this.doc = void 0;
        this.locator = void 0;
        this.onError = opt.onError;
      }
      function position(locator, node) {
        node.lineNumber = locator.lineNumber;
        node.columnNumber = locator.columnNumber;
      }
      DOMHandler.prototype = {
        /**
         * Either creates an XML or an HTML document and stores it under `this.doc`.
         * If it is an XML document, `this.defaultNamespace` is used to create it,
         * and it will not contain any `childNodes`.
         * If it is an HTML document, it will be created without any `childNodes`.
         *
         * @see http://www.saxproject.org/apidoc/org/xml/sax/ContentHandler.html
         */
        startDocument: function() {
          var impl = new DOMImplementation();
          this.doc = isHTMLMimeType(this.mimeType) ? impl.createHTMLDocument(false) : impl.createDocument(this.defaultNamespace, "");
        },
        startElement: function(namespaceURI, localName, qName, attrs) {
          var doc = this.doc;
          var el = doc.createElementNS(namespaceURI, qName || localName);
          var len = attrs.length;
          appendElement(this, el);
          this.currentElement = el;
          this.locator && position(this.locator, el);
          for (var i = 0; i < len; i++) {
            var namespaceURI = attrs.getURI(i);
            var value = attrs.getValue(i);
            var qName = attrs.getQName(i);
            var attr = doc.createAttributeNS(namespaceURI, qName);
            this.locator && position(attrs.getLocator(i), attr);
            attr.value = attr.nodeValue = value;
            el.setAttributeNode(attr);
          }
        },
        endElement: function(namespaceURI, localName, qName) {
          this.currentElement = this.currentElement.parentNode;
        },
        startPrefixMapping: function(prefix, uri) {
        },
        endPrefixMapping: function(prefix) {
        },
        processingInstruction: function(target, data) {
          var ins = this.doc.createProcessingInstruction(target, data);
          this.locator && position(this.locator, ins);
          appendElement(this, ins);
        },
        ignorableWhitespace: function(ch, start, length) {
        },
        characters: function(chars, start, length) {
          chars = _toString.apply(this, arguments);
          if (chars) {
            if (this.cdata) {
              var charNode = this.doc.createCDATASection(chars);
            } else {
              var charNode = this.doc.createTextNode(chars);
            }
            if (this.currentElement) {
              this.currentElement.appendChild(charNode);
            } else if (/^\s*$/.test(chars)) {
              this.doc.appendChild(charNode);
            }
            this.locator && position(this.locator, charNode);
          }
        },
        skippedEntity: function(name2) {
        },
        endDocument: function() {
          this.doc.normalize();
        },
        /**
         * Stores the locator to be able to set the `columnNumber` and `lineNumber`
         * on the created DOM nodes.
         *
         * @param {Locator} locator
         */
        setDocumentLocator: function(locator) {
          if (locator) {
            locator.lineNumber = 0;
          }
          this.locator = locator;
        },
        //LexicalHandler
        comment: function(chars, start, length) {
          chars = _toString.apply(this, arguments);
          var comm = this.doc.createComment(chars);
          this.locator && position(this.locator, comm);
          appendElement(this, comm);
        },
        startCDATA: function() {
          this.cdata = true;
        },
        endCDATA: function() {
          this.cdata = false;
        },
        startDTD: function(name2, publicId, systemId, internalSubset) {
          var impl = this.doc.implementation;
          if (impl && impl.createDocumentType) {
            var dt = impl.createDocumentType(name2, publicId, systemId, internalSubset);
            this.locator && position(this.locator, dt);
            appendElement(this, dt);
            this.doc.doctype = dt;
          }
        },
        reportError: function(level, message) {
          if (typeof this.onError === "function") {
            try {
              this.onError(level, message, this);
            } catch (e) {
              throw new ParseError("Reporting " + level + ' "' + message + '" caused ' + e, this.locator);
            }
          } else {
            console.error("[xmldom " + level + "]	" + message, _locator(this.locator));
          }
        },
        /**
         * @see http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
         */
        warning: function(message) {
          this.reportError("warning", message);
        },
        error: function(message) {
          this.reportError("error", message);
        },
        /**
         * This function reports a fatal error and throws a ParseError.
         *
         * @param {string} message
         * - The message to be used for reporting and throwing the error.
         * @param {Error} [cause]
         * The error that caused this fatal error, preserved as the thrown `ParseError`'s `cause`.
         * @returns {never}
         * This function always throws an error and never returns a value.
         * @throws {ParseError}
         * Always throws a ParseError with the provided message.
         */
        fatalError: function(message, cause) {
          this.reportError("fatalError", message);
          throw new ParseError(message, this.locator, cause);
        }
      };
      function _locator(l) {
        if (l) {
          return "\n@#[line:" + l.lineNumber + ",col:" + l.columnNumber + "]";
        }
      }
      function _toString(chars, start, length) {
        if (typeof chars == "string") {
          return chars.substr(start, length);
        } else {
          if (chars.length >= start + length || start) {
            return new java.lang.String(chars, start, length) + "";
          }
          return chars;
        }
      }
      "endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(
        /\w+/g,
        function(key) {
          DOMHandler.prototype[key] = function() {
            return null;
          };
        }
      );
      function appendElement(handler, node) {
        if (!handler.currentElement) {
          handler.doc.appendChild(node);
        } else {
          handler.currentElement.appendChild(node);
        }
      }
      function onErrorStopParsing(level) {
        if (level === "error") throw "onErrorStopParsing";
      }
      function onWarningStopParsing() {
        throw "onWarningStopParsing";
      }
      exports.__DOMHandler = DOMHandler;
      exports.DOMParser = DOMParser;
      exports.normalizeLineEndings = normalizeLineEndings;
      exports.onErrorStopParsing = onErrorStopParsing;
      exports.onWarningStopParsing = onWarningStopParsing;
    }
  });

  // node_modules/@xmldom/xmldom/lib/index.js
  var require_lib = __commonJS({
    "node_modules/@xmldom/xmldom/lib/index.js"(exports) {
      "use strict";
      var conventions = require_conventions();
      exports.assign = conventions.assign;
      exports.hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
      exports.isHTMLMimeType = conventions.isHTMLMimeType;
      exports.isValidMimeType = conventions.isValidMimeType;
      exports.MIME_TYPE = conventions.MIME_TYPE;
      exports.NAMESPACE = conventions.NAMESPACE;
      var errors = require_errors();
      exports.DOMException = errors.DOMException;
      exports.DOMExceptionName = errors.DOMExceptionName;
      exports.ExceptionCode = errors.ExceptionCode;
      exports.ParseError = errors.ParseError;
      var dom = require_dom();
      exports.Attr = dom.Attr;
      exports.CDATASection = dom.CDATASection;
      exports.CharacterData = dom.CharacterData;
      exports.Comment = dom.Comment;
      exports.Document = dom.Document;
      exports.DocumentFragment = dom.DocumentFragment;
      exports.DocumentType = dom.DocumentType;
      exports.DOMImplementation = dom.DOMImplementation;
      exports.Element = dom.Element;
      exports.Entity = dom.Entity;
      exports.EntityReference = dom.EntityReference;
      exports.LiveNodeList = dom.LiveNodeList;
      exports.NamedNodeMap = dom.NamedNodeMap;
      exports.Node = dom.Node;
      exports.NodeList = dom.NodeList;
      exports.Notation = dom.Notation;
      exports.ProcessingInstruction = dom.ProcessingInstruction;
      exports.Text = dom.Text;
      exports.XMLSerializer = dom.XMLSerializer;
      var domParser = require_dom_parser();
      exports.DOMParser = domParser.DOMParser;
      exports.normalizeLineEndings = domParser.normalizeLineEndings;
      exports.onErrorStopParsing = domParser.onErrorStopParsing;
      exports.onWarningStopParsing = domParser.onWarningStopParsing;
    }
  });

  // node_modules/xpath/xpath.js
  var require_xpath = __commonJS({
    "node_modules/xpath/xpath.js"(exports) {
      var xpath = typeof exports === "undefined" ? {} : exports;
      (function(exports2) {
        "use strict";
        var NAMESPACE_NODE_NODETYPE = "__namespace";
        var isNil = function(x) {
          return x === null || x === void 0;
        };
        var isPositiveInteger = function(x) {
          return typeof x === "number" && x >= 1 && Math.floor(x) === x;
        };
        var isValidNodeType = function(nodeType) {
          return nodeType === NAMESPACE_NODE_NODETYPE || Number.isInteger(nodeType) && nodeType >= 1 && nodeType <= 11;
        };
        var isNodeLike = function(value) {
          return value && isValidNodeType(value.nodeType) && typeof value.nodeName === "string";
        };
        function curry(func) {
          var slice = Array.prototype.slice, totalargs = func.length, partial = function(args, fn3) {
            return function() {
              return fn3.apply(this, args.concat(slice.call(arguments)));
            };
          }, fn2 = function() {
            var args = slice.call(arguments);
            return args.length < totalargs ? partial(args, fn2) : func.apply(this, slice.apply(arguments, [0, totalargs]));
          };
          return fn2;
        }
        var forEach = function(f, xs) {
          for (var i = 0; i < xs.length; i += 1) {
            f(xs[i], i, xs);
          }
        };
        var reduce = function(f, seed, xs) {
          var acc = seed;
          forEach(function(x, i) {
            acc = f(acc, x, i);
          }, xs);
          return acc;
        };
        var map = function(f, xs) {
          var mapped = new Array(xs.length);
          forEach(function(x, i) {
            mapped[i] = f(x);
          }, xs);
          return mapped;
        };
        var filter = function(f, xs) {
          var filtered = [];
          forEach(function(x, i) {
            if (f(x, i)) {
              filtered.push(x);
            }
          }, xs);
          return filtered;
        };
        var includes = function(values, value) {
          for (var i = 0; i < values.length; i += 1) {
            if (values[i] === value) {
              return true;
            }
          }
          return false;
        };
        function always(value) {
          return function() {
            return value;
          };
        }
        function toString(x) {
          return x.toString();
        }
        var join = function(s, xs) {
          return xs.join(s);
        };
        var wrap = function(pref, suf, str) {
          return pref + str + suf;
        };
        var prototypeConcat = Array.prototype.concat;
        var sortNodes = function(nodes, reverse) {
          var ns = new XNodeSet();
          ns.addArray(nodes);
          var sorted = ns.toArray();
          return reverse ? sorted.reverse() : sorted;
        };
        var MAX_ARGUMENT_LENGTH = 32767;
        function flatten(arr) {
          var result = [];
          for (var start = 0; start < arr.length; start += MAX_ARGUMENT_LENGTH) {
            var chunk = arr.slice(start, start + MAX_ARGUMENT_LENGTH);
            result = prototypeConcat.apply(result, chunk);
          }
          return result;
        }
        function assign(target, varArgs) {
          var to = Object(target);
          for (var index = 1; index < arguments.length; index++) {
            var nextSource = arguments[index];
            if (nextSource != null) {
              for (var nextKey in nextSource) {
                if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                  to[nextKey] = nextSource[nextKey];
                }
              }
            }
          }
          return to;
        }
        var NodeTypes = {
          ELEMENT_NODE: 1,
          ATTRIBUTE_NODE: 2,
          TEXT_NODE: 3,
          CDATA_SECTION_NODE: 4,
          PROCESSING_INSTRUCTION_NODE: 7,
          COMMENT_NODE: 8,
          DOCUMENT_NODE: 9,
          DOCUMENT_TYPE_NODE: 10,
          DOCUMENT_FRAGMENT_NODE: 11,
          NAMESPACE_NODE: NAMESPACE_NODE_NODETYPE
        };
        XPathParser.prototype = new Object();
        XPathParser.prototype.constructor = XPathParser;
        XPathParser.superclass = Object.prototype;
        function XPathParser() {
          this.init();
        }
        XPathParser.prototype.init = function() {
          this.reduceActions = [];
          this.reduceActions[3] = function(rhs) {
            return new OrOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[5] = function(rhs) {
            return new AndOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[7] = function(rhs) {
            return new EqualsOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[8] = function(rhs) {
            return new NotEqualOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[10] = function(rhs) {
            return new LessThanOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[11] = function(rhs) {
            return new GreaterThanOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[12] = function(rhs) {
            return new LessThanOrEqualOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[13] = function(rhs) {
            return new GreaterThanOrEqualOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[15] = function(rhs) {
            return new PlusOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[16] = function(rhs) {
            return new MinusOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[18] = function(rhs) {
            return new MultiplyOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[19] = function(rhs) {
            return new DivOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[20] = function(rhs) {
            return new ModOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[22] = function(rhs) {
            return new UnaryMinusOperation(rhs[1]);
          };
          this.reduceActions[24] = function(rhs) {
            return new BarOperation(rhs[0], rhs[2]);
          };
          this.reduceActions[25] = function(rhs) {
            return new PathExpr(void 0, void 0, rhs[0]);
          };
          this.reduceActions[27] = function(rhs) {
            rhs[0].locationPath = rhs[2];
            return rhs[0];
          };
          this.reduceActions[28] = function(rhs) {
            rhs[0].locationPath = rhs[2];
            rhs[0].locationPath.steps.unshift(new Step(Step.DESCENDANTORSELF, NodeTest.nodeTest, []));
            return rhs[0];
          };
          this.reduceActions[29] = function(rhs) {
            return new PathExpr(rhs[0], [], void 0);
          };
          this.reduceActions[30] = function(rhs) {
            if (Utilities.instance_of(rhs[0], PathExpr)) {
              if (rhs[0].filterPredicates == void 0) {
                rhs[0].filterPredicates = [];
              }
              rhs[0].filterPredicates.push(rhs[1]);
              return rhs[0];
            } else {
              return new PathExpr(rhs[0], [rhs[1]], void 0);
            }
          };
          this.reduceActions[32] = function(rhs) {
            return rhs[1];
          };
          this.reduceActions[33] = function(rhs) {
            return new XString(rhs[0]);
          };
          this.reduceActions[34] = function(rhs) {
            return new XNumber(rhs[0]);
          };
          this.reduceActions[36] = function(rhs) {
            return new FunctionCall(rhs[0], []);
          };
          this.reduceActions[37] = function(rhs) {
            return new FunctionCall(rhs[0], rhs[2]);
          };
          this.reduceActions[38] = function(rhs) {
            return [rhs[0]];
          };
          this.reduceActions[39] = function(rhs) {
            rhs[2].unshift(rhs[0]);
            return rhs[2];
          };
          this.reduceActions[43] = function(rhs) {
            return new LocationPath(true, []);
          };
          this.reduceActions[44] = function(rhs) {
            rhs[1].absolute = true;
            return rhs[1];
          };
          this.reduceActions[46] = function(rhs) {
            return new LocationPath(false, [rhs[0]]);
          };
          this.reduceActions[47] = function(rhs) {
            rhs[0].steps.push(rhs[2]);
            return rhs[0];
          };
          this.reduceActions[49] = function(rhs) {
            return new Step(rhs[0], rhs[1], []);
          };
          this.reduceActions[50] = function(rhs) {
            return new Step(Step.CHILD, rhs[0], []);
          };
          this.reduceActions[51] = function(rhs) {
            return new Step(rhs[0], rhs[1], rhs[2]);
          };
          this.reduceActions[52] = function(rhs) {
            return new Step(Step.CHILD, rhs[0], rhs[1]);
          };
          this.reduceActions[54] = function(rhs) {
            return [rhs[0]];
          };
          this.reduceActions[55] = function(rhs) {
            rhs[1].unshift(rhs[0]);
            return rhs[1];
          };
          this.reduceActions[56] = function(rhs) {
            if (rhs[0] == "ancestor") {
              return Step.ANCESTOR;
            } else if (rhs[0] == "ancestor-or-self") {
              return Step.ANCESTORORSELF;
            } else if (rhs[0] == "attribute") {
              return Step.ATTRIBUTE;
            } else if (rhs[0] == "child") {
              return Step.CHILD;
            } else if (rhs[0] == "descendant") {
              return Step.DESCENDANT;
            } else if (rhs[0] == "descendant-or-self") {
              return Step.DESCENDANTORSELF;
            } else if (rhs[0] == "following") {
              return Step.FOLLOWING;
            } else if (rhs[0] == "following-sibling") {
              return Step.FOLLOWINGSIBLING;
            } else if (rhs[0] == "namespace") {
              return Step.NAMESPACE;
            } else if (rhs[0] == "parent") {
              return Step.PARENT;
            } else if (rhs[0] == "preceding") {
              return Step.PRECEDING;
            } else if (rhs[0] == "preceding-sibling") {
              return Step.PRECEDINGSIBLING;
            } else if (rhs[0] == "self") {
              return Step.SELF;
            }
            return -1;
          };
          this.reduceActions[57] = function(rhs) {
            return Step.ATTRIBUTE;
          };
          this.reduceActions[59] = function(rhs) {
            if (rhs[0] == "comment") {
              return NodeTest.commentTest;
            } else if (rhs[0] == "text") {
              return NodeTest.textTest;
            } else if (rhs[0] == "processing-instruction") {
              return NodeTest.anyPiTest;
            } else if (rhs[0] == "node") {
              return NodeTest.nodeTest;
            }
            return new NodeTest(-1, void 0);
          };
          this.reduceActions[60] = function(rhs) {
            return new NodeTest.PITest(rhs[2]);
          };
          this.reduceActions[61] = function(rhs) {
            return rhs[1];
          };
          this.reduceActions[63] = function(rhs) {
            rhs[1].absolute = true;
            rhs[1].steps.unshift(new Step(Step.DESCENDANTORSELF, NodeTest.nodeTest, []));
            return rhs[1];
          };
          this.reduceActions[64] = function(rhs) {
            rhs[0].steps.push(new Step(Step.DESCENDANTORSELF, NodeTest.nodeTest, []));
            rhs[0].steps.push(rhs[2]);
            return rhs[0];
          };
          this.reduceActions[65] = function(rhs) {
            return new Step(Step.SELF, NodeTest.nodeTest, []);
          };
          this.reduceActions[66] = function(rhs) {
            return new Step(Step.PARENT, NodeTest.nodeTest, []);
          };
          this.reduceActions[67] = function(rhs) {
            return new VariableReference(rhs[1]);
          };
          this.reduceActions[68] = function(rhs) {
            return NodeTest.nameTestAny;
          };
          this.reduceActions[69] = function(rhs) {
            return new NodeTest.NameTestPrefixAny(rhs[0].split(":")[0]);
          };
          this.reduceActions[70] = function(rhs) {
            return new NodeTest.NameTestQName(rhs[0]);
          };
        };
        XPathParser.actionTable = [
          " s s        sssssssss    s ss  s  ss",
          "                 s                  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "                rrrrr               ",
          " s s        sssssssss    s ss  s  ss",
          "rs  rrrrrrrr s  sssssrrrrrr  rrs rs ",
          " s s        sssssssss    s ss  s  ss",
          "                            s       ",
          "                            s       ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "  s                                 ",
          "                            s       ",
          " s           s  sssss          s  s ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "a                                   ",
          "r       s                    rr  r  ",
          "r      sr                    rr  r  ",
          "r   s  rr            s       rr  r  ",
          "r   rssrr            rss     rr  r  ",
          "r   rrrrr            rrrss   rr  r  ",
          "r   rrrrrsss         rrrrr   rr  r  ",
          "r   rrrrrrrr         rrrrr   rr  r  ",
          "r   rrrrrrrr         rrrrrs  rr  r  ",
          "r   rrrrrrrr         rrrrrr  rr  r  ",
          "r   rrrrrrrr         rrrrrr  rr  r  ",
          "r  srrrrrrrr         rrrrrrs rr sr  ",
          "r  srrrrrrrr         rrrrrrs rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r   rrrrrrrr         rrrrrr  rr  r  ",
          "r   rrrrrrrr         rrrrrr  rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "                sssss               ",
          "r  rrrrrrrrr         rrrrrrr rr sr  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "                             s      ",
          "r  srrrrrrrr         rrrrrrs rr  r  ",
          "r   rrrrrrrr         rrrrr   rr  r  ",
          "              s                     ",
          "                             s      ",
          "                rrrrr               ",
          " s s        sssssssss    s sss s  ss",
          "r  srrrrrrrr         rrrrrrs rr  r  ",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s s        sssssssss      ss  s  ss",
          " s s        sssssssss    s ss  s  ss",
          " s           s  sssss          s  s ",
          " s           s  sssss          s  s ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          " s           s  sssss          s  s ",
          " s           s  sssss          s  s ",
          "r  rrrrrrrrr         rrrrrrr rr sr  ",
          "r  rrrrrrrrr         rrrrrrr rr sr  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "                             s      ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "                             rr     ",
          "                             s      ",
          "                             rs     ",
          "r      sr                    rr  r  ",
          "r   s  rr            s       rr  r  ",
          "r   rssrr            rss     rr  r  ",
          "r   rssrr            rss     rr  r  ",
          "r   rrrrr            rrrss   rr  r  ",
          "r   rrrrr            rrrss   rr  r  ",
          "r   rrrrr            rrrss   rr  r  ",
          "r   rrrrr            rrrss   rr  r  ",
          "r   rrrrrsss         rrrrr   rr  r  ",
          "r   rrrrrsss         rrrrr   rr  r  ",
          "r   rrrrrrrr         rrrrr   rr  r  ",
          "r   rrrrrrrr         rrrrr   rr  r  ",
          "r   rrrrrrrr         rrrrr   rr  r  ",
          "r   rrrrrrrr         rrrrrr  rr  r  ",
          "                                 r  ",
          "                                 s  ",
          "r  srrrrrrrr         rrrrrrs rr  r  ",
          "r  srrrrrrrr         rrrrrrs rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr  r  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          " s s        sssssssss    s ss  s  ss",
          "r  rrrrrrrrr         rrrrrrr rr rr  ",
          "                             r      "
        ];
        XPathParser.actionTableNumber = [
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          "                 J                  ",
          "a  aaaaaaaaa         aaaaaaa aa  a  ",
          "                YYYYY               ",
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          `K1  KKKKKKKK .  +*)('KKKKKK  KK# K" `,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          "                            N       ",
          "                            O       ",
          "e  eeeeeeeee         eeeeeee ee ee  ",
          "f  fffffffff         fffffff ff ff  ",
          "d  ddddddddd         ddddddd dd dd  ",
          "B  BBBBBBBBB         BBBBBBB BB BB  ",
          "A  AAAAAAAAA         AAAAAAA AA AA  ",
          "  P                                 ",
          "                            Q       ",
          ` 1           .  +*)('          #  " `,
          "b  bbbbbbbbb         bbbbbbb bb  b  ",
          "                                    ",
          "!       S                    !!  !  ",
          '"      T"                    ""  "  ',
          "$   V  $$            U       $$  $  ",
          "&   &ZY&&            &XW     &&  &  ",
          ")   )))))            )))\\[   ))  )  ",
          ".   ....._^]         .....   ..  .  ",
          "1   11111111         11111   11  1  ",
          "5   55555555         55555`  55  5  ",
          "7   77777777         777777  77  7  ",
          "9   99999999         999999  99  9  ",
          ":  c::::::::         ::::::b :: a:  ",
          "I  fIIIIIIII         IIIIIIe II  I  ",
          "=  =========         ======= == ==  ",
          "?  ?????????         ??????? ?? ??  ",
          "C  CCCCCCCCC         CCCCCCC CC CC  ",
          "J   JJJJJJJJ         JJJJJJ  JJ  J  ",
          "M   MMMMMMMM         MMMMMM  MM  M  ",
          "N  NNNNNNNNN         NNNNNNN NN  N  ",
          "P  PPPPPPPPP         PPPPPPP PP  P  ",
          "                +*)('               ",
          "R  RRRRRRRRR         RRRRRRR RR aR  ",
          "U  UUUUUUUUU         UUUUUUU UU  U  ",
          "Z  ZZZZZZZZZ         ZZZZZZZ ZZ ZZ  ",
          "c  ccccccccc         ccccccc cc cc  ",
          "                             j      ",
          "L  fLLLLLLLL         LLLLLLe LL  L  ",
          "6   66666666         66666   66  6  ",
          "              k                     ",
          "                             l      ",
          "                XXXXX               ",
          ` 1 0        /.-,+*)('    & %$m #  "!`,
          "_  f________         ______e __  _  ",
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1 0        /.-,+*)('      %$  #  "!`,
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          ` 1           .  +*)('          #  " `,
          ` 1           .  +*)('          #  " `,
          ">  >>>>>>>>>         >>>>>>> >> >>  ",
          ` 1           .  +*)('          #  " `,
          ` 1           .  +*)('          #  " `,
          "Q  QQQQQQQQQ         QQQQQQQ QQ aQ  ",
          "V  VVVVVVVVV         VVVVVVV VV aV  ",
          "T  TTTTTTTTT         TTTTTTT TT  T  ",
          "@  @@@@@@@@@         @@@@@@@ @@ @@  ",
          "                             \x87      ",
          "[  [[[[[[[[[         [[[[[[[ [[ [[  ",
          "D  DDDDDDDDD         DDDDDDD DD DD  ",
          "                             HH     ",
          "                             \x88      ",
          "                             F\x89     ",
          "#      T#                    ##  #  ",
          "%   V  %%            U       %%  %  ",
          "'   'ZY''            'XW     ''  '  ",
          "(   (ZY((            (XW     ((  (  ",
          "+   +++++            +++\\[   ++  +  ",
          "*   *****            ***\\[   **  *  ",
          "-   -----            ---\\[   --  -  ",
          ",   ,,,,,            ,,,\\[   ,,  ,  ",
          "0   00000_^]         00000   00  0  ",
          "/   /////_^]         /////   //  /  ",
          "2   22222222         22222   22  2  ",
          "3   33333333         33333   33  3  ",
          "4   44444444         44444   44  4  ",
          "8   88888888         888888  88  8  ",
          "                                 ^  ",
          "                                 \x8A  ",
          ";  f;;;;;;;;         ;;;;;;e ;;  ;  ",
          "<  f<<<<<<<<         <<<<<<e <<  <  ",
          "O  OOOOOOOOO         OOOOOOO OO  O  ",
          "`  `````````         ``````` ``  `  ",
          "S  SSSSSSSSS         SSSSSSS SS  S  ",
          "W  WWWWWWWWW         WWWWWWW WW  W  ",
          "\\  \\\\\\\\\\\\\\\\\\         \\\\\\\\\\\\\\ \\\\ \\\\  ",
          "E  EEEEEEEEE         EEEEEEE EE EE  ",
          ` 1 0        /.-,+*)('    & %$  #  "!`,
          "]  ]]]]]]]]]         ]]]]]]] ]] ]]  ",
          "                             G      "
        ];
        XPathParser.gotoTable = [
          "3456789:;<=>?@ AB  CDEFGH IJ ",
          "                             ",
          "                             ",
          "                             ",
          "L456789:;<=>?@ AB  CDEFGH IJ ",
          "            M        EFGH IJ ",
          "       N;<=>?@ AB  CDEFGH IJ ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "            S        EFGH IJ ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "              e              ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                        h  J ",
          "              i          j   ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "o456789:;<=>?@ ABpqCDEFGH IJ ",
          "                             ",
          "  r6789:;<=>?@ AB  CDEFGH IJ ",
          "   s789:;<=>?@ AB  CDEFGH IJ ",
          "    t89:;<=>?@ AB  CDEFGH IJ ",
          "    u89:;<=>?@ AB  CDEFGH IJ ",
          "     v9:;<=>?@ AB  CDEFGH IJ ",
          "     w9:;<=>?@ AB  CDEFGH IJ ",
          "     x9:;<=>?@ AB  CDEFGH IJ ",
          "     y9:;<=>?@ AB  CDEFGH IJ ",
          "      z:;<=>?@ AB  CDEFGH IJ ",
          "      {:;<=>?@ AB  CDEFGH IJ ",
          "       |;<=>?@ AB  CDEFGH IJ ",
          "       };<=>?@ AB  CDEFGH IJ ",
          "       ~;<=>?@ AB  CDEFGH IJ ",
          "         \x7F=>?@ AB  CDEFGH IJ ",
          "\x80456789:;<=>?@ AB  CDEFGH IJ\x81",
          "            \x82        EFGH IJ ",
          "            \x83        EFGH IJ ",
          "                             ",
          "                     \x84 GH IJ ",
          "                     \x85 GH IJ ",
          "              i          \x86   ",
          "              i          \x87   ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "                             ",
          "o456789:;<=>?@ AB\x8CqCDEFGH IJ ",
          "                             ",
          "                             "
        ];
        XPathParser.productions = [
          [1, 1, 2],
          [2, 1, 3],
          [3, 1, 4],
          [3, 3, 3, -9, 4],
          [4, 1, 5],
          [4, 3, 4, -8, 5],
          [5, 1, 6],
          [5, 3, 5, -22, 6],
          [5, 3, 5, -5, 6],
          [6, 1, 7],
          [6, 3, 6, -23, 7],
          [6, 3, 6, -24, 7],
          [6, 3, 6, -6, 7],
          [6, 3, 6, -7, 7],
          [7, 1, 8],
          [7, 3, 7, -25, 8],
          [7, 3, 7, -26, 8],
          [8, 1, 9],
          [8, 3, 8, -12, 9],
          [8, 3, 8, -11, 9],
          [8, 3, 8, -10, 9],
          [9, 1, 10],
          [9, 2, -26, 9],
          [10, 1, 11],
          [10, 3, 10, -27, 11],
          [11, 1, 12],
          [11, 1, 13],
          [11, 3, 13, -28, 14],
          [11, 3, 13, -4, 14],
          [13, 1, 15],
          [13, 2, 13, 16],
          [15, 1, 17],
          [15, 3, -29, 2, -30],
          [15, 1, -15],
          [15, 1, -16],
          [15, 1, 18],
          [18, 3, -13, -29, -30],
          [18, 4, -13, -29, 19, -30],
          [19, 1, 20],
          [19, 3, 20, -31, 19],
          [20, 1, 2],
          [12, 1, 14],
          [12, 1, 21],
          [21, 1, -28],
          [21, 2, -28, 14],
          [21, 1, 22],
          [14, 1, 23],
          [14, 3, 14, -28, 23],
          [14, 1, 24],
          [23, 2, 25, 26],
          [23, 1, 26],
          [23, 3, 25, 26, 27],
          [23, 2, 26, 27],
          [23, 1, 28],
          [27, 1, 16],
          [27, 2, 16, 27],
          [25, 2, -14, -3],
          [25, 1, -32],
          [26, 1, 29],
          [26, 3, -20, -29, -30],
          [26, 4, -21, -29, -15, -30],
          [16, 3, -33, 30, -34],
          [30, 1, 2],
          [22, 2, -4, 14],
          [24, 3, 14, -4, 23],
          [28, 1, -35],
          [28, 1, -2],
          [17, 2, -36, -18],
          [29, 1, -17],
          [29, 1, -19],
          [29, 1, -18]
        ];
        XPathParser.DOUBLEDOT = 2;
        XPathParser.DOUBLECOLON = 3;
        XPathParser.DOUBLESLASH = 4;
        XPathParser.NOTEQUAL = 5;
        XPathParser.LESSTHANOREQUAL = 6;
        XPathParser.GREATERTHANOREQUAL = 7;
        XPathParser.AND = 8;
        XPathParser.OR = 9;
        XPathParser.MOD = 10;
        XPathParser.DIV = 11;
        XPathParser.MULTIPLYOPERATOR = 12;
        XPathParser.FUNCTIONNAME = 13;
        XPathParser.AXISNAME = 14;
        XPathParser.LITERAL = 15;
        XPathParser.NUMBER = 16;
        XPathParser.ASTERISKNAMETEST = 17;
        XPathParser.QNAME = 18;
        XPathParser.NCNAMECOLONASTERISK = 19;
        XPathParser.NODETYPE = 20;
        XPathParser.PROCESSINGINSTRUCTIONWITHLITERAL = 21;
        XPathParser.EQUALS = 22;
        XPathParser.LESSTHAN = 23;
        XPathParser.GREATERTHAN = 24;
        XPathParser.PLUS = 25;
        XPathParser.MINUS = 26;
        XPathParser.BAR = 27;
        XPathParser.SLASH = 28;
        XPathParser.LEFTPARENTHESIS = 29;
        XPathParser.RIGHTPARENTHESIS = 30;
        XPathParser.COMMA = 31;
        XPathParser.AT = 32;
        XPathParser.LEFTBRACKET = 33;
        XPathParser.RIGHTBRACKET = 34;
        XPathParser.DOT = 35;
        XPathParser.DOLLAR = 36;
        XPathParser.prototype.tokenize = function(s1) {
          var types = [];
          var values = [];
          var s = s1 + "\0";
          var pos = 0;
          var c = s.charAt(pos++);
          while (1) {
            while (c == " " || c == "	" || c == "\r" || c == "\n") {
              c = s.charAt(pos++);
            }
            if (c == "\0" || pos >= s.length) {
              break;
            }
            if (c == "(") {
              types.push(XPathParser.LEFTPARENTHESIS);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == ")") {
              types.push(XPathParser.RIGHTPARENTHESIS);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == "[") {
              types.push(XPathParser.LEFTBRACKET);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == "]") {
              types.push(XPathParser.RIGHTBRACKET);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == "@") {
              types.push(XPathParser.AT);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == ",") {
              types.push(XPathParser.COMMA);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == "|") {
              types.push(XPathParser.BAR);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == "+") {
              types.push(XPathParser.PLUS);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == "-") {
              types.push(XPathParser.MINUS);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == "=") {
              types.push(XPathParser.EQUALS);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == "$") {
              types.push(XPathParser.DOLLAR);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == ".") {
              c = s.charAt(pos++);
              if (c == ".") {
                types.push(XPathParser.DOUBLEDOT);
                values.push("..");
                c = s.charAt(pos++);
                continue;
              }
              if (c >= "0" && c <= "9") {
                var number = "." + c;
                c = s.charAt(pos++);
                while (c >= "0" && c <= "9") {
                  number += c;
                  c = s.charAt(pos++);
                }
                types.push(XPathParser.NUMBER);
                values.push(number);
                continue;
              }
              types.push(XPathParser.DOT);
              values.push(".");
              continue;
            }
            if (c == "'" || c == '"') {
              var delimiter = c;
              var literal = "";
              while (pos < s.length && (c = s.charAt(pos)) !== delimiter) {
                literal += c;
                pos += 1;
              }
              if (c !== delimiter) {
                throw XPathException.fromMessage("Unterminated string literal: " + delimiter + literal);
              }
              pos += 1;
              types.push(XPathParser.LITERAL);
              values.push(literal);
              c = s.charAt(pos++);
              continue;
            }
            if (c >= "0" && c <= "9") {
              var number = c;
              c = s.charAt(pos++);
              while (c >= "0" && c <= "9") {
                number += c;
                c = s.charAt(pos++);
              }
              if (c == ".") {
                if (s.charAt(pos) >= "0" && s.charAt(pos) <= "9") {
                  number += c;
                  number += s.charAt(pos++);
                  c = s.charAt(pos++);
                  while (c >= "0" && c <= "9") {
                    number += c;
                    c = s.charAt(pos++);
                  }
                }
              }
              types.push(XPathParser.NUMBER);
              values.push(number);
              continue;
            }
            if (c == "*") {
              if (types.length > 0) {
                var last = types[types.length - 1];
                if (last != XPathParser.AT && last != XPathParser.DOUBLECOLON && last != XPathParser.LEFTPARENTHESIS && last != XPathParser.LEFTBRACKET && last != XPathParser.AND && last != XPathParser.OR && last != XPathParser.MOD && last != XPathParser.DIV && last != XPathParser.MULTIPLYOPERATOR && last != XPathParser.SLASH && last != XPathParser.DOUBLESLASH && last != XPathParser.BAR && last != XPathParser.PLUS && last != XPathParser.MINUS && last != XPathParser.EQUALS && last != XPathParser.NOTEQUAL && last != XPathParser.LESSTHAN && last != XPathParser.LESSTHANOREQUAL && last != XPathParser.GREATERTHAN && last != XPathParser.GREATERTHANOREQUAL) {
                  types.push(XPathParser.MULTIPLYOPERATOR);
                  values.push(c);
                  c = s.charAt(pos++);
                  continue;
                }
              }
              types.push(XPathParser.ASTERISKNAMETEST);
              values.push(c);
              c = s.charAt(pos++);
              continue;
            }
            if (c == ":") {
              if (s.charAt(pos) == ":") {
                types.push(XPathParser.DOUBLECOLON);
                values.push("::");
                pos++;
                c = s.charAt(pos++);
                continue;
              }
            }
            if (c == "/") {
              c = s.charAt(pos++);
              if (c == "/") {
                types.push(XPathParser.DOUBLESLASH);
                values.push("//");
                c = s.charAt(pos++);
                continue;
              }
              types.push(XPathParser.SLASH);
              values.push("/");
              continue;
            }
            if (c == "!") {
              if (s.charAt(pos) == "=") {
                types.push(XPathParser.NOTEQUAL);
                values.push("!=");
                pos++;
                c = s.charAt(pos++);
                continue;
              }
            }
            if (c == "<") {
              if (s.charAt(pos) == "=") {
                types.push(XPathParser.LESSTHANOREQUAL);
                values.push("<=");
                pos++;
                c = s.charAt(pos++);
                continue;
              }
              types.push(XPathParser.LESSTHAN);
              values.push("<");
              c = s.charAt(pos++);
              continue;
            }
            if (c == ">") {
              if (s.charAt(pos) == "=") {
                types.push(XPathParser.GREATERTHANOREQUAL);
                values.push(">=");
                pos++;
                c = s.charAt(pos++);
                continue;
              }
              types.push(XPathParser.GREATERTHAN);
              values.push(">");
              c = s.charAt(pos++);
              continue;
            }
            if (c == "_" || Utilities.isLetter(c.charCodeAt(0))) {
              var name2 = c;
              c = s.charAt(pos++);
              while (Utilities.isNCNameChar(c.charCodeAt(0))) {
                name2 += c;
                c = s.charAt(pos++);
              }
              if (types.length > 0) {
                var last = types[types.length - 1];
                if (last != XPathParser.AT && last != XPathParser.DOUBLECOLON && last != XPathParser.LEFTPARENTHESIS && last != XPathParser.LEFTBRACKET && last != XPathParser.AND && last != XPathParser.OR && last != XPathParser.MOD && last != XPathParser.DIV && last != XPathParser.MULTIPLYOPERATOR && last != XPathParser.SLASH && last != XPathParser.DOUBLESLASH && last != XPathParser.BAR && last != XPathParser.PLUS && last != XPathParser.MINUS && last != XPathParser.EQUALS && last != XPathParser.NOTEQUAL && last != XPathParser.LESSTHAN && last != XPathParser.LESSTHANOREQUAL && last != XPathParser.GREATERTHAN && last != XPathParser.GREATERTHANOREQUAL) {
                  if (name2 == "and") {
                    types.push(XPathParser.AND);
                    values.push(name2);
                    continue;
                  }
                  if (name2 == "or") {
                    types.push(XPathParser.OR);
                    values.push(name2);
                    continue;
                  }
                  if (name2 == "mod") {
                    types.push(XPathParser.MOD);
                    values.push(name2);
                    continue;
                  }
                  if (name2 == "div") {
                    types.push(XPathParser.DIV);
                    values.push(name2);
                    continue;
                  }
                }
              }
              if (c == ":") {
                if (s.charAt(pos) == "*") {
                  types.push(XPathParser.NCNAMECOLONASTERISK);
                  values.push(name2 + ":*");
                  pos++;
                  c = s.charAt(pos++);
                  continue;
                }
                if (s.charAt(pos) == "_" || Utilities.isLetter(s.charCodeAt(pos))) {
                  name2 += ":";
                  c = s.charAt(pos++);
                  while (Utilities.isNCNameChar(c.charCodeAt(0))) {
                    name2 += c;
                    c = s.charAt(pos++);
                  }
                  if (c == "(") {
                    types.push(XPathParser.FUNCTIONNAME);
                    values.push(name2);
                    continue;
                  }
                  types.push(XPathParser.QNAME);
                  values.push(name2);
                  continue;
                }
                if (s.charAt(pos) == ":") {
                  types.push(XPathParser.AXISNAME);
                  values.push(name2);
                  continue;
                }
              }
              if (c == "(") {
                if (name2 == "comment" || name2 == "text" || name2 == "node") {
                  types.push(XPathParser.NODETYPE);
                  values.push(name2);
                  continue;
                }
                if (name2 == "processing-instruction") {
                  if (s.charAt(pos) == ")") {
                    types.push(XPathParser.NODETYPE);
                  } else {
                    types.push(XPathParser.PROCESSINGINSTRUCTIONWITHLITERAL);
                  }
                  values.push(name2);
                  continue;
                }
                types.push(XPathParser.FUNCTIONNAME);
                values.push(name2);
                continue;
              }
              types.push(XPathParser.QNAME);
              values.push(name2);
              continue;
            }
            throw new Error("Unexpected character " + c);
          }
          types.push(1);
          values.push("[EOF]");
          return [types, values];
        };
        XPathParser.SHIFT = "s";
        XPathParser.REDUCE = "r";
        XPathParser.ACCEPT = "a";
        XPathParser.prototype.parse = function(s) {
          if (!s) {
            throw new Error("XPath expression unspecified.");
          }
          if (typeof s !== "string") {
            throw new Error("XPath expression must be a string.");
          }
          var types;
          var values;
          var res = this.tokenize(s);
          if (res == void 0) {
            return void 0;
          }
          types = res[0];
          values = res[1];
          var tokenPos = 0;
          var state = [];
          var tokenType = [];
          var tokenValue = [];
          var s;
          var a;
          var t;
          state.push(0);
          tokenType.push(1);
          tokenValue.push("_S");
          a = types[tokenPos];
          t = values[tokenPos++];
          while (1) {
            s = state[state.length - 1];
            switch (XPathParser.actionTable[s].charAt(a - 1)) {
              case XPathParser.SHIFT:
                tokenType.push(-a);
                tokenValue.push(t);
                state.push(XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32);
                a = types[tokenPos];
                t = values[tokenPos++];
                break;
              case XPathParser.REDUCE:
                var num = XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][1];
                var rhs = [];
                for (var i = 0; i < num; i++) {
                  tokenType.pop();
                  rhs.unshift(tokenValue.pop());
                  state.pop();
                }
                var s_ = state[state.length - 1];
                tokenType.push(XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][0]);
                if (this.reduceActions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32] == void 0) {
                  tokenValue.push(rhs[0]);
                } else {
                  tokenValue.push(this.reduceActions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32](rhs));
                }
                state.push(XPathParser.gotoTable[s_].charCodeAt(XPathParser.productions[XPathParser.actionTableNumber[s].charCodeAt(a - 1) - 32][0] - 2) - 33);
                break;
              case XPathParser.ACCEPT:
                return new XPath(tokenValue.pop());
              default:
                throw new Error("XPath parse error");
            }
          }
        };
        XPath.prototype = new Object();
        XPath.prototype.constructor = XPath;
        XPath.superclass = Object.prototype;
        function XPath(e) {
          this.expression = e;
        }
        XPath.prototype.toString = function() {
          return this.expression.toString();
        };
        function setIfUnset(obj, prop, value) {
          if (!(prop in obj)) {
            obj[prop] = value;
          }
        }
        XPath.prototype.evaluate = function(c) {
          var node = c.expressionContextNode;
          if (!(isNil(node) || isNodeLike(node))) {
            throw new Error("Context node does not appear to be a valid DOM node.");
          }
          var size = isNil(c.expressionContextSize) ? 1 : c.expressionContextSize;
          var position = isNil(c.expressionContextPosition) ? 1 : c.expressionContextPosition;
          if (!isPositiveInteger(size) || !isPositiveInteger(position) || position > size) {
            throw new Error("Context position and size must be positive integers, with position no greater than size.");
          }
          c.contextNode = c.expressionContextNode;
          c.contextSize = size;
          c.contextPosition = position;
          if (c.isHtml) {
            setIfUnset(c, "caseInsensitive", true);
            setIfUnset(c, "allowAnyNamespaceForNoPrefix", true);
          }
          setIfUnset(c, "caseInsensitive", false);
          return this.expression.evaluate(c);
        };
        XPath.XML_NAMESPACE_URI = "http://www.w3.org/XML/1998/namespace";
        XPath.XMLNS_NAMESPACE_URI = "http://www.w3.org/2000/xmlns/";
        Expression.prototype = new Object();
        Expression.prototype.constructor = Expression;
        Expression.superclass = Object.prototype;
        function Expression() {
        }
        Expression.prototype.init = function() {
        };
        Expression.prototype.toString = function() {
          return "<Expression>";
        };
        Expression.prototype.evaluate = function(c) {
          throw new Error("Could not evaluate expression.");
        };
        UnaryOperation.prototype = new Expression();
        UnaryOperation.prototype.constructor = UnaryOperation;
        UnaryOperation.superclass = Expression.prototype;
        function UnaryOperation(rhs) {
          if (arguments.length > 0) {
            this.init(rhs);
          }
        }
        UnaryOperation.prototype.init = function(rhs) {
          this.rhs = rhs;
        };
        UnaryMinusOperation.prototype = new UnaryOperation();
        UnaryMinusOperation.prototype.constructor = UnaryMinusOperation;
        UnaryMinusOperation.superclass = UnaryOperation.prototype;
        function UnaryMinusOperation(rhs) {
          if (arguments.length > 0) {
            this.init(rhs);
          }
        }
        UnaryMinusOperation.prototype.init = function(rhs) {
          UnaryMinusOperation.superclass.init.call(this, rhs);
        };
        UnaryMinusOperation.prototype.evaluate = function(c) {
          return this.rhs.evaluate(c).number().negate();
        };
        UnaryMinusOperation.prototype.toString = function() {
          return "-" + this.rhs.toString();
        };
        BinaryOperation.prototype = new Expression();
        BinaryOperation.prototype.constructor = BinaryOperation;
        BinaryOperation.superclass = Expression.prototype;
        function BinaryOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        BinaryOperation.prototype.init = function(lhs, rhs) {
          this.lhs = lhs;
          this.rhs = rhs;
        };
        OrOperation.prototype = new BinaryOperation();
        OrOperation.prototype.constructor = OrOperation;
        OrOperation.superclass = BinaryOperation.prototype;
        function OrOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        OrOperation.prototype.init = function(lhs, rhs) {
          OrOperation.superclass.init.call(this, lhs, rhs);
        };
        OrOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " or " + this.rhs.toString() + ")";
        };
        OrOperation.prototype.evaluate = function(c) {
          var b = this.lhs.evaluate(c).bool();
          if (b.booleanValue()) {
            return b;
          }
          return this.rhs.evaluate(c).bool();
        };
        AndOperation.prototype = new BinaryOperation();
        AndOperation.prototype.constructor = AndOperation;
        AndOperation.superclass = BinaryOperation.prototype;
        function AndOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        AndOperation.prototype.init = function(lhs, rhs) {
          AndOperation.superclass.init.call(this, lhs, rhs);
        };
        AndOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " and " + this.rhs.toString() + ")";
        };
        AndOperation.prototype.evaluate = function(c) {
          var b = this.lhs.evaluate(c).bool();
          if (!b.booleanValue()) {
            return b;
          }
          return this.rhs.evaluate(c).bool();
        };
        EqualsOperation.prototype = new BinaryOperation();
        EqualsOperation.prototype.constructor = EqualsOperation;
        EqualsOperation.superclass = BinaryOperation.prototype;
        function EqualsOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        EqualsOperation.prototype.init = function(lhs, rhs) {
          EqualsOperation.superclass.init.call(this, lhs, rhs);
        };
        EqualsOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " = " + this.rhs.toString() + ")";
        };
        EqualsOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).equals(this.rhs.evaluate(c));
        };
        NotEqualOperation.prototype = new BinaryOperation();
        NotEqualOperation.prototype.constructor = NotEqualOperation;
        NotEqualOperation.superclass = BinaryOperation.prototype;
        function NotEqualOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        NotEqualOperation.prototype.init = function(lhs, rhs) {
          NotEqualOperation.superclass.init.call(this, lhs, rhs);
        };
        NotEqualOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " != " + this.rhs.toString() + ")";
        };
        NotEqualOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).notequal(this.rhs.evaluate(c));
        };
        LessThanOperation.prototype = new BinaryOperation();
        LessThanOperation.prototype.constructor = LessThanOperation;
        LessThanOperation.superclass = BinaryOperation.prototype;
        function LessThanOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        LessThanOperation.prototype.init = function(lhs, rhs) {
          LessThanOperation.superclass.init.call(this, lhs, rhs);
        };
        LessThanOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).lessthan(this.rhs.evaluate(c));
        };
        LessThanOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " < " + this.rhs.toString() + ")";
        };
        GreaterThanOperation.prototype = new BinaryOperation();
        GreaterThanOperation.prototype.constructor = GreaterThanOperation;
        GreaterThanOperation.superclass = BinaryOperation.prototype;
        function GreaterThanOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        GreaterThanOperation.prototype.init = function(lhs, rhs) {
          GreaterThanOperation.superclass.init.call(this, lhs, rhs);
        };
        GreaterThanOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).greaterthan(this.rhs.evaluate(c));
        };
        GreaterThanOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " > " + this.rhs.toString() + ")";
        };
        LessThanOrEqualOperation.prototype = new BinaryOperation();
        LessThanOrEqualOperation.prototype.constructor = LessThanOrEqualOperation;
        LessThanOrEqualOperation.superclass = BinaryOperation.prototype;
        function LessThanOrEqualOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        LessThanOrEqualOperation.prototype.init = function(lhs, rhs) {
          LessThanOrEqualOperation.superclass.init.call(this, lhs, rhs);
        };
        LessThanOrEqualOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).lessthanorequal(this.rhs.evaluate(c));
        };
        LessThanOrEqualOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " <= " + this.rhs.toString() + ")";
        };
        GreaterThanOrEqualOperation.prototype = new BinaryOperation();
        GreaterThanOrEqualOperation.prototype.constructor = GreaterThanOrEqualOperation;
        GreaterThanOrEqualOperation.superclass = BinaryOperation.prototype;
        function GreaterThanOrEqualOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        GreaterThanOrEqualOperation.prototype.init = function(lhs, rhs) {
          GreaterThanOrEqualOperation.superclass.init.call(this, lhs, rhs);
        };
        GreaterThanOrEqualOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).greaterthanorequal(this.rhs.evaluate(c));
        };
        GreaterThanOrEqualOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " >= " + this.rhs.toString() + ")";
        };
        PlusOperation.prototype = new BinaryOperation();
        PlusOperation.prototype.constructor = PlusOperation;
        PlusOperation.superclass = BinaryOperation.prototype;
        function PlusOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        PlusOperation.prototype.init = function(lhs, rhs) {
          PlusOperation.superclass.init.call(this, lhs, rhs);
        };
        PlusOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).number().plus(this.rhs.evaluate(c).number());
        };
        PlusOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " + " + this.rhs.toString() + ")";
        };
        MinusOperation.prototype = new BinaryOperation();
        MinusOperation.prototype.constructor = MinusOperation;
        MinusOperation.superclass = BinaryOperation.prototype;
        function MinusOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        MinusOperation.prototype.init = function(lhs, rhs) {
          MinusOperation.superclass.init.call(this, lhs, rhs);
        };
        MinusOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).number().minus(this.rhs.evaluate(c).number());
        };
        MinusOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " - " + this.rhs.toString() + ")";
        };
        MultiplyOperation.prototype = new BinaryOperation();
        MultiplyOperation.prototype.constructor = MultiplyOperation;
        MultiplyOperation.superclass = BinaryOperation.prototype;
        function MultiplyOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        MultiplyOperation.prototype.init = function(lhs, rhs) {
          MultiplyOperation.superclass.init.call(this, lhs, rhs);
        };
        MultiplyOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).number().multiply(this.rhs.evaluate(c).number());
        };
        MultiplyOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " * " + this.rhs.toString() + ")";
        };
        DivOperation.prototype = new BinaryOperation();
        DivOperation.prototype.constructor = DivOperation;
        DivOperation.superclass = BinaryOperation.prototype;
        function DivOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        DivOperation.prototype.init = function(lhs, rhs) {
          DivOperation.superclass.init.call(this, lhs, rhs);
        };
        DivOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).number().div(this.rhs.evaluate(c).number());
        };
        DivOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " div " + this.rhs.toString() + ")";
        };
        ModOperation.prototype = new BinaryOperation();
        ModOperation.prototype.constructor = ModOperation;
        ModOperation.superclass = BinaryOperation.prototype;
        function ModOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        ModOperation.prototype.init = function(lhs, rhs) {
          ModOperation.superclass.init.call(this, lhs, rhs);
        };
        ModOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).number().mod(this.rhs.evaluate(c).number());
        };
        ModOperation.prototype.toString = function() {
          return "(" + this.lhs.toString() + " mod " + this.rhs.toString() + ")";
        };
        BarOperation.prototype = new BinaryOperation();
        BarOperation.prototype.constructor = BarOperation;
        BarOperation.superclass = BinaryOperation.prototype;
        function BarOperation(lhs, rhs) {
          if (arguments.length > 0) {
            this.init(lhs, rhs);
          }
        }
        BarOperation.prototype.init = function(lhs, rhs) {
          BarOperation.superclass.init.call(this, lhs, rhs);
        };
        BarOperation.prototype.evaluate = function(c) {
          return this.lhs.evaluate(c).nodeset().union(this.rhs.evaluate(c).nodeset());
        };
        BarOperation.prototype.toString = function() {
          return map(toString, [this.lhs, this.rhs]).join(" | ");
        };
        PathExpr.prototype = new Expression();
        PathExpr.prototype.constructor = PathExpr;
        PathExpr.superclass = Expression.prototype;
        function PathExpr(filter2, filterPreds, locpath) {
          if (arguments.length > 0) {
            this.init(filter2, filterPreds, locpath);
          }
        }
        PathExpr.prototype.init = function(filter2, filterPreds, locpath) {
          PathExpr.superclass.init.call(this);
          this.filter = filter2;
          this.filterPredicates = filterPreds;
          this.locationPath = locpath;
        };
        function findRoot(node) {
          while (node && node.parentNode) {
            node = node.parentNode;
          }
          return node;
        }
        var applyPredicates = function(predicates, c, nodes, reverse) {
          if (predicates.length === 0) {
            return nodes;
          }
          var ctx = c.extend({});
          return reduce(
            function(inNodes, pred) {
              ctx.contextSize = inNodes.length;
              return filter(
                function(node, i) {
                  ctx.contextNode = node;
                  ctx.contextPosition = i + 1;
                  return PathExpr.predicateMatches(pred, ctx);
                },
                inNodes
              );
            },
            sortNodes(nodes, reverse),
            predicates
          );
        };
        PathExpr.getRoot = function(xpc, nodes) {
          var firstNode = nodes[0];
          if (firstNode && firstNode.nodeType === NodeTypes.DOCUMENT_NODE) {
            return firstNode;
          }
          if (xpc.virtualRoot) {
            return xpc.virtualRoot;
          }
          if (!firstNode) {
            throw new Error("Context node not found when determining document root.");
          }
          var ownerDoc = firstNode.ownerDocument;
          if (ownerDoc) {
            return ownerDoc;
          }
          var n = firstNode;
          while (n.parentNode != null) {
            n = n.parentNode;
          }
          return n;
        };
        var getPrefixForNamespaceNode = function(attrNode) {
          var nm = String(attrNode.name);
          if (nm === "xmlns") {
            return "";
          }
          if (nm.substring(0, 6) === "xmlns:") {
            return nm.substring(6, nm.length);
          }
          return null;
        };
        PathExpr.applyStep = function(step, xpc, node) {
          if (!node) {
            throw new Error("Context node not found when evaluating XPath step: " + step);
          }
          var newNodes = [];
          xpc.contextNode = node;
          switch (step.axis) {
            case Step.ANCESTOR:
              if (xpc.contextNode === xpc.virtualRoot) {
                break;
              }
              var m;
              if (xpc.contextNode.nodeType == NodeTypes.ATTRIBUTE_NODE) {
                m = PathExpr.getOwnerElement(xpc.contextNode);
              } else {
                m = xpc.contextNode.parentNode;
              }
              while (m != null) {
                if (step.nodeTest.matches(m, xpc)) {
                  newNodes.push(m);
                }
                if (m === xpc.virtualRoot) {
                  break;
                }
                m = m.parentNode;
              }
              break;
            case Step.ANCESTORORSELF:
              for (var m = xpc.contextNode; m != null; m = m.nodeType == NodeTypes.ATTRIBUTE_NODE ? PathExpr.getOwnerElement(m) : m.parentNode) {
                if (step.nodeTest.matches(m, xpc)) {
                  newNodes.push(m);
                }
                if (m === xpc.virtualRoot) {
                  break;
                }
              }
              break;
            case Step.ATTRIBUTE:
              var nnm = xpc.contextNode.attributes;
              if (nnm != null) {
                for (var k = 0; k < nnm.length; k++) {
                  var m = nnm.item(k);
                  if (step.nodeTest.matches(m, xpc)) {
                    newNodes.push(m);
                  }
                }
              }
              break;
            case Step.CHILD:
              for (var m = xpc.contextNode.firstChild; m != null; m = m.nextSibling) {
                if (step.nodeTest.matches(m, xpc)) {
                  newNodes.push(m);
                }
              }
              break;
            case Step.DESCENDANT:
              var st = [xpc.contextNode.firstChild];
              while (st.length > 0) {
                for (var m = st.pop(); m != null; ) {
                  if (step.nodeTest.matches(m, xpc)) {
                    newNodes.push(m);
                  }
                  if (m.firstChild != null) {
                    st.push(m.nextSibling);
                    m = m.firstChild;
                  } else {
                    m = m.nextSibling;
                  }
                }
              }
              break;
            case Step.DESCENDANTORSELF:
              if (step.nodeTest.matches(xpc.contextNode, xpc)) {
                newNodes.push(xpc.contextNode);
              }
              var st = [xpc.contextNode.firstChild];
              while (st.length > 0) {
                for (var m = st.pop(); m != null; ) {
                  if (step.nodeTest.matches(m, xpc)) {
                    newNodes.push(m);
                  }
                  if (m.firstChild != null) {
                    st.push(m.nextSibling);
                    m = m.firstChild;
                  } else {
                    m = m.nextSibling;
                  }
                }
              }
              break;
            case Step.FOLLOWING:
              if (xpc.contextNode === xpc.virtualRoot) {
                break;
              }
              var st = [];
              if (xpc.contextNode.firstChild != null) {
                st.unshift(xpc.contextNode.firstChild);
              } else {
                st.unshift(xpc.contextNode.nextSibling);
              }
              for (var m = xpc.contextNode.parentNode; m != null && m.nodeType != NodeTypes.DOCUMENT_NODE && m !== xpc.virtualRoot; m = m.parentNode) {
                st.unshift(m.nextSibling);
              }
              do {
                for (var m = st.pop(); m != null; ) {
                  if (step.nodeTest.matches(m, xpc)) {
                    newNodes.push(m);
                  }
                  if (m.firstChild != null) {
                    st.push(m.nextSibling);
                    m = m.firstChild;
                  } else {
                    m = m.nextSibling;
                  }
                }
              } while (st.length > 0);
              break;
            case Step.FOLLOWINGSIBLING:
              if (xpc.contextNode === xpc.virtualRoot) {
                break;
              }
              for (var m = xpc.contextNode.nextSibling; m != null; m = m.nextSibling) {
                if (step.nodeTest.matches(m, xpc)) {
                  newNodes.push(m);
                }
              }
              break;
            case Step.NAMESPACE:
              var nodes = {};
              if (xpc.contextNode.nodeType == NodeTypes.ELEMENT_NODE) {
                nodes["xml"] = new XPathNamespace("xml", null, XPath.XML_NAMESPACE_URI, xpc.contextNode);
                for (var m = xpc.contextNode; m != null && m.nodeType == NodeTypes.ELEMENT_NODE; m = m.parentNode) {
                  for (var k = 0; k < m.attributes.length; k++) {
                    var attr = m.attributes.item(k);
                    var pre = getPrefixForNamespaceNode(attr);
                    if (pre != null && nodes[pre] == void 0) {
                      nodes[pre] = new XPathNamespace(pre, attr, attr.value, xpc.contextNode);
                    }
                  }
                }
                for (var pre in nodes) {
                  var node = nodes[pre];
                  if (step.nodeTest.matches(node, xpc)) {
                    newNodes.push(node);
                  }
                }
              }
              break;
            case Step.PARENT:
              m = null;
              if (xpc.contextNode !== xpc.virtualRoot) {
                if (xpc.contextNode.nodeType == NodeTypes.ATTRIBUTE_NODE) {
                  m = PathExpr.getOwnerElement(xpc.contextNode);
                } else {
                  m = xpc.contextNode.parentNode;
                }
              }
              if (m != null && step.nodeTest.matches(m, xpc)) {
                newNodes.push(m);
              }
              break;
            case Step.PRECEDING:
              var st;
              if (xpc.virtualRoot != null) {
                st = [xpc.virtualRoot];
              } else {
                st = [findRoot(xpc.contextNode)];
              }
              outer: while (st.length > 0) {
                for (var m = st.pop(); m != null; ) {
                  if (m == xpc.contextNode) {
                    break outer;
                  }
                  if (step.nodeTest.matches(m, xpc)) {
                    newNodes.unshift(m);
                  }
                  if (m.firstChild != null) {
                    st.push(m.nextSibling);
                    m = m.firstChild;
                  } else {
                    m = m.nextSibling;
                  }
                }
              }
              break;
            case Step.PRECEDINGSIBLING:
              if (xpc.contextNode === xpc.virtualRoot) {
                break;
              }
              for (var m = xpc.contextNode.previousSibling; m != null; m = m.previousSibling) {
                if (step.nodeTest.matches(m, xpc)) {
                  newNodes.push(m);
                }
              }
              break;
            case Step.SELF:
              if (step.nodeTest.matches(xpc.contextNode, xpc)) {
                newNodes.push(xpc.contextNode);
              }
              break;
            default:
          }
          return newNodes;
        };
        function applyStepWithPredicates(step, xpc, node) {
          return applyPredicates(
            step.predicates,
            xpc,
            PathExpr.applyStep(step, xpc, node),
            includes(REVERSE_AXES, step.axis)
          );
        }
        function applyStepToNodes(context, nodes, step) {
          return flatten(
            map(
              applyStepWithPredicates.bind(null, step, context),
              nodes
            )
          );
        }
        PathExpr.applySteps = function(steps, xpc, nodes) {
          return reduce(
            applyStepToNodes.bind(null, xpc),
            nodes,
            steps
          );
        };
        PathExpr.prototype.applyFilter = function(c, xpc) {
          if (!this.filter) {
            return { nodes: [c.contextNode] };
          }
          var ns = this.filter.evaluate(c);
          if (!Utilities.instance_of(ns, XNodeSet)) {
            if (this.filterPredicates != null && this.filterPredicates.length > 0 || this.locationPath != null) {
              throw new Error("Path expression filter must evaluate to a nodeset if predicates or location path are used");
            }
            return { nonNodes: ns };
          }
          return {
            nodes: applyPredicates(
              this.filterPredicates || [],
              xpc,
              ns.toUnsortedArray(),
              false
              // reverse
            )
          };
        };
        PathExpr.applyLocationPath = function(locationPath, xpc, nodes) {
          if (!locationPath) {
            return nodes;
          }
          var startNodes = locationPath.absolute ? [PathExpr.getRoot(xpc, nodes)] : nodes;
          return PathExpr.applySteps(locationPath.steps, xpc, startNodes);
        };
        PathExpr.prototype.evaluate = function(c) {
          var xpc = assign(new XPathContext(), c);
          var filterResult = this.applyFilter(c, xpc);
          if ("nonNodes" in filterResult) {
            return filterResult.nonNodes;
          }
          var ns = new XNodeSet();
          ns.addArray(PathExpr.applyLocationPath(this.locationPath, xpc, filterResult.nodes));
          return ns;
        };
        PathExpr.predicateMatches = function(pred, c) {
          var res = pred.evaluate(c);
          return Utilities.instance_of(res, XNumber) ? c.contextPosition === res.numberValue() : res.booleanValue();
        };
        PathExpr.predicateString = function(predicate) {
          return wrap("[", "]", predicate.toString());
        };
        PathExpr.predicatesString = function(predicates) {
          return join(
            "",
            map(PathExpr.predicateString, predicates)
          );
        };
        PathExpr.prototype.toString = function() {
          if (this.filter != void 0) {
            var filterStr = toString(this.filter);
            if (Utilities.instance_of(this.filter, XString)) {
              return wrap("'", "'", filterStr);
            }
            if (this.filterPredicates != void 0 && this.filterPredicates.length) {
              return wrap("(", ")", filterStr) + PathExpr.predicatesString(this.filterPredicates);
            }
            if (this.locationPath != void 0) {
              return filterStr + (this.locationPath.absolute ? "" : "/") + toString(this.locationPath);
            }
            return filterStr;
          }
          return toString(this.locationPath);
        };
        PathExpr.getOwnerElement = function(n) {
          if (n.ownerElement) {
            return n.ownerElement;
          }
          try {
            if (n.selectSingleNode) {
              return n.selectSingleNode("..");
            }
          } catch (e) {
          }
          var doc = n.nodeType == NodeTypes.DOCUMENT_NODE ? n : n.ownerDocument;
          var elts = doc.getElementsByTagName("*");
          for (var i = 0; i < elts.length; i++) {
            var elt = elts.item(i);
            var nnm = elt.attributes;
            for (var j = 0; j < nnm.length; j++) {
              var an = nnm.item(j);
              if (an === n) {
                return elt;
              }
            }
          }
          return null;
        };
        LocationPath.prototype = new Object();
        LocationPath.prototype.constructor = LocationPath;
        LocationPath.superclass = Object.prototype;
        function LocationPath(abs, steps) {
          if (arguments.length > 0) {
            this.init(abs, steps);
          }
        }
        LocationPath.prototype.init = function(abs, steps) {
          this.absolute = abs;
          this.steps = steps;
        };
        LocationPath.prototype.toString = function() {
          return (this.absolute ? "/" : "") + map(toString, this.steps).join("/");
        };
        Step.prototype = new Object();
        Step.prototype.constructor = Step;
        Step.superclass = Object.prototype;
        function Step(axis, nodetest, preds) {
          if (arguments.length > 0) {
            this.init(axis, nodetest, preds);
          }
        }
        Step.prototype.init = function(axis, nodetest, preds) {
          this.axis = axis;
          this.nodeTest = nodetest;
          this.predicates = preds;
        };
        Step.prototype.toString = function() {
          return Step.STEPNAMES[this.axis] + "::" + this.nodeTest.toString() + PathExpr.predicatesString(this.predicates);
        };
        Step.ANCESTOR = 0;
        Step.ANCESTORORSELF = 1;
        Step.ATTRIBUTE = 2;
        Step.CHILD = 3;
        Step.DESCENDANT = 4;
        Step.DESCENDANTORSELF = 5;
        Step.FOLLOWING = 6;
        Step.FOLLOWINGSIBLING = 7;
        Step.NAMESPACE = 8;
        Step.PARENT = 9;
        Step.PRECEDING = 10;
        Step.PRECEDINGSIBLING = 11;
        Step.SELF = 12;
        Step.STEPNAMES = reduce(function(acc, x) {
          return acc[x[0]] = x[1], acc;
        }, {}, [
          [Step.ANCESTOR, "ancestor"],
          [Step.ANCESTORORSELF, "ancestor-or-self"],
          [Step.ATTRIBUTE, "attribute"],
          [Step.CHILD, "child"],
          [Step.DESCENDANT, "descendant"],
          [Step.DESCENDANTORSELF, "descendant-or-self"],
          [Step.FOLLOWING, "following"],
          [Step.FOLLOWINGSIBLING, "following-sibling"],
          [Step.NAMESPACE, "namespace"],
          [Step.PARENT, "parent"],
          [Step.PRECEDING, "preceding"],
          [Step.PRECEDINGSIBLING, "preceding-sibling"],
          [Step.SELF, "self"]
        ]);
        var REVERSE_AXES = [
          Step.ANCESTOR,
          Step.ANCESTORORSELF,
          Step.PARENT,
          Step.PRECEDING,
          Step.PRECEDINGSIBLING
        ];
        NodeTest.prototype = new Object();
        NodeTest.prototype.constructor = NodeTest;
        NodeTest.superclass = Object.prototype;
        function NodeTest(type, value) {
          if (arguments.length > 0) {
            this.init(type, value);
          }
        }
        NodeTest.prototype.init = function(type, value) {
          this.type = type;
          this.value = value;
        };
        NodeTest.prototype.toString = function() {
          return "<unknown nodetest type>";
        };
        NodeTest.prototype.matches = function(n, xpc) {
          console.warn("unknown node test type");
        };
        NodeTest.NAMETESTANY = 0;
        NodeTest.NAMETESTPREFIXANY = 1;
        NodeTest.NAMETESTQNAME = 2;
        NodeTest.COMMENT = 3;
        NodeTest.TEXT = 4;
        NodeTest.PI = 5;
        NodeTest.NODE = 6;
        NodeTest.isNodeType = function(types) {
          return function(node) {
            return includes(types, node.nodeType);
          };
        };
        NodeTest.makeNodeTestType = function(type, members, ctor) {
          var newType = ctor || function() {
          };
          newType.prototype = new NodeTest(type);
          newType.prototype.constructor = newType;
          assign(newType.prototype, members);
          return newType;
        };
        NodeTest.makeNodeTypeTest = function(type, nodeTypes, stringVal) {
          return new (NodeTest.makeNodeTestType(type, {
            matches: NodeTest.isNodeType(nodeTypes),
            toString: always(stringVal)
          }))();
        };
        NodeTest.hasPrefix = function(node) {
          return node.prefix || (node.nodeName || node.tagName).indexOf(":") !== -1;
        };
        NodeTest.isElementOrAttribute = NodeTest.isNodeType([1, 2]);
        NodeTest.nameSpaceMatches = function(prefix, xpc, n) {
          var nNamespace = n.namespaceURI || "";
          if (!prefix) {
            return !nNamespace || xpc.allowAnyNamespaceForNoPrefix && !NodeTest.hasPrefix(n);
          }
          var ns = xpc.namespaceResolver.getNamespace(prefix, xpc.expressionContextNode);
          if (ns == null) {
            throw new Error("Cannot resolve QName " + prefix);
          }
          return ns === nNamespace;
        };
        NodeTest.localNameMatches = function(localName, xpc, n) {
          var nLocalName = n.localName || n.nodeName;
          return xpc.caseInsensitive ? localName.toLowerCase() === nLocalName.toLowerCase() : localName === nLocalName;
        };
        NodeTest.NameTestPrefixAny = NodeTest.makeNodeTestType(
          NodeTest.NAMETESTPREFIXANY,
          {
            matches: function(n, xpc) {
              return NodeTest.isElementOrAttribute(n) && NodeTest.nameSpaceMatches(this.prefix, xpc, n);
            },
            toString: function() {
              return this.prefix + ":*";
            }
          },
          function NameTestPrefixAny(prefix) {
            this.prefix = prefix;
          }
        );
        NodeTest.NameTestQName = NodeTest.makeNodeTestType(
          NodeTest.NAMETESTQNAME,
          {
            matches: function(n, xpc) {
              return NodeTest.isNodeType(
                [
                  NodeTypes.ELEMENT_NODE,
                  NodeTypes.ATTRIBUTE_NODE,
                  NodeTypes.NAMESPACE_NODE
                ]
              )(n) && NodeTest.nameSpaceMatches(this.prefix, xpc, n) && NodeTest.localNameMatches(this.localName, xpc, n);
            },
            toString: function() {
              return this.name;
            }
          },
          function NameTestQName(name2) {
            var nameParts = name2.split(":");
            this.name = name2;
            this.prefix = nameParts.length > 1 ? nameParts[0] : null;
            this.localName = nameParts[nameParts.length > 1 ? 1 : 0];
          }
        );
        NodeTest.PITest = NodeTest.makeNodeTestType(NodeTest.PI, {
          matches: function(n, xpc) {
            return NodeTest.isNodeType(
              [NodeTypes.PROCESSING_INSTRUCTION_NODE]
            )(n) && (n.target || n.nodeName) === this.name;
          },
          toString: function() {
            return wrap('processing-instruction("', '")', this.name);
          }
        }, function(name2) {
          this.name = name2;
        });
        NodeTest.nameTestAny = NodeTest.makeNodeTypeTest(
          NodeTest.NAMETESTANY,
          [
            NodeTypes.ELEMENT_NODE,
            NodeTypes.ATTRIBUTE_NODE,
            NodeTypes.NAMESPACE_NODE
          ],
          "*"
        );
        NodeTest.textTest = NodeTest.makeNodeTypeTest(
          NodeTest.TEXT,
          [
            NodeTypes.TEXT_NODE,
            NodeTypes.CDATA_SECTION_NODE
          ],
          "text()"
        );
        NodeTest.commentTest = NodeTest.makeNodeTypeTest(
          NodeTest.COMMENT,
          [NodeTypes.COMMENT_NODE],
          "comment()"
        );
        NodeTest.nodeTest = NodeTest.makeNodeTypeTest(
          NodeTest.NODE,
          [
            NodeTypes.ELEMENT_NODE,
            NodeTypes.ATTRIBUTE_NODE,
            NodeTypes.TEXT_NODE,
            NodeTypes.CDATA_SECTION_NODE,
            NodeTypes.PROCESSING_INSTRUCTION_NODE,
            NodeTypes.COMMENT_NODE,
            NodeTypes.DOCUMENT_NODE
          ],
          "node()"
        );
        NodeTest.anyPiTest = NodeTest.makeNodeTypeTest(
          NodeTest.PI,
          [NodeTypes.PROCESSING_INSTRUCTION_NODE],
          "processing-instruction()"
        );
        VariableReference.prototype = new Expression();
        VariableReference.prototype.constructor = VariableReference;
        VariableReference.superclass = Expression.prototype;
        function VariableReference(v) {
          if (arguments.length > 0) {
            this.init(v);
          }
        }
        VariableReference.prototype.init = function(v) {
          this.variable = v;
        };
        VariableReference.prototype.toString = function() {
          return "$" + this.variable;
        };
        VariableReference.prototype.evaluate = function(c) {
          var parts = Utilities.resolveQName(this.variable, c.namespaceResolver, c.contextNode, false);
          if (parts[0] == null) {
            throw new Error("Cannot resolve QName " + fn);
          }
          var result = c.variableResolver.getVariable(parts[1], parts[0]);
          if (!result) {
            throw XPathException.fromMessage("Undeclared variable: " + this.toString());
          }
          return result;
        };
        FunctionCall.prototype = new Expression();
        FunctionCall.prototype.constructor = FunctionCall;
        FunctionCall.superclass = Expression.prototype;
        function FunctionCall(fn2, args) {
          if (arguments.length > 0) {
            this.init(fn2, args);
          }
        }
        FunctionCall.prototype.init = function(fn2, args) {
          this.functionName = fn2;
          this.arguments = args;
        };
        FunctionCall.prototype.toString = function() {
          var s = this.functionName + "(";
          for (var i = 0; i < this.arguments.length; i++) {
            if (i > 0) {
              s += ", ";
            }
            s += this.arguments[i].toString();
          }
          return s + ")";
        };
        FunctionCall.prototype.evaluate = function(c) {
          var f = FunctionResolver.getFunctionFromContext(this.functionName, c);
          if (!f) {
            throw new Error("Unknown function " + this.functionName);
          }
          var a = [c].concat(this.arguments);
          return f.apply(c.functionResolver.thisArg, a);
        };
        var Operators = new Object();
        Operators.equals = function(l, r) {
          return l.equals(r);
        };
        Operators.notequal = function(l, r) {
          return l.notequal(r);
        };
        Operators.lessthan = function(l, r) {
          return l.lessthan(r);
        };
        Operators.greaterthan = function(l, r) {
          return l.greaterthan(r);
        };
        Operators.lessthanorequal = function(l, r) {
          return l.lessthanorequal(r);
        };
        Operators.greaterthanorequal = function(l, r) {
          return l.greaterthanorequal(r);
        };
        XString.prototype = new Expression();
        XString.prototype.constructor = XString;
        XString.superclass = Expression.prototype;
        function XString(s) {
          if (arguments.length > 0) {
            this.init(s);
          }
        }
        XString.prototype.init = function(s) {
          this.str = String(s);
        };
        XString.prototype.toString = function() {
          return this.str;
        };
        XString.prototype.evaluate = function(c) {
          return this;
        };
        XString.prototype.string = function() {
          return this;
        };
        XString.prototype.number = function() {
          return new XNumber(this.str);
        };
        XString.prototype.bool = function() {
          return new XBoolean(this.str);
        };
        XString.prototype.nodeset = function() {
          throw new Error("Cannot convert string to nodeset");
        };
        XString.prototype.stringValue = function() {
          return this.str;
        };
        XString.prototype.numberValue = function() {
          return this.number().numberValue();
        };
        XString.prototype.booleanValue = function() {
          return this.bool().booleanValue();
        };
        XString.prototype.equals = function(r) {
          if (Utilities.instance_of(r, XBoolean)) {
            return this.bool().equals(r);
          }
          if (Utilities.instance_of(r, XNumber)) {
            return this.number().equals(r);
          }
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithString(this, Operators.equals);
          }
          return new XBoolean(this.str == r.str);
        };
        XString.prototype.notequal = function(r) {
          if (Utilities.instance_of(r, XBoolean)) {
            return this.bool().notequal(r);
          }
          if (Utilities.instance_of(r, XNumber)) {
            return this.number().notequal(r);
          }
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithString(this, Operators.notequal);
          }
          return new XBoolean(this.str != r.str);
        };
        XString.prototype.lessthan = function(r) {
          return this.number().lessthan(r);
        };
        XString.prototype.greaterthan = function(r) {
          return this.number().greaterthan(r);
        };
        XString.prototype.lessthanorequal = function(r) {
          return this.number().lessthanorequal(r);
        };
        XString.prototype.greaterthanorequal = function(r) {
          return this.number().greaterthanorequal(r);
        };
        XNumber.prototype = new Expression();
        XNumber.prototype.constructor = XNumber;
        XNumber.superclass = Expression.prototype;
        function XNumber(n) {
          if (arguments.length > 0) {
            this.init(n);
          }
        }
        XNumber.prototype.init = function(n) {
          this.num = typeof n === "string" ? this.parse(n) : Number(n);
        };
        XNumber.prototype.numberFormat = /^\s*-?[0-9]*\.?[0-9]+\s*$/;
        XNumber.prototype.parse = function(s) {
          return this.numberFormat.test(s) ? parseFloat(s) : Number.NaN;
        };
        function padSmallNumber(numberStr) {
          var parts = numberStr.split("e-");
          var base = parts[0].replace(".", "");
          var exponent = Number(parts[1]);
          for (var i = 0; i < exponent - 1; i += 1) {
            base = "0" + base;
          }
          return "0." + base;
        }
        function padLargeNumber(numberStr) {
          var parts = numberStr.split("e");
          var base = parts[0].replace(".", "");
          var exponent = Number(parts[1]);
          var zerosToAppend = exponent + 1 - base.length;
          for (var i = 0; i < zerosToAppend; i += 1) {
            base += "0";
          }
          return base;
        }
        XNumber.prototype.toString = function() {
          var strValue = this.num.toString();
          if (strValue.indexOf("e-") !== -1) {
            return padSmallNumber(strValue);
          }
          if (strValue.indexOf("e") !== -1) {
            return padLargeNumber(strValue);
          }
          return strValue;
        };
        XNumber.prototype.evaluate = function(c) {
          return this;
        };
        XNumber.prototype.string = function() {
          return new XString(this.toString());
        };
        XNumber.prototype.number = function() {
          return this;
        };
        XNumber.prototype.bool = function() {
          return new XBoolean(this.num);
        };
        XNumber.prototype.nodeset = function() {
          throw new Error("Cannot convert number to nodeset");
        };
        XNumber.prototype.stringValue = function() {
          return this.string().stringValue();
        };
        XNumber.prototype.numberValue = function() {
          return this.num;
        };
        XNumber.prototype.booleanValue = function() {
          return this.bool().booleanValue();
        };
        XNumber.prototype.negate = function() {
          return new XNumber(-this.num);
        };
        XNumber.prototype.equals = function(r) {
          if (Utilities.instance_of(r, XBoolean)) {
            return this.bool().equals(r);
          }
          if (Utilities.instance_of(r, XString)) {
            return this.equals(r.number());
          }
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.equals);
          }
          return new XBoolean(this.num == r.num);
        };
        XNumber.prototype.notequal = function(r) {
          if (Utilities.instance_of(r, XBoolean)) {
            return this.bool().notequal(r);
          }
          if (Utilities.instance_of(r, XString)) {
            return this.notequal(r.number());
          }
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.notequal);
          }
          return new XBoolean(this.num != r.num);
        };
        XNumber.prototype.lessthan = function(r) {
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.greaterthan);
          }
          if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
            return this.lessthan(r.number());
          }
          return new XBoolean(this.num < r.num);
        };
        XNumber.prototype.greaterthan = function(r) {
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.lessthan);
          }
          if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
            return this.greaterthan(r.number());
          }
          return new XBoolean(this.num > r.num);
        };
        XNumber.prototype.lessthanorequal = function(r) {
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.greaterthanorequal);
          }
          if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
            return this.lessthanorequal(r.number());
          }
          return new XBoolean(this.num <= r.num);
        };
        XNumber.prototype.greaterthanorequal = function(r) {
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithNumber(this, Operators.lessthanorequal);
          }
          if (Utilities.instance_of(r, XBoolean) || Utilities.instance_of(r, XString)) {
            return this.greaterthanorequal(r.number());
          }
          return new XBoolean(this.num >= r.num);
        };
        XNumber.prototype.plus = function(r) {
          return new XNumber(this.num + r.num);
        };
        XNumber.prototype.minus = function(r) {
          return new XNumber(this.num - r.num);
        };
        XNumber.prototype.multiply = function(r) {
          return new XNumber(this.num * r.num);
        };
        XNumber.prototype.div = function(r) {
          return new XNumber(this.num / r.num);
        };
        XNumber.prototype.mod = function(r) {
          return new XNumber(this.num % r.num);
        };
        XBoolean.prototype = new Expression();
        XBoolean.prototype.constructor = XBoolean;
        XBoolean.superclass = Expression.prototype;
        function XBoolean(b) {
          if (arguments.length > 0) {
            this.init(b);
          }
        }
        XBoolean.prototype.init = function(b) {
          this.b = Boolean(b);
        };
        XBoolean.prototype.toString = function() {
          return this.b.toString();
        };
        XBoolean.prototype.evaluate = function(c) {
          return this;
        };
        XBoolean.prototype.string = function() {
          return new XString(this.b);
        };
        XBoolean.prototype.number = function() {
          return new XNumber(this.b);
        };
        XBoolean.prototype.bool = function() {
          return this;
        };
        XBoolean.prototype.nodeset = function() {
          throw new Error("Cannot convert boolean to nodeset");
        };
        XBoolean.prototype.stringValue = function() {
          return this.string().stringValue();
        };
        XBoolean.prototype.numberValue = function() {
          return this.number().numberValue();
        };
        XBoolean.prototype.booleanValue = function() {
          return this.b;
        };
        XBoolean.prototype.not = function() {
          return new XBoolean(!this.b);
        };
        XBoolean.prototype.equals = function(r) {
          if (Utilities.instance_of(r, XString) || Utilities.instance_of(r, XNumber)) {
            return this.equals(r.bool());
          }
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithBoolean(this, Operators.equals);
          }
          return new XBoolean(this.b == r.b);
        };
        XBoolean.prototype.notequal = function(r) {
          if (Utilities.instance_of(r, XString) || Utilities.instance_of(r, XNumber)) {
            return this.notequal(r.bool());
          }
          if (Utilities.instance_of(r, XNodeSet)) {
            return r.compareWithBoolean(this, Operators.notequal);
          }
          return new XBoolean(this.b != r.b);
        };
        XBoolean.prototype.lessthan = function(r) {
          return this.number().lessthan(r);
        };
        XBoolean.prototype.greaterthan = function(r) {
          return this.number().greaterthan(r);
        };
        XBoolean.prototype.lessthanorequal = function(r) {
          return this.number().lessthanorequal(r);
        };
        XBoolean.prototype.greaterthanorequal = function(r) {
          return this.number().greaterthanorequal(r);
        };
        XBoolean.true_ = new XBoolean(true);
        XBoolean.false_ = new XBoolean(false);
        AVLTree.prototype = new Object();
        AVLTree.prototype.constructor = AVLTree;
        AVLTree.superclass = Object.prototype;
        function AVLTree(n) {
          this.init(n);
        }
        AVLTree.prototype.init = function(n) {
          this.left = null;
          this.right = null;
          this.node = n;
          this.depth = 1;
        };
        AVLTree.prototype.balance = function() {
          var ldepth = this.left == null ? 0 : this.left.depth;
          var rdepth = this.right == null ? 0 : this.right.depth;
          if (ldepth > rdepth + 1) {
            var lldepth = this.left.left == null ? 0 : this.left.left.depth;
            var lrdepth = this.left.right == null ? 0 : this.left.right.depth;
            if (lldepth < lrdepth) {
              this.left.rotateRR();
            }
            this.rotateLL();
          } else if (ldepth + 1 < rdepth) {
            var rrdepth = this.right.right == null ? 0 : this.right.right.depth;
            var rldepth = this.right.left == null ? 0 : this.right.left.depth;
            if (rldepth > rrdepth) {
              this.right.rotateLL();
            }
            this.rotateRR();
          }
        };
        AVLTree.prototype.rotateLL = function() {
          var nodeBefore = this.node;
          var rightBefore = this.right;
          this.node = this.left.node;
          this.right = this.left;
          this.left = this.left.left;
          this.right.left = this.right.right;
          this.right.right = rightBefore;
          this.right.node = nodeBefore;
          this.right.updateInNewLocation();
          this.updateInNewLocation();
        };
        AVLTree.prototype.rotateRR = function() {
          var nodeBefore = this.node;
          var leftBefore = this.left;
          this.node = this.right.node;
          this.left = this.right;
          this.right = this.right.right;
          this.left.right = this.left.left;
          this.left.left = leftBefore;
          this.left.node = nodeBefore;
          this.left.updateInNewLocation();
          this.updateInNewLocation();
        };
        AVLTree.prototype.updateInNewLocation = function() {
          this.getDepthFromChildren();
        };
        AVLTree.prototype.getDepthFromChildren = function() {
          this.depth = this.node == null ? 0 : 1;
          if (this.left != null) {
            this.depth = this.left.depth + 1;
          }
          if (this.right != null && this.depth <= this.right.depth) {
            this.depth = this.right.depth + 1;
          }
        };
        function nodeOrder(n1, n2) {
          if (n1 === n2) {
            return 0;
          }
          if (n1.compareDocumentPosition) {
            var cpos = n1.compareDocumentPosition(n2);
            if (cpos & 1) {
              return 1;
            }
            if (cpos & 10) {
              return 1;
            }
            if (cpos & 20) {
              return -1;
            }
            return 0;
          }
          var d1 = 0, d2 = 0;
          for (var m1 = n1; m1 != null; m1 = m1.parentNode || m1.ownerElement) {
            d1++;
          }
          for (var m2 = n2; m2 != null; m2 = m2.parentNode || m2.ownerElement) {
            d2++;
          }
          if (d1 > d2) {
            while (d1 > d2) {
              n1 = n1.parentNode || n1.ownerElement;
              d1--;
            }
            if (n1 === n2) {
              return 1;
            }
          } else if (d2 > d1) {
            while (d2 > d1) {
              n2 = n2.parentNode || n2.ownerElement;
              d2--;
            }
            if (n1 === n2) {
              return -1;
            }
          }
          var n1Par = n1.parentNode || n1.ownerElement, n2Par = n2.parentNode || n2.ownerElement;
          while (n1Par !== n2Par) {
            n1 = n1Par;
            n2 = n2Par;
            n1Par = n1.parentNode || n1.ownerElement;
            n2Par = n2.parentNode || n2.ownerElement;
          }
          var n1isAttr = isAttributeLike(n1);
          var n2isAttr = isAttributeLike(n2);
          if (n1isAttr && !n2isAttr) {
            return -1;
          }
          if (!n1isAttr && n2isAttr) {
            return 1;
          }
          if (n1.isXPathNamespace) {
            if (n1.nodeValue === XPath.XML_NAMESPACE_URI) {
              return -1;
            }
            if (!n2.isXPathNamespace) {
              return -1;
            }
            if (n2.nodeValue === XPath.XML_NAMESPACE_URI) {
              return 1;
            }
          } else if (n2.isXPathNamespace) {
            return 1;
          }
          if (n1Par) {
            var cn = n1isAttr ? n1Par.attributes : n1Par.childNodes;
            var len = cn.length;
            var n1Compare = n1.baseNode || n1;
            var n2Compare = n2.baseNode || n2;
            for (var i = 0; i < len; i += 1) {
              var n = cn[i];
              if (n === n1Compare) {
                return -1;
              }
              if (n === n2Compare) {
                return 1;
              }
            }
          }
          throw new Error("Unexpected: could not determine node order");
        }
        AVLTree.prototype.add = function(n) {
          if (n === this.node) {
            return false;
          }
          var o = nodeOrder(n, this.node);
          var ret = false;
          if (o == -1) {
            if (this.left == null) {
              this.left = new AVLTree(n);
              ret = true;
            } else {
              ret = this.left.add(n);
              if (ret) {
                this.balance();
              }
            }
          } else if (o == 1) {
            if (this.right == null) {
              this.right = new AVLTree(n);
              ret = true;
            } else {
              ret = this.right.add(n);
              if (ret) {
                this.balance();
              }
            }
          }
          if (ret) {
            this.getDepthFromChildren();
          }
          return ret;
        };
        XNodeSet.prototype = new Expression();
        XNodeSet.prototype.constructor = XNodeSet;
        XNodeSet.superclass = Expression.prototype;
        function XNodeSet() {
          this.init();
        }
        XNodeSet.prototype.init = function() {
          this.tree = null;
          this.nodes = [];
          this.size = 0;
        };
        XNodeSet.prototype.toString = function() {
          var p = this.first();
          if (p == null) {
            return "";
          }
          return this.stringForNode(p);
        };
        XNodeSet.prototype.evaluate = function(c) {
          return this;
        };
        XNodeSet.prototype.string = function() {
          return new XString(this.toString());
        };
        XNodeSet.prototype.stringValue = function() {
          return this.toString();
        };
        XNodeSet.prototype.number = function() {
          return new XNumber(this.string());
        };
        XNodeSet.prototype.numberValue = function() {
          return Number(this.string());
        };
        XNodeSet.prototype.bool = function() {
          return new XBoolean(this.booleanValue());
        };
        XNodeSet.prototype.booleanValue = function() {
          return !!this.size;
        };
        XNodeSet.prototype.nodeset = function() {
          return this;
        };
        XNodeSet.prototype.stringForNode = function(n) {
          if (n.nodeType == NodeTypes.DOCUMENT_NODE || n.nodeType == NodeTypes.ELEMENT_NODE || n.nodeType === NodeTypes.DOCUMENT_FRAGMENT_NODE) {
            return this.stringForContainerNode(n);
          }
          if (n.nodeType === NodeTypes.ATTRIBUTE_NODE) {
            return n.value || n.nodeValue;
          }
          if (n.isNamespaceNode) {
            return n.namespace;
          }
          return n.nodeValue;
        };
        XNodeSet.prototype.stringForContainerNode = function(n) {
          var s = "";
          for (var n2 = n.firstChild; n2 != null; n2 = n2.nextSibling) {
            var nt = n2.nodeType;
            if (nt === 1 || nt === 3 || nt === 4 || nt === 9 || nt === 11) {
              s += this.stringForNode(n2);
            }
          }
          return s;
        };
        XNodeSet.prototype.buildTree = function() {
          if (!this.tree && this.nodes.length) {
            this.tree = new AVLTree(this.nodes[0]);
            for (var i = 1; i < this.nodes.length; i += 1) {
              this.tree.add(this.nodes[i]);
            }
          }
          return this.tree;
        };
        XNodeSet.prototype.first = function() {
          var p = this.buildTree();
          if (p == null) {
            return null;
          }
          while (p.left != null) {
            p = p.left;
          }
          return p.node;
        };
        XNodeSet.prototype.add = function(n) {
          for (var i = 0; i < this.nodes.length; i += 1) {
            if (n === this.nodes[i]) {
              return;
            }
          }
          this.tree = null;
          this.nodes.push(n);
          this.size += 1;
        };
        XNodeSet.prototype.addArray = function(ns) {
          var self2 = this;
          forEach(function(x) {
            self2.add(x);
          }, ns);
        };
        XNodeSet.prototype.toArray = function() {
          var a = [];
          this.toArrayRec(this.buildTree(), a);
          return a;
        };
        XNodeSet.prototype.toArrayRec = function(t, a) {
          if (t != null) {
            this.toArrayRec(t.left, a);
            a.push(t.node);
            this.toArrayRec(t.right, a);
          }
        };
        XNodeSet.prototype.toUnsortedArray = function() {
          return this.nodes.slice();
        };
        XNodeSet.prototype.compareWithString = function(r, o) {
          var a = this.toUnsortedArray();
          for (var i = 0; i < a.length; i++) {
            var n = a[i];
            var l = new XString(this.stringForNode(n));
            var res = o(l, r);
            if (res.booleanValue()) {
              return res;
            }
          }
          return new XBoolean(false);
        };
        XNodeSet.prototype.compareWithNumber = function(r, o) {
          var a = this.toUnsortedArray();
          for (var i = 0; i < a.length; i++) {
            var n = a[i];
            var l = new XNumber(this.stringForNode(n));
            var res = o(l, r);
            if (res.booleanValue()) {
              return res;
            }
          }
          return new XBoolean(false);
        };
        XNodeSet.prototype.compareWithBoolean = function(r, o) {
          return o(this.bool(), r);
        };
        XNodeSet.prototype.compareWithNodeSet = function(r, o) {
          var arr = this.toUnsortedArray();
          var oInvert = function(lop, rop) {
            return o(rop, lop);
          };
          for (var i = 0; i < arr.length; i++) {
            var l = new XString(this.stringForNode(arr[i]));
            var res = r.compareWithString(l, oInvert);
            if (res.booleanValue()) {
              return res;
            }
          }
          return new XBoolean(false);
        };
        XNodeSet.compareWith = curry(function(o, r) {
          if (Utilities.instance_of(r, XString)) {
            return this.compareWithString(r, o);
          }
          if (Utilities.instance_of(r, XNumber)) {
            return this.compareWithNumber(r, o);
          }
          if (Utilities.instance_of(r, XBoolean)) {
            return this.compareWithBoolean(r, o);
          }
          return this.compareWithNodeSet(r, o);
        });
        XNodeSet.prototype.equals = XNodeSet.compareWith(Operators.equals);
        XNodeSet.prototype.notequal = XNodeSet.compareWith(Operators.notequal);
        XNodeSet.prototype.lessthan = XNodeSet.compareWith(Operators.lessthan);
        XNodeSet.prototype.greaterthan = XNodeSet.compareWith(Operators.greaterthan);
        XNodeSet.prototype.lessthanorequal = XNodeSet.compareWith(Operators.lessthanorequal);
        XNodeSet.prototype.greaterthanorequal = XNodeSet.compareWith(Operators.greaterthanorequal);
        XNodeSet.prototype.union = function(r) {
          var ns = new XNodeSet();
          ns.addArray(this.toUnsortedArray());
          ns.addArray(r.toUnsortedArray());
          return ns;
        };
        XPathNamespace.prototype = new Object();
        XPathNamespace.prototype.constructor = XPathNamespace;
        XPathNamespace.superclass = Object.prototype;
        function XPathNamespace(pre, node, uri, p) {
          this.isXPathNamespace = true;
          this.baseNode = node;
          this.ownerDocument = p.ownerDocument;
          this.nodeName = pre;
          this.prefix = pre;
          this.localName = pre;
          this.namespaceURI = null;
          this.nodeValue = uri;
          this.ownerElement = p;
          this.nodeType = NodeTypes.NAMESPACE_NODE;
        }
        XPathNamespace.prototype.toString = function() {
          return '{ "' + this.prefix + '", "' + this.namespaceURI + '" }';
        };
        XPathContext.prototype = new Object();
        XPathContext.prototype.constructor = XPathContext;
        XPathContext.superclass = Object.prototype;
        function XPathContext(vr, nr, fr) {
          this.variableResolver = vr != null ? vr : new VariableResolver();
          this.namespaceResolver = nr != null ? nr : new NamespaceResolver();
          this.functionResolver = fr != null ? fr : new FunctionResolver();
        }
        XPathContext.prototype.extend = function(newProps) {
          return assign(new XPathContext(), this, newProps);
        };
        VariableResolver.prototype = new Object();
        VariableResolver.prototype.constructor = VariableResolver;
        VariableResolver.superclass = Object.prototype;
        function VariableResolver() {
        }
        VariableResolver.prototype.getVariable = function(ln, ns) {
          return null;
        };
        FunctionResolver.prototype = new Object();
        FunctionResolver.prototype.constructor = FunctionResolver;
        FunctionResolver.superclass = Object.prototype;
        function FunctionResolver(thisArg) {
          this.thisArg = thisArg != null ? thisArg : Functions;
          this.functions = new Object();
          this.addStandardFunctions();
        }
        FunctionResolver.prototype.addStandardFunctions = function() {
          this.functions["{}last"] = Functions.last;
          this.functions["{}position"] = Functions.position;
          this.functions["{}count"] = Functions.count;
          this.functions["{}id"] = Functions.id;
          this.functions["{}local-name"] = Functions.localName;
          this.functions["{}namespace-uri"] = Functions.namespaceURI;
          this.functions["{}name"] = Functions.name;
          this.functions["{}string"] = Functions.string;
          this.functions["{}concat"] = Functions.concat;
          this.functions["{}starts-with"] = Functions.startsWith;
          this.functions["{}contains"] = Functions.contains;
          this.functions["{}substring-before"] = Functions.substringBefore;
          this.functions["{}substring-after"] = Functions.substringAfter;
          this.functions["{}substring"] = Functions.substring;
          this.functions["{}string-length"] = Functions.stringLength;
          this.functions["{}normalize-space"] = Functions.normalizeSpace;
          this.functions["{}translate"] = Functions.translate;
          this.functions["{}boolean"] = Functions.boolean_;
          this.functions["{}not"] = Functions.not;
          this.functions["{}true"] = Functions.true_;
          this.functions["{}false"] = Functions.false_;
          this.functions["{}lang"] = Functions.lang;
          this.functions["{}number"] = Functions.number;
          this.functions["{}sum"] = Functions.sum;
          this.functions["{}floor"] = Functions.floor;
          this.functions["{}ceiling"] = Functions.ceiling;
          this.functions["{}round"] = Functions.round;
        };
        FunctionResolver.prototype.addFunction = function(ns, ln, f) {
          this.functions["{" + ns + "}" + ln] = f;
        };
        FunctionResolver.getFunctionFromContext = function(qName, context) {
          var parts = Utilities.resolveQName(qName, context.namespaceResolver, context.contextNode, false);
          if (parts[0] === null) {
            throw new Error("Cannot resolve QName " + name);
          }
          return context.functionResolver.getFunction(parts[1], parts[0]);
        };
        FunctionResolver.prototype.getFunction = function(localName, namespace) {
          return this.functions["{" + namespace + "}" + localName];
        };
        NamespaceResolver.prototype = new Object();
        NamespaceResolver.prototype.constructor = NamespaceResolver;
        NamespaceResolver.superclass = Object.prototype;
        function NamespaceResolver() {
        }
        NamespaceResolver.prototype.getNamespace = function(prefix, n) {
          if (prefix == "xml") {
            return XPath.XML_NAMESPACE_URI;
          } else if (prefix == "xmlns") {
            return XPath.XMLNS_NAMESPACE_URI;
          }
          if (n.nodeType == NodeTypes.DOCUMENT_NODE) {
            n = n.documentElement;
          } else if (n.nodeType == NodeTypes.ATTRIBUTE_NODE) {
            n = PathExpr.getOwnerElement(n);
          } else if (n.nodeType != NodeTypes.ELEMENT_NODE) {
            n = n.parentNode;
          }
          while (n != null && n.nodeType == NodeTypes.ELEMENT_NODE) {
            var nnm = n.attributes;
            for (var i = 0; i < nnm.length; i++) {
              var a = nnm.item(i);
              var aname = a.name || a.nodeName;
              if (aname === "xmlns" && prefix === "" || aname === "xmlns:" + prefix) {
                return String(a.value || a.nodeValue);
              }
            }
            n = n.parentNode;
          }
          return null;
        };
        var Functions = new Object();
        Functions.last = function(c) {
          if (arguments.length != 1) {
            throw new Error("Function last expects ()");
          }
          return new XNumber(c.contextSize);
        };
        Functions.position = function(c) {
          if (arguments.length != 1) {
            throw new Error("Function position expects ()");
          }
          return new XNumber(c.contextPosition);
        };
        Functions.count = function() {
          var c = arguments[0];
          var ns;
          if (arguments.length != 2 || !Utilities.instance_of(ns = arguments[1].evaluate(c), XNodeSet)) {
            throw new Error("Function count expects (node-set)");
          }
          return new XNumber(ns.size);
        };
        Functions.id = function() {
          var c = arguments[0];
          var id;
          if (arguments.length != 2) {
            throw new Error("Function id expects (object)");
          }
          id = arguments[1].evaluate(c);
          if (Utilities.instance_of(id, XNodeSet)) {
            id = id.toArray().join(" ");
          } else {
            id = id.stringValue();
          }
          var ids = id.split(/[\x0d\x0a\x09\x20]+/);
          var count = 0;
          var ns = new XNodeSet();
          var doc = c.contextNode.nodeType == NodeTypes.DOCUMENT_NODE ? c.contextNode : c.contextNode.ownerDocument;
          for (var i = 0; i < ids.length; i++) {
            var n;
            if (doc.getElementById) {
              n = doc.getElementById(ids[i]);
            } else {
              n = Utilities.getElementById(doc, ids[i]);
            }
            if (n != null) {
              ns.add(n);
              count++;
            }
          }
          return ns;
        };
        Functions.localName = function(c, eNode) {
          var n;
          if (arguments.length == 1) {
            n = c.contextNode;
          } else if (arguments.length == 2) {
            n = eNode.evaluate(c).first();
          } else {
            throw new Error("Function local-name expects (node-set?)");
          }
          if (n == null) {
            return new XString("");
          }
          return new XString(
            n.localName || //  standard elements and attributes
            n.baseName || //  IE
            n.target || //  processing instructions
            n.nodeName || //  DOM1 elements
            ""
            //  fallback
          );
        };
        Functions.namespaceURI = function() {
          var c = arguments[0];
          var n;
          if (arguments.length == 1) {
            n = c.contextNode;
          } else if (arguments.length == 2) {
            n = arguments[1].evaluate(c).first();
          } else {
            throw new Error("Function namespace-uri expects (node-set?)");
          }
          if (n == null) {
            return new XString("");
          }
          return new XString(n.namespaceURI || "");
        };
        Functions.name = function() {
          var c = arguments[0];
          var n;
          if (arguments.length == 1) {
            n = c.contextNode;
          } else if (arguments.length == 2) {
            n = arguments[1].evaluate(c).first();
          } else {
            throw new Error("Function name expects (node-set?)");
          }
          if (n == null) {
            return new XString("");
          }
          if (n.nodeType == NodeTypes.ELEMENT_NODE) {
            return new XString(n.nodeName);
          } else if (n.nodeType == NodeTypes.ATTRIBUTE_NODE) {
            return new XString(n.name || n.nodeName);
          } else if (n.nodeType === NodeTypes.PROCESSING_INSTRUCTION_NODE) {
            return new XString(n.target || n.nodeName);
          } else if (n.localName == null) {
            return new XString("");
          } else {
            return new XString(n.localName);
          }
        };
        Functions.string = function() {
          var c = arguments[0];
          if (arguments.length == 1) {
            return new XString(XNodeSet.prototype.stringForNode(c.contextNode));
          } else if (arguments.length == 2) {
            return arguments[1].evaluate(c).string();
          }
          throw new Error("Function string expects (object?)");
        };
        Functions.concat = function(c) {
          if (arguments.length < 3) {
            throw new Error("Function concat expects (string, string[, string]*)");
          }
          var s = "";
          for (var i = 1; i < arguments.length; i++) {
            s += arguments[i].evaluate(c).stringValue();
          }
          return new XString(s);
        };
        Functions.startsWith = function() {
          var c = arguments[0];
          if (arguments.length != 3) {
            throw new Error("Function startsWith expects (string, string)");
          }
          var s1 = arguments[1].evaluate(c).stringValue();
          var s2 = arguments[2].evaluate(c).stringValue();
          return new XBoolean(s1.substring(0, s2.length) == s2);
        };
        Functions.contains = function() {
          var c = arguments[0];
          if (arguments.length != 3) {
            throw new Error("Function contains expects (string, string)");
          }
          var s1 = arguments[1].evaluate(c).stringValue();
          var s2 = arguments[2].evaluate(c).stringValue();
          return new XBoolean(s1.indexOf(s2) !== -1);
        };
        Functions.substringBefore = function() {
          var c = arguments[0];
          if (arguments.length != 3) {
            throw new Error("Function substring-before expects (string, string)");
          }
          var s1 = arguments[1].evaluate(c).stringValue();
          var s2 = arguments[2].evaluate(c).stringValue();
          return new XString(s1.substring(0, s1.indexOf(s2)));
        };
        Functions.substringAfter = function() {
          var c = arguments[0];
          if (arguments.length != 3) {
            throw new Error("Function substring-after expects (string, string)");
          }
          var s1 = arguments[1].evaluate(c).stringValue();
          var s2 = arguments[2].evaluate(c).stringValue();
          if (s2.length == 0) {
            return new XString(s1);
          }
          var i = s1.indexOf(s2);
          if (i == -1) {
            return new XString("");
          }
          return new XString(s1.substring(i + s2.length));
        };
        Functions.substring = function() {
          var c = arguments[0];
          if (!(arguments.length == 3 || arguments.length == 4)) {
            throw new Error("Function substring expects (string, number, number?)");
          }
          var s = arguments[1].evaluate(c).stringValue();
          var n1 = Math.round(arguments[2].evaluate(c).numberValue()) - 1;
          var n2 = arguments.length == 4 ? n1 + Math.round(arguments[3].evaluate(c).numberValue()) : void 0;
          return new XString(s.substring(n1, n2));
        };
        Functions.stringLength = function() {
          var c = arguments[0];
          var s;
          if (arguments.length == 1) {
            s = XNodeSet.prototype.stringForNode(c.contextNode);
          } else if (arguments.length == 2) {
            s = arguments[1].evaluate(c).stringValue();
          } else {
            throw new Error("Function string-length expects (string?)");
          }
          return new XNumber(s.length);
        };
        Functions.normalizeSpace = function() {
          var c = arguments[0];
          var s;
          if (arguments.length == 1) {
            s = XNodeSet.prototype.stringForNode(c.contextNode);
          } else if (arguments.length == 2) {
            s = arguments[1].evaluate(c).stringValue();
          } else {
            throw new Error("Function normalize-space expects (string?)");
          }
          var i = 0;
          var j = s.length - 1;
          while (Utilities.isSpace(s.charCodeAt(j))) {
            j--;
          }
          var t = "";
          while (i <= j && Utilities.isSpace(s.charCodeAt(i))) {
            i++;
          }
          while (i <= j) {
            if (Utilities.isSpace(s.charCodeAt(i))) {
              t += " ";
              while (i <= j && Utilities.isSpace(s.charCodeAt(i))) {
                i++;
              }
            } else {
              t += s.charAt(i);
              i++;
            }
          }
          return new XString(t);
        };
        Functions.translate = function(c, eValue, eFrom, eTo) {
          if (arguments.length != 4) {
            throw new Error("Function translate expects (string, string, string)");
          }
          var value = eValue.evaluate(c).stringValue();
          var from = eFrom.evaluate(c).stringValue();
          var to = eTo.evaluate(c).stringValue();
          var cMap = reduce(function(acc, ch, i) {
            if (!(ch in acc)) {
              acc[ch] = i > to.length ? "" : to[i];
            }
            return acc;
          }, {}, from);
          var t = join(
            "",
            map(function(ch) {
              return ch in cMap ? cMap[ch] : ch;
            }, value)
          );
          return new XString(t);
        };
        Functions.boolean_ = function() {
          var c = arguments[0];
          if (arguments.length != 2) {
            throw new Error("Function boolean expects (object)");
          }
          return arguments[1].evaluate(c).bool();
        };
        Functions.not = function(c, eValue) {
          if (arguments.length != 2) {
            throw new Error("Function not expects (object)");
          }
          return eValue.evaluate(c).bool().not();
        };
        Functions.true_ = function() {
          if (arguments.length != 1) {
            throw new Error("Function true expects ()");
          }
          return XBoolean.true_;
        };
        Functions.false_ = function() {
          if (arguments.length != 1) {
            throw new Error("Function false expects ()");
          }
          return XBoolean.false_;
        };
        Functions.lang = function() {
          var c = arguments[0];
          if (arguments.length != 2) {
            throw new Error("Function lang expects (string)");
          }
          var lang;
          for (var n = c.contextNode; n != null && n.nodeType != NodeTypes.DOCUMENT_NODE; n = n.parentNode) {
            var a = n.getAttributeNS(XPath.XML_NAMESPACE_URI, "lang");
            if (a != null) {
              lang = String(a);
              break;
            }
          }
          if (lang == null) {
            return XBoolean.false_;
          }
          var s = arguments[1].evaluate(c).stringValue();
          return new XBoolean(lang.substring(0, s.length) == s && (lang.length == s.length || lang.charAt(s.length) == "-"));
        };
        Functions.number = function() {
          var c = arguments[0];
          if (!(arguments.length == 1 || arguments.length == 2)) {
            throw new Error("Function number expects (object?)");
          }
          if (arguments.length == 1) {
            return new XNumber(XNodeSet.prototype.stringForNode(c.contextNode));
          }
          return arguments[1].evaluate(c).number();
        };
        Functions.sum = function() {
          var c = arguments[0];
          var ns;
          if (arguments.length != 2 || !Utilities.instance_of(ns = arguments[1].evaluate(c), XNodeSet)) {
            throw new Error("Function sum expects (node-set)");
          }
          ns = ns.toUnsortedArray();
          var n = 0;
          for (var i = 0; i < ns.length; i++) {
            n += new XNumber(XNodeSet.prototype.stringForNode(ns[i])).numberValue();
          }
          return new XNumber(n);
        };
        Functions.floor = function() {
          var c = arguments[0];
          if (arguments.length != 2) {
            throw new Error("Function floor expects (number)");
          }
          return new XNumber(Math.floor(arguments[1].evaluate(c).numberValue()));
        };
        Functions.ceiling = function() {
          var c = arguments[0];
          if (arguments.length != 2) {
            throw new Error("Function ceiling expects (number)");
          }
          return new XNumber(Math.ceil(arguments[1].evaluate(c).numberValue()));
        };
        Functions.round = function() {
          var c = arguments[0];
          if (arguments.length != 2) {
            throw new Error("Function round expects (number)");
          }
          return new XNumber(Math.round(arguments[1].evaluate(c).numberValue()));
        };
        var Utilities = new Object();
        var isAttributeLike = function(val) {
          return val && (val.nodeType === NodeTypes.ATTRIBUTE_NODE || val.ownerElement || val.isXPathNamespace);
        };
        Utilities.splitQName = function(qn) {
          var i = qn.indexOf(":");
          if (i == -1) {
            return [null, qn];
          }
          return [qn.substring(0, i), qn.substring(i + 1)];
        };
        Utilities.resolveQName = function(qn, nr, n, useDefault) {
          var parts = Utilities.splitQName(qn);
          if (parts[0] != null) {
            parts[0] = nr.getNamespace(parts[0], n);
          } else {
            if (useDefault) {
              parts[0] = nr.getNamespace("", n);
              if (parts[0] == null) {
                parts[0] = "";
              }
            } else {
              parts[0] = "";
            }
          }
          return parts;
        };
        Utilities.isSpace = function(c) {
          return c == 9 || c == 13 || c == 10 || c == 32;
        };
        Utilities.isLetter = function(c) {
          return c >= 65 && c <= 90 || c >= 97 && c <= 122 || c >= 192 && c <= 214 || c >= 216 && c <= 246 || c >= 248 && c <= 255 || c >= 256 && c <= 305 || c >= 308 && c <= 318 || c >= 321 && c <= 328 || c >= 330 && c <= 382 || c >= 384 && c <= 451 || c >= 461 && c <= 496 || c >= 500 && c <= 501 || c >= 506 && c <= 535 || c >= 592 && c <= 680 || c >= 699 && c <= 705 || c == 902 || c >= 904 && c <= 906 || c == 908 || c >= 910 && c <= 929 || c >= 931 && c <= 974 || c >= 976 && c <= 982 || c == 986 || c == 988 || c == 990 || c == 992 || c >= 994 && c <= 1011 || c >= 1025 && c <= 1036 || c >= 1038 && c <= 1103 || c >= 1105 && c <= 1116 || c >= 1118 && c <= 1153 || c >= 1168 && c <= 1220 || c >= 1223 && c <= 1224 || c >= 1227 && c <= 1228 || c >= 1232 && c <= 1259 || c >= 1262 && c <= 1269 || c >= 1272 && c <= 1273 || c >= 1329 && c <= 1366 || c == 1369 || c >= 1377 && c <= 1414 || c >= 1488 && c <= 1514 || c >= 1520 && c <= 1522 || c >= 1569 && c <= 1594 || c >= 1601 && c <= 1610 || c >= 1649 && c <= 1719 || c >= 1722 && c <= 1726 || c >= 1728 && c <= 1742 || c >= 1744 && c <= 1747 || c == 1749 || c >= 1765 && c <= 1766 || c >= 2309 && c <= 2361 || c == 2365 || c >= 2392 && c <= 2401 || c >= 2437 && c <= 2444 || c >= 2447 && c <= 2448 || c >= 2451 && c <= 2472 || c >= 2474 && c <= 2480 || c == 2482 || c >= 2486 && c <= 2489 || c >= 2524 && c <= 2525 || c >= 2527 && c <= 2529 || c >= 2544 && c <= 2545 || c >= 2565 && c <= 2570 || c >= 2575 && c <= 2576 || c >= 2579 && c <= 2600 || c >= 2602 && c <= 2608 || c >= 2610 && c <= 2611 || c >= 2613 && c <= 2614 || c >= 2616 && c <= 2617 || c >= 2649 && c <= 2652 || c == 2654 || c >= 2674 && c <= 2676 || c >= 2693 && c <= 2699 || c == 2701 || c >= 2703 && c <= 2705 || c >= 2707 && c <= 2728 || c >= 2730 && c <= 2736 || c >= 2738 && c <= 2739 || c >= 2741 && c <= 2745 || c == 2749 || c == 2784 || c >= 2821 && c <= 2828 || c >= 2831 && c <= 2832 || c >= 2835 && c <= 2856 || c >= 2858 && c <= 2864 || c >= 2866 && c <= 2867 || c >= 2870 && c <= 2873 || c == 2877 || c >= 2908 && c <= 2909 || c >= 2911 && c <= 2913 || c >= 2949 && c <= 2954 || c >= 2958 && c <= 2960 || c >= 2962 && c <= 2965 || c >= 2969 && c <= 2970 || c == 2972 || c >= 2974 && c <= 2975 || c >= 2979 && c <= 2980 || c >= 2984 && c <= 2986 || c >= 2990 && c <= 2997 || c >= 2999 && c <= 3001 || c >= 3077 && c <= 3084 || c >= 3086 && c <= 3088 || c >= 3090 && c <= 3112 || c >= 3114 && c <= 3123 || c >= 3125 && c <= 3129 || c >= 3168 && c <= 3169 || c >= 3205 && c <= 3212 || c >= 3214 && c <= 3216 || c >= 3218 && c <= 3240 || c >= 3242 && c <= 3251 || c >= 3253 && c <= 3257 || c == 3294 || c >= 3296 && c <= 3297 || c >= 3333 && c <= 3340 || c >= 3342 && c <= 3344 || c >= 3346 && c <= 3368 || c >= 3370 && c <= 3385 || c >= 3424 && c <= 3425 || c >= 3585 && c <= 3630 || c == 3632 || c >= 3634 && c <= 3635 || c >= 3648 && c <= 3653 || c >= 3713 && c <= 3714 || c == 3716 || c >= 3719 && c <= 3720 || c == 3722 || c == 3725 || c >= 3732 && c <= 3735 || c >= 3737 && c <= 3743 || c >= 3745 && c <= 3747 || c == 3749 || c == 3751 || c >= 3754 && c <= 3755 || c >= 3757 && c <= 3758 || c == 3760 || c >= 3762 && c <= 3763 || c == 3773 || c >= 3776 && c <= 3780 || c >= 3904 && c <= 3911 || c >= 3913 && c <= 3945 || c >= 4256 && c <= 4293 || c >= 4304 && c <= 4342 || c == 4352 || c >= 4354 && c <= 4355 || c >= 4357 && c <= 4359 || c == 4361 || c >= 4363 && c <= 4364 || c >= 4366 && c <= 4370 || c == 4412 || c == 4414 || c == 4416 || c == 4428 || c == 4430 || c == 4432 || c >= 4436 && c <= 4437 || c == 4441 || c >= 4447 && c <= 4449 || c == 4451 || c == 4453 || c == 4455 || c == 4457 || c >= 4461 && c <= 4462 || c >= 4466 && c <= 4467 || c == 4469 || c == 4510 || c == 4520 || c == 4523 || c >= 4526 && c <= 4527 || c >= 4535 && c <= 4536 || c == 4538 || c >= 4540 && c <= 4546 || c == 4587 || c == 4592 || c == 4601 || c >= 7680 && c <= 7835 || c >= 7840 && c <= 7929 || c >= 7936 && c <= 7957 || c >= 7960 && c <= 7965 || c >= 7968 && c <= 8005 || c >= 8008 && c <= 8013 || c >= 8016 && c <= 8023 || c == 8025 || c == 8027 || c == 8029 || c >= 8031 && c <= 8061 || c >= 8064 && c <= 8116 || c >= 8118 && c <= 8124 || c == 8126 || c >= 8130 && c <= 8132 || c >= 8134 && c <= 8140 || c >= 8144 && c <= 8147 || c >= 8150 && c <= 8155 || c >= 8160 && c <= 8172 || c >= 8178 && c <= 8180 || c >= 8182 && c <= 8188 || c == 8486 || c >= 8490 && c <= 8491 || c == 8494 || c >= 8576 && c <= 8578 || c >= 12353 && c <= 12436 || c >= 12449 && c <= 12538 || c >= 12549 && c <= 12588 || c >= 44032 && c <= 55203 || c >= 19968 && c <= 40869 || c == 12295 || c >= 12321 && c <= 12329;
        };
        Utilities.isNCNameChar = function(c) {
          return c >= 48 && c <= 57 || c >= 1632 && c <= 1641 || c >= 1776 && c <= 1785 || c >= 2406 && c <= 2415 || c >= 2534 && c <= 2543 || c >= 2662 && c <= 2671 || c >= 2790 && c <= 2799 || c >= 2918 && c <= 2927 || c >= 3047 && c <= 3055 || c >= 3174 && c <= 3183 || c >= 3302 && c <= 3311 || c >= 3430 && c <= 3439 || c >= 3664 && c <= 3673 || c >= 3792 && c <= 3801 || c >= 3872 && c <= 3881 || c == 46 || c == 45 || c == 95 || Utilities.isLetter(c) || c >= 768 && c <= 837 || c >= 864 && c <= 865 || c >= 1155 && c <= 1158 || c >= 1425 && c <= 1441 || c >= 1443 && c <= 1465 || c >= 1467 && c <= 1469 || c == 1471 || c >= 1473 && c <= 1474 || c == 1476 || c >= 1611 && c <= 1618 || c == 1648 || c >= 1750 && c <= 1756 || c >= 1757 && c <= 1759 || c >= 1760 && c <= 1764 || c >= 1767 && c <= 1768 || c >= 1770 && c <= 1773 || c >= 2305 && c <= 2307 || c == 2364 || c >= 2366 && c <= 2380 || c == 2381 || c >= 2385 && c <= 2388 || c >= 2402 && c <= 2403 || c >= 2433 && c <= 2435 || c == 2492 || c == 2494 || c == 2495 || c >= 2496 && c <= 2500 || c >= 2503 && c <= 2504 || c >= 2507 && c <= 2509 || c == 2519 || c >= 2530 && c <= 2531 || c == 2562 || c == 2620 || c == 2622 || c == 2623 || c >= 2624 && c <= 2626 || c >= 2631 && c <= 2632 || c >= 2635 && c <= 2637 || c >= 2672 && c <= 2673 || c >= 2689 && c <= 2691 || c == 2748 || c >= 2750 && c <= 2757 || c >= 2759 && c <= 2761 || c >= 2763 && c <= 2765 || c >= 2817 && c <= 2819 || c == 2876 || c >= 2878 && c <= 2883 || c >= 2887 && c <= 2888 || c >= 2891 && c <= 2893 || c >= 2902 && c <= 2903 || c >= 2946 && c <= 2947 || c >= 3006 && c <= 3010 || c >= 3014 && c <= 3016 || c >= 3018 && c <= 3021 || c == 3031 || c >= 3073 && c <= 3075 || c >= 3134 && c <= 3140 || c >= 3142 && c <= 3144 || c >= 3146 && c <= 3149 || c >= 3157 && c <= 3158 || c >= 3202 && c <= 3203 || c >= 3262 && c <= 3268 || c >= 3270 && c <= 3272 || c >= 3274 && c <= 3277 || c >= 3285 && c <= 3286 || c >= 3330 && c <= 3331 || c >= 3390 && c <= 3395 || c >= 3398 && c <= 3400 || c >= 3402 && c <= 3405 || c == 3415 || c == 3633 || c >= 3636 && c <= 3642 || c >= 3655 && c <= 3662 || c == 3761 || c >= 3764 && c <= 3769 || c >= 3771 && c <= 3772 || c >= 3784 && c <= 3789 || c >= 3864 && c <= 3865 || c == 3893 || c == 3895 || c == 3897 || c == 3902 || c == 3903 || c >= 3953 && c <= 3972 || c >= 3974 && c <= 3979 || c >= 3984 && c <= 3989 || c == 3991 || c >= 3993 && c <= 4013 || c >= 4017 && c <= 4023 || c == 4025 || c >= 8400 && c <= 8412 || c == 8417 || c >= 12330 && c <= 12335 || c == 12441 || c == 12442 || c == 183 || c == 720 || c == 721 || c == 903 || c == 1600 || c == 3654 || c == 3782 || c == 12293 || c >= 12337 && c <= 12341 || c >= 12445 && c <= 12446 || c >= 12540 && c <= 12542;
        };
        Utilities.coalesceText = function(n) {
          for (var m = n.firstChild; m != null; m = m.nextSibling) {
            if (m.nodeType == NodeTypes.TEXT_NODE || m.nodeType == NodeTypes.CDATA_SECTION_NODE) {
              var s = m.nodeValue;
              var first = m;
              m = m.nextSibling;
              while (m != null && (m.nodeType == NodeTypes.TEXT_NODE || m.nodeType == NodeTypes.CDATA_SECTION_NODE)) {
                s += m.nodeValue;
                var del = m;
                m = m.nextSibling;
                del.parentNode.removeChild(del);
              }
              if (first.nodeType == NodeTypes.CDATA_SECTION_NODE) {
                var p = first.parentNode;
                if (first.nextSibling == null) {
                  p.removeChild(first);
                  p.appendChild(p.ownerDocument.createTextNode(s));
                } else {
                  var next = first.nextSibling;
                  p.removeChild(first);
                  p.insertBefore(p.ownerDocument.createTextNode(s), next);
                }
              } else {
                first.nodeValue = s;
              }
              if (m == null) {
                break;
              }
            } else if (m.nodeType == NodeTypes.ELEMENT_NODE) {
              Utilities.coalesceText(m);
            }
          }
        };
        Utilities.instance_of = function(o, c) {
          while (o != null) {
            if (o.constructor === c) {
              return true;
            }
            if (o === Object) {
              return false;
            }
            o = o.constructor.superclass;
          }
          return false;
        };
        Utilities.getElementById = function(n, id) {
          if (n.nodeType == NodeTypes.ELEMENT_NODE) {
            if (n.getAttribute("id") == id || n.getAttributeNS(null, "id") == id) {
              return n;
            }
          }
          for (var m = n.firstChild; m != null; m = m.nextSibling) {
            var res = Utilities.getElementById(m, id);
            if (res != null) {
              return res;
            }
          }
          return null;
        };
        var XPathException = function() {
          function getMessage(code, exception) {
            var msg = exception ? ": " + exception.toString() : "";
            switch (code) {
              case XPathException2.INVALID_EXPRESSION_ERR:
                return "Invalid expression" + msg;
              case XPathException2.TYPE_ERR:
                return "Type error" + msg;
            }
            return null;
          }
          function XPathException2(code, error, message) {
            var err = Error.call(this, getMessage(code, error) || message);
            err.code = code;
            err.exception = error;
            return err;
          }
          XPathException2.prototype = Object.create(Error.prototype);
          XPathException2.prototype.constructor = XPathException2;
          XPathException2.superclass = Error;
          XPathException2.prototype.toString = function() {
            return this.message;
          };
          XPathException2.fromMessage = function(message, error) {
            return new XPathException2(null, error, message);
          };
          XPathException2.INVALID_EXPRESSION_ERR = 51;
          XPathException2.TYPE_ERR = 52;
          return XPathException2;
        }();
        XPathExpression.prototype = {};
        XPathExpression.prototype.constructor = XPathExpression;
        XPathExpression.superclass = Object.prototype;
        function XPathExpression(e, r, p) {
          this.xpath = p.parse(e);
          this.context = new XPathContext();
          this.context.namespaceResolver = new XPathNSResolverWrapper(r);
        }
        XPathExpression.getOwnerDocument = function(n) {
          return n.nodeType === NodeTypes.DOCUMENT_NODE ? n : n.ownerDocument;
        };
        XPathExpression.detectHtmlDom = function(n) {
          if (!n) {
            return false;
          }
          var doc = XPathExpression.getOwnerDocument(n);
          try {
            return doc.implementation.hasFeature("HTML", "2.0");
          } catch (e) {
            return true;
          }
        };
        XPathExpression.prototype.evaluate = function(n, t, res) {
          this.context.expressionContextNode = n;
          this.context.caseInsensitive = XPathExpression.detectHtmlDom(n);
          var result = this.xpath.evaluate(this.context);
          return new XPathResult(result, t);
        };
        XPathNSResolverWrapper.prototype = {};
        XPathNSResolverWrapper.prototype.constructor = XPathNSResolverWrapper;
        XPathNSResolverWrapper.superclass = Object.prototype;
        function XPathNSResolverWrapper(r) {
          this.xpathNSResolver = r;
        }
        XPathNSResolverWrapper.prototype.getNamespace = function(prefix, n) {
          if (this.xpathNSResolver == null) {
            return null;
          }
          return this.xpathNSResolver.lookupNamespaceURI(prefix);
        };
        NodeXPathNSResolver.prototype = {};
        NodeXPathNSResolver.prototype.constructor = NodeXPathNSResolver;
        NodeXPathNSResolver.superclass = Object.prototype;
        function NodeXPathNSResolver(n) {
          this.node = n;
          this.namespaceResolver = new NamespaceResolver();
        }
        NodeXPathNSResolver.prototype.lookupNamespaceURI = function(prefix) {
          return this.namespaceResolver.getNamespace(prefix, this.node);
        };
        XPathResult.prototype = {};
        XPathResult.prototype.constructor = XPathResult;
        XPathResult.superclass = Object.prototype;
        function XPathResult(v, t) {
          if (t == XPathResult.ANY_TYPE) {
            if (v.constructor === XString) {
              t = XPathResult.STRING_TYPE;
            } else if (v.constructor === XNumber) {
              t = XPathResult.NUMBER_TYPE;
            } else if (v.constructor === XBoolean) {
              t = XPathResult.BOOLEAN_TYPE;
            } else if (v.constructor === XNodeSet) {
              t = XPathResult.UNORDERED_NODE_ITERATOR_TYPE;
            }
          }
          this.resultType = t;
          switch (t) {
            case XPathResult.NUMBER_TYPE:
              this.numberValue = v.numberValue();
              return;
            case XPathResult.STRING_TYPE:
              this.stringValue = v.stringValue();
              return;
            case XPathResult.BOOLEAN_TYPE:
              this.booleanValue = v.booleanValue();
              return;
            case XPathResult.ANY_UNORDERED_NODE_TYPE:
            case XPathResult.FIRST_ORDERED_NODE_TYPE:
              if (v.constructor === XNodeSet) {
                this.singleNodeValue = v.first();
                return;
              }
              break;
            case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
            case XPathResult.ORDERED_NODE_ITERATOR_TYPE:
              if (v.constructor === XNodeSet) {
                this.invalidIteratorState = false;
                this.nodes = v.toArray();
                this.iteratorIndex = 0;
                return;
              }
              break;
            case XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE:
            case XPathResult.ORDERED_NODE_SNAPSHOT_TYPE:
              if (v.constructor === XNodeSet) {
                this.nodes = v.toArray();
                this.snapshotLength = this.nodes.length;
                return;
              }
              break;
          }
          throw new XPathException(XPathException.TYPE_ERR);
        }
        ;
        XPathResult.prototype.iterateNext = function() {
          if (this.resultType != XPathResult.UNORDERED_NODE_ITERATOR_TYPE && this.resultType != XPathResult.ORDERED_NODE_ITERATOR_TYPE) {
            throw new XPathException(XPathException.TYPE_ERR);
          }
          return this.nodes[this.iteratorIndex++];
        };
        XPathResult.prototype.snapshotItem = function(i) {
          if (this.resultType != XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE && this.resultType != XPathResult.ORDERED_NODE_SNAPSHOT_TYPE) {
            throw new XPathException(XPathException.TYPE_ERR);
          }
          return this.nodes[i];
        };
        XPathResult.ANY_TYPE = 0;
        XPathResult.NUMBER_TYPE = 1;
        XPathResult.STRING_TYPE = 2;
        XPathResult.BOOLEAN_TYPE = 3;
        XPathResult.UNORDERED_NODE_ITERATOR_TYPE = 4;
        XPathResult.ORDERED_NODE_ITERATOR_TYPE = 5;
        XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE = 6;
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE = 7;
        XPathResult.ANY_UNORDERED_NODE_TYPE = 8;
        XPathResult.FIRST_ORDERED_NODE_TYPE = 9;
        function installDOM3XPathSupport(doc, p) {
          doc.createExpression = function(e, r) {
            try {
              return new XPathExpression(e, r, p);
            } catch (e2) {
              throw new XPathException(XPathException.INVALID_EXPRESSION_ERR, e2);
            }
          };
          doc.createNSResolver = function(n) {
            return new NodeXPathNSResolver(n);
          };
          doc.evaluate = function(e, cn, r, t, res) {
            if (t < 0 || t > 9) {
              throw { code: 0, toString: function() {
                return "Request type not supported";
              } };
            }
            return doc.createExpression(e, r, p).evaluate(cn, t, res);
          };
        }
        ;
        try {
          var shouldInstall = true;
          try {
            if (document.implementation && document.implementation.hasFeature && document.implementation.hasFeature("XPath", null)) {
              shouldInstall = false;
            }
          } catch (e) {
          }
          if (shouldInstall) {
            installDOM3XPathSupport(document, new XPathParser());
          }
        } catch (e) {
        }
        installDOM3XPathSupport(exports2, new XPathParser());
        (function() {
          var parser = new XPathParser();
          var defaultNSResolver = new NamespaceResolver();
          var defaultFunctionResolver = new FunctionResolver();
          var defaultVariableResolver = new VariableResolver();
          function makeNSResolverFromFunction(func) {
            return {
              getNamespace: function(prefix, node) {
                var ns = func(prefix, node);
                return ns || defaultNSResolver.getNamespace(prefix, node);
              }
            };
          }
          function makeNSResolverFromObject(obj) {
            return makeNSResolverFromFunction(obj.getNamespace.bind(obj));
          }
          function makeNSResolverFromMap(map2) {
            return makeNSResolverFromFunction(function(prefix) {
              return map2[prefix];
            });
          }
          function makeNSResolver(resolver) {
            if (resolver && typeof resolver.getNamespace === "function") {
              return makeNSResolverFromObject(resolver);
            }
            if (typeof resolver === "function") {
              return makeNSResolverFromFunction(resolver);
            }
            if (typeof resolver === "object") {
              return makeNSResolverFromMap(resolver);
            }
            return defaultNSResolver;
          }
          function convertValue(value) {
            if (value === null || typeof value === "undefined" || value instanceof XString || value instanceof XBoolean || value instanceof XNumber || value instanceof XNodeSet) {
              return value;
            }
            switch (typeof value) {
              case "string":
                return new XString(value);
              case "boolean":
                return new XBoolean(value);
              case "number":
                return new XNumber(value);
            }
            var ns = new XNodeSet();
            ns.addArray([].concat(value));
            return ns;
          }
          function makeEvaluator(func) {
            return function(context) {
              var args = Array.prototype.slice.call(arguments, 1).map(function(arg) {
                return arg.evaluate(context);
              });
              var result = func.apply(this, [].concat(context, args));
              return convertValue(result);
            };
          }
          function makeFunctionResolverFromFunction(func) {
            return {
              getFunction: function(name2, namespace) {
                var found = func(name2, namespace);
                if (found) {
                  return makeEvaluator(found);
                }
                return defaultFunctionResolver.getFunction(name2, namespace);
              }
            };
          }
          function makeFunctionResolverFromObject(obj) {
            return makeFunctionResolverFromFunction(obj.getFunction.bind(obj));
          }
          function makeFunctionResolverFromMap(map2) {
            return makeFunctionResolverFromFunction(function(name2) {
              return map2[name2];
            });
          }
          function makeFunctionResolver(resolver) {
            if (resolver && typeof resolver.getFunction === "function") {
              return makeFunctionResolverFromObject(resolver);
            }
            if (typeof resolver === "function") {
              return makeFunctionResolverFromFunction(resolver);
            }
            if (typeof resolver === "object") {
              return makeFunctionResolverFromMap(resolver);
            }
            return defaultFunctionResolver;
          }
          function makeVariableResolverFromFunction(func) {
            return {
              getVariable: function(name2, namespace) {
                var value = func(name2, namespace);
                return convertValue(value);
              }
            };
          }
          function makeVariableResolver(resolver) {
            if (resolver) {
              if (typeof resolver.getVariable === "function") {
                return makeVariableResolverFromFunction(resolver.getVariable.bind(resolver));
              }
              if (typeof resolver === "function") {
                return makeVariableResolverFromFunction(resolver);
              }
              if (typeof resolver === "object") {
                return makeVariableResolverFromFunction(function(name2) {
                  return resolver[name2];
                });
              }
            }
            return defaultVariableResolver;
          }
          function copyIfPresent(prop, dest, source) {
            if (prop in source) {
              dest[prop] = source[prop];
            }
          }
          function makeContext(options) {
            var context = new XPathContext();
            if (options) {
              context.namespaceResolver = makeNSResolver(options.namespaces);
              context.functionResolver = makeFunctionResolver(options.functions);
              context.variableResolver = makeVariableResolver(options.variables);
              context.expressionContextNode = options.node;
              context.expressionContextPosition = options.position;
              context.expressionContextSize = options.size;
              copyIfPresent("allowAnyNamespaceForNoPrefix", context, options);
              copyIfPresent("isHtml", context, options);
            } else {
              context.namespaceResolver = defaultNSResolver;
            }
            return context;
          }
          function evaluate(parsedExpression, options) {
            var context = makeContext(options);
            return parsedExpression.evaluate(context);
          }
          var evaluatorPrototype = {
            evaluate: function(options) {
              return evaluate(this.expression, options);
            },
            evaluateNumber: function(options) {
              return this.evaluate(options).numberValue();
            },
            evaluateString: function(options) {
              return this.evaluate(options).stringValue();
            },
            evaluateBoolean: function(options) {
              return this.evaluate(options).booleanValue();
            },
            evaluateNodeSet: function(options) {
              return this.evaluate(options).nodeset();
            },
            select: function(options) {
              return this.evaluateNodeSet(options).toArray();
            },
            select1: function(options) {
              return this.select(options)[0];
            }
          };
          function parse(xpath2) {
            var parsed = parser.parse(xpath2);
            return Object.create(evaluatorPrototype, {
              expression: {
                value: parsed
              }
            });
          }
          exports2.parse = parse;
        })();
        assign(
          exports2,
          {
            XPath,
            XPathParser,
            XPathResult,
            Step,
            PathExpr,
            NodeTest,
            LocationPath,
            OrOperation,
            AndOperation,
            BarOperation,
            EqualsOperation,
            NotEqualOperation,
            LessThanOperation,
            GreaterThanOperation,
            LessThanOrEqualOperation,
            GreaterThanOrEqualOperation,
            PlusOperation,
            MinusOperation,
            MultiplyOperation,
            DivOperation,
            ModOperation,
            UnaryMinusOperation,
            FunctionCall,
            VariableReference,
            XPathContext,
            XNodeSet,
            XBoolean,
            XString,
            XNumber,
            NamespaceResolver,
            FunctionResolver,
            VariableResolver,
            Utilities
          }
        );
        exports2.select = function(e, doc, single) {
          return exports2.selectWithResolver(e, doc, null, single);
        };
        exports2.useNamespaces = function(mappings) {
          var resolver = {
            mappings: mappings || {},
            lookupNamespaceURI: function(prefix) {
              return this.mappings[prefix];
            }
          };
          return function(e, doc, single) {
            return exports2.selectWithResolver(e, doc, resolver, single);
          };
        };
        exports2.selectWithResolver = function(e, doc, resolver, single) {
          var expression = new XPathExpression(e, resolver, new XPathParser());
          var type = XPathResult.ANY_TYPE;
          var result = expression.evaluate(doc, type, null);
          if (result.resultType == XPathResult.STRING_TYPE) {
            result = result.stringValue;
          } else if (result.resultType == XPathResult.NUMBER_TYPE) {
            result = result.numberValue;
          } else if (result.resultType == XPathResult.BOOLEAN_TYPE) {
            result = result.booleanValue;
          } else {
            result = result.nodes;
            if (single) {
              result = result[0];
            }
          }
          return result;
        };
        exports2.select1 = function(e, doc) {
          return exports2.select(e, doc, true);
        };
        var isArrayOfNodes = function(value) {
          return Array.isArray(value) && value.every(isNodeLike);
        };
        var isNodeOfType = function(type) {
          return function(value) {
            return isNodeLike(value) && value.nodeType === type;
          };
        };
        assign(
          exports2,
          {
            isNodeLike,
            isArrayOfNodes,
            isElement: isNodeOfType(NodeTypes.ELEMENT_NODE),
            isAttribute: isNodeOfType(NodeTypes.ATTRIBUTE_NODE),
            isTextNode: isNodeOfType(NodeTypes.TEXT_NODE),
            isCDATASection: isNodeOfType(NodeTypes.CDATA_SECTION_NODE),
            isProcessingInstruction: isNodeOfType(NodeTypes.PROCESSING_INSTRUCTION_NODE),
            isComment: isNodeOfType(NodeTypes.COMMENT_NODE),
            isDocumentNode: isNodeOfType(NodeTypes.DOCUMENT_NODE),
            isDocumentTypeNode: isNodeOfType(NodeTypes.DOCUMENT_TYPE_NODE),
            isDocumentFragment: isNodeOfType(NodeTypes.DOCUMENT_FRAGMENT_NODE)
          }
        );
      })(xpath);
    }
  });

  // src/core/evaluate.js
  var require_evaluate = __commonJS({
    "src/core/evaluate.js"(exports, module) {
      "use strict";
      var { DOMParser, Node } = require_lib();
      var xpath = require_xpath();
      (function speedUp() {
        const P = xpath.XNodeSet && xpath.XNodeSet.prototype;
        if (!P || P.__zovoFast) return;
        P.__zovoFast = true;
        P.add = function(n) {
          let seen = this.__seen;
          if (!seen || this.__seenLen !== this.nodes.length) {
            seen = new Set(this.nodes);
            this.__seen = seen;
          }
          if (seen.has(n)) return;
          seen.add(n);
          this.tree = null;
          this.nodes.push(n);
          this.size += 1;
          this.__seenLen = this.nodes.length;
        };
        const NP = Node && Node.prototype;
        const orig = NP && NP.compareDocumentPosition;
        if (orig) {
          NP.compareDocumentPosition = function(other) {
            const a = this.__o, b = other ? other.__o : void 0;
            if (a !== void 0 && b !== void 0) return a === b ? 0 : a < b ? 4 : 2;
            return orig.call(this, other);
          };
        }
      })();
      var XML_NS = "http://www.w3.org/XML/1998/namespace";
      function blankSubset(text, doctype) {
        if (!doctype || doctype.subsetStart < 0 || doctype.subsetEnd <= doctype.subsetStart) return text;
        const s = doctype.subsetStart, e = doctype.subsetEnd;
        return text.slice(0, s) + text.slice(s, e).replace(/[^\r\n]/g, " ") + text.slice(e);
      }
      function parseDom(text, doctypeInfo) {
        const errors = [];
        const src = blankSubset(text, doctypeInfo);
        const parser = new DOMParser({
          locator: true,
          onError: (level, msg) => {
            if (level === "fatalError") throw new Error(String(msg));
            if (errors.length < 20) errors.push(String(msg).split("\n")[0]);
          }
        });
        const dom = parser.parseFromString(src, "text/xml");
        return { dom, errors };
      }
      function elementOrdinals(dom) {
        const ord = /* @__PURE__ */ new Map();
        let n = 0, o = 0;
        dom.__o = o++;
        const stack = [];
        for (let c = dom.lastChild; c; c = c.previousSibling) stack.push(c);
        while (stack.length) {
          const node = stack.pop();
          node.__o = o++;
          if (node.nodeType !== 1) continue;
          ord.set(node, n++);
          const at = node.attributes;
          if (at) for (let i = 0; i < at.length; i++) at[i].__o = o++;
          for (let c = node.lastChild; c; c = c.previousSibling) stack.push(c);
        }
        return ord;
      }
      function preview(s, max = 160) {
        const t = String(s).replace(/\s+/g, " ").trim();
        return t.length > max ? t.slice(0, max - 1) + "\u2026" : t;
      }
      function evaluate(state, expr, options = {}) {
        const t0 = Date.now();
        const ix2 = state.index;
        const notes = [];
        if (!state.dom) {
          try {
            const { dom, errors } = parseDom(state.text, ix2 && ix2.doctype ? { subsetStart: ix2.doctype.subsetStart, subsetEnd: ix2.doctype.subsetEnd } : null);
            state.dom = dom;
            state.domErrors = errors;
          } catch (e) {
            return { ok: false, error: "The file is not well formed, so XPath cannot run: " + preview(e.message, 300) };
          }
          state.ord = elementOrdinals(state.dom);
        }
        if (ix2 && ix2.doctype && ix2.doctype.entities && ix2.doctype.entities.count) {
          notes.push(`This file declares ${ix2.doctype.entities.count} entit${ix2.doctype.entities.count === 1 ? "y" : "ies"}. Entities are not expanded and nothing is read from disk or the network; references stay as text.`);
        }
        const namespaces = Object.assign({ xml: XML_NS }, ix2 ? ix2.prefixes : {}, options.namespaces || {});
        if (ix2 && ix2.conflicts && ix2.conflicts.length) notes.push(`Prefix ${ix2.conflicts.join(", ")} is bound to more than one namespace in this file; the first binding is used.`);
        let parsed;
        try {
          parsed = xpath.parse(String(expr));
        } catch (e) {
          return { ok: false, error: "XPath syntax error: " + preview(e.message, 300) };
        }
        let res;
        try {
          res = parsed.evaluate({ node: state.dom, namespaces, allowAnyNamespaceForNoPrefix: !options.strictNamespaces });
        } catch (e) {
          const m = /Cannot resolve QName (\S+)/.exec(e.message || "");
          if (m) {
            const known = Object.keys(namespaces).filter((p) => p !== "xml");
            return { ok: false, error: `Prefix "${m[1]}" is not declared in this file.` + (known.length ? ` Declared prefixes: ${known.join(", ")}.` : " This file declares no prefixes; use names without a prefix.") };
          }
          if (e instanceof RangeError) return { ok: false, error: "The XPath went too deep for this file: " + preview(e.message, 200) };
          return { ok: false, error: "XPath error: " + preview(e.message, 300) };
        }
        const max = options.maxResults || 5e3;
        const ms = () => Date.now() - t0;
        if (res instanceof xpath.XNodeSet || res && typeof res.toArray === "function" && typeof res.size === "number") {
          const nodes = res.toArray();
          const items = nodes.slice(0, max).map((n) => describe(n, state));
          return { ok: true, type: "nodes", items, total: nodes.length, ms: ms(), notes };
        }
        if (res instanceof xpath.XNumber) return { ok: true, type: "number", value: String(res.numberValue()), ms: ms(), notes };
        if (res instanceof xpath.XBoolean) return { ok: true, type: "boolean", value: String(res.booleanValue()), ms: ms(), notes };
        return { ok: true, type: "string", value: res.stringValue(), ms: ms(), notes };
      }
      function describe(n, state) {
        const ord = state.ord;
        const ix2 = state.index;
        const loc = (node) => node && node.lineNumber ? { line: node.lineNumber, col: node.columnNumber } : null;
        switch (n.nodeType) {
          case 1: {
            const i = ord.get(n);
            return { kind: "element", name: n.nodeName, ord: i === void 0 ? -1 : i, value: preview(n.textContent || ""), at: loc(n), childElements: ix2 && i !== void 0 && i < ix2.count ? ix2.childCount[i] : 0 };
          }
          case 2: {
            const owner = n.ownerElement;
            const i = owner ? ord.get(owner) : void 0;
            return { kind: "attribute", name: n.nodeName, ord: i === void 0 ? -1 : i, value: preview(n.value, 300), at: loc(n) || loc(owner) };
          }
          case 3:
          case 4: {
            const p = n.parentNode;
            const i = p ? ord.get(p) : void 0;
            return { kind: n.nodeType === 4 ? "cdata" : "text", name: n.nodeType === 4 ? "#cdata" : "#text", ord: i === void 0 ? -1 : i, value: preview(n.data, 300), at: loc(n) || loc(p) };
          }
          case 7:
            return { kind: "pi", name: n.target, ord: n.parentNode ? ord.get(n.parentNode) ?? -1 : -1, value: preview(n.data), at: loc(n) };
          case 8:
            return { kind: "comment", name: "#comment", ord: n.parentNode ? ord.get(n.parentNode) ?? -1 : -1, value: preview(n.data), at: loc(n) };
          case 9:
            return { kind: "document", name: "/", ord: -1, value: "", at: { line: 1, col: 1 } };
          default:
            return { kind: "node", name: n.nodeName, ord: -1, value: preview(n.nodeValue || ""), at: loc(n) };
        }
      }
      module.exports = { evaluate, parseDom, blankSubset, elementOrdinals };
    }
  });

  // src/core/xpathgen.js
  var require_xpathgen = __commonJS({
    "src/core/xpathgen.js"(exports, module) {
      "use strict";
      var { localName, prefixOf } = require_core();
      function quote(v) {
        if (!v.includes("'")) return `'${v}'`;
        if (!v.includes('"')) return `"${v}"`;
        return null;
      }
      function nameTest(ix2, i, style) {
        const local = localName(ix2, i);
        const pre = prefixOf(ix2, i);
        const ns = ix2.uris[ix2.nsId[i]];
        if (style === "portable") {
          return { test: `*[local-name()=${quote(local)}]`, same: (j) => localName(ix2, j) === local };
        }
        if (!pre) {
          return { test: local, same: (j) => !prefixOf(ix2, j) && localName(ix2, j) === local };
        }
        if (ix2.prefixes[pre] === ns && !(ix2.conflicts || []).includes(pre)) {
          return { test: `${pre}:${local}`, same: (j) => localName(ix2, j) === local && ix2.uris[ix2.nsId[j]] === ns };
        }
        return {
          test: `*[local-name()=${quote(local)} and namespace-uri()=${quote(ns)}]`,
          same: (j) => localName(ix2, j) === local && ix2.uris[ix2.nsId[j]] === ns
        };
      }
      function siblingsOf(ix2, i) {
        const p = ix2.parent[i];
        const out = [];
        if (p < 0) return ix2.roots.slice();
        for (let c = ix2.firstChild[p]; c >= 0; c = ix2.nextSibling[c]) out.push(c);
        return out;
      }
      function step(ix2, i, style) {
        const nt = nameTest(ix2, i, style);
        const sibs = siblingsOf(ix2, i);
        let pos = 0, total = 0;
        for (const j of sibs) {
          if (nt.same(j)) {
            total++;
            if (j === i) pos = total;
          }
        }
        if (style === "predicates" && ix2.keyName[i]) {
          const kn = ix2.keyName[i], kv = ix2.keyValue[i];
          const q = quote(kv);
          const kc = kn.indexOf(":");
          const prefixOk = kc < 0 || kn.startsWith("xml:") || ix2.prefixes[kn.slice(0, kc)] !== void 0 && !(ix2.conflicts || []).includes(kn.slice(0, kc));
          if (q && prefixOk) {
            let same = 0;
            for (const j of sibs) if (nt.same(j) && ix2.keyName[j] === kn && ix2.keyValue[j] === kv) same++;
            if (same === 1) return `${nt.test}[@${kn}=${q}]`;
          }
        }
        return total > 1 ? `${nt.test}[${pos}]` : nt.test;
      }
      function xpathFor(ix2, i, style = "indexed", attr) {
        if (i < 0) return "/";
        const steps = [];
        for (let e = i; e >= 0; e = ix2.parent[e]) steps.push(step(ix2, e, style));
        steps.reverse();
        let p = "/" + steps.join("/");
        if (attr) {
          const c = attr.indexOf(":");
          if (c < 0 || attr.startsWith("xml:")) p += style === "portable" && c > 0 ? `/@*[local-name()=${quote(attr.slice(c + 1))}]` : `/@${attr}`;
          else if (style !== "portable" && ix2.prefixes[attr.slice(0, c)] !== void 0 && !(ix2.conflicts || []).includes(attr.slice(0, c))) p += `/@${attr}`;
          else p += `/@*[local-name()=${quote(attr.slice(c + 1))}]`;
        }
        return p;
      }
      module.exports = { xpathFor, step };
    }
  });

  // .tc5-entry.js
  var ix = require_core();
  var fm = require_format();
  var ev = require_evaluate();
  var xg = require_xpathgen();
  self.ZovoEngine = {
    buildIndex: ix.buildIndex,
    children: ix.children,
    localName: ix.localName,
    format: fm.format,
    minify: fm.minify,
    evaluate: ev.evaluate,
    xpathFor: xg.xpathFor
  };
})();
