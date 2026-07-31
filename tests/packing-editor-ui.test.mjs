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

// ---- Worn units (per-unit worn tracking) ------------------------------------

test('the Worn control sits below Essential and is gated on category', () => {
  // One shared control for both forms: checkbox at quantity 1, stepper above.
  assert.match(lists, /function WornControl/);
  assert.match(editor, /const wornEligible = isWornEligibleCategory\(categoryId\)/);
  assert.match(editor, /wornEligible \? \(/, 'control is conditional on eligibility');
  const essentialAt = editor.indexOf('Essential item');
  const wornAt = editor.indexOf('<WornControl');
  const saveAt = editor.indexOf('onClick={save}');
  assert.ok(essentialAt !== -1 && wornAt !== -1 && saveAt !== -1);
  assert.ok(essentialAt < wornAt && wornAt < saveAt, 'Essential, then Worn, then actions');
  // Saving clamps live to the form quantity and never smuggles worn units
  // onto a non-eligible category.
  assert.match(editor, /wornQuantity: wornEligible \? Math\.min\(wornQty, quantityNum\) : 0/);
});

test('quantity 1 keeps the original checkbox; quantity > 1 gets the stepper', () => {
  const control = lists.slice(
    lists.indexOf('function WornControl'),
    lists.indexOf('function ItemEditor'),
  );
  // Checkbox branch: same check--setting styling and pressed-state semantics.
  assert.match(control, /if \(quantityNum === 1\)/);
  assert.match(control, /check check--setting/);
  assert.match(control, /aria-pressed=\{shown > 0\}/);
  assert.match(control, /<span className="label">Worn<\/span>/);
  // Stepper branch: −/value/+ "of N", clamped to 0..quantity, first step
  // up from 0 enables worn with exactly one unit.
  assert.match(control, /worn-stepper/);
  assert.match(control, /Math\.max\(0, Math\.min\(v, quantityNum\) - 1\)/, 'never below 0');
  assert.match(control, /Math\.min\(quantityNum, Math\.min\(v, quantityNum\) \+ 1\)/, 'never above quantity');
  assert.match(control, /disabled=\{shown === 0\}/);
  assert.match(control, /disabled=\{shown >= quantityNum\}/);
  assert.match(control, /of \{quantityNum\}/);
  // The shown value clamps live when the quantity field shrinks.
  assert.match(control, /const shown = Math\.min\(wornQty, quantityNum\)/);
  assert.ok(css.includes('.worn-stepper'), 'stepper CSS exists');
});

test('the add form mirrors the Worn control with the same gating and clamp', () => {
  const addForm = lists.slice(
    lists.indexOf('function AddItemForm'),
    lists.indexOf('function PackingView'),
  );
  assert.match(addForm, /const wornEligible = isWornEligibleCategory\(categoryId\)/);
  assert.match(addForm, /<WornControl/);
  assert.match(addForm, /wornQuantity: wornEligible \? Math\.min\(wornQty, quantityNum\) : 0/);
});

test('the tap cycle reaches Worn only for single-quantity eligible rows', () => {
  const view = lists.slice(lists.indexOf('function PackingView'));
  // A tap must never silently claim all units of a ×3 row are on the body.
  assert.match(
    view,
    /state === 'packed' && item\.quantity === 1 && isWornEligibleCategory\(item\.categoryId\)/,
  );
  assert.match(view, /updatePackingItem\(item\.id, \{ wornQuantity: 1 \}\)/, 'Packed → Worn (q1)');
  assert.match(
    view,
    /updatePackingItem\(item\.id, \{ wornQuantity: 0, status: 'needed' \}\)/,
    'Worn → Needed restarts the cycle',
  );
  // The row shows ONE state: fully worn shows Worn, partial shows the
  // carried status (the shared display collapse, also in the aria label).
  assert.match(view, /packingDisplayState/);
  assert.match(lists, /worn: 'Worn'/, 'Worn has a visible state label');
});

test('partially worn rows spell out every unit location', () => {
  const view = lists.slice(lists.indexOf('function PackingView'));
  assert.match(view, /const partiallyWorn = item\.wornQuantity > 0 && carried > 0/);
  // "1 worn · 2 packed" — worn units first, then carried units with their
  // status word; the weight beside it is the CARRIED weight.
  assert.match(
    view,
    /\$\{item\.wornQuantity\} worn · \$\{carried\} \$\{STATE_LABEL\[item\.status\]\.toLowerCase\(\)\}/,
  );
  assert.match(view, /formatGrams\(item\.weightGrams \* carried\)/);
  // The aria label names the split too.
  assert.match(view, /of \$\{item\.quantity\} worn/);
});

test('unit-level exclusivity lives in the model; the store routes through it', () => {
  assert.match(
    store,
    /packing: applyPackingPatch\(s\.packing, itemId, \{ status \}\)/,
    'setPackingStatus cannot bypass the packed/worn rules',
  );
  assert.match(store, /clampWornQuantity\(item\.wornQuantity, item\.quantity\)/, 'add clamps worn units');
});

test('filters: status pills follow carried units, Worn matches any worn unit', () => {
  const view = lists.slice(lists.indexOf('function PackingView'));
  assert.match(view, /const matchesFilter = /);
  assert.match(view, /if \(f === 'worn'\) return i\.wornQuantity > 0/);
  assert.match(
    view,
    /return i\.wornQuantity < i\.quantity && i\.status === f/,
    'status pills cover rows with carried units only',
  );
  // Pill appears with the first worn unit and never strands an active filter.
  assert.match(view, /f !== 'worn' \|\| stats\.worn > 0 \|\| filter === 'worn'/);
  // Pill counts use the SAME predicate as the visible list.
  assert.match(view, /items\.filter\(\(i\) => matchesFilter\(i, f\)\)\.length/);
});

test('the progress header separates backpack and worn without a second meter', () => {
  const view = lists.slice(lists.indexOf('function PackingView'));
  // Backpack denominator excludes only FULLY worn rows — partially worn
  // rows still have spares to pack.
  assert.match(view, /summary\.total - summary\.fullyWorn/);
  assert.match(view, /\{stats\.packed\}\/\{stats\.packTotal\} packed/);
  // The worn count (rows with any worn unit) stacks under the packed count.
  assert.match(
    view,
    /<span className="pack-progress-count__worn">\{stats\.worn\} worn<\/span>/,
  );
  assert.match(view, /stats\.worn > 0 \? \(/, 'worn line rendered only once something is worn');
  assert.ok(css.includes('.pack-progress-count'), 'stacked header value CSS exists');
  assert.match(css, /pack-progress-count \{[^}]*flex-direction: column/, 'counts stack');
  // The worn pill carries the worn WEIGHT only, with the ≥ lower bound.
  assert.match(view, /stats\.wornWeightedGrams > 0 \? \(/);
  assert.match(view, /wornWeightMissing > 0 \? '≥ ' : ''/);
  assert.match(view, /\{formatGrams\(stats\.wornWeightedGrams\)\} worn/);
  assert.ok(!/meter-fill--worn|second-meter/.test(view), 'one meter, one bar');
});
