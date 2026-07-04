/**
 * React state for the layered-map preferences, persisted locally.
 *
 * A tiny self-contained store (not part of AppStore): map display state is
 * device-specific and decoupled from the exported trip data. Persists on every
 * change through mapConfigStore.
 */
import { useCallback, useEffect, useState } from 'react';
import type { BaseMapId, MapConfig } from '../map/mapConfig.mjs';
import { loadMapConfig, saveMapConfig } from '../map/mapConfigStore';

/** Overlay flags that can be toggled independently of the base map. */
export type OverlayKey = 'contoursEnabled' | 'hillshadeEnabled' | 'labelsEnabled';

export interface UseMapConfig {
  config: MapConfig;
  setBaseMap: (baseMap: BaseMapId) => void;
  toggleOverlay: (key: OverlayKey) => void;
}

export function useMapConfig(): UseMapConfig {
  const [config, setConfig] = useState<MapConfig>(() => loadMapConfig());

  useEffect(() => {
    saveMapConfig(config);
  }, [config]);

  const setBaseMap = useCallback((baseMap: BaseMapId) => {
    setConfig((c) => (c.baseMap === baseMap ? c : { ...c, baseMap }));
  }, []);

  const toggleOverlay = useCallback((key: OverlayKey) => {
    setConfig((c) => ({ ...c, [key]: !c[key] }));
  }, []);

  return { config, setBaseMap, toggleOverlay };
}
