/**
 * A very small PNG codec and raster toolkit, built on node:zlib and nothing else.
 *
 * WHY NOT sharp / jimp / canvas. The branding contract has to be checkable in
 * CI on every pull request, which means the check must run wherever `npm test`
 * runs — with no native toolchain, no ImageMagick, and no platform-specific
 * binary. `sips` is macOS-only, so it cannot back a GitHub Actions check;
 * `sharp` is a multi-megabyte native dependency added for a handful of icon
 * comparisons. node:zlib ships with Node, so this file has no install cost and
 * no supply-chain surface, which is the whole point.
 *
 * SCOPE IS DELIBERATELY NARROW. This decodes the subset of PNG the project's
 * own artwork actually uses (8-bit, non-interlaced, greyscale / RGB / palette /
 * greyscale+alpha / RGBA) and encodes exactly one flavour (8-bit RGBA,
 * non-interlaced). Anything outside that throws loudly rather than guessing —
 * a silent misread here would turn into a false "branding verified".
 *
 * PIXELS, NOT BYTES, ARE THE CONTRACT. Nothing in here promises byte-identical
 * output: zlib's exact deflate stream is free to change between Node versions,
 * so a byte-comparison of generated PNGs would be a flaky test rather than a
 * branding fence. Callers compare DECODED PIXELS instead (see `meanAbsDiff`),
 * which is what "the launcher icon is still the Fjällkompis mark" actually
 * means.
 */

import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Channels per pixel for each PNG colour type. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * An image in the one representation the rest of this file speaks:
 * straight (NOT premultiplied) 8-bit RGBA, row-major, no padding.
 *
 * @typedef {{ width: number, height: number, data: Uint8Array }} Raster
 */

// --- CRC32 (PNG's chunk checksum) --------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- Decode -------------------------------------------------------------------

/** Undo one scanline's PNG filter, in place, given the already-undone row above. */
function unfilter(type, line, prev, bpp) {
  switch (type) {
    case 0:
      break;
    case 1: // Sub
      for (let i = bpp; i < line.length; i += 1) line[i] = (line[i] + line[i - bpp]) & 0xff;
      break;
    case 2: // Up
      for (let i = 0; i < line.length; i += 1) line[i] = (line[i] + prev[i]) & 0xff;
      break;
    case 3: // Average
      for (let i = 0; i < line.length; i += 1) {
        const left = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xff;
      }
      break;
    case 4: // Paeth
      for (let i = 0; i < line.length; i += 1) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + pred) & 0xff;
      }
      break;
    default:
      throw new Error(`unsupported PNG filter type ${type}`);
  }
}

/**
 * Decode a PNG buffer to straight 8-bit RGBA.
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {Raster}
 */
export function decodePng(buffer) {
  const buf = Buffer.from(buffer);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG (bad signature)');

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let palette = null;
  let paletteAlpha = null;
  const idat = [];

  let pos = 8;
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNGs are not supported');
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') paletteAlpha = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
  }

  if (depth !== 8) throw new Error(`only 8-bit PNGs are supported (got ${depth}-bit)`);
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const bpp = channels;
  const out = new Uint8Array(width * height * 4);

  let prev = Buffer.alloc(stride);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    unfilter(filter, line, prev, bpp);

    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const s = x * channels;
      if (colorType === 6) {
        out[o] = line[s];
        out[o + 1] = line[s + 1];
        out[o + 2] = line[s + 2];
        out[o + 3] = line[s + 3];
      } else if (colorType === 2) {
        out[o] = line[s];
        out[o + 1] = line[s + 1];
        out[o + 2] = line[s + 2];
        out[o + 3] = 255;
      } else if (colorType === 0) {
        out[o] = out[o + 1] = out[o + 2] = line[s];
        out[o + 3] = 255;
      } else if (colorType === 4) {
        out[o] = out[o + 1] = out[o + 2] = line[s];
        out[o + 3] = line[s + 1];
      } else {
        const idx = line[s];
        if (!palette) throw new Error('palette PNG without a PLTE chunk');
        out[o] = palette[idx * 3];
        out[o + 1] = palette[idx * 3 + 1];
        out[o + 2] = palette[idx * 3 + 2];
        out[o + 3] = paletteAlpha && idx < paletteAlpha.length ? paletteAlpha[idx] : 255;
      }
    }
    prev = line;
  }

  return { width, height, data: out };
}

// --- Encode -------------------------------------------------------------------

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encode straight 8-bit RGBA to a PNG buffer.
 *
 * Rows are filtered with the standard minimum-sum-of-absolute-differences
 * heuristic, which is deterministic for a given input. The deflate stream
 * itself is only as stable as the linked zlib, which is exactly why callers
 * must compare pixels rather than bytes.
 *
 * @param {Raster} raster
 * @returns {Buffer}
 */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const candidates = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const line = Buffer.from(data.subarray(y * stride, (y + 1) * stride));
    let best = 0;
    let bestScore = Infinity;

    for (let f = 0; f < 5; f += 1) {
      const cand = candidates[f];
      let score = 0;
      for (let i = 0; i < stride; i += 1) {
        const a = i >= 4 ? line[i - 4] : 0;
        const b = prev[i];
        const c = i >= 4 ? prev[i - 4] : 0;
        let v;
        if (f === 0) v = line[i];
        else if (f === 1) v = line[i] - a;
        else if (f === 2) v = line[i] - b;
        else if (f === 3) v = line[i] - ((a + b) >> 1);
        else {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        cand[i] = v & 0xff;
        score += cand[i] < 128 ? cand[i] : 256 - cand[i];
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }

    raw[y * (stride + 1)] = best;
    candidates[best].copy(raw, y * (stride + 1) + 1);
    prev = line;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Geometry -----------------------------------------------------------------

/**
 * The bounding box of everything meaningfully opaque — i.e. where the artwork
 * actually is, as opposed to how big its canvas happens to be.
 *
 * `alphaThreshold` ignores the near-invisible antialiasing fringe, so a
 * downscale of the same mark reports the same box to within a pixel instead of
 * creeping outwards every generation.
 *
 * @param {Raster} img
 * @param {number} [alphaThreshold]
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function inkBounds({ width, height, data }, alphaThreshold = 8, plate = null) {
  // On a PLATED icon every pixel is opaque, so alpha alone reports the whole
  // canvas and says nothing about where the mark sits. Passing the plate
  // colour makes "ink" mean "differs from the plate", which is what the safe
  // zone is actually measured against.
  const plateRgb = plate ? parseHex(plate) : null;
  const tolerance = 10;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const visible = data[o + 3] > alphaThreshold;
      const onPlate =
        plateRgb !== null &&
        Math.abs(data[o] - plateRgb[0]) <= tolerance &&
        Math.abs(data[o + 1] - plateRgb[1]) <= tolerance &&
        Math.abs(data[o + 2] - plateRgb[2]) <= tolerance;
      if (visible && !onPlate) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('image is entirely transparent — no ink to bound');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The fraction of the canvas the artwork spans, along its longer axis. This is
 * the number the brand contract is written in: "the mark spans 80% of the
 * icon" is a statement a human can check against a launcher, unlike a raw
 * scale factor.
 *
 * @param {Raster} img
 * @returns {number}
 */
export function markSpanOf(img, plate = null) {
  const box = inkBounds(img, 8, plate);
  return Math.max(box.width / img.width, box.height / img.height);
}

/**
 * Area-average (box) resample.
 *
 * Alpha is PREMULTIPLIED for the duration of the averaging and then undone.
 * Averaging straight RGBA instead would drag the colour of fully transparent
 * pixels into the visible edge — the classic dark halo around a downscaled
 * logo. The filter is exact-area rather than nearest-neighbour-ish: each
 * destination pixel integrates the fractional coverage of every source pixel
 * it overlaps, which is the right filter for the large reductions here
 * (512 → 48 is a 10.7× reduction) and is fully deterministic.
 *
 * @param {Raster} img
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {Raster}
 */
export function resize({ width, height, data }, targetWidth, targetHeight) {
  // Horizontal pass into a float buffer of premultiplied RGBA.
  const mid = new Float64Array(targetWidth * height * 4);
  const xScale = width / targetWidth;
  for (let x = 0; x < targetWidth; x += 1) {
    const start = x * xScale;
    const end = start + xScale;
    const first = Math.floor(start);
    const last = Math.min(width - 1, Math.ceil(end) - 1);
    for (let y = 0; y < height; y += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let total = 0;
      for (let sx = first; sx <= last; sx += 1) {
        const w = Math.min(end, sx + 1) - Math.max(start, sx);
        if (w <= 0) continue;
        const o = (y * width + sx) * 4;
        const alpha = data[o + 3];
        r += data[o] * alpha * w;
        g += data[o + 1] * alpha * w;
        b += data[o + 2] * alpha * w;
        a += alpha * w;
        total += w;
      }
      const o = (y * targetWidth + x) * 4;
      mid[o] = r / total;
      mid[o + 1] = g / total;
      mid[o + 2] = b / total;
      mid[o + 3] = a / total;
    }
  }

  // Vertical pass, then un-premultiply back to straight RGBA.
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  const yScale = height / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const start = y * yScale;
    const end = start + yScale;
    const first = Math.floor(start);
    const last = Math.min(height - 1, Math.ceil(end) - 1);
    for (let x = 0; x < targetWidth; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let total = 0;
      for (let sy = first; sy <= last; sy += 1) {
        const w = Math.min(end, sy + 1) - Math.max(start, sy);
        if (w <= 0) continue;
        const o = (sy * targetWidth + x) * 4;
        r += mid[o] * w;
        g += mid[o + 1] * w;
        b += mid[o + 2] * w;
        a += mid[o + 3] * w;
        total += w;
      }
      const o = (y * targetWidth + x) * 4;
      // `a` is the summed 0-255 alpha and r/g/b are summed colour*alpha, so
      // un-premultiplying is r/a — dividing by the AVERAGED alpha instead
      // would overshoot by 255x and clip every pixel to white.
      out[o + 3] = Math.round(Math.min(255, a / total));
      if (a > 0) {
        out[o] = Math.round(Math.min(255, r / a));
        out[o + 1] = Math.round(Math.min(255, g / a));
        out[o + 2] = Math.round(Math.min(255, b / a));
      }
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

/** Parse `#rrggbb` into a byte triple. */
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`expected a #rrggbb colour, got ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** A solid canvas: an opaque plate, or a transparent one when `hex` is null. */
export function canvas(size, hex) {
  const data = new Uint8Array(size * size * 4);
  if (hex) {
    const [r, g, b] = parseHex(hex);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/**
 * Source-over composite of `src` onto `dst` at (dx, dy), clipped to `dst`.
 * Negative offsets are legal and crop the source — that is how an icon whose
 * mark is meant to bleed past the canvas edge (the favicon) is produced.
 */
export function compositeOver(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y += 1) {
    const ty = y + dy;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x += 1) {
      const tx = x + dx;
      if (tx < 0 || tx >= dst.width) continue;
      const s = (y * src.width + x) * 4;
      const d = (ty * dst.width + tx) * 4;
      const sa = src.data[s + 3] / 255;
      if (sa === 0) continue;
      const da = dst.data[d + 3] / 255;
      const outA = sa + da * (1 - sa);
      for (let k = 0; k < 3; k += 1) {
        dst.data[d + k] = Math.round((src.data[s + k] * sa + dst.data[d + k] * da * (1 - sa)) / outA);
      }
      dst.data[d + 3] = Math.round(outA * 255);
    }
  }
  return dst;
}

/**
 * Clip to the largest inscribed circle, with an antialiased edge.
 *
 * This exists for Android's LEGACY round launcher icon (`android:roundIcon` on
 * API 24-25, before adaptive icons). Those launchers draw the round resource
 * AS SUPPLIED — they apply no mask of their own — so a square bitmap in that
 * slot renders as a square amongst circles. Adaptive icons make this moot from
 * API 26, but the app's minSdk is 24.
 */
export function circleClip({ width, height, data }, samples = 4) {
  const out = new Uint8Array(data);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2;
  const step = 1 / samples;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Supersample coverage so the rim is smooth rather than stair-stepped.
      let inside = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) * step - cx;
          const py = y + (sy + 0.5) * step - cy;
          if (px * px + py * py <= radius * radius) inside += 1;
        }
      }
      const coverage = inside / (samples * samples);
      const o = (y * width + x) * 4;
      out[o + 3] = Math.round(data[o + 3] * coverage);
    }
  }
  return { width, height, data: out };
}

/** Flatten any transparency onto an opaque plate. */
export function flattenOnto(img, hex) {
  return compositeOver(canvas(img.width, hex), img, 0, 0);
}

/**
 * Mean absolute per-channel difference between two same-sized rasters, on
 * PREMULTIPLIED values so that differences hiding under transparent pixels do
 * not register as real ones. 0 means identical; the branding tests compare
 * this against a small tolerance rather than demanding byte equality, because
 * the checked-in assets were produced by a different (unknown) resampler than
 * the one in this file.
 */
export function meanAbsDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  let total = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const aa = a.data[i + 3];
    const ba = b.data[i + 3];
    for (let k = 0; k < 3; k += 1) {
      total += Math.abs((a.data[i + k] * aa) / 255 - (b.data[i + k] * ba) / 255);
    }
    total += Math.abs(aa - ba);
  }
  return total / a.data.length;
}

/** True when every pixel is fully opaque — what Play and iOS both want. */
export function isFullyOpaque({ data }) {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false;
  return true;
}
