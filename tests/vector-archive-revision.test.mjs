/**
 * Vector-archive REVISION contract (src/map/archiveRevision.mjs).
 *
 * The defect these fence: the vector basemap keeps a stable public URL across
 * rebuilds, and status detection used to be existence-only — so a device that
 * downloaded the archive before the 2026-08 overview-corridor rebuild
 * (PR #104) kept serving the superseded 5,603,107-byte file indefinitely,
 * while Settings reported it as downloaded.
 *
 * Four states must stay distinguishable — current, legacy (a shipped older
 * revision, usable), invalid (bytes that exist but must never reach PMTiles)
 * and absent — and the migration must never cost a hiker their working offline
 * map: verify, then store, then prune, in that order.
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
import { MAP_ASSETS, MAP_ASSET_IDS, mapAssetPath } from '../src/map/mapCatalog.mjs';

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

test('a wrong-size entry in the CURRENT cache is INVALID, not a usable legacy map', () => {
  // A truncated write or a blob seeded by hand. Nothing vouches for these
  // bytes — a legacy archive is a revision we shipped, this is not — so it is
  // never handed to PMTiles and never counted as downloaded.
  const c = classifyArchiveProbe({ currentBytes: 1234, expectedBytes: CURRENT });
  assert.equal(c.state, 'invalid');
  assert.equal(c.source, null, 'nothing safe to read');
  assert.equal(c.downloaded, false, 'unusable data is not a downloaded map');
  assert.equal(c.updateAvailable, false, 'this is a repair, not an update');
  assert.equal(c.needsRepair, true);
  assert.equal(c.sizeBytes, 1234, 'what is stored is still reported');
  assert.equal(c.expectedBytes, CURRENT, 'against what is needed');
});

test('an invalid current entry never wins over a real legacy archive', () => {
  const c = classifyArchiveProbe({
    currentBytes: 1234,
    legacyBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES,
    expectedBytes: CURRENT,
  });
  assert.equal(c.state, 'legacy', 'the shipped revision is the working map');
  assert.equal(c.source, 'legacy', 'the invalid blob is never the read target');
  assert.equal(c.sizeBytes, VECTOR_ARCHIVE_SUPERSEDED_BYTES);
  assert.equal(c.downloaded, true);
  assert.equal(c.updateAvailable, true, 'and the replacement is still offered');
  assert.equal(c.needsRepair, false);
});

test('REGRESSION: a 5,603,107-byte response can never be the PR #104 archive', () => {
  assert.equal(VECTOR_ARCHIVE_SUPERSEDED_BYTES, 5_603_107);
  assert.notEqual(VECTOR_ARCHIVE_REVISION.bytes, VECTOR_ARCHIVE_SUPERSEDED_BYTES);
  for (const [probe, expected] of [
    // In the DECLARED legacy cache it is the archive we shipped: usable.
    [{ legacyBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES }, 'legacy'],
    [
      { currentBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES, legacyBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES },
      'legacy',
    ],
    // In the CURRENT cache it is just the wrong size: unusable.
    [{ currentBytes: VECTOR_ARCHIVE_SUPERSEDED_BYTES }, 'invalid'],
  ]) {
    const c = classifyArchiveProbe({ ...probe, expectedBytes: CURRENT });
    assert.notEqual(c.state, 'current', `${JSON.stringify(probe)} must not read as current`);
    assert.equal(c.state, expected, JSON.stringify(probe));
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

// ---- Unusable data in the current cache -------------------------------------

test('a wrong-size v2 entry alone: not downloaded, not current, NO cache to read', async () => {
  const caches = new FakeCacheStorage({
    [VECTOR_ARCHIVE_CACHE]: { [URL_KEY]: new FakeEntry(1234) },
  });
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'invalid');
  assert.equal(probe.downloaded, false);
  assert.equal(probe.needsRepair, true);
  assert.equal(
    probe.cacheName,
    null,
    'a null cache name is what makes getArchiveBlob return null, so the map never opens it',
  );
  assert.equal(probe.sizeBytes, 1234);
});

test('a wrong-size v2 entry alongside a valid v1: v1 is the one that gets used', async () => {
  const caches = seedLegacyDevice();
  await (await caches.open(VECTOR_ARCHIVE_CACHE)).put(URL_KEY, new FakeEntry(1234));
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'legacy');
  assert.equal(probe.cacheName, LEGACY_CACHE, 'reads v1, never the 1,234-byte v2 entry');
  assert.equal(probe.sizeBytes, VECTOR_ARCHIVE_SUPERSEDED_BYTES);
  assert.equal(probe.downloaded, true);
  assert.equal(probe.updateAvailable, true);
  assert.equal(probe.needsRepair, false);
});

test('an exact-size v2 wins over both a legacy archive and its own history', async () => {
  const caches = seedLegacyDevice();
  await (await caches.open(VECTOR_ARCHIVE_CACHE)).put(URL_KEY, new FakeEntry(CURRENT));
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'current');
  assert.equal(probe.cacheName, VECTOR_ARCHIVE_CACHE);
  assert.equal(probe.sizeBytes, CURRENT);
});

test('repairing an invalid archive overwrites it and clears the legacy cache', async () => {
  const caches = seedLegacyDevice();
  await (await caches.open(VECTOR_ARCHIVE_CACHE)).put(URL_KEY, new FakeEntry(1234));

  const { bytes, pruned } = await storeArchiveRevision(
    caches,
    vectorSpec(),
    { size: CURRENT },
    (b) => new FakeEntry(b.size),
  );
  assert.equal(bytes, CURRENT);
  assert.deepEqual(pruned, [LEGACY_CACHE]);
  assert.equal(caches.sizeIn(VECTOR_ARCHIVE_CACHE), CURRENT, 'the bad entry is replaced');
  assert.ok(!caches.names().includes(LEGACY_CACHE));

  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'current');
  assert.equal(probe.needsRepair, false);
  for (const name of OTHER_LAYER_CACHES) assert.ok(caches.names().includes(name));
});

test('a failed repair keeps the valid v1 fallback and never promotes the bad bytes', async () => {
  const caches = seedLegacyDevice();
  await (await caches.open(VECTOR_ARCHIVE_CACHE)).put(URL_KEY, new FakeEntry(1234));

  await assert.rejects(
    () =>
      storeArchiveRevision(
        caches,
        vectorSpec(),
        { size: VECTOR_ARCHIVE_SUPERSEDED_BYTES },
        (b) => new FakeEntry(b.size),
      ),
    /did not match the expected archive/,
  );

  assert.deepEqual(caches.deleted, [], 'the fallback is untouched');
  assert.equal(caches.sizeIn(LEGACY_CACHE), VECTOR_ARCHIVE_SUPERSEDED_BYTES);
  assert.equal(caches.sizeIn(VECTOR_ARCHIVE_CACHE), 1234, 'the bad entry is not overwritten either');

  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'legacy', 'still the working legacy map, never "current"');
  assert.equal(probe.cacheName, LEGACY_CACHE);
});

test('a failed repair with NO fallback stays invalid rather than looking current', async () => {
  const caches = new FakeCacheStorage({
    [VECTOR_ARCHIVE_CACHE]: { [URL_KEY]: new FakeEntry(1234) },
  });
  await assert.rejects(
    () => storeArchiveRevision(caches, vectorSpec(), { size: 999 }, (b) => new FakeEntry(b.size)),
    /did not match the expected archive/,
  );
  const probe = await probeArchiveCaches(caches, vectorSpec());
  assert.equal(probe.state, 'invalid');
  assert.equal(probe.downloaded, false);
  assert.equal(probe.cacheName, null);
  assert.equal(caches.sizeIn(VECTOR_ARCHIVE_CACHE), 1234, 'unchanged');
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

test('removing a CURRENT install leaves neither cache in the inventory', async () => {
  const caches = new FakeCacheStorage({
    [VECTOR_ARCHIVE_CACHE]: { [URL_KEY]: new FakeEntry(CURRENT) },
    [LEGACY_CACHE]: { [URL_KEY]: new FakeEntry(VECTOR_ARCHIVE_SUPERSEDED_BYTES) },
    'fjallkompis-offline-terrain-v1': { terrain: new FakeEntry(19_297_735) },
  });
  const deleted = await removeArchiveRevision(caches, vectorSpec());

  assert.deepEqual(deleted.sort(), [LEGACY_CACHE, VECTOR_ARCHIVE_CACHE].sort());
  assert.deepEqual(
    caches.names(),
    ['fjallkompis-offline-terrain-v1'],
    'the vector caches are gone from the inventory, not merely emptied',
  );
  assert.equal((await probeArchiveCaches(caches, vectorSpec())).state, 'absent');
});

test('removing a LEGACY-ONLY install never conjures an empty current cache', async () => {
  // The regression: remove used to open() the current cache unconditionally,
  // which CREATES it — so removing a pre-PR #104 map left an empty
  // fjallkompis-offline-map-v2 behind.
  const caches = seedLegacyDevice();
  const deleted = await removeArchiveRevision(caches, vectorSpec());

  assert.deepEqual(deleted, [LEGACY_CACHE], 'only the cache that existed was deleted');
  assert.deepEqual(
    caches.names(),
    [...OTHER_LAYER_CACHES].sort(),
    'no v1, and no empty v2 — only the other three layers remain',
  );
  assert.ok(!caches.names().includes(VECTOR_ARCHIVE_CACHE));
  assert.equal((await probeArchiveCaches(caches, vectorSpec())).state, 'absent');
});

test('removing an INVALID install clears the unusable bytes and adds no cache', async () => {
  const caches = new FakeCacheStorage({
    [VECTOR_ARCHIVE_CACHE]: { [URL_KEY]: new FakeEntry(1234) },
    'fjallkompis-offline-terrain-v1': { terrain: new FakeEntry(19_297_735) },
  });
  const deleted = await removeArchiveRevision(caches, vectorSpec());

  assert.deepEqual(deleted, [VECTOR_ARCHIVE_CACHE]);
  assert.deepEqual(caches.names(), ['fjallkompis-offline-terrain-v1']);
  assert.equal((await probeArchiveCaches(caches, vectorSpec())).state, 'absent');
});

test('removing an archive that is not there changes the inventory not at all', async () => {
  const caches = new FakeCacheStorage({
    'fjallkompis-offline-terrain-v1': { terrain: new FakeEntry(19_297_735) },
  });
  assert.deepEqual(await removeArchiveRevision(caches, vectorSpec()), []);
  assert.deepEqual(caches.names(), ['fjallkompis-offline-terrain-v1']);
});

test('removing the vector archive never touches another layer’s cache', async () => {
  const caches = seedLegacyDevice();
  await (await caches.open(VECTOR_ARCHIVE_CACHE)).put(URL_KEY, new FakeEntry(CURRENT));
  await removeArchiveRevision(caches, vectorSpec());
  assert.deepEqual(caches.deleted.sort(), [LEGACY_CACHE, VECTOR_ARCHIVE_CACHE].sort());
  for (const name of OTHER_LAYER_CACHES) {
    assert.ok(caches.names().includes(name), `${name} survives`);
    assert.ok(!caches.deleted.includes(name), `${name} was never even asked to delete`);
  }
});

test('removing an unrevisioned archive deletes only its own dedicated cache', async () => {
  const caches = seedLegacyDevice();
  const deleted = await removeArchiveRevision(caches, {
    cacheName: 'fjallkompis-offline-terrain-v1',
    url: 'https://sentinel.test/fjallkompis-offline-terrain-v1',
  });
  assert.deepEqual(deleted, ['fjallkompis-offline-terrain-v1']);
  assert.ok(caches.names().includes(LEGACY_CACHE), 'the vector archive is untouched');
  assert.ok(caches.names().includes('fjallkompis-offline-contours-v1'));
  assert.ok(caches.names().includes('fjallkompis-offline-satellite-v1'));
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

test('Workbox range-request caching uses the app’s CURRENT cache names', () => {
  // The names are no longer written here at all — neither imported one by one
  // nor typed out. Every route derives its cache from the catalog entry, which
  // is what makes drift between the worker and the app impossible rather than
  // merely discouraged.
  assert.match(
    viteConfig,
    /from '\.\/src\/map\/mapCatalog\.mjs'/,
    'archive identities are imported from the catalog',
  );
  assert.match(viteConfig, /cacheName: asset\.cacheName,\s*\n\s*rangeRequests: true/);
  assert.ok(
    !viteConfig.includes('fjallkompis-offline-map-v1'),
    'no superseded vector cache name is left in the service-worker config',
  );
  // No archive cache name may be a literal in the worker config at all.
  for (const name of [VECTOR_ARCHIVE_CACHE, ...OTHER_LAYER_CACHES]) {
    assert.ok(!viteConfig.includes(`'${name}'`), `${name} is derived, not repeated`);
  }
  // Satellite stays OUT of the worker: it is read from its own blob, and a
  // route here would pull ~59 MB through the SW on the first online preview.
  assert.match(viteConfig, /\(\['vector', 'terrain', 'contours'\] as const\)/);
});

test('every spec derives its identity from the catalog, and only vector has a legacy cache', () => {
  // The specs are built by one helper now, so "did someone hand-edit one
  // archive's cache name" is answered by there being nothing to hand-edit.
  assert.match(offlineMap, /function specFor\(id: string, resolveUrl\?: \(\) => string\): ArchiveSpec/);
  assert.match(offlineMap, /cacheName: asset\.cacheName/);
  assert.match(offlineMap, /revision: asset\.revision/);
  assert.match(offlineMap, /legacyCacheNames: asset\.legacyCacheNames/);
  for (const name of ['VECTOR', 'TERRAIN', 'CONTOURS', 'SATELLITE']) {
    assert.match(offlineMap, new RegExp(`export const ${name}_ARCHIVE: ArchiveSpec = specFor\\(`));
  }

  // Every archive now carries a revision — that is the point of the catalog.
  for (const id of MAP_ASSET_IDS) {
    assert.ok(MAP_ASSETS[id].revision.bytes > 0, `${id} pins a byte length`);
    assert.match(MAP_ASSETS[id].revision.sha256, /^[0-9a-f]{64}$/, `${id} pins a digest`);
  }
  // But only the vector archive separates revisions by CACHE NAME, which is
  // what licenses it to treat superseded bytes in the current cache as
  // untrustworthy while the others read them as a usable older revision.
  assert.deepEqual([...MAP_ASSETS.vector.supersededBytes], []);
  for (const id of ['terrain', 'contours', 'satellite']) {
    assert.deepEqual([...MAP_ASSETS[id].legacyCacheNames], [], `${id} declares no legacy cache`);
    assert.ok(MAP_ASSETS[id].supersededBytes.length > 0, `${id} names its shipped older sizes`);
  }
});

test('terrain, contour and satellite cache identities are unchanged', () => {
  // Renaming any of these would orphan every existing PWA download and offer
  // a pointless multi-megabyte re-download to users whose bytes are correct.
  assert.equal(MAP_ASSETS.terrain.cacheName, 'fjallkompis-offline-terrain-v1');
  assert.equal(MAP_ASSETS.contours.cacheName, 'fjallkompis-offline-contours-v1');
  assert.equal(MAP_ASSETS.satellite.cacheName, 'fjallkompis-offline-satellite-v1');
  assert.equal(MAP_ASSETS.vector.cacheName, 'fjallkompis-offline-map-v2');
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
  assert.match(body, /fetch\(archiveFetchUrl\(url, spec\.revision\.id\), \{\s*cache: 'no-store',?\s*\}\)/);
  assert.match(body, /storeArchiveRevision\(\s*caches,\s*probeSpec\(spec\)/);
  // probeSpec's url is archiveUrl(spec) — the bare URL — so the cache key is
  // never the parameterised one.
  assert.match(offlineMap, /const probeSpec = \(spec: ArchiveSpec\) => \(\{[\s\S]*?url: archiveUrl\(spec\)/);
});

test('the public vector URL is deliberately unchanged — no query string, no cache-buster', () => {
  assert.equal(MAP_ASSETS.vector.file, 'kungsleden.pmtiles');
  assert.equal(mapAssetPath(MAP_ASSETS.vector), 'maps/kungsleden.pmtiles');
  // The worker route is built from that same path, so the URL it matches and
  // the Cache Storage key the app writes are one derivation, not two strings.
  assert.match(viteConfig, /const suffix = `\/\$\{mapAssetPath\(asset\)\}`/);
  assert.match(viteConfig, /request\.url\.endsWith\(suffix\)/);
  // A ?v= or #rev on either side would break Workbox matching against the
  // Cache Storage key the app writes; the revision lives in the cache NAME.
  for (const id of MAP_ASSET_IDS) {
    assert.ok(!/[?#]/.test(MAP_ASSETS[id].file), `${id} filename carries no query or fragment`);
  }
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

test('Settings offers repair for unusable data, and never calls it a working map', () => {
  assert.match(card, /needsRepair/, 'the card branches on the repair state');
  assert.match(card, /needs repair`/, 'the status line says so');
  assert.match(
    card,
    /Download map data again/,
    'the action is a re-download, not "Download for offline use"',
  );
  assert.match(card, /Expected size/, 'stored vs expected sizes are both shown');
  assert.match(
    card,
    /needsRepair \?[\s\S]{0,600}not being used/,
    'the copy states the stored data is not in use',
  );
  // Both ternaries must test the repair state BEFORE the downloaded/update
  // ones, or unusable data falls through to "✓ Stored on this device".
  const statusLine = card.slice(
    card.indexOf("{phase.kind === 'downloading'"),
    card.indexOf("'Not downloaded'"),
  );
  assert.ok(
    statusLine.indexOf('needsRepair') < statusLine.indexOf('updateAvailable'),
    'the status line checks repair before update',
  );
  assert.ok(
    statusLine.indexOf('needsRepair') < statusLine.indexOf('Stored on this device'),
    'the status line checks repair before "stored"',
  );

  const actions = card.slice(card.indexOf('{needsRepair ? ('));
  assert.ok(actions.startsWith('{needsRepair ? ('), 'the action block opens on the repair branch');
  assert.ok(
    actions.indexOf(') : downloaded ? (') > 0,
    'and only then falls through to the downloaded branch',
  );
});

test('the combined card state treats any unusable archive as unusable', () => {
  const combine = card.slice(card.indexOf('function combineStatuses'), card.indexOf('function ArchiveCard'));
  assert.match(combine, /some\(\(s\) => s\.state === 'invalid'\)\s*\n?\s*\?\s*'invalid'/);
  assert.match(combine, /downloaded = statuses\.every\(\(s\) => s\.downloaded\)/);
  assert.match(combine, /needsRepair: state === 'invalid'/);
});

test('a failed download falls back to the true state instead of "Not downloaded"', () => {
  assert.match(card, /const \[error, setError\] = useState<string \| null>\(null\)/);
  const download = card.slice(card.indexOf('const download = async'), card.indexOf('const remove ='));
  assert.match(download, /catch[\s\S]*setError\(/);
  assert.match(download, /catch[\s\S]*await refresh\(\)/, 'the caches are re-read after a failure');
});

// These two states used to be reported twice: once by the Offline maps card
// and once by a Trail readiness row that could contradict it (on Android the
// row rendered "Included in app" beside "Needs attention"). The readiness
// panel is gone; the card is the single surface, and it must still tell the
// truth about both states.

test('a superseded archive is not presented as up to date', () => {
  assert.match(card, /updateAvailable\s*\n?\s*\?\s*'Map update available'/);
  // …and the offer to act on it is the card's primary action.
  assert.match(card, /\{updateAvailable \? 'Update map data' : 'Re-download \/ update'\}/);
});

test('unusable data reports as needing repair, and not as stored', () => {
  assert.match(card, /needsRepair/);
  assert.match(card, /\$\{sourceHeading\} needs repair/);
  const status = card.slice(card.indexOf("<span className=\"muted\">Status</span>"));
  assert.ok(
    status.indexOf('needsRepair') < status.indexOf('updateAvailable'),
    'repair is checked before update, so unusable data never reads "Map update available"',
  );
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
