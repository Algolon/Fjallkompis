/**
 * Vector-archive REVISION contract and the Cache Storage lifecycle built on it.
 *
 * The problem this exists to solve: the vector basemap keeps a stable public
 * URL (`maps/kungsleden.pmtiles`) across rebuilds, so "is there a cached
 * response under that URL?" says nothing about WHICH archive a device holds.
 * Before this module, any cached response counted as downloaded, so a device
 * that fetched the archive before the 2026-08 overview-corridor rebuild kept
 * serving the superseded 5,603,107-byte file forever.
 *
 * The contract instead pins an archive revision to two things a browser can
 * check for free:
 *   - the Cache Storage cache NAME (a new revision gets a new cache);
 *   - the exact byte length of the archive (`bytes` below).
 * A cached response is the CURRENT revision only when it satisfies both.
 *
 * "Not current" then splits in two, and the difference matters:
 *   - LEGACY — a real archive in a DECLARED superseded cache. A revision we
 *     shipped, so it parses and renders: usable offline until the replacement
 *     downloads successfully.
 *   - INVALID — a wrong-size response in the current cache, with no legacy
 *     archive to fall back on. Nothing vouches for those bytes; they are
 *     truncated, damaged or hand-seeded. Handing them to PMTiles would crash
 *     the map, so they are never read, never counted as downloaded, and never
 *     described as a working map. Downloading again is the repair.
 *
 * A full client-side SHA-256 on every status check would cost a 5.9 MB read
 * for no extra safety in practice, so `sha256` here is recorded provenance
 * (checked against the committed file in tests), never computed at runtime.
 *
 * Everything is pure or takes its CacheStorage by argument, so
 * tests/vector-archive-revision.test.mjs drives the whole lifecycle against a
 * fake cache. src/map/offlineMap.ts is the browser adapter; vite.config.ts
 * imports the current cache name so Workbox's range-request cache and the app
 * can never name different caches.
 */

/** Cache Storage cache holding the CURRENT vector archive revision. */
export const VECTOR_ARCHIVE_CACHE = 'fjallkompis-offline-map-v2';

/**
 * Superseded vector caches, newest first. Entries here are read as an offline
 * FALLBACK and deleted only after the current revision has been stored
 * successfully. Vector caches only — never a terrain, contour or satellite
 * cache (fenced by tests).
 */
export const VECTOR_ARCHIVE_LEGACY_CACHES = Object.freeze([
  'fjallkompis-offline-map-v1',
]);

/**
 * The archive shipped by PR #104 (the widened z0–z9 overview corridor merged
 * with the unchanged z10–z14 cutout). `bytes` is the freshness proof; `id` and
 * `sha256` are provenance for evidence and review.
 */
export const VECTOR_ARCHIVE_REVISION = Object.freeze({
  id: 'kungsleden-vector-2026-08-overview-corridor',
  bytes: 5_904_598,
  sha256: '17d9894664aca247affa11d0a5b3e5763d0898a920f129d1f25f78a2e3fb1b51',
});

/**
 * The revision this replaced, kept so the regression test can name the exact
 * byte length that must never be reported as current.
 */
export const VECTOR_ARCHIVE_SUPERSEDED_BYTES = 5_603_107;

/** `Error.name` on a rejected download — the message is already user-facing. */
export const ARCHIVE_MISMATCH_ERROR = 'ArchiveRevisionMismatch';

/**
 * @typedef {'absent' | 'current' | 'legacy' | 'invalid'} ArchiveState
 *
 * @typedef {object} ArchiveClassification
 * @property {ArchiveState} state
 * @property {'current' | 'legacy' | null} source
 *   Which cache holds the blob the app may read, or null when there is nothing
 *   safe to read. `invalid` always resolves to null: the bytes exist but must
 *   never reach PMTiles.
 * @property {number | null} sizeBytes
 *   Bytes actually stored on this device — for `invalid`, the size of the
 *   unusable entry, so Settings can say what is there against what is needed.
 * @property {number | null} expectedBytes  Bytes the current revision needs.
 * @property {boolean} downloaded
 *   A USABLE archive is present (current or legacy). False for `invalid`.
 * @property {boolean} updateAvailable  state === 'legacy'.
 * @property {boolean} needsRepair  state === 'invalid'.
 */

/**
 * Classify what a device holds from the two cache probes. Pure — the whole
 * decision table lives here so it can be tested without a browser.
 *
 * With `expectedBytes` declared (the vector archive):
 *   1. current cache, size matches  → current
 *   2. otherwise a declared legacy cache hit → legacy — a revision we shipped,
 *      so it renders; used as the offline fallback even when the current cache
 *      also holds an unusable entry
 *   3. otherwise a wrong-size entry in the current cache → invalid — unusable,
 *      not downloaded, never read
 *   4. nothing → absent
 *
 * Without `expectedBytes` (terrain, contours, satellite — single-revision
 * archives that declare no legacy caches) this reduces to the existence-only
 * behaviour those archives have always had, and `invalid` cannot occur.
 *
 * @param {{ currentBytes?: number | null, legacyBytes?: number | null,
 *           expectedBytes?: number | null }} [probe]
 * @returns {ArchiveClassification}
 */
export function classifyArchiveProbe({
  currentBytes = null,
  legacyBytes = null,
  expectedBytes = null,
} = {}) {
  const settle = (state, source, sizeBytes) => ({
    state,
    source,
    sizeBytes,
    expectedBytes,
    downloaded: state === 'current' || state === 'legacy',
    updateAvailable: state === 'legacy',
    needsRepair: state === 'invalid',
  });

  if (expectedBytes == null) {
    if (currentBytes != null) return settle('current', 'current', currentBytes);
    if (legacyBytes != null) return settle('legacy', 'legacy', legacyBytes);
    return settle('absent', null, null);
  }

  if (currentBytes === expectedBytes) return settle('current', 'current', currentBytes);
  // A shipped legacy revision beats an unverifiable current-cache entry: it is
  // the only one of the two that is known to parse.
  if (legacyBytes != null) return settle('legacy', 'legacy', legacyBytes);
  if (currentBytes != null) return settle('invalid', null, currentBytes);
  return settle('absent', null, null);
}

/**
 * Byte length of a cached archive response, or null when it is absent. Reads
 * the BODY rather than trusting a Content-Length header: the header is
 * whatever wrote the entry (our download, or the service worker copying the
 * server's), and freshness must not rest on a claim the bytes can contradict.
 *
 * Asks has() before open() because open() CREATES a missing cache — a status
 * check must leave the device's cache inventory exactly as it found it, or
 * every probe would conjure an empty cache that reads like a stored archive.
 *
 * @param {object} cacheStorage
 * @param {string} cacheName
 * @param {string} url
 * @returns {Promise<number | null>}
 */
async function cachedBytes(cacheStorage, cacheName, url) {
  if (!(await cacheStorage.has(cacheName))) return null;
  const cache = await cacheStorage.open(cacheName);
  const match = await cache.match(url);
  if (!match) return null;
  const blob = await match.clone().blob();
  return blob.size;
}

/**
 * Probe the current cache and every declared legacy cache for one archive URL.
 * Legacy caches are consulted in declaration order and only opened when the
 * current cache misses, so the common (up-to-date) path costs exactly one
 * lookup — what it cost before this contract existed.
 *
 * @param {CacheStorage} cacheStorage
 * @param {{ cacheName: string, url: string,
 *           legacyCacheNames?: readonly string[], expectedBytes?: number | null }} spec
 * @returns {Promise<ArchiveClassification & { cacheName: string | null }>}
 *   `cacheName` names the cache holding the readable blob, or null.
 */
export async function probeArchiveCaches(
  cacheStorage,
  { cacheName, url, legacyCacheNames = [], expectedBytes = null },
) {
  const currentBytes = await cachedBytes(cacheStorage, cacheName, url);

  const haveCurrent =
    expectedBytes == null ? currentBytes != null : currentBytes === expectedBytes;

  let legacyBytes = null;
  let legacyCacheName = null;
  if (!haveCurrent) {
    for (const name of legacyCacheNames) {
      const bytes = await cachedBytes(cacheStorage, name, url);
      if (bytes != null) {
        legacyBytes = bytes;
        legacyCacheName = name;
        break;
      }
    }
  }

  const classification = classifyArchiveProbe({ currentBytes, legacyBytes, expectedBytes });
  return {
    ...classification,
    cacheName:
      classification.source === 'current'
        ? cacheName
        : classification.source === 'legacy'
          ? legacyCacheName
          : null,
  };
}

/**
 * Delete superseded vector caches. Called ONLY after the current revision has
 * been stored successfully, so a failed or cancelled update always leaves the
 * device with a working archive. Scoped strictly to the names the archive
 * itself declares, which is why terrain, contour and satellite caches can
 * never be reached from here.
 *
 * Best-effort: a cache that refuses to delete is reported, not thrown — the
 * download already succeeded, and the next successful update retries it.
 *
 * @param {CacheStorage} cacheStorage
 * @param {readonly string[]} [legacyCacheNames]
 * @returns {Promise<string[]>} the caches actually deleted
 */
export async function pruneLegacyArchives(cacheStorage, legacyCacheNames = []) {
  const deleted = [];
  for (const name of legacyCacheNames) {
    try {
      if (await cacheStorage.delete(name)) deleted.push(name);
    } catch {
      // Leaving a superseded cache in place is harmless; failing the
      // completed download over it would not be.
    }
  }
  return deleted;
}

/**
 * Guard run on a freshly downloaded archive BEFORE it is written. A revisioned
 * archive whose bytes disagree with the contract is rejected outright rather
 * than stored as a "current" copy nothing can verify — leaving whatever the
 * device already had untouched.
 *
 * @param {number} actualBytes
 * @param {number | null | undefined} expectedBytes
 * @returns {string | null} an operator-readable reason, or null when it passes
 */
export function archiveSizeRejection(actualBytes, expectedBytes) {
  if (expectedBytes == null || actualBytes === expectedBytes) return null;
  return (
    `Map download did not match the expected archive ` +
    `(got ${actualBytes} bytes, expected ${expectedBytes}). ` +
    `Nothing was replaced — your existing offline map is untouched.`
  );
}

/**
 * URL to FETCH a revisioned archive from — the canonical URL plus the revision
 * id as a query parameter.
 *
 * Measured, not theoretical: the service worker's CacheFirst route matches the
 * bare `/maps/kungsleden.pmtiles` path, so a plain download request is
 * answered from Cache Storage before it ever reaches the network — `cache:
 * 'no-store'` governs the HTTP cache and does not get past a service worker.
 * A download that cannot reach the server cannot replace a bad copy of the
 * current revision, which is precisely what an Update must always be able to
 * do. The parameter takes this one request out of that route.
 *
 * The Cache Storage KEY stays the bare URL. That is deliberate and load
 * bearing: Workbox's range-request route looks the archive up by the bare
 * path, so parameterising the stored key would silently break offline range
 * serving. Fetch URL and cache key are different things here, on purpose.
 *
 * Unrevisioned archives keep the plain URL and their existing behaviour.
 *
 * @param {string} url  canonical archive URL (also the Cache Storage key)
 * @param {string | null} [revisionId]
 * @returns {string}
 */
export function archiveFetchUrl(url, revisionId = null) {
  if (!revisionId) return url;
  return `${url}${url.includes('?') ? '&' : '?'}rev=${encodeURIComponent(revisionId)}`;
}

/**
 * Commit a freshly downloaded archive. THE migration step, and the only place
 * a superseded copy is allowed to disappear — in this order, always:
 *   1. reject bytes that fail the revision contract (nothing written);
 *   2. store the full response under the current revision's cache;
 *   3. only then prune the superseded caches.
 * Any failure before step 2 completes leaves the device with the archive it
 * already had, which is what keeps a cancelled or broken update harmless.
 *
 * The response is built by the caller so this module stays free of Response
 * and Blob — it only ever needs the byte count.
 *
 * @template {{ size: number }} TBlob
 * @param {object} cacheStorage
 * @param {{ cacheName: string, url: string, legacyCacheNames?: readonly string[],
 *           expectedBytes?: number | null }} spec
 * @param {TBlob} blob
 * @param {(blob: TBlob) => unknown} toResponse
 * @returns {Promise<{ bytes: number, pruned: string[] }>}
 */
export async function storeArchiveRevision(cacheStorage, spec, blob, toResponse) {
  const rejection = archiveSizeRejection(blob.size, spec.expectedBytes ?? null);
  if (rejection) {
    // Named so the UI can show this message as-is: the download arrived
    // intact, so "check your connection" would be wrong advice.
    const error = new Error(rejection);
    error.name = ARCHIVE_MISMATCH_ERROR;
    throw error;
  }

  const cache = await cacheStorage.open(spec.cacheName);
  await cache.put(spec.url, toResponse(blob));

  const pruned = await pruneLegacyArchives(cacheStorage, spec.legacyCacheNames ?? []);
  return { bytes: blob.size, pruned };
}

/**
 * Remove an archive from the device, superseded revisions included. Leaving a
 * legacy cache behind would leave the app offering to "update" a map the user
 * just deleted.
 *
 * Deletes the caches by NAME rather than deleting an entry inside them. Every
 * archive owns its cache outright — one archive, one cache, one full response
 * (see src/map/offlineMap.ts) — so the cache and its contents are the same
 * thing, and `caches.delete()` on a name that is not there is a no-op rather
 * than the cache-creating `open()` this used to call. Removing a legacy-only
 * install therefore leaves no empty current cache behind.
 *
 * @param {object} cacheStorage
 * @param {{ cacheName: string, legacyCacheNames?: readonly string[] }} spec
 * @returns {Promise<string[]>} every cache actually deleted
 */
export async function removeArchiveRevision(
  cacheStorage,
  { cacheName, legacyCacheNames = [] },
) {
  const deleted = [];
  try {
    if (await cacheStorage.delete(cacheName)) deleted.push(cacheName);
  } catch {
    // Same best-effort contract as the legacy prune below.
  }
  deleted.push(...(await pruneLegacyArchives(cacheStorage, legacyCacheNames)));
  return deleted;
}
