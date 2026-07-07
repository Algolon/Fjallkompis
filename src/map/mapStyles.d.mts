/** TypeScript surface for the plain-ESM map-style comparison registry. */
import type { LayerSpecification } from 'maplibre-gl';

export type MapStyleId = 'current' | 'liberty' | 'liberty-nordic';

export interface MapStyleOption {
  id: MapStyleId;
  label: string;
}

export declare const MAP_STYLE_OPTIONS: MapStyleOption[];
export declare const DEFAULT_MAP_STYLE_ID: MapStyleId;
export declare function isMapStyleId(value: unknown): value is MapStyleId;
export declare function basemapLayersForStyle(
  styleId: MapStyleId,
  sourceId: string,
): LayerSpecification[];
