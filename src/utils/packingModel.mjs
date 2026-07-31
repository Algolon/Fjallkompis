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
 * Clamp a worn-unit count to the 0..quantity integer range; non-numbers get
 * the fallback (then the same clamp), so a malformed value can never leave
 * more units worn than the row has.
 */
export function clampWornQuantity(v, quantity, fallback = 0) {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(Math.max(0, n), quantity);
}

/** Units of the row that are carried (in the backpack flow), never negative. */
export function carriedQuantity(item) {
  return Math.max(0, item.quantity - item.wornQuantity);
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
 *   - wornQuantity: clamped to 0..quantity (after any quantity change in the
 *     same patch), and only while the item's (possibly just-changed)
 *     category is worn-eligible — any move to a non-eligible category clears
 *     the worn units;
 *   - id and custom: immutable, silently ignored if patched.
 * Untouched fields (e.g. status when editing the title) always survive.
 *
 * Location semantics — every individual UNIT has exactly one location:
 * `wornQuantity` units are on the body, the remaining carried units are in
 * the backpack flow and `status` describes THEM. "3 shirts, 1 worn,
 * 2 packed" is therefore a perfectly valid row. The only impossible state
 * is `status === 'packed'` with NO carried units (a pack cannot contain
 * zero-many of them):
 *   - a patch that sets status 'packed' on a fully worn row takes every
 *     unit back into the pack (wornQuantity → 0);
 *   - a patch that wears the full quantity of a packed row demotes the
 *     status to 'ready' (still prepared — just not in the backpack);
 *   - a self-contradicting patch asserting both resolves to packed, the
 *     explicit status verb.
 * For quantity 1 this reduces exactly to the original packed/worn
 * exclusivity.
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
    if (patch.wornQuantity !== undefined) {
      next.wornQuantity = clampWornQuantity(patch.wornQuantity, next.quantity, item.wornQuantity);
    }
    // A shrunken quantity can never leave more units worn than the row has.
    next.wornQuantity = clampWornQuantity(next.wornQuantity, next.quantity);
    if (!isWornEligibleCategory(next.categoryId)) next.wornQuantity = 0;
    // Unit-location exclusivity — the explicitly patched side wins; packed
    // wins a patch that contradicts itself.
    if (next.status === 'packed' && next.wornQuantity >= next.quantity) {
      if (patch.status === 'packed') next.wornQuantity = 0;
      else next.status = 'ready';
    }
    return next;
  });
}

/**
 * The single user-visible state of a row: its carried units' status, or
 * 'worn' when every unit is on the body. A PARTIALLY worn row displays its
 * carried status — the worn units surface as the row's "1 worn" annotation,
 * never as a second state, so the status button always shows one label.
 */
export function packingDisplayState(item) {
  return item.wornQuantity >= item.quantity ? 'worn' : item.status;
}

/**
 * "Reset progress": every item back to 'needed'. Worn units are a location
 * the row's units currently occupy — progress, not identity — so worn marks
 * are cleared too: after a reset nothing is packed and nothing is worn.
 * Items themselves — custom additions, renames, category moves, quantities,
 * weights, essential flags and deletions — are untouched.
 */
export function resetPackingProgress(items) {
  return items.map((i) =>
    i.status === 'needed' && i.wornQuantity === 0
      ? i
      : { ...i, status: 'needed', wornQuantity: 0 },
  );
}

/**
 * Read-only aggregate over the personal packing list — the selector both the
 * Lists → Packing header and the Today "Prepare" summary card read, so the
 * two surfaces can never disagree (same pattern as tripPlanSummary).
 *
 * Counting semantics:
 *   - total/needed/ready/packed/worn/fullyWorn count item ROWS, not
 *     quantities — matching the Lists progress header ("16 / 56 packed"
 *     means rows).
 *   - needed/ready/packed bucket the rows that still have CARRIED units by
 *     their status (a partially worn row is a backpack row — its spares
 *     still travel in the pack); a FULLY worn row is on the body, outside
 *     the backpack flow, and appears in none of them. The backpack flow's
 *     denominator is therefore `total - fullyWorn`.
 *   - worn counts rows with ANY worn unit ("what am I wearing?" includes
 *     the one shirt of three on your back), so a partially worn row counts
 *     in BOTH its status bucket and `worn` — the buckets deliberately stop
 *     being a partition the moment partial wearing exists.
 *   - essentialNotPacked counts essential rows whose carried units are not
 *     packed (same definition as the Lists "essential not packed" pill) —
 *     an essential row fully on the body is accounted for, but essential
 *     spares still to pack keep warning.
 *   - weightedGrams multiplies weightGrams × CARRIED units over rows that
 *     HAVE a weight; weightMissing counts rows with carried units and no
 *     weight. Worn units sum into wornWeightedGrams (weight ×
 *     wornQuantity) / wornWeightMissing instead — worn units never inflate
 *     the backpack weight. Weights are optional (the seed template ships
 *     none), so consumers must treat a non-zero *WeightMissing as "that
 *     total is a lower bound" — never show a partial sum as the exact
 *     weight.
 * Deleted items never appear here: deletion removes the row from state.
 */
export function packingSummary(items) {
  const summary = {
    total: 0,
    needed: 0,
    ready: 0,
    packed: 0,
    worn: 0,
    fullyWorn: 0,
    essentialNotPacked: 0,
    weightedGrams: 0,
    weightMissing: 0,
    wornWeightedGrams: 0,
    wornWeightMissing: 0,
  };
  for (const item of items) {
    summary.total += 1;
    const carried = carriedQuantity(item);
    if (item.wornQuantity > 0) {
      summary.worn += 1;
      if (item.weightGrams != null) {
        summary.wornWeightedGrams += item.weightGrams * item.wornQuantity;
      } else {
        summary.wornWeightMissing += 1;
      }
    }
    if (carried === 0) {
      summary.fullyWorn += 1;
      continue;
    }
    if (item.status === 'packed') summary.packed += 1;
    else if (item.status === 'ready') summary.ready += 1;
    else summary.needed += 1;
    if (item.essential && item.status !== 'packed') summary.essentialNotPacked += 1;
    if (item.weightGrams != null) summary.weightedGrams += item.weightGrams * carried;
    else summary.weightMissing += 1;
  }
  return summary;
}
