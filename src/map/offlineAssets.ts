/**
 * Generic offline-asset download management (Cache Storage).
 *
 * This is the generalisation of the original single-file offlineMap.ts: it
 * works for ANY registry asset (topographic, satellite, contours, …). Each
 * archive lives in its OWN dedicated Cache Storage cache (asset.cacheName),
 * always separate from the Workbox app-shell precache, and is stored as ONE
 * full 200 response (never individual 206 range responses).
 *
 * Offline reads then happen through two complementary paths, unchanged from
 * the original design:
 *  1. Primary: a blob-backed PMTiles source reads the cached full response
 *     directly (works with or without a service worker) — see layerManager.ts
 *     / pmtilesProtocol.ts.
 *  2. Belt-and-braces: the service worker serves byte-range requests for the
 *     .pmtiles URL from the same cached full response via Workbox's
 *     RangeRequestsPlugin (see vite.config.ts).
 */
import type { OfflineAsset } from './assetRegistry.mjs';

/** Absolute URL of an asset, correct under the /Fjallkompis/ base path. */
export function assetUrl(asset: OfflineAsset): string {
  return new URL(`${import.meta.env.BASE_URL}${asset.path}`, window.location.origin).toString();
}

export interface AssetStatus {
  supported: boolean;
  downloaded: boolean;
  sizeBytes: number | null;
}

export async function getAssetStatus(asset: OfflineAsset): Promise<AssetStatus> {
  if (!('caches' in window)) return { supported: false, downloaded: false, sizeBytes: null };
  const cache = await caches.open(asset.cacheName);
  const match = await cache.match(assetUrl(asset));
  if (!match) return { supported: true, downloaded: false, sizeBytes: null };
  const blob = await match.clone().blob();
  return { supported: true, downloaded: true, sizeBytes: blob.size };
}

/** Cached full-file blob for an asset, or null if not downloaded. */
export async function getAssetBlob(asset: OfflineAsset): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(asset.cacheName);
  const match = await cache.match(assetUrl(asset));
  return match ? match.blob() : null;
}

/**
 * Download an asset's full PMTiles file and store it as a single complete
 * response in its dedicated cache. Reports progress when Content-Length is
 * available.
 */
export async function downloadAsset(
  asset: OfflineAsset,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<number> {
  const url = assetUrl(asset);
  // cache: 'no-store' so a stale HTTP-cache copy is bypassed on re-download.
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

  const total = Number(res.headers.get('Content-Length')) || null;
  const chunks: BlobPart[] = [];
  let loaded = 0;

  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  } else {
    const buf = await res.arrayBuffer();
    chunks.push(buf);
    loaded = buf.byteLength;
    onProgress(loaded, total);
  }

  const blob = new Blob(chunks, { type: 'application/octet-stream' });
  const cache = await caches.open(asset.cacheName);
  await cache.put(
    url,
    new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(blob.size),
      },
    }),
  );
  return blob.size;
}

export async function removeAsset(asset: OfflineAsset): Promise<void> {
  if (!('caches' in window)) return;
  // Delete the whole dedicated cache so nothing is left behind, then also drop
  // the keyed entry for older layouts.
  await caches.delete(asset.cacheName);
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
