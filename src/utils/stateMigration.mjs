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
 * v3 → v4:
 *   - `routeDirection` is added (the selected walking direction over the
 *     canonical route). Payloads without it — every existing user — normalise
 *     to the canonical 'abisko-to-nikkaluokta'; unknown/invalid values do the
 *     same (see src/route/direction.mjs). Only the direction is persisted; the
 *     derived directional itinerary is rebuilt at runtime. Everything else
 *     passes through unchanged.
 *
 * v4 → v5:
 *   - The packing list becomes a FULLY-OWNED personal copy. Before v5 the seed
 *     list was rebuilt on every load and persisted status/quantity/weight were
 *     merged onto it by id (so seed items could not be deleted and template
 *     wording always won). From v5 the stored array IS the list: it is not
 *     re-merged from the seed, every item is editable and deletable, and new
 *     `sortOrder` (deterministic display order) + optional `notes` fields are
 *     added. `packingTemplateVersion` records which template revision the copy
 *     was seeded from, and `packingSections` holds user-owned custom sections
 *     from spreadsheet import (default sections stay in the template; migrated
 *     v<5 data has none, since older data only used default sections).
 *   - Migration is loss-free: the one-time v<5 → v5 conversion runs the old
 *     seed-merge to reconstruct the user's exact current list (all statuses,
 *     quantities, weights and custom items preserved), then freezes it as the
 *     owned copy with a stable sortOrder. Trade-off (intended): after this,
 *     future template wording changes no longer reach an existing user's list
 *     automatically — only "Restore default" re-seeds from the template.
 *
 * Normalisation is idempotent and never throws: malformed fields fall back to
 * defaults instead of wiping the app.
 */
import {
  PACKING_CATEGORIES,
  SEED_PACKING_ITEMS,
  TEMPLATE_VERSION,
} from '../data/packingSeed.mjs';
import { DEFAULT_DIRECTION, normalizeDirection } from '../route/direction.mjs';

export const SCHEMA_VERSION = 5;
export { TEMPLATE_VERSION };

/** First schema version in which the packing list is a fully-owned copy. */
const OWNED_PACKING_SINCE = 5;

/** Free-text note ceiling — long enough for real reminders, bounded for safety. */
export const NOTES_MAX = 500;

const PACKING_STATUSES = new Set(['needed', 'ready', 'packed']);
const CATEGORY_IDS = new Set(PACKING_CATEGORIES.map((c) => c.id));

/** Fresh seed packing items (deep-ish copy so callers can't mutate the seed). */
export function seedPackingItems() {
  return SEED_PACKING_ITEMS.map((i) => ({ ...i }));
}

/**
 * A fresh, fully-owned personal list seeded from the template: every seed item
 * copied with a deterministic sortOrder. Used for a brand-new user and by
 * "Restore default packing list".
 */
export function seedPersonalList() {
  return seedPackingItems().map((it, i) => ({ ...it, sortOrder: i }));
}

/** Max length of a custom section display name (kept in sync with the importer). */
export const SECTION_TITLE_MAX = 60;

export function defaultState(defaultStageId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    currentStageId: defaultStageId ?? null,
    routeDirection: DEFAULT_DIRECTION,
    hutData: {},
    journal: [],
    packing: seedPersonalList(),
    packingSections: [],
    packingTemplateVersion: TEMPLATE_VERSION,
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

/** Trimmed, length-capped free text; empty → undefined (so the field is absent). */
function normalizeNotes(v) {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t.slice(0, NOTES_MAX);
}

/**
 * v<5 (one-time) — merge persisted packing over a fresh seed to reconstruct the
 * user's exact current list, then freeze it as an owned copy with a stable
 * sortOrder:
 *   - seed items always exist (label/category/essential from the seed);
 *     status/quantity/weight come from the persisted item when valid;
 *   - custom items are kept when well-formed; unknown categories fall back to
 *     'comfort' so a renamed category can never orphan an item.
 * Malformed entries are silently dropped — never a crash.
 */
function migratePackingToOwned(raw) {
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
      ...(normalizeNotes(p.notes) != null ? { notes: normalizeNotes(p.notes) } : {}),
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
    const notes = normalizeNotes(p.notes);
    out.push({
      id,
      label: p.label.trim(),
      categoryId: CATEGORY_IDS.has(p.categoryId) ? p.categoryId : 'comfort',
      quantity: normalizeQuantity(p.quantity, 1),
      status: PACKING_STATUSES.has(p.status) ? p.status : 'needed',
      ...(weight != null ? { weightGrams: weight } : {}),
      ...(notes != null ? { notes } : {}),
      essential: p.essential === true,
      custom: true,
    });
  }

  return out.map((it, i) => ({ ...it, sortOrder: i }));
}

/**
 * v5+ — the stored array IS the owned list; it is NOT re-merged from the seed.
 * Each well-formed entry is normalised in place (label required); malformed
 * entries are dropped. An intentionally empty list ([]) is honoured. Only a
 * corrupt (non-array) value falls back to a fresh template copy, so a storage
 * glitch never silently wipes the list into nothing.
 */
function normalizeOwnedPacking(raw, customIds) {
  if (!Array.isArray(raw)) return seedPersonalList();
  const out = [];
  for (const p of raw) {
    if (!isObject(p) || typeof p.id !== 'string') continue;
    if (typeof p.label !== 'string' || p.label.trim() === '') continue;
    const weight = normalizeWeight(p.weightGrams);
    const notes = normalizeNotes(p.notes);
    // A category id is valid if it names a default section OR a known custom
    // section. Only a genuinely dangling id (corrupt data) falls back.
    const knownCategory =
      CATEGORY_IDS.has(p.categoryId) || customIds.has(p.categoryId);
    out.push({
      id: p.id,
      label: p.label.trim(),
      categoryId: knownCategory ? p.categoryId : 'comfort',
      quantity: normalizeQuantity(p.quantity, 1),
      status: PACKING_STATUSES.has(p.status) ? p.status : 'needed',
      ...(weight != null ? { weightGrams: weight } : {}),
      ...(notes != null ? { notes } : {}),
      essential: p.essential === true,
      sortOrder:
        typeof p.sortOrder === 'number' && Number.isFinite(p.sortOrder)
          ? p.sortOrder
          : out.length,
      custom: p.custom === true,
    });
  }
  return out;
}

/**
 * Validate stored custom sections: each needs a string `id` (never a default
 * section id — those must not be shadowed) and a non-empty `title`. Duplicate
 * ids collapse to the first. Order is preserved.
 */
function normalizeSections(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const s of raw) {
    if (!isObject(s)) continue;
    if (typeof s.id !== 'string' || s.id === '' || CATEGORY_IDS.has(s.id)) continue;
    if (typeof s.title !== 'string' || s.title.trim() === '') continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, title: s.title.trim().slice(0, SECTION_TITLE_MAX) });
  }
  return out;
}

/**
 * Normalise the packing list + its custom sections together. Version-aware:
 * v5+ uses the owned list (never re-merged); v<5 does the one-time seed-merge
 * (legacy data only ever had default sections). Custom sections that no item
 * references are pruned, so a section disappears naturally when its last item
 * is removed and backups never accumulate orphans.
 */
function normalizePackingState(rawPacking, rawSections, schemaVersion) {
  const sections = normalizeSections(rawSections);
  const customIds = new Set(sections.map((s) => s.id));
  const packing =
    schemaVersion >= OWNED_PACKING_SINCE
      ? normalizeOwnedPacking(rawPacking, customIds)
      : migratePackingToOwned(rawPacking); // legacy: default sections only
  const used = new Set(packing.map((i) => i.categoryId));
  const packingSections = sections.filter((s) => used.has(s.id));
  return { packing, packingSections };
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

  // Missing/garbage schemaVersion counts as pre-v5 (legacy), so the one-time
  // seed-merge runs and preserves the user's progress rather than wiping it.
  const rawVersion =
    typeof raw.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion)
      ? raw.schemaVersion
      : 0;

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
    ...normalizePackingState(raw.packing, raw.packingSections, rawVersion),
    packingTemplateVersion:
      typeof raw.packingTemplateVersion === 'number' &&
      Number.isFinite(raw.packingTemplateVersion)
        ? raw.packingTemplateVersion
        : TEMPLATE_VERSION,
  };
}
