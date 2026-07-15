/**
 * Guards the deterministic elevation policy (scripts/gpx-elevation.mjs): a
 * hysteresis noise filter that preserves real grade changes but ignores
 * sub-threshold oscillation, so cumulative ascent/descent can't be inflated by
 * DEM/barometric jitter. The build-time generator consumes this exact function.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ELEVATION_NOISE_THRESHOLD_M,
  cumulativeGain,
} from '../scripts/gpx-elevation.mjs';

test('degenerate inputs yield zero gain', () => {
  assert.deepEqual(cumulativeGain([]), { ascent: 0, descent: 0 });
  assert.deepEqual(cumulativeGain([100]), { ascent: 0, descent: 0 });
  assert.deepEqual(cumulativeGain(null), { ascent: 0, descent: 0 });
});

test('a steady climb accumulates its full net ascent (real grade preserved)', () => {
  // 0 → 100 in 10 m steps; every step clears the threshold.
  const climb = Array.from({ length: 11 }, (_, i) => i * 10);
  const g = cumulativeGain(climb, 3);
  assert.equal(g.ascent, 100);
  assert.equal(g.descent, 0);
});

test('a gentle climb below the step size still fully counts (threshold-chunked)', () => {
  // 1 m steps (below the 3 m threshold) still sum to the full climb, because the
  // running reference only holds until the cumulative move clears the band.
  const climb = Array.from({ length: 31 }, (_, i) => i); // 0..30 by 1 m
  const g = cumulativeGain(climb, 3);
  assert.equal(g.ascent, 30, 'no real climb is lost to the filter');
  assert.equal(g.descent, 0);
});

test('sub-threshold oscillation is treated as noise and ignored', () => {
  // ±2 m jitter around a flat level, with a 3 m threshold → nothing accumulates.
  const jitter = [100, 102, 100, 98, 100, 101, 99, 100, 102, 100];
  const g = cumulativeGain(jitter, 3);
  assert.equal(g.ascent, 0);
  assert.equal(g.descent, 0);
});

test('above-threshold undulation is genuine and IS counted', () => {
  // Up 50, down 50, up 50 — real hills, each well above the band.
  const undulating = [0, 50, 0, 50];
  const g = cumulativeGain(undulating, 3);
  assert.equal(g.ascent, 100); // two real 50 m climbs
  assert.equal(g.descent, 50); // one real 50 m drop
});

test('a real climb buried in jitter keeps the climb, drops the jitter', () => {
  // Net +20 climb sampled with ±1 m noise on each step.
  const noisy = [0, 1, 0, 4, 3, 6, 5, 9, 8, 12, 11, 16, 15, 20];
  const g = cumulativeGain(noisy, 3);
  assert.equal(g.descent, 0, 'no spurious descent from the 1 m dips');
  assert.ok(g.ascent >= 18 && g.ascent <= 20, `~net climb, not inflated (${g.ascent})`);
});

test('the default threshold is the documented small noise band', () => {
  assert.equal(ELEVATION_NOISE_THRESHOLD_M, 3);
  const climb = [0, 10, 20];
  assert.deepEqual(cumulativeGain(climb), cumulativeGain(climb, 3), 'default applied');
});
