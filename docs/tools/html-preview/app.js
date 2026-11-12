/* Zovo HTML Preview Online (TOOLCHK3, wave18). Files are read in this tab with the File API and never sent anywhere:
   the page CSP sets connect-src 'none'. The HTML is parsed with DOMParser (an inert document: nothing runs and
   nothing loads), then rewritten: scripts, web addresses, <base>, refresh and plugins are taken out, and local CSS,
   images and fonts the user picked are put inline (CSS as <style>, the rest as data: URLs). The result is shown in an
   iframe with an empty sandbox (no scripts, no forms, no popups, an opaque origin) from a blob: URL, and it carries
   its own CSP meta tag with no network sources, on top of the policy it gets from this page. Every value from the file
   that is shown outside the frame is written as text, never as HTML. Plain JavaScript, no libraries. */
import { SAMPLE } from './sample.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAX_HTML = 32 * 1048576, MAX_RES = 25 * 1048576, MAX_TOTAL = 160 * 1048576, MAX_FILES = 5000, SRC_LINES = 20000;
const FRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; media-src data:; frame-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const isHtml = p => /\.(html?|xhtml)$/i.test(p);
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', vtt: 'text/vtt', css: 'text/css' };
const mimeOf = p => MIME[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

/* ---------- the set of files: [{path, file}] ---------- */
let files = new Map(), page = '', last = null;
function addFiles(list, replace) {
  if (replace) files = new Map();
  let n = 0;
  for (const it of list) {
    if (files.size >= MAX_FILES) break;
    const path = (it.path || it.file.webkitRelativePath || it.file.name).replace(/^\/+/, '');
    files.set(path, it.file); n++;
  }
  return n;
}
const pages = () => [...files.keys()].filter(isHtml).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
function pickPage() {
  const ps = pages();  // index.html, else the first page in the order the files came
  return ps.find(p => /(^|\/)index\.html?$/i.test(p)) || [...files.keys()].find(isHtml) || '';
}

/* ---------- paths ---------- */
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
function normPath(p) {
  const out = [];
  for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); }
  return out.join('/');
}
function kindOf(ref) {
  const r = ref.trim();
  if (!r) return 'empty';
  if (r[0] === '#') return 'fragment';
  if (/^data:/i.test(r)) return 'data';
  if (/^(https?:)?\/\//i.test(r)) return 'web';
  if (/^[a-z][a-z0-9+.-]*:/i.test(r)) return 'other';
  return 'local';
}
let siteRoot = '';
function resolve(ref, base) {  // a local reference -> the path of a picked file, or null
  let r = ref.trim().replace(/[?#].*$/, '');
  try { r = decodeURIComponent(r); } catch (e) { /* keep as written */ }
  const want = normPath(r.startsWith('/') ? siteRoot + r : base + r);
  if (files.has(want)) return want;
  const low = want.toLowerCase();
  for (const k of files.keys()) if (k.toLowerCase() === low) return k;
  const name = low.split('/').pop(), same = [...files.keys()].filter(k => k.toLowerCase().split('/').pop() === name);
  return same.length === 1 ? same[0] : null;
}

/* ---------- text decoding ---------- */
function decodeText(u) {
  let label = 'utf-8', off = 0;
  if (u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) off = 3;
  else if (u[0] === 0xff && u[1] === 0xfe) { label = 'utf-16le'; off = 2; }
  else if (u[0] === 0xfe && u[1] === 0xff) { label = 'utf-16be'; off = 2; }
  else {
    const head = new TextDecoder('latin1').decode(u.subarray(0, 4096));
    const m = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head);
    if (m) label = m[1].toLowerCase();
  }
  try { return { text: new TextDecoder(label).decode(u.subarray(off)), label }; } catch (e) { return { text: new TextDecoder('utf-8').decode(u.subarray(off)), label: 'utf-8' }; }
}
const readText = async f => decodeText(new Uint8Array(await f.arrayBuffer())).text;
const readData = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(r.error); r.readAsDataURL(f.type ? f : new Blob([f], { type: 'application/octet-stream' })); });

/* ---------- rewriting ---------- */
// Before DOMParser sees the text: event handler attributes and the href of <base> are renamed, so the inert
// parse never even asks this page's CSP about them (they would be blocked, but each one logs a console error).
// (<base href> becomes <base data-zovo-href>: the element stays a void element in <head>.)
// Only tags are touched; the contents of script, style, textarea and title elements and comments stay as they are.
const TAGS = /<!--[\s\S]*?-->|<(script|style|textarea|title|xmp)\b[^>]*>[\s\S]*?<\/\1\s*>|<[a-zA-Z][^>]*>/gi;
const defangTag = t => t.replace(/^(<base\b[^>]*?\s)(href\s*=)/i, '$1data-zovo-$2').replace(/(\s)on([a-z]+\s*=)/gi, '$1data-zovo-on$2');
function defang(text) {
  return text.replace(TAGS, (m, raw) => {
    if (m.startsWith('<!--')) return m;
    if (raw) { const i = m.indexOf('>') + 1; return defangTag(m.slice(0, i)) + m.slice(i); }
    return defangTag(m);
  });
}
function makeCtx() { return { rows: [], cache: new Map(), total: 0, missing: 0, web: new Set(), webCount: 0, loaded: 0, big: 0 }; }
function row(ctx, kind, ref, status, cls) { if (ctx.rows.length < 3000) ctx.rows.push({ kind, ref, status, cls }); }

async function dataFor(ctx, ref, base, kind) {  // a local or web reference -> a data: URL, or '' when it is left out
  const k = kindOf(ref);
  if (k === 'data') { row(ctx, kind, ref.slice(0, 60) + (ref.length > 60 ? '...' : ''), 'Inline data, shown', 'ok'); return ref; }
  if (k === 'web') { ctx.webCount++; try { ctx.web.add(new URL(ref.trim(), 'https://x/').host); } catch (e) { /* odd address */ } row(ctx, kind, ref, 'Web address, not loaded (this page never contacts other sites)'); return ''; }
  if (k !== 'local') { if (k !== 'empty' && k !== 'fragment') row(ctx, kind, ref, 'Not a file address, left out'); return ''; }
  const p = resolve(ref, base);
  if (!p) { ctx.missing++; row(ctx, kind, ref, 'Missing: add this file or the page folder', 'warn'); return ''; }
  if (ctx.cache.has(p)) return ctx.cache.get(p);
  const f = files.get(p);
  if (f.size > MAX_RES || ctx.total + f.size > MAX_TOTAL) { ctx.big++; row(ctx, kind, ref, `Left out: ${size(f.size)} is over the ${f.size > MAX_RES ? '25 MB limit for one file' : '160 MB limit for one page'}`, 'warn'); ctx.cache.set(p, ''); return ''; }
  ctx.total += f.size;
  let url = await readData(f);
  if (/^data:(application\/octet-stream|)?[;,]/i.test(url)) url = url.replace(/^data:[^;,]*/, 'data:' + mimeOf(p));
  ctx.cache.set(p, url); ctx.loaded++;
  row(ctx, kind, ref, 'Shown from your file ' + p + ' (' + size(f.size) + ')', 'ok');
  return url;
}

const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)|"([^"]*)"|'([^']*)')\s*([^;]*);/gi;
async function replaceAsync(s, re, fn) {
  const parts = [], ms = [...s.matchAll(re)];
  let i = 0;
  for (const m of ms) { parts.push(s.slice(i, m.index), await fn(m)); i = m.index + m[0].length; }
  parts.push(s.slice(i));
  return parts.join('');
}
async function rewriteCss(ctx, css, base, depth, seen) {
  css = await replaceAsync(css, CSS_IMPORT, async m => {
    const ref = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '', media = (m[6] || '').trim();
    const k = kindOf(ref);
    if (k === 'web') { ctx.webCount++; try { ctx.web.add(new URL(ref.trim(), 'https://x/').host); } catch (e) { /* odd */ } row(ctx, 'CSS @import', ref, 'Web address, not loaded (this page never contacts other sites)'); return ''; }
    if (k !== 'local') return '';
    const p = resolve(ref, base);
    if (!p) { ctx.missing++; row(ctx, 'CSS @import', ref, 'Missing: add this file or the page folder', 'warn'); return ''; }
    if (depth > 8 || seen.has(p)) { row(ctx, 'CSS @import', ref, 'Left out: imported in a loop or more than 8 levels deep', 'warn'); return ''; }
    const f = files.get(p);
    if (f.size > MAX_RES) { ctx.big++; row(ctx, 'CSS @import', ref, 'Left out: over the 25 MB limit for one file', 'warn'); return ''; }
    ctx.loaded++; row(ctx, 'CSS @import', ref, 'Shown from your file ' + p + ' (' + size(f.size) + ')', 'ok');
    const inner = await rewriteCss(ctx, await readText(f), dirOf(p), depth + 1, new Set([...seen, p]));
    return media && !/^layer|^supports/i.test(media) ? `@media ${media} {\n${inner}\n}` : inner;
  });
  return replaceAsync(css, CSS_URL, async m => {
    const ref = m[1] ?? m[2] ?? m[3] ?? '';
    if (kindOf(ref) === 'fragment') return m[0];
    const u = await dataFor(ctx, ref, base, 'CSS url()');
    return u ? `url("${u}")` : 'url("data:,")';
  });
}

async function srcsetRewrite(ctx, v, base, kind) {
  const out = [];
  for (const part of v.split(/,(?=\s*\S)/)) {
    const m = /^\s*(\S+)(\s+.*)?$/.exec(part);
    if (!m) continue;
    const u = await dataFor(ctx, m[1], base, kind);
    if (u) out.push(u + (m[2] || ''));
  }
  return out.join(', ');
}

/* structure facts, read from the untouched document */
function facts(d, text) {
  const q = s => d.querySelectorAll(s), meta = n => { const e = d.querySelector(`meta[name="${n}" i]`); return e ? e.getAttribute('content') || '' : null; };
  const hs = [...q('h1,h2,h3,h4,h5,h6')].map(h => ({ level: Number(h.tagName[1]), text: (h.textContent || '').replace(/\s+/g, ' ').trim() }));
  const links = [...q('a[href], area[href]')].map(a => kindOf(a.getAttribute('href')));
  const imgs = [...q('img')];
  const scripts = [...q('script')];
  const sheets = [...q('link[rel~="stylesheet" i][href]')];
  const ids = new Map(); for (const e of q('[id]')) ids.set(e.id, (ids.get(e.id) || 0) + 1);
  const og = q('meta[property^="og:" i]').length;
  return {
    title: (d.querySelector('title') || {}).textContent || '', lang: d.documentElement.getAttribute('lang'),
    charset: (d.querySelector('meta[charset]') || {}).getAttribute?.('charset') || ((/charset=([\w-]+)/i.exec((d.querySelector('meta[http-equiv="content-type" i]') || { getAttribute: () => '' }).getAttribute('content') || '') || [])[1]) || null,
    viewport: meta('viewport'), description: meta('description'), robots: meta('robots'),
    canonical: (d.querySelector('link[rel~="canonical" i]') || { getAttribute: () => null }).getAttribute('href'),
    icon: !!d.querySelector('link[rel~="icon" i]'), og, doctype: !!d.doctype || /^\s*(<!--[\s\S]*?-->\s*)*<!doctype/i.test(text),
    headings: hs, linksTotal: links.length, linksFragment: links.filter(k => k === 'fragment').length, linksLocal: links.filter(k => k === 'local').length,
    linksWeb: links.filter(k => k === 'web').length, linksOther: links.filter(k => k === 'other').length,
    images: imgs.length, noAlt: imgs.filter(i => !i.hasAttribute('alt')).length,
    scriptsInline: scripts.filter(s => !s.hasAttribute('src')).length, scriptsSrc: scripts.filter(s => s.hasAttribute('src')).length,
    sheets: sheets.length, styleBlocks: q('style').length, forms: q('form').length, fields: q('input:not([type=hidden]), select, textarea').length,
    iframes: q('iframe').length, dupIds: [...ids.values()].filter(n => n > 1).length,
  };
}

async function render(path, depth = 0, seen = new Set(), ctx = makeCtx()) {
  const f = files.get(path);
  const raw = new Uint8Array(await f.arrayBuffer());
  const { text, label } = decodeText(raw);
  const d = new DOMParser().parseFromString(defang(text), 'text/html');
  const info = depth === 0 ? facts(d, text) : null;
  let base = dirOf(path);
  const b = d.querySelector('base[data-zovo-href]');
  if (b) { const h = b.getAttribute('data-zovo-href'); if (kindOf(h) === 'local') base = normPath(h.startsWith('/') ? siteRoot + h : base + h).replace(/[^/]*$/, ''); if (kindOf(h) === 'web' && depth === 0) row(ctx, '<base>', h, 'Web address: relative links are read from the page folder instead'); }
  for (const e of d.querySelectorAll('base, meta[http-equiv="refresh" i], meta[charset], meta[http-equiv="content-type" i], meta[http-equiv="content-security-policy" i], object, embed, applet, portal, frameset, frame')) {
    if (/^(object|embed|applet|frame)$/i.test(e.tagName)) row(ctx, '<' + e.tagName.toLowerCase() + '>', e.getAttribute('data') || e.getAttribute('src') || '', 'Plugins and frames of this kind are not shown');
    if (e.matches('meta[http-equiv="refresh" i]')) row(ctx, 'Refresh', e.getAttribute('content') || '', 'Left out: the preview never moves to another address');
    e.remove();
  }
  for (const s of d.querySelectorAll('script')) {
    if (s.hasAttribute('src')) { const r = s.getAttribute('src'); const k = kindOf(r); row(ctx, 'Script', r, k === 'web' ? 'Web script, not loaded; scripts do not run here' : 'Script file, not run here'); if (k === 'web') { ctx.webCount++; try { ctx.web.add(new URL(r.trim(), 'https://x/').host); } catch (e) { /* odd */ } } }
    s.remove();
  }
  for (const l of d.querySelectorAll('link')) {
    const rel = (l.getAttribute('rel') || '').toLowerCase(), href = l.getAttribute('href') || '';
    if (/\bstylesheet\b/.test(rel) && !/\balternate\b/.test(rel)) {
      const k = kindOf(href), st = d.createElement('style');
      if (l.getAttribute('media')) st.setAttribute('media', l.getAttribute('media'));
      if (k === 'local') {
        const p = resolve(href, base);
        if (p && files.get(p).size <= MAX_RES) { ctx.loaded++; row(ctx, 'Stylesheet', href, 'Shown from your file ' + p + ' (' + size(files.get(p).size) + ')', 'ok'); st.textContent = await rewriteCss(ctx, await readText(files.get(p)), dirOf(p), 0, new Set([p])); l.replaceWith(st); continue; }
        if (p) { ctx.big++; row(ctx, 'Stylesheet', href, 'Left out: over the 25 MB limit for one file', 'warn'); }
        else { ctx.missing++; row(ctx, 'Stylesheet', href, 'Missing: add this file or the page folder', 'warn'); }
      } else if (k === 'web') { ctx.webCount++; try { ctx.web.add(new URL(href.trim(), 'https://x/').host); } catch (e) { /* odd */ } row(ctx, 'Stylesheet', href, 'Web address, not loaded (this page never contacts other sites)'); }
      else if (k === 'data') { row(ctx, 'Stylesheet', href.slice(0, 60), 'Inline data, not read'); }
    }
    l.remove();  // icons, preload, prefetch, manifest and the rest are not needed for a preview
  }
  for (const st of d.querySelectorAll('style')) st.textContent = await rewriteCss(ctx, st.textContent, base, 0, new Set());
  for (const e of d.querySelectorAll('[style]')) { const v = e.getAttribute('style'); if (/url\(|@import/i.test(v)) e.setAttribute('style', await rewriteCss(ctx, v, base, 0, new Set())); }
  const media = [['img', 'src', 'Image'], ['img', 'srcset', 'Image'], ['source', 'src', 'Media'], ['source', 'srcset', 'Image'], ['video', 'src', 'Video'], ['video', 'poster', 'Video poster'],
    ['audio', 'src', 'Audio'], ['track', 'src', 'Subtitles'], ['input', 'src', 'Image button'], ['image', 'href', 'SVG image'], ['image', 'xlink:href', 'SVG image'], ['use', 'href', 'SVG use'], ['use', 'xlink:href', 'SVG use'], ['feImage', 'href', 'SVG image'], ['body', 'background', 'Background'], ['table', 'background', 'Background'], ['td', 'background', 'Background']];
  for (const [tag, attr, kind] of media) {
    for (const e of d.querySelectorAll(tag)) {
      if (!e.hasAttribute(attr)) continue;
      const v = e.getAttribute(attr);
      if (attr === 'srcset') { const nv = await srcsetRewrite(ctx, v, base, kind); if (nv) e.setAttribute(attr, nv); else e.removeAttribute(attr); continue; }
      if ((tag === 'use') && kindOf(v) === 'fragment') continue;
      const u = await dataFor(ctx, v, base, kind);
      if (u) e.setAttribute(attr, u); else e.removeAttribute(attr);
      e.removeAttribute('loading');
    }
  }
  for (const fr of d.querySelectorAll('iframe')) {
    const src = fr.getAttribute('src') || '';
    fr.removeAttribute('src');
    fr.setAttribute('sandbox', '');
    if (fr.hasAttribute('srcdoc')) { fr.removeAttribute('srcdoc'); row(ctx, 'Frame', '(srcdoc)', 'Inline frame content is not shown'); continue; }
    const k = kindOf(src);
    if (k === 'local') {
      const p = resolve(src, base);
      if (p && isHtml(p) && depth < 2 && !seen.has(p)) { row(ctx, 'Frame', src, 'Shown from your file ' + p, 'ok'); ctx.loaded++; fr.setAttribute('srcdoc', (await render(p, depth + 1, new Set([...seen, path]), ctx)).html); }
      else if (!p) { ctx.missing++; row(ctx, 'Frame', src, 'Missing: add this file or the page folder', 'warn'); }
      else row(ctx, 'Frame', src, 'Not shown (not a page, or nested too deep)');
    } else if (k === 'web') { ctx.webCount++; try { ctx.web.add(new URL(src.trim(), 'https://x/').host); } catch (e) { /* odd */ } row(ctx, 'Frame', src, 'Web address, not loaded (this page never contacts other sites)'); }
  }
  for (const a of d.querySelectorAll('a[href], area[href]')) {  // links stay links, but never leave the preview
    const h = a.getAttribute('href');
    if (kindOf(h) !== 'fragment') { a.setAttribute('title', a.getAttribute('title') || h); a.setAttribute('href', '#zovo-link-off'); }
    a.removeAttribute('target'); a.removeAttribute('ping');
  }
  for (const fm of d.querySelectorAll('form')) { fm.removeAttribute('action'); fm.removeAttribute('target'); }
  for (const e of d.querySelectorAll('[formaction]')) e.removeAttribute('formaction');
  for (const e of d.querySelectorAll('*')) for (const at of [...e.attributes]) if (/^(on|data-zovo-on)/i.test(at.name)) e.removeAttribute(at.name);
  const head = d.head || d.documentElement.insertBefore(d.createElement('head'), d.body);
  const m1 = d.createElement('meta'); m1.setAttribute('http-equiv', 'Content-Security-Policy'); m1.setAttribute('content', FRAME_CSP);
  const m2 = d.createElement('meta'); m2.setAttribute('charset', 'utf-8');
  head.prepend(m2); head.prepend(m1);
  const html = (info ? (info.doctype ? '<!DOCTYPE html>\n' : '') : '<!DOCTYPE html>\n') + d.documentElement.outerHTML;
  return { html, info, ctx, text, label, bytes: raw.length };
}

/* ---------- views ---------- */
let frameUrl = '';
async function show(path) {
  if (!path) return;
  const f = files.get(path);
  if (f.size > MAX_HTML) { say(`${path} is ${size(f.size)}. Pages up to 32 MB open here.`, true); return; }
  const t0 = performance.now();
  say('Reading ' + path + ' ...');
  page = path;
  siteRoot = path.includes('/') ? path.slice(0, path.indexOf('/') + 1) : '';
  let r;
  try { r = await render(path); } catch (e) { say('The page could not be read: ' + (e && e.message ? e.message : e), true); return; }
  last = r;
  if (frameUrl) URL.revokeObjectURL(frameUrl);
  frameUrl = URL.createObjectURL(new Blob([r.html], { type: 'text/html;charset=utf-8' }));
  $('frame').src = frameUrl;
  $('fname').textContent = path;
  $('fmeta').textContent = `${size(r.bytes)}, ${r.label.toUpperCase()}, ${int(r.text.split('\n').length)} lines`;
  const ps = pages();
  $('pageBox').hidden = ps.length < 2;
  $('pageSel').replaceChildren(...ps.slice(0, 500).map(p => { const o = el('option', p); o.value = p; o.selected = p === path; return o; }));
  note(r.ctx);
  structure(r.info);
  linked(r.ctx);
  source(r.text);
  $('drop').hidden = true; $('view').hidden = false;
  const i = r.info;
  self.zovoState = { title: i.title, headings: i.headings.length, links: i.linksTotal, images: i.images, noAlt: i.noAlt, scripts: i.scriptsInline + i.scriptsSrc,
    sheets: i.sheets, missing: r.ctx.missing, web: r.ctx.webCount, webHosts: [...r.ctx.web], loaded: r.ctx.loaded, files: files.size, htmlBytes: r.html.length };
  say(`Opened in ${Math.round(performance.now() - t0)} ms.`);
}

function note(ctx) {
  const n = $('note'), ps = [];
  if (ctx.missing) ps.push(`${ctx.missing} linked file${ctx.missing > 1 ? 's are' : ' is'} missing, so ${ctx.missing > 1 ? 'they do' : 'it does'} not show. Add the page's folder, or the CSS and image files, with the buttons above.`);
  if (ctx.webCount) ps.push(`${ctx.webCount} web resource${ctx.webCount > 1 ? 's' : ''} (${[...ctx.web].slice(0, 4).join(', ')}${ctx.web.size > 4 ? ' and more' : ''}) ${ctx.webCount > 1 ? 'are' : 'is'} not loaded: this page never contacts other sites.`);
  if (ctx.big) ps.push(`${ctx.big} file${ctx.big > 1 ? 's were' : ' was'} left out for size.`);
  n.replaceChildren(...ps.map(t => el('p', t)));
  n.hidden = !ps.length;
}

function structure(i) {
  const t = $('sinfo'); t.replaceChildren();
  const put = (k, v, warn) => { const tr = t.insertRow(), th = el('th', k); tr.append(th); const td = tr.insertCell(); td.textContent = v; if (warn) td.className = 'warn'; };
  put('Title', i.title.trim() || 'none', !i.title.trim());
  put('Language', i.lang || 'not set', !i.lang);
  put('Charset', i.charset || 'not declared', !i.charset);
  put('Viewport', i.viewport ?? 'not set', i.viewport == null);
  put('Description', i.description == null ? 'none' : (i.description.length > 180 ? i.description.slice(0, 180) + '...' : i.description) + ` (${i.description.length} characters)`, i.description == null);
  if (i.canonical) put('Canonical', i.canonical);
  if (i.robots) put('Robots', i.robots);
  put('Open Graph tags', i.og ? String(i.og) : 'none');
  put('Doctype', i.doctype ? 'yes' : 'missing (the browser draws the page in quirks mode)', !i.doctype);
  const c = $('counts'); c.replaceChildren();
  const tile = (k, v) => { const d = el('div', null, 'stat'); d.append(el('span', k, 'k'), el('span', v, 'v')); c.append(d); };
  tile('Links', `${int(i.linksTotal)} (${int(i.linksLocal)} local, ${int(i.linksWeb)} web, ${int(i.linksFragment)} #)`);
  tile('Images', `${int(i.images)}${i.noAlt ? `, ${int(i.noAlt)} without alt` : ''}`);
  tile('Scripts', `${int(i.scriptsSrc)} files, ${int(i.scriptsInline)} inline`);
  tile('Stylesheets', `${int(i.sheets)} linked, ${int(i.styleBlocks)} <style>`);
  tile('Forms', `${int(i.forms)} with ${int(i.fields)} fields`);
  tile('Frames', int(i.iframes));
  tile('Headings', int(i.headings.length));
  tile('Repeated ids', int(i.dupIds));
  const o = $('outline'); o.replaceChildren();
  const h1 = i.headings.filter(h => h.level === 1).length;
  $('outlineNote').textContent = i.headings.length ? (i.headings.length === 1 ? `1 heading, an h${i.headings[0].level}.` : `${int(i.headings.length)} headings, ${h1 === 1 ? 'one' : h1} of them h1.`) + (i.headings.length > 400 ? ' The first 400 are listed.' : '') : 'This page has no headings.';
  for (const h of i.headings.slice(0, 400)) {
    const li = el('li', null, 'l' + h.level); li.append(el('span', 'h' + h.level, 'lv'));
    li.append(h.text ? document.createTextNode(h.text) : el('span', '(empty heading)', 'empty'));
    o.append(li);
  }
}

function linked(ctx) {
  const tb = $('files').tBodies[0]; tb.replaceChildren();
  for (const r of ctx.rows) {
    const tr = tb.insertRow(); tr.insertCell().textContent = r.kind;
    const ref = tr.insertCell(); ref.textContent = r.ref.length > 140 ? r.ref.slice(0, 140) + '...' : r.ref; ref.title = r.ref.slice(0, 600);
    const st = tr.insertCell(); st.textContent = r.status; st.className = 'st' + (r.cls ? ' ' + r.cls : '');
  }
  $('filesNote').textContent = ctx.rows.length ? `${int(ctx.rows.length)} references: ${ctx.loaded} shown from your files, ${ctx.missing} missing, ${ctx.webCount} web addresses not loaded.` + (ctx.rows.length >= 3000 ? ' The first 3,000 are listed.' : '') : 'This page links no other files.';
  $('tFiles').textContent = `Linked files (${int(ctx.rows.length)})`;
}

function source(text) {
  let lines = text.split(/\r\n|\r|\n/), cut = '';
  if (lines.length > SRC_LINES) { cut = ` The first ${int(SRC_LINES)} of ${int(lines.length)} lines are shown.`; lines = lines.slice(0, SRC_LINES); }
  let body = lines.join('\n');
  if (body.length > 4 * 1048576) { body = body.slice(0, 4 * 1048576); cut = ' The first 4 MB are shown.'; lines = body.split('\n'); }
  $('src').textContent = body;
  $('gutter').textContent = lines.map((_, i) => i + 1).join('\n');
  $('srcNote').textContent = 'The page source as read from the file.' + cut;
}

/* ---------- tabs and width ---------- */
const TABS = [['tPreview', 'pPreview'], ['tStruct', 'pStruct'], ['tFiles', 'pFiles'], ['tSource', 'pSource']];
for (const [t, p] of TABS) $(t).addEventListener('click', () => {
  for (const [t2, p2] of TABS) { $(t2).setAttribute('aria-selected', String(t2 === t)); $(p2).hidden = p2 !== p; }
});
$('width').addEventListener('change', () => {
  const w = Number($('width').value), fr = $('frame');
  fr.style.width = w ? w + 'px' : '100%';
  $('frameWrap').classList.toggle('fixed', !!w);
});
$('pageSel').addEventListener('change', () => show($('pageSel').value));

/* ---------- opening ---------- */
async function openList(list, replace) {
  if (!list.length) return;
  const n = addFiles(list, replace);
  if (replace || !page || !files.has(page)) {
    const p = pickPage();
    if (!p) { say(n ? 'None of these files is an HTML page (.html or .htm). Open the page first, then add its CSS and images.' : 'No file was picked.', true); if (replace) files = new Map(); return; }
    return show(p);
  }
  return show(page);
}
const fromInput = inp => [...inp.files].map(f => ({ file: f, path: f.webkitRelativePath || f.name }));
$('pick').multiple = true;  // a page with its CSS and images can be picked together
$('pick').addEventListener('change', e => { openList(fromInput(e.target), true); e.target.value = ''; });
$('pick2').addEventListener('change', e => { openList(fromInput(e.target), true); e.target.value = ''; });
$('addFiles').addEventListener('change', e => {
  // loose files land next to the page, so relative links such as css/site.css still find site.css by its name
  openList([...e.target.files].map(f => ({ file: f, path: dirOf(page) + f.name })), false); e.target.value = '';
});
$('addDir').addEventListener('change', e => {
  // a folder with pages is the site: it replaces what is open; a folder with only CSS, images or fonts is added
  const list = fromInput(e.target);
  openList(list, !page || list.some(x => isHtml(x.path))); e.target.value = '';
});
$('sample').addEventListener('click', () => {
  openList(SAMPLE.map(s => ({ path: s.path, file: new File([s.b64 ? Uint8Array.from(atob(s.b64), c => c.charCodeAt(0)) : s.text], s.path.split('/').pop(), { type: s.type }) })), true);
});
async function walk(entry, prefix, out) {  // a dropped folder
  if (out.length >= MAX_FILES) return;
  if (entry.isFile) { const f = await new Promise((ok, bad) => entry.file(ok, bad)); out.push({ file: f, path: prefix + f.name }); return; }
  if (entry.isDirectory) {
    const rd = entry.createReader();
    for (;;) {
      const batch = await new Promise((ok, bad) => rd.readEntries(ok, bad));
      if (!batch.length) break;
      for (const e of batch) await walk(e, prefix + entry.name + '/', out);
      if (out.length >= MAX_FILES) break;
    }
  }
}
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', async e => {
  e.preventDefault(); document.body.classList.remove('dragging');
  const dt = e.dataTransfer; if (!dt) return;
  const entries = [...dt.items || []].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entries.some(x => x.isDirectory)) { const out = []; say('Reading the folder ...'); for (const en of entries) await walk(en, '', out); return openList(out, true); }
  const fl = [...dt.files].map(f => ({ file: f, path: f.name }));
  if (fl.length) openList(fl, !page || fl.some(x => isHtml(x.path)));
});
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
