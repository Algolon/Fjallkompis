/**
 * Seed packing list for a summer hut-to-hut Kungsleden trip.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so the Node test runner can
 * import it directly alongside the state migration logic — the app imports it
 * through Vite exactly the same way.
 *
 * IDs are stable slugs: persisted status/quantity/weight is keyed by id and
 * must survive label tweaks. If an item's *meaning* changes, give it a new id
 * and record the old→new mapping in SEED_ID_REPLACEMENTS so an existing
 * user's progress carries over exactly once during migration.
 *
 * PACKING_TEMPLATE_VERSION marks the generation of this template. Since v2
 * the persisted packing array is a fully user-owned snapshot (renames,
 * category moves and deletions of seed items all stick); template changes
 * reach existing users only through an explicit migration step keyed on this
 * version — never by re-merging the seed on load.
 */

/**
 * Template generation.
 *
 * MAINTENANCE CONTRACT — read before touching the seed:
 *  - Bumping PACKING_TEMPLATE_VERSION alone does NOT update existing users:
 *    their snapshot is user-owned and is never re-merged with this seed.
 *    Every template change that should reach existing users needs an
 *    explicit, idempotent migration step in src/utils/stateMigration.mjs,
 *    keyed on this version (add new ids once, map replacements once).
 *  - Purely editorial wording tweaks to seed labels should normally NOT be
 *    pushed to existing users at all — their (possibly renamed) labels are
 *    personal data. Wording tweaks reach fresh installs and "Restore default
 *    list" only.
 *
 *  v1 — the original seed-merge era (packing rebuilt from the seed on load).
 *  v2 — user-owned packing snapshot + cooking/emergency/repair expansion.
 */
export const PACKING_TEMPLATE_VERSION = 2;

/**
 * Seed ids that briefly existed in UNPUBLISHED revisions of a template and
 * were withdrawn before release (e.g. the separate first-aid refill kit that
 * was folded into the main first aid kit during review). Owned snapshots
 * created from those revisions drop these on load; released-template
 * retirements with user progress use SEED_ID_REPLACEMENTS instead.
 */
export const RETIRED_SEED_IDS = ['pack.hygiene-first-aid.first-aid-refill'];

/**
 * Retired seed id → replacement seed id. A replacement means the *meaning*
 * changed (per the id contract above); migration carries the user's
 * status/quantity/weight from the old item onto the new one exactly once and
 * never leaves both behind.
 */
export const SEED_ID_REPLACEMENTS = {
  // v2: the emergency blanket became a proper emergency bivvy / survival bag.
  'pack.navigation-safety.emergency-blanket': 'pack.navigation-safety.emergency-bivvy',
};

export const PACKING_CATEGORIES = [
  { id: 'backpack', title: 'Backpack & carrying' },
  { id: 'sleep', title: 'Sleep & hut' },
  { id: 'clothing', title: 'Clothing' },
  { id: 'rain-insulation', title: 'Rain & insulation' },
  { id: 'footwear', title: 'Footwear' },
  { id: 'navigation-safety', title: 'Navigation & safety' },
  { id: 'food-water', title: 'Food & water' },
  { id: 'hygiene-first-aid', title: 'Hygiene & first aid' },
  { id: 'electronics', title: 'Electronics' },
  { id: 'documents-travel', title: 'Documents & travel' },
  { id: 'comfort', title: 'Optional comfort' },
];

/** @type {(categoryId: string, slug: string, label: string, opts?: {quantity?: number, essential?: boolean, weightGrams?: number}) => any} */
const item = (categoryId, slug, label, opts = {}) => ({
  id: `pack.${categoryId}.${slug}`,
  label,
  categoryId,
  quantity: opts.quantity ?? 1,
  status: 'needed',
  ...(opts.weightGrams != null ? { weightGrams: opts.weightGrams } : {}),
  essential: opts.essential ?? false,
  custom: false,
});

export const SEED_PACKING_ITEMS = [
  // Backpack & carrying
  item('backpack', 'backpack', 'Backpack (37–42 L)', { essential: true }),
  item('backpack', 'rain-cover', 'Backpack rain cover', { essential: true }),
  item('backpack', 'dry-bags', 'Dry bags / pack liners', { quantity: 3 }),
  item('backpack', 'daypack', 'Packable daypack (Kebnekaise day)'),

  // Sleep & hut
  item('sleep', 'liner', 'Sleeping bag liner (hut sheets)', { essential: true }),
  item('sleep', 'earplugs', 'Earplugs'),
  item('sleep', 'sleep-mask', 'Sleep mask (midnight sun)'),
  item('sleep', 'hut-slippers', 'Hut slippers / camp shoes'),

  // Clothing
  item('clothing', 'base-layers', 'Base layers (top + bottom)', { quantity: 2, essential: true }),
  item('clothing', 'hiking-trousers', 'Hiking trousers', { essential: true }),
  item('clothing', 'hiking-shirts', 'Hiking shirts', { quantity: 3 }),
  item('clothing', 'fleece', 'Fleece / midlayer', { essential: true }),
  item('clothing', 'underwear', 'Underwear', { quantity: 7 }),
  item('clothing', 'hiking-socks', 'Hiking socks', { quantity: 5, essential: true }),
  item('clothing', 'warm-hat', 'Warm hat', { essential: true }),
  // quantity 2 = one active pair + one dry spare pair; an entered weight is
  // per pair, so the weight total (weight × quantity) stays honest.
  item('clothing', 'gloves', 'Gloves + dry spare pair', { quantity: 2, essential: true }),
  item('clothing', 'buff', 'Buff / neck gaiter'),

  // Rain & insulation
  item('rain-insulation', 'rain-jacket', 'Rain jacket (shell)', { essential: true }),
  item('rain-insulation', 'rain-trousers', 'Rain trousers', { essential: true }),
  item('rain-insulation', 'insulated-jacket', 'Insulated jacket (down/synthetic)', { essential: true }),

  // Footwear
  item('footwear', 'boots', 'Hiking boots (broken in)', { essential: true }),
  item('footwear', 'blister-tape', 'Blister tape / plasters', { essential: true }),

  // Navigation & safety
  item('navigation-safety', 'paper-map', 'Paper map (Abisko–Kebnekaise)', { essential: true }),
  item('navigation-safety', 'compass', 'Compass', { essential: true }),
  item('navigation-safety', 'first-aid', 'Walking first aid kit (complete and replenished)', { essential: true }),
  item('navigation-safety', 'whistle', 'Emergency whistle', { essential: true }),
  item('navigation-safety', 'headlamp', 'Headlamp'),
  // Replaces the v1 emergency blanket (see SEED_ID_REPLACEMENTS).
  item('navigation-safety', 'emergency-bivvy', 'Emergency bivvy / survival bag', { essential: true }),
  item('navigation-safety', 'map-case', 'Waterproof map case', { essential: true }),
  item('navigation-safety', 'backup-flashlight', 'Backup flashlight (100–200 lm)'),
  item('navigation-safety', 'knife', 'Knife / multitool'),
  // Repair kit — deliberately small: tape, patches, plain plastic zip ties,
  // needle/thread and the two failure-prone spares (lace, buckle).
  item('navigation-safety', 'repair-tape', 'Repair tape', { essential: true }),
  item('navigation-safety', 'gear-patches', 'Self-adhesive gear patches'),
  item('navigation-safety', 'zip-ties', 'Tiewraps / zip ties', { quantity: 4 }),
  item('navigation-safety', 'utility-cord', 'Utility cord (4–6 m, 2–3 mm)'),
  item('navigation-safety', 'needle-thread', 'Needle + strong thread'),
  item('navigation-safety', 'spare-shoelace', 'Spare shoelace'),
  item('navigation-safety', 'spare-buckle', 'Compatible spare backpack buckle'),

  // Food & water
  item('food-water', 'water-bottles', 'Water bottle (1 L)', { essential: true }),
  item('food-water', 'freeze-dried-meals', 'Freeze-dried meals', { quantity: 6 }),
  item('food-water', 'trail-snacks', 'Trail snacks (per day)', { quantity: 7, essential: true }),
  item('food-water', 'emergency-food', 'Emergency food (1 day)', { essential: true }),
  item('food-water', 'lunch-food', 'Lunch food between shops', { quantity: 3 }),
  item('food-water', 'thermos', 'Thermos'),
  // Cooking set — EN417 screw-on stove; the canister is bought in Sweden
  // (canisters cannot fly). No windscreen: one could dangerously enclose a
  // top-mounted canister. The adapter only matters when the chosen stove
  // needs one — test the combination before the trip.
  item('food-water', 'gas-stove', 'Compact screw-on gas stove'),
  item('food-water', 'stove-adapter', 'Stove adapter / connector (only if required)'),
  item('food-water', 'gas-canister', 'EN417 gas canister (100–110 g)'),
  item('food-water', 'cook-pot', 'Cook pot with lid (750–900 ml)'),
  item('food-water', 'long-spoon', 'Long-handled spoon / spork'),
  item('food-water', 'lighter', 'Small lighter'),
  item('food-water', 'cleaning-cloth', 'Small cleaning cloth'),
  item('food-water', 'waste-bags', 'Waste bags', { quantity: 3, essential: true }),

  // Hygiene & first aid
  item('hygiene-first-aid', 'toothbrush', 'Toothbrush + paste', { essential: true }),
  item('hygiene-first-aid', 'sunscreen', 'Sunscreen', { essential: true }),
  item('hygiene-first-aid', 'insect-repellent', 'Insect repellent', { essential: true }),
  item('hygiene-first-aid', 'quick-towel', 'Quick-dry towel'),
  item('hygiene-first-aid', 'soap', 'Biodegradable soap'),
  item('hygiene-first-aid', 'toilet-paper', 'Toilet paper + trowel'),
  item('hygiene-first-aid', 'painkillers', 'Painkillers'),
  // Conditional default: essential is a personal medical fact, so the generic
  // template must not start every user with an impossible essential warning.
  item('hygiene-first-aid', 'personal-medication', 'Personal medication + reserve (if applicable)'),
  item('hygiene-first-aid', 'tweezers-tick-remover', 'Tweezers + tick remover'),

  // Electronics
  item('electronics', 'phone', 'Phone (offline maps installed)', { essential: true }),
  item('electronics', 'power-bank', 'Power bank (≥10 000 mAh)', { essential: true }),
  item('electronics', 'charging-cables', 'Charging cables'),
  item('electronics', 'camera', 'Camera'),

  // Documents & travel
  item('documents-travel', 'id-card', 'ID / passport', { essential: true }),
  item('documents-travel', 'bank-card', 'Bank card', { essential: true }),
  item('documents-travel', 'stf-membership', 'STF membership card'),
  item('documents-travel', 'train-tickets', 'Train / bus tickets'),
  item('documents-travel', 'insurance-info', 'Travel insurance details'),

  // Optional comfort
  item('comfort', 'trekking-poles', 'Trekking poles'),
  item('comfort', 'compact-chair', 'Compact chair'),
  item('comfort', 'book-cards', 'Book / cards for hut evenings'),
  item('comfort', 'sauna-swimwear', 'Swimwear (saunas & lakes)'),
];
