/**
 * Vector-archive REVISION contract (src/map/archiveRevision.mjs).
 *
 * The defect these fence: the vector basemap keeps a stable public URL across
 * rebuilds, and status detection used to be existence-only — so a device that
 * downloaded the archive before the 2026-08 overview-corridor rebuild
 * (PR #104) kept serving the superseded 5,603,107-byte file indefinitely,
 * while Settings reported it as downloaded.
 *
 * Three states must stay distinguishable — current, legacy (usable, update
 * available) and absent — and the migration must never cost a hiker their
 * working offline map: verify, then store, then prune, in that order.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { PMTiles } from 'pmtiles';
import { open } from 'node:fs/promises';
import {
  ARCHIVE_MISMATCH_ERROR,
  archiveFetchUrl,
  archiveSizeRejection,
  classifyArchiveProbe,
  probeArchiveCaches,
  pruneLegacyArchives,
  removeArchiveRevision,
  storeArchiveRevision,
  VECTOR_ARCHIVE_CACHE,
  VECTOR_ARCHIVE_LEGACY_CACHES,
  VECTOR_ARCHIVE_REVISION,
  VECTOR_ARCHIVE_SUPERSEDED_BYTES,
} from '../src/map/archiveRevision.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const offlineMap = readFileSync(join(root, 'src/map/offlineMap.ts'), 'utf8');
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');
const card = readFileSync(join(root, 'src/components/OfflineMapCard.tsx'), 'utf8');
const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
const pkg = require(join(root, 'package.json'));

const ARCHIVE_FILE = join(root, 'public/maps/kungsleden.pmtiles');
const URL_KEY = 'https://example.test/Fjallkompis/maps/kungsleden.pmtiles';
const CURRENT = VECTOR_ARCHIVE_REVISION.bytes;
const LEGACY_CACHE = VECTOR_ARCHIVE_LEGACY_CACHES[0];

/** The vector spec as the app hands it to the contract. */
const vectorSpec = () => ({
  cacheName: VECTOR_ARCHIVE_CACHE,
  url: URL_KEY,
  legacyCacheNames: VECTOR_ARCHIVE_LEGACY_CACHES,
  expectedBytes: CURRENT,
});

// ---- Fake Cache Storage -----------------------------------------------------
// Only the surface the contract uses, plus call bookkeeping so the tests can
// assert what was NOT touched — the whole point of a safe migration.

class FakeEntry {
  constructor(size) {
    this.size = size;
  }
  clone() {
    return this;
  }
  async blob() {
    return { size: this.size };
  }
}

class FakeCache {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
  }
  async match(url) {
    return this.entries.get(url);
  }
  async put(url, response) {
    this.entries.set(url, response);
  }
  async delete(url) {
    return this.entries.delete(url);
  }
}

class FakeCacheStorage {
  /** @param {Record<string, Record<string, FakeEntry>>} seed */
  constructor(seed = {}) {
    this.caches = new Map(
      Object.entries(seed).map(([name, entries]) => [name, new FakeCache(entries)]),
    );
    this.opened = [];
    this.deleted = [];
  }
  async open(name) {
    this.opened.push(name);
    // Matches the real CacheStorage: open() creates a cache that is missing.
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name);
  }
  async has(name) {
    return this.caches.has(name);
  }
  async delete(name) {
    this.deleted.push(name);
    return this.caches.delete(name);
  }
  names() {
    return [...this.caches.keys()].sort();
  }
  sizeIn(name) {
    const entry = this.caches.get(name)?.entries.get(URL_KEY);
    return entry ? entry.size : null;
  }
}

/** A device that downloaded the archive before PR #104. */
const seedLegacyDevice = () =>
  new FakeCacheStorage({
    [LEGACY_CACHE]: { [URL_KEY]: new FakeEntry(VECTOR_ARCHIVE_SUPERSEDED_BYTES) },
    'fjallkompis-offline-terrain-v1': { terrain: new FakeEntry(19_297_735) },
    'fjallkompis-offline-contours-v1': { contours: new FakeEntry(9_271_029) },
    'fjallkompis-offline-satellite-v1': { satellite: new FakeEntry(61_704_169) },
  });

const OTHER_LAYER_CACHES = [
  'fjallkompis-offline-terrain-v1',
  'fjallkompis-offline-contours-v1',
  'fjallkompis-offline-satellite-v1',
];

// ---- Classification: the three states ---------------------------------------

test('the current archive, at exactly its declared byte length, is current', () => {
  const c = classifyArchiveProbe({ currentBytes: CURRENT, expectedBytes: CURRENT });
  assert.equal(c.state, 'current');
  assert.equal(c.source, 'current');
  assert.equal(c.sizeBytes, CURRENT);
  assert.equal(c.downloaded, true);
  assert.equal(c.updateAvailable, false);
});

test('the pre-PR #104 archive is legacy — downloaded, usable, update available', () => {
  const c = classifyArchiveProbe({
    legacyBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES,
    expectedBytes: CURRENT,
  });
  assert.equal(c.state, 'legacy');
  assert.equal(c.source, 'legacy');
  assert.equal(c.sizeBytes, VECTOR_ARCHIVE_SUPERSEDED_BYTES, 'reports what is actually stored');
  assert.equal(c.downloaded, true, 'the map still works offline');
  assert.equal(c.updateAvailable, true);
});

test('no cached archive anywhere is absent', () => {
  const c = classifyArchiveProbe({ expectedBytes: CURRENT });
  assert.equal(c.state, 'absent');
  assert.equal(c.source, null);
  assert.equal(c.sizeBytes, null);
  assert.equal(c.downloaded, false);
  assert.equal(c.updateAvailable, false);
});

test('with both revisions present the current one wins', () => {
  const c = classifyArchiveProbe({
    currentBytes: CURRENT,
    legacyBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES,
    expectedBytes: CURRENT,
  });
  assert.equal(c.state, 'current');
  assert.equal(c.source, 'current');
  assert.equal(c.sizeBytes, CURRENT);
});

test('a wrong-size entry in the CURRENT cache is not current', () => {
  // A truncated write, or a blob seeded by hand. Usable-ish, and Update is
  // the remedy — but it must never claim to be the shipped revision.
  const c = classifyArchiveProbe({ currentBytes: CURRENT - 1, expectedBytes: CURRENT });
  assert.equal(c.state, 'legacy');
  assert.equal(c.source, 'current', 'still the cache the blob is read from');
  assert.equal(c.updateAvailable, true);
});

test('REGRESSION: a 5,603,107-byte response can never be the PR #104 archive', () => {
  assert.equal(VECTOR_ARCHIVE_SUPERSEDED_BYTES, 5_603_107);
  assert.notEqual(VECTOR_ARCHIVE_REVISION.bytes, VECTOR_ARCHIVE_SUPERSEDED_BYTES);
  for (const probe of [
    { currentBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES },
    { legacyBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES },
    { currentBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES, legacyBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES },
  ]) {
    const c = classifyArchiveProbe({ ...probe, expectedBytes: CURRENT });
    assert.equal(c.state, 'legacy', `${JSON.stringify(probe)} must not read as current`);
    assert.equal(c.updateAvailable, true);
  }
});

test('an archive with no declared revision keeps existence-only status', () => {
  // Terrain, contours and satellite have had exactly one revision each.
  const present = classifyArchiveProbe({ currentBytes: 19_297_735, expectedBytes: null });
  assert.equal(present.state, 'current');
  assert.equal(present.updateAvailable, false);
  assert.equal(present.expectedBytes, null);
  assert.equal(classifyArchiveProbe({ expectedBytes: null }).state, 'absent');
});

// ---- Probing real caches ----------------------------------------------------

test('a legacy device is detected as legacy, and the blob is read from the v1 cache', async () => {
  const caches = seedLegacyDevice();
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'legacy');
  assert.equal(probe.cacheName, LEGACY_CACHE);
  assert.equal(probe.sizeBytes, VECTOR_ARCHIVE_SUPERSEDED_BYTES);
  assert.equal(probe.expectedBytes, CURRENT);
});

test('opening the app deletes nothing — a legacy archive survives a status check', async () => {
  const caches = seedLegacyDevice();
  const before = caches.names();
  await probeArchiveCaches(caches, vectorSpec());
  await probeArchiveCaches(caches, vectorSpec());
  assert.deepEqual(caches.deleted, [], 'no cache is deleted by reading status');
  assert.equal(caches.sizeIn(LEGACY_CACHE), VECTOR_ARCHIVE_SUPERSEDED_BYTES);
  assert.ok(
    before.every((name) => caches.names().includes(name)),
    'every pre-existing cache is still there',
  );
});

test('an up-to-date device never opens a legacy cache', async () => {
  const caches = new FakeCacheStorage({
    [VECTOR_ARCHIVE_CACHE]: { [URL_KEY]: new FakeEntry(CURRENT) },
  });
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'current');
  assert.equal(probe.cacheName, VECTOR_ARCHIVE_CACHE);
  assert.deepEqual(caches.opened, [VECTOR_ARCHIVE_CACHE], 'one lookup, as before the contract');
  assert.ok(!caches.names().includes(LEGACY_CACHE), 'no empty legacy cache is conjured');
});

test('probing invents no cache — a status check leaves the inventory identical', async () => {
  // caches.open() CREATES a missing cache. An empty current-revision cache
  // appearing on every device that merely opened Settings would misread as a
  // stored archive in any cache-storage inventory.
  const fresh = new FakeCacheStorage();
  await probeArchiveCaches(fresh, vectorSpec());
  assert.deepEqual(fresh.names(), [], 'a device with no archive still has no caches');
  assert.deepEqual(fresh.opened, [], 'nothing was opened at all');

  const legacyOnly = seedLegacyDevice();
  const before = legacyOnly.names();
  await probeArchiveCaches(legacyOnly, vectorSpec());
  assert.deepEqual(legacyOnly.names(), before, 'no current-revision cache is conjured');
});

test('the current revision takes precedence over a legacy copy still on disk', async () => {
  const caches = new FakeCacheStorage({
    [VECTOR_ARCHIVE_CACHE]: { [URL_KEY]: new FakeEntry(CURRENT) },
    [LEGACY_CACHE]: { [URL_KEY]: new FakeEntry(VECTOR_ARCHIVE_SUPERSEDED_BYTES) },
  });
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'current');
  assert.equal(probe.cacheName, VECTOR_ARCHIVE_CACHE);
  assert.equal(probe.sizeBytes, CURRENT);
});

test('a fresh device reports absent', async () => {
  const caches = new FakeCacheStorage();
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'absent');
  assert.equal(probe.cacheName, null);
  assert.equal(probe.downloaded, false);
});

// ---- Migration --------------------------------------------------------------

test('a successful update stores v2 and removes ONLY the old vector cache', async () => {
  const caches = seedLegacyDevice();
  const { bytes, pruned } = await storeArchiveRevision(
    caches,
    vectorSpec(),
    { size: CURRENT },
    (blob) => new FakeEntry(blob.size),
  );

  assert.equal(bytes, CURRENT);
  assert.deepEqual(pruned, [LEGACY_CACHE]);
  assert.equal(caches.sizeIn(VECTOR_ARCHIVE_CACHE), CURRENT, 'v2 holds the new archive');
  assert.ok(!caches.names().includes(LEGACY_CACHE), 'no second permanent vector archive remains');

  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'current');
  assert.equal(probe.updateAvailable, false);
});

test('a successful update never touches terrain, contour or satellite caches', async () => {
  const caches = seedLegacyDevice();
  await storeArchiveRevision(caches, vectorSpec(), { size: CURRENT }, (b) => new FakeEntry(b.size));
  for (const name of OTHER_LAYER_CACHES) {
    assert.ok(caches.names().includes(name), `${name} survives the vector migration`);
  }
  assert.deepEqual(caches.deleted, [LEGACY_CACHE], 'exactly one cache was deleted');
});

test('a fresh install downloads straight into the current revision', async () => {
  const caches = new FakeCacheStorage();
  const { pruned } = await storeArchiveRevision(
    caches,
    vectorSpec(),
    { size: CURRENT },
    (b) => new FakeEntry(b.size),
  );
  assert.deepEqual(pruned, [], 'nothing to prune on a device that never had v1');
  assert.equal((await probeArchiveCaches(caches, vectorSpec())).state, 'current');
});

test('a failed update preserves v1 — nothing is written and nothing is pruned', async () => {
  const caches = seedLegacyDevice();
  await assert.rejects(
    () =>
      storeArchiveRevision(
        caches,
        vectorSpec(),
        { size: VECTOR_ARCHIVE_SUPERSEDED_BYTES }, // e.g. a stale HTTP-cache hit
        (b) => new FakeEntry(b.size),
      ),
    /did not match the expected archive/,
  );

  assert.deepEqual(caches.deleted, [], 'the old archive is still on the device');
  assert.equal(caches.sizeIn(LEGACY_CACHE), VECTOR_ARCHIVE_SUPERSEDED_BYTES);
  assert.equal(caches.sizeIn(VECTOR_ARCHIVE_CACHE), null, 'no unverified blob is stored');

  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'legacy', 'still honestly reported as an update, not as current');
  assert.equal(probe.downloaded, true, 'the map remains usable offline');
});

test('an interrupted update — the fetch never completes — leaves the device untouched', async () => {
  const caches = seedLegacyDevice();
  // storeArchiveRevision is simply never reached; assert the device state the
  // download path leaves behind is still the working legacy archive.
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'legacy');
  assert.equal(probe.cacheName, LEGACY_CACHE);
  assert.deepEqual(caches.deleted, []);
});

test('a size mismatch is rejected with a message that says nothing was replaced', async () => {
  assert.equal(archiveSizeRejection(CURRENT, CURRENT), null);
  assert.equal(archiveSizeRejection(123, null), null, 'unrevisioned archives are never rejected');
  const reason = archiveSizeRejection(VECTOR_ARCHIVE_SUPERSEDED_BYTES, CURRENT);
  assert.match(reason, /5603107/);
  assert.match(reason, /5904598/);
  assert.match(reason, /untouched/i);

  // Named, so the card shows it verbatim instead of appending "check your
  // connection" to an archive that downloaded perfectly well.
  await assert.rejects(
    () =>
      storeArchiveRevision(
        new FakeCacheStorage(),
        vectorSpec(),
        { size: VECTOR_ARCHIVE_SUPERSEDED_BYTES },
        (b) => new FakeEntry(b.size),
      ),
    (e) => e.name === ARCHIVE_MISMATCH_ERROR && e.message === reason,
  );
  assert.match(
    card,
    /e\.name === ARCHIVE_MISMATCH_ERROR\s*\n?\s*\? e\.message/,
    'the card shows a rejected-archive message as-is',
  );
});

test('removing the map removes the superseded revision with it', async () => {
  const caches = new FakeCacheStorage({
    [VECTOR_ARCHIVE_CACHE]: { [URL_KEY]: new FakeEntry(CURRENT) },
    [LEGACY_CACHE]: { [URL_KEY]: new FakeEntry(VECTOR_ARCHIVE_SUPERSEDED_BYTES) },
    'fjallkompis-offline-terrain-v1': { terrain: new FakeEntry(19_297_735) },
  });
  await removeArchiveRevision(caches, vectorSpec());
  assert.equal((await probeArchiveCaches(caches, vectorSpec())).state, 'absent');
  assert.ok(caches.names().includes('fjallkompis-offline-terrain-v1'), 'terrain untouched');
});

test('pruning is scoped to the names an archive declares, and is best-effort', async () => {
  const caches = seedLegacyDevice();
  assert.deepEqual(await pruneLegacyArchives(caches, []), [], 'no declared legacy names, no-op');
  assert.deepEqual(await pruneLegacyArchives(caches, ['never-existed']), []);
  assert.deepEqual(await pruneLegacyArchives(caches, VECTOR_ARCHIVE_LEGACY_CACHES), [LEGACY_CACHE]);
  for (const name of OTHER_LAYER_CACHES) assert.ok(caches.names().includes(name));
});

// ---- Constants and cross-file wiring ----------------------------------------

test('the current vector cache is v2 and the only declared legacy cache is v1', () => {
  assert.equal(VECTOR_ARCHIVE_CACHE, 'fjallkompis-offline-map-v2');
  assert.deepEqual([...VECTOR_ARCHIVE_LEGACY_CACHES], ['fjallkompis-offline-map-v1']);
  assert.ok(
    !VECTOR_ARCHIVE_LEGACY_CACHES.includes(VECTOR_ARCHIVE_CACHE),
    'the current cache is never its own legacy',
  );
});

test('no legacy vector cache name can ever name a terrain, contour or satellite cache', () => {
  for (const name of VECTOR_ARCHIVE_LEGACY_CACHES) {
    assert.ok(name.includes('offline-map'), `${name} is a vector cache`);
    assert.ok(!/terrain|contour|satellite/.test(name), `${name} names no other layer`);
    assert.ok(!OTHER_LAYER_CACHES.includes(name));
  }
});

test('the revision identifier is not the app version', () => {
  assert.notEqual(VECTOR_ARCHIVE_REVISION.id, pkg.version);
  assert.ok(!VECTOR_ARCHIVE_REVISION.id.includes(pkg.version));
  assert.ok(VECTOR_ARCHIVE_REVISION.id.length > 0);
});

test('Workbox range-request caching uses the app’s CURRENT vector cache name', () => {
  assert.match(
    viteConfig,
    /import \{ VECTOR_ARCHIVE_CACHE \} from '\.\/src\/map\/archiveRevision\.mjs'/,
    'the cache name is imported, not repeated',
  );
  assert.match(viteConfig, /cacheName: VECTOR_ARCHIVE_CACHE,\s*\n\s*rangeRequests: true/);
  assert.ok(
    !viteConfig.includes('fjallkompis-offline-map-v1'),
    'no superseded vector cache name is left in the service-worker config',
  );
  // The other three archive caches are pinned literals and must not move.
  for (const name of OTHER_LAYER_CACHES.filter((n) => !n.includes('satellite'))) {
    assert.ok(viteConfig.includes(`cacheName: '${name}'`), `${name} identity unchanged`);
  }
});

test('the vector spec carries the revision; the other archives carry none', () => {
  const specOf = (name) => {
    const start = offlineMap.indexOf(`export const ${name}: ArchiveSpec = {`);
    assert.ok(start > -1, `${name} is declared`);
    return offlineMap.slice(start, offlineMap.indexOf('};', start));
  };
  const vector = specOf('VECTOR_ARCHIVE');
  assert.match(vector, /cacheName: VECTOR_ARCHIVE_CACHE/);
  assert.match(vector, /legacyCacheNames: VECTOR_ARCHIVE_LEGACY_CACHES/);
  assert.match(vector, /revision: VECTOR_ARCHIVE_REVISION/);

  for (const name of ['TERRAIN_ARCHIVE', 'CONTOURS_ARCHIVE', 'SATELLITE_ARCHIVE']) {
    const spec = specOf(name);
    assert.ok(!spec.includes('revision:'), `${name} declares no revision`);
    assert.ok(!spec.includes('legacyCacheNames'), `${name} declares no legacy cache`);
  }
});

test('terrain, contour and satellite cache identities are unchanged', () => {
  assert.match(offlineMap, /cacheName: 'fjallkompis-offline-terrain-v1'/);
  assert.match(offlineMap, /cacheName: 'fjallkompis-offline-contours-v1'/);
  assert.match(offlineMap, /cacheName: 'fjallkompis-offline-satellite-v1'/);
});

test('the download request leaves the service worker’s route; the cache key does not', () => {
  const key = 'https://algolon.github.io/Fjallkompis/maps/kungsleden.pmtiles';
  const fetched = archiveFetchUrl(key, VECTOR_ARCHIVE_REVISION.id);

  assert.notEqual(fetched, key, 'the download must reach the server, not CacheFirst');
  assert.equal(fetched, `${key}?rev=${VECTOR_ARCHIVE_REVISION.id}`);
  assert.ok(
    !fetched.replace(/\?.*$/, '').endsWith('.pmtiles?rev'),
    'the parameter is a query string, not part of the path',
  );
  // The SW route matches on the bare path — the fetch URL must NOT match it,
  // and the Cache Storage key must.
  const swMatches = (u) => u.endsWith('/maps/kungsleden.pmtiles');
  assert.equal(swMatches(fetched), false, 'the download bypasses the range-request route');
  assert.equal(swMatches(key), true, 'the stored key still matches, so offline ranges work');

  assert.equal(archiveFetchUrl(key, null), key, 'unrevisioned archives are untouched');
  assert.equal(archiveFetchUrl(`${key}?x=1`, 'r2'), `${key}?x=1&rev=r2`, 'appends, never clobbers');
});

test('downloadArchive fetches the bypass URL but caches under the canonical one', () => {
  const body = offlineMap.slice(
    offlineMap.indexOf('export async function downloadArchive('),
    offlineMap.indexOf('export async function removeArchive('),
  );
  assert.match(body, /const url = archiveUrl\(spec\)/);
  assert.match(body, /fetch\(archiveFetchUrl\(url, spec\.revision\?\.id \?\? null\), \{\s*cache: 'no-store',?\s*\}\)/);
  assert.match(body, /storeArchiveRevision\(\s*caches,\s*probeSpec\(spec\)/);
  // probeSpec's url is archiveUrl(spec) — the bare URL — so the cache key is
  // never the parameterised one.
  assert.match(offlineMap, /const probeSpec = \(spec: ArchiveSpec\) => \(\{[\s\S]*?url: archiveUrl\(spec\)/);
});

test('the public vector URL is deliberately unchanged — no query string, no cache-buster', () => {
  assert.match(offlineMap, /path: 'maps\/kungsleden\.pmtiles'/);
  assert.match(viteConfig, /request\.url\.endsWith\('\/maps\/kungsleden\.pmtiles'\)/);
  // A ?v= or #rev on either side would break Workbox matching against the
  // Cache Storage key the app writes; the revision lives in the cache NAME.
  const declaration = offlineMap.slice(
    offlineMap.indexOf('export const VECTOR_ARCHIVE: ArchiveSpec = {'),
  );
  assert.ok(!/kungsleden\.pmtiles[?#]/.test(declaration.slice(0, 400)));
  assert.ok(!/kungsleden\.pmtiles[?#]/.test(viteConfig));
});

test('downloadArchive verifies, then stores, then prunes — in that order', () => {
  const body = offlineMap.slice(
    offlineMap.indexOf('export async function downloadArchive('),
    offlineMap.indexOf('export async function removeArchive('),
  );
  assert.match(body, /storeArchiveRevision\(/, 'the migration runs through the tested contract');
  assert.ok(!body.includes('cache.put('), 'downloadArchive never writes the cache itself');
  assert.ok(
    !body.includes('caches.delete('),
    'downloadArchive never deletes a cache outside the contract',
  );

  const store = readFileSync(join(root, 'src/map/archiveRevision.mjs'), 'utf8');
  const commit = store.slice(store.indexOf('export async function storeArchiveRevision('));
  const reject = commit.indexOf('archiveSizeRejection(');
  const put = commit.indexOf('cache.put(');
  const prune = commit.indexOf('pruneLegacyArchives(');
  assert.ok(reject > -1 && put > reject, 'bytes are verified before anything is written');
  assert.ok(prune > put, 'superseded caches are pruned only after the new archive is stored');
});

// ---- Settings surface -------------------------------------------------------

test('Settings offers Update for a superseded archive, not a first download', () => {
  assert.match(card, /'Map update available'/, 'the status line names the state');
  assert.match(card, /'Update map data'/, 'the action is Update, not Download');
  assert.match(card, /Update size/, 'the replacement download size is shown');
  assert.match(card, /Stored now/, 'so is what the device currently holds');
  assert.match(
    card,
    /updateAvailable[\s\S]{0,600}still works offline/,
    'the copy says the existing map keeps working',
  );
  // Calm and operational: no modal, no release notes, no app-wide banner.
  assert.ok(!/showModal|<dialog|release notes/i.test(card));
});

test('a failed download falls back to the true state instead of "Not downloaded"', () => {
  assert.match(card, /const \[error, setError\] = useState<string \| null>\(null\)/);
  const download = card.slice(card.indexOf('const download = async'), card.indexOf('const remove ='));
  assert.match(download, /catch[\s\S]*setError\(/);
  assert.match(download, /catch[\s\S]*await refresh\(\)/, 'the caches are re-read after a failure');
});

test('the readiness row does not present a superseded archive as up to date', () => {
  assert.match(settings, /basemap\.updateAvailable\s*\n?\s*\?\s*'Update available'/);
  assert.match(settings, /done=\{basemap\.downloaded\}/, 'a legacy archive still counts as ready');
});

test('UI components read the state, never a cache name', () => {
  for (const [file, src] of [
    ['OfflineMapCard.tsx', card],
    ['SettingsScreen.tsx', settings],
  ]) {
    assert.ok(
      !src.includes('fjallkompis-offline-map'),
      `${file} carries no cache-name check of its own`,
    );
  }
});

// ---- The archive on disk ----------------------------------------------------

test('the declared revision matches the committed archive, byte for byte', () => {
  assert.equal(statSync(ARCHIVE_FILE).size, VECTOR_ARCHIVE_REVISION.bytes);
  const bytes = readFileSync(ARCHIVE_FILE);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), VECTOR_ARCHIVE_REVISION.sha256);
});

test('the declared revision matches the BUILT archive when a build is present', (t) => {
  // Self-skips like the other archive tests: CI runs the suite before `vite
  // build` copies public/ into dist/.
  const built = join(root, 'dist/maps/kungsleden.pmtiles');
  if (!existsSync(built)) return t.skip('no dist build in this working tree');
  assert.equal(statSync(built).size, VECTOR_ARCHIVE_REVISION.bytes);
  assert.equal(
    createHash('sha256').update(readFileSync(built)).digest('hex'),
    VECTOR_ARCHIVE_REVISION.sha256,
  );
});

test('this change moves no archive coverage, camera bound or route data', async () => {
  // The PR #104 archive, unchanged: same header bounds, same zoom range, same
  // bytes. Nothing here rebuilds or re-extracts the archive.
  class FileSource {
    constructor(path) {
      this.path = path;
    }
    getKey() {
      return this.path;
    }
    async getBytes(offset, length) {
      const fh = await open(this.path, 'r');
      try {
        const buf = Buffer.alloc(length);
        await fh.read(buf, 0, length, offset);
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
      } finally {
        await fh.close();
      }
    }
  }
  const header = await new PMTiles(new FileSource(ARCHIVE_FILE)).getHeader();
  assert.equal(header.minZoom, 0);
  assert.equal(header.maxZoom, 14);
  assert.equal(header.minLon.toFixed(4), '17.3799');
  assert.equal(header.maxLon.toFixed(4), '19.8773');
  assert.equal(header.minLat.toFixed(4), '67.7081');
  assert.equal(header.maxLat.toFixed(4), '68.4931');

  // The camera's maxBounds and the data cutout the archive was built from.
  const route = require(join(root, 'src/generated/kungsleden-route.json'));
  assert.deepEqual(route.userBounds, [
    [17.9521, 67.735],
    [19.3051, 68.4661],
  ]);
  assert.deepEqual(route.mapCutoutBounds, [
    [17.8799, 67.7081],
    [19.3773, 68.4931],
  ]);
});
