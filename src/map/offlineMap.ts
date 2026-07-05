/**
 * Offline basemap download management.
 *
 * Two regional PMTiles archives are managed here, each in its own Cache
 * Storage cache, separate from the Workbox app-shell precache:
 *   - the vector basemap (kungsleden.pmtiles), the offline-capable default;
 *   - the satellite raster imagery (kungsleden-satellite.pmtiles), the
 *     optional second layer.
 * Neither is part of the precache: map data downloads are an explicit user
 * choice (Settings → Offline map / Satellite imagery). Each complete file is
 * stored as ONE full 200 response.
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

/** Descriptor for one downloadable PMTiles archive. */
export interface ArchiveSpec {
  /** Cache Storage cache name (kept in sync with vite.config.ts). */
  cacheName: string;
  /** Path under BASE_URL to the .pmtiles file. */
  path: string;
}

export const VECTOR_ARCHIVE: ArchiveSpec = {
  cacheName: 'fjallkompis-offline-map-v1',
  path: 'maps/kungsleden.pmtiles',
};

export const SATELLITE_ARCHIVE: ArchiveSpec = {
  cacheName: 'fjallkompis-offline-satellite-v1',
  path: 'maps/kungsleden-satellite.pmtiles',
};

/** @deprecated kept for existing imports; prefer VECTOR_ARCHIVE.cacheName. */
export const OFFLINE_MAP_CACHE = VECTOR_ARCHIVE.cacheName;

/** Absolute URL of an archive, correct under /Fjallkompis/. */
export function archiveUrl(spec: ArchiveSpec): string {
  return new URL(`${import.meta.env.BASE_URL}${spec.path}`, window.location.origin).toString();
}

/** Absolute URL of the regional vector basemap. */
export function offlineMapUrl(): string {
  return archiveUrl(VECTOR_ARCHIVE);
}

/** Absolute URL of the satellite raster imagery archive. */
export function satelliteMapUrl(): string {
  return archiveUrl(SATELLITE_ARCHIVE);
}

export interface OfflineMapStatus {
  supported: boolean;
  downloaded: boolean;
  sizeBytes: number | null;
}

export async function getArchiveStatus(spec: ArchiveSpec): Promise<OfflineMapStatus> {
  if (!('caches' in window)) return { supported: false, downloaded: false, sizeBytes: null };
  const cache = await caches.open(spec.cacheName);
  const match = await cache.match(archiveUrl(spec));
  if (!match) return { supported: true, downloaded: false, sizeBytes: null };
  const blob = await match.clone().blob();
  return { supported: true, downloaded: true, sizeBytes: blob.size };
}

/** Cached full-file blob for an archive, or null if not downloaded. */
export async function getArchiveBlob(spec: ArchiveSpec): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(spec.cacheName);
  const match = await cache.match(archiveUrl(spec));
  return match ? match.blob() : null;
}

/**
 * Download the full PMTiles file and store it as a single complete response.
 * Reports progress when the server provides Content-Length.
 */
export async function downloadArchive(
  spec: ArchiveSpec,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<number> {
  const url = archiveUrl(spec);
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
  const cache = await caches.open(spec.cacheName);
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

export async function removeArchive(spec: ArchiveSpec): Promise<void> {
  if (!('caches' in window)) return;
  const cache = await caches.open(spec.cacheName);
  await cache.delete(archiveUrl(spec));
}

// ---- Vector-basemap convenience wrappers (existing call sites) ------------

export const getOfflineMapStatus = () => getArchiveStatus(VECTOR_ARCHIVE);
export const getOfflineMapBlob = () => getArchiveBlob(VECTOR_ARCHIVE);
export const downloadOfflineMap = (
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
) => downloadArchive(VECTOR_ARCHIVE, onProgress);
export const removeOfflineMap = () => removeArchive(VECTOR_ARCHIVE);

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
