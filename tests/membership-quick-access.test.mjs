/**
 * STF membership quick access (Today, On route).
 *
 * The rules under test:
 *  - membership metadata is EXPLICIT (editor choices) — never inferred from
 *    filenames, titles or notes;
 *  - the fields are additive on WalletDocument: legacy records stay valid,
 *    malformed values normalise away safely, nothing is reclassified;
 *  - at most one document holds showOnToday (store-enforced, one
 *    transaction) and quickAccessMembership picks deterministically;
 *  - the Today card renders only for a verified locally-available file and
 *    is omitted otherwise (the honest missing-file state stays in
 *    Lists → Trip);
 *  - no PersistentState schema bump — this is wallet (IndexedDB) data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';
import {
  normalizeWalletDocument,
  quickAccessMembership,
} from '../src/wallet/walletModel.mjs';
import {
  addWalletDocument,
  clearWalletData,
  closeWalletDb,
  enforceMembershipQuickAccess,
  listWalletDocuments,
} from '../src/wallet/walletStore.mjs';
import { SCHEMA_VERSION } from '../src/utils/stateMigration.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quickAccess = readFileSync(join(root, 'src/components/MembershipQuickAccess.tsx'), 'utf8');
const editor = readFileSync(join(root, 'src/components/WalletEditorSheet.tsx'), 'utf8');
const tripView = readFileSync(join(root, 'src/components/TripView.tsx'), 'utf8');

const doc = (over = {}) => ({
  id: 'doc-1',
  title: 'STF membership',
  category: 'membership',
  pinned: false,
  createdAt: 10,
  updatedAt: 20,
  fileName: 'card.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  ...over,
});

// ---- Model normalisation ----------------------------------------------------

test('explicit STF metadata survives normalisation', () => {
  const d = normalizeWalletDocument(doc({ membershipProvider: 'stf', showOnToday: true }));
  assert.equal(d.membershipProvider, 'stf');
  assert.equal(d.showOnToday, true);
});

test('legacy membership documents without the new fields stay valid', () => {
  const d = normalizeWalletDocument(doc());
  assert.ok(d, 'normalises fine');
  assert.ok(!('membershipProvider' in d), 'no provider invented');
  assert.ok(!('showOnToday' in d), 'no quick access invented');
});

test('malformed or stale metadata normalises away safely', () => {
  // Wrong provider value.
  assert.ok(!('membershipProvider' in normalizeWalletDocument(doc({ membershipProvider: 'svenska' }))));
  // Quick access without an STF provider (or with provider "other").
  assert.ok(!('showOnToday' in normalizeWalletDocument(doc({ showOnToday: true }))));
  assert.ok(
    !('showOnToday' in normalizeWalletDocument(doc({ membershipProvider: 'other', showOnToday: true }))),
  );
  // Non-membership category drops both (a recategorised document can never
  // keep a stale Today card).
  const other = normalizeWalletDocument(
    doc({ category: 'timetable', membershipProvider: 'stf', showOnToday: true }),
  );
  assert.ok(!('membershipProvider' in other));
  assert.ok(!('showOnToday' in other));
  // Truthy-but-not-true flags are not flags.
  assert.ok(!('showOnToday' in normalizeWalletDocument(doc({ membershipProvider: 'stf', showOnToday: 1 }))));
});

// ---- Selection --------------------------------------------------------------

test('only an explicitly flagged STF membership becomes quick access', () => {
  assert.equal(quickAccessMembership([]), null);
  assert.equal(quickAccessMembership([doc()]), null, 'membership alone is not enough');
  assert.equal(
    quickAccessMembership([doc({ membershipProvider: 'stf' })]),
    null,
    'STF without the flag is not enough',
  );
  const flagged = doc({ membershipProvider: 'stf', showOnToday: true });
  assert.equal(quickAccessMembership([doc({ id: 'x' }), flagged])?.id, 'doc-1');
});

test('should legacy data ever hold two flags, the pick is deterministic', () => {
  const a = doc({ id: 'a', membershipProvider: 'stf', showOnToday: true, updatedAt: 50 });
  const b = doc({ id: 'b', membershipProvider: 'stf', showOnToday: true, updatedAt: 90 });
  const pinned = doc({ id: 'c', membershipProvider: 'stf', showOnToday: true, updatedAt: 10, pinned: true });
  assert.equal(quickAccessMembership([a, b]).id, 'b', 'most recently updated');
  assert.equal(quickAccessMembership([a, b, pinned]).id, 'c', 'pinned first');
});

// ---- Store-enforced uniqueness ---------------------------------------------

test('enforceMembershipQuickAccess clears every other flag in one pass', async () => {
  await clearWalletData();
  const blob = new Blob(['x'], { type: 'application/pdf' });
  await addWalletDocument(doc({ id: 'a', membershipProvider: 'stf', showOnToday: true }), blob);
  await addWalletDocument(doc({ id: 'b', membershipProvider: 'stf', showOnToday: true }), blob);
  await addWalletDocument(doc({ id: 'c' }), blob);

  await enforceMembershipQuickAccess('b');
  const docs = await listWalletDocuments();
  const flagged = docs.filter((d) => d.showOnToday === true).map((d) => d.id);
  assert.deepEqual(flagged, ['b'], 'exactly the kept id holds the flag');
  // Untouched records keep their other metadata.
  assert.equal(docs.find((d) => d.id === 'a').membershipProvider, 'stf');
  await clearWalletData();
  await closeWalletDb();
});

// ---- No inference, no schema bump -------------------------------------------

test('no filename/title/note heuristics anywhere in the feature', () => {
  for (const [name, src] of [
    ['MembershipQuickAccess', quickAccess],
    ['WalletEditorSheet', editor],
  ]) {
    assert.ok(
      !/fileName\.(match|includes|toLowerCase)|title\.(match|includes|toLowerCase)\(.*stf/i.test(src),
      `${name} never sniffs names/titles`,
    );
    assert.ok(!/['"]stf['"].*\.test\(/i.test(src), `${name} has no STF regex detection`);
  }
});

test('membership metadata is wallet data — PersistentState schema stays at 6', () => {
  assert.equal(SCHEMA_VERSION, 6);
});

// ---- Editor and Today card contracts ----------------------------------------

test('the editor makes the organisation and quick access explicit choices', () => {
  assert.match(editor, /Organisation/);
  assert.match(editor, /STF — Svenska Turistföreningen/);
  assert.match(editor, /value="other">Other/);
  assert.match(editor, /Show quick access on Today/);
  // Selecting STF defaults quick access ON — still user-editable.
  assert.match(editor, /if \(next === 'stf' && provider !== 'stf'\) setShowOnToday\(true\)/);
  // Only membership documents write the metadata.
  assert.match(editor, /category === 'membership' && provider \? \{ membershipProvider: provider \}/);
});

test('saving a flagged document enforces uniqueness through the store', () => {
  assert.match(tripView, /enforceMembershipQuickAccess\(next\.id\)/);
  assert.match(tripView, /enforceMembershipQuickAccess\(doc\.id\)/);
});

test('the Today card verifies local availability and omits itself otherwise', () => {
  assert.match(quickAccess, /quickAccessMembership\(wallet\.documents\)/);
  assert.match(quickAccess, /wallet\s*\.getFile\(doc\.id\)/, 'blob existence checked before offering');
  assert.match(quickAccess, /if \(!doc \|\| availableId !== doc\.id\) return null/);
  assert.match(quickAccess, /aria-label="Open STF membership card"/);
  // Opening reuses the shared wallet behaviour and viewer — no new viewer.
  assert.match(quickAccess, /openWalletDocument\(doc, wallet\.getFile\)/);
  assert.match(quickAccess, /<TripImageViewer/);
  assert.match(quickAccess, /URL\.revokeObjectURL\(viewer\.url\)/);
  // Neutral in-app treatment (no logo asset in the repo): icon + STF text.
  assert.match(quickAccess, /IdCard/);
  assert.match(quickAccess, />\s*STF\s*</);
  // No nested interactive elements inside the quick-access button.
  const btn = quickAccess.slice(quickAccess.indexOf('<button'), quickAccess.indexOf('</button>'));
  assert.ok(!btn.slice(7).includes('<button'), 'single button, nothing nested');
});
