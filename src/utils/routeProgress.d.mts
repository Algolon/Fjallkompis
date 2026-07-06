/** TypeScript surface for the plain-ESM route-progress projection. */

export interface RoutePointLike {
  lat: number;
  lon: number;
  cumulativeDistanceKm: number;
}

export interface RouteQuery {
  lat: number;
  /** Either `lon` (route convention) or `lng` (app LatLng) is accepted. */
  lon?: number;
  lng?: number;
}

export interface RouteProjectionOptions {
  /** Reported GPS accuracy in metres; null/absent for manual pins. */
  accuracyM?: number | null;
}

export interface RouteProjection {
  /** False when the polyline had < 2 usable points or the query was invalid. */
  ok: boolean;
  /** Closest point on the route line, or null when `ok` is false. */
  projected: { lat: number; lon: number } | null;
  /** Index of the segment start point the match landed on (−1 when none). */
  segmentIndex: number;
  /** Clamped 0–1 position within the matched segment. */
  segmentFraction: number;
  /** Distance from the stage start to the projected point, km (clamped ≥ 0). */
  distanceAlongKm: number;
  /** Distance from the projected point to the stage end, km (clamped ≥ 0). */
  distanceRemainingKm: number;
  /** Total stage length, km. */
  totalKm: number;
  /** Completion percentage, clamped to 0–100. */
  percent: number;
  /** Perpendicular distance from the query to the route line, metres. */
  crossTrackM: number;
  /** Reliability tolerance applied to `crossTrackM`, metres. */
  toleranceM: number;
  /** True when `crossTrackM` ≤ `toleranceM`. */
  reliable: boolean;
}

export const ROUTE_MATCH_MIN_TOLERANCE_M: number;
export const ROUTE_MATCH_ACCURACY_MULTIPLIER: number;

export function routeMatchToleranceM(accuracyM: number | null | undefined): number;

export function projectOntoRoute(
  points: ReadonlyArray<RoutePointLike>,
  query: RouteQuery,
  options?: RouteProjectionOptions,
): RouteProjection;
