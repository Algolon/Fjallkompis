/**
 * Lantmäteriet Ortofoto (STAC) source acquisition — the pure logic behind
 * scripts/prepare-lantmateriet-orthophoto.sh.
 *
 * WHAT THIS MODULE IS. The hybrid satellite archive's z14–15 detail corridor
 * comes from Lantmäteriet's Ortofoto J6 (2024) collection: 0.4 m RGBI
 * cloud-optimized GeoTIFFs on a 5 km × 5 km SWEREF99 TM (EPSG:3006) grid,
 * ~430 MB each. The corridor needs ~229 of them (~98 GB native) — far too
 * much to download, and far more resolution than z15 can hold. So the
 * pipeline never downloads a source COG at all: it builds a VRT of
 * `/vsicurl/` references and lets GDAL's warper stream exactly the COG
 * overview ranges the target resolution needs (~1.6 m for z15 at 68°N).
 *
 * Everything here is metadata-only and credential-free BY CONSTRUCTION:
 * the STAC catalog answers anonymously, and the VRT is synthesized from
 * STAC geometry rather than by opening the remote files. Credentials
 * (LM_USERNAME / LM_PASSWORD, HTTP Basic) are needed only when GDAL later
 * READS the referenced COGs, and reach it exclusively through GDAL's own
 * environment variables in the build scripts. Nothing this module writes —
 * manifest, VRT, report — may ever contain a credential, and
 * assertNoCredentialMaterial() enforces that on every serialized output.
 *
 * Plain ESM with injectable fetch so tests/lantmateriet-orthophoto.test.mjs
 * can fence pagination, de-duplication, validation, coverage and VRT
 * generation against fixtures — live credentials never enter automated tests.
 */

import {
  tileAlignedFootprint,
  SATELLITE_DETAIL_MIN_ZOOM,
} from '../../src/map/overviewEnvelope.mjs';

export { SATELLITE_DETAIL_MIN_ZOOM };

/** STAC API root (anonymous, read-only metadata). */
export const LM_STAC_API = 'https://api.lantmateriet.se/stac-bild/v1';
/** The manually verified orthophoto collection consumed by the hybrid build. */
export const LM_ORTO_COLLECTION = 'orto-j6-2024';

/** Source contract, verified per item before anything is built. */
export const EXPECTED_RESOLUTION_M = 0.4;
export const EXPECTED_CRS = 'EPSG:3006';
export const EXPECTED_SPECTRAL = 'rgbi';
/** RGB only — the fourth (IR) band must never reach the visual archive. */
export const RGB_BANDS = Object.freeze([1, 2, 3]);

/**
 * The detail corridor: canonical mapCutoutBounds aligned outwards to whole
 * tiles at SATELLITE_DETAIL_MIN_ZOOM — the exact extent the z14–15 warp
 * produces, and therefore the extent the source imagery must fully cover.
 *
 * @param {[[number,number],[number,number]]} cutoutBounds [[w,s],[e,n]]
 */
export function detailCorridorFootprint(cutoutBounds) {
  return tileAlignedFootprint(cutoutBounds, SATELLITE_DETAIL_MIN_ZOOM);
}

/**
 * XYZ tile range of a lon/lat box at an integer zoom — the same maths as
 * tileAlignedFootprint, kept here as indices so build plans and coverage
 * checks can talk about tile inventories instead of degrees.
 *
 * @param {[[number,number],[number,number]]} bounds [[w,s],[e,n]]
 * @param {number} z
 */
export function tileRange(bounds, z) {
  const [[w, s], [e, n]] = bounds;
  const size = 2 ** z;
  const lon2t = (lon) => Math.floor(((lon + 180) / 360) * size);
  const lat2t = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * size);
  };
  const xMin = lon2t(w);
  const xMax = lon2t(e);
  const yMin = lat2t(n); // north edge is the SMALLER tile y
  const yMax = lat2t(s);
  return { z, xMin, xMax, yMin, yMax, count: (xMax - xMin + 1) * (yMax - yMin + 1) };
}

/**
 * Expected detail-zoom tile inventory: the corridor is tile-aligned at
 * SATELLITE_DETAIL_MIN_ZOOM (derived from the cutout, never from the
 * already-aligned footprint — an exactly-aligned edge would otherwise round
 * into the neighbouring column), and every deeper zoom covers exactly the
 * children of that range.
 *
 * @param {[[number,number],[number,number]]} cutoutBounds [[w,s],[e,n]]
 * @param {number} maxZoom highest zoom stored in the archive
 */
export function detailTileInventory(cutoutBounds, maxZoom) {
  const base = tileRange(cutoutBounds, SATELLITE_DETAIL_MIN_ZOOM);
  const inventory = [base];
  for (let z = SATELLITE_DETAIL_MIN_ZOOM + 1; z <= maxZoom; z++) {
    const prev = inventory[inventory.length - 1];
    const next = {
      z,
      xMin: prev.xMin * 2,
      xMax: prev.xMax * 2 + 1,
      yMin: prev.yMin * 2,
      yMax: prev.yMax * 2 + 1,
    };
    next.count = (next.xMax - next.xMin + 1) * (next.yMax - next.yMin + 1);
    inventory.push(next);
  }
  return inventory;
}

// ---- SWEREF99 TM (EPSG:3006) forward projection ---------------------------
// GRS80 transverse Mercator, lon0 15°E, k0 0.9996, false easting 500 000 m.
// Snyder's series — at Sweden's ≤4.5° from the central meridian it agrees
// with PROJ to well under a millimetre (fenced against gdaltransform fixtures
// in the tests). Used only to test 5 km grid membership, where centimetres
// would already be irrelevant.
const GRS80_A = 6378137;
const GRS80_F = 1 / 298.257222101;
const TM_K0 = 0.9996;
const TM_LON0 = 15;
const TM_FALSE_EASTING = 500000;

export function sweref99tm(lonDeg, latDeg) {
  const e2 = GRS80_F * (2 - GRS80_F);
  const ep2 = e2 / (1 - e2);
  const lat = (latDeg * Math.PI) / 180;
  const dLon = ((lonDeg - TM_LON0) * Math.PI) / 180;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const N = GRS80_A / Math.sqrt(1 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = ep2 * cosLat * cosLat;
  const A = dLon * cosLat;

  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M = GRS80_A * (
    (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * lat
    - ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * lat)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * lat)
    - ((35 * e6) / 3072) * Math.sin(6 * lat)
  );

  const A2 = A * A;
  const A3 = A2 * A;
  const A4 = A3 * A;
  const A5 = A4 * A;
  const A6 = A5 * A;
  const easting = TM_FALSE_EASTING + TM_K0 * N * (
    A + ((1 - T + C) * A3) / 6
    + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5) / 120
  );
  const northing = TM_K0 * (
    M + N * tanLat * (
      A2 / 2 + ((5 - T + 9 * C + 4 * C * C) * A4) / 24
      + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6) / 720
    )
  );
  return { easting, northing };
}

/**
 * Inverse SWEREF99 TM: metres → lon/lat degrees (Snyder's series, fenced
 * against gdaltransform fixtures like the forward direction). Used to
 * express the source-coverage cutline in plain WGS84 GeoJSON, so no
 * consumer ever has to guess a vector file's CRS.
 */
export function sweref99tmInverse(easting, northing) {
  const e2 = GRS80_F * (2 - GRS80_F);
  const ep2 = e2 / (1 - e2);
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const M = northing / TM_K0;
  const mu = M / (GRS80_A * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));
  const sq = Math.sqrt(1 - e2);
  const e1 = (1 - sq) / (1 + sq);
  const e1_2 = e1 * e1;
  const e1_3 = e1_2 * e1;
  const e1_4 = e1_3 * e1;
  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1_3) / 32) * Math.sin(2 * mu)
    + ((21 * e1_2) / 16 - (55 * e1_4) / 32) * Math.sin(4 * mu)
    + ((151 * e1_3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1_4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const T1 = tanPhi1 * tanPhi1;
  const N1 = GRS80_A / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const R1 = (GRS80_A * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = (easting - TM_FALSE_EASTING) / (N1 * TM_K0);
  const D2 = D * D;
  const D3 = D2 * D;
  const D4 = D3 * D;
  const D5 = D4 * D;
  const D6 = D5 * D;

  const lat = phi1 - ((N1 * tanPhi1) / R1) * (
    D2 / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D6) / 720
  );
  const lon = (TM_LON0 * Math.PI) / 180 + (
    D
    - ((1 + 2 * T1 + C1) * D3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D5) / 120
  ) / cosPhi1;

  return { lon: (lon * 180) / Math.PI, lat: (lat * 180) / Math.PI };
}

// ---- STAC item search -----------------------------------------------------

/** Items URL for a WGS84 bbox query against one collection. */
export function stacItemsUrl(bbox, { api = LM_STAC_API, collection = LM_ORTO_COLLECTION, limit = 100 } = {}) {
  const box = [bbox.west, bbox.south, bbox.east, bbox.north].join(',');
  return `${api}/collections/${collection}/items?bbox=${box}&limit=${limit}`;
}

/**
 * Fetch every item intersecting `bbox`, following STAC `next` pagination
 * until exhausted and de-duplicating by item id (a paging boundary that
 * moves under the query must not double-count a tile).
 *
 * @param {{west:number,south:number,east:number,north:number}} bbox
 * @param {{fetchImpl?: typeof fetch, api?: string, collection?: string,
 *          limit?: number, maxPages?: number}} [options]
 * @returns {Promise<{items: object[], pages: number, duplicates: number}>}
 */
export async function fetchAllItems(bbox, {
  fetchImpl = fetch,
  api = LM_STAC_API,
  collection = LM_ORTO_COLLECTION,
  limit = 100,
  maxPages = 100,
  retries = 4,
  retryDelayMs = 3000,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const byId = new Map();
  let duplicates = 0;
  let pages = 0;
  let url = stacItemsUrl(bbox, { api, collection, limit });
  const seenUrls = new Set();

  // The API rate-limits (HTTP 429 observed live on back-to-back pages), so
  // retryable statuses back off instead of failing the whole acquisition.
  const fetchPage = async (pageUrl) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(pageUrl);
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= retries) {
        throw new Error(`STAC request failed (HTTP ${res.status}): ${pageUrl}`);
      }
      await sleepImpl(retryDelayMs * (attempt + 1));
    }
  };

  while (url) {
    if (seenUrls.has(url)) throw new Error(`STAC pagination loop: ${url} repeated`);
    seenUrls.add(url);
    if (pages >= maxPages) {
      throw new Error(`STAC pagination did not terminate within ${maxPages} pages`);
    }
    const res = await fetchPage(url);
    const page = await res.json();
    pages += 1;
    for (const feature of page.features ?? []) {
      if (byId.has(feature.id)) duplicates += 1;
      else byId.set(feature.id, feature);
    }
    const next = (page.links ?? []).find((l) => l.rel === 'next');
    url = next?.href ?? null;
  }
  return { items: [...byId.values()], pages, duplicates };
}

// ---- Validation -----------------------------------------------------------

/** The data (COG) asset of an item, or null when it has none. */
export function dataAsset(item) {
  const asset = item.assets?.data;
  return asset?.href ? asset : null;
}

/**
 * Verify every selected item honours the source contract. Returns a list of
 * problems; empty means the set is safe to build from. Each check names the
 * item so a partial upstream reprocessing is diagnosable, not just fatal.
 */
export function validateItems(items) {
  const problems = [];
  if (items.length === 0) problems.push('no STAC items selected');
  for (const item of items) {
    const p = item.properties ?? {};
    if (p['upplosning'] !== EXPECTED_RESOLUTION_M) {
      problems.push(`${item.id}: resolution ${p['upplosning']} ≠ ${EXPECTED_RESOLUTION_M} m`);
    }
    if (p['proj:code'] !== EXPECTED_CRS) {
      problems.push(`${item.id}: CRS ${p['proj:code']} ≠ ${EXPECTED_CRS}`);
    }
    if (p['spektraltyp'] !== EXPECTED_SPECTRAL) {
      problems.push(`${item.id}: spectral type ${p['spektraltyp']} ≠ ${EXPECTED_SPECTRAL}`);
    }
    const bbox = p['proj:bbox'];
    if (!Array.isArray(bbox) || bbox.length !== 4) {
      problems.push(`${item.id}: missing proj:bbox`);
    }
    const asset = dataAsset(item);
    if (!asset) {
      problems.push(`${item.id}: no data asset`);
    } else {
      if (!/^https:\/\//.test(asset.href)) {
        problems.push(`${item.id}: data asset is not https (${asset.href})`);
      }
      if (asset.href.includes('@')) {
        problems.push(`${item.id}: data asset href carries userinfo — refusing to serialize`);
      }
      if (!(asset.type ?? '').includes('cloud-optimized')) {
        problems.push(`${item.id}: data asset is not marked cloud-optimized (${asset.type})`);
      }
    }
  }
  return problems;
}

// ---- Reporting ------------------------------------------------------------

/**
 * Acquisition summary: what the build plan prints before any expensive work.
 */
export function summarizeItems(items) {
  const bytes = items.reduce((sum, i) => sum + (dataAsset(i)?.['file:size'] ?? 0), 0);
  const dates = items.map((i) => i.properties?.datetime).filter(Boolean).sort();
  return {
    count: items.length,
    totalNativeBytes: bytes,
    resolutionsM: [...new Set(items.map((i) => i.properties?.['upplosning']))],
    spectralTypes: [...new Set(items.map((i) => i.properties?.['spektraltyp']))],
    crs: [...new Set(items.map((i) => i.properties?.['proj:code']))],
    acquiredFrom: dates[0] ?? null,
    acquiredTo: dates[dates.length - 1] ?? null,
    flightYears: [...new Set(items.map((i) => i.properties?.['flygar']).filter(Boolean))].sort(),
  };
}

// ---- Coverage -------------------------------------------------------------

/**
 * Verify the item set covers the whole corridor footprint: sample a dense
 * inclusive grid over the WGS84 footprint, project each sample to EPSG:3006
 * and require it to fall inside at least one item's proj:bbox. The items are
 * axis-aligned 5 km squares in EPSG:3006 (NOT in WGS84 — their lon/lat
 * bboxes overestimate coverage, which is why the check projects instead of
 * comparing degrees). Returns the uncovered samples; a non-empty result is a
 * HARD STOP for the build.
 *
 * @param {object[]} items
 * @param {{west:number,south:number,east:number,north:number}} footprint
 * @param {number} [samplesPerAxis] 64 → ~2.4 km E-W / ~1.4 km N-S spacing,
 *   several samples inside every 5 km source tile at every grid offset.
 */
export function coverageGaps(items, footprint, samplesPerAxis = 64) {
  const boxes = items
    .map((i) => i.properties?.['proj:bbox'])
    .filter((b) => Array.isArray(b) && b.length === 4);
  const eps = 1e-6;
  const gaps = [];
  for (let iy = 0; iy <= samplesPerAxis; iy++) {
    const lat = footprint.south + ((footprint.north - footprint.south) * iy) / samplesPerAxis;
    for (let ix = 0; ix <= samplesPerAxis; ix++) {
      const lon = footprint.west + ((footprint.east - footprint.west) * ix) / samplesPerAxis;
      const { easting, northing } = sweref99tm(lon, lat);
      const covered = boxes.some(([w, s, e, n]) =>
        easting >= w - eps && easting <= e + eps && northing >= s - eps && northing <= n + eps);
      if (!covered) gaps.push({ lon, lat });
    }
  }
  return gaps;
}

/**
 * Per-z14-tile coverage classification of the detail corridor — the numbers
 * behind the Sentinel-fallback composition report. Each corridor tile is
 * sampled on an interior 3×3 grid, projected to EPSG:3006 and tested
 * against the item boxes:
 *
 *   full    every sample inside orthophoto coverage → pure Lantmäteriet;
 *   partial mixed → the tile will show a real source seam;
 *   none    no sample covered → pure Sentinel fallback.
 *
 * @param {object[]} items
 * @param {[[number,number],[number,number]]} cutoutBounds [[w,s],[e,n]]
 */
export function detailTileCoverageStats(items, cutoutBounds) {
  const boxes = items
    .map((i) => i.properties?.['proj:bbox'])
    .filter((b) => Array.isArray(b) && b.length === 4);
  const eps = 1e-6;
  const covered = (easting, northing) => boxes.some(([w, s, e, n]) =>
    easting >= w - eps && easting <= e + eps && northing >= s - eps && northing <= n + eps);

  const range = tileRange(cutoutBounds, SATELLITE_DETAIL_MIN_ZOOM);
  const size = 2 ** SATELLITE_DETAIL_MIN_ZOOM;
  const t2lon = (x) => (x / size) * 360 - 180;
  const t2lat = (y) => {
    const m = Math.PI - (2 * Math.PI * y) / size;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(m) - Math.exp(-m)));
  };

  let full = 0;
  let partial = 0;
  let none = 0;
  for (let x = range.xMin; x <= range.xMax; x++) {
    for (let y = range.yMin; y <= range.yMax; y++) {
      const w = t2lon(x);
      const e = t2lon(x + 1);
      const n = t2lat(y);
      const s = t2lat(y + 1);
      let hits = 0;
      let samples = 0;
      for (const fx of [0.1, 0.5, 0.9]) {
        for (const fy of [0.1, 0.5, 0.9]) {
          const p = sweref99tm(w + (e - w) * fx, s + (n - s) * fy);
          samples += 1;
          if (covered(p.easting, p.northing)) hits += 1;
        }
      }
      if (hits === samples) full += 1;
      else if (hits === 0) none += 1;
      else partial += 1;
    }
  }
  const total = range.count;
  const pct = (v) => Math.round((v / total) * 1000) / 10;
  return {
    detailMinZoom: SATELLITE_DETAIL_MIN_ZOOM,
    totalTiles: total,
    fullyOrthophoto: full,
    partialOrthophoto: partial,
    sentinelOnly: none,
    /** Tiles containing ANY Sentinel-fallback pixels. */
    fallbackTiles: partial + none,
    orthophotoPercent: pct(full),
    fallbackPercent: pct(partial + none),
  };
}

/**
 * The source-coverage cutline as plain WGS84 GeoJSON: one densified polygon
 * per item's 5 km EPSG:3006 square. The build warps the Lantmäteriet
 * overlay THROUGH this cutline, so orthophoto pixels can only ever land
 * where the catalog says coverage exists — belt and braces on top of the
 * COGs' own declared no-data. Densification (default every 250 m) keeps the
 * reprojected edges within centimetres of the true projected rectangle, far
 * below the 0.4 m source pixel.
 *
 * @param {object[]} items validated STAC items
 * @param {{densifyStepM?: number}} [options]
 */
export function coverageCutlineGeoJSON(items, { densifyStepM = 250 } = {}) {
  const features = items.map((item) => {
    const [w, s, e, n] = item.properties['proj:bbox'];
    const ring = [];
    const push = (easting, northing) => {
      const { lon, lat } = sweref99tmInverse(easting, northing);
      ring.push([Math.round(lon * 1e8) / 1e8, Math.round(lat * 1e8) / 1e8]);
    };
    const steps = (a, b) => Math.max(1, Math.ceil(Math.abs(b - a) / densifyStepM));
    for (let i = 0, k = steps(w, e); i < k; i++) push(w + ((e - w) * i) / k, s); // south edge →
    for (let i = 0, k = steps(s, n); i < k; i++) push(e, s + ((n - s) * i) / k); // east edge ↑
    for (let i = 0, k = steps(w, e); i < k; i++) push(e - ((e - w) * i) / k, n); // north edge ←
    for (let i = 0, k = steps(s, n); i < k; i++) push(w, n - ((n - s) * i) / k); // west edge ↓
    ring.push(ring[0]); // close
    return {
      type: 'Feature',
      properties: { id: item.id },
      geometry: { type: 'Polygon', coordinates: [ring] },
    };
  });
  const geojson = { type: 'FeatureCollection', features };
  assertNoCredentialMaterial(JSON.stringify(geojson));
  return geojson;
}

/**
 * Probe points for the build's composition proof, derived from the SAME
 * catalog data the composition uses:
 *
 *   gapProbes    inside the corridor but outside orthophoto coverage —
 *                the composited raster must keep its Sentinel pixels there;
 *   orthoProbes  orthophoto cell centres inside the corridor — the overlay
 *                warp must change these pixels (Lantmäteriet priority).
 *
 * Gap probes keep `clearanceM` metres of clearance from every orthophoto
 * cell, so a probe can never sit within a resampled pixel of the coverage
 * cutline and flake the proof.
 *
 * @param {object[]} items
 * @param {[[number,number],[number,number]]} cutoutBounds
 * @param {number} [maxPerKind]
 * @param {number} [clearanceM]
 */
export function probeSamples(items, cutoutBounds, maxPerKind = 12, clearanceM = 50) {
  const footprint = detailCorridorFootprint(cutoutBounds);
  const spread = (list) => {
    if (list.length <= maxPerKind) return list;
    const step = list.length / maxPerKind;
    return Array.from({ length: maxPerKind }, (_, i) => list[Math.floor(i * step)]);
  };
  const boxes = items
    .map((i) => i.properties?.['proj:bbox'])
    .filter((b) => Array.isArray(b) && b.length === 4);
  const clearOfCoverage = ({ lon, lat }) => {
    const p = sweref99tm(lon, lat);
    return !boxes.some(([w, s, e, n]) =>
      p.easting >= w - clearanceM && p.easting <= e + clearanceM
      && p.northing >= s - clearanceM && p.northing <= n + clearanceM);
  };
  const gaps = coverageGaps(items, footprint);
  const inside = ({ lon, lat }) =>
    lon > footprint.west && lon < footprint.east && lat > footprint.south && lat < footprint.north;
  const centres = items.map((item) => {
    const [w, s, e, n] = item.properties['proj:bbox'];
    return sweref99tmInverse((w + e) / 2, (s + n) / 2);
  }).filter(inside);
  return {
    gapProbes: spread(gaps.filter(inside).filter(clearOfCoverage).map(({ lon, lat }) => ({ lon, lat }))),
    orthoProbes: spread(centres.map(({ lon, lat }) => ({ lon, lat }))),
  };
}

// ---- VRT + manifest generation --------------------------------------------

/**
 * No serialized artifact may carry credential material. The patterns cover
 * the env-variable names, URL userinfo and the Basic-auth GDAL options —
 * belt and braces for something that must never happen.
 */
export function assertNoCredentialMaterial(text) {
  for (const pattern of [/LM_USERNAME/, /LM_PASSWORD/, /GDAL_HTTP_USERPWD/, /https:\/\/[^/\s"']*@/]) {
    if (pattern.test(text)) {
      throw new Error(`credential material would be serialized (matched ${pattern})`);
    }
  }
  return text;
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Synthesize the RGB mosaic VRT directly from STAC metadata — WITHOUT
 * opening a single remote file. gdalbuildvrt would have to range-read every
 * COG header just to learn geometry the catalog already states; writing the
 * XML ourselves keeps acquisition metadata-only, deterministic and testable.
 * GDAL opens each `/vsicurl/` source lazily, only when the warp actually
 * reads pixels from it (and then serves the read from the COG overview
 * closest to the requested resolution).
 *
 * Exactly bands 1–3 (R, G, B). Band 4 (near-infrared) is deliberately never
 * referenced anywhere in the VRT.
 *
 * Each band declares NoDataValue 0: Lantmäteriet publishes boundary cells
 * with declared unified no-data 0,0,0 (verified on the product thumbnails'
 * NODATA_VALUES metadata), and unpopulated VRT area reads as zeros too — so
 * with UNIFIED_SRC_NODATA=YES the warp treats "black in all three bands" as
 * invalid, and the Sentinel fallback keeps those pixels instead of going
 * black at the flight-coverage edge.
 *
 * @param {object[]} items validated STAC items
 * @returns {string} VRT XML (EPSG:3006, native 0.4 m grid)
 */
export function buildRgbVrt(items) {
  if (items.length === 0) throw new Error('cannot build a VRT from zero items');
  const res = EXPECTED_RESOLUTION_M;
  const boxes = items.map((item) => {
    const [w, s, e, n] = item.properties['proj:bbox'];
    const width = Math.round((e - w) / res);
    const height = Math.round((n - s) / res);
    return { item, w, s, e, n, width, height };
  });
  const minE = Math.min(...boxes.map((b) => b.w));
  const maxE = Math.max(...boxes.map((b) => b.e));
  const minN = Math.min(...boxes.map((b) => b.s));
  const maxN = Math.max(...boxes.map((b) => b.n));
  const rasterWidth = Math.round((maxE - minE) / res);
  const rasterHeight = Math.round((maxN - minN) / res);

  const colorInterp = ['Red', 'Green', 'Blue'];
  const bands = RGB_BANDS.map((band, bandIndex) => {
    const sources = boxes.map(({ item, w, n, width, height }) => {
      const href = dataAsset(item).href;
      const xOff = Math.round((w - minE) / res);
      const yOff = Math.round((maxN - n) / res);
      return [
        '    <SimpleSource>',
        `      <SourceFilename relativeToVRT="0">/vsicurl/${xmlEscape(href)}</SourceFilename>`,
        `      <SourceBand>${band}</SourceBand>`,
        `      <SrcRect xOff="0" yOff="0" xSize="${width}" ySize="${height}" />`,
        `      <DstRect xOff="${xOff}" yOff="${yOff}" xSize="${width}" ySize="${height}" />`,
        '    </SimpleSource>',
      ].join('\n');
    }).join('\n');
    return [
      `  <VRTRasterBand dataType="Byte" band="${bandIndex + 1}">`,
      `    <ColorInterp>${colorInterp[bandIndex]}</ColorInterp>`,
      '    <NoDataValue>0</NoDataValue>',
      sources,
      '  </VRTRasterBand>',
    ].join('\n');
  }).join('\n');

  const vrt = [
    `<VRTDataset rasterXSize="${rasterWidth}" rasterYSize="${rasterHeight}">`,
    '  <SRS dataAxisToSRSAxisMapping="2,1">EPSG:3006</SRS>',
    `  <GeoTransform>${minE}, ${res}, 0, ${maxN}, 0, ${-res}</GeoTransform>`,
    bands,
    '</VRTDataset>',
    '',
  ].join('\n');
  return assertNoCredentialMaterial(vrt);
}

/**
 * The acquisition manifest stored next to the VRT: which sources the build
 * refers to and what the catalog said about them at acquisition time.
 * Public metadata only — releases can carry it as provenance.
 */
export function acquisitionManifest(items, footprint, { api = LM_STAC_API, collection = LM_ORTO_COLLECTION, coverage = null } = {}) {
  const manifest = {
    stacApi: api,
    collection,
    corridorFootprint: footprint,
    detailMinZoom: SATELLITE_DETAIL_MIN_ZOOM,
    summary: summarizeItems(items),
    /** Per-z14-tile orthophoto/fallback split (detailTileCoverageStats). */
    coverage,
    items: items
      .map((item) => ({
        id: item.id,
        href: dataAsset(item).href,
        bytes: dataAsset(item)['file:size'] ?? null,
        projBbox: item.properties['proj:bbox'],
        datetime: item.properties.datetime ?? null,
        resolutionM: item.properties['upplosning'],
        spectralType: item.properties['spektraltyp'],
        crs: item.properties['proj:code'],
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  assertNoCredentialMaterial(JSON.stringify(manifest));
  return manifest;
}
