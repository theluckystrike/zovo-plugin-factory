/* Zovo Regex Tester Online (TOOLCHK2, wave18). Tests a JavaScript regular expression on your own text: every
   match highlighted, one column per group (numbered and named), a replace preview and a plain-words explanation.
   The pattern runs in worker.js, which the page stops after 2 seconds. A text file you load stays in this tab
   (CSP connect-src 'none'). Rewritten from the HTOOL9 draft. */
(function () {
  'use strict';
  const { $, el, say, int, plural, clip, table, wire } = self.Z;
  const MAXM = 5000, MAXHL = 400000, LIMIT_MS = 2000;
  const DEMO = 'Order 1042 shipped 2026-11-03 to ana@example.com\nOrder 1043 failed 2026-11-04, retry at 14:30\nOrder 1044 shipped 2026-11-05 to li.wei@example.org\nInvoice INV-2026-0099 paid 2026-11-06\n';
  const P = $('pattern'), F = $('flags'), T = $('text'), R = $('replace');
  let worker = null, seq = 0, timer = null, deb = null;

  /* explain: a small parser for JavaScript regex syntax */
  const ESC = { d: 'a digit 0-9', D: 'any character that is not a digit', w: 'a word character (letter, digit or _)', W: 'any character that is not a word character',
    s: 'a whitespace character', S: 'any character that is not whitespace', b: 'a word boundary', B: 'not a word boundary', n: 'a newline', r: 'a carriage return',
    t: 'a tab', f: 'a form feed', v: 'a vertical tab', 0: 'the NUL character' };
  function parse(src, flags) {
    let i = 0, gnum = 0;
    const groups = [];
    const uni = /[uv]/.test(flags);
    function alt(depth) {  // returns a list of branches, each a list of items
      const branches = [[]];
      while (i < src.length) {
        const c = src[i];
        if (c === ')') { if (depth > 0) break; branches[branches.length - 1].push({ t: 'err', s: ')', d: 'a ) with no ( before it' }); i++; continue; }
        if (c === '|') { branches.push([]); i++; continue; }
        const it = atom(depth);
        if (!it) continue;
        quant(it);
        branches[branches.length - 1].push(it);
      }
      return branches;
    }
    function quant(it) {
      const q = src.slice(i).match(/^(\*|\+|\?|\{(\d+)(,(\d*))?\})(\?)?/);
      if (!q) return;
      let d;
      if (q[1] === '*') d = 'zero or more times'; else if (q[1] === '+') d = 'one or more times'; else if (q[1] === '?') d = 'optional (zero or one time)';
      else if (q[3] === undefined) d = `exactly ${q[2]} times`; else if (q[4] === '') d = `${q[2]} or more times`; else d = `${q[2]} to ${q[4]} times`;
      it.q = q[0]; it.qd = d + (q[5] ? ', as few as possible (lazy)' : '');
      i += q[0].length;
    }
    function cls() {  // at '['
      const s0 = i; i++;
      let neg = false; if (src[i] === '^') { neg = true; i++; }
      const parts = [];
      while (i < src.length && src[i] !== ']') {
        if (src[i] === '\\') { const e = src.slice(i, i + 2); parts.push(ESC[src[i + 1]] ? ESC[src[i + 1]].replace(/^an? /, '') : 'the character ' + (src[i + 1] || '')); i += src[i + 1] === 'u' ? (src[i + 2] === '{' ? src.indexOf('}', i) + 1 - i : 6) : src[i + 1] === 'x' ? 4 : src[i + 1] === 'p' || src[i + 1] === 'P' ? src.indexOf('}', i) + 1 - i : 2; void e; continue; }
        if (src[i + 1] === '-' && src[i + 2] && src[i + 2] !== ']') { parts.push(`${src[i]} to ${src[i + 2]}`); i += 3; continue; }
        parts.push(src[i] === ' ' ? 'a space' : src[i]); i++;
      }
      if (src[i] !== ']') return { t: 'err', s: src.slice(s0), d: 'a character class with no closing ]' };
      i++;
      if (!parts.length) return { t: 'class', s: src.slice(s0, i), d: neg ? 'any character, newlines too' : 'nothing: an empty class never matches' };
      return { t: 'class', s: src.slice(s0, i), d: (neg ? 'any one character except ' : 'one character from: ') + parts.join(', ') };
    }
    function atom(depth) {
      const c = src[i], s0 = i;
      if (c === '(') {
        let kind, name = null;
        if (src.startsWith('(?:', i)) { kind = 'a group that does not capture'; i += 3; }
        else if (src.startsWith('(?=', i)) { kind = 'lookahead: the text after this point must match'; i += 3; }
        else if (src.startsWith('(?!', i)) { kind = 'negative lookahead: the text after this point must not match'; i += 3; }
        else if (src.startsWith('(?<=', i)) { kind = 'lookbehind: the text before this point must match'; i += 4; }
        else if (src.startsWith('(?<!', i)) { kind = 'negative lookbehind: the text before this point must not match'; i += 4; }
        else if (/^\(\?<[A-Za-z_$][\w$]*>/.test(src.slice(i))) { name = src.slice(i).match(/^\(\?<([A-Za-z_$][\w$]*)>/)[1]; gnum++; kind = `group ${gnum}, named "${name}"`; groups.push({ n: gnum, name }); i += name.length + 4; }
        else if (/^\(\?[imsx-]+:/.test(src.slice(i))) { const m = src.slice(i).match(/^\(\?([imsx-]+):/); kind = `a group with the flags ${m[1]}`; i += m[0].length; }
        else { gnum++; kind = `group ${gnum}`; groups.push({ n: gnum, name: null }); i++; }
        const kids = alt(depth + 1);
        if (src[i] !== ')') return { t: 'err', s: src.slice(s0), d: 'a group with no closing )' };
        i++;
        return { t: 'group', s: src.slice(s0, i), d: kind, kids };
      }
      if (c === '[') return cls();
      if (c === '\\') {
        const n = src[i + 1];
        if (n === undefined) { i++; return { t: 'err', s: '\\', d: 'a \\ at the end of the pattern' }; }
        if (/[1-9]/.test(n)) { const m = src.slice(i + 1).match(/^\d+/)[0]; i += 1 + m.length; return { t: 'ref', s: '\\' + m, d: `the same text that group ${m} matched` }; }
        if (n === 'k' && src[i + 2] === '<') { const e = src.indexOf('>', i); const nm = src.slice(i + 3, e); i = e + 1; return { t: 'ref', s: `\\k<${nm}>`, d: `the same text that the group "${nm}" matched` }; }
        if (n === 'u') { const m = src.slice(i).match(/^\\u(\{[0-9a-fA-F]+\}|[0-9a-fA-F]{4})/); if (m) { i += m[0].length; return { t: 'lit', s: m[0], d: 'the character U+' + m[1].replace(/[{}]/g, '').toUpperCase() }; } }
        if (n === 'x') { const m = src.slice(i).match(/^\\x[0-9a-fA-F]{2}/); if (m) { i += 4; return { t: 'lit', s: m[0], d: 'the character with code 0x' + m[0].slice(2).toUpperCase() }; } }
        if ((n === 'p' || n === 'P') && src[i + 2] === '{') { const e = src.indexOf('}', i); const pr = src.slice(i + 3, e); i = e + 1; return { t: 'class', s: `\\${n}{${pr}}`, d: (n === 'P' ? 'a character without' : 'a character with') + ` the Unicode property ${pr}` + (uni ? '' : ' (needs the u flag, or it means the letter p)') }; }
        if (n === 'c') { i += 3; return { t: 'lit', s: src.slice(i - 3, i), d: 'a control character' }; }
        i += 2;
        if (ESC[n]) return { t: n === 'b' || n === 'B' ? 'anchor' : 'class', s: '\\' + n, d: ESC[n] };
        return { t: 'lit', s: '\\' + n, d: 'this character as is (escaped)' };
      }
      if (c === '^') { i++; return { t: 'anchor', s: '^', d: /m/.test(flags) ? 'the start of a line' : 'the start of the text' }; }
      if (c === '$') { i++; return { t: 'anchor', s: '$', d: /m/.test(flags) ? 'the end of a line' : 'the end of the text' }; }
      if (c === '.') { i++; return { t: 'class', s: '.', d: /s/.test(flags) ? 'any character, newlines too' : 'any character except a newline' }; }
      if (/[*+?{]/.test(c) && !(c === '{' && !/^\{\d+(,\d*)?\}/.test(src.slice(i)))) { i++; return { t: 'err', s: c, d: 'a repeat with nothing before it to repeat' }; }
      // a run of plain characters
      let j = i;
      while (j < src.length && !/[\\()[\]|.^$*+?{]/.test(src[j])) j++;
      if (j === i) j = i + 1;
      // a repeat applies only to the last character of the run
      if (j - i > 1 && /^[*+?{]/.test(src[j] || '')) j--;
      const s = src.slice(i, j); i = j;
      return { t: 'lit', s, d: s === ' ' ? 'a space' : /^ +$/.test(s) ? `${s.length} spaces` : s.length > 1 ? 'this text as is' : 'this character as is' };
    }
    const tree = alt(0);
    return { tree, groups };
  }
  function explainList(ul, branches, depth) {
    branches.forEach((items, bi) => {
      if (branches.length > 1) { const li = el('li', bi === 0 ? 'either:' : 'or:', 'mut'); li.style.setProperty('--d', depth); ul.append(li); }
      const d2 = depth + (branches.length > 1 ? 1 : 0);
      for (const it of items) {
        const li = el('li', null, it.t === 'err' ? 'warn' : '');
        li.style.setProperty('--d', d2);
        li.append(el('code', it.s.length > 60 ? it.s.slice(0, 57) + '...' : it.s), document.createTextNode(' ' + it.d + (it.qd ? ', ' + it.qd : '')));
        ul.append(li);
        if (it.kids) explainList(ul, it.kids, d2 + 1);
      }
    });
  }

  /* running */
  function lineStarts(text) { const a = [0]; for (let k = text.indexOf('\n'); k !== -1; k = text.indexOf('\n', k + 1)) a.push(k + 1); return a; }
  function lineOf(starts, pos) { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; }
  function newWorker() { if (worker) worker.terminate(); worker = new Worker('worker.js'); worker.onmessage = got; }
  let pending = null;
  function run() {
    const pat = P.value, fl = F.value.trim();
    const bad = fl.replace(/[dgimsuvy]/g, '');
    $('expl').textContent = '';
    if (bad) { P.classList.remove('bad'); say(`Unknown flag: ${bad}. JavaScript flags are d, g, i, m, s, u, v and y.`, true); return; }
    let parsed = null;
    try { new RegExp(pat, fl); P.classList.remove('bad'); } catch (e) { P.classList.add('bad'); say(e.message.replace(/^Invalid regular expression: /, 'This pattern does not work in JavaScript: '), true); clearOut(); return; }
    parsed = parse(pat, fl);
    if (pat) explainList($('expl'), parsed.tree, 0); else $('expl').append(el('li', 'Type a pattern above.', 'mut'));
    if (!pat) { clearOut(); say('Type a pattern to see its matches.'); return; }
    const text = T.value;
    if (!worker) newWorker();
    const id = ++seq;
    pending = { id, pat, fl, text, groups: parsed.groups };
    clearTimeout(timer);
    timer = setTimeout(() => { if (pending && pending.id === id) { newWorker(); pending = null; clearOut(); say(`Stopped after ${LIMIT_MS / 1000} seconds. This pattern backtracks too much on this text (look for a repeat inside a repeat, such as (a+)+). Simplify it or test a smaller text.`, true); } }, LIMIT_MS);
    worker.postMessage({ id, pattern: pat, flags: fl, text, replace: R.value === '' ? null : R.value, max: MAXM });
  }
  function clearOut() { $('hl').textContent = ''; $('groups').textContent = ''; $('rep').textContent = ''; $('gnote').textContent = ''; }
  function got(e) {
    const r = e.data;
    if (!pending || r.id !== pending.id) return;
    clearTimeout(timer);
    const { text, groups, fl } = pending; pending = null;
    if (r.error) { say(r.error, true); return; }
    clearOut();
    const ms = r.ms < 1 ? 'under 1 ms' : int(Math.round(r.ms)) + ' ms';
    say(r.count ? `${plural(r.count, 'match', 'matches')}${/g/.test(fl) ? '' : ' (the g flag is off, so only the first)'} in ${ms}.` : `No match (${ms}).`);
    // highlight
    const hl = $('hl'), frag = document.createDocumentFragment();
    let pos = 0, k = 0;
    const lim = Math.min(text.length, MAXHL);
    for (const m of r.matches) {
      if (m.i >= lim) break;
      if (m.i > pos) frag.append(document.createTextNode(text.slice(pos, m.i)));
      const end = Math.min(m.i + m.s.length, lim);
      const mk = el('mark', m.s.length ? text.slice(m.i, end) : '', k % 2 ? 'alt' : '', { title: `Match ${k + 1} at ${m.i}` });
      if (!m.s.length) mk.textContent = '​';
      frag.append(mk); pos = Math.max(pos, end); k++;
    }
    if (pos < lim) frag.append(document.createTextNode(text.slice(pos, lim)));
    hl.append(frag);
    if (text.length > MAXHL) hl.append(el('span', `\n... the text goes on for ${int(text.length - MAXHL)} more characters (matches below count all of it).`, 'mut'));
    if (!text) hl.append(el('span', 'Type or paste some text on the left, or load a text file.', 'mut'));
    // groups table
    if (r.count) {
      const starts = lineStarts(text);
      const heads = ['#', 'Line', 'Index', 'Match'].concat(Array.from({ length: r.groups }, (_, g) => { const gg = groups.find(x => x.n === g + 1); return gg && gg.name ? `${g + 1}: ${gg.name}` : `Group ${g + 1}`; }));
      const nul = () => el('span', '-', 'nul', { title: 'This group did not take part in the match' });
      $('groups').append(el('div', null, 'tblwrap short', null, [table(heads, r.matches.map((m, n) => [n + 1, lineOf(starts, m.i), m.i, m.s === '' ? el('span', '(empty)', 'nul') : clip(m.s, 300)].concat(m.g.map(g => g === null ? nul() : clip(g, 300)))), { cls: 'mono' })]));
      $('gnote').textContent = r.count > r.matches.length ? `The table shows the first ${int(r.matches.length)} of ${int(r.count)} matches.` : (r.groups ? '' : 'This pattern has no capture groups. Put part of it in ( ) to capture it.');
    }
    // replace
    if (r.replaced !== null) { const rp = $('rep'); rp.textContent = r.replaced.length > MAXHL ? r.replaced.slice(0, MAXHL) + '\n...' : r.replaced; }
    else $('rep').append(el('span', 'Type a replacement above: $1 or $<name> puts a group back, $& the whole match.', 'mut'));
  }
  const later = () => { clearTimeout(deb); deb = setTimeout(run, T.value.length > 200000 ? 250 : 80); };
  [P, F, T, R].forEach(x => x.addEventListener('input', later));
  document.querySelectorAll('[data-pat]').forEach(b => b.addEventListener('click', () => { P.value = b.dataset.pat; F.value = b.dataset.flags || 'gm'; run(); }));

  wire(async (text, info) => {
    if (text.indexOf('\0') !== -1) throw new Error('This looks like a binary file. Load a text file, such as a log, CSV or source file.');
    T.value = text;
    say(`Loaded ${info.name} (${plural(text.length, 'character')}).`);
    run();
  }, { maxBytes: 20 * 1048576 });
  if (!T.value) T.value = DEMO;
  if (!P.value) P.value = '(?<date>\\d{4}-\\d{2}-\\d{2})';
  run();
  self.zovoTest = () => ({ msg: $('msg').textContent, marks: $('hl').querySelectorAll('mark').length, groups: $('groups').innerText.slice(0, 600), rep: $('rep').textContent.slice(0, 300), expl: $('expl').innerText.slice(0, 900) });
  self.zovoReady = true;
})();
