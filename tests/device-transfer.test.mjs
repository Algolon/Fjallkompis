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
  return s;
}

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
  return normalizeState(candidate, 'd1');
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
