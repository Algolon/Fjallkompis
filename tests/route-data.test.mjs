/**
 * Deterministic validation of the GPX preprocessing pipeline.
 * Runs the full pipeline from the source GPX (not just the committed JSON)
 * so a stale or hand-edited kungsleden-route.json cannot mask a regression.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRouteData, smoothElevation, ascentDescent } from '../scripts/generate-route-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const xml = readFileSync(join(ROOT, 'public/gpx/kungsleden-abisko-nikkaluokta.gpx'), 'utf8');
const { data, problems } = buildRouteData(xml);

const committed = JSON.parse(
  readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
);

test('pipeline reports no validation problems', () => {
  assert.deepEqual(problems, []);
});

test('eight GPX track segments and eight waypoints are found', () => {
  assert.equal(data.diagnostics.segmentCount, 8);
  assert.equal(data.diagnostics.waypointCount, 8);
});

test('segment 0 is overview only; seven stages are generated', () => {
  assert.equal(data.stages.length, 7);
  // Overview point count equals segment 0, not the sum of stage segments —
  // proof the overview was not built by concatenating stages.
  const stagePointSum = data.diagnostics.stagePointCounts.reduce((a, b) => a + b, 0);
  assert.equal(data.diagnostics.overviewPointCount, data.overview.points.length);
  assert.notEqual(data.overview.points.length, stagePointSum);
});

test('overview route is ~104.5 km and stage sum matches within 1%', () => {
  const overview = data.statistics.distanceKm;
  const stageSum = data.stages.reduce((s, st) => s + st.statistics.distanceKm, 0);
  assert.ok(Math.abs(overview - 104.48) < 0.5, `overview ${overview} km`);
  assert.ok(Math.abs(stageSum - 104.49) < 0.5, `stage sum ${stageSum} km`);
  const diffPct = (Math.abs(overview - stageSum) / overview) * 100;
  assert.ok(diffPct < 1, `diff ${diffPct}%`);
});

test('no route distance is double counted (total is not overview + stages)', () => {
  // If overview and stages were ever combined, the total would land near 209.
  assert.ok(data.statistics.distanceKm < 110);
});

test('individual stage distances match expected values within 250 m', () => {
  const expected = [13.77, 20.33, 13.22, 12.65, 11.75, 14.23, 18.53];
  data.stages.forEach((s, i) => {
    assert.ok(
      Math.abs(s.statistics.distanceKm - expected[i]) < 0.25,
      `day ${i + 1}: ${s.statistics.distanceKm} km, expected ~${expected[i]} km`,
    );
  });
});

test('stage endpoints correspond with the expected waypoints (≤ 250 m)', () => {
  const wp = Object.fromEntries(data.waypoints.map((w) => [w.id, w]));
  const havM = (a, b) => {
    const R = 6371000;
    const t = (d) => (d * Math.PI) / 180;
    const h =
      Math.sin(t(b.lat - a.lat) / 2) ** 2 +
      Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lon - a.lon) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  for (const s of data.stages) {
    const [latA, lonA] = s.points[0];
    const [latB, lonB] = s.points.at(-1);
    assert.ok(havM({ lat: latA, lon: lonA }, wp[s.fromWaypointId]) <= 250, `${s.id} start`);
    assert.ok(havM({ lat: latB, lon: lonB }, wp[s.toWaypointId]) <= 250, `${s.id} end`);
  }
});

test('waypoints carry machine ids and are in route order', () => {
  assert.deepEqual(
    data.waypoints.map((w) => w.id),
    [
      'START_ABISKO',
      'HUT_ABISKOJAURE',
      'HUT_ALESJAURE',
      'HUT_TJAKTJA',
      'HUT_SALKA',
      'HUT_SINGI',
      'HUT_KEBNEKAISE',
      'END_NIKKALUOKTA',
    ],
  );
});

test('elevation exists on the route and range is ~379–1139 m', () => {
  const { minimumElevationM, maximumElevationM } = data.statistics;
  assert.ok(minimumElevationM != null && maximumElevationM != null);
  assert.ok(Math.abs(minimumElevationM - 379) < 5, `min ${minimumElevationM}`);
  assert.ok(Math.abs(maximumElevationM - 1139) < 5, `max ${maximumElevationM}`);
  // Every stage has elevation on nearly all points.
  for (const s of data.stages) {
    const withEle = s.points.filter((p) => p[2] != null).length;
    assert.ok(withEle / s.points.length > 0.99, `${s.id} elevation coverage`);
  }
});

test('route bounds are valid and contain all stage bounds', () => {
  const [[w, s], [e, n]] = data.bounds;
  assert.ok(w < e && s < n);
  for (const st of data.stages) {
    const [[sw, ss], [se, sn]] = st.bounds;
    assert.ok(sw >= w - 1e-6 && se <= e + 1e-6 && ss >= s - 1e-6 && sn <= n + 1e-6, st.id);
  }
  // Map cutout must strictly contain the route bounds.
  const [[cw, cs], [ce, cn]] = data.mapCutoutBounds;
  assert.ok(cw < w && cs < s && ce > e && cn > n);
});

test('cumulative distances are monotonic per geometry', () => {
  for (const geom of [data.overview, ...data.stages]) {
    let prev = -1;
    for (const p of geom.points) {
      assert.ok(p[3] >= prev, 'cumulative distance must not decrease');
      prev = p[3];
    }
    assert.equal(geom.points[0][3], 0);
  }
});

test('committed generated JSON is up to date with the GPX', () => {
  assert.equal(committed.sourceSha256, data.sourceSha256, 'run: npm run generate:route');
  assert.equal(committed.statistics.distanceKm, data.statistics.distanceKm);
});

test('elevation smoothing: flat noisy profile accumulates no climbing', () => {
  // ±1 m jitter around 500 m — everything below the 2 m hysteresis threshold.
  const noisy = Array.from({ length: 200 }, (_, i) => 500 + (i % 2 === 0 ? 1 : -1));
  const { ascent, descent } = ascentDescent(smoothElevation(noisy));
  assert.equal(ascent, 0);
  assert.equal(descent, 0);
});

test('elevation smoothing: a real climb is still fully counted', () => {
  const climb = Array.from({ length: 101 }, (_, i) => 400 + i * 2); // +200 m
  const { ascent, descent } = ascentDescent(smoothElevation(climb));
  assert.ok(Math.abs(ascent - 200) < 5, `ascent ${ascent}`);
  assert.equal(descent, 0);
});
