/**
 * The pure Day plan model (src/plan/dayPlan.mjs) — the exact module the app
 * runs. These tests fence the product invariants of the v10 explicit-leg
 * model:
 *
 *   - a hiking day owns its own connected legs; editing one day NEVER
 *     changes another day (no donor, no heir, no reallocation);
 *   - skips, repeats, reversals and early finishes are representable — the
 *     old full-route partition invariant is gone by design;
 *   - leg ids are unique across the whole plan; day identity is a stable id;
 *   - dropping a day's walking is an EXPLICIT action, never a side effect;
 *   - a plan is never inferred — only ever created explicitly.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_ACTIVITY_KINDS,
  addLegToDay,
  allPlanLegs,
  buildActivities,
  canRemoveDay,
  createDayPlan,
  dateForDayIndex,
  dayIndexById,
  defaultDays,
  newDayLegCandidates,
  dropHikingFromDay,
  hikingLegsOf,
  insertDay,
  isDefaultDays,
  isValidActivities,
  isValidDays,
  isValidOvernight,
  moveLegInDay,
  newPlannedDayId,
  normalizeDayPlan,
  pointersAfterEdit,
  removeDay,
  removeLegFromDay,
  reorderDayActivities,
  repeatLegInDay,
  reverseLegInDay,
  setDayActivities,
  setDayOvernight,
  stageOccurrences,
} from '../src/plan/dayPlan.mjs';
import { DEFAULT_DIRECTION, REVERSE_DIRECTION } from '../src/route/direction.mjs';

const FORWARD = DEFAULT_DIRECTION;
const REVERSE = REVERSE_DIRECTION;

const TOPOLOGY = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

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

/** The 3–11 September journey, as the concrete validation fixture. */
function journeyDays() {
  return [
    day([travel()], { kind: 'stop', stopId: 'abisko' }), // 3 Sep
    day([hiking(leg('d1'))]), // 4 Sep
    day([hiking(leg('d2'))]), // 5 Sep
    day([hiking(leg('d3'), leg('d4'))]), // 6 Sep — two connected legs
    day([hiking(leg('d5'))]), // 7 Sep
    day([hiking(leg('d6'))]), // 8 Sep
    day([rest()]), // 9 Sep
    day([hiking(leg('d7')), travel()], { kind: 'stay', tripItemId: 'trip_kiruna' }), // 10 Sep
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
  assert.ok(isValidActivities([hiking(leg('d1'))], TOPOLOGY));
  assert.ok(isValidActivities([travel()], TOPOLOGY));
  assert.ok(isValidActivities([rest()], TOPOLOGY));
  assert.ok(isValidActivities([hiking(leg('d2')), travel()], TOPOLOGY), 'hike then travel');
  assert.ok(isValidActivities([travel(), hiking(leg('d2'))], TOPOLOGY), 'travel then hike');
});

test('invalid combinations are rejected — no duplicates, rest is exclusive', () => {
  assert.ok(!isValidActivities([], TOPOLOGY), 'a day must do something');
  assert.ok(!isValidActivities([hiking(leg('d1')), hiking(leg('d2'))], TOPOLOGY));
  assert.ok(!isValidActivities([travel(), travel()], TOPOLOGY), 'at most one travel');
  assert.ok(!isValidActivities([rest(), travel()], TOPOLOGY), 'rest is exclusive');
  assert.ok(!isValidActivities([rest(), hiking(leg('d1'))], TOPOLOGY), 'rest is exclusive');
  assert.ok(!isValidActivities([rest(), rest()], TOPOLOGY));
});

test('no custom or free-form activity kind is representable', () => {
  for (const bad of ['custom', 'note', 'other', '', null, 42]) {
    assert.ok(!isValidActivities([{ kind: bad }], TOPOLOGY), `kind ${String(bad)} is rejected`);
  }
});

test('a hiking activity requires connected, well-formed, non-empty legs', () => {
  assert.ok(!isValidActivities([{ kind: 'hiking', legs: [] }], TOPOLOGY), 'empty');
  assert.ok(!isValidActivities([{ kind: 'hiking' }], TOPOLOGY), 'no legs at all');
  assert.ok(!isValidActivities([{ kind: 'hiking', stages: 2 }], TOPOLOGY), 'the v9 shape');
  assert.ok(!isValidActivities([hiking(leg('d1'), leg('d3'))], TOPOLOGY), 'a gap');
  assert.ok(!isValidActivities([hiking(leg('d9'))], TOPOLOGY), 'unknown stage');
  assert.ok(!isValidActivities([hiking({ ...leg('d1'), orientation: 'x' })], TOPOLOGY));
});

test('the leg model represents what the v9 model could not', () => {
  // Out-and-back.
  assert.ok(isValidActivities([hiking(leg('d7'), leg('d7', 'opposite'))], TOPOLOGY));
  // A reverse walk.
  assert.ok(isValidActivities([hiking(leg('d4', 'opposite'), leg('d3', 'opposite'))], TOPOLOGY));
  // A section hike that skips most of the route is a PLAN-level diagnostic,
  // not an activity-level error.
  assert.ok(isValidDays([day([hiking(leg('d5'))])], TOPOLOGY), 'one stage, nothing else');
});

test('buildActivities keeps order, dedupes, and lets rest win outright', () => {
  const legs = [leg('d3')];
  assert.deepEqual(buildActivities(['hiking', 'travel'], legs), [
    { kind: 'hiking', legs },
    travel(),
  ]);
  assert.deepEqual(buildActivities(['travel', 'hiking'], legs), [
    travel(),
    { kind: 'hiking', legs },
  ]);
  assert.deepEqual(buildActivities(['hiking', 'travel', 'rest'], legs), [rest()]);
  assert.deepEqual(buildActivities(['travel', 'travel']), [travel()]);
  assert.deepEqual(buildActivities(['nonsense']), []);
});

// ---- Plan validity ----------------------------------------------------------

test('the journey fixture is a valid plan', () => {
  assert.ok(isValidDays(journeyDays(), TOPOLOGY));
});

test('a plan with no walking at all is structurally valid', () => {
  // Coverage is a diagnostic since v10 — a travel-and-rest-only plan loads.
  assert.ok(isValidDays([day([travel()]), day([rest()])], TOPOLOGY));
});

test('duplicate day ids make a plan invalid', () => {
  const a = day([hiking(leg('d1'))]);
  const b = { ...day([hiking(leg('d2'))]), id: a.id };
  assert.ok(!isValidDays([a, b], TOPOLOGY));
});

test('duplicate LEG ids anywhere in the plan make it invalid', () => {
  const shared = leg('d3');
  const sameDay = [day([hiking(shared, { ...leg('d4'), id: shared.id })])];
  assert.ok(!isValidDays(sameDay, TOPOLOGY), 'within one day');
  const acrossDays = [day([hiking(shared)]), day([hiking({ ...leg('d3'), id: shared.id })])];
  assert.ok(!isValidDays(acrossDays, TOPOLOGY), 'across days');
});

test('the same STAGE may appear twice — occurrences differ by leg id', () => {
  const twice = [day([hiking(leg('d7'))]), day([hiking(leg('d7', 'opposite'))])];
  assert.ok(isValidDays(twice, TOPOLOGY));
  const occurrences = stageOccurrences(twice, 'd7');
  assert.equal(occurrences.length, 2);
  assert.notEqual(occurrences[0].legId, occurrences[1].legId);
  assert.notEqual(occurrences[0].dayId, occurrences[1].dayId);
});

test('allPlanLegs walks days in order and legs in sequence', () => {
  const days = journeyDays();
  assert.deepEqual(
    allPlanLegs(days).map((l) => l.stageId),
    ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'],
  );
  assert.deepEqual(allPlanLegs('nope'), []);
});

// ---- Defaults ---------------------------------------------------------------

test('the default forward plan is one canonical leg per stage, in order', () => {
  const days = defaultDays(FORWARD, TOPOLOGY);
  assert.equal(days.length, 7);
  assert.deepEqual(
    days.map((d) => hikingLegsOf(d).map((l) => `${l.stageId}:${l.orientation}`)),
    [['d1:canonical'], ['d2:canonical'], ['d3:canonical'], ['d4:canonical'], ['d5:canonical'], ['d6:canonical'], ['d7:canonical']],
  );
  assert.ok(isDefaultDays(days, FORWARD, TOPOLOGY));
  assert.ok(isValidDays(days, TOPOLOGY));
  assert.equal(new Set(days.map((d) => d.id)).size, 7, 'day ids are unique');
  assert.equal(new Set(allPlanLegs(days).map((l) => l.id)).size, 7, 'leg ids are unique');
});

test('the default reverse plan walks d7..d1 as opposite legs', () => {
  const days = defaultDays(REVERSE, TOPOLOGY);
  assert.deepEqual(
    days.map((d) => hikingLegsOf(d).map((l) => `${l.stageId}:${l.orientation}`)),
    [['d7:opposite'], ['d6:opposite'], ['d5:opposite'], ['d4:opposite'], ['d3:opposite'], ['d2:opposite'], ['d1:opposite']],
  );
  assert.ok(isDefaultDays(days, REVERSE, TOPOLOGY));
  assert.ok(!isDefaultDays(days, FORWARD, TOPOLOGY), 'direction matters');
});

test('defaultDays refuses an impossible topology', () => {
  assert.deepEqual(defaultDays(FORWARD, []), []);
  assert.deepEqual(defaultDays(FORWARD, null), []);
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

test('createDayPlan builds the default plan with no active day or leg', () => {
  const plan = createDayPlan(FORWARD, '2026-09-03', TOPOLOGY);
  assert.equal(plan.direction, FORWARD);
  assert.equal(plan.startDate, '2026-09-03');
  assert.equal(plan.currentDayId, null, 'nothing is activated automatically');
  assert.equal(plan.currentLegId, null);
  assert.equal(plan.days.length, 7);
  assert.ok(isValidDays(plan.days, TOPOLOGY));
});

test('createDayPlan refuses an unreal date or an impossible topology', () => {
  assert.equal(createDayPlan(FORWARD, '2027-02-29', TOPOLOGY), null);
  assert.equal(createDayPlan(FORWARD, 'nope', TOPOLOGY), null);
  assert.equal(createDayPlan(FORWARD, '2026-09-03', []), null);
});

// ---- Editing: days ----------------------------------------------------------

test('a travel or rest day inserts freely and walks nothing', () => {
  const base = defaultDays(FORWARD, TOPOLOGY);
  const withTravel = insertDay(base, 0, ['travel'], TOPOLOGY);
  assert.equal(withTravel.length, 8);
  assert.equal(hikingLegsOf(withTravel[0]).length, 0);
  const withRest = insertDay(withTravel, 4, ['rest'], TOPOLOGY);
  assert.equal(withRest.length, 9);
  assert.ok(isValidDays(withRest, TOPOLOGY));
  // Every original day is byte-identical — nothing was borrowed or donated.
  assert.deepEqual(withRest.filter((d) => hikingLegsOf(d).length > 0), base);
});

test('an inserted hiking day walks the EXPLICITLY chosen section — no auto-pick', () => {
  const base = defaultDays(FORWARD, TOPOLOGY);
  // The chosen candidate (a repeat of d4, walked onward from day 3's end):
  const after = insertDay(base, 3, ['hiking'], TOPOLOGY, {
    stageId: 'd4',
    orientation: 'canonical',
  });
  assert.equal(after.length, 8);
  assert.deepEqual(
    hikingLegsOf(after[3]).map((l) => `${l.stageId}:${l.orientation}`),
    ['d4:canonical'],
  );
  assert.deepEqual(after.filter((_, i) => i !== 3), base, 'no other day changed');
  assert.equal(stageOccurrences(after, 'd4').length, 2, 'the repeat was the caller’s choice');
});

test('a hiking day WITHOUT a chosen section is refused — never silently picked', () => {
  const base = defaultDays(FORWARD, TOPOLOGY);
  assert.deepEqual(insertDay(base, 3, ['hiking'], TOPOLOGY), base, 'no startLeg');
  assert.deepEqual(insertDay(base, 3, ['hiking'], TOPOLOGY, null), base);
  assert.deepEqual(
    insertDay(base, 3, ['hiking'], TOPOLOGY, { stageId: 'd9', orientation: 'canonical' }),
    base,
    'unknown stage',
  );
  assert.deepEqual(
    insertDay(base, 3, ['hiking'], TOPOLOGY, { stageId: 'd4', orientation: 'backwards' }),
    base,
    'unknown orientation',
  );
});

test('newDayLegCandidates lists every connecting section with repeat status', () => {
  // After a day ending at Tjäktja (d3): continue with d4, or walk d3 back.
  const base = [day([hiking(leg('d3'))])];
  assert.deepEqual(newDayLegCandidates(base, 1, FORWARD, TOPOLOGY), [
    {
      stageId: 'd3',
      orientation: 'opposite',
      fromStopId: 'tjaktja',
      toStopId: 'alesjaure',
      alreadyPlanned: true,
    },
    {
      stageId: 'd4',
      orientation: 'canonical',
      fromStopId: 'tjaktja',
      toStopId: 'salka',
      alreadyPlanned: false,
    },
  ]);
});

test('candidates at the very start connect INTO the first hiking day', () => {
  const base = defaultDays(FORWARD, TOPOLOGY);
  // The first day starts at Abisko; the only section arriving there is d1
  // walked opposite — and the plan already walks d1, so it is a marked
  // repeat the caller must choose explicitly.
  assert.deepEqual(newDayLegCandidates(base, 0, FORWARD, TOPOLOGY), [
    {
      stageId: 'd1',
      orientation: 'opposite',
      fromStopId: 'abiskojaure',
      toStopId: 'abisko',
      alreadyPlanned: true,
    },
  ]);
});

test('candidates in an empty-walking plan are the direction default', () => {
  const days = [day([travel()]), day([rest()])];
  assert.deepEqual(newDayLegCandidates(days, 1, FORWARD, TOPOLOGY), [
    {
      stageId: 'd1',
      orientation: 'canonical',
      fromStopId: 'abisko',
      toStopId: 'abiskojaure',
      alreadyPlanned: false,
    },
  ]);
  assert.deepEqual(newDayLegCandidates(days, 1, REVERSE, TOPOLOGY), [
    {
      stageId: 'd7',
      orientation: 'opposite',
      fromStopId: 'nikkaluokta',
      toStopId: 'kebnekaise',
      alreadyPlanned: false,
    },
  ]);
});

test('removing a day removes its walking WITH it — no heir, no inheritance', () => {
  const base = defaultDays(FORWARD, TOPOLOGY);
  const after = removeDay(base, 2);
  assert.equal(after.length, 6);
  assert.equal(stageOccurrences(after, 'd3').length, 0, 'd3 is simply not planned');
  // Every surviving day is unchanged.
  assert.deepEqual(after, base.filter((_, i) => i !== 2));
});

test('the only day cannot be removed', () => {
  const single = [day([hiking(leg('d1'))])];
  assert.equal(canRemoveDay(single, 0), false);
  assert.deepEqual(removeDay(single, 0), single);
  const pair = [day([travel()]), day([hiking(leg('d1'))])];
  assert.equal(canRemoveDay(pair, 0), true);
  assert.equal(canRemoveDay(pair, 1), true, 'even the only walking day may go');
  assert.equal(canRemoveDay(pair, 9), false, 'no such day');
});

// ---- Editing: composition ---------------------------------------------------

test('a hiking day gains travel while keeping its exact legs', () => {
  const base = defaultDays(FORWARD, TOPOLOGY);
  const legsBefore = hikingLegsOf(base[6]);
  const after = setDayActivities(base, 6, ['hiking', 'travel'], TOPOLOGY);
  assert.deepEqual(after[6].activities, [{ kind: 'hiking', legs: legsBefore }, travel()]);
});

test('activity order is preserved and can be swapped', () => {
  const days = [day([hiking(leg('d1')), travel()])];
  const swapped = reorderDayActivities(days, 0);
  assert.equal(swapped[0].activities[0].kind, 'travel');
  assert.equal(swapped[0].activities[1].kind, 'hiking');
  assert.deepEqual(reorderDayActivities(swapped, 0), days);
});

test('a day that walks refuses to stop walking through the kind toggle', () => {
  // Dropping legs silently is data loss; the explicit path is
  // dropHikingFromDay, reached through its own named, confirmed action.
  const base = defaultDays(FORWARD, TOPOLOGY);
  assert.deepEqual(setDayActivities(base, 3, ['rest'], TOPOLOGY), base, 'refused');
  assert.deepEqual(setDayActivities(base, 2, ['travel'], TOPOLOGY), base, 'refused');
  const mixed = setDayActivities(base, 2, ['hiking', 'travel'], TOPOLOGY);
  assert.deepEqual(setDayActivities(mixed, 2, ['travel'], TOPOLOGY), mixed, 'refused');
});

test('a travel day takes on walking only with an explicitly chosen section', () => {
  const days = [day([hiking(leg('d2'))]), day([travel()])];
  const after = setDayActivities(days, 1, ['travel', 'hiking'], TOPOLOGY, {
    stageId: 'd3',
    orientation: 'canonical',
  });
  assert.equal(after[1].activities[0].kind, 'travel', 'order preserved');
  assert.deepEqual(
    hikingLegsOf(after[1]).map((l) => `${l.stageId}:${l.orientation}`),
    ['d3:canonical'],
  );
  assert.deepEqual(after[0], days[0], 'the day it continues FROM is untouched');
  // Without a chosen section the change is refused — never silently picked.
  assert.deepEqual(setDayActivities(days, 1, ['travel', 'hiking'], TOPOLOGY), days);
});

test('dropHikingFromDay is the explicit way a walking day stops walking', () => {
  const days = [day([hiking(leg('d3')), travel()]), day([hiking(leg('d4'))])];
  const dropped = dropHikingFromDay(days, 0, ['travel']);
  assert.deepEqual(dropped[0].activities, [travel()]);
  assert.deepEqual(dropped[1], days[1], 'the neighbour is untouched');
  assert.equal(stageOccurrences(dropped, 'd3').length, 0, 'd3 is now a coverage diagnostic');
  // To rest:
  const rested = dropHikingFromDay(days, 0, ['rest']);
  assert.deepEqual(rested[0].activities, [rest()]);
  // Pointer repair: only pointers INTO the removed activity change. A
  // current leg that belonged to the dropped walking clears; the day stays
  // current; pointers into the other day are untouched entirely.
  const droppedLegId = hikingLegsOf(days[0])[0].id;
  assert.deepEqual(pointersAfterEdit(rested, days[0].id, droppedLegId), {
    currentDayId: days[0].id,
    currentLegId: null,
  });
  const otherLegId = hikingLegsOf(days[1])[0].id;
  assert.deepEqual(pointersAfterEdit(rested, days[1].id, otherLegId), {
    currentDayId: days[1].id,
    currentLegId: otherLegId,
  });
});

test('dropHikingFromDay refuses to leave a day empty or keep hiking', () => {
  const days = [day([hiking(leg('d3'))])];
  assert.deepEqual(dropHikingFromDay(days, 0, []), days, 'a day always does something');
  assert.deepEqual(dropHikingFromDay(days, 0, ['hiking']), days, 'hiking is filtered out → empty');
  const noHike = [day([travel()])];
  assert.deepEqual(dropHikingFromDay(noHike, 0, ['rest']), noHike, 'nothing to drop');
});

test('an overnight reference is set, replaced and cleared back to derived', () => {
  const days = defaultDays(FORWARD, TOPOLOGY);
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

// ---- Editing: a day's legs stay the day's own ------------------------------

test('leg edits touch exactly the opened day', () => {
  const days = journeyDays();
  const target = 3; // walks d3 + d4
  const others = days.filter((_, i) => i !== target);

  const added = addLegToDay(days, target, 'd5', 'canonical', 'end', TOPOLOGY);
  assert.deepEqual(
    hikingLegsOf(added[target]).map((l) => l.stageId),
    ['d3', 'd4', 'd5'],
  );
  assert.deepEqual(added.filter((_, i) => i !== target), others, 'add changed one day');
  assert.equal(stageOccurrences(added, 'd5').length, 2, 'the OTHER d5 day still walks it');

  const removed = removeLegFromDay(days, target, hikingLegsOf(days[target])[1].id, TOPOLOGY);
  assert.deepEqual(
    hikingLegsOf(removed[target]).map((l) => l.stageId),
    ['d3'],
  );
  assert.deepEqual(removed.filter((_, i) => i !== target), others, 'remove changed one day');
});

test('a disconnecting leg edit is refused outright — nothing partially applies', () => {
  const line = [day([hiking(leg('d3'), leg('d4'), leg('d5'))])];
  const snapshot = JSON.stringify(line);
  assert.deepEqual(addLegToDay(line, 0, 'd7', 'canonical', 'end', TOPOLOGY), line, 'gap');
  const middle = hikingLegsOf(line[0])[1];
  assert.deepEqual(
    removeLegFromDay(line, 0, middle.id, TOPOLOGY),
    line,
    'removing the middle leg would leave d3 → d5 disconnected',
  );
  assert.deepEqual(reverseLegInDay(line, 0, middle.id, TOPOLOGY), line, 'reversing mid-line');
  assert.deepEqual(moveLegInDay(line, 0, 0, 2, TOPOLOGY), line, 'a line admits one order');
  assert.equal(JSON.stringify(line), snapshot, 'inputs never mutate');
});

test('reverse, repeat and reorder work through the day wrappers', () => {
  const days = [day([hiking(leg('d7'))])];
  const reversed = reverseLegInDay(days, 0, hikingLegsOf(days[0])[0].id, TOPOLOGY);
  assert.equal(hikingLegsOf(reversed[0])[0].orientation, 'opposite');

  const repeated = repeatLegInDay(days, 0, hikingLegsOf(days[0])[0].id, TOPOLOGY);
  assert.deepEqual(
    hikingLegsOf(repeated[0]).map((l) => `${l.stageId}:${l.orientation}`),
    ['d7:canonical', 'd7:opposite'],
    'an explicit out-and-back',
  );
  assert.ok(isValidDays(repeated, TOPOLOGY), 'both occurrences carry their own ids');

  const moved = moveLegInDay(repeated, 0, 0, 1, TOPOLOGY);
  assert.deepEqual(
    hikingLegsOf(moved[0]).map((l) => l.orientation),
    ['opposite', 'canonical'],
    'the mirror out-and-back still connects',
  );
});

test('every edit returns a new list and never mutates the input', () => {
  const days = journeyDays();
  const snapshot = JSON.stringify(days);
  insertDay(days, 2, ['rest'], TOPOLOGY);
  removeDay(days, 0);
  setDayActivities(days, 1, ['hiking', 'travel'], TOPOLOGY);
  dropHikingFromDay(days, 1, ['rest']);
  setDayOvernight(days, 1, { kind: 'none' });
  reorderDayActivities(days, 7);
  addLegToDay(days, 1, 'd2', 'canonical', 'end', TOPOLOGY);
  removeLegFromDay(days, 3, hikingLegsOf(days[3])[0].id, TOPOLOGY);
  reverseLegInDay(days, 1, hikingLegsOf(days[1])[0].id, TOPOLOGY);
  repeatLegInDay(days, 1, hikingLegsOf(days[1])[0].id, TOPOLOGY);
  moveLegInDay(days, 3, 0, 1, TOPOLOGY);
  assert.equal(JSON.stringify(days), snapshot);
});

// ---- Pointers after an edit -------------------------------------------------

test('the active day survives while it exists and degrades to null when removed', () => {
  const days = journeyDays();
  const active = days[3];
  const activeLeg = hikingLegsOf(active)[1];
  const kept = pointersAfterEdit(days, active.id, activeLeg.id);
  assert.deepEqual(kept, { currentDayId: active.id, currentLegId: activeLeg.id });

  const without = days.filter((d) => d.id !== active.id);
  assert.deepEqual(pointersAfterEdit(without, active.id, activeLeg.id), {
    currentDayId: null,
    currentLegId: null,
  });
});

test('the active LEG degrades alone when an edit removed just that leg', () => {
  const days = journeyDays();
  const active = days[3];
  const [first, second] = hikingLegsOf(active);
  const edited = removeLegFromDay(days, 3, second.id, TOPOLOGY);
  assert.deepEqual(pointersAfterEdit(edited, active.id, second.id), {
    currentDayId: active.id,
    currentLegId: null,
  });
  assert.deepEqual(pointersAfterEdit(edited, active.id, first.id), {
    currentDayId: active.id,
    currentLegId: first.id,
  });
});

test('the pointer rule never invents a day or a leg', () => {
  const days = journeyDays();
  assert.deepEqual(pointersAfterEdit(days, null, null), { currentDayId: null, currentLegId: null });
  assert.deepEqual(pointersAfterEdit(days, 'day_gone', 'leg_gone'), {
    currentDayId: null,
    currentLegId: null,
  });
  // A leg id belonging to ANOTHER day is never honoured.
  const otherLeg = hikingLegsOf(days[1])[0];
  assert.deepEqual(pointersAfterEdit(days, days[3].id, otherLeg.id), {
    currentDayId: days[3].id,
    currentLegId: null,
  });
});

// ---- Normalisation ----------------------------------------------------------

const plan = (days, extra = {}) => ({
  direction: FORWARD,
  startDate: '2026-09-03',
  currentDayId: null,
  currentLegId: null,
  days,
  ...extra,
});

test('an absent or malformed plan normalises to null — never an inferred plan', () => {
  for (const bad of [undefined, null, 'plan', 42, [], () => {}, {}]) {
    assert.equal(normalizeDayPlan(bad, FORWARD, TOPOLOGY), null, String(bad));
  }
});

test('the EARLIER DRAFT shape is rejected outright, never partly interpreted', () => {
  const legacyDraft = { direction: FORWARD, firstDate: '2026-09-03', groups: [1, 1, 2, 1, 1, 1] };
  assert.equal(normalizeDayPlan(legacyDraft, FORWARD, TOPOLOGY), null);
});

test('the journey fixture survives normalisation verbatim', () => {
  const source = plan(journeyDays());
  const out = normalizeDayPlan(source, FORWARD, TOPOLOGY);
  assert.deepEqual(out.days, source.days);
  assert.equal(out.startDate, '2026-09-03');
  assert.deepEqual(
    Object.keys(out).sort(),
    ['currentDayId', 'currentLegId', 'days', 'direction', 'startDate'],
  );
});

test('a v9 stage-count plan migrates during normalisation', () => {
  const v9 = {
    direction: FORWARD,
    startDate: '2026-09-03',
    currentDayId: null,
    days: [
      { id: 'day_a', activities: [{ kind: 'travel' }] },
      { id: 'day_b', activities: [{ kind: 'hiking', stages: 3 }] },
      { id: 'day_c', activities: [{ kind: 'hiking', stages: 4 }] },
    ],
  };
  const out = normalizeDayPlan(v9, FORWARD, TOPOLOGY);
  assert.ok(out, 'the released shape loads');
  assert.deepEqual(
    out.days.map((d) => hikingLegsOf(d).map((l) => `${l.stageId}:${l.orientation}`)),
    [[], ['d1:canonical', 'd2:canonical', 'd3:canonical'], ['d4:canonical', 'd5:canonical', 'd6:canonical', 'd7:canonical']],
  );
  assert.equal(out.days[1].activities[0].legs[0].id, 'leg_day_b_d1', 'deterministic ids');
  assert.equal(out.currentLegId, null);
});

test('a malformed v9 plan lands on null with nothing half-migrated', () => {
  const base = {
    direction: FORWARD,
    startDate: '2026-09-03',
    currentDayId: null,
  };
  for (const days of [
    [{ id: 'day_a', activities: [{ kind: 'hiking', stages: 6 }] }], // under
    [{ id: 'day_a', activities: [{ kind: 'hiking', stages: 8 }] }], // over
    [{ id: 'day_a', activities: [{ kind: 'hiking', stages: 1.5 }] }],
    [{ id: 'day_a', activities: [{ kind: 'hiking', stages: 0 }] }],
  ]) {
    assert.equal(normalizeDayPlan({ ...base, days }, FORWARD, TOPOLOGY), null, JSON.stringify(days));
  }
});

test('an unreal start date or unknown direction discards the plan', () => {
  assert.equal(
    normalizeDayPlan(plan(journeyDays(), { startDate: '2027-02-29' }), FORWARD, TOPOLOGY),
    null,
  );
  assert.equal(normalizeDayPlan(plan(journeyDays(), { startDate: '' }), FORWARD, TOPOLOGY), null);
  assert.equal(
    normalizeDayPlan(plan(journeyDays(), { direction: 'sideways' }), FORWARD, TOPOLOGY),
    null,
  );
});

test('a plan authored for the OTHER direction is discarded, never reused', () => {
  assert.equal(
    normalizeDayPlan(plan(journeyDays()), REVERSE, TOPOLOGY),
    null,
    'no mirroring, no rebuilding, no partial retention',
  );
});

test('a broken day list discards the plan rather than half-loading it', () => {
  for (const days of [
    [day([])], // empty activities
    [day([rest(), travel()])], // illegal combination
    [day([{ kind: 'custom' }]), day([hiking(leg('d1'))])], // unknown kind
    [day([hiking(leg('d1'), leg('d3'))])], // disconnected
    [day([hiking(leg('d9'))])], // unknown stage
    [day([{ kind: 'hiking', legs: [] }])], // empty hiking
    [{ activities: [hiking(leg('d1'))] }], // no id
    'nope',
    [],
  ]) {
    assert.equal(normalizeDayPlan(plan(days), FORWARD, TOPOLOGY), null, JSON.stringify(days));
  }
});

test('duplicate leg ids anywhere discard the plan', () => {
  const a = leg('d1');
  const source = plan([day([hiking(a)]), day([hiking({ ...leg('d2'), id: a.id })])]);
  assert.equal(normalizeDayPlan(source, FORWARD, TOPOLOGY), null);
});

test('unknown leg and activity fields are dropped, not carried through', () => {
  const source = plan([
    day([{ kind: 'hiking', legs: [{ ...leg('d1'), note: 'foggy' }], mood: 'great' }]),
  ]);
  const out = normalizeDayPlan(source, FORWARD, TOPOLOGY);
  assert.deepEqual(Object.keys(out.days[0].activities[0]).sort(), ['kind', 'legs']);
  assert.deepEqual(
    Object.keys(out.days[0].activities[0].legs[0]).sort(),
    ['id', 'kind', 'orientation', 'stageId'],
  );
});

test('a malformed overnight is dropped to derived; the day still loads', () => {
  const days = [day([hiking(leg('d1'))], { kind: 'hotel', name: 'Kiruna' })];
  const out = normalizeDayPlan(plan(days), FORWARD, TOPOLOGY);
  assert.ok(!('overnight' in out.days[0]));
});

test('a stale currentDayId degrades to none rather than activating a wrong day', () => {
  const days = journeyDays();
  const out = normalizeDayPlan(plan(days, { currentDayId: 'day_gone' }), FORWARD, TOPOLOGY);
  assert.equal(out.currentDayId, null);
  const kept = normalizeDayPlan(plan(days, { currentDayId: days[3].id }), FORWARD, TOPOLOGY);
  assert.equal(kept.currentDayId, days[3].id);
});

test('currentLegId is honoured only on the current day itself', () => {
  const days = journeyDays();
  const activeLeg = hikingLegsOf(days[3])[1];
  const kept = normalizeDayPlan(
    plan(days, { currentDayId: days[3].id, currentLegId: activeLeg.id }),
    FORWARD,
    TOPOLOGY,
  );
  assert.equal(kept.currentLegId, activeLeg.id);

  // A leg on a DIFFERENT day, a dangling id, and a leg with no current day
  // all degrade to null — never to a wrong occurrence.
  const otherDaysLeg = hikingLegsOf(days[1])[0];
  for (const extra of [
    { currentDayId: days[3].id, currentLegId: otherDaysLeg.id },
    { currentDayId: days[3].id, currentLegId: 'leg_gone' },
    { currentDayId: null, currentLegId: activeLeg.id },
  ]) {
    const out = normalizeDayPlan(plan(days, extra), FORWARD, TOPOLOGY);
    assert.equal(out.currentLegId, null, JSON.stringify(extra));
  }
});

test('an unknown topology cannot validate a plan, so it normalises to null', () => {
  assert.equal(normalizeDayPlan(plan(journeyDays()), FORWARD, undefined), null);
  assert.equal(normalizeDayPlan(plan(journeyDays()), FORWARD, []), null);
});

test('normalisation is idempotent and never mutates its input', () => {
  const source = plan(journeyDays());
  const frozen = JSON.stringify(source);
  const once = normalizeDayPlan(source, FORWARD, TOPOLOGY);
  const twice = normalizeDayPlan(once, FORWARD, TOPOLOGY);
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(source), frozen);
  once.days.push(day([travel()]));
  assert.equal(JSON.stringify(source), frozen, 'the repaired plan owns its own arrays');
});
