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
 *  5. PHYSICAL RASTER COVERAGE AT THE EFFECTIVE SOURCE ZOOM — where every
 *     requested raster child tile actually exists. Terrain hillshade cannot
 *     rely on a lower-zoom DEM ancestor when MapLibre requests a missing
 *     child: the vector map survives underneath, but relief stops at that
 *     child's rectangular edge. Satellite v4 happens to carry the complete
 *     descendant pyramid; Terrain v4 widens only the source zooms reachable
 *     while overview expansion is active. In Terrain mode this is a HARD
 *     camera constraint because an unshaded flank is not acceptable.
 *
 * The route centre is therefore a PREFERENCE, not a guarantee. Raster runs
 * 1.7536° west of the route centre but only 1.0589° east, so a landscape
 * viewport wide enough for the whole route cannot be centred on it and stay
 * shaded. The camera is solved as a constrained fit instead: take the
 * symmetric route-centred viewport, and if it overhangs a raster edge,
 * TRANSLATE it back inside at unchanged zoom, landing on the feasible centre
 * closest to the desired one. Only when the viewport is wider than the
 * envelope itself — above roughly 2:1 — is the zoom raised, and then the
 * route over-fills vertically rather than the map going unshaded.
 *
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
 * Lowest zoom present in the terrain and satellite archives.
 */
export const RASTER_ARCHIVE_MIN_ZOOM = 7;

/**
 * Highest Terrain source zoom that a supported expanded overview can request.
 * The 3440×1440 regression viewport settles at displayed z9.77; MapLibre's
 * 256 px raster source rounds z+1 and therefore requests z11. At z12 the map
 * is already back inside normal interaction bounds, so widening z12 would add
 * hundreds of high-resolution DEM tiles that no supported expanded camera
 * can see.
 */
export const TERRAIN_OVERVIEW_MAX_SOURCE_ZOOM = 11;
export const TERRAIN_ARCHIVE_MAX_ZOOM = 12;
export const SATELLITE_ARCHIVE_MAX_ZOOM = 13;

/**
 * Highest satellite source zoom that carries the COMPLETE z7 overview
 * footprint (the Sentinel-2 pyramid). Zooms above it — the Lantmäteriet
 * orthophoto detail corridor of the hybrid build — cover only the compact
 * tile-aligned cutout, exactly like terrain's z12. While
 * SATELLITE_ARCHIVE_MAX_ZOOM equals this value (the shipped all-Sentinel
 * archive) the corridor branch is unreachable and the envelope is unchanged;
 * a hybrid rebuild raises SATELLITE_ARCHIVE_MAX_ZOOM together with the
 * catalog revision and this split takes effect.
 */
export const SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM = 13;

/**
 * First zoom of the orthophoto detail corridor. The hybrid build tile-aligns
 * the corridor at THIS zoom, so every detail zoom (this one and its
 * children) is the same fully data-covered rectangle — which is why the
 * coverage claim below uses this alignment for every detail source zoom
 * rather than re-aligning per zoom.
 */
export const SATELLITE_DETAIL_MIN_ZOOM = SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM + 1;

export const RASTER_SOURCE_TILE_SIZE = 256;
export const MAPLIBRE_WORLD_TILE_SIZE = 512;

/** Exact MapLibre raster source-zoom rule (`roundZoom` is true for raster). */
export function rasterSourceZoomForDisplayZoom(
  displayZoom,
  tileSize = RASTER_SOURCE_TILE_SIZE,
  maxZoom = Number.POSITIVE_INFINITY,
) {
  return Math.min(maxZoom, Math.max(0, Math.round(
    displayZoom + Math.log2(MAPLIBRE_WORLD_TILE_SIZE / tileSize),
  )));
}

export function terrainUsesOverviewCoverage(displayZoom) {
  return rasterSourceZoomForDisplayZoom(
    displayZoom,
    RASTER_SOURCE_TILE_SIZE,
    TERRAIN_ARCHIVE_MAX_ZOOM,
  ) <= TERRAIN_OVERVIEW_MAX_SOURCE_ZOOM;
}

/**
 * Hidden raster sampling/gesture margin. A maxBounds edge is reachable, so an
 * envelope equal to the last data pixel lets bilinear sampling and transient
 * touch movement reveal the physical archive edge. The archive remains wider;
 * only this inset is offered as supported camera coverage.
 */
export const RASTER_EDGE_SAFETY_METRES = 2000;

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

/** The z7 overview footprint shared by the raster archive build contracts. */
export function rasterRenderableCoverage(cutoutBounds, minZoom = RASTER_ARCHIVE_MIN_ZOOM) {
  return tileAlignedFootprint(cutoutBounds, minZoom);
}

/**
 * Physical Terrain v4 footprint at one source zoom. Wide low zooms contain
 * every descendant of the z7 overview tile; high-resolution z12 returns to
 * the compact cutout corridor used by normal interaction.
 */
export function terrainSourceCoverage(sourceZoom, cutoutBounds) {
  if (sourceZoom <= TERRAIN_OVERVIEW_MAX_SOURCE_ZOOM) {
    return rasterRenderableCoverage(cutoutBounds, RASTER_ARCHIVE_MIN_ZOOM);
  }
  return tileAlignedFootprint(cutoutBounds, sourceZoom);
}

/**
 * Physical satellite footprint at one source zoom. The Sentinel-2 zooms
 * (through SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM) contain every descendant of
 * the z7 overview tile; the orthophoto detail zooms above them return to the
 * compact tile-aligned cutout corridor — the same shape terrain takes at z12.
 */
export function satelliteSourceCoverage(sourceZoom, cutoutBounds) {
  if (sourceZoom <= SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM) {
    return rasterRenderableCoverage(cutoutBounds, RASTER_ARCHIVE_MIN_ZOOM);
  }
  return tileAlignedFootprint(cutoutBounds, SATELLITE_DETAIL_MIN_ZOOM);
}

function insetRasterCoverage(physical, safetyMetres = RASTER_EDGE_SAFETY_METRES) {
  return {
    west: invMercX(mercX(physical.west) + safetyMetres),
    east: invMercX(mercX(physical.east) - safetyMetres),
    south: invMercY(mercY(physical.south) + safetyMetres),
    north: invMercY(mercY(physical.north) - safetyMetres),
  };
}

/** Renderable raster coverage with a real-data margin on all four edges. */
export function rasterInteractionCoverage(
  cutoutBounds,
  minZoom = RASTER_ARCHIVE_MIN_ZOOM,
  safetyMetres = RASTER_EDGE_SAFETY_METRES,
) {
  const physical = rasterRenderableCoverage(cutoutBounds, minZoom);
  return insetRasterCoverage(physical, safetyMetres);
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

/**
 * Which renderable envelope constrains the camera, per basemap mode.
 *
 * Evaluated independently even though terrain and satellite currently share a
 * footprint: they are separate archives on separate release pins, and a future
 * rebuild of one must not silently widen the other's contract.
 *
 * `vector` is the fallback used only when the active mode has no raster at all
 * (relief genuinely unavailable) — there the vector footprint is the only
 * thing that can go blank, so it is the only thing that binds.
 */
export function coverageForMode(
  mode,
  cutoutBounds,
  build = VECTOR_OVERVIEW_BUILD,
  displayZoom = RASTER_ARCHIVE_MIN_ZOOM,
) {
  const sourceZoom = rasterSourceZoomForDisplayZoom(
    displayZoom,
    RASTER_SOURCE_TILE_SIZE,
    mode === 'satellite' ? SATELLITE_ARCHIVE_MAX_ZOOM : TERRAIN_ARCHIVE_MAX_ZOOM,
  );
  if (mode === 'terrain') {
    return insetRasterCoverage(terrainSourceCoverage(sourceZoom, cutoutBounds));
  }
  if (mode === 'satellite') {
    return insetRasterCoverage(satelliteSourceCoverage(sourceZoom, cutoutBounds));
  }
  // Vector-only: the widest overview footprint the archive actually carries.
  return vectorSourceCoverage(build.maxZoom, cutoutBounds, build);
}

/**
 * THE CAMERA. A constrained fit, solved once — never a fit followed by a
 * nudge, and never a correction loop.
 *
 *   1. the desired viewport: symmetric, route-centred, at the fit's own zoom;
 *   2. the renderable envelope for the active mode;
 *   3. if the desired viewport overhangs an envelope edge, TRANSLATE it back
 *      inside at unchanged zoom — clamping the centre is exactly "the
 *      feasible centre closest to the desired one", since the feasible set is
 *      the interval [envWest + halfWidth, envEast − halfWidth];
 *   4. only if the viewport is WIDER than the envelope (no translation can
 *      fit it) is the zoom raised, to the coarsest scale that does fit; the
 *      route then over-fills vertically, which is the stated preference above
 *      the supported aspect contract.
 *
 * Returns the exact camera so the caller can apply it in ONE move, plus the
 * measurements the framing evidence has to report.
 */
export function overviewCameraFor({
  routeBounds, userBounds, cutoutBounds,
  viewportWidth, viewportHeight, padding,
  mode = 'terrain',
  build = VECTOR_OVERVIEW_BUILD,
}) {
  const desired = desiredOverviewExtent({ routeBounds, viewportWidth, viewportHeight, padding });
  const cov = coverageForMode(mode, cutoutBounds, build, desired.mapZoom);
  const [cw, ce] = [mercX(cov.west), mercX(cov.east)];
  const [cs, cn] = [mercY(cov.south), mercY(cov.north)];

  // 4. Raise the zoom only when the viewport cannot fit however it is moved.
  const fitScale = Math.min(
    desired.scale,
    (ce - cw) / viewportWidth,
    (cn - cs) / viewportHeight,
  );
  const zoomRaised = fitScale < desired.scale - 1e-9;
  const scale = fitScale;
  const halfW = (viewportWidth * scale) / 2;
  const halfH = (viewportHeight * scale) / 2;

  // The desired centre, re-expressed at the (possibly raised) zoom: the route
  // still wants to sit at the padded rect's centre.
  const pt = padding?.top ?? 0, pb = padding?.bottom ?? 0;
  const pl = padding?.left ?? 0, pr = padding?.right ?? 0;
  const wantX = desired.routeCx - ((pl - pr) / 2) * scale;
  const wantY = desired.routeCy + ((pt - pb) / 2) * scale;

  // 3. Closest feasible centre: clamp into the feasible interval. When the
  // viewport exactly fills the envelope the interval collapses to a point.
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
  const centreX = clamp(wantX, cw + halfW, ce - halfW);
  const centreY = clamp(wantY, cs + halfH, cn - halfH);

  const zoom = Math.log2((2 * MERC_MAX) / (512 * scale));
  const visible = [
    [invMercX(centreX - halfW), invMercY(centreY - halfH)],
    [invMercX(centreX + halfW), invMercY(centreY + halfH)],
  ];

  // What the route does inside that viewport, in CSS pixels.
  const [[rw, rs], [re, rn]] = routeBounds;
  const px = (m) => m / scale;
  const routeClear = {
    left: px(mercX(rw) - (centreX - halfW)),
    right: px((centreX + halfW) - mercX(re)),
    top: px((centreY + halfH) - mercY(rn)),
    bottom: px(mercY(rs) - (centreY - halfH)),
  };
  const endpointsOutside = Object.entries(routeClear)
    .filter(([, v]) => v < 0)
    .map(([edge, v]) => ({ edge, px: +(-v).toFixed(1) }));

  return {
    mode,
    coverage: cov,
    /** The camera to apply, in one move. */
    camera: { lng: invMercX(centreX), lat: invMercY(centreY), zoom },
    desiredCamera: {
      lng: invMercX(wantX), lat: invMercY(wantY), zoom: desired.mapZoom,
    },
    /** How far the applied centre had to move, in CSS pixels at this zoom. */
    centreDeviationPx: { x: +px(centreX - wantX).toFixed(1), y: +px(centreY - wantY).toFixed(1) },
    zoomRaised,
    zoomDelta: +(zoom - desired.mapZoom).toFixed(4),
    sourceZoom: mode === 'terrain' || mode === 'satellite'
      ? rasterSourceZoomForDisplayZoom(
        zoom,
        RASTER_SOURCE_TILE_SIZE,
        mode === 'satellite' ? SATELLITE_ARCHIVE_MAX_ZOOM : TERRAIN_ARCHIVE_MAX_ZOOM,
      )
      : Math.floor(zoom),
    scale,
    visibleExtent: visible,
    routeClearancePx: {
      left: +routeClear.left.toFixed(1), right: +routeClear.right.toFixed(1),
      top: +routeClear.top.toFixed(1), bottom: +routeClear.bottom.toFixed(1),
    },
    /** Non-empty only above the supported aspect contract. */
    endpointsOutside,
    routeComplete: endpointsOutside.length === 0,
    /** maxBounds for the overview: the envelope itself, so panning stays shaded. */
    overviewBounds: [[cov.west, cov.south], [cov.east, cov.north]],
  };
}
