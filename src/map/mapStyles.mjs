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
  { id: 'current', label: 'Current' },
  // Liberty Topo (gpx.studio styles repo) adapted to the Protomaps schema.
  { id: 'liberty', label: 'Liberty Topo' },
  // The adapted Liberty structure restyled with Nordic Trail tokens.
  { id: 'liberty-nordic', label: 'Liberty Topo — Nordic' },
];

export const DEFAULT_MAP_STYLE_ID = 'liberty-nordic';

export function isMapStyleId(value) {
  return MAP_STYLE_OPTIONS.some((o) => o.id === value);
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
