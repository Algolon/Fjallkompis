/**
 * Android wrapper spike — containment fences.
 *
 * The wrapper is an ADDITIONAL delivery target for the same application, not
 * a fork of it. These tests exist to catch the three ways that claim could
 * quietly stop being true:
 *
 *   1. the web/Pages build drifting (base path, service worker, install UI);
 *   2. native-only CSS leaking into the browser and the installed PWA;
 *   3. the native shell growing capabilities the spike promised not to add
 *      (background location, notifications, cloud backup, extra plugins).
 *
 * Structural checks against the real files, in the established style of this
 * suite: the built-output equivalents (relative base actually applied, no
 * worker actually emitted) are enforced separately by
 * scripts/verify-native-build.mjs, which runs on every native build and in CI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const vite = read('vite.config.ts');
const capConfig = read('capacitor.config.ts');
const platform = read('src/runtime/platform.ts');
const app = read('src/App.tsx');
const main = read('src/main.tsx');
const css = read('src/styles/global.css');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const activity = read('android/app/src/main/java/com/algolon/fjallkompis/MainActivity.java');
const colors = read('android/app/src/main/res/values/colors.xml');
const pkg = JSON.parse(read('package.json'));

const NATIVE_SCOPE = "html[data-runtime='native-android']";

/**
 * Comments are documentation, not behaviour. Several checks below assert that
 * a symbol is ABSENT from a file — and these files deliberately name the very
 * things they refuse to do (the manifest lists the permissions it will not
 * request; the adapter explains which hashes it declines to reason about).
 * Strip comments first so prose can never fail a behavioural assertion, and
 * so it can never mask one either.
 */
const codeOf = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*(\/\/|\*).*$/gm, '');

// --- B. Web and native builds are separate ---------------------------------

test('the web build still serves from the GitHub Pages project subpath', () => {
  assert.match(
    vite,
    /base:\s*mode === 'native' \? '\/' : '\/Fjallkompis\/'/,
    'the default (Pages) base must remain /Fjallkompis/',
  );
});

test('the native build uses its own base, and it is root-absolute', () => {
  // Capacitor always serves the app from the ROOT of https://localhost, so
  // '/' is correct there and a '/Fjallkompis/' prefix is a blank screen.
  //
  // A relative './' base is NOT an equivalent safer choice, and this
  // assertion exists to stop someone "tidying" it into one. It was tried and
  // it broke the three contour backdrops: those screens pass their URL
  // through a CSS custom property, and a relative url() in a custom property
  // resolves against the stylesheet that substitutes it — /assets/index-*.css
  // — so './images/today/contours.svg' was requested as
  // '/assets/images/today/contours.svg' and 404'd.
  assert.match(vite, /mode === 'native' \? '\/'/);
  assert.ok(!/mode === 'native' \? '\.\//.test(vite), 'the native base must not be relative');
});

test('both builds are reachable through explicit, separate npm scripts', () => {
  assert.equal(
    pkg.scripts.build,
    'npm run check:version && npm run generate && tsc -b && vite build',
    'the Pages build command must not change',
  );
  assert.match(pkg.scripts['build:native'], /vite build --mode native$/);
  // The same version + route + experience generation steps run for both, so
  // the native bundle can never ship different trail content.
  for (const script of [pkg.scripts.build, pkg.scripts['build:native']]) {
    assert.match(script, /check:version/);
    assert.match(script, /npm run generate/);
    assert.match(script, /tsc -b/);
  }
  assert.match(pkg.scripts['cap:sync:android'], /verify:native/, 'sync must be gated on verification');
  assert.ok(pkg.scripts['android:open'], 'android:open script exists');
  assert.ok(pkg.scripts['android:assemble'], 'android:assemble script exists');
});

test('the PWA plugin runs for the web build and never for the native build', () => {
  assert.match(vite, /mode === 'native' \? \[\] : \[VitePWA\(\{/, 'VitePWA is web-only');
  assert.match(vite, /mode === 'native' \? \[inertPwaRegister\(\), nativeBuildMarker\(\)\] : \[\]/);
  // The web manifest, its theme colours and the precache sweep are untouched.
  assert.match(vite, /theme_color: '#2f4a3d'/);
  assert.match(vite, /background_color: '#dce4d8'/);
  assert.match(vite, /scope: '\/Fjallkompis\/'/);
  assert.match(vite, /start_url: '\/Fjallkompis\/'/);
  assert.match(vite, /registerType: 'prompt'/);
  assert.match(vite, /globPatterns:/);
});

test('the native build resolves the PWA registration module to an inert stub', () => {
  // PwaLifecycle imports 'virtual:pwa-register/react' statically and there is
  // no VitePWA plugin in native mode to provide it. The stub is what keeps
  // the component compiling without giving the native bundle any way to
  // register a worker.
  assert.match(vite, /const PWA_REGISTER_ID = 'virtual:pwa-register\/react'/);
  assert.match(vite, /function inertPwaRegister\(\): Plugin/);
  assert.match(vite, /updateServiceWorker: async \(\) => \{\}/);
  assert.ok(
    !/navigator\s*\.\s*serviceWorker/.test(vite.split('function inertPwaRegister')[1] ?? ''),
    'the stub must not touch navigator.serviceWorker',
  );
});

// --- B / F. PWA lifecycle stays a web-only surface --------------------------

test('PwaLifecycle still exists and is still the single web registration path', () => {
  const lifecycle = read('src/components/PwaLifecycle.tsx');
  assert.match(lifecycle, /useRegisterSW/, 'the web/PWA lifecycle component is untouched');
  assert.match(lifecycle, /Install Fjällkompis on this device\?/);
  assert.match(lifecycle, /A new version of Fjällkompis is available\./);
  assert.match(lifecycle, /Fjällkompis is ready for offline use\./);
  assert.match(app, /import \{ PwaLifecycle \}/, 'App still imports it for web/PWA');
});

test('PwaLifecycle is not mounted in the native runtime', () => {
  assert.match(
    app,
    /\{isNativeAndroid\(\) \? null : <PwaLifecycle \/>\}/,
    'the native shell must render no PWA lifecycle UI at all',
  );
});

test('the native runtime has no path to an install, offline-ready or update prompt', () => {
  // All three toasts live in the one component above, and that component is
  // the only consumer of the registration hook — so not mounting it is the
  // whole mechanism. Guard that no OTHER module grew its own copy.
  const sources = [app, main, platform];
  for (const source of sources) {
    assert.ok(!/useRegisterSW|beforeinstallprompt/.test(codeOf(source)));
  }
  assert.match(read('src/hooks/useInstallPrompt.ts'), /beforeinstallprompt/);
  assert.equal(
    app.match(/<PwaLifecycle \/>/g)?.length,
    1,
    'exactly one PwaLifecycle mount site, and it is the guarded one',
  );
});

// --- C. One narrow platform adapter ----------------------------------------

test('the adapter exposes only the spike surface, and detects without sniffing', () => {
  for (const symbol of [
    'export function getRuntime',
    'export function isNativeAndroid',
    'export function markRuntimeOnDocument',
    'export async function initializeNativeShell',
    'export function subscribeAndroidBackButton',
  ]) {
    assert.ok(platform.includes(symbol), `platform.ts exports ${symbol}`);
  }
  assert.match(platform, /Capacitor\.isNativePlatform\(\)/);
  assert.match(platform, /Capacitor\.getPlatform\(\) === 'android'/);
  assert.ok(
    !/navigator\.userAgent|userAgentData/.test(codeOf(platform)),
    'detection must never read the user agent',
  );
});

test('platform knowledge stays in the adapter — screens and stores never ask', () => {
  // The spike's architectural boundary: no scattered `if (android)`. The
  // shell calls into the adapter at exactly three points, and nowhere else in
  // the app calls it at all.
  assert.equal((codeOf(app).match(/isNativeAndroid\(\)/g) ?? []).length, 1);
  assert.equal((codeOf(app).match(/subscribeAndroidBackButton\(\)/g) ?? []).length, 1);
  assert.equal((codeOf(main).match(/markRuntimeOnDocument\(\)/g) ?? []).length, 1);
  assert.equal((codeOf(main).match(/initializeNativeShell\(\)/g) ?? []).length, 1);

  const callers = readdirSync(join(root, 'src'), { recursive: true })
    .filter((f) => typeof f === 'string' && /\.(tsx?|mjs)$/.test(f))
    .filter((f) => !f.startsWith('runtime/'))
    .filter((f) => /from '\.{1,2}\/(\.\.\/)*runtime\/platform'/.test(read(join('src', f))));
  assert.deepEqual(
    callers.sort(),
    ['App.tsx', 'main.tsx'],
    'only the app shell may import the platform adapter',
  );
  assert.ok(
    !/Capacitor|@capacitor/.test(read('src/store/AppStore.tsx')),
    'the store must not import Capacitor',
  );
});

test('the runtime marker is stamped before the first render', () => {
  const markIndex = main.indexOf('markRuntimeOnDocument()');
  const renderIndex = main.indexOf('createRoot(');
  assert.ok(markIndex > 0 && renderIndex > markIndex, 'marker is set above createRoot');
  assert.match(platform, /document\.documentElement\.dataset\.runtime = getRuntime\(\)/);
});

// --- D. Insets and system bars ---------------------------------------------

test('every native style rule is scoped to the native runtime marker', () => {
  const start = css.indexOf('Native Android shell (Capacitor)');
  assert.ok(start > 0, 'the native section exists');
  const section = css.slice(start);
  // Each selector block in the section must carry the scope. Comments are
  // stripped first so prose about the marker cannot mask a missing one.
  const selectors = section
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((block) => block.split('{')[0].trim())
    .filter(Boolean);
  assert.ok(selectors.length > 0, 'the section declares at least one rule');
  for (const selector of selectors) {
    assert.ok(
      selector.includes(NATIVE_SCOPE),
      `native rule "${selector}" is not scoped to ${NATIVE_SCOPE} — it would leak into the browser and the installed PWA`,
    );
  }
});

test('the shared inset variables keep their env() behaviour for web and PWA', () => {
  // Unscoped :root must still be pure env(), so nothing about browser or
  // installed-PWA geometry changes because the wrapper exists.
  assert.match(css, /--safe-bottom: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(css, /--safe-top: env\(safe-area-inset-top, 0px\);/);
});

test('the native runtime re-points those variables at Capacitor’s injected insets', () => {
  for (const side of ['top', 'bottom', 'left', 'right']) {
    assert.match(
      css,
      new RegExp(`--safe-${side}: var\\(--safe-area-inset-${side}, env\\(safe-area-inset-${side}, 0px\\)\\)`),
      `--safe-${side} falls back through Capacitor's variable to env()`,
    );
  }
  assert.match(capConfig, /insetsHandling: 'css'/, 'the plugin must be asked to inject them');
});

test('safe-area padding is never applied to the whole document', () => {
  const start = css.indexOf('Native Android shell (Capacitor)');
  const section = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !/html\[data-runtime='native-android'\]\s*\{[^}]*padding/s.test(section),
    'padding the root would pull the tab bar away from the screen edge',
  );
});

test('the bottom tab bar keeps ONE surface that reaches the screen edge', () => {
  // No second backdrop element, no duplicated near-match colour: the bar's
  // own background already spans the inset because its height includes it.
  assert.match(css, /height: calc\(var\(--tabbar-h\) \+ var\(--safe-bottom\)\);/);
  assert.match(css, /padding-bottom: var\(--safe-bottom\);/);
  const start = css.indexOf('Native Android shell (Capacitor)');
  const section = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    !/background:\s*rgba\(212, 222, 209/.test(section),
    'the tab-bar colour must not be restated in the native section',
  );
});

test('the status-bar backdrop is the brand spruce and takes no taps', () => {
  const band = css.match(/html\[data-runtime='native-android'\] \.app::before \{[^}]*\}/s)?.[0];
  assert.ok(band, 'the native status-bar band exists');
  assert.match(band, /height: var\(--safe-top\)/);
  assert.match(band, /background: var\(--spruce\)/);
  assert.match(band, /pointer-events: none/);
  assert.match(css, /--spruce: #2f4a3d;/, 'the token still resolves to the brand spruce');
});

test('the two system bars are styled independently for their own surfaces', () => {
  assert.match(platform, /SystemBarsStyle\.Dark,\s*bar: SystemBarType\.StatusBar/s);
  assert.match(platform, /SystemBarsStyle\.Light,\s*bar: SystemBarType\.NavigationBar/s);
});

test('MainActivity enables edge-to-edge through AndroidX and drops the 3-button scrim', () => {
  assert.match(activity, /import androidx\.activity\.EdgeToEdge;/);
  const enableIndex = activity.indexOf('EdgeToEdge.enable(this)');
  const superIndex = activity.indexOf('super.onCreate(savedInstanceState)');
  assert.ok(enableIndex > 0 && superIndex > enableIndex, 'edge-to-edge is enabled before setContentView');
  assert.match(activity, /setNavigationBarContrastEnforced\(false\)/);
  assert.match(activity, /Build\.VERSION_CODES\.Q/, 'guarded for API 29+');
  // Deprecated colour APIs and immersive mode are explicitly not used.
  assert.ok(!/setStatusBarColor|setNavigationBarColor/.test(codeOf(activity)));
  assert.ok(!/hide\(|IMMERSIVE|setSystemUiVisibility/.test(codeOf(activity)));
  assert.match(capConfig, /hidden: false/, 'system bars stay visible');
});

// --- E. Android Back --------------------------------------------------------

test('Android Back drives the existing hash history and minimizes at the root', () => {
  assert.match(platform, /App\.addListener\('backButton'/);
  assert.match(platform, /window\.history\.back\(\)/, 'delegates to the app’s own history');
  assert.match(platform, /App\.minimizeApp\(\)/, 'root-of-task minimizes, never force-kills');
  assert.ok(!/App\.exitApp\(\)/.test(platform), 'exitApp would discard in-progress state');
  assert.match(app, /useEffect\(\(\) => subscribeAndroidBackButton\(\), \[\]\)/);
  // No parallel route table: the adapter must not know about tabs or sections.
  assert.ok(
    !/#\/guide|#\/plan|TAB_ROUTES|destinationForHash/.test(codeOf(platform)),
    'the adapter must not reimplement navigation',
  );
});

// --- G / I. Storage, permissions and scope ----------------------------------

test('no schema, storage key or export format was changed for the wrapper', () => {
  assert.match(read('src/utils/storage.ts'), /export const STORAGE_KEY = 'fjallkompis:state';/);
  assert.match(read('src/wallet/walletStore.mjs'), /export const WALLET_DB_NAME = 'fjallkompis-wallet';/);
  assert.match(read('src/wallet/walletStore.mjs'), /export const WALLET_DB_VERSION = 1;/);
  const exportImport = read('src/utils/exportImport.ts');
  assert.match(exportImport, /app: 'fjallkompis',\s*schemaVersion: SCHEMA_VERSION,/s);
  for (const source of [platform, main, app]) {
    assert.ok(
      !/localStorage|indexedDB|STORAGE_KEY/.test(codeOf(source)),
      'the wrapper must not touch persisted data',
    );
  }
});

test('the manifest declares foreground location only, and nothing else', () => {
  const declared = [...manifest.matchAll(/uses-permission android:name="android\.permission\.([A-Z_]+)"/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    declared.sort(),
    ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'INTERNET'],
    'exactly the permissions the existing foreground geolocation needs',
  );
  for (const forbidden of [
    'ACCESS_BACKGROUND_LOCATION',
    'FOREGROUND_SERVICE',
    'POST_NOTIFICATIONS',
    'CAMERA',
    'RECORD_AUDIO',
    'READ_CONTACTS',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
  ]) {
    assert.ok(!codeOf(manifest).includes(forbidden), `${forbidden} must not be requested`);
  }
  assert.ok(!/<service/.test(codeOf(manifest)), 'no background service');
});

test('app data is never copied off the device by the platform', () => {
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  const rules = read('android/app/src/main/res/xml/data_extraction_rules.xml');
  for (const channel of ['cloud-backup', 'device-transfer']) {
    assert.match(rules, new RegExp(`<${channel}>[\\s\\S]*?<exclude domain="database"[\\s\\S]*?</${channel}>`));
  }
});

test('the spike stays Android-only with the minimum plugin set', () => {
  assert.deepEqual(
    Object.keys(pkg.dependencies).filter((d) => d.startsWith('@capacitor/')).sort(),
    ['@capacitor/app', '@capacitor/core'],
  );
  assert.deepEqual(
    Object.keys(pkg.devDependencies).filter((d) => d.startsWith('@capacitor/')).sort(),
    ['@capacitor/android', '@capacitor/cli'],
  );
  // Exact versions, no ranges — the lockfile is not the only pin.
  for (const spec of ['@capacitor/core', '@capacitor/app', '@capacitor/android', '@capacitor/cli']) {
    const version = pkg.dependencies[spec] ?? pkg.devDependencies[spec];
    assert.match(version, /^\d+\.\d+\.\d+$/, `${spec} is pinned exactly (${version})`);
  }
  assert.ok(!existsSync(join(root, 'ios')), 'iOS is out of scope for this spike');
  assert.ok(!/@capacitor\/ios|'ios'/.test(codeOf(capConfig)));
  // No obsolete system-bar plugin alongside the built-in SystemBars API.
  assert.ok(!('@capacitor/status-bar' in { ...pkg.dependencies, ...pkg.devDependencies }));
  assert.match(platform, /from '@capacitor\/core'/, 'SystemBars comes from core');
});

// --- J. Identity ------------------------------------------------------------

test('native colours are quoted from existing owned tokens, not invented', () => {
  assert.match(colors, /<color name="fjallkompisLaunch">#dce4d8<\/color>/);
  assert.match(colors, /<color name="fjallkompisSpruce">#2f4a3d<\/color>/);
  // The same two values the web layer already ships.
  assert.match(vite, /background_color: '#dce4d8'/);
  assert.match(read('index.html'), /<meta name="theme-color" content="#2f4a3d" \/>/);
  // The adapter deliberately holds no colour of its own: the status-bar band
  // is painted from the --spruce token in CSS, so there is no second literal
  // that could drift from the web one.
  assert.ok(!/#[0-9a-fA-F]{6}/.test(codeOf(platform)), 'no colour literals in the adapter');
});

test('the launcher icon and splash reuse the existing app artwork', () => {
  const mark = 'android/app/src/main/res/drawable-nodpi/fjallkompis_mark.png';
  assert.ok(existsSync(join(root, mark)), 'the shared mark exists');
  assert.deepEqual(
    readFileSync(join(root, mark)),
    readFileSync(join(root, 'public/icons/icon-512.png')),
    'the native mark is byte-identical to the web icon — the logo is not redesigned',
  );
  const foreground = read('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
  assert.match(foreground, /@drawable\/fjallkompis_mark/);
  assert.match(foreground, /android:inset="16%"/, 'content stays inside the adaptive safe zone');
  const splash = read('android/app/src/main/res/drawable/fjallkompis_splash.xml');
  assert.match(splash, /@color\/fjallkompisLaunch/);
  assert.match(splash, /@drawable\/fjallkompis_mark/);
  assert.ok(
    !existsSync(join(root, 'android/app/src/main/res/drawable/splash.png')),
    'Capacitor’s default splash artwork is gone',
  );
});

test('the application id is the documented provisional one', () => {
  assert.match(capConfig, /appId: 'com\.algolon\.fjallkompis'/);
  assert.match(capConfig, /PROVISIONAL/, 'the identity caveat stays next to the id');
  assert.match(read('android/app/build.gradle'), /applicationId "com\.algolon\.fjallkompis"/);
  assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">Fjällkompis<\/string>/);
});

// --- K. Build artefacts stay out of git -------------------------------------

test('Android build outputs, keystores and local config are never committed', () => {
  const ignore = read('android/.gitignore');
  for (const pattern of ['*.apk', '*.aab', 'build/', 'local.properties', '.idea/', 'captures/']) {
    assert.ok(ignore.includes(pattern), `android/.gitignore covers ${pattern}`);
  }
  assert.match(ignore, /app\/src\/main\/assets\/public/, 'the copied web build is not committed');
  assert.match(ignore, /capacitor\.config\.json/, 'the generated config is not committed');
  const rootIgnore = read('.gitignore');
  assert.match(rootIgnore, /\*\.keystore/);
  assert.match(rootIgnore, /\*\.jks/);
});
