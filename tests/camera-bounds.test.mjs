/**
 * Camera-constraint invariants (src/map/cameraBounds.mjs) for the supported
 * viewport classes. Pins the bounded-map behaviour:
 *  - portrait-ish viewports never need the overview expansion (the route
 *    overview fits inside the strict user bounds);
 *  - square desktop viewports (the 1:1 map card) and wide viewports
 *    (fullscreen on a landscape monitor) get an east/west expansion that
 *    is active only below the viewport's zoom threshold;
 *  - the square card's exact fit is never envelope-capped — the physical
 *    z7 terrain footprint has comfortable headroom at every supported size;
 *  - the hysteresis in activeBoundsForZoom cannot oscillate;
 *  - the expansion never widens further than the fitted overview needs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  mercX,
  mercY,
  vectorSourceCoverage,
  cameraConstraintsFor,
  activeBoundsForZoom,
  overviewEnvelope,
  MIN_ZOOM_BACKSTOP,
} from '../src/map/cameraBounds.mjs';

/** Degrees of float slack: a capped edge sits exactly on a coverage edge. */
const EPS = 1e-9;

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

const PADDING = { top: 40, bottom: 40, left: 32, right: 32 };
const constraintsFor = (w, h) =>
  cameraConstraintsFor({
    userBounds: route.userBounds,
    routeBounds: route.bounds,
    dataBounds: route.mapCutoutBounds,
    viewportWidth: w,
    viewportHeight: h,
    padding: PADDING,
  });

test('portrait viewports fit the route inside the strict user bounds', () => {
  // Mobile portrait at the shipped height rule (clamp(460px,
  // calc(108vw + 80px), min(62vh, 560px)) in global.css — h ≥ 1.073·w + 80
  // is the exact no-expansion fit relation).
  for (const [w, h] of [[360, 469], [375, 485], [412, 525]]) {
    const c = constraintsFor(w, h);
    assert.equal(
      c.overviewBounds,
      null,
      `${w}x${h}: route overview must fit without expansion`,
    );
    assert.deepEqual(c.interactionBounds, route.userBounds);
  }
});

test('square desktop viewports (1:1 map card) get an uncapped exact-fit expansion', () => {
  // The desktop/tablet-landscape map card is a square whose edge is
  // max(300px, app-height − reserved-chrome), width-capped by the grid
  // column at min(62%, 100% − 314px) of the ≤ 1400px screen — i.e. edges
  // from the 300px floor up to ~838px (global.css .map-layout ≥ 900×700).
  // Fitting the full route's padded height into a square needs an
  // east/west view of ~179–220 km — wider than the ~150.6 km user bounds,
  // so every supported square size uses the overview expansion.
  // Recalculated 2026-07-10 for the square layout: the exact fit must sit
  // INSIDE the ~309 km physical z7 envelope with headroom (never capped),
  // so the full-route composition is always the true fit, never an
  // over-filled compromise. 300 is the tightest case — its fit leaves
  // only a few km of slack to the envelope's east edge, which is exactly
  // why the CSS floor must not drop further without re-running this
  // maths.
  const [[uw, us], [ue, un]] = route.userBounds;
  const routeCx = (mercX(route.bounds[0][0]) + mercX(route.bounds[1][0])) / 2;
  for (const size of [300, 340, 450, 600, 838]) {
    const c = constraintsFor(size, size);
    assert.ok(c.overviewBounds, `${size}²: square fit needs the expansion`);
    const [[ow, os], [oe, on]] = c.overviewBounds;
    assert.ok(ow < uw && oe > ue, `${size}²: widened east/west`);
    assert.equal(os, us, 'south edge unchanged');
    assert.equal(on, un, 'north edge unchanged');
    // SYMMETRIC about the route centre — the composition contract. The old
    // model clamped the east edge alone against a tile cell that is not
    // centred on the route, which is what pushed wide views east.
    assert.ok(
      Math.abs((routeCx - mercX(ow)) - (mercX(oe) - routeCx)) < 1,
      `${size}²: symmetric about the route centre`,
    );
    // The exact fit, not a cap: vector coverage still has headroom here.
    assert.equal(c.envelope.cappedByVector, false, `${size}²: exact fit, uncapped`);
    assert.ok(
      c.envelope.halfWidths.applied <= c.envelope.halfWidths.vector + 1e-6,
      `${size}²: inside physical vector coverage`,
    );
    assert.ok(
      c.zoomThreshold > MIN_ZOOM_BACKSTOP && c.zoomThreshold < 12,
      `${size}²: sane zoom threshold`,
    );
  }
});

test('wide viewports get a SYMMETRIC east/west expansion, north/south unchanged', () => {
  // Tablet landscape and a laptop — both need a view wider than the user
  // bounds, and both have vector headroom, so the expansion is sized exactly
  // to the fit and centred on the route.
  for (const [w, h] of [[1024, 768], [1512, 945]]) {
    const c = constraintsFor(w, h);
    assert.ok(c.overviewBounds, `${w}x${h}: needs the overview expansion`);
    const [[ow, os], [oe, on]] = c.overviewBounds;
    const [[uw, us], [ue, un]] = route.userBounds;
    assert.ok(ow < uw && oe > ue, `${w}x${h}: widened east/west`);
    assert.equal(os, us, 'south edge unchanged');
    assert.equal(on, un, 'north edge unchanged');

    // Sized to the fit (with the 5 % slack) and symmetric about the route.
    const routeCx = (mercX(route.bounds[0][0]) + mercX(route.bounds[1][0])) / 2;
    const padV = PADDING.top + PADDING.bottom;
    const routeMercH = mercY(route.bounds[1][1]) - mercY(route.bounds[0][1]);
    const wantHalf = ((routeMercH / (h - padV)) * w * 1.05) / 2;
    assert.ok(
      Math.abs((routeCx - mercX(ow)) - wantHalf) < 1,
      `${w}x${h}: west edge is the fit's own half-width`,
    );
    assert.ok(
      Math.abs((mercX(oe) - routeCx) - wantHalf) < 1,
      `${w}x${h}: east edge is the same half-width`,
    );

    // Inside real vector coverage at the zoom this overview renders at.
    const cov = vectorSourceCoverage(c.envelope.sourceZoom, route.mapCutoutBounds);
    // EPS: a capped edge lands exactly on a coverage edge, and the Mercator
    // round trip moves it by ~1e-14 degrees.
    assert.ok(ow >= cov.west - EPS && oe <= cov.east + EPS, `${w}x${h}: inside vector coverage`);
    assert.ok(c.zoomThreshold > MIN_ZOOM_BACKSTOP && c.zoomThreshold < 12);
  }

  // Phone landscape (product-blocked by the RotateGuard; reachable only in
  // exotic embeds): its exact fit out-spans the data, so it is capped —
  // symmetrically, so the route stays centred rather than sliding east.
  const pl = constraintsFor(812, 375);
  assert.ok(pl.overviewBounds, 'phone landscape still expands');
  const cov = vectorSourceCoverage(pl.envelope.sourceZoom, route.mapCutoutBounds);
  assert.ok(
    pl.overviewBounds[0][0] >= cov.west - EPS && pl.overviewBounds[1][0] <= cov.east + EPS,
    'phone landscape expansion capped inside vector coverage',
  );
});

test('activeBoundsForZoom applies hysteresis and cannot oscillate', () => {
  const c = constraintsFor(1512, 945);
  const t = c.zoomThreshold;
  // From tight bounds: still tight just above the enter edge…
  assert.equal(activeBoundsForZoom(c, t - 0.04, false).expanded, false);
  // …expanded once clearly below it.
  assert.equal(activeBoundsForZoom(c, t - 0.06, true).expanded, true);
  assert.equal(activeBoundsForZoom(c, t - 0.06, false).expanded, true);
  // From expanded: stays expanded inside the hysteresis band…
  assert.equal(activeBoundsForZoom(c, t + 0.04, true).expanded, true);
  // …tightens only clearly above it.
  assert.equal(activeBoundsForZoom(c, t + 0.06, true).expanded, false);
  // Portrait viewports never expand regardless of zoom.
  const p = constraintsFor(375, 540);
  assert.equal(activeBoundsForZoom(p, 5, true).expanded, false);
});

test('extreme ultrawide viewports cap the expansion at real vector coverage', () => {
  // 21:9 fullscreen wants a wider fit than the archive carries. The cap
  // trades a slightly over-filled route height for never revealing blank
  // map — and stays symmetric, so the route does not slide sideways.
  const c = constraintsFor(3440, 1440);
  assert.ok(c.overviewBounds, 'still expands');
  const [[ow], [oe]] = c.overviewBounds;
  const cov = vectorSourceCoverage(c.envelope.sourceZoom, route.mapCutoutBounds);
  assert.ok(ow >= cov.west - EPS && oe <= cov.east + EPS, 'capped inside vector coverage');
  assert.equal(c.envelope.cappedByVector, true, 'the cap actually bound');
  assert.ok(
    c.envelope.halfWidths.applied < c.envelope.halfWidths.needed,
    'the cap actually reduced the requested expansion',
  );
  const routeCx = (mercX(route.bounds[0][0]) + mercX(route.bounds[1][0])) / 2;
  assert.ok(
    Math.abs((routeCx - mercX(ow)) - (mercX(oe) - routeCx)) < 1,
    'a capped envelope is still symmetric about the route',
  );
});
