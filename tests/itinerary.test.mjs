/**
 * Pure directional-itinerary transform (src/route/itinerary.mjs).
 *
 * Runs the transform against the REAL committed route dataset (hydrated the
 * same way the app does) so both directions are validated end to end: stable
 * physical ids, itinerary-day derivation, reversed geometry with correctly
 * rebuilt cumulative distances, swapped ascent/descent, and untouched canonical
 * inputs.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDirectionalItinerary } from '../src/route/itinerary.mjs';
import { WAYPOINT_TO_HUT } from '../src/route/waypointStops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(
  readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
);

const FORWARD = 'abisko-to-nikkaluokta';
const REVERSE = 'nikkaluokta-to-abisko';

// ---- Hydrate the packed JSON into a ParsedRoute (mirrors src/route/hydrate) --

const unpack = (pts) =>
  pts.map(([lat, lon, elevation, cumulativeDistanceKm]) => ({
    lat,
    lon,
    elevation,
    cumulativeDistanceKm,
  }));
const toLineString = (points, properties) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) },
});
const toProfile = (points) =>
  points
    .filter((p) => p.elevation != null)
    .map((p) => ({ distanceKm: p.cumulativeDistanceKm, elevationM: p.elevation, lat: p.lat, lon: p.lon }));

function hydrate() {
  const overviewPoints = unpack(raw.overview.points);
  return {
    name: raw.name,
    overviewPoints,
    overviewGeoJson: toLineString(overviewPoints, { role: 'overview' }),
    stages: raw.stages.map((g) => {
      const points = unpack(g.points);
      return {
        id: g.id,
        day: g.day,
        fromWaypointId: g.fromWaypointId,
        toWaypointId: g.toWaypointId,
        points,
        geoJson: toLineString(points, { stageId: g.id, day: g.day }),
        bounds: g.bounds,
        statistics: g.statistics,
        elevationProfile: toProfile(points),
      };
    }),
    waypoints: raw.waypoints,
    bounds: raw.bounds,
    statistics: raw.statistics,
    userBounds: raw.userBounds,
    mapCutoutBounds: raw.mapCutoutBounds,
  };
}

const canonical = hydrate();
const fwd = buildDirectionalItinerary(canonical, FORWARD);
const rev = buildDirectionalItinerary(canonical, REVERSE);

const STOPS_ORDER = [
  'abisko',
  'abiskojaure',
  'alesjaure',
  'tjaktja',
  'salka',
  'singi',
  'kebnekaise',
  'nikkaluokta',
];

// ---- Structure: stages, stops, ids, days ------------------------------------

test('both directions expose seven stages and eight ordered stops', () => {
  for (const it of [fwd, rev]) {
    assert.equal(it.route.stages.length, 7);
    assert.equal(it.stopOrder.length, 8);
  }
});

test('physical segment ids are stable across directions', () => {
  const ids = (it) => new Set(it.route.stages.map((s) => s.id));
  assert.deepEqual([...ids(fwd)].sort(), ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);
  assert.deepEqual([...ids(fwd)].sort(), [...ids(rev)].sort());
});

test('itinerary days are 1..7 in walking order for both directions', () => {
  assert.deepEqual(fwd.route.stages.map((s) => s.day), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(rev.route.stages.map((s) => s.day), [1, 2, 3, 4, 5, 6, 7]);
});

test('forward keeps d1..d7; reverse walks d7..d1 with re-derived days', () => {
  assert.deepEqual(fwd.route.stages.map((s) => s.id), ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);
  assert.deepEqual(rev.route.stages.map((s) => s.id), ['d7', 'd6', 'd5', 'd4', 'd3', 'd2', 'd1']);
  // d7 becomes reverse Day 1; d1 becomes reverse Day 7.
  assert.equal(rev.route.stages.find((s) => s.id === 'd7').day, 1);
  assert.equal(rev.route.stages.find((s) => s.id === 'd1').day, 7);
});

test('stop order reverses; start/end stops flip', () => {
  assert.deepEqual(fwd.stopOrder, STOPS_ORDER);
  assert.deepEqual(rev.stopOrder, [...STOPS_ORDER].reverse());
  assert.equal(fwd.startStopId, 'abisko');
  assert.equal(fwd.endStopId, 'nikkaluokta');
  assert.equal(rev.startStopId, 'nikkaluokta');
  assert.equal(rev.endStopId, 'abisko');
});

test('reverse swaps every stage from/to endpoint', () => {
  for (const revStage of rev.route.stages) {
    const canon = canonical.stages.find((s) => s.id === revStage.id);
    assert.equal(revStage.fromWaypointId, canon.toWaypointId, `${revStage.id} from`);
    assert.equal(revStage.toWaypointId, canon.fromWaypointId, `${revStage.id} to`);
    assert.equal(WAYPOINT_TO_HUT[revStage.fromWaypointId] != null, true);
  }
});

// ---- Immutability -----------------------------------------------------------

test('the canonical route is never mutated', () => {
  const before = JSON.stringify(canonical);
  buildDirectionalItinerary(canonical, REVERSE);
  buildDirectionalItinerary(canonical, FORWARD);
  assert.equal(JSON.stringify(canonical), before);
  // Forward returns the canonical objects by identity (nothing allocated).
  assert.equal(fwd.route.stages[0], canonical.stages[0]);
});

// ---- Reversed geometry: cumulative distance ---------------------------------

test('reversed stage cumulative distance starts at 0, is monotonic, ends at stage length', () => {
  for (const stage of rev.route.stages) {
    const pts = stage.points;
    assert.ok(Math.abs(pts[0].cumulativeDistanceKm) < 1e-9, `${stage.id} starts at 0`);
    for (let i = 1; i < pts.length; i++) {
      assert.ok(
        pts[i].cumulativeDistanceKm >= pts[i - 1].cumulativeDistanceKm - 1e-9,
        `${stage.id} cumulative is monotonic`,
      );
    }
    const last = pts[pts.length - 1].cumulativeDistanceKm;
    assert.ok(
      Math.abs(last - stage.statistics.distanceKm) < 0.05,
      `${stage.id} ends at its distance (${last} vs ${stage.statistics.distanceKm})`,
    );
  }
});

test('reversed points preserve lat/lon/elevation (mirrored order)', () => {
  const canon = canonical.stages.find((s) => s.id === 'd4');
  const revStage = rev.route.stages.find((s) => s.id === 'd4');
  const n = canon.points.length;
  assert.equal(revStage.points.length, n);
  for (let i = 0; i < n; i++) {
    const a = canon.points[n - 1 - i];
    const b = revStage.points[i];
    assert.equal(b.lat, a.lat);
    assert.equal(b.lon, a.lon);
    assert.equal(b.elevation, a.elevation);
  }
});

test('reversed overview runs Nikkaluokta → Abisko, cumulative 0 → total', () => {
  const first = rev.route.overviewPoints[0];
  const last = rev.route.overviewPoints[rev.route.overviewPoints.length - 1];
  assert.ok(Math.abs(first.cumulativeDistanceKm) < 1e-9, 'starts at 0');
  const total = raw.overview.points[raw.overview.points.length - 1][3];
  assert.ok(Math.abs(last.cumulativeDistanceKm - total) < 1e-6, 'ends at full route distance');
  // First reversed overview point is the canonical last point (Nikkaluokta end).
  const canonLast = raw.overview.points[raw.overview.points.length - 1];
  assert.equal(first.lat, canonLast[0]);
  assert.equal(first.lon, canonLast[1]);
});

// ---- Statistics: swap ascent/descent, keep distance and extremes ------------

test('reverse swaps ascent/descent but keeps distance and elevation extremes', () => {
  for (const stage of rev.route.stages) {
    const canon = canonical.stages.find((s) => s.id === stage.id);
    assert.equal(stage.statistics.totalAscentM, canon.statistics.totalDescentM, `${stage.id} ascent`);
    assert.equal(stage.statistics.totalDescentM, canon.statistics.totalAscentM, `${stage.id} descent`);
    assert.equal(stage.statistics.distanceKm, canon.statistics.distanceKm, `${stage.id} distance`);
    assert.equal(stage.statistics.minimumElevationM, canon.statistics.minimumElevationM, `${stage.id} min`);
    assert.equal(stage.statistics.maximumElevationM, canon.statistics.maximumElevationM, `${stage.id} max`);
  }
  // Full route too.
  assert.equal(rev.route.statistics.totalAscentM, canonical.statistics.totalDescentM);
  assert.equal(rev.route.statistics.totalDescentM, canonical.statistics.totalAscentM);
  assert.equal(rev.route.statistics.distanceKm, canonical.statistics.distanceKm);
  assert.equal(rev.route.statistics.minimumElevationM, canonical.statistics.minimumElevationM);
  assert.equal(rev.route.statistics.maximumElevationM, canonical.statistics.maximumElevationM);
});

// ---- Elevation profile ------------------------------------------------------

test('reversed elevation profiles begin at 0 and end at the correct distance', () => {
  const stage = rev.route.stages.find((s) => s.id === 'd4');
  const p = stage.elevationProfile;
  assert.ok(p.length >= 2);
  assert.ok(Math.abs(p[0].distanceKm) < 1e-9, 'profile starts at 0');
  assert.ok(
    Math.abs(p[p.length - 1].distanceKm - stage.statistics.distanceKm) < 0.05,
    'profile ends at stage distance',
  );
  // Reversed full-route profile begins at 0 too.
  assert.ok(Math.abs(rev.overviewElevationProfile[0].distanceKm) < 1e-9);
});

// ---- Stop distance from the selected start ----------------------------------

test('stop distances measure from the selected start and reach the full length', () => {
  const total = canonical.statistics.distanceKm;
  assert.equal(fwd.stopDistanceKm.abisko, 0);
  assert.ok(Math.abs(fwd.stopDistanceKm.nikkaluokta - total) < 0.2, 'forward end ≈ total');
  assert.equal(rev.stopDistanceKm.nikkaluokta, 0);
  assert.ok(Math.abs(rev.stopDistanceKm.abisko - total) < 0.2, 'reverse end ≈ total');
  // A middle stop's distance-from-start is (near) the complement between directions.
  assert.ok(
    Math.abs(fwd.stopDistanceKm.salka + rev.stopDistanceKm.salka - total) < 0.3,
    'forward + reverse distance-to-Sälka ≈ total',
  );
});

// ---- Involution: reversing twice returns the canonical geometry -------------

test('reversing twice reproduces the canonical (forward) itinerary', () => {
  const back = buildDirectionalItinerary(rev.route, REVERSE);
  assert.deepEqual(back.route.stages.map((s) => s.id), fwd.route.stages.map((s) => s.id));
  assert.deepEqual(back.route.stages.map((s) => s.day), fwd.route.stages.map((s) => s.day));
  assert.deepEqual(back.stopOrder, fwd.stopOrder);
  for (const stage of back.route.stages) {
    const canon = canonical.stages.find((s) => s.id === stage.id);
    // Endpoints and distances match the canonical again.
    assert.equal(stage.fromWaypointId, canon.fromWaypointId, `${stage.id} from restored`);
    assert.equal(stage.toWaypointId, canon.toWaypointId, `${stage.id} to restored`);
    const last = stage.points[stage.points.length - 1].cumulativeDistanceKm;
    assert.ok(Math.abs(last - canon.points[canon.points.length - 1].cumulativeDistanceKm) < 1e-6);
    assert.equal(stage.points[0].lat, canon.points[0].lat, `${stage.id} first point restored`);
  }
});

// ---- GeoJSON is rebuilt from the reversed point order -----------------------

test('reversed stage GeoJSON follows the reversed point order and carries itinerary day', () => {
  const stage = rev.route.stages.find((s) => s.id === 'd7'); // reverse Day 1
  const coords = stage.geoJson.geometry.coordinates;
  assert.equal(coords.length, stage.points.length);
  assert.deepEqual(coords[0], [stage.points[0].lon, stage.points[0].lat]);
  assert.equal(stage.geoJson.properties.day, 1, 'GeoJSON day is the itinerary day');
  assert.equal(stage.geoJson.properties.stageId, 'd7', 'GeoJSON keeps the stable id');
});
