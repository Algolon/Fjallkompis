export type AssetKind = 'vector' | 'raster' | 'raster-dem';
export type AssetRole = 'base' | 'overlay';

export interface OfflineAsset {
  /** Stable id; also used as the pmtiles blob key. */
  id: string;
  /** Base map (mutually exclusive) or independent overlay. */
  role: AssetRole;
  label: string;
  description: string;
  /** Path under the app base URL. */
  path: string;
  /** Dedicated Cache Storage cache — never the Workbox app-shell precache. */
  cacheName: string;
  /** Bump to invalidate any stored copy. */
  version: string;
  kind: AssetKind;
  /** Estimate until a real extraction exists. */
  expectedSizeBytes: number;
  /** True while `expectedSizeBytes` is still a planning guess. */
  estimatedSize: boolean;
  /** Required source attribution string. */
  attribution: string;
  /** The single dependable fallback (topographic). */
  required: boolean;
  /** Whether the PMTiles archive has actually shipped yet. */
  available: boolean;
}

export interface AssetManifest {
  id: string;
  version: string;
  kind: AssetKind;
  /** ISO date of the source imagery / DEM. */
  sourceDate: string;
  attribution: string;
  /** [west, south, east, north] in WGS84. */
  bbox: [number, number, number, number];
  sizeBytes: number;
  /** e.g. "jpeg", "webp", "pbf". */
  tileFormat: string;
}

export declare const ASSET_KINDS: readonly AssetKind[];
export declare const OFFLINE_ASSETS: Record<string, OfflineAsset>;
export declare const REQUIRED_MANIFEST_KEYS: readonly string[];

export declare function listAssets(): OfflineAsset[];
export declare function getAsset(id: string): OfflineAsset | null;
export declare function baseAssets(): OfflineAsset[];
export declare function overlayAssets(): OfflineAsset[];
export declare function validateAssetManifest(raw: unknown): {
  ok: boolean;
  problems: string[];
};
