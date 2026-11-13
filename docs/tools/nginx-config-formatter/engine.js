/* Zovo Nginx Config Formatter & Lint 0.1.0 core, for the browser tool page (built by sprint/tools/bundle_tc4.py
   from nginx-config-vscode commit ec5863af65ef). MIT license, github.com/theluckystrike/nginx-config-vscode. No network code. */
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // ../tc4/empty.js
  var require_empty = __commonJS({
    "../tc4/empty.js"(exports, module) {
      "use strict";
      module.exports = {};
    }
  });

  // ../../../../toolchk4-work/tc4-e6853qxw/p/src/parser.js
  var require_parser = __commonJS({
    "../../../../toolchk4-work/tc4-e6853qxw/p/src/parser.js"(exports, module) {
      "use strict";
      var MAX_BYTES = 16 << 20;
      var MAX_TOKENS = 2e6;
      var MAX_DEPTH = 64;
      function isSpace(c) {
        return c === " " || c === "	" || c === "\r" || c === "\n" || c === "\f" || c === "\v";
      }
      function tokenize(text, errors = []) {
        const s = String(text).slice(0, MAX_BYTES);
        const toks = [];
        let i = 0, line = 0, col = 0;
        const n = s.length;
        const adv = (ch) => {
          if (ch === "\n") {
            line++;
            col = 0;
          } else col++;
        };
        while (i < n && toks.length < MAX_TOKENS) {
          const c = s[i];
          if (c === "\n") {
            toks.push({ t: "nl", line, col });
            i++;
            adv(c);
            continue;
          }
          if (isSpace(c)) {
            i++;
            adv(c);
            continue;
          }
          const sl = line, sc = col;
          if (c === "#") {
            let j2 = i;
            while (j2 < n && s[j2] !== "\n") j2++;
            toks.push({ t: "comment", text: s.slice(i, j2).replace(/\r$/, ""), line: sl, col: sc });
            col += j2 - i;
            i = j2;
            continue;
          }
          if (c === ";" || c === "{" || c === "}") {
            toks.push({ t: c, line: sl, col: sc });
            i++;
            col++;
            continue;
          }
          if (c === '"' || c === "'") {
            let j2 = i + 1, l = line, cc = col + 1, closed = false;
            while (j2 < n) {
              const d = s[j2];
              if (d === "\\" && j2 + 1 < n) {
                if (s[j2 + 1] === "\n") {
                  l++;
                  cc = 0;
                } else cc += 2;
                j2 += 2;
                continue;
              }
              if (d === c) {
                closed = true;
                j2++;
                cc++;
                break;
              }
              if (d === "\n") {
                l++;
                cc = 0;
              } else cc++;
              j2++;
            }
            const raw2 = s.slice(i, j2);
            if (!closed) errors.push({ line: sl, col: sc, endLine: sl, endCol: sc + 1, message: "This string is not closed; nginx reads the rest of the file as part of it.", code: "unterminated-string" });
            toks.push({ t: "word", raw: raw2, quoted: c, value: unquote(raw2), line: sl, col: sc, endLine: l, endCol: cc });
            i = j2;
            line = l;
            col = cc;
            continue;
          }
          let j = i;
          while (j < n) {
            const d = s[j];
            if (isSpace(d) || d === ";" || d === "{" || d === "}") break;
            if (d === "\\" && j + 1 < n) {
              j += 2;
              continue;
            }
            if (d === "$" && s[j + 1] === "{") {
              const k = s.indexOf("}", j + 2);
              if (k > 0 && k - j < 256 && !/[\s;]/.test(s.slice(j + 2, k))) {
                j = k + 1;
                continue;
              }
            }
            if ((d === '"' || d === "'") && j > i) break;
            if (d === "#" && j > i && isSpace(s[j - 1])) break;
            j++;
          }
          const raw = s.slice(i, j);
          toks.push({ t: "word", raw, value: raw, line: sl, col: sc, endLine: sl, endCol: sc + raw.length });
          col += j - i;
          i = j;
        }
        return toks;
      }
      function unquote(raw) {
        const q = raw[0];
        let body = raw.slice(1, raw.endsWith(q) && raw.length > 1 ? -1 : void 0);
        return body.replace(/\\(.)/g, "$1");
      }
      var LUA_BLOCK = /_by_lua_block$|^lua_block$|^(init|init_worker|exit_worker)_by_lua_block$/;
      function luaBlockEnd(s, from) {
        let depth = 1, i = from;
        const n = s.length;
        while (i < n) {
          const c = s[i];
          if (c === "-" && s[i + 1] === "-") {
            const m = /^--\[(=*)\[/.exec(s.slice(i, i + 64));
            if (m) {
              const close = `]${m[1]}]`;
              const k = s.indexOf(close, i + m[0].length);
              if (k < 0) return -1;
              i = k + close.length;
              continue;
            }
            while (i < n && s[i] !== "\n") i++;
            continue;
          }
          if (c === '"' || c === "'") {
            i++;
            while (i < n && s[i] !== c) {
              if (s[i] === "\\") i++;
              if (s[i] === "\n") break;
              i++;
            }
            i++;
            continue;
          }
          if (c === "[") {
            const m = /^\[(=*)\[/.exec(s.slice(i, i + 64));
            if (m) {
              const close = `]${m[1]}]`;
              const k = s.indexOf(close, i + m[0].length);
              if (k < 0) return -1;
              i = k + close.length;
              continue;
            }
          }
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) return i;
          }
          i++;
        }
        return -1;
      }
      function offsetOf(text, line, col) {
        let off = 0, l = 0;
        while (l < line) {
          const k = text.indexOf("\n", off);
          if (k < 0) return text.length;
          off = k + 1;
          l++;
        }
        return off + col;
      }
      function posOf(text, off) {
        let line = 0, last = 0;
        for (let i = text.indexOf("\n"); i >= 0 && i < off; i = text.indexOf("\n", i + 1)) {
          line++;
          last = i + 1;
        }
        return { line, col: off - last };
      }
      function parse(text) {
        const src = String(text).slice(0, MAX_BYTES);
        const errors = [];
        const toks = tokenize(src, errors);
        let p = 0;
        const root = [];
        const stack = [{ list: root, opener: null }];
        let pendingNl = 0;
        let lastEnd = -1;
        let skipRawUntil = null;
        while (p < toks.length) {
          const tk = toks[p];
          if (skipRawUntil) {
            if (tk.line < skipRawUntil.line || tk.line === skipRawUntil.line && tk.col < skipRawUntil.col) {
              p++;
              continue;
            }
            skipRawUntil = null;
          }
          const cur = stack[stack.length - 1].list;
          if (tk.t === "nl") {
            pendingNl++;
            p++;
            continue;
          }
          if (pendingNl >= 2 && cur.length) cur.push({ type: "blank", line: tk.line - 1 });
          pendingNl = 0;
          if (tk.t === "comment") {
            const top = stack[stack.length - 1];
            if (top.opener && top.opener.openLine === tk.line && !top.opener.openComment && !top.opener.block.length) {
              top.opener.openComment = tk;
              p++;
              continue;
            }
            const prev = cur[cur.length - 1];
            if (prev && prev.type === "directive" && lastEnd === tk.line && !prev.comment && !prev.block) prev.comment = tk;
            else if (prev && prev.type === "directive" && prev.block && prev.closeLine === tk.line && !prev.closeComment) prev.closeComment = tk;
            else cur.push({ type: "comment", text: tk.text, line: tk.line, col: tk.col });
            p++;
            continue;
          }
          if (tk.t === "}") {
            if (stack.length === 1) {
              errors.push({ line: tk.line, col: tk.col, endLine: tk.line, endCol: tk.col + 1, message: 'Unexpected "}": no block is open here.', code: "unexpected-brace" });
              p++;
              continue;
            }
            const fr = stack.pop();
            fr.opener.end = { line: tk.line, col: tk.col + 1 };
            fr.opener.closeLine = tk.line;
            lastEnd = tk.line;
            p++;
            continue;
          }
          if (tk.t === ";" || tk.t === "{") {
            errors.push({ line: tk.line, col: tk.col, endLine: tk.line, endCol: tk.col + 1, message: `Unexpected "${tk.t}" with no directive name before it.`, code: "unexpected-token" });
            p++;
            continue;
          }
          const name = tk;
          const args = [];
          let q = p + 1;
          let term = null;
          const comments = [];
          while (q < toks.length) {
            const a = toks[q];
            if (a.t === "word") {
              args.push(a);
              q++;
              continue;
            }
            if (a.t === "nl") {
              q++;
              continue;
            }
            if (a.t === "comment") {
              comments.push(a);
              q++;
              continue;
            }
            term = a;
            break;
          }
          const node = { type: "directive", name: name.value, nameTok: name, args, line: name.line, col: name.col, block: null, raw: null, comment: null, argComments: comments };
          for (const c of comments) cur.push({ type: "comment", text: c.text, line: c.line, col: c.col, inside: true });
          if (!term || term.t === "}") {
            const last = args.length ? args[args.length - 1] : name;
            errors.push({ line: last.line, col: last.endCol !== void 0 ? last.endCol : last.col, endLine: last.line, endCol: (last.endCol !== void 0 ? last.endCol : last.col) + 1, message: `Missing ";" after "${name.value}${args.length ? " " + args.map((a) => a.raw).join(" ").slice(0, 60) : ""}".`, code: "missing-semicolon", fix: { line: last.endLine !== void 0 ? last.endLine : last.line, col: last.endCol !== void 0 ? last.endCol : last.col + String(last.raw || last.value).length } });
            node.end = { line: last.line, col: last.endCol || last.col };
            node.missingSemicolon = true;
            cur.push(node);
            lastEnd = last.line;
            p = q;
            continue;
          }
          if (term.t === ";") {
            node.end = { line: term.line, col: term.col + 1 };
            cur.push(node);
            lastEnd = term.line;
            p = q + 1;
            continue;
          }
          node.openLine = term.line;
          node.block = [];
          cur.push(node);
          if (LUA_BLOCK.test(node.name)) {
            const start = offsetOf(src, term.line, term.col) + 1;
            const endOff = luaBlockEnd(src, start);
            if (endOff < 0) {
              errors.push({ line: term.line, col: term.col, endLine: term.line, endCol: term.col + 1, message: `The Lua block of "${node.name}" is not closed.`, code: "unclosed-block" });
              node.raw = { text: src.slice(start), start: posOf(src, start) };
              node.end = posOf(src, src.length);
              break;
            }
            node.raw = { text: src.slice(start, endOff), start: posOf(src, start) };
            const e = posOf(src, endOff);
            node.end = { line: e.line, col: e.col + 1 };
            node.closeLine = e.line;
            lastEnd = e.line;
            skipRawUntil = { line: e.line, col: e.col + 1 };
            p = q + 1;
            continue;
          }
          if (stack.length > MAX_DEPTH) {
            errors.push({ line: term.line, col: term.col, endLine: term.line, endCol: term.col + 1, message: `Blocks are nested more than ${MAX_DEPTH} levels deep.`, code: "too-deep" });
            break;
          }
          stack.push({ list: node.block, opener: node });
          lastEnd = term.line;
          p = q + 1;
        }
        while (stack.length > 1) {
          const fr = stack.pop();
          errors.push({ line: fr.opener.line, col: fr.opener.col, endLine: fr.opener.line, endCol: fr.opener.col + fr.opener.name.length, message: `The "${fr.opener.name}" block is not closed: a "}" is missing.`, code: "unclosed-block" });
          fr.opener.unclosed = true;
        }
        if (toks.length >= MAX_TOKENS) errors.push({ line: 0, col: 0, endLine: 0, endCol: 1, message: "This file is too large to check completely.", code: "too-large" });
        return { nodes: root, errors, tokens: toks };
      }
      function walk(nodes, fn, parents = []) {
        for (const n of nodes) {
          if (n.type !== "directive") continue;
          if (fn(n, parents) === false) continue;
          if (n.block && !n.raw) walk(n.block, fn, [...parents, n]);
        }
      }
      function contextOf(parents) {
        if (!parents.length) return "main";
        const p = parents[parents.length - 1];
        if (p.name === "if") {
          const outer = parents[parents.length - 2];
          return outer && outer.name === "server" ? "sif" : "lif";
        }
        if (p.name === "server") {
          const outer = parents[parents.length - 2];
          if (outer && outer.name === "stream") return "stream_server";
          if (outer && outer.name === "mail") return "mail_server";
          if (outer && outer.name === "upstream") return "upstream_server";
          return "server";
        }
        if (p.name === "upstream") {
          const outer = parents[parents.length - 2];
          return outer && outer.name === "stream" ? "stream_upstream" : "upstream";
        }
        return p.name;
      }
      function signature(text) {
        const { nodes, errors } = parse(text);
        const out = [];
        const rec = (list) => {
          for (const n of list) {
            if (n.type !== "directive") continue;
            out.push(n.nameTok.raw, ...n.args.map((a) => a.raw));
            if (n.raw) out.push("{", n.raw.text.replace(/\s+/g, " ").trim(), "}");
            else if (n.block) {
              out.push("{");
              rec(n.block);
              out.push("}");
            } else out.push(";");
          }
        };
        rec(nodes);
        const comments = tokenize(String(text).slice(0, MAX_BYTES)).filter((t) => t.t === "comment").map((t) => t.text.replace(/\s+$/, ""));
        const luaComments = [];
        const recRaw = (list) => {
          for (const n of list) {
            if (n.type !== "directive") continue;
            if (n.raw) luaComments.push(n);
            else if (n.block) recRaw(n.block);
          }
        };
        recRaw(nodes);
        return { sig: out, comments: luaComments.length ? null : comments, errors };
      }
      module.exports = { tokenize, parse, walk, contextOf, signature, unquote, luaBlockEnd, MAX_BYTES, LUA_BLOCK };
    }
  });

  // ../../../../toolchk4-work/tc4-e6853qxw/p/src/format.js
  var require_format = __commonJS({
    "../../../../toolchk4-work/tc4-e6853qxw/p/src/format.js"(exports, module) {
      "use strict";
      var { parse, signature } = require_parser();
      var DEFAULTS = { indent: "    ", maxBlankLines: 1, alignValues: false, eol: "\n" };
      function fmtArgs(node, ind) {
        let out = "";
        let prevLine = node.nameTok.line;
        for (const a of node.args) {
          if (a.line > prevLine) out += "\n" + ind;
          else if (a.raw === ")" && node.name === "if") {
          } else out += " ";
          out += a.raw;
          prevLine = a.endLine !== void 0 ? a.endLine : a.line;
        }
        return out;
      }
      function shiftRaw(text, from, to) {
        const lines = text.split("\n");
        const first = lines.shift();
        const delta = to.length - from.length;
        const body = lines.map((l, i) => {
          if (i === lines.length - 1 && !l.trim()) return to;
          if (!l.trim()) return "";
          if (delta >= 0) return " ".repeat(delta) + l;
          const lead = /^[ \t]*/.exec(l)[0].length;
          return l.slice(Math.min(lead, -delta));
        });
        return [first, ...body].join("\n");
      }
      function format(text, opts = {}) {
        const o = { ...DEFAULTS, ...opts };
        const src = String(text);
        const eol = /\r\n/.test(src) ? "\r\n" : o.eol;
        const parsed = parse(src);
        const hard = parsed.errors.filter((e) => /unclosed-block|unexpected-brace|unterminated-string|too-large|too-deep|unexpected-token/.test(e.code));
        if (hard.length) return { text: null, reason: `not formatted: line ${hard[0].line + 1}: ${hard[0].message}` };
        const lines = [];
        const srcLines = src.split(/\r?\n/);
        const indentOf = (line) => /^[ \t]*/.exec(srcLines[line] || "")[0];
        function emit(list, depth) {
          const ind = o.indent.repeat(depth);
          let blanks = 0;
          for (const n of list) {
            if (n.type === "blank") {
              blanks++;
              continue;
            }
            if (blanks && lines.length && lines[lines.length - 1] !== "" && o.maxBlankLines > 0) for (let k = 0; k < Math.min(blanks, o.maxBlankLines); k++) lines.push("");
            blanks = 0;
            if (n.type === "comment") {
              lines.push(ind + n.text.trimEnd());
              continue;
            }
            const head = ind + n.nameTok.raw + fmtArgs(n, ind + o.indent);
            if (!n.block) {
              lines.push(head + (n.missingSemicolon ? "" : ";") + (n.comment ? " " + n.comment.text.trimEnd() : ""));
              continue;
            }
            if (n.raw) {
              const body = shiftRaw(n.raw.text, indentOf(n.line), ind);
              lines.push(head + " {" + body + "}" + (n.closeComment ? " " + n.closeComment.text.trimEnd() : ""));
              continue;
            }
            lines.push(head + " {" + (n.openComment ? " " + n.openComment.text.trimEnd() : ""));
            emit(n.block, depth + 1);
            while (lines.length && lines[lines.length - 1] === "") lines.pop();
            lines.push(ind + "}" + (n.closeComment ? " " + n.closeComment.text.trimEnd() : ""));
          }
        }
        emit(parsed.nodes, 0);
        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        const out = lines.join("\n").split("\n").map((l) => l.replace(/[ \t]+$/, "")).join(eol) + (lines.length ? eol : "");
        const a = signature(src), b = signature(out);
        if (JSON.stringify(a.sig) !== JSON.stringify(b.sig) || a.comments && b.comments && JSON.stringify(a.comments) !== JSON.stringify(b.comments)) {
          return { text: null, reason: "not formatted: the result would not read the same as the file (this is a formatter bug; the file was left unchanged)", debug: o.debug ? { attempted: out, a, b } : void 0 };
        }
        return { text: out, changed: out !== src };
      }
      function indentFrom(options) {
        if (!options) return DEFAULTS.indent;
        return options.insertSpaces === false ? "	" : " ".repeat(Math.max(1, Math.min(8, Number(options.tabSize) || 4)));
      }
      module.exports = { format, indentFrom, shiftRaw, DEFAULTS };
    }
  });

  // ../../../../toolchk4-work/tc4-e6853qxw/p/src/directives.js
  var require_directives = __commonJS({
    "../../../../toolchk4-work/tc4-e6853qxw/p/src/directives.js"(exports, module) {
      "use strict";
      var H = "http server location";
      var HL = "http server location lif";
      var D = {
        // ---------- core (main, events) ----------
        user: ["main", "user user [group];", "nobody nobody", "The user and group the worker processes run as.", "core"],
        worker_processes: ["main", "worker_processes number | auto;", "1", "How many worker processes to start; auto uses one per CPU core.", "core"],
        worker_rlimit_nofile: ["main", "worker_rlimit_nofile number;", "", "Raises the limit of open files for each worker process.", "core"],
        worker_cpu_affinity: ["main", "worker_cpu_affinity cpumask ... | auto [cpumask];", "", "Binds worker processes to CPU cores.", "core"],
        worker_priority: ["main", "worker_priority number;", "0", "Scheduling priority (nice value) of worker processes.", "core"],
        worker_shutdown_timeout: ["main", "worker_shutdown_timeout time;", "", "How long a worker may take to finish its connections at a graceful shutdown.", "core"],
        pid: ["main", "pid file;", "logs/nginx.pid", "File where the master process writes its process id.", "core"],
        error_log: ["main http server location stream stream_server mail mail_server", "error_log file [level];", "logs/error.log error", "Where errors are logged and from which level up (debug, info, notice, warn, error, crit, alert, emerg).", "core"],
        daemon: ["main", "daemon on | off;", "on", "Run nginx in the background. Turn off in containers.", "core"],
        master_process: ["main", "master_process on | off;", "on", "Run a master process with workers. Only for development.", "core"],
        include: ["main events http server location lif sif upstream stream stream_server stream_upstream mail mail_server map types limit_except geo split_clients", "include file | mask;", "", "Reads another file (or every file a pattern matches) in place.", "core"],
        load_module: ["main", "load_module file;", "", "Loads a dynamic module.", "core"],
        env: ["main", "env variable[=value];", "env TZ;", "Keeps or sets an environment variable for the workers.", "core"],
        pcre_jit: ["main", "pcre_jit on | off;", "off", "Compiles regular expressions with JIT when PCRE supports it.", "core"],
        thread_pool: ["main", "thread_pool name threads=number [max_queue=number];", "default threads=32 max_queue=65536", "Defines a thread pool for blocking file operations.", "core"],
        timer_resolution: ["main", "timer_resolution interval;", "", "Reduces timer calls in workers.", "core"],
        working_directory: ["main", "working_directory directory;", "", "Working directory of the workers (where core files go).", "core"],
        lock_file: ["main", "lock_file file;", "logs/nginx.lock", "Prefix of the lock file name.", "core"],
        ssl_engine: ["main", "ssl_engine device;", "", "Hardware SSL engine.", "core"],
        events: ["main", "events { ... }", "", "Block for connection processing settings.", "core"],
        worker_connections: ["events", "worker_connections number;", "512", "Most connections each worker may have open at once (clients and upstreams together).", "core"],
        use: ["events", "use method;", "", "Connection processing method (epoll, kqueue, ...). nginx picks the best one by itself.", "core"],
        multi_accept: ["events", "multi_accept on | off;", "off", "Accept all new connections at once instead of one at a time.", "core"],
        accept_mutex: ["events", "accept_mutex on | off;", "off", "Workers take turns accepting new connections.", "core"],
        accept_mutex_delay: ["events", "accept_mutex_delay time;", "500ms", "How long a worker waits before trying to accept again when accept_mutex is on.", "core"],
        debug_connection: ["events", "debug_connection address | CIDR | unix:;", "", "Debug logging for chosen client addresses.", "core"],
        worker_aio_requests: ["events", "worker_aio_requests number;", "32", "Most outstanding asynchronous I/O operations per worker.", "core"],
        // ---------- http core ----------
        http: ["main", "http { ... }", "", "Block for the HTTP server settings.", "http_core"],
        server: ["http upstream stream stream_upstream mail", "server { ... } (http, stream, mail) | server address [parameters]; (upstream)", "", "In http, stream or mail: a virtual server. In upstream: one backend server address with options.", "http_core"],
        location: ["server location", "location [ = | ~ | ~* | ^~ ] uri { ... } | location @name { ... }", "", "Settings for requests whose URI matches. = exact, ^~ prefix that stops the regex search, ~ and ~* regex (case-sensitive and not), @name for internal jumps.", "http_core"],
        listen: ["server stream_server mail_server", "listen address[:port] [default_server] [ssl] [http2] [quic] [proxy_protocol] [reuseport] ...;", "*:80", "Address and port the server answers on, with options such as default_server and ssl.", "http_core"],
        server_name: ["server mail", "server_name name ...;", '""', "Host names this server answers for: exact, *.wildcard, wildcard.* or ~regex.", "http_core"],
        root: [HL, "root path;", "html", "Folder that request URIs are added to, to find files.", "http_core"],
        alias: ["location", "alias path;", "", "Replaces the matched location part of the URI with this path. Keep the trailing slash of location and alias the same.", "http_core"],
        index: [H, "index file ...;", "index.html", "Files to try when a request ends with a slash.", "http_index"],
        try_files: ["server location", "try_files file ... uri | =code;", "", "Tries files in order and serves the first that exists, else does an internal redirect to the last value.", "http_core"],
        error_page: [HL, "error_page code ... [=[response]] uri;", "", "URI to show for the given error codes.", "http_core"],
        internal: ["location", "internal;", "", "The location answers only internal requests (error_page, try_files, X-Accel-Redirect).", "http_core"],
        client_max_body_size: [H, "client_max_body_size size;", "1m", "Largest request body allowed; bigger requests get 413. 0 turns the check off.", "http_core"],
        client_body_buffer_size: [H, "client_body_buffer_size size;", "8k|16k", "Memory buffer for request bodies before they are written to a temporary file.", "http_core"],
        client_body_timeout: [H, "client_body_timeout time;", "60s", "Time allowed between two reads of the request body.", "http_core"],
        client_body_temp_path: [H, "client_body_temp_path path [level1 [level2 [level3]]];", "client_body_temp", "Folder for temporary files with request bodies.", "http_core"],
        client_body_in_file_only: [H, "client_body_in_file_only on | clean | off;", "off", "Always store the request body in a file.", "http_core"],
        client_header_buffer_size: ["http server", "client_header_buffer_size size;", "1k", "Buffer for request headers.", "http_core"],
        large_client_header_buffers: ["http server", "large_client_header_buffers number size;", "4 8k", "Buffers for large request headers and long URIs.", "http_core"],
        client_header_timeout: ["http server", "client_header_timeout time;", "60s", "Time allowed to receive the request headers.", "http_core"],
        keepalive_timeout: [H, "keepalive_timeout timeout [header_timeout];", "75s", "How long an idle keep-alive client connection stays open.", "http_core"],
        keepalive_requests: [H + " upstream", "keepalive_requests number;", "1000", "Most requests over one keep-alive connection.", "http_core"],
        keepalive_time: [H + " upstream", "keepalive_time time;", "1h", "Longest lifetime of a keep-alive connection.", "http_core"],
        send_timeout: [H, "send_timeout time;", "60s", "Time allowed between two writes to the client.", "http_core"],
        sendfile: [HL, "sendfile on | off;", "off", "Use the kernel sendfile() call to send files.", "http_core"],
        sendfile_max_chunk: [H, "sendfile_max_chunk size;", "2m", "Largest piece sent in one sendfile() call.", "http_core"],
        tcp_nopush: [H, "tcp_nopush on | off;", "off", "Send response headers and the start of a file in one packet (with sendfile).", "http_core"],
        tcp_nodelay: [H, "tcp_nodelay on | off;", "on", "Turn off Nagle buffering on keep-alive connections.", "http_core"],
        types_hash_max_size: [H, "types_hash_max_size size;", "1024", "Size of the MIME types hash table.", "http_core"],
        types_hash_bucket_size: [H, "types_hash_bucket_size size;", "64", "Bucket size of the MIME types hash table.", "http_core"],
        types: [H, "types { mime-type extension ...; }", "", "Maps file extensions to MIME types.", "http_core"],
        default_type: [H, "default_type mime-type;", "text/plain", "MIME type for files whose extension is not in types.", "http_core"],
        server_tokens: [H, "server_tokens on | off | build | string;", "on", "Show the nginx version in error pages and the Server header. off hides the version.", "http_core"],
        server_names_hash_bucket_size: ["http", "server_names_hash_bucket_size size;", "32|64|128", "Bucket size of the server names hash. Raise it for long server names.", "http_core"],
        server_names_hash_max_size: ["http", "server_names_hash_max_size size;", "512", "Size of the server names hash.", "http_core"],
        variables_hash_max_size: ["http", "variables_hash_max_size size;", "1024", "Size of the variables hash.", "http_core"],
        variables_hash_bucket_size: ["http", "variables_hash_bucket_size size;", "64", "Bucket size of the variables hash.", "http_core"],
        underscores_in_headers: ["http server", "underscores_in_headers on | off;", "off", "Accept request header names with underscores.", "http_core"],
        ignore_invalid_headers: ["http server", "ignore_invalid_headers on | off;", "on", "Drop request headers with invalid names.", "http_core"],
        merge_slashes: ["http server", "merge_slashes on | off;", "on", "Turn // in URIs into /.", "http_core"],
        absolute_redirect: [H, "absolute_redirect on | off;", "on", "Use absolute URLs (with scheme and host) in redirects nginx makes.", "http_core"],
        port_in_redirect: [H, "port_in_redirect on | off;", "on", "Add the port to absolute redirects.", "http_core"],
        server_name_in_redirect: [H, "server_name_in_redirect on | off;", "off", "Use the first server_name in redirects instead of the Host header.", "http_core"],
        resolver: [H + " upstream stream stream_server mail mail_server", "resolver address ... [valid=time] [ipv4=on|off] [ipv6=on|off];", "", "DNS servers used to resolve names at run time (for proxy_pass with variables, OCSP).", "http_core"],
        resolver_timeout: [H + " upstream stream stream_server mail mail_server", "resolver_timeout time;", "30s", "Timeout of a DNS lookup.", "http_core"],
        limit_rate: [HL, "limit_rate rate;", "0", "Limits the response speed per request (bytes per second).", "http_core"],
        limit_rate_after: [HL, "limit_rate_after size;", "0", "Sends this much at full speed before limit_rate starts.", "http_core"],
        limit_except: ["location", "limit_except method ... { ... }", "", "Access rules for all HTTP methods except the listed ones.", "http_core"],
        satisfy: [H, "satisfy all | any;", "all", "Whether all access checks must pass, or any one.", "http_core"],
        open_file_cache: [H, "open_file_cache off | max=N [inactive=time];", "off", "Caches open file handles and file facts.", "http_core"],
        open_file_cache_valid: [H, "open_file_cache_valid time;", "60s", "How often cached file facts are checked.", "http_core"],
        open_file_cache_min_uses: [H, "open_file_cache_min_uses number;", "1", "Uses needed to keep a file in the cache.", "http_core"],
        open_file_cache_errors: [H, "open_file_cache_errors on | off;", "off", "Cache file lookup errors too.", "http_core"],
        log_not_found: [H, "log_not_found on | off;", "on", 'Log "file not found" errors.', "http_core"],
        log_subrequest: [H, "log_subrequest on | off;", "off", "Log subrequests in the access log.", "http_core"],
        recursive_error_pages: [H, "recursive_error_pages on | off;", "off", "Allow error_page inside the handling of another error page.", "http_core"],
        reset_timedout_connection: [H, "reset_timedout_connection on | off;", "off", "Reset connections that timed out instead of closing them gently.", "http_core"],
        lingering_close: [H, "lingering_close off | on | always;", "on", "How nginx closes client connections that may still send data.", "http_core"],
        lingering_time: [H, "lingering_time time;", "30s", "Most time spent reading extra client data before closing.", "http_core"],
        lingering_timeout: [H, "lingering_timeout time;", "5s", "Wait for more client data while lingering.", "http_core"],
        output_buffers: [H, "output_buffers number size;", "2 32k", "Buffers for reading a response from disk.", "http_core"],
        postpone_output: [H, "postpone_output size;", "1460", "Hold back small writes until this much data is ready.", "http_core"],
        directio: [H, "directio size | off;", "off", "Use direct I/O for files at least this large.", "http_core"],
        aio: [H, "aio on | off | threads[=pool];", "off", "Asynchronous file I/O.", "http_core"],
        if_modified_since: [H, "if_modified_since off | exact | before;", "exact", "How If-Modified-Since is compared.", "http_core"],
        etag: [H, "etag on | off;", "on", "Add an ETag header to static responses.", "http_core"],
        chunked_transfer_encoding: [H, "chunked_transfer_encoding on | off;", "on", "Allow chunked responses.", "http_core"],
        msie_padding: [H, "msie_padding on | off;", "on", "Pad error pages for old Internet Explorer.", "http_core"],
        auth_delay: [H, "auth_delay time;", "0s", "Delay answers to failed authorization (slows guessing).", "http_core"],
        http2: ["http server", "http2 on | off;", "off", "Turn HTTP/2 on for this server (nginx 1.25.1 and newer; older versions use listen ... http2).", "http_v2"],
        http2_max_concurrent_streams: ["http server", "http2_max_concurrent_streams number;", "128", "Most concurrent HTTP/2 streams per connection.", "http_v2"],
        http2_push: [H, "http2_push uri | off;", "off", "Server push (removed in nginx 1.25.1).", "http_v2"],
        http3: ["http server", "http3 on | off;", "on", "Turn HTTP/3 on for a server that listens with quic.", "http_v3"],
        quic_retry: ["http server", "quic_retry on | off;", "off", "Validate QUIC client addresses with retry packets.", "http_v3"],
        add_header: [HL, "add_header name value [always];", "", "Adds a response header. A block with any add_header does not inherit the add_header lines of the blocks around it.", "http_headers"],
        add_trailer: [HL, "add_trailer name value [always];", "", "Adds a trailer at the end of the response.", "http_headers"],
        expires: [HL, "expires [modified] time | epoch | max | off;", "off", "Sets Expires and Cache-Control max-age on responses.", "http_headers"],
        return: ["server location lif sif", "return code [text | URL]; | return URL;", "", "Stops processing and sends this status code, redirect or text.", "http_rewrite"],
        rewrite: ["server location lif sif", "rewrite regex replacement [last | break | redirect | permanent];", "", "Changes the URI with a regular expression.", "http_rewrite"],
        if: ["server location", "if (condition) { ... }", "", "Runs the block when the condition holds. Inside location, only return and rewrite are fully safe in it.", "http_rewrite"],
        set: ["server location lif sif", "set $variable value;", "", "Sets a variable.", "http_rewrite"],
        break: ["server location lif sif", "break;", "", "Stops the current set of rewrite directives.", "http_rewrite"],
        rewrite_log: ["http server location lif sif", "rewrite_log on | off;", "off", "Log rewrite results at the notice level.", "http_rewrite"],
        uninitialized_variable_warn: ["http server location lif sif", "uninitialized_variable_warn on | off;", "on", "Warn about variables used before they are set.", "http_rewrite"],
        access_log: [HL + " limit_except stream stream_server", "access_log path [format [buffer=size] [gzip[=level]] [flush=time] [if=condition]]; | access_log off;", "logs/access.log combined", "Where requests are logged and in which format.", "http_log"],
        log_format: ["http stream", "log_format name [escape=default|json|none] string ...;", 'combined "..."', "Defines a named access log format.", "http_log"],
        open_log_file_cache: [H, "open_log_file_cache max=N [inactive=time] [min_uses=N] [valid=time] | off;", "off", "Caches log file handles when log paths contain variables.", "http_log"],
        allow: [H + " limit_except stream stream_server", "allow address | CIDR | unix: | all;", "", "Allows access from these addresses (rules are checked in order).", "http_access"],
        deny: [H + " limit_except stream stream_server", "deny address | CIDR | unix: | all;", "", "Denies access from these addresses (rules are checked in order).", "http_access"],
        auth_basic: [H + " limit_except", "auth_basic string | off;", "off", "Asks for a user name and password (HTTP Basic).", "http_auth_basic"],
        auth_basic_user_file: [H + " limit_except", "auth_basic_user_file file;", "", "The htpasswd file with users and password hashes.", "http_auth_basic"],
        auth_request: [H, "auth_request uri | off;", "off", "Checks each request with a subrequest; 2xx allows, 401 or 403 denies.", "http_auth_request"],
        auth_request_set: [H, "auth_request_set $variable value;", "", "Sets a variable from the auth subrequest response.", "http_auth_request"],
        autoindex: [H, "autoindex on | off;", "off", "Lists folder contents when no index file exists.", "http_autoindex"],
        autoindex_exact_size: [H, "autoindex_exact_size on | off;", "on", "Exact file sizes in folder listings.", "http_autoindex"],
        autoindex_format: [H, "autoindex_format html | xml | json | jsonp;", "html", "Format of folder listings.", "http_autoindex"],
        autoindex_localtime: [H, "autoindex_localtime on | off;", "off", "Local time in folder listings.", "http_autoindex"],
        charset: [HL, "charset charset | off;", "off", "Adds this charset to the Content-Type header.", "http_charset"],
        source_charset: [HL, "source_charset charset;", "", "Charset of the response before conversion.", "http_charset"],
        gzip: [HL, "gzip on | off;", "off", "Compresses responses with gzip.", "http_gzip"],
        gzip_types: [H, "gzip_types mime-type ...;", "text/html", "MIME types to compress besides text/html.", "http_gzip"],
        gzip_comp_level: [H, "gzip_comp_level level;", "1", "Compression level, 1 (fast) to 9 (small).", "http_gzip"],
        gzip_min_length: [H, "gzip_min_length length;", "20", "Smallest response (bytes) to compress.", "http_gzip"],
        gzip_proxied: [H, "gzip_proxied off | expired | no-cache | no-store | private | no_last_modified | no_etag | auth | any ...;", "off", "Which responses to proxied requests may be compressed.", "http_gzip"],
        gzip_vary: [H, "gzip_vary on | off;", "off", "Adds Vary: Accept-Encoding.", "http_gzip"],
        gzip_buffers: [H, "gzip_buffers number size;", "32 4k|16 8k", "Buffers for compressed data.", "http_gzip"],
        gzip_disable: [H, "gzip_disable regex ...;", "", "No compression for User-Agents that match.", "http_gzip"],
        gzip_http_version: [H, "gzip_http_version 1.0 | 1.1;", "1.1", "Lowest HTTP version to compress for.", "http_gzip"],
        gzip_static: [H, "gzip_static on | off | always;", "off", "Serves a ready .gz file next to the requested file.", "http_gzip_static"],
        gunzip: [H, "gunzip on | off;", "off", "Decompresses gzip responses for clients without gzip.", "http_gunzip"],
        map: ["http stream", "map string $variable { ... }", "", "Sets a variable from the value of another, with exact, wildcard or regex keys.", "http_map"],
        map_hash_max_size: ["http", "map_hash_max_size size;", "2048", "Size of map hash tables.", "http_map"],
        map_hash_bucket_size: ["http", "map_hash_bucket_size size;", "32|64|128", "Bucket size of map hash tables.", "http_map"],
        geo: ["http stream", "geo [$address] $variable { ... }", "", "Sets a variable from the client IP address.", "http_geo"],
        split_clients: ["http stream", "split_clients string $variable { ... }", "", "Splits clients into groups by a hash, for A/B tests.", "http_split_clients"],
        real_ip_header: [H, "real_ip_header field | X-Real-IP | X-Forwarded-For | proxy_protocol;", "X-Real-IP", "Header that holds the real client address behind a proxy.", "http_realip"],
        set_real_ip_from: [H, "set_real_ip_from address | CIDR | unix:;", "", "Trusted proxies whose real_ip_header is believed.", "http_realip"],
        real_ip_recursive: [H, "real_ip_recursive on | off;", "off", "Skip trusted addresses from the right of X-Forwarded-For.", "http_realip"],
        ssi: [HL, "ssi on | off;", "off", "Server side includes in responses.", "http_ssi"],
        sub_filter: [H, "sub_filter string replacement;", "", "Replaces text in responses.", "http_sub"],
        sub_filter_once: [H, "sub_filter_once on | off;", "on", "Replace only the first match.", "http_sub"],
        sub_filter_types: [H, "sub_filter_types mime-type ...;", "text/html", "MIME types sub_filter works on.", "http_sub"],
        stub_status: ["server location", "stub_status;", "", "Shows basic connection counters at this location.", "http_stub_status"],
        mirror: [H, "mirror uri | off;", "off", "Sends a copy of each request to another URI.", "http_mirror"],
        secure_link: [H, "secure_link expression;", "", "Checks signed links.", "http_secure_link"],
        secure_link_md5: [H, "secure_link_md5 expression;", "", "Expression whose MD5 signs links.", "http_secure_link"],
        secure_link_secret: ["location", "secure_link_secret word;", "", "Secret word for signed links.", "http_secure_link"],
        valid_referers: ["server location", "valid_referers none | blocked | server_names | string ...;", "", "Referer values that set $invalid_referer to empty.", "http_referer"],
        userid: [H, "userid on | v1 | log | off;", "off", "Cookie that identifies clients.", "http_userid"],
        empty_gif: ["location", "empty_gif;", "", "Answers with a 1x1 transparent GIF.", "http_empty_gif"],
        image_filter: ["location", "image_filter off | test | size | rotate | resize | crop ...;", "off", "Resizes or crops JPEG, GIF, PNG and WebP responses.", "http_image_filter"],
        dav_methods: [H, "dav_methods off | method ...;", "off", "WebDAV methods allowed.", "http_dav"],
        mp4: ["location", "mp4;", "", "Pseudo-streaming of MP4 files.", "http_mp4"],
        flv: ["location", "flv;", "", "Pseudo-streaming of FLV files.", "http_flv"],
        slice: [H, "slice size;", "0", "Splits requests into ranges of this size for caching.", "http_slice"],
        random_index: ["location", "random_index on | off;", "off", "Serves a random file from the folder.", "http_random_index"],
        addition_types: [H, "addition_types mime-type ...;", "text/html", "MIME types for add_before_body and add_after_body.", "http_addition"],
        add_before_body: [H, "add_before_body uri;", "", "Adds the response of a subrequest before the body.", "http_addition"],
        add_after_body: [H, "add_after_body uri;", "", "Adds the response of a subrequest after the body.", "http_addition"],
        // ---------- limits ----------
        limit_req_zone: ["http", "limit_req_zone key zone=name:size rate=rate [sync];", "", "Defines a shared zone that limits request rates per key (for example per client address).", "http_limit_req"],
        limit_req: [H, "limit_req zone=name [burst=number] [nodelay | delay=number];", "", "Applies a request rate limit zone here.", "http_limit_req"],
        limit_req_status: [H, "limit_req_status code;", "503", "Status code for rejected requests.", "http_limit_req"],
        limit_req_log_level: [H, "limit_req_log_level info | notice | warn | error;", "error", "Log level of rejected requests.", "http_limit_req"],
        limit_req_dry_run: [H, "limit_req_dry_run on | off;", "off", "Count but do not reject.", "http_limit_req"],
        limit_conn_zone: ["http stream", "limit_conn_zone key zone=name:size;", "", "Defines a shared zone that limits connections per key.", "http_limit_conn"],
        limit_conn: [H + " stream stream_server", "limit_conn zone number;", "", "Most connections per key in this zone.", "http_limit_conn"],
        limit_conn_status: [H, "limit_conn_status code;", "503", "Status code for rejected connections.", "http_limit_conn"],
        limit_conn_log_level: [H + " stream stream_server", "limit_conn_log_level info | notice | warn | error;", "error", "Log level of rejected connections.", "http_limit_conn"],
        // ---------- proxy ----------
        proxy_pass: ["location lif limit_except stream_server", "proxy_pass URL;", "", "Sends the request to this backend (an address or an upstream name). With a URI part, the matched location prefix is replaced by it.", "http_proxy"],
        proxy_set_header: [H, "proxy_set_header field value;", "Host $proxy_host; Connection close;", "Sets a request header sent to the backend. A block with any proxy_set_header does not inherit those of the blocks around it.", "http_proxy"],
        proxy_hide_header: [H, "proxy_hide_header field;", "", "Removes a backend response header.", "http_proxy"],
        proxy_pass_header: [H, "proxy_pass_header field;", "", "Passes a backend header that is hidden by default.", "http_proxy"],
        proxy_http_version: [H, "proxy_http_version 1.0 | 1.1;", "1.0", "HTTP version to the backend; 1.1 is needed for keep-alive and WebSocket.", "http_proxy"],
        proxy_redirect: [H, "proxy_redirect default | off | redirect replacement;", "default", "Rewrites Location and Refresh headers from the backend.", "http_proxy"],
        proxy_connect_timeout: [H, "proxy_connect_timeout time;", "60s", "Time allowed to connect to the backend.", "http_proxy"],
        proxy_read_timeout: [H, "proxy_read_timeout time;", "60s", "Time allowed between two reads from the backend.", "http_proxy"],
        proxy_send_timeout: [H, "proxy_send_timeout time;", "60s", "Time allowed between two writes to the backend.", "http_proxy"],
        proxy_buffering: [H, "proxy_buffering on | off;", "on", "Buffer backend responses (off streams them as they come).", "http_proxy"],
        proxy_buffers: [H, "proxy_buffers number size;", "8 4k|8k", "Buffers for a backend response.", "http_proxy"],
        proxy_buffer_size: [H, "proxy_buffer_size size;", "4k|8k", "Buffer for the first part of the backend response (headers).", "http_proxy"],
        proxy_busy_buffers_size: [H, "proxy_busy_buffers_size size;", "8k|16k", "Buffers that may be busy sending to the client.", "http_proxy"],
        proxy_request_buffering: [H, "proxy_request_buffering on | off;", "on", "Read the whole request body before sending it to the backend.", "http_proxy"],
        proxy_cache: [H, "proxy_cache zone | off;", "off", "Caches backend responses in this zone.", "http_proxy"],
        proxy_cache_path: ["http", "proxy_cache_path path [levels=levels] keys_zone=name:size [inactive=time] [max_size=size] ...;", "", "Folder and shared zone of a response cache.", "http_proxy"],
        proxy_cache_key: [H, "proxy_cache_key string;", "$scheme$proxy_host$request_uri", "Key of cached responses.", "http_proxy"],
        proxy_cache_valid: [H, "proxy_cache_valid [code ...] time;", "", "How long responses with these codes stay cached.", "http_proxy"],
        proxy_cache_bypass: [H, "proxy_cache_bypass string ...;", "", "Conditions that skip the cache for the response.", "http_proxy"],
        proxy_no_cache: [H, "proxy_no_cache string ...;", "", "Conditions that keep a response out of the cache.", "http_proxy"],
        proxy_cache_use_stale: [H, "proxy_cache_use_stale error | timeout | updating | http_500 | ... | off ...;", "off", "Serve a stale cached response when the backend fails.", "http_proxy"],
        proxy_cache_lock: [H, "proxy_cache_lock on | off;", "off", "Only one request fills a cache entry at a time.", "http_proxy"],
        proxy_cache_methods: [H, "proxy_cache_methods GET | HEAD | POST ...;", "GET HEAD", "Methods whose responses are cached.", "http_proxy"],
        proxy_cache_min_uses: [H, "proxy_cache_min_uses number;", "1", "Requests needed before a response is cached.", "http_proxy"],
        proxy_cache_revalidate: [H, "proxy_cache_revalidate on | off;", "off", "Revalidate expired entries with conditional requests.", "http_proxy"],
        proxy_ignore_headers: [H, "proxy_ignore_headers field ...;", "", "Backend headers that the cache ignores.", "http_proxy"],
        proxy_intercept_errors: [H, "proxy_intercept_errors on | off;", "off", "Use error_page for backend error responses.", "http_proxy"],
        proxy_next_upstream: [H, "proxy_next_upstream error | timeout | invalid_header | http_500 | ... | off ...;", "error timeout", "When to try the next backend server.", "http_proxy"],
        proxy_next_upstream_tries: [H, "proxy_next_upstream_tries number;", "0", "Most backend servers to try.", "http_proxy"],
        proxy_next_upstream_timeout: [H, "proxy_next_upstream_timeout time;", "0", "Most time for trying backend servers.", "http_proxy"],
        proxy_ssl_verify: [H, "proxy_ssl_verify on | off;", "off", "Check the backend TLS certificate.", "http_proxy"],
        proxy_ssl_trusted_certificate: [H, "proxy_ssl_trusted_certificate file;", "", "CA certificates to check the backend certificate.", "http_proxy"],
        proxy_ssl_server_name: [H, "proxy_ssl_server_name on | off;", "off", "Send SNI to the backend.", "http_proxy"],
        proxy_ssl_name: [H, "proxy_ssl_name name;", "$proxy_host", "Name used for SNI and certificate checks of the backend.", "http_proxy"],
        proxy_ssl_protocols: [H, "proxy_ssl_protocols [TLSv1] [TLSv1.1] [TLSv1.2] [TLSv1.3];", "TLSv1.2 TLSv1.3", "TLS versions toward the backend.", "http_proxy"],
        proxy_ssl_certificate: [H, "proxy_ssl_certificate file;", "", "Client certificate for the backend.", "http_proxy"],
        proxy_ssl_certificate_key: [H, "proxy_ssl_certificate_key file;", "", "Client certificate key for the backend.", "http_proxy"],
        proxy_max_temp_file_size: [H, "proxy_max_temp_file_size size;", "1024m", "Largest temporary file for a buffered response.", "http_proxy"],
        proxy_temp_path: [H, "proxy_temp_path path [level1 [level2 [level3]]];", "proxy_temp", "Folder for temporary files of backend responses.", "http_proxy"],
        proxy_cookie_domain: [H, "proxy_cookie_domain off | domain replacement;", "off", "Rewrites the domain of Set-Cookie from the backend.", "http_proxy"],
        proxy_cookie_path: [H, "proxy_cookie_path off | path replacement;", "off", "Rewrites the path of Set-Cookie from the backend.", "http_proxy"],
        proxy_bind: [H + " stream stream_server", "proxy_bind address [transparent] | off;", "", "Local address for connections to the backend.", "http_proxy"],
        proxy_method: [H, "proxy_method method;", "", "Method sent to the backend instead of the client method.", "http_proxy"],
        proxy_pass_request_body: [H, "proxy_pass_request_body on | off;", "on", "Send the request body to the backend.", "http_proxy"],
        proxy_pass_request_headers: [H, "proxy_pass_request_headers on | off;", "on", "Send the request headers to the backend.", "http_proxy"],
        proxy_set_body: [H, "proxy_set_body value;", "", "Request body sent to the backend instead of the client body.", "http_proxy"],
        proxy_headers_hash_max_size: [H, "proxy_headers_hash_max_size size;", "512", "Size of the proxy headers hash.", "http_proxy"],
        proxy_headers_hash_bucket_size: [H, "proxy_headers_hash_bucket_size size;", "64", "Bucket size of the proxy headers hash.", "http_proxy"],
        proxy_socket_keepalive: [H + " stream stream_server", "proxy_socket_keepalive on | off;", "off", "TCP keep-alive to the backend.", "http_proxy"],
        // ---------- fastcgi, uwsgi, scgi, grpc, memcached ----------
        fastcgi_pass: ["location lif", "fastcgi_pass address;", "", "Sends the request to a FastCGI server (for example PHP-FPM).", "http_fastcgi"],
        fastcgi_param: [H, "fastcgi_param parameter value [if_not_empty];", "", "A parameter sent to the FastCGI server.", "http_fastcgi"],
        fastcgi_index: [H, "fastcgi_index name;", "", "File name added to URIs that end with a slash.", "http_fastcgi"],
        fastcgi_split_path_info: ["location", "fastcgi_split_path_info regex;", "", "Splits the URI into $fastcgi_script_name and $fastcgi_path_info.", "http_fastcgi"],
        fastcgi_read_timeout: [H, "fastcgi_read_timeout time;", "60s", "Time allowed between two reads from the FastCGI server.", "http_fastcgi"],
        fastcgi_connect_timeout: [H, "fastcgi_connect_timeout time;", "60s", "Time allowed to connect to the FastCGI server.", "http_fastcgi"],
        fastcgi_send_timeout: [H, "fastcgi_send_timeout time;", "60s", "Time allowed between two writes to the FastCGI server.", "http_fastcgi"],
        fastcgi_buffers: [H, "fastcgi_buffers number size;", "8 4k|8k", "Buffers for a FastCGI response.", "http_fastcgi"],
        fastcgi_buffer_size: [H, "fastcgi_buffer_size size;", "4k|8k", "Buffer for the first part of the FastCGI response.", "http_fastcgi"],
        fastcgi_busy_buffers_size: [H, "fastcgi_busy_buffers_size size;", "8k|16k", "Buffers that may be busy sending to the client.", "http_fastcgi"],
        fastcgi_intercept_errors: [H, "fastcgi_intercept_errors on | off;", "off", "Use error_page for FastCGI error responses.", "http_fastcgi"],
        fastcgi_cache: [H, "fastcgi_cache zone | off;", "off", "Caches FastCGI responses in this zone.", "http_fastcgi"],
        fastcgi_cache_path: ["http", "fastcgi_cache_path path keys_zone=name:size [...];", "", "Folder and shared zone of a FastCGI response cache.", "http_fastcgi"],
        fastcgi_cache_key: [H, "fastcgi_cache_key string;", "", "Key of cached FastCGI responses.", "http_fastcgi"],
        fastcgi_cache_valid: [H, "fastcgi_cache_valid [code ...] time;", "", "How long FastCGI responses stay cached.", "http_fastcgi"],
        fastcgi_hide_header: [H, "fastcgi_hide_header field;", "", "Removes a FastCGI response header.", "http_fastcgi"],
        fastcgi_keep_conn: [H, "fastcgi_keep_conn on | off;", "off", "Keep the FastCGI connection open (needs upstream keepalive).", "http_fastcgi"],
        uwsgi_pass: ["location lif", "uwsgi_pass [protocol://]address;", "", "Sends the request to a uwsgi server.", "http_uwsgi"],
        uwsgi_param: [H, "uwsgi_param parameter value [if_not_empty];", "", "A parameter sent to the uwsgi server.", "http_uwsgi"],
        uwsgi_read_timeout: [H, "uwsgi_read_timeout time;", "60s", "Time allowed between two reads from the uwsgi server.", "http_uwsgi"],
        scgi_pass: ["location lif", "scgi_pass address;", "", "Sends the request to an SCGI server.", "http_scgi"],
        scgi_param: [H, "scgi_param parameter value [if_not_empty];", "", "A parameter sent to the SCGI server.", "http_scgi"],
        grpc_pass: ["location lif", "grpc_pass address;", "", "Sends the request to a gRPC server.", "http_grpc"],
        grpc_set_header: [H, "grpc_set_header field value;", "", "Sets a header sent to the gRPC server.", "http_grpc"],
        grpc_read_timeout: [H, "grpc_read_timeout time;", "60s", "Time allowed between two reads from the gRPC server.", "http_grpc"],
        grpc_send_timeout: [H, "grpc_send_timeout time;", "60s", "Time allowed between two writes to the gRPC server.", "http_grpc"],
        memcached_pass: ["location lif", "memcached_pass address;", "", "Reads the response from memcached.", "http_memcached"],
        // ---------- upstream ----------
        upstream: ["http stream", "upstream name { ... }", "", "A named group of backend servers for proxy_pass, fastcgi_pass and others.", "http_upstream"],
        keepalive: ["upstream", "keepalive connections;", "", "Idle keep-alive connections to the backends kept per worker.", "http_upstream"],
        keepalive_timeout_upstream: ["upstream", "", "", "", "http_upstream"],
        least_conn: ["upstream stream_upstream", "least_conn;", "", "Send each request to the server with the fewest active connections.", "http_upstream"],
        ip_hash: ["upstream", "ip_hash;", "", "Send a client always to the same server, by its address.", "http_upstream"],
        hash: ["upstream stream_upstream", "hash key [consistent];", "", "Choose the server by a hash of the key.", "http_upstream"],
        random: ["upstream stream_upstream", "random [two [least_conn]];", "", "Choose a random server (or the better of two).", "http_upstream"],
        zone: ["upstream stream_upstream", "zone name [size];", "", "Shared memory zone for the group, shared by the workers.", "http_upstream"],
        // ---------- ssl ----------
        ssl_certificate: ["http server mail mail_server stream stream_server", "ssl_certificate file;", "", "The certificate (with chain) in PEM format.", "http_ssl"],
        ssl_certificate_key: ["http server mail mail_server stream stream_server", "ssl_certificate_key file;", "", "The private key of the certificate.", "http_ssl"],
        ssl_protocols: ["http server mail mail_server stream stream_server", "ssl_protocols [SSLv2] [SSLv3] [TLSv1] [TLSv1.1] [TLSv1.2] [TLSv1.3];", "TLSv1.2 TLSv1.3", "TLS versions offered to clients. Only TLSv1.2 and TLSv1.3 are safe today.", "http_ssl"],
        ssl_ciphers: ["http server mail mail_server stream stream_server", "ssl_ciphers ciphers;", "HIGH:!aNULL:!MD5", "Cipher suites for TLS 1.2 and older, in OpenSSL format.", "http_ssl"],
        ssl_prefer_server_ciphers: ["http server mail mail_server stream stream_server", "ssl_prefer_server_ciphers on | off;", "off", "Use the server order of ciphers instead of the client order.", "http_ssl"],
        ssl_session_cache: ["http server mail mail_server stream stream_server", "ssl_session_cache off | none | [builtin[:size]] [shared:name:size];", "none", "Cache of TLS sessions for faster reconnects.", "http_ssl"],
        ssl_session_timeout: ["http server mail mail_server stream stream_server", "ssl_session_timeout time;", "5m", "How long a TLS session can be reused.", "http_ssl"],
        ssl_session_tickets: ["http server mail mail_server stream stream_server", "ssl_session_tickets on | off;", "on", "TLS session tickets.", "http_ssl"],
        ssl_dhparam: ["http server mail mail_server stream stream_server", "ssl_dhparam file;", "", "DH parameters for DHE ciphers.", "http_ssl"],
        ssl_ecdh_curve: ["http server mail mail_server stream stream_server", "ssl_ecdh_curve curve;", "auto", "Curves for ECDHE key exchange.", "http_ssl"],
        ssl_stapling: ["http server", "ssl_stapling on | off;", "off", "OCSP stapling of the certificate status.", "http_ssl"],
        ssl_stapling_verify: ["http server", "ssl_stapling_verify on | off;", "off", "Check OCSP answers.", "http_ssl"],
        ssl_trusted_certificate: ["http server mail mail_server stream stream_server", "ssl_trusted_certificate file;", "", "CA certificates for OCSP stapling and client checks (not sent to clients).", "http_ssl"],
        ssl_client_certificate: ["http server mail mail_server stream stream_server", "ssl_client_certificate file;", "", "CA certificates for client certificate checks.", "http_ssl"],
        ssl_verify_client: ["http server mail mail_server stream stream_server", "ssl_verify_client on | off | optional | optional_no_ca;", "off", "Ask clients for a certificate.", "http_ssl"],
        ssl_verify_depth: ["http server mail mail_server stream stream_server", "ssl_verify_depth number;", "1", "Depth of client certificate chains.", "http_ssl"],
        ssl_buffer_size: ["http server", "ssl_buffer_size size;", "16k", "Size of TLS records.", "http_ssl"],
        ssl_early_data: ["http server stream stream_server", "ssl_early_data on | off;", "off", "TLS 1.3 early data (0-RTT); allows replayed requests.", "http_ssl"],
        ssl_password_file: ["http server mail mail_server stream stream_server", "ssl_password_file file;", "", "Passphrases for encrypted keys.", "http_ssl"],
        ssl_conf_command: ["http server mail mail_server stream stream_server", "ssl_conf_command name value;", "", "Passes an OpenSSL configuration command.", "http_ssl"],
        ssl_reject_handshake: ["http server stream stream_server", "ssl_reject_handshake on | off;", "off", "Refuse TLS handshakes in this server (for a catch-all default server).", "http_ssl"],
        ssl_crl: ["http server mail mail_server stream stream_server", "ssl_crl file;", "", "Revoked certificates list for client checks.", "http_ssl"],
        ssl: ["http server", "ssl on | off;", "off", "Old way to turn TLS on; removed in nginx 1.25.1. Use listen ... ssl.", "http_ssl"],
        // ---------- stream ----------
        stream: ["main", "stream { ... }", "", "Block for TCP and UDP proxying.", "stream_core"],
        proxy_timeout: ["stream stream_server", "proxy_timeout time;", "10m", "Idle time allowed between two reads or writes on a proxied TCP or UDP session.", "stream_proxy"],
        proxy_responses: ["stream stream_server", "proxy_responses number;", "", "UDP responses expected for each client datagram.", "stream_proxy"],
        ssl_preread: ["stream stream_server", "ssl_preread on | off;", "off", "Read the TLS ClientHello (SNI) without ending TLS.", "stream_ssl_preread"],
        preread_timeout: ["stream stream_server", "preread_timeout time;", "30s", "Time allowed for the preread phase.", "stream_core"],
        proxy_protocol: ["stream stream_server mail mail_server", "proxy_protocol on | off;", "off", "Send the PROXY protocol header to the backend.", "stream_proxy"],
        return_stream: ["stream_server", "", "", "", "stream_return"],
        // ---------- mail ----------
        mail: ["main", "mail { ... }", "", "Block for the mail proxy.", "mail_core"],
        protocol: ["mail_server", "protocol imap | pop3 | smtp;", "", "Protocol of the mail server.", "mail_core"],
        auth_http: ["mail mail_server", "auth_http URL;", "", "Authentication server for the mail proxy.", "mail_auth_http"],
        // ---------- js (njs, an official module) ----------
        js_import: ["http server location stream stream_server", "js_import module.js | export_name from module.js;", "", "Imports an njs module.", "http_js"],
        js_content: ["location lif limit_except", "js_content function | module.function;", "", "Answers the request with an njs function.", "http_js"],
        js_set: ["http server location stream stream_server", "js_set $variable function | module.function;", "", "Sets a variable with an njs function.", "http_js"],
        js_path: ["http server location stream stream_server", "js_path path;", "", "Folder of njs modules.", "http_js"]
      };
      delete D.keepalive_timeout_upstream;
      delete D.return_stream;
      var STREAM_TOP = /* @__PURE__ */ new Set(["proxy_connect_timeout", "proxy_buffer_size", "proxy_next_upstream", "proxy_next_upstream_tries", "proxy_next_upstream_timeout", "proxy_ssl", "proxy_ssl_verify", "proxy_ssl_server_name", "proxy_ssl_name", "proxy_ssl_protocols", "proxy_ssl_trusted_certificate", "proxy_ssl_certificate", "proxy_ssl_certificate_key", "map", "upstream", "server", "allow", "deny", "access_log", "error_log", "resolver", "resolver_timeout", "ssl_certificate", "ssl_certificate_key", "ssl_protocols", "ssl_ciphers", "limit_conn", "tcp_nodelay", "proxy_download_rate", "proxy_upload_rate"]);
      for (const n of ["proxy_pass", "proxy_connect_timeout", "proxy_buffer_size", "proxy_next_upstream", "proxy_next_upstream_tries", "proxy_next_upstream_timeout", "proxy_ssl", "proxy_ssl_verify", "proxy_ssl_server_name", "proxy_ssl_name", "proxy_ssl_protocols", "proxy_ssl_trusted_certificate", "proxy_ssl_certificate", "proxy_ssl_certificate_key", "return", "set", "map", "upstream", "server", "allow", "deny", "access_log", "error_log", "resolver", "resolver_timeout", "listen", "ssl_certificate", "ssl_certificate_key", "ssl_protocols", "ssl_ciphers", "limit_conn", "tcp_nodelay", "proxy_download_rate", "proxy_upload_rate"]) {
        const top = STREAM_TOP.has(n) ? " stream" : "";
        if (D[n]) D[n] = [`${D[n][0]}${top} stream_server`.split(" ").filter((v, i, a) => a.indexOf(v) === i).join(" "), ...D[n].slice(1)];
      }
      for (const n of ["map", "upstream", "server"]) D[n][0] = D[n][0].split(" ").filter((c) => c !== "stream_server").join(" ");
      D.proxy_ssl = ["stream stream_server", "proxy_ssl on | off;", "off", "Use TLS toward the backend of a TCP proxy.", "stream_proxy"];
      D.proxy_download_rate = ["stream stream_server", "proxy_download_rate rate;", "0", "Speed limit from the backend.", "stream_proxy"];
      D.proxy_upload_rate = ["stream stream_server", "proxy_upload_rate rate;", "0", "Speed limit to the backend.", "stream_proxy"];
      for (const n of ["server", "keepalive", "zone", "least_conn", "hash", "random"]) if (D[n] && !/stream_upstream/.test(D[n][0])) D[n][0] += " stream_upstream";
      var THIRD_PARTY = [
        /^(lua|ssl_certificate_by_lua|ssl_session_(fetch|store)_by_lua|balancer_by_lua|log_by_lua|header_filter_by_lua|body_filter_by_lua|content_by_lua|access_by_lua|rewrite_by_lua|set_by_lua|init_by_lua|init_worker_by_lua|exit_worker_by_lua|server_rewrite_by_lua)/,
        /^more_(set|clear)_(input_)?headers$/,
        /^brotli/,
        /^passenger_/,
        /^pagespeed/,
        /^geoip2?_/,
        /^modsecurity/,
        /^vhost_traffic_status/,
        /^auth_jwt/,
        /^zone_sync/,
        /^health_check/,
        /^status_zone$/,
        /^api$/,
        /^sticky/,
        /^ntlm$/,
        /^state$/,
        /^queue$/,
        /^mp4_/,
        /^flv_/,
        /^set_(by_lua|escape_uri|unescape_uri|quote_|md5|sha1|encode_|decode_|hmac|random|secure_random|if_empty|misc|formatted|local_today|hashed_upstream|rotate)/,
        /^echo/,
        /^srcache_/,
        /^redis2?_/,
        /^postgres_/,
        /^headers_more/,
        /^rtmp$/,
        /^push_stream/,
        /^njs/,
        /^otel_/,
        /^opentracing/,
        /^acme_/,
        /^ssl_ct/,
        /^vod_/,
        /^upload_/,
        /^dav_ext/,
        /^fancyindex/,
        /^naxsi/,
        /^testcookie/,
        /^cache_purge$/,
        /^proxy_cache_purge$/,
        /^(proxy|fastcgi|uwsgi|scgi|grpc|memcached)_[a-z_]+$/,
        // the many *_cache_*, *_ssl_* and buffer settings of the proxy modules
        /^(ssl|http2|http3|quic|limit|gzip|auth|map|geo|ssi|sub_filter|autoindex|userid|secure_link|image_filter|xslt|mirror|slice|charset|real_ip|js|keepalive|large|client|open_file|output|error|access|log)_[a-z0-9_]+$/
      ];
      var VARIABLES = ["$arg_", "$args", "$binary_remote_addr", "$body_bytes_sent", "$bytes_sent", "$connection", "$connection_requests", "$content_length", "$content_type", "$cookie_", "$document_root", "$document_uri", "$host", "$hostname", "$http_", "$https", "$is_args", "$limit_rate", "$msec", "$nginx_version", "$pid", "$pipe", "$proxy_add_x_forwarded_for", "$proxy_host", "$proxy_port", "$query_string", "$realpath_root", "$remote_addr", "$remote_port", "$remote_user", "$request", "$request_body", "$request_completion", "$request_filename", "$request_id", "$request_length", "$request_method", "$request_time", "$request_uri", "$scheme", "$sent_http_", "$server_addr", "$server_name", "$server_port", "$server_protocol", "$ssl_cipher", "$ssl_client_verify", "$ssl_protocol", "$ssl_server_name", "$status", "$time_iso8601", "$time_local", "$upstream_addr", "$upstream_cache_status", "$upstream_connect_time", "$upstream_header_time", "$upstream_response_time", "$upstream_status", "$uri", "$http_upgrade", "$http_user_agent", "$http_referer", "$http_x_forwarded_for", "$fastcgi_script_name", "$fastcgi_path_info"];
      function info(name) {
        const d = D[name];
        if (!d) return null;
        return { name, contexts: d[0].split(" "), syntax: d[1], default: d[2], description: d[3], module: d[4] };
      }
      var known = (name) => Object.prototype.hasOwnProperty.call(D, name);
      var thirdParty = (name) => THIRD_PARTY.some((re) => re.test(name));
      var names = () => Object.keys(D);
      function distance(a, b, cap = 4) {
        if (Math.abs(a.length - b.length) > cap) return cap + 1;
        let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a.length; i++) {
          const cur = [i];
          let best = i;
          for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (cur[j] < best) best = cur[j];
          }
          if (best > cap) return cap + 1;
          prev = cur;
        }
        return prev[b.length];
      }
      function suggest(name) {
        let best = "", bd = 3;
        for (const n of names()) {
          const d = distance(name, n, 2);
          if (d < bd) {
            bd = d;
            best = n;
          }
        }
        return best;
      }
      var docsUrl = (name) => {
        const d = D[name];
        if (!d) return "";
        const mod = d[4] === "core" ? "ngx_core_module" : `ngx_${d[4]}_module`;
        return `https://nginx.org/en/docs/${d[4].startsWith("stream") ? "stream" : d[4].startsWith("mail") ? "mail" : "http"}/${mod}.html#${name}`.replace("/http/ngx_core_module", "/ngx_core_module");
      };
      module.exports = { D, info, known, thirdParty, names, suggest, distance, docsUrl, VARIABLES };
    }
  });

  // ../../../../toolchk4-work/tc4-e6853qxw/p/src/lint.js
  var require_lint = __commonJS({
    "../../../../toolchk4-work/tc4-e6853qxw/p/src/lint.js"(exports, module) {
      "use strict";
      var { parse, walk, contextOf } = require_parser();
      var dirs2 = require_directives();
      var DATA_BLOCKS = /* @__PURE__ */ new Set(["map", "types", "geo", "split_clients", "match", "charset_map"]);
      var NO_DUP = /* @__PURE__ */ new Set(["root", "alias", "proxy_pass", "fastcgi_pass", "uwsgi_pass", "scgi_pass", "grpc_pass", "memcached_pass", "try_files", "client_max_body_size", "server_tokens", "sendfile", "gzip", "keepalive_timeout", "default_type", "autoindex", "expires", "index", "access_log_off", "worker_processes", "worker_connections", "user", "pid", "ssl_certificate_key_dup", "ssl_protocols", "ssl_ciphers", "proxy_http_version", "proxy_read_timeout", "proxy_connect_timeout", "charset", "error_log_dup"]);
      function rootContext(nodes, fileName = "") {
        if (/(^|[\\/])nginx\.conf$/i.test(fileName)) return "main";
        const top = new Set(nodes.filter((n) => n.type === "directive").map((n) => n.name));
        if (top.has("http") || top.has("events") || top.has("stream") || top.has("worker_processes")) return "main";
        if (top.has("server") || top.has("upstream")) return "http";
        return null;
      }
      function range(n) {
        const t = n.nameTok;
        return { line: t.line, col: t.col, endLine: t.line, endCol: t.col + t.raw.length };
      }
      function lint2(text, opts = {}) {
        const unknownLevel = opts.unknown || "info";
        const { nodes, errors } = parse(text);
        const out = errors.map((e) => ({ ...e, severity: "error" }));
        const root = rootContext(nodes, opts.fileName || "");
        const seenServers = [];
        walk(nodes, (n, parents) => {
          const parent = parents[parents.length - 1];
          if (parent && DATA_BLOCKS.has(parent.name)) return false;
          if (parent && parent.raw) return false;
          const name = n.name;
          const quoted = !!n.nameTok.quoted;
          if (quoted) return void 0;
          let ctx = parents.length ? contextOf(parents) : root;
          if (!dirs2.known(name)) {
            if (unknownLevel === "off") return void 0;
            const sug = dirs2.suggest(name);
            if (sug && dirs2.distance(name, sug, 2) <= (name.length > 6 ? 2 : 1)) {
              out.push({ ...range(n), severity: "warning", message: `Unknown directive "${name}". Did you mean "${sug}"?`, code: "unknown-directive", fix: { replace: sug } });
            } else if (!dirs2.thirdParty(name)) {
              out.push({ ...range(n), severity: unknownLevel === "warning" ? "warning" : "info", message: `"${name}" is not a directive of nginx or of a common module. If it comes from a module you load, ignore this (or set nginxConfig.lint.unknownDirectives to off).`, code: "unknown-directive" });
            }
            return void 0;
          }
          for (let k = 1; k < n.args.length; k++) {
            const a = n.args[k], prev = n.args[k - 1];
            if (a.line > (prev.endLine !== void 0 ? prev.endLine : prev.line) && !a.quoted && /^[a-z_][a-z0-9_]*$/.test(a.value) && (dirs2.known(a.value) || dirs2.thirdParty(a.value)) && !["log_format", "map", "split_clients", "geo"].includes(name)) {
              const end = prev.endCol !== void 0 ? prev.endCol : prev.col + prev.raw.length;
              out.push({ line: prev.line, col: end, endLine: prev.line, endCol: end + 1, severity: "error", message: `Missing ";" at the end of this line: nginx reads "${a.value}" on the next line as one more value of "${name}".`, code: "missing-semicolon", fix: { line: prev.endLine !== void 0 ? prev.endLine : prev.line, col: end } });
              break;
            }
          }
          const d = dirs2.info(name);
          if (ctx && d && d.contexts.length && !d.contexts.includes(ctx)) {
            const where = ctx === "lif" ? 'an "if" inside a location' : ctx === "sif" ? 'an "if" inside a server' : `the ${ctx.replace("_", " ")} context`;
            out.push({ ...range(n), severity: "warning", message: `"${name}" is not allowed in ${where}. It is allowed in: ${d.contexts.map((c) => c === "lif" ? "if in location" : c === "sif" ? "if in server" : c.replace("_", " ")).join(", ")}.`, code: "wrong-context" });
          }
          if (d && /\{ \.\.\. \}$/.test(d.syntax) && !n.block && name !== "server") out.push({ ...range(n), severity: "error", message: `"${name}" needs a block: ${d.syntax}`, code: "needs-block" });
          if (name === "server" && n.block) seenServers.push(n);
          if (name === "ssl" && n.args[0] && n.args[0].value === "on") out.push({ ...range(n), severity: "hint", message: '"ssl on" was removed in nginx 1.25.1. Use "listen 443 ssl;" instead.', code: "deprecated" });
          return void 0;
        });
        const blocks = [{ list: nodes, owner: null }];
        walk(nodes, (n) => {
          if (n.block && !n.raw && !DATA_BLOCKS.has(n.name)) blocks.push({ list: n.block, owner: n });
        });
        for (const b of blocks) {
          const seen = /* @__PURE__ */ new Map();
          const listens = /* @__PURE__ */ new Map();
          for (const n of b.list) {
            if (n.type !== "directive") continue;
            if (NO_DUP.has(n.name) && !(b.owner && b.owner.name === "if")) {
              if (seen.has(n.name)) out.push({ ...range(n), severity: "warning", message: `"${n.name}" is already set in this block (line ${seen.get(n.name).line + 1}); nginx stops with "is duplicate".`, code: "duplicate" });
              else seen.set(n.name, n);
            }
            if (n.name === "listen" && b.owner && b.owner.name === "server") {
              const key = listenKey(n);
              if (listens.has(key)) out.push({ ...range(n), severity: "warning", message: `This server already listens on ${key} (line ${listens.get(key).line + 1}).`, code: "duplicate-listen" });
              else listens.set(key, n);
            }
          }
        }
        const names = /* @__PURE__ */ new Map();
        for (const s of seenServers) {
          const ports = [...new Set(s.block.filter((x) => x.type === "directive" && x.name === "listen").map(listenKey))];
          if (!ports.length) ports.push("*:80");
          for (const sn of s.block.filter((x) => x.type === "directive" && x.name === "server_name")) {
            for (const a of sn.args) {
              if (!a.value || a.value === "_" || a.value === '""') continue;
              for (const p of ports) {
                const k = `${p} ${a.value.toLowerCase()}`;
                if (names.has(k)) out.push({ line: a.line, col: a.col, endLine: a.line, endCol: a.col + a.raw.length, severity: "warning", message: `"${a.value}" on ${p} is also the name of the server at line ${names.get(k).line + 1}; nginx uses the first one and ignores this.`, code: "conflicting-server-name" });
                else names.set(k, a);
              }
            }
          }
        }
        return out;
      }
      function listenKey(n) {
        const v = n.args[0] && n.args[0].value || "80";
        if (/^unix:/.test(v)) return v;
        if (/^\d+$/.test(v)) return `*:${v}`;
        if (/^\[.*\]$/.test(v)) return `${v}:80`;
        const m = /^(.*):(\d+)$/.exec(v);
        if (m) return `${m[1] || "*"}:${m[2]}`;
        return `${v}:80`;
      }
      module.exports = { lint: lint2, rootContext, listenKey, DATA_BLOCKS };
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

  // ../../../../toolchk4-work/tc4-e6853qxw/p/src/loader.js
  var require_loader = __commonJS({
    "../../../../toolchk4-work/tc4-e6853qxw/p/src/loader.js"(exports, module) {
      "use strict";
      var fs = require_empty();
      var path = require_path_shim();
      var { parse } = require_parser();
      var MAX_FILES = 500;
      var MAX_DEPTH = 20;
      var MAX_FILE_BYTES = 16 << 20;
      function globToRe(seg) {
        return new RegExp("^" + seg.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]") + "$");
      }
      function expand(pattern, fsx = fs) {
        if (!/[*?[]/.test(pattern)) return fsx.existsSync(pattern) ? [pattern] : [];
        const parts = pattern.split(/[\\/]/);
        let bases = [parts[0] === "" ? path.sep : parts[0]];
        for (let i = 1; i < parts.length; i++) {
          const seg = parts[i];
          if (!seg) continue;
          const next = [];
          for (const b of bases) {
            if (/[*?]/.test(seg)) {
              let ents = [];
              try {
                ents = fsx.readdirSync(b);
              } catch {
                continue;
              }
              const re = globToRe(seg);
              for (const e of ents.sort()) if (re.test(e) && !e.startsWith(".")) next.push(path.join(b, e));
            } else next.push(path.join(b, seg));
          }
          bases = next;
          if (bases.length > MAX_FILES) bases = bases.slice(0, MAX_FILES);
        }
        return bases.filter((f) => {
          try {
            return fsx.statSync(f).isFile();
          } catch {
            return false;
          }
        });
      }
      function includeBases(file, prefix) {
        const dir = path.dirname(file);
        const out = [];
        if (prefix) out.push(prefix);
        out.push(dir, path.dirname(dir), "/etc/nginx", "/usr/local/etc/nginx", "/opt/homebrew/etc/nginx");
        return [...new Set(out)];
      }
      function load(file, opts = {}) {
        const readFile = opts.readFile || ((f) => {
          const st = fs.statSync(f);
          if (st.size > MAX_FILE_BYTES) throw new Error(`larger than ${MAX_FILE_BYTES >> 20} MB`);
          return fs.readFileSync(f, "utf8");
        });
        const files2 = [];
        const missing = [];
        const cycles = [];
        let truncated = false;
        const texts = new Map(opts.texts || []);
        function loadFile(f, depth, stack) {
          if (files2.length >= MAX_FILES) {
            truncated = true;
            return [];
          }
          if (stack.includes(f)) {
            cycles.push([...stack, f]);
            return [];
          }
          let text;
          try {
            text = texts.has(f) ? texts.get(f) : readFile(f);
          } catch (e) {
            missing.push({ file: f, line: 0, pattern: f, reason: e.message });
            return [];
          }
          const parsed = parse(text);
          files2.push({ file: f, errors: parsed.errors, text });
          return expandIncludes(parsed.nodes, f, depth, [...stack, f]);
        }
        function expandIncludes(nodes, f, depth, stack) {
          const out = [];
          for (const n of nodes) {
            if (n.type !== "directive") {
              out.push(n);
              continue;
            }
            n.file = f;
            if (n.name === "include" && n.args[0] && depth < MAX_DEPTH) {
              const pat = n.args[0].value;
              let matched = [];
              if (path.isAbsolute(pat)) matched = expand(pat);
              else for (const b of includeBases(f, opts.prefix)) {
                matched = expand(path.join(b, pat));
                if (matched.length) break;
              }
              n.included = matched;
              out.push(n);
              if (!matched.length) {
                if (!/[*?]/.test(pat)) missing.push({ file: f, line: n.line, pattern: pat });
                continue;
              }
              for (const m of matched) for (const c of loadFile(m, depth + 1, stack)) {
                if (c.type === "directive") c.from = c.from || n;
                out.push(c);
              }
              continue;
            }
            if (n.block && !n.raw) n.block = expandIncludes(n.block, f, depth, stack);
            out.push(n);
          }
          return out;
        }
        const root = loadFile(file, 0, []);
        return { root, files: files2, missing, cycles, truncated };
      }
      module.exports = { load, expand, includeBases, MAX_FILES };
    }
  });

  // ../../../../toolchk4-work/tc4-e6853qxw/p/src/model.js
  var require_model = __commonJS({
    "../../../../toolchk4-work/tc4-e6853qxw/p/src/model.js"(exports, module) {
      "use strict";
      var { listenKey } = require_lint();
      var ARG = (n, i = 0) => n && n.args[i] ? n.args[i].value : "";
      var dirsOf = (list, name) => (list || []).filter((x) => x.type === "directive" && x.name === name);
      var first = (list, name) => dirsOf(list, name)[0] || null;
      function locationSpec(n) {
        const a0 = ARG(n, 0), a1 = ARG(n, 1);
        if (["=", "^~", "~", "~*"].includes(a0)) return { mod: a0, path: a1 };
        if (a0.startsWith("@")) return { mod: "@", path: a0 };
        const m = /^(=|\^~|~\*|~)(.+)$/.exec(a0);
        if (m) return { mod: m[1], path: m[2] };
        return { mod: "", path: a0 };
      }
      function actionOf(list) {
        const r = first(list, "return");
        if (r) return `return ${r.args.map((a) => a.raw).join(" ")}`;
        for (const k of ["proxy_pass", "fastcgi_pass", "uwsgi_pass", "grpc_pass", "scgi_pass", "memcached_pass", "js_content"]) {
          const p = first(list, k);
          if (p) return `${k} ${ARG(p)}`;
        }
        if (first(list, "stub_status")) return "stub_status";
        const tf = first(list, "try_files");
        if (tf) return `try_files ${tf.args.map((a) => a.raw).join(" ")}`;
        const al = first(list, "alias");
        if (al) return `alias ${ARG(al)}`;
        const rt = first(list, "root");
        if (rt) return `root ${ARG(rt)}`;
        return "";
      }
      function locationsOf(list, parents) {
        return dirsOf(list, "location").filter((l) => l.block).map((l) => {
          const spec = locationSpec(l);
          return { node: l, ...spec, file: l.file, line: l.line, action: actionOf(l.block), nested: locationsOf(l.block, [...parents, l]) };
        });
      }
      function listensOf(server) {
        const ls = dirsOf(server.block, "listen");
        if (!ls.length) return [{ key: "*:80", addr: "*", port: 80, ssl: false, default: false, implicit: true, raw: "" }];
        return ls.map((l) => {
          const key = listenKey(l);
          const m = /^(.*):(\d+)$/.exec(key);
          const flags = l.args.slice(1).map((a) => a.value);
          return { key, addr: m ? m[1] : key, port: m ? Number(m[2]) : 0, ssl: flags.includes("ssl"), quic: flags.includes("quic"), default: flags.includes("default_server") || flags.includes("default"), http2: flags.includes("http2"), node: l, raw: l.args.map((a) => a.raw).join(" ") };
        });
      }
      function build(loaded) {
        const servers = [], upstreams = [], streamServers = [];
        const httpBlocks = [];
        const top = loaded.root;
        const tops = top.filter((n) => n.type === "directive");
        const http = tops.filter((n) => n.name === "http" && n.block);
        const httpLists = http.length ? http.map((h) => h.block) : tops.some((n) => n.name === "server" || n.name === "upstream") ? [top] : [];
        for (const list of httpLists) {
          httpBlocks.push(list);
          for (const s of dirsOf(list, "server").filter((x) => x.block)) {
            const names = dirsOf(s.block, "server_name").flatMap((d) => d.args.map((a) => a.value));
            servers.push({ node: s, file: s.file, line: s.line, listen: listensOf(s), names, locations: locationsOf(s.block, [s]), serverReturn: first(s.block, "return"), serverRewrites: dirsOf(s.block, "rewrite"), root: ARG(first(s.block, "root")) });
          }
          for (const u of dirsOf(list, "upstream").filter((x) => x.block)) upstreams.push({ node: u, name: ARG(u), file: u.file, line: u.line, servers: dirsOf(u.block, "server").map((x) => x.args.map((a) => a.raw).join(" ")) });
        }
        if (!servers.length && tops.some((n) => n.name === "location")) {
          servers.push({ node: { block: top, file: tops[0].file, line: 0, name: "server" }, file: tops[0].file, line: 0, listen: [{ key: "*:80", addr: "*", port: 80, implicit: true }], names: [], locations: locationsOf(top, []), snippet: true, root: ARG(first(top, "root")) });
        }
        for (const st of tops.filter((n) => n.name === "stream" && n.block)) {
          for (const s of dirsOf(st.block, "server").filter((x) => x.block)) streamServers.push({ node: s, file: s.file, line: s.line, listen: dirsOf(s.block, "listen").map((l) => l.args.map((a) => a.raw).join(" ")), proxyPass: ARG(first(s.block, "proxy_pass")) });
          for (const u of dirsOf(st.block, "upstream").filter((x) => x.block)) upstreams.push({ node: u, name: ARG(u), file: u.file, line: u.line, stream: true, servers: dirsOf(u.block, "server").map((x) => x.args.map((a) => a.raw).join(" ")) });
        }
        return { servers, upstreams, streamServers, httpBlocks, files: loaded.files, missing: loaded.missing, cycles: loaded.cycles, truncated: loaded.truncated };
      }
      function overview(model2, rel) {
        const r = (f) => rel ? rel(f) : f;
        const loc = (l) => ({ mod: l.mod, path: l.path, action: l.action, file: r(l.file), abs: l.file, line: l.line + 1, nested: l.nested.map(loc) });
        return {
          servers: model2.servers.map((s) => ({ names: s.names, listen: s.listen.map((l) => l.key + (l.ssl ? " ssl" : "") + (l.default ? " default_server" : "")), ssl: s.listen.some((l) => l.ssl), file: r(s.file), abs: s.file, line: s.line + 1, snippet: !!s.snippet, serverAction: s.serverReturn ? `return ${s.serverReturn.args.map((a) => a.raw).join(" ")}` : "", locations: s.locations.map(loc) })),
          upstreams: model2.upstreams.map((u) => ({ name: u.name, stream: !!u.stream, servers: u.servers, file: r(u.file), abs: u.file, line: u.line + 1 })),
          streams: model2.streamServers.map((s) => ({ listen: s.listen, proxyPass: s.proxyPass, file: r(s.file), abs: s.file, line: s.line + 1 })),
          files: model2.files.map((f) => ({ file: r(f.file), abs: f.file, errors: f.errors.length })),
          missing: model2.missing.map((m) => ({ file: r(m.file), abs: m.file, line: m.line + 1, pattern: m.pattern, reason: m.reason || "" })),
          cycles: model2.cycles.map((c) => c.map(r)),
          truncated: model2.truncated
        };
      }
      module.exports = { build, overview, locationSpec, listensOf, actionOf, dirsOf, first, ARG };
    }
  });

  // ../../../../toolchk4-work/tc4-e6853qxw/entry.js
  var vfs = require_empty();
  var parser = require_parser();
  var fmt = require_format();
  var lint = require_lint();
  var dirs = require_directives();
  var loader = require_loader();
  var model = require_model();
  var files = /* @__PURE__ */ new Map();
  var isDirPath = (p) => {
    const pre = p.endsWith("/") ? p : p + "/";
    for (const k of files.keys()) if (k.startsWith(pre)) return true;
    return false;
  };
  Object.assign(vfs, {
    existsSync: (p) => files.has(p) || isDirPath(p),
    statSync: (p) => {
      if (files.has(p)) return { isFile: () => true, isDirectory: () => false, size: files.get(p).length };
      if (isDirPath(p)) return { isFile: () => false, isDirectory: () => true, size: 0 };
      const e = new Error("ENOENT: no such file " + p);
      e.code = "ENOENT";
      throw e;
    },
    readdirSync: (p) => {
      const pre = p.endsWith("/") ? p : p + "/";
      const out = /* @__PURE__ */ new Set();
      for (const k of files.keys()) if (k.startsWith(pre)) out.add(k.slice(pre.length).split("/")[0]);
      if (!out.size && !files.has(p)) {
        const e = new Error("ENOENT: no such folder " + p);
        e.code = "ENOENT";
        throw e;
      }
      return [...out];
    },
    readFileSync: (p) => {
      if (!files.has(p)) {
        const e = new Error("ENOENT: no such file " + p);
        e.code = "ENOENT";
        throw e;
      }
      return files.get(p);
    }
  });
  self.ZovoEngine = {
    mount: (map) => {
      files = new Map(map);
    },
    parse: parser.parse,
    walk: parser.walk,
    format: fmt.format,
    lint: lint.lint,
    rootContext: lint.rootContext,
    info: dirs.info,
    names: dirs.names,
    docsUrl: dirs.docsUrl,
    known: dirs.known,
    load: loader.load,
    build: model.build,
    overview: model.overview,
    MAX_BYTES: parser.MAX_BYTES
  };
})();
