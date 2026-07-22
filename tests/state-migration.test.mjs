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

test('schema version is 6', () => {
  assert.equal(SCHEMA_VERSION, 6);
});

test('v1 → v6: schemaVersion is bumped and core fields survive', () => {
  const s = normalizeState(V1_STATE);
  assert.equal(s.schemaVersion, 6);
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
    assert.equal(s.schemaVersion, 6);
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
  assert.equal(s.schemaVersion, 6);
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
  assert.equal(s.schemaVersion, 6);
  assert.deepEqual(s.trip, [], 'no trip items are fabricated');
  // The owned snapshot survives byte-for-byte: no re-run of the seed merge,
  // no restored deletions, no reset progress.
  assert.deepEqual(s.packing, v5.packing);
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
  assert.deepEqual(out.packing, v6.packing, 'packing untouched beside trip data');
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
  assert.equal(s.schemaVersion, 6);
  assert.equal(s.packing.length, SEED_PACKING_ITEMS.length);
  assert.deepEqual(s.trip, []);
});
