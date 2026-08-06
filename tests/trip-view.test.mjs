/**
 * Trip plan UI contracts — source-text fences. Storage BEHAVIOUR is
 * exercised for real in tests/wallet-store.test.mjs (fake-indexeddb) and the
 * persisted trip items in tests/state-migration.test.mjs; these tests pin
 * the structural facts the Node-only suite cannot render: the Trip plan's
 * vNext home (Plan → Trip), the Trip plan groups, the Add chooser, the
 * honest offline and missing-attachment wording, the integrity rules and
 * the no-network guarantee.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const plan = read('src/screens/PlanScreen.tsx');
const guide = read('src/screens/GuideScreen.tsx');
const tripView = read('src/components/TripView.tsx');
const itemSheet = read('src/components/TripItemSheet.tsx');
const editor = read('src/components/WalletEditorSheet.tsx');
const transportView = read('src/components/TransportView.tsx');
const stopsScreen = read('src/screens/StopsScreen.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const store = read('src/store/AppStore.tsx');
const css = read('src/styles/global.css');

// ---- Information architecture ----------------------------------------------

test('Travel & stays and Wallet live under Plan with their own canonical routes', () => {
  // Plan home indexes both; the section screens render the shared TripView
  // as two purposeful filtered views (items vs documents).
  assert.match(plan, /export function PlanTravelScreen/);
  assert.match(plan, /export function PlanWalletScreen/);
  const routes = read('src/navigation/routes.mjs');
  assert.match(routes, /'day', 'packing', 'travel', 'wallet'/, 'both are Plan section routes');
  // The pilot's short-lived combined route stays reachable as an alias.
  assert.match(routes, /'#\/plan\/trip', '#\/plan\/travel'/);
});

test('the wallet tile is document-oriented and compact — Wallet, not a list', () => {
  assert.ok(plan.includes("title: 'Wallet'") || /plan-card__label">[\s\S]{0,80}Wallet/.test(plan));
  assert.ok(!plan.includes("title: 'Wallet & documents'"), 'compact primary title');
  // The tile shows a concise count/status, never document rows.
  assert.match(plan, /walletCount/);
  assert.ok(!plan.includes('wallet-card__open'), 'no document list on the Plan home');
  const today = read('src/screens/TodayScreen.tsx');
  assert.ok(!/wallet/.test(today.match(/type ListsSection = [^;]+;/)[0]), 'no wallet section id');
});

test('deep links open Travel & stays: an item, a Track-stay or a transport prefill', () => {
  const today = read('src/screens/TodayScreen.tsx');
  assert.match(today, /tripItemId\?: string/);
  assert.match(today, /trackStayPlaceId\?: string/);
  // The launch is derived once at mount from the one-shot payload — a fresh
  // visit (no payload) opens the plain view.
  assert.match(plan, /initialTripLaunchFor\(deepLink\)/);
  assert.match(plan, /if \(link\?\.tripItemId\) return \{ kind: 'item' as const, itemId: link\.tripItemId \};/);
  assert.match(plan, /kind: 'add-stay' as const, placeId: link\.trackStayPlaceId/);
});

// ---- Offline honesty ---------------------------------------------------------

test('the Wallet intro keeps the offline-storage honesty and deletion caveat', () => {
  // The documents' storage honesty moved to the Wallet with the documents.
  const start = plan.indexOf('export function PlanWalletScreen');
  const intro = plan.slice(start, plan.indexOf('<TripView', start));
  assert.ok(start > -1, 'PlanWalletScreen exists');
  assert.match(intro, /available offline/i);
  assert.match(intro, /stored locally on this device/i);
  assert.match(intro, /clearing the browser.s or\s+app.s data also removes/i);
  assert.ok(!/cloud|sync|backed up/i.test(intro), 'never implies cloud storage');
});

test('both empty states explain the purpose and offer the right Add action', () => {
  assert.match(tripView, /Organize your stays and transport here\./);
  assert.match(tripView, /Add and organize your bookings, tickets and other travel documents\./);
  assert.match(tripView, /Add item/, 'travel CTA');
  assert.match(tripView, /Add document/, 'wallet CTA');
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

test('documents attached to an item are annotated in the Wallet, never hidden', () => {
  // The Wallet answers "which document do I need?" completely: attached
  // documents stay listed, carrying a quiet annotation instead of vanishing
  // into their item.
  assert.match(tripView, /linkedDocIds/);
  assert.match(tripView, /' \(attached to a trip item\)'/);
  assert.match(tripView, /' · attached'/);
});

// ---- Add flow -----------------------------------------------------------------

test('Travel adds via a Transport/Stay chooser; Wallet adds documents directly', () => {
  assert.match(tripView, /What would you like to add to your travel plan\?/);
  for (const pick of ["onPick\\('transport'\\)", "onPick\\('stay'\\)"]) {
    assert.match(tripView, new RegExp(pick));
  }
  assert.ok(!/onPick\('document'\)/.test(tripView), 'no document pick in the travel chooser');
  assert.match(tripView, /\{ mode: 'doc-add' \}/, 'the Wallet opens the document editor directly');
});

test('the item form validates inline: empty titles blocked, check-out ordering flagged', () => {
  assert.match(itemSheet, /title\.trim\(\) !== ''/);
  assert.match(itemSheet, /isStayDateOrderValid/);
  assert.match(itemSheet, /Check-out can.t be before check-in/);
  // The order rule surfaces on the check-out DateField exactly as it did on
  // the native input: invalid state + association with the error text.
  assert.match(itemSheet, /invalid=\{!stayOrderOk\}/);
  assert.match(itemSheet, /describedBy=\{checkOutErrorId\}/);
  assert.match(itemSheet, /role="alert"/);
});

test('the item form date/time fields follow the picker policy and use the model accept-list', () => {
  // Transport AND stay use the app-owned pickers (stay adopted in rollout
  // step 2). The full policy (and its owner decision record) is fenced in
  // tests/native-picker-policy.test.mjs.
  assert.match(itemSheet, /<DateField\b/);
  assert.match(itemSheet, /<TimeField\b/);
  assert.ok(!/type="date"/.test(itemSheet), 'no native date inputs remain in the trip sheet');
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

// ---- Existing-document linking (v0.26.3) -------------------------------------

test('choosing an existing document stages it immediately — no separate Link step', () => {
  // The v0.26.2 chain (choose in a select → press Link → press Save) lost
  // the chosen document whenever Save came before Link — a silent discard.
  // Selection now adds straight into the draft attachment list; the select
  // stays pinned to its placeholder (value=""), so there is no half-chosen
  // state left for Save to throw away, and duplicates stay impossible.
  assert.match(
    itemSheet,
    /setAttachmentIds\(\(cur\) => \(cur\.includes\(id\) \? cur : \[\.\.\.cur, id\]\)\);/,
  );
  assert.match(itemSheet, /value=""\s*\n\s*onChange/);
  assert.ok(!itemSheet.includes('linkPick'), 'the intermediate pick state is gone');
  assert.ok(!itemSheet.includes('Link2'), 'and so is the separate Link button');
  // Removing a staged document before Save remains an ordinary row action.
  assert.match(itemSheet, /cur\.filter\(\(id\) => id !== docId\)/);
});

test('the wallet states are distinguished — loading is never called unavailable', () => {
  assert.match(itemSheet, /walletStatus === 'loading'/);
  assert.match(itemSheet, /Loading documents…/);
  assert.match(itemSheet, /Document storage isn’t available in this browser mode/);
  // Ready-but-nothing-linkable has its own honest line when documents exist.
  assert.match(itemSheet, /Every stored document is already linked to this item\./);
});

test('a document whose file is missing stays visible and honestly labelled', () => {
  // v0.26.2 hid metadata-only documents from every list and picker. They now
  // appear — linkable, because the relationship outlives the evicted file —
  // with the missing FILE named wherever the document shows.
  assert.match(itemSheet, /fileMissing \? ' — file unavailable on this device' : ''/);
  assert.match(tripView, /— file unavailable on this device/);
  // Item cards count a present-but-fileless document as a missing attachment.
  assert.match(tripView, /return !d \|\| d\.fileMissing === true;/);
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

test('item identity and transport provenance are immutable through ordinary patches', () => {
  assert.match(store, /id: i\.id/);
  assert.match(store, /kind: i\.kind/);
  assert.match(store, /createdAt: i\.createdAt/);
  assert.match(
    store,
    /i\.kind === 'transport' \? \{ linkedTransportId: i\.linkedTransportId \} : \{\}/,
    'transport provenance stays pinned',
  );
  // A Stay's Place link is deliberately NOT pinned: the Linked place control
  // edits it through the same draft transaction as every other stay field.
  assert.ok(
    !/linkedPlaceId: i\.linkedPlaceId/.test(store),
    'the stay place link is patch-editable',
  );
  assert.match(store, /updatedAt: Date\.now\(\)/);
});

// ---- Transport integration ----------------------------------------------------

test('Transport reference cards gain Add to Trip / View in Trip, wired via Guide', () => {
  assert.match(transportView, /onAddToTrip\?: \(entryId: string\) => void/);
  assert.match(transportView, /Add to Trip/);
  assert.match(transportView, /View in Trip/);
  assert.match(transportView, /Add to Trip again/, 'legitimate repeats stay possible');
  // vNext: the reference view lives in the Guide dossier; its Trip launches
  // cross into Plan → Trip as one-shot navigation payloads.
  assert.match(guide, /onAddToTrip=\{\(entryId\) =>\s*\n?\s*onNavigate\('plan', \{ lists: \{ addTransportEntryId: entryId \} \}\)/);
  assert.match(guide, /onViewInTrip=\{\(itemId\) =>\s*\n?\s*onNavigate\('plan', \{ lists: \{ tripItemId: itemId \} \}\)/);
});

test('the prefill flow copies verified facts only — personal fields stay personal', () => {
  assert.match(tripView, /transportPrefillFromEntry\(entry\)/);
  // The reference view itself never mutates the store directly.
  assert.ok(!/addTripItem/.test(transportView), 'TransportView only signals; Trip owns creation');
});

// ---- Stops integration --------------------------------------------------------

test('every place offers Track stay / View stay in Trip / an N-stays chooser', () => {
  assert.match(stopsScreen, /'Track stay'/);
  assert.match(stopsScreen, /'View stay in Trip'/);
  assert.match(stopsScreen, /\$\{count\} stays in Trip/);
  assert.match(stopsScreen, /trackStayPlaceId: placeId/);
  assert.match(stopsScreen, /staysLinkedToPlace\(state\.trip, stop\.id\)/);
});

test('the stay prefill resolves through the Journey Place model — verified facts only', () => {
  assert.match(tripView, /placeStayPrefill\(journeyPlaceById\(launch\.placeId, STOPS_BY_ID\), STOPS_BY_ID\)/);
});

// ---- Legacy document categories -----------------------------------------------

test('the document editor offers the six categories plus a record’s own legacy one', () => {
  assert.match(editor, /LEGACY_WALLET_CATEGORIES/);
  assert.match(editor, /categoryOptions\.map/);
  assert.ok(!/WALLET_CATEGORIES\.map/.test(editor), 'select renders the merged option list');
});

// ---- Object URL hygiene -------------------------------------------------------

test('every created object URL has a matching revoke path', () => {
  // URL creation moved to the shared opener (also used by the Today
  // membership quick access); TripView keeps the viewer-close revoke.
  const opener = readFileSync(join(root, 'src/wallet/documentOpening.ts'), 'utf8');
  const creates = (opener.match(/URL\.createObjectURL/g) ?? []).length;
  assert.ok(creates >= 2, 'PDF open and image viewer both create URLs');
  assert.ok(
    (opener.match(/URL\.revokeObjectURL/g) ?? []).length >= creates - 1,
    'revocation paths exist in the opener (PDF revokes delayed/failed)',
  );
  assert.match(tripView, /URL\.revokeObjectURL\(viewer\.url\)/,
    'the image viewer URL is revoked on close');
  assert.match(opener, /kind: 'image'; url: string/,
    'image URLs are handed to the caller, which owns the revoke');
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
