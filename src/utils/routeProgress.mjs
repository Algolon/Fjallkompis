/**
 * Pure route-progress projection.
 *
 * Projects a single query coordinate (a one-shot GPS fix, or a manually
 * pinned stop) onto a stage polyline and reports how far along that stage the
 * hiker is. Dependency-light on purpose: no Turf, no geospatial package — just
 * a local equirectangular ("flat-earth") approximation, which is more than
 * accurate enough at the ~100 km / 68°N scale of the Kungsleden.
 *
 * Authored as plain ESM (with a sibling .d.mts declaration) so the *same*
 * implementation is imported by both the app (src/screens/MapScreen.tsx) and
 * the Node test runner (tests/route-progress.test.mjs). Mirrors the existing
 * stateMigration.mjs / .d.mts convention — the algorithm is never copied into
 * a test-only variant.
 *
 * Route data (per-stage cumulativeDistanceKm starting at 0) is never mutated.
 */

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Reliability threshold, in metres, for accepting a projection as a genuine
 * "you are here on this stage" match.
 *
 * The rule is `max(MIN, MULTIPLIER × reportedAccuracy)`:
 *
 *  - MIN (75 m) is a fixed floor that absorbs route generalisation and
 *    legitimately-off-the-line walking. The GPX is sampled every ~30–50 m on
 *    average but with occasional straight segments up to ~275 m; a hiker on
 *    the true (curved) trail can sit a few tens of metres off that chord, and
 *    braided/parallel paths add more. 75 m covers this without waving through
 *    a genuinely wrong position.
 *  - The accuracy term widens the gate when the fix itself is imprecise: a fix
 *    reported at ±A m can plausibly be a few × A from the truth, so a large
 *    cross-track distance is not evidence of being off-route when A is large.
 *
 * Deliberately conservative: better to qualify/reject a borderline match than
 * to show a confident-but-wrong percentage. Manual pins carry no accuracy, so
 * they fall back to the MIN floor.
 */
export const ROUTE_MATCH_MIN_TOLERANCE_M = 75;
export const ROUTE_MATCH_ACCURACY_MULTIPLIER = 3;

/** Cross-track tolerance in metres for a given reported GPS accuracy (m). */
export function routeMatchToleranceM(accuracyM) {
  const acc = Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : 0;
  return Math.max(ROUTE_MATCH_MIN_TOLERANCE_M, ROUTE_MATCH_ACCURACY_MULTIPLIER * acc);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);

const validPoint = (p) => p != null && isFiniteNum(p.lat) && isFiniteNum(p.lon);

/**
 * Local metric projection around a reference latitude. Equirectangular:
 * longitude is scaled by cos(lat0) so x and y share one metric scale. Stable
 * and cheap over a single trail; only relative distances are used.
 */
function toMetric(lat, lon, lat0) {
  return {
    x: toRad(lon) * Math.cos(toRad(lat0)) * EARTH_RADIUS_M,
    y: toRad(lat) * EARTH_RADIUS_M,
  };
}

function emptyResult(toleranceM) {
  return {
    ok: false,
    projected: null,
    segmentIndex: -1,
    segmentFraction: 0,
    distanceAlongKm: 0,
    distanceRemainingKm: 0,
    totalKm: 0,
    percent: 0,
    crossTrackM: Infinity,
    toleranceM,
    reliable: false,
  };
}

/** Total stage length = cumulative distance at the last finite-coordinate point. */
function totalStageKm(points) {
  for (let i = points.length - 1; i >= 0; i--) {
    const c = points[i]?.cumulativeDistanceKm;
    if (isFiniteNum(c)) return c;
  }
  return 0;
}

/**
 * Project `query` onto the `points` polyline.
 *
 * @param {ReadonlyArray<{lat:number, lon:number, cumulativeDistanceKm:number}>} points
 *   Full-resolution stage points; cumulativeDistanceKm starts at 0.
 * @param {{lat:number, lon?:number, lng?:number}} query  Query coordinate.
 * @param {{accuracyM?:number|null}} [options]  Reported GPS accuracy (metres).
 * @returns {import('./routeProgress.d.mts').RouteProjection}
 *
 * Handles empty/one-point polylines, zero-length segments, exact endpoints,
 * points before/after the stage (clamped), non-finite coordinates and
 * near-boundary fixes. Never mutates `points`.
 */
export function projectOntoRoute(points, query, options = {}) {
  const toleranceM = routeMatchToleranceM(options.accuracyM);

  const qlat = query ? query.lat : NaN;
  const qlon = query ? (query.lon != null ? query.lon : query.lng) : NaN;

  if (!Array.isArray(points) || points.length < 2) return emptyResult(toleranceM);
  if (!isFiniteNum(qlat) || !isFiniteNum(qlon)) return emptyResult(toleranceM);

  const lat0 = qlat;
  const q = toMetric(qlat, qlon, lat0);
  const totalKm = totalStageKm(points);

  let best = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!validPoint(a) || !validPoint(b)) continue;

    const A = toMetric(a.lat, a.lon, lat0);
    const B = toMetric(b.lat, b.lon, lat0);
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const lenSq = dx * dx + dy * dy;

    // Zero-length segment (duplicate points exist in the real GPX): the whole
    // segment collapses to point A, fraction 0, no divide-by-zero.
    let t = 0;
    if (lenSq > 0) {
      t = clamp(((q.x - A.x) * dx + (q.y - A.y) * dy) / lenSq, 0, 1);
    }

    const px = A.x + t * dx;
    const py = A.y + t * dy;
    const ex = q.x - px;
    const ey = q.y - py;
    const distSq = ex * ex + ey * ey;

    if (best === null || distSq < best.distSq) {
      const cumA = isFiniteNum(a.cumulativeDistanceKm) ? a.cumulativeDistanceKm : 0;
      const cumB = isFiniteNum(b.cumulativeDistanceKm) ? b.cumulativeDistanceKm : cumA;
      best = {
        distSq,
        segmentIndex: i,
        segmentFraction: t,
        distanceAlongKm: cumA + t * (cumB - cumA),
        projected: {
          lat: a.lat + t * (b.lat - a.lat),
          lon: a.lon + t * (b.lon - a.lon),
        },
      };
    }
  }

  if (best === null) return emptyResult(toleranceM);

  const crossTrackM = Math.sqrt(best.distSq);
  const distanceAlongKm = clamp(best.distanceAlongKm, 0, totalKm);
  const distanceRemainingKm = Math.max(0, totalKm - distanceAlongKm);
  const percent = totalKm > 0 ? clamp((distanceAlongKm / totalKm) * 100, 0, 100) : 0;

  return {
    ok: true,
    projected: best.projected,
    segmentIndex: best.segmentIndex,
    segmentFraction: best.segmentFraction,
    distanceAlongKm,
    distanceRemainingKm,
    totalKm,
    percent,
    crossTrackM,
    toleranceM,
    reliable: crossTrackM <= toleranceM,
  };
}
