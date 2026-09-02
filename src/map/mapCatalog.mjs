/**
 * THE canonical map catalog — one declaration per offline map archive, and the
 * only place any of these identities is written down.
 *
 * Before this module the same four archives were described in five places:
 * `src/map/offlineMap.ts` (specs), `src/map/archiveRevision.mjs` (the vector
 * revision), `vite.config.ts` (two hardcoded Workbox cache names and three
 * literal URL suffixes), `.github/workflows/deploy.yml` (release tags, SHA-256
 * pins, one size pin, the filenames again) and the tests (all of it, as string
 * literals). Nothing linked them, so cutting a new terrain build meant editing
 * a workflow, a config and a spec by hand — and the failure mode of getting it
 * half right is a device that silently serves the wrong bytes under the right
 * label.
 *
 * Every consumer now DERIVES from here:
 *   - the app runtime (src/map/offlineMap.ts, src/map/archiveStore.ts);
 *   - the service worker (vite.config.ts imports the cache names and paths);
 *   - deployment (scripts/map-archives.mjs fetches and verifies from these
 *     release pins);
 *   - Android (the native adapter passes url + bytes + sha256 to the plugin;
 *     no archive identity exists in Java at all);
 *   - the tests, which assert the parity contracts against this file.
 *
 * This is a static declaration compiled into both builds. It is deliberately
 * NOT a backend or a remote configuration service: a hiker with no signal must
 * be able to learn what their device holds, and a catalog that needs the
 * network to be read would be exactly the wrong dependency.
 *
 * ── Two distribution kinds ─────────────────────────────────────────────────
 *
 * BUNDLED — committed to the repo, built into both targets, and shipped inside
 * the Android app package. Only the vector basemap: it is the reliable
 * airplane-mode baseline and the one archive that must exist on a fresh
 * install with no download step.
 *
 * OPTIONAL — never committed (the binaries total ~90 MB). The canonical copy
 * is a pinned GitHub Release asset. Deployment injects it into the Pages build
 * so browsers fetch it same-origin (Release assets send no CORS headers, so
 * the PWA cannot fetch them directly); Android downloads the SAME release
 * asset natively, where CORS does not apply. Same tag, same bytes, same
 * SHA-256 — one pipeline, two reachable URLs for it, both derived below.
 */

/** The repository whose Releases hold the canonical optional archives. */
export const MAP_ASSET_REPO = Object.freeze({ owner: 'Algolon', repo: 'Fjallkompis' });

/** Directory (under the app base, and inside the app package) holding archives. */
export const MAP_ASSET_DIR = 'maps';

/**
 * @typedef {object} MapAssetRevision
 * @property {string} id      Stable revision identifier; also the `?rev=` value.
 * @property {number} bytes   Exact byte length — the freshness proof.
 * @property {string} sha256  Full-file digest. Provenance on the PWA (a 60 MB
 *   re-read on every status check would buy nothing); ENFORCED on Android,
 *   where the download is hashed as it streams for free.
 * @property {{bounds: readonly [readonly [number, number], readonly [number, number]], minZoom: number, maxZoom: number, tilesByZoom?: readonly {zoom:number,x:readonly [number,number],y:readonly [number,number],count:number}[]}} coverage
 *   Physical archive metadata, pinned with the bytes so coverage tests run
 *   even when optional Release assets have not been injected into CI.
 *
 * @typedef {object} MapAssetRelease
 * @property {string} tag   Pinned GitHub Release tag — the canonical origin.
 * @property {string} asset Asset filename on that release.
 *
 * @typedef {object} MapAsset
 * @property {string} id        Logical id used by every adapter and the plugin.
 * @property {string} file      Filename, identical on Pages and in the package.
 * @property {'bundled' | 'optional'} distribution
 * @property {MapAssetRevision} revision
 * @property {readonly number[]} supersededBytes
 *   Byte lengths this archive's OWN current cache may legitimately hold from an
 *   earlier shipped revision — read as a usable offline fallback, reported as
 *   "update available", never as current. The vector archive declares none on
 *   purpose: its revisions are separated by CACHE NAME, so superseded bytes
 *   sitting in the current cache cannot have arrived by any path we ship and
 *   are not trustworthy (they stay `invalid`). The optional archives share one
 *   cache across revisions, so old bytes there are exactly what our own earlier
 *   download wrote.
 * @property {string} cacheName            Cache Storage identity (PWA).
 * @property {readonly string[]} legacyCacheNames  Superseded caches, newest first.
 * @property {MapAssetRelease | null} release      null for bundled archives.
 */

/**
 * @type {Readonly<Record<string, MapAsset>>}
 */
export const MAP_ASSETS = Object.freeze({
  /**
   * The Kungsleden vector basemap. Committed, bundled, and the only archive
   * with a public URL that is deliberately STABLE across rebuilds — which is
   * why it needed the revision contract first (src/map/archiveRevision.mjs).
   */
  vector: Object.freeze({
    id: 'vector',
    file: 'kungsleden.pmtiles',
    distribution: 'bundled',
    revision: Object.freeze({
      // Unchanged from VECTOR_ARCHIVE_REVISION: this id is already stored in
      // deployed service workers' fetch URLs and must not move.
      id: 'kungsleden-vector-2026-08-overview-corridor',
      bytes: 5_904_598,
      sha256: '17d9894664aca247affa11d0a5b3e5763d0898a920f129d1f25f78a2e3fb1b51',
      coverage: Object.freeze({
        bounds: Object.freeze([Object.freeze([17.3799, 67.7081]), Object.freeze([19.8773, 68.4931])]),
        minZoom: 0,
        maxZoom: 14,
      }),
    }),
    supersededBytes: Object.freeze([]),
    cacheName: 'fjallkompis-offline-map-v2',
    legacyCacheNames: Object.freeze(['fjallkompis-offline-map-v1']),
    release: null,
  }),

  /**
   * Terrain-RGB raster for hillshade (Copernicus GLO-30, terrarium encoding,
   * z7–12). v4 supplies every real raster-dem child tile required by expanded
   * overview cameras through source z11; z12 keeps the compact interaction
   * corridor. v2/v3 were bit-identical, so only their shared length is listed.
   */
  terrain: Object.freeze({
    id: 'terrain',
    file: 'kungsleden-terrain.pmtiles',
    distribution: 'optional',
    revision: Object.freeze({
      id: 'kungsleden-terrain-data-v4',
      bytes: 25_073_452,
      sha256: 'c90481a568668bfe9cefeebfbf82a2313d38f47b88e1f1b7550fce9fad2bbae9',
      coverage: Object.freeze({
        bounds: Object.freeze([Object.freeze([17.841797, 67.676085]), Object.freeze([19.423828, 68.49604])]),
        minZoom: 7,
        maxZoom: 12,
        // Physical XYZ inventory, not header inference. Tests enumerate every
        // declared tile against the release archive when its bytes are present.
        tilesByZoom: Object.freeze([
          Object.freeze({ zoom: 7, x: Object.freeze([70, 70]), y: Object.freeze([30, 30]), count: 1 }),
          Object.freeze({ zoom: 8, x: Object.freeze([140, 141]), y: Object.freeze([60, 61]), count: 4 }),
          Object.freeze({ zoom: 9, x: Object.freeze([280, 283]), y: Object.freeze([120, 123]), count: 16 }),
          Object.freeze({ zoom: 10, x: Object.freeze([560, 567]), y: Object.freeze([240, 247]), count: 64 }),
          Object.freeze({ zoom: 11, x: Object.freeze([1120, 1135]), y: Object.freeze([480, 495]), count: 256 }),
          Object.freeze({ zoom: 12, x: Object.freeze([2251, 2268]), y: Object.freeze([965, 989]), count: 450 }),
        ]),
      }),
    }),
    supersededBytes: Object.freeze([19_297_735, 10_971_079]),
    cacheName: 'fjallkompis-offline-terrain-v1',
    legacyCacheNames: Object.freeze([]),
    release: Object.freeze({ tag: 'terrain-data-v4', asset: 'kungsleden-terrain.pmtiles' }),
  }),

  /**
   * 20 m contour vectors, retiled in v3 so 100 m index lines exist from z9 and
   * the 20 m set from z12 — required by the z9.5/z11.5 fade-ins.
   */
  contours: Object.freeze({
    id: 'contours',
    file: 'kungsleden-contours.pmtiles',
    distribution: 'optional',
    revision: Object.freeze({
      id: 'kungsleden-contours-data-v3',
      bytes: 9_271_029,
      sha256: '3e8fbcfa6ee1ea8df9abaec641d836e11602867c09c83f77173e522826b7d573',
      coverage: Object.freeze({
        bounds: Object.freeze([Object.freeze([17.8799, 67.7081]), Object.freeze([19.3773, 68.4931])]),
        minZoom: 9,
        maxZoom: 13,
      }),
    }),
    supersededBytes: Object.freeze([4_618_344, 6_192_959]),
    cacheName: 'fjallkompis-offline-contours-v1',
    legacyCacheNames: Object.freeze([]),
    release: Object.freeze({ tag: 'terrain-data-v3', asset: 'kungsleden-contours.pmtiles' }),
  }),

  /**
   * The optional second basemap — a hybrid imagery archive since v5:
   * Sentinel-2 cloudless (EOX) carries the complete z7–13 overview pyramid,
   * and z14–15 is the Lantmäteriet Ortofoto J6 2024 detail corridor
   * composited over a Sentinel fallback (93.3 % of z14 corridor tiles are
   * fully orthophoto; the rest keep Sentinel pixels where J6 flight coverage
   * ends). Built by scripts/build-satellite-map.sh; every value below is
   * measured from the verified production build, never estimated.
   */
  satellite: Object.freeze({
    id: 'satellite',
    file: 'kungsleden-satellite.pmtiles',
    distribution: 'optional',
    revision: Object.freeze({
      id: 'kungsleden-satellite-data-v5',
      bytes: 293_720_600,
      sha256: '29996eec00e5a792284f842ea7556e6015dfb85ae9bde9741061ebe56dd110b9',
      coverage: Object.freeze({
        bounds: Object.freeze([Object.freeze([16.875, 67.60922060496382]), Object.freeze([19.6875, 68.65655498475736])]),
        minZoom: 7,
        maxZoom: 15,
        // Physical XYZ inventory of the verified build: complete overview
        // rectangles z7–13, the z14-aligned detail corridor at z14–15.
        tilesByZoom: Object.freeze([
          Object.freeze({ zoom: 7, x: Object.freeze([70, 70]), y: Object.freeze([30, 30]), count: 1 }),
          Object.freeze({ zoom: 8, x: Object.freeze([140, 141]), y: Object.freeze([60, 61]), count: 4 }),
          Object.freeze({ zoom: 9, x: Object.freeze([280, 283]), y: Object.freeze([120, 123]), count: 16 }),
          Object.freeze({ zoom: 10, x: Object.freeze([560, 567]), y: Object.freeze([240, 247]), count: 64 }),
          Object.freeze({ zoom: 11, x: Object.freeze([1120, 1135]), y: Object.freeze([480, 495]), count: 256 }),
          Object.freeze({ zoom: 12, x: Object.freeze([2240, 2271]), y: Object.freeze([960, 991]), count: 1024 }),
          Object.freeze({ zoom: 13, x: Object.freeze([4480, 4543]), y: Object.freeze([1920, 1983]), count: 4096 }),
          Object.freeze({ zoom: 14, x: Object.freeze([9005, 9073]), y: Object.freeze([3860, 3956]), count: 6693 }),
          Object.freeze({ zoom: 15, x: Object.freeze([18010, 18147]), y: Object.freeze([7720, 7913]), count: 26772 }),
        ]),
      }),
    }),
    supersededBytes: Object.freeze([28_292_311, 61_704_169, 43_610_353, 11_294_208]),
    cacheName: 'fjallkompis-offline-satellite-v1',
    legacyCacheNames: Object.freeze([]),
    release: Object.freeze({ tag: 'satellite-data-v5', asset: 'kungsleden-satellite.pmtiles' }),
  }),
});

/** Every asset id, in declaration order. */
export const MAP_ASSET_IDS = Object.freeze(Object.keys(MAP_ASSETS));

/** Assets that ship inside the repo and the Android app package. */
export const BUNDLED_MAP_ASSETS = Object.freeze(
  MAP_ASSET_IDS.filter((id) => MAP_ASSETS[id].distribution === 'bundled'),
);

/**
 * Assets that are downloaded on demand. On BOTH platforms — this list is what
 * makes "optional on the PWA" and "optional on Android" the same statement
 * rather than two coincidences.
 */
export const OPTIONAL_MAP_ASSETS = Object.freeze(
  MAP_ASSET_IDS.filter((id) => MAP_ASSETS[id].distribution === 'optional'),
);

/**
 * User-facing download GROUPS — the product contract for what counts as one
 * choice in Settings. Terrain relief is two archives and one decision because
 * neither half is useful alone: hillshade needs the terrain-RGB raster and the
 * relief reading needs the contour lines. Copy lives with the card; the
 * grouping lives here because it is a data dependency, not a wording choice.
 *
 * @type {readonly { id: string, assetIds: readonly string[] }[]}
 */
export const MAP_DOWNLOAD_GROUPS = Object.freeze([
  Object.freeze({ id: 'basemap', assetIds: Object.freeze(['vector']) }),
  Object.freeze({ id: 'terrain', assetIds: Object.freeze(['terrain', 'contours']) }),
  Object.freeze({ id: 'satellite', assetIds: Object.freeze(['satellite']) }),
]);

/**
 * Look an asset up by id, loudly. Every adapter and the native bridge address
 * assets by id, so an unknown id is a wiring bug that must not degrade into a
 * silently missing map layer.
 *
 * @param {string} id
 * @returns {MapAsset}
 */
export function mapAsset(id) {
  const asset = MAP_ASSETS[id];
  if (!asset) throw new Error(`Unknown map asset: ${id}`);
  return asset;
}

/**
 * Path under the app base — the same relative location in the Pages build and
 * inside the Android app package.
 *
 * @param {MapAsset} asset
 * @returns {string}
 */
export function mapAssetPath(asset) {
  return `${MAP_ASSET_DIR}/${asset.file}`;
}

/**
 * The canonical Release download URL for an optional asset. Used by deployment
 * (to inject the asset into the Pages build) and by the Android native
 * downloader (which is not subject to CORS). Both therefore fetch the same
 * bytes from the same pinned tag.
 *
 * @param {MapAsset} asset
 * @returns {string} absolute URL
 */
export function mapAssetReleaseUrl(asset) {
  if (!asset.release) {
    throw new Error(`${asset.id} is bundled and has no release asset`);
  }
  const { owner, repo } = MAP_ASSET_REPO;
  return `https://github.com/${owner}/${repo}/releases/download/${asset.release.tag}/${asset.release.asset}`;
}

/**
 * Total bytes a download group will store — what Settings quotes before the
 * user commits to it, and what the native downloader budgets for.
 *
 * @param {readonly string[]} assetIds
 * @returns {number}
 */
export function mapAssetGroupBytes(assetIds) {
  return assetIds.reduce((sum, id) => sum + mapAsset(id).revision.bytes, 0);
}
