/** Type surface of cameraBounds.mjs (plain ESM so node --test can fence it). */

export type Bounds = [[number, number], [number, number]];

export interface CameraConstraints {
  /** Interaction bounds: the strict rectangle of regular map use. */
  interactionBounds: Bounds;
  /** Overview bounds: wide-viewport overview widening (null: not needed). */
  overviewBounds: Bounds | null;
  zoomThreshold: number;
}

export function mercX(lon: number): number;
export function mercY(lat: number): number;
export function invMercX(x: number): number;
export function invMercY(y: number): number;
export function mercPerPixel(zoom: number): number;

export const TERRAIN_MIN_ZOOM: number;

/** Physical overview envelope: z7 tile-aligned data footprint, − 2 km. */
export function overviewEnvelope(dataBounds: Bounds): Bounds;

export function cameraConstraintsFor(args: {
  userBounds: Bounds;
  routeBounds: Bounds;
  /** mapCutoutBounds — caps the overview expansion to real terrain. */
  dataBounds?: Bounds;
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
