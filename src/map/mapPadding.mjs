/**
 * Camera padding for the Trail Cockpit — TWO deliberately different contracts.
 *
 * The Map is a workspace whose chrome FLOATS OVER the map: a scope pill in the
 * top-left lead column, a control stack in the top-right, and a live-tracking
 * pill along the bottom while a session runs. MapScreen owns the layout,
 * measures its own overlay bands and hands MapView the rectangles through
 * typed props. MapLibre code never reaches into app DOM to discover its own
 * chrome.
 *
 * 1. OPERATIONAL padding (`cameraPaddingFor`) — for fits whose job is to put
 *    geometry somewhere the hiker can WORK with it: `fitStage`, focused
 *    routes, focused points. These must clear the chrome, so the insets are
 *    the regions the cockpit ACTUALLY covers (not the bands' bounding boxes:
 *    the top band spans the full width, but only its left and right columns
 *    cover anything).
 *
 * 2. OVERVIEW padding (`overviewPaddingFor`) — for the one view whose job is
 *    to COMPOSE the whole route in the frame: the initial fit and the explicit
 *    "Fit route" action. Two differences, both deliberate:
 *
 *    a. HORIZONTALLY BALANCED. The operational contract charges the control
 *       stack as a right inset for the full viewport height. The stack is a
 *       44px column that occupies the top ~25% of the map, and on a
 *       width-bound phone that asymmetry (measured left 16 / right 70) pushed
 *       the whole route 27px west and left 16px of context on one side
 *       against 70px on the other. An overview is a composition, not an
 *       operational view, so it gets equal margins and the stack goes back to
 *       being what it looks like — a local overlay floating over the corner.
 *
 *    b. LABEL-SAFE. Fits frame `route.bounds`, which is pure GPX geometry:
 *       a waypoint sitting exactly on the route's extreme longitude lands
 *       exactly on the padding edge, and its marker label — centred on the
 *       coordinate, so overhanging half its width — clips. On Kungsleden both
 *       extremities are such waypoints. `MARKER_LABEL_SAFE_X` is the declared
 *       allowance for that, so no route or waypoint is ever special-cased.
 *
 * VERTICAL asymmetry is kept in BOTH contracts, and no vertical label
 * allowance is added. The bounded camera has far more horizontal than
 * vertical slack (userBounds are 150.6 km wide against an 86.3 km route, but
 * only 64.3 km taller than the 153.9 km route in Mercator), so vertical
 * padding is the expensive kind: spending it is what makes a padded overview
 * exceed the user bounds and get clamped. The top keeps the lead column's
 * measured depth (the scope control is genuinely there); the bottom keeps the
 * base breathing margin, plus the tracking pill only while it exists.
 *
 * Pure ESM so tests/map-camera-padding.test.mjs can pin the maths in node.
 */

/** Breathing room from the workspace edges, before any overlay insets. */
export const BASE_MAP_PADDING = { top: 12, right: 16, bottom: 12, left: 16 };

/**
 * Fraction of a dimension the padding may consume in total. Above this the
 * fitted view collapses toward a point (and MapLibre rejects padding that
 * exceeds the viewport), so the insets are scaled down proportionally: on a
 * very short viewport the overlays overlap the geometry a little rather than
 * the camera zooming into nothing.
 */
export const MAX_PADDING_FRACTION = 0.6;

const clampAxis = (a, b, size) => {
  const budget = Math.max(0, size) * MAX_PADDING_FRACTION;
  const total = a + b;
  if (total <= budget || total === 0) return [a, b];
  const scale = budget / total;
  return [a * scale, b * scale];
};

/**
 * @param {object} o
 * @param {number} o.viewportWidth  map container width in CSS px
 * @param {number} o.viewportHeight map container height in CSS px
 * @param {number} [o.topInset]     covered depth from the top edge
 * @param {number} [o.rightInset]   covered depth from the right edge
 * @param {number} [o.bottomInset]  covered depth from the bottom edge
 * @param {number} [o.leftInset]    covered depth from the left edge
 * @param {{top:number,right:number,bottom:number,left:number}} [o.base]
 * @returns {{top:number,right:number,bottom:number,left:number}} whole px
 */
export function cameraPaddingFor({
  viewportWidth,
  viewportHeight,
  topInset = 0,
  rightInset = 0,
  bottomInset = 0,
  leftInset = 0,
  base = BASE_MAP_PADDING,
}) {
  const top = base.top + Math.max(0, topInset);
  const bottom = base.bottom + Math.max(0, bottomInset);
  const [t, b] = clampAxis(top, bottom, viewportHeight);
  const [l, r] = clampAxis(
    base.left + Math.max(0, leftInset),
    base.right + Math.max(0, rightInset),
    viewportWidth,
  );
  return {
    top: Math.round(t),
    right: Math.round(r),
    bottom: Math.round(b),
    left: Math.round(l),
  };
}

/**
 * DECLARED MARKER-LABEL DISPLAY CONTRACT — the horizontal allowance a
 * route-overview fit reserves so a waypoint sitting on the route's extreme
 * longitude keeps its whole label on screen.
 *
 * `.map-hut__label` is absolutely positioned at `left: 50%` with
 * `translateX(-50%)`, i.e. centred on the marker's coordinate, so a label
 * overhangs its anchor by half its width on each side. This constant is half
 * the WIDEST label the current system renders, rounded up:
 *
 *   Nikkaluokta 62.5px · Abiskojaure 62.3 · Kebnekaise 61.5 · Alesjaure 48.9
 *   Abisko 36 · Tjäktja 35.7 · Sälka 28.9 · Singi 26.1
 *   -> widest 62.5 -> half 31.3 -> 32
 *
 * Using the widest rather than the label that happens to sit at today's
 * extremity keeps this route-agnostic: reversing the direction, or a future
 * trail with different waypoints, needs no new number. It is a deterministic
 * pixel allowance, NOT a per-fit DOM measurement — the camera never waits on
 * layout — and it is validated against the rendered labels by the browser
 * evidence in docs/pr-evidence/2026-08-map-refinement-ii/pr1-framing/.
 *
 * If the label font, weight or the longest waypoint name changes, re-measure
 * and update this together with that evidence.
 */
export const MARKER_LABEL_SAFE_X = 32;

/**
 * Padding for the FULL-ROUTE OVERVIEW fit (the initial camera and "Fit
 * route"). Horizontally balanced and label-safe; vertically the same
 * measured contract as the operational padding. See the module header.
 *
 * Deliberately takes no `rightInset`: the control stack is a local overlay
 * over the top corner, not a full-height column, and charging it here is
 * exactly what unbalanced the composition.
 *
 * @param {object} o
 * @param {number} o.viewportWidth  map container width in CSS px
 * @param {number} o.viewportHeight map container height in CSS px
 * @param {number} [o.topInset]     covered depth from the top (lead column)
 * @param {number} [o.bottomInset]  covered depth from the bottom (tracking pill)
 * @param {{top:number,right:number,bottom:number,left:number}} [o.base]
 * @param {number} [o.labelSafeX]   horizontal marker-label allowance
 * @returns {{top:number,right:number,bottom:number,left:number}} whole px
 */
export function overviewPaddingFor({
  viewportWidth,
  viewportHeight,
  topInset = 0,
  bottomInset = 0,
  base = BASE_MAP_PADDING,
  labelSafeX = MARKER_LABEL_SAFE_X,
}) {
  const [t, b] = clampAxis(
    base.top + Math.max(0, topInset),
    base.bottom + Math.max(0, bottomInset),
    viewportHeight,
  );
  // Same value both sides: that IS the balance, and both of Kungsleden's
  // extremities carry a wide label (Tjäktja west, Nikkaluokta east).
  const side = Math.max(base.left, base.right) + Math.max(0, labelSafeX);
  const [l, r] = clampAxis(side, side, viewportWidth);
  return {
    top: Math.round(t),
    right: Math.round(r),
    bottom: Math.round(b),
    left: Math.round(l),
  };
}

/**
 * The rectangle of the map that is NOT covered by overlays, for a padding
 * and a container size. Used by the tests to assert that fitted geometry
 * lands in the visible band, and useful when reasoning about framing.
 */
export function visibleMapRect({ viewportWidth, viewportHeight, padding }) {
  return {
    x: padding.left,
    y: padding.top,
    width: Math.max(0, viewportWidth - padding.left - padding.right),
    height: Math.max(0, viewportHeight - padding.top - padding.bottom),
  };
}
