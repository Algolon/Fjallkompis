/**
 * Android's offline map storage — the JS half of MapArchivePlugin.java.
 *
 * The PWA keeps archives in Cache Storage. Android keeps them as real files in
 * app-private internal storage, for the two reasons recorded in the plugin: a
 * WebView's Cache Storage is quota-evictable (wrong contract for ~90 MB a
 * hiker needs on day four), and reading a stored file back through
 * `convertFileSrc` would go through Capacitor's local server, whose range
 * branch still returns the rest of the file for every read — the versionCode
 * 2700001 blank-basemap defect.
 *
 * What this module deliberately does NOT do is invent a second product model.
 * Status is classified by the SAME pure decision table the PWA uses
 * (classifyArchiveProbe), so `current` / `legacy` / `invalid` / `absent` mean
 * one thing on both platforms, and the shared Settings card needs no branch.
 * Identity comes from src/map/mapCatalog.mjs and is passed to the plugin per
 * call, so no archive name, URL, size or hash exists in Java.
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Source, RangeResponse } from 'pmtiles';
import { classifyStoredArchive } from './archiveRevision.mjs';
import type { MapAsset } from './mapCatalog.mjs';
import { mapAssetReleaseUrl } from './mapCatalog.mjs';

interface MapArchiveStatus {
  present: boolean;
  bytes: number;
  /** Revision recorded when the file was verified, or null if unknown. */
  revisionId: string | null;
}

interface MapArchiveBridge {
  status(options: { id: string }): Promise<MapArchiveStatus>;
  usage(): Promise<{ bytes: number }>;
  download(options: {
    id: string;
    url: string;
    expectedBytes: number;
    expectedSha256: string;
    revisionId: string;
  }): Promise<{ bytes: number }>;
  cancel(options: { id: string }): Promise<void>;
  remove(options: { id: string }): Promise<void>;
  readRange(options: { id: string; offset: number; length: number }): Promise<{ data: string }>;
  addListener(
    event: 'mapArchiveProgress',
    handler: (event: { id: string; loaded: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const MapArchive = registerPlugin<MapArchiveBridge>('MapArchive');

/** `Error.name` for a download the user stopped — not a failure to report. */
export const ARCHIVE_CANCELLED_ERROR = 'ArchiveDownloadCancelled';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * A PMTiles `Source` over a stored file, one slice at a time.
 *
 * The counterpart of `BlobSource` in pmtilesProtocol.ts, and the reason the
 * satellite archive can be 60 MB without ever being 60 MB of JavaScript heap:
 * PMTiles asks for a header, some directory pages and one tile at a time, and
 * each of those is a small `readRange` call. Capacitor serialises plugin calls
 * on its own thread, off the main thread, so a burst of tile reads queues
 * rather than janking the map.
 */
export class NativeArchiveSource implements Source {
  constructor(
    private readonly assetId: string,
    private readonly key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const { data } = await MapArchive.readRange({ id: this.assetId, offset, length });
    return { data: base64ToArrayBuffer(data) };
  }
}

/**
 * What this device holds for one optional archive, in the shared vocabulary.
 * The decision itself is pure and lives with the revision contract, next to
 * the Cache Storage one, so both platforms are demonstrably the same table.
 */
export async function nativeArchiveStatus(asset: MapAsset) {
  return classifyStoredArchive(await MapArchive.status({ id: asset.id }), asset);
}

/** Bytes this app is using for downloaded archives, across all of them. */
export async function nativeArchiveUsage(): Promise<number> {
  const { bytes } = await MapArchive.usage();
  return bytes;
}

/**
 * Download one optional archive from its canonical GitHub Release asset — the
 * same tag, the same bytes and the same SHA-256 that deployment injects into
 * the Pages build for the PWA. A native HTTP request is not subject to CORS,
 * which is the only reason the two platforms can share one origin for these
 * files at all.
 *
 * Verification (size AND digest) happens natively, before the file is given
 * its real name, so a partial or corrupt download can never be opened.
 */
export async function downloadNativeArchive(
  asset: MapAsset,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<number> {
  const listener = await MapArchive.addListener('mapArchiveProgress', (event) => {
    if (event.id === asset.id) onProgress(event.loaded, event.total || null);
  });
  try {
    const { bytes } = await MapArchive.download({
      id: asset.id,
      url: mapAssetReleaseUrl(asset),
      expectedBytes: asset.revision.bytes,
      expectedSha256: asset.revision.sha256,
      revisionId: asset.revision.id,
    });
    return bytes;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'CANCELLED') {
      const cancelled = new Error('Download cancelled');
      cancelled.name = ARCHIVE_CANCELLED_ERROR;
      throw cancelled;
    }
    throw error;
  } finally {
    await listener.remove();
  }
}

/** Stop an in-flight download. The partial file is discarded natively. */
export async function cancelNativeArchive(asset: MapAsset): Promise<void> {
  await MapArchive.cancel({ id: asset.id });
}

/** Remove ONE archive. Scoped by id, so no other archive can be affected. */
export async function removeNativeArchive(asset: MapAsset): Promise<void> {
  await MapArchive.remove({ id: asset.id });
}
