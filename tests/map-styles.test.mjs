/**
 * Map-style comparison prototype — registry and builder invariants.
 *
 * Guards the constraints in docs/map-style-comparison.md:
 *  - exactly the three agreed options, defaulting to the production style;
 *  - every style is offline-source compatible (Protomaps source-layers only,
 *    no glyph/sprite/symbol dependencies, no remote URLs);
 *  - 'current' stays byte-identical to the production @protomaps/basemaps
 *    output (the control version must not drift);
 *  - Liberty and Liberty—Nordic share structure (ids, filters, zooms,
 *    widths) so the comparison isolates colour, not data or hierarchy;
 *  - no gpx.studio tile/font/sprite endpoints, no MapTiler, no Liberty
 *    Satellite configuration anywhere in the source tree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import {
  MAP_STYLE_OPTIONS,
  DEFAULT_MAP_STYLE_ID,
  isMapStyleId,
  isVectorStyleId,
  isBenchmarkEnabled,
  basemapLayersForStyle,
} from '../src/map/mapStyles.mjs';
import {
  libertyTopoLayers,
  LIBERTY_TOPO_PALETTE,
  NORDIC_TOPO_PALETTE,
  PROTOMAPS_SOURCE_LAYERS,
} from '../src/map/libertyTopoLayers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'protomaps';

/** Ids that runtime code owns; basemap builders must never collide with. */
const RESERVED_LAYER_IDS = [
  'placeholder-background',
  'satellite',
  'thunderforest-outdoors',
  'route-overview',
  'route-stages',
  'route-stage-selected-casing',
  'route-stage-selected',
  'route-stages-hit',
  'scrub-point-halo',
  'scrub-point',
  'gps-halo',
  'gps-dot',
];

test('exactly the three vector styles plus the online benchmark are registered', () => {
  assert.deepEqual(
    MAP_STYLE_OPTIONS.map((o) => o.id),
    ['current', 'liberty', 'liberty-nordic', 'thunderforest-outdoors'],
  );
  assert.deepEqual(
    MAP_STYLE_OPTIONS.map((o) => o.label),
    ['Current', 'Liberty Topo', 'Liberty Topo — Nordic', 'Thunderforest Outdoors'],
  );
  assert.equal(DEFAULT_MAP_STYLE_ID, 'liberty-nordic', 'production default is the decided Nordic style');
  assert.ok(isMapStyleId('liberty-nordic'));
  assert.ok(isMapStyleId('thunderforest-outdoors'));
  assert.ok(!isMapStyleId('liberty-satellite'));
  assert.throws(() => basemapLayersForStyle('liberty-satellite', SOURCE));
});

test('the online benchmark can never masquerade as an offline vector style', () => {
  const tf = MAP_STYLE_OPTIONS.find((o) => o.id === 'thunderforest-outdoors');
  assert.equal(tf.kind, 'raster-online');
  assert.equal(tf.requiresApiKey, true);
  assert.equal(tf.supportingLabel, 'Online preview');
  assert.ok(!isVectorStyleId('thunderforest-outdoors'));
  assert.notEqual(DEFAULT_MAP_STYLE_ID, 'thunderforest-outdoors', 'never the default basemap');
  // The vector builder must refuse it: the offline invariants below only
  // hold because the raster benchmark lives outside basemapLayersForStyle.
  assert.throws(() => basemapLayersForStyle('thunderforest-outdoors', SOURCE));
});

test('benchmark selector visibility: dev default on, production opt-in only', () => {
  // Dev builds show the temporary comparison selector regardless of the flag.
  assert.equal(isBenchmarkEnabled(true, undefined), true);
  assert.equal(isBenchmarkEnabled(true, 'false'), true);
  // Production requires the explicit flag — normal users see only the
  // production map experience.
  assert.equal(isBenchmarkEnabled(false, 'true'), true);
  assert.equal(isBenchmarkEnabled(false, ' true '), true, 'whitespace tolerated');
  assert.equal(isBenchmarkEnabled(false, undefined), false);
  assert.equal(isBenchmarkEnabled(false, ''), false);
  assert.equal(isBenchmarkEnabled(false, 'false'), false);
  assert.equal(isBenchmarkEnabled(false, '1'), false, 'only the exact word true');
  assert.equal(isBenchmarkEnabled(false, 'TRUE'), false, 'case-sensitive by design');
});

const VECTOR_STYLE_OPTIONS = MAP_STYLE_OPTIONS.filter((o) => o.kind === 'vector-offline');

test('every vector style is registered as offline-capable', () => {
  assert.deepEqual(
    VECTOR_STYLE_OPTIONS.map((o) => o.id),
    ['current', 'liberty', 'liberty-nordic'],
  );
  for (const o of VECTOR_STYLE_OPTIONS) assert.ok(isVectorStyleId(o.id));
});

for (const { id } of VECTOR_STYLE_OPTIONS) {
  test(`style '${id}' is offline-compatible with the shipped PMTiles source`, () => {
    const layers = basemapLayersForStyle(id, SOURCE);
    assert.ok(layers.length > 0, 'produces layers');

    const ids = layers.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length, 'layer ids are unique');
    for (const rid of RESERVED_LAYER_IDS) {
      assert.ok(!ids.includes(rid), `must not shadow runtime layer '${rid}'`);
    }

    for (const layer of layers) {
      if (layer.type === 'background') continue;
      assert.equal(layer.source, SOURCE, `${layer.id} uses the shared vector source`);
      assert.ok(
        PROTOMAPS_SOURCE_LAYERS.includes(layer['source-layer']),
        `${layer.id} targets a source-layer that exists in the archive (${layer['source-layer']})`,
      );
      // No glyphs or sprites ship with the app: symbol layers and pattern/
      // icon/text properties would render as missing-resource errors.
      assert.notEqual(layer.type, 'symbol', `${layer.id} must not be a symbol layer`);
      const serialized = JSON.stringify(layer);
      for (const forbidden of ['fill-pattern', 'icon-image', 'text-field', 'line-pattern']) {
        assert.ok(!serialized.includes(forbidden), `${layer.id} must not use ${forbidden}`);
      }
      assert.ok(!/https?:/.test(serialized), `${layer.id} must not embed remote URLs`);
    }
  });
}

test("'current' is byte-identical to the production protomaps style", () => {
  assert.deepEqual(
    basemapLayersForStyle('current', SOURCE),
    protomapsLayers(SOURCE, namedFlavor('light'), {}),
  );
});

test('Liberty and Liberty—Nordic share structure; only documented divergences remain', () => {
  const liberty = libertyTopoLayers(SOURCE, LIBERTY_TOPO_PALETTE);
  const nordic = libertyTopoLayers(SOURCE, NORDIC_TOPO_PALETTE);

  // Documented structural exceptions of the Nordic terrain hierarchy restyle
  // (benchmark §7 Phase 1 / §9 risk 5): Nordic starts trails one zoom
  // earlier (z12) than the verbatim Liberty reference (z13). Anything NOT
  // listed here must stay structurally identical.
  const MINZOOM_EXCEPTIONS = new Set(['lt_trail', 'lt_trail_casing']);

  // The Nordic palette may enable the palette-gated extras (rock, cliff,
  // glacier outline, river polygons); every layer that exists in both must
  // agree on everything except paint.
  const nordicById = new Map(nordic.map((l) => [l.id, l]));
  for (const l of liberty) {
    const n = nordicById.get(l.id);
    assert.ok(n, `Nordic version is missing Liberty layer ${l.id}`);
    assert.deepEqual(n.filter, l.filter, `${l.id}: same filter (same data)`);
    if (MINZOOM_EXCEPTIONS.has(l.id)) {
      assert.equal(n.minzoom, 12, `${l.id}: Nordic trail layers start at z12 (documented)`);
      assert.equal(l.minzoom, 13, `${l.id}: Liberty reference keeps its verbatim z13`);
    } else {
      assert.equal(n.minzoom, l.minzoom, `${l.id}: same minzoom (fair zoom thresholds)`);
    }
    assert.equal(n.maxzoom, l.maxzoom, `${l.id}: same maxzoom`);
    assert.equal(n.type, l.type, `${l.id}: same layer type`);
  }
  const extras = nordic.filter((l) => !liberty.some((x) => x.id === l.id)).map((l) => l.id);
  assert.deepEqual(
    extras,
    ['lt_rock', 'lt_ice_outline', 'lt_cliff', 'lt_water_river'],
    'only the documented palette-gated extras',
  );
});

test('no gpx.studio tile endpoints, MapTiler or Liberty Satellite in the source tree', () => {
  const forbidden = [
    /tiles\.gpx\.studio/i,
    /fonts\.gpx\.studio/i,
    /sprites\.gpx\.studio/i,
    /maptiler/i,
    /liberty-satellite/i,
  ];
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === 'generated') continue;
        walk(p);
      } else if (/\.(ts|tsx|mjs|mts|js|json|css|html)$/.test(name)) {
        const content = readFileSync(p, 'utf8');
        for (const re of forbidden) {
          if (re.test(content)) offenders.push(`${p}: ${re}`);
        }
      }
    }
  };
  walk(join(root, 'src'));
  for (const f of ['package.json', 'index.html', 'vite.config.ts']) {
    const content = readFileSync(join(root, f), 'utf8');
    for (const re of forbidden) {
      if (re.test(content)) offenders.push(`${f}: ${re}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('Liberty licence attribution is registered in the central registry', () => {
  const attribution = readFileSync(join(root, 'src/data/attribution.ts'), 'utf8');
  assert.ok(attribution.includes('github.com/gpxstudio/styles'), 'links the style source repo');
  assert.ok(/Zsolt Ero/.test(attribution), 'credits the OpenFreeMap Styles copyright holder');
  assert.ok(/osm-liberty/.test(attribution), 'credits the OSM Liberty design lineage');
});
