/**
 * Canonical GPX-derived route model.
 * Data originates from scripts/generate-route-data.mjs (build-time) and is
 * hydrated in src/route/routeData.ts. Nothing here is hand-entered geometry.
 */

export interface RoutePoint {
  lat: number;
  lon: number;
  /** Raw GPX elevation in metres; null if the point had no <ele>. */
  elevation: number | null;
  /** Haversine distance from the start of this geometry, in km. */
  cumulativeDistanceKm: number;
}

export interface RouteWaypoint {
  /** Stable machine id from GPX cmt/desc, e.g. HUT_SALKA. */
  id: string;
  /** Display name from GPX <name>. */
  name: string;
  description?: string;
  symbol?: string;
  lat: number;
  lon: number;
  elevation: number | null;
}

export interface ElevationSample {
  distanceKm: number;
  elevationM: number;
  lat: number;
  lon: number;
}

export interface RouteStatistics {
  distanceKm: number;
  minimumElevationM: number | null;
  maximumElevationM: number | null;
  /** From the smoothed profile (see generator docs) — not raw jitter. */
  totalAscentM: number | null;
  totalDescentM: number | null;
}

/** [[west, south], [east, north]] — MapLibre LngLatBoundsLike. */
export type RouteBounds = [[number, number], [number, number]];

export interface LineStringFeature {
  type: 'Feature';
  properties: Record<string, string | number>;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

export interface RouteStage {
  /** Matches the app's stage ids (d1..d7) so persisted state keeps working. */
  id: string;
  day: number;
  fromWaypointId: string;
  toWaypointId: string;
  points: RoutePoint[];
  geoJson: LineStringFeature;
  bounds: RouteBounds;
  statistics: RouteStatistics;
  elevationProfile: ElevationSample[];
}

export interface ParsedRoute {
  name: string;
  overviewPoints: RoutePoint[];
  overviewGeoJson: LineStringFeature;
  stages: RouteStage[];
  waypoints: RouteWaypoint[];
  bounds: RouteBounds;
  statistics: RouteStatistics;
  /** Route bounds + buffer; the offline basemap cutout should cover this. */
  mapCutoutBounds: RouteBounds;
}
