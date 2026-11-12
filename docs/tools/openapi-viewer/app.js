/* Zovo OpenAPI Viewer Online (TOOLCHK2, wave18). Reads an OpenAPI 3.x or Swagger 2.0 spec (YAML or JSON) in this tab
   and shows its operations by tag, each with parameters, request body, responses and schemas ($ref resolved inside
   the file), the component schemas, and a short lint. YAML is read by js-yaml 4.1.0 (pinned on cdn.jsdelivr.net with
   SRI in the import map), which builds plain data and never runs code. Nothing is sent anywhere (CSP connect-src
   'none'); text from the spec is shown with textContent only, and only http and https links are made clickable.
   Rewritten from the HTOOL10 draft (which used its own partial YAML reader). */
import { load as yamlLoad } from 'js-yaml';
const { $, el, say, int, plural, clip, table, kv, stats, wire, shown, done, size } = self.Z;
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
let spec = null, ops = [], ui = null, lint = [];

const safeUrl = u => { try { const x = new URL(String(u)); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch (e) { return null; } };
const link = (u, text) => { const h = safeUrl(u); return h ? el('a', text || h, null, { href: h, rel: 'noopener noreferrer', target: '_blank' }) : el('span', text || String(u || '')); };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function ptr(doc, ref) {  // internal JSON pointer only (#/components/schemas/X); external refs are not fetched
  if (typeof ref !== 'string' || !ref.startsWith('#')) return undefined;
  let cur = doc;
  for (const raw of ref.slice(1).split('/').slice(1)) { const k = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~'); if (!isObj(cur) && !Array.isArray(cur)) return undefined; cur = cur[k]; if (cur === undefined) return undefined; }
  return cur;
}
const deref = (o, n = 0) => (isObj(o) && typeof o.$ref === 'string' && n < 20) ? deref(ptr(spec, o.$ref) ?? o, n + 1) : o;
const refName = r => String(r).split('/').pop();

/* reading */
function parse(text, name) {
  const t = text.replace(/^﻿/, '');
  let doc;
  if (/^\s*[{[]/.test(t)) { try { doc = JSON.parse(t); } catch (e) { doc = null; } }
  if (doc == null) {
    try { doc = yamlLoad(t, { filename: name }); }
    catch (e) {
      const m = e.mark ? ` at line ${e.mark.line + 1}, column ${e.mark.column + 1}` : '';
      throw new Error(`This file is not valid YAML or JSON${m}: ${String(e.reason || e.message).split('\n')[0]}.`);
    }
  }
  if (!isObj(doc)) throw new Error('This file is YAML or JSON, but not an OpenAPI or Swagger spec: it is not an object.');
  const v = doc.openapi || doc.swagger;
  if (!v) throw new Error('This file has no "openapi" or "swagger" field, so it is not an OpenAPI or Swagger spec. AsyncAPI and plain JSON Schema files are not read here.');
  return doc;
}
function collect() {
  ops = [];
  const paths = isObj(spec.paths) ? spec.paths : {};
  for (const p of Object.keys(paths)) {
    const item = deref(paths[p]);
    if (!isObj(item)) continue;
    for (const m of METHODS) {
      const op = item[m]; if (!isObj(op)) continue;
      const tags = Array.isArray(op.tags) && op.tags.length ? op.tags.map(String) : ['(no tag)'];
      ops.push({ path: p, method: m, op, item, tags, id: op.operationId || '', summary: op.summary || '', deprecated: !!op.deprecated, hook: false });
    }
  }
  const hooks = isObj(spec.webhooks) ? spec.webhooks : {};
  for (const h of Object.keys(hooks)) {
    const item = deref(hooks[h]); if (!isObj(item)) continue;
    for (const m of METHODS) if (isObj(item[m])) ops.push({ path: h, method: m, op: item[m], item, tags: ['Webhooks'], id: item[m].operationId || '', summary: item[m].summary || '', deprecated: !!item[m].deprecated, hook: true });
  }
}
function schemasOf() { return spec.swagger ? (isObj(spec.definitions) ? spec.definitions : {}) : (isObj(spec.components) && isObj(spec.components.schemas) ? spec.components.schemas : {}); }
function check() {
  lint = [];
  const L = (sev, where, text) => { if (lint.length < 2000) lint.push({ sev, where, text }); };
  const info = isObj(spec.info) ? spec.info : {};
  if (!info.title) L('error', 'info.title', 'The spec has no info.title.');
  if (!info.version) L('error', 'info.version', 'The spec has no info.version.');
  if (spec.openapi && !(Array.isArray(spec.servers) && spec.servers.length)) L('warning', 'servers', 'No servers are listed, so clients will call the host the spec was loaded from.');
  if (!isObj(spec.paths) && !isObj(spec.webhooks)) L('error', 'paths', 'The spec has no paths.');
  const ids = new Map();
  for (const o of ops) {
    const w = `${o.method.toUpperCase()} ${o.path}`;
    if (!o.id) L('warning', w, 'The operation has no operationId, so code generators will make up a name.');
    else if (ids.has(o.id)) L('error', w, `operationId "${o.id}" is also used by ${ids.get(o.id)}.`); else ids.set(o.id, w);
    if (!o.summary && !o.op.description) L('warning', w, 'The operation has no summary or description.');
    const rs = isObj(o.op.responses) ? Object.keys(o.op.responses) : [];
    if (!rs.length) L('error', w, 'The operation has no responses.');
    else if (!rs.some(c => /^2|^3|^default$/i.test(c))) L('warning', w, 'The operation has no success (2xx or 3xx) or default response.');
    if (!o.hook) {
      const want = [...o.path.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
      const have = params(o).filter(p => p.in === 'path').map(p => p.name);
      for (const n of want) if (!have.includes(n)) L('error', w, `Path parameter {${n}} is not defined in parameters.`);
      for (const n of have) if (!want.includes(n)) L('error', w, `Parameter "${n}" is in: path but the path has no {${n}}.`);
    }
  }
  // $refs that do not resolve, and component schemas nobody uses (shared objects are walked once)
  const used = new Set(), seen = new Set(), stack = [[spec, '#']];
  let steps = 0;
  while (stack.length && steps++ < 400000) {
    const [o, at] = stack.pop();
    if (!o || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    if (typeof o.$ref === 'string') {
      if (o.$ref.startsWith('#')) { if (ptr(spec, o.$ref) === undefined) L('error', at, `$ref "${clip(o.$ref, 120)}" does not point to anything in this file.`); used.add(o.$ref); }
      else L('note', at, `$ref "${clip(o.$ref, 120)}" points to another file, which this page does not open.`);
    }
    for (const k of Object.keys(o)) stack.push([o[k], at + '/' + String(k).replace(/~/g, '~0').replace(/\//g, '~1')]);
  }
  const base = spec.swagger ? '#/definitions/' : '#/components/schemas/';
  for (const n of Object.keys(schemasOf())) if (!used.has(base + n)) L('note', base.slice(2) + n, `Schema ${n} is not used by any $ref.`);
  const rank = { error: 0, warning: 1, note: 2 };
  lint.sort((x, y) => rank[x.sev] - rank[y.sev]);
}
function params(o) {
  const out = [], seen = new Set();
  for (const src of [o.op.parameters, o.item.parameters]) for (const p0 of Array.isArray(src) ? src : []) { const p = deref(p0); if (!isObj(p)) continue; const key = p.in + ':' + p.name; if (seen.has(key)) continue; seen.add(key); out.push(p); }
  return out;
}

/* schema to text: a compact outline, shared and circular parts shown by name */
function typeText(s, depth) {
  s = s || {};
  if ((depth = (depth || 0) + 1) > 6) return '...';
  if (s.$ref) return refName(s.$ref);
  if (s.type === 'array' || s.items) return 'array of ' + typeText(s.items, depth);
  if (Array.isArray(s.enum)) return (s.type || 'enum') + ' (' + clip(s.enum.map(x => JSON.stringify(x)).join(', '), 80) + ')';
  for (const k of ['oneOf', 'anyOf', 'allOf']) if (Array.isArray(s[k])) return `${k}: ` + s[k].map(x => typeText(x, depth)).join(k === 'allOf' ? ' + ' : ' | ');
  const t = Array.isArray(s.type) ? s.type.join(' | ') : s.type || (s.properties ? 'object' : 'any');
  return t + (s.format ? ` (${s.format})` : '') + (s.nullable ? ', nullable' : '');
}
function schemaRows(s0, rows, depth, pre, seen) {
  if (rows.length > 400 || depth > 8) return;
  const s = deref(s0);
  if (!isObj(s)) return;
  if (seen.has(s)) return; seen = new Set(seen); seen.add(s);
  const props = {}; const req = new Set(Array.isArray(s.required) ? s.required : []);
  for (const part of [s].concat(Array.isArray(s.allOf) ? s.allOf.map(x => deref(x)) : [])) if (isObj(part) && isObj(part.properties)) { Object.assign(props, part.properties); for (const r of part.required || []) req.add(r); }
  for (const [k, v0] of Object.entries(props)) {
    const v = deref(v0) || {};
    rows.push([pre + k, typeText(v0, depth), req.has(k) ? 'yes' : '', clip(String((v0 && v0.description) || v.description || ''), 200)]);
    const inner = deref(v.items) || v;
    if (isObj(inner) && (inner.properties || inner.allOf) && !seen.has(inner)) schemaRows(inner, rows, depth + 1, pre + k + (v.items ? '[].' : '.'), seen);
  }
  if (s.items && !Object.keys(props).length) schemaRows(s.items, rows, depth + 1, pre + '[].', seen);
}
function schemaBox(s0, title) {
  const box = el('div');
  const s = deref(s0);
  box.append(el('p', null, 'small', null, [el('strong', title ? title + ': ' : ''), document.createTextNode(typeText(s0, 0)), s && s.description && title ? document.createTextNode(' · ' + clip(s.description, 300)) : '']));
  const rows = []; schemaRows(s0, rows, 0, '', new Set());
  if (rows.length) box.append(el('div', null, 'tblwrap short', null, [table(['Property', 'Type', 'Required', 'Description'], rows)]));
  const ex = s0 && (s0.example !== undefined ? s0.example : s && s.example);
  if (ex !== undefined) box.append(el('div', clip(typeof ex === 'string' ? ex : safeJson(ex), 3000), 'pre'));
  return box;
}
function refsOf(o) {  // schema names an operation points to, directly or through other schemas; shared parts walked once
  if (o._refs) return o._refs;
  const out = new Set(), seen = new Set(), st = [o.op, ...params(o)];
  let n = 0;
  while (st.length && n++ < 50000) {
    const x = st.pop();
    if (!x || typeof x !== 'object' || seen.has(x)) continue;
    seen.add(x);
    if (typeof x.$ref === 'string') { out.add(refName(x.$ref)); const t = ptr(spec, x.$ref); if (t) st.push(t); }
    for (const k in x) st.push(x[k]);
  }
  return (o._refs = out);
}
function safeJson(v) { const seen = new Set(); try { return JSON.stringify(v, (k, x) => { if (x && typeof x === 'object') { if (seen.has(x)) return '[repeated]'; seen.add(x); } return x; }, 2); } catch (e) { return String(e.message); } }

/* view */
function render() {
  const out = $('out'); out.textContent = '';
  const info = isObj(spec.info) ? spec.info : {};
  const ver = spec.openapi ? 'OpenAPI ' + spec.openapi : 'Swagger ' + spec.swagger;
  const tags = new Set(ops.flatMap(o => o.tags));
  const errs = lint.filter(x => x.sev === 'error').length;
  out.append(stats([['Spec', ver], ['API version', String(info.version || '-')], ['Operations', int(ops.length)], ['Paths', int(Object.keys(isObj(spec.paths) ? spec.paths : {}).length)],
    ['Tags', int(tags.size)], ['Schemas', int(Object.keys(schemasOf()).length)], ['Lint', lint.length ? `${int(errs)} errors, ${int(lint.length - errs)} other` : 'clean', errs ? 'bad' : ''], ['Webhooks', int(ops.filter(o => o.hook).length)]]));
  const f = el('input', null, null, { type: 'search', placeholder: 'Filter by path, summary or operationId', 'aria-label': 'Filter operations', autocomplete: 'off' });
  const side = el('div', null, 'tcside'), list = el('div', null, 'tblwrap'), det = el('div', null, 'det');
  side.append(f, list);
  out.append(el('div', null, 'tcgrid', null, [side, det]));
  ui = { f, list, det };
  f.addEventListener('input', drawList);
  drawList();
  overview();
}
function drawList() {
  const { f, list } = ui;
  const q = f.value.trim().toLowerCase();
  list.textContent = '';
  const t = el('table', null, 'dtab pick'), tb = el('tbody'); t.append(tb);
  const add = (label, cls, fn, title) => { const tr = el('tr', null, cls, { tabindex: 0 }); tr.append(el('td', null, null, { colspan: 2 }, [el('strong', label)])); tr.addEventListener('click', () => { mark(tr); fn(); }); tr.addEventListener('keydown', e => { if (e.key === 'Enter') { mark(tr); fn(); } }); if (title) tr.title = title; tb.append(tr); };
  const mark = tr => { tb.querySelectorAll('tr.on').forEach(x => x.classList.remove('on')); tr.classList.add('on'); };
  add('Overview', 'on', overview); add(`Schemas (${int(Object.keys(schemasOf()).length)})`, '', schemas); add(`Lint (${int(lint.length)})`, '', showLint);
  const groups = new Map();
  for (const o of ops) {
    if (q && !(o.path + ' ' + o.summary + ' ' + o.id + ' ' + o.method).toLowerCase().includes(q)) continue;
    for (const tg of o.tags) { if (!groups.has(tg)) groups.set(tg, []); groups.get(tg).push(o); }
  }
  let n = 0;
  for (const [tg, os] of groups) {
    tb.append(el('tr', null, 'grp', null, [el('th', `${tg} (${os.length})`, null, { colspan: 2 })]));
    for (const o of os) {
      if (n++ > 4000) break;
      const tr = el('tr', null, null, { tabindex: 0, title: o.summary || o.id || '' });
      tr.append(el('td', null, null, null, [el('span', o.method.toUpperCase(), 'pill ' + o.method.toUpperCase())]), el('td', o.path + (o.deprecated ? ' (deprecated)' : ''), 'mono' + (o.deprecated ? ' mut' : '')));
      const go = () => { mark(tr); operation(o); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      tb.append(tr);
    }
  }
  list.append(t);
  if (!groups.size && q) list.append(el('p', 'No operation matches.', 'small mut'));
}
function overview() {
  const det = ui.det; det.textContent = '';
  const info = isObj(spec.info) ? spec.info : {};
  det.append(el('h3', String(info.title || '(no title)')));
  const contact = isObj(info.contact) ? [info.contact.name, info.contact.email, info.contact.url].filter(Boolean).join(', ') : '';
  const lic = isObj(info.license) ? info.license.name || info.license.identifier || '' : '';
  det.append(kv([['Version', String(info.version || '')], ['Spec', spec.openapi ? 'OpenAPI ' + spec.openapi : 'Swagger ' + spec.swagger], ['Contact', contact], ['License', lic],
    ['Terms of service', info.termsOfService ? link(info.termsOfService) : ''], ['Docs', isObj(spec.externalDocs) && spec.externalDocs.url ? link(spec.externalDocs.url, spec.externalDocs.description || spec.externalDocs.url) : '']]));
  if (info.description) det.append(el('div', clip(String(info.description), 6000), 'pre'));
  const servers = spec.openapi ? (Array.isArray(spec.servers) ? spec.servers : []).map(s => [String(s.url || ''), String(s.description || ''), isObj(s.variables) ? Object.keys(s.variables).join(', ') : ''])
    : spec.host || spec.basePath ? [[`${(spec.schemes || ['https'])[0]}://${spec.host || '(host)'}${spec.basePath || ''}`, 'from host, basePath and schemes', '']] : [];
  if (servers.length) { det.append(el('h3', 'Servers')); det.append(table(['URL', 'Description', 'Variables'], servers)); }
  const sec = spec.openapi ? (isObj(spec.components) && isObj(spec.components.securitySchemes) ? spec.components.securitySchemes : {}) : (isObj(spec.securityDefinitions) ? spec.securityDefinitions : {});
  if (Object.keys(sec).length) {
    det.append(el('h3', 'Security schemes'));
    det.append(table(['Name', 'Type', 'Details'], Object.entries(sec).map(([k, v0]) => { const v = deref(v0) || {}; return [k, String(v.type || ''), [v.scheme, v.bearerFormat, v.in && v.name ? `${v.name} in ${v.in}` : '', v.flow, isObj(v.flows) ? 'flows: ' + Object.keys(v.flows).join(', ') : '', v.openIdConnectUrl].filter(Boolean).join(', ')]; })));
  }
  const tagDocs = Array.isArray(spec.tags) ? spec.tags.filter(isObj) : [];
  if (tagDocs.length) { det.append(el('h3', 'Tags')); det.append(el('div', null, 'tblwrap short', null, [table(['Tag', 'Operations', 'Description'], tagDocs.map(t => [String(t.name), int(ops.filter(o => o.tags.includes(String(t.name))).length), clip(String(t.description || ''), 200)]))])); }
}
function operation(o) {
  const det = ui.det; det.textContent = '';
  det.append(el('h3', null, null, null, [el('span', o.method.toUpperCase(), 'pill ' + o.method.toUpperCase()), document.createTextNode(' ' + o.path)]));
  if (o.summary) det.append(el('p', String(o.summary)));
  det.append(kv([['operationId', o.id], ['Tags', o.tags.join(', ')], ['Deprecated', o.deprecated ? 'yes' : ''], ['Webhook', o.hook ? 'yes' : ''],
    ['Security', Array.isArray(o.op.security) ? (o.op.security.length ? o.op.security.map(s => Object.keys(s).join(' + ') || 'none').join(' or ') : 'none (public)') : ''],
    ['Docs', isObj(o.op.externalDocs) && o.op.externalDocs.url ? link(o.op.externalDocs.url) : '']]));
  if (o.op.description) det.append(el('div', clip(String(o.op.description), 6000), 'pre'));
  const ps = params(o);
  if (ps.length) {
    det.append(el('h3', 'Parameters'));
    det.append(el('div', null, 'tblwrap short', null, [table(['Name', 'In', 'Required', 'Type', 'Description'], ps.map(p => [String(p.name), String(p.in), p.required ? 'yes' : '', p.schema ? typeText(p.schema, 0) : String(p.type || '') + (p.format ? ` (${p.format})` : ''), clip(String(p.description || ''), 200)]))]));
  }
  const body = deref(o.op.requestBody);
  if (isObj(body)) {
    det.append(el('h3', 'Request body' + (body.required ? ' (required)' : '')));
    if (body.description) det.append(el('p', clip(String(body.description), 600), 'small'));
    for (const [mt, m] of Object.entries(isObj(body.content) ? body.content : {})) det.append(schemaBox(m && m.schema, mt));
  }
  const bodyParam = ps.find(p => p.in === 'body');
  if (bodyParam) { det.append(el('h3', 'Request body')); det.append(schemaBox(bodyParam.schema, (o.op.consumes || spec.consumes || ['application/json'])[0])); }
  const rs = isObj(o.op.responses) ? o.op.responses : {};
  det.append(el('h3', 'Responses'));
  for (const [code, r0] of Object.entries(rs)) {
    const r = deref(r0) || {};
    det.append(el('p', null, null, null, [el('span', code, 'pill ' + (/^2/.test(code) ? 'ok' : /^[45]/.test(code) ? 'error' : 'none')), document.createTextNode(' ' + clip(String(r.description || ''), 300))]));
    if (isObj(r.content)) for (const [mt, m] of Object.entries(r.content)) det.append(schemaBox(m && m.schema, mt));
    else if (r.schema) det.append(schemaBox(r.schema, (o.op.produces || spec.produces || ['application/json'])[0]));
  }
  if (!Object.keys(rs).length) det.append(el('p', 'No responses are defined.', 'warn small'));
}
function schemas() {
  const det = ui.det; det.textContent = '';
  const all = schemasOf(), names = Object.keys(all);
  det.append(el('h3', `${spec.swagger ? 'Definitions' : 'Component schemas'} (${int(names.length)})`));
  if (!names.length) { det.append(el('p', 'The spec has no reusable schemas.', 'small mut')); return; }
  const sel = el('select', null, null, { 'aria-label': 'Schema' });
  for (const n of names.slice(0, 5000)) sel.append(el('option', n, null, { value: n }));
  const box = el('div');
  const show = () => { box.textContent = ''; const s = all[sel.value]; box.append(schemaBox(s, sel.value)); const users = ops.filter(o => refsOf(o).has(sel.value)).slice(0, 50); if (users.length) box.append(el('p', 'Used by: ' + users.map(o => `${o.method.toUpperCase()} ${o.path}`).join(', '), 'small mut')); };
  sel.addEventListener('change', show);
  det.append(el('div', null, 'tcbar', null, [sel]), box); show();
}
function showLint() {
  const det = ui.det; det.textContent = '';
  det.append(el('h3', `Lint (${int(lint.length)})`));
  if (!lint.length) { det.append(el('p', 'No problems found by these checks.', 'ok small')); }
  else det.append(el('div', null, 'tblwrap', null, [table(['Level', 'Where', 'Problem'], lint.map(x => [el('span', x.sev, 'pill ' + x.sev), x.where, x.text]), { sort: true })]));
  det.append(el('p', 'Checks: info.title and version, servers, operationId present and unique, a summary or description, responses with a success code, path parameters that match the path, $ref targets inside the file, and unused schemas.', 'small mut'));
}

wire(async (text, info) => {
  spec = parse(text, info.name);
  collect(); check();
  shown(info, `${spec.openapi ? 'OpenAPI ' + spec.openapi : 'Swagger ' + spec.swagger}, ${plural(ops.length, 'operation')}, ${size(info.size)}`);
  render();
  done(info, lint.length ? `Lint found ${plural(lint.length, 'issue')}; see Lint in the list.` : '');
}, { maxBytes: 50 * 1048576, utf8: true });
self.zovoTest = () => spec && { ops: ops.length, lint: lint.slice(0, 8).map(x => x.sev + ' ' + x.where + ': ' + x.text), det: ui.det.innerText.slice(0, 600), list: [...ui.list.querySelectorAll('tr')].slice(0, 8).map(r => r.innerText.replace(/\t/g, ' ')) };
self.zovoReady = true;
