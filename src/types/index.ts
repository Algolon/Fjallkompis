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
  /** True for user-added items (editable/deletable); seed items are fixed. */
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
  /** Persistent packing list: seed items (statuses merged) + custom items. */
  packing: PackingItem[];
}
