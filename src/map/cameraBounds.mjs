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
 * Raster modes use the z7 physical footprint as their overview envelope, but
 * only where the effective source zoom contains every real descendant tile.
 * Terrain v4 provides that footprint through source z11 and returns to strict
 * interaction bounds at z12; Satellite v4 carries it through every zoom. The
 * supported envelope is inset 2 km from the pixels, so a reachable maxBounds
 * edge cannot expose sampling outside the archive.
 *
 * Plain ESM so tests/camera-bounds.test.mjs can fence the maths in node.
 */

import {
  MERC_MAX,
  mercX,
  mercY,
  invMercX,
  invMercY,
  mercPerPixel,
  overviewEnvelopeFor,
  overviewCameraFor,
  coverageForMode,
  rasterRenderableCoverage,
  rasterInteractionCoverage,
  RASTER_EDGE_SAFETY_METRES,
  RASTER_SOURCE_TILE_SIZE,
  rasterSourceZoomForDisplayZoom,
  terrainUsesOverviewCoverage,
  TERRAIN_OVERVIEW_MAX_SOURCE_ZOOM,
  TERRAIN_ARCHIVE_MAX_ZOOM,
  vectorSourceCoverage,
} from './overviewEnvelope.mjs';

// The Mercator helpers moved to overviewEnvelope.mjs (which owns the tile
// maths that needs them); re-exported here so existing importers and tests
// keep one import site.
export { MERC_MAX, mercX, mercY, invMercX, invMercY, mercPerPixel };
export { overviewEnvelopeFor, overviewCameraFor, coverageForMode };
export { rasterRenderableCoverage, vectorSourceCoverage };
export { rasterInteractionCoverage };
export {
  rasterSourceZoomForDisplayZoom,
  RASTER_SOURCE_TILE_SIZE,
  TERRAIN_OVERVIEW_MAX_SOURCE_ZOOM,
  TERRAIN_ARCHIVE_MAX_ZOOM,
};
export { terrainUsesOverviewCoverage };

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
/**
 * Lowest generated terrain zoom (kept in sync with build-terrain-map.sh).
 * The z7 footprint is the overview envelope; every effective Terrain source
 * zoom that can use expanded bounds must contain its real descendants.
 */
export const TERRAIN_MIN_ZOOM = 7;

/**
 * @deprecated Superseded by the per-source-zoom model in
 * src/map/overviewEnvelope.mjs. Kept as the RASTER (terrain/satellite)
 * renderable extent, which is what this always actually described — it was
 * only ever wrong as a cap on the VECTOR overview, whose real footprint at
 * overview zooms is much wider and, crucially, differs per zoom.
 */
export function overviewEnvelope(dataBounds) {
  const c = rasterRenderableCoverage(dataBounds, TERRAIN_MIN_ZOOM);
  const marginM = RASTER_EDGE_SAFETY_METRES;
  return [
    [invMercX(mercX(c.west) + marginM), invMercY(mercY(c.south) + marginM)],
    [invMercX(mercX(c.east) - marginM), invMercY(mercY(c.north) - marginM)],
  ];
}

/**
 * Camera constraints for a viewport.
 *
 *  - `interactionBounds`: maxBounds while zoomed IN (always the contract's
 *    strict rectangle);
 *  - `overviewBounds`: maxBounds while zoomed OUT below `zoomThreshold` —
 *    the safe overview envelope for this container, or null when the strict
 *    bounds already host the fit;
 *  - `zoomThreshold`: the zoom at which the viewport is exactly as wide (or
 *    tall) as the user bounds; below it the viewport cannot avoid spanning
 *    them, so the overview envelope applies.
 *  - `envelope`: the full reasoning behind `overviewBounds` — desired
 *    extent, vector coverage at its effective source zoom, physical raster
 *    coverage at its effective source zoom, and which bound the result. Carried so the framing
 *    evidence and tests can inspect the decision, not just its outcome.
 *
 * Pure function of (contract, viewport, padding).
 */
export function cameraConstraintsFor({
  userBounds,
  routeBounds,
  dataBounds,
  viewportWidth,
  viewportHeight,
  padding,
}) {
  const [[uw, us], [ue, un]] = userBounds;
  const userMercW = mercX(ue) - mercX(uw);
  const userMercH = mercY(un) - mercY(us);

  // Zoom at which the viewport spans exactly the user bounds. Below EITHER
  // axis's threshold the viewport cannot avoid spanning the bounds in that
  // direction, so the expansion applies from the higher of the two.
  const zoomThreshold = Math.max(
    Math.log2((2 * MERC_MAX) / userMercW) + Math.log2(viewportWidth / 512),
    Math.log2((2 * MERC_MAX) / userMercH) + Math.log2(viewportHeight / 512),
  );

  // Without a coverage contract there is nothing to expand safely into.
  if (!dataBounds) {
    return { interactionBounds: userBounds, overviewBounds: null, zoomThreshold, envelope: null };
  }

  const envelope = overviewEnvelopeFor({
    routeBounds,
    userBounds,
    cutoutBounds: dataBounds,
    viewportWidth,
    viewportHeight,
    padding,
  });

  return {
    interactionBounds: userBounds,
    overviewBounds: envelope.overviewBounds,
    zoomThreshold,
    envelope,
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
