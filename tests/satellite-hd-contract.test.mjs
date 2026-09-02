/**
 * Satellite HD detail add-on — the contracts that keep Basic untouched, the
 * shards complete, the platforms honest and the Pages artifact small.
 *
 * The architecture under test: Satellite Basic (satellite-data-v5, z7–15)
 * remains THE satellite archive on both platforms; HD detail is a separate
 * native-only optional download of two z16/q95 shards that the map layers
 * above Basic automatically in the one SAT mode. GitHub Pages caps a
 * published site at ~1 GB, so the ~2.1 GB of shards must never reach the
 * web artifact — that absence is enforced twice and fenced here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import {
  MAP_ASSETS,
  MAP_DOWNLOAD_GROUPS,
  NATIVE_OPTIONAL_MAP_ASSETS,
  OPTIONAL_MAP_ASSETS,
  WEB_OPTIONAL_MAP_ASSETS,
} from '../src/map/mapCatalog.mjs';
import {
  SATELLITE_ARCHIVE_MAX_ZOOM,
  SATELLITE_HD_MAX_ZOOM,
  SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM,
  satelliteSourceCoverage,
} from '../src/map/overviewEnvelope.mjs';
import { detailTileInventory } from '../scripts/lib/lantmateriet-stac.mjs';
import { inspectHeader } from '../scripts/lib/pmtiles-inspect.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));
const read = (p) => readFileSync(join(root, p), 'utf8');

const HD_IDS = ['satelliteHdNorth', 'satelliteHdSouth'];
const NORTH = MAP_ASSETS.satelliteHdNorth;
const SOUTH = MAP_ASSETS.satelliteHdSouth;

// ---- catalog shape ---------------------------------------------------------

test('HD is two native-only optional shards under one download group', () => {
  for (const id of HD_IDS) {
    const asset = MAP_ASSETS[id];
    assert.equal(asset.distribution, 'optional');
    assert.deepEqual({ ...asset.platforms }, { web: false, native: true }, `${id} is native-only`);
    assert.equal(asset.revision.coverage.minZoom, SATELLITE_HD_MAX_ZOOM);
    assert.equal(asset.revision.coverage.maxZoom, SATELLITE_HD_MAX_ZOOM);
    assert.equal(asset.release.tag, 'satellite-hd-data-v1', `${id} has its own release lineage`);
    assert.equal(asset.release.asset, asset.file);
  }
  const group = MAP_DOWNLOAD_GROUPS.find((g) => g.id === 'satelliteHd');
  assert.deepEqual([...group.assetIds], HD_IDS, 'one user-facing HD download choice');
});

test('every pre-HD asset stays available on both platforms', () => {
  for (const id of ['vector', 'terrain', 'contours', 'satellite']) {
    assert.deepEqual({ ...MAP_ASSETS[id].platforms }, { web: true, native: true }, id);
  }
  assert.deepEqual([...WEB_OPTIONAL_MAP_ASSETS], ['terrain', 'contours', 'satellite']);
  assert.deepEqual(
    [...NATIVE_OPTIONAL_MAP_ASSETS],
    ['terrain', 'contours', 'satellite', 'satelliteHdNorth', 'satelliteHdSouth'],
  );
  // The union list keeps meaning "no optional archive in any app package".
  assert.deepEqual(
    [...OPTIONAL_MAP_ASSETS].sort(),
    [...new Set([...WEB_OPTIONAL_MAP_ASSETS, ...NATIVE_OPTIONAL_MAP_ASSETS])].sort(),
  );
});

test('Satellite Basic is byte-for-byte the shipped v5 — HD changed nothing', () => {
  const basic = MAP_ASSETS.satellite;
  assert.equal(basic.revision.id, 'kungsleden-satellite-data-v5');
  assert.equal(basic.revision.bytes, 293_720_600);
  assert.equal(basic.revision.sha256, '29996eec00e5a792284f842ea7556e6015dfb85ae9bde9741061ebe56dd110b9');
  assert.equal(basic.revision.coverage.maxZoom, 15);
  assert.equal(basic.release.tag, 'satellite-data-v5');
  assert.equal(basic.file, 'kungsleden-satellite.pmtiles');
  assert.equal(basic.cacheName, 'fjallkompis-offline-satellite-v1');
  // The camera/coverage constant still describes Basic's physical archive;
  // HD's z16 is a separate constant, never written into Basic's metadata.
  assert.equal(SATELLITE_ARCHIVE_MAX_ZOOM, 15);
  assert.equal(SATELLITE_HD_MAX_ZOOM, 16);
});

// ---- corridor completeness -------------------------------------------------

test('the shard union is EXACTLY the canonical z16 corridor — no gap, no overlap', () => {
  const inv = detailTileInventory(route.mapCutoutBounds, SATELLITE_HD_MAX_ZOOM);
  const z16 = inv[inv.length - 1];
  assert.equal(z16.z, SATELLITE_HD_MAX_ZOOM);
  const n = NORTH.revision.coverage.tilesByZoom[0];
  const s = SOUTH.revision.coverage.tilesByZoom[0];
  assert.deepEqual([...n.x], [z16.xMin, z16.xMax], 'north spans the full corridor width');
  assert.deepEqual([...s.x], [z16.xMin, z16.xMax], 'south spans the full corridor width');
  assert.equal(n.y[0], z16.yMin, 'north starts at the corridor top');
  assert.equal(s.y[1], z16.yMax, 'south ends at the corridor bottom');
  assert.equal(n.y[1] + 1, s.y[0], 'shards meet on an exact tile-row boundary');
  assert.equal(n.count + s.count, z16.count, 'union tile count is the whole corridor');
  assert.equal(n.count, (n.x[1] - n.x[0] + 1) * (n.y[1] - n.y[0] + 1), 'north is a complete rectangle');
  assert.equal(s.count, (s.x[1] - s.x[0] + 1) * (s.y[1] - s.y[0] + 1), 'south is a complete rectangle');
});

test('the camera envelope at z16 lies inside the physical HD corridor', () => {
  // The satellite-mode envelope claims tile-aligned coverage at each source
  // zoom; the HD shards physically carry the z14-aligned corridor's z16
  // children. Envelope ⊆ physical means the camera can never show a blank
  // HD area inside its own bounds.
  const envelope = satelliteSourceCoverage(SATELLITE_HD_MAX_ZOOM, route.mapCutoutBounds);
  const north = NORTH.revision.coverage.bounds;
  const south = SOUTH.revision.coverage.bounds;
  const west = Math.min(north[0][0], south[0][0]);
  const east = Math.max(north[1][0], south[1][0]);
  const southLat = Math.min(north[0][1], south[0][1]);
  const northLat = Math.max(north[1][1], south[1][1]);
  assert.ok(west <= envelope.west + 1e-6 && east >= envelope.east - 1e-6, 'width covered');
  assert.ok(southLat <= envelope.south + 1e-6 && northLat >= envelope.north - 1e-6, 'height covered');
  // And the shards abut: north's south edge IS south's north edge.
  assert.ok(Math.abs(north[0][1] - south[1][1]) < 1e-6, 'no latitude gap between shards');
  assert.equal(SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM, 13, 'the Sentinel/overview split is untouched');
});

// ---- distribution fences ---------------------------------------------------

test('the Pages pipeline handles ONLY web assets and enforces HD absence', () => {
  const script = read('scripts/map-archives.mjs');
  assert.match(script, /WEB_OPTIONAL_MAP_ASSETS/, 'fetch/verify derive from the web list');
  assert.match(script, /must NOT enter the web artifact/, 'native-only presence fails the deploy');
  assert.match(script, /correctly absent \(native-only\)/, 'absence is asserted, not assumed');
  const vite = read('vite.config.ts');
  assert.match(vite, /stripNativeOnlyMapArchives/, 'the web build prunes native-only archives');
  assert.match(vite, /asset\.platforms\.web/, '…driven by the catalog platform declaration');
});

test('both Android workflows assert the HD shards stay out of the AAB', () => {
  for (const wf of ['android-internal-release.yml', 'android-spike.yml']) {
    const source = read(`.github/workflows/${wf}`);
    assert.match(source, /kungsleden-satellite-hd-north\.pmtiles/, `${wf} checks north`);
    assert.match(source, /kungsleden-satellite-hd-south\.pmtiles/, `${wf} checks south`);
  }
});

// ---- runtime composition ---------------------------------------------------

test('HD renders as an automatic overlay in the ONE SAT mode', () => {
  const style = read('src/map/mapStyle.ts');
  assert.match(style, /SATELLITE_HD_MIN_DISPLAY_ZOOM = 15\.5/, 'HD takes over exactly where Basic runs out of native data');
  assert.match(style, /minzoom: SATELLITE_HD_MIN_DISPLAY_ZOOM/, 'the boundary is applied to the HD layers');
  const hdBlock = style.slice(style.indexOf('HD detail shards'), style.indexOf('return style'));
  assert.ok(!/^\s*attribution:/m.test(hdBlock), 'HD sources add no duplicate attribution property — Basic already credits both sources');
  const protocol = read('src/map/pmtilesProtocol.ts');
  assert.match(protocol, /ALL shards must\s*\n?\s*\* be present/, 'half a corridor never renders');
  const mapView = read('src/components/MapView.tsx');
  assert.match(mapView, /resolveSatelliteHd\(\)/, 'resolved with the other archives');
  assert.match(mapView, /SATELLITE_HD_LAYER_PREFIX.*\n.*visibility.*\n?.*imagery === 'satellite'/, 'HD follows the SAT toggle');
  assert.ok(!mapView.includes('satBenchmark'), 'the temporary A/B benchmark is gone from production code');
});

test('Settings offers HD as a dependent add-on, never as an orphan', () => {
  const card = read('src/components/OfflineMapCard.tsx');
  assert.match(card, /archiveAvailableOnThisPlatform/, 'platform availability is asked through the store boundary');
  assert.match(card, /Download Satellite imagery first/, 'HD download is gated on Basic');
  assert.match(card, /HD detail on this device needs it and will be removed as well/, 'removing Basic explains the cascade');
  assert.match(card, /if \(!hdOffered\) return basicCard;/, 'the web renders exactly the pre-HD card');
  const store = read('src/map/archiveStore.ts');
  assert.match(store, /spec\.asset\.platforms\.native : spec\.asset\.platforms\.web/, 'the store answers from the catalog');
});

// ---- the physical shards, when this checkout holds them ---------------------

for (const id of HD_IDS) {
  test(`${id} archive bytes match the catalog when present`, async (t) => {
    const asset = MAP_ASSETS[id];
    const path = join(root, 'public/maps', asset.file);
    if (!existsSync(path)) {
      t.skip(`${asset.file} not present (release-hosted, never committed)`);
      return;
    }
    assert.equal(statSync(path).size, asset.revision.bytes, 'byte length');
    const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
    assert.equal(digest, asset.revision.sha256, 'sha256');
    const header = await inspectHeader(path);
    assert.equal(header.minZoom, SATELLITE_HD_MAX_ZOOM);
    assert.equal(header.maxZoom, SATELLITE_HD_MAX_ZOOM);
    assert.equal(header.numAddressedTiles, asset.revision.coverage.tilesByZoom[0].count);
    const [[w, s], [e, n]] = asset.revision.coverage.bounds;
    for (const [actual, declared] of [
      [header.bounds[0], w], [header.bounds[1], s], [header.bounds[2], e], [header.bounds[3], n],
    ]) {
      assert.ok(Math.abs(actual - declared) < 1e-6, `header bound ${actual} ≈ ${declared}`);
    }
  });
}
