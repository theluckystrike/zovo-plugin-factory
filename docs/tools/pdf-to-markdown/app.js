/* PDF to Markdown (TOOLCHK5, wave18, 13 Nov 2026). Converts a PDF to Markdown with the Convert to Markdown
   extension's own PDF converter (engine.js, MIT) and pdf.js 5.7.284 (Apache-2.0, ./pdfjs/, the build the extension
   ships). pdf.js parses the file in a worker from this site. The file is read with the File API in this tab and never
   sent anywhere. File text is only ever written with textContent. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine;
  const MAX_BYTES = 200 * 1024 * 1024, MAX_PAGES = 1000, SHOW_CHARS = 2 * 1024 * 1024;
  const base = new URL('pdfjs/', location.href).href;
  const n = (x) => Number(x).toLocaleString('en-US');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let last = null, cancelled = false, lib = null;

  async function pdfjs() {
    if (lib) return lib;
    lib = await import(base + 'pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
    // An empty pdfjsWorker makes the engine skip its in-thread copy of the parser, so pdf.js runs in a real worker.
    if (!self.pdfjsWorker) self.pdfjsWorker = {};
    return lib;
  }

  function stat(k, v) { const d = el('div', 'stat'); d.append(el('div', 'k', k), el('div', 'v', v)); return d; }

  function render(r, name) {
    $('stats').replaceChildren(stat('Pages', n(r.meta.pages)), stat('Headings', n(r.headings.length)), stat('Markdown', n(r.markdown.length) + ' characters'),
      stat('Lines', n(r.markdown ? r.markdown.split('\n').length : 0)), stat('Title', r.title || 'none'));
    const notes = r.notes.slice();
    const shown = r.markdown.length > SHOW_CHARS ? r.markdown.slice(0, SHOW_CHARS) : r.markdown;
    if (shown !== r.markdown) notes.push(`The page shows the first ${n(SHOW_CHARS)} characters. Copy and Save give all ${n(r.markdown.length)}.`);
    $('notes').textContent = notes.join(' ');
    const pre = $('md'); pre.replaceChildren();
    const lines = shown.split('\n'), frag = document.createDocumentFragment(), heads = [];
    lines.forEach((l, i) => {
      const s = el('span', null, l + (i < lines.length - 1 ? '\n' : ''));
      const m = /^(#{1,6}) (.*)$/.exec(l);
      if (m && heads.length < 3000) heads.push({ level: m[1].length, text: m[2].replace(/\\(.)/g, '$1'), span: s });
      frag.appendChild(s);
    });
    pre.appendChild(frag);
    // The heading list is read from the Markdown lines, so a click always lands on that line (also for repeated names).
    const ol = $('outline'); ol.replaceChildren();
    for (const h of heads) {
      const li = el('li', 'l' + h.level), b = el('button', null, h.text); b.type = 'button';
      b.addEventListener('click', () => {
        pre.querySelectorAll('.hl').forEach((x) => x.classList.remove('hl'));
        h.span.classList.add('hl'); pre.scrollTop = h.span.offsetTop - pre.offsetTop - 8;
      });
      li.appendChild(b); ol.appendChild(li);
    }
    $('noHeads').hidden = heads.length > 0;
    last = { md: r.markdown, name: name.replace(/\.pdf$/i, '') + '.md' };
  }

  self.zovoOpen = async (file) => {
    if (file.size === 0) throw new Error('The file is empty (0 bytes).');
    if (file.size > MAX_BYTES) throw new Error(`The file is ${self.zovoSize(file.size)}. This page converts PDFs up to 200 MB.`);
    const buf = new Uint8Array(await file.arrayBuffer());
    const head = new TextDecoder('latin1').decode(buf.subarray(0, 1024));
    if (!head.includes('%PDF-')) throw new Error('This is not a PDF file (it has no %PDF- header).');
    const t0 = performance.now();
    const L = await pdfjs();
    cancelled = false; $('cancel').hidden = false;
    let r;
    try {
      r = await E.pdf(buf, {
        assets: new E.Assets('placeholder'), limits: { maxPages: MAX_PAGES },
        pdfjs: { lib: base + 'pdf.min.mjs', worker: base + 'pdf.worker.min.mjs' },
        progress: (t) => self.zovoMsg('Working on ' + String(t).replace(/^P/, 'p') + '...'),
        checkCancel: () => { if (cancelled) { const e = new Error('Cancelled.'); e.code = 'CANCEL'; throw e; } },
      });
    } finally { $('cancel').hidden = true; }
    void L;
    render(r, file.name);
    self.zovoState = { pages: r.meta.pages, headings: r.headings.length, chars: r.markdown.length, title: r.title, notes: r.notes.length, markdown: r.markdown, pwned: !!self.__pwned };
    return `Converted ${file.name}: ${n(r.meta.pages)} page${r.meta.pages === 1 ? '' : 's'} to ${n(r.markdown.length)} characters of Markdown in ${Math.round(performance.now() - t0)} ms.`;
  };

  $('cancel').addEventListener('click', () => { cancelled = true; });
  $('wrap').addEventListener('change', () => $('md').classList.toggle('wrap', $('wrap').checked));
  $('copy').addEventListener('click', async () => {
    if (!last) return;
    try { await navigator.clipboard.writeText(last.md); $('copied').textContent = 'Copied.'; }
    catch (e) { $('copied').textContent = 'Copy failed. Select the text and copy it by hand.'; }
    setTimeout(() => { $('copied').textContent = ''; }, 2500);
  });
  $('save').addEventListener('click', () => {
    if (!last) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([last.md], { type: 'text/markdown' })); a.download = last.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
})();
