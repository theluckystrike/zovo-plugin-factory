/* VCD Waveform Viewer Online (TOOLCHK, wave18; first draft by HTOOL6, rewritten). Plain JavaScript, no library, no request.
   Reads a Value Change Dump in this tab with a token parser (several changes on one line, $var split over lines,
   $comment blocks, 4-state and VHDL values, reals and strings), then draws the chosen signals on a canvas: only the
   rows and the time range on screen are drawn, with a binary search into each signal's changes. Names and values
   from the file are drawn on the canvas or set as text, never as HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const ROW = 24, RULER = 26, NAMEW = 210, VALW = 110, FIRST = 64, TREEMAX = 3000;
  let D = null;  // { vars, sigs: Map(id -> {t:[], v:[]}), end, unit (seconds per tick), scopes }
  const V = { t0: 0, ppt: 1, row0: 0, rows: [], cursor: null, A: null, B: null, sel: -1, radix: 'hex' };

  /* ---------------- parser ---------------- */
  function parse(text) {
    const vars = [], sigs = new Map(), scope = [], scopes = new Set();
    let unit = 1e-9, unitText = '1 ns', t = 0, end = 0, minT = Infinity, i = 0, defs = true;
    const re = /\S+/g;
    let done = false;  // exec() returning null resets lastIndex to 0, so the end must stick
    const next = () => { if (done) return null; const m = re.exec(text); if (!m) { done = true; return null; } return m[0]; };
    const untilEnd = () => { const out = []; let x; while ((x = next()) !== null && x !== '$end') out.push(x); return out; };
    const sig = id => { let s = sigs.get(id); if (!s) { s = { t: [], v: [] }; sigs.set(id, s); } return s; };
    const put = (id, val) => {
      const s = sigs.get(id);
      if (!s) return;  // a change for an id with no $var
      const n = s.t.length;
      if (n && s.t[n - 1] === t) s.v[n - 1] = val; else { s.t.push(t); s.v.push(val); }
    };
    let tok;
    while ((tok = next()) !== null) {
      if (defs) {
        if (tok === '$var') {
          const p = untilEnd();
          if (p.length >= 4) {
            const w = parseInt(p[1], 10) || 1, id = p[2], name = p.slice(3).join(' ').replace(/\s+\[/, '[');
            vars.push({ type: p[0], w, id, name, scope: scope.join('.'), n: vars.length });
            sig(id);
          }
        } else if (tok === '$scope') { const p = untilEnd(); scope.push(p[1] || p[0] || '?'); scopes.add(scope.join('.')); }
        else if (tok === '$upscope') { untilEnd(); scope.pop(); }
        else if (tok === '$timescale') {
          const s = untilEnd().join(''), m = /^(\d+)\s*(s|ms|us|ns|ps|fs)$/i.exec(s);
          if (m) { unit = +m[1] * { s: 1, ms: 1e-3, us: 1e-6, ns: 1e-9, ps: 1e-12, fs: 1e-15 }[m[2].toLowerCase()]; unitText = m[1] + ' ' + m[2]; }
        } else if (tok === '$enddefinitions') { untilEnd(); defs = false; }
        else if (tok[0] === '$') untilEnd();  // $date, $version, $comment and others
        else if (tok[0] === '#') { defs = false; re.lastIndex -= tok.length; }  // a file with no $enddefinitions
        continue;
      }
      const c = tok[0];
      if (c === '#') { const x = Number(tok.slice(1)); if (isFinite(x)) { t = x; if (x > end) end = x; if (x < minT) minT = x; } }
      else if (c === 'b' || c === 'B') { const id = next(); if (id !== null) put(id, tok.slice(1).toLowerCase()); }
      else if (c === 'r' || c === 'R') { const id = next(); if (id !== null) put(id, 'r' + tok.slice(1)); }
      else if (c === 's' || c === 'S') { const id = next(); if (id !== null) put(id, 's' + tok.slice(1)); }
      else if (c === '$') { if (tok === '$comment') untilEnd(); }  // $dumpvars, $dumpall, $dumpon, $dumpoff, $end
      else if ('01xzXZuUwWlLhH-'.includes(c)) put(tok.slice(1), c.toLowerCase());
      if (++i % 2000000 === 0) { /* a long file: nothing to do, the loop keeps going */ }
    }
    if (!vars.length) throw new Error('it has no $var declarations, so it is not a VCD file.');
    return { vars, sigs, end, start: isFinite(minT) ? minT : 0, unit, unitText, scopes: scopes.size };
  }

  /* ---------------- values and times ---------------- */
  const at = (s, t) => { let lo = 0, hi = s.t.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (s.t[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
  const valAt = (v, t) => { const s = D.sigs.get(v.id), k = at(s, t); return k < 0 ? null : s.v[k]; };
  function fmt(v, raw) {
    if (raw == null) return '';
    if (raw[0] === 'r') { const x = Number(raw.slice(1)); return isFinite(x) ? String(+x.toPrecision(8)) : raw.slice(1); }
    if (raw[0] === 's') return raw.slice(1);
    if (v.w === 1 && raw.length === 1) return raw;
    let b = raw;
    if (b.length < v.w) b = (b[0] === 'x' || b[0] === 'z' ? b[0] : '0').repeat(v.w - b.length) + b;  // left extension as VCD defines it
    if (/[^01]/.test(b)) {
      if (V.radix === 'bin') return b;
      let out = '';  // hex digit is x or z when all 4 bits are, X or Z when some are
      for (let i = b.length; i > 0; i -= 4) {
        const nib = b.slice(Math.max(0, i - 4), i);
        out = (/^[01]+$/.test(nib) ? parseInt(nib, 2).toString(16) : /^x+$/.test(nib) ? 'x' : /^z+$/.test(nib) ? 'z' : /x/.test(nib) ? 'X' : /z/.test(nib) ? 'Z' : '?') + out;
      }
      return out;
    }
    const big = BigInt('0b' + b);
    if (V.radix === 'bin') return b;
    if (V.radix === 'udec') return big.toString();
    if (V.radix === 'sdec' || (V.radix === 'auto' && /^(integer|int|shortint|longint)$/.test(v.type))) return (b[0] === '1' && b.length > 1 ? big - (1n << BigInt(b.length)) : big).toString();
    if (V.radix === 'ascii') { let s = ''; for (let i = b.length; i > 0; i -= 8) { const c = parseInt(b.slice(Math.max(0, i - 8), i), 2); s = (c >= 32 && c < 127 ? String.fromCharCode(c) : '.') + s; } return s; }
    return big.toString(16);
  }
  const bad = raw => raw == null ? 0 : raw[0] === 'r' || raw[0] === 's' ? 0 : /x|u|w|-/.test(raw) ? 1 : /z/.test(raw) ? 2 : 0;
  function tfmt(ticks) {
    const s = ticks * D.unit, a = Math.abs(s);
    const [d, u] = a === 0 ? [D.unit, D.unitText.split(' ')[1]] : a >= 1 ? [1, 's'] : a >= 1e-3 ? [1e-3, 'ms'] : a >= 1e-6 ? [1e-6, 'us'] : a >= 1e-9 ? [1e-9, 'ns'] : a >= 1e-12 ? [1e-12, 'ps'] : [1e-15, 'fs'];
    return +(s / d).toPrecision(6) + ' ' + u;
  }

  /* ---------------- drawing ---------------- */
  const cv = $('wave'), ctx = cv.getContext('2d');
  let C = {};
  function colors() { const s = getComputedStyle(document.documentElement), g = n => s.getPropertyValue(n).trim(); C = { fg: g('--fg'), mut: g('--mut'), line: g('--line'), panel: g('--panel'), bg: g('--bg'), sel: g('--sel'), wave: '#2fa14a', bus: g('--acc'), x: '#e5484d', z: '#d6a20b', cur: g('--cur') }; }
  const waveW = () => cv.clientWidth - NAMEW - VALW;
  const xOf = t => NAMEW + VALW + (t - V.t0) * V.ppt;
  const tOf = x => V.t0 + (x - NAMEW - VALW) / V.ppt;
  const visRows = () => Math.max(1, Math.floor((cv.clientHeight - RULER) / ROW));

  function size() {
    const box = $('wavebox'), w = Math.max(500, box.clientWidth), h = Math.min(640, RULER + Math.max(4, V.rows.length) * ROW + 4), dpr = devicePixelRatio || 1;
    cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function step(span) { const p = Math.pow(10, Math.floor(Math.log10(span))); return [1, 2, 5, 10].map(m => m * p).find(s => s >= span) || 10 * p; }

  function draw() {
    if (!D) return;
    colors();
    const W = cv.clientWidth, H = cv.clientHeight, ww = waveW(), t1 = tOf(W);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.panel; ctx.fillRect(0, 0, NAMEW + VALW, H); ctx.fillRect(0, 0, W, RULER);
    // ruler
    const st = step(90 / V.ppt);
    ctx.strokeStyle = C.line; ctx.fillStyle = C.mut; ctx.lineWidth = 1;
    for (let t = Math.ceil(V.t0 / st) * st; t <= t1; t += st) {
      const x = Math.round(xOf(t)) + .5;
      ctx.beginPath(); ctx.moveTo(x, RULER - 6); ctx.lineTo(x, H); ctx.globalAlpha = .45; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillText(tfmt(t), x + 3, RULER / 2);
    }
    ctx.fillStyle = C.mut; ctx.fillText('Signal', 8, RULER / 2); ctx.fillText('Value', NAMEW + 8, RULER / 2);
    const n = visRows();
    V.row0 = Math.max(0, Math.min(V.row0, Math.max(0, V.rows.length - n)));
    for (let r = 0; r < n && V.row0 + r < V.rows.length; r++) {
      const v = D.vars[V.rows[V.row0 + r]], y = RULER + r * ROW, mid = y + ROW / 2, s = D.sigs.get(v.id);
      if (V.row0 + r === V.sel) { ctx.fillStyle = C.sel; ctx.fillRect(0, y, W, ROW); }
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(0, y + ROW - .5); ctx.lineTo(W, y + ROW - .5); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(0, y, NAMEW - 6, ROW); ctx.clip();
      ctx.fillStyle = C.fg; ctx.fillText(v.label + (v.w > 1 && !/\[/.test(v.name) ? ' [' + (v.w - 1) + ':0]' : ''), 8, mid); ctx.restore();
      const cv0 = V.cursor == null ? null : valAt(v, V.cursor);
      ctx.save(); ctx.beginPath(); ctx.rect(NAMEW, y, VALW - 6, ROW); ctx.clip();
      ctx.fillStyle = [C.fg, C.x, C.z][bad(cv0)]; ctx.fillText(fmt(v, cv0), NAMEW + 8, mid); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(NAMEW + VALW, y, ww, ROW); ctx.clip();
      let k = Math.max(0, at(s, V.t0));
      const hi = mid - 7, lo = mid + 7;
      let lastPx = -1, dense = -1;
      for (; k < s.t.length; k++) {
        const ta = Math.max(s.t[k], V.t0), tb = k + 1 < s.t.length ? s.t[k + 1] : Math.max(D.end, t1), raw = s.v[k];
        if (s.t[k] > t1) break;
        if (tb < V.t0) continue;
        const xa = xOf(ta), xb = Math.min(xOf(tb), W + 2), b = bad(raw), col = b === 1 ? C.x : b === 2 ? C.z : v.w === 1 && raw.length === 1 ? C.wave : C.bus;
        if (xb - xa < 1.5 && k + 1 < s.t.length) {  // many changes in one pixel: draw a filled block
          if (dense < 0) dense = xa;
          lastPx = xb; continue;
        }
        if (dense >= 0) { ctx.fillStyle = C.mut; ctx.globalAlpha = .6; ctx.fillRect(dense, hi, Math.max(1, xa - dense), lo - hi); ctx.globalAlpha = 1; dense = -1; }
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        if (v.w === 1 && raw.length === 1 && raw !== 'r') {
          const y1 = raw === '1' || raw === 'h' ? hi : raw === '0' || raw === 'l' ? lo : mid;
          ctx.beginPath();
          if (k > 0 && s.t[k] >= V.t0) { ctx.moveTo(xa, hi); ctx.lineTo(xa, lo); }
          ctx.moveTo(xa, y1); ctx.lineTo(xb, y1); ctx.stroke();
          if (b) { ctx.fillStyle = col; ctx.globalAlpha = .18; ctx.fillRect(xa, hi, xb - xa, lo - hi); ctx.globalAlpha = 1; }
        } else {
          const e = Math.min(3, (xb - xa) / 2);
          ctx.beginPath(); ctx.moveTo(xa, mid); ctx.lineTo(xa + e, hi); ctx.lineTo(xb - e, hi); ctx.lineTo(xb, mid); ctx.lineTo(xb - e, lo); ctx.lineTo(xa + e, lo); ctx.closePath(); ctx.stroke();
          if (b) { ctx.fillStyle = col; ctx.globalAlpha = .18; ctx.fill(); ctx.globalAlpha = 1; }
          const label = fmt(v, raw), room = xb - xa - 10;
          if (room > 14) {
            ctx.fillStyle = C.fg;
            let txt = label;
            if (ctx.measureText(txt).width > room) { while (txt.length > 1 && ctx.measureText(txt + '..').width > room) txt = txt.slice(0, -1); txt += '..'; }
            if (ctx.measureText(txt).width <= room) ctx.fillText(txt, Math.max(xa, NAMEW + VALW) + 5, mid);
          }
        }
        lastPx = xb;
      }
      if (dense >= 0) { ctx.fillStyle = C.mut; ctx.globalAlpha = .6; ctx.fillRect(dense, hi, Math.max(1, lastPx - dense), lo - hi); ctx.globalAlpha = 1; }
      ctx.restore();
    }
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(NAMEW - .5, 0); ctx.lineTo(NAMEW - .5, H); ctx.moveTo(NAMEW + VALW - .5, 0); ctx.lineTo(NAMEW + VALW - .5, H); ctx.stroke();
    const mark = (t, col, label) => { if (t == null) return; const x = Math.round(xOf(t)) + .5; if (x < NAMEW + VALW || x > W) return; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); if (label) { ctx.fillStyle = col; ctx.fillText(label, x + 3, 8); } };
    mark(V.A, '#a35ad6', 'A'); mark(V.B, '#e08a1e', 'B'); mark(V.cursor, C.cur, '');
    $('tinfo').textContent = 'View ' + tfmt(V.t0) + ' to ' + tfmt(t1) + (V.cursor != null ? ', cursor ' + tfmt(V.cursor) : '') + (V.A != null && V.B != null ? ', B - A = ' + tfmt(V.B - V.A) : '') +
      (V.rows.length > n ? ', rows ' + (V.row0 + 1) + ' to ' + Math.min(V.rows.length, V.row0 + n) + ' of ' + V.rows.length + ' (wheel scrolls)' : '');
  }

  function fit() { const span = Math.max(1, D.end - D.start); V.ppt = waveW() / span; V.t0 = D.start; draw(); }
  function zoom(f, x) { const t = tOf(x == null ? NAMEW + VALW + waveW() / 2 : x); V.ppt = Math.max(1e-12, Math.min(V.ppt * f, 200)); V.t0 = t - (x == null ? waveW() / 2 : x - NAMEW - VALW) / V.ppt; clampT(); draw(); }
  function clampT() { const span = waveW() / V.ppt; V.t0 = Math.max(D.start - span * .9, Math.min(V.t0, D.end - span * .1)); }

  /* ---------------- signal tree ---------------- */
  function tree() {
    const q = $('sq').value.trim().toLowerCase().split(/\s+/).filter(Boolean), on = new Set(V.rows);
    const match = D.vars.filter(v => q.every(w => (v.scope + '.' + v.name).toLowerCase().includes(w)));
    let html = '', last = null, n = 0;
    for (const v of match) {
      if (n++ >= TREEMAX) break;
      if (v.scope !== last) { last = v.scope; html += `<li class="sc"><button type="button" class="add" data-scope="${esc(v.scope)}" title="Add every signal of this scope">+</button> ${esc(v.scope || '(top)')}</li>`; }
      html += `<li><label><input type="checkbox" data-n="${v.n}"${on.has(v.n) ? ' checked' : ''}> ${esc(v.name)}</label> <span class="mut">${v.w > 1 ? v.w + ' bits' : ''} ${esc(v.type)}</span></li>`;
    }
    $('tree').innerHTML = html + (match.length > TREEMAX ? `<li class="mut">${match.length - TREEMAX} more. Type in the box to narrow the list.</li>` : '') || '<li class="mut">No signal matches.</li>';
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function setRows(rows) { V.rows = rows; V.sel = Math.min(V.sel, rows.length - 1); size(); draw(); $('rowsInfo').textContent = rows.length + ' of ' + D.vars.length + ' signals shown'; }

  /* ---------------- open ---------------- */
  self.zovoOpen = async file => {
    if (file.size > 1.5 * 1073741824) throw new Error('it is ' + self.zovoSize(file.size) + '. This page reads the whole file into the tab, so it opens files up to 1.5 GB. The VS Code extension reads bigger files without loading them.');
    const text = await file.text();
    D = parse(text);
    const seen = new Map(); for (const v of D.vars) seen.set(v.name, (seen.get(v.name) || 0) + 1);
    for (const v of D.vars) v.label = seen.get(v.name) > 1 && v.scope ? v.scope.split('.').pop() + '.' + v.name : v.name;  // names that repeat get their scope
    let changes = 0; for (const s of D.sigs.values()) changes += s.t.length;
    $('fmeta').textContent = self.zovoSize(file.size);
    const facts = [['Timescale', D.unitText], ['Ends at', tfmt(D.end)], ['Signals', D.vars.length.toLocaleString('en-US')], ['Scopes', String(D.scopes)], ['Value changes', changes.toLocaleString('en-US')]];
    $('stats').innerHTML = facts.map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`).join('');
    Object.assign(V, { row0: 0, cursor: null, A: null, B: null, sel: -1 });
    $('sq').value = '';
    setRows(D.vars.slice(0, FIRST).map(v => v.n));
    tree(); fit();
    return 'Opened ' + file.name + ': ' + D.vars.length.toLocaleString('en-US') + ' signals' + (D.vars.length > FIRST ? ', the first ' + FIRST + ' are shown, tick more in the list' : '') + '.';
  };

  /* ---------------- input ---------------- */
  $('tree').addEventListener('change', e => {
    const n = +e.target.dataset.n;
    if (isNaN(n)) return;
    setRows(e.target.checked ? V.rows.concat(n) : V.rows.filter(x => x !== n));
  });
  $('tree').addEventListener('click', e => {
    const b = e.target.closest('button[data-scope]');
    if (!b) return;
    const have = new Set(V.rows), add = D.vars.filter(v => v.scope === b.dataset.scope && !have.has(v.n)).map(v => v.n);
    setRows(V.rows.concat(add)); tree();
  });
  $('sq').addEventListener('input', () => D && tree());
  $('all').addEventListener('click', () => { if (D) { setRows(D.vars.map(v => v.n)); tree(); } });
  $('none').addEventListener('click', () => { if (D) { setRows([]); tree(); } });
  $('zin').addEventListener('click', () => D && zoom(2));
  $('zout').addEventListener('click', () => D && zoom(.5));
  $('fit').addEventListener('click', () => D && fit());
  $('radix').addEventListener('change', () => { V.radix = $('radix').value; draw(); });
  cv.addEventListener('wheel', e => {
    if (!D) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
    if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * .002), Math.max(NAMEW + VALW, x));
    else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { V.t0 += (e.deltaX || e.deltaY) / V.ppt; clampT(); draw(); }
    else { V.row0 += Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / ROW)); draw(); }
  }, { passive: false });
  let drag = null;
  cv.addEventListener('pointerdown', e => { if (!D) return; const r = cv.getBoundingClientRect(); drag = { x: e.clientX, t0: V.t0, moved: false, px: e.clientX - r.left, py: e.clientY - r.top }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 3) drag.moved = true;
    if (drag.moved && drag.px > NAMEW + VALW) { V.t0 = drag.t0 - dx / V.ppt; clampT(); draw(); }
  });
  cv.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.moved) return;
    if (d.py > RULER) V.sel = V.row0 + Math.floor((d.py - RULER) / ROW);
    if (d.px > NAMEW + VALW) V.cursor = Math.round(tOf(d.px));
    draw(); cv.focus();
  });
  cv.addEventListener('keydown', e => {
    if (!D) return;
    const k = e.key;
    if (k === 'a' || k === 'A') V.A = V.cursor;
    else if (k === 'b' || k === 'B') V.B = V.cursor;
    else if (k === 'f' || k === 'F') return fit();
    else if (k === '+' || k === '=') return zoom(2);
    else if (k === '-') return zoom(.5);
    else if ((k === 'ArrowRight' || k === 'ArrowLeft' || k === 'n' || k === 'p') && V.sel >= 0 && V.sel < V.rows.length) {
      const s = D.sigs.get(D.vars[V.rows[V.sel]].id), c = V.cursor == null ? V.t0 : V.cursor, i = at(s, c);
      const nt = k === 'ArrowRight' || k === 'n' ? s.t[i + 1] : (s.t[i] === c ? s.t[i - 1] : s.t[i]);
      if (nt != null) { V.cursor = nt; const span = waveW() / V.ppt; if (nt < V.t0 || nt > V.t0 + span) V.t0 = nt - span / 2; }
    } else if (k === 'ArrowDown') V.sel = Math.min(V.rows.length - 1, V.sel + 1);
    else if (k === 'ArrowUp') V.sel = Math.max(0, V.sel - 1);
    else return;
    e.preventDefault(); draw();
  });
  addEventListener('resize', () => { if (D) { size(); draw(); } });
  addEventListener('zovo-theme', () => D && draw());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => D && draw());
})();
