/**
 * Which planned day Today shows (src/plan/effectiveToday.mjs) — the exact
 * module the store runs.
 *
 * The 0.26.0 regression this fences: creating a Day plan selects no current
 * day, so Today rendered an empty "No day selected yet" card until the user
 * found `Make this today` in a day's edit sheet. Today must NEVER be empty
 * merely because a plan exists.
 *
 * The resolution, in one fixed precedence:
 *   1. `currentDayId` pointing at a planned day — the manual override;
 *   2. else the planned day whose date IS the device's local calendar date;
 *   3. else none, and Today renders its original date-independent experience.
 *
 * Nothing here writes: a date match is never persisted as `currentDayId`, and
 * no plan is created, moved or reshaped from the system date.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TODAY_SOURCES,
  plannedDayForDate,
  resolveEffectiveToday,
} from '../src/plan/effectiveToday.mjs';
import { buildPlannedDays } from '../src/plan/plannedDays.mjs';
import { defaultDays, insertDay, removeDay } from '../src/plan/dayPlan.mjs';
import { localIsoDate, toIsoDate } from '../src/utils/dateTimeField.mjs';
import { buildDirectionalItinerary } from '../src/route/itinerary.mjs';
import { WAYPOINT_TO_HUT } from '../src/route/waypointStops.mjs';
import { DEFAULT_DIRECTION } from '../src/route/direction.mjs';

// ---- Real route data (the store passes the active itinerary's stages) -------

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
      elevationProfile: [],
    };
  }),
  waypoints: raw.waypoints,
  bounds: raw.bounds,
  statistics: raw.statistics,
  userBounds: raw.userBounds,
  mapCutoutBounds: raw.mapCutoutBounds,
};
const STAGES = buildDirectionalItinerary(canonical, DEFAULT_DIRECTION).route.stages.map((s) => ({
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
  elevationProfile: [],
}));

/** A plan starting on `startDate`, one hiking day per stage (7 days). */
const planFrom = (startDate, days = defaultDays(STAGES.length), currentDayId = null) => ({
  direction: DEFAULT_DIRECTION,
  startDate,
  currentDayId,
  days,
});
const build = (plan, trip = []) => buildPlannedDays(STAGES, plan, trip);

// A concrete journey: 3–9 September 2026, one stage per day.
const START = '2026-09-03';
const LAST = '2026-09-09';

// ---- 1. No plan -------------------------------------------------------------

test('with no plan there is nothing to resolve — the generic Today', () => {
  for (const days of [[], build(null), build(undefined)]) {
    const r = resolveEffectiveToday(days, null, null, '2026-09-05');
    assert.equal(r.day, null);
    assert.equal(r.source, 'generic');
  }
  // A malformed call is the same answer, never a throw.
  assert.deepEqual(resolveEffectiveToday(null, null, 'day_x', '2026-09-05'), {
    day: null,
    source: 'generic',
  });
});

// ---- 2. A plan that has not started ----------------------------------------

test('a FUTURE plan never replaces Today before its first date', () => {
  const days = build(planFrom(START));
  for (const today of ['2026-08-31', '2026-09-02']) {
    const r = resolveEffectiveToday(days, null, null, today);
    assert.equal(r.day, null, `${today} is before the plan`);
    assert.equal(r.source, 'generic');
  }
  // ...and starts exactly on its first date, not a day early or late.
  assert.equal(resolveEffectiveToday(days, null, null, START).day.number, 1);
});

// ---- 3. A date the plan covers ---------------------------------------------

test('the planned day whose date is today is shown, without being persisted', () => {
  const plan = planFrom(START);
  const days = build(plan);
  const r = resolveEffectiveToday(days, null, null, '2026-09-05');
  assert.equal(r.source, 'date');
  assert.equal(r.day.date, '2026-09-05');
  assert.equal(r.day.number, 3);
  // The resolution is READ-ONLY: the plan still has no current day.
  assert.equal(plan.currentDayId, null, 'a date match is never written back');
  assert.equal(
    days.filter((d) => d.isCurrent).length,
    0,
    'the persisted pointer is untouched by the match',
  );
});

// ---- 4. A date inside the plan that no day has ------------------------------

test('a date between planned dates with no matching day falls back, not blank', () => {
  // Journey days are CONSECUTIVE in this iteration, so inside a real plan
  // every date between the first and the last is a day. The resolution is
  // still asked over a gapped day list, because it must never approximate a
  // date to the nearest day — and a later iteration may allow date gaps.
  const gapped = [
    { id: 'a', date: '2026-09-03' },
    { id: 'b', date: '2026-09-05' },
  ];
  const r = resolveEffectiveToday(gapped, null, null, '2026-09-04');
  assert.equal(r.day, null, 'an unmatched date is never approximated to a nearby day');
  assert.equal(r.source, 'generic');
  assert.equal(resolveEffectiveToday(gapped, null, null, '2026-09-05').day.id, 'b');
  // In a real plan, consecutive days stay distinct — never rounded together.
  const days = build(planFrom(START));
  assert.equal(resolveEffectiveToday(days, null, null, '2026-09-06').day.number, 4);
  assert.equal(resolveEffectiveToday(days, null, null, '2026-09-07').day.number, 5);
});

// ---- 5. After the plan ------------------------------------------------------

test('an EXPIRED plan leaves Today populated, never blank', () => {
  const days = build(planFrom(START));
  assert.equal(resolveEffectiveToday(days, null, null, LAST).day.number, 7, 'the last day still matches');
  for (const today of ['2026-09-10', '2027-01-01']) {
    const r = resolveEffectiveToday(days, null, null, today);
    assert.equal(r.day, null);
    assert.equal(r.source, 'generic', 'Today falls back to the generic experience');
  }
});

// ---- 6. A valid manual override --------------------------------------------

test('a valid currentDayId wins over the calendar date', () => {
  const records = defaultDays(STAGES.length);
  const chosen = records[5];
  const days = build(planFrom(START, records, chosen.id));
  const r = resolveEffectiveToday(days, null, chosen.id, '2026-09-03');
  assert.equal(r.source, 'override');
  assert.equal(r.day.id, chosen.id);
  assert.equal(r.day.number, 6, 'the user’s own choice, not today’s date');
  // It also works when the date matches nothing at all.
  assert.equal(resolveEffectiveToday(days, null, chosen.id, '2030-01-01').day.id, chosen.id);
  assert.equal(resolveEffectiveToday(days, null, chosen.id, null).day.id, chosen.id);
});

// ---- 7. A dangling manual override -----------------------------------------

test('a dangling currentDayId falls through — to the date, then to generic', () => {
  const days = build(planFrom(START));
  const stale = 'day_removed_by_an_edit';
  const matched = resolveEffectiveToday(days, null, stale, '2026-09-04');
  assert.equal(matched.source, 'date', 'the date still answers');
  assert.equal(matched.day.number, 2);
  const unmatched = resolveEffectiveToday(days, null, stale, '2026-10-04');
  assert.equal(unmatched.day, null);
  assert.equal(unmatched.source, 'generic', 'never an empty planned Today');
  // Empty-string and non-string pointers behave the same way.
  for (const bad of ['', 0, {}, [], true]) {
    assert.equal(resolveEffectiveToday(days, null, bad, '2026-10-04').source, 'generic');
  }
});

// ---- 8. Removing the active planned day ------------------------------------

test('removing the day that was current leaves Today resolvable', () => {
  const records = defaultDays(STAGES.length);
  const active = records[2]; // 5 Sep, the day being shown
  const shortened = removeDay(records, 2); // its walking passes to the next day
  const days = build(planFrom(START, shortened, active.id));
  assert.ok(!days.some((d) => d.id === active.id), 'the day is gone');
  // The pointer the store repairs to null (or leaves stale) resolves by date.
  const r = resolveEffectiveToday(days, null, active.id, '2026-09-05');
  assert.equal(r.source, 'date');
  assert.equal(r.day.date, '2026-09-05', 'the day now on that date takes over');
  assert.equal(resolveEffectiveToday(days, null, null, '2026-09-05').day.date, '2026-09-05');
});

// ---- 9. Removing the whole plan --------------------------------------------

test('removing the plan returns Today to its date-independent self', () => {
  const days = build(planFrom(START, defaultDays(STAGES.length), null));
  assert.equal(resolveEffectiveToday(days, null, null, '2026-09-05').source, 'date');
  // dayPlan: null — exactly the pre-0.26.0 state.
  const r = resolveEffectiveToday(build(null), null, null, '2026-09-05');
  assert.equal(r.day, null);
  assert.equal(r.source, 'generic');
});

// ---- Timezone-safe date comparison -----------------------------------------

test('the local calendar date is read from local parts, never from UTC', () => {
  // 1 January 2027, 00:30 LOCAL. In any timezone east of Greenwich the UTC
  // instant is still 31 December — the shift that would show yesterday's
  // planned day (or none at all) for part of every day.
  const local = new Date(2027, 0, 1, 0, 30, 0);
  assert.equal(localIsoDate(local), '2027-01-01');
  // 31 December 23:30 local is still 31 December, whatever UTC says.
  assert.equal(localIsoDate(new Date(2026, 11, 31, 23, 30, 0)), '2026-12-31');
  // Zero-padding and month boundaries.
  assert.equal(localIsoDate(new Date(2026, 8, 3, 12, 0, 0)), '2026-09-03');
  assert.equal(localIsoDate(new Date(2026, 1, 28, 23, 59, 59)), '2026-02-28');
  assert.equal(localIsoDate(new Date(2028, 1, 29, 0, 0, 0)), '2028-02-29', 'a leap day');
  assert.equal(localIsoDate('2026-09-03'), null, 'only a Date is accepted');
  assert.equal(localIsoDate(new Date(NaN)), null);
});

test('the same instant resolves to the DEVICE’s calendar day in every timezone', () => {
  const original = process.env.TZ;
  const days = build(planFrom(START));
  try {
    for (const [tz, hour] of [
      ['Pacific/Kiritimati', 0], // UTC+14
      ['Europe/Stockholm', 12], // the trail's own timezone
      ['Pacific/Midway', 23], // UTC-11
      ['UTC', 3],
    ]) {
      process.env.TZ = tz;
      // Built from LOCAL parts, so this is 5 September wherever the device is.
      const today = localIsoDate(new Date(2026, 8, 5, hour, 0, 0));
      assert.equal(today, '2026-09-05', `${tz} reports its own calendar day`);
      assert.equal(resolveEffectiveToday(days, null, null, today).day.number, 3, tz);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('comparison is string equality over YYYY-MM-DD — no Date objects involved', () => {
  const src = readFileSync(join(ROOT, 'src/plan/effectiveToday.mjs'), 'utf8');
  assert.ok(!/new Date|getTime|toISOString|Date\.now/.test(src), 'no instant arithmetic');
  assert.match(src, /d\.date === iso/);
  // Only a REAL calendar day can match, so a malformed clock read matches
  // nothing rather than a day whose date happens to be the same string.
  const days = build(planFrom(START));
  for (const bad of ['2026-09-31', '2026-9-5', 'today', '', null, undefined, 20260905]) {
    assert.equal(plannedDayForDate(days, bad), null, `${String(bad)} matches nothing`);
    assert.equal(resolveEffectiveToday(days, null, null, bad).source, 'generic');
  }
  assert.equal(toIsoDate(2026, 9, 5), '2026-09-05');
});

// ---- Travel matching does not steer the resolution --------------------------

test('Trip movements never influence which day is Today', () => {
  const trip = [
    {
      id: 'trip_bus',
      kind: 'transport',
      title: 'Bus to Abisko',
      status: 'confirmed',
      mode: 'bus',
      from: 'Kiruna',
      to: 'Abisko',
      date: '2026-08-20', // outside the plan entirely
      departureTime: '13:40',
      attachmentIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const records = insertDay(defaultDays(STAGES.length), 0, ['travel']);
  const days = build(planFrom(START, records), trip);
  // The travel day (3 Sep) shows nothing for 20 August...
  assert.deepEqual(days[0].travelItems, [], 'matched by date only');
  // ...and a trip item dated today does not pull Today into the plan.
  assert.equal(resolveEffectiveToday(days, null, null, '2026-08-20').source, 'generic');
});

test('a travel day DOES show the movements recorded for its own date', () => {
  const trip = [
    {
      id: 'trip_bus',
      kind: 'transport',
      title: 'Bus to Abisko',
      status: 'confirmed',
      mode: 'bus',
      from: 'Kiruna',
      to: 'Abisko',
      date: START,
      departureTime: '13:40',
      attachmentIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const records = insertDay(defaultDays(STAGES.length), 0, ['travel']);
  const days = build(planFrom(START, records), trip);
  assert.equal(days[0].kinds[0], 'travel');
  assert.deepEqual(
    days[0].travelItems.map((i) => i.id),
    ['trip_bus'],
  );
  // And that day is what Today resolves to on that date — by DATE, not
  // because a trip item exists.
  assert.equal(resolveEffectiveToday(days, null, null, START).day.id, days[0].id);
});

// ---- The contract itself ----------------------------------------------------

test('there are exactly four outcomes, and none of them is an empty Today', () => {
  assert.deepEqual(TODAY_SOURCES, ['preview', 'override', 'date', 'generic']);
});

// ---- Transient planned-day preview ------------------------------------------
//
// Precedence 1: presentation only. The pointer lives in runtime memory (see
// the store contracts in day-plan-store.test.mjs); here we fix what the pure
// resolution does with it.

test('a valid preview outranks the override AND the date match', () => {
  const records = defaultDays(STAGES.length);
  const overridden = records[1];
  const previewed = records[5];
  const days = build(planFrom(START, records, overridden.id));
  // Today's date matches day 1, an override points at day 2 — the preview
  // still shows day 6, and says it is a preview.
  const r = resolveEffectiveToday(days, previewed.id, overridden.id, START);
  assert.equal(r.source, 'preview');
  assert.equal(r.day.id, previewed.id);
  assert.equal(r.day.number, 6);
});

test('exiting preview (null) reveals override, then date, then generic', () => {
  const records = defaultDays(STAGES.length);
  const overridden = records[1];
  const days = build(planFrom(START, records, overridden.id));
  // With the override: it wins after the preview ends.
  assert.equal(resolveEffectiveToday(days, null, overridden.id, START).source, 'override');
  // Without it, on a matching date: the date answers.
  assert.equal(resolveEffectiveToday(days, null, null, START).source, 'date');
  // Outside the plan: generic — never blank.
  const generic = resolveEffectiveToday(days, null, null, '2030-01-01');
  assert.equal(generic.day, null);
  assert.equal(generic.source, 'generic');
});

test('a dangling or malformed preview id falls through, never blanks', () => {
  const records = defaultDays(STAGES.length);
  const days = build(planFrom(START, records, records[2].id));
  for (const bad of ['day_deleted_by_edit', '', 0, {}, [], true, undefined, null]) {
    const r = resolveEffectiveToday(days, bad, records[2].id, START);
    assert.equal(r.source, 'override', `${String(bad)} falls through to the override`);
    assert.equal(r.day.id, records[2].id);
  }
  // ...and with nothing underneath, to the date, then generic.
  assert.equal(resolveEffectiveToday(days, 'day_gone', null, START).source, 'date');
  assert.equal(resolveEffectiveToday(days, 'day_gone', null, '2030-01-01').source, 'generic');
});

test('a preview never depends on the clock — it works on any date', () => {
  const records = defaultDays(STAGES.length);
  const days = build(planFrom(START, records));
  const target = records[3];
  for (const today of [START, '2026-08-01', '2030-01-01', null, 'not-a-date']) {
    const r = resolveEffectiveToday(days, target.id, null, today);
    assert.equal(r.source, 'preview', `previews on ${String(today)}`);
    assert.equal(r.day.id, target.id);
  }
});

test('with no plan a preview id resolves to the generic Today', () => {
  assert.deepEqual(resolveEffectiveToday(build(null), 'day_x', null, START), {
    day: null,
    source: 'generic',
  });
  assert.deepEqual(resolveEffectiveToday([], 'day_x', 'day_y', START), {
    day: null,
    source: 'generic',
  });
});

// ---- Clearing an override (the `Follow plan dates` action) ------------------
//
// The store action nulls `currentDayId` and nothing else; these fix what the
// resolution must then do. Pure and clock-injected, so "offline" is trivially
// covered: nothing here (or in the store action) touches the network.

test('clearing an override on a matching date returns Today to that date', () => {
  const records = defaultDays(STAGES.length);
  const chosen = records[5];
  const days = build(planFrom(START, records, chosen.id));
  // Overridden: day 6 shows even though the date says day 2.
  assert.equal(resolveEffectiveToday(days, null, chosen.id, '2026-09-04').day.number, 6);
  // Cleared: the same derived days, pointer null → the date answers again.
  const cleared = resolveEffectiveToday(days, null, null, '2026-09-04');
  assert.equal(cleared.source, 'date');
  assert.equal(cleared.day.number, 2);
});

test('clearing an override outside the plan range falls back to generic', () => {
  const records = defaultDays(STAGES.length);
  const chosen = records[3];
  const days = build(planFrom(START, records, chosen.id));
  assert.equal(resolveEffectiveToday(days, null, chosen.id, '2026-10-20').source, 'override');
  const cleared = resolveEffectiveToday(days, null, null, '2026-10-20');
  assert.equal(cleared.day, null);
  assert.equal(cleared.source, 'generic', 'never an empty planned Today after clearing');
});

test('with no override there is nothing to clear — and no-plan mode never resolves one', () => {
  const days = build(planFrom(START));
  // currentDayId null: the source is 'date' or 'generic', never 'override' —
  // which is exactly the gate the Today affordance renders behind.
  assert.equal(resolveEffectiveToday(days, null, null, START).source, 'date');
  assert.equal(resolveEffectiveToday(days, null, null, '2030-01-01').source, 'generic');
  // No plan at all: always generic, so the affordance is unreachable.
  assert.equal(resolveEffectiveToday(build(null), null, null, START).source, 'generic');
});
