/* Font Viewer Online (TOOLCHK, wave18; first draft by HTOOL2, replaced). Reads TTF, OTF, WOFF, WOFF2 and TTC in this tab
   with the Font Viewer extension's own reader (fontcore.js), opentype.js 1.3.4 for glyph outlines, the brotli decoder
   of hyparquet-compressors 1.1.3 for WOFF2 and fflate 0.8.2 for WOFF, all pinned on cdn.jsdelivr.net with SRI hashes in
   the import map. The type tester uses the browser's FontFace API with the file's own bytes. Names and values from
   the font are written as text; glyph outlines are set as SVG path data, never as HTML. */
import * as OTM from 'opentype';
import { decompressBrotli } from 'brotli';
import { unzlibSync } from 'fflate';
const OT = OTM.default || OTM;
self.ZovoOpentype = OT;
self.ZovoInflate = { brotli: (b, n) => decompressBrotli(b, n), zlib: b => unzlibSync(b) };

const $ = id => document.getElementById(id);
const F = self.ZovoFont, NS = 'http://www.w3.org/2000/svg', PAGE = 240;
let font = null, raw = null, face = null, gq = '', goff = 0, famN = 0;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const int = n => Number(n).toLocaleString('en-US');
const kv = rows => rows.filter(r => r[1] !== '' && r[1] != null && !(Array.isArray(r[1]) && !r[1].length)).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(Array.isArray(v) ? v.join(', ') : v)}</td></tr>`).join('');
const WEIGHT = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };
const WIDTH = { 1: 'Ultra Condensed', 2: 'Extra Condensed', 3: 'Condensed', 4: 'Semi Condensed', 5: 'Normal', 6: 'Semi Expanded', 7: 'Expanded', 8: 'Extra Expanded', 9: 'Ultra Expanded' };
const cpText = cp => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

async function load(faceIndex) {
  font = F.openFont(F.Buffer.from(raw), { face: faceIndex || 0 });
  const i = font.info;
  $('finfo').innerHTML = kv([['Family', i.family], ['Style', i.subfamily], ['Full name', i.fullName], ['Version', i.version], ['PostScript name', i.postscriptName], ['Format', i.formatLabel + ', ' + i.outlines + ' outlines'],
    ['Glyphs', int(i.numGlyphs)], ['Characters mapped', int(i.codePoints)], ['Units per em', i.unitsPerEm], ['Weight', i.weightClass != null ? i.weightClass + (WEIGHT[i.weightClass] ? ' (' + WEIGHT[i.weightClass] + ')' : '') : ''],
    ['Width', i.widthClass != null ? i.widthClass + (WIDTH[i.widthClass] ? ' (' + WIDTH[i.widthClass] + ')' : '') : ''], ['Italic', i.italic ? 'yes' + (i.italicAngle ? ', ' + i.italicAngle + ' degrees' : '') : 'no'], ['Monospaced', i.fixedPitch ? 'yes' : ''],
    ['Embedding', i.embedding], ['Vendor', i.vendor], ['Created', i.created], ['Modified', i.modified], ['Ascender, descender, line gap', [i.ascender, i.descender, i.lineGap].filter(x => x != null).join(', ')],
    ['x-height, cap height', [i.xHeight, i.capHeight].filter(x => x != null).join(', ')], ['Color formats', i.color], ['Variable axes', (i.axes || []).map(a => `${a.tag} ${a.min} to ${a.max} (default ${a.def})`)],
    ['Named instances', (i.instances || []).map(x => x.name).slice(0, 40)], ['Substitution features (GSUB)', i.gsubFeatures], ['Positioning features (GPOS)', i.gposFeatures], ['Outline note', i.outlineError]]);
  $('fnames').innerHTML = kv(i.names.map(n => [n.id + ' ' + n.label, n.value.length > 600 ? n.value.slice(0, 600) + '...' : n.value]));
  $('ftables').textContent = i.tables.map(t => t.tag.trim() + ' ' + int(t.length)).join(', ');
  $('faceBox').hidden = !i.faces;
  if (i.faces) $('face').innerHTML = i.faces.map((n, k) => `<option value="${k}"${k === i.face ? ' selected' : ''}>${esc(n)}</option>`).join('');
  // the type tester: the font's own bytes through FontFace, no URL and no request
  if (face) document.fonts.delete(face);
  const fam = 'zovo-font-' + (++famN);
  face = new FontFace(fam, font.webBytes.buffer.slice(font.webBytes.byteOffset, font.webBytes.byteOffset + font.webBytes.byteLength));
  try { await face.load(); document.fonts.add(face); $('tnote').textContent = ''; } catch (e) { $('tnote').textContent = 'Your browser could not load this font for the type tester (' + e.message + '). The facts and glyphs above come from the file itself.'; }
  $('tester').style.fontFamily = `"${fam}", "Adobe NotDef", serif`;
  $('axes').textContent = '';
  for (const a of i.axes || []) {
    const l = document.createElement('label'), r = document.createElement('input');
    r.type = 'range'; r.min = a.min; r.max = a.max; r.step = (a.max - a.min) / 100 || 1; r.value = a.def; r.dataset.tag = a.tag;
    l.append(a.tag + ' ', r); $('axes').append(l);
    r.addEventListener('input', axes);
  }
  axes();
  gq = ''; goff = 0; $('gq').value = '';
  grid(); blocks();
  return i;
}
function axes() { $('tester').style.fontVariationSettings = [...$('axes').querySelectorAll('input')].map(r => `"${r.dataset.tag}" ${r.value}`).join(', ') || 'normal'; }

function glyphSvg(g, size) {
  const i = font.info, s = document.createElementNS(NS, 'svg'), adv = g.adv || i.unitsPerEm, top = Math.max(i.ascender, i.unitsPerEm * 0.8), bot = Math.min(i.descender, -i.unitsPerEm * 0.2);
  s.setAttribute('viewBox', `${-adv * 0.1} ${-top} ${adv * 1.2} ${top - bot}`); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  const base = document.createElementNS(NS, 'line'); base.setAttribute('x1', -adv); base.setAttribute('x2', adv * 2); base.setAttribute('y1', 0); base.setAttribute('y2', 0); base.setAttribute('class', 'gb'); s.append(base);
  if (g.d) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', g.d); s.append(p); }
  else if (g.cps.length) { const t = document.createElementNS(NS, 'text'); t.textContent = String.fromCodePoint(g.cps[0]); t.setAttribute('font-size', i.unitsPerEm); t.setAttribute('class', 'gt'); t.style.fontFamily = $('tester').style.fontFamily; s.append(t); }
  return s;
}
function grid() {
  const p = font.page(gq, goff, PAGE), box = $('glyphs');
  box.textContent = '';
  for (const g of p.items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'gc'; b.dataset.id = g.id;
    b.title = g.name + (g.cps.length ? ' ' + g.cps.map(cpText).join(' ') : '') + ', glyph ' + g.id;
    const cap = document.createElement('span'); cap.textContent = g.cps.length ? cpText(g.cps[0]) : '#' + g.id;
    b.append(glyphSvg(g, 54), cap); box.append(b);
  }
  $('gnote').textContent = p.total ? `Glyphs ${int(p.offset + 1)} to ${int(p.offset + p.items.length)} of ${int(p.total)}` + (gq ? ' that match' : '') : 'No glyph matches.';
  $('gprev').disabled = goff <= 0; $('gnext').disabled = goff + PAGE >= p.total;
}
function detail(id) {
  const g = font.glyph(id), box = $('gdetail');
  box.hidden = false; $('gbig').textContent = ''; $('gbig').append(glyphSvg(g, 220));
  $('ginfo').innerHTML = kv([['Name', g.name], ['Glyph id', g.id], ['Characters', g.cps.map(c => cpText(c) + ' ' + String.fromCodePoint(c)).join(', ') || 'none (reached through features only)'], ['Advance width', g.adv != null ? g.adv + ' units' : '']]);
}
function blocks() {
  const b = font.blocks();
  $('blocks').tBodies[0].innerHTML = b.list.map(x => `<tr><td>${esc(x.name)}</td><td class="mono">${cpText(x.start)} to ${cpText(x.end)}</td><td class="n">${int(x.covered)} of ${int(x.size)}</td><td><span class="cbar"></span></td></tr>`).join('') + (b.other ? `<tr><td colspan="4" class="mut">${int(b.other)} characters outside the listed blocks</td></tr>` : '');
  $('blocks').querySelectorAll('.cbar').forEach((s, k) => { s.style.width = Math.max(2, b.list[k].covered / b.list[k].size * 120) + 'px'; });
}

self.zovoOpen = async file => {
  if (file.size > 100 * 1048576) throw new Error('it is ' + self.zovoSize(file.size) + '. This page opens font files up to 100 MB.');
  raw = new Uint8Array(await file.arrayBuffer());
  let i;
  try { i = await load(0); } catch (e) { throw new Error(String(e.message || e).replace(/^This file/, 'the file').replace(/\.$/, '') + '.'); }
  $('fmeta').textContent = self.zovoSize(file.size);
  return 'Opened ' + file.name + ': ' + (i.fullName || i.family) + ', ' + int(i.numGlyphs) + ' glyphs.';
};
$('face').addEventListener('change', () => load(+$('face').value).catch(e => self.zovoMsg(e.message, true)));
$('gq').addEventListener('input', () => { gq = $('gq').value; goff = 0; if (font) grid(); });
$('gprev').addEventListener('click', () => { goff = Math.max(0, goff - PAGE); grid(); });
$('gnext').addEventListener('click', () => { goff += PAGE; grid(); });
$('glyphs').addEventListener('click', e => { const b = e.target.closest('.gc'); if (b) detail(+b.dataset.id); });
$('tsize').addEventListener('input', () => { $('tester').style.fontSize = $('tsize').value + 'px'; $('tsizeTxt').textContent = $('tsize').value + ' px'; });
