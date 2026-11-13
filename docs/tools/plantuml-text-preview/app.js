/* PlantUML Text Preview (TOOLCHK5, wave18, 13 Nov 2026). Finds every diagram in a .puml file or in the plantuml blocks of
   a Markdown file with the PlantUML Viewer extension's own block finder (engine.js, MIT), lists what each diagram
   declares and connects, checks it, and sketches sequence diagrams. It does not run PlantUML: the diagram text is
   never sent to a PlantUML server or anywhere else. File text is only ever written with textContent. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine;
  const MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 3000, SKETCH_MAX = 400;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const n = (x) => x.toLocaleString('en-US');
  const pl = (x, w) => `${n(x)} ${w}${x === 1 ? '' : 's'}`;
  let doc = null, cur = 0;

  // ---- what a diagram declares and connects (line based, an outline, not PlantUML's own parser) ----
  const NAME = String.raw`("[^"]+"|\[\*\]|\([^)]*\)|:[^:]+:|[\w.$@À-￿]+)`;
  const ARROW = String.raw`([<>ox*#+|\\/{}^]*[-.=]+(?:\[[^\]]*\])?(?:(?:left|right|up|down|le|ri|do|l|r|u|d)[-.]+)?[-.=]*[<>ox*#+|\\/{}^]*)`;
  const LINK = new RegExp(String.raw`^${NAME}\s*(?:"[^"]*"\s*)?${ARROW}\s*(?:"[^"]*"\s*)?${NAME}\s*(?::\s*(.*))?$`);
  const SEQ_KINDS = 'actor|participant|boundary|control|entity|database|collections|queue';
  const DECL = new RegExp(String.raw`^(${SEQ_KINDS}|abstract\s+class|abstract|class|interface|enum|annotation|usecase|state|object|component|node|cloud|folder|frame|package|rectangle|artifact|storage|card|file|agent|namespace|map|json)\s+(.+?)\s*(\{.*)?$`, 'i');
  const clean = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1').replace(/^\((.*)\)$/, '$1').replace(/^:(.*):$/, '$1');

  function declOf(kind, rest) {
    // "Long name" as A | A as "Long name" | A << stereo >> | A #color
    rest = rest.replace(/\s*<<[^>]*>>/g, '').replace(/\s+#\S+\s*$/, '').replace(/\s+order\s+-?\d+\s*$/i, '').trim();
    let m = /^("[^"]+"|\S+)\s+as\s+("[^"]+"|\S+)/i.exec(rest);
    if (m) {
      const a = clean(m[1]), b = clean(m[2]);
      return /^"/.test(m[1]) ? { name: a, alias: b } : { name: b, alias: a };
    }
    m = /^("[^"]+"|\([^)]*\)|\S+)/.exec(rest);
    const nm = m ? clean(m[1]) : clean(rest);
    return { name: nm, alias: nm };
  }

  function outline(block) {
    const lines = block.source.split('\n'), out = { elems: [], links: [], includes: [], notes: 0, skin: 0, actions: 0, nodes: 0, tasks: 0, rows: [] };
    const seen = new Set();
    let inNote = false, inComment = false;
    for (let i = 1; i < lines.length - 1; i++) {
      const raw = lines[i], line = raw.trim(), docLine = i + block.lineOffset + 1;
      if (inComment) { if (/'\/\s*$/.test(line)) inComment = false; continue; }
      if (/^\/'/.test(line)) { if (!/'\/\s*$/.test(line.slice(2))) inComment = true; continue; }
      if (inNote) { if (/^end\s*(note|legend|ref|rnote|hnote)\b/i.test(line)) inNote = false; continue; }
      if (!line || line.startsWith("'")) continue;
      let m;
      if ((m = /^!include(?:_many|_once|once|sub|url)?\s+(.+)$/i.exec(line))) { out.includes.push({ line: docLine, target: m[1].trim(), kind: 'include' }); continue; }
      if ((m = /^!theme\s+(.+)$/i.exec(line))) { out.includes.push({ line: docLine, target: m[1].trim(), kind: 'theme' }); continue; }
      if (/^skinparam\b/i.test(line)) { out.skin++; if (/\{\s*$/.test(line)) inNote = false; continue; }
      if (/^[rh]?note\b|^legend\b|^ref\s+over\b/i.test(line)) { out.notes++; if (!/:/.test(line) && !/\bend\s*note\s*$/i.test(line)) inNote = true; continue; }
      if (/^(alt|else|opt|loop|par|par2|break|critical|group|end)\b/i.test(line) && !/^end\s*note/i.test(line)) { out.rows.push({ type: 'group', text: line, line: docLine }); continue; }
      if ((m = /^==\s*(.*?)\s*==$/.exec(line))) { out.rows.push({ type: 'group', text: m[1], line: docLine }); continue; }
      if (/^:.*;\s*$/.test(line) || /^:[^:]*$/.test(line)) { out.actions++; continue; }
      if (/^\[[^\]]+\]\s+(lasts|requires|starts|is)\b/i.test(line)) { out.tasks++; continue; }
      if (/^[*+-]+[_]?\s+\S/.test(line) && /^(mindmap|wbs)$/.test(block.kind)) { out.nodes++; continue; }
      if ((m = /^(Bi)?Rel(?:_[A-Za-z]+|Index[A-Za-z_]*)?\s*\(\s*(?:[\w.]+\s*,\s*)?([\w.]+)\s*,\s*([\w.]+)\s*(?:,\s*"([^"]*)")?/.exec(line)) && !/^RelIndex/.test(line) || (m = /^(Bi)?RelIndex[A-Za-z_]*\s*\(\s*[^,]+,\s*([\w.]+)\s*,\s*([\w.]+)\s*(?:,\s*"([^"]*)")?/.exec(line))) {  // C4-PlantUML Rel(a, b, "label")
        const arrow = (m[1] ? '<' : '') + '-->';
        out.links.push({ from: m[2], to: m[3], arrow, label: m[4] || '', line: docLine }); out.c4 = true;
        out.rows.push({ type: 'msg', from: m[2], to: m[3], arrow, label: m[4] || '', line: docLine });
        continue;
      }
      if ((m = /^([A-Z][A-Za-z]*(?:_[A-Za-z]+)*)\s*\(\s*([\w.]+)\s*,\s*"([^"]*)"/.exec(line)) && !/^(Lay_|Add|Update|SHOW|HIDE|LAYOUT|Set)/.test(m[1])) {  // C4 macros: Person(alias, "Label", ...)
        out.elems.push({ kind: m[1], name: m[3], alias: m[2], line: docLine }); seen.add(m[2]); out.c4 = true;
        continue;
      }
      if ((m = DECL.exec(line)) && !LINK.test(line)) {
        const kind = m[1].toLowerCase().replace(/\s+/g, ' '), d = declOf(kind, m[2]);
        if (d.name) { out.elems.push({ kind, name: d.name, alias: d.alias, line: docLine }); seen.add(d.alias); seen.add(d.name); }
        continue;
      }
      if ((m = LINK.exec(line))) {
        const arrow = m[2];
        if (!/[-.=]/.test(arrow) || (arrow.length < 2 && !/[<>]/.test(arrow))) continue;
        const from = clean(m[1]), to = clean(m[3]), label = (m[4] || '').trim();
        out.links.push({ from, to, arrow, label, line: docLine });
        out.rows.push({ type: 'msg', from, to, arrow, label, line: docLine });
      }
    }
    out.declared = seen;
    return out;
  }

  // ---- checks ----
  function checks(text, blocks, isMd) {
    const lines = text.split(/\r?\n/), probs = [];
    const inBlock = (l) => blocks.some((b) => l >= b.startLine && l <= b.endLine);
    for (const b of blocks) {
      const last = lines[b.endLine] || '';
      const fenced = b.fence && !/^\s*@start/i.test(lines[b.startLine] || '');  // a plantuml code block without @startuml
      if (!b.wrapped && !fenced && !new RegExp('^\\s*@end' + b.kind + '\\b', 'i').test(last)) {
        probs.push({ sev: 'error', line: b.startLine + 1, text: `@start${b.kind} has no @end${b.kind}. PlantUML reports an error for this diagram.`, block: b.index });
      }
      b.source.split('\n').forEach((l, k) => {
        if (k > 0 && /^\s*@start[a-z0-9_]+\b/i.test(l)) probs.push({ sev: 'error', line: k + b.lineOffset + 1, text: `A new ${l.trim().split(/\s/)[0]} before the @end${b.kind} of the diagram that starts on line ${b.startLine + 1}. Close the first diagram above this line.`, block: b.index });
      });
      if (b.wrapped) probs.push({ sev: 'info', line: 1, text: 'No @startuml line: the extension draws the whole file as one diagram (fine for a sketch or an include file).', block: b.index });
      if (b.kind === 'ditaa' || b.kind === 'math' || b.kind === 'latex') probs.push({ sev: 'warn', line: b.startLine + 1, text: `@start${b.kind}: the MIT build of PlantUML that the extension ships does not include this renderer.`, block: b.index });
    }
    const otherFence = new Set();  // Markdown: lines inside code blocks of other languages (examples), which the extension skips
    if (isMd) {
      let op = null;
      lines.forEach((l, i) => {
        const f = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(l);
        if (op) { if (f && f[1][0] === op.f[0] && f[1].length >= op.f.length && !f[2]) op = null; else if (!/^(plantuml|puml|uml|pu|\{plantuml\}|\{\.plantuml\})$/.test(op.lang)) otherFence.add(i); }
        else if (f) op = { f: f[1], lang: f[2].toLowerCase() };
      });
    }
    lines.forEach((l, i) => {
      const m = /^\s*@end([a-z0-9_]+)\b/i.exec(l);
      if (m && !inBlock(i) && !otherFence.has(i)) probs.push({ sev: 'warn', line: i + 1, text: `@end${m[1]} without a matching @start${m[1]} above it.` });
    });
    if (isMd) {
      let open = null;
      lines.forEach((l, i) => {
        const f = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(l);
        if (!f) return;
        if (!open) open = { fence: f[1], lang: f[2].toLowerCase(), line: i };
        else if (f[1][0] === open.fence[0] && f[1].length >= open.fence.length && !f[2]) open = null;
      });
      if (open && /^(plantuml|puml|uml)$/.test(open.lang)) probs.push({ sev: 'error', line: open.line + 1, text: 'This plantuml code block is never closed with ```.' });
    }
    for (const b of blocks) {
      const o = b.o;
      for (const inc of o.includes) {
        if (/^https?:/i.test(inc.target) && !/raw\.githubusercontent\.com\/(plantuml-stdlib|awslabs|tupadr3)/i.test(inc.target)) {
          probs.push({ sev: 'warn', line: inc.line, text: `${inc.kind === 'theme' ? '!theme' : '!include'} from a web address. The extension refuses web includes (it reads only local files and its built-in standard library).`, block: b.index });
        }
      }
      if (b.isSeq) {
        const undecl = new Map();
        for (const l of o.links) for (const p of [l.from, l.to]) if (p !== '[*]' && !o.declared.has(p) && !undecl.has(p)) undecl.set(p, l.line);
        if (o.elems.length && undecl.size) probs.push({ sev: 'info', line: [...undecl.values()][0], text: `Used in a message but not declared: ${[...undecl.keys()].slice(0, 8).join(', ')}. PlantUML adds them as plain participants.`, block: b.index });
      }
      if (!o.elems.length && !o.links.length && !o.actions && !o.nodes && !o.tasks && b.source.split('\n').filter((x) => x.trim()).length <= 2) probs.push({ sev: 'warn', line: b.startLine + 1, text: 'This diagram is empty.', block: b.index });
    }
    return probs.sort((a, b) => a.line - b.line);
  }

  function guessType(b, o) {
    if (b.kind !== 'uml') return b.kind;
    if (o.c4 || o.includes.some((i) => /C4[_-]/i.test(i.target))) return 'C4';
    const k = new Set(o.elems.map((e) => e.kind));
    if (k.has('usecase') || o.links.some((l) => /^\(.*\)$/.test(l.to) || /^\(.*\)$/.test(l.from))) return 'use case';
    if ([...k].some((x) => new RegExp(`^(${SEQ_KINDS})$`).test(x)) || o.rows.some((r) => r.type === 'group' && /^(alt|loop|opt|par)\b/i.test(r.text))) return 'sequence';
    if (o.links.some((l) => /^-+>{1,2}$|^-+\\\\?$/.test(l.arrow)) && !o.links.some((l) => /[|*o]/.test(l.arrow)) && !k.size && !o.links.some((l) => l.from === '[*]')) return 'sequence';
    if (k.has('class') || k.has('abstract class') || k.has('interface') || k.has('enum') || o.links.some((l) => /<\||\|>/.test(l.arrow))) return 'class';
    if (k.has('state') || o.links.some((l) => l.from === '[*]' || l.to === '[*]')) return 'state';
    if (k.has('usecase') || o.links.some((l) => /^\(.*\)$/.test(l.to))) return 'use case';
    if (o.actions) return 'activity';
    if (k.has('component') || k.has('node') || k.has('cloud')) return 'component';
    if (k.has('object') || k.has('map') || k.has('json')) return 'object';
    return 'uml';
  }

  // ---- sequence sketch (participants and messages only) ----
  function sketch(b) {
    const o = b.o, wrap = $('sketch');
    wrap.textContent = '';
    if (!b.isSeq) { wrap.appendChild(el('p', 'small mut', 'The sketch covers sequence diagrams only. Class, state, activity and other diagrams are drawn by PlantUML in the extension.')); return 0; }
    const parts = [], label = new Map();
    const add = (id, nm) => { if (id === '[*]' || parts.includes(id)) return; parts.push(id); label.set(id, nm || id); };
    for (const e of o.elems) add(e.alias, e.name);
    for (const r of o.rows) if (r.type === 'msg') { add(r.from); add(r.to); }
    const rows = o.rows.slice(0, SKETCH_MAX);
    const COL = 170, X0 = 90, TOP = 56, ROW = 34;
    const W = Math.max(360, X0 * 2 + COL * (parts.length - 1)), H = TOP + 20 + rows.length * ROW + 40;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Sketch of the sequence diagram');
    const mk = (tag, attrs, text) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
    const defs = document.createElementNS(SVGNS, 'defs'); svg.appendChild(defs);
    const mkr = document.createElementNS(SVGNS, 'marker');
    for (const [k, v] of Object.entries({ id: 'pu-ah', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' })) mkr.setAttribute(k, v);
    const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', 'M0,0 L10,5 L0,10 z'); p.setAttribute('class', 'pu-head'); mkr.appendChild(p); defs.appendChild(mkr);
    const xOf = (id) => X0 + COL * parts.indexOf(id);
    parts.forEach((id) => {
      const x = xOf(id), t = label.get(id).length > 22 ? label.get(id).slice(0, 21) + '…' : label.get(id);
      mk('line', { x1: x, y1: TOP, x2: x, y2: H - 14, class: 'pu-life' });
      mk('rect', { x: x - 76, y: 10, width: 152, height: 32, rx: 5, class: 'pu-box' });
      mk('text', { x, y: 31, 'text-anchor': 'middle', class: 'pu-name' }, t);
    });
    rows.forEach((r, i) => {
      const y = TOP + 26 + i * ROW;
      if (r.type === 'group') {
        mk('line', { x1: 8, y1: y, x2: W - 8, y2: y, class: 'pu-grp' });
        mk('text', { x: 12, y: y - 5, class: 'pu-grpt' }, r.text.length > 70 ? r.text.slice(0, 69) + '…' : r.text);
        return;
      }
      let a = r.from, z = r.to;
      const left = /^</.test(r.arrow) && !/>$/.test(r.arrow);
      if (left) [a, z] = [z, a];
      const dashed = /--|\.\./.test(r.arrow), xa = xOf(a), xz = xOf(z);
      const lt = r.label.length > 40 ? r.label.slice(0, 39) + '…' : r.label;
      if (a === z) {
        mk('path', { d: `M${xa},${y} h40 v14 h-38`, class: 'pu-msg' + (dashed ? ' pu-dash' : ''), 'marker-end': 'url(#pu-ah)' });
        mk('text', { x: xa + 46, y: y + 4, class: 'pu-lbl' }, lt);
      } else {
        mk('line', { x1: xa, y1: y, x2: xz + (xz > xa ? -2 : 2), y2: y, class: 'pu-msg' + (dashed ? ' pu-dash' : ''), 'marker-end': 'url(#pu-ah)' });
        mk('text', { x: (xa + xz) / 2, y: y - 6, 'text-anchor': 'middle', class: 'pu-lbl' }, lt);
      }
    });
    wrap.appendChild(svg);
    if (o.rows.length > SKETCH_MAX) wrap.appendChild(el('p', 'small mut', `The sketch shows the first ${SKETCH_MAX} of ${n(o.rows.length)} rows.`));
    return parts.length;
  }

  // ---- rendering ----
  function table(id, head, rows) {
    const t = $(id); t.textContent = '';
    const th = el('thead'), tr = el('tr'); head.forEach((h) => tr.appendChild(el('th', null, h))); th.appendChild(tr); t.appendChild(th);
    const tb = el('tbody');
    for (const r of rows.slice(0, MAX_ROWS)) { const row = el('tr'); r.forEach((c) => row.appendChild(el('td', null, String(c)))); tb.appendChild(row); }
    t.appendChild(tb);
    return t;
  }

  function showBlock(i) {
    cur = i;
    const b = doc.blocks[i], o = b.o;
    document.querySelectorAll('#diagrams tbody tr').forEach((tr, k) => tr.classList.toggle('on', k === i));
    $('blkTitle').textContent = `Diagram ${i + 1}: ${b.type}${b.name ? ', ' + b.name : ''} (lines ${b.startLine + 1} to ${b.endLine + 1})`;
    const drawn = sketch(b);
    table('elems', ['Line', 'Kind', 'Name', 'Alias'], o.elems.map((e) => [e.line, e.kind, e.name, e.alias === e.name ? '' : e.alias]));
    $('elemsNote').textContent = o.elems.length ? '' : 'No declarations. PlantUML creates elements from the links below.';
    table('links', ['Line', 'From', 'Arrow', 'To', 'Label'], o.links.map((l) => [l.line, l.from, l.arrow, l.to, l.label]));
    $('linksNote').textContent = o.links.length ? '' : 'No messages or links found.';
    const extra = [];
    if (o.actions) extra.push(pl(o.actions, 'activity action'));
    if (o.nodes) extra.push(pl(o.nodes, 'mind map node'));
    if (o.tasks) extra.push(pl(o.tasks, 'Gantt task line'));
    if (o.notes) extra.push(pl(o.notes, 'note'));
    if (o.skin) extra.push(pl(o.skin, 'skinparam line'));
    for (const inc of o.includes) extra.push(`line ${inc.line}: ${inc.kind === 'theme' ? '!theme' : '!include'} ${inc.target}`);
    $('extra').textContent = extra.join(' · ');
    // source with document line numbers
    const src = $('src'); src.textContent = '';
    const bad = new Set(doc.probs.filter((p) => p.block === i || p.block === undefined).map((p) => p.line));
    const lines = b.source.split('\n');
    lines.slice(0, 5000).forEach((l, k) => {
      const ln = el('div', 'ln'), dl = k + b.lineOffset + 1;
      const real = dl >= 1 && dl - 1 <= b.endLine && (doc.lines[dl - 1] || '').trim() === l.trim();  // not a line the finder added
      ln.appendChild(el('span', 'n', real ? String(dl) : ''));
      ln.appendChild(el('span', 'c', l || ' '));
      if (real && bad.has(dl)) ln.classList.add('hit');
      src.appendChild(ln);
    });
    self.zovoState = Object.assign(self.zovoState || {}, { current: i, type: b.type, elems: o.elems.length, blockLinks: o.links.length, sketched: drawn });
  }

  function render(name, text) {
    const isMd = E.MARKDOWN_EXT ? E.MARKDOWN_EXT.test(name) : /\.(md|markdown|mdx)$/i.test(name);
    const blocks = E.blocksFor(text, { fileName: name });
    for (const b of blocks) { b.o = outline(b); b.type = guessType(b, b.o); b.isSeq = b.type === 'sequence'; }
    const probs = checks(text, blocks, isMd);
    doc = { name, text, blocks, probs, lines: text.split(/\r?\n/) };
    const st = $('stats'); st.textContent = '';
    const stat = (k, v) => { const d = el('div', 'stat'); d.appendChild(el('div', 'v', v)); d.appendChild(el('div', 'k', k)); st.appendChild(d); };
    const lines = text.replace(/\r?\n$/, '').split(/\r?\n/).length;
    stat('diagrams', n(blocks.length));
    stat('lines', n(lines));
    stat('elements', n(blocks.reduce((a, b) => a + b.o.elems.length, 0)));
    stat('messages and links', n(blocks.reduce((a, b) => a + b.o.links.length, 0)));
    stat('problems', n(probs.filter((p) => p.sev !== 'info').length));
    const kinds = {};
    blocks.forEach((b) => { kinds[b.type] = (kinds[b.type] || 0) + 1; });
    // diagram list
    const t = $('diagrams'); t.textContent = '';
    const th = el('thead'), htr = el('tr'); ['#', 'Type', 'Name', 'Lines', 'Elements', 'Links', 'Problems'].forEach((h) => htr.appendChild(el('th', null, h))); th.appendChild(htr); t.appendChild(th);
    const tb = el('tbody');
    blocks.forEach((b, i) => {
      const tr = el('tr'); tr.tabIndex = 0;
      const pc = probs.filter((p) => p.block === i && p.sev !== 'info').length;
      [i + 1, b.type + (b.fence ? ' (Markdown block)' : ''), b.name || '', `${b.startLine + 1} to ${b.endLine + 1}`, b.o.elems.length, b.o.links.length, pc || ''].forEach((c) => tr.appendChild(el('td', null, String(c))));
      tr.addEventListener('click', () => showBlock(i));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showBlock(i); } });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    // problems
    const pl = $('probs'); pl.textContent = '';
    if (!probs.length) pl.appendChild(el('li', 'ok', 'No problems found by these checks.'));
    for (const p of probs.slice(0, 500)) {
      const li = el('li', p.sev === 'error' ? 'bad' : p.sev === 'warn' ? 'warn' : 'mut');
      li.appendChild(el('strong', null, `Line ${p.line}, ${{ info: 'note', warn: 'warning', error: 'error' }[p.sev]}: `));
      li.appendChild(document.createTextNode(p.text));
      if (p.block !== undefined) { li.classList.add('go'); li.tabIndex = 0; li.addEventListener('click', () => showBlock(p.block)); }
      pl.appendChild(li);
    }
    $('blk').hidden = !blocks.length;
    self.zovoState = { diagrams: blocks.length, kinds, problems: probs.filter((p) => p.sev !== 'info').length, notes: probs.filter((p) => p.sev === 'info').length,
      elements: blocks.reduce((a, b) => a + b.o.elems.length, 0), links: blocks.reduce((a, b) => a + b.o.links.length, 0), pwned: !!self.__pwned };
    if (blocks.length) showBlock(0);
    return blocks;
  }

  self.zovoOpen = async (file) => {
    if (file.size > MAX_BYTES) throw new Error(`the file is ${self.zovoSize(file.size)}; this page reads text files up to 5 MB`);
    const text = await file.text();
    if (/\u0000/.test(text.slice(0, 4096))) throw new Error('this looks like a binary file, not PlantUML text');
    const blocks = render(file.name, text);
    if (!blocks.length) return `${file.name} has no PlantUML diagram (no @startuml line and no plantuml code block).`;
    const kinds = Object.entries(self.zovoState.kinds).map(([k, v]) => `${v} ${k}`).join(', ');
    return `Found ${blocks.length} diagram${blocks.length === 1 ? '' : 's'} in ${file.name} (${kinds}). Nothing was uploaded.`;
  };

  $('saveBlk').addEventListener('click', () => {
    if (!doc) return;
    const b = doc.blocks[cur], stem = doc.name.replace(/\.[^.]+$/, '') || 'diagram';
    const nm = (b.name ? b.name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^[.-]+/, '').slice(0, 60) : '') || `${stem}-${cur + 1}`;
    const a = el('a'); a.href = URL.createObjectURL(new Blob([b.source + '\n'], { type: 'text/plain' })); a.download = nm + '.puml';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
  $('copyBlk').addEventListener('click', async () => {
    if (!doc) return;
    try { await navigator.clipboard.writeText(doc.blocks[cur].source + '\n'); self.zovoMsg('Copied the diagram text.'); } catch (e) { self.zovoMsg('The browser did not allow copying.', true); }
  });
  $('pasteGo').addEventListener('click', () => {
    const t = $('pasteText').value;
    if (!t.trim()) { self.zovoMsg('Paste some PlantUML text first.', true); return; }
    const md = /^\s{0,3}(`{3,}|~{3,})\s*(plantuml|puml|uml)\b/im.test(t);
    self.zovoOpenFiles([new File([t], md ? 'pasted.md' : 'pasted.puml', { type: 'text/plain' })]);
  });
})();
