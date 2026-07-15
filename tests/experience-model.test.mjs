/**
 * Guards the pure "Along the way" experience logic (src/data/experienceModel.mjs):
 * physical-journey ordering (direction-aware, segment-stable), basecamp
 * separation, positional grouping, the content-depth inline/detail rule,
 * progressive provenance, the zero-state rule and reference integrity
 * (stage/stop + experience↔GPX). The React layer is a thin consumer, so this is
 * the regression fence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPERIENCE_GROUP_ORDER,
  GROUP_THRESHOLD,
  experienceGroup,
  experienceRefErrors,
  gpxRefErrors,
  groupForStageDisplay,
  hasExperiences,
  isBasecamp,
  isInlineExperience,
  needsDetailView,
  orderForStage,
  provenanceLevel,
} from '../src/data/experienceModel.mjs';

const FWD = 'abisko-to-nikkaluokta';
const REV = 'nikkaluokta-to-abisko';
const ids = (list) => list.map((x) => x.id);

/** Minimal fixtures — only the fields the pure logic reads. Deliberately given
 *  out of position order to prove sorting isn't accidental. */
const EXPS = [
  // d1: a late on-trail sight, an early one, and a mid detour (commitment ≠ order)
  { id: 'd1-late', scale: 'on-route', segmentIds: ['d1'], location: { access: 'on-trail', segmentProgress: 0.8 } },
  { id: 'd1-early', scale: 'on-route', segmentIds: ['d1'], location: { access: 'on-trail', segmentProgress: 0.1 } },
  { id: 'd1-mid-detour', scale: 'mini-detour', segmentIds: ['d1'], location: { access: 'short-detour', segmentProgress: 0.5 } },
  // d4: five linear items spanning start → end (triggers positional groups)
  { id: 'd4-a', scale: 'on-route', segmentIds: ['d4'], location: { access: 'on-trail', segmentProgress: 0.1 } },
  { id: 'd4-b', scale: 'on-route', segmentIds: ['d4'], location: { access: 'on-trail', segmentProgress: 0.2 } },
  { id: 'd4-c', scale: 'on-route', segmentIds: ['d4'], location: { access: 'on-trail', segmentProgress: 0.5 } },
  { id: 'd4-d', scale: 'mini-detour', segmentIds: ['d4'], location: { access: 'short-detour', segmentProgress: 0.9 } },
  { id: 'd4-e', scale: 'short-excursion', segmentIds: ['d4'], location: { access: 'side-route', segmentProgress: 0.95 } },
  // d6 linear + two basecamp trips on d6+d7
  { id: 'd6-lin', scale: 'on-route', segmentIds: ['d6'], location: { access: 'on-trail', segmentProgress: 0.4 } },
  { id: 'summit', scale: 'major-adventure', segmentIds: ['d6', 'd7'], location: { access: 'basecamp-trip', gpxAssetId: 'g1' }, expedition: {} },
  { id: 'tarfala', scale: 'half-full-day', segmentIds: ['d6', 'd7'], location: { access: 'basecamp-trip' } },
];

// ── Physical-journey order, direction-aware, segment-stable ──────────────────

test('forward order follows physical position, not commitment', () => {
  // The mid detour (0.5) sits BETWEEN the two on-trail sights — never bottom.
  assert.deepEqual(ids(orderForStage(EXPS, 'd1', FWD).linear), [
    'd1-early',
    'd1-mid-detour',
    'd1-late',
  ]);
});

test('reversed order flips the linear sequence', () => {
  assert.deepEqual(ids(orderForStage(EXPS, 'd1', REV).linear), [
    'd1-late',
    'd1-mid-detour',
    'd1-early',
  ]);
});

test('records are stable across both directions (same set, no duplication)', () => {
  const fwd = orderForStage(EXPS, 'd1', FWD).linear;
  const rev = orderForStage(EXPS, 'd1', REV).linear;
  assert.equal(fwd.length, rev.length);
  assert.deepEqual([...ids(fwd)].sort(), [...ids(rev)].sort());
});

test('basecamp trips are separated from the linear on-stage items', () => {
  const { linear, basecamp } = orderForStage(EXPS, 'd6', FWD);
  assert.deepEqual(ids(linear), ['d6-lin']);
  assert.deepEqual([...ids(basecamp)].sort(), ['summit', 'tarfala']);
  EXPS.forEach((x) => {
    if (isBasecamp(x)) assert.ok(!ids(linear).includes(x.id));
  });
  // A multi-segment basecamp trip appears on BOTH its segments.
  assert.ok(ids(orderForStage(EXPS, 'd7', FWD).basecamp).includes('summit'));
});

// ── Stage display sections ───────────────────────────────────────────────────

test('few linear items stay flat; a trailing basecamp group is separate', () => {
  const d1 = groupForStageDisplay(EXPS, 'd1', FWD);
  assert.equal(d1.length, 1);
  assert.equal(d1[0].label, null); // flat, no positional headers (≤ threshold)
  assert.equal(GROUP_THRESHOLD, 3);

  const d6 = groupForStageDisplay(EXPS, 'd6', FWD);
  const larger = d6.find((s) => s.larger);
  assert.ok(larger);
  assert.equal(larger.label, 'Larger options');
  assert.deepEqual([...ids(larger.items)].sort(), ['summit', 'tarfala']);
});

test('many linear items split into positional groups, in journey order', () => {
  const fwd = groupForStageDisplay(EXPS, 'd4', FWD);
  assert.deepEqual(
    fwd.map((s) => s.key),
    ['near-start', 'along', 'near-end'],
  );
  assert.deepEqual(ids(fwd[0].items), ['d4-a', 'd4-b']);
  assert.deepEqual(ids(fwd[1].items), ['d4-c']);
  assert.deepEqual(ids(fwd[2].items), ['d4-d', 'd4-e']);

  // Reversed: the Sälka-end items become "near the start".
  const rev = groupForStageDisplay(EXPS, 'd4', REV);
  assert.deepEqual(ids(rev[0].items), ['d4-e', 'd4-d']);
});

test('zero: a stage with no experiences shows no sections (no empty "· 0")', () => {
  assert.equal(hasExperiences(EXPS, 'd3'), false);
  assert.deepEqual(groupForStageDisplay(EXPS, 'd3', FWD), []);
});

// ── Inline vs detail: content depth, not scale ───────────────────────────────

test('inline vs detail is decided by content depth', () => {
  const on = (scale, extra = {}) => ({ scale, location: { access: 'on-trail' }, ...extra });
  assert.equal(needsDetailView(on('on-route')), false); // plain sight → inline
  assert.equal(needsDetailView(on('mini-detour')), false); // shallow detour → inline
  assert.equal(needsDetailView({ scale: 'major-adventure', expedition: {}, location: {} }), true);
  assert.equal(needsDetailView(on('half-full-day')), true); // major time commitment
  assert.equal(needsDetailView(on('mini-detour', { weatherSensitivity: 'high' })), true);
  assert.equal(needsDetailView(on('mini-detour', { roundTripKm: 6, elevationGainM: 100 })), true); // 2 stats
  assert.equal(needsDetailView({ scale: 'on-route', location: { access: 'basecamp-trip', gpxAssetId: 'g1' } }), true);
  // isInlineExperience is the inverse.
  assert.equal(isInlineExperience(on('on-route')), true);
  assert.equal(isInlineExperience(on('half-full-day')), false);
});

// ── Progressive provenance ───────────────────────────────────────────────────

test('provenance level scales with safety/importance', () => {
  assert.equal(provenanceLevel({ scale: 'major-adventure', expedition: {}, location: {} }), 'shown');
  assert.equal(provenanceLevel({ scale: 'on-route', weatherSensitivity: 'high', location: {} }), 'shown');
  assert.equal(provenanceLevel({ scale: 'on-route', location: { spatialConfidence: 'draft' } }), 'shown');
  assert.equal(provenanceLevel({ scale: 'half-full-day', location: { spatialConfidence: 'approx' } }), 'optional');
  assert.equal(provenanceLevel({ scale: 'on-route', location: { access: 'on-trail' } }), 'hidden');
});

// ── Commitment grouping stays available for the future Explore Index ─────────

test('commitment grouping is unchanged (for the Index)', () => {
  assert.equal(experienceGroup('on-route'), 'on-route');
  assert.equal(experienceGroup('mini-detour'), 'detours');
  assert.equal(experienceGroup('major-adventure'), 'larger');
  assert.deepEqual(EXPERIENCE_GROUP_ORDER, ['on-route', 'detours', 'larger']);
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
  // experience → unknown asset
  assert.deepEqual(
    gpxRefErrors([{ id: 'x', location: { gpxAssetId: 'ghost' } }], []),
    ['experience "x" references unknown GPX asset "ghost"'],
  );
  // asset → unknown experience
  assert.deepEqual(
    gpxRefErrors([], [{ id: 'g9', experienceId: 'nope' }]),
    ['GPX asset "g9" references unknown experience "nope"'],
  );
});
