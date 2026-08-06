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
const themes = read('src/styles/section-themes.css');
const today = read('src/screens/TodayScreen.tsx');
const guide = read('src/screens/GuideScreen.tsx');
const plan = read('src/screens/PlanScreen.tsx');
const backdrop = read('src/components/SectionBackdrop.tsx');
const app = read('src/App.tsx');

test('Today keeps its existing green contour treatment untouched', () => {
  assert.match(today, /images\/today\/contours\.svg/);
  assert.match(today, /className="today-bg"/);
  assert.match(css, /\.today-bg \{[^}]*background-color: #d4ded1/s);
});

test('Guide and Plan reference distinct app-owned contour assets', () => {
  // The shell-level backdrop (SectionBackdrop, mounted by App.tsx outside
  // the per-destination <main> remount) is the single owner of both refs.
  assert.match(backdrop, /images\/guide\/contours\.svg/);
  assert.match(backdrop, /images\/plan\/contours\.svg/);
  assert.match(app, /SectionBackdrop/);
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
  assert.match(guideSvg, /z13 tiles\s+x4512/);
  assert.match(planSvg, /z13 tiles\s+x4516/);
});

test('one contour design system: the three assets share Today’s line weight', () => {
  // Line weight is a RENDERED property. All three are background-size:cover
  // layers in the same box, so a shared stroke-width only lands on the same
  // visual weight when the viewBox (and therefore the cover scale factor) is
  // identical. A larger viewBox is exactly what made the first Guide/Plan
  // assets look spindly — pin the invariant, not the pixels.
  const viewBoxes = ['today', 'guide', 'plan'].map((s) => {
    const svg = read(`public/images/${s}/contours.svg`);
    return {
      screen: s,
      viewBox: svg.match(/viewBox="([^"]+)"/)?.[1],
      width: svg.match(/stroke-width="([\d.]+)"/)?.[1],
      opacity: svg.match(/stroke-opacity="([\d.]+)"/)?.[1],
    };
  });
  const today = viewBoxes[0];
  for (const asset of viewBoxes.slice(1)) {
    assert.equal(asset.viewBox, today.viewBox, `${asset.screen} shares Today’s viewBox`);
    assert.equal(asset.width, today.width, `${asset.screen} shares Today’s stroke-width`);
    assert.equal(asset.opacity, today.opacity, `${asset.screen} shares Today’s stroke opacity`);
  }
  // The generator derives that viewBox from Today's rather than restating it.
  const script = read('scripts/generate-contour-backgrounds.mjs');
  assert.match(script, /VIEWBOX_W = 295\.77/);
  assert.match(script, /VIEWBOX_H = 453\.5/);
  // Index contours only, from the archive's least-simplified zoom — the
  // smoothing input, not a post-hoc redraw.
  assert.match(script, /INDEX_INTERVAL_M = 100/);
  assert.match(script, /elev % INDEX_INTERVAL_M !== 0/);
  for (const asset of ['guide', 'plan']) {
    assert.match(read(`public/images/${asset}/contours.svg`), /100 m index contours only/);
  }
});

test('Guide and Plan fade like Today, so the fixed backdrop cannot resize', () => {
  // ROOT CAUSE of the first-open flicker: the generic .screen fade animates
  // TRANSFORM, and an animating transform makes .screen the containing block
  // for its position:fixed children — the contour layer sized itself to the
  // screen's CONTENT box (measured 375×592 on Guide, 375×640 on Plan) for
  // the length of the fade and then snapped to the 375×812 viewport. Today
  // already opted out via an opacity-only fade; Guide and Plan now do too.
  assert.match(css, /\.guide-screen,\n\.plan-screen \{\n  animation-name: fade-opacity;\n\}/);
  assert.match(css, /\.today-screen \{[\s\S]*?animation-name: fade-opacity;/);
  assert.match(css, /@keyframes fade-opacity \{\s*\n\s*from \{\s*\n\s*opacity: 0;/);
  // Nothing animates the layer's own geometry either: a transition on size,
  // position or transform would reintroduce a visible settle.
  const layer = css.slice(css.indexOf('.screen-bg {'), css.indexOf('}', css.indexOf('.screen-bg {')));
  assert.ok(!/transition|animation/.test(layer), 'the contour layer itself is inert');
  assert.match(layer, /position: fixed/, 'viewport-anchored, like .today-bg');
});

test('the themes are restrained: base colours + accents, not recoloured cards', () => {
  // The backdrop base colours now flow from the semantic section tokens
  // (section-themes.css) — one source for home and every subroute.
  assert.match(css, /\.screen-bg--guide,\s*\n\.screen-bg--plan \{\s*\n\s*background-color: var\(--section-surface\);/);
  assert.match(themes, /\.theme-guide \{[^}]*--section-surface: #d3dce1;/s);
  assert.match(themes, /\.theme-plan \{[^}]*--section-surface: #e8e0d1;/s);
  // Accents live in eyebrows/icons; the glass card system is shared.
  assert.ok(themes.includes('.theme-guide .screen-head .eyebrow'));
  assert.ok(themes.includes('.theme-plan .screen-head .eyebrow'));
  assert.match(css, /\.today-screen,\s*\n\.guide-screen,\s*\n\.plan-screen \{/);
});

test('backgrounds are decorative assets — no live map, no runtime requests', () => {
  for (const [name, src] of [['Guide', guide], ['Plan', plan], ['SectionBackdrop', backdrop]]) {
    assert.ok(!/maplibre|MapView|new Map\(/.test(src), `${name} mounts no map`);
    assert.ok(!/https?:\/\//.test(src), `${name} requests nothing external`);
  }
  assert.match(backdrop, /import\.meta\.env\.BASE_URL/, 'backdrop loads from the app origin');
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
