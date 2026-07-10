/** Type surface of cameraBounds.mjs (plain ESM so node --test can fence it). */

export type Bounds = [[number, number], [number, number]];

export interface CameraConstraints {
  bounds: Bounds;
  overviewBounds: Bounds | null;
  zoomThreshold: number;
}

export function mercX(lon: number): number;
export function mercY(lat: number): number;
export function invMercX(x: number): number;
export function invMercY(y: number): number;
export function mercPerPixel(zoom: number): number;

export function cameraConstraintsFor(args: {
  userBounds: Bounds;
  routeBounds: Bounds;
  viewportWidth: number;
  viewportHeight: number;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
}): CameraConstraints;

export function activeBoundsForZoom(
  constraints: CameraConstraints,
  zoom: number,
  currentlyExpanded: boolean,
): { bounds: Bounds; expanded: boolean };

export const MIN_ZOOM_BACKSTOP: number;
