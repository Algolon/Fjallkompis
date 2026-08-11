import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PMTiles } from 'pmtiles';
import { decodePng } from '../scripts/lib/png.mjs';
import { MAP_ASSETS } from '../src/map/mapCatalog.mjs';
import {
  overviewCameraFor,
  rasterSourceZoomForDisplayZoom,
  terrainSourceCoverage,
  terrainUsesOverviewCoverage,
  TERRAIN_ARCHIVE_MAX_ZOOM,
} from '../src/map/overviewEnvelope.mjs';
import { overviewPaddingFor } from '../src/map/mapPadding.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = JSON.parse(readFileSync(join(root, 'src/generated/kungsleden-route.json'), 'utf8'));
const terrainPath = join(root, 'public/maps/kungsleden-terrain.pmtiles');
const matrix = MAP_ASSETS.terrain.revision.coverage.tilesByZoom;

class FileSource {
  constructor(path) { this.path = path; }
  getKey() { return this.path; }
  async getBytes(offset, length) {
    const file = await open(this.path, 'r');
    try {
      const data = Buffer.alloc(length);
      await file.read(data, 0, length, offset);
      return { data: data.buffer.slice(data.byteOffset, data.byteOffset + length) };
    } finally {
      await file.close();
    }
  }
}

const edgeX = (lon, z) => Math.round(((lon + 180) / 360) * 2 ** z);
const edgeY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.round(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function tileMatrixForExtent(extent, z) {
  const x = [edgeX(extent.west, z), edgeX(extent.east, z) - 1];
  const y = [edgeY(extent.north, z), edgeY(extent.south, z) - 1];
  return { zoom: z, x, y, count: (x[1] - x[0] + 1) * (y[1] - y[0] + 1) };
}

const contains = (outer, inner) =>
  outer.west <= inner.west && outer.east >= inner.east &&
  outer.south <= inner.south && outer.north >= inner.north;

test('catalog declares the exact physical Terrain footprint at every source zoom', () => {
  assert.equal(matrix.length, 6);
  for (let z = 7; z <= 12; z += 1) {
    const required = terrainSourceCoverage(z, route.mapCutoutBounds);
    assert.deepEqual(matrix[z - 7], tileMatrixForExtent(required, z), `z${z}`);
  }
});

test('the real Terrain archive contains and decodes every required child tile', async (t) => {
  if (!existsSync(terrainPath)) {
    t.skip('release-injected Terrain archive is absent in this checkout');
    return;
  }
  const archive = new PMTiles(new FileSource(terrainPath));
  let checked = 0;
  for (const level of matrix) {
    for (let x = level.x[0]; x <= level.x[1]; x += 1) {
      for (let y = level.y[0]; y <= level.y[1]; y += 1) {
        const tile = await archive.getZxy(level.zoom, x, y);
        assert.ok(tile, `missing Terrain tile ${level.zoom}/${x}/${y}`);
        const png = decodePng(new Uint8Array(tile.data));
        assert.equal(png.width, 256, `${level.zoom}/${x}/${y} width`);
        assert.equal(png.height, 256, `${level.zoom}/${x}/${y} height`);
        let transparent = false;
        for (let i = 3; i < png.data.length; i += 4) {
          if (png.data[i] !== 255) { transparent = true; break; }
        }
        assert.equal(transparent, false, `${level.zoom}/${x}/${y} has transparent DEM pixels`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 791);
});

test('all supported overview viewports resolve inside real tiles at their effective source zoom', () => {
  const viewports = [
    [320, 568],
    [375, 812],
    [412, 915], // Samsung-like tall portrait
    [812, 375], // phone landscape
    [1366, 768],
    [1512, 860],
    [3440, 1440], // widest existing product regression viewport
  ];
  for (const [width, height] of viewports) {
    const padding = overviewPaddingFor({ viewportWidth: width, viewportHeight: height, topInset: 64 });
    const solved = overviewCameraFor({
      routeBounds: route.bounds,
      userBounds: route.userBounds,
      cutoutBounds: route.mapCutoutBounds,
      viewportWidth: width,
      viewportHeight: height,
      padding,
      mode: 'terrain',
    });
    const sourceZoom = rasterSourceZoomForDisplayZoom(solved.camera.zoom);
    assert.equal(solved.sourceZoom, sourceZoom, `${width}x${height}: reports MapLibre source zoom`);
    const physical = terrainSourceCoverage(sourceZoom, route.mapCutoutBounds);
    const visible = {
      west: solved.visibleExtent[0][0], south: solved.visibleExtent[0][1],
      east: solved.visibleExtent[1][0], north: solved.visibleExtent[1][1],
    };
    assert.ok(contains(physical, visible), `${width}x${height} z${sourceZoom}: visible DEM coverage`);
  }
});

test('Terrain tightens before the first compact source zoom, on both sides of the transition', () => {
  assert.equal(rasterSourceZoomForDisplayZoom(10.4999), 11);
  assert.equal(rasterSourceZoomForDisplayZoom(10.5), 12);
  assert.equal(terrainUsesOverviewCoverage(10.4999), true);
  assert.equal(terrainUsesOverviewCoverage(10.5), false);
  const [[uw, us], [ue, un]] = route.userBounds;
  const z12 = terrainSourceCoverage(12, route.mapCutoutBounds);
  assert.ok(z12.west <= uw && z12.east >= ue && z12.south <= us && z12.north >= un);
  assert.equal(
    rasterSourceZoomForDisplayZoom(13.2307, 256, TERRAIN_ARCHIVE_MAX_ZOOM),
    12,
    'display overzoom remains backed by archive z12',
  );
});
