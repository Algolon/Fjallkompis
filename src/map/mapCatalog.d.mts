export interface MapAssetRevision {
  /** Stable revision identifier; also the `?rev=` cache-buster value. */
  id: string;
  /** Exact byte length of the current archive — the freshness proof. */
  bytes: number;
  /** Full-file digest: provenance on the PWA, enforced on the Android download. */
  sha256: string;
  /** Physical PMTiles header coverage pinned to this exact revision. */
  coverage: {
    bounds: readonly [readonly [number, number], readonly [number, number]];
    minZoom: number;
    maxZoom: number;
    /** Exact physical XYZ inventory when per-zoom coverage is part of the contract. */
    tilesByZoom?: readonly {
      zoom: number;
      x: readonly [number, number];
      y: readonly [number, number];
      count: number;
    }[];
  };
}

export interface MapAssetRelease {
  /** Pinned GitHub Release tag — the canonical origin of the bytes. */
  tag: string;
  /** Asset filename on that release. */
  asset: string;
}

export type MapAssetDistribution = 'bundled' | 'optional';

export interface MapAsset {
  id: string;
  file: string;
  distribution: MapAssetDistribution;
  revision: MapAssetRevision;
  /** Shipped earlier revisions this archive's own cache may legitimately hold. */
  supersededBytes: readonly number[];
  cacheName: string;
  legacyCacheNames: readonly string[];
  /** null for bundled archives, which have no release asset. */
  release: MapAssetRelease | null;
}

export interface MapDownloadGroup {
  id: string;
  assetIds: readonly string[];
}

export declare const MAP_ASSET_REPO: { owner: string; repo: string };
export declare const MAP_ASSET_DIR: string;
export declare const MAP_ASSETS: Readonly<Record<string, MapAsset>>;
export declare const MAP_ASSET_IDS: readonly string[];
export declare const BUNDLED_MAP_ASSETS: readonly string[];
export declare const OPTIONAL_MAP_ASSETS: readonly string[];
export declare const MAP_DOWNLOAD_GROUPS: readonly MapDownloadGroup[];

export declare function mapAsset(id: string): MapAsset;
export declare function mapAssetPath(asset: MapAsset): string;
export declare function mapAssetReleaseUrl(asset: MapAsset): string;
export declare function mapAssetGroupBytes(assetIds: readonly string[]): number;
