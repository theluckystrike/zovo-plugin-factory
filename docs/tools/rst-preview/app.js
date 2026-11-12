/* Zovo RST Preview Online (TOOLCHK3, wave18). Renders reStructuredText in this tab with plain JavaScript (no Python,
   no Sphinx). The file is read with the File API and never sent anywhere: the page CSP sets connect-src 'none'.
   Every piece of file text is escaped before it goes into the preview, link targets are limited to http, https,
   mailto and # anchors, pictures and includes are never loaded (the page reads only the file you opened), and raw
   HTML is shown as text. Problems (unknown directives, broken tables, short title underlines, unknown targets) are
   listed with their line numbers. */
import { SAMPLE } from './sample.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const MAXMB = 20;

/* ---------- theme ---------- */
const saved = (() => { try { return localStorage.getItem('zovo-theme'); } catch (e) { return null; } })();
if (saved === 'dark' || saved === 'light') root.dataset.theme = saved;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
$('theme').addEventListener('click', () => {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('zovo-theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

const say = (t, bad) => { $('msg').textContent = t; $('msg').className = bad ? 'warn' : 'mut'; };
const size = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const int = n => Number(n).toLocaleString('en-US');
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const plural = (n, w) => int(n) + ' ' + w + (n === 1 ? '' : 's');

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const ind = s => s.length - s.trimStart().length;
const blank = s => !s || !s.trim();
const ADORN = /^([=\-`:'"~^_*+#<>.!$%&(),/;?@[\\\]{|}])\1{2,}\s*$/;
const safeUrl = u => { u = String(u || '').replace(/\s+/g, ''); return /^(https?:\/\/|mailto:)/i.test(u) ? u : /^#[\w-]*$/.test(u) ? u : null; };
const ADMON = { note: 'Note', warning: 'Warning', tip: 'Tip', important: 'Important', attention: 'Attention', danger: 'Danger', error: 'Error', hint: 'Hint', caution: 'Caution', seealso: 'See also', todo: 'To do' };
const SYMBOLS = ['*', '†', '‡', '§', '¶', '#', '♠', '♥', '♦', '♣'];

/* ---------- code colors (small, keyword based) ---------- */
const KW = {
  py: 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self print',
  js: 'async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield interface type enum implements private public protected readonly',
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false class public private protected virtual template typename namespace using new delete nullptr fn let mut impl pub use mod match func package var type struct interface go defer map chan range import',
  sh: 'if then else elif fi for in do done while until case esac function return exit export local echo cd sudo set unset source alias',
  sql: 'select from where and or not insert into values update set delete create table drop alter add index primary key foreign references join left right inner outer on group by order having limit offset as distinct union all null is in like between case when then else end view',
};
const LANG = { python: 'py', py: 'py', python3: 'py', pycon: 'py', ipython: 'py', javascript: 'js', js: 'js', typescript: 'js', ts: 'js', jsx: 'js', tsx: 'js', json: 'js', c: 'c', cpp: 'c', 'c++': 'c', h: 'c', java: 'c', go: 'c', rust: 'c', csharp: 'c', cs: 'c', kotlin: 'c', swift: 'c', bash: 'sh', sh: 'sh', shell: 'sh', console: 'sh', zsh: 'sh', powershell: 'sh', sql: 'sql', postgresql: 'sql', mysql: 'sql' };
function highlight(code, lang) {
  const fam = LANG[String(lang || '').toLowerCase()];
  if (!fam) return [{ c: '', t: code }];
  const kw = new Set(KW[fam].split(' '));
  const com = fam === 'py' || fam === 'sh' ? '#[^\\n]*' : fam === 'sql' ? '--[^\\n]*' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
  const str = fam === 'py' ? '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'' : '`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'';
  const re = new RegExp(`(${com})|(${str})|(\\b\\d[\\d_.]*(?:e[-+]?\\d+)?\\b|\\b0x[\\da-f]+\\b)|([A-Za-z_][\\w$]*)`, 'gi');
  const out = []; let last = 0, m;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push({ c: '', t: code.slice(last, m.index) });
    if (m[1]) out.push({ c: 'tc', t: m[1] }); else if (m[2]) out.push({ c: 'ts', t: m[2] }); else if (m[3]) out.push({ c: 'tn', t: m[3] });
    else out.push({ c: kw.has(fam === 'sql' ? m[4].toLowerCase() : m[4]) ? 'tk' : '', t: m[4] });
    last = re.lastIndex;
  }
  if (last < code.length) out.push({ c: '', t: code.slice(last) });
  return out;
}
function codeHtml(code, lang, opts) {
  const toks = highlight(code, lang), lines = [''];
  for (const tk of toks) tk.t.split('\n').forEach((part, k) => { if (k) lines.push(''); if (part) lines[lines.length - 1] += tk.c ? `<span class="${tk.c}">${esc(part)}</span>` : esc(part); });
  const emph = new Set();
  for (const r of String(opts['emphasize-lines'] || '').split(',')) { const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(r); if (m) for (let k = +m[1]; k <= +(m[2] || m[1]) && k < +m[1] + 5000; k++) emph.add(k); }
  const ln = 'linenos' in opts, start = parseInt(opts['lineno-start'], 10) || 1;
  const body = lines.map((l, k) => `<span class="ln${emph.has(k + 1) ? ' em' : ''}">${ln ? `<span class="no">${k + start}</span>` : ''}${l || ' '}</span>`).join('');  // each line is a block span
  return `<pre class="code"><code>${body}</code></pre>`;
}

/* ---------- renderer ---------- */
function render(src) {
  const lines = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\t/g, '        ').replace(/\s+$/, ''));
  const problems = [], sections = [], stats = { directives: {}, tables: 0, code: 0, links: 0, images: 0, footnotes: 0, words: 0 };
  const warn = (n, t) => { if (problems.length < 500) problems.push({ n, t }); };
  // pass 1: targets, substitutions, footnote labels, implicit section targets
  const targets = new Map(), subs = new Map(), anon = [], usedIds = new Set(), fnAuto = [];
  const uid = base => { let id = base, k = 2; while (usedIds.has(id)) id = base + '-' + k++; usedIds.add(id); return id; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m = /^\s*\.\. _(`[^`]+`|[^:]+):\s*(.*)$/.exec(l);
    if (m) {
      const name = norm(m[1].replace(/^`|`$/g, '')); let url = m[2];
      for (let j = i + 1; j < lines.length && !blank(lines[j]) && ind(lines[j]) > ind(l); j++) url += lines[j].trim();
      targets.set(name, url ? { url: url.trim() } : { id: 'label-' + slug(name) });
      continue;
    }
    if ((m = /^\s*(?:\.\. __:|__)\s+(\S.*)$/.exec(l))) { anon.push(m[1].trim()); continue; }
    if ((m = /^\s*\.\. \|([^|]+)\|\s+([\w-]+)::\s*(.*)$/.exec(l))) {
      let arg = m[3]; for (let j = i + 1; j < lines.length && !blank(lines[j]) && ind(lines[j]) > ind(l) && !/^\s*:\w/.test(lines[j]); j++) arg += ' ' + lines[j].trim();
      subs.set(m[1].trim(), { kind: m[2].toLowerCase(), arg: arg.trim(), n: i + 1 });
      continue;
    }
    if ((m = /^\s*\.\. \[#([\w-]*)\]/.exec(l))) fnAuto.push(m[1]);
    if (!blank(l) && ind(l) === 0 && i + 1 < lines.length && ADORN.test(lines[i + 1]) && !ADORN.test(l) && lines[i + 1].trim().length >= Math.min(l.trim().length, 3)) {
      const nm = norm(l.trim()); if (!targets.has(nm)) targets.set(nm, { section: true, id: null, title: l.trim() });
    }
  }
  const fnNum = new Map(), anonNums = []; fnAuto.forEach((lab, k) => { if (lab) fnNum.set(lab, k + 1); else anonNums.push(k + 1); });
  let fnRefAuto = 0, autoDef = 0, symRef = 0, symDef = 0, anonRef = 0;
  const secIds = new Map(); // normalized title -> id, filled when the sections are rendered; refs are patched at the end
  const pendingRefs = [];

  /* inline markup */
  const endOk = (s, j) => j >= s.length || /[\s'")\]}>\-/:.,;!?\\’”»]/.test(s[j]);
  const refLink = (text, name, n) => {
    const t = targets.get(norm(name));
    stats.links++;
    if (!t) { warn(n, `Unknown target name: "${name}".`); return `<span class="xref bad" title="Unknown target">${esc(text)}</span>`; }
    if (t.url) {
      const al = /^(\S+)_$/.exec(t.url); // alias to another target
      if (al && targets.get(norm(al[1])) && targets.get(norm(al[1])).url) return link(text, targets.get(norm(al[1])).url);
      return link(text, t.url);
    }
    if (t.section) { const k = pendingRefs.length; pendingRefs.push(norm(name)); return `<a class="xref" href="#\u0001${k}\u0001">${esc(text)}</a>`; }
    return `<a class="xref" href="#${t.id}">${esc(text)}</a>`;
  };
  const link = (text, url) => {
    const u = safeUrl(url);
    if (!u) return `<span class="xref" title="${esc('Local link: ' + url)}">${esc(text)}</span>`;
    return u.startsWith('#') ? `<a href="${esc(u)}">${esc(text)}</a>` : `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  };
  const role = (name, text, n) => {
    const base = name.toLowerCase().split(':').pop();
    const pair = /^([\s\S]*?)\s*<([^<>]+)>$/.exec(text);
    const disp = pair && pair[1] ? pair[1] : (pair ? pair[2] : text);
    switch (base) {
      case 'ref': { const lab = norm(pair ? pair[2] : text); const t = targets.get(lab);
        if (t && t.id && !t.section) return `<a class="xref" href="#${t.id}">${esc(disp)}</a>`;
        if (t && t.section) { const k = pendingRefs.length; pendingRefs.push(lab); return `<a class="xref" href="#\u0001${k}\u0001">${esc(disp)}</a>`; }
        return `<span class="xref" title="${esc('Label in another file: ' + (pair ? pair[2] : text))}">${esc(disp)}</span>`; }
      case 'doc': return `<span class="xref" title="${esc('Document: ' + (pair ? pair[2] : text))}">${esc(disp)}</span>`;
      case 'math': return `<code class="math">${esc(text)}</code>`;
      case 'sub': case 'subscript': return `<sub>${esc(text)}</sub>`;
      case 'sup': case 'superscript': return `<sup>${esc(text)}</sup>`;
      case 'strong': return `<strong>${esc(text)}</strong>`;
      case 'emphasis': case 'term': case 'dfn': case 'title-reference': case 't': return `<em>${esc(disp)}</em>`;
      case 'kbd': return text.split(/(\s*[+-]\s*|\s+)/).map((p, k) => k % 2 ? esc(p) : `<kbd>${esc(p)}</kbd>`).join('');
      case 'abbr': { const m = /^(.*?)\s*\((.*)\)$/.exec(text); return m ? `<abbr title="${esc(m[2])}">${esc(m[1])}</abbr>` : `<abbr>${esc(text)}</abbr>`; }
      case 'pep': { const k = parseInt(text, 10); return k >= 0 ? link('PEP ' + k, 'https://peps.python.org/pep-' + String(k).padStart(4, '0') + '/') : esc(text); }
      case 'rfc': { const k = parseInt(text, 10); return k >= 0 ? link('RFC ' + k, 'https://datatracker.ietf.org/doc/html/rfc' + k) : esc(text); }
      case 'guilabel': return `<span class="gui">${esc(text.replace(/&(\w)/g, '$1'))}</span>`;
      case 'menuselection': return `<span class="gui">${esc(text.replace(/-->/g, '›'))}</span>`;
      case 'func': case 'meth': return `<code class="xref">${esc(disp.replace(/^[~!]/, ''))}${/\)$/.test(disp) ? '' : '()'}</code>`;
      default: return `<code class="xref">${esc(disp.replace(/^[~!]/, ''))}</code>`;
    }
  };
  const subst = (name, n) => {
    const s = subs.get(name.trim());
    if (!s) { warn(n, `Undefined substitution: |${name}|.`); return `<span class="bad">|${esc(name)}|</span>`; }
    if (s.kind === 'replace') return inline(s.arg, n, true);
    if (s.kind === 'unicode') return esc(s.arg.split(/\s+/).map(c => /^(0x|U\+|\\x|\\u|&#x)[\da-f]+;?$/i.test(c) ? String.fromCodePoint(parseInt(c.replace(/^(0x|U\+|\\x|\\u|&#x)/i, ''), 16)) : /^\.\.$/.test(c) ? '' : c).join(''));
    if (s.kind === 'image') { stats.images++; return `<span class="imgph" title="${esc('Picture: ' + s.arg)}">[picture: ${esc(s.arg.split('/').pop())}]</span>`; }
    if (s.kind === 'date') return esc(new Date().toISOString().slice(0, 10));
    return `<span class="mut">|${esc(name)}|</span>`;
  };
  const RULES = [
    [/``([\s\S]+?)``/y, m => `<code>${esc(m[1])}</code>`, '`'],
    [/:([\w.+:-]+):`([^`]+)`/y, (m, n) => role(m[1], m[2], n), ':'],
    [/`([^`]+)`:([\w.+:-]+):/y, (m, n) => role(m[2], m[1], n), '`'],
    [/\*\*(\S(?:[\s\S]*?\S)?)\*\*/y, m => `<strong>${esc(m[1])}</strong>`, '*'],
    [/\*(\S(?:[^*]*?\S)?)\*/y, m => `<em>${esc(m[1])}</em>`, '*'],
    [/`([^`<]*?)\s*<([^<>`]+)>`(__?)/y, (m, n) => { stats.links++; const tx = m[1] || m[2]; const al = /^(\S+)_$/.exec(m[2].trim()); if (al) return refLink(tx, al[1], n); if (m[3] === '_' && m[1]) targets.set(norm(m[1]), { url: m[2].replace(/\s+/g, '') }); return link(tx, m[2]); }, '`'],
    [/`([^`]+)`__/y, (m, n) => { const u = anon[anonRef++]; stats.links++; if (!u) { warn(n, 'Anonymous link with no target.'); return esc(m[1]); } return link(m[1], u); }, '`'],
    [/`([^`]+)`_/y, (m, n) => refLink(m[1], m[1], n), '`'],
    [/`([^`]+)`/y, m => `<cite>${esc(m[1])}</cite>`, '`'],
    [/\|(\S(?:[^|]*?\S)?)\|(?:__?)?/y, (m, n) => subst(m[1], n), '|'],
    [/\[(#[\w-]*|\*|\d+|[A-Za-z][\w.-]*)\]_/y, (m, n) => {
      const l = m[1]; let lab, id;
      if (l === '#') { lab = String(anonNums[fnRefAuto++] || '?'); id = 'fn-' + lab; }
      else if (l.startsWith('#')) { lab = String(fnNum.get(l.slice(1)) || '?'); id = 'fn-' + lab; }
      else if (l === '*') { lab = SYMBOLS[symRef % 10].repeat(1 + Math.floor(symRef / 10)); id = 'fns-' + symRef++; }
      else if (/^\d+$/.test(l)) { lab = l; id = 'fn-' + l; }
      else { lab = l; id = 'cit-' + slug(l); }
      return `<a class="fnref" href="#${id}">[${esc(lab)}]</a>`;
    }, '['],
    [/_`([^`]+)`/y, m => `<span id="${uid('label-' + slug(m[1]))}" class="itarget">${esc(m[1])}</span>`, '_'],
    [/(?:https?:\/\/|mailto:)[^\s<>"`]*[^\s<>"`.,;:!?)\]'*]/y, m => { stats.links++; return link(m[0], m[0]); }, 'hmf'],
    [/([A-Za-z0-9](?:[\w.+-]*[A-Za-z0-9])?)__?(?![\w])/y, (m, n) => { const t = targets.get(norm(m[1])); return t ? refLink(m[1], m[1], n) : null; }, null],
  ];
  function inline(s, n, nested) {
    let out = '', buf = '', i = 0;
    const flush = () => { if (buf) { out += esc(buf); buf = ''; } };
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') { if (s[i + 1] !== ' ') buf += s[i + 1] || ''; i += 2; continue; }
      const prev = i ? s[i - 1] : ' ';
      if ('`*:|[_hmABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgijklnopqrstuvwxyz0123456789'.includes(c) && (i === 0 || /[\s'"(\[{<\-/:‘“’«¡¿—–]/.test(prev))) {
        let hit = false;
        for (const [re, fn, first] of RULES) {
          if (first && !first.includes(c)) continue;
          if (!first && !/[A-Za-z0-9]/.test(c)) continue;
          if (nested && first === '|') continue;
          re.lastIndex = i; const m = re.exec(s);
          if (m && endOk(s, re.lastIndex)) { const h = fn(m, n); if (h == null) continue; flush(); out += h; i = re.lastIndex; hit = true; break; }
        }
        if (hit) continue;
      }
      buf += c; i++;
    }
    flush();
    return out;
  }

  /* block parsing: L is an array of {t (text, dedented), n (line number)} */
  const L0 = lines.map((t, k) => ({ t, n: k + 1 }));
  const styles = []; // section title styles in order of first use
  const dedent = arr => { const m = Math.min(...arr.filter(x => !blank(x.t)).map(x => ind(x.t))); return Number.isFinite(m) ? arr.map(x => ({ t: x.t.slice(Math.min(m, ind(x.t) || m)), n: x.n })) : arr; };
  const trimBlank = arr => { let a = 0, b = arr.length; while (a < b && blank(arr[a].t)) a++; while (b > a && blank(arr[b - 1].t)) b--; return arr.slice(a, b); };
  // the indented block after line i (lines that are blank or indented by more than base)
  function takeIndented(L, i, base) {
    let j = i; while (j < L.length && (blank(L[j].t) || ind(L[j].t) > base)) j++;
    return { body: dedent(trimBlank(L.slice(i, j))), next: j };
  }
  let tocAt = [];
  function blocks(L, top) {
    let out = '', i = 0, literalNext = false;
    while (i < L.length) {
      const { t, n } = L[i];
      if (blank(t)) { i++; continue; }
      const I = ind(t), s = t.trim();
      // indented block: literal (after ::) or block quote
      if (I > 0) {
        const r = takeIndented(L, i, I - 1);
        if (literalNext) { out += `<pre class="code lit" data-line="${n}"><code>${esc(r.body.map(x => x.t).join('\n'))}</code></pre>`; stats.code++; }
        else {
          const body = r.body; let attr = '';
          const last = body.length ? body[body.length - 1] : null;
          if (last && /^(--|—|---)\s+\S/.test(last.t.trim())) { attr = `<p class="attrib">— ${inline(last.t.trim().replace(/^(--|—|---)\s+/, ''), last.n)}</p>`; body.pop(); }
          out += `<blockquote data-line="${n}">${blocks(body)}${attr}</blockquote>`;
        }
        literalNext = false; i = r.next; continue;
      }
      literalNext = false;
      const nx = L[i + 1], nx2 = L[i + 2];
      // section title with overline
      if (top && ADORN.test(s) && nx && !blank(nx.t) && nx2 && ADORN.test(nx2.t.trim()) && nx2.t.trim()[0] === s[0]) {
        const title = nx.t.trim();
        if (s.length < title.length) warn(n, 'Title overline too short.');
        out += section(title, 'o' + s[0], n);
        i += 3; continue;
      }
      // transition
      if (ADORN.test(s) && s.length >= 4 && (!nx || blank(nx.t))) { out += `<hr data-line="${n}">`; i++; continue; }
      // section title with underline
      if (top && nx && ADORN.test(nx.t) && ind(nx.t) === 0 && !ADORN.test(s) && !/^(\.\.|[-*+•]\s)/.test(s)) {
        const u = nx.t.trim();
        if (u.length < s.length) warn(nx.n, `Title underline too short for "${s.slice(0, 60)}".`);
        out += section(s, 'u' + u[0], n);
        i += 2; continue;
      }
      if (!top && nx && ADORN.test(nx.t) && !ADORN.test(s) && nx.t.trim().length >= s.length) { warn(n, 'A section title inside a list, quote or directive is not allowed; shown as a heading-like line.'); out += `<p class="rubric" data-line="${n}">${inline(s, n)}</p>`; i += 2; continue; }
      // explicit markup
      if (/^\.\.(\s|$)/.test(s)) { const r = explicit(L, i); out += r.html; literalNext = false; i = r.next; continue; }
      if (/^__\s+\S/.test(s)) { i++; continue; } // anonymous target
      // grid table
      if (/^\+[-=]/.test(s) && /\+$/.test(s)) { let j = i; while (j < L.length && !blank(L[j].t) && /^[+|]/.test(L[j].t.trim())) j++; out += gridTable(L.slice(i, j), n); i = j; continue; }
      // simple table
      if (/^=+( +=+)+$/.test(s)) { const r = simpleTable(L, i); out += r.html; i = r.next; continue; }
      // bullet list
      let m = /^([-*+•‣⁃])( +|$)/.exec(t);
      if (m) { const r = list(L, i, /^([-*+•‣⁃])( +|$)/, m[1]); out += `<ul data-line="${n}">${r.items.map(x => `<li>${x}</li>`).join('')}</ul>`; i = r.next; continue; }
      // enumerated list
      const en = enumOf(t);
      if (en && (en.next || !nx || blank(nx.t) || ind(nx.t) > 0 || enumOf(nx.t))) {
        const r = list(L, i, null, en); const ty = en.type;
        const tattr = ty === 'la' ? ' type="a"' : ty === 'ua' ? ' type="A"' : ty === 'lr' ? ' type="i"' : ty === 'ur' ? ' type="I"' : '';
        out += `<ol${tattr}${en.value !== 1 ? ` start="${en.value | 0}"` : ''} data-line="${n}">${r.items.map(x => `<li>${x}</li>`).join('')}</ol>`; i = r.next; continue;
      }
      // field list
      if (/^:(?!:)([^:]|\\:)+:( +|$)/.test(t) && !/^:[\w.+-]+:`/.test(t)) {
        let j = i, rows = '';
        while (j < L.length && /^:(?!:)([^:]|\\:)+:( +|$)/.test(L[j].t)) {
          const fm = /^:((?:[^:]|\\:)+):(?: +|$)(.*)$/.exec(L[j].t);
          const r = takeIndented(L, j + 1, 0);
          const body = fm[2] ? [{ t: fm[2], n: L[j].n }, ...r.body] : r.body;
          rows += `<tr><th>${inline(fm[1], L[j].n)}</th><td>${blocks(body)}</td></tr>`;
          j = r.next; while (j < L.length && blank(L[j].t) && L[j + 1] && /^:(?!:)([^:]|\\:)+:( +|$)/.test(L[j + 1].t)) j++;
        }
        out += `<table class="fields" data-line="${n}">${rows}</table>`; i = j; continue;
      }
      // option list
      if (/^(-[A-Za-z0-9]|--[\w-]+|\/[A-Za-z])([ =][^ ]+)?( ?, ?(-[A-Za-z0-9]|--[\w-]+)([ =][^ ]+)?)*( {2,}\S|$)/.test(t) && (/ {2,}\S/.test(t) || (nx && ind(nx.t) > 0))) {
        let j = i, rows = '';
        while (j < L.length && /^(-[A-Za-z0-9]|--[\w-]+|\/[A-Za-z])/.test(L[j].t)) {
          const om = /^(.*?)(?: {2,}(.*))?$/.exec(L[j].t);
          const r = takeIndented(L, j + 1, 0);
          const body = om[2] ? [{ t: om[2], n: L[j].n }, ...r.body] : r.body;
          rows += `<tr><th><kbd class="opt">${esc(om[1])}</kbd></th><td>${blocks(body)}</td></tr>`;
          j = r.next; while (j < L.length && blank(L[j].t) && L[j + 1] && /^(-[A-Za-z0-9]|--[\w-]+)/.test(L[j + 1].t)) j++;
        }
        out += `<table class="fields opts" data-line="${n}">${rows}</table>`; i = j; continue;
      }
      // line block
      if (/^\|( |$)/.test(t)) {
        let j = i, ls = [];
        while (j < L.length && (/^\|( |$)/.test(L[j].t) || (!blank(L[j].t) && ind(L[j].t) > 0 && ls.length))) { if (/^\|/.test(L[j].t)) ls.push(L[j]); else ls[ls.length - 1] = { t: ls[ls.length - 1].t + ' ' + L[j].t.trim(), n: ls[ls.length - 1].n }; j++; }
        out += `<div class="lineblock" data-line="${n}">${ls.map(x => `<div>${inline(x.t.replace(/^\|\s?/, ''), x.n) || '&nbsp;'}</div>`).join('')}</div>`; i = j; continue;
      }
      // doctest block
      if (/^>>>( |$)/.test(t)) { let j = i; while (j < L.length && !blank(L[j].t)) j++; out += `<pre class="code" data-line="${n}"><code>${codeHtml(L.slice(i, j).map(x => x.t).join('\n'), 'pycon', {}).replace(/^<pre class="code"><code>|<\/code><\/pre>$/g, '')}</code></pre>`; stats.code++; i = j; continue; }
      // definition list: a text line with an indented line right after it
      if (nx && !blank(nx.t) && ind(nx.t) > 0) {
        let j = i, items = '';
        while (j < L.length && !blank(L[j].t) && ind(L[j].t) === 0 && L[j + 1] && !blank(L[j + 1].t) && ind(L[j + 1].t) > 0) {
          const parts = L[j].t.split(/ +: +/);
          const r = takeIndented(L, j + 1, 0);
          items += `<dt>${inline(parts[0], L[j].n)}${parts.slice(1).map(c => ` <span class="classifier">${inline(c, L[j].n)}</span>`).join('')}</dt><dd>${blocks(r.body)}</dd>`;
          j = r.next; while (j < L.length && blank(L[j].t)) j++;
          if (j < L.length && !(L[j + 1] && !blank(L[j + 1].t) && ind(L[j + 1].t) > 0 && ind(L[j].t) === 0)) break;
        }
        out += `<dl data-line="${n}">${items}</dl>`; i = j; continue;
      }
      // paragraph
      let j = i, para = [];
      while (j < L.length && !blank(L[j].t) && ind(L[j].t) === 0) { if (para.length && ADORN.test(L[j].t) && top) break; para.push(L[j].t); j++; }
      let text = para.join('\n');
      if (/::$/.test(text)) { literalNext = true; text = /^::$/.test(text.trim()) ? '' : /\s::$/.test(text) ? text.replace(/\s*::$/, '') : text.replace(/::$/, ':'); }
      if (text.trim()) { stats.words += text.split(/\s+/).length; out += `<p data-line="${n}">${inline(text, n)}</p>`; }
      i = j;
    }
    return out;
  }
  function section(title, style, n) {
    let lv = styles.indexOf(style);
    if (lv < 0) { styles.push(style); lv = styles.length - 1; const prev = sections.length ? sections[sections.length - 1].lv : -1; if (lv > prev + 1) warn(n, 'Title level inconsistent.'); }
    const id = uid(slug(title));
    const nm = norm(title); if (!secIds.has(nm)) secIds.set(nm, id);
    sections.push({ title, lv, id, n });
    const h = Math.min(6, lv + 1);
    return `<h${h} id="${id}" data-line="${n}">${inline(title, n)}</h${h}>`;
  }
  function enumOf(t) {
    const m = /^(\(?)(\d+|#|[a-zA-Z]|[ivxlcdm]+|[IVXLCDM]+)([.)])( +|$)/.exec(t);
    if (!m || (m[1] === '(' && m[3] !== ')')) return null;
    const v = m[2]; let type, value;
    if (/^\d+$/.test(v)) { type = 'ar'; value = +v; } else if (v === '#') { type = 'auto'; value = 1; }
    else if (/^[ivxlcdm]+$/.test(v) && (v !== 'i' && v.length > 1 || v === 'i')) { type = 'lr'; value = roman(v); }
    else if (/^[IVXLCDM]+$/.test(v) && (v.length > 1 || v === 'I')) { type = 'ur'; value = roman(v); }
    else if (/^[a-z]$/.test(v)) { type = 'la'; value = v.charCodeAt(0) - 96; } else if (/^[A-Z]$/.test(v)) { type = 'ua'; value = v.charCodeAt(0) - 64; } else return null;
    if (type === 'la' || type === 'ua') { if (m[3] === '.' && /^[A-Z]\. [A-Z]/.test(t)) return null; }
    return { type, value, width: m[0].length, re: new RegExp('^\\(?(\\d+|#|[a-zA-Z]|[ivxlcdmIVXLCDM]+)\\' + m[3] + '( +|$)') };
  }
  function roman(s) { const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }; let r = 0; s = s.toLowerCase(); for (let k = 0; k < s.length; k++) { const a = v[s[k]], b = v[s[k + 1]] || 0; r += a < b ? -a : a; } return r; }
  function list(L, i, re, en) {
    const items = []; let j = i;
    const markerRe = re || en.re;
    while (j < L.length) {
      const m = markerRe.exec(L[j].t);
      if (!m || ind(L[j].t) !== 0 || (re && m[1] !== en)) break;
      const w = m[0].length;
      const first = L[j].t.slice(w);
      let k = j + 1;
      while (k < L.length && (blank(L[k].t) || ind(L[k].t) >= Math.max(1, first ? w : 1))) k++;
      const rest = L.slice(j + 1, k);
      const body = first ? [{ t: first, n: L[j].n }, ...rest.map(x => ({ t: x.t.slice(Math.min(w, ind(x.t))), n: x.n }))] : dedent(rest);
      items.push(blocks(trimBlank(body)) || '&nbsp;');
      j = k; while (j < L.length && blank(L[j].t)) j++;
      if (j < L.length && !markerRe.test(L[j].t)) { while (j > 0 && blank(L[j - 1].t) && j > i) j--; break; }
    }
    // single-paragraph items render as plain text, like docutils compact lists
    return { items: items.map(x => /^<p data-line="\d+">((?:(?!<p[ >])[\s\S])*)<\/p>$/.test(x) ? x.replace(/^<p data-line="\d+">|<\/p>$/g, '') : x), next: j };
  }

  /* tables */
  function gridTable(T, n) {
    stats.tables++;
    const w = Math.max(...T.map(x => x.t.trimEnd().length)), g = T.map(x => x.t.trim().padEnd(w - ind(x.t), ' '));
    const H = g.length, W = g[0].length;
    const at = (r, c) => (g[r] || '')[c] || ' ';
    const cells = [], seen = new Set(), queue = [[0, 0]];
    let headEnd = -1;
    g.forEach((row, r) => { if (r && /^\+(=+\+)+$/.test(row.trim())) headEnd = r; });
    const scanCell = (top, left) => {
      for (let c = left + 1; c < W; c++) {
        const ch = at(top, c);
        if (ch === '+') {
          // go down from (top, c)
          for (let r = top + 1; r < H; r++) {
            const d = at(r, c);
            if (d === '+') {
              // go left along r back to left
              let ok = true; for (let x = c - 1; x > left; x--) { const e = at(r, x); if (e !== '-' && e !== '=' && e !== '+') { ok = false; break; } }
              if (ok && at(r, left) === '+') { let up = true; for (let y = r - 1; y > top; y--) { const e = at(y, left); if (e !== '|' && e !== '+') { up = false; break; } } if (up) return [r, c]; }
            } else if (d !== '|') break;
          }
        } else if (ch !== '-' && ch !== '=') return null;
      }
      return null;
    };
    try {
      if (!/^\+([-=]+\+)+$/.test(g[0].trim()) || !/^\+([-=]+\+)+$/.test(g[H - 1].trim())) throw new Error('border');
      while (queue.length && cells.length < 5000) {
        const [top, left] = queue.shift(); const key = top + ',' + left;
        if (seen.has(key) || top >= H - 1 || left >= W - 1) continue; seen.add(key);
        const br = scanCell(top, left); if (!br) continue;
        cells.push({ top, left, bottom: br[0], right: br[1] });
        queue.push([top, br[1]], [br[0], left]);
      }
      if (!cells.length) throw new Error('no cells');
      const rowsB = [...new Set(cells.flatMap(c => [c.top, c.bottom]))].sort((a, b) => a - b);
      const colsB = [...new Set(cells.flatMap(c => [c.left, c.right]))].sort((a, b) => a - b);
      const area = cells.reduce((a, c) => a + (c.bottom - c.top) * (c.right - c.left), 0);
      if (area !== (H - 1) * (W - 1)) throw new Error('gaps');
      const byRow = new Map();
      for (const c of cells) { const r = rowsB.indexOf(c.top); if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(c); }
      let html = `<div class="tblx" data-line="${n}"><table class="rtab">`, inHead = headEnd > 0;
      html += inHead ? '<thead>' : '<tbody>';
      for (let r = 0; r < rowsB.length - 1; r++) {
        if (inHead && rowsB[r] >= headEnd) { html += '</thead><tbody>'; inHead = false; }
        const cs = (byRow.get(r) || []).sort((a, b) => a.left - b.left);
        html += '<tr>' + cs.map(c => {
          const rs = rowsB.indexOf(c.bottom) - r, cs2 = colsB.indexOf(c.right) - colsB.indexOf(c.left);
          const body = []; for (let y = c.top + 1; y < c.bottom; y++) body.push({ t: g[y].slice(c.left + 1, c.right).replace(/\s+$/, ''), n: T[y].n });
          const tag = c.top < headEnd ? 'th' : 'td';
          return `<${tag}${rs > 1 ? ` rowspan="${rs}"` : ''}${cs2 > 1 ? ` colspan="${cs2}"` : ''}>${blocks(dedent(trimBlank(body.map(x => ({ t: ' ' + x.t, n: x.n })))))}</${tag}>`;
        }).join('') + '</tr>';
      }
      html += (inHead ? '</thead>' : '</tbody>') + '</table></div>';
      return html.replace(/<(t[dh])([^>]*)><p data-line="\d+">((?:(?!<p[ >])[\s\S])*)<\/p><\/t[dh]>/g, '<$1$2>$3</$1>');
    } catch (e) {
      warn(n, 'Malformed grid table: ' + (e.message === 'gaps' ? 'the cell borders do not line up' : e.message === 'border' ? 'the top or bottom border is broken' : 'no cells found') + '. Shown as text.');
      return `<pre class="code lit bad" data-line="${n}"><code>${esc(T.map(x => x.t).join('\n'))}</code></pre>`;
    }
  }
  function simpleTable(L, i) {
    stats.tables++;
    const n = L[i].n, border = L[i].t;
    const cols = []; const re = /=+/g; let m; while ((m = re.exec(border))) cols.push([m.index, m.index + m[0].length]);
    const isB = s => /^=+( +=+)+$/.test(s.trim()) && ind(s) === ind(border);
    let j = i + 1, rows = [], borders = [i];
    while (j < L.length) {
      const t = L[j].t;
      if (isB(t)) { borders.push(j); j++; if (j >= L.length || blank(L[j].t)) break; continue; }
      if (blank(t)) { if (j + 1 < L.length && !blank(L[j + 1].t) && borders.length < 3) { j++; continue; } if (borders.length >= 2 && (j + 1 >= L.length || blank(L[j + 1].t) || !isB(L[j + 1].t) && borders.length >= 2)) { if (borders.length === 2 || borders.length === 3) break; } j++; continue; }
      if (/^-+( +-+)*$/.test(t.trim())) { j++; continue; } // column span underline, spans are flattened
      rows.push({ j, t, n: L[j].n }); j++;
    }
    if (borders.length < 2) { warn(n, 'Malformed simple table: no closing border.'); return { html: `<pre class="code lit bad" data-line="${n}"><code>${esc(L.slice(i, j).map(x => x.t).join('\n'))}</code></pre>`, next: j }; }
    const cut = s => cols.map((c, k) => (k === cols.length - 1 ? s.slice(c[0]) : s.slice(c[0], cols[k + 1][0])).trim());
    const head = borders.length >= 3 ? rows.filter(r => r.j < borders[1]) : [];
    const bodyRows = rows.filter(r => !head.includes(r));
    const merge = rs => { const out = []; for (const r of rs) { const c = cut(r.t); if (out.length && !c[0] && r.t.slice(0, cols[0][1]).trim() === '') out[out.length - 1] = out[out.length - 1].map((x, k) => (x + ' ' + (c[k] || '')).trim()); else out.push(c); } return out; };
    let html = `<div class="tblx" data-line="${n}"><table class="rtab">`;
    if (head.length) html += '<thead>' + merge(head).map(r => '<tr>' + r.map(c => `<th>${inline(c, n)}</th>`).join('') + '</tr>').join('') + '</thead>';
    html += '<tbody>' + merge(bodyRows).map(r => '<tr>' + r.map(c => `<td>${inline(c, n)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
    return { html, next: Math.max(j, borders[borders.length - 1] + 1) };
  }

  /* explicit markup: directives, footnotes, citations, targets, substitution definitions, comments */
  function explicit(L, i) {
    const { t, n } = L[i];
    const r = takeIndented(L, i + 1, 0);
    let m;
    if ((m = /^\.\. _/.exec(t))) { const nm = /^\.\. _(`[^`]+`|[^:]+):\s*$/.exec(t); return { html: nm ? `<span id="${uid('label-' + slug(nm[1].replace(/^`|`$/g, '')))}" class="anchor"></span>` : '', next: r.next }; }
    if (/^\.\. \|[^|]+\|/.test(t)) return { html: '', next: r.next };
    if ((m = /^\.\. __:/.exec(t))) return { html: '', next: r.next };
    if ((m = /^\.\. \[(#[\w-]*|\*|\d+|[A-Za-z][\w.-]*)\]\s*(.*)$/.exec(t))) {
      const l = m[1]; let lab, id, cls = 'footnote';
      if (l.startsWith('#')) { lab = String(++autoDef); id = 'fn-' + lab; }
      else if (l === '*') { lab = SYMBOLS[symDef % 10].repeat(1 + Math.floor(symDef / 10)); id = 'fns-' + symDef++; }
      else if (/^\d+$/.test(l)) { lab = l; id = 'fn-' + l; }
      else { lab = l; id = 'cit-' + slug(l); cls = 'footnote citation'; }
      stats.footnotes++;
      const body = m[2] ? [{ t: m[2], n }, ...r.body] : r.body;
      return { html: `<div class="${cls}" id="${uid(id)}" data-line="${n}"><span class="fnlabel">[${esc(lab)}]</span><div>${blocks(body)}</div></div>`, next: r.next };
    }
    if ((m = /^\.\.\s+([\w:.+-]+)::\s*(.*)$/.exec(t))) return { html: directive(m[1].toLowerCase(), m[2].trim(), r.body, n), next: r.next };
    return { html: '', next: r.next }; // comment
  }
  function splitDirective(body) {
    const opts = {}; let k = 0;
    while (k < body.length && /^:([\w-]+):(?:\s+(.*))?$/.test(body[k].t)) { const m = /^:([\w-]+):(?:\s+(.*))?$/.exec(body[k].t); opts[m[1].toLowerCase()] = (m[2] || '').trim(); k++; }
    let argMore = [];
    if (!Object.keys(opts).length) { while (k < body.length && !blank(body[k].t) && false) k++; }
    return { opts, content: trimBlank(body.slice(k)), argMore };
  }
  let defaultLang = '';
  function box(cls, title, inner, n) { return `<div class="dbox ${cls}" data-line="${n}"><p class="dtitle">${title}</p>${inner}</div>`; }
  function directive(name, arg, body, n) {
    const base = name.replace(/^(py|rst|c|cpp|js|std|sphinx):/, '');
    stats.directives[base] = (stats.directives[base] || 0) + 1;
    const { opts, content } = splitDirective(body);
    const text = () => content.map(x => x.t).join('\n');
    switch (base) {
      case 'code': case 'code-block': case 'sourcecode': case 'literalinclude-shown': {
        stats.code++;
        const lang = arg || defaultLang;
        const cap = opts.caption ? `<p class="dtitle">${inline(opts.caption, n)}</p>` : '';
        return `<figure class="codebox" data-line="${n}">${cap}${lang ? `<span class="lang">${esc(lang)}</span>` : ''}${codeHtml(dedent(content).map(x => x.t).join('\n'), lang, opts)}</figure>`;
      }
      case 'highlight': defaultLang = arg; return '';
      case 'parsed-literal': return `<pre class="code lit" data-line="${n}"><code>${inline(text(), n)}</code></pre>`;
      case 'literalinclude': case 'include': stats.code += base === 'literalinclude' ? 1 : 0;
        return box('note', base === 'include' ? 'include' : 'literalinclude', `<p>${esc(arg)} is not shown here: this page reads only the file you opened, never other files on your computer.</p>`, n);
      case 'math': stats.code++; return `<div class="math" data-line="${n}" title="Math source (LaTeX)">${esc((arg ? arg + '\n' : '') + text())}</div>`;
      case 'image': case 'figure': {
        stats.images++;
        const alt = opts.alt || '';
        const remote = /^https?:/i.test(arg);
        const ph = `<div class="imgph" title="${esc('Picture: ' + arg)}"><span>${remote ? 'Remote picture, not loaded' : 'Picture'}</span> <code>${esc(arg)}</code>${alt ? `<br><span class="mut">${esc(alt)}</span>` : ''}</div>`;
        if (base === 'image') return `<div class="figure" data-line="${n}">${ph}</div>`;
        return `<figure class="figure" data-line="${n}">${ph}${content.length ? `<figcaption>${blocks(content)}</figcaption>` : ''}</figure>`;
      }
      case 'admonition': return box('note', inline(arg || 'Note', n), blocks(content), n);
      case 'deprecated': case 'versionadded': case 'versionchanged': case 'versionremoved': {
        const label = { deprecated: 'Deprecated since version', versionadded: 'New in version', versionchanged: 'Changed in version', versionremoved: 'Removed in version' }[base];
        const parts = arg.split(/\s+/); const ver = parts.shift() || '';
        return `<div class="vbox" data-line="${n}"><p><em>${label} ${esc(ver)}${parts.length || content.length ? ':' : '.'}</em> ${inline(parts.join(' '), n)}</p>${blocks(content)}</div>`;
      }
      case 'contents': { const k = tocAt.length; tocAt.push({ depth: parseInt(opts.depth, 10) || 9, title: arg || 'Contents', local: 'local' in opts }); return `\u0002TOC${k}\u0002`; }
      case 'sectnum': case 'meta': case 'index': case 'default-role': case 'role': case 'title': case 'tabularcolumns': case 'currentmodule': case 'module': case 'moduleauthor': case 'sectionauthor': case 'codeauthor': case 'default-domain': case 'raw-latex': return '';
      case 'topic': case 'sidebar': return box(base, inline(arg || base, n), blocks(content), n);
      case 'rubric': return `<p class="rubric" data-line="${n}">${inline(arg, n)}</p>`;
      case 'epigraph': case 'highlights': case 'pull-quote': return `<blockquote class="${base}" data-line="${n}">${blocks(content)}</blockquote>`;
      case 'compound': case 'container': case 'only': case 'ifconfig': case 'hlist': case 'centered': case 'tab': case 'tabs': case 'group-tab': case 'card': case 'grid': case 'grid-item-card': case 'dropdown':
        return `<div class="ctr" data-line="${n}">${base === 'centered' ? `<p class="center"><strong>${inline(arg, n)}</strong></p>` : (base === 'dropdown' || base === 'tab' || base === 'group-tab' || base === 'card' || base === 'grid-item-card') && arg ? `<p class="dtitle">${inline(arg, n)}</p>` : ''}${blocks(content)}</div>`;
      case 'line-block': return `<div class="lineblock" data-line="${n}">${content.map(x => `<div>${inline(x.t, x.n) || '&nbsp;'}</div>`).join('')}</div>`;
      case 'toctree': {
        const ents = content.filter(x => !blank(x.t)).map(x => x.t.trim());
        return box('toctree', 'toctree' + (opts.caption ? ': ' + esc(opts.caption) : ''), ents.length ? '<ul>' + ents.map(e => { const p = /^(.*?)\s*<([^<>]+)>$/.exec(e); return `<li><span class="xref" title="${esc('Document: ' + (p ? p[2] : e))}">${esc(p ? p[1] : e)}</span></li>`; }).join('') + '</ul>' : '<p class="mut">No entries (glob or hidden).</p>', n);
      }
      case 'csv-table': {
        stats.tables++;
        if (opts.file || opts.url) return box('note', 'csv-table', `<p>${esc(opts.file || opts.url)} is not read here: the page reads only the file you opened.</p>`, n);
        const rows = csvRows(text(), opts.delim);
        const head = opts.header ? csvRows(opts.header, opts.delim)[0] : null; const hr = parseInt(opts['header-rows'], 10) || 0;
        return tableHtml(arg, head ? [head, ...rows] : rows, head ? 1 : hr, n);
      }
      case 'list-table': {
        stats.tables++;
        const rows = []; let cur = null;
        for (const x of content) {
          const m1 = /^\*\s+-\s+(.*)$/.exec(x.t) || (/^\*\s+-\s*$/.test(x.t) ? [x.t, ''] : null);
          if (m1) { cur = [[{ t: m1[1], n: x.n }]]; rows.push(cur); continue; }
          const m2 = /^ {2}-(?:\s+(.*))?$/.exec(x.t);
          if (m2 && cur) { cur.push([{ t: m2[1] || '', n: x.n }]); continue; }
          if (cur && cur.length) cur[cur.length - 1].push({ t: x.t.replace(/^ {4}/, ''), n: x.n });
        }
        if (!rows.length) { warn(n, 'Malformed list-table: no rows.'); return ''; }
        const hr = parseInt(opts['header-rows'], 10) || 0;
        const strip = h => h.replace(/^<p data-line="\d+">((?:(?!<p[ >])[\s\S])*)<\/p>$/, '$1');
        return `<div class="tblx" data-line="${n}"><table class="rtab">${arg ? `<caption>${inline(arg, n)}</caption>` : ''}` + rows.map((r, k) => '<tr>' + r.map(c => { const tg = k < hr ? 'th' : 'td'; return `<${tg}>${strip(blocks(trimBlank(c)))}</${tg}>`; }).join('') + '</tr>').join('') + '</table></div>';
      }
      case 'table': return `<div class="tcap" data-line="${n}">${arg ? `<p class="dtitle">${inline(arg, n)}</p>` : ''}${blocks(content)}</div>`;
      case 'raw': return box('raw', 'raw ' + esc(arg), `<pre class="code lit"><code>${esc(text())}</code></pre><p class="small mut">Raw ${esc(arg || 'content')} is shown as text, never run.</p>`, n);
      case 'glossary': return `<div class="glossary" data-line="${n}">${blocks(content)}</div>`;
      case 'note': case 'warning': case 'tip': case 'important': case 'attention': case 'danger': case 'error': case 'hint': case 'caution': case 'seealso': case 'todo':
        return box(base, ADMON[base], blocks(arg ? [{ t: arg, n }, ...(content.length ? [{ t: '', n }] : []), ...content] : content), n);
      case 'automodule': case 'autoclass': case 'autofunction': case 'automethod': case 'autoattribute': case 'autodata': case 'autoexception': case 'autosummary': case 'autoprogram': case 'click': case 'argparse':
        return box('auto', esc(base) + ' <code>' + esc(arg) + '</code>', '<p class="small mut">Sphinx makes this text from Python code when it builds the docs. A preview without Python cannot show it.</p>' + blocks(content), n);
      case 'function': case 'class': case 'method': case 'attribute': case 'data': case 'exception': case 'decorator': case 'staticmethod': case 'classmethod': case 'property': case 'module-level': case 'envvar': case 'option': case 'program': case 'cmdoption': case 'describe': case 'object': case 'type': case 'member': case 'macro': case 'var': case 'struct': case 'enum': case 'confval':
        return `<dl class="desc" data-line="${n}"><dt><em class="dkind">${esc(base)}</em> <code>${esc(arg)}</code></dt><dd>${blocks(content)}</dd></dl>`;
      case 'unicode': case 'replace': case 'date': return '';
      default:
        warn(n, `Unknown directive type "${name}".`);
        return box('unknown', 'Unknown directive: ' + esc(name), `<pre class="code lit"><code>${esc((arg ? arg + '\n' : '') + body.map(x => x.t).join('\n'))}</code></pre>`, n);
    }
  }
  function csvRows(s, delim) {
    const d = !delim ? ',' : delim === 'tab' ? '\t' : delim === 'space' ? ' ' : delim[0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i <= s.length; i++) {
      const c = s[i];
      if (c === undefined) { if (cell.trim() || row.length) { row.push(cell.trim()); rows.push(row); } break; }
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"' && !cell.trim()) { q = true; cell = ''; }
      else if (c === d) { row.push(cell.trim()); cell = ''; }
      else if (c === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    return rows;
  }
  function tableHtml(cap, rows, hr, n) {
    return `<div class="tblx" data-line="${n}"><table class="rtab">${cap ? `<caption>${inline(cap, n)}</caption>` : ''}` + rows.map((r, k) => '<tr>' + r.map(c => k < hr ? `<th>${inline(c, n)}</th>` : `<td>${inline(c, n)}</td>`).join('') + '</tr>').join('') + '</table></div>';
  }

  let html = blocks(L0, true);
  // section refs, then the contents directive
  html = html.replace(/#\u0001(\d+)\u0001/g, (x, k) => '#' + (secIds.get(pendingRefs[+k]) || ''));
  html = html.replace(/\u0002TOC(\d+)\u0002/g, (x, k) => {
    const o = tocAt[+k]; if (!sections.length) return '';
    let s = '', depth = -1;
    // a lone top title is the document title (as docutils does): the contents list starts below it
    const docTitle = sections.filter(x => x.lv === sections[0].lv).length === 1 && sections.length > 1 ? sections[0] : null;
    const list = sections.filter(x => x !== docTitle);
    const min = Math.min(...list.map(x => x.lv));
    for (const sec of list) {
      const lv = sec.lv - min; if (lv >= o.depth) continue;
      while (depth < lv) { s += '<ul>'; depth++; } while (depth > lv) { s += '</ul>'; depth--; }
      s += `<li><a href="#${sec.id}">${esc(sec.title)}</a></li>`;
    }
    while (depth-- >= 0) s += '</ul>';
    return `<nav class="dbox toc"><p class="dtitle">${esc(o.title)}</p>${s}</nav>`;
  });
  return { html, sections, problems, stats, lines: lines.length, title: sections.length ? sections[0].title : '' };
}

/* ---------- UI ---------- */
let cur = null, curName = '', curText = '';
function show(file, text) {
  const t0 = performance.now();
  const r = render(text);
  cur = r; curName = file.name; curText = text;
  $('doc').innerHTML = r.html;   // every file string in r.html was escaped by esc()
  for (const a of $('doc').querySelectorAll('a[href^="#"]')) a.addEventListener('click', e => { const id = a.getAttribute('href').slice(1); const tg = id && document.getElementById(id); if (tg && $('doc').contains(tg)) { e.preventDefault(); tg.scrollIntoView({ block: 'start' }); } });
  $('fname').textContent = file.name;
  $('fmeta').textContent = size(file.size) + ' · ' + plural(r.lines, 'line') + (r.title ? ' · ' + r.title : '');
  // outline
  const ol = $('outline'); ol.replaceChildren();
  const min = r.sections.length ? Math.min(...r.sections.map(s => s.lv)) : 0;
  for (const s of r.sections.slice(0, 2000)) {
    const li = el('li'), b = el('button', s.title); b.type = 'button'; b.className = 'lv' + Math.min(5, s.lv - min);
    b.title = 'Line ' + s.n; b.addEventListener('click', () => goTo(s.id, s.n));
    li.append(b); ol.append(li);
  }
  if (!r.sections.length) ol.append(el('li', 'No section titles.', 'mut small'));
  // problems
  const pl = $('probs'); pl.replaceChildren();
  $('probHead').textContent = r.problems.length ? 'Problems (' + int(r.problems.length) + ')' : 'Problems';
  for (const p of r.problems) {
    const li = el('li'), b = el('button'); b.type = 'button';
    b.append(el('span', 'Line ' + p.n, 'pl'), ' ' + p.t);
    b.addEventListener('click', () => goTo(null, p.n));
    li.append(b); pl.append(li);
  }
  if (!r.problems.length) pl.append(el('li', 'None found.', 'mut small'));
  // stats
  const st = $('stats'); st.replaceChildren();
  const kv = (k, v) => { const tr = el('tr'); tr.append(el('th', k), el('td', v)); st.append(tr); };
  kv('Sections', int(r.sections.length));
  const ds = Object.entries(r.stats.directives).sort((a, b) => b[1] - a[1]);
  kv('Directives', ds.length ? ds.slice(0, 12).map(([k, v]) => k + (v > 1 ? ' ×' + v : '')).join(', ') + (ds.length > 12 ? ', ...' : '') : 'none');
  kv('Tables', int(r.stats.tables)); kv('Code blocks', int(r.stats.code)); kv('Links', int(r.stats.links));
  if (r.stats.images) kv('Pictures', int(r.stats.images) + ' (placeholders)');
  if (r.stats.footnotes) kv('Footnotes', int(r.stats.footnotes));
  kv('Words', int(r.stats.words));
  if (!$('srcBox').hidden) fillSource();
  $('drop').hidden = true; $('view').hidden = false;
  say(`Opened in ${Math.round(performance.now() - t0)} ms. ${plural(r.sections.length, 'section')}, ${plural(r.problems.length, 'problem')}.`);
  self.zovoState = { sections: r.sections.length, problems: r.problems.map(p => p.n + ': ' + p.t), stats: r.stats, title: r.title };
}
function goTo(id, line) {
  if (!$('srcBox').hidden) { const row = $('src').querySelector(`tr[data-n="${line}"]`); if (row) { for (const x of $('src').querySelectorAll('tr.on')) x.classList.remove('on'); row.classList.add('on'); row.scrollIntoView({ block: 'center' }); } return; }
  let tg = id ? document.getElementById(id) : null;
  if (!tg) { let best = null; for (const e of $('doc').querySelectorAll('[data-line]')) { const n = +e.dataset.line; if (n <= line && (!best || n >= +best.dataset.line)) best = e; } tg = best; }
  if (tg) { tg.scrollIntoView({ block: 'start' }); tg.classList.add('flash'); setTimeout(() => tg.classList.remove('flash'), 1200); }
}
function fillSource() {
  const tb = $('src'); tb.replaceChildren();
  const ls = curText.replace(/\r\n?/g, '\n').split('\n'), max = 50000, frag = document.createDocumentFragment();
  const bad = new Set(cur.problems.map(p => p.n));
  for (let k = 0; k < Math.min(ls.length, max); k++) { const tr = el('tr'); tr.dataset.n = k + 1; if (bad.has(k + 1)) tr.className = 'bad'; tr.append(el('td', String(k + 1), 'no'), el('td', ls[k])); frag.append(tr); }
  tb.append(frag);
  if (ls.length > max) { const tr = el('tr'); tr.append(el('td', ''), el('td', 'The source view shows the first ' + int(max) + ' lines.', 'mut')); tb.append(tr); }
}
function tab(src) {
  $('doc').hidden = src; $('srcBox').hidden = !src;
  $('tabPrev').setAttribute('aria-pressed', String(!src)); $('tabSrc').setAttribute('aria-pressed', String(src));
  if (src && cur) fillSource();
}
$('tabPrev').addEventListener('click', () => tab(false));
$('tabSrc').addEventListener('click', () => tab(true));
$('save').addEventListener('click', () => {
  if (!cur) return;
  const title = cur.title || curName;
  const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(title)}</title><style>${EXPORT_CSS}</style></head>` +
    `<body><main class="rstdoc">${cur.html}</main></body></html>`;
  const a = el('a'); a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' })); a.download = curName.replace(/\.(rst|rest|txt)$/i, '') + '.html';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  say('Saved ' + a.download + ': one HTML file with no scripts that opens in any browser.');
});
const EXPORT_CSS = 'body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b1f24;background:#fff}.rstdoc{max-width:860px;margin:0 auto;padding:24px}' +
  'h1,h2{border-bottom:1px solid #d9dee5;padding-bottom:.2em}pre,code,kbd{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em}code{background:#eef1f5;padding:.1em .3em;border-radius:4px}' +
  'pre{background:#eef1f5;padding:10px 12px;border-radius:6px;overflow:auto}pre code{background:none;padding:0}.ln{display:block}.ln.em{background:#fff3c4}.no{display:inline-block;width:3em;color:#8a94a0;user-select:none}' +
  '.tk{color:#8250df}.ts{color:#0a3069}.tc{color:#6e7781;font-style:italic}.tn{color:#0550ae}table.rtab{border-collapse:collapse;margin:10px 0}.rtab th,.rtab td{border:1px solid #d9dee5;padding:4px 8px;vertical-align:top}.rtab th{background:#f5f7fa}' +
  '.fields th{text-align:left;padding-right:12px;vertical-align:top}.dbox{border:1px solid #d9dee5;border-left:4px solid #0b62d6;border-radius:6px;padding:4px 12px;margin:10px 0;background:#f5f7fa}.dbox.warning,.dbox.danger,.dbox.error,.dbox.caution,.dbox.attention,.dbox.unknown{border-left-color:#c2410c}.dtitle{font-weight:600;margin:6px 0}' +
  '.imgph{border:1px dashed #9aa3ae;padding:16px;border-radius:6px;color:#5b6470;text-align:center}.math{font-family:ui-monospace,Menlo,monospace;background:#f5f7fa;padding:8px 12px;border-radius:6px;white-space:pre-wrap}.footnote{display:flex;gap:8px;font-size:.92em}.fnlabel{color:#5b6470}.xref{color:#0b62d6}.bad{color:#9a3412}.lang{font-size:12px;color:#5b6470}blockquote{margin:8px 0;padding:0 14px;border-left:3px solid #d9dee5}.vbox{border-left:3px solid #9aa3ae;padding-left:10px}a{color:#0b62d6}';

/* ---------- open ---------- */
async function open(file, force) {
  if (!file.size) { say('This file is empty.', true); return; }
  if (file.size > MAXMB * 1048576 && !force) {
    $('msg').replaceChildren(el('span', `This file is ${size(file.size)}. Files up to ${MAXMB} MB render at once. `));
    const b = el('button', 'Render anyway'); b.type = 'button'; b.className = 'link'; b.addEventListener('click', () => open(file, true));
    $('msg').append(b); $('msg').className = 'warn'; return;
  }
  say('Reading ' + file.name + ' ...');
  try {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4096));
    if (u8.includes(0)) throw new Error('This file looks binary, not reStructuredText text.');
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
    show(file, text);
  } catch (e) { say(e.message || String(e), true); }
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
