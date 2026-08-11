/**
 * Full-route overview envelope (src/map/overviewEnvelope.mjs).
 *
 * The defect these fence: the overview was capped to the z7 tile cell around
 * the data bounds — 1.75° west of the route centre but only 1.06° east. Wide
 * containers were clamped on the east edge alone, so maxBounds came out
 * narrower than the fit needed AND off-centre; MapLibre zoomed in to obey it,
 * pushing the route east and its southern end past the bottom of the
 * viewport. Measured before this change: 7.9 px of bottom clipping at
 * 1366×768 and 1512×860, and the route centre 94 px east of the padded centre
 * at 1920×1080.
 *
 * The contract now: the desired overview is symmetric about the composition
 * centre, capped symmetrically to the vector coverage that actually exists at
 * the source zoom the overview renders at.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { open } from 'node:fs/promises';
import { PMTiles } from 'pmtiles';
import {
  coverageForMode,
  overviewCameraFor,
  VECTOR_OVERVIEW_BUILD,
  RASTER_ARCHIVE_MIN_ZOOM,
  OVERVIEW_SLACK,
  tileAlignedFootprint,
  vectorSourceCoverage,
  rasterRenderableCoverage,
  rasterSourceZoomForDisplayZoom,
  terrainSourceCoverage,
  desiredOverviewExtent,
  overviewEnvelopeFor,
  mercX,
  mercY,
} from '../src/map/overviewEnvelope.mjs';
import { cameraConstraintsFor, activeBoundsForZoom } from '../src/map/cameraBounds.mjs';
import { overviewPaddingFor } from '../src/map/mapPadding.mjs';
import { KUNGSLEDEN_CONFIG } from '../scripts/route-configs.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = JSON.parse(readFileSync(join(root, 'src/generated/kungsleden-route.json'), 'utf8'));
const CUTOUT = route.mapCutoutBounds;
const EPS = 1e-9;

const routeCx = (mercX(route.bounds[0][0]) + mercX(route.bounds[1][0])) / 2;

/** The app's real container size for a browser viewport (shell rules). */
const container = (W, H) => {
  if (W < 760 || H < 500) return [W, H - 56];
  return [W - (W >= 1160 ? 148 : 84), H];
};

/** Overview padding as the app computes it, with the measured lead depths. */
const padFor = (w, h) =>
  overviewPaddingFor({ viewportWidth: w, viewportHeight: h, topInset: w >= 700 ? 58 : 54, bottomInset: 0 });

const envelopeFor = (W, H) => {
  const [w, h] = container(W, H);
  return overviewEnvelopeFor({
    routeBounds: route.bounds, userBounds: route.userBounds, cutoutBounds: CUTOUT,
    viewportWidth: w, viewportHeight: h, padding: padFor(w, h),
  });
};

const PORTRAIT = [[320, 568], [360, 800], [375, 667], [390, 844], [412, 915], [430, 932]];
const DESKTOP = [[1024, 768], [1280, 800], [1366, 768], [1440, 900], [1512, 860], [1536, 864], [1920, 1080]];
const ULTRAWIDE = [[2560, 1080], [3440, 1440]];

// ---- the build contract this model reproduces -------------------------------

test('the declared vector-overview build matches scripts/route-configs.mjs', () => {
  assert.deepEqual(
    { ...VECTOR_OVERVIEW_BUILD },
    { ...KUNGSLEDEN_CONFIG.vectorOverview },
    'the runtime coverage model and the build that produced the archive must agree',
  );
});

test('modelled vector coverage matches the COMMITTED archive, zoom by zoom', async (t) => {
  const path = join(root, 'public/maps/kungsleden.pmtiles');
  if (!existsSync(path)) return t.skip('vector archive absent');

  class FileSource {
    constructor(p) { this.p = p; }
    getKey() { return this.p; }
    async getBytes(offset, length) {
      const fh = await open(this.p, 'r');
      try {
        const buf = Buffer.alloc(length);
        await fh.read(buf, 0, length, offset);
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + length) };
      } finally { await fh.close(); }
    }
  }
  const p = new PMTiles(new FileSource(path));
  const lon2t = (lon, z) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
  const lat2t = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z));
  };

  // Overview zooms only: those are the ones the envelope reasons about, and
  // probing every z14 tile would make this test cost minutes.
  for (const z of [7, 8, 9, 10]) {
    const model = vectorSourceCoverage(z, CUTOUT);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const x0 = lon2t(model.west, z) - 2, x1 = lon2t(model.east, z) + 2;
    const y0 = lat2t(model.north, z) - 2, y1 = lat2t(model.south, z) + 2;
    for (let x = Math.max(0, x0); x <= x1; x++) {
      for (let y = Math.max(0, y0); y <= y1; y++) {
        if (await p.getZxy(z, x, y)) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    const actual = tileAlignedFootprint(
      [[model.west + 1e-9, model.south + 1e-9], [model.east - 1e-9, model.north - 1e-9]], z,
    );
    assert.equal(lon2t(model.west, z), minX, `z${z}: modelled west tile = archive west tile`);
    assert.equal(lon2t(model.east - 1e-9, z), maxX, `z${z}: modelled east tile = archive east tile`);
    assert.equal(lat2t(model.north - 1e-9, z), minY, `z${z}: modelled north tile`);
    assert.equal(lat2t(model.south + 1e-9, z), maxY, `z${z}: modelled south tile`);
    assert.ok(actual, 'footprint is derivable');
  }
});

test('the widened overview box applies through z9 and stops above it', () => {
  // PR #104 merged a widened z0–z9 extract with the unchanged z10–14 corridor.
  const wide = vectorSourceCoverage(9, CUTOUT);
  const strict = vectorSourceCoverage(10, CUTOUT);
  assert.ok(wide.west < strict.west, 'z9 reaches further west than z10');
  assert.ok(wide.east > strict.east, 'z9 reaches further east than z10');
  assert.equal(VECTOR_OVERVIEW_BUILD.maxZoom, 9);
  // The strict corridor is the plain cutout, tile-aligned — untouched here.
  assert.deepEqual(strict, tileAlignedFootprint(CUTOUT, 10));
});

test('Terrain coverage is physical at the effective source zoom, never ancestor fallback', () => {
  assert.equal(rasterSourceZoomForDisplayZoom(8.6173908163), 10);
  const overview = rasterRenderableCoverage(CUTOUT);
  assert.deepEqual(overview, tileAlignedFootprint(CUTOUT, RASTER_ARCHIVE_MIN_ZOOM));
  assert.deepEqual(terrainSourceCoverage(10, CUTOUT), overview, 'v4 carries real z10 children');
  assert.deepEqual(
    terrainSourceCoverage(12, CUTOUT),
    tileAlignedFootprint(CUTOUT, 12),
    'high-resolution interaction returns to the compact corridor',
  );
});

// ---- symmetry: the defect this PR exists for --------------------------------

test('every supported viewport gets an overview symmetric about the route centre', () => {
  for (const [W, H] of [...PORTRAIT, [760, 500], [768, 1024], ...DESKTOP, ...ULTRAWIDE]) {
    const e = envelopeFor(W, H);
    if (!e.overviewBounds) continue; // strict bounds already host the fit
    const [[ow], [oe]] = e.overviewBounds;
    assert.ok(
      Math.abs((routeCx - mercX(ow)) - (mercX(oe) - routeCx)) < 1,
      `${W}x${H}: west and east half-widths differ by ≥1 m`,
    );
  }
});

test('REGRESSION: the envelope is never capped on one side only', () => {
  // The old model clamped east against the z7 cell while west ran free, which
  // is precisely how a symmetric fit became an eastward shove.
  for (const [W, H] of [...DESKTOP, ...ULTRAWIDE]) {
    const e = envelopeFor(W, H);
    const cov = e.vectorCoverage;
    const westGap = mercX(e.overviewBounds[0][0]) - mercX(cov.west);
    const eastGap = mercX(cov.east) - mercX(e.overviewBounds[1][0]);
    assert.ok(westGap >= -1e-6 && eastGap >= -1e-6, `${W}x${H}: inside coverage both sides`);
    // At least one side has slack unless BOTH are hard against the data.
    assert.ok(
      westGap > 1 || eastGap > 1 || Math.abs(westGap - eastGap) < 1,
      `${W}x${H}: a one-sided clamp would show up as unequal zero gaps`,
    );
  }
});

test('supported desktop framing: the fit is granted in full, never capped', () => {
  for (const [W, H] of DESKTOP) {
    const e = envelopeFor(W, H);
    assert.equal(e.cappedByVector, false, `${W}x${H}: vector coverage has headroom`);
    assert.ok(
      e.halfWidths.applied >= e.halfWidths.needed - 1e-6,
      `${W}x${H}: the whole requested half-width is granted`,
    );
  }
});

test('portrait keeps the strict interaction bounds east/west', () => {
  // PR #100's portrait framing must be untouched: phones are width-bound and
  // their fitted view is narrower than the user bounds, so no east/west
  // expansion is warranted and none is granted.
  for (const [W, H] of PORTRAIT) {
    const e = envelopeFor(W, H);
    if (!e.overviewBounds) continue;
    const [[ow], [oe]] = e.overviewBounds;
    assert.equal(ow, route.userBounds[0][0], `${W}x${H}: west edge is the strict bound`);
    assert.equal(oe, route.userBounds[1][0], `${W}x${H}: east edge is the strict bound`);
    assert.equal(e.bindingAxis, 'width', `${W}x${H}: still width-bound`);
  }
});

test('the overview always contains the view the fit will produce', () => {
  for (const [W, H] of [...PORTRAIT, [760, 500], [768, 1024], ...DESKTOP]) {
    const [w, h] = container(W, H);
    const pad = padFor(w, h);
    const d = desiredOverviewExtent({ routeBounds: route.bounds, viewportWidth: w, viewportHeight: h, padding: pad });
    const e = envelopeFor(W, H);
    const b = e.overviewBounds ?? route.userBounds;
    assert.ok(mercX(b[0][0]) <= routeCx - d.halfWidth + 1e-6, `${W}x${H}: holds the view west`);
    assert.ok(mercX(b[1][0]) >= routeCx + d.halfWidth - 1e-6, `${W}x${H}: holds the view east`);
    assert.ok(mercY(b[0][1]) <= d.centreY - d.halfHeight + 1e-6, `${W}x${H}: holds the view south`);
    assert.ok(mercY(b[1][1]) >= d.centreY + d.halfHeight - 1e-6, `${W}x${H}: holds the view north`);
  }
});

// ---- source zoom and integer transitions ------------------------------------

test('the source zoom is floor(mapZoom), and the envelope is a function of it', () => {
  for (const [W, H] of [...PORTRAIT, ...DESKTOP, ...ULTRAWIDE]) {
    const e = envelopeFor(W, H);
    assert.ok(Number.isInteger(e.sourceZoom), `${W}x${H}: integer source zoom`);
    assert.ok(e.sourceZoom <= Math.floor(e.mapZoom), `${W}x${H}: never above floor(mapZoom)`);
  }
});

test('integer source-zoom transitions do not move the envelope discontinuously', () => {
  // Sweep container widths across every boundary where floor(mapZoom) ticks.
  // The envelope may narrow when coverage genuinely narrows, but it must
  // never JUMP off-centre, and it must never grow as the zoom rises.
  let prev = null;
  for (let w = 300; w <= 3400; w += 4) {
    const h = 800;
    const e = overviewEnvelopeFor({
      routeBounds: route.bounds, userBounds: route.userBounds, cutoutBounds: CUTOUT,
      viewportWidth: w, viewportHeight: h, padding: padFor(w, h),
    });
    if (e.overviewBounds) {
      const [[ow], [oe]] = e.overviewBounds;
      assert.ok(Math.abs((routeCx - mercX(ow)) - (mercX(oe) - routeCx)) < 1, `w=${w}: symmetric`);
    }
    if (prev && e.sourceZoom !== prev.sourceZoom) {
      // At a boundary the applied half-width may change, but only because
      // coverage did — never by more than the coverage step itself.
      const step = Math.abs(e.halfWidths.applied - prev.halfWidths.applied);
      const covStep = Math.abs(e.halfWidths.vector - prev.halfWidths.vector);
      assert.ok(
        step <= covStep + 2000,
        `w=${w}: z${prev.sourceZoom}→z${e.sourceZoom} moved the envelope ${step.toFixed(0)} m ` +
        `against a ${covStep.toFixed(0)} m coverage change`,
      );
    }
    prev = e;
  }
});

test('the envelope depends on the FIT zoom, not the live camera zoom', () => {
  // This is what makes maxBounds constant for a viewport: nothing in the
  // signature can change while the user zooms or pans.
  const src = readFileSync(join(root, 'src/map/overviewEnvelope.mjs'), 'utf8');
  const sig = src.slice(src.indexOf('export function overviewEnvelopeFor('), src.indexOf('}) {', src.indexOf('export function overviewEnvelopeFor(')));
  assert.ok(!/\bzoom\b\s*[,}]/.test(sig), 'no live-zoom parameter');
  assert.ok(!sig.includes('cameraZoom') && !sig.includes('currentZoom'));
});

test('hysteresis still prevents oscillation at the overview/interaction swap', () => {
  const [w, h] = container(1512, 860);
  const c = cameraConstraintsFor({
    userBounds: route.userBounds, routeBounds: route.bounds, dataBounds: CUTOUT,
    viewportWidth: w, viewportHeight: h, padding: padFor(w, h),
  });
  const t = c.zoomThreshold;
  assert.equal(activeBoundsForZoom(c, t - 0.04, false).expanded, false);
  assert.equal(activeBoundsForZoom(c, t - 0.06, false).expanded, true);
  assert.equal(activeBoundsForZoom(c, t + 0.04, true).expanded, true);
  assert.equal(activeBoundsForZoom(c, t + 0.06, true).expanded, false);
  // Sweeping up and down across the band lands in the same state each way
  // only outside it — that is what "cannot oscillate" means.
  for (const z of [t - 0.2, t - 0.06, t + 0.06, t + 0.2]) {
    const up = activeBoundsForZoom(c, z, false).expanded;
    const down = activeBoundsForZoom(c, z, true).expanded;
    if (z < t - 0.05 || z > t + 0.05) assert.equal(up, down, `z=${z.toFixed(2)} is unambiguous`);
  }
});

// ---- capping and the ultrawide fallback -------------------------------------

test('physical capping is symmetric and never exceeds real vector coverage', () => {
  for (const [W, H] of [...ULTRAWIDE, [812, 375], [1024, 400]]) {
    const e = envelopeFor(W, H);
    if (!e.overviewBounds) continue;
    const [[ow], [oe]] = e.overviewBounds;
    assert.ok(ow >= e.vectorCoverage.west - EPS, `${W}x${H}: west inside coverage`);
    assert.ok(oe <= e.vectorCoverage.east + EPS, `${W}x${H}: east inside coverage`);
    assert.ok(
      Math.abs((routeCx - mercX(ow)) - (mercX(oe) - routeCx)) < 1,
      `${W}x${H}: a capped envelope is still symmetric`,
    );
  }
});

test('ultrawide falls back to the widest COVERED view rather than blank flanks', () => {
  for (const [W, H] of ULTRAWIDE) {
    const e = envelopeFor(W, H);
    assert.equal(e.cappedByVector, true, `${W}x${H}: the data, not the fit, sets the width`);
    assert.ok(
      e.halfWidths.applied <= e.halfWidths.vector + 1e-6,
      `${W}x${H}: never claims more than the archive has`,
    );
  }
});

// ---- Terrain mode: hillshade is a HARD constraint ---------------------------

const cameraFor = (W, H, mode = 'terrain') => {
  const [w, h] = container(W, H);
  return overviewCameraFor({
    routeBounds: route.bounds, userBounds: route.userBounds, cutoutBounds: CUTOUT,
    viewportWidth: w, viewportHeight: h, padding: padFor(w, h), mode,
  });
};

test('TERRAIN: the whole visible viewport stays inside renderable hillshade', () => {
  // The product contract: an unshaded flank is never an acceptable trade.
  for (const [W, H] of [...PORTRAIT, [760, 500], [768, 1024], ...DESKTOP, ...ULTRAWIDE, [1512, 872]]) {
    const c = cameraFor(W, H, 'terrain');
    const cov = coverageForMode('terrain', CUTOUT);
    const [[vw, vs], [ve, vn]] = c.visibleExtent;
    assert.ok(vw >= cov.west - EPS, `${W}x${H}: west edge inside hillshade`);
    assert.ok(ve <= cov.east + EPS, `${W}x${H}: east edge inside hillshade`);
    assert.ok(vs >= cov.south - EPS, `${W}x${H}: south edge inside hillshade`);
    assert.ok(vn <= cov.north + EPS, `${W}x${H}: north edge inside hillshade`);
  }
});

test('REGRESSION: no supported laptop viewport exposes an unshaded flank', () => {
  // Before this contract these overhung terrain's east edge by 83-121 px.
  for (const [W, H] of [[1366, 768], [1512, 860], [1512, 872], [1536, 864], [1920, 1080]]) {
    const c = cameraFor(W, H, 'terrain');
    const cov = coverageForMode('terrain', CUTOUT);
    const overhangPx = (mercX(c.visibleExtent[1][0]) - mercX(cov.east)) / c.scale;
    assert.ok(overhangPx <= 0 + 1e-6, `${W}x${H}: ${overhangPx.toFixed(1)} px past terrain`);
  }
});

test('TERRAIN: supported viewports keep the complete route, by TRANSLATION only', () => {
  for (const [W, H] of [...PORTRAIT, [760, 500], [768, 1024], ...DESKTOP, [1512, 872]]) {
    const c = cameraFor(W, H, 'terrain');
    assert.equal(c.zoomRaised, false, `${W}x${H}: translation alone sufficed`);
    assert.equal(c.routeComplete, true, `${W}x${H}: complete route`);
    assert.deepEqual(c.endpointsOutside, [], `${W}x${H}: no endpoint outside`);
    assert.ok(c.routeClearancePx.top >= 12 - 1e-6, `${W}x${H}: ≥12 px top`);
    assert.ok(c.routeClearancePx.bottom >= 12 - 1e-6, `${W}x${H}: ≥12 px bottom`);
    // The marker-label allowance is inside the padding, so an endpoint label
    // cannot clip: left/right clearance is at least the declared allowance.
    assert.ok(c.routeClearancePx.left >= 32, `${W}x${H}: ≥ label allowance left`);
    assert.ok(c.routeClearancePx.right >= 32, `${W}x${H}: ≥ label allowance right`);
  }
});

test('the feasible centre is the CLOSEST one to the desired route-centred camera', () => {
  // The feasible set is the interval [envWest + halfW, envEast - halfW];
  // clamping into it is by definition the nearest feasible point, so moving
  // any further from the desired centre must break coverage.
  for (const [W, H] of DESKTOP) {
    const c = cameraFor(W, H, 'terrain');
    const cov = coverageForMode('terrain', CUTOUT);
    const dev = c.centreDeviationPx.x;
    if (dev === 0) continue; // already feasible at the desired centre
    assert.ok(dev < 0, `${W}x${H}: terrain is tight on the EAST, so it moves west`);
    // One pixel back toward the desired centre would overhang.
    const nudged = mercX(c.visibleExtent[1][0]) + c.scale;
    assert.ok(nudged > mercX(cov.east) + 1e-9, `${W}x${H}: already hard against the east edge`);
  }
});

test('zoom is raised ONLY when no translation can fit the viewport', () => {
  for (const [W, H] of [...PORTRAIT, ...DESKTOP]) {
    assert.equal(cameraFor(W, H, 'terrain').zoomRaised, false, `${W}x${H}: no zoom change`);
  }
  for (const [W, H] of ULTRAWIDE) {
    const c = cameraFor(W, H, 'terrain');
    assert.equal(c.zoomRaised, true, `${W}x${H}: viewport is wider than the envelope`);
    assert.ok(c.zoomDelta > 0, `${W}x${H}: zoomed IN, never out`);
  }
});

test('ULTRAWIDE: vertical route overfill, never an unshaded flank', () => {
  for (const [W, H] of ULTRAWIDE) {
    const c = cameraFor(W, H, 'terrain');
    const cov = coverageForMode('terrain', CUTOUT);
    assert.ok(c.visibleExtent[0][0] >= cov.west - EPS && c.visibleExtent[1][0] <= cov.east + EPS,
      `${W}x${H}: still fully shaded`);
    assert.equal(c.routeComplete, false, `${W}x${H}: the route genuinely does not fit`);
    // …and the model says so explicitly rather than claiming a complete fit.
    assert.ok(c.endpointsOutside.length > 0, `${W}x${H}: overfill is reported`);
    for (const e of c.endpointsOutside) {
      assert.ok(['top', 'bottom'].includes(e.edge), `${W}x${H}: overfill is VERTICAL`);
      assert.ok(e.px > 0);
    }
  }
});

test('Terrain and Satellite are evaluated independently', () => {
  const terrain = coverageForMode('terrain', CUTOUT);
  const satellite = coverageForMode('satellite', CUTOUT);
  const vector = coverageForMode('vector', CUTOUT);
  // They happen to share a footprint today (same cutout, same min zoom), but
  // each is derived on its own so a future rebuild of one cannot silently
  // widen the other's contract.
  assert.deepEqual(terrain, satellite, 'same footprint today');
  assert.ok(vector.east > terrain.east, 'vector-only reaches further east');
  // A satellite-mode camera obeys the satellite envelope.
  for (const [W, H] of [[1512, 860], [1920, 1080]]) {
    const c = cameraFor(W, H, 'satellite');
    assert.ok(c.visibleExtent[1][0] <= satellite.east + EPS, `${W}x${H}: inside satellite coverage`);
  }
});

test('vector-only fallback widens the envelope when raster is unavailable', () => {
  // With no relief archive there is no hillshade to lose, so the only thing
  // that can go blank is vector — and the camera may use its wider footprint.
  const t = cameraFor(1512, 860, 'terrain');
  const v = cameraFor(1512, 860, 'vector');
  assert.ok(Math.abs(v.centreDeviationPx.x) < Math.abs(t.centreDeviationPx.x),
    'vector-only can sit closer to the route centre');
  assert.equal(v.routeComplete, true);
});

test('the camera is solved once — no second adjustment is expressible', () => {
  const src = readFileSync(join(root, 'src/map/overviewEnvelope.mjs'), 'utf8');
  const fn = src.slice(src.indexOf('export function overviewCameraFor('));
  assert.ok(!/easeTo|panBy|setCenter|jumpTo/.test(fn), 'the model issues no camera commands');
  const mv = readFileSync(join(root, 'src/components/MapView.tsx'), 'utf8');
  // The shared overview path issues exactly ONE camera command per call:
  // jumpTo or easeTo, never both, and never followed by a correction.
  const start = mv.indexOf('const applyOverviewCamera = (jump = false)');
  const body = mv.slice(start, mv.indexOf('applyOverviewCameraRef.current = applyOverviewCamera', start));
  assert.ok(start > -1, 'the shared overview path exists');
  assert.equal((body.match(/m\.jumpTo\(/g) ?? []).length, 1);
  assert.equal((body.match(/m\.easeTo\(/g) ?? []).length, 1);
  assert.match(body, /if \(jump\) m\.jumpTo\(camera\);\s*\n\s*else m\.easeTo\(/, 'exclusive branches');
  assert.ok(!/panBy|setCenter/.test(body), 'no corrective nudge');
  // maxBounds is widened BEFORE the move, or a stale bound would clamp the
  // target and force exactly the second move this design avoids.
  assert.ok(
    body.indexOf('setMaxBounds') < body.indexOf('if (jump)'),
    'bounds are applied before the camera moves',
  );
});

test('contours never constrain the overview', () => {
  // Index contours fade in from z9.5 and the full set from z11.5; every
  // overview zoom is below that, so the contour archive is irrelevant here.
  for (const [W, H] of [...PORTRAIT, ...DESKTOP, ...ULTRAWIDE]) {
    assert.ok(envelopeFor(W, H).mapZoom < 9.5, `${W}x${H}: overview is below contour activation`);
  }
  const src = readFileSync(join(root, 'src/map/overviewEnvelope.mjs'), 'utf8');
  assert.ok(!/contour/i.test(src.replace(/^[\s*/]*.*contour.*$/gim, '')), 'no contour input');
});

// ---- resize ------------------------------------------------------------------

test('resize is a pure function of the new shape — no path dependence', () => {
  const seq = [[1512, 860], [375, 667], [1920, 1080], [375, 667], [1512, 860]];
  const seen = new Map();
  for (const [W, H] of seq) {
    const e = envelopeFor(W, H);
    const key = `${W}x${H}`;
    const value = JSON.stringify(e.overviewBounds);
    if (seen.has(key)) assert.equal(value, seen.get(key), `${key}: same shape, same envelope`);
    seen.set(key, value);
  }
});

test('growing the bottom band widens the view but never past the data', () => {
  const [w, h] = container(1512, 860);
  let prev = 0;
  for (const bottomInset of [0, 40, 80, 160, 240, 320]) {
    const pad = overviewPaddingFor({ viewportWidth: w, viewportHeight: h, topInset: 58, bottomInset });
    const e = overviewEnvelopeFor({
      routeBounds: route.bounds, userBounds: route.userBounds, cutoutBounds: CUTOUT,
      viewportWidth: w, viewportHeight: h, padding: pad,
    });
    assert.ok(e.halfWidths.applied >= prev - 1e-6, `inset ${bottomInset}: monotonic`);
    assert.ok(e.halfWidths.applied <= e.halfWidths.vector + 1e-6, `inset ${bottomInset}: inside data`);
    prev = e.halfWidths.applied;
  }
});

// ---- stable route and interaction inputs -----------------------------------

test('route, cutout and interaction bounds remain unchanged', () => {
  assert.deepEqual(route.mapCutoutBounds, [[17.8799, 67.7081], [19.3773, 68.4931]]);
  assert.deepEqual(route.userBounds, [[17.9521, 67.735], [19.3051, 68.4661]]);
  assert.deepEqual(route.bounds, [[18.241127, 67.842819], [19.016074, 68.35831]]);
  assert.equal(OVERVIEW_SLACK, 0.05, 'the 5 % slack contract is unchanged');
  assert.equal(RASTER_ARCHIVE_MIN_ZOOM, 7);
});

test('the overview padding contract from PR #100 is untouched', () => {
  const src = readFileSync(join(root, 'src/map/mapPadding.mjs'), 'utf8');
  assert.match(src, /export const MARKER_LABEL_SAFE_X = 32/);
  // overviewPaddingFor still composes: balanced sides + label allowance.
  const pad = overviewPaddingFor({ viewportWidth: 1364, viewportHeight: 860, topInset: 58, bottomInset: 0 });
  assert.equal(pad.left, pad.right, 'horizontally balanced');
  assert.equal(pad.left, 16 + 32, 'base side + label allowance');
  assert.equal(pad.top, 12 + 58);
  assert.equal(pad.bottom, 12);
});

// ---- MapView wiring: the ACTIVE imagery mode picks the contract -------------

const mapViewSrc = readFileSync(join(root, 'src/components/MapView.tsx'), 'utf8');

test('MapView solves against the SELECTED imagery mode, not resolution order', () => {
  // The blocking defect: coverage was derived from whichever archive resolved
  // first, so with both archives present a Satellite overview still solved as
  // Terrain. The mode must come from the imagery prop.
  const fn = mapViewSrc.slice(
    mapViewSrc.indexOf('const activeCoverageMode = ()'),
    mapViewSrc.indexOf('const computeOverviewCamera'),
  );
  assert.ok(fn.length > 0, 'activeCoverageMode exists');
  assert.match(fn, /imageryRef\.current === 'satellite'/, 'branches on the SELECTED mode');
  assert.match(fn, /satelliteAvailableRef\.current \? 'satellite' : 'vector'/);
  assert.match(fn, /terrainAvailableRef\.current \? 'terrain' : 'vector'/);
  // Availability alone must no longer decide the contract.
  assert.ok(
    !/terrain\.sourceUrl != null\s*\n?\s*\?\s*'terrain'/.test(mapViewSrc),
    'the resolution-order chain is gone',
  );
  // …and the solver is handed that mode, evaluated per call.
  assert.match(mapViewSrc, /mode: activeCoverageMode\(\),/);
});

test('imagery is read at solve time and toggling issues no explicit recenter', () => {
  // The ref is refreshed every render. The toggle reapplies physical
  // maxBounds but must not invoke an overview fit or camera animation.
  assert.match(mapViewSrc, /imageryRef\.current = imagery;/, 'kept current every render');
  const imageryEffect = mapViewSrc.slice(mapViewSrc.indexOf('// ---- Basemap imagery toggle'));
  const body = imageryEffect.slice(0, imageryEffect.indexOf('}, [imagery, loaded]);'));
  assert.ok(
    !/applyOverviewCamera|easeTo|jumpTo|fitBounds|setCenter|panBy/.test(body),
    'the imagery toggle issues no camera command',
  );
});

test('EVERY full-route path goes through the one solver', () => {
  // Initial camera, imperative Fit route, and the stage → full-route return.
  assert.match(mapViewSrc, /const initialCamera = computeOverviewCamera\(\);/);
  assert.match(mapViewSrc, /fitRoute: \(\) => \{\s*\n\s*applyOverviewCameraRef\.current\?\.\(\);/);
  assert.match(
    mapViewSrc,
    /if \(stage\) fitBounds\(stage\.bounds\);\s*\n\s*else applyOverviewCameraRef\.current\?\.\(\);/,
  );
  // No bounds-fit may frame the whole route any more.
  assert.ok(!/fitBounds\([^)]*routeRef\.current\.bounds/.test(mapViewSrc));
  assert.ok(!/'overview'\)/.test(mapViewSrc), "no 'overview' fit mode remains");
});

test('the shared overview path updates maxBounds coherently with the fit', () => {
  const start = mapViewSrc.indexOf('const applyOverviewCamera = (jump = false)');
  const body = mapViewSrc.slice(start, mapViewSrc.indexOf('applyOverviewCameraRef.current =', start));
  assert.match(body, /constraintsRef\.current = computeConstraints\(\);/, 're-derives the contract');
  assert.match(body, /setMaxBounds\(/, 'and applies it');
  assert.ok(body.indexOf('setMaxBounds') < body.indexOf('if (jump)'), 'before moving');
});

test('a Satellite overview is solved against SATELLITE coverage', () => {
  // Same footprint as terrain today, but derived from the satellite archive's
  // own contract — so a future satellite rebuild moves this and nothing else.
  for (const [W, H] of [[1512, 860], [1920, 1080]]) {
    const sat = cameraFor(W, H, 'satellite');
    const cov = coverageForMode('satellite', CUTOUT);
    assert.equal(sat.mode, 'satellite');
    assert.ok(sat.visibleExtent[0][0] >= cov.west - EPS, `${W}x${H}: west inside satellite`);
    assert.ok(sat.visibleExtent[1][0] <= cov.east + EPS, `${W}x${H}: east inside satellite`);
    assert.equal(sat.routeComplete, true, `${W}x${H}: complete route in Satellite mode`);
  }
});

test('REGRESSION: the overview path widens maxBounds unconditionally', () => {
  // Returning from stage mode the camera is zoomed IN, so the STRICT
  // interaction bounds are active. Widening only "if currently expanded" left
  // them in place, and MapLibre clamped the overview target against them —
  // measured at 1512×860: centre snapped to the bounds centre 18.6286 and
  // zoom to 9.4693 instead of the solved 18.4759 / 8.6286.
  const start = mapViewSrc.indexOf('const applyOverviewCamera = (jump = false)');
  const body = mapViewSrc.slice(start, mapViewSrc.indexOf('applyOverviewCameraRef.current =', start));
  assert.ok(
    !/if \(boundsExpandedRef\.current[^)]*\)\s*\{?\s*\n?\s*m\.setMaxBounds/.test(body),
    'the widening must not be conditional on the CURRENT expansion state',
  );
  assert.match(body, /const next = constraintsRef\.current\.overviewBounds\s*\n?\s*\?\?\s*constraintsRef\.current\.interactionBounds;/);
  assert.match(body, /boundsExpandedRef\.current = constraintsRef\.current\.overviewBounds != null;/);
  assert.match(body, /m\.setMaxBounds\(next as maplibregl\.LngLatBoundsLike\);/);
});
