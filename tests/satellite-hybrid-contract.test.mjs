/**
 * Hybrid satellite archive — the contracts that keep the Sentinel overview
 * pyramid, the Lantmäteriet detail corridor, the camera envelope, the
 * catalog and the attribution registry telling ONE story.
 *
 * The hybrid ships as a flag-day set: the catalog revision that first
 * carries z14–15, SATELLITE_ARCHIVE_MAX_ZOOM, and the Lantmäteriet
 * attribution's `present` flag must all flip in the same change. These
 * tests make a half-done flip fail loudly instead of shipping a camera that
 * promises coverage the archive doesn't hold (or credits it doesn't owe).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import {
  RASTER_ARCHIVE_MIN_ZOOM,
  RASTER_EDGE_SAFETY_METRES,
  SATELLITE_ARCHIVE_MAX_ZOOM,
  SATELLITE_DETAIL_MIN_ZOOM,
  SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM,
  coverageForMode,
  mercX,
  mercY,
  rasterRenderableCoverage,
  satelliteSourceCoverage,
  tileAlignedFootprint,
} from '../src/map/overviewEnvelope.mjs';
import { MAP_ASSETS } from '../src/map/mapCatalog.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));
const read = (p) => readFileSync(join(root, p), 'utf8');

const CUTOUT = route.mapCutoutBounds;

// ---- coverage envelope -----------------------------------------------------

test('satellite coverage: full overview pyramid through the Sentinel zooms, corridor above', () => {
  assert.equal(SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM, 13, 'the Sentinel pyramid tops out at z13');
  assert.equal(SATELLITE_DETAIL_MIN_ZOOM, SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM + 1);

  const overview = rasterRenderableCoverage(CUTOUT, RASTER_ARCHIVE_MIN_ZOOM);
  for (let z = RASTER_ARCHIVE_MIN_ZOOM; z <= SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM; z++) {
    assert.deepEqual(satelliteSourceCoverage(z, CUTOUT), overview, `z${z} carries the full overview footprint`);
  }

  // Detail zooms share ONE physical rectangle: the cutout tile-aligned at
  // the detail min zoom (the corridor is built once at that alignment and
  // every deeper zoom covers exactly its children).
  const corridor = tileAlignedFootprint(CUTOUT, SATELLITE_DETAIL_MIN_ZOOM);
  for (const z of [SATELLITE_DETAIL_MIN_ZOOM, SATELLITE_DETAIL_MIN_ZOOM + 1]) {
    assert.deepEqual(satelliteSourceCoverage(z, CUTOUT), corridor, `z${z} claims the z${SATELLITE_DETAIL_MIN_ZOOM}-aligned corridor`);
  }
  assert.ok(corridor.east < overview.east && corridor.west > overview.west,
    'the corridor is strictly narrower than the overview footprint');
});

test('the future corridor envelope still contains the camera user bounds with the safety inset', () => {
  // When SATELLITE_ARCHIVE_MAX_ZOOM rises past the Sentinel zooms, the
  // satellite camera at detail zooms becomes bounded by the corridor minus
  // RASTER_EDGE_SAFETY_METRES. That inset envelope must still contain the
  // interaction bounds, or the flip would shrink the camera below contract.
  const corridor = satelliteSourceCoverage(SATELLITE_DETAIL_MIN_ZOOM, CUTOUT);
  const [[uw, us], [ue, un]] = route.userBounds;
  assert.ok(mercX(corridor.west) + RASTER_EDGE_SAFETY_METRES < mercX(uw), 'west margin holds');
  assert.ok(mercX(corridor.east) - RASTER_EDGE_SAFETY_METRES > mercX(ue), 'east margin holds');
  assert.ok(mercY(corridor.south) + RASTER_EDGE_SAFETY_METRES < mercY(us), 'south margin holds');
  assert.ok(mercY(corridor.north) - RASTER_EDGE_SAFETY_METRES > mercY(un), 'north margin holds');
});

test('while the shipped archive is all-Sentinel, the runtime envelope is unchanged', () => {
  // The corridor branch is unreachable until SATELLITE_ARCHIVE_MAX_ZOOM
  // rises: coverageForMode caps the source zoom at the archive max.
  for (const displayZoom of [7, 12.4, 13, 14.6, 17]) {
    if (SATELLITE_ARCHIVE_MAX_ZOOM <= SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM) {
      assert.deepEqual(
        coverageForMode('satellite', CUTOUT, undefined, displayZoom),
        coverageForMode('satellite', CUTOUT),
        `display z${displayZoom}: still the overview envelope`,
      );
    }
  }
});

// ---- flag-day fences -------------------------------------------------------

test('SATELLITE_ARCHIVE_MAX_ZOOM matches the catalog satellite revision', () => {
  assert.equal(
    SATELLITE_ARCHIVE_MAX_ZOOM,
    MAP_ASSETS.satellite.revision.coverage.maxZoom,
    'the camera constant and the catalog describe the same shipped archive',
  );
});

test('the Lantmäteriet attribution ships exactly when the archive carries detail zooms', () => {
  const attribution = read('src/data/attribution.ts');
  const block = attribution.slice(attribution.indexOf("id: 'lantmateriet-ortofoto'"));
  const match = block.match(/present: (true|false)/);
  assert.ok(match, 'the lantmateriet-ortofoto entry declares present');
  const present = match[1] === 'true';
  const hybridShipped = MAP_ASSETS.satellite.revision.coverage.maxZoom > SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM;
  assert.equal(present, hybridShipped,
    'aerial-orthophoto credit is rendered exactly while orthophoto zooms actually ship');
  // The entry is finalized either way: real credit text, licence, notice.
  assert.match(block, /CC BY 4\.0/);
  assert.match(block, /mapAttributionHtml/);
  assert.match(block, /© Lantmäteriet/);
  assert.match(block, /modifiedNotice/);
});

test('the map satellite credit derives from every present satellite-layer source', () => {
  const attribution = read('src/data/attribution.ts');
  assert.match(attribution, /SATELLITE_LAYER_SOURCE_INFOS = \[\s*DATA_SOURCE_BY_ID\['sentinel2-eox'\],\s*DATA_SOURCE_BY_ID\['lantmateriet-ortofoto'\],\s*\]\.filter\(\(s\) => s\.present\)/);
  const mapStyle = read('src/map/mapStyle.ts');
  assert.match(mapStyle, /SATELLITE_ATTRIBUTION = SATELLITE_LAYER_ATTRIBUTION_HTML/,
    'the raster source credit cannot go stale against the registry');
  const card = read('src/components/OfflineMapCard.tsx');
  assert.match(card, /SATELLITE_LAYER_SOURCE_INFOS/, 'the Settings card reads the same composition');
});

// ---- build pipeline contracts ----------------------------------------------

test('the hybrid builder derives every bound from the canonical helpers', () => {
  const builder = read('scripts/build-satellite-map.sh');
  assert.match(builder, /overviewEnvelope\.mjs/, 'bounds come from the runtime contract module');
  assert.match(builder, /SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM/, 'the zoom split is the shared constant');
  assert.match(builder, /SATELLITE_DETAIL_MIN_ZOOM/);
  assert.match(builder, /detailTileInventory/, 'expected inventory comes from the shared helper');
  assert.match(builder, /mapCutoutBounds/, 'derived from the generated route');
  // No hand-typed corridor coordinates anywhere in the builder.
  assert.ok(!/17\.8[67]|19\.37|67\.7|68\.49/.test(builder), 'no hard-coded corridor bounds');
});

test('the detail warp streams RGB with aerial-appropriate resampling and env-only credentials', () => {
  const builder = read('scripts/build-satellite-map.sh');
  assert.match(builder, /GDAL_HTTP_AUTH=BASIC/);
  assert.match(builder, /GDAL_HTTP_USERPWD="\$\{LM_USERNAME\}:\$\{LM_PASSWORD\}"/,
    'credentials flow through GDAL environment variables only');
  assert.ok(!/echo[^\n]*\$\{?LM_PASSWORD/.test(builder), 'the password value is never echoed');
  assert.match(builder, /GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR/, 'no remote directory scans');
  assert.match(builder, /CPL_VSIL_CURL_ALLOWED_EXTENSIONS/, 'only .tif range reads');
  assert.match(builder, /-r cubic/, 'continuous-tone resampling — never nearest-neighbour');
  assert.match(builder, /BIGTIFF=YES/, 'the z15 intermediate exceeds 4 GiB uncompressed');
});

test('the detail corridor is composited: complete Sentinel fallback under a masked orthophoto overlay', () => {
  const builder = read('scripts/build-satellite-map.sh');

  // Step 1: the fallback is complete BY PROOF, not assumption.
  assert.match(builder, /Sentinel fallback → exact z/, 'fallback warped to the exact detail grid first');
  assert.match(builder, /fully contains the detail corridor/, 'source-extent containment is asserted');

  // Step 2: overlay priority comes from the validity mask, applied hard.
  const overlay = builder.slice(builder.indexOf('Detail step 2'), builder.indexOf('composition proof'));
  assert.ok(overlay.length > 0, 'the overlay step exists');
  assert.match(overlay, /-cutline "\$ORTHO_CUTLINE"/, 'orthophoto pixels only inside cataloged coverage');
  assert.match(overlay, /UNIFIED_SRC_NODATA=YES/, 'declared 0,0,0 no-data keeps Sentinel, never black');
  assert.ok(!/^\s*-overwrite/m.test(overlay), 'the overlay warp UPDATES the fallback raster in place');
  assert.ok(!/^\s*-cblend/m.test(builder), 'no feathering/blending — a visible source seam is correct');

  // Step 3: the composition is proven with probes before the tiles exist.
  assert.match(builder, /gdallocationinfo/, 'probe points are sampled on the real raster');
  assert.match(builder, /probes_fallback/, '…before the overlay');
  assert.match(builder, /probes_composite/, '…and after it');
  assert.match(builder, /was overwritten with/, 'gap probes must keep their Sentinel pixels');
  assert.match(builder, /no-data black in the composite/, 'no probe may be black');
  assert.match(builder, /overlay did not take priority/, 'orthophoto probes must actually change');
});

test('the size gate steps down detail quality and never silently downgrades max zoom', () => {
  const builder = read('scripts/build-satellite-map.sh');
  assert.match(builder, /SIZE_LIMIT_GIB="\$\{SIZE_LIMIT_GIB:-1\.9\}"/, '1.9 GiB release-asset gate');
  assert.match(builder, /-gt 75 \]/, 'quality ladder step 75');
  assert.match(builder, /-gt 70 \]/, 'quality ladder step 70');
  assert.match(builder, /NOT downgrading max zoom silently/,
    'z14 fallback is an explicit human decision');
  assert.match(builder, /MAXZOOM=14 only as an explicit decision/);
});

test('the maintenance workflow takes credentials from secrets, never from the file', () => {
  const workflow = read('.github/workflows/satellite-data-maintenance.yml');
  assert.match(workflow, /LM_USERNAME: \$\{\{ secrets\.LM_USERNAME \}\}/);
  assert.match(workflow, /LM_PASSWORD: \$\{\{ secrets\.LM_PASSWORD \}\}/);
  assert.ok(!/LM_PASSWORD: (?!\$\{\{ secrets)/.test(workflow), 'no literal credential values');
});
