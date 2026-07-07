/**
 * Tests for the live-tracking session logic and watcher lifecycle — the
 * EXACT modules the app imports (src/utils/trackingSession.mjs), never a
 * re-implementation. Successor of the pilot-session tests after the tracking
 * core graduated from the Delft pilot to the Kungsleden Map screen.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTrackingSession,
  classifyFix,
  createTrackingSession,
  createWatchController,
  sessionToCsv,
  sessionToExport,
  ACCURACY_UNCERTAIN_M,
  MAX_ACCEPT_ACCURACY_M,
  OFF_ROUTE_CONSECUTIVE,
  UNCERTAIN_UI_CONSECUTIVE,
  ON_ROUTE_FLOOR_M,
  OFF_ROUTE_FLOOR_M,
} from '../src/utils/trackingSession.mjs';
import { projectOntoRoute } from '../src/utils/routeProgress.mjs';

// Synthetic straight west→east test line (NOT real route data).
function line(lat, lon0, count, stepDeg, kmPerStep, kmOffset = 0) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      lat,
      lon: lon0 + i * stepDeg,
      cumulativeDistanceKm: kmOffset + i * kmPerStep,
    });
  }
  return pts;
}

const testLine = () => line(52, 4.3, 10, 0.001, 0.0684);

const NOW = 1_700_000_000_000;

const fix = (over = {}) => ({
  lat: 52,
  lon: 4.3005,
  accuracyM: 10,
  timestamp: NOW,
  ...over,
});

/** Single-geometry advance (Delft-style: route === stage). */
const advance = (session, f, points = testLine()) => {
  const proj = projectOntoRoute(points, { lat: f.lat, lon: f.lon }, { accuracyM: f.accuracyM });
  return advanceTrackingSession(session, f, { route: proj, stage: proj }, (f.timestamp ?? NOW) + 500);
};

// ---- classifyFix ------------------------------------------------------------

test('classifyFix: poor accuracy is always uncertain, never off-route', () => {
  assert.equal(
    classifyFix({ crossTrackM: 500, accuracyM: ACCURACY_UNCERTAIN_M + 1 }),
    'uncertain',
  );
  assert.equal(classifyFix({ crossTrackM: 5, accuracyM: null }), 'uncertain');
});

test('classifyFix: close fix with good accuracy is on-route', () => {
  assert.equal(classifyFix({ crossTrackM: 10, accuracyM: 8 }), 'on-route');
  assert.equal(classifyFix({ crossTrackM: ON_ROUTE_FLOOR_M, accuracyM: 5 }), 'on-route');
});

test('classifyFix: far fix is off-route; the gap between floors is uncertain', () => {
  assert.equal(classifyFix({ crossTrackM: OFF_ROUTE_FLOOR_M, accuracyM: 5 }), 'off-route');
  assert.equal(classifyFix({ crossTrackM: 50, accuracyM: 5 }), 'uncertain');
});

test('classifyFix: thresholds scale with reported accuracy', () => {
  assert.equal(classifyFix({ crossTrackM: 44, accuracyM: 30 }), 'on-route');
  assert.equal(classifyFix({ crossTrackM: 89, accuracyM: 30 }), 'uncertain');
  assert.equal(classifyFix({ crossTrackM: 91, accuracyM: 30 }), 'off-route');
});

// ---- acceptance -------------------------------------------------------------

test('an on-line fix is accepted and updates trail, status and progress', () => {
  const s = advance(createTrackingSession(), fix());
  assert.equal(s.acceptedCount, 1);
  assert.equal(s.rejectedCount, 0);
  assert.equal(s.trail.length, 1);
  assert.equal(s.routeStatus, 'on-route');
  assert.equal(s.stageMatched, true);
  assert.ok(s.progress && s.progress.alongKm > 0);
  assert.equal(s.progressStale, false);
  assert.equal(s.lastAccepted.status, 'on-route');
  assert.ok(s.lastAccepted.crossTrackM < 60);
});

test('stale (same or older timestamp) readings are rejected', () => {
  let s = advance(createTrackingSession(), fix());
  s = advance(s, fix({ timestamp: NOW }));
  s = advance(s, fix({ timestamp: NOW - 1000 }));
  assert.equal(s.acceptedCount, 1);
  assert.equal(s.rejectedCount, 2);
  assert.equal(s.log[1].rejectReason, 'stale');
  assert.equal(s.log[2].rejectReason, 'stale');
});

test('readings with hopeless accuracy are logged but rejected', () => {
  const s = advance(createTrackingSession(), fix({ accuracyM: MAX_ACCEPT_ACCURACY_M + 50 }));
  assert.equal(s.acceptedCount, 0);
  assert.equal(s.rejectedCount, 1);
  assert.equal(s.log[0].rejectReason, 'low-accuracy');
  assert.equal(s.lastFix, null);
  assert.equal(s.lastAccepted, null);
});

test('non-finite coordinates are rejected as invalid', () => {
  const s = advance(createTrackingSession(), fix({ lat: NaN }));
  assert.equal(s.log[0].rejectReason, 'invalid');
});

// ---- production options: no log, no trail -----------------------------------

test('keepLog/keepTrail false: counters and status work, no history retained', () => {
  let s = createTrackingSession({ keepLog: false, keepTrail: false });
  s = advance(s, fix());
  s = advance(s, fix({ timestamp: NOW })); // rejected stale
  s = advance(s, fix({ timestamp: NOW + 1000, lon: 4.302 }));
  assert.equal(s.acceptedCount, 2);
  assert.equal(s.rejectedCount, 1);
  assert.equal(s.log.length, 0, 'no diagnostic log retained');
  assert.equal(s.trail.length, 0, 'no breadcrumb retained');
  assert.equal(s.routeStatus, 'on-route');
  assert.ok(s.lastFix && s.lastAccepted && s.progress);
});

// ---- off-route debounce -----------------------------------------------------

test('off-route needs consecutive fixes; recovery is immediate', () => {
  let s = advance(createTrackingSession(), fix());
  for (let i = 1; i <= OFF_ROUTE_CONSECUTIVE; i++) {
    s = advance(s, fix({ lat: 52.002, timestamp: NOW + i * 1000 }));
    if (i < OFF_ROUTE_CONSECUTIVE) {
      assert.equal(s.routeStatus, 'uncertain', `streak ${i} must stay qualified`);
    }
  }
  assert.equal(s.routeStatus, 'off-route');

  s = advance(s, fix({ timestamp: NOW + 60_000 }));
  assert.equal(s.routeStatus, 'on-route');
  assert.equal(s.offRouteStreak, 0);
});

test('poor accuracy interrupts an off-route streak (conservative)', () => {
  let s = advance(createTrackingSession(), fix());
  s = advance(s, fix({ lat: 52.002, timestamp: NOW + 1000 }));
  s = advance(s, fix({ lat: 52.002, timestamp: NOW + 2000 }));
  s = advance(s, fix({ lat: 52.002, accuracyM: 80, timestamp: NOW + 3000 }));
  assert.equal(s.routeStatus, 'uncertain');
  assert.equal(s.offRouteStreak, 0);
});

test('uncertainStreak counts consecutive uncertain fixes for UI damping', () => {
  let s = advance(createTrackingSession(), fix());
  assert.equal(s.uncertainStreak, 0);
  // ~50 m north: between the floors at ±10 m accuracy → per-fix 'uncertain'.
  s = advance(s, fix({ lat: 52.00045, timestamp: NOW + 1000 }));
  assert.equal(s.uncertainStreak, 1);
  assert.ok(s.uncertainStreak < UNCERTAIN_UI_CONSECUTIVE);
  s = advance(s, fix({ lat: 52.00045, timestamp: NOW + 2000 }));
  assert.equal(s.uncertainStreak, 2);
  s = advance(s, fix({ timestamp: NOW + 3000 }));
  assert.equal(s.uncertainStreak, 0, 'on-route resets the streak');
});

// ---- full route vs current stage (multi-stage) --------------------------------

test('on the full route but off the current stage: no off-route, progress withheld', () => {
  // Synthetic two-stage route: stage 1 near lon 4.30, stage 2 near lon 4.40
  // (~7 km east). The "full route" spans both.
  const stage1 = line(52, 4.3, 10, 0.001, 0.0684);
  const fullRoute = [
    ...line(52, 4.3, 10, 0.001, 0.0684),
    ...line(52, 4.4, 10, 0.001, 0.0684, 6.9),
  ];

  // A fix ON stage 2 while the CURRENT stage is stage 1.
  const f = fix({ lon: 4.4005 });
  const routeProj = projectOntoRoute(fullRoute, f, { accuracyM: f.accuracyM });
  const stageProj = projectOntoRoute(stage1, f, { accuracyM: f.accuracyM });
  assert.ok(routeProj.reliable, 'fix is on the full mapped route');
  assert.ok(!stageProj.reliable, 'fix is far from the current stage');

  let s = advanceTrackingSession(
    createTrackingSession(),
    f,
    { route: routeProj, stage: stageProj },
    NOW + 500,
  );
  assert.equal(s.routeStatus, 'on-route', 'never off-route on another stage');
  assert.equal(s.offRouteStreak, 0);
  assert.equal(s.stageMatched, false);
  assert.equal(s.progress, null, 'no stage progress fabricated');

  // Repeated fixes there must never escalate to off-route.
  for (let i = 1; i <= OFF_ROUTE_CONSECUTIVE + 1; i++) {
    const fi = fix({ lon: 4.4005, timestamp: NOW + i * 1000 });
    s = advanceTrackingSession(
      s,
      fi,
      {
        route: projectOntoRoute(fullRoute, fi, { accuracyM: fi.accuracyM }),
        stage: projectOntoRoute(stage1, fi, { accuracyM: fi.accuracyM }),
      },
      NOW + i * 1000 + 500,
    );
  }
  assert.equal(s.routeStatus, 'on-route');
  assert.equal(s.progress, null);
});

test('moving from the current stage to another stage freezes progress as stale', () => {
  const stage1 = line(52, 4.3, 10, 0.001, 0.0684);
  const fullRoute = [
    ...line(52, 4.3, 10, 0.001, 0.0684),
    ...line(52, 4.4, 10, 0.001, 0.0684, 6.9),
  ];
  const adv = (s, f) =>
    advanceTrackingSession(
      s,
      f,
      {
        route: projectOntoRoute(fullRoute, f, { accuracyM: f.accuracyM }),
        stage: projectOntoRoute(stage1, f, { accuracyM: f.accuracyM }),
      },
      (f.timestamp ?? NOW) + 500,
    );

  let s = adv(createTrackingSession(), fix()); // on stage 1
  const before = s.progress.alongKm;
  s = adv(s, fix({ lon: 4.4005, timestamp: NOW + 1000 })); // on stage 2
  assert.equal(s.routeStatus, 'on-route');
  assert.equal(s.stageMatched, false);
  assert.equal(s.progress.alongKm, before, 'progress kept, not jumped');
  assert.equal(s.progressStale, true);
});

// ---- progress freezing (validated in the field) -------------------------------

test('walking away freezes progress at the last reliable value (no jump)', () => {
  let s = advance(createTrackingSession(), fix());
  const before = s.progress.alongKm;
  s = advance(s, fix({ lat: 52.002, timestamp: NOW + 1000 }));
  assert.equal(s.progress.alongKm, before);
  assert.equal(s.progressStale, true);
  s = advance(s, fix({ lon: 4.302, timestamp: NOW + 2000 }));
  assert.equal(s.progressStale, false);
  assert.ok(s.progress.alongKm > before);
});

// ---- trail ------------------------------------------------------------------

test('standing still does not grow the breadcrumb trail', () => {
  let s = advance(createTrackingSession(), fix());
  s = advance(s, fix({ timestamp: NOW + 1000 }));
  s = advance(s, fix({ timestamp: NOW + 2000, lon: 4.30051 }));
  assert.equal(s.trail.length, 1);
  s = advance(s, fix({ timestamp: NOW + 3000, lon: 4.302 }));
  assert.equal(s.trail.length, 2);
});

// ---- export -----------------------------------------------------------------

test('JSON export carries meta, counts and every logged reading', () => {
  let s = advance(createTrackingSession(), fix());
  s = advance(s, fix({ timestamp: NOW }));
  const out = sessionToExport(s, { appVersion: 'test', route: 'delft-pilot' });
  assert.equal(out.kind, 'fjallkompis-pilot-session');
  assert.equal(out.acceptedCount, 1);
  assert.equal(out.rejectedCount, 1);
  assert.equal(out.fixes.length, 2);
});

test('CSV export has a header and one row per reading', () => {
  let s = advance(createTrackingSession(), fix());
  s = advance(s, fix({ timestamp: NOW + 1000, lon: 4.302 }));
  const csv = sessionToCsv(s);
  assert.equal(csv.split('\n').length, 3);
  assert.ok(csv.startsWith('timestamp,'));
});

// ---- watcher lifecycle (createWatchController) --------------------------------

/** Minimal fake navigator.geolocation. */
function fakeGeolocation() {
  let nextId = 1;
  const watchers = new Map();
  return {
    watchers,
    watchPosition(success, error) {
      const id = nextId++;
      watchers.set(id, { success, error });
      return id;
    },
    clearWatch(id) {
      watchers.delete(id);
    },
    emitFix(coords) {
      for (const { success } of watchers.values()) {
        success({ coords, timestamp: coords.timestamp ?? Date.now() });
      }
    },
    emitError(code) {
      for (const { error } of [...watchers.values()]) error({ code });
    },
  };
}

test('at most one watcher: start while active is a no-op', () => {
  const geo = fakeGeolocation();
  const c = createWatchController({ geolocation: geo, onFix: () => {} });
  assert.equal(c.start(), true);
  assert.equal(c.start(), false, 'second start refused');
  assert.equal(geo.watchers.size, 1);
});

test('stop clears the watcher and is idempotent', () => {
  const geo = fakeGeolocation();
  const c = createWatchController({ geolocation: geo, onFix: () => {} });
  c.start();
  c.stop();
  assert.equal(geo.watchers.size, 0);
  assert.equal(c.isActive(), false);
  c.stop(); // second stop must not throw
  // Restart works cleanly after a stop.
  assert.equal(c.start(), true);
  assert.equal(geo.watchers.size, 1);
});

test('fixes are normalised and delivered to onFix', () => {
  const geo = fakeGeolocation();
  const got = [];
  const c = createWatchController({ geolocation: geo, onFix: (f) => got.push(f) });
  c.start();
  geo.emitFix({ latitude: 52, longitude: 4.3, accuracy: 9, timestamp: 123 });
  assert.deepEqual(got, [{ lat: 52, lon: 4.3, accuracyM: 9, timestamp: 123 }]);
});

test('permission denial is terminal: watcher auto-cleared', () => {
  const geo = fakeGeolocation();
  const errors = [];
  const c = createWatchController({
    geolocation: geo,
    onFix: () => {},
    onError: (e) => errors.push(e),
  });
  c.start();
  geo.emitError(1); // PERMISSION_DENIED
  assert.equal(c.isActive(), false);
  assert.equal(geo.watchers.size, 0);
  assert.deepEqual(errors, [{ code: 1, terminal: true }]);
});

test('transient timeout/unavailable errors keep the watcher alive', () => {
  const geo = fakeGeolocation();
  const errors = [];
  const c = createWatchController({
    geolocation: geo,
    onFix: () => {},
    onError: (e) => errors.push(e),
  });
  c.start();
  geo.emitError(3); // TIMEOUT
  geo.emitError(2); // POSITION_UNAVAILABLE
  assert.equal(c.isActive(), true);
  assert.equal(geo.watchers.size, 1);
  assert.deepEqual(
    errors.map((e) => e.terminal),
    [false, false],
  );
});

test('missing geolocation API reports a terminal error and never activates', () => {
  const errors = [];
  const c = createWatchController({
    geolocation: null,
    onFix: () => {},
    onError: (e) => errors.push(e),
  });
  assert.equal(c.start(), false);
  assert.equal(c.isActive(), false);
  assert.deepEqual(errors, [{ code: -1, terminal: true }]);
});
