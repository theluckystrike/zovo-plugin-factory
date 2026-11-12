/* XMind Viewer Online (TOOLCHK, wave18; first draft by HTOOL2, replaced). No request: the map is read in this tab by the
   XMind Viewer extension's own reader (mapcore.js) with fflate 0.8.2 (pinned, SRI) for the ZIP entries. XMind 2020+
   (content.json), XMind 8 (content.xml), FreeMind and Freeplane (.mm) and OPML. Every sheet is shown as an outline
   and as a map; pictures inside the file are shown from blob: URLs. Titles and notes are text, never HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const X = self.ZovoMap, NS = 'http://www.w3.org/2000/svg';
  let map = null, sheet = 0, urls = [], mode = 'map', V = { x: 0, y: 0, k: 1 };
  const int = n => Number(n).toLocaleString('en-US');
  const MARK = { 'priority': 'Priority', 'task': 'Task', 'flag': 'Flag', 'star': 'Star', 'smiley': 'Smiley', 'arrow': 'Arrow', 'people': 'People', 'symbol': 'Symbol', 'month': 'Month', 'week': 'Week' };
  const markName = m => { const [a, b] = String(m).split('-'); return (MARK[a] || a) + (b ? ' ' + b : ''); };

  /* ---------------- outline ---------------- */
  function outline(t, depth) {
    const li = document.createElement('li');
    const head = document.createElement('div'); head.className = 'ot' + (depth === 0 ? ' root' : '');
    head.append(t.title || '(no title)');
    for (const m of t.markers) { const s = document.createElement('span'); s.className = 'mk'; s.textContent = markName(m); head.append(s); }
    for (const l of t.labels) { const s = document.createElement('span'); s.className = 'lb'; s.textContent = l; head.append(s); }
    if (t.href) { const s = document.createElement('span'); s.className = 'lk'; s.textContent = 'link: ' + t.href; head.append(s); }
    li.append(head);
    if (t.equation) { const d = document.createElement('div'); d.className = 'eq mono small'; d.textContent = 'Equation: ' + t.equation; li.append(d); }
    if (t.note) { const d = document.createElement('div'); d.className = 'onote small'; d.textContent = t.note; li.append(d); }
    if (t.image && t.image.src) { const im = document.createElement('img'); im.alt = 'Picture of ' + (t.title || 'this topic'); im.className = 'pic'; li.append(im); map.image(t.image.src).then(r => { const u = URL.createObjectURL(new Blob([r.data], { type: r.mime })); urls.push(u); im.src = u; }).catch(() => im.remove()); }
    const kids = t.children.concat(t.summaries.filter(s => s.topic).map(s => Object.assign({}, s.topic, { title: 'Summary: ' + (s.topic.title || '') })));
    if (kids.length) { const ul = document.createElement('ul'); for (const k of kids) ul.append(outline(k, depth + 1)); li.append(ul); }
    return li;
  }

  /* ---------------- map: a logic chart to the right, drawn as SVG ---------------- */
  function layout(t, depth, y0, out, parent) {
    const w = Math.min(260, 24 + [...(t.title || ' ')].length * 7.4), node = { t, depth, w, h: 30, kids: [] };
    let y = y0;
    const kids = t.folded ? [] : t.children;
    for (const k of kids) { const c = layout(k, depth + 1, y, out, node); node.kids.push(c); y = c.bottom + 10; }
    node.bottom = Math.max(y0 + node.h, kids.length ? y - 10 : 0);
    node.y = kids.length ? (node.kids[0].y + node.kids[node.kids.length - 1].y) / 2 : y0;
    out.push(node); node.parent = parent; return node;
  }
  function drawMap() {
    const s = map.model.sheets[sheet], svg = $('msvg'); svg.textContent = '';
    const nodes = [], root = layout(s.root, 0, 0, nodes, null);
    const colX = []; for (const n of nodes) colX[n.depth] = Math.max(colX[n.depth] || 0, n.w);
    const xs = [0]; for (let d = 1; d < colX.length; d++) xs[d] = xs[d - 1] + colX[d - 1] + 46;
    const g = document.createElementNS(NS, 'g'); g.id = 'mg'; svg.append(g);
    const byId = new Map();
    for (const n of nodes) { n.x = xs[n.depth]; byId.set(n.t.id, n); }
    for (const n of nodes) {
      if (n.parent) { const p = n.parent, path = document.createElementNS(NS, 'path'); const x1 = p.x + p.w, y1 = p.y + 15, x2 = n.x, y2 = n.y + 15; path.setAttribute('d', `M${x1},${y1} C${x1 + 24},${y1} ${x2 - 24},${y2} ${x2},${y2}`); path.setAttribute('class', 'edge'); g.append(path); }
    }
    for (const r of s.relationships) { const a = byId.get(r.from), b = byId.get(r.to); if (!a || !b) continue; const p = document.createElementNS(NS, 'path'); p.setAttribute('d', `M${a.x + a.w / 2},${a.y} C${a.x + a.w / 2},${a.y - 60} ${b.x + b.w / 2},${b.y - 60} ${b.x + b.w / 2},${b.y}`); p.setAttribute('class', 'rel'); g.append(p); if (r.title) { const tx = document.createElementNS(NS, 'text'); tx.textContent = r.title; tx.setAttribute('x', (a.x + b.x) / 2 + a.w / 2); tx.setAttribute('y', Math.min(a.y, b.y) - 46); tx.setAttribute('class', 'rlab'); g.append(tx); } }
    for (const n of nodes) {
      const rect = document.createElementNS(NS, 'rect'); rect.setAttribute('x', n.x); rect.setAttribute('y', n.y); rect.setAttribute('width', n.w); rect.setAttribute('height', n.h); rect.setAttribute('rx', n.depth ? 6 : 10);
      rect.setAttribute('class', 'node d' + Math.min(n.depth, 3)); if (n.t.fill && /^#[0-9a-f]{3,8}$/i.test(n.t.fill)) rect.style.fill = n.t.fill; g.append(rect);
      const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', n.x + 10); tx.setAttribute('y', n.y + 19); tx.setAttribute('class', 'nt' + (n.depth ? '' : ' r'));
      let title = (n.t.title || '(no title)') + (n.t.folded && n.t.children.length ? '  (+' + n.t.children.length + ')' : '') + (n.t.note ? '  [note]' : '') + (n.t.markers.length ? '  [' + n.t.markers.map(markName).join(', ') + ']' : '');
      if (title.length > 34) title = title.slice(0, 33) + '...';
      tx.textContent = title; g.append(tx);
      const tip = document.createElementNS(NS, 'title'); tip.textContent = [n.t.title, n.t.note, n.t.labels.join(', '), n.t.href].filter(Boolean).join('\n'); rect.append(tip);
    }
    const bb = { w: xs[xs.length - 1] + colX[colX.length - 1] + 40, h: root.bottom + 40 };
    const W = $('mbox').clientWidth, H = $('mbox').clientHeight;
    const fitAll = Math.min(W / bb.w, H / bb.h);  // readable first: shrink to fit the box, but not below 0.8 (or the width)
    V.k = Math.min(1.4, Math.max(fitAll, Math.min(0.8, W / bb.w))); V.x = 20; V.y = bb.h * V.k <= H ? (H - bb.h * V.k) / 2 : 20 - Math.max(0, root.y * V.k - H / 2 + 20);
    apply();
  }
  const apply = () => { const g = $('mg'); if (g) g.setAttribute('transform', `translate(${V.x},${V.y}) scale(${V.k})`); };

  function showSheet(i) {
    sheet = i;
    const s = map.model.sheets[i];
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
    const c = s.counts || {};
    $('sinfo').textContent = [int(c.topics || 0) + ' topics', c.notes ? c.notes + ' notes' : '', c.markers ? c.markers + ' markers' : '', c.labels ? c.labels + ' labels' : '', c.relationships ? c.relationships + ' relationships' : '', c.boundaries ? c.boundaries + ' boundaries' : '', c.summaries ? c.summaries + ' summaries' : '', c.images ? c.images + ' pictures' : '', s.detached && s.detached.length ? s.detached.length + ' floating topics' : '', s.layoutNote].filter(Boolean).join(', ') + '.';
    const ol = $('outline'); ol.textContent = '';
    ol.append(outline(s.root, 0)); for (const d of s.detached || []) ol.append(outline(Object.assign({}, d, { title: 'Floating: ' + (d.title || '') }), 1));
    $('snotes').textContent = (s.notes || []).concat(map.model.notes || []).join(' ');
    drawMap();
  }
  function setMode(m) { mode = m; $('mbox').hidden = m !== 'map'; $('outline').hidden = m !== 'outline'; document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m))); if (m === 'map') drawMap(); }

  self.zovoOpen = async file => {
    if (!X.kindOf(file.name)) throw new Error('it is not an .xmind, .mm or .opml file.');
    for (const u of urls) URL.revokeObjectURL(u); urls = [];
    try { map = await X.openMap(X.blobReader(file), file.name); } catch (e) { throw new Error(String(e.message || e).replace(/^This file/, 'the file').replace(/\.$/, '') + '.'); }
    const sh = map.model.sheets;
    if (!sh || !sh.length) throw new Error('the file has no sheets.');
    $('fmeta').textContent = self.zovoSize(file.size) + ', ' + ({ 'xmind-json': 'XMind 2020 or later', 'xmind-xml': 'XMind 8 or older', freemind: 'FreeMind or Freeplane', opml: 'OPML' }[map.model.format] || map.model.format) + ', ' + sh.length + ' sheet' + (sh.length > 1 ? 's' : '');
    $('tabs').innerHTML = '';
    sh.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.i = i; b.textContent = s.title || 'Sheet ' + (i + 1); $('tabs').append(b); });
    setMode(mode); showSheet(0);
    return 'Opened ' + file.name + ': ' + sh.length + ' sheet' + (sh.length > 1 ? 's' : '') + ', ' + int(sh.reduce((a, s) => a + ((s.counts || {}).topics || 0), 0)) + ' topics.';
  };
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) showSheet(+b.dataset.i); });
  $('modes').addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (b) setMode(b.dataset.m); });
  $('fitBtn').addEventListener('click', () => map && drawMap());
  const box = $('mbox');
  box.addEventListener('wheel', e => { if (!map) return; e.preventDefault(); const r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, f = Math.exp(-e.deltaY * .0015); V.x = x - (x - V.x) * f; V.y = y - (y - V.y) * f; V.k *= f; apply(); }, { passive: false });
  let drag = null;
  box.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y }; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', e => { if (drag) { V.x = drag.vx + e.clientX - drag.x; V.y = drag.vy + e.clientY - drag.y; apply(); } });
  box.addEventListener('pointerup', () => { drag = null; });
  $('copyMd').addEventListener('click', async () => {
    if (!map) return;
    const lines = [], walk = (t, d) => { lines.push('  '.repeat(Math.max(0, d - 1)) + (d ? '- ' : '# ') + (t.title || '') + (t.labels.length ? ' (' + t.labels.join(', ') + ')' : '')); if (t.note) lines.push('  '.repeat(d) + '  ' + t.note.replace(/\n/g, ' ')); for (const k of t.children) walk(k, d + 1); };
    walk(map.model.sheets[sheet].root, 0);
    try { await navigator.clipboard.writeText(lines.join('\n')); self.zovoMsg('The sheet was copied as a Markdown outline.'); } catch (e) { self.zovoMsg('The browser did not allow the copy.', true); }
  });
})();
