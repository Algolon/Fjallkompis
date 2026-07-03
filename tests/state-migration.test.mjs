/**
 * Deterministic validation of the localStorage schema v1 → v2 migration
 * (src/utils/stateMigration.mjs — the exact module the app runs).
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  defaultState,
  normalizeState,
  seedPackingItems,
} from '../src/utils/stateMigration.mjs';
import { PACKING_CATEGORIES, SEED_PACKING_ITEMS } from '../src/data/packingSeed.mjs';

/** A realistic schema v1 blob, as the old app persisted it. */
const V1_STATE = {
  schemaVersion: 1,
  currentStageId: 'd3',
  checklist: { 'morning.1': true, 'safety.2': true, 'evening.3': false },
  hutData: {
    abisko: { notes: 'Bunk 4, kiosk closes 18:00', shopOverride: 'yes' },
    tjaktja: { notes: '', shopOverride: 'no' },
    salka: { notes: 'Great sauna — bring 20 kr coins' },
  },
  journal: [
    {
      id: 'j_abc',
      date: '2026-07-01',
      stageId: 'd2',
      mood: 4,
      energy: 3,
      weather: 'clear',
      highlight: 'First view of Lapporten',
      challenge: 'Heavy pack',
      reflection: 'Slow is fine.',
      updatedAt: 1751400000000,
    },
  ],
};

test('schema version is 2', () => {
  assert.equal(SCHEMA_VERSION, 2);
});

test('v1 → v2: schemaVersion is bumped and core fields survive', () => {
  const s = normalizeState(V1_STATE);
  assert.equal(s.schemaVersion, 2);
  assert.equal(s.currentStageId, 'd3');
  assert.deepEqual(s.checklist, V1_STATE.checklist);
  assert.equal(s.journal.length, 1);
  assert.deepEqual(s.journal[0], V1_STATE.journal[0]);
});

test('v1 → v2: hut notes are preserved verbatim, shopOverride is dropped', () => {
  const s = normalizeState(V1_STATE);
  assert.equal(s.hutData.abisko.notes, 'Bunk 4, kiosk closes 18:00');
  assert.equal(s.hutData.tjaktja.notes, '');
  assert.equal(s.hutData.salka.notes, 'Great sauna — bring 20 kr coins');
  for (const entry of Object.values(s.hutData)) {
    assert.ok(!('shopOverride' in entry), 'shopOverride must be removed');
  }
});

test('v1 → v2: packing is seeded with all seed items in "needed" state', () => {
  const s = normalizeState(V1_STATE);
  assert.equal(s.packing.length, SEED_PACKING_ITEMS.length);
  for (const item of s.packing) {
    assert.equal(item.status, 'needed');
    assert.equal(item.custom, false);
  }
});

test('migration is deterministic and idempotent', () => {
  const once = normalizeState(V1_STATE);
  const twice = normalizeState(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(normalizeState(V1_STATE), once);
});

test('v2 roundtrip: packing statuses, quantities and weights persist', () => {
  const s = defaultState('d1');
  s.packing[0].status = 'packed';
  s.packing[1].status = 'ready';
  s.packing[2].quantity = 4;
  s.packing[3].weightGrams = 1250;
  const out = normalizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(out.packing[0].status, 'packed');
  assert.equal(out.packing[1].status, 'ready');
  assert.equal(out.packing[2].quantity, 4);
  assert.equal(out.packing[3].weightGrams, 1250);
});

test('v2 roundtrip: custom packing items are preserved', () => {
  const s = defaultState('d1');
  s.packing.push({
    id: 'custom_x1',
    label: 'Fishing rod',
    categoryId: 'comfort',
    quantity: 1,
    status: 'ready',
    weightGrams: 300,
    essential: false,
    custom: true,
  });
  const out = normalizeState(JSON.parse(JSON.stringify(s)));
  const rod = out.packing.find((i) => i.id === 'custom_x1');
  assert.ok(rod, 'custom item survived');
  assert.equal(rod.label, 'Fishing rod');
  assert.equal(rod.status, 'ready');
  assert.equal(rod.weightGrams, 300);
  assert.equal(rod.custom, true);
});

test('custom item with unknown category falls back to comfort', () => {
  const s = defaultState('d1');
  s.packing.push({
    id: 'custom_x2',
    label: 'Mystery',
    categoryId: 'no-such-category',
    quantity: 1,
    status: 'needed',
    essential: false,
    custom: true,
  });
  const out = normalizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(out.packing.find((i) => i.id === 'custom_x2').categoryId, 'comfort');
});

test('malformed packing data never crashes and heals to seed defaults', () => {
  for (const bad of [
    undefined,
    null,
    'garbage',
    42,
    { not: 'an array' },
    [null, 42, 'x', {}, { id: 123 }],
    [{ id: 'pack.clothing.fleece', status: 'EXPLODED', quantity: -9, weightGrams: 'heavy' }],
  ]) {
    const s = normalizeState({ ...V1_STATE, packing: bad });
    assert.equal(s.packing.length, SEED_PACKING_ITEMS.length, `packing=${JSON.stringify(bad)}`);
    for (const item of s.packing) {
      assert.ok(['needed', 'ready', 'packed'].includes(item.status));
      assert.ok(Number.isInteger(item.quantity) && item.quantity >= 1);
      if (item.weightGrams !== undefined) {
        assert.ok(Number.isFinite(item.weightGrams) && item.weightGrams > 0);
      }
    }
  }
});

test('invalid status/quantity on a seed item resets to seed values, id kept', () => {
  const s = normalizeState({
    packing: [{ id: 'pack.clothing.fleece', status: 'nope', quantity: 0.2 }],
  });
  const fleece = s.packing.find((i) => i.id === 'pack.clothing.fleece');
  assert.equal(fleece.status, 'needed');
  assert.equal(fleece.quantity, 1);
});

test('completely malformed blobs load as defaults', () => {
  for (const bad of [undefined, null, 'x', 9, [], { schemaVersion: 'q' }]) {
    const s = normalizeState(bad, 'd1');
    assert.equal(s.schemaVersion, 2);
    assert.equal(s.currentStageId, 'd1');
    assert.deepEqual(s.checklist, {});
    assert.deepEqual(s.journal, []);
    assert.equal(s.packing.length, SEED_PACKING_ITEMS.length);
  }
});

test('non-custom unknown packing ids (retired seed items) are dropped', () => {
  const s = normalizeState({
    packing: [{ id: 'pack.retired.item', status: 'packed', custom: false }],
  });
  assert.ok(!s.packing.some((i) => i.id === 'pack.retired.item'));
});

test('seed integrity: unique ids, known categories, positive quantities', () => {
  const ids = new Set();
  const catIds = new Set(PACKING_CATEGORIES.map((c) => c.id));
  for (const item of SEED_PACKING_ITEMS) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    assert.ok(catIds.has(item.categoryId), `unknown category ${item.categoryId}`);
    assert.ok(item.quantity >= 1);
    assert.equal(item.status, 'needed');
    assert.equal(item.custom, false);
  }
});

test('seedPackingItems returns fresh copies (no shared mutable state)', () => {
  const a = seedPackingItems();
  a[0].status = 'packed';
  const b = seedPackingItems();
  assert.equal(b[0].status, 'needed');
});
