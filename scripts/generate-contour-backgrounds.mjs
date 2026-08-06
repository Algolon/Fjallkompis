#!/usr/bin/env node
/**
 * Decorative contour backgrounds for the Guide and Plan screens — derived
 * from the app's OWN contour vector archive (kungsleden-contours.pmtiles,
 * layer "contours", property `elev`; built by scripts/build-terrain-map.sh
 * from the Copernicus GLO-30 DEM), so the backdrops show real Kungsleden
 * terrain rather than invented decoration.
 *
 * Usage:
 *   node scripts/generate-contour-backgrounds.mjs <archive.pmtiles> --scan 12
 *       List every z12 tile with its centre and line/vertex counts, to pick
 *       visually balanced regions.
 *   node scripts/generate-contour-backgrounds.mjs <archive.pmtiles> --emit
 *       Regenerate public/images/guide/contours.svg and
 *       public/images/plan/contours.svg from the pinned REGIONS below.
 *
 * Prerequisites: the `pmtiles` CLI (same toolchain as
 * scripts/build-terrain-map.sh; `brew install pmtiles`), plus a local copy
 * of the archive (production serves it at
 * https://algolon.github.io/Fjallkompis/maps/kungsleden-contours.pmtiles —
 * the 9 MB binary is never committed, see offlineMap.ts).
 *
 * Pipeline per region (deterministic — same archive in, same SVG out):
 *   1. read the pinned tile(s) via `pmtiles tile` (gzip → inflate);
 *   2. decode the Mapbox Vector Tile protobuf by hand (met the format's
 *      published spec; ~90 lines — deliberately no new dependency);
 *   3. stitch tile-local geometry into one plane, scale to a 1024 viewBox;
 *   4. drop tiny fragments, simplify (Ramer–Douglas–Peucker), then smooth
 *      with Catmull-Rom → cubic Bézier — the same reprocessing character
 *      as the original Today asset (public/images/today/README.md);
 *   5. emit a single-<g> SVG: one muted stroke, no fills, no labels; the
 *      theme colour is baked per asset, the base colour lives in CSS.
 *
 * The regions are geographically REAL crops (bounds in each asset's
 * provenance comment) but purely decorative: unlabelled, unprojected for
 * navigation, never presented as a map.
 */
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Pinned regions (z11 tiles; x/y in XYZ scheme). z11 deliberately: the
 * archive tags per-feature minzooms so tiles below z12 carry only the 100 m
 * INDEX contours — which lands the visual density right beside the Today
 * asset's 74 lines instead of the 5× denser full 20 m set. Chosen from a
 * --scan for comparable line density, enough negative space for overlaid
 * cards, and mutual distinctness (and distinctness from the Today crop):
 *  - guide: the Tjäktja pass area — the route's high crossing; even,
 *    flowing valley-wall lines around a calm pass corridor.
 *  - plan: the Kebnekaise massif west flank above Láddjuvággi — denser
 *    summit rings against an open valley.
 */
const REGIONS = [
  {
    name: 'guide',
    out: 'public/images/guide/contours.svg',
    stroke: '#5c7b8a', // muted blue — base #d3dce1 lives in CSS (.screen-bg--guide)
    strokeOpacity: 0.42,
    z: 11,
    x0: 1128,
    y0: 489,
    span: 1,
  },
  {
    name: 'plan',
    out: 'public/images/plan/contours.svg',
    stroke: '#a1744c', // muted copper — base #e8e0d1 lives in CSS (.screen-bg--plan)
    strokeOpacity: 0.4,
    z: 11,
    x0: 1129,
    y0: 491,
    span: 1,
  },
];

const VIEWBOX = 1024;
const MIN_PATH_LENGTH = 26; // viewBox units — drops sliver fragments
const RDP_EPSILON = 1.2; // viewBox units — grid-step noise, not structure

// ---------------------------------------------------------------------------
// Tile reading
// ---------------------------------------------------------------------------

function readTile(archive, z, x, y) {
  let raw;
  try {
    raw = execFileSync('pmtiles', ['tile', archive, String(z), String(x), String(y)], {
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null; // outside the archive
  }
  if (raw.length === 0) return null;
  // Per-tile gzip (archive metadata: tile compression gzip).
  return raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
}

// ---------------------------------------------------------------------------
// Minimal Mapbox Vector Tile decoder (spec 2.1) — geometry only
// ---------------------------------------------------------------------------

function varint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    const b = buf[pos.i++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return result;
    shift += 7n;
  }
}

/** Iterate protobuf fields in [start, end): yields {field, wire, value|slice}. */
function* fields(buf, start, end) {
  const pos = { i: start };
  while (pos.i < end) {
    const key = Number(varint(buf, pos));
    const field = key >> 3;
    const wire = key & 7;
    if (wire === 0) {
      yield { field, value: varint(buf, pos) };
    } else if (wire === 2) {
      const len = Number(varint(buf, pos));
      yield { field, from: pos.i, to: pos.i + len };
      pos.i += len;
    } else if (wire === 5) {
      pos.i += 4;
    } else if (wire === 1) {
      pos.i += 8;
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
  }
}

const zigzag = (v) => Number((v >> 1n) ^ -(v & 1n));

/** All LineString paths of every layer, in tile-local extent units. */
function decodeTilePaths(buf) {
  const paths = [];
  for (const layerField of fields(buf, 0, buf.length)) {
    if (layerField.field !== 3 || layerField.from === undefined) continue;
    let extent = 4096;
    const featureRanges = [];
    for (const f of fields(buf, layerField.from, layerField.to)) {
      if (f.field === 5 && f.value !== undefined) extent = Number(f.value);
      if (f.field === 2 && f.from !== undefined) featureRanges.push(f);
    }
    for (const range of featureRanges) {
      for (const f of fields(buf, range.from, range.to)) {
        if (f.field !== 4 || f.from === undefined) continue; // geometry
        const pos = { i: f.from };
        let cx = 0;
        let cy = 0;
        let current = null;
        while (pos.i < f.to) {
          const cmd = Number(varint(buf, pos));
          const op = cmd & 7;
          const count = cmd >> 3;
          if (op === 1) {
            // MoveTo — starts a new path
            for (let n = 0; n < count; n++) {
              cx += zigzag(varint(buf, pos));
              cy += zigzag(varint(buf, pos));
              current = [[cx, cy]];
              paths.push({ points: current, extent });
            }
          } else if (op === 2) {
            // LineTo
            for (let n = 0; n < count; n++) {
              cx += zigzag(varint(buf, pos));
              cy += zigzag(varint(buf, pos));
              current?.push([cx, cy]);
            }
          } else if (op === 7) {
            // ClosePath (polygons — not expected for contours)
            current?.push([...current[0]]);
          } else {
            throw new Error(`unknown geometry op ${op}`);
          }
        }
      }
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Geometry processing
// ---------------------------------------------------------------------------

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return len;
}

/** Ramer–Douglas–Peucker simplification. */
function rdp(points, epsilon) {
  if (points.length < 3) return points;
  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const norm = Math.hypot(dx, dy) || 1;
  let maxDist = -1;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.abs(dy * points[i][0] - dx * points[i][1] + x2 * y1 - y2 * x1) / norm;
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist <= epsilon) return [points[0], points[points.length - 1]];
  return [
    ...rdp(points.slice(0, maxIdx + 1), epsilon).slice(0, -1),
    ...rdp(points.slice(maxIdx), epsilon),
  ];
}

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Catmull-Rom → cubic Bézier path data: the flowing-organic-curve character
 * described in public/images/today/README.md, applied to the simplified
 * polyline.
 */
function smoothPathData(points) {
  if (points.length === 2) {
    return `M${r1(points[0][0])} ${r1(points[0][1])}L${r1(points[1][0])} ${r1(points[1][1])}`;
  }
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Region assembly
// ---------------------------------------------------------------------------

function tileBoundsLatLon(z, x, y) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: (latRad * 180) / Math.PI };
}

function regionPaths(archive, region) {
  const { z, x0, y0, span } = region;
  const scale = VIEWBOX / span; // one tile → scale × scale viewBox units
  const all = [];
  for (let dy = 0; dy < span; dy++) {
    for (let dx = 0; dx < span; dx++) {
      const buf = readTile(archive, z, x0 + dx, y0 + dy);
      if (!buf) continue;
      for (const { points, extent } of decodeTilePaths(buf)) {
        const mapped = points.map(([px, py]) => [
          ((px / extent + dx) * scale),
          ((py / extent + dy) * scale),
        ]);
        all.push(mapped);
      }
    }
  }
  return all
    .map((p) => rdp(p, RDP_EPSILON))
    .filter((p) => pathLength(p) >= MIN_PATH_LENGTH);
}

function emitRegion(archive, region) {
  const paths = regionPaths(archive, region);
  if (paths.length === 0) {
    throw new Error(`${region.name}: no contour lines in the pinned tiles`);
  }
  const nw = tileBoundsLatLon(region.z, region.x0, region.y0);
  const se = tileBoundsLatLon(region.z, region.x0 + region.span, region.y0 + region.span);
  const d = paths.map((p) => `<path d="${smoothPathData(p)}"/>`).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" preserveAspectRatio="xMidYMid slice">
<!-- Decorative topographic contours (${region.name} screen background).
     Source: the app's own kungsleden-contours.pmtiles (contour vectors from
     the Copernicus GLO-30 DEM via scripts/build-terrain-map.sh; same
     attribution as the in-app terrain credits).
     Extraction: scripts/generate-contour-backgrounds.mjs — z${region.z} tiles
     x${region.x0}-${region.x0 + region.span - 1} y${region.y0}-${region.y0 + region.span - 1}
     (approx ${nw.lat.toFixed(3)}N ${nw.lon.toFixed(3)}E to ${se.lat.toFixed(3)}N ${se.lon.toFixed(3)}E),
     RDP-simplified and Catmull-Rom smoothed. Geographically real crop,
     purely decorative: no labels, no scale, never a navigation surface. -->
<g fill="none" stroke="${region.stroke}" stroke-opacity="${region.strokeOpacity}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
${d}
</g>
</svg>
`;
  const outPath = join(ROOT, region.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, svg);
  const kb = (Buffer.byteLength(svg) / 1024).toFixed(1);
  console.log(
    `${region.name}: ${paths.length} lines → ${region.out} (${kb} kB, ` +
      `${nw.lat.toFixed(3)}N ${nw.lon.toFixed(3)}E … ${se.lat.toFixed(3)}N ${se.lon.toFixed(3)}E)`,
  );
}

function scan(archive, z) {
  // Bounds from `pmtiles show`: lon 17.8799–19.3773, lat 67.7081–68.4931.
  const n = 2 ** z;
  const lonToX = (lon) => Math.floor(((lon + 180) / 360) * n);
  const latToY = (lat) => {
    const lr = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n);
  };
  const rows = [];
  for (let y = latToY(68.4931); y <= latToY(67.7081); y++) {
    for (let x = lonToX(17.8799); x <= lonToX(19.3773); x++) {
      const buf = readTile(archive, z, x, y);
      if (!buf) continue;
      const paths = decodeTilePaths(buf);
      const vertices = paths.reduce((s, p) => s + p.points.length, 0);
      const c = tileBoundsLatLon(z, x + 0.5, y + 0.5);
      rows.push({ x, y, lines: paths.length, vertices, lat: c.lat, lon: c.lon });
    }
  }
  rows.sort((a, b) => b.vertices - a.vertices);
  for (const r of rows) {
    console.log(
      `z${z} ${r.x}/${r.y}  ${r.lat.toFixed(3)}N ${r.lon.toFixed(3)}E  lines=${r.lines}  vertices=${r.vertices}`,
    );
  }
}

// ---------------------------------------------------------------------------

const [archive, flag, arg] = process.argv.slice(2);
if (!archive || !flag) {
  console.error(
    'usage: node scripts/generate-contour-backgrounds.mjs <archive.pmtiles> (--scan <z> | --emit)',
  );
  process.exit(1);
}
if (flag === '--scan') {
  scan(archive, Number(arg ?? 12));
} else if (flag === '--emit') {
  for (const region of REGIONS) emitRegion(archive, region);
} else {
  console.error(`unknown flag ${flag}`);
  process.exit(1);
}
