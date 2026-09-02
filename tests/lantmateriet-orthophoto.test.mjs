/**
 * Lantmäteriet Ortofoto source acquisition — fixture-fenced.
 *
 * Everything here runs against synthetic STAC fixtures and an injected
 * fetch: NO live requests, NO credentials. The contracts fenced:
 *
 *  - the SWEREF99 TM projection agrees with PROJ (gdaltransform fixtures);
 *  - pagination follows `next` to exhaustion, de-duplicates by item id,
 *    retries rate-limit responses and refuses infinite loops;
 *  - the source contract (0.4 m, EPSG:3006, rgbi, COG) is enforced;
 *  - corridor coverage is proven in EPSG:3006, and a single missing 5 km
 *    source tile is detected;
 *  - the synthesized VRT references exactly bands 1–3 (the IR band never
 *    escapes into the visual pipeline) with catalog-derived geometry;
 *  - no serialized artifact can carry credential material.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import {
  EXPECTED_RESOLUTION_M,
  RGB_BANDS,
  SATELLITE_DETAIL_MIN_ZOOM,
  acquisitionManifest,
  assertNoCredentialMaterial,
  buildRgbVrt,
  coverageCutlineGeoJSON,
  coverageGaps,
  detailCorridorFootprint,
  detailTileCoverageStats,
  detailTileInventory,
  fetchAllItems,
  probeSamples,
  stacItemsUrl,
  summarizeItems,
  sweref99tm,
  sweref99tmInverse,
  tileRange,
  validateItems,
} from '../scripts/lib/lantmateriet-stac.mjs';
import {
  tileAlignedFootprint,
  SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM,
} from '../src/map/overviewEnvelope.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

// ---- projection ------------------------------------------------------------

test('SWEREF99 TM projection matches gdaltransform to well under a metre', () => {
  // Reference values produced with:
  //   echo "<lon> <lat>" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3006
  const fixtures = [
    [17.8799, 67.7081, 621872.172413631, 7513155.36420101],
    [19.3773, 68.4931, 678963.628636804, 7604206.41120471],
    [18.6, 68.1, 649776.364755431, 7558381.11978671],
    [17.86376953125, 67.70110969585656, 621226.004743148, 7512345.06406151],
    [19.3798828125, 68.49604022839505, 679045.763676619, 7604541.05116541],
    [15.0, 67.0, 500000.000000001, 7431380.10436739],
  ];
  for (const [lon, lat, easting, northing] of fixtures) {
    const p = sweref99tm(lon, lat);
    assert.ok(Math.abs(p.easting - easting) < 0.05, `${lon},${lat}: easting ${p.easting} ≈ ${easting}`);
    assert.ok(Math.abs(p.northing - northing) < 0.05, `${lon},${lat}: northing ${p.northing} ≈ ${northing}`);
  }
});

test('the inverse SWEREF99 TM projection matches the fixtures and round-trips', () => {
  const fixtures = [
    [17.8799, 67.7081, 621872.172413631, 7513155.36420101],
    [19.3773, 68.4931, 678963.628636804, 7604206.41120471],
    [15.0, 67.0, 500000.000000001, 7431380.10436739],
  ];
  for (const [lon, lat, easting, northing] of fixtures) {
    const p = sweref99tmInverse(easting, northing);
    assert.ok(Math.abs(p.lon - lon) < 5e-7, `${easting},${northing}: lon ${p.lon} ≈ ${lon}`);
    assert.ok(Math.abs(p.lat - lat) < 5e-7, `${easting},${northing}: lat ${p.lat} ≈ ${lat}`);
  }
  for (const [lon, lat] of [[17.9, 67.7], [19.4, 68.5], [18.6, 68.1]]) {
    const f = sweref99tm(lon, lat);
    const b = sweref99tmInverse(f.easting, f.northing);
    assert.ok(Math.abs(b.lon - lon) < 1e-6 && Math.abs(b.lat - lat) < 1e-6, 'round trip');
  }
});

// ---- corridor derivation ---------------------------------------------------

test('the detail corridor is mapCutoutBounds tile-aligned at the detail min zoom', () => {
  assert.equal(SATELLITE_DETAIL_MIN_ZOOM, SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM + 1);
  const footprint = detailCorridorFootprint(route.mapCutoutBounds);
  assert.deepEqual(footprint, tileAlignedFootprint(route.mapCutoutBounds, SATELLITE_DETAIL_MIN_ZOOM));
  const [[w, s], [e, n]] = route.mapCutoutBounds;
  assert.ok(footprint.west <= w && footprint.east >= e, 'corridor contains the cutout E-W');
  assert.ok(footprint.south <= s && footprint.north >= n, 'corridor contains the cutout N-S');
});

test('detail tile inventory: every deeper zoom covers exactly the children of the z14 range', () => {
  const inventory = detailTileInventory(route.mapCutoutBounds, 15);
  const base = tileRange(route.mapCutoutBounds, SATELLITE_DETAIL_MIN_ZOOM);
  assert.deepEqual(inventory[0], base);
  const z15 = inventory[1];
  assert.equal(z15.z, 15);
  assert.equal(z15.xMin, base.xMin * 2);
  assert.equal(z15.xMax, base.xMax * 2 + 1);
  assert.equal(z15.yMin, base.yMin * 2);
  assert.equal(z15.yMax, base.yMax * 2 + 1);
  assert.equal(z15.count, base.count * 4);
  assert.equal(base.count, (base.xMax - base.xMin + 1) * (base.yMax - base.yMin + 1));
});

// ---- fixtures --------------------------------------------------------------

const GRID_M = 5000;

/** A synthetic 0.4 m rgbi COG item on the 5 km EPSG:3006 grid. */
function fixtureItem(easting, northing, overrides = {}) {
  const id = `o${northing / 100}_${easting / 100}_50_test`;
  return {
    id,
    properties: {
      'upplosning': EXPECTED_RESOLUTION_M,
      'proj:code': 'EPSG:3006',
      'spektraltyp': 'rgbi',
      'proj:bbox': [easting, northing, easting + GRID_M, northing + GRID_M],
      datetime: '2024-09-06T12:00:00Z',
      'flygar': 2024,
      ...overrides.properties,
    },
    assets: overrides.assets ?? {
      data: {
        href: `https://dl1.example.se/orto/${id}.tif`,
        type: 'image/tiff; application=geotiff; profile=cloud-optimized',
        'file:size': 400_000_000,
      },
    },
  };
}

/** Every 5 km grid cell overlapping the WGS84 footprint (corners projected). */
function fixtureGridFor(footprint) {
  const corners = [
    sweref99tm(footprint.west, footprint.south),
    sweref99tm(footprint.east, footprint.south),
    sweref99tm(footprint.west, footprint.north),
    sweref99tm(footprint.east, footprint.north),
  ];
  const minE = Math.floor(Math.min(...corners.map((c) => c.easting)) / GRID_M) * GRID_M;
  const maxE = Math.ceil(Math.max(...corners.map((c) => c.easting)) / GRID_M) * GRID_M;
  const minN = Math.floor(Math.min(...corners.map((c) => c.northing)) / GRID_M) * GRID_M;
  const maxN = Math.ceil(Math.max(...corners.map((c) => c.northing)) / GRID_M) * GRID_M;
  const items = [];
  for (let e = minE; e < maxE; e += GRID_M) {
    for (let n = minN; n < maxN; n += GRID_M) {
      items.push(fixtureItem(e, n));
    }
  }
  return items;
}

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// ---- pagination ------------------------------------------------------------

test('pagination follows next links to exhaustion and de-duplicates by id', async () => {
  const a = fixtureItem(620000, 7510000);
  const b = fixtureItem(625000, 7510000);
  const c = fixtureItem(630000, 7510000);
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.includes('page2')) {
      // `b` appears AGAIN on page 2 — a moving paging boundary must not
      // double-count it.
      return jsonResponse({ features: [b, c], links: [] });
    }
    return jsonResponse({
      features: [a, b],
      links: [{ rel: 'next', href: 'https://stac.example/page2' }],
    });
  };
  const bbox = { west: 17, south: 67, east: 20, north: 69 };
  const { items, pages, duplicates } = await fetchAllItems(bbox, { fetchImpl });
  assert.equal(pages, 2);
  assert.equal(duplicates, 1);
  assert.deepEqual(items.map((i) => i.id).sort(), [a.id, b.id, c.id].sort());
  assert.equal(requested[0], stacItemsUrl(bbox));
});

test('rate-limited pages are retried with backoff instead of failing the acquisition', async () => {
  const item = fixtureItem(620000, 7510000);
  let calls = 0;
  const sleeps = [];
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) return jsonResponse(null, 429);
    return jsonResponse({ features: [item], links: [] });
  };
  const { items } = await fetchAllItems(
    { west: 17, south: 67, east: 20, north: 69 },
    { fetchImpl, retryDelayMs: 1, sleepImpl: async (ms) => sleeps.push(ms) },
  );
  assert.equal(items.length, 1);
  assert.equal(calls, 3);
  assert.equal(sleeps.length, 2, 'each retry backed off');
});

test('a non-retryable error and a pagination loop both fail loudly', async () => {
  await assert.rejects(
    fetchAllItems({ west: 17, south: 67, east: 20, north: 69 }, {
      fetchImpl: async () => jsonResponse(null, 403),
    }),
    /HTTP 403/,
  );
  const loopUrl = stacItemsUrl({ west: 17, south: 67, east: 20, north: 69 });
  await assert.rejects(
    fetchAllItems({ west: 17, south: 67, east: 20, north: 69 }, {
      fetchImpl: async () => jsonResponse({
        features: [],
        links: [{ rel: 'next', href: loopUrl }],
      }),
    }),
    /pagination loop/,
  );
});

// ---- validation ------------------------------------------------------------

test('the source contract is enforced per item', () => {
  assert.deepEqual(validateItems([fixtureItem(620000, 7510000)]), []);
  assert.match(validateItems([])[0], /no STAC items/);

  const wrongRes = fixtureItem(620000, 7510000, { properties: { 'upplosning': 0.5 } });
  assert.match(validateItems([wrongRes]).join('\n'), /resolution 0\.5/);

  const wrongCrs = fixtureItem(620000, 7510000, { properties: { 'proj:code': 'EPSG:3021' } });
  assert.match(validateItems([wrongCrs]).join('\n'), /CRS EPSG:3021/);

  const wrongSpectral = fixtureItem(620000, 7510000, { properties: { 'spektraltyp': 'ir' } });
  assert.match(validateItems([wrongSpectral]).join('\n'), /spectral type ir/);

  const noAsset = fixtureItem(620000, 7510000, { assets: {} });
  assert.match(validateItems([noAsset]).join('\n'), /no data asset/);

  const userinfo = fixtureItem(620000, 7510000, {
    assets: {
      data: {
        href: 'https://user:pass@dl1.example.se/orto/x.tif',
        type: 'image/tiff; application=geotiff; profile=cloud-optimized',
      },
    },
  });
  assert.match(validateItems([userinfo]).join('\n'), /userinfo/);
});

test('the summary reports count, native bytes, dates and source facts', () => {
  const items = [fixtureItem(620000, 7510000), fixtureItem(625000, 7510000)];
  items[1].properties.datetime = '2024-07-01T10:00:00Z';
  const s = summarizeItems(items);
  assert.equal(s.count, 2);
  assert.equal(s.totalNativeBytes, 800_000_000);
  assert.deepEqual(s.resolutionsM, [EXPECTED_RESOLUTION_M]);
  assert.deepEqual(s.spectralTypes, ['rgbi']);
  assert.equal(s.acquiredFrom, '2024-07-01T10:00:00Z');
  assert.equal(s.acquiredTo, '2024-09-06T12:00:00Z');
});

// ---- coverage --------------------------------------------------------------

test('a complete 5 km grid covers the real corridor; one missing tile is detected', () => {
  const footprint = detailCorridorFootprint(route.mapCutoutBounds);
  const items = fixtureGridFor(footprint);
  assert.equal(coverageGaps(items, footprint).length, 0, 'full grid → no gaps');

  // Remove one interior source tile — the corridor must notice the hole.
  const centre = sweref99tm(
    (footprint.west + footprint.east) / 2,
    (footprint.south + footprint.north) / 2,
  );
  const holed = items.filter((i) => {
    const [w, s, e, n] = i.properties['proj:bbox'];
    return !(centre.easting >= w && centre.easting <= e && centre.northing >= s && centre.northing <= n);
  });
  assert.equal(holed.length, items.length - 1);
  assert.ok(coverageGaps(holed, footprint).length > 0, 'missing tile → gaps reported');
});

test('per-z14-tile stats split the corridor into orthophoto, seam and fallback tiles', () => {
  const items = fixtureGridFor(detailCorridorFootprint(route.mapCutoutBounds));
  const full = detailTileCoverageStats(items, route.mapCutoutBounds);
  assert.equal(full.detailMinZoom, SATELLITE_DETAIL_MIN_ZOOM);
  assert.equal(full.totalTiles, tileRange(route.mapCutoutBounds, SATELLITE_DETAIL_MIN_ZOOM).count);
  assert.equal(full.fullyOrthophoto, full.totalTiles, 'full grid → every tile orthophoto');
  assert.equal(full.fallbackTiles, 0);
  assert.equal(full.orthophotoPercent, 100);
  assert.equal(full.fallbackPercent, 0);

  // Remove one interior 5 km cell: some tiles fall back, at least one
  // straddles the boundary (a seam tile), and the split stays a partition.
  const centre = sweref99tm(
    (detailCorridorFootprint(route.mapCutoutBounds).west + detailCorridorFootprint(route.mapCutoutBounds).east) / 2,
    (detailCorridorFootprint(route.mapCutoutBounds).south + detailCorridorFootprint(route.mapCutoutBounds).north) / 2,
  );
  const holed = items.filter((i) => {
    const [w, s, e, n] = i.properties['proj:bbox'];
    return !(centre.easting >= w && centre.easting <= e && centre.northing >= s && centre.northing <= n);
  });
  const stats = detailTileCoverageStats(holed, route.mapCutoutBounds);
  assert.ok(stats.fallbackTiles > 0, 'a missing cell produces fallback tiles');
  assert.ok(stats.partialOrthophoto > 0, 'cells cut mid-tile produce seam tiles');
  assert.equal(stats.fullyOrthophoto + stats.partialOrthophoto + stats.sentinelOnly, stats.totalTiles);
  assert.equal(stats.fallbackTiles, stats.partialOrthophoto + stats.sentinelOnly);

  const empty = detailTileCoverageStats([], route.mapCutoutBounds);
  assert.equal(empty.sentinelOnly, empty.totalTiles, 'no items → everything falls back');
});

test('probe samples: orthophoto centres inside the corridor, gap probes only where coverage is missing', () => {
  const footprint = detailCorridorFootprint(route.mapCutoutBounds);
  const items = fixtureGridFor(footprint);
  const full = probeSamples(items, route.mapCutoutBounds);
  assert.equal(full.gapProbes.length, 0, 'full coverage → nothing to probe as gap');
  assert.ok(full.orthoProbes.length > 0 && full.orthoProbes.length <= 12);
  for (const p of full.orthoProbes) {
    assert.ok(p.lon > footprint.west && p.lon < footprint.east, 'ortho probe inside corridor lon');
    assert.ok(p.lat > footprint.south && p.lat < footprint.north, 'ortho probe inside corridor lat');
  }

  const centre = sweref99tm((footprint.west + footprint.east) / 2, (footprint.south + footprint.north) / 2);
  const holed = items.filter((i) => {
    const [w, s, e, n] = i.properties['proj:bbox'];
    return !(centre.easting >= w && centre.easting <= e && centre.northing >= s && centre.northing <= n);
  });
  const probes = probeSamples(holed, route.mapCutoutBounds);
  assert.ok(probes.gapProbes.length > 0 && probes.gapProbes.length <= 12, 'gap probes derived from the hole');
  const gapsSweref = probes.gapProbes.map((p) => sweref99tm(p.lon, p.lat));
  for (const g of gapsSweref) {
    const covered = holed.some((i) => {
      const [w, s, e, n] = i.properties['proj:bbox'];
      return g.easting >= w && g.easting <= e && g.northing >= s && g.northing <= n;
    });
    assert.equal(covered, false, 'every gap probe is genuinely outside orthophoto coverage');
  }
});

test('the coverage cutline is closed, densified WGS84 polygons matching the item cells', () => {
  const item = fixtureItem(620000, 7510000);
  const gj = coverageCutlineGeoJSON([item, fixtureItem(625000, 7510000)]);
  assert.equal(gj.type, 'FeatureCollection');
  assert.equal(gj.features.length, 2, 'one polygon per source cell');
  const ring = gj.features[0].geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1], 'ring is closed');
  assert.ok(ring.length > 60, 'edges are densified (default 250 m step on 5 km edges)');
  // Every vertex round-trips into the cell's own 5 km square (± a metre).
  for (const [lon, lat] of ring) {
    const p = sweref99tm(lon, lat);
    assert.ok(p.easting > 620000 - 1 && p.easting < 625000 + 1, 'easting inside the cell');
    assert.ok(p.northing > 7510000 - 1 && p.northing < 7515000 + 1, 'northing inside the cell');
  }
  assertNoCredentialMaterial(JSON.stringify(gj));
});

// ---- VRT + manifest --------------------------------------------------------

test('the VRT references exactly bands 1–3 with catalog-derived geometry', () => {
  const items = [fixtureItem(620000, 7510000), fixtureItem(625000, 7515000)];
  const vrt = buildRgbVrt(items);

  assert.deepEqual([...RGB_BANDS], [1, 2, 3]);
  const bandTags = [...vrt.matchAll(/<VRTRasterBand dataType="Byte" band="(\d)">/g)].map((m) => m[1]);
  assert.deepEqual(bandTags, ['1', '2', '3'], 'exactly three output bands');
  const sourceBands = [...new Set([...vrt.matchAll(/<SourceBand>(\d+)<\/SourceBand>/g)].map((m) => Number(m[1])))];
  assert.deepEqual(sourceBands.sort(), [1, 2, 3], 'the IR band (4) is never referenced');

  assert.match(vrt, /<SRS dataAxisToSRSAxisMapping="2,1">EPSG:3006<\/SRS>/);
  assert.equal((vrt.match(/<NoDataValue>0<\/NoDataValue>/g) ?? []).length, 3,
    'every band declares the unified 0,0,0 no-data, so the fallback keeps flight-boundary pixels');
  // Union of the two 5 km tiles: 620000–630000 E, 7510000–7520000 N at 0.4 m.
  assert.match(vrt, /<GeoTransform>620000, 0\.4, 0, 7520000, 0, -0\.4<\/GeoTransform>/);
  assert.match(vrt, /rasterXSize="25000" rasterYSize="25000"/);
  assert.equal((vrt.match(/<SimpleSource>/g) ?? []).length, 6, '2 items × 3 bands');
  assert.match(vrt, /\/vsicurl\/https:\/\/dl1\.example\.se/);
  // Second item sits 5 km east and 5 km north of the first.
  assert.match(vrt, /<DstRect xOff="12500" yOff="0" xSize="12500" ySize="12500" \/>/);
  assert.match(vrt, /<DstRect xOff="0" yOff="12500" xSize="12500" ySize="12500" \/>/);
});

test('no serialized artifact can carry credential material', () => {
  const items = [fixtureItem(620000, 7510000)];
  assertNoCredentialMaterial(buildRgbVrt(items));
  const manifest = acquisitionManifest(items, detailCorridorFootprint(route.mapCutoutBounds));
  assertNoCredentialMaterial(JSON.stringify(manifest));
  assert.equal(manifest.items[0].bytes, 400_000_000);

  for (const poison of ['LM_USERNAME', 'GDAL_HTTP_USERPWD=x:y', 'https://user:secret@host/x.tif']) {
    assert.throws(() => assertNoCredentialMaterial(`prefix ${poison} suffix`), /credential material/);
  }
  const leaky = fixtureItem(620000, 7510000, {
    assets: {
      data: {
        href: 'https://user:secret@dl1.example.se/orto/x.tif',
        type: 'image/tiff; application=geotiff; profile=cloud-optimized',
      },
    },
  });
  assert.throws(() => buildRgbVrt([leaky]), /credential material/);
});

// ---- acquisition CLI wiring ------------------------------------------------

test('the acquisition CLI reports fallback statistics instead of hard-stopping on orthophoto gaps', () => {
  const cli = readFileSync(join(root, 'scripts/lantmateriet-orthophoto.mjs'), 'utf8');
  assert.match(cli, /detailTileCoverageStats/, 'per-tile orthophoto/fallback split is computed');
  assert.match(cli, /fallbackPercent/, '…and reported');
  assert.match(cli, /coverageCutlineGeoJSON/, 'the coverage cutline is emitted for the build');
  assert.match(cli, /probeSamples/, 'composition probe points are emitted for the build');
  const coverageSection = cli.slice(cli.indexOf('Coverage report'), cli.indexOf('probeSamples('));
  assert.ok(coverageSection.length > 0 && !coverageSection.includes('process.exit'),
    'orthophoto gaps are no longer fatal — Sentinel fallback covers them at build time');
  assert.match(cli, /contract violations[\s\S]{0,200}process\.exit\(1\)/,
    'source-contract violations and an empty item set remain fatal');
  assert.match(cli, /assertNoCredentialMaterial/, 'outputs are screened');
  assert.ok(!/process\.env\.LM_|env\[.LM_/.test(cli),
    'the CLI never reads credentials — the metadata phase is credential-free');

  const prepare = readFileSync(join(root, 'scripts/prepare-lantmateriet-orthophoto.sh'), 'utf8');
  assert.match(prepare, /GDAL_HTTP_AUTH=BASIC/, 'auth handed to GDAL, not to curl command lines');
  assert.match(prepare, /GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR/, 'no remote directory scans');
  assert.ok(!/echo[^\n]*\$\{?LM_PASSWORD/.test(prepare), 'the password VALUE is never echoed');
});
