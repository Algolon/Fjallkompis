/**
 * Core offline-download routine: fetch a PMTiles archive, VALIDATE it, and only
 * then store it as one full response in a dedicated Cache Storage cache.
 *
 * Kept framework-free (fetch / caches / Blob / Response are injectable) so the
 * download-safety behaviour is unit-testable under `node --test`:
 *  - a non-2xx response is rejected;
 *  - an HTML / JSON / any non-PMTiles body is rejected via the magic-byte check
 *    (a server that answers a missing tileset with a 200 fallback page can
 *    never be stored as a "map");
 *  - a rejected download NEVER writes to the cache, so a previously-downloaded
 *    valid copy is left intact (no corrupt entry).
 */
import { isPmtilesHeader } from './pmtilesFormat.mjs';

/**
 * @param {string} url
 * @param {string} cacheName
 * @param {(loaded: number, total: number | null) => void} onProgress
 * @param {{ fetch?: typeof fetch, caches?: CacheStorage }} [deps]
 * @returns {Promise<number>} stored byte size
 */
export async function downloadPmtiles(url, cacheName, onProgress, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const cacheStorage = deps.caches ?? globalThis.caches;

  // cache: 'no-store' so a stale HTTP-cache copy is bypassed on re-download.
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);

  const total = Number(res.headers.get('Content-Length')) || null;
  const chunks = [];
  let loaded = 0;

  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  } else {
    const buf = new Uint8Array(await res.arrayBuffer());
    chunks.push(buf);
    loaded = buf.byteLength;
    onProgress(loaded, total);
  }

  const blob = new Blob(chunks, { type: 'application/octet-stream' });

  // Reject anything that is not actually a PMTiles archive BEFORE caching, so a
  // fallback HTML/JSON page can never be stored and read back as a tileset.
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (!isPmtilesHeader(head)) {
    throw new Error('That URL did not return a map file (unexpected data) — the map may be unavailable');
  }

  const cache = await cacheStorage.open(cacheName);
  await cache.put(
    url,
    new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(blob.size),
      },
    }),
  );
  return blob.size;
}
