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
import { BASEMAP_SOURCE_INFO, SATELLITE_SOURCE_INFO } from '../data/attribution';

export const BASEMAP_SOURCE = 'protomaps';
/**
 * Attribution strings live in the central registry (src/data/attribution.ts)
 * so the map control, the Settings archive cards and the credits sheet can
 * never drift apart. MapLibre's attribution control is layer-aware: it only
 * shows credits for sources present in the style.
 */
export const BASEMAP_ATTRIBUTION = BASEMAP_SOURCE_INFO.mapAttributionHtml!;

/**
 * Optional second basemap: satellite imagery from a raster PMTiles archive.
 *
 * Like the vector basemap, this stays fully offline — tiles are read from a
 * `pmtiles://…` raster archive (offline blob or hosted file, resolved in
 * pmtilesProtocol.ts), never from a remote tile provider. The layer is only
 * added when a satellite archive is actually available, and ships with
 * visibility:none so it costs nothing until the user switches it on.
 */
export const SATELLITE_SOURCE = 'satellite';
export const SATELLITE_LAYER = 'satellite';
// EOX Sentinel-2 cloudless is the shipped source (see README). If you build the
// archive from a different provider, update the registry entry accordingly.
export const SATELLITE_ATTRIBUTION = SATELLITE_SOURCE_INFO.mapAttributionHtml!;
/**
 * Pixel size of the raster tiles in the archive. Standard slippy-map tiles are
 * 256; set to 512 here if the supplied archive uses 512px tiles.
 */
export const SATELLITE_TILE_SIZE = 256;

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
/** Live-tracking breadcrumb trail (Delft pilot). */
export const TRAIL_COLOR = '#b3452c';

const stageColorExpression = [
  'match',
  ['get', 'day'],
  ...Object.entries(STAGE_COLORS).flatMap(([day, color]) => [Number(day), color]),
  OVERVIEW_COLOR,
] as unknown as string;

export function buildMapStyle(
  basemapSourceUrl: string | null,
  satelliteSourceUrl: string | null = null,
): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    // Placeholder background stays visible when no basemap is available; the
    // UI shows an explicit "basemap missing" notice alongside it.
    sources: {},
    layers: [
      {
        id: 'placeholder-background',
        type: 'background',
        paint: { 'background-color': '#e4ebe7' },
      },
    ],
  };

  if (basemapSourceUrl) {
    style.sources[BASEMAP_SOURCE] = {
      type: 'vector',
      url: basemapSourceUrl,
      attribution: BASEMAP_ATTRIBUTION,
    };
    // Calm "light" flavour; no `lang` → no symbol layers → no glyph/sprite
    // dependencies. Layers cover land, landcover/landuse, water, waterways,
    // roads, paths/trails, railways, buildings and boundaries where present.
    style.layers.push(
      ...(protomapsLayers(BASEMAP_SOURCE, namedFlavor('light'), {}) as LayerSpecification[]),
    );
  }

  // Satellite raster basemap from a PMTiles archive, added only when one is
  // available and hidden until the user toggles it on. It sits above the
  // vector basemap (which it fully covers when visible) but below the
  // route/GPS layers that MapView adds after load.
  if (satelliteSourceUrl) {
    style.sources[SATELLITE_SOURCE] = {
      type: 'raster',
      url: satelliteSourceUrl,
      tileSize: SATELLITE_TILE_SIZE,
      attribution: SATELLITE_ATTRIBUTION,
    };
    style.layers.push({
      id: SATELLITE_LAYER,
      type: 'raster',
      source: SATELLITE_SOURCE,
      layout: { visibility: 'none' },
      paint: { 'raster-fade-duration': 200 },
    });
  }

  return style;
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
    // Live-tracking breadcrumb trail: empty for the normal Kungsleden map;
    // fed by the Delft pilot's tracking session via the 'trail' source.
    {
      id: 'trail-line',
      type: 'line',
      source: 'trail',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': TRAIL_COLOR,
        'line-width': 3,
        'line-opacity': 0.8,
        'line-dasharray': [1, 1.5],
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
