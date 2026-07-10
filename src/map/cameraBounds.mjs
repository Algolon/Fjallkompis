/**
 * Bounded-map camera constraints (0.15.0 bounded-map iteration).
 *
 * THREE-LEVEL BOUNDS MODEL — the vocabulary used across code, tests and
 * docs (docs/DEVELOPMENT.md "Map coverage contract"):
 *
 *  1. INTERACTION BOUNDS — the normal panning/zooming area of regular map
 *     use: the coverage contract's `userBounds` field (route +
 *     userBufferKm; the JSON field keeps that name because the published
 *     provenance manifests record it), applied as MapLibre maxBounds
 *     whenever the camera is zoomed in past the overview threshold.
 *  2. OVERVIEW BOUNDS — a temporary, deterministic east/west widening of
 *     the interaction bounds, derived per viewport shape, used ONLY while
 *     a wide viewport is below its zoom threshold and needs the complete
 *     north–south route in one overview. Zooming in always returns the
 *     camera to the interaction bounds.
 *  3. PHYSICAL DATA BOUNDS — the larger hidden extent every archive
 *     actually covers: the contract's mapCutoutBounds (+ per-zoom outward
 *     tile alignment). Levels 1 and 2 must stay inside this at the zooms
 *     where they apply — fenced by tests/coverage-contract.test.mjs and
 *     tests/camera-bounds.test.mjs.
 *
 * Fjällkompis is a route companion, not a map browser: the camera is fenced
 * to the interaction bounds of the coverage contract, for which every
 * archive guarantees complete data plus a hidden margin. MapLibre's maxBounds enforces this against the
 * whole visible viewport (its transform constrains the viewport edges, not
 * merely the camera centre) — for UNROTATED, UNPITCHED views. Pitch is
 * disabled outright (maxPitch 0) and rotation gestures are turned off
 * (north-up product policy), so that guarantee is total.
 *
 * One wrinkle remains: viewports WIDER than the user bounds' aspect — the
 * square 1:1 desktop/tablet map card (whose full-route fit needs an
 * east/west view of ~182–200 km against ~150.6 km of user bounds,
 * recalculated 2026-07-10 for the square layout) and, more extremely,
 * fullscreen on a landscape monitor. Fitting the full route
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
 *  - `interactionBounds`: what maxBounds should be while zoomed IN
 *    (always the contract's strict rectangle);
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
/** Lowest generated terrain zoom (kept in sync with build-terrain-map.sh). */
export const TERRAIN_MIN_ZOOM = 7;

/**
 * The PHYSICAL overview envelope: the east/west extent guaranteed to carry
 * real terrain at overview zooms — the z7 tile-aligned footprint of the
 * data bounds (build-terrain-map.sh generates real DEM for exactly this),
 * pulled in by a 2 km margin. Overview bounds are capped to it so no
 * viewport, however wide, can ever pan onto unshaded map.
 */
export function overviewEnvelope(dataBounds) {
  const [[dw, ds], [de, dn]] = dataBounds;
  const tile = (2 * MERC_MAX) / Math.pow(2, TERRAIN_MIN_ZOOM);
  const marginM = 2000;
  const x0 = Math.floor((mercX(dw) + MERC_MAX) / tile) * tile - MERC_MAX;
  const x1 = Math.ceil((mercX(de) + MERC_MAX) / tile) * tile - MERC_MAX;
  return [
    [invMercX(x0 + marginM), ds],
    [invMercX(x1 - marginM), dn],
  ];
}

export function cameraConstraintsFor({
  userBounds,
  routeBounds,
  dataBounds,
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

  // Each expanded edge is clamped INDEPENDENTLY to the physical overview
  // envelope (the z7 tile grid is not centred on the route, so the slack is
  // asymmetric — a symmetric cap would waste it). Within the envelope the
  // clamped bounds still host the fitted view for every regular viewport;
  // only extreme ultrawide shapes (≳2:1 usable aspect, e.g. 21:9
  // fullscreen) exhaust it, and then MapLibre fits the widest COVERED view
  // instead — the route slightly over-fills the height rather than the map
  // ever showing unshaded flanks.
  let west = mercX(uw) - halfExpand;
  let east = mercX(ue) + halfExpand;
  if (dataBounds && halfExpand > 0) {
    const [[ew], [ee]] = overviewEnvelope(dataBounds);
    west = Math.max(west, mercX(ew));
    east = Math.min(east, mercX(ee));
  }
  const overviewBounds =
    halfExpand > 0 ? [[invMercX(west), us], [invMercX(east), un]] : null;

  return {
    interactionBounds: userBounds,
    overviewBounds,
    zoomThreshold,
  };
}

/**
 * Which maxBounds applies at a zoom, with hysteresis so the swap can never
 * oscillate while MapLibre settles an animation near the threshold.
 */
export function activeBoundsForZoom(constraints, zoom, currentlyExpanded) {
  const { interactionBounds, overviewBounds, zoomThreshold } = constraints;
  if (!overviewBounds) return { bounds: interactionBounds, expanded: false };
  const enter = zoomThreshold - 0.05; // expand below this
  const leave = zoomThreshold + 0.05; // tighten above this
  if (currentlyExpanded) {
    return zoom > leave
      ? { bounds: interactionBounds, expanded: false }
      : { bounds: overviewBounds, expanded: true };
  }
  return zoom < enter
    ? { bounds: overviewBounds, expanded: true }
    : { bounds: interactionBounds, expanded: false };
}

/**
 * Static minimum-zoom backstop. The operative floor is maxBounds itself
 * (MapLibre will not zoom out past the point where the viewport exceeds the
 * active bounds); this constant only guards against a pathological viewport
 * (e.g. 0-height during layout) unlocking a world view.
 */
export const MIN_ZOOM_BACKSTOP = 7;
