import geometryJson from '../generated/experience-geometry.json';
import type { LatLng } from '../types';

/**
 * Per-experience geometry parsed from owner-authored GPX at build time (see
 * scripts/generate-experience-geometry.mjs → src/generated/experience-geometry.json).
 * The GPX files are authoritative and unaltered; this is the derived, app-facing
 * view. Tracks are `[lat, lon]` pairs; waypoints are keyed by role.
 */
export interface ExperienceGeometry {
  sourceFile: string;
  waypoints: Record<string, { lat: number; lon: number; ele: number }>;
  trackRole?: string;
  /** `[lat, lon]` pairs (as imported from the generated JSON). */
  track?: number[][];
  roundTripKm?: number;
  elevationGainM?: number;
}

const GEOMETRY = geometryJson as Record<string, ExperienceGeometry>;

export function experienceGeometry(id: string): ExperienceGeometry | undefined {
  return GEOMETRY[id];
}

/** Track as LatLng[] ({lat,lng}) for the map, or undefined. */
export function experienceTrack(id: string): LatLng[] | undefined {
  return GEOMETRY[id]?.track?.map(([lat, lon]) => ({ lat, lng: lon }));
}

/** A named waypoint (by role) as LatLng, or undefined. */
export function experienceWaypoint(id: string, role: string): LatLng | undefined {
  const w = GEOMETRY[id]?.waypoints[role];
  return w ? { lat: w.lat, lng: w.lon } : undefined;
}
