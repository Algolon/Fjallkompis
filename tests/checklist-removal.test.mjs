/**
 * Guard for the ARCHIVED Daily checklist feature
 * (docs/archived-features/daily-checklist.md).
 *
 * The feature must stay absent from the active app — no seed data, no store
 * API, no Today/Lists UI — while legacy persisted payloads that still carry
 * the `checklist` map keep loading safely (that part is exercised in
 * tests/state-migration.test.mjs and tests/device-transfer.test.mjs; this
 * file pins the runtime-source side so dormant checklist code can't sneak
 * back in without a deliberate product decision).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defaultState, normalizeState } from '../src/utils/stateMigration.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const SOURCE_FILES = walk(src).filter(
  (p) => /\.(ts|tsx|mjs|mts|css)$/.test(p) && !p.includes('generated'),
);

test('the checklist seed data module is gone', () => {
  assert.ok(!existsSync(join(src, 'data', 'checklist.ts')));
});

test('no checklist store API or selectors remain anywhere in src/', () => {
  const forbidden = [
    'toggleChecklistItem',
    'resetDailyChecklist',
    'checklistCheckedCount',
    'checklistTotal',
    'checklistPercent',
    'ALL_CHECKLIST_ITEMS',
    'TOTAL_CHECKLIST_ITEMS',
    'ChecklistCategory',
    'ChecklistItem',
  ];
  for (const file of SOURCE_FILES) {
    const text = readFileSync(file, 'utf8');
    for (const ident of forbidden) {
      assert.ok(
        !text.includes(ident),
        `${file.slice(root.length + 1)} still references ${ident}`,
      );
    }
  }
});

test('Today has no Daily list section or checklist copy', () => {
  const today = readFileSync(join(src, 'screens', 'TodayScreen.tsx'), 'utf8');
  assert.ok(!/daily list/i.test(today));
  assert.ok(!/checklist/i.test(today));
  assert.ok(!today.includes('listsMode'));
});

test('the packing and dossier homes never grew a Daily view back', () => {
  // vNext re-homed Lists' sections (Packing/Trip → Plan, Shops/Transport →
  // Guide). The Daily checklist must still be absent from every new home:
  // no Daily view, no checklist reference, no Daily section or copy.
  for (const rel of [
    ['components', 'PackingView.tsx'],
    ['screens', 'PlanScreen.tsx'],
    ['screens', 'GuideScreen.tsx'],
  ]) {
    const text = readFileSync(join(src, ...rel), 'utf8');
    assert.ok(!text.includes('DailyView'), `${rel[1]}: no Daily view component`);
    assert.ok(!/checklist/i.test(text), `${rel[1]}: no checklist reference`);
    assert.ok(!/\bdaily\b/i.test(text), `${rel[1]}: no Daily section or copy`);
  }
});

test('no user-facing copy in src/ presents the Daily checklist as active', () => {
  // Remaining matches must be historical/internal only: the legacy
  // 'checklist' tab id in navigation wiring and migration/archive comments.
  const allowed = new Set([
    'src/components/TabBar.tsx', // legacy navigate() target type ('checklist')
    'src/navigation/routes.mjs', // legacy internal id documented as non-URL
    'src/navigation/resolveNavTarget.mjs', // maps the legacy id onto Guide/Plan
    'src/screens/StopsScreen.tsx', // navigates via the legacy 'checklist' id
    'src/components/TodayPrepare.tsx', // Prepare cards navigate via the same id
    'src/components/TodayOnRoute.tsx', // Travel days link to Trip via the same id
    'src/types/index.ts', // schema-v3 migration comment
    'src/utils/stateMigration.mjs', // migration doc for the dropped key
  ]);
  for (const file of SOURCE_FILES) {
    const rel = file.slice(root.length + 1);
    const text = readFileSync(file, 'utf8');
    if (/checklist/i.test(text)) {
      assert.ok(allowed.has(rel), `unexpected checklist reference in ${rel}`);
    }
  }
});

test('fresh and migrated states carry no checklist key', () => {
  assert.ok(!('checklist' in defaultState('d1')));
  const migrated = normalizeState(
    { schemaVersion: 2, currentStageId: 'd2', checklist: { 'morning.1': true } },
    'd1',
  );
  assert.ok(!('checklist' in migrated));
  assert.equal(migrated.currentStageId, 'd2');
});
