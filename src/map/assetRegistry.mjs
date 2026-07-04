/**
 * Reusable offline-asset registry + download-management descriptors.
 *
 * One descriptor per downloadable PMTiles archive. Framework-free (no DOM, no
 * import.meta) so the registry's invariants can be validated by `node --test`.
 * Runtime URL resolution + Cache Storage live in src/map/offlineAssets.ts.
 *
 * Design rules encoded here:
 *  - Exactly one asset is `required` (topographic) — the dependable fallback,
 *    and the only asset shipped today.
 *  - Optional assets are removable downloads and are NEVER precached, so they
 *    cannot grow the baseline app / service-worker precache.
 *  - `available:false` marks a PLANNED asset whose PMTiles has not been
 *    produced yet (satellite, contours, hillshade, labels). Planned assets are
 *    surfaced in Settings so their scope + attribution are documented, but they
 *    are NOT offered in the Map layer control until they actually ship.
 *  - `expectedSizeBytes` on planned assets is a PLANNING ESTIMATE only and
 *    must be replaced with the measured size after a real extraction.
 *
 * @typedef {'vector' | 'raster' | 'raster-dem'} AssetKind
 * @typedef {'base' | 'overlay'} AssetRole
 *
 * @typedef {Object} OfflineAsset
 * @property {string} id                 Stable id (also the pmtiles blob key).
 * @property {AssetRole} role            Base map (exclusive) or overlay.
 * @property {string} label              Short human label for the UI.
 * @property {string} description        One-line description for the download card.
 * @property {string} path               Path under the app base URL.
 * @property {string} cacheName          Dedicated Cache Storage cache (never the app shell).
 * @property {string} version            Bump to invalidate a stored copy.
 * @property {AssetKind} kind            MapLibre source type.
 * @property {number} expectedSizeBytes  Estimate until a real extraction exists.
 * @property {boolean} estimatedSize     True while expectedSizeBytes is a guess.
 * @property {string} attribution        Required source attribution.
 * @property {boolean} required          The dependable fallback (topographic).
 * @property {boolean} available         Whether the PMTiles has actually shipped.
 */

/** @type {readonly AssetKind[]} */
export const ASSET_KINDS = ['vector', 'raster', 'raster-dem'];

/** @type {Record<string, OfflineAsset>} */
export const OFFLINE_ASSETS = {
  topographic: {
    id: 'topographic',
    role: 'base',
    label: 'Topographic',
    description:
      'Bounded OpenStreetMap-derived vector basemap of the Kungsleden area ' +
      '(Abisko–Nikkaluokta + ~9 km). The dependable offline fallback — the ' +
      'route itself always works even without it.',
    path: 'maps/kungsleden.pmtiles',
    // Unchanged from the original single-file implementation so any copy an
    // existing user already downloaded keeps working after this refactor.
    cacheName: 'fjallkompis-offline-map-v1',
    version: '1',
    kind: 'vector',
    expectedSizeBytes: 3_500_000,
    estimatedSize: false,
    attribution: '© OpenStreetMap contributors · Protomaps',
    required: true,
    available: true,
  },
  satellite: {
    id: 'satellite',
    role: 'base',
    label: 'Satellite',
    description:
      'Optional cloud-free Sentinel-2 natural-colour raster of the route ' +
      'corridor. A large download — remove it any time to reclaim space.',
    path: 'maps/kungsleden-satellite.pmtiles',
    cacheName: 'fjallkompis-satellite-v1',
    version: '1',
    kind: 'raster',
    // PLANNING ESTIMATE — replace after the first real extraction (see docs).
    expectedSizeBytes: 120_000_000,
    estimatedSize: true,
    attribution: 'Contains modified Copernicus Sentinel-2 data',
    required: false,
    available: false,
  },
  contours: {
    id: 'contours',
    role: 'overlay',
    label: 'Contour lines',
    description:
      'Optional minor + index contour lines derived from the Copernicus DEM ' +
      'GLO-30, packaged as vector tiles.',
    path: 'maps/kungsleden-contours.pmtiles',
    cacheName: 'fjallkompis-contours-v1',
    version: '1',
    kind: 'vector',
    expectedSizeBytes: 12_000_000,
    estimatedSize: true,
    attribution: 'Contains modified Copernicus DEM data © ESA',
    required: false,
    available: false,
  },
  hillshade: {
    id: 'hillshade',
    role: 'overlay',
    label: 'Hillshade / relief',
    description:
      'Optional terrain relief (hillshade) rendered from a Copernicus DEM ' +
      'GLO-30 terrain-RGB raster.',
    path: 'maps/kungsleden-hillshade.pmtiles',
    cacheName: 'fjallkompis-hillshade-v1',
    version: '1',
    kind: 'raster-dem',
    expectedSizeBytes: 45_000_000,
    estimatedSize: true,
    attribution: 'Contains modified Copernicus DEM data © ESA',
    required: false,
    available: false,
  },
  labels: {
    id: 'labels',
    role: 'overlay',
    label: 'Place labels',
    description:
      'Optional general geographic labels (peaks, lakes, valleys) with a ' +
      'self-hosted glyph pack, packaged as vector tiles.',
    path: 'maps/kungsleden-labels.pmtiles',
    cacheName: 'fjallkompis-labels-v1',
    version: '1',
    kind: 'vector',
    expectedSizeBytes: 2_000_000,
    estimatedSize: true,
    attribution: '© OpenStreetMap contributors',
    required: false,
    available: false,
  },
};

/** @returns {OfflineAsset[]} */
export function listAssets() {
  return Object.values(OFFLINE_ASSETS);
}

/**
 * @param {string} id
 * @returns {OfflineAsset | null}
 */
export function getAsset(id) {
  return OFFLINE_ASSETS[id] ?? null;
}

/** @returns {OfflineAsset[]} Base-map assets (mutually exclusive). */
export function baseAssets() {
  return listAssets().filter((a) => a.role === 'base');
}

/** @returns {OfflineAsset[]} Overlay assets (independent toggles). */
export function overlayAssets() {
  return listAssets().filter((a) => a.role === 'overlay');
}

/** Keys every pipeline-emitted asset manifest sidecar must carry. */
export const REQUIRED_MANIFEST_KEYS = [
  'id',
  'version',
  'kind',
  'sourceDate',
  'attribution',
  'bbox',
  'sizeBytes',
  'tileFormat',
];

/**
 * Validate an asset-manifest sidecar (the `<name>.pmtiles.json` a build script
 * writes next to each archive, recording imagery date + attribution + size).
 * Pure and dependency-free so the fixture can be checked by `node --test`.
 *
 * @param {unknown} raw
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function validateAssetManifest(raw) {
  const problems = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, problems: ['manifest is not an object'] };
  }
  const m = /** @type {Record<string, unknown>} */ (raw);
  for (const key of REQUIRED_MANIFEST_KEYS) {
    if (!(key in m) || m[key] == null || m[key] === '') {
      problems.push(`missing "${key}"`);
    }
  }
  if ('kind' in m && !ASSET_KINDS.includes(/** @type {any} */ (m.kind))) {
    problems.push(`invalid kind "${String(m.kind)}"`);
  }
  if ('sizeBytes' in m && !(typeof m.sizeBytes === 'number' && m.sizeBytes > 0)) {
    problems.push('sizeBytes must be a positive number');
  }
  if (
    'bbox' in m &&
    !(Array.isArray(m.bbox) && m.bbox.length === 4 && m.bbox.every((n) => typeof n === 'number'))
  ) {
    problems.push('bbox must be [west, south, east, north]');
  }
  if ('sourceDate' in m && typeof m.sourceDate === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(m.sourceDate)) {
    problems.push('sourceDate must start with an ISO YYYY-MM-DD date');
  }
  return { ok: problems.length === 0, problems };
}
