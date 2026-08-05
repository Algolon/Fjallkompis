/**
 * VECTOR OVERVIEW COVERAGE — the geographic contract the low-zoom half of
 * public/maps/kungsleden.pmtiles has to satisfy, read from the committed
 * archive itself rather than from a recorded hash.
 *
 * Why this exists: `mapCutoutBounds` is centred on the route but the
 * Web-Mercator tile grid is not, so the column holding the route's western end
 * reaches far further west than the eastern column reaches east. A
 * horizontally balanced full-route overview needs the same margin both sides,
 * and EAST was short at every overview zoom. `vectorOverview` in
 * scripts/route-configs.mjs widens the extract for z0–z9 only.
 *
 * These tests pin the CONTRACT (which longitudes are covered at which source
 * zoom), not the byte layout: a re-extract from a newer planet build must
 * still pass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KUNGSLEDEN_CONFIG } from '../scripts/route-configs.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

// ---- Minimal PMTiles v3 reader (directory walk only) ------------------------

const varints = (buf) => {
  let p = 0;
  return () => { let shift = 0, r = 0; for (;;) { const b = buf[p++];
    r += (b & 0x7f) * 2 ** shift; if (b < 0x80) return r; shift += 7; } };
};
const parseDir = (buf) => {
  const next = varints(buf);
  const n = next();
  const e = Array.from({ length: n }, () => ({}));
  let last = 0;
  for (let i = 0; i < n; i++) { last += next(); e[i].tileId = last; }
  for (let i = 0; i < n; i++) e[i].runLength = next();
  for (let i = 0; i < n; i++) e[i].length = next();
  for (let i = 0; i < n; i++) { const v = next();
    e[i].offset = v === 0 && i > 0 ? e[i - 1].offset + e[i - 1].length : v - 1; }
  return e;
};
const d2xy = (n, d) => {
  let x = 0, y = 0, t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & Math.floor(t / 2), ry = 1 & (t ^ rx);
    if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const q = x; x = y; y = q; }
    x += s * rx; y += s * ry; t = Math.floor(t / 4);
  }
  return [x, y];
};
const idToZxy = (id) => {
  let acc = 0, z = 0;
  for (;;) { const n = 4 ** z; if (acc + n > id) return [z, ...d2xy(2 ** z, id - acc)];
    acc += n; z++; if (z > 24) throw new Error('bad tileId'); }
};

function readFootprints(path) {
  const buf = readFileSync(path);
  assert.equal(buf.subarray(0, 7).toString('ascii'), 'PMTiles', 'valid PMTiles magic');
  const u64 = (o) => Number(buf.readBigUInt64LE(o));
  const h = { rootOffset: u64(8), rootLength: u64(16), leafOffset: u64(40),
    addressed: u64(72), minZoom: buf.readUInt8(100), maxZoom: buf.readUInt8(101) };
  const per = {};
  const walk = (entries) => {
    for (const e of entries) {
      if (e.runLength === 0) {
        walk(parseDir(gunzipSync(buf.subarray(h.leafOffset + e.offset, h.leafOffset + e.offset + e.length))));
      } else {
        for (let i = 0; i < e.runLength; i++) {
          const [z, x, y] = idToZxy(e.tileId + i);
          const s = per[z] ?? (per[z] = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, tiles: 0 });
          s.tiles++;
          if (x < s.minX) s.minX = x; if (x > s.maxX) s.maxX = x;
          if (y < s.minY) s.minY = y; if (y > s.maxY) s.maxY = y;
        }
      }
    }
  };
  walk(parseDir(gunzipSync(buf.subarray(h.rootOffset, h.rootOffset + h.rootLength))));
  const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
  for (const z of Object.keys(per)) {
    per[z].west = x2lon(per[z].minX, Number(z));
    per[z].east = x2lon(per[z].maxX + 1, Number(z));
  }
  return { header: h, perZoom: per };
}

const archive = readFootprints(join(root, KUNGSLEDEN_CONFIG.pmtilesPath));

// ---- The requirement --------------------------------------------------------
//
// Widest supported viewport (1920×1080 -> 1772px map after the 148px labelled
// rail) with PR #100's overview padding, route centred. Recomputed here rather
// than hard-coded so a route or padding change surfaces as a failure.
const R = route.bounds;
const MERC = 6378137;
const mercX = (lon) => (lon * Math.PI * MERC) / 180;
const mercY = (lat) => MERC * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercX = (x) => (x / (Math.PI * MERC)) * 180;
const OVERVIEW_PAD = { top: 66, bottom: 12, left: 48, right: 48 };
const WIDEST = { mapW: 1772, mapH: 1080 };

const requiredCentredExtent = () => {
  const rw = mercX(R[1][0]) - mercX(R[0][0]);
  const rh = mercY(R[1][1]) - mercY(R[0][1]);
  const uW = WIDEST.mapW - OVERVIEW_PAD.left - OVERVIEW_PAD.right;
  const uH = WIDEST.mapH - OVERVIEW_PAD.top - OVERVIEW_PAD.bottom;
  const scale = Math.max(rw / uW, rh / uH);
  const cx = (mercX(R[0][0]) + mercX(R[1][0])) / 2;
  const half = (WIDEST.mapW * scale) / 2;
  return { west: invMercX(cx - half), east: invMercX(cx + half),
    zoom: Math.log2((2 * Math.PI * MERC) / (512 * scale)) };
};

// Vector source zoom is floor(mapZoom) (512px vector tiles). The supported
// overview set resolves to z7 and z8; z9 is required as headroom because the
// widest supported viewport sits just below the z8->z9 boundary.
const OVERVIEW_SOURCE_ZOOMS = [7, 8, 9];

// ---- Tests ------------------------------------------------------------------

test('the archive is a valid PMTiles v3 vector archive, zoom range unchanged', () => {
  assert.equal(archive.header.minZoom, 0);
  assert.equal(archive.header.maxZoom, 14, 'detail cap stays at 14');
  assert.ok(archive.header.addressed > 9000, 'archive is populated');
});

test('every overview source zoom covers the centred supported overview', () => {
  const need = requiredCentredExtent();
  assert.ok(need.zoom > 8.9 && need.zoom < 9.0,
    `the widest supported viewport sits just below z9 (got ${need.zoom.toFixed(3)})`);
  for (const z of OVERVIEW_SOURCE_ZOOMS) {
    const f = archive.perZoom[z];
    assert.ok(f, `z${z} present`);
    assert.ok(f.west <= need.west,
      `z${z} west ${f.west.toFixed(4)} must reach ${need.west.toFixed(4)}`);
    assert.ok(f.east >= need.east,
      `z${z} east ${f.east.toFixed(4)} must reach ${need.east.toFixed(4)}`);
  }
});

test('the overview margin is not fragile — real slack on the binding (east) side', () => {
  const need = requiredCentredExtent();
  for (const z of OVERVIEW_SOURCE_ZOOMS) {
    const slack = archive.perZoom[z].east - need.east;
    assert.ok(slack > 0.02,
      `z${z} keeps >0.02° of eastern slack (got ${slack.toFixed(4)}°)`);
  }
});

test('detail zooms keep the strict corridor — the widening stops at z9', () => {
  const cut = route.mapCutoutBounds;
  for (const z of [10, 11, 12, 13, 14]) {
    const f = archive.perZoom[z];
    assert.ok(f, `z${z} present`);
    // Tile-aligned outward from the cutout, and never wider than one tile
    // beyond it on either side.
    const tile = 360 / 2 ** z;
    assert.ok(f.west >= cut[0][0] - tile,
      `z${z} west ${f.west.toFixed(4)} stays at the cutout corridor`);
    assert.ok(f.east <= cut[1][0] + tile,
      `z${z} east ${f.east.toFixed(4)} stays at the cutout corridor`);
  }
});

test('the widening is longitude-only: no zoom gained latitude rows', () => {
  // North/south is set by the cutout at every zoom; the overview box reuses
  // the cutout's latitudes, so y ranges must match the cutout's tile rows.
  const cut = route.mapCutoutBounds;
  const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
  for (const z of [...OVERVIEW_SOURCE_ZOOMS, 10, 11, 12]) {
    const f = archive.perZoom[z];
    assert.equal(f.minY, lat2y(cut[1][1], z), `z${z} north row is the cutout's`);
    assert.equal(f.maxY, lat2y(cut[0][1], z), `z${z} south row is the cutout's`);
  }
});

test('the coverage contract inputs themselves are unchanged', () => {
  // This PR must not have bought coverage by enlarging the global buffers —
  // that would widen every zoom of every archive.
  assert.equal(KUNGSLEDEN_CONFIG.userBufferKm, 12);
  assert.equal(KUNGSLEDEN_CONFIG.dataMarginKm, 3);
  assert.deepEqual(route.bounds, [[18.241127, 67.842819], [19.016074, 68.35831]]);
  assert.deepEqual(route.userBounds, [[17.9521, 67.735], [19.3051, 68.4661]]);
  assert.deepEqual(route.mapCutoutBounds, [[17.8799, 67.7081], [19.3773, 68.4931]]);
});

test('the overview allowance is declared, bounded and vector-only', () => {
  const ov = KUNGSLEDEN_CONFIG.vectorOverview;
  assert.ok(ov, 'declared in the route manifest');
  assert.equal(ov.maxZoom, 9, 'widening stops at z9');
  assert.ok(ov.lonMarginDeg > 0 && ov.lonMarginDeg <= 1,
    'a bounded longitude margin, not a global buffer');
  // Raster/contour archives are built from mapCutoutBounds and must not have
  // acquired an overview allowance of their own in this PR.
  const build = readFileSync(join(root, 'scripts/build-terrain-map.sh'), 'utf8');
  assert.ok(!/vectorOverview/.test(build), 'terrain build untouched by this concept');
});
