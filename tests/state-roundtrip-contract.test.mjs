/**
 * CHARACTERIZATION — the export → import round trip for a full v10 state.
 *
 * The JSON backup is the ONLY way a user's data leaves a device: there is no
 * account and no backend. vNext re-homes almost every screen that writes that
 * data, so the round trip's promise — everything meaningful comes back, and
 * what cannot come back is visibly absent rather than silently dropped — has
 * to be pinned against a state that actually exercises the v10 model.
 *
 * This file EXTENDS tests/device-transfer.test.mjs (which stays as it is)
 * with the shapes that file does not carry together: an ACTIVE journey, a
 * combined hiking day, a stage walked twice in one day AND again on another,
 * explicit overnights of both kinds, a rest day, a travel day, both pointers,
 * and unknown/future fields at four different depths.
 *
 * Seam: `normalizeState` (src/utils/stateMigration.mjs) is the exact function
 * the app runs on load and on import. The envelope wrapper around it lives in
 * src/utils/exportImport.ts, which `node --test` cannot import; it is
 * mirrored here (five lines, marked below) exactly as the existing
 * device-transfer test mirrors it.
 *
 * Regressions this catches: any personal field lost or reshaped by a round
 * trip; a leg order, orientation or repeat quietly collapsing; an explicit
 * overnight degrading to a derived one; pointers surviving as an inconsistent
 * pair; a recovery copy being "repaired" instead of preserved; normalisation
 * stopping being idempotent; and a change to which unknown fields survive.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, defaultState, normalizeState } from '../src/utils/stateMigration.mjs';

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

/**
 * The plan a real personalised journey produces:
 *
 *   day_1  travel in, sleeping at Abisko          (explicit STOP overnight)
 *   day_2  d1 + d2 in one walk                    (a COMBINED hiking day)
 *   day_3  rest
 *   day_4  d3 out and d3 back                     (a stage walked TWICE, in
 *                                                  one day, in both
 *                                                  orientations) + an
 *                                                  explicit STAY overnight
 *   day_5  d3 once more, then travel home         (the same stage again, on
 *                                                  another day)
 *
 * …with the journey ACTIVE and both progress pointers on day_4's return leg.
 */
const dayPlan = () => ({
  direction: 'abisko-to-nikkaluokta',
  startDate: '2026-09-03',
  journeyActive: true,
  currentDayId: 'day_4',
  currentLegId: 'leg_4b',
  days: [
    {
      id: 'day_1',
      activities: [{ kind: 'travel' }],
      overnight: { kind: 'stop', stopId: 'abisko' },
    },
    {
      id: 'day_2',
      activities: [
        { kind: 'hiking', legs: [leg('leg_2a', 'd1', 'canonical'), leg('leg_2b', 'd2', 'canonical')] },
      ],
    },
    { id: 'day_3', activities: [{ kind: 'rest' }] },
    {
      id: 'day_4',
      activities: [
        { kind: 'hiking', legs: [leg('leg_4a', 'd3', 'canonical'), leg('leg_4b', 'd3', 'opposite')] },
      ],
      overnight: { kind: 'stay', tripItemId: 'trip_salka' },
    },
    {
      id: 'day_5',
      activities: [
        { kind: 'hiking', legs: [leg('leg_5a', 'd3', 'canonical')] },
        { kind: 'travel' },
      ],
    },
  ],
});

function populatedState() {
  const s = defaultState('d1');
  s.currentStageId = 'd3';
  s.routeDirection = 'abisko-to-nikkaluokta';
  s.hutData = { salka: { notes: 'Sauna coins!' }, tjaktja: { notes: 'Windy pass' } };
  s.journal = [
    {
      id: 'j_1',
      date: '2026-09-04',
      stageId: 'd2',
      mood: 4,
      energy: 3,
      weather: 'clear',
      highlight: 'Lapporten',
      reflection: 'Slow is fine.',
      updatedAt: 1_751_400_000_000,
    },
  ];
  s.packing = s.packing.map((item, i) =>
    i === 0
      ? { ...item, status: 'packed' }
      : i === 1
        ? { ...item, status: 'ready', quantity: 3 }
        : item,
  );
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
      from: 'Kiruna',
      to: 'Abisko Turiststation',
      date: '2026-09-03',
      departureTime: '08:20',
      provider: 'Länstrafiken Norrbotten',
      bookingReference: 'LTN-778',
      attachmentIds: ['doc_ticket'],
      linkedTransportId: 'line-91',
      createdAt: 1_751_400_000_000,
      updatedAt: 1_751_400_001_000,
    },
    {
      id: 'trip_salka',
      kind: 'stay',
      title: 'Sälka hut',
      status: 'planned',
      stayType: 'mountain-hut',
      checkInDate: '2026-09-06',
      checkOutDate: '2026-09-07',
      attachmentIds: [],
      linkedPlaceId: 'salka',
      createdAt: 1_751_400_000_000,
      updatedAt: 1_751_400_000_000,
    },
  ];
  s.dayPlan = dayPlan();
  return s;
}

/**
 * Mirrors buildExport + parseImport (src/utils/exportImport.ts) — the TS
 * module cannot be imported by node --test. The mirrored part is only the
 * envelope; the normalisation IS the real one.
 */
function roundTrip(state) {
  const envelope = {
    app: 'fjallkompis',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-09-06T09:15:00.000Z',
    state,
  };
  const parsed = JSON.parse(JSON.stringify(envelope, null, 2));
  const candidate = parsed.app === 'fjallkompis' && parsed.state ? parsed.state : parsed;
  return normalizeState(candidate, 'd1', TOPOLOGY);
}

const load = (raw) => normalizeState(structuredClone(raw), 'd1', TOPOLOGY);

// ---- The round trip itself --------------------------------------------------

test('a full v10 journey survives export → import with nothing changed', () => {
  const original = populatedState();
  const restored = roundTrip(original);
  // The strongest statement available: crossing the JSON boundary produces
  // exactly what loading the same blob locally produces. Any field lost,
  // reordered or reshaped in transit fails here first.
  assert.deepEqual(restored, load(original));
});

test('the active journey and both progress pointers arrive intact', () => {
  const restored = roundTrip(populatedState());
  assert.equal(restored.dayPlan.journeyActive, true);
  assert.equal(restored.dayPlan.currentDayId, 'day_4');
  assert.equal(restored.dayPlan.currentLegId, 'leg_4b');
  assert.equal(restored.currentStageId, 'd3', 'route progress is its own pointer');
});

test('every planned day keeps its composition, order and overnight', () => {
  const restored = roundTrip(populatedState());
  assert.deepEqual(restored.dayPlan, dayPlan(), 'the plan is byte-for-byte the same plan');
  assert.deepEqual(
    restored.dayPlan.days.map((d) => d.activities.map((a) => a.kind)),
    [['travel'], ['hiking'], ['rest'], ['hiking'], ['hiking', 'travel']],
  );
  assert.deepEqual(restored.dayPlan.days[0].overnight, { kind: 'stop', stopId: 'abisko' });
  assert.deepEqual(restored.dayPlan.days[3].overnight, { kind: 'stay', tripItemId: 'trip_salka' });
  assert.ok(!('overnight' in restored.dayPlan.days[2]), 'a derived overnight stays derived');
});

test('a combined hiking day keeps BOTH legs, in order', () => {
  const combined = roundTrip(populatedState()).dayPlan.days[1].activities[0];
  assert.deepEqual(combined.legs.map((l) => l.stageId), ['d1', 'd2']);
  assert.deepEqual(combined.legs.map((l) => l.id), ['leg_2a', 'leg_2b']);
});

test('a stage walked twice arrives as two occurrences, orientations intact', () => {
  const restored = roundTrip(populatedState());
  const outAndBack = restored.dayPlan.days[3].activities[0].legs;
  assert.deepEqual(outAndBack.map((l) => l.stageId), ['d3', 'd3']);
  assert.deepEqual(outAndBack.map((l) => l.orientation), ['canonical', 'opposite']);
  // …and the third occurrence, on another day, is still separate.
  const later = restored.dayPlan.days[4].activities[0].legs;
  assert.deepEqual(later.map((l) => l.id), ['leg_5a']);
  const allD3 = restored.dayPlan.days
    .flatMap((d) => d.activities)
    .filter((a) => a.kind === 'hiking')
    .flatMap((a) => a.legs)
    .filter((l) => l.stageId === 'd3');
  assert.equal(allD3.length, 3, 'no repeat is deduplicated away');
});

test('trip, packing, notes and journal all ride along unchanged', () => {
  const original = populatedState();
  const restored = roundTrip(original);
  assert.deepEqual(restored.trip, original.trip);
  assert.equal(restored.hutData.salka.notes, 'Sauna coins!');
  assert.deepEqual(restored.journal, original.journal);
  assert.equal(restored.packing.length, original.packing.length);
  assert.equal(restored.packing[0].status, 'packed');
  assert.equal(restored.packing[1].quantity, 3);
  assert.deepEqual(restored.packing.find((i) => i.id === 'custom_rod'), original.packing.at(-1));
});

test('the export is honest about what it cannot carry', () => {
  // Document BLOBS live in IndexedDB and never ride the JSON. What crosses is
  // the reference, so the new device can say the file is missing instead of
  // pretending the attachment is gone.
  const restored = roundTrip(populatedState());
  assert.deepEqual(restored.trip.find((i) => i.id === 'trip_bus').attachmentIds, ['doc_ticket']);
  const serialized = JSON.stringify(restored);
  assert.ok(!serialized.includes('base64'), 'no file bytes ride the backup');
  // The transient Today preview is runtime state and is not persisted state
  // at all — it can never appear in an export.
  assert.ok(!/previewDayId|previewPlannedDay/i.test(serialized));
});

test('the round trip is idempotent and JSON-stable', () => {
  const once = roundTrip(populatedState());
  const twice = roundTrip(once);
  assert.deepEqual(twice, once);
  // Nothing in the normalised state is lost by serialisation itself (an
  // `undefined` value or a non-JSON type would silently disappear here).
  assert.deepEqual(JSON.parse(JSON.stringify(once)), once);
  assert.equal(once.schemaVersion, SCHEMA_VERSION);
});

// ---- A bare state, with no envelope ----------------------------------------

test('a bare state object imports exactly like an enveloped one', () => {
  const original = populatedState();
  const bare = normalizeState(JSON.parse(JSON.stringify(original)), 'd1', TOPOLOGY);
  assert.deepEqual(bare, roundTrip(original));
});

test('an envelope missing its app marker is read as a bare state', () => {
  // parseImport only unwraps `app === 'fjallkompis'`; anything else is fed to
  // the normaliser as-is, which then falls back to defaults field by field
  // rather than refusing the file.
  const enveloped = { schemaVersion: SCHEMA_VERSION, state: populatedState() };
  const restored = normalizeState(enveloped, 'd1', TOPOLOGY);
  assert.equal(restored.dayPlan, null, 'the nested state is not reached');
  assert.equal(restored.currentStageId, 'd1', 'and the default stage is used');
  assert.deepEqual(restored.trip, []);
});

test('unusable input normalises to the default state instead of throwing', () => {
  for (const raw of [null, undefined, 42, 'a string', [], [populatedState()]]) {
    const restored = normalizeState(raw, 'd1', TOPOLOGY);
    assert.deepEqual(restored, defaultState('d1'), String(raw));
  }
});

// ---- Unknown and future fields ---------------------------------------------

test('CHARACTERIZED: unknown fields survive where records are user data, and are dropped where the schema is closed', () => {
  // Three different answers today, all deliberate-looking and none of them
  // documented in one place — so all three are pinned:
  //   - top level:         DROPPED (the normaliser rebuilds a known shape);
  //   - inside the plan:   DROPPED (plan/day/leg shapes are closed);
  //   - trip and journal:  KEPT    (records pass through, for additive links).
  const state = populatedState();
  state.futureTopLevel = { anything: true };
  state.dayPlan.futurePlanField = 'plan';
  state.dayPlan.days[0].futureDayField = 'day';
  state.dayPlan.days[1].activities[0].legs[0].futureLegField = 'leg';
  state.trip[0].futureTripField = 'trip';
  state.journal[0].futureJournalField = 'journal';

  const restored = roundTrip(state);
  assert.ok(!('futureTopLevel' in restored), 'top-level extras are dropped');
  assert.ok(!('futurePlanField' in restored.dayPlan), 'plan extras are dropped');
  assert.ok(!('futureDayField' in restored.dayPlan.days[0]), 'day extras are dropped');
  assert.ok(
    !('futureLegField' in restored.dayPlan.days[1].activities[0].legs[0]),
    'leg extras are dropped',
  );
  assert.equal(restored.trip[0].futureTripField, 'trip', 'trip item extras SURVIVE');
  assert.equal(restored.journal[0].futureJournalField, 'journal', 'journal extras SURVIVE');
  // Dropping the extras never costs the record itself.
  assert.equal(restored.dayPlan.days.length, 5);
  assert.deepEqual(restored.dayPlan.days[1].activities[0].legs.map((l) => l.id), [
    'leg_2a',
    'leg_2b',
  ]);
});

test('an unknown top-level field never blocks the rest of the import', () => {
  const state = { ...populatedState(), schemaVersion: 99, somethingFromTheFuture: [1, 2, 3] };
  const restored = roundTrip(state);
  assert.equal(restored.schemaVersion, SCHEMA_VERSION, 'the version is restamped, not trusted');
  assert.equal(restored.currentStageId, 'd3');
  assert.notEqual(restored.dayPlan, null);
});

test('an unknown activity kind is dropped without taking its day down', () => {
  const state = populatedState();
  state.dayPlan.days[2] = { id: 'day_3', activities: [{ kind: 'rest' }, { kind: 'kayaking' }] };
  const restored = roundTrip(state);
  assert.deepEqual(restored.dayPlan.days[2], { id: 'day_3', activities: [{ kind: 'rest' }] });
  assert.equal(restored.dayPlan.days.length, 5);
});

// ---- The recovery copy ------------------------------------------------------

test('a recovery copy with unknown, legacy content crosses verbatim', () => {
  // Whatever the original was — a retired draft shape, a v9 plan, something
  // nobody recognises — it is the user's data and is preserved exactly. It is
  // never re-validated, "repaired" or replaced.
  const original = {
    direction: 'abisko-to-nikkaluokta',
    firstDate: '2026-08-23',
    groups: [1, 1, 2, 1, 1, 1],
    days: [{ id: 'day_b1', activities: [{ kind: 'hiking', stages: 99 }], note: 'over-consumed' }],
    somethingOnlyTheOldAppKnew: { nested: { deeply: true } },
  };
  const state = populatedState();
  state.dayPlanRecovery = { reason: 'migration-failed', dayPlan: original };
  const restored = roundTrip(state);
  assert.deepEqual(restored.dayPlanRecovery.dayPlan, original);
  assert.equal(restored.dayPlanRecovery.reason, 'migration-failed');
  // The recovery copy rides ALONGSIDE a working plan — it is not a
  // replacement for one.
  assert.notEqual(restored.dayPlan, null);
  assert.equal(restored.dayPlan.currentLegId, 'leg_4b');
});

test('an unrecognised recovery reason normalises without touching the copy', () => {
  const state = populatedState();
  state.dayPlanRecovery = { reason: 'who-knows', dayPlan: { anything: 1 } };
  const restored = roundTrip(state);
  assert.equal(restored.dayPlanRecovery.reason, 'unreadable', 'only two reasons exist');
  assert.deepEqual(restored.dayPlanRecovery.dayPlan, { anything: 1 }, 'the copy is untouched');
});

test('a recovery entry carrying nothing recoverable is dropped, not faked', () => {
  const state = populatedState();
  state.dayPlanRecovery = { reason: 'migration-failed' };
  assert.equal(roundTrip(state).dayPlanRecovery, null);
});

test('a plan that cannot load is set aside rather than lost — with everything else intact', () => {
  const state = populatedState();
  const broken = { direction: 'abisko-to-nikkaluokta', startDate: 'whenever', days: 'x' };
  state.dayPlan = broken;
  const restored = roundTrip(state);
  assert.equal(restored.dayPlan, null);
  assert.deepEqual(restored.dayPlanRecovery, { reason: 'unreadable', dayPlan: broken });
  assert.equal(restored.currentStageId, 'd3');
  assert.equal(restored.trip.length, 2);
  assert.ok(restored.packing.some((i) => i.id === 'custom_rod'));
});

test('a plan whose leg references an unknown stage refuses as a whole', () => {
  // Partial resolution is never offered: a plan is either the journey the
  // user authored or it is set aside for them to look at.
  const state = populatedState();
  state.dayPlan.days[1].activities[0].legs[1] = leg('leg_2b', 'd99', 'canonical');
  const restored = roundTrip(state);
  assert.equal(restored.dayPlan, null, 'no half-resolved plan is produced');
  assert.equal(restored.dayPlanRecovery.dayPlan.days.length, 5, 'the original is preserved');
  assert.equal(restored.currentStageId, 'd3', 'everything else still loads');
});

test('duplicate leg identities refuse the plan rather than silently merging', () => {
  const state = populatedState();
  state.dayPlan.days[4].activities[0].legs = [leg('leg_4a', 'd3', 'canonical')];
  const restored = roundTrip(state);
  assert.equal(restored.dayPlan, null);
  assert.equal(restored.dayPlanRecovery.reason, 'unreadable');
});
