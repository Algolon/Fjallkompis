/**
 * PMTiles ↔ MapLibre wiring.
 *
 * The pmtiles:// protocol is registered exactly ONCE per page (module-level
 * guard) — never per map instance or per React render.
 *
 * Basemap resolution order:
 *   1. local:   whatever this platform has stored — the downloaded Cache
 *               Storage blob in a browser, the downloaded app-private file on
 *               Android, or the archive bundled in the app package. The
 *               platform mechanics live behind src/map/archiveStore.ts; what
 *               reaches PMTiles here is always a Source, never a URL.
 *   2. online:  the hosted .pmtiles file via HTTP range requests;
 *   3. none:    no basemap available — the map falls back to a clearly
 *               marked plain-background placeholder with route layers only.
 *
 * The local step comes first everywhere, and on Android it is the ONLY step
 * that can succeed for a packaged archive: the ranged 'online' path resolves
 * against Capacitor's asset server, whose range answers are broken, and
 * handing PMTiles those responses is exactly the fresh-install blank-basemap
 * regression (src/map/bundledArchive.mjs records the measurements).
 */
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import type { Source, RangeResponse } from 'pmtiles';
import {
  archiveUrl,
  SATELLITE_ARCHIVE,
  VECTOR_ARCHIVE,
  type ArchiveSpec,
} from './offlineMap';
import { nativeArchiveSource, openLocalArchive } from './archiveStore';

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
 * Register the locally stored copy of an archive with the protocol, if there
 * is one, and return its `pmtiles://` URL.
 *
 * The store decides what "locally stored" means on this platform and hands
 * back either a Blob (a Cache Storage download, or the archive read whole out
 * of the Android app package) or an asset id whose bytes stay on disk and are
 * read in slices. Both become a PMTiles `Source`; neither becomes a URL the
 * network — or Capacitor's asset server — could be asked to range-serve.
 */
async function addLocalSource(spec: ArchiveSpec, key: string): Promise<boolean> {
  const local = await openLocalArchive(spec);
  if (!local) return false;
  const source = local.blob
    ? new BlobSource(local.blob, key)
    : nativeArchiveSource(local.nativeAssetId!, key);
  // Re-adding under the same key replaces the previous instance, which is
  // exactly what we want after a re-download.
  ensurePmtilesProtocol().add(new PMTiles(source));
  return true;
}

/**
 * Decide where an archive's tiles come from, preferring the local copy. Called
 * on map mount; cheap (one storage probe, and at most one tiny ranged probe for
 * the basemap; in the native shell a packaged archive is read once per
 * session).
 *
 * THE ONLINE FALLBACK IS FOR THE BASEMAP ONLY, and that asymmetry is the
 * product rule rather than an implementation detail. An OPTIONAL archive
 * (terrain, contours, satellite) is usable only once it has been downloaded —
 * on the PWA exactly as on Android. Streaming one on demand would mean a
 * multi-megabyte terrain or satellite transfer starting because somebody opened a menu, which is
 * the opposite of what an offline-first trail companion should do, and it
 * would give the two platforms different availability states under the same
 * label. The bundled/hosted basemap keeps its fallback: it is the map you get
 * before you have chosen anything, it is ~6 MB, and on Android it is in the
 * app package already.
 *
 * A hosted basemap that does not exist (e.g. the Delft pilot archive before it
 * is built) is detected safely via probeHostedArchive and resolves to 'none'
 * instead of crashing MapLibre.
 */
export async function resolveArchiveBasemap(
  spec: ArchiveSpec,
): Promise<BasemapResolution> {
  ensurePmtilesProtocol();
  // In-memory protocol key, unique per archive (never persisted).
  const offlineKey = `offline://${spec.cacheName}`;

  if (await addLocalSource(spec, offlineKey)) {
    return { mode: 'offline', sourceUrl: `pmtiles://${offlineKey}` };
  }

  if (spec.asset.distribution === 'optional') {
    // Downloaded or absent; there is no third state.
    return { mode: 'none', sourceUrl: null };
  }

  try {
    if (await probeHostedArchive(archiveUrl(spec))) {
      return { mode: 'online', sourceUrl: `pmtiles://${archiveUrl(spec)}` };
    }
  } catch {
    // Network down and no local copy — fall through to 'none'.
  }
  return { mode: 'none', sourceUrl: null };
}

/** The Kungsleden vector basemap (existing call sites). */
export function resolveBasemap(): Promise<BasemapResolution> {
  return resolveArchiveBasemap(VECTOR_ARCHIVE);
}

/**
 * Resolve the optional satellite raster archive from the local copy, or not at
 * all. Returns a null sourceUrl when the user has not downloaded it, so callers
 * disable the toggle instead of adding a layer that would pull ~280 MB over
 * whatever connection the reader happens to be on.
 *
 * The canonical archive lives on a versioned GitHub Release (pinned in
 * src/map/mapCatalog.mjs). Deployment injects it into the Pages build for the
 * PWA's download, and Android downloads the same release asset natively —
 * same bytes, same revision, and on both platforms it must be downloaded
 * before Satellite becomes selectable.
 */
export async function resolveSatellite(): Promise<BasemapResolution> {
  ensurePmtilesProtocol();

  if (await addLocalSource(SATELLITE_ARCHIVE, SATELLITE_OFFLINE_KEY)) {
    return { mode: 'offline', sourceUrl: `pmtiles://${SATELLITE_OFFLINE_KEY}` };
  }
  return { mode: 'none', sourceUrl: null };
}
