/**
 * CHARACTERIZATION — what a route-direction change does, and does not do.
 *
 * A plan describes a journey in ONE walking direction: which stages are
 * walked, where each day ends, where the user sleeps, which travel day is the
 * outbound one. The app therefore refuses to mirror or partly reuse a plan
 * across a reversal. vNext moves the direction control out of Settings and
 * into Plan, so the blast radius of that reversal has to be pinned first:
 * exactly the plan goes, and nothing else moves.
 *
 * SCOPE — and one foundation blocker.
 * The IN-MEMORY half of the change is a React `useCallback` closure
 * (`setRouteDirection` in src/store/AppStore.tsx), which `node --test` cannot
 * import and this PR does not modify; it stays covered by the source-text
 * fence in tests/day-plan-store.test.mjs. What IS behaviourally reachable —
 * and is what the user's persisted data actually passes through on the next
 * load, on an import and on a device transfer — is the normalisation
 * boundary: src/utils/stateMigration.mjs `normalizeState` resolves the ACTIVE
 * direction and hands it to `normalizeDayPlan`, which refuses a plan authored
 * for the other one. Those are the assertions below.
 *
 * Regressions this catches: a reversed plan that starts being mirrored,
 * rebuilt or partially reused; a direction change that begins clearing route
 * progress, packing, trip, journal, notes or the recovery copy; an unknown
 * direction that stops falling back to the canonical one; re-selecting the
 * active direction acquiring a side effect; and the original of a discarded
 * plan silently disappearing instead of being set aside.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DIRECTION,
  REVERSE_DIRECTION,
  ROUTE_DIRECTIONS,
  isReversed,
  isRouteDirection,
  normalizeDirection,
  oppositeDirection,
} from '../src/route/direction.mjs';
import { defaultState, normalizeState } from '../src/utils/stateMigration.mjs';

// ---- Fixtures ---------------------------------------------------------------

const TOPOLOGY = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

const leg = (id, stageId, orientation) => ({ id, kind: 'canonical-stage', stageId, orientation });

/** A forward plan: travel in, a combined hiking day, a rest day, a walk out. */
const forwardPlan = () => ({
  direction: DEFAULT_DIRECTION,
  startDate: '2026-09-03',
  journeyActive: true,
  currentDayId: 'day_2',
  currentLegId: 'leg_2b',
  days: [
    { id: 'day_1', activities: [{ kind: 'travel' }] },
    {
      id: 'day_2',
      activities: [
        { kind: 'hiking', legs: [leg('leg_2a', 'd1', 'canonical'), leg('leg_2b', 'd2', 'canonical')] },
      ],
      overnight: { kind: 'stop', stopId: 'alesjaure' },
    },
    { id: 'day_3', activities: [{ kind: 'rest' }] },
    { id: 'day_4', activities: [{ kind: 'hiking', legs: [leg('leg_4a', 'd3', 'canonical')] }] },
  ],
});

/** Everything personal a user can accumulate, so "untouched" has teeth. */
function populatedState(direction, dayPlan) {
  const s = defaultState('d1');
  s.currentStageId = 'd4';
  s.routeDirection = direction;
  s.hutData = { salka: { notes: 'Sauna coins!' }, abisko: { notes: 'Bunk 4' } };
  s.journal = [
    { id: 'j_1', date: '2026-09-04', stageId: 'd2', mood: 4, highlight: 'Lapporten', updatedAt: 1 },
  ];
  s.packing = s.packing.map((item, i) => (i === 0 ? { ...item, status: 'packed' } : item));
  s.packing.push({
    id: 'custom_rod',
    label: 'Fishing rod',
    categoryId: 'comfort',
    quantity: 1,
    status: 'ready',
    weightGrams: 340,
    essential: false,
    wornQuantity: 0,
    custom: true,
  });
  s.trip = [
    {
      id: 'trip_bus',
      kind: 'transport',
      title: 'Bus 91 to Abisko',
      status: 'confirmed',
      mode: 'bus',
      date: '2026-09-03',
      attachmentIds: ['doc_ticket'],
      createdAt: 1,
      updatedAt: 2,
    },
    {
      id: 'trip_salka',
      kind: 'stay',
      title: 'Sälka hut',
      status: 'planned',
      stayType: 'mountain-hut',
      checkInDate: '2026-09-05',
      attachmentIds: [],
      linkedPlaceId: 'salka',
      createdAt: 1,
      updatedAt: 2,
    },
  ];
  s.dayPlan = dayPlan;
  return s;
}

const load = (state) => normalizeState(structuredClone(state), 'd1', TOPOLOGY);

/** Everything except the plan and its recovery copy — the "untouched" set. */
const personalData = (s) => ({
  currentStageId: s.currentStageId,
  hutData: s.hutData,
  journal: s.journal,
  packing: s.packing,
  packingTemplateVersion: s.packingTemplateVersion,
  trip: s.trip,
  schemaVersion: s.schemaVersion,
});

// ---- The direction vocabulary ----------------------------------------------
//
// The vocabulary itself (two values, canonical first, the involution) is
// already behaviourally covered by tests/route-direction.test.mjs. What
// matters HERE is the one property the load path leans on: no input can
// produce an unusable direction, so a corrupt blob can never leave the app
// without one — and can never make a stored plan look like it agrees.

test('every direction predicate agrees that an unusable value is the canonical one', () => {
  for (const bad of [null, undefined, '', 'north', 'ABISKO-TO-NIKKALUOKTA', 42, {}, []]) {
    assert.equal(isRouteDirection(bad), false, String(bad));
    assert.equal(normalizeDirection(bad), DEFAULT_DIRECTION, String(bad));
    assert.equal(isReversed(bad), false, String(bad));
    assert.equal(oppositeDirection(bad), REVERSE_DIRECTION, String(bad));
  }
  assert.equal(ROUTE_DIRECTIONS.length, 2, 'one trail, two ways to walk it');
});

// ---- Changing direction WITHOUT a plan -------------------------------------

test('with no plan a direction change moves the direction and nothing else', () => {
  const before = load(populatedState(DEFAULT_DIRECTION, null));
  const after = load(populatedState(REVERSE_DIRECTION, null));
  assert.equal(before.routeDirection, DEFAULT_DIRECTION);
  assert.equal(after.routeDirection, REVERSE_DIRECTION);
  assert.equal(after.dayPlan, null, 'no plan is invented for the new direction');
  assert.equal(after.dayPlanRecovery, null, 'and nothing is set aside');
  assert.deepEqual(personalData(after), personalData(before));
});

test('an unknown persisted direction loads as canonical without disturbing anything', () => {
  const state = populatedState('sideways', null);
  const loaded = load(state);
  assert.equal(loaded.routeDirection, DEFAULT_DIRECTION);
  assert.deepEqual(personalData(loaded), personalData(load(populatedState(DEFAULT_DIRECTION, null))));
});

// ---- Changing direction WITH a plan ----------------------------------------

test('a plan authored for the other direction never loads — and is never mirrored', () => {
  const reversed = load(populatedState(REVERSE_DIRECTION, forwardPlan()));
  assert.equal(reversed.dayPlan, null, 'discarded, not mirrored or rebuilt');
  assert.equal(reversed.routeDirection, REVERSE_DIRECTION);
});

test('the reversal takes the plan and ONLY the plan', () => {
  const kept = load(populatedState(DEFAULT_DIRECTION, forwardPlan()));
  const reversed = load(populatedState(REVERSE_DIRECTION, forwardPlan()));

  assert.notEqual(kept.dayPlan, null, 'the same plan loads fine in its own direction');
  assert.equal(reversed.dayPlan, null);
  // Route progress, notes, journal, packing and the trip plan are identical
  // on both sides of the reversal — including `currentStageId`, which is a
  // STABLE physical segment id and exists in both directions.
  assert.deepEqual(personalData(reversed), personalData(kept));
  assert.equal(reversed.currentStageId, 'd4');
  assert.equal(reversed.hutData.salka.notes, 'Sauna coins!');
  assert.equal(reversed.journal.length, 1);
  assert.ok(reversed.packing.some((i) => i.id === 'custom_rod'));
  assert.equal(reversed.trip.length, 2);
  assert.deepEqual(reversed.trip.find((i) => i.id === 'trip_bus').attachmentIds, ['doc_ticket']);
});

test('CHARACTERIZED: the discarded plan is set aside verbatim, labelled "unreadable"', () => {
  // Data preservation over tidiness: the original crosses the boundary
  // intact, so Settings can still export or explicitly remove it. The REASON
  // wording is the characterized part — a plan refused purely for pointing
  // the other way is perfectly readable, and the v10 shape lands on the
  // generic 'unreadable' label rather than a direction-specific one. Pinned
  // as-is; see the PR's behaviour findings.
  const reversed = load(populatedState(REVERSE_DIRECTION, forwardPlan()));
  assert.equal(reversed.dayPlanRecovery.reason, 'unreadable');
  assert.deepEqual(reversed.dayPlanRecovery.dayPlan, forwardPlan());
  assert.equal(reversed.dayPlanRecovery.dayPlan.days.length, 4, 'every day survives the set-aside');
  assert.equal(reversed.dayPlanRecovery.dayPlan.currentLegId, 'leg_2b');
});

test('a LEGACY plan refused for the same reason is labelled migration-failed', () => {
  // The two reasons are distinguishable, which is what lets Settings explain
  // what happened. A v9 stage-count plan for the other direction reports the
  // migration label, not the generic one.
  const legacy = {
    direction: DEFAULT_DIRECTION,
    startDate: '2026-09-03',
    currentDayId: null,
    days: [{ id: 'day_l1', activities: [{ kind: 'hiking', stages: 7 }] }],
  };
  const reversed = load(populatedState(REVERSE_DIRECTION, legacy));
  assert.equal(reversed.dayPlan, null);
  assert.equal(reversed.dayPlanRecovery.reason, 'migration-failed');
  assert.deepEqual(reversed.dayPlanRecovery.dayPlan, legacy);
});

test('an existing recovery copy is never overwritten by a later discard', () => {
  // The first preserved original is the one the user has not decided about
  // yet; a second failure must not replace it.
  const original = { direction: DEFAULT_DIRECTION, startDate: '2026-01-01', days: 'unreadable' };
  const state = populatedState(REVERSE_DIRECTION, forwardPlan());
  state.dayPlanRecovery = { reason: 'migration-failed', dayPlan: original };
  const loaded = load(state);
  assert.equal(loaded.dayPlan, null);
  assert.equal(loaded.dayPlanRecovery.reason, 'migration-failed');
  assert.deepEqual(loaded.dayPlanRecovery.dayPlan, original, 'the FIRST original wins');
});

test('a reversed plan is discarded whole — no day, leg or overnight is salvaged', () => {
  const reversed = load(populatedState(REVERSE_DIRECTION, forwardPlan()));
  assert.equal(reversed.dayPlan, null);
  // Nothing leaks into the rest of the state either: no orphan day list, no
  // half-plan, no re-oriented legs hiding anywhere.
  const serialized = JSON.stringify({ ...reversed, dayPlanRecovery: null });
  for (const marker of ['leg_2a', 'leg_2b', 'day_1', 'day_2', 'canonical-stage', 'journeyActive']) {
    assert.ok(!serialized.includes(marker), `no trace of ${marker} outside the recovery copy`);
  }
});

// ---- Re-selecting the SAME direction ---------------------------------------

test('re-selecting the active direction changes nothing at all', () => {
  // A semantic no-op: the plan stays, its pointers stay, and every other
  // field is content-identical. (The store additionally returns the SAME
  // state object to avoid a re-render; that identity optimisation is a React
  // concern and is not part of this boundary contract.)
  const state = populatedState(DEFAULT_DIRECTION, forwardPlan());
  const once = load(state);
  const twice = normalizeState(structuredClone(once), 'd1', TOPOLOGY);
  assert.deepEqual(twice, once, 'normalisation is idempotent');
  assert.deepEqual(twice.dayPlan, forwardPlan(), 'the plan survives verbatim');
  assert.equal(twice.dayPlan.currentDayId, 'day_2');
  assert.equal(twice.dayPlan.currentLegId, 'leg_2b');
  assert.equal(twice.dayPlanRecovery, null, 'no recovery copy is manufactured');
});

test('a plan written for the reverse direction loads when that IS the direction', () => {
  // The refusal is about disagreement, not about the reverse direction being
  // second-class: an opposite-oriented plan is ordinary data.
  const plan = {
    direction: REVERSE_DIRECTION,
    startDate: '2026-09-03',
    journeyActive: true,
    currentDayId: 'day_r1',
    currentLegId: 'leg_r1',
    days: [
      { id: 'day_r1', activities: [{ kind: 'hiking', legs: [leg('leg_r1', 'd7', 'opposite')] }] },
    ],
  };
  const loaded = load(populatedState(REVERSE_DIRECTION, plan));
  assert.deepEqual(loaded.dayPlan, plan);
  assert.equal(loaded.dayPlanRecovery, null);
});

test('changing direction never creates a plan out of the other one', () => {
  // Planning stays opt-in across a reversal: no default days, no mirrored
  // day count, no start date carried over.
  const reversed = load(populatedState(REVERSE_DIRECTION, forwardPlan()));
  const neverPlanned = load(populatedState(REVERSE_DIRECTION, null));
  assert.equal(reversed.dayPlan, null);
  assert.equal(neverPlanned.dayPlan, null);
  assert.deepEqual(personalData(reversed), personalData(neverPlanned));
});
