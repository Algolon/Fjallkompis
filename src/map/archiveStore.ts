/**
 * THE platform boundary for offline map archives.
 *
 * One vocabulary, two mechanics. Everything above this module — the Settings
 * cards, Trail readiness, the PMTiles wiring, MapView — asks the same four
 * questions of every archive (what do I hold? give me a source; download it;
 * remove it) and never asks which platform it is on. Everything below is the
 * storage that platform actually justifies:
 *
 *   web / installed PWA → Cache Storage (src/map/offlineMap.ts), unchanged;
 *   Capacitor Android   → app-private files (src/map/nativeArchiveStore.ts);
 *   Android, bundled    → the archive inside the app package, read whole.
 *
 * The states are shared on purpose. `current`, `legacy`, `invalid` and
 * `absent` come out of the same pure decision table on both platforms
 * (src/map/archiveRevision.mjs), so "update available" and "needs repair"
 * cannot come to mean different things on a phone than in a browser. The one
 * state this module adds is `bundled`: present, verified, shipped with the app
 * and therefore not removable. It is a fact about the archive, not a fact
 * about Android — it simply happens that only the native package has one.
 *
 * Why the seam is here and not in the screens: the alternative is an
 * `isNativeAndroid()` inside OfflineMapCard, then another in useTrailReadiness,
 * then a third in MapView, and by then the platforms have quietly forked. The
 * rule from src/runtime/platform.ts applies to map data too.
 */
import { isNativeAndroid } from '../runtime/platform';
import { classifyBundledArchive } from './bundledArchive.mjs';
import type { ArchiveState } from './archiveRevision.mjs';
import {
  archiveUrl,
  downloadArchive,
  getArchiveBlob,
  getArchiveStatus,
  removeArchive,
  type ArchiveSpec,
} from './offlineMap';
import {
  NativeArchiveSource,
  cancelNativeArchive,
  downloadNativeArchive,
  nativeArchiveStatus,
  removeNativeArchive,
} from './nativeArchiveStore';

/** `bundled` widens the shared states with "ships inside the app package". */
export type StoredArchiveState = ArchiveState | 'bundled';

export interface StoredArchiveStatus {
  /** This platform can store archives at all (a browser without Cache Storage). */
  supported: boolean;
  /** A USABLE archive is present — current, a shipped superseded one, or bundled. */
  downloaded: boolean;
  /** Bytes stored; for `invalid`, the size of the unusable entry. */
  sizeBytes: number | null;
  state: StoredArchiveState;
  /** Bytes the current revision needs. */
  expectedBytes: number | null;
  /** A newer revision is available to download. */
  updateAvailable: boolean;
  /** Stored data that cannot be used and must be downloaded again. */
  needsRepair: boolean;
  /**
   * An in-flight download can be stopped. True only for the native store: a
   * browser `fetch` here is not abortable mid-stream by design (the PWA's
   * download assembles one Blob and either completes or throws), so offering
   * a Cancel button there would be a control that does nothing.
   *
   * There is deliberately no `removable` or `downloadable` alongside this: the
   * `bundled` state already says an archive has nothing to fetch and nothing
   * to reclaim, and a second way to express the same fact is a second thing to
   * keep in agreement.
   */
  cancellable: boolean;
}

const BUNDLED_STATUS = (expectedBytes: number): StoredArchiveStatus => ({
  supported: true,
  downloaded: true,
  sizeBytes: expectedBytes,
  state: 'bundled',
  expectedBytes,
  updateAvailable: false,
  needsRepair: false,
  cancellable: false,
});

/** True when this archive is served from the Android app package right now. */
function isBundledHere(spec: ArchiveSpec): boolean {
  return spec.bundledInApp && isNativeAndroid();
}

/**
 * What this device holds for one archive.
 *
 * The bundled case answers without touching storage, which is also what makes
 * Trail readiness honest on Android: the vector basemap works offline from
 * first launch, so a card reading "Not downloaded" — which is what a Cache
 * Storage probe reports there — was describing the platform, not the device.
 */
export async function archiveStatus(spec: ArchiveSpec): Promise<StoredArchiveStatus> {
  if (isBundledHere(spec)) return BUNDLED_STATUS(spec.revision.bytes);

  if (isNativeAndroid()) {
    const probe = await nativeArchiveStatus(spec.asset);
    return {
      supported: true,
      downloaded: probe.downloaded,
      sizeBytes: probe.sizeBytes,
      state: probe.state,
      expectedBytes: probe.expectedBytes,
      updateAvailable: probe.updateAvailable,
      needsRepair: probe.needsRepair,
      cancellable: true,
    };
  }

  return { ...(await getArchiveStatus(spec)), cancellable: false };
}

/**
 * One full-body read of an archive shipped inside the Android app package,
 * kept for the session: the packaged asset cannot change while the app runs,
 * and re-reading ~6 MB on every Map mount would be pure waste. Never persisted
 * — Cache Storage stays reserved for the browser download flow.
 */
const bundledBlobs = new Map<string, Promise<Blob | null>>();

/**
 * The bundled archive as a Blob, or null when the package does not actually
 * carry a usable copy. A plain GET with NO Range header: the in-app asset
 * server serves complete files correctly — it is only its byte-range answers
 * that are broken (measured; see src/map/bundledArchive.mjs).
 */
export function getBundledArchiveBlob(spec: ArchiveSpec): Promise<Blob | null> {
  const url = archiveUrl(spec);
  let pending = bundledBlobs.get(url);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(url);
      const blob = res.ok ? await res.blob() : null;
      if (!blob) await res.body?.cancel().catch(() => {});
      const verdict = classifyBundledArchive(
        {
          ok: res.ok,
          contentType: res.headers.get('Content-Type'),
          sizeBytes: blob?.size ?? 0,
        },
        spec.revision,
      );
      if (!verdict.usable || !blob) {
        console.error(`[fjällkompis] ${verdict.reason}: ${url}`);
        return null;
      }
      return blob;
    })().catch(() => null);
    bundledBlobs.set(url, pending);
  }
  return pending;
}

/** A local copy of an archive: the Blob to read, or null when there is none. */
export interface LocalArchive {
  blob: Blob | null;
  /** Set instead of `blob` when the bytes stay on disk and are read in slices. */
  nativeAssetId: string | null;
}

/**
 * The locally stored copy of an archive, in whatever form this platform keeps
 * it — or null when the device has nothing safe to read.
 *
 * "Safe" is doing real work here: an `invalid` Cache Storage entry and a
 * `.part` file on Android both resolve to null rather than to bytes PMTiles
 * would choke on. Half a PMTiles archive is not half a map, it is a crash.
 */
export async function openLocalArchive(spec: ArchiveSpec): Promise<LocalArchive | null> {
  if (isBundledHere(spec)) {
    const blob = await getBundledArchiveBlob(spec);
    return blob ? { blob, nativeAssetId: null } : null;
  }

  if (isNativeAndroid()) {
    const probe = await nativeArchiveStatus(spec.asset);
    // `downloaded` covers current AND a shipped superseded revision — a device
    // that has not updated yet keeps the map it has.
    return probe.downloaded ? { blob: null, nativeAssetId: spec.asset.id } : null;
  }

  const blob = await getArchiveBlob(spec);
  return blob ? { blob, nativeAssetId: null } : null;
}

/** A PMTiles source over the native store, for `openLocalArchive` results. */
export function nativeArchiveSource(assetId: string, key: string): NativeArchiveSource {
  return new NativeArchiveSource(assetId, key);
}

/**
 * Download one archive and store it, or leave the device exactly as it was.
 *
 * Both platforms verify before they commit — the PWA against the declared byte
 * length, Android against the byte length AND the SHA-256, which it gets for
 * free because the bytes are already streaming through native code. Neither
 * replaces a working archive with an unverified one.
 */
export function downloadArchiveToDevice(
  spec: ArchiveSpec,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<number> {
  if (isBundledHere(spec)) {
    return Promise.reject(new Error('This map is included in the app and cannot be downloaded.'));
  }
  return isNativeAndroid()
    ? downloadNativeArchive(spec.asset, onProgress)
    : downloadArchive(spec, onProgress);
}

/** Stop an in-flight download. Only the native store can interrupt one today. */
export async function cancelArchiveDownload(spec: ArchiveSpec): Promise<void> {
  if (isNativeAndroid() && !isBundledHere(spec)) await cancelNativeArchive(spec.asset);
}

/**
 * Remove ONE archive from the device, superseded copies included. Scoped to
 * the archive it was given on both platforms, so deleting the satellite
 * imagery cannot disturb terrain, contours or the basemap.
 */
export async function removeArchiveFromDevice(spec: ArchiveSpec): Promise<void> {
  if (isBundledHere(spec)) return;
  if (isNativeAndroid()) {
    await removeNativeArchive(spec.asset);
    return;
  }
  await removeArchive(spec);
}
