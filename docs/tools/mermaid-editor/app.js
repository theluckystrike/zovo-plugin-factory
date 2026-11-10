/* WEB4 (10 Nov 2026) page script for the two editor tools, Mermaid Editor Online and Graphviz Online. The code is
   typed here and sent as text to the preview frame (viewer.html, same origin), where the extension's own preview
   draws it. Nothing is uploaded: the page CSP sets connect-src 'none'. The code is kept in this browser
   (localStorage), and Copy link puts it, compressed, after the # of the address, a part browsers never send to a
   server. The tool is named by data-kind on #ed: mermaid or dot. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const KIND = $('ed').dataset.kind;
  const CFG = {
    mermaid: { ext: 'mmd', mime: 'text/plain', key: 'zovo-mermaid-code', noun: 'diagram', md: /\.(md|markdown)$/i, maxKB: 2048 },
    dot: { ext: 'dot', mime: 'text/vnd.graphviz', key: 'zovo-graphviz-code', noun: 'graph', md: /\.(md|markdown)$/i, maxKB: 4096 },
  }[KIND];
  const code = $('code');
  let frame = null, frameReady = false, name = 'diagram.' + CFG.ext, markdown = false, timer = 0, errLine = 0;

  const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
  if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
  $('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
    if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'zovo-theme', theme: root.dataset.theme }, location.origin);
  });

  const say = (t, bad, line) => {
    const m = $('msg');
    m.textContent = t; m.className = bad ? 'warn' : 'mut';
    errLine = line || 0;
    if (errLine) { const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = 'Go to line ' + errLine; b.addEventListener('click', () => goLine(errLine - 1)); m.append(' ', b); }
  };

  function goLine(line) {
    const lines = code.value.split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(line, lines.length); i++) pos += lines[i].length + 1;
    code.focus();
    code.setSelectionRange(pos, pos + (lines[line] || '').length);
    const lh = parseFloat(getComputedStyle(code).lineHeight) || 18;
    code.scrollTop = Math.max(0, line * lh - code.clientHeight / 3);
  }

  function send() {
    if (!frame || !frameReady) return;
    frame.contentWindow.postMessage({ type: 'zovo-text', text: code.value, markdown, name }, location.origin);
  }
  function changed(now) {
    clearTimeout(timer);
    try { localStorage.setItem(CFG.key, JSON.stringify({ text: code.value.length < 1e6 ? code.value : '', name, markdown })); } catch (e) { /* full or private */ }
    timer = setTimeout(send, now ? 0 : 250);
  }

  function makeFrame() {
    if (frame) frame.remove();
    frameReady = false;
    frame = document.createElement('iframe');
    frame.id = 'frame';
    frame.title = KIND === 'mermaid' ? 'Mermaid preview' : 'Graphviz preview';
    frame.src = 'viewer.html#' + (root.dataset.theme || '');
    $('frameBox').append(frame);
  }

  addEventListener('message', ev => {
    if (ev.origin !== location.origin || !frame || ev.source !== frame.contentWindow || !ev.data || typeof ev.data !== 'object') return;
    const d = ev.data;
    if (d.type === 'zovo-frame-ready') { frameReady = true; send(); }
    else if (d.type === 'zovo-status') {
      if (d.ok) say(String(d.text || 'Drawn on this computer: nothing was uploaded.').slice(0, 300));
      else say(String(d.message || `This ${CFG.noun} could not be drawn.`).slice(0, 400), true, Number.isInteger(d.line) && d.line > 0 ? d.line : 0);
    } else if (d.type === 'zovo-note') say(String(d.text || '').slice(0, 300));
    else if (d.type === 'zovo-line' && Number.isInteger(d.line)) goLine(d.line);
    else if (d.type === 'zovo-drop' && Array.isArray(d.files)) openFile(d.files.filter(x => x instanceof File)[0]);
    else if (d.type === 'zovo-pro') { $('proNote').hidden = false; $('pro').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  function setText(t, nm, md) {
    code.value = t;
    name = nm || name; markdown = !!md;
    $('fname').textContent = name + (markdown ? ' (Markdown: every ' + (KIND === 'mermaid' ? 'mermaid' : 'dot') + ' block is drawn)' : '');
    changed(true);
  }

  async function openFile(f) {
    if (!f) return;
    if (!f.size) { say('This file is empty (0 bytes).', true); return; }
    if (f.size > CFG.maxKB * 1024) { say(`This file is ${(f.size / 1048576).toFixed(1)} MB. The editor opens text files up to ${CFG.maxKB / 1024} MB.`, true); return; }
    const head = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
    let zeros = 0; for (const b of head) if (b === 0) zeros++;
    if (zeros > 4) { say('This is a binary file, not ' + (KIND === 'mermaid' ? 'Mermaid' : 'DOT') + ' text, so it was not opened.', true); return; }
    const text = new TextDecoder('utf-8', { fatal: false }).decode(await f.arrayBuffer());
    setText(text.replace(/^﻿/, ''), f.name.slice(0, 200), CFG.md.test(f.name));
    say(`Opened ${f.name}. It stays in this browser.`);
  }

  // Copy link: the code, deflated and base64url-encoded, after the #. The # part never reaches a server.
  async function pack(text) {
    const s = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const u = new Uint8Array(await new Response(s).arrayBuffer());
    let out = '';
    for (let i = 0; i < u.length; i += 0x8000) out += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function unpack(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const st = new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const r = st.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; if (n > CFG.maxKB * 1024) { r.cancel(); throw new Error('too large'); } parts.push(value); }
    return new TextDecoder().decode(await new Blob(parts).arrayBuffer());
  }

  $('share').addEventListener('click', async () => {
    if (!code.value.trim()) { say('There is no code to share yet.', true); return; }
    try {
      const url = location.origin + location.pathname + '#code=' + await pack(code.value);
      if (url.length > 60000) { say('This code is too long for a link. Use Save instead and send the file.', true); return; }
      history.replaceState(null, '', url);
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { ok = false; }
      say(ok ? 'Link copied. The code is inside the link itself (after the #), so no server ever stores it.' : 'The link is in the address bar now. Copy it from there.');
    } catch (e) { say('This browser cannot make a link (no CompressionStream).', true); }
  });
  $('save').addEventListener('click', () => {
    const nm = markdown ? name : name.replace(/\.[^.]+$/, '') + '.' + CFG.ext;
    const url = URL.createObjectURL(new Blob([code.value], { type: CFG.mime }));
    const a = document.createElement('a'); a.href = url; a.download = nm; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    say(`Saved ${nm} to your downloads.`);
  });
  $('clear').addEventListener('click', () => { setText('', 'diagram.' + CFG.ext, false); code.focus(); });
  $('pick').addEventListener('change', e => { openFile(e.target.files && e.target.files[0]); e.target.value = ''; });

  const tpl = $('tpl');
  const list = self.ZOVO_TEMPLATES || [];
  for (const [i, t] of list.entries()) { const o = document.createElement('option'); o.value = String(i); o.textContent = t.label; tpl.append(o); }
  tpl.addEventListener('change', () => {
    const t = list[Number(tpl.value)];
    if (!t) return;
    if (code.value.trim() && code.value !== t.text && !confirm('Replace the code in the editor with the ' + t.label + ' example?')) { tpl.value = ''; return; }
    setText(t.text, (t.id || 'example') + '.' + CFG.ext, false);
    tpl.value = '';
  });

  code.addEventListener('input', () => changed(false));
  code.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const s = code.selectionStart, en = code.selectionEnd;
      code.setRangeText('  ', s, en, 'end');
      changed(false);
    }
  });
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) openFile(f[0]); });

  (async () => {
    let start = null;
    const m = /^#code=([A-Za-z0-9_-]+)$/.exec(location.hash || '');
    if (m) { try { start = { text: await unpack(m[1]), name: 'shared.' + CFG.ext, markdown: false, shared: true }; } catch (e) { say('The link holds no readable code.', true); } }
    if (!start) { try { const s = JSON.parse(localStorage.getItem(CFG.key) || 'null'); if (s && typeof s.text === 'string' && s.text.trim()) start = s; } catch (e) { /* none */ } }
    if (!start && list[0]) start = { text: list[0].text, name: (list[0].id || 'example') + '.' + CFG.ext, markdown: false };
    makeFrame();
    setText(start ? start.text : '', start && start.name, start && start.markdown);
    if (start && start.shared) say('Opened the code from the link. It was in the link itself, not on a server.');
  })();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
