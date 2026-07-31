/**
 * Day plan — the derived layer (src/plan/plannedDays.mjs), the exact module
 * the store runs. Canonical stages are never modified: a planned day only
 * HOLDS oriented views of them (the forward itinerary's stage for a
 * 'canonical' leg, the reverse itinerary's for an 'opposite' one), so guides,
 * highlights, detours and geometry stay stage-owned.
 *
 * The 3–11 September journey is the primary fixture: travel in, hiking days
 * including one with two connected legs, a rest day, a mixed hiking+travel
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
  currentLegIndex,
  currentPlannedDayOf,
  plannedDaysForStage,
} from '../src/plan/plannedDays.mjs';
import {
  addLegToDay,
  defaultDays,
  dropHikingFromDay,
  hikingLegsOf,
} from '../src/plan/dayPlan.mjs';
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

/** The itinerary stages the store enriches (mirrors activeItinerary.ts). */
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
const reverseStages = stagesFor(REVERSE);
const STAGES = forwardStages.length;

/** The oriented stage views the store passes in (mirrors AppStore.tsx). */
const ORIENTED = {
  canonical: Object.fromEntries(forwardStages.map((s) => [s.id, s])),
  opposite: Object.fromEntries(reverseStages.map((s) => [s.id, s])),
};

const TOPOLOGY = forwardStages.map((s) => ({
  id: s.id,
  fromStopId: s.fromHutId,
  toStopId: s.toHutId,
}));

let seq = 0;
const leg = (stageId, orientation = 'canonical') => ({
  id: `leg_fixture_${(seq += 1)}`,
  kind: 'canonical-stage',
  stageId,
  orientation,
});
const day = (activities, overnight) => ({
  id: `day_fixture_${(seq += 1)}`,
  activities,
  ...(overnight ? { overnight } : {}),
});
const hiking = (...legs) => ({ kind: 'hiking', legs });
const travel = () => ({ kind: 'travel' });
const rest = () => ({ kind: 'rest' });
const plan = (days, extra = {}) => ({
  direction: FORWARD,
  startDate: '2026-09-03',
  currentDayId: null,
  currentLegId: null,
  days,
  ...extra,
});

/** One hiking day per canonical stage, in order — the default plan's shape. */
const spreadDays = () =>
  ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((id) => day([hiking(leg(id))]));

/** The concrete 3–11 September journey. */
function journey() {
  return [
    day([travel()], { kind: 'stop', stopId: 'abisko' }), // 3 Sep
    day([hiking(leg('d1'))]), // 4 Sep  Abisko → Abiskojaure
    day([hiking(leg('d2'))]), // 5 Sep  → Alesjaure
    day([hiking(leg('d3'), leg('d4'))]), // 6 Sep  → Sälka via Tjäktja
    day([hiking(leg('d5'))]), // 7 Sep  → Singi
    day([hiking(leg('d6'))]), // 8 Sep  → Kebnekaise
    day([rest()]), // 9 Sep  based at Kebnekaise
    day([hiking(leg('d7')), travel()], { kind: 'stay', tripItemId: 'trip_kiruna' }), // 10 Sep
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
  assert.deepEqual(buildPlannedDays(ORIENTED, null, TRIP_ITEMS), []);
  assert.deepEqual(buildPlannedDays(ORIENTED, undefined), []);
  assert.equal(currentPlannedDayOf([]), null);
});

test('nothing infers a plan from trip items, stays or documents', () => {
  // A rich trip plan produces exactly nothing without a Day plan.
  assert.deepEqual(buildPlannedDays(ORIENTED, null, TRIP_ITEMS), []);
});

test('an unresolvable leg derives nothing rather than a broken journey', () => {
  assert.deepEqual(buildPlannedDays(ORIENTED, plan([day([hiking(leg('ghost'))])]), []), []);
  assert.deepEqual(buildPlannedDays(null, plan(spreadDays()), []), []);
  assert.deepEqual(buildPlannedDays({}, plan(spreadDays()), []), []);
});

// ---- The concrete journey ---------------------------------------------------

test('the 3–11 September journey derives nine consecutive dated days', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
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

test('every leg resolves to its oriented stage view, in exact leg order', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
  const ids = days.flatMap((d) => d.stages.map((s) => s.id));
  assert.deepEqual(ids, ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);
  // Every derived leg carries its identity, orientation and stage view.
  for (const d of days) {
    assert.equal(d.legs.length, d.stages.length);
    for (const [i, derived] of d.legs.entries()) {
      assert.equal(derived.stage, d.stages[i], 'stages IS the legs’ oriented views');
      assert.equal(derived.orientation, 'canonical');
      assert.match(derived.id, /^leg_/);
    }
  }
});

test('day kinds record the real journey, including the mixed day', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
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
    ORIENTED,
    plan([day([hiking(leg('d1')), travel()])]),
    [],
  );
  assert.deepEqual(hikeThenTravel[0].kinds, ['hiking', 'travel']);
  const travelThenHike = buildPlannedDays(
    ORIENTED,
    plan([day([travel(), hiking(leg('d1'))])]),
    [],
  );
  assert.deepEqual(travelThenHike[0].kinds, ['travel', 'hiking']);
});

test('the two-leg day names its endpoints, via-stop and exact aggregates', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
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
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
  for (const idx of [0, 6, 8]) {
    const d = days[idx];
    assert.deepEqual(d.stages, []);
    assert.deepEqual(d.legs, []);
    assert.equal(d.fromStopId, null);
    assert.equal(d.toStopId, null);
    assert.equal(d.distanceKm, 0);
    assert.equal(d.totalAscentM, null);
    assert.equal(d.minimumElevationM, null);
    assert.deepEqual(d.elevationProfile, []);
  }
});

// ---- Opposite legs ----------------------------------------------------------

test('an opposite leg derives the reverse itinerary view of the same stage', () => {
  const forward = buildPlannedDays(ORIENTED, plan([day([hiking(leg('d7'))])]), [])[0];
  const opposite = buildPlannedDays(ORIENTED, plan([day([hiking(leg('d7', 'opposite'))])]), [])[0];
  // Same physical segment, swapped endpoints.
  assert.equal(forward.fromStopId, 'kebnekaise');
  assert.equal(forward.toStopId, 'nikkaluokta');
  assert.equal(opposite.fromStopId, 'nikkaluokta');
  assert.equal(opposite.toStopId, 'kebnekaise');
  // Distance and extremes identical; ascent/descent swapped — the verified
  // reversal convention (src/route/itinerary.mjs), never recomputed here.
  assert.equal(opposite.distanceKm, forward.distanceKm);
  assert.equal(opposite.minimumElevationM, forward.minimumElevationM);
  assert.equal(opposite.maximumElevationM, forward.maximumElevationM);
  assert.equal(opposite.totalAscentM, forward.totalDescentM);
  assert.equal(opposite.totalDescentM, forward.totalAscentM);
  // The oriented profile starts at 0 and runs the stage's own length.
  const profile = opposite.elevationProfile;
  assert.equal(profile[0].distanceKm, 0);
  for (let i = 1; i < profile.length; i++) {
    assert.ok(profile[i].distanceKm >= profile[i - 1].distanceKm);
  }
  // The reversed geometry really is the mirrored verified line.
  assert.equal(
    opposite.stages[0].points[0].lat,
    forward.stages[0].points[forward.stages[0].points.length - 1].lat,
  );
});

test('an out-and-back day counts the same stage twice — never deduplicated', () => {
  const bounce = day([hiking(leg('d7'), leg('d7', 'opposite'))]);
  const [derived] = buildPlannedDays(ORIENTED, plan([bounce]), []);
  assert.equal(derived.stages.length, 2);
  assert.equal(derived.fromStopId, 'kebnekaise');
  assert.equal(derived.toStopId, 'kebnekaise', 'back where it started');
  assert.deepEqual(derived.viaStopIds, ['nikkaluokta'], 'the turn-around point');
  const single = ORIENTED.canonical.d7;
  assert.equal(derived.distanceKm, single.distanceKm * 2, 'twice the distance, not zero');
  assert.equal(
    derived.totalAscentM,
    single.totalAscentM + single.totalDescentM,
    'the way back climbs what the way out descended',
  );
  assert.equal(
    derived.elevationProfile.length,
    single.elevationProfile.length + ORIENTED.opposite.d7.elevationProfile.length,
  );
  // The concatenated profile keeps moving forward across the turn-around.
  const profile = derived.elevationProfile;
  for (let i = 1; i < profile.length; i++) {
    assert.ok(profile[i].distanceKm >= profile[i - 1].distanceKm, `sample ${i}`);
  }
});

test('the same stage on different days derives independently on each', () => {
  const days = [
    day([hiking(leg('d6'))]),
    day([hiking(leg('d6', 'opposite'))]),
  ];
  const [first, second] = buildPlannedDays(ORIENTED, plan(days), []);
  assert.equal(first.fromStopId, 'singi');
  assert.equal(second.fromStopId, 'kebnekaise');
  assert.notEqual(first.legs[0].id, second.legs[0].id, 'independent occurrences');
  assert.deepEqual(plannedDaysForStage([first, second], 'd6').length, 2);
});

// ---- Editing isolation ------------------------------------------------------

test('editing one day never changes what another day derives to', () => {
  const records = journey();
  const before = buildPlannedDays(ORIENTED, plan(records), TRIP_ITEMS);
  // Grow day 4 (index 3) by a further leg; drop day 8's walking entirely.
  const grown = addLegToDay(records, 3, 'd5', 'canonical', 'end', TOPOLOGY);
  const dropped = dropHikingFromDay(grown, 7, ['travel']);
  const after = buildPlannedDays(ORIENTED, plan(dropped), TRIP_ITEMS);
  for (const idx of [0, 1, 2, 4, 5, 6, 8]) {
    const a = { ...before[idx] };
    const b = { ...after[idx] };
    // Only identity-independent derived fields may differ via activities
    // arrays being fresh clones — compare the meaningful projection.
    assert.deepEqual(
      { from: b.fromStopId, to: b.toStopId, km: b.distanceKm, kinds: b.kinds },
      { from: a.fromStopId, to: a.toStopId, km: a.distanceKm, kinds: a.kinds },
      `day index ${idx} unchanged`,
    );
  }
  assert.equal(after[3].toStopId, 'singi', 'the edited day grew');
  assert.deepEqual(after[7].kinds, ['travel'], 'the other edited day stopped walking');
  assert.equal(plannedDaysForStage(after, 'd5').length, 2, 'd5 is now planned twice');
  assert.equal(plannedDaysForStage(after, 'd7').length, 0, 'd7 is now unplanned — a diagnostic');
});

// ---- Overnight resolution ---------------------------------------------------

test('overnight resolves explicit → hiking endpoint → carried → none', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
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

test('an out-and-back derives its overnight where the LAST leg ends', () => {
  const bounce = day([hiking(leg('d7'), leg('d7', 'opposite'))]);
  const [derived] = buildPlannedDays(ORIENTED, plan([bounce]), []);
  assert.deepEqual(derived.overnight, { kind: 'stop', stopId: 'kebnekaise', source: 'hiking' });
});

test('a travel-only day has NO overnight unless the user sets one', () => {
  const days = buildPlannedDays(
    ORIENTED,
    plan([day([travel()]), day([hiking(leg('d1'))])]),
    TRIP_ITEMS,
  );
  assert.equal(days[0].overnight.kind, 'none');
  assert.equal(days[0].travelItems.length, 2, 'it still shows the movements');
});

test('a rest day with nothing before it resolves to no overnight', () => {
  const days = buildPlannedDays(ORIENTED, plan([day([rest()]), day([hiking(leg('d1'))])]), []);
  assert.equal(days[0].overnight.kind, 'none');
});

test('a dangling Trip Stay reference resolves without crashing', () => {
  const days = buildPlannedDays(
    ORIENTED,
    plan([day([hiking(leg('d1'))], { kind: 'stay', tripItemId: 'trip_deleted' })]),
    TRIP_ITEMS,
  );
  assert.deepEqual(days[0].overnight, {
    kind: 'stay',
    tripItemId: 'trip_deleted',
    source: 'explicit',
  });
});

// ---- Travel matching --------------------------------------------------------

test('transport items match a day by date and sort by departure time', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
  assert.deepEqual(days[0].travelItems.map((i) => i.id), ['trip_out', 'trip_bus']);
  assert.deepEqual(days[7].travelItems.map((i) => i.id), ['trip_kiruna_bus']);
});

test('untimed transport keeps its own order and follows timed items', () => {
  const items = [
    { id: 't_untimed', kind: 'transport', date: '2026-09-03', attachmentIds: [] },
    { id: 't_timed', kind: 'transport', date: '2026-09-03', departureTime: '09:00', attachmentIds: [] },
    { id: 't_untimed2', kind: 'transport', date: '2026-09-03', attachmentIds: [] },
  ];
  const days = buildPlannedDays(
    ORIENTED,
    plan([day([travel()]), day([hiking(leg('d1'))])]),
    items,
  );
  assert.deepEqual(days[0].travelItems.map((i) => i.id), ['t_timed', 't_untimed', 't_untimed2']);
});

test('stays are never matched as travel, and other dates never leak in', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
  assert.ok(days.every((d) => d.travelItems.every((i) => i.kind === 'transport')));
  assert.deepEqual(days[4].travelItems, [], 'a day with no transport shows none');
});

test('trip data is referenced, never copied into the derived day', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
  // The very objects from the trip list, not clones with copied fields.
  assert.equal(days[0].travelItems[0], TRIP_ITEMS[0]);
});

test('a movement added after the fact appears on re-derivation — no reload step', () => {
  const journeyDays = journey();
  const before = buildPlannedDays(ORIENTED, plan(journeyDays), []);
  assert.equal(before[0].travelItems.length, 0);
  const bus = {
    id: 't_late_bus',
    kind: 'transport',
    title: 'Bus Nikkaluokta to Kiruna',
    date: '2026-09-03',
    departureTime: '16:40',
    attachmentIds: [],
  };
  const after = buildPlannedDays(ORIENTED, plan(journeyDays), [bus]);
  assert.deepEqual(after[0].travelItems.map((i) => i.id), ['t_late_bus']);
});

// ---- Current day and current leg --------------------------------------------

test('the active day comes from the plan’s stable id, not a position', () => {
  const days = journey();
  const built = buildPlannedDays(ORIENTED, plan(days, { currentDayId: days[6].id }), []);
  const current = currentPlannedDayOf(built);
  assert.equal(current.id, days[6].id);
  assert.equal(current.number, 7);
  assert.equal(built.filter((d) => d.isCurrent).length, 1);
});

test('a travel or rest day can be the active day', () => {
  const days = journey();
  for (const idx of [0, 6, 8]) {
    const built = buildPlannedDays(ORIENTED, plan(days, { currentDayId: days[idx].id }), []);
    assert.equal(currentPlannedDayOf(built).index, idx);
    assert.deepEqual(currentPlannedDayOf(built).stages, [], 'no stage is fabricated');
  }
});

test('the current LEG is marked only on the current day, by identity', () => {
  const days = journey();
  const combined = days[3];
  const secondLeg = hikingLegsOf(combined)[1];
  const built = buildPlannedDays(
    ORIENTED,
    plan(days, { currentDayId: combined.id, currentLegId: secondLeg.id }),
    [],
  );
  assert.equal(currentLegIndex(built[3]), 1);
  assert.deepEqual(
    built.flatMap((d) => d.legs.filter((l) => l.isCurrent).map((l) => l.id)),
    [secondLeg.id],
    'exactly one current occurrence in the whole journey',
  );
  // A repeated-stage plan cannot mark the wrong twin: identity is by leg id.
  const twice = [day([hiking(leg('d7'))]), day([hiking(leg('d7', 'opposite'))])];
  const target = hikingLegsOf(twice[1])[0];
  const derived = buildPlannedDays(
    ORIENTED,
    plan(twice, { currentDayId: twice[1].id, currentLegId: target.id }),
    [],
  );
  assert.equal(currentLegIndex(derived[0]), -1);
  assert.equal(currentLegIndex(derived[1]), 0);
});

test('inserting a day before the active one does not move the activation', () => {
  const days = journey();
  const activeId = days[7].id;
  const before = buildPlannedDays(ORIENTED, plan(days, { currentDayId: activeId }), []);
  assert.equal(currentPlannedDayOf(before).number, 8);

  const shifted = [days[0], day([travel()]), ...days.slice(1)];
  const after = buildPlannedDays(ORIENTED, plan(shifted, { currentDayId: activeId }), []);
  assert.equal(currentPlannedDayOf(after).id, activeId, 'the SAME day is still active');
  assert.equal(currentPlannedDayOf(after).number, 9, 'it has simply moved a day later');
});

test('plannedDaysForStage returns EVERY occurrence day — never just the first', () => {
  const days = journey();
  const built = buildPlannedDays(ORIENTED, plan(days), []);
  assert.equal(plannedDaysForStage(built, 'd3')[0].number, 4, 'the combined day');
  assert.deepEqual(plannedDaysForStage(built, 'ghost'), []);
  const withRepeat = [...days, day([hiking(leg('d7', 'opposite'))])];
  const repeated = buildPlannedDays(ORIENTED, plan(withRepeat), []);
  assert.equal(plannedDaysForStage(repeated, 'd7').length, 2);
});

// ---- Elevation profile ------------------------------------------------------

test('a two-leg day concatenates verified profiles with monotonic offsets', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), []);
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
  const days = buildPlannedDays(ORIENTED, plan(journey()), []);
  days[3].elevationProfile[0].distanceKm = 999;
  assert.equal(JSON.stringify(forwardStages.map((s) => s.elevationProfile.length)), snapshot);
});

// ---- Reverse direction ------------------------------------------------------

test('a reverse-direction plan derives the same journey from the other end', () => {
  const reversePlan = {
    direction: REVERSE,
    startDate: '2026-09-03',
    currentDayId: null,
    currentLegId: null,
    days: [
      day([travel()], { kind: 'stop', stopId: 'nikkaluokta' }),
      day([hiking(leg('d7', 'opposite'))]),
      day([hiking(leg('d6', 'opposite'))]),
      day([hiking(leg('d5', 'opposite'), leg('d4', 'opposite'))]),
      day([hiking(leg('d3', 'opposite'))]),
      day([hiking(leg('d2', 'opposite'))]),
      day([hiking(leg('d1', 'opposite'))]),
    ],
  };
  const days = buildPlannedDays(ORIENTED, reversePlan, []);
  assert.equal(days.length, 7);
  assert.equal(days[1].stages[0].id, 'd7', 'walking south to north starts on d7');
  assert.equal(days[1].fromStopId, 'nikkaluokta');
  assert.equal(days[3].fromStopId, 'singi');
  assert.equal(days[3].toStopId, 'tjaktja');
  assert.deepEqual(days[3].viaStopIds, ['salka']);
  assert.equal(days[6].toStopId, 'abisko');
});

// ---- The derived overnight, alongside the effective one ---------------------

test('every day exposes what its overnight would be with nothing stored', () => {
  const days = buildPlannedDays(ORIENTED, plan(journey()), TRIP_ITEMS);
  for (const d of days) {
    assert.ok(d.derivedOvernight, `day ${d.number} exposes a derived overnight`);
    assert.notEqual(d.derivedOvernight.source, 'explicit', 'the derivation ignores the override');
  }
});

test('a hiking day derives its walking endpoint whatever it has stored', () => {
  const days = plan([
    day([hiking(leg('d1'))], { kind: 'stop', stopId: 'kebnekaise' }),
    day([hiking(leg('d2'))]),
  ]);
  const [first] = buildPlannedDays(ORIENTED, days, []);
  assert.equal(first.overnight.kind, 'stop');
  assert.equal(first.overnight.stopId, 'kebnekaise', 'the override wins');
  assert.equal(first.overnight.source, 'explicit');
  // ...and the way back is still known.
  assert.equal(first.derivedOvernight.source, 'hiking');
  assert.equal(first.derivedOvernight.stopId, 'abiskojaure');
});

test('a rest day carries the night before, and still knows it when overridden', () => {
  const base = [day([hiking(leg('d1'))]), day([rest()]), day([hiking(leg('d2'))])];
  const [, restDay] = buildPlannedDays(ORIENTED, plan(base), []);
  assert.equal(restDay.overnight.source, 'carried');
  assert.equal(restDay.overnight.stopId, 'abiskojaure');
  assert.equal(restDay.derivedOvernight.source, 'carried');

  // Override it, and the carried value is STILL what it would fall back to.
  const overridden = [
    day([hiking(leg('d1'))]),
    day([rest()], { kind: 'stop', stopId: 'abisko' }),
    day([hiking(leg('d2'))]),
  ];
  const [, pinned] = buildPlannedDays(ORIENTED, plan(overridden), []);
  assert.equal(pinned.overnight.source, 'explicit');
  assert.equal(pinned.overnight.stopId, 'abisko');
  assert.equal(pinned.derivedOvernight.source, 'carried');
  assert.equal(pinned.derivedOvernight.stopId, 'abiskojaure', 'the way back survives');
});

test('a carried rest day FOLLOWS the day before when that day changes', () => {
  const shorter = [day([hiking(leg('d1'))]), day([rest()])];
  const longer = [day([hiking(leg('d1'), leg('d2'))]), day([rest()])];
  const [, a] = buildPlannedDays(ORIENTED, plan(shorter), []);
  const [, b] = buildPlannedDays(ORIENTED, plan(longer), []);
  assert.equal(a.overnight.stopId, 'abiskojaure');
  assert.equal(b.overnight.stopId, 'alesjaure');
  assert.notEqual(a.overnight.stopId, b.overnight.stopId, 'the rest day moved with its source');
});

test('a rest day carrying a Trip stay derives that stay, not a canonical stop', () => {
  const stay = { kind: 'stay', tripItemId: 'trip_kiruna' };
  const days = [day([hiking(leg('d1'))], stay), day([rest()])];
  const [, restDay] = buildPlannedDays(ORIENTED, plan(days), TRIP_ITEMS);
  assert.equal(restDay.derivedOvernight.kind, 'stay');
  assert.equal(restDay.derivedOvernight.tripItemId, 'trip_kiruna');
  assert.equal(restDay.derivedOvernight.source, 'carried');
});

test('a travel day with nothing before it derives no overnight at all', () => {
  const days = [day([travel()]), day([hiking(leg('d1'))])];
  const [first] = buildPlannedDays(ORIENTED, plan(days), TRIP_ITEMS);
  assert.equal(first.derivedOvernight.kind, 'none');
  assert.equal(first.derivedOvernight.source, 'derived');
});
