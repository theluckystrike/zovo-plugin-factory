/* JSONL Viewer Online (TOOLCHK, wave18; first draft by HTOOL4). Plain JavaScript, no library, no request.
   Reads .jsonl, .ndjson and .jsonl.gz (the browser's own DecompressionStream) in this tab. One column per top-level
   key from the first 1,000 records, sort, find, bad lines, key stats, and the record as JSON or as a chat.
   Values from the file are written as text (escaped or textContent), never as HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = n => n.toLocaleString('en-US');
  const MAXGZ = 512 * 1048576, COLSFROM = 1000, PAGE = 500, CELL = 200;
  const S = { recs: [], bad: 0, cols: [], shown: [], limit: PAGE, sort: null, dir: 0, sel: -1, keys: null };

  const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'boolean' ? 'bool' : typeof v;

  async function readText(file) {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] !== 0x1f || head[1] !== 0x8b) return { text: await file.text(), cut: false };
    if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot unpack .gz files. Unpack it first, or use a current Chrome, Edge, Firefox or Safari.');
    const rd = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader(), parts = [];
    let n = 0, cut = false;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      parts.push(value); n += value.length;
      if (n >= MAXGZ) { cut = true; rd.cancel().catch(() => {}); break; }
    }
    let text = new TextDecoder().decode(await new Blob(parts).arrayBuffer());
    if (cut) text = text.slice(0, text.lastIndexOf('\n') + 1);
    return { text, cut, packed: n };
  }

  function parse(text) {
    const recs = [];
    let bad = 0, line = 0, pos = 0;
    if (text.charCodeAt(0) === 0xfeff) pos = 1;
    while (pos <= text.length) {
      let end = text.indexOf('\n', pos);
      if (end < 0) end = text.length;
      line++;
      let raw = text.slice(pos, end);
      if (raw.endsWith('\r')) raw = raw.slice(0, -1);
      pos = end + 1;
      if (!raw.trim()) { if (end === text.length) break; continue; }
      try { recs.push({ line, raw, v: JSON.parse(raw) }); }
      catch (e) { recs.push({ line, raw, err: e.message.replace(/^JSON\.parse: /, '') }); bad++; }
    }
    return { recs, bad };
  }

  function columns(recs) {
    const cols = new Map();
    let n = 0;
    for (const r of recs) {
      if (r.err) continue;
      if (++n > COLSFROM) break;
      const v = r.v;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const k of Object.keys(v)) {
          if (!cols.has(k)) cols.set(k, { k, types: new Set(), fill: 0 });
          const c = cols.get(k); c.fill++; c.types.add(typeOf(v[k]));
        }
      } else {
        if (!cols.has('')) cols.set('', { k: '', types: new Set(), fill: 0, value: true });
        const c = cols.get(''); c.fill++; c.types.add(typeOf(v));
      }
    }
    return { list: [...cols.values()].map(c => { const t = [...c.types].filter(x => x !== 'null'); c.type = t.length === 1 ? t[0] : t.length === 2 && t.includes('int') && t.includes('float') ? 'float' : t.length ? 'mixed' : 'null'; return c; }), sampled: Math.min(n, COLSFROM) };
  }

  const getv = (r, c) => c.value ? r.v : (r.v && typeof r.v === 'object' && !Array.isArray(r.v) && Object.prototype.hasOwnProperty.call(r.v, c.k) ? r.v[c.k] : undefined);
  function cell(v) {
    if (v === undefined) return '<td class="t-miss"></td>';
    const t = typeOf(v);
    let s = t === 'object' || t === 'array' ? JSON.stringify(v) : String(v);
    if (s.length > CELL) s = s.slice(0, CELL) + '...';
    const cls = t === 'int' || t === 'float' ? 't-number n' : t === 'bool' ? 't-boolean' : t === 'null' ? 't-null' : '';
    return `<td class="${cls}">${esc(s)}</td>`;
  }

  function cmp(a, b) {
    const ta = a === undefined ? 3 : a === null ? 2 : typeof a === 'number' ? 0 : 1, tb = b === undefined ? 3 : b === null ? 2 : typeof b === 'number' ? 0 : 1;
    if (ta !== tb) return ta - tb;
    if (ta === 0) return a - b;
    if (ta === 1) { const x = typeof a === 'string' ? a : JSON.stringify(a), y = typeof b === 'string' ? b : JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; }
    return 0;
  }

  function view() {
    const q = $('q').value.trim().toLowerCase(), onlyBad = $('onlyBad').checked;
    let rows = S.recs;
    if (onlyBad) rows = rows.filter(r => r.err);
    if (q) rows = rows.filter(r => r.raw.toLowerCase().includes(q));
    if (S.sort && S.dir) {
      const c = S.sort, d = S.dir;
      rows = rows.slice().sort((a, b) => {
        const va = a.err ? undefined : getv(a, c), vb = b.err ? undefined : getv(b, c);
        if (va === undefined && vb !== undefined) return 1;   // missing values go last either way
        if (vb === undefined && va !== undefined) return -1;
        return cmp(va, vb) * d || a.line - b.line;
      });
    }
    S.shown = rows; S.limit = PAGE;
    draw();
    $('count').textContent = (q || onlyBad ? int(rows.length) + ' of ' : '') + int(S.recs.length) + ' lines';
  }

  function head() {
    $('recs').tHead.rows[0].innerHTML = '<th data-c="-1">Line</th>' + S.cols.map((c, i) =>
      `<th data-c="${i}" title="${esc(c.value ? 'The value of each line' : c.k)}">${esc(c.value ? 'value' : c.k)}${S.sort === c ? (S.dir > 0 ? ' &#9650;' : ' &#9660;') : ''}<small>${esc(c.type)}, ${int(c.fill)} of ${int(S.colsFrom)}</small></th>`).join('');
  }

  function draw() {
    head();
    const part = S.shown.slice(0, S.limit), span = S.cols.length;
    $('recs').tBodies[0].innerHTML = part.map((r, n) => r.err
      ? `<tr class="bad${r.line === S.sel ? ' on' : ''}" data-n="${n}"><td class="ix">${r.line}</td><td colspan="${span}">Not valid JSON: ${esc(r.err)}. ${esc(r.raw.slice(0, CELL))}</td></tr>`
      : `<tr data-n="${n}"${r.line === S.sel ? ' class="on"' : ''}><td class="ix">${r.line}</td>${S.cols.map(c => cell(getv(r, c))).join('')}</tr>`).join('');
    $('more').hidden = S.shown.length <= S.limit;
    $('more').textContent = `Show ${int(Math.min(PAGE, S.shown.length - S.limit))} more rows (${int(S.limit)} of ${int(S.shown.length)} shown)`;
  }

  function stats() {
    const keys = new Map();
    for (const r of S.recs) {
      if (r.err || !r.v || typeof r.v !== 'object' || Array.isArray(r.v)) continue;
      for (const [k, v] of Object.entries(r.v)) {
        if (!keys.has(k)) keys.set(k, { k, n: 0, types: new Map(), vals: new Map(), over: false });
        const e = keys.get(k); e.n++;
        const t = typeOf(v); e.types.set(t, (e.types.get(t) || 0) + 1);
        if (!e.over) {
          let s = v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v);
          if (s.length > 120) s = s.slice(0, 120) + '...';
          e.vals.set(s, (e.vals.get(s) || 0) + 1);
          if (e.vals.size > 10000) e.over = true;
        }
      }
    }
    S.keys = [...keys.values()];
    $('keys').tBodies[0].innerHTML = S.keys.map((e, i) => `<tr data-i="${i}"><td class="mono">${esc(e.k)}</td><td class="small">${esc([...e.types].sort((a, b) => b[1] - a[1]).map(([t, n]) => t + ' ' + int(n)).join(', '))}</td><td class="n">${int(e.n)}</td><td class="n">${e.over ? 'over 10,000' : int(e.vals.size)}</td></tr>`).join('') || '<tr><td colspan="4" class="mut">No object records.</td></tr>';
  }

  function values(i) {
    const e = S.keys[i];
    if (!e) return;
    $('valTitle').textContent = e.k + (e.over ? ' (the first 10,000 distinct values)' : '');
    const top = [...e.vals].sort((a, b) => b[1] - a[1]).slice(0, 100), max = top.length ? top[0][1] : 1;
    $('vals').tBodies[0].innerHTML = top.map(([v, n]) => `<tr><td class="mono">${esc(v)}</td><td class="n"><span class="bar"></span>${int(n)}</td></tr>`).join('');
    $('vals').querySelectorAll('.bar').forEach((b, j) => { b.style.width = Math.max(1, top[j][1] / max * 80) + 'px'; });
  }

  function chatOf(v) {
    if (!v || typeof v !== 'object') return null;
    const flat = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(p => typeof p === 'string' ? p : p && (p.text || (p.type ? '[' + p.type + ']' : JSON.stringify(p)))).join('\n') : c == null ? '' : JSON.stringify(c);
    if (Array.isArray(v.messages)) return v.messages.map(m => ({ role: String(m && m.role || '?'), text: flat(m && m.content), tools: m && m.tool_calls }));
    if (Array.isArray(v.conversations)) return v.conversations.map(m => ({ role: String(m && (m.from || m.role) || '?'), text: flat(m && (m.value || m.content)) }));
    if (Array.isArray(v.contents)) return v.contents.map(m => ({ role: String(m && m.role || '?'), text: flat(m && m.parts) }));
    if ('prompt' in v && 'completion' in v) return [{ role: 'prompt', text: flat(v.prompt) }, { role: 'completion', text: flat(v.completion) }];
    return null;
  }

  function open(n) {
    const r = S.shown[n];
    if (!r) return;
    S.sel = r.line; S.selN = n;
    document.querySelectorAll('#recs tr.on').forEach(x => x.classList.remove('on'));
    const tr = document.querySelector(`#recs tr[data-n="${n}"]`);
    if (tr) { tr.classList.add('on'); tr.scrollIntoView({ block: 'nearest' }); }
    $('rec').hidden = false;
    $('recTitle').textContent = 'Line ' + r.line + (r.err ? ', not valid JSON' : '');
    $('recJson').textContent = r.err ? r.err + '\n\n' + r.raw.slice(0, 1048576) : JSON.stringify(r.v, null, 2).slice(0, 2097152);
    const chat = r.err ? null : chatOf(r.v), box = $('chat');
    box.hidden = !chat; box.textContent = '';
    if (chat) for (const m of chat) {
      const d = document.createElement('div'), b = document.createElement('b');
      d.className = 'msg ' + m.role.replace(/[^a-z]/gi, '').toLowerCase(); b.textContent = m.role;
      d.append(b, m.text || '');
      if (Array.isArray(m.tools)) for (const t of m.tools) {
        const c = document.createElement('code');
        c.textContent = 'Tool call: ' + (t && t.function ? t.function.name + ' ' + t.function.arguments : JSON.stringify(t));
        d.append(c);
      }
      box.append(d);
    }
  }

  self.zovoOpen = async file => {
    const { text, cut, packed } = await readText(file);
    const p = parse(text);
    if (!p.recs.length) throw new Error('the file has no lines.');
    if (p.bad === p.recs.length && p.recs.length > 0) throw new Error('none of its ' + int(p.recs.length) + ' lines is valid JSON, so it is not a JSON Lines file.');
    const c = columns(p.recs);
    Object.assign(S, { recs: p.recs, bad: p.bad, cols: c.list, colsFrom: c.sampled, sort: null, dir: 0, sel: -1 });
    $('q').value = ''; $('onlyBad').checked = false; $('rec').hidden = true;
    $('fmeta').textContent = self.zovoSize(file.size) + (packed ? ', ' + self.zovoSize(packed) + ' unpacked' : '');
    const tiles = [['Lines', int(p.recs.length)], ['Valid JSON', int(p.recs.length - p.bad)], ['Bad lines', int(p.bad)], ['Columns', int(c.list.length)]];
    $('stats').innerHTML = tiles.map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
    stats();
    $('valTitle').textContent = 'Click a key to see its values'; $('vals').tBodies[0].innerHTML = '';
    view();
    const notes = [];
    if (p.bad) notes.push(int(p.bad) + ' bad line' + (p.bad > 1 ? 's' : '') + ' (tick Only bad lines to see them)');
    if (cut) notes.push('the file unpacks to more than 512 MB, so the first 512 MB is shown');
    return 'Opened ' + file.name + ': ' + int(p.recs.length) + ' lines' + (notes.length ? ', ' + notes.join(', ') : '') + '.';
  };

  $('q').addEventListener('input', view);
  $('onlyBad').addEventListener('change', view);
  $('more').addEventListener('click', () => { S.limit += PAGE; draw(); });
  $('recs').tHead.addEventListener('click', e => {
    const th = e.target.closest('th[data-c]');
    if (!th) return;
    const c = +th.dataset.c < 0 ? null : S.cols[+th.dataset.c];
    if (!c) { S.sort = null; S.dir = 0; }
    else if (S.sort !== c) { S.sort = c; S.dir = 1; }
    else if (S.dir === 1) S.dir = -1;
    else { S.sort = null; S.dir = 0; }
    view();
  });
  $('recs').tBodies[0].addEventListener('click', e => { const tr = e.target.closest('tr[data-n]'); if (tr) open(+tr.dataset.n); });
  $('prevRec').addEventListener('click', () => open(Math.max(0, S.selN - 1)));
  $('nextRec').addEventListener('click', () => { if (S.selN + 1 >= S.limit && S.selN + 1 < S.shown.length) { S.limit += PAGE; draw(); } open(Math.min(S.shown.length - 1, S.selN + 1)); });
  $('copyRec').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('recJson').textContent); self.zovoMsg('Record copied as JSON.'); }
    catch (e) { self.zovoMsg('The browser did not allow the copy. Select the JSON and copy it by hand.', true); }
  });
  $('keysBtn').addEventListener('click', () => { const b = $('keysBox'); b.hidden = !b.hidden; $('keysBtn').setAttribute('aria-expanded', String(!b.hidden)); });
  $('keys').tBodies[0].addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) values(+tr.dataset.i); });
  addEventListener('keydown', e => {
    if ($('rec').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); $('nextRec').click(); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); $('prevRec').click(); }
  });
})();
