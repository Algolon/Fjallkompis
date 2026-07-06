#!/usr/bin/env node
/**
 * GPX → route-data preprocessing.
 *
 * Parses each route GPX listed in scripts/route-configs.mjs at build time and
 * emits src/generated/<route>-route.json so the browser never parses
 * thousands of XML nodes at runtime.
 *
 * GPX semantics (gpx.studio export, GPX 1.1, no timestamps):
 *   - one <trk> with 1 + N <trkseg> elements:
 *       segment index 0     = complete overview geometry
 *       segment index 1..N  = the stages, in route order
 *     The overview and the stages describe the SAME journey twice; they
 *     must never be concatenated or summed together.
 *   - one <wpt> per stop; <cmt>/<desc> hold a stable machine id
 *     (e.g. START_ABISKO, HUT_*, END_NIKKALUOKTA), <name> is the display name.
 *   The expected segment/waypoint counts and stage↔waypoint pairs come from
 *   the per-route config (see route-configs.mjs).
 *
 * Elevation processing (documented method):
 *   - min/max elevation come from the RAW <ele> values;
 *   - total ascent/descent are computed from a smoothed profile:
 *       1. centred moving average over a 5-point window (points are spaced
 *          ~20 m apart, so the window spans ~100 m of trail);
 *       2. hysteresis accumulation with a 2 m noise threshold: an elevation
 *          change only counts once the smoothed profile has moved ≥ 2 m away
 *          from the last accepted anchor elevation. Sub-threshold jitter is
 *          ignored entirely.
 *   - raw and smoothed values are kept separate; the emitted per-point
 *     elevation is always the raw value.
 *
 * The script is deterministic: same GPX in, byte-identical JSON out.
 * It validates the parsed data (counts, distances, waypoint proximity) and
 * exits non-zero on hard violations so a broken GPX fails the build. A
 * missing GPX for an OPTIONAL route (required: false, e.g. the temporary
 * Delft pilot) is not an error: a deterministic { available: false } stub is
 * written instead so the normal build never depends on pilot assets.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_CONFIGS, KUNGSLEDEN_CONFIG } from './route-configs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- Tunables (documented above) -------------------------------------------
const SMOOTHING_WINDOW = 5; // centred moving average, ~100 m at ~20 m spacing
const NOISE_THRESHOLD_M = 2; // hysteresis: ignore accumulated changes < 2 m
const WAYPOINT_MAX_DRIFT_M = 250; // stage ends must be this close to waypoints
// Median spacing above which along-route GPS projection starts to feel coarse.
const SPACING_WARN_M = 60;

// ---- Minimal GPX parsing ----------------------------------------------------
// Node has no DOMParser; this GPX comes from a single known exporter
// (gpx.studio), so a small deterministic regex parser is sufficient and keeps
// the pipeline dependency-free. It intentionally fails loudly on surprises.

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1].trim()) : null;
};

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseGpx(xml, nameOverrides = {}) {
  const waypoints = [];
  const wptRe = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"\s*>([\s\S]*?)<\/wpt>/g;
  for (const [, lat, lon, body] of xml.matchAll(wptRe)) {
    const id = tag(body, 'cmt') ?? tag(body, 'desc');
    if (!id) throw new Error(`Waypoint "${tag(body, 'name')}" has no cmt/desc id`);
    waypoints.push({
      id,
      name: nameOverrides[id] ?? tag(body, 'name') ?? id,
      description: tag(body, 'desc') ?? undefined,
      symbol: tag(body, 'sym') ?? undefined,
      lat: Number(lat),
      lon: Number(lon),
      elevation: tag(body, 'ele') != null ? Number(tag(body, 'ele')) : null,
    });
  }

  const tracks = [...xml.matchAll(/<trk>([\s\S]*?)<\/trk>/g)];
  if (tracks.length !== 1) throw new Error(`Expected 1 track, found ${tracks.length}`);
  const trackBody = tracks[0][1];
  const trackName = tag(trackBody, 'name') ?? 'Unnamed track';

  const segments = [];
  for (const [, segBody] of trackBody.matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)) {
    const pts = [];
    const ptRe = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"\s*>([\s\S]*?)<\/trkpt>/g;
    for (const [, lat, lon, body] of segBody.matchAll(ptRe)) {
      const ele = tag(body, 'ele');
      pts.push({ lat: Number(lat), lon: Number(lon), ele: ele != null ? Number(ele) : null });
    }
    segments.push(pts);
  }

  if (/<time>/.test(xml)) {
    console.warn('WARN: GPX contains <time> data; this pipeline ignores it.');
  }

  return { trackName, segments, waypoints };
}

// ---- Geometry ---------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** points → same array annotated with cumulative km from the segment start. */
function withCumulativeDistance(points) {
  let cum = 0;
  return points.map((p, i) => {
    if (i > 0) cum += haversineKm(points[i - 1], p);
    return { ...p, cumKm: cum };
  });
}

/** Centred moving average of the elevation series (window must be odd). */
export function smoothElevation(elevations, window = SMOOTHING_WINDOW) {
  const half = Math.floor(window / 2);
  return elevations.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(elevations.length - 1, i + half); j++) {
      if (elevations[j] != null) {
        sum += elevations[j];
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  });
}

/** Hysteresis ascent/descent: only count moves ≥ threshold from the anchor. */
export function ascentDescent(smoothed, thresholdM = NOISE_THRESHOLD_M) {
  let ascent = 0;
  let descent = 0;
  let anchor = null;
  for (const ele of smoothed) {
    if (ele == null) continue;
    if (anchor == null) {
      anchor = ele;
      continue;
    }
    const delta = ele - anchor;
    if (delta >= thresholdM) {
      ascent += delta;
      anchor = ele;
    } else if (delta <= -thresholdM) {
      descent += -delta;
      anchor = ele;
    }
  }
  return { ascent, descent };
}

function statistics(points) {
  const rawEles = points.map((p) => p.ele).filter((e) => e != null);
  const smoothed = smoothElevation(points.map((p) => p.ele));
  const { ascent, descent } = ascentDescent(smoothed);
  return {
    distanceKm: round(points.at(-1).cumKm, 3),
    minimumElevationM: rawEles.length ? round(Math.min(...rawEles), 1) : null,
    maximumElevationM: rawEles.length ? round(Math.max(...rawEles), 1) : null,
    totalAscentM: rawEles.length ? Math.round(ascent) : null,
    totalDescentM: rawEles.length ? Math.round(descent) : null,
  };
}

/** [[west, south], [east, north]] */
function boundsOf(points) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  return [[round(minLon, 6), round(minLat, 6)], [round(maxLon, 6), round(maxLat, 6)]];
}

function padBounds([[w, s], [e, n]], bufferKm) {
  const dLat = bufferKm / 111.32;
  const midLat = (s + n) / 2;
  const dLon = bufferKm / (111.32 * Math.cos(toRad(midLat)));
  return [[round(w - dLon, 4), round(s - dLat, 4)], [round(e + dLon, 4), round(n + dLat, 4)]];
}

const round = (n, d) => Number(n.toFixed(d));

/** Compact point encoding: [lat, lon, elevation|null, cumulativeKm]. */
const encodePoints = (points) =>
  points.map((p) => [
    round(p.lat, 6),
    round(p.lon, 6),
    p.ele != null ? round(p.ele, 1) : null,
    round(p.cumKm, 4),
  ]);

// ---- Main -------------------------------------------------------------------

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

export function buildRouteData(xml, config = KUNGSLEDEN_CONFIG) {
  const { trackName, segments, waypoints } = parseGpx(xml, config.nameOverrides);
  const problems = [];
  const check = (ok, msg) => {
    if (!ok) problems.push(msg);
  };

  check(
    segments.length === config.expectedSegments,
    `expected ${config.expectedSegments} track segments, found ${segments.length}`,
  );
  check(
    waypoints.length === config.expectedWaypoints,
    `expected ${config.expectedWaypoints} waypoints, found ${waypoints.length}`,
  );

  const waypointById = Object.fromEntries(waypoints.map((w) => [w.id, w]));

  // A track without at least an overview + one stage cannot be processed at
  // all — report cleanly instead of crashing on segments[0].
  if (segments.length < 2 || segments.some((s) => s.length < 2)) {
    problems.push('track needs ≥ 2 segments with ≥ 2 points each (overview + stages)');
    return { data: null, problems };
  }

  // Segment 0 is the overview; 1..N are the stages. Never combined.
  const overviewPts = withCumulativeDistance(segments[0]);
  const stageSegs = segments.slice(1).map(withCumulativeDistance);

  const stages = stageSegs.map((pts, i) => {
    const [fromId, toId] = config.stageWaypoints[i] ?? [null, null];
    const from = waypointById[fromId];
    const to = waypointById[toId];
    check(!!from && !!to, `stage ${i + 1}: missing expected waypoint ${fromId}/${toId}`);

    if (from && to) {
      const startDrift = haversineKm(pts[0], from) * 1000;
      const endDrift = haversineKm(pts.at(-1), to) * 1000;
      if (startDrift > WAYPOINT_MAX_DRIFT_M) {
        console.warn(
          `WARN: stage ${i + 1} starts ${Math.round(startDrift)} m from ${fromId} (limit ${WAYPOINT_MAX_DRIFT_M} m)`,
        );
      }
      if (endDrift > WAYPOINT_MAX_DRIFT_M) {
        console.warn(
          `WARN: stage ${i + 1} ends ${Math.round(endDrift)} m from ${toId} (limit ${WAYPOINT_MAX_DRIFT_M} m)`,
        );
      }
    }

    return {
      id: `${config.stageIdPrefix}${i + 1}`,
      day: i + 1,
      fromWaypointId: fromId,
      toWaypointId: toId,
      points: encodePoints(pts),
      bounds: boundsOf(pts),
      statistics: statistics(pts),
    };
  });

  const overviewStats = statistics(overviewPts);
  const stageSumKm = stages.reduce((s, st) => s + st.statistics.distanceKm, 0);
  const diffPct = Math.abs(overviewStats.distanceKm - stageSumKm) / overviewStats.distanceKm * 100;

  check(
    stages.length === config.stageWaypoints.length,
    `expected ${config.stageWaypoints.length} stages, generated ${stages.length}`,
  );
  check(
    diffPct < 1,
    `overview (${overviewStats.distanceKm} km) vs stage sum (${round(stageSumKm, 2)} km) differ by ${round(diffPct, 2)}% (limit 1%)`,
  );
  if (config.requireElevation) {
    check(
      overviewStats.minimumElevationM != null,
      'route has no elevation data',
    );
  }

  // Along-route GPS projection interpolates between points; warn (not fail)
  // when the geometry is sampled too coarsely for a smooth readout.
  const spacings = overviewPts
    .slice(1)
    .map((p, i) => (p.cumKm - overviewPts[i].cumKm) * 1000)
    .sort((a, b) => a - b);
  const medianSpacingM = spacings.length
    ? spacings[Math.floor(spacings.length / 2)]
    : 0;
  if (medianSpacingM > SPACING_WARN_M) {
    console.warn(
      `WARN: ${config.id}: median point spacing ${Math.round(medianSpacingM)} m > ${SPACING_WARN_M} m — GPS projection will feel coarse; export the GPX with more track points.`,
    );
  }

  const routeBounds = boundsOf(overviewPts);
  check(
    routeBounds[0][0] < routeBounds[1][0] && routeBounds[0][1] < routeBounds[1][1],
    'route bounds are degenerate',
  );
  const mapCutoutBounds = padBounds(routeBounds, config.mapBufferKm);

  const data = {
    sourceFile: config.gpxPath,
    sourceSha256: createHash('sha256').update(xml).digest('hex'),
    name: trackName,
    // Encoding notes for consumers:
    //  - points: [lat, lon, elevationM|null, cumulativeDistanceKm]
    //  - bounds: [[west, south], [east, north]] (MapLibre LngLatBoundsLike)
    pointEncoding: ['lat', 'lon', 'elevationM', 'cumulativeDistanceKm'],
    waypoints: waypoints.map((w) => ({
      ...w,
      lat: round(w.lat, 6),
      lon: round(w.lon, 6),
      elevation: w.elevation != null ? round(w.elevation, 1) : null,
    })),
    overview: {
      points: encodePoints(overviewPts),
      bounds: routeBounds,
      statistics: overviewStats,
    },
    stages,
    bounds: routeBounds,
    statistics: overviewStats,
    mapCutoutBounds,
    diagnostics: {
      trackCount: 1,
      segmentCount: segments.length,
      waypointCount: waypoints.length,
      overviewPointCount: overviewPts.length,
      stagePointCounts: stageSegs.map((s) => s.length),
      stageDistancesKm: stages.map((s) => s.statistics.distanceKm),
      stageSumKm: round(stageSumKm, 3),
      overviewVsStageSumDiffPct: round(diffPct, 3),
      elevationRangeM: [overviewStats.minimumElevationM, overviewStats.maximumElevationM],
      medianPointSpacingM: round(medianSpacingM, 1),
      routeBounds,
      mapCutoutBounds,
      smoothing: `centred moving average, window ${SMOOTHING_WINDOW} pts; hysteresis threshold ${NOISE_THRESHOLD_M} m`,
    },
  };

  return { data, problems };
}

/**
 * Deterministic stub written for an optional route whose GPX does not exist
 * yet. The app treats { available: false } as "dataset not generated" and the
 * pilot UI explains what is missing instead of rendering a route.
 */
export function buildMissingRouteStub(config) {
  return {
    available: false,
    routeId: config.id,
    note: `Source GPX ${config.gpxPath} not present when generate-route-data.mjs ran.`,
  };
}

function generateRoute(config) {
  const gpxAbs = join(ROOT, config.gpxPath);
  const outAbs = join(ROOT, config.outputPath);
  mkdirSync(dirname(outAbs), { recursive: true });

  if (!existsSync(gpxAbs)) {
    if (config.required) {
      fail(`${config.id}: required GPX ${config.gpxPath} is missing`);
      return false;
    }
    writeFileSync(outAbs, JSON.stringify(buildMissingRouteStub(config)));
    console.log(
      `Route "${config.id}": GPX not present (${config.gpxPath}) — wrote { available: false } stub → ${config.outputPath}`,
    );
    return true;
  }

  const xml = readFileSync(gpxAbs, 'utf8');
  const { data, problems } = buildRouteData(xml, config);

  for (const p of problems) fail(`${config.id}: ${p}`);
  if (problems.length > 0) return false;

  writeFileSync(outAbs, JSON.stringify(data));

  const d = data.diagnostics;
  console.log(`Route data generated → ${config.outputPath}`);
  console.log(`  track:            ${data.name}`);
  console.log(`  tracks/segments:  ${d.trackCount} track, ${d.segmentCount} segments (1 overview + ${data.stages.length} stages)`);
  console.log(`  waypoints:        ${d.waypointCount}`);
  console.log(`  overview:         ${data.statistics.distanceKm} km, ${d.overviewPointCount} pts`);
  data.stages.forEach((s) =>
    console.log(
      `  stage ${s.id}:         ${s.statistics.distanceKm.toFixed(2)} km  (+${s.statistics.totalAscentM ?? '—'} m / -${s.statistics.totalDescentM ?? '—'} m)  ${s.fromWaypointId} → ${s.toWaypointId}`,
    ),
  );
  console.log(`  stage sum:        ${d.stageSumKm} km (diff vs overview: ${d.overviewVsStageSumDiffPct}%)`);
  console.log(`  ascent/descent:   +${data.statistics.totalAscentM ?? '—'} m / -${data.statistics.totalDescentM ?? '—'} m (overview)`);
  console.log(`  elevation range:  ${d.elevationRangeM[0] ?? '—'}–${d.elevationRangeM[1] ?? '—'} m`);
  console.log(`  route bounds:     ${JSON.stringify(d.routeBounds)}`);
  console.log(`  map cutout:       ${JSON.stringify(d.mapCutoutBounds)} (${config.mapBufferKm} km buffer)`);
  return true;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  let ok = true;
  for (const config of ROUTE_CONFIGS) {
    ok = generateRoute(config) && ok;
    console.log();
  }
  if (!ok) {
    console.error('Route data generation aborted — fix the GPX or expectations above.');
    process.exit(1);
  }
}
