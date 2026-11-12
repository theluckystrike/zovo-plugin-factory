/* Zovo EDI Viewer Online (TOOLCHK2, wave18). Reads an ANSI X12 or UN/EDIFACT file in this tab and shows it as a
   tree (interchange, group, transaction set or message, segments), with element names, code meanings and checks of
   control numbers and counts. Nothing is sent anywhere (CSP connect-src 'none'); all text is shown with textContent.
   Rewritten from the HTOOL8 draft. */
(function () {
  'use strict';
  const { $, el, say, int, plural, clip, kv, stats, wire, shown, done } = self.Z;
  const D = self.EDI_DICT;
  let doc = null, selNode = null;

  /* splitting */
  function x12(text) {
    const at = text.indexOf('ISA');
    if (at === -1) throw new Error('No ISA segment was found.');
    const t = text.slice(at);
    const es = t[3];
    // ISA has 16 elements; the component separator is ISA16 and the segment terminator follows it
    let k = 0, pos = 0;
    for (; k < 16 && pos !== -1; k++) pos = t.indexOf(es, pos + 1);
    if (pos === -1) throw new Error('The ISA segment is cut short: it needs 16 elements.');
    const cs = t[pos + 1], st = t[pos + 2];
    const isa = t.slice(0, pos + 2).split(es);
    const rs = isa[11] && isa[11].length === 1 && !/[A-Za-z0-9 ]/.test(isa[11]) ? isa[11] : null;
    return { fmt: 'X12', es, cs, st, rs, rel: null, body: t, offset: at, isaLen: pos + 3 };  // with its terminator
  }
  function edifact(text) {
    let t = text.replace(/^\s+/, ''), off = text.length - t.length;
    let cs = ':', es = '+', dec = '.', rel = '?', st = "'";
    let una = '';
    if (t.startsWith('UNA')) { cs = t[3]; es = t[4]; dec = t[5]; rel = t[6]; st = t[8]; una = t.slice(0, 9); t = t.slice(9); off += 9; }
    return { fmt: 'EDIFACT', es, cs, st, rs: '*', rel: rel === ' ' ? null : rel, dec, body: t, offset: off, una };
  }
  function segments(sp, text) {
    const out = [], body = sp.body;
    let cur = '', start = 0, line = lineAt(text, sp.offset), segLine = line;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (sp.rel && c === sp.rel && i + 1 < body.length) { cur += c + body[i + 1]; if (body[i + 1] === '\n') line++; i++; continue; }
      if (c === sp.st) {
        const s = cur.replace(/^[\r\n]+/, '');
        if (s.trim()) out.push({ raw: s, line: segLine, n: out.length + 1 });
        cur = ''; start = i + 1;
        while (start < body.length && (body[start] === '\r' || body[start] === '\n')) { if (body[start] === '\n') line++; start++; }
        i = start - 1; segLine = line;
        continue;
      }
      if (c === '\n') { line++; if (!cur.trim()) segLine = line; }
      cur += c;
    }
    if (cur.trim()) out.push({ raw: cur.replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, ''), line: segLine, n: out.length + 1, open: true });
    for (const s of out) {
      s.els = splitRel(s.raw.replace(/[\r\n]+/g, ''), sp.es, sp.rel);
      s.id = s.els[0].trim();
      s.els = s.els.slice(1).map(e => sp.fmt === 'X12' && s.id === 'ISA' ? [e] : splitRel(e, sp.cs, sp.rel).map(x => unrel(x, sp.rel)));
    }
    return out;
  }
  function lineAt(text, pos) { let n = 1; for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) n++; return n; }
  function splitRel(s, sep, rel) {
    if (!rel) return s.split(sep);
    const out = []; let cur = '';
    for (let i = 0; i < s.length; i++) { if (s[i] === rel && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; continue; } if (s[i] === sep) { out.push(cur); cur = ''; } else cur += s[i]; }
    out.push(cur); return out;
  }
  const unrel = (s, rel) => rel ? s.replace(new RegExp('\\' + rel + '(.)', 'g'), '$1') : s;

  /* structure and checks */
  function build(text) {
    const head = text.replace(/^﻿/, '').trimStart().slice(0, 3);
    const sp = head === 'ISA' ? x12(text) : head === 'UNA' || head === 'UNB' ? edifact(text) : null;
    if (!sp) throw new Error('This is not an X12 or EDIFACT file. X12 files start with ISA, EDIFACT files with UNA or UNB.');
    const segs = segments(sp, text), probs = [], X = sp.fmt === 'X12';
    const P = (seg, sev, t) => { if (probs.length < 3000) probs.push({ seg, sev, text: t }); };
    const root = { kind: 'file', kids: [] };
    const H = X ? { ic: 'ISA', ict: 'IEA', g: 'GS', gt: 'GE', t: 'ST', tt: 'SE' } : { ic: 'UNB', ict: 'UNZ', g: 'UNG', gt: 'UNE', t: 'UNH', tt: 'UNT' };
    let ic = null, grp = null, tx = null, loop = null, counts = { ic: 0, g: 0, t: 0 };
    const v = (s, i, c) => { const e = s.els[i - 1]; return e ? (e[c || 0] || '').trim() : ''; };
    const add = (parent, node) => { parent.kids.push(node); node.parent = parent; return node; };
    if (X && sp.isaLen !== 106) P(segs[0], 'warning', `The ISA segment is ${sp.isaLen} characters long; X12 fixes it at 106. Some partners reject that.`);
    for (const s of segs) {
      s.name = (X ? D.x12 : D.edi)[s.id] ? (X ? D.x12 : D.edi)[s.id][0] : '';
      if (!/^[A-Z][A-Z0-9]{1,2}$/.test(s.id)) P(s, 'error', `"${clip(s.id, 20)}" is not a segment id.`);
      if (s.open) P(s, 'warning', 'The last segment has no segment terminator; the file may be cut short.');
      if (s.id === 'UNA') continue;
      if (s.id === H.ic) {
        if (ic && !ic.closed) P(s, 'error', `A new ${H.ic} starts before the ${H.ict} of the one before.`);
        counts.ic++;
        ic = add(root, { kind: 'ic', seg: s, kids: [], groups: 0, msgs: 0, ctl: X ? v(s, 13) : v(s, 5) });
        grp = null; tx = null; loop = null; continue;
      }
      if (!ic) { P(s, 'error', `Segment ${s.id} is outside an interchange (no ${H.ic} before it).`); ic = add(root, { kind: 'ic', seg: null, kids: [], groups: 0, msgs: 0, ctl: '' }); }
      if (s.id === H.ict) {
        ic.closed = s; add(ic, { kind: 'seg', seg: s });
        const ctl = X ? v(s, 2) : v(s, 2), n = Number(v(s, 1));
        if (ic.ctl !== '' && ctl !== ic.ctl) P(s, 'error', `${H.ict}02 control number ${ctl} does not match ${H.ic}${X ? '13' : '05'} ${ic.ctl}.`);
        const want = X ? ic.groups : (ic.groups || ic.msgs);
        if (v(s, 1) !== '' && n !== want) P(s, 'error', `${H.ict}01 says ${v(s, 1)} ${X ? 'functional groups' : ic.groups ? 'groups' : 'messages'}, but the interchange has ${want}.`);
        grp = null; tx = null; loop = null; continue;
      }
      if (s.id === H.g) { counts.g++; ic.groups++; grp = add(ic, { kind: 'grp', seg: s, kids: [], msgs: 0, ctl: X ? v(s, 6) : v(s, 5) }); tx = null; continue; }
      if (s.id === H.gt) {
        if (!grp) { P(s, 'error', `${H.gt} without a ${H.g} before it.`); continue; }
        grp.closed = s; add(grp, { kind: 'seg', seg: s });
        if (v(s, 2) !== grp.ctl) P(s, 'error', `${H.gt}02 control number ${v(s, 2)} does not match ${H.g}${X ? '06' : '05'} ${grp.ctl}.`);
        if (Number(v(s, 1)) !== grp.msgs) P(s, 'error', `${H.gt}01 says ${v(s, 1)} ${X ? 'transaction sets' : 'messages'}, but the group has ${grp.msgs}.`);
        grp = null; tx = null; continue;
      }
      if (s.id === H.t) {
        counts.t++; ic.msgs++; if (grp) grp.msgs++;
        if (X && !grp) P(s, 'error', 'ST outside a functional group (no GS before it).');
        const type = X ? v(s, 1) : v(s, 2, 0);
        tx = add(grp || ic, { kind: 'tx', seg: s, kids: [], type, ver: X ? (grp ? v(grp.seg, 8) : '') : [v(s, 2, 1), v(s, 2, 2)].join(''), ctl: X ? v(s, 2) : v(s, 1), nseg: 1 });
        loop = null;
        if (X && grp && D.gsFor[type] && v(grp.seg, 1) && D.gsFor[type] !== v(grp.seg, 1)) P(s, 'warning', `Transaction set ${type} usually travels in a ${D.gsFor[type]} group, not ${v(grp.seg, 1)}.`);
        continue;
      }
      if (s.id === H.tt) {
        if (!tx) { P(s, 'error', `${H.tt} without a ${H.t} before it.`); continue; }
        tx.nseg++; tx.closed = s; add(tx, { kind: 'seg', seg: s });
        if (Number(v(s, 1)) !== tx.nseg) P(s, 'error', `${H.tt}01 says ${v(s, 1)} segments, but the ${X ? 'transaction set' : 'message'} has ${tx.nseg} (counting ${H.t} and ${H.tt}).`);
        if (v(s, 2) !== tx.ctl) P(s, 'error', `${H.tt}02 control number ${v(s, 2)} does not match ${H.t}02 ${tx.ctl}.`);
        tx = null; loop = null; continue;
      }
      if (!tx) { P(s, 'error', `Segment ${s.id} is outside a ${X ? 'transaction set' : 'message'}.`); add(grp || ic, { kind: 'seg', seg: s }); continue; }
      tx.nseg++;
      // loops: a loop-start segment collects the segments after it until the next loop start or a summary segment
      const starts = X ? D.x12Loop : D.ediLoop, ends = X ? D.x12End : D.ediEnd;
      if (starts.has(s.id)) { loop = add(tx, { kind: 'loop', seg: s, kids: [] }); continue; }
      if (ends.has(s.id)) loop = null;
      add(loop || tx, { kind: 'seg', seg: s });
    }
    for (const s of segs) {  // mandatory elements this page knows
      const req = (X ? D.x12 : D.edi)[s.id] && (X ? D.x12 : D.edi)[s.id][2];
      if (req) for (const r of req) { const [e, c] = String(r).split('-').map(Number); if (!v(s, e, (c || 1) - 1)) P(s, 'warning', `${s.id}${String(e).padStart(2, '0')}${c ? '-' + c : ''} (${elName(s.id, e, c, X)}) is mandatory but empty.`); }
    }
    for (const n of root.kids) {
      if (n.seg && !n.closed) P(n.seg, 'error', `The ${H.ic} at segment ${n.seg.n} has no ${H.ict}.`);
      for (const g of n.kids) {
        if (g.kind === 'grp' && !g.closed) P(g.seg, 'error', `The ${H.g} at segment ${g.seg.n} has no ${H.gt}.`);
        for (const t of g.kind === 'grp' ? g.kids : [g]) if (t.kind === 'tx' && !t.closed) P(t.seg, 'error', `The ${H.t} at segment ${t.seg.n} has no ${H.tt}.`);
      }
    }
    return { sp, segs, probs, root, counts, X };
  }
  function elName(id, e, c, isX) {
    const d = ((isX != null ? isX : doc.X) ? D.x12 : D.edi)[id];
    const names = d && d[1];
    if (!names) return '';
    const x = names[e - 1];
    if (x == null) return '';
    if (Array.isArray(x)) return c ? (x[1] && x[1][c - 1]) || x[0] + ', part ' + c : x[0];
    return c && c > 1 ? x + ', part ' + c : x;
  }
  function meaning(id, e, c, val) {
    const key = `${id}${String(e).padStart(2, '0')}${c ? '-' + c : ''}`;
    const tab = (doc.X ? D.x12Codes : D.ediCodes)[key];
    return tab && tab[val] || '';
  }

  /* view */
  function title(n) {
    const s = n.seg, X = doc.X;
    const v = (i, c) => { const e = s && s.els[i - 1]; return e ? (e[c || 0] || '').trim() : ''; };
    if (n.kind === 'ic') return s ? (X ? `Interchange ${v(13)}: ${v(6)} to ${v(8)}, ${v(9)} ${v(10)}` : `Interchange ${v(5)}: ${v(2)} to ${v(3)}, ${v(4)} ${v(4, 1)}`) : 'Segments outside an interchange';
    if (n.kind === 'grp') return X ? `Group ${v(6)}: ${v(1)}${D.gsName[v(1)] ? ' (' + D.gsName[v(1)] + ')' : ''}, version ${v(8)}` : `Group ${v(5)}: ${v(1)}`;
    if (n.kind === 'tx') { const nm = (X ? D.txName : D.msgName)[n.type]; return `${X ? 'Transaction set' : 'Message'} ${n.type}${nm ? ' ' + nm : ''} #${n.ctl}${n.ver ? ', ' + n.ver : ''}`; }
    return `${s.id}${s.name ? ' ' + s.name : ''}` + (n.kind === 'loop' ? ` (loop, ${plural(n.kids.length + 1, 'segment')})` : '') + ': ' + clip(s.els.map(e => e.join(doc.sp.cs)).join(doc.sp.es), 70);
  }
  function render() {
    const out = $('out'); out.textContent = '';
    const errs = doc.probs.filter(p => p.sev === 'error').length;
    const first = doc.root.kids[0] && doc.root.kids[0].seg;
    const fv = (i, c) => first && first.els[i - 1] ? (first.els[i - 1][c || 0] || '').trim() : '';
    out.append(stats([['Standard', doc.X ? `X12 ${fv(12)}` : `EDIFACT ${fv(1)} ${fv(1, 1)}`], ['Interchanges', int(doc.counts.ic)], [doc.X ? 'Transaction sets' : 'Messages', int(doc.counts.t)], ['Segments', int(doc.segs.length)],
      ['Sender', doc.X ? fv(6) : fv(2)], ['Receiver', doc.X ? fv(8) : fv(3)], ['Groups', int(doc.counts.g)], ['Problems', doc.probs.length ? int(doc.probs.length) : 'none', errs ? 'bad' : '']]));
    const tree = el('div', null, 'jtree', { role: 'tree', 'aria-label': 'EDI structure' }), det = el('div', null, 'det');
    const f = el('input', null, null, { type: 'search', placeholder: 'Find a segment or value', 'aria-label': 'Find a segment or value', autocomplete: 'off' });
    out.append(el('div', null, 'tcbar', null, [f, el('button', 'Expand all', null, { type: 'button', id: 'xall' }), el('button', 'Collapse all', null, { type: 'button', id: 'call' }), el('button', 'Show as text', null, { type: 'button', id: 'txt' })]));
    out.append(el('div', null, 'tcgrid', null, [tree, det]));
    const open = new Set();
    const walk = (n, fn) => { fn(n); (n.kids || []).forEach(k => walk(k, fn)); };
    walk(doc.root, n => { if (n.kind === 'ic' || n.kind === 'grp' || (n.kind === 'tx' && doc.counts.t <= 20)) open.add(n); });
    let rows = [];
    function draw() {
      tree.textContent = ''; rows = [];
      const q = f.value.trim().toLowerCase();
      const match = n => n.seg && (n.seg.id.toLowerCase() === q || n.seg.raw.toLowerCase().includes(q));
      const has = new Map();
      const hit = n => { if (!q) return false; if (has.has(n)) return has.get(n); const r = match(n) || (n.kids || []).some(hit); has.set(n, r); return r; };
      const frag = document.createDocumentFragment();
      let count = 0;
      const row = (n, d) => {
        if (count > 20000) return;
        const kids = n.kids && n.kids.length, isOpen = q ? hit(n) : open.has(n);
        if (q && !hit(n)) return;
        count++;
        const r = el('div', null, 'r' + (n === selNode ? ' on' : '') + (q && match(n) ? ' hit' : ''), { role: 'treeitem', tabindex: -1, 'aria-expanded': kids ? String(!!isOpen) : null });
        r.style.setProperty('--d', d);
        const tw = el('button', kids ? (isOpen ? '▾' : '▸') : '', 'tw', { type: 'button', 'aria-label': kids ? (isOpen ? 'Collapse' : 'Expand') : null, tabindex: -1 });
        if (kids) tw.addEventListener('click', e => { e.stopPropagation(); if (open.has(n)) open.delete(n); else open.add(n); draw(); });
        r.append(tw, el('span', title(n), n.kind === 'seg' || n.kind === 'loop' ? 'v' : 'seg'));
        r.addEventListener('click', () => { selNode = n; tree.querySelectorAll('.r.on').forEach(x => x.classList.remove('on')); r.classList.add('on'); detail(n); });
        frag.append(r); rows.push(r);
        if (kids && isOpen) n.kids.forEach(k => row(k, d + 1));
      };
      doc.root.kids.forEach(k => row(k, 0));
      tree.append(frag);
      if (count > 20000) tree.append(el('p', 'Only the first 20,000 rows are drawn. Collapse a part or use Find.', 'small mut'));
    }
    f.addEventListener('input', draw);
    out.querySelector('#xall').addEventListener('click', () => { walk(doc.root, n => { if (n.kids && n.kids.length) open.add(n); }); draw(); });
    out.querySelector('#call').addEventListener('click', () => { open.clear(); doc.root.kids.forEach(k => open.add(k)); draw(); });
    out.querySelector('#txt').addEventListener('click', e => {
      const b = $('ediText');
      if (b) { b.remove(); e.target.textContent = 'Show as text'; return; }
      e.target.textContent = 'Hide the text';
      const t = doc.segs.slice(0, 50000).map(s => s.raw.replace(/[\r\n]+/g, '') + doc.sp.st).join('\n');
      out.insertBefore(el('div', t, 'pre', { id: 'ediText', 'aria-label': 'The file, one segment per line' }), out.querySelector('.tcgrid'));
    });
    tree.addEventListener('keydown', e => {
      const i = rows.indexOf(document.activeElement); if (i === -1) return;
      if (e.key === 'ArrowDown' && rows[i + 1]) { e.preventDefault(); rows[i + 1].focus(); rows[i + 1].click(); }
      if (e.key === 'ArrowUp' && rows[i - 1]) { e.preventDefault(); rows[i - 1].focus(); rows[i - 1].click(); }
    });
    draw();
    const firstTx = (() => { let x = null; walk(doc.root, n => { if (!x && n.kind === 'tx') x = n; }); return x; })();
    detail(selNode = firstTx || doc.root.kids[0]);
    // checks
    out.append(el('h3', 'Checks'));
    if (doc.probs.length) {
      const ul = el('ul', null, 'problems small');
      for (const p of doc.probs.slice(0, 300)) ul.append(el('li', null, null, null, [el('span', p.sev === 'error' ? 'Error' : 'Warning', 'sev ' + (p.sev === 'error' ? 'warn' : 'mut')), document.createTextNode(` segment ${int(p.seg.n)} (line ${int(p.seg.line)}, ${p.seg.id}): ${p.text}`)]));
      if (doc.probs.length > 300) ul.append(el('li', `and ${int(doc.probs.length - 300)} more`, 'mut'));
      out.append(ul);
    } else out.append(el('p', 'Control numbers and counts match in every envelope, and the mandatory elements this page knows are filled in.', 'small ok'));
    out.append(el('p', `Separators: element ${show(doc.sp.es)}, component ${show(doc.sp.cs)}, segment ${show(doc.sp.st)}${doc.sp.rs && doc.X ? ', repetition ' + show(doc.sp.rs) : ''}${doc.sp.rel ? ', release ' + show(doc.sp.rel) : ''}${doc.sp.una ? ' (from the UNA segment)' : doc.X ? ' (from the ISA segment)' : ' (the EDIFACT defaults)'}.`, 'small mut'));
  }
  const show = c => c === '\n' ? 'new line' : c === ' ' ? 'space' : `"${c}"`;
  function detail(n) {
    const det = document.querySelector('.det'); if (!det || !n) return; det.textContent = '';
    if (n.kind !== 'seg' && n.kind !== 'loop') {
      det.append(el('h3', title(n)));
      const segsIn = []; const walk = x => { if (x.seg) segsIn.push(x.seg); (x.kids || []).forEach(walk); }; walk(n);
      det.append(kv([['Segments', int(segsIn.length)], ['First segment', n.seg ? `${n.seg.n} (line ${n.seg.line})` : '']]));
      if (n.seg) { det.append(el('h3', `${n.seg.id} ${n.seg.name}`)); det.append(elTable(n.seg)); }
      return;
    }
    const s = n.seg;
    det.append(el('h3', `${s.id}${s.name ? ' · ' + s.name : ''}`));
    det.append(el('p', `Segment ${int(s.n)}, line ${int(s.line)}${n.kind === 'loop' ? `, starts a loop of ${plural(n.kids.length + 1, 'segment')}` : ''}.`, 'small mut'));
    det.append(elTable(s));
    det.append(el('div', s.raw.replace(/[\r\n]+/g, '') + doc.sp.st, 'pre'));
  }
  function elTable(s) {
    const t = el('table', null, 'dtab'), tb = el('tbody');
    t.append(el('thead', null, null, null, [el('tr', null, null, null, ['Element', 'Name', 'Value', 'Meaning'].map(h => el('th', h)))]), tb);
    s.els.forEach((e, i) => {
      const comps = e.length > 1 ? e : [e[0]];
      comps.forEach((c, j) => {
        if (e.length > 1 && c === '') return;
        const pos = `${s.id}${String(i + 1).padStart(2, '0')}${e.length > 1 ? '-' + (j + 1) : ''}`;
        const val = c;
        tb.append(el('tr', null, null, null, [el('td', pos, 'mono'), el('td', elName(s.id, i + 1, e.length > 1 ? j + 1 : 0)), el('td', val === '' ? '' : val, 'mono wrap'), el('td', meaning(s.id, i + 1, e.length > 1 ? j + 1 : 0, val.trim()))]));
      });
    });
    if (!s.els.length) tb.append(el('tr', null, null, null, [el('td', '(no elements)', 'mut', { colspan: 4 })]));
    return el('div', null, 'tblwrap short', null, [t]);
  }

  wire(async (text, info) => {
    if (text.indexOf('\0') !== -1) throw new Error('This looks like a binary file. EDI files are text that starts with ISA (X12) or UNA or UNB (EDIFACT).');
    doc = build(text); selNode = null;
    shown(info, `${doc.X ? 'X12' : 'EDIFACT'}, ${plural(doc.counts.t, doc.X ? 'transaction set' : 'message')}, ${plural(doc.segs.length, 'segment')}, ${self.Z.size(info.size)}`);
    render();
    done(info, doc.probs.length ? `The checks found ${plural(doc.probs.length, 'problem')}, listed below the tree.` : '');
  }, { maxBytes: 100 * 1048576 });
  self.zovoTest = () => doc && { fmt: doc.sp.fmt, segs: doc.segs.length, counts: doc.counts, probs: doc.probs.slice(0, 12).map(p => p.seg.n + ' ' + p.text),
    tree: [...document.querySelectorAll('.jtree .r')].slice(0, 12).map(r => r.innerText), det: (document.querySelector('.det') || {}).innerText?.slice(0, 700) };
  self.zovoReady = true;
})();
