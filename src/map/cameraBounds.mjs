/**
 * Bounded-map camera constraints (0.15.0 bounded-map iteration).
 *
 * Fjällkompis is a route companion, not a map browser: the camera is fenced
 * to the USER BOUNDS of the coverage contract (route + userBufferKm, see
 * scripts/route-configs.mjs), for which every archive guarantees complete
 * data plus a hidden margin. MapLibre's maxBounds enforces this against the
 * whole visible viewport (its transform constrains the viewport edges, not
 * merely the camera centre) — for UNROTATED, UNPITCHED views. Pitch is
 * disabled outright (maxPitch 0) and rotation gestures are turned off
 * (north-up product policy), so that guarantee is total.
 *
 * One wrinkle remains: viewports much WIDER than the user bounds' aspect
 * (fullscreen on a landscape monitor). Fitting the full 57 km-tall route
 * there needs a view wider than the user bounds, which plain maxBounds
 * forbids — MapLibre would clamp the zoom and crop the route. For exactly
 * that case the OVERVIEW EXPANSION widens maxBounds east/west, but only
 * while the camera is zoomed out far enough that the viewport is wider than
 * the user bounds anyway (zoom < threshold, with hysteresis). Those zoom
 * levels render z7–9 terrain tiles whose tile-aligned REAL-data footprint
 * extends tens of kilometres beyond the cutout, so the expanded view still
 * shows genuine relief — never a crop edge. As soon as the user zooms in
 * past the threshold, the strict user bounds snap back and the camera is
 * herded inside them.
 *
 * Plain ESM so tests/camera-bounds.test.mjs can fence the maths in node.
 */

/** Web-Mercator helpers (metres). */
const R = 6378137;
const MERC_MAX = Math.PI * R;

export function mercX(lon) {
  return (lon * Math.PI * R) / 180;
}

export function mercY(lat) {
  return R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

export function invMercX(x) {
  return (x / (Math.PI * R)) * 180;
}

export function invMercY(y) {
  return ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;
}

/** Mercator metres per CSS pixel at a zoom (MapLibre's 512px world tile). */
export function mercPerPixel(zoom) {
  return (2 * MERC_MAX) / (512 * Math.pow(2, zoom));
}

/**
 * Camera constraints for a viewport, from the coverage contract:
 *
 *  - `bounds`: what maxBounds should be while zoomed IN (always the user
 *    bounds — the strict contract);
 *  - `overviewBounds`: what maxBounds should be while zoomed OUT below
 *    `zoomThreshold` — user bounds, widened east/west just enough that the
 *    route overview fits this viewport (null when no widening is needed,
 *    i.e. portrait-ish viewports);
 *  - `zoomThreshold`: the zoom at which the viewport is exactly as wide as
 *    the user bounds; below it the viewport cannot avoid spanning the full
 *    bounds width, so the widened overview bounds apply.
 *
 * Pure function of (contract, viewport, padding) so node tests can pin the
 * behaviour for every supported viewport class.
 */
export function cameraConstraintsFor({
  userBounds,
  routeBounds,
  viewportWidth,
  viewportHeight,
  padding,
}) {
  const [[uw, us], [ue, un]] = userBounds;
  const [[rw, rs], [re, rn]] = routeBounds;
  const userMercW = mercX(ue) - mercX(uw);

  // Zoom at which the viewport spans exactly the user-bounds width.
  const zoomThreshold =
    Math.log2((2 * MERC_MAX) / userMercW) + Math.log2(viewportWidth / 512);

  // Route-overview fit: scale is set by the padded HEIGHT (the route is far
  // taller than wide); the resulting full-viewport width decides whether
  // this viewport needs the overview widening.
  const padV = (padding?.top ?? 0) + (padding?.bottom ?? 0);
  const usableH = Math.max(1, viewportHeight - padV);
  const routeMercH = mercY(rn) - mercY(rs);
  const fitMercPerPx = routeMercH / usableH;
  const fitViewMercW = viewportWidth * fitMercPerPx;

  // 5% slack so the fitted view never lands exactly on the constraint.
  const halfExpand = Math.max(0, (fitViewMercW * 1.05 - userMercW) / 2);
  const overviewBounds =
    halfExpand > 0
      ? [
          [invMercX(mercX(uw) - halfExpand), us],
          [invMercX(mercX(ue) + halfExpand), un],
        ]
      : null;

  return {
    bounds: userBounds,
    overviewBounds,
    zoomThreshold,
  };
}

/**
 * Which maxBounds applies at a zoom, with hysteresis so the swap can never
 * oscillate while MapLibre settles an animation near the threshold.
 */
export function activeBoundsForZoom(constraints, zoom, currentlyExpanded) {
  const { bounds, overviewBounds, zoomThreshold } = constraints;
  if (!overviewBounds) return { bounds, expanded: false };
  const enter = zoomThreshold - 0.05; // expand below this
  const leave = zoomThreshold + 0.05; // tighten above this
  if (currentlyExpanded) {
    return zoom > leave ? { bounds, expanded: false } : { bounds: overviewBounds, expanded: true };
  }
  return zoom < enter ? { bounds: overviewBounds, expanded: true } : { bounds, expanded: false };
}

/**
 * Static minimum-zoom backstop. The operative floor is maxBounds itself
 * (MapLibre will not zoom out past the point where the viewport exceeds the
 * active bounds); this constant only guards against a pathological viewport
 * (e.g. 0-height during layout) unlocking a world view.
 */
export const MIN_ZOOM_BACKSTOP = 7;
