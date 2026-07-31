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
import {
  PACKING_CATEGORIES,
  PACKING_TEMPLATE_VERSION,
  SEED_PACKING_ITEMS,
} from '../src/data/packingSeed.mjs';

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

test('schema version is 10', () => {
  assert.equal(SCHEMA_VERSION, 10);
});

test('v1 → v10: schemaVersion is bumped and core fields survive', () => {
  const s = normalizeState(V1_STATE);
  assert.equal(s.schemaVersion, 10);
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
    assert.equal(s.schemaVersion, 10);
    assert.equal(s.currentStageId, 'd1');
    assert.equal(s.routeDirection, 'abisko-to-nikkaluokta');
    assert.ok(!('checklist' in s));
    assert.deepEqual(s.journal, []);
    assert.equal(s.packing.length, SEED_PACKING_ITEMS.length);
    assert.deepEqual(s.trip, []);
  }
});

// ---- Route direction (v3 → v4) ---------------------------------------------

test('v3 → v4: older state without routeDirection defaults to forward', () => {
  // A realistic v3 payload never carried a direction field.
  const v3 = { schemaVersion: 3, currentStageId: 'd5', hutData: {}, journal: [], packing: [] };
  const s = normalizeState(v3);
  assert.equal(s.schemaVersion, 10);
  assert.equal(s.routeDirection, 'abisko-to-nikkaluokta');
  // Unrelated data survives untouched.
  assert.equal(s.currentStageId, 'd5');
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

// ---- Packing template v2: user-owned snapshot (v4 → v5) ---------------------

const BIVVY_ID = 'pack.navigation-safety.emergency-bivvy';
const BLANKET_ID = 'pack.navigation-safety.emergency-blanket';

/** A realistic pre-v5 payload: no packingTemplateVersion, old blanket state. */
function legacyStateWithBlanket() {
  return {
    schemaVersion: 4,
    currentStageId: 'd2',
    hutData: {},
    journal: [],
    packing: [
      { id: BLANKET_ID, status: 'packed', quantity: 1, weightGrams: 60, custom: false },
      { id: 'pack.clothing.fleece', status: 'ready', quantity: 1, custom: false },
      {
        id: 'custom_rod',
        label: 'Fishing rod',
        categoryId: 'comfort',
        quantity: 1,
        status: 'needed',
        essential: false,
        custom: true,
      },
    ],
  };
}

test('defaultState records the current packing template version', () => {
  assert.equal(defaultState('d1').packingTemplateVersion, PACKING_TEMPLATE_VERSION);
  assert.ok(PACKING_TEMPLATE_VERSION >= 2);
});

test('legacy payload (no template version): new template items arrive exactly once', () => {
  const s = normalizeState(legacyStateWithBlanket());
  assert.equal(s.packingTemplateVersion, PACKING_TEMPLATE_VERSION);
  for (const seed of SEED_PACKING_ITEMS) {
    assert.equal(
      s.packing.filter((i) => i.id === seed.id).length,
      1,
      `seed item ${seed.id} present exactly once`,
    );
  }
  // Custom item rides along untouched.
  assert.ok(s.packing.some((i) => i.id === 'custom_rod'));
  // Existing statuses survive the merge.
  assert.equal(s.packing.find((i) => i.id === 'pack.clothing.fleece').status, 'ready');
});

test('legacy payload: blanket progress carries onto the bivvy — but never its weight', () => {
  // The fixture's blanket carries an entered weight (60 g). The bivvy is a
  // materially different physical product, so only user PROGRESS transfers:
  // status and quantity survive, the weight must NOT — the bivvy starts with
  // no weight so the "weight is incomplete" accounting stays honest.
  const s = normalizeState(legacyStateWithBlanket());
  const bivvy = s.packing.find((i) => i.id === BIVVY_ID);
  assert.ok(bivvy, 'bivvy exists after migration');
  assert.equal(bivvy.status, 'packed', 'blanket status carried over');
  assert.equal(bivvy.quantity, 1, 'blanket quantity carried over');
  assert.ok(!('weightGrams' in bivvy), 'blanket weight is NOT carried onto the bivvy');
  assert.equal(bivvy.essential, true, 'bivvy keeps its seed essential flag');
  assert.ok(!s.packing.some((i) => i.id === BLANKET_ID), 'old blanket id is gone');
});

test('legacy migration is idempotent (second run takes the owned path)', () => {
  const once = normalizeState(legacyStateWithBlanket());
  const twice = normalizeState(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
});

test('owned payload: a deleted seed item stays deleted', () => {
  const s = defaultState('d1');
  s.packing = s.packing.filter((i) => i.id !== 'pack.clothing.fleece');
  const out = normalizeState(JSON.parse(JSON.stringify(s)));
  assert.ok(!out.packing.some((i) => i.id === 'pack.clothing.fleece'));
  // And it stays deleted on every subsequent load.
  const again = normalizeState(JSON.parse(JSON.stringify(out)));
  assert.ok(!again.packing.some((i) => i.id === 'pack.clothing.fleece'));
});

test('owned payload: renames, category moves and essential edits survive reload', () => {
  const s = defaultState('d1');
  s.packing = s.packing.map((i) =>
    i.id === 'pack.clothing.fleece'
      ? { ...i, label: 'Wool jumper', categoryId: 'comfort', essential: false }
      : i,
  );
  const out = normalizeState(JSON.parse(JSON.stringify(s)));
  const fleece = out.packing.find((i) => i.id === 'pack.clothing.fleece');
  assert.equal(fleece.label, 'Wool jumper');
  assert.equal(fleece.categoryId, 'comfort');
  assert.equal(fleece.essential, false);
  assert.equal(fleece.custom, false, 'provenance is preserved');
});

test('owned payload: malformed entries drop, others heal, never a crash', () => {
  const out = normalizeState({
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    packing: [
      null,
      42,
      { id: '' },
      { id: 'x1', label: '   ' },
      { id: 'ok1', label: '  Mug  ', categoryId: 'nope', quantity: 0, status: 'huh', custom: true },
      { id: 'ok1', label: 'Duplicate id', custom: true },
      { id: 'pack.clothing.fleece', label: 'Fleece', categoryId: 'clothing', quantity: 2, status: 'ready', weightGrams: -5, essential: 'yes', custom: false },
    ],
  });
  assert.equal(out.packing.length, 2);
  const mug = out.packing.find((i) => i.id === 'ok1');
  assert.equal(mug.label, 'Mug');
  assert.equal(mug.categoryId, 'comfort');
  assert.equal(mug.quantity, 1);
  assert.equal(mug.status, 'needed');
  const fleece = out.packing.find((i) => i.id === 'pack.clothing.fleece');
  assert.equal(fleece.quantity, 2);
  assert.equal(fleece.status, 'ready');
  assert.ok(!('weightGrams' in fleece), 'invalid weight becomes absent');
  assert.equal(fleece.essential, false, 'non-boolean essential heals to false');
});

test('owned payload: malformed packing container falls back to the full seed', () => {
  for (const bad of ['garbage', 42, { not: 'an array' }, null]) {
    const out = normalizeState({
      packingTemplateVersion: PACKING_TEMPLATE_VERSION,
      packing: bad,
    });
    assert.equal(out.packing.length, SEED_PACKING_ITEMS.length);
  }
});

test('owned payload: an empty packing array is respected (user deleted everything)', () => {
  const out = normalizeState({
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    packing: [],
  });
  assert.deepEqual(out.packing, []);
});

test('a template version from the future clamps; items are kept as-is', () => {
  const out = normalizeState({
    packingTemplateVersion: PACKING_TEMPLATE_VERSION + 7,
    packing: [
      { id: 'pack.future.widget', label: 'Widget', categoryId: 'comfort', quantity: 1, status: 'needed', essential: false, custom: false },
    ],
  });
  assert.equal(out.packingTemplateVersion, PACKING_TEMPLATE_VERSION);
  assert.ok(out.packing.some((i) => i.id === 'pack.future.widget'));
});

test('owned payload: withdrawn development-only seed ids are cleaned up', () => {
  // A snapshot created while an unpublished template revision still carried
  // the separate first-aid refill item drops it on load — idempotently, and
  // without touching a user-created item that happens to share the id.
  const raw = {
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    packing: [
      { id: 'pack.hygiene-first-aid.first-aid-refill', label: 'Walking first-aid refill kit', categoryId: 'hygiene-first-aid', quantity: 1, status: 'packed', essential: true, custom: false },
      { id: 'pack.navigation-safety.first-aid', label: 'Walking first aid kit', categoryId: 'navigation-safety', quantity: 1, status: 'ready', essential: true, custom: false },
    ],
  };
  const once = normalizeState(raw);
  assert.ok(
    !once.packing.some((i) => i.id === 'pack.hygiene-first-aid.first-aid-refill'),
    'retired dev-only id removed',
  );
  assert.equal(once.packing.find((i) => i.id === 'pack.navigation-safety.first-aid').status, 'ready');
  const twice = normalizeState(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once, 'cleanup is idempotent');
});

test('invalid template version values take the legacy path', () => {
  for (const bad of ['2', 1.5, 0, -3, null, {}, true, 1]) {
    const out = normalizeState({ packingTemplateVersion: bad, packing: [] });
    assert.equal(
      out.packing.length,
      SEED_PACKING_ITEMS.length,
      `packingTemplateVersion=${JSON.stringify(bad)} reseeds via the legacy merge`,
    );
  }
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

// ---- Trip plan (v5 → v6) ----------------------------------------------------

/**
 * The v9 normaliser adds `wornQuantity: 0` to every packing item that
 * predates worn tracking — the expected post-migration shape of a
 * historical fixture.
 */
const withWornDefault = (items) => items.map((i) => ({ ...i, wornQuantity: 0 }));

/** A realistic PR#64-era v5 payload: owned, personalised packing, no trip. */
function ownedV5State() {
  return {
    schemaVersion: 5,
    currentStageId: 'd2',
    routeDirection: 'nikkaluokta-to-abisko',
    hutData: { salka: { notes: 'Sauna coins!' } },
    journal: [],
    packing: [
      // A renamed + moved seed item, a deletion (most seeds absent), a custom.
      {
        id: 'pack.clothing.fleece',
        label: 'My renamed fleece',
        categoryId: 'comfort',
        quantity: 2,
        status: 'packed',
        weightGrams: 310,
        essential: true,
        custom: false,
      },
      {
        id: 'custom_rod',
        label: 'Fishing rod',
        categoryId: 'comfort',
        quantity: 1,
        status: 'ready',
        essential: false,
        custom: true,
      },
    ],
    packingTemplateVersion: 2,
  };
}

test('v5 → v6: an owned packing payload gains an empty trip plan, nothing else changes', () => {
  const v5 = ownedV5State();
  const s = normalizeState(v5);
  assert.equal(s.schemaVersion, 10);
  assert.deepEqual(s.trip, [], 'no trip items are fabricated');
  // The owned snapshot survives field-for-field (plus the v8 worn default):
  // no re-run of the seed merge, no restored deletions, no reset progress.
  assert.deepEqual(s.packing, withWornDefault(v5.packing));
  assert.equal(s.packingTemplateVersion, 2);
  assert.equal(s.currentStageId, 'd2');
  assert.equal(s.routeDirection, 'nikkaluokta-to-abisko');
});

test('v6 roundtrip: travel and stay items persist verbatim beside owned packing', () => {
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
  const v6 = { ...ownedV5State(), schemaVersion: 6, trip };
  const out = normalizeState(v6);
  assert.deepEqual(out.trip, trip);
  assert.deepEqual(out.packing, withWornDefault(v6.packing), 'packing untouched beside trip data');
});

test('a PR#65-era development payload (trip but NO template version) heals both ways', () => {
  // Such a payload only ever existed on a development branch: it carries trip
  // items but its packing predates the owned model. The packing side takes
  // the one-time legacy merge (template items arrive); the trip side is kept.
  const dev = {
    schemaVersion: 5,
    packing: [{ id: 'pack.clothing.fleece', status: 'packed', quantity: 1 }],
    trip: [
      {
        id: 'trip_dev',
        kind: 'stay',
        title: 'Sälka',
        status: 'planned',
        stayType: 'mountain-hut',
        attachmentIds: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  const s = normalizeState(dev);
  assert.equal(s.trip.length, 1);
  assert.equal(s.trip[0].id, 'trip_dev');
  assert.equal(s.packing.length, SEED_PACKING_ITEMS.length, 'legacy merge ran once');
  assert.equal(
    s.packing.find((i) => i.id === 'pack.clothing.fleece').status,
    'packed',
    'progress preserved through the legacy merge',
  );
  // A second normalisation takes the owned path and changes nothing.
  assert.deepEqual(normalizeState(s), s);
});

test('malformed trip data never crashes and valid sibling fields survive', () => {
  for (const bad of [undefined, null, 'garbage', 42, { not: 'an array' }]) {
    const s = normalizeState({ ...ownedV5State(), trip: bad });
    assert.deepEqual(s.trip, [], `trip=${JSON.stringify(bad)}`);
    assert.equal(s.packing.length, 2, 'owned packing unaffected by bad trip data');
  }
  const s = normalizeState({
    ...ownedV5State(),
    trip: [
      null,
      { id: '', kind: 'transport', title: 'x' },
      { id: 'trip_ok', kind: 'stay', title: '  Salka  ', status: 'BOOKED', stayType: 'igloo' },
      { id: 'trip_ok', kind: 'stay', title: 'duplicate id' },
      { id: 'trip_x', kind: 'teleport', title: 'nope' },
    ],
  });
  assert.equal(s.trip.length, 1);
  assert.equal(s.trip[0].title, 'Salka', 'title is trimmed');
  assert.equal(s.trip[0].status, 'needed', 'unknown status falls back');
  assert.equal(s.trip[0].stayType, 'other', 'unknown stay type falls back');
});

test('combined migration is idempotent and never mutates its input', () => {
  const v5 = ownedV5State();
  const frozen = JSON.stringify(v5);
  const once = normalizeState(v5);
  const twice = normalizeState(once);
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(v5), frozen, 'input object untouched');
});

test('fresh defaultState carries the current template, its version and an empty trip', () => {
  const s = defaultState('d1');
  assert.equal(s.schemaVersion, 10);
  assert.equal(s.packing.length, SEED_PACKING_ITEMS.length);
  assert.deepEqual(s.trip, []);
});

// ---- Day plan (v6 → v7, then v9 → v10) --------------------------------------
//
// The day plan's hiking legs are validated against the canonical stage
// topology, so the caller supplies it (src/utils/storage.ts passes
// STAGE_TOPOLOGY). These tests spell out the real Kungsleden topology.

const STAGE_COUNT = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];
const FORWARD = 'abisko-to-nikkaluokta';
const REVERSE = 'nikkaluokta-to-abisko';

/** The stages a migrated plan's days walk, as compact "stage:orientation". */
const migratedLegs = (dayPlan) =>
  dayPlan.days.map((d) =>
    d.activities
      .filter((a) => a.kind === 'hiking')
      .flatMap((a) => a.legs.map((l) => `${l.stageId}:${l.orientation}`)),
  );

let daySeq = 0;
const planDay = (activities, overnight) => ({
  id: `day_fixture_${(daySeq += 1)}`,
  activities,
  ...(overnight ? { overnight } : {}),
});

/** A valid plan covering all seven stages across a mixed journey. */
function journeyPlan() {
  return {
    direction: FORWARD,
    startDate: '2026-09-03',
    currentDayId: null,
    days: [
      planDay([{ kind: 'travel' }], { kind: 'stop', stopId: 'abisko' }),
      planDay([{ kind: 'hiking', stages: 1 }]),
      planDay([{ kind: 'hiking', stages: 1 }]),
      planDay([{ kind: 'hiking', stages: 2 }]),
      planDay([{ kind: 'hiking', stages: 1 }]),
      planDay([{ kind: 'hiking', stages: 1 }]),
      planDay([{ kind: 'rest' }]),
      planDay([{ kind: 'hiking', stages: 1 }, { kind: 'travel' }], {
        kind: 'stay',
        tripItemId: 'trip_kiruna',
      }),
      planDay([{ kind: 'travel' }], { kind: 'none' }),
    ],
  };
}

/** A schema v6 payload: owned packing + a trip plan, but no day plan. */
function v6State() {
  return {
    ...ownedV5State(),
    schemaVersion: 6,
    trip: [
      {
        id: 'trip_a',
        kind: 'stay',
        title: 'Sälka hut',
        status: 'planned',
        stayType: 'mountain-hut',
        checkInDate: '2026-08-25',
        attachmentIds: [],
        createdAt: 1751400000000,
        updatedAt: 1751400000000,
      },
    ],
  };
}

test('v6 → v7: an existing payload gains dayPlan: null and nothing else changes', () => {
  const v6 = v6State();
  const s = normalizeState(v6, 'd1', STAGE_COUNT);
  assert.equal(s.schemaVersion, 10);
  assert.equal(s.dayPlan, null, 'no plan is ever generated for an existing user');
  // Every other field is untouched — the migration paths compose.
  assert.deepEqual(s.packing, withWornDefault(v6.packing));
  assert.equal(s.packingTemplateVersion, 2);
  assert.deepEqual(s.trip, v6.trip);
  assert.equal(s.currentStageId, 'd2');
  assert.equal(s.routeDirection, REVERSE);
});

test('planning is opt-in: nothing infers a plan from trip data or direction', () => {
  // A payload rich in trip items, stays and a chosen direction still lands on
  // no plan. Only an explicit Settings action creates one.
  const s = normalizeState(v6State(), 'd1', STAGE_COUNT);
  assert.equal(s.dayPlan, null);
  assert.ok(s.trip.length > 0, 'the trip data is there — and stays irrelevant');
});

test('defaultState starts with no day plan', () => {
  assert.equal(defaultState('d1').dayPlan, null);
});

test('v9 → v10: the mixed journey migrates to explicit legs, in place', () => {
  const state = { ...v6State(), schemaVersion: 9, routeDirection: FORWARD, dayPlan: journeyPlan() };
  const s = normalizeState(state, 'd1', STAGE_COUNT);
  assert.ok(s.dayPlan, 'the released plan loads');
  // Exactly the stages the released cursor walk consumed, day by day.
  assert.deepEqual(migratedLegs(s.dayPlan), [
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
  // Day ids, order, activity order, overnights, dates — all preserved.
  assert.deepEqual(
    s.dayPlan.days.map((d) => d.id),
    state.dayPlan.days.map((d) => d.id),
  );
  assert.deepEqual(
    s.dayPlan.days.map((d) => d.activities.map((a) => a.kind)),
    state.dayPlan.days.map((d) => d.activities.map((a) => a.kind)),
  );
  assert.deepEqual(s.dayPlan.days[0].overnight, { kind: 'stop', stopId: 'abisko' });
  assert.deepEqual(s.dayPlan.days[7].overnight, { kind: 'stay', tripItemId: 'trip_kiruna' });
  assert.equal(s.dayPlan.startDate, '2026-09-03');
  assert.equal(s.dayPlan.direction, FORWARD);
  assert.equal(s.dayPlan.currentLegId, null, 'no pointer without released pointers to derive it');
  // Deterministic leg identity: (day id, stage id), stable across runs.
  const combined = s.dayPlan.days[3];
  assert.equal(combined.activities[0].legs[0].id, `leg_${combined.id}_d3`);
  // Everything else unchanged.
  assert.deepEqual(s.packing, withWornDefault(state.packing));
  assert.deepEqual(s.trip, state.trip);
});

test('v9 → v10: agreeing released pointers derive the current leg', () => {
  const plan = journeyPlan();
  plan.currentDayId = plan.days[3].id; // walks d3 + d4
  const state = {
    ...v6State(),
    schemaVersion: 9,
    routeDirection: FORWARD,
    currentStageId: 'd4',
    dayPlan: plan,
  };
  const s = normalizeState(state, 'd1', STAGE_COUNT);
  assert.equal(s.dayPlan.currentDayId, plan.days[3].id);
  assert.equal(s.dayPlan.currentLegId, `leg_${plan.days[3].id}_d4`);
  // Pointers that do NOT intersect derive no current leg — never a guess.
  const elsewhere = normalizeState({ ...state, currentStageId: 'd6' }, 'd1', STAGE_COUNT);
  assert.equal(elsewhere.dayPlan.currentLegId, null);
  assert.equal(elsewhere.dayPlan.currentDayId, plan.days[3].id, 'the day pointer still holds');
});

test('v10 roundtrip: an already-migrated plan persists verbatim', () => {
  const migrated = normalizeState(
    { ...v6State(), schemaVersion: 9, routeDirection: FORWARD, dayPlan: journeyPlan() },
    'd1',
    STAGE_COUNT,
  );
  const again = normalizeState(migrated, 'd1', STAGE_COUNT);
  assert.deepEqual(again.dayPlan, migrated.dayPlan);
  assert.deepEqual(again, migrated, 'normalisation is a fixpoint on v10 data');
});

test('v9 → v10 device transfer: an exported v9 blob imports on a v10 device', () => {
  // parseImport funnels through the same normalizeState this exercises: an
  // envelope written by v0.26.x (schema 9) must land as a valid v10 state.
  const exported = {
    app: 'fjallkompis',
    schemaVersion: 9,
    exportedAt: '2026-07-31T12:00:00.000Z',
    state: { ...v6State(), schemaVersion: 9, routeDirection: FORWARD, dayPlan: journeyPlan() },
  };
  const s = normalizeState(exported.state, 'd1', STAGE_COUNT);
  assert.equal(s.schemaVersion, 10);
  assert.equal(s.dayPlan.days.length, 9);
  assert.deepEqual(migratedLegs(s.dayPlan).flat().length, 7, 'every stage exactly once');
});

test('the EARLIER DRAFT shape normalises to null, never partly interpreted', () => {
  // The unmerged draft persisted { direction, firstDate, groups }. It has no
  // days array, so it is rejected outright rather than half-read.
  const legacyDraft = {
    ...v6State(),
    routeDirection: FORWARD,
    dayPlan: { direction: FORWARD, firstDate: '2026-09-03', groups: [1, 1, 2, 1, 1, 1] },
  };
  const s = normalizeState(legacyDraft, 'd1', STAGE_COUNT);
  assert.equal(s.dayPlan, null);
  assert.equal(s.currentStageId, 'd2', 'the rest of the state still loads');
});

test('a structurally broken plan discards the plan and keeps everything else', () => {
  for (const bad of [
    { direction: FORWARD, startDate: '2027-02-29', currentDayId: null, days: [] },
    { direction: FORWARD, startDate: '2026-09-03', currentDayId: null, days: [] },
    { direction: 'sideways', startDate: '2026-09-03', currentDayId: null, days: [] },
    { ...journeyPlan(), days: [planDay([{ kind: 'hiking', stages: 3 }])] },
    { ...journeyPlan(), days: [planDay([{ kind: 'custom' }])] },
    'a plan',
    42,
  ]) {
    const s = normalizeState({ ...v6State(), routeDirection: FORWARD, dayPlan: bad }, 'd1', STAGE_COUNT);
    assert.equal(s.dayPlan, null, JSON.stringify(bad));
    assert.equal(s.currentStageId, 'd2', 'unrelated data survives');
    assert.ok(s.packing.length > 0);
  }
});

test('a plan stored for the OTHER direction is discarded, never reused', () => {
  const state = { ...v6State(), routeDirection: REVERSE, dayPlan: journeyPlan() };
  const s = normalizeState(state, 'd1', STAGE_COUNT);
  assert.equal(s.dayPlan, null, 'no mirroring, no rebuilding, no partial retention');
  assert.equal(s.routeDirection, REVERSE);
});

test('a stale currentDayId repairs to none rather than activating a wrong day', () => {
  const plan = { ...journeyPlan(), currentDayId: 'day_gone' };
  const s = normalizeState({ ...v6State(), routeDirection: FORWARD, dayPlan: plan }, 'd1', STAGE_COUNT);
  assert.equal(s.dayPlan.currentDayId, null);
  assert.equal(s.dayPlan.days.length, 9, 'the plan itself survives');

  const live = journeyPlan();
  const withCurrent = { ...live, currentDayId: live.days[3].id };
  const kept = normalizeState(
    { ...v6State(), routeDirection: FORWARD, dayPlan: withCurrent },
    'd1',
    STAGE_COUNT,
  );
  assert.equal(kept.dayPlan.currentDayId, live.days[3].id);
});

test('day-plan migration is idempotent and never mutates its input', () => {
  const state = { ...v6State(), routeDirection: FORWARD, dayPlan: journeyPlan() };
  const frozen = JSON.stringify(state);
  const once = normalizeState(state, 'd1', STAGE_COUNT);
  const twice = normalizeState(once, 'd1', STAGE_COUNT);
  assert.deepEqual(twice, once);
  assert.equal(JSON.stringify(state), frozen, 'input object untouched');
});

// ---- Day plan recovery (a stored plan that could not be loaded) -------------
//
// A malformed legacy plan must NOT be destroyed by normalisation: the very
// first save after loading would overwrite the only stored copy. The
// original is set aside VERBATIM in `dayPlanRecovery`; the active plan is
// null; everything else keeps working; only the user's explicit removal (a
// store action, fenced in day-plan-store.test.mjs) ends it.

/** A v9 plan the released model could not have persisted (over-consumption). */
function malformedV9Plan() {
  return {
    direction: FORWARD,
    startDate: '2026-09-03',
    currentDayId: 'day_x2',
    days: [
      { id: 'day_x1', activities: [{ kind: 'hiking', stages: 5 }], mystery: 'kept?' },
      { id: 'day_x2', activities: [{ kind: 'hiking', stages: 5 }] },
    ],
  };
}

test('a malformed v9 plan is set aside VERBATIM, never discarded', () => {
  const source = { ...v6State(), schemaVersion: 9, routeDirection: FORWARD, dayPlan: malformedV9Plan() };
  const s = normalizeState(source, 'd1', STAGE_COUNT);
  assert.equal(s.dayPlan, null, 'the active plan cannot render, so it is null');
  assert.ok(s.dayPlanRecovery, 'the original is preserved');
  assert.equal(s.dayPlanRecovery.reason, 'migration-failed');
  // Byte-for-byte: unknown fields, malformed counts and all.
  assert.equal(
    JSON.stringify(s.dayPlanRecovery.dayPlan),
    JSON.stringify(malformedV9Plan()),
    'the exact persisted value survives',
  );
  // Unrelated state is untouched and usable.
  assert.equal(s.currentStageId, 'd2');
  assert.deepEqual(s.trip, source.trip);
  assert.ok(s.packing.length > 0);
});

test('a reload (re-normalising the saved output) preserves the recovery verbatim', () => {
  const source = { ...v6State(), schemaVersion: 9, routeDirection: FORWARD, dayPlan: malformedV9Plan() };
  const once = normalizeState(source, 'd1', STAGE_COUNT);
  // What saveState writes is what the next launch reads.
  const reloaded = normalizeState(JSON.parse(JSON.stringify(once)), 'd1', STAGE_COUNT);
  assert.deepEqual(reloaded, once, 'normalisation is a fixpoint with a recovery present');
  assert.equal(
    JSON.stringify(reloaded.dayPlanRecovery.dayPlan),
    JSON.stringify(malformedV9Plan()),
  );
});

test('an unreadable non-legacy plan is preserved too, marked unreadable', () => {
  const draft = { direction: FORWARD, firstDate: '2026-09-03', groups: [1, 1, 2, 1, 1, 1] };
  const s = normalizeState({ ...v6State(), routeDirection: FORWARD, dayPlan: draft }, 'd1', STAGE_COUNT);
  assert.equal(s.dayPlan, null);
  assert.equal(s.dayPlanRecovery.reason, 'unreadable');
  assert.equal(JSON.stringify(s.dayPlanRecovery.dayPlan), JSON.stringify(draft));
});

test('a VALID migration creates no recovery payload', () => {
  const s = normalizeState(
    { ...v6State(), schemaVersion: 9, routeDirection: FORWARD, dayPlan: journeyPlan() },
    'd1',
    STAGE_COUNT,
  );
  assert.ok(s.dayPlan, 'the plan loaded');
  assert.equal(s.dayPlanRecovery, null, 'nothing was set aside');
});

test('valid v10 state and the default state carry no recovery either', () => {
  assert.equal(defaultState('d1').dayPlanRecovery, null);
  const migrated = normalizeState(
    { ...v6State(), schemaVersion: 9, routeDirection: FORWARD, dayPlan: journeyPlan() },
    'd1',
    STAGE_COUNT,
  );
  assert.equal(normalizeState(migrated, 'd1', STAGE_COUNT).dayPlanRecovery, null);
});

test('an EXISTING recovery survives normalisation and is never replaced', () => {
  const original = malformedV9Plan();
  const withRecovery = {
    ...v6State(),
    routeDirection: FORWARD,
    dayPlan: null,
    dayPlanRecovery: { reason: 'migration-failed', dayPlan: original },
  };
  const s = normalizeState(withRecovery, 'd1', STAGE_COUNT);
  assert.equal(JSON.stringify(s.dayPlanRecovery.dayPlan), JSON.stringify(original));
  // Even when a LATER plan also fails, the first preserved original wins —
  // it is the copy the user has not yet decided about.
  const secondFailure = {
    ...withRecovery,
    dayPlan: { direction: FORWARD, firstDate: 'x', groups: [7] },
  };
  const kept = normalizeState(secondFailure, 'd1', STAGE_COUNT);
  assert.equal(JSON.stringify(kept.dayPlanRecovery.dayPlan), JSON.stringify(original));
  assert.equal(kept.dayPlanRecovery.reason, 'migration-failed');
});

test('a recovery entry with nothing recoverable in it drops without a crash', () => {
  for (const bad of [null, 42, 'copy', [], {}, { reason: 'migration-failed' }]) {
    const s = normalizeState(
      { ...v6State(), routeDirection: FORWARD, dayPlanRecovery: bad },
      'd1',
      STAGE_COUNT,
    );
    assert.equal(s.dayPlanRecovery, null, JSON.stringify(bad));
  }
});

test('removing the recovery is representable without touching anything else', () => {
  const source = { ...v6State(), schemaVersion: 9, routeDirection: FORWARD, dayPlan: malformedV9Plan() };
  const withRecovery = normalizeState(source, 'd1', STAGE_COUNT);
  // What the store's removeDayPlanRecovery action persists:
  const removed = normalizeState({ ...withRecovery, dayPlanRecovery: null }, 'd1', STAGE_COUNT);
  assert.equal(removed.dayPlanRecovery, null);
  assert.deepEqual({ ...removed, dayPlanRecovery: withRecovery.dayPlanRecovery }, withRecovery);
});

test('a legacy payload from any older schema still lands on dayPlan: null', () => {
  for (const legacy of [V1_STATE, { ...V1_STATE, schemaVersion: 3 }]) {
    const s = normalizeState(legacy, 'd1', STAGE_COUNT);
    assert.equal(s.schemaVersion, 10);
    assert.equal(s.dayPlan, null);
  }
});

test('removing the day plan is isolated — nothing else is touched', () => {
  const withPlan = normalizeState(
    { ...v6State(), routeDirection: FORWARD, dayPlan: journeyPlan() },
    'd1',
    STAGE_COUNT,
  );
  const withoutPlan = normalizeState({ ...withPlan, dayPlan: null }, 'd1', STAGE_COUNT);
  assert.equal(withoutPlan.dayPlan, null);
  assert.equal(withoutPlan.currentStageId, withPlan.currentStageId, 'route progress survives');
  assert.deepEqual(withoutPlan.trip, withPlan.trip);
  assert.deepEqual(withoutPlan.packing, withPlan.packing);
  assert.deepEqual(withoutPlan.hutData, withPlan.hutData);
  assert.deepEqual(withoutPlan.journal, withPlan.journal);
});

// ---- Per-unit worn (v8 → v9, on top of the v7 → v8 boolean) -----------------
//
// `worn: boolean` became `wornQuantity: number` (0..quantity). Pre-worn
// payloads land on 0 everywhere; v8 boolean payloads migrate true → 1 worn
// unit (NEVER the whole quantity); malformed or impossible values heal.

test('every pre-worn payload lands on wornQuantity 0 for every item', () => {
  // Legacy (no template version), owned v5/v6, and v1 payloads alike.
  for (const payload of [V1_STATE, legacyStateWithBlanket(), ownedV5State(), v6State()]) {
    const s = normalizeState(payload, 'd1', STAGE_COUNT);
    assert.ok(s.packing.length > 0);
    for (const item of s.packing) {
      assert.equal(item.wornQuantity, 0, `${item.id} starts with no worn units`);
      assert.ok(!('worn' in item), 'the v8 boolean is never stored again');
    }
  }
});

test('v8 boolean payloads: worn true → ONE worn unit, never the whole quantity', () => {
  const out = normalizeState({
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    packing: [
      { id: 'pack.clothing.hiking-shirts', label: 'Hiking shirts', categoryId: 'clothing', quantity: 3, status: 'ready', essential: false, worn: true, custom: false },
      { id: 'pack.footwear.boots', label: 'Boots', categoryId: 'footwear', quantity: 1, status: 'ready', essential: true, worn: true, custom: false },
      { id: 'pack.clothing.fleece', label: 'Fleece', categoryId: 'clothing', quantity: 1, status: 'needed', essential: true, worn: false, custom: false },
    ],
  }, 'd1', STAGE_COUNT);
  const shirts = out.packing.find((i) => i.id === 'pack.clothing.hiking-shirts');
  assert.equal(shirts.wornQuantity, 1, '×3 worn boolean migrates to 1 worn, 2 carried');
  assert.equal(shirts.status, 'ready', 'carried units keep their status');
  assert.equal(out.packing.find((i) => i.id === 'pack.footwear.boots').wornQuantity, 1);
  assert.equal(out.packing.find((i) => i.id === 'pack.clothing.fleece').wornQuantity, 0);
  for (const item of out.packing) assert.ok(!('worn' in item), 'boolean never re-stored');
});

test('v9 roundtrip: wornQuantity persists, including partial worn + packed', () => {
  const s = defaultState('d1');
  s.packing = s.packing.map((i) => {
    if (i.id === 'pack.clothing.hiking-shirts') return { ...i, wornQuantity: 1, status: 'packed' };
    if (i.id === 'pack.footwear.boots') return { ...i, wornQuantity: 1, status: 'ready' };
    return i;
  });
  const out = normalizeState(JSON.parse(JSON.stringify(s)), 'd1', STAGE_COUNT);
  const shirts = out.packing.find((i) => i.id === 'pack.clothing.hiking-shirts');
  assert.equal(shirts.wornQuantity, 1, 'partial worn survives');
  assert.equal(shirts.status, 'packed', '1 worn · 2 packed is a valid persisted row');
  assert.equal(out.packing.find((i) => i.id === 'pack.footwear.boots').wornQuantity, 1);
  assert.equal(out.packing.find((i) => i.id === 'pack.sleep.liner').wornQuantity, 0);
});

test('wornQuantity heals: clamps into 0..quantity, invalid values become 0', () => {
  const row = (wornQuantity) => ({
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    packing: [
      { id: 'pack.clothing.hiking-shirts', label: 'Shirts', categoryId: 'clothing', quantity: 3, status: 'ready', essential: false, wornQuantity, custom: false },
    ],
  });
  assert.equal(normalizeState(row(9), 'd1', STAGE_COUNT).packing[0].wornQuantity, 3, 'clamps to quantity');
  assert.equal(normalizeState(row(-2), 'd1', STAGE_COUNT).packing[0].wornQuantity, 0);
  assert.equal(normalizeState(row(1.7), 'd1', STAGE_COUNT).packing[0].wornQuantity, 2, 'rounds');
  for (const bad of ['two', null, {}, [], true, NaN]) {
    assert.equal(
      normalizeState(row(bad), 'd1', STAGE_COUNT).packing[0].wornQuantity,
      0,
      `wornQuantity=${JSON.stringify(bad)} heals to 0`,
    );
  }
});

test('worn units on a non-eligible category heal to 0', () => {
  const out = normalizeState({
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    packing: [
      { id: 'pack.electronics.phone', label: 'Phone', categoryId: 'electronics', quantity: 1, status: 'ready', essential: true, wornQuantity: 1, custom: false },
      // Unknown category falls back to comfort — also not worn-eligible.
      { id: 'custom_x', label: 'Mystery', categoryId: 'no-such', quantity: 2, status: 'needed', essential: false, wornQuantity: 2, custom: true },
      // v8 boolean on an ineligible category heals the same way.
      { id: 'pack.sleep.liner', label: 'Liner', categoryId: 'sleep', quantity: 1, status: 'ready', essential: true, worn: true, custom: false },
    ],
  }, 'd1', STAGE_COUNT);
  for (const item of out.packing) {
    assert.equal(item.wornQuantity, 0, `${item.id} cannot have worn units`);
  }
});

test('impossible fully-worn + packed heals to packed; partial + packed is kept', () => {
  const raw = {
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    packing: [
      { id: 'pack.footwear.boots', label: 'Boots', categoryId: 'footwear', quantity: 1, status: 'packed', essential: true, wornQuantity: 1, custom: false },
      { id: 'pack.clothing.hiking-shirts', label: 'Shirts', categoryId: 'clothing', quantity: 3, status: 'packed', essential: false, wornQuantity: 1, custom: false },
      // v8 boolean worn + packed heals identically (progress precious).
      { id: 'pack.clothing.fleece', label: 'Fleece', categoryId: 'clothing', quantity: 1, status: 'packed', essential: true, worn: true, custom: false },
    ],
  };
  const once = normalizeState(raw, 'd1', STAGE_COUNT);
  const boots = once.packing.find((i) => i.id === 'pack.footwear.boots');
  assert.equal(boots.status, 'packed');
  assert.equal(boots.wornQuantity, 0, 'fully worn + packed heals to packed');
  const shirts = once.packing.find((i) => i.id === 'pack.clothing.hiking-shirts');
  assert.equal(shirts.status, 'packed');
  assert.equal(shirts.wornQuantity, 1, 'partial worn + packed is valid and untouched');
  const fleece = once.packing.find((i) => i.id === 'pack.clothing.fleece');
  assert.equal(fleece.status, 'packed');
  assert.equal(fleece.wornQuantity, 0);
  const twice = normalizeState(JSON.parse(JSON.stringify(once)), 'd1', STAGE_COUNT);
  assert.deepEqual(twice, once, 'healing is idempotent');
});

test('boolean-to-unit migration is idempotent (second run reads wornQuantity)', () => {
  const v8ish = {
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    packing: [
      { id: 'pack.clothing.hiking-socks', label: 'Socks', categoryId: 'clothing', quantity: 5, status: 'needed', essential: true, worn: true, custom: false },
    ],
  };
  const once = normalizeState(v8ish, 'd1', STAGE_COUNT);
  assert.equal(once.packing[0].wornQuantity, 1);
  const twice = normalizeState(JSON.parse(JSON.stringify(once)), 'd1', STAGE_COUNT);
  assert.deepEqual(twice, once);
});

test('the seed template never pre-marks worn units', () => {
  for (const item of SEED_PACKING_ITEMS) {
    assert.equal(item.wornQuantity, 0, `${item.id} must start with no worn units`);
  }
});
