import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startAttributionCompact } from '../src/map/initialAttribution.mjs';

test('attribution starts compact before its control is attached', () => {
  const attributes = new Set(['open']);
  const classes = new Set(['maplibregl-ctrl-attrib', 'maplibregl-compact', 'maplibregl-compact-show']);
  const element = {
    removeAttribute: (name) => attributes.delete(name),
    classList: { remove: (name) => classes.delete(name) },
  };
  assert.equal(startAttributionCompact(element), element);
  assert.equal(attributes.has('open'), false);
  assert.equal(classes.has('maplibregl-compact-show'), false);
  assert.equal(classes.has('maplibregl-compact'), true, 'the accessible compact toggle remains');
});

test('MapView disables the expanded default and collapses onAdd, not on load', () => {
  const source = readFileSync(new URL('../src/components/MapView.tsx', import.meta.url), 'utf8');
  assert.match(source, /class InitiallyCompactAttributionControl extends maplibregl\.AttributionControl/);
  assert.match(source, /startAttributionCompact\(super\.onAdd\(map\)\)/);
  assert.match(source, /attributionControl: false/);
  assert.match(source, /customAttribution: MAPLIBRE_ATTRIBUTION/);
  assert.match(source, /https:\/\/maplibre\.org\//, 'the control is non-empty before source metadata arrives');
  const loadHandler = source.slice(source.indexOf("map.on('load'"));
  assert.doesNotMatch(loadHandler, /maplibregl-compact-show|removeAttribute\('open'\)/);
});
