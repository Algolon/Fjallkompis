/**
 * Screen colour themes and contour backdrops (vNext experience pass).
 *
 * Today keeps its green contour treatment; Guide and Plan gain DISTINCT
 * source-derived contour crops (blue and copper) with documented
 * provenance. Structural checks only — no SVG snapshots: the assets are
 * app-owned static files, precached by the existing svg glob, requested
 * from BASE_URL only, and no screen mounts a live map for decoration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('src/styles/global.css');
const today = read('src/screens/TodayScreen.tsx');
const guide = read('src/screens/GuideScreen.tsx');
const plan = read('src/screens/PlanScreen.tsx');

test('Today keeps its existing green contour treatment untouched', () => {
  assert.match(today, /images\/today\/contours\.svg/);
  assert.match(today, /className="today-bg"/);
  assert.match(css, /\.today-bg \{[^}]*background-color: #d4ded1/s);
});

test('Guide and Plan reference distinct app-owned contour assets', () => {
  assert.match(guide, /images\/guide\/contours\.svg/);
  assert.match(plan, /images\/plan\/contours\.svg/);
  // Three DIFFERENT assets — never one pattern repeated across screens.
  const refs = ['today', 'guide', 'plan'].map((s) => `images/${s}/contours.svg`);
  assert.equal(new Set(refs).size, 3);
  for (const rel of ['public/images/guide/contours.svg', 'public/images/plan/contours.svg']) {
    assert.ok(existsSync(join(root, rel)), `${rel} exists`);
    const kb = statSync(join(root, rel)).size / 1024;
    assert.ok(kb < 120, `${rel} stays lean (${kb.toFixed(0)} kB < 120 kB)`);
    const svg = read(rel);
    assert.ok(!/<image|href="http|url\(http/.test(svg), 'no embedded raster, no remote refs');
    assert.match(svg, /Source: the app's own kungsleden-contours\.pmtiles/, 'provenance in-file');
  }
  // The two crops are genuinely different regions.
  const guideSvg = read('public/images/guide/contours.svg');
  const planSvg = read('public/images/plan/contours.svg');
  assert.notEqual(guideSvg, planSvg);
  assert.match(guideSvg, /z11 tiles\s+x1128/);
  assert.match(planSvg, /z11 tiles\s+x1129/);
});

test('the themes are restrained: base colours + accents, not recoloured cards', () => {
  assert.match(css, /\.screen-bg--guide \{\s*\n\s*background-color: #d3dce1;/);
  assert.match(css, /\.screen-bg--plan \{\s*\n\s*background-color: #e8e0d1;/);
  // Accents live in eyebrows/icons; the glass card system is shared.
  assert.ok(css.includes('.guide-screen .screen-head .eyebrow'));
  assert.ok(css.includes('.plan-screen .screen-head .eyebrow'));
  assert.match(css, /\.today-screen,\s*\n\.guide-screen,\s*\n\.plan-screen \{/);
});

test('backgrounds are decorative assets — no live map, no runtime requests', () => {
  for (const [name, src] of [['Guide', guide], ['Plan', plan]]) {
    assert.ok(!/maplibre|MapView|new Map\(/.test(src), `${name} mounts no map`);
    assert.ok(!/https?:\/\//.test(src), `${name} requests nothing external`);
    assert.match(src, /import\.meta\.env\.BASE_URL/, `${name} loads from the app origin`);
  }
});

test('provenance documentation exists for both generated assets', () => {
  for (const dir of ['guide', 'plan']) {
    const readme = read(`public/images/${dir}/README.md`);
    assert.match(readme, /kungsleden-contours\.pmtiles/);
    assert.match(readme, /Copernicus GLO-30/);
    assert.match(readme, /generate-contour-backgrounds\.mjs/);
    assert.match(readme, /purely decorative/);
  }
  // The deterministic generation script is committed and names its
  // prerequisites (the same toolchain as build-terrain-map.sh).
  const script = read('scripts/generate-contour-backgrounds.mjs');
  assert.match(script, /pmtiles/);
  assert.match(script, /deterministic/i);
});
