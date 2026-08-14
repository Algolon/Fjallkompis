/**
 * Trail Wallet — delivering ONE stored document, on both platforms.
 *
 * Complete backup/restore already carries documents across platforms; this is
 * the other half: opening/viewing a stored document from ANY surface that
 * references it — the Wallet list, Travel & stays attachments (both in
 * TripView) and the Today quick access (MembershipQuickAccess) all call the
 * same shared opener.
 *
 * WHAT WENT WRONG BEFORE, AND WHERE VIEWING LIVES NOW. PDFs used to leave
 * the app, and both departures failed or misfired in their own way:
 *
 *   1. `window.open(blobUrl)` as the PDF viewer: current Chromium WebViews
 *      return a REAL WindowProxy and silently drop the same-tab blob
 *      navigation — every PDF surface in the Play build was a dead button
 *      while the PWA kept working (#146's diagnosis);
 *   2. #146's fix, a native ACTION_VIEW hand-off, worked — but handed the
 *      user to Adobe/whatever external app resolved, which is the wrong
 *      product: a Fjallkompis document opens IN Fjallkompis.
 *
 * Now every platform renders PDFs in the app's own viewer
 * (src/components/WalletPdfViewer.tsx, pdf.js underneath), so the opener has
 * NO platform question left to ask for images or PDFs. The one boundary it
 * still consults is SAVING (src/runtime/fileSave.ts) — the defensive
 * delivery for a stored type the app cannot display. This file exercises the
 * opener with substituted boundaries — real behaviour, not source-string
 * archaeology — plus a few source contracts pinning the architecture.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openWalletDocumentWith } from '../src/wallet/documentDelivery.mjs';
import { walletDownloadFileName } from '../src/wallet/walletModel.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** Strip comments: prose explaining a retired path must not satisfy a check. */
const codeOf = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ---- Harness ----------------------------------------------------------------

const PDF_DOC = {
  id: 'doc-pdf',
  title: 'Train ticket',
  fileName: 'Ticket 12 Aug.pdf',
  mimeType: 'application/pdf',
};
const IMAGE_DOC = {
  id: 'doc-img',
  title: 'Membership card',
  fileName: 'card.png',
  mimeType: 'image/png',
};
const pdfBlob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
const imageBlob = new Blob(['png-bytes'], { type: 'image/png' });

/** A recording platform whose save boundary answers as scripted. */
function platformStub({ save = 'saved' } = {}) {
  const calls = [];
  return {
    calls,
    saveFile: async (fileName, blob, mimeType) => {
      calls.push({ boundary: 'save', fileName, blob, mimeType });
      if (save instanceof Error) throw save;
      return save;
    },
  };
}

const fileOf = (blob) => async (id) =>
  id === PDF_DOC.id ? (blob ?? pdfBlob) : id === IMAGE_DOC.id ? imageBlob : null;

// ---- PDF routing: the app's own viewer, on every platform ---------------------

test('a PDF returns its stored bytes for the in-app viewer — no boundary consulted', async () => {
  const platform = platformStub();
  const result = await openWalletDocumentWith(platform, PDF_DOC, fileOf());
  assert.equal(result.kind, 'pdf');
  assert.equal(result.blob, pdfBlob, 'the stored bytes, not a copy');
  assert.equal(result.fileName, 'Ticket 12 Aug.pdf',
    'the delivered name rides along for the viewer’s save fallback');
  assert.deepEqual(platform.calls, [],
    'viewing a PDF is in-app everywhere: neither an external viewer nor the save picker runs');
});

test('an empty (zero-byte) stored PDF still reaches the in-app viewer', async () => {
  // Corrupt or empty content is the VIEWER's to diagnose (it shows an honest
  // error and offers saving a copy); the opener's contract is only "hand
  // over exactly what is stored" — and a 0-byte blob is falsy-adjacent bait
  // for a `!blob` check, which must not swallow it.
  const empty = new Blob([], { type: 'application/pdf' });
  const platform = platformStub();
  const result = await openWalletDocumentWith(platform, PDF_DOC, async () => empty);
  assert.equal(result.kind, 'pdf');
  assert.equal(result.blob, empty);
  assert.deepEqual(platform.calls, []);
});

// ---- Image routing ------------------------------------------------------------

test('an image never touches the save boundary — the in-app sheet owns it', async () => {
  const platform = platformStub();
  const result = await openWalletDocumentWith(platform, IMAGE_DOC, fileOf());
  assert.equal(result.kind, 'image');
  assert.match(result.url, /^blob:/, 'the caller gets an object URL (and owns its revoke)');
  assert.deepEqual(platform.calls, [], 'no platform boundary is involved for images');
  URL.revokeObjectURL(result.url);
});

test('routing is by stored MIME type, not by filename', async () => {
  // A PNG whose filename LIES about being a PDF still opens in the image sheet.
  const doc = { ...IMAGE_DOC, fileName: 'looks-like.pdf' };
  const platform = platformStub();
  const result = await openWalletDocumentWith(platform, doc, async () => imageBlob);
  assert.equal(result.kind, 'image');
  assert.deepEqual(platform.calls, []);
  URL.revokeObjectURL(result.url);
});

test('a PDF-typed document routes to the viewer even under a lying filename', async () => {
  const doc = { ...PDF_DOC, fileName: 'scan.png' };
  const platform = platformStub();
  const result = await openWalletDocumentWith(platform, doc, async () => pdfBlob);
  assert.equal(result.kind, 'pdf');
  assert.deepEqual(platform.calls, []);
});

// ---- The defensive branch: types the app has no viewer for ---------------------

test('a non-image, non-PDF type is delivered as a saved copy — and says so', async () => {
  // The wallet model only admits images and PDFs today; if anything else
  // ever reaches storage, pretending to display it would be a lie — the
  // platform save boundary is the honest delivery.
  const doc = { id: 'doc-odd', title: 'Odd', fileName: 'odd.bin', mimeType: 'application/zip' };
  const platform = platformStub({ save: 'saved' });
  const result = await openWalletDocumentWith(platform, doc, async () => pdfBlob);
  assert.deepEqual(result, { kind: 'saved-copy' });
  assert.equal(platform.calls.length, 1);
  assert.equal(platform.calls[0].mimeType, 'application/zip');
  assert.equal(platform.calls[0].fileName, 'odd.bin');
});

test('a cancelled save picker is reported as cancelled, never as saved', async () => {
  const doc = { id: 'doc-odd', title: 'Odd', fileName: 'odd.bin', mimeType: 'application/zip' };
  const platform = platformStub({ save: 'cancelled' });
  const result = await openWalletDocumentWith(platform, doc, async () => pdfBlob);
  assert.deepEqual(result, { kind: 'save-cancelled' });
});

test('when the save boundary fails the outcome is failed — never a rejection', async () => {
  // Click handlers await this directly; an unhandled rejection IS the dead
  // button this module exists to prevent.
  const doc = { id: 'doc-odd', title: 'Odd', fileName: 'odd.bin', mimeType: 'application/zip' };
  const platform = platformStub({ save: new Error('disk full') });
  const result = await openWalletDocumentWith(platform, doc, async () => pdfBlob);
  assert.deepEqual(result, { kind: 'failed' });
});

// ---- Missing and unreadable files ---------------------------------------------

test('a missing blob is reported honestly, before any boundary is consulted', async () => {
  const platform = platformStub();
  const result = await openWalletDocumentWith(platform, PDF_DOC, async () => null);
  assert.deepEqual(result, { kind: 'missing' });
  assert.deepEqual(platform.calls, []);
});

test('a storage read that throws is treated as missing, not as a crash', async () => {
  const platform = platformStub();
  const result = await openWalletDocumentWith(platform, PDF_DOC, async () => {
    throw new Error('IndexedDB unavailable');
  });
  assert.deepEqual(result, { kind: 'missing' });
});

// ---- The platform boundary and the retired escape hatches ---------------------
// Cross-platform claims about code node cannot execute (Capacitor, dialogs)
// are stated as source contracts on the involved files.

const opener = read('src/wallet/documentDelivery.mjs');
const binding = read('src/wallet/documentOpening.ts');
const fileSave = read('src/runtime/fileSave.ts');
const tripView = read('src/components/TripView.tsx');
const quickAccess = read('src/components/MembershipQuickAccess.tsx');
const pdfViewer = read('src/components/WalletPdfViewer.tsx');

test('the binding wires the real save boundary to the shared opener — and nothing else', () => {
  assert.match(binding, /saveFile: saveGeneratedFile/);
  assert.ok(!/openInViewer|fileView/.test(codeOf(binding)),
    'the external-viewer boundary is gone: PDFs render in-app on every platform');
});

test('the external file-view boundary is fully retired', () => {
  assert.ok(!existsSync(join(root, 'src/runtime/fileView.ts')),
    'src/runtime/fileView.ts (window.open tab / ACTION_VIEW bridge) must not come back');
});

test('window.open appears NOWHERE in the document path — viewing never leaves the app', () => {
  for (const [name, source] of [
    ['src/wallet/documentDelivery.mjs', opener],
    ['src/wallet/documentOpening.ts', binding],
    ['src/components/TripView.tsx', tripView],
    ['src/components/MembershipQuickAccess.tsx', quickAccess],
    ['src/components/WalletPdfViewer.tsx', pdfViewer],
    ['src/runtime/fileSave.ts', fileSave],
  ]) {
    assert.ok(!/window\.open\s*\(/.test(codeOf(source)), `${name} must not call window.open`);
  }
});

test('only the runtime boundary branches on platform or talks to Capacitor', () => {
  assert.match(codeOf(fileSave), /isNativeAndroid\(\)/);
  for (const [name, source] of [
    ['src/wallet/documentDelivery.mjs', opener],
    ['src/wallet/documentOpening.ts', binding],
    ['src/components/TripView.tsx', tripView],
    ['src/components/MembershipQuickAccess.tsx', quickAccess],
    ['src/components/WalletPdfViewer.tsx', pdfViewer],
  ]) {
    assert.ok(
      !/isNativeAndroid|Capacitor|registerPlugin/.test(codeOf(source)),
      `${name} must not learn which platform it is on — that is src/runtime/'s job`,
    );
  }
});

// ---- Every surface routes PDFs to the shared viewer and reports the rest ------

test('TripView (Wallet + Travel & stays) mounts the shared in-app PDF viewer', () => {
  assert.match(tripView, /result\.kind === 'pdf'/);
  assert.match(tripView, /<WalletPdfViewer/);
  assert.match(tripView, /result\.kind === 'saved-copy'/);
  assert.match(tripView, /result\.kind === 'save-cancelled'/);
  assert.match(tripView, /result\.kind === 'failed'/);
  assert.match(tripView, /missing from local storage/);
});

test('the Today quick access mounts the SAME viewer — a tap never ends in silence', () => {
  assert.match(quickAccess, /result\.kind === 'pdf'/);
  assert.match(quickAccess, /<WalletPdfViewer/);
  assert.match(quickAccess, /result\.kind === 'saved-copy'/);
  assert.match(quickAccess, /result\.kind === 'save-cancelled'/);
  assert.match(quickAccess, /result\.kind === 'failed'/);
  assert.match(quickAccess, /result\.kind === 'missing'/);
  assert.match(quickAccess, /no longer stored on this device/);
  assert.match(quickAccess, /role="status"/, 'outcome feedback is announced accessibly');
});

// ---- Local-first semantics are unchanged -------------------------------------

test('delivering a document stays entirely local and offline', () => {
  for (const [name, source] of [
    ['src/wallet/documentDelivery.mjs', opener],
    ['src/components/TripView.tsx', tripView],
    ['src/components/WalletPdfViewer.tsx', pdfViewer],
  ]) {
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(codeOf(source)),
      `${name} must not reach the network to hand the user their own file`);
  }
  // The bytes come from local storage and go straight to the viewer.
  assert.match(tripView, /await wallet\.getFile\(doc\.id\)/);
  assert.match(opener, /await getFile\(doc\.id\)/);
});

// ---- The delivered filename (unchanged contract) ------------------------------

test('the delivered filename keeps the name the user attached', () => {
  assert.equal(
    walletDownloadFileName({ fileName: 'Ticket 12 Aug.pdf', title: 'Train', mimeType: 'application/pdf' }),
    'Ticket 12 Aug.pdf',
  );
  assert.equal(
    walletDownloadFileName({ fileName: '   ', title: 'Insurance', mimeType: 'application/pdf' }),
    'Insurance.pdf',
  );
});

test('a document with no stored filename still gets the right extension', () => {
  assert.equal(
    walletDownloadFileName({ title: 'Insurance', mimeType: 'application/pdf' }),
    'Insurance.pdf',
  );
  assert.equal(walletDownloadFileName({ title: 'Card', mimeType: 'image/jpeg' }), 'Card.jpg');
  assert.equal(walletDownloadFileName({ title: 'Card', mimeType: 'image/png' }), 'Card.png');
  assert.equal(walletDownloadFileName({ title: 'Card', mimeType: 'image/webp' }), 'Card.webp');
  assert.equal(
    walletDownloadFileName({ title: 'Insurance.pdf', mimeType: 'application/pdf' }),
    'Insurance.pdf',
  );
  assert.equal(
    walletDownloadFileName({ title: 'Insurance.PDF', mimeType: 'application/pdf' }),
    'Insurance.PDF',
  );
  assert.equal(walletDownloadFileName({ mimeType: 'application/pdf' }), 'document.pdf');
  assert.equal(walletDownloadFileName({}), 'document');
  assert.equal(walletDownloadFileName(undefined), 'document');
});
