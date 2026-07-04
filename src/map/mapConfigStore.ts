/**
 * Local persistence for the selected map preferences.
 *
 * Map preferences are device-specific display state (which base map + overlays
 * to show), like which offline assets are downloaded — so they live under their
 * own localStorage key rather than in the trip-data blob that Settings exports.
 * Reads are always normalised through normalizeMapConfig, so a corrupt or
 * partial value can never wedge the map.
 */
import { DEFAULT_MAP_CONFIG, normalizeMapConfig, type MapConfig } from './mapConfig.mjs';

export const MAP_CONFIG_KEY = 'fjallkompis:mapConfig';

export function loadMapConfig(): MapConfig {
  try {
    const raw = localStorage.getItem(MAP_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_MAP_CONFIG };
    return normalizeMapConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_MAP_CONFIG };
  }
}

export function saveMapConfig(config: MapConfig): void {
  try {
    localStorage.setItem(MAP_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* private mode / quota — non-fatal for a display preference. */
  }
}
