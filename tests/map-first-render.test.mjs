import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const view = read('src/components/MapView.tsx');
const screen = read('src/screens/MapScreen.tsx');
const css = read('src/styles/global.css');

/** The map 'load' handler body — sources/layers/markers + reveal wiring. */
const loadBlock = view.slice(view.indexOf("map.on('load'"), view.indexOf('resizeObs ='));

test('the canvas stays hidden until the first useful render', () => {
  assert.match(view, /const \[ready, setReady\] = useState\(false\)/);
  // Route sources/layers are installed BEFORE any reveal wiring exists.
  const layersAt = loadBlock.indexOf('for (const layer of routeLayers()) map.addLayer(layer)');
  assert.ok(layersAt >= 0, 'route layers are added in the load handler');
  assert.ok(loadBlock.indexOf('const reveal = ') > layersAt, 'reveal is defined after the layers');
  assert.match(view, /data-map-ready=\{ready \? 'true' : 'false'\}/);
  assert.match(view, /aria-hidden=\{!ready\}/);
  assert.match(css, /\.mapview \{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;/);
  assert.match(css, /\.mapview\.is-ready \{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/);
});

test('reveal requires the required sources, not the global idle', () => {
  // The reveal condition: basemap tiles for the current viewport (when a
  // basemap exists at all) plus the route GeoJSON sources — checked per
  // 'render' tick so the reveal lands on the frame that paints them.
  assert.match(loadBlock, /isSourceLoaded\(BASEMAP_SOURCE\)/);
  assert.match(loadBlock, /const routeRevealSources = \['overview', 'stages'\];/);
  assert.match(loadBlock, /routeRevealSources\.every\(\(id\) => map!\.isSourceLoaded\(id\)\)/);
  assert.match(loadBlock, /map\.on\('render', revealWhenUseful\)/);
  assert.match(loadBlock, /reveal\('required-sources-rendered'\)/);
  assert.match(loadBlock, /trace\('ready-first-useful-render'/);
  // The useful-render reveal does NOT sit inside the idle handler.
  const idleAt = loadBlock.indexOf("map.once('idle'");
  assert.ok(idleAt >= 0, 'idle is still observed');
  const renderRevealAt = loadBlock.indexOf("map.on('render', revealWhenUseful)");
  assert.ok(
    renderRevealAt >= 0 && renderRevealAt < idleAt,
    'the render-driven reveal path exists independently of (and before) idle',
  );
});

test('a missing basemap does not hold the reveal hostage', () => {
  // 'none' resolution → no basemap source in the style → the placeholder +
  // route layers are the honest presentation and reveal on their own merits.
  assert.match(
    loadBlock,
    /if \(map\.getSource\(BASEMAP_SOURCE\) && !map\.isSourceLoaded\(BASEMAP_SOURCE\)\)/,
  );
});

test("idle stays separately observable and backstops the reveal", () => {
  // 'idle' remains lifecycle evidence for "fully settled", and guarantees
  // readiness can never arrive LATER than the pre-change contract.
  const idleBlock = loadBlock.slice(loadBlock.indexOf("map.once('idle'"));
  assert.match(idleBlock, /trace\('idle-settled'\)/);
  assert.match(idleBlock, /reveal\('idle'\)/);
});

test('readiness is deterministic and contains no loading timeout', () => {
  const readyBlock = loadBlock.slice(loadBlock.indexOf('const requiredSourcesLoaded'));
  assert.ok(!/setTimeout|setInterval|delay|spinner/i.test(readyBlock));
});

test('cockpit controls remain accessible while only the incomplete map is hidden', () => {
  const map = screen.indexOf('<MapView');
  const controls = screen.indexOf('<MapControlStack');
  assert.ok(map >= 0 && controls > map, 'MapView and controls share the screen composition');
  const between = screen.slice(map, controls);
  assert.ok(!/ready\s*\?/.test(between), 'controls are not readiness-gated');
  assert.match(screen, /role="group" aria-label="Map controls"|<MapControlStack/);
});

test('attribution is compact before attachment and reduced motion removes the reveal transition', () => {
  assert.match(view, /startAttributionCompact\(super\.onAdd\(map\)\)/);
  assert.match(view, /attributionControl: false/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none !important;/);
});

test('the lifecycle trace distinguishes a cold open from a warmed one', () => {
  // archive-resolution-start records whether the packaged basemap's session
  // read was already warm — the evidence that separates a genuine cold
  // launch from a second Map open (or a completed deferred warm-up).
  assert.match(view, /bundledBasemapWarm: isBundledArchiveWarm\(archive\)/);
  assert.match(view, /trace\('route-content-ready'\)/);
});
