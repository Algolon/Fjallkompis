/**
 * PMTiles ↔ MapLibre wiring.
 *
 * The pmtiles:// protocol is registered exactly ONCE per page (module-level
 * guard) — never per map instance or per React render.
 *
 * Source resolution order for any asset (base map or overlay):
 *   1. offline: the user-downloaded blob from Cache Storage, read through a
 *      blob-backed PMTiles Source (works without a service worker);
 *   2. online:  the hosted .pmtiles file via HTTP range requests (only when
 *      the asset has actually shipped);
 *   3. none:    not downloaded and not (yet) hosted — the caller renders a
 *      clear "download required" / placeholder state instead.
 */
import maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import type { Source, RangeResponse } from 'pmtiles';
import type { OfflineAsset } from './assetRegistry.mjs';
import { OFFLINE_ASSETS } from './assetRegistry.mjs';
import { assetUrl, getAssetBlob } from './offlineAssets';

let protocol: Protocol | null = null;

export function ensurePmtilesProtocol(): Protocol {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }
  return protocol;
}

/** PMTiles Source backed by an in-memory Blob (a cached offline asset). */
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

export interface AssetResolution {
  assetId: string;
  mode: BasemapMode;
  /** style `url` for the source, e.g. pmtiles://… (null for 'none'). */
  sourceUrl: string | null;
}

/**
 * Resolve where an asset's tiles come from, preferring the offline copy.
 * Cheap: one cache lookup + (for shipped, undownloaded assets) at most one
 * HEAD request. Re-adding the blob source under the same key replaces the
 * previous instance, which is exactly what we want after a re-download.
 */
export async function resolveAssetSource(asset: OfflineAsset): Promise<AssetResolution> {
  const proto = ensurePmtilesProtocol();
  const key = `offline://${asset.id}`;

  const blob = await getAssetBlob(asset);
  if (blob) {
    proto.add(new PMTiles(new BlobSource(blob, key)));
    return { assetId: asset.id, mode: 'offline', sourceUrl: `pmtiles://${key}` };
  }

  // Only probe the network for assets that have actually been produced/hosted.
  if (asset.available) {
    try {
      const head = await fetch(assetUrl(asset), { method: 'HEAD' });
      if (head.ok) {
        return { assetId: asset.id, mode: 'online', sourceUrl: `pmtiles://${assetUrl(asset)}` };
      }
    } catch {
      // Network down and no offline copy — fall through to 'none'.
    }
  }

  return { assetId: asset.id, mode: 'none', sourceUrl: null };
}

export interface BasemapResolution {
  mode: BasemapMode;
  sourceUrl: string | null;
}

/** Resolve the topographic base map (the only base shipped today). */
export async function resolveBasemap(): Promise<BasemapResolution> {
  const { mode, sourceUrl } = await resolveAssetSource(OFFLINE_ASSETS.topographic);
  return { mode, sourceUrl };
}
