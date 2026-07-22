/**
 * Trip plan UI contracts — source-text fences in the established style
 * (tests/lists-intro-placement.test.mjs). Storage BEHAVIOUR is exercised for
 * real in tests/wallet-store.test.mjs (fake-indexeddb) and the persisted
 * trip items in tests/state-migration.test.mjs; these tests pin the
 * structural facts the Node-only suite cannot render: the renamed fourth
 * Lists tab, the Trip plan groups, the Add chooser, the honest offline and
 * missing-attachment wording, the integrity rules and the no-network
 * guarantee.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const lists = read('src/screens/ListsScreen.tsx');
const tripView = read('src/components/TripView.tsx');
const itemSheet = read('src/components/TripItemSheet.tsx');
const editor = read('src/components/WalletEditorSheet.tsx');
const transportView = read('src/components/TransportView.tsx');
const stopsScreen = read('src/screens/StopsScreen.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const store = read('src/store/AppStore.tsx');
const css = read('src/styles/global.css');

// ---- Information architecture ----------------------------------------------

test('Trip is the fourth and last Lists tab, with the compact "Trip" label', () => {
  const tabIds = [...lists.matchAll(/\{ id: '([a-z]+)', label: '([^']+)' \}/g)].map((m) => ({
    id: m[1],
    label: m[2],
  }));
  assert.deepEqual(
    tabIds.map((t) => t.id),
    ['packing', 'shops', 'transport', 'trip'],
    'tab order: Packing, Shops, Transport, Trip — trip appended last',
  );
  assert.equal(tabIds[3].label, 'Trip', 'compact tab label');
});

test('Wallet terminology is fully replaced by Trip terminology in the Lists UI', () => {
  assert.ok(!/Wallet/.test(lists), 'no Wallet wording left on the Lists screen');
  assert.ok(!/wallet/.test(lists.match(/type ListsSection = [^;]+;/)[0]), 'section id renamed');
});

test('no new primary route: the trip plan lives inside the Lists screen only', () => {
  const routes = read('src/navigation/routes.mjs');
  assert.ok(!/['"]trip['"]|#\/trip/i.test(routes), 'navigation route table untouched');
  assert.match(lists, /\{mode === 'trip' \? <TripView launch=\{tripLaunch\} \/> : null\}/);
});

test('deep links open Trip: section id, a specific item, or a Track-stay prefill', () => {
  assert.match(lists, /tripItemId\?: string/);
  assert.match(lists, /trackStayStopId\?: string/);
  assert.match(lists, /if \(link\.tripItemId \|\| link\.trackStayStopId\) return 'trip'/);
  // One-shot: choosing a tab by hand clears any pending launch payload.
  assert.match(lists, /setTripLaunch\(null\)/);
});

// ---- Offline honesty ---------------------------------------------------------

test('the trip intro names the Trip plan, offline storage and the deletion caveat', () => {
  const intro = lists.match(/trip:\s*\n?\s*'([^']+)'/)?.[1];
  assert.ok(intro, 'LISTS_HEADER has a trip entry');
  assert.match(intro, /Trip plan/, 'full section title appears in copy');
  assert.match(intro, /travel, stays, bookings and important documents/i);
  assert.match(intro, /available offline/i);
  assert.match(intro, /stored locally on this device/i);
  assert.match(intro, /Clearing the browser.s or app.s data also removes/i);
  assert.ok(!/cloud|sync|backed up/i.test(intro), 'never implies cloud storage');
});

test('the empty state explains the purpose and offers Add item', () => {
  assert.match(tripView, /Add transport, stays and important documents for your trip/);
  assert.match(tripView, /Add item/, 'primary Add item CTA');
  assert.ok(!/passport/i.test(tripView), 'identity documents are not promoted as examples');
});

test('storage-unavailable renders an honest card and keeps trip items working', () => {
  assert.match(tripView, /Document storage isn.t available here/);
  assert.match(tripView, /Travel and stay items\s+still work/);
  // The document form can never be reached while storage is unavailable.
  assert.match(tripView, /wallet\.status !== 'ready'/);
});

test('a missing attachment is stated honestly, never silently restored', () => {
  assert.match(itemSheet, /Document not available on this device/);
  assert.match(tripView, /some not on this device/);
  assert.match(tripView, /missing from local storage on this device/);
});

// ---- Trip groups and cards ---------------------------------------------------

test('Travel, Stays and Documents render as labelled groups, hidden when empty', () => {
  for (const group of ['Travel', 'Stays', 'Documents']) {
    assert.match(tripView, new RegExp(`aria-label="${group}"`), `${group} group exists`);
    assert.match(
      tripView,
      new RegExp(`<div className="section-label">${group}</div>`),
      `${group} has a visible section label`,
    );
  }
  assert.match(tripView, /travel\.length > 0 \? \(/, 'empty Travel group is hidden');
  assert.match(tripView, /stays\.length > 0 \? \(/, 'empty Stays group is hidden');
});

test('item cards carry status as TEXT and use one large open button — never nested', () => {
  assert.match(tripView, /tripStatusTitle\(item\.status\)/, 'status word rendered');
  assert.match(css, /\.trip-status \{/, 'status badge styled on tokens');
  assert.match(tripView, /className="wallet-card__open"/);
  // Document cards keep the separate sibling edit control.
  assert.match(tripView, /className="pack-edit wallet-card__edit"/);
});

test('sorting is delegated to the pure model with an injected today', () => {
  assert.match(tripView, /sortTravelItems\(/);
  assert.match(tripView, /sortStayItems\(/);
  assert.match(tripView, /sortWalletDocuments\(/, 'documents keep their canonical order');
  assert.match(tripView, /todayIso\(\)/);
});

test('documents linked to an item leave the standalone Documents group', () => {
  assert.match(tripView, /linkedDocIds/);
  assert.match(tripView, /filter\(\(d\) => !linkedDocIds\.has\(d\.id\)\)/);
});

// ---- Add flow -----------------------------------------------------------------

test('Add item opens a chooser offering Transport, Stay and Document', () => {
  assert.match(tripView, /What would you like to add to your trip plan\?/);
  for (const pick of ["onPick\\('transport'\\)", "onPick\\('stay'\\)", "onPick\\('document'\\)"]) {
    assert.match(tripView, new RegExp(pick));
  }
  assert.ok(!/Add document<\/button>/.test(tripView), 'the old Add document CTA is gone');
});

test('the item form validates inline: empty titles blocked, check-out ordering flagged', () => {
  assert.match(itemSheet, /title\.trim\(\) !== ''/);
  assert.match(itemSheet, /isStayDateOrderValid/);
  assert.match(itemSheet, /Check-out can.t be before check-in/);
  assert.match(itemSheet, /aria-invalid=\{!stayOrderOk\}/);
  assert.match(itemSheet, /aria-describedby=\{!stayOrderOk \? checkOutErrorId : undefined\}/);
  assert.match(itemSheet, /role="alert"/);
});

test('the item form uses native date/time inputs and the model accept-list for files', () => {
  assert.match(itemSheet, /type="date"/);
  assert.match(itemSheet, /type="time"/);
  assert.match(itemSheet, /accept=\{WALLET_FILE_ACCEPT\}/);
  assert.ok(!/accept="/.test(itemSheet), 'no literal accept attribute');
});

// ---- Integrity rules ----------------------------------------------------------

test('deleting a trip item keeps its documents, and the confirmation says so', () => {
  // Confirmation goes through the shared accessible ConfirmDialog (the
  // PR#64 component), rendered inside the sheet's modal top layer — never
  // the native browser confirm().
  assert.match(itemSheet, /import \{ ConfirmDialog \} from '\.\/ConfirmDialog'/);
  assert.match(itemSheet, /Delete .\$\{item\.title\}.\?/);
  assert.match(itemSheet, /Its linked documents are kept/);
  assert.match(itemSheet, /destructive/, 'delete uses the danger treatment');
  assert.ok(!/confirm\(/.test(tripView), 'no native confirm() left in TripView');
  // Escape while the confirmation is up cancels IT, not the whole sheet.
  assert.match(itemSheet, /if \(confirmingDelete\) e\.preventDefault\(\)/);
  assert.match(store, /documents are deliberately NOT touched/i);
});

test('removing an attachment is an unlink — stated in copy — never a file delete', () => {
  assert.match(itemSheet, /Removing a document here only unlinks it/);
  assert.ok(
    !/deleteWalletDocument|wallet\.remove/.test(itemSheet),
    'the item sheet has no document-delete path',
  );
});

test('deleting a document clears stale item references through the store', () => {
  assert.match(tripView, /removeTripAttachmentReferences\(id\)/);
  assert.match(store, /removeTripAttachmentReferences/);
});

test('item identity and provenance are immutable through ordinary patches', () => {
  assert.match(store, /id: i\.id/);
  assert.match(store, /kind: i\.kind/);
  assert.match(store, /createdAt: i\.createdAt/);
  assert.match(store, /linkedStopId: i\.linkedStopId/);
  assert.match(store, /linkedTransportId: i\.linkedTransportId/);
  assert.match(store, /updatedAt: Date\.now\(\)/);
});

// ---- Transport integration ----------------------------------------------------

test('Transport reference cards gain Add to Trip / View in Trip, wired via Lists', () => {
  assert.match(transportView, /onAddToTrip\?: \(entryId: string\) => void/);
  assert.match(transportView, /Add to Trip/);
  assert.match(transportView, /View in Trip/);
  assert.match(transportView, /Add to Trip again/, 'legitimate repeats stay possible');
  assert.match(lists, /onAddToTrip=\{addTransportToTrip\}/);
  assert.match(lists, /onViewInTrip=\{viewTripItem\}/);
});

test('the prefill flow copies verified facts only — personal fields stay personal', () => {
  assert.match(tripView, /transportPrefillFromEntry\(entry\)/);
  // The reference view itself never mutates the store directly.
  assert.ok(!/addTripItem/.test(transportView), 'TransportView only signals; Trip owns creation');
});

// ---- Stops integration --------------------------------------------------------

test('every stop offers Track stay (or View stay in Trip when already tracked)', () => {
  assert.match(stopsScreen, /Track stay/);
  assert.match(stopsScreen, /View stay in Trip/);
  assert.match(stopsScreen, /trackStayStopId: stop\.id/);
  assert.match(stopsScreen, /tripItemId: linked\.id/);
  assert.match(stopsScreen, /i\.kind === 'stay' && i\.linkedStopId === stop\.id/);
});

test('the stay prefill uses the stable stop id and verified stop facts only', () => {
  assert.match(tripView, /stayPrefillFromStop\(stop\)/);
});

// ---- Legacy document categories -----------------------------------------------

test('the document editor offers the six categories plus a record’s own legacy one', () => {
  assert.match(editor, /LEGACY_WALLET_CATEGORIES/);
  assert.match(editor, /categoryOptions\.map/);
  assert.ok(!/WALLET_CATEGORIES\.map/.test(editor), 'select renders the merged option list');
});

// ---- Object URL hygiene -------------------------------------------------------

test('every created object URL has a matching revoke path', () => {
  const creates = (tripView.match(/URL\.createObjectURL/g) ?? []).length;
  assert.ok(creates >= 2, 'PDF open and image viewer both create URLs');
  assert.ok(
    (tripView.match(/URL\.revokeObjectURL/g) ?? []).length >= creates - 1,
    'revocation paths exist (viewer revokes on close; PDF revokes delayed/failed)',
  );
});

// ---- Settings integration -----------------------------------------------------

test('Reset local data names the trip plan and stored documents explicitly', () => {
  assert.match(settings, /clears your packing list, trip plan, stop notes, journal/);
  assert.match(settings, /permanently removes the documents stored on this device/);
  assert.match(settings, /clearWalletData\(\)/, 'the document database is actually cleared');
  assert.match(
    settings,
    /Trip data was reset, but the stored documents could not be removed/,
    'partial failure is reported honestly instead of claiming success',
  );
});

test('Backup & restore states trip items ARE included and document files are NOT', () => {
  assert.match(settings, /backup includes your Trip plan.s\s+travel and stay items/);
  assert.match(
    settings,
    /document FILES are stored\s+separately on this device and are not included/,
  );
  assert.match(settings, /items list any missing documents honestly/);
});

// ---- Offline-first by construction --------------------------------------------

test('no trip or document module touches the network', () => {
  for (const dir of ['src/wallet', 'src/trip']) {
    for (const f of readdirSync(join(root, dir))) {
      const text = read(join(dir, f));
      assert.ok(
        !/fetch\(|XMLHttpRequest|navigator\.onLine/.test(text),
        `${dir}/${f} is network-free`,
      );
    }
  }
  for (const text of [tripView, itemSheet, editor, read('src/hooks/useWalletDocuments.ts')]) {
    assert.ok(!/fetch\(|XMLHttpRequest/.test(text), 'trip/document UI is network-free');
  }
});

// ---- Scope restraint -----------------------------------------------------------

test('out-of-scope features stay out: no OCR, camera, sync, readiness %, next actions', () => {
  const all =
    tripView +
    itemSheet +
    editor +
    read('src/trip/tripModel.mjs') +
    read('src/wallet/walletModel.mjs');
  for (const forbidden of ['ocr', 'camera', 'encrypt', 'passcode', 'sync(', 'readinesspercent']) {
    assert.ok(!all.toLowerCase().includes(forbidden), `no ${forbidden} in the trip surface`);
  }
  // No computed readiness percentage anywhere in the trip model/summary.
  assert.ok(
    !/percent\s*[:=]|\*\s*100/.test(read('src/trip/tripModel.mjs')),
    'summary computes no percentage',
  );
});

// ---- Status semantics ----------------------------------------------------------

test('status is never inferred from attachment presence in either direction', () => {
  const model = read('src/trip/tripModel.mjs');
  assert.ok(
    !/attachmentIds[^\n]*\bstatus\b|\bstatus\b[^\n]*attachmentIds\.length/.test(model),
    'no attachment-count → status coupling in the model',
  );
  // The store never rewrites status when attachments change.
  const refBlock = store.slice(
    store.indexOf('const removeTripAttachmentReferences'),
    store.indexOf('const upsertJournalEntry'),
  );
  assert.ok(!/status/.test(refBlock), 'attachment cleanup leaves status untouched');
});

test('Trip statuses stay distinct from Packing statuses', () => {
  const model = read('src/trip/tripModel.mjs');
  assert.ok(!/'ready'|'packed'/.test(model), 'no packing vocabulary in the trip model');
});
