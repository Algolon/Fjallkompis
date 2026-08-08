/**
 * Play Internal Testing release configuration — fences.
 *
 * The Android application id and every versionCode this repository ships are
 * PERMANENT facts about a published app: an id cannot be changed after release
 * without becoming a different app, and a versionCode Play has accepted can
 * never be reused or reclaimed. Signing material is permanent in the opposite
 * direction — a keystore committed once is compromised forever, because git
 * history keeps it.
 *
 * So these are not style checks. Each one guards something that cannot be
 * undone after an upload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const gradle = read('android/app/build.gradle');
const versionProps = read('android/version.properties');
const workflow = read('.github/workflows/android-internal-release.yml');
const debugWorkflow = read('.github/workflows/android-spike.yml');
const gitignore = read('.gitignore');
const capConfig = read('capacitor.config.ts');
const pkg = JSON.parse(read('package.json'));

/** The permanent Play identity. Changing this string is changing the app. */
const APPLICATION_ID = 'com.algolon.fjallkompis';

/** Strip comments so prose describing a refusal cannot satisfy — or fail — a check. */
const codeOf = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(\/\/|#|\*).*$/gm, '');

// --- Package identity --------------------------------------------------------

test('the permanent application id is consistent everywhere', () => {
  assert.match(gradle, new RegExp(`applicationId "${APPLICATION_ID.replace(/\./g, '\\.')}"`));
  assert.match(gradle, new RegExp(`namespace = "${APPLICATION_ID.replace(/\./g, '\\.')}"`));
  assert.match(capConfig, new RegExp(`appId: '${APPLICATION_ID.replace(/\./g, '\\.')}'`));
  assert.match(read('android/app/src/main/res/values/strings.xml'), new RegExp(APPLICATION_ID.replace(/\./g, '\\.')));
  assert.ok(existsSync(join(root, 'android/app/src/main/java/com/algolon/fjallkompis')));

  // No SECOND id may exist anywhere in the Android project or the config.
  const searched = ['android/app/build.gradle', 'capacitor.config.ts', 'android/app/src/main/res/values/strings.xml'];
  for (const file of searched) {
    for (const match of read(file).matchAll(/com\.algolon\.[A-Za-z0-9_.]+/g)) {
      assert.equal(match[0], APPLICATION_ID, `${file} names a different application id: ${match[0]}`);
    }
  }
});

// --- Versioning --------------------------------------------------------------

test('versionName and versionCode are derived, never hand-written in gradle', () => {
  // A literal here is how an Android build silently claims a version the web
  // app does not have, or reuses a versionCode Play has already taken.
  assert.ok(!/versionCode\s+\d+/.test(codeOf(gradle)), 'versionCode must not be a literal');
  assert.ok(!/versionName\s+"/.test(codeOf(gradle)), 'versionName must not be a literal');
  assert.match(gradle, /versionCode computedVersionCode/);
  assert.match(gradle, /versionName appVersion/);
  assert.match(gradle, /parseText\(file\('\.\.\/\.\.\/package\.json'\)\.text\)\.version/,
    'the app version comes from package.json');
});

test('the versionCode formula cannot decrease or collide', () => {
  const formula = gradle.match(
    /def computedVersionCode = \(versionMajor \* (\d+)\) \+ \(versionMinor \* (\d+)\) \+ \(versionPatch \* (\d+)\) \+ androidBuild/,
  );
  assert.ok(formula, 'the documented formula is present');
  const [, majorWeight, minorWeight, patchWeight] = formula.map(Number);
  assert.equal(majorWeight, 10000000);
  assert.equal(minorWeight, 100000);
  assert.equal(patchWeight, 1000);

  // Every field must be strictly narrower than its parent's weight, or a high
  // build number would overflow into the next version's range and produce a
  // colliding code. The gradle guards below are what enforce it at build time.
  assert.match(gradle, /versionMinor >= 100/);
  assert.match(gradle, /versionPatch >= 100/);
  assert.match(gradle, /androidBuild >= 1000/);
  assert.match(gradle, /androidBuild < 1/, 'a zero or negative build counter is refused');
  assert.match(gradle, /computedVersionCode < 1 \|\| computedVersionCode > 2100000000/,
    "Play's accepted range is enforced");

  // Monotonicity, checked as arithmetic rather than asserted in prose.
  const code = (major, minor, patch, build) =>
    major * majorWeight + minor * minorWeight + patch * patchWeight + build;
  assert.ok(code(0, 27, 0, 2) > code(0, 27, 0, 1), 'a later build outranks an earlier one');
  assert.ok(code(0, 27, 1, 1) > code(0, 27, 0, 999), 'a patch bump outranks any build of the previous patch');
  assert.ok(code(0, 28, 0, 1) > code(0, 27, 99, 999), 'a minor bump outranks any patch below it');
  assert.ok(code(1, 0, 0, 1) > code(0, 99, 99, 999), 'a major bump outranks everything below it');
  // Play's ceiling is 2_100_000_000. The scheme's widest legal value is a
  // major of 209 fully saturated; anything past that the gradle range guard
  // rejects at build time rather than letting Play refuse the upload.
  assert.ok(code(209, 99, 99, 999) <= 2100000000, 'a saturated major 209 still fits');
  assert.ok(code(210, 0, 0, 1) > 2100000000, 'and beyond that the gradle range guard is what stops it');
});

test('the build counter is a single positive integer with instructions beside it', () => {
  const build = versionProps.match(/^androidBuild=(\d+)$/m);
  assert.ok(build, 'androidBuild is declared exactly once, as a plain integer');
  assert.ok(Number(build[1]) >= 1, 'the counter starts at 1, not 0 — Play versionCodes are positive');
  // The file must tell the next developer both cases, or the counter rots.
  assert.match(versionProps, /increase androidBuild by 1/i);
  assert.match(versionProps, /reset androidBuild to 1/i);
  assert.match(versionProps, /[Nn]ever decrease/);
});

test('the next Play artifact outranks every code Play has already accepted', () => {
  // Recomputed here from the real inputs so the number cannot drift from what
  // Gradle will actually stamp. History: 2700001 (0.27.0 build 1) was
  // uploaded and published to Internal Testing on 2026-08-08 and is burned
  // forever — Play will never accept it again, so the next artifact MUST
  // compute strictly higher. version.properties keeps the append-only list.
  const HIGHEST_CONSUMED_VERSION_CODE = 2700001;
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  const build = Number(versionProps.match(/^androidBuild=(\d+)$/m)[1]);
  const next = major * 10000000 + minor * 100000 + patch * 1000 + build;
  assert.ok(
    next > HIGHEST_CONSUMED_VERSION_CODE,
    `computed versionCode ${next} would not outrank the already-published ${HIGHEST_CONSUMED_VERSION_CODE} — bump androidBuild or the app version`,
  );
  assert.match(versionProps, /2700001/, 'the consumed-code history stays in version.properties');
  // When a code is published, raise HIGHEST_CONSUMED_VERSION_CODE here and
  // append it to the version.properties history — both in the same commit.
});

// --- Signing -----------------------------------------------------------------

test('no signing material of any kind is committed', () => {
  const SIGNING_FILE = /\.(jks|keystore|p12|pepk)$/i;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SIGNING_FILE.test(entry.name)) offenders.push(relative(root, full));
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], 'a keystore in git history is compromised forever');

  // And the ignore rules keep it that way.
  for (const pattern of ['*.jks', '*.keystore', '*.p12', '*.aab', '*.apk', 'keystore.properties']) {
    assert.ok(gitignore.includes(pattern), `.gitignore covers ${pattern}`);
  }
});

test('no password, alias or keystore path is hard-coded', () => {
  // Every signing input must come from the environment. A literal here would
  // be committed, and a committed password is a rotated key.
  for (const field of ['storePassword', 'keyPassword', 'keyAlias', 'storeFile']) {
    const assignment = gradle.match(new RegExp(`${field}\\s+([^\\n]+)`));
    assert.ok(assignment, `${field} is configured`);
    assert.match(
      assignment[1],
      /System\.getenv|file\(uploadKeystorePath\)/,
      `${field} must come from the environment, not a literal`,
    );
  }
  assert.ok(!/password\s*=\s*["']/i.test(codeOf(gradle)), 'no inline password');
});

test('a release build without signing configuration fails loudly', () => {
  // The dangerous outcome is not a failed build — it is a SUCCESSFUL one that
  // emits an unsigned bundle looking finished, which Play then rejects.
  assert.match(gradle, /gradle\.taskGraph\.whenReady/);
  assert.match(gradle, /\(bundle\|assemble\)Release/, 'only release tasks are gated');
  assert.match(gradle, /throw new GradleException\(\s*\n?\s*"Release build requested without upload signing/);
  // …and debug work still needs no secrets at all.
  assert.match(gradle, /def hasUploadKeystore = uploadKeystorePath != null/);
  assert.match(gradle, /if \(hasUploadKeystore\) \{\s*\n\s*signingConfig signingConfigs\.release/);
});

test('release build settings are not weakened and carry no debug configuration', () => {
  const release = gradle.match(/release \{[\s\S]*?proguardFiles[^\n]*\n/)?.[0];
  assert.ok(release, 'the release build type is configured');
  assert.match(release, /minifyEnabled false/, "Capacitor's shipped default is preserved");
  assert.match(release, /proguardFiles getDefaultProguardFile\('proguard-android\.txt'\), 'proguard-rules\.pro'/);
  // debuggable must never be turned on for release: Capacitor derives
  // webContentsDebuggingEnabled and loggingEnabled from FLAG_DEBUGGABLE, so
  // setting it would re-enable remote WebView inspection on a Play build.
  assert.ok(!/debuggable\s+true/.test(codeOf(gradle)), 'release must not be debuggable');
  assert.ok(
    !/webContentsDebuggingEnabled/.test(codeOf(capConfig)),
    'leave WebView debugging to Capacitor’s FLAG_DEBUGGABLE default',
  );
});

// --- Release workflow --------------------------------------------------------

test('the release workflow builds only — it never publishes', () => {
  const yaml = codeOf(workflow);
  assert.ok(!/androidpublisher|play-?store|Gradle-Play|r0adkll|upload-google-play/i.test(yaml),
    'no Google Play Developer API automation in this iteration');
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  const permissions = yaml.split('permissions:')[1]?.split(/\n\s*\n/)[0] ?? '';
  assert.ok(!/pages/.test(permissions), 'no pages permission');
  assert.ok(!/id-token/.test(permissions), 'no id-token permission');
  assert.match(workflow, /^\s{2}workflow_dispatch:/m, 'manual dispatch is always available');

  // A push trigger on a release workflow is normally wrong — an unattended
  // release build is not something you want firing on every commit. Exactly
  // one exception is permitted, and only while it is scaffolding: a
  // BRANCH-SCOPED trigger on the release-setup branch, which exists solely
  // because GitHub refuses to dispatch a workflow that is not yet on the
  // default branch. If it is present it must be narrow and labelled
  // temporary; a broad or unlabelled push trigger fails here.
  const pushTrigger = workflow.match(/^\s{2}push:\n((?:\s{4}.*\n)+)/m);
  if (pushTrigger) {
    const branches = pushTrigger[1].match(/branches:\s*\[([^\]]+)\]/);
    assert.ok(branches, 'a push trigger must name its branches — never repo-wide');
    const named = branches[1].split(',').map((b) => b.trim());
    assert.deepEqual(named, ['agent/android-play-internal'],
      'the only permitted push trigger is the temporary release-setup branch');
    assert.match(workflow, /TEMPORARY — REMOVE BEFORE MERGE/,
      'the temporary trigger must say so, or it becomes permanent by neglect');
  }
});

test('the release workflow runs the same regression gates before signing', () => {
  for (const step of ['npm ci', 'npm test', 'npm run typecheck', 'npm run build', 'npm run build:native', 'npm run verify:native', 'npx cap sync android', 'bundleRelease']) {
    assert.ok(workflow.includes(step), `the release workflow runs ${step}`);
  }
  // Order matters: the web gates precede the native artifact.
  assert.ok(workflow.indexOf('npm test') < workflow.indexOf('bundleRelease'));
  assert.ok(workflow.indexOf('npm run build\n') < workflow.indexOf('npm run build:native'));
});

test('secrets are consumed without ever being printed', () => {
  for (const secret of [
    'ANDROID_UPLOAD_KEYSTORE_BASE64',
    'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
    'ANDROID_UPLOAD_KEY_ALIAS',
    'ANDROID_UPLOAD_KEY_PASSWORD',
  ]) {
    assert.ok(workflow.includes(`secrets.${secret}`), `${secret} is wired`);
  }
  // No `echo`/`cat` of a secret-bearing variable anywhere.
  const dangerous = /(echo|printf|cat)[^\n]*\$\{?\{?\s*secrets\./;
  assert.ok(!dangerous.test(workflow), 'a secret must never be echoed');
  assert.ok(!/echo[^\n]*\$KEYSTORE_B64|cat[^\n]*keystore\.jks/.test(workflow), 'the keystore is never dumped');
  // Reconstructed outside the workspace so it cannot be swept into an artifact.
  assert.match(workflow, /RUNNER_TEMP\/upload-keystore\.jks/);
  assert.match(workflow, /umask 077/);
});

test('the signing material is destroyed even when the build fails', () => {
  const cleanup = workflow.match(/- name: Destroy the temporary signing material[\s\S]*$/)?.[0];
  assert.ok(cleanup, 'a cleanup step exists');
  assert.match(cleanup, /if: always\(\)/, 'it must run on failure too');
  assert.match(cleanup, /shred -u/);
});

test('the bundle is verified as release-signed, not merely built', () => {
  const verify = workflow.match(/- name: Verify the bundle is release-signed[\s\S]*?- name:/)?.[0];
  assert.ok(verify, 'a verification step exists');
  assert.match(verify, /jarsigner -verify/, 'the signature is actually checked');
  assert.match(verify, /jar verified/);
  assert.match(verify, /signer does not match the configured upload key/, 'the signer identity is checked');
  assert.match(verify, /CN=Android Debug/, 'a debug-signed bundle is rejected');
  // The packaged manifest is PROTOBUF: it must be read with bundletool, never
  // a printable-string heuristic — `strings | grep` failed in CI with the id
  // present. The tool itself is pinned and checksum-verified before use.
  assert.match(verify, /bundletool\.jar"? dump manifest/, 'the manifest check is protobuf-aware');
  // codeOf: the comments deliberately NAME the retired heuristic; only real
  // code may not use it.
  assert.ok(!/strings\s*\|/.test(codeOf(verify)), 'no strings-based manifest heuristic');
  assert.match(verify, /--xpath=\/manifest\/@package/, 'the package is resolved, not pattern-matched');
  assert.match(verify, /EXPECTED_VERSION_NAME/, 'the packaged versionName is cross-checked');
  assert.match(verify, /EXPECTED_VERSION_CODE/, 'the packaged versionCode is cross-checked');
  const fetchStep = workflow.match(/- name: Fetch bundletool[\s\S]*?- name:/)?.[0] ?? '';
  assert.match(fetchStep, /bundletool-all-1\.18\.3\.jar/, 'bundletool is version-pinned');
  assert.match(fetchStep, /a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29/,
    'and checksum-verified before it is executed');
  assert.match(fetchStep, /sha256sum -c/, 'the checksum is actually enforced');
  assert.match(verify, /a keystore is present INSIDE the bundle/, 'the artifact is checked for stray key material');
});

test('only the bundle is published as an artifact', () => {
  assert.match(workflow, /name: fjallkompis-android-internal-release/);
  assert.match(workflow, /path: artifact\/\*\.aab/);
  assert.match(workflow, /if-no-files-found: error/);
  // Job summary carries the identity a Play upload needs.
  for (const field of ['Application id', 'versionName', 'versionCode']) {
    assert.ok(workflow.includes(field), `the summary records ${field}`);
  }
});

test('the debug APK workflow is untouched and still independent', () => {
  // Development must keep working without any signing secret.
  assert.match(debugWorkflow, /name: fjallkompis-android-spike-debug/);
  assert.match(debugWorkflow, /assembleDebug/);
  assert.ok(!/ANDROID_UPLOAD/.test(debugWorkflow), 'the debug job needs no signing secrets');
  assert.notEqual(
    workflow.match(/group: ([^\n]+)/)[1],
    debugWorkflow.match(/group: ([^\n]+)/)[1],
    'the two workflows must not share a concurrency group',
  );
});

// --- The wrapper behaviour this release must not regress ---------------------

test('the established wrapper behaviour is carried into the release build', () => {
  // These are the physically-validated behaviours from PR #120. The release
  // build must ship the same shell, not a reconfigured one.
  const activity = read('android/app/src/main/java/com/algolon/fjallkompis/MainActivity.java');
  assert.match(activity, /setKeepOnScreenCondition/, 'splash held until React readiness');
  assert.match(activity, /setNavigationBarContrastEnforced\(false\)/, 'three-button navigation fix');
  assert.match(activity, /R\.color\.fjallkompisTabbar/, 'navigation protection surface');
  assert.match(activity, /setTextZoom\(100\)/, 'typography parity guard');
  assert.match(activity, /EdgeToEdge\.enable\(this\)/);
  assert.ok(existsSync(join(root, 'android/app/src/main/java/com/algolon/fjallkompis/BootPlugin.java')));

  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const declared = [...manifest.matchAll(/uses-permission android:name="android\.permission\.([A-Z_]+)"/g)]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(declared, ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'INTERNET'],
    'the release adds no permission');
  assert.match(manifest, /android:allowBackup="false"/);
});

test('no Google services or Firebase dependency was introduced', () => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const forbidden of Object.keys(deps)) {
    assert.ok(!/firebase|google-services|gms/i.test(forbidden), `unexpected dependency ${forbidden}`);
  }
  // Capacitor's template leaves a conditional google-services hook that only
  // fires if a google-services.json is added. It must stay unused.
  assert.ok(!existsSync(join(root, 'android/app/google-services.json')));
});

test('the bundled vector basemap still ships with the app', () => {
  const basemap = join(root, 'public/maps/kungsleden.pmtiles');
  assert.ok(existsSync(basemap), 'the offline basemap is present for the release build');
  assert.ok(statSync(basemap).size > 1_000_000, 'and it is the real archive, not a placeholder');
});
