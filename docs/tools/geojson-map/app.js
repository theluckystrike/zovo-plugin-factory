/* Zovo GeoJSON Map Online (TOOLCHK3, wave18). The file is read in this tab with the File API and never sent anywhere:
   the page CSP sets connect-src 'none' and there is no basemap or tile server, so the map is drawn on a canvas from
   the file alone (Web Mercator, with a graticule). Reads GeoJSON (also newline-delimited), TopoJSON, KML, GPX, WKT
   and CSV with latitude and longitude columns. XML is read with DOMParser after the DOCTYPE is removed (no entity
   expansion), KML network links and icons are never loaded, and every value is written as text, never as HTML. */
import { SAMPLE } from './sample.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAXMB = 256, ROWS = 1000, R = 20037508.342789244;

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
  draw(); drawProfile();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { draw(); drawProfile(); });

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const kvRow = (tb, k, v) => { const tr = el('tr'); tr.append(el('th', k), el('td', v)); tb.append(tr); };
const css = n => getComputedStyle(root).getPropertyValue(n).trim();
const plural = (n, w) => int(n) + ' ' + w + (n === 1 ? '' : 's');

/* ---------- parsing ---------- */
// A feature: { geom (GeoJSON geometry as in the file), props, name, layer, style {stroke, fill, width} }
let meta, feats;
const newMeta = format => ({ format, crs: null, skipped: 0, notes: [], gpx: null });

function nameOf(p) {
  if (!p) return '';
  for (const k of ['name', 'Name', 'NAME', 'title', 'Title', 'label', 'NAME_EN', 'ADMIN', 'admin', 'id', 'ID']) if (p[k] != null && typeof p[k] !== 'object' && String(p[k]).trim()) return String(p[k]);
  return '';
}
function simpleStyle(p) {
  if (!p) return {};
  const s = {};
  if (typeof p.stroke === 'string') s.stroke = p.stroke;
  if (typeof p.fill === 'string') s.fill = p.fill;
  if (typeof p['marker-color'] === 'string') s.marker = p['marker-color'];
  if (Number.isFinite(+p['stroke-width'])) s.width = Math.min(12, Math.max(0.5, +p['stroke-width']));
  if (Number.isFinite(+p['fill-opacity'])) s.fillOp = Math.min(1, Math.max(0, +p['fill-opacity']));
  return s;
}
const GTYPES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']);

function fromGeoJSON(obj, out, m, layer) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { for (const o of obj) fromGeoJSON(o, out, m, layer); return; }
  if (obj.crs && obj.crs.properties && /3857|900913|102100|3785/.test(String(obj.crs.properties.name || ''))) m.crs = '3857';
  else if (obj.crs && obj.crs.properties && obj.crs.properties.name && !/4326|CRS84|4258/.test(String(obj.crs.properties.name))) m.notes.push('The file names the coordinate system ' + obj.crs.properties.name + '.');
  if (obj.type === 'FeatureCollection') { for (const f of obj.features || []) fromGeoJSON(f, out, m, layer); return; }
  if (obj.type === 'Feature') {
    const p = obj.properties && typeof obj.properties === 'object' ? obj.properties : {};
    out.push({ geom: obj.geometry && GTYPES.has(obj.geometry.type) ? obj.geometry : null, props: p, name: nameOf(p) || (obj.id != null ? String(obj.id) : ''), layer, style: simpleStyle(p), fid: obj.id });
    return;
  }
  if (GTYPES.has(obj.type)) out.push({ geom: obj, props: {}, name: '', layer, style: {} });
}

function fromTopo(topo, out, m) {
  const t = topo.transform, arcsIn = Array.isArray(topo.arcs) ? topo.arcs : [];
  const arcs = arcsIn.map(arc => {
    let x = 0, y = 0;
    return (Array.isArray(arc) ? arc : []).map(p => {
      if (t) { x += p[0]; y += p[1]; return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]; }
      return [p[0], p[1]];
    });
  });
  const pt = p => t ? [p[0] * t.scale[0] + t.translate[0], p[1] * t.scale[1] + t.translate[1]] : [p[0], p[1]];
  const line = ix => {
    const pts = [];
    for (const i of ix || []) {
      const a = i < 0 ? arcs[~i] : arcs[i];
      if (!a) { m.skipped++; continue; }
      const seq = i < 0 ? a.slice().reverse() : a;
      for (let k = pts.length ? 1 : 0; k < seq.length; k++) pts.push(seq[k]);
    }
    return pts;
  };
  const geom = g => {
    switch (g.type) {
      case 'Point': return { type: 'Point', coordinates: pt(g.coordinates) };
      case 'MultiPoint': return { type: 'MultiPoint', coordinates: (g.coordinates || []).map(pt) };
      case 'LineString': return { type: 'LineString', coordinates: line(g.arcs) };
      case 'MultiLineString': return { type: 'MultiLineString', coordinates: (g.arcs || []).map(line) };
      case 'Polygon': return { type: 'Polygon', coordinates: (g.arcs || []).map(line) };
      case 'MultiPolygon': return { type: 'MultiPolygon', coordinates: (g.arcs || []).map(p => p.map(line)) };
      default: return null;
    }
  };
  const walk = (g, layer) => {
    if (!g) return;
    if (g.type === 'GeometryCollection') { for (const c of g.geometries || []) walk(c, layer); return; }
    const p = g.properties && typeof g.properties === 'object' ? g.properties : {};
    out.push({ geom: geom(g), props: p, name: nameOf(p) || (g.id != null ? String(g.id) : ''), layer, style: simpleStyle(p), fid: g.id });
  };
  for (const [k, o] of Object.entries(topo.objects || {})) walk(o, k);
}

/* WKT, one geometry per line, with an optional EWKT SRID=...; prefix */
function parseWKT(src) {
  const tok = []; const re = /\s*([A-Za-z]+|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[(),])/y;
  let m; re.lastIndex = 0;
  while (re.lastIndex < src.length && (m = re.exec(src))) tok.push(m[1]);
  if (re.lastIndex < src.trim().length && src.slice(re.lastIndex).trim()) throw new Error('bad WKT near "' + src.slice(re.lastIndex, re.lastIndex + 20) + '"');
  let i = 0;
  const peek = () => tok[i], next = () => tok[i++];
  const list = () => {
    if (next() !== '(') throw new Error('expected (');
    const items = [];
    for (;;) {
      if (peek() === '(') items.push(list());
      else { const nums = []; while (peek() !== ',' && peek() !== ')' && peek() != null) nums.push(Number(next())); items.push(nums); }
      const c = next();
      if (c === ')') return items;
      if (c !== ',') throw new Error('expected , or )');
    }
  };
  const geom = () => {
    const type = String(next() || '').toUpperCase();
    while (/^(Z|M|ZM)$/i.test(peek() || '')) next();
    if (/^EMPTY$/i.test(peek() || '')) { next(); return null; }
    if (type === 'GEOMETRYCOLLECTION') {
      if (next() !== '(') throw new Error('expected (');
      const gs = [];
      for (;;) { const g = geom(); if (g) gs.push(g); const c = next(); if (c === ')') break; if (c !== ',') throw new Error('expected , or )'); }
      return { type: 'GeometryCollection', geometries: gs };
    }
    const L = list();
    const pts = a => a.map(p => Array.isArray(p[0]) ? p[0] : p);
    switch (type) {
      case 'POINT': return { type: 'Point', coordinates: L[0] };
      case 'LINESTRING': return { type: 'LineString', coordinates: L };
      case 'POLYGON': return { type: 'Polygon', coordinates: L };
      case 'MULTIPOINT': return { type: 'MultiPoint', coordinates: pts(L) };
      case 'MULTILINESTRING': return { type: 'MultiLineString', coordinates: L };
      case 'MULTIPOLYGON': return { type: 'MultiPolygon', coordinates: L };
      default: throw new Error('unknown WKT type ' + type);
    }
  };
  const g = geom();
  if (i < tok.length) throw new Error('extra text after the geometry');
  return g;
}

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  const d = (text.split('\n', 1)[0].match(/\t/g) || []).length > (text.split('\n', 1)[0].match(/,/g) || []).length ? '\t'
    : (text.split('\n', 1)[0].match(/;/g) || []).length > (text.split('\n', 1)[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; if (rows.length > 500001) break; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function fromCSV(text, out, m) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The CSV file has no data rows.');
  const h = rows[0].map(s => s.trim());
  const find = res => h.findIndex(c => res.test(c));
  const la = find(/^(lat|latitude|y|lat_dd|decimallatitude)$/i), lo = find(/^(lon|lng|long|longitude|x|lon_dd|decimallongitude)$/i), wk = find(/^(wkt|geometry|geom|the_geom)$/i);
  if ((la < 0 || lo < 0) && wk < 0) throw new Error('No latitude and longitude columns found (looked for lat/lon, latitude/longitude, y/x or a WKT column).');
  for (let r = 1; r < rows.length && r <= 500000; r++) {
    const p = {}; h.forEach((k, i) => { p[k || 'column ' + (i + 1)] = rows[r][i] ?? ''; });
    let g = null;
    if (la >= 0 && lo >= 0) { const y = parseFloat(rows[r][la]), x = parseFloat(rows[r][lo]); if (Number.isFinite(x) && Number.isFinite(y)) g = { type: 'Point', coordinates: [x, y] }; }
    else { try { g = parseWKT(rows[r][wk] || ''); } catch (e) { g = null; } }
    if (!g) { m.skipped++; continue; }
    out.push({ geom: g, props: p, name: nameOf(p) || p.place || '', layer: null, style: {} });
  }
  if (rows.length > 500001) m.notes.push('Only the first 500,000 rows were read.');
}

/* XML: KML and GPX */
function xmlDoc(text) {
  const clean = text.replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '');
  const doc = new DOMParser().parseFromString(clean, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('The XML could not be read: ' + (err.textContent || '').trim().split('\n')[0].slice(0, 160));
  return doc;
}
const kids = (e, n) => e ? [...e.children].filter(c => c.localName === n) : [];
const kid = (e, n) => kids(e, n)[0];
const txt = (e, n) => { const k = kid(e, n); return k ? k.textContent.trim() : ''; };
const all = (e, n) => [...e.getElementsByTagNameNS('*', n)];
const stripTags = s => s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
function kmlColor(c) {
  const s = String(c || '').trim();
  if (!/^[0-9a-fA-F]{8}$/.test(s)) return null;
  const a = parseInt(s.slice(0, 2), 16) / 255, b = parseInt(s.slice(2, 4), 16), g = parseInt(s.slice(4, 6), 16), r = parseInt(s.slice(6, 8), 16);
  return { css: `rgb(${r},${g},${b})`, a };
}
function fromKML(doc, out, m) {
  const styles = new Map(), maps = new Map();
  const readStyle = s => {
    const st = {};
    const ls = kid(s, 'LineStyle'), ps = kid(s, 'PolyStyle'), is = kid(s, 'IconStyle');
    if (ls) { const c = kmlColor(txt(ls, 'color')); if (c) st.stroke = c.css; const w = parseFloat(txt(ls, 'width')); if (w > 0) st.width = Math.min(12, w); }
    if (ps) { const c = kmlColor(txt(ps, 'color')); if (c) { st.fill = c.css; st.fillOp = c.a; } if (txt(ps, 'fill') === '0') st.fillOp = 0; }
    if (is) { const c = kmlColor(txt(is, 'color')); if (c) st.marker = c.css; }
    return st;
  };
  for (const s of all(doc, 'Style')) {
    const p = s.parentElement;
    const id = s.getAttribute('id') || (p && p.localName === 'CascadingStyle' ? (p.getAttribute('kml:id') || p.getAttribute('id')) : '');
    if (id) styles.set(id, readStyle(s));
  }
  for (const sm of all(doc, 'StyleMap')) {
    const id = sm.getAttribute('id'); if (!id) continue;
    const pair = kids(sm, 'Pair').find(p => txt(p, 'key') === 'normal');
    if (pair) maps.set(id, txt(pair, 'styleUrl').replace(/^.*#/, ''));
  }
  const style = pm => {
    let st = {};
    const u = txt(pm, 'styleUrl').replace(/^.*#/, '');
    if (u) st = { ...(styles.get(maps.get(u) || u) || {}) };
    const inl = kid(pm, 'Style'); if (inl) Object.assign(st, readStyle(inl));
    return st;
  };
  const coords = s => {
    const pts = [];
    for (const t of String(s || '').trim().split(/\s+/)) { if (!t) continue; const p = t.split(',').map(Number); if (p.length >= 2) pts.push(p); }
    return pts;
  };
  const geom = g => {
    switch (g.localName) {
      case 'Point': { const c = coords(txt(g, 'coordinates')); return c.length ? { type: 'Point', coordinates: c[0] } : null; }
      case 'LineString': case 'LinearRing': return { type: 'LineString', coordinates: coords(txt(g, 'coordinates')) };
      case 'Polygon': {
        const ring = b => { const lr = kid(b, 'LinearRing'); return lr ? coords(txt(lr, 'coordinates')) : []; };
        return { type: 'Polygon', coordinates: [...kids(g, 'outerBoundaryIs').map(ring), ...kids(g, 'innerBoundaryIs').map(ring)].filter(r => r.length) };
      }
      case 'MultiGeometry': return { type: 'GeometryCollection', geometries: [...g.children].map(geom).filter(Boolean) };
      case 'Track': return { type: 'LineString', coordinates: kids(g, 'coord').map(c => c.textContent.trim().split(/\s+/).map(Number)) };
      case 'MultiTrack': return { type: 'MultiLineString', coordinates: kids(g, 'Track').map(t => kids(t, 'coord').map(c => c.textContent.trim().split(/\s+/).map(Number))) };
      default: return null;
    }
  };
  const GEO = new Set(['Point', 'LineString', 'LinearRing', 'Polygon', 'MultiGeometry', 'Track', 'MultiTrack']);
  const layerOf = e => { for (let p = e.parentElement; p; p = p.parentElement) if (p.localName === 'Folder' || p.localName === 'Document') { const n = txt(p, 'name'); if (n) return n; } return 'Placemarks'; };
  for (const pm of all(doc, 'Placemark')) {
    const props = {};
    const n = txt(pm, 'name'); if (n) props.name = n;
    const d = txt(pm, 'description'); if (d) props.description = stripTags(d).slice(0, 2000);
    for (const dt of all(pm, 'Data')) props[dt.getAttribute('name') || 'data'] = txt(dt, 'value');
    for (const sd of all(pm, 'SimpleData')) props[sd.getAttribute('name') || 'data'] = sd.textContent.trim();
    const gEl = [...pm.children].find(c => GEO.has(c.localName));
    out.push({ geom: gEl ? geom(gEl) : null, props, name: n, layer: layerOf(pm), style: style(pm) });
  }
  for (const go of all(doc, 'GroundOverlay')) {
    const b = kid(go, 'LatLonBox'); if (!b) continue;
    const N = +txt(b, 'north'), S = +txt(b, 'south'), E = +txt(b, 'east'), W = +txt(b, 'west');
    if ([N, S, E, W].every(Number.isFinite)) out.push({ geom: { type: 'LineString', coordinates: [[W, S], [E, S], [E, N], [W, N], [W, S]] }, props: { name: txt(go, 'name') || 'Ground overlay', overlay: 'outline only, the picture is not loaded' }, name: txt(go, 'name') || 'Ground overlay', layer: 'Ground overlays', style: {} });
  }
  const nl = all(doc, 'NetworkLink').length;
  if (nl) m.notes.push(plural(nl, 'network link') + ' not loaded (nothing is fetched).');
  const inLink = e => { for (let p = e.parentElement; p; p = p.parentElement) if (p.localName === 'NetworkLink') return true; return false; };
  const icons = all(doc, 'href').filter(h => /^https?:/i.test(h.textContent.trim()) && !inLink(h)).length;
  if (icons) m.notes.push(plural(icons, 'remote icon or picture') + ' not loaded.');
}

const hav = (a, b) => {
  const r = Math.PI / 180, dla = (b[1] - a[1]) * r, dlo = (b[0] - a[0]) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dlo / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
};
function fromGPX(doc, out, m) {
  const pt = e => [parseFloat(e.getAttribute('lon')), parseFloat(e.getAttribute('lat')), ...(txt(e, 'ele') !== '' ? [parseFloat(txt(e, 'ele'))] : [])];
  const tracks = [];
  for (const trk of all(doc, 'trk')) {
    const segs = kids(trk, 'trkseg').map(s => kids(s, 'trkpt').map(p => ({ c: pt(p), t: Date.parse(txt(p, 'time')) })));
    const name = txt(trk, 'name');
    tracks.push({ name, segs });
    const cs = segs.map(s => s.map(p => p.c));
    out.push({ geom: cs.length === 1 ? { type: 'LineString', coordinates: cs[0] } : { type: 'MultiLineString', coordinates: cs }, props: { name: name || 'Track', type: txt(trk, 'type'), points: segs.reduce((a, s) => a + s.length, 0), segments: segs.length }, name: name || 'Track', layer: 'Tracks', style: {} });
  }
  for (const rte of all(doc, 'rte')) {
    const name = txt(rte, 'name');
    out.push({ geom: { type: 'LineString', coordinates: kids(rte, 'rtept').map(pt) }, props: { name: name || 'Route', points: kids(rte, 'rtept').length }, name: name || 'Route', layer: 'Routes', style: {} });
  }
  for (const w of kids(doc.documentElement, 'wpt')) {
    const p = { name: txt(w, 'name') }; for (const k of ['ele', 'time', 'desc', 'cmt', 'sym', 'type']) if (txt(w, k)) p[k] = txt(w, k);
    out.push({ geom: { type: 'Point', coordinates: pt(w) }, props: p, name: p.name || 'Waypoint', layer: 'Waypoints', style: {} });
  }
  if (tracks.length) {
    // per track: distance, elapsed time, moving time (3D step faster than 1 km/h, as gpxpy), elevation gain and loss
    const per = [], prof = [];
    let total = 0, lo = Infinity, hi = -Infinity;
    for (const tr of tracks) {
      let dist = 0, mov = 0, up = 0, down = 0, t0 = Infinity, t1 = -Infinity;
      for (const s of tr.segs) for (let i = 0; i < s.length; i++) {
        const p = s[i], e = p.c[2];
        if (Number.isFinite(e)) { lo = Math.min(lo, e); hi = Math.max(hi, e); }
        if (Number.isFinite(p.t)) { t0 = Math.min(t0, p.t); t1 = Math.max(t1, p.t); }
        if (i) {
          const q = s[i - 1], d = hav(q.c, p.c), e0 = q.c[2]; dist += d;
          const de = Number.isFinite(e) && Number.isFinite(e0) ? e - e0 : 0;
          if (Number.isFinite(p.t) && Number.isFinite(q.t) && p.t > q.t && Math.sqrt(d * d + de * de) / ((p.t - q.t) / 1000) > 1000 / 3600) mov += (p.t - q.t);
          if (de > 0) up += de; else down -= de;
        }
        if (Number.isFinite(e)) prof.push([total + dist, e]);
      }
      total += dist;
      per.push({ name: tr.name || 'Track ' + (per.length + 1), dist, dur: t1 > t0 ? t1 - t0 : 0, mov, up, down });
    }
    const sum = k => per.reduce((a, t) => a + t[k], 0);
    m.gpx = { tracks: per.length, per, dist: total, dur: sum('dur'), mov: sum('mov'), up: sum('up'), down: sum('down'), lo, hi, prof };
  }
}

function parseText(name, text) {
  const out = [];
  const head = text.slice(0, 2000).replace(/^﻿/, '').trimStart();
  let m;
  if (head.startsWith('<')) {
    const doc = xmlDoc(text);
    const r = doc.documentElement.localName;
    if (r === 'kml') { m = newMeta('KML'); fromKML(doc, out, m); }
    else if (r === 'gpx') { m = newMeta('GPX'); fromGPX(doc, out, m); }
    else throw new Error('This XML file is not KML or GPX (its root element is <' + r + '>).');
  } else if (head.startsWith('{') || head.startsWith('[')) {
    let obj = null;
    try { obj = JSON.parse(text.replace(/^﻿/, '').replace(/\bNaN\b/g, 'null')); }
    catch (e) {
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length > 1 && lines.every(l => l.trim().startsWith('{'))) {
        m = newMeta('Newline-delimited GeoJSON');
        lines.forEach((l, i) => { try { fromGeoJSON(JSON.parse(l), out, m, null); } catch (e2) { m.skipped++; } });
      } else throw new Error('The JSON could not be read: ' + e.message);
    }
    if (obj) {
      if (obj.type === 'Topology') { m = newMeta('TopoJSON'); fromTopo(obj, out, m); }
      else { m = newMeta('GeoJSON'); fromGeoJSON(obj, out, m, null); if (!out.length && !(obj.type === 'FeatureCollection')) throw new Error('This JSON file is not GeoJSON or TopoJSON: it has no "type" of FeatureCollection, Feature, Topology or a geometry.'); }
    }
  } else if (/^(SRID=\d+;\s*)?(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\b/i.test(head)) {
    m = newMeta('WKT');
    text.split(/\r?\n/).forEach((l, i) => {
      const s = l.trim(); if (!s) return;
      const srid = /^SRID=(\d+);/i.exec(s);
      if (srid && srid[1] === '3857') m.crs = '3857';
      try { out.push({ geom: parseWKT(s.replace(/^SRID=\d+;\s*/i, '')), props: { line: i + 1 }, name: 'Line ' + (i + 1), layer: null, style: {} }); }
      catch (e) { m.skipped++; m.notes.push('Line ' + (i + 1) + ': ' + e.message + '.'); }
    });
  } else if (/\.(csv|tsv|txt)$/i.test(name) || /[,;\t]/.test(head.split('\n', 1)[0])) {
    m = newMeta(/\.tsv$/i.test(name) ? 'TSV' : 'CSV'); fromCSV(text, out, m);
  } else throw new Error('This file is not GeoJSON, TopoJSON, KML, GPX, WKT or CSV.');
  if (m.notes.length > 12) m.notes.splice(12, m.notes.length - 12, 'and more.');
  return { feats: out, meta: m };
}

/* ---------- geometry to world coordinates (Web Mercator, 0..1) ---------- */
const LATMAX = 85.05112878;
function prep(feats, m) {
  // which coordinate system: lon/lat, raw Web Mercator numbers, or plane coordinates
  let n = 0, big = 0, huge = 0;
  const scan = c => { if (typeof c[0] === 'number') { n++; const x = Math.abs(c[0]), y = Math.abs(c[1]); if (x > 180 || y > 90) big++; if (x > R * 1.001 || y > R * 1.6) huge++; } else for (const k of c) scan(k); };
  const each = (g, fn) => { if (!g) return; if (g.type === 'GeometryCollection') (g.geometries || []).forEach(x => each(x, fn)); else if (g.coordinates) fn(g.coordinates); };
  for (const f of feats) { each(f.geom, scan); if (n > 200000) break; }
  if (!m.crs) m.crs = big > n / 2 ? (huge ? 'plane' : '3857') : 'lonlat';
  if (m.crs === '3857' && !m.notes.some(x => /3857/.test(x))) m.notes.unshift('Coordinates are Web Mercator metres (EPSG:3857); shown as longitude and latitude.');
  if (m.crs === 'plane') m.notes.unshift('Coordinates are not longitude and latitude (projected metres or feet with no EPSG:3857 range). They are drawn as flat x and y, with no graticule. The VS Code extension reprojects them.');
  const proj = m.crs === 'lonlat'
    ? (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 90 || Math.abs(x) > 540) return null; const la = Math.max(-LATMAX, Math.min(LATMAX, y)) * Math.PI / 180; return [(x + 180) / 360, (1 - Math.log(Math.tan(Math.PI / 4 + la / 2)) / Math.PI) / 2]; }
    : m.crs === '3857'
      ? (x, y) => (Number.isFinite(x) && Number.isFinite(y)) ? [(x + R) / (2 * R), (R - y) / (2 * R)] : null
      : (x, y) => (Number.isFinite(x) && Number.isFinite(y)) ? [x, -y] : null;
  let verts = 0;
  const counts = {};
  for (const f of feats) {
    f.parts = []; f.bb = [Infinity, Infinity, -Infinity, -Infinity];
    const ring = (cs, t) => {
      const a = new Float64Array((cs ? cs.length : 0) * 2); let k = 0;
      let pl = null; const wrap = m.crs === 'lonlat' ? 360 : m.crs === '3857' ? 2 * R : 0;
      for (const c of cs || []) {
        let x = Array.isArray(c) ? +c[0] : NaN;
        if (wrap && pl != null && Number.isFinite(x)) { while (x - pl > wrap / 2) x -= wrap; while (pl - x > wrap / 2) x += wrap; }  // keep rings that cross the antimeridian in one piece
        const p = Array.isArray(c) ? proj(x, +c[1]) : null; if (p) pl = x; if (!p) { m.skipped++; continue; } a[k++] = p[0]; a[k++] = p[1]; if (p[0] < f.bb[0]) f.bb[0] = p[0]; if (p[1] < f.bb[1]) f.bb[1] = p[1]; if (p[0] > f.bb[2]) f.bb[2] = p[0]; if (p[1] > f.bb[3]) f.bb[3] = p[1]; }
      verts += k / 2;
      return k ? a.subarray(0, k) : null;
    };
    const add = g => {
      if (!g || !g.coordinates && g.type !== 'GeometryCollection') return;
      const c = g.coordinates;
      try {
        switch (g.type) {
          case 'Point': { const r = ring([c]); if (r) f.parts.push({ t: 'pt', rings: [r] }); break; }
          case 'MultiPoint': for (const p of c) { const r = ring([p]); if (r) f.parts.push({ t: 'pt', rings: [r] }); } break;
          case 'LineString': { const r = ring(c); if (r) f.parts.push({ t: 'ln', rings: [r] }); break; }
          case 'MultiLineString': for (const l of c) { const r = ring(l); if (r) f.parts.push({ t: 'ln', rings: [r] }); } break;
          case 'Polygon': { const rs = c.map(x => ring(x)).filter(Boolean); if (rs.length) f.parts.push({ t: 'pg', rings: rs }); break; }
          case 'MultiPolygon': for (const p of c) { const rs = p.map(x => ring(x)).filter(Boolean); if (rs.length) f.parts.push({ t: 'pg', rings: rs }); } break;
          case 'GeometryCollection': for (const x of g.geometries || []) add(x); break;
        }
      } catch (e) { m.skipped++; }
    };
    add(f.geom);
    const ty = f.geom ? f.geom.type : 'No geometry';
    counts[ty] = (counts[ty] || 0) + 1;
    f.ty = ty;
    f.rank = f.parts.some(p => p.t === 'pt') ? 2 : f.parts.some(p => p.t === 'ln') ? 1 : 0;
  }
  m.verts = verts; m.counts = counts;
  const lonlat = (wx, wy) => m.crs === 'plane' ? null : [wx * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * wy))) * 180 / Math.PI];
  m.toLonLat = lonlat;
}

/* ---------- view ---------- */
const cv = $('map'), stage = $('stage');
let view = { s: 512, ox: 0, oy: 0 }, sel = -1, hover = -1, hidden = new Set(), order = [], dpr = 1, W = 0, H = 0;
const visible = f => !hidden.has(f.layerKey);
function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  W = stage.clientWidth; H = stage.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
function fitTo(bb) {
  if (!bb || !Number.isFinite(bb[0])) { view = { s: W, ox: 0, oy: (H - W) / 2 }; return; }
  let w = bb[2] - bb[0], h = bb[3] - bb[1];
  const pad = 30;
  let s;
  if (w <= 0 && h <= 0) s = meta.crs === 'plane' ? 1 : W / 0.0005;
  else s = Math.min((W - 2 * pad) / Math.max(w, 1e-12), (H - 2 * pad) / Math.max(h, 1e-12));
  if (meta.crs !== 'plane') s = Math.min(s, W / 2e-7);
  view = { s, ox: W / 2 - (bb[0] + w / 2) * s, oy: H / 2 - (bb[1] + h / 2) * s };
}
const bbOf = list => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const f of list) { if (!f.parts.length) continue; b[0] = Math.min(b[0], f.bb[0]); b[1] = Math.min(b[1], f.bb[1]); b[2] = Math.max(b[2], f.bb[2]); b[3] = Math.max(b[3], f.bb[3]); } return b; };

function niceStep(deg) { const st = [90, 45, 30, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002, 0.0001]; for (const s of st) if (deg / s >= 3) return s; return st[st.length - 1]; }
function draw() {
  if (!feats) return;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = css('--panel'); g.fillRect(0, 0, W, H);
  const acc = css('--acc'), fg = css('--fg'), mut = css('--mut'), line = css('--line'), hi = isDark() ? '#ffb347' : '#d9480f';
  const sx = x => x * view.s + view.ox, sy = y => y * view.s + view.oy;
  // graticule
  if (meta.crs !== 'plane') {
    const ll0 = meta.toLonLat(-view.ox / view.s, -view.oy / view.s), ll1 = meta.toLonLat((W - view.ox) / view.s, (H - view.oy) / view.s);
    const step = niceStep(Math.max(1e-9, Math.min(360, ll1[0] - ll0[0])));
    g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = mut; g.font = '11px system-ui, sans-serif';
    const dec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    g.beginPath();
    for (let lo = Math.ceil(Math.max(-180, ll0[0]) / step) * step; lo <= Math.min(180, ll1[0]); lo += step) { const x = sx((lo + 180) / 360); g.moveTo(x, 0); g.lineTo(x, H); }
    const ystep = niceStep(Math.max(1e-9, Math.min(170, ll0[1] - ll1[1])));
    for (let la = Math.ceil(Math.max(-85, ll1[1]) / ystep) * ystep; la <= Math.min(85, ll0[1]); la += ystep) { const r = la * Math.PI / 180, y = sy((1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2); g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
    for (let lo = Math.ceil(Math.max(-180, ll0[0]) / step) * step; lo <= Math.min(180, ll1[0]); lo += step) g.fillText(lo.toFixed(dec) + '°', sx((lo + 180) / 360) + 3, 12);
    for (let la = Math.ceil(Math.max(-85, ll1[1]) / ystep) * ystep; la <= Math.min(85, ll0[1]); la += ystep) { const r = la * Math.PI / 180; g.fillText(la.toFixed(ystep >= 1 ? 0 : dec) + '°', 3, sy((1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2) - 3); }
    // world edge
    g.strokeStyle = mut; g.strokeRect(sx(0), sy(0), view.s, view.s);
  }
  const path = (r, close) => {
    let lx = sx(r[0]), ly = sy(r[1]); g.moveTo(lx, ly);
    for (let i = 2; i < r.length; i += 2) { const x = sx(r[i]), y = sy(r[i + 1]); if (Math.abs(x - lx) + Math.abs(y - ly) >= 0.6 || i === r.length - 2) { g.lineTo(x, y); lx = x; ly = y; } }
    if (close) g.closePath();
  };
  const drawF = (f, emph) => {
    if (!f.parts.length || !visible(f)) return;
    const x0 = sx(f.bb[0]), y0 = sy(f.bb[1]), x1 = sx(f.bb[2]), y1 = sy(f.bb[3]);
    if (x1 < -10 || y1 < -10 || x0 > W + 10 || y0 > H + 10) return;
    const st = f.style, col = emph ? hi : (st.stroke || st.marker || acc);
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (!emph && x1 - x0 < 1.5 && y1 - y0 < 1.5 && f.rank < 2) { g.fillStyle = col; g.fillRect(x0 - 1, y0 - 1, 2, 2); return; }
    for (const p of f.parts) {
      if (p.t === 'pg') {
        g.beginPath(); for (const r of p.rings) path(r, true);
        g.globalAlpha = emph ? 0.35 : (st.fillOp != null ? st.fillOp : 0.22); g.fillStyle = emph ? hi : (st.fill || col); g.fill('evenodd'); g.globalAlpha = 1;
        g.strokeStyle = col; g.lineWidth = emph ? 3 : (st.width || 1.2); g.stroke();
      } else if (p.t === 'ln') {
        g.beginPath(); path(p.rings[0], false); g.strokeStyle = col; g.lineWidth = emph ? 4 : (st.width || 2); g.stroke();
      } else {
        const r = p.rings[0], x = sx(r[0]), y = sy(r[1]);
        g.beginPath(); g.arc(x, y, emph ? 7 : 5, 0, Math.PI * 2); g.fillStyle = emph ? hi : (st.marker || col); g.fill();
        g.lineWidth = 1.5; g.strokeStyle = css('--bg'); g.stroke();
      }
    }
  };
  for (const i of order) if (i !== sel && i !== hover) drawF(feats[i], false);
  if (hover >= 0 && hover !== sel) drawF(feats[hover], true);
  if (sel >= 0) drawF(feats[sel], true);
  // scale bar
  const sc = $('scale');
  if (meta.crs !== 'plane') {
    const cy = (H / 2 - view.oy) / view.s, lat = meta.toLonLat(0, cy)[1];
    const mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / view.s; // metres per CSS pixel
    const target = mpp * 100, p10 = Math.pow(10, Math.floor(Math.log10(target))), nice = [1, 2, 5, 10].map(k => k * p10).filter(v => v <= target).pop() || p10;
    sc.style.width = Math.max(10, Math.round(nice / mpp)) + 'px';
    sc.textContent = nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m';
  } else sc.textContent = '';
}

/* hit test in screen pixels */
function hit(px, py) {
  const wx = (px - view.ox) / view.s, wy = (py - view.oy) / view.s, tol = 6 / view.s;
  let best = -1, bestRank = -1, bestD = Infinity;
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    if (!f.parts.length || !visible(f)) continue;
    if (wx < f.bb[0] - tol || wx > f.bb[2] + tol || wy < f.bb[1] - tol || wy > f.bb[3] + tol) continue;
    for (const p of f.parts) {
      let d = Infinity;
      if (p.t === 'pt') { const r = p.rings[0]; d = Math.hypot(r[0] - wx, r[1] - wy); if (d > tol) continue; }
      else if (p.t === 'ln') { d = segDist(p.rings[0], wx, wy, false); if (d > tol * 0.85) continue; }
      else { let inside = false; for (const r of p.rings) if (pip(r, wx, wy)) inside = !inside; if (!inside) continue; d = tol + (f.bb[2] - f.bb[0]) * (f.bb[3] - f.bb[1]); }  // the smallest polygon under the cursor wins
      const rk = p.t === 'pt' ? 2 : p.t === 'ln' ? 1 : 0;
      if (rk > bestRank || (rk === bestRank && d <= bestD)) { best = i; bestRank = rk; bestD = d; }
    }
  }
  return best;
}
function segDist(r, x, y) {
  let m = Infinity;
  for (let i = 2; i < r.length; i += 2) {
    const ax = r[i - 2], ay = r[i - 1], bx = r[i], by = r[i + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((x - ax) * dx + (y - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    m = Math.min(m, Math.hypot(ax + t * dx - x, ay + t * dy - y));
  }
  return m;
}
function pip(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/* ---------- panels ---------- */
const fmtVal = v => v == null ? 'null' : typeof v === 'object' ? JSON.stringify(v).slice(0, 600) : String(v).slice(0, 2000);
const fmtLL = (lo, la) => la.toFixed(5) + ', ' + lo.toFixed(5);
const dur = ms => { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), mi = Math.floor(s % 3600 / 60); return h ? `${h} h ${String(mi).padStart(2, '0')} min` : `${mi} min ${String(s % 60).padStart(2, '0')} s`; };
function showInfo(file) {
  const tb = $('finfo'); tb.replaceChildren();
  kvRow(tb, 'Format', meta.format);
  kvRow(tb, 'Features', int(feats.length));
  kvRow(tb, 'Geometry', Object.entries(meta.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => int(v) + ' ' + k).join(', ') || 'none');
  kvRow(tb, 'Vertices', int(meta.verts));
  const bb = bbOf(feats);
  if (Number.isFinite(bb[0])) {
    if (meta.crs !== 'plane') { const a = meta.toLonLat(bb[0], bb[3]), b = meta.toLonLat(bb[2], bb[1]); kvRow(tb, 'Bounds', `W ${a[0].toFixed(5)}, S ${a[1].toFixed(5)}, E ${b[0].toFixed(5)}, N ${b[1].toFixed(5)}`); }
    else kvRow(tb, 'Bounds', `x ${bb[0].toFixed(2)} to ${bb[2].toFixed(2)}, y ${(-bb[3]).toFixed(2)} to ${(-bb[1]).toFixed(2)}`);
  }
  kvRow(tb, 'Coordinates', meta.crs === 'lonlat' ? 'Longitude and latitude (WGS 84)' : meta.crs === '3857' ? 'Web Mercator (EPSG:3857)' : 'Plane x and y');
  if (meta.skipped) kvRow(tb, 'Left out', plural(meta.skipped, 'broken coordinate') + ' or entry');
  $('fnote').textContent = meta.notes.join(' ');
  // layers
  const groups = new Map();
  for (const f of feats) { f.layerKey = f.layer || f.ty; groups.set(f.layerKey, (groups.get(f.layerKey) || 0) + 1); }
  const lb = $('layers'); lb.replaceChildren();
  for (const [k, n] of groups) {
    const lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !hidden.has(k);
    cb.addEventListener('change', () => { if (cb.checked) hidden.delete(k); else hidden.add(k); if (sel >= 0 && !visible(feats[sel])) select(-1); draw(); });
    lab.append(cb, ' ' + k + ' ', el('span', '(' + int(n) + ')', 'n')); lb.append(lab);
  }
  $('layersBox').hidden = groups.size < 2;
  // gpx
  const gp = meta.gpx;
  $('gpxBox').hidden = !gp;
  if (gp) {
    const t = $('gpx'); t.replaceChildren();
    kvRow(t, 'Tracks', int(gp.tracks) + (gp.tracks > 1 ? ' (totals below)' : ''));
    kvRow(t, 'Distance', (gp.dist / 1000).toFixed(2) + ' km');
    if (gp.dur) { kvRow(t, 'Duration', dur(gp.dur)); kvRow(t, 'Moving time', dur(gp.mov)); if (gp.mov) kvRow(t, 'Moving speed', (gp.dist / 1000 / (gp.mov / 3600000)).toFixed(1) + ' km/h'); }
    if (Number.isFinite(gp.lo)) { kvRow(t, 'Elevation gain', Math.round(gp.up) + ' m up, ' + Math.round(gp.down) + ' m down'); kvRow(t, 'Lowest, highest', Math.round(gp.lo) + ' m, ' + Math.round(gp.hi) + ' m'); }
    if (gp.tracks > 1) for (const tr of gp.per.slice(0, 50)) kvRow(t, tr.name, (tr.dist / 1000).toFixed(2) + ' km' + (tr.dur ? ', ' + dur(tr.dur) + ' (moving ' + dur(tr.mov) + ')' : '') + (tr.up || tr.down ? ', ' + Math.round(tr.up) + ' m up' : ''));
    $('prof').hidden = gp.prof.length < 2;
  }
  $('fname').textContent = file.name;
  $('fmeta').textContent = size(file.size) + ' · ' + plural(feats.length, 'feature');
}
function drawProfile() {
  const gp = meta && meta.gpx, c = $('prof');
  if (!gp || gp.prof.length < 2 || c.hidden) return;
  const w = c.clientWidth || 280, h = c.clientHeight || 90, d = Math.min(2, devicePixelRatio || 1);
  c.width = w * d; c.height = h * d;
  const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  const P = gp.prof, maxD = P[P.length - 1][0] || 1, lo = gp.lo, hi = Math.max(gp.hi, lo + 1);
  const X = v => 4 + v / maxD * (w - 8), Y = v => h - 14 - (v - lo) / (hi - lo) * (h - 24);
  g.beginPath(); g.moveTo(X(0), h - 14);
  const step = Math.max(1, Math.floor(P.length / (w * 2)));
  for (let i = 0; i < P.length; i += step) g.lineTo(X(P[i][0]), Y(P[i][1]));
  g.lineTo(X(maxD), h - 14); g.closePath();
  g.globalAlpha = 0.25; g.fillStyle = css('--acc'); g.fill(); g.globalAlpha = 1; g.strokeStyle = css('--acc'); g.lineWidth = 1.5; g.stroke();
  g.fillStyle = css('--mut'); g.font = '10px system-ui, sans-serif';
  g.fillText(Math.round(hi) + ' m', 6, 10); g.fillText(Math.round(lo) + ' m', 6, h - 3);
  const km = (maxD / 1000).toFixed(1) + ' km'; g.fillText(km, w - 6 - g.measureText(km).width, h - 3);
}
function select(i, zoom) {
  sel = i;
  const tb = $('props'); tb.replaceChildren();
  for (const tr of $('table').querySelectorAll('tbody tr.on')) tr.classList.remove('on');
  if (i < 0) { $('selNote').textContent = 'Click a feature on the map or a row in the table.'; $('selBtns').hidden = true; draw(); return; }
  const f = feats[i];
  $('selNote').textContent = (f.name || 'Feature ' + (i + 1)) + ' · ' + f.ty + (f.layer ? ' · ' + f.layer : '');
  $('selBtns').hidden = false;
  const keys = Object.keys(f.props);
  for (const k of keys.slice(0, 300)) kvRow(tb, k, fmtVal(f.props[k]));
  if (keys.length > 300) kvRow(tb, '...', (keys.length - 300) + ' more properties');
  if (!keys.length) kvRow(tb, 'Properties', 'none');
  const row = $('table').querySelector(`tbody tr[data-i="${i}"]`);
  if (row) { row.classList.add('on'); if (!zoom) row.scrollIntoView({ block: 'nearest' }); }
  if (zoom && f.parts.length) zoomTo([f]); else draw();
}
function zoomTo(list) { const bb = bbOf(list); if (!Number.isFinite(bb[0])) return; const s0 = view.s; fitTo(bb); if (list.length === 1 && feats.length > 1 && bb[2] - bb[0] === 0 && bb[3] - bb[1] === 0) { view.s = Math.max(s0, Math.min(view.s, s0 * 8)); view.ox = W / 2 - bb[0] * view.s; view.oy = H / 2 - bb[1] * view.s; } draw(); }

let filtered = [], cols = [];
function buildTable() {
  const freq = new Map();
  for (const f of feats.slice(0, 5000)) for (const k of Object.keys(f.props)) freq.set(k, (freq.get(k) || 0) + 1);
  const STYLE = /^(stroke|stroke-width|stroke-opacity|fill|fill-opacity|marker-color|marker-size|marker-symbol)$/;
  cols = [...freq.entries()].sort((a, b) => (STYLE.test(a[0]) - STYLE.test(b[0])) || b[1] - a[1]).slice(0, 14).map(x => x[0]);
  const t = $('table'); t.replaceChildren();
  const th = el('thead'), tr = el('tr');
  tr.append(el('th', '#', 'ix'), el('th', 'Geometry'));
  for (const c of cols) tr.append(el('th', c));
  th.append(tr); t.append(th, el('tbody'));
  applyFilter();
}
function applyFilter() {
  const q = $('ffilter').value.trim().toLowerCase();
  filtered = [];
  for (let i = 0; i < feats.length; i++) {
    if (!q) { filtered.push(i); continue; }
    const f = feats[i];
    if ((f.name || '').toLowerCase().includes(q) || f.ty.toLowerCase().includes(q) || Object.values(f.props).some(v => fmtVal(v).toLowerCase().includes(q))) filtered.push(i);
  }
  const tb = $('table').tBodies[0]; tb.replaceChildren();
  const frag = document.createDocumentFragment();
  for (const i of filtered.slice(0, ROWS)) {
    const f = feats[i], tr = el('tr'); tr.dataset.i = i; tr.tabIndex = 0;
    tr.append(el('td', String(i + 1), 'ix'), el('td', f.ty));
    for (const c of cols) { const v = f.props[c]; tr.append(v == null ? el('td', 'null', 'nul') : el('td', fmtVal(v).slice(0, 200))); }
    if (i === sel) tr.classList.add('on');
    frag.append(tr);
  }
  tb.append(frag);
  $('tableNote').textContent = (q ? plural(filtered.length, 'match') + ' of ' + int(feats.length) : plural(feats.length, 'feature')) + (filtered.length > ROWS ? ', the first ' + int(ROWS) + ' shown' : '') + (Object.keys(feats[0] ? feats[0].props : {}).length > cols.length ? '. Click a row to see all its properties.' : '');
}
$('table').addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) select(+tr.dataset.i, true); });
$('table').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-i]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(+tr.dataset.i, true); } });
let ft = 0; $('ffilter').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(applyFilter, 150); });
$('zrows').addEventListener('click', () => zoomTo(filtered.map(i => feats[i])));
$('fit').addEventListener('click', () => { fitTo(bbOf(feats)); draw(); });
$('zsel').addEventListener('click', () => { if (sel >= 0) zoomTo([feats[sel]]); });
$('copy').addEventListener('click', async () => {
  if (sel < 0) return;
  const f = feats[sel], gj = JSON.stringify({ type: 'Feature', properties: f.props, geometry: f.geom }, null, 1);
  try { await navigator.clipboard.writeText(gj); say('Copied the GeoJSON of ' + (f.name || 'feature ' + (sel + 1)) + ' (' + size(gj.length) + ').'); }
  catch (e) { say('The browser did not allow copying to the clipboard.', true); }
});
$('png').addEventListener('click', () => {
  cv.toBlob(b => { if (!b) return; const a = el('a'); a.href = URL.createObjectURL(b); a.download = (curName || 'map').replace(/\.[^.]+$/, '') + '-map.png'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
});

/* pointer: drag to pan, wheel to zoom, hover tooltip, click to select */
let drag = null, moved = false, raf = 0, lastMove = null;
stage.addEventListener('pointerdown', e => { if (!feats) return; drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; moved = false; try { stage.setPointerCapture(e.pointerId); } catch (x) { /* synthetic event */ } stage.classList.add('grab'); });
stage.addEventListener('pointermove', e => {
  if (!feats) return;
  const r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true; view.ox = drag.ox + dx; view.oy = drag.oy + dy; $('tip').hidden = true; draw(); return; }
  lastMove = [px, py];
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; hoverAt(...lastMove); });
});
function hoverAt(px, py) {
  const wx = (px - view.ox) / view.s, wy = (py - view.oy) / view.s;
  const ll = meta.toLonLat(wx, wy);
  $('readout').textContent = ll ? 'Latitude, longitude: ' + fmtLL(ll[0], ll[1]) : 'x ' + wx.toFixed(2) + ', y ' + (-wy).toFixed(2);
  const i = feats.length <= 300000 ? hit(px, py) : -1;
  if (i !== hover) { hover = i; draw(); }
  const tip = $('tip');
  if (i < 0) { tip.hidden = true; stage.style.cursor = ''; return; }
  stage.style.cursor = 'pointer';
  const f = feats[i];
  tip.textContent = (f.name || 'Feature ' + (i + 1)) + '\n' + f.ty;
  tip.hidden = false;
  tip.style.left = Math.min(px + 14, W - tip.offsetWidth - 4) + 'px'; tip.style.top = Math.min(py + 14, H - tip.offsetHeight - 4) + 'px';
}
stage.addEventListener('pointerup', e => {
  stage.classList.remove('grab');
  if (drag && !moved) { const r = stage.getBoundingClientRect(); select(hit(e.clientX - r.left, e.clientY - r.top)); }
  drag = null;
});
stage.addEventListener('pointerleave', () => { $('tip').hidden = true; if (hover >= 0) { hover = -1; draw(); } });
const zoomAt = (px, py, k) => { const s = Math.max(1e-3, Math.min(view.s * k, meta.crs === 'plane' ? 1e9 : 4e9)); k = s / view.s; view.ox = px - (px - view.ox) * k; view.oy = py - (py - view.oy) * k; view.s = s; draw(); };
stage.addEventListener('wheel', e => { if (!feats) return; e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015))); }, { passive: false });
stage.addEventListener('dblclick', e => { const r = stage.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 2); });
stage.addEventListener('keydown', e => {
  if (!feats) return;
  const k = e.key, st = 60;
  if (k === 'ArrowLeft') view.ox += st; else if (k === 'ArrowRight') view.ox -= st; else if (k === 'ArrowUp') view.oy += st; else if (k === 'ArrowDown') view.oy -= st;
  else if (k === '+' || k === '=') return zoomAt(W / 2, H / 2, 1.5); else if (k === '-') return zoomAt(W / 2, H / 2, 1 / 1.5);
  else if (k === '0') fitTo(bbOf(feats)); else if (k === 'f' || k === 'F') { if (sel >= 0) return zoomTo([feats[sel]]); } else if (k === 'Escape') return select(-1);
  else return;
  e.preventDefault(); draw();
});
new ResizeObserver(() => { if (!feats) return; const cx = (W / 2 - view.ox) / view.s, cy = (H / 2 - view.oy) / view.s; resize(); view.ox = W / 2 - cx * view.s; view.oy = H / 2 - cy * view.s; draw(); drawProfile(); }).observe(stage);

/* ---------- open ---------- */
let curName = '';
async function open(file) {
  if (file.size > MAXMB * 1048576) { say(`This file is ${size(file.size)}. The page opens files up to ${MAXMB} MB; the VS Code extension opens up to 512 MB.`, true); return; }
  if (!file.size) { say('This file is empty.', true); return; }
  say('Reading ' + file.name + ' ...');
  const t0 = performance.now();
  try {
    const text = await file.text();
    const r = parseText(file.name, text);
    if (!r.feats.length) throw new Error('No features found in this ' + r.meta.format + ' file.');
    feats = r.feats; meta = r.meta; curName = file.name;
    prep(feats, meta);
    const PAL = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d'];
    if (meta.format === 'GPX') feats.filter(f => f.layer === 'Tracks' || f.layer === 'Routes').forEach((f, i) => { if (!f.style.stroke) f.style.stroke = PAL[i % PAL.length]; });
    order = feats.map((f, i) => i).sort((a, b) => feats[a].rank - feats[b].rank);
    sel = -1; hover = -1; hidden = new Set();
    $('drop').hidden = true; $('view').hidden = false;
    resize(); fitTo(bbOf(feats));
    showInfo(file); buildTable(); select(-1); drawProfile();
    const drawn = feats.filter(f => f.parts.length).length;
    say(`Opened in ${Math.round(performance.now() - t0)} ms. ${plural(drawn, 'feature')} on the map` + (drawn < feats.length ? `, ${int(feats.length - drawn)} without geometry` : '') + '.');
    self.zovoState = { format: meta.format, features: feats.length, drawn, verts: meta.verts, crs: meta.crs, skipped: meta.skipped, counts: meta.counts, gpx: meta.gpx ? { km: +(meta.gpx.dist / 1000).toFixed(3), up: Math.round(meta.gpx.up), dur: meta.gpx.dur / 1000, mov: meta.gpx.mov / 1000, per: meta.gpx.per.map(t => [t.name, Math.round(t.dist), t.dur / 1000, t.mov / 1000, +t.up.toFixed(1)]) } : null };
  } catch (e) {
    say(e.message || String(e), true);
  }
}
const pickHandler = e => { const f = e.target.files && e.target.files[0]; if (f) open(f); e.target.value = ''; };
$('pick').addEventListener('change', pickHandler);
$('pick2').addEventListener('change', pickHandler);
$('sample').addEventListener('click', () => open(new File([SAMPLE.data], SAMPLE.name, { type: SAMPLE.type })));
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
