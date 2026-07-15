/**
 * Guards the pure "Highlights & detours" experience logic
 * (src/data/experienceModel.mjs): the Highlight/Detour split derived from
 * `access`, physical-journey ordering (direction-aware, segment-stable),
 * basecamp separation (last within Detours), per-row position labels, the
 * combined-count partition, progressive provenance, the map-availability gate
 * and reference integrity. The React and data layers are thin consumers, so
 * this is the regression fence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canViewOnMap,
  experienceKind,
  experienceRefErrors,
  gpxRefErrors,
  hasExperiences,
  highlightsAndDetoursForStage,
  isBasecamp,
  isDetour,
  isHighlight,
  isRouteWide,
  journeyPositionLabel,
  mapDisplayKind,
  provenanceLevel,
} from '../src/data/experienceModel.mjs';

const FWD = 'abisko-to-nikkaluokta';
const REV = 'nikkaluokta-to-abisko';
const ids = (list) => list.map((x) => x.id);

/** Minimal fixtures — only the fields the pure logic reads. Deliberately given
 *  out of position order to prove sorting isn't accidental. */
const EXPS = [
  // d1: two on-route highlights (early + late) and a mid detour
  { id: 'd1-late-h', segmentIds: ['d1'], location: { access: 'on-trail', kind: 'point', orderHint: 0.8 } },
  { id: 'd1-early-h', segmentIds: ['d1'], location: { access: 'beside-trail', kind: 'point', orderHint: 0.1 } },
  { id: 'd1-detour', segmentIds: ['d1'], location: { access: 'short-detour', kind: 'route', orderHint: 0.5 } },
  // d4: highlights spanning the stage + two route detours near the end
  { id: 'd4-h1', segmentIds: ['d4'], location: { access: 'on-trail', kind: 'point', orderHint: 0.1 } },
  { id: 'd4-h2', segmentIds: ['d4'], location: { access: 'visible-from-trail', kind: 'vista', orderHint: 0.5 } },
  { id: 'd4-detA', segmentIds: ['d4'], location: { access: 'short-detour', kind: 'route', orderHint: 0.9 } },
  { id: 'd4-detB', segmentIds: ['d4'], location: { access: 'side-route', kind: 'route', orderHint: 0.95 } },
  // d6 highlight + two basecamp trips on d6+d7
  { id: 'd6-h', segmentIds: ['d6'], location: { access: 'on-trail', kind: 'point', orderHint: 0.4 } },
  { id: 'summit', segmentIds: ['d6', 'd7'], location: { access: 'basecamp-trip', kind: 'route', gpxAssetId: 'g1' }, expedition: {} },
  { id: 'tarfala', segmentIds: ['d6', 'd7'], location: { access: 'basecamp-trip', kind: 'route' }, weatherSensitivity: 'high' },
];

// ── Highlight vs Detour, derived from `access` ───────────────────────────────

test('kind is derived from the access relationship', () => {
  const kind = (access) => experienceKind({ location: { access } });
  assert.equal(kind('on-trail'), 'highlight');
  assert.equal(kind('beside-trail'), 'highlight');
  // Beside an overnight stop (no real deviation) is a Highlight, not a Detour —
  // the Sälka bathing stream reclassification depends on this.
  assert.equal(kind('beside-station'), 'highlight');
  assert.equal(kind('visible-from-trail'), 'highlight');
  assert.equal(kind('short-detour'), 'detour');
  assert.equal(kind('side-route'), 'detour');
  assert.equal(kind('basecamp-trip'), 'detour');
  assert.ok(isHighlight({ location: { access: 'beside-station' } }));
  assert.ok(isDetour({ location: { access: 'side-route' } }));
});

// ── Section building: journey order, direction-aware, segment-stable ─────────

test('highlights follow physical position; reversing flips them', () => {
  const fwd = highlightsAndDetoursForStage(EXPS, 'd1', FWD);
  assert.deepEqual(ids(fwd.highlights), ['d1-early-h', 'd1-late-h']);
  const rev = highlightsAndDetoursForStage(EXPS, 'd1', REV);
  assert.deepEqual(ids(rev.highlights), ['d1-late-h', 'd1-early-h']);
  // The detour is in its own section, never mixed into highlights.
  assert.deepEqual(ids(fwd.detours), ['d1-detour']);
});

test('detours order by access position, and reverse flips them', () => {
  const fwd = highlightsAndDetoursForStage(EXPS, 'd4', FWD);
  assert.deepEqual(ids(fwd.detours), ['d4-detA', 'd4-detB']);
  assert.deepEqual(ids(fwd.highlights), ['d4-h1', 'd4-h2']);
  const rev = highlightsAndDetoursForStage(EXPS, 'd4', REV);
  assert.deepEqual(ids(rev.detours), ['d4-detB', 'd4-detA']);
  assert.deepEqual(ids(rev.highlights), ['d4-h2', 'd4-h1']);
});

test('records are stable across directions (same set, no duplication)', () => {
  const f = highlightsAndDetoursForStage(EXPS, 'd4', FWD);
  const r = highlightsAndDetoursForStage(EXPS, 'd4', REV);
  assert.deepEqual([...ids(f.highlights)].sort(), [...ids(r.highlights)].sort());
  assert.deepEqual([...ids(f.detours)].sort(), [...ids(r.detours)].sort());
});

test('basecamp trips are Detours, kept LAST and separated out', () => {
  const d6 = highlightsAndDetoursForStage(EXPS, 'd6', FWD);
  assert.deepEqual(ids(d6.highlights), ['d6-h']);
  assert.deepEqual(ids(d6.detours), ['summit', 'tarfala']); // basecamp, curated order
  assert.deepEqual([...ids(d6.basecamp)].sort(), ['summit', 'tarfala']);
  d6.basecamp.forEach((x) => assert.ok(isBasecamp(x)));
  // A basecamp detour with a route detour present: basecamp still comes last.
  const mixed = highlightsAndDetoursForStage(
    [...EXPS, { id: 'd6-det', segmentIds: ['d6'], location: { access: 'short-detour', kind: 'route', orderHint: 0.2 } }],
    'd6',
    FWD,
  );
  assert.deepEqual(ids(mixed.detours), ['d6-det', 'summit', 'tarfala']);
  // A multi-segment basecamp trip appears on BOTH its segments.
  assert.ok(ids(highlightsAndDetoursForStage(EXPS, 'd7', FWD).detours).includes('summit'));
});

test('the two sections partition the stage — the combined count is their sum', () => {
  for (const stage of ['d1', 'd4', 'd6', 'd7']) {
    const { highlights, detours } = highlightsAndDetoursForStage(EXPS, stage, FWD);
    const onStage = EXPS.filter((x) => x.segmentIds.includes(stage));
    // No overlap, nothing lost: highlights ∪ detours == the stage's records.
    assert.equal(highlights.length + detours.length, onStage.length, `${stage} count`);
    const seen = new Set([...ids(highlights), ...ids(detours)]);
    assert.equal(seen.size, onStage.length, `${stage} no duplication`);
  }
});

test('empty and single-kind stages render no empty section', () => {
  // A stage with nothing → both arrays empty (the disclosure is not rendered).
  assert.equal(hasExperiences(EXPS, 'd3'), false);
  const d3 = highlightsAndDetoursForStage(EXPS, 'd3', FWD);
  assert.deepEqual(d3.highlights, []);
  assert.deepEqual(d3.detours, []);
  // A highlights-only fixture stage → detours is empty (no empty Detours block).
  const only = [{ id: 'h', segmentIds: ['dX'], location: { access: 'on-trail', kind: 'point', orderHint: 0.5 } }];
  const dX = highlightsAndDetoursForStage(only, 'dX', FWD);
  assert.equal(dX.highlights.length, 1);
  assert.deepEqual(dX.detours, []);
});

// ── Per-row position labels ──────────────────────────────────────────────────

test('journey position labels only the informative ends, direction-aware', () => {
  const near = { location: { access: 'on-trail', kind: 'point', orderHint: 0.1 } };
  const mid = { location: { access: 'on-trail', kind: 'point', orderHint: 0.5 } };
  const late = { location: { access: 'on-trail', kind: 'point', orderHint: 0.9 } };
  assert.equal(journeyPositionLabel(near, FWD), 'Near the start');
  assert.equal(journeyPositionLabel(mid, FWD), null); // quiet middle
  assert.equal(journeyPositionLabel(late, FWD), 'Near the end');
  // Reversed: the physical end becomes the walked start.
  assert.equal(journeyPositionLabel(late, REV), 'Near the start');
  // A route-wide observation never claims a precise position.
  const wide = { location: { access: 'on-trail', kind: 'segment-portion', orderHint: 0.2 } };
  assert.ok(isRouteWide(wide));
  assert.equal(journeyPositionLabel(wide, FWD), null);
});

// ── Progressive provenance ───────────────────────────────────────────────────

test('provenance level scales with safety/importance', () => {
  assert.equal(provenanceLevel({ location: { access: 'basecamp-trip' }, expedition: {} }), 'shown');
  assert.equal(provenanceLevel({ location: { access: 'short-detour' }, weatherSensitivity: 'high' }), 'shown');
  assert.equal(provenanceLevel({ location: { access: 'short-detour' } }), 'optional'); // a committing detour
  assert.equal(provenanceLevel({ location: { access: 'on-trail' } }), 'hidden'); // an on-route highlight
});

// ── Map availability — the operational "View on map" gate ────────────────────

test('map availability gates View on map and marker/route/context display', () => {
  const loc = (mapAvailability) => ({ location: { mapAvailability } });
  assert.equal(canViewOnMap(loc('unavailable')), false);
  assert.equal(mapDisplayKind(loc('unavailable')), 'none');
  assert.equal(canViewOnMap({ location: {} }), false); // missing availability
  assert.equal(canViewOnMap(loc('exact-point')), true);
  assert.equal(mapDisplayKind(loc('exact-point')), 'marker');
  assert.equal(canViewOnMap(loc('verified-route')), true);
  assert.equal(mapDisplayKind(loc('verified-route')), 'route');
  assert.equal(canViewOnMap(loc('context-only')), true);
  assert.equal(mapDisplayKind(loc('context-only')), 'context');
  assert.equal(canViewOnMap(loc('full-stage')), true);
  assert.equal(mapDisplayKind(loc('full-stage')), 'stage');
});

test('a route-wide Highlight with unavailable geometry offers no map action', () => {
  const routeWide = {
    location: { access: 'on-trail', kind: 'segment-portion', mapAvailability: 'unavailable' },
  };
  assert.ok(isHighlight(routeWide));
  assert.ok(isRouteWide(routeWide));
  assert.equal(canViewOnMap(routeWide), false);
});

// ── Reference integrity ──────────────────────────────────────────────────────

test('stage/stop reference validation flags unknown ids', () => {
  const stages = new Set(['d1', 'd4']);
  const stops = new Set(['abisko']);
  assert.deepEqual(experienceRefErrors({ id: 'ok', segmentIds: ['d1'], nearestStopId: 'abisko' }, stages, stops), []);
  assert.deepEqual(experienceRefErrors({ id: 'bad', segmentIds: ['d9'] }, stages, stops), [
    '"bad" references unknown segment "d9"',
  ]);
  assert.deepEqual(experienceRefErrors({ id: 'nostop', segmentIds: ['d1'], nearestStopId: 'x' }, stages, stops), [
    '"nostop" references unknown stop "x"',
  ]);
});

test('GPX reference validation flags broken links both ways', () => {
  const exps = [
    { id: 'summit', location: { gpxAssetId: 'g1' } },
    { id: 'plain', location: {} },
  ];
  const good = [{ id: 'g1', experienceId: 'summit' }];
  assert.deepEqual(gpxRefErrors(exps, good), []);
  assert.deepEqual(
    gpxRefErrors([{ id: 'x', location: { gpxAssetId: 'ghost' } }], []),
    ['experience "x" references unknown GPX asset "ghost"'],
  );
  assert.deepEqual(
    gpxRefErrors([], [{ id: 'g9', experienceId: 'nope' }]),
    ['GPX asset "g9" references unknown experience "nope"'],
  );
});
