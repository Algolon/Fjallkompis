/**
 * Map initial-view default — regression fences for the "Map starts on Full
 * route" correction (v0.11.0).
 *
 * Two DIFFERENT concepts must stay decoupled:
 *  - current trip stage: the hiker's active day. A clean state still
 *    defaults it to the FIRST stage (Day 1) — Today, Tonight's stop,
 *    Stages, live tracking and progress keep relying on that;
 *  - Map browsing selection: what the user is looking at on the Map. A
 *    freshly mounted Map (including a direct #/map load) starts on the
 *    Full route overview (null), NOT on the current trip stage.
 *
 * The browser-level behaviours (selector state, statistics, elevation
 * source, camera) hang off these two values; the Playwright pass exercises
 * them end-to-end.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultState, normalizeState } from '../src/utils/stateMigration.mjs';
import { INITIAL_MAP_VIEW_STAGE_ID } from '../src/map/mapDefaults.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const generated = JSON.parse(
  readFileSync(join(ROOT, 'src/generated/kungsleden-route.json'), 'utf8'),
);
// The app wires DEFAULT_STAGE_ID = STAGES[0].id into defaultState(); the
// first generated stage is that same Day 1.
const firstStageId = generated.stages[0].id;

test('clean state still defaults the current TRIP stage to Day 1', () => {
  const state = defaultState(firstStageId);
  assert.equal(state.currentStageId, firstStageId);
  assert.notEqual(state.currentStageId, null);
});

test('normalising junk state keeps the Day 1 trip-stage default', () => {
  assert.equal(normalizeState(undefined, firstStageId).currentStageId, firstStageId);
  assert.equal(normalizeState({ nonsense: true }, firstStageId).currentStageId, firstStageId);
});

test('a freshly mounted Map browses the FULL ROUTE, not the trip stage', () => {
  // MapScreen seeds viewStageId from this constant; null = Full route
  // (selector on "Full route", full-route statistics + elevation profile,
  // camera fitted to the complete route).
  assert.equal(INITIAL_MAP_VIEW_STAGE_ID, null);
  // The decoupling is the point: the map default must NOT equal the
  // trip-stage default.
  assert.notEqual(INITIAL_MAP_VIEW_STAGE_ID, defaultState(firstStageId).currentStageId);
});
