/**
 * Trail Wallet — delivering ONE stored document, on both platforms.
 *
 * Complete backup/restore already carries documents across platforms; this is
 * the other half: opening/viewing a stored document from ANY surface that
 * references it — the Wallet list, Travel & stays attachments (both in
 * TripView) and the Today quick access (MembershipQuickAccess) all call the
 * same shared opener.
 *
 * WHAT WENT WRONG, TWICE. Both regressions were the same class of bug — a
 * web idiom silently meaning nothing in the Android wrapper:
 *
 *   1. `<a download>` on a blob: URL (the WebView ignores it entirely) —
 *      fixed by routing delivery through src/runtime/fileSave.ts (#133);
 *   2. `window.open(blobUrl)` as the PDF viewer, with a null window as the
 *      fallback trigger. Current Chromium WebViews (emulator-verified on
 *      Chrome 133) return a REAL WindowProxy and then silently drop the
 *      same-tab blob navigation — so the opener reported 'pdf-opened',
 *      the SAF fallback never ran, and every PDF surface in the Play build
 *      was a dead button while the PWA kept working.
 *
 * The lesson both times: whether a platform can show or save a file is a
 * PLATFORM fact. It is answered only in src/runtime/ (fileView.ts,
 * fileSave.ts); the shared opener in documentDelivery.mjs stays
 * platform-ignorant and is exercised HERE with substituted boundaries —
 * real behaviour, not source-string archaeology.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

/** A recording platform whose two boundaries answer as scripted. */
function platformStub({ view = 'opened', save = 'saved' } = {}) {
  const calls = [];
  return {
    calls,
    openInViewer: async (fileName, blob, mimeType) => {
      calls.push({ boundary: 'view', fileName, blob, mimeType });
      if (view instanceof Error) throw view;
      return view;
    },
    saveFile: async (fileName, blob, mimeType) => {
      calls.push({ boundary: 'save', fileName, blob, mimeType });
      if (save instanceof Error) throw save;
      return save;
    },
  };
}

const fileOf = (blob) => async (id) =>
  id === PDF_DOC.id ? (blob ?? pdfBlob) : id === IMAGE_DOC.id ? imageBlob : null;

// ---- PDF routing: viewer first, honest fallback ------------------------------

test('a PDF goes to the platform viewer, and an opened viewer is the outcome', async () => {
  const platform = platformStub({ view: 'opened' });
  const result = await openWalletDocumentWith(platform, PDF_DOC, fileOf());
  assert.deepEqual(result, { kind: 'pdf-opened' });
  assert.deepEqual(platform.calls.map((c) => c.boundary), ['view'],
    'the save fallback must not run when the viewer took the document');
});

test('a platform that cannot view falls back to saving a copy — and says so', async () => {
  const platform = platformStub({ view: 'unavailable', save: 'saved' });
  const result = await openWalletDocumentWith(platform, PDF_DOC, fileOf());
  assert.deepEqual(result, { kind: 'pdf-saved' });
  assert.deepEqual(platform.calls.map((c) => c.boundary), ['view', 'save'],
    'the viewer is tried FIRST; saving is the fallback');
});

test('a cancelled save picker is reported as cancelled, never as saved', async () => {
  const platform = platformStub({ view: 'unavailable', save: 'cancelled' });
  const result = await openWalletDocumentWith(platform, PDF_DOC, fileOf());
  assert.deepEqual(result, { kind: 'pdf-save-cancelled' });
});

test('a viewer boundary that THROWS still reaches the save fallback', async () => {
  // A native bridge failure must degrade to the save path, not to a dead tap.
  const platform = platformStub({ view: new Error('bridge exploded'), save: 'saved' });
  const result = await openWalletDocumentWith(platform, PDF_DOC, fileOf());
  assert.deepEqual(result, { kind: 'pdf-saved' });
});

test('when the fallback fails too the outcome is failed — never a rejection', async () => {
  // Click handlers await this directly; an unhandled rejection IS the dead
  // button this module exists to prevent.
  const platform = platformStub({ view: 'unavailable', save: new Error('disk full') });
  const result = await openWalletDocumentWith(platform, PDF_DOC, fileOf());
  assert.deepEqual(result, { kind: 'failed' });
});

// ---- Identity of the delivered file ------------------------------------------

test('the stored name, bytes and MIME type reach both boundaries verbatim', async () => {
  const platform = platformStub({ view: 'unavailable', save: 'saved' });
  await openWalletDocumentWith(platform, PDF_DOC, fileOf());
  for (const call of platform.calls) {
    assert.equal(call.fileName, 'Ticket 12 Aug.pdf', 'the name the user attached');
    assert.equal(call.mimeType, 'application/pdf', 'the stored type, never octet-stream');
    assert.equal(call.blob, pdfBlob, 'the stored bytes, not a copy');
  }
});

// ---- Image routing ------------------------------------------------------------

test('an image never touches the viewer/save boundaries — the in-app sheet owns it', async () => {
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

test('a non-image, non-PDF type is delivered through the platform, not the image sheet', async () => {
  // The wallet model only admits images and PDFs today; if anything else ever
  // reaches storage, the image sheet (which cannot render it) must not be the
  // answer — the platform viewer/save path is.
  const doc = { id: 'doc-odd', title: 'Odd', fileName: 'odd.bin', mimeType: 'application/zip' };
  const platform = platformStub({ view: 'opened' });
  const result = await openWalletDocumentWith(platform, doc, async () => pdfBlob);
  assert.deepEqual(result, { kind: 'pdf-opened' });
  assert.equal(platform.calls[0].mimeType, 'application/zip');
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

test('an empty (zero-byte) stored PDF still flows to the platform, not a broken viewer', async () => {
  // Corrupt content is the VIEWER app's to diagnose; the opener's contract is
  // only "hand over exactly what is stored" — and a 0-byte blob is falsy-adjacent
  // bait for a `!blob` check, which must not swallow it.
  const empty = new Blob([], { type: 'application/pdf' });
  const platform = platformStub({ view: 'opened' });
  const result = await openWalletDocumentWith(platform, PDF_DOC, async () => empty);
  assert.deepEqual(result, { kind: 'pdf-opened' });
  assert.equal(platform.calls[0].blob, empty);
});

// ---- The platform boundaries themselves (source contracts) --------------------
// These are cross-platform claims about code node cannot execute (Capacitor,
// window.open), so they are stated as source contracts on the boundary files.

const opener = read('src/wallet/documentDelivery.mjs');
const binding = read('src/wallet/documentOpening.ts');
const fileView = read('src/runtime/fileView.ts');
const fileSave = read('src/runtime/fileSave.ts');
const tripView = read('src/components/TripView.tsx');
const quickAccess = read('src/components/MembershipQuickAccess.tsx');

test('the binding wires the real boundaries to the shared opener', () => {
  assert.match(binding, /openInViewer: openFileInPlatformViewer/);
  assert.match(binding, /saveFile: saveGeneratedFile/);
});

test('only the runtime boundaries branch on platform or talk to Capacitor', () => {
  assert.match(codeOf(fileView), /isNativeAndroid\(\)/);
  assert.match(codeOf(fileSave), /isNativeAndroid\(\)/);
  for (const [name, source] of [
    ['src/wallet/documentDelivery.mjs', opener],
    ['src/wallet/documentOpening.ts', binding],
    ['src/components/TripView.tsx', tripView],
    ['src/components/MembershipQuickAccess.tsx', quickAccess],
  ]) {
    assert.ok(
      !/isNativeAndroid|Capacitor|registerPlugin/.test(codeOf(source)),
      `${name} must not learn which platform it is on — that is src/runtime/'s job`,
    );
  }
});

test('window.open lives ONLY in the view boundary, guarded away from Android', () => {
  // THE regression this file exists to pin: on the Android WebView,
  // window.open(blobUrl) returns a real WindowProxy and shows nothing, so a
  // truthy window is NOT evidence the user saw the document. The only place
  // allowed to use window.open is the browser branch of fileView.ts.
  for (const [name, source] of [
    ['src/wallet/documentDelivery.mjs', opener],
    ['src/wallet/documentOpening.ts', binding],
    ['src/components/TripView.tsx', tripView],
    ['src/components/MembershipQuickAccess.tsx', quickAccess],
  ]) {
    assert.ok(!/window\.open\s*\(/.test(codeOf(source)), `${name} must not call window.open`);
  }
  const viewCode = codeOf(fileView);
  assert.match(viewCode, /window\.open\(url, '_blank'\)/, 'the browser branch still opens a tab');
  const guard = viewCode.indexOf('if (!isNativeAndroid())');
  const open = viewCode.indexOf('window.open');
  assert.ok(guard >= 0 && guard < open, 'window.open is reachable only OFF Android');
});

test('the native view path is chunked over the ViewFile bridge with a NO_VIEWER fallback', () => {
  assert.match(fileView, /registerPlugin<ViewFileBridge>\('ViewFile'\)/);
  assert.match(fileView, /streamBlobInChunks\(blob, \(data\) => ViewFile\.writeChunk\(\{ data \}\)\)/);
  assert.match(fileView, /'NO_VIEWER'/, 'a device with no viewer app is a state, not an error');
  assert.match(fileView, /return 'unavailable'/, 'every native failure degrades to the save fallback');
});

test('object URLs created for the browser viewer are revoked on both branches', () => {
  const viewCode = codeOf(fileView);
  const creates = (viewCode.match(/URL\.createObjectURL/g) ?? []).length;
  const revokes = (viewCode.match(/URL\.revokeObjectURL/g) ?? []).length;
  assert.equal(creates, 1);
  assert.equal(revokes, 2, 'delayed revoke when opened, immediate revoke when refused');
});

// ---- Every surface reports the outcome — no silent taps -----------------------

test('TripView tells the user what happened for every non-viewer outcome', () => {
  assert.match(tripView, /result\.kind === 'pdf-saved'/);
  assert.match(tripView, /result\.kind === 'pdf-save-cancelled'/);
  assert.match(tripView, /result\.kind === 'failed'/);
  assert.match(tripView, /Saving a copy was cancelled/);
  assert.match(tripView, /a copy was saved instead/);
  assert.match(tripView, /could not be opened or saved on this device/);
  assert.match(tripView, /missing from local storage/);
});

test('the Today quick access tells the user what happened — a tap never ends in silence', () => {
  assert.match(quickAccess, /result\.kind === 'pdf-saved'/);
  assert.match(quickAccess, /result\.kind === 'pdf-save-cancelled'/);
  assert.match(quickAccess, /result\.kind === 'failed'/);
  assert.match(quickAccess, /result\.kind === 'missing'/);
  assert.match(quickAccess, /no longer stored on this device/);
  assert.match(quickAccess, /role="status"/, 'outcome feedback is announced accessibly');
});

// ---- Local-first semantics are unchanged -------------------------------------

test('delivering a document stays entirely local and offline', () => {
  for (const [name, source] of [
    ['src/wallet/documentDelivery.mjs', opener],
    ['src/runtime/fileView.ts', fileView],
    ['src/components/TripView.tsx', tripView],
  ]) {
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(codeOf(source)),
      `${name} must not reach the network to hand the user their own file`);
  }
  // The bytes come from local storage and go straight to the platform.
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
