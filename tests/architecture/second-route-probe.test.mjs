/**
 * SECOND-ROUTE ARCHITECTURE PROBE — route pipeline, topology injection,
 * identity scoping and map coverage (hypotheses H1, H2, H4, H5).
 *
 * This is a FALSIFICATION artifact, not a feature and not a second trail. It
 * places a second real route (the historical Delft pilot, restored verbatim
 * from this repository's history — see tests/helpers/secondRouteFixture.mjs)
 * beside Kungsleden and records what the CURRENT architecture actually does.
 *
 * Several tests below assert behaviour that is WRONG for a multi-trail world.
 * That is deliberate: this file characterises today's truth so the foundation
 * work has a baseline. Each such test is marked "BROKE:" in its name and says
 * what would have to change. Nothing under src/ was modified to make any of
 * this pass.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIXTURE_GPX_PATH,
  HISTORICAL_GPX_SHA256,
  KUNGSLEDEN_TOPOLOGY,
  PROBE_ROUTE_CONFIG,
  buildProbeRoute,
  buildTwoTrailRegister,
  deriveMultiStageGpx,
  hydrateGenerated,
  probeTopology,
  readFixtureGpx,
  readProvenance,
  sha256,
} from '../helpers/secondRouteFixture.mjs';

import { KUNGSLEDEN_CONFIG } from '../../scripts/route-configs.mjs';
import { buildRouteData } from '../../scripts/generate-route-data.mjs';
import { buildDirectionalItinerary } from '../../src/route/itinerary.mjs';
import {
  addLegToDay,
  buildActivities,
  createDayPlan,
  dropHikingFromDay,
  isValidDays,
  newPlannedDayId,
  setDayActivities,
} from '../../src/plan/dayPlan.mjs';
import {
  isValidHikingLeg,
  legCandidatesFrom,
  newHikingLegId,
  orientedLegEndpoints,
  topologyStage,
} from '../../src/plan/hikingLegs.mjs';
import { newTripItemId } from '../../src/trip/tripModel.mjs';
import { newWalletDocumentId } from '../../src/wallet/walletModel.mjs';
import { dayPlanCoverageDiagnostics } from '../../src/plan/coverageDiagnostics.mjs';
import { cameraConstraintsFor, mercX, mercY, overviewEnvelope } from '../../src/map/cameraBounds.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Built once — the generator is pure, so every test shares one result. */
const PROBE = buildProbeRoute();
const PROBE_TOPOLOGY = probeTopology(PROBE.data);

// ---------------------------------------------------------------------------
// Fixture provenance
// ---------------------------------------------------------------------------

test('fixture is the historical Delft pilot route, restored byte-for-byte', () => {
  const gpx = readFixtureGpx();
  assert.equal(
    sha256(gpx),
    HISTORICAL_GPX_SHA256,
    'fixture must stay byte-identical to git blob f989da6 (4ada992^:public/gpx/delft-pilot.gpx)',
  );

  // Real provenance markers: gpx.studio's routing engine carries OSM way tags
  // through onto the track points. Invented geometry would not have these.
  assert.match(gpx, /creator="https:\/\/gpx\.studio"/);
  assert.match(gpx, /<highway>residential<\/highway>/);
  assert.match(gpx, /<surface>paving_stones<\/surface>/);

  const provenance = readProvenance();
  assert.equal(provenance.sha256, HISTORICAL_GPX_SHA256);
  assert.equal(provenance.productionTrail, false);
});

test('the fixture is genuinely UNLIKE Kungsleden — that is its whole value', () => {
  const [[w, s], [e, n]] = PROBE.data.bounds;

  // Different hemisphere-scale latitude: ~52°N vs Kungsleden's ~68°N.
  assert.ok(s > 51 && n < 53, `probe latitude ${s}..${n} must be ~52°N`);
  // Different order of magnitude: ~2 km vs ~105 km.
  assert.ok(PROBE.data.statistics.distanceKm < 5);
  // Flat, not alpine: elevation exists but has no meaningful relief.
  assert.equal(PROBE.data.statistics.totalAscentM, 0);
  assert.equal(PROBE.data.statistics.totalDescentM, 0);
  // No STF hut model behind the endpoints.
  assert.ok(PROBE.data.waypoints.every((wp) => !/HUT_/.test(wp.id)));
  assert.ok(w < e && s < n);
});

// ---------------------------------------------------------------------------
// H1 — Route generation is really multi-route capable
// ---------------------------------------------------------------------------

test('H1 HELD: the real generator processes a second real route with zero problems', () => {
  assert.deepEqual(PROBE.problems, [], 'a foreign route must not produce validation problems');
  assert.ok(PROBE.data, 'buildRouteData returned data');
});

test('H1 HELD: parsing, staging, statistics, bounds and elevation all come out', () => {
  const d = PROBE.data;

  assert.equal(d.stages.length, 3, 'three stages from one real polyline');
  assert.deepEqual(
    d.stages.map((s) => [s.fromWaypointId, s.toWaypointId]),
    PROBE_ROUTE_CONFIG.stageWaypoints,
  );
  // Stages partition the overview (the generator's own <1% invariant).
  assert.ok(d.diagnostics.overviewVsStageSumDiffPct < 1);

  for (const stage of d.stages) {
    assert.ok(stage.statistics.distanceKm > 0);
    assert.ok(stage.points.length > 1);
    assert.equal(stage.bounds.length, 2);
  }

  assert.ok(d.statistics.distanceKm > 0);
  assert.equal(typeof d.statistics.minimumElevationM, 'number', 'flat route still reports elevation');
  assert.ok(Array.isArray(d.userBounds) && Array.isArray(d.mapCutoutBounds));
  // Per-trail coverage config is honoured, not a Kungsleden constant.
  assert.equal(PROBE_ROUTE_CONFIG.userBufferKm, 1);
  assert.notEqual(PROBE_ROUTE_CONFIG.userBufferKm, KUNGSLEDEN_CONFIG.userBufferKm);
});

test('H1 HELD: Kungsleden defaults are configuration, not hard-coded literals', () => {
  // Everything the probe route needed to differ was a config field.
  for (const key of [
    'expectedSegments',
    'expectedWaypoints',
    'stageWaypoints',
    'stageIdPrefix',
    'requireElevation',
    'userBufferKm',
    'dataMarginKm',
    'nameOverrides',
  ]) {
    assert.ok(key in PROBE_ROUTE_CONFIG, `probe supplied ${key}`);
    assert.ok(key in KUNGSLEDEN_CONFIG, `manifest defines ${key}`);
  }
  // The generated payload is trail-shaped but carries NO trail identity.
  assert.equal('trailId' in PROBE.data, false);
  assert.equal('routeId' in PROBE.data, false, 'only the missing-route STUB carries routeId');
});

test('H1 FINDING: the manifest kept its multi-route contract but its fields drifted', () => {
  // route-configs.mjs still documents optional routes ("required: false ...
  // for bounded tests"), and KUNGSLEDEN_CONFIG is exported separately from
  // ROUTE_CONFIGS — the multi-route intent survived.
  assert.equal(KUNGSLEDEN_CONFIG.required, true);
  assert.ok('required' in KUNGSLEDEN_CONFIG);

  // But the historical Delft entry configured `mapBufferKm`, a field that no
  // longer exists: it became userBufferKm + dataMarginKm while only one route
  // was in the manifest. An optional entry written before that split would
  // now generate NaN bounds rather than fail loudly.
  assert.equal('mapBufferKm' in KUNGSLEDEN_CONFIG, false);
  const stale = { ...PROBE_ROUTE_CONFIG, mapBufferKm: 2 };
  delete stale.userBufferKm;
  delete stale.dataMarginKm;
  const { data } = buildRouteData(deriveMultiStageGpx().xml, stale);
  const [[staleWest]] = data.userBounds;
  assert.ok(Number.isNaN(staleWest), 'a stale config silently yields NaN bounds, never an error');
});

// ---------------------------------------------------------------------------
// H2 — Route and itinerary logic accepts injected topology
// ---------------------------------------------------------------------------

test('H2 HELD: the itinerary transform orders and reverses a foreign route correctly', () => {
  const route = hydrateGenerated(PROBE.data);

  const forward = buildDirectionalItinerary(route, 'abisko-to-nikkaluokta');
  assert.deepEqual(forward.stageOrder, ['d1', 'd2', 'd3']);
  assert.deepEqual(forward.waypointOrder, [
    'START_DELFT',
    'VIA_DELFT_1',
    'VIA_DELFT_2',
    'END_DELFT',
  ]);
  assert.equal(forward.waypointDistanceKm.START_DELFT, 0);
  assert.ok(forward.waypointDistanceKm.END_DELFT > 0);

  const reverse = buildDirectionalItinerary(route, 'nikkaluokta-to-abisko');
  assert.deepEqual(reverse.stageOrder, ['d3', 'd2', 'd1'], 'physical ids stay stable');
  assert.deepEqual(
    reverse.route.stages.map((s) => s.day),
    [1, 2, 3],
    'itinerary days are re-derived',
  );
  // Endpoints swap and geometry is re-oriented from 0.
  assert.equal(reverse.route.stages[0].fromWaypointId, 'END_DELFT');
  assert.equal(reverse.route.overviewPoints[0].cumulativeDistanceKm, 0);
  assert.ok(
    Math.abs(
      reverse.route.overviewPoints.at(-1).cumulativeDistanceKm -
        forward.route.overviewPoints.at(-1).cumulativeDistanceKm,
    ) < 0.01,
  );
});

test('H2 BROKE: stop identity collapses — the itinerary returns undefined, not null', () => {
  // buildDirectionalItinerary resolves stops through the MODULE-LEVEL
  // Kungsleden table WAYPOINT_TO_HUT (src/route/waypointStops.mjs), which is
  // not injectable. For any non-Kungsleden waypoint the lookup misses.
  const itinerary = buildDirectionalItinerary(hydrateGenerated(PROBE.data), 'abisko-to-nikkaluokta');

  // src/route/itinerary.d.mts declares `stopOrder: string[]` and
  // `startStopId: string | null`. Both declarations are violated silently:
  // TypeScript cannot catch it because the values come from a Record index.
  assert.ok(itinerary.stopOrder.every((v) => v === undefined), 'stopOrder is undefined[]');
  assert.equal(itinerary.startStopId, undefined, 'declared string|null, actually undefined');
  assert.equal(itinerary.endStopId, undefined);
  assert.deepEqual(itinerary.stopDistanceKm, {}, 'nothing is keyed by stop id');

  // Required fix: WAYPOINT_TO_HUT must become injected per-trail data instead
  // of a module constant (src/route/waypointStops.mjs, src/route/itinerary.mjs).
});

test('H2 HELD: the day-plan layer is fully topology-injected', () => {
  const plan = createDayPlan('abisko-to-nikkaluokta', '2026-08-10', PROBE_TOPOLOGY);
  assert.ok(plan, 'a plan can be created for a trail the app has never seen');
  assert.equal(plan.days.length, 3);
  assert.ok(isValidDays(plan.days, PROBE_TOPOLOGY));

  // Leg candidates resolve against the probe's own place ids.
  assert.deepEqual(legCandidatesFrom(PROBE_TOPOLOGY, 'start'), [
    { stageId: 'd1', orientation: 'canonical', fromStopId: 'start', toStopId: 'via-1' },
  ]);
  assert.deepEqual(orientedLegEndpoints(plan.days[0].activities[0].legs[0], PROBE_TOPOLOGY), {
    fromStopId: 'start',
    toStopId: 'via-1',
  });
});

test('H2 HELD: rest, travel, combined multi-stage and reversed days all work', () => {
  let days = createDayPlan('abisko-to-nikkaluokta', '2026-08-10', PROBE_TOPOLOGY).days;

  // A combined hiking day: d1 + d2 on one day, connected end-to-start.
  days = addLegToDay(days, 0, 'd2', 'canonical', 'end', PROBE_TOPOLOGY);
  const legs = days[0].activities.find((a) => a.kind === 'hiking').legs;
  assert.deepEqual(legs.map((l) => l.stageId), ['d1', 'd2']);
  assert.ok(isValidDays(days, PROBE_TOPOLOGY));

  // The "no silent removal of walking" invariant holds identically here:
  // setDayActivities REFUSES to drop a day's legs; only the explicit
  // dropHikingFromDay may.
  const refused = setDayActivities(days, 1, ['rest'], PROBE_TOPOLOGY);
  assert.deepEqual(refused[1].activities.map((a) => a.kind), ['hiking'], 'refused, unchanged');

  // A rest day and a travel day, via the explicit path.
  days = dropHikingFromDay(days, 1, ['rest']);
  days = dropHikingFromDay(days, 2, ['travel']);
  assert.deepEqual(days[1].activities.map((a) => a.kind), ['rest']);
  assert.deepEqual(days[2].activities.map((a) => a.kind), ['travel']);
  assert.ok(isValidDays(days, PROBE_TOPOLOGY));

  // An opposite-orientation leg over a probe stage.
  const opposite = buildActivities(['hiking'], [
    { id: 'leg_probe_rev', kind: 'canonical-stage', stageId: 'd3', orientation: 'opposite' },
  ]);
  assert.ok(isValidDays([{ ...days[0], activities: opposite }], PROBE_TOPOLOGY));
  assert.deepEqual(orientedLegEndpoints(opposite[0].legs[0], PROBE_TOPOLOGY), {
    fromStopId: 'finish',
    toStopId: 'via-2',
  });
});

test('H2 HELD: coverage diagnostics work on a foreign topology', () => {
  const plan = createDayPlan('abisko-to-nikkaluokta', '2026-08-10', PROBE_TOPOLOGY);
  const full = dayPlanCoverageDiagnostics(plan.days, 'abisko-to-nikkaluokta', PROBE_TOPOLOGY);
  assert.deepEqual(full.missingStageIds, []);
  assert.equal(full.omitsCanonicalStart, false);
  assert.equal(full.omitsCanonicalEnd, false);

  // Drop the middle stage: the diagnostic names the probe's own stage id.
  const trimmed = { ...plan, days: [plan.days[0], plan.days[2]] };
  const partial = dayPlanCoverageDiagnostics(
    trimmed.days,
    'abisko-to-nikkaluokta',
    PROBE_TOPOLOGY,
  );
  assert.deepEqual(partial.missingStageIds, ['d2']);
});

// ---------------------------------------------------------------------------
// H4 — Local ids are only safe inside a trail scope
// ---------------------------------------------------------------------------

test('H4 BROKE: both trails legitimately generate d1/d2/d3 — the ids collide', () => {
  const register = buildTwoTrailRegister(PROBE.data);
  assert.deepEqual(
    register.collisions.map((c) => c.localId),
    ['d1', 'd2', 'd3'],
    'the same generator + the same default prefix produce the same ids',
  );

  // The historical pilot DODGED this by using prefix 'p'. It was never solved.
  assert.equal(PROBE_ROUTE_CONFIG.stageIdPrefix, KUNGSLEDEN_CONFIG.stageIdPrefix);
});

test('H4 BROKE: an un-scoped lookup silently returns the WRONG trail', () => {
  const register = buildTwoTrailRegister(PROBE.data);

  // A bare-string lookup cannot express which trail is meant; first wins.
  assert.equal(register.lookupLocal('d1').trailId, 'kungsleden');
  assert.equal(register.lookupScoped('delft-probe', 'd1').trailId, 'delft-probe');

  // topologyStage — the real API in src/plan/hikingLegs.mjs — takes a bare
  // string and uses Array.find(), so the probe's d1 is unreachable in a
  // merged registry.
  const merged = register.mergedTopology;
  assert.equal(merged.length, 10);
  assert.deepEqual(topologyStage(merged, 'd1'), {
    id: 'd1',
    fromStopId: 'abisko',
    toStopId: 'abiskojaure',
  });
});

test('H4 BROKE: a foreign plan validates as legitimate and resolves to the wrong places', () => {
  // This is the sharpest consequence. A personal hiking leg authored on the
  // probe trail is structurally indistinguishable from a Kungsleden leg.
  const foreignLeg = {
    id: 'leg_probe_1',
    kind: 'canonical-stage',
    stageId: 'd1',
    orientation: 'canonical',
  };

  assert.equal(
    isValidHikingLeg(foreignLeg, KUNGSLEDEN_TOPOLOGY),
    true,
    'a Delft leg is accepted as VALID against the Kungsleden topology',
  );
  assert.deepEqual(
    orientedLegEndpoints(foreignLeg, KUNGSLEDEN_TOPOLOGY),
    { fromStopId: 'abisko', toStopId: 'abiskojaure' },
    'and silently resolves to Abisko → Abiskojaure',
  );
  // On its own trail the same leg means something completely different.
  assert.deepEqual(orientedLegEndpoints(foreignLeg, PROBE_TOPOLOGY), {
    fromStopId: 'start',
    toStopId: 'via-1',
  });

  // Required fix: persisted stage references need trail scope — either a
  // composite (trailId, localId) key or a trailId on the persisted blob that
  // is checked before the topology is applied.
});

test('H4 BROKE: a merged topology makes diagnostics meaningless', () => {
  const merged = buildTwoTrailRegister(PROBE.data).mergedTopology;
  const diagnostics = dayPlanCoverageDiagnostics([], 'abisko-to-nikkaluokta', merged);
  // Duplicated ids are reported twice — nothing deduplicates across trails.
  assert.deepEqual(diagnostics.missingStageIds, [
    'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd1', 'd2', 'd3',
  ]);
});

test('H4 FINDING: which ids need trail scope, and which are already app-global', () => {
  // NEEDS SCOPE — derived from trail content, and demonstrably colliding.
  const register = buildTwoTrailRegister(PROBE.data);
  assert.deepEqual(register.collisions.map((c) => c.localId), ['d1', 'd2', 'd3']);
  // Place ids are the same class of id: both trails mint them from their own
  // waypoints with no trail prefix.
  assert.ok(PROBE_TOPOLOGY.every((s) => !s.fromStopId.includes('delft')));
  assert.ok(KUNGSLEDEN_TOPOLOGY.every((s) => !s.fromStopId.includes('kungsleden')));

  // ALREADY SAFE — personal record ids are minted from a clock + randomness,
  // never derived from trail content, so they cannot collide across trails.
  const minted = [
    newHikingLegId(),
    newHikingLegId(),
    newPlannedDayId(),
    newTripItemId(),
    newWalletDocumentId(),
  ];
  assert.equal(new Set(minted).size, minted.length, 'personal ids are unique by construction');
  assert.ok(minted.every((id) => /_[a-z0-9]+_[a-z0-9]+$/.test(id)));

  // So the scoping work is bounded: it is the REFERENCES from personal data
  // into trail content that need trail scope (leg.stageId, currentStageId,
  // stay.linkedPlaceId, overnight stopId) — not the personal records
  // themselves, and not the wallet at all.
});

// ---------------------------------------------------------------------------
// H5 — Coverage and map contracts outside Kungsleden
// ---------------------------------------------------------------------------

test('H5 HELD: camera constraints are pure functions of injected bounds', () => {
  const constraints = cameraConstraintsFor({
    userBounds: PROBE.data.userBounds,
    routeBounds: PROBE.data.bounds,
    dataBounds: PROBE.data.mapCutoutBounds,
    viewportWidth: 390,
    viewportHeight: 844,
    padding: { top: 120, bottom: 96 },
  });
  assert.deepEqual(constraints.interactionBounds, PROBE.data.userBounds);
  assert.ok(Number.isFinite(constraints.zoomThreshold));
  // A 2 km route needs a far higher zoom threshold than a 105 km one — the
  // maths scales, no Kungsleden constant is involved.
  assert.ok(constraints.zoomThreshold > 12, `threshold ${constraints.zoomThreshold}`);
});

test('H5 BROKE: overviewEnvelope stops containing the data it is meant to cap', () => {
  // The envelope is documented as the PHYSICAL extent every archive covers,
  // "so no viewport can pan onto unshaded map". North/south are derived by
  // shrinking the data bounds inward by a fixed 2000 m of mercator — safe for
  // a 154 km-tall route, wrong for a short one.
  const envelope = overviewEnvelope(PROBE.data.mapCutoutBounds);
  const [[ew, es], [ee, en]] = envelope;
  const [[dw, ds], [de, dn]] = PROBE.data.mapCutoutBounds;

  assert.ok(ew <= dw && ee >= de, 'east/west are tile-aligned outward — fine');
  assert.ok(
    es > ds && en < dn,
    'but north/south fall INSIDE the data bounds the envelope is meant to describe',
  );

  // Kungsleden is unaffected: its data bounds dwarf the 2 km margin.
  const kungsleden = JSON.parse(
    readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
  );
  const [[, kes], [, ken]] = overviewEnvelope(kungsleden.mapCutoutBounds);
  const [[, kds], [, kdn]] = kungsleden.mapCutoutBounds;
  assert.ok(kes > kds && ken < kdn, 'the same inward shrink happens…');
  assert.ok(
    ken - kes > kdn - kds - 0.1,
    '…but is negligible against a 154 km route, which is why it was never noticed',
  );
});

test('H5 BROKE: the envelope INVERTS entirely below ~2.5 km of route height', () => {
  // Below a data height of 2 × 2000 m of mercator the shrink crosses over and
  // south ends up north of north — a silently degenerate rectangle.
  const at = (halfKm) => {
    const dLat = halfKm / 111.32;
    const [[, s], [, n]] = overviewEnvelope([
      [4.33, 52.02 - dLat],
      [4.39, 52.02 + dLat],
    ]);
    return s > n;
  };
  assert.equal(at(3), false, '3 km half-height: still valid');
  assert.equal(at(1), true, '1 km half-height: inverted');
  assert.equal(at(0.5), true, '0.5 km half-height: inverted');
});

test('H5 FINDING: the overview fit assumes a route taller than it is wide', () => {
  // cameraConstraintsFor scales the overview by the padded HEIGHT only
  // ("the route is far taller than wide"). That is a property of Kungsleden,
  // not of trails in general.
  const aspect = (bounds) => {
    const [[w, s], [e, n]] = bounds;
    return (mercX(e) - mercX(w)) / (mercY(n) - mercY(s));
  };
  const kungsleden = JSON.parse(
    readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
  );
  assert.ok(aspect(kungsleden.bounds) < 0.7, 'Kungsleden is strongly north-south');
  assert.ok(aspect(PROBE.data.bounds) > 0.9, 'the probe route is near-square');

  // The probe route does not falsify the assumption (near-square still fits);
  // it only shows the assumption is unenforced. A genuinely east-west trail
  // would need this addressed — deliberately NOT abstracted now.
  assert.ok(aspect(PROBE.data.bounds) < 1.6);
});

test('H5 HELD: a route degrades honestly with no satellite or terrain layer', () => {
  // Nothing in the pure coverage boundary requires an archive to exist: the
  // constraints are computed from bounds alone, so a trail with no PMTiles
  // still yields a valid camera.
  const constraints = cameraConstraintsFor({
    userBounds: PROBE.data.userBounds,
    routeBounds: PROBE.data.bounds,
    dataBounds: null,
    viewportWidth: 390,
    viewportHeight: 844,
    padding: { top: 0, bottom: 0 },
  });
  assert.deepEqual(constraints.interactionBounds, PROBE.data.userBounds);
  assert.ok(Number.isFinite(constraints.zoomThreshold));
});
