/**
 * Thunderforest Outdoors comparison layer — safety invariants.
 *
 * Guards the constraints in docs/maps/thunderforest-outdoors-benchmark.md:
 *  - ONLINE-ONLY: raster tiles straight from the Thunderforest Map Tiles
 *    API; never the default style, never part of offline downloads, never
 *    PMTiles, never proxied or redistributed;
 *  - key-gated: without an API key no source spec is ever produced, so no
 *    Thunderforest request can be made;
 *  - the key itself is injected at build time from the environment and must
 *    never appear as a literal anywhere in the repository — tracked files,
 *    example config, workflow, docs;
 *  - correct Thunderforest + OpenStreetMap attribution is registered in the
 *    central registry (src/data/attribution.ts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  THUNDERFOREST_STYLE_ID,
  THUNDERFOREST_SOURCE,
  THUNDERFOREST_LAYER,
  THUNDERFOREST_TILE_SIZE,
  THUNDERFOREST_MINZOOM,
  THUNDERFOREST_MAXZOOM,
  thunderforestTileUrl,
  thunderforestSource,
  thunderforestRasterLayer,
} from '../src/map/thunderforestLayer.mjs';
import { MAP_STYLE_OPTIONS, DEFAULT_MAP_STYLE_ID } from '../src/map/mapStyles.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ATTRIBUTION_HTML = 'Maps © Thunderforest, Data © OpenStreetMap contributors';

test('tile URL is the documented Map Tiles API template', () => {
  const url = thunderforestTileUrl('KEY_PLACEHOLDER');
  assert.equal(
    url,
    'https://api.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=KEY_PLACEHOLDER',
  );
  assert.ok(!url.includes('@2x'), 'no retina tiles during the prototype');
});

test('without a key no source spec exists — no request is possible', () => {
  assert.equal(thunderforestSource(null, ATTRIBUTION_HTML), null);
  assert.equal(thunderforestSource(undefined, ATTRIBUTION_HTML), null);
  assert.equal(thunderforestSource('', ATTRIBUTION_HTML), null);
  assert.equal(thunderforestSource('   ', ATTRIBUTION_HTML), null);
});

test('with a key the raster source is sane and attributed', () => {
  const src = thunderforestSource('KEY_PLACEHOLDER', ATTRIBUTION_HTML);
  assert.equal(src.type, 'raster');
  assert.equal(src.tileSize, 256);
  assert.equal(THUNDERFOREST_TILE_SIZE, 256);
  assert.deepEqual(src.tiles, [thunderforestTileUrl('KEY_PLACEHOLDER')]);
  assert.equal(src.attribution, ATTRIBUTION_HTML);
  // Compatible with the map's zoom range (minZoom 4, maxZoom 17 in MapView):
  // maxzoom 17 stops MapLibre requesting deeper tiles (over-zoom instead).
  assert.ok(THUNDERFOREST_MINZOOM <= 4, 'source minzoom covers the map minimum');
  assert.equal(src.minzoom, THUNDERFOREST_MINZOOM);
  assert.equal(src.maxzoom, THUNDERFOREST_MAXZOOM);
  assert.equal(THUNDERFOREST_MAXZOOM, 17);
});

test('the layer starts hidden and cannot collide with runtime layers', () => {
  const layer = thunderforestRasterLayer();
  assert.equal(layer.type, 'raster');
  assert.equal(layer.id, THUNDERFOREST_LAYER);
  assert.equal(layer.source, THUNDERFOREST_SOURCE);
  assert.equal(layer.layout.visibility, 'none', 'never visible before explicit selection');
  for (const reserved of [
    'placeholder-background',
    'satellite',
    'route-overview',
    'route-stages',
    'gps-dot',
  ]) {
    assert.notEqual(layer.id, reserved);
  }
});

test('registered as an online-only option, never the default', () => {
  const option = MAP_STYLE_OPTIONS.find((o) => o.id === THUNDERFOREST_STYLE_ID);
  assert.ok(option, 'registered in the style registry');
  assert.equal(option.kind, 'raster-online');
  assert.equal(option.requiresApiKey, true);
  assert.notEqual(DEFAULT_MAP_STYLE_ID, THUNDERFOREST_STYLE_ID);
});

test('attribution registry credits Thunderforest AND OpenStreetMap', () => {
  const attribution = readFileSync(join(root, 'src/data/attribution.ts'), 'utf8');
  assert.ok(attribution.includes("id: 'thunderforest-outdoors'"));
  assert.ok(/Maps © .*Thunderforest/.test(attribution));
  assert.ok(/Data © .*OpenStreetMap.*contributors/.test(attribution));
});

test('no offline/PMTiles/service-worker wiring touches Thunderforest', () => {
  // The offline-download manager and the PMTiles protocol must stay
  // Thunderforest-free: the layer is online-only by design.
  for (const f of ['src/map/offlineMap.ts', 'src/map/pmtilesProtocol.ts', 'vite.config.ts']) {
    const content = readFileSync(join(root, f), 'utf8');
    assert.ok(!/thunderforest/i.test(content), `${f} must not reference Thunderforest`);
  }
});

test('no literal API key anywhere in tracked files', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx|mjs|mts|js|json|css|html|md|yml|yaml|example)$/.test(f));
  const offenders = [];
  for (const f of tracked) {
    const content = readFileSync(join(root, f), 'utf8');
    // The env var may only ever be REFERENCED (or set to empty in the
    // example) — an assignment with a value would be a committed key.
    // Value ends at a backtick or line end, so inline-code mentions in docs
    // (`VITE_THUNDERFOREST_API_KEY=<your key>` …) are captured precisely.
    const assignment = content.match(/VITE_THUNDERFOREST_API_KEY\s*=([^`\n]*)/);
    if (assignment) {
      const value = assignment[1].trim();
      const allowedValue =
        value === '' || // empty placeholder (.env.example)
        /^\$\{\{/.test(value) || // GitHub Actions secret expression
        /^<[^>]*>$/.test(value); // documentation placeholder like <your key>
      if (!allowedValue) {
        offenders.push(`${f}: VITE_THUNDERFOREST_API_KEY has a literal value`);
      }
    }
    // A concrete query value for the key parameter (anything but the runtime
    // template interpolation or a documentation placeholder) must never be
    // committed. The pattern is assembled at runtime so this tracked test
    // file cannot match its own source.
    const queryValue = new RegExp('api' + 'key=([^\\s"\'`&)\\]}<]+)', 'gi');
    for (const m of content.matchAll(queryValue)) {
      const value = m[1];
      const allowed =
        value.startsWith('${') || // template interpolation in the builder
        /^<[^>]*>$/.test(value) || // docs placeholder like <key>
        value === '…' || // docs ellipsis placeholder
        value === 'KEY_PLACEHOLDER'; // this test file's fixtures
      if (!allowed) offenders.push(`${f}: literal apikey value "${value}"`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('.env.example ships an EMPTY placeholder and real env files are ignored', () => {
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  const line = example.split('\n').find((l) => l.startsWith('VITE_THUNDERFOREST_API_KEY'));
  assert.equal(line, 'VITE_THUNDERFOREST_API_KEY=', 'placeholder must stay empty');

  const benchmarkLine = example
    .split('\n')
    .find((l) => l.startsWith('VITE_ENABLE_MAP_BENCHMARK'));
  assert.equal(benchmarkLine, 'VITE_ENABLE_MAP_BENCHMARK=', 'flag placeholder must stay empty');

  const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
  assert.ok(gitignore.includes('.env'), '.env is git-ignored');
  assert.ok(gitignore.includes('*.local'), '.env.local is git-ignored');
  assert.ok(gitignore.includes('!.env.example'), 'the template stays tracked');
});

test('deploy workflow injects the key from a secret and the flag from a variable', () => {
  const workflow = readFileSync(join(root, '.github/workflows/deploy.yml'), 'utf8');
  assert.ok(
    workflow.includes('VITE_THUNDERFOREST_API_KEY: ${{ secrets.VITE_THUNDERFOREST_API_KEY }}'),
    'build step reads the repository secret',
  );
  assert.ok(
    workflow.includes('VITE_ENABLE_MAP_BENCHMARK: ${{ vars.VITE_ENABLE_MAP_BENCHMARK }}'),
    'build step reads the non-sensitive repository variable (not a secret)',
  );
});
