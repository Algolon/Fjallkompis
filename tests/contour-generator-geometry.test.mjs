/**
 * Geometry regression tests for the contour-background generator
 * (scripts/generate-contour-backgrounds.mjs): tile-cell clipping and
 * cross-seam fragment stitching.
 *
 * The four stitch orientations use fragments with deliberately DIFFERENT
 * point counts, so any junction index inferred from the wrong fragment's
 * length (the reviewed A.length-for-all-cases bug) corrupts a mid-path
 * point and fails the exact-sequence assertions below.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clipToCell,
  stitchFragments,
} from '../scripts/generate-contour-backgrounds.mjs';

const TOL = 0.5;
// Junction endpoints deliberately NOT identical — offset by less than the
// tolerance, so the healed midpoint is distinguishable from either input.
const J1 = [10, 0];
const J2 = [10.2, 0];
const MID = [10.1, 0];

/** A carries 3 points, B carries 5 — unequal on purpose. */
const A_FORWARD = [[0, 0], [5, 1], J1]; // ends at the junction
const A_BACKWARD = [J1, [5, 1], [0, 0]]; // starts at the junction
const B_FORWARD = [J2, [12, 1], [14, 0], [16, 1], [20, 0]]; // starts at the junction
const B_BACKWARD = [[20, 0], [16, 1], [14, 0], [12, 1], J2]; // ends at the junction

const stitchOne = (a, b) => {
  const out = stitchFragments(
    [
      { points: a.map((p) => p.slice()), elev: 700 },
      { points: b.map((p) => p.slice()), elev: 700 },
    ],
    TOL,
  );
  assert.equal(out.length, 1, 'exactly one joined polyline');
  return out[0].points;
};

test('stitch orientation 1: A-end → B-start', () => {
  assert.deepEqual(stitchOne(A_FORWARD, B_FORWARD), [
    [0, 0], [5, 1], MID, [12, 1], [14, 0], [16, 1], [20, 0],
  ]);
});

test('stitch orientation 2: A-end → B-end (B reversed in)', () => {
  assert.deepEqual(stitchOne(A_FORWARD, B_BACKWARD), [
    [0, 0], [5, 1], MID, [12, 1], [14, 0], [16, 1], [20, 0],
  ]);
});

test('stitch orientation 3: A-start → B-start (A reversed in)', () => {
  assert.deepEqual(stitchOne(A_BACKWARD, B_FORWARD), [
    [0, 0], [5, 1], MID, [12, 1], [14, 0], [16, 1], [20, 0],
  ]);
});

test('stitch orientation 4: A-start → B-end (B placed FIRST — the reviewed bug)', () => {
  // next = [...B, ...A]: the junction sits at index B.length, not A.length.
  // With the old inferred index this replaced [14,0]/[16,1] inside B and
  // left the real seam pair untouched.
  assert.deepEqual(stitchOne(A_BACKWARD, B_BACKWARD), [
    [20, 0], [16, 1], [14, 0], [12, 1], MID, [5, 1], [0, 0],
  ]);
});

test('only the touching pair is healed — interior points are never modified', () => {
  for (const [a, b] of [
    [A_FORWARD, B_FORWARD],
    [A_FORWARD, B_BACKWARD],
    [A_BACKWARD, B_FORWARD],
    [A_BACKWARD, B_BACKWARD],
  ]) {
    const pts = stitchOne(a, b);
    assert.equal(pts.length, a.length + b.length - 1, 'pair → one midpoint');
    for (const interior of [[0, 0], [5, 1], [12, 1], [14, 0], [16, 1], [20, 0]]) {
      assert.ok(
        pts.some((p) => p[0] === interior[0] && p[1] === interior[1]),
        `interior point ${interior} survives verbatim`,
      );
    }
    assert.ok(pts.some((p) => p[0] === MID[0] && p[1] === MID[1]), 'midpoint present');
    assert.ok(!pts.some((p) => p[0] === J1[0] && p[1] === J1[1] && p !== MID), 'J1 replaced');
  }
});

test('an elevation mismatch never stitches', () => {
  const out = stitchFragments(
    [
      { points: A_FORWARD.map((p) => p.slice()), elev: 700 },
      { points: B_FORWARD.map((p) => p.slice()), elev: 800 },
    ],
    TOL,
  );
  assert.equal(out.length, 2, 'different elevations stay separate');
  assert.deepEqual(out[0].points, A_FORWARD);
  assert.deepEqual(out[1].points, B_FORWARD);
});

test('endpoints beyond the tolerance never stitch', () => {
  const out = stitchFragments(
    [
      { points: [[0, 0], [10, 0]], elev: 700 },
      { points: [[11, 0], [20, 0]], elev: 700 }, // 1.0 apart > TOL
    ],
    TOL,
  );
  assert.equal(out.length, 2);
});

// --- clipToCell -------------------------------------------------------------

const EXTENT = 4096;

test('clip: a line crossing the cell edge is cut at the exact boundary', () => {
  // Enters from the buffer at x=-100; the crossing with x=0 lies at y=150.
  const fragments = clipToCell([[-100, 100], [100, 200], [200, 250]], EXTENT);
  assert.equal(fragments.length, 1);
  const pts = fragments[0];
  assert.deepEqual(pts[0], [0, 150], 'starts on the boundary crossing');
  assert.deepEqual(pts[pts.length - 1], [200, 250]);
});

test('clip: a line that leaves and re-enters yields two separate fragments', () => {
  // Out through the right edge and back — the outside excursion is dropped.
  const fragments = clipToCell(
    [[EXTENT - 100, 0], [EXTENT + 100, 100], [EXTENT - 100, 200]],
    EXTENT,
  );
  assert.equal(fragments.length, 2);
  assert.deepEqual(fragments[0][fragments[0].length - 1], [EXTENT, 50], 'exit crossing');
  assert.deepEqual(fragments[1][0], [EXTENT, 150], 're-entry crossing');
});

test('clip: fully-buffered geometry is dropped, fully-inside kept verbatim', () => {
  assert.deepEqual(clipToCell([[-200, -50], [-10, -20]], EXTENT), []);
  const inside = [[10, 10], [50, 80], [90, 40]];
  assert.deepEqual(clipToCell(inside, EXTENT), [inside]);
});
