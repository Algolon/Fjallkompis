/**
 * Section colour identity (Guide glacier / Plan cloudberry-copper).
 *
 * The theme is ONE class on the app shell (App.tsx: .theme-guide /
 * .theme-plan from the active tab) driving semantic custom properties in
 * src/styles/section-themes.css. These tests pin the semantics — token
 * sourcing, single point of application, nav active states, preserved
 * status colours, text contrast — not full CSS blocks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TAB_ROUTES } from '../src/navigation/routes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const themes = read('src/styles/section-themes.css');
const globalCss = read('src/styles/global.css');
const polish = read('src/styles/mobile-shell-plan-polish.css');
const app = read('src/App.tsx');
const html = read('index.html');

const themeBlock = (name) => {
  const start = themes.indexOf(`.${name} {`);
  assert.ok(start >= 0, `${name} theme exists`);
  return themes.slice(start, themes.indexOf('}', start));
};

// --- Theme foundation -------------------------------------------------------

test('the shell applies exactly one semantic theme class per section', () => {
  // Derived from the active tab in ONE place; no component or route checks
  // the pathname to pick colours.
  assert.match(app, /nav\.tab === 'guide' \|\| nav\.tab === 'plan' \? nav\.tab : null/);
  assert.match(app, /theme-\$\{sectionTheme\}/);
  // Today / Map / Settings stay unthemed — the ternary yields null for them,
  // and no screen source hardcodes a section colour.
  for (const screen of [
    'src/screens/GuideScreen.tsx',
    'src/screens/PlanScreen.tsx',
    'src/screens/StagesScreen.tsx',
    'src/screens/StopsScreen.tsx',
  ]) {
    assert.ok(
      !/#[0-9a-fA-F]{6}\b/.test(read(screen)),
      `${screen} carries no hardcoded theme colour`,
    );
  }
});

test('Guide tokens come from the glacier family, Plan from cloudberry/copper', () => {
  const guide = themeBlock('theme-guide');
  const plan = themeBlock('theme-plan');
  // Guide: the established Guide-tile glyph tones + the app's glacier ring.
  assert.match(guide, /--section-accent: #43707f;/);
  assert.match(guide, /--section-accent-strong: #35606f;/);
  assert.match(guide, /--section-focus: var\(--glacier-700\);/);
  // Plan: the cloudberry family, with the -700 text-safe dark added to the
  // brand block in global.css (same convention as spruce/glacier).
  assert.match(plan, /--section-accent: #9d6a3e;/);
  assert.match(plan, /--section-accent-strong: var\(--cloudberry-700\);/);
  assert.match(globalCss, /--cloudberry-700: #7c5029;/);
  // Both define the full semantic set.
  for (const block of [guide, plan]) {
    for (const token of [
      '--section-accent:',
      '--section-accent-strong:',
      '--section-accent-soft:',
      '--section-surface:',
      '--section-border:',
      '--section-focus:',
      '--section-fill:',
    ]) {
      assert.ok(block.includes(token), `theme defines ${token}`);
    }
  }
});

test('accent-strong text tones actually clear 4.5:1 on their section surface', () => {
  // WCAG relative-luminance contrast, computed — not a hand-maintained claim.
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const paper = '#e6ede3';
  const cases = [
    // [text tone, section contour surface] — the canvases are the source
    // families' own soft variants (--glacier-soft / --cloudberry-soft).
    ['#35606f', '#d7e5e8'], // Guide strong on --glacier-soft
    ['#7c5029', '#f0e1cb'], // Plan strong (--cloudberry-700) on --cloudberry-soft
    ['#55675b', '#d7e5e8'], // ink-soft intro copy on the Guide canvas
    ['#55675b', '#f0e1cb'], // ink-soft intro copy on the Plan canvas
    // Card-surface tints must keep secondary text readable.
    ['#55675b', '#e6eef0'], // ink-soft on the Guide card tint
    ['#55675b', '#f4ecdd'], // ink-soft on the Plan card tint
  ];
  for (const [ink, surface] of cases) {
    assert.ok(contrast(ink, surface) >= 4.5, `${ink} on ${surface} ≥ 4.5:1`);
    assert.ok(contrast(ink, paper) >= 4.5, `${ink} on paper ≥ 4.5:1`);
  }
  // Filled copper controls use the darker fill — white on raw --cloudberry
  // would fail, white on the fill must pass.
  assert.match(themeBlock('theme-plan'), /--section-fill: #8d5c33;/);
  assert.ok(contrast('#ffffff', '#8d5c33') >= 4.5, 'white on the copper fill ≥ 4.5:1');
  // Filled selected controls (segments/chips) and the filled icon badges:
  // control ink is text (≥4.5:1 on glacier-700), badge glyphs are graphics
  // (≥3:1 on the raw brand fills they quote — --glacier and --cloudberry).
  assert.ok(contrast('#ffffff', '#4a656d') >= 4.5, 'white on glacier-700 fill ≥ 4.5:1');
  assert.ok(contrast('#ffffff', '#6a8d95') >= 3, 'white glyph on --glacier badge ≥ 3:1');
  assert.ok(contrast('#ffffff', '#b78443') >= 3, 'white glyph on --cloudberry badge ≥ 3:1');
});

test('the app-global chrome decisions stay untouched (PR #114/#115)', () => {
  assert.match(html, /<meta name="theme-color" content="#2f4a3d" \/>/);
  assert.match(polish, /--tabbar-surface-opaque: #d4ded1;/);
  assert.match(polish, /html \{\n  background-color: var\(--tabbar-surface-opaque\);/);
  // The section layer never restyles the document canvas or the tab bar
  // surface itself — only the active tab's ink and pill fill.
  assert.ok(!themes.includes('html'), 'no document-canvas rule');
  assert.ok(!/\.tabbar\s*\{/.test(themes), 'no tab-bar surface rule');
});

// --- Bottom navigation ------------------------------------------------------

test('the bottom navigation stays neutral — no section-specific tab styling', () => {
  // Guide, Map, Plan and Settings share ONE neutral active treatment (the
  // global spruce ink + --line-strong pill; Map is the reference), and the
  // theme layer may not touch the tab bar at all: outside its comments the
  // file contains no .tab selector of any kind.
  const code = themes.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!code.includes('.tab'), 'no .tab rules in the section theme layer');
  assert.match(globalCss, /\.tab\[aria-current='page'\] \.tab-pill \{[^}]*background: var\(--spruce\);/s);
  assert.match(globalCss, /\.tab\[aria-current='page'\] \{\s*\n\s*color: #eef3ec;/);
  // Colour-only layer: the entire file may not declare any box geometry or
  // type sizing — theming can never shift layout.
  assert.ok(
    !/\b(width|height|padding|margin|font-size|gap|border-radius|top|bottom|left|right)\s*:/.test(themes),
    'section-themes.css declares no geometry',
  );
  // The selected-tab treatment is one destination-agnostic rule, and no
  // section theme may override it — the bar reads the same on every screen.
  assert.ok(!/\.tab--center/.test(globalCss), 'no per-destination tab exception exists to theme');
  // Against RULES, not prose: the file's own comment says it contains no .tab
  // rules, and that sentence should stay allowed to exist.
  const themeRules = themes.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\.tab\b/.test(themeRules), 'section themes never restyle the navigation');
});

test('the shell still offers exactly five destinations', () => {
  assert.equal(TAB_ROUTES.length, 5);
  assert.deepEqual(
    TAB_ROUTES.map((r) => r.tab),
    ['guide', 'map', 'today', 'plan', 'settings'].sort((a, b) =>
      TAB_ROUTES.findIndex((r) => r.tab === a) - TAB_ROUTES.findIndex((r) => r.tab === b),
    ),
  );
});

// --- Propagation ------------------------------------------------------------

test('the contour backdrop is rendered once, at shell level, outside <main>', () => {
  // Order in the shell: rail nav → backdrop → <main>. Being outside the
  // keyed <main> is what keeps it mounted across home ↔ subroute swaps.
  const rail = app.indexOf('variant="rail"');
  const backdrop = app.indexOf('<SectionBackdrop');
  const main = app.search(/<main\s+key=/);
  assert.ok(rail >= 0 && backdrop > rail && main > backdrop);
  // The screens themselves no longer own a backdrop layer.
  assert.ok(!read('src/screens/GuideScreen.tsx').includes('screen-bg'));
  assert.ok(!read('src/screens/PlanScreen.tsx').includes('screen-bg'));
});

test('subroute screens fade with opacity only, over the static backdrop', () => {
  assert.match(themes, /\.section-shell \.screen \{\s*\n\s*animation-name: fade-opacity;/);
});

test('shared affordances follow the section ink: eyebrow, back, links, focus', () => {
  for (const theme of ['theme-guide', 'theme-plan']) {
    for (const affordance of [
      `.${theme} .screen-head .eyebrow`,
      `.${theme} .subnav-back`,
      `.${theme} a:not(.btn)`,
      `.${theme} :focus-visible`,
      `.${theme} .seg-btn[aria-selected='true']`,
      `.${theme} .chip[aria-pressed='true']`,
    ]) {
      assert.ok(themes.includes(affordance), `${affordance} is themed`);
    }
  }
});

test('semantic status colours are never remapped by the section layer', () => {
  // Success, warning, danger and journey-completion stay global: outside its
  // comments (which explain exactly this rule), the theme file may not
  // reference or restyle any of them.
  const code = themes.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const forbidden of [
    '--good',
    '--danger',
    '--journey-complete',
    'pill-warn',
    'pill-good',
    '.check',
  ]) {
    assert.ok(!code.includes(forbidden), `${forbidden} untouched`);
  }
});

// --- Cross-section semantics ------------------------------------------------

test('Add to Trip wears Plan copper inside Guide; PWA toast keeps brand spruce', () => {
  const transport = read('src/components/TransportView.tsx');
  assert.match(transport, /className="btn btn-block btn-plan-accent"/);
  assert.match(transport, /className="btn btn-ghost btn-plan-accent"/);
  // "View in Trip" stays a neutral navigation button.
  assert.match(transport, /className="btn"\n\s+style=\{\{ flex: 1 \}\}\n\s+onClick=\{\(\) => onViewInTrip/);
  assert.match(themes, /\.btn-plan-accent \{\s*\n\s*background: #8d5c33;/);
  // The app-update toast is global chrome: its primary action is explicitly
  // re-anchored to spruce inside the Plan theme.
  assert.match(themes, /\.theme-plan \.pwa-toast \.btn-primary \{\s*\n\s*background: var\(--spruce\);/);
});

test('Plan-owned primary actions act in the darker text-safe copper fill', () => {
  assert.match(themes, /\.theme-plan \.btn-primary \{\s*\n\s*background: var\(--section-fill\);/);
  // Never raw cloudberry behind white button text.
  assert.ok(!/\.theme-plan[^{]*\{[^}]*background: var\(--cloudberry\)/s.test(themes));
});
