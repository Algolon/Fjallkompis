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
 * Coordinate at a CANONICAL 0..1 progress along a physical stage (d1..d7),
 * interpolated on the real route line (never invented). Uses the canonical
 * ROUTE geometry, so the point is direction-independent — it's the same spot on
 * the ground whichever way the hiker walks. Used by the "View on map" focus.
 */
export function coordAtStageProgress(
  stageId: string,
  progress: number,
): { lat: number; lon: number } | null {
  const stage = STAGE_BY_ID[stageId];
  if (!stage || stage.points.length === 0) return null;
  const pts = stage.points;
  const total = pts[pts.length - 1].cumulativeDistanceKm;
  const target = Math.max(0, Math.min(1, progress)) * total;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (target <= b.cumulativeDistanceKm) {
      const span = b.cumulativeDistanceKm - a.cumulativeDistanceKm;
      const t = span > 0 ? (target - a.cumulativeDistanceKm) / span : 0;
      return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
    }
  }
  const last = pts[pts.length - 1];
  return { lat: last.lat, lon: last.lon };
}

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
