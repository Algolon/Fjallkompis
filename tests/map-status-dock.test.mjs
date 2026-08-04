/**
 * Trail status dock state machine (src/map/mapDockState.mjs).
 *
 * Every state a hiker can be in must produce honest wording and exactly one
 * primary action. The rules with teeth:
 *  - "off route" is said ONLY for a live off-route status;
 *  - an unmatched one-shot fix reports uncertainty, never a route verdict;
 *  - stage progress appears only when the fix is reliably matched to the
 *    CURRENT stage, and a frozen live reading says that it is frozen;
 *  - with no current stage, the dock explains what tracking needs instead of
 *    silently offering it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dockStatus } from '../src/map/mapDockState.mjs';

const STAGE = 'Day 4';

test('no fix yet: offer Locate, and name what live tracking would follow', () => {
  const s = dockStatus({ hasCurrentStage: true, stageLabel: STAGE });
  assert.equal(s.kind, 'idle');
  assert.equal(s.actionKind, 'locate');
  assert.equal(s.actionLabel, 'Locate');
  assert.match(s.detail, /Day 4/);
  assert.equal(s.showProgress, false);
});

test('no current stage: say so plainly (Locate still works)', () => {
  const s = dockStatus({ hasCurrentStage: false });
  assert.equal(s.kind, 'no-stage');
  assert.match(s.detail, /needs a current stage/i);
  assert.match(s.detail, /Stages/);
  assert.equal(s.actionKind, 'locate');
});

test('locating: progress is communicated, no action offered meanwhile', () => {
  const s = dockStatus({ locating: true, hasCurrentStage: true, stageLabel: STAGE });
  assert.equal(s.kind, 'locating');
  assert.equal(s.headline, 'Locating…');
  assert.equal(s.actionKind, null);
});

test('GPS denied or failed: the error is shown with a retry', () => {
  const s = dockStatus({
    error: 'Location permission denied. Use manual mode below.',
    hasCurrentStage: true,
    stageLabel: STAGE,
  });
  assert.equal(s.kind, 'error');
  assert.equal(s.tone, 'warn');
  assert.match(s.detail, /permission denied/i);
  assert.equal(s.actionKind, 'locate');
  assert.equal(s.actionLabel, 'Retry');
});

test('one-shot fix, matched: compact remaining progress', () => {
  const s = dockStatus({
    hasFix: true,
    fixSource: 'gps',
    matched: true,
    hasCurrentStage: true,
    stageLabel: STAGE,
    percent: 61.6,
    remainingLabel: '4.8 km',
  });
  assert.equal(s.kind, 'fix');
  assert.match(s.headline, /GPS fix · Day 4/);
  assert.match(s.detail, /62% · 4\.8 km left/);
  assert.equal(s.showProgress, true);
  assert.equal(s.percent, 61.6);
});

test('manual position is named as such, never as a GPS reading', () => {
  const s = dockStatus({
    hasFix: true,
    fixSource: 'manual',
    matched: true,
    hasCurrentStage: true,
    stageLabel: STAGE,
    percent: 0,
    remainingLabel: '12.0 km',
  });
  assert.match(s.headline, /Pinned to a stop/);
});

test('one-shot fix that will not match: uncertainty, NOT an off-route claim', () => {
  const s = dockStatus({
    hasFix: true,
    fixSource: 'gps',
    matched: false,
    hasCurrentStage: true,
    stageLabel: STAGE,
  });
  assert.equal(s.kind, 'fix');
  assert.equal(s.tone, 'warn');
  assert.match(s.detail, /Not reliably matched to Day 4/);
  assert.ok(!/off route/i.test(s.detail), 'never claims the hiker is off route');
  assert.equal(s.showProgress, false);
});

test('a fix without a current stage explains what is missing', () => {
  const s = dockStatus({ hasFix: true, fixSource: 'gps', hasCurrentStage: false });
  assert.match(s.detail, /Set a current stage/);
  assert.equal(s.showProgress, false);
});

test('live tracking: progress, a Stop action, and the tracked stage named', () => {
  const s = dockStatus({
    trackingActive: true,
    routeStatus: 'on-route',
    matched: true,
    hasCurrentStage: true,
    stageLabel: STAGE,
    percent: 40,
    remainingLabel: '7.4 km',
  });
  assert.equal(s.kind, 'live');
  assert.equal(s.actionKind, 'stop');
  assert.equal(s.actionLabel, 'Stop');
  assert.match(s.headline, /Tracking Day 4/);
  assert.match(s.detail, /40% · 7\.4 km left/);
  assert.match(s.detail, /live, approximate/);
  assert.equal(s.showProgress, true);
});

test('live, frozen progress says it is frozen', () => {
  const s = dockStatus({
    trackingActive: true,
    routeStatus: 'on-route',
    matched: true,
    progressStale: true,
    hasCurrentStage: true,
    stageLabel: STAGE,
    percent: 40,
    remainingLabel: '7.4 km',
  });
  assert.match(s.detail, /frozen at the last reliable match/);
});

test('live, on the route but not on today’s stage: progress is paused, not wrong', () => {
  const s = dockStatus({
    trackingActive: true,
    routeStatus: 'on-route',
    matched: false,
    hasCurrentStage: true,
    stageLabel: STAGE,
  });
  assert.match(s.detail, /On the mapped route, but not on Day 4/);
  assert.ok(!/off route/i.test(s.detail));
  assert.equal(s.showProgress, false);
  assert.equal(s.actionKind, 'stop', 'stopping stays available in every live state');
});

test('live and genuinely off route: the warning tone and the exact words', () => {
  const s = dockStatus({
    trackingActive: true,
    routeStatus: 'off-route',
    hasCurrentStage: true,
    stageLabel: STAGE,
  });
  assert.equal(s.tone, 'warn');
  assert.equal(s.headline, 'You may be off route');
  assert.match(s.detail, /check the map and your surroundings/);
  assert.equal(s.actionKind, 'stop');
});

test('live but uncertain: uncertainty is communicated as uncertainty', () => {
  const s = dockStatus({
    trackingActive: true,
    routeStatus: 'uncertain',
    hasCurrentStage: true,
    stageLabel: STAGE,
  });
  assert.equal(s.tone, 'warn');
  assert.equal(s.headline, 'GPS signal uncertain');
  assert.match(s.detail, /route status unavailable/);
  assert.ok(!/off route/i.test(s.headline + s.detail));
});

test('every state answers with at most one primary action', () => {
  const states = [
    dockStatus(),
    dockStatus({ locating: true }),
    dockStatus({ error: 'x' }),
    dockStatus({ hasFix: true, hasCurrentStage: true, stageLabel: STAGE }),
    dockStatus({ trackingActive: true, hasCurrentStage: true, stageLabel: STAGE }),
  ];
  for (const s of states) {
    assert.ok(['locate', 'stop', null].includes(s.actionKind));
    assert.ok(s.headline.length > 0 && s.detail.length > 0, 'always says something');
    assert.ok(['neutral', 'warn'].includes(s.tone));
  }
});
