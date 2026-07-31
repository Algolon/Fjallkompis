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

/**
 * Categories whose items can be worn on the body instead of carried in the
 * backpack. Only these ever expose the Worn option; an item moved out of
 * them loses its worn mark (see applyPackingPatch).
 */
export const WORN_CATEGORY_IDS = ['clothing', 'rain-insulation', 'footwear'];
const WORN_CATEGORIES = new Set(WORN_CATEGORY_IDS);

/** True when v is one of the three supported packing statuses. */
export function isPackingStatus(v) {
  return STATUSES.has(v);
}

/** True when v is a known packing category id. */
export function isPackingCategoryId(v) {
  return CATEGORY_IDS.has(v);
}

/** True when items of this category may be marked as worn. */
export function isWornEligibleCategory(v) {
  return WORN_CATEGORIES.has(v);
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
 *   - worn: booleans only, and only while the item's (possibly just-changed)
 *     category is worn-eligible — any move to a non-eligible category clears
 *     the mark;
 *   - id and custom: immutable, silently ignored if patched.
 * Untouched fields (e.g. status when editing the title) always survive.
 *
 * Packed and worn are two different LOCATIONS (in the backpack / on the
 * body), so `status === 'packed' && worn === true` is an impossible state
 * and can never leave this function:
 *   - a patch that sets status 'packed' takes the item out of worn;
 *   - a patch that sets worn takes a packed item back to 'ready' (it is
 *     still prepared — it just is not in the backpack);
 *   - a self-contradicting patch asserting both resolves to packed, the
 *     explicit status verb.
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
    if (typeof patch.worn === 'boolean') next.worn = patch.worn;
    if (!isWornEligibleCategory(next.categoryId)) next.worn = false;
    // Location exclusivity — the explicitly patched side wins; packed wins
    // a patch that contradicts itself.
    if (next.status === 'packed' && next.worn) {
      if (patch.status === 'packed') next.worn = false;
      else next.status = 'ready';
    }
    return next;
  });
}

/**
 * The single user-visible state of an item: its status, or 'worn' when the
 * item is worn on the body. Worn is a location, not a step — a worn item is
 * handled, exactly like a packed one, so the display collapses the two
 * axes into one label the status button can show and cycle.
 */
export function packingDisplayState(item) {
  return item.worn ? 'worn' : item.status;
}

/**
 * "Reset progress": every item back to 'needed'. Worn is a location an item
 * currently occupies — progress, not identity — so worn marks are cleared
 * too: after a reset nothing is packed and nothing is worn. Items themselves
 * — custom additions, renames, category moves, quantities, weights,
 * essential flags and deletions — are untouched.
 */
export function resetPackingProgress(items) {
  return items.map((i) =>
    i.status === 'needed' && !i.worn ? i : { ...i, status: 'needed', worn: false },
  );
}

/**
 * Read-only aggregate over the personal packing list — the selector both the
 * Lists → Packing header and the Today "Prepare" summary card read, so the
 * two surfaces can never disagree (same pattern as tripPlanSummary).
 *
 * Counting semantics:
 *   - total/needed/ready/packed/worn count item ROWS, not quantities —
 *     matching the Lists progress header ("16 / 56 packed" means rows).
 *   - worn items form their own bucket: a worn item is on the body, outside
 *     the needed → ready → packed backpack flow, so it appears ONLY in
 *     `worn` (never double-counted in needed/ready/packed). The backpack
 *     flow's denominator is therefore `total - worn`.
 *   - essentialNotPacked counts essential rows that are neither packed nor
 *     worn (same definition as the Lists "essential not packed" pill) — an
 *     essential item on the body is accounted for.
 *   - weightedGrams multiplies weightGrams × quantity over BACKPACK rows
 *     (not worn) that HAVE a weight; weightMissing counts backpack rows
 *     without one. Worn rows sum into wornWeightedGrams / wornWeightMissing
 *     instead — worn weight never inflates the backpack weight. Weights are
 *     optional (the seed template ships none), so consumers must treat a
 *     non-zero *WeightMissing as "that total is a lower bound" — never show
 *     a partial sum as the exact weight.
 * Deleted items never appear here: deletion removes the row from state.
 */
export function packingSummary(items) {
  const summary = {
    total: 0,
    needed: 0,
    ready: 0,
    packed: 0,
    worn: 0,
    essentialNotPacked: 0,
    weightedGrams: 0,
    weightMissing: 0,
    wornWeightedGrams: 0,
    wornWeightMissing: 0,
  };
  for (const item of items) {
    summary.total += 1;
    if (item.worn) {
      summary.worn += 1;
      if (item.weightGrams != null) summary.wornWeightedGrams += item.weightGrams * item.quantity;
      else summary.wornWeightMissing += 1;
      continue;
    }
    if (item.status === 'packed') summary.packed += 1;
    else if (item.status === 'ready') summary.ready += 1;
    else summary.needed += 1;
    if (item.essential && item.status !== 'packed') summary.essentialNotPacked += 1;
    if (item.weightGrams != null) summary.weightedGrams += item.weightGrams * item.quantity;
    else summary.weightMissing += 1;
  }
  return summary;
}
