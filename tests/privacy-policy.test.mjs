/**
 * PRIVACY + GOOGLE PLAY READINESS — source-tree fences.
 *
 * Two separate claims are defended here, and they fail for different reasons:
 *
 *   1. THE URL CONTRACT. Google Play is given ONE public privacy-policy URL.
 *      If the page moves, the base changes, or the in-app link drifts from the
 *      constant, the Play listing silently points at a 404 — and nothing in
 *      the app breaks to tell us. The URL is therefore re-derived here from
 *      vite.config.ts's `base` and the page's real location under public/,
 *      rather than compared against a second copy of the same string.
 *
 *   2. THE STANDING PRIVACY CLAIMS. The policy states, in public, that
 *      Fjallkompis has no analytics, sends nothing anywhere, and asks for no
 *      background location. Those are assertions about the CODE, and they stop
 *      being true the moment someone adds a dependency or a fetch. These tests
 *      are what makes the policy a maintained claim instead of a snapshot of
 *      one afternoon's audit — the fence is deliberately placed where the
 *      breach would happen, not where the prose lives.
 *
 * Evidence and interpretation for the Play Data safety form live in
 * docs/operations/ — this file only proves what the tree does.
 *
 * SCOPE NOTE. The BUILT artefact is checked separately by
 * scripts/verify-privacy-build.mjs (wired into CI after `npm run build`),
 * because Vite and vite-plugin-pwa sit between this source tree and what a
 * reader actually receives.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import {
  PRIVACY_CONTACT_LABEL,
  PRIVACY_CONTACT_URL,
  PRIVACY_POLICY_UPDATED,
  PRIVACY_POLICY_URL,
} from '../src/privacy/privacyPolicy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const POLICY_PAGE = 'public/privacy/index.html';
const page = read(POLICY_PAGE);
const vite = read('vite.config.ts');
const settings = read('src/screens/SettingsScreen.tsx');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');

/** Every file under a directory, repo-relative. */
function walk(dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((entry) => {
    const rel = `${dir}/${entry}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

// ---------------------------------------------------------------------------
// 1. The canonical URL — derived, not restated
// ---------------------------------------------------------------------------

test('the canonical privacy URL is the page\'s real location under the Pages base', () => {
  // The GitHub Pages project subpath, read from the build config that owns it.
  const base = vite.match(/base:\s*mode === 'native'\s*\?\s*'\/'\s*:\s*'([^']+)'/)?.[1];
  assert.ok(base, 'could not read the web `base` from vite.config.ts');

  // public/ is copied to the root of the build, so public/privacy/index.html
  // is served at <base>privacy/ — index.html being the directory index.
  const servedPath = `${base}${relative('public', POLICY_PAGE).replace(/index\.html$/, '')}`;
  const expected = `https://algolon.github.io${servedPath}`;

  assert.equal(
    PRIVACY_POLICY_URL,
    expected,
    'the canonical privacy URL no longer matches where the page is actually served',
  );
});

test('the canonical privacy URL is absolute, https and ends in a slash', () => {
  // Absolute because the Android WebView serves the app from https://localhost/,
  // where a relative link would resolve to a page that is not in the APK.
  const url = new URL(PRIVACY_POLICY_URL);
  assert.equal(url.protocol, 'https:');
  assert.ok(
    PRIVACY_POLICY_URL.endsWith('/'),
    'a directory URL without its trailing slash costs a redirect and reads as a broken link in Play Console',
  );
});

test('the shared URL constant is the ONE source both targets read', () => {
  // Exactly one literal of this URL in src/ — the constant itself. A second
  // copy anywhere is how the PWA and the APK start pointing at different pages.
  const literals = walk('src').filter(
    (f) => f !== 'src/privacy/privacyPolicy.mjs' && read(f).includes(PRIVACY_POLICY_URL),
  );
  assert.deepEqual(
    literals,
    [],
    'the canonical privacy URL is hard-coded outside src/privacy/privacyPolicy.mjs',
  );
});

test('the policy page survives the native-build gate', () => {
  // public/ is copied verbatim into BOTH builds, comments and all, and
  // verify-native-build.mjs scans every text file in dist/. A root-absolute
  // Pages subpath anywhere in this page — even in a comment explaining why it
  // is avoided — makes `cap sync android` refuse the bundle. Caught exactly
  // this way once; fenced so it cannot come back.
  const ABSOLUTE_PAGES_BASE = /(^|["'`(,;=\s])\/Fjallkompis\//;
  assert.equal(
    ABSOLUTE_PAGES_BASE.test(page),
    false,
    'the policy page contains a root-absolute /Fjallkompis/ — `cap sync android` will refuse the bundle',
  );
});

test('the canonical URL survives the native-build gate', () => {
  // scripts/verify-native-build.mjs refuses a bundle containing a ROOT-ABSOLUTE
  // '/Fjallkompis/'. The canonical URL contains that subpath legitimately,
  // inside an absolute URL — this asserts it is still the exempt shape, so the
  // Android sync cannot start failing on the privacy constant.
  const ABSOLUTE_PAGES_BASE = /(^|["'`(,;=\s])\/Fjallkompis\//;
  assert.equal(
    ABSOLUTE_PAGES_BASE.test(read('src/privacy/privacyPolicy.mjs')),
    false,
    'the privacy module now contains a root-absolute /Fjallkompis/ — `cap sync android` will refuse the bundle',
  );
});

// ---------------------------------------------------------------------------
// 2. The public page
// ---------------------------------------------------------------------------

test('the policy page renders without the application', () => {
  assert.equal(/<script/i.test(page), false, 'the policy page must not depend on JavaScript');
  // No bundler entry, no React root: it is copied verbatim from public/.
  assert.equal(page.includes('id="root"'), false);
  assert.equal(page.includes('/src/main.tsx'), false);
});

test('the policy page declares the canonical URL and the contact route', () => {
  assert.ok(page.includes(`<link rel="canonical" href="${PRIVACY_POLICY_URL}"`));
  assert.ok(page.includes(PRIVACY_CONTACT_URL), 'the page carries no privacy contact route');
  assert.ok(page.includes(PRIVACY_CONTACT_LABEL), 'the contact label drifted from the shared constant');
});

test('the canonical privacy contact is a reachable mailbox', () => {
  // PINNED MECHANISM, not just a string. Play's Data safety flow asks for a
  // privacy contact and reviewers expect a mailbox; a privacy question should
  // also not require a GitHub account or become a public issue. So the contact
  // must stay a mailto:, and the visible label must be the address itself
  // rather than prose a reader has to decode.
  assert.match(PRIVACY_CONTACT_URL, /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/, 'the privacy contact is not a mailto: address');
  assert.equal(
    PRIVACY_CONTACT_LABEL,
    PRIVACY_CONTACT_URL.slice('mailto:'.length),
    'the visible contact label is not the mailto address itself',
  );
  // And it is what the Contact section actually offers.
  const contact = page.slice(page.indexOf('<h2>Contact</h2>'));
  assert.ok(
    contact.includes(`href="${PRIVACY_CONTACT_URL}"`),
    'the Contact section does not offer the canonical mailbox',
  );
  // The issue tracker may still appear as a general project route, but never
  // as the privacy contact — it must not be the first link under Contact.
  const firstHref = contact.match(/href="([^"]+)"/)?.[1];
  assert.equal(
    firstHref,
    PRIVACY_CONTACT_URL,
    'something other than the canonical mailbox leads the Contact section',
  );
});

test('the policy page prints the shared last-updated date', () => {
  // Same date in both places or the reader is told one thing and the tree
  // records another. Written out because a policy page reads as prose.
  const [y, m, d] = PRIVACY_POLICY_UPDATED.split('-').map(Number);
  const month = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][m - 1];
  assert.ok(
    page.includes(`Last updated: ${d} ${month} ${y}`),
    `the page's last-updated line does not match PRIVACY_POLICY_UPDATED (${PRIVACY_POLICY_UPDATED})`,
  );
});

test('the policy page loads nothing from a third party', () => {
  // The page that promises no third-party contact must make none itself.
  // Anchors the READER may follow are not resources the page loads.
  const loaded = [...page.matchAll(/<link[^>]+href="([^"]+)"|<img[^>]+src="([^"]+)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((href) => /^https?:|^\/\//.test(href))
    .filter((href) => href !== PRIVACY_POLICY_URL); // rel=canonical is a declaration, not a fetch
  assert.deepEqual(loaded, [], 'the policy page references an off-origin resource');
});

test('the policy page works under the Pages subpath', () => {
  // Served from /Fjallkompis/privacy/, so a root-absolute asset path 404s.
  const assets = [...page.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(assets, [], 'root-absolute asset paths do not resolve under the Pages project subpath');
});

// ---------------------------------------------------------------------------
// 3. In-app access
// ---------------------------------------------------------------------------

test('Settings exposes the privacy policy', () => {
  assert.ok(
    settings.includes("import { PRIVACY_POLICY_URL } from '../privacy/privacyPolicy.mjs'"),
    'Settings does not read the canonical privacy URL from its single source',
  );
  assert.ok(settings.includes('href={PRIVACY_POLICY_URL}'), 'Settings has no link to the privacy policy');
  assert.ok(/title="Privacy"/.test(settings), 'Settings has no Privacy section');
  assert.ok(settings.includes('Read the privacy policy'), 'the privacy entry has no visible affordance');
});

test('the Settings privacy link opens externally on both targets', () => {
  // One link, no native branch: Capacitor hands a target="_blank" navigation to
  // the system browser, and the PWA opens a new tab. rel=noopener is the app's
  // standing convention for every outward link.
  const anchor = settings.slice(settings.indexOf('href={PRIVACY_POLICY_URL}'));
  const end = anchor.indexOf('>');
  const attrs = anchor.slice(0, end);
  assert.ok(attrs.includes('target="_blank"'));
  assert.ok(attrs.includes('rel="noopener noreferrer"'));
  // No platform fork anywhere near it — that would be the divergence this
  // milestone exists to prevent.
  assert.equal(
    /isNativeAndroid|getRuntime/.test(settings),
    false,
    'Settings now branches on the runtime; the privacy URL must stay identical on PWA and Android',
  );
});

test('the service worker cannot serve the app shell in place of the policy', () => {
  assert.ok(
    /navigateFallbackDenylist:\s*\[\s*\/\\\/privacy\\\//.test(vite),
    'vite.config.ts no longer excludes /privacy/ from the SPA navigation fallback',
  );
});

// ---------------------------------------------------------------------------
// 4. The standing privacy claims — the code the policy describes
// ---------------------------------------------------------------------------

test('no analytics, telemetry, crash reporting or advertising SDK is present', () => {
  const FORBIDDEN =
    /\b(google-analytics|googletagmanager|gtag|firebase|crashlytics|sentry|bugsnag|datadog|mixpanel|posthog|amplitude|segment\.com|appsflyer|adjust\.com|admob|facebook\.net)\b/i;
  const scanned = [
    ...walk('src'),
    ...walk('scripts'),
    ...walk('android/app/src'),
    ...walk('public/privacy'),
    'package.json',
    'capacitor.config.ts',
    'vite.config.ts',
    'index.html',
  ];
  const hits = scanned.filter((f) => FORBIDDEN.test(read(f)));
  assert.deepEqual(hits, [], 'an analytics/telemetry/advertising reference appeared');

  // The Firebase plugin only applies when this file exists (android/app/build.gradle).
  assert.equal(
    existsSync(join(root, 'android/app/google-services.json')),
    false,
    'google-services.json would activate the Google Services plugin',
  );
});

test('the runtime dependency set stays free of network/collection SDKs', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(
    Object.keys(pkg.dependencies).sort(),
    [
      '@capacitor/app',
      '@capacitor/core',
      'fflate',
      'lucide-react',
      'maplibre-gl',
      // pdfjs-dist (audited 2026-08, v6.2.108): Mozilla's PDF renderer for
      // the in-app Wallet document viewer. No analytics or beacons in the
      // library; the only URLs it ever fetches are the ones the app hands it
      // (src/pdf/pdfEngine.ts), all same-origin bundle assets — worker, wasm
      // codecs, fonts. Document bytes are passed in memory and never leave
      // the device; tests/wallet-pdf-viewer.test.mjs pins the no-CDN wiring.
      'pdfjs-dist',
      'pmtiles',
      'react',
      'react-dom',
    ],
    'the runtime dependency set changed — re-audit what the new package sends before updating this fence and the policy',
  );
});

test('the app makes network requests from map code only', () => {
  // The policy states the only requests are for the app's own files and the
  // map archives. This is that statement, expressed as the set of modules
  // allowed to call fetch at all.
  const callers = walk('src').filter((f) => /(?:^|[^.\w])fetch\(/.test(read(f)));
  assert.deepEqual(
    callers.sort(),
    ['src/map/archiveStore.ts', 'src/map/offlineMap.ts', 'src/map/pmtilesProtocol.ts'],
    'a new network call site appeared outside the map archive code — the privacy policy no longer describes the app',
  );
});

test('the only native code that reaches the network is the map-archive download', () => {
  // `fetch` is not the whole story any more: on Android the optional map
  // archives are downloaded by MapArchivePlugin.java, which opens its own
  // connection and never appears in the scan above. The policy's claim is
  // about what the app connects to, not about which language does it, so the
  // Java side is fenced the same way — one downloader, in the map plugin.
  const javaDir = 'android/app/src/main/java/com/algolon/fjallkompis';
  const networked = walk(javaDir).filter((f) =>
    /\b(HttpURLConnection|HttpsURLConnection|OkHttpClient|Socket)\b/.test(read(f)),
  );
  assert.deepEqual(
    networked,
    [`${javaDir}/MapArchivePlugin.java`],
    'a native network call site appeared outside the map-archive plugin',
  );
  // And it fetches only what it is told to, from the catalog — no URL, host
  // or endpoint is written into the Java at all.
  assert.equal(
    /https?:\/\//.test(read(`${javaDir}/MapArchivePlugin.java`)),
    false,
    'the plugin must not contain a hardcoded URL',
  );
});

test('no transport other than fetch is used', () => {
  const TRANSPORT = /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/;
  const hits = walk('src').filter((f) => TRANSPORT.test(read(f)));
  assert.deepEqual(hits, [], 'a non-fetch network transport appeared');
});

test('the map style pulls no glyphs, sprites or tiles from a third party', () => {
  // MapLibre will happily fetch a remote glyph server if a style names one;
  // that would be a third-party request on every map screen.
  const style = read('src/map/mapStyle.ts');
  assert.equal(/glyphs:\s*['"]http/.test(style), false);
  assert.equal(/sprite:\s*['"]http/.test(style), false);
});

test('every workflow that produces a shippable artifact runs the privacy verifier', () => {
  // Play requires the policy URL to complete the Data safety form, so a build
  // that ships without the page is a release defect, not a docs one.
  //
  // This exists because the check was missing from exactly the workflow that
  // matters most: deploy, PR CI and the spike APK all ran the verifier, while
  // android-internal-release.yml — the one whose bundle is uploaded to Play —
  // did not. The 2700005 candidate was inspected by hand afterwards instead,
  // which is a good habit and not a gate. Enumerated rather than spot-checked
  // so a NEW artifact-producing workflow has to be added here deliberately.
  const SHIPS_AN_ARTIFACT = [
    'deploy.yml',
    'pr-ci.yml',
    'android-spike.yml',
    'android-internal-release.yml',
  ];
  for (const workflow of SHIPS_AN_ARTIFACT) {
    assert.match(
      read(`.github/workflows/${workflow}`),
      /node scripts\/verify-privacy-build\.mjs/,
      `${workflow} must run the canonical privacy verifier`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5. Android identity and permissions
// ---------------------------------------------------------------------------

test('the Android application identity is unchanged', () => {
  // A changed application id is a DIFFERENT app in Play: no update path, a
  // second install, a separate storage sandbox. Asserted here too because this
  // milestone touches Play-facing configuration.
  const APP_ID = 'com.algolon.fjallkompis';
  assert.ok(read('capacitor.config.ts').includes(`appId: '${APP_ID}'`));
  const gradle = read('android/app/build.gradle');
  assert.ok(gradle.includes(`applicationId "${APP_ID}"`));
  assert.ok(gradle.includes(`namespace = "${APP_ID}"`));
});

test('the declared Android permissions are exactly the audited set', () => {
  const declared = [...androidManifest.matchAll(/uses-permission android:name="android\.permission\.([A-Z_]+)"/g)]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(
    declared,
    ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'INTERNET'],
    'the Android permission set changed — the privacy policy and the Play Data safety declaration must be revisited',
  );
  // Named separately rather than left to the deepEqual above: this is the one
  // the policy makes a promise about, and the manifest's own comment mentions
  // it by name, so only a real <uses-permission> declaration counts.
  assert.equal(
    /uses-permission[^>]*ACCESS_BACKGROUND_LOCATION/.test(androidManifest),
    false,
    'the policy states there is no background tracking',
  );
});

test('Android keeps trip data and Wallet documents off Google Drive', () => {
  assert.ok(androidManifest.includes('android:allowBackup="false"'));
  const rules = read('android/app/src/main/res/xml/data_extraction_rules.xml');
  for (const channel of ['cloud-backup', 'device-transfer']) {
    const block = rules.slice(rules.indexOf(`<${channel}>`), rules.indexOf(`</${channel}>`));
    assert.ok(block.includes('<exclude domain="root" />'), `${channel} does not exclude app data`);
  }
});

// ---------------------------------------------------------------------------
// 6. Location handling
// ---------------------------------------------------------------------------

test('location never reaches persistent storage or an export', () => {
  // The policy says position is held in memory and discarded. The live session
  // is React state in useRouteTracking; nothing writes it to the persisted
  // blob, so the persisted schema must carry no position fields.
  const schema = read('src/utils/stateMigration.mjs');
  const shape = read('src/types/index.ts');
  for (const source of [schema, shape]) {
    assert.equal(
      /\b(latitude|longitude|coordinates|breadcrumb|positionHistory)\s*:/.test(source),
      false,
      'a position-shaped field appeared in the persisted state — the policy claims location is never saved',
    );
  }
});

test('the diagnostic summary stays a fixed, non-personal field list', () => {
  // The policy describes this button explicitly, so its field list is a
  // published claim rather than an implementation detail.
  const diag = read('src/utils/diagnosticSummary.mjs');
  const fields = [...diag.matchAll(/\['([a-zA-Z]+)', '/g)].map((m) => m[1]);
  assert.deepEqual(fields, [
    'appVersion',
    'content',
    'schemaVersion',
    'routeDirection',
    'platform',
    'displayMode',
    'serviceWorker',
    'storage',
    'offlineBasemap',
    'terrain',
    'satellite',
  ]);
});
