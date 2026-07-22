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
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import 'fake-indexeddb/auto';
import {
  applyMembershipMetadata,
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

// ---- Editing an existing flagged membership (the edit-state regression) -----
//
// The editor OMITS membershipProvider/showOnToday from its submitted fields
// when they are unset/off, so a plain `{ ...doc, ...fields }` merge would let
// the previous metadata survive. applyMembershipMetadata treats the
// submission as authoritative; these tests drive the exact user transitions.

/** The saved flagged document every transition starts from. */
const flaggedStf = () => doc({ membershipProvider: 'stf', showOnToday: true });

/** Simulate the save path: merge the sheet's fields, then apply membership. */
const editSave = (existing, fields) =>
  applyMembershipMetadata({ ...existing, ...fields, updatedAt: 99 }, fields);

test('toggle off: STF stays, the flag goes, Today has no card', () => {
  // Sheet submission with the toggle off: provider present, showOnToday OMITTED.
  const next = editSave(flaggedStf(), { category: 'membership', membershipProvider: 'stf' });
  assert.equal(next.membershipProvider, 'stf');
  assert.ok(!('showOnToday' in next), 'unchecking removes the flag');
  assert.equal(quickAccessMembership([next]), null, 'no other flagged doc → no Today card');
});

test('STF → Not set: both fields removed', () => {
  // Provider cleared: the sheet omits BOTH keys.
  const next = editSave(flaggedStf(), { category: 'membership' });
  assert.ok(!('membershipProvider' in next));
  assert.ok(!('showOnToday' in next));
  assert.equal(quickAccessMembership([next]), null);
});

test('STF → Other: provider becomes other, flag removed', () => {
  const next = editSave(flaggedStf(), { category: 'membership', membershipProvider: 'other' });
  assert.equal(next.membershipProvider, 'other');
  assert.ok(!('showOnToday' in next), 'quick access is STF-only');
  assert.equal(quickAccessMembership([next]), null);
});

test('category change away from Membership: both fields removed', () => {
  // Recategorised: the sheet omits the membership keys for other categories.
  const next = editSave(flaggedStf(), { category: 'route-reference' });
  assert.equal(next.category, 'route-reference');
  assert.ok(!('membershipProvider' in next));
  assert.ok(!('showOnToday' in next));
});

test('toggle back on: the document becomes eligible again', () => {
  const off = editSave(flaggedStf(), { category: 'membership', membershipProvider: 'stf' });
  const on = editSave(off, {
    category: 'membership',
    membershipProvider: 'stf',
    showOnToday: true,
  });
  assert.equal(on.showOnToday, true);
  assert.equal(quickAccessMembership([on])?.id, on.id);
});

test('the merge never touches other metadata', () => {
  const existing = flaggedStf();
  existing.note = 'renewed 2026';
  existing.pinned = true;
  const next = editSave(existing, { category: 'membership' });
  assert.equal(next.note, 'renewed 2026');
  assert.equal(next.pinned, true);
  assert.equal(next.fileName, 'card.pdf');
  assert.equal(next.mimeType, 'application/pdf');
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
  // Save then enforce are TWO transactions (documented, not pretended
  // atomic): a uniqueness failure must not reject an already-succeeded save
  // into the editor's "nothing was changed" copy — it warns and relies on
  // the deterministic selector until the next flagged save re-enforces.
  assert.match(tripView, /if \(next\.showOnToday\) await makeUnique\(next\.id\)/);
  assert.match(tripView, /if \(doc\.showOnToday\) await makeUnique\(doc\.id\)/);
  assert.match(tripView, /await enforceMembershipQuickAccess\(id\)/);
  assert.match(tripView, /catch \(err\)/);
  // The editor's submission is authoritative on every save path.
  const saves = tripView.match(/applyMembershipMetadata\(/g) ?? [];
  assert.ok(saves.length >= 2, 'both add and edit run the authoritative merge');
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
  // No nested interactive elements inside the quick-access button.
  const btn = quickAccess.slice(quickAccess.indexOf('<button'), quickAccess.indexOf('</button>'));
  assert.ok(!btn.slice(7).includes('<button'), 'single button, nothing nested');
});

test('the button is the owner-approved STF roundel, offline-safe, with a fallback', () => {
  // The asset ships in the repo and resolves under the Pages base path.
  assert.match(quickAccess, /import\.meta\.env\.BASE_URL\}images\/stf-logo\.png/);
  assert.ok(existsSync(join(root, 'public/images/stf-logo.png')), 'logo asset committed');
  // Decorative mark — the button itself carries the accessible name.
  assert.match(quickAccess, /<img[\s\S]*?alt=""[\s\S]*?aria-hidden/);
  assert.match(quickAccess, /aria-label="Open STF membership card"/);
  // A failed image load falls back to the neutral boxed treatment (IdCard +
  // STF monogram) — never an invisible touch target.
  assert.match(quickAccess, /onError=\{\(\) => setLogoFailed\(true\)\}/);
  assert.match(quickAccess, /logoFailed \?/);
  assert.match(quickAccess, /IdCard/);
  assert.match(quickAccess, />\s*STF\s*</);
});
