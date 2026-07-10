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
import { existsSync } from 'node:fs';
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
  { file: 'public/maps/kungsleden.pmtiles', name: 'vector basemap', alwaysPresent: true },
  { file: 'public/maps/kungsleden-terrain.pmtiles', name: 'terrain' },
  { file: 'public/maps/kungsleden-contours.pmtiles', name: 'contours' },
  { file: 'public/maps/kungsleden-satellite.pmtiles', name: 'satellite' },
];

for (const { file, name, alwaysPresent } of ARCHIVES) {
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
  });
}
