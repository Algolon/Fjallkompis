/**
 * Device-transfer round trip: the full-state JSON export must carry ALL
 * personal data (current stage, packing statuses and custom items, stop
 * notes, journal) so a manual export → import moves a user's data intact
 * between devices. Exports made before the Daily checklist was archived may
 * still carry a `checklist` map — importing them must keep working, with
 * only that retired key ignored.
 *
 * The export envelope is { app, schemaVersion, exportedAt, state } (see
 * src/utils/exportImport.ts) and import runs the same normalizeState the
 * app uses on load — this test drives that exact module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  defaultState,
  normalizeState,
} from '../src/utils/stateMigration.mjs';

/** A populated state, as a real trip-in-progress would persist it. */
function populatedState() {
  const s = defaultState('d3');
  s.hutData = { salka: { notes: 'Sauna coins!' }, abisko: { notes: 'Bunk 4' } };
  s.journal = [
    {
      id: 'j_1',
      date: '2026-07-01',
      stageId: 'd2',
      mood: 4,
      energy: 3,
      weather: 'clear',
      highlight: 'Lapporten',
      challenge: 'Heavy pack',
      reflection: 'Slow is fine.',
      updatedAt: 1751400000000,
    },
  ];
  // Mutate packing the way the app does: statuses on seed items + a custom item.
  s.packing = s.packing.map((item, i) =>
    i === 0
      ? { ...item, status: 'packed' }
      : i === 1
        ? { ...item, status: 'ready', quantity: 2 }
        : item,
  );
  s.packing.push({
    id: 'custom_abc',
    label: 'Fishing rod',
    categoryId: 'comfort',
    quantity: 1,
    status: 'ready',
    weightGrams: 340,
    essential: false,
    custom: true,
  });
  // Trip plan items — including one whose attached document exists only on
  // the ORIGINAL device (the file blob never rides the JSON backup).
  s.trip = [
    {
      id: 'trip_bus',
      kind: 'transport',
      title: 'Bus 91 to Abisko',
      status: 'confirmed',
      mode: 'bus',
      from: 'Kiruna',
      to: 'Abisko Turiststation',
      date: '2026-08-22',
      departureTime: '08:20',
      provider: 'Länstrafiken Norrbotten',
      bookingReference: 'LTN-778',
      attachmentIds: ['doc_ticket'],
      linkedTransportId: 'line-91',
      createdAt: 1751400000000,
      updatedAt: 1751400001000,
    },
    {
      id: 'trip_salka',
      kind: 'stay',
      title: 'Sälka hut',
      status: 'planned',
      stayType: 'mountain-hut',
      checkInDate: '2026-08-25',
      checkOutDate: '2026-08-26',
      attachmentIds: [],
      linkedStopId: 'salka',
      createdAt: 1751400000000,
      updatedAt: 1751400000000,
    },
  ];
  return s;
}

/** Canonical Kungsleden stage topology — what src/utils/storage.ts passes through. */
const STAGE_COUNT = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

/** Mirrors buildExport + parseImport (src/utils/exportImport.ts). */
function exportImportRoundTrip(state) {
  const envelope = {
    app: 'fjallkompis',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
  const text = JSON.stringify(envelope, null, 2);
  const parsed = JSON.parse(text);
  const candidate =
    parsed.app === 'fjallkompis' && parsed.state ? parsed.state : parsed;
  return normalizeState(candidate, 'd1', STAGE_COUNT);
}

test('full-state transfer preserves the current stage', () => {
  const restored = exportImportRoundTrip(populatedState());
  assert.equal(restored.currentStageId, 'd3');
});

test('a pre-archive export with checklist data still imports cleanly', () => {
  // Simulates an export file written while the Daily checklist existed
  // (schema v2): the retired key is ignored, nothing else is lost.
  const legacy = {
    ...populatedState(),
    schemaVersion: 2,
    checklist: { 'morning.1': true, 'safety.2': true },
  };
  const restored = exportImportRoundTrip(legacy);
  assert.ok(!('checklist' in restored), 'retired checklist key is dropped');
  assert.equal(restored.currentStageId, 'd3');
  assert.equal(restored.hutData.salka.notes, 'Sauna coins!');
  assert.equal(restored.journal.length, 1);
  assert.ok(restored.packing.some((i) => i.id === 'custom_abc'));
});

test('full-state transfer preserves packing statuses, quantities and custom items', () => {
  const original = populatedState();
  const restored = exportImportRoundTrip(original);

  assert.equal(restored.packing[0].status, 'packed');
  assert.equal(restored.packing[1].status, 'ready');
  assert.equal(restored.packing[1].quantity, 2);

  const custom = restored.packing.find((i) => i.id === 'custom_abc');
  assert.ok(custom, 'custom packing item survives the round trip');
  assert.equal(custom.label, 'Fishing rod');
  assert.equal(custom.categoryId, 'comfort');
  assert.equal(custom.status, 'ready');
  assert.equal(custom.weightGrams, 340);
  assert.equal(custom.custom, true);

  // Nothing gained, nothing lost.
  assert.equal(restored.packing.length, original.packing.length);
});

test('full-state transfer preserves stop notes and journal entries', () => {
  const restored = exportImportRoundTrip(populatedState());
  assert.equal(restored.hutData.salka.notes, 'Sauna coins!');
  assert.equal(restored.hutData.abisko.notes, 'Bunk 4');
  assert.equal(restored.journal.length, 1);
  assert.equal(restored.journal[0].highlight, 'Lapporten');
});

test('a bare state object (no envelope) also imports', () => {
  const restored = normalizeState(populatedState(), 'd1');
  assert.equal(restored.currentStageId, 'd3');
  assert.ok(restored.packing.some((i) => i.id === 'custom_abc'));
});

test('export/import preserves the selected route direction', () => {
  const s = populatedState();
  s.routeDirection = 'nikkaluokta-to-abisko';
  const restored = exportImportRoundTrip(s);
  assert.equal(restored.routeDirection, 'nikkaluokta-to-abisko');
  // Unrelated data still intact.
  assert.equal(restored.currentStageId, 'd3');
  assert.equal(restored.hutData.salka.notes, 'Sauna coins!');
});

test('an older export without a direction imports as the canonical default', () => {
  // A pre-v4 export never carried routeDirection.
  const legacy = { ...populatedState(), schemaVersion: 3 };
  delete legacy.routeDirection;
  const restored = exportImportRoundTrip(legacy);
  assert.equal(restored.routeDirection, 'abisko-to-nikkaluokta');
  assert.ok(restored.packing.some((i) => i.id === 'custom_abc'), 'personal data survives');
});

// ---- Trip plan (schema v5) --------------------------------------------------

test('full-state transfer preserves travel and stay items verbatim', () => {
  const original = populatedState();
  const restored = exportImportRoundTrip(original);
  assert.deepEqual(restored.trip, original.trip);
  const bus = restored.trip.find((i) => i.id === 'trip_bus');
  assert.equal(bus.status, 'confirmed');
  assert.equal(bus.bookingReference, 'LTN-778');
  assert.equal(bus.linkedTransportId, 'line-91');
  const salka = restored.trip.find((i) => i.id === 'trip_salka');
  assert.equal(salka.linkedStopId, 'salka');
  assert.equal(salka.checkInDate, '2026-08-25');
});

test('attachment REFERENCES ride the backup; the restored item keeps them so the UI can flag the missing file honestly', () => {
  // The document blob itself lives in IndexedDB and never rides the JSON
  // export. On the new device the reference must survive as data — the Trip
  // UI then shows "not available on this device" and offers removing the
  // stale link or re-attaching, instead of dropping or faking the file.
  const restored = exportImportRoundTrip(populatedState());
  assert.deepEqual(restored.trip.find((i) => i.id === 'trip_bus').attachmentIds, ['doc_ticket']);
});

test('an older export without trip data imports as an empty trip plan', () => {
  const legacy = { ...populatedState(), schemaVersion: 4 };
  delete legacy.trip;
  const restored = exportImportRoundTrip(legacy);
  assert.deepEqual(restored.trip, [], 'nothing is fabricated');
  assert.ok(restored.packing.some((i) => i.id === 'custom_abc'), 'personal data survives');
});

test('full-state transfer preserves a configured day plan (v10 legs) verbatim', () => {
  const state = populatedState();
  state.routeDirection = 'abisko-to-nikkaluokta';
  state.dayPlan = {
    direction: 'abisko-to-nikkaluokta',
    startDate: '2026-08-23',
    currentDayId: 'day_a2',
    currentLegId: 'leg_a2_1',
    days: [
      { id: 'day_a1', activities: [{ kind: 'travel' }], overnight: { kind: 'stop', stopId: 'abisko' } },
      { id: 'day_a2', activities: [{ kind: 'hiking', legs: [
        { id: 'leg_a2_1', kind: 'canonical-stage', stageId: 'd1', orientation: 'canonical' },
        { id: 'leg_a2_2', kind: 'canonical-stage', stageId: 'd2', orientation: 'canonical' },
      ] }] },
      { id: 'day_a3', activities: [{ kind: 'rest' }] },
      { id: 'day_a4', activities: [{ kind: 'hiking', legs: [
        { id: 'leg_a4_1', kind: 'canonical-stage', stageId: 'd7', orientation: 'canonical' },
        { id: 'leg_a4_2', kind: 'canonical-stage', stageId: 'd7', orientation: 'opposite' },
      ] }, { kind: 'travel' }],
        overnight: { kind: 'stay', tripItemId: 'trip_salka' } },
    ],
  };
  const restored = exportImportRoundTrip(state);
  assert.deepEqual(restored.dayPlan, state.dayPlan, 'legs, pointers and overnights ride verbatim');
  // The plan rides alongside everything else — nothing is traded for it.
  assert.equal(restored.currentStageId, 'd3');
  assert.equal(restored.hutData.salka.notes, 'Sauna coins!');
  assert.equal(restored.trip.length, 2);
});

test('a v9 (stage-count) export imports as the deterministically migrated plan', () => {
  const state = populatedState();
  state.schemaVersion = 9;
  state.routeDirection = 'abisko-to-nikkaluokta';
  state.dayPlan = {
    direction: 'abisko-to-nikkaluokta',
    startDate: '2026-08-23',
    currentDayId: 'day_a2',
    days: [
      { id: 'day_a1', activities: [{ kind: 'travel' }], overnight: { kind: 'stop', stopId: 'abisko' } },
      { id: 'day_a2', activities: [{ kind: 'hiking', stages: 2 }] },
      { id: 'day_a3', activities: [{ kind: 'rest' }] },
      { id: 'day_a4', activities: [{ kind: 'hiking', stages: 5 }, { kind: 'travel' }],
        overnight: { kind: 'stay', tripItemId: 'trip_salka' } },
    ],
  };
  const restored = exportImportRoundTrip(state);
  assert.deepEqual(
    restored.dayPlan.days.map((d) =>
      d.activities.filter((a) => a.kind === 'hiking').flatMap((a) => a.legs.map((l) => l.stageId)),
    ),
    [[], ['d1', 'd2'], [], ['d3', 'd4', 'd5', 'd6', 'd7']],
  );
  assert.equal(restored.dayPlan.currentDayId, 'day_a2');
  assert.equal(restored.dayPlan.days[1].activities[0].legs[0].id, 'leg_day_a2_d1');
  assert.equal(restored.currentStageId, 'd3');
  assert.equal(restored.hutData.salka.notes, 'Sauna coins!');
});

test('an older export without a day plan imports as no plan (the default state)', () => {
  const legacy = { ...populatedState(), schemaVersion: 6 };
  delete legacy.dayPlan;
  const restored = exportImportRoundTrip(legacy);
  assert.equal(restored.dayPlan, null, 'nothing is fabricated');
  assert.equal(restored.currentStageId, 'd3', 'personal data survives');
});

test('a backup from a device walking the OTHER direction never reuses its plan', () => {
  const state = populatedState();
  state.routeDirection = 'abisko-to-nikkaluokta';
  state.dayPlan = {
    direction: 'nikkaluokta-to-abisko',
    startDate: '2026-08-23',
    currentDayId: null,
    days: [{ id: 'day_r1', activities: [{ kind: 'hiking', stages: 7 }] }],
  };
  const restored = exportImportRoundTrip(state);
  assert.equal(restored.dayPlan, null, 'discarded, never mirrored or rebuilt');
  assert.equal(restored.currentStageId, 'd3', 'route progress is untouched');
});

test('a set-aside Day plan recovery rides the export verbatim', () => {
  // The recovery copy is ordinary PersistentState, so the full-state JSON
  // export carries the original data honestly and a new device preserves it.
  const original = {
    direction: 'abisko-to-nikkaluokta',
    startDate: '2026-08-23',
    currentDayId: 'day_b1',
    days: [{ id: 'day_b1', activities: [{ kind: 'hiking', stages: 99 }], note: 'over-consumed' }],
  };
  const state = { ...populatedState(), dayPlanRecovery: { reason: 'migration-failed', dayPlan: original } };
  const restored = exportImportRoundTrip(state);
  assert.equal(restored.dayPlan, null);
  assert.equal(restored.dayPlanRecovery.reason, 'migration-failed');
  assert.equal(JSON.stringify(restored.dayPlanRecovery.dayPlan), JSON.stringify(original));
  assert.equal(restored.currentStageId, 'd3', 'everything else rides as before');
});

test('a malformed v9 export lands on a new device as recovery, not as loss', () => {
  const state = { ...populatedState(), schemaVersion: 9 };
  state.dayPlan = {
    direction: 'abisko-to-nikkaluokta',
    startDate: '2026-08-23',
    currentDayId: null,
    days: [{ id: 'day_u1', activities: [{ kind: 'hiking', stages: 3 }] }], // under-consumption
  };
  const restored = exportImportRoundTrip(state);
  assert.equal(restored.dayPlan, null, 'the plan cannot load');
  assert.equal(
    JSON.stringify(restored.dayPlanRecovery.dayPlan),
    JSON.stringify(state.dayPlan),
    'the original crossed the device boundary intact',
  );
});

test('a corrupt day plan never blocks the rest of the import', () => {
  const state = populatedState();
  state.dayPlan = { direction: 'abisko-to-nikkaluokta', startDate: 'whenever', days: 'x' };
  const restored = exportImportRoundTrip(state);
  assert.equal(restored.dayPlan, null);
  assert.equal(restored.currentStageId, 'd3');
  assert.ok(restored.packing.some((i) => i.id === 'custom_abc'));
});

test('an export made by the earlier draft imports as no plan', () => {
  const state = populatedState();
  state.dayPlan = {
    direction: 'abisko-to-nikkaluokta',
    firstDate: '2026-08-23',
    groups: [1, 1, 2, 1, 1, 1],
  };
  const restored = exportImportRoundTrip(state);
  assert.equal(restored.dayPlan, null, 'the retired shape is never partly read');
  assert.equal(restored.currentStageId, 'd3');
});
