/** TypeScript surface for the adapted Liberty Topo layer builder. */
import type {
  DataDrivenPropertyValueSpecification,
  LayerSpecification,
} from 'maplibre-gl';

/** A paint token that may be a constant or a zoom-driven expression. */
type PaintNumber = DataDrivenPropertyValueSpecification<number>;

/**
 * Paint tokens; a null slot skips its layer entirely. Most slots are
 * colours; a few are complete opacity/width expressions or structural
 * values (zoom thresholds) so the Nordic terrain hierarchy stays
 * palette-driven (see libertyTopoLayers.mjs).
 */
export interface LibertyTopoPalette {
  id: string;
  background: string;
  park: string;
  parkOutline: string;
  wood: string;
  grass: string;
  scrub: string;
  wetland: string;
  wetlandOpacity: PaintNumber;
  ice: string;
  iceOutline: string | null;
  sand: string;
  barren: string;
  rock: string | null;
  rockOpacity: PaintNumber;
  cliff: string | null;
  hillshadeShadow: string;
  hillshadeHighlight: string;
  hillshadeExaggeration: PaintNumber;
  contour: string;
  contourIndex: string;
  residentialLowZoom: string;
  residentialHighZoom: string;
  water: string;
  waterRiver: string | null;
  waterway: string;
  riverLineWidth: PaintNumber;
  riverLineOpacity: PaintNumber;
  streamLineWidth: PaintNumber;
  streamLineOpacity: PaintNumber;
  trailCasing: string;
  trail: string;
  trailMinzoom: number;
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

/** Optional relief sources; omit any whose archive is unavailable. */
export interface ReliefSources {
  terrainSourceId?: string;
  contoursSourceId?: string;
}

export declare const LIBERTY_TOPO_PALETTE: LibertyTopoPalette;
export declare const NORDIC_TOPO_PALETTE: LibertyTopoPalette;
export declare const PROTOMAPS_SOURCE_LAYERS: string[];
export declare function libertyTopoLayers(
  sourceId: string,
  palette: LibertyTopoPalette,
  relief?: ReliefSources,
): LayerSpecification[];
