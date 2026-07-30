/**
 * Day plan — the derived layer (src/plan/plannedDays.mjs), the exact module
 * the store runs. Canonical stages are never modified: a planned day only
 * HOLDS them, so guides, highlights, detours and geometry stay stage-owned.
 *
 * The 3–11 September journey is the primary fixture: travel in, hiking days
 * including one with two adjacent stages, a rest day, a mixed hiking+travel
 * day ending in a Trip Stay, and a travel-home day with no overnight.
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
  hikingEndpointOptions,
  plannedDayForStage,
} from '../src/plan/plannedDays.mjs';
import { defaultDays } from '../src/plan/dayPlan.mjs';
import { buildDirectionalItinerary } from '../src/route/itinerary.mjs';
import { WAYPOINT_TO_HUT } from '../src/route/waypointStops.mjs';
import { DEFAULT_DIRECTION, REVERSE_DIRECTION } from '../src/route/direction.mjs';

const FORWARD = DEFAULT_DIRECTION;
const REVERSE = REVERSE_DIRECTION;

// ---- Real route data --------------------------------------------------------

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'));
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

const canonical = {
  name: raw.name,
  overviewPoints: unpack(raw.overview.points),
  overviewGeoJson: toLineString(unpack(raw.overview.points), { role: 'overview' }),
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

/** The itinerary stages the store passes in (mirrors activeItinerary.ts). */
function stagesFor(direction) {
  return buildDirectionalItinerary(canonical, direction).route.stages.map((s) => ({
    id: s.id,
    day: s.day,
    fromHutId: WAYPOINT_TO_HUT[s.fromWaypointId],
    toHutId: WAYPOINT_TO_HUT[s.toWaypointId],
    distanceKm: s.statistics.distanceKm,
    estimatedHours: 4,
    notes: '',
    totalAscentM: s.statistics.totalAscentM,
    totalDescentM: s.statistics.totalDescentM,
    minimumElevationM: s.statistics.minimumElevationM,
    maximumElevationM: s.statistics.maximumElevationM,
    points: s.points,
    elevationProfile: s.elevationProfile,
  }));
}

const forwardStages = stagesFor(FORWARD);
const STAGES = forwardStages.length;

let seq = 0;
const day = (activities, overnight) => ({
  id: `day_fixture_${(seq += 1)}`,
  activities,
  ...(overnight ? { overnight } : {}),
});
const hiking = (stages = 1) => ({ kind: 'hiking', stages });
const travel = () => ({ kind: 'travel' });
const rest = () => ({ kind: 'rest' });
const plan = (days, extra = {}) => ({
  direction: FORWARD,
  startDate: '2026-09-03',
  currentDayId: null,
  days,
  ...extra,
});

/** The concrete 3–11 September journey. */
function journey() {
  return [
    day([travel()], { kind: 'stop', stopId: 'abisko' }), // 3 Sep
    day([hiking(1)]), // 4 Sep  Abisko → Abiskojaure
    day([hiking(1)]), // 5 Sep  → Alesjaure
    day([hiking(2)]), // 6 Sep  → Sälka via Tjäktja
    day([hiking(1)]), // 7 Sep  → Singi
    day([hiking(1)]), // 8 Sep  → Kebnekaise
    day([rest()]), // 9 Sep  based at Kebnekaise
    day([hiking(1), travel()], { kind: 'stay', tripItemId: 'trip_kiruna' }), // 10 Sep
    day([travel()], { kind: 'none' }), // 11 Sep
  ];
}

const TRIP_ITEMS = [
  {
    id: 'trip_out',
    kind: 'transport',
    title: 'Flight to Kiruna',
    status: 'confirmed',
    mode: 'flight',
    from: 'Amsterdam',
    to: 'Kiruna',
    date: '2026-09-03',
    departureTime: '07:15',
    attachmentIds: ['doc_ticket'],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'trip_bus',
    kind: 'transport',
    title: 'Bus to Abisko',
    status: 'confirmed',
    mode: 'bus',
    from: 'Kiruna',
    to: 'Abisko',
    date: '2026-09-03',
    departureTime: '13:40',
    attachmentIds: [],
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'trip_kiruna_bus',
    kind: 'transport',
    title: 'Bus Nikkaluokta → Kiruna',
    status: 'planned',
    mode: 'bus',
    from: 'Nikkaluokta',
    to: 'Kiruna',
    date: '2026-09-10',
    departureTime: '16:30',
    attachmentIds: [],
    createdAt: 3,
    updatedAt: 3,
  },
  {
    id: 'trip_kiruna',
    kind: 'stay',
    title: 'STF Kiruna',
    status: 'confirmed',
    stayType: 'hotel-hostel',
    location: 'Kiruna',
    checkInDate: '2026-09-10',
    attachmentIds: [],
    createdAt: 4,
    updatedAt: 4,
  },
];

// ---- The default state: no plan means NO days -------------------------------

test('with NO plan there are no planned days at all', () => {
  assert.deepEqual(buildPlannedDays(forwardStages, null, TRIP_ITEMS), []);
  assert.deepEqual(buildPlannedDays(forwardStages, undefined), []);
  assert.equal(currentPlannedDayOf([]), null);
});

test('nothing infers a plan from trip items, stays or documents', () => {
  // A rich trip plan produces exactly nothing without a Day plan.
  assert.deepEqual(buildPlannedDays(forwardStages, null, TRIP_ITEMS), []);
});

test('a plan whose hiking counts do not cover the route derives nothing', () => {
  assert.deepEqual(buildPlannedDays(forwardStages, plan([day([hiking(3)])]), []), []);
  assert.deepEqual(buildPlannedDays([], plan(defaultDays(STAGES)), []), []);
});

// ---- The concrete journey ---------------------------------------------------

test('the 3–11 September journey derives nine consecutive dated days', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  assert.equal(days.length, 9);
  assert.deepEqual(
    days.map((d) => d.date),
    [
      '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
      '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
    ],
  );
  assert.deepEqual(days.map((d) => d.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('every canonical stage appears exactly once, in route order', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  const ids = days.flatMap((d) => d.stages.map((s) => s.id));
  assert.deepEqual(ids, forwardStages.map((s) => s.id));
  assert.equal(ids.length, STAGES);
});

test('day kinds record the real journey, including the mixed day', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  assert.deepEqual(days.map((d) => d.kinds), [
    ['travel'],
    ['hiking'], ['hiking'], ['hiking'], ['hiking'], ['hiking'],
    ['rest'],
    ['hiking', 'travel'],
    ['travel'],
  ]);
});

test('activity ORDER is preserved — hike then travel, not travel then hike', () => {
  const hikeThenTravel = buildPlannedDays(
    forwardStages,
    plan([day([hiking(STAGES), travel()])]),
    [],
  );
  assert.deepEqual(hikeThenTravel[0].kinds, ['hiking', 'travel']);
  const travelThenHike = buildPlannedDays(
    forwardStages,
    plan([day([travel(), hiking(STAGES)])]),
    [],
  );
  assert.deepEqual(travelThenHike[0].kinds, ['travel', 'hiking']);
});

test('the combined day names its endpoints and its via-stop', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  const combined = days[3]; // 6 Sep
  assert.equal(combined.stages.length, 2);
  assert.equal(combined.fromStopId, 'alesjaure');
  assert.equal(combined.toStopId, 'salka');
  assert.deepEqual(combined.viaStopIds, ['tjaktja']);
  const [a, b] = combined.stages;
  assert.equal(combined.distanceKm, a.distanceKm + b.distanceKm);
  assert.equal(combined.totalAscentM, a.totalAscentM + b.totalAscentM);
  assert.equal(combined.minimumElevationM, Math.min(a.minimumElevationM, b.minimumElevationM));
  assert.equal(combined.maximumElevationM, Math.max(a.maximumElevationM, b.maximumElevationM));
});

test('a travel or rest day walks nothing and reports no route figures', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  for (const idx of [0, 6, 8]) {
    const d = days[idx];
    assert.deepEqual(d.stages, []);
    assert.equal(d.fromStopId, null);
    assert.equal(d.toStopId, null);
    assert.equal(d.distanceKm, 0);
    assert.equal(d.totalAscentM, null);
    assert.equal(d.minimumElevationM, null);
    assert.deepEqual(d.elevationProfile, []);
  }
});

// ---- Overnight resolution ---------------------------------------------------

test('overnight resolves explicit → hiking endpoint → carried → none', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  assert.deepEqual(days[0].overnight, { kind: 'stop', stopId: 'abisko', source: 'explicit' });
  assert.deepEqual(days[1].overnight, { kind: 'stop', stopId: 'abiskojaure', source: 'hiking' });
  assert.deepEqual(days[3].overnight, { kind: 'stop', stopId: 'salka', source: 'hiking' });
  assert.deepEqual(days[5].overnight, { kind: 'stop', stopId: 'kebnekaise', source: 'hiking' });
  // The rest day stays where it already was.
  assert.deepEqual(days[6].overnight, { kind: 'stop', stopId: 'kebnekaise', source: 'carried' });
  // Hikes to Nikkaluokta but SLEEPS in Kiruna — the endpoint is not the bed.
  assert.equal(days[7].toStopId, 'nikkaluokta');
  assert.deepEqual(days[7].overnight, {
    kind: 'stay',
    tripItemId: 'trip_kiruna',
    source: 'explicit',
  });
  // Travel home: deliberately nowhere.
  assert.deepEqual(days[8].overnight, { kind: 'none', source: 'explicit' });
});

test('a travel-only day has NO overnight unless the user sets one', () => {
  // A canonical stop is never inferred from a transport item's destination.
  const days = buildPlannedDays(
    forwardStages,
    plan([day([travel()]), day([hiking(STAGES)])]),
    TRIP_ITEMS,
  );
  assert.equal(days[0].overnight.kind, 'none');
  assert.equal(days[0].travelItems.length, 2, 'it still shows the movements');
});

test('a rest day with nothing before it resolves to no overnight', () => {
  const days = buildPlannedDays(forwardStages, plan([day([rest()]), day([hiking(STAGES)])]), []);
  assert.equal(days[0].overnight.kind, 'none');
});

test('a dangling Trip Stay reference resolves without crashing', () => {
  const days = buildPlannedDays(
    forwardStages,
    plan([day([hiking(STAGES)], { kind: 'stay', tripItemId: 'trip_deleted' })]),
    TRIP_ITEMS,
  );
  // The reference is kept as-is; the UI resolves it against the live trip list
  // and states honestly when the stay is gone.
  assert.deepEqual(days[0].overnight, {
    kind: 'stay',
    tripItemId: 'trip_deleted',
    source: 'explicit',
  });
});

// ---- Travel matching --------------------------------------------------------

test('transport items match a day by date and sort by departure time', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  assert.deepEqual(days[0].travelItems.map((i) => i.id), ['trip_out', 'trip_bus']);
  assert.deepEqual(days[7].travelItems.map((i) => i.id), ['trip_kiruna_bus']);
});

test('untimed transport keeps its own order and follows timed items', () => {
  const items = [
    { id: 't_untimed', kind: 'transport', date: '2026-09-03', attachmentIds: [] },
    { id: 't_timed', kind: 'transport', date: '2026-09-03', departureTime: '09:00', attachmentIds: [] },
    { id: 't_untimed2', kind: 'transport', date: '2026-09-03', attachmentIds: [] },
  ];
  const days = buildPlannedDays(forwardStages, plan([day([travel()]), day([hiking(STAGES)])]), items);
  assert.deepEqual(days[0].travelItems.map((i) => i.id), ['t_timed', 't_untimed', 't_untimed2']);
});

test('stays are never matched as travel, and other dates never leak in', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  assert.ok(days.every((d) => d.travelItems.every((i) => i.kind === 'transport')));
  assert.deepEqual(days[4].travelItems, [], 'a day with no transport shows none');
});

test('trip data is referenced, never copied into the derived day', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  // The very objects from the trip list, not clones with copied fields.
  assert.equal(days[0].travelItems[0], TRIP_ITEMS[0]);
});

// ---- Current day ------------------------------------------------------------

test('the active day comes from the plan’s stable id, not a position', () => {
  const days = journey();
  const built = buildPlannedDays(forwardStages, plan(days, { currentDayId: days[6].id }), []);
  const current = currentPlannedDayOf(built);
  assert.equal(current.id, days[6].id);
  assert.equal(current.number, 7);
  assert.equal(built.filter((d) => d.isCurrent).length, 1);
});

test('a travel or rest day can be the active day', () => {
  const days = journey();
  for (const idx of [0, 6, 8]) {
    const built = buildPlannedDays(forwardStages, plan(days, { currentDayId: days[idx].id }), []);
    assert.equal(currentPlannedDayOf(built).index, idx);
    assert.deepEqual(currentPlannedDayOf(built).stages, [], 'no stage is fabricated');
  }
});

test('inserting a day before the active one does not move the activation', () => {
  const days = journey();
  const activeId = days[7].id;
  const before = buildPlannedDays(forwardStages, plan(days, { currentDayId: activeId }), []);
  assert.equal(currentPlannedDayOf(before).number, 8);

  const shifted = [days[0], day([travel()]), ...days.slice(1)];
  const after = buildPlannedDays(forwardStages, plan(shifted, { currentDayId: activeId }), []);
  assert.equal(currentPlannedDayOf(after).id, activeId, 'the SAME day is still active');
  assert.equal(currentPlannedDayOf(after).number, 9, 'it has simply moved a day later');
});

test('the current stage locates its day and its part', () => {
  const days = journey();
  const built = buildPlannedDays(forwardStages, plan(days), []);
  assert.equal(plannedDayForStage(built, 'd3').number, 4, 'the combined day');
  assert.equal(currentPartIndex(plannedDayForStage(built, 'd3'), 'd3'), 0);
  assert.equal(currentPartIndex(plannedDayForStage(built, 'd4'), 'd4'), 1);
  assert.equal(plannedDayForStage(built, 'ghost'), null);
});

// ---- Elevation profile ------------------------------------------------------

test('a combined day concatenates verified profiles with monotonic offsets', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), []);
  const profile = days[3].elevationProfile;
  const [a, b] = days[3].stages;
  assert.equal(profile.length, a.elevationProfile.length + b.elevationProfile.length);
  for (let i = 1; i < profile.length; i++) {
    assert.ok(profile[i].distanceKm >= profile[i - 1].distanceKm, `sample ${i} moves forward`);
  }
  assert.equal(profile[0].elevationM, a.elevationProfile[0].elevationM, 'values are verbatim');
});

test('deriving days never mutates the canonical stages', () => {
  const snapshot = JSON.stringify(forwardStages.map((s) => s.elevationProfile.length));
  const days = buildPlannedDays(forwardStages, plan(journey()), []);
  days[3].elevationProfile[0].distanceKm = 999;
  assert.equal(JSON.stringify(forwardStages.map((s) => s.elevationProfile.length)), snapshot);
});

// ---- Endpoint options -------------------------------------------------------

test('endpoint options list every legal following stop with its consequence', () => {
  const days = buildPlannedDays(forwardStages, plan(defaultDays(STAGES)), []);
  const options = hikingEndpointOptions(days, 1, forwardStages);
  assert.equal(options.length, 6, 'stage 2 onwards — everything still to walk');
  assert.equal(options[0].stopId, 'alesjaure');
  assert.equal(options[0].stages, 1);
  assert.equal(options[0].isCurrent, true);
  assert.equal(options[0].effect, 'none');
  assert.equal(options[1].effect, 'merge');
  assert.ok(options[1].distanceKm > options[0].distanceKm, 'distances accumulate');
});

test('endpoint options mark a shorter choice as a split', () => {
  const days = buildPlannedDays(forwardStages, plan([day([hiking(3)]), day([hiking(4)])]), []);
  const options = hikingEndpointOptions(days, 0, forwardStages);
  assert.equal(options[0].effect, 'split');
  assert.equal(options[2].effect, 'none');
  assert.equal(options[3].effect, 'merge');
});

test('a travel or rest day has no endpoint options', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), []);
  assert.deepEqual(hikingEndpointOptions(days, 0, forwardStages), []);
  assert.deepEqual(hikingEndpointOptions(days, 6, forwardStages), []);
});

// ---- Reverse direction ------------------------------------------------------

test('the reversed route derives the same journey shape from the other end', () => {
  const reverseStages = stagesFor(REVERSE);
  const days = buildPlannedDays(
    reverseStages,
    { ...plan(journey()), direction: REVERSE },
    [],
  );
  assert.equal(days.length, 9);
  assert.equal(days[1].stages[0].id, 'd7', 'walking south to north starts on d7');
  assert.equal(days[1].fromStopId, 'nikkaluokta');
  assert.equal(days[7].stages[0].id, 'd1');
  assert.equal(days[7].toStopId, 'abisko');
  const ids = days.flatMap((d) => d.stages.map((s) => s.id));
  assert.deepEqual(ids, reverseStages.map((s) => s.id));
});

// ---- The derived overnight, alongside the effective one ---------------------
//
// `overnight` is what the day HAS; `derivedOvernight` is what it would have
// with nothing stored. The chooser needs both: without the second, a day that
// has been overridden once can never inherit again.

test('every day exposes what its overnight would be with nothing stored', () => {
  const days = buildPlannedDays(forwardStages, plan(journey()), TRIP_ITEMS);
  for (const d of days) {
    assert.ok(d.derivedOvernight, `day ${d.number} exposes a derived overnight`);
    assert.notEqual(d.derivedOvernight.source, 'explicit', 'the derivation ignores the override');
  }
});

test('a hiking day derives its walking endpoint whatever it has stored', () => {
  const days = plan([day([hiking(1)], { kind: 'stop', stopId: 'kebnekaise' }), day([hiking(6)])]);
  const [first] = buildPlannedDays(forwardStages, days, []);
  assert.equal(first.overnight.kind, 'stop');
  assert.equal(first.overnight.stopId, 'kebnekaise', 'the override wins');
  assert.equal(first.overnight.source, 'explicit');
  // ...and the way back is still known.
  assert.equal(first.derivedOvernight.source, 'hiking');
  assert.equal(first.derivedOvernight.stopId, forwardStages[0].toHutId);
});

test('a rest day carries the night before, and still knows it when overridden', () => {
  const base = [day([hiking(6)]), day([rest()]), day([hiking(1)])];
  const [, restDay] = buildPlannedDays(forwardStages, plan(base), []);
  const carriedTo = forwardStages[5].toHutId;
  assert.equal(restDay.overnight.source, 'carried');
  assert.equal(restDay.overnight.stopId, carriedTo);
  assert.equal(restDay.derivedOvernight.source, 'carried');

  // Override it, and the carried value is STILL what it would fall back to.
  const overridden = [day([hiking(6)]), day([rest()], { kind: 'stop', stopId: 'abisko' }), day([hiking(1)])];
  const [, pinned] = buildPlannedDays(forwardStages, plan(overridden), []);
  assert.equal(pinned.overnight.source, 'explicit');
  assert.equal(pinned.overnight.stopId, 'abisko');
  assert.equal(pinned.derivedOvernight.source, 'carried');
  assert.equal(pinned.derivedOvernight.stopId, carriedTo, 'the way back survives the override');
});

test('a carried rest day FOLLOWS the day before when that day changes', () => {
  // The point of clearing the override rather than pinning today's answer.
  const shorter = [day([hiking(5)]), day([rest()]), day([hiking(2)])];
  const longer = [day([hiking(6)]), day([rest()]), day([hiking(1)])];
  const [, a] = buildPlannedDays(forwardStages, plan(shorter), []);
  const [, b] = buildPlannedDays(forwardStages, plan(longer), []);
  assert.equal(a.overnight.stopId, forwardStages[4].toHutId);
  assert.equal(b.overnight.stopId, forwardStages[5].toHutId);
  assert.notEqual(a.overnight.stopId, b.overnight.stopId, 'the rest day moved with its source');
});

test('a rest day carrying a Trip stay derives that stay, not a canonical stop', () => {
  const stay = { kind: 'stay', tripItemId: 'trip_kiruna' };
  const days = [day([hiking(7)], stay), day([rest()])];
  const [, restDay] = buildPlannedDays(forwardStages, plan(days), TRIP_ITEMS);
  assert.equal(restDay.derivedOvernight.kind, 'stay');
  assert.equal(restDay.derivedOvernight.tripItemId, 'trip_kiruna');
  assert.equal(restDay.derivedOvernight.source, 'carried');
});

test('a travel day with nothing before it derives no overnight at all', () => {
  const days = [day([travel()]), day([hiking(7)])];
  const [first] = buildPlannedDays(forwardStages, plan(days), TRIP_ITEMS);
  assert.equal(first.derivedOvernight.kind, 'none');
  assert.equal(first.derivedOvernight.source, 'derived');
});
