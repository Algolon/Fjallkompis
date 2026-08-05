/**
 * CHARACTERIZATION — the three progress pointers.
 *
 * `currentStageId` (where the user is on the route), `dayPlan.currentDayId`
 * (which calendar day that is) and `dayPlan.currentLegId` (which hiking
 * occurrence within it) are the only pointers that say "this is where I am".
 * vNext moves the CONTROLS that write them — Set as current, occurrence
 * selection, Follow plan dates — from Stages onto Today, so the rules the
 * pointers obey have to be pinned before the buttons move.
 *
 * SCOPE — and one foundation blocker.
 * The composition of those rules lives in three React `useCallback` closures
 * inside src/store/AppStore.tsx (`setCurrentStage`, `setCurrentLeg`,
 * `followPlanDates`). A .tsx module cannot be imported by `node --test`, and
 * this PR does not modify src/, so those closures stay covered only by the
 * existing source-text fences in tests/day-plan-store.test.mjs. See the PR
 * description: FOUNDATION BLOCKER — the smallest fix is to lift the three
 * updaters into a pure `src/plan/progressPointers.mjs` taking
 * (state, selection) and returning the next pointer triple, which the store
 * then only wires up.
 *
 * What IS pinned here, behaviourally, is every decision the store composes:
 *
 *   - `stageOccurrences` — the 0 / 1 / many answer the stage branch reads;
 *   - `hikingLegsOf`     — the leg lookup the occurrence branch reads;
 *   - `pointersAfterEdit`— the shared survival rule for the pointer pair;
 *   - `normalizeDayPlan` — the same honesty enforced at the persistence
 *                          boundary, which is where a half-written pair
 *                          would actually become visible to the user;
 *   - `buildPlannedDays` — what a written pair then MEANS on screen.
 *
 * Regressions this catches: a first-match occurrence pick when a stage is
 * walked twice; occurrences returned out of walking order; a leg pointer that
 * survives its day (or arrives without one); a day pointer that migrates to a
 * neighbouring day instead of clearing; a stale pointer that starts being
 * honoured after a reload; and any change to which derived day/leg a pointer
 * pair marks current.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hikingLegsOf,
  normalizeDayPlan,
  pointersAfterEdit,
  stageOccurrences,
} from '../src/plan/dayPlan.mjs';
import { buildPlannedDays, currentLegIndex, plannedDaysForStage } from '../src/plan/plannedDays.mjs';
import { resolveEffectiveToday } from '../src/plan/effectiveToday.mjs';

// ---- Fixtures ---------------------------------------------------------------

/** The canonical Kungsleden topology, as src/utils/storage.ts supplies it. */
const TOPOLOGY = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

const leg = (id, stageId, orientation = 'canonical') => ({
  id,
  kind: 'canonical-stage',
  stageId,
  orientation,
});

const hiking = (...legs) => ({ kind: 'hiking', legs });

/**
 * A journey that exercises all three occurrence situations at once:
 *
 *   day_1  travel                       — no walking at all
 *   day_2  hiking d1 + d2               — a combined day; d1 walked ONCE
 *   day_3  rest
 *   day_4  hiking d3, then d3 back      — an out-and-back: TWO occurrences
 *                                         of the same stage in ONE day
 *   day_5  hiking d3 (again) + travel   — and a third, on another day
 *
 * d5..d7 are planned nowhere: the zero-occurrence case.
 */
const DAYS = [
  { id: 'day_1', activities: [{ kind: 'travel' }] },
  { id: 'day_2', activities: [hiking(leg('leg_2a', 'd1'), leg('leg_2b', 'd2'))] },
  { id: 'day_3', activities: [{ kind: 'rest' }] },
  {
    id: 'day_4',
    activities: [hiking(leg('leg_4a', 'd3'), leg('leg_4b', 'd3', 'opposite'))],
    overnight: { kind: 'stop', stopId: 'alesjaure' },
  },
  { id: 'day_5', activities: [hiking(leg('leg_5a', 'd3')), { kind: 'travel' }] },
];

const planWith = (currentDayId, currentLegId, days = DAYS) => ({
  direction: 'abisko-to-nikkaluokta',
  startDate: '2026-09-03',
  journeyActive: true,
  currentDayId,
  currentLegId,
  days: structuredClone(days),
});

/** A minimal oriented stage view — everything `buildPlannedDays` reads. */
const stageView = (id, fromHutId, toHutId) => ({
  id,
  fromHutId,
  toHutId,
  distanceKm: 12,
  estimatedHours: 4,
  totalAscentM: 300,
  totalDescentM: 250,
  minimumElevationM: 400,
  maximumElevationM: 900,
  points: [{ cumulativeDistanceKm: 0 }, { cumulativeDistanceKm: 12 }],
  elevationProfile: [
    { distanceKm: 0, elevationM: 400, lat: 68.3, lon: 18.8 },
    { distanceKm: 12, elevationM: 900, lat: 68.2, lon: 18.9 },
  ],
});

const ORIENTED = {
  canonical: Object.fromEntries(
    TOPOLOGY.map((s) => [s.id, stageView(s.id, s.fromStopId, s.toStopId)]),
  ),
  opposite: Object.fromEntries(
    TOPOLOGY.map((s) => [s.id, stageView(s.id, s.toStopId, s.fromStopId)]),
  ),
};

/** Derived days with the current-flags stripped, for "nothing else moved". */
const withoutFlags = (days) =>
  days.map((d) => {
    const { isCurrent, legs, ...rest } = d;
    void isCurrent;
    return { ...rest, legs: legs.map(({ isCurrent: _flag, ...l }) => l) };
  });

// ---- stageOccurrences: the 0 / 1 / many answer ------------------------------

test('a stage planned exactly once yields exactly one occurrence', () => {
  assert.deepEqual(stageOccurrences(DAYS, 'd1'), [{ dayId: 'day_2', legId: 'leg_2a' }]);
  assert.deepEqual(stageOccurrences(DAYS, 'd2'), [{ dayId: 'day_2', legId: 'leg_2b' }]);
});

test('a stage planned on no day yields none — the "not in the plan" case', () => {
  for (const stageId of ['d5', 'd6', 'd7']) {
    assert.deepEqual(stageOccurrences(DAYS, stageId), [], stageId);
  }
});

test('an ambiguous stage yields EVERY occurrence, in day then leg order', () => {
  // d3 is walked twice on day_4 (an out-and-back) and once more on day_5.
  // Any caller taking [0] would silently pick the first of three.
  assert.deepEqual(stageOccurrences(DAYS, 'd3'), [
    { dayId: 'day_4', legId: 'leg_4a' },
    { dayId: 'day_4', legId: 'leg_4b' },
    { dayId: 'day_5', legId: 'leg_5a' },
  ]);
});

test('occurrence order follows the plan, not the array the caller happens to hold', () => {
  const reordered = [DAYS[4], DAYS[3], DAYS[1]];
  assert.deepEqual(stageOccurrences(reordered, 'd3'), [
    { dayId: 'day_5', legId: 'leg_5a' },
    { dayId: 'day_4', legId: 'leg_4a' },
    { dayId: 'day_4', legId: 'leg_4b' },
  ]);
});

test('travel and rest days contribute no occurrences and never crash the scan', () => {
  const onlyTravelAndRest = [DAYS[0], DAYS[2]];
  assert.deepEqual(stageOccurrences(onlyTravelAndRest, 'd1'), []);
  for (const bad of [null, undefined, 'days', 42, {}]) {
    assert.deepEqual(stageOccurrences(bad, 'd1'), [], `days=${String(bad)}`);
  }
  for (const bad of [null, undefined, 42, {}, ['d1']]) {
    assert.deepEqual(stageOccurrences(DAYS, bad), [], `stageId=${String(bad)}`);
  }
  assert.deepEqual(stageOccurrences(DAYS, ''), [], 'an empty id matches nothing');
});

test('scanning for occurrences never touches the plan', () => {
  const days = structuredClone(DAYS);
  const before = JSON.stringify(days);
  stageOccurrences(days, 'd3');
  stageOccurrences(days, 'd7');
  assert.equal(JSON.stringify(days), before);
});

// ---- hikingLegsOf: the occurrence lookup ------------------------------------

test('a day exposes its own legs in walking order, and only its own', () => {
  assert.deepEqual(hikingLegsOf(DAYS[1]).map((l) => l.id), ['leg_2a', 'leg_2b']);
  assert.deepEqual(hikingLegsOf(DAYS[3]).map((l) => l.id), ['leg_4a', 'leg_4b']);
  // The lookup a leg selection performs: a leg id from ANOTHER day is simply
  // not found here, which is what makes an unknown (day, leg) pair a no-op.
  assert.equal(hikingLegsOf(DAYS[1]).find((l) => l.id === 'leg_4a'), undefined);
});

test('days that do not walk have no legs at all — never a synthesised one', () => {
  assert.deepEqual(hikingLegsOf(DAYS[0]), [], 'travel');
  assert.deepEqual(hikingLegsOf(DAYS[2]), [], 'rest');
  for (const bad of [null, undefined, {}, { activities: null }, { activities: [] }]) {
    assert.deepEqual(hikingLegsOf(bad), [], String(bad));
  }
});

test('a mixed hiking+travel day still exposes its walking', () => {
  assert.deepEqual(hikingLegsOf(DAYS[4]).map((l) => l.id), ['leg_5a']);
});

// ---- pointersAfterEdit: the shared survival rule ----------------------------

test('an untouched day and leg both survive an edit', () => {
  assert.deepEqual(pointersAfterEdit(DAYS, 'day_4', 'leg_4b'), {
    currentDayId: 'day_4',
    currentLegId: 'leg_4b',
  });
});

test('a removed day degrades to NO day — never to a neighbour', () => {
  const withoutDay4 = DAYS.filter((d) => d.id !== 'day_4');
  assert.deepEqual(pointersAfterEdit(withoutDay4, 'day_4', 'leg_4a'), {
    currentDayId: null,
    currentLegId: null,
  });
});

test('a leg removed from the surviving day clears ONLY the leg pointer', () => {
  const shortened = DAYS.map((d) =>
    d.id === 'day_4' ? { ...d, activities: [hiking(leg('leg_4a', 'd3'))] } : d,
  );
  assert.deepEqual(pointersAfterEdit(shortened, 'day_4', 'leg_4b'), {
    currentDayId: 'day_4',
    currentLegId: null,
  });
});

test('a leg belonging to a DIFFERENT day is not honoured on this one', () => {
  assert.deepEqual(pointersAfterEdit(DAYS, 'day_2', 'leg_4a'), {
    currentDayId: 'day_2',
    currentLegId: null,
  });
});

test('a leg pointer can never arrive without its day', () => {
  // Every malformed combination collapses to the empty pair — the invariant
  // that stops a half-written pointer pair from reaching a screen.
  const cases = [
    [DAYS, null, 'leg_4a'],
    [DAYS, undefined, 'leg_4a'],
    [DAYS, 'day_gone', 'leg_4a'],
    [DAYS, '', 'leg_4a'],
    [null, 'day_4', 'leg_4a'],
    ['nope', 'day_4', 'leg_4a'],
  ];
  for (const [days, dayId, legId] of cases) {
    const result = pointersAfterEdit(days, dayId, legId);
    assert.deepEqual(result, { currentDayId: null, currentLegId: null }, JSON.stringify([dayId, legId]));
  }
  // And the reverse never happens either: a surviving day may carry a null
  // leg, but no result ever carries a leg with a null day.
  for (const [days, dayId, legId] of [...cases, [DAYS, 'day_2', 'leg_4a'], [DAYS, 'day_1', null]]) {
    const result = pointersAfterEdit(days, dayId, legId);
    assert.ok(
      !(result.currentLegId != null && result.currentDayId == null),
      'a leg without a day is never produced',
    );
  }
});

test('a day that does not walk keeps its pointer and carries no leg', () => {
  assert.deepEqual(pointersAfterEdit(DAYS, 'day_1', 'leg_2a'), {
    currentDayId: 'day_1',
    currentLegId: null,
  });
  assert.deepEqual(pointersAfterEdit(DAYS, 'day_3', null), {
    currentDayId: 'day_3',
    currentLegId: null,
  });
});

test('repairing pointers never rewrites the day list it was given', () => {
  const days = structuredClone(DAYS);
  const before = JSON.stringify(days);
  pointersAfterEdit(days, 'day_4', 'leg_4b');
  pointersAfterEdit(days, 'day_gone', 'leg_gone');
  assert.equal(JSON.stringify(days), before);
});

// ---- The same honesty at the persistence boundary ---------------------------

const normalized = (currentDayId, currentLegId, days) =>
  normalizeDayPlan(planWith(currentDayId, currentLegId, days), 'abisko-to-nikkaluokta', TOPOLOGY);

test('a consistent pointer pair survives a reload intact', () => {
  const plan = normalized('day_4', 'leg_4b');
  assert.equal(plan.currentDayId, 'day_4');
  assert.equal(plan.currentLegId, 'leg_4b');
  assert.equal(plan.journeyActive, true);
  assert.equal(plan.days.length, 5, 'the plan itself is untouched');
});

test('a stale leg pointer is dropped on load while the plan is kept', () => {
  const otherDay = normalized('day_2', 'leg_4a');
  assert.equal(otherDay.currentDayId, 'day_2', 'the day pointer is still valid');
  assert.equal(otherDay.currentLegId, null, 'the leg is not this day’s');
  assert.equal(otherDay.days.length, 5, 'nothing about the plan is discarded');
});

test('a stale DAY pointer takes the leg pointer down with it', () => {
  const gone = normalized('day_gone', 'leg_4a');
  assert.equal(gone.currentDayId, null);
  assert.equal(gone.currentLegId, null);
  assert.equal(gone.days.length, 5);
});

test('no malformed pointer pair can load as a leg without a day', () => {
  const values = [null, undefined, '', 'day_4', 'day_gone', 42, {}];
  for (const dayId of values) {
    for (const legId of values) {
      const plan = normalized(dayId, legId);
      assert.ok(plan, `plan kept for ${String(dayId)}/${String(legId)}`);
      assert.ok(
        !(plan.currentLegId != null && plan.currentDayId == null),
        `leg without day for ${String(dayId)}/${String(legId)}`,
      );
      assert.ok(
        plan.currentDayId === null || typeof plan.currentDayId === 'string',
        'the day pointer is an id or nothing',
      );
    }
  }
});

test('journeyActive is strict on load: only an exact true activates the pointers', () => {
  const active = normalizeDayPlan(
    { ...planWith('day_4', 'leg_4b'), journeyActive: true },
    'abisko-to-nikkaluokta',
    TOPOLOGY,
  );
  assert.equal(active.journeyActive, true);
  for (const raw of [false, undefined, null, 'true', 1, {}]) {
    const plan = normalizeDayPlan(
      { ...planWith('day_4', 'leg_4b'), journeyActive: raw },
      'abisko-to-nikkaluokta',
      TOPOLOGY,
    );
    assert.equal(plan.journeyActive, false, String(raw));
    // The pointers are still PERSISTED — they are inert, not erased, so
    // turning the journey back on is not a data loss either way.
    assert.equal(plan.currentDayId, 'day_4');
    assert.equal(plan.currentLegId, 'leg_4b');
  }
});

test('an inert pointer pair really is inert for Today', () => {
  const plan = normalizeDayPlan(
    { ...planWith('day_4', 'leg_4b'), journeyActive: false },
    'abisko-to-nikkaluokta',
    TOPOLOGY,
  );
  const days = buildPlannedDays(ORIENTED, plan, []);
  const result = resolveEffectiveToday(days, null, plan.journeyActive, plan.currentDayId, '2026-09-06', 'd3');
  assert.equal(result.source, 'generic');
  assert.equal(result.day, null);
  // …while the derived days still carry the flags, so turning the journey on
  // restores exactly the previous selection rather than a fresh guess.
  assert.equal(days[3].isCurrent, true);
  assert.equal(currentLegIndex(days[3]), 1);
});

// ---- What a written pair MEANS on screen ------------------------------------

test('a one-occurrence selection lands on exactly that day and that leg', () => {
  // The store's single-occurrence branch writes all three pointers from the
  // one occurrence; this is what the user then sees.
  const [only] = stageOccurrences(DAYS, 'd1');
  const days = buildPlannedDays(ORIENTED, planWith(only.dayId, only.legId), []);
  assert.equal(days[1].isCurrent, true);
  assert.equal(currentLegIndex(days[1]), 0);
  assert.deepEqual(days.filter((d) => d.isCurrent).map((d) => d.id), ['day_2']);
});

test('an ambiguous selection leaves the day standing with NO current leg', () => {
  // The store's many-occurrence branch keeps `currentDayId` and clears
  // `currentLegId`; nothing about the plan is otherwise disturbed, and both
  // occurrences of the ambiguous stage stay visible for the user to choose.
  const withLeg = buildPlannedDays(ORIENTED, planWith('day_4', 'leg_4b'), []);
  const cleared = buildPlannedDays(ORIENTED, planWith('day_4', null), []);
  assert.equal(cleared[3].isCurrent, true);
  assert.equal(currentLegIndex(cleared[3]), -1);
  assert.ok(cleared.every((d) => d.legs.every((l) => l.isCurrent === false)));
  assert.deepEqual(withoutFlags(cleared), withoutFlags(withLeg), 'only the flags differ');
  assert.deepEqual(
    plannedDaysForStage(cleared, 'd3').map((d) => d.id),
    ['day_4', 'day_5'],
    'every occurrence of the ambiguous stage is still there to choose from',
  );
});

test('clearing the pair is what makes Today follow its dates again', () => {
  // The observable effect of Follow plan dates: with the override in place
  // Today is the pointed-at day; with the pair cleared the same input
  // resolves from the calendar — and the plan itself is byte-identical.
  const overridden = buildPlannedDays(ORIENTED, planWith('day_1', null), []);
  const following = buildPlannedDays(ORIENTED, planWith(null, null), []);

  const withOverride = resolveEffectiveToday(overridden, null, true, 'day_1', '2026-09-06', 'd3');
  assert.equal(withOverride.source, 'manual');
  assert.equal(withOverride.dayId, 'day_1');

  const afterClear = resolveEffectiveToday(following, null, true, null, '2026-09-06', 'd3');
  assert.equal(afterClear.source, 'date');
  assert.equal(afterClear.dayId, 'day_4', '2026-09-06 is the fourth planned day');

  assert.deepEqual(withoutFlags(following), withoutFlags(overridden), 'the plan is untouched');
  assert.ok(following.every((d) => d.isCurrent === false));
});

test('clearing the pair leaves route progress alone — it is a separate pointer', () => {
  // `currentStageId` is not part of the pair and is never carried in the
  // plan: it survives every pointer change, and shows up in the generic
  // resolution unchanged.
  const following = buildPlannedDays(ORIENTED, planWith(null, null), []);
  const plan = normalized(null, null);
  assert.ok(!('currentStageId' in plan), 'route progress is not a plan field');
  const generic = resolveEffectiveToday(following, null, false, null, '2026-09-06', 'd5');
  assert.equal(generic.stageId, 'd5');
});
