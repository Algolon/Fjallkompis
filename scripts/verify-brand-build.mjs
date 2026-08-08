#!/usr/bin/env node
/**
 * Verify the BUILT PWA actually ships Fjallkompis branding.
 *
 *     npm run build && node scripts/verify-brand-build.mjs
 *
 * tests/branding-parity.test.mjs checks the source tree: the master, the
 * derivations, and what vite.config.ts declares. That is not the same claim as
 * "the thing we deploy is branded". Between the two sits vite-plugin-pwa,
 * which REWRITES the manifest (it resolves icon `src` against `base`, and it
 * is the component that decides what Workbox precaches). A build that emits a
 * manifest pointing at /icon-192.png instead of /Fjallkompis/icon-192.png
 * passes every source-level test and still installs with a blank icon.
 *
 * So this reads dist/ and nothing else: the emitted manifest, the emitted PNG
 * bytes, and the precache list.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { decodePng } from './lib/png.mjs';
import { DERIVED, MASTER_COPIES, PRODUCT_NAME, PRODUCT_TITLE } from '../assets/brand/brand.contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);

if (!existsSync(DIST)) {
  console.error('dist/ does not exist — run `npm run build` first.');
  process.exit(1);
}

// A native build shares dist/ with the web build and deliberately has NO
// manifest and no service worker, so verifying it here would report phantom
// failures. Refuse rather than mislead.
if (existsSync(join(DIST, '.native-build'))) {
  console.error(
    'dist/ holds a NATIVE build (.native-build marker present).\n' +
      'This verifier is for the web/PWA target: run `npm run build`, then re-run.',
  );
  process.exit(1);
}

// --- The emitted manifest -----------------------------------------------------

const manifestName = readdirSync(DIST).find((f) => f.endsWith('.webmanifest'));
if (!manifestName) {
  console.error('no .webmanifest was emitted into dist/');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(DIST, manifestName), 'utf8'));
notes.push(`manifest: dist/${manifestName}`);

const EXPECTED = [
  { file: 'icons/icon-192.png', sizes: '192x192', purpose: undefined },
  { file: 'icons/icon-512.png', sizes: '512x512', purpose: undefined },
  { file: 'icons/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' },
];

if (!Array.isArray(manifest.icons) || manifest.icons.length !== EXPECTED.length) {
  fail(`manifest declares ${manifest.icons?.length ?? 0} icons, expected ${EXPECTED.length}`);
}

for (const expected of EXPECTED) {
  const entry = (manifest.icons ?? []).find((i) => typeof i.src === 'string' && i.src.endsWith(expected.file));
  if (!entry) {
    fail(`manifest does not ship ${expected.file}`);
    continue;
  }

  if (entry.sizes !== expected.sizes) fail(`${expected.file}: manifest claims sizes "${entry.sizes}", expected "${expected.sizes}"`);
  if ((entry.purpose ?? undefined) !== expected.purpose) {
    fail(`${expected.file}: manifest purpose is "${entry.purpose ?? 'any'}", expected "${expected.purpose ?? 'any'}"`);
  }

  // The icon URL must resolve under the deployed base. A root-absolute
  // '/icons/…' on a project-subpath deploy is the classic blank-install-icon
  // bug: it 404s on Pages while looking perfectly fine in the manifest.
  const scope = manifest.scope ?? '/';
  if (entry.src.startsWith('/') && !entry.src.startsWith(scope)) {
    fail(`${expected.file}: manifest src "${entry.src}" falls outside the app scope "${scope}"`);
  }

  // And the bytes must actually be in dist/, at the size claimed, identical to
  // the verified source asset.
  const emitted = join(DIST, expected.file);
  if (!existsSync(emitted)) {
    fail(`${expected.file}: declared in the manifest but not emitted into dist/`);
    continue;
  }
  const source = join(ROOT, 'public', expected.file);
  if (!readFileSync(emitted).equals(readFileSync(source))) {
    fail(`${expected.file}: emitted bytes differ from public/${expected.file}`);
  }
  const img = decodePng(readFileSync(emitted));
  if (`${img.width}x${img.height}` !== expected.sizes) {
    fail(`${expected.file}: emitted image is ${img.width}x${img.height}, manifest claims ${expected.sizes}`);
  }
}

// Read from the contract rather than repeated here, so the canonical product
// spelling has exactly one definition.
for (const [key, expected] of [
  ['name', PRODUCT_TITLE],
  ['short_name', PRODUCT_NAME],
]) {
  if (manifest[key] !== expected) fail(`manifest.${key} is "${manifest[key]}", expected "${expected}"`);
}

// --- Icons that live outside the manifest ------------------------------------

for (const file of ['icons/favicon.png', 'icons/apple-touch-icon.png']) {
  const emitted = join(DIST, file);
  if (!existsSync(emitted)) {
    fail(`${file}: not emitted into dist/ (is it still in VitePWA includeAssets?)`);
    continue;
  }
  if (!readFileSync(emitted).equals(readFileSync(join(ROOT, 'public', file)))) {
    fail(`${file}: emitted bytes differ from public/${file}`);
  }
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
if (!/rel="icon"[^>]*favicon\.png/.test(html)) fail('the built index.html does not reference the favicon');
if (!/rel="apple-touch-icon"[^>]*apple-touch-icon\.png/.test(html)) {
  fail('the built index.html does not reference the Apple touch icon');
}

// --- Offline: the icons must survive a cold, offline install ------------------

const sw = existsSync(join(DIST, 'sw.js')) ? readFileSync(join(DIST, 'sw.js'), 'utf8') : '';
if (!sw) {
  fail('no service worker was emitted — the PWA build is not producing sw.js');
} else {
  for (const file of [
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/favicon.png',
    'icons/apple-touch-icon.png',
  ]) {
    // Workbox writes the precache list as revisioned URL entries; the icon path
    // appears verbatim in it. An icon missing here still installs online and
    // then loses its home-screen artwork offline, which is precisely the kind
    // of defect nobody notices until a hut with no signal.
    if (!sw.includes(file)) fail(`${file} is not in the service worker precache list`);
  }
}

// --- Nothing unbranded slipped in --------------------------------------------

const governedNames = new Set(
  [...MASTER_COPIES, ...DERIVED]
    .map((s) => s.path)
    .filter((p) => p.startsWith('public/icons/'))
    .map((p) => p.replace('public/', '')),
);
for (const file of readdirSync(join(DIST, 'icons'))) {
  if (!governedNames.has(`icons/${file}`)) fail(`dist/icons/${file} is not governed by the branding contract`);
}

// --- Report -------------------------------------------------------------------

for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.error('\nBranding build verification FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`  ✓ built PWA branding verified (${EXPECTED.length} manifest icons, favicon, Apple touch icon, precached)`);
