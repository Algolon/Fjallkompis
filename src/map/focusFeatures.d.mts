import type { FeatureCollection } from 'geojson';
import type { LatLng } from '../types';

export interface FocusRoute {
  /** Existing single-track focus (owner GPX detours). */
  track?: LatLng[];
  /** Verified, separately rendered walking legs for a full planned day. */
  tracks?: LatLng[][];
  start: LatLng | null;
  destination?: LatLng | null;
}

/**
 * One LineString per supplied track + start/destination points. No synthetic
 * connectors, intermediate-vertex points or duplicate out-and-back finish.
 */
export declare function buildFocusFeatures(route: FocusRoute): FeatureCollection;
