/**
 * Coverage-contract invariants (0.15.0 bounded-map iteration).
 *
 * The contract (scripts/route-configs.mjs → generate-route-data.mjs):
 *   routeBounds ⊂ userBounds (route + userBufferKm — the camera's maxBounds)
 *             ⊂ mapCutoutBounds (+ dataMarginKm — what every archive builds).
 *
 * These tests fail when:
 *  - the generated bounds stop honouring the buffer/margin arithmetic;
 *  - the camera bounds exceed what the archives cover;
 *  - a locally present archive does not fully cover the user bounds
 *    (archive checks self-skip when the binary is absent — CI runs the test
 *    suite before the release assets are injected; the committed vector
 *    archive is always checked).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { PMTiles } from 'pmtiles';
import { KUNGSLEDEN_CONFIG } from '../scripts/route-configs.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLon = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);
const midLat = (route.bounds[0][1] + route.bounds[1][1]) / 2;

test('user bounds = route bounds + userBufferKm on every side', () => {
  const [[rw, rs], [re, rn]] = route.bounds;
  const [[uw, us], [ue, un]] = route.userBounds;
  const buffer = KUNGSLEDEN_CONFIG.userBufferKm;
  const tol = 0.2; // km — generator rounding
  assert.ok(Math.abs((rw - uw) * kmPerDegLon(midLat) - buffer) < tol, 'west buffer');
  assert.ok(Math.abs((ue - re) * kmPerDegLon(midLat) - buffer) < tol, 'east buffer');
  assert.ok(Math.abs((rs - us) * KM_PER_DEG_LAT - buffer) < tol, 'south buffer');
  assert.ok(Math.abs((un - rn) * KM_PER_DEG_LAT - buffer) < tol, 'north buffer');
});

test('data cutout = user bounds + dataMarginKm hidden margin on every side', () => {
  const [[uw, us], [ue, un]] = route.userBounds;
  const [[cw, cs], [ce, cn]] = route.mapCutoutBounds;
  const margin = KUNGSLEDEN_CONFIG.dataMarginKm;
  const tol = 0.2;
  assert.ok(Math.abs((uw - cw) * kmPerDegLon(midLat) - margin) < tol, 'west margin');
  assert.ok(Math.abs((ce - ue) * kmPerDegLon(midLat) - margin) < tol, 'east margin');
  assert.ok(Math.abs((us - cs) * KM_PER_DEG_LAT - margin) < tol, 'south margin');
  assert.ok(Math.abs((cn - un) * KM_PER_DEG_LAT - margin) < tol, 'north margin');
});

/** Minimal node Source for the pmtiles reader (header access only). */
class FileSource {
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

const ARCHIVES = [
  { file: 'public/maps/kungsleden.pmtiles', name: 'vector basemap', alwaysPresent: true, zooms: [0, 14] },
  // Expected zoom ranges double as a STALE-VERSION GUARD: a v1 relief file
  // (terrain minzoom 6) or v1 satellite (old 9 km bounds) mixed into a v2
  // runtime fails here or in the bounds assertions above.
  { file: 'public/maps/kungsleden-terrain.pmtiles', name: 'terrain', zooms: [7, 12] },
  // Contours v3 (0.17.0): index lines tiled from z9 (earlier-contours
  // iteration), full 20 m set joins at z12, tiles stop at z13.
  { file: 'public/maps/kungsleden-contours.pmtiles', name: 'contours', zooms: [9, 13] },
  { file: 'public/maps/kungsleden-satellite.pmtiles', name: 'satellite', zooms: [7, 13] },
];

for (const { file, name, alwaysPresent, zooms } of ARCHIVES) {
  test(`${name} archive fully covers the camera's user bounds`, async (t) => {
    const path = join(root, file);
    if (!existsSync(path)) {
      assert.ok(!alwaysPresent, `${file} must exist (committed archive)`);
      t.skip(`${file} not present in this checkout (release-injected)`);
      return;
    }
    const header = await new PMTiles(new FileSource(path)).getHeader();
    const [[uw, us], [ue, un]] = route.userBounds;
    assert.ok(header.minLon <= uw, `${name}: west edge ${header.minLon} covers ${uw}`);
    assert.ok(header.maxLon >= ue, `${name}: east edge ${header.maxLon} covers ${ue}`);
    assert.ok(header.minLat <= us, `${name}: south edge ${header.minLat} covers ${us}`);
    assert.ok(header.maxLat >= un, `${name}: north edge ${header.maxLat} covers ${un}`);
    // Physical hidden margin: nominal dataMarginKm minus generator rounding.
    const worstKm = Math.min(
      (uw - header.minLon) * kmPerDegLon(midLat),
      (header.maxLon - ue) * kmPerDegLon(midLat),
      (us - header.minLat) * KM_PER_DEG_LAT,
      (header.maxLat - un) * KM_PER_DEG_LAT,
    );
    assert.ok(
      worstKm >= KUNGSLEDEN_CONFIG.dataMarginKm - 0.25,
      `${name}: physical margin ${worstKm.toFixed(2)} km ≥ nominal ${KUNGSLEDEN_CONFIG.dataMarginKm} km`,
    );
    assert.equal(header.minZoom, zooms[0], `${name}: minzoom matches the runtime contract`);
    assert.equal(header.maxZoom, zooms[1], `${name}: maxzoom matches the runtime contract`);
  });
}

test('runtime terrain/contour zoom configuration matches the archive contract', () => {
  // The style layer thresholds are TS/mjs constants; assert their literals
  // so a config drift cannot pass unnoticed even without archives present.
  const mapStyle = readFileSync(join(root, 'src/map/mapStyle.ts'), 'utf8');
  assert.match(mapStyle, /TERRAIN_MAX_ZOOM = 12/, 'raster-dem maxzoom 12');
  const layers = readFileSync(join(root, 'src/map/libertyTopoLayers.mjs'), 'utf8');
  assert.match(layers, /lt_contour_index'[\s\S]{0,200}minzoom: 9\.5/, 'index contours fade in from z9.5');
  assert.match(layers, /'lt_contour'[\s\S]{0,200}minzoom: 11\.5/, 'full contour set fades in from z11.5');
  const camera = readFileSync(join(root, 'src/map/cameraBounds.mjs'), 'utf8');
  assert.match(camera, /TERRAIN_MIN_ZOOM = 7/, 'overview envelope derives from terrain z7');
});
