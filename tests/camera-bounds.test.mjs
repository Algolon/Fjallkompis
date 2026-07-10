/**
 * Camera-constraint invariants (src/map/cameraBounds.mjs) for the supported
 * viewport classes. Pins the bounded-map behaviour:
 *  - portrait-ish viewports never need the overview expansion (the route
 *    overview fits inside the strict user bounds);
 *  - wide viewports (fullscreen on a landscape monitor) get an east/west
 *    expansion that is active only below the viewport's zoom threshold;
 *  - the hysteresis in activeBoundsForZoom cannot oscillate;
 *  - the expansion never widens further than the fitted overview needs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  cameraConstraintsFor,
  activeBoundsForZoom,
  mercX,
  MIN_ZOOM_BACKSTOP,
} from '../src/map/cameraBounds.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

const PADDING = { top: 40, bottom: 40, left: 32, right: 32 };
const constraintsFor = (w, h) =>
  cameraConstraintsFor({
    userBounds: route.userBounds,
    routeBounds: route.bounds,
    viewportWidth: w,
    viewportHeight: h,
    padding: PADDING,
  });

test('portrait and 4:5 viewports fit the route inside the strict user bounds', () => {
  // Mobile portrait at the shipped height rule (clamp(460px,
  // calc(108vw + 80px), min(62vh, 560px)) in global.css — h ≥ 1.073·w + 80
  // is the exact no-expansion fit relation) and the 4:5 desktop/tablet
  // frames.
  for (const [w, h] of [[360, 469], [375, 485], [412, 525], [500, 625], [560, 700]]) {
    const c = constraintsFor(w, h);
    assert.equal(
      c.overviewBounds,
      null,
      `${w}x${h}: route overview must fit without expansion`,
    );
    assert.deepEqual(c.bounds, route.userBounds);
  }
});

test('wide viewports get an east/west overview expansion, north/south unchanged', () => {
  // phone landscape fullscreen, tablet landscape fullscreen, desktop fullscreen
  for (const [w, h] of [[812, 375], [1024, 768], [1512, 945]]) {
    const c = constraintsFor(w, h);
    assert.ok(c.overviewBounds, `${w}x${h}: needs the overview expansion`);
    const [[ow, os], [oe, on]] = c.overviewBounds;
    const [[uw, us], [ue, un]] = route.userBounds;
    assert.ok(ow < uw && oe > ue, `${w}x${h}: widened east/west`);
    assert.equal(os, us, 'south edge unchanged');
    assert.equal(on, un, 'north edge unchanged');
    // Wide enough for the fitted overview, with the 5% slack — no more.
    const padV = PADDING.top + PADDING.bottom;
    const routeMercH =
      mercY(route.bounds[1][1]) - mercY(route.bounds[0][1]);
    const fitW = (routeMercH / (h - padV)) * w * 1.05;
    const overviewW = mercX(oe) - mercX(ow);
    assert.ok(Math.abs(overviewW - fitW) < 1, `${w}x${h}: expansion sized to the fit`);
    // Threshold is a real overview zoom (below it the viewport spans the
    // full user-bounds width) and sits above the backstop.
    assert.ok(c.zoomThreshold > MIN_ZOOM_BACKSTOP && c.zoomThreshold < 12);
  }
});

// mercY is not exported for the fit math above — import it lazily to keep
// the test honest against the same implementation.
import { mercY } from '../src/map/cameraBounds.mjs';

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
