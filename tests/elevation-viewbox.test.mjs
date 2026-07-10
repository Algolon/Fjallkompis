/**
 * Elevation-chart viewBox geometry (src/components/elevationViewBox.mjs) —
 * the maths behind the desktop chart-height cap (0.16.1). Pins:
 *  - mobile identity: a `height: auto` box (ratio CHART_H/CHART_W) measures
 *    back to exactly CHART_H, so mobile portrait renders the intrinsic
 *    360×150 shape unchanged;
 *  - the fixed point that makes a ResizeObserver feedback loop impossible
 *    in the auto-height mode;
 *  - desktop capping: CSS-fixed heights produce a flatter viewBox, clamped
 *    to [MIN_VB_H, CHART_H];
 *  - stability: fractional-pixel resize noise never requests a re-render,
 *    degenerate boxes (0×0 during layout) are ignored.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHART_W,
  CHART_H,
  MIN_VB_H,
  viewBoxHeightFor,
  shouldUpdateViewBoxHeight,
} from '../src/components/elevationViewBox.mjs';

test('height:auto boxes (mobile portrait) measure back to the intrinsic shape', () => {
  // Any width at the intrinsic ratio — including the shipped 390px-phone
  // chart (324×135) — must return exactly CHART_H.
  for (const w of [324, 360, 300.5, 700]) {
    const h = (w * CHART_H) / CHART_W;
    assert.equal(viewBoxHeightFor(w, h), CHART_H, `${w}px auto box`);
  }
});

test('the auto-height mode is a fixed point: no ResizeObserver feedback loop', () => {
  // Simulate the loop: viewBox height determines the auto box height,
  // which is measured back into the next viewBox height. From the initial
  // CHART_H it must settle immediately and never request an update.
  let vbH = CHART_H;
  for (let i = 0; i < 5; i++) {
    const boxH = (324 * vbH) / CHART_W; // height:auto ⇒ ratio = vbH/CHART_W
    const next = viewBoxHeightFor(324, boxH);
    assert.equal(shouldUpdateViewBoxHeight(vbH, next), false, `iteration ${i}`);
    vbH = next ?? vbH;
  }
  assert.equal(vbH, CHART_H);
});

test('CSS-capped desktop boxes produce a flatter viewBox at uniform scale', () => {
  // The shipped desktop measurements (chart width × capped CSS height).
  for (const [w, h] of [[544, 133], [639, 152], [757, 146], [649, 171], [704, 190], [704, 200]]) {
    const vb = viewBoxHeightFor(w, h);
    assert.ok(vb !== null && vb < CHART_H, `${w}x${h}: flatter than intrinsic`);
    // Uniform scale: the viewBox ratio matches the box ratio to <1 unit
    // (the rounding), so the drawing fills the element with no letterbox.
    assert.ok(Math.abs(vb - (CHART_W * h) / w) <= 0.5, `${w}x${h}: ratio preserved`);
    assert.ok(vb >= MIN_VB_H, `${w}x${h}: never flatter than drawable`);
  }
});

test('clamps: never flatter than MIN_VB_H, never taller than CHART_H', () => {
  assert.equal(viewBoxHeightFor(1000, 10), MIN_VB_H, 'extreme flat box clamps up');
  assert.equal(viewBoxHeightFor(360, 900), CHART_H, 'tall box clamps to intrinsic');
});

test('degenerate boxes are ignored, keeping the previous viewBox', () => {
  for (const [w, h] of [[0, 100], [100, 0], [0.5, 0.5], [-5, 100], [NaN, 100], [100, NaN]]) {
    assert.equal(viewBoxHeightFor(w, h), null, `${w}x${h}`);
    assert.equal(shouldUpdateViewBoxHeight(150, viewBoxHeightFor(w, h)), false);
  }
});

test('fractional-pixel resize noise never requests a re-render', () => {
  // Sub-unit oscillation around a settled value (e.g. scrollbar or zoom
  // rounding while dragging a window edge) must always be rejected — even
  // when the noise happens to round across an integer boundary, which is
  // why the update check needs 2-unit hysteresis on top of the rounding.
  const settled = viewBoxHeightFor(649, 171);
  for (const dh of [-0.9, -0.4, 0.4, 0.9]) {
    const next = viewBoxHeightFor(649, 171 + dh * (649 / CHART_W));
    assert.equal(
      shouldUpdateViewBoxHeight(settled, next),
      false,
      `noise ${dh} viewBox-units`,
    );
  }
  // A real resize still gets through.
  assert.equal(
    shouldUpdateViewBoxHeight(settled, viewBoxHeightFor(649, 200)),
    true,
  );
});
