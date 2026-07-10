/**
 * Provenance manifest for the terrain-relief archives (terrain-data release).
 *
 * Invoked by scripts/build-terrain-map.sh at the end of every build, and
 * runnable standalone to (re)describe already-built archives. Records the
 * exact upstream inputs (Copernicus DEM GLO-30 Public — AWS Open Data
 * mirror, 2021 release), tool versions, build parameters and output hashes,
 * so any terrain-data release asset can be traced back to its sources.
 *
 * The pipeline is REPEATABLE from this manifest, not bit-for-bit
 * reproducible: the AWS mirror serves one unversioned current copy per DEM
 * tile, so a rerun after an upstream update yields different source hashes.
 * The manifest pins what a given build actually consumed.
 *
 * Usage:
 *   node scripts/generate-terrain-provenance.mjs \
 *     --source-tiles <file>   # rows: name|url|bytes|etag|sha256
 *     --route <routeId>       # e.g. kungsleden
 *     --bounds <w,s,e,n>
 *     --terrain-zooms <min,max>
 *     --contour-intervals <interval,index>
 *     --out <output.json>
 *     [--acquired <ISO date>] # defaults to now (pass the real download time
 *                             # when describing archives built earlier)
 */
import { execSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const DEM_BUCKET = 'https://copernicus-dem-30m.s3.amazonaws.com';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  if (!argv[i].startsWith('--') || argv[i + 1] === undefined) {
    console.error(`Bad argument pair: ${argv[i]} ${argv[i + 1] ?? ''}`);
    process.exit(1);
  }
  args[argv[i].slice(2)] = argv[i + 1];
}
for (const required of ['source-tiles', 'route', 'bounds', 'terrain-zooms', 'contour-intervals', 'out']) {
  if (!args[required]) {
    console.error(`Missing --${required}`);
    process.exit(1);
  }
}

const sha256 = (file) =>
  execSync(`shasum -a 256 '${file}'`).toString().split(' ')[0];
const toolVersion = (cmd) => {
  try {
    return execSync(`${cmd} 2>&1`).toString().split('\n')[0].trim();
  } catch (e) {
    return String(e.stdout || e).split('\n')[0].trim();
  }
};

const [west, south, east, north] = args.bounds.split(',').map(Number);
// Optional camera bounds (route + userBufferKm): recorded so the release
// documents both the data extent and the user-accessible extent it serves.
const parseBounds = (csv) => {
  const [w, s, e, n] = csv.split(',').map(Number);
  return { west: w, south: s, east: e, north: n };
};
const userBounds = args['user-bounds'] ? parseBounds(args['user-bounds']) : undefined;
const [terrainMinzoom, terrainMaxzoom] = args['terrain-zooms'].split(',').map(Number);
const [contourInterval, contourIndex] = args['contour-intervals'].split(',').map(Number);

const sourceTiles = readFileSync(args['source-tiles'], 'utf8')
  .trim()
  .split('\n')
  .map((line) => {
    const [name, url, bytes, etag, hash] = line.split('|');
    return { name, url, bytes: Number(bytes), etag, sha256: hash };
  });

const outputs = [
  `public/maps/${args.route}-terrain.pmtiles`,
  `public/maps/${args.route}-contours.pmtiles`,
].map((file) => ({
  file: file.split('/').pop(),
  bytes: statSync(file).size,
  sha256: sha256(file),
}));

const manifest = {
  dataset: 'Copernicus DEM GLO-30 Public — AWS Open Data mirror, 2021 release',
  registry: 'https://registry.opendata.aws/copernicus-dem/',
  bucket: DEM_BUCKET,
  licenseNotice:
    'Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
  acquisitionDate: args.acquired ?? new Date().toISOString(),
  routeId: args.route,
  dataBounds: { west, south, east, north },
  ...(userBounds ? { userBounds } : {}),
  sourceTiles,
  terrain: { encoding: 'terrarium', tileSize: 256, minzoom: terrainMinzoom, maxzoom: terrainMaxzoom },
  contours: { intervalMetres: contourInterval, indexMetres: contourIndex, minzoom: 11, maxzoom: 13, layer: 'contours' },
  tools: {
    gdal: toolVersion('gdalinfo --version'),
    tippecanoe: toolVersion('tippecanoe --version'),
    pmtiles: toolVersion(`${process.env.PMTILES_BIN ?? 'pmtiles'} version`),
  },
  outputs,
  repeatability:
    'Repeatable, not bit-for-bit reproducible: the AWS mirror serves one unversioned current copy per tile. This manifest pins what this build actually consumed.',
};

writeFileSync(args.out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`  wrote ${args.out}`);
