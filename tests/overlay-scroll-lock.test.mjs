/**
 * Shared overlay scroll lock (src/utils/overlayLock.mjs + the
 * useOverlayScrollLock hook + the html[data-overlay-locked] CSS state).
 *
 * The rules under test:
 *  - opening ANY overlay locks the document (attribute on <html>); the
 *    activated styles freeze the root scroller and disable its overscroll
 *    effects — Android pull-to-refresh above all — for exactly as long as
 *    an overlay is up;
 *  - the lock is reference-counted, so nested overlays (date picker above
 *    the Trip sheet) never unlock the page early, and the LAST release
 *    restores the document and its scroll position exactly;
 *  - `overscroll-behavior` sits on html in the locked state — the viewport
 *    does not take it from body, which is why the pre-existing body rule
 *    never prevented pull-to-refresh;
 *  - overlay scroll containers contain their own overscroll so reaching the
 *    top/bottom of a long form never chains the gesture onward;
 *  - no blanket `touch-action` suppression anywhere — forms stay
 *    scrollable and inputs stay usable;
 *  - every modal overlay component holds the lock through the shared hook —
 *    no component may toggle document styles on its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  acquireOverlayLock,
  overlayLockCount,
  releaseOverlayLock,
  resetOverlayLockForTests,
} from '../src/utils/overlayLock.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('src/styles/global.css');

/** Minimal document/window double for the injectable util. */
function fakeDoc({ x = 0, y = 0 } = {}) {
  const attrs = new Map();
  const scrolls = [];
  return {
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      removeAttribute: (k) => attrs.delete(k),
      hasAttribute: (k) => attrs.has(k),
    },
    defaultView: {
      scrollX: x,
      scrollY: y,
      scrollTo: (sx, sy) => scrolls.push([sx, sy]),
    },
    attrs,
    scrolls,
  };
}

test('one overlay: lock on acquire, full restore on release', (t) => {
  t.after(resetOverlayLockForTests);
  const doc = fakeDoc({ x: 0, y: 340 });
  acquireOverlayLock(doc);
  assert.equal(doc.documentElement.hasAttribute('data-overlay-locked'), true);
  assert.equal(overlayLockCount(), 1);
  releaseOverlayLock(doc);
  assert.equal(doc.documentElement.hasAttribute('data-overlay-locked'), false);
  assert.equal(overlayLockCount(), 0);
  assert.deepEqual(doc.scrolls, [[0, 340]], 'scroll position restored exactly once');
});

test('nesting: inner overlay never unlocks the document', (t) => {
  t.after(resetOverlayLockForTests);
  const doc = fakeDoc({ y: 120 });
  acquireOverlayLock(doc); // Trip sheet: 0 -> 1
  acquireOverlayLock(doc); // date picker: 1 -> 2
  assert.equal(overlayLockCount(), 2);
  releaseOverlayLock(doc); // picker closes: 2 -> 1
  assert.equal(doc.documentElement.hasAttribute('data-overlay-locked'), true, 'sheet keeps the lock');
  assert.equal(doc.scrolls.length, 0, 'no premature scroll restoration');
  releaseOverlayLock(doc); // sheet closes: 1 -> 0
  assert.equal(doc.documentElement.hasAttribute('data-overlay-locked'), false);
  assert.deepEqual(doc.scrolls, [[0, 120]]);
});

test('out-of-order and interleaved overlays resolve to a clean unlock', (t) => {
  t.after(resetOverlayLockForTests);
  const doc = fakeDoc();
  acquireOverlayLock(doc);
  acquireOverlayLock(doc);
  acquireOverlayLock(doc); // e.g. sheet + picker + confirm dialog
  releaseOverlayLock(doc);
  acquireOverlayLock(doc); // a new overlay opens while two are still up
  releaseOverlayLock(doc);
  releaseOverlayLock(doc);
  assert.equal(overlayLockCount(), 1, 'still one holder');
  assert.equal(doc.documentElement.hasAttribute('data-overlay-locked'), true);
  releaseOverlayLock(doc);
  assert.equal(overlayLockCount(), 0);
  assert.equal(doc.documentElement.hasAttribute('data-overlay-locked'), false);
});

test('a stray double release can never go negative or corrupt the next lock', (t) => {
  t.after(resetOverlayLockForTests);
  const doc = fakeDoc();
  releaseOverlayLock(doc); // exceptional close path releasing with no lock
  assert.equal(overlayLockCount(), 0);
  acquireOverlayLock(doc);
  assert.equal(overlayLockCount(), 1, 'next overlay still locks correctly');
  assert.equal(doc.documentElement.hasAttribute('data-overlay-locked'), true);
  releaseOverlayLock(doc);
  assert.equal(doc.documentElement.hasAttribute('data-overlay-locked'), false);
});

test('the lock touches only the data attribute — original styles are untouched', (t) => {
  t.after(resetOverlayLockForTests);
  const util = read('src/utils/overlayLock.mjs');
  assert.ok(!/\.style\b/.test(util), 'no inline style mutation to save or restore');
  assert.match(util, /data-overlay-locked/, 'state lives in one attribute');
});

test('locked-state CSS: root freeze + overscroll none on html AND body', () => {
  assert.match(
    css,
    /html\[data-overlay-locked\],\s*html\[data-overlay-locked\] body \{[^}]*overflow: hidden;[^}]*overscroll-behavior: none;/s,
    'the attribute activates the freeze on the root (html), where the viewport reads it',
  );
});

test('overlay scroll containers contain their own overscroll', () => {
  for (const container of ['.sheet-body {', '.picker-body {']) {
    const block = css.slice(css.indexOf(container), css.indexOf('}', css.indexOf(container)));
    assert.match(block, /overflow-y: auto/, `${container} scrolls`);
    assert.match(block, /overscroll-behavior: contain/, `${container} contains chaining`);
  }
});

test('no blanket touch-action suppression rides this feature', () => {
  // The single pre-existing touch-action rule is the elevation profile's
  // scrub surface — component-scoped and justified in place. No overlay,
  // dialog, body or html rule may suppress touch: forms must scroll and
  // inputs must stay usable.
  const rules = css.match(/^[^{}]*\{[^}]*touch-action:\s*none[^}]*\}/gm) ?? [];
  assert.equal(rules.length, 1, 'exactly the one pre-existing scrub rule');
  assert.match(rules[0], /\.elev-svg/, 'and it is the elevation scrubber');
});

test('every modal overlay holds the lock through the shared hook', () => {
  const mountLocked = [
    'src/components/TripItemSheet.tsx',
    'src/components/WalletEditorSheet.tsx',
    'src/components/MembershipCardViewer.tsx',
    'src/components/ConfirmDialog.tsx',
    'src/components/DateField.tsx',
    'src/components/TimeField.tsx',
    'src/components/TripView.tsx', // AddItemChooser + TripImageViewer
  ];
  for (const p of mountLocked) {
    const source = read(p);
    assert.match(source, /useOverlayScrollLock\(\)/, `${p} locks while mounted`);
  }
  // Always-mounted overlays lock exactly while their flag is up.
  assert.match(read('src/components/ContextHelp.tsx'), /useOverlayScrollLock\(open\)/);
  assert.match(read('src/components/CreditsSheet.tsx'), /useOverlayScrollLock\(open\)/);
  assert.match(read('src/components/RotateGuard.tsx'), /useOverlayScrollLock\(active\)/);
  // TripView hosts two dialog components — both lock.
  const tripView = read('src/components/TripView.tsx');
  assert.equal((tripView.match(/useOverlayScrollLock\(\)/g) ?? []).length, 2);
  // No component sidesteps the shared owner with its own document styling.
  for (const p of [...mountLocked, 'src/components/ContextHelp.tsx', 'src/components/CreditsSheet.tsx', 'src/components/RotateGuard.tsx']) {
    const source = read(p);
    assert.ok(!/document\.(body|documentElement)\.style/.test(source), `${p} never toggles document styles itself`);
  }
});

test('the hook releases through effect cleanup on every unmount path', () => {
  const hook = read('src/hooks/useOverlayScrollLock.ts');
  assert.match(hook, /useEffect\(\(\) => \{\s*if \(!active\) return;\s*acquireOverlayLock\(\);\s*return \(\) => releaseOverlayLock\(\);\s*\}, \[active\]\);/s);
});

test('nested picker close still never closes the underlying Trip sheet', () => {
  // The PR #69 stop-propagation contract must survive this feature.
  for (const p of ['src/components/DateField.tsx', 'src/components/TimeField.tsx']) {
    const source = read(p);
    assert.match(source, /e\.stopPropagation\(\);\s*onClose\(\);/s);
  }
});
