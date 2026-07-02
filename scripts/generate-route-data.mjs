#!/usr/bin/env node
/**
 * GPX → route-data preprocessing.
 *
 * Parses public/gpx/kungsleden-abisko-nikkaluokta.gpx at build time and emits
 * src/generated/kungsleden-route.json so the browser never parses ~5,000 XML
 * nodes at runtime.
 *
 * GPX semantics (gpx.studio export, GPX 1.1, no timestamps):
 *   - one <trk> with EIGHT <trkseg> elements:
 *       segment index 0   = complete Abisko → Nikkaluokta overview geometry
 *       segment index 1–7 = the seven daily stages, in route order
 *     The overview and the day stages describe the SAME journey twice; they
 *     must never be concatenated or summed together.
 *   - eight <wpt> waypoints; <cmt>/<desc> hold a stable machine id
 *     (START_ABISKO, HUT_*, END_NIKKALUOKTA), <name> is the display name.
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
 * exits non-zero on hard violations so a broken GPX fails the build.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GPX_PATH = join(ROOT, 'public/gpx/kungsleden-abisko-nikkaluokta.gpx');
const OUT_PATH = join(ROOT, 'src/generated/kungsleden-route.json');

// ---- Tunables (documented above) -------------------------------------------
const SMOOTHING_WINDOW = 5; // centred moving average, ~100 m at ~20 m spacing
const NOISE_THRESHOLD_M = 2; // hysteresis: ignore accumulated changes < 2 m
const WAYPOINT_MAX_DRIFT_M = 250; // stage ends must be this close to waypoints
const MAP_BUFFER_KM = 9; // padding around route bounds for the basemap cutout

// Expected stage → waypoint-pair mapping, in route order.
const EXPECTED_STAGE_WAYPOINTS = [
  ['START_ABISKO', 'HUT_ABISKOJAURE'],
  ['HUT_ABISKOJAURE', 'HUT_ALESJAURE'],
  ['HUT_ALESJAURE', 'HUT_TJAKTJA'],
  ['HUT_TJAKTJA', 'HUT_SALKA'],
  ['HUT_SALKA', 'HUT_SINGI'],
  ['HUT_SINGI', 'HUT_KEBNEKAISE'],
  ['HUT_KEBNEKAISE', 'END_NIKKALUOKTA'],
];

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

function parseGpx(xml) {
  const waypoints = [];
  const wptRe = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"\s*>([\s\S]*?)<\/wpt>/g;
  for (const [, lat, lon, body] of xml.matchAll(wptRe)) {
    const id = tag(body, 'cmt') ?? tag(body, 'desc');
    if (!id) throw new Error(`Waypoint "${tag(body, 'name')}" has no cmt/desc id`);
    waypoints.push({
      id,
      name: tag(body, 'name') ?? id,
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

export function buildRouteData(xml) {
  const { trackName, segments, waypoints } = parseGpx(xml);
  const problems = [];
  const check = (ok, msg) => {
    if (!ok) problems.push(msg);
  };

  check(segments.length === 8, `expected 8 track segments, found ${segments.length}`);
  check(waypoints.length === 8, `expected 8 waypoints, found ${waypoints.length}`);

  const waypointById = Object.fromEntries(waypoints.map((w) => [w.id, w]));

  // Segment 0 is the overview; 1..7 are day stages. Never combined.
  const overviewPts = withCumulativeDistance(segments[0]);
  const stageSegs = segments.slice(1).map(withCumulativeDistance);

  const stages = stageSegs.map((pts, i) => {
    const [fromId, toId] = EXPECTED_STAGE_WAYPOINTS[i] ?? [null, null];
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
      id: `d${i + 1}`,
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

  check(stages.length === 7, `expected 7 stages, generated ${stages.length}`);
  check(
    diffPct < 1,
    `overview (${overviewStats.distanceKm} km) vs stage sum (${round(stageSumKm, 2)} km) differ by ${round(diffPct, 2)}% (limit 1%)`,
  );
  check(
    overviewStats.minimumElevationM != null,
    'route has no elevation data',
  );

  const routeBounds = boundsOf(overviewPts);
  check(
    routeBounds[0][0] < routeBounds[1][0] && routeBounds[0][1] < routeBounds[1][1],
    'route bounds are degenerate',
  );
  const mapCutoutBounds = padBounds(routeBounds, MAP_BUFFER_KM);

  const data = {
    sourceFile: 'public/gpx/kungsleden-abisko-nikkaluokta.gpx',
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
      routeBounds,
      mapCutoutBounds,
      smoothing: `centred moving average, window ${SMOOTHING_WINDOW} pts; hysteresis threshold ${NOISE_THRESHOLD_M} m`,
    },
  };

  return { data, problems };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const xml = readFileSync(GPX_PATH, 'utf8');
  const { data, problems } = buildRouteData(xml);

  for (const p of problems) fail(p);
  if (problems.length > 0) {
    console.error('Route data generation aborted — fix the GPX or expectations above.');
    process.exit(1);
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(data));

  const d = data.diagnostics;
  console.log('Route data generated → src/generated/kungsleden-route.json');
  console.log(`  track:            ${data.name}`);
  console.log(`  tracks/segments:  ${d.trackCount} track, ${d.segmentCount} segments (1 overview + ${data.stages.length} stages)`);
  console.log(`  waypoints:        ${d.waypointCount}`);
  console.log(`  overview:         ${data.statistics.distanceKm} km, ${d.overviewPointCount} pts`);
  data.stages.forEach((s) =>
    console.log(
      `  day ${s.day}:            ${s.statistics.distanceKm.toFixed(2)} km  (+${s.statistics.totalAscentM} m / -${s.statistics.totalDescentM} m)  ${s.fromWaypointId} → ${s.toWaypointId}`,
    ),
  );
  console.log(`  stage sum:        ${d.stageSumKm} km (diff vs overview: ${d.overviewVsStageSumDiffPct}%)`);
  console.log(`  ascent/descent:   +${data.statistics.totalAscentM} m / -${data.statistics.totalDescentM} m (overview)`);
  console.log(`  elevation range:  ${d.elevationRangeM[0]}–${d.elevationRangeM[1]} m`);
  console.log(`  route bounds:     ${JSON.stringify(d.routeBounds)}`);
  console.log(`  map cutout:       ${JSON.stringify(d.mapCutoutBounds)} (${MAP_BUFFER_KM} km buffer)`);
}
