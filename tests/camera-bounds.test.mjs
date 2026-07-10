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
  cameraConstraintsFor,
  activeBoundsForZoom,
  overviewEnvelope,
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
  // The desktop/tablet-landscape map card is a square whose edge follows
  // clamp(300px, app-height − reserved-chrome, 600px), width-capped by
  // the grid column (global.css .map-layout ≥ 900×660). Fitting the full
  // route's padded height into a square needs an east/west view of
  // ~186–220 km — wider than the ~150.6 km user bounds, so every
  // supported square size uses the overview expansion. Recalculated
  // 2026-07-10 for the square layout: the exact fit must sit INSIDE the
  // ~309 km physical z7 envelope with headroom (never capped), so the
  // full-route composition is always the true fit, never an over-filled
  // compromise. 300 is the tightest case — its fit leaves only a few km
  // of slack to the envelope's east edge, which is exactly why the CSS
  // floor must not drop further without re-running this maths.
  const [[ew], [ee]] = overviewEnvelope(route.mapCutoutBounds);
  const [[uw, us], [ue, un]] = route.userBounds;
  for (const size of [300, 340, 450, 600]) {
    const c = constraintsFor(size, size);
    assert.ok(c.overviewBounds, `${size}²: square fit needs the expansion`);
    const [[ow, os], [oe, on]] = c.overviewBounds;
    assert.ok(ow < uw && oe > ue, `${size}²: widened east/west`);
    assert.equal(os, us, 'south edge unchanged');
    assert.equal(on, un, 'north edge unchanged');
    // Exact fit, not the envelope cap: the same constraints WITHOUT the
    // physical envelope must produce identical bounds.
    const uncapped = cameraConstraintsFor({
      userBounds: route.userBounds,
      routeBounds: route.bounds,
      viewportWidth: size,
      viewportHeight: size,
      padding: PADDING,
    });
    assert.deepEqual(
      c.overviewBounds,
      uncapped.overviewBounds,
      `${size}²: exact fit uncapped — envelope headroom holds`,
    );
    // …and strictly inside the envelope, with real margin on both edges.
    assert.ok(ow > ew && oe < ee, `${size}²: strictly inside the physical envelope`);
    // Threshold is a real overview zoom above the backstop.
    assert.ok(
      c.zoomThreshold > MIN_ZOOM_BACKSTOP && c.zoomThreshold < 12,
      `${size}²: sane zoom threshold`,
    );
  }
});

test('wide viewports get an east/west overview expansion, north/south unchanged', () => {
  // Tablet landscape fullscreen and desktop fullscreen — both fit inside
  // the physical envelope, so their expansion is sized exactly to the fit.
  for (const [w, h] of [[1024, 768], [1512, 945]]) {
    const c = constraintsFor(w, h);
    assert.ok(c.overviewBounds, `${w}x${h}: needs the overview expansion`);
    const [[ow, os], [oe, on]] = c.overviewBounds;
    const [[uw, us], [ue, un]] = route.userBounds;
    assert.ok(ow < uw && oe > ue, `${w}x${h}: widened east/west`);
    assert.equal(os, us, 'south edge unchanged');
    assert.equal(on, un, 'north edge unchanged');
    // Sized to the fit (with the 5% slack), each edge independently clamped
    // to the physical envelope — the z7 grid is asymmetric around the
    // route, so the east edge clamps first.
    const padV = PADDING.top + PADDING.bottom;
    const routeMercH =
      mercY(route.bounds[1][1]) - mercY(route.bounds[0][1]);
    const half = ((routeMercH / (h - padV)) * w * 1.05 - (mercX(ue) - mercX(uw))) / 2;
    const [[ew2], [ee2]] = overviewEnvelope(route.mapCutoutBounds);
    const expWest = Math.max(mercX(uw) - half, mercX(ew2));
    const expEast = Math.min(mercX(ue) + half, mercX(ee2));
    assert.ok(Math.abs(mercX(ow) - expWest) < 1, `${w}x${h}: west edge as constructed`);
    assert.ok(Math.abs(mercX(oe) - expEast) < 1, `${w}x${h}: east edge as constructed`);
    // Level 2 must stay inside level 3: overview bounds within the physical
    // overview envelope (real z7 terrain footprint − margin).
    assert.ok(ow >= ew2 && oe <= ee2, `${w}x${h}: overview inside physical envelope`);
    // Threshold is a real overview zoom (below it the viewport spans the
    // full user-bounds width) and sits above the backstop.
    assert.ok(c.zoomThreshold > MIN_ZOOM_BACKSTOP && c.zoomThreshold < 12);
  }
  // Phone landscape (product-blocked by the RotateGuard; reachable only in
  // exotic embeds): its exact fit would out-span the envelope, so it gets
  // the capped safe expansion instead of the exact fit.
  const pl = constraintsFor(812, 375);
  const [[ew], [ee]] = overviewEnvelope(route.mapCutoutBounds);
  assert.ok(pl.overviewBounds, 'phone landscape still expands');
  assert.ok(
    pl.overviewBounds[0][0] >= ew && pl.overviewBounds[1][0] <= ee,
    'phone landscape expansion capped inside the physical envelope',
  );
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

test('extreme ultrawide viewports cap the expansion at the physical envelope', () => {
  // 21:9 fullscreen would need a wider fit than real z7 terrain provides;
  // the cap trades a slightly over-filled route height for never showing
  // unshaded flanks. Regular 16:9/16:10 desktops stay uncapped.
  const c = constraintsFor(3440, 1440);
  assert.ok(c.overviewBounds, 'still expands');
  const [[ow], [oe]] = c.overviewBounds;
  const [[ew], [ee]] = overviewEnvelope(route.mapCutoutBounds);
  assert.ok(ow >= ew && oe <= ee, 'capped inside the physical envelope');
  const uncapped = cameraConstraintsFor({
    userBounds: route.userBounds,
    routeBounds: route.bounds,
    viewportWidth: 3440,
    viewportHeight: 1440,
    padding: PADDING,
  });
  assert.ok(
    mercX(uncapped.overviewBounds[1][0]) - mercX(uncapped.overviewBounds[0][0]) >
      mercX(oe) - mercX(ow),
    'the cap actually reduced the requested expansion',
  );
});
