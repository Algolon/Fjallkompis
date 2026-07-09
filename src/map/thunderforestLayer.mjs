/**
 * Thunderforest Outdoors — temporary ONLINE-ONLY comparison basemap.
 *
 * Purpose: an external cartographic benchmark for improving the production
 * Nordic Liberty Topo style (docs/maps/thunderforest-outdoors-benchmark.md).
 * This is deliberately NOT a migration target:
 *   - never the default basemap (DEFAULT_MAP_STYLE_ID stays 'liberty-nordic');
 *   - never part of offline downloads, PMTiles conversion or bulk caching;
 *   - never a hard dependency — without an API key the option is simply
 *     unavailable and no Thunderforest request is ever made;
 *   - tiles come straight from Thunderforest's Map Tiles API (no proxy, no
 *     redistribution, no prefetching beyond normal MapLibre behaviour).
 *
 * The API key is injected at build time from VITE_THUNDERFOREST_API_KEY
 * (read in src/map/thunderforest.ts, never here — this module stays plain
 * ESM so the node --test suite can exercise it without Vite). NOTE: build-time
 * injection only keeps the key out of the repository; the built browser app
 * necessarily exposes it in tile-request URLs (documented in
 * docs/DEVELOPMENT.md — restrict the key to allowed origins in the
 * Thunderforest dashboard).
 *
 * Plain ESM (like mapStyles.mjs); the app imports it through
 * thunderforestLayer.d.mts.
 */

export const THUNDERFOREST_STYLE_ID = 'thunderforest-outdoors';
export const THUNDERFOREST_SOURCE = 'thunderforest-outdoors';
export const THUNDERFOREST_LAYER = 'thunderforest-outdoors';

/** Standard slippy-map raster tiles (no retina/@2x during this prototype). */
export const THUNDERFOREST_TILE_SIZE = 256;
/**
 * Zoom bounds for the raster source. Thunderforest serves z0–22; the map's
 * own minZoom/maxZoom (4/17 in MapView) already cap what is requested, and
 * maxzoom 17 here prevents MapLibre ever asking the API for deeper tiles —
 * it over-zooms client-side instead, exactly like the offline archives.
 */
export const THUNDERFOREST_MINZOOM = 0;
export const THUNDERFOREST_MAXZOOM = 17;

/**
 * Tile URL template for the given key. The key is interpolated at runtime
 * from the build-time env var — never a literal anywhere in the repo.
 */
export function thunderforestTileUrl(apiKey) {
  return `https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=${apiKey}`;
}

/**
 * MapLibre raster source spec, or null when no key is configured — callers
 * must skip adding the source entirely in that case (no request without a
 * key, ever). Attribution HTML is passed in from the central registry
 * (src/data/attribution.ts) so map credits can never drift from Settings.
 */
export function thunderforestSource(apiKey, attributionHtml) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return null;
  return {
    type: 'raster',
    tiles: [thunderforestTileUrl(key)],
    tileSize: THUNDERFOREST_TILE_SIZE,
    minzoom: THUNDERFOREST_MINZOOM,
    maxzoom: THUNDERFOREST_MAXZOOM,
    attribution: attributionHtml,
  };
}

/**
 * The raster layer itself. Created hidden: MapView adds source+layer lazily
 * on the FIRST selection and afterwards only toggles visibility, so repeated
 * switching can never duplicate sources, layers or listeners.
 */
export function thunderforestRasterLayer() {
  return {
    id: THUNDERFOREST_LAYER,
    type: 'raster',
    source: THUNDERFOREST_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'raster-fade-duration': 200 },
  };
}
