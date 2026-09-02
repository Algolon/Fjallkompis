#!/usr/bin/env node
/**
 * Lantmäteriet Ortofoto source acquisition CLI — the executable half of
 * scripts/lib/lantmateriet-stac.mjs, wrapped for humans by
 * scripts/prepare-lantmateriet-orthophoto.sh.
 *
 *   node scripts/lantmateriet-orthophoto.mjs [routeId]   (default: kungsleden)
 *
 * Queries the orto-j6-2024 STAC collection for the canonical detail
 * corridor (mapCutoutBounds tile-aligned at SATELLITE_DETAIL_MIN_ZOOM),
 * follows pagination, de-duplicates, validates the source contract, and
 * writes into data/source-imagery/lantmateriet-j6/:
 *
 *   items.json                     acquisition manifest (+ coverage stats)
 *   lantmateriet-j6-rgb.vrt        RGB /vsicurl/ mosaic (bands 1–3 only)
 *   lantmateriet-j6-coverage.geojson  WGS84 cutline of cataloged coverage
 *   probes.json                    gap/orthophoto probe points for the build
 *
 * COVERAGE MODEL (Sentinel-fallback composition): the orthophoto collection
 * is NOT required to cover the whole corridor. Where it does not — the
 * flight-area boundary, measured at 451 of 6,693 z14 tiles — the build
 * composites Sentinel-2 underneath, so the FINAL raster is complete. This
 * script therefore reports orthophoto/fallback statistics instead of
 * hard-stopping on gaps; completeness of the composited result is enforced
 * by the build itself (probe checks + per-zoom inventory verification).
 * Contract violations (wrong resolution/CRS/spectral type, missing COG
 * asset) and an empty item set remain HARD STOPS.
 *
 * Everything here is METADATA-ONLY and needs no credentials: the STAC API
 * answers anonymously and the VRT is synthesized from catalog geometry, so
 * no COG is opened. LM_USERNAME/LM_PASSWORD are first needed when the build
 * script warps through the VRT — and they reach GDAL as environment
 * variables only, never through anything this script writes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LM_STAC_API,
  LM_ORTO_COLLECTION,
  SATELLITE_DETAIL_MIN_ZOOM,
  acquisitionManifest,
  assertNoCredentialMaterial,
  buildRgbVrt,
  coverageCutlineGeoJSON,
  detailCorridorFootprint,
  detailTileCoverageStats,
  detailTileInventory,
  fetchAllItems,
  probeSamples,
  summarizeItems,
  validateItems,
} from './lib/lantmateriet-stac.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const routeId = process.argv[2] ?? 'kungsleden';
const routeJsonPath = join(root, `src/generated/${routeId}-route.json`);
let route;
try {
  route = require(routeJsonPath);
} catch {
  console.error(`ERROR: ${routeJsonPath} missing — run 'npm run generate:route' first.`);
  process.exit(1);
}

const outDir = join(root, 'data/source-imagery/lantmateriet-j6');
const cutout = route.mapCutoutBounds;
const footprint = detailCorridorFootprint(cutout);

console.log('── Lantmäteriet Ortofoto acquisition (metadata only) ────────────────');
console.log(`Collection : ${LM_ORTO_COLLECTION} @ ${LM_STAC_API}`);
console.log(`Corridor   : W ${footprint.west}  S ${footprint.south}  E ${footprint.east}  N ${footprint.north}`);
console.log(`             (mapCutoutBounds tile-aligned at z${SATELLITE_DETAIL_MIN_ZOOM}, from ${routeId}-route.json)`);
console.log();

const { items, pages, duplicates } = await fetchAllItems(footprint);
console.log(`STAC query : ${items.length} unique items over ${pages} page(s)` +
  (duplicates ? ` (${duplicates} duplicate id(s) dropped)` : ''));

const problems = validateItems(items);
if (problems.length > 0) {
  console.error('ERROR: source contract violations — refusing to build from this set:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const summary = summarizeItems(items);
const gib = (b) => (b / 1024 ** 3).toFixed(1);
console.log(`Validated  : ${summary.resolutionsM.join('/')} m · ${summary.spectralTypes.join('/')} · ${summary.crs.join('/')}`);
console.log(`Native size: ${summary.totalNativeBytes} bytes (${gib(summary.totalNativeBytes)} GiB) — streamed via /vsicurl/, never downloaded whole`);
console.log(`Acquired   : ${summary.acquiredFrom} … ${summary.acquiredTo} (flight years ${summary.flightYears.join(', ')})`);
console.log();

// ---- Coverage report (informative, NOT a gate) -----------------------------
// Sentinel-fallback composition: the build lays complete Sentinel imagery
// under the corridor and composites orthophotos above it wherever they
// exist, so orthophoto gaps cost detail, never coverage.
const coverage = detailTileCoverageStats(items, cutout);
console.log(`── Orthophoto coverage of the z${coverage.detailMinZoom} corridor (Sentinel fills the rest) ──`);
console.log(`  fully orthophoto  : ${coverage.fullyOrthophoto} / ${coverage.totalTiles} tiles (${coverage.orthophotoPercent} %)`);
console.log(`  partial (seam)    : ${coverage.partialOrthophoto} tiles`);
console.log(`  Sentinel fallback : ${coverage.sentinelOnly} tiles`);
console.log(`  any-fallback total: ${coverage.fallbackTiles} tiles (${coverage.fallbackPercent} %)`);
if (coverage.fallbackTiles > 0) {
  console.log('  → these areas will show Sentinel-2 detail (same as over-zoomed z13) under');
  console.log('    the flight-area boundary; the composited archive stays hole-free.');
}
console.log();

const probes = probeSamples(items, cutout);

mkdirSync(outDir, { recursive: true });
const manifest = acquisitionManifest(items, footprint, { coverage });
writeFileSync(join(outDir, 'items.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const vrt = buildRgbVrt(items);
assertNoCredentialMaterial(vrt);
writeFileSync(join(outDir, 'lantmateriet-j6-rgb.vrt'), vrt);
const cutline = coverageCutlineGeoJSON(items);
writeFileSync(join(outDir, 'lantmateriet-j6-coverage.geojson'), `${JSON.stringify(cutline)}\n`);
writeFileSync(join(outDir, 'probes.json'), `${JSON.stringify(probes, null, 2)}\n`);
console.log(`Wrote ${join(outDir, 'items.json')}`);
console.log(`Wrote ${join(outDir, 'lantmateriet-j6-rgb.vrt')} (bands 1–3 / RGB only, NoData 0,0,0)`);
console.log(`Wrote ${join(outDir, 'lantmateriet-j6-coverage.geojson')} (${cutline.features.length} coverage polygons, WGS84)`);
console.log(`Wrote ${join(outDir, 'probes.json')} (${probes.gapProbes.length} gap + ${probes.orthoProbes.length} orthophoto probes)`);

console.log();
console.log('── Expected detail-zoom inventory (composited: complete) ────────────');
for (const r of detailTileInventory(cutout, 15)) {
  console.log(`  z${r.z}: x ${r.xMin}–${r.xMax} × y ${r.yMin}–${r.yMax} = ${r.count} tiles`);
}
console.log();
console.log('Next: scripts/build-satellite-map.sh (needs LM_USERNAME/LM_PASSWORD in the environment).');
