/**
 * Store contracts for the Day plan (src/store/AppStore.tsx).
 *
 * Source-text contracts, the technique this repo uses for React surfaces.
 * They fence the ARCHITECTURAL rules no pure-model test can see:
 *
 *   - planning is OPT-IN: nothing derives, infers or creates a plan;
 *   - the two persisted pointers are only ever written together, in the store;
 *   - a direction change REMOVES a plan rather than reusing it;
 *   - components never receive raw activity arrays to mutate.
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

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---- Persisted shape --------------------------------------------------------

test('the persisted plan is direction, start date, current day and days', () => {
  const declaration = /export interface DayPlanState \{[\s\S]*?\n\}/.exec(types)[0];
  assert.match(declaration, /direction: RouteDirection;/);
  assert.match(declaration, /startDate: string;/);
  assert.match(declaration, /currentDayId: string \| null;/);
  assert.match(declaration, /days: PlannedDayRecord\[\];/);
  // Derived values must NOT be part of the persisted state module.
  assert.ok(!/export interface PlannedDay\b/.test(types), 'PlannedDay is derived, not persisted');
});

test('a persisted day is a stable id, ordered activities and an optional overnight', () => {
  const declaration = /export interface PlannedDayRecord \{[\s\S]*?\n\}/.exec(types)[0];
  assert.match(declaration, /id: string;/);
  assert.match(declaration, /activities: DayActivity\[\];/);
  assert.match(declaration, /overnight\?: OvernightRef;/);
  for (const forbidden of ['date:', 'stageIds', 'distanceKm', 'number:', 'index:']) {
    assert.ok(!declaration.includes(forbidden), `a day must not persist ${forbidden}`);
  }
});

test('the activity union is closed — hiking, travel, rest, nothing else', () => {
  const union = /export type DayActivity =[\s\S]*?;\n/.exec(types)[0];
  assert.match(union, /\{ kind: 'hiking'; stages: number \}/);
  assert.match(union, /\{ kind: 'travel' \}/);
  assert.match(union, /\{ kind: 'rest' \}/);
  assert.ok(!/custom|note|other/i.test(union), 'no free-form activity variant');
  // Travel details are never copied out of the Trip plan.
  assert.ok(!/from|to|departureTime|provider/.test(union), 'no transport fields on an activity');
});

test('the overnight union references, and never copies, existing data', () => {
  const union = /export type OvernightRef =[\s\S]*?;\n/.exec(types)[0];
  assert.match(union, /\{ kind: 'stop'; stopId: string \}/);
  assert.match(union, /\{ kind: 'stay'; tripItemId: string \}/);
  assert.match(union, /\{ kind: 'none' \}/);
  assert.ok(!/name|title|location|address/i.test(union), 'no accommodation details are copied');
});

test('the two pointers are distinct concepts and both are persisted', () => {
  assert.match(types, /currentStageId: string \| null;/);
  assert.match(types, /currentDayId: string \| null;/);
  // No third pointer, and never an index as identity.
  for (const forbidden of ['activeDayIndex', 'currentDayIndex', 'currentDay:']) {
    assert.ok(!types.includes(forbidden), `${forbidden} must not be persisted`);
    assert.ok(!store.includes(forbidden), `${forbidden} must not exist in the store`);
  }
});

test('the schema is v7 and defaults to no plan', () => {
  assert.match(migration, /export const SCHEMA_VERSION = 7;/);
  assert.match(migration, /dayPlan: null,/);
  assert.match(migration, /dayPlan: normalizeDayPlan\(raw\.dayPlan, direction, stageCount\)/);
  assert.ok(
    !/routeData|kungsleden-route/.test(migration),
    'the migration module stays free of route-data imports',
  );
  assert.match(storage, /normalizeAgainstSchema\(raw, DEFAULT_STAGE_ID, STAGES\.length\)/);
});

// ---- Opt-in ----------------------------------------------------------------

test('nothing derives, infers or auto-creates a plan', () => {
  const code = stripComments(store);
  // A plan is only ever built from an explicit start date the user chose.
  const create = /const createDayPlan = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.match(create, /if \(s\.dayPlan\) return s;/, 'never overwrites an existing plan');
  assert.match(create, /buildDayPlan\(\s*s\.routeDirection,\s*startDate,/);
  // No clock and no inference from trip or wallet data anywhere the plan is
  // written (Date.now elsewhere is packing/trip item ids and timestamps).
  const planActions = code.slice(code.indexOf('const createDayPlan'), code.indexOf('const setStopNote'));
  assert.ok(!/todayIso|Date\.now\(\)|new Date\(/.test(planActions), 'no clock in the plan actions');
  assert.ok(
    !/state\.trip|wallet/.test(planActions),
    'a plan is never seeded from trip or document data',
  );
});

test('with no plan the derived days are empty — no implicit calendar days', () => {
  const derived = read('src/plan/plannedDays.mjs');
  assert.match(derived, /if \(!dayPlan \|\| !Array\.isArray\(dayPlan\.days\)[\s\S]*?\) return \[\];/);
  assert.match(store, /buildPlannedDays\(itinerary\.stages, state\.dayPlan, state\.trip\)/);
});

// ---- Pointer synchronisation ------------------------------------------------

test('there is no "make this day today" action — the override rides Set as current', () => {
  // The 0.26.1 removal: `activatePlannedDay` existed to compensate for a
  // selection model in which no day was ever current until the user pressed
  // `Make this today` in an auto-saving edit sheet. The effective Today now
  // resolves from the pointer OR the local calendar date (effectiveToday.mjs),
  // and the only way the pointer is written is choosing a stage in Stages.
  assert.ok(!store.includes('activatePlannedDay'), 'the action is gone');
  assert.ok(!/Make this today/.test(store), 'and so is its copy');
});

test('followPlanDates clears ONLY the override — the way back to date-following', () => {
  // Without it a pointer set via Stages → "Set as current" would outrank the
  // calendar forever: precedence 1 never expires on its own.
  const action = /const followPlanDates = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.match(action, /if \(!s\.dayPlan \|\| s\.dayPlan\.currentDayId == null\) return s;/);
  assert.match(action, /dayPlan: \{ \.\.\.s\.dayPlan, currentDayId: null \}/);
  // ONLY the pointer: route progress, the plan's days/dates and every other
  // field survive untouched — and nothing here needs the network, so the
  // action works offline exactly like every other localStorage write.
  const body = stripComments(action);
  for (const forbidden of ['currentStageId', 'days:', 'startDate', 'trip', 'packing', 'fetch', 'navigator']) {
    assert.ok(!body.includes(forbidden), `followPlanDates must not touch ${forbidden}`);
  }
});

test('the store resolves the effective Today with ONE clock read, read-only', () => {
  assert.match(store, /from '\.\.\/plan\/effectiveToday\.mjs'/);
  assert.match(
    store,
    /resolveEffectiveToday\(\s*plannedDays,\s*previewDayId,\s*state\.dayPlan\?\.currentDayId \?\? null,\s*localToday,\s*\)/,
  );
  assert.match(store, /const localToday = todayIso\(\);/);
  // The clock steers DISPLAY only: no plan action reads it, and neither a
  // date match nor a preview is ever persisted back into the plan.
  const derived = store.slice(store.indexOf('// ---- Derived selectors'));
  assert.ok(!/setState/.test(derived), 'the derived block never writes persisted state');
  assert.match(store, /todaySource: effectiveToday\.source,/);
});

// ---- Transient planned-day preview ------------------------------------------

test('the preview pointer is RUNTIME state — never persisted anywhere', () => {
  // Plain React state, separate from the persisted blob: the save effect
  // watches `state` only, so a preview cannot reach localStorage, the JSON
  // backup or device transfer, and a reload starts clean.
  assert.match(store, /const \[previewDayId, setPreviewDayId\] = useState<string \| null>\(null\);/);
  assert.match(store, /useEffect\(\(\) => \{\s*\n\s*saveState\(state\);\s*\n\s*\}, \[state\]\);/);
  // Nothing about the DAY preview exists in the persisted model, its
  // migration, its storage layer, or the export used for device transfer.
  // (The word "preview" alone is not the fence — the Map's stop preview is
  // an unrelated, pre-existing concept.)
  for (const [file, src] of [
    ['types', types],
    ['stateMigration', migration],
    ['storage', storage],
    ['exportImport', read('src/utils/exportImport.ts')],
  ]) {
    assert.ok(
      !/previewDayId|previewPlannedDay|dayPreview/i.test(src),
      `${file} must know nothing about the day preview`,
    );
  }
  // And the schema did not move for it.
  assert.match(migration, /export const SCHEMA_VERSION = 7;/);
});

test('previewing mutates neither pointer and no persisted field', () => {
  const preview = /const previewPlannedDay = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  const exit = /const exitDayPreview = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  for (const [name, action] of [['previewPlannedDay', preview], ['exitDayPreview', exit]]) {
    assert.ok(!/setState/.test(action), `${name} never writes persisted state`);
    for (const forbidden of ['currentDayId', 'currentStageId', 'dayPlan', 'trip', 'packing']) {
      assert.ok(!action.includes(forbidden), `${name} must not touch ${forbidden}`);
    }
  }
  // Unknown/empty ids are normalised to "no preview", not stored as garbage.
  assert.match(preview, /typeof dayId === 'string' && dayId !== '' \? dayId : null/);
});

test('preview clears on progress selection, plan removal, reset and direction change', () => {
  // Set as current is an explicit progress action: it must replace a preview.
  const setStage = /const setCurrentStage = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.match(setStage, /setPreviewDayId\(null\);/);
  for (const name of ['removeDayPlan', 'resetDayPlan', 'setRouteDirection']) {
    const action = new RegExp(`const ${name} = useCallback\\([\\s\\S]*?\\}, \\[\\]\\);`).exec(store)[0];
    assert.match(action, /setPreviewDayId\(null\);/, `${name} clears the preview`);
  }
  // A previewed day removed by an ORDINARY day-list edit clears too — via the
  // watcher, so the runtime pointer never stays dangling.
  assert.match(
    store,
    /previewDayId != null && !plannedDays\.some\(\(d\) => d\.id === previewDayId\)/,
  );
});

test('selecting a stage moves the active day in the SAME update', () => {
  const action = /const setCurrentStage = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.match(action, /if \(!s\.dayPlan\) return \{ \.\.\.s, currentStageId: stageId \};/);
  assert.match(action, /dayIndexForStageIndex\(s\.dayPlan\.days, stageIndex\)/);
  assert.match(action, /return \{ \.\.\.s, currentStageId: stageId, dayPlan: \{ \.\.\.s\.dayPlan, currentDayId \} \};/);
});

test('a day-list edit repairs the active-day pointer through the shared rule', () => {
  const patch = /const patchDays = useCallback\([\s\S]*?\n  \);/.exec(store)[0];
  // Ownership is answered by the pure model, not re-derived in the store.
  assert.match(patch, /currentDayIdAfterEdit\(/);
  assert.match(patch, /s\.dayPlan\.days,\s*\n\s*days,\s*\n\s*s\.dayPlan\.currentDayId,\s*\n\s*stageIndex,/);
  assert.match(
    patch,
    /stages\.findIndex\(\s*\n?\s*\(st\) => st\.id === s\.currentStageId,?\s*\n?\s*\)/,
    'the current stage is located in the ACTIVE itinerary',
  );
  // The edit never rewrites route progress to keep a day alive.
  assert.ok(!/currentStageId:/.test(patch), 'a calendar edit never moves currentStageId');
});

test('no component writes the persisted pointers directly', () => {
  const walk = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  const files = [...walk('src/components'), ...walk('src/screens')];
  for (const rel of files) {
    if (!/\.tsx?$/.test(rel)) continue;
    const src = read(rel);
    assert.ok(
      !/currentDayId\s*[:=]/.test(src),
      `${rel} must not write currentDayId — that belongs to the store`,
    );
    assert.ok(
      !/currentStageId\s*:/.test(src),
      `${rel} must not write currentStageId — that belongs to the store`,
    );
    assert.ok(!/setState\(/.test(src), `${rel} must not write persisted state directly`);
  }
});

// ---- Actions ----------------------------------------------------------------

test('the store exposes the day-plan actions and no raw-activity API', () => {
  for (const action of [
    'createDayPlan',
    'setStartDate',
    'addPlannedDay',
    'removePlannedDay',
    'setDayActivities',
    'swapDayActivities',
    'setHikingDayStages',
    'setDayOvernight',
    'resetDayPlan',
    'removeDayPlan',
    'followPlanDates',
  ]) {
    assert.ok(store.includes(action), `${action} is exposed`);
  }
  assert.ok(!/setDays\b|replaceDays|setPlanDays/.test(store), 'no raw day-array setter');
});

test('clearing the start date never deletes a plan', () => {
  const action = /const setStartDate = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.match(action, /if \(!s\.dayPlan \|\| !isRealIsoDate\(startDate\)\) return s;/);
  assert.ok(!/dayPlan: null/.test(action), 'removal is a separate, confirmed action');
});

test('reset rebuilds the default plan and keeps the start date', () => {
  const action = /const resetDayPlan = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.match(action, /buildDayPlan\(\s*s\.routeDirection,\s*s\.dayPlan\.startDate,/);
});

test('removal drops the plan and nothing else', () => {
  const action = stripComments(
    /const removeDayPlan = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0],
  );
  assert.match(action, /setState\(\(s\) => \(s\.dayPlan \? \{ \.\.\.s, dayPlan: null \} : s\)\);/);
  assert.ok(!/currentStageId|packing|journal|trip:/.test(action));
});

// ---- Route direction --------------------------------------------------------

test('a direction change REMOVES the plan in the same update — never reuses it', () => {
  const action = stripComments(
    /const setRouteDirection = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0],
  );
  assert.match(action, /if \(s\.routeDirection === next\) return s;/);
  assert.match(action, /return \{ \.\.\.s, routeDirection: next, dayPlan: null \};/);
  assert.ok(!/reverse\(\)|mirror|defaultDays|buildDayPlan/.test(action), 'no mirroring or rebuilding');
  assert.ok(!/currentStageId/.test(action), 'route progress is untouched');
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

test('no route, map or data module gained a day-plan dependency', () => {
  const walk = (dir) =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  for (const rel of [...walk('src/route'), ...walk('src/map'), ...walk('src/data')]) {
    if (!/\.(tsx?|mjs)$/.test(rel)) continue;
    const src = read(rel);
    assert.ok(
      !src.includes('plan/dayPlan') && !src.includes('plan/plannedDays'),
      `${rel} must stay independent of the personal day plan`,
    );
  }
});
