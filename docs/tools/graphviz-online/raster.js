// SVG to PNG in a webview, for the Pro exports (all graphs in the workspace, export on save). The extension host
// cannot draw an SVG, so it sends the Graphviz SVG here and gets PNG bytes (base64) back. Same drawing as the
// preview's PNG button: original Graphviz colors on white, 2x, at most 64 megapixels.
// In the preview page, preview.js answers the messages; in the small "Graphviz export" page this file does.
(function () {
  'use strict';
  async function gvRaster(svgText, maxScale) {
    const doc = new DOMParser().parseFromString(String(svgText), 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg') throw new Error('not an SVG');
    for (const t of ['script', 'foreignObject', 'image', 'iframe', 'embed', 'object', 'style', 'audio', 'video']) root.querySelectorAll(t).forEach(n => n.remove());
    root.querySelectorAll('*').forEach(el => { for (const a of Array.from(el.attributes)) { const k = a.name.toLowerCase(); if (k.startsWith('on') || k === 'style' || ((k === 'href' || k === 'xlink:href') && !a.value.startsWith('#'))) el.removeAttribute(a.name); } });
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const w0 = vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(root.getAttribute('width')) || 100;
    const h0 = vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(root.getAttribute('height')) || 100;
    const scale = Math.min(maxScale || 2, Math.sqrt(64e6 / Math.max(1, w0 * h0)));
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
    root.setAttribute('width', String(w));
    root.setAttribute('height', String(h));
    const blob = new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('the SVG could not be drawn')); img.src = url; });
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const out = await new Promise(res => c.toBlob(res, 'image/png'));
      if (!out) throw new Error('the image is too large to draw');
      const bytes = new Uint8Array(await out.arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    } finally { URL.revokeObjectURL(url); }
  }
  window.gvRaster = gvRaster;
  if (document.body && document.body.dataset.rasterPage === '1') {
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', async e => {
      const m = e.data;
      if (!m || m.type !== 'raster') return;
      try { vscode.postMessage({ type: 'rasterDone', id: m.id, data: await gvRaster(m.svg, m.scale) }); }
      catch (err) { vscode.postMessage({ type: 'rasterDone', id: m.id, error: String((err && err.message) || err).slice(0, 300) }); }
    });
    vscode.postMessage({ type: 'ready' });
  }
})();
