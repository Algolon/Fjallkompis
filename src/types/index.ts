// All domain types live here so screens and utils share one source of truth.

import type { RouteDirection } from '../route/direction.mjs';
export type { RouteDirection };

export type LatLng = {
  lat: number;
  lng: number;
};

// ---- Stops (curated, read-only location data) ------------------------------

export type StopType = 'mountain-station' | 'mountain-cabin' | 'village';

export type FacilityId =
  | 'guest-kitchen'
  | 'shop'
  | 'sauna'
  | 'shower'
  | 'restaurant'
  | 'cafe'
  | 'wifi'
  | 'gear-rental'
  | 'public-transport'
  | 'staffed';

export interface StopFacility {
  id: FacilityId;
  label: string;
  detail?: string;
  /** True when the *absence* of this facility is the important fact. */
  importantAbsence?: boolean;
}

export interface StopSource {
  label: string;
  url: string;
  /** ISO date the facts were last manually verified. */
  lastVerified: string;
}

export interface StopImage {
  src: string;
  alt: string;
  credit?: string;
  license?: string;
}

/**
 * Curated, manually verified description of a place along the route.
 * Official facility data is NOT user-editable — personal notes live in
 * localStorage keyed by stop id (see HutUserData below).
 */
export interface TrailStop {
  id: string;
  name: string;
  type: StopType;
  coord: LatLng;
  summary: string;
  description: string;
  facilities: StopFacility[];
  warnings?: string[];
  summerOpening2026?: string;
  bedCapacity?: string;
  image?: StopImage;
  source: StopSource;
}

// ---- Source metadata (externally maintained, static/live) -------------------

/**
 * Explicit provenance for a piece of externally maintained information (shop
 * assortments, transport timetables). Kept small and uniform so every card can
 * state where a fact came from, when it was last checked, and — crucially —
 * whether it is a *static* snapshot or a *live* planner. The app never claims
 * static data is live; `kind` drives that distinction in the UI.
 */
export interface SourceMeta {
  title: string;
  url: string;
  publisher: string;
  /** Year the underlying source was published (e.g. a 2025 price list). */
  sourceYear?: number;
  /** ISO validity range where the source itself is dated (timetables). */
  validFrom?: string;
  validTo?: string;
  /** ISO date these facts were last manually verified. */
  lastVerified: string;
  /** static = a fixed snapshot; live = an official planner to check per date. */
  kind: 'static' | 'live';
  /** Short caveat shown alongside the source (e.g. "prices may change"). */
  warning?: string;
}

// ---- Shop info (curated, read-only assortment data) -------------------------

/**
 * STF's official cabin-shop classification, extended with the two non-cabin
 * shop kinds present on this route:
 *  - station: a mountain-station shop (Abisko, Kebnekaise) — larger than and
 *    distinct from the STF cabin assortment lists;
 *  - large / small: the two official STF cabin-shop sizes;
 *  - none: no shop at this stop;
 *  - local: a separate local facility/shop (Nikkaluokta), outside the STF
 *    cabin classification.
 */
export type ShopType = 'station' | 'large' | 'small' | 'none' | 'local';

/** The two STF cabin-shop sizes an assortment product can be listed in. */
export type ShopSize = 'large' | 'small';

/**
 * The three shop-type categories the Shops screen is organised around:
 * the two STF cabin sizes plus `full-service` — a pragmatic combined category
 * (Abisko/Kebnekaise stations + the independent Nikkaluokta shop) for the
 * current Abisko–Nikkaluokta scope, with no STF standard assortment list.
 */
export type ShopCategory = 'large' | 'small' | 'full-service';

export type ProductCategoryId =
  | 'meals-pantry'
  | 'bread-spreads'
  | 'canned'
  | 'loose-weight'
  | 'snacks-sweets'
  | 'drinks'
  | 'first-aid-hygiene'
  | 'fuel'
  | 'camping';

export interface ProductCategory {
  id: ProductCategoryId;
  title: string;
}

/**
 * How a product appears in ONE shop size's official list.
 *  - standard: printed in bold — expected in stock throughout the season;
 *  - extra: printed in italic/asterisked — stocked while supplies last, mainly
 *    in peak season.
 * Price lives here (not on the product) because the same product can carry a
 * different price and a different standard/extra status between the Small and
 * Large lists (e.g. 500 g pasta).
 */
export interface ProductListing {
  availability: 'standard' | 'extra';
  /**
   * Numeric SEK reference price, or null when the source prints a compound or
   * per-unit token that has no single number — then read `priceLabel`.
   */
  referencePrice: number | null;
  /** Verbatim price token from the source, e.g. "55:-", "5:-/dl", "35:- / 15:-". */
  priceLabel: string;
  /** Unit/quantity the price applies to, when not per-piece (e.g. "per dl"). */
  priceUnit?: string;
}

/**
 * One normalised product, with its listing in each shop size it occurs in.
 * `large`/`small` are null when that size's official list does not contain it.
 * Labels are normalised English (obvious source typos/translation fixed); the
 * meaning and the prices are never invented or altered.
 */
export interface AssortmentProduct {
  id: string;
  label: string;
  category: ProductCategoryId;
  large: ProductListing | null;
  small: ProductListing | null;
  note?: string;
}

/** A shop (or its absence) at one location along the route. */
export interface ShopLocation {
  id: string;
  /** Matching app stop id when this location is one of the mapped stops. */
  routeStopId: string | null;
  name: string;
  type: ShopType;
  description: string;
  /** Reminder that actual stock varies (bold items included). */
  stockWarning: string;
  source: SourceMeta;
}

// ---- Transport (curated, read-only timetable data) --------------------------

export type TransportMode = 'bus' | 'train' | 'boat';

/** Journey context the entry belongs to (Lists → Transport sections). */
export type TransportContext =
  | 'to-trail'
  | 'along-trail'
  | 'from-trail'
  | 'live-alternative';

/**
 * One entry within a timetable run. For a bus this is a stop (place + time +
 * any caveat); for a boat with several daily sailings on one hop it is a single
 * departure (time only, `place` omitted — the schedule label carries the hop).
 */
export interface TransportCall {
  /** Stop name for multi-stop runs; omitted for a plain departure-time list. */
  place?: string;
  /** "HH:MM"; omitted where the source gives no time. */
  time?: string;
  /** e.g. "boarding only", "drop-off only", "2 Jul–16 Aug only". */
  note?: string;
}

/** A named run within a service (e.g. "Daily morning", "Special Saturdays"). */
export interface TransportSchedule {
  id: string;
  label: string;
  /** Operating-day rule in words (e.g. "Monday–Friday"). */
  dayRule?: string;
  /** ISO dates this run applies to ONLY (special-date services). */
  onlyDates?: string[];
  /** ISO dates the normal run does NOT operate. */
  notDates?: string[];
  /** Extra caveat for this run. */
  exception?: string;
  calls: TransportCall[];
}

export interface TransportPrice {
  label: string;
  price: string;
}

export interface TransportLink {
  label: string;
  url: string;
}

/**
 * One transport service relevant to this route. A fixed timetable carries
 * `validFrom`/`validTo`; a `live` alternative (train) deliberately has no
 * hard-coded times — only official planner links — because its times and
 * disruption status must be checked for the actual travel date.
 */
export interface TransportEntry {
  id: string;
  context: TransportContext;
  mode: TransportMode;
  operator: string;
  title: string;
  direction?: string;
  summary: string;
  /** ISO static-timetable validity (absent for live alternatives). */
  validFrom?: string;
  validTo?: string;
  /** Human-readable season/validity, e.g. "1 July – 30 August 2026". */
  validityText?: string;
  operatingDays?: string;
  durationText?: string;
  booking?: string;
  bookingDeadline?: string;
  prices?: TransportPrice[];
  paymentMethods?: string;
  schedules?: TransportSchedule[];
  walkingContext?: string[];
  connections?: string[];
  warnings?: string[];
  /** True for a live planner alternative (never a fixed timetable). */
  live?: boolean;
  contact?: string[];
  extraLinks?: TransportLink[];
  source: SourceMeta;
}

/**
 * Validity state of a timetable relative to a given date:
 *  - live: a live-planner alternative (no fixed timetable to expire);
 *  - undated: a fixed service with no encoded validity range;
 *  - upcoming: before its validity window;
 *  - valid: inside its validity window;
 *  - expired: after its validity window — surfaced as "check source", never hidden.
 */
export type TimetableStatus =
  | 'live'
  | 'undated'
  | 'upcoming'
  | 'valid'
  | 'expired';

// ---- Stages -----------------------------------------------------------------

/** A day stage connecting two stops. Geometry/statistics come from the GPX. */
export interface Stage {
  id: string;
  /** 1-based day number — this route is a genuine ordered sequence. */
  day: number;
  fromHutId: string;
  toHutId: string;
  /** GPX-derived Haversine distance in km. */
  distanceKm: number;
  /**
   * Personal planning estimate in hours. The GPX has no time data, so this
   * is NOT derived from it — always present it as an estimate.
   */
  estimatedHours: number;
  notes: string;
  /** GPX-derived elevation statistics (smoothed ascent/descent). */
  totalAscentM: number | null;
  totalDescentM: number | null;
  minimumElevationM: number | null;
  maximumElevationM: number | null;
}

// ---- Packing list -------------------------------------------------------------

export type PackingStatus = 'needed' | 'ready' | 'packed';

export interface PackingItem {
  id: string;
  label: string;
  categoryId: string;
  quantity: number;
  status: PackingStatus;
  weightGrams?: number;
  essential: boolean;
  /** Optional free-text note (size, brand, reminder). Absent when empty. */
  notes?: string;
  /** Deterministic display order within the personal list (ascending). */
  sortOrder: number;
  /**
   * Provenance only: true for user-added items, false for items that originated
   * from the Fjällkompis template. Since v5 the personal list is fully owned —
   * every item (template or custom) is editable and deletable; this flag no
   * longer gates anything, it just records where the item came from.
   */
  custom: boolean;
}

export interface PackingCategory {
  id: string;
  title: string;
}

// ---- Journal --------------------------------------------------------------------

export interface JournalEntry {
  id: string;
  /** ISO date string (yyyy-mm-dd). */
  date: string;
  stageId: string | null;
  mood: number; // 1..5
  energy: number; // 1..5
  weather: string;
  highlight: string;
  challenge: string;
  reflection: string;
  /** ms epoch, for stable ordering and "latest" lookups. */
  updatedAt: number;
}

// ---- Persisted state ---------------------------------------------------------------

/**
 * Per-stop user data. Still keyed under `hutData` in the persisted blob for
 * backwards compatibility with schema v1 (stop ids never changed).
 * The old v1 `shopOverride` field is dropped during migration.
 */
export interface HutUserData {
  notes: string;
}

/**
 * The single persisted blob. Bump SCHEMA_VERSION on breaking changes.
 * Schema v3 dropped the `checklist` map of the archived Daily checklist
 * feature; old payloads carrying it still load (the key is ignored during
 * normalisation — see src/utils/stateMigration.mjs).
 * Schema v4 added `routeDirection`; older payloads default to the canonical
 * 'abisko-to-nikkaluokta'.
 * Schema v5 turned the packing list into a fully-owned personal copy: items are
 * no longer re-merged from the seed on load, `sortOrder`/`notes` were added,
 * `packingTemplateVersion` records which template revision the list was seeded
 * from (used by "Restore default"), and `packingSections` holds user-owned
 * custom sections created by spreadsheet import (default sections live in
 * `PACKING_CATEGORIES`, not here).
 */
export interface PersistentState {
  schemaVersion: number;
  currentStageId: string | null;
  /**
   * Selected walking direction over the canonical route. Only the direction is
   * persisted; the derived directional itinerary is rebuilt at runtime (see
   * src/route/activeItinerary.ts). Missing/invalid values normalise to the
   * canonical 'abisko-to-nikkaluokta'.
   */
  routeDirection: RouteDirection;
  /** stopId -> personal trip notes (legacy key name kept from v1). */
  hutData: Record<string, HutUserData>;
  journal: JournalEntry[];
  /** Fully-owned personal packing list (template copy + custom items). */
  packing: PackingItem[];
  /**
   * User-owned custom sections created by spreadsheet import (id + display
   * name), in first-appearance order. Default sections are NOT stored here —
   * they come from `PACKING_CATEGORIES`. A custom section is kept only while at
   * least one item references it; it is pruned when its last item is removed.
   */
  packingSections: PackingCategory[];
  /** Template revision the personal list was seeded/restored from (v5+). */
  packingTemplateVersion: number;
}
