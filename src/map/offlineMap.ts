/**
 * Offline TOPOGRAPHIC basemap download management.
 *
 * The original single-file implementation now delegates to the generic
 * offline-asset manager (src/map/offlineAssets.ts) driven by the topographic
 * entry in the asset registry. The public surface below is UNCHANGED so the
 * rest of the app keeps working exactly as before; the generic manager is used
 * everywhere new (satellite, contours, …) instead of duplicating this logic.
 *
 * Like before, the topographic archive is deliberately NOT part of the Workbox
 * precache — it is an explicit user choice stored in its own dedicated Cache
 * Storage cache, separate from the app shell.
 */
import { OFFLINE_ASSETS } from './assetRegistry.mjs';
import {
  assetUrl,
  downloadAsset,
  formatBytes,
  getAssetBlob,
  getAssetStatus,
  removeAsset,
  type AssetStatus,
} from './offlineAssets';

/** The topographic base map — the dependable offline fallback. */
export const TOPO_ASSET = OFFLINE_ASSETS.topographic;

export const OFFLINE_MAP_CACHE = TOPO_ASSET.cacheName;

/** Absolute URL of the regional topographic basemap. */
export function offlineMapUrl(): string {
  return assetUrl(TOPO_ASSET);
}

export type OfflineMapStatus = AssetStatus;

export function getOfflineMapStatus(): Promise<OfflineMapStatus> {
  return getAssetStatus(TOPO_ASSET);
}

/** Cached full-file blob, or null if not downloaded. */
export function getOfflineMapBlob(): Promise<Blob | null> {
  return getAssetBlob(TOPO_ASSET);
}

export function downloadOfflineMap(
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<number> {
  return downloadAsset(TOPO_ASSET, onProgress);
}

export function removeOfflineMap(): Promise<void> {
  return removeAsset(TOPO_ASSET);
}

export { formatBytes };
