/**
 * Stop imagery — a DISTRIBUTION contract, not a layout one.
 *
 * Fjällkompis is a public repository that publishes a GitHub Pages build. It
 * once shipped eight stop photographs marked in code as "temporary placeholder
 * — do not redistribute" plus a committed STF logo. Nothing in the repository
 * ever established a redistribution right for any of them, so they were
 * removed rather than re-credited.
 *
 * These tests fence the thing that actually goes wrong: not "does a card look
 * right" but "does an unlicensed byte reach a user". That makes source paths
 * and build inputs legitimate test subjects — everything under public/ is
 * copied verbatim into dist/ and swept into the Workbox precache by
 * globPatterns, so absence there IS absence from the distribution.
 *
 * What is deliberately NOT pinned: pixel values, SVG geometry, or large JSX
 * blocks. The stop cards may be redesigned freely; they may not start
 * redistributing someone else's photograph again.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRAIL_CONTENT } from '../src/data/trailMetadata.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stopsSrc = readFileSync(join(root, 'src/data/stops.ts'), 'utf8');
const stopVisual = readFileSync(join(root, 'src/components/StopVisual.tsx'), 'utf8');
const types = readFileSync(join(root, 'src/types/index.ts'), 'utf8');
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');

/** The exact assets withdrawn, by the names they were published under. */
const REMOVED_STOP_PHOTOS = [
  'abisko.webp',
  'abiskojaure.webp',
  'alesjaure.webp',
  'kebnekaise.webp',
  'nikkaluokta.webp',
  'salka.webp',
  'singi.webp',
  'tjaktja.webp',
];
const REMOVED_LOGO = 'stf-logo.png';

/** Strings that only ever appeared alongside the unlicensed assets. */
const FORBIDDEN_STRINGS = [
  'stops-placeholder',
  'stf-logo',
  'temporary placeholder',
  'do not redistribute',
];

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// ---- The assets are gone from what we distribute ---------------------------

test('the placeholder photo directory is not in the build input', () => {
  assert.ok(
    !existsSync(join(root, 'public/images/stops-placeholder')),
    'public/images/stops-placeholder must not exist — public/ is copied verbatim into dist/',
  );
});

test('no removed asset survives anywhere under public/', () => {
  const published = walk(join(root, 'public')).map((f) => relative(root, f));
  for (const name of [...REMOVED_STOP_PHOTOS, REMOVED_LOGO]) {
    const hits = published.filter((f) => f.endsWith(`/${name}`));
    assert.deepEqual(hits, [], `${name} must not be published`);
  }
});

test('production source references none of the removed assets', () => {
  const sources = walk(join(root, 'src')).filter((f) => /\.(ts|tsx|mjs|css)$/.test(f));
  assert.ok(sources.length > 50, 'the sweep actually walked the source tree');
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const needle of FORBIDDEN_STRINGS) {
      assert.ok(
        !text.toLowerCase().includes(needle),
        `${relative(root, file)} still references "${needle}"`,
      );
    }
    for (const name of REMOVED_STOP_PHOTOS) {
      assert.ok(!text.includes(name), `${relative(root, file)} still references ${name}`);
    }
  }
});

test('the build and precache contracts do not name a removed asset', () => {
  // includeAssets is the explicit precache list; globPatterns is the sweep.
  // Neither may name a withdrawn file. The webp pattern itself stays: it is
  // the documented route for a genuinely licensed photo added later.
  for (const needle of [...FORBIDDEN_STRINGS, REMOVED_LOGO]) {
    assert.ok(!viteConfig.includes(needle), `vite.config.ts still names "${needle}"`);
  }
  assert.match(viteConfig, /globPatterns:/, 'the precache sweep is still configured');
});

// ---- Stop records are valid, and unchanged, without imagery ----------------

test('no stop carries an image, and none needs one', () => {
  assert.doesNotMatch(stopsSrc, /\bimage:/, 'no stop record declares an image');
  assert.doesNotMatch(stopsSrc, /placeholder\s*\(/, 'the placeholder factory is gone');
  assert.doesNotMatch(stopsSrc, /license:/, 'no licence record remains to be misleading');
  // Absence is expressed by omitting an optional field — never by a fake URL
  // or an empty string standing in for a photograph.
  assert.doesNotMatch(stopsSrc, /image\s*:\s*(null|undefined|'')/);
  assert.match(types, /image\?: StopImage;/, 'the field stays optional, so absence is valid');
});

test('all eight stops still carry their facts, sources and identity', () => {
  const ids = [...stopsSrc.matchAll(/^ {4}id: '([a-z-]+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(ids, [
    'abisko',
    'abiskojaure',
    'alesjaure',
    'tjaktja',
    'salka',
    'singi',
    'kebnekaise',
    'nikkaluokta',
  ]);
  // Every stop keeps a verified source — removing photos touched no fact.
  const sources = stopsSrc.match(/lastVerified: FACTS_VERIFIED_ON/g) ?? [];
  assert.equal(sources.length, ids.length, 'every stop keeps its verified source');
  assert.match(stopsSrc, /FACTS_VERIFIED_ON = '2026-07-02'/, 'the verification date is untouched');
  // Facilities, opening periods and capacities are facts, not imagery.
  assert.equal((stopsSrc.match(/facilities: \[/g) ?? []).length, ids.length);
  assert.ok(stopsSrc.includes('summerOpening2026:'));
  assert.ok(stopsSrc.includes('bedCapacity:'));
});

// ---- The fallback is app-owned, offline and decorative ---------------------

test('the fallback fetches nothing — it is drawn from our own route data', () => {
  const fallback = stopVisual.slice(stopVisual.indexOf('if (!sil) return null'));
  assert.doesNotMatch(fallback, /https?:\/\//, 'no external URL in the fallback');
  assert.doesNotMatch(fallback, /<img/, 'the fallback is not an image request');
  // url(#…) is an in-document SVG paint reference (our own gradients) and
  // fetches nothing; any other url() would be a request.
  assert.doesNotMatch(fallback, /url\((?!#)/, 'no fetched asset either');
  assert.match(fallback, /<svg /, 'an inline SVG, generated from the elevation profile');
});

test('the fallback is decoration: hidden from AT, and it never renames the stop', () => {
  const fallback = stopVisual.slice(stopVisual.indexOf('if (!sil) return null'));
  // The drawing itself is hidden…
  assert.match(fallback, /<svg[^>]*aria-hidden/);
  // …and it is not re-exposed as an image with a label. The card heading and
  // the official-name paragraph already announce the stop; a role="img" label
  // would make that three times.
  assert.doesNotMatch(fallback, /role="img"/);
  assert.doesNotMatch(fallback, /aria-label=/);
  // No empty alt text left behind to be announced as content.
  assert.doesNotMatch(fallback, /alt=""/);
  // The one real fact it carries stays readable text, not an image label.
  assert.match(fallback, /className="stop-visual-tag"/);
});

test('a licensed photo remains possible, and would be a real photo or nothing', () => {
  // The image branch is kept for a photo we may lawfully redistribute; it is
  // not a decoration path, so it keeps a genuine alt.
  assert.match(stopVisual, /if \(stop\.image\)/);
  assert.match(stopVisual, /alt=\{stop\.image\.alt\}/);
});

// ---- No STF brand asset, but STF the organisation stays named --------------

test('the membership button is app-owned iconography, not the STF mark', () => {
  const quickAccess = readFileSync(
    join(root, 'src/components/MembershipQuickAccess.tsx'),
    'utf8',
  );
  assert.doesNotMatch(quickAccess, /<img/);
  assert.match(quickAccess, /IdCard/, 'a generic credential glyph from the existing icon set');
  assert.match(quickAccess, /aria-label="Open STF membership card"/);
});

test('factual references to STF as an organisation and source are preserved', () => {
  // Removing a brand ASSET must not erase who the facts came from.
  assert.match(stopsSrc, /STF Abisko Turiststation/);
  assert.match(stopsSrc, /swedishtouristassociation\.com/);
  const attribution = readFileSync(join(root, 'src/data/attribution.ts'), 'utf8');
  assert.match(attribution, /Svenska Turistföreningen \(STF\)/);
});

// ---- Committed screenshots are a distribution channel too -------------------

/**
 * Captures in which the membership quick access was on screen also reproduced
 * the STF roundel, so they went with the asset. Pinned by name rather than by
 * pixel inspection on purpose: CI has no image toolchain, and a filename list
 * is the part that must not silently come back.
 */
const WITHDRAWN_CAPTURES = [
  'docs/verification/tonight-card/after-A-travel-linked-abisko-2qa-320x667.png',
  'docs/verification/tonight-card/after-A-travel-linked-abisko-2qa-375x667.png',
  'docs/verification/tonight-card/after-B-hiking-explicit-abiskojaure-1qa-320x667.png',
  'docs/verification/tonight-card/after-B-hiking-explicit-abiskojaure-1qa-375x667.png',
  'docs/verification/tonight-card/after-B3-hiking-dated-linked-stay-375x667.png',
  'docs/verification/tonight-card/after-E-generic-offroute-stay-375x667.png',
  'docs/verification/tonight-card/before-A-travel-linked-abisko-2qa-375x667.png',
  'docs/verification/tonight-card/before-B-hiking-explicit-abiskojaure-1qa-375x667.png',
  'docs/verification/tonight-card/before-B2-hiking-dated-unlinked-stay-375x667.png',
  'docs/verification/curated-place-tonight/kiruna-320x667.png',
  'docs/verification/curated-place-tonight/kiruna-375x667.png',
];

test('no withdrawn brand capture is back in the repository', () => {
  for (const rel of WITHDRAWN_CAPTURES) {
    assert.ok(!existsSync(join(root, rel)), `${rel} must stay withdrawn`);
  }
});

test('removing them left no dangling link in the evidence docs', () => {
  // Scoped to the directories this change edited — the repo carries older
  // unrelated link debt elsewhere, and widening this would just be noise.
  const dirs = ['docs/verification', 'docs/pr-evidence'];
  const docs = dirs.flatMap((d) => walk(join(root, d))).filter((f) => f.endsWith('.md'));
  assert.ok(docs.length > 0, 'the sweep found the evidence READMEs');
  for (const doc of docs) {
    const text = readFileSync(doc, 'utf8');
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const file = target.split('#')[0];
      if (!file) continue;
      assert.ok(
        existsSync(join(dirname(doc), file)),
        `${relative(root, doc)} links to missing ${file}`,
      );
    }
  }
});

// ---- This PR changed no trail fact ----------------------------------------

test('withdrawing imagery is not a content revision', () => {
  assert.equal(TRAIL_CONTENT.contentVersion, 1, 'no dossier fact changed');
  assert.equal(TRAIL_CONTENT.lastFullyReviewedOn, undefined, 'no review date is implied');
});
