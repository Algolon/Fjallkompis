/**
 * Phone-landscape classification + portrait-lock gating
 * (src/utils/orientationGuard.mjs — the exact module the app runs).
 *
 * Phones are portrait-only by product decision; tablets keep portrait and
 * landscape; desktop windows stay responsive. These tests pin the
 * capability/space rule to the required device matrix so a threshold
 * tweak can never silently guard a tablet or spare a phone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHONE_LANDSCAPE_MAX_HEIGHT,
  isPhoneLandscape,
  readPhoneLandscape,
  watchPhoneLandscape,
  attemptPhonePortraitLock,
} from '../src/utils/orientationGuard.mjs';

/** Touch-device env (coarse pointer, no hover) at a given viewport. */
const touch = (width, height) => ({
  width,
  height,
  coarsePointer: true,
  canHover: false,
});
/** Mouse-driven env (desktop/laptop) at a given viewport. */
const mouse = (width, height) => ({
  width,
  height,
  coarsePointer: false,
  canHover: true,
});

test('phone portrait viewports are never guarded', () => {
  assert.equal(isPhoneLandscape(touch(390, 844)), false);
  assert.equal(isPhoneLandscape(touch(360, 800)), false);
  assert.equal(isPhoneLandscape(touch(320, 568)), false);
});

test('phone landscape viewports are guarded', () => {
  assert.equal(isPhoneLandscape(touch(844, 390)), true);
  assert.equal(isPhoneLandscape(touch(800, 360)), true);
  assert.equal(isPhoneLandscape(touch(932, 430)), true);
});

test('tablets keep portrait AND landscape (never guarded)', () => {
  assert.equal(isPhoneLandscape(touch(768, 1024)), false);
  assert.equal(isPhoneLandscape(touch(820, 1180)), false);
  assert.equal(isPhoneLandscape(touch(1024, 768)), false);
  // A SMALL touch tablet is not a landscape phone merely because its
  // pointer is coarse: its landscape height (600) clears the threshold.
  assert.equal(isPhoneLandscape(touch(1024, 600)), false);
});

test('mouse-driven (desktop) windows are never guarded, however short', () => {
  assert.equal(isPhoneLandscape(mouse(1280, 800)), false);
  assert.equal(isPhoneLandscape(mouse(1440, 900)), false);
  assert.equal(isPhoneLandscape(mouse(800, 360)), false); // short desktop window
});

test('a hover-capable touch device (touch laptop) is never guarded', () => {
  assert.equal(
    isPhoneLandscape({ width: 900, height: 420, coarsePointer: true, canHover: true }),
    false,
  );
});

test('threshold matches the adaptive shell gate in global.css', () => {
  assert.equal(PHONE_LANDSCAPE_MAX_HEIGHT, 500);
  assert.equal(isPhoneLandscape(touch(900, 499)), true);
  assert.equal(isPhoneLandscape(touch(900, 500)), false);
});

// ---------------------------------------------------------------- fakes

function makeFakeWindow({ width, height, coarse, hoverNone, standalone = false, screen } = {}) {
  const winListeners = new Map();
  const mqListeners = [];
  const win = {
    innerWidth: width,
    innerHeight: height,
    screen,
    matchMedia(query) {
      const matches =
        query === '(pointer: coarse)'
          ? coarse === true
          : query === '(hover: hover)'
            ? hoverNone !== true
            : query === '(display-mode: standalone)'
              ? standalone === true
              : false;
      const mql = {
        matches,
        addEventListener: (_t, fn) => mqListeners.push(fn),
        removeEventListener: (_t, fn) => {
          const i = mqListeners.indexOf(fn);
          if (i !== -1) mqListeners.splice(i, 1);
        },
      };
      return mql;
    },
    addEventListener: (type, fn) => winListeners.set(`${type}:${fn}`, { type, fn }),
    removeEventListener: (type, fn) => winListeners.delete(`${type}:${fn}`),
    fire(type) {
      for (const { type: t, fn } of winListeners.values()) if (t === type) fn();
    },
    listenerCount: () => winListeners.size + mqListeners.length,
  };
  return win;
}

test('readPhoneLandscape reads viewport + capabilities from the window', () => {
  assert.equal(
    readPhoneLandscape(makeFakeWindow({ width: 844, height: 390, coarse: true, hoverNone: true })),
    true,
  );
  assert.equal(
    readPhoneLandscape(makeFakeWindow({ width: 390, height: 844, coarse: true, hoverNone: true })),
    false,
  );
});

test('watchPhoneLandscape notifies immediately, on rotation, and stops cleanly', () => {
  const win = makeFakeWindow({ width: 390, height: 844, coarse: true, hoverNone: true });
  const seen = [];
  const stop = watchPhoneLandscape((v) => seen.push(v), win);

  assert.deepEqual(seen, [false], 'initial classification is delivered');

  // Rotate to landscape.
  win.innerWidth = 844;
  win.innerHeight = 390;
  win.fire('orientationchange');
  assert.deepEqual(seen, [false, true]);

  // Rotate back.
  win.innerWidth = 390;
  win.innerHeight = 844;
  win.fire('resize');
  assert.deepEqual(seen, [false, true, false]);

  stop();
  assert.equal(win.listenerCount(), 0, 'stop() removes every listener');
  win.fire('resize');
  assert.deepEqual(seen, [false, true, false], 'no notifications after stop()');
});

test('portrait lock: attempted only for installed phone-class contexts', () => {
  const calls = [];
  const phoneScreen = (lockResult) => ({
    width: 390,
    height: 844,
    orientation: {
      lock: (o) => {
        calls.push(o);
        return lockResult;
      },
    },
  });

  // Installed phone → attempt with 'portrait-primary'.
  assert.equal(
    attemptPhonePortraitLock(
      makeFakeWindow({
        width: 390, height: 844, coarse: true, hoverNone: true,
        standalone: true, screen: phoneScreen(Promise.resolve()),
      }),
    ),
    true,
  );
  assert.deepEqual(calls, ['portrait-primary']);

  // Browser tab (not standalone) → never attempted.
  calls.length = 0;
  assert.equal(
    attemptPhonePortraitLock(
      makeFakeWindow({
        width: 390, height: 844, coarse: true, hoverNone: true,
        standalone: false, screen: phoneScreen(Promise.resolve()),
      }),
    ),
    false,
  );
  assert.equal(calls.length, 0);

  // Installed TABLET (short side 768 ≥ threshold) → never attempted.
  assert.equal(
    attemptPhonePortraitLock(
      makeFakeWindow({
        width: 768, height: 1024, coarse: true, hoverNone: true,
        standalone: true,
        screen: { width: 768, height: 1024, orientation: { lock: (o) => calls.push(o) } },
      }),
    ),
    false,
  );
  assert.equal(calls.length, 0);
});

test('portrait lock: rejected promises and missing APIs are swallowed', async () => {
  // lock() rejecting must not surface an unhandled rejection.
  let reject;
  const rejection = new Promise((_res, rej) => (reject = rej));
  assert.equal(
    attemptPhonePortraitLock(
      makeFakeWindow({
        width: 390, height: 844, coarse: true, hoverNone: true,
        standalone: true,
        screen: { width: 390, height: 844, orientation: { lock: () => rejection } },
      }),
    ),
    true,
  );
  reject(new DOMException('not allowed'));
  await new Promise((r) => setImmediate(r)); // would crash the test on unhandled rejection

  // No Screen Orientation API at all → false, no throw.
  assert.equal(
    attemptPhonePortraitLock(
      makeFakeWindow({
        width: 390, height: 844, coarse: true, hoverNone: true,
        standalone: true, screen: { width: 390, height: 844 },
      }),
    ),
    false,
  );
});
