/**
 * Editing rules for the user-owned packing model (src/utils/packingModel.mjs)
 * — the exact functions AppStore's updatePackingItem / resetPackingProgress
 * delegate to. Every item, seeded or custom, accepts the same edits; id and
 * the custom provenance flag are immutable.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORN_CATEGORY_IDS,
  applyPackingPatch,
  clampQuantity,
  isWornEligibleCategory,
  normalizeWeightGrams,
  packingDisplayState,
  resetPackingProgress,
} from '../src/utils/packingModel.mjs';
import { seedPackingItems } from '../src/utils/stateMigration.mjs';

const seededItem = () => ({
  id: 'pack.clothing.fleece',
  label: 'Fleece / midlayer',
  categoryId: 'clothing',
  quantity: 1,
  status: 'ready',
  essential: true,
  worn: false,
  custom: false,
});

const customItem = () => ({
  id: 'custom_rod',
  label: 'Fishing rod',
  categoryId: 'comfort',
  quantity: 1,
  status: 'needed',
  weightGrams: 300,
  essential: false,
  worn: false,
  custom: true,
});

const patchOne = (item, patch) => applyPackingPatch([item], item.id, patch)[0];

test('a seeded item can be renamed (trimmed), keeping its stable id', () => {
  const out = patchOne(seededItem(), { label: '  Wool jumper  ' });
  assert.equal(out.label, 'Wool jumper');
  assert.equal(out.id, 'pack.clothing.fleece');
  assert.equal(out.custom, false);
});

test('a seeded item can change category — but only to a known category', () => {
  assert.equal(patchOne(seededItem(), { categoryId: 'comfort' }).categoryId, 'comfort');
  assert.equal(patchOne(seededItem(), { categoryId: 'no-such' }).categoryId, 'clothing');
});

test('a seeded item can change its essential flag (booleans only)', () => {
  assert.equal(patchOne(seededItem(), { essential: false }).essential, false);
  assert.equal(patchOne(seededItem(), { essential: 'yes' }).essential, true);
});

test('custom items accept the same edits', () => {
  const out = patchOne(customItem(), {
    label: 'Travel rod',
    categoryId: 'backpack',
    quantity: 2,
    essential: true,
  });
  assert.equal(out.label, 'Travel rod');
  assert.equal(out.categoryId, 'backpack');
  assert.equal(out.quantity, 2);
  assert.equal(out.essential, true);
  assert.equal(out.custom, true);
});

test('id and custom cannot be overwritten through a patch', () => {
  const out = patchOne(seededItem(), { id: 'hacked', custom: true, label: 'X' });
  assert.equal(out.id, 'pack.clothing.fleece');
  assert.equal(out.custom, false);
  assert.equal(out.label, 'X');
});

test('blank titles are rejected — the current title is kept', () => {
  for (const bad of ['', '   ', null, undefined, 42]) {
    assert.equal(patchOne(seededItem(), { label: bad }).label, 'Fleece / midlayer');
  }
});

test('quantity is clamped to 1–99; invalid values keep the current quantity', () => {
  assert.equal(patchOne(seededItem(), { quantity: 0 }).quantity, 1);
  assert.equal(patchOne(seededItem(), { quantity: 250 }).quantity, 99);
  assert.equal(patchOne(seededItem(), { quantity: 2.6 }).quantity, 3);
  assert.equal(patchOne({ ...seededItem(), quantity: 4 }, { quantity: NaN }).quantity, 4);
});

test('invalid weight input becomes absent, never NaN', () => {
  for (const bad of [NaN, -1, 0, 'heavy', undefined]) {
    const out = patchOne(customItem(), { weightGrams: bad });
    assert.ok(!('weightGrams' in out), `weightGrams=${String(bad)} clears the field`);
  }
  assert.equal(patchOne(customItem(), { weightGrams: 123.4 }).weightGrams, 123);
  // A patch that does not mention weight leaves it untouched.
  assert.equal(patchOne(customItem(), { label: 'Rod' }).weightGrams, 300);
});

test('status stays intact when editing other fields', () => {
  const out = patchOne(seededItem(), { label: 'Renamed', quantity: 3 });
  assert.equal(out.status, 'ready');
});

test('unrelated items in the array are untouched (and reference-equal)', () => {
  const a = seededItem();
  const b = customItem();
  const out = applyPackingPatch([a, b], b.id, { label: 'Renamed' });
  assert.equal(out[0], a);
  assert.equal(out[1].label, 'Renamed');
});

test('resetPackingProgress only changes statuses and worn marks', () => {
  const items = seedPackingItems().map((i, idx) => ({
    ...i,
    status: idx % 3 === 0 ? 'packed' : idx % 3 === 1 ? 'ready' : 'needed',
    ...(i.categoryId === 'footwear' ? { status: 'ready', worn: true } : {}),
    ...(idx === 0 ? { label: 'Renamed pack', categoryId: 'comfort' } : {}),
  }));
  items.push(customItem());
  const out = resetPackingProgress(items);
  assert.equal(out.length, items.length);
  for (const item of out) {
    assert.equal(item.status, 'needed');
    assert.equal(item.worn, false, 'worn is progress — a reset clears it');
  }
  assert.equal(out[0].label, 'Renamed pack');
  assert.equal(out[0].categoryId, 'comfort');
  assert.ok(out.some((i) => i.id === 'custom_rod'), 'custom item kept');
});

test('clamp helpers behave at the edges', () => {
  assert.equal(clampQuantity('7', 3), 3);
  assert.equal(clampQuantity(Infinity, 3), 3);
  assert.equal(normalizeWeightGrams(0.4), undefined);
  assert.equal(normalizeWeightGrams(1500.6), 1501);
});

// ---- Worn: eligibility and packed/worn exclusivity --------------------------

test('worn eligibility covers exactly clothing, rain & insulation, footwear', () => {
  assert.deepEqual(WORN_CATEGORY_IDS, ['clothing', 'rain-insulation', 'footwear']);
  for (const id of WORN_CATEGORY_IDS) assert.ok(isWornEligibleCategory(id));
  for (const id of ['backpack', 'sleep', 'electronics', 'comfort', 'no-such', undefined]) {
    assert.equal(isWornEligibleCategory(id), false, `${id} is not worn-eligible`);
  }
});

test('worn accepts booleans only, and only on eligible categories', () => {
  assert.equal(patchOne(seededItem(), { worn: true }).worn, true);
  assert.equal(patchOne({ ...seededItem(), worn: true }, { worn: false }).worn, false);
  assert.equal(patchOne(seededItem(), { worn: 'yes' }).worn, false, 'non-boolean ignored');
  // customItem sits in 'comfort' — not worn-eligible.
  assert.equal(patchOne(customItem(), { worn: true }).worn, false);
});

test('marking worn takes a packed item back to ready — never packed + worn', () => {
  const out = patchOne({ ...seededItem(), status: 'packed' }, { worn: true });
  assert.equal(out.worn, true);
  assert.equal(out.status, 'ready');
});

test('marking packed clears worn — never packed + worn', () => {
  const out = patchOne({ ...seededItem(), worn: true }, { status: 'packed' });
  assert.equal(out.status, 'packed');
  assert.equal(out.worn, false);
});

test('a self-contradicting patch (worn + packed at once) resolves to packed', () => {
  const out = patchOne(seededItem(), { worn: true, status: 'packed' });
  assert.equal(out.status, 'packed');
  assert.equal(out.worn, false);
});

test('moving a worn item to a non-eligible category clears the worn mark', () => {
  const worn = { ...seededItem(), worn: true };
  const out = patchOne(worn, { categoryId: 'electronics' });
  assert.equal(out.categoryId, 'electronics');
  assert.equal(out.worn, false);
  // A worn patch riding along with the move is rejected the same way.
  assert.equal(patchOne(seededItem(), { categoryId: 'sleep', worn: true }).worn, false);
});

test('worn survives unrelated edits; non-packed statuses coexist with worn', () => {
  const worn = { ...seededItem(), worn: true };
  assert.equal(patchOne(worn, { label: 'Renamed' }).worn, true);
  const needed = patchOne(worn, { status: 'needed' });
  assert.equal(needed.status, 'needed');
  assert.equal(needed.worn, true, 'only packed is exclusive with worn');
});

test('packingDisplayState collapses the two axes into one visible state', () => {
  assert.equal(packingDisplayState(seededItem()), 'ready');
  assert.equal(packingDisplayState({ ...seededItem(), worn: true }), 'worn');
  assert.equal(packingDisplayState({ ...seededItem(), status: 'packed' }), 'packed');
});
