/* PCAP Viewer Online (TOOLCHK, wave18; first draft by HTOOL1, replaced). No library, no request.
   The capture is read in this tab and handed to the PCAP Viewer extension's own engine (engine.js, built from its
   src/core): index, dissectors, Wireshark-style display filters, statistics and follow stream. .gz captures are
   unpacked with the browser's DecompressionStream (512 MB cap, gzip bomb stop). Names come only from the capture
   (DNS answers, name blocks); nothing is looked up on the network. Values are written as text, never as HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const P = self.ZovoPcap, ROWH = 24, CHUNK = 4 * 1048576;
  let E = null, total = 0, sel = 0, timeMode = 'relative', job = 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = n => Number(n).toLocaleString('en-US');

  /* ---------------- packet list (only the rows on screen are decoded) ---------------- */
  const list = $('plist'), body = $('pbody'), spacer = $('pspace');
  function drawRows() {
    if (!E) return;
    const top = list.scrollTop, h = list.clientHeight, first = Math.max(0, Math.floor(top / ROWH) - 5), count = Math.ceil(h / ROWH) + 10;
    const r = E.rows(first, count, { names: $('names').checked, time: timeMode });
    body.style.transform = `translateY(${first * ROWH}px)`;
    body.innerHTML = r.rows.map(x => `<div class="pr ${esc(x.cls)}${x.no === sel ? ' on' : ''}" data-no="${x.no}" role="row"><span>${x.no}</span><span>${esc(x.time)}</span><span title="${esc(x.srcAddr)}">${esc(x.src)}</span><span title="${esc(x.dstAddr)}">${esc(x.dst)}</span><span>${esc(x.proto)}</span><span>${x.len}</span><span title="${esc(x.info)}">${esc(x.info)}</span></div>`).join('');
  }
  function resetList() { total = E.viewCount(); spacer.style.height = Math.max(1, total * ROWH) + 'px'; list.scrollTop = 0; drawRows(); $('count').textContent = (E.view ? int(total) + ' of ' + int(E.idx.n) : int(total)) + ' packets'; }
  list.addEventListener('scroll', () => requestAnimationFrame(drawRows));

  /* ---------------- detail: protocol tree and linked hex ---------------- */
  let cur = null;
  function showPacket(no) {
    const p = E.packet(no);
    if (p.error) { self.zovoMsg(p.error, true); return; }
    sel = no; cur = p; drawRows();
    $('detail').hidden = false;
    const t = $('ptree'); t.textContent = '';
    const mk = (nodes, parent, depth) => {
      for (const n of nodes) {
        const d = document.createElement(n.c ? 'details' : 'div');
        const lab = document.createElement(n.c ? 'summary' : 'div');
        lab.textContent = n.n; lab.className = 'tn'; lab.dataset.s = n.s; lab.dataset.l = n.l;
        if (/^\[Malformed/.test(n.n)) lab.classList.add('warn');
        d.append(lab);
        if (n.c) { if (depth === 0 && nodes.indexOf(n) === nodes.length - 1) d.open = true; mk(n.c, d, depth + 1); }
        parent.append(d);
      }
    };
    mk(p.tree, t, 0);
    hex(p.bytes, -1, 0);
    $('pnames').textContent = p.names.map(x => x.addr + ' is ' + x.name + ' (' + x.from + ')').join('; ');
  }
  function hex(u8, s, l) {
    const lines = [], max = Math.min(u8.length, 65536);
    for (let r = 0; r < max; r += 16) {
      let h = '', a = '';
      for (let i = r; i < r + 16; i++) {
        if (i >= u8.length) { h += '   '; continue; }
        const on = i >= s && i < s + l, b = u8[i];
        h += (on ? '<mark data-o="' + i + '">' : '<i data-o="' + i + '">') + b.toString(16).padStart(2, '0') + (on ? '</mark> ' : '</i> ');
        const ch = b >= 32 && b < 127 ? esc(String.fromCharCode(b)) : '.';
        a += on ? '<mark>' + ch + '</mark>' : ch;
      }
      lines.push(r.toString(16).padStart(4, '0') + '  ' + h + ' ' + a);
    }
    $('phex').innerHTML = lines.join('\n') + (u8.length > max ? '\n...' : '');
    const m = $('phex').querySelector('mark'); if (m) m.scrollIntoView({ block: 'nearest' });
  }
  $('ptree').addEventListener('click', e => {
    const lab = e.target.closest('.tn'); if (!lab || !cur) return;
    $('ptree').querySelectorAll('.tn.on').forEach(x => x.classList.remove('on')); lab.classList.add('on');
    hex(cur.bytes, +lab.dataset.s, +lab.dataset.l);
  });
  $('phex').addEventListener('click', e => {  // click a byte to find its field: the deepest node that covers it
    const b = e.target.closest('[data-o]'); if (!b || !cur) return;
    const o = +b.dataset.o; let best = null, bl = Infinity;
    $('ptree').querySelectorAll('.tn').forEach(x => { const s = +x.dataset.s, l = +x.dataset.l; if (o >= s && o < s + l && l <= bl) { best = x; bl = l; } });
    if (best) { let p = best.parentElement; while (p && p.id !== 'ptree') { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; } best.click(); best.scrollIntoView({ block: 'nearest' }); }
  });
  body.addEventListener('click', e => { const r = e.target.closest('.pr'); if (r) showPacket(+r.dataset.no); });
  body.addEventListener('dblclick', e => { const r = e.target.closest('.pr'); if (r) follow(+r.dataset.no); });
  list.addEventListener('keydown', e => {
    if (!E || !sel || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const k = E.find(sel) + (e.key === 'ArrowDown' ? 1 : -1); if (k < 0 || k >= total) return;
    const no = E.view ? E.view[k] + 1 : k + 1; showPacket(no);
    if (k * ROWH < list.scrollTop || (k + 1) * ROWH > list.scrollTop + list.clientHeight) list.scrollTop = k * ROWH - list.clientHeight / 2;
  });

  /* ---------------- filter ---------------- */
  $('flt').addEventListener('input', () => { const v = $('flt').value.trim(), c = P.compile(v); $('flt').classList.toggle('ok', !!v && c.ok); $('flt').classList.toggle('bad', !!v && !c.ok); $('fltErr').textContent = v && !c.ok ? c.error : ''; });
  async function applyFilter() {
    if (!E) return;
    const v = $('flt').value.trim(), id = ++job;
    self.zovoMsg(v ? 'Filtering...' : '');
    const r = await E.filter(v, id);
    if (r.cancelled) return;
    if (!r.ok) { self.zovoMsg('The filter is not valid: ' + r.error, true); return; }
    sel = 0; $('detail').hidden = true; resetList();
    self.zovoMsg(v ? int(r.count) + ' of ' + int(r.total) + ' packets match ' + v + '.' : '');
  }
  $('fltForm').addEventListener('submit', e => { e.preventDefault(); applyFilter(); });
  $('fltClear').addEventListener('click', () => { $('flt').value = ''; $('flt').dispatchEvent(new Event('input')); applyFilter(); });
  $('time').addEventListener('change', () => { timeMode = $('time').value; drawRows(); });
  $('names').addEventListener('change', drawRows);
  const setFilter = f => { $('flt').value = f; $('flt').dispatchEvent(new Event('input')); applyFilter(); scrollTo({ top: $('view').offsetTop, behavior: 'smooth' }); };

  /* ---------------- follow stream ---------------- */
  async function follow(no) {
    if (!E) return;
    const r = await E.follow(no);
    const box = $('follow'); box.hidden = false;
    if (r.error) { $('fhead').textContent = r.error; $('fbody').textContent = ''; return; }
    $('fhead').textContent = `${r.proto.toUpperCase()} stream ${r.stream}: ${r.client} (red) to ${r.server} (blue), ${int(r.bytes[0])} and ${int(r.bytes[1])} bytes${r.truncated ? ', cut at 16 MB' : ''}.`;
    $('fbody').textContent = '';
    for (const s of r.segments) {
      const sp = document.createElement('span'); sp.className = 'd' + s.dir;
      let t = ''; for (const b of s.bytes.subarray(0, 262144)) t += b === 10 || b === 13 || b === 9 || (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
      sp.textContent = t; $('fbody').append(sp);
    }
    $('fFilter').onclick = () => setFilter(r.filter);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('followBtn').addEventListener('click', () => { if (sel) follow(sel); else self.zovoMsg('Select a TCP or UDP packet first.', true); });

  /* ---------------- statistics ---------------- */
  $('statsBtn').addEventListener('click', async () => {
    if (!E) return;
    self.zovoMsg('Reading every packet for the statistics...');
    const s = await E.stats(); self.zovoMsg('');
    const box = $('stats'); box.hidden = false;
    const tr = (cells, f) => `<tr${f ? ` data-f="${esc(f)}"` : ''}>${cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
    $('shier').innerHTML = '<thead><tr><th>Protocols</th><th>Packets</th><th>Bytes</th></tr></thead><tbody>' + s.hierarchy.sort((a, b) => b.packets - a.packets).map(h => tr([h.path || '(link layer only)', int(h.packets), int(h.bytes)], h.path ? h.path.split('/').pop() : '')).join('') + '</tbody>';
    $('sconv').innerHTML = '<thead><tr><th>Kind</th><th>A</th><th>B</th><th>Packets</th><th>Bytes</th><th>A to B</th><th>B to A</th><th>Duration</th></tr></thead><tbody>' + s.conversations.slice(0, 300).map(c => {
      const f = c.stream !== undefined ? `${c.kind.toLowerCase()}.stream == ${c.stream}` : c.kind === 'IPv4' ? `ip.addr == ${c.a} && ip.addr == ${c.b}` : c.kind === 'IPv6' ? `ipv6.addr == ${c.a} && ipv6.addr == ${c.b}` : '';
      return tr([c.kind, c.a, c.b, int(c.packets), int(c.bytes), int(c.abb), int(c.bab), (c.end - c.start).toFixed(3) + ' s'], f);
    }).join('') + '</tbody>';
    $('seps').innerHTML = '<thead><tr><th>Kind</th><th>Address</th><th>Name in the capture</th><th>Packets</th><th>Bytes</th></tr></thead><tbody>' + s.endpoints.slice(0, 300).map(e => tr([e.kind, e.addr, e.name, int(e.packets), int(e.bytes)], e.kind === 'IPv4' ? 'ip.addr == ' + e.addr : e.kind === 'IPv6' ? 'ipv6.addr == ' + e.addr : '')).join('') + '</tbody>';
    $('scap').textContent = `${int(s.convCount)} conversations and ${int(s.epCount)} endpoints, the 300 with the most bytes are listed. Click a row to filter on it.`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('stats').addEventListener('click', e => { const r = e.target.closest('tr[data-f]'); if (r && r.dataset.f) setFilter(r.dataset.f); });

  /* ---------------- open ---------------- */
  self.zovoOpen = async file => {
    if (file.size > 2 * 1073741824) throw new Error('it is ' + self.zovoSize(file.size) + '. This page reads captures up to 2 GB into the tab. The VS Code extension reads bigger ones in pieces.');
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer()), gz = head[0] === 0x1f && head[1] === 0x8b;
    let src = file;
    if (!gz) {
      const ab = await file.arrayBuffer(), chunks = [];
      for (let o = 0; o < ab.byteLength; o += CHUNK) chunks.push(new P.Buffer(ab, o, Math.min(CHUNK, ab.byteLength - o)));
      src = new P.ChunkSource(chunks);
    }
    const e = new P.Engine(m => { if (m.type === 'progress') self.zovoMsg((m.phase === 'unzip' ? 'Unpacking ' : 'Reading ') + Math.round(100 * (m.done || 0) / Math.max(1, m.total || 1)) + ' %...'); });
    const info = await e.open(src, { gz, maxGzipMB: 512, name: file.name });
    if (info.error && !info.count) throw new Error(info.error.replace(/\.$/, '') + '.');
    E = e; sel = 0;
    $('detail').hidden = true; $('follow').hidden = true; $('stats').hidden = true; $('flt').value = ''; $('flt').className = ''; $('fltErr').textContent = '';
    const ifs = info.interfaces.map(i => i.linkName + (i.name ? ' (' + i.name + ')' : '')).join(', ');
    $('fmeta').textContent = self.zovoSize(file.size) + (info.compressed ? ', ' + self.zovoSize(info.size) + ' unpacked' : '');
    $('cinfo').innerHTML = [['Format', info.format + (gz ? ', gzip' : '')], ['Packets', int(info.count)], ['Link', ifs], ['First packet (UTC)', info.firstTime], ['Duration', info.duration ? info.duration.toFixed(3) + ' s' : ''], ['Names from the capture', info.names ? int(info.names) : ''],
      ['Section', info.section ? [info.section.hardware, info.section.os, info.section.application, info.section.comment].filter(Boolean).join(', ') : '']].filter(r => r[1]).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    $('cwarn').textContent = [info.error].concat(info.warnings || []).filter(Boolean).join(' ');
    resetList();
    return 'Opened ' + file.name + ': ' + int(info.count) + ' packets in ' + info.ms + ' ms.' + (info.error ? ' ' + info.error : '');
  };
})();
