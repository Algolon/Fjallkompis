/**
 * Map parity — one canonical offline map system for PWA and Android.
 *
 * The asymmetry this fences: the PWA offered vector, terrain, contours and
 * satellite; Android shipped the vector archive inside the app package and
 * could not reach the other three at all. Three independent causes (the bytes
 * were never in the build, the derived URLs could not resolve under the native
 * base, and Capacitor's local server still cannot byte-serve) are recorded in
 * docs/pr-evidence/2026-08-map-parity/diagnosis.md.
 *
 * What must hold from here on:
 *  - ONE catalog owns every archive identity, and every consumer derives from
 *    it — so "both platforms use the same revision" is a fact, not a habit;
 *  - the vector archive stays bundled and the optional three stay out of the
 *    Android artifact;
 *  - a stored archive is classified by the SAME decision table on both
 *    platforms, and a stale one never presents as current;
 *  - a partial, corrupt or cancelled download can never be opened;
 *  - removing one archive cannot touch another.
 *
 * Load-bearing assumptions are mutation-tested: perturbing the catalog must
 * flip the classification. A contract that survives its own inputs changing is
 * not testing anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BUNDLED_MAP_ASSETS,
  MAP_ASSETS,
  MAP_ASSET_IDS,
  MAP_DOWNLOAD_GROUPS,
  OPTIONAL_MAP_ASSETS,
  mapAsset,
  mapAssetGroupBytes,
  mapAssetPath,
  mapAssetReleaseUrl,
} from '../src/map/mapCatalog.mjs';
import { classifyStoredArchive } from '../src/map/archiveRevision.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/**
 * Source with comments stripped. Several assertions below are of the form
 * "this identifier appears nowhere" — and these modules explain at length WHY
 * they avoid the thing, so matching the prose would make the test pass (or
 * fail) for entirely the wrong reason.
 */
const codeOnly = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const catalog = read('src/map/mapCatalog.mjs');
const offlineMap = read('src/map/offlineMap.ts');
const archiveStore = read('src/map/archiveStore.ts');
const nativeStore = read('src/map/nativeArchiveStore.ts');
const plugin = read('android/app/src/main/java/com/algolon/fjallkompis/MapArchivePlugin.java');
const urlPolicy = read('android/app/src/main/java/com/algolon/fjallkompis/MapArchiveUrlPolicy.java');
const urlPolicyTest = read(
  'android/app/src/test/java/com/algolon/fjallkompis/MapArchiveUrlPolicyTest.java',
);
const mainActivity = read('android/app/src/main/java/com/algolon/fjallkompis/MainActivity.java');
const card = read('src/components/OfflineMapCard.tsx');
const viteConfig = read('vite.config.ts');
const deployWorkflow = read('.github/workflows/deploy.yml');
const releaseWorkflow = read('.github/workflows/android-internal-release.yml');
const spikeWorkflow = read('.github/workflows/android-spike.yml');
const verifyNative = read('scripts/verify-native-build.mjs');

// ---------------------------------------------------------------------------
// 1. One canonical catalog, and every consumer derives from it
// ---------------------------------------------------------------------------

test('every archive declares a complete, well-formed identity', () => {
  assert.deepEqual([...MAP_ASSET_IDS], ['vector', 'terrain', 'contours', 'satellite']);
  for (const id of MAP_ASSET_IDS) {
    const asset = mapAsset(id);
    assert.equal(asset.id, id);
    assert.match(asset.file, /^[a-z0-9-]+\.pmtiles$/, `${id} filename`);
    assert.match(asset.revision.id, /^[a-z0-9-]+$/, `${id} revision id`);
    assert.ok(asset.revision.bytes > 0, `${id} pins a byte length`);
    assert.match(asset.revision.sha256, /^[0-9a-f]{64}$/, `${id} pins a digest`);
    assert.match(asset.cacheName, /^fjallkompis-offline-/, `${id} cache identity`);
    assert.equal(mapAssetPath(asset), `maps/${asset.file}`);
  }
  // Identities must be unique or two archives would share a store.
  for (const key of ['file', 'cacheName']) {
    const values = MAP_ASSET_IDS.map((id) => MAP_ASSETS[id][key]);
    assert.equal(new Set(values).size, values.length, `${key} values are unique`);
  }
  const revisionIds = MAP_ASSET_IDS.map((id) => MAP_ASSETS[id].revision.id);
  assert.equal(new Set(revisionIds).size, revisionIds.length, 'revision ids are unique');
});

test('BOTH platforms resolve the same asset metadata — there is only one copy of it', () => {
  // The PWA's runtime specs are built from the catalog…
  assert.match(offlineMap, /function specFor\(id: string/);
  assert.match(offlineMap, /const asset = mapAsset\(id\)/);
  assert.match(offlineMap, /revision: asset\.revision/);
  // …and the native side is handed catalog values per call, so the revision
  // Android downloads is by construction the revision the PWA declares.
  assert.match(nativeStore, /url: mapAssetReleaseUrl\(asset\)/);
  assert.match(nativeStore, /expectedBytes: asset\.revision\.bytes/);
  assert.match(nativeStore, /expectedSha256: asset\.revision\.sha256/);
  assert.match(nativeStore, /revisionId: asset\.revision\.id/);
});

test('no archive identity is repeated outside the catalog', () => {
  // The whole point: one place to edit. A literal filename, cache name, size
  // or digest anywhere else is a future drift bug already written down.
  const consumers = {
    'src/map/offlineMap.ts': offlineMap,
    'src/map/archiveStore.ts': archiveStore,
    'src/map/nativeArchiveStore.ts': nativeStore,
    'vite.config.ts': viteConfig,
    '.github/workflows/deploy.yml': deployWorkflow,
    'MapArchivePlugin.java': plugin,
  };
  for (const [name, source] of Object.entries(consumers)) {
    for (const id of MAP_ASSET_IDS) {
      const asset = MAP_ASSETS[id];
      assert.ok(!source.includes(asset.revision.sha256), `${name} repeats ${id}'s digest`);
      assert.ok(!source.includes(asset.cacheName), `${name} repeats ${id}'s cache name`);
      assert.ok(
        !source.includes(String(asset.revision.bytes)),
        `${name} repeats ${id}'s byte length`,
      );
      if (asset.release) {
        assert.ok(!source.includes(asset.release.tag), `${name} repeats ${id}'s release tag`);
      }
    }
  }
});

test('the deploy workflow fetches and verifies through the catalog, twice', () => {
  assert.match(deployWorkflow, /node scripts\/map-archives\.mjs fetch public\/maps/);
  assert.match(deployWorkflow, /node scripts\/map-archives\.mjs verify public\/maps/);
  // "we downloaded the right bytes" and "the right bytes are in the artifact"
  // are different claims, and only the second one reaches a reader.
  assert.match(deployWorkflow, /node scripts\/map-archives\.mjs verify dist\/maps/);
  assert.ok(
    !/gh release download/.test(deployWorkflow),
    'the workflow no longer decides which release it downloads',
  );
});

// ---------------------------------------------------------------------------
// 2. Bundled vs optional, and the Android artifact
// ---------------------------------------------------------------------------

test('the vector basemap is the one bundled archive, on both targets', () => {
  assert.deepEqual([...BUNDLED_MAP_ASSETS], ['vector']);
  assert.equal(MAP_ASSETS.vector.release, null, 'the bundled archive is committed, not released');
  assert.throws(() => mapAssetReleaseUrl(MAP_ASSETS.vector), /bundled/);
  // It is also the airplane-mode baseline: the native read path resolves the
  // app package before it considers anything downloaded or hosted.
  assert.match(archiveStore, /if \(isBundledHere\(spec\)\) \{\s*\n\s*const blob = await getBundledArchiveBlob/);
});

test('every optional archive has a canonical release URL, and it is the same bytes', () => {
  for (const id of OPTIONAL_MAP_ASSETS) {
    const asset = MAP_ASSETS[id];
    assert.ok(asset.release, `${id} names its release`);
    const url = mapAssetReleaseUrl(asset);
    assert.equal(
      url,
      `https://github.com/Algolon/Fjallkompis/releases/download/${asset.release.tag}/${asset.file}`,
    );
    // The Pages copy deployment injects is the same file under the same name,
    // so the PWA's same-origin path and this URL cannot diverge in content.
    assert.equal(asset.release.asset, asset.file);
  }
});

test('the optional archives are kept out of the Android artifact at three layers', () => {
  // The build strips them…
  assert.match(viteConfig, /function stripOptionalMapArchives\(\): Plugin/);
  assert.match(viteConfig, /for \(const id of OPTIONAL_MAP_ASSETS\)/);
  // …the pre-sync gate refuses them…
  assert.match(verifyNative, /for \(const id of OPTIONAL_MAP_ASSETS\)/);
  assert.match(verifyNative, /must not be packaged/);
  // …and both workflows check the artifact Play/the device actually receives.
  for (const [name, source] of [
    ['android-internal-release.yml', releaseWorkflow],
    ['android-spike.yml', spikeWorkflow],
  ]) {
    assert.match(source, /optional map archives are NOT in the/, `${name} has the step`);
    for (const id of OPTIONAL_MAP_ASSETS) {
      assert.ok(source.includes(MAP_ASSETS[id].file), `${name} names ${id}`);
    }
  }
});

test('the bundled archive is still asserted present — the opposite mistake', () => {
  assert.match(verifyNative, /for \(const id of BUNDLED_MAP_ASSETS\)/);
  assert.match(verifyNative, /would have no offline \$\{id\} archive in the APK/);
});

// ---------------------------------------------------------------------------
// 2b. The native download boundary
//
// The behaviour of the policy is exercised host-side by
// MapArchiveUrlPolicyTest (JUnit, run by both Android workflows). What is
// asserted HERE is the one thing that test cannot see: that the origin the
// policy allows still matches the origin the catalog actually derives.
// ---------------------------------------------------------------------------

test('the allowed release origin still matches what the catalog derives', () => {
  const prefix = urlPolicy.match(
    /RELEASE_DOWNLOAD_PREFIX\s*=\s*\n?\s*"([^"]+)"/,
  )?.[1];
  assert.ok(prefix, 'the policy declares a release-download prefix');
  for (const id of OPTIONAL_MAP_ASSETS) {
    const url = mapAssetReleaseUrl(MAP_ASSETS[id]);
    assert.ok(
      url.startsWith(prefix),
      `${id} resolves to ${url}, which the native policy would refuse`,
    );
  }
  // The reverse direction too: a prefix broad enough to admit anything else on
  // github.com would not be a constraint worth having.
  assert.match(prefix, /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/releases\/download\/$/);
});

test('the URL policy is native-side, hardcoded, and carries no archive identity', () => {
  // Passed in from JavaScript it would not be a constraint at all — the
  // caller is exactly who it constrains.
  assert.ok(
    !/getString|PluginCall|call\./.test(urlPolicy),
    'the policy reads nothing from the bridge',
  );
  assert.ok(
    !/import android\.|import com\.getcapacitor\./.test(urlPolicy),
    'and stays dependency-free so it can be unit-tested host-side',
  );
  for (const id of MAP_ASSET_IDS) {
    const asset = MAP_ASSETS[id];
    for (const identity of [asset.file, asset.revision.sha256, String(asset.revision.bytes)]) {
      assert.ok(!urlPolicy.includes(identity), `${id} identity must not appear in the policy`);
    }
  }
});

test('the download is refused before any socket is opened', () => {
  // Order matters: the check must precede the executor hand-off, or a refused
  // URL still costs a thread and a connection attempt.
  const check = plugin.indexOf('MapArchiveUrlPolicy.isAllowedDownloadUrl(url)');
  const execute = plugin.indexOf('downloads.execute(');
  const connect = plugin.indexOf('openConnection()');
  assert.ok(check > 0, 'the entry URL is validated');
  assert.ok(check < execute, 'before the work is queued');
  assert.ok(check < connect, 'and before any connection is opened');
  assert.match(plugin, /call\.reject\("Refused: not a canonical map-archive URL", "URL_NOT_ALLOWED"\)/);
});

test('redirects are followed manually so every hop is re-checked', () => {
  // setInstanceFollowRedirects(true) would follow a redirect to any HTTPS host
  // on earth — the arbitrary-GET capability back again, one hop later.
  assert.match(plugin, /setInstanceFollowRedirects\(false\)/);
  assert.ok(
    !/setInstanceFollowRedirects\(true\)/.test(codeOnly(plugin)),
    'automatic redirect following is never re-enabled',
  );
  assert.match(plugin, /MapArchiveUrlPolicy\.isAllowedRedirect\(next\)/);
  assert.match(plugin, /hop <= MapArchiveUrlPolicy\.MAX_REDIRECTS/);
  assert.match(plugin, /throw new IOException\("too many redirects"\)/);
});

test('the policy boundary is exercised by a host-side test, in both workflows', () => {
  // A security boundary asserted about but never run is not a boundary.
  assert.match(urlPolicyTest, /class MapArchiveUrlPolicyTest/);
  for (const scenario of [
    'rejectsPlaintextHttp',
    'rejectsNonHttpSchemes',
    'rejectsLoopbackAndLan',
    'rejectsForeignHosts',
    'rejectsHostsThatMerelyStartWithTheAllowedPrefix',
    'rejectsCredentialsInTheAuthority',
    'rejectsAnotherPathOnGithub',
    'refusesToBeRedirectedOffTheAllowedHosts',
    'aProtocolRelativeLocationChangesTheHost_andIsCaught',
  ]) {
    assert.match(urlPolicyTest, new RegExp(`public void ${scenario}\\(`), scenario);
  }
  for (const [name, source] of [
    ['android-spike.yml', spikeWorkflow],
    ['android-internal-release.yml', releaseWorkflow],
  ]) {
    assert.match(source, /gradlew --no-daemon testDebugUnitTest/, `${name} runs the unit tests`);
  }
});

// ---------------------------------------------------------------------------
// 3. One decision table, both platforms
// ---------------------------------------------------------------------------

/** What the native plugin would report for a device holding the current file. */
const storedCurrent = (asset) => ({
  present: true,
  bytes: asset.revision.bytes,
  revisionId: asset.revision.id,
});

test('a correctly stored native archive is current, downloaded and not repairable', () => {
  for (const id of OPTIONAL_MAP_ASSETS) {
    const asset = MAP_ASSETS[id];
    const verdict = classifyStoredArchive(storedCurrent(asset), asset);
    assert.equal(verdict.state, 'current', id);
    assert.equal(verdict.downloaded, true, id);
    assert.equal(verdict.updateAvailable, false, id);
    assert.equal(verdict.needsRepair, false, id);
    assert.equal(verdict.sizeBytes, asset.revision.bytes, id);
  }
});

test('nothing stored reads as absent, not as broken', () => {
  for (const id of OPTIONAL_MAP_ASSETS) {
    const verdict = classifyStoredArchive({ present: false, bytes: 0, revisionId: null }, MAP_ASSETS[id]);
    assert.equal(verdict.state, 'absent', id);
    assert.equal(verdict.downloaded, false, id);
    assert.equal(verdict.needsRepair, false, id);
  }
});

test('a SHIPPED older revision stays usable offline and offers an update', () => {
  // The product rule that stops an update from stranding a hiker: the map they
  // have keeps working until the replacement has actually arrived.
  for (const id of OPTIONAL_MAP_ASSETS) {
    const asset = MAP_ASSETS[id];
    for (const bytes of asset.supersededBytes) {
      const verdict = classifyStoredArchive(
        { present: true, bytes, revisionId: 'an-older-revision' },
        asset,
      );
      assert.equal(verdict.state, 'legacy', `${id} @ ${bytes}`);
      assert.equal(verdict.downloaded, true, `${id} @ ${bytes} still renders`);
      assert.equal(verdict.updateAvailable, true, `${id} @ ${bytes} offers the update`);
      assert.equal(verdict.needsRepair, false, `${id} @ ${bytes} is not damage`);
    }
  }
});

test('a stale revision NEVER presents as current, even at exactly the right size', () => {
  // The failure this exists to prevent, and the reason the sidecar records an
  // identity rather than trusting the byte count: two builds can coincide in
  // size, and "same size" would then silently mean "up to date".
  for (const id of OPTIONAL_MAP_ASSETS) {
    const asset = MAP_ASSETS[id];
    const verdict = classifyStoredArchive(
      { present: true, bytes: asset.revision.bytes, revisionId: 'kungsleden-something-older' },
      asset,
    );
    assert.notEqual(verdict.state, 'current', `${id} must not claim to be current`);
    assert.equal(verdict.updateAvailable || verdict.needsRepair, true, id);
  }
});

test('an unrecognised size is unusable data, never a map', () => {
  for (const id of OPTIONAL_MAP_ASSETS) {
    const asset = MAP_ASSETS[id];
    const verdict = classifyStoredArchive(
      { present: true, bytes: 1234, revisionId: asset.revision.id },
      asset,
    );
    assert.equal(verdict.state, 'invalid', id);
    assert.equal(verdict.downloaded, false, `${id} is not counted as downloaded`);
    assert.equal(verdict.needsRepair, true, id);
    // …and the map is never handed those bytes.
    assert.equal(verdict.source, null, `${id} resolves to nothing readable`);
  }
});

test('MUTATION: perturbing any load-bearing catalog field flips the verdict', () => {
  // If these mutations did not change the answer, the fields would not be
  // load bearing and the contracts above would be decoration.
  for (const id of OPTIONAL_MAP_ASSETS) {
    const asset = MAP_ASSETS[id];
    const stored = storedCurrent(asset);

    const wrongBytes = {
      ...asset,
      revision: { ...asset.revision, bytes: asset.revision.bytes + 1 },
    };
    assert.notEqual(
      classifyStoredArchive(stored, wrongBytes).state,
      'current',
      `${id}: the declared byte length is not consulted`,
    );

    const wrongRevision = {
      ...asset,
      revision: { ...asset.revision, id: `${asset.revision.id}-mutated` },
    };
    assert.notEqual(
      classifyStoredArchive(stored, wrongRevision).state,
      'current',
      `${id}: the declared revision id is not consulted`,
    );

    const noSuperseded = { ...asset, supersededBytes: [] };
    for (const bytes of asset.supersededBytes) {
      const older = { present: true, bytes, revisionId: 'an-older-revision' };
      assert.equal(classifyStoredArchive(older, asset).state, 'legacy', id);
      assert.equal(
        classifyStoredArchive(older, noSuperseded).state,
        'invalid',
        `${id}: supersededBytes is not what makes an older revision usable`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 4. The native store: persistence, fail-closed, isolation, memory
// ---------------------------------------------------------------------------

test('downloads land in app-private internal storage — no permission, no shared storage', () => {
  assert.match(plugin, /getContext\(\)\.getFilesDir\(\)/, 'internal app-private storage');
  for (const forbidden of [
    'getExternalFilesDir',
    'getExternalStorageDirectory',
    'MediaStore',
    'WRITE_EXTERNAL_STORAGE',
    'READ_EXTERNAL_STORAGE',
    'getCacheDir',
  ]) {
    assert.ok(!plugin.includes(forbidden), `the plugin must not use ${forbidden}`);
  }
  // getCacheDir in particular: Android's "Clear cache" empties it, which would
  // silently delete a hiker's map. filesDir is not touched by that.
  //
  // Declared permissions only — the manifest DISCUSSES the storage permissions
  // it deliberately omits, and matching that prose would be a test that passes
  // for the wrong reason.
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const declared = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(declared, [
    'android.permission.INTERNET',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
  ], 'optional map downloads need no new permission at all');
});

test('numeric bridge arguments are coerced, never read with getLong/getInt', () => {
  // Capacitor's PluginCall.getLong() returns its DEFAULT unless the parsed
  // value is exactly a java.lang.Long, and every number we send fits in an int
  // (61 704 169 bytes; a PMTiles offset in a sub-2 GB file), so JSON hands it
  // an Integer. Using it would make expectedBytes zero on every download and —
  // silently, and only on the device — every readRange offset zero, which
  // serves the head of the file for every tile.
  assert.match(plugin, /private static long numberArg\(PluginCall call, String name, long fallback\)/);
  assert.match(plugin, /value instanceof Number \? \(\(Number\) value\)\.longValue\(\) : fallback/);
  for (const arg of ['expectedBytes', 'offset', 'length']) {
    assert.match(
      plugin,
      new RegExp(`numberArg\\(call, "${arg}"`),
      `${arg} is read through the coercing helper`,
    );
  }
  assert.ok(!/call\.getLong\(/.test(codeOnly(plugin)), 'getLong is never used');
  assert.ok(!/call\.getInt\(/.test(codeOnly(plugin)), 'getInt is never used');
});

test('a stored archive survives restart: status is read from disk, not from memory', () => {
  // Nothing about `status` consults process state, so a cold start after a
  // process kill reports exactly what the filesystem holds.
  const statusBody = plugin.slice(
    plugin.indexOf('public void status(PluginCall call)'),
    plugin.indexOf('public void usage(PluginCall call)'),
  );
  assert.match(statusBody, /archiveFile\(id\)/);
  assert.match(statusBody, /file\.isFile\(\)/);
  assert.match(statusBody, /readSidecarRevision\(id\)/);
  // The sidecar is written to disk, so the revision identity survives too.
  assert.match(plugin, /Files\.write\(sidecarFile\(id\)\.toPath\(\)/);
});

test('a partial, cancelled or corrupt download can never be opened', () => {
  // The commit order is the whole guarantee: write to .part, verify size AND
  // digest, only then rename. Nothing reads a .part file, ever.
  const run = plugin.slice(plugin.indexOf('private long runDownload('));
  const partWrite = run.indexOf('Files.newOutputStream(part.toPath())');
  const sizeCheck = run.indexOf('written != expectedBytes');
  const shaCheck = run.indexOf('actualSha.equalsIgnoreCase(expectedSha)');
  const move = run.indexOf('Files.move(part.toPath()');
  assert.ok(partWrite > 0, 'the download writes a .part file');
  assert.ok(sizeCheck > partWrite, 'the byte count is checked after the stream');
  assert.ok(shaCheck > sizeCheck, 'and the digest after that');
  assert.ok(move > shaCheck, 'the rename happens only after BOTH checks pass');
  assert.match(run, /StandardCopyOption\.ATOMIC_MOVE/, 'the commit is atomic');
  // Both failure paths delete the partial file rather than leaving bytes that
  // a later status probe might mistake for an archive.
  assert.equal((run.match(/discard\(part\)/g) ?? []).length, 2, 'both rejections discard it');
  // And the read path only ever opens the committed name.
  const readBody = plugin.slice(
    plugin.indexOf('public void readRange(PluginCall call)'),
    plugin.indexOf('public void remove(PluginCall call)'),
  );
  assert.match(readBody, /archiveFile\(id\)/);
  assert.ok(!readBody.includes('partFile'), 'readRange cannot reach a .part file');
});

test('a leftover partial from a killed process is discarded, never resumed', () => {
  // Resuming would mean trusting bytes nothing vouched for, and the digest
  // would then be computed over a stream that never included them.
  assert.match(plugin, /if \(part\.exists\(\) && !part\.delete\(\)\)/);
  // No resume: a ranged request would restart mid-file and the digest would be
  // computed over a stream that never included the bytes already on disk.
  assert.ok(
    !/setRequestProperty\(\s*"Range"/.test(plugin),
    'the downloader sends no Range header',
  );
  assert.ok(!/"bytes="/.test(plugin), 'and constructs no byte range');
});

test('the archive never crosses the bridge whole, and never sits in memory whole', () => {
  // The rule that rules out the "read the file as one base64 string" design:
  // a 61 MB archive would be an 82 MB JavaScript string.
  assert.match(plugin, /byte\[\] buffer = new byte\[BUFFER_BYTES\]/);
  assert.match(plugin, /BUFFER_BYTES = 64 \* 1024/);
  assert.match(plugin, /MAX_READ_BYTES = 8 \* 1024 \* 1024/);
  assert.match(plugin, /digest\.update\(buffer, 0, read\)/, 'hashed in the same pass');
  assert.ok(!/readAllBytes|toByteArray\(\)/.test(plugin), 'the file is never slurped');
  // The JS side reads slices through a PMTiles Source, not a whole blob.
  assert.match(nativeStore, /class NativeArchiveSource implements Source/);
  assert.match(nativeStore, /MapArchive\.readRange\(\{ id: this\.assetId, offset, length \}\)/);
});

test('the native read path never touches Capacitor’s local server', () => {
  // convertFileSrc goes through WebViewLocalServer.handleLocalRequest, whose
  // range branch returns the rest of the file for every read — the versionCode
  // 2700001 blank-basemap defect. Reintroducing it here would be silent.
  for (const source of [nativeStore, archiveStore, read('src/map/pmtilesProtocol.ts')]) {
    assert.ok(!codeOnly(source).includes('convertFileSrc'), 'no file: URL reaches the WebView');
    assert.ok(!codeOnly(source).includes('_capacitor_file_'), 'no local-server path is built');
  }
});

test('removing one archive cannot damage another', () => {
  // Scoped by id on both sides. The bundled basemap is not even in this
  // directory, so it is unreachable from the remove path by construction.
  const removeBody = plugin.slice(plugin.indexOf('public void remove(PluginCall call)'));
  assert.match(removeBody, /String id = safeId\(call\.getString\("id"\)\)/);
  for (const file of ['archiveFile(id)', 'sidecarFile(id)', 'partFile(id)']) {
    assert.ok(removeBody.includes(`${file}.delete()`), `remove clears ${file}`);
  }
  assert.ok(!/deleteRecursively|archiveDir\(\)\.delete/.test(removeBody), 'never the whole directory');
  assert.match(archiveStore, /if \(isBundledHere\(spec\)\) return;/, 'a bundled archive is never removed');
  // And an id that is not a plain token cannot escape the directory at all.
  assert.match(plugin, /id\.matches\("\[a-z0-9-\]\{1,32\}"\)/);
});

test('the plugin is registered before the first page load', () => {
  // The Map tab resolves its archives on mount, which can be the first frame
  // if the app was last closed on Map; a late registration would race it.
  const register = mainActivity.indexOf('registerPlugin(MapArchivePlugin.class)');
  const superCreate = mainActivity.indexOf('super.onCreate(savedInstanceState)');
  assert.ok(register > 0, 'the plugin is registered');
  assert.ok(register < superCreate, 'and before the bridge starts loading the WebView');
});

// ---------------------------------------------------------------------------
// 5. Shared product behaviour
// ---------------------------------------------------------------------------

test('terrain relief is one choice over two archives — the dependency is declared', () => {
  const terrain = MAP_DOWNLOAD_GROUPS.find((g) => g.id === 'terrain');
  assert.deepEqual([...terrain.assetIds], ['terrain', 'contours']);
  // Hillshade without contours is not the product, so the card downloads both
  // and reports ready only when both are present.
  assert.match(card, /specs=\{\[TERRAIN_ARCHIVE, CONTOURS_ARCHIVE\]\}/);
  assert.match(card, /const downloaded = statuses\.every\(\(s\) => s\.downloaded\)/);
  assert.equal(
    mapAssetGroupBytes(terrain.assetIds),
    MAP_ASSETS.terrain.revision.bytes + MAP_ASSETS.contours.revision.bytes,
  );
});

test('every download group covers the catalog exactly once', () => {
  const grouped = MAP_DOWNLOAD_GROUPS.flatMap((g) => g.assetIds);
  assert.deepEqual([...grouped].sort(), [...MAP_ASSET_IDS].sort(), 'no archive is unmanaged');
  assert.equal(new Set(grouped).size, grouped.length, 'no archive is in two groups');
});

test('an optional archive is usable only once downloaded — on BOTH platforms', () => {
  // The shared product semantic. Previously the PWA could stream an
  // undownloaded optional archive same-origin while Android could not, so the
  // same UI label meant two different things: on one platform Satellite was
  // selectable, on the other it was not. Streaming was the half to drop —
  // a 27 MB or 59 MB transfer must not start because someone opened a menu.
  const resolver = read('src/map/pmtilesProtocol.ts');
  assert.match(
    resolver,
    /if \(spec\.asset\.distribution === 'optional'\) \{[\s\S]{0,200}?return \{ mode: 'none', sourceUrl: null \};/,
    'the optional path returns before the hosted probe',
  );
  // resolveSatellite must not probe the network at all any more.
  const satellite = resolver.slice(resolver.indexOf('export async function resolveSatellite'));
  assert.ok(
    !satellite.includes('probeHostedArchive'),
    'satellite never falls back to a hosted stream',
  );
  assert.match(satellite, /addLocalSource\(SATELLITE_ARCHIVE/);
  // The basemap KEEPS its online fallback: it is what a first-time reader sees
  // before choosing anything, and on Android it is in the package already.
  const basemap = resolver.slice(
    resolver.indexOf('export async function resolveArchiveBasemap'),
    resolver.indexOf('export function resolveBasemap'),
  );
  assert.match(basemap, /probeHostedArchive\(archiveUrl\(spec\)\)/);
  assert.equal(MAP_ASSETS.vector.distribution, 'bundled');
});

test('the layer menu explains an unavailable optional layer instead of hiding it', () => {
  // Same states, same wording, both platforms — and no platform-specific
  // control: the note is chosen by availability, never by runtime.
  const controls = read('src/components/MapControlStack.tsx');
  assert.match(controls, /satelliteAvailable \? 'Offline Sentinel-2 imagery' : 'Not downloaded'/);
  assert.match(controls, /disabled: !satelliteAvailable/);
  // Where to resolve it is said once for both optional archives, in the same
  // popover, rather than repeated on each option that happens to be missing.
  assert.match(controls, /Add optional map data in Settings → Offline maps\./);
  assert.ok(!/isNativeAndroid|Capacitor/.test(controls), 'no platform branch in the map controls');
});

test('satellite availability is the same canonical asset on both platforms', () => {
  const group = MAP_DOWNLOAD_GROUPS.find((g) => g.id === 'satellite');
  assert.deepEqual([...group.assetIds], ['satellite']);
  assert.match(card, /specs=\{\[SATELLITE_ARCHIVE\]\}/);
  // One spec, built from one catalog entry, used by both the Settings card and
  // the map's availability probe — so the toggle can only ever reflect the
  // same archive the download manages.
  assert.match(offlineMap, /export const SATELLITE_ARCHIVE: ArchiveSpec = specFor\('satellite'/);
  assert.match(read('src/map/pmtilesProtocol.ts'), /addLocalSource\(SATELLITE_ARCHIVE/);
});

test('map availability follows what is stored, never which platform this is', () => {
  // The rule that makes the Satellite toggle honest: it is enabled by a
  // resolved source, and the resolver asks the store, which asks storage.
  const mapView = read('src/components/MapView.tsx');
  assert.ok(!/isNativeAndroid|Capacitor/.test(mapView), 'MapView has no platform branch');
  assert.ok(!/isNativeAndroid|Capacitor/.test(card), 'the Settings card has no platform branch');
  assert.match(mapView, /onSatelliteAvailable\?\.\(satellite\.sourceUrl != null\)/);
  assert.match(mapView, /terrainAvailableRef\.current = terrain\.sourceUrl != null/);
});

test('the shared states are one enumeration, and bundled is one of them', () => {
  assert.match(archiveStore, /export type StoredArchiveState = ArchiveState \| 'bundled'/);
  for (const flag of ['downloaded', 'updateAvailable', 'needsRepair', 'cancellable']) {
    assert.ok(archiveStore.includes(`${flag}:`), `the store reports ${flag}`);
  }
  // A bundled archive offers no download and no removal. That is expressed by
  // the STATE, not by extra booleans saying the same thing — the card renders
  // neither control, and there is no second flag to keep in agreement with it.
  assert.match(card, /\{bundled \? null : needsRepair \?/);
  assert.match(card, /'✓ Included in the app'/);
  assert.ok(!/removable/.test(codeOnly(archiveStore)), 'no redundant removable flag');
  assert.ok(!/downloadable/.test(codeOnly(archiveStore)), 'no redundant downloadable flag');
  // Cancel is offered only where the store can actually stop the transfer.
  assert.match(card, /phase\.kind === 'downloading' && cancellable \?/);
});

test('the PWA’s own storage path is unchanged', () => {
  // Parity must not be bought by regressing the platform that already worked.
  assert.match(offlineMap, /if \(!\('caches' in window\)\) return UNSUPPORTED/);
  assert.match(offlineMap, /storeArchiveRevision\(\s*caches,/, 'still the same commit path');
  assert.match(
    read('src/map/archiveRevision.mjs'),
    /await cache\.put\(spec\.url, toResponse\(blob\)\)/,
    'still one full response per archive',
  );
  assert.match(archiveStore, /await getArchiveStatus\(spec\)/);
  assert.match(archiveStore, /: downloadArchive\(spec, onProgress\)/);
  assert.match(archiveStore, /await removeArchive\(spec\)/);
  // And the caches it reads are the ones it has always read.
  assert.equal(MAP_ASSETS.vector.cacheName, 'fjallkompis-offline-map-v2');
  assert.deepEqual([...MAP_ASSETS.vector.legacyCacheNames], ['fjallkompis-offline-map-v1']);
});

test('the catalog is a static declaration, not a network dependency', () => {
  // A hiker with no signal must be able to learn what their device holds.
  assert.ok(!/fetch\(|XMLHttpRequest|import\(/.test(catalog), 'the catalog performs no I/O');
  assert.match(catalog, /Object\.freeze\(/, 'and cannot be mutated at runtime');
});
