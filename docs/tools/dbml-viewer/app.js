/* Zovo DBML Viewer Online (TOOLCHK2, wave18). Reads a DBML file, or SQL with CREATE TABLE statements, in this tab
   and draws the schema as an ER diagram (SVG made with DOM text nodes), with tables, columns, keys, enums, refs and
   table groups, a details pane and checks. Nothing is sent anywhere (CSP connect-src 'none'); nothing from the file
   runs. Rewritten from the HTOOL7 draft. */
(function () {
  'use strict';
  const { $, el, say, int, plural, clip, table, kv, stats, wire, shown, done, size } = self.Z;
  const NS = 'http://www.w3.org/2000/svg';
  let db = null, ui = null, selT = null;

  /* tokens: words, strings ('..', "..", '''..'''), backtick expressions, numbers, colors, symbols, newlines */
  function lex(src) {
    const out = []; let i = 0, line = 1; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '\n') { out.push({ t: 'nl', line }); line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e === -1 ? n : e + 2; for (let k = i; k < end; k++) if (src[k] === '\n') line++; i = end; continue; }
      if (src.startsWith("'''", i)) { const e = src.indexOf("'''", i + 3); const end = e === -1 ? n : e; const v = src.slice(i + 3, end); out.push({ t: 'str', v: dedent(v), line }); line += (v.match(/\n/g) || []).length; i = end + 3; continue; }
      if (c === "'" || c === '"') { let j = i + 1, v = ''; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\' && j + 1 < n) { v += src[j + 1]; j += 2; } else v += src[j++]; } out.push({ t: c === '"' ? 'qid' : 'str', v, line }); i = j + 1; continue; }
      if (c === '`') { const e = src.indexOf('`', i + 1); const end = e === -1 ? n : e; out.push({ t: 'expr', v: src.slice(i + 1, end), line }); i = end + 1; continue; }
      if (c === '#' && /[0-9a-fA-F]/.test(src[i + 1] || '')) { const m = src.slice(i).match(/^#[0-9a-fA-F]{3,8}/); out.push({ t: 'color', v: m[0], line }); i += m[0].length; continue; }
      if (src.startsWith('<>', i)) { out.push({ t: 'sym', v: '<>', line }); i += 2; continue; }
      if ('{}[](),:.<>-~'.includes(c)) { out.push({ t: 'sym', v: c, line }); i++; continue; }
      const m = src.slice(i).match(/^[^\s{}\[\](),:.<>'"`]+/);
      if (m) { out.push({ t: 'w', v: m[0], line }); i += m[0].length; continue; }
      i++;
    }
    out.push({ t: 'eof', line });
    return out;
  }
  const dedent = s => { const ls = s.replace(/^\n/, '').split('\n'); const ind = Math.min(...ls.filter(l => l.trim()).map(l => l.match(/^ */)[0].length)); return ls.map(l => l.slice(isFinite(ind) ? ind : 0)).join('\n').trim(); };

  function parseDBML(src) {
    const T = lex(src), d = newDb('DBML');
    let p = 0;
    const peek = (k = 0) => T[p + k], next = () => T[p++];
    const skipNl = () => { while (peek().t === 'nl') p++; };
    const is = (t, v) => peek().t === t && (v === undefined || String(peek().v).toLowerCase() === v);
    const bad = (line, m) => d.probs.push({ sev: 'error', line, text: m });
    function name() {  // schema.name or "quoted name"
      let a = next(); if (!a || !/^(w|qid)$/.test(a.t)) return null;
      let v = a.v;
      while (is('sym', '.') && /^(w|qid)$/.test(T[p + 1].t)) { p++; v += '.' + next().v; }
      return v;
    }
    function settings() {  // [a, b: c, ...] -> list of {k, v}
      const out = []; if (!is('sym', '[')) return out; p++;
      let k = '', v = null, buf = [];
      const flush = () => { const key = buf.join(' ').trim().toLowerCase(); if (key || v != null) out.push({ k: key, v }); buf = []; v = null; };
      while (!is('eof') && !is('sym', ']')) {
        const t = next();
        if (t.t === 'sym' && t.v === ',') { flush(); continue; }
        if (t.t === 'sym' && t.v === ':') {
          // value: rest until , or ]
          const vs = [];
          while (!is('eof') && !is('sym', ',') && !is('sym', ']')) { const x = next(); if (x.t !== 'nl') vs.push(x); }
          v = vs; continue;
        }
        if (t.t !== 'nl') buf.push(t.v);
      }
      flush(); if (is('sym', ']')) p++;
      return out;
    }
    const valText = vs => vs ? vs.map(x => x.t === 'expr' ? '`' + x.v + '`' : x.v).join('') : '';
    function endpoint() {  // table.col or table.(a, b) or schema.table.col
      const parts = []; let cols = null;
      let a = next(); if (!a || !/^(w|qid)$/.test(a.t)) return null; parts.push(a.v);
      while (is('sym', '.')) { p++; if (is('sym', '(')) { p++; cols = []; while (!is('eof') && !is('sym', ')')) { const x = next(); if (/^(w|qid)$/.test(x.t)) cols.push(x.v); } p++; break; } const b = next(); if (!b) break; parts.push(b.v); }
      if (cols) return { table: parts.join('.'), cols };
      return { table: parts.slice(0, -1).join('.'), cols: [parts[parts.length - 1]] };
    }
    function refBody(line, nm) {
      const a = endpoint(); const op = next(); const b = endpoint();
      if (!a || !b || !op || op.t !== 'sym' || !['<', '>', '-', '<>'].includes(op.v)) { bad(line, 'This Ref does not read as "Ref: a.column > b.column".'); while (!is('nl') && !is('eof') && !is('sym', '}')) p++; return; }
      const st = settings();
      d.refs.push({ a, b, op: op.v, name: nm, line, opts: st.map(x => x.k + (x.v ? ': ' + valText(x.v) : '')).join(', ') });
    }
    skipNl();
    while (!is('eof')) {
      const t = peek(); const kw = t.t === 'w' ? t.v.toLowerCase() : '';
      if (kw === 'project') { p++; const nm = name(); settings(); skipNl(); if (is('sym', '{')) { p++; let depth = 1; while (!is('eof') && depth) { const x = next(); if (x.t === 'sym' && x.v === '{') depth++; else if (x.t === 'sym' && x.v === '}') depth--; else if (x.t === 'w' && x.v.toLowerCase() === 'database_type' && is('sym', ':')) { p++; d.project.dbType = next().v; } else if (x.t === 'w' && x.v.toLowerCase() === 'note' && is('sym', ':')) { p++; d.project.note = next().v; } } } d.project.name = nm; skipNl(); continue; }
      if (kw === 'table') {
        p++; const line = t.line; const nm = name(); let alias = null;
        if (is('w', 'as')) { p++; alias = name(); }
        const st = settings(); skipNl();
        if (!is('sym', '{')) { bad(line, `Table ${nm} has no { body }.`); continue; }
        p++;
        const tb = { name: nm, alias, cols: [], indexes: [], note: '', line, color: (st.find(x => x.k === 'headercolor') || {}).v, group: null };
        if (tb.color) tb.color = valText(tb.color);
        tb.note = valText((st.find(x => x.k === 'note') || {}).v);
        while (!is('eof') && !is('sym', '}')) {
          skipNl(); if (is('sym', '}')) break;
          const c = peek(), ck = c.t === 'w' ? c.v.toLowerCase() : '';
          if (ck === 'indexes' && T[p + 1] && (T[p + 1].v === '{' || T[p + 1].t === 'nl')) {
            p++; skipNl(); p++;  // {
            while (!is('eof') && !is('sym', '}')) {
              skipNl(); if (is('sym', '}')) break;
              let cols = [];
              if (is('sym', '(')) { p++; while (!is('eof') && !is('sym', ')')) { const x = next(); if (x.t === 'expr') cols.push('`' + x.v + '`'); else if (/^(w|qid)$/.test(x.t)) cols.push(x.v); } p++; }
              else { const x = next(); cols.push(x.t === 'expr' ? '`' + x.v + '`' : x.v); }
              const s2 = settings();
              tb.indexes.push({ cols, pk: s2.some(x => x.k === 'pk'), unique: s2.some(x => x.k === 'unique'), name: valText((s2.find(x => x.k === 'name') || {}).v), type: valText((s2.find(x => x.k === 'type') || {}).v) });
              while (!is('nl') && !is('eof') && !is('sym', '}')) p++;
            }
            p++; continue;
          }
          if (ck === 'note' && T[p + 1] && T[p + 1].t === 'sym' && T[p + 1].v === ':') { p += 2; tb.note = next().v; continue; }
          if (ck === 'note' && T[p + 1] && T[p + 1].t === 'sym' && T[p + 1].v === '{') { p += 2; skipNl(); tb.note = next().v; skipNl(); p++; continue; }
          // column: name type [settings]
          const cl = c.line; const cn = next();
          if (!/^(w|qid)$/.test(cn.t)) { bad(cl, `Unexpected "${clip(cn.v, 20)}" in table ${nm}.`); continue; }
          let type = '';
          while (!is('nl') && !is('eof') && !is('sym', '[') && !is('sym', '}')) { const x = next(); type += x.t === 'qid' ? x.v : x.v; if (x.t === 'w' && is('w')) type += ' '; }
          const s3 = settings();
          const col = { name: cn.v, type: type.trim(), pk: s3.some(x => x.k === 'pk' || x.k === 'primary key'), inc: s3.some(x => x.k === 'increment'), notNull: s3.some(x => x.k === 'not null'),
            unique: s3.some(x => x.k === 'unique'), def: valText((s3.find(x => x.k === 'default') || {}).v), note: valText((s3.find(x => x.k === 'note') || {}).v), line: cl };
          tb.cols.push(col);
          for (const r of s3.filter(x => x.k === 'ref')) {
            const vs = r.v || []; const op = vs[0] && vs[0].t === 'sym' ? vs[0].v : null;
            const rest = vs.slice(op ? 1 : 0).map(x => x.v);
            if (!op || !rest.length) { bad(cl, `The ref on ${nm}.${cn.v} does not read as "ref: > table.column".`); continue; }
            const parts = rest.join('').split('.');
            d.refs.push({ a: { table: nm, cols: [cn.v] }, b: { table: parts.slice(0, -1).join('.'), cols: [parts[parts.length - 1]] }, op, line: cl, inline: true, opts: '' });
          }
          while (!is('nl') && !is('eof') && !is('sym', '}')) p++;
        }
        p++;
        d.tables.push(tb); skipNl(); continue;
      }
      if (kw === 'enum') {
        p++; const line = t.line; const nm = name(); skipNl();
        if (!is('sym', '{')) { bad(line, `Enum ${nm} has no { body }.`); continue; }
        p++; const vals = [];
        while (!is('eof') && !is('sym', '}')) { skipNl(); if (is('sym', '}')) break; const v = next(); const s4 = settings(); vals.push({ v: v.v, note: valText((s4.find(x => x.k === 'note') || {}).v) }); while (!is('nl') && !is('eof') && !is('sym', '}')) p++; }
        p++; d.enums.push({ name: nm, vals, line }); skipNl(); continue;
      }
      if (kw === 'ref') {
        p++; const line = t.line; let nm = null;
        if (is('w') || is('qid')) nm = next().v;
        if (is('sym', ':')) { p++; refBody(line, nm); }
        else { skipNl(); if (is('sym', '{')) { p++; while (!is('eof') && !is('sym', '}')) { skipNl(); if (is('sym', '}')) break; refBody(peek().line, nm); skipNl(); } p++; } }
        skipNl(); continue;
      }
      if (kw === 'tablegroup') {
        p++; const line = t.line; const nm = name(); const st = settings(); skipNl();
        if (!is('sym', '{')) { bad(line, `TableGroup ${nm} has no { body }.`); continue; }
        p++; const ts = [];
        while (!is('eof') && !is('sym', '}')) { skipNl(); if (is('sym', '}')) break; if (is('w', 'note')) { while (!is('nl') && !is('eof')) p++; continue; } const x = name(); if (x) ts.push(x); while (!is('nl') && !is('eof') && !is('sym', '}')) p++; }
        p++; d.groups.push({ name: nm, tables: ts, color: valText((st.find(x => x.k === 'color') || {}).v), line }); skipNl(); continue;
      }
      if (kw === 'note') {  // sticky note
        p++; const nm = name(); skipNl();
        if (is('sym', '{')) { p++; skipNl(); const v = next(); d.notes.push({ name: nm, text: v && v.v }); skipNl(); if (is('sym', '}')) p++; }
        skipNl(); continue;
      }
      if (kw === 'tablepartial' || kw === 'records') { p++; name(); skipNl(); if (is('sym', '{')) { let depth = 0; do { const x = next(); if (x.t === 'sym' && x.v === '{') depth++; else if (x.t === 'sym' && x.v === '}') depth--; } while (depth && !is('eof')); } d.skipped.push(kw); skipNl(); continue; }
      bad(t.line, `"${clip(t.v, 30)}" is not a DBML keyword here. Expected Table, Enum, Ref, TableGroup, Note or Project.`);
      while (!is('nl') && !is('eof')) p++; skipNl();
    }
    return d;
  }
  function newDb(kind) { return { kind, tables: [], enums: [], refs: [], groups: [], notes: [], probs: [], project: {}, skipped: [] }; }

  /* SQL DDL: CREATE TABLE, CREATE TYPE ... AS ENUM, ALTER TABLE ... FOREIGN KEY */
  function parseSQL(src) {
    const d = newDb('SQL');
    const stmts = []; let cur = '', i = 0, line = 1, start = 1; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '#' && (i === 0 || src[i - 1] === '\n')) { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e === -1 ? n : e + 2; for (let k = i; k < end; k++) if (src[k] === '\n') line++; i = end; cur += ' '; continue; }
      if (c === "'" || c === '"' || c === '`' || c === '[' && /create|table|references|,|\(/i.test(cur.slice(-40))) {
        const close = c === '[' ? ']' : c; let j = i + 1; while (j < n && src[j] !== close) { if (src[j] === '\n') line++; if (src[j] === '\\' && c === "'") j++; j++; }
        cur += src.slice(i, j + 1); i = j + 1; continue;
      }
      if (c === ';') { if (cur.trim()) stmts.push({ s: cur, line: start }); cur = ''; i++; start = line; continue; }
      if ((i === 0 || src[i - 1] === '\n') && /^go[ \t]*(\r?\n|$)/i.test(src.slice(i, i + 4))) { if (cur.trim()) stmts.push({ s: cur, line: start }); cur = ''; i += 2; continue; }  // SQL Server batch separator
      if (c === '\n') { line++; if (!cur.trim()) start = line; }
      cur += c; i++;
    }
    if (cur.trim()) stmts.push({ s: cur, line: start });
    const unq = s => s.trim().replace(/^[`"\[]|[`"\]]$/g, '');
    const qn = s => s.split('.').map(unq).filter(Boolean).join('.');
    const splitTop = s => { const out = []; let depth = 0, b = '', q = null; for (const ch of s) { if (q) { b += ch; if (ch === q) q = null; continue; } if (ch === "'" || ch === '"' || ch === '`') { q = ch; b += ch; continue; } if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(b); b = ''; continue; } b += ch; } if (b.trim()) out.push(b); return out; };
    const ID = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\]|[\\w$]+)';
    const QID = `${ID}(?:\\s*\\.\\s*${ID})*`;
    const cols = s => splitTop(s).map(x => unq(x.trim().split(/\s+/)[0]));
    for (const { s, line } of stmts) {
      const st = s.trim();
      let m = st.match(new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:(?:global\\s+|local\\s+)?(?:temporary|temp)\\s+)?(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?(${QID})\\s*\\(`, 'i'));
      if (m) {
        const nm = qn(m[1]); const body = st.slice(st.indexOf('(', m[0].length - 1) + 1, st.lastIndexOf(')'));
        const tb = { name: nm, alias: null, cols: [], indexes: [], note: '', line, group: null };
        for (const part0 of splitTop(body)) {
          const part = part0.trim(); if (!part) continue;
          const up = part.toUpperCase();
          let mm;
          if ((mm = part.match(/^(?:constraint\s+\S+\s+)?primary\s+key\s*(?:clustered\s+|nonclustered\s+)?\(([^)]*)\)/i))) { const cs = cols(mm[1]); tb.indexes.push({ cols: cs, pk: true }); for (const c of tb.cols) if (cs.length === 1 && c.name === cs[0]) c.pk = true; continue; }
          if ((mm = part.match(new RegExp(`^(?:constraint\\s+(${ID})\\s+)?foreign\\s+key\\s*\\(([^)]*)\\)\\s*references\\s+(${QID})\\s*(?:\\(([^)]*)\\))?(.*)$`, 'is')))) {
            d.refs.push({ a: { table: nm, cols: cols(mm[2]) }, b: { table: qn(mm[3]), cols: mm[4] ? cols(mm[4]) : ['id'] }, op: '>', line, name: mm[1] ? unq(mm[1]) : null, opts: (mm[5].match(/on\s+(delete|update)\s+(cascade|set null|set default|restrict|no action)/gi) || []).join(', ').toLowerCase() }); continue;
          }
          if ((mm = part.match(/^(?:constraint\s+\S+\s+)?unique\s*(?:clustered\s+|nonclustered\s+)?(?:key|index)?\s*(?:[^\s(]+\s*)?\(([^)]*)\)/i))) { tb.indexes.push({ cols: cols(mm[1]), unique: true }); continue; }
          if (/^(?:key|index|fulltext|spatial)\b/i.test(part)) { const c2 = part.match(/\(([^)]*)\)/); if (c2) tb.indexes.push({ cols: cols(c2[1]) }); continue; }
          if (/^(?:constraint|check|exclude|period)\b/i.test(part)) continue;
          if (/^like\b/i.test(part)) continue;
          const cm = part.match(new RegExp(`^(${ID})\\s+(.*)$`, 's')); if (!cm) continue;
          const rest = cm[2];
          const tm = rest.match(/^((?:[\w$]+(?:\.[\w$]+)*(?:\s+(?:varying|precision|with(?:out)?\s+time\s+zone|unsigned|zerofill))*)(?:\s*\([^)]*\))?(?:\s*\[\s*\])*)/i);
          const type = tm ? tm[1].trim() : rest.split(/\s+/)[0];
          const col = { name: unq(cm[1]), type, pk: /primary\s+key/i.test(rest), inc: /auto_increment|autoincrement|identity|serial/i.test(rest + ' ' + type), notNull: /not\s+null/i.test(rest) || /primary\s+key/i.test(rest),
            unique: /\bunique\b/i.test(rest), def: ((rest.match(/default\s+('(?:[^']|'')*'|\([^)]*\)|[^\s,]+)/i) || [])[1] || ''), note: ((rest.match(/comment\s+'((?:[^']|'')*)'/i) || [])[1] || ''), line };
          tb.cols.push(col);
          const rm = rest.match(new RegExp(`references\\s+(${QID})\\s*(?:\\(([^)]*)\\))?`, 'i'));
          if (rm) d.refs.push({ a: { table: nm, cols: [col.name] }, b: { table: qn(rm[1]), cols: rm[2] ? cols(rm[2]) : ['id'] }, op: '>', line, inline: true, opts: '' });
          void up;
        }
        d.tables.push(tb); continue;
      }
      if (/^create\s+table\s+.*\bpartition\s+of\b/is.test(st)) { d.skipped.push('partition tables'); continue; }
      m = st.match(new RegExp(`^create\\s+type\\s+(${QID})\\s+as\\s+enum\\s*\\(([^)]*)\\)`, 'i'));
      if (m) { d.enums.push({ name: qn(m[1]), vals: (m[2].match(/'((?:[^']|'')*)'/g) || []).map(x => ({ v: x.slice(1, -1) })), line }); continue; }
      m = st.match(new RegExp(`^alter\\s+table\\s+(?:only\\s+)?(?:if\\s+exists\\s+)?(${QID})\\s+add\\s+(?:constraint\\s+(${ID})\\s+)?foreign\\s+key\\s*\\(([^)]*)\\)\\s*references\\s+(${QID})\\s*(?:\\(([^)]*)\\))?(.*)$`, 'is'));
      if (m) { d.refs.push({ a: { table: qn(m[1]), cols: cols(m[3]) }, b: { table: qn(m[4]), cols: m[5] ? cols(m[5]) : ['id'] }, op: '>', line, name: m[2] ? unq(m[2]) : null, opts: (m[6].match(/on\s+(delete|update)\s+(cascade|set null|set default|restrict|no action)/gi) || []).join(', ').toLowerCase() }); continue; }
      m = st.match(new RegExp(`^alter\\s+table\\s+(?:only\\s+)?(${QID})\\s+add\\s+(?:constraint\\s+\\S+\\s+)?primary\\s+key\\s*\\(([^)]*)\\)`, 'i'));
      if (m) { const tb = d.tables.find(x => x.name === qn(m[1])); if (tb) { const cs = cols(m[2]); tb.indexes.push({ cols: cs, pk: true }); if (cs.length === 1) { const c = tb.cols.find(x => x.name === cs[0]); if (c) c.pk = true; } } continue; }
      m = st.match(new RegExp(`^create\\s+(unique\\s+)?index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?(${ID})?\\s*on\\s+(?:only\\s+)?(${QID})\\s*(?:using\\s+\\w+\\s*)?\\(([^)]*)\\)`, 'i'));
      if (m) { const tb = d.tables.find(x => x.name === qn(m[3])); if (tb) tb.indexes.push({ cols: cols(m[4]), unique: !!m[1], name: m[2] ? unq(m[2]) : '' }); continue; }
    }
    return d;
  }

  /* resolve and check */
  function resolve(d) {
    const byName = new Map();
    for (const t of d.tables) { byName.set(t.name, t); if (t.alias) byName.set(t.alias, t); const short = t.name.split('.').pop(); if (!byName.has(short)) byName.set(short, t); if (t.name.startsWith('public.')) byName.set(t.name.slice(7), t); }
    const seen = new Set();
    for (const t of d.tables) {
      if (seen.has(t.name)) d.probs.push({ sev: 'error', line: t.line, text: `Table ${t.name} is defined twice.` }); seen.add(t.name);
      const cn = new Set();
      for (const c of t.cols) { if (cn.has(c.name)) d.probs.push({ sev: 'error', line: c.line, text: `Column ${t.name}.${c.name} is defined twice.` }); cn.add(c.name); }
      for (const ix of t.indexes) if (ix.pk && ix.cols.length === 1) { const c = t.cols.find(x => x.name === ix.cols[0]); if (c) c.pk = true; }
      if (!t.cols.some(c => c.pk) && !t.indexes.some(x => x.pk)) d.probs.push({ sev: 'note', line: t.line, text: `Table ${t.name} has no primary key.` });
    }
    const enums = new Set(d.enums.map(e => e.name));
    for (const r of d.refs) {
      r.ta = byName.get(r.a.table); r.tb = byName.get(r.b.table);
      for (const [side, tb, ep] of [['left', r.ta, r.a], ['right', r.tb, r.b]]) {
        if (!tb) { d.probs.push({ sev: 'error', line: r.line, text: `The ref points to table ${ep.table}, which is not defined.` }); continue; }
        for (const c of ep.cols) if (!tb.cols.some(x => x.name === c)) d.probs.push({ sev: 'error', line: r.line, text: `The ref points to column ${tb.name}.${c}, which is not defined.` });
        void side;
      }
      if (r.ta && r.tb && r.a.cols.length === 1 && r.b.cols.length === 1) {
        const ca = r.ta.cols.find(x => x.name === r.a.cols[0]), cb = r.tb.cols.find(x => x.name === r.b.cols[0]);
        const base = s => String(s || '').toLowerCase().replace(/\(.*$/, '').replace(/^(serial|bigserial)$/, m => m === 'serial' ? 'integer' : 'bigint').replace(/^int4$/, 'integer').replace(/^int8$/, 'bigint').replace(/^int$/, 'integer');
        if (ca && cb && ca.type && cb.type && base(ca.type) !== base(cb.type) && !enums.has(ca.type) && !enums.has(cb.type)) d.probs.push({ sev: 'warning', line: r.line, text: `${r.ta.name}.${ca.name} (${ca.type}) and ${r.tb.name}.${cb.name} (${cb.type}) have different types.` });
      }
    }
    for (const g of d.groups) for (const n of g.tables) { const t = byName.get(n); if (t) t.group = g; else d.probs.push({ sev: 'error', line: g.line, text: `TableGroup ${g.name} names table ${n}, which is not defined.` }); }
    for (const t of d.tables) for (const c of t.cols) if (c.type && /^[A-Za-z_][\w.]*$/.test(c.type) && enums.has(c.type)) c.enum = true;
    d.byName = byName;
  }

  /* layout: tables in columns by how many refs separate them from a table that refers to no other */
  const RH = 22, HH = 30, CW = 7.4, PADX = 12;
  function layout(d) {
    const ts = d.tables, idx = new Map(ts.map((t, i) => [t, i]));
    const parentsOf = ts.map(() => new Set());
    for (const r of d.refs) { if (!r.ta || !r.tb || r.ta === r.tb) continue; const [child, parent] = r.op === '<' ? [r.tb, r.ta] : [r.ta, r.tb]; parentsOf[idx.get(child)].add(idx.get(parent)); }
    const layer = ts.map(() => 0);
    for (let it = 0; it < ts.length; it++) { let ch = false; ts.forEach((t, i) => { for (const p of parentsOf[i]) if (layer[i] < layer[p] + 1 && layer[p] + 1 < ts.length) { layer[i] = layer[p] + 1; ch = true; } }); if (!ch) break; }
    const nL = Math.max(0, ...layer) + 1;
    let cols = Array.from({ length: nL }, () => []);
    ts.forEach((t, i) => cols[layer[i]].push(i));
    // split tall columns
    const MAXPER = Math.max(6, Math.ceil(Math.sqrt(ts.length * 1.6)));
    cols = cols.flatMap(c => { const out = []; for (let k = 0; k < c.length; k += MAXPER) out.push(c.slice(k, k + MAXPER)); return out.length ? out : [c]; });
    // order inside a column by the mean row of the tables it refers to (two passes)
    const pos = new Map();
    for (let pass = 0; pass < 3; pass++) {
      cols.forEach(c => c.forEach((i, k) => pos.set(i, k)));
      for (const c of cols) c.sort((x, y) => { const m = i => { const ps = [...parentsOf[i]]; return ps.length ? ps.reduce((a, p) => a + (pos.get(p) || 0), 0) / ps.length : pos.get(i); }; const gx = ts[x].group ? ts[x].group.name : '', gy = ts[y].group ? ts[y].group.name : ''; return gx.localeCompare(gy) || m(x) - m(y); });
    }
    const box = ts.map(t => { const w = Math.min(420, Math.max(160, PADX * 2 + CW * Math.max(t.name.length + 2, ...t.cols.map(c => c.name.length + (c.type || '').length + 6)))); return { w, h: HH + Math.max(1, t.cols.length) * RH + 6 }; });
    let x = 24; const GAPX = 90, GAPY = 30;
    let H = 0;
    for (const c of cols) {
      const w = Math.max(...c.map(i => box[i].w), 160);
      let y = 34;
      for (const i of c) { box[i].x = x; box[i].y = y; y += box[i].h + GAPY + (ts[i].group ? 14 : 0); }
      H = Math.max(H, y); x += w + GAPX;
    }
    return { box, W: x, H: H + 10 };
  }
  function svgEl(tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function draw() {
    const d = db, L = layout(d), svg = svgEl('svg', { viewBox: `0 0 ${L.W} ${L.H}`, width: L.W, height: L.H, role: 'img', 'aria-label': `ER diagram with ${d.tables.length} tables and ${d.refs.length} refs` });
    const idx = new Map(d.tables.map((t, i) => [t, i]));
    // groups behind: one shaded box per column for the tables of a group, the name on the first one
    for (const g of d.groups) {
      const bs = d.tables.filter(t => t.group === g).map(t => L.box[idx.get(t)]);
      const byX = new Map(); for (const b of bs) { if (!byX.has(b.x)) byX.set(b.x, []); byX.get(b.x).push(b); }
      let first = true;
      for (const [x, col] of [...byX].sort((p, q) => p[0] - q[0])) {
        const y0 = Math.min(...col.map(b => b.y)) - 22, y1 = Math.max(...col.map(b => b.y + b.h)) + 8, w = Math.max(...col.map(b => b.w));
        svg.append(svgEl('rect', { x: x - 8, y: y0, width: w + 16, height: y1 - y0, rx: 10, class: 'er-g', stroke: /^#[0-9a-f]{3,8}$/i.test(g.color || '') ? g.color : null }));
        svg.append(svgEl('text', { x: x, y: y0 + 14, class: 'er-gl' }, first ? g.name : g.name + ' (cont.)'));
        first = false;
      }
    }
    const rowY = (t, col) => { const b = L.box[idx.get(t)]; const k = Math.max(0, t.cols.findIndex(c => c.name === col)); return b.y + HH + k * RH + RH / 2; };
    const edges = [];
    for (const r of d.refs) {
      if (!r.ta || !r.tb) continue;
      const A = L.box[idx.get(r.ta)], B = L.box[idx.get(r.tb)];
      const ya = rowY(r.ta, r.a.cols[0]), yb = rowY(r.tb, r.b.cols[0]);
      let xa, xb, da, dbx;
      if (r.ta === r.tb) { xa = A.x + A.w; xb = A.x + A.w; da = 40; dbx = 40; }
      else if (A.x + A.w < B.x) { xa = A.x + A.w; xb = B.x; da = 1; dbx = -1; }
      else if (B.x + B.w < A.x) { xa = A.x; xb = B.x + B.w; da = -1; dbx = 1; }
      else { xa = A.x + A.w; xb = B.x + B.w; da = 1; dbx = 1; }
      const k = r.ta === r.tb ? 1 : Math.max(40, Math.abs(xb - xa) / 2);
      const path = svgEl('path', { d: `M${xa},${ya} C${xa + da * k},${ya} ${xb + dbx * k},${yb} ${xb},${yb}`, class: 'er-r' });
      path._ref = r; svg.append(path); edges.push(path);
      const card = { '>': ['*', '1'], '<': ['1', '*'], '-': ['1', '1'], '<>': ['*', '*'] }[r.op] || ['', ''];
      svg.append(svgEl('text', { x: xa + (da > 0 ? 6 : -12), y: ya - 4, class: 'er-card' }, card[0]), svgEl('text', { x: xb + (dbx > 0 ? 6 : -12), y: yb - 4, class: 'er-card' }, card[1]));
    }
    d.tables.forEach((t, i) => {
      const b = L.box[i], g = svgEl('g', { class: 'er-t', transform: `translate(${b.x},${b.y})`, tabindex: 0, role: 'button', 'aria-label': `Table ${t.name}` });
      g.append(svgEl('rect', { width: b.w, height: b.h, rx: 6, class: 'box' }), svgEl('rect', { width: b.w, height: HH, rx: 6, class: 'head', fill: /^#[0-9a-f]{3,8}$/i.test(t.color || '') ? t.color : null }));
      g.append(svgEl('text', { x: PADX, y: 20, class: 'hd' }, clip(t.name + (t.alias ? ` (${t.alias})` : ''), 52)));
      t.cols.forEach((c, k) => {
        const y = HH + k * RH + 15;
        g.append(svgEl('text', { x: PADX, y, class: c.pk ? 'pk' : null }, clip((c.pk ? '\u{1F511} ' : '') + c.name + (c.notNull && !c.pk ? ' *' : ''), 34)));
        g.append(svgEl('text', { x: b.w - PADX, y, 'text-anchor': 'end', class: 'ty' }, clip(c.type, 22)));
      });
      if (!t.cols.length) g.append(svgEl('text', { x: PADX, y: HH + 15, class: 'ty' }, '(no columns)'));
      g.addEventListener('click', () => pick(t)); g.addEventListener('keydown', e => { if (e.key === 'Enter') pick(t); });
      g._t = t; svg.append(g);
    });
    ui.svg = svg; ui.edges = edges; ui.wrap.textContent = ''; ui.wrap.append(svg);
    zoom(ui.z);
  }
  function zoom(z) { ui.z = Math.max(0.2, Math.min(2.5, z)); const s = ui.svg; const vb = s.viewBox.baseVal; s.setAttribute('width', Math.round(vb.width * ui.z)); s.setAttribute('height', Math.round(vb.height * ui.z)); ui.zt.textContent = Math.round(ui.z * 100) + ' %'; }
  function pick(t) {
    selT = t;
    ui.svg.querySelectorAll('.er-t').forEach(g => g.classList.toggle('on', g._t === t));
    ui.edges.forEach(e => e.classList.toggle('on', e._ref.ta === t || e._ref.tb === t));
    const det = ui.det; det.textContent = '';
    det.append(el('h3', t.name + (t.alias ? ` (alias ${t.alias})` : ''), 'mono'));
    det.append(kv([['Group', t.group ? t.group.name : ''], ['Note', t.note], ['Line', String(t.line)]]));
    det.append(el('div', null, 'tblwrap short', null, [table(['Column', 'Type', 'Key', 'Null', 'Default', 'Note'], t.cols.map(c => [c.name, c.type + (c.enum ? ' (enum)' : ''), [c.pk ? 'PK' : '', c.unique ? 'unique' : '', c.inc ? 'increment' : '', db.refs.some(r => r.ta === t && r.a.cols.includes(c.name)) ? 'FK' : ''].filter(Boolean).join(', '), c.pk || c.notNull ? 'not null' : '', c.def, c.note]))]));
    if (t.indexes.length) { det.append(el('h3', 'Indexes')); det.append(table(['Columns', 'Kind', 'Name'], t.indexes.map(x => [x.cols.join(', '), [x.pk ? 'primary key' : '', x.unique ? 'unique' : '', x.type || ''].filter(Boolean).join(', ') || 'index', x.name || '']))); }
    const rs = db.refs.filter(r => r.ta === t || r.tb === t);
    if (rs.length) { det.append(el('h3', 'Refs')); det.append(table(['From', '', 'To', 'Options'], rs.map(r => [`${r.a.table}.${r.a.cols.join(',')}`, r.op, `${r.b.table}.${r.b.cols.join(',')}`, r.opts || '']))); }
  }
  function render(info) {
    const out = $('out'); out.textContent = '';
    const errs = db.probs.filter(p => p.sev === 'error').length;
    out.append(stats([['Source', db.kind === 'SQL' ? 'SQL DDL' : 'DBML' + (db.project.dbType ? `, ${db.project.dbType}` : '')], ['Tables', int(db.tables.length)], ['Refs', int(db.refs.length)], ['Problems', db.probs.filter(p => p.sev !== 'note').length ? int(db.probs.filter(p => p.sev !== 'note').length) : 'none', errs ? 'bad' : '']]));
    if (db.project.note || db.project.name) out.append(el('p', [db.project.name ? `Project ${db.project.name}.` : '', db.project.note || ''].join(' '), 'small mut'));
    const q = el('input', null, null, { type: 'search', placeholder: 'Find a table or column', 'aria-label': 'Find a table or column', autocomplete: 'off' });
    const zt = el('span', null, 'small mut');
    const bar = el('div', null, 'tcbar', null, [q, el('button', '−', null, { type: 'button', id: 'zout', 'aria-label': 'Zoom out' }), zt, el('button', '+', null, { type: 'button', id: 'zin', 'aria-label': 'Zoom in' }), el('button', 'Fit', null, { type: 'button', id: 'zfit' })]);
    const wrap = el('div', null, 'erwrap'), det = el('div', null, 'det');
    out.append(bar, wrap, el('div', null, 'tcgrid wide', null, [det, el('div', null, 'side2')]));
    ui = { wrap, det, z: 1, zt, q };
    draw();
    bar.querySelector('#zin').addEventListener('click', () => zoom(ui.z * 1.25));
    bar.querySelector('#zout').addEventListener('click', () => zoom(ui.z / 1.25));
    bar.querySelector('#zfit').addEventListener('click', fit);
    q.addEventListener('input', () => {
      const s = q.value.trim().toLowerCase(); if (!s) return;
      const t = db.tables.find(x => x.name.toLowerCase().includes(s)) || db.tables.find(x => x.cols.some(c => c.name.toLowerCase().includes(s)));
      if (t) { pick(t); const g = [...ui.svg.querySelectorAll('.er-t')].find(x => x._t === t); if (g) { const b = g.getBBox(), m = g.transform.baseVal.consolidate().matrix; wrap.scrollTo({ left: Math.max(0, (m.e + b.width / 2) * ui.z - wrap.clientWidth / 2), top: Math.max(0, m.f * ui.z - 40), behavior: 'smooth' }); } }
    });
    fit();
    // side: enums, groups, checks
    const side = out.querySelector('.side2');
    if (db.enums.length) { side.append(el('h3', 'Enums')); side.append(el('div', null, 'tblwrap short', null, [table(['Enum', 'Values'], db.enums.map(e => [e.name, e.vals.map(v => v.v).join(', ')]))])); }
    if (db.groups.length) { side.append(el('h3', 'Table groups')); side.append(table(['Group', 'Tables'], db.groups.map(g => [g.name, g.tables.join(', ')]))); }
    if (db.notes.length) { side.append(el('h3', 'Notes')); for (const n of db.notes) side.append(el('p', `${n.name}: ${n.text || ''}`, 'small')); }
    side.append(el('h3', 'Checks'));
    if (db.probs.length) { const ul = el('ul', null, 'problems small'); for (const p of db.probs.slice(0, 300)) ul.append(el('li', null, null, null, [el('span', p.sev === 'error' ? 'Error' : p.sev === 'warning' ? 'Warning' : 'Note', 'sev ' + (p.sev === 'error' ? 'warn' : 'mut')), document.createTextNode(` line ${p.line}: ${p.text}`)])); side.append(ul); }
    else side.append(el('p', 'Every ref points to a table and column that exist, and no names are defined twice.', 'small ok'));
    if (db.skipped.length) { const c = {}; db.skipped.forEach(k => c[k] = (c[k] || 0) + 1); side.append(el('p', 'Not drawn: ' + Object.entries(c).map(([k, v]) => `${k} (${v})`).join(', ') + '.', 'small mut')); }
    if (db.tables.length) pick(db.tables[0]); else det.append(el('p', db.kind === 'SQL' ? 'No CREATE TABLE statement was found.' : 'No Table was found in this file.', 'warn'));
  }
  function fit() { const vb = ui.svg.viewBox.baseVal; zoom(Math.min(1, (ui.wrap.clientWidth - 4) / vb.width)); }

  wire(async (text, info) => {
    if (text.indexOf('\0') !== -1) throw new Error('This is a binary file. Open a .dbml file or a .sql file with CREATE TABLE statements.');
    const sql = /\.sql$/i.test(info.name) || (!/^\s*(table|enum|ref|project|tablegroup|note)\b/im.test(text) && /create\s+table/i.test(text));
    db = sql ? parseSQL(text) : parseDBML(text);
    if (!db.tables.length && !sql && /create\s+table/i.test(text)) db = parseSQL(text);
    resolve(db);
    if (!db.tables.length && !db.enums.length) throw new Error(sql ? 'No CREATE TABLE statement was found in this SQL file.' : 'No Table, Enum or Ref was found. Is this a DBML file? SQL files need CREATE TABLE statements.');
    shown(info, `${db.kind === 'SQL' ? 'SQL' : 'DBML'}, ${plural(db.tables.length, 'table')}, ${plural(db.refs.length, 'ref')}, ${size(info.size)}`);
    render(info);
    const np = db.probs.filter(p => p.sev !== 'note').length;
    done(info, np ? `The checks found ${plural(np, 'problem')}.` : '');
  }, { maxBytes: 20 * 1048576 });
  self.zovoTest = () => db && { kind: db.kind, tables: db.tables.length, cols: db.tables.reduce((a, t) => a + t.cols.length, 0), refs: db.refs.length, enums: db.enums.length, groups: db.groups.length,
    probs: db.probs.slice(0, 10).map(p => p.sev + ' ' + p.line + ': ' + p.text), det: ui.det.innerText.slice(0, 500), svgTables: ui.svg.querySelectorAll('.er-t').length, svgEdges: ui.edges.length };
  self.zovoReady = true;
})();
