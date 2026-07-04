/**
 * Fully offline MapLibre style.
 *
 * Basemap layers come from @protomaps/basemaps WITHOUT the `lang` option,
 * which emits zero symbol layers — so the style needs no glyphs, no sprites,
 * no remote fonts and no remote URLs of any kind. Hut labels are rendered as
 * local HTML markers in React instead (see MapView).
 *
 * Route layers use the Okabe–Ito colour-blind-safe palette for the seven
 * stages; stage identity is never communicated by colour alone (day numbers
 * appear on chips, markers and summaries).
 */
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';

// ---- Source ids (one per registry asset) -----------------------------------
export const BASEMAP_SOURCE = 'protomaps'; // topographic vector base
export const SATELLITE_SOURCE = 'satellite'; // raster base
export const CONTOURS_SOURCE = 'contours'; // vector overlay
export const HILLSHADE_SOURCE = 'hillshade'; // raster-dem overlay
export const LABELS_SOURCE = 'labels'; // vector overlay

/** The layer id every base/overlay layer is inserted BEFORE, so route, hut
 *  and GPS layers always stay above all map imagery. */
export const ROUTE_UNDERLAY_ID = 'route-overview';

export const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';
export const SATELLITE_ATTRIBUTION = 'Contains modified Copernicus Sentinel-2 data';
export const TERRAIN_ATTRIBUTION = 'Contains modified Copernicus DEM data © ESA';

/** Okabe–Ito palette (colour-blind safe), one colour per day stage. */
export const STAGE_COLORS: Record<number, string> = {
  1: '#0072b2', // blue
  2: '#d55e00', // vermillion
  3: '#009e73', // bluish green
  4: '#cc79a7', // reddish purple
  5: '#56b4e9', // sky blue
  6: '#e69f00', // orange
  7: '#6a51a3', // purple (replaces low-contrast yellow on light terrain)
};

export const OVERVIEW_COLOR = '#5c6f68';
export const GPS_COLOR = '#2c7a8c';

const stageColorExpression = [
  'match',
  ['get', 'day'],
  ...Object.entries(STAGE_COLORS).flatMap(([day, color]) => [Number(day), color]),
  OVERVIEW_COLOR,
] as unknown as string;

/**
 * Base style with ONLY the placeholder background. Base maps and overlays are
 * added imperatively afterwards by the layer manager (src/map/layerManager.ts)
 * so switching base maps or toggling overlays never recreates the map. The
 * placeholder stays visible when no base map is available; the UI shows an
 * explicit "basemap missing" notice alongside it.
 */
export function buildBaseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'placeholder-background',
        type: 'background',
        paint: { 'background-color': '#e4ebe7' },
      },
    ],
  };
}

/**
 * Topographic base map layers from the protomaps "light" flavour WITHOUT the
 * `lang` option → zero symbol layers → no glyphs, sprites or remote fonts.
 * They reference {@link BASEMAP_SOURCE}. Computed lazily and memoised so the
 * layer manager can also enumerate their ids for clean removal.
 */
let topoLayersCache: LayerSpecification[] | null = null;
export function topoBaseLayers(): LayerSpecification[] {
  if (!topoLayersCache) {
    topoLayersCache = protomapsLayers(
      BASEMAP_SOURCE,
      namedFlavor('light'),
      {},
    ) as LayerSpecification[];
  }
  // Return a shallow copy so callers can safely splice/insert.
  return topoLayersCache.map((l) => ({ ...l }));
}

/** Ids of the topographic base layers, for group removal. */
export function topoBaseLayerIds(): string[] {
  return topoBaseLayers().map((l) => l.id);
}

/** Satellite raster base layer. */
export function satelliteBaseLayers(): LayerSpecification[] {
  return [
    {
      id: 'base-satellite',
      type: 'raster',
      source: SATELLITE_SOURCE,
      paint: { 'raster-opacity': 1 },
    },
  ];
}

/** Contour overlay: minor lines + emphasised index lines (glyph-free). */
export function contourOverlayLayers(): LayerSpecification[] {
  return [
    {
      id: 'overlay-contours-minor',
      type: 'line',
      source: CONTOURS_SOURCE,
      'source-layer': 'contours',
      filter: ['!=', ['%', ['coalesce', ['get', 'elevation'], 0], 100], 0],
      paint: { 'line-color': '#8a7250', 'line-width': 0.6, 'line-opacity': 0.5 },
    },
    {
      id: 'overlay-contours-index',
      type: 'line',
      source: CONTOURS_SOURCE,
      'source-layer': 'contours',
      filter: ['==', ['%', ['coalesce', ['get', 'elevation'], 0], 100], 0],
      paint: { 'line-color': '#7a5f3a', 'line-width': 1.1, 'line-opacity': 0.7 },
    },
  ];
}

/** Hillshade / terrain-relief overlay from a raster-dem source. */
export function hillshadeOverlayLayers(): LayerSpecification[] {
  return [
    {
      id: 'overlay-hillshade',
      type: 'hillshade',
      source: HILLSHADE_SOURCE,
      paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#3a3a3a' },
    },
  ];
}

/**
 * General place-label overlay. Symbol layers need a glyph pack; kept minimal
 * here and only activated once the labels asset (glyphs + label tiles) ships.
 */
export function labelOverlayLayers(): LayerSpecification[] {
  return [
    {
      id: 'overlay-labels',
      type: 'symbol',
      source: LABELS_SOURCE,
      'source-layer': 'labels',
      layout: {
        'text-field': ['coalesce', ['get', 'name'], ''],
        'text-size': 12,
        'text-font': ['Noto Sans Regular'],
      },
      paint: {
        'text-color': '#2b3a30',
        'text-halo-color': '#eef3ec',
        'text-halo-width': 1.2,
      },
    },
  ];
}

/** GeoJSON route layers, added above the basemap after style load. */
export function routeLayers(): LayerSpecification[] {
  return [
    // Complete route as a subtle underlay, always visible.
    {
      id: 'route-overview',
      type: 'line',
      source: 'overview',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': OVERVIEW_COLOR,
        'line-width': 2,
        'line-opacity': 0.35,
      },
    },
    // All seven day stages, coloured per day.
    {
      id: 'route-stages',
      type: 'line',
      source: 'stages',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': stageColorExpression,
        'line-width': 3.5,
        'line-opacity': 0.9,
      },
    },
    // Casing + emphasis for the selected stage (filter set imperatively).
    {
      id: 'route-stage-selected-casing',
      type: 'line',
      source: 'stages',
      filter: ['==', ['get', 'stageId'], ''],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
    },
    {
      id: 'route-stage-selected',
      type: 'line',
      source: 'stages',
      filter: ['==', ['get', 'stageId'], ''],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': stageColorExpression,
        'line-width': 5,
      },
    },
    // Wide invisible hit area so stages are tappable with a thumb.
    {
      id: 'route-stages-hit',
      type: 'line',
      source: 'stages',
      paint: { 'line-color': '#000', 'line-width': 26, 'line-opacity': 0 },
    },
    // Elevation-scrub position marker.
    {
      id: 'scrub-point-halo',
      type: 'circle',
      source: 'scrub',
      paint: { 'circle-radius': 10, 'circle-color': '#1b2a27', 'circle-opacity': 0.15 },
    },
    {
      id: 'scrub-point',
      type: 'circle',
      source: 'scrub',
      paint: {
        'circle-radius': 5,
        'circle-color': '#1b2a27',
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2,
      },
    },
    // GPS fix.
    {
      id: 'gps-halo',
      type: 'circle',
      source: 'gps',
      paint: { 'circle-radius': 14, 'circle-color': GPS_COLOR, 'circle-opacity': 0.18 },
    },
    {
      id: 'gps-dot',
      type: 'circle',
      source: 'gps',
      paint: {
        'circle-radius': 6,
        'circle-color': GPS_COLOR,
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 2,
      },
    },
  ];
}
