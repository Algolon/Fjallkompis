/**
 * The derived planned-day layer (src/plan/plannedDays.mjs) — the exact module
 * the store runs. Canonical stages are never modified: a planned day only
 * HOLDS them, so guides, highlights, detours and geometry stay stage-owned.
 *
 * Synthetic stages here carry the same shape the active itinerary produces
 * (see src/route/activeItinerary.ts ItineraryStage); the real Kungsleden data
 * is exercised through the itinerary transform in the direction tests below.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPlannedDays,
  currentPartIndex,
  currentPlannedDayOf,
} from '../src/plan/plannedDays.mjs';
import { defaultGroups } from '../src/plan/dayPlan.mjs';
import { buildDirectionalItinerary } from '../src/route/itinerary.mjs';
import { DEFAULT_DIRECTION, REVERSE_DIRECTION } from '../src/route/direction.mjs';

const FORWARD = DEFAULT_DIRECTION;
const REVERSE = REVERSE_DIRECTION;

// ---- Hydrate the packed route JSON (mirrors src/route/hydrate.ts) -----------

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(
  readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
);
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
    .map((p) => ({
      distanceKm: p.cumulativeDistanceKm,
      elevationM: p.elevation,
      lat: p.lat,
      lon: p.lon,
    }));

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

const route = hydrate();

/**
 * A synthetic itinerary stage. Elevation samples are two per stage (start and
 * end) so profile concatenation is easy to reason about.
 */
function stage(id, fromHutId, toHutId, opts = {}) {
  // `in` rather than ?? so an EXPLICIT null (missing elevation data) survives.
  const or = (key, fallback) => (key in opts ? opts[key] : fallback);
  const distanceKm = or('distanceKm', 10);
  return {
    id,
    day: or('day', 1),
    fromHutId,
    toHutId,
    distanceKm,
    estimatedHours: or('estimatedHours', 4),
    notes: '',
    totalAscentM: or('totalAscentM', 100),
    totalDescentM: or('totalDescentM', 50),
    minimumElevationM: or('minimumElevationM', 400),
    maximumElevationM: or('maximumElevationM', 900),
    points: [
      { lat: 68, lon: 18, elevation: 400, cumulativeDistanceKm: 0 },
      { lat: 68.1, lon: 18.1, elevation: 900, cumulativeDistanceKm: distanceKm },
    ],
    elevationProfile: [
      { distanceKm: 0, elevationM: 400, lat: 68, lon: 18 },
      { distanceKm, elevationM: 900, lat: 68.1, lon: 18.1 },
    ],
  };
}

/** Four adjacent stages: a → b → c → d → e. */
function fourStages() {
  return [
    stage('s1', 'a', 'b', { distanceKm: 15.2, estimatedHours: 4, totalAscentM: 310, totalDescentM: 180 }),
    stage('s2', 'b', 'c', { distanceKm: 21.4, estimatedHours: 6, totalAscentM: 420, totalDescentM: 250 }),
    stage('s3', 'c', 'd', { distanceKm: 13.1, estimatedHours: 4.5, totalAscentM: 380, totalDescentM: 120 }),
    stage('s4', 'd', 'e', { distanceKm: 12.3, estimatedHours: 4, totalAscentM: 60, totalDescentM: 420 }),
  ];
}

const plan = (groups, firstDate = '2026-09-03', direction = FORWARD) => ({
  direction,
  firstDate,
  groups,
});

// ---- No plan: the pre-feature behaviour, one code path ---------------------

test('with NO plan there is one planned day per canonical stage, undated', () => {
  const stages = fourStages();
  const days = buildPlannedDays(stages, null, 's1');
  assert.equal(days.length, 4);
  days.forEach((day, i) => {
    assert.equal(day.number, i + 1);
    assert.equal(day.index, i);
    assert.equal(day.date, null, 'no plan means no dates');
    assert.equal(day.stages.length, 1);
    assert.equal(day.stages[0].id, stages[i].id);
    assert.deepEqual(day.viaStopIds, []);
  });
});

test('an undated single-stage day mirrors its canonical stage exactly', () => {
  const stages = fourStages();
  const [day] = buildPlannedDays(stages, null, null);
  const s = stages[0];
  assert.equal(day.distanceKm, s.distanceKm);
  assert.equal(day.totalAscentM, s.totalAscentM);
  assert.equal(day.totalDescentM, s.totalDescentM);
  assert.equal(day.minimumElevationM, s.minimumElevationM);
  assert.equal(day.maximumElevationM, s.maximumElevationM);
  assert.equal(day.estimatedHours, s.estimatedHours);
  assert.equal(day.fromStopId, s.fromHutId);
  assert.equal(day.toStopId, s.toHutId);
  assert.equal(day.elevationProfile, s.elevationProfile, 'the stage profile is reused as-is');
});

test('an empty itinerary derives no days instead of throwing', () => {
  assert.deepEqual(buildPlannedDays([], plan([1]), 's1'), []);
  assert.deepEqual(buildPlannedDays(null, null, null), []);
});

// ---- Grouping --------------------------------------------------------------

test('a default plan dates one stage per day consecutively', () => {
  const days = buildPlannedDays(fourStages(), plan(defaultGroups(4)), null);
  assert.deepEqual(
    days.map((d) => d.date),
    ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'],
  );
});

test('two adjacent stages in one day: endpoints, via-stop and aggregates', () => {
  const days = buildPlannedDays(fourStages(), plan([1, 2, 1]), null);
  assert.equal(days.length, 3);
  const combined = days[1];
  assert.equal(combined.number, 2);
  assert.equal(combined.date, '2026-09-04');
  assert.equal(combined.stages.length, 2);
  assert.equal(combined.fromStopId, 'b', 'first stage start');
  assert.equal(combined.toStopId, 'd', 'last stage end');
  assert.deepEqual(combined.viaStopIds, ['c'], 'the internal boundary');
  assert.equal(Number(combined.distanceKm.toFixed(1)), 34.5); // 21.4 + 13.1
  assert.equal(combined.totalAscentM, 800); // 420 + 380
  assert.equal(combined.totalDescentM, 370); // 250 + 120
  assert.equal(combined.estimatedHours, 10.5); // 6 + 4.5
  // Days after the combined one shift a date earlier.
  assert.equal(days[2].date, '2026-09-05');
});

test('three adjacent stages in one day list every internal boundary', () => {
  const days = buildPlannedDays(fourStages(), plan([1, 3]), null);
  const big = days[1];
  assert.equal(big.stages.length, 3);
  assert.equal(big.fromStopId, 'b');
  assert.equal(big.toStopId, 'e');
  assert.deepEqual(big.viaStopIds, ['c', 'd']);
  assert.equal(Number(big.distanceKm.toFixed(1)), 46.8);
  assert.equal(big.estimatedHours, 14.5);
});

test('one day holding the whole route still reports both endpoints', () => {
  const [only] = buildPlannedDays(fourStages(), plan([4]), null);
  assert.equal(only.number, 1);
  assert.equal(only.fromStopId, 'a');
  assert.equal(only.toStopId, 'e');
  assert.deepEqual(only.viaStopIds, ['b', 'c', 'd']);
});

test('a grouping that does not partition the stages falls back to one per day', () => {
  // Only reachable transiently; the persisted value is repaired separately.
  const days = buildPlannedDays(fourStages(), plan([1, 1]), null);
  assert.equal(days.length, 4);
  assert.equal(days[0].date, '2026-09-03', 'the date anchor still applies');
});

// ---- Aggregation edge cases ------------------------------------------------

test('ascent and descent are null when ANY component value is missing', () => {
  const stages = [
    stage('s1', 'a', 'b', { totalAscentM: 300, totalDescentM: 100 }),
    stage('s2', 'b', 'c', { totalAscentM: null, totalDescentM: 200 }),
  ];
  const [day] = buildPlannedDays(stages, plan([2]), null);
  assert.equal(day.totalAscentM, null, 'a partial sum would understate the climb');
  assert.equal(day.totalDescentM, 300, 'descent is complete, so it sums');
});

test('elevation extremes take min and max, never a sum', () => {
  const stages = [
    stage('s1', 'a', 'b', { minimumElevationM: 380, maximumElevationM: 760 }),
    stage('s2', 'b', 'c', { minimumElevationM: 640, maximumElevationM: 1140 }),
  ];
  const [day] = buildPlannedDays(stages, plan([2]), null);
  assert.equal(day.minimumElevationM, 380);
  assert.equal(day.maximumElevationM, 1140);
});

test('elevation extremes ignore missing values but keep the present ones', () => {
  const stages = [
    stage('s1', 'a', 'b', { minimumElevationM: null, maximumElevationM: null }),
    stage('s2', 'b', 'c', { minimumElevationM: 500, maximumElevationM: 900 }),
  ];
  const [day] = buildPlannedDays(stages, plan([2]), null);
  assert.equal(day.minimumElevationM, 500);
  assert.equal(day.maximumElevationM, 900);
});

test('a day whose stages all lack elevation data reports null, not zero', () => {
  const stages = [
    stage('s1', 'a', 'b', { minimumElevationM: null, maximumElevationM: null, totalAscentM: null }),
    stage('s2', 'b', 'c', { minimumElevationM: null, maximumElevationM: null, totalAscentM: null }),
  ];
  const [day] = buildPlannedDays(stages, plan([2]), null);
  assert.equal(day.minimumElevationM, null);
  assert.equal(day.maximumElevationM, null);
  assert.equal(day.totalAscentM, null);
});

// ---- Elevation profile -----------------------------------------------------

test('a combined day concatenates the verified profiles with distance offsets', () => {
  const stages = fourStages();
  const [day] = buildPlannedDays(stages, plan([2, 1, 1]), null);
  assert.equal(day.elevationProfile.length, 4, 'both stage profiles, nothing resampled');
  assert.deepEqual(
    day.elevationProfile.map((p) => Number(p.distanceKm.toFixed(1))),
    [0, 15.2, 15.2, 36.6], // second stage offset by the first stage's length
  );
  // Elevations and coordinates are copied verbatim from the verified data.
  assert.deepEqual(
    day.elevationProfile.map((p) => p.elevationM),
    [400, 900, 400, 900],
  );
});

test('the concatenated profile distance is monotonically increasing', () => {
  const [day] = buildPlannedDays(fourStages(), plan([4]), null);
  for (let i = 1; i < day.elevationProfile.length; i++) {
    assert.ok(
      day.elevationProfile[i].distanceKm >= day.elevationProfile[i - 1].distanceKm,
      `sample ${i} does not go backwards`,
    );
  }
});

test('deriving days never mutates the canonical stages or their profiles', () => {
  const stages = fourStages();
  const snapshot = JSON.stringify(stages);
  const days = buildPlannedDays(stages, plan([2, 2]), 's1');
  days[0].elevationProfile[0].distanceKm = 999;
  assert.equal(
    JSON.stringify(stages),
    snapshot,
    'the source stages are untouched by a mutated derived profile',
  );
});

// ---- Current planned day ---------------------------------------------------

test('the current day is the one CONTAINING the current stage — first, middle or last', () => {
  const stages = fourStages();
  const groups = plan([1, 3]); // s1 | s2 s3 s4
  for (const [stageId, expectedDay, expectedPart] of [
    ['s1', 1, 0],
    ['s2', 2, 0],
    ['s3', 2, 1],
    ['s4', 2, 2],
  ]) {
    const days = buildPlannedDays(stages, groups, stageId);
    const current = currentPlannedDayOf(days);
    assert.equal(current.number, expectedDay, `stage ${stageId} resolves to day ${expectedDay}`);
    assert.equal(currentPartIndex(current, stageId), expectedPart, `part index for ${stageId}`);
    assert.equal(days.filter((d) => d.isCurrent).length, 1, 'exactly one current day');
  }
});

test('no current stage means no current day and no current part', () => {
  const days = buildPlannedDays(fourStages(), plan([2, 2]), null);
  assert.equal(currentPlannedDayOf(days), null);
  assert.ok(days.every((d) => !d.isCurrent));
  assert.equal(currentPartIndex(days[0], null), -1);
  assert.equal(currentPartIndex(null, 's1'), -1);
});

test('an unknown current stage id leaves every day non-current', () => {
  const days = buildPlannedDays(fourStages(), plan([2, 2]), 'ghost');
  assert.equal(currentPlannedDayOf(days), null);
});

// ---- Real route data, both directions --------------------------------------

test('the real forward route derives seven undated days with no plan', () => {
  const itinerary = buildDirectionalItinerary(route, FORWARD);
  const stages = itinerary.route.stages.map(toItineraryShape);
  const days = buildPlannedDays(stages, null, null);
  assert.equal(days.length, 7);
  assert.equal(days[0].stages[0].id, 'd1');
  assert.equal(days[6].stages[0].id, 'd7');
});

test('the reversed route maps planned day 1 to the LAST physical segment', () => {
  const itinerary = buildDirectionalItinerary(route, REVERSE);
  const stages = itinerary.route.stages.map(toItineraryShape);
  const days = buildPlannedDays(stages, plan(defaultGroups(7), '2026-09-03', REVERSE), 'd7');
  assert.equal(days.length, 7);
  assert.equal(days[0].stages[0].id, 'd7', 'walking south to north starts on d7');
  assert.equal(days[0].date, '2026-09-03');
  assert.equal(days[6].stages[0].id, 'd1');
  assert.equal(currentPlannedDayOf(days).number, 1);
});

test('combining on the reversed route aggregates the reversed pair correctly', () => {
  const itinerary = buildDirectionalItinerary(route, REVERSE);
  const stages = itinerary.route.stages.map(toItineraryShape);
  // Combine the first two walked segments (d7 + d6).
  const days = buildPlannedDays(stages, plan([2, 1, 1, 1, 1, 1], '2026-09-03', REVERSE), 'd6');
  assert.equal(days.length, 6);
  const first = days[0];
  assert.deepEqual(first.stages.map((s) => s.id), ['d7', 'd6']);
  assert.equal(first.fromStopId, stages[0].fromHutId);
  assert.equal(first.toStopId, stages[1].toHutId);
  assert.deepEqual(first.viaStopIds, [stages[0].toHutId]);
  assert.equal(
    Number(first.distanceKm.toFixed(3)),
    Number((stages[0].distanceKm + stages[1].distanceKm).toFixed(3)),
  );
  assert.equal(first.isCurrent, true, 'the current stage is the second part');
  assert.equal(currentPartIndex(first, 'd6'), 1);
});

test('every canonical stage appears exactly once across the derived days', () => {
  const itinerary = buildDirectionalItinerary(route, FORWARD);
  const stages = itinerary.route.stages.map(toItineraryShape);
  for (const groups of [[1, 1, 1, 1, 1, 1, 1], [2, 2, 3], [7], [1, 2, 1, 1, 1, 1]]) {
    const days = buildPlannedDays(stages, plan(groups), null);
    const ids = days.flatMap((d) => d.stages.map((s) => s.id));
    assert.deepEqual(ids, stages.map((s) => s.id), `groups ${JSON.stringify(groups)}`);
  }
});

test('derived day totals equal the whole-route totals for any grouping', () => {
  const itinerary = buildDirectionalItinerary(route, FORWARD);
  const stages = itinerary.route.stages.map(toItineraryShape);
  const routeKm = stages.reduce((sum, s) => sum + s.distanceKm, 0);
  for (const groups of [[1, 1, 1, 1, 1, 1, 1], [3, 4], [7]]) {
    const days = buildPlannedDays(stages, plan(groups), null);
    const total = days.reduce((sum, d) => sum + d.distanceKm, 0);
    assert.equal(
      Number(total.toFixed(6)),
      Number(routeKm.toFixed(6)),
      `grouping ${JSON.stringify(groups)} conserves route distance`,
    );
  }
});

/** Minimal ItineraryStage shape from a canonical RouteStage (see activeItinerary.ts). */
function toItineraryShape(s) {
  return {
    id: s.id,
    day: s.day,
    fromHutId: `from_${s.fromWaypointId}`,
    toHutId: `to_${s.toWaypointId}`,
    distanceKm: s.statistics.distanceKm,
    estimatedHours: 4,
    notes: '',
    totalAscentM: s.statistics.totalAscentM,
    totalDescentM: s.statistics.totalDescentM,
    minimumElevationM: s.statistics.minimumElevationM,
    maximumElevationM: s.statistics.maximumElevationM,
    points: s.points,
    elevationProfile: s.elevationProfile,
  };
}
