import type { FeatureCollection } from 'geojson';
import type { LatLng } from '../types';

export interface FocusRoute {
  track: LatLng[];
  start: LatLng | null;
  destination?: LatLng | null;
}

/**
 * One LineString for the track + a `start` Point and (when distinct) a
 * `destination` Point. No intermediate-vertex points; no duplicate finish
 * marker for an out-and-back route.
 */
export declare function buildFocusFeatures(route: FocusRoute): FeatureCollection;
