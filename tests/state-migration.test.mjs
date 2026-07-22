/**
 * Deterministic validation of the localStorage schema migrations
 * (v1 → v2 → v3, src/utils/stateMigration.mjs — the exact module the app
 * runs). v3 dropped the archived Daily checklist's `checklist` map; legacy
 * payloads that still carry it must keep loading with everything else intact
 * (docs/archived-features/daily-checklist.md).
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

test('schema version is 5', () => {
  assert.equal(SCHEMA_VERSION, 5);
});

test('v1 → v5: schemaVersion is bumped and core fields survive', () => {
  const s = normalizeState(V1_STATE);
  assert.equal(s.schemaVersion, 5);
  assert.equal(s.currentStageId, 'd3');
  assert.equal(s.journal.length, 1);
  assert.deepEqual(s.journal[0], V1_STATE.journal[0]);
});

test('legacy checklist data is dropped without breaking the rest', () => {
  // v1 and v2 payloads both persisted the Daily checklist's tick map. The
  // feature is archived; the key is stripped during normalisation while all
  // unrelated personal data survives untouched.
  const s = normalizeState(V1_STATE);
  assert.ok(!('checklist' in s), 'checklist key must not survive migration');
  assert.equal(s.currentStageId, 'd3');
  assert.equal(s.hutData.abisko.notes, 'Bunk 4, kiosk closes 18:00');
  assert.equal(s.journal.length, 1);

  // Malformed checklist payloads must never break loading either.
  for (const bad of [{ 'morning.1': 'yes' }, 'garbage', 42, ['a'], null]) {
    const out = normalizeState({ ...V1_STATE, checklist: bad });
    assert.ok(!('checklist' in out));
    assert.equal(out.currentStageId, 'd3');
  }
});

test('v1 → v3: hut notes are preserved verbatim, shopOverride is dropped', () => {
  const s = normalizeState(V1_STATE);
  assert.equal(s.hutData.abisko.notes, 'Bunk 4, kiosk closes 18:00');
  assert.equal(s.hutData.tjaktja.notes, '');
  assert.equal(s.hutData.salka.notes, 'Great sauna — bring 20 kr coins');
  for (const entry of Object.values(s.hutData)) {
    assert.ok(!('shopOverride' in entry), 'shopOverride must be removed');
  }
});

test('v1 → v3: packing is seeded with all seed items in "needed" state', () => {
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

test('v3 roundtrip: packing statuses, quantities and weights persist', () => {
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

test('v3 roundtrip: custom packing items are preserved', () => {
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
    assert.equal(s.schemaVersion, 5);
    assert.deepEqual(s.trip, []);
    assert.equal(s.currentStageId, 'd1');
    assert.equal(s.routeDirection, 'abisko-to-nikkaluokta');
    assert.ok(!('checklist' in s));
    assert.deepEqual(s.journal, []);
    assert.equal(s.packing.length, SEED_PACKING_ITEMS.length);
  }
});

// ---- Route direction (v3 → v4) ---------------------------------------------

test('v3 → v4: older state without routeDirection defaults to forward', () => {
  // A realistic v3 payload never carried a direction field.
  const v3 = { schemaVersion: 3, currentStageId: 'd5', hutData: {}, journal: [], packing: [] };
  const s = normalizeState(v3);
  assert.equal(s.schemaVersion, 5);
  assert.equal(s.routeDirection, 'abisko-to-nikkaluokta');
  // Unrelated data survives untouched.
  assert.equal(s.currentStageId, 'd5');
});

// ---- Trip plan (v4 → v5) ----------------------------------------------------

test('v4 → v5: older state without trip items normalises to an empty trip plan', () => {
  const v4 = {
    schemaVersion: 4,
    currentStageId: 'd2',
    routeDirection: 'nikkaluokta-to-abisko',
    hutData: {},
    journal: [],
    packing: [],
  };
  const s = normalizeState(v4);
  assert.equal(s.schemaVersion, 5);
  assert.deepEqual(s.trip, [], 'no trip items are fabricated');
  assert.equal(s.currentStageId, 'd2');
  assert.equal(s.routeDirection, 'nikkaluokta-to-abisko');
});

test('v5 roundtrip: travel and stay items persist verbatim', () => {
  const trip = [
    {
      id: 'trip_a',
      kind: 'transport',
      title: 'Bus to Nikkaluokta',
      status: 'confirmed',
      mode: 'bus',
      from: 'Kebnekaise',
      to: 'Nikkaluokta',
      date: '2026-08-30',
      departureTime: '14:30',
      provider: 'Nikkaluoktaexpressen',
      bookingReference: 'ABC123',
      attachmentIds: ['doc_1'],
      linkedTransportId: 'nikkaluoktaexpressen',
      createdAt: 1751400000000,
      updatedAt: 1751400001000,
    },
    {
      id: 'trip_b',
      kind: 'stay',
      title: 'STF Abisko',
      status: 'planned',
      stayType: 'mountain-station',
      checkInDate: '2026-08-22',
      checkOutDate: '2026-08-23',
      attachmentIds: [],
      linkedStopId: 'abisko',
      createdAt: 1751400000000,
      updatedAt: 1751400000000,
    },
  ];
  const out = normalizeState({ ...V1_STATE, trip });
  assert.deepEqual(out.trip, trip);
});

test('malformed trip data never crashes and heals safely', () => {
  for (const bad of [undefined, null, 'garbage', 42, { not: 'an array' }]) {
    const s = normalizeState({ ...V1_STATE, trip: bad });
    assert.deepEqual(s.trip, [], `trip=${JSON.stringify(bad)}`);
  }
  const s = normalizeState({
    ...V1_STATE,
    trip: [
      null,
      42,
      { id: '', kind: 'transport', title: 'x' },
      { id: 'trip_ok', kind: 'stay', title: '  Salka  ', status: 'BOOKED', stayType: 'igloo' },
      { id: 'trip_ok', kind: 'stay', title: 'duplicate id' },
      { id: 'trip_x', kind: 'teleport', title: 'nope' },
    ],
  });
  assert.equal(s.trip.length, 1);
  assert.equal(s.trip[0].id, 'trip_ok');
  assert.equal(s.trip[0].title, 'Salka', 'title is trimmed');
  assert.equal(s.trip[0].status, 'needed', 'unknown status falls back');
  assert.equal(s.trip[0].stayType, 'other', 'unknown stay type falls back');
});

test('trip normalisation is idempotent inside the state migration', () => {
  const once = normalizeState({
    ...V1_STATE,
    trip: [{ id: 'trip_i', kind: 'transport', title: ' Train ', mode: 'maglev', date: 'nope' }],
  });
  const twice = normalizeState(once);
  assert.deepEqual(twice, once);
});

test('a valid routeDirection persists through normalisation', () => {
  const s = normalizeState({ routeDirection: 'nikkaluokta-to-abisko' });
  assert.equal(s.routeDirection, 'nikkaluokta-to-abisko');
});

test('invalid / unknown routeDirection values normalise to the canonical default', () => {
  for (const bad of ['reverse', 'north', '', 42, null, {}, true, 'ABISKO-TO-NIKKALUOKTA']) {
    const s = normalizeState({ routeDirection: bad });
    assert.equal(s.routeDirection, 'abisko-to-nikkaluokta', `bad=${JSON.stringify(bad)}`);
  }
});

test('defaultState uses the canonical forward direction', () => {
  assert.equal(defaultState('d1').routeDirection, 'abisko-to-nikkaluokta');
  assert.equal(defaultState().routeDirection, 'abisko-to-nikkaluokta');
});

test('direction normalisation is idempotent (both directions round-trip)', () => {
  for (const dir of ['abisko-to-nikkaluokta', 'nikkaluokta-to-abisko']) {
    const once = normalizeState({ routeDirection: dir, currentStageId: 'd2' });
    const twice = normalizeState(once);
    assert.deepEqual(twice, once);
    assert.equal(once.routeDirection, dir);
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
