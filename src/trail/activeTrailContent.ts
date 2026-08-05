/**
 * The active trail dossier — the ONE application-facing way into curated trail
 * content.
 *
 * WHY THIS EXISTS
 * ---------------
 * Fjällkompis ships exactly one curated dossier (the Kungsleden between
 * Abisko and Nikkaluokta) and exactly one personal trip. Those two have
 * separate owners, but until now they had no separate SEAM: roughly twenty
 * screens, components and stores reached into individual content modules
 * directly — `../data/stops` here, `../data/shops.mjs` there, `../route/
 * routeData` somewhere else. The second-route architecture probe (draft
 * PR #97, gate NARROW) measured that surface and found the personal core
 * (src/plan, src/trip, src/wallet) needed no change at all: the whole cost sat
 * in identity, content access, configuration and asset descriptors.
 *
 * This module closes the content-access half. Application code asks the
 * dossier one question through one import; content stays defined where it
 * already lives.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a trail registry, not a catalogue, not a pack format, not a loader, not
 * a selector and not an extension point. There is no array of trails, no
 * async, no dependency injection and no mutable "current trail". The active
 * trail is decided at COMPILE TIME by the imports below, exactly as it was
 * before this file existed — the only change is that there is now one place
 * that says so. A second trail remains a separate architectural step with
 * deliberately no seam here.
 *
 * It is also not a copy. Every value below is a REFERENCE to the module that
 * already owns it. Nothing here restates an id, a distance, a guide sentence
 * or a source URL, so there is no second source of truth to drift.
 *
 * WHAT BELONGS HERE
 * -----------------
 * The verified dossier: route and stages, places, editorial route content
 * (including the standing operational caveats), reference logistics, and the
 * sources behind them. In other words: what a hiker TRUSTS about the trail,
 * independent of their own trip.
 *
 * WHAT DOES NOT
 * -------------
 * Anything personal or app-scoped: day plan, trip items, wallet documents,
 * packing, journal, stop notes, persisted state and its schema, the app
 * version, offline map archives and cache keys, software and basemap credits,
 * install state, geolocation. Those have their own owners and must not become
 * reachable "through the trail".
 *
 * Two deliberate exclusions are worth naming, because both look like trail
 * content and are not:
 *
 *  - The PACKING SEED (src/data/packingSeed.mjs) mixes generic gear with
 *    Kungsleden-specific items. Untangling that is content work, not a
 *    boundary change, so it stays out and Lists keeps importing it directly.
 *    Splitting it is a separate, editorial decision.
 *  - APP-SCOPED SOURCES (basemap, satellite, terrain, software credits) answer
 *    "how does this software render?", not "what is true about this trail".
 *    They stay in src/data/attribution.ts and are read directly by the map and
 *    by the credits sheet. Only the TRAIL-scoped sources are re-exported here.
 *
 * SHAPE
 * -----
 * Two views on the same objects, never two copies:
 *
 *  1. {@link ACTIVE_TRAIL_CONTENT} — the dossier as DATA, grouped by category.
 *     This is the contract a future Guide reads: it can enumerate what the
 *     dossier contains without knowing which module defines what.
 *  2. Named re-exports — the ergonomic path for existing call sites, so
 *     migrating a screen is an import-source change and nothing else.
 *
 * Both resolve to the identical objects (asserted in
 * tests/active-trail-content.test.mjs), so neither can drift from the other.
 *
 * DEPENDENCY DIRECTION
 * --------------------
 * Application code → this boundary → content definitions. Never the reverse:
 * a content module importing this file would be a cycle and is fenced by test.
 * Core derivation (src/route/activeItinerary.ts, src/route/itinerary.mjs) and
 * the persistence layer sit BELOW the boundary and keep importing the narrow
 * module they need — see the allowlist in the enforcement test.
 */
import {
  ROUTE,
  WAYPOINT_BY_ID,
  HUT_TO_WAYPOINT,
  WAYPOINT_TO_HUT,
  stopIdForWaypoint,
} from '../route/routeData';
import {
  STAGES,
  STAGES_BY_ID,
  STAGE_TOPOLOGY,
  DEFAULT_STAGE_ID,
} from '../data/stages';
import {
  STOPS,
  STOPS_BY_ID,
  FACTS_VERIFIED_ON,
  stopShortName,
  collapsedFacilities,
  collapsedFacilityList,
  importantAbsences,
} from '../data/stops';
import {
  OFF_ROUTE_PLACES,
  OFF_ROUTE_FACTS_VERIFIED_ON,
  curatedOffRoutePlaces,
  journeyPlaceById,
  placeDisplayName,
  placeStayPrefill,
  staysLinkedToPlace,
} from '../data/journeyPlaces.mjs';
import { STAGE_EDITORIAL } from '../data/stageEditorial.mjs';
import { STAGE_GUIDES, GUIDE_SOURCES, stageGuide } from '../data/stageGuides.mjs';
import { TRAIL_CAVEATS } from '../data/trailCaveats.mjs';
import {
  HIGHLIGHT_TYPES,
  STAGE_HIGHLIGHT_IDS,
  stageHighlights,
  combinedStageHighlights,
} from '../data/stageHighlights.mjs';
import {
  ROUTE_EXPERIENCES,
  EXPERIENCE_TYPE_LABEL,
  ACCESS_LABEL,
  canViewOnMap,
  isBasecamp,
  isRouteWide,
  journeyPositionLabel,
  experienceCountForStage,
  stageHighlightsAndDetours,
} from '../data/routeExperiences';
import { experienceTrack, experienceWaypoint } from '../data/experienceGeometry';
import {
  SHOP_LOCATIONS,
  SHOP_FACTS_VERIFIED_ON,
  SHOP_PRICE_REFERENCE_YEAR,
  VISIBLE_SHOP_CATEGORIES,
  FULL_SERVICE_SHOPS,
  STF_SHOP_OVERVIEW_SOURCE,
  STF_LARGE_PRICELIST_URL,
  STF_SMALL_PRICELIST_URL,
  assortmentByCategory,
  assortmentCounts,
  productsForSize,
  shopTypeForStop,
} from '../data/shops.mjs';
import {
  TRANSPORT_ENTRIES,
  TRANSPORT_SECTIONS,
  TRANSPORT_FACTS_VERIFIED_ON,
  BUS_TIMETABLES_REVERIFIED_ON,
  entriesForContext,
  transportSectionsFor,
  timetableCoverageFor,
  timetablePeriodsFor,
  timetablePeriodProblems,
  timetableStatus,
  transportLinkForStop,
} from '../data/transport.mjs';
import { TRAIL_CONTENT, trailDossierView } from '../data/trailMetadata.mjs';
import { TRAIL_DATA_SOURCES, TRIP_INFO_SOURCES } from '../data/attribution';

/**
 * The active trail dossier, grouped by the question each category answers.
 *
 * Frozen at the top level and per category, because which content the dossier
 * consists of is a compile-time fact. The referenced datasets keep their own
 * mutability: deep-freezing ~10k route points and their derived profiles would
 * cost real work at module load to prevent a mutation nothing performs.
 *
 * Nothing here is direction-aware. Walking direction is a personal setting
 * (src/route/direction.mjs) applied by runtime derivation
 * (src/route/activeItinerary.ts); an oriented itinerary is a view of this
 * content, never a second content set stored beside it.
 */
export const ACTIVE_TRAIL_CONTENT = Object.freeze({
  /**
   * Publication identity — trail id, dossier name, content version, and (only
   * once one honestly exists) a whole-dossier review date. Imported from the
   * metadata authority, never restated.
   */
  metadata: TRAIL_CONTENT,

  /** The canonical route: geometry, statistics, stages and waypoints. */
  route: Object.freeze({
    canonical: ROUTE,
    statistics: ROUTE.statistics,
    stages: STAGES,
    stagesById: STAGES_BY_ID,
    /** Stage adjacency used by day planning; ordering stays direction-derived. */
    topology: STAGE_TOPOLOGY,
    defaultStageId: DEFAULT_STAGE_ID,
    waypoints: ROUTE.waypoints,
    waypointsById: WAYPOINT_BY_ID,
    /** GPX waypoint machine ids ↔ the app's stop ids, both directions. */
    waypointForStop: HUT_TO_WAYPOINT,
    stopForWaypoint: WAYPOINT_TO_HUT,
  }),

  /** Where a hiker can be: curated stops on the route, and places beside it. */
  places: Object.freeze({
    stops: STOPS,
    stopsById: STOPS_BY_ID,
    stopFactsVerifiedOn: FACTS_VERIFIED_ON,
    /** Curated before/after-trail places (towns, stations, airports). */
    offRoute: OFF_ROUTE_PLACES,
    offRouteFactsVerifiedOn: OFF_ROUTE_FACTS_VERIFIED_ON,
  }),

  /** What the dossier SAYS about the route: guides, notes, things to notice. */
  editorial: Object.freeze({
    stageGuides: STAGE_GUIDES,
    guideSources: GUIDE_SOURCES,
    /**
     * Standing operational caveats — what is true on every stage, every day,
     * about navigating with this app and about depending on a phone. They sit
     * beside the guides because they answer the same question the guides do
     * ("what should I know before I walk this?"), only for the whole dossier
     * rather than one stage.
     */
    caveats: TRAIL_CAVEATS,
    stageEditorial: STAGE_EDITORIAL,
    highlightTypes: HIGHLIGHT_TYPES,
    stageHighlightIds: STAGE_HIGHLIGHT_IDS,
    experiences: ROUTE_EXPERIENCES,
    experienceTypeLabels: EXPERIENCE_TYPE_LABEL,
    experienceAccessLabels: ACCESS_LABEL,
  }),

  /** Reference logistics along the route — resupply and public transport. */
  logistics: Object.freeze({
    shops: SHOP_LOCATIONS,
    shopFactsVerifiedOn: SHOP_FACTS_VERIFIED_ON,
    shopPriceReferenceYear: SHOP_PRICE_REFERENCE_YEAR,
    transport: TRANSPORT_ENTRIES,
    transportSections: TRANSPORT_SECTIONS,
    transportFactsVerifiedOn: TRANSPORT_FACTS_VERIFIED_ON,
    /** When the two bus timetables were last read in BOTH operator directions. */
    busTimetablesReverifiedOn: BUS_TIMETABLES_REVERIFIED_ON,
  }),

  /**
   * Where the dossier's claims come from. TRAIL-scoped only: the basemap,
   * satellite, terrain and software credits are app-scoped and stay in
   * src/data/attribution.ts.
   */
  sources: Object.freeze({
    data: TRAIL_DATA_SOURCES,
    tripInfo: TRIP_INFO_SOURCES,
  }),
});

/**
 * The dossier's shape, inferred from the descriptor itself.
 *
 * Deliberately inferred rather than hand-written: a declared interface would
 * be a second place to maintain, and it would invite optional fields for
 * trails that do not exist.
 */
export type ActiveTrailContent = typeof ACTIVE_TRAIL_CONTENT;

// ---------------------------------------------------------------------------
// Named access
//
// The same objects and their content helpers, for call sites that read one
// part of the dossier. These are re-exports, never wrappers: no argument is
// reinterpreted and no result is reshaped on the way through.
// ---------------------------------------------------------------------------

// Route, stages and waypoints
export {
  ROUTE,
  STAGES,
  STAGES_BY_ID,
  STAGE_TOPOLOGY,
  DEFAULT_STAGE_ID,
  WAYPOINT_BY_ID,
  HUT_TO_WAYPOINT,
  WAYPOINT_TO_HUT,
  stopIdForWaypoint,
};

// Places — route stops and curated off-route places
export {
  STOPS,
  STOPS_BY_ID,
  stopShortName,
  collapsedFacilities,
  collapsedFacilityList,
  importantAbsences,
  curatedOffRoutePlaces,
  journeyPlaceById,
  placeDisplayName,
  placeStayPrefill,
  staysLinkedToPlace,
};
export type {
  CuratedOffRoutePlace,
  JourneyPlace,
  PlaceStayPrefill,
  RouteStopPlace,
} from '../data/journeyPlaces.mjs';

// Editorial route content — guides, highlights, experiences
export {
  stageGuide,
  stageHighlights,
  combinedStageHighlights,
  ACCESS_LABEL,
  canViewOnMap,
  isBasecamp,
  isRouteWide,
  journeyPositionLabel,
  experienceCountForStage,
  stageHighlightsAndDetours,
  experienceTrack,
  experienceWaypoint,
};
export { TRAIL_CAVEATS };
export type { StageGuide } from '../data/stageGuides.mjs';
export type { StageHighlight, StageHighlightIcon } from '../data/stageHighlights.mjs';
export type { TrailCaveat, TrailCaveats } from '../data/trailCaveats.mjs';

// Reference logistics — shops and transport
export {
  SHOP_FACTS_VERIFIED_ON,
  SHOP_PRICE_REFERENCE_YEAR,
  VISIBLE_SHOP_CATEGORIES,
  FULL_SERVICE_SHOPS,
  STF_SHOP_OVERVIEW_SOURCE,
  STF_LARGE_PRICELIST_URL,
  STF_SMALL_PRICELIST_URL,
  assortmentByCategory,
  assortmentCounts,
  productsForSize,
  shopTypeForStop,
  TRANSPORT_ENTRIES,
  TRANSPORT_SECTIONS,
  entriesForContext,
  transportSectionsFor,
  timetableCoverageFor,
  timetablePeriodsFor,
  timetablePeriodProblems,
  timetableStatus,
  transportLinkForStop,
};
export type {
  StopTransportLink,
  TransportAssembly,
  ResolvedTransportSection,
} from '../data/transport.mjs';

// Publication identity and trail-scoped sources
export { TRAIL_CONTENT, trailDossierView, TRAIL_DATA_SOURCES, TRIP_INFO_SOURCES };
