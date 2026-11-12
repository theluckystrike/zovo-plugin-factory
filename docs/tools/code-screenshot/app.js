/* Zovo Code Screenshot Online (TOOLCHK3, wave18). Your code stays in this tab: the page CSP sets connect-src 'none'.
   highlight.js 11.12.0 (cdn.jsdelivr.net, pinned, SRI in the import map) colors the code; its HTML result is parsed
   in an inert DOMParser document only to read the token classes, and the picture is built from DOM text nodes as one
   SVG, so code with <script> or </svg> stays text. The PNG is that SVG drawn on a canvas at 1x to 4x. The layout and
   drawing follow the Code Screenshot extension for VS Code (MIT): common indent, wrapping, line numbers, frames,
   backgrounds, highlighted lines and marked words. */
import hljs from 'highlight.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const SVGNS = 'http://www.w3.org/2000/svg';
const XMLNS = 'http://www.w3.org/XML/1998/namespace';
const MAX_SIDE = 16384, MAX_AREA = 120e6;   // canvas limits, as in the extension
const MAX_LINES = 1000, MAX_LINE = 1000, MAX_BYTES = 5 * 1024 * 1024;
const FONT = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", monospace';

/* ---------- theme of the page ---------- */
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

/* ---------- color schemes for the code (token class -> color; style bit 1 italic, 2 bold) ---------- */
const SCHEMES = {
  'dark-modern': { name: 'Dark Modern', background: '#1f1f1f', foreground: '#cccccc', lineNumber: '#6e7681', mark: '#623315',
    t: { keyword: '#569cd6', 'keyword.control': '#c586c0', built_in: '#4ec9b0', type: '#4ec9b0', literal: '#569cd6', number: '#b5cea8', string: '#ce9178', regexp: '#d16969', comment: ['#6a9955', 0], doctag: '#569cd6',
      meta: '#9cdcfe', title: '#dcdcaa', 'title.class_': '#4ec9b0', 'title.function_': '#dcdcaa', params: '#9cdcfe', attr: '#9cdcfe', attribute: '#9cdcfe', variable: '#9cdcfe', 'variable.language': '#569cd6', property: '#9cdcfe',
      symbol: '#b5cea8', tag: '#808080', name: '#569cd6', 'selector-tag': '#d7ba7d', 'selector-class': '#d7ba7d', 'selector-id': '#d7ba7d', section: ['#569cd6', 2], bullet: '#6796e6', link: '#ce9178', subst: '#cccccc', 'template-variable': '#9cdcfe', addition: '#b5cea8', deletion: '#ce9178', emphasis: ['#cccccc', 1], strong: ['#cccccc', 2], operator: '#d4d4d4', 'char.escape_': '#d7ba7d', quote: '#6a9955' } },
  'light-modern': { name: 'Light Modern', background: '#ffffff', foreground: '#3b3b3b', lineNumber: '#6e7681', mark: '#f6e3a8',
    t: { keyword: '#0000ff', 'keyword.control': '#af00db', built_in: '#267f99', type: '#267f99', literal: '#0000ff', number: '#098658', string: '#a31515', regexp: '#811f3f', comment: ['#008000', 0], doctag: '#0000ff',
      meta: '#0070c1', title: '#795e26', 'title.class_': '#267f99', 'title.function_': '#795e26', params: '#001080', attr: '#e50000', attribute: '#e50000', variable: '#001080', 'variable.language': '#0000ff', property: '#001080',
      symbol: '#098658', tag: '#800000', name: '#800000', 'selector-tag': '#800000', 'selector-class': '#800000', 'selector-id': '#800000', section: ['#0000ff', 2], bullet: '#0451a5', link: '#a31515', subst: '#3b3b3b', 'template-variable': '#001080', addition: '#098658', deletion: '#a31515', emphasis: ['#3b3b3b', 1], strong: ['#3b3b3b', 2], operator: '#3b3b3b', 'char.escape_': '#ee0000', quote: '#008000' } },
  'monokai': { name: 'Monokai', background: '#272822', foreground: '#f8f8f2', lineNumber: '#90908a', mark: '#5b5a3e',
    t: { keyword: '#f92672', built_in: '#66d9ef', type: ['#66d9ef', 1], literal: '#ae81ff', number: '#ae81ff', string: '#e6db74', regexp: '#e6db74', comment: '#88846f', doctag: '#88846f', meta: '#f8f8f2', title: '#a6e22e', 'title.class_': '#a6e22e', 'title.function_': '#a6e22e',
      params: ['#fd971f', 1], attr: '#a6e22e', attribute: '#a6e22e', variable: '#f8f8f2', 'variable.language': ['#fd971f', 1], property: '#f8f8f2', symbol: '#ae81ff', tag: '#f8f8f2', name: '#f92672', 'selector-tag': '#f92672', 'selector-class': '#a6e22e', 'selector-id': '#a6e22e', section: '#a6e22e', bullet: '#ae81ff',
      link: '#e6db74', subst: '#f8f8f2', 'template-variable': '#f8f8f2', addition: '#a6e22e', deletion: '#f92672', emphasis: ['#f8f8f2', 1], strong: ['#f8f8f2', 2], operator: '#f92672', 'char.escape_': '#ae81ff', quote: '#88846f' } },
  'dracula': { name: 'Dracula', background: '#282a36', foreground: '#f8f8f2', lineNumber: '#6272a4', mark: '#44475a',
    t: { keyword: '#ff79c6', built_in: ['#8be9fd', 1], type: ['#8be9fd', 1], literal: '#bd93f9', number: '#bd93f9', string: '#f1fa8c', regexp: '#ff5555', comment: '#6272a4', doctag: '#6272a4', meta: '#f8f8f2', title: '#50fa7b', 'title.class_': '#8be9fd', 'title.function_': '#50fa7b',
      params: ['#ffb86c', 1], attr: '#50fa7b', attribute: '#50fa7b', variable: '#f8f8f2', 'variable.language': ['#bd93f9', 1], property: '#f8f8f2', symbol: '#bd93f9', tag: '#ff79c6', name: '#ff79c6', 'selector-tag': '#ff79c6', 'selector-class': '#50fa7b', 'selector-id': '#50fa7b', section: ['#bd93f9', 2], bullet: '#8be9fd',
      link: '#8be9fd', subst: '#f8f8f2', 'template-variable': '#f8f8f2', addition: '#50fa7b', deletion: '#ff5555', emphasis: ['#f1fa8c', 1], strong: ['#ffb86c', 2], operator: '#ff79c6', 'char.escape_': '#ff79c6', quote: '#6272a4' } },
  'github-light': { name: 'GitHub Light', background: '#ffffff', foreground: '#1f2328', lineNumber: '#8c959f', mark: '#fff8c5',
    t: { keyword: '#cf222e', built_in: '#953800', type: '#953800', literal: '#0550ae', number: '#0550ae', string: '#0a3069', regexp: '#116329', comment: '#6e7781', doctag: '#cf222e', meta: '#0550ae', title: '#8250df', 'title.class_': '#953800', 'title.function_': '#8250df',
      params: '#1f2328', attr: '#0550ae', attribute: '#0550ae', variable: '#953800', 'variable.language': '#cf222e', property: '#0550ae', symbol: '#0550ae', tag: '#116329', name: '#116329', 'selector-tag': '#116329', 'selector-class': '#6639ba', 'selector-id': '#6639ba', section: ['#0550ae', 2], bullet: '#953800',
      link: '#0a3069', subst: '#1f2328', 'template-variable': '#953800', addition: '#116329', deletion: '#82071e', emphasis: ['#1f2328', 1], strong: ['#1f2328', 2], operator: '#cf222e', 'char.escape_': '#0a3069', quote: '#116329' } },
  'github-dark': { name: 'GitHub Dark', background: '#0d1117', foreground: '#e6edf3', lineNumber: '#6e7681', mark: '#bb800966',
    t: { keyword: '#ff7b72', built_in: '#ffa657', type: '#ffa657', literal: '#79c0ff', number: '#79c0ff', string: '#a5d6ff', regexp: '#7ee787', comment: '#8b949e', doctag: '#ff7b72', meta: '#79c0ff', title: '#d2a8ff', 'title.class_': '#ffa657', 'title.function_': '#d2a8ff',
      params: '#e6edf3', attr: '#79c0ff', attribute: '#79c0ff', variable: '#ffa657', 'variable.language': '#ff7b72', property: '#79c0ff', symbol: '#79c0ff', tag: '#7ee787', name: '#7ee787', 'selector-tag': '#7ee787', 'selector-class': '#d2a8ff', 'selector-id': '#d2a8ff', section: ['#1f6feb', 2], bullet: '#f2cc60',
      link: '#a5d6ff', subst: '#e6edf3', 'template-variable': '#ffa657', addition: '#aff5b4', deletion: '#ffdcd7', emphasis: ['#e6edf3', 1], strong: ['#e6edf3', 2], operator: '#ff7b72', 'char.escape_': '#a5d6ff', quote: '#7ee787' } },
  'solarized-light': { name: 'Solarized Light', background: '#fdf6e3', foreground: '#657b83', lineNumber: '#93a1a1', mark: '#eee8d5',
    t: { keyword: '#859900', built_in: '#b58900', type: '#b58900', literal: '#2aa198', number: '#d33682', string: '#2aa198', regexp: '#dc322f', comment: ['#93a1a1', 1], doctag: '#859900', meta: '#cb4b16', title: '#268bd2', 'title.class_': '#b58900', 'title.function_': '#268bd2',
      params: '#657b83', attr: '#b58900', attribute: '#b58900', variable: '#268bd2', 'variable.language': '#b58900', property: '#268bd2', symbol: '#d33682', tag: '#268bd2', name: '#268bd2', 'selector-tag': '#859900', 'selector-class': '#268bd2', 'selector-id': '#268bd2', section: ['#cb4b16', 2], bullet: '#cb4b16',
      link: '#2aa198', subst: '#657b83', 'template-variable': '#268bd2', addition: '#859900', deletion: '#dc322f', emphasis: ['#657b83', 1], strong: ['#657b83', 2], operator: '#859900', 'char.escape_': '#dc322f', quote: '#93a1a1' } },
  'solarized-dark': { name: 'Solarized Dark', background: '#002b36', foreground: '#839496', lineNumber: '#586e75', mark: '#073642',
    t: { keyword: '#859900', built_in: '#b58900', type: '#b58900', literal: '#2aa198', number: '#d33682', string: '#2aa198', regexp: '#dc322f', comment: ['#586e75', 1], doctag: '#859900', meta: '#cb4b16', title: '#268bd2', 'title.class_': '#b58900', 'title.function_': '#268bd2',
      params: '#839496', attr: '#b58900', attribute: '#b58900', variable: '#268bd2', 'variable.language': '#b58900', property: '#268bd2', symbol: '#d33682', tag: '#268bd2', name: '#268bd2', 'selector-tag': '#859900', 'selector-class': '#268bd2', 'selector-id': '#268bd2', section: ['#cb4b16', 2], bullet: '#cb4b16',
      link: '#2aa198', subst: '#839496', 'template-variable': '#268bd2', addition: '#859900', deletion: '#dc322f', emphasis: ['#839496', 1], strong: ['#839496', 2], operator: '#859900', 'char.escape_': '#dc322f', quote: '#586e75' } },
};
const GRADIENTS = { 'gradient-1': ['#5f2c82', '#49a09d'], 'gradient-2': ['#2b5876', '#4e4376'], 'gradient-3': ['#ffb88c', '#de6262'], 'gradient-4': ['#a8e6cf', '#3d84a8'], 'gradient-5': ['#0f2027', '#2c5364'] };
// keywords that are control flow get the keyword.control color in the Modern schemes, as in VS Code
const CONTROL = new Set(['if', 'else', 'elif', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'except', 'finally', 'throw', 'raise', 'import', 'from', 'export', 'await', 'yield', 'goto', 'match', 'when', 'with', 'as', 'pass', 'loop', 'foreach', 'require', 'include', 'using']);

/* ---------- layout helpers from the Code Screenshot extension (core/layout.js, MIT) ---------- */
/** Tabs to spaces by column, inside colored segments. segs: [[text, color, style]] */
function expandTabs(segs, tabSize) {
  const ts = Math.max(1, Math.min(16, tabSize | 0 || 4));
  let col = 0;
  const out = [];
  for (const s of segs) {
    const t = s[0];
    if (t.indexOf('\t') < 0) { col += cols(t); out.push(s); continue; }
    let r = '';
    for (const ch of t) {
      if (ch === '\t') { const n = ts - (col % ts); r += ' '.repeat(n); col += n; } else { r += ch; col += charCols(ch); }
    }
    out.push([r, s[1], s[2]]);
  }
  return out;
}

function leadingSpaces(segs) {
  let n = 0;
  for (const s of segs) {
    const m = /^ */.exec(s[0])[0].length;
    n += m;
    if (m < s[0].length) return n;
  }
  return -1; // blank line
}

/** The indent every non-blank line shares (in columns, after tabs became spaces). */
function commonIndent(lines) {
  let min = Infinity;
  for (const l of lines) {
    if (!l.segs) continue;
    const n = leadingSpaces(l.segs);
    if (n >= 0 && n < min) min = n;
  }
  return min === Infinity ? 0 : min;
}

/** Drop the first n columns (spaces only). */
function dropColumns(segs, n) {
  if (n <= 0) return segs;
  let left = n;
  const out = [];
  for (const s of segs) {
    if (left > 0) {
      const sp = /^ */.exec(s[0])[0].length;
      const k = Math.min(sp, left);
      left -= k;
      if (k < s[0].length) out.push(k ? [s[0].slice(k), s[1], s[2]] : s);
      if (k < sp || k < s[0].length) left = 0;
    } else out.push(s);
  }
  return out;
}

// Wide characters (CJK, fullwidth forms, most emoji) take two columns in a monospace editor.
// Ranges as numbers, so the source stays plain ASCII.
const range = pairs => '[' + pairs.map(([a, b]) => esc(a) + '-' + esc(b)).join('') + ']';
function esc(cp) { return '\\u{' + cp.toString(16) + '}'; }
const WIDE = new RegExp(range([[0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f900, 0x1f9ff], [0x20000, 0x3fffd]]), 'u');
const ZERO = new RegExp(range([[0x300, 0x36f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfe00, 0xfe0f]]), 'u');
function charCols(ch) { return ZERO.test(ch) ? 0 : WIDE.test(ch) ? 2 : 1; }
function cols(t) {
  let n = 0;
  for (const ch of t) n += charCols(ch);
  return n;
}
function segsCols(segs) { let n = 0; for (const s of segs) n += cols(s[0]); return n; }
function segsLength(segs) { let n = 0; for (const s of segs) n += s[0].length; return n; }

/** Cut a line at max characters and add a marker. Returns { segs, cut } */
function cutLine(segs, max, markColor) {
  if (segsLength(segs) <= max) return { segs, cut: false };
  const out = [];
  let left = max;
  for (const s of segs) {
    if (left <= 0) break;
    if (s[0].length <= left) { out.push(s); left -= s[0].length; } else {
      let t = s[0].slice(0, left);
      if (/[\uD800-\uDBFF]$/.test(t)) t = t.slice(0, -1);
      out.push([t, s[1], s[2]]);
      left = 0;
    }
  }
  out.push([' …', markColor, 0]);
  return { segs: out, cut: true };
}

/**
 * Wrap one line at width columns. Continuation rows keep the line's indent (up to half the width).
 * Returns an array of rows, each an array of segments.
 */
function wrapLine(segs, width) {
  if (!width || width < 8 || segsCols(segs) <= width) return [segs];
  const indent = Math.max(0, Math.min(leadingSpaces(segs), Math.floor(width / 2)));
  const rows = [];
  let row = [];
  let col = 0;
  let limit = width;
  const pushChar = (ch, s) => {
    const p = row[row.length - 1];
    if (p && p[1] === s[1] && p[2] === s[2]) p[0] += ch; else row.push([ch, s[1], s[2]]);
  };
  // Break at the last space before the limit when there is one in the second half of the row.
  for (const s of segs) {
    for (const ch of s[0]) {
      const w = charCols(ch);
      if (col + w > limit) {
        let carry = [];
        const flat = row.map(x => x[0]).join('');
        const sp = flat.lastIndexOf(' ');
        const minBreak = (rows.length ? indent : 0) + Math.floor((limit - (rows.length ? indent : 0)) / 2);
        if (ch !== ' ' && sp > minBreak && sp < flat.length - 1) {
          // move the text after the space to the next row
          let pos = 0;
          const keep = [];
          for (const x of row) {
            const end = pos + x[0].length;
            if (end <= sp + 1) keep.push(x);
            else if (pos >= sp + 1) carry.push(x);
            else { keep.push([x[0].slice(0, sp + 1 - pos), x[1], x[2]]); carry.push([x[0].slice(sp + 1 - pos), x[1], x[2]]); }
            pos = end;
          }
          row = keep;
        }
        if (ch === ' ' && !carry.length) {
          // the space at the break stays at the end of this row, so the rows join back to the line text
          const p = row[row.length - 1];
          if (p && p[1] === s[1] && p[2] === s[2]) p[0] += ch; else row.push([ch, s[1], s[2]]);
          rows.push(row);
          row = indent ? [[' '.repeat(indent), s[1], 0]] : [];
          if (indent) row.pre = indent;
          col = indent;
          continue;
        }
        rows.push(row);
        row = indent ? [[' '.repeat(indent), s[1], 0]] : [];
        if (indent) row.pre = indent;
        col = indent;
        limit = width;
        for (const x of carry) { row.push(x); col += cols(x[0]); }
      }
      pushChar(ch, s);
      col += w;
    }
  }
  const rowLen = row.reduce((n, x) => n + x[0].length, 0);
  if (rowLen > (row.pre || 0) || !rows.length) rows.push(row);
  return rows;
}

/**
 * Final rows for drawing. lines: [{ n, segs } | { skip, folded }]; o: { trimIndent, wrap, indent (common indent) }
 * Returns [{ n, segs, cont } | { skip, folded }]
 */
function layoutRows(lines, o) {
  const out = [];
  const indent = o.trimIndent ? (o.indent || 0) : 0;
  for (const l of lines) {
    if (!l.segs) { out.push({ skip: l.skip, folded: !!l.folded }); continue; }
    const segs = dropColumns(l.segs, indent);
    const rows = wrapLine(segs, o.wrap || 0);
    rows.forEach((r, i) => out.push({ n: l.n, segs: r, cont: i > 0 }));
  }
  return out;
}

/** Default file name: <file>-L12-L40.png (one line: <file>-L12.png). */
function defaultFileName(fileName, first, last, ext) {
  const base = String(fileName || 'code').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '') || 'code';
  const range = first === last ? `L${first}` : `L${first}-L${last}`;
  return `${base}-${range}.${ext}`;
}


/* ---------- tokens: highlight.js classes -> colored segments per line ---------- */
const LANGS = hljs.listLanguages().map(id => ({ id, name: (hljs.getLanguage(id) || {}).name || id })).sort((a, b) => a.name.localeCompare(b.name));
const EXT = { h: 'c', hpp: 'cpp', cc: 'cpp', cxx: 'cpp', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', tsx: 'typescript', mts: 'typescript', cts: 'typescript', vue: 'xml', svelte: 'xml', htm: 'xml', html: 'xml', svg: 'xml', yml: 'yaml', zsh: 'bash', sh: 'bash', ps1: 'powershell', kt: 'kotlin', kts: 'kotlin', rs: 'rust', rb: 'ruby', py: 'python', pyw: 'python', cs: 'csharp', fs: 'fsharp', m: 'objectivec', mm: 'objectivec', pl: 'perl', pm: 'perl', tf: 'ini', toml: 'ini', conf: 'ini', cfg: 'ini', md: 'markdown', txt: 'plaintext', dockerfile: 'dockerfile', gradle: 'gradle', sql: 'sql' };
function langForName(name) {
  const base = String(name || '').toLowerCase().split('/').pop();
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'dockerfile';
  if (base === 'makefile' || base === 'gnumakefile') return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  if (!ext) return '';
  const id = EXT[ext] || ext;
  const l = hljs.getLanguage(id);
  if (!l) return '';
  return LANGS.find(x => hljs.getLanguage(x.id) === l)?.id || '';
}
function colorFor(classes, text, sch) {
  const c = classes.map(x => x.replace(/^hljs-/, ''));
  const t = sch.t;
  for (let i = c.length - 1; i >= 0; i--) {   // innermost class first; compound classes like "title function_"
    const parts = c[i].split(' ');
    const keys = parts.length > 1 ? [parts.join('.'), parts[0]] : [parts[0]];
    if (parts[0] === 'keyword' && t['keyword.control'] && CONTROL.has(text.trim())) keys.unshift('keyword.control');
    for (const k of keys) if (t[k]) return Array.isArray(t[k]) ? t[k] : [t[k], 0];
  }
  return [sch.foreground, 0];
}
function tokenize(code, lang, sch) {
  let res;
  if (lang === 'auto') res = hljs.highlightAuto(code.length > 20000 ? code.slice(0, 20000) : code);
  if (lang === 'auto' && code.length > 20000 && res.language) res = hljs.highlight(code, { language: res.language, ignoreIllegals: true });
  else if (lang !== 'auto') res = hljs.highlight(code, { language: lang, ignoreIllegals: true });
  // highlight.js escapes the code; the HTML is parsed in an inert document only to read the span classes
  const doc = new DOMParser().parseFromString('<pre>' + res.value + '</pre>', 'text/html');
  const lines = [[]];
  const walk = (node, classes) => {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) {
        const parts = ch.nodeValue.split('\n');
        parts.forEach((p, i) => {
          if (i > 0) lines.push([]);
          if (p) { const [col, st] = colorFor(classes, p, sch); const cur = lines[lines.length - 1], last = cur[cur.length - 1]; if (last && last[1] === col && last[2] === st) last[0] += p; else cur.push([p, col, st]); }
        });
      } else if (ch.nodeType === 1) walk(ch, ch.className ? classes.concat(ch.className) : classes);
    }
  };
  walk(doc.querySelector('pre'), []);
  return { lines, language: res.language || 'plaintext', relevance: res.relevance };
}

/* ---------- model ---------- */
const prefs = { scheme: 'dark-modern', lang: 'auto', scale: 2, lineNumbers: true, frame: 'mac', title: '', showTitle: true, background: 'gradient-1', bgColor: '#6c5ce7', padding: 48, shadow: true, radius: 10, trimIndent: true, wrap: 0, fontSize: 14, mark: '', firstLine: 1 };
let fileName = 'code', model = null, picture = null, highlights = new Set(), marks = [], lastClicked = null, notes = [];
function build() {
  const code = $('code').value.replace(/\r\n?/g, '\n');
  if (!code.trim()) { model = null; picture = null; $('stage').replaceChildren(); $('size').textContent = ''; $('notice').textContent = 'Paste or type code, or open a file, to see the picture.'; return; }
  const sch = SCHEMES[prefs.scheme];
  notes = [];
  let src = code.replace(/\n$/, '');
  let all = src.split('\n');
  if (all.length > MAX_LINES) { notes.push(`The code has ${int(all.length)} lines; the picture shows the first ${int(MAX_LINES)}.`); all = all.slice(0, MAX_LINES); src = all.join('\n'); }
  const tok = tokenize(src, prefs.lang, sch);
  let cut = 0;
  const lines = tok.lines.map((segs, i) => {
    let s = expandTabs(segs, 4);
    const r = cutLine(s, MAX_LINE, sch.lineNumber);
    if (r.cut) cut++;
    return { n: prefs.firstLine + i, segs: r.segs };
  });
  if (cut) notes.push(`${int(cut)} line${cut === 1 ? ' is' : 's are'} longer than ${int(MAX_LINE)} characters and ${cut === 1 ? 'was' : 'were'} cut with "…".`);
  model = { lines, indent: commonIndent(lines), colors: { background: sch.background, foreground: sch.foreground, lineNumber: sch.lineNumber, mark: sch.mark }, language: tok.language };
  $('fmeta').textContent = `${int(code.replace(/\n$/, '').split('\n').length)} lines · ${(hljs.getLanguage(tok.language) || {}).name || tok.language}${prefs.lang === 'auto' ? ' (detected)' : ''}`;
  draw();
}

/* ---------- drawing (follows the extension's panel: one SVG of DOM text nodes) ---------- */
function xmlSafe(s) {
  return String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]|[￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/g,
    (c, pre) => pre !== undefined && c.length === 2 ? pre + '�' : c === '\x7f' ? '␡' : c.length === 1 && c < ' ' ? String.fromCharCode(0x2400 + c.charCodeAt(0)) : '�');
}
function sv(name, attrs, parent) {
  const e = document.createElementNS(SVGNS, name);
  if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}
function relLum(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || ''); if (!m) return 0;
  const v = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const solidHex = hex => { const m = /^#([0-9a-f]{6})/i.exec(hex || ''); return m ? '#' + m[1] : hex; };
const alphaOf = hex => { const m = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(hex || ''); return m ? parseInt(m[1], 16) / 255 : 1; };
function paint(node, attr, hex) { node.setAttribute(attr, solidHex(hex)); const a = alphaOf(hex); if (a < 1) node.setAttribute(attr + '-opacity', a.toFixed(3)); }
function buildRows() {
  const rows = layoutRows(model.lines, { trimIndent: prefs.trimIndent, wrap: prefs.wrap, indent: model.indent });
  const pos = new Map();
  for (const r of rows) {
    if (!r.segs) continue;
    const t = r.segs.map(s => s[0]).join('');
    const pre = r.cont && r.segs.pre ? r.segs.pre : 0;
    const start = pos.get(r.n) || 0;
    r.text = t; r.pre = pre; r.off = start;
    pos.set(r.n, start + t.length - pre);
  }
  return rows;
}
function allMarks() {
  const out = marks.slice(), q = prefs.mark;
  if (q) for (const l of model.lines) {
    const t = dropColumns(l.segs, prefs.trimIndent ? model.indent : 0).map(s => s[0]).join('');
    let i = t.indexOf(q), guard = 0;
    while (i >= 0 && guard++ < 1000) { out.push({ n: l.n, start: i, len: q.length }); i = t.indexOf(q, i + q.length); }
  }
  return out;
}
function draw() {
  if (!model) return;
  const px = prefs.fontSize, lineH = Math.round(px * 1.5);
  const rows = buildRows();
  const c = model.colors;
  const dark = relLum(solidHex(c.background)) < 0.4;
  const stage = $('stage');
  const svg = sv('svg', { xmlns: SVGNS, role: 'img' });
  svg.setAttribute('aria-label', 'Picture of the code');
  const defs = sv('defs', null, svg), bgLayer = sv('g', null, svg), win = sv('g', null, svg);
  const font = sv('g', { 'font-family': FONT, 'font-size': px });
  font.setAttributeNS(XMLNS, 'xml:space', 'preserve');
  font.style.cssText = 'white-space:pre;font-variant-ligatures:none';
  stage.replaceChildren(svg);
  svg.appendChild(font);
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `${px}px ${FONT}`;
  const mt = meas.measureText('Hg│');
  const asc = mt.fontBoundingBoxAscent || px * 0.8, desc = mt.fontBoundingBoxDescent || px * 0.2;
  const baseline = Math.round(((lineH - (asc + desc)) / 2 + asc) * 100) / 100;
  const digitW = meas.measureText('0').width || px * 0.6;
  const texts = [];
  let maxW = 0;
  for (const r of rows) {
    const t = sv('text', { x: 0, y: 0 }, font);
    t.setAttributeNS(XMLNS, 'xml:space', 'preserve');
    for (const s of r.segs) {
      const sp = sv('tspan', { fill: solidHex(s[1]) }, t);
      if (alphaOf(s[1]) < 1) sp.setAttribute('fill-opacity', alphaOf(s[1]).toFixed(3));
      if (s[2] & 1) sp.setAttribute('font-style', 'italic');
      if (s[2] & 2) sp.setAttribute('font-weight', 'bold');
      sp.textContent = xmlSafe(s[0]);
    }
    texts.push(t);
    const w = r.text.length ? t.getComputedTextLength() : 0;
    if (w > maxW) maxW = w;
  }
  const frame = prefs.frame;
  const pad = prefs.background === 'transparent' && frame === 'none' ? Math.min(prefs.padding, 16) : prefs.padding;
  const barH = frame === 'none' ? 0 : Math.round(Math.max(28, px * 2.4));
  const inTop = frame === 'none' ? Math.round(px * 1.2) : Math.round(px * 0.3);
  const inBottom = Math.round(px * 1.2), inLeft = Math.round(px * 1.4), inRight = Math.round(px * 1.6);
  const maxN = rows.reduce((m, r) => (r.n > m ? r.n : m), 0);
  const gutter = prefs.lineNumbers ? Math.ceil(String(maxN).length * digitW + px * 1.3) : 0;
  const title = prefs.showTitle && frame !== 'none' ? (prefs.title || fileName) : '';
  meas.font = `${Math.round(px * 0.9)}px ${FONT}`;
  const titleW = title ? meas.measureText(title).width : 0;
  const winW = Math.ceil(Math.max(inLeft + gutter + maxW + inRight, title ? titleW + 140 : 0, frame === 'none' ? 0 : 220));
  const winH = Math.ceil(barH + inTop + rows.length * lineH + inBottom);
  const W = winW + pad * 2, H = winH + pad * 2;
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (prefs.background in GRADIENTS) {
    const g = sv('linearGradient', { id: 'bg', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    sv('stop', { offset: 0, 'stop-color': GRADIENTS[prefs.background][0] }, g);
    sv('stop', { offset: 1, 'stop-color': GRADIENTS[prefs.background][1] }, g);
    sv('rect', { width: W, height: H, fill: 'url(#bg)' }, bgLayer);
  } else if (prefs.background === 'solid') sv('rect', { width: W, height: H, fill: prefs.bgColor }, bgLayer);
  else if (prefs.background === 'editor') paint(sv('rect', { width: W, height: H }, bgLayer), 'fill', c.background);
  win.setAttribute('transform', `translate(${pad} ${pad})`);
  const radius = frame === 'none' && pad === 0 ? 0 : prefs.radius;
  if (prefs.shadow && pad > 0) {
    const fl = sv('filter', { id: 'shadow', x: '-20%', y: '-20%', width: '140%', height: '150%' }, defs);
    sv('feDropShadow', { dx: 0, dy: Math.round(Math.min(pad, 48) * 0.3), stdDeviation: Math.round(Math.min(pad, 48) * 0.35), 'flood-color': '#000', 'flood-opacity': 0.45 }, fl);
  }
  const body = sv('rect', { width: winW, height: winH, rx: radius, ry: radius }, win);
  paint(body, 'fill', c.background);
  if (prefs.shadow && pad > 0) body.setAttribute('filter', 'url(#shadow)');
  if (frame !== 'none') {
    sv('rect', { x: 0.5, y: 0.5, width: winW - 1, height: winH - 1, rx: radius, ry: radius, fill: 'none', stroke: dark ? '#ffffff' : '#000000', 'stroke-opacity': dark ? 0.12 : 0.14 }, win);
    if (frame === 'mac') { const cy = Math.round(barH / 2); ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => sv('circle', { cx: 20 + i * 20, cy, r: 6, fill: col }, win)); }
    if (title) {
      const tt = sv('text', { x: Math.round(winW / 2), y: Math.round(barH / 2), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': FONT, 'font-size': Math.round(px * 0.9), fill: solidHex(c.foreground), 'fill-opacity': 0.62 }, win);
      tt.textContent = xmlSafe(title);
    }
  }
  const hl = sv('g', null, win);
  const codeX = inLeft + gutter, top = barH + inTop;
  rows.forEach((r, i) => {
    if (highlights.has(r.n)) {
      sv('rect', { x: 0, y: top + i * lineH, width: winW, height: lineH, fill: solidHex(c.foreground), 'fill-opacity': 0.1 }, hl);
      sv('rect', { x: 0, y: top + i * lineH, width: 3, height: lineH, fill: solidHex(c.foreground) }, hl);
    }
  });
  win.appendChild(font);
  font.setAttribute('transform', `translate(${codeX} 0)`);
  const nums = sv('g', { 'font-family': FONT, 'font-size': px, 'text-anchor': 'end' }, win);
  paint(nums, 'fill', c.lineNumber);
  rows.forEach((r, i) => {
    const y = top + i * lineH + baseline;
    texts[i].setAttribute('y', y);
    if (prefs.lineNumbers && !r.cont) { const t = sv('text', { x: inLeft + gutter - Math.round(px * 1.1), y }, nums); t.textContent = String(r.n); }
  });
  const mk = sv('g', null, win);
  win.insertBefore(mk, font);
  let markCount = 0;
  const ms = allMarks();
  rows.forEach((r, i) => {
    const rowLen = r.text.length - r.pre;
    for (const m of ms) {
      if (m.n !== r.n) continue;
      const a = Math.max(m.start, r.off), b = Math.min(m.start + m.len, r.off + rowLen);
      if (b <= a) continue;
      const ci = r.pre + a - r.off;
      try {
        const x0 = texts[i].getStartPositionOfChar(ci).x, w = texts[i].getSubStringLength(ci, b - a);
        paint(sv('rect', { x: codeX + x0 - 1, y: top + i * lineH + 1, width: w + 2, height: lineH - 2, rx: 3, ry: 3 }, mk), 'fill', c.mark);
        markCount++;
      } catch (e) { /* a character the font cannot place */ }
    }
  });
  const hits = sv('g', { 'data-ui': '1', fill: 'transparent' }, win);
  rows.forEach((r, i) => { const h = sv('rect', { x: 0, y: top + i * lineH, width: winW, height: lineH }, hits); h.dataset.row = String(i); });
  hits.addEventListener('mousedown', e => onRowMouse(e, rows, texts));
  picture = { svg, w: W, h: H, rows: rows.length, marks: markCount };
  $('size').textContent = sizeText();
  $('notice').textContent = notes.join(' ') || 'Click a line to highlight it, Shift+click for a range. Double-click a word to mark it.';
  self.zovoState = { w: W, h: H, rows: rows.length, marks: markCount, highlights: highlights.size, language: model.language, texts: svg.querySelectorAll('text').length, scripts: svg.querySelectorAll('script').length, foreign: svg.querySelectorAll('foreignObject').length };
}
function pngScale(w, h, want) {
  let s = want;
  while (s > 1 && (w * s > MAX_SIDE || h * s > MAX_SIDE || w * h * s * s > MAX_AREA)) s--;
  if (w * s > MAX_SIDE || h * s > MAX_SIDE || w * h * s * s > MAX_AREA) s = Math.min(MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h)));
  return s;
}
function sizeText() { if (!picture) return ''; const s = pngScale(picture.w, picture.h, prefs.scale); return `PNG ${int(Math.round(picture.w * s))} × ${int(Math.round(picture.h * s))} px`; }
function onRowMouse(e, rows, texts) {
  const i = Number(e.target.dataset.row), r = rows[i];
  if (!r) return;
  if (e.detail === 2) {
    toggleLine(r.n, false);
    const t = texts[i], pt = picture.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(t.getScreenCTM().inverse());
    p.y = Number(t.getAttribute('y')) - 2;
    let ci = -1;
    try { ci = t.getCharNumAtPosition(p); } catch (err) { /* outside the text */ }
    if (ci >= r.pre) {
      const text = r.text, word = /[\p{L}\p{N}_$]/u;
      let a = ci, b = ci + 1;
      if (word.test(text[ci] || '')) { while (a > r.pre && word.test(text[a - 1])) a--; while (b < text.length && word.test(text[b])) b++; }
      const m = { n: r.n, start: r.off + a - r.pre, len: b - a };
      const k = marks.findIndex(x => x.n === m.n && x.start === m.start && x.len === m.len);
      if (k >= 0) marks.splice(k, 1); else marks.push(m);
    }
    draw(); return;
  }
  if (e.detail === 1) {
    if (e.shiftKey && lastClicked !== null) { const [a, b] = [Math.min(lastClicked, r.n), Math.max(lastClicked, r.n)]; for (const x of rows) if (x.n >= a && x.n <= b) highlights.add(x.n); draw(); }
    else toggleLine(r.n, true);
    lastClicked = r.n;
  }
}
function toggleLine(n, redraw) { if (highlights.has(n)) highlights.delete(n); else highlights.add(n); if (redraw) draw(); }

/* ---------- export ---------- */
function svgText() {
  const clone = picture.svg.cloneNode(true);
  clone.querySelectorAll('[data-ui]').forEach(n => n.remove());
  clone.removeAttribute('role');
  clone.setAttribute('xmlns', SVGNS);
  return new XMLSerializer().serializeToString(clone);
}
async function pngBlob() {
  const s = pngScale(picture.w, picture.h, prefs.scale);
  const w = Math.max(1, Math.round(picture.w * s)), h = Math.max(1, Math.round(picture.h * s));
  const url = URL.createObjectURL(new Blob([svgText()], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.decoding = 'sync'; img.src = url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('the canvas could not make a PNG'))), 'image/png'));
    cv.width = 1; cv.height = 1;
    return { blob, w, h, scale: s };
  } finally { URL.revokeObjectURL(url); }
}
function names(ext) {
  const nums = model.lines.map(l => l.n);
  return defaultFileName(prefs.title || fileName, nums[0], nums[nums.length - 1], ext);
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
let lastPng = null;
async function act(kind) {
  if (!picture) { say('Paste or type code first, or open a file.', true); return; }
  try {
    if (kind === 'saveSvg') { download(new Blob([svgText()], { type: 'image/svg+xml' }), names('svg')); say(`Saved ${names('svg')}.`); return; }
    if (kind === 'copySvg') { await navigator.clipboard.writeText(svgText()); say('Copied the SVG code to the clipboard.'); return; }
    const p = await pngBlob();
    lastPng = { w: p.w, h: p.h, bytes: p.blob.size, head: Array.from(new Uint8Array(await p.blob.slice(0, 24).arrayBuffer())) };
    self.zovoState = { ...self.zovoState, png: lastPng }; self.zovoPngBlob = p.blob;  // the page test decodes it
    const note = p.scale !== prefs.scale ? ` The picture is too large for ${prefs.scale}x, so the PNG is ${Math.round(p.scale * 100) / 100}x.` : '';
    if (kind === 'savePng') { download(p.blob, names('png')); say(`Saved ${names('png')} (${int(p.w)} × ${int(p.h)} px, ${size(p.blob.size)}).${note}`); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': p.blob })]);
      say(`Copied the PNG (${int(p.w)} × ${int(p.h)} px) to the clipboard.${note}`);
    } catch (err) {
      say(`The browser did not allow copying the picture (${err && err.message || err}). Use Save PNG instead.`, true);
    }
  } catch (err) { say('The picture could not be made: ' + (err && err.message || err), true); }
}

/* ---------- options ---------- */
function fillSelects() {
  const sel = $('scheme');
  for (const [id, s] of Object.entries(SCHEMES)) { const o = document.createElement('option'); o.value = id; o.textContent = s.name; sel.append(o); }
  const lang = $('lang');
  for (const l of LANGS) { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name; lang.append(o); }
}
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
function readOpts() {
  prefs.scheme = SCHEMES[$('scheme').value] ? $('scheme').value : 'dark-modern';
  prefs.lang = $('lang').value;
  prefs.frame = $('frame').value; prefs.title = $('title').value.slice(0, 200); prefs.background = $('background').value; prefs.bgColor = /^#[0-9a-f]{6}$/i.test($('bgColor').value) ? $('bgColor').value : '#6c5ce7';
  prefs.padding = clampInt($('padding').value, 0, 128, 48); prefs.radius = clampInt($('radius').value, 0, 24, 10); prefs.fontSize = clampInt($('fontSize').value, 8, 48, 14);
  prefs.scale = clampInt($('scale').value, 1, 4, 2); prefs.firstLine = clampInt($('firstLine').value, 1, 9999999, 1); prefs.wrap = clampInt($('wrap').value, 0, 400, 0);
  prefs.lineNumbers = $('lineNumbers').checked; prefs.showTitle = $('showTitle').checked; prefs.shadow = $('shadow').checked; prefs.trimIndent = $('trimIndent').checked; prefs.mark = $('mark').value.slice(0, 200);
  $('bgColor').hidden = prefs.background !== 'solid';
  $('paddingVal').textContent = prefs.padding + ' px';
  try { localStorage.setItem('zovo-codeshot', JSON.stringify({ ...prefs, title: '', mark: '', firstLine: 1, lang: 'auto' })); } catch (e) { /* private mode */ }
}
function loadOpts() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem('zovo-codeshot') || '{}') || {}; } catch (e) { p = {}; }
  const set = (id, v) => { if (v !== undefined && v !== null) $(id).value = String(v); };
  if (SCHEMES[p.scheme]) set('scheme', p.scheme);
  for (const k of ['frame', 'background', 'scale', 'wrap']) if (p[k] !== undefined && [...$(k).options].some(o => o.value === String(p[k]))) set(k, p[k]);
  for (const k of ['bgColor', 'padding', 'radius', 'fontSize']) if (p[k] !== undefined) set(k, p[k]);
  for (const k of ['lineNumbers', 'showTitle', 'shadow', 'trimIndent']) if (typeof p[k] === 'boolean') $(k).checked = p[k];
}
let tmr = 0, pendingFull = false;
function later(full) { pendingFull = pendingFull || full; clearTimeout(tmr); tmr = setTimeout(() => { const f = pendingFull; pendingFull = false; readOpts(); if (f || !model) build(); else draw(); }, 200); }

/* ---------- open ---------- */
function setCode(text, name, how) {
  fileName = name || 'code.txt';
  $('fname').textContent = fileName;
  $('code').value = text;
  const l = langForName(fileName);
  $('lang').value = l || 'auto';
  marks = []; highlights = new Set(); lastClicked = null;
  readOpts(); build();
  if (how) say(how);
}
async function open(file) {
  if (!file) return;
  const t0 = performance.now();
  if (file.size > MAX_BYTES) { say(`${file.name} is ${size(file.size)}. The picture is for code you want to show, so files up to ${size(MAX_BYTES)} open here; copy the lines you want instead.`, true); return; }
  say(`Reading ${file.name} ...`);
  const buf = new Uint8Array(await file.arrayBuffer());
  let nul = 0; for (let i = 0; i < Math.min(buf.length, 8000); i++) if (buf[i] === 0) nul++;
  if (nul > 0 && !(buf[0] === 0xff && buf[1] === 0xfe) && !(buf[0] === 0xfe && buf[1] === 0xff)) { say(`${file.name} looks like a binary file, not code, so it was not opened.`, true); return; }
  const enc = buf[0] === 0xff && buf[1] === 0xfe ? 'utf-16le' : buf[0] === 0xfe && buf[1] === 0xff ? 'utf-16be' : 'utf-8';
  const text = new TextDecoder(enc).decode(buf);
  setCode(text, file.name, '');
  say(`Opened ${file.name} in ${Math.round(performance.now() - t0)} ms (${int(text.replace(/\r?\n$/, '').split('\n').length)} lines${model ? ', ' + ((hljs.getLanguage(model.language) || {}).name || model.language) : ''}).`);
}
async function sample() {
  const { SAMPLE } = await import('./sample.js');
  setCode(SAMPLE.data, SAMPLE.name, '');
  highlights = new Set([SAMPLE.highlight]); draw();
  say(`Opened the sample ${SAMPLE.name}. Change the options, then copy or save the picture.`);
}

fillSelects(); loadOpts(); readOpts();
$('drop').classList.add('compact');
for (const id of ['scheme', 'lang', 'trimIndent', 'wrap', 'firstLine']) $(id).addEventListener('change', () => later(true));
for (const id of ['frame', 'background', 'bgColor', 'scale', 'lineNumbers', 'showTitle', 'shadow', 'fontSize']) $(id).addEventListener('change', () => later(false));
for (const id of ['padding', 'radius', 'title', 'mark', 'bgColor']) $(id).addEventListener('input', () => later(false));
$('code').addEventListener('input', () => later(true));
$('clearMarks').addEventListener('click', () => { highlights = new Set(); marks = []; $('mark').value = ''; readOpts(); draw(); });
$('copyPng').addEventListener('click', () => act('copyPng'));
$('savePng').addEventListener('click', () => act('savePng'));
$('saveSvg').addEventListener('click', () => act('saveSvg'));
$('copySvg').addEventListener('click', () => act('copySvg'));
$('pick').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('pick2').addEventListener('change', e => { open(e.target.files[0]); e.target.value = ''; });
$('sample').addEventListener('click', () => sample().catch(e => say('The sample could not be loaded: ' + e.message, true)));
const dz = $('drop');
dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pick').click(); } });
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) open(f); });
build();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
self.zovoReady = true;  // for the page test
