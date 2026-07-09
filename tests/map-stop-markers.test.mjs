/**
 * Map hut markers & anchored stop preview — pure logic fences.
 *
 * Guards the contract the Map popup relies on:
 *  1. every waypoint rendered on the map resolves to a real Huts & Stations
 *     stop (so every marker can offer "open details" and the old below-map
 *     waypoint panel could be removed without stranding any waypoint);
 *  2. the marker/popup labels and the accessible facility summary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WAYPOINT_TO_HUT,
  HUT_TO_WAYPOINT,
  stopIdForWaypoint,
} from '../src/route/waypointStops.mjs';
import {
  isEndpointWaypoint,
  markerLabel,
  markerAriaLabel,
  popupActionLabel,
  facilitySummary,
} from '../src/map/stopMarkers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const generated = JSON.parse(
  readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
);

test('every rendered waypoint maps to a stop (popup contract)', () => {
  assert.ok(generated.waypoints.length > 0, 'generated route has waypoints');
  for (const w of generated.waypoints) {
    assert.equal(
      typeof stopIdForWaypoint(w.id),
      'string',
      `waypoint ${w.id} has no stop mapping — its marker could not offer ` +
        'the Huts & Stations action and the removed below-map panel would ' +
        'be its only surface',
    );
  }
});

test('waypoint↔stop mapping is one-to-one and covers no phantom waypoints', () => {
  const waypointIds = new Set(generated.waypoints.map((w) => w.id));
  const stopIds = Object.values(WAYPOINT_TO_HUT);
  assert.equal(new Set(stopIds).size, stopIds.length, 'stop ids are unique');
  for (const wId of Object.keys(WAYPOINT_TO_HUT)) {
    assert.ok(waypointIds.has(wId), `mapping references unknown waypoint ${wId}`);
  }
  // Round trip both ways.
  for (const [w, h] of Object.entries(WAYPOINT_TO_HUT)) {
    assert.equal(HUT_TO_WAYPOINT[h], w);
  }
});

test('unmapped waypoint ids resolve to null, never a bogus stop', () => {
  assert.equal(stopIdForWaypoint('HUT_DOES_NOT_EXIST'), null);
});

test('endpoint detection accents exactly the route start and end', () => {
  const ends = generated.waypoints.filter((w) => isEndpointWaypoint(w.id));
  assert.deepEqual(
    ends.map((w) => w.id).sort(),
    ['END_NIKKALUOKTA', 'START_ABISKO'],
  );
});

test('marker labels strip the organisation prefix, never HTML-encode', () => {
  assert.equal(markerLabel('STF Abiskojaure'), 'Abiskojaure');
  assert.equal(markerLabel('Nikkaluokta'), 'Nikkaluokta');
  // Names are applied via textContent — the helper must not entity-encode.
  assert.equal(markerLabel('A & B <hut>'), 'A & B <hut>');
});

test('marker accessible names identify the stop and the preview action', () => {
  assert.equal(
    markerAriaLabel('STF Abiskojaure'),
    'Open preview for Abiskojaure',
  );
  for (const w of generated.waypoints) {
    const label = markerAriaLabel(w.name);
    assert.ok(label.startsWith('Open preview for '), label);
    assert.ok(label.includes(markerLabel(w.name)), label);
  }
});

test('popup action label names the destination', () => {
  assert.equal(
    popupActionLabel('Abiskojaure'),
    'Open Abiskojaure details in Huts & Stations',
  );
});

test('facility summary reads as one concise sentence', () => {
  assert.equal(
    facilitySummary(['Shop', 'Sauna', 'Guest kitchen'], ['No shop']),
    'Facilities: Shop, Sauna and Guest kitchen. No shop.',
  );
  assert.equal(facilitySummary(['Sauna'], []), 'Facilities: Sauna.');
  assert.equal(facilitySummary([], ['No shop']), 'No shop.');
  assert.equal(facilitySummary([], []), '');
});
