/**
 * Trip plan — pure domain logic (no storage, no DOM, no React).
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` can drive
 * validation, sorting, summaries and normalisation deterministically without
 * a TypeScript toolchain — the same pattern as src/utils/stateMigration.mjs
 * and src/wallet/walletModel.mjs. The app imports it through Vite unchanged.
 *
 * Design notes:
 *  - Trip items are TRIP-ITEM-FIRST: a personal transport movement or stay is
 *    the primary object; a ticket or booking confirmation is supporting
 *    material referenced by id (`attachmentIds`), never embedded. An item is
 *    fully valid without any document.
 *  - Items live in PersistentState (the localStorage blob) so they ride the
 *    existing JSON backup and device transfer; document files stay in the
 *    dedicated IndexedDB database and deliberately do NOT.
 *  - Status is a deliberate three-value model (needed / planned / confirmed).
 *    It is never inferred from attachment presence in either direction.
 *  - Sorting takes `todayIso` as an argument (the timetableStatus pattern)
 *    so ordering around the date boundary is unit-testable.
 *  - Normalisation is read-time, idempotent and never throws: malformed
 *    fields are repaired where safe and the item is dropped only when it
 *    cannot be represented honestly (no usable id, unknown kind).
 */

// ---- Statuses ---------------------------------------------------------------

/** The three personal arrangement statuses, in progression order. */
export const TRIP_STATUSES = [
  { id: 'needed', title: 'Needed' },
  { id: 'planned', title: 'Planned' },
  { id: 'confirmed', title: 'Confirmed' },
];

const STATUS_IDS = new Set(TRIP_STATUSES.map((s) => s.id));

export function isTripStatus(v) {
  return STATUS_IDS.has(v);
}

/** Display title for a status id ('Needed' for unknown ids — never throws). */
export function tripStatusTitle(id) {
  return TRIP_STATUSES.find((s) => s.id === id)?.title ?? 'Needed';
}

// ---- Transport modes / stay types -------------------------------------------

/** Personal transport modes, in form display order. */
export const TRIP_TRANSPORT_MODES = [
  { id: 'flight', title: 'Flight' },
  { id: 'train', title: 'Train' },
  { id: 'bus', title: 'Bus' },
  { id: 'boat', title: 'Boat' },
  { id: 'taxi-shuttle', title: 'Taxi / shuttle' },
  { id: 'other', title: 'Other transport' },
];

const MODE_IDS = new Set(TRIP_TRANSPORT_MODES.map((m) => m.id));

/** Stay types, in form display order. */
export const TRIP_STAY_TYPES = [
  { id: 'hotel-hostel', title: 'Hotel / hostel' },
  { id: 'mountain-station', title: 'Mountain station' },
  { id: 'mountain-hut', title: 'Mountain hut' },
  { id: 'other', title: 'Other stay' },
];

const STAY_TYPE_IDS = new Set(TRIP_STAY_TYPES.map((t) => t.id));

export function tripModeTitle(id) {
  return TRIP_TRANSPORT_MODES.find((m) => m.id === id)?.title ?? 'Other transport';
}

export function tripStayTypeTitle(id) {
  return TRIP_STAY_TYPES.find((t) => t.id === id)?.title ?? 'Other stay';
}

// ---- Field validation -------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a plain yyyy-mm-dd string (the shape native date inputs emit). */
export function isTripDate(v) {
  return typeof v === 'string' && DATE_RE.test(v);
}

/** True for a plain HH:MM 24h string (the shape native time inputs emit). */
export function isTripTime(v) {
  return typeof v === 'string' && TIME_RE.test(v);
}

/**
 * True when a stay's date pair is orderable: either date may be absent, and
 * check-out must not precede check-in (a one-night stay checks out the next
 * day; an equal pair is tolerated rather than invented into an error).
 */
export function isStayDateOrderValid(checkInDate, checkOutDate) {
  if (!isTripDate(checkInDate) || !isTripDate(checkOutDate)) return true;
  return checkOutDate >= checkInDate;
}

// ---- Item ids ---------------------------------------------------------------

/** Unique trip-item id (same shape as wallet document / packing item ids). */
export function newTripItemId() {
  return `trip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Normalisation ----------------------------------------------------------

function cleanString(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function cleanTimestamp(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Deduplicated array of non-empty string document ids (never blobs). */
function cleanAttachmentIds(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const id of v) {
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Assign optional `key` on `target`: trimmed value or removed entirely. */
function setOptional(target, key, value) {
  const clean = cleanString(value);
  if (clean !== null) target[key] = clean;
  else delete target[key];
}

function setOptionalDate(target, key, value) {
  if (isTripDate(value)) target[key] = value;
  else delete target[key];
}

function setOptionalTime(target, key, value) {
  if (isTripTime(value)) target[key] = value;
  else delete target[key];
}

/**
 * Read-time normalisation of one stored record into a TripItem, or null when
 * it cannot be represented honestly (no usable id, unknown `kind`).
 * Repairable fields fall back to safe defaults; invalid optional fields are
 * removed rather than carried through. Unknown extra fields are preserved
 * verbatim (future additive extensions never need a breaking migration).
 * Idempotent and never throws.
 */
export function normalizeTripItem(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (raw.kind !== 'transport' && raw.kind !== 'stay') return null;

  const createdAt = cleanTimestamp(raw.createdAt, 0);
  const item = {
    ...raw,
    id: raw.id,
    kind: raw.kind,
    title: cleanString(raw.title) ?? 'Untitled',
    status: isTripStatus(raw.status) ? raw.status : 'needed',
    attachmentIds: cleanAttachmentIds(raw.attachmentIds),
    createdAt,
    updatedAt: cleanTimestamp(raw.updatedAt, createdAt),
  };
  setOptional(item, 'notes', raw.notes);
  setOptional(item, 'bookingReference', raw.bookingReference);
  setOptional(item, 'linkedStopId', raw.linkedStopId);
  setOptional(item, 'linkedTransportId', raw.linkedTransportId);

  if (raw.kind === 'transport') {
    item.mode = MODE_IDS.has(raw.mode) ? raw.mode : 'other';
    setOptional(item, 'from', raw.from);
    setOptional(item, 'to', raw.to);
    setOptionalDate(item, 'date', raw.date);
    setOptionalTime(item, 'departureTime', raw.departureTime);
    setOptionalTime(item, 'arrivalTime', raw.arrivalTime);
    setOptional(item, 'provider', raw.provider);
    // Stay-only fields never ride along on a transport record.
    delete item.stayType;
    delete item.location;
    delete item.checkInDate;
    delete item.checkOutDate;
  } else {
    item.stayType = STAY_TYPE_IDS.has(raw.stayType) ? raw.stayType : 'other';
    setOptional(item, 'location', raw.location);
    setOptionalDate(item, 'checkInDate', raw.checkInDate);
    setOptionalDate(item, 'checkOutDate', raw.checkOutDate);
    // An unorderable pair keeps the check-in (the anchoring date) and drops
    // the impossible check-out rather than dropping the whole stay.
    if (!isStayDateOrderValid(item.checkInDate, item.checkOutDate)) {
      delete item.checkOutDate;
    }
    // Transport-only fields never ride along on a stay record.
    delete item.mode;
    delete item.from;
    delete item.to;
    delete item.date;
    delete item.departureTime;
    delete item.arrivalTime;
    delete item.provider;
  }
  return item;
}

/**
 * Normalise a whole stored trip array: malformed entries drop, duplicate ids
 * keep their first occurrence, everything else heals per normalizeTripItem.
 * Returns a new array; never throws; idempotent.
 */
export function normalizeTripItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const item = normalizeTripItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// ---- Sorting ----------------------------------------------------------------

/** 0 = upcoming (today counts as upcoming), 1 = undated, 2 = past. */
function dateGroup(dateIso, todayIso) {
  if (!dateIso) return 1;
  return dateIso >= todayIso ? 0 : 2;
}

/** Shared deterministic tie-break: newest first, then title, then id. */
function tieBreak(a, b) {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareByDate(a, b, aDate, bDate, todayIso) {
  const ga = dateGroup(aDate, todayIso);
  const gb = dateGroup(bDate, todayIso);
  if (ga !== gb) return ga - gb;
  if (ga === 0 && aDate !== bDate) return aDate < bDate ? -1 : 1; // soonest first
  if (ga === 2 && aDate !== bDate) return aDate > bDate ? -1 : 1; // freshest first
  return 0;
}

/**
 * Canonical travel ordering (pure — `todayIso` injected for testability):
 *   1. dated upcoming movements, soonest first;
 *   2. undated movements;
 *   3. past movements, most recent first.
 * Within one date, departure time ascending (timed entries before untimed);
 * then the shared deterministic tie-break. Returns a new array.
 */
export function sortTravelItems(items, todayIso) {
  return [...items].sort((a, b) => {
    const byDate = compareByDate(a, b, a.date, b.date, todayIso);
    if (byDate !== 0) return byDate;
    if (a.date && a.date === b.date) {
      const at = a.departureTime ?? null;
      const bt = b.departureTime ?? null;
      if (at !== bt) {
        if (at === null) return 1;
        if (bt === null) return -1;
        return at < bt ? -1 : 1;
      }
    }
    return tieBreak(a, b);
  });
}

/**
 * Canonical stay ordering: upcoming check-ins soonest first, then undated
 * stays, then past stays most recent first; shared tie-break. New array.
 */
export function sortStayItems(items, todayIso) {
  return [...items].sort((a, b) => {
    const byDate = compareByDate(a, b, a.checkInDate, b.checkInDate, todayIso);
    if (byDate !== 0) return byDate;
    return tieBreak(a, b);
  });
}

// ---- Status summary ---------------------------------------------------------

/**
 * Deterministic status summary over structured Travel and Stay items — the
 * selector a future Today "Prepare" view reads. Standalone documents are NOT
 * trip items and never enter these counts. No percentages, no inferred
 * "next action" — deliberately.
 */
export function tripPlanSummary(items) {
  const summary = {
    total: 0,
    travelCount: 0,
    stayCount: 0,
    needed: 0,
    planned: 0,
    confirmed: 0,
  };
  for (const item of items) {
    if (item.kind !== 'transport' && item.kind !== 'stay') continue;
    summary.total += 1;
    if (item.kind === 'transport') summary.travelCount += 1;
    else summary.stayCount += 1;
    if (item.status === 'planned') summary.planned += 1;
    else if (item.status === 'confirmed') summary.confirmed += 1;
    else summary.needed += 1;
  }
  return summary;
}

// ---- Prefill builders (reference data → personal item) ----------------------

/**
 * Prefill for "Add to Trip" on a general Transport reference entry. Copies
 * ONLY verified source facts (mode, endpoints parsed from the entry's own
 * direction string, operator, title, the stable source id) — never timetable
 * dates or departure times, which would masquerade as personal plans. The
 * personal date, times, booking status and reference stay with the user;
 * status starts at 'planned' because the user chose a concrete service.
 */
export function transportPrefillFromEntry(entry) {
  const prefill = {
    kind: 'transport',
    title: cleanString(entry?.title) ?? 'Transport',
    // The reference data's three modes are a subset of the personal modes.
    mode: MODE_IDS.has(entry?.mode) ? entry.mode : 'other',
    status: 'planned',
    linkedTransportId: cleanString(entry?.id) ?? undefined,
  };
  const provider = cleanString(entry?.operator);
  if (provider) prefill.provider = provider;
  const direction = cleanString(entry?.direction);
  if (direction && direction.includes('→')) {
    const [from, to] = direction.split('→').map((s) => s.trim());
    if (from) prefill.from = from;
    if (to) prefill.to = to;
  }
  if (prefill.linkedTransportId === undefined) delete prefill.linkedTransportId;
  return prefill;
}

/** Curated stop type → personal stay type. */
const STAY_TYPE_BY_STOP_TYPE = {
  'mountain-station': 'mountain-station',
  'mountain-cabin': 'mountain-hut',
};

/**
 * Prefill for "Track stay" on a route stop. Canonical name/type come from the
 * verified stop record; the personal record starts at 'planned' with no dates
 * (never invented) and links back to the stable stop id.
 */
export function stayPrefillFromStop(stop) {
  const prefill = {
    kind: 'stay',
    title: cleanString(stop?.name) ?? 'Stay',
    stayType: STAY_TYPE_BY_STOP_TYPE[stop?.type] ?? 'other',
    status: 'planned',
    linkedStopId: cleanString(stop?.id) ?? undefined,
  };
  if (prefill.linkedStopId === undefined) delete prefill.linkedStopId;
  return prefill;
}
