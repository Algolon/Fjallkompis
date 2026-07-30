/**
 * The pure Day plan model (src/plan/dayPlan.mjs) — the exact module the app
 * runs. These tests fence the product invariants that keep the canonical route
 * safe while the journey around it becomes personal:
 *
 *   - hiking counts partition the route exactly, so a skipped, duplicated,
 *     non-adjacent or reordered stage is structurally unrepresentable;
 *   - only the supported activity combinations exist (no custom kind);
 *   - day identity is a stable id, never an array position;
 *   - a plan is never inferred — only ever created explicitly.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_ACTIVITY_KINDS,
  buildActivities,
  canDropHikingFromDay,
  canInsertHikingDay,
  canRemoveDay,
  createDayPlan,
  currentDayIdAfterEdit,
  dateForDayIndex,
  dayIndexById,
  dayIndexForStageIndex,
  defaultDays,
  firstStageIndexOfDay,
  hikingStagesOf,
  insertDay,
  isDefaultDays,
  isValidActivities,
  isValidDays,
  isValidOvernight,
  newPlannedDayId,
  normalizeDayPlan,
  removeDay,
  reorderDayActivities,
  setDayActivities,
  setDayOvernight,
  setHikingStages,
  stagesAvailableFrom,
  totalHikingStages,
} from '../src/plan/dayPlan.mjs';
import { DEFAULT_DIRECTION, REVERSE_DIRECTION } from '../src/route/direction.mjs';

const FORWARD = DEFAULT_DIRECTION;
const REVERSE = REVERSE_DIRECTION;
const STAGES = 7;

let seq = 0;
/** Deterministic day ids for fixtures (the real generator is random). */
const day = (activities, overnight) => ({
  id: `day_fixture_${(seq += 1)}`,
  activities,
  ...(overnight ? { overnight } : {}),
});
const hiking = (stages = 1) => ({ kind: 'hiking', stages });
const travel = () => ({ kind: 'travel' });
const rest = () => ({ kind: 'rest' });

/** The 3–11 September journey, as the concrete validation fixture. */
function journeyDays() {
  return [
    day([travel()], { kind: 'stop', stopId: 'abisko' }), // 3 Sep
    day([hiking(1)]), // 4 Sep
    day([hiking(1)]), // 5 Sep
    day([hiking(2)]), // 6 Sep — two adjacent stages
    day([hiking(1)]), // 7 Sep
    day([hiking(1)]), // 8 Sep
    day([rest()]), // 9 Sep
    day([hiking(1), travel()], { kind: 'stay', tripItemId: 'trip_kiruna' }), // 10 Sep
    day([travel()], { kind: 'none' }), // 11 Sep
  ];
}

// ---- Ids --------------------------------------------------------------------

test('day ids follow the repository convention and are unique', () => {
  const ids = new Set(Array.from({ length: 50 }, () => newPlannedDayId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^day_[a-z0-9]+_[a-z0-9]+$/);
});

test('a day is found by id, never by position', () => {
  const days = journeyDays();
  assert.equal(dayIndexById(days, days[3].id), 3);
  assert.equal(dayIndexById(days, 'day_missing'), -1);
  assert.equal(dayIndexById(days, undefined), -1);
});

// ---- Activity combinations --------------------------------------------------

test('the supported activity kinds are exactly hiking, travel and rest', () => {
  assert.deepEqual([...DAY_ACTIVITY_KINDS].sort(), ['hiking', 'rest', 'travel']);
});

test('valid combinations: one hiking, one travel, or both in either order', () => {
  assert.ok(isValidActivities([hiking(1)]));
  assert.ok(isValidActivities([travel()]));
  assert.ok(isValidActivities([rest()]));
  assert.ok(isValidActivities([hiking(2), travel()]), 'hike then travel');
  assert.ok(isValidActivities([travel(), hiking(2)]), 'travel then hike');
});

test('invalid combinations are rejected — no duplicates, rest is exclusive', () => {
  assert.ok(!isValidActivities([]), 'a day must do something');
  assert.ok(!isValidActivities([hiking(1), hiking(1)]), 'at most one hiking');
  assert.ok(!isValidActivities([travel(), travel()]), 'at most one travel');
  assert.ok(!isValidActivities([rest(), travel()]), 'rest is exclusive');
  assert.ok(!isValidActivities([rest(), hiking(1)]), 'rest is exclusive');
  assert.ok(!isValidActivities([rest(), rest()]));
});

test('no custom or free-form activity kind is representable', () => {
  for (const bad of ['custom', 'note', 'other', '', null, 42]) {
    assert.ok(!isValidActivities([{ kind: bad }]), `kind ${String(bad)} is rejected`);
  }
});

test('a hiking activity must cover at least one whole stage', () => {
  for (const bad of [0, -1, 1.5, '1', NaN, Infinity, null, undefined]) {
    assert.ok(!isValidActivities([{ kind: 'hiking', stages: bad }]), `stages ${String(bad)}`);
  }
});

test('buildActivities keeps order, dedupes, and lets rest win outright', () => {
  assert.deepEqual(buildActivities(['hiking', 'travel'], 2), [hiking(2), travel()]);
  assert.deepEqual(buildActivities(['travel', 'hiking'], 3), [travel(), hiking(3)]);
  assert.deepEqual(buildActivities(['hiking', 'travel', 'rest'], 2), [rest()]);
  assert.deepEqual(buildActivities(['travel', 'travel']), [travel()]);
  assert.deepEqual(buildActivities(['nonsense']), []);
});

// ---- Partition invariant ----------------------------------------------------

test('the default plan is one hiking day per canonical stage', () => {
  const days = defaultDays(STAGES);
  assert.equal(days.length, STAGES);
  assert.equal(totalHikingStages(days), STAGES);
  assert.ok(days.every((d) => d.activities.length === 1 && d.activities[0].stages === 1));
  assert.ok(isDefaultDays(days, STAGES));
  assert.equal(new Set(days.map((d) => d.id)).size, STAGES, 'ids are unique');
});

test('defaultDays refuses an impossible stage count', () => {
  for (const bad of [0, -3, 2.5, NaN, '7', null]) assert.deepEqual(defaultDays(bad), []);
});

test('the journey fixture covers every canonical stage exactly once', () => {
  const days = journeyDays();
  assert.equal(totalHikingStages(days), STAGES);
  assert.ok(isValidDays(days, STAGES));
  // Every stage index maps to exactly one day, and day indices never go back.
  const seen = [];
  for (let stage = 0; stage < STAGES; stage++) {
    const idx = dayIndexForStageIndex(days, stage);
    assert.ok(idx >= 0, `stage ${stage} belongs to a day`);
    seen.push(idx);
  }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], 'route order preserved');
  assert.deepEqual(seen, [1, 2, 3, 3, 4, 5, 7]);
});

test('a day list whose hiking counts miss the stage count is invalid', () => {
  assert.ok(!isValidDays([day([hiking(6)])], STAGES), 'one stage short');
  assert.ok(!isValidDays([day([hiking(8)])], STAGES), 'one too many');
  assert.ok(!isValidDays([day([travel()])], STAGES), 'nothing walks');
  assert.ok(!isValidDays([], STAGES));
  assert.ok(!isValidDays(null, STAGES));
});

test('duplicate day ids make a plan invalid', () => {
  const a = day([hiking(3)]);
  const b = { ...day([hiking(4)]), id: a.id };
  assert.ok(!isValidDays([a, b], STAGES));
});

test('totalHikingStages reports NaN for malformed input rather than guessing', () => {
  assert.ok(Number.isNaN(totalHikingStages([day([{ kind: 'hiking', stages: 1.5 }])])));
  assert.ok(Number.isNaN(totalHikingStages('nope')));
  assert.equal(totalHikingStages([day([travel()]), day([rest()])]), 0);
});

test('stage lookups locate the first stage of a hiking day and skip non-hiking days', () => {
  const days = journeyDays();
  assert.equal(firstStageIndexOfDay(days, 0), -1, 'a travel day walks nothing');
  assert.equal(firstStageIndexOfDay(days, 1), 0);
  assert.equal(firstStageIndexOfDay(days, 3), 2, 'the two-stage day starts at stage 3');
  assert.equal(firstStageIndexOfDay(days, 6), -1, 'the rest day walks nothing');
  assert.equal(firstStageIndexOfDay(days, 7), 6, 'the final hike is the last stage');
  assert.equal(stagesAvailableFrom(days, 3), 5);
  assert.equal(stagesAvailableFrom(days, 7), 1);
});

// ---- Editing: the hiking endpoint -------------------------------------------

test('growing a hiking day consumes the following hiking day (merge)', () => {
  const before = defaultDays(STAGES);
  const after = setHikingStages(before, 2, 2);
  assert.equal(after.length, STAGES - 1);
  assert.equal(hikingStagesOf(after[2]), 2);
  assert.equal(totalHikingStages(after), STAGES);
  assert.ok(isValidDays(after, STAGES));
  // Identity is preserved for every day that survives.
  assert.equal(after[0].id, before[0].id);
  assert.equal(after[2].id, before[2].id);
  assert.equal(after[3].id, before[4].id, 'the consumed day is gone, later ids shift up');
});

test('shrinking a hiking day splits the remainder into a NEW day', () => {
  const merged = setHikingStages(defaultDays(STAGES), 2, 3);
  assert.equal(merged.length, STAGES - 2);
  const split = setHikingStages(merged, 2, 1);
  assert.equal(hikingStagesOf(split[2]), 1);
  assert.equal(hikingStagesOf(split[3]), 2, 'a new day holds the released stages');
  assert.equal(hikingStagesOf(split[4]), 1, 'the following day is NOT lengthened');
  assert.equal(totalHikingStages(split), STAGES);
  assert.equal(split.length, merged.length + 1);
});

test('shrinking the LAST hiking day creates a new hiking day after it', () => {
  const days = [day([travel()]), day([hiking(STAGES)])];
  const after = setHikingStages(days, 1, 4);
  assert.equal(after.length, 3);
  assert.equal(hikingStagesOf(after[1]), 4);
  assert.equal(hikingStagesOf(after[2]), 3);
  assert.equal(totalHikingStages(after), STAGES);
});

test('a split never lengthens a day the user did not touch', () => {
  const days = [day([hiking(3)]), day([hiking(2)]), day([hiking(2)])];
  const after = setHikingStages(days, 0, 1);
  assert.deepEqual(after.map(hikingStagesOf), [1, 2, 2, 2]);
  assert.equal(totalHikingStages(after), STAGES);
});

test('a released remainder never lands on a rest day — it gets its own day', () => {
  const days = [day([hiking(4)]), day([rest()]), day([hiking(3)])];
  const after = setHikingStages(days, 0, 2);
  assert.equal(after.length, 4);
  assert.equal(hikingStagesOf(after[0]), 2);
  assert.equal(hikingStagesOf(after[1]), 2, 'a new hiking day, before the rest day');
  assert.equal(after[2].activities[0].kind, 'rest');
  assert.equal(totalHikingStages(after), STAGES);
});

test('growing over a mixed day keeps its travel and drops only the walking', () => {
  const days = [day([hiking(6)]), day([hiking(1), travel()], { kind: 'none' })];
  const after = setHikingStages(days, 0, STAGES);
  assert.equal(after.length, 2, 'the mixed day survives — it still travels');
  assert.deepEqual(after[1].activities, [travel()]);
  assert.deepEqual(after[1].overnight, { kind: 'none' }, 'its overnight is untouched');
  assert.equal(totalHikingStages(after), STAGES);
});

test('an out-of-range or unchanged endpoint is a safe no-op', () => {
  const days = defaultDays(STAGES);
  assert.deepEqual(setHikingStages(days, 2, 1), days, 'unchanged');
  assert.deepEqual(setHikingStages(days, 0, 99), days, 'beyond the route');
  assert.deepEqual(setHikingStages(days, 0, 0), days);
  assert.deepEqual(setHikingStages(days, 99, 2), days);
  const withTravelFirst = [day([travel()]), day([hiking(STAGES)])];
  assert.deepEqual(
    setHikingStages(withTravelFirst, 0, 2),
    withTravelFirst,
    'a travel day has no endpoint to change',
  );
});

test('growing and shrinking are exact inverses at every boundary', () => {
  const base = defaultDays(STAGES);
  for (let i = 0; i < STAGES - 1; i++) {
    const merged = setHikingStages(base, i, 2);
    assert.equal(merged.length, STAGES - 1, `boundary ${i} merges two days`);
    assert.equal(totalHikingStages(merged), STAGES);
    const back = setHikingStages(merged, i, 1);
    assert.deepEqual(
      back.map(hikingStagesOf),
      base.map(hikingStagesOf),
      `boundary ${i} round-trips`,
    );
    assert.equal(back.length, STAGES);
  }
});

// ---- Editing: adding and removing days --------------------------------------

test('a travel or rest day inserts freely and walks nothing', () => {
  const base = defaultDays(STAGES);
  const withTravel = insertDay(base, 0, ['travel']);
  assert.equal(withTravel.length, STAGES + 1);
  assert.equal(hikingStagesOf(withTravel[0]), 0);
  assert.equal(totalHikingStages(withTravel), STAGES, 'the route is untouched');
  const withRest = insertDay(withTravel, 4, ['rest']);
  assert.equal(withRest.length, STAGES + 2);
  assert.equal(totalHikingStages(withRest), STAGES);
  assert.ok(isValidDays(withRest, STAGES));
});

test('inserting a hiking day splits an existing one, keeping the partition', () => {
  const merged = setHikingStages(defaultDays(STAGES), 0, 3); // [3,1,1,1,1]
  assert.ok(canInsertHikingDay(merged, 1));
  const after = insertDay(merged, 1, ['hiking']);
  assert.equal(totalHikingStages(after), STAGES);
  assert.equal(after.length, 6);
  assert.ok(isValidDays(after, STAGES));
});

test('a hiking day cannot be inserted when every stage already has its own day', () => {
  const base = defaultDays(STAGES);
  assert.ok(!canInsertHikingDay(base, 0));
  assert.deepEqual(insertDay(base, 0, ['hiking']), base, 'refused, not silently broken');
});

test('removing a day passes its walking to a neighbour — never loses a stage', () => {
  const base = defaultDays(STAGES);
  const after = removeDay(base, 2);
  assert.equal(after.length, STAGES - 1);
  assert.equal(totalHikingStages(after), STAGES);
  assert.equal(hikingStagesOf(after[2]), 2, 'the next hiking day inherits');
});

test('removing a travel or rest day changes nothing about the route', () => {
  const days = insertDay(defaultDays(STAGES), 0, ['travel']);
  const after = removeDay(days, 0);
  assert.equal(totalHikingStages(after), STAGES);
  assert.equal(after.length, STAGES);
});

test('the only day, and the only walking day, cannot be removed', () => {
  assert.ok(!canRemoveDay([day([hiking(STAGES)])], 0));
  const two = [day([travel()]), day([hiking(STAGES)])];
  assert.ok(!canRemoveDay(two, 1), 'nothing else walks');
  assert.ok(canRemoveDay(two, 0), 'the travel day is free to go');
  assert.deepEqual(removeDay(two, 1), two, 'refused');
});

// ---- Editing: composition and overnight -------------------------------------

test('a hiking day gains travel while keeping its stage allocation', () => {
  const base = defaultDays(STAGES);
  const after = setDayActivities(base, 6, ['hiking', 'travel']);
  assert.deepEqual(after[6].activities, [hiking(1), travel()]);
  assert.equal(totalHikingStages(after), STAGES);
});

test('activity order is preserved and can be swapped', () => {
  const days = [day([hiking(STAGES), travel()])];
  const swapped = reorderDayActivities(days, 0);
  assert.deepEqual(swapped[0].activities, [travel(), hiking(STAGES)]);
  assert.deepEqual(reorderDayActivities(swapped, 0)[0].activities, [hiking(STAGES), travel()]);
});

test('turning a hiking day into a rest day hands its stages to a neighbour', () => {
  const base = defaultDays(STAGES);
  const after = setDayActivities(base, 3, ['rest']);
  assert.deepEqual(after[3].activities, [rest()]);
  assert.equal(totalHikingStages(after), STAGES);
  assert.equal(hikingStagesOf(after[4]), 2);
});

test('the last walking day refuses to stop walking', () => {
  const days = [day([travel()]), day([hiking(STAGES)])];
  assert.deepEqual(setDayActivities(days, 1, ['rest']), days, 'refused');
});

test('a travel day can become a hiking day only when a stage is free', () => {
  const merged = setHikingStages(defaultDays(STAGES), 0, 2); // [2,1,1,1,1,1]
  const withTravel = insertDay(merged, 0, ['travel']);
  const after = setDayActivities(withTravel, 0, ['hiking']);
  assert.equal(totalHikingStages(after), STAGES);
  assert.ok(isValidDays(after, STAGES));
  // With nothing to spare it is refused rather than breaking the partition.
  const tight = insertDay(defaultDays(STAGES), 0, ['travel']);
  assert.deepEqual(setDayActivities(tight, 0, ['hiking']), tight);
});

test('an overnight reference is set, replaced and cleared back to derived', () => {
  const days = defaultDays(STAGES);
  const withStop = setDayOvernight(days, 1, { kind: 'stop', stopId: 'abisko' });
  assert.deepEqual(withStop[1].overnight, { kind: 'stop', stopId: 'abisko' });
  const withStay = setDayOvernight(withStop, 1, { kind: 'stay', tripItemId: 'trip_x' });
  assert.deepEqual(withStay[1].overnight, { kind: 'stay', tripItemId: 'trip_x' });
  const withNone = setDayOvernight(withStay, 1, { kind: 'none' });
  assert.deepEqual(withNone[1].overnight, { kind: 'none' });
  const cleared = setDayOvernight(withNone, 1, undefined);
  assert.ok(!('overnight' in cleared[1]), 'absent means derive — not a fourth variant');
});

test('malformed overnight references are rejected', () => {
  for (const bad of [
    { kind: 'stop' },
    { kind: 'stop', stopId: '' },
    { kind: 'stay' },
    { kind: 'hotel', name: 'x' },
    { kind: 'none', extra: 1 },
    null,
    'abisko',
  ]) {
    const valid = isValidOvernight(bad);
    if (bad && bad.kind === 'none') assert.ok(valid, 'a none ref tolerates extra keys');
    else assert.ok(!valid, `${JSON.stringify(bad)} is rejected`);
  }
});

test('every edit returns a new list and never mutates the input', () => {
  const days = Object.freeze(journeyDays().map(Object.freeze));
  const snapshot = JSON.stringify(days);
  setHikingStages(days, 3, 1);
  insertDay(days, 2, ['rest']);
  removeDay(days, 0);
  setDayActivities(days, 1, ['hiking', 'travel']);
  setDayOvernight(days, 1, { kind: 'none' });
  reorderDayActivities(days, 7);
  assert.equal(JSON.stringify(days), snapshot);
});

// ---- Dates ------------------------------------------------------------------

test('dates run over consecutive journey days from the start date', () => {
  assert.equal(dateForDayIndex('2026-09-03', 0), '2026-09-03');
  assert.equal(dateForDayIndex('2026-09-03', 1), '2026-09-04');
  assert.equal(dateForDayIndex('2026-09-03', 8), '2026-09-11', 'the 3–11 Sep journey');
});

test('dates cross month, year and leap-day boundaries correctly', () => {
  assert.equal(dateForDayIndex('2026-09-30', 1), '2026-10-01');
  assert.equal(dateForDayIndex('2026-12-30', 3), '2027-01-02');
  assert.equal(dateForDayIndex('2028-02-28', 1), '2028-02-29');
  assert.equal(dateForDayIndex('2027-02-28', 1), '2027-03-01');
});

test('malformed and unreal start dates yield no date', () => {
  for (const bad of ['', 'tomorrow', '2026-13-01', '2027-02-29', '2026-9-3', null, 42]) {
    assert.equal(dateForDayIndex(bad, 0), null, `start date ${String(bad)}`);
  }
  assert.equal(dateForDayIndex('2026-09-03', -1), null);
});

// ---- Creation ---------------------------------------------------------------

test('createDayPlan builds the default plan with no active day', () => {
  const plan = createDayPlan(FORWARD, '2026-09-03', STAGES);
  assert.equal(plan.direction, FORWARD);
  assert.equal(plan.startDate, '2026-09-03');
  assert.equal(plan.currentDayId, null, 'nothing is activated automatically');
  assert.equal(plan.days.length, STAGES);
  assert.ok(isValidDays(plan.days, STAGES));
});

test('createDayPlan refuses an unreal date or an impossible stage count', () => {
  assert.equal(createDayPlan(FORWARD, '2027-02-29', STAGES), null);
  assert.equal(createDayPlan(FORWARD, 'nope', STAGES), null);
  assert.equal(createDayPlan(FORWARD, '2026-09-03', 0), null);
});

// ---- Normalisation ----------------------------------------------------------

const plan = (days, extra = {}) => ({
  direction: FORWARD,
  startDate: '2026-09-03',
  currentDayId: null,
  days,
  ...extra,
});

test('an absent or malformed plan normalises to null — never an inferred plan', () => {
  for (const bad of [undefined, null, 'plan', 42, [], () => {}, {}]) {
    assert.equal(normalizeDayPlan(bad, FORWARD, STAGES), null, String(bad));
  }
});

test('the EARLIER DRAFT shape is rejected outright, never partly interpreted', () => {
  const legacyDraft = { direction: FORWARD, firstDate: '2026-09-03', groups: [1, 1, 2, 1, 1, 1] };
  assert.equal(normalizeDayPlan(legacyDraft, FORWARD, STAGES), null);
});

test('the journey fixture survives normalisation verbatim', () => {
  const source = plan(journeyDays());
  const out = normalizeDayPlan(source, FORWARD, STAGES);
  assert.deepEqual(out.days, source.days);
  assert.equal(out.startDate, '2026-09-03');
  assert.deepEqual(Object.keys(out).sort(), ['currentDayId', 'days', 'direction', 'startDate']);
});

test('an unreal start date or unknown direction discards the plan', () => {
  assert.equal(normalizeDayPlan(plan(defaultDays(STAGES), { startDate: '2027-02-29' }), FORWARD, STAGES), null);
  assert.equal(normalizeDayPlan(plan(defaultDays(STAGES), { startDate: '' }), FORWARD, STAGES), null);
  assert.equal(normalizeDayPlan(plan(defaultDays(STAGES), { direction: 'sideways' }), FORWARD, STAGES), null);
});

test('a plan authored for the OTHER direction is discarded, never reused', () => {
  const forwardPlan = plan(journeyDays());
  assert.equal(
    normalizeDayPlan(forwardPlan, REVERSE, STAGES),
    null,
    'no mirroring, no rebuilding, no partial retention',
  );
});

test('a broken day list discards the plan rather than half-loading it', () => {
  for (const days of [
    [day([hiking(6)])], // wrong total
    [day([])], // empty activities
    [day([rest(), travel()])], // illegal combination
    [day([{ kind: 'custom' }]), day([hiking(STAGES)])], // unknown kind
    [{ activities: [hiking(STAGES)] }], // no id
    'nope',
    [],
  ]) {
    assert.equal(normalizeDayPlan(plan(days), FORWARD, STAGES), null, JSON.stringify(days));
  }
});

test('unknown activity fields are dropped, not carried through', () => {
  const days = [day([{ kind: 'hiking', stages: STAGES, note: 'mini adventure' }])];
  const out = normalizeDayPlan(plan(days), FORWARD, STAGES);
  assert.deepEqual(out.days[0].activities, [hiking(STAGES)]);
});

test('a malformed overnight is dropped to derived; the day still loads', () => {
  const days = [day([hiking(STAGES)], { kind: 'hotel', name: 'Kiruna' })];
  const out = normalizeDayPlan(plan(days), FORWARD, STAGES);
  assert.ok(!('overnight' in out.days[0]));
});

test('a stale currentDayId degrades to none rather than activating a wrong day', () => {
  const days = journeyDays();
  const out = normalizeDayPlan(plan(days, { currentDayId: 'day_gone' }), FORWARD, STAGES);
  assert.equal(out.currentDayId, null);
  const kept = normalizeDayPlan(plan(days, { currentDayId: days[3].id }), FORWARD, STAGES);
  assert.equal(kept.currentDayId, days[3].id);
});

test('an unknown stage count cannot validate a plan, so it normalises to null', () => {
  assert.equal(normalizeDayPlan(plan(defaultDays(STAGES)), FORWARD, undefined), null);
  assert.equal(normalizeDayPlan(plan(defaultDays(STAGES)), FORWARD, 0), null);
});

test('normalisation is idempotent and never mutates its input', () => {
  const source = plan(journeyDays());
  const frozen = JSON.stringify(source);
  const once = normalizeDayPlan(source, FORWARD, STAGES);
  const twice = normalizeDayPlan(once, FORWARD, STAGES);
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(source), frozen);
  once.days.push(day([travel()]));
  assert.equal(JSON.stringify(source), frozen, 'the repaired plan owns its own arrays');
});

// ---- Active-day pointer after an edit ---------------------------------------
//
// A day edit can hand a canonical stage to a different calendar day. The
// walker has not moved, so the ACTIVE DAY follows the current stage — it is
// never the case that Today shows one day while the current stage belongs to
// another. Regression fence for the split/merge pointer desync.

test('splitting after stage 1 moves the active day to the day that now walks stage 2', () => {
  // Day A walks canonical stages 1–2 and is active; the walker is on stage 2.
  const a = day([hiking(2)]);
  const b = day([hiking(5)]);
  const before = [a, b];
  const after = setHikingStages(before, 0, 1); // "ends at" the first stage
  assert.equal(after.length, 3, 'the released walking becomes its own new day');
  assert.equal(hikingStagesOf(after[0]), 1);
  assert.equal(hikingStagesOf(after[1]), 1);

  // Stage index 1 = the second canonical stage.
  const next = currentDayIdAfterEdit(before, after, a.id, 1);
  assert.equal(next, after[1].id, 'the active day follows the current stage');
  assert.notEqual(next, a.id, 'the emptied original day is no longer active');
});

test('splitting while stage 1 is current leaves the original day active', () => {
  const a = day([hiking(2)]);
  const b = day([hiking(5)]);
  const before = [a, b];
  const after = setHikingStages(before, 0, 1);
  // Stage index 0 = the first canonical stage, which day A keeps.
  assert.equal(currentDayIdAfterEdit(before, after, a.id, 0), a.id);
});

test('merging carries the active day back to the day that absorbed the stage', () => {
  const a = day([hiking(1)]);
  const b = day([hiking(1)]);
  const c = day([hiking(5)]);
  const before = [a, b, c];
  // Day B is active and the walker is on stage 2, which B walks.
  const after = setHikingStages(before, 0, 2); // day A grows and absorbs B
  assert.ok(!after.some((d) => d.id === b.id), 'B had nothing else, so it disappears');
  assert.equal(currentDayIdAfterEdit(before, after, b.id, 1), a.id);
});

test('a travel or rest day stays active across an unrelated edit', () => {
  const t = day([travel()]);
  const a = day([hiking(3)]);
  const b = day([hiking(4)]);
  const before = [t, a, b];
  const after = setHikingStages(before, 1, 4); // edit two days away
  // The active travel day walks nothing, so no stage can pull it elsewhere.
  assert.equal(currentDayIdAfterEdit(before, after, t.id, 0), t.id);
});

test('inserting a day before the active one never activates a different day', () => {
  const a = day([hiking(2)]);
  const b = day([hiking(5)]);
  const before = [a, b];
  const after = insertDay(before, 0, ['travel']);
  assert.equal(currentDayIdAfterEdit(before, after, b.id, 2), b.id);
  assert.equal(currentDayIdAfterEdit(before, after, a.id, 0), a.id);
});

test('an active day that the edit removed degrades to no active day', () => {
  const t = day([travel()]);
  const a = day([hiking(7)]);
  const before = [t, a];
  const after = removeDay(before, 0);
  assert.equal(currentDayIdAfterEdit(before, after, t.id, 0), null);
});

test('the pointer rule never invents a day, and null in means null out', () => {
  const a = day([hiking(7)]);
  assert.equal(currentDayIdAfterEdit([a], [a], null, 0), null);
  assert.equal(currentDayIdAfterEdit([a], [a], 'day_gone', 0), null);
  // A current stage that is not on the route cannot move anything.
  assert.equal(currentDayIdAfterEdit([a], [a], a.id, -1), a.id);
});

// ---- Edit capability: what the model will actually accept -------------------
//
// The UI asks these BEFORE offering a control, so a tap can never be a silent
// no-op and a destructive confirmation can never be followed by nothing.

test('a day can only take on walking when some other day has a stage to spare', () => {
  const spread = defaultDays(STAGES); // every stage already has its own day
  assert.equal(canInsertHikingDay(spread, 0), false);
  assert.equal(canInsertHikingDay(spread, 3), false);
  // Merge two stages onto one day and a spare appears.
  const merged = setHikingStages(spread, 0, 2);
  assert.equal(canInsertHikingDay(merged, 0), true);
  assert.equal(canInsertHikingDay(merged, merged.length), true, 'donors are found backwards too');
});

test('a day can only give up its walking when another day can take it', () => {
  const only = [day([hiking(STAGES)]), day([travel()])];
  assert.equal(canDropHikingFromDay(only, 0), false, 'the only walking day must keep walking');
  assert.equal(canDropHikingFromDay(only, 1), true, 'a travel day has nothing to give up');
  const two = [day([hiking(3)]), day([hiking(4)])];
  assert.equal(canDropHikingFromDay(two, 0), true);
  assert.equal(canDropHikingFromDay(two, 1), true);
  assert.equal(canDropHikingFromDay(two, 9), false, 'no such day');
  assert.equal(canDropHikingFromDay(null, 0), false);
});

test('the capability answers match what the mutation actually does', () => {
  // Refused: the only walking day cannot stop walking, and the plan comes
  // back byte-identical rather than half-applied.
  const only = [day([hiking(STAGES)]), day([travel()])];
  assert.equal(canDropHikingFromDay(only, 0), false);
  assert.deepEqual(setDayActivities(only, 0, ['travel']), only, 'refused, so unchanged');

  // Refused: every stage already has its own day, so a travel day has no
  // walking to take on.
  const spread = [...defaultDays(STAGES), day([travel()])];
  const travelIndex = spread.length - 1;
  assert.equal(canInsertHikingDay(spread, travelIndex), false);
  assert.deepEqual(
    setDayActivities(spread, travelIndex, ['hiking']),
    spread,
    'refused, so unchanged',
  );

  // Allowed: the plan really changes, and stays a valid partition.
  const merged = setHikingStages(defaultDays(STAGES), 0, 2);
  const withTravelDay = insertDay(merged, 0, ['travel']);
  assert.equal(canInsertHikingDay(withTravelDay, 0), true);
  const grown = setDayActivities(withTravelDay, 0, ['travel', 'hiking']);
  assert.notDeepEqual(grown, withTravelDay);
  assert.ok(isValidDays(grown, STAGES));
});

test('removal is refused for the only day and for the only walking day', () => {
  assert.equal(canRemoveDay([day([hiking(STAGES)])], 0), false, 'the only day');
  // One hiking day plus one travel day: the walking has nowhere to go.
  const pair = [day([hiking(STAGES)]), day([travel()])];
  assert.equal(canRemoveDay(pair, 0), false, 'the only walking day');
  assert.equal(canRemoveDay(pair, 1), true, 'the travel day is free to go');
  assert.deepEqual(removeDay(pair, 0), pair, 'the refused removal changes nothing');
  assert.equal(removeDay(pair, 1).length, 1);
});
