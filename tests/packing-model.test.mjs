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
  carriedQuantity,
  clampQuantity,
  clampWornQuantity,
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
  wornQuantity: 0,
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
  wornQuantity: 0,
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

test('resetPackingProgress only changes statuses and worn units', () => {
  const items = seedPackingItems().map((i, idx) => ({
    ...i,
    status: idx % 3 === 0 ? 'packed' : idx % 3 === 1 ? 'ready' : 'needed',
    // Footwear fully worn, clothing partially worn — both must reset.
    ...(i.categoryId === 'footwear' ? { status: 'ready', wornQuantity: i.quantity } : {}),
    ...(i.categoryId === 'clothing' && i.quantity > 1
      ? { status: 'ready', wornQuantity: 1 }
      : {}),
    ...(idx === 0 ? { label: 'Renamed pack', categoryId: 'comfort' } : {}),
  }));
  items.push(customItem());
  const out = resetPackingProgress(items);
  assert.equal(out.length, items.length);
  for (const item of out) {
    assert.equal(item.status, 'needed');
    assert.equal(item.wornQuantity, 0, 'worn units are progress — a reset clears them');
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

// ---- Worn units: eligibility, clamping, unit-level exclusivity --------------

test('worn eligibility covers exactly clothing, rain & insulation, footwear', () => {
  assert.deepEqual(WORN_CATEGORY_IDS, ['clothing', 'rain-insulation', 'footwear']);
  for (const id of WORN_CATEGORY_IDS) assert.ok(isWornEligibleCategory(id));
  for (const id of ['backpack', 'sleep', 'electronics', 'comfort', 'no-such', undefined]) {
    assert.equal(isWornEligibleCategory(id), false, `${id} is not worn-eligible`);
  }
});

test('clampWornQuantity keeps 0 <= wornQuantity <= quantity, integers only', () => {
  assert.equal(clampWornQuantity(2, 3), 2);
  assert.equal(clampWornQuantity(5, 3), 3, 'cannot exceed quantity');
  assert.equal(clampWornQuantity(-1, 3), 0, 'cannot go below 0');
  assert.equal(clampWornQuantity(1.6, 3), 2, 'rounds to whole units');
  for (const bad of [NaN, Infinity, 'two', null, undefined, {}]) {
    assert.equal(clampWornQuantity(bad, 3), 0, `${String(bad)} falls back to 0`);
    assert.equal(clampWornQuantity(bad, 3, 2), 2, `${String(bad)} honours the fallback`);
  }
  assert.equal(clampWornQuantity(9, 3, 2), 3, 'fallback also clamps');
});

test('wornQuantity patches clamp into 0..quantity; eligible categories only', () => {
  const multi = { ...seededItem(), quantity: 3 };
  assert.equal(patchOne(multi, { wornQuantity: 1 }).wornQuantity, 1);
  assert.equal(patchOne(multi, { wornQuantity: 9 }).wornQuantity, 3, 'clamps to quantity');
  assert.equal(patchOne(multi, { wornQuantity: -2 }).wornQuantity, 0);
  assert.equal(patchOne(multi, { wornQuantity: 'one' }).wornQuantity, 0, 'invalid keeps current');
  // customItem sits in comfort — not worn-eligible.
  assert.equal(patchOne(customItem(), { wornQuantity: 1 }).wornQuantity, 0);
});

test('shrinking the quantity clamps the worn units in the same patch', () => {
  const worn2of3 = { ...seededItem(), quantity: 3, wornQuantity: 2 };
  assert.equal(patchOne(worn2of3, { quantity: 1 }).wornQuantity, 1, '3→1 clamps worn 2→1');
  const kept = patchOne(worn2of3, { quantity: 5 });
  assert.equal(kept.wornQuantity, 2, 'growing the quantity keeps the worn units');
  assert.equal(kept.quantity, 5);
});

test('a partially worn packed row is VALID: 3 shirts, 1 worn, 2 packed', () => {
  const out = patchOne({ ...seededItem(), quantity: 3, status: 'packed' }, { wornQuantity: 1 });
  assert.equal(out.status, 'packed', 'carried units stay packed');
  assert.equal(out.wornQuantity, 1);
  assert.equal(carriedQuantity(out), 2);
});

test('wearing the FULL quantity of a packed row demotes it to ready', () => {
  const q1 = patchOne({ ...seededItem(), status: 'packed' }, { wornQuantity: 1 });
  assert.equal(q1.status, 'ready');
  assert.equal(q1.wornQuantity, 1);
  const q3 = patchOne({ ...seededItem(), quantity: 3, status: 'packed' }, { wornQuantity: 3 });
  assert.equal(q3.status, 'ready');
  assert.equal(q3.wornQuantity, 3);
});

test('marking packed on a fully worn row takes every unit back into the pack', () => {
  const out = patchOne({ ...seededItem(), quantity: 3, wornQuantity: 3 }, { status: 'packed' });
  assert.equal(out.status, 'packed');
  assert.equal(out.wornQuantity, 0);
});

test('a self-contradicting patch (fully worn + packed at once) resolves to packed', () => {
  const out = patchOne(
    { ...seededItem(), quantity: 3 },
    { wornQuantity: 3, status: 'packed' },
  );
  assert.equal(out.status, 'packed');
  assert.equal(out.wornQuantity, 0);
});

test('marking packed keeps PARTIAL worn units (only zero-carried conflicts)', () => {
  const out = patchOne({ ...seededItem(), quantity: 3, wornQuantity: 1 }, { status: 'packed' });
  assert.equal(out.status, 'packed');
  assert.equal(out.wornQuantity, 1, '1 worn · 2 packed is a legal outcome');
});

test('moving a worn row to a non-eligible category clears its worn units', () => {
  const worn = { ...seededItem(), quantity: 3, wornQuantity: 2 };
  const out = patchOne(worn, { categoryId: 'electronics' });
  assert.equal(out.categoryId, 'electronics');
  assert.equal(out.wornQuantity, 0);
  // Worn units riding along with the move are rejected the same way.
  assert.equal(patchOne(seededItem(), { categoryId: 'sleep', wornQuantity: 1 }).wornQuantity, 0);
});

test('worn units survive unrelated edits; non-packed statuses coexist', () => {
  const worn = { ...seededItem(), quantity: 3, wornQuantity: 1 };
  assert.equal(patchOne(worn, { label: 'Renamed' }).wornQuantity, 1);
  const needed = patchOne(worn, { status: 'needed' });
  assert.equal(needed.status, 'needed');
  assert.equal(needed.wornQuantity, 1, '1 worn · 2 needed is a legal row');
});

test('packingDisplayState: fully worn shows worn, partial shows carried status', () => {
  assert.equal(packingDisplayState(seededItem()), 'ready');
  assert.equal(packingDisplayState({ ...seededItem(), wornQuantity: 1 }), 'worn', 'q1 fully worn');
  assert.equal(
    packingDisplayState({ ...seededItem(), quantity: 3, wornQuantity: 3 }),
    'worn',
    'q3 fully worn',
  );
  assert.equal(
    packingDisplayState({ ...seededItem(), quantity: 3, wornQuantity: 1 }),
    'ready',
    'partially worn rows show the carried status',
  );
  assert.equal(packingDisplayState({ ...seededItem(), status: 'packed' }), 'packed');
});

test('carriedQuantity is quantity minus worn units, never negative', () => {
  assert.equal(carriedQuantity({ quantity: 3, wornQuantity: 1 }), 2);
  assert.equal(carriedQuantity({ quantity: 3, wornQuantity: 3 }), 0);
  assert.equal(carriedQuantity({ quantity: 1, wornQuantity: 0 }), 1);
  assert.equal(carriedQuantity({ quantity: 2, wornQuantity: 5 }), 0, 'corrupt input floors at 0');
});
