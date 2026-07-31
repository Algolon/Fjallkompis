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

// ---- Route experiences (curated, read-only experiential route content) -------

/**
 * Optional experiences ALONG the walk — viewpoints, water, landforms, nature,
 * Sami/cultural traces, short detours and major adventures. This is the data
 * foundation of the Highlights & detours layer (see
 * docs/proposals/highlights-and-detours.md).
 *
 * Anchored to STAGES, not Stops. A Stage answers "what will I encounter today?";
 * a Stop answers "what's available here?". Facilities (meals, café, sauna, shop,
 * showers, drying rooms, accommodation, transport/boat timetables) are therefore
 * NEVER experiences — they live on Stops / Lists. A facility may be *named* as
 * logistics inside an experience, never listed as one.
 *
 * Keyed to STABLE physical segment ids (`segmentIds`, d1..d7), never to display
 * day numbers: when the route direction flips, day numbers change but segment ids
 * do not, so the layer survives reversal. `nearestStopId` is secondary context.
 *
 * Four classification dimensions, kept deliberately separate (never fused into
 * one category system):
 *   type       — WHAT it is (drives the icon)
 *   scale      — HOW BIG the commitment (drives grouping + detail depth)
 *   difficulty — HOW HARD physically
 *   planningFit— DOES IT FIT the day (a human judgement, not raw numbers)
 * "Summit" is intentionally NOT a type — it is a Landform at major-adventure
 * scale with alpine difficulty; scale + difficulty carry its weight.
 *
 * User-owned state (favourite / done / notes) is intentionally NOT here — like
 * packing/journal it would live in PersistentState behind a schema bump.
 */

/** WHAT an experience is — drives the icon. Five, deliberately tight. */
export type ExperienceType =
  | 'viewpoint' // vistas, panoramas, photogenic spots
  | 'water' // waterfalls, lakes, rapids, swim spots, river crossings, bridges
  | 'landform' // mountains, summits, valleys, glaciers, moraine, rock formations
  | 'nature' // flora, wildlife, birdwatching
  | 'culture'; // Sami landscapes/history, historical remains, old trail traces

/** HOW BIG the commitment — ordered; drives the three UI groups. */
export type ExperienceScale =
  | 'on-route' // on/beside the trail, minutes, no real detour
  | 'mini-detour' // ~10–60 min
  | 'short-excursion' // ~1–3 h, shapes the day
  | 'half-full-day' // several hours; may need an overnight
  | 'major-adventure'; // a separate, committing day

export type ExperienceDifficulty = 'easy' | 'moderate' | 'hard' | 'alpine';

/**
 * Optional presentation icon key — overrides the coarse `type → icon` default
 * when a feature is more specific than its five-value `type` (a bridge is
 * `type: 'water'` but reads better with a bridge glyph). Resolved to a Lucide
 * icon in the React layer (ICON_BY_KEY); the semantic `type` still drives the
 * default, so this stays optional and never introduces a colour category.
 */
export type ExperienceIconKey =
  | 'bridge'
  | 'lake'
  | 'river'
  | 'wildlife'
  | 'forest'
  | 'pass'
  | 'glacier'
  | 'geology'
  | 'valley'
  | 'viewpoint'
  | 'summit'
  | 'culture';

/** Physical shape of a detour route — editorial context for the expanded card. */
export type ExperienceRouteShape = 'out-and-back' | 'loop' | 'one-way';

/** Human planning judgement — shown INSTEAD of raw numbers as the headline. */
export type PlanningFit =
  | 'directly-on-route'
  | 'adds-under-30'
  | 'adds-1-2h'
  | 'shorter-hiking-day'
  | 'best-from-overnight'
  | 'extra-day-recommended'
  | 'separate-day-required';

/** When an experience is possible/best. Months are 1–12. */
export interface SeasonWindow {
  fromMonth: number;
  toMonth: number;
  note?: string;
}

/**
 * Heavier safety detail, present ONLY on `major-adventure` records. A roadside
 * sight never carries turnaround advice — depth follows scale.
 */
export interface ExperienceExpedition {
  extraDayRequired: boolean;
  guide?: { recommended: boolean; required?: boolean; note?: string };
  booking?: { required: boolean; note?: string };
  equipment?: string[];
  /** The single field that most affects safety. */
  turnaroundAdvice?: string;
  season?: string;
  /** Muted-sienna warnings — reserved for decisions that materially affect safety. */
  warnings?: string[];
}

// ---- Experience spatial model ----------------------------------------------

/**
 * How an experience relates to the physical trail. A SEPARATE typed dimension —
 * `planningFit` must NOT be overloaded to carry spatial meaning ("directly on
 * route" is a time judgement, not a geometry). Drives map behaviour, stage
 * ordering (basecamp trips are pulled out of the linear list) and the derived
 * spatial label.
 */
export type ExperienceAccess =
  | 'on-trail' // you walk over/through it
  | 'beside-trail' // immediately at the trailside
  | 'beside-station' // at/beside an overnight stop, no real deviation (a Highlight)
  | 'visible-from-trail' // seen from the trail; the feature itself is elsewhere
  | 'short-detour' // a there-and-back a few minutes off the trail
  | 'side-route' // a longer branch route (may loop or rejoin)
  | 'basecamp-trip'; // launched from an overnight stop — not "along" the walk

/** The geometric shape of an experience's location. */
export type ExperienceGeometryKind =
  | 'point' // a single spot
  | 'segment-portion' // a stretch of the trail itself
  | 'area' // a broad zone
  | 'vista' // a viewpoint looking toward a separate feature
  | 'route'; // a standalone detour/excursion route (usually has a GPX asset)

/**
 * Where the mappable geometry came from. For hiking/safety data, missing beats
 * false precision — nothing is inferred, guessed or synthesised.
 *  - owner-provided: a waypoint/GPX the owner supplied or verified;
 *  - source-verified: a coordinate checked against an authoritative source;
 *  - researched: credibly researched but not yet owner-confirmed;
 *  - missing: no verified geometry (the default — stays missing until supplied).
 */
export type SpatialProvenance =
  | 'owner-provided'
  | 'source-verified'
  | 'researched'
  | 'missing';

/**
 * What the Map may do with an experience — the operational gate for "View on
 * map". Draft/inferred/synthetic geometry is ALWAYS `unavailable` in production.
 *  - exact-point: a precise marker + View on map;
 *  - verified-route: the route line + a route map action;
 *  - context-only: a general area / trail section / sight direction, clearly
 *    labelled as contextual — never implying navigational precision;
 *  - unavailable: no marker, route or View-on-map action.
 */
export type MapAvailability =
  | 'exact-point'
  | 'verified-route'
  | 'context-only'
  | 'full-stage' // intentionally route-wide: opens the whole Stage, clearly labelled
  | 'unavailable';

/**
 * Internal authoring/validation state — NOT surfaced as a user control. Every
 * published experience should reach `complete`; `awaiting-input` means the
 * intended spatial representation is pending owner data (View-on-map is simply
 * omitted, never shown as a disabled/"awaiting" action).
 */
export type SpatialStatus = 'complete' | 'awaiting-input';

/**
 * Typed geometry/location for an experience. `kind`/`access` are qualitative
 * relationships researched from trail descriptions. `orderHint` is a COARSE
 * editorial trail position (0..1, canonical north-start) used ONLY for
 * direction-aware journey ordering & grouping — it is never a coordinate and is
 * never used to synthesise a map location. All actual coordinates/GPX are
 * present ONLY when `spatialProvenance` is owner-provided/source-verified and
 * `mapAvailability` permits; otherwise they are absent (missing).
 */
export interface ExperienceLocation {
  kind: ExperienceGeometryKind;
  access: ExperienceAccess;
  /** Coarse editorial position for ORDERING/grouping only — NOT a coordinate. */
  orderHint?: number;
  spatialProvenance: SpatialProvenance;
  mapAvailability: MapAvailability;
  /** Verified exact point (owner-provided/source-verified) — else absent. */
  coord?: LatLng;
  /** Verified trailhead where a detour/route leaves the trail — else absent. */
  trailheadCoord?: LatLng;
  /** Verified feature a vista looks toward, or a route's destination — else absent. */
  destinationCoord?: LatLng;
  /** Verified rejoin point for a side route — else absent. */
  rejoinCoord?: LatLng;
  /** Compass bearing (deg) toward a distant sight, for a labelled context view. */
  viewBearingDeg?: number;
  /** A distant sight the experience looks toward (orientation only, not a destination). */
  viewTargetCoord?: LatLng;
  /** Stable id of a VERIFIED GPX route asset (see ExperienceRouteAsset) — else absent. */
  gpxAssetId?: string;
  /** Internal authoring/validation state (not a user control). */
  spatialStatus?: SpatialStatus;
}

// ---- Experience GPX route assets -------------------------------------------

export type ExperienceRouteType =
  | 'out-and-back'
  | 'loop'
  | 'point-to-point'
  | 'spur';

/**
 * Metadata contract for a separate experience route (a GPX track that is NOT
 * part of the canonical Kungsleden line). Experiences reference a stable `id`,
 * never a filename, so a rename can't silently break the link. Assets exist ONLY
 * for VERIFIED tracks — no placeholder/draft/fixture geometry ships (a route the
 * owner has not supplied or verified stays `missing`, and the experience's
 * `mapAvailability` is `unavailable`). The registry is empty until then.
 */
export interface ExperienceRouteAsset {
  id: string; // stable asset id
  experienceId: string; // the RouteExperience this belongs to
  filePath: string; // repo-relative, e.g. 'gpx/experiences/day-01-along-the-way.gpx'
  routeType: ExperienceRouteType;
  startCoord: LatLng;
  destinationCoord?: LatLng;
  rejoinCoord?: LatLng;
  distanceKm?: number;
  elevationGainM?: number;
  /** Source/creation provenance for the track itself. */
  source: StopSource;
  /** Verified provenance only — no drafts. */
  provenance: 'owner-provided' | 'source-verified';
}

/**
 * One curated experience along the route. Same provenance discipline as
 * TrailStop: every entry carries a `source` with a `lastVerified` date and a
 * `confidence`, and nothing here is user-editable.
 */
export interface RouteExperience {
  id: string; // stable slug: 'tjaktja-pass-view', 'kebnekaise-summit'
  title: string;
  shortTitle?: string;

  type: ExperienceType;
  scale: ExperienceScale;
  /** Omitted for a pure roadside sight with no walking effort. */
  difficulty?: ExperienceDifficulty;
  planningFit: PlanningFit;

  /** Optional specific icon key; falls back to a `type`-derived default. */
  icon?: ExperienceIconKey;
  /** Optional detour route shape (out-and-back / loop / one-way). */
  routeShape?: ExperienceRouteShape;
  /**
   * An unrouted off-trail objective: a verified destination point with NO
   * established or supplied path. Drives the honest "Off-trail / No marked path"
   * treatment and the point-only (never a line) map action.
   */
  offTrail?: boolean;

  /** Stable physical stage ids (d1..d7); may be several (a basecamp trip → both adjacent stages). */
  segmentIds: string[];
  /** Typed spatial model — geometry, trail access and direction-safe position. */
  location: ExperienceLocation;
  /** Secondary context only — never the presentation anchor. */
  nearestStopId?: string;
  /** Optional direction-neutral phrase override; usually derived from `location`. */
  routeRelationship?: string;

  /** One calm sentence for the row / preview. */
  summary: string;
  /** "What not to walk past without noticing" — the inline-expand line for on-route sights. */
  whyNotice: string;
  /** Offline long-form (detour+; on-route sights may omit it). */
  description?: string;

  // Optional planning detail (detour+; not for roadside sights).
  addedTimeText?: string; // '+20 min', '2–3 h'
  detourDistanceKm?: number;
  roundTripKm?: number;
  elevationGainM?: number;
  weatherSensitivity?: 'low' | 'medium' | 'high';
  season?: SeasonWindow;

  /** Present only for `major-adventure` scale (see ExperienceExpedition). */
  expedition?: ExperienceExpedition;

  /** Copy shown when a `full-stage` experience opens the Map (route-wide framing). */
  mapNote?: string;

  source: StopSource;
  confidence: 'high' | 'medium' | 'low';
}

// ---- Trip plan ---------------------------------------------------------------

/**
 * Personal arrangement status of a Travel or Stay item. Deliberately three
 * values in the first version (no completed/cancelled), and deliberately
 * DISTINCT from the packing statuses:
 *  - needed:    required or intended, not yet properly arranged;
 *  - planned:   selected or scheduled, not yet fully confirmed;
 *  - confirmed: definitively booked or otherwise settled. A document is not
 *    required for confirmed status, and status is never inferred from
 *    attachment presence in either direction.
 */
export type TripItemStatus = 'needed' | 'planned' | 'confirmed';

/** Personal transport modes (a superset of the reference TransportMode). */
export type TripTransportMode =
  | 'flight'
  | 'train'
  | 'bus'
  | 'boat'
  | 'taxi-shuttle'
  | 'other';

export type TripStayType = 'hotel-hostel' | 'mountain-station' | 'mountain-hut' | 'other';

/**
 * Shared shape of a personal Trip item. The item is the PRIMARY object; a
 * ticket or booking confirmation is supporting material referenced by
 * document id — an item is fully valid without any attachment.
 *
 * Items live in PersistentState so they ride the JSON backup and device
 * transfer; the referenced documents (metadata + blobs) stay in the dedicated
 * IndexedDB database and deliberately do not. A referenced document can
 * therefore be missing on this device — the UI states that honestly instead
 * of crashing or pretending.
 */
export interface TripItemBase {
  id: string;
  /** Immutable after creation. */
  kind: 'transport' | 'stay';
  title: string;
  status: TripItemStatus;
  notes?: string;
  bookingReference?: string;
  /** Wallet document ids — references only, never blobs. */
  attachmentIds: string[];
  /** Stable route-stop id (physical, direction-safe) — provenance, not owned. */
  linkedStopId?: string;
  /** Stable Transport reference entry id — provenance, not owned. */
  linkedTransportId?: string;
  /** ms epoch — immutable after creation. */
  createdAt: number;
  /** ms epoch — changes on every edit. */
  updatedAt: number;
}

export interface TransportTripItem extends TripItemBase {
  kind: 'transport';
  mode: TripTransportMode;
  from?: string;
  to?: string;
  /** Personal travel date (yyyy-mm-dd) — never copied from a timetable. */
  date?: string;
  /** "HH:MM" 24h. */
  departureTime?: string;
  arrivalTime?: string;
  provider?: string;
}

export interface StayTripItem extends TripItemBase {
  kind: 'stay';
  stayType: TripStayType;
  location?: string;
  checkInDate?: string;
  checkOutDate?: string;
}

export type TripItem = TransportTripItem | StayTripItem;

export interface TripStatusInfo {
  id: TripItemStatus;
  title: string;
}

export interface TripTransportModeInfo {
  id: TripTransportMode;
  title: string;
}

export interface TripStayTypeInfo {
  id: TripStayType;
  title: string;
}

/**
 * Deterministic status summary over structured Travel and Stay items — the
 * selector a future Today "Prepare" view will read. Standalone documents are
 * never counted.
 */
export interface TripPlanSummary {
  total: number;
  travelCount: number;
  stayCount: number;
  needed: number;
  planned: number;
  confirmed: number;
}

// ---- Trail Wallet (Trip plan documents) ----------------------------------------

/**
 * Standalone document categories (Lists → Trip → Documents). Stable ids —
 * display titles live in WALLET_CATEGORIES (src/wallet/walletModel.mjs).
 * 'transport' and 'booking' are LEGACY ids from the document-first Trail
 * Wallet era: existing records keep them verbatim (no data loss) and they
 * still resolve to their historical titles, but new documents choose from
 * the current six — a personal ticket or booking now belongs on a Travel or
 * Stay item, with the file attached.
 */
export type WalletCategory =
  | 'membership'
  | 'insurance-emergency'
  | 'identity'
  | 'route-reference'
  | 'timetable'
  | 'other'
  // Legacy Trail Wallet categories, preserved verbatim on existing records.
  | 'transport'
  | 'booking';

/** The four supported wallet file formats — nothing else is ever stored. */
export type WalletMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

/**
 * One Trail Wallet document's METADATA. The file itself is a Blob stored
 * beside it in the same IndexedDB database ('fjallkompis-wallet'), keyed by
 * the same id — deliberately OUTSIDE PersistentState/localStorage (see
 * docs/proposals/trail-wallet.md §2): wallet data is self-contained, and the
 * JSON backup neither carries nor implies carrying these files.
 *
 * Future associations (a stop, a physical stage segment, a travel day) are
 * planned as ADDITIVE optional fields — IndexedDB stores plain objects, and
 * read-time normalisation preserves unknown fields, so extending this shape
 * never needs a breaking storage migration. Not implemented or exposed yet.
 */
export interface WalletDocument {
  id: string;
  title: string;
  category: WalletCategory;
  /** Optional ISO date (yyyy-mm-dd) — departure, validity, check-in. Drives sorting. */
  date?: string;
  note?: string;
  pinned: boolean;
  /** ms epoch. */
  createdAt: number;
  /** ms epoch — also the merge key for any future optional sync layer. */
  updatedAt: number;
  /** Original filename, kept for re-export. */
  fileName: string;
  mimeType: WalletMimeType;
  sizeBytes: number;
  /**
   * Membership documents only: the issuing organisation, chosen EXPLICITLY
   * in the editor — never inferred from filenames, titles or notes. Additive
   * optional field (see the shape comment above): absent on every legacy and
   * non-membership record, no storage migration involved.
   */
  membershipProvider?: MembershipProvider;
  /**
   * Membership + STF only: surface the Today (On route) quick-access card.
   * At most one document carries this flag — saving a new choice clears the
   * previous holder in the same transaction (walletStore
   * enforceMembershipQuickAccess); quickAccessMembership() reads it.
   */
  showOnToday?: boolean;
  /**
   * RUNTIME annotation, never persisted: true when this document's metadata
   * exists but its file blob is absent on this device (browser storage
   * eviction). Derived on every listWalletDocuments() read; the store strips
   * it from every write and the normaliser heals it off stored records. The
   * UI states the missing file honestly instead of hiding the document — the
   * document and its Trip-item links remain meaningful without the file.
   */
  fileMissing?: boolean;
}

/** Issuing organisation of a Membership document (explicit user choice). */
export type MembershipProvider = 'stf' | 'other';

export interface WalletCategoryInfo {
  id: WalletCategory;
  title: string;
}

/** Typed result of validating a candidate file (name/type/size). */
export type WalletFileValidation =
  | { ok: true; mimeType: WalletMimeType }
  | { ok: false; reason: 'unsupported-type' }
  | { ok: false; reason: 'too-large'; sizeBytes: number; maxBytes: number };

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
  /**
   * How many of the row's units are worn on the body instead of carried in
   * the backpack (0 ≤ wornQuantity ≤ quantity). Every unit has exactly one
   * location: `status` describes the remaining carried units, so
   * "3 shirts, 1 worn, 2 packed" is a valid row, while `status: 'packed'`
   * with zero carried units is impossible (enforced by applyPackingPatch
   * and the state normaliser — packed wins, worn units heal to 0). Only
   * items in worn-eligible categories (clothing, rain & insulation,
   * footwear — see WORN_CATEGORY_IDS) can have worn units. "Is this row
   * worn at all?" is the derived `wornQuantity > 0` — there is no separate
   * boolean.
   */
  wornQuantity: number;
  /**
   * Provenance only: true for user-added items, false for items that came
   * from the seed template. NOT an authorization flag — every item can be
   * renamed, moved, re-weighted and deleted regardless of origin.
   */
  custom: boolean;
}

export interface PackingCategory {
  id: string;
  title: string;
}

// ---- Day plan (personal journey planning) ---------------------------------------

/**
 * The user's personal Day plan — the ONLY new persisted data of the feature.
 *
 * A journey is a sequence of CALENDAR DAYS; only some of them contain walking.
 * A day holds one or more ordered {@link DayActivity} entries and, optionally,
 * an explicit overnight reference. Canonical route stages are never modified,
 * merged, split, skipped, duplicated or reordered by any of this: a hiking
 * activity records only HOW MANY adjacent stages that day covers, and the
 * stages themselves are derived by walking the days in order.
 *
 * Planning is strictly OPT-IN. `PersistentState.dayPlan` is null until the user
 * creates a plan in Settings, and null means the app behaves exactly as it did
 * before the feature existed: no dates, no activity indicators, no inferred
 * days (see src/plan/dayPlan.mjs).
 *
 * Everything else — day numbers, dates, stage ids, endpoints, via-stops,
 * totals, elevation profiles, matched Trip items, the effective overnight —
 * is DERIVED at runtime (src/plan/plannedDays.mjs).
 */
export interface DayPlanState {
  /** The walking direction this plan's hiking allocation was authored for. */
  direction: RouteDirection;
  /** ISO date (yyyy-mm-dd) of day 1 of the JOURNEY — not of the first hike. */
  startDate: string;
  /** Stable id of the active calendar day, or null. Never an array index. */
  currentDayId: string | null;
  /** Ordered, consecutive calendar days. At least one. */
  days: PlannedDayRecord[];
}

/** One persisted calendar day. Dates are derived from startDate + position. */
export interface PlannedDayRecord {
  /** Stable id (`day_<base36>_<random>`) — survives insertion and removal. */
  id: string;
  /** Ordered activities; order records e.g. hike-then-travel vs travel-then-hike. */
  activities: DayActivity[];
  /** Explicit overnight. ABSENT means "derive" — never a fourth variant. */
  overnight?: OvernightRef;
}

/**
 * Absolute orientation of a hiking leg over its PHYSICAL canonical stage:
 * 'canonical' walks the stage as stored (the north-to-south generation
 * order), 'opposite' walks the same verified route in reverse. Deliberately
 * NOT relative to the app's selected route direction — re-reading a plan can
 * never reinterpret a leg (see src/plan/hikingLegs.mjs).
 */
export type HikingLegOrientation = 'canonical' | 'opposite';

/**
 * One explicit hiking leg: a reference to a physical canonical stage plus an
 * absolute orientation. `id` is a stable identity (`leg_…`, unique across the
 * whole plan) that survives unrelated edits and reloads — repeated walks of
 * the same stage are DIFFERENT legs. The one supported kind is
 * 'canonical-stage'; a verified custom-route member may be added later, but
 * nothing free-form is ever representable.
 */
export interface CanonicalHikingLeg {
  id: string;
  kind: 'canonical-stage';
  stageId: string;
  orientation: HikingLegOrientation;
}

/**
 * The minimal per-stage topology the pure plan modules validate against:
 * canonical stage id and its canonical-direction endpoints. Derived from the
 * verified route data by the caller (src/utils/storage.ts) — the plan modules
 * stay free of route-data imports, the stateMigration.mjs convention.
 */
export interface StageTopologyEntry {
  id: string;
  fromStopId: string;
  toStopId: string;
}

/**
 * A supported activity. Deliberately closed: no custom or free-form variant.
 *  - hiking: covers `stages` ADJACENT canonical stages, taken in route order
 *    from the running cursor. Across every day these counts sum to exactly the
 *    canonical stage count, which is what makes a skipped, duplicated,
 *    non-adjacent or reordered stage structurally unrepresentable.
 *  - travel: presence only. The movement's details live in Lists → Trip and
 *    are matched by date, never copied here.
 *  - rest: presence only, and exclusive — a rest day holds nothing else.
 */
export type DayActivity =
  | { kind: 'hiking'; stages: number }
  | { kind: 'travel' }
  | { kind: 'rest' };

export type DayActivityKind = DayActivity['kind'];

/**
 * Where the user sleeps at the end of a day, when they say so explicitly.
 * Absence means the effective overnight is derived (hiking endpoint, or the
 * previous day's overnight for a rest day). References only — accommodation
 * names and details are never copied out of Stops or the Trip plan.
 */
export type OvernightRef =
  | { kind: 'stop'; stopId: string }
  | { kind: 'stay'; tripItemId: string }
  | { kind: 'none' };

/**
 * The derived planned-day model (PlannedDay) lives beside the itinerary types
 * it composes — src/plan/plannedDays.mjs — because it carries real
 * ItineraryStage objects. Nothing about it is ever persisted.
 */

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
 * Schema v5 made `packing` a fully user-owned snapshot and added
 * `packingTemplateVersion`; pre-v5 payloads run a one-time seed merge (see
 * src/utils/stateMigration.mjs).
 * Schema v6 added `trip` (personal Travel and Stay items); older payloads
 * normalise to an empty trip plan.
 * Schema v7 added `dayPlan` (the personal Day plan); older payloads — and
 * every existing user — normalise to `null`, which is exactly the app's
 * pre-v7 behaviour (no dates, no planned days, no activity indicators).
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
  /**
   * The user's packing list — a fully owned snapshot since schema v5. Every
   * item (seeded or custom) carries its own label/category/quantity/weight/
   * essential/status here; seed items are never re-merged on load, so
   * renames, moves and deletions stick.
   */
  packing: PackingItem[];
  /**
   * Packing template generation this snapshot was last reconciled with (see
   * PACKING_TEMPLATE_VERSION in src/data/packingSeed.mjs). Missing on pre-v5
   * payloads, which triggers the one-time legacy seed merge.
   */
  packingTemplateVersion: number;
  /**
   * Personal Trip plan: structured Travel and Stay items (documents are NOT
   * here — their metadata and blobs stay in the dedicated IndexedDB database;
   * items only reference document ids via `attachmentIds`). Rides the JSON
   * backup and device transfer like every other PersistentState field.
   */
  trip: TripItem[];
  /**
   * The personal Day plan, or null when the user has not created one. Null is
   * the default and the canonical state: no dates, no planned calendar days,
   * no activity indicators — the app exactly as it was before this feature.
   * Only an explicit action in Settings creates a plan; nothing is ever
   * inferred from Trip items, documents, route direction or the system date.
   *
   * `currentStageId` above remains the route-progress pointer in every state.
   * `dayPlan.currentDayId` is the CALENDAR-day pointer and exists only while a
   * plan does; travel and rest days carry no stage, so one pointer cannot
   * answer both questions.
   */
  dayPlan: DayPlanState | null;
}
