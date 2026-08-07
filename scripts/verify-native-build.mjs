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
 *   - a missing basemap means the Map tab opens to nothing offline.
 *
 * Run: node scripts/verify-native-build.mjs [distDir]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (!index.includes('id="native-boot-veil"')) {
    fail('dist/index.html is missing the native boot veil — the splash-to-app handoff would be abrupt');
  } else {
    const veilStart = index.lastIndexOf('<style>', index.indexOf('id="native-boot-veil"'));
    const veilBlock = index.slice(veilStart);
    if (/<script/i.test(veilBlock)) {
      fail('the boot veil region contains a <script> — it must stay pure markup+CSS so it paints before any JS');
    }
    // The veil is a STILL image by decision, on physical evidence: motion on
    // a launch this short only signals "still loading". See the plugin
    // comment in vite.config.ts before adding anything that moves.
    if (/@keyframes|animation:|animation-name/.test(veilBlock)) {
      fail('the boot veil declares an animation — the launch mark must stay completely static');
    }
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
// 4. The offline vector basemap must ship inside the app.
// ---------------------------------------------------------------------------
const basemap = join(dist, 'maps', 'kungsleden.pmtiles');
if (!existsSync(basemap)) {
  fail('dist/maps/kungsleden.pmtiles is missing — the Map tab would have no offline basemap in the APK');
} else {
  notes.push(`vector basemap: ${(statSync(basemap).size / 1024 / 1024).toFixed(1)} MB`);
}

// Terrain and satellite archives are injected by the Pages deploy, not by
// Vite, so their absence here is expected and correct for this spike.
for (const optional of ['kungsleden-terrain.pmtiles', 'kungsleden-satellite.pmtiles', 'kungsleden-contours.pmtiles']) {
  if (!existsSync(join(dist, 'maps', optional))) {
    notes.push(`optional archive absent (expected in this spike): ${optional}`);
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
