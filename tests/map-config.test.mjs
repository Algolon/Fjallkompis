/**
 * Deterministic, DOM-free validation of the layered-map foundation:
 *  - MapConfig defaulting / normalisation (the persisted preference model),
 *  - offline-asset registry invariants,
 *  - the pipeline-emitted asset-manifest sidecar validator.
 *
 * These mirror the .mjs + .d.mts convention already used for the persisted
 * trip-data schema, so `node --test` exercises the same modules the app ships.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BASE_MAPS,
  DEFAULT_MAP_CONFIG,
  isBaseMap,
  normalizeMapConfig,
} from '../src/map/mapConfig.mjs';
import {
  ASSET_KINDS,
  OFFLINE_ASSETS,
  REQUIRED_MANIFEST_KEYS,
  baseAssets,
  getAsset,
  listAssets,
  overlayAssets,
  validateAssetManifest,
} from '../src/map/assetRegistry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (p) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures', p), 'utf8'));

// ---- MapConfig model --------------------------------------------------------

test('default config is topographic with all overlays off', () => {
  assert.deepEqual(DEFAULT_MAP_CONFIG, {
    baseMap: 'topographic',
    contoursEnabled: false,
    hillshadeEnabled: false,
    labelsEnabled: false,
  });
  assert.deepEqual([...BASE_MAPS], ['topographic', 'satellite']);
});

test('isBaseMap only accepts the two known base maps', () => {
  assert.equal(isBaseMap('topographic'), true);
  assert.equal(isBaseMap('satellite'), true);
  assert.equal(isBaseMap('hybrid'), false);
  assert.equal(isBaseMap(null), false);
});

test('normalizeMapConfig passes a fully valid persisted config through', () => {
  assert.deepEqual(normalizeMapConfig(fixture('map-config/valid.json')), {
    baseMap: 'satellite',
    contoursEnabled: true,
    hillshadeEnabled: false,
    labelsEnabled: true,
  });
});

test('normalizeMapConfig fills missing overlay fields from defaults', () => {
  assert.deepEqual(normalizeMapConfig(fixture('map-config/partial.json')), {
    baseMap: 'topographic',
    contoursEnabled: false,
    hillshadeEnabled: false,
    labelsEnabled: false,
  });
});

test('normalizeMapConfig falls back to defaults for corrupt values', () => {
  // Unknown base map, string/number/null overlay flags → topographic + all off.
  assert.deepEqual(normalizeMapConfig(fixture('map-config/corrupt.json')), {
    ...DEFAULT_MAP_CONFIG,
  });
});

test('normalizeMapConfig never throws on junk input', () => {
  for (const junk of [null, undefined, 42, 'x', [], true]) {
    assert.deepEqual(normalizeMapConfig(junk), { ...DEFAULT_MAP_CONFIG });
  }
});

test('normalizeMapConfig is idempotent', () => {
  const once = normalizeMapConfig(fixture('map-config/valid.json'));
  assert.deepEqual(normalizeMapConfig(once), once);
});

// ---- Offline-asset registry -------------------------------------------------

test('registry ids, cache names and paths are unique', () => {
  const assets = listAssets();
  const unique = (key) => new Set(assets.map((a) => a[key])).size === assets.length;
  assert.ok(unique('id'), 'ids unique');
  assert.ok(unique('cacheName'), 'cache names unique');
  assert.ok(unique('path'), 'paths unique');
});

test('exactly one required asset — topographic, the dependable fallback', () => {
  const required = listAssets().filter((a) => a.required);
  assert.equal(required.length, 1);
  assert.equal(required[0].id, 'topographic');
  assert.equal(required[0].available, true);
  assert.equal(required[0].role, 'base');
});

test('base maps are exactly topographic + satellite', () => {
  assert.deepEqual(
    baseAssets().map((a) => a.id).sort(),
    ['satellite', 'topographic'],
  );
});

test('overlays are contours, hillshade and labels', () => {
  assert.deepEqual(
    overlayAssets().map((a) => a.id).sort(),
    ['contours', 'hillshade', 'labels'],
  );
});

test('every asset has a valid kind, positive size and non-empty attribution', () => {
  for (const a of listAssets()) {
    assert.ok(ASSET_KINDS.includes(a.kind), `${a.id} kind`);
    assert.ok(typeof a.expectedSizeBytes === 'number' && a.expectedSizeBytes > 0, `${a.id} size`);
    assert.ok(a.attribution.length > 0, `${a.id} attribution`);
  }
});

test('an unavailable asset is never marked as required, and cache names are dedicated', () => {
  for (const a of listAssets()) {
    if (!a.available) assert.equal(a.required, false, `${a.id} not required`);
    // Never the Workbox app-shell caches (workbox-* / precache).
    assert.ok(!/workbox|precache/i.test(a.cacheName), `${a.id} dedicated cache`);
  }
});

test('getAsset resolves known ids and rejects unknown ones', () => {
  assert.equal(getAsset('topographic'), OFFLINE_ASSETS.topographic);
  assert.equal(getAsset('nope'), null);
});

// ---- Pipeline asset-manifest sidecar ---------------------------------------

test('the sample asset manifest fixture is valid', () => {
  const { ok, problems } = validateAssetManifest(fixture('asset-manifest.sample.json'));
  assert.deepEqual(problems, []);
  assert.equal(ok, true);
});

test('manifest validation reports each missing required key', () => {
  const { ok, problems } = validateAssetManifest({});
  assert.equal(ok, false);
  for (const key of REQUIRED_MANIFEST_KEYS) {
    assert.ok(
      problems.some((p) => p.includes(key)),
      `reports missing ${key}`,
    );
  }
});

test('manifest validation rejects bad kind, size, bbox and date', () => {
  const base = fixture('asset-manifest.sample.json');
  assert.equal(validateAssetManifest({ ...base, kind: 'png' }).ok, false);
  assert.equal(validateAssetManifest({ ...base, sizeBytes: 0 }).ok, false);
  assert.equal(validateAssetManifest({ ...base, bbox: [1, 2, 3] }).ok, false);
  assert.equal(validateAssetManifest({ ...base, sourceDate: 'summer' }).ok, false);
});
