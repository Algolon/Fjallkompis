/**
 * Branding parity — one Fjällkompis identity, two distribution channels.
 *
 * Fjällkompis ships to GitHub Pages as a PWA and to Google Play as an Android
 * app. They are one product, so the launcher icon, the favicon, the iOS touch
 * icon, the splash mark and the Play listing icon must all be derivations of
 * ONE approved master (assets/brand/fjallkompis-mark-512.png) rather than a
 * set of lookalikes maintained per platform.
 *
 * Branding drift is uniquely easy to miss: nothing crashes, no test times out,
 * and the mistake is usually only visible on a physical home screen — often
 * after release. These fences therefore check the ARTWORK ITSELF, by decoding
 * every icon and re-deriving it from the master, not merely the XML that
 * points at it. A Capacitor default sneaking back into mipmap-hdpi is a green
 * robot that every string-matching test in this repo would happily accept.
 *
 * PIXELS WITH A TOLERANCE, NOT BYTES. The PWA icons are the original approved
 * renderings and were produced by a different resampler than
 * scripts/lib/png.mjs, so byte equality is unachievable and a whole-file
 * snapshot would be pure brittleness. Each asset is instead re-derived and
 * compared as a mean absolute per-channel difference. See DEFAULT_TOLERANCE in
 * the contract for the measured headroom that number sits in.
 *
 * Splash INVARIANTS are not re-litigated here — tests/native-runtime.test.mjs
 * owns the lifecycle contract (installSplashScreen first, postSplashScreenTheme
 * handoff, no drawable in the running theme, readiness not a timer) and that
 * evidence is load-bearing. This file only pins the part branding could break:
 * that the splash still shows the approved mark, and that the post-splash
 * window background is still a plain colour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { decodePng, isFullyOpaque, markSpanOf, meanAbsDiff } from '../scripts/lib/png.mjs';
import { deriveAsset } from '../scripts/generate-brand-assets.mjs';
import {
  BRAND_COLORS,
  DEFAULT_TOLERANCE,
  DERIVED,
  MASTER,
  MASTER_COPIES,
} from '../assets/brand/brand.contract.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const bytes = (p) => readFileSync(join(root, p));
const image = (p) => decodePng(bytes(p));

const vite = read('vite.config.ts');
const html = read('index.html');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const styles = read('android/app/src/main/res/values/styles.xml');

const master = image(MASTER);

// --- The master ---------------------------------------------------------------

test('the canonical master exists and is the shape the contract promises', () => {
  assert.equal(master.width, 512);
  assert.equal(master.height, 512);
  // Transparent-backed: the plated variants are DERIVED by compositing this
  // onto a plate. A pre-plated master could not produce the transparent
  // favicon or the adaptive-icon foreground.
  assert.ok(!isFullyOpaque(master), 'the master keeps its transparency');
  // ~0.94: the mark nearly fills its canvas. Every derived framing is
  // expressed relative to this, so a re-cropped master would silently rescale
  // every icon at once.
  const span = markSpanOf(master);
  assert.ok(span > 0.92 && span < 0.96, `master mark spans ${span.toFixed(3)} of its canvas`);
});

test('the master has exactly one identity — no competing masters', () => {
  // Any other 512x512 PNG in the branding surfaces would be a second master in
  // waiting. The two legitimate copies are byte-identical by contract, checked
  // below; nothing else may claim the role.
  const masterBytes = bytes(MASTER);
  for (const copy of MASTER_COPIES) {
    assert.ok(existsSync(join(root, copy.path)), `${copy.path} exists`);
    // Buffer.equals, not assert.deepEqual: deepEqual on two 150 KB buffers
    // spends ~12s building a byte-by-byte diff and then reports it as an
    // unreadable wall, which drowns the actual message. This states the same
    // fact in constant time and fails with a sentence a reviewer can act on.
    assert.ok(
      bytes(copy.path).equals(masterBytes),
      `${copy.path} is no longer byte-identical to ${MASTER}. ${copy.why}. Run \`npm run generate:brand\`.`,
    );
  }
});

// --- Every derived asset ------------------------------------------------------

test('every derived icon is genuinely derived from the master', () => {
  const failures = [];
  for (const spec of DERIVED) {
    if (!existsSync(join(root, spec.path))) {
      failures.push(`${spec.path}: missing`);
      continue;
    }
    const actual = image(spec.path);
    if (actual.width !== spec.size || actual.height !== spec.size) {
      failures.push(`${spec.path}: ${actual.width}x${actual.height}, contract says ${spec.size}x${spec.size}`);
      continue;
    }
    const diff = meanAbsDiff(actual, deriveAsset(master, spec));
    const tolerance = spec.tolerance ?? DEFAULT_TOLERANCE;
    if (diff > tolerance) {
      failures.push(`${spec.path}: MAE ${diff.toFixed(2)} > ${tolerance} — not a derivation of ${MASTER}`);
    }
  }
  assert.deepEqual(failures, [], `run \`npm run generate:brand\`:\n${failures.join('\n')}`);
});

test('icons that may not be transparent are opaque', () => {
  // A transparent maskable PWA icon renders as a black square on some Android
  // launchers; iOS composites an alpha touch icon onto black; Play rejects
  // transparency outright. These are three separate platform contracts that
  // happen to share one answer.
  for (const spec of DERIVED.filter((s) => s.opaque)) {
    assert.ok(isFullyOpaque(image(spec.path)), `${spec.path} must have no transparency — ${spec.why}`);
  }
});

test('masked icons keep the mark inside the safe zone', () => {
  // The maskable/adaptive contract crops to the central ~80%; an icon whose
  // mark spans more than that gets its compass points sliced off by the
  // launcher, which is exactly the defect this framing exists to prevent.
  for (const spec of DERIVED.filter((s) => s.markSpan <= 0.8 && s.plate)) {
    const span = markSpanOf(image(spec.path), spec.plate);
    assert.ok(
      span <= 0.82,
      `${spec.path}: mark spans ${span.toFixed(3)} of the icon; the mask safe zone is 0.80`,
    );
  }
});

// --- PWA wiring ---------------------------------------------------------------

/**
 * Pull the manifest's `icons` array out of vite.config.ts as structured
 * entries. Parsed rather than pattern-matched: the entries sit next to each
 * other, so a proximity regex for "is icon-512 declared maskable?" matches the
 * NEXT entry's filename and reports a defect that is not there.
 */
function manifestIcons(source) {
  const open = source.indexOf('[', source.indexOf('icons: ['));
  let depth = 0;
  let close = open;
  for (; close < source.length; close += 1) {
    if (source[close] === '[') depth += 1;
    else if (source[close] === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = source.slice(open + 1, close);

  const entries = [];
  let braces = 0;
  let start = -1;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '{') {
      if (braces === 0) start = i;
      braces += 1;
    } else if (body[i] === '}') {
      braces -= 1;
      if (braces === 0) entries.push(body.slice(start, i + 1));
    }
  }
  return entries.map((raw) => ({
    src: /src:\s*'([^']+)'/.exec(raw)?.[1],
    sizes: /sizes:\s*'([^']+)'/.exec(raw)?.[1],
    // An omitted purpose means "any" per the Web App Manifest spec.
    purpose: /purpose:\s*'([^']+)'/.exec(raw)?.[1] ?? 'any',
  }));
}

test('the web manifest ships the approved icon set with correct purpose semantics', () => {
  const icons = manifestIcons(vite);

  // Sizes must be declared honestly: a browser picks an icon by the size the
  // manifest CLAIMS, so a wrong string here stretches a 192 into a 512 slot.
  assert.deepEqual(
    icons,
    [
      { src: 'icons/icon-192.png', sizes: '192x192', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' },
    ],
    'the manifest icon set is the approved one',
  );

  // Marking a transparent "any" icon as maskable is the classic version of
  // this bug: the launcher then crops a mark drawn with no safe-zone padding,
  // slicing the compass points off. Exactly one entry may be maskable, and it
  // must be the file that was actually framed for it.
  const maskable = icons.filter((i) => i.purpose.split(/\s+/).includes('maskable'));
  assert.equal(maskable.length, 1, 'exactly one maskable icon is declared');
  assert.equal(maskable[0].src, 'icons/icon-maskable-512.png');

  // Every declared icon must be one the contract governs, at the size claimed.
  for (const icon of icons) {
    const spec = [...MASTER_COPIES, ...DERIVED].find((s) => s.path === `public/${icon.src}`);
    assert.ok(spec, `${icon.src} is governed by the branding contract`);
    const actual = image(`public/${icon.src}`);
    assert.equal(`${actual.width}x${actual.height}`, icon.sizes, `${icon.src} really is ${icon.sizes}`);
  }

  // Brand colours come from the contract, so the icons and the chrome cannot
  // drift apart.
  assert.ok(vite.includes(`theme_color: '${BRAND_COLORS.spruce}'`), 'theme_color is the brand spruce');
  assert.ok(vite.includes(`background_color: '${BRAND_COLORS.launch}'`), 'background_color is the launch colour');
});

test('the favicon and Apple touch icon are wired up and precached', () => {
  assert.match(html, /<link rel="icon" type="image\/png" href="\.\/icons\/favicon\.png" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png" \/>/);
  assert.match(html, new RegExp(`<meta name="theme-color" content="${BRAND_COLORS.spruce}"`));
  // Neither is referenced from the bundle graph, so Workbox would not precache
  // them without this: an installed PWA would then lose its tab and home-screen
  // icon offline.
  assert.match(vite, /includeAssets: \['icons\/apple-touch-icon\.png', 'icons\/favicon\.png'\]/);
});

// --- Android wiring -----------------------------------------------------------

test('the Android manifest points at the Fjällkompis launcher resources', () => {
  assert.match(androidManifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(androidManifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
});

test('the adaptive icon resolves to the brand foreground and background', () => {
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const xml = read(`android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`);
    assert.match(xml, /<adaptive-icon/, `${name} is an adaptive icon`);
    assert.match(xml, /android:drawable="@color\/ic_launcher_background"/, `${name} background resolves`);
    assert.match(xml, /android:drawable="@drawable\/ic_launcher_foreground"/, `${name} foreground resolves`);
  }
  // Both referenced resources must actually exist — a dangling reference here
  // is a build failure on Android but a silent pass for a string check.
  const background = read('android/app/src/main/res/values/ic_launcher_background.xml');
  assert.match(
    background,
    new RegExp(`<color name="ic_launcher_background">${BRAND_COLORS.plate}</color>`, 'i'),
    'the adaptive background is the brand plate, matching the maskable PWA icon',
  );
  const foreground = read('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
  assert.match(foreground, /@drawable\/fjallkompis_mark/, 'the foreground is the canonical mark');
  assert.match(foreground, /android:inset="16%"/, 'the mark stays inside the adaptive safe zone');
});

test('every launcher density is present in both square and round form', () => {
  // A missing density does not fail the build; Android just upscales a smaller
  // bitmap and the icon goes soft on exactly the devices that use it.
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
      const path = `android/app/src/main/res/mipmap-${density}/${name}`;
      assert.ok(existsSync(join(root, path)), `${path} exists`);
    }
  }
});

test('the round launcher icon is actually round', () => {
  // It was not, before the branding-parity pass: ic_launcher_round.png was a
  // byte-identical copy of the square icon, so a round-icon launcher on API
  // 24-25 — which applies NO mask of its own — drew a square amongst circles.
  // The corners must be transparent and the centre must not be.
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    const path = `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`;
    const img = image(path);
    const alphaAt = (x, y) => img.data[(y * img.width + x) * 4 + 3];
    assert.equal(alphaAt(0, 0), 0, `${path}: top-left corner is clipped away`);
    assert.equal(alphaAt(img.width - 1, 0), 0, `${path}: top-right corner is clipped away`);
    assert.equal(alphaAt(0, img.height - 1), 0, `${path}: bottom-left corner is clipped away`);
    assert.equal(alphaAt(img.width - 1, img.height - 1), 0, `${path}: bottom-right corner is clipped away`);
    assert.equal(alphaAt(img.width >> 1, img.height >> 1), 255, `${path}: the disc itself is opaque`);

    assert.ok(
      !bytes(path).equals(bytes(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`)),
      `${path} must not be a byte copy of the square icon — that is the defect this fence exists for`,
    );
  }
});

test('no generic Capacitor launcher or splash asset can silently return', () => {
  // The Capacitor Android template ships its own ic_launcher set and a
  // splash.png. Restoring them is a one-command accident (`cap add android`,
  // or copying a template res/ over this one) that no other test would catch:
  // the XML would still be valid and the app would still build.
  const forbidden = [
    'android/app/src/main/res/drawable/splash.png',
    'android/app/src/main/res/drawable-land-hdpi/splash.png',
    'android/app/src/main/res/drawable-port-hdpi/splash.png',
    'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_foreground.xml',
  ];
  for (const path of forbidden) {
    assert.ok(!existsSync(join(root, path)), `${path} is a Capacitor template asset and must stay gone`);
  }

  // The template's foreground is a vector of the Android robot; ours is the
  // Fjällkompis mark. Pin that the foreground is not a drawn shape at all.
  const foreground = read('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
  assert.ok(!/<vector|<path/.test(foreground), 'the adaptive foreground is the mark, not drawn vector art');

  // And the launcher bitmaps must be the brand plate, not whatever a template
  // shipped. The derivation check above is the real fence; this states the
  // intent in the terms a reviewer reads.
  const corner = image('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png');
  const [r, g, b] = [corner.data[0], corner.data[1], corner.data[2]];
  const expected = BRAND_COLORS.plate;
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  assert.equal(hex.toLowerCase(), expected.toLowerCase(), 'the launcher plate is the brand plate');
});

// --- Splash: only the branding-visible half; the lifecycle lives elsewhere ----

test('the splash still shows the approved mark on a plain launch colour', () => {
  const splash = read('android/app/src/main/res/drawable/fjallkompis_splash.xml');
  assert.match(splash, /@color\/fjallkompisLaunch/, 'API 24-30 splash uses the launch colour');
  assert.match(splash, /@drawable\/fjallkompis_mark/, 'API 24-30 splash uses the canonical mark');
  // API 31+ composes its splash from the theme instead.
  assert.match(
    styles,
    /<item name="windowSplashScreenBackground">@color\/fjallkompisLaunch<\/item>/,
    'API 31+ splash background is the launch colour',
  );
  assert.match(
    styles,
    /<item name="windowSplashScreenAnimatedIcon">@drawable\/ic_launcher_foreground<\/item>/,
    'API 31+ splash icon is the adaptive foreground — the same mark, same inset',
  );
});

test('the post-splash window background is still a plain colour', () => {
  // Load-bearing history: a DRAWABLE here froze the launch splash into the
  // decor background on the Samsung, leaving the logo hovering above every
  // screen as if it were app chrome. tests/native-runtime.test.mjs owns the
  // full handoff contract; branding must never be the thing that reintroduces
  // a drawable, so it is restated against the branding surfaces too.
  const block = styles.slice(
    styles.indexOf('<style name="AppTheme.NoActionBar"'),
    styles.indexOf('</style>', styles.indexOf('<style name="AppTheme.NoActionBar"')),
  );
  assert.match(block, /<item name="android:windowBackground">@color\//, 'a colour, never a drawable');
  assert.ok(!/@drawable\//.test(block), 'the running app theme references no drawable at all');
});

// --- The contract itself ------------------------------------------------------

test('the contract governs every branding asset in the tree', () => {
  // A new icon added to public/icons or mipmap-* without a contract entry is
  // exactly the drift this whole file exists to prevent: it would be
  // unverified, and nobody would know it had stopped matching the master.
  const governed = new Set([...MASTER_COPIES, ...DERIVED].map((s) => s.path).concat(MASTER));

  const strays = [];
  for (const file of readdirSync(join(root, 'public/icons'))) {
    if (!governed.has(`public/icons/${file}`)) strays.push(`public/icons/${file}`);
  }
  for (const dir of readdirSync(join(root, 'android/app/src/main/res')).filter((d) => d.startsWith('mipmap-'))) {
    for (const file of readdirSync(join(root, `android/app/src/main/res/${dir}`))) {
      // The anydpi-v26 adaptive XML is a composition of governed resources,
      // not a raster derivation, so it is checked structurally above instead.
      if (file.endsWith('.xml')) continue;
      const path = `android/app/src/main/res/${dir}/${file}`;
      if (!governed.has(path)) strays.push(path);
    }
  }
  assert.deepEqual(strays, [], 'these branding assets have no entry in assets/brand/brand.contract.mjs');
});
