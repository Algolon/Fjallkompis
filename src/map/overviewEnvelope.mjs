/**
 * The full-route overview ENVELOPE — five extents, kept explicitly apart.
 *
 * The Map's overview is a composition problem constrained by physics: the
 * route is 86 km wide and 154 km tall, so any landscape container showing all
 * of it needs a view far wider than the route. How much wider is decided by
 * the container's aspect; whether that width EXISTS is decided by what the
 * archives actually cover at the zoom the overview settles on. Conflating
 * those two questions is what produced the defect this module replaces.
 *
 * The five extents:
 *
 *  1. ROUTE BOUNDS — the GPX geometry. What the fit frames.
 *  2. INTERACTION BOUNDS — the strict rectangle of normal use (`userBounds`
 *     in the coverage contract). Always maxBounds once zoomed in.
 *  3. DESIRED OVERVIEW — the extent the fit actually needs for this
 *     container and padding, centred on the intended COMPOSITION: symmetric
 *     about the route centre horizontally, and about the padded rect's
 *     centre vertically. Derived, never hard-coded.
 *  4. PHYSICAL VECTOR COVERAGE at the effective source zoom — the hard cap.
 *     Vector is the binding contract: a missing vector tile is genuinely
 *     blank map, with no fallback.
 *  5. RENDERABLE RASTER COVERAGE — where hillshade and satellite can draw.
 *     THE ONE DELIBERATE TRADE IN THIS MODULE. Terrain and satellite stop at
 *     the z7 cell's east edge (19.6875), which is only 1.06° east of the
 *     route centre against 1.75° west. A landscape container showing the
 *     whole route needs ~1.2° each side, so a symmetric composition reaches
 *     past raster on the east: measured 83 px at 1366×768, 86 px at
 *     1512×860, 121 px at 1920×1080, 0 px on every phone and tablet
 *     portrait. Those pixels lose HILLSHADE, not map — vector still draws
 *     water, landcover, roads and labels there, and the blank-vector measure
 *     is 0 px everywhere. Capping on raster instead would crop the route by
 *     more than half its height on a 21:9 display, so vector binds and this
 *     flank is accepted and measured rather than hidden.
 *     Modelled honestly and reported, but NOT a cap: raster is 256 px and
 *     requests ~round(zoom)+1, yet MapLibre serves it from an ancestor tile
 *     when the child is missing (measured in the PR #104 evidence), so its
 *     renderable extent is its WIDEST ancestor footprint, not its
 *     requested-zoom footprint. Where a container needs more width than
 *     raster has, the flank loses shading — it does not go blank.
 *
 * Why the old model failed: it capped the overview to the z7 tile cell around
 * the data bounds, which is 1.75° west of the route centre but only 1.06°
 * east. Wide containers were clamped on the east edge alone, so maxBounds
 * came out narrower than the fit required AND off-centre. MapLibre then
 * zoomed in to obey it, which pushed the route east and drove its southern
 * end past the bottom of the viewport — the measured 7.9 px clip at 1366×768
 * and 1512×860.
 *
 * The cap here is applied SYMMETRICALLY about the composition centre: if one
 * side runs out of data, the other gives up the same amount, so the envelope
 * can get smaller but never lopsided. A symmetric cap is also what makes the
 * failure mode graceful — the route over-fills the height (PR 2's stated
 * preference for ultrawide) instead of sliding sideways.
 *
 * The envelope is a function of the container's FIT zoom, not the live camera
 * zoom. That is deliberate: it makes maxBounds constant for a given viewport
 * shape, so crossing an integer source-zoom boundary while panning or zooming
 * can never move the constraint underneath the camera.
 *
 * Plain ESM so tests/overview-envelope.test.mjs can fence the maths in node.
 */

/** Web-Mercator helpers (metres). Owned here; cameraBounds re-exports them. */
const R = 6378137;
export const MERC_MAX = Math.PI * R;

export const mercX = (lon) => (lon * Math.PI * R) / 180;
export const mercY = (lat) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export const invMercX = (x) => (x / (Math.PI * R)) * 180;
export const invMercY = (y) => ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI;

/** Mercator metres per CSS pixel at a zoom (MapLibre's 512px world tile). */
export const mercPerPixel = (zoom) => (2 * MERC_MAX) / (512 * Math.pow(2, zoom));

/**
 * How the shipped vector archive was built (scripts/route-configs.mjs →
 * `vectorOverview`, applied by scripts/extract-offline-map.sh). Declared here
 * because the runtime cannot import the build scripts; tests fence both the
 * agreement with route-configs.mjs AND the resulting footprints against the
 * committed archive, so this can never drift silently.
 */
export const VECTOR_OVERVIEW_BUILD = Object.freeze({
  /** Highest zoom that got the widened extract; above it the strict cutout. */
  maxZoom: 9,
  /** Extra longitude each side of mapCutoutBounds, degrees. */
  lonMarginDeg: 0.5,
});

/**
 * Lowest zoom present in the terrain and satellite archives. Their renderable
 * coverage is this level's footprint, because MapLibre falls back to an
 * ancestor raster tile when the requested child is absent.
 */
export const RASTER_ARCHIVE_MIN_ZOOM = 7;

/**
 * The tile-aligned footprint of a lon/lat box at an integer zoom — the extent
 * an extract for that box actually ends up covering, since tiles are whole.
 *
 * @param {[[number,number],[number,number]]} bounds [[w,s],[e,n]]
 * @param {number} z
 * @returns {{west:number,east:number,south:number,north:number}} degrees
 */
export function tileAlignedFootprint(bounds, z) {
  const [[w, s], [e, n]] = bounds;
  const size = Math.pow(2, z);
  const lon2t = (lon) => Math.floor(((lon + 180) / 360) * size);
  const lat2t = (lat) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * size);
  };
  const t2lon = (x) => (x / size) * 360 - 180;
  const t2lat = (y) => {
    const m = Math.PI - (2 * Math.PI * y) / size;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(m) - Math.exp(-m)));
  };
  const x0 = lon2t(w);
  const x1 = lon2t(e);
  const y0 = lat2t(n); // north edge is the SMALLER tile y
  const y1 = lat2t(s);
  return {
    west: t2lon(x0), east: t2lon(x1 + 1),
    south: t2lat(y1 + 1), north: t2lat(y0),
  };
}

/**
 * Physical vector coverage at an integer source zoom. Reproduces what the
 * build actually shipped: the widened overview box up to
 * `VECTOR_OVERVIEW_BUILD.maxZoom`, the strict cutout corridor above it.
 *
 * @param {number} sourceZoom
 * @param {[[number,number],[number,number]]} cutoutBounds
 * @param {typeof VECTOR_OVERVIEW_BUILD} [build]
 */
export function vectorSourceCoverage(sourceZoom, cutoutBounds, build = VECTOR_OVERVIEW_BUILD) {
  const [[w, s], [e, n]] = cutoutBounds;
  const box = sourceZoom <= build.maxZoom
    ? [[w - build.lonMarginDeg, s], [e + build.lonMarginDeg, n]]
    : cutoutBounds;
  return tileAlignedFootprint(box, Math.max(0, Math.floor(sourceZoom)));
}

/**
 * Renderable terrain/satellite coverage: the widest ancestor footprint those
 * archives contain. Reported, never used as a cap — see the module header.
 */
export function rasterRenderableCoverage(cutoutBounds, minZoom = RASTER_ARCHIVE_MIN_ZOOM) {
  return tileAlignedFootprint(cutoutBounds, minZoom);
}

/**
 * The fit a container and padding imply for the route, and the extent that
 * fit occupies — before any coverage is considered.
 *
 * The scale is the larger of the two axis ratios, exactly as MapLibre's own
 * fitBounds picks it, so this is the constraint maths agreeing with the fit
 * it must permit. The camera centre is offset from the route centre by half
 * the padding asymmetry, which is what puts the route in the middle of the
 * PADDED rect rather than the container.
 */
export function desiredOverviewExtent({
  routeBounds, viewportWidth, viewportHeight, padding,
}) {
  const [[rw, rs], [re, rn]] = routeBounds;
  const routeCx = (mercX(rw) + mercX(re)) / 2;
  const routeCy = (mercY(rs) + mercY(rn)) / 2;
  const routeW = mercX(re) - mercX(rw);
  const routeH = mercY(rn) - mercY(rs);

  const pt = padding?.top ?? 0, pb = padding?.bottom ?? 0;
  const pl = padding?.left ?? 0, pr = padding?.right ?? 0;
  const usableW = Math.max(1, viewportWidth - pl - pr);
  const usableH = Math.max(1, viewportHeight - pt - pb);

  const scale = Math.max(routeW / usableW, routeH / usableH);
  const mapZoom = Math.log2((2 * MERC_MAX) / (512 * scale));

  // Composition centre: the route sits at the centre of the PADDED rect.
  const centreX = routeCx - ((pl - pr) / 2) * scale;
  const centreY = routeCy + ((pt - pb) / 2) * scale;

  return {
    scale, mapZoom,
    centreX, centreY, routeCx, routeCy,
    halfWidth: (viewportWidth * scale) / 2,
    halfHeight: (viewportHeight * scale) / 2,
    bindingAxis: routeW / usableW >= routeH / usableH ? 'width' : 'height',
  };
}

/** 5 % horizontal slack so a fitted view never lands exactly on maxBounds. */
export const OVERVIEW_SLACK = 0.05;

/**
 * The safe overview maxBounds for a viewport, plus every intermediate extent
 * the decision used (so evidence and tests can inspect the reasoning rather
 * than only its conclusion).
 *
 * Returns `overviewBounds: null` when the strict interaction bounds already
 * host the fit — the common case for phones, and the reason portrait framing
 * is untouched by this module.
 */
export function overviewEnvelopeFor({
  routeBounds, userBounds, cutoutBounds,
  viewportWidth, viewportHeight, padding,
  build = VECTOR_OVERVIEW_BUILD,
  rasterMinZoom = RASTER_ARCHIVE_MIN_ZOOM,
}) {
  const [[uw, us], [ue, un]] = userBounds;
  const desired = desiredOverviewExtent({ routeBounds, viewportWidth, viewportHeight, padding });
  const { centreX, centreY, routeCx } = desired;

  const userHalfW = Math.max(routeCx - mercX(uw), mercX(ue) - routeCx);

  // Source zoom is `floor(mapZoom)` for a 512px vector source. Capping can
  // force MapLibre to zoom IN, which can cross an integer boundary onto a
  // narrower footprint, so settle it as a small fixed point rather than
  // assuming one pass. Coverage only ever narrows as zoom rises, so this
  // converges; the cap is a backstop, not an expected path.
  const want = Math.max(desired.halfWidth * (1 + OVERVIEW_SLACK), userHalfW);
  /** Coverage-capped half-width, and the zoom that width actually permits. */
  const settle = (z) => {
    const coverage = vectorSourceCoverage(z, cutoutBounds, build);
    const symHalfW = Math.min(routeCx - mercX(coverage.west), mercX(coverage.east) - routeCx);
    const halfW = Math.min(want, symHalfW);
    const permitted = halfW >= want
      ? desired.mapZoom
      : Math.log2((2 * MERC_MAX) / ((512 * (halfW / (1 + OVERVIEW_SLACK)) * 2) / viewportWidth));
    return { coverage, halfW, next: Math.floor(Math.min(desired.mapZoom, permitted) + 1e-9) };
  };

  let sourceZoom = Math.floor(desired.mapZoom);
  let settled = settle(sourceZoom);
  for (let i = 0; i < 4 && settled.next !== sourceZoom; i++) {
    sourceZoom = settled.next;
    settled = settle(sourceZoom);
  }
  // Always report the coverage and width that belong to the FINAL zoom, even
  // if the loop ran out of iterations — a mismatch there would let the
  // envelope claim coverage it did not use.
  const coverage = settled.coverage;
  const halfW = settled.halfW;

  // Vertical: symmetric about the composition centre, then never narrower
  // than the interaction bounds, then honestly capped to real coverage.
  const covS = mercY(coverage.south), covN = mercY(coverage.north);
  const symHalfH = Math.min(centreY - covS, covN - centreY);
  const halfH = Math.min(desired.halfHeight, symHalfH);
  let south = Math.min(centreY - halfH, mercY(us));
  let north = Math.max(centreY + halfH, mercY(un));
  south = Math.max(south, covS);
  north = Math.min(north, covN);

  const west = routeCx - halfW;
  const east = routeCx + halfW;

  const expandedH = halfW > userHalfW + 1e-6;
  const expandedV = south < mercY(us) - 1e-6 || north > mercY(un) + 1e-6;

  // An edge that was NOT expanded keeps its contract value exactly. Round
  // tripping it through Mercator would return 67.73499999999999 for 67.735 —
  // harmless to the camera, but it would make "this edge is untouched"
  // impossible to assert, and untouched edges are part of the contract.
  const edge = (expanded, merc, original) => (expanded ? invMercX(merc) : original);
  const edgeY = (expanded, merc, original) => (expanded ? invMercY(merc) : original);

  const raster = rasterRenderableCoverage(cutoutBounds, rasterMinZoom);
  const rasterSymHalfW = Math.min(routeCx - mercX(raster.west), mercX(raster.east) - routeCx);

  return {
    sourceZoom,
    mapZoom: desired.mapZoom,
    bindingAxis: desired.bindingAxis,
    /** The extent the fit needs, symmetric about the composition centre. */
    desiredOverview: [
      [invMercX(routeCx - desired.halfWidth), invMercY(centreY - desired.halfHeight)],
      [invMercX(routeCx + desired.halfWidth), invMercY(centreY + desired.halfHeight)],
    ],
    vectorCoverage: coverage,
    rasterCoverage: raster,
    /** Symmetric half-widths about the route centre, metres. */
    halfWidths: {
      needed: desired.halfWidth * (1 + OVERVIEW_SLACK),
      vector: Math.min(routeCx - mercX(coverage.west), mercX(coverage.east) - routeCx),
      raster: rasterSymHalfW,
      applied: halfW,
    },
    /** True when the composition needs more width than raster can shade. */
    exceedsRasterCoverage: desired.halfWidth * (1 + OVERVIEW_SLACK) > rasterSymHalfW,
    /** True when physical vector coverage forced a narrower view than the fit. */
    cappedByVector: halfW < desired.halfWidth * (1 + OVERVIEW_SLACK) - 1e-6,
    overviewBounds: expandedH || expandedV
      ? [
          [edge(expandedH, west, uw), edgeY(south < mercY(us) - 1e-6, south, us)],
          [edge(expandedH, east, ue), edgeY(north > mercY(un) + 1e-6, north, un)],
        ]
      : null,
  };
}
