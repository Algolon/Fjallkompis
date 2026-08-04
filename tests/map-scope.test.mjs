/**
 * Map SCOPE vocabulary (src/map/mapScope.mjs) — the words that keep the two
 * stage concepts apart:
 *   · the VIEWED scope, changed by the Map's scope control;
 *   · the TRACKED (persisted current) stage, changed only in Stages.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FULL_ROUTE_LABEL,
  scopeMismatch,
  scopePillLabel,
  stageScopeLabel,
  stageShortLabel,
} from '../src/map/mapScope.mjs';

test('a stage scope names the day and both endpoints, in walking order', () => {
  assert.equal(
    stageScopeLabel({ day: 3, fromName: 'Alesjaure', toName: 'Tjäktja' }),
    'Day 3 · Alesjaure → Tjäktja',
  );
  // Reversed direction is just the itinerary's own order — no mirroring here.
  assert.equal(
    stageScopeLabel({ day: 1, fromName: 'Nikkaluokta', toName: 'Kebnekaise' }),
    'Day 1 · Nikkaluokta → Kebnekaise',
  );
  assert.equal(stageShortLabel(4), 'Day 4');
});

test('the pill reads the focus, then the viewed stage, then the full route', () => {
  assert.equal(scopePillLabel(), FULL_ROUTE_LABEL);
  assert.equal(scopePillLabel({}), FULL_ROUTE_LABEL);
  assert.equal(
    scopePillLabel({ viewStage: { day: 2, fromName: 'A', toName: 'B' } }),
    'Day 2 · A → B',
  );
  // A temporary "View on map" focus wins while it is showing.
  assert.equal(
    scopePillLabel({ focusLabel: 'STF Kiruna', viewStage: { day: 2, fromName: 'A', toName: 'B' } }),
    'STF Kiruna',
  );
});

test('the mismatch names BOTH stages when the map browses a different day', () => {
  assert.deepEqual(
    scopeMismatch({ viewedStageId: 'd5', viewedDay: 5, trackedStageId: 'd4', trackedDay: 4 }),
    { viewing: 'Day 5', tracking: 'Day 4' },
  );
});

test('nothing to explain → no mismatch line', () => {
  // Same stage.
  assert.equal(
    scopeMismatch({ viewedStageId: 'd4', viewedDay: 4, trackedStageId: 'd4', trackedDay: 4 }),
    null,
  );
  // No current stage at all.
  assert.equal(scopeMismatch({ viewedStageId: 'd5', viewedDay: 5 }), null);
  // Full-route browsing makes no competing claim about the tracked day.
  assert.equal(scopeMismatch({ trackedStageId: 'd4', trackedDay: 4 }), null);
  assert.equal(scopeMismatch(), null);
});

test('the module never reaches for route or store data', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const src = readFileSync(join(root, 'src/map/mapScope.mjs'), 'utf8');
  assert.ok(!/\bimport\b/.test(src), 'pure: every name is injected');
});
