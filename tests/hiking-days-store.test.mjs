/**
 * Store contracts for Hiking days (src/store/AppStore.tsx).
 *
 * Source-text contracts, the same technique the route-direction and Today
 * Prepare suites use for React surfaces: they fence the ARCHITECTURAL rules
 * that make the feature safe, which no pure-model test can see —
 *
 *   - `currentStageId` stays the ONLY persisted current-position pointer;
 *   - the derived planned days come from the pure module, never inline logic;
 *   - a direction change resets the plan in the SAME state update, so no
 *     render can observe a plan whose direction disagrees with the route;
 *   - components never touch `groups` directly.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const store = read('src/store/AppStore.tsx');
const types = read('src/types/index.ts');
const migration = read('src/utils/stateMigration.mjs');
const storage = read('src/utils/storage.ts');

// ---- Persisted shape --------------------------------------------------------

test('only the day plan is persisted — planned days are derived', () => {
  assert.match(types, /dayPlan: DayPlanState \| null;/);
  assert.match(types, /export interface DayPlanState \{/);
  // The three primitives, and nothing else.
  assert.match(types, /export interface DayPlanState \{\s*direction: RouteDirection;[\s\S]*?firstDate: string;[\s\S]*?groups: number\[\];\s*\}/);
  // Derived shapes must NOT be part of the persisted state module.
  assert.ok(
    !/export interface PlannedDay/.test(types),
    'PlannedDay lives with the derivation, not with the persisted types',
  );
});

test('no speculative day-type, id or per-day date field is persisted', () => {
  const declaration = /export interface DayPlanState \{[\s\S]*?\n\}/.exec(types)[0];
  for (const forbidden of ["type:", 'id:', 'dates:', 'days:', 'stageIds', 'activeDay']) {
    assert.ok(
      !declaration.includes(forbidden),
      `DayPlanState must not persist ${forbidden}`,
    );
  }
});

test('currentStageId remains the ONLY persisted current-position pointer', () => {
  assert.match(types, /currentStageId: string \| null;/);
  for (const forbidden of [
    'currentPlannedDayId',
    'activeDayIndex',
    'currentDayIndex',
    'currentDayId',
  ]) {
    assert.ok(!types.includes(forbidden), `${forbidden} must not be persisted`);
    assert.ok(!store.includes(forbidden), `${forbidden} must not exist in the store`);
  }
  // The active day is DERIVED from the stage pointer.
  assert.match(store, /currentPlannedDayOf\(plannedDays\)/);
  assert.match(store, /buildPlannedDays\(itinerary\.stages, state\.dayPlan, state\.currentStageId\)/);
});

test('the schema bumped to v7 and defaults to no plan', () => {
  assert.match(migration, /export const SCHEMA_VERSION = 7;/);
  assert.match(migration, /dayPlan: null,/);
  assert.match(migration, /dayPlan: normalizeDayPlan\(raw\.dayPlan, direction, stageCount\)/);
  // The canonical stage count is supplied by the caller, not imported here.
  assert.ok(
    !/routeData|kungsleden-route/.test(migration),
    'the migration module stays free of route-data imports',
  );
  assert.match(storage, /normalizeAgainstSchema\(raw, DEFAULT_STAGE_ID, STAGES\.length\)/);
});

// ---- Derivation -------------------------------------------------------------

test('the store derives planned days from the pure module, memoised', () => {
  assert.match(store, /import \{ buildPlannedDays, currentPlannedDayOf \} from '\.\.\/plan\/plannedDays\.mjs'/);
  assert.match(store, /const plannedDays = useMemo<PlannedDay\[\]>/);
  assert.match(store, /const currentPlannedDay = useMemo<PlannedDay \| null>/);
});

test('the plan is never derived from anything but the persisted primitives', () => {
  // No date arithmetic, grouping or aggregation inline in the store.
  assert.ok(!/new Date\(/.test(store), 'no ad-hoc date maths in the store');
  assert.ok(
    !/\.slice\(offset/.test(store),
    'grouping lives in the pure module, not the store',
  );
});

// ---- Actions ----------------------------------------------------------------

test('the store exposes the day-plan actions and no group-level API', () => {
  for (const action of [
    'setFirstHikingDate',
    'toggleDayBoundary',
    'resetDayPlan',
    'removeDayPlan',
    'activatePlannedDay',
  ]) {
    assert.ok(store.includes(action), `${action} is exposed`);
  }
  assert.ok(
    !/setGroups|updateGroups|setDayGroups/.test(store),
    'no action hands raw groups to components',
  );
  // Setting the first date is also how a plan is created, so there is no
  // second, redundant create action on the store surface.
  const surface = /interface AppStore \{[\s\S]*?\n\}/.exec(store)[0];
  assert.ok(!/createDayPlan/.test(surface), 'no redundant create action');
});

test('activating a day selects that day’s FIRST canonical stage', () => {
  assert.match(store, /const day = plannedDays\[dayIndex\];\s*if \(day\) setCurrentStage\(day\.stages\[0\]\.id\)/);
});

test('clearing the first date never deletes a plan', () => {
  assert.match(store, /if \(!isRealIsoDate\(firstDate\)\) return s;/);
  // Removal is its own explicit action.
  assert.match(store, /const removeDayPlan = useCallback\(\(\) => \{[\s\S]*?dayPlan: null/);
});

test('reset keeps the date and direction; remove drops only the plan', () => {
  const reset = /const resetDayPlan = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.match(reset, /\.\.\.s\.dayPlan, groups/, 'reset patches only the grouping');
  const remove = /const removeDayPlan = useCallback\([\s\S]*?\}, \[\]\);/
    .exec(store)[0]
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  assert.match(
    remove,
    /setState\(\(s\) => \(s\.dayPlan \? \{ \.\.\.s, dayPlan: null \} : s\)\);/,
    'removal spreads the state and nulls ONLY the plan',
  );
  assert.ok(
    !/currentStageId|packing|journal|trip:/.test(remove),
    'removal touches nothing but the plan',
  );
});

test('boundary toggling goes through the pure inverse-safe helper', () => {
  assert.match(store, /const groups = toggleBoundary\(s\.dayPlan\.groups, stageIndex\)/);
});

// ---- Route direction --------------------------------------------------------

test('a direction change resets the plan ATOMICALLY in the same update', () => {
  const action = /const setRouteDirection = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.match(action, /if \(s\.routeDirection === next\) return s;/);
  assert.match(action, /direction: next,/);
  assert.match(action, /groups: defaultGroups\(/);
  assert.match(
    action,
    /return \{ \.\.\.s, routeDirection: next, dayPlan \};/,
    'direction and plan land in ONE state update',
  );
  // The first hiking date survives; the grouping is never mirrored.
  assert.ok(!/reverse\(\)/.test(action), 'groupings are reset, never mirrored');
  assert.match(action, /\.\.\.s\.dayPlan,/, 'the existing plan (and its date) is patched');
});

// ---- Canonical data ---------------------------------------------------------

test('the plan modules never import canonical route or content data', () => {
  for (const file of ['src/plan/dayPlan.mjs', 'src/plan/plannedDays.mjs']) {
    const src = read(file);
    for (const forbidden of [
      'routeData',
      'kungsleden-route',
      'stageGuides',
      'stageHighlights',
      'routeExperiences',
      'experienceGeometry',
      'hydrate',
    ]) {
      assert.ok(!src.includes(forbidden), `${file} must not import ${forbidden}`);
    }
  }
});

test('no route, GPX or generated data module gained a day-plan dependency', () => {
  const walk = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  for (const rel of [...walk('src/route'), ...walk('src/map'), ...walk('src/data')]) {
    if (!/\.(tsx?|mjs)$/.test(rel)) continue;
    assert.ok(
      !read(rel).includes('plan/dayPlan') && !read(rel).includes('plan/plannedDays'),
      `${rel} must stay independent of the personal day plan`,
    );
  }
});
