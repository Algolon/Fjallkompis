/**
 * Layer manager: reconciles the base map and overlays on an EXISTING MapLibre
 * instance from a MapConfig, without ever recreating the map.
 *
 * Invariants:
 *  - Exactly one base map is shown at a time (topographic ↔ satellite).
 *  - Overlays (hillshade, contours, labels) are independent toggles.
 *  - Every base/overlay layer is inserted BELOW `ROUTE_UNDERLAY_ID`, so the
 *    route, hut and GPS layers always stay above all map imagery.
 *  - An enabled-but-not-downloaded (or not-yet-produced) asset renders nothing
 *    and leaves the placeholder/base visible; the UI surfaces the required
 *    download separately.
 *
 * Reconciliation is incremental and idempotent: sources/layers already in the
 * correct state are left untouched (no tile refetch, no flashes).
 */
import type { Map as MlMap, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { MapConfig } from './mapConfig.mjs';
import type { OfflineAsset } from './assetRegistry.mjs';
import { OFFLINE_ASSETS } from './assetRegistry.mjs';
import { resolveAssetSource, type BasemapMode } from './pmtilesProtocol';
import {
  BASEMAP_SOURCE,
  SATELLITE_SOURCE,
  CONTOURS_SOURCE,
  HILLSHADE_SOURCE,
  LABELS_SOURCE,
  BASEMAP_ATTRIBUTION,
  SATELLITE_ATTRIBUTION,
  TERRAIN_ATTRIBUTION,
  ROUTE_UNDERLAY_ID,
  topoBaseLayers,
  topoBaseLayerIds,
  satelliteBaseLayers,
  contourOverlayLayers,
  hillshadeOverlayLayers,
  labelOverlayLayers,
} from './mapStyle';

interface LayerPlan {
  sourceId: string;
  source: (url: string) => SourceSpecification;
  layers: () => LayerSpecification[];
  layerIds: () => string[];
}

/** How each registry asset maps to a MapLibre source + layer group. */
const PLANS: Record<string, LayerPlan> = {
  topographic: {
    sourceId: BASEMAP_SOURCE,
    source: (url) => ({ type: 'vector', url, attribution: BASEMAP_ATTRIBUTION }),
    layers: topoBaseLayers,
    layerIds: topoBaseLayerIds,
  },
  satellite: {
    sourceId: SATELLITE_SOURCE,
    source: (url) => ({ type: 'raster', url, tileSize: 256, attribution: SATELLITE_ATTRIBUTION }),
    layers: satelliteBaseLayers,
    layerIds: () => ['base-satellite'],
  },
  contours: {
    sourceId: CONTOURS_SOURCE,
    source: (url) => ({ type: 'vector', url, attribution: TERRAIN_ATTRIBUTION }),
    layers: contourOverlayLayers,
    layerIds: () => ['overlay-contours-minor', 'overlay-contours-index'],
  },
  hillshade: {
    sourceId: HILLSHADE_SOURCE,
    source: (url) => ({
      type: 'raster-dem',
      url,
      tileSize: 512,
      encoding: 'mapbox',
      attribution: TERRAIN_ATTRIBUTION,
    }),
    layers: hillshadeOverlayLayers,
    layerIds: () => ['overlay-hillshade'],
  },
  labels: {
    sourceId: LABELS_SOURCE,
    source: (url) => ({ type: 'vector', url, attribution: '© OpenStreetMap contributors' }),
    layers: labelOverlayLayers,
    layerIds: () => ['overlay-labels'],
  },
};

/** Route layers are added first on load, so keep imagery below them. */
function beforeId(map: MlMap): string | undefined {
  return map.getLayer(ROUTE_UNDERLAY_ID) ? ROUTE_UNDERLAY_ID : undefined;
}

function removeAssetLayers(map: MlMap, assetId: string): void {
  const plan = PLANS[assetId];
  if (!plan) return;
  for (const id of plan.layerIds()) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(plan.sourceId)) map.removeSource(plan.sourceId);
}

function ensureAssetLayers(map: MlMap, assetId: string, sourceUrl: string): void {
  const plan = PLANS[assetId];
  if (!plan) return;
  if (!map.getSource(plan.sourceId)) map.addSource(plan.sourceId, plan.source(sourceUrl));
  const before = beforeId(map);
  for (const layer of plan.layers()) if (!map.getLayer(layer.id)) map.addLayer(layer, before);
}

async function reconcileOverlay(map: MlMap, assetId: string, enabled: boolean): Promise<void> {
  const asset: OfflineAsset = OFFLINE_ASSETS[assetId];
  const plan = PLANS[assetId];
  const present = plan.layerIds().some((id) => map.getLayer(id));
  const want = enabled && asset.available;

  if (!want) {
    if (present) removeAssetLayers(map, assetId);
    return;
  }
  if (present) return;

  const res = await resolveAssetSource(asset);
  if (res.sourceUrl) ensureAssetLayers(map, assetId, res.sourceUrl);
  // else: enabled but not downloaded/hosted → render nothing; the layer control
  // shows the "download required" state.
}

export interface ReconcileResult {
  /** Whether the active base map is served offline / online / not at all. */
  baseMode: BasemapMode;
}

/**
 * Bring the map's base + overlay layers in line with `config`. Safe to call on
 * every config change and after (re)download. Returns the active base-map mode
 * so the caller can surface the "basemap unavailable" notice.
 */
export async function reconcileMapLayers(map: MlMap, config: MapConfig): Promise<ReconcileResult> {
  // ---- Base map (mutually exclusive) ----
  const targetBase = config.baseMap;
  const otherBase = targetBase === 'topographic' ? 'satellite' : 'topographic';
  removeAssetLayers(map, otherBase);

  const baseRes = await resolveAssetSource(OFFLINE_ASSETS[targetBase]);
  if (baseRes.sourceUrl) ensureAssetLayers(map, targetBase, baseRes.sourceUrl);
  else removeAssetLayers(map, targetBase);

  // ---- Overlays (independent). Reconciled low → high: hillshade sits under
  // contours, which sit under labels, all under the route. ----
  await reconcileOverlay(map, 'hillshade', config.hillshadeEnabled);
  await reconcileOverlay(map, 'contours', config.contoursEnabled);
  await reconcileOverlay(map, 'labels', config.labelsEnabled);

  return { baseMode: baseRes.mode };
}
