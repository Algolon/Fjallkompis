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
 *   3. CLIP each tile's geometry to its own cell. MVT tiles carry a buffer
 *      beyond their nominal extent, so without clipping every interior seam
 *      of the tile block draws the same contour TWICE — two 0.5-opacity
 *      strokes stack to visibly darker bands (measured ≈7% of stroke pixels
 *      vs ≈0.2% on the untiled Today asset);
 *   4. map the clipped fragments into one plane and STITCH same-elevation
 *      fragments back together across the seams, so each contour is one
 *      continuous polyline again (no cap-dots, no per-side smoothing kinks);
 *   5. drop tiny fragments, simplify (Ramer–Douglas–Peucker), then smooth
 *      with Catmull-Rom → cubic Bézier — the same reprocessing character
 *      as the original Today asset (public/images/today/README.md);
 *   6. emit a single-<g> SVG: one muted stroke, no fills, no labels; the
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Pinned regions — the SAME two areas throughout, read at the archive's
 * MAXIMUM zoom (z13, one z11 tile = a 4×4 z13 block).
 *
 * Zoom choice is a shape decision, not a coverage one. Tippecanoe simplifies
 * per zoom, so the low-zoom tiles that first supplied these crops carried
 * heavily decimated polylines — visibly angular once smoothed. z13 is the
 * archive's least-simplified geometry; filtering it back to the 100 m index
 * contours (see INDEX_INTERVAL_M) keeps the line COUNT beside Today's while
 * every line carries far more vertices, so the Catmull-Rom pass has real
 * curvature to follow instead of interpolating between corners.
 *
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
    strokeOpacity: 0.5, // Today's opacity: one contour design system
    z: 13,
    x0: 4512,
    y0: 1956,
    span: 4,
  },
  {
    name: 'plan',
    out: 'public/images/plan/contours.svg',
    stroke: '#a1744c', // muted copper — base #e8e0d1 lives in CSS (.screen-bg--plan)
    strokeOpacity: 0.5,
    z: 13,
    x0: 4516,
    y0: 1964,
    span: 4,
  },
];

/**
 * The emitted viewBox is Today's, EXACTLY (public/images/today/contours.svg).
 *
 * Line weight is a rendering property, not just a `stroke-width` number: the
 * assets are CSS `background-size: cover` layers, so the browser scales the
 * whole SVG and the stroke with it. A 1024² viewBox in the same box renders
 * its 1-unit stroke at 1024/453.5 ≈ 2.3× thinner than Today's — which is
 * exactly why the first Guide/Plan assets looked spindly. Emitting into
 * Today's viewBox (same size, same aspect, same slice behaviour) makes the
 * scale factor identical at every viewport, so `stroke-width: 1` lands on
 * the same rendered weight on 320 px, 375 px and desktop alike.
 */
const VIEWBOX_W = 295.77;
const VIEWBOX_H = 453.5;
/** Contour interval kept from the source (metres) — the 100 m index lines. */
const INDEX_INTERVAL_M = 100;
const MIN_PATH_LENGTH = 12; // viewBox units — drops sliver fragments
const RDP_EPSILON = 0.45; // viewBox units — grid-step noise, not structure
/** Chaikin corner-cutting passes between RDP and Catmull-Rom: relaxes the
 *  z13 grid jitter the point-interpolating Catmull-Rom would otherwise trace
 *  faithfully, moving the line character toward Today's calmer flow. */
const CHAIKIN_PASSES = 1;

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
// Minimal Mapbox Vector Tile decoder (spec 2.1) — geometry + the one property
// this script filters on (`elev`)
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

/** Decode one Value message far enough to read a number or a string. */
function decodeValue(buf, from, to) {
  for (const f of fields(buf, from, to)) {
    if (f.field === 1 && f.from !== undefined) {
      return buf.toString('utf8', f.from, f.to); // string_value
    }
    if (f.field === 2) return null; // float — read as double below if present
    if (f.field === 4 && f.value !== undefined) return Number(f.value); // int64
    if (f.field === 5 && f.value !== undefined) return Number(f.value); // uint64
    if (f.field === 6 && f.value !== undefined) {
      const v = f.value;
      return Number((v >> 1n) ^ -(v & 1n)); // sint64
    }
  }
  return null;
}

/** Packed varints of a tags field, as a flat number array. */
function decodePackedVarints(buf, from, to) {
  const pos = { i: from };
  const out = [];
  while (pos.i < to) out.push(Number(varint(buf, pos)));
  return out;
}

/**
 * All LineString paths of every layer, in tile-local extent units, each
 * carrying its `elev` property when the layer publishes one.
 */
function decodeTilePaths(buf) {
  const paths = [];
  for (const layerField of fields(buf, 0, buf.length)) {
    if (layerField.field !== 3 || layerField.from === undefined) continue;
    let extent = 4096;
    const keys = [];
    const valueRanges = [];
    const featureRanges = [];
    for (const f of fields(buf, layerField.from, layerField.to)) {
      if (f.field === 5 && f.value !== undefined) extent = Number(f.value);
      if (f.field === 3 && f.from !== undefined) {
        keys.push(buf.toString('utf8', f.from, f.to));
      }
      if (f.field === 4 && f.from !== undefined) valueRanges.push(f);
      if (f.field === 2 && f.from !== undefined) featureRanges.push(f);
    }
    const values = valueRanges.map((v) => decodeValue(buf, v.from, v.to));
    for (const range of featureRanges) {
      // Properties first: contour elevation decides which lines are kept.
      let elev = null;
      for (const f of fields(buf, range.from, range.to)) {
        if (f.field !== 2 || f.from === undefined) continue; // tags
        const tags = decodePackedVarints(buf, f.from, f.to);
        for (let i = 0; i + 1 < tags.length; i += 2) {
          if (keys[tags[i]] === 'elev') elev = Number(values[tags[i + 1]]);
        }
      }
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
              paths.push({ points: current, extent, elev });
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

/**
 * Clip a polyline to the tile's own cell [0, extent]². MVT geometry extends
 * into a buffer around the cell so tiles render seamlessly on their own —
 * but assembled into one plane that buffer means every interior seam is
 * double-drawn. Returns the fragments that lie inside, with exact crossing
 * points on the cell boundary (Liang–Barsky per segment).
 */
export function clipToCell(points, extent) {
  const inside = ([x, y]) => x >= 0 && x <= extent && y >= 0 && y <= extent;
  const fragments = [];
  let current = null;
  const push = (pt) => {
    if (!current) {
      current = [pt];
    } else {
      const last = current[current.length - 1];
      if (last[0] !== pt[0] || last[1] !== pt[1]) current.push(pt);
    }
  };
  const flush = () => {
    if (current && current.length >= 2) fragments.push(current);
    current = null;
  };
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    // Liang–Barsky parametric clip of the segment against the cell.
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [p, q] of [
      [-dx, x1 - 0],
      [dx, extent - x1],
      [-dy, y1 - 0],
      [dy, extent - y1],
    ]) {
      if (p === 0) {
        if (q < 0) { ok = false; break; }
      } else {
        const r = q / p;
        if (p < 0) {
          if (r > t1) { ok = false; break; }
          if (r > t0) t0 = r;
        } else {
          if (r < t0) { ok = false; break; }
          if (r < t1) t1 = r;
        }
      }
    }
    if (!ok) {
      flush(); // segment fully outside — the line leaves the cell
      continue;
    }
    const a = [x1 + t0 * dx, y1 + t0 * dy];
    const b = [x1 + t1 * dx, y1 + t1 * dy];
    if (t0 > 0) flush(); // re-entering: start a new fragment at the boundary
    push(a);
    push(b);
    if (t1 < 1) flush(); // exiting: fragment ends on the boundary
    else if (!inside(points[i])) flush();
  }
  flush();
  return fragments;
}

/**
 * Stitch clipped fragments back into continuous polylines across the tile
 * seams. Adjacent tiles quantise the same source contour independently, so
 * matching seam endpoints agree only within a small tolerance; joining is
 * restricted to fragments of the SAME elevation (contours of one elevation
 * never cross, so within-tolerance neighbours on a seam are the same line).
 * The junction pair is healed to its midpoint.
 */
export function stitchFragments(fragments, tolerance) {
  const merged = fragments.map((f) => ({ points: f.points.slice(), elev: f.elev }));
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
  let joined = true;
  while (joined) {
    joined = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        if (merged[i].elev !== merged[j].elev) continue;
        const A = merged[i].points;
        const B = merged[j].points;
        // Each orientation records WHERE its junction landed: the index k
        // such that the touching pair is next[k-1] (from the first-placed
        // fragment) and next[k] (from the second). For the B-first
        // orientation that is B.length — inferring A.length afterwards
        // would heal a pair in the middle of B instead of the seam.
        let next = null;
        let k = -1;
        if (near(A[A.length - 1], B[0])) {
          next = [...A, ...B];
          k = A.length;
        } else if (near(A[A.length - 1], B[B.length - 1])) {
          next = [...A, ...B.slice().reverse()];
          k = A.length;
        } else if (near(A[0], B[0])) {
          next = [...A.slice().reverse(), ...B];
          k = A.length;
        } else if (near(A[0], B[B.length - 1])) {
          next = [...B, ...A];
          k = B.length;
        }
        if (next) {
          // Heal the junction: replace the touching pair with its midpoint.
          const mid = [
            (next[k - 1][0] + next[k][0]) / 2,
            (next[k - 1][1] + next[k][1]) / 2,
          ];
          next.splice(k - 1, 2, mid);
          merged[i].points = next;
          merged.splice(j, 1);
          joined = true;
          break outer;
        }
      }
    }
  }
  return merged;
}

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

/** One Chaikin corner-cutting pass (open polyline; endpoints kept). */
function chaikin(points, passes) {
  let pts = points;
  for (let n = 0; n < passes; n++) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
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
  // Source window: the tile block is square, the viewBox is Today's portrait
  // shape. Take the full height and a centred portrait slice of the width,
  // then map that window onto the viewBox — one uniform scale factor
  // (VIEWBOX_H / span), so the emitted units per rendered pixel match
  // Today's exactly (see EMIT_VIEWBOX).
  const windowW = span * (VIEWBOX_W / VIEWBOX_H);
  const windowX0 = (span - windowW) / 2;
  const scale = VIEWBOX_H / span; // tile-fractions → viewBox units
  const fragments = [];
  for (let dy = 0; dy < span; dy++) {
    for (let dx = 0; dx < span; dx++) {
      const buf = readTile(archive, z, x0 + dx, y0 + dy);
      if (!buf) continue;
      for (const { points, extent, elev } of decodeTilePaths(buf)) {
        // Index contours only (100 m). At z13 the archive carries the full
        // 20 m set at its least-simplified geometry; keeping only the index
        // lines holds the visual density beside the Today asset while the
        // SHAPE comes from the most detailed tiles the archive has.
        if (!Number.isFinite(elev) || elev % INDEX_INTERVAL_M !== 0) continue;
        // Clip to THIS tile's cell so the shared buffer band is drawn by
        // exactly one tile — the double-stroke seam fix.
        for (const clipped of clipToCell(points, extent)) {
          const mapped = clipped.map(([px, py]) => [
            (px / extent + dx - windowX0) * scale,
            (py / extent + dy) * scale,
          ]);
          fragments.push({ points: mapped, elev });
        }
      }
    }
  }
  // Rejoin the clipped halves across seams (tolerance ≈ half a viewBox unit
  // — well below the spacing between neighbouring 100 m index lines, and
  // enough for per-tile quantisation drift at the crossing points).
  return stitchFragments(fragments, 0.5)
    .map((f) => chaikin(rdp(f.points, RDP_EPSILON), CHAIKIN_PASSES))
    .filter((p) => pathLength(p) >= MIN_PATH_LENGTH)
    // Paths entirely outside the portrait window would only bloat the file;
    // the viewBox clips them when the SVG is rendered.
    .filter((p) => p.some(([x, y]) => x >= -2 && x <= VIEWBOX_W + 2 && y >= -2 && y <= VIEWBOX_H + 2));
}

function emitRegion(archive, region) {
  const paths = regionPaths(archive, region);
  if (paths.length === 0) {
    throw new Error(`${region.name}: no contour lines in the pinned tiles`);
  }
  const nw = tileBoundsLatLon(region.z, region.x0, region.y0);
  const se = tileBoundsLatLon(region.z, region.x0 + region.span, region.y0 + region.span);
  const d = paths.map((p) => `<path d="${smoothPathData(p)}"/>`).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX_W} ${VIEWBOX_H}" preserveAspectRatio="xMidYMid slice">
<!-- Decorative topographic contours (${region.name} screen background).
     Source: the app's own kungsleden-contours.pmtiles (contour vectors from
     the Copernicus GLO-30 DEM via scripts/build-terrain-map.sh; same
     attribution as the in-app terrain credits).
     Extraction: scripts/generate-contour-backgrounds.mjs — z${region.z} tiles
     x${region.x0}-${region.x0 + region.span - 1} y${region.y0}-${region.y0 + region.span - 1}
     (approx ${nw.lat.toFixed(3)}N ${nw.lon.toFixed(3)}E to ${se.lat.toFixed(3)}N ${se.lon.toFixed(3)}E),
     ${INDEX_INTERVAL_M} m index contours only, seam-clipped to each tile's
     own cell and re-stitched across tiles (one stroke per contour — never
     the doubled buffer band), RDP-simplified (${RDP_EPSILON}), Chaikin-relaxed
     and Catmull-Rom smoothed. The viewBox is Today's, so the shared
     stroke-width renders at the same weight on every screen. Geographically
     real crop, purely decorative: no labels, no scale, never a navigation
     surface. -->
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

// CLI entry only when executed directly — the geometry helpers above are
// importable (tests/contour-generator-geometry.test.mjs) without side
// effects, keeping the generator itself deterministic and test-covered.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
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
}
