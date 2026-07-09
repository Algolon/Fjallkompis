/**
 * Basemap style registry. The style comparison (Current vs Liberty Topo vs
 * Liberty Topo — Nordic, see docs/map-style-comparison.md) concluded with
 * **'liberty-nordic' adopted as the production Terrain style** — the Liberty
 * Topo structure restyled with the Nordic Trail design language. The
 * in-app comparison selector was removed with the decision.
 *
 * Every option styles the IDENTICAL vector source and source-layers; the
 * alternatives are retained so the look stays centrally adjustable
 * (NORDIC_TOPO_PALETTE in libertyTopoLayers.mjs) and re-comparable later by
 * passing a different id to MapView's mapStyleId prop.
 *
 * Plain ESM (like src/utils/routeProgress.mjs) so the node --test suite can
 * exercise the registry and builders directly; the app imports it through
 * mapStyles.d.mts.
 */
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import {
  libertyTopoLayers,
  LIBERTY_TOPO_PALETTE,
  NORDIC_TOPO_PALETTE,
} from './libertyTopoLayers.mjs';

export const MAP_STYLE_OPTIONS = [
  // Production style, unchanged — the control version of the comparison.
  { id: 'current', label: 'Current', kind: 'vector-offline' },
  // Liberty Topo (gpx.studio styles repo) adapted to the Protomaps schema.
  { id: 'liberty', label: 'Liberty Topo', kind: 'vector-offline' },
  // The adapted Liberty structure restyled with Nordic Trail tokens.
  { id: 'liberty-nordic', label: 'Liberty Topo — Nordic', kind: 'vector-offline' },
  // Temporary ONLINE-ONLY cartographic benchmark (thunderforestLayer.mjs,
  // docs/maps/thunderforest-outdoors-benchmark.md). Never the default, never
  // offline-capable, unavailable without VITE_THUNDERFOREST_API_KEY.
  {
    id: 'thunderforest-outdoors',
    label: 'Thunderforest Outdoors',
    supportingLabel: 'Online preview',
    description:
      'Detailed outdoor terrain reference for comparing landcover, relief, paths and label hierarchy.',
    kind: 'raster-online',
    requiresApiKey: true,
  },
];

export const DEFAULT_MAP_STYLE_ID = 'liberty-nordic';

export function isMapStyleId(value) {
  return MAP_STYLE_OPTIONS.some((o) => o.id === value);
}

/**
 * The offline-capable vector styles — the ones basemapLayersForStyle() can
 * build against the shared PMTiles source. The raster-online benchmark is
 * deliberately NOT one of them: it is a separate raster source+layer handled
 * by MapView (thunderforestLayer.mjs), so the offline invariants guarded by
 * tests/map-styles.test.mjs keep applying to every vector style.
 */
export function isVectorStyleId(value) {
  return MAP_STYLE_OPTIONS.some((o) => o.id === value && o.kind === 'vector-offline');
}

/**
 * Visibility rule for the TEMPORARY map-comparison selector, separate from
 * API-key availability by design (the key is not a feature flag):
 *  - dev builds show the selector by default (matches the 0.8.0 prototype
 *    convention of a developer-facing selector);
 *  - production shows it only when VITE_ENABLE_MAP_BENCHMARK is exactly
 *    'true' (a non-sensitive repository VARIABLE in deploy.yml);
 *  - without the flag, normal users get only the production map — no
 *    comparison options, no unavailable Thunderforest entry.
 * Pure function (env values are passed in) so node --test can fence it;
 * the app reads it through benchmarkFlag.ts.
 */
export function isBenchmarkEnabled(isDev, flagValue) {
  if (isDev) return true;
  return typeof flagValue === 'string' && flagValue.trim() === 'true';
}

/**
 * Basemap layers for a style id, all bound to the given vector source.
 * 'current' reproduces the production style byte-for-byte (same
 * @protomaps/basemaps call as before the prototype existed).
 */
export function basemapLayersForStyle(styleId, sourceId) {
  switch (styleId) {
    case 'current':
      // No `lang` option → zero symbol layers → no glyph/sprite dependencies.
      return protomapsLayers(sourceId, namedFlavor('light'), {});
    case 'liberty':
      return libertyTopoLayers(sourceId, LIBERTY_TOPO_PALETTE);
    case 'liberty-nordic':
      return libertyTopoLayers(sourceId, NORDIC_TOPO_PALETTE);
    default:
      throw new Error(`Unknown map style id: ${styleId}`);
  }
}
