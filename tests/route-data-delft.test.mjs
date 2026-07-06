/**
 * Tests for the generalized GPX pipeline running under the TEMPORARY
 * delft-pilot route config (scripts/route-configs.mjs).
 *
 * Uses a SYNTHETIC in-test GPX fixture (a plain 8-point line) — this is a
 * structural test of the generator's delft expectations, NOT the real Delft
 * pilot route, which must be produced in gpx.studio (docs/delft-pilot-test.md).
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRouteData,
  buildMissingRouteStub,
} from '../scripts/generate-route-data.mjs';
import { DELFT_PILOT_CONFIG, KUNGSLEDEN_CONFIG } from '../scripts/route-configs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Synthetic GPX fixture matching the delft-pilot structural contract. A
 *  gentle zig-zag (not a perfectly straight line) so bounds are 2-D. */
function syntheticDelftGpx({ waypoints, singleSegment = false } = {}) {
  const line = (n) =>
    Array.from(
      { length: n },
      (_, i) =>
        `<trkpt lat="${(52.0 + (i % 2) * 0.0005).toFixed(4)}" lon="${(4.3 + i * 0.002).toFixed(4)}"></trkpt>`,
    ).join('');
  const wpts =
    waypoints ??
    `<wpt lat="52.0" lon="4.3"><name>Start</name><cmt>START_DELFT</cmt></wpt>
     <wpt lat="52.0005" lon="4.314"><name>End</name><cmt>END_DELFT</cmt></wpt>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test-fixture">
  ${wpts}
  <trk><name>Synthetic pilot fixture</name>
    <trkseg>${line(8)}</trkseg>
    ${singleSegment ? '' : `<trkseg>${line(8)}</trkseg>`}
  </trk>
</gpx>`;
}

test('delft config accepts a structurally valid 2-segment / 2-waypoint GPX', () => {
  const { data, problems } = buildRouteData(syntheticDelftGpx(), DELFT_PILOT_CONFIG);
  assert.deepEqual(problems, []);
  assert.equal(data.stages.length, 1);
  assert.equal(data.stages[0].id, 'p1');
  assert.equal(data.stages[0].fromWaypointId, 'START_DELFT');
  assert.equal(data.stages[0].toWaypointId, 'END_DELFT');
  assert.equal(data.sourceFile, DELFT_PILOT_CONFIG.gpxPath);
});

test('delft config does not require elevation (Delft is flat)', () => {
  const { data, problems } = buildRouteData(syntheticDelftGpx(), DELFT_PILOT_CONFIG);
  assert.deepEqual(problems, []);
  assert.equal(data.statistics.minimumElevationM, null);
  assert.equal(data.statistics.totalAscentM, null);
});

test('delft config rejects wrong segment or waypoint counts', () => {
  const r1 = buildRouteData(syntheticDelftGpx({ singleSegment: true }), DELFT_PILOT_CONFIG);
  assert.ok(r1.problems.some((p) => p.includes('2 track segments')));

  const wrongIds = syntheticDelftGpx({
    waypoints:
      '<wpt lat="52.0" lon="4.3"><name>Start</name><cmt>START_WRONG</cmt></wpt>' +
      '<wpt lat="52.0005" lon="4.314"><name>End</name><cmt>END_DELFT</cmt></wpt>',
  });
  const r2 = buildRouteData(wrongIds, DELFT_PILOT_CONFIG);
  assert.ok(r2.problems.some((p) => p.includes('missing expected waypoint')));
});

test('delft map cutout uses the modest 2 km pilot buffer', () => {
  assert.equal(DELFT_PILOT_CONFIG.mapBufferKm, 2);
  const { data } = buildRouteData(syntheticDelftGpx(), DELFT_PILOT_CONFIG);
  const [[w, s], [e, n]] = data.bounds;
  const [[cw, cs], [ce, cn]] = data.mapCutoutBounds;
  assert.ok(cw < w && cs < s && ce > e && cn > n);
  // ~2 km of latitude ≈ 0.018°; assert the pad is close to that, not 9 km.
  assert.ok(Math.abs(s - cs - 2 / 111.32) < 0.002, `lat pad ${s - cs}`);
});

test('pilot identifiers never collide with persisted Kungsleden identifiers', () => {
  assert.notEqual(DELFT_PILOT_CONFIG.stageIdPrefix, KUNGSLEDEN_CONFIG.stageIdPrefix);
  const kungsledenWpts = KUNGSLEDEN_CONFIG.stageWaypoints.flat();
  for (const [from, to] of DELFT_PILOT_CONFIG.stageWaypoints) {
    assert.ok(!kungsledenWpts.includes(from));
    assert.ok(!kungsledenWpts.includes(to));
  }
  assert.notEqual(DELFT_PILOT_CONFIG.pmtilesPath, KUNGSLEDEN_CONFIG.pmtilesPath);
  assert.notEqual(DELFT_PILOT_CONFIG.outputPath, KUNGSLEDEN_CONFIG.outputPath);
});

test('while the Delft GPX is absent, the committed JSON is the stub', () => {
  const gpxPresent = existsSync(join(ROOT, DELFT_PILOT_CONFIG.gpxPath));
  const committed = JSON.parse(
    readFileSync(join(ROOT, DELFT_PILOT_CONFIG.outputPath), 'utf8'),
  );
  if (gpxPresent) {
    // Real data generated: it must NOT be the stub and must carry geometry.
    assert.notEqual(committed.available, false);
    assert.ok(Array.isArray(committed.stages) && committed.stages.length === 1);
  } else {
    assert.deepEqual(committed, buildMissingRouteStub(DELFT_PILOT_CONFIG));
  }
});
