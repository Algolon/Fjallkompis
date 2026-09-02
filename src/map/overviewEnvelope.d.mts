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
  /** Effective source zoom for the active source type. */
  sourceZoom: number;
  mapZoom: number;
  bindingAxis: 'width' | 'height';
  /** What the fit needs, before coverage is considered. */
  desiredOverview: Bounds;
  /** Physical vector coverage at `sourceZoom` — the hard cap. */
  vectorCoverage: Extent;
  /** Physical terrain/satellite coverage at the effective source zoom. */
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
export const TERRAIN_OVERVIEW_MAX_SOURCE_ZOOM: number;
export const TERRAIN_ARCHIVE_MAX_ZOOM: number;
export const SATELLITE_ARCHIVE_MAX_ZOOM: number;
export const SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM: number;
export const SATELLITE_DETAIL_MIN_ZOOM: number;
export const RASTER_SOURCE_TILE_SIZE: number;
export const MAPLIBRE_WORLD_TILE_SIZE: number;
export const OVERVIEW_SLACK: number;
export function rasterSourceZoomForDisplayZoom(
  displayZoom: number,
  tileSize?: number,
  maxZoom?: number,
): number;
export function terrainUsesOverviewCoverage(displayZoom: number): boolean;

export function tileAlignedFootprint(bounds: Bounds, z: number): Extent;
export function vectorSourceCoverage(
  sourceZoom: number,
  cutoutBounds: Bounds,
  build?: VectorOverviewBuild,
): Extent;
export function rasterRenderableCoverage(cutoutBounds: Bounds, minZoom?: number): Extent;
export function terrainSourceCoverage(sourceZoom: number, cutoutBounds: Bounds): Extent;
export function satelliteSourceCoverage(sourceZoom: number, cutoutBounds: Bounds): Extent;

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

export type CoverageMode = 'terrain' | 'satellite' | 'vector';

export interface OverviewCamera {
  mode: CoverageMode;
  coverage: Extent;
  /** The camera to apply, in one move. */
  camera: { lng: number; lat: number; zoom: number };
  /** What a purely route-centred composition would have been. */
  desiredCamera: { lng: number; lat: number; zoom: number };
  /** How far the applied centre had to move, CSS px at this zoom. */
  centreDeviationPx: { x: number; y: number };
  /** True only when translation alone could not fit the viewport. */
  zoomRaised: boolean;
  zoomDelta: number;
  sourceZoom: number;
  scale: number;
  visibleExtent: Bounds;
  routeClearancePx: { left: number; right: number; top: number; bottom: number };
  /** Route edges pushed outside the viewport (ultrawide overfill only). */
  endpointsOutside: { edge: string; px: number }[];
  routeComplete: boolean;
  /** maxBounds for the overview: the active mode's renderable envelope. */
  overviewBounds: Bounds;
}

export declare function coverageForMode(
  mode: CoverageMode,
  cutoutBounds: Bounds,
  build?: VectorOverviewBuild,
  displayZoom?: number,
): Extent;

export declare function overviewCameraFor(args: {
  routeBounds: Bounds;
  userBounds: Bounds;
  cutoutBounds: Bounds;
  viewportWidth: number;
  viewportHeight: number;
  padding?: { top?: number; bottom?: number; left?: number; right?: number };
  mode?: CoverageMode;
  build?: VectorOverviewBuild;
}): OverviewCamera;
