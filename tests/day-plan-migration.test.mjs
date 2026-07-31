/**
 * The v9 → v10 hiking migration (src/plan/dayPlanMigration.mjs) — the exact
 * module the app runs. It must reproduce the released stage-cursor walk
 * EXACTLY: same stages on the same days, in the same activity positions,
 * with deterministic leg ids — and it must refuse (null) anything the
 * released model could not have persisted, never guessing.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLegacyHikingActivity,
  migrateLegacyDayPlan,
  planUsesLegacyHiking,
} from '../src/plan/dayPlanMigration.mjs';
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

/** The released 3–11 September journey shape, as stored by v0.26.x. */
function journeyDays() {
  return [
    day([travel()], { kind: 'stop', stopId: 'abisko' }),
    day([hiking(1)]),
    day([hiking(1)]),
    day([hiking(2)]),
    day([hiking(1)]),
    day([hiking(1)]),
    day([rest()]),
    day([hiking(1), travel()], { kind: 'stay', tripItemId: 'trip_kiruna' }),
    day([travel()], { kind: 'none' }),
  ];
}

const legStages = (migrated) =>
  migrated.days.map((d) =>
    d.activities
      .filter((a) => a.kind === 'hiking')
      .flatMap((a) => a.legs.map((l) => `${l.stageId}:${l.orientation}`)),
  );

// ---- Shape detection --------------------------------------------------------

test('legacy detection: stage counts are legacy, explicit legs are not', () => {
  assert.ok(isLegacyHikingActivity(hiking(2)));
  assert.ok(!isLegacyHikingActivity({ kind: 'hiking', legs: [] }));
  assert.ok(!isLegacyHikingActivity(travel()));
  assert.ok(!isLegacyHikingActivity(null));
  assert.ok(planUsesLegacyHiking(plan(journeyDays())));
  assert.ok(
    !planUsesLegacyHiking(
      plan([
        day([
          {
            kind: 'hiking',
            legs: [{ id: 'leg_x', kind: 'canonical-stage', stageId: 'd1', orientation: 'canonical' }],
          },
        ]),
      ]),
    ),
  );
  assert.ok(!planUsesLegacyHiking(null));
  assert.ok(!planUsesLegacyHiking({ days: 'nope' }));
});

// ---- The cursor walk, forward ----------------------------------------------

test('a one-stage-per-day v9 plan migrates to one canonical leg per day', () => {
  const source = plan(Array.from({ length: 7 }, () => day([hiking(1)])));
  const out = migrateLegacyDayPlan(source, TOPOLOGY, null);
  assert.deepEqual(legStages(out), [
    ['d1:canonical'],
    ['d2:canonical'],
    ['d3:canonical'],
    ['d4:canonical'],
    ['d5:canonical'],
    ['d6:canonical'],
    ['d7:canonical'],
  ]);
  for (const [i, d] of out.days.entries()) {
    assert.equal(d.id, source.days[i].id, 'day ids survive');
    const leg = d.activities[0].legs[0];
    assert.equal(leg.id, `leg_${d.id}_${leg.stageId}`, 'deterministic id shape');
  }
});

test('the released journey fixture migrates with exact stage placement', () => {
  const source = plan(journeyDays());
  const out = migrateLegacyDayPlan(source, TOPOLOGY, null);
  assert.deepEqual(legStages(out), [
    [],
    ['d1:canonical'],
    ['d2:canonical'],
    ['d3:canonical', 'd4:canonical'],
    ['d5:canonical'],
    ['d6:canonical'],
    [],
    ['d7:canonical'],
    [],
  ]);
  // Non-hiking structure is preserved verbatim, in position.
  assert.deepEqual(out.days[0].activities, [travel()]);
  assert.deepEqual(out.days[0].overnight, { kind: 'stop', stopId: 'abisko' });
  assert.deepEqual(out.days[6].activities, [rest()]);
  assert.equal(out.days[7].activities[0].kind, 'hiking', 'hike-then-travel keeps its order');
  assert.equal(out.days[7].activities[1].kind, 'travel');
  assert.deepEqual(out.days[7].overnight, { kind: 'stay', tripItemId: 'trip_kiruna' });
  assert.equal(out.startDate, '2026-09-03');
  assert.equal(out.direction, FORWARD);
});

test('migration is deterministic — the same payload migrates identically twice', () => {
  const source = plan(journeyDays());
  const once = migrateLegacyDayPlan(source, TOPOLOGY, null);
  const twice = migrateLegacyDayPlan(source, TOPOLOGY, null);
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(twice), JSON.stringify(once));
});

test('migration never mutates its input', () => {
  const source = plan(journeyDays());
  const frozen = JSON.stringify(source);
  migrateLegacyDayPlan(source, TOPOLOGY, 'd3');
  assert.equal(JSON.stringify(source), frozen);
});

// ---- The cursor walk, reverse ----------------------------------------------

test('a reverse-direction v9 plan migrates to opposite legs in walking order', () => {
  const source = plan(
    [day([hiking(2)]), day([hiking(5)])],
    { direction: REVERSE },
  );
  const out = migrateLegacyDayPlan(source, TOPOLOGY, null);
  assert.deepEqual(legStages(out), [
    ['d7:opposite', 'd6:opposite'],
    ['d5:opposite', 'd4:opposite', 'd3:opposite', 'd2:opposite', 'd1:opposite'],
  ]);
});

// ---- The current pointer ----------------------------------------------------

test('currentLegId is derived from the released pointers when unambiguous', () => {
  const days = journeyDays();
  const combined = days[3]; // walks d3 + d4
  const source = plan(days, { currentDayId: combined.id });
  const out = migrateLegacyDayPlan(source, TOPOLOGY, 'd4');
  assert.equal(out.currentLegId, `leg_${combined.id}_d4`);
  assert.equal(out.currentDayId, combined.id, 'the day pointer is untouched');
});

test('pointers that do not intersect derive NO current leg — never a guess', () => {
  const days = journeyDays();
  const source = plan(days, { currentDayId: days[3].id });
  // The current stage is walked by ANOTHER day: no leg on the current day matches.
  assert.equal(migrateLegacyDayPlan(source, TOPOLOGY, 'd6').currentLegId, null);
  // No current day at all.
  assert.equal(migrateLegacyDayPlan(plan(days), TOPOLOGY, 'd4').currentLegId, null);
  // A dangling currentDayId cannot resolve a leg (the id survives for the
  // normaliser to repair — migration only refuses to invent a pointer).
  assert.equal(
    migrateLegacyDayPlan(plan(days, { currentDayId: 'day_gone' }), TOPOLOGY, 'd4').currentLegId,
    null,
  );
  // No route progress recorded.
  assert.equal(migrateLegacyDayPlan(plan(days, { currentDayId: days[3].id }), TOPOLOGY, null).currentLegId, null);
});

// ---- Malformed legacy input -------------------------------------------------

test('non-integer, zero and negative stage counts refuse to migrate', () => {
  for (const bad of [0, -1, 1.5, '2', NaN, Infinity, null, undefined]) {
    const source = plan([day([{ kind: 'hiking', stages: bad }]), day([hiking(6)])]);
    assert.equal(migrateLegacyDayPlan(source, TOPOLOGY, null), null, String(bad));
  }
});

test('over- and under-consumption refuse to migrate', () => {
  assert.equal(migrateLegacyDayPlan(plan([day([hiking(8)])]), TOPOLOGY, null), null, 'over');
  assert.equal(migrateLegacyDayPlan(plan([day([hiking(6)])]), TOPOLOGY, null), null, 'under');
  assert.equal(migrateLegacyDayPlan(plan([day([travel()])]), TOPOLOGY, null), null, 'nothing walks');
});

test('a missing or unknown direction refuses to migrate', () => {
  for (const direction of [undefined, null, 'sideways', 42]) {
    const source = plan([day([hiking(7)])], { direction });
    assert.equal(migrateLegacyDayPlan(source, TOPOLOGY, null), null, String(direction));
  }
});

test('malformed days and missing topology refuse to migrate', () => {
  assert.equal(migrateLegacyDayPlan(plan(['nope']), TOPOLOGY, null), null);
  assert.equal(migrateLegacyDayPlan(plan([{ activities: [hiking(7)] }]), TOPOLOGY, null), null, 'no id');
  assert.equal(migrateLegacyDayPlan(plan([day('nope')]), TOPOLOGY, null), null);
  assert.equal(migrateLegacyDayPlan(plan([]), TOPOLOGY, null), null);
  assert.equal(migrateLegacyDayPlan(plan([day([hiking(7)])]), [], null), null);
  assert.equal(migrateLegacyDayPlan(plan([day([hiking(7)])]), null, null), null);
  assert.equal(migrateLegacyDayPlan(null, TOPOLOGY, null), null);
  assert.equal(migrateLegacyDayPlan('plan', TOPOLOGY, null), null);
});

test('an already-explicit activity passes through the walk untouched', () => {
  // A mixed payload (one legacy day, one already-migrated day) can only come
  // from tampering; the cursor walk still has to account for every stage, so
  // the explicit day passes through and the count walk fails honestly if the
  // arithmetic no longer adds up.
  const explicitDay = day([
    {
      kind: 'hiking',
      legs: [{ id: 'leg_keep', kind: 'canonical-stage', stageId: 'd7', orientation: 'canonical' }],
    },
  ]);
  const source = plan([day([hiking(6)]), explicitDay]);
  const out = migrateLegacyDayPlan(source, TOPOLOGY, null);
  assert.equal(out, null, 'six consumed of seven — the walk must not pretend it added up');
});
