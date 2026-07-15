/**
 * Guards the "View on map" detour rendering (src/map/focusFeatures.mjs) and the
 * Day-1 owner geometry mapping. The map layers filter by geometry type, but the
 * FIRST guarantee is here: the source emits ONE LineString for the whole track
 * plus only start/destination Points — never a dot per intermediate trackpoint
 * (the breadcrumb bug), and never a duplicate finish marker for an out-and-back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFocusFeatures } from '../src/map/focusFeatures.mjs';

const lineStrings = (fc) => fc.features.filter((f) => f.geometry.type === 'LineString');
const points = (fc) => fc.features.filter((f) => f.geometry.type === 'Point');

const track = [
  { lat: 68.0, lng: 18.0 },
  { lat: 68.1, lng: 18.1 },
  { lat: 68.2, lng: 18.2 },
  { lat: 68.3, lng: 18.3 },
];
const start = { lat: 68.0, lng: 18.0 };
const destination = { lat: 68.3, lng: 18.3 };

test('a detour emits ONE LineString for the whole track', () => {
  const fc = buildFocusFeatures({ track, start, destination });
  const lines = lineStrings(fc);
  assert.equal(lines.length, 1);
  // Every track vertex is in the line (as a line, not as points).
  assert.deepEqual(
    lines[0].geometry.coordinates,
    track.map((t) => [t.lng, t.lat]),
  );
});

test('only start + destination become Points (no intermediate dots)', () => {
  const fc = buildFocusFeatures({ track, start, destination });
  const pts = points(fc);
  assert.equal(pts.length, 2, 'exactly two endpoint markers');
  assert.deepEqual(
    pts.map((p) => p.properties.role),
    ['start', 'destination'],
  );
  // No Point sits on an intermediate trackpoint.
  const intermediates = track.slice(1, -1).map((t) => [t.lng, t.lat]);
  for (const p of pts) {
    assert.ok(
      !intermediates.some((c) => c[0] === p.geometry.coordinates[0] && c[1] === p.geometry.coordinates[1]),
    );
  }
  // A longer track still yields exactly two point markers.
  const long = Array.from({ length: 30 }, (_, i) => ({ lat: 68 + i / 100, lng: 18 + i / 100 }));
  assert.equal(points(buildFocusFeatures({ track: long, start, destination })).length, 2);
});

test('out-and-back (rejoin == start) does not duplicate a finish marker', () => {
  // destination equal to start → only the start marker, no second point.
  const fc = buildFocusFeatures({ track, start, destination: { ...start } });
  const pts = points(fc);
  assert.equal(pts.length, 1);
  assert.equal(pts[0].properties.role, 'start');
});

test('a missing destination yields just the start marker', () => {
  const pts = points(buildFocusFeatures({ track, start, destination: null }));
  assert.equal(pts.length, 1);
  assert.equal(pts[0].properties.role, 'start');
});

// ── Day-1 owner geometry mapping ─────────────────────────────────────────────

test('Day-1 experiences map to the correct waypoints and tracks', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const geo = JSON.parse(
    readFileSync(join(root, 'src/generated/experience-geometry.json'), 'utf8'),
  );

  const canyon = geo['abiskojakka-canyon'];
  assert.ok(canyon, 'canyon geometry present');
  assert.ok(canyon.waypoints.entry && canyon.waypoints.viewpoint);
  assert.ok(Array.isArray(canyon.track) && canyon.track.length >= 2);

  const lake = geo['lake-njakajaure-lapporten'];
  assert.ok(lake, 'lake geometry present under the CANONICAL id (alias applied)');
  assert.ok(lake.waypoints.entry && lake.waypoints.primary);
  assert.ok(Array.isArray(lake.track) && lake.track.length >= 2);

  // The legacy "-sightline" id must NOT leak through as its own record.
  assert.equal(geo['lake-njakajaure-lapporten-sightline'], undefined);
});
