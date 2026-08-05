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
  MARKER_LABEL_SAFE_X,
  cameraPaddingFor,
  overviewPaddingFor,
  visibleMapRect,
} from '../src/map/mapPadding.mjs';
import {
  cameraConstraintsFor,
  activeBoundsForZoom,
  overviewEnvelope,
  mercX,
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

// ---- The fit-scale correction (Map Refinement II PR 1) ----------------------
//
// `cameraConstraintsFor` used to derive the overview scale from the padded
// HEIGHT alone, on the reasoning that the route is far taller than wide. That
// is true of landscape but false of phone portrait, where the padded viewport
// is narrow enough that the route's width needs the coarser scale. The scale
// now comes from whichever axis binds, and BOTH expansions follow it.

const ROUTE_MERC_W = mercX(route.bounds[1][0]) - mercX(route.bounds[0][0]);
const ROUTE_MERC_H = mercY(route.bounds[1][1]) - mercY(route.bounds[0][1]);
const USER_MERC_H = mercY(route.userBounds[1][1]) - mercY(route.userBounds[0][1]);
const USER_MERC_W = mercX(route.userBounds[1][0]) - mercX(route.userBounds[0][0]);

/** m/px each axis needs, and which one therefore sets the scale. */
const axisNeeds = (w, h, padding) => {
  const needW = ROUTE_MERC_W / (w - padding.left - padding.right);
  const needH = ROUTE_MERC_H / (h - padding.top - padding.bottom);
  return { needW, needH, scale: Math.max(needW, needH), binds: needW > needH ? 'width' : 'height' };
};

const overviewFor = (w, h) => overviewPaddingFor({ viewportWidth: w, viewportHeight: h, topInset: LEAD });

test('phone portrait is width-bound, and the scale follows the width', () => {
  // The regression this PR exists for. 390x788 with the overview contract:
  // width needs a coarser scale than height, and the OLD height-only formula
  // therefore reported "no vertical expansion needed" for a view that is in
  // fact taller than the user bounds.
  const padding = overviewFor(390, 788);
  const a = axisNeeds(390, 788, padding);
  assert.equal(a.binds, 'width', 'this shape is width-bound');

  const heightOnlyView = 788 * a.needH;
  assert.ok(heightOnlyView < USER_MERC_H, 'the old formula saw no vertical problem…');
  const trueView = 788 * a.scale;
  assert.ok(trueView > USER_MERC_H, '…but the real fitted view exceeds the user bounds');

  const c = constraints(390, 788, padding);
  assert.ok(c.overviewBounds, 'so the expansion must be granted');
  const [[, os], [, on]] = c.overviewBounds;
  assert.ok(os < route.userBounds[0][1] && on > route.userBounds[1][1], 'widened north AND south');
});

test('landscape stays height-bound and keeps strict north/south bounds', () => {
  for (const [w, h] of [[1132, 800], [1218, 768], [1364, 860], [2412, 1080]]) {
    const padding = overviewFor(w, h);
    assert.equal(axisNeeds(w, h, padding).binds, 'height', `${w}x${h} is height-bound`);
    const c = constraints(w, h, padding);
    if (!c.overviewBounds) continue;
    assert.equal(c.overviewBounds[0][1], route.userBounds[0][1], `${w}x${h}: south unchanged`);
    assert.equal(c.overviewBounds[1][1], route.userBounds[1][1], `${w}x${h}: north unchanged`);
  }
});

test('a shape at the route aspect picks the correct limiting axis either side', () => {
  // The route's Mercator aspect is the crossover. Straddle it with two
  // usable rectangles that differ only slightly and check the axis flips.
  const aspect = ROUTE_MERC_W / ROUTE_MERC_H;
  const usableH = 600;
  const base = { top: 0, right: 0, bottom: 0, left: 0 };
  const narrower = Math.floor(usableH * aspect) - 10;
  const wider = Math.ceil(usableH * aspect) + 10;
  assert.equal(axisNeeds(narrower, usableH, base).binds, 'width', 'narrower than the route aspect');
  assert.equal(axisNeeds(wider, usableH, base).binds, 'height', 'wider than the route aspect');
  // And exactly at the aspect the two demands agree to within a pixel's worth.
  const at = axisNeeds(Math.round(usableH * aspect), usableH, base);
  assert.ok(Math.abs(at.needW - at.needH) / at.scale < 0.02, 'the crossover is continuous');
});

test('both expansions are derived from the SAME selected scale', () => {
  // East/west carries a 5% slack factor, north/south is exact — but both
  // start from one m/px. Check the implied scale matches on a width-bound
  // shape, where the two formulas would disagree if either used its own axis.
  const padding = overviewFor(390, 788);
  const { scale } = axisNeeds(390, 788, padding);
  const c = constraints(390, 788, padding);
  const [[ow, os], [oe, on]] = c.overviewBounds;
  const envelope = overviewEnvelope(route.mapCutoutBounds);

  // Each edge is clamped to the envelope INDEPENDENTLY (the z7 tile grid is
  // not centred on the route, so the slack is asymmetric), so assert per edge:
  // exactly the requested widening, or precisely at the cap.
  const edge = (got, want, capDistance, label) =>
    assert.ok(
      Math.abs(got - want) < 1 || capDistance < 1,
      `${label}: expected ${want.toFixed(1)} m of widening, got ${got.toFixed(1)}`,
    );

  const wantV = Math.max(0, (788 * scale - USER_MERC_H) / 2);
  edge(mercY(route.userBounds[0][1]) - mercY(os), wantV,
    Math.abs(mercY(os) - mercY(envelope[0][1])), 'south');
  edge(mercY(on) - mercY(route.userBounds[1][1]), wantV,
    Math.abs(mercY(on) - mercY(envelope[1][1])), 'north');

  const wantH = Math.max(0, (390 * scale * 1.05 - USER_MERC_W) / 2);
  edge(mercX(route.userBounds[0][0]) - mercX(ow), wantH,
    Math.abs(mercX(ow) - mercX(envelope[0][0])), 'west');
  edge(mercX(oe) - mercX(route.userBounds[1][0]), wantH,
    Math.abs(mercX(oe) - mercX(envelope[1][0])), 'east');
});

test('the corrected scale never expands past the physical envelope', () => {
  const [[ew, es], [ee, en]] = overviewEnvelope(route.mapCutoutBounds);
  for (const [w, h] of [[320, 512], [375, 611], [390, 788], [430, 876], [360, 944], [2412, 1080], [3292, 1440]]) {
    const c = constraints(w, h, overviewFor(w, h));
    if (!c.overviewBounds) continue;
    const [[ow, os], [oe, on]] = c.overviewBounds;
    assert.ok(mercX(ow) >= mercX(ew) - 1e-6, `${w}x${h}: west inside the envelope`);
    assert.ok(mercX(oe) <= mercX(ee) + 1e-6, `${w}x${h}: east inside the envelope`);
    assert.ok(mercY(os) >= mercY(es) - 1e-6, `${w}x${h}: south inside the envelope`);
    assert.ok(mercY(on) <= mercY(en) + 1e-6, `${w}x${h}: north inside the envelope`);
  }
});

test('hysteresis is unchanged by the scale correction', () => {
  const c = constraints(390, 788, overviewFor(390, 788));
  const t = c.zoomThreshold;
  // Inside the dead band the current state is held, whichever it is.
  assert.equal(activeBoundsForZoom(c, t, true).expanded, true, 'held expanded at the threshold');
  assert.equal(activeBoundsForZoom(c, t, false).expanded, false, 'held strict at the threshold');
  assert.equal(activeBoundsForZoom(c, t + 0.06, true).expanded, false, 'leaves above +0.05');
  assert.equal(activeBoundsForZoom(c, t - 0.06, false).expanded, true, 'enters below −0.05');
});

// ---- The overview padding contract ------------------------------------------

test('the overview padding is horizontally balanced', () => {
  for (const [w, h] of [[320, 512], [375, 611], [390, 788], [430, 876], [360, 944], [1132, 800], [1364, 860]]) {
    const p = overviewPaddingFor({ viewportWidth: w, viewportHeight: h, topInset: LEAD, bottomInset: 0 });
    assert.equal(p.left, p.right, `${w}x${h}: equal side margins`);
  }
});

test('the overview padding reserves the declared marker-label allowance', () => {
  const p = overviewPaddingFor({ viewportWidth: 375, viewportHeight: 611, topInset: LEAD });
  assert.equal(p.left, Math.max(BASE_MAP_PADDING.left, BASE_MAP_PADDING.right) + MARKER_LABEL_SAFE_X);
  // The allowance must actually cover the widest label the marker system
  // renders, or a waypoint on the route's extreme longitude clips.
  const WIDEST_LABEL_PX = 62.5; // Nikkaluokta — see mapPadding.mjs
  assert.ok(
    MARKER_LABEL_SAFE_X >= WIDEST_LABEL_PX / 2,
    'half the widest label fits inside the allowance',
  );
});

test('the overview padding keeps the scope clearance but not the control stack', () => {
  const p = overviewPaddingFor({ viewportWidth: 375, viewportHeight: 611, topInset: LEAD });
  assert.equal(p.top, BASE_MAP_PADDING.top + LEAD, 'the scope control is genuinely across the top');
  assert.equal(p.bottom, BASE_MAP_PADDING.bottom, 'no bottom band on an idle map');
  // The operational padding DOES charge the stack; the overview must not.
  const operational = paddingFor(375, 611);
  assert.equal(operational.right, BASE_MAP_PADDING.right + STACK);
  assert.ok(p.right < operational.right, 'the overview is not charged the stack');
});

test('the tracking pill still reaches the overview padding while it exists', () => {
  const idle = overviewPaddingFor({ viewportWidth: 375, viewportHeight: 611, topInset: LEAD });
  const live = overviewPaddingFor({ viewportWidth: 375, viewportHeight: 611, topInset: LEAD, bottomInset: 74 });
  assert.equal(live.bottom, idle.bottom + 74);
});

test('the overview padding can never consume the viewport either', () => {
  const p = overviewPaddingFor({ viewportWidth: 120, viewportHeight: 100, topInset: 200, bottomInset: 200 });
  assert.ok(p.left + p.right <= 120 * MAX_PADDING_FRACTION + 1);
  assert.ok(p.top + p.bottom <= 100 * MAX_PADDING_FRACTION + 1);
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
