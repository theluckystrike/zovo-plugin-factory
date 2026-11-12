/* Zovo Dotenv & .env File Editor 0.1.0 core, for the browser tool page (built by sprint/tools/bundle_tc4.py
   from dotenv-vscode commit 23690139fe93). MIT license, github.com/theluckystrike/dotenv-vscode. No network code. */
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // ../../../toolchk4-work/tc4-w2ghf2r9/p/src/core/parse.js
  var require_parse = __commonJS({
    "../../../toolchk4-work/tc4-w2ghf2r9/p/src/core/parse.js"(exports, module) {
      "use strict";
      var KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
      var SECRET_RE = /(SECRET|TOKEN|PASSWORD|PASSWD|PWD|PASS\b|_PASS|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|AUTH|SESSION|SALT|SIGNING|ENCRYPTION|CLIENT_?ID|DSN|DATABASE_URL|_URL$|_URI$|CONNECTION|WEBHOOK|(^|_)KEY$)/i;
      var MAX_LINES = 5e4;
      var isSecretKey = (k) => SECRET_RE.test(k);
      function parse(text) {
        const entries = [], problems = [], comments = [];
        const n = text.length;
        let i = 0, line = 0;
        const seen = /* @__PURE__ */ new Map();
        const add = (p2) => {
          if (problems.length < 5e3) problems.push(p2);
        };
        while (i < n && line < MAX_LINES) {
          let eol = text.indexOf("\n", i);
          if (eol < 0) eol = n;
          const lineStart = i;
          let s = text.slice(i, eol).replace(/\r$/, "");
          const lineEnd = lineStart + s.length;
          const lead = s.length - s.trimStart().length;
          const body = s.trim();
          if (!body) {
            i = eol + 1;
            line++;
            continue;
          }
          if (body[0] === "#") {
            comments.push({ line, start: lineStart + lead, end: lineEnd, text: body });
            i = eol + 1;
            line++;
            continue;
          }
          let p2 = lineStart + lead;
          let exported = false;
          const ex = /^export\s+/.exec(text.slice(p2, lineEnd));
          if (ex) {
            exported = true;
            p2 += ex[0].length;
          }
          const eq = text.indexOf("=", p2);
          const colon = text.indexOf(":", p2);
          let sep = eq >= 0 && eq < lineEnd ? eq : -1;
          if (sep < 0 && colon >= 0 && colon < lineEnd && /^\s*[A-Za-z_][\w.-]*\s*$/.test(text.slice(p2, colon))) sep = colon;
          if (sep < 0) {
            const word = text.slice(p2, lineEnd).trim();
            add({ code: "no-equals", message: `"${word.slice(0, 60)}" has no "=". A line is KEY=value, a comment starting with #, or empty.`, severity: "error", start: p2, end: lineEnd, line });
            i = eol + 1;
            line++;
            continue;
          }
          const keyRaw = text.slice(p2, sep);
          const key = keyRaw.trim();
          const keyStart = p2 + (keyRaw.length - keyRaw.trimStart().length), keyEnd = keyStart + key.length;
          if (!key) add({ code: "empty-key", message: 'The key before "=" is empty.', severity: "error", start: p2, end: sep + 1, line });
          else if (!KEY_RE.test(key)) add({ code: "bad-key", message: `"${key.slice(0, 60)}" is not a valid name: use letters, digits and _ (not starting with a digit).`, severity: "error", start: keyStart, end: keyEnd, line });
          let v = sep + 1;
          const spaceBefore = /[ \t]$/.test(keyRaw) && key;
          const afterSep = text.slice(v, lineEnd);
          const spaceAfter = /^[ \t]+\S/.test(afterSep);
          if (sep === eq && (spaceBefore || spaceAfter)) {
            const wsEnd = v + (afterSep.length - afterSep.trimStart().length);
            add({ code: "space-around-equals", message: `Spaces around "=" in ${key}. dotenv trims them, but Docker Compose (env_file), shells (source .env) and systemd keep or reject them.`, severity: "warning", start: keyEnd, end: wsEnd, line, fix: { title: `Remove the spaces around "=" in ${key}`, start: keyEnd, end: wsEnd, text: "=" } });
          }
          while (v < lineEnd && (text[v] === " " || text[v] === "	")) v++;
          const q = text[v];
          let value = "", raw = "", valueStart = v, valueEnd = v, endLine = line, quote = "", next = eol + 1;
          if ((q === '"' || q === "'" || q === "`") && v < lineEnd) {
            quote = q;
            let j = v + 1, out = "", closed = false;
            while (j < n) {
              const c = text[j];
              if (c === "\\" && q === '"' && j + 1 < n) {
                const d = text[j + 1];
                out += d === "n" ? "\n" : d === "r" ? "\r" : d === "t" ? "	" : d;
                j += 2;
                continue;
              }
              if (c === q) {
                closed = true;
                break;
              }
              out += c;
              j++;
              if (j - v > 1 << 20) break;
            }
            if (!closed) {
              add({ code: "unclosed-quote", message: `The ${q === '"' ? "double" : q === "'" ? "single" : "back"} quote that starts the value of ${key} is never closed; everything after it would become the value.`, severity: "error", start: v, end: lineEnd, line });
              value = text.slice(v + 1, lineEnd);
              raw = text.slice(v, lineEnd);
              valueEnd = lineEnd;
            } else {
              value = out.replace(/\r\n/g, "\n");
              raw = text.slice(v, j + 1);
              valueEnd = j + 1;
              endLine = line + (text.slice(v, j).match(/\n/g) || []).length;
              let tailEnd = text.indexOf("\n", j);
              if (tailEnd < 0) tailEnd = n;
              const tail = text.slice(j + 1, tailEnd).replace(/\r$/, "");
              if (tail.trim() && !/^\s+#/.test(tail) && tail.trim()[0] !== "#") add({ code: "after-quote", message: `Text after the closing quote of ${key} is ignored: "${tail.trim().slice(0, 40)}".`, severity: "warning", start: j + 1, end: j + 1 + tail.length, line: endLine });
              next = tailEnd + 1;
            }
          } else {
            let end = lineEnd;
            const hash = text.slice(v, lineEnd).search(/\s#/);
            if (hash >= 0) end = v + hash;
            raw = text.slice(v, end);
            const trimmed = raw.replace(/[ \t]+$/, "");
            if (trimmed.length !== raw.length && hash < 0) add({ code: "trailing-space", message: `${key} ends with invisible spaces. dotenv drops them, other tools keep them in the value.`, severity: "info", start: v + trimmed.length, end, line, fix: { title: `Remove the trailing spaces after ${key}`, start: v + trimmed.length, end, text: "" } });
            raw = trimmed;
            value = trimmed;
            valueEnd = v + trimmed.length;
            if (/\s/.test(value) && /[\s]/.test(value.trim()) && !/^\S+$/.test(value)) add({ code: "unquoted-space", message: `The value of ${key} has spaces and no quotes. Shells and Docker Compose read it differently; put it in double quotes.`, severity: "info", start: v, end: valueEnd, line, fix: { title: `Put the value of ${key} in double quotes`, start: v, end: valueEnd, text: `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` } });
          }
          const refs = [];
          if (quote !== "'") {
            const re = /(\\?)\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(?::?-[^}]*)?\}|([A-Za-z_][A-Za-z0-9_]*))/g;
            let m;
            while (m = re.exec(raw)) {
              if (m[1]) continue;
              refs.push({ name: m[2] || m[3], start: valueStart + m.index, end: valueStart + m.index + m[0].length });
            }
          }
          const entry = { key, value, raw, line, endLine, keyStart, keyEnd, valueStart, valueEnd, quote, exported, refs };
          if (key && KEY_RE.test(key)) {
            if (seen.has(key)) {
              const first = seen.get(key);
              let delEnd = next <= n ? next : n;
              add({ code: "duplicate", message: `${key} is set again here (first on line ${first.line + 1}). The ${"dotenv"} package keeps the first value; shells and Docker Compose keep the last.`, severity: "warning", start: keyStart, end: keyEnd, line, fix: { title: `Remove this second ${key} line`, start: lineStart, end: delEnd, text: "" }, first: first.line });
            } else seen.set(key, entry);
            entries.push(entry);
          }
          i = next;
          line = endLine + 1;
        }
        const defined = new Set(entries.map((e) => e.key));
        const SHELL = /* @__PURE__ */ new Set(["HOME", "PATH", "USER", "PWD", "SHELL", "HOSTNAME", "TMPDIR", "LANG", "TERM"]);
        for (const e of entries) for (const r of e.refs) if (!defined.has(r.name) && !SHELL.has(r.name)) add({ code: "undefined-ref", message: `${r.name} is used in the value of ${e.key} but no line of this file sets it.`, severity: "info", start: r.start, end: r.end, line: e.line });
        return { entries, problems, comments };
      }
      function formatEdits(text) {
        return parse(text).problems.filter((p2) => p2.fix && (p2.code === "space-around-equals" || p2.code === "trailing-space")).map((p2) => p2.fix);
      }
      function applyFixes(text, fixes) {
        let out = text;
        for (const f of [...fixes].sort((a, b) => b.start - a.start)) out = out.slice(0, f.start) + f.text + out.slice(f.end);
        return out;
      }
      var format = (text) => applyFixes(text, formatEdits(text));
      module.exports = { parse, format, formatEdits, applyFixes, isSecretKey, KEY_RE, SECRET_RE };
    }
  });

  // ../../../toolchk4-work/tc4-w2ghf2r9/entry.js
  var p = require_parse();
  self.ZovoEngine = { parse: p.parse, format: p.format, formatEdits: p.formatEdits, applyFixes: p.applyFixes, isSecretKey: p.isSecretKey };
})();
