/* Zovo Convert to Markdown core (the same files as the live 0.1.1) (src/core/pdf.js, md.js, assets.js), for the browser tool page (built by
   sprint/tools/pdf-to-markdown/build-engine.sh from convert-to-markdown-vscode commit 0bf9f59a9450). MIT license. No network code. */
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

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

  // ../tc4/empty.js
  var require_empty = __commonJS({
    "../tc4/empty.js"(exports, module) {
      "use strict";
      module.exports = {};
    }
  });

  // url-shim.js
  var require_url_shim = __commonJS({
    "url-shim.js"(exports, module) {
      module.exports = { pathToFileURL: (p) => ({ href: String(p) }) };
    }
  });

  // ../../../../toolchk5-work/tc5-HsRE/p/src/core/md.js
  var require_md = __commonJS({
    "../../../../toolchk5-work/tc5-HsRE/p/src/core/md.js"(exports, module) {
      "use strict";
      function escapeText(s) {
        return String(s).replace(/\\/g, "\\\\").replace(/([`*[\]<>])/g, "\\$1").replace(/(^|[^\w])_|_(?=[^\w]|$)/g, (m) => m.replace("_", "\\_"));
      }
      function escapeLine(s) {
        let t = escapeText(s);
        t = t.replace(/^(\s*)([#>+=|-])/, "$1\\$2").replace(/^(\s*)(\d+)([.)])(\s)/, "$1$2\\$3$4");
        return t;
      }
      function cell(s, raw) {
        const v = String(s == null ? "" : s);
        const t = (raw ? v : escapeText(v)).replace(/\|/g, "\\|").replace(/\r?\n+/g, "<br>").replace(/\s+/g, " ").trim();
        return t;
      }
      function table(rows, { header = true, maxCols = 200, raw = false } = {}) {
        const r = rows.filter((x) => Array.isArray(x));
        if (!r.length) return "";
        const cols = Math.min(maxCols, r.reduce((m, x) => Math.max(m, x.length), 1));
        const pad = (x) => {
          const o = x.slice(0, cols).map((c) => cell(c, raw));
          while (o.length < cols) o.push("");
          return o;
        };
        const lines = [];
        const head = header ? pad(r[0]) : Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
        lines.push(`| ${head.map((c) => c || " ").join(" | ")} |`);
        lines.push(`|${" --- |".repeat(cols)}`);
        for (const x of header ? r.slice(1) : r) lines.push(`| ${pad(x).join(" | ")} |`);
        return lines.join("\n");
      }
      function tidy(md) {
        return String(md).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n*$/, "\n");
      }
      function slug(s) {
        return String(s).toLowerCase().replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "section";
      }
      function safeName(s, fallback = "file") {
        const t = String(s).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-").replace(/^[.\s-]+|[.\s]+$/g, "").slice(0, 80);
        return t || fallback;
      }
      module.exports = { escapeText, escapeLine, cell, table, tidy, slug, safeName };
    }
  });

  // ../../../../toolchk5-work/tc5-HsRE/p/src/core/pdf.js
  var require_pdf = __commonJS({
    "../../../../toolchk5-work/tc5-HsRE/p/src/core/pdf.js"(exports, module) {
      "use strict";
      var path = require_path_shim();
      var zlib = require_empty();
      var { pathToFileURL } = require_url_shim();
      var M = require_md();
      function polyfill() {
        if (!globalThis.DOMMatrix) {
          class DOMMatrix {
            constructor(init) {
              const v = Array.isArray(init) && init.length >= 6 ? init : [1, 0, 0, 1, 0, 0];
              [this.a, this.b, this.c, this.d, this.e, this.f] = v.map(Number);
            }
            get m11() {
              return this.a;
            }
            get m12() {
              return this.b;
            }
            get m21() {
              return this.c;
            }
            get m22() {
              return this.d;
            }
            get m41() {
              return this.e;
            }
            get m42() {
              return this.f;
            }
            get isIdentity() {
              return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
            }
            multiplySelf(o) {
              const m = o instanceof DOMMatrix ? o : new DOMMatrix(o && [o.a, o.b, o.c, o.d, o.e, o.f]);
              const { a, b, c, d, e, f } = this;
              this.a = a * m.a + c * m.b;
              this.b = b * m.a + d * m.b;
              this.c = a * m.c + c * m.d;
              this.d = b * m.c + d * m.d;
              this.e = a * m.e + c * m.f + e;
              this.f = b * m.e + d * m.f + f;
              return this;
            }
            preMultiplySelf(o) {
              const m = new DOMMatrix([o.a, o.b, o.c, o.d, o.e, o.f]);
              m.multiplySelf(this);
              Object.assign(this, { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f });
              return this;
            }
            multiply(o) {
              return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).multiplySelf(o);
            }
            translateSelf(x = 0, y = 0) {
              return this.multiplySelf(new DOMMatrix([1, 0, 0, 1, x, y]));
            }
            translate(x, y) {
              return this.multiply(new DOMMatrix([1, 0, 0, 1, x || 0, y || 0]));
            }
            scaleSelf(x = 1, y = x) {
              return this.multiplySelf(new DOMMatrix([x, 0, 0, y, 0, 0]));
            }
            scale(x = 1, y = x) {
              return this.multiply(new DOMMatrix([x, 0, 0, y, 0, 0]));
            }
            invertSelf() {
              const { a, b, c, d, e, f } = this;
              const det = a * d - b * c || 1;
              this.a = d / det;
              this.b = -b / det;
              this.c = -c / det;
              this.d = a / det;
              this.e = (c * f - d * e) / det;
              this.f = (b * e - a * f) / det;
              return this;
            }
            inverse() {
              return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).invertSelf();
            }
            transformPoint(p = {}) {
              const x = p.x || 0, y = p.y || 0;
              return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
            }
          }
          globalThis.DOMMatrix = DOMMatrix;
        }
        if (!globalThis.Path2D) globalThis.Path2D = class Path2D {
          addPath() {
          }
          moveTo() {
          }
          lineTo() {
          }
          bezierCurveTo() {
          }
          quadraticCurveTo() {
          }
          rect() {
          }
          closePath() {
          }
        };
        if (!globalThis.ImageData) globalThis.ImageData = class ImageData {
          constructor(a, b, c) {
            if (typeof a === "number") {
              this.width = a;
              this.height = b;
              this.data = new Uint8ClampedArray(a * b * 4);
            } else {
              this.data = a;
              this.width = b;
              this.height = c;
            }
          }
        };
      }
      var lib = null;
      async function loadPdfjs(dirs) {
        if (lib) return lib;
        polyfill();
        if (!globalThis.pdfjsWorker) globalThis.pdfjsWorker = await import(pathToFileURL(dirs.worker).href);
        lib = await import(pathToFileURL(dirs.lib).href);
        return lib;
      }
      var BULLET = /^([•◦▪▫‣∙·●○■□➢➤►▶✓✔-]|[*–])\s+/;
      var NUMBERED = /^(\d{1,3})([.)])\s+/;
      var PAGE_NO = /^\s*(page\s*)?\d{1,5}(\s*(of|\/)\s*\d{1,5})?\s*$/i;
      function refused(msg) {
        const e = new Error(msg);
        e.code = "REFUSED";
        return e;
      }
      function toLines(items, fonts, pageWidth = 612) {
        const parts = [];
        for (const it of items) {
          if (typeof it.str !== "string" || !it.str.trim()) continue;
          const t = it.transform || [1, 0, 0, 1, 0, 0];
          const size = Math.round((Math.hypot(t[2], t[3]) || Math.abs(t[0]) || it.height || 10) * 2) / 2;
          const f = fonts(it.fontName);
          parts.push({ s: it.str, x: t[4], y: t[5], w: it.width || it.str.length * size * 0.5, size, bold: !!(f && f.bold) || /bold|black|heavy|semibold/i.test(f && f.name || "") });
        }
        parts.sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = [];
        for (const p of parts) {
          const l = lines.length ? lines[lines.length - 1] : null;
          if (l && Math.abs(l.y - p.y) <= Math.max(2, Math.min(l.size, p.size) * 0.45)) l.items.push(p);
          else lines.push({ y: p.y, size: p.size, items: [p] });
          if (lines.length > 2e4) break;
        }
        const ordered = splitColumns(lines, pageWidth);
        if (ordered) {
          lines.length = 0;
          lines.push(...ordered);
        }
        for (const l of lines) {
          l.items.sort((a, b) => a.x - b.x);
          const segs = [];
          let cur = null;
          for (const p of l.items) {
            const gap = cur ? p.x - cur.end : 0;
            if (!cur || gap > Math.max(p.size * 1.6, 14)) {
              cur = { x: p.x, end: p.x + p.w, text: p.s, bold: p.bold, chars: p.s.trim().length, boldChars: p.bold ? p.s.trim().length : 0 };
              segs.push(cur);
            } else {
              const space = gap > p.size * 0.12 && !/\s$/.test(cur.text) && !/^\s/.test(p.s);
              cur.text += (space ? " " : "") + p.s;
              cur.end = Math.max(cur.end, p.x + p.w);
              cur.chars += p.s.trim().length;
              if (p.bold) cur.boldChars += p.s.trim().length;
            }
          }
          for (const s of segs) s.text = s.text.replace(/\s+/g, " ").trim();
          l.segs = segs.filter((s) => s.text);
          l.x = l.segs.length ? l.segs[0].x : 0;
          const by = /* @__PURE__ */ new Map();
          for (const p of l.items) by.set(p.size, (by.get(p.size) || 0) + p.s.trim().length);
          let best = -1;
          for (const [sz, n] of by) if (n > best || n === best && sz > l.size) {
            best = n;
            l.size = sz;
          }
          l.text = l.segs.map((s) => s.text).join(" ");
          const chars = l.segs.reduce((n, s) => n + s.chars, 0);
          l.bold = chars > 0 && l.segs.reduce((n, s) => n + s.boldChars, 0) >= chars * 0.9;
          delete l.items;
        }
        return lines.filter((l) => l.text);
      }
      function splitColumns(lines, pageWidth) {
        if (lines.length < 10) return null;
        let best = null;
        for (let x2 = pageWidth * 0.3; x2 <= pageWidth * 0.7; x2 += 2) {
          let cross = 0, left2 = 0, right2 = 0, lc = 0, rc = 0;
          for (const l of lines) {
            let c = false, L = 0, R = 0;
            for (const p of l.items) {
              if (p.x < x2 - 1 && p.x + p.w > x2 + 1) {
                c = true;
                break;
              }
              if (p.x + p.w <= x2 + 1) L += p.s.length;
              else R += p.s.length;
            }
            if (c) cross++;
            else {
              if (L) {
                left2++;
                lc += L;
              }
              if (R) {
                right2++;
                rc += R;
              }
            }
          }
          if (!best || cross < best.cross) best = { x: x2, cross, left: left2, right: right2, lc, rc };
        }
        const n = lines.length;
        if (!best || best.cross > n * 0.15 || best.left < n * 0.3 || best.right < n * 0.3) return null;
        if (best.lc / best.left < 25 || best.rc / best.right < 25) return null;
        const x = best.x;
        const top = [], left = [], right = [];
        let firstSplit = null;
        for (const l of lines) {
          const crossing = l.items.some((p) => p.x < x - 1 && p.x + p.w > x + 1);
          if (crossing) {
            (firstSplit === null ? top : left).push(l);
            continue;
          }
          if (firstSplit === null) firstSplit = l.y;
          const L = l.items.filter((p) => p.x + p.w <= x + 1), R = l.items.filter((p) => p.x + p.w > x + 1);
          if (L.length) left.push({ y: l.y, size: l.size, items: L });
          if (R.length) right.push({ y: l.y, size: l.size, items: R });
        }
        return [...top, ...left, ...right];
      }
      function reorderColumns(lines, pageWidth) {
        const two = lines.filter((l) => l.segs.length === 2 && l.segs[0].text.length > 20 && l.segs[1].text.length > 20);
        if (lines.length < 8 || two.length < lines.length * 0.5) return lines;
        const xs = two.map((l) => l.segs[1].x).sort((a, b) => a - b);
        const split = xs[Math.floor(xs.length / 2)];
        if (split < pageWidth * 0.3 || split > pageWidth * 0.7) return lines;
        const left = [], right = [], full = [];
        for (const l of lines) {
          if (l.segs.length === 2 && Math.abs(l.segs[1].x - split) < 30) {
            left.push({ ...l, segs: [l.segs[0]], text: l.segs[0].text, x: l.segs[0].x });
            right.push({ ...l, segs: [l.segs[1]], text: l.segs[1].text, x: l.segs[1].x });
          } else if (l.x >= split - 5) right.push(l);
          else if (l.segs.length === 1 && l.segs[0].end <= split + 5) left.push(l);
          else full.push(l);
        }
        const top = full.filter((l) => !left.length || l.y > left[0].y);
        const rest = full.filter((l) => !top.includes(l));
        return [...top, ...left, ...right, ...rest];
      }
      function headingLevel(size, levels) {
        const i = levels.indexOf(size);
        return i < 0 ? 0 : Math.min(4, i + 1);
      }
      function pageBlocks(lines, ctx, bodySize, levels) {
        const out = [];
        let para = null;
        let lastLi = false;
        const emit = (s, li) => {
          if (li && lastLi) out[out.length - 1] += "\n" + s;
          else out.push(s);
          lastLi = !!li;
        };
        const flushPara = () => {
          if (para) {
            emit(para.kind === "p" ? M.escapeLine(para.text) : para.md, para.kind === "li");
            para = null;
          }
        };
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (l.image) {
            flushPara();
            emit(l.image);
            continue;
          }
          if (l.segs.length >= 2) {
            let j = i;
            while (j + 1 < lines.length && !lines[j + 1].image && lines[j + 1].segs.length === l.segs.length && l.y - lines[j + 1].y < l.size * 3 * (j + 2 - i)) j++;
            const run = lines.slice(i, j + 1);
            const avg = run.reduce((n2, r) => n2 + r.text.length, 0) / run.length / l.segs.length;
            if (run.length >= 2 && avg < 40) {
              flushPara();
              emit(M.table(run.map((r) => r.segs.map((s) => s.text))));
              i = j;
              continue;
            }
          }
          const lvl = l.text.length <= 150 ? headingLevel(l.size, levels) : 0;
          if (lvl) {
            flushPara();
            let text = l.text;
            while (i + 1 < lines.length && !lines[i + 1].image && lines[i + 1].size === l.size && l.y - lines[i + 1].y < l.size * 1.5 && text.length < 150) {
              text += " " + lines[i + 1].text;
              i++;
            }
            emit(`${"#".repeat(lvl)} ${M.escapeText(text)}`);
            ctx.headings.push({ level: lvl, text });
            continue;
          }
          const b = BULLET.exec(l.text);
          const n = !b && NUMBERED.exec(l.text);
          if (b || n && l.text.length > n[0].length) {
            flushPara();
            const rest = l.text.slice((b || n)[0].length);
            para = { kind: "li", x: l.x, y: l.y, size: l.size, md: `${b ? "-" : `${n[1]}.`} ${M.escapeText(rest)}` };
            continue;
          }
          if (l.bold && l.text.length < 90 && l.size <= bodySize + 0.5 && !/[.,;]$/.test(l.text)) {
            flushPara();
            emit(`**${M.escapeText(l.text)}**`);
            continue;
          }
          if (para && para.kind === "li" && l.x > para.x + 2 && para.y - l.y < l.size * 1.8) {
            para.md += " " + M.escapeText(l.text);
            para.y = l.y;
            continue;
          }
          if (para && para.kind === "p" && Math.abs(para.size - l.size) < 1 && para.y - l.y < l.size * 1.75 && para.y - l.y > 0) {
            if (/[A-Za-z]-$/.test(para.text) && /^[a-z]/.test(l.text)) para.text = para.text.slice(0, -1) + l.text;
            else para.text += " " + l.text;
            para.y = l.y;
            continue;
          }
          flushPara();
          para = { kind: "p", text: l.text, y: l.y, size: l.size };
        }
        flushPara();
        return out;
      }
      function pngEncode(img) {
        const { width: w, height: h, kind, data } = img;
        if (!w || !h || !data || w * h > 4e7) return null;
        const ch = kind === 3 ? 4 : 3;
        const raw = Buffer.alloc((w * ch + 1) * h);
        if (kind === 1) {
          const stride = w + 7 >> 3;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const v = data[y * stride + (x >> 3)] >> 7 - (x & 7) & 1 ? 255 : 0;
            const o = y * (w * 3 + 1) + 1 + x * 3;
            raw[o] = raw[o + 1] = raw[o + 2] = v;
          }
        } else {
          for (let y = 0; y < h; y++) raw.set(data.subarray(y * w * ch, (y + 1) * w * ch), y * (w * ch + 1) + 1);
        }
        const crcT = pngEncode.t || (pngEncode.t = Array.from({ length: 256 }, (_, n) => {
          let c = n;
          for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
          return c >>> 0;
        }));
        const crc = (b) => {
          let c = 4294967295;
          for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ c >>> 8;
          return (c ^ 4294967295) >>> 0;
        };
        const chunk = (type, d) => {
          const len = Buffer.alloc(4);
          len.writeUInt32BE(d.length);
          const td = Buffer.concat([Buffer.from(type, "latin1"), d]);
          const c = Buffer.alloc(4);
          c.writeUInt32BE(crc(td));
          return Buffer.concat([len, td, c]);
        };
        const ihdr = Buffer.alloc(13);
        ihdr.writeUInt32BE(w, 0);
        ihdr.writeUInt32BE(h, 4);
        ihdr[8] = 8;
        ihdr[9] = ch === 4 ? 6 : 2;
        return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
      }
      function getObj(objs, name) {
        return new Promise((resolve) => {
          const t = setTimeout(() => resolve(null), 3e3);
          try {
            objs.get(name, (v) => {
              clearTimeout(t);
              resolve(v);
            });
          } catch {
            clearTimeout(t);
            resolve(null);
          }
        });
      }
      function imageOps(OPS, ops) {
        const out = [];
        const stack = [];
        let m = [1, 0, 0, 1, 0, 0];
        const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
        for (let i = 0; i < ops.fnArray.length && out.length < 500; i++) {
          const fn = ops.fnArray[i];
          if (fn === OPS.save) stack.push(m);
          else if (fn === OPS.restore) m = stack.pop() || [1, 0, 0, 1, 0, 0];
          else if (fn === OPS.transform) m = mul(m, ops.argsArray[i]);
          else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
            const a = ops.argsArray[i];
            const wPt = Math.hypot(m[0], m[1]), hPt = Math.hypot(m[2], m[3]);
            out.push({ name: typeof a[0] === "string" ? a[0] : null, inline: typeof a[0] === "string" ? null : a[0], top: m[5] + Math.max(0, m[3]), wPt, hPt });
          }
        }
        return out;
      }
      async function pdf2(buf, ctx) {
        const pdfjs = await loadPdfjs(ctx.pdfjs);
        const data = new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
        let doc;
        try {
          doc = await pdfjs.getDocument({
            data,
            isEvalSupported: false,
            disableFontFace: true,
            useSystemFonts: false,
            verbosity: 0,
            stopAtErrors: false,
            isOffscreenCanvasSupported: false,
            isImageDecoderSupported: false,
            maxImageSize: 25e6,
            cMapUrl: ctx.pdfjs.cmaps ? ctx.pdfjs.cmaps.replace(/\/?$/, "/") : void 0,
            cMapPacked: true
          }).promise;
        } catch (e) {
          if (e && e.name === "PasswordException") throw refused("This PDF is password-protected. Open it in a PDF reader, save a copy without the password and convert that copy.");
          throw refused(`The PDF could not be read: ${String(e && e.message || e).slice(0, 200)}`);
        }
        try {
          const total = doc.numPages;
          const maxPages = Math.max(1, Math.min(total, ctx.limits && ctx.limits.maxPages || 1e3));
          let title = "";
          try {
            const md = await doc.getMetadata();
            title = String(md && md.info && md.info.Title || "").trim();
          } catch {
          }
          const pages = [];
          const sizeChars = /* @__PURE__ */ new Map();
          const seenImages = /* @__PURE__ */ new Set();
          let chars = 0, imageCount = 0;
          for (let i = 1; i <= maxPages; i++) {
            ctx.progress(`Page ${i} of ${maxPages}`, i / maxPages);
            ctx.checkCancel();
            let page;
            try {
              page = await doc.getPage(i);
            } catch (e) {
              pages.push({ lines: [], error: String(e && e.message || e) });
              continue;
            }
            const view = page.view || [0, 0, 612, 792];
            const height = view[3] - view[1], width = view[2] - view[0];
            let ops = null;
            try {
              ops = await page.getOperatorList();
            } catch {
              ops = null;
            }
            const tc = await page.getTextContent();
            const fonts = (name) => {
              try {
                return page.commonObjs.has(name) ? page.commonObjs.get(name) : null;
              } catch {
                return null;
              }
            };
            const lines = toLines(tc.items, fonts, width);
            for (const l of lines) {
              chars += l.text.length;
              sizeChars.set(l.size, (sizeChars.get(l.size) || 0) + l.text.length);
            }
            const imgs = [];
            if (ops) {
              for (const im of imageOps(pdfjs.OPS, ops)) {
                if (im.wPt < 24 || im.hPt < 24) continue;
                const key = im.name ? `${im.name}` : null;
                if (key && seenImages.has(key)) continue;
                if (key) seenImages.add(key);
                imageCount++;
                let md;
                if (ctx.assets.collecting) {
                  const obj = im.inline || (im.name ? await getObj(im.name.startsWith("g_") ? page.commonObjs : page.objs, im.name) : null);
                  md = ctx.assets.add(obj ? pngEncode(obj) : null, `Image ${imageCount} on page ${i}`, "png");
                } else md = ctx.assets.add(null, "");
                imgs.push({ y: im.top, image: md, segs: [], text: "", size: 0 });
              }
            }
            pages.push({ lines, imgs, height, n: i });
            page.cleanup();
          }
          const rep = /* @__PURE__ */ new Map();
          for (const p of pages) for (const l of p.lines || []) {
            if (l.y < p.height * 0.92 && l.y > p.height * 0.08) continue;
            const k = `${l.text.replace(/\d+/g, "#")}@${Math.round(l.y / 4)}`;
            rep.set(k, (rep.get(k) || 0) + 1);
          }
          const minRep = Math.max(3, Math.ceil(pages.length * 0.5));
          let bodySize = 10, best = -1;
          for (const [s, n] of sizeChars) if (n > best) {
            best = n;
            bodySize = s;
          }
          const levels = [...sizeChars.keys()].filter((s) => s >= bodySize * 1.15 && s >= bodySize + 1).sort((a, b) => b - a).slice(0, 4);
          const headings = [];
          const blocks = [];
          for (const p of pages) {
            let lines = (p.lines || []).filter((l) => {
              const edge = l.y >= p.height * 0.92 || l.y <= p.height * 0.08;
              if (!edge) return true;
              if (PAGE_NO.test(l.text)) return false;
              return (rep.get(`${l.text.replace(/\d+/g, "#")}@${Math.round(l.y / 4)}`) || 0) < minRep || pages.length < 3;
            });
            if (p.imgs && p.imgs.length) {
              for (const im of p.imgs) {
                const at = lines.findIndex((l) => l.y < im.y - 1);
                if (at < 0) lines.push(im);
                else lines.splice(at, 0, im);
              }
            }
            const b = pageBlocks(lines, { headings }, bodySize, levels);
            if (b.length) blocks.push(b.join("\n\n"));
          }
          const notes = [];
          if (total > maxPages) notes.push(`Only the first ${maxPages.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} pages were converted (setting toMarkdown.pdfMaxPages).`);
          if (chars < 20 * pages.length) notes.push(imageCount ? "This PDF has little or no text: it looks like scanned pages. Text recognition (OCR) is not part of this extension, so only the images are listed." : "This PDF has little or no text to convert.");
          let markdown = blocks.join("\n\n");
          if (total > maxPages) markdown += `

*${notes[0]}*`;
          if (!title && headings.length) title = headings[0].text;
          return { markdown: M.tidy(markdown), title, headings, meta: { format: "PDF", pages: total }, notes };
        } finally {
          try {
            await doc.destroy();
          } catch {
          }
        }
      }
      module.exports = { pdf: pdf2, toLines, reorderColumns, pageBlocks, pngEncode, PAGE_NO };
    }
  });

  // ../../../../toolchk5-work/tc5-HsRE/p/src/core/assets.js
  var require_assets = __commonJS({
    "../../../../toolchk5-work/tc5-HsRE/p/src/core/assets.js"(exports, module) {
      "use strict";
      var M = require_md();
      var MAX_IMAGES = 2e3;
      var MAX_TOTAL = 512 * 1024 * 1024;
      function sniffExt(b) {
        if (!b || b.length < 4) return "";
        if (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) return "png";
        if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpg";
        if (b[0] === 71 && b[1] === 73 && b[2] === 70) return "gif";
        if (b[0] === 66 && b[1] === 77) return "bmp";
        if (b.length > 12 && Buffer.from(b.subarray(0, 4)).toString("latin1") === "RIFF" && Buffer.from(b.subarray(8, 12)).toString("latin1") === "WEBP") return "webp";
        if (b[0] === 73 && b[1] === 73 && b[2] === 42 || b[0] === 77 && b[1] === 77 && b[3] === 42) return "tif";
        if (b.length >= 44 && b[0] === 1 && b[1] === 0 && b[2] === 0 && b[3] === 0 && b[40] === 32 && b[41] === 69 && b[42] === 77 && b[43] === 70) return "emf";
        if (b[0] === 215 && b[1] === 205 && b[2] === 198 && b[3] === 154) return "wmf";
        const head = Buffer.from(b.subarray(0, 256)).toString("utf8");
        if (/<svg[\s>]/i.test(head)) return "svg";
        return "";
      }
      var Assets2 = class {
        constructor(mode = "placeholder", dir = "assets") {
          this.mode = mode;
          this.dir = dir;
          this.files = [];
          this.count = 0;
          this.total = 0;
          this.skipped = 0;
        }
        get collecting() {
          return this.mode === "collect";
        }
        placeholder(alt) {
          const a = String(alt || "").replace(/\s+/g, " ").trim();
          return `*[Image${a ? `: ${M.escapeText(a)}` : ""}]*`;
        }
        /** bytes: Uint8Array or Buffer, or null. Returns the Markdown for the image. */
        add(bytes, alt, hintExt) {
          this.count++;
          if (!this.collecting || !bytes || !bytes.length) return this.placeholder(alt);
          if (this.files.length >= MAX_IMAGES || this.total + bytes.length > MAX_TOTAL) {
            this.skipped++;
            return this.placeholder(alt);
          }
          const ext = sniffExt(bytes) || String(hintExt || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
          const name = `image-${String(this.files.length + 1).padStart(3, "0")}.${ext}`;
          this.files.push({ name, data: Buffer.from(bytes.buffer ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes) });
          this.total += bytes.length;
          const a = String(alt || "").replace(/\s+/g, " ").replace(/[[\]\\]/g, "").trim() || `Image ${this.files.length}`;
          return `![${a}](${encodeURI(`${this.dir}/${name}`).replace(/[()]/g, (c) => c === "(" ? "%28" : "%29")})`;
        }
        /** For data: URIs (ODT and HTML) */
        addDataUri(uri, alt) {
          const m = /^data:([\w/+.-]+)?(;base64)?,(.*)$/s.exec(String(uri || ""));
          if (!m) return this.placeholder(alt);
          if (!this.collecting) {
            this.count++;
            return this.placeholder(alt);
          }
          const bytes = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
          return this.add(bytes, alt, (m[1] || "").split("/")[1]);
        }
      };
      module.exports = { Assets: Assets2, sniffExt };
    }
  });

  // ../../../../toolchk5-work/tc5-HsRE/entry.js
  var { pdf } = require_pdf();
  var { Assets } = require_assets();
  self.ZovoEngine = { pdf, Assets };
})();
