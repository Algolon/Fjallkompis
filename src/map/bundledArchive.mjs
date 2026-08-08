/**
 * Bundled-archive policy: when the app runs inside the Capacitor Android
 * shell, the vector basemap ships INSIDE the app package and must be read as
 * one complete file — never through HTTP byte-range requests.
 *
 * WHY THIS EXISTS. The 'online' basemap fallback streams the archive with
 * ranged GETs (pmtiles FetchSource). Against a real static host that is
 * correct; against Capacitor's in-app asset server it is not. Measured inside
 * the release WebView (Android emulator, WebView 133, fresh install of the
 * versionCode 2700001 bundle):
 *
 *   Range: bytes=0-0        → 206, Content-Length: 1,  body 5 904 598 bytes
 *   Range: bytes=1e6-1e6+15 → 206, Content-Length: 16, body 4 904 598 bytes
 *
 * Capacitor's WebViewLocalServer builds 206 headers around a stream it never
 * seeks or truncates, and Chromium's intercepted-request loader then skips the
 * stream to the range START but serves it to EOF. Every read returns the whole
 * remainder of the file, PMTiles fails while parsing the oversized buffers
 * (`RangeError: Offset is outside the bounds of the DataView`), and the Map
 * tab renders route overlays on a plain background — no basemap. How much of
 * this misbehaviour is visible varies by WebView version, which is why one
 * physical debug install appeared to work; the contract is simply not there.
 *
 * The remedy is not to "fix" the ranges but to stop depending on them: fetch
 * the bundled file ONCE as a plain full-body GET (which the asset server does
 * serve correctly) and read it through the same blob-backed PMTiles source the
 * offline path already uses. This module owns the pure decision of whether a
 * fetched candidate is usable; the fetch itself lives in pmtilesProtocol.ts.
 */

/**
 * Is this full-body response a usable copy of the bundled archive?
 *
 * Mirrors the two safety checks the hosted-probe path already performs, plus
 * the revision contract's size proof:
 *  - a non-OK status is a packaging failure (the file is missing from the
 *    app bundle), never something to fall back from silently;
 *  - a text/html content type is the SPA fallback answering for a missing
 *    file — bytes that would crash PMTiles with "wrong magic number";
 *  - a declared revision pins the exact byte length, so a truncated read or
 *    a stale asset is refused the same way a bad download is.
 *
 * @param {{ ok: boolean, contentType: string | null, sizeBytes: number }} candidate
 * @param {{ bytes: number } | null | undefined} revision
 *   The archive's declared revision (VECTOR_ARCHIVE_REVISION), or null for
 *   archives that have only ever had one revision.
 * @returns {{ usable: boolean, reason: string | null }}
 */
export function classifyBundledArchive(candidate, revision) {
  if (!candidate.ok) {
    return { usable: false, reason: 'bundled archive missing from the app package' };
  }
  const type = (candidate.contentType ?? '').toLowerCase();
  if (type.includes('text/html')) {
    return { usable: false, reason: 'bundled archive request answered by the app shell' };
  }
  const expected = revision?.bytes ?? null;
  if (expected != null && candidate.sizeBytes !== expected) {
    return {
      usable: false,
      reason: `bundled archive is ${candidate.sizeBytes} bytes, expected ${expected}`,
    };
  }
  return { usable: true, reason: null };
}
