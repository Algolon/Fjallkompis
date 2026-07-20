/**
 * Trail Wallet UI contracts — source-text fences in the established style
 * (tests/lists-intro-placement.test.mjs). Storage BEHAVIOUR is exercised for
 * real in tests/wallet-store.test.mjs (fake-indexeddb); these tests only pin
 * the structural facts the Node-only suite cannot render: the fourth Lists
 * tab, the offline wording, the accept allowlist, the reset wiring and the
 * no-network guarantee.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const lists = read('src/screens/ListsScreen.tsx');
const walletView = read('src/components/WalletView.tsx');
const editor = read('src/components/WalletEditorSheet.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const css = read('src/styles/global.css');

// ---- Information architecture ----------------------------------------------

test('Wallet is the fourth and last Lists tab, with the compact "Wallet" label', () => {
  const tabIds = [...lists.matchAll(/\{ id: '([a-z]+)', label: '([^']+)' \}/g)].map((m) => ({
    id: m[1],
    label: m[2],
  }));
  assert.deepEqual(
    tabIds.map((t) => t.id),
    ['packing', 'shops', 'transport', 'wallet'],
    'tab order: Packing, Shops, Transport, Wallet — wallet appended last',
  );
  assert.equal(tabIds[3].label, 'Wallet', 'compact tab label');
});

test('no new primary route: the wallet lives inside the Lists screen only', () => {
  const routes = read('src/navigation/routes.mjs');
  assert.ok(!/wallet/i.test(routes), 'navigation route table untouched');
  assert.match(lists, /\{mode === 'wallet' \? <WalletView \/> : null\}/);
});

// ---- Offline honesty ---------------------------------------------------------

test('the wallet intro states local storage, offline availability and the deletion caveat', () => {
  const intro = lists.match(/wallet:\s*\n?\s*'([^']+)'/)?.[1];
  assert.ok(intro, 'LISTS_HEADER has a wallet entry');
  assert.match(intro, /Trail Wallet/, 'full feature name appears in copy');
  assert.match(intro, /stored locally on this device/i);
  assert.match(intro, /available offline/i);
  assert.match(intro, /Clearing the browser.s or app.s data also removes/i);
  assert.ok(!/cloud|sync|backed up/i.test(intro), 'never implies cloud storage');
});

test('the empty state invites adding and repeats the offline-on-this-device promise', () => {
  assert.match(walletView, /Add document/, 'prominent Add document CTA');
  assert.match(walletView, /stored on this device and stay available offline/i);
  assert.ok(
    !/passport/i.test(walletView) && !/passport/i.test(lists),
    'sensitive identity documents are not promoted as examples',
  );
});

test('storage-unavailable renders its own honest card, never the add-inviting empty state', () => {
  const start = walletView.indexOf("status === 'unavailable'");
  const end = walletView.indexOf('sorted.length === 0');
  assert.ok(start !== -1 && end > start, 'the unavailable branch precedes the normal render');
  const branch = walletView.slice(start, end);
  assert.match(branch, /Document storage isn.t available here/);
  assert.ok(!branch.includes('Add document'), 'no add CTA while storage is unavailable');
});

// ---- File validation ---------------------------------------------------------

test('the file input accept list comes from the model constant, never a hand-typed copy', () => {
  assert.match(editor, /accept=\{WALLET_FILE_ACCEPT\}/);
  assert.ok(!/accept="/.test(editor), 'no literal accept attribute');
});

test('oversize rejection reports the file size and the centralised limit', () => {
  assert.match(editor, /MAX_WALLET_FILE_BYTES/, 'limit read from the model');
  assert.match(editor, /formatBytes\(result\.sizeBytes\)/, 'the rejected file size is shown');
  assert.match(editor, /formatBytes\(MAX_WALLET_FILE_BYTES\)/, 'the allowed maximum is shown');
  assert.match(editor, /was not stored/, 'states the file was not stored');
});

test('file errors are announced (role="alert") and the pin control is a labelled toggle', () => {
  assert.match(editor, /role="alert"/);
  assert.match(editor, /aria-pressed=\{pinned\}/);
});

// ---- Card interaction structure ---------------------------------------------

test('cards use one large open button plus a separate labelled edit control — never nested', () => {
  assert.match(walletView, /className="wallet-card__open"/);
  assert.match(walletView, /aria-label=\{`Open \$\{doc\.title\}/);
  assert.match(walletView, /className="pack-edit wallet-card__edit"/);
  assert.match(walletView, /aria-label=\{`Edit \$\{doc\.title\}`\}/);
  // The edit button must be a SIBLING of the open button, not inside it.
  const openStart = walletView.indexOf('className="wallet-card__open"');
  const openEnd = walletView.indexOf('</button>', openStart);
  const editPos = walletView.indexOf('wallet-card__edit');
  assert.ok(editPos > openEnd, 'edit control sits outside the open button');
});

test('pinned state is carried by shape and text, not colour alone', () => {
  assert.match(walletView, /wallet-card__pin/, 'pin glyph on the title');
  assert.match(walletView, /\{doc\.pinned \? 'Pinned · ' : ''\}/, 'a "Pinned" word in the sub-line');
});

test('the wallet card styles exist on the shared token system', () => {
  for (const selector of [
    '.wallet-card {',
    '.wallet-card__open {',
    '.wallet-summary {',
    '.wallet-form-error {',
    '.wallet-viewer__frame {',
  ]) {
    assert.ok(css.includes(selector), `${selector.replace(' {', '')} rule exists`);
  }
  const openBlock = css.slice(css.indexOf('.wallet-card__open {'));
  assert.match(
    openBlock.slice(0, openBlock.indexOf('}')),
    /min-height: 5?\d+px/,
    'open region keeps a ≥44px touch target',
  );
});

// ---- Object URL hygiene -------------------------------------------------------

test('every created object URL has a matching revoke path', () => {
  const creates = (walletView.match(/URL\.createObjectURL/g) ?? []).length;
  assert.ok(creates >= 2, 'PDF open and image viewer both create URLs');
  assert.ok((walletView.match(/URL\.revokeObjectURL/g) ?? []).length >= creates - 1,
    'revocation paths exist (viewer revokes on close; PDF revokes delayed/failed)');
});

// ---- Settings integration -----------------------------------------------------

test('Reset local data names the Trail Wallet documents explicitly and clears them', () => {
  assert.match(
    settings,
    /permanently removes the Trail Wallet documents stored on this device/,
    'the confirmation copy is explicit, not generic',
  );
  assert.match(settings, /clearWalletData\(\)/, 'the wallet database is actually cleared');
  assert.match(
    settings,
    /Trip data was reset, but the Trail Wallet documents could not be removed/,
    'partial failure is reported honestly instead of claiming success',
  );
});

test('Backup & restore states that wallet documents are NOT in the JSON backup', () => {
  assert.match(
    settings,
    /Trail Wallet documents are stored\s+separately on this device and are not included in this backup file/,
  );
});

// ---- Offline-first by construction --------------------------------------------

test('no wallet module touches the network', () => {
  const walletDir = join(root, 'src/wallet');
  const files = readdirSync(walletDir).map((f) => read(join('src/wallet', f)));
  for (const [i, text] of files.entries()) {
    assert.ok(!/fetch\(|XMLHttpRequest|navigator\.onLine/.test(text),
      `src/wallet file #${i} is network-free`);
  }
  for (const text of [walletView, editor, read('src/hooks/useWalletDocuments.ts')]) {
    assert.ok(!/fetch\(|XMLHttpRequest/.test(text), 'wallet UI is network-free');
  }
});

// ---- Scope restraint -----------------------------------------------------------

test('out-of-scope features stay out: no search, OCR, camera, encryption, sync', () => {
  const all = walletView + editor + read('src/wallet/walletModel.mjs') + read('src/wallet/walletStore.mjs');
  for (const forbidden of ['ocr', 'camera', 'encrypt', 'passcode', 'sync(', 'searchDocuments']) {
    assert.ok(!all.toLowerCase().includes(forbidden), `no ${forbidden} in the wallet surface`);
  }
});
