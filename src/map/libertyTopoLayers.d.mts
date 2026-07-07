/** TypeScript surface for the adapted Liberty Topo layer builder. */
import type { LayerSpecification } from 'maplibre-gl';

/** Colour/opacity tokens; a null slot skips its layer entirely. */
export interface LibertyTopoPalette {
  id: string;
  background: string;
  park: string;
  parkOutline: string;
  wood: string;
  grass: string;
  scrub: string;
  wetland: string;
  ice: string;
  sand: string;
  rock: string | null;
  cliff: string | null;
  residentialLowZoom: string;
  residentialHighZoom: string;
  water: string;
  waterway: string;
  trailCasing: string;
  trail: string;
  trackCasing: string;
  track: string;
  minorCasing: string;
  minor: string;
  majorCasing: string;
  major: string;
  rail: string;
  building: string;
  buildingOutline: string;
  boundaryCountry: string;
  boundaryMinor: string;
}

export declare const LIBERTY_TOPO_PALETTE: LibertyTopoPalette;
export declare const NORDIC_TOPO_PALETTE: LibertyTopoPalette;
export declare const PROTOMAPS_SOURCE_LAYERS: string[];
export declare function libertyTopoLayers(
  sourceId: string,
  palette: LibertyTopoPalette,
): LayerSpecification[];
