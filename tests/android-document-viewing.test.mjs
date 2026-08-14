/**
 * Android document viewing — the native half of the file-VIEW boundary.
 *
 * The behavioural contract of the shared opener is exercised for real in
 * tests/wallet-document-delivery.test.mjs; the filename policy runs as JUnit
 * (SharedDocumentNameTest). What remains are cross-language wiring facts —
 * Java and XML that node cannot execute — each of which failing silently
 * would resurrect the dead PDF button or widen a security boundary:
 *
 *   - the plugin must be REGISTERED before the bridge loads the page, or
 *     every call rejects and every PDF quietly falls back to the save picker;
 *   - the staged file must be exposed through the FileProvider path actually
 *     declared, or FileProvider.getUriForFile throws at runtime only;
 *   - the viewing flow must stay inside app-private cache with a temporary
 *     read grant — no new permissions, no raw file:// paths.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const mainActivity = read('android/app/src/main/java/com/algolon/fjallkompis/MainActivity.java');
const plugin = read('android/app/src/main/java/com/algolon/fjallkompis/ViewFilePlugin.java');
const naming = read('android/app/src/main/java/com/algolon/fjallkompis/SharedDocumentName.java');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const filePaths = read('android/app/src/main/res/xml/file_paths.xml');
const fileView = read('src/runtime/fileView.ts');

/** Strip comments so prose cannot satisfy — or fail — a check. */
const codeOf = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '');

test('the ViewFile bridge is registered before the first page load', () => {
  const code = codeOf(mainActivity);
  const register = code.indexOf('registerPlugin(ViewFilePlugin.class)');
  const superCreate = code.indexOf('super.onCreate(savedInstanceState)');
  assert.ok(register >= 0, 'MainActivity registers ViewFilePlugin');
  assert.ok(register < superCreate,
    'registration precedes super.onCreate() — the bridge only sees plugins registered before it builds');
});

test('the JS boundary and the native plugin agree on the bridge name and methods', () => {
  assert.match(plugin, /@CapacitorPlugin\(name = "ViewFile"\)/);
  assert.match(fileView, /registerPlugin<ViewFileBridge>\('ViewFile'\)/);
  for (const method of ['begin', 'writeChunk', 'view', 'abort']) {
    assert.match(plugin, new RegExp(`public void ${method}\\(PluginCall call\\)`),
      `the plugin implements ${method}`);
    assert.match(fileView, new RegExp(`${method}\\(`), `the JS boundary calls ${method}`);
  }
});

test('the staged document is app-private cache exposed via the declared FileProvider path', () => {
  const code = codeOf(plugin);
  assert.match(code, /getCacheDir\(\), STAGING_DIR/);
  assert.match(plugin, /STAGING_DIR = "shared-documents"/);
  assert.match(filePaths, /<cache-path name="shared_documents" path="shared-documents\/"/,
    'file_paths.xml exposes exactly the staging directory');
  assert.match(code, /FileProvider\.getUriForFile\(/);
  assert.match(code, /getPackageName\(\) \+ "\.fileprovider"/,
    'the authority matches the manifest declaration');
  assert.match(manifest, /android:authorities="\$\{applicationId\}\.fileprovider"/);
  assert.ok(!/Uri\.fromFile|file:\/\//.test(code),
    'no raw file:// URI ever leaves the app');
});

test('viewing is a temporary read grant on ACTION_VIEW — nothing broader', () => {
  const code = codeOf(plugin);
  assert.match(code, /Intent\.ACTION_VIEW/);
  assert.match(code, /setDataAndType\(uri, mimeType\)/,
    'the stored MIME type decides the handler, not the filename');
  assert.match(code, /FLAG_GRANT_READ_URI_PERMISSION/);
  assert.ok(!/FLAG_GRANT_WRITE_URI_PERMISSION/.test(code), 'read-only — the viewer never writes back');
});

test('a device with no viewer app is a state the JS side can answer, not a crash', () => {
  const code = codeOf(plugin);
  assert.match(code, /ActivityNotFoundException/);
  assert.match(code, /"NO_VIEWER"/);
  assert.match(codeOf(fileView), /NO_VIEWER/, 'the JS boundary recognises the code and falls back');
});

test('the filename reaching the filesystem passes the sanitizer', () => {
  assert.match(codeOf(plugin), /new File\(dir, SharedDocumentName\.sanitize\(fileName\)\)/,
    'the web-supplied name never reaches File() raw');
  assert.ok(!/import android/.test(naming),
    'SharedDocumentName stays JVM-pure so JUnit can run it (SharedDocumentNameTest)');
});

test('document viewing added no permissions and no manifest surface', () => {
  // The entire flow is cache + FileProvider + intent: any new <uses-permission>
  // here would mean the approach drifted from its design.
  const permissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(permissions, [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.INTERNET',
  ]);
  assert.ok(!/<queries/.test(manifest),
    'no package-visibility queries: startActivity does not need them, and resolving handlers is not attempted');
});
