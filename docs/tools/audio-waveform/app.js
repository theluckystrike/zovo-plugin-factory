/* Audio Waveform and Loudness Online (TOOLCHK, wave18; first draft by HTOOL5, rewritten). Plain JavaScript, no library,
   no request. WAV (PCM 8 to 32-bit, float 32 and 64-bit, A-law, mu-law, extensible, RF64) is decoded by the code below;
   MP3, FLAC, Ogg Vorbis, Opus and M4A by the browser's own decoder. Loudness follows ITU-R BS.1770-4 (K-weighting,
   400 ms blocks, absolute and relative gates). Tags come from ID3v1 and v2, RIFF INFO, FLAC and Ogg comments.
   The player uses a blob: URL of the file. Values from the file are written as text, never as HTML. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const MAXDECODED = 600 * 1048576;
  const td = new TextDecoder('utf-8'), latin = new TextDecoder('latin1');
  let S = null, url = null, loop = null;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tfmt = s => { if (!isFinite(s)) return ''; const m = Math.floor(s / 60), x = s - m * 60; return m + ':' + x.toFixed(2).padStart(5, '0'); };
  const db = v => v > 0 ? (20 * Math.log10(v)).toFixed(2) + ' dBFS' : '-inf dBFS';
  const str4 = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);

  /* ---------------- WAV ---------------- */
  const alaw = x => { x ^= 0x55; let t = (x & 15) << 4; const s = (x & 0x70) >> 4; t += 8; if (s) t = (t + 0x100) << (s - 1); return (x & 0x80 ? t : -t) / 32768; };
  const ulaw = x => { x = ~x & 255; let t = ((x & 15) << 3) + 0x84; t <<= (x & 0x70) >> 4; return (x & 0x80 ? 0x84 - t : t - 0x84) / 32768; };
  function wav(u8, tags, info) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), rf64 = str4(u8, 0) === 'RF64';
    let p = 12, fmt = null, data = null, ds64 = null;
    while (p + 8 <= u8.length) {
      const id = str4(u8, p); let sz = dv.getUint32(p + 4, true);
      if (id === 'ds64') ds64 = Number(dv.getBigUint64(p + 16, true));
      if (id === 'data' && (sz === 0xffffffff || rf64) && ds64) sz = ds64;
      const body = u8.subarray(p + 8, Math.min(u8.length, p + 8 + sz));
      if (id === 'fmt ' && body.length >= 16) {
        const b = new DataView(body.buffer, body.byteOffset, body.byteLength);
        fmt = { tag: b.getUint16(0, true), ch: b.getUint16(2, true), rate: b.getUint32(4, true), bits: b.getUint16(14, true) };
        if (fmt.tag === 0xfffe && body.length >= 26) { fmt.ext = true; fmt.tag = b.getUint16(24, true); }
      } else if (id === 'data') data = body;
      else if (id === 'LIST' && str4(body, 0) === 'INFO') {
        const N = { INAM: 'title', IART: 'artist', IPRD: 'album', ICRD: 'date', IGNR: 'genre', ITRK: 'track', ICMT: 'comment', ISFT: 'encoder', ICOP: 'copyright', IENG: 'engineer' };
        for (let q = 4; q + 8 <= body.length;) { const k = str4(body, q), n = new DataView(body.buffer, body.byteOffset + q + 4, 4).getUint32(0, true); tags.push([N[k] || k, latin.decode(body.subarray(q + 8, q + 8 + n)).replace(/\0+$/, '')]); q += 8 + n + (n & 1); }
      } else if (id === 'id3 ' || id === 'ID3 ') id3(body, tags);
      else if (id === 'bext') info.push(['Broadcast WAV (bext)', latin.decode(body.subarray(0, 256)).replace(/\0[\s\S]*$/, '').trim() || 'yes']);
      if (id === 'data' && sz > u8.length - p - 8) { info.push(['Note', 'The data chunk claims more bytes than the file has, so the file is cut short.']); }
      p += 8 + sz + (sz & 1);
    }
    if (!fmt || !data) throw new Error('the WAV file has no fmt or data chunk.');
    const codec = { 1: 'PCM', 3: 'IEEE float', 6: 'A-law', 7: 'mu-law' }[fmt.tag];
    if (!codec) throw new Error('its WAV format code is ' + fmt.tag + ' (only PCM, float, A-law and mu-law are decoded here). The header says ' + fmt.ch + ' channels at ' + fmt.rate + ' Hz.');
    const bps = fmt.bits >> 3, ch = fmt.ch, n = Math.floor(data.length / (bps * ch));
    if (!n || !ch) throw new Error('the WAV data chunk is empty.');
    if (n * ch * 4 > MAXDECODED) return { codec: codec + ' ' + fmt.bits + '-bit', rate: fmt.rate, ch, bits: fmt.bits, chans: null, frames: n, big: true };
    const out = Array.from({ length: ch }, () => new Float32Array(n)), d = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let i = 0, o = 0; i < n; i++) for (let c = 0; c < ch; c++, o += bps) {
      let v;
      if (fmt.tag === 3) v = bps === 8 ? d.getFloat64(o, true) : d.getFloat32(o, true);
      else if (fmt.tag === 6) v = alaw(d.getUint8(o));
      else if (fmt.tag === 7) v = ulaw(d.getUint8(o));
      else if (bps === 1) v = (d.getUint8(o) - 128) / 128;
      else if (bps === 2) v = d.getInt16(o, true) / 32768;
      else if (bps === 3) { let x = d.getUint8(o) | (d.getUint8(o + 1) << 8) | (d.getInt8(o + 2) << 16); v = x / 8388608; }
      else v = d.getInt32(o, true) / 2147483648;
      out[c][i] = v;
    }
    return { codec: codec + ' ' + fmt.bits + '-bit' + (fmt.ext ? ' (extensible)' : '') + (rf64 ? ', RF64' : ''), rate: fmt.rate, ch, bits: fmt.bits, chans: out, frames: n };
  }

  /* ---------------- tags ---------------- */
  const ID3N = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album', TDRC: 'date', TYER: 'date', TYE: 'date', TCON: 'genre', TCO: 'genre', TRCK: 'track', TRK: 'track', TENC: 'encoded by', TSSE: 'encoder', TSS: 'encoder', TPE2: 'album artist', TCOM: 'composer', TBPM: 'bpm', TKEY: 'key', TCOP: 'copyright', TPUB: 'publisher' };
  function id3text(b) {
    const enc = b[0], s = b.subarray(1);
    const t = enc === 1 || enc === 2 ? new TextDecoder(enc === 2 ? 'utf-16be' : 'utf-16').decode(s) : enc === 3 ? td.decode(s) : latin.decode(s);
    return t.replace(/\0+$/, '').split('\0').filter(Boolean).join(' / ');
  }
  function id3(u8, tags) {
    if (u8.length < 10 || String.fromCharCode(u8[0], u8[1], u8[2]) !== 'ID3') return 0;
    const v = u8[3], ss = o => (u8[o] << 21) | (u8[o + 1] << 14) | (u8[o + 2] << 7) | u8[o + 3], size = ss(6), end = Math.min(u8.length, 10 + size);
    let p = 10 + (u8[5] & 0x40 && v >= 3 ? (v === 4 ? ss(10) : (u8[10] << 24 | u8[11] << 16 | u8[12] << 8 | u8[13]) + 4) : 0);
    const idl = v === 2 ? 3 : 4, hl = v === 2 ? 6 : 10;
    while (p + hl <= end) {
      const id = String.fromCharCode(...u8.subarray(p, p + idl));
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const n = v === 2 ? (u8[p + 3] << 16 | u8[p + 4] << 8 | u8[p + 5]) : v === 4 ? ss(p + 4) : (u8[p + 4] << 24 | u8[p + 5] << 16 | u8[p + 6] << 8 | u8[p + 7]) >>> 0;
      const b = u8.subarray(p + hl, p + hl + n);
      if (ID3N[id] && b.length) tags.push([ID3N[id], id3text(b).slice(0, 300)]);
      else if ((id === 'COMM' || id === 'COM') && b.length > 4) tags.push(['comment', id3text(new Uint8Array([b[0], ...b.subarray(4)])).slice(0, 300)]);
      else if ((id === 'TXXX' || id === 'TXX') && b.length > 1) { const t = id3text(b).split(' / '); if (t.length > 1) tags.push([t[0], t.slice(1).join(' / ').slice(0, 300)]); }
      else if (id === 'APIC' || id === 'PIC') tags.push(['picture', self.zovoSize(n)]);
      p += hl + n;
    }
    tags.push(['tag format', 'ID3v2.' + v]);
    return 10 + size;
  }
  function vorbisComments(b, tags) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p = 0; const vl = dv.getUint32(p, true); p += 4; tags.push(['encoder', td.decode(b.subarray(p, p + vl))]); p += vl;
    const n = dv.getUint32(p, true); p += 4;
    for (let i = 0; i < n && p + 4 <= b.length; i++) { const l = dv.getUint32(p, true); p += 4; const s = td.decode(b.subarray(p, p + l)); p += l; const k = s.indexOf('='); if (k > 0) tags.push(/^METADATA_BLOCK_PICTURE$/i.test(s.slice(0, k)) ? ['picture', 'yes'] : [s.slice(0, k).toLowerCase(), s.slice(k + 1).slice(0, 300)]); }
  }
  function headerInfo(u8, tags, info) {
    const m = str4(u8, 0);
    if (m === 'fLaC') {
      for (let p = 4; p + 4 <= u8.length;) {
        const last = u8[p] & 128, type = u8[p] & 127, n = (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3], b = u8.subarray(p + 4, p + 4 + n);
        if (type === 0 && n >= 34) {
          const rate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4), ch = ((b[12] >> 1) & 7) + 1, bits = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
          const total = (b[13] & 15) * 2 ** 32 + ((b[14] << 24) >>> 0) + (b[15] << 16) + (b[16] << 8) + b[17];
          info.push(['FLAC stream', bits + '-bit, ' + rate + ' Hz, ' + ch + ' channels, ' + total.toLocaleString('en-US') + ' samples'], ['FLAC MD5', [...b.subarray(18, 34)].map(x => x.toString(16).padStart(2, '0')).join('')]);
          info.bits = bits; info.rate = rate;
        } else if (type === 4) vorbisComments(b, tags);
        else if (type === 6) tags.push(['picture', self.zovoSize(n)]);
        p += 4 + n; if (last) break;
      }
      return 'FLAC';
    }
    if (m === 'OggS') {
      const head = latin.decode(u8.subarray(0, Math.min(u8.length, 65536)));
      const opus = head.indexOf('OpusHead'), vorb = head.indexOf('\x01vorbis');
      if (vorb >= 0) info.rate = new DataView(u8.buffer, u8.byteOffset + vorb + 12, 4).getUint32(0, true);
      if (opus >= 0) { const d = new DataView(u8.buffer, u8.byteOffset + opus); info.rate = 48000; info.push(['Opus', 'pre-skip ' + d.getUint16(10, true) + ' samples, original rate ' + d.getUint32(12, true) + ' Hz']); }
      const tagAt = opus >= 0 ? head.indexOf('OpusTags') : head.indexOf('\x03vorbis');
      if (tagAt >= 0) try { vorbisComments(u8.subarray(tagAt + (opus >= 0 ? 8 : 7)), tags); } catch (e) { /* comment packet spans pages */ }
      return opus >= 0 ? 'Opus (Ogg)' : vorb >= 0 ? 'Vorbis (Ogg)' : 'Ogg';
    }
    if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) { const end = id3(u8, tags); const x = u8.subarray(end, end + 200); const xi = latin.decode(x).search(/Xing|Info/); if (xi >= 0) info.push(['MP3 header', latin.decode(x).slice(xi, xi + 4) + ' (VBR or gapless info)']); info.rate = mp3Rate(u8, end); return 'MP3'; }
    if (u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0) { if ((u8[1] & 0x06) === 0) return 'AAC (ADTS)'; info.rate = mp3Rate(u8, 0); return 'MP3'; }
    if (str4(u8, 4) === 'ftyp') { info.push(['MP4 brand', str4(u8, 8).trim()]); return 'AAC or ALAC (M4A)'; }
    return '';
  }
  function mp3Rate(u8, p) {  // the sample rate of the first MPEG audio frame
    for (let i = p, e = Math.min(u8.length - 4, p + 65536); i < e; i++) if (u8[i] === 0xff && (u8[i + 1] & 0xe0) === 0xe0) {
      const ver = (u8[i + 1] >> 3) & 3, si = (u8[i + 2] >> 2) & 3; if (ver === 1 || si === 3) continue;
      return [44100, 48000, 32000][si] / (ver === 3 ? 1 : ver === 2 ? 2 : 4);
    }
    return 0;
  }
  function id3v1(u8, tags) {
    if (u8.length < 128) return;
    const t = u8.subarray(u8.length - 128);
    if (t[0] !== 0x54 || t[1] !== 0x41 || t[2] !== 0x47) return;
    const f = (a, b) => latin.decode(t.subarray(a, b)).replace(/\0[\s\S]*$/, '').trim();
    if (!tags.some(x => x[0] === 'title')) [['title', f(3, 33)], ['artist', f(33, 63)], ['album', f(63, 93)], ['date', f(93, 97)]].forEach(x => x[1] && tags.push(x));
    tags.push(['tag format', 'ID3v1']);
  }

  /* ---------------- loudness (ITU-R BS.1770-4) and stats ---------------- */
  function biquad(x, b0, b1, b2, a1, a2) {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; }
    return y;
  }
  function kweight(x, fs) {
    let K = Math.tan(Math.PI * 1681.974450955533 / fs), Q = 0.7071752369554196;
    const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416;
    let a0 = 1 + K / Q + K * K;
    const s1 = biquad(x, (Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
    K = Math.tan(Math.PI * 38.13547087602444 / fs); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
    return biquad(s1, 1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0);
  }
  function loudness(chans, fs) {
    const n = chans[0].length, seg = Math.round(fs / 10), nseg = Math.floor(n / seg);
    const w = chans.length === 6 ? [1, 1, 1, 0, 1.41, 1.41] : chans.map(() => 1);
    const E = new Float64Array(nseg);  // weighted energy of every 100 ms
    chans.forEach((c, ci) => {
      if (!w[ci]) return;
      const k = kweight(c, fs);
      for (let s = 0; s < nseg; s++) { let sum = 0; for (let i = s * seg, e = i + seg; i < e; i++) sum += k[i] * k[i]; E[s] += w[ci] * sum; }
    });
    const block = len => { const out = []; let acc = 0; for (let s = 0; s < nseg; s++) { acc += E[s]; if (s >= len) acc -= E[s - len]; if (s >= len - 1) out.push(acc / (len * seg)); } return out; };
    const L = z => -0.691 + 10 * Math.log10(z), m400 = block(4), m3s = block(30);
    const gated1 = m400.filter(z => L(z) > -70);
    let integ = -Infinity;
    if (gated1.length) { const rel = L(gated1.reduce((a, b) => a + b, 0) / gated1.length) - 10, g2 = gated1.filter(z => L(z) > rel); if (g2.length) integ = L(g2.reduce((a, b) => a + b, 0) / g2.length); }
    // loudness range (EBU Tech 3342): short-term values, -70 absolute and -20 relative gate, 10th to 95th percentile
    let lra = null;
    const st = m3s.filter(z => L(z) > -70);
    if (st.length > 2) { const rel = L(st.reduce((a, b) => a + b, 0) / st.length) - 20, v = st.map(L).filter(x => x > rel).sort((a, b) => a - b); if (v.length > 2) lra = v[Math.floor(.95 * (v.length - 1))] - v[Math.floor(.10 * (v.length - 1))]; }
    const mx = a => a.length ? L(Math.max(...a)) : -Infinity;
    return { integ, mom: mx(m400), short: mx(m3s), lra };
  }
  function chanStats(c) {
    let peak = 0, sum = 0, dc = 0, clip = 0;
    for (let i = 0; i < c.length; i++) { const v = c[i], a = v < 0 ? -v : v; if (a > peak) peak = a; sum += v * v; dc += v; if (a >= 0.9999) clip++; }
    return { peak, rms: Math.sqrt(sum / c.length), dc: dc / c.length, clip };
  }

  /* ---------------- drawing ---------------- */
  function drawWave(cv, c, i) {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = 110; cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = getComputedStyle(document.documentElement);
    x.fillStyle = col.getPropertyValue('--line'); x.fillRect(0, h / 2, w, 1);
    x.fillStyle = col.getPropertyValue('--acc');
    const step = c.length / w;
    for (let px = 0; px < w; px++) {
      let mn = 1, mx = -1; const a = Math.floor(px * step), b = Math.min(c.length, Math.floor((px + 1) * step) + 1);
      for (let k = a; k < b; k++) { const v = c[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mn > mx) continue;
      x.fillRect(px, (1 - Math.min(1, mx)) * h / 2, 1, Math.max(1, (Math.min(1, mx) - Math.max(-1, mn)) * h / 2));
    }
    x.fillStyle = col.getPropertyValue('--mut'); x.font = '11px system-ui'; x.fillText('Ch ' + (i + 1), 4, 12);
  }
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const a = i + k, b = a + h, vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr; re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  function drawSpec(cv, c, fs) {
    const w = Math.min(1200, Math.max(200, cv.clientWidth)), h = 160, N = 2048; cv.width = w; cv.height = h; cv.style.height = h + 'px';
    const x = cv.getContext('2d'), img = x.createImageData(w, h), re = new Float32Array(N), im = new Float32Array(N), win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
    const fmin = 20, fmax = fs / 2, bins = new Int32Array(h);
    for (let y = 0; y < h; y++) bins[y] = Math.min(N / 2 - 1, Math.max(1, Math.round(fmin * (fmax / fmin) ** (y / (h - 1)) / fs * N)));
    for (let px = 0; px < w; px++) {
      const off = Math.floor(px / w * Math.max(0, c.length - N));
      for (let i = 0; i < N; i++) { re[i] = (c[off + i] || 0) * win[i]; im[i] = 0; }
      fft(re, im);
      for (let y = 0; y < h; y++) {
        const b = bins[y], v = Math.max(0, Math.min(1, (20 * Math.log10(Math.hypot(re[b], im[b]) / (N / 4) + 1e-9) + 90) / 90)), o = ((h - 1 - y) * w + px) * 4;
        img.data[o] = 255 * Math.min(1, v * 1.6); img.data[o + 1] = 255 * Math.max(0, v * 1.6 - .5); img.data[o + 2] = 255 * Math.min(1, .25 + v) * (1 - v * .6); img.data[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }
  function redraw() {
    if (!S || !S.chans) return;
    const box = $('lanes'); box.textContent = '';
    S.chans.slice(0, 8).forEach((c, i) => { const cv = document.createElement('canvas'); cv.className = 'wv'; box.append(cv); drawWave(cv, c, i); });
    const sp = document.createElement('canvas'); sp.className = 'sp'; sp.setAttribute('aria-label', 'Spectrogram of channel 1, 20 Hz at the bottom to ' + Math.round(S.rate / 2) + ' Hz at the top, log scale');
    box.append(sp); drawSpec(sp, S.chans[0], S.rate);
  }

  /* ---------------- open ---------------- */
  self.zovoOpen = async file => {
    const u8 = new Uint8Array(await file.arrayBuffer()), tags = [], info = [];
    let R;
    if ((str4(u8, 0) === 'RIFF' || str4(u8, 0) === 'RF64') && str4(u8, 8) === 'WAVE') R = wav(u8, tags, info);
    else {
      const kind = headerInfo(u8, tags, info);
      id3v1(u8, tags);
      if (!kind && !/^audio\//.test(file.type)) throw new Error('it does not look like a WAV, MP3, FLAC, Ogg, Opus or M4A file.');
      if (file.size > 150 * 1048576) R = { codec: kind || file.type, chans: null, big: true };
      else {
        const ctx = new OfflineAudioContext(1, 1, info.rate >= 3000 && info.rate <= 768000 ? info.rate : 48000);
        let buf;
        try { buf = await ctx.decodeAudioData(u8.slice().buffer); } catch (e) { throw new Error('this browser could not decode it (' + (kind || 'unknown format') + '). The header facts are below.'); }
        R = { codec: kind || 'decoded by the browser', rate: buf.sampleRate, rateNote: info.rate ? '' : ' (the rate the browser decoded at; the file header does not say it in a form this page reads)', ch: buf.numberOfChannels, bits: info.bits || 0, chans: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), frames: buf.length };
              }
    }
    S = Object.assign(R, { name: file.name, size: file.size });
    const dur = R.frames && R.rate ? R.frames / R.rate : NaN;
    const facts = [['Codec', R.codec], ['Sample rate', R.rate ? R.rate.toLocaleString('en-US') + ' Hz' + (R.rateNote || '') : ''], ['Channels', R.ch || ''], ['Bit depth', R.bits ? R.bits + '-bit' : ''], ['Duration', tfmt(dur)], ['Bitrate', isFinite(dur) && dur > 0 ? Math.round(file.size * 8 / dur / 1000) + ' kb/s' : ''], ['File size', self.zovoSize(file.size)]].concat(info.filter(x => x[0] !== 'bits'));
    $('afacts').innerHTML = facts.filter(f => f[1] !== '' && f[1] != null).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    $('tagBox').hidden = !tags.length;
    $('atags').innerHTML = tags.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    if (R.chans) {
      const L = loudness(R.chans, R.rate), st = R.chans.map(chanStats), f = v => isFinite(v) ? v.toFixed(1) + ' LUFS' : 'silence';
      $('loud').innerHTML = [['Integrated', f(L.integ)], ['Max short-term (3 s)', f(L.short)], ['Max momentary (400 ms)', f(L.mom)], ['Loudness range', L.lra == null ? '' : L.lra.toFixed(1) + ' LU']].filter(x => x[1]).map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
      $('chstats').tBodies[0].innerHTML = st.map((s, i) => `<tr><td>${i + 1}</td><td>${db(s.peak)}</td><td>${db(s.rms)}</td><td>${s.dc.toFixed(5)}</td><td>${s.clip.toLocaleString('en-US')}</td></tr>`).join('');
      S.loud = L; S.stats = st;
    } else { $('loud').innerHTML = '<p class="small mut">The file is too big for the waveform and loudness on this page (over 600 MB of samples, or over 150 MB packed). It still plays below.</p>'; $('chstats').tBodies[0].innerHTML = ''; }
    $('statBox').hidden = !R.chans;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file); loop = null; $('loopTxt').textContent = '';
    $('player').src = url; $('player').playbackRate = +$('speed').value;
    redraw();
    return 'Opened ' + file.name + (R.chans ? ': integrated loudness ' + (isFinite(S.loud.integ) ? S.loud.integ.toFixed(1) + ' LUFS.' : 'silence.') : '.');
  };

  /* ---------------- player, seek and loop ---------------- */
  const P = $('player');
  $('player').addEventListener('error', () => { if (P.getAttribute('src')) $('loopTxt').textContent = 'This browser cannot play this file. The facts above still come from the file.'; });
  $('speed').addEventListener('change', () => { P.playbackRate = +$('speed').value; P.preservesPitch = true; });
  const lanePos = e => { const r = $('lanes').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  let dragA = null;
  $('lanes').addEventListener('pointerdown', e => { if (!S || !isFinite(P.duration)) return; dragA = lanePos(e); $('lanes').setPointerCapture(e.pointerId); });
  $('lanes').addEventListener('pointerup', e => {
    if (dragA === null) return; const b = lanePos(e), a = dragA; dragA = null;
    if (Math.abs(b - a) < .005) { P.currentTime = a * P.duration; loop = null; $('loopTxt').textContent = ''; }
    else { loop = [Math.min(a, b) * P.duration, Math.max(a, b) * P.duration]; P.currentTime = loop[0]; P.play(); $('loopTxt').textContent = 'Loop ' + tfmt(loop[0]) + ' to ' + tfmt(loop[1]) + '. Click the waveform to clear it.'; }
    mark();
  });
  function mark() {
    const d = P.duration || 1, head = $('head'), lp = $('loopBand');
    head.style.left = (P.currentTime / d * 100) + '%';
    lp.hidden = !loop; if (loop) { lp.style.left = (loop[0] / d * 100) + '%'; lp.style.width = ((loop[1] - loop[0]) / d * 100) + '%'; }
    $('ptime').textContent = tfmt(P.currentTime) + ' / ' + tfmt(P.duration);
  }
  P.addEventListener('timeupdate', () => { if (loop && P.currentTime >= loop[1]) P.currentTime = loop[0]; mark(); });
  const tick = () => { if (!P.paused) { if (loop && P.currentTime >= loop[1]) P.currentTime = loop[0]; mark(); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  addEventListener('keydown', e => {
    if (!S || /^(INPUT|SELECT|TEXTAREA|AUDIO)$/.test(document.activeElement.tagName)) return;
    if (e.key === ' ') { e.preventDefault(); P.paused ? P.play() : P.pause(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); P.currentTime = Math.max(0, P.currentTime + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 5)); }
  });
  $('copyStats').addEventListener('click', async () => {
    if (!S) return;
    const lines = [S.name].concat([...document.querySelectorAll('#afacts tr, #atags tr')].map(tr => tr.cells[0].textContent + ': ' + tr.cells[1].textContent));
    if (S.loud) lines.push('Integrated loudness: ' + S.loud.integ.toFixed(1) + ' LUFS', 'Max short-term: ' + S.loud.short.toFixed(1) + ' LUFS', 'Max momentary: ' + S.loud.mom.toFixed(1) + ' LUFS', ...(S.loud.lra != null ? ['Loudness range: ' + S.loud.lra.toFixed(1) + ' LU'] : []), ...S.stats.map((s, i) => `Channel ${i + 1}: peak ${db(s.peak)}, RMS ${db(s.rms)}, DC ${s.dc.toFixed(5)}, clipped ${s.clip}`));
    try { await navigator.clipboard.writeText(lines.join('\n')); self.zovoMsg('Stats copied as plain text.'); } catch (e) { self.zovoMsg('The browser did not allow the copy.', true); }
  });
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(redraw, 200); });
  addEventListener('zovo-theme', redraw);
})();
