/**
 * Tests for the Delft-pilot live-tracking session logic — the EXACT module
 * the app imports (src/utils/pilotSession.mjs), never a re-implementation.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePilotSession,
  classifyFix,
  createPilotSession,
  sessionToCsv,
  sessionToExport,
  ACCURACY_UNCERTAIN_M,
  MAX_ACCEPT_ACCURACY_M,
  OFF_ROUTE_CONSECUTIVE,
  ON_ROUTE_FLOOR_M,
  OFF_ROUTE_FLOOR_M,
} from '../src/utils/pilotSession.mjs';
import { projectOntoRoute } from '../src/utils/routeProgress.mjs';

// Synthetic straight west→east test line (NOT real route data): 10 points,
// ~55.9 m apart at lat 52 (0.05° lon ≈ 3.42 km ≈ 0.38 km/step... computed by
// projectOntoRoute itself from the provided cumulative distances).
function testLine() {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    pts.push({ lat: 52, lon: 4.3 + i * 0.001, cumulativeDistanceKm: i * 0.0684 });
  }
  return pts;
}

const NOW = 1_700_000_000_000;

const fix = (over = {}) => ({
  lat: 52,
  lon: 4.3005,
  accuracyM: 10,
  timestamp: NOW,
  ...over,
});

const advance = (session, f) =>
  advancePilotSession(
    session,
    f,
    projectOntoRoute(testLine(), { lat: f.lat, lon: f.lon }, { accuracyM: f.accuracyM }),
    (f.timestamp ?? NOW) + 500,
  );

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
  assert.equal(
    classifyFix({ crossTrackM: ON_ROUTE_FLOOR_M, accuracyM: 5 }),
    'on-route',
  );
});

test('classifyFix: far fix with good accuracy is off-route; the gap between the floors is uncertain', () => {
  assert.equal(
    classifyFix({ crossTrackM: OFF_ROUTE_FLOOR_M, accuracyM: 5 }),
    'off-route',
  );
  assert.equal(classifyFix({ crossTrackM: 50, accuracyM: 5 }), 'uncertain');
});

test('classifyFix: thresholds scale with reported accuracy', () => {
  // acc 30 → on-route ≤ 45, off-route ≥ 90.
  assert.equal(classifyFix({ crossTrackM: 44, accuracyM: 30 }), 'on-route');
  assert.equal(classifyFix({ crossTrackM: 89, accuracyM: 30 }), 'uncertain');
  assert.equal(classifyFix({ crossTrackM: 91, accuracyM: 30 }), 'off-route');
});

// ---- acceptance -------------------------------------------------------------

test('an on-line fix is accepted and updates trail, status and progress', () => {
  const s = advance(createPilotSession(), fix());
  assert.equal(s.acceptedCount, 1);
  assert.equal(s.rejectedCount, 0);
  assert.equal(s.trail.length, 1);
  assert.equal(s.routeStatus, 'on-route');
  assert.ok(s.progress);
  assert.ok(s.progress.alongKm > 0);
  assert.equal(s.progressStale, false);
});

test('stale (same or older timestamp) readings are rejected', () => {
  let s = advance(createPilotSession(), fix());
  s = advance(s, fix({ timestamp: NOW })); // duplicate
  s = advance(s, fix({ timestamp: NOW - 1000 })); // older
  assert.equal(s.acceptedCount, 1);
  assert.equal(s.rejectedCount, 2);
  assert.equal(s.log[1].rejectReason, 'stale');
  assert.equal(s.log[2].rejectReason, 'stale');
});

test('readings with hopeless accuracy are logged but rejected', () => {
  const s = advance(
    createPilotSession(),
    fix({ accuracyM: MAX_ACCEPT_ACCURACY_M + 50 }),
  );
  assert.equal(s.acceptedCount, 0);
  assert.equal(s.rejectedCount, 1);
  assert.equal(s.log[0].rejectReason, 'low-accuracy');
  assert.equal(s.lastFix, null);
  assert.equal(s.trail.length, 0);
});

test('non-finite coordinates are rejected as invalid', () => {
  const s = advance(createPilotSession(), fix({ lat: NaN }));
  assert.equal(s.log[0].rejectReason, 'invalid');
});

// ---- off-route debounce -----------------------------------------------------

test('off-route needs consecutive fixes; recovery is immediate', () => {
  let s = advance(createPilotSession(), fix());
  assert.equal(s.routeStatus, 'on-route');

  // Move ~220 m north of the line (0.002° lat) with good accuracy.
  for (let i = 1; i <= OFF_ROUTE_CONSECUTIVE; i++) {
    s = advance(s, fix({ lat: 52.002, timestamp: NOW + i * 1000 }));
    if (i < OFF_ROUTE_CONSECUTIVE) {
      assert.equal(s.routeStatus, 'uncertain', `streak ${i} must stay qualified`);
    }
  }
  assert.equal(s.routeStatus, 'off-route');

  // One good fix back on the line recovers instantly.
  s = advance(s, fix({ timestamp: NOW + 60_000 }));
  assert.equal(s.routeStatus, 'on-route');
  assert.equal(s.offRouteStreak, 0);
});

test('poor accuracy interrupts an off-route streak (conservative)', () => {
  let s = advance(createPilotSession(), fix());
  s = advance(s, fix({ lat: 52.002, timestamp: NOW + 1000 }));
  s = advance(s, fix({ lat: 52.002, timestamp: NOW + 2000 }));
  // Accuracy degrades: this fix is 'uncertain' and resets the streak.
  s = advance(s, fix({ lat: 52.002, accuracyM: 80, timestamp: NOW + 3000 }));
  assert.equal(s.routeStatus, 'uncertain');
  assert.equal(s.offRouteStreak, 0);
});

// ---- progress freezing ------------------------------------------------------

test('walking away freezes progress at the last reliable value (no jump)', () => {
  let s = advance(createPilotSession(), fix());
  const before = s.progress.alongKm;

  // ~220 m off the line: projection unreliable at ±10 m accuracy.
  s = advance(s, fix({ lat: 52.002, timestamp: NOW + 1000 }));
  assert.equal(s.progress.alongKm, before, 'progress must not move');
  assert.equal(s.progressStale, true);

  // Returning to the route resumes progress and clears the stale flag.
  s = advance(s, fix({ lon: 4.302, timestamp: NOW + 2000 }));
  assert.equal(s.progressStale, false);
  assert.ok(s.progress.alongKm > before);
});

// ---- trail ------------------------------------------------------------------

test('standing still does not grow the breadcrumb trail', () => {
  let s = advance(createPilotSession(), fix());
  s = advance(s, fix({ timestamp: NOW + 1000 })); // identical position
  s = advance(s, fix({ timestamp: NOW + 2000, lon: 4.30051 })); // < 2 m east
  assert.equal(s.trail.length, 1);
  s = advance(s, fix({ timestamp: NOW + 3000, lon: 4.302 })); // ~100 m east
  assert.equal(s.trail.length, 2);
});

// ---- export -----------------------------------------------------------------

test('JSON export carries meta, counts and every logged reading', () => {
  let s = advance(createPilotSession(), fix());
  s = advance(s, fix({ timestamp: NOW })); // rejected stale
  const out = sessionToExport(s, { appVersion: 'test', route: 'delft-pilot' });
  assert.equal(out.kind, 'fjallkompis-pilot-session');
  assert.equal(out.route, 'delft-pilot');
  assert.equal(out.acceptedCount, 1);
  assert.equal(out.rejectedCount, 1);
  assert.equal(out.fixes.length, 2);
});

test('CSV export has a header and one row per reading', () => {
  let s = advance(createPilotSession(), fix());
  s = advance(s, fix({ timestamp: NOW + 1000, lon: 4.302 }));
  const csv = sessionToCsv(s);
  const lines = csv.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('timestamp,'));
  assert.ok(lines[1].includes('on-route'));
});
