/**
 * Tests for the route-progress projection — the EXACT module the app imports
 * (src/utils/routeProgress.mjs), never a re-implementation.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectOntoRoute,
  routeMatchToleranceM,
  ROUTE_MATCH_MIN_TOLERANCE_M,
  ROUTE_MATCH_ACCURACY_MULTIPLIER,
} from '../src/utils/routeProgress.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Build a straight west→east polyline at a fixed latitude with even spacing. */
function eastwardLine(lat, lon0, count, stepDeg, kmPerStep) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push({ lat, lon: lon0 + i * stepDeg, cumulativeDistanceKm: i * kmPerStep });
  }
  return pts;
}

// ---- 1. exact stage start → 0% -------------------------------------------
test('exact stage start projects to 0%', () => {
  const pts = eastwardLine(68, 18, 5, 0.01, 1);
  const r = projectOntoRoute(pts, { lat: 68, lon: 18 });
  assert.ok(r.ok);
  assert.equal(r.percent, 0);
  assert.equal(r.distanceAlongKm, 0);
  assert.ok(r.crossTrackM < 1);
});

// ---- 2. exact stage end → 100% -------------------------------------------
test('exact stage end projects to 100%', () => {
  const pts = eastwardLine(68, 18, 5, 0.01, 1);
  const last = pts[pts.length - 1];
  const r = projectOntoRoute(pts, { lat: last.lat, lon: last.lon });
  assert.ok(r.ok);
  assert.equal(r.percent, 100);
  assert.ok(Math.abs(r.distanceAlongKm - 4) < 1e-6);
  assert.ok(Math.abs(r.distanceRemainingKm) < 1e-6);
});

// ---- 3. known midpoint of a simple segment -------------------------------
test('point on the line at a known midpoint reports the right distance', () => {
  const pts = eastwardLine(68, 18, 5, 0.01, 1); // 4 segments, 1 km each
  // Halfway along the 3rd segment (between index 2 and 3).
  const r = projectOntoRoute(pts, { lat: 68, lon: 18 + 2.5 * 0.01 });
  assert.ok(r.ok);
  assert.equal(r.segmentIndex, 2);
  assert.ok(Math.abs(r.segmentFraction - 0.5) < 1e-6);
  assert.ok(Math.abs(r.distanceAlongKm - 2.5) < 1e-6);
  assert.ok(r.crossTrackM < 1);
});

// ---- 4. point perpendicular to the middle of a segment -------------------
test('point offset perpendicular from a segment keeps along-distance, gains cross-track', () => {
  const pts = eastwardLine(68, 18, 3, 0.02, 2); // segments 2 km each
  // Directly north of the midpoint of segment 0 (lon = 18.01).
  const r = projectOntoRoute(pts, { lat: 68.002, lon: 18.01 });
  assert.ok(r.ok);
  assert.equal(r.segmentIndex, 0);
  assert.ok(Math.abs(r.segmentFraction - 0.5) < 1e-3);
  // ~0.002° latitude ≈ 222 m north.
  assert.ok(r.crossTrackM > 180 && r.crossTrackM < 260, `crossTrack ${r.crossTrackM}`);
  assert.ok(Math.abs(r.distanceAlongKm - 1) < 0.05, `along ${r.distanceAlongKm}`);
});

// ---- 5. projection beyond each endpoint is clamped -----------------------
test('projection before the start clamps to 0%, after the end clamps to 100%', () => {
  const pts = eastwardLine(68, 18, 4, 0.01, 1);
  const before = projectOntoRoute(pts, { lat: 68, lon: 17.9 });
  assert.equal(before.segmentIndex, 0);
  assert.equal(before.segmentFraction, 0);
  assert.equal(before.percent, 0);

  const last = pts[pts.length - 1];
  const after = projectOntoRoute(pts, { lat: 68, lon: last.lon + 0.1 });
  assert.equal(after.segmentFraction, 1);
  assert.equal(after.percent, 100);
});

// ---- 6. multi-segment route chooses the correct segment ------------------
test('a bent polyline matches the nearer segment', () => {
  // L-shape: east along lat 68, then north at lon 18.03.
  const pts = [
    { lat: 68, lon: 18.0, cumulativeDistanceKm: 0 },
    { lat: 68, lon: 18.01, cumulativeDistanceKm: 0.42 },
    { lat: 68, lon: 18.02, cumulativeDistanceKm: 0.84 },
    { lat: 68, lon: 18.03, cumulativeDistanceKm: 1.26 },
    { lat: 68.01, lon: 18.03, cumulativeDistanceKm: 2.37 },
    { lat: 68.02, lon: 18.03, cumulativeDistanceKm: 3.48 },
  ];
  // A point near the vertical arm should match one of the vertical segments.
  const r = projectOntoRoute(pts, { lat: 68.015, lon: 18.031 });
  assert.ok(r.ok);
  assert.ok(r.segmentIndex >= 3, `segmentIndex ${r.segmentIndex}`);
  assert.ok(r.distanceAlongKm > 1.26, `along ${r.distanceAlongKm}`);
});

// ---- 7. zero-length segment does not break calculation -------------------
test('a duplicated (zero-length) segment is handled without NaN', () => {
  const pts = [
    { lat: 68, lon: 18.0, cumulativeDistanceKm: 0 },
    { lat: 68, lon: 18.01, cumulativeDistanceKm: 1 },
    { lat: 68, lon: 18.01, cumulativeDistanceKm: 1 }, // duplicate → zero length
    { lat: 68, lon: 18.02, cumulativeDistanceKm: 2 },
  ];
  const r = projectOntoRoute(pts, { lat: 68, lon: 18.01 });
  assert.ok(r.ok);
  assert.ok(Number.isFinite(r.distanceAlongKm));
  assert.ok(Number.isFinite(r.crossTrackM));
  assert.ok(Math.abs(r.distanceAlongKm - 1) < 1e-6);
});

// ---- 8. cross-track distance and reliability threshold -------------------
test('reliability threshold combines a fixed floor with a multiple of accuracy', () => {
  assert.equal(routeMatchToleranceM(null), ROUTE_MATCH_MIN_TOLERANCE_M);
  assert.equal(routeMatchToleranceM(0), ROUTE_MATCH_MIN_TOLERANCE_M);
  assert.equal(routeMatchToleranceM(10), ROUTE_MATCH_MIN_TOLERANCE_M); // 30 < 75
  assert.equal(routeMatchToleranceM(50), ROUTE_MATCH_ACCURACY_MULTIPLIER * 50);

  const pts = eastwardLine(68, 18, 3, 0.02, 2);
  // ~222 m off the line: unreliable at default accuracy, reliable if accuracy huge.
  const off = { lat: 68.002, lon: 18.01 };
  assert.equal(projectOntoRoute(pts, off, { accuracyM: 5 }).reliable, false);
  assert.equal(projectOntoRoute(pts, off, { accuracyM: 200 }).reliable, true);

  // On the line: always reliable.
  assert.equal(projectOntoRoute(pts, { lat: 68, lon: 18.01 }).reliable, true);
});

// ---- 9. progress is monotonically bounded between 0 and 100% -------------
test('percent stays within 0–100 across many probe points', () => {
  const pts = eastwardLine(68, 18, 20, 0.005, 0.5);
  let prev = -1;
  for (let i = 0; i <= 40; i++) {
    const lon = 18 - 0.01 + (i / 40) * (0.005 * 19 + 0.02);
    const r = projectOntoRoute(pts, { lat: 68, lon });
    assert.ok(r.percent >= 0 && r.percent <= 100, `percent ${r.percent}`);
    // Sweeping west→east along the line, along-distance never decreases.
    assert.ok(r.distanceAlongKm >= prev - 1e-9, `regressed at i=${i}`);
    prev = r.distanceAlongKm;
  }
});

// ---- Robustness: empty / one-point / invalid inputs ----------------------
test('empty, single-point and invalid inputs return a non-crashing empty result', () => {
  assert.equal(projectOntoRoute([], { lat: 68, lon: 18 }).ok, false);
  assert.equal(projectOntoRoute([{ lat: 68, lon: 18, cumulativeDistanceKm: 0 }], { lat: 68, lon: 18 }).ok, false);
  const pts = eastwardLine(68, 18, 3, 0.01, 1);
  assert.equal(projectOntoRoute(pts, { lat: NaN, lon: 18 }).ok, false);
  assert.equal(projectOntoRoute(pts, { lat: 68, lon: Infinity }).ok, false);
});

test('a lng-keyed query (app LatLng) is accepted like a lon-keyed one', () => {
  const pts = eastwardLine(68, 18, 3, 0.01, 1);
  const a = projectOntoRoute(pts, { lat: 68, lon: 18.01 });
  const b = projectOntoRoute(pts, { lat: 68, lng: 18.01 });
  assert.equal(a.distanceAlongKm, b.distanceAlongKm);
});

// ---- 10. a real Fjällkompis stage produces finite, plausible results -----
test('a real generated stage yields finite, in-range progress for on-route points', () => {
  const route = JSON.parse(
    readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
  );
  // Packed points: [lat, lon, elevation|null, cumulativeKm].
  const stage = route.stages[1]; // day 2, the longest stage
  const points = stage.points.map(([lat, lon, , cumulativeDistanceKm]) => ({
    lat,
    lon,
    cumulativeDistanceKm,
  }));
  const totalKm = points[points.length - 1].cumulativeDistanceKm;

  // Probe an actual mid-stage route vertex → should match essentially on-line.
  const mid = points[Math.floor(points.length / 2)];
  const r = projectOntoRoute(points, { lat: mid.lat, lon: mid.lon }, { accuracyM: 15 });
  assert.ok(r.ok);
  assert.ok(r.reliable, `cross-track ${r.crossTrackM} m`);
  assert.ok(r.crossTrackM < 30, `cross-track ${r.crossTrackM} m`);
  assert.ok(r.percent > 0 && r.percent < 100);
  assert.ok(Math.abs(r.totalKm - totalKm) < 1e-9);
  assert.ok(Math.abs(r.distanceAlongKm + r.distanceRemainingKm - totalKm) < 1e-6);

  // Exact endpoints of the real stage.
  const start = projectOntoRoute(points, { lat: points[0].lat, lon: points[0].lon });
  assert.equal(start.percent, 0);
  const endPt = points[points.length - 1];
  const end = projectOntoRoute(points, { lat: endPt.lat, lon: endPt.lon });
  assert.equal(end.percent, 100);

  // A point ~2 km off the route (nudged far north) is rejected.
  const farOff = projectOntoRoute(points, { lat: mid.lat + 0.02, lon: mid.lon }, { accuracyM: 15 });
  assert.equal(farOff.reliable, false);
  assert.ok(farOff.crossTrackM > 1000, `cross-track ${farOff.crossTrackM} m`);
});
