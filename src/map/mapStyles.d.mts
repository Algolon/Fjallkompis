/** TypeScript surface for the plain-ESM map-style comparison registry. */
import type { LayerSpecification } from 'maplibre-gl';
import type { ReliefSources } from './libertyTopoLayers.mjs';

/** Offline-capable vector styles, built on the shared PMTiles source. */
export type VectorMapStyleId = 'current' | 'liberty' | 'liberty-nordic';
/** All selectable styles, incl. the online-only raster benchmark. */
export type MapStyleId = VectorMapStyleId | 'thunderforest-outdoors';

export interface MapStyleOption {
  id: MapStyleId;
  label: string;
  kind: 'vector-offline' | 'raster-online';
  /** e.g. "Online preview" — shown next to the label where space allows. */
  supportingLabel?: string;
  description?: string;
  /** Unavailable (not selectable) unless the build-time key is configured. */
  requiresApiKey?: boolean;
}

export declare const MAP_STYLE_OPTIONS: MapStyleOption[];
/** Typed as a VECTOR style: the default basemap must stay offline-capable. */
export declare const DEFAULT_MAP_STYLE_ID: VectorMapStyleId;
export declare function isMapStyleId(value: unknown): value is MapStyleId;
export declare function isVectorStyleId(value: unknown): value is VectorMapStyleId;
export declare function isBenchmarkEnabled(
  isDev: boolean,
  flagValue: string | undefined,
): boolean;
export declare function basemapLayersForStyle(
  styleId: VectorMapStyleId,
  sourceId: string,
  relief?: ReliefSources,
): LayerSpecification[];
