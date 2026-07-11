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
 *   - Everything else (currentStageId, hutData, journal, packing) passes
 *     through unchanged.
 *
 * Normalisation is idempotent and never throws: malformed fields fall back to
 * defaults instead of wiping the app.
 */
import { PACKING_CATEGORIES, SEED_PACKING_ITEMS } from '../data/packingSeed.mjs';

export const SCHEMA_VERSION = 3;

const PACKING_STATUSES = new Set(['needed', 'ready', 'packed']);
const CATEGORY_IDS = new Set(PACKING_CATEGORIES.map((c) => c.id));

/** Fresh seed packing items (deep-ish copy so callers can't mutate the seed). */
export function seedPackingItems() {
  return SEED_PACKING_ITEMS.map((i) => ({ ...i }));
}

export function defaultState(defaultStageId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    currentStageId: defaultStageId ?? null,
    hutData: {},
    journal: [],
    packing: seedPackingItems(),
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

function normalizeQuantity(v, fallback) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(99, Math.max(1, Math.round(v)));
}

function normalizeWeight(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined;
  return Math.round(v);
}

/**
 * Merge persisted packing data over the seed list:
 *   - seed items always exist (label/category/essential come from the seed,
 *     so wording fixes propagate); status/quantity/weight come from the
 *     persisted item when valid;
 *   - custom items are kept when well-formed; unknown categories fall back
 *     to 'comfort' so a renamed category can never orphan an item.
 * Malformed entries are silently dropped — never a crash.
 */
function normalizePacking(raw) {
  const persisted = new Map();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (isObject(entry) && typeof entry.id === 'string') persisted.set(entry.id, entry);
    }
  }

  const out = seedPackingItems().map((seed) => {
    const p = persisted.get(seed.id);
    if (!p) return seed;
    return {
      ...seed,
      status: PACKING_STATUSES.has(p.status) ? p.status : seed.status,
      quantity: normalizeQuantity(p.quantity, seed.quantity),
      ...(normalizeWeight(p.weightGrams) != null
        ? { weightGrams: normalizeWeight(p.weightGrams) }
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
    const weight = normalizeWeight(p.weightGrams);
    out.push({
      id,
      label: p.label,
      categoryId: CATEGORY_IDS.has(p.categoryId) ? p.categoryId : 'comfort',
      quantity: normalizeQuantity(p.quantity, 1),
      status: PACKING_STATUSES.has(p.status) ? p.status : 'needed',
      ...(weight != null ? { weightGrams: weight } : {}),
      essential: p.essential === true,
      custom: true,
    });
  }

  return out;
}

/**
 * Validate + normalise an unknown blob into the current schema. Accepts v1,
 * v2 and v3 payloads (and anything malformed in between). Unknown/missing
 * fields fall back to defaults rather than throwing, so a partially-corrupt
 * or older payload still loads instead of wiping the app. Retired fields
 * (v1 shopOverride, v2 checklist) are ignored, never a parse failure.
 */
export function normalizeState(raw, defaultStageId) {
  const base = defaultState(defaultStageId);
  if (!isObject(raw)) return base;

  return {
    schemaVersion: SCHEMA_VERSION,
    currentStageId:
      typeof raw.currentStageId === 'string' || raw.currentStageId === null
        ? raw.currentStageId
        : base.currentStageId,
    hutData: normalizeHutData(raw.hutData),
    journal: Array.isArray(raw.journal) ? raw.journal.filter(isJournalish) : [],
    packing: normalizePacking(raw.packing),
  };
}
