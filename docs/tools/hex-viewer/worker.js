/* Zovo Hex Viewer Online: the background worker. It reads the file the user picked (a File object that stays in
   this browser), finds a matching template, parses it with the Hex Viewer engine, and runs Find over the whole
   file in 4 MB chunks. Nothing here touches the network: the page CSP sets connect-src 'none'. */
'use strict';
importScripts('engine.js');
const T = self.ZovoHex.template, B = self.ZovoHex.bytes;
let file = null, findJob = 0;

const doc = () => ({ size: file.size, read: async (off, n) => new Uint8Array(await file.slice(off, Math.min(file.size, off + n)).arrayBuffer()) });

async function structure(id) {
  const d = doc();
  const cands = await T.detect(self.ZovoHex.BUILTIN, d, file.name);
  if (!cands.length) { postMessage({ type: 'struct', id, none: true }); return; }
  const t = cands[0].template;
  const r = await T.parse(t, d, { limits: { maxMs: 8000, maxNodes: 50000 } });
  if (!r || !r.root) { postMessage({ type: 'struct', id, name: t.name, error: (r && r.error) || 'The template could not read this file.' }); return; }
  postMessage({ type: 'struct', id, name: t.name, tid: t.id, tree: T.toWireTop(r.root), nested: T.countNested(r.root), error: r.error || null, ms: r.ms,
    others: cands.slice(1, 4).map(c => c.template.name) });
}

async function find(m) {
  const job = ++findJob;
  const p = B.parsePattern(m.query, m.mode, m.ignoreCase);
  if (!p.ok) { postMessage({ type: 'found', job, error: p.error }); return; }
  const pp = B.preparePattern(p), len = pp.len, CH = 4 << 20, size = file.size;
  const scan = async (from, to) => { // forward scan of [from, to)
    for (let pos = from; pos < to; pos += CH) {
      if (job !== findJob) return -2;
      const end = Math.min(size, pos + CH + len - 1);
      const buf = new Uint8Array(await file.slice(pos, end).arrayBuffer());
      const i = B.findForward(buf, pp, 0, Math.min(buf.length, to - pos + len - 1));
      if (i >= 0 && pos + i < to) return pos + i;
      postMessage({ type: 'progress', job, done: Math.min(to, pos + CH) - from, total: to - from });
    }
    return -1;
  };
  const start = Math.max(0, Math.min(size, m.from));
  let at = await scan(start, size), wrapped = false;
  if (at === -1 && start > 0) { at = await scan(0, start); wrapped = at >= 0; }
  if (at === -2) return;
  postMessage({ type: 'found', job, at, len, wrapped });
}

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'file') { file = m.file; findJob++; return; }
  if (!file) return;
  const run = m.type === 'struct' ? structure(m.id) : m.type === 'find' ? find(m) : null;
  if (m.type === 'cancel') findJob++;
  if (run) run.catch(err => postMessage({ type: m.type === 'struct' ? 'struct' : 'found', id: m.id, job: findJob, error: String((err && err.message) || err).slice(0, 300) }));
};
