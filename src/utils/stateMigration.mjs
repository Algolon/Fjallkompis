/**
 * Schema versioning + defensive normalisation for the single persisted blob.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` can run the
 * v1 → v2 migration deterministically without a TypeScript toolchain; the app
 * imports it through Vite exactly the same way.
 *
 * v1 → v2:
 *   - hutData[*].shopOverride is dropped (official facility data is curated
 *     and no longer user-editable); hutData[*].notes is preserved verbatim.
 *   - `packing` is added: seed items with per-item status/quantity/weight
 *     merged from any persisted data, plus the user's custom items.
 *   - Everything else (currentStageId, checklist, journal) passes through.
 *
 * v2 → v3:
 *   - `checklist` (the archived Daily checklist feature's itemId → checked
 *     map) is dropped during normalisation. Old payloads that still carry it
 *     load fine — the key is simply not copied into the new state. See
 *     docs/archived-features/daily-checklist.md.
 *
 * v3 → v4:
 *   - `routeDirection` is added (the selected walking direction over the
 *     canonical route). Payloads without it — every existing user — normalise
 *     to the canonical 'abisko-to-nikkaluokta'; unknown/invalid values do the
 *     same (see src/route/direction.mjs). Only the direction is persisted;
 *     the derived directional itinerary is rebuilt at runtime.
 *
 * v4 → v5 (packing template v2):
 *   - `packing` becomes a fully user-owned snapshot. Before v5 the seed was
 *     rebuilt on every load and only status/quantity/weight were merged on
 *     top — seed items could never be renamed, moved or deleted. From v5 the
 *     persisted array IS the packing data: label, category, quantity, weight,
 *     essential, status and deletions all belong to the user.
 *   - `packingTemplateVersion` records which template generation the snapshot
 *     was last reconciled with. Payloads WITHOUT it (every pre-v5 user) run
 *     the legacy seed-merge exactly once against the current template — that
 *     is how existing users receive the template-v2 additions — and retired
 *     ids listed in SEED_ID_REPLACEMENTS carry their user progress (status,
 *     quantity — never the entered weight, the physical product changed)
 *     onto their replacement (emergency blanket → emergency bivvy), never
 *     leaving both behind. Payloads WITH it are user-owned and are never
 *     re-merged, so a deleted seed item stays deleted.
 *
 * v5 → v6 (Trip plan):
 *   - `trip` is added: the personal Trip plan's structured Travel and Stay
 *     items (src/trip/tripModel.mjs). Payloads without it — every existing
 *     user, whichever schema they come from — normalise to an empty trip
 *     plan; nothing is fabricated from existing documents. Document metadata
 *     and file blobs stay in the dedicated IndexedDB database and are NOT
 *     part of this blob; trip items only reference document ids. The packing
 *     fields and their v5 semantics pass through unchanged — the packing
 *     path keys off `packingTemplateVersion` presence and the trip path off
 *     the `trip` field, so the two migrations compose independently.
 *
 * Normalisation is idempotent and never throws: malformed fields fall back to
 * defaults instead of wiping the app.
 */
import {
  PACKING_TEMPLATE_VERSION,
  RETIRED_SEED_IDS,
  SEED_ID_REPLACEMENTS,
  SEED_PACKING_ITEMS,
} from '../data/packingSeed.mjs';
import {
  clampQuantity,
  isPackingCategoryId,
  isPackingStatus,
  normalizeWeightGrams,
} from './packingModel.mjs';
import { DEFAULT_DIRECTION, normalizeDirection } from '../route/direction.mjs';
import { normalizeTripItems } from '../trip/tripModel.mjs';

export const SCHEMA_VERSION = 6;

/** Fresh seed packing items (deep-ish copy so callers can't mutate the seed). */
export function seedPackingItems() {
  return SEED_PACKING_ITEMS.map((i) => ({ ...i }));
}

export function defaultState(defaultStageId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    currentStageId: defaultStageId ?? null,
    routeDirection: DEFAULT_DIRECTION,
    hutData: {},
    journal: [],
    packing: seedPackingItems(),
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    trip: [],
  };
}

function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isJournalish(v) {
  return isObject(v) && typeof v.id === 'string';
}

/** hutData: keep notes only — v1 shopOverride is intentionally discarded. */
function normalizeHutData(raw) {
  if (!isObject(raw)) return {};
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isObject(value)) continue;
    out[id] = { notes: typeof value.notes === 'string' ? value.notes : '' };
  }
  return out;
}

/**
 * The template version a payload's packing data was written against, or null
 * for pre-v5 payloads (which then take the one-time legacy merge). Only a
 * finite integer ≥ 2 counts — the owned model starts at template v2. A value
 * from the future (an export made by a newer app) clamps to the current
 * version: items are kept as-is, never guessed at.
 */
function ownedTemplateVersion(raw) {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 2) return null;
  return Math.min(raw, PACKING_TEMPLATE_VERSION);
}

/**
 * Owned-model path: the persisted array is the user's data. Validate each
 * entry defensively (malformed entries drop, invalid fields heal) and dedupe
 * by id, but never re-inject seed items — absence means the user deleted it.
 */
function normalizeOwnedPacking(raw) {
  if (!Array.isArray(raw)) return seedPackingItems();
  const retired = new Set(RETIRED_SEED_IDS);
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!isObject(entry) || typeof entry.id !== 'string' || entry.id === '') continue;
    if (seen.has(entry.id)) continue;
    // Ids withdrawn before their template ever shipped (development-only
    // snapshots) are cleaned up here; user-created items are never touched.
    if (retired.has(entry.id) && entry.custom !== true) continue;
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (label === '') continue;
    seen.add(entry.id);
    const weight = normalizeWeightGrams(entry.weightGrams);
    out.push({
      id: entry.id,
      label,
      categoryId: isPackingCategoryId(entry.categoryId) ? entry.categoryId : 'comfort',
      quantity: clampQuantity(entry.quantity, 1),
      status: isPackingStatus(entry.status) ? entry.status : 'needed',
      ...(weight != null ? { weightGrams: weight } : {}),
      essential: entry.essential === true,
      custom: entry.custom === true,
    });
  }
  return out;
}

/*
 * Owned-payload template upgrades land here once PACKING_TEMPLATE_VERSION
 * grows past 2: for each version step above the payload's recorded version,
 * append that step's new seed items (only ids not already present — added
 * exactly once, deletions respected) and apply its SEED_ID_REPLACEMENTS.
 * Today every owned payload is already at v2, so there is nothing to do and
 * no speculative machinery is built.
 */

/**
 * Legacy path (pre-v5 payloads, which carry no packingTemplateVersion): the
 * historical seed-merge, run one last time against the CURRENT template.
 *   - Every current seed item exists exactly once; label/category/essential
 *     come from the seed (final wording propagation), status/quantity/weight
 *     from the persisted item when valid. This is also how an existing user
 *     receives the template-v2 additions.
 *   - Retired ids in SEED_ID_REPLACEMENTS hand their status and quantity to
 *     their replacement item (never the entered weight — the replacement is
 *     a different physical product), so emergency-blanket progress survives
 *     on the emergency bivvy without a duplicate.
 *   - Custom items are kept when well-formed; unknown categories fall back to
 *     'comfort'. Other unknown non-custom ids are retired seed items → drop.
 * Malformed entries are silently dropped — never a crash.
 */
function migrateLegacyPacking(raw) {
  const persisted = new Map();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (isObject(entry) && typeof entry.id === 'string') persisted.set(entry.id, entry);
    }
  }

  // Replacement id → the retired item's USER PROGRESS only (status, and
  // quantity — which this merge treats as user data). weightGrams is
  // deliberately NOT carried: a replacement means a materially different
  // physical product (blanket → bivvy), so the old item's entered weight
  // would be wrong data, and an absent weight correctly keeps the "weight is
  // incomplete" accounting honest.
  const carryTo = new Map();
  for (const [oldId, newId] of Object.entries(SEED_ID_REPLACEMENTS)) {
    const old = persisted.get(oldId);
    if (old) carryTo.set(newId, { status: old.status, quantity: old.quantity });
  }

  const out = seedPackingItems().map((seed) => {
    const p = persisted.get(seed.id) ?? carryTo.get(seed.id);
    if (!p) return seed;
    const weight = normalizeWeightGrams(p.weightGrams);
    return {
      ...seed,
      status: isPackingStatus(p.status) ? p.status : seed.status,
      quantity: clampQuantity(p.quantity, seed.quantity),
      ...(weight != null
        ? { weightGrams: weight }
        : seed.weightGrams != null
          ? { weightGrams: seed.weightGrams }
          : {}),
    };
  });

  const seedIds = new Set(out.map((i) => i.id));
  for (const [id, p] of persisted) {
    if (seedIds.has(id)) continue;
    if (p.custom !== true) continue; // unknown non-custom ids: retired seed items
    if (typeof p.label !== 'string' || p.label.trim() === '') continue;
    const weight = normalizeWeightGrams(p.weightGrams);
    out.push({
      id,
      label: p.label,
      categoryId: isPackingCategoryId(p.categoryId) ? p.categoryId : 'comfort',
      quantity: clampQuantity(p.quantity, 1),
      status: isPackingStatus(p.status) ? p.status : 'needed',
      ...(weight != null ? { weightGrams: weight } : {}),
      essential: p.essential === true,
      custom: true,
    });
  }

  return out;
}

/**
 * Validate + normalise an unknown blob into the current schema. Accepts v1
 * through v5 payloads (and anything malformed in between). Unknown/missing
 * fields fall back to defaults rather than throwing, so a partially-corrupt
 * or older payload still loads instead of wiping the app. Retired fields
 * (v1 shopOverride, v2 checklist) are ignored, never a parse failure.
 */
export function normalizeState(raw, defaultStageId) {
  const base = defaultState(defaultStageId);
  if (!isObject(raw)) return base;

  const templateVersion = ownedTemplateVersion(raw.packingTemplateVersion);

  return {
    schemaVersion: SCHEMA_VERSION,
    currentStageId:
      typeof raw.currentStageId === 'string' || raw.currentStageId === null
        ? raw.currentStageId
        : base.currentStageId,
    // Missing (older payload) or invalid values normalise to the canonical
    // forward direction — an older export can never carry an invalid one.
    routeDirection: normalizeDirection(raw.routeDirection),
    hutData: normalizeHutData(raw.hutData),
    journal: Array.isArray(raw.journal) ? raw.journal.filter(isJournalish) : [],
    packing:
      templateVersion === null
        ? migrateLegacyPacking(raw.packing)
        : normalizeOwnedPacking(raw.packing),
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    trip: normalizeTripItems(raw.trip),
  };
}
