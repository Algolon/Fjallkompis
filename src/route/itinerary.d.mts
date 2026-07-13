import type { ElevationSample, ParsedRoute } from './types';
import type { RouteDirection } from './direction.mjs';

/**
 * The active directional itinerary derived from the canonical route.
 * `route` is a fully oriented {@link ParsedRoute} (forward = the canonical
 * object unchanged) whose stages carry stable physical ids and direction-aware
 * `day` numbers, ready for MapView, elevation charts and progress projection.
 */
export interface DirectionalItinerary {
  direction: RouteDirection;
  /** Oriented ParsedRoute: stages in walking order, geometry correctly reversed. */
  route: ParsedRoute;
  /** Full-route elevation profile in walking order, starting at 0 km. */
  overviewElevationProfile: ElevationSample[];
  /** Physical stage ids ('d1'..'d7') in walking order. */
  stageOrder: string[];
  /** Stop (hut) ids in walking order. */
  stopOrder: string[];
  /** Waypoint ids in walking order. */
  waypointOrder: string[];
  startWaypointId: string | null;
  endWaypointId: string | null;
  startStopId: string | null;
  endStopId: string | null;
  /** Cumulative km at each waypoint, measured from the itinerary start. */
  waypointDistanceKm: Record<string, number>;
  /** Cumulative km at each stop, measured from the itinerary start. */
  stopDistanceKm: Record<string, number>;
}

export function buildDirectionalItinerary(
  route: ParsedRoute,
  direction: RouteDirection | string,
): DirectionalItinerary;
