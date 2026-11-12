/* Zovo RTF Viewer Online (TOOLCHK3, wave18). The file is read in this tab with the File API and never sent anywhere:
   the page CSP sets connect-src 'none'. worker.js (the RTF Viewer extension's own parser, MIT) turns the RTF into
   HTML text in a background worker, so a big file never freezes the tab. Every chunk is parsed with DOMParser
   (an inert document), cleaned to a short list of tags and attributes, and its style attributes are applied
   through the CSSOM, so the page needs no 'unsafe-inline'. Pictures come only from the bytes in the file:
   PNG, JPEG and BMP as blob: URLs, EMF and WMF drawn to SVG by pictures.js (shown in an <img>, which runs nothing). */
const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAX = 200 * 1024 * 1024;      // bytes; bigger files are refused
const TIME = 90 * 1000;             // ms before a read is stopped
const MIME = { png: 'image/png', jpeg: 'image/jpeg', bmp: 'image/bmp', gif: 'image/gif' };

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  applyPaper();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyPaper());

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

/* ---------- state ---------- */
const view = $('view'), paper = $('paper'), body = $('docbody'), fns = $('fns'), scroller = $('scroller');
let worker = null, timer = 0, gen = 0, page = null, urls = [], pending = new Map(), picsLib = null, zoom = 1, fitted = false;
let hits = [], hitIdx = -1, lastQ = '', t0 = 0, cur = null, fontSheet = null;
const P = { view: 'page', paper: 'auto' };

/* ---------- cleaning the parser's HTML ---------- */
const TAGS = new Set(['P', 'SPAN', 'TABLE', 'COLGROUP', 'COL', 'TBODY', 'THEAD', 'TR', 'TD', 'TH', 'BR', 'DIV', 'IMG', 'SUP', 'SUB', 'A', 'B', 'I', 'U', 'S', 'STRONG', 'EM']);
const ATTRS = new Set(['class', 'colspan', 'rowspan', 'alt', 'title', 'id']);
const SAFE_URL = /^(https?:\/\/|mailto:)[^\s<>"]+$/i;
function toNodes(html) {
  // The parser escapes every quote in file text, so ' style="' only occurs inside its own tags. Renaming it keeps
  // the HTML parser from applying (and the CSP from reporting) inline styles; they are set through the CSSOM below.
  const d = new DOMParser().parseFromString('<!DOCTYPE html><body>' + String(html).replace(/ style="/g, ' data-zs="'), 'text/html');
  const styles = [];
  const walk = [...d.body.querySelectorAll('*')];
  for (const n of walk) {
    if (!TAGS.has(n.tagName)) { n.replaceWith(...(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'svg', 'SVG', 'MATH', 'TEMPLATE'].includes(n.tagName) ? [] : n.childNodes)); continue; }
    for (const a of [...n.attributes]) {
      const k = a.name;
      if (k === 'data-zs' || k === 'style') {
        const v = a.value;
        n.removeAttribute(k);
        if (!/url\s*\(|expression|@import|\\/i.test(v)) styles.push([n, v]);
      } else if (k.startsWith('data-') ? !/^data-(o|oc|f|id|kind|fn|href)$/.test(k) : !ATTRS.has(k)) n.removeAttribute(k);
      else if (k === 'id') n.id = 'r-' + a.value.replace(/[^\w-]/g, '').slice(0, 40);
      else if (k === 'data-href' && !SAFE_URL.test(a.value.trim())) n.removeAttribute(k);
    }
    if (n.tagName === 'A' && n.dataset.href) { n.href = n.dataset.href.trim(); n.target = '_blank'; n.rel = 'noopener noreferrer nofollow'; }
  }
  const frag = document.createDocumentFragment();
  for (const c of [...d.body.childNodes]) frag.appendChild(document.adoptNode(c));
  for (const [n, v] of styles) n.style.cssText = v;  // CSSOM, allowed by style-src 'self'
  return frag;
}
function setFonts(css) {
  try {
    if (!fontSheet) { fontSheet = new CSSStyleSheet(); document.adoptedStyleSheets = [...document.adoptedStyleSheets, fontSheet]; }
    fontSheet.replaceSync(String(css || '').replace(/\.doc /g, '.rtfv .doc ').replace(/url\s*\(|@import/gi, ''));
  } catch (e) { /* fonts fall back to the page font */ }
}

/* ---------- pictures ---------- */
function loadPics() {
  if (picsLib) return picsLib;
  picsLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'pictures.js';
    s.onload = () => self.DocxPictures ? res(self.DocxPictures) : rej(new Error('the picture code did not start'));
    s.onerror = () => rej(new Error('the picture code did not load'));
    document.head.appendChild(s);
  });
  return picsLib;
}
function picFailed(img, why) {
  const span = el('span', 'Picture (' + (img.dataset.kind || '').toUpperCase() + ') could not be drawn' + (why ? ': ' + why : ''), 'ph');
  if (img.style.width) span.style.minWidth = Math.min(parseFloat(img.style.width), 600) + 'px';
  img.replaceWith(span);
}
function showPicture(img, im) {
  if (!im || !im.bytes) return;
  const my = gen;
  const done = blob => { if (my !== gen) return; const u = URL.createObjectURL(blob); urls.push(u); img.onerror = () => picFailed(img, 'the picture data is damaged'); img.src = u; img.alt = img.alt || 'Picture from the document'; };
  if (MIME[im.kind]) return done(new Blob([im.bytes], { type: MIME[im.kind] }));
  if (im.kind === 'emf' || im.kind === 'wmf') {
    loadPics().then(lib => lib.draw(im.bytes, im.kind)).then(done, e => picFailed(img, String((e && e.message) || e).slice(0, 120)));
    return;
  }
  picFailed(img, 'unknown format');
}
function wirePics(container) {
  for (const img of container.querySelectorAll('img.pic')) { const id = Number(img.dataset.id); showPicture(img, pending.get(id)); pending.delete(id); }
}

/* ---------- paper colors and layout ---------- */
const paperDark = () => P.paper === 'dark' || (P.paper === 'auto' && isDark());
function rgb(s) { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; }
function lum(c) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
function mix(a, b, t) { return 'rgb(' + a.map((v, i) => Math.round(v * (1 - t) + b[i] * t)).join(', ') + ')'; }
function darkColors(rootEl) {  // from the extension: colors picked for white paper are adjusted on dark paper
  const dark = paperDark();
  for (const e of rootEl.querySelectorAll('[style*="color"]')) {
    if (!dark) {
      if (e.dataset.fg0 !== undefined) { e.style.color = e.dataset.fg0; delete e.dataset.fg0; }
      if (e.dataset.bg0 !== undefined) { e.style.backgroundColor = e.dataset.bg0; delete e.dataset.bg0; }
      continue;
    }
    if (e.dataset.fg0 !== undefined || e.dataset.bg0 !== undefined) continue;
    const fg = rgb(e.style.color), bg = rgb(e.style.backgroundColor);
    if (bg && lum(bg) > 0.35) {
      if (e.tagName === 'SPAN' || e.tagName === 'A') { e.dataset.fg0 = e.style.color; e.style.color = '#000'; }
      else { e.dataset.bg0 = e.style.backgroundColor; e.style.backgroundColor = mix(bg, [30, 34, 40], 0.72); }
    }
    if (fg && e.dataset.fg0 === undefined && lum(fg) < 0.18 && !(bg && lum(bg) > 0.35)) { e.dataset.fg0 = e.style.color; e.style.color = mix(fg, [255, 255, 255], 0.6); }
  }
}
function applyPaper() { view.classList.toggle('p-dark', paperDark()); darkColors(paper); }
function applyView() {
  view.classList.toggle('v-flow', P.view === 'flow'); view.classList.toggle('v-page', P.view !== 'flow');
  if (!page || P.view === 'flow') { paper.style.width = ''; paper.style.padding = ''; return; }
  const w = page.w / 15, ml = page.ml / 15, mr = page.mr / 15, mt = Math.min(page.mt, 2880) / 15, mb = Math.min(page.mb, 2880) / 15;
  paper.style.width = Math.max(120, Math.round(w - ml - mr)) + 'px';
  paper.style.padding = Math.round(mt) + 'px ' + Math.round(mr) + 'px ' + Math.round(mb) + 'px ' + Math.round(ml) + 'px';
  for (const [k, v] of [['--ml', ml], ['--mr', mr], ['--mt', mt], ['--mb', mb]]) paper.style.setProperty(k, Math.round(v) + 'px');
}
function applyZoom() { zoom = Math.max(0.3, Math.min(4, Math.round(zoom * 100) / 100)); paper.style.zoom = String(zoom); $('zval').textContent = Math.round(zoom * 100) + '%'; }
function fitWidth() {
  if (!page || P.view === 'flow') { zoom = 1; return applyZoom(); }
  zoom = Math.max(0.3, Math.min(4, (scroller.clientWidth - 48) / (page.w / 15))); applyZoom();
}
function autoFit() { if (fitted || !page || P.view === 'flow') return; fitted = true; if (page.w / 15 + 48 > scroller.clientWidth && scroller.clientWidth > 200) fitWidth(); }

/* ---------- opening a file ---------- */
function stop(text) {
  if (worker) { worker.terminate(); worker = null; }
  clearTimeout(timer); $('stop').hidden = true;
  if (text) say(text, true);
}
async function open(file) {
  if (!file) return;
  stop();
  if (file.size > MAX) return say(`This file is ${size(file.size)}. The page opens RTF files up to ${size(MAX)}; the VS Code extension opens bigger ones.`, true);
  say('Reading ' + file.name + ' (' + size(file.size) + ') ...');
  let buf;
  try { buf = await file.arrayBuffer(); } catch (e) { return say('The file could not be read: ' + e.message, true); }
  start(file.name, buf);
}
function start(name, buf) {
  gen++; t0 = performance.now(); fitted = false; page = null;
  for (const u of urls) URL.revokeObjectURL(u);
  urls = []; pending = new Map(); clearHits(); lastQ = ''; $('q').value = '';
  body.replaceChildren(); fns.replaceChildren(); $('outline').replaceChildren(); $('finfo').replaceChildren(); $('fonts').replaceChildren(); $('notes').hidden = true;
  cur = { name, size: buf.byteLength };
  $('fname').textContent = name; $('fmeta').textContent = size(buf.byteLength);
  const my = gen;
  worker = new Worker('worker.js');
  worker.onmessage = e => { if (my === gen) onMsg(e.data); };
  worker.onerror = e => { if (my === gen) { stop(); say('The parser stopped with an error: ' + (e.message || 'unknown error'), true); } };
  worker.postMessage({ bytes: buf }, [buf]);
  timer = setTimeout(() => { if (my === gen) stop('Reading took longer than ' + TIME / 1000 + ' seconds, so it was stopped. The part read so far is shown.'); }, TIME);
  $('stop').hidden = false;
}
function onMsg(m) {
  if (m.type === 'chunk') {
    if (m.page) { page = m.page; applyView(); }
    if (m.fontCss !== undefined) setFonts(m.fontCss);
    for (const im of m.images || []) pending.set(im.id, im);
    const div = el('div'); div.appendChild(toNodes(m.html));
    wirePics(div);
    if (paperDark()) darkColors(div);
    body.appendChild(div);
    $('drop').hidden = true; view.hidden = false; autoFit();
    if (m.total > 2 * 1048576) say('Reading ... ' + Math.min(99, Math.round(m.pos / m.total * 100)) + ' %');
  } else if (m.type === 'progress') {
    if (m.total > 2 * 1048576) say('Reading ... ' + Math.min(99, Math.round(m.pos / m.total * 100)) + ' %');
  } else if (m.type === 'done') {
    stop(); finish(m);
  } else if (m.type === 'error') {
    stop();
    const why = m.code === 'NOTRTF' ? 'This file does not start with {\\rtf, so it is not an RTF file. Word .docx files open in the DOCX Viewer.' : m.message;
    say(why, true);
  }
}
function finish(m) {
  const r = m.res;
  page = r.page; setFonts(r.fontCss);
  if (r.footnotes) { fns.appendChild(el('div', 'Footnotes', 'fnhead')); fns.appendChild(toNodes(r.footnotes)); wirePics(fns); }
  addHeaders(r.header, r.footer);
  applyView(); applyPaper(); autoFit();
  buildOutline(); buildInfo(r, m); showNotes(r.notes || []);
  $('drop').hidden = true; view.hidden = false;
  const empty = !body.textContent.trim() && !body.querySelector('img,.ph,.obj');
  say(empty ? 'Opened, but this RTF file has no visible text.' : `Opened in ${Math.round(performance.now() - t0)} ms.`, empty);
  self.zovoState = { pages: r.counts.pages, tables: r.counts.tables, pictures: r.counts.pictures, picturesSkipped: r.counts.picturesSkipped, headings: r.counts.headings, links: r.counts.links, linksBlocked: r.counts.linksBlocked, fonts: r.fonts.length, cp: r.cp, generator: r.generator, title: r.title, textLen: body.textContent.length, imgs: body.querySelectorAll('img.pic').length };
}
function addHeaders(header, footer) {
  if (!header && !footer) return;
  const mk = (html, cls) => { const d = el('div', null, 'hf ' + cls); d.appendChild(toNodes(html)); return d; };
  const breaks = [...body.querySelectorAll('.pb')];
  if (breaks.length > 2000) { if (header) body.prepend(mk(header, 'hdr')); if (footer) body.append(mk(footer, 'ftr')); return numberPages(); }
  if (header) { body.prepend(mk(header, 'hdr')); for (const b of breaks) b.after(mk(header, 'hdr')); }
  if (footer) { for (const b of breaks) b.before(mk(footer, 'ftr')); body.append(mk(footer, 'ftr')); }
  numberPages();
}
function numberPages() {
  const total = body.querySelectorAll('.pb').length + 1;
  let n = 1;
  const w = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  for (let x = w.nextNode(); x; x = w.nextNode()) {
    if (x.classList.contains('pb')) n++;
    else if (x.classList.contains('fld')) x.textContent = x.dataset.f === 'PAGE' ? String(n) : String(total);
  }
}
function buildOutline() {
  let hs = [...body.querySelectorAll('[data-o]')], attr = 'o';
  if (!hs.length) { hs = [...body.querySelectorAll('[data-oc]')]; attr = 'oc'; }
  const box = $('outline'); box.replaceChildren();
  if (!hs.length) { box.appendChild(el('p', 'No headings in this file.', 'mut')); return; }
  for (const h of hs.slice(0, 3000)) {
    const a = el('a', (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) || '(empty heading)');
    a.href = '#'; a.style.paddingLeft = (4 + (Math.min(Number(h.dataset[attr]) || 1, 6) - 1) * 12) + 'px';
    a.addEventListener('click', e => { e.preventDefault(); h.scrollIntoView({ block: 'start' }); });
    box.appendChild(a);
  }
}
const CPN = { 1252: 'Windows-1252 (Western)', 1250: 'Windows-1250 (Central European)', 1251: 'Windows-1251 (Cyrillic)', 1253: 'Windows-1253 (Greek)', 1254: 'Windows-1254 (Turkish)', 1255: 'Windows-1255 (Hebrew)', 1256: 'Windows-1256 (Arabic)', 932: 'Shift JIS (Japanese)', 936: 'GBK (Simplified Chinese)', 949: 'Korean', 950: 'Big5 (Traditional Chinese)', 10000: 'Mac Roman', 65001: 'UTF-8' };
function buildInfo(r, m) {
  const c = r.counts, rows = [];
  if (r.title) rows.push(['Title', r.title]);
  if (r.generator) rows.push(['Written by', r.generator]);
  rows.push(['Code page', CPN[r.cp] || String(r.cp)]);
  rows.push(['Page', page ? `${(page.w / 1440).toFixed(2)} x ${(page.h / 1440).toFixed(2)} in${page.landscape ? ', landscape' : ''}` : '']);
  rows.push(['Pages', int(c.pages) + (c.pages > 1 ? ' (from page breaks)' : '')]);
  rows.push(['Tables', int(c.tables)]);
  rows.push(['Pictures', int(c.pictures) + (c.picturesSkipped ? `, ${int(c.picturesSkipped)} shown as a box` : '')]);
  rows.push(['Headings', int(c.headings)]);
  rows.push(['Links', int(c.links) + (c.linksBlocked ? `, ${int(c.linksBlocked)} blocked` : '')]);
  if (c.objects) rows.push(['Embedded objects', int(c.objects) + ' (not opened)']);
  rows.push(['Colors', int(r.colors)]);
  rows.push(['Read in', int(m.ms) + ' ms']);
  const t = $('finfo');
  for (const [k, v] of rows) { const tr = el('tr'); tr.append(el('th', k), el('td', v)); t.appendChild(tr); }
  const ul = $('fonts');
  for (const f of r.fonts.slice(0, 60)) ul.appendChild(el('li', (f.name || '(no name)') + (f.family ? ' (' + f.family + ')' : '')));
  if (!r.fonts.length) ul.appendChild(el('li', 'No font table', 'mut'));
  $('fmeta').textContent = `${size(cur.size)} · ${int(c.pages)} page${c.pages === 1 ? '' : 's'} · ${int(c.tables)} table${c.tables === 1 ? '' : 's'} · ${int(c.pictures)} picture${c.pictures === 1 ? '' : 's'}`;
}
function showNotes(notes) {
  const box = $('notes'); box.replaceChildren();
  for (const t of notes.slice(0, 6)) box.appendChild(el('div', t));
  box.hidden = !notes.length;
}

/* ---------- find ---------- */
function clearHits() {
  for (const m of body.querySelectorAll('mark.hit')) m.replaceWith(document.createTextNode(m.textContent));
  body.normalize(); hits = []; hitIdx = -1; $('hits').textContent = '';
}
function runSearch(text) {
  clearHits(); lastQ = text;
  if (!text) return;
  const needle = text.toLowerCase(), nodes = [];
  const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.toLowerCase().includes(needle)) nodes.push(n);
  outer: for (const node of nodes) {
    let n = node;
    for (;;) {
      const i = n.nodeValue.toLowerCase().indexOf(needle);
      if (i < 0) break;
      const hit = n.splitText(i); n = hit.splitText(needle.length);
      const mark = el('mark', null, 'hit'); hit.replaceWith(mark); mark.appendChild(hit); hits.push(mark);
      if (hits.length >= 20000) break outer;
    }
  }
  $('hits').textContent = hits.length ? '' : 'No results';
  if (hits.length) go(0);
}
function go(i) {
  if (!hits.length) return;
  if (hits[hitIdx]) hits[hitIdx].classList.remove('cur');
  hitIdx = (i + hits.length) % hits.length;
  hits[hitIdx].classList.add('cur'); hits[hitIdx].scrollIntoView({ block: 'center', inline: 'nearest' });
  $('hits').textContent = (hitIdx + 1) + ' of ' + int(hits.length) + (hits.length >= 20000 ? '+' : '');
}
let qTimer = 0;
$('q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { const v = $('q').value; if (v !== lastQ && (v.length >= 2 || !v)) runSearch(v); }, 250); });
$('q').addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('q').value = ''; clearHits(); lastQ = ''; return; }
  if (e.key !== 'Enter') return;
  e.preventDefault(); clearTimeout(qTimer);
  if ($('q').value !== lastQ || !hits.length) runSearch($('q').value); else go(hitIdx + (e.shiftKey ? -1 : 1));
});
$('next').addEventListener('click', () => ($('q').value !== lastQ ? runSearch($('q').value) : go(hitIdx + 1)));
$('prev').addEventListener('click', () => ($('q').value !== lastQ ? runSearch($('q').value) : go(hitIdx - 1)));
document.addEventListener('keydown', e => {
  if (view.hidden) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); $('q').focus(); $('q').select(); }
});

/* ---------- toolbar ---------- */
$('zin').addEventListener('click', () => { zoom *= 1.1; applyZoom(); });
$('zout').addEventListener('click', () => { zoom /= 1.1; applyZoom(); });
$('zval').addEventListener('click', () => { zoom = 1; applyZoom(); });
$('zfit').addEventListener('click', fitWidth);
$('vmode').addEventListener('change', e => { P.view = e.target.value; if (P.view === 'flow') { zoom = 1; applyZoom(); } else { fitted = false; autoFit(); } applyView(); });
$('pcol').addEventListener('change', e => { P.paper = e.target.value; applyPaper(); });
$('stop').addEventListener('click', () => stop('Stopped. The part read so far is shown.'));
$('copy').addEventListener('click', async () => {
  const text = (paper.innerText || '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  try { await navigator.clipboard.writeText(text); say('Copied ' + int(text.length) + ' characters of text.'); }
  catch (e) { say('The browser did not allow copying. Select the text and press Ctrl+C or Cmd+C.', true); }
});
body.addEventListener('click', e => {  // footnote marks jump to their note
  const a = e.target.closest && e.target.closest('a[data-fn]');
  if (!a) return;
  e.preventDefault();
  const t = document.getElementById('r-fn' + a.dataset.fn.replace(/\D/g, ''));
  if (t) t.scrollIntoView({ block: 'center' });
});

/* ---------- open, drop, sample ---------- */
$('pick').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('pick2').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('sample').addEventListener('click', async () => {
  try {
    const { SAMPLE } = await import('./sample.js');
    const bin = atob(SAMPLE.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    say('Reading the sample ...'); start(SAMPLE.name, u8.buffer);
  } catch (e) { say('The sample could not be loaded: ' + e.message, true); }
});
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });
if (innerWidth < 640) { P.view = 'flow'; $('vmode').value = 'flow'; }  // phones: text that follows the screen width
view.classList.add(P.view === 'flow' ? 'v-flow' : 'v-page');
applyZoom();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
