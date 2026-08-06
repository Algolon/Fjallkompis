/** Type surface of overviewEnvelope.mjs (plain ESM so node --test can fence it). */

export type Bounds = [[number, number], [number, number]];

/** A lon/lat extent in degrees. */
export interface Extent {
  west: number;
  east: number;
  south: number;
  north: number;
}

export interface VectorOverviewBuild {
  /** Highest zoom that got the widened extract. */
  maxZoom: number;
  /** Extra longitude each side of mapCutoutBounds, degrees. */
  lonMarginDeg: number;
}

export interface DesiredOverview {
  /** Mercator metres per CSS pixel at the fit. */
  scale: number;
  mapZoom: number;
  centreX: number;
  centreY: number;
  routeCx: number;
  routeCy: number;
  halfWidth: number;
  halfHeight: number;
  bindingAxis: 'width' | 'height';
}

export interface OverviewEnvelope {
  /** floor(mapZoom) — the vector source zoom the overview actually renders. */
  sourceZoom: number;
  mapZoom: number;
  bindingAxis: 'width' | 'height';
  /** What the fit needs, before coverage is considered. */
  desiredOverview: Bounds;
  /** Physical vector coverage at `sourceZoom` — the hard cap. */
  vectorCoverage: Extent;
  /** Renderable terrain/satellite coverage — reported, never a cap. */
  rasterCoverage: Extent;
  halfWidths: { needed: number; vector: number; raster: number; applied: number };
  /** The composition needs more width than raster can shade. */
  exceedsRasterCoverage: boolean;
  /** Vector coverage forced a narrower view than the fit wanted. */
  cappedByVector: boolean;
  /** Safe overview maxBounds, or null when the strict bounds already fit. */
  overviewBounds: Bounds | null;
}

export const MERC_MAX: number;
export function mercX(lon: number): number;
export function mercY(lat: number): number;
export function invMercX(x: number): number;
export function invMercY(y: number): number;
export function mercPerPixel(zoom: number): number;

export const VECTOR_OVERVIEW_BUILD: VectorOverviewBuild;
export const RASTER_ARCHIVE_MIN_ZOOM: number;
export const OVERVIEW_SLACK: number;

export function tileAlignedFootprint(bounds: Bounds, z: number): Extent;
export function vectorSourceCoverage(
  sourceZoom: number,
  cutoutBounds: Bounds,
  build?: VectorOverviewBuild,
): Extent;
export function rasterRenderableCoverage(cutoutBounds: Bounds, minZoom?: number): Extent;

export function desiredOverviewExtent(args: {
  routeBounds: Bounds;
  viewportWidth: number;
  viewportHeight: number;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
}): DesiredOverview;

export function overviewEnvelopeFor(args: {
  routeBounds: Bounds;
  userBounds: Bounds;
  cutoutBounds: Bounds;
  viewportWidth: number;
  viewportHeight: number;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  build?: VectorOverviewBuild;
  rasterMinZoom?: number;
}): OverviewEnvelope;
