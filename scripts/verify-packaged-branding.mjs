#!/usr/bin/env node
/**
 * Verify that a PACKAGED Android artefact carries Fjällkompis branding.
 *
 *     node scripts/verify-packaged-branding.mjs android/app/build/outputs/bundle/release/app-release.aab
 *     node scripts/verify-packaged-branding.mjs android/app/build/outputs/apk/debug/app-debug.apk
 *
 * The source tree passing tests/branding-parity.test.mjs is not the same claim
 * as "the artefact we upload is branded". Between them sits AAPT2, which
 * renames resources into density-qualified directories, re-encodes PNGs, and
 * can silently drop a resource that no longer resolves. This reads the shipped
 * ZIP.
 *
 * PIXELS, NOT BYTES. AAPT2 re-encodes launcher PNGs ("crunching"), so the
 * packaged bytes will not match the committed file. Crunching is LOSSLESS, so
 * the decoded pixels must match exactly — that is the comparison made here,
 * and it is strictly stronger than a byte check would be anyway: it survives
 * re-encoding while still catching a substituted image.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';

import { decodePng, meanAbsDiff } from './lib/png.mjs';
import { readZipEntry, readZipIndex } from './lib/zip.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];

if (!target) {
  console.error('usage: verify-packaged-branding.mjs <path to .aab or .apk>');
  process.exit(2);
}
if (!existsSync(target)) {
  console.error(`no such artefact: ${target}`);
  process.exit(2);
}

const archive = readFileSync(target);
const index = readZipIndex(archive);

// An AAB namespaces everything under base/; an APK does not. Detect rather
// than require, so the same check runs against a debug APK locally.
const prefix = [...index.keys()].some((k) => k.startsWith('base/res/')) ? 'base/' : '';
const kind = prefix ? 'AAB' : 'APK';

const failures = [];
const seen = [];

/** All packaged entries for one resource name, across density directories. */
function resourceEntries(name) {
  const pattern = new RegExp(`^${prefix}res/mipmap-([a-z]+)(-v\\d+)?/${name}\\.png$`);
  return [...index.keys()]
    .map((key) => ({ key, match: pattern.exec(key) }))
    .filter((e) => e.match)
    .map((e) => ({ key: e.key, density: e.match[1] }));
}

for (const name of ['ic_launcher', 'ic_launcher_round']) {
  const entries = resourceEntries(name);
  const densities = new Set(entries.map((e) => e.density));

  // Every density the source tree ships must survive into the package. A
  // missing one is not a build failure — Android just upscales a smaller
  // bitmap and the icon goes soft on exactly the devices that needed it.
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    if (!densities.has(density)) failures.push(`${name}: no ${density} bitmap in the ${kind}`);
  }

  for (const entry of entries) {
    const sourcePath = join(ROOT, `android/app/src/main/res/mipmap-${entry.density}/${name}.png`);
    if (!existsSync(sourcePath)) {
      failures.push(`${entry.key}: packaged, but there is no source resource for mipmap-${entry.density}`);
      continue;
    }
    const packaged = decodePng(readZipEntry(archive, index.get(entry.key)));
    const source = decodePng(readFileSync(sourcePath));

    if (packaged.width !== source.width || packaged.height !== source.height) {
      failures.push(
        `${entry.key}: packaged ${packaged.width}x${packaged.height}, source ${source.width}x${source.height}`,
      );
      continue;
    }
    // Zero, not a tolerance: PNG crunching is lossless, so any pixel
    // difference at all means a different image was packaged.
    const diff = meanAbsDiff(packaged, source);
    if (diff > 0) {
      failures.push(`${entry.key}: packaged pixels differ from the source resource (MAE ${diff.toFixed(3)})`);
    } else {
      seen.push(`${entry.key} (${packaged.width}x${packaged.height})`);
    }
  }
}

// The adaptive icon must be packaged too. Its XML is compiled to binary/proto
// in the artefact, so only its presence is asserted here; the structure is
// checked in tests/branding-parity.test.mjs against the source.
for (const name of ['ic_launcher', 'ic_launcher_round']) {
  const key = [...index.keys()].find((k) => new RegExp(`^${prefix}res/mipmap-anydpi(-v\\d+)?/${name}\\.xml$`).test(k));
  if (!key) failures.push(`${name}: the adaptive icon (mipmap-anydpi-v26) is not in the ${kind}`);
  else seen.push(key);
}

// The splash mark rides in drawable-nodpi and is the same artwork again.
const markKey = [...index.keys()].find((k) => new RegExp(`^${prefix}res/drawable-nodpi(-v\\d+)?/fjallkompis_mark\\.png$`).test(k));
if (!markKey) {
  failures.push(`the splash/adaptive-foreground mark (fjallkompis_mark.png) is not in the ${kind}`);
} else {
  const packaged = decodePng(readZipEntry(archive, index.get(markKey)));
  const source = decodePng(readFileSync(join(ROOT, 'assets/brand/fjallkompis-mark-512.png')));
  if (meanAbsDiff(packaged, source) > 0) {
    failures.push(`${markKey}: packaged mark differs from the canonical master`);
  } else {
    seen.push(`${markKey} (${packaged.width}x${packaged.height}, canonical master)`);
  }
}

// No Capacitor template artwork rode along.
for (const key of index.keys()) {
  if (/res\/drawable[^/]*\/splash\.png$/.test(key)) failures.push(`${key}: a Capacitor default splash is packaged`);
}

console.log(`Packaged branding — ${basename(target)} (${kind}):`);
for (const s of seen) console.log(`  ✓ ${s}`);
if (failures.length) {
  console.error('\nPackaged branding verification FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\n✓ ${seen.length} packaged branding resources verified against the canonical master.`);
