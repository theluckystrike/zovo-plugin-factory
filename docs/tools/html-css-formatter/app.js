/* HTML and CSS Formatter (TOOLCHK4, wave18, 13 Nov 2026). Formats HTML, CSS, SCSS and LESS with the HTML Formatter &
   CSS Formatter extension's own code (engine.js: its option logic, .editorconfig reader and bundled js-beautify 1.15.4,
   MIT). The file is read in this tab and never sent anywhere; text is only written with textContent. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const E = self.ZovoEngine;
  const MAX_BYTES = 2 * 1024 * 1024;
  const n = (x) => x.toLocaleString('en-US');
  let src = '', name = '', ecText = null, ecName = '', lastOut = '';

  const langOf = (fname, text) => {
    const ext = (fname.split('.').pop() || '').toLowerCase();
    if (ext === 'scss' || ext === 'less' || ext === 'css') return ext;
    if (/^(html?|xhtml)$/.test(ext)) return 'html';
    return /^\s*</.test(text) ? 'html' : 'css';
  };

  function editorconfig() {
    if (ecText == null) return {};
    try { return E.propertiesFor('/page/' + (name || 'file.' + $('oLang').value), (p) => (p === '/page/.editorconfig' ? ecText : null)) || {}; } catch (e) { return {}; }
  }

  function options() {
    const lang = $('oLang').value, ind = $('oIndent').value;
    let tabSize = 2, insertSpaces = true;
    if (ind === 'detect') { const d = E.detectIndent(src, { insertSpaces: true, tabSize: 2 }); tabSize = d.tabSize; insertSpaces = d.insertSpaces; }
    else if (ind === 's4') tabSize = 4;
    else if (ind === 'tab') { insertSpaces = false; tabSize = 4; }
    const inner = $('oInner').value;
    const num = (id, d) => { const v = Number($(id).value); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d; };
    return {
      lang, tabSize, insertSpaces, editorconfig: editorconfig(),
      settings: { wrapLineLength: num('oWrap', 0), wrapAttributes: $('oAttrs').value, indentInnerHtml: inner === 'auto' ? 'auto' : inner === 'true',
        maxPreserveNewlines: num('oKeep', 2), newlineBetweenRules: $('oRules').checked, selectorSeparatorNewline: $('oSel').checked, spaceAroundCombinator: $('oComb').checked,
        unformatted: [], contentUnformatted: [] },
    };
  }

  function run() {
    const o = options();
    $('view').classList.toggle('nothtml', o.lang !== 'html');
    const t0 = performance.now();
    const out = E.formatText(src, o);
    const ms = Math.round(performance.now() - t0);
    lastOut = out;
    $('outText').textContent = out;
    $('inText').textContent = src;
    const lines = (s) => (s ? s.split(/\r\n|\r|\n/).length - (/\n$/.test(s) ? 1 : 0) : 0);
    const a = src.replace(/\r\n?/g, '\n').split('\n'), b = out.replace(/\r\n?/g, '\n').split('\n');
    // lines of the result that are not in the original (as a count, not a diff)
    const pool = new Map(); a.forEach((l) => pool.set(l, (pool.get(l) || 0) + 1));
    let changed = 0; b.forEach((l) => { const c = pool.get(l); if (c) pool.set(l, c - 1); else changed++; });
    const stats = $('stats'); stats.textContent = '';
    const tile = (k, v) => { const d = document.createElement('div'); d.className = 'stat'; const x = document.createElement('div'); x.className = 'k'; x.textContent = k; const y = document.createElement('div'); y.className = 'v'; y.textContent = v; d.append(x, y); stats.appendChild(d); };
    tile('Language', o.lang.toUpperCase()); tile('Lines before, after', n(lines(src)) + ', ' + n(lines(out)));
    tile('New or changed lines', out === src ? '0, already formatted' : n(changed));
    const ind = o.editorconfig.indent_style === 'tab' || (!o.editorconfig.indent_style && !o.insertSpaces) ? 'tabs' : (o.editorconfig.indent_size && /^\d+$/.test(o.editorconfig.indent_size) ? o.editorconfig.indent_size : o.tabSize) + ' spaces';
    tile('Indent', ind);
    $('ecNote').textContent = ecText != null ? 'Settings from ' + ecName + ' for this file: ' + (Object.entries(o.editorconfig).map(([k, v]) => k + ' = ' + v).join(', ') || 'none') + '. They win over the indent choice above.' : '';
    self.zovoState = { lang: o.lang, before: src.length, after: out.length, changed, ms, same: out === src };
    return ms;
  }

  self.zovoMulti = true;
  if ($('pick')) $('pick').multiple = true; // a .editorconfig can be picked together with the file
  self.zovoOpen = async (list) => {
    const arr = [...list].filter(Boolean);
    const ec = arr.find((f) => f.name === '.editorconfig' || /\.editorconfig$/.test(f.name));
    const files = arr.filter((f) => f !== ec);
    if (ec) { ecText = await ec.text(); ecName = ec.name; } else if (files.length) { ecText = null; ecName = ''; }
    const f = files.find((x) => /\.(html?|xhtml|css|scss|less)$/i.test(x.name)) || files[0];
    if (!f) { if (src) { run(); return 'Using ' + ecName + ' for ' + name + '.'; } throw new Error('Pick an HTML, CSS, SCSS or LESS file too.'); }
    if (f.size > MAX_BYTES) throw new Error('The file is ' + self.zovoSize(f.size) + '. This page formats files up to 2 MB; the extension has no such limit.');
    const text = await f.text();
    if (text.slice(0, 4000).includes('\u0000')) throw new Error('This is not a text file.');
    src = text; name = f.name;
    const lang = langOf(f.name, text);
    $('oLang').value = lang;
    $('fname').textContent = f.name + (ecText != null ? ' + ' + ecName : '');
    const ms = run();
    const more = files.length > 1 ? ' This page formats one file at a time, so ' + n(files.length - 1) + ' other file' + (files.length > 2 ? 's were' : ' was') + ' not opened.' : '';
    return (lastOut === src ? 'Opened ' + f.name + ': it is already formatted.' : 'Opened and formatted ' + f.name + ' in ' + n(ms) + ' ms.') + more;
  };

  const rerun = () => { if (!src) return; try { const ms = run(); self.zovoMsg('Formatted again in ' + n(ms) + ' ms.'); } catch (e) { self.zovoMsg('Could not format: ' + e.message, true); } };
  for (const id of ['oLang', 'oIndent', 'oAttrs', 'oInner', 'oRules', 'oSel', 'oComb']) $(id).addEventListener('change', rerun);
  for (const id of ['oWrap', 'oKeep']) $(id).addEventListener('change', rerun);

  $('copyOut').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(lastOut); self.zovoMsg('Copied the formatted text.'); }
    catch (e) { self.zovoMsg('The browser did not allow copying. Click in the Formatted box, select all and copy with the keyboard.', true); }
  });
  $('saveOut').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lastOut], { type: 'text/plain' }));
    a.download = name || 'formatted.' + $('oLang').value; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('pasteGo').addEventListener('click', () => {
    const t = $('pasteText').value;
    if (!t.trim()) { self.zovoMsg('Paste some HTML or CSS first.', true); return; }
    const lang = $('pasteLang').value || langOf('', t);
    const f = new File([t], 'pasted.' + lang, { type: 'text/plain' });
    ecText = null;
    self.zovoOpenFiles([f]);
  });

  // A second sample button in the drop zone (htool.js binds data-sample buttons after this file runs).
  const sb = $('sample');
  if (sb && (self.ZOVO_SAMPLES || []).some((s) => s.name === 'theme.scss')) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.sample = 'theme.scss'; b.textContent = 'Try a sample SCSS file';
    sb.after(document.createTextNode(' '), b);
  }
})();
