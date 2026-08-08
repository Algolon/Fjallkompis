/**
 * Native bundled-basemap resolution — the fresh-install regression fence.
 *
 * Play Internal Testing (versionCode 2700001) shipped a Map tab whose vector
 * basemap never rendered on a fresh install, even though the archive was
 * inside the AAB byte-identical to the committed file. Root cause, proven in
 * the emulator against the exact uploaded bundle: with Cache Storage empty
 * the app resolved the basemap 'online' and streamed it with ranged GETs, but
 * Capacitor's in-app asset server + Chromium's intercepted-request loader do
 * not implement byte serving (bytes are skipped to the range start and then
 * served to EOF with wrong lengths), and PMTiles died parsing the oversized
 * buffers. The tiny bytes=0-0 probe cannot detect this — it looks fine.
 *
 * The fix reads the PACKAGED archive as one complete blob in the native
 * shell. This suite guards:
 *  - the pure classification of a fetched bundled candidate;
 *  - the wiring: resolution order, native-only guard, no Range header on the
 *    bundled fetch, and the vector archive being the one bundled spec;
 *  - the CI fences that keep the archive inside the packaged AAB/APK.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { classifyBundledArchive } from '../src/map/bundledArchive.mjs';
import { VECTOR_ARCHIVE_REVISION } from '../src/map/archiveRevision.mjs';
import {
  BUNDLED_MAP_ASSETS,
  MAP_ASSETS,
  OPTIONAL_MAP_ASSETS,
} from '../src/map/mapCatalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const protocol = readFileSync(join(root, 'src/map/pmtilesProtocol.ts'), 'utf8');
// The bundled-archive READ moved into the platform store when Android gained
// optional downloads; the resolution ORDER still lives in the protocol module.
const store = readFileSync(join(root, 'src/map/archiveStore.ts'), 'utf8');
const offlineMap = readFileSync(join(root, 'src/map/offlineMap.ts'), 'utf8');
const releaseWorkflow = readFileSync(
  join(root, '.github/workflows/android-internal-release.yml'),
  'utf8',
);
const spikeWorkflow = readFileSync(join(root, '.github/workflows/android-spike.yml'), 'utf8');

// ---------------------------------------------------------------------------
// Pure classification
// ---------------------------------------------------------------------------

const GOOD = {
  ok: true,
  contentType: null, // Capacitor's asset server sends no Content-Type for .pmtiles
  sizeBytes: VECTOR_ARCHIVE_REVISION.bytes,
};

test('a complete packaged archive of the declared revision is usable', () => {
  assert.deepEqual(classifyBundledArchive(GOOD, VECTOR_ARCHIVE_REVISION), {
    usable: true,
    reason: null,
  });
  // Binary content types are fine too.
  assert.equal(
    classifyBundledArchive(
      { ...GOOD, contentType: 'application/octet-stream' },
      VECTOR_ARCHIVE_REVISION,
    ).usable,
    true,
  );
});

test('a missing packaged file is refused, not fallen back from silently', () => {
  const verdict = classifyBundledArchive({ ...GOOD, ok: false, sizeBytes: 0 }, VECTOR_ARCHIVE_REVISION);
  assert.equal(verdict.usable, false);
  assert.match(verdict.reason, /missing/i);
});

test('the SPA fallback answering for the archive is refused', () => {
  const verdict = classifyBundledArchive(
    { ok: true, contentType: 'text/html; charset=utf-8', sizeBytes: 1769 },
    VECTOR_ARCHIVE_REVISION,
  );
  assert.equal(verdict.usable, false);
  assert.match(verdict.reason, /app shell/i);
});

test('a wrong-size copy is refused with both byte counts named', () => {
  const verdict = classifyBundledArchive(
    { ...GOOD, sizeBytes: 5_603_107 },
    VECTOR_ARCHIVE_REVISION,
  );
  assert.equal(verdict.usable, false);
  assert.match(verdict.reason, /5603107/);
  assert.match(verdict.reason, new RegExp(String(VECTOR_ARCHIVE_REVISION.bytes)));
});

test('an unrevisioned archive is only checked for presence and type', () => {
  assert.equal(classifyBundledArchive({ ...GOOD, sizeBytes: 42 }, null).usable, true);
  assert.equal(classifyBundledArchive({ ...GOOD, sizeBytes: 42 }, undefined).usable, true);
});

// ---------------------------------------------------------------------------
// Wiring inside pmtilesProtocol.ts
// ---------------------------------------------------------------------------

test('resolution order is the local copy first, the ranged online probe last', () => {
  // The order is what stopped the regression: on Android the packaged archive
  // MUST be found before anything reaches probeHostedArchive, because that
  // path hands PMTiles the asset server's broken range responses.
  const local = protocol.indexOf('await addLocalSource(spec, offlineKey)');
  const probe = protocol.indexOf('await probeHostedArchive(archiveUrl(spec))');
  assert.ok(local > 0, 'the local copy is consulted');
  assert.ok(probe > local, 'the ranged online probe is the LAST resort');
});

test('the local source is a PMTiles Source, never a URL handed to the network', () => {
  // A Blob (Cache Storage download, or the packaged archive read whole) or a
  // slice-reading native source. Either way PMTiles is given bytes we control,
  // which is the whole point.
  assert.match(protocol, /new BlobSource\(local\.blob, key\)/);
  assert.match(protocol, /nativeArchiveSource\(local\.nativeAssetId!, key\)/);
});

test('the bundled branch is native-only and comes before any download check', () => {
  const bundledFirst = store.indexOf('if (isBundledHere(spec))');
  const nativeStore = store.indexOf('if (isNativeAndroid()) {\n    const probe');
  assert.ok(bundledFirst > 0, 'openLocalArchive checks the app package first');
  assert.ok(nativeStore > bundledFirst, 'and the downloaded-file check follows it');
  assert.match(
    store,
    /return spec\.bundledInApp && isNativeAndroid\(\)/,
    'bundled only counts inside the native shell',
  );
});

/** The body of getBundledArchiveBlob, ending at its closing unindented brace. */
function bundledHelperSource() {
  const start = store.indexOf('export function getBundledArchiveBlob');
  assert.ok(start > 0, 'getBundledArchiveBlob exists');
  const end = store.indexOf('\n}\n', start);
  assert.ok(end > start, 'and closes');
  return store.slice(start, end + 2);
}

test('the bundled fetch is a plain full-body GET — no Range header anywhere near it', () => {
  const helper = bundledHelperSource();
  assert.match(helper, /await fetch\(url\)/, 'fetched with no init object at all');
  assert.doesNotMatch(helper, /Range/i, 'a ranged read would resurrect the regression');
  // The verdict comes from the shared pure classification, not ad-hoc checks.
  assert.match(helper, /classifyBundledArchive\(/);
});

test('the bundled copy is read once per session and never persisted', () => {
  assert.match(store, /const bundledBlobs = new Map<string, Promise<Blob \| null>>\(\)/);
  assert.doesNotMatch(
    bundledHelperSource(),
    /caches\./,
    'Cache Storage stays reserved for the download flow',
  );
});

test('exactly the vector basemap is declared bundled, and the catalog says so', () => {
  assert.deepEqual([...BUNDLED_MAP_ASSETS], ['vector']);
  assert.deepEqual([...OPTIONAL_MAP_ASSETS], ['terrain', 'contours', 'satellite']);
  assert.equal(MAP_ASSETS.vector.file, 'kungsleden.pmtiles');
  // The runtime flag is DERIVED from the catalog, so the two cannot disagree.
  assert.match(offlineMap, /bundledInApp: asset\.distribution === 'bundled'/);
});

// ---------------------------------------------------------------------------
// The packaged file itself, and the CI fences around it
// ---------------------------------------------------------------------------

test('the committed archive matches the revision the classification enforces', () => {
  assert.equal(
    statSync(join(root, 'public/maps/kungsleden.pmtiles')).size,
    VECTOR_ARCHIVE_REVISION.bytes,
  );
});

test('both Android workflows verify the packaged basemap byte-identically', () => {
  for (const [name, source, entry] of [
    ['android-internal-release.yml', releaseWorkflow, 'base/assets/public/maps/kungsleden.pmtiles'],
    ['android-spike.yml', spikeWorkflow, 'assets/public/maps/kungsleden.pmtiles'],
  ]) {
    assert.match(source, /Verify the packaged vector basemap/, `${name} has the step`);
    assert.ok(source.includes(`entry=${entry}`), `${name} checks the right archive entry`);
    assert.match(
      source,
      /sha256sum public\/maps\/kungsleden\.pmtiles/,
      `${name} compares against the committed file, not a constant that can drift`,
    );
  }
});
