/**
 * Deferred Android basemap warm-up — the cold-start contract.
 *
 * On a cold native session the first Map mount paid the full ~6 MB read of
 * the packaged vector basemap on its user-visible critical path (measured in
 * the MapView lifecycle trace: `archive-resolution-start` → `basemap-resolved`
 * dominated the pre-constructor time). The warm-up moves that read to app
 * startup — strictly AFTER the initial UI work, via requestIdleCallback with
 * a bounded timeout — so the first deliberate Map open finds the session
 * cache already warm.
 *
 * This suite proves the contract:
 *  - the scheduling policy defers and falls back correctly (pure module,
 *    exercised for real);
 *  - only the bundled vector basemap is warmed, only on native Android;
 *  - the warm-up reuses getBundledArchiveBlob's session Promise cache —
 *    never a second loading mechanism, never a duplicate full read;
 *  - failure is non-fatal and non-sticky: a failed read evicts itself so
 *    normal Map resolution stays a genuine fresh fallback;
 *  - repeated calls reuse the existing work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  scheduleWarmup,
  WARMUP_IDLE_TIMEOUT_MS,
  WARMUP_FALLBACK_DELAY_MS,
} from '../src/map/warmupScheduling.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const warmup = read('src/map/mapWarmup.ts');
const store = read('src/map/archiveStore.ts');
const app = read('src/App.tsx');

// ---------------------------------------------------------------------------
// Scheduling policy (pure module, run for real)
// ---------------------------------------------------------------------------

test('the warm-up is handed to requestIdleCallback with a bounded timeout', () => {
  const calls = [];
  let ran = 0;
  const host = {
    requestIdleCallback(cb, opts) {
      calls.push(opts);
      cb();
      return 7;
    },
    cancelIdleCallback() {
      throw new Error('must not cancel an already-run callback in this test');
    },
    setTimeout() {
      throw new Error('setTimeout must not be used when requestIdleCallback exists');
    },
  };
  scheduleWarmup(() => {
    ran += 1;
  }, host);
  assert.equal(ran, 1, 'the task runs from the idle callback');
  assert.deepEqual(calls, [{ timeout: WARMUP_IDLE_TIMEOUT_MS }]);
  assert.ok(WARMUP_IDLE_TIMEOUT_MS > 0, 'a busy main thread still runs it eventually');
});

test('a host without requestIdleCallback falls back to a deferred setTimeout', () => {
  let scheduledDelay = null;
  let task = null;
  const host = {
    setTimeout(cb, delay) {
      task = cb;
      scheduledDelay = delay;
      return 11;
    },
    clearTimeout() {},
  };
  let ran = 0;
  scheduleWarmup(() => {
    ran += 1;
  }, host);
  assert.equal(scheduledDelay, WARMUP_FALLBACK_DELAY_MS);
  assert.equal(ran, 0, 'deferred — never synchronous');
  task();
  assert.equal(ran, 1);
});

test('the returned cancel function actually cancels on both paths', () => {
  let cancelledIdle = null;
  const idleHost = {
    requestIdleCallback: () => 21,
    cancelIdleCallback: (id) => {
      cancelledIdle = id;
    },
  };
  scheduleWarmup(() => {}, idleHost)();
  assert.equal(cancelledIdle, 21);

  let clearedTimer = null;
  const timerHost = {
    setTimeout: () => 22,
    clearTimeout: (id) => {
      clearedTimer = id;
    },
  };
  scheduleWarmup(() => {}, timerHost)();
  assert.equal(clearedTimer, 22);
});

// ---------------------------------------------------------------------------
// What gets warmed, and where (src/map/mapWarmup.ts)
// ---------------------------------------------------------------------------

test('repeated warm-up calls reuse the existing work', () => {
  assert.match(warmup, /if \(scheduled\) return;/);
  assert.match(warmup, /scheduled = true;/);
});

test('the Android-only decision stays inside the map-data platform boundary', () => {
  // src/map/archiveStore.ts is THE platform boundary for map archives
  // (native-runtime.test.mjs fences who may import the platform adapter);
  // the warm-up module never asks which platform it is on — the store's
  // isBundledHere guard is what keeps the browser/PWA read-free.
  assert.doesNotMatch(warmup, /isNativeAndroid|runtime\/platform|Capacitor/);
  assert.match(prewarmHelperSource(), /if \(!isBundledHere\(spec\)\) return false;/);
});

test('exactly the bundled vector basemap is warmed — no optional archives, no downloads', () => {
  assert.match(warmup, /prewarmBundledArchive\(VECTOR_ARCHIVE\)/);
  assert.doesNotMatch(warmup, /TERRAIN_ARCHIVE|CONTOURS_ARCHIVE|SATELLITE_ARCHIVE/);
  assert.doesNotMatch(warmup, /downloadArchive|downloadNative|fetch\(/);
  assert.match(warmup, /scheduleWarmup\(/, 'deferred via the idle policy, never inline');
});

// ---------------------------------------------------------------------------
// The warm read itself (src/map/archiveStore.ts)
// ---------------------------------------------------------------------------

/** The body of prewarmBundledArchive, up to its closing unindented brace. */
function prewarmHelperSource() {
  const start = store.indexOf('export async function prewarmBundledArchive');
  assert.ok(start > 0, 'prewarmBundledArchive exists');
  const end = store.indexOf('\n}\n', start);
  assert.ok(end > start, 'and closes');
  return store.slice(start, end + 2);
}

test('the warm-up reuses the session Promise cache — no second loading mechanism', () => {
  const helper = prewarmHelperSource();
  assert.match(helper, /getBundledArchiveBlob\(spec\)/);
  assert.doesNotMatch(helper, /await fetch|new Blob|caches\./);
});

test('the warm-up refuses to run for non-bundled contexts (browser, optional archives)', () => {
  assert.match(prewarmHelperSource(), /if \(!isBundledHere\(spec\)\) return false;/);
});

test('a failed warm read evicts itself so Map resolution stays a fresh fallback', () => {
  const helper = prewarmHelperSource();
  // Identity-checked eviction: only the promise THIS warm-up awaited is
  // deleted, never a newer retry started by a concurrent Map mount.
  assert.match(helper, /bundledBlobs\.get\(url\) === pending/);
  assert.match(helper, /bundledBlobs\.delete\(url\)/);
});

test('warmth is observable for the lifecycle trace without triggering a read', () => {
  const start = store.indexOf('export function isBundledArchiveWarm');
  assert.ok(start > 0, 'isBundledArchiveWarm exists');
  const helper = store.slice(start, store.indexOf('\n}\n', start) + 2);
  assert.match(helper, /bundledBlobs\.has\(/);
  assert.doesNotMatch(helper, /getBundledArchiveBlob|fetch/);
});

// ---------------------------------------------------------------------------
// The one caller (src/App.tsx)
// ---------------------------------------------------------------------------

test('the app shell schedules the warm-up through the semantic API only', () => {
  assert.match(app, /import \{ prewarmMapAssets \} from '\.\/map\/mapWarmup';/);
  assert.match(app, /prewarmMapAssets\(\);/);
  // The shell knows nothing about PMTiles/archive internals.
  assert.doesNotMatch(app, /getBundledArchiveBlob|archiveStore|pmtilesProtocol|ArchiveSpec/);
});
