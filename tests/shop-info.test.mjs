/**
 * Shop-info dataset: classifications, filtering, standard/extra semantics and
 * the 2025 price-reference contract.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_LOCATIONS,
  SHOP_PRICE_REFERENCE_YEAR,
  SHOP_FACTS_VERIFIED_ON,
  ASSORTMENT_PRODUCTS,
  PRODUCT_CATEGORIES,
  productsForSize,
  assortmentByCategory,
  assortmentCounts,
  searchProducts,
  shopsByType,
} from '../src/data/shops.mjs';

const byId = Object.fromEntries(SHOP_LOCATIONS.map((s) => [s.id, s]));
const productById = Object.fromEntries(ASSORTMENT_PRODUCTS.map((p) => [p.id, p]));

// ---- Classifications along the route ----------------------------------------

test('shop locations are the 10 in the specified route order', () => {
  assert.deepEqual(
    SHOP_LOCATIONS.map((s) => s.id),
    [
      'abisko',
      'abiskojaure',
      'alesjaure',
      'tjaktja',
      'salka',
      'singi',
      'kaitumjaure',
      'teusajaure',
      'kebnekaise',
      'nikkaluokta',
    ],
  );
});

test('each stop carries the STF classification from the brief', () => {
  const expected = {
    abisko: 'station',
    abiskojaure: 'large',
    alesjaure: 'large',
    tjaktja: 'none',
    salka: 'large',
    singi: 'none',
    kaitumjaure: 'small',
    teusajaure: 'small',
    kebnekaise: 'station',
    nikkaluokta: 'local',
  };
  for (const [id, type] of Object.entries(expected)) {
    assert.equal(byId[id].type, type, `${id} should be ${type}`);
  }
});

test('mountain-station and local shops are NOT classed as cabin shops', () => {
  // Abisko + Kebnekaise are stations, Nikkaluokta is local — never large/small.
  for (const id of ['abisko', 'kebnekaise']) {
    assert.equal(byId[id].type, 'station');
  }
  assert.equal(byId['nikkaluokta'].type, 'local');
  // Their descriptions must flag that the range differs from the cabin lists.
  for (const id of ['abisko', 'kebnekaise', 'nikkaluokta']) {
    assert.match(byId[id].stockWarning, /differ/i, `${id} must say its range differs`);
  }
});

// ---- Filtering (All / Large / Small / No shop) ------------------------------

test('shopsByType filters to exactly the expected stops', () => {
  assert.deepEqual(shopsByType('large').map((s) => s.id), ['abiskojaure', 'alesjaure', 'salka']);
  assert.deepEqual(shopsByType('small').map((s) => s.id), ['kaitumjaure', 'teusajaure']);
  assert.deepEqual(shopsByType('none').map((s) => s.id), ['tjaktja', 'singi']);
  assert.deepEqual(shopsByType('station').map((s) => s.id), ['abisko', 'kebnekaise']);
  assert.deepEqual(shopsByType('local').map((s) => s.id), ['nikkaluokta']);
});

// ---- Standard vs Extra product semantics ------------------------------------

test('bold source lines are standard, italic/asterisk lines are extra', () => {
  // Bold in both lists (season-standard):
  assert.equal(productById['chocolate-bar'].large.availability, 'standard');
  assert.equal(productById['chocolate-bar'].small.availability, 'standard');
  assert.equal(productById['freeze-dried-meal'].large.availability, 'standard');
  // *Italic in the Large list (extra):
  assert.equal(productById['salami'].large.availability, 'extra');
  assert.equal(productById['crisps-large'].large.availability, 'extra');
});

test('availability can differ between Large and Small for the same product', () => {
  // Loose pasta: standard in Large, an extra in Small.
  assert.equal(productById['pasta-loose'].large.availability, 'standard');
  assert.equal(productById['pasta-loose'].small.availability, 'extra');
  // 500 g pasta: extra at 50:- in Large, standard at 45:- in Small.
  assert.equal(productById['pasta-500'].large.availability, 'extra');
  assert.equal(productById['pasta-500'].large.referencePrice, 50);
  assert.equal(productById['pasta-500'].small.availability, 'standard');
  assert.equal(productById['pasta-500'].small.referencePrice, 45);
});

test('Large-only products are absent from the Small list', () => {
  // These appear only in the Large PDF.
  for (const id of ['salami', 'fish', 'tofu', 'olives', 'bandage', 'pasta-sauce']) {
    assert.notEqual(productById[id].large, null, `${id} should be in Large`);
    assert.equal(productById[id].small, null, `${id} must NOT be in Small`);
  }
});

test('assortment totals lock the transcription (Large 87, Small 46)', () => {
  const large = assortmentCounts('large');
  const small = assortmentCounts('small');
  assert.deepEqual(large, { standard: 22, extra: 65, total: 87 });
  assert.deepEqual(small, { standard: 20, extra: 26, total: 46 });
  // Small is a strict subset of Large in coverage.
  assert.equal(productsForSize('large').length, ASSORTMENT_PRODUCTS.length);
  assert.ok(productsForSize('small').length < productsForSize('large').length);
});

test('every product belongs to a known category and lists ≥ 1 size', () => {
  const catIds = new Set(PRODUCT_CATEGORIES.map((c) => c.id));
  for (const p of ASSORTMENT_PRODUCTS) {
    assert.ok(catIds.has(p.category), `${p.id} has unknown category ${p.category}`);
    assert.ok(p.large || p.small, `${p.id} must be listed in at least one size`);
  }
});

test('assortmentByCategory only returns non-empty groups in catalogue order', () => {
  const groups = assortmentByCategory('small');
  assert.ok(groups.length > 0);
  for (const g of groups) {
    assert.ok(g.products.length > 0);
    for (const p of g.products) assert.equal(p.category, g.category.id);
  }
});

// ---- 2025 price-reference labelling -----------------------------------------

test('prices are labelled as 2025 reference prices, never guaranteed 2026', () => {
  assert.equal(SHOP_PRICE_REFERENCE_YEAR, 2025);
  // Every listing carries a printable price label.
  for (const p of ASSORTMENT_PRODUCTS) {
    for (const size of ['large', 'small']) {
      const listing = p[size];
      if (!listing) continue;
      assert.equal(typeof listing.priceLabel, 'string');
      assert.ok(listing.priceLabel.length > 0, `${p.id}/${size} missing priceLabel`);
      // A numeric price must agree with its label; compound prices use null.
      if (listing.referencePrice != null) {
        assert.ok(
          listing.priceLabel.includes(String(listing.referencePrice)),
          `${p.id}/${size} price label ${listing.priceLabel} ≠ ${listing.referencePrice}`,
        );
      }
    }
  }
});

test('sources are static snapshots with a warning and the research verify date', () => {
  for (const s of SHOP_LOCATIONS) {
    assert.equal(s.source.kind, 'static');
    assert.ok(s.source.warning && s.source.warning.length > 0);
    assert.equal(s.source.lastVerified, SHOP_FACTS_VERIFIED_ON);
    assert.equal(s.source.lastVerified, '2026-07-12');
  }
});

// ---- Search -----------------------------------------------------------------

test('product search is case-insensitive and matches labels', () => {
  const hits = searchProducts('CHOCOLATE');
  assert.ok(hits.some((p) => p.id === 'chocolate-bar'));
  assert.equal(searchProducts('   ').length, 0);
});
