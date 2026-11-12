/* Zovo DBC Viewer Online (TOOLCHK2, wave18). Reads a CAN .dbc file in this tab and shows its messages, signals,
   bit layout, value tables, comments and attributes, checks it, and decodes one frame you type. Nothing is sent
   anywhere (CSP connect-src 'none'); file text is shown with textContent only. Rewritten from the HTOOL9 draft. */
(function () {
  'use strict';
  const { $, el, say, int, plural, table, kv, stats, wire, shown, done } = self.Z;
  const SEMI = new Set(['CM_', 'VAL_', 'VAL_TABLE_', 'BA_DEF_', 'BA_', 'BA_DEF_DEF_', 'BA_DEF_REL_', 'BA_REL_', 'BA_DEF_DEF_REL_', 'SIG_VALTYPE_',
    'SG_MUL_VAL_', 'BO_TX_BU_', 'SIG_GROUP_', 'EV_', 'ENVVAR_DATA_', 'SIG_TYPE_REF_', 'SGTYPE_', 'SGTYPE_VAL_', 'CAT_DEF_', 'CAT_', 'FILTER',
    'BA_DEF_SGTYPE_', 'BA_SGTYPE_', 'EV_DATA_', 'BA_DEF_REL_', 'SIG_TYPE_REF_']);
  let db = null, cur = null, muxSel = null;

  /* parsing */
  function tokens(s) {  // quoted strings keep their text, other tokens split on space, ':' ',' and '|'
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') { let j = i + 1, v = ''; while (j < s.length && s[j] !== '"') { if (s[j] === '\\' && j + 1 < s.length) { v += s[j + 1]; j += 2; } else v += s[j++]; } out.push({ s: v }); i = j + 1; continue; }
      if (c === ':' || c === ',' || c === ';') { out.push(c); i++; continue; }
      let j = i; while (j < s.length && !/[\s":,;]/.test(s[j])) j++;
      out.push(s.slice(i, j)); i = j;
    }
    return out;
  }
  const str = t => t && typeof t === 'object' ? t.s : t;
  function canId(raw) {
    const n = Number(raw);
    if (n === 0xC0000000) return { id: 0, ext: false, pseudo: true };
    return n >= 0x80000000 ? { id: n - 0x80000000 >>> 0 & 0x1FFFFFFF, ext: true } : { id: n, ext: false };
  }
  function parse(text) {
    const d = { version: '', nodes: [], msgs: [], byRaw: new Map(), tables: new Map(), envComments: [], nodeComments: new Map(), comment: '', attrDefs: new Map(),
      attrDefaults: new Map(), nodeAttrs: new Map(), dbAttrs: [], problems: [], skipped: new Map(), lines: 0 };
    const n = text.length; let i = 0, line = 1, lastMsg = null;
    const bad = (ln, m) => d.problems.push({ line: ln, sev: 'error', text: m });
    while (i < n) {
      // start of a line
      let j = text.indexOf('\n', i); if (j === -1) j = n;
      const raw = text.slice(i, j), ln = line;
      const L = raw.trim();
      if (!L || L.startsWith('//')) { i = j + 1; line++; continue; }
      const kw = (L.match(/^[A-Za-z_][A-Za-z0-9_]*/) || [''])[0];
      if (SEMI.has(kw)) {  // read up to the ';' that is not inside a string, across lines
        let k = i + raw.indexOf(kw) + kw.length, q = false;
        for (; k < n; k++) { const c = text[k]; if (c === '\\' && q) { k++; continue; } if (c === '"') q = !q; else if (c === ';' && !q) break; if (c === '\n') line++; }
        const body = text.slice(i + raw.indexOf(kw) + kw.length, k);
        try { stmt(d, kw, body, ln); } catch (e) { bad(ln, `${kw}: ${e.message}`); }
        i = k + 1;
        const nl = text.indexOf('\n', i); const rest = text.slice(i, nl === -1 ? n : nl);
        if (!rest.trim()) { i = nl === -1 ? n : nl + 1; line++; }
        continue;
      }
      i = j + 1; line++;
      if (kw === 'NS_') {  // the list of new symbols: indented lines
        while (i < n) { let e = text.indexOf('\n', i); if (e === -1) e = n; const r = text.slice(i, e); if (r.trim() && !/^\s/.test(r)) break; i = e + 1; line++; }
        continue;
      }
      try {
        if (kw === 'VERSION') d.version = (L.match(/"([^"]*)"/) || ['', ''])[1];
        else if (kw === 'BS_') { /* bit timing, obsolete */ }
        else if (kw === 'BU_') d.nodes = L.replace(/^BU_\s*:?/, '').trim().split(/\s+/).filter(Boolean);
        else if (kw === 'BO_') {
          const m = L.match(/^BO_\s+(\d+)\s+([A-Za-z0-9_]+)\s*:\s*(\d+)\s+(\S+)/);
          if (!m) { bad(ln, 'This BO_ line does not read as "BO_ <id> <name>: <length> <sender>".'); lastMsg = null; continue; }
          const c = canId(m[1]);
          lastMsg = { raw: Number(m[1]), id: c.id, ext: c.ext, pseudo: !!c.pseudo, name: m[2], dlc: Number(m[3]), sender: m[4], sigs: [], comment: '', attrs: new Map(), tx: [], line: ln, muxVals: [] };
          if (d.byRaw.has(lastMsg.raw)) d.problems.push({ line: ln, sev: 'error', text: `Message id ${hexId(lastMsg)} is used twice (${d.byRaw.get(lastMsg.raw).name} and ${lastMsg.name}).` });
          else d.byRaw.set(lastMsg.raw, lastMsg);
          d.msgs.push(lastMsg);
        } else if (kw === 'SG_') {
          const m = L.match(/^SG_\s+([A-Za-z0-9_]+)\s*(M|m\d+M?)?\s*:\s*(\d+)\s*\|\s*(\d+)\s*@\s*([01])\s*([+-])\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)\s*\[\s*([^|]*?)\s*\|\s*([^\]]*?)\s*\]\s*"((?:[^"\\]|\\.)*)"\s*(.*)$/);
          if (!m) { bad(ln, 'This SG_ line does not read as a signal.'); continue; }
          if (!lastMsg) { bad(ln, `Signal ${m[1]} comes before any BO_ message.`); continue; }
          const mux = m[2] || '';
          lastMsg.sigs.push({ name: m[1], muxer: mux === 'M' || /M$/.test(mux) && mux !== 'M' ? true : false, muxVal: /^m(\d+)/.test(mux) ? Number(mux.match(/^m(\d+)/)[1]) : null, muxRaw: mux,
            start: Number(m[3]), len: Number(m[4]), intel: m[5] === '1', signed: m[6] === '-', factor: Number(m[7]), offset: Number(m[8]),
            min: Number(m[9]), max: Number(m[10]), unit: m[11], recv: m[12].split(/[\s,]+/).filter(x => x && x !== 'Vector__XXX'), comment: '', values: null, vtype: 0, line: ln, attrs: new Map() });
        } else d.skipped.set(kw, (d.skipped.get(kw) || 0) + 1);
      } catch (e) { bad(ln, e.message); }
    }
    d.lines = line;
    return d;
  }
  function findSig(d, rawId, name) { const m = d.byRaw.get(Number(rawId)); return m ? [m, m.sigs.find(s => s.name === name)] : [null, null]; }
  function pairs(t, from) { const out = []; for (let k = from; k + 1 < t.length; k += 2) { if (t[k] === ';') break; out.push([Number(t[k]), str(t[k + 1])]); } return out; }
  function stmt(d, kw, body, ln) {
    const t = tokens(body);
    if (kw === 'CM_') {
      if (typeof t[0] === 'object') { d.comment = t[0].s; return; }
      if (t[0] === 'BU_') d.nodeComments.set(t[1], str(t[2]));
      else if (t[0] === 'BO_') { const m = d.byRaw.get(Number(t[1])); if (m) m.comment = str(t[2]); else d.problems.push({ line: ln, sev: 'warning', text: `A comment is for message ${t[1]}, which the file does not define.` }); }
      else if (t[0] === 'SG_') { const [m, s] = findSig(d, t[1], t[2]); if (s) s.comment = str(t[3]); else d.problems.push({ line: ln, sev: 'warning', text: `A comment is for signal ${t[2]} of message ${t[1]}, which the file does not define.` }); }
      else if (t[0] === 'EV_') d.envComments.push([t[1], str(t[2])]);
    } else if (kw === 'VAL_TABLE_') d.tables.set(t[0], pairs(t, 1));
    else if (kw === 'VAL_') {
      if (t.length >= 2 && /^\d+$/.test(t[0]) && typeof t[1] === 'string' && !(typeof t[2] === 'object' && t.length === 3)) {
        const [m, s] = findSig(d, t[0], t[1]);
        if (s) s.values = pairs(t, 2);
        else d.problems.push({ line: ln, sev: 'warning', text: `Value labels are for signal ${t[1]} of message ${t[0]}, which the file does not define.` });
      }
    } else if (kw === 'BA_DEF_') {
      let k = 0, obj = '';
      if (['BU_', 'BO_', 'SG_', 'EV_'].includes(t[0])) { obj = t[0]; k = 1; }
      d.attrDefs.set(str(t[k]), { obj, type: t[k + 1], rest: t.slice(k + 2).map(str).filter(x => x !== ',' && x !== ';'), line: ln });
    } else if (kw === 'BA_DEF_DEF_') d.attrDefaults.set(str(t[0]), str(t[1]));
    else if (kw === 'BA_') {
      const name = str(t[0]);
      if (t[1] === 'BO_') { const m = d.byRaw.get(Number(t[2])); if (m) m.attrs.set(name, str(t[3])); }
      else if (t[1] === 'SG_') { const [, s] = findSig(d, t[2], t[3]); if (s) s.attrs.set(name, str(t[4])); }
      else if (t[1] === 'BU_') { if (!d.nodeAttrs.has(t[2])) d.nodeAttrs.set(t[2], new Map()); d.nodeAttrs.get(t[2]).set(name, str(t[3])); }
      else if (t[1] !== 'EV_') d.dbAttrs.push([name, str(t[1])]);
    } else if (kw === 'SIG_VALTYPE_') { const [, s] = findSig(d, t[0], t[1]); const v = t.filter(x => /^\d$/.test(x)).pop(); if (s) s.vtype = Number(v) || 0; }
    else if (kw === 'BO_TX_BU_') { const m = d.byRaw.get(Number(t[0])); if (m) m.tx = t.slice(2).filter(x => x !== ',' && x !== ';'); }
    else if (kw === 'SG_MUL_VAL_') { const m = d.byRaw.get(Number(t[0])); if (m) m.muxVals.push(t.map(str).join(' ').replace(/ , /g, ', ')); }
    else d.skipped.set(kw, (d.skipped.get(kw) || 0) + 1);
  }

  /* bits */
  const hexId = m => m.pseudo ? 'none (independent signals)' : '0x' + m.id.toString(16).toUpperCase().padStart(m.ext ? 8 : 3, '0') + (m.ext ? ' (extended)' : '');
  function bitsOf(s) {  // frame bit numbers (byte*8 + bit) from MSB to LSB
    const out = [];
    if (s.intel) for (let k = s.len - 1; k >= 0; k--) out.push(s.start + k);
    else { let b = s.start; for (let k = 0; k < s.len; k++) { out.push(b); b = b % 8 === 0 ? b + 15 : b - 1; } }
    return out;
  }
  function attrOf(d, m, name) { return m.attrs.has(name) ? m.attrs.get(name) : d.attrDefaults.get(name); }
  function frameFormat(d, m) {
    const v = attrOf(d, m, 'VFrameFormat'); const def = d.attrDefs.get('VFrameFormat');
    if (v == null) return m.dlc > 8 ? 'CAN FD' : '';
    const name = def && def.type === 'ENUM' && /^\d+$/.test(String(v)) ? def.rest[Number(v)] : v;
    return name || '';
  }
  function check(d) {
    for (const m of d.msgs) {
      if (m.dlc > 64) d.problems.push({ line: m.line, sev: 'error', text: `${m.name}: length ${m.dlc} is more than 64 bytes.` });
      const names = new Set();
      for (const s of m.sigs) {
        if (names.has(s.name)) d.problems.push({ line: s.line, sev: 'error', text: `${m.name}: the signal name ${s.name} is used twice.` });
        names.add(s.name);
        if (s.len < 1 || s.len > 64) d.problems.push({ line: s.line, sev: 'error', text: `${m.name}.${s.name}: length ${s.len} is not 1 to 64 bits.` });
        else if (bitsOf(s).some(b => b < 0 || b >= m.dlc * 8)) d.problems.push({ line: s.line, sev: 'error', text: `${m.name}.${s.name}: the signal runs past the ${m.dlc}-byte frame.` });
        if (s.min > s.max) d.problems.push({ line: s.line, sev: 'warning', text: `${m.name}.${s.name}: minimum ${s.min} is above maximum ${s.max}.` });
        if (s.vtype && s.len !== (s.vtype === 1 ? 32 : 64)) d.problems.push({ line: s.line, sev: 'error', text: `${m.name}.${s.name}: a ${s.vtype === 1 ? 'float' : 'double'} signal needs ${s.vtype === 1 ? 32 : 64} bits, not ${s.len}.` });
        if (!isFinite(s.factor) || s.factor === 0) d.problems.push({ line: s.line, sev: 'warning', text: `${m.name}.${s.name}: factor ${s.factor} is not usable.` });
      }
      // overlaps among signals that can be in the same frame
      const owner = new Map();
      for (const s of m.sigs) {
        if (s.len > 64) continue;
        for (const b of bitsOf(s)) {
          const o = owner.get(b) || [];
          for (const x of o) if (x !== s && !(x.muxVal != null && s.muxVal != null && x.muxVal !== s.muxVal)) {
            const key = [x.name, s.name].sort().join('|');
            if (!m._laps) m._laps = new Set();
            if (!m._laps.has(key)) { m._laps.add(key); d.problems.push({ line: s.line, sev: 'error', text: `${m.name}: ${x.name} and ${s.name} use the same bits.` }); }
          }
          o.push(s); owner.set(b, o);
        }
      }
      if (m.sigs.some(s => s.muxVal != null) && !m.sigs.some(s => s.muxer)) d.problems.push({ line: m.line, sev: 'error', text: `${m.name}: it has multiplexed signals but no multiplexer (M) signal.` });
    }
  }

  /* decode */
  function rawOf(s, bytes) {
    let v = 0n;
    for (const b of bitsOf(s)) v = (v << 1n) | BigInt((bytes[b >> 3] >> (b & 7)) & 1);
    return v;
  }
  function physOf(s, raw) {
    if (s.vtype === 1) { const dv = new DataView(new ArrayBuffer(4)); dv.setUint32(0, Number(raw)); return dv.getFloat32(0) * s.factor + s.offset; }
    if (s.vtype === 2) { const dv = new DataView(new ArrayBuffer(8)); dv.setBigUint64(0, raw); return dv.getFloat64(0) * s.factor + s.offset; }
    let r = raw;
    if (s.signed && s.len > 0 && (raw >> BigInt(s.len - 1)) & 1n) r = raw - (1n << BigInt(s.len));
    return Number(r) * s.factor + s.offset;
  }
  const fmt = x => Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(10)));

  /* view */
  function render(info) {
    const out = $('out'); out.textContent = '';
    const nSig = db.msgs.reduce((a, m) => a + m.sigs.length, 0);
    const errs = db.problems.filter(p => p.sev === 'error').length;
    out.append(stats([['Messages', int(db.msgs.length)], ['Signals', int(nSig)], ['Nodes', int(db.nodes.length)], ['Problems', db.problems.length ? int(db.problems.length) : 'none', errs ? 'bad' : '']]));
    const side = el('div', null, 'tcside'), det = el('div', null, 'det');
    const f = el('input', null, null, { type: 'search', placeholder: 'Filter messages and signals', 'aria-label': 'Filter messages and signals', autocomplete: 'off' });
    const wrap = el('div', null, 'tblwrap');
    side.append(f, wrap, el('p', 'Click a message to see its signals, bit layout and a frame decoder.', 'small mut'));
    out.append(el('div', null, 'tcgrid', null, [side, det]));
    function list() {
      const q = f.value.trim().toLowerCase();
      const ms = db.msgs.filter(m => !q || m.name.toLowerCase().includes(q) || hexId(m).toLowerCase().includes(q) || String(m.id) === q || m.sigs.some(s => s.name.toLowerCase().includes(q)));
      wrap.textContent = '';
      wrap.append(table(['ID', 'Message', 'Bytes', 'Signals'], ms.map(m => [m.pseudo ? '-' : '0x' + m.id.toString(16).toUpperCase() + (m.ext ? ' x' : ''), m.name, m.dlc, m.sigs.length]),
        { pick: (i, tr) => { [...tr.parentNode.children].forEach(r => r.classList.toggle('on', r === tr)); show(ms[i]); }, max: 10000 }));
      if (!ms.length) wrap.append(el('p', 'No message matches.', 'small mut'));
    }
    f.addEventListener('input', list); list();
    // the database part below the grid
    const more = el('div');
    if (db.problems.length) {
      more.append(el('h3', 'Checks'));
      const ul = el('ul', null, 'problems small');
      for (const p of db.problems.slice(0, 300)) ul.append(el('li', null, null, null, [el('span', p.sev === 'error' ? 'Error' : 'Warning', 'sev ' + (p.sev === 'error' ? 'warn' : 'mut')), document.createTextNode(` line ${p.line}: ${p.text}`)]));
      if (db.problems.length > 300) ul.append(el('li', `and ${int(db.problems.length - 300)} more`, 'mut'));
      more.append(ul);
    } else more.append(el('p', 'Checks: no overlapping bits, no signal past its frame, no duplicate ids or names.', 'small mut'));
    if (db.nodes.length) {
      more.append(el('h3', 'Nodes'));
      more.append(el('div', null, 'tblwrap short', null, [table(['Node', 'Sends', 'Receives', 'Comment'], db.nodes.map(nd => [nd, db.msgs.filter(m => m.sender === nd || m.tx.includes(nd)).map(m => m.name).join(', '),
        plural(db.msgs.reduce((a, m) => a + m.sigs.filter(s => s.recv.includes(nd)).length, 0), 'signal'), db.nodeComments.get(nd) || '']))]));
    }
    if (db.tables.size) {
      more.append(el('h3', 'Value tables'));
      more.append(el('div', null, 'tblwrap short', null, [table(['Table', 'Values'], [...db.tables].map(([k, v]) => [k, v.map(([a, b]) => `${a} = ${b}`).join(', ')]), { cls: '' })]));
    }
    if (db.attrDefs.size) {
      more.append(el('h3', 'Attribute definitions'));
      more.append(el('div', null, 'tblwrap short', null, [table(['Attribute', 'For', 'Type', 'Range or values', 'Default'], [...db.attrDefs].map(([k, v]) => [k, { BO_: 'messages', SG_: 'signals', BU_: 'nodes', EV_: 'env. variables', '': 'database' }[v.obj], v.type, v.rest.join(v.type === 'ENUM' ? ', ' : ' '), db.attrDefaults.get(k) ?? '']))]));
    }
    const sk = [...db.skipped].map(([k, v]) => `${k} (${v})`).join(', ');
    more.append(el('p', [db.version ? `Version "${db.version}".` : '', db.comment ? `Comment: ${db.comment}` : '', sk ? `Not shown here: ${sk}.` : ''].filter(Boolean).join(' '), 'small mut'));
    out.append(more);
    if (db.msgs.length) { const first = wrap.querySelector('tbody tr'); if (first) first.classList.add('on'); show(db.msgs[0]); }
    else det.append(el('p', 'This file has no BO_ messages. Is it a DBC file?', 'warn'));
    function show(m) {
      cur = m; muxSel = null; det.textContent = '';
      det.append(el('h3', m.name, 'mono'));
      const cyc = attrOf(db, m, 'GenMsgCycleTime');
      det.append(kv([['ID', m.pseudo ? hexId(m) : `${hexId(m)}, ${int(m.id)} decimal`], ['Length', plural(m.dlc, 'byte')], ['Frame', frameFormat(db, m)], ['Sender', m.sender + (m.tx.length ? ', also ' + m.tx.join(', ') : '')],
        ['Cycle time', cyc != null && Number(cyc) > 0 ? `${cyc} ms (GenMsgCycleTime)` : ''], ['Comment', m.comment],
        ['Attributes', [...m.attrs].filter(([k]) => k !== 'GenMsgCycleTime' && k !== 'VFrameFormat').map(([k, v]) => `${k} = ${v}`).join(', ')], ['Extended multiplexing', m.muxVals.join('; ')]]));
      const muxer = m.sigs.find(s => s.muxer), mvals = [...new Set(m.sigs.filter(s => s.muxVal != null).map(s => s.muxVal))].sort((a, b) => a - b);
      const lay = el('div');
      if (muxer && mvals.length) {
        const sel = el('select', null, null, { 'aria-label': 'Multiplexer value' });
        for (const v of mvals) sel.append(el('option', `${muxer.name} = ${v}`, null, { value: v }));
        muxSel = mvals[0];
        sel.addEventListener('change', () => { muxSel = Number(sel.value); drawLayout(m, lay); });
        det.append(el('div', null, 'tcbar', null, [el('label', 'Multiplexed: show the signals for '), sel]));
      }
      det.append(el('h3', 'Bit layout'), lay);
      drawLayout(m, lay);
      det.append(el('h3', 'Signals'));
      det.append(el('div', null, 'tblwrap short', null, [table(['Signal', 'Start', 'Bits', 'Order', 'Type', 'Factor', 'Offset', 'Min', 'Max', 'Unit', 'Mux', 'Receivers', 'Values', 'Comment'],
        m.sigs.map(s => [s.name, s.start, s.len, s.intel ? 'Intel' : 'Motorola', s.vtype === 1 ? 'float' : s.vtype === 2 ? 'double' : s.signed ? 'signed' : 'unsigned', fmt(s.factor), fmt(s.offset), fmt(s.min), fmt(s.max), s.unit,
          s.muxer ? 'multiplexer' : s.muxVal != null ? 'when ' + s.muxVal : '', s.recv.join(', '), s.values ? s.values.map(([a, b]) => `${a} = ${b}`).join(', ') : '', s.comment]), { sort: true })]));
      // decoder
      det.append(el('h3', 'Decode a frame'));
      const inp = el('input', null, 'mono', { type: 'text', placeholder: `${m.dlc} bytes in hex, e.g. ${Array.from({ length: Math.min(m.dlc, 8) }, (_, k) => (k * 17 + 16).toString(16).toUpperCase().padStart(2, '0')).join(' ')}`, 'aria-label': 'Frame data in hex', size: 40, autocomplete: 'off', spellcheck: 'false' });
      const res = el('div');
      det.append(el('div', null, 'tcbar', null, [inp]), res);
      const dec = () => {
        res.textContent = '';
        const h = inp.value.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
        if (!h) { res.append(el('p', 'Type the data bytes of one frame to see every signal value.', 'small mut')); return; }
        if (h.length % 2) { res.append(el('p', 'Type whole bytes: two hex digits each.', 'small warn')); return; }
        const bytes = new Uint8Array(Math.max(m.dlc, h.length / 2));
        for (let k = 0; k < h.length / 2; k++) bytes[k] = parseInt(h.substr(k * 2, 2), 16);
        const muxV = muxer ? Number(rawOf(muxer, bytes)) : null;
        const rows = m.sigs.filter(s => s.len <= 64 && (s.muxVal == null || s.muxVal === muxV)).map(s => {
          const r = rawOf(s, bytes), p = physOf(s, r), lab = s.values && (s.values.find(([a]) => Number.isFinite(a) && BigInt(Math.trunc(a)) === r) || [])[1];
          const out2 = s.min < s.max && (p < s.min - 1e-9 || p > s.max + 1e-9);
          return [s.name, '0x' + r.toString(16).toUpperCase(), fmt(p) + (s.unit ? ' ' + s.unit : ''), lab || '', out2 ? `outside ${fmt(s.min)} to ${fmt(s.max)}` : ''];
        });
        if (h.length / 2 < m.dlc) res.append(el('p', `You typed ${h.length / 2} of ${m.dlc} bytes; the rest count as 00.`, 'small mut'));
        res.append(el('div', null, 'tblwrap short', null, [table(['Signal', 'Raw', 'Value', 'Label', 'Note'], rows)]));
      };
      inp.addEventListener('input', dec); dec();
    }
  }
  function drawLayout(m, box) {
    box.textContent = '';
    const nb = Math.min(m.dlc, 64), cell = new Map(), laps = new Set();
    m.sigs.forEach((s, si) => {
      if (s.len > 64 || (s.muxVal != null && muxSel != null && s.muxVal !== muxSel)) return;
      const bs = bitsOf(s);
      bs.forEach((b, k) => { if (cell.has(b)) laps.add(b); cell.set(b, { s, si, msb: k === 0, lsb: k === bs.length - 1 }); });
    });
    const hues = [210, 140, 30, 280, 0, 175, 55, 320, 95, 250];
    const t = el('table', null, 'bits', { 'aria-label': `Bit layout of ${m.name}: one row per byte, bit 7 on the left` });
    const hr = el('tr', null, null, null, [el('th', 'Byte')]);
    for (let b = 7; b >= 0; b--) hr.append(el('th', 'bit ' + b));
    t.append(el('thead', null, null, null, [hr]));
    const tb = el('tbody');
    for (let r = 0; r < nb; r++) {
      const tr = el('tr', null, null, null, [el('th', String(r))]);
      for (let c = 7; c >= 0; c--) {
        const b = r * 8 + c, x = cell.get(b);
        const td = el('td', null, (x && x.msb ? 'msb' : '') + (laps.has(b) ? ' lap' : ''), { title: x ? `${x.s.name}, frame bit ${b}${x.msb ? ', most significant bit' : ''}${x.lsb ? ', least significant bit' : ''}` : `frame bit ${b}, unused` });
        td.append(el('span', String(b), 'bn'));
        if (x) { td.style.background = `hsl(${hues[x.si % hues.length]} 70% 50% / .28)`; if (x.msb || x.lsb || c === 7) td.append(el('span', x.s.name, 'sn')); }
        tr.append(td);
      }
      tb.append(tr);
    }
    t.append(tb);
    box.append(el('div', null, 'tblwrap bitswrap', null, [t]),
      el('p', 'Each row is one byte. A bar on the left edge marks the most significant bit of a signal; red outlines mark bits two signals share.', 'small mut'));
  }

  wire(async (text, info) => {
    if (/^\s*[{<]/.test(text.slice(0, 200)) || text.indexOf('\0') !== -1) throw new Error('This is not a DBC text file. A DBC file starts with lines such as VERSION, NS_, BU_ and BO_.');
    db = parse(text);
    if (!db.msgs.length && !db.nodes.length && !db.version) throw new Error('No DBC content was found in this file: it has no VERSION, BU_ or BO_ lines.');
    check(db);
    shown(info, `${plural(db.msgs.length, 'message')}, ${plural(db.msgs.reduce((a, m) => a + m.sigs.length, 0), 'signal')}, ${int(info.size)} bytes`);
    render(info);
    done(info, db.problems.length ? `The checks found ${plural(db.problems.length, 'problem')}, listed below the tables.` : '');
  }, { maxBytes: 100 * 1048576 });
  self.zovoTest = () => db && { msgs: db.msgs.length, sigs: db.msgs.reduce((a, m) => a + m.sigs.length, 0), problems: db.problems.map(p => p.text).slice(0, 20), cur: cur && cur.name,
    decoded: [...document.querySelectorAll('.det table.dtab')].pop()?.innerText.slice(0, 800) };
  self.zovoReady = true;
})();
