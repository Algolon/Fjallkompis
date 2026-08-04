/** Today hiking-hero derivation, responsive material and navigation contracts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hikingDayRouteFocus } from '../src/plan/hikingDayHero.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = readFileSync(join(root, 'src/components/TodayOnRoute.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const stagesScreen = readFileSync(join(root, 'src/screens/StagesScreen.tsx'), 'utf8');

const points = (base) => [
  { lat: base, lon: base + 0.1 },
  { lat: base + 0.2, lon: base + 0.3 },
];
const stage = (id, from, to, distanceKm, routePoints = points(1)) => ({
  id,
  fromHutId: from,
  toHutId: to,
  distanceKm,
  points: routePoints,
});
const leg = (id, stageValue) => ({ id, stageId: stageValue.id, stage: stageValue });

test('reverse-route combined day keeps its oriented leg order in the map focus', () => {
  const d4Reverse = stage('d4', 'salka', 'tjaktja', 12.648, points(4).reverse());
  const d3Reverse = stage('d3', 'tjaktja', 'alesjaure', 13.224, points(3).reverse());
  const day = { legs: [leg('leg-4r', d4Reverse), leg('leg-3r', d3Reverse)] };
  const focus = hikingDayRouteFocus(day);
  assert.equal(focus.tracks.length, 2);
  assert.deepEqual(focus.tracks[0][0], { lat: 4.2, lng: 4.3 });
  assert.deepEqual(focus.destination, { lat: 3, lng: 3.1 });
});

test('combined route navigation retains one verified track per leg', () => {
  const a = stage('a', 'one', 'two', 1, points(1));
  const b = stage('b', 'far-three', 'far-four', 2, points(8));
  const focus = hikingDayRouteFocus({ legs: [leg('leg-a', a), leg('leg-b', b)] });
  assert.equal(focus.tracks.length, 2);
  assert.deepEqual(focus.tracks[0].at(-1), { lat: 1.2, lng: 1.3 });
  assert.deepEqual(focus.tracks[1][0], { lat: 8, lng: 8.1 });
});

test('combined Stage guide and View route target all day-owned content', () => {
  assert.match(today, /guideStageIds: uniqueGuideStageIds/);
  assert.match(today, /guideReversedStageIds: uniqueReversedStageIds/);
  assert.match(today, /tracks: routeFocus\.tracks/);
  assert.match(app, /initialGuideStageIds=\{nav\.payload\?\.guideStageIds\}/);
  assert.match(stagesScreen, /new Set<string>\(initiallyOpenGuideIds\)/);
});

// The segment-row breakdown was retired for hero compactness: a combined day
// communicates through the aggregate subtitle alone, while the ordered legs
// stay in the plan and keep driving both actions' navigation.
test('combined day keeps the compact stages subtitle and NO segment-row list', () => {
  assert.match(today, /\{day\.stages\.length\} stages\{viaNames\.length > 0 \?/);
  assert.match(css, /\.hero-via--stages \{/);
  assert.doesNotMatch(today, /hero-segment|CombinedStageSummary|hikingDaySegments/);
  assert.doesNotMatch(css, /hero-segment/);
});

// Small uppercase copper eyebrow: #f5c97b is the darkest established
// cloudberry-family value holding WCAG AA on the spruce hero (6.25:1 vs
// #2f4a3d and #243c31; #d2a15f measures 4.15:1 and fails). The activity and
// reverse glyphs inherit the accent via currentColor.
test('hero eyebrow carries the accessible copper accent', () => {
  assert.match(css, /\.hero-day \{[^}]*color: #f5c97b;/s);
});

test('320 px rules retain two 44 px glass actions without horizontal overflow', () => {
  assert.match(css, /\.hero-action \{[^}]*min-width: 0;[^}]*min-height: 44px;/s);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*?\.hero-action \{\s*padding-inline: 8px;/);
});

test('glass has readable no-filter and reduced-transparency fallbacks', () => {
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)/);
  assert.match(css, /\.hero-action--glass \{[^}]*backdrop-filter: blur\(var\(--glass-blur/s);
});

// The action material IS the Today panel material (.today-glass--light /
// .today-mode) plus one uniform tint per variant: the shared --glass-* knobs
// for the backdrop lift, the capsule's ::before optical edge (hairline
// --glass-rim + 1px --glass-highlight), a flat --action-tint fill, and the
// shared brightness-pop hover. Vertical branded gradients, glossy caps and
// dark bases are explicitly REJECTED constructions (PR #92 review).
test('branded actions reuse the panel glass material with one uniform tint', () => {
  const glassStart = css.indexOf('.hero-action--glass {');
  const block = css.slice(glassStart, css.indexOf('.hero + .card', glassStart));
  assert.match(block, /\.hero-action--glass \{[^}]*background: var\(--action-tint\)/s);
  assert.match(block, /\.hero-action--glass \{[^}]*blur\(var\(--glass-blur[^}]*saturate\(var\(--glass-saturate[^}]*brightness\(var\(--glass-brightness/s);
  assert.match(block, /\.hero-action--glass::before \{[^}]*inset 0 0 0 var\(--glass-rim-w[^}]*var\(--glass-rim/s);
  assert.match(block, /\.hero-action--glass::before \{[^}]*inset 0 1px 0 var\(--glass-highlight/s);
  assert.match(block, /\.hero-action--glass:hover \{\s*filter: brightness\(1\.07\)/);
  // One constant colour per surface — no gradient anywhere in the action glass.
  assert.doesNotMatch(block, /linear-gradient/);
  // Control-sized frost: the pill scopes the SHARED --glass-blur knob one
  // step below the card panes so the elevation line stays legible through it
  // (exact px free to tune; the contract is a scoped shared-knob override).
  assert.match(block, /\.hero-action--glass \{[^}]*--glass-blur: [\d.]+px;/s);
});

test('one shared HikingHeroActions renders both branded glass actions', () => {
  assert.match(today, /function HikingHeroActions\(/);
  assert.equal((today.match(/<HikingHeroActions\b/g) ?? []).length, 2);
  assert.match(today, /className="hero-action hero-action--glass hero-action--primary"/);
  assert.match(today, /className="hero-action hero-action--glass"/);
});

// Each variant supplies ONE uniform tint. The values are the house tokens
// pre-lightened along their own hue so the pane re-composites to ≈ the
// original solid action colours (--cloudberry #b78443 / --glacier #6a8d95)
// over the dark hero — never a low-alpha token wash that turns khaki or
// grey-teal. Alphas stay free to tune; the triplets are the contract.
test('Stage guide is cloudberry glass; View route is glacier glass', () => {
  assert.match(css, /--cloudberry: #b78443/);
  assert.match(css, /--glacier: #6a8d95/);
  const glassStart = css.indexOf('.hero-action--glass {');
  const glass = css.slice(glassStart, css.indexOf('@media (hover: hover)', glassStart));
  const primaryStart = glass.indexOf('.hero-action--glass.hero-action--primary');
  const secondary = glass.slice(0, primaryStart);
  const primary = glass.slice(primaryStart);
  assert.match(secondary, /--action-tint: rgba\(131, 172, 189, 0\.\d+\)/);
  assert.match(primary, /--action-tint: rgba\(234, 154, 68, 0\.\d+\)/);
});

// Without backdrop-filter (and under reduced-transparency/more-contrast) the
// surfaces densify but the copper-versus-glacier identities must survive as
// two DIFFERENT branded tints, never one shared neutral: near-solid token
// fills without blur, darker family steps in the accessibility modes.
test('fallback and reduced-transparency surfaces stay separately branded', () => {
  const supportsStart = css.indexOf('@supports not ((backdrop-filter: blur(1px))');
  // Search from the hero's own @supports block: the Map cockpit carries an
  // earlier reduced-transparency block for its map-surface controls.
  const reducedStart = css.indexOf(
    '@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)',
    supportsStart,
  );
  const afterGlass = css.indexOf('.hero + .card');
  assert.ok(supportsStart > -1 && supportsStart < reducedStart && reducedStart < afterGlass);
  const noFilter = css.slice(supportsStart, reducedStart);
  assert.match(noFilter, /\.hero-action--glass \{[^}]*--action-tint: rgba\(106, 141, 149, 0\.9\d+\)/s);
  assert.match(noFilter, /\.hero-action--glass\.hero-action--primary \{[^}]*--action-tint: rgba\(183, 132, 67, 0\.9\d+\)/s);
  const reduced = css.slice(reducedStart, afterGlass);
  assert.match(reduced, /\.hero-action--glass \{[^}]*--action-tint: rgba\(74, 101, 109, 0\.9\d+\)/s);
  assert.match(reduced, /\.hero-action--glass\.hero-action--primary \{[^}]*--action-tint: rgba\(154, 106, 62, 0\.9\d+\)/s);
});

test('travel and rest hero actions keep the original solid fills', () => {
  assert.match(css, /\n\.hero-action \{[^}]*background: var\(--glacier\);/s);
  assert.match(css, /\n\.hero-action--primary \{[^}]*background: var\(--cloudberry\);/s);
  assert.match(today, /className="hero-action hero-action--primary"/);
});
