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

test('the canvas is hidden until the first post-load idle frame', () => {
  assert.match(view, /const \[ready, setReady\] = useState\(false\)/);
  const load = view.slice(view.indexOf("map.on('load'"), view.indexOf('resizeObs ='));
  assert.ok(load.indexOf('for (const layer of routeLayers()) map.addLayer(layer)') >= 0);
  assert.ok(load.indexOf("map.once('idle'") > load.indexOf('routeLayers()'));
  assert.ok(load.indexOf('setReady(true)') > load.indexOf("map.once('idle'"));
  assert.match(view, /data-map-ready=\{ready \? 'true' : 'false'\}/);
  assert.match(css, /\.mapview \{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;/);
  assert.match(css, /\.mapview\.is-ready \{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/);
});

test('readiness is deterministic and contains no loading timeout', () => {
  const readyBlock = view.slice(view.indexOf("map.once('idle'"), view.indexOf('resizeObs ='));
  assert.ok(!/setTimeout|setInterval|delay|spinner/i.test(readyBlock));
  assert.match(readyBlock, /trace\('ready-idle'\)/);
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
