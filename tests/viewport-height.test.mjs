/**
 * Tests for the app-shell viewport-height sync — the EXACT module the app
 * imports (src/utils/viewportHeight.mjs), driven through a fake window so
 * node --test needs no DOM.
 *
 * The regression this guards: after a service-worker update reload (or
 * background resume / rotation) Android Chrome can leave CSS dvh/vh stale,
 * which pushed the bottom tab bar below the visible viewport until the app
 * was restarted. The sync must therefore (re)measure on every lifecycle
 * event listed below and clean up completely when stopped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_HEIGHT_VAR,
  startViewportHeightSync,
} from '../src/utils/viewportHeight.mjs';

/** Minimal EventTarget: tracks listeners so leaks are assertable. */
function fakeTarget() {
  const listeners = new Map(); // type -> Set<fn>
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    listenerCount() {
      let n = 0;
      for (const set of listeners.values()) n += set.size;
      return n;
    },
  };
}

function fakeWindow({ visualViewport = true } = {}) {
  const win = fakeTarget();
  const doc = fakeTarget();
  const style = new Map();
  win.innerHeight = 800;
  win.document = doc;
  doc.visibilityState = 'visible';
  doc.activeElement = null;
  doc.documentElement = {
    style: {
      setProperty: (k, v) => style.set(k, v),
      removeProperty: (k) => style.delete(k),
    },
  };
  // rAF callbacks are queued so tests control the "one frame later" re-measure.
  const rafQueue = [];
  win.requestAnimationFrame = (fn) => {
    rafQueue.push(fn);
    return rafQueue.length;
  };
  win.flushRaf = () => {
    while (rafQueue.length) rafQueue.shift()();
  };
  win.visualViewport = visualViewport ? fakeTarget() : undefined;
  win.appHeight = () => style.get(APP_HEIGHT_VAR);
  return win;
}

// ---- 1. initial mount measures immediately ---------------------------------
test('sets --app-height from innerHeight on start', () => {
  const win = fakeWindow();
  const stop = startViewportHeightSync(win);
  assert.equal(win.appHeight(), '800px');
  stop();
});

// ---- 2–5. every lifecycle event re-measures --------------------------------
for (const [target, event] of [
  ['win', 'resize'],
  ['win', 'orientationchange'],
  ['win', 'pageshow'],
  ['vv', 'resize'],
]) {
  test(`re-measures on ${target === 'vv' ? 'visualViewport ' : ''}${event}`, () => {
    const win = fakeWindow();
    const stop = startViewportHeightSync(win);
    win.innerHeight = 640;
    (target === 'vv' ? win.visualViewport : win).dispatch(event);
    assert.equal(win.appHeight(), '640px');
    stop();
  });
}

// ---- 6. visibilitychange: only a visible document is trustworthy -----------
test('re-measures on return to foreground, not while hidden', () => {
  const win = fakeWindow();
  const stop = startViewportHeightSync(win);

  win.document.visibilityState = 'hidden';
  win.innerHeight = 100; // bogus background metrics must not be captured
  win.document.dispatch('visibilitychange');
  assert.equal(win.appHeight(), '800px');

  win.document.visibilityState = 'visible';
  win.innerHeight = 720;
  win.document.dispatch('visibilitychange');
  assert.equal(win.appHeight(), '720px');
  stop();
});

// ---- 7. late-settling metrics are caught one frame later -------------------
test('rAF pass picks up an innerHeight that settles after the event', () => {
  const win = fakeWindow();
  const stop = startViewportHeightSync(win);
  win.dispatch('pageshow'); // Chrome may still report the stale height here
  win.innerHeight = 655;    // ... and settle the real one a frame later
  win.flushRaf();
  assert.equal(win.appHeight(), '655px');
  stop();
});

// ---- 8. invalid measurements never clobber the last good value -------------
test('ignores zero / non-finite heights', () => {
  const win = fakeWindow();
  const stop = startViewportHeightSync(win);
  for (const bad of [0, -1, NaN, undefined]) {
    win.innerHeight = bad;
    win.dispatch('resize');
    assert.equal(win.appHeight(), '800px');
  }
  stop();
});

// ---- 9. fractional heights are rounded to whole px --------------------------
test('rounds fractional innerHeight', () => {
  const win = fakeWindow();
  const stop = startViewportHeightSync(win);
  win.innerHeight = 731.6;
  win.dispatch('resize');
  assert.equal(win.appHeight(), '732px');
  stop();
});

// ---- 10. stop() removes every listener and restores pure-CSS sizing --------
test('stop() cleans up listeners and the CSS property', () => {
  const win = fakeWindow();
  const stop = startViewportHeightSync(win);
  assert.ok(win.listenerCount() > 0);
  stop();
  assert.equal(win.listenerCount(), 0);
  assert.equal(win.document.listenerCount(), 0);
  assert.equal(win.visualViewport.listenerCount(), 0);
  assert.equal(win.appHeight(), undefined);
  // Events after stop must be inert.
  win.innerHeight = 500;
  win.dispatch('resize');
  assert.equal(win.appHeight(), undefined);
});

// ---- 11–14. visual viewport is the primary metric ---------------------------
// Regression for the on-device failure: after the SW-update reload Android
// Chrome can oversize the layout viewport itself, so innerHeight reports the
// stale value while visualViewport.height reports what is really visible.
test('prefers visualViewport.height over a stale innerHeight', () => {
  const win = fakeWindow();
  win.innerHeight = 812; // stale, oversized layout viewport
  win.visualViewport.height = 748; // what the user can actually see
  const stop = startViewportHeightSync(win);
  assert.equal(win.appHeight(), '748px');
  stop();
});

test('falls back to innerHeight while a text control is focused (keyboard)', () => {
  const win = fakeWindow();
  win.visualViewport.height = 400; // keyboard shrank the visual viewport
  win.document.activeElement = { tagName: 'TEXTAREA' };
  const stop = startViewportHeightSync(win);
  assert.equal(win.appHeight(), '800px');
  // Keyboard closes: blur + visual viewport resize → visual height rules again.
  win.document.activeElement = null;
  win.visualViewport.height = 800;
  win.visualViewport.dispatch('resize');
  assert.equal(win.appHeight(), '800px');
  stop();
});

test('treats contentEditable focus like a text control', () => {
  const win = fakeWindow();
  win.visualViewport.height = 400;
  win.document.activeElement = { tagName: 'DIV', isContentEditable: true };
  const stop = startViewportHeightSync(win);
  assert.equal(win.appHeight(), '800px');
  stop();
});

test('ignores a pinch-zoomed visual viewport (scale ≠ 1)', () => {
  const win = fakeWindow();
  win.visualViewport.height = 300;
  win.visualViewport.scale = 2.5;
  const stop = startViewportHeightSync(win);
  assert.equal(win.appHeight(), '800px');
  stop();
});

// ---- 15. environments without visualViewport still work --------------------
test('tolerates a missing visualViewport', () => {
  const win = fakeWindow({ visualViewport: false });
  const stop = startViewportHeightSync(win);
  assert.equal(win.appHeight(), '800px');
  win.innerHeight = 600;
  win.dispatch('resize');
  assert.equal(win.appHeight(), '600px');
  stop();
  assert.equal(win.listenerCount(), 0);
});
