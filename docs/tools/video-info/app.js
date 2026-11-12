/* Video File Info Online (TOOLCHK, wave18; first draft by HTOOL6, rewritten). Plain JavaScript, no library, no request.
   Reads the container of an MP4, MOV, M4V, 3GP, MKV, WebM or AVI file in this tab. The file is read in pieces with
   File.slice: box and element headers are walked by seeking, so a moov box at the end of a big recording is found
   without reading the media data, and only the header parts (at most 64 MB) are loaded. The browser's own player
   shows the video from a blob: URL. Every value from the file is written as text, never as HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const MAXHDR = 64 * 1048576;
  let file = null, url = null, info = null;

  const rd = async (off, len) => new DataView(await file.slice(off, Math.min(file.size, off + len)).arrayBuffer());
  const cc = (v, o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  const u64 = (v, o) => v.getUint32(o) * 4294967296 + v.getUint32(o + 4);
  const str = (v, o, n) => new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset + o, Math.max(0, Math.min(n, v.byteLength - o)))).replace(/\0+$/, '');
  const dur = s => { if (!isFinite(s) || s < 0) return ''; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + x.toFixed(3).padStart(6, '0'); };
  const kbps = (bytes, s) => s > 0 && bytes > 0 ? (bytes * 8 / s / 1000 >= 1000 ? (bytes * 8 / s / 1e6).toFixed(2) + ' Mb/s' : Math.round(bytes * 8 / s / 1000) + ' kb/s') : '';
  const fps = f => f > 0 ? (Math.abs(f - Math.round(f)) < 0.005 ? String(Math.round(f)) : f.toFixed(3)) + ' fps' : '';
  const CODECS = { avc1: 'H.264', avc3: 'H.264', hvc1: 'H.265 (HEVC)', hev1: 'H.265 (HEVC)', av01: 'AV1', vp09: 'VP9', vp08: 'VP8', mp4v: 'MPEG-4 Part 2', apcn: 'Apple ProRes 422', apch: 'Apple ProRes 422 HQ', apcs: 'Apple ProRes 422 LT', apco: 'Apple ProRes 422 Proxy', ap4h: 'Apple ProRes 4444', ap4x: 'Apple ProRes 4444 XQ', jpeg: 'Motion JPEG', mjpa: 'Motion JPEG', dvh1: 'Dolby Vision (HEVC)', dvhe: 'Dolby Vision (HEVC)', 'mp4a': 'AAC', 'ac-3': 'AC-3 (Dolby Digital)', 'ec-3': 'E-AC-3 (Dolby Digital Plus)', alac: 'ALAC', Opus: 'Opus', fLaC: 'FLAC', '.mp3': 'MP3', lpcm: 'PCM', sowt: 'PCM (little-endian)', twos: 'PCM (big-endian)', in24: 'PCM 24-bit', fl32: 'PCM float', samr: 'AMR', tx3g: '3GPP timed text', wvtt: 'WebVTT', c608: 'CEA-608 captions', tmcd: 'Timecode', mebx: 'Metadata', ipcm: 'PCM', dtsc: 'DTS', 'dtse': 'DTS Express', 'mha1': 'MPEG-H 3D Audio', FMP4: 'MPEG-4 Part 2', XVID: 'MPEG-4 Part 2 (Xvid)', DIVX: 'MPEG-4 Part 2 (DivX)', DX50: 'MPEG-4 Part 2 (DivX 5)', MP42: 'MS MPEG-4 v2', MP43: 'MS MPEG-4 v3', H264: 'H.264', MJPG: 'Motion JPEG', WMV3: 'WMV 9', DIB: 'Uncompressed' };
  const MKVC = { V_VP9: 'VP9', V_VP8: 'VP8', V_AV1: 'AV1', 'V_MPEG4/ISO/AVC': 'H.264', 'V_MPEGH/ISO/HEVC': 'H.265 (HEVC)', 'V_MPEG4/ISO/ASP': 'MPEG-4 Part 2', V_MPEG2: 'MPEG-2', V_THEORA: 'Theora', 'V_MS/VFW/FOURCC': 'VfW codec', V_PRORES: 'Apple ProRes', A_OPUS: 'Opus', A_VORBIS: 'Vorbis', A_AAC: 'AAC', 'A_AAC/MPEG4/LC': 'AAC-LC', A_AC3: 'AC-3', A_EAC3: 'E-AC-3', A_DTS: 'DTS', A_FLAC: 'FLAC', A_MPEG_L3: 'MP3', 'A_PCM/INT/LIT': 'PCM', 'A_PCM/FLOAT/IEEE': 'PCM float', A_TRUEHD: 'Dolby TrueHD', 'S_TEXT/UTF8': 'SRT text', 'S_TEXT/ASS': 'ASS', 'S_TEXT/SSA': 'SSA', 'S_TEXT/WEBVTT': 'WebVTT', 'S_HDMV/PGS': 'PGS (Blu-ray)', 'S_VOBSUB': 'VobSub' };
  const HANDLERS = { vide: 'Video', soun: 'Audio', text: 'Text', sbtl: 'Subtitles', subt: 'Subtitles', clcp: 'Captions', tmcd: 'Timecode', meta: 'Metadata', hint: 'Hint', mdta: 'Metadata' };

  /* ---------------- MP4, MOV (ISO BMFF and QuickTime) ---------------- */
  async function topBoxes() {
    const out = [];
    let off = 0;
    while (off + 8 <= file.size && out.length < 10000) {
      const v = await rd(off, 16);
      let size = v.getUint32(0), hdr = 8;
      const type = cc(v, 4);
      if (!/^[\x20-\x7e]{4}$/.test(type)) break;
      if (size === 1) { if (v.byteLength < 16) break; size = u64(v, 8); hdr = 16; }
      else if (size === 0) size = file.size - off;
      if (size < hdr) break;
      out.push({ type, off, size, hdr });
      off += size;
    }
    return { boxes: out, end: off };
  }
  function kids(v, start, end) {
    const out = [];
    let o = start;
    while (o + 8 <= end) {
      let size = v.getUint32(o), hdr = 8;
      const type = cc(v, o + 4);
      if (size === 1) { size = u64(v, o + 8); hdr = 16; } else if (size === 0) size = end - o;
      if (size < hdr || o + size > end) break;
      out.push({ type, o, d: o + hdr, e: o + size });
      o += size;
    }
    return out;
  }
  const find = (v, s, e, path) => { let cur = { d: s, e }; for (const p of path.split('/')) { cur = kids(v, cur.d, cur.e).find(k => k.type === p); if (!cur) return null; } return cur; };
  const lang = c => c ? String.fromCharCode(((c >> 10) & 31) + 96, ((c >> 5) & 31) + 96, (c & 31) + 96) : '';
  const mp4date = s => s > 2082844800 && s < 2082844800 + 4102444800 ? new Date((s - 2082844800) * 1000).toISOString().replace('.000Z', 'Z') : '';

  function sampleEntry(v, stbl, handler) {
    const stsd = find(v, stbl.d, stbl.e, 'stsd');
    if (!stsd) return {};
    const n = v.getUint32(stsd.d + 4), ent = kids(v, stsd.d + 8, stsd.e)[0];
    if (!ent) return {};
    const r = { fourcc: ent.type, entries: n };
    const b = ent.o + 8;
    if (handler === 'vide' && ent.e - b >= 78) {
      r.w = v.getUint16(b + 24); r.h = v.getUint16(b + 26);
      const depth = v.getUint16(b + 74); if (depth && depth !== 24) r.depth = depth;
      const sub = kids(v, b + 78, ent.e);
      const avcC = sub.find(k => k.type === 'avcC'), hvcC = sub.find(k => k.type === 'hvcC'), pasp = sub.find(k => k.type === 'pasp'), colr = sub.find(k => k.type === 'colr');
      if (avcC && avcC.e - avcC.d >= 4) {
        const p = v.getUint8(avcC.d + 1), l = v.getUint8(avcC.d + 3);
        r.codecStr = ent.type + '.' + [p, v.getUint8(avcC.d + 2), l].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        r.profile = ({ 66: 'Baseline', 77: 'Main', 88: 'Extended', 100: 'High', 110: 'High 10', 122: 'High 4:2:2', 244: 'High 4:4:4' }[p] || 'profile ' + p) + ' @ L' + (l / 10);
      }
      if (hvcC && hvcC.e - hvcC.d >= 13) { const p = v.getUint8(hvcC.d + 1) & 31; r.profile = ({ 1: 'Main', 2: 'Main 10', 3: 'Main Still Picture', 4: 'Range extensions' }[p] || 'profile ' + p) + ' @ L' + (v.getUint8(hvcC.d + 12) / 30); }
      if (pasp && pasp.e - pasp.d >= 8) { const h = v.getUint32(pasp.d), vv = v.getUint32(pasp.d + 4); if (h && vv && h !== vv) r.par = h + ':' + vv; }
      if (colr && colr.e - colr.d >= 10 && /nclx|nclc/.test(cc(v, colr.d))) {
        const prim = v.getUint16(colr.d + 4), tr = v.getUint16(colr.d + 6);
        r.color = ({ 1: 'BT.709', 9: 'BT.2020', 12: 'Display P3', 6: 'BT.601' }[prim] || 'primaries ' + prim) + (tr === 16 ? ', HDR10 (PQ)' : tr === 18 ? ', HLG' : '');
      }
    } else if (handler === 'soun' && ent.e - b >= 28) {
      const ver = v.getUint16(b + 8);
      r.ch = v.getUint16(b + 16); r.bits = v.getUint16(b + 18); r.rate = v.getUint32(b + 24) >>> 16;
      if (ver === 2 && ent.e - b >= 64) { r.rate = Math.round(v.getFloat64(b + 32)); r.ch = v.getUint32(b + 40); }
      const sub = kids(v, b + 28 + (ver === 1 ? 16 : ver === 2 ? 36 : 0), ent.e);
      const esds = sub.find(k => k.type === 'esds') || (sub.find(k => k.type === 'wave') && find(v, sub.find(k => k.type === 'wave').d, sub.find(k => k.type === 'wave').e, 'esds'));
      if (esds) {  // find the DecoderSpecificInfo (tag 5) and read the AAC audio object type
        for (let o = esds.d + 4; o < esds.e - 2; o++) {
          if (v.getUint8(o) === 5) {
            let p = o + 1, len = 0, i = 0;
            do { len = (len << 7) | (v.getUint8(p) & 127); } while (v.getUint8(p++) & 128 && ++i < 4);
            if (len >= 2 && p < esds.e) { const aot = v.getUint8(p) >> 3; r.profile = ({ 1: 'AAC Main', 2: 'AAC-LC', 3: 'AAC SSR', 4: 'AAC LTP', 5: 'HE-AAC', 29: 'HE-AAC v2', 23: 'AAC-LD', 39: 'AAC-ELD' }[aot] || 'audio object type ' + aot); r.codecStr = 'mp4a.40.' + aot; }
            break;
          }
        }
      }
    }
    return r;
  }
  function tableSum(v, stbl) {
    const r = {};
    const stsz = find(v, stbl.d, stbl.e, 'stsz');
    if (stsz) {
      const fixed = v.getUint32(stsz.d + 4), n = v.getUint32(stsz.d + 8);
      r.samples = n;
      if (fixed) r.bytes = fixed * n;
      else { let s = 0; const lim = Math.min(n, (stsz.e - stsz.d - 12) / 4); for (let i = 0; i < lim; i++) s += v.getUint32(stsz.d + 12 + i * 4); r.bytes = s; }
    }
    const stss = find(v, stbl.d, stbl.e, 'stss');
    if (stss) r.keyframes = v.getUint32(stss.d + 4);
    return r;
  }
  function metaItems(v, meta, out) {
    // QuickTime 'mdta' keys (iPhone and camera MOV files) and iTunes-style ilst items
    let d = meta.d;
    if (cc(v, d + 4) !== 'hdlr' && cc(v, d + 8) === 'hdlr') d += 4;  // full box in MP4
    const ks = kids(v, d, meta.e), keys = ks.find(k => k.type === 'keys'), ilst = ks.find(k => k.type === 'ilst');
    const names = [];
    if (keys) { let o = keys.d + 8; const n = v.getUint32(keys.d + 4); for (let i = 0; i < n && o + 8 <= keys.e; i++) { const s = v.getUint32(o); if (s < 8) break; names.push(str(v, o + 8, s - 8)); o += s; } }
    if (!ilst) return;
    for (const it of kids(v, ilst.d, ilst.e)) {
      const data = kids(v, it.d, it.e).find(k => k.type === 'data');
      if (!data || data.e - data.d < 8) continue;
      const t = v.getUint32(data.d) & 0xffffff, name = /^[\x20-\x7e\xa9]{4}$/.test(it.type) ? it.type : names[v.getUint32(it.o + 4) - 1] || '';
      if (!name) continue;
      let val = t === 1 ? str(v, data.d + 8, data.e - data.d - 8) : t === 21 || t === 22 ? String(data.e - data.d - 8 === 1 ? v.getUint8(data.d + 8) : data.e - data.d - 8 >= 4 ? v.getUint32(data.d + 8) : '') : t === 23 ? String(v.getFloat32(data.d + 8)) : '';
      if (!val && (t === 13 || t === 14)) val = (t === 13 ? 'JPEG' : 'PNG') + ' picture, ' + self.zovoSize(data.e - data.d - 8);
      if (val) out.push([UDTA[name] || name.replace(/^com\.apple\.quicktime\./, '').replace(/^\xa9/, ''), val.slice(0, 300)]);
    }
  }
  const UDTA = { '\xa9too': 'Encoder', '\xa9day': 'Date', '\xa9xyz': 'Location (ISO 6709)', '\xa9mak': 'Make', '\xa9mod': 'Model', '\xa9swr': 'Software', '\xa9nam': 'Title', '\xa9cmt': 'Comment', '\xa9ART': 'Artist' };

  async function mp4() {
    const { boxes } = await topBoxes();
    const moovB = boxes.find(b => b.type === 'moov'), ftyp = boxes.find(b => b.type === 'ftyp'), mdat = boxes.find(b => b.type === 'mdat');
    const R = { container: 'MP4 / QuickTime', facts: [], tracks: [], meta: [], boxes };
    if (ftyp) {
      const v = await rd(ftyp.off + ftyp.hdr, Math.min(256, ftyp.size - ftyp.hdr));
      const major = cc(v, 0), compat = [];
      for (let o = 8; o + 4 <= v.byteLength; o += 4) compat.push(cc(v, o).trim());
      R.container = major === 'qt  ' ? 'QuickTime MOV' : /^M4V|^mp4|^iso|^avc|^dash|^MSNV|^XAVC/.test(major) ? 'MPEG-4 (MP4)' : /^3g/.test(major) ? '3GPP' : /^M4A|^M4B/.test(major) ? 'MPEG-4 audio' : 'ISO media (' + major.trim() + ')';
      R.facts.push(['Brands', major.trim() + (compat.length ? ' (compatible: ' + [...new Set(compat.filter(Boolean))].join(', ') + ')' : '')]);
    } else R.container = 'QuickTime MOV';
    if (boxes.some(b => b.type === 'moof')) R.facts.push(['Layout', 'Fragmented MP4 (moof fragments, as used by DASH and HLS)']);
    if (!moovB) {
      if (boxes.some(b => b.type === 'moof')) throw new Error('it is a fragment of a stream without its moov header (an init segment holds it).');
      throw new Error('it has no moov box, so the file is cut short or still being written. Boxes found: ' + boxes.slice(0, 12).map(b => b.type.trim()).join(', ') + '.');
    }
    if (moovB.size > MAXHDR) throw new Error('its moov header is ' + self.zovoSize(moovB.size) + ', more than this page reads (64 MB).');
    if (mdat) R.facts.push(['Header place', moovB.off < mdat.off ? 'moov before the media data (fast start, plays while it downloads)' : 'moov after the media data (a player must read the end of the file first)']);
    const v = await rd(moovB.off, moovB.size), s = moovB.hdr, e = moovB.size;
    const mvhd = find(v, s, e, 'mvhd');
    let movieDur = 0;
    if (mvhd) {
      const ver = v.getUint8(mvhd.d), ts = v.getUint32(mvhd.d + (ver ? 20 : 12)), d = ver ? u64(v, mvhd.d + 24) : v.getUint32(mvhd.d + 16);
      movieDur = ts ? d / ts : 0;
      const made = mp4date(ver ? u64(v, mvhd.d + 4) : v.getUint32(mvhd.d + 4));
      if (made) R.facts.push(['Created (UTC, from the file)', made]);
    }
    R.duration = movieDur;
    for (const trak of kids(v, s, e).filter(k => k.type === 'trak')) {
      const t = {}, tkhd = find(v, trak.d, trak.e, 'tkhd'), mdia = find(v, trak.d, trak.e, 'mdia');
      if (tkhd) { const ver = v.getUint8(tkhd.d), fl = v.getUint32(tkhd.d) & 0xffffff, b = tkhd.d + (ver ? 32 : 20); t.id = v.getUint32(tkhd.d + (ver ? 20 : 12)); t.enabled = !!(fl & 1); const wo = tkhd.d + (ver ? 88 : 76); if (wo + 8 <= tkhd.e) { t.dw = v.getUint32(wo) / 65536; t.dh = v.getUint32(wo + 4) / 65536; } void b; }
      if (!mdia) continue;
      const mdhd = find(v, mdia.d, mdia.e, 'mdhd'), hdlr = find(v, mdia.d, mdia.e, 'hdlr'), stbl = find(v, mdia.d, mdia.e, 'minf/stbl');
      if (mdhd) { const ver = v.getUint8(mdhd.d), ts = v.getUint32(mdhd.d + (ver ? 20 : 12)), d = ver ? u64(v, mdhd.d + 24) : v.getUint32(mdhd.d + 16); t.dur = ts ? d / ts : 0; const lg = lang(v.getUint16(mdhd.d + (ver ? 32 : 20))); if (lg && lg !== 'und' && /^[a-z]{3}$/.test(lg)) t.lang = lg; }
      if (hdlr) { t.handler = cc(v, hdlr.d + 8); let nm = str(v, hdlr.d + 24, hdlr.e - hdlr.d - 24); if (nm && nm.charCodeAt(0) === nm.length - 1) nm = nm.slice(1); nm = nm.replace(/^[\x00-\x1f]/, '').trim(); if (nm && nm.length < 80) t.name = nm; }
      if (stbl) Object.assign(t, sampleEntry(v, stbl, t.handler), tableSum(v, stbl));
      R.tracks.push(t);
    }
    const udta = find(v, s, e, 'udta');
    if (udta) for (const k of kids(v, udta.d, udta.e)) {
      if (UDTA[k.type] && k.e - k.d > 4) { const n = v.getUint16(k.d); R.meta.push([UDTA[k.type], str(v, k.d + 4, Math.min(n || k.e - k.d - 4, 300))]); }
      if (k.type === 'meta') metaItems(v, k, R.meta);
    }
    const meta = find(v, s, e, 'meta');
    if (meta) metaItems(v, meta, R.meta);
    return R;
  }

  /* ---------------- Matroska and WebM (EBML) ---------------- */
  async function mkv() {
    const R = { container: 'Matroska (MKV)', facts: [], tracks: [], meta: [] };
    const vint = (v, o, mask) => {  // returns [value, length]; unknown size gives -1
      const b = v.getUint8(o); let len = 1, m = 0x80;
      while (len <= 8 && !(b & m)) { len++; m >>= 1; }
      if (len > 8) throw new Error('a broken EBML number at byte ' + o + '.');
      let val = mask ? b & (m - 1) : b, all = (b & (m - 1)) === m - 1;
      for (let i = 1; i < len; i++) { const x = v.getUint8(o + i); val = val * 256 + x; if (x !== 255) all = false; }
      return [mask && all ? -1 : val, len];
    };
    const el = (v, o) => { const [id, il] = vint(v, o, false), [sz, sl] = vint(v, o + il, true); return { id, d: o + il + sl, size: sz, hl: il + sl }; };
    const uint = (v, o, n) => { let x = 0; for (let i = 0; i < n; i++) x = x * 256 + v.getUint8(o + i); return x; };
    const flt = (v, o, n) => n === 4 ? v.getFloat32(o) : n === 8 ? v.getFloat64(o) : 0;
    const children = (v, s, e) => { const out = []; let o = s; while (o < e) { let x; try { x = el(v, o); } catch (er) { break; } const end = x.size < 0 ? e : x.d + x.size; out.push({ ...x, e: Math.min(end, e) }); if (x.size < 0 || end > e) break; o = end; } return out; };

    let v = await rd(0, 64);
    const head = el(v, 0);
    if (head.id !== 0x1a45dfa3) throw new Error('it does not start with an EBML header.');
    v = await rd(0, head.d + head.size + 16);
    for (const c of children(v, head.d, head.d + head.size)) {
      if (c.id === 0x4282) { const dt = str(v, c.d, c.size); R.container = dt === 'webm' ? 'WebM' : dt === 'matroska' ? 'Matroska (MKV)' : 'EBML (' + dt + ')'; }
      if (c.id === 0x4287) R.facts.push(['DocType version', String(uint(v, c.d, c.size))]);
    }
    const segOff = head.d + head.size, sv = await rd(segOff, 16), seg = el(sv, 0);
    if (seg.id !== 0x18538067) throw new Error('the Segment element is missing.');
    const segData = segOff + seg.hl, segEnd = seg.size < 0 ? file.size : Math.min(file.size, segData + seg.size);
    const want = { 0x1549a966: 'info', 0x1654ae6b: 'tracks', 0x1254c367: 'tags', 0x1043a770: 'chapters', 0x1c53bb6b: 'cues', 0x1f43b675: 'cluster', 0x114d9b74: 'seek' }, at = {};
    // walk the top level by seeking; stop at the first Cluster and use the SeekHead for what comes after it
    let o = segData, n = 0;
    while (o < segEnd && n++ < 5000) {
      const hv = await rd(o, 16);
      let x; try { x = el(hv, 0); } catch (er) { break; }
      const name = want[x.id];
      if (name && !at[name]) at[name] = { off: o + x.hl, size: x.size < 0 ? segEnd - o - x.hl : x.size };
      if (name === 'seek' && x.size > 0 && x.size < 1048576) {
        const s2 = await rd(o + x.hl, x.size);
        for (const sk of children(s2, 0, x.size).filter(k => k.id === 0x4dbb)) {
          let id = 0, pos = -1;
          for (const f of children(s2, sk.d, sk.e)) { if (f.id === 0x53ab) id = uint(s2, f.d, f.size); if (f.id === 0x53ac) pos = uint(s2, f.d, f.size); }
          if (want[id] && pos >= 0 && !at['@' + want[id]]) at['@' + want[id]] = segData + pos;
        }
      }
      if (x.size < 0 || name === 'cluster') break;
      o += x.hl + x.size;
    }
    for (const k of ['info', 'tracks', 'tags', 'chapters']) {
      if (at[k] || at['@' + k] === undefined || at['@' + k] >= file.size) continue;
      const hv = await rd(at['@' + k], 16); try { const x = el(hv, 0); at[k] = { off: at['@' + k] + x.hl, size: x.size }; } catch (er) { /* seek entry points nowhere */ }
    }
    let scale = 1e6;
    if (at.info && at.info.size < MAXHDR) {
      const iv = await rd(at.info.off, at.info.size);
      let d = 0;
      for (const c of children(iv, 0, at.info.size)) {
        if (c.id === 0x2ad7b1) scale = uint(iv, c.d, c.size);
        else if (c.id === 0x4489) d = flt(iv, c.d, c.size);
        else if (c.id === 0x7ba9) R.meta.push(['Title', str(iv, c.d, Math.min(c.size, 300))]);
        else if (c.id === 0x4d80) R.meta.push(['Muxing app', str(iv, c.d, Math.min(c.size, 300))]);
        else if (c.id === 0x5741) R.meta.push(['Writing app', str(iv, c.d, Math.min(c.size, 300))]);
        else if (c.id === 0x4461 && c.size === 8) { const ns = Number(iv.getBigInt64(c.d)); R.facts.push(['Created (UTC, from the file)', new Date(Date.UTC(2001, 0, 1) + ns / 1e6).toISOString().replace('.000Z', 'Z')]); }
      }
      R.duration = d * scale / 1e9;
    }
    if (at.tracks && at.tracks.size < MAXHDR) {
      const tv = await rd(at.tracks.off, at.tracks.size);
      for (const te of children(tv, 0, at.tracks.size).filter(c => c.id === 0xae)) {
        const t = { lang: 'eng' };
        for (const c of children(tv, te.d, te.e)) {
          if (c.id === 0xd7) t.id = uint(tv, c.d, c.size);
          else if (c.id === 0x83) t.handler = { 1: 'vide', 2: 'soun', 3: 'complex', 16: 'logo', 17: 'subt', 18: 'button', 32: 'control', 33: 'meta' }[uint(tv, c.d, c.size)];
          else if (c.id === 0x86) t.fourcc = str(tv, c.d, c.size);
          else if (c.id === 0x536e) t.name = str(tv, c.d, Math.min(c.size, 200));
          else if (c.id === 0x22b59c) t.lang = str(tv, c.d, c.size);
          else if (c.id === 0x22b59d) t.lang = str(tv, c.d, c.size);
          else if (c.id === 0x23e383) { const ns = uint(tv, c.d, c.size); if (ns) t.fps = 1e9 / ns; }
          else if (c.id === 0xb9) t.enabled = uint(tv, c.d, c.size) !== 0;
          else if (c.id === 0x88) t.isDefault = uint(tv, c.d, c.size) !== 0;
          else if (c.id === 0xe0) for (const x of children(tv, c.d, c.e)) { if (x.id === 0xb0) t.w = uint(tv, x.d, x.size); if (x.id === 0xba) t.h = uint(tv, x.d, x.size); if (x.id === 0x54b0) t.dw = uint(tv, x.d, x.size); if (x.id === 0x54ba) t.dh = uint(tv, x.d, x.size); }
          else if (c.id === 0xe1) for (const x of children(tv, c.d, c.e)) { if (x.id === 0xb5) t.rate = flt(tv, x.d, x.size); if (x.id === 0x9f) t.ch = uint(tv, x.d, x.size); if (x.id === 0x6264) t.bits = uint(tv, x.d, x.size); }
        }
        if (t.lang === 'und') delete t.lang;
        R.tracks.push(t);
      }
    }
    if (at.chapters) R.facts.push(['Chapters', 'yes']);
    if (at.tags && at.tags.size < 4 * 1048576) {
      const gv = await rd(at.tags.off, at.tags.size);
      const walk = (s, e, depth) => { for (const c of children(gv, s, e)) { if (c.id === 0x67c8 && depth < 6) { let nm = '', val = ''; for (const x of children(gv, c.d, c.e)) { if (x.id === 0x45a3) nm = str(gv, x.d, x.size); if (x.id === 0x4487) val = str(gv, x.d, Math.min(x.size, 300)); } if (nm && val && nm !== 'DURATION' && R.meta.length < 60 && !R.meta.some(m => m[0] === nm && m[1] === val)) R.meta.push([nm, val]); } else if ((c.id === 0x7373) && depth < 3) walk(c.d, c.e, depth + 1); } };
      walk(0, at.tags.size, 0);
    }
    if (!at.tracks) throw new Error('no Tracks element was found, so the file is cut short or not a finished recording.');
    return R;
  }

  /* ---------------- AVI (RIFF) ---------------- */
  async function avi() {
    const R = { container: 'AVI', facts: [], tracks: [], meta: [] };
    let o = 12, n = 0;
    while (o + 12 <= file.size && n++ < 1000) {
      const h = await rd(o, 12), id = cc(h, 0), size = h.getUint32(4, true);
      if (id === 'LIST' && cc(h, 8) === 'hdrl' && size < MAXHDR) {
        const v = await rd(o + 12, size - 4);
        const chunks = (s, e) => { const out = []; let p = s; while (p + 8 <= e) { const sz = v.getUint32(p + 4, true); out.push({ id: cc(v, p), d: p + 8, sz, list: cc(v, p) === 'LIST' ? cc(v, p + 8) : '' }); p += 8 + sz + (sz & 1); } return out; };
        for (const c of chunks(0, v.byteLength)) {
          if (c.id === 'avih' && c.sz >= 40) { const us = v.getUint32(c.d, true); R.facts.push(['Frames (header)', String(v.getUint32(c.d + 16, true))]); R.usPerFrame = us; R.totalFrames = v.getUint32(c.d + 16, true); }
          if (c.list === 'strl') {
            const t = {};
            for (const s of chunks(c.d + 4, c.d + c.sz)) {
              if (s.id === 'strh' && s.sz >= 36) { const ty = cc(v, s.d); t.handler = ty === 'vids' ? 'vide' : ty === 'auds' ? 'soun' : ty === 'txts' ? 'text' : ty; t.fourcc = cc(v, s.d + 4).replace(/\0/g, ' ').trim(); const sc = v.getUint32(s.d + 20, true), rt = v.getUint32(s.d + 24, true), len = v.getUint32(s.d + 32, true); if (sc && t.handler === 'vide') { t.fps = rt / sc; t.samples = len; t.dur = len * sc / rt; } }
              if (s.id === 'strf' && t.handler === 'vide' && s.sz >= 20) { t.w = v.getInt32(s.d + 4, true); t.h = Math.abs(v.getInt32(s.d + 8, true)); const comp = cc(v, s.d + 16); if (/^[\x20-\x7e]{4}$/.test(comp)) t.fourcc = comp.trim(); }
              if (s.id === 'strf' && t.handler === 'soun' && s.sz >= 16) { const tag = v.getUint16(s.d, true); t.fourcc = ({ 1: 'PCM', 3: 'PCM float', 0x55: 'MP3', 0x2000: 'AC-3', 0xff: 'AAC', 0x161: 'WMA', 0x50: 'MPEG audio' }[tag] || 'format 0x' + tag.toString(16)); t.ch = v.getUint16(s.d + 2, true); t.rate = v.getUint32(s.d + 4, true); t.bitrate = v.getUint32(s.d + 8, true) * 8; t.bits = v.getUint16(s.d + 14, true); }
              if (s.id === 'strn') t.name = str(v, s.d, s.sz);
            }
            R.tracks.push(t);
          }
        }
        if (R.usPerFrame && R.totalFrames) R.duration = R.usPerFrame * R.totalFrames / 1e6;
      } else if (id === 'LIST' && cc(h, 8) === 'INFO' && size < 1048576) {
        const v = await rd(o + 12, size - 4);
        const NAMES = { ISFT: 'Software', INAM: 'Title', ICRD: 'Date', IART: 'Artist', ICMT: 'Comment' };
        for (let p = 0; p + 8 <= v.byteLength;) { const id2 = cc(v, p), sz = v.getUint32(p + 4, true); if (NAMES[id2]) R.meta.push([NAMES[id2], str(v, p + 8, Math.min(sz, 300))]); p += 8 + sz + (sz & 1); }
      } else if (id === 'LIST' && cc(h, 8) === 'movi') break;
      o += 8 + size + (size & 1);
    }
    if (!R.tracks.length) throw new Error('no stream headers (hdrl) were found.');
    return R;
  }

  /* ---------------- show ---------------- */
  function trackRows(R) {
    const total = R.duration || 0;
    return R.tracks.map((t, i) => {
      const kind = HANDLERS[t.handler] || (t.handler ? String(t.handler) : 'Other');
      const codec = (CODECS[t.fourcc] || CODECS[(t.fourcc || '').trim()] || MKVC[t.fourcc] || (t.fourcc || '').replace(/^V_|^A_|^S_/, '').replace(/MPEG4\/ISO\/AVC/, 'H.264').replace(/MPEGH\/ISO\/HEVC/, 'H.265 (HEVC)') || '?') +
        (t.profile ? ', ' + t.profile : '') + (t.fourcc && CODECS[t.fourcc] ? ' (' + (t.codecStr || t.fourcc) + ')' : '');
      const d = t.dur || total, parts = [];
      if (t.w) parts.push(t.w + ' x ' + t.h + (t.dw && Math.round(t.dw) !== t.w ? ' (shown as ' + Math.round(t.dw) + ' x ' + Math.round(t.dh) + ')' : '') + (t.par ? ', pixel aspect ' + t.par : ''));
      const f = t.handler === 'vide' ? t.fps || (t.samples && d ? t.samples / d : 0) : 0;
      if (f) parts.push(fps(f));
      if (t.handler === 'vide' && t.samples) parts.push(t.samples.toLocaleString('en-US') + ' frames' + (t.keyframes ? ', ' + t.keyframes.toLocaleString('en-US') + ' keyframes' : ''));
      if (t.color) parts.push(t.color);
      if (t.depth) parts.push(t.depth + '-bit');
      if (t.rate) parts.push(Math.round(t.rate).toLocaleString('en-US') + ' Hz');
      if (t.ch) parts.push(t.ch === 1 ? 'mono' : t.ch === 2 ? 'stereo' : t.ch + ' channels');
      if (t.bits && t.handler === 'soun' && /PCM|lpcm|sowt|twos|in24|fl32|ipcm/i.test(codec)) parts.push(t.bits + '-bit');
      const br = t.bitrate ? kbps(t.bitrate / 8, 1) : kbps(t.bytes, d);
      return [i + 1, kind + (t.enabled === false ? ' (off)' : ''), codec, parts.join(', '), br, d ? dur(d) : '', t.lang || '', t.name || ''];
    });
  }

  function render(R) {
    info = R;
    const v = R.tracks.find(t => t.handler === 'vide'), a = R.tracks.find(t => t.handler === 'soun');
    const facts = [['Container', R.container], ['File size', self.zovoSize(file.size)], ['Duration', dur(R.duration)], ['Overall bitrate', kbps(file.size, R.duration)]];
    if (v && v.w) facts.push(['Video', v.w + ' x ' + v.h]);
    $('vfacts').innerHTML = facts.concat(R.facts).filter(p => p[1]).map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('');
    $('vtracks').tBodies[0].innerHTML = trackRows(R).map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') || '<tr><td colspan="8" class="mut">No tracks.</td></tr>';
    $('metaBox').hidden = !R.meta.length;
    $('vmeta').innerHTML = R.meta.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('');
    $('boxBox').hidden = !R.boxes;
    if (R.boxes) $('vboxes').textContent = R.boxes.slice(0, 200).map(b => b.type.trim().padEnd(5) + ' at ' + String(b.off).padStart(12) + '  ' + self.zovoSize(b.size)).join('\n') + (R.boxes.length > 200 ? '\n...' : '');
    // the browser's own player; the facts above do not depend on it
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file);
    const vid = $('player');
    vid.hidden = false; $('playNote').textContent = '';
    vid.src = url;
    S.fps = v ? (v.fps || (v.samples && (v.dur || R.duration) ? v.samples / (v.dur || R.duration) : 30)) : 30;
    void a;
  }
  const S = { fps: 30 };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  self.zovoOpen = async f => {
    file = f;
    $('player').removeAttribute('src'); $('player').load();
    const h = await rd(0, 16);
    if (h.byteLength < 12) throw new Error('the file is too small to be a video.');
    const t4 = cc(h, 4);
    let R;
    if (h.getUint32(0) === 0x1a45dfa3) R = await mkv();
    else if (cc(h, 0) === 'RIFF' && cc(h, 8) === 'AVI ') R = await avi();
    else if (/^(ftyp|moov|mdat|free|wide|skip|pnot|styp|uuid)$/.test(t4)) R = await mp4();
    else if (cc(h, 0) === 'RIFF') throw new Error('it is a RIFF file of type ' + cc(h, 8).trim() + ', not AVI. A WAV file is audio.');
    else throw new Error('it is not an MP4, MOV, MKV, WebM or AVI file. The first bytes are ' + [...new Uint8Array(h.buffer).slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join(' ') + '.');
    render(R);
  };

  $('player').addEventListener('error', () => {
    if (!$('player').getAttribute('src')) return;
    $('playNote').textContent = 'This browser cannot play this file (' + (info && info.tracks.map(t => CODECS[t.fourcc] || t.fourcc).filter(Boolean).join(', ')) + '). The facts above come from the file itself. The VS Code extension converts such files with your ffmpeg and plays them.';
  });
  $('player').addEventListener('loadedmetadata', () => { const p = $('player'); if (p.videoWidth === 0 && info && info.tracks.some(t => t.handler === 'vide')) $('playNote').textContent = 'The browser plays the sound but cannot decode this video codec. The facts above come from the file itself.'; });
  const step = d => { const p = $('player'); p.pause(); p.currentTime = Math.max(0, Math.min(p.duration || 0, p.currentTime + d / S.fps)); };
  $('back').addEventListener('click', () => step(-1));
  $('fwd').addEventListener('click', () => step(1));
  $('player').addEventListener('timeupdate', () => { const p = $('player'); $('ptime').textContent = dur(p.currentTime) + ', frame ' + Math.floor(p.currentTime * S.fps + 1e-6); });
  $('savePng').addEventListener('click', () => {
    const p = $('player');
    if (!p.videoWidth) { self.zovoMsg('There is no picture to save yet. Play the video or move to a frame first.', true); return; }
    const c = document.createElement('canvas'); c.width = p.videoWidth; c.height = p.videoHeight;
    c.getContext('2d').drawImage(p, 0, 0);
    c.toBlob(b => {
      const a = document.createElement('a'), t = p.currentTime;
      a.href = URL.createObjectURL(b);
      a.download = file.name.replace(/\.[^.]+$/, '') + '-' + String(Math.floor(t / 60)).padStart(2, '0') + 'm' + (t % 60).toFixed(3).replace('.', 's').padStart(6, '0') + '.png';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      self.zovoMsg('Saved the frame at ' + dur(t) + ' as a ' + c.width + ' x ' + c.height + ' PNG.');
    }, 'image/png');
  });
  $('copyInfo').addEventListener('click', async () => {
    if (!info) return;
    const lines = [file.name];
    document.querySelectorAll('#vfacts tr, #vmeta tr').forEach(tr => lines.push(tr.cells[0].textContent + ': ' + tr.cells[1].textContent));
    trackRows(info).forEach(r => lines.push('Track ' + r[0] + ': ' + r.slice(1).filter(Boolean).join(', ')));
    try { await navigator.clipboard.writeText(lines.join('\n')); self.zovoMsg('Info copied as plain text.'); }
    catch (e) { self.zovoMsg('The browser did not allow the copy.', true); }
  });
})();
