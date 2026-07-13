/**
 * Editable packing-list UI contracts. The repo has no DOM test runner, so
 * screen behaviour is pinned as source-text contracts (same approach as
 * route-direction-screens.test.mjs / settings-route-direction-order.test.mjs):
 * we assert the packing row uses a chevron disclosure (not an Edit button), the
 * status filters are intact, add/edit/duplicate/delete and reset/restore exist
 * with the right copy, and the Settings "Packing list data" section is wired.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const lists = read('src/screens/ListsScreen.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const store = read('src/store/AppStore.tsx');
const css = read('src/styles/global.css');

// ---- Status filters remain All / Needed / Ready / Packed --------------------

test('the four status filters are preserved as filter chips', () => {
  assert.match(lists, /\['all', 'needed', 'ready', 'packed'\] as Filter\[\]/);
  assert.match(lists, /aria-label="Filter packing items"/);
});

test('status stays a 3-state app value; "all" is only a filter', () => {
  assert.match(lists, /STATUS_ORDER: PackingStatus\[\] = \['needed', 'ready', 'packed'\]/);
});

// ---- Chevron disclosure replaces the explicit Edit button -------------------

test('the row uses a chevron disclosure, not a pencil edit button', () => {
  assert.match(lists, /className="pack-chevron"/);
  assert.doesNotMatch(lists, /className="pack-edit"/);
  // The chevron discloses; it must not be labelled "Edit".
  assert.match(lists, /\$\{expanded \? 'Collapse' : 'Expand'\} \$\{item\.label\}/);
});

test('the chevron exposes expanded/collapsed state and controls the panel', () => {
  assert.match(lists, /aria-expanded=\{expanded\}/);
  assert.match(lists, /aria-controls=\{panelId\}/);
  assert.match(css, /\.pack-chevron\[aria-expanded='true'\] svg\s*\{\s*transform: rotate\(180deg\)/);
});

// ---- Expanded row: quantity, notes + edit / duplicate / delete --------------

test('the expanded panel shows quantity, notes and the three item actions', () => {
  assert.match(lists, /Edit item/);
  assert.match(lists, /Duplicate item/);
  assert.match(lists, /Delete item/);
  assert.match(lists, /className="pack-detail"/);
});

test('delete confirmation names the item', () => {
  assert.match(lists, /Delete “\$\{item\.label\}” from your packing list\?/);
});

test('weight is per-unit; row + total multiply by quantity (quantity edits stay honest)', () => {
  // weightGrams is entered PER ITEM (label says so), so a quantity change must
  // scale both the row figure and the pack total — never a misleading number.
  assert.match(lists, /Weight \(g, per item\)/);
  assert.match(lists, /formatGrams\(item\.weightGrams \* item\.quantity\)/); // row
  assert.match(lists, /\(i\.weightGrams \?\? 0\) \* i\.quantity/); // total
});

test('add and edit forms both offer an optional Notes field', () => {
  // Two <textarea> notes fields: one in AddItemForm, one in ItemEditor.
  const textareas = lists.match(/maxLength=\{NOTES_MAX\}/g) ?? [];
  assert.ok(textareas.length >= 2, 'notes textarea present in add + edit');
});

// ---- Reset progress (screen) is distinct from restore default (settings) ----

test('the Packing screen resets progress only (keeps the customized list)', () => {
  assert.match(lists, /Reset packing progress/);
  assert.match(lists, /resetPackingProgress\(\)/);
  assert.match(lists, /Your customized list will be kept\./);
  // The destructive "restore default" is NOT on the packing screen.
  assert.doesNotMatch(lists, /restoreDefaultPacking/);
});

// ---- Store: owned list, distinct reset vs restore ---------------------------

test('the store exposes owned-list operations', () => {
  for (const fn of [
    'duplicatePackingItem',
    'deletePackingItem',
    'resetPackingProgress',
    'restoreDefaultPacking',
    'replacePackingList',
  ]) {
    assert.match(store, new RegExp(fn));
  }
});

test('custom sections are pruned when their last item goes; restore clears them', () => {
  // A custom section disappears naturally when unreferenced.
  assert.match(store, /function pruneSections/);
  assert.match(store, /deletePackingItem[\s\S]*?pruneSections/);
  // Restore default removes custom sections.
  assert.match(store, /restoreDefaultPacking = useCallback[\s\S]*?packingSections: \[\]/);
});

test('the packing screen groups items by default + custom sections', () => {
  // The list renders over the combined section list, not just the defaults.
  assert.match(lists, /usePackingSections/);
  assert.match(lists, /\[\.\.\.PACKING_CATEGORIES, \.\.\.state\.packingSections\]/);
});

test('duplicating opens the new item so the user can rename it', () => {
  assert.match(lists, /const newId = duplicatePackingItem\(item\.id\)/);
  assert.match(lists, /setEditingId\(newId\)/);
  // No automatic "copy" suffix is added to the saved name.
  assert.doesNotMatch(lists, /\(copy\)|\bcopy\b.*label|label.*\bcopy\b/i);
});

test('reset progress keeps items (status → needed); restore re-seeds the template', () => {
  assert.match(store, /resetPackingProgress = useCallback[\s\S]*?status: 'needed'/);
  assert.match(store, /restoreDefaultPacking = useCallback[\s\S]*?seedPersonalList\(\)/);
  // A duplicate starts unprepared.
  assert.match(store, /duplicatePackingItem[\s\S]*?status: 'needed'/);
});

test('every item is editable now — no custom-only gating on label/delete', () => {
  // Delete no longer filters on `&& i.custom`.
  assert.doesNotMatch(store, /i\.id === itemId && i\.custom/);
});

// ---- Settings: Packing list data section ------------------------------------

test('Settings has a Packing list data section with the five data actions', () => {
  assert.match(settings, /title="Packing list data"/);
  assert.match(settings, /Export packing list/);
  assert.match(settings, /Download template/);
  assert.match(settings, /Choose spreadsheet file/);
  assert.match(settings, /Reset packing progress/);
  assert.match(settings, /Restore default packing list/);
});

test('import warns it replaces the list and offers to export first', () => {
  assert.match(settings, /This replaces your current list/);
  assert.match(settings, /Export current list first/);
  assert.match(settings, /Replace my list/);
});

test('restore-default uses a danger-toned confirmation naming the consequence', () => {
  assert.match(settings, /Restore the Fjällkompis default packing list\?/);
  assert.match(settings, /tone="danger"/);
  assert.match(settings, /removes your custom items and edits/);
});

test('item editing is NOT routed through Settings', () => {
  // Settings manages data only — no add/edit item form lives here.
  assert.doesNotMatch(settings, /addPackingItem|updatePackingItem/);
});
