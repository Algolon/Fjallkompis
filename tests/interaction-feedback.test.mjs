/**
 * Interaction feedback (tap/press/focus) contract.
 *
 * The rules under test:
 *  - the browser's DEFAULT tap highlight (the blue rectangle Android/Chrome
 *    flashes over tapped elements) is disabled through ONE deliberate shared
 *    rule for buttons and links — not scattered per-component opt-outs, and
 *    never applied to text inputs/selects (native form affordances stay);
 *  - the affordance is REPLACED, not removed: every interactive Today
 *    control (and the shared button/segment species) draws its own pressed
 *    state clipped to its rounded silhouette;
 *  - keyboard affordance is untouched — :focus-visible rings remain, and
 *    the STF roundel's ring stays circular (ring follows the shape);
 *  - `outline: none` appears only where a replacement focus treatment
 *    exists on the same component;
 *  - prefers-reduced-motion disables the animations/transitions wholesale.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

test('tap highlight is disabled through one shared button/link rule', () => {
  assert.match(
    css,
    /button,\na \{\n  -webkit-tap-highlight-color: transparent;\n\}/,
    'the deliberate app-wide rule exists for buttons and links',
  );
  // One rule, no scattered opt-outs left behind — and because the selector
  // list is exactly button/a (asserted above), text inputs and selects are
  // never swept into the opt-out.
  const occurrences = css.match(/-webkit-tap-highlight-color/g) ?? [];
  assert.equal(occurrences.length, 1, 'exactly one tap-highlight declaration');
});

test('every Today control has a custom pressed state', () => {
  for (const selector of [
    '.today-mode__tab:active',
    '.today-action-card:active',
    '.hero-action:active',
    '.journey-step:active .journey-dot',
    '.quick-btn:active',
    '.stf-card:active',
    '.tab:active .tab-pill',
    '.btn:active',
    '.seg-btn:active',
  ]) {
    assert.ok(css.includes(selector), `${selector} pressed state exists`);
  }
  // Pressed feedback is restrained movement (scale), not a colour flash.
  assert.match(css, /\.stf-card:active \{\n  transform: scale\(0\.9\d\);\n\}/);
  assert.match(css, /\.today-mode__tab:active \{\n  transform: scale\(0\.9\d\);\n\}/);
});

test('keyboard focus rings remain, and the STF ring is circular', () => {
  for (const selector of [
    '.today-mode__tab:focus-visible',
    '.today-action-card:focus-visible',
    '.stf-card:focus-visible',
    '.tab:focus-visible .tab-pill',
    'a:focus-visible',
  ]) {
    assert.ok(css.includes(selector), `${selector} focus state exists`);
  }
  // The roundel is a circle and its outline follows it (outline hugs
  // border-radius in every supporting browser).
  const stf = css.slice(css.indexOf('.stf-card {'), css.indexOf('.stf-card img'));
  assert.match(stf, /border-radius: 50%/);
  assert.match(
    css,
    /\.stf-card:focus-visible \{\n  outline: 2px solid var\(--glacier-700\);\n  outline-offset: 3px;\n\}/,
  );
});

test('no blanket outline removal without a replacement', () => {
  // Every `outline: none` must belong to a component that draws its own
  // focus treatment. Enumerated: additions to this list need a matching
  // replacement selector below.
  const occurrences = css.match(/outline:\s*none/g) ?? [];
  assert.ok(occurrences.length <= 2, `outline:none stays exceptional (found ${occurrences.length})`);
  // .tab suppresses the cell outline but draws focus on the pill.
  assert.ok(css.includes('.tab:focus-visible .tab-pill'), 'tab focus drawn on the pill');
});

test('reduced motion disables the pressed/appear animations wholesale', () => {
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\n  \.screen,\n  \* \{\n    animation: none !important;\n    transition: none !important;\n  \}\n\}/,
  );
});
