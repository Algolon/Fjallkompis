/**
 * Offline basemap download management.
 *
 * The regional PMTiles archive is deliberately NOT part of the Workbox
 * precache: map data downloads are an explicit user choice (Settings →
 * Offline map). The complete file is stored as ONE full 200 response in a
 * dedicated Cache Storage cache, separate from the app-shell cache.
 *
 * Offline reads happen through two complementary paths:
 *  1. Primary: the map reads the cached blob directly via a blob-backed
 *     PMTiles source (src/map/pmtilesProtocol.ts) — works with or without a
 *     service worker, including in dev.
 *  2. Belt-and-braces: the service worker serves byte-range requests for the
 *     .pmtiles URL from the same cached full response via Workbox's
 *     RangeRequestsPlugin (configured in vite.config.ts), so plain fetch
 *     paths also work offline. Caching individual 206 responses would NOT
 *     be sufficient — only the full response is ever cached.
 */

export const OFFLINE_MAP_CACHE = 'fjallkompis-offline-map-v1';

/** Absolute URL of the regional basemap, correct under /Fjallkompis/. */
export function offlineMapUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}maps/kungsleden.pmtiles`, window.location.origin)
    .toString();
}

export interface OfflineMapStatus {
  supported: boolean;
  downloaded: boolean;
  sizeBytes: number | null;
}

export async function getOfflineMapStatus(): Promise<OfflineMapStatus> {
  if (!('caches' in window)) return { supported: false, downloaded: false, sizeBytes: null };
  const cache = await caches.open(OFFLINE_MAP_CACHE);
  const match = await cache.match(offlineMapUrl());
  if (!match) return { supported: true, downloaded: false, sizeBytes: null };
  const blob = await match.clone().blob();
  return { supported: true, downloaded: true, sizeBytes: blob.size };
}

/** Cached full-file blob, or null if not downloaded. */
export async function getOfflineMapBlob(): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(OFFLINE_MAP_CACHE);
  const match = await cache.match(offlineMapUrl());
  return match ? match.blob() : null;
}

/**
 * Download the full PMTiles file and store it as a single complete response.
 * Reports progress when the server provides Content-Length.
 */
export async function downloadOfflineMap(
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<number> {
  const url = offlineMapUrl();
  // cache: 'no-store' so we bypass any stale HTTP-cache copy on re-download.
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Map download failed (HTTP ${res.status})`);

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
  const cache = await caches.open(OFFLINE_MAP_CACHE);
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

export async function removeOfflineMap(): Promise<void> {
  if (!('caches' in window)) return;
  const cache = await caches.open(OFFLINE_MAP_CACHE);
  await cache.delete(offlineMapUrl());
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
