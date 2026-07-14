/**
 * Compact bottom-navigation contract.
 *
 * The mobile tab bar was slimmed to a native-proportion row (v0.20.2) WITHOUT
 * touching the iPhone safe-area behaviour PR #56 fixed. These are structural
 * fences on the CSS — not a screenshot diff — so the two properties that make
 * the bar both lean and safe can't silently drift:
 *
 *   1. --tabbar-h is the CONTENT height only (icon+label row), never the inset.
 *   2. .tabbar height = content + env(safe-area-inset-bottom), counted ONCE,
 *      and padding-bottom reserves that inset so the row stays above the
 *      home-gesture area.
 *   3. The PWA lifecycle toast clears the same (content + inset) sum.
 *
 * Pure string fences on src/styles/global.css (same approach as
 * design-system.test.mjs), so node --test needs no DOM.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

/** The declaration block for a selector (text between its first { and }). */
function block(selector) {
  const idx = css.indexOf(selector);
  assert.ok(idx !== -1, `${selector} exists`);
  const open = css.indexOf('{', idx);
  return css.slice(open + 1, css.indexOf('}', open));
}

// ---- 1. compact content-row height -----------------------------------------
test('--tabbar-h is the lean 56px content row', () => {
  const varH = css.match(/--tabbar-h:\s*(\d+)px/);
  assert.ok(varH, '--tabbar-h is defined');
  const px = Number(varH[1]);
  assert.equal(px, 56, 'compact bottom-nav row is 56px (was 64px)');
  // The whole .tab cell is the touch target and fills this row, so the row
  // itself must never fall below the 44px minimum touch height.
  assert.ok(px >= 44, 'row height keeps the tab cell at/above the 44px minimum');
});

// ---- 2. safe-area is owned by .tabbar, added exactly once ------------------
test('.tabbar adds the bottom safe-area inset exactly once, above the row', () => {
  const tabbar = block('.tabbar {');
  // Total height = content row + inset. The inset appears once in the calc.
  const height = tabbar.match(/height:\s*([^;]*);/);
  assert.ok(height, '.tabbar sets an explicit height');
  assert.match(
    height[1],
    /calc\(\s*var\(--tabbar-h\)\s*\+\s*var\(--safe-bottom\)\s*\)/,
    'height = calc(--tabbar-h + --safe-bottom)',
  );
  const insetInHeight = (height[1].match(/--safe-bottom/g) ?? []).length;
  assert.equal(insetInHeight, 1, 'safe-area inset is counted once, not doubled');
  // padding-bottom reserves the inset so content sits entirely above it.
  assert.match(
    tabbar,
    /padding-bottom:\s*var\(--safe-bottom\)\s*;/,
    '.tabbar reserves the safe area as bottom padding',
  );
});

test('--safe-bottom is the real env() inset, not a faked pixel value', () => {
  assert.match(
    css,
    /--safe-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/,
    'safe-area inset comes from env(), with a 0px fallback off-device',
  );
});

// ---- 3. lean internal padding, unchanged icon/label -------------------------
test('tab and pill vertical padding are tightened for the compact row', () => {
  assert.match(block('.tab {'), /padding:\s*3px 2px/, '.tab vertical padding is 3px');
  assert.match(block('.tab-pill {'), /padding:\s*4px 8px/, '.tab-pill vertical padding is 4px, horizontal 8px kept');
  // Icon size and icon/label gap are deliberately unchanged.
  assert.match(block('.tab .ic {'), /width:\s*22px/, 'icon stays 22px');
  assert.match(block('.tab-pill {'), /gap:\s*3px/, 'icon/label gap stays 3px');
});

// ---- 4. the PWA toast clears the compacted bar ------------------------------
test('PWA toast anchors above the content row + safe-area sum', () => {
  const region = block('.pwa-toast-region {');
  const bottom = region.match(/bottom:\s*([^;]*);/);
  assert.ok(bottom, '.pwa-toast-region sets an explicit bottom');
  assert.match(bottom[1], /calc\(/, 'toast bottom is a calc()');
  assert.match(bottom[1], /var\(--tabbar-h\)/, 'toast clears the nav row');
  assert.match(bottom[1], /var\(--safe-bottom\)/, 'toast also clears the safe area');
});
