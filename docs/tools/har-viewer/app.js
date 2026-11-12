/* HAR Viewer Online (TOOLCHK, wave18; first draft by HTOOL4). Plain JavaScript, no library, no request.
   The .har file is read with the File API in this tab. Every value from the file is written as text (textContent or
   escaped), never as HTML. Waterfall widths are set through element.style, which the page CSP allows. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = { rows: [], shown: [], sel: -1, tab: 'headers', sort: 'i', dir: 1, total: 1 };
  const PHASES = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const bytes = n => n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const ms = n => n == null ? '' : n < 1000 ? Math.round(n) + ' ms' : (n / 1000).toFixed(2) + ' s';
  const arr = v => Array.isArray(v) ? v : [];

  const TYPES = { document: 'document', xhr: 'xhr', fetch: 'xhr', script: 'script', stylesheet: 'stylesheet', image: 'image', font: 'font', media: 'media', websocket: 'websocket' };
  function typeOf(en, url, mime) {
    const t = TYPES[String(en._resourceType || '').toLowerCase()];
    if (t) return t;
    if (/^wss?:/i.test(url)) return 'websocket';
    if (/^text\/html/i.test(mime)) return 'document';
    if (/json|xml/i.test(mime)) return 'xhr';
    if (/javascript|ecmascript/i.test(mime)) return 'script';
    if (/css/i.test(mime)) return 'stylesheet';
    if (/^image\//i.test(mime)) return 'image';
    if (/font|woff/i.test(mime)) return 'font';
    if (/^(audio|video)\//i.test(mime)) return 'media';
    return 'other';
  }

  const SECRET_H = /^(authorization|proxy-authorization|x-api-key|api-key|apikey|x-auth-token|x-csrf-token|x-xsrf-token|csrf-token|x-amz-security-token)$/i;
  const SECRET_Q = /token|secret|password|passwd|api_?key|session|sig(nature)?$/i;
  const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/;

  function parse(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('this is not valid JSON (' + e.message + ').'); }
    const log = data && data.log;
    if (!log || !Array.isArray(log.entries)) throw new Error('it has no log.entries list. A HAR file comes from "Save all as HAR" in the Network tab of DevTools.');
    let t0 = Infinity;
    const sec = { auth: 0, cookies: 0, tokens: 0 };
    const rows = log.entries.map((en, i) => {
      en = en && typeof en === 'object' ? en : {};
      const req = en.request && typeof en.request === 'object' ? en.request : {}, res = en.response && typeof en.response === 'object' ? en.response : {};
      const content = res.content && typeof res.content === 'object' ? res.content : {};
      const url = String(req.url || ''), mime = String(content.mimeType || '');
      const status = num(+res.status) || 0;
      let size = num(res._transferSize);
      if (size == null || size < 0) size = num(res.bodySize) != null && res.bodySize >= 0 ? res.bodySize : num(content.size) != null && content.size >= 0 ? content.size : null;
      const tm = en.timings && typeof en.timings === 'object' ? en.timings : {};
      let time = num(en.time);
      if (time == null) time = PHASES.reduce((a, k) => a + (num(tm[k]) > 0 ? tm[k] : 0), 0) - (num(tm.ssl) > 0 ? tm.ssl : 0); // ssl is inside connect
      const started = en.startedDateTime ? Date.parse(en.startedDateTime) : NaN;
      if (isFinite(started) && started < t0) t0 = started;
      for (const h of arr(req.headers)) {
        const n = String(h && h.name || '');
        if (SECRET_H.test(n)) sec.auth++;
        else if (/^cookie$/i.test(n)) sec.cookies++;
      }
      for (const h of arr(res.headers)) if (/^set-cookie$/i.test(String(h && h.name || ''))) sec.cookies++;
      for (const p of arr(req.queryString)) if (SECRET_Q.test(String(p && p.name || '')) && String(p && p.value || '').length >= 8) sec.tokens++;
      if (JWT.test(url) || (req.postData && JWT.test(String(req.postData.text || '')))) sec.tokens++;
      let host = '';
      try { host = new URL(url).host; } catch (e) { /* relative or odd URL */ }
      return { i, url, host, method: String(req.method || ''), status, statusText: String(res.statusText || ''), httpVersion: String(res.httpVersion || req.httpVersion || ''),
        type: typeOf(en, url, mime), mime, size, time: Math.max(0, time || 0), started, tm, req, res, content, ip: String(en.serverIPAddress || '') };
    });
    let end = 1;
    for (const r of rows) { r.offset = isFinite(r.started) && isFinite(t0) ? r.started - t0 : 0; end = Math.max(end, r.offset + r.time); }
    S.total = end;
    return { rows, sec, creator: log.creator || {}, pages: arr(log.pages).length };
  }

  const failed = r => r.status >= 400 || r.status === 0;
  function filter() {
    const words = $('q').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const plus = words.filter(w => w[0] !== '-'), minus = words.filter(w => w[0] === '-' && w.length > 1).map(w => w.slice(1));
    const ty = $('fType').value, st = $('fStatus').value;
    S.shown = S.rows.filter(r => {
      if (ty && r.type !== ty) return false;
      if (st === 'ok' && !(r.status >= 200 && r.status < 300)) return false;
      if (st === 'redirect' && !(r.status >= 300 && r.status < 400)) return false;
      if (st === 'failed' && !failed(r)) return false;
      if (st === 'slow' && !(r.time > 1000)) return false;
      const hay = (r.method + ' ' + r.url + ' ' + r.status + ' ' + r.type).toLowerCase();
      return plus.every(w => hay.includes(w)) && !minus.some(w => hay.includes(w));
    });
    const k = S.sort, d = S.dir;
    S.shown.sort((a, b) => { const x = a[k], y = b[k]; return (x == null ? -1 : y == null ? 1 : x < y ? -1 : x > y ? 1 : 0) * d || a.i - b.i; });
    table();
  }

  const MAXROWS = 5000;
  function table() {
    const tb = $('reqs').tBodies[0], part = S.shown.slice(0, MAXROWS);
    tb.innerHTML = part.map(r => `<tr data-i="${r.i}"${r.i === S.sel ? ' class="on"' : ''}><td class="ix">${r.i + 1}</td><td class="${failed(r) ? 'bad' : ''}">${r.status || 'none'}</td><td>${esc(r.method)}</td>` +
      `<td class="u" title="${esc(r.url)}">${esc(r.url)}</td><td>${esc(r.type)}</td><td>${esc(bytes(r.size))}</td><td>${esc(ms(r.time))}</td><td><div class="wf"><span></span></div></td></tr>`).join('');
    const bars = tb.querySelectorAll('.wf span');
    part.forEach((r, n) => {
      const sp = bars[n];
      sp.style.left = (r.offset / S.total * 100).toFixed(2) + '%';
      sp.style.width = (r.time / S.total * 100).toFixed(2) + '%';
      sp.title = 'Starts at ' + ms(r.offset) + ', takes ' + ms(r.time);
      const parts = PHASES.map(k => [k, num(r.tm[k]) > 0 ? r.tm[k] : 0]).filter(p => p[1] > 0);
      const sum = parts.reduce((a, p) => a + p[1], 0);
      if (!sum) { const i = document.createElement('i'); i.className = 's-other'; i.style.width = '100%'; sp.append(i); return; }
      for (const [k, v] of parts) { const i = document.createElement('i'); i.className = 's-' + k; i.style.width = (v / sum * 100).toFixed(2) + '%'; sp.append(i); }
    });
    const nf = S.shown.filter(failed).length, ns = S.shown.filter(r => r.time > 1000).length;
    $('summary').textContent = `${S.shown.length} of ${S.rows.length} requests, ${nf} failed, ${ns} slow (over 1 s)` + (S.shown.length > MAXROWS ? `, first ${MAXROWS} rows shown` : '');
  }

  const kv = pairs => '<table class="kv">' + pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('') + '</table>';
  const hdrs = hs => arr(hs).length ? kv(arr(hs).map(h => [h && h.name, h && h.value])) : '<p class="mut small">None.</p>';
  const pretty = t => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch (e) { return t; } };
  let blobUrl = null;
  function detail() {
    const r = S.rows[S.sel];
    if (!r) return;
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    const body = $('dBody');
    let h = '';
    if (S.tab === 'headers') {
      const q = arr(r.req.queryString);
      h = '<h4>General</h4>' + kv([['URL', r.url], ['Method', r.method], ['Status', (r.status || 'no response') + ' ' + r.statusText], ['HTTP version', r.httpVersion], ['Server IP', r.ip]].filter(p => p[1] !== '')) +
        (q.length ? '<h4>Query string</h4>' + kv(q.map(p => [p && p.name, p && p.value])) : '') +
        '<h4>Request headers</h4>' + hdrs(r.req.headers) + '<h4>Response headers</h4>' + hdrs(r.res.headers);
    } else if (S.tab === 'payload') {
      const pd = r.req.postData && typeof r.req.postData === 'object' ? r.req.postData : null;
      if (!pd) h = '<p class="mut">This request has no body.</p>';
      else {
        h = kv([['Type', pd.mimeType || '']]);
        if (arr(pd.params).length) h += '<h4>Form fields</h4>' + kv(arr(pd.params).map(p => [p && p.name, p && (p.fileName ? p.fileName + ' (file)' : p.value)]));
        if (pd.text != null) {
          let t = String(pd.text);
          if (/json/i.test(pd.mimeType || '')) t = pretty(t);
          else if (/x-www-form-urlencoded/i.test(pd.mimeType || '') && !arr(pd.params).length) {
            try { h += '<h4>Form fields</h4>' + kv([...new URLSearchParams(t)]); } catch (e) { /* show as text */ }
          }
          h += `<pre>${esc(t.slice(0, 200000))}</pre>` + (t.length > 200000 ? '<p class="mut small">First 200,000 characters shown.</p>' : '');
        }
      }
    } else if (S.tab === 'response') {
      const c = r.content, txt = c.text == null ? null : String(c.text), b64 = /base64/i.test(String(c.encoding || ''));
      h = kv([['Type', r.mime], ['Size', bytes(num(c.size))], ['Encoding', String(c.encoding || '')]].filter(p => p[1] !== ''));
      if (txt == null || txt === '') h += '<p class="mut">The file has no body for this response. DevTools leaves out bodies of some requests, and "Save all as HAR (sanitized)" leaves out more.</p>';
      else if (b64 && /^image\/(png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/i.test(r.mime)) {
        try {
          const bin = atob(txt.replace(/\s+/g, '')), u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          blobUrl = URL.createObjectURL(new Blob([u8], { type: r.mime }));
          h += '<p><img id="dImg" alt="The image from this response"></p>';
        } catch (e) { h += '<p class="mut">The image data is not valid base64.</p>'; }
      } else {
        let t = txt;
        if (b64) { try { t = new TextDecoder().decode(Uint8Array.from(atob(txt.replace(/\s+/g, '')), ch => ch.charCodeAt(0))); } catch (e) { /* keep as stored */ } }
        if (/json/i.test(r.mime)) t = pretty(t);
        h += `<pre>${esc(t.slice(0, 200000))}</pre>` + (t.length > 200000 ? '<p class="mut small">First 200,000 characters shown.</p>' : '');
      }
    } else if (S.tab === 'cookies') {
      const rc = arr(r.req.cookies), sc = arr(r.res.cookies);
      h = `<h4>Sent (${rc.length})</h4>` + (rc.length ? kv(rc.map(c => [c && c.name, c && c.value])) : '<p class="mut small">None.</p>') +
        `<h4>Received (${sc.length})</h4>` + (sc.length ? '<table class="dtab"><thead><tr><th>Name</th><th>Value</th><th>Path</th><th>Expires</th><th>Flags</th></tr></thead><tbody>' +
          sc.map(c => `<tr><td>${esc(c && c.name)}</td><td>${esc(c && c.value)}</td><td>${esc(c && c.path)}</td><td>${esc(c && c.expires)}</td><td>${esc([c && c.httpOnly ? 'HttpOnly' : '', c && c.secure ? 'Secure' : '', c && c.sameSite ? 'SameSite=' + c.sameSite : ''].filter(Boolean).join(' '))}</td></tr>`).join('') + '</tbody></table>' : '<p class="mut small">None.</p>');
    } else {
      const names = { blocked: 'Blocked (queued)', dns: 'DNS lookup', connect: 'Initial connection', ssl: 'TLS handshake (part of the connection)', send: 'Request sent', wait: 'Waiting for the server (TTFB)', receive: 'Content download' };
      h = kv(PHASES.filter(k => num(r.tm[k]) != null).map(k => [names[k], r.tm[k] < 0 ? 'not used' : ms(r.tm[k])]).concat([['Total', ms(r.time)], ['Started', isFinite(r.started) ? ms(r.offset) + ' after the first request' : 'no start time in the file']]));
    }
    body.innerHTML = h;
    if (blobUrl && $('dImg')) $('dImg').src = blobUrl;
    document.querySelectorAll('.hrv .tabb').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === S.tab)));
  }

  function select(i) {
    S.sel = i;
    const r = S.rows[i];
    document.querySelectorAll('#reqs tr.on').forEach(x => x.classList.remove('on'));
    const tr = document.querySelector(`#reqs tr[data-i="${i}"]`);
    if (tr) { tr.classList.add('on'); tr.scrollIntoView({ block: 'nearest' }); }
    $('detail').hidden = false;
    $('dTitle').textContent = r.method + ' ' + r.url;
    detail();
  }

  const sq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
  function curl(r) {
    const p = ['curl ' + sq(r.url)];
    if (r.method && r.method !== 'GET' && !(r.method === 'POST' && r.req.postData)) p.push('-X ' + r.method);
    for (const h of arr(r.req.headers)) {
      const n = String(h && h.name || '');
      if (!n || n[0] === ':' || /^content-length$/i.test(n)) continue;  // HTTP/2 pseudo headers are not real headers
      p.push('-H ' + sq(n + ': ' + (h.value == null ? '' : h.value)));
    }
    if (r.req.postData && r.req.postData.text != null) p.push('--data-raw ' + sq(r.req.postData.text));
    return p.join(' \\\n  ');
  }
  async function copy(text, ok) {
    try { await navigator.clipboard.writeText(text); self.zovoMsg(ok); }
    catch (e) { self.zovoMsg('The browser did not allow the copy. Select the text in the details and copy it by hand.', true); }
  }

  self.zovoOpen = async file => {
    const text = await file.text();
    const p = parse(text);
    S.rows = p.rows; S.sel = -1; S.sort = 'i'; S.dir = 1;
    $('detail').hidden = true;
    $('q').value = ''; $('fType').value = ''; $('fStatus').value = '';
    $('fmeta').textContent = self.zovoSize(file.size) + ', ' + p.rows.length + ' requests' + (p.creator.name ? ', saved by ' + p.creator.name + (p.creator.version ? ' ' + p.creator.version : '') : '');
    const s = p.sec, bits = [];
    if (s.auth) bits.push(s.auth + ' Authorization or API key header' + (s.auth > 1 ? 's' : ''));
    if (s.cookies) bits.push(s.cookies + ' cookie header' + (s.cookies > 1 ? 's' : ''));
    if (s.tokens) bits.push(s.tokens + ' token' + (s.tokens > 1 ? 's' : '') + ' in URLs or bodies');
    $('secretBanner').hidden = !bits.length;
    $('secretBanner').textContent = bits.length ? 'This capture holds ' + bits.join(', ') + '. Remove them before you share the file or a copied request.' : '';
    filter();
    if (!p.rows.length) return 'Opened ' + file.name + '. The capture has no requests.';
  };

  ['q', 'fType', 'fStatus'].forEach(id => $(id).addEventListener('input', filter));
  $('reqs').tHead.addEventListener('click', e => {
    const th = e.target.closest('th[data-k]');
    if (!th) return;
    const k = th.dataset.k;
    S.dir = S.sort === k ? -S.dir : (k === 'time' || k === 'size' ? -1 : 1); S.sort = k;
    filter();
  });
  $('reqs').tBodies[0].addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) select(+tr.dataset.i); });
  addEventListener('keydown', e => {
    if (S.sel < 0 || $('detail').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    const pos = S.shown.findIndex(r => r.i === S.sel);
    if (e.key === 'ArrowDown' && pos < S.shown.length - 1) { e.preventDefault(); select(S.shown[pos + 1].i); }
    else if (e.key === 'ArrowUp' && pos > 0) { e.preventDefault(); select(S.shown[pos - 1].i); }
    else if (e.key === 'Escape') { $('detail').hidden = true; }
  });
  document.querySelectorAll('.hrv .tabb').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.t; detail(); }));
  $('copyUrl').addEventListener('click', () => { const r = S.rows[S.sel]; if (r) copy(r.url, 'URL copied.'); });
  $('copyCurl').addEventListener('click', () => { const r = S.rows[S.sel]; if (r) copy(curl(r), 'Copied as cURL.'); });
})();
