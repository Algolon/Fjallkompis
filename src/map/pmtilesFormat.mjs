/**
 * Minimal PMTiles format detection.
 *
 * A PMTiles v3 archive begins with the 7-byte ASCII magic "PMTiles" followed
 * by the spec-version byte (3). Checking these header bytes is a content-type-
 * independent way to reject anything that is NOT a tile archive — an SPA/HTML
 * fallback, a JSON error page, a captive-portal login, etc. — before it can be
 * stored as a "map". Framework-free so it is unit-testable under `node --test`.
 */

/** ASCII magic at the start of every PMTiles archive. */
export const PMTILES_MAGIC = 'PMTiles';

/** Current PMTiles spec version this app reads. */
export const PMTILES_VERSION = 3;

/**
 * True iff `bytes` begins with a valid PMTiles v3 header.
 * @param {Uint8Array | null | undefined} bytes First ≥ 8 bytes of the file.
 * @returns {boolean}
 */
export function isPmtilesHeader(bytes) {
  if (!bytes || bytes.length < 8) return false;
  for (let i = 0; i < PMTILES_MAGIC.length; i++) {
    if (bytes[i] !== PMTILES_MAGIC.charCodeAt(i)) return false;
  }
  return bytes[7] === PMTILES_VERSION;
}
