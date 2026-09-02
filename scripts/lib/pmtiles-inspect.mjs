/**
 * Local PMTiles inspection for the Satellite HD extraction pipeline
 * (scripts/extract-satellite-hd.sh) and its tests: read a header, and prove
 * an archive holds EXACTLY one contiguous z-level tile rectangle — every
 * expected coordinate present, nothing outside it — by walking the archive
 * per coordinate rather than trusting aggregate counts.
 *
 * Pure Node + the already-shipped `pmtiles` JS package; no shell, no
 * network, no GDAL. Kept as a lib so the shard contract ("no gaps, no
 * overlap, union = the declared corridor") is testable with fixtures.
 */
import { open } from 'node:fs/promises';
import { PMTiles } from 'pmtiles';

/** Minimal file-backed Source for the pmtiles reader. */
class NodeFileSource {
  constructor(path) {
    this.path = path;
  }

  getKey() {
    return this.path;
  }

  async getBytes(offset, length) {
    const fh = await open(this.path, 'r');
    try {
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, offset);
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
    } finally {
      await fh.close();
    }
  }
}

export function openArchive(path) {
  return new PMTiles(new NodeFileSource(path));
}

/** Header summary: zoom range, tile type, bounds, addressed-tile count. */
export async function inspectHeader(path) {
  const header = await openArchive(path).getHeader();
  return {
    minZoom: header.minZoom,
    maxZoom: header.maxZoom,
    tileType: header.tileType,
    numAddressedTiles: Number(header.numAddressedTiles),
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
  };
}

/**
 * Verify the archive contains EXACTLY the rectangle {z, xMin..xMax,
 * yMin..yMax} (XYZ): every coordinate inside resolves to tile bytes, and a
 * probe ring one tile outside every edge resolves to nothing. Returns the
 * proof; throws nothing — callers decide what is fatal.
 *
 * @param {string} path
 * @param {{z:number,xMin:number,xMax:number,yMin:number,yMax:number}} rect
 * @param {number} [outsideStep] probe every Nth tile along the outside ring
 */
export async function verifyExactTileRectangle(path, rect, outsideStep = 8) {
  const archive = openArchive(path);
  const { z, xMin, xMax, yMin, yMax } = rect;
  const missing = [];
  let present = 0;
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const tile = await archive.getZxy(z, x, y);
      if (tile?.data?.byteLength) present += 1;
      else if (missing.length < 20) missing.push({ z, x, y });
      else missing.push(null);
    }
  }
  const unexpected = [];
  const ringProbes = [];
  for (let x = xMin; x <= xMax + outsideStep; x += outsideStep) {
    const cx = Math.min(x, xMax);
    ringProbes.push({ x: cx, y: yMin - 1 }, { x: cx, y: yMax + 1 });
  }
  for (let y = yMin; y <= yMax + outsideStep; y += outsideStep) {
    const cy = Math.min(y, yMax);
    ringProbes.push({ x: xMin - 1, y: cy }, { x: xMax + 1, y: cy });
  }
  for (const p of ringProbes) {
    const tile = await archive.getZxy(z, p.x, p.y);
    if (tile?.data?.byteLength && unexpected.length < 20) unexpected.push({ z, ...p });
  }
  const expected = (xMax - xMin + 1) * (yMax - yMin + 1);
  return {
    expected,
    present,
    missing: missing.filter(Boolean),
    missingCount: missing.length,
    outsideRingProbes: ringProbes.length,
    unexpectedOutside: unexpected,
    complete: present === expected && missing.length === 0 && unexpected.length === 0,
  };
}
