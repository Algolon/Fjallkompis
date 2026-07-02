/**
 * Hydrates the build-time generated route JSON into the typed ParsedRoute
 * model. Runs once at module load (~10k small array allocations, negligible).
 *
 * GeoJSON features and elevation profiles are derived here from the full-
 * resolution points; any chart downsampling happens strictly at render time
 * and never feeds back into distances or statistics.
 */
import generated from '../generated/kungsleden-route.json';
import type {
  ElevationSample,
  LineStringFeature,
  ParsedRoute,
  RoutePoint,
  RouteStage,
  RouteStatistics,
  RouteBounds,
  RouteWaypoint,
} from './types';

/** Compact generated encoding: [lat, lon, elevationM|null, cumulativeKm]. */
type PackedPoint = [number, number, number | null, number];

interface GeneratedStage {
  id: string;
  day: number;
  fromWaypointId: string;
  toWaypointId: string;
  points: PackedPoint[];
  bounds: RouteBounds;
  statistics: RouteStatistics;
}

interface GeneratedRoute {
  name: string;
  waypoints: RouteWaypoint[];
  overview: { points: PackedPoint[]; bounds: RouteBounds; statistics: RouteStatistics };
  stages: GeneratedStage[];
  bounds: RouteBounds;
  statistics: RouteStatistics;
  mapCutoutBounds: RouteBounds;
  diagnostics: Record<string, unknown>;
}

const raw = generated as unknown as GeneratedRoute;

const unpack = (pts: PackedPoint[]): RoutePoint[] =>
  pts.map(([lat, lon, elevation, cumulativeDistanceKm]) => ({
    lat,
    lon,
    elevation,
    cumulativeDistanceKm,
  }));

const toLineString = (
  points: RoutePoint[],
  properties: Record<string, string | number>,
): LineStringFeature => ({
  type: 'Feature',
  properties,
  geometry: {
    type: 'LineString',
    coordinates: points.map((p) => [p.lon, p.lat]),
  },
});

const toProfile = (points: RoutePoint[]): ElevationSample[] =>
  points
    .filter((p) => p.elevation != null)
    .map((p) => ({
      distanceKm: p.cumulativeDistanceKm,
      elevationM: p.elevation as number,
      lat: p.lat,
      lon: p.lon,
    }));

function hydrateStage(g: GeneratedStage): RouteStage {
  const points = unpack(g.points);
  return {
    id: g.id,
    day: g.day,
    fromWaypointId: g.fromWaypointId,
    toWaypointId: g.toWaypointId,
    points,
    geoJson: toLineString(points, { stageId: g.id, day: g.day }),
    bounds: g.bounds,
    statistics: g.statistics,
    elevationProfile: toProfile(points),
  };
}

const overviewPoints = unpack(raw.overview.points);

export const ROUTE: ParsedRoute = {
  name: raw.name,
  overviewPoints,
  overviewGeoJson: toLineString(overviewPoints, { role: 'overview' }),
  stages: raw.stages.map(hydrateStage),
  waypoints: raw.waypoints,
  bounds: raw.bounds,
  statistics: raw.statistics,
  mapCutoutBounds: raw.mapCutoutBounds,
};

export const ROUTE_DIAGNOSTICS = raw.diagnostics;

/** Full-resolution elevation profile of the complete overview route. */
export const OVERVIEW_ELEVATION_PROFILE = toProfile(overviewPoints);

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
