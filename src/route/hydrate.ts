/**
 * Shared hydration of build-time generated route JSON (see
 * scripts/generate-route-data.mjs) into the typed ParsedRoute model. Used by
 * the canonical Kungsleden dataset (src/route/routeData.ts) and the temporary
 * Delft pilot dataset (src/route/delftPilot.ts).
 *
 * GeoJSON features and elevation profiles are derived here from the full-
 * resolution points; any chart downsampling happens strictly at render time
 * and never feeds back into distances or statistics.
 */
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
export type PackedPoint = [number, number, number | null, number];

export interface GeneratedStage {
  id: string;
  day: number;
  fromWaypointId: string;
  toWaypointId: string;
  points: PackedPoint[];
  bounds: RouteBounds;
  statistics: RouteStatistics;
}

export interface GeneratedRoute {
  name: string;
  waypoints: RouteWaypoint[];
  overview: { points: PackedPoint[]; bounds: RouteBounds; statistics: RouteStatistics };
  stages: GeneratedStage[];
  bounds: RouteBounds;
  statistics: RouteStatistics;
  mapCutoutBounds: RouteBounds;
  diagnostics: Record<string, unknown>;
}

/**
 * Stub emitted by the generator when an OPTIONAL route's GPX does not exist
 * yet (e.g. the Delft pilot before its GPX is produced).
 */
export interface MissingRouteStub {
  available: false;
  routeId: string;
  note: string;
}

export const isMissingRouteStub = (raw: unknown): raw is MissingRouteStub =>
  typeof raw === 'object' &&
  raw !== null &&
  (raw as { available?: unknown }).available === false;

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

export const toProfile = (points: RoutePoint[]): ElevationSample[] =>
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

export function hydrateRoute(raw: GeneratedRoute): ParsedRoute {
  const overviewPoints = unpack(raw.overview.points);
  return {
    name: raw.name,
    overviewPoints,
    overviewGeoJson: toLineString(overviewPoints, { role: 'overview' }),
    stages: raw.stages.map(hydrateStage),
    waypoints: raw.waypoints,
    bounds: raw.bounds,
    statistics: raw.statistics,
    mapCutoutBounds: raw.mapCutoutBounds,
  };
}
