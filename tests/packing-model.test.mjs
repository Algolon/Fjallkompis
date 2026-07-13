/**
 * Personal packing-list model + migration (schema v5). The packing list is a
 * fully-owned copy: from v5 it is NOT re-merged from the seed on load, so
 * deletions and edits persist and an app update never overwrites the user's
 * list. These run against the exact module the app ships (src/utils/
 * stateMigration.mjs), same as state-migration.test.mjs.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  TEMPLATE_VERSION,
  NOTES_MAX,
  defaultState,
  normalizeState,
  seedPersonalList,
} from '../src/utils/stateMigration.mjs';
import { SEED_PACKING_ITEMS } from '../src/data/packingSeed.mjs';

// ---- Fresh personal copy (new user / restore default) -----------------------

test('the default list is a personal copy of the template', () => {
  const list = seedPersonalList();
  assert.equal(list.length, SEED_PACKING_ITEMS.length);
  // Every item owned-but-from-template, unprepared, in a deterministic order.
  list.forEach((it, i) => {
    assert.equal(it.status, 'needed');
    assert.equal(it.custom, false);
    assert.equal(it.sortOrder, i);
  });
  // sortOrder is a strictly ascending, unique sequence.
  const orders = list.map((i) => i.sortOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  assert.equal(new Set(orders).size, orders.length);
});

test('defaultState seeds the personal list and records the template version', () => {
  const s = defaultState('d1');
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.equal(s.packingTemplateVersion, TEMPLATE_VERSION);
  assert.equal(s.packing.length, SEED_PACKING_ITEMS.length);
  assert.deepEqual(s.packingSections, []); // no custom sections by default
});

test('seedPersonalList returns fresh copies (no shared mutable state)', () => {
  const a = seedPersonalList();
  a[0].status = 'packed';
  a[0].sortOrder = 999;
  const b = seedPersonalList();
  assert.equal(b[0].status, 'needed');
  assert.equal(b[0].sortOrder, 0);
});

// ---- One-time v<5 → v5 conversion preserves progress ------------------------

test('v4 → v5: statuses, quantities, weights, notes and custom items survive', () => {
  const seedId = SEED_PACKING_ITEMS[0].id;
  const v4 = {
    schemaVersion: 4,
    currentStageId: 'd2',
    routeDirection: 'abisko-to-nikkaluokta',
    hutData: {},
    journal: [],
    packing: [
      { id: seedId, status: 'packed', quantity: 4, weightGrams: 1200, notes: 'the blue one' },
      {
        id: 'custom_abc',
        label: 'Fishing rod',
        categoryId: 'comfort',
        quantity: 1,
        status: 'ready',
        essential: false,
        custom: true,
      },
    ],
  };
  const s = normalizeState(v4);
  assert.equal(s.schemaVersion, 5);

  const seedItem = s.packing.find((i) => i.id === seedId);
  assert.equal(seedItem.status, 'packed');
  assert.equal(seedItem.quantity, 4);
  assert.equal(seedItem.weightGrams, 1200);
  assert.equal(seedItem.notes, 'the blue one');
  assert.equal(seedItem.custom, false);
  assert.equal(typeof seedItem.sortOrder, 'number');

  const custom = s.packing.find((i) => i.id === 'custom_abc');
  assert.ok(custom, 'custom item preserved');
  assert.equal(custom.label, 'Fishing rod');
  assert.equal(custom.status, 'ready');
  assert.equal(custom.custom, true);

  // Every migrated item gained a numeric sortOrder.
  assert.ok(s.packing.every((i) => typeof i.sortOrder === 'number'));
});

// ---- v5 owned list is authoritative — never re-merged from the seed ---------

test('v5: a deleted template item stays deleted (no re-seed on load)', () => {
  // The user kept only two items; every other seed item was deleted.
  const v5 = {
    schemaVersion: 5,
    currentStageId: null,
    routeDirection: 'abisko-to-nikkaluokta',
    hutData: {},
    journal: [],
    packingTemplateVersion: 1,
    packing: [
      { id: SEED_PACKING_ITEMS[0].id, label: 'Kept A', categoryId: 'backpack', quantity: 1, status: 'needed', essential: false, sortOrder: 0, custom: false },
      { id: 'custom_x', label: 'Kept B', categoryId: 'comfort', quantity: 2, status: 'packed', essential: false, sortOrder: 1, custom: true },
    ],
  };
  const s = normalizeState(v5);
  assert.equal(s.packing.length, 2, 'no template items re-added');
  assert.deepEqual(
    s.packing.map((i) => i.id).sort(),
    [SEED_PACKING_ITEMS[0].id, 'custom_x'].sort(),
  );
});

test('v5: an intentionally empty list is honoured (not reseeded)', () => {
  const s = normalizeState({ schemaVersion: 5, packing: [] });
  assert.deepEqual(s.packing, []);
});

test('v5: a corrupt (non-array) packing value falls back to a fresh copy', () => {
  const s = normalizeState({ schemaVersion: 5, packing: 'boom' });
  assert.equal(s.packing.length, SEED_PACKING_ITEMS.length);
  assert.ok(s.packing.every((i) => i.status === 'needed'));
});

test('v5: label-less / malformed items are dropped without throwing', () => {
  const s = normalizeState({
    schemaVersion: 5,
    packing: [
      { id: 'a', label: '', categoryId: 'comfort', quantity: 1, status: 'needed', sortOrder: 0 },
      { id: 'b', label: '   ', quantity: 1 },
      42,
      null,
      { id: 'c', label: 'Real item', categoryId: 'comfort', quantity: 1, status: 'needed', sortOrder: 3 },
    ],
  });
  assert.deepEqual(s.packing.map((i) => i.id), ['c']);
});

// ---- Field normalisation ----------------------------------------------------

test('notes are trimmed, capped and dropped when empty', () => {
  const long = 'x'.repeat(NOTES_MAX + 50);
  const s = normalizeState({
    schemaVersion: 5,
    packing: [
      { id: 'a', label: 'A', categoryId: 'comfort', quantity: 1, status: 'needed', sortOrder: 0, notes: '  spaced  ' },
      { id: 'b', label: 'B', categoryId: 'comfort', quantity: 1, status: 'needed', sortOrder: 1, notes: '   ' },
      { id: 'c', label: 'C', categoryId: 'comfort', quantity: 1, status: 'needed', sortOrder: 2, notes: long },
    ],
  });
  const [a, b, c] = s.packing;
  assert.equal(a.notes, 'spaced');
  assert.ok(!('notes' in b), 'blank notes are absent');
  assert.equal(c.notes.length, NOTES_MAX);
});

test('quantity is clamped to a whole number in [1, 99]; unknown category → comfort', () => {
  const s = normalizeState({
    schemaVersion: 5,
    packing: [
      { id: 'a', label: 'A', categoryId: 'not-real', quantity: 0, status: 'needed', sortOrder: 0 },
      { id: 'b', label: 'B', categoryId: 'clothing', quantity: 250, status: 'ready', sortOrder: 1 },
      { id: 'c', label: 'C', categoryId: 'clothing', quantity: 3.7, status: 'bogus', sortOrder: 2 },
    ],
  });
  const [a, b, c] = s.packing;
  assert.equal(a.quantity, 1);
  assert.equal(a.categoryId, 'comfort');
  assert.equal(b.quantity, 99);
  assert.equal(c.quantity, 4);
  assert.equal(c.status, 'needed'); // invalid status → default
});

// ---- Custom sections --------------------------------------------------------

const withSection = (id, label, categoryId, sortOrder) => ({
  id,
  label,
  categoryId,
  quantity: 1,
  status: 'needed',
  essential: false,
  sortOrder,
  custom: true,
});

test('v5: custom sections referenced by items are preserved through normalisation', () => {
  const s = normalizeState({
    schemaVersion: 5,
    packing: [withSection('a', 'Rod', 'sec-fishing', 0)],
    packingSections: [{ id: 'sec-fishing', title: 'Fishing gear' }],
  });
  assert.deepEqual(s.packingSections, [{ id: 'sec-fishing', title: 'Fishing gear' }]);
  assert.equal(s.packing[0].categoryId, 'sec-fishing'); // NOT remapped to comfort
});

test('v5: a custom section with no items is pruned (disappears naturally)', () => {
  const s = normalizeState({
    schemaVersion: 5,
    packing: [withSection('a', 'Socks', 'clothing', 0)],
    packingSections: [{ id: 'sec-fishing', title: 'Fishing gear' }],
  });
  assert.deepEqual(s.packingSections, []); // unreferenced → dropped
});

test('v5: an item pointing at a missing custom section falls back to comfort', () => {
  const s = normalizeState({
    schemaVersion: 5,
    packing: [withSection('a', 'Ghost', 'sec-gone', 0)],
    packingSections: [], // section not declared
  });
  assert.equal(s.packing[0].categoryId, 'comfort');
});

test('v5: custom section ids that shadow a default id are rejected', () => {
  const s = normalizeState({
    schemaVersion: 5,
    packing: [withSection('a', 'X', 'clothing', 0)],
    packingSections: [{ id: 'clothing', title: 'Hijack' }],
  });
  assert.deepEqual(s.packingSections, []); // 'clothing' is a default id — dropped
});

test('v5: custom section titles are trimmed and length-capped; malformed dropped', () => {
  const long = 'y'.repeat(200);
  const s = normalizeState({
    schemaVersion: 5,
    packing: [withSection('a', 'X', 'sec-a', 0), withSection('b', 'Y', 'sec-b', 1)],
    packingSections: [
      { id: 'sec-a', title: '  Spaced  ' },
      { id: 'sec-b', title: long },
      { id: 'sec-c', title: '' }, // empty title → dropped (also unreferenced)
      { title: 'no id' }, // no id → dropped
    ],
  });
  const a = s.packingSections.find((x) => x.id === 'sec-a');
  const b = s.packingSections.find((x) => x.id === 'sec-b');
  assert.equal(a.title, 'Spaced');
  assert.ok(b.title.length <= 60);
  assert.equal(s.packingSections.length, 2);
});

test('v4 → v5 migration produces no custom sections', () => {
  const s = normalizeState({
    schemaVersion: 4,
    packing: [{ id: 'custom_x', label: 'Rod', categoryId: 'comfort', quantity: 1, status: 'needed', essential: false, custom: true }],
  });
  assert.deepEqual(s.packingSections, []);
});

test('full-state round-trip (JSON backup) preserves custom sections', () => {
  const original = normalizeState({
    schemaVersion: 5,
    packing: [withSection('a', 'Rod', 'sec-fishing', 0)],
    packingSections: [{ id: 'sec-fishing', title: 'Fishing gear' }],
  });
  // Simulate export → import through the same normaliser.
  const roundTripped = normalizeState(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(roundTripped.packingSections, original.packingSections);
  assert.equal(roundTripped.packing[0].categoryId, 'sec-fishing');
});
