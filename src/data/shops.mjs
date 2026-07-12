/**
 * Curated shop-info dataset for the Fjällkompis route.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so the Node test runner can
 * import it directly; the app imports it through Vite the same way (matches
 * packingSeed.mjs). It is deliberately STATIC — nothing is scraped at runtime
 * and none of it is user-editable. Re-verify against the sources and edit here.
 *
 * Two things are faithfully transcribed from STF's official 2025 shop lists:
 *  1. the Small and Large cabin-shop ASSORTMENTS (butik-prislista-small /
 *     -large-2025-engelska.pdf), and
 *  2. the standard-vs-extra distinction the source encodes typographically —
 *     BOLD = standard inventory expected all season, *italic = extra inventory
 *     while stocks last (mainly peak season).
 *
 * Prices are 2025 REFERENCE prices — never presented as guaranteed 2026 prices
 * (SHOP_PRICE_REFERENCE_YEAR + the per-card validity line enforce this). Labels
 * are normalised English: obvious source spelling/translation slips are fixed
 * for display, but no product meaning is invented and no price is altered.
 *
 * The product catalogue is UNIFIED (one row per product) with a per-size
 * listing, because the same product can differ between the two lists in both
 * price and standard/extra status — e.g. loose pasta is standard in Large but
 * an extra in Small, and 500 g pasta is 50:- (extra) in Large but 45:-
 * (standard) in Small. A null size means that size's official list omits it.
 */

export const SHOP_PRICE_REFERENCE_YEAR = 2025;
export const SHOP_FACTS_VERIFIED_ON = '2026-07-12';

/** STF's official assortment definitions (quoted from the shops overview). */
export const SHOP_TYPE_INFO = {
  station: {
    label: 'Mountain-station shop',
    short: 'Station',
    blurb:
      'A mountain-station shop, far larger and broader than the STF cabin shops. Its actual range is not the STF cabin assortment lists below.',
  },
  large: {
    label: 'Large cabin shop',
    short: 'Large',
    blurb:
      'STF “Large” selection: a wider and broader range of products.',
  },
  small: {
    label: 'Small cabin shop',
    short: 'Small',
    blurb:
      'STF “Small” selection: a limited range, but intended to hold enough to prepare a complete meal.',
  },
  none: {
    label: 'No shop',
    short: 'No shop',
    blurb: 'No shop at this stop — carry what you need through it.',
  },
  local: {
    label: 'Local shop',
    short: 'Local',
    blurb:
      'A separate local facility/shop, outside the STF cabin classification — its range differs from the cabin assortment lists.',
  },
};

export const PRODUCT_CATEGORIES = [
  { id: 'meals-pantry', title: 'Meals and pantry' },
  { id: 'bread-spreads', title: 'Bread and spreads' },
  { id: 'canned', title: 'Canned food' },
  { id: 'loose-weight', title: 'Loose-weight staples' },
  { id: 'snacks-sweets', title: 'Snacks and sweets' },
  { id: 'drinks', title: 'Drinks' },
  { id: 'first-aid-hygiene', title: 'First aid and hygiene' },
  { id: 'fuel', title: 'Fuel' },
  { id: 'camping', title: 'Camping supplies' },
];

/**
 * Shared STF assortment sources — cited by every cabin shop (large/small/none).
 * lastVerified is the research date for this iteration.
 */
export const STF_SHOP_OVERVIEW_SOURCE = {
  title: 'STF — Mountain cabin shops (assortment classification)',
  url: 'https://www.swedishtouristassociation.com/guides/mountains/shops/',
  publisher: 'Svenska Turistföreningen (STF)',
  sourceYear: 2025,
  lastVerified: SHOP_FACTS_VERIFIED_ON,
  kind: 'static',
  warning: 'Assortment and prices are planning references. Stock and prices may change.',
};

export const STF_LARGE_PRICELIST_URL =
  'https://www.swedishtouristassociation.com/app/uploads/sites/2/2025/02/butik-prislista-butik-large-2025-engelska.pdf';
export const STF_SMALL_PRICELIST_URL =
  'https://www.swedishtouristassociation.com/app/uploads/sites/2/2025/02/butik-prislista-small-2025-engelska.pdf';

// --- Listing helpers ---------------------------------------------------------

/** Bold source line → standard listing. */
const std = (referencePrice, priceLabel, priceUnit) => ({
  availability: 'standard',
  referencePrice,
  priceLabel: priceLabel ?? `${referencePrice}:-`,
  ...(priceUnit ? { priceUnit } : {}),
});
/** *Italic source line → extra (while-stocks-last) listing. */
const extra = (referencePrice, priceLabel, priceUnit) => ({
  availability: 'extra',
  referencePrice,
  priceLabel: priceLabel ?? `${referencePrice}:-`,
  ...(priceUnit ? { priceUnit } : {}),
});

const p = (id, label, category, large, small, note) => ({
  id,
  label,
  category,
  large,
  small,
  ...(note ? { note } : {}),
});

/**
 * The unified product catalogue. Each row carries its Large and Small listings
 * exactly as the two 2025 PDFs print them (bold→standard, *italic→extra), or
 * null where that list omits the product.
 */
export const ASSORTMENT_PRODUCTS = [
  // ---- Meals and pantry (STF "Larder" / "Skafferi") ----
  p('freeze-dried-meal', 'Freeze-dried ready meal', 'meals-pantry', std(140), std(140)),
  p('freeze-dried-breakfast', 'Freeze-dried breakfast', 'meals-pantry', extra(85), extra(85)),
  p('powder-soup', 'Powder soup, sachet', 'meals-pantry',
    std(null, '35:- (3-pack) / 15:- (single)'), std(null, '35:- (3-pack) / 15:- (single)')),
  p('pasta-sauce', 'Pasta sauce, 3 dl pouch', 'meals-pantry', extra(25), null),
  p('noodles', 'Noodles', 'meals-pantry', extra(15), extra(15)),
  p('pasta-500', 'Pasta, 500 g', 'meals-pantry', extra(50), std(45)),
  p('tortellini', 'Tortellini pasta', 'meals-pantry', extra(85), null),
  p('mashed-potato', 'Mashed potato, powder', 'meals-pantry', extra(35), extra(35)),
  p('taco-veg', 'Taco mix, vegetarian (soy protein)', 'meals-pantry', extra(40), null),
  p('lingonberry-jam', 'Lingonberry jam, single', 'meals-pantry', extra(10), null),
  p('olive-oil', 'Olive oil', 'meals-pantry', extra(40), null),
  p('parmesan', 'Parmesan cheese', 'meals-pantry', extra(25), null),
  p('sugar-single', 'Sugar, single', 'meals-pantry', extra(5), null),

  // ---- Bread and spreads ----
  p('crispbread', 'Crispbread (hard bread)', 'bread-spreads', std(35), std(35)),
  p('crispbread-gf', 'Crispbread, gluten-free', 'bread-spreads', extra(50), null),
  p('dark-rye', 'Dark rye bread', 'bread-spreads', extra(50), null),
  p('tortilla', 'Tortilla wraps', 'bread-spreads', extra(40), null),
  p('soft-cheese', 'Soft cheese, 250 g', 'bread-spreads', std(95), std(95)),
  p('veg-pate', 'Vegetarian paté', 'bread-spreads', extra(95), null),
  p('salami', 'Salami', 'bread-spreads', extra(45), null),
  p('dried-ham', 'Dried ham', 'bread-spreads', extra(65), null),
  p('peanut-butter', 'Peanut butter', 'bread-spreads', extra(65), null),

  // ---- Canned food (STF "Canned goods" / "Konserver") ----
  p('fruit-cocktail', 'Fruit cocktail', 'canned', std(60), std(60)),
  p('beans', 'Beans, assorted', 'canned', std(35), std(35)),
  p('tomatoes', 'Tomatoes', 'canned', std(35), std(35)),
  p('corn', 'Corn', 'canned', std(45), std(45)),
  p('sausage', 'Sausage', 'canned', std(65), std(65)),
  p('meat', 'Meat, assorted', 'canned', std(90), std(90)),
  p('fish', 'Fish', 'canned', extra(40), null),
  p('tofu', 'Tofu', 'canned', extra(65), null),
  p('pineapple', 'Pineapple', 'canned', extra(30), null),

  // ---- Loose-weight staples (priced per dl) ----
  p('oats', 'Oats', 'loose-weight', std(5, '5:-/dl', 'per dl'), std(5, '5:-/dl', 'per dl')),
  p('pasta-loose', 'Pasta', 'loose-weight', std(5, '5:-/dl', 'per dl'), extra(5, '5:-/dl', 'per dl')),
  p('rice', 'Rice', 'loose-weight', std(10, '10:-/dl', 'per dl'), extra(10, '10:-/dl', 'per dl')),
  p('lentils', 'Lentils', 'loose-weight', std(10, '10:-/dl', 'per dl'), extra(10, '10:-/dl', 'per dl')),
  p('fruit-soup', 'Blueberry / fruit powder soup', 'loose-weight',
    extra(20, '20:-/dl', 'per dl'), null),

  // ---- Snacks and sweets (STF "Candy" + "Snacks/Cookies") ----
  p('chocolate-bar', 'Chocolate bar, 125–145 g', 'snacks-sweets', std(55), std(55)),
  p('dark-chocolate', 'Dark chocolate, 5 g', 'snacks-sweets', extra(5), null),
  p('chocolate-27', 'Chocolate bar, 27 g', 'snacks-sweets',
    extra(null, '15:- (3 for 35:-)'), null),
  p('chocolate-wafer', 'Chocolate wafer / Snickers', 'snacks-sweets', extra(20), extra(20)),
  p('bars', 'Bars (assorted)', 'snacks-sweets', extra(40), null),
  p('candy-bag', 'Candy bag', 'snacks-sweets', extra(40), extra(40)),
  p('pastilles', 'Pastille box', 'snacks-sweets', extra(15), null),
  p('dextrosol', 'Dextrosol (glucose tablets)', 'snacks-sweets', extra(25), null),
  p('crisps-small', 'Crisps, small bag', 'snacks-sweets', extra(25), extra(25)),
  p('crisps-large', 'Crisps, large bag', 'snacks-sweets', extra(45), null),
  p('cashews', 'Cashew nuts', 'snacks-sweets', extra(35), null),
  p('nuts', 'Nuts, chilli / salted', 'snacks-sweets', extra(45), null),
  p('olives', 'Olives', 'snacks-sweets', extra(40), null),
  p('dried-sausage', 'Dried sausage, reindeer / moose', 'snacks-sweets', extra(50), null),
  p('cookies', 'Cookies / digestive biscuits', 'snacks-sweets', extra(55), extra(55)),

  // ---- Drinks ----
  p('coffee', 'Coffee / hot chocolate, sachet', 'drinks', std(10), std(10)),
  p('tea', 'Tea, sachet', 'drinks', std(5), std(5)),
  p('soft-drink', 'Soft drink, 33 cl', 'drinks', extra(40), extra(40)),
  p('beer', 'Beer, 33 cl', 'drinks', extra(60), extra(60)),
  p('milk-sticks', 'Milk powder, coffee sticks', 'drinks',
    extra(null, '5:- (5 sticks)'), null),
  p('milk-loose', 'Milk powder, loose weight', 'drinks',
    extra(10, '10:-/dl', 'per dl'), null),
  p('milk-bag', 'Milk powder, 1 l bag', 'drinks', extra(25), null),

  // ---- First aid and hygiene (STF "Apotek") ----
  p('sanitary-pads', 'Sanitary pads (single / pack)', 'first-aid-hygiene',
    std(null, '5:- (single) / 50:- (pack)'), std(null, '5:- (single) / 50:- (pack)')),
  p('plaster', 'Plaster (adhesive)', 'first-aid-hygiene', std(30), std(30)),
  p('compeed', 'Compeed blister plasters', 'first-aid-hygiene',
    extra(null, '20:- (single)'), extra(null, '20:- (single) / 90:- (pack)')),
  p('bandage', 'Bandage', 'first-aid-hygiene', extra(120), null),
  p('leukoplast', 'Leukoplast (tape)', 'first-aid-hygiene', extra(80), null),
  p('lip-salve', 'Lip salve (cerate)', 'first-aid-hygiene', extra(40), null),
  p('sun-lip-balm', 'Sun lip balm', 'first-aid-hygiene', extra(75), null),
  p('lip-face-stick', 'Lip & face protection stick', 'first-aid-hygiene', extra(130), null),
  p('tampon-single', 'Tampon, single', 'first-aid-hygiene', extra(5), null),
  p('tampons', 'Tampons (pack)', 'first-aid-hygiene', extra(50), null),
  p('toothbrush', 'Toothbrush', 'first-aid-hygiene', extra(25), null),
  p('travel-dental', 'Toothbrush & toothpaste travel kit', 'first-aid-hygiene', extra(35), null),
  p('soap', 'Soap — hair/body & dish/laundry', 'first-aid-hygiene', extra(85), null),
  p('mosquito', 'Mosquito repellent', 'first-aid-hygiene', extra(150), extra(150)),
  p('rehydration', 'Rehydration salts', 'first-aid-hygiene', extra(45), extra(45)),

  // ---- Fuel ----
  p('gas-230', 'Camping gas, 230 g', 'fuel', extra(100), extra(100)),
  p('gas-100', 'Camping gas, 100 g', 'fuel', extra(65), extra(65)),
  p('gas-450', 'Camping gas, 450 g', 'fuel', extra(150), extra(150)),
  p('meths', 'Methylated spirit', 'fuel', extra(80), extra(80)),

  // ---- Camping supplies ----
  p('toilet-paper', 'Toilet paper', 'camping', std(15), std(15)),
  p('matches', 'Matches', 'camping', std(10), std(10)),
  p('stf-badge', 'STF fabric touring badge', 'camping', std(35), std(35)),
  p('kungsleden-badge', 'STF Kungsleden badge', 'camping', extra(50), extra(50)),
  p('stf-buff', 'STF Buff', 'camping', extra(100), extra(100)),
  p('batteries', 'Batteries AA/AAA, single', 'camping', extra(10), extra(10)),
  p('map', 'Map', 'camping', extra(190), extra(190)),
  p('compass', 'Compass', 'camping', extra(300), extra(300)),
  p('sheet-duvet', 'Single-use sheet — duvet/bottom (Hygilam)', 'camping', extra(35), extra(35)),
  p('sheet-pillow', 'Single-use pillowcase / towel (Hygilam)', 'camping', extra(10), extra(10)),
];

// --- Shop locations (route order the user specified) -------------------------

const shopSource = (title, url, publisher, kind = 'static') => ({
  title,
  url,
  publisher,
  sourceYear: 2025,
  lastVerified: SHOP_FACTS_VERIFIED_ON,
  kind,
  warning: 'Assortment and prices are planning references. Stock and prices may change.',
});

const CABIN_STOCK_WARNING =
  'Bold items are the season-standard range; the actual products in stock may still vary.';

export const SHOP_LOCATIONS = [
  {
    id: 'abisko',
    routeStopId: 'abisko',
    name: 'STF Abisko Turiststation',
    type: 'station',
    description:
      'Full mountain-station shop at the trailhead — much larger than the cabin shops. Its actual range is not the STF cabin assortment lists; use it for final resupply before the cabin section.',
    stockWarning: 'Station-shop range differs from the STF cabin assortment lists below.',
    source: shopSource(
      'STF — Abisko Turiststation',
      'https://www.swedishtouristassociation.com/facilities/stf-abisko-turiststation/',
      'Svenska Turistföreningen (STF)',
    ),
  },
  {
    id: 'abiskojaure',
    routeStopId: 'abiskojaure',
    name: 'STF Abiskojaure',
    type: 'large',
    description:
      'STF cabin shop with the Large assortment — a wider, broader range. A dependable early resupply.',
    stockWarning: CABIN_STOCK_WARNING,
    source: STF_SHOP_OVERVIEW_SOURCE,
  },
  {
    id: 'alesjaure',
    routeStopId: 'alesjaure',
    name: 'STF Alesjaure',
    type: 'large',
    description:
      'STF cabin shop with the Large assortment. An important resupply point — the last Large shop before the Tjäktja pass, which has no shop.',
    stockWarning: CABIN_STOCK_WARNING,
    source: STF_SHOP_OVERVIEW_SOURCE,
  },
  {
    id: 'tjaktja',
    routeStopId: 'tjaktja',
    name: 'STF Tjäktja',
    type: 'none',
    description:
      'No shop. Carry everything you need over the Tjäktja pass from Alesjaure.',
    stockWarning: 'No shop — plan food from Alesjaure.',
    source: STF_SHOP_OVERVIEW_SOURCE,
  },
  {
    id: 'salka',
    routeStopId: 'salka',
    name: 'STF Sälka',
    type: 'large',
    description:
      'STF cabin shop with the Large assortment — a useful resupply after the pass.',
    stockWarning: CABIN_STOCK_WARNING,
    source: STF_SHOP_OVERVIEW_SOURCE,
  },
  {
    id: 'singi',
    routeStopId: 'singi',
    name: 'STF Singi',
    type: 'none',
    description:
      'No shop. Carry food for the onward route where the trail turns toward Kebnekaise.',
    stockWarning: 'No shop — carry food onward.',
    source: STF_SHOP_OVERVIEW_SOURCE,
  },
  {
    id: 'kaitumjaure',
    routeStopId: null,
    name: 'STF Kaitumjaure',
    type: 'small',
    description:
      'STF cabin shop with the Small assortment — a limited range, but intended to hold enough to prepare a complete meal.',
    stockWarning: CABIN_STOCK_WARNING,
    source: STF_SHOP_OVERVIEW_SOURCE,
  },
  {
    id: 'teusajaure',
    routeStopId: null,
    name: 'STF Teusajaure',
    type: 'small',
    description:
      'STF cabin shop with the Small assortment — a limited range, but intended to hold enough to prepare a complete meal.',
    stockWarning: CABIN_STOCK_WARNING,
    source: STF_SHOP_OVERVIEW_SOURCE,
  },
  {
    id: 'kebnekaise',
    routeStopId: 'kebnekaise',
    name: 'STF Kebnekaise Mountain Station',
    type: 'station',
    description:
      'Mountain-station shop, larger and better stocked than the cabin shops. Its assortment is not the STF cabin lists — do not assume the cabin-shop products or prices apply here.',
    stockWarning: 'Station-shop range differs from the STF cabin assortment lists below.',
    source: shopSource(
      'STF — Kebnekaise Mountain Station',
      'https://www.swedishtouristassociation.com/facilities/stf-kebnekaise-mountain-station/',
      'Svenska Turistföreningen (STF)',
    ),
  },
  {
    id: 'nikkaluokta',
    routeStopId: 'nikkaluokta',
    name: 'Nikkaluokta',
    type: 'local',
    description:
      'A separate local facility and shop at the southern trailhead, outside the STF cabin classification. Its range differs from the STF cabin assortment lists.',
    stockWarning: 'Local shop — range differs from the STF cabin assortment lists.',
    source: shopSource(
      'Nikkaluokta Sarri',
      'https://nikkaluokta.com/en/',
      'Nikkaluokta Sarri AB',
    ),
  },
];

// --- Derived helpers (used by the UI and the tests) --------------------------

/** Products listed for a given shop size, in catalogue order. */
export function productsForSize(size) {
  return ASSORTMENT_PRODUCTS.filter((prod) => prod[size] != null);
}

/** Products in a size, grouped by category (only non-empty categories). */
export function assortmentByCategory(size) {
  return PRODUCT_CATEGORIES.map((cat) => ({
    category: cat,
    products: productsForSize(size).filter((prod) => prod.category === cat.id),
  })).filter((group) => group.products.length > 0);
}

/** Case-insensitive product search across both size lists. */
export function searchProducts(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ASSORTMENT_PRODUCTS.filter((prod) => prod.label.toLowerCase().includes(q));
}

/** Count of standard/extra products for one size (for the legend + tests). */
export function assortmentCounts(size) {
  let standard = 0;
  let extraCount = 0;
  for (const prod of productsForSize(size)) {
    if (prod[size].availability === 'standard') standard += 1;
    else extraCount += 1;
  }
  return { standard, extra: extraCount, total: standard + extraCount };
}

/** Shop locations of a given type, in route order. */
export function shopsByType(type) {
  return SHOP_LOCATIONS.filter((s) => s.type === type);
}

/**
 * The shop location a route stop maps to, for the Stops → Shops deep link —
 * or undefined when the stop has no shop (Tjäktja, Singi) or is not a mapped
 * stop. "No shop" stops deliberately return nothing so their chip stays
 * non-navigational.
 */
export function shopLocationForStop(stopId) {
  const loc = SHOP_LOCATIONS.find((s) => s.routeStopId === stopId);
  return loc && loc.type !== 'none' ? loc : undefined;
}
