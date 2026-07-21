/**
 * Packing editor UI contracts (source-text guard tests, same style as the
 * other screen tests): every item — seeded or custom — gets the full inline
 * editor (name, category, quantity, weight, essential, delete), the delete
 * flow confirms via the shared accessible ConfirmDialog with the exact item
 * label, and the old single "Reset packing list" action is replaced by the
 * two distinct Reset progress / Restore default actions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lists = readFileSync(join(root, 'src/screens/ListsScreen.tsx'), 'utf8');
const store = readFileSync(join(root, 'src/store/AppStore.tsx'), 'utf8');
const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
const confirmDialog = readFileSync(join(root, 'src/components/ConfirmDialog.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

const editor = lists.slice(
  lists.indexOf('function ItemEditor'),
  lists.indexOf('function AddItemForm'),
);

test('the item editor is no longer gated on item.custom', () => {
  assert.ok(!/item\.custom\s*\?/.test(editor), 'no custom-only conditional rendering');
  assert.ok(!/i\.custom\s*&&\s*patch/.test(store), 'store no longer gates edits on custom');
  assert.match(editor, /<span>Item name<\/span>/, 'name field for every item');
  assert.match(editor, /<span>Category<\/span>/, 'category field for every item');
  assert.match(editor, /Essential item/, 'essential toggle in the editor');
  assert.match(editor, /aria-pressed=\{essential\}/, 'essential toggle exposes pressed state');
});

test('save is disabled for a blank trimmed title; Enter saves when valid', () => {
  assert.match(editor, /canSave = label\.trim\(\) !== ''/);
  assert.match(editor, /disabled=\{!canSave\}/);
  assert.match(editor, /e\.key === 'Enter' && canSave/);
});

test('delete: available for every item, separated, confirmed with the item label', () => {
  assert.match(editor, /pack-editor-danger/, 'delete sits in its own separated zone');
  assert.match(editor, /Delete item/, 'explicit delete label');
  assert.match(editor, /title=\{`Delete “\$\{item\.label\}”\?`\}/, 'confirmation uses the exact item label');
  assert.match(editor, /destructive/, 'delete confirmation is styled destructive');
  assert.ok(!/confirm\(/.test(editor), 'no native confirm() in the editor');
  assert.ok(
    css.includes('.pack-editor-danger'),
    'separator CSS for the destructive zone exists',
  );
});

test('editor closes after save and after delete', () => {
  const saveBody = editor.slice(editor.indexOf('const save = ()'), editor.indexOf('return ('));
  assert.match(saveBody, /onClose\(\)/, 'save closes the editor');
  const deleteBlock = editor.slice(editor.indexOf('onConfirm'), editor.indexOf('onCancel'));
  assert.match(deleteBlock, /deletePackingItem\(item\.id\)/);
  assert.match(deleteBlock, /onClose\(\)/, 'delete closes the editor');
});

test('only one editor opens at a time via the single editingId', () => {
  assert.match(lists, /const \[editingId, setEditingId\] = useState<string \| null>\(null\)/);
  assert.match(lists, /setEditingId\(\(cur\) => \(cur === item\.id \? null : item\.id\)\)/);
  assert.match(lists, /aria-expanded=\{editingId === item\.id\}/);
  assert.match(lists, /aria-label=\{`Edit \$\{item\.label\}`\}/);
});

test('the ambiguous "Reset packing list" action is gone; two distinct actions exist', () => {
  assert.ok(!lists.includes('Reset packing list'), 'old conflated action removed');
  assert.match(lists, /Reset progress/);
  assert.match(lists, /Restore default list/);
  assert.match(lists, /resetPackingProgress/);
  assert.match(lists, /restorePackingDefaults/);
  // Both confirm through the shared dialog, restore as destructive.
  assert.match(lists, /title="Reset packing progress\?"/);
  assert.match(lists, /title="Restore the default packing list\?"/);
  const restoreDialog = lists.slice(lists.indexOf('title="Restore the default packing list?"'));
  assert.match(restoreDialog.slice(0, 600), /destructive/);
});

test('the shared ConfirmDialog is accessible and reused by Settings', () => {
  assert.match(confirmDialog, /role="dialog"/);
  assert.match(confirmDialog, /aria-modal="true"/);
  // Unique per-instance ids via useId — never fixed global id strings.
  assert.match(confirmDialog, /useId\(\)/);
  assert.match(confirmDialog, /aria-labelledby=\{titleId\}/);
  assert.match(confirmDialog, /aria-describedby=\{bodyId\}/);
  assert.match(confirmDialog, /destructive \? 'btn-danger' : 'btn-primary'/);
  assert.match(settings, /import \{ ConfirmDialog \} from '\.\.\/components\/ConfirmDialog'/);
  assert.ok(!/function ConfirmDialog/.test(settings), 'Settings no longer defines its own copy');
});

test('ConfirmDialog manages focus: capture, trap, and restore on close', () => {
  // Remembers the opener element and restores focus in the effect cleanup.
  assert.match(confirmDialog, /document\.activeElement instanceof HTMLElement/);
  assert.match(confirmDialog, /opener\?\.focus\(\)/);
  // Initial focus lands on the primary action; Escape cancels.
  assert.match(confirmDialog, /confirmRef\.current\?\.focus\(\)/);
  assert.match(confirmDialog, /e\.key === 'Escape'/);
  // A local Tab/Shift+Tab trap keeps keyboard focus inside the dialog.
  assert.match(confirmDialog, /e\.key !== 'Tab'/);
  assert.match(confirmDialog, /e\.shiftKey/);
  assert.match(confirmDialog, /last\.focus\(\)/);
  assert.match(confirmDialog, /first\.focus\(\)/);
  // Backdrop cancels; clicks inside the dialog never bubble to the backdrop.
  assert.match(confirmDialog, /className="confirm-backdrop" onClick/);
  assert.match(confirmDialog, /stopPropagation/);
});

test('store contract: delete works for every item; helpers come from packingModel', () => {
  assert.match(store, /packing: s\.packing\.filter\(\(i\) => i\.id !== itemId\)/);
  assert.match(store, /applyPackingPatch/);
  assert.match(store, /from '\.\.\/utils\/packingModel\.mjs'/);
  assert.ok(!/resetPacking:/.test(store), 'old conflated store action removed');
});
