/**
 * The active directional itinerary, enriched for the app.
 *
 * The pure geometry/order transform lives in src/route/itinerary.mjs (fully
 * tested in Node). This thin TypeScript layer wraps it and merges the editorial
 * that a GPX cannot know — direction-aware stage notes and the (approximate)
 * walking-time estimates — plus the ordered curated stops. It is the single
 * authoritative active-itinerary surface every screen and store selector reads:
 * no screen reverses route data itself.
 *
 * Memoised per direction (there are only two), so switching direction rebuilds
 * once, not on every render, and the canonical route data is never mutated.
 * The derived itinerary is NEVER persisted — only the selected direction is.
 */
import { ROUTE } from './routeData';
import { WAYPOINT_TO_HUT } from './waypointStops.mjs';
import { buildDirectionalItinerary } from './itinerary.mjs';
import type { DirectionalItinerary } from './itinerary.mjs';
import { DEFAULT_DIRECTION, normalizeDirection } from './direction.mjs';
import type { RouteDirection } from './direction.mjs';
import { stageEstimatedHours, stageNote } from '../data/stageEditorial.mjs';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import type {
  ElevationSample,
  LineStringFeature,
  ParsedRoute,
  RouteBounds,
  RoutePoint,
  RouteStatistics,
} from './types';
import type { Stage, TrailStop } from '../types';

/**
 * A stage in the active itinerary: the editorial {@link Stage} fields merged
 * with the correctly oriented geometry, so screens read one object for both
 * the day card and its elevation chart / map line. `id` is the stable physical
 * segment id; `day` is the itinerary day for the selected direction.
 */
export interface ItineraryStage extends Stage {
  points: RoutePoint[];
  geoJson: LineStringFeature;
  bounds: RouteBounds;
  statistics: RouteStatistics;
  elevationProfile: ElevationSample[];
}

export interface ActiveItinerary {
  direction: RouteDirection;
  /** Oriented ParsedRoute for MapView (stable ids, direction-aware day). */
  route: ParsedRoute;
  /** Geometry route name (direction-independent). */
  routeName: string;
  /** Direction-aware display name, e.g. "Abisko → Nikkaluokta". */
  displayName: string;
  startStopId: string | null;
  endStopId: string | null;
  /** Stages in walking order (day = itinerary day 1..7). */
  stages: ItineraryStage[];
  /** Lookup by STABLE physical segment id ('d1'..'d7'). */
  stageById: Record<string, ItineraryStage>;
  /** Curated stops in walking order. */
  orderedStops: TrailStop[];
  /** Cumulative km at each stop, measured from the itinerary start. */
  stopDistanceKm: Record<string, number>;
  /** Full-route elevation profile in walking order, starting at 0 km. */
  overviewElevationProfile: ElevationSample[];
  /** Oriented full-route statistics (ascent/descent follow the direction). */
  statistics: RouteStatistics;
}

function enrich(base: DirectionalItinerary): ActiveItinerary {
  const direction = base.direction;
  const stages: ItineraryStage[] = base.route.stages.map((s) => ({
    id: s.id,
    day: s.day,
    fromHutId: WAYPOINT_TO_HUT[s.fromWaypointId],
    toHutId: WAYPOINT_TO_HUT[s.toWaypointId],
    distanceKm: s.statistics.distanceKm,
    estimatedHours: stageEstimatedHours(s.id),
    notes: stageNote(s.id, direction),
    totalAscentM: s.statistics.totalAscentM,
    totalDescentM: s.statistics.totalDescentM,
    minimumElevationM: s.statistics.minimumElevationM,
    maximumElevationM: s.statistics.maximumElevationM,
    points: s.points,
    geoJson: s.geoJson,
    bounds: s.bounds,
    statistics: s.statistics,
    elevationProfile: s.elevationProfile,
  }));

  const stageById: Record<string, ItineraryStage> = Object.fromEntries(
    stages.map((s) => [s.id, s]),
  );

  const orderedStops = base.stopOrder
    .map((id) => STOPS_BY_ID[id])
    .filter((s): s is TrailStop => s != null);

  const startStop = base.startStopId ? STOPS_BY_ID[base.startStopId] : null;
  const endStop = base.endStopId ? STOPS_BY_ID[base.endStopId] : null;
  const displayName =
    startStop && endStop
      ? `${stopShortName(startStop)} → ${stopShortName(endStop)}`
      : base.route.name;

  return {
    direction,
    route: base.route,
    routeName: base.route.name,
    displayName,
    startStopId: base.startStopId,
    endStopId: base.endStopId,
    stages,
    stageById,
    orderedStops,
    stopDistanceKm: base.stopDistanceKm,
    overviewElevationProfile: base.overviewElevationProfile,
    statistics: base.route.statistics,
  };
}

const CACHE = new Map<RouteDirection, ActiveItinerary>();

/**
 * The active itinerary for a direction, built from the canonical ROUTE and
 * memoised (two directions max). Unknown/invalid directions normalise to the
 * canonical default.
 */
export function getActiveItinerary(direction: RouteDirection | string): ActiveItinerary {
  const dir = normalizeDirection(direction);
  const cached = CACHE.get(dir);
  if (cached) return cached;
  const built = enrich(buildDirectionalItinerary(ROUTE, dir));
  CACHE.set(dir, built);
  return built;
}

/** Convenience: the canonical forward itinerary. */
export function forwardItinerary(): ActiveItinerary {
  return getActiveItinerary(DEFAULT_DIRECTION);
}
