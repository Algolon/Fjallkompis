/**
 * Typed, framework-free map configuration model + defensive normalisation.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so the SAME module is imported
 * by the React app (through Vite) and by the Node test runner — mirroring the
 * src/utils/stateMigration.mjs convention. No DOM, no import.meta here.
 *
 * The layered map has one mutually-exclusive base map and three independent
 * overlays. The topographic base is the dependable fallback and the default.
 */

/** @typedef {'topographic' | 'satellite'} BaseMapId */

/** @type {readonly BaseMapId[]} */
export const BASE_MAPS = ['topographic', 'satellite'];

/**
 * @typedef {Object} MapConfig
 * @property {BaseMapId} baseMap
 * @property {boolean} contoursEnabled
 * @property {boolean} hillshadeEnabled
 * @property {boolean} labelsEnabled
 */

/** @type {MapConfig} */
export const DEFAULT_MAP_CONFIG = {
  baseMap: 'topographic',
  contoursEnabled: false,
  hillshadeEnabled: false,
  labelsEnabled: false,
};

/** @returns {value is BaseMapId} */
export function isBaseMap(value) {
  return value === 'topographic' || value === 'satellite';
}

/**
 * Coerce an unknown blob (e.g. a persisted preference) into a valid MapConfig.
 * Never throws: unknown / missing fields fall back to the topographic default,
 * so a corrupt preference can never wedge the map.
 * @param {unknown} raw
 * @returns {MapConfig}
 */
export function normalizeMapConfig(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MAP_CONFIG };
  const r = /** @type {Record<string, unknown>} */ (raw);
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
  return {
    baseMap: isBaseMap(r.baseMap) ? r.baseMap : DEFAULT_MAP_CONFIG.baseMap,
    contoursEnabled: bool(r.contoursEnabled, DEFAULT_MAP_CONFIG.contoursEnabled),
    hillshadeEnabled: bool(r.hillshadeEnabled, DEFAULT_MAP_CONFIG.hillshadeEnabled),
    labelsEnabled: bool(r.labelsEnabled, DEFAULT_MAP_CONFIG.labelsEnabled),
  };
}
