/**
 * Layout-aware camera padding (src/map/mapPadding.mjs) and its effect on the
 * bounded-map camera constraints (src/map/cameraBounds.mjs).
 *
 * The contract:
 *  - padding = a base margin + the depths the cockpit ACTUALLY covers, so a
 *    fit frames geometry into the visible band, not under the status dock;
 *  - it can never eat the viewport (clamped per axis);
 *  - the camera constraints follow it: when a padded full-route overview
 *    needs a view taller than the user bounds — which is exactly what the
 *    dock causes on a small phone — the overview expansion widens
 *    north/south too, capped by the PHYSICAL envelope, and only below the
 *    zoom threshold. Viewports whose padded overview already fits keep
 *    strictly unchanged north/south bounds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BASE_MAP_PADDING,
  MAX_PADDING_FRACTION,
  cameraPaddingFor,
  visibleMapRect,
} from '../src/map/mapPadding.mjs';
import {
  cameraConstraintsFor,
  activeBoundsForZoom,
  overviewEnvelope,
  mercY,
} from '../src/map/cameraBounds.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

// Measured cockpit geometry (docs/pr-evidence/2026-08-map-trail-cockpit):
// the lead column is the 44px scope pill under a 10px inset; the control
// stack is 44px wide plus its 10px inset; the dock band is ~89px on a phone.
const LEAD = 54;
const STACK = 54;
const DOCK = 89;

const paddingFor = (w, h) =>
  cameraPaddingFor({
    viewportWidth: w,
    viewportHeight: h,
    topInset: LEAD,
    rightInset: STACK,
    bottomInset: DOCK,
  });

// ---- The padding rectangle ---------------------------------------------------

test('padding is the base margin plus the covered depths', () => {
  const p = paddingFor(375, 611);
  assert.equal(p.top, BASE_MAP_PADDING.top + LEAD);
  assert.equal(p.bottom, BASE_MAP_PADDING.bottom + DOCK);
  assert.equal(p.right, BASE_MAP_PADDING.right + STACK);
  assert.equal(p.left, BASE_MAP_PADDING.left, 'nothing covers the left edge');
});

test('no inset means the base margin alone (nothing measured yet)', () => {
  assert.deepEqual(cameraPaddingFor({ viewportWidth: 375, viewportHeight: 611 }), {
    ...BASE_MAP_PADDING,
  });
});

test('padding can never consume the viewport', () => {
  // A degenerate short viewport (mid-rotation, tiny embed): the insets are
  // scaled down proportionally rather than collapsing the fit to a point.
  const p = cameraPaddingFor({
    viewportWidth: 320,
    viewportHeight: 200,
    topInset: 200,
    bottomInset: 200,
  });
  assert.ok(p.top + p.bottom <= 200 * MAX_PADDING_FRACTION + 1);
  assert.ok(p.top > 0 && p.bottom > 0, 'still proportional, never zeroed');
  const rect = visibleMapRect({ viewportWidth: 320, viewportHeight: 200, padding: p });
  assert.ok(rect.height > 0 && rect.width > 0, 'a visible band always remains');
});

test('the visible band is what is left after the overlays', () => {
  const p = paddingFor(375, 611);
  const rect = visibleMapRect({ viewportWidth: 375, viewportHeight: 611, padding: p });
  assert.equal(rect.y, p.top);
  assert.equal(rect.height, 611 - p.top - p.bottom);
  assert.equal(rect.width, 375 - p.left - p.right);
});

// ---- Effect on the bounded camera -------------------------------------------

const constraints = (w, h, padding) =>
  cameraConstraintsFor({
    userBounds: route.userBounds,
    routeBounds: route.bounds,
    dataBounds: route.mapCutoutBounds,
    viewportWidth: w,
    viewportHeight: h,
    padding,
  });

test('a cockpit-padded phone overview expands north/south, inside the envelope', () => {
  // 320x568 → 512px of workspace: the dock and pill leave ~330px for a
  // 153.9 km (Mercator) route, so the fitted view is TALLER than the user
  // bounds. Without the expansion MapLibre would clamp the zoom and push the
  // route's ends back under the dock.
  const c = constraints(320, 512, paddingFor(320, 512));
  assert.ok(c.overviewBounds, 'the padded overview needs the expansion');
  const [[, os], [, on]] = c.overviewBounds;
  const [[, us], [, un]] = route.userBounds;
  assert.ok(os < us && on > un, 'widened north AND south');
  // Level 2 stays inside level 3 — real data, never a crop edge.
  const [[, es], [, en]] = overviewEnvelope(route.mapCutoutBounds);
  assert.ok(os >= es - 1e-9 && on <= en + 1e-9, 'capped by the physical envelope');
});

test('the vertical expansion is exactly what the padded fit needs (or the cap)', () => {
  const padding = paddingFor(320, 512);
  const c = constraints(320, 512, padding);
  const routeMercH = mercY(route.bounds[1][1]) - mercY(route.bounds[0][1]);
  const usableH = 512 - padding.top - padding.bottom;
  const need = (512 * (routeMercH / usableH) - (mercY(route.userBounds[1][1]) - mercY(route.userBounds[0][1]))) / 2;
  const [[, es], [, en]] = overviewEnvelope(route.mapCutoutBounds);
  const [[, os], [, on]] = c.overviewBounds;
  const gotSouth = mercY(route.userBounds[0][1]) - mercY(os);
  assert.ok(need > 0, 'this viewport genuinely needs it');
  // Either the exact requirement, or the envelope cap — never more.
  assert.ok(gotSouth <= need + 1, 'never wider than the fit requires');
  assert.ok(
    Math.abs(gotSouth - need) < 1 || Math.abs(mercY(os) - mercY(es)) < 1,
    'exact fit, or clamped precisely at the envelope',
  );
  assert.ok(mercY(on) <= mercY(en) + 1e-6);
});

test('viewports whose padded overview already fits keep the strict bounds', () => {
  // Desktop and tablet have plenty of vertical room for the same cockpit.
  for (const [w, h] of [[1132, 800], [684, 1024], [940, 768]]) {
    const c = constraints(w, h, paddingFor(w, h));
    const [[, us], [, un]] = route.userBounds;
    if (!c.overviewBounds) continue; // width-only case: nothing to check
    const [[, os], [, on]] = c.overviewBounds;
    assert.equal(os, us, `${w}x${h}: south edge unchanged`);
    assert.equal(on, un, `${w}x${h}: north edge unchanged`);
  }
});

test('the expansion still only applies below the zoom threshold', () => {
  const c = constraints(320, 512, paddingFor(320, 512));
  const t = c.zoomThreshold;
  assert.equal(activeBoundsForZoom(c, t + 0.5, true).expanded, false, 'zoomed in → strict');
  assert.equal(activeBoundsForZoom(c, t - 0.5, false).expanded, true, 'zoomed out → expanded');
  assert.deepEqual(
    activeBoundsForZoom(c, t + 0.5, true).bounds,
    route.userBounds,
    'the strict rectangle is always the coverage contract',
  );
});

test('growing the dock never widens the bounds beyond the envelope', () => {
  // Absurd overlay growth (a tracking warning stack plus a three-line dock):
  // the expansion saturates at the physical envelope instead of walking off
  // the data.
  const padding = cameraPaddingFor({
    viewportWidth: 320,
    viewportHeight: 512,
    topInset: 160,
    rightInset: STACK,
    bottomInset: 160,
  });
  const c = constraints(320, 512, padding);
  const [[, es], [, en]] = overviewEnvelope(route.mapCutoutBounds);
  const [[, os], [, on]] = c.overviewBounds;
  assert.ok(os >= es - 1e-9 && on <= en + 1e-9, 'still inside the physical envelope');
});
