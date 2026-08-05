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
 * v6 → v7 (Day plan):
 *   - `dayPlan` is added: the personal journey plan — ordered calendar days,
 *     each holding hiking / travel / rest activities (src/plan/dayPlan.mjs).
 *     Payloads without it — every existing user, whichever schema they come
 *     from — normalise to `null`. Null is not a fallback: it is the canonical
 *     default state, in which the app shows no dates, no planned days and no
 *     activity indicators, exactly as before the feature existed. Nothing is
 *     ever inferred from trip items, documents, route direction or the system
 *     date; only an explicit action in Settings creates a plan.
 *     Like the packing and trip paths, this one keys off its own field, so all
 *     three compose independently.
 *
 * v7 → v8 (Worn clothing):
 *   - packing items gained `worn` (boolean): the item is worn on the body
 *     instead of carried in the backpack. Payloads without it — every
 *     existing user — normalise every item to un-worn, which is
 *     behaviourally identical to the app before the field existed. Only
 *     worn-eligible categories (clothing, rain & insulation, footwear) may
 *     carry the mark.
 *
 * v9 → v10 (explicit hiking legs):
 *   - `dayPlan` hiking activities become explicit ordered LEGS — each one a
 *     reference to a physical canonical stage plus an absolute orientation —
 *     replacing the v9 adjacent-stage COUNT and its full-route partition
 *     invariant (src/plan/hikingLegs.mjs). `dayPlan.currentLegId` is added:
 *     the active hiking occurrence, needed because a stage may now be walked
 *     more than once. v9 plans migrate deterministically by replaying the
 *     released cursor walk (src/plan/dayPlanMigration.mjs); a legacy plan
 *     the released model could not have persisted normalises to null — the
 *     feature's own default — with all unrelated state untouched. The
 *     normaliser now needs the canonical stage TOPOLOGY (ids + endpoints)
 *     instead of a bare stage count.
 *     When migration refuses the plan, the active `dayPlan` becomes null;
 *     the original is retained by the recovery field described next.
 *   - `dayPlanRecovery` is added: when a STORED plan cannot be loaded (a
 *     legacy plan the migration refused, or an unreadable payload), the
 *     original value is set aside here VERBATIM instead of being discarded
 *     — the active `dayPlan` becomes null, everything else keeps working,
 *     and Settings offers exporting or explicitly removing the copy. An
 *     existing recovery passes through every normalisation untouched (it is
 *     never re-validated, "repaired" or replaced by a later failure), so
 *     the first original survives until the user decides otherwise. Null in
 *     every ordinary state; a successful load never creates one.
 *
 * v8 → v9 (per-unit worn):
 *   - `worn: boolean` becomes `wornQuantity: number` (0 ≤ wornQuantity ≤
 *     quantity): each individual unit has one location, so "3 shirts,
 *     1 worn, 2 packed" is representable and `status` describes the carried
 *     units. "Worn at all?" is derived (`wornQuantity > 0`) — the boolean is
 *     never stored again.
 *   - v8 payloads migrate `worn: true` → `wornQuantity: 1` (never the whole
 *     quantity — a v8 "worn" shirts ×3 row almost certainly meant "I wear
 *     one", and one unit is the conservative, reversible reading) and
 *     `worn: false` → 0. Pre-v8 payloads normalise to 0 everywhere.
 *   - Healing: non-numeric worn quantities fall back to 0, values clamp
 *     into 0..quantity, non-eligible categories force 0, and a fully worn
 *     row claiming `status: 'packed'` (a pack cannot contain zero-many
 *     units) heals to packed with 0 worn — the user's packing progress is
 *     the more precious record. Partially worn packed rows are VALID and
 *     pass through untouched.
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
  clampWornQuantity,
  isPackingCategoryId,
  isPackingStatus,
  isWornEligibleCategory,
  normalizeWeightGrams,
} from './packingModel.mjs';
import { DEFAULT_DIRECTION, normalizeDirection } from '../route/direction.mjs';
import { ACTIVE_TRAIL_ID, readTrailId, trailIdentityOf } from '../data/trailIdentity.mjs';
import { normalizeTripItems } from '../trip/tripModel.mjs';
import { normalizeDayPlan } from '../plan/dayPlan.mjs';
import { planUsesLegacyHiking } from '../plan/dayPlanMigration.mjs';

export const SCHEMA_VERSION = 11;

/** Fresh seed packing items (deep-ish copy so callers can't mutate the seed). */
export function seedPackingItems() {
  return SEED_PACKING_ITEMS.map((i) => ({ ...i }));
}

export function defaultState(defaultStageId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    trailId: ACTIVE_TRAIL_ID,
    currentStageId: defaultStageId ?? null,
    routeDirection: DEFAULT_DIRECTION,
    hutData: {},
    journal: [],
    packing: seedPackingItems(),
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    trip: [],
    dayPlan: null,
    dayPlanRecovery: null,
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
    const categoryId = isPackingCategoryId(entry.categoryId) ? entry.categoryId : 'comfort';
    const status = isPackingStatus(entry.status) ? entry.status : 'needed';
    const quantity = clampQuantity(entry.quantity, 1);
    // v9 payloads carry wornQuantity; v8 payloads carried the boolean, which
    // migrates conservatively to ONE worn unit (never the whole quantity — a
    // v8 "worn" shirts ×3 row almost certainly meant "I wear one"). Pre-v8
    // payloads carry neither → 0. Malformed values fall back to 0 and clamp
    // into 0..quantity.
    let wornQuantity =
      typeof entry.wornQuantity === 'number'
        ? clampWornQuantity(entry.wornQuantity, quantity)
        : entry.worn === true
          ? 1
          : 0;
    if (!isWornEligibleCategory(categoryId)) wornQuantity = 0;
    // A packed row with no carried units is impossible (a pack cannot
    // contain zero-many of them) — heal to packed, packing progress is the
    // more precious record. Partially worn packed rows are valid.
    if (status === 'packed' && wornQuantity >= quantity) wornQuantity = 0;
    out.push({
      id: entry.id,
      label,
      categoryId,
      quantity,
      status,
      ...(weight != null ? { weightGrams: weight } : {}),
      essential: entry.essential === true,
      wornQuantity,
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
      // Legacy payloads predate worn tracking entirely — everything starts
      // in the backpack, exactly as before the feature existed.
      wornQuantity: 0,
      custom: true,
    });
  }

  return out;
}

/**
 * Validate + normalise an unknown blob into the current schema. Accepts v1
 * through v10 payloads (and anything malformed in between). Unknown/missing
 * fields fall back to defaults rather than throwing, so a partially-corrupt
 * or older payload still loads instead of wiping the app. Retired fields
 * (v1 shopOverride, v2 checklist) are ignored, never a parse failure.
 *
 * `topology` is the canonical stage topology (ids + endpoints, canonical
 * order) hiking legs are validated against. It is supplied by the caller
 * (src/utils/storage.ts passes STAGE_TOPOLOGY) because this module is
 * deliberately free of route-data imports. Omitting it means a day plan
 * cannot be validated at all, so it normalises to `null` — the feature's own
 * default, never a crash.
 *
 * TRAIL IDENTITY (schema v11). This is the KUNGSLEDEN normaliser: everything
 * it returns carries `trailId: ACTIVE_TRAIL_ID`. A payload claiming a
 * different trail is refused OUTRIGHT — it returns the default state without
 * reading a single personal field, so a foreign `d1` can never be interpreted
 * against the Kungsleden topology. That refusal is defence in depth: it is
 * indistinguishable from "unusable input" by design, so callers that must
 * TELL the two apart (and must not overwrite anything) use {@link readState}
 * instead. The app only ever goes through readState.
 */
export function normalizeState(raw, defaultStageId, topology) {
  const base = defaultState(defaultStageId);
  if (!isObject(raw)) return base;

  // Checked FIRST — before direction, pointers, legs or overnights are read,
  // because every one of those is interpreted against Kungsleden content.
  if (trailIdentityOf(raw) === 'mismatch') return base;

  const templateVersion = ownedTemplateVersion(raw.packingTemplateVersion);
  // The direction resolved just below is the ACTIVE one at load time, so a
  // plan whose stored direction disagrees (an import from a device walking
  // the other way) is repaired here rather than silently applied.
  const direction = normalizeDirection(raw.routeDirection);

  const dayPlan = normalizeDayPlan(
    raw.dayPlan,
    direction,
    topology,
    // Only consumed by the v9 → v10 migration, to derive the current-leg
    // pointer from the released current-stage / current-day pair.
    typeof raw.currentStageId === 'string' ? raw.currentStageId : null,
  );

  // An existing recovery copy survives every normalisation VERBATIM — it is
  // the user's original data, never re-validated or "repaired", and only
  // their explicit removal ends it. A malformed entry (no dayPlan value at
  // all) carries nothing recoverable and drops.
  const existingRecovery =
    isObject(raw.dayPlanRecovery) && raw.dayPlanRecovery.dayPlan !== undefined
      ? {
          reason:
            raw.dayPlanRecovery.reason === 'migration-failed' ? 'migration-failed' : 'unreadable',
          dayPlan: raw.dayPlanRecovery.dayPlan,
        }
      : null;
  // A STORED plan that failed to load is set aside verbatim rather than
  // discarded — the destructive alternative would overwrite the only copy
  // on the very first save after this normalisation. The first preserved
  // original wins over a later failure: it is the copy the user has not yet
  // decided about.
  const failedToLoad = raw.dayPlan != null && dayPlan === null;
  const dayPlanRecovery =
    existingRecovery ??
    (failedToLoad
      ? {
          reason: planUsesLegacyHiking(raw.dayPlan) ? 'migration-failed' : 'unreadable',
          dayPlan: raw.dayPlan,
        }
      : null);

  return {
    schemaVersion: SCHEMA_VERSION,
    // Legacy payloads (no claim) and matching payloads both land here, and
    // both belong to this trail — legacy data predates the field and was
    // Kungsleden data by definition. A foreign claim never reaches this line.
    trailId: ACTIVE_TRAIL_ID,
    currentStageId:
      typeof raw.currentStageId === 'string' || raw.currentStageId === null
        ? raw.currentStageId
        : base.currentStageId,
    // Missing (older payload) or invalid values normalise to the canonical
    // forward direction — an older export can never carry an invalid one.
    routeDirection: direction,
    hutData: normalizeHutData(raw.hutData),
    journal: Array.isArray(raw.journal) ? raw.journal.filter(isJournalish) : [],
    packing:
      templateVersion === null
        ? migrateLegacyPacking(raw.packing)
        : normalizeOwnedPacking(raw.packing),
    packingTemplateVersion: PACKING_TEMPLATE_VERSION,
    trip: normalizeTripItems(raw.trip),
    dayPlan,
    dayPlanRecovery,
  };
}

/**
 * The trail-aware entry point: read an unknown blob (from local storage or an
 * imported file) and say UNAMBIGUOUSLY whether it belongs to this trail.
 *
 * This exists because {@link normalizeState} is total — it must return a state
 * for any input, so "refused" and "empty" look identical there. Callers that
 * decide whether to ADOPT data need to tell those apart, and must not write
 * anything when they cannot.
 *
 *   { ok: true,  state, identity: 'match' | 'legacy' }
 *   { ok: false, reason: 'trail-mismatch', trailId, expectedTrailId }
 *
 * On a mismatch NO state is returned at all — there is deliberately nothing a
 * caller could half-apply. The decision is made before any personal field is
 * read, so no foreign stage id, overnight or pointer is ever interpreted
 * against Kungsleden content.
 *
 * Pure: it reads, classifies and normalises, and never touches storage. The
 * atomicity guarantee at the import boundary follows from that — a refused
 * import has nothing to apply and no side effect to undo.
 */
export function readState(raw, defaultStageId, topology) {
  const identity = trailIdentityOf(raw);
  if (identity === 'mismatch') {
    return {
      ok: false,
      reason: 'trail-mismatch',
      trailId: readTrailId(raw),
      expectedTrailId: ACTIVE_TRAIL_ID,
    };
  }
  return {
    ok: true,
    identity,
    state: normalizeState(raw, defaultStageId, topology),
  };
}
