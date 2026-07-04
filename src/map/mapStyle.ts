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

export const BASEMAP_SOURCE = 'protomaps';
export const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>';

/**
 * Optional second basemap: Esri World Imagery satellite raster tiles.
 *
 * This is the one deliberate exception to the app's otherwise strict
 * offline-only rule: satellite tiles are fetched from a remote provider and
 * ONLY when the user opts into the satellite layer (the raster layer ships
 * with visibility:none, so no tiles are requested until it is switched on).
 * The vector basemap remains the offline-capable default.
 *
 * To go fully offline later, swap `SATELLITE_TILES` for a `pmtiles://…` raster
 * archive resolved the same way as the vector basemap (see pmtilesProtocol.ts)
 * — the source/layer wiring below does not otherwise change.
 */
export const SATELLITE_SOURCE = 'satellite';
export const SATELLITE_LAYER = 'satellite';
export const SATELLITE_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const SATELLITE_ATTRIBUTION =
  'Imagery © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics, and the GIS User Community';

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

export function buildMapStyle(basemapSourceUrl: string | null): StyleSpecification {
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

  // Satellite raster basemap, hidden until the user toggles it on. It sits
  // above the vector basemap (which it fully covers when visible) but below
  // the route/GPS layers that MapView adds after load.
  style.sources[SATELLITE_SOURCE] = {
    type: 'raster',
    tiles: [SATELLITE_TILES],
    tileSize: 256,
    maxzoom: 19,
    attribution: SATELLITE_ATTRIBUTION,
  };
  style.layers.push({
    id: SATELLITE_LAYER,
    type: 'raster',
    source: SATELLITE_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'raster-fade-duration': 200 },
  });

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
