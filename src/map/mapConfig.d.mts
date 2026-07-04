export type BaseMapId = 'topographic' | 'satellite';

export interface MapConfig {
  /** Mutually-exclusive base map. Topographic is the dependable fallback. */
  baseMap: BaseMapId;
  contoursEnabled: boolean;
  hillshadeEnabled: boolean;
  labelsEnabled: boolean;
}

export declare const BASE_MAPS: readonly BaseMapId[];
export declare const DEFAULT_MAP_CONFIG: MapConfig;
export declare function isBaseMap(value: unknown): value is BaseMapId;
export declare function normalizeMapConfig(raw: unknown): MapConfig;
