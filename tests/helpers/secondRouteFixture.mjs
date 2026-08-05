/**
 * TEST-ONLY second-route fixture — the falsification harness for the vNext
 * multi-trail architecture boundary. Nothing here is imported by `src/`, ships
 * in a bundle, or runs at app runtime.
 *
 * WHAT THIS IS
 * ------------
 * A second, deliberately DIFFERENT real route placed beside Kungsleden so the
 * architecture can be tested rather than argued about: different latitude
 * (52°N vs 68°N), different scale (~3 km vs ~105 km), different segment split,
 * flat instead of alpine, and — crucially — no STF hut model behind its
 * endpoints.
 *
 * PROVENANCE (see ../fixtures/second-route/provenance.json)
 * --------------------------------------------------------
 * `delft-pilot.gpx` is restored VERBATIM from this repository's own history
 * (`git show 4ada992^:public/gpx/delft-pilot.gpx`, blob f989da6). It is the
 * real Delft pilot route: drawn in gpx.studio with the WALKING ROUTING profile
 * — so its geometry follows real OSM-mapped pavements, which is why its track
 * points still carry OSM way tags (`<highway>residential</highway>`,
 * `<surface>paving_stones</surface>`) — and then physically field-walked on
 * 2026-07-07 (docs/pilot-results/delft-2026-07-07-summary.md at that commit).
 * No coordinate in it was invented by this probe, and the restored bytes are
 * hash-checked against the historical blob by the probe tests.
 *
 * THE ONE DERIVATION, AND WHY IT IS NOT INVENTED GEOMETRY
 * ------------------------------------------------------
 * The historical pilot was a SINGLE-stage route (2 segments: overview + one
 * stage), which cannot exercise stage ordering, multi-leg days or reversal.
 * `deriveMultiStageGpx()` therefore splits the stage polyline into three
 * stages IN MEMORY, at existing track-point indices, and places the two new
 * intermediate waypoints at those exact existing coordinates. Every lat/lon
 * stays byte-equal to the historical file; only the segment/waypoint framing
 * is derived. The committed fixture on disk is never rewritten.
 *
 * THE DELIBERATE ID COLLISION
 * ---------------------------
 * The historical `DELFT_PILOT_CONFIG` used `stageIdPrefix: 'p'` with the
 * comment "never 'd', so pilot stage ids can never collide with the persisted
 * Kungsleden stage ids (d1..d7)". That AVOIDED the collision instead of
 * solving it. This probe uses `'d'` on purpose, so the collision the original
 * design side-stepped becomes observable (hypothesis H4).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRouteData } from '../../scripts/generate-route-data.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const FIXTURE_DIR = join(HERE, '..', 'fixtures', 'second-route');
export const FIXTURE_GPX_PATH = join(FIXTURE_DIR, 'delft-pilot.gpx');
export const PROVENANCE_PATH = join(FIXTURE_DIR, 'provenance.json');

/** The historical blob this fixture must stay byte-identical to. */
export const HISTORICAL_GPX_SHA256 =
  'e1d41fb2f4397718c4e30e4c9195b3b7a022eaa087564afe68bd6df42df345c3';

export const readFixtureGpx = () => readFileSync(FIXTURE_GPX_PATH, 'utf8');
export const readProvenance = () => JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---- GPX derivation ---------------------------------------------------------

const TRKSEG_RE = /<trkseg>([\s\S]*?)<\/trkseg>/g;
const TRKPT_RE = /<trkpt\s+lat="(-?[\d.]+)"\s+lon="(-?[\d.]+)"[\s\S]*?<\/trkpt>/g;

/** Every `<trkseg>` body in document order. */
function trackSegments(xml) {
  return [...xml.matchAll(TRKSEG_RE)].map((m) => m[1]);
}

/** Raw `<trkpt>` blocks of a segment body, with their parsed lat/lon. */
function trackPoints(segmentBody) {
  return [...segmentBody.matchAll(TRKPT_RE)].map((m) => ({
    xml: m[0],
    lat: Number(m[1]),
    lon: Number(m[2]),
  }));
}

/**
 * Derive a multi-stage GPX from the single-stage historical pilot.
 *
 * Segment 0 (the overview) is reused verbatim. The stage segment is cut at
 * `splitAt` track-point indices into N stages that SHARE their boundary points
 * (stage k ends exactly where stage k+1 begins), mirroring how Kungsleden
 * stages meet at a hut. Waypoints are emitted in route order, with the two
 * historical endpoint waypoints kept exactly as they were.
 *
 * @returns {{ xml: string, waypointIds: string[], splitCoordinates: Array<{lat:number,lon:number}> }}
 */
export function deriveMultiStageGpx(xml = readFixtureGpx(), splitAt = [27, 54]) {
  const segments = trackSegments(xml);
  if (segments.length !== 2) {
    throw new Error(`fixture must have 2 segments (overview + stage), found ${segments.length}`);
  }
  const [overviewBody, stageBody] = segments;
  const points = trackPoints(stageBody);

  const cuts = [0, ...splitAt, points.length - 1];
  const stageBodies = [];
  const splitCoordinates = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const slice = points.slice(cuts[i], cuts[i + 1] + 1);
    stageBodies.push(slice.map((p) => p.xml).join('\n      '));
    if (i > 0) splitCoordinates.push({ lat: points[cuts[i]].lat, lon: points[cuts[i]].lon });
  }

  // Waypoints in ROUTE ORDER. START/END keep the historical coordinates; the
  // intermediate ones sit exactly on existing track points.
  const start = points[0];
  const end = points[points.length - 1];
  const waypointIds = [
    'START_DELFT',
    ...splitCoordinates.map((_, i) => `VIA_DELFT_${i + 1}`),
    'END_DELFT',
  ];
  const wptCoords = [start, ...splitCoordinates, end];
  const wpts = waypointIds
    .map(
      (id, i) =>
        `  <wpt lat="${wptCoords[i].lat}" lon="${wptCoords[i].lon}">\n` +
        `    <ele>0</ele>\n    <name>${id}</name>\n    <cmt>${id}</cmt>\n  </wpt>`,
    )
    .join('\n');

  const derived =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx creator="fjallkompis-second-route-probe (derived from gpx.studio)" version="1.1" ` +
    `xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata><name>Delft probe route</name></metadata>\n` +
    `${wpts}\n` +
    `  <trk><name>Delft probe route</name>\n` +
    `    <trkseg>\n      ${trackPoints(overviewBody).map((p) => p.xml).join('\n      ')}\n    </trkseg>\n` +
    stageBodies.map((b) => `    <trkseg>\n      ${b}\n    </trkseg>\n`).join('') +
    `  </trk>\n</gpx>\n`;

  return { xml: derived, waypointIds, splitCoordinates };
}

// ---- Test-only route config -------------------------------------------------

/**
 * A route config in the CURRENT `scripts/route-configs.mjs` shape, for the
 * probe route. Deliberately `stageIdPrefix: 'd'` — see the header note.
 *
 * NOTE: the historical Delft entry used `mapBufferKm`, a field the manifest no
 * longer has (it became `userBufferKm` + `dataMarginKm`). That drift, in a
 * manifest documented as multi-route, is itself a probe finding.
 */
export const PROBE_ROUTE_CONFIG = {
  id: 'delft-probe',
  gpxPath: 'tests/fixtures/second-route/delft-pilot.gpx',
  outputPath: '(probe: never written)',
  pmtilesPath: '(probe: never built)',
  required: false,
  expectedSegments: 4, // 1 overview + 3 stages
  expectedWaypoints: 4,
  stageWaypoints: [
    ['START_DELFT', 'VIA_DELFT_1'],
    ['VIA_DELFT_1', 'VIA_DELFT_2'],
    ['VIA_DELFT_2', 'END_DELFT'],
  ],
  // Deliberate collision with Kungsleden's d1..d7 (see header).
  stageIdPrefix: 'd',
  // Delft is flat: the GPX carries <ele>0</ele>, so elevation exists but is
  // degenerate. A second trail must not be forced to have alpine relief.
  requireElevation: false,
  // Small-route coverage: a 3 km walk does not want Kungsleden's 12 km buffer.
  userBufferKm: 1,
  dataMarginKm: 0.5,
  nameOverrides: {
    START_DELFT: 'Delft probe start',
    VIA_DELFT_1: 'Delft probe via 1',
    VIA_DELFT_2: 'Delft probe via 2',
    END_DELFT: 'Delft probe finish',
  },
};

/** Fixture-local waypoint → place id map (the probe's own, tiny taxonomy). */
export const PROBE_WAYPOINT_TO_PLACE = {
  START_DELFT: 'start',
  VIA_DELFT_1: 'via-1',
  VIA_DELFT_2: 'via-2',
  END_DELFT: 'finish',
};

/** Build the probe route through the REAL generator. No copied algorithms. */
export function buildProbeRoute(splitAt = [27, 54]) {
  const { xml, waypointIds, splitCoordinates } = deriveMultiStageGpx(readFixtureGpx(), splitAt);
  const { data, problems } = buildRouteData(xml, PROBE_ROUTE_CONFIG);
  return { data, problems, derivedXml: xml, waypointIds, splitCoordinates };
}

// ---- Minimal hydration adapter ---------------------------------------------

/**
 * Shape adapter: generated packed points → the `ParsedRoute` shape
 * `src/route/itinerary.mjs` consumes.
 *
 * This exists ONLY because the real hydration (`src/route/hydrate.ts`) is
 * TypeScript and therefore unreachable from `node --test`, which is the layer
 * every pure module in this repo is tested at. It is a ~20-line field rename,
 * not a reimplementation: all distances, statistics, bounds and elevation come
 * from `buildRouteData` untouched. That `hydrate.ts` is already generic (its
 * own docstring says it is shared by Kungsleden AND the Delft pilot) is
 * recorded as H1/H7 evidence, not re-proven here.
 */
const unpack = (pts) =>
  pts.map(([lat, lon, elevation, cumulativeDistanceKm]) => ({
    lat,
    lon,
    elevation,
    cumulativeDistanceKm,
  }));

const toLineString = (points, properties) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) },
});

const toProfile = (points) =>
  points
    .filter((p) => p.elevation != null)
    .map((p) => ({
      distanceKm: p.cumulativeDistanceKm,
      elevationM: p.elevation,
      lat: p.lat,
      lon: p.lon,
    }));

export function hydrateGenerated(raw) {
  const overviewPoints = unpack(raw.overview.points);
  return {
    name: raw.name,
    overviewPoints,
    overviewGeoJson: toLineString(overviewPoints, { role: 'overview' }),
    stages: raw.stages.map((g) => {
      const points = unpack(g.points);
      return {
        id: g.id,
        day: g.day,
        fromWaypointId: g.fromWaypointId,
        toWaypointId: g.toWaypointId,
        points,
        geoJson: toLineString(points, { stageId: g.id, day: g.day }),
        bounds: g.bounds,
        statistics: g.statistics,
        elevationProfile: toProfile(points),
      };
    }),
    waypoints: raw.waypoints,
    bounds: raw.bounds,
    statistics: raw.statistics,
    userBounds: raw.userBounds,
    mapCutoutBounds: raw.mapCutoutBounds,
  };
}

/**
 * The `{ id, fromStopId, toStopId }[]` topology `src/plan/*` takes by
 * injection, derived from the probe route's own place taxonomy.
 */
export function probeTopology(generated) {
  return generated.stages.map((s) => ({
    id: s.id,
    fromStopId: PROBE_WAYPOINT_TO_PLACE[s.fromWaypointId] ?? null,
    toStopId: PROBE_WAYPOINT_TO_PLACE[s.toWaypointId] ?? null,
  }));
}

/** The real Kungsleden topology, stated literally (same values the existing
 *  characterization tests use), so both trails can be held side by side. */
export const KUNGSLEDEN_TOPOLOGY = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

// ---- The two-trail register (test-only) ------------------------------------

/**
 * Both trails held in ONE lookup context at the same time — the condition the
 * probe brief requires, because an isolated fixture hides id collisions.
 *
 * `byLocalId` is the naive, un-scoped shape today's code implies (a bare
 * string key). `byScopedId` is the composite `(trailId, localId)` alternative,
 * present only to show what the un-scoped shape loses. Neither exists in
 * production; no `trailId` is added to `src/`.
 */
export function buildTwoTrailRegister(probeGenerated) {
  const trails = [
    { trailId: 'kungsleden', topology: KUNGSLEDEN_TOPOLOGY },
    { trailId: 'delft-probe', topology: probeTopology(probeGenerated) },
  ];

  const byLocalId = new Map();
  const byScopedId = new Map();
  const collisions = [];

  for (const { trailId, topology } of trails) {
    for (const stage of topology) {
      if (byLocalId.has(stage.id)) {
        collisions.push({
          localId: stage.id,
          firstTrail: byLocalId.get(stage.id).trailId,
          secondTrail: trailId,
        });
      } else {
        byLocalId.set(stage.id, { trailId, stage });
      }
      byScopedId.set(`${trailId}:${stage.id}`, { trailId, stage });
    }
  }

  return {
    trails,
    byLocalId,
    byScopedId,
    collisions,
    /** Naive lookup: what a bare-string API can do today. */
    lookupLocal: (stageId) => byLocalId.get(stageId) ?? null,
    /** Scoped lookup: what a composite key would allow. */
    lookupScoped: (trailId, stageId) => byScopedId.get(`${trailId}:${stageId}`) ?? null,
    /** Every stage of both trails, concatenated — an un-scoped merged topology. */
    mergedTopology: trails.flatMap((t) => t.topology),
  };
}
