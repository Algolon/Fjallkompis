/**
 * Contract tests for the app-owned DateField / TimeField dialogs
 * (Stage 1 prototype — docs/proposals/datetime-picker-system.md).
 *
 * The rules under test:
 *  - both dialogs are native <dialog> modals with the app's established
 *    contract: showModal (focus trap + Escape), labelled heading, backdrop
 *    click cancels, focus returns to the opener;
 *  - Cancel/Escape/backdrop NEVER mutate: onChange is reachable only
 *    through Set (a valid value) and Clear ('');
 *  - stored shapes stay exactly what the native inputs emitted —
 *    'YYYY-MM-DD' / 'HH:mm' — and the persisted-state schema is untouched;
 *  - the calendar follows the APG grid keyboard pattern and the time dialog
 *    offers direct numeric entry (numeric mobile keyboard), no analog face;
 *  - the action row wraps rather than overflowing — the exact failure mode
 *    of the native Android popup this system replaces;
 *  - the custom flow never depends on the native showPicker().
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dateField = readFileSync(join(root, 'src/components/DateField.tsx'), 'utf8');
const timeField = readFileSync(join(root, 'src/components/TimeField.tsx'), 'utf8');
const tripSheet = readFileSync(join(root, 'src/components/TripItemSheet.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
const migration = readFileSync(join(root, 'src/utils/stateMigration.mjs'), 'utf8');
const tripModel = readFileSync(join(root, 'src/trip/tripModel.mjs'), 'utf8');

for (const [name, source] of [['DateField', dateField], ['TimeField', timeField]]) {
  test(`${name}: native <dialog> modal contract`, () => {
    assert.match(source, /dialogRef\.current\?\.showModal\(\)/, 'modal trap + native Escape');
    assert.match(source, /aria-labelledby=\{headingId\}/, 'dialog labelled by its heading');
    // The close/cancel events must NOT re-bubble through the React tree:
    // these dialogs open INSIDE the trip sheet, whose own onClose closes
    // the whole form. React re-bubbles natively-non-bubbling events, so
    // without the stop, closing the picker also closed the sheet under it
    // (caught live during Stage 1 verification).
    assert.match(source, /onClose=\{\(e\) => \{[^}]*e\.stopPropagation\(\);[^}]*onClose\(\);/s,
      'close reaches the caller but never the host sheet');
    assert.match(source, /onCancel=\{\(e\) => e\.stopPropagation\(\)\}/,
      'cancel never reaches the host sheet');
    assert.match(
      source,
      /if \(e\.target === dialogRef\.current\) close\(\)/,
      'backdrop click cancels',
    );
    assert.match(source, /return \(\) => opener\?\.focus\(\)/, 'focus returns to the opener');
    assert.match(source, /aria-haspopup="dialog"/, 'the closed field announces the dialog');
  });

  test(`${name}: only Set and Clear commit — Cancel/Escape never mutate`, () => {
    // The single mutation path is commitAndClose (onCommit + close). Cancel
    // and backdrop go through close() alone, which only fires onClose.
    assert.match(source, /commitAndClose\(''\)/, 'Clear commits the empty value');
    const outside = source.replace(/const commitAndClose[\s\S]*?\n  \};/, '');
    assert.ok(!outside.includes('onCommit('), 'onCommit is only ever called inside commitAndClose');
  });
}

test('DateField: APG grid keyboard pattern + Monday-first grid', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']) {
    assert.ok(dateField.includes(`'${key}'`), `${key} handled`);
  }
  assert.match(dateField, /role="grid"/);
  assert.match(dateField, /role="columnheader"/);
  assert.match(dateField, /tabIndex=\{day === focus\.day \? 0 : -1\}/, 'roving tabindex');
  assert.match(dateField, /aria-current=\{isToday \? 'date' : undefined\}/, 'today announced');
  assert.match(dateField, /aria-selected=\{isSel\}/);
  assert.match(dateField, /WEEKDAY_HEADERS/, 'Monday-first headers from the shared util');
  assert.match(dateField, /toIsoDate\(sel\.year, sel\.month, sel\.day\)/, 'Set commits ISO');
});

test('TimeField: digital 24-hour entry, numeric keyboard, no analog face', () => {
  assert.match(timeField, /inputMode: 'numeric'/, 'numeric mobile keyboard');
  assert.match(timeField, /toIsoTime\(/, 'Set commits zero-padded HH:mm');
  assert.match(timeField, /stepHour\(|stepMinute\(/, 'steppers use the tested pure helpers');
  // No analog face artifacts: no hand-drawn dial (lucide's decorative field
  // icon is the only SVG) and no wheel/slider semantics.
  assert.ok(!/clock-face|<circle|conic-gradient|role="slider"/i.test(timeField), 'no analog clock face');
  assert.match(timeField, /aria-label="Hour \(00–23\)"/);
  assert.match(timeField, /aria-label="Minutes \(00–59\)"/);
});

test('trip sheet: transport uses the pickers; values stay plain strings on the draft', () => {
  assert.match(tripSheet, /<DateField[\s\S]*?value=\{date\}[\s\S]*?onChange=\{setDate\}/, 'date wired to draft state');
  assert.match(tripSheet, /value=\{departureTime\}[\s\S]*?onChange=\{setDepartureTime\}/);
  assert.match(tripSheet, /value=\{arrivalTime\}[\s\S]*?onChange=\{setArrivalTime\}/);
  // The draft still cleans and saves the same string shapes; the model's
  // storage validators are byte-identical to before this feature.
  assert.match(tripModel, /const DATE_RE = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
  assert.match(tripModel, /const TIME_RE = \/\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$\//);
});

test('trip sheet: stay dates use DateField wired to the same draft state (rollout step 2)', () => {
  // Each stay field binds to ITS OWN draft variable — check-in and
  // check-out stay independent, and editing an existing stay initialises
  // both from the stored item exactly as the native inputs did.
  assert.match(
    tripSheet,
    /<DateField[\s\S]*?dialogTitle="Check-in"[\s\S]*?value=\{checkInDate\}[\s\S]*?onChange=\{setCheckInDate\}/,
    'check-in wired to its draft variable',
  );
  assert.match(
    tripSheet,
    /<DateField[\s\S]*?dialogTitle="Check-out"[\s\S]*?value=\{checkOutDate\}[\s\S]*?onChange=\{setCheckOutDate\}/,
    'check-out wired to its draft variable',
  );
  assert.match(tripSheet, /useState\(stay\?\.checkInDate \?\? ''\)/, 'edit mode loads the stored check-in');
  assert.match(tripSheet, /useState\(stay\?\.checkOutDate \?\? ''\)/, 'edit mode loads the stored check-out');
  // The pre-existing chronological rule survives the swap: it still gates
  // Save on the draft and surfaces on the check-out field.
  assert.match(tripSheet, /isStayDateOrderValid\(checkInDate \|\| undefined, checkOutDate \|\| undefined\)/);
  assert.match(tripSheet, /invalid=\{!stayOrderOk\}/);
  assert.match(tripSheet, /describedBy=\{checkOutErrorId\}/);
  // DateField passes the caller's validation state through to the closed
  // field (the a11y association the native input used to carry).
  const dateFieldSrc = dateField;
  assert.match(dateFieldSrc, /aria-invalid=\{invalid \|\| undefined\}/);
  assert.match(dateFieldSrc, /aria-describedby=\{invalid \? describedBy : undefined\}/);
  // Narrow phones: the date pair stacks (≤340px, the app's compact step)
  // and the closed-field value never wraps to a second line.
  assert.match(tripSheet, /className="row trip-daterow"/);
  assert.match(css, /@media \(max-width: 340px\) \{\s*\.trip-daterow \{\s*flex-direction: column;\s*align-items: stretch;/);
  assert.match(css, /\.picker-field > span \{[^}]*white-space: nowrap/s);
});

test('no persisted-schema change rides this feature', () => {
  assert.match(migration, /export const SCHEMA_VERSION = 6;/, 'schema stays at v6');
});

test('the custom flow never depends on native showPicker()', () => {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  for (const f of walk(join(root, 'src'))) {
    if (!/\.(tsx?|mjs)$/.test(f)) continue;
    assert.ok(!readFileSync(f, 'utf8').includes('showPicker'), `${f} has no showPicker call`);
  }
});

test('the action row wraps — never a fixed single-line width', () => {
  const actions = css.slice(css.indexOf('.picker-actions {'), css.indexOf('.picker-btn {'));
  assert.match(actions, /flex-wrap: wrap/);
  assert.match(actions, /white-space: normal/, 'long localized labels may wrap inside a button');
  assert.ok(!/\.picker-actions \{[^}]*width: \d/.test(css), 'no hardcoded row width');
});

test('touch targets: 44px day rows, 44px steppers and paging controls', () => {
  assert.match(css, /\.picker-cal__day \{[^}]*height: 44px/s);
  assert.match(css, /\.picker-nav-btn \{[^}]*width: 44px;\n\s*height: 44px/s);
});

// --- Positioning contract (refinement pass 1) --------------------------------
// Months span 4–6 calendar rows; a fully-centred dialog re-centres on every
// month change, so the header and month navigation jump. The date dialog is
// TOP-ANCHORED (stable header, grows downward); the time dialog stays
// centred because its height never varies.

test('date dialog: stable safe-area-aware top anchor, not full centring', () => {
  const block = css.slice(css.indexOf('.picker-dialog {'), css.indexOf('.picker-dialog::backdrop'));
  assert.match(
    block,
    /--picker-top: clamp\(20px, calc\(env\(safe-area-inset-top, 0px\) \+ 8dvh\), 88px\)/,
    'clamped safe-area + dvh offset',
  );
  assert.match(
    block,
    /--picker-top: clamp\(20px, calc\(env\(safe-area-inset-top, 0px\) \+ 8vh\), 88px\)/,
    'vh fallback where dvh is unsupported',
  );
  assert.match(block, /inset: var\(--picker-top\) 0 auto 0/, 'top anchored, bottom free');
  assert.match(block, /margin: 0 auto/, 'horizontal centring only');
  assert.ok(!/margin: auto;/.test(block), 'no whole-viewport vertical centring');
  assert.match(block, /max-height: calc\(100dvh - var\(--picker-top\) - 16px\)/,
    'never past the safe viewport bottom');
});

test('time dialog: stays centred — a documented exception, height never varies', () => {
  const block = css.slice(css.indexOf('.picker-dialog--time {'), css.indexOf('.picker-body {'));
  assert.match(block, /inset: 0/);
  assert.match(block, /margin: auto/);
  assert.match(block, /height never varies/, 'the reason is recorded next to the override');
});

test('variable month heights stay supported; short screens scroll inside', () => {
  const cal = css.slice(css.indexOf('.picker-cal {'), css.indexOf('.picker-cal__row'));
  assert.ok(!/\bheight:|min-height:/.test(cal), 'no fixed calendar height — 4, 5 and 6 rows all render');
  const body = css.slice(css.indexOf('.picker-body {'), css.indexOf('.picker-eyebrow'));
  assert.match(body, /overflow-y: auto/, 'action row reachable by internal scroll at short heights');
  assert.match(body, /max-height: inherit/);
});
