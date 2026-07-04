/**
 * Base-map switching on an existing MapLibre instance — no map recreation.
 *
 * Topographic (offline vector PMTiles) ships in the initial style. Satellite is
 * an optional streamed raster (Sentinel-2 cloudless). Switching:
 *  - Satellite: add the raster source + layer BELOW the route (so route, hut and
 *    GPS layers stay on top) and hide the topographic layers.
 *  - Topographic: remove the satellite layer/source and show the topographic
 *    layers again.
 *
 * Idempotent: safe to call on every config change.
 */
import type { Map as MlMap } from 'maplibre-gl';
import type { MapConfig } from './mapConfig.mjs';
import { OFFLINE_ASSETS } from './assetRegistry.mjs';
import { SATELLITE_SOURCE, ROUTE_UNDERLAY_ID, topoLayerIds } from './mapStyle';

const SATELLITE_LAYER = 'base-satellite';

function setTopoVisible(map: MlMap, visible: boolean): void {
  const v = visible ? 'visible' : 'none';
  for (const id of topoLayerIds()) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v);
  }
}

function removeSatellite(map: MlMap): void {
  if (map.getLayer(SATELLITE_LAYER)) map.removeLayer(SATELLITE_LAYER);
  if (map.getSource(SATELLITE_SOURCE)) map.removeSource(SATELLITE_SOURCE);
}

/** Apply the selected base map. Falls back to topographic if satellite can't be used. */
export function applyBaseMap(map: MlMap, config: MapConfig): void {
  const sat = OFFLINE_ASSETS.satellite;
  const wantSatellite = config.baseMap === 'satellite' && sat.available && !!sat.tiles;

  if (wantSatellite) {
    if (!map.getSource(SATELLITE_SOURCE)) {
      map.addSource(SATELLITE_SOURCE, {
        type: 'raster',
        tiles: [sat.tiles as string],
        tileSize: 256,
        attribution: sat.attribution,
        maxzoom: 16,
      });
    }
    if (!map.getLayer(SATELLITE_LAYER)) {
      const beforeId = map.getLayer(ROUTE_UNDERLAY_ID) ? ROUTE_UNDERLAY_ID : undefined;
      map.addLayer(
        { id: SATELLITE_LAYER, type: 'raster', source: SATELLITE_SOURCE, paint: { 'raster-opacity': 1 } },
        beforeId,
      );
    }
    setTopoVisible(map, false);
  } else {
    removeSatellite(map);
    setTopoVisible(map, true);
  }
}
