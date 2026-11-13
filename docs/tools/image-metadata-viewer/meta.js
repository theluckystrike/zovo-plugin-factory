/* Image Metadata Viewer (TOOLCHK5, wave18, 13 Nov 2026): reads the metadata of an image file in the browser.
   EXIF (camera, settings, dates, GPS) from JPEG APP1, PNG eXIf, WebP EXIF, TIFF and HEIC/AVIF; PNG text chunks
   (tEXt, zTXt, iTXt), DPI, ICC and XMP presence, the JPEG segment and PNG/WebP chunk lists, GIF frames and loops.
   Plain JavaScript, no network. Every read is bounds-checked and every loop is capped, so a cut or hostile file gives
   a partial answer and a warning, never a hang. Values are returned as plain strings for textContent only. */
(function (root) {
  'use strict';
  const LIMIT_IFD = 1000, LIMIT_SEG = 5000;
  const ascii = (b, o, n) => (o >= 0 && o + n <= b.length ? String.fromCharCode.apply(null, b.subarray(o, o + n)) : '');
  const u16be = (b, o) => (o + 2 <= b.length ? (b[o] << 8) | b[o + 1] : -1);
  const u32be = (b, o) => (o + 4 <= b.length ? b[o] * 0x1000000 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3] : -1);
  const u16le = (b, o) => (o + 2 <= b.length ? b[o] | (b[o + 1] << 8) : -1);
  const u32le = (b, o) => (o + 4 <= b.length ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : -1);
  const latin1 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return s; };
  const utf8 = (b) => new TextDecoder('utf-8', { fatal: false }).decode(b);
  const clean = (s) => String(s).replace(/\0+$/, '').replace(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').trim();

  // ---- EXIF tag names (TIFF/EXIF 2.32 and GPS) ----
  const IFD0 = {
    0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution', 0x011b: 'YResolution',
    0x0128: 'ResolutionUnit', 0x0131: 'Software', 0x0132: 'DateTime', 0x013b: 'Artist', 0x013c: 'HostComputer', 0x0213: 'YCbCrPositioning',
    0x8298: 'Copyright', 0x0100: 'ImageWidth', 0x0101: 'ImageLength', 0x0102: 'BitsPerSample', 0x0103: 'Compression',
    0x0106: 'PhotometricInterpretation', 0x0115: 'SamplesPerPixel', 0x011c: 'PlanarConfiguration', 0x0201: 'ThumbnailOffset', 0x0202: 'ThumbnailLength',
    0x4746: 'Rating', 0x0142: 'TileWidth', 0x0143: 'TileLength', 0x0111: 'StripOffsets', 0x0116: 'RowsPerStrip', 0x0117: 'StripByteCounts', 0x8769: 'ExifIFD',
  };
  const EXIF = {
    0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram', 0x8827: 'ISO', 0x8830: 'SensitivityType', 0x9000: 'ExifVersion',
    0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0x9012: 'OffsetTimeDigitized',
    0x9101: 'ComponentsConfiguration', 0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9203: 'BrightnessValue', 0x9204: 'ExposureBiasValue',
    0x9205: 'MaxApertureValue', 0x9206: 'SubjectDistance', 0x9207: 'MeteringMode', 0x9208: 'LightSource', 0x9209: 'Flash', 0x920a: 'FocalLength',
    0x9214: 'SubjectArea', 0x927c: 'MakerNote', 0x9286: 'UserComment', 0x9290: 'SubSecTime', 0x9291: 'SubSecTimeOriginal', 0x9292: 'SubSecTimeDigitized',
    0xa000: 'FlashpixVersion', 0xa001: 'ColorSpace', 0xa002: 'PixelXDimension', 0xa003: 'PixelYDimension', 0xa217: 'SensingMethod',
    0xa300: 'FileSource', 0xa301: 'SceneType', 0xa401: 'CustomRendered', 0xa402: 'ExposureMode', 0xa403: 'WhiteBalance', 0xa404: 'DigitalZoomRatio',
    0xa405: 'FocalLengthIn35mmFilm', 0xa406: 'SceneCaptureType', 0xa408: 'Contrast', 0xa409: 'Saturation', 0xa40a: 'Sharpness',
    0xa420: 'ImageUniqueID', 0xa430: 'CameraOwnerName', 0xa431: 'BodySerialNumber', 0xa432: 'LensSpecification', 0xa433: 'LensMake',
    0xa434: 'LensModel', 0xa435: 'LensSerialNumber', 0xa460: 'CompositeImage',
  };
  const GPS = {
    0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude', 0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude',
    0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x0009: 'GPSStatus', 0x000a: 'GPSMeasureMode', 0x000b: 'GPSDOP',
    0x000c: 'GPSSpeedRef', 0x000d: 'GPSSpeed', 0x000e: 'GPSTrackRef', 0x000f: 'GPSTrack', 0x0010: 'GPSImgDirectionRef', 0x0011: 'GPSImgDirection',
    0x0012: 'GPSMapDatum', 0x0017: 'GPSDestBearingRef', 0x0018: 'GPSDestBearing', 0x001b: 'GPSProcessingMethod', 0x001d: 'GPSDateStamp', 0x001f: 'GPSHPositioningError',
  };
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };

  /** Reads a TIFF structure (EXIF block) at b[base...]. Returns { ifd0, exif, gps, ifd1, le, warnings }. */
  function readTiff(b, base, end) {
    end = Math.min(end == null ? b.length : end, b.length);
    const t = b.subarray(base, end);
    const out = { ifd0: {}, exif: {}, gps: {}, ifd1: {}, warnings: [] };
    const bo = ascii(t, 0, 2);
    if (bo !== 'II' && bo !== 'MM') { out.warnings.push('The EXIF block has no TIFF byte order mark.'); return out; }
    const le = bo === 'II'; out.le = le;
    const r16 = (o) => (le ? u16le(t, o) : u16be(t, o)), r32 = (o) => (le ? u32le(t, o) : u32be(t, o));
    const s32 = (o) => { const v = r32(o); return v > 0x7fffffff ? v - 0x100000000 : v; };
    if (r16(2) !== 42) { out.warnings.push('The EXIF block has a bad TIFF header.'); return out; }
    const seen = new Set();
    const value = (type, count, vo) => {
      const one = (o) => {
        switch (type) {
          case 1: case 6: case 7: return t[o];
          case 3: case 8: return r16(o);
          case 4: case 13: return r32(o);
          case 9: return s32(o);
          case 5: { const n = r32(o), d = r32(o + 4); return [n, d]; }
          case 10: { const n = s32(o), d = s32(o + 4); return [n, d]; }
          case 11: return new DataView(t.buffer, t.byteOffset + o, 4).getFloat32(0, le);
          case 12: return new DataView(t.buffer, t.byteOffset + o, 8).getFloat64(0, le);
          default: return null;
        }
      };
      const sz = SIZE[type] || 1;
      if (vo < 0 || vo + sz * count > t.length) return undefined;
      if (type === 2) return clean(latin1(t.subarray(vo, vo + count)));
      if (type === 7 || type === 1) {
        if (count > 64) return t.subarray(vo, vo + count);
        const a = []; for (let i = 0; i < count; i++) a.push(t[vo + i]); return type === 7 ? Uint8Array.from(a) : (count === 1 ? a[0] : a);
      }
      const n = Math.min(count, 256), a = [];
      for (let i = 0; i < n; i++) a.push(one(vo + i * sz));
      return count === 1 ? a[0] : a;
    };
    const readIfd = (off, names, into, label) => {
      if (off <= 0 || off + 2 > t.length) { if (off) out.warnings.push(`The ${label} directory points outside the file.`); return 0; }
      if (seen.has(off)) { out.warnings.push(`The ${label} directory loops back; stopped.`); return 0; }
      seen.add(off);
      const n = r16(off);
      if (n > LIMIT_IFD) { out.warnings.push(`The ${label} directory claims ${n} entries; read the first ${LIMIT_IFD}.`); }
      const subs = [];
      for (let i = 0; i < Math.min(n, LIMIT_IFD); i++) {
        const e = off + 2 + i * 12;
        if (e + 12 > t.length) { out.warnings.push(`The ${label} directory is cut short.`); break; }
        const tag = r16(e), type = r16(e + 2), count = r32(e + 4);
        const sz = (SIZE[type] || 1) * count;
        const vo = sz <= 4 ? e + 8 : r32(e + 8);
        if (tag === 0x8769 || tag === 0x8825 || tag === 0xa005) { subs.push([tag, r32(e + 8)]); continue; }
        if (!SIZE[type]) continue;
        const v = value(type, count, vo);
        if (v === undefined) { out.warnings.push(`Tag 0x${tag.toString(16).padStart(4, '0')} in ${label} points outside the file.`); continue; }
        into[names[tag] || 'Tag 0x' + tag.toString(16).padStart(4, '0')] = v;
      }
      for (const [tag, o] of subs) {
        if (tag === 0x8769 && label === 'IFD0') readIfd(o, EXIF, out.exif, 'EXIF');
        if (tag === 0x8825 && label === 'IFD0') readIfd(o, GPS, out.gps, 'GPS');
      }
      const nextAt = off + 2 + Math.min(n, LIMIT_IFD) * 12;
      return nextAt + 4 <= t.length ? r32(nextAt) : 0;
    };
    const next = readIfd(r32(4), IFD0, out.ifd0, 'IFD0');
    if (next) readIfd(next, IFD0, out.ifd1, 'IFD1');
    return out;
  }

  // ---- Value formatting ----
  const rat = (v) => (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' ? (v[1] ? v[0] / v[1] : NaN) : typeof v === 'number' ? v : NaN);
  const num = (x, d) => (Number.isFinite(x) ? String(+x.toFixed(d == null ? 4 : d)) : '');
  const ORIENT = { 1: 'Normal', 2: 'Mirrored', 3: 'Rotated 180°', 4: 'Mirrored vertically', 5: 'Mirrored, rotated 90° left', 6: 'Rotated 90° right', 7: 'Mirrored, rotated 90° right', 8: 'Rotated 90° left' };
  const PROGRAM = { 0: 'Not defined', 1: 'Manual', 2: 'Program (auto)', 3: 'Aperture priority', 4: 'Shutter priority', 5: 'Creative', 6: 'Action', 7: 'Portrait', 8: 'Landscape' };
  const METER = { 0: 'Unknown', 1: 'Average', 2: 'Center-weighted average', 3: 'Spot', 4: 'Multi-spot', 5: 'Pattern', 6: 'Partial', 255: 'Other' };
  const UNIT = { 1: 'None', 2: 'Inches', 3: 'Centimeters' };
  const ENUMS = {
    Orientation: ORIENT, ExposureProgram: PROGRAM, MeteringMode: METER, ResolutionUnit: UNIT,
    ColorSpace: { 1: 'sRGB', 2: 'Adobe RGB', 0xffff: 'Uncalibrated' }, ExposureMode: { 0: 'Auto', 1: 'Manual', 2: 'Auto bracket' },
    WhiteBalance: { 0: 'Auto', 1: 'Manual' }, SceneCaptureType: { 0: 'Standard', 1: 'Landscape', 2: 'Portrait', 3: 'Night' },
    SensingMethod: { 1: 'Not defined', 2: 'One-chip color area', 3: 'Two-chip color area', 4: 'Three-chip color area', 5: 'Color sequential area', 7: 'Trilinear', 8: 'Color sequential linear' },
    YCbCrPositioning: { 1: 'Centered', 2: 'Co-sited' }, CustomRendered: { 0: 'Normal', 1: 'Custom', 2: 'HDR (no original saved)', 3: 'HDR (original saved)', 6: 'Panorama', 7: 'Portrait HDR', 8: 'Portrait' },
    Contrast: { 0: 'Normal', 1: 'Low', 2: 'High' }, Saturation: { 0: 'Normal', 1: 'Low', 2: 'High' }, Sharpness: { 0: 'Normal', 1: 'Soft', 2: 'Hard' },
    LightSource: { 0: 'Unknown', 1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten', 4: 'Flash', 9: 'Fine weather', 10: 'Cloudy', 11: 'Shade', 255: 'Other' },
    Compression: { 1: 'None', 5: 'LZW', 6: 'JPEG (old style)', 7: 'JPEG', 8: 'Deflate', 32773: 'PackBits' },
    GPSAltitudeRef: { 0: 'Above sea level', 1: 'Below sea level' },
  };
  function flash(v) {
    if (typeof v !== 'number') return '';
    const fired = v & 1 ? 'Fired' : 'Did not fire', mode = { 1: ', compulsory', 2: ', off', 3: ', auto' }[(v >> 3) & 3] || '';
    return fired + mode + (v & 0x40 ? ', red-eye reduction' : '') + (v & 0x20 ? ', no flash function' : '');
  }
  function show(key, v) {
    if (v == null) return '';
    if (v instanceof Uint8Array) {
      if (/Version|ComponentsConfiguration/.test(key)) return key === 'ComponentsConfiguration' ? Array.from(v).map((x) => ['-', 'Y', 'Cb', 'Cr', 'R', 'G', 'B'][x] || '?').join('') : clean(latin1(v));
      if (key === 'UserComment' || key === 'GPSProcessingMethod') { const code = latin1(v.subarray(0, 8)); const rest = v.subarray(8); return clean(code.startsWith('UNICODE') ? new TextDecoder('utf-16' + (rest[0] === 0 ? 'be' : 'le')).decode(rest) : latin1(rest)); }
      if (key === 'SceneType' && v.length === 1) return v[0] === 1 ? 'Directly photographed (1)' : String(v[0]);
      if (key === 'FileSource' && v.length === 1) return ({ 1: 'Film scanner', 2: 'Reflection print scanner', 3: 'Digital camera' })[v[0]] || String(v[0]);
      return v.length + ' bytes of binary data';
    }
    if (ENUMS[key] && typeof v === 'number') return (ENUMS[key][v] || 'Unknown') + ' (' + v + ')';
    if (key === 'Flash') return flash(v) + ' (' + v + ')';
    if (key === 'ExposureTime') { const s = rat(v); return Number.isFinite(s) ? (s < 1 && s > 0 ? '1/' + Math.round(1 / s) + ' s' : num(s, 3) + ' s') : ''; }
    if (key === 'FNumber' || key === 'ApertureValue' || key === 'MaxApertureValue') { const f = key === 'FNumber' ? rat(v) : Math.pow(2, rat(v) / 2); return Number.isFinite(f) ? 'f/' + num(f, 1) : ''; }
    if (key === 'FocalLength') return num(rat(v), 2) + ' mm';
    if (key === 'FocalLengthIn35mmFilm') return v + ' mm';
    if (key === 'ExposureBiasValue') { const x = rat(v); return Number.isFinite(x) ? (x > 0 ? '+' : '') + num(x, 2) + ' EV' : ''; }
    if (key === 'ShutterSpeedValue') { const x = rat(v); return Number.isFinite(x) ? '1/' + Math.round(Math.pow(2, x)) + ' s' : ''; }
    if (key === 'GPSLatitude' || key === 'GPSLongitude') return Array.isArray(v) && v.length === 3 ? dms(v) : '';
    if (key === 'GPSAltitude') return num(rat(v), 2) + ' m';
    if (key === 'GPSTimeStamp' && Array.isArray(v) && v.length === 3) return v.map((x, i) => (i < 2 ? String(Math.round(rat(x))).padStart(2, '0') : num(rat(x), 2).padStart(2, '0'))).join(':') + ' UTC';
    if (key === 'GPSVersionID' && Array.isArray(v)) return v.join('.');
    if (key === 'LensSpecification' && Array.isArray(v) && v.length === 4) { const a = v.map(rat); return `${num(a[0], 1)}-${num(a[1], 1)} mm, f/${num(a[2], 1)}-${num(a[3], 1)}`; }
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && !Array.isArray(v[0]) && /Resolution|Speed|Track|Direction|Bearing|Value|Distance|DOP|Zoom|Error/.test(key)) return num(rat(v), 4);
    if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? num(rat(x), 4) : String(x))).slice(0, 32).join(', ') + (v.length > 32 ? ', ...' : '');
    return String(v);
  }
  function dms(v) {
    const [d, m, s] = v.map(rat);
    return `${num(d, 0)}° ${num(m, 0)}' ${num(s, 2)}"`;
  }
  function gpsDecimal(g) {
    const one = (v, ref, neg) => {
      if (!Array.isArray(v) || v.length !== 3) return null;
      const [d, m, s] = v.map(rat);
      if (![d, m, s].every(Number.isFinite)) return null;
      const x = d + m / 60 + s / 3600;
      return String(ref || '').toUpperCase().startsWith(neg) ? -x : x;
    };
    const lat = one(g.GPSLatitude, g.GPSLatitudeRef, 'S'), lon = one(g.GPSLongitude, g.GPSLongitudeRef, 'W');
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const alt = rat(g.GPSAltitude);
    return { lat, lon, alt: Number.isFinite(alt) ? (g.GPSAltitudeRef === 1 ? -alt : alt) : null };
  }

  // ---- Containers ----
  function jpeg(b, r) {
    let off = 2;
    r.segments = [];
    for (let n = 0; off + 4 <= b.length && n < LIMIT_SEG; n++) {
      if (b[off] !== 0xff) { r.warnings.push('Stray bytes between JPEG segments at offset ' + off + '.'); break; }
      const m = b[off + 1];
      if (m === 0xff) { off++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { off += 2; continue; }
      if (m === 0xd9) break;
      const len = u16be(b, off + 2);
      if (len < 2 || off + 2 + len > b.length) { r.warnings.push('A JPEG segment runs past the end of the file.'); break; }
      const p = off + 4, pe = off + 2 + len;
      const name = m >= 0xe0 && m <= 0xef ? 'APP' + (m - 0xe0) : m === 0xfe ? 'COM' : m === 0xdb ? 'DQT' : m === 0xc4 ? 'DHT' : m === 0xda ? 'SOS' : m === 0xdd ? 'DRI' : m >= 0xc0 && m <= 0xcf ? 'SOF' + (m - 0xc0) : '0x' + m.toString(16);
      let what = '';
      if (m === 0xe0 && ascii(b, p, 5) === 'JFIF\0') {
        what = 'JFIF ' + b[p + 5] + '.' + String(b[p + 6]).padStart(2, '0');
        const unit = b[p + 7], dx = u16be(b, p + 8), dy = u16be(b, p + 10);
        r.facts.push(['JFIF', `version ${b[p + 5]}.${String(b[p + 6]).padStart(2, '0')}, density ${dx} x ${dy} ${unit === 1 ? 'dpi' : unit === 2 ? 'dots per cm' : '(aspect ratio only)'}`]);
      } else if (m === 0xe1 && ascii(b, p, 6) === 'Exif\0\0') {
        what = 'EXIF'; if (!r.tiff) { r.tiff = readTiff(b, p + 6, pe); r.exifAt = 'JPEG APP1'; }
        r.strip.push([off, pe]);
      } else if (m === 0xe1 && ascii(b, p, 29) === 'http://ns.adobe.com/xap/1.0/\0') {
        what = 'XMP'; r.xmp = utf8(b.subarray(p + 29, pe)); r.strip.push([off, pe]);
      } else if (m === 0xe1 && ascii(b, p, 35) === 'http://ns.adobe.com/xmp/extension/\0') { what = 'XMP (extended part)'; r.strip.push([off, pe]); }
      else if (m === 0xe2 && ascii(b, p, 12) === 'ICC_PROFILE\0') { what = 'ICC color profile'; r.icc = (r.icc || 0) + len; r.iccDesc = r.iccDesc || iccDesc(b.subarray(p + 14, pe)); }
      else if (m === 0xe2 && ascii(b, p, 4) === 'MPF\0') what = 'Multi-picture (MPF)';
      else if (m === 0xed && ascii(b, p, 14) === 'Photoshop 3.0\0') { what = 'Photoshop IRB (IPTC)'; r.iptc = true; r.strip.push([off, pe]); }
      else if (m === 0xee && ascii(b, p, 5) === 'Adobe') what = 'Adobe';
      else if (m === 0xfe) { const c = clean(utf8(b.subarray(p, pe))); what = 'Comment'; r.texts.push(['JPEG comment', c]); }
      else if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const kinds = { 0: 'Baseline', 1: 'Extended sequential', 2: 'Progressive', 3: 'Lossless' };
        what = (kinds[m - 0xc0] || 'Frame') + ', ' + b[p] + '-bit, ' + b[p + 5] + ' components';
        r.facts.push(['Encoding', (kinds[m - 0xc0] || 'SOF' + (m - 0xc0)) + ', ' + b[p] + ' bits per sample, ' + b[p + 5] + ' color components']);
        if (b[p + 5] === 3 && p + 5 + 9 <= pe) { const h = b[p + 7] >> 4, v = b[p + 7] & 15; r.facts.push(['Chroma subsampling', h === 2 && v === 2 ? '4:2:0' : h === 2 && v === 1 ? '4:2:2' : h === 1 && v === 1 ? '4:4:4' : h + 'x' + v]); }
      }
      r.segments.push([name, off, len + 2, what]);
      if (m === 0xda) { r.segments.push(['Image data', off + 2 + len, b.length - off - 2 - len, 'compressed scan data']); break; }
      off = pe;
    }
  }
  function iccDesc(p) {
    // An ICC profile's 'desc' tag (v2 'desc' or v4 'mluc'); only when the profile is in one APP2 chunk.
    const n = u32be(p, 128);
    for (let i = 0; i < Math.min(n, 100); i++) {
      const e = 132 + i * 12;
      if (ascii(p, e, 4) !== 'desc') continue;
      const o = u32be(p, e + 4);
      if (ascii(p, o, 4) === 'desc') { const l = u32be(p, o + 8); return l > 0 && l < 256 ? clean(latin1(p.subarray(o + 12, o + 12 + l))) : ''; }
      if (ascii(p, o, 4) === 'mluc') { const so = u32be(p, o + 20), sl = u32be(p, o + 24); return sl > 0 && sl < 512 && o + so + sl <= p.length ? clean(new TextDecoder('utf-16be').decode(p.subarray(o + so, o + so + sl))) : ''; }
    }
    return '';
  }
  async function inflate(bytes) {
    if (typeof DecompressionStream !== 'function') return null;
    try {
      const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      const buf = new Uint8Array(await new Response(s).arrayBuffer());
      return buf.length > 1 << 20 ? buf.subarray(0, 1 << 20) : buf;
    } catch (e) { return null; }
  }
  async function png(b, r) {
    let off = 8; r.chunks = [];
    const counts = {};
    for (let n = 0; off + 12 <= b.length && n < LIMIT_SEG; n++) {
      const len = u32be(b, off), type = ascii(b, off + 4, 4), p = off + 8;
      if (len < 0 || p + len + 4 > b.length) { r.warnings.push('The ' + type + ' chunk runs past the end of the file.'); break; }
      counts[type] = (counts[type] || 0) + 1;
      if (type !== 'IDAT' || counts[type] === 1) r.chunks.push([type, off, len]);
      const d = b.subarray(p, p + len);
      if (type === 'IHDR') {
        const ct = { 0: 'Grayscale', 2: 'RGB', 3: 'Indexed (palette)', 4: 'Grayscale + alpha', 6: 'RGBA' }[d[9]] || 'Unknown';
        r.facts.push(['Color', ct + ', ' + d[8] + ' bits per channel']); r.facts.push(['Interlace', d[12] ? 'Adam7' : 'None']);
      } else if (type === 'pHYs') {
        const x = u32be(d, 0), y = u32be(d, 4);
        r.facts.push(['Pixel density', d[8] === 1 ? `${Math.round(x * 0.0254)} x ${Math.round(y * 0.0254)} dpi` : `aspect ${x}:${y}`]);
      } else if (type === 'tEXt') { const z = d.indexOf(0); if (z > 0) r.texts.push([latin1(d.subarray(0, z)), clean(latin1(d.subarray(z + 1)))]); }
      else if (type === 'zTXt') {
        const z = d.indexOf(0);
        if (z > 0) { const t = await inflate(d.subarray(z + 2)); r.texts.push([latin1(d.subarray(0, z)), t ? clean(latin1(t)) : '(compressed text this browser cannot unpack)']); }
      } else if (type === 'iTXt') {
        const z = d.indexOf(0);
        if (z > 0) {
          const key = latin1(d.subarray(0, z)), comp = d[z + 1];
          let q = z + 3; const z2 = d.indexOf(0, q); const lang = z2 >= 0 ? latin1(d.subarray(q, z2)) : ''; q = z2 + 1;
          const z3 = d.indexOf(0, q); q = z3 + 1;
          let body = d.subarray(q);
          if (comp === 1) body = (await inflate(body)) || new Uint8Array(0);
          const text = clean(utf8(body));
          if (key === 'XML:com.adobe.xmp') r.xmp = text; else r.texts.push([key + (lang ? ' (' + lang + ')' : ''), text]);
        }
      } else if (type === 'eXIf') { if (!r.tiff) { r.tiff = readTiff(b, p, p + len); r.exifAt = 'PNG eXIf chunk'; } }
      else if (type === 'iCCP') { const z = d.indexOf(0); r.icc = len; r.iccDesc = z > 0 ? latin1(d.subarray(0, z)) : ''; }
      else if (type === 'sRGB') r.facts.push(['Color space', 'sRGB (' + (['Perceptual', 'Relative colorimetric', 'Saturation', 'Absolute colorimetric'][d[0]] || d[0]) + ' intent)']);
      else if (type === 'gAMA') r.facts.push(['Gamma', num(u32be(d, 0) / 100000, 5)]);
      else if (type === 'acTL') r.facts.push(['Animation', u32be(d, 0) + ' frames, ' + (u32be(d, 4) ? 'plays ' + u32be(d, 4) + ' times' : 'loops forever')]);
      else if (type === 'tIME') r.facts.push(['Last changed (tIME)', `${u16be(d, 0)}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')} ${String(d[4]).padStart(2, '0')}:${String(d[5]).padStart(2, '0')}:${String(d[6]).padStart(2, '0')} UTC`]);
      else if (type === 'PLTE') r.facts.push(['Palette', len / 3 + ' colors']);
      off = p + len + 4;
      if (type === 'IEND') break;
    }
    if (counts.IDAT > 1) r.chunks.push(['IDAT', -1, counts.IDAT, '']);
    r.chunkCounts = counts;
  }
  function gif(b, r) {
    const flags = b[10], gct = flags & 0x80 ? 1 << ((flags & 7) + 1) : 0;
    r.facts.push(['Version', ascii(b, 0, 6)]);
    if (gct) r.facts.push(['Global palette', gct + ' colors']);
    let off = 13 + gct * 3, frames = 0, loops = null, delay = 0;
    for (let n = 0; off < b.length && n < 200000; n++) {
      const k = b[off];
      if (k === 0x3b) break;
      if (k === 0x21) {
        const lab = b[off + 1]; let q = off + 2;
        if (lab === 0xff && ascii(b, q + 1, 11) === 'NETSCAPE2.0') loops = u16le(b, q + 14);
        if (lab === 0xf9) delay += u16le(b, q + 2) * 10;
        if (lab === 0xfe) { const parts = []; let p2 = q; while (p2 < b.length && b[p2]) { parts.push(b.subarray(p2 + 1, p2 + 1 + b[p2])); p2 += b[p2] + 1; } r.texts.push(['GIF comment', clean(latin1(Uint8Array.from(parts.flatMap((x) => Array.from(x)))))]); }
        while (q < b.length && b[q]) q += b[q] + 1;
        off = q + 1;
      } else if (k === 0x2c) {
        frames++;
        const lf = b[off + 9]; let q = off + 10 + (lf & 0x80 ? 3 * (1 << ((lf & 7) + 1)) : 0) + 1;
        while (q < b.length && b[q]) q += b[q] + 1;
        off = q + 1;
      } else { r.warnings.push('Unknown GIF block at offset ' + off + '.'); break; }
    }
    r.facts.push(['Frames', String(frames)]);
    if (frames > 1) r.facts.push(['Duration', (delay / 1000).toFixed(2) + ' s, ' + (loops === 0 ? 'loops forever' : loops == null ? 'plays once' : 'loops ' + loops + ' times')]);
  }
  function webp(b, r) {
    let off = 12; r.chunks = [];
    for (let n = 0; off + 8 <= b.length && n < LIMIT_SEG; n++) {
      const type = ascii(b, off, 4), len = u32le(b, off + 4), p = off + 8;
      if (p + len > b.length) { r.warnings.push('The ' + type.trim() + ' chunk runs past the end of the file.'); break; }
      r.chunks.push([type, off, len]);
      if (type === 'EXIF' && !r.tiff) { const s = ascii(b, p, 6) === 'Exif\0\0' ? 6 : 0; r.tiff = readTiff(b, p + s, p + len); r.exifAt = 'WebP EXIF chunk'; }
      if (type === 'XMP ') r.xmp = utf8(b.subarray(p, p + len));
      if (type === 'ICCP') r.icc = len;
      if (type === 'VP8 ') r.facts.push(['Compression', 'Lossy (VP8)']);
      if (type === 'VP8L') r.facts.push(['Compression', 'Lossless (VP8L)']);
      if (type === 'ANIM') r.facts.push(['Animation', 'loops ' + (u16le(b, p + 4) || 'forever')]);
      off = p + len + (len & 1);
    }
    const frames = r.chunks.filter((c) => c[0] === 'ANMF').length;
    if (frames) r.facts.push(['Frames', String(frames)]);
  }
  function bmff(b, r) {
    // HEIC/AVIF: the Exif item holds a 4-byte offset, then usually "Exif\0\0", then a TIFF header. Find the TIFF header
    // after an "Exif\0\0" mark in the first 16 MB (the item may be anywhere in the file).
    const lim = Math.min(b.length, 16 << 20);
    for (let i = 0; i + 14 <= lim; i++) {
      if (b[i] === 0x45 && ascii(b, i, 6) === 'Exif\0\0' && (ascii(b, i + 6, 4) === 'MM\0*' || ascii(b, i + 6, 4) === 'II*\0')) { r.tiff = readTiff(b, i + 6); r.exifAt = 'HEIF Exif item'; break; }
    }
    const brands = ascii(b, 8, 4) + ' ' + ascii(b, 16, Math.max(0, Math.min(u32be(b, 0), 64) - 16)).match(/.{4}/g)?.join(' ');
    r.facts.push(['Brands', clean(brands)]);
    const x = latin1(b.subarray(0, Math.min(b.length, 4 << 20))).indexOf('<x:xmpmeta');
    if (x >= 0) { const e = latin1(b.subarray(x, Math.min(b.length, x + (1 << 20)))).indexOf('</x:xmpmeta>'); if (e > 0) r.xmp = utf8(b.subarray(x, x + e + 12)); }
  }

  /** Reads the metadata. u8: the file bytes. Returns a report object; see the top of this file. */
  async function read(u8) {
    const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    const r = { format: '', facts: [], texts: [], warnings: [], strip: [], tiff: null };
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) { r.format = 'jpeg'; jpeg(b, r); }
    else if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') { r.format = 'png'; await png(b, r); }
    else if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') { r.format = 'gif'; gif(b, r); }
    else if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') { r.format = 'webp'; webp(b, r); }
    else if (ascii(b, 4, 4) === 'ftyp') { r.format = 'bmff'; bmff(b, r); }
    else if (['II*\0', 'MM\0*'].includes(ascii(b, 0, 4))) { r.format = 'tiff'; r.tiff = readTiff(b, 0); r.exifAt = 'TIFF header'; }
    if (r.tiff) {
      r.warnings.push(...r.tiff.warnings);
      const g = r.tiff.gps; r.gps = gpsDecimal(g);
      const rows = (o) => Object.keys(o).filter((k) => !(o[k] instanceof Uint8Array && k === 'MakerNote')).map((k) => [k, show(k, o[k])]).filter((x) => x[1] !== '');
      r.groups = [['Camera and image', rows(r.tiff.ifd0)], ['Exposure and lens', rows(r.tiff.exif)], ['GPS', rows(g)]];
      if (r.tiff.exif.MakerNote) r.groups[1][1].push(['MakerNote', r.tiff.exif.MakerNote.length + ' bytes (camera maker data, not decoded)']);
      if (Object.keys(r.tiff.ifd1).length) r.groups.push(['Thumbnail', rows(r.tiff.ifd1)]);
      const t = r.tiff, dt = t.exif.DateTimeOriginal || t.ifd0.DateTime;
      r.summary = {
        camera: clean([t.ifd0.Make, t.ifd0.Model].filter(Boolean).join(' ').replace(/^(\S+) \1 /, '$1 ')),
        lens: t.exif.LensModel ? clean(t.exif.LensModel) : '',
        taken: dt ? String(dt).replace(/^(\d{4}):(\d\d):(\d\d)/, '$1-$2-$3') + (t.exif.OffsetTimeOriginal || t.exif.OffsetTime ? ' ' + (t.exif.OffsetTimeOriginal || t.exif.OffsetTime) : '') : '',
        settings: [t.exif.FNumber != null ? show('FNumber', t.exif.FNumber) : '', t.exif.ExposureTime != null ? show('ExposureTime', t.exif.ExposureTime) : '',
          t.exif.ISO != null ? 'ISO ' + (Array.isArray(t.exif.ISO) ? t.exif.ISO[0] : t.exif.ISO) : '', t.exif.FocalLength != null ? show('FocalLength', t.exif.FocalLength) : ''].filter(Boolean).join(', '),
        orientation: t.ifd0.Orientation ? ORIENT[t.ifd0.Orientation] || String(t.ifd0.Orientation) : '',
        software: t.ifd0.Software ? clean(t.ifd0.Software) : '',
      };
    }
    if (r.xmp && r.xmp.length > 200000) r.xmp = r.xmp.slice(0, 200000);
    return r;
  }

  /** JPEG only: a copy without the EXIF, XMP and Photoshop/IPTC segments (pixels untouched). null for other formats. */
  function stripJpeg(u8, r) {
    if (r.format !== 'jpeg' || !r.strip.length) return null;
    const parts = []; let at = 0;
    for (const [s, e] of r.strip) { parts.push(u8.subarray(at, s)); at = e; }
    parts.push(u8.subarray(at));
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  root.ZovoMeta = { read, readTiff, show, gpsDecimal, stripJpeg };
})(typeof self !== 'undefined' ? self : globalThis);
