/**
 * Guards the pure "Along the way" experience logic (src/data/experienceModel.mjs)
 * — selection by stable physical segment, commitment ordering/grouping, the
 * inline-vs-detail classification, reference validation and the zero-state rule.
 * These are the load-bearing rules the Stages screen and the data module both
 * depend on; the React layer is a thin consumer, so this is the regression fence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPERIENCE_GROUP_ORDER,
  GROUP_THRESHOLD,
  experienceGroup,
  experienceRefErrors,
  groupForDisplay,
  hasExperiences,
  isInlineExperience,
  selectForStage,
} from '../src/data/experienceModel.mjs';

/** Minimal fixtures — only the fields the pure logic reads. */
const EXPS = [
  { id: 'a-view', scale: 'on-route', segmentIds: ['d1'], nearestStopId: 'abisko' },
  { id: 'a-canyon', scale: 'mini-detour', segmentIds: ['d1'], nearestStopId: 'abisko' },
  { id: 'a-birch', scale: 'on-route', segmentIds: ['d1'], nearestStopId: 'abisko' },
  { id: 'd4-pass', scale: 'on-route', segmentIds: ['d4'] },
  { id: 'd4-moraine', scale: 'on-route', segmentIds: ['d4'] },
  { id: 'd4-descent', scale: 'on-route', segmentIds: ['d4'] },
  { id: 'd4-stream', scale: 'mini-detour', segmentIds: ['d4'] },
  { id: 'd4-socker', scale: 'short-excursion', segmentIds: ['d4'] },
  { id: 'd4-nallo', scale: 'half-full-day', segmentIds: ['d4'] },
  { id: 'd5-pano', scale: 'on-route', segmentIds: ['d5'] },
  { id: 'summit', scale: 'major-adventure', segmentIds: ['d6', 'd7'] },
  { id: 'tarfala', scale: 'half-full-day', segmentIds: ['d6', 'd7'] },
];
const ids = (list) => list.map((x) => x.id);

// ── zero / one / many ───────────────────────────────────────────────────────

test('zero: a stage with no experiences selects nothing and shows no disclosure', () => {
  assert.equal(hasExperiences(EXPS, 'd3'), false);
  assert.deepEqual(selectForStage(EXPS, 'd3'), []);
  // groupForDisplay on an empty selection is a flat, empty list — never a group.
  assert.deepEqual(groupForDisplay([]), { grouped: false, items: [] });
});

test('one: a single-experience stage stays a flat list', () => {
  const sel = selectForStage(EXPS, 'd5');
  assert.equal(sel.length, 1);
  assert.equal(hasExperiences(EXPS, 'd5'), true);
  const display = groupForDisplay(sel);
  assert.equal(display.grouped, false);
  assert.deepEqual(ids(display.items), ['d5-pano']);
});

test('three stays flat; four earns commitment groups (threshold boundary)', () => {
  assert.equal(GROUP_THRESHOLD, 3);
  assert.equal(groupForDisplay(selectForStage(EXPS, 'd1')).grouped, false); // d1 has 3
  assert.equal(groupForDisplay(selectForStage(EXPS, 'd4')).grouped, true); // d4 has 6
});

// ── commitment-group ordering ───────────────────────────────────────────────

test('selection orders by rising commitment, curated order within a group', () => {
  assert.deepEqual(ids(selectForStage(EXPS, 'd4')), [
    'd4-pass',
    'd4-moraine',
    'd4-descent', // on-route (curated order preserved)
    'd4-stream', // detours (mini)
    'd4-socker', // detours (short)
    'd4-nallo', // larger
  ]);
});

test('grouped display uses the three groups in commitment order, empty dropped', () => {
  const display = groupForDisplay(selectForStage(EXPS, 'd4'));
  assert.equal(display.grouped, true);
  assert.deepEqual(
    display.groups.map((g) => g.group),
    ['on-route', 'detours', 'larger'],
  );
  assert.deepEqual(
    display.groups.map((g) => g.label),
    ['On the route', 'Short detours', 'Larger options'],
  );
  // A set with no "detours" drops that group rather than showing it empty.
  const noDetours = groupForDisplay([
    { id: 'v1', scale: 'on-route', segmentIds: ['x'] },
    { id: 'v2', scale: 'on-route', segmentIds: ['x'] },
    { id: 'v3', scale: 'on-route', segmentIds: ['x'] },
    { id: 'm1', scale: 'major-adventure', segmentIds: ['x'] },
  ]);
  assert.deepEqual(
    noDetours.groups.map((g) => g.group),
    ['on-route', 'larger'],
  );
});

test('experienceGroup maps every scale, group order is stable', () => {
  assert.equal(experienceGroup('on-route'), 'on-route');
  assert.equal(experienceGroup('mini-detour'), 'detours');
  assert.equal(experienceGroup('short-excursion'), 'detours');
  assert.equal(experienceGroup('half-full-day'), 'larger');
  assert.equal(experienceGroup('major-adventure'), 'larger');
  assert.deepEqual(EXPERIENCE_GROUP_ORDER, ['on-route', 'detours', 'larger']);
});

// ── stable physical-segment association in BOTH route directions ─────────────

test('experiences follow the physical segment, not the display-day number', () => {
  // Forward: physical d1 is Day 1. Reverse: physical d1 is Day 7. The query is
  // always by SEGMENT id, so the same experiences resolve in either direction.
  const forwardDayToSegment = { 1: 'd1', 6: 'd6', 7: 'd7' };
  const reverseDayToSegment = { 7: 'd1', 2: 'd6', 1: 'd7' };

  const abiskoForward = selectForStage(EXPS, forwardDayToSegment[1]); // Day 1 fwd
  const abiskoReverse = selectForStage(EXPS, reverseDayToSegment[7]); // Day 7 rev
  assert.deepEqual(ids(abiskoForward), ids(abiskoReverse));
  assert.deepEqual(ids(abiskoForward), ['a-view', 'a-birch', 'a-canyon']);

  // The Kebnekaise basecamp majors sit on d6/d7 whichever day those become.
  const kebForward = selectForStage(EXPS, forwardDayToSegment[6]); // Day 6 fwd
  const kebReverse = selectForStage(EXPS, reverseDayToSegment[2]); // Day 2 rev
  assert.deepEqual(ids(kebForward), ids(kebReverse));
  assert.ok(ids(kebForward).includes('summit'));
});

// ── multi-segment experiences ───────────────────────────────────────────────

test('a multi-segment experience appears on every segment it lists', () => {
  const onD6 = ids(selectForStage(EXPS, 'd6'));
  const onD7 = ids(selectForStage(EXPS, 'd7'));
  assert.ok(onD6.includes('summit') && onD6.includes('tarfala'));
  assert.ok(onD7.includes('summit') && onD7.includes('tarfala'));
});

// ── inline vs detail classification ─────────────────────────────────────────

test('only on-route sights are inline; everything larger opens a detail', () => {
  assert.equal(isInlineExperience('on-route'), true);
  for (const scale of ['mini-detour', 'short-excursion', 'half-full-day', 'major-adventure']) {
    assert.equal(isInlineExperience(scale), false, scale);
  }
});

// ── invalid stage and Stop references ───────────────────────────────────────

test('reference validation flags unknown segment and stop ids, passes valid ones', () => {
  const stages = new Set(['d1', 'd4', 'd6', 'd7']);
  const stops = new Set(['abisko', 'kebnekaise']);

  assert.deepEqual(
    experienceRefErrors(
      { id: 'ok', segmentIds: ['d1'], nearestStopId: 'abisko' },
      stages,
      stops,
    ),
    [],
  );
  assert.deepEqual(
    experienceRefErrors({ id: 'no-seg', segmentIds: [] }, stages, stops),
    ['"no-seg" has no segmentIds'],
  );
  assert.deepEqual(
    experienceRefErrors({ id: 'bad-seg', segmentIds: ['d9'] }, stages, stops),
    ['"bad-seg" references unknown segment "d9"'],
  );
  assert.deepEqual(
    experienceRefErrors(
      { id: 'bad-stop', segmentIds: ['d4'], nearestStopId: 'nowhere' },
      stages,
      stops,
    ),
    ['"bad-stop" references unknown stop "nowhere"'],
  );
});
