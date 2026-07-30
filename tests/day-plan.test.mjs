/**
 * The pure Hiking days model (src/plan/dayPlan.mjs) — the exact module the app
 * runs. These tests fence the product invariants that make the feature safe:
 * a plan is a PARTITION of the canonical ordered stage sequence, so skipped,
 * duplicated, reordered and empty days are structurally unrepresentable.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundaryStates,
  combineAt,
  createDayPlan,
  dateForDayIndex,
  dayIndexForStageIndex,
  defaultGroups,
  firstStageIndexOfDay,
  groupsTotal,
  isDefaultGrouping,
  isValidGroups,
  normalizeDayPlan,
  splitAt,
  toggleBoundary,
} from '../src/plan/dayPlan.mjs';
import { DEFAULT_DIRECTION, REVERSE_DIRECTION } from '../src/route/direction.mjs';

const FORWARD = DEFAULT_DIRECTION;
const REVERSE = REVERSE_DIRECTION;

// ---- Default groups --------------------------------------------------------

test('defaultGroups uses the ACTUAL stage count, never a hardcoded seven', () => {
  assert.deepEqual(defaultGroups(7), [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(defaultGroups(1), [1]);
  assert.deepEqual(defaultGroups(2), [1, 1]);
  assert.deepEqual(defaultGroups(12), new Array(12).fill(1));
});

test('defaultGroups rejects impossible stage counts', () => {
  for (const bad of [0, -3, 2.5, NaN, Infinity, '7', null, undefined]) {
    assert.deepEqual(defaultGroups(bad), [], `stageCount ${String(bad)}`);
  }
});

// ---- Validation ------------------------------------------------------------

test('valid groups partition the stage count exactly', () => {
  assert.equal(isValidGroups([1, 1, 1, 1, 1, 1, 1], 7), true);
  assert.equal(isValidGroups([1, 2, 1, 1, 1, 1], 7), true);
  assert.equal(isValidGroups([7], 7), true);
  assert.equal(isValidGroups([3, 4], 7), true);
});

test('groups summing to the wrong total are invalid (no stage skipped or duplicated)', () => {
  assert.equal(isValidGroups([1, 1, 1, 1, 1, 1], 7), false); // one stage short
  assert.equal(isValidGroups([1, 1, 1, 1, 1, 1, 1, 1], 7), false); // one too many
  assert.equal(isValidGroups([8], 7), false);
});

test('zero, negative, fractional and non-number groups are invalid (no empty days)', () => {
  assert.equal(isValidGroups([0, 7], 7), false);
  assert.equal(isValidGroups([-1, 8], 7), false);
  assert.equal(isValidGroups([1.5, 5.5], 7), false);
  assert.equal(isValidGroups(['1', 6], 7), false);
  assert.equal(isValidGroups([NaN, 7], 7), false);
  assert.equal(isValidGroups([Infinity], 7), false);
  assert.equal(isValidGroups([null, 7], 7), false);
});

test('malformed containers and impossible stage counts are invalid', () => {
  assert.equal(isValidGroups([], 7), false);
  assert.equal(isValidGroups(null, 7), false);
  assert.equal(isValidGroups('1,1,1', 7), false);
  assert.equal(isValidGroups({ 0: 7 }, 7), false);
  assert.equal(isValidGroups([1], 0), false);
});

test('groupsTotal sums integers and reports NaN for malformed entries', () => {
  assert.equal(groupsTotal([1, 2, 1]), 4);
  assert.equal(groupsTotal([]), 0);
  assert.equal(groupsTotal('nope'), 0);
  assert.ok(Number.isNaN(groupsTotal([1, 1.5])));
});

test('isDefaultGrouping is true only for one stage per day', () => {
  assert.equal(isDefaultGrouping([1, 1, 1, 1, 1, 1, 1], 7), true);
  assert.equal(isDefaultGrouping([1, 2, 1, 1, 1, 1], 7), false);
  assert.equal(isDefaultGrouping([1, 1, 1, 1, 1, 1], 7), false); // invalid sum
});

// ---- Day / stage index maths ----------------------------------------------

test('dayIndexForStageIndex maps every stage to exactly one day', () => {
  const groups = [1, 2, 1, 3]; // 7 stages over 4 days
  assert.equal(dayIndexForStageIndex(groups, 0), 0);
  assert.equal(dayIndexForStageIndex(groups, 1), 1);
  assert.equal(dayIndexForStageIndex(groups, 2), 1);
  assert.equal(dayIndexForStageIndex(groups, 3), 2);
  assert.equal(dayIndexForStageIndex(groups, 4), 3);
  assert.equal(dayIndexForStageIndex(groups, 5), 3);
  assert.equal(dayIndexForStageIndex(groups, 6), 3);
});

test('dayIndexForStageIndex reports -1 outside the plan', () => {
  assert.equal(dayIndexForStageIndex([1, 2, 1], -1), -1);
  assert.equal(dayIndexForStageIndex([1, 2, 1], 4), -1);
  assert.equal(dayIndexForStageIndex([1, 2, 1], 1.5), -1);
  assert.equal(dayIndexForStageIndex(null, 0), -1);
});

test('firstStageIndexOfDay returns the day’s opening stage', () => {
  const groups = [1, 2, 1, 3];
  assert.equal(firstStageIndexOfDay(groups, 0), 0);
  assert.equal(firstStageIndexOfDay(groups, 1), 1);
  assert.equal(firstStageIndexOfDay(groups, 2), 3);
  assert.equal(firstStageIndexOfDay(groups, 3), 4);
  assert.equal(firstStageIndexOfDay(groups, 4), -1);
  assert.equal(firstStageIndexOfDay(groups, -1), -1);
});

// ---- Boundaries ------------------------------------------------------------

test('there is exactly one boundary per stage junction', () => {
  assert.equal(boundaryStates(defaultGroups(7)).length, 6);
  assert.equal(boundaryStates([1, 2, 1, 1, 1, 1]).length, 6);
  assert.equal(boundaryStates([7]).length, 6);
  assert.equal(boundaryStates([1]).length, 0); // a single stage has no junction
  assert.equal(boundaryStates([]).length, 0);
});

test('boundary states describe where days end', () => {
  const states = boundaryStates([1, 2, 1]); // 4 stages, 3 days
  assert.deepEqual(states, [
    { stageIndex: 0, active: true, dayIndex: 0 },
    { stageIndex: 1, active: false, dayIndex: 1 },
    { stageIndex: 2, active: true, dayIndex: 1 },
  ]);
});

test('the default plan has every boundary active; one big day has none', () => {
  assert.ok(boundaryStates(defaultGroups(7)).every((b) => b.active));
  assert.ok(boundaryStates([7]).every((b) => !b.active));
});

test('combine and split are exact inverses at every boundary', () => {
  const base = defaultGroups(7);
  for (let i = 0; i < 6; i++) {
    const combined = combineAt(base, i);
    assert.equal(combined.length, 6, `boundary ${i} combines two days`);
    assert.deepEqual(splitAt(combined, i), base, `boundary ${i} splits back`);
  }
});

test('toggleBoundary round-trips through combine and split', () => {
  const base = defaultGroups(7);
  for (let i = 0; i < 6; i++) {
    const once = toggleBoundary(base, i);
    assert.notDeepEqual(once, base);
    assert.deepEqual(toggleBoundary(once, i), base, `boundary ${i} round-trip`);
  }
});

test('the first and last internal boundaries behave like every other one', () => {
  const base = defaultGroups(7);
  assert.deepEqual(combineAt(base, 0), [2, 1, 1, 1, 1, 1]);
  assert.deepEqual(combineAt(base, 5), [1, 1, 1, 1, 1, 2]);
  assert.deepEqual(splitAt(combineAt(base, 0), 0), base);
  assert.deepEqual(splitAt(combineAt(base, 5), 5), base);
});

test('splitting inside a three-stage day cuts at the chosen junction only', () => {
  const groups = [3, 1]; // stages 0,1,2 on day 1; stage 3 on day 2
  assert.deepEqual(splitAt(groups, 0), [1, 2, 1]);
  assert.deepEqual(splitAt(groups, 1), [2, 1, 1]);
});

test('toggling out-of-range or already-applied boundaries is a safe no-op', () => {
  const groups = [1, 2, 1];
  assert.deepEqual(combineAt(groups, 1), groups); // already combined
  assert.deepEqual(splitAt(groups, 0), groups); // already split
  assert.deepEqual(toggleBoundary(groups, 99), groups);
  assert.deepEqual(toggleBoundary(groups, -1), groups);
  assert.deepEqual(toggleBoundary(null, 0), []);
});

test('repeated toggling in any order always preserves the partition sum', () => {
  const stageCount = 7;
  let groups = defaultGroups(stageCount);
  const script = [0, 3, 3, 1, 5, 2, 2, 4, 0, 1, 5, 4, 3, 0];
  for (const boundary of script) {
    groups = toggleBoundary(groups, boundary);
    assert.equal(groupsTotal(groups), stageCount, `sum after toggling ${boundary}`);
    assert.ok(
      isValidGroups(groups, stageCount),
      `groups stay a valid partition after toggling ${boundary}`,
    );
  }
});

test('every stage still appears exactly once after arbitrary toggling', () => {
  const stageCount = 7;
  let groups = defaultGroups(stageCount);
  for (const boundary of [1, 2, 4, 0, 5, 2]) groups = toggleBoundary(groups, boundary);
  const seen = [];
  for (let stage = 0; stage < stageCount; stage++) {
    const day = dayIndexForStageIndex(groups, stage);
    assert.ok(day >= 0 && day < groups.length);
    seen.push(day);
  }
  // Day indices are non-decreasing (order preserved) and cover every day.
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
  assert.deepEqual([...new Set(seen)], groups.map((_, i) => i));
});

test('a one-stage itinerary has one day and no boundaries', () => {
  const groups = defaultGroups(1);
  assert.deepEqual(groups, [1]);
  assert.deepEqual(boundaryStates(groups), []);
  assert.deepEqual(toggleBoundary(groups, 0), [1]);
});

test('a two-stage itinerary toggles between two days and one', () => {
  const groups = defaultGroups(2);
  assert.deepEqual(boundaryStates(groups), [{ stageIndex: 0, active: true, dayIndex: 0 }]);
  const combined = toggleBoundary(groups, 0);
  assert.deepEqual(combined, [2]);
  assert.deepEqual(toggleBoundary(combined, 0), [1, 1]);
});

test('boundary operations never mutate their input', () => {
  const groups = Object.freeze([1, 1, 1, 1, 1, 1, 1]);
  const snapshot = [...groups];
  combineAt(groups, 2);
  splitAt(combineAt(groups, 2), 2);
  toggleBoundary(groups, 4);
  boundaryStates(groups);
  assert.deepEqual(groups, snapshot);
});

// ---- Dates -----------------------------------------------------------------

test('dates run over consecutive hiking days from the first date', () => {
  assert.equal(dateForDayIndex('2026-09-03', 0), '2026-09-03');
  assert.equal(dateForDayIndex('2026-09-03', 1), '2026-09-04');
  assert.equal(dateForDayIndex('2026-09-03', 6), '2026-09-09');
});

test('dates cross month, year and leap-day boundaries correctly', () => {
  assert.equal(dateForDayIndex('2026-09-30', 1), '2026-10-01');
  assert.equal(dateForDayIndex('2026-08-31', 1), '2026-09-01');
  assert.equal(dateForDayIndex('2026-12-30', 3), '2027-01-02');
  assert.equal(dateForDayIndex('2028-02-28', 1), '2028-02-29'); // leap year
  assert.equal(dateForDayIndex('2028-02-28', 2), '2028-03-01');
  assert.equal(dateForDayIndex('2027-02-28', 1), '2027-03-01'); // non-leap
});

test('malformed and unreal first dates yield no date', () => {
  for (const bad of ['', 'tomorrow', '2026-13-01', '2027-02-29', '2026-9-3', null, 42]) {
    assert.equal(dateForDayIndex(bad, 0), null, `first date ${String(bad)}`);
  }
  assert.equal(dateForDayIndex('2026-09-03', -1), null);
  assert.equal(dateForDayIndex('2026-09-03', 1.5), null);
});

// ---- Creation --------------------------------------------------------------

test('createDayPlan builds a default plan for the active direction', () => {
  assert.deepEqual(createDayPlan(FORWARD, '2026-09-03', 7), {
    direction: FORWARD,
    firstDate: '2026-09-03',
    groups: [1, 1, 1, 1, 1, 1, 1],
  });
  assert.equal(createDayPlan(REVERSE, '2026-09-03', 3).direction, REVERSE);
  assert.deepEqual(createDayPlan(FORWARD, '2026-09-03', 3).groups, [1, 1, 1]);
});

test('createDayPlan refuses an unreal date or an impossible stage count', () => {
  assert.equal(createDayPlan(FORWARD, '2027-02-29', 7), null);
  assert.equal(createDayPlan(FORWARD, 'nope', 7), null);
  assert.equal(createDayPlan(FORWARD, '2026-09-03', 0), null);
});

test('an unknown direction falls back to the canonical one', () => {
  assert.equal(createDayPlan('sideways', '2026-09-03', 7).direction, FORWARD);
});

// ---- Normalisation / repair ------------------------------------------------

test('an absent or malformed plan normalises to null (no plan)', () => {
  for (const bad of [undefined, null, 'plan', 42, [], () => {}]) {
    assert.equal(normalizeDayPlan(bad, FORWARD, 7), null, String(bad));
  }
});

test('a valid same-direction plan survives verbatim', () => {
  const plan = { direction: FORWARD, firstDate: '2026-09-03', groups: [1, 2, 1, 1, 1, 1] };
  assert.deepEqual(normalizeDayPlan(plan, FORWARD, 7), plan);
});

test('an invalid or unreal first date discards the plan', () => {
  for (const bad of ['', '2027-02-29', '03-09-2026', null, 20260903]) {
    const plan = { direction: FORWARD, firstDate: bad, groups: defaultGroups(7) };
    assert.equal(normalizeDayPlan(plan, FORWARD, 7), null, String(bad));
  }
});

test('an unknown stored direction discards the plan', () => {
  const plan = { direction: 'sideways', firstDate: '2026-09-03', groups: defaultGroups(7) };
  assert.equal(normalizeDayPlan(plan, FORWARD, 7), null);
});

test('invalid groups keep the date and direction and reset to one stage per day', () => {
  for (const bad of [[1, 1, 1], [0, 7], [1, 1, 1, 1, 1, 1, 1, 1], 'x', null, [7.5]]) {
    const out = normalizeDayPlan(
      { direction: FORWARD, firstDate: '2026-09-03', groups: bad },
      FORWARD,
      7,
    );
    assert.deepEqual(out, {
      direction: FORWARD,
      firstDate: '2026-09-03',
      groups: defaultGroups(7),
    }, `groups ${JSON.stringify(bad)}`);
  }
});

test('a plan authored for the OTHER direction is never applied — groups reset', () => {
  const forwardPlan = {
    direction: FORWARD,
    firstDate: '2026-09-03',
    groups: [1, 2, 1, 1, 1, 1],
  };
  const out = normalizeDayPlan(forwardPlan, REVERSE, 7);
  assert.deepEqual(out, {
    direction: REVERSE,
    firstDate: '2026-09-03',
    groups: defaultGroups(7),
  });
  // The reverse of the grouping is deliberately NOT applied.
  assert.notDeepEqual(out.groups, [...forwardPlan.groups].reverse());
});

test('an unknown stage count cannot validate a plan, so it normalises to null', () => {
  const plan = { direction: FORWARD, firstDate: '2026-09-03', groups: defaultGroups(7) };
  assert.equal(normalizeDayPlan(plan, FORWARD, undefined), null);
  assert.equal(normalizeDayPlan(plan, FORWARD, 0), null);
});

test('normalisation is idempotent and never mutates its input', () => {
  const plan = Object.freeze({
    direction: FORWARD,
    firstDate: '2026-09-03',
    groups: Object.freeze([1, 2, 1, 1, 1, 1]),
  });
  const once = normalizeDayPlan(plan, FORWARD, 7);
  const twice = normalizeDayPlan(once, FORWARD, 7);
  assert.deepEqual(twice, once);
  assert.deepEqual(plan.groups, [1, 2, 1, 1, 1, 1]);
  // The repaired plan owns its own array (mutating it can't reach the input).
  once.groups.push(99);
  assert.deepEqual(plan.groups, [1, 2, 1, 1, 1, 1]);
});

test('unknown extra fields are dropped — the persisted shape stays three keys', () => {
  const out = normalizeDayPlan(
    {
      direction: FORWARD,
      firstDate: '2026-09-03',
      groups: defaultGroups(7),
      // Speculative fields that must never be persisted by this feature.
      days: [{ id: 'day_1', type: 'hiking' }],
      activeDayIndex: 2,
      totals: { distanceKm: 105 },
    },
    FORWARD,
    7,
  );
  assert.deepEqual(Object.keys(out).sort(), ['direction', 'firstDate', 'groups']);
});
