import type { LatLng } from '../types';

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points, in kilometres (Haversine).
 * Accurate enough for trail-scale "how far to the next hut" estimates.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total path length in km along an ordered list of points. */
export function pathLengthKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Equirectangular projection for the offline route map.
//
// We deliberately avoid a tile-based map. For a small region this simple
// projection is robust and dependency-free. Longitude is scaled by cos(lat)
// so the route keeps a correct aspect ratio at ~68°N (cos 68° ≈ 0.37),
// otherwise the route would look horizontally stretched.
// ---------------------------------------------------------------------------

export interface ProjectionViewport {
  width: number;
  height: number;
  padding: number;
}

export interface Projector {
  project: (p: LatLng) => { x: number; y: number };
}

/**
 * Build a projector that fits all `points` into the viewport with padding.
 * Guards against a zero-span bounding box (single point / identical coords).
 */
export function createFitProjector(
  points: LatLng[],
  vp: ProjectionViewport,
): Projector {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const midLatRad = toRad((minLat + maxLat) / 2);
  const lngScale = Math.cos(midLatRad) || 1; // longitude compression factor

  // Project to an intermediate "equirect" space first.
  const ex = (lng: number) => lng * lngScale;
  const ey = (lat: number) => -lat; // negate so north is up on screen

  const exMin = ex(minLng);
  const exMax = ex(maxLng);
  const eyMin = ey(maxLat); // top
  const eyMax = ey(minLat); // bottom

  const spanX = exMax - exMin || 1e-6;
  const spanY = eyMax - eyMin || 1e-6;

  const innerW = vp.width - vp.padding * 2;
  const innerH = vp.height - vp.padding * 2;

  // Uniform scale to preserve shape; center within the viewport.
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = vp.padding + (innerW - drawW) / 2;
  const offsetY = vp.padding + (innerH - drawH) / 2;

  return {
    project(p: LatLng) {
      return {
        x: offsetX + (ex(p.lng) - exMin) * scale,
        y: offsetY + (ey(p.lat) - eyMin) * scale,
      };
    },
  };
}
