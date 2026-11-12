/* Zovo SARIF Viewer Online (TOOLCHK2, wave18). Reads a .sarif log (SARIF 2.1.0) in this tab and shows its results
   grouped by rule, file, level or tool, worst first, with filters for level, tool, baseline state and suppressions,
   and a details pane with the location, snippet, rule help, CWE, code flow steps and fingerprints. Nothing is sent
   anywhere (CSP connect-src 'none'). Messages and rule help are shown as plain text; only http and https links are
   made clickable. Rewritten from the HTOOL7 draft. */
(function () {
  'use strict';
  const { $, el, say, int, plural, clip, kv, stats, wire, shown, done } = self.Z;
  const RANK = { error: 0, warning: 1, note: 2, none: 3 };
  const MAXROWS = 5000;
  let log = null, all = [], sel = null;
  const safeUrl = u => { try { const x = new URL(String(u)); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch (e) { return null; } };
  const link = (u, text) => { const h = safeUrl(u); return h ? el('a', text || h, null, { href: h, rel: 'noopener noreferrer', target: '_blank' }) : el('span', text || String(u || '')); };

  /* parsing */
  function msgText(m, rule) {
    if (!m) return '';
    let s = m.text != null ? m.text : m.markdown != null ? m.markdown : '';
    if (!s && m.id && rule && rule.messageStrings && rule.messageStrings[m.id]) s = rule.messageStrings[m.id].text || '';
    if (Array.isArray(m.arguments)) s = String(s).replace(/\{(\d+)\}/g, (x, n) => m.arguments[n] != null ? String(m.arguments[n]) : x);
    return String(s).replace(/\[([^\]]+)\]\((\d+)\)/g, '$1');  // "[text](1)" links to related locations
  }
  function uriOf(al, run) {
    if (!al) return '';
    let u = al.uri || '';
    if (!u && al.index != null && run.artifacts && run.artifacts[al.index]) u = (run.artifacts[al.index].location || {}).uri || '';
    const base = al.uriBaseId && run.originalUriBaseIds && run.originalUriBaseIds[al.uriBaseId];
    if (base && base.uri && !/^[a-z]+:/i.test(u)) u = base.uri.replace(/\/?$/, '/') + u;
    else if (al.uriBaseId && !/^[a-z]+:/i.test(u)) u = '%' + String(al.uriBaseId).replace(/^%+|%+$/g, '') + '%/' + u;
    try { u = decodeURIComponent(u); } catch (e) { /* keep as is */ }
    return u.replace(/^file:\/\//, '');
  }
  function locOf(l, run) {
    const p = l && l.physicalLocation; if (!p) { const lg = l && l.logicalLocations && l.logicalLocations[0]; return lg ? { uri: lg.fullyQualifiedName || lg.name || '', line: null } : null; }
    const r = p.region || {};
    return { uri: uriOf(p.artifactLocation, run), line: r.startLine || null, col: r.startColumn || null, endLine: r.endLine || null, snippet: r.snippet && (r.snippet.text || ''),
      ctx: p.contextRegion && p.contextRegion.snippet && p.contextRegion.snippet.text, msg: l.message ? msgText(l.message) : '' };
  }
  const where = l => l ? (l.uri || '(no file)') + (l.line ? ':' + l.line + (l.col ? ':' + l.col : '') : '') : '(no location)';
  function parse(data) {
    if (!data || typeof data !== 'object') throw new Error('This file is JSON, but not a SARIF log: it has no "runs" list.');
    let runs = data.runs;
    if (!Array.isArray(runs)) { if (data.tool && data.results) runs = [data]; else throw new Error('This file is JSON, but not a SARIF log: it has no "runs" list.'); }
    const out = [], tools = [];
    runs.forEach((run, ri) => {
      if (!run || typeof run !== 'object') return;
      const drv = (run.tool && (run.tool.driver || run.tool)) || {};
      const tname = (drv.name || 'unknown tool') + (runs.length > 1 && tools.some(t => t.name === drv.name) ? ` (run ${ri + 1})` : '');
      const rules = [].concat(drv.rules || []);
      for (const ext of (run.tool && run.tool.extensions) || []) for (const r of ext.rules || []) rules.push(r);
      const byId = new Map(); for (const r of rules) if (r && r.id) byId.set(r.id, r);
      const inv = (run.invocations || [])[0];
      const notes = [];
      for (const i of run.invocations || []) for (const n of [].concat(i.toolExecutionNotifications || [], i.toolConfigurationNotifications || [])) notes.push((n.level ? n.level + ': ' : '') + msgText(n.message));
      const tool = { name: tname, version: drv.semanticVersion || drv.version || '', rules: rules.length, results: 0, ok: inv ? inv.executionSuccessful !== false : true, notes, info: drv.informationUri };
      tools.push(tool);
      (run.results || []).forEach((r, k) => {
        if (!r || typeof r !== 'object') return;
        const rule = (r.ruleIndex != null && rules[r.ruleIndex]) || byId.get(r.ruleId) || (r.rule && (byId.get(r.rule.id) || (r.rule.index != null && rules[r.rule.index]))) || null;
        const ruleId = r.ruleId || (r.rule && r.rule.id) || (rule && rule.id) || '';
        const kind = r.kind || 'fail';
        const level = r.level || (kind !== 'fail' ? 'none' : (rule && rule.defaultConfiguration && rule.defaultConfiguration.level) || 'warning');
        const locs = (r.locations || []).map(l => locOf(l, run)).filter(Boolean);
        const props = Object.assign({}, rule && rule.properties, r.properties);
        const tags = [].concat(props.tags || []);
        const cwe = tags.map(t => String(t).match(/cwe[-/]?(\d+)/i)).filter(Boolean).map(m => Number(m[1]));
        const sup = (r.suppressions || []).filter(s => s && s.status !== 'rejected');
        const flows = [];
        for (const cf of r.codeFlows || []) for (const tf of cf.threadFlows || []) flows.push((tf.locations || []).map(x => ({ loc: locOf(x.location, run), msg: x.location && x.location.message ? msgText(x.location.message) : '', imp: x.importance })));
        out.push({ n: out.length, tool: tname, ruleId, ruleName: rule && rule.name || '', rule, level: RANK[level] != null ? level : 'warning', kind, message: msgText(r.message, rule) || '(no message)',
          loc: locs[0] || null, locs, related: (r.relatedLocations || []).map(l => locOf(l, run)).filter(Boolean), flows,
          baseline: r.baselineState || '', suppressed: sup.length > 0, sup, sev: props['security-severity'] || '', precision: props.precision || '', tags, cwe: [...new Set(cwe)],
          fp: Object.assign({}, r.partialFingerprints, r.fingerprints), help: rule ? (rule.help && (rule.help.text || rule.help.markdown)) || (rule.fullDescription && (rule.fullDescription.text || rule.fullDescription.markdown)) || (rule.shortDescription && rule.shortDescription.text) || '' : '',
          helpUri: (rule && rule.helpUri) || '' });
        tool.results++;
      });
    });
    return { version: data.version || '', schema: data.$schema || '', runs: runs.length, tools, results: out };
  }

  /* view */
  let ui = null;
  function render(info) {
    const out = $('out'); out.textContent = '';
    const r = log.results, cnt = l => r.filter(x => x.level === l && !x.suppressed).length;
    const files = new Set(r.map(x => x.loc && x.loc.uri).filter(Boolean));
    out.append(stats([['Results', int(r.length)], ['Errors', int(cnt('error')), cnt('error') ? 'bad' : ''], ['Warnings', int(cnt('warning'))], ['Notes', int(cnt('note'))],
      ['Tools', log.tools.map(t => t.name).join(', ')], ['Rules', int(log.tools.reduce((a, t) => a + t.rules, 0))], ['Files with results', int(files.size)], ['Suppressed', int(r.filter(x => x.suppressed).length)]]));
    for (const t of log.tools) {
      if (!t.ok) out.append(el('p', `${t.name} did not finish its run (executionSuccessful is false), so this log may be missing results.` + (t.notes.length ? ' Its notes: ' + t.notes.slice(0, 3).join(' | ') : ''), 'warn'));
    }
    if (log.version && log.version !== '2.1.0') out.append(el('p', `This log says SARIF ${log.version}. The page reads it with the 2.1.0 rules, so some fields may be missing.`, 'small mut'));
    if (!r.length) {
      out.append(el('p', null, 'ok', null, [el('strong', 'No results. '), document.createTextNode(log.tools.map(t => `${t.name}${t.version ? ' ' + t.version : ''} ran ${plural(t.rules, 'rule')}`).join('; ') + ' and found nothing.')]));
      return;
    }
    const mk = (tag, attrs, opts) => { const s = el(tag, null, null, attrs); for (const [v, t] of opts) s.append(el('option', t, null, { value: v })); return s; };
    const q = el('input', null, null, { type: 'search', placeholder: 'Filter by text, rule or file', 'aria-label': 'Filter by text, rule or file', autocomplete: 'off' });
    const gb = mk('select', { 'aria-label': 'Group by' }, [['rule', 'Group by rule'], ['file', 'Group by file'], ['level', 'Group by level'], ['tool', 'Group by tool'], ['baseline', 'Group by baseline state'], ['none', 'No groups']]);
    const lv = mk('select', { 'aria-label': 'Level' }, [['', 'All levels'], ['error', 'Errors'], ['warning', 'Warnings'], ['note', 'Notes'], ['none', 'None']]);
    const tl = mk('select', { 'aria-label': 'Tool' }, [['', 'All tools']].concat(log.tools.map(t => [t.name, t.name])));
    const bases = [...new Set(r.map(x => x.baseline).filter(Boolean))];
    const bl = mk('select', { 'aria-label': 'Baseline state' }, [['', 'Any baseline state']].concat(bases.map(b => [b, 'Only ' + b])));
    const sp = mk('select', { 'aria-label': 'Suppressed results' }, [['hide', 'Hide suppressed'], ['show', 'Show suppressed'], ['only', 'Only suppressed']]);
    const bar = el('div', null, 'tcbar', null, [q, gb, lv, log.tools.length > 1 ? tl : null, bases.length ? bl : null, r.some(x => x.suppressed) ? sp : null]);
    const note = el('p', null, 'small mut'), wrap = el('div', null, 'tblwrap'), det = el('div', null, 'det');
    out.append(bar, note, el('div', null, 'tcgrid wide', null, [wrap, det]));
    ui = { q, gb, lv, tl, bl, sp, note, wrap, det };
    [q, gb, lv, tl, bl, sp].forEach(x => x.addEventListener(x === q ? 'input' : 'change', list));
    list();
  }
  function list() {
    const { q, gb, lv, tl, bl, sp, note, wrap, det } = ui;
    const text = q.value.trim().toLowerCase();
    let rs = log.results.filter(x => (!lv.value || x.level === lv.value) && (!tl.value || x.tool === tl.value) && (!bl.value || x.baseline === bl.value) &&
      (sp.value === 'show' || (sp.value === 'only' ? x.suppressed : !x.suppressed)) &&
      (!text || (x.ruleId + ' ' + x.ruleName + ' ' + x.message + ' ' + (x.loc ? where(x.loc) : '')).toLowerCase().includes(text)));
    const key = x => gb.value === 'rule' ? x.ruleId + (x.ruleName && x.ruleName !== x.ruleId ? ' (' + x.ruleName + ')' : '') : gb.value === 'file' ? (x.loc && x.loc.uri) || '(no file)' : gb.value === 'level' ? x.level : gb.value === 'tool' ? x.tool : gb.value === 'baseline' ? x.baseline || '(no baseline state)' : '';
    const groups = new Map();
    for (const x of rs) { const k = key(x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    for (const g of groups.values()) g.sort((a, b) => RANK[a.level] - RANK[b.level] || ((a.loc && a.loc.uri) || '').localeCompare((b.loc && b.loc.uri) || '') || (a.loc && a.loc.line || 0) - (b.loc && b.loc.line || 0));
    const order = [...groups].sort((a, b) => Math.min(...a[1].map(x => RANK[x.level])) - Math.min(...b[1].map(x => RANK[x.level])) || b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
    const t = el('table', null, 'dtab pick'), tb = el('tbody');
    const short = l => { if (!l) return ''; const p = (l.uri || '').split('/'); return (p.length > 2 ? '\u2026/' : '') + p.slice(-2).join('/') + (l.line && gb.value !== 'file' ? ':' + l.line : ''); };
    const heads = gb.value === 'rule' ? ['Level', 'Location', 'Message'] : gb.value === 'file' ? ['Level', 'Line', 'Rule', 'Message'] : ['Level', 'Rule', 'Location', 'Message'];
    t.append(el('thead', null, null, null, [el('tr', null, null, null, heads.map(h => el('th', h)))]), tb);
    let shownN = 0;
    for (const [k, g] of order) {
      if (shownN >= MAXROWS) break;
      if (gb.value !== 'none') tb.append(el('tr', null, 'grp', null, [el('th', `${k} (${int(g.length)})`, null, { colspan: heads.length, scope: 'colgroup' })]));
      for (const x of g) {
        if (shownN++ >= MAXROWS) break;
        const tr = el('tr', null, x === sel ? 'on' : '', { tabindex: 0 });
        const lvc = el('td', null, null, null, [el('span', x.level, 'pill ' + x.level)]), msg = el('td', clip(x.message, 200), null, { title: clip(x.message, 600) });
        const loc = el('td', short(x.loc), 'mono', { title: where(x.loc) }), rule = el('td', x.ruleId, 'mono');
        if (gb.value === 'rule') tr.append(lvc, loc, msg); else if (gb.value === 'file') tr.append(lvc, el('td', x.loc && x.loc.line || '', 'mono'), rule, msg); else tr.append(lvc, rule, loc, msg);
        const go = () => { tb.querySelectorAll('tr.on').forEach(z => z.classList.remove('on')); tr.classList.add('on'); detail(x); };
        tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        tb.append(tr);
      }
    }
    wrap.textContent = ''; wrap.append(t);
    note.textContent = `${int(rs.length)} of ${int(log.results.length)} results` + (rs.length > MAXROWS ? `, the first ${int(MAXROWS)} are listed` : '') + (groups.size > 1 ? ` in ${plural(groups.size, 'group')}` : '') + '.';
    if (!rs.length) wrap.append(el('p', 'No result matches these filters.', 'small mut'));
    if (!sel || !rs.includes(sel)) { if (rs.length) { detail(order[0][1][0]); const f = tb.querySelector('tr:not(.grp)'); if (f) f.classList.add('on'); } else { det.textContent = ''; sel = null; } }
  }
  function detail(x) {
    sel = x; const det = ui.det; det.textContent = '';
    det.append(el('h3', null, null, null, [el('span', x.level, 'pill ' + x.level), document.createTextNode(' ' + (x.ruleId || '(no rule id)') + (x.ruleName && x.ruleName !== x.ruleId ? ' · ' + x.ruleName : ''))]));
    det.append(el('p', x.message, 'pre'));
    const cweBox = x.cwe.length ? el('span') : null;
    if (cweBox) x.cwe.forEach((c, i) => { if (i) cweBox.append(', '); cweBox.append(link(`https://cwe.mitre.org/data/definitions/${c}.html`, 'CWE-' + c)); });
    det.append(kv([['Location', where(x.loc)], ['Tool', x.tool], ['Kind', x.kind !== 'fail' ? x.kind : ''], ['Baseline', x.baseline], ['Security severity', x.sev], ['Precision', x.precision], ['CWE', cweBox],
      ['Tags', x.tags.filter(t => !/cwe/i.test(t)).join(', ')], ['Help', x.helpUri ? link(x.helpUri) : ''],
      ['Suppressed', x.sup.length ? x.sup.map(s => (s.kind || 'suppressed') + (s.status ? ' (' + s.status + ')' : '') + (s.justification ? ': ' + s.justification : '')).join('; ') : '']]));
    if (x.loc && (x.loc.snippet || x.loc.ctx)) { det.append(el('h3', 'Snippet')); det.append(el('div', clip(x.loc.snippet || x.loc.ctx, 4000), 'pre')); }
    if (x.flows.length) {
      det.append(el('h3', `Code flow (${plural(x.flows[0].length, 'step')}${x.flows.length > 1 ? `, 1 of ${x.flows.length} flows` : ''})`));
      const ol = el('ol', null, 'small');
      for (const s of x.flows[0].slice(0, 200)) ol.append(el('li', null, null, null, [el('span', where(s.loc), 'mono'), document.createTextNode(s.msg || (s.loc && s.loc.msg) ? ': ' + (s.msg || s.loc.msg) : '')]));
      det.append(ol);
    }
    if (x.locs.length > 1 || x.related.length) {
      det.append(el('h3', 'Other locations'));
      const ul = el('ul', null, 'small');
      for (const l of x.locs.slice(1).concat(x.related).slice(0, 100)) ul.append(el('li', null, null, null, [el('span', where(l), 'mono'), document.createTextNode(l.msg ? ': ' + l.msg : '')]));
      det.append(ul);
    }
    if (x.help) { det.append(el('h3', 'Rule help')); det.append(el('div', clip(x.help, 8000), 'pre')); }
    const fps = Object.entries(x.fp);
    if (fps.length) { det.append(el('h3', 'Fingerprints')); det.append(kv(fps.slice(0, 12).map(([k, v]) => [k, String(v)]))); }
  }

  wire(async (text, info) => {
    let data;
    try { data = JSON.parse(text); } catch (e) {
      const m = String(e.message).match(/position (\d+)/);
      const lc = m ? self.Z.lineCol(text, Number(m[1])) : null;
      throw new Error(`This file is not valid JSON${lc ? ` (line ${lc.line}, column ${lc.col})` : ''}: ${e.message}. A SARIF log is a JSON file. If it was cut short, run the scan again.`);
    }
    log = parse(data); sel = null;
    shown(info, `SARIF ${log.version || '(no version)'}, ${plural(log.runs, 'run')}, ${plural(log.results.length, 'result')}, ${self.Z.size(info.size)}`);
    render(info);
    done(info);
  }, { maxBytes: 300 * 1048576, utf8: true });
  self.zovoTest = () => log && { results: log.results.length, tools: log.tools.map(t => t.name + ' ' + t.version + ' rules ' + t.rules), note: ui && ui.note.textContent,
    det: ui && ui.det.innerText.slice(0, 900), firstRows: ui && [...ui.wrap.querySelectorAll('tbody tr')].slice(0, 6).map(r => r.innerText.replace(/\t/g, ' | ')) };
  self.zovoReady = true;
})();
