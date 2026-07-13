/**
 * RouteDirection constants + validator (src/route/direction.mjs) and the
 * reverse day-guide / editorial resolvers. Pure logic, exercised directly.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DIRECTION,
  REVERSE_DIRECTION,
  ROUTE_DIRECTIONS,
  isReversed,
  isRouteDirection,
  normalizeDirection,
  oppositeDirection,
} from '../src/route/direction.mjs';
import { stageGuide, STAGE_GUIDES, REVERSE_STAGE_GUIDES } from '../src/data/stageGuides.mjs';
import { stageNote, stageEstimatedHours } from '../src/data/stageEditorial.mjs';

test('the two directions are exactly the supported set, canonical first', () => {
  assert.deepEqual(ROUTE_DIRECTIONS, ['abisko-to-nikkaluokta', 'nikkaluokta-to-abisko']);
  assert.equal(DEFAULT_DIRECTION, 'abisko-to-nikkaluokta');
  assert.equal(REVERSE_DIRECTION, 'nikkaluokta-to-abisko');
});

test('isRouteDirection accepts only the two known values', () => {
  assert.ok(isRouteDirection('abisko-to-nikkaluokta'));
  assert.ok(isRouteDirection('nikkaluokta-to-abisko'));
  for (const bad of ['', 'reverse', 'north', 42, null, undefined, {}, true]) {
    assert.ok(!isRouteDirection(bad), `${JSON.stringify(bad)} is not a direction`);
  }
});

test('normalizeDirection defaults unknown values to the canonical direction', () => {
  assert.equal(normalizeDirection('nikkaluokta-to-abisko'), 'nikkaluokta-to-abisko');
  for (const bad of ['', 'x', null, undefined, 9, {}]) {
    assert.equal(normalizeDirection(bad), 'abisko-to-nikkaluokta');
  }
});

test('opposite / isReversed behave as an involution', () => {
  assert.equal(oppositeDirection(DEFAULT_DIRECTION), REVERSE_DIRECTION);
  assert.equal(oppositeDirection(REVERSE_DIRECTION), DEFAULT_DIRECTION);
  assert.equal(oppositeDirection(oppositeDirection(DEFAULT_DIRECTION)), DEFAULT_DIRECTION);
  assert.equal(isReversed(REVERSE_DIRECTION), true);
  assert.equal(isReversed(DEFAULT_DIRECTION), false);
  assert.equal(isReversed('garbage'), false);
});

// ---- Direction-aware editorial ---------------------------------------------

const STAGE_IDS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'];

test('every stage has a distinct, non-empty note per direction', () => {
  for (const id of STAGE_IDS) {
    const fwd = stageNote(id, DEFAULT_DIRECTION);
    const rev = stageNote(id, REVERSE_DIRECTION);
    assert.ok(fwd.length > 0, `${id} forward note`);
    assert.ok(rev.length > 0, `${id} reverse note`);
    assert.notEqual(fwd, rev, `${id} note is reoriented, not identical`);
  }
});

test('estimated hours are shared (direction-neutral) and positive', () => {
  for (const id of STAGE_IDS) {
    assert.ok(stageEstimatedHours(id) > 0, `${id} has an estimate`);
  }
});

test('stageGuide returns the canonical guide forward and a merged guide reverse', () => {
  for (const id of STAGE_IDS) {
    const fwd = stageGuide(id, DEFAULT_DIRECTION);
    assert.equal(fwd, STAGE_GUIDES[id], `${id} forward guide is the canonical object`);

    const rev = stageGuide(id, REVERSE_DIRECTION);
    // Reverse merges direction-neutral fields (terrain/sources/date) with the
    // reoriented overview/highlights/watchFor.
    assert.equal(rev.terrain, STAGE_GUIDES[id].terrain, `${id} terrain is shared`);
    assert.deepEqual(rev.sourceIds, STAGE_GUIDES[id].sourceIds, `${id} sources are shared`);
    assert.equal(rev.lastVerified, STAGE_GUIDES[id].lastVerified, `${id} verification is shared`);
    assert.equal(rev.overview, REVERSE_STAGE_GUIDES[id].overview, `${id} reverse overview`);
    assert.notEqual(rev.overview, STAGE_GUIDES[id].overview, `${id} overview is reoriented`);
  }
});

test('every reverse guide is structurally valid (2–4 highlights, non-empty prose)', () => {
  for (const id of STAGE_IDS) {
    const g = stageGuide(id, REVERSE_DIRECTION);
    assert.ok(g.overview.length > 40, `${id} reverse overview length`);
    assert.ok(Array.isArray(g.highlights) && g.highlights.length >= 2 && g.highlights.length <= 4, `${id} highlights`);
    assert.ok(Array.isArray(g.watchFor) && g.watchFor.length > 0, `${id} watchFor`);
    for (const h of g.highlights) assert.ok(typeof h === 'string' && h.trim().length > 0);
  }
});

test('unknown stage / direction inputs are handled safely', () => {
  assert.equal(stageGuide('not-a-stage', REVERSE_DIRECTION), undefined);
  assert.equal(stageNote('not-a-stage', REVERSE_DIRECTION), '');
  // An unknown direction string falls back to the forward note.
  assert.equal(stageNote('d1', 'garbage'), stageNote('d1', DEFAULT_DIRECTION));
});
