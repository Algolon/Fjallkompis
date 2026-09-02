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
 *
 * An archive may also declare a REVISION (see src/map/archiveRevision.mjs).
 * The vector basemap does, because its public URL is deliberately stable
 * across rebuilds: without a revision contract a device that downloaded the
 * archive before the 2026-08 rebuild would keep serving the superseded file
 * forever. This module is the browser adapter — the decision table, the cache
 * probing and the legacy pruning are pure and live next door.
 */
import {
  archiveFetchUrl,
  probeArchiveCaches,
  removeArchiveRevision,
  storeArchiveRevision,
  ARCHIVE_MISMATCH_ERROR,
  type ArchiveRevision,
  type ArchiveState,
} from './archiveRevision.mjs';
import { mapAsset, mapAssetPath, type MapAsset } from './mapCatalog.mjs';

export type { ArchiveRevision, ArchiveState };
export { ARCHIVE_MISMATCH_ERROR };

/**
 * Descriptor for one downloadable PMTiles archive — the runtime view of a
 * src/map/mapCatalog.mjs entry. Every field is DERIVED from the catalog, which
 * is what stops the app, the service worker, deployment, Android and the tests
 * from drifting onto different bytes under the same label.
 */
export interface ArchiveSpec {
  /** The catalog asset this spec was built from. */
  asset: MapAsset;
  /**
   * Cache Storage cache holding the CURRENT copy of this archive (PWA). The
   * name comes from the catalog, which vite.config.ts also imports, so the
   * service worker cannot drift onto another cache.
   */
  cacheName: string;
  /**
   * Superseded caches for the SAME archive, newest first — read as an offline
   * fallback and deleted only after the current revision downloads
   * successfully. Only the vector archive declares any; the others keep their
   * superseded revisions in place (catalog `supersededBytes`).
   */
  legacyCacheNames?: readonly string[];
  /** Pins which build of the archive counts as current. */
  revision: ArchiveRevision;
  /** Same-origin path under BASE_URL (default location / dev fallback). */
  path: string;
  /**
   * Resolves the absolute URL used BOTH to fetch the archive and as its Cache
   * Storage key. Defaults to the same-origin BASE_URL path; the satellite
   * archive overrides this to honour the optional VITE_SATELLITE_URL
   * alternative-hosting override (production serves it same-origin).
   */
  resolveUrl?: () => string;
  /**
   * This archive ships INSIDE the Android app package (the Vite build copies
   * it into dist, `cap sync` into assets/public, and CI verifies it in the
   * packaged AAB/APK). In the native shell it is read as one complete file
   * through a blob-backed source — never with byte-range requests, which the
   * in-app asset server does not serve correctly (src/map/bundledArchive.mjs
   * records the measurements). Only the vector basemap; the optional archives
   * are downloaded into app-private storage instead (src/map/archiveStore.ts).
   */
  bundledInApp: boolean;
}

const sameOriginUrl = (path: string): string =>
  new URL(`${import.meta.env.BASE_URL}${path}`, window.location.origin).toString();

/** Build the runtime spec for a catalog asset. The catalog decides everything. */
function specFor(id: string, resolveUrl?: () => string): ArchiveSpec {
  const asset = mapAsset(id);
  return {
    asset,
    cacheName: asset.cacheName,
    legacyCacheNames: asset.legacyCacheNames,
    revision: asset.revision,
    path: mapAssetPath(asset),
    resolveUrl,
    bundledInApp: asset.distribution === 'bundled',
  };
}

export const VECTOR_ARCHIVE: ArchiveSpec = specFor('vector');

/**
 * Terrain relief: two archives managed as ONE user-facing download (the
 * Settings "Terrain relief" card) because neither is useful alone —
 * hillshade needs the terrain-RGB raster, contours need the vector lines.
 * The grouping itself is declared in the catalog (MAP_DOWNLOAD_GROUPS).
 * Built by scripts/build-terrain-map.sh from the Copernicus GLO-30 DEM;
 * like the satellite archive, the binaries are never committed — deployment
 * injects the verified terrain-data release assets into the Pages build, and
 * Android downloads the same release assets natively.
 */
export const TERRAIN_ARCHIVE: ArchiveSpec = specFor('terrain');

export const CONTOURS_ARCHIVE: ArchiveSpec = specFor('contours');

// Same-origin by default: deployment downloads the canonical archive from the
// pinned GitHub Release (satellite-data-vN) into the Pages build, so browsers
// fetch it from the app's own origin — no CORS. The binary is never committed.
// VITE_SATELLITE_URL remains an optional override for alternative hosting; if
// the file is absent (e.g. local dev), resolveSatellite() detects the HTML/404
// fallback and the Satellite toggle stays disabled.
export const SATELLITE_ARCHIVE: ArchiveSpec = specFor('satellite', () => {
  const configured = import.meta.env.VITE_SATELLITE_URL?.trim();
  return configured ? configured : sameOriginUrl(mapAssetPath(mapAsset('satellite')));
});

/**
 * Satellite HD detail — the native-only add-on above Satellite Basic: two
 * z16 orthophoto shards managed as ONE download (catalog group
 * 'satelliteHd'), split only because GitHub caps a Release asset at 2 GiB.
 * `platforms.web` is false, so the browser never offers them and their
 * same-origin path never resolves to a real file; Android downloads both
 * straight from the pinned satellite-hd-data release like every other
 * optional archive.
 */
export const SATELLITE_HD_NORTH_ARCHIVE: ArchiveSpec = specFor('satelliteHdNorth');
export const SATELLITE_HD_SOUTH_ARCHIVE: ArchiveSpec = specFor('satelliteHdSouth');
export const SATELLITE_HD_ARCHIVES: readonly ArchiveSpec[] = [
  SATELLITE_HD_NORTH_ARCHIVE,
  SATELLITE_HD_SOUTH_ARCHIVE,
];

/** @deprecated kept for existing imports; prefer VECTOR_ARCHIVE.cacheName. */
export const OFFLINE_MAP_CACHE = VECTOR_ARCHIVE.cacheName;

/**
 * Absolute URL of an archive: fetch target AND Cache Storage key. Both must be
 * identical so a downloaded blob is found again on the next load; bumping the
 * satellite release tag deliberately changes this URL so a new archive is
 * re-downloaded rather than served stale.
 */
export function archiveUrl(spec: ArchiveSpec): string {
  return spec.resolveUrl ? spec.resolveUrl() : sameOriginUrl(spec.path);
}

/** Absolute URL of the regional vector basemap. */
export function offlineMapUrl(): string {
  return archiveUrl(VECTOR_ARCHIVE);
}

// NOTE: there is deliberately no satelliteMapUrl() helper any more. It existed
// for the hosted-satellite streaming path, and satellite is now a download on
// both platforms (see resolveSatellite). The download itself still resolves its
// URL through archiveUrl(SATELLITE_ARCHIVE), honouring VITE_SATELLITE_URL.

export interface OfflineMapStatus {
  supported: boolean;
  /**
   * A USABLE archive is stored on this device — the current revision or a
   * shipped legacy one. False for an unusable current-cache entry.
   */
  downloaded: boolean;
  /** Bytes stored; for 'invalid', the size of the unusable entry. */
  sizeBytes: number | null;
  /** Unrevisioned archives only ever report 'current' or 'absent'. */
  state: ArchiveState;
  /** Bytes the current revision must have, or null when none is declared. */
  expectedBytes: number | null;
  /** A newer archive revision is available to download (state === 'legacy'). */
  updateAvailable: boolean;
  /** Stored data that cannot be used and must be downloaded again. */
  needsRepair: boolean;
}

const UNSUPPORTED: OfflineMapStatus = {
  supported: false,
  downloaded: false,
  sizeBytes: null,
  state: 'absent',
  expectedBytes: null,
  updateAvailable: false,
  needsRepair: false,
};

/** What the archive-revision contract needs to probe one spec's caches. */
const probeSpec = (spec: ArchiveSpec) => ({
  cacheName: spec.cacheName,
  url: archiveUrl(spec),
  legacyCacheNames: spec.legacyCacheNames ?? [],
  expectedBytes: spec.revision.bytes,
  supersededBytes: spec.asset.supersededBytes,
});

export async function getArchiveStatus(spec: ArchiveSpec): Promise<OfflineMapStatus> {
  if (!('caches' in window)) return UNSUPPORTED;
  const { state, sizeBytes, expectedBytes, downloaded, updateAvailable, needsRepair } =
    await probeArchiveCaches(caches, probeSpec(spec));
  return {
    supported: true,
    downloaded,
    sizeBytes,
    state,
    expectedBytes,
    updateAvailable,
    needsRepair,
  };
}

/**
 * Cached full-file blob for an archive, or null when there is nothing safe to
 * read. Prefers the current revision and falls back to a shipped legacy one,
 * so an offline device keeps a working map until it has downloaded the
 * replacement — but an unusable current-cache entry resolves to null rather
 * than to a blob PMTiles would choke on.
 */
export async function getArchiveBlob(spec: ArchiveSpec): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  const { cacheName } = await probeArchiveCaches(caches, probeSpec(spec));
  // Null for 'invalid' and 'absent' alike — the classification, not the mere
  // presence of bytes, decides whether the map gets a blob at all.
  if (!cacheName) return null;
  const cache = await caches.open(cacheName);
  const match = await cache.match(archiveUrl(spec));
  return match ? match.blob() : null;
}

/**
 * Download the full PMTiles file and store it as a single complete response.
 * Reports progress when the server provides Content-Length.
 *
 * Migration order matters and is deliberate: the archive is assembled in
 * memory, checked against the declared revision, and only then written — so a
 * fetch that fails, is cancelled, or returns the wrong archive leaves the
 * device exactly as it was. Superseded caches are pruned strictly AFTER the
 * successful write, which is the only point at which the old copy stops being
 * the device's working map.
 */
export async function downloadArchive(
  spec: ArchiveSpec,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<number> {
  const url = archiveUrl(spec);
  // Two separate bypasses, because there are two caches in the way:
  //   - cache: 'no-store' skips a stale HTTP-cache copy;
  //   - the ?rev= fetch URL takes the request out of the service worker's
  //     CacheFirst route, which would otherwise answer it from Cache Storage
  //     without ever reaching the server (measured — see archiveFetchUrl).
  // The Cache Storage key below stays the bare `url`.
  const res = await fetch(archiveFetchUrl(url, spec.revision.id), {
    cache: 'no-store',
  });
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

  // Verify → store → prune, in that order and nowhere else.
  const { bytes } = await storeArchiveRevision(
    caches,
    probeSpec(spec),
    blob,
    (b) =>
      new Response(b, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(b.size),
        },
      }),
  );
  return bytes;
}

/**
 * Remove an archive from the device, superseded revisions included. Deletes
 * the caches by name, so nothing is left behind — not the entry, not an empty
 * cache, and never another archive's cache.
 */
export async function removeArchive(spec: ArchiveSpec): Promise<void> {
  if (!('caches' in window)) return;
  await removeArchiveRevision(caches, probeSpec(spec));
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
