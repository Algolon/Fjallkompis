/**
 * PMTiles ↔ MapLibre wiring.
 *
 * The pmtiles:// protocol is registered exactly ONCE per page (module-level
 * guard) — never per map instance or per React render.
 *
 * Basemap resolution order:
 *   1. offline: the user-downloaded blob from Cache Storage, read through a
 *      blob-backed PMTiles Source (works without a service worker);
 *   2. online:  the hosted .pmtiles file via HTTP range requests;
 *   3. none:    no basemap available — the map falls back to a clearly
 *               marked plain-background placeholder with route layers only.
 */
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import type { Source, RangeResponse } from 'pmtiles';
import {
  getArchiveBlob,
  getOfflineMapBlob,
  offlineMapUrl,
  satelliteMapUrl,
  SATELLITE_ARCHIVE,
} from './offlineMap';

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

const OFFLINE_KEY = 'offline://kungsleden';
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
 * Probe a hosted archive with a tiny ranged GET. Works for the cross-origin
 * GitHub Release asset (`Range` is a CORS-safelisted header, so no preflight;
 * GitHub answers 206 + `access-control-allow-origin: *`), and also confirms the
 * host serves binary range data rather than a 404/HTML fallback. Same-origin
 * hosts answer it just as happily. The body is discarded — if the server ever
 * ignores `Range` and returns the full 200, we cancel it instead of downloading
 * the whole archive.
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
 * Decide where basemap tiles come from, preferring the offline copy.
 * Called on map mount; cheap (one cache lookup + at most one HEAD request).
 */
export async function resolveBasemap(): Promise<BasemapResolution> {
  const proto = ensurePmtilesProtocol();

  const blob = await getOfflineMapBlob();
  if (blob) {
    // Re-adding under the same key replaces the previous instance, which is
    // exactly what we want after a re-download.
    proto.add(new PMTiles(new BlobSource(blob, OFFLINE_KEY)));
    return { mode: 'offline', sourceUrl: `pmtiles://${OFFLINE_KEY}` };
  }

  try {
    const head = await fetch(offlineMapUrl(), { method: 'HEAD' });
    if (looksLikeArchive(head)) {
      return { mode: 'online', sourceUrl: `pmtiles://${offlineMapUrl()}` };
    }
  } catch {
    // Network down and no offline copy — fall through to 'none'.
  }
  return { mode: 'none', sourceUrl: null };
}

/**
 * Resolve the optional satellite raster PMTiles archive, preferring the
 * user-downloaded offline copy and falling back to the hosted file. Returns a
 * null sourceUrl when no satellite archive is available anywhere, so callers
 * can disable the toggle instead of adding a broken layer.
 *
 * The archive is hosted off-repo as a versioned GitHub Release asset
 * (VITE_SATELLITE_URL); once the user downloads it in Settings the offline blob
 * is preferred and no network is touched. The hosted probe is a cross-origin
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
