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

test('Lists has Packing/Shops/Transport as peers — never a Daily view', () => {
  // Lists gained offline Shop info and Transport sections as peers of Packing
  // (a deliberate product decision). The Daily checklist must still be absent:
  // no Daily view, no checklist reference, and the section tabs are exactly
  // Packing / Shops / Transport — never a Daily tab.
  const lists = readFileSync(join(src, 'screens', 'ListsScreen.tsx'), 'utf8');
  assert.ok(!lists.includes('DailyView'), 'no Daily view component');
  assert.ok(!/checklist/i.test(lists), 'no checklist reference');
  assert.ok(!/\bdaily\b/i.test(lists), 'no Daily section or copy');
  const tabIds = [...lists.matchAll(/id: '(packing|shops|transport|daily)'/g)].map((m) => m[1]);
  assert.deepEqual(tabIds, ['packing', 'shops', 'transport'], 'exactly Packing, Shops, Transport');
});

test('no user-facing copy in src/ presents the Daily checklist as active', () => {
  // Remaining matches must be historical/internal only: the legacy
  // 'checklist' tab id in navigation wiring and migration/archive comments.
  const allowed = new Set([
    'src/App.tsx', // routes the legacy tab id, comment points to the archive
    'src/components/TabBar.tsx', // legacy internal tab id ('checklist' → Lists)
    'src/navigation/routes.mjs', // legacy internal tab id mapping
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
