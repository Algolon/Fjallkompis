/**
 * Route manifest: one entry per GPX route dataset processed by
 * scripts/generate-route-data.mjs. This is the single place that knows which
 * routes exist, where their GPX lives, what structure the GPX must have and
 * where the generated JSON / PMTiles archives go.
 *
 * The Kungsleden entry is the permanent, canonical route. Optional entries
 * (required: false) may be added for bounded tests; a missing optional GPX
 * yields an { available: false } stub instead of failing the build.
 */

export const KUNGSLEDEN_CONFIG = {
  id: 'kungsleden',
  gpxPath: 'public/gpx/kungsleden-abisko-nikkaluokta.gpx',
  outputPath: 'src/generated/kungsleden-route.json',
  pmtilesPath: 'public/maps/kungsleden.pmtiles',
  /** A missing GPX fails the build (this is the app's core dataset). */
  required: true,
  /** 1 overview segment + N stage segments. */
  expectedSegments: 8,
  expectedWaypoints: 8,
  /** Stage → [fromWaypointId, toWaypointId], in route order. */
  stageWaypoints: [
    ['START_ABISKO', 'HUT_ABISKOJAURE'],
    ['HUT_ABISKOJAURE', 'HUT_ALESJAURE'],
    ['HUT_ALESJAURE', 'HUT_TJAKTJA'],
    ['HUT_TJAKTJA', 'HUT_SALKA'],
    ['HUT_SALKA', 'HUT_SINGI'],
    ['HUT_SINGI', 'HUT_KEBNEKAISE'],
    ['HUT_KEBNEKAISE', 'END_NIKKALUOKTA'],
  ],
  /** Stage ids become `${stageIdPrefix}${n}` (d1..d7 match persisted state). */
  stageIdPrefix: 'd',
  /** Mountain route: a GPX without elevation data is a hard error. */
  requireElevation: true,
  /**
   * Coverage contract (single source of truth — every archive build script
   * and the app's camera constraints consume the bounds derived here):
   *
   *  - userBufferKm: route bounds + this buffer = USER BOUNDS, the area the
   *    camera can actually reach (MapLibre maxBounds). 12 km fits the full
   *    route inside every supported viewport's "Fit route" view with slack,
   *    and gives credible off-route/orientation context without regional
   *    excess (bounded-map audit, 2026-07-10).
   *  - dataMarginKm: hidden safety margin added on top of the user bounds
   *    for DATA GENERATION (mapCutoutBounds = route + userBufferKm +
   *    dataMarginKm, then each pipeline tile-aligns outward per zoom). The
   *    user must never see a physical archive edge; the post-alignment
   *    margin is reported by the terrain build.
   */
  userBufferKm: 12,
  dataMarginKm: 3,
  /**
   * VECTOR OVERVIEW ALLOWANCE — extra longitude, at OVERVIEW ZOOMS ONLY, for
   * the vector basemap extract. Deliberately not a change to userBufferKm or
   * dataMarginKm: widening either of those would enlarge every zoom of every
   * archive (terrain, contours, satellite included) for a problem that exists
   * only in the low-zoom vector corridor.
   *
   * WHY IT IS NEEDED. `mapCutoutBounds` is centred on the route, but the
   * Web-Mercator tile grid is not: the tile column containing the route's
   * western end reaches much further west than the eastern column reaches
   * east. Measured footprints of the shipped archive:
   *
   *   z7/z8   16.8750 .. 19.6875     (1.754° west of the route centre,
   *   z9/z10  17.5781 .. 19.6875      but only 1.059° east)
   *
   * A horizontally balanced full-route overview needs the SAME margin on both
   * sides. The widest supported viewport (1920×1080, map 1772 px, PR #100
   * overview padding) needs 17.4065 .. 19.8507 — inside the western margin at
   * every zoom, but 0.163° beyond the eastern one at EVERY overview zoom
   * including z7 and z8. East is the binding side, not west.
   *
   * WHY THESE ZOOMS. The supported full-route overview resolves to vector
   * source zoom 7 or 8 (`floor(mapZoom)`; measured 7.67–8.99 across the
   * supported set), so z7 and z8 must carry it. z9 is included because
   * 1920×1080 lands at zoom 8.994 — six thousandths below the z8→z9 boundary,
   * where the footprint narrows by 78 km — and a supported contract must not
   * rest on that margin. z10 and above are NOT widened: no supported overview
   * requests them, and once the camera zooms past the overview threshold the
   * strict interaction bounds (userBufferKm) apply, which the existing
   * corridor already covers with room to spare.
   *
   * The margin is symmetric because the requirement is symmetric about the
   * route centre; 0.5° covers the measured 0.4734° requirement without
   * pulling in any additional tile column at z7, z8 or z9.
   */
  vectorOverview: {
    /** Highest zoom that gets the widened box; above it, the cutout applies. */
    maxZoom: 9,
    /** Extra longitude each side of mapCutoutBounds, degrees. */
    lonMarginDeg: 0.5,
  },
  /** Display-name overrides for waypoint ids whose GPX names are too formal. */
  nameOverrides: { START_ABISKO: 'Abisko' },
};


export const ROUTE_CONFIGS = [KUNGSLEDEN_CONFIG];

export const ROUTE_CONFIG_BY_ID = Object.fromEntries(
  ROUTE_CONFIGS.map((c) => [c.id, c]),
);
