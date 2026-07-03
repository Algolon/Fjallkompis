/**
 * Seed packing list for a summer hut-to-hut Kungsleden trip.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so the Node test runner can
 * import it directly alongside the state migration logic — the app imports it
 * through Vite exactly the same way.
 *
 * IDs are stable slugs: persisted status/quantity/weight is keyed by id and
 * must survive label tweaks. If an item's *meaning* changes, give it a new id.
 */

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
  item('backpack', 'backpack', 'Backpack 50–65 l', { essential: true }),
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
  item('clothing', 'hiking-shirts', 'Hiking shirts', { quantity: 2 }),
  item('clothing', 'fleece', 'Fleece / midlayer', { essential: true }),
  item('clothing', 'underwear', 'Underwear', { quantity: 4 }),
  item('clothing', 'hiking-socks', 'Hiking socks', { quantity: 3, essential: true }),
  item('clothing', 'warm-hat', 'Warm hat', { essential: true }),
  item('clothing', 'gloves', 'Gloves', { essential: true }),
  item('clothing', 'buff', 'Buff / neck gaiter'),

  // Rain & insulation
  item('rain-insulation', 'rain-jacket', 'Rain jacket (shell)', { essential: true }),
  item('rain-insulation', 'rain-trousers', 'Rain trousers', { essential: true }),
  item('rain-insulation', 'insulated-jacket', 'Insulated jacket (down/synthetic)', { essential: true }),

  // Footwear
  item('footwear', 'boots', 'Hiking boots (broken in)', { essential: true }),
  item('footwear', 'gaiters', 'Gaiters'),
  item('footwear', 'blister-tape', 'Blister tape / plasters', { essential: true }),

  // Navigation & safety
  item('navigation-safety', 'paper-map', 'Paper map (Abisko–Kebnekaise)', { essential: true }),
  item('navigation-safety', 'compass', 'Compass', { essential: true }),
  item('navigation-safety', 'first-aid', 'First aid kit', { essential: true }),
  item('navigation-safety', 'whistle', 'Emergency whistle', { essential: true }),
  item('navigation-safety', 'headlamp', 'Headlamp'),
  item('navigation-safety', 'emergency-blanket', 'Emergency blanket'),
  item('navigation-safety', 'knife', 'Knife / multitool'),

  // Food & water
  item('food-water', 'water-bottles', 'Water bottles / bladder (≥1.5 l)', { essential: true }),
  item('food-water', 'trail-snacks', 'Trail snacks (per day)', { quantity: 7, essential: true }),
  item('food-water', 'emergency-food', 'Emergency food (1 day)', { essential: true }),
  item('food-water', 'lunch-food', 'Lunch food between shops', { quantity: 3 }),
  item('food-water', 'thermos', 'Thermos'),

  // Hygiene & first aid
  item('hygiene-first-aid', 'toothbrush', 'Toothbrush + paste', { essential: true }),
  item('hygiene-first-aid', 'sunscreen', 'Sunscreen', { essential: true }),
  item('hygiene-first-aid', 'insect-repellent', 'Insect repellent', { essential: true }),
  item('hygiene-first-aid', 'quick-towel', 'Quick-dry towel'),
  item('hygiene-first-aid', 'soap', 'Biodegradable soap'),
  item('hygiene-first-aid', 'toilet-paper', 'Toilet paper + trowel'),
  item('hygiene-first-aid', 'painkillers', 'Painkillers'),

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
  item('comfort', 'sit-pad', 'Sit pad'),
  item('comfort', 'book-cards', 'Book / cards for hut evenings'),
  item('comfort', 'sauna-swimwear', 'Swimwear (saunas & lakes)'),
];
