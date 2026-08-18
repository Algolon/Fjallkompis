/**
 * Section transition choreography: same-section navigation keeps the
 * persistent backdrop + restrained content fade; CROSS-TAB navigation
 * arrives composed (no content fade), so the instantly-swapped shell
 * backdrop is never exposed at full strength behind near-transparent UI —
 * the physical-device "contours over the cards" flash this fences against.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const app = read('src/App.tsx');
const themes = read('src/styles/section-themes.css');
const globalCss = read('src/styles/global.css');

// --- Same-section navigation (the intentional #116 behaviour) ---------------

test('the backdrop is shell-level and persists across same-section routes', () => {
  // Outside the keyed <main> remount: rail → SectionBackdrop → <main key=…>.
  const rail = app.indexOf('variant="rail"');
  const backdrop = app.indexOf('<SectionBackdrop');
  const main = app.search(/<main\s+key=/);
  assert.ok(rail >= 0 && backdrop > rail && main > backdrop);
  // The backdrop layer itself never animates or transitions (no reload, no
  // resize, no fade — same fence as screen-themes, restated for this
  // contract).
  const layer = globalCss.slice(
    globalCss.indexOf('.screen-bg {'),
    globalCss.indexOf('}', globalCss.indexOf('.screen-bg {')),
  );
  assert.ok(!/transition|animation/.test(layer), 'backdrop layer is inert');
});

test('within-section subroutes keep the restrained opacity-only content fade', () => {
  assert.match(themes, /\.section-shell \.screen \{\s*\n\s*animation-name: fade-opacity;/);
  assert.match(globalCss, /\.guide-screen,\n\.plan-screen \{\n  animation-name: fade-opacity;\n\}/);
});

// --- Cross-tab navigation ----------------------------------------------------

test('a cross-tab arrival suppresses the destination content fade entirely', () => {
  // Nav carries the distinction (tab changed vs subroute changed)…
  assert.match(app, /freshTab:\s*\n?\s*tab !== prev\.tab/);
  assert.match(app, /freshTab: dest\.tab !== navRef\.current\.tab/);
  // …the shell applies it to the keyed <main>…
  assert.match(app, /className=\{nav\.freshTab \? 'main-tab-switch' : undefined\}/);
  // …and the CSS kills the whole animation for that mount: no rule fades
  // only the content while the already-settled backdrop stays opaque.
  assert.match(themes, /\.app-workspaces > main\.main-tab-switch \.screen \{\s*\n\s*animation: none;/);
});

test('the flag is stable per destination — no in-place animation restarts', () => {
  // Re-selecting the current destination preserves freshTab (same key → no
  // remount; flipping the class would restart the fade on a settled
  // screen), and the direction-reset effect carries it through.
  assert.match(app, /section === prev\.section && prev\.freshTab === true/);
  assert.match(app, /\{ tab: n\.tab, section: n\.section, freshTab: n\.freshTab \}/);
});

test('the choreography never touches stacking or the #119 compositing fix', () => {
  // The backdrop stays a negative-z fixed layer and .app keeps its own
  // stacking context — the flash was a timing artefact, not a z-order one.
  assert.match(globalCss, /\.screen-bg \{[^}]*z-index: -1;/s);
  assert.match(
    read('src/styles/mobile-shell-plan-polish.css'),
    /\.app \{\s*\n\s*isolation: isolate;/,
  );
});
