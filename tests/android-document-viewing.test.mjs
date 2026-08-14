/**
 * Android document viewing — IN-APP, with the external hand-off retired.
 *
 * #146 fixed the dead PDF button by staging Wallet bytes into app-private
 * cache and firing a read-only ACTION_VIEW at an external viewer app. That
 * worked, but it was the wrong product: tapping a document in Fjallkompis
 * handed the user to Adobe. Viewing now happens inside the app on every
 * platform (src/components/WalletPdfViewer.tsx, pdf.js underneath), so the
 * native ViewFile bridge is GONE — and this file pins both directions:
 *
 *   - the retired infrastructure must not linger half-removed (a registered
 *     plugin with no JS caller, a FileProvider path with no writer — dead
 *     surface area that reads as live), and
 *   - the pieces that legitimately remain (the SAF save bridge, the
 *     FileProvider itself) must stay exactly as they were.
 *
 * These are cross-language wiring facts — Java and XML that node cannot
 * execute — so they are stated as source contracts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const mainActivity = read('android/app/src/main/java/com/algolon/fjallkompis/MainActivity.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const filePaths = read('android/app/src/main/res/xml/file_paths.xml');

/** Strip comments so prose cannot satisfy — or fail — a check. */
const codeOf = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '');

test('the external-viewer bridge is fully removed, not just unplugged', () => {
  const javaDir = 'android/app/src/main/java/com/algolon/fjallkompis';
  assert.ok(!existsSync(join(root, javaDir, 'ViewFilePlugin.java')),
    'ViewFilePlugin.java (the ACTION_VIEW hand-off) must stay deleted');
  assert.ok(!existsSync(join(root, javaDir, 'SharedDocumentName.java')),
    'SharedDocumentName existed only to sanitize the staged filename');
  assert.ok(
    !existsSync(join(root, 'android/app/src/test/java/com/algolon/fjallkompis/SharedDocumentNameTest.java')),
    'its JUnit test goes with it — dead tests read as live coverage',
  );
  assert.ok(!/ViewFilePlugin/.test(codeOf(mainActivity)),
    'MainActivity must not register a plugin that no longer exists');
});

test('no ACTION_VIEW remains anywhere in the Android sources', () => {
  // The normal viewing flow must never launch an external app again. Whole-
  // directory sweep so a re-introduction under a new file name still trips.
  for (const file of [
    'MainActivity.java',
    'BootPlugin.java',
    'SaveFilePlugin.java',
    'MapArchivePlugin.java',
    'MapArchiveUrlPolicy.java',
  ]) {
    const source = read(`android/app/src/main/java/com/algolon/fjallkompis/${file}`);
    assert.ok(!/ACTION_VIEW/.test(codeOf(source)), `${file} must not fire ACTION_VIEW`);
  }
});

test('the FileProvider no longer exposes a document-staging path', () => {
  assert.ok(!/shared_documents|shared-documents/.test(filePaths),
    'the staging cache-path entry leaves with the plugin that wrote there');
  // The provider itself remains — other app features use it — and its
  // authority is unchanged.
  assert.match(manifest, /android:authorities="\$\{applicationId\}\.fileprovider"/);
});

test('the SAF save bridge stays — saving a copy is a real, separate action', () => {
  const code = codeOf(mainActivity);
  assert.match(code, /registerPlugin\(SaveFilePlugin\.class\)/,
    'ACTION_CREATE_DOCUMENT export (Download a copy, backups) is untouched');
  const savePlugin = read('android/app/src/main/java/com/algolon/fjallkompis/SaveFilePlugin.java');
  assert.match(codeOf(savePlugin), /ACTION_CREATE_DOCUMENT/);
});

test('retiring the external viewer added no permissions and no manifest surface', () => {
  const permissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(permissions, [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.INTERNET',
  ]);
  assert.ok(!/<queries/.test(manifest),
    'no package-visibility queries: the app no longer resolves external viewers at all');
});
