/**
 * Live-tracking pill state (src/map/mapTrackingPill.mjs) — the Map's ONLY
 * status surface, and only while a session runs.
 *
 * The rules with teeth:
 *  - nothing is shown when no session is running (the idle map is clean);
 *  - "You may be off route" is said only for a debounced off-route status
 *    from the complete-route matcher;
 *  - an uncertain matcher says the MATCH is uncertain, and only after the
 *    damping threshold;
 *  - before any fix lands the pill says it is waiting, never a verdict;
 *  - following vs merely tracking is stated, because a pan pauses the camera
 *    without ending the session;
 *  - there is always an explicit Stop.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { trackingPill, trackingAnnouncement } from '../src/map/mapTrackingPill.mjs';
import { UNCERTAIN_UI_CONSECUTIVE } from '../src/utils/trackingSession.mjs';

test('no session, no pill — the idle map shows nothing at all', () => {
  assert.equal(trackingPill(), null);
  assert.equal(trackingPill({ active: false, hasFix: true, routeStatus: 'on-route' }), null);
});

test('a running session names the tracked stage and offers Stop', () => {
  const pill = trackingPill({
    active: true,
    following: true,
    stageLabel: 'Day 4',
    routeStatus: 'on-route',
    hasFix: true,
  });
  assert.equal(pill.label, 'Following Day 4');
  assert.equal(pill.state, 'On route');
  assert.equal(pill.stopLabel, 'Stop');
  assert.equal(pill.tone, 'neutral');
  assert.equal(pill.following, true);
});

test('a paused camera says "Tracking", not "Following"', () => {
  const pill = trackingPill({
    active: true,
    following: false,
    stageLabel: 'Day 4',
    routeStatus: 'on-route',
    hasFix: true,
  });
  assert.equal(pill.label, 'Tracking Day 4');
  assert.equal(pill.following, false);
  assert.equal(pill.stopLabel, 'Stop', 'stopping stays available while follow is paused');
});

test('before the first fix the pill waits instead of judging', () => {
  const pill = trackingPill({ active: true, following: true, stageLabel: 'Day 1', hasFix: false });
  assert.equal(pill.state, 'Waiting for GPS');
  assert.equal(pill.tone, 'neutral');
});

test('off route is only said for a debounced off-route status', () => {
  const off = trackingPill({
    active: true,
    stageLabel: 'Day 2',
    routeStatus: 'off-route',
    hasFix: true,
  });
  assert.equal(off.state, 'You may be off route');
  assert.equal(off.tone, 'warn');
  assert.match(off.note, /Check the map and your surroundings/);

  // An unknown status never becomes a verdict.
  const unknown = trackingPill({
    active: true,
    stageLabel: 'Day 2',
    routeStatus: 'unknown',
    hasFix: true,
  });
  assert.equal(unknown.state, 'Waiting for GPS');
  assert.ok(!/off route/i.test(unknown.state));
});

test('uncertainty is damped, and reported as an uncertain MATCH', () => {
  const early = trackingPill({
    active: true,
    stageLabel: 'Day 2',
    routeStatus: 'uncertain',
    uncertainStreak: UNCERTAIN_UI_CONSECUTIVE - 1,
    hasFix: true,
  });
  assert.equal(early.state, 'Waiting for GPS', 'a single wobble is not announced');

  const damped = trackingPill({
    active: true,
    stageLabel: 'Day 2',
    routeStatus: 'uncertain',
    uncertainStreak: UNCERTAIN_UI_CONSECUTIVE,
    hasFix: true,
  });
  assert.equal(damped.state, 'Match uncertain');
  assert.ok(!/off route/i.test(damped.state), 'uncertain never becomes off-route');
});

test('the foreground-only caveat travels with the pill', () => {
  const pill = trackingPill({ active: true, stageLabel: 'Day 1', hasFix: true, routeStatus: 'on-route' });
  assert.match(pill.note, /Foreground only/);
});

test('announcements name the state once, without numbers', () => {
  const pill = trackingPill({
    active: true,
    following: true,
    stageLabel: 'Day 3',
    routeStatus: 'on-route',
    hasFix: true,
  });
  assert.equal(trackingAnnouncement(pill), 'Following Day 3. On route.');
  assert.equal(trackingAnnouncement(null), '');
});

test('no stage progress numbers live on the map any more', () => {
  const pill = trackingPill({
    active: true,
    following: true,
    stageLabel: 'Day 3',
    routeStatus: 'on-route',
    hasFix: true,
  });
  const text = `${pill.label} ${pill.state} ${pill.note}`;
  assert.ok(!/%|\bkm\b/.test(text), 'progress readouts belong to a deliberate surface, not the map');
});
