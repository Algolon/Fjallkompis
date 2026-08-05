/**
 * Trail identity and mismatch safety (schema v11).
 *
 * The problem this fences, in one line: personal data references trail content
 * by LOCAL ids, so a hiking leg that says `stageId: 'd1'` is only meaningful
 * inside one trail. Before this schema step, data written for a different
 * route validated perfectly against the Kungsleden topology and was silently
 * reinterpreted as Abisko → Abiskojaure (demonstrated by the second-route
 * architecture probe, draft PR #97).
 *
 * The contract:
 *   - legacy (no claim)  → migrate, adopt, lose nothing;
 *   - matching claim     → business as usual;
 *   - different claim    → refuse, atomically, before any local id is read.
 *
 * Behavioural tests run against the real modules. A few STRUCTURAL fences
 * check the thin TypeScript boundaries (storage.ts / exportImport.ts /
 * SettingsScreen.tsx) by source text, the convention this repo already uses
 * for TS wiring that `node --test` cannot import (see day-plan-store.test.mjs).
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTIVE_TRAIL_ID,
  isTrailId,
  readTrailId,
  trailIdentityOf,
} from '../src/data/trailIdentity.mjs';
import {
  SCHEMA_VERSION,
  defaultState,
  normalizeState,
  readState,
} from '../src/utils/stateMigration.mjs';
import { ROUTE_DIRECTIONS } from '../src/route/direction.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (p) => readFileSync(join(ROOT, p), 'utf8');

const TOPOLOGY = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

const leg = (id, stageId, orientation = 'canonical') => ({
  id,
  kind: 'canonical-stage',
  stageId,
  orientation,
});

const load = (raw) => normalizeState(structuredClone(raw), 'd1', TOPOLOGY);
const read = (raw) => readState(structuredClone(raw), 'd1', TOPOLOGY);

/** A realistic personalised state: plan, pointers, trip, journal, notes. */
function populatedState() {
  const s = defaultState('d1');
  s.currentStageId = 'd3';
  s.hutData = { salka: { notes: 'Sauna coins!' } };
  s.journal = [{ id: 'j_1', date: '2026-09-04', stageId: 'd2', note: 'Long day' }];
  s.trip = [
    {
      id: 'trip_bus',
      kind: 'transport',
      title: 'Bus to Nikkaluokta',
      mode: 'bus',
      date: '2026-09-10',
      status: 'confirmed',
      attachmentIds: ['doc_ticket'],
      createdAt: 1,
      updatedAt: 2,
    },
  ];
  s.packing = [
    ...s.packing.slice(0, 3),
    {
      id: 'custom_rod',
      label: 'Fishing rod',
      categoryId: 'comfort',
      quantity: 1,
      status: 'packed',
      wornQuantity: 0,
      essential: false,
      custom: true,
    },
  ];
  s.dayPlan = {
    direction: 'abisko-to-nikkaluokta',
    startDate: '2026-09-01',
    journeyActive: true,
    currentDayId: 'day_2',
    currentLegId: 'leg_2a',
    days: [
      { id: 'day_1', activities: [{ kind: 'travel' }], overnight: { kind: 'stop', stopId: 'abisko' } },
      { id: 'day_2', activities: [{ kind: 'hiking', legs: [leg('leg_2a', 'd1'), leg('leg_2b', 'd2')] }] },
      { id: 'day_3', activities: [{ kind: 'rest' }] },
    ],
  };
  return s;
}

// ---------------------------------------------------------------------------
// 11.1 The trail id constant
// ---------------------------------------------------------------------------

test('the active trail id is one stable, semantic value', () => {
  assert.equal(ACTIVE_TRAIL_ID, 'kungsleden-abisko-nikkaluokta');
  assert.ok(isTrailId(ACTIVE_TRAIL_ID));
  // No content or app version rides along in the identity.
  assert.ok(!/\d+\.\d+/.test(ACTIVE_TRAIL_ID), 'no version in the id');
});

test('the id is defined in exactly one production place', () => {
  // Every other module imports it; nobody re-spells the literal.
  const definition = source('src/data/trailIdentity.mjs');
  assert.match(definition, /export const ACTIVE_TRAIL_ID = 'kungsleden-abisko-nikkaluokta';/);

  for (const path of [
    'src/utils/stateMigration.mjs',
    'src/utils/storage.ts',
    'src/utils/exportImport.ts',
    'src/types/index.ts',
  ]) {
    assert.ok(
      !source(path).includes("'kungsleden-abisko-nikkaluokta'"),
      `${path} must import the id, never restate it`,
    );
  }
});

test('walking direction never changes the trail id', () => {
  // Both directions are the same physical dossier.
  for (const direction of ROUTE_DIRECTIONS) {
    const s = load({ ...populatedState(), routeDirection: direction });
    assert.equal(s.trailId, ACTIVE_TRAIL_ID, direction);
    assert.equal(s.routeDirection, direction, 'direction itself still round-trips');
  }
});

test('the default state carries the id and the current schema', () => {
  const s = defaultState('d1');
  assert.equal(s.trailId, ACTIVE_TRAIL_ID);
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 11);
});

// ---------------------------------------------------------------------------
// 11.2 Legacy migration — every pre-v11 state is Kungsleden data
// ---------------------------------------------------------------------------

test('a current-schema state without a trail id migrates to the active trail', () => {
  const legacy = populatedState();
  delete legacy.trailId;
  legacy.schemaVersion = 10;

  const s = load(legacy);
  assert.equal(s.trailId, ACTIVE_TRAIL_ID);
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
});

test('the legacy migration is additive — nothing else about the state changes', () => {
  const legacy = populatedState();
  delete legacy.trailId;
  legacy.schemaVersion = 10;

  const migrated = load(legacy);
  const reference = load(populatedState()); // same data, id already present

  // The ONLY difference between "already identified" and "migrated" is nothing.
  assert.deepEqual(migrated, reference);

  // And spelled out slice by slice, against the original input.
  assert.equal(migrated.currentStageId, legacy.currentStageId);
  assert.equal(migrated.routeDirection, legacy.routeDirection);
  assert.deepEqual(migrated.hutData, legacy.hutData);
  assert.deepEqual(migrated.journal, legacy.journal);
  assert.deepEqual(migrated.trip, legacy.trip);
  assert.deepEqual(migrated.packing, legacy.packing);
  assert.deepEqual(migrated.dayPlan, legacy.dayPlan);
  assert.equal(migrated.dayPlanRecovery, null);
});

test('older schema versions and bare legacy blobs migrate too', () => {
  // A v1-era blob: no direction, no packing template, no trip, no plan.
  const v1 = {
    schemaVersion: 1,
    currentStageId: 'd3',
    hutData: { salka: { notes: 'Sauna coins!', shopOverride: 'gone' } },
    journal: [{ id: 'j_1', date: '2026-09-04' }],
  };
  const fromV1 = load(v1);
  assert.equal(fromV1.trailId, ACTIVE_TRAIL_ID);
  assert.equal(fromV1.currentStageId, 'd3');
  assert.deepEqual(fromV1.hutData, { salka: { notes: 'Sauna coins!' } });

  // A bare blob with almost nothing in it.
  const bare = load({ currentStageId: 'd2' });
  assert.equal(bare.trailId, ACTIVE_TRAIL_ID);
  assert.equal(bare.currentStageId, 'd2');

  // Unusable input still lands on defaults — which now carry the id.
  for (const raw of [null, undefined, 42, 'a string', []]) {
    assert.equal(normalizeState(raw, 'd1', TOPOLOGY).trailId, ACTIVE_TRAIL_ID, String(raw));
  }
});

test('an absent, null or blank claim all read as legacy — never as foreign', () => {
  for (const value of [undefined, null, '', '   ']) {
    const raw = { ...populatedState(), trailId: value };
    if (value === undefined) delete raw.trailId;
    assert.equal(trailIdentityOf(raw), 'legacy', String(value));
    assert.equal(readTrailId(raw), null);
    assert.equal(read(raw).ok, true);
  }
});

// ---------------------------------------------------------------------------
// 11.3 Matching state
// ---------------------------------------------------------------------------

test('a matching state normalises unchanged and round-trips', () => {
  const original = populatedState();
  assert.equal(trailIdentityOf(original), 'match');

  const result = read(original);
  assert.equal(result.ok, true);
  assert.equal(result.identity, 'match');
  assert.equal(result.state.trailId, ACTIVE_TRAIL_ID);

  // Through a full export envelope and back.
  const envelope = {
    app: 'fjallkompis',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-09-06T09:15:00.000Z',
    state: result.state,
  };
  const parsed = JSON.parse(JSON.stringify(envelope));
  const restored = load(parsed.state);
  assert.equal(restored.trailId, ACTIVE_TRAIL_ID, 'the id survives export/import');
  assert.deepEqual(restored, result.state);
});

test('normalisation stays idempotent with the id in place', () => {
  const once = load(populatedState());
  const twice = load(once);
  assert.deepEqual(twice, once);
  assert.deepEqual(JSON.parse(JSON.stringify(once)), once, 'JSON-stable');
});

test('a legacy blob and its migrated form converge on the same state', () => {
  const legacy = populatedState();
  delete legacy.trailId;
  assert.deepEqual(load(load(legacy)), load(legacy));
});

// ---------------------------------------------------------------------------
// 11.4 / 11.8 Mismatch — the core regression
// ---------------------------------------------------------------------------

test('REGRESSION: a foreign state with a local d1 is never adopted as Kungsleden', () => {
  // The exact shape the architecture probe proved dangerous: a perfectly
  // well-formed personal plan whose stage ids happen to collide with ours.
  const foreign = {
    schemaVersion: SCHEMA_VERSION,
    trailId: 'delft-pilot',
    currentStageId: 'd1',
    routeDirection: 'abisko-to-nikkaluokta',
    dayPlan: {
      startDate: '2026-09-01',
      currentDayId: 'day_1',
      currentLegId: 'leg_1',
      days: [{ id: 'day_1', activities: [{ kind: 'hiking', legs: [leg('leg_1', 'd1')] }] }],
    },
  };

  const result = read(foreign);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'trail-mismatch');
  assert.equal(result.trailId, 'delft-pilot');
  assert.equal(result.expectedTrailId, ACTIVE_TRAIL_ID);
  assert.equal('state' in result, false, 'no state is returned — nothing to half-apply');

  // Defence in depth: even the total normaliser refuses to read a field.
  const refused = load(foreign);
  assert.equal(refused.dayPlan, null, "the foreign d1 leg never becomes Kungsleden's d1");
  assert.equal(refused.currentStageId, 'd1', 'this is the DEFAULT stage id, not the foreign one');
  assert.deepEqual(refused, defaultState('d1'));
});

test('the mismatch is decided before any pointer or leg is interpreted', () => {
  // A foreign plan that WOULD survive Kungsleden validation if it were read:
  // connected legs, real stop ids, a valid direction. None of it is adopted,
  // and — critically — it is not preserved as a "recoverable" day plan either,
  // because it was never ours to recover.
  const foreign = {
    ...populatedState(),
    trailId: 'some-other-trail',
  };
  const refused = load(foreign);
  assert.deepEqual(refused, defaultState('d1'));
  assert.equal(refused.dayPlanRecovery, null, 'no partial adoption via recovery either');
  assert.deepEqual(refused.trip, [], 'no trip items leak in');
  assert.deepEqual(refused.journal, [], 'no journal entries leak in');
  assert.deepEqual(refused.hutData, {}, 'no stop notes leak in');
});

test('an unreadable identity claim is refused, not guessed at', () => {
  // A present-but-malformed claim is treated as foreign: the safe direction
  // for an identity field. No real Kungsleden state can produce these.
  for (const value of [42, {}, [], true]) {
    const raw = { ...populatedState(), trailId: value };
    assert.equal(trailIdentityOf(raw), 'mismatch', JSON.stringify(value));
    assert.equal(read(raw).ok, false);
  }
});

test('a foreign id is never coerced to the active one', () => {
  const foreign = { ...populatedState(), trailId: 'kungsleden-something-else' };
  const result = read(foreign);
  assert.equal(result.ok, false);
  assert.equal(result.trailId, 'kungsleden-something-else', 'reported verbatim');
});

// ---------------------------------------------------------------------------
// 11.5 Import atomicity
// ---------------------------------------------------------------------------

test('a refused import leaves the existing state byte-identical', () => {
  // The state the user already has, as the app holds it.
  const current = load(populatedState());
  const before = structuredClone(current);

  // A backup file from another trail arrives.
  const backup = {
    app: 'fjallkompis',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-09-06T09:15:00.000Z',
    state: { ...populatedState(), trailId: 'delft-pilot', currentStageId: 'd7' },
  };
  const candidate = backup.app === 'fjallkompis' && backup.state ? backup.state : backup;
  const result = read(candidate);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'trail-mismatch');
  // Nothing was produced to apply, so nothing could have been applied.
  assert.equal('state' in result, false);
  // And the state the user holds is untouched — same pointers, same plan.
  assert.deepEqual(current, before);
  assert.equal(current.currentStageId, 'd3', 'the pointer did not move to d7');
  assert.equal(current.dayPlan.days.length, 3);
  assert.deepEqual(current.trip.map((i) => i.id), ['trip_bus']);
});

test('the read boundary is pure — deciding a mismatch touches no storage', () => {
  const migration = source('src/utils/stateMigration.mjs');
  assert.ok(!/localStorage|indexedDB/.test(migration), 'the decision layer never writes');

  // The refusal does not mutate its input either.
  const foreign = { ...populatedState(), trailId: 'delft-pilot' };
  const snapshot = structuredClone(foreign);
  read(foreign);
  assert.deepEqual(foreign, snapshot);
});

test('STRUCTURAL: the import boundary refuses with its own reason and honest copy', () => {
  const importer = source('src/utils/exportImport.ts');

  // It goes through the trail-aware read, not the total normaliser.
  assert.match(importer, /readState/);
  assert.ok(!/\bnormalizeState\b/.test(importer), 'parseImport must not bypass the gate');

  // A distinct failure reason, separate from corrupt JSON and bad shape.
  assert.match(importer, /'trail-mismatch'/);
  assert.match(importer, /'invalid-json'/);
  assert.match(importer, /'unexpected-shape'/);

  // The user-facing copy names another trail and never implies corruption.
  const copy = importer.match(/This backup belongs to a different trail[^;]*/)[0];
  assert.match(copy, /different trail/);
  assert.match(copy, /Kungsleden/);
  assert.match(copy, /unchanged/);
  assert.ok(!/corrupt|damaged|broken|invalid file/i.test(copy), copy);

  // The screen applies state only on success.
  const settings = source('src/screens/SettingsScreen.tsx');
  assert.match(settings, /if \(!result\.ok\) \{\s*setNotice\(\{ kind: 'err', text: result\.error \}\);\s*return;/);
});

// ---------------------------------------------------------------------------
// 11.6 Local load of a foreign blob
// ---------------------------------------------------------------------------

test('STRUCTURAL: a foreign stored blob is set aside before the app moves on', () => {
  const storage = source('src/utils/storage.ts');

  // Load goes through the gate.
  assert.match(storage, /const result = readState\(JSON\.parse\(raw\)\);/);
  assert.match(storage, /if \(!result\.ok\)/);

  // The raw text is preserved BEFORE defaults are returned, so the first
  // ordinary save cannot destroy the only copy.
  const branch = storage.match(/if \(!result\.ok\) \{[\s\S]*?return defaultState\(\);/)[0];
  assert.ok(
    branch.indexOf('setAsideForeignState(raw)') < branch.indexOf('return defaultState()'),
    'the blob must be set aside before the app carries on',
  );

  // A dedicated key, and the first foreign blob is never overwritten.
  assert.match(storage, /FOREIGN_STATE_KEY = 'fjallkompis:state:other-trail'/);
  assert.match(storage, /getItem\(FOREIGN_STATE_KEY\) === null/);

  // The active key is a different one — nothing is renamed.
  assert.match(storage, /STORAGE_KEY = 'fjallkompis:state'/);
});

test('a normal legacy load is completely unaffected by the mismatch path', () => {
  const legacy = populatedState();
  delete legacy.trailId;
  const result = read(legacy);
  assert.equal(result.ok, true);
  assert.equal(result.identity, 'legacy');
  assert.equal(result.state.trailId, ACTIVE_TRAIL_ID);
  assert.equal(result.state.dayPlan.days.length, 3, 'the plan loads normally');
  assert.equal(result.state.currentStageId, 'd3');
});

// ---------------------------------------------------------------------------
// Scope guard — this PR adds identity, not a multi-trail product
// ---------------------------------------------------------------------------

test('no second trail, no content version, no trip id sneaked in', () => {
  // The persisted shape gained EXACTLY one field.
  const before = new Set([
    'schemaVersion',
    'currentStageId',
    'routeDirection',
    'hutData',
    'journal',
    'packing',
    'packingTemplateVersion',
    'trip',
    'dayPlan',
    'dayPlanRecovery',
  ]);
  const keys = Object.keys(defaultState('d1'));
  assert.deepEqual(
    keys.filter((k) => !before.has(k)),
    ['trailId'],
    'one new persisted field, no more',
  );
  for (const forbidden of ['contentVersion', 'tripId', 'trailPack', 'trails']) {
    assert.ok(!keys.includes(forbidden), `${forbidden} is out of scope`);
  }

  // Exactly one trail id exists, and no registry of them.
  const identity = source('src/data/trailIdentity.mjs');
  assert.equal(identity.match(/ACTIVE_TRAIL_ID = /g).length, 1);
  assert.ok(!/TRAIL_REGISTRY|ACTIVE_TRAIL_ID\s*=\s*\[|const TRAILS\b/.test(identity));

  // Local ids are untouched: no prefixing, no composite keys.
  const state = load(populatedState());
  assert.equal(state.currentStageId, 'd3', 'stage ids stay bare');
  assert.deepEqual(
    state.dayPlan.days[1].activities[0].legs.map((l) => l.stageId),
    ['d1', 'd2'],
    'leg stage ids stay bare',
  );
  assert.deepEqual(state.dayPlan.days[0].overnight, { kind: 'stop', stopId: 'abisko' });
});
