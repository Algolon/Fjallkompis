/**
 * The canonical Kungsleden route dataset: hydrates the build-time generated
 * route JSON into the typed ParsedRoute model via the shared hydration in
 * src/route/hydrate.ts. Runs once at module load (~10k small array
 * allocations, negligible).
 */
import generated from '../generated/kungsleden-route.json';
import { hydrateRoute, toProfile, type GeneratedRoute } from './hydrate';
import type { ParsedRoute, RouteStage, RouteWaypoint } from './types';

const raw = generated as unknown as GeneratedRoute;

export const ROUTE: ParsedRoute = hydrateRoute(raw);

export const ROUTE_DIAGNOSTICS = raw.diagnostics;

/** Full-resolution elevation profile of the complete overview route. */
export const OVERVIEW_ELEVATION_PROFILE = toProfile(ROUTE.overviewPoints);

export const STAGE_BY_ID: Record<string, RouteStage> = Object.fromEntries(
  ROUTE.stages.map((s) => [s.id, s]),
);

export const WAYPOINT_BY_ID: Record<string, RouteWaypoint> = Object.fromEntries(
  ROUTE.waypoints.map((w) => [w.id, w]),
);

/**
 * GPX waypoint machine ids ↔ the app's existing hut ids. Lives in the plain
 * waypointStops.mjs module (node --test validates it against the generated
 * dataset); re-exported here so app code keeps one route-data entry point.
 */
export { WAYPOINT_TO_HUT, HUT_TO_WAYPOINT, stopIdForWaypoint } from './waypointStops.mjs';

/** Cumulative km into the total route at which each waypoint is reached. */
export const WAYPOINT_ROUTE_KM: Record<string, number> = (() => {
  const km: Record<string, number> = {};
  let cum = 0;
  for (const stage of ROUTE.stages) {
    km[stage.fromWaypointId] ??= cum;
    cum += stage.statistics.distanceKm;
    km[stage.toWaypointId] = cum;
  }
  return km;
})();

/** Stages that arrive at / depart from a waypoint. */
export function stagesForWaypoint(waypointId: string): {
  arriving: RouteStage | null;
  departing: RouteStage | null;
} {
  return {
    arriving: ROUTE.stages.find((s) => s.toWaypointId === waypointId) ?? null,
    departing: ROUTE.stages.find((s) => s.fromWaypointId === waypointId) ?? null,
  };
}
