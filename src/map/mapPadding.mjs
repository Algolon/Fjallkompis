/**
 * Layout-aware camera padding for the Trail Cockpit.
 *
 * The Map is a workspace whose chrome FLOATS OVER the map: a scope pill and
 * control stack along the top band, a status dock along the bottom. A fixed
 * fit padding (the old 40/40/32/32) therefore frames geometry into regions
 * the user cannot see — a stage fitted "to the viewport" would sit half
 * under the status dock.
 *
 * The contract instead: MapScreen owns the layout, measures its own overlay
 * bands and hands MapView a padding rectangle through a typed prop. MapLibre
 * code never reaches into app DOM to discover its own chrome.
 *
 * The insets are the REGIONS ACTUALLY COVERED, not the bands' bounding
 * boxes: the cockpit's top band spans the full width but only its left
 * column (scope pill, map notes, tracking warnings) and its right column
 * (the control stack) cover anything. Reserving the whole band as top
 * padding would cost ~120px of vertical fit for a 44px pill — and the
 * bounded-map camera has far more horizontal than vertical slack
 * (userBounds are 150.6 km wide against a 86.3 km route, but only 64.3 km
 * taller than the 153.9 km route in Mercator), so spending the stack on the
 * RIGHT inset and only the lead column on TOP is what keeps a full-route
 * fit inside the coverage contract.
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
