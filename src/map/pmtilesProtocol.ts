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
import { getOfflineMapBlob, offlineMapUrl } from './offlineMap';

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
    if (head.ok) {
      return { mode: 'online', sourceUrl: `pmtiles://${offlineMapUrl()}` };
    }
  } catch {
    // Network down and no offline copy — fall through to 'none'.
  }
  return { mode: 'none', sourceUrl: null };
}
