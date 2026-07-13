/**
 * The active-itinerary transformation layer.
 *
 * The canonical GPX-derived route (src/route/routeData.ts) is authoritative and
 * is stored ONCE, north-to-south (Abisko → Nikkaluokta). This module is the one
 * pure, tested place that derives the active directional itinerary from that
 * canonical route and the selected {@link RouteDirection}. Screens and store
 * selectors consume the active itinerary — no screen ever reverses route data
 * itself (see docs/decisions/0003-route-direction.md).
 *
 * Physical identity vs itinerary order
 * ------------------------------------
 * Each physical segment keeps its STABLE id ('d1'..'d7' — the north-to-south
 * generation order). The itinerary DAY is derived from the walking direction:
 *  - forward:  d1..d7 appear as Day 1..7;
 *  - reverse:  d7 becomes Day 1, d6 Day 2, … d1 Day 7.
 * Persisted current-stage state, Map selection and deep links all key on the
 * stable id; the UI always shows the itinerary day, never the raw id.
 *
 * Reverse geometry (correctly oriented, never "100 − percent")
 * ------------------------------------------------------------
 * For the reverse direction every stage and the overview are re-oriented:
 *  - point order reversed (lat/lon/elevation preserved);
 *  - cumulativeDistanceKm rebuilt from 0 by MIRRORING the canonical cumulative
 *    values (total − cum) — this reuses the generator's verified distances,
 *    never a recomputation from raw coordinate jitter;
 *  - direction-dependent GeoJSON rebuilt from the reversed points;
 *  - bounds preserved (direction-independent);
 *  - statistics reuse the canonical verified figures with ascent/descent
 *    SWAPPED (walking a segment backwards climbs what it descended) — distance
 *    and elevation extremes are unchanged. The existing projection logic then
 *    calculates progress against this correctly oriented geometry.
 *
 * Canonical inputs are never mutated: forward returns the canonical objects
 * unchanged (identity); reverse allocates fresh arrays via copy-then-map.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so node --test exercises the
 * transform directly (tests/itinerary.test.mjs) — the same convention as
 * routeProgress.mjs / stateMigration.mjs.
 */
import { WAYPOINT_TO_HUT } from './waypointStops.mjs';
import { isReversed, normalizeDirection } from './direction.mjs';

/** GeoJSON LineString from ordered points (mirrors src/route/hydrate.ts). */
function toLineString(points, properties) {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'LineString',
      coordinates: points.map((p) => [p.lon, p.lat]),
    },
  };
}

/** Elevation samples from ordered points (mirrors src/route/hydrate.ts). */
function toProfile(points) {
  return points
    .filter((p) => p.elevation != null)
    .map((p) => ({
      distanceKm: p.cumulativeDistanceKm,
      elevationM: p.elevation,
      lat: p.lat,
      lon: p.lon,
    }));
}

/** Total length of a geometry = cumulative distance at its last point. */
function totalKm(points) {
  return points.length ? points[points.length - 1].cumulativeDistanceKm : 0;
}

/**
 * Reverse a point array, rebuilding cumulativeDistanceKm from 0 by mirroring
 * the canonical values. Returns a fresh array; the source is not mutated.
 */
function reversePoints(points) {
  const total = totalKm(points);
  const out = new Array(points.length);
  for (let i = points.length - 1, j = 0; i >= 0; i--, j++) {
    const p = points[i];
    out[j] = {
      lat: p.lat,
      lon: p.lon,
      elevation: p.elevation,
      // total − cum mirrors the verified distance; equals 0 at the new start
      // and `total` at the new end, and stays monotonically increasing.
      cumulativeDistanceKm: total - p.cumulativeDistanceKm,
    };
  }
  return out;
}

/** Statistics with ascent/descent swapped; distance and extremes unchanged. */
function swapAscentDescent(statistics) {
  return {
    distanceKm: statistics.distanceKm,
    minimumElevationM: statistics.minimumElevationM,
    maximumElevationM: statistics.maximumElevationM,
    totalAscentM: statistics.totalDescentM,
    totalDescentM: statistics.totalAscentM,
  };
}

/** Re-orient one physical stage for the reverse direction. */
function reverseStage(stage, itineraryDay) {
  const points = reversePoints(stage.points);
  return {
    // Stable physical identity is preserved; only the itinerary day changes.
    id: stage.id,
    day: itineraryDay,
    fromWaypointId: stage.toWaypointId,
    toWaypointId: stage.fromWaypointId,
    points,
    geoJson: toLineString(points, { stageId: stage.id, day: itineraryDay }),
    bounds: stage.bounds,
    statistics: swapAscentDescent(stage.statistics),
    elevationProfile: toProfile(points),
  };
}

/**
 * Cumulative km at which each waypoint is reached, measured from the itinerary
 * START, by walking the ordered stages. Keyed by both waypoint id and stop
 * (hut) id so callers on either side of the mapping can look it up.
 */
function waypointAndStopDistances(orderedStages) {
  const byWaypoint = {};
  const byStop = {};
  let cum = 0;
  const set = (waypointId, km) => {
    byWaypoint[waypointId] = km;
    const stopId = WAYPOINT_TO_HUT[waypointId];
    if (stopId != null) byStop[stopId] = km;
  };
  for (const stage of orderedStages) {
    if (byWaypoint[stage.fromWaypointId] == null) set(stage.fromWaypointId, cum);
    cum += stage.statistics.distanceKm;
    set(stage.toWaypointId, cum);
  }
  return { byWaypoint, byStop };
}

/**
 * Build the active directional itinerary from the canonical route.
 *
 * @param {import('./types').ParsedRoute} route  The canonical (forward) route.
 * @param {import('./direction.mjs').RouteDirection} direction
 * @returns {import('./itinerary.mjs').DirectionalItinerary}
 */
export function buildDirectionalItinerary(route, direction) {
  const dir = normalizeDirection(direction);

  // Forward: the canonical route IS the active itinerary — return it unchanged
  // (identity), so there is nothing to reverse and nothing to allocate.
  const orientedRoute = isReversed(dir)
    ? reverseRouteGeometry(route)
    : route;

  const orderedStages = orientedRoute.stages;
  const stageOrder = orderedStages.map((s) => s.id);
  const stopOrder = orientedRoute.waypoints.map((w) => WAYPOINT_TO_HUT[w.id]);
  const waypointOrder = orientedRoute.waypoints.map((w) => w.id);
  const { byWaypoint, byStop } = waypointAndStopDistances(orderedStages);

  const startWaypointId = waypointOrder[0] ?? null;
  const endWaypointId = waypointOrder[waypointOrder.length - 1] ?? null;

  return {
    direction: dir,
    route: orientedRoute,
    overviewElevationProfile: toProfile(orientedRoute.overviewPoints),
    stageOrder,
    stopOrder,
    waypointOrder,
    startWaypointId,
    endWaypointId,
    startStopId: startWaypointId != null ? WAYPOINT_TO_HUT[startWaypointId] : null,
    endStopId: endWaypointId != null ? WAYPOINT_TO_HUT[endWaypointId] : null,
    waypointDistanceKm: byWaypoint,
    stopDistanceKm: byStop,
  };
}

/**
 * Reverse the whole route geometry: stage order + endpoints + points + stats,
 * plus the overview and full-route statistics. Waypoints, bounds and cutout
 * bounds are direction-independent and pass through unchanged.
 */
function reverseRouteGeometry(route) {
  // Reverse a COPY of the stage array (never the shared canonical array), then
  // assign itinerary days 1..N in the new walking order.
  const reversedStages = [...route.stages]
    .reverse()
    .map((stage, i) => reverseStage(stage, i + 1));

  const overviewPoints = reversePoints(route.overviewPoints);

  return {
    name: route.name,
    overviewPoints,
    overviewGeoJson: toLineString(overviewPoints, { role: 'overview' }),
    stages: reversedStages,
    // Waypoints stay in their canonical (north→south) array order; the
    // itinerary exposes walking order via waypointOrder/stopOrder. Reversing
    // here as well keeps map markers and the ParsedRoute self-consistent for
    // any consumer that iterates route.waypoints directly.
    waypoints: [...route.waypoints].reverse(),
    bounds: route.bounds,
    statistics: swapAscentDescent(route.statistics),
    userBounds: route.userBounds,
    mapCutoutBounds: route.mapCutoutBounds,
  };
}
