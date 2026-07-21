/**
 * Pure packing-item rules shared by the store (AppStore) and the persisted
 * state normaliser (stateMigration.mjs), so editing and loading enforce the
 * exact same invariants.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` can
 * exercise the editing rules directly; the app imports it through Vite the
 * same way.
 *
 * The packing list is fully user-owned: every item — seeded or custom — can
 * be renamed, moved to another category, re-weighted and deleted. Only two
 * fields are immutable through a patch:
 *   - `id` (persisted status/metadata is keyed by it), and
 *   - `custom` (provenance: "did the user add this item?" — deliberately NOT
 *     an authorization flag).
 */
import { PACKING_CATEGORIES } from '../data/packingSeed.mjs';

const CATEGORY_IDS = new Set(PACKING_CATEGORIES.map((c) => c.id));
const STATUSES = new Set(['needed', 'ready', 'packed']);

/** True when v is one of the three supported packing statuses. */
export function isPackingStatus(v) {
  return STATUSES.has(v);
}

/** True when v is a known packing category id. */
export function isPackingCategoryId(v) {
  return CATEGORY_IDS.has(v);
}

/** Clamp to the supported 1–99 integer range; non-numbers get the fallback. */
export function clampQuantity(v, fallback) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(99, Math.max(1, Math.round(v)));
}

/** Positive finite weights round to whole grams; anything else (including a
 *  sub-half-gram value that would round to 0) becomes absent. */
export function normalizeWeightGrams(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined;
  const grams = Math.round(v);
  return grams > 0 ? grams : undefined;
}

/**
 * Apply a partial edit to one item, field by field, rejecting invalid values
 * instead of ever producing a broken item:
 *   - label: trimmed; empty/non-string keeps the current title;
 *   - categoryId: must be a known category, else kept;
 *   - quantity: clamped to 1–99, invalid keeps the current value;
 *   - weightGrams: only applied when the key is present in the patch — a
 *     valid weight is rounded, anything else REMOVES the weight (never NaN);
 *   - essential: booleans only;
 *   - status: must be a known status, else kept;
 *   - id and custom: immutable, silently ignored if patched.
 * Untouched fields (e.g. status when editing the title) always survive.
 */
export function applyPackingPatch(items, itemId, patch) {
  if (patch === null || typeof patch !== 'object') return items;
  return items.map((item) => {
    if (item.id !== itemId) return item;
    const next = { ...item };
    if (typeof patch.label === 'string' && patch.label.trim() !== '') {
      next.label = patch.label.trim();
    }
    if (isPackingCategoryId(patch.categoryId)) next.categoryId = patch.categoryId;
    if (patch.quantity !== undefined) {
      next.quantity = clampQuantity(patch.quantity, item.quantity);
    }
    if ('weightGrams' in patch) {
      const w = normalizeWeightGrams(patch.weightGrams);
      if (w != null) next.weightGrams = w;
      else delete next.weightGrams;
    }
    if (typeof patch.essential === 'boolean') next.essential = patch.essential;
    if (isPackingStatus(patch.status)) next.status = patch.status;
    return next;
  });
}

/**
 * "Reset progress": every item back to 'needed'. Items themselves — custom
 * additions, renames, category moves, quantities, weights, essential flags
 * and deletions — are untouched.
 */
export function resetPackingProgress(items) {
  return items.map((i) => (i.status === 'needed' ? i : { ...i, status: 'needed' }));
}
