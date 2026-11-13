/* Shell Script Formatter (TOOLCHK5, wave18, 13 Nov 2026). Formats a shell script with shfmt 3.14.1 in WebAssembly,
   the same main.wasm and the same run() and same-commands check as the Shell Formatter extension (shfmt-worker.js),
   with the extension's own dialect and option rules (engine.js). The script is read with the File API in this tab,
   formatted in a worker of this tab and never sent anywhere. Script text is only ever written with textContent. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine;
  const MAX_BYTES = 10 * 1024 * 1024, VERIFY_MAX = 256 * 1024, TIMEOUT_MS = 10000, MAX_SHOW = 6000;
  let cur = null, worker = null, seq = 0;
  const pending = new Map();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const n = (x) => x.toLocaleString('en-US');
  const lines = (k) => n(k) + (k === 1 ? ' line' : ' lines');
  const hash = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = (h * 33 + t.charCodeAt(i)) >>> 0; return h; };  // for the page test

  // ---- the shfmt worker: one request at a time, killed after a time limit (as the extension's Engine does)
  function startWorker() {
    if (worker) return worker;
    worker = new Worker('shfmt-worker.js');
    worker.onmessage = (ev) => { const p = pending.get(ev.data.id); if (!p) return; pending.delete(ev.data.id); clearTimeout(p.timer); p.resolve(ev.data); };
    worker.onerror = (e) => { e.preventDefault(); const w = worker; worker = null; if (w) w.terminate(); for (const [id, p] of pending) { clearTimeout(p.timer); p.resolve({ id, ok: false, kind: 'engine', message: 'The formatter stopped: ' + (e.message || 'error') }); } pending.clear(); };
    return worker;
  }
  let queue = Promise.resolve();
  function request(msg) {
    const run = () => new Promise((resolve) => {
      const w = startWorker(), id = ++seq;
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id); if (worker === w) worker = null; w.terminate();
        resolve({ id, ok: false, kind: 'timeout', message: 'Formatting took longer than ' + TIMEOUT_MS / 1000 + ' s and was stopped. Nothing was changed.' });
      }, TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      w.postMessage(Object.assign({}, msg, { id }));
    });
    const p = queue.then(run, run); queue = p.catch(() => {}); return p;
  }

  // ---- line diff (Myers), for the Changes view
  function diffLines(a, b) {
    const N = a.length, M = b.length, max = N + M, MAXD = 2000;
    if (N + M > 400000) return null;
    let s = 0; while (s < N && s < M && a[s] === b[s]) s++;
    let ea = N, eb = M; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
    const A = a.slice(s, ea), B = b.slice(s, eb), n1 = A.length, m1 = B.length;
    const off = n1 + m1 + 1, v = new Int32Array(2 * off + 1), trace = [];
    let found = n1 === 0 && m1 === 0;
    for (let d = 0; !found && d <= n1 + m1; d++) {
      if (d > MAXD) return null;
      trace.push(v.slice(off - d - 1, off + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
        let y = x - k;
        while (x < n1 && y < m1 && A[x] === B[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n1 && y >= m1) { found = true; break; }
      }
    }
    // backtrack
    const ops = []; let x = n1, y = m1;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const t = trace[d], base = d + 1, get = (k) => t[base + k];
      const k = x - y;
      const prevK = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
      const px = d === 0 ? 0 : get(prevK), py = px - prevK;
      while (x > px && y > py) { ops.push(['=', x - 1, y - 1]); x--; y--; }
      if (d > 0) { if (x === px) { ops.push(['+', -1, y - 1]); y--; } else { ops.push(['-', x - 1, -1]); x--; } }
      else { while (x > 0 && y > 0) { ops.push(['=', x - 1, y - 1]); x--; y--; } }
    }
    ops.reverse();
    const out = [];
    for (let i = 0; i < s; i++) out.push(['=', i, i]);
    for (const [o, i, j] of ops) out.push([o, i < 0 ? -1 : i + s, j < 0 ? -1 : j + s]);
    for (let i = 0; i < N - ea; i++) out.push(['=', ea + i, eb + i]);
    return out;
  }

  function codePane(pane, lines, mark) {
    pane.textContent = '';
    const frag = document.createDocumentFragment();
    const shown = Math.min(lines.length, MAX_SHOW);
    for (let i = 0; i < shown; i++) {
      const r = el('div', 'ln' + (mark === i + 1 ? ' bad' : ''));
      r.appendChild(el('span', 'n', String(i + 1))); r.appendChild(el('span', 'c', lines[i]));
      frag.appendChild(r);
    }
    pane.appendChild(frag);
    return shown < lines.length;
  }

  function changesPane(pane, a, b) {
    pane.textContent = '';
    const ops = diffLines(a, b);
    if (!ops) { pane.appendChild(el('div', 'ln hunk', 'Too many changed lines to show here. Use Save or Copy to get the formatted script.')); return { add: -1, del: -1 }; }
    let add = 0, del = 0, rows = 0;
    const frag = document.createDocumentFragment();
    const keep = new Uint8Array(ops.length);
    ops.forEach((o, i) => { if (o[0] !== '=') { add += o[0] === '+'; del += o[0] === '-'; for (let j = Math.max(0, i - 2); j <= Math.min(ops.length - 1, i + 2); j++) keep[j] = 1; } });
    let gap = false;
    for (let i = 0; i < ops.length && rows < MAX_SHOW; i++) {
      if (!keep[i]) { gap = true; continue; }
      const [o, ia, ib] = ops[i];
      if (gap) { frag.appendChild(el('div', 'ln hunk', '@@ line ' + (ia >= 0 ? ia + 1 : '?') + ' of the original, line ' + (ib >= 0 ? ib + 1 : '?') + ' of the result')); gap = false; }
      const r = el('div', 'ln' + (o === '+' ? ' add' : o === '-' ? ' del' : ''));
      r.appendChild(el('span', 'n', String(o === '+' ? ib + 1 : ia + 1)));
      r.appendChild(el('span', 'm', o === '=' ? ' ' : o));
      r.appendChild(el('span', 'c', o === '+' ? b[ib] : a[ia]));
      frag.appendChild(r); rows++;
    }
    if (!add && !del) frag.appendChild(el('div', 'ln hunk', 'No changes: the script is already formatted with these options.'));
    pane.appendChild(frag);
    return { add, del };
  }

  function stat(k, v) { const d = el('div', 'stat'); d.appendChild(el('div', 'k', k)); d.appendChild(el('div', 'v', v)); return d; }
  function showTab(name) {
    document.querySelectorAll('.sfv .tab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === name)));
    $('paneOut').hidden = name !== 'out'; $('paneChg').hidden = name !== 'chg'; $('paneSrc').hidden = name !== 'src';
  }
  document.querySelectorAll('.sfv .tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function settings() {
    return { useEditorConfig: false, dialect: $('dialect').value, indent: Number($('indent').value),
      binaryNextLine: $('optBn').checked, switchCaseIndent: $('optCi').checked, spaceRedirects: $('optSr').checked,
      keepPadding: $('optKp').checked, functionNextLine: $('optFn').checked, simplify: $('optS').checked, minify: false };
  }

  async function format() {
    const c = cur, t0 = performance.now();
    const s = settings();
    const r = E.resolveOptions({ fileName: c.name, firstLine: c.text.split('\n', 1)[0], settings: s, editor: {}, ec: {} });
    $('err').hidden = true; $('err').textContent = '';
    const st = { name: c.name, ok: false, pwned: !!self.__pwned };
    if (r.skip) { c.out = null; renderFail({ kind: 'skip', message: r.skip }, c); self.zovoState = Object.assign(st, { skip: r.skip }); return 'Not formatted: ' + r.skip; }
    const verify = $('optVerify').checked && !r.opts.simplify && c.text.length <= VERIFY_MAX;
    let dialect = r.dialect, from = r.dialectFrom;
    let res = await request({ op: 'format', text: c.text, opts: r.opts, name: c.name, verify });
    if (!res.ok && res.kind === 'syntax' && (from === 'default' || from === 'name') && s.dialect === 'auto') {
      const alt = E.featureDialect(res.message);
      if (alt && alt !== dialect) {
        const res2 = await request({ op: 'format', text: c.text, opts: Object.assign({}, r.opts, { variant: E.VARIANT[alt] }), name: c.name, verify });
        if (res2.ok) { res = res2; dialect = alt; from = 'parser hint'; }
      }
    }
    const flags = E.shfmtFlags(dialect, r.opts).join(' ');
    $('flags').textContent = '';
    $('flags').append('Same as ', el('code', '', 'shfmt ' + flags + (r.opts.simplify ? '' : '')), '. Dialect from ' + ({ shebang: 'the shebang', name: 'the file name', default: 'the default (bash)', setting: 'your choice', 'parser hint': 'the parser hint' }[from] || from) + '.');
    const srcLines = c.text.split('\n');
    const cutSrc = codePane($('paneSrc'), srcLines, res.ok ? 0 : res.line);
    if (!res.ok) { c.out = null; renderFail(res, c); self.zovoState = Object.assign(st, { kind: res.kind, line: res.line || 0, column: res.column || 0, message: res.message, dialect, flags }); $('cut').textContent = cutSrc ? 'Showing the first ' + n(MAX_SHOW) + ' lines.' : ''; return res.kind === 'syntax' ? 'Syntax error on line ' + res.line + (res.column ? ', column ' + res.column : '') + '. Nothing was changed.' : res.message; }
    c.out = res.text;
    const outLines = res.text.split('\n');
    const cutOut = codePane($('paneOut'), outLines, 0);
    const ch = changesPane($('paneChg'), srcLines, outLines);
    const changed = res.text !== c.text;
    const stats = $('stats'); stats.textContent = '';
    stats.append(stat('Dialect', dialect), stat('Lines', n(outLines.length - (res.text.endsWith('\n') ? 1 : 0))),
      stat('Changed lines', ch.add < 0 ? 'many' : changed ? n(ch.del) + ' out, ' + n(ch.add) + ' in' : 'none'),
      stat('Same commands', !changed ? 'no change' : res.verified ? 'checked' : verify ? 'not checked' : 'skipped'),
      stat('shfmt time', n(res.ms) + ' ms'));
    $('save').disabled = $('copy').disabled = false;
    $('cut').textContent = cutOut || cutSrc ? 'Showing the first ' + n(MAX_SHOW) + ' lines. Save or Copy gives the whole script.' : '';
    showTab(changed ? 'chg' : 'out');
    self.zovoState = Object.assign(st, { ok: true, dialect, from, flags, changed, add: ch.add, del: ch.del, lines: outLines.length, verified: !!res.verified, outLen: res.text.length, outHash: hash(res.text) });
    return changed ? 'Formatted ' + c.name + ' with shfmt in ' + Math.round(performance.now() - t0) + ' ms' + (ch.add < 0 ? '.' : ': ' + lines(ch.del) + ' out, ' + lines(ch.add) + ' in.') : c.name + ' is already formatted with these options.';
  }

  function renderFail(res, c) {
    const e = $('err'); e.hidden = false; e.textContent = '';
    const head = res.kind === 'syntax' ? 'Syntax error on line ' + res.line + (res.column ? ', column ' + res.column : '') : res.kind === 'skip' ? 'Not a script shfmt can format' : res.kind === 'verify' ? 'The same commands check failed' : 'The formatter could not run';
    e.appendChild(el('h3', '', head)); e.appendChild(el('p', '', res.message));
    if (res.kind === 'syntax') e.appendChild(el('p', 'small mut', 'Nothing was changed. The line is marked in the Original tab.'));
    $('stats').textContent = ''; $('paneOut').textContent = ''; $('paneChg').textContent = '';
    if (res.kind !== 'syntax') { $('paneSrc').textContent = ''; codePane($('paneSrc'), c.text.split('\n'), 0); }
    $('save').disabled = $('copy').disabled = true;
    showTab('src');
  }

  self.zovoOpen = async (file) => {
    if (file.size > MAX_BYTES) throw new Error('the file is ' + self.zovoSize(file.size) + '. The formatter takes scripts up to 10 MB.');
    const base = file.name.split('/').pop();
    if (/^(Dockerfile|Containerfile)(\..*)?$/i.test(base) || /(^|\.)env$|^\.env\./i.test(base)) throw new Error('a Dockerfile or .env file is not a shell script, so it is not formatted (the extension leaves them alone too).');
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.includes(0)) throw new Error('the file has binary (NUL) bytes, so it is not a shell script that can be formatted.');
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const crlf = /\r\n/.test(text);
    cur = { name: base, text: text.replace(/\r\n/g, '\n'), crlf, out: null };
    return format();
  };

  const rerun = () => { if (!cur) return; self.zovoMsg('Formatting...'); format().then((m) => self.zovoMsg(m), (e) => self.zovoMsg('Could not format: ' + e.message, true)); };
  for (const id of ['dialect', 'indent', 'optBn', 'optCi', 'optSr', 'optKp', 'optFn', 'optS', 'optVerify']) $(id).addEventListener('change', rerun);

  const outText = () => (cur && cur.out != null ? (cur.crlf ? cur.out.replace(/\n/g, '\r\n') : cur.out) : '');
  $('save').addEventListener('click', () => {
    if (!cur || cur.out == null) return;
    const a = el('a'); a.href = URL.createObjectURL(new Blob([outText()], { type: 'text/x-sh' })); a.download = cur.name.startsWith('pasted') ? 'script.sh' : cur.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('copy').addEventListener('click', () => {
    if (!cur || cur.out == null) return;
    navigator.clipboard.writeText(outText()).then(() => self.zovoMsg('Copied the formatted script.'), () => self.zovoMsg('Copy is blocked here. Use Save instead.', true));
  });
  $('pasteGo').addEventListener('click', () => {
    const t = $('pasteText').value;
    if (!t.trim()) { self.zovoMsg('Paste a script first.', true); return; }
    self.zovoOpenFiles([new File([t], 'pasted.sh', { type: 'text/plain' })]);
  });
})();
