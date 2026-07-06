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
 * GPX waypoint machine ids ↔ the app's existing hut ids. Personal hut notes
 * and shop overrides are keyed by hut id in localStorage, so this mapping is
 * what keeps them intact across route-data regenerations.
 */
export const WAYPOINT_TO_HUT: Record<string, string> = {
  START_ABISKO: 'abisko',
  HUT_ABISKOJAURE: 'abiskojaure',
  HUT_ALESJAURE: 'alesjaure',
  HUT_TJAKTJA: 'tjaktja',
  HUT_SALKA: 'salka',
  HUT_SINGI: 'singi',
  HUT_KEBNEKAISE: 'kebnekaise',
  END_NIKKALUOKTA: 'nikkaluokta',
};

export const HUT_TO_WAYPOINT: Record<string, string> = Object.fromEntries(
  Object.entries(WAYPOINT_TO_HUT).map(([w, h]) => [h, w]),
);

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
