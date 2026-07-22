/**
 * Contract tests for the packing template v2 expansion (cooking, emergency,
 * first-aid and repair items) — the exact seed module the app imports.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKING_CATEGORIES,
  PACKING_TEMPLATE_VERSION,
  RETIRED_SEED_IDS,
  SEED_ID_REPLACEMENTS,
  SEED_PACKING_ITEMS,
} from '../src/data/packingSeed.mjs';

const byId = new Map(SEED_PACKING_ITEMS.map((i) => [i.id, i]));

test('template version is 2 and the blanket→bivvy replacement is recorded', () => {
  assert.equal(PACKING_TEMPLATE_VERSION, 2);
  assert.equal(
    SEED_ID_REPLACEMENTS['pack.navigation-safety.emergency-blanket'],
    'pack.navigation-safety.emergency-bivvy',
  );
});

test('all seed ids are unique and categories are valid', () => {
  const ids = new Set();
  const catIds = new Set(PACKING_CATEGORIES.map((c) => c.id));
  for (const item of SEED_PACKING_ITEMS) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    assert.ok(catIds.has(item.categoryId), `unknown category ${item.categoryId}`);
  }
});

test('every SEED_ID_REPLACEMENTS target exists in the seed; no source does', () => {
  for (const [oldId, newId] of Object.entries(SEED_ID_REPLACEMENTS)) {
    assert.ok(!byId.has(oldId), `retired id ${oldId} must not remain in the seed`);
    assert.ok(byId.has(newId), `replacement id ${newId} must exist in the seed`);
  }
});

test('the emergency blanket is gone; the bivvy is present and essential', () => {
  assert.ok(!byId.has('pack.navigation-safety.emergency-blanket'));
  const bivvy = byId.get('pack.navigation-safety.emergency-bivvy');
  assert.ok(bivvy);
  assert.equal(bivvy.label, 'Emergency bivvy / survival bag');
  assert.equal(bivvy.essential, true);
  assert.equal(bivvy.quantity, 1);
});

// The full v2 addition set, with the agreed essential flags and quantities.
const V2_ADDITIONS = [
  ['pack.navigation-safety.emergency-bivvy', 'Emergency bivvy / survival bag', true, 1],
  ['pack.navigation-safety.map-case', 'Waterproof map case', true, 1],
  ['pack.navigation-safety.backup-flashlight', 'Backup flashlight (100–200 lm)', false, 1],
  ['pack.navigation-safety.utility-cord', 'Utility cord (4–6 m, 2–3 mm)', false, 1],
  ['pack.navigation-safety.repair-tape', 'Repair tape', true, 1],
  ['pack.navigation-safety.gear-patches', 'Self-adhesive gear patches', false, 1],
  ['pack.navigation-safety.zip-ties', 'Tiewraps / zip ties', false, 4],
  ['pack.navigation-safety.needle-thread', 'Needle + strong thread', false, 1],
  ['pack.navigation-safety.spare-shoelace', 'Spare shoelace', false, 1],
  ['pack.navigation-safety.spare-buckle', 'Compatible spare backpack buckle', false, 1],
  ['pack.food-water.gas-stove', 'Compact screw-on gas stove', false, 1],
  ['pack.food-water.stove-adapter', 'Stove adapter / connector (only if required)', false, 1],
  ['pack.food-water.gas-canister', 'EN417 gas canister (100–110 g)', false, 1],
  ['pack.food-water.cook-pot', 'Cook pot with lid (750–900 ml)', false, 1],
  ['pack.food-water.long-spoon', 'Long-handled spoon / spork', false, 1],
  ['pack.food-water.lighter', 'Small lighter', false, 1],
  ['pack.food-water.cleaning-cloth', 'Small cleaning cloth', false, 1],
  ['pack.food-water.waste-bags', 'Waste bags', true, 3],
  // Conditional default: needing medication is a personal medical fact, so
  // the generic template must not open with an impossible essential warning.
  ['pack.hygiene-first-aid.personal-medication', 'Personal medication + reserve (if applicable)', false, 1],
  ['pack.hygiene-first-aid.tweezers-tick-remover', 'Tweezers + tick remover', false, 1],
];

test('all template-v2 additions exist with the agreed flags and quantities', () => {
  for (const [id, label, essential, quantity] of V2_ADDITIONS) {
    const item = byId.get(id);
    assert.ok(item, `${id} exists`);
    assert.equal(item.label, label, `${id} label`);
    assert.equal(item.essential, essential, `${id} essential`);
    assert.equal(item.quantity, quantity, `${id} quantity`);
    // The item's id encodes its category — keep them consistent.
    assert.ok(id.startsWith(`pack.${item.categoryId}.`), `${id} category matches id`);
  }
});

test('label updates: gloves include the dry spare pair (×2), first aid kit renamed', () => {
  const gloves = byId.get('pack.clothing.gloves');
  assert.equal(gloves.label, 'Gloves + dry spare pair');
  assert.equal(gloves.quantity, 2, 'one active pair + one dry spare pair');
  assert.equal(gloves.essential, true);
  const firstAid = byId.get('pack.navigation-safety.first-aid');
  assert.equal(firstAid.label, 'Walking first aid kit (complete and replenished)');
  assert.equal(firstAid.essential, true);
});

test('exactly ONE first-aid kit concept: the refill item is retired', () => {
  assert.ok(!byId.has('pack.hygiene-first-aid.first-aid-refill'));
  assert.ok(RETIRED_SEED_IDS.includes('pack.hygiene-first-aid.first-aid-refill'));
  const kitLabels = SEED_PACKING_ITEMS.filter((i) =>
    i.label.toLowerCase().includes('first aid') || i.label.toLowerCase().includes('first-aid'),
  );
  assert.equal(kitLabels.length, 1, 'only one first-aid kit item in the template');
});

test('no retired id also exists in the seed or as a replacement source/target', () => {
  for (const id of RETIRED_SEED_IDS) {
    assert.ok(!byId.has(id), `retired id ${id} must not remain in the seed`);
    assert.ok(!(id in SEED_ID_REPLACEMENTS), `retired id ${id} must not be a replacement source`);
    assert.ok(
      !Object.values(SEED_ID_REPLACEMENTS).includes(id),
      `retired id ${id} must not be a replacement target`,
    );
  }
});

test('kept items still exist once — no duplicated concepts were added', () => {
  for (const id of [
    'pack.navigation-safety.whistle',
    'pack.navigation-safety.headlamp',
    'pack.navigation-safety.knife',
    'pack.footwear.blister-tape',
    'pack.hygiene-first-aid.painkillers',
    'pack.food-water.emergency-food',
    'pack.hygiene-first-aid.soap',
    'pack.food-water.thermos',
  ]) {
    assert.equal(
      SEED_PACKING_ITEMS.filter((i) => i.id === id).length,
      1,
      `${id} exists exactly once`,
    );
  }
  // No second knife/multitool, lighter-adjacent fire kit, or second whistle
  // sneaked in under a new id.
  const labels = SEED_PACKING_ITEMS.map((i) => i.label.toLowerCase());
  assert.equal(labels.filter((l) => l.includes('whistle')).length, 1);
  assert.equal(labels.filter((l) => l.includes('headlamp')).length, 1);
  assert.equal(labels.filter((l) => l.includes('knife') || l.includes('multitool')).length, 1);
});

test('excluded gear stays excluded (no bushcraft/fire-kit/windscreen items)', () => {
  const labels = SEED_PACKING_ITEMS.map((i) => i.label.toLowerCase());
  for (const banned of ['ferro', 'tinder', 'climbing rope', 'axe', 'saw', 'windscreen']) {
    assert.ok(
      !labels.some((l) => l.includes(banned)),
      `no seed label contains "${banned}"`,
    );
  }
});
