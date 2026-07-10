/**
 * Production basemap style (Liberty Topo — Nordic) — builder invariants.
 *
 * The three-way style comparison and the temporary Thunderforest benchmark
 * are CONCLUDED (docs/map-style-comparison.md): 'liberty-nordic' is the one
 * production terrain style and the comparison registry, selector, flags and
 * online-preview code were removed. This suite now guards:
 *  - offline compatibility (Protomaps source-layers only, no glyph/sprite/
 *    symbol dependencies, no remote URLs, no reserved-id collisions);
 *  - the Nordic terrain hierarchy (0.17.0 legibility iteration): the
 *    vegetation ladder, the wetland/rock/glacier distinctions, the
 *    near-background low-zoom grassland that removes the z7→z8 jump;
 *  - relief behaviour: optional hillshade/contour layers, stack order,
 *    the earlier-contours zoom ramps, graceful degradation without archives;
 *  - retirement of the comparison phase (no benchmark flags, no
 *    Thunderforest endpoints or keys anywhere in the source tree);
 *  - licence attribution for the Liberty style lineage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  libertyTopoLayers,
  NORDIC_TOPO_PALETTE,
  PROTOMAPS_SOURCE_LAYERS,
} from '../src/map/libertyTopoLayers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'protomaps';

/** Ids that runtime code owns; the basemap builder must never collide with. */
const RESERVED_LAYER_IDS = [
  'placeholder-background',
  'satellite',
  'route-overview',
  'route-stages',
  'route-stage-selected-casing',
  'route-stage-selected',
  'route-stages-hit',
  'scrub-point-halo',
  'scrub-point',
  'trail-line',
  'gps-halo',
  'gps-dot',
];

const RELIEF = { terrainSourceId: 'terrain-dem', contoursSourceId: 'contours' };

const layersOf = (relief) => libertyTopoLayers(SOURCE, NORDIC_TOPO_PALETTE, relief);

// ---- Colour helpers ---------------------------------------------------------
/** Parse '#rgb'/'#rrggbb', 'rgb(...)' and 'rgba(...)' into {r,g,b,a}. */
function parseColor(value) {
  assert.equal(typeof value, 'string', `expected a colour string, got ${value}`);
  let m = value.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  assert.ok(m, `unparseable colour: ${value}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}
const luminance = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const maxChannelGap = (c1, c2) =>
  Math.max(Math.abs(c1.r - c2.r), Math.abs(c1.g - c2.g), Math.abs(c1.b - c2.b));

// ---- Offline compatibility --------------------------------------------------
test('the production style is offline-compatible with the shipped PMTiles source', () => {
  const layers = layersOf(RELIEF);
  assert.ok(layers.length > 0, 'produces layers');

  const ids = layers.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'layer ids are unique');
  for (const rid of RESERVED_LAYER_IDS) {
    assert.ok(!ids.includes(rid), `must not shadow runtime layer '${rid}'`);
  }

  for (const layer of layers) {
    if (layer.type === 'background') continue;
    if (layer.source === RELIEF.terrainSourceId || layer.source === RELIEF.contoursSourceId) {
      // Relief layers target their own offline archives (checked below).
    } else {
      assert.equal(layer.source, SOURCE, `${layer.id} uses the shared vector source`);
      assert.ok(
        PROTOMAPS_SOURCE_LAYERS.includes(layer['source-layer']),
        `${layer.id} targets a source-layer that exists in the archive (${layer['source-layer']})`,
      );
    }
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

// ---- Nordic terrain hierarchy (0.17.0) --------------------------------------
test('vegetation ladder: grass lighter than scrub lighter than forest, all distinct', () => {
  const p = NORDIC_TOPO_PALETTE;
  const grass = parseColor(p.grass);
  const scrub = parseColor(p.scrub);
  const wood = parseColor(p.wood);
  // Solid fills: the 0.13.0 translucent fills collapsed into near-white
  // pastels over the background — opacity must not carry the hierarchy.
  for (const [name, c] of [['grass', grass], ['scrub', scrub], ['wood', wood]]) {
    assert.equal(c.a, 1, `${name} is a solid fill (colour carries the value)`);
  }
  assert.ok(luminance(grass) > luminance(scrub), 'grass is lighter than scrub');
  assert.ok(luminance(scrub) > luminance(wood), 'scrub is lighter than forest');
  assert.ok(maxChannelGap(grass, scrub) >= 15, 'grass and scrub are clearly separable');
  assert.ok(maxChannelGap(scrub, wood) >= 15, 'scrub and forest are clearly separable');
});

test('open fjäll is a calm tone, no longer near-white', () => {
  const bg = parseColor(NORDIC_TOPO_PALETTE.background);
  assert.ok(luminance(bg) < 232, 'background is visibly deeper than white');
  assert.ok(luminance(bg) > 200, 'background stays a calm light base');
  const grass = parseColor(NORDIC_TOPO_PALETTE.grass);
  assert.ok(maxChannelGap(bg, grass) >= 15, 'open fjäll never reads as meadow');
});

test('low-zoom landcover grassland sits near the background (z7→z8 continuity)', () => {
  const p = NORDIC_TOPO_PALETTE;
  const bg = parseColor(p.background);
  const lcGrass = parseColor(p.landcoverGrassland);
  const grass = parseColor(p.grass);
  // The generalised z≤7 'grassland' polygon covers ~100% of the corridor
  // and vanishes at z8 (measured audit) — its tone must hand over to the
  // background, NOT to the meadow green.
  assert.ok(maxChannelGap(bg, lcGrass) <= 15, 'close to the open-fjäll background');
  assert.ok(
    maxChannelGap(lcGrass, grass) > maxChannelGap(lcGrass, bg),
    'clearly closer to the background than to meadow grass',
  );
  // And the builder must actually use it for the low-zoom layer.
  const landcover = layersOf().find((l) => l.id === 'lt_landcover');
  const match = JSON.stringify(landcover.paint['fill-color']);
  assert.ok(match.includes(JSON.stringify(p.landcoverGrassland)), 'lt_landcover uses the slot');
  assert.ok(match.includes('"grassland"'), 'for the grassland kind');
});

test('wetland is a translucent peat-brown wash, separate from water and vegetation', () => {
  const p = NORDIC_TOPO_PALETTE;
  const wetland = parseColor(p.wetland);
  // Peat/moss/olive-brown: warm (R ≥ G) and clearly not blue.
  assert.ok(wetland.r >= wetland.g, 'wetland is warm-toned (never green like vegetation)');
  assert.ok(wetland.g > wetland.b + 25, 'wetland is never blue like water');
  const water = parseColor(p.water);
  assert.ok(water.b > water.r, 'water stays cool/teal — the opposite hue direction');
  for (const veg of [p.wood, p.grass, p.scrub]) {
    const v = parseColor(veg);
    assert.ok(v.g > v.r, `vegetation ${veg} is green — wetland cannot be confused with it`);
  }
  // Overlay wash: fades in z10→z12 and never becomes an opaque base fill.
  assert.deepEqual(p.wetlandOpacity[0], 'interpolate');
  const stops = p.wetlandOpacity.slice(3);
  assert.equal(stops[0], 10, 'invisible until z10');
  assert.ok(stops[1] <= 0.15, 'starts as a hint');
  assert.equal(stops[2], 12, 'full wash strength by z12');
  assert.ok(stops[3] >= 0.3 && stops[3] <= 0.6, 'stays a translucent wash');
});

test('rock is a cool neutral grey; glacier is bright with a restrained outline', () => {
  const p = NORDIC_TOPO_PALETTE;
  const rock = parseColor(p.rock);
  assert.ok(
    Math.max(rock.r, rock.g, rock.b) - Math.min(rock.r, rock.g, rock.b) <= 12,
    'rock is neutral (no colour cast)',
  );
  const ice = parseColor(p.ice);
  assert.ok(luminance(ice) > 235, 'glacier fill is the brightest terrain surface');
  assert.ok(ice.b >= ice.r, 'glacier is cool');
  const outline = parseColor(p.iceOutline);
  assert.ok(outline.a >= 0.5, 'outline is clear');
  assert.ok(luminance(outline) < 180, 'outline is restrained, not a highlight');
  assert.ok(layersOf().some((l) => l.id === 'lt_ice_outline'), 'outline layer emitted');
});

test('protected-area tint stays highly subordinate', () => {
  const park = parseColor(NORDIC_TOPO_PALETTE.park);
  // national_park + nature_reserve cover ~9–13% of the corridor (measured):
  // the tint must never read as vegetation.
  assert.ok(park.a <= 0.1, 'barely-there fill');
});

// ---- Layer order (terrain strata) -------------------------------------------
test('terrain strata order: fills → wetland wash → relief → water/roads', () => {
  const layers = layersOf(RELIEF);
  const ids = layers.map((l) => l.id);
  const at = (id) => {
    const i = ids.indexOf(id);
    assert.ok(i >= 0, `layer ${id} present`);
    return i;
  };
  // Wetland is an overlay wash ABOVE the vegetation base fills.
  for (const base of ['lt_wood', 'lt_grass', 'lt_scrub', 'lt_rock']) {
    assert.ok(at('lt_wetland') > at(base), `wetland wash above ${base}`);
  }
  assert.ok(at('lt_hillshade') > at('lt_wetland'), 'hillshade above the wetland wash');
  assert.ok(at('lt_hillshade') > at('lt_ice'), 'hillshade above glacier fills');
  assert.ok(at('lt_contour') > at('lt_hillshade'), 'contours above hillshade');
  assert.ok(at('lt_contour_index') > at('lt_hillshade'), 'index contours above hillshade');
  assert.ok(at('lt_water') > at('lt_contour_index'), 'water polygons above contours');
  assert.ok(at('lt_waterway_stream') > at('lt_contour_index'), 'water lines above contours');
  assert.ok(at('lt_trail') > at('lt_contour_index'), 'trails above contours');
});

// ---- Landcover / landuse filters --------------------------------------------
test('landuse terrain filters match the measured archive kinds', () => {
  const layers = layersOf();
  const filterOf = (id) => layers.find((l) => l.id === id).filter;
  assert.deepEqual(filterOf('lt_wood'), ['in', 'kind', 'wood', 'forest']);
  assert.deepEqual(filterOf('lt_grass'), ['in', 'kind', 'grass', 'grassland', 'meadow', 'village_green']);
  assert.deepEqual(filterOf('lt_scrub'), ['in', 'kind', 'scrub']);
  assert.deepEqual(filterOf('lt_wetland'), ['in', 'kind', 'wetland', 'bog', 'marsh', 'swamp']);
  assert.deepEqual(filterOf('lt_rock'), ['in', 'kind', 'bare_rock', 'scree']);
  assert.deepEqual(filterOf('lt_ice'), ['in', 'kind', 'glacier']);
  const landcover = layers.find((l) => l.id === 'lt_landcover');
  assert.equal(landcover['source-layer'], 'landcover');
  assert.equal(landcover.filter, undefined, 'low-zoom landcover styles every kind');
});

// ---- Contours: earlier-terrain iteration (0.17.0) ---------------------------
/** Evaluate a ['interpolate',['linear'],['zoom'],...] expression at a zoom. */
function evalLinearZoom(expr, zoom) {
  assert.deepEqual(expr.slice(0, 3), ['interpolate', ['linear'], ['zoom']], 'linear zoom ramp');
  const stops = expr.slice(3);
  const zs = [];
  const vs = [];
  for (let i = 0; i < stops.length; i += 2) {
    zs.push(stops[i]);
    vs.push(stops[i + 1]);
  }
  if (zoom <= zs[0]) return vs[0];
  if (zoom >= zs[zs.length - 1]) return vs[vs.length - 1];
  const i = zs.findIndex((z, k) => zoom >= z && zoom <= zs[k + 1]);
  const t = (zoom - zs[i]) / (zs[i + 1] - zs[i]);
  return vs[i] + t * (vs[i + 1] - vs[i]);
}

test('contour tiers: index fades in z9.5→11, the 20 m set z11.5→13, no pop-in', () => {
  const layers = layersOf(RELIEF);
  const index = layers.find((l) => l.id === 'lt_contour_index');
  const inter = layers.find((l) => l.id === 'lt_contour');

  assert.equal(index.minzoom, 9.5, 'index contours begin subtly around z9.5–10');
  assert.equal(inter.minzoom, 11.5, '20 m contours begin subtly around z11.5–12');
  assert.equal(index.filter[0], '==', 'index selects the 100 m modulus');
  assert.equal(inter.filter[0], '!=', 'intermediates are everything else');

  const iOp = (z) => evalLinearZoom(index.paint['line-opacity'], z);
  const mOp = (z) => evalLinearZoom(inter.paint['line-opacity'], z);
  // Both tiers start invisible at their minzoom — never a threshold pop.
  assert.equal(iOp(9.5), 0, 'index starts at opacity 0');
  assert.equal(mOp(11.5), 0, '20 m starts at opacity 0');
  // Subtle beginnings, clear endpoints.
  assert.ok(iOp(10) > 0.15 && iOp(10) < 0.5, 'index is a hint at z10');
  assert.ok(iOp(11) >= 0.85, 'index clearly legible by z11');
  assert.ok(mOp(12) > 0.15 && mOp(12) < 0.5, '20 m is a hint at z12');
  assert.ok(mOp(13) >= 0.8, '20 m fully useful by z13');
});

test('index contours stay heavier than intermediates at every shared zoom', () => {
  const layers = layersOf(RELIEF);
  const index = layers.find((l) => l.id === 'lt_contour_index');
  const inter = layers.find((l) => l.id === 'lt_contour');
  for (const z of [12, 13, 14, 16]) {
    const wi = evalLinearZoom(index.paint['line-width'], z);
    const wm = evalLinearZoom(inter.paint['line-width'], z);
    assert.ok(wi > wm, `index (${wi}) heavier than 20 m (${wm}) at z${z}`);
  }
  const ci = parseColor(NORDIC_TOPO_PALETTE.contourIndex);
  const cm = parseColor(NORDIC_TOPO_PALETTE.contour);
  assert.ok(ci.a > cm.a, 'index colour is also stronger, not width alone');
});

test('contours never overpower the route: muted colour, capped opacity', () => {
  const layers = layersOf(RELIEF);
  for (const id of ['lt_contour', 'lt_contour_index']) {
    const layer = layers.find((l) => l.id === id);
    const color = parseColor(
      id === 'lt_contour' ? NORDIC_TOPO_PALETTE.contour : NORDIC_TOPO_PALETTE.contourIndex,
    );
    assert.ok(color.a <= 0.7, `${id} colour stays translucent`);
    const op = layer.paint['line-opacity'];
    const maxOp = Math.max(...op.slice(3).filter((_, i) => i % 2 === 1));
    assert.ok(maxOp <= 0.9, `${id} opacity ramp stays below full`);
  }
});

// ---- Relief availability ----------------------------------------------------
test('without relief sources the builder emits no relief layers', () => {
  const ids = layersOf().map((l) => l.id);
  for (const rid of ['lt_hillshade', 'lt_contour', 'lt_contour_index']) {
    assert.ok(!ids.includes(rid), `no relief source → no ${rid}`);
  }
});

test('partial relief availability degrades layer-by-layer', () => {
  const onlyTerrain = layersOf({ terrainSourceId: 'terrain-dem' });
  assert.ok(onlyTerrain.some((l) => l.id === 'lt_hillshade'));
  assert.ok(!onlyTerrain.some((l) => l.id === 'lt_contour'));
  const onlyContours = layersOf({ contoursSourceId: 'contours' });
  assert.ok(!onlyContours.some((l) => l.id === 'lt_hillshade'));
  assert.ok(onlyContours.some((l) => l.id === 'lt_contour'));
});

test('relief layers bind to their own offline sources', () => {
  const layers = layersOf(RELIEF);
  const hillshade = layers.find((l) => l.id === 'lt_hillshade');
  assert.equal(hillshade.type, 'hillshade');
  assert.equal(hillshade.source, RELIEF.terrainSourceId);
  for (const cid of ['lt_contour', 'lt_contour_index']) {
    const contour = layers.find((l) => l.id === cid);
    assert.equal(contour.type, 'line');
    assert.equal(contour.source, RELIEF.contoursSourceId);
    assert.equal(contour['source-layer'], 'contours');
  }
});

// ---- Comparison phase retired -----------------------------------------------
const walkSources = (visit) => {
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === 'generated') continue;
        walk(p);
      } else if (/\.(ts|tsx|mjs|mts|js|json|css|html|yml)$/.test(name)) {
        visit(p, readFileSync(p, 'utf8'));
      }
    }
  };
  walk(join(root, 'src'));
  walk(join(root, '.github'));
  for (const f of ['package.json', 'index.html', 'vite.config.ts', '.env.example']) {
    visit(f, readFileSync(join(root, f), 'utf8'));
  }
};

test('no comparison/benchmark leftovers: flags, selector, Thunderforest, dead styles', () => {
  // The deploy workflow may still MENTION the retired names (it documents
  // that the variable/secret are no longer read), and comments may point at
  // docs/maps/thunderforest-outdoors-benchmark.md as historical rationale —
  // but no CODE identifier of the retired feature may survive under src/.
  const forbiddenInSrc = [
    /VITE_ENABLE_MAP_BENCHMARK/,
    /THUNDERFOREST_/,
    /thunderforest(?!-outdoors-benchmark\.md)[A-Za-z]*\(/i,
    /MAP_STYLE_OPTIONS/,
    /isBenchmarkEnabled/,
    /benchmarkEnabled/,
    /map-style-picker/,
    /mapStyleId/,
  ];
  const offenders = [];
  walkSources((path, content) => {
    if (!path.includes(`${join(root, 'src')}`)) return;
    for (const re of forbiddenInSrc) {
      if (re.test(content)) offenders.push(`${path}: ${re}`);
    }
  });
  assert.deepEqual(offenders, []);
  // The retired modules must be gone, not merely unreferenced.
  for (const gone of [
    'src/map/mapStyles.mjs',
    'src/map/mapStyles.d.mts',
    'src/map/benchmarkFlag.ts',
    'src/map/thunderforest.ts',
    'src/map/thunderforestLayer.mjs',
    'src/map/thunderforestLayer.d.mts',
  ]) {
    assert.throws(() => statSync(join(root, gone)), `${gone} must be deleted`);
  }
});

test('no online tile endpoints anywhere: gpx.studio, MapTiler, Thunderforest', () => {
  const forbidden = [
    /tiles\.gpx\.studio/i,
    /fonts\.gpx\.studio/i,
    /sprites\.gpx\.studio/i,
    /maptiler/i,
    /liberty-satellite/i,
    /api\.thunderforest\.com/i,
  ];
  const offenders = [];
  walkSources((path, content) => {
    for (const re of forbidden) {
      if (re.test(content)) offenders.push(`${path}: ${re}`);
    }
  });
  assert.deepEqual(offenders, []);
});

test('satellite layer contract is untouched by the retirement', () => {
  // The Terrain/Satellite control is NOT part of the retired comparison UI:
  // MapScreen keeps the imagery toggle and its availability/disabled state,
  // and mapStyle.ts keeps the hidden-until-toggled satellite raster layer.
  const mapStyle = readFileSync(join(root, 'src/map/mapStyle.ts'), 'utf8');
  assert.match(mapStyle, /SATELLITE_LAYER = 'satellite'/);
  assert.match(mapStyle, /visibility: 'none'/, 'satellite ships hidden until toggled');
  const screen = readFileSync(join(root, 'src/screens/MapScreen.tsx'), 'utf8');
  assert.match(screen, /aria-label="Basemap imagery"/, 'imagery toggle present');
  assert.match(screen, /setImagery\('satellite'\)/, 'satellite selectable');
  assert.match(screen, /disabled=\{!satelliteAvailable\}/, 'availability gate intact');
  const view = readFileSync(join(root, 'src/components/MapView.tsx'), 'utf8');
  assert.match(view, /imagery === 'satellite' \? 'visible' : 'none'/, 'toggle drives visibility');
});

test('Liberty licence attribution is registered in the central registry', () => {
  const attribution = readFileSync(join(root, 'src/data/attribution.ts'), 'utf8');
  assert.ok(attribution.includes('github.com/gpxstudio/styles'), 'links the style source repo');
  assert.ok(/Zsolt Ero/.test(attribution), 'credits the OpenFreeMap Styles copyright holder');
  assert.ok(/osm-liberty/.test(attribution), 'credits the OSM Liberty design lineage');
});
