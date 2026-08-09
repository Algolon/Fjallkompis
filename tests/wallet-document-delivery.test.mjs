/**
 * Trail Wallet — delivering ONE stored document, on both platforms.
 *
 * Complete backup/restore already carries documents across platforms; this is
 * the other half, and it was the last user-visible capability difference
 * between the PWA and the Android wrapper.
 *
 * WHAT WAS WRONG. Both single-document paths used `downloadBlobFile` — an
 * `<a download>` on a blob: URL. The Android WebView ignores those entirely
 * (SaveFilePlugin.java records the emulator-verified no-op), so in the wrapper:
 *
 *   - "Download a copy" in the document editor did NOTHING, with no error;
 *   - opening a stored PDF found no window (blob: yields none in the WebView),
 *     fell back to the same dead path, and then told the user a copy had been
 *     downloaded — a claim that was false on that platform.
 *
 * Both now go through src/runtime/fileSave.ts, the boundary every generated
 * export already used: a browser download in the browser, the system
 * ACTION_CREATE_DOCUMENT picker in the wrapper. No new mechanism was added.
 *
 * These contracts are cross-platform: they hold for the PWA and the wrapper
 * because they are about the BOUNDARY being used at all, not about either
 * platform's own behaviour.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { walletDownloadFileName } from '../src/wallet/walletModel.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const opener = read('src/wallet/documentOpening.ts');
const tripView = read('src/components/TripView.tsx');
const fileSave = read('src/runtime/fileSave.ts');

/** Strip comments: prose explaining the retired path must not satisfy a check. */
const codeOf = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// --- The boundary is used, and the dead path is gone -------------------------

test('both single-document delivery paths go through the save boundary', () => {
  for (const [name, source] of [
    ['src/wallet/documentOpening.ts', opener],
    ['src/components/TripView.tsx', tripView],
  ]) {
    const code = codeOf(source);
    assert.match(code, /saveGeneratedFile\(/, `${name} delivers through the boundary`);
    assert.ok(
      !/\bdownloadBlobFile\s*\(/.test(code),
      `${name} must not call downloadBlobFile — the Android WebView ignores blob-URL anchors`,
    );
    assert.ok(
      !/import[^;]*\bdownloadBlobFile\b[^;]*;/.test(code),
      `${name} must not even import downloadBlobFile`,
    );
  }
});

test('the boundary itself is the only place that branches on platform', () => {
  // One adapter, not a second one grown inside the Wallet.
  assert.match(fileSave, /if \(!isNativeAndroid\(\)\) \{\s*\n\s*downloadBlobFile\(fileName, blob\)/);
  for (const [name, source] of [
    ['src/wallet/documentOpening.ts', opener],
    ['src/components/TripView.tsx', tripView],
  ]) {
    assert.ok(
      !/isNativeAndroid|Capacitor|registerPlugin/.test(codeOf(source)),
      `${name} must not learn which platform it is on — that is fileSave.ts's job`,
    );
  }
});

// --- Identity of the delivered file ------------------------------------------

test('the stored MIME type is preserved through delivery', () => {
  // The picker decides the handler (and whether Android appends its own
  // extension) from this value; a hard-coded type would mislabel every file.
  // The filename argument itself contains a call, so the match must span
  // nested parentheses rather than stopping at the first ')'.
  const CALL = /saveGeneratedFile\(\s*walletDownloadFileName\(doc\),\s*blob,\s*doc\.mimeType,?\s*\)/;
  assert.match(opener, CALL, 'the opener passes the stored name and type');
  assert.match(tripView, CALL, 'the export passes the stored name and type');
  assert.ok(
    !/application\/octet-stream/.test(codeOf(opener) + codeOf(tripView)),
    'no delivery path flattens the type to octet-stream',
  );
});

test('the delivered filename keeps the name the user attached', () => {
  // The attached name is what they will recognise — preserved verbatim.
  assert.equal(
    walletDownloadFileName({ fileName: 'Ticket 12 Aug.pdf', title: 'Train', mimeType: 'application/pdf' }),
    'Ticket 12 Aug.pdf',
  );
  // Whitespace-only is not a name.
  assert.equal(
    walletDownloadFileName({ fileName: '   ', title: 'Insurance', mimeType: 'application/pdf' }),
    'Insurance.pdf',
  );
});

test('a document with no stored filename still gets the right extension', () => {
  // An extensionless "Insurance" saves as something neither Android nor a
  // desktop browser knows how to open.
  assert.equal(
    walletDownloadFileName({ title: 'Insurance', mimeType: 'application/pdf' }),
    'Insurance.pdf',
  );
  assert.equal(walletDownloadFileName({ title: 'Card', mimeType: 'image/jpeg' }), 'Card.jpg');
  assert.equal(walletDownloadFileName({ title: 'Card', mimeType: 'image/png' }), 'Card.png');
  assert.equal(walletDownloadFileName({ title: 'Card', mimeType: 'image/webp' }), 'Card.webp');

  // Never doubled when the title already carries the suffix.
  assert.equal(
    walletDownloadFileName({ title: 'Insurance.pdf', mimeType: 'application/pdf' }),
    'Insurance.pdf',
  );
  assert.equal(
    walletDownloadFileName({ title: 'Insurance.PDF', mimeType: 'application/pdf' }),
    'Insurance.PDF',
  );

  // Degenerate input still yields a usable name rather than throwing.
  assert.equal(walletDownloadFileName({ mimeType: 'application/pdf' }), 'document.pdf');
  assert.equal(walletDownloadFileName({}), 'document');
  assert.equal(walletDownloadFileName(undefined), 'document');
});

// --- Honest outcomes ----------------------------------------------------------

test('the opener reports what actually happened, and never claims a download', () => {
  // The retired result kind asserted a download that did not occur in the
  // wrapper. Its replacement distinguishes saved from cancelled.
  assert.ok(!/pdf-downloaded/.test(codeOf(opener)), "the false 'pdf-downloaded' outcome is gone");
  assert.match(opener, /kind: 'pdf-saved'/);
  assert.match(opener, /kind: 'pdf-save-cancelled'/);
  assert.match(opener, /outcome === 'saved' \? \{ kind: 'pdf-saved' \} : \{ kind: 'pdf-save-cancelled' \}/);
  // Opening in a viewer is still attempted FIRST — saving is the fallback.
  assert.ok(
    opener.indexOf('window.open') < opener.indexOf('saveGeneratedFile('),
    'the platform viewer is tried before falling back to saving',
  );
});

test('a cancelled picker is not reported as a saved copy', () => {
  // Dismissing the system picker is a normal outcome. Saying "saved" there
  // would be the same class of lie the old path told.
  assert.ok(!/pdf-downloaded/.test(codeOf(tripView)));
  assert.match(tripView, /result\.kind === 'pdf-saved'/);
  assert.match(tripView, /result\.kind === 'pdf-save-cancelled'/);
  assert.match(tripView, /Saving a copy was cancelled/);
  assert.match(tripView, /a copy was saved instead/);

  // The export action only announces success on 'saved'.
  const exportFn = tripView.match(/const exportDocument = async[\s\S]*?\n  \};/)?.[0];
  assert.ok(exportFn, 'the export handler exists');
  assert.match(exportFn, /if \(outcome === 'saved'\) setNotice\(/, 'success is announced only when saved');
  assert.match(exportFn, /could not be saved on this device/, 'a real failure is shown, not swallowed');
  assert.match(exportFn, /missing from local storage/, 'a missing blob is still reported honestly');
});

// --- Local-first semantics are unchanged -------------------------------------

test('delivering a document stays entirely local and offline', () => {
  for (const [name, source] of [
    ['src/wallet/documentOpening.ts', opener],
    ['src/components/TripView.tsx', tripView],
  ]) {
    const code = codeOf(source);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(code),
      `${name} must not reach the network to hand the user their own file`);
  }
  // The bytes come from local storage and go straight to the platform.
  assert.match(tripView, /await wallet\.getFile\(doc\.id\)/);
  assert.match(opener, /await getFile\(doc\.id\)/);
});
