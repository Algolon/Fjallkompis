#!/usr/bin/env node
/**
 * Gate between `npm run build:native` and `cap sync android`.
 *
 * The web build and the native build write to the SAME `dist` directory
 * (Capacitor's webDir), so the only thing standing between a stale Pages
 * build and a broken APK is this check. It runs automatically from
 * `npm run cap:sync:android`, and again in CI after the native build.
 *
 * Every assertion below is a failure mode that is INVISIBLE at build time and
 * only shows up on the device:
 *   - a '/Fjallkompis/' asset path 404s inside the WebView (blank screen);
 *   - a registered service worker puts a second, stale cache in front of
 *     assets the APK already ships, and can prompt to "update" an app that
 *     updates through an APK install;
 *   - a missing basemap means the Map tab opens to nothing offline;
 *   - an OPTIONAL map archive that slipped into dist adds tens of megabytes to
 *     the AAB, silently, on whichever machine happened to have it on disk.
 *
 * Run: node scripts/verify-native-build.mjs [distDir]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLED_MAP_ASSETS,
  MAP_ASSETS,
  OPTIONAL_MAP_ASSETS,
} from '../src/map/mapCatalog.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, process.argv[2] ?? 'dist');

const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

/** Every file under dist, as repo-relative paths. */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(dist);
if (files.length === 0) {
  fail(`${relative(root, dist)}/ is empty or missing — run \`npm run build:native\` first`);
}

// ---------------------------------------------------------------------------
// 1. This must be the NATIVE build, not the Pages build.
// ---------------------------------------------------------------------------
const marker = join(dist, '.native-build');
if (!existsSync(marker)) {
  fail(
    'no .native-build marker in dist/ — this looks like the web/Pages build. ' +
      'Run `npm run build:native` (NOT `npm run build`) before syncing Capacitor.',
  );
} else {
  notes.push(`native build marker: v${readFileSync(marker, 'utf8').trim()}`);
}

// ---------------------------------------------------------------------------
// 2. No GitHub Pages base path may survive into the WebView bundle.
// ---------------------------------------------------------------------------
const TEXT = /\.(html|js|css|json|webmanifest|map)$/;
const textFiles = files.filter((f) => TEXT.test(f));

// Only ROOT-ABSOLUTE occurrences are a problem: a leading '/' that the
// WebView would resolve against https://localhost/. The delimiter class in
// front of the slash is what distinguishes an asset path from the repository
// URLs the app legitimately cites as sources — src/data/experienceRoutes.ts
// links every owner-authored GPX to github.com/Algolon/Fjallkompis/blob/…,
// and that string must survive into the bundle untouched.
const ABSOLUTE_PAGES_BASE = /(^|["'`(,;=\s])\/Fjallkompis\//;
const pagesBase = textFiles.filter((f) => ABSOLUTE_PAGES_BASE.test(readFileSync(f, 'utf8')));
if (pagesBase.length > 0) {
  fail(
    'the Pages base path "/Fjallkompis/" is used as an asset path in the native bundle — ' +
      `every such asset 404s in the WebView: ${pagesBase.map((f) => relative(dist, f)).join(', ')}`,
  );
}

const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) {
  fail('dist/index.html is missing — Capacitor has no entry point to load');
} else {
  const index = readFileSync(indexPath, 'utf8');
  const refs = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  if (!refs.some((r) => r.startsWith('/assets/'))) {
    fail('dist/index.html has no /assets/ reference — the native base did not take effect');
  }
  // A RELATIVE base is a trap here, not a safer alternative: a url() inside a
  // CSS custom property resolves against the stylesheet that substitutes it
  // (/assets/index-*.css), so './images/…' becomes '/assets/images/…' and
  // 404s. See the base-path note in vite.config.ts.
  const relativeRefs = refs.filter((r) => r.startsWith('./') || r.startsWith('../'));
  if (relativeRefs.some((r) => r.includes('assets/'))) {
    fail(`dist/index.html uses relative asset paths (${relativeRefs.join(', ')}) — the native base must be '/'`);
  }
  // viewport-fit=cover is what makes Capacitor's SystemBars plugin hand the
  // real system-bar insets through to the WebView instead of padding it.
  // Without it the app is letterboxed and the bottom nav cannot reach the
  // screen edge — the exact thing this spike is proving.
  if (!/viewport-fit=cover/.test(index)) {
    fail('dist/index.html lost viewport-fit=cover — edge-to-edge insets will not reach the web layer');
  }
  // The boot veil is what smooths splash → app; without it a cold start
  // flashes a flat colour and then pops the whole UI in at once. It must be
  // inline (pre-JS) and script-free.
  // THE ANDROID SPLASH IS THE ONLY LAUNCH SURFACE. A logo drawn inside the
  // WebView cannot line up with the one the system draws — the splash fills
  // the whole window while the WebView is inset by the navigation bar on
  // devices that pad it, so the mark visibly jumped between the two
  // coordinate spaces. MainActivity now holds the real splash until React
  // reports a painted, opaque frame. Any HTML loading surface reintroduces
  // exactly the defect that was removed, so the bundle must contain none.
  const veilMarkers = ['native-boot-veil', 'veil-out', 'veil-mark', 'boot-veil'];
  const stray = veilMarkers.filter((marker) => index.includes(marker));
  if (stray.length > 0) {
    fail(
      `dist/index.html still contains HTML launch-screen machinery (${stray.join(', ')}) — ` +
        'the Android splash is the only launch surface',
    );
  }
}

// ---------------------------------------------------------------------------
// 3. No service worker may be emitted or registered.
// ---------------------------------------------------------------------------
const workerArtefacts = files
  .map((f) => relative(dist, f))
  .filter((f) => /^(sw\.js|registerSW\.js|workbox-[^/]+\.js|manifest\.webmanifest)$/.test(f));
if (workerArtefacts.length > 0) {
  fail(`the native build emitted PWA artefacts: ${workerArtefacts.join(', ')} — VitePWA must not run in mode=native`);
}

const registrations = textFiles.filter((f) => {
  const source = readFileSync(f, 'utf8');
  return /serviceWorker\s*\.\s*register\b/.test(source) || /virtual:pwa-register/.test(source);
});
if (registrations.length > 0) {
  fail(
    'service-worker registration reached the native bundle: ' +
      `${registrations.map((f) => relative(dist, f)).join(', ')}`,
  );
}

// ---------------------------------------------------------------------------
// 4. Exactly the BUNDLED archives ship inside the app — no more, no fewer.
//
// Both halves matter, and the second half used to be unchecked. The bundled
// vector basemap missing is the versionCode 2700001 blank-map regression. An
// OPTIONAL archive being present is the opposite mistake and just as real: the
// binaries land in public/maps/ on any machine that has run the deploy fetch,
// Vite copies public/ wholesale, and the result is ~90 MB of terrain, contour
// and satellite data added to the AAB by accident. The catalog decides which
// is which, so this can never disagree with the app.
// ---------------------------------------------------------------------------
for (const id of BUNDLED_MAP_ASSETS) {
  const asset = MAP_ASSETS[id];
  const path = join(dist, 'maps', asset.file);
  if (!existsSync(path)) {
    fail(`dist/maps/${asset.file} is missing — the Map tab would have no offline ${id} archive in the APK`);
    continue;
  }
  const size = statSync(path).size;
  if (size !== asset.revision.bytes) {
    fail(`dist/maps/${asset.file} is ${size} bytes, catalog declares ${asset.revision.bytes}`);
  } else {
    notes.push(`bundled ${id}: ${(size / 1024 / 1024).toFixed(1)} MB, revision ${asset.revision.id}`);
  }
}

for (const id of OPTIONAL_MAP_ASSETS) {
  const asset = MAP_ASSETS[id];
  if (existsSync(join(dist, 'maps', asset.file))) {
    fail(
      `dist/maps/${asset.file} is an OPTIONAL archive and must not be packaged — ` +
        'it is a user-initiated download on both platforms (src/map/nativeArchiveStore.ts). ' +
        'The native build strips these; a copy surviving here means that hook did not run.',
    );
  } else {
    notes.push(`optional archive correctly absent: ${asset.file}`);
  }
}

// ---------------------------------------------------------------------------

const totalBytes = files.reduce((sum, f) => sum + statSync(f).size, 0);
notes.push(`web assets: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

for (const note of notes) console.log(`  · ${note}`);

if (failures.length > 0) {
  console.error('\nNative build verification FAILED:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log('\n✓ native build verified: WebView-root base, no service worker, basemap present');
