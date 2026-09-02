/**
 * Dev-only Satellite A/B benchmark — isolation contract.
 *
 * The benchmark (src/map/satBenchmark.ts) exists to compare the canonical
 * v5 archive against a local, git-ignored v6 candidate INSIDE the real map.
 * These tests make it impossible for that tooling to leak into shipping
 * behaviour: it must stay dev-gated, dynamically imported, storage-free,
 * and the canonical satellite contract must remain exactly v5.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MAP_ASSETS } from '../src/map/mapCatalog.mjs';
import { SATELLITE_ARCHIVE_MAX_ZOOM } from '../src/map/overviewEnvelope.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('the benchmark is reachable only through the DEV + query-parameter gate', () => {
  const mapView = read('src/components/MapView.tsx');
  const gate = mapView.slice(mapView.indexOf('satBenchmark') - 400, mapView.indexOf("import('../map/satBenchmark')") + 60);
  assert.match(gate, /import\.meta\.env\.DEV &&/, 'DEV-build gate present');
  assert.match(gate, /has\('satBenchmark'\)/, 'explicit query parameter required');
  assert.match(mapView, /import\('\.\.\/map\/satBenchmark'\)/, 'dynamic import only — production bundles drop it');
  assert.ok(
    !/^import .*satBenchmark/m.test(mapView),
    'no static import of the benchmark module anywhere in MapView',
  );
});

test('no production module statically imports the benchmark', () => {
  const hits = execSync(
    "grep -rl \"from '.*satBenchmark'\" src --include='*.ts' --include='*.tsx' || true",
    { cwd: root, encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean);
  // Only the module's own file may mention such an import form (it does not),
  // so the expected result is: nothing at all.
  assert.deepEqual(hits, [], 'satBenchmark must never be statically imported');
});

test('the benchmark touches no catalog, storage or attribution surface', () => {
  const bench = read('src/map/satBenchmark.ts');
  const specifiers = [...bench.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    specifiers.filter((s) => /mapCatalog|offlineMap|archiveStore|archiveRevision|attribution/.test(s)),
    [],
    'satBenchmark must import no catalog/storage/attribution module',
  );
  assert.deepEqual(
    specifiers.filter((s) => !s.startsWith('maplibre-gl') && s !== './pmtilesProtocol'),
    [],
    'only the protocol registration and maplibre types may be imported',
  );
  assert.ok(!/caches\.|localStorage|indexedDB/i.test(bench), 'no browser storage of any kind');
  assert.match(bench, /kungsleden-satellite-v6-z16-q95-candidate\.pmtiles/, 'candidate is the git-ignored local file');
  const gitignore = read('.gitignore');
  assert.match(gitignore, /kungsleden-satellite-\*\.pmtiles/, 'candidate archives stay out of git');
});

test('the canonical satellite contract is still exactly v5 while benchmarking', () => {
  const rev = MAP_ASSETS.satellite.revision;
  assert.equal(rev.id, 'kungsleden-satellite-data-v5');
  assert.equal(rev.bytes, 293_720_600);
  assert.equal(rev.sha256, '29996eec00e5a792284f842ea7556e6015dfb85ae9bde9741061ebe56dd110b9');
  assert.equal(rev.coverage.maxZoom, 15);
  assert.equal(SATELLITE_ARCHIVE_MAX_ZOOM, 15);
  assert.equal(MAP_ASSETS.satellite.release.tag, 'satellite-data-v5');
});
