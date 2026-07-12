/**
 * Shops restructured around three shop TYPES (not route locations).
 * Authority split: Stops owns which location has a shop; Shops owns shop-type
 * and assortment information.
 *
 * Data/logic checks + source scans (this repo's runner has no DOM; behavioural
 * selection/focus is verified in the browser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SHOP_CATEGORIES,
  FULL_SERVICE_SHOPS,
  shopTypeForStop,
  assortmentCounts,
} from '../src/data/shops.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shopView = readFileSync(join(root, 'src/components/ShopInfoView.tsx'), 'utf8');

// The eight stops the app's route actually visits.
const ROUTE_STOPS = [
  'abisko',
  'abiskojaure',
  'alesjaure',
  'tjaktja',
  'salka',
  'singi',
  'kebnekaise',
  'nikkaluokta',
];

// ---- Exactly three shop-type categories -------------------------------------

test('there are exactly three shop-type categories with the singular labels', () => {
  assert.deepEqual(SHOP_CATEGORIES.map((c) => c.id), ['large', 'small', 'full-service']);
  assert.deepEqual(SHOP_CATEGORIES.map((c) => c.label), [
    'Large shop',
    'Small shop',
    'Full-service shops',
  ]);
});

test('"assortment"/"station" wording is not used as a primary category label', () => {
  for (const c of SHOP_CATEGORIES) {
    assert.ok(!/assortment|station|mountain-station/i.test(c.label), `${c.label}`);
  }
  // The three shop-type chips render the SHOP_CATEGORIES labels directly.
  assert.match(shopView, /SHOP_CATEGORIES\.map/);
  assert.match(shopView, /aria-label="Choose a shop type"/);
});

// ---- Route shop overview removed --------------------------------------------

test('the Route shop overview, class filters and per-location cards are gone', () => {
  assert.ok(!/Route shop overview/.test(shopView), 'no overview heading');
  assert.ok(!/Filter shops by class/.test(shopView), 'no class filter group');
  assert.ok(!/No shop/.test(shopView), 'no "No shop" entries in Shops');
  assert.ok(!/ShopBadge|shop-badge/.test(shopView), 'no location class badges');
  assert.ok(!/resupplyHint/.test(shopView), 'no resupply-hint rows');
  // No per-location accordion (the old ones used id={`shop-${loc.id}`}).
  assert.ok(!/id=\{`shop-\$\{loc\.id\}`\}/.test(shopView), 'no per-location disclosures');
  assert.ok(!/shopLocationForStop/.test(shopView), 'no location deep-link logic');
});

// ---- Catalogues intact for Large and Small ----------------------------------

test('Large and Small catalogues are unchanged (Large 87 / Small 46)', () => {
  assert.deepEqual(assortmentCounts('large'), { standard: 22, extra: 65, total: 87 });
  assert.deepEqual(assortmentCounts('small'), { standard: 20, extra: 26, total: 46 });
});

test('Shops renders Large and Small catalogues via one assortment panel', () => {
  assert.match(shopView, /AssortmentPanel/);
  assert.match(shopView, /assortmentByCategory\(size\)/);
  assert.match(shopView, /Search the \$\{sizeLabel\} shop/);
});

// ---- Small kept despite no route-stop mapping -------------------------------

test('Small shop stays available even though no route stop maps to it', () => {
  assert.ok(SHOP_CATEGORIES.some((c) => c.id === 'small'), 'Small category present');
  // No stop on the actual route deep-links to Small.
  for (const id of ROUTE_STOPS) {
    assert.notEqual(shopTypeForStop(id), 'small', `${id} must not map to Small`);
  }
});

// ---- Full-service: three locations, no fabricated inventory -----------------

test('Full-service contains only Abisko, Kebnekaise and Nikkaluokta', () => {
  assert.deepEqual(FULL_SERVICE_SHOPS.map((s) => s.id), ['abisko', 'kebnekaise', 'nikkaluokta']);
  for (const s of FULL_SERVICE_SHOPS) {
    assert.ok(s.name && s.note && s.source?.url, `${s.id} has name/note/source`);
  }
});

test('Full-service descriptions use accurate, distinct facility language', () => {
  const byId = Object.fromEntries(FULL_SERVICE_SHOPS.map((s) => [s.id, s.note]));
  assert.match(byId.abisko, /tourist-station|trailhead/i);
  assert.match(byId.kebnekaise, /mountain-station/i);
  assert.match(byId.nikkaluokta, /independent/i);
});

test('Full-service shows no fabricated catalogue or reference prices', () => {
  // The full-service panel is info-only: no product search, Standard/Extra or
  // 2025 price controls, and it states no reliable inventory exists.
  assert.match(shopView, /FullServicePanel/);
  assert.match(shopView, /no reliable inventory or price/i);
  assert.match(shopView, /check range, availability and prices/i);
  assert.match(shopView, /Do not assume[\s\S]*?Large cabin shop/i);
  // The price/search/availability machinery lives only in AssortmentPanel.
  const fsStart = shopView.indexOf('function FullServicePanel');
  const fsEnd = shopView.indexOf('export function ShopInfoView');
  const fsBody = shopView.slice(fsStart, fsEnd);
  assert.ok(!/prod-search/.test(fsBody), 'no product search in full-service');
  assert.ok(!/avail-tag|Standard|Extra\*/.test(fsBody), 'no Standard/Extra in full-service');
  assert.ok(!/reference prices/.test(fsBody), 'no price controls in full-service');
});

test('Full-service copy does not claim identical formal classifications', () => {
  assert.match(shopView, /does not claim[\s\S]*?formal STF classification/i);
});

// ---- Deep-link mapping (Stops → shop TYPE) ----------------------------------

test('Shop chips deep-link to the correct shop type', () => {
  // Large cabin shops
  for (const id of ['abiskojaure', 'alesjaure', 'salka']) {
    assert.equal(shopTypeForStop(id), 'large');
  }
  // Full-service
  for (const id of ['abisko', 'kebnekaise', 'nikkaluokta']) {
    assert.equal(shopTypeForStop(id), 'full-service');
  }
  // No shop → non-navigational
  assert.equal(shopTypeForStop('tjaktja'), null);
  assert.equal(shopTypeForStop('singi'), null);
});
