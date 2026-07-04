/**
 * Safety coverage for offline-asset downloads:
 *  - PMTiles header detection (pmtilesFormat.isPmtilesHeader);
 *  - downloadPmtiles must NEVER accept or store a non-PMTiles response
 *    (HTML SPA fallback, JSON error page, plain text, HTTP error);
 *  - a rejected download must leave the cache untouched (no corrupt entry,
 *    and any previously-downloaded valid copy is preserved);
 *  - the caller receives a clear, non-empty error it can surface + retry.
 *
 *   npm test  →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { isPmtilesHeader, PMTILES_MAGIC } from '../src/map/pmtilesFormat.mjs';
import { downloadPmtiles } from '../src/map/offlineDownload.mjs';

const URL = 'https://example.test/maps/kungsleden-satellite.pmtiles';
const CACHE = 'test-cache-v1';
const noop = () => {};

/** Bytes of a minimal, valid-looking PMTiles v3 archive. */
function pmtilesBytes(extra = 100) {
  const head = [...PMTILES_MAGIC].map((c) => c.charCodeAt(0));
  head.push(3); // spec version
  return new Uint8Array([...head, ...new Array(extra).fill(0)]);
}

function bytesOf(str) {
  return new TextEncoder().encode(str);
}

/** In-memory CacheStorage double. */
function makeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const s = stores.get(name);
      return {
        put: async (url, resp) => void s.set(url, resp),
        match: async (url) => s.get(url),
      };
    },
  };
}

function fetchReturning(body, { status = 200, contentType = 'application/octet-stream' } = {}) {
  return async () => new Response(body, { status, headers: { 'Content-Type': contentType } });
}

// ---- isPmtilesHeader --------------------------------------------------------

test('isPmtilesHeader accepts a valid v3 header and rejects everything else', () => {
  assert.equal(isPmtilesHeader(pmtilesBytes()), true);
  assert.equal(isPmtilesHeader(bytesOf('<!doctype html><html>...')), false);
  assert.equal(isPmtilesHeader(bytesOf('{"error":"Not Found"}')), false);
  assert.equal(isPmtilesHeader(bytesOf('PMTiles')), false); // 7 bytes, no version
  // magic present but wrong spec version:
  assert.equal(isPmtilesHeader(new Uint8Array([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73, 2])), false);
  assert.equal(isPmtilesHeader(null), false);
});

// ---- downloadPmtiles: happy path -------------------------------------------

test('downloadPmtiles stores a valid PMTiles response', async () => {
  const caches = makeCaches();
  const bytes = pmtilesBytes();
  const size = await downloadPmtiles(URL, CACHE, noop, {
    fetch: fetchReturning(bytes),
    caches,
  });
  assert.equal(size, bytes.length);
  const stored = await (await caches.open(CACHE)).match(URL);
  assert.ok(stored, 'entry was written');
  const head = new Uint8Array(await (await stored.blob()).slice(0, 8).arrayBuffer());
  assert.equal(isPmtilesHeader(head), true);
});

// ---- downloadPmtiles: invalid bodies are rejected AND not cached -----------

for (const [name, opts, body] of [
  ['HTML SPA fallback', { contentType: 'text/html' }, '<!doctype html><html><body>Fjällkompis</body></html>'],
  ['JSON error page', { contentType: 'application/json' }, '{"error":"Not Found"}'],
  ['plain text', { contentType: 'text/plain' }, 'not a tileset'],
]) {
  test(`downloadPmtiles rejects a ${name} and writes nothing`, async () => {
    const caches = makeCaches();
    await assert.rejects(
      downloadPmtiles(URL, CACHE, noop, { fetch: fetchReturning(body, opts), caches }),
      (err) => err instanceof Error && err.message.length > 0,
    );
    const stored = await (await caches.open(CACHE)).match(URL);
    assert.equal(stored, undefined, 'no corrupt entry left behind');
  });
}

test('downloadPmtiles rejects an HTTP error and writes nothing', async () => {
  const caches = makeCaches();
  await assert.rejects(
    downloadPmtiles(URL, CACHE, noop, { fetch: fetchReturning('nope', { status: 404 }), caches }),
    /HTTP 404/,
  );
  assert.equal(await (await caches.open(CACHE)).match(URL), undefined);
});

test('a failed re-download preserves the existing valid copy', async () => {
  const caches = makeCaches();
  // Seed a valid download.
  const good = pmtilesBytes(200);
  await downloadPmtiles(URL, CACHE, noop, { fetch: fetchReturning(good), caches });

  // A later re-download that returns an HTML fallback must not clobber it.
  await assert.rejects(
    downloadPmtiles(URL, CACHE, noop, {
      fetch: fetchReturning('<!doctype html>', { contentType: 'text/html' }),
      caches,
    }),
  );

  const stored = await (await caches.open(CACHE)).match(URL);
  assert.ok(stored, 'previous valid copy is still present');
  const head = new Uint8Array(await (await stored.blob()).slice(0, 8).arrayBuffer());
  assert.equal(isPmtilesHeader(head), true, 'previous copy is still valid PMTiles');
});
