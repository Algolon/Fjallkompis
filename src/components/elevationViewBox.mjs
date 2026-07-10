/**
 * Elevation-chart viewBox geometry (plain ESM so node --test can fence it —
 * same convention as src/map/cameraBounds.mjs).
 *
 * The chart is drawn in a fixed-width viewBox (CHART_W). Its HEIGHT is
 * dynamic: where CSS leaves the SVG `height: auto` (mobile portrait) the
 * intrinsic CHART_H shape applies unchanged; where CSS fixes the height
 * (the desktop map column caps the chart so the Locate/manual-mode panel
 * below the summary stays in view) the viewBox height is matched to the
 * RENDERED box, so the drawing always fills the element edge-to-edge at
 * uniform scale — no letterboxed dead zones (which would break the scrub
 * x-mapping) and no stretched axis labels (preserveAspectRatio "none"
 * would distort text).
 */

export const CHART_W = 360;
/** Intrinsic viewBox height — the shape when CSS keeps `height: auto`. */
export const CHART_H = 150;
export const PAD_L = 34;
export const PAD_R = 10;
export const PAD_T = 12;
export const PAD_B = 20;

/** Flattest allowed shape: the vertical padding plus room for the line.
 *  Deliberately BELOW every shape the shipped CSS can produce (the
 *  flattest real case, a ~757px-wide chart at the 146px cap, needs ~69),
 *  so the clamp only guards true degenerates — a clamp that engaged on a
 *  real layout would mismatch the box ratio and reintroduce the letterbox
 *  this module exists to prevent (fenced by the ratio-preserved test). */
export const MIN_VB_H = PAD_T + PAD_B + 32;

/**
 * viewBox height for a rendered box, rounded to a whole viewBox unit.
 * Clamped to [MIN_VB_H, CHART_H]: never flatter than drawable, never
 * taller than the intrinsic shape. Returns null for degenerate boxes
 * (zero/negative during layout) — callers keep the previous value.
 */
export function viewBoxHeightFor(boxWidth, boxHeight) {
  if (!(boxWidth >= 1) || !(boxHeight >= 1)) return null;
  return Math.round(
    Math.min(CHART_H, Math.max(MIN_VB_H, (CHART_W * boxHeight) / boxWidth)),
  );
}

/**
 * Whether a freshly measured value should replace the current one. The
 * 2-unit hysteresis matters: rounding alone is not enough, because ±0.5px
 * of resize noise around an integer boundary rounds to a ±1 flip and
 * would re-render on every oscillation. Two viewBox units (~2–4 CSS px)
 * absorb that, while a box whose ratio already matches the current
 * viewBox (height: auto, mobile) measures back to exactly the current
 * value — a stable fixed point, so no ResizeObserver feedback loop is
 * possible in either sizing mode.
 */
export function shouldUpdateViewBoxHeight(current, next) {
  return next != null && Math.abs(current - next) >= 2;
}
