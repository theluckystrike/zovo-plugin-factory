(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // ../../../../toolchk5-work/sfb.L3Tn/p/src/options.js
  var require_options = __commonJS({
    "../../../../toolchk5-work/sfb.L3Tn/p/src/options.js"(exports, module) {
      "use strict";
      var VARIANT = { bash: 1, posix: 2, mksh: 4, bats: 8, zsh: 16 };
      var has = (o2, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o2, k);
      var DIALECTS = Object.keys(VARIANT);
      var SHEBANG = {
        sh: "posix",
        dash: "posix",
        ash: "posix",
        posh: "posix",
        yash: "posix",
        busybox: "posix",
        bash: "bash",
        mksh: "mksh",
        ksh: "mksh",
        ksh93: "mksh",
        pdksh: "mksh",
        lksh: "mksh",
        oksh: "mksh",
        dtksh: "mksh",
        zsh: "zsh",
        bats: "bats"
      };
      var NOT_SH = /* @__PURE__ */ new Set(["fish", "csh", "tcsh", "jcsh", "itcsh"]);
      var EXT = [
        [/\.bats$/i, "bats"],
        [/\.(zsh|zshrc|zprofile|zlogin|zlogout|zshenv|zsh-theme)$/i, "zsh"],
        [/^(zshrc|zshenv|zlogin|zprofile|zlogout|zshrc_Apple_Terminal)$/, "zsh"],
        [/\.(mksh|ksh)$/i, "mksh"],
        [/\.(bash|bashrc|bash_aliases|bash_profile|bash_login|bash_logout|ebuild|eclass)$/i, "bash"],
        [/^(PKGBUILD|\.envrc|bashrc_Apple_Terminal)$/, "bash"],
        [/^APKBUILD$/, "posix"]
      ];
      var NOT_SH_EXT = /\.(fish|csh|cshrc|tcshrc|login\.csh)$/i;
      function baseName(p) {
        const s = String(p || "").replace(/\\/g, "/");
        return s.slice(s.lastIndexOf("/") + 1);
      }
      function shebangInterpreter(firstLine) {
        const m = /^#!\s*(\S+)(.*)$/.exec(String(firstLine || "").replace(/\r$/, ""));
        if (!m) return "";
        let prog = baseName(m[1]);
        if (prog === "env") {
          const rest = m[2].trim().split(/\s+/).filter(Boolean);
          let i = 0;
          while (i < rest.length && (rest[i].startsWith("-") || /^\w+=/.test(rest[i]))) {
            if (rest[i] === "-S" || rest[i] === "--split-string") {
              i++;
              continue;
            }
            if (/^-S./.test(rest[i])) {
              rest[i] = rest[i].slice(2);
              break;
            }
            if (rest[i] === "-u" || rest[i] === "-C" || rest[i] === "-P") {
              i += 2;
              continue;
            }
            i++;
          }
          prog = rest[i] ? baseName(rest[i]) : "";
        }
        if (has(SHEBANG, prog)) return prog;
        return prog.replace(/[0-9.]+$/, "") || prog;
      }
      function detectDialect(fileName, firstLine, setting) {
        const name = baseName(fileName);
        const interp = shebangInterpreter(firstLine);
        if (interp && NOT_SH.has(interp)) return { skip: `${interp} is not a POSIX-style shell, so shfmt cannot format it.` };
        if (!interp && NOT_SH_EXT.test(name)) return { skip: `${name} is a fish or csh file, so shfmt cannot format it.` };
        if (setting && setting !== "auto" && has(VARIANT, setting)) return { dialect: setting, from: "setting" };
        if (interp) {
          if (has(SHEBANG, interp)) return { dialect: SHEBANG[interp], from: "shebang" };
          const ksh = /^(ksh|mksh)/.test(interp) ? "mksh" : "";
          if (ksh) return { dialect: ksh, from: "shebang" };
          return { skip: `The first line runs ${interp}, not a shell.` };
        }
        for (const [re, d] of EXT) if (re.test(name)) return { dialect: d, from: "name" };
        return { dialect: "bash", from: "default" };
      }
      function parseEditorConfig(text) {
        const out = { root: false, sections: [] };
        let cur = null;
        for (const raw of String(text || "").split(/\r?\n/)) {
          const line = raw.trim();
          if (!line || line[0] === "#" || line[0] === ";") continue;
          const sec = /^\[(.*)\]$/.exec(line);
          if (sec) {
            cur = { glob: sec[1], props: {} };
            out.sections.push(cur);
            continue;
          }
          const kv = /^([^=:]+?)\s*[=:]\s*(.*)$/.exec(line);
          if (!kv) continue;
          const key = kv[1].trim().toLowerCase();
          let val = kv[2].replace(/\s+[#;].*$/, "").trim();
          val = val.toLowerCase();
          if (!cur) {
            if (key === "root") out.root = val === "true";
            continue;
          }
          cur.props[key] = val;
        }
        return out;
      }
      function escapeRe(s) {
        return s.replace(/[.+^$()|\\/]/g, "\\$&");
      }
      function globSource(glob) {
        let re = "";
        let i = 0;
        let depth = 0;
        while (i < glob.length) {
          const c = glob[i];
          if (c === "\\" && i + 1 < glob.length) {
            re += escapeRe(glob[i + 1]);
            i += 2;
            continue;
          }
          if (c === "*") {
            if (glob[i + 1] === "*") {
              if (glob[i + 2] === "/") {
                re += "(?:.*/)?";
                i += 3;
              } else {
                re += ".*";
                i += 2;
              }
            } else {
              re += "[^/]*";
              i++;
            }
            continue;
          }
          if (c === "?") {
            re += "[^/]";
            i++;
            continue;
          }
          if (c === "[") {
            const j = glob.indexOf("]", i + 1);
            if (j > i + 1) {
              let body = glob.slice(i + 1, j);
              const neg = body[0] === "!" || body[0] === "^";
              if (neg) body = body.slice(1);
              re += "[" + (neg ? "^" : "") + body.replace(/\\/g, "\\\\").replace(/\]/g, "\\]") + "]";
              i = j + 1;
              continue;
            }
            re += "\\[";
            i++;
            continue;
          }
          if (c === "{") {
            const j = glob.indexOf("}", i + 1);
            const inner = j > i ? glob.slice(i + 1, j) : "";
            const range = /^(-?\d+)\.\.(-?\d+)$/.exec(inner);
            if (range) {
              const a = +range[1], b = +range[2];
              const lo = Math.min(a, b), hi = Math.max(a, b);
              const nums = [];
              for (let n = lo; n <= hi && nums.length < 1e3; n++) nums.push(String(n));
              re += "(?:" + nums.join("|") + ")";
              i = j + 1;
              continue;
            }
            if (j > i && inner.includes(",")) {
              re += "(?:";
              depth++;
              i++;
              continue;
            }
            re += "\\{";
            i++;
            continue;
          }
          if (c === "," && depth > 0) {
            re += "|";
            i++;
            continue;
          }
          if (c === "}" && depth > 0) {
            re += ")";
            depth--;
            i++;
            continue;
          }
          re += escapeRe(c);
          i++;
        }
        while (depth-- > 0) re += ")";
        return re;
      }
      function globMatches(glob, rel) {
        let g = glob;
        if (g.startsWith("/")) g = g.slice(1);
        else if (!g.includes("/")) g = "**/" + g;
        try {
          return new RegExp("^" + globSource(g) + "$").test(rel);
        } catch {
          return false;
        }
      }
      function editorConfigProps(files, filePath, dialect) {
        const chain = [];
        for (const f of files) {
          const parsed = parseEditorConfig(f.text);
          chain.push({ dir: f.dir.replace(/\\/g, "/").replace(/\/+$/, ""), parsed });
          if (parsed.root) break;
        }
        const props = {};
        const file = filePath.replace(/\\/g, "/");
        for (const { dir, parsed } of chain.reverse()) {
          const rel = file.startsWith(dir + "/") ? file.slice(dir.length + 1) : baseName(file);
          for (const s of parsed.sections) {
            const lang = /^\[(\w+)\]$/.exec(s.glob);
            let hit;
            if (lang) hit = lang[1].toLowerCase() === "shell" || lang[1].toLowerCase() === dialect;
            else hit = globMatches(s.glob, rel);
            if (hit) Object.assign(props, s.props);
          }
        }
        return props;
      }
      var bool = (v) => v === "true" ? true : v === "false" ? false : void 0;
      function resolveOptions({ fileName, firstLine, settings = {}, editor = {}, ec = {} }) {
        const s = settings;
        const useEc = s.useEditorConfig !== false;
        const e = useEc ? ec : {};
        if (useEc && bool(e.ignore) === true) return { skip: "The .editorconfig file marks this file with ignore = true." };
        let dialectSetting = s.dialect || "auto";
        if (e.shell_variant && (has(VARIANT, e.shell_variant) || e.shell_variant === "auto")) dialectSetting = e.shell_variant;
        const d = detectDialect(fileName, firstLine, dialectSetting);
        if (d.skip) return { skip: d.skip };
        let indent;
        let indentFrom;
        if (e.indent_style === "tab") {
          indent = 0;
          indentFrom = ".editorconfig";
        } else if (e.indent_style === "space") {
          const n = parseInt(e.indent_size, 10);
          indent = n > 0 ? n : parseInt(e.tab_width, 10) > 0 ? parseInt(e.tab_width, 10) : editor.tabSize > 0 ? editor.tabSize : 2;
          indentFrom = ".editorconfig";
        } else if (typeof s.indent === "number" && s.indent >= 0) {
          indent = Math.min(16, Math.floor(s.indent));
          indentFrom = "setting";
        } else if (editor.insertSpaces) {
          indent = editor.tabSize > 0 ? Math.min(16, editor.tabSize) : 2;
          indentFrom = "editor";
        } else {
          indent = 0;
          indentFrom = "editor";
        }
        const pick = (ecKey, sKey) => {
          const b = bool(e[ecKey]);
          if (b !== void 0) return b;
          return !!s[sKey];
        };
        const minify = pick("minify", "minify");
        const opts = {
          variant: VARIANT[d.dialect],
          indent,
          useTabs: indent === 0,
          tabWidth: indent || 8,
          binaryNextLine: pick("binary_next_line", "binaryNextLine"),
          switchCaseIndent: pick("switch_case_indent", "switchCaseIndent"),
          spaceRedirects: pick("space_redirects", "spaceRedirects"),
          keepPadding: pick("keep_padding", "keepPadding"),
          functionNextLine: pick("function_next_line", "functionNextLine"),
          simplify: minify || pick("simplify", "simplify"),
          minify
        };
        return { dialect: d.dialect, dialectFrom: d.from, opts, indentFrom };
      }
      function shfmtFlags(dialect, opts) {
        const f = ["-ln=" + dialect, "-i=" + opts.indent];
        if (opts.binaryNextLine) f.push("-bn");
        if (opts.switchCaseIndent) f.push("-ci");
        if (opts.spaceRedirects) f.push("-sr");
        if (opts.keepPadding) f.push("-kp");
        if (opts.functionNextLine) f.push("-fn");
        if (opts.minify) f.push("-mn");
        else if (opts.simplify) f.push("-s");
        return f;
      }
      module.exports = {
        VARIANT,
        DIALECTS,
        baseName,
        shebangInterpreter,
        detectDialect,
        parseEditorConfig,
        globSource,
        globMatches,
        editorConfigProps,
        resolveOptions,
        shfmtFlags
      };
    }
  });

  // ../../../../toolchk5-work/sfb.L3Tn/entry.js
  var o = require_options();
  function featureDialect(message) {
    const m = /(?:is|are) an? ([a-z/]+) feature/.exec(message || "");
    if (!m) return "";
    const first = m[1].split("/")[0];
    return ["bash", "mksh", "zsh"].includes(first) ? first : "";
  }
  self.ZovoEngine = {
    VARIANT: o.VARIANT,
    DIALECTS: o.DIALECTS,
    detectDialect: o.detectDialect,
    resolveOptions: o.resolveOptions,
    shfmtFlags: o.shfmtFlags,
    featureDialect
  };
})();
