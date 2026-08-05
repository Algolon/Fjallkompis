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
 * One wrinkle remains: viewports WIDER than the user bounds' aspect. Since
 * the Map became a viewport-filling workspace (0.27.0) that is every normal
 * landscape shape — a 16:10 laptop's full-route fit needs an east/west view
 * of ~240 km and a 1512×860 MacBook ~268 km, against ~150.6 km of user
 * bounds. (This paragraph used to reason about a square 1:1 desktop/tablet
 * map card; that layout is gone, and the map's shape is now simply the
 * workspace's shape.) Fitting the full route there needs a view wider than
 * the user bounds, which plain maxBounds forbids — MapLibre would clamp the
 * zoom and crop the route. For exactly that case the OVERVIEW EXPANSION
 * widens maxBounds east/west, but only while the camera is zoomed out far
 * enough that the viewport is wider than the user bounds anyway
 * (zoom < threshold, with hysteresis). As soon as the user zooms in past the
 * threshold, the strict user bounds snap back and the camera is herded
 * inside them.
 *
 * KNOWN LIMIT (deferred, Map Refinement II PR 2): `overviewEnvelope` below
 * derives its cap from the z7 tile grid, but is applied at every overview
 * zoom. Viewports from ~1920×1080 upward settle at zooms that render z9
 * tiles, whose real-data footprint is 234.8 km against z7's 313.1 km — so
 * the cap over-claims and a blank western margin becomes reachable there.
 * Measured 0 px on every supported shape through 1512×860. The envelope is
 * also asymmetric about the route (1.736° of margin west, 1.041° east),
 * which pushes wide-viewport compositions east. Neither is touched here.
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
 *    `zoomThreshold` — user bounds, widened east/west (and, when the
 *    layout's camera padding demands it, north/south) just enough that the
 *    route overview fits this viewport, always inside the physical
 *    envelope (null when no widening is needed);
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
 * The PHYSICAL overview envelope: the extent guaranteed to carry real data
 * at overview zooms, pulled in by a 2 km margin on every edge.
 *
 *  - east/west: the z7 tile-aligned footprint of the data bounds
 *    (build-terrain-map.sh generates real DEM for exactly this), which is
 *    considerably wider than the cutout;
 *  - north/south: the data bounds themselves — every archive is cut to
 *    them, so they are covered by construction. No tile-grid extension is
 *    claimed vertically: the cap stays inside what is provably there.
 *
 * Overview bounds are capped to this, so no viewport — however wide, and
 * whatever its overlay padding — can pan onto unshaded map.
 */
export function overviewEnvelope(dataBounds) {
  const [[dw, ds], [de, dn]] = dataBounds;
  const tile = (2 * MERC_MAX) / Math.pow(2, TERRAIN_MIN_ZOOM);
  const marginM = 2000;
  const x0 = Math.floor((mercX(dw) + MERC_MAX) / tile) * tile - MERC_MAX;
  const x1 = Math.ceil((mercX(de) + MERC_MAX) / tile) * tile - MERC_MAX;
  return [
    [invMercX(x0 + marginM), invMercY(mercY(ds) + marginM)],
    [invMercX(x1 - marginM), invMercY(mercY(dn) - marginM)],
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
  const userMercH = mercY(un) - mercY(us);

  // Zoom at which the viewport spans exactly the user bounds. Below EITHER
  // axis's threshold the viewport cannot avoid spanning the bounds in that
  // direction, so the expansion (whichever edges it widened) applies from
  // the higher of the two.
  const zoomThreshold = Math.max(
    Math.log2((2 * MERC_MAX) / userMercW) + Math.log2(viewportWidth / 512),
    Math.log2((2 * MERC_MAX) / userMercH) + Math.log2(viewportHeight / 512),
  );

  // ROUTE-OVERVIEW FIT SCALE — set by whichever axis actually binds.
  //
  // This used to be `routeMercH / usableH`, on the reasoning that "the route
  // is far taller than wide" so height must bind. That holds for landscape,
  // but NOT for phone portrait: once the padded viewport is narrow enough,
  // the route's 86.3 km width needs a coarser scale than its 153.9 km height
  // does. Measured on every audited phone (Phase A, §4c) — 320×568 through
  // 430×932 and a tall 360×1000 are all width-bound, and the height-only
  // formula underestimated the required scale by 3.3–43.6 %.
  //
  // Underestimating it here is not cosmetic: `halfExpand`/`halfExpandV` below
  // are derived from this scale, so too small a value silently reports "no
  // expansion needed" for a viewport that does need one. MapLibre then clamps
  // the requested fit against the un-widened user bounds — which is how a
  // tall phone ended up parked exactly on its zoom threshold with the route
  // pushed off the west edge.
  //
  // MapLibre's own fitBounds picks the same larger-of-the-two scale, so this
  // is simply the constraint maths agreeing with the fit it has to permit.
  const padV = (padding?.top ?? 0) + (padding?.bottom ?? 0);
  const padH = (padding?.left ?? 0) + (padding?.right ?? 0);
  const usableH = Math.max(1, viewportHeight - padV);
  const usableW = Math.max(1, viewportWidth - padH);
  const routeMercH = mercY(rn) - mercY(rs);
  const routeMercW = mercX(re) - mercX(rw);
  const fitMercPerPx = Math.max(routeMercW / usableW, routeMercH / usableH);
  const fitViewMercW = viewportWidth * fitMercPerPx;

  // 5% slack so the fitted view never lands exactly on the constraint.
  const halfExpand = Math.max(0, (fitViewMercW * 1.05 - userMercW) / 2);

  // NORTH/SOUTH expansion — the layout-aware padding contract.
  // The cockpit's scope control covers the top of the map (and a live
  // -tracking pill the bottom, while a session runs), so the fitted overview
  // needs MORE viewport height than the route itself. On phones that view can
  // be taller than the user bounds, and plain maxBounds would clamp the zoom
  // and push the route's ends back under the overlays. This is the same
  // mechanism as the east/west expansion above — deterministic, active only
  // below the zoom threshold, and capped to the physical envelope — applied
  // to the axis the padding actually squeezes. NO slack factor here: the
  // vertical fit is exact, so viewports whose padded overview already fits
  // keep strictly unchanged north/south bounds.
  //
  // (This used to cite a permanent status dock along the bottom. That dock
  // was removed in 0.27.0; the idle map reserves no bottom band at all, and
  // `bottomInset` is non-zero only while the tracking pill exists.)
  const fitViewMercH = viewportHeight * fitMercPerPx;
  const halfExpandV = Math.max(0, (fitViewMercH - userMercH) / 2);

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
  let south = mercY(us) - halfExpandV;
  let north = mercY(un) + halfExpandV;
  if (dataBounds && halfExpandV > 0) {
    const [[, es], [, en]] = overviewEnvelope(dataBounds);
    south = Math.max(south, mercY(es));
    north = Math.min(north, mercY(en));
  }

  const overviewBounds =
    halfExpand > 0 || halfExpandV > 0
      ? [
          [invMercX(west), halfExpandV > 0 ? invMercY(south) : us],
          [invMercX(east), halfExpandV > 0 ? invMercY(north) : un],
        ]
      : null;

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
