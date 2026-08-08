/**
 * PMTiles ↔ MapLibre wiring.
 *
 * The pmtiles:// protocol is registered exactly ONCE per page (module-level
 * guard) — never per map instance or per React render.
 *
 * Basemap resolution order:
 *   1. offline: the user-downloaded blob from Cache Storage, read through a
 *      blob-backed PMTiles Source (works without a service worker);
 *   2. bundled (native shell only): the archive shipped inside the app
 *      package, fetched ONCE as a complete file and read through the same
 *      blob-backed source — never with range requests, which Capacitor's
 *      asset server does not serve correctly (src/map/bundledArchive.mjs);
 *   3. online:  the hosted .pmtiles file via HTTP range requests;
 *   4. none:    no basemap available — the map falls back to a clearly
 *               marked plain-background placeholder with route layers only.
 */
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import type { Source, RangeResponse } from 'pmtiles';
import {
  archiveUrl,
  getArchiveBlob,
  satelliteMapUrl,
  SATELLITE_ARCHIVE,
  VECTOR_ARCHIVE,
  type ArchiveSpec,
} from './offlineMap';
import { classifyBundledArchive } from './bundledArchive.mjs';
import { isNativeAndroid } from '../runtime/platform';

let protocol: Protocol | null = null;

export function ensurePmtilesProtocol(): Protocol {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }
  return protocol;
}

/** PMTiles Source backed by an in-memory Blob (the cached offline map). */
class BlobSource implements Source {
  constructor(
    private blob: Blob,
    private key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const data = await this.blob.slice(offset, offset + length).arrayBuffer();
    return { data };
  }
}

export type BasemapMode = 'offline' | 'online' | 'none';

export interface BasemapResolution {
  mode: BasemapMode;
  /** style `url` for the vector source, e.g. pmtiles://… (null for 'none'). */
  sourceUrl: string | null;
}

const SATELLITE_OFFLINE_KEY = 'offline://kungsleden-satellite';

/**
 * Is a response an actual hosted .pmtiles file, not an SPA fallback? Static
 * hosts (and vite preview) answer a request for a MISSING file with the app
 * shell — `200 OK` + `text/html` — which would otherwise look like an available
 * archive and crash MapLibre with "wrong magic number". A real PMTiles file is
 * served as a binary type (octet-stream / vnd.pmtiles / empty), never text/html.
 */
function looksLikeArchive(res: Response): boolean {
  if (!res.ok) return false;
  const type = res.headers.get('Content-Type') ?? '';
  return !type.toLowerCase().includes('text/html');
}

/**
 * Probe a hosted archive with a tiny ranged GET. Confirms the host serves
 * binary range data rather than a 404/HTML fallback (e.g. local dev without
 * the satellite archive). Works same-origin (production: Pages serves the
 * deploy-injected archive from the app's own origin) and, for the optional
 * VITE_SATELLITE_URL override, cross-origin too (`Range` is a CORS-safelisted
 * header, so no preflight). The body is discarded — if the server ever
 * ignores `Range` and returns the full 200, we cancel it instead of
 * downloading the whole archive.
 */
async function probeHostedArchive(url: string): Promise<boolean> {
  const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
  try {
    return looksLikeArchive(res);
  } finally {
    await res.body?.cancel().catch(() => {});
  }
}

/**
 * One full-body read of an archive shipped inside the Android app package,
 * kept for the session: the packaged asset cannot change while the app runs,
 * and re-reading ~6 MB on every Map mount would be pure waste. Never persisted
 * — Cache Storage stays reserved for the user-managed download flow.
 */
const bundledBlobs = new Map<string, Promise<Blob | null>>();

/**
 * The bundled archive as a Blob, or null when the package does not actually
 * carry a usable copy. A plain GET without a Range header: the in-app asset
 * server serves complete files correctly — it is only its byte-range answers
 * that are broken (measured; see src/map/bundledArchive.mjs).
 */
function getBundledArchiveBlob(spec: ArchiveSpec): Promise<Blob | null> {
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
        spec.revision ?? null,
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

/**
 * Decide where an archive's basemap tiles come from, preferring the offline
 * copy. Called on map mount; cheap (one cache lookup + at most one tiny
 * ranged probe; in the native shell the bundled archive is read once per
 * session). Works for any vector-basemap ArchiveSpec: the Kungsleden
 * default and the temporary Delft pilot archive. A hosted archive that does
 * not exist (e.g. the pilot file before it is built) is detected safely via
 * probeHostedArchive and resolves to 'none' instead of crashing MapLibre.
 */
export async function resolveArchiveBasemap(
  spec: ArchiveSpec,
): Promise<BasemapResolution> {
  const proto = ensurePmtilesProtocol();
  // In-memory protocol key, unique per archive (never persisted).
  const offlineKey = `offline://${spec.cacheName}`;

  const blob = await getArchiveBlob(spec);
  if (blob) {
    // Re-adding under the same key replaces the previous instance, which is
    // exactly what we want after a re-download.
    proto.add(new PMTiles(new BlobSource(blob, offlineKey)));
    return { mode: 'offline', sourceUrl: `pmtiles://${offlineKey}` };
  }

  // Native shell: the archive ships inside the app package and MUST be read
  // whole. The ranged 'online' path below would resolve here too — the tiny
  // probe looks fine — and then hand PMTiles the asset server's broken range
  // responses, which is exactly the fresh-install blank-basemap regression.
  if (spec.bundledInApp && isNativeAndroid()) {
    const bundled = await getBundledArchiveBlob(spec);
    if (bundled) {
      proto.add(new PMTiles(new BlobSource(bundled, offlineKey)));
      return { mode: 'offline', sourceUrl: `pmtiles://${offlineKey}` };
    }
  }

  try {
    if (await probeHostedArchive(archiveUrl(spec))) {
      return { mode: 'online', sourceUrl: `pmtiles://${archiveUrl(spec)}` };
    }
  } catch {
    // Network down and no offline copy — fall through to 'none'.
  }
  return { mode: 'none', sourceUrl: null };
}

/** The Kungsleden vector basemap (existing call sites). */
export function resolveBasemap(): Promise<BasemapResolution> {
  return resolveArchiveBasemap(VECTOR_ARCHIVE);
}

/**
 * Resolve the optional satellite raster PMTiles archive, preferring the
 * user-downloaded offline copy and falling back to the hosted file. Returns a
 * null sourceUrl when no satellite archive is available anywhere, so callers
 * can disable the toggle instead of adding a broken layer.
 *
 * The canonical archive lives on a versioned GitHub Release; deploy.yml
 * downloads and verifies it into the Pages build, so production serves it
 * same-origin from maps/ (VITE_SATELLITE_URL is only an optional override for
 * alternative hosting). Once the user downloads it in Settings the offline
 * blob is preferred and no network is touched. The hosted probe is a tiny
 * ranged GET (see probeHostedArchive).
 */
export async function resolveSatellite(): Promise<BasemapResolution> {
  const proto = ensurePmtilesProtocol();

  const blob = await getArchiveBlob(SATELLITE_ARCHIVE);
  if (blob) {
    proto.add(new PMTiles(new BlobSource(blob, SATELLITE_OFFLINE_KEY)));
    return { mode: 'offline', sourceUrl: `pmtiles://${SATELLITE_OFFLINE_KEY}` };
  }

  try {
    if (await probeHostedArchive(satelliteMapUrl())) {
      return { mode: 'online', sourceUrl: `pmtiles://${satelliteMapUrl()}` };
    }
  } catch {
    // No offline copy and the hosted file is unreachable — no satellite.
  }
  return { mode: 'none', sourceUrl: null };
}
