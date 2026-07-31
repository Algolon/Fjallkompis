/**
 * Coverage diagnostics (src/plan/coverageDiagnostics.mjs) — the exact module
 * the planner reads. Diagnostics DESCRIBE how a personal plan differs from
 * the canonical through-route; they never invalidate a plan, block an edit
 * or mutate anything.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coverageSummaryLines,
  dayPlanCoverageDiagnostics,
  hasCoverageDifferences,
} from '../src/plan/coverageDiagnostics.mjs';
import { isValidDays } from '../src/plan/dayPlan.mjs';
import { DEFAULT_DIRECTION, REVERSE_DIRECTION } from '../src/route/direction.mjs';

const FORWARD = DEFAULT_DIRECTION;
const REVERSE = REVERSE_DIRECTION;

const TOPOLOGY = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

let seq = 0;
const leg = (stageId, orientation = 'canonical') => ({
  id: `leg_fixture_${(seq += 1)}`,
  kind: 'canonical-stage',
  stageId,
  orientation,
});
const day = (activities) => ({ id: `day_fixture_${(seq += 1)}`, activities });
const hiking = (...legs) => ({ kind: 'hiking', legs });
const travel = () => ({ kind: 'travel' });
const rest = () => ({ kind: 'rest' });

const throughRoute = () =>
  ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'].map((id) => day([hiking(leg(id))]));

const NONE = {
  missingStageIds: [],
  repeatedStages: [],
  oppositeLegIds: [],
  disconnectedDayBoundaries: [],
  omitsCanonicalStart: false,
  omitsCanonicalEnd: false,
};

test('a complete through-route reports no differences at all', () => {
  const d = dayPlanCoverageDiagnostics(throughRoute(), FORWARD, TOPOLOGY);
  assert.deepEqual(d, NONE);
  assert.equal(hasCoverageDifferences(d), false);
  assert.deepEqual(coverageSummaryLines(d), []);
});

test('travel and rest days around the walking change nothing', () => {
  const days = [day([travel()]), ...throughRoute(), day([rest()])];
  assert.deepEqual(dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY), NONE);
});

test('a complete reverse plan is no difference IN ITS OWN direction', () => {
  const days = ['d7', 'd6', 'd5', 'd4', 'd3', 'd2', 'd1'].map((id) =>
    day([hiking(leg(id, 'opposite'))]),
  );
  const d = dayPlanCoverageDiagnostics(days, REVERSE, TOPOLOGY);
  assert.deepEqual(d, NONE, 'opposite legs are a reverse plan’s NATURAL legs');
});

test('a missing middle section is reported — and nothing else changes', () => {
  const days = throughRoute().filter((_, i) => i !== 3); // drop the d4 day
  const d = dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY);
  assert.deepEqual(d.missingStageIds, ['d4']);
  // The gap also disconnects the two days around it.
  assert.equal(d.disconnectedDayBoundaries.length, 1);
  assert.equal(d.disconnectedDayBoundaries[0].fromDayId, days[2].id);
  assert.equal(d.disconnectedDayBoundaries[0].toDayId, days[3].id);
  assert.equal(d.omitsCanonicalStart, false);
  assert.equal(d.omitsCanonicalEnd, false);
  assert.deepEqual(d.repeatedStages, []);
  // The plan REMAINS structurally valid — a diagnostic is not a blocker.
  assert.ok(isValidDays(days, TOPOLOGY));
});

test('a repeated section counts its occurrences', () => {
  const days = [...throughRoute(), day([hiking(leg('d7', 'opposite'))])];
  const d = dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY);
  assert.deepEqual(d.repeatedStages, [{ stageId: 'd7', occurrences: 2 }]);
  // The extra leg walks against the plan direction, so it is also named there.
  assert.equal(d.oppositeLegIds.length, 1);
  // Walking back to Kebnekaise ends the journey before the canonical end.
  assert.equal(d.omitsCanonicalEnd, true);
});

test('an out-and-back on one day is a repeat plus a reversed leg — not an error', () => {
  const bounce = day([hiking(leg('d7'), leg('d7', 'opposite'))]);
  const days = [...throughRoute().slice(0, 6), bounce];
  const d = dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY);
  assert.deepEqual(d.repeatedStages, [{ stageId: 'd7', occurrences: 2 }]);
  assert.equal(d.oppositeLegIds.length, 1);
  assert.deepEqual(d.missingStageIds, []);
  assert.deepEqual(d.disconnectedDayBoundaries, [], 'the bounce connects internally');
  assert.equal(d.omitsCanonicalEnd, true, 'it finishes back at Kebnekaise');
  assert.ok(isValidDays(days, TOPOLOGY));
});

test('omitted start and end are reported for a section hike', () => {
  const days = [day([hiking(leg('d3'), leg('d4'))])];
  const d = dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY);
  assert.deepEqual(d.missingStageIds, ['d1', 'd2', 'd5', 'd6', 'd7']);
  assert.equal(d.omitsCanonicalStart, true);
  assert.equal(d.omitsCanonicalEnd, true);
  assert.deepEqual(d.disconnectedDayBoundaries, []);
});

test('a plan with no walking at all omits everything, quietly', () => {
  const days = [day([travel()]), day([rest()])];
  const d = dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY);
  assert.equal(d.missingStageIds.length, 7);
  assert.equal(d.omitsCanonicalStart, true);
  assert.equal(d.omitsCanonicalEnd, true);
  assert.deepEqual(d.disconnectedDayBoundaries, []);
});

test('disconnected boundaries skip intervening travel and rest days', () => {
  const days = [
    day([hiking(leg('d1'))]),
    day([travel()]),
    day([rest()]),
    day([hiking(leg('d5'))]), // resumes far from Abiskojaure
  ];
  const d = dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY);
  assert.equal(d.disconnectedDayBoundaries.length, 1);
  assert.equal(d.disconnectedDayBoundaries[0].fromDayId, days[0].id);
  assert.equal(d.disconnectedDayBoundaries[0].toDayId, days[3].id);
});

test('summary lines are counted, informational and never empty-for-nothing', () => {
  const days = [
    day([hiking(leg('d1'))]),
    day([hiking(leg('d3'))]),
    day([hiking(leg('d3', 'opposite'))]),
  ];
  const lines = coverageSummaryLines(dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY));
  assert.ok(lines.some((l) => /route sections are not planned/.test(l)));
  assert.ok(lines.some((l) => /walked more than once/.test(l)));
  assert.ok(lines.some((l) => /walked in reverse/.test(l)));
  assert.ok(lines.some((l) => /ends before the route’s end/.test(l)));
  for (const line of lines) {
    assert.ok(!/error|invalid|fix|broken/i.test(line), `informational, not alarming: ${line}`);
  }
});

test('diagnostics never mutate their input', () => {
  const days = [...throughRoute().slice(0, 3), day([hiking(leg('d7', 'opposite'))])];
  const frozen = JSON.stringify(days);
  dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY);
  coverageSummaryLines(dayPlanCoverageDiagnostics(days, FORWARD, TOPOLOGY));
  assert.equal(JSON.stringify(days), frozen);
});

test('malformed input degrades to empty answers, never a crash', () => {
  const d = dayPlanCoverageDiagnostics(null, FORWARD, TOPOLOGY);
  assert.equal(d.missingStageIds.length, 7, 'nothing walks, so everything is missing');
  assert.deepEqual(dayPlanCoverageDiagnostics([], FORWARD, []).missingStageIds, []);
  assert.equal(hasCoverageDifferences(null), false);
  assert.deepEqual(coverageSummaryLines(null), []);
});
