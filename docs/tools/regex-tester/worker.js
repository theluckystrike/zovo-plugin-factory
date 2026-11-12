/* Regex Tester worker (TOOLCHK2, wave18): runs the pattern on the text away from the page, so a pattern that
   backtracks for a long time can be stopped (the page ends this worker after 2 seconds). No network, no eval:
   the pattern is only ever given to new RegExp(). */
self.onmessage = e => {
  const { id, pattern, flags, text, replace, max } = e.data;
  let re;
  try { re = new RegExp(pattern, flags); } catch (err) { postMessage({ id, error: err.message }); return; }
  const t0 = performance.now();
  const out = [];
  let count = 0, groups = 0;
  const one = m => {
    if (out.length < max) {
      const g = [];
      for (let k = 1; k < m.length; k++) g.push(m[k] === undefined ? null : m[k]);
      out.push({ i: m.index, s: m[0], g, });
    }
    groups = m.length - 1;
    count++;
  };
  if (re.global || re.sticky) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      one(m);
      if (m[0] === '') re.lastIndex += (re.unicode || re.unicodeSets) && text.codePointAt(m.index) > 0xFFFF ? 2 : 1;
      if (!re.global) break;
      if (re.lastIndex > text.length) break;
    }
  } else { const m = re.exec(text); if (m) one(m); }
  let replaced = null;
  if (replace !== null) { re.lastIndex = 0; replaced = text.replace(re, replace); }
  postMessage({ id, matches: out, count, groups, ms: performance.now() - t0, replaced });
};
