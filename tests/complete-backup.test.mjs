/**
 * Complete backup / restore v1 — the portable-package contract.
 *
 * What must hold, proven here deterministically:
 *  - a complete export contains the state envelope + BYTE-IDENTICAL wallet
 *    files (PDF and PNG fixtures compared before/after), with metadata and
 *    ids preserved so Travel/Stay `attachmentIds` still resolve;
 *  - unicode original filenames ride in metadata (entry names stay id-based);
 *  - a wallet record without its stored blob BLOCKS the export by name —
 *    never a silent partial "complete" backup;
 *  - every malformed/hostile container (corrupt zip, wrong app, wrong trail,
 *    newer format, missing/extra/duplicate attachments, wrong size, wrong
 *    hash, path traversal, invalid state) is rejected as a typed reason with
 *    ZERO mutation (staging is pure by construction, and the IDB legs prove
 *    the stored wallet is untouched);
 *  - restore is snapshot → atomic wallet replace → state apply, and a state
 *    apply failure ROLLS THE WALLET BACK to the snapshot;
 *  - the lightweight JSON export path is unchanged.
 *
 * IndexedDB legs run against fake-indexeddb (real transaction semantics),
 * mirroring tests/wallet-store.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IDBFactory } from 'fake-indexeddb';
import { strToU8, unzipSync, zipSync } from 'fflate';

import {
  BACKUP_FILE_EXTENSION,
  BACKUP_FORMAT_VERSION,
  DATA_ENTRY,
  MANIFEST_ENTRY,
  WALLET_INDEX_ENTRY,
  backupFileName,
  backupSummaryText,
  classifyEntryName,
  planWalletExport,
  preflightBackupFile,
  restoreRejectionText,
  validateManifest,
} from '../src/backup/completeBackup.mjs';
import {
  buildCompleteBackup,
  sha256Hex,
  stageCompleteBackup,
} from '../src/backup/completeBackupArchive.mjs';
import { applyCompleteRestore } from '../src/backup/completeBackupRestore.mjs';
import {
  SCHEMA_VERSION,
  defaultState,
  readState as readStateAgainst,
} from '../src/utils/stateMigration.mjs';
import {
  addWalletDocument,
  closeWalletDb,
  dumpWalletData,
  getWalletFile,
  listWalletDocuments,
  readWalletMeta,
  replaceWalletData,
} from '../src/wallet/walletStore.mjs';
import { WALLET_SCHEMA_VERSION } from '../src/wallet/walletModel.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The real Kungsleden topology, spelled out the same way
// tests/state-migration.test.mjs does (src/utils/storage.ts passes
// STAGE_TOPOLOGY from the TS data module, which node --test cannot load).
const STAGE_TOPOLOGY = [
  { id: 'd1', fromStopId: 'abisko', toStopId: 'abiskojaure' },
  { id: 'd2', fromStopId: 'abiskojaure', toStopId: 'alesjaure' },
  { id: 'd3', fromStopId: 'alesjaure', toStopId: 'tjaktja' },
  { id: 'd4', fromStopId: 'tjaktja', toStopId: 'salka' },
  { id: 'd5', fromStopId: 'salka', toStopId: 'singi' },
  { id: 'd6', fromStopId: 'singi', toStopId: 'kebnekaise' },
  { id: 'd7', fromStopId: 'kebnekaise', toStopId: 'nikkaluokta' },
];

const readStateFn = (raw) => readStateAgainst(raw, 'd1', STAGE_TOPOLOGY);

// ---- Fixtures ---------------------------------------------------------------

/** A tiny but structurally real PDF. */
const PDF_BYTES = strToU8(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
);

/** A real 1×1 PNG. */
const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

const PDF_DOC = {
  id: 'doc_pdf_1',
  title: 'Fjällräven booking',
  category: 'route-reference',
  pinned: false,
  createdAt: 10,
  updatedAt: 20,
  // Unicode original filename — must survive the package losslessly while
  // the ZIP entry name stays the id-derived ASCII path.
  fileName: 'Fjällräven–bokning ✈️.pdf',
  mimeType: 'application/pdf',
  sizeBytes: PDF_BYTES.byteLength,
  futureField: { kept: true },
};

const PNG_DOC = {
  id: 'doc_png_2',
  title: 'Hut voucher',
  category: 'other',
  pinned: true,
  createdAt: 11,
  updatedAt: 21,
  fileName: 'voucher.png',
  mimeType: 'image/png',
  sizeBytes: PNG_BYTES.byteLength,
};

/** A state whose Trip plan references the PDF document by id. */
function stateWithAttachment() {
  const state = defaultState('d1');
  state.trip = [
    {
      id: 'trip_1',
      kind: 'transport',
      title: 'Bus Nikkaluokta to Kiruna',
      status: 'booked',
      mode: 'bus',
      attachmentIds: [PDF_DOC.id],
      createdAt: 5,
      updatedAt: 5,
    },
  ];
  return state;
}

function exportEnvelope(state) {
  return { app: 'fjallkompis', schemaVersion: SCHEMA_VERSION, exportedAt: '2026-08-08T12:00:00.000Z', state };
}

async function buildFixtureBackup(overrides = {}) {
  return buildCompleteBackup({
    exportEnvelope: exportEnvelope(stateWithAttachment()),
    documents: [PDF_DOC, PNG_DOC],
    fileBytesById: new Map([
      [PDF_DOC.id, PDF_BYTES],
      [PNG_DOC.id, PNG_BYTES],
    ]),
    appVersion: '0.27.0',
    exportedAt: '2026-08-08T12:00:00.000Z',
    ...overrides,
  });
}

/** Unpack → mutate → repack, for tamper tests. */
function tamper(bytes, mutate) {
  const files = unzipSync(bytes);
  const entries = mutate(files) ?? files;
  const zipInput = {};
  for (const [name, data] of Object.entries(entries)) zipInput[name] = data;
  return zipSync(zipInput);
}

function editJsonEntry(files, entry, edit) {
  const value = JSON.parse(new TextDecoder().decode(files[entry]));
  edit(value);
  files[entry] = strToU8(JSON.stringify(value));
  return files;
}

// ---- Pure contract ----------------------------------------------------------

test('entry classification refuses traversal, absolute paths and strangers', () => {
  assert.equal(classifyEntryName('manifest.json'), 'manifest');
  assert.equal(classifyEntryName('wallet/files/doc_a.pdf'), 'wallet-file');
  assert.equal(classifyEntryName('wallet/files/../../etc/passwd'), 'unsafe');
  assert.equal(classifyEntryName('../manifest.json'), 'unsafe');
  assert.equal(classifyEntryName('/etc/passwd'), 'unsafe');
  assert.equal(classifyEntryName('wallet\\files\\doc.pdf'), 'unsafe');
  assert.equal(classifyEntryName('wallet/files/doc_a.exe'), 'unexpected');
  assert.equal(classifyEntryName('extra.txt'), 'unexpected');
  assert.equal(classifyEntryName('wallet/files/nested/doc.pdf'), 'unexpected');
});

test('a document without its stored file blocks the export, by name', () => {
  const plan = planWalletExport(
    [{ ...PDF_DOC, fileMissing: true }, PNG_DOC],
    new Map([
      [PDF_DOC.id, null],
      [PNG_DOC.id, { sizeBytes: PNG_BYTES.byteLength }],
    ]),
  );
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'file-missing');
  assert.deepEqual(plan.documents, [{ id: PDF_DOC.id, title: PDF_DOC.title }]);

  // The archive layer refuses identically — no silent partial backup.
  return buildFixtureBackup({
    documents: [{ ...PDF_DOC, fileMissing: true }, PNG_DOC],
  }).then((result) => {
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'file-missing');
  });
});

test('an id that cannot name a ZIP entry blocks the export', async () => {
  const evil = { ...PDF_DOC, id: 'doc/../../x' };
  const result = await buildCompleteBackup({
    exportEnvelope: exportEnvelope(defaultState('d1')),
    documents: [evil],
    fileBytesById: new Map([[evil.id, PDF_BYTES]]),
    appVersion: '0.27.0',
    exportedAt: '2026-08-08T12:00:00.000Z',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsafe-id');
});

test('manifest validation separates the four rejection stories', () => {
  assert.equal(validateManifest(null).reason, 'not-a-backup');
  assert.equal(validateManifest({ format: 'zip', app: 'winzip' }).reason, 'not-a-backup');
  const good = {
    format: 'fjallkompis-complete-backup',
    app: 'fjallkompis',
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    trailId: 'kungsleden-abisko-nikkaluokta',
  };
  assert.equal(validateManifest(good).ok, true);
  assert.equal(
    validateManifest({ ...good, backupFormatVersion: BACKUP_FORMAT_VERSION + 1 }).reason,
    'newer-version',
  );
  assert.equal(validateManifest({ ...good, trailId: 'delft-pilot' }).reason, 'trail-mismatch');
  // Every rejection has a user sentence, and the newer-version one says the
  // only actionable thing: update the app.
  assert.match(restoreRejectionText('newer-version'), /newer version .* Update the app/i);
  assert.match(restoreRejectionText({ reason: 'trail-mismatch' }), /different trail/);
});

test('filename and summary shapes', () => {
  assert.equal(backupFileName('2026-08-08'), 'fjallkompis-backup-2026-08-08.fjallkompis');
  assert.ok(backupFileName('2026-08-08').endsWith(BACKUP_FILE_EXTENSION));
  assert.equal(backupSummaryText(6, '12.4 MB'), 'Trip data · 6 Wallet documents · 12.4 MB');
  assert.equal(backupSummaryText(1, '2.0 MB'), 'Trip data · 1 Wallet document · 2.0 MB');
  assert.equal(backupSummaryText(0, '0 kB'), 'Trip data · no Wallet documents');
});

// ---- Round trip -------------------------------------------------------------

test('a complete backup round-trips: state, metadata, ids and exact bytes', async () => {
  const built = await buildFixtureBackup();
  assert.equal(built.ok, true);
  assert.equal(built.manifest.backupFormatVersion, 1);
  assert.equal(built.manifest.trailId, 'kungsleden-abisko-nikkaluokta');
  assert.equal(built.manifest.stateSchemaVersion, SCHEMA_VERSION);
  assert.equal(built.manifest.walletSchemaVersion, WALLET_SCHEMA_VERSION);
  assert.equal(built.manifest.counts.walletDocuments, 2);

  // data.json IS the lightweight export envelope, byte-for-byte as JSON.
  const entries = unzipSync(built.bytes);
  const data = JSON.parse(new TextDecoder().decode(entries[DATA_ENTRY]));
  assert.deepEqual(data, exportEnvelope(stateWithAttachment()));

  const staged = await stageCompleteBackup(built.bytes, readStateFn);
  assert.equal(staged.ok, true);

  // Both file types byte-identical after the round trip.
  assert.deepEqual([...staged.walletFiles.get(PDF_DOC.id).bytes], [...PDF_BYTES]);
  assert.deepEqual([...staged.walletFiles.get(PNG_DOC.id).bytes], [...PNG_BYTES]);

  // Ids, unicode filename and unknown future fields survive.
  const pdfDoc = staged.walletDocuments.find((d) => d.id === PDF_DOC.id);
  assert.equal(pdfDoc.fileName, 'Fjällräven–bokning ✈️.pdf');
  assert.deepEqual(pdfDoc.futureField, { kept: true });

  // The Trip item's attachment reference still resolves against the staged
  // wallet — the link that restore must keep intact.
  const item = staged.state.trip.find((i) => i.id === 'trip_1');
  assert.ok(item, 'the trip item survived the state round trip');
  const walletIds = new Set(staged.walletDocuments.map((d) => d.id));
  for (const id of item.attachmentIds) {
    assert.ok(walletIds.has(id), `attachment ${id} resolves after restore`);
  }
});

test('attachments are STORED, not deflated — and JSON entries are compressed', async () => {
  const built = await buildFixtureBackup();
  // Read the local-file headers: compression method 0 (stored) for wallet
  // files, 8 (deflate) for manifest/data/index. Method sits at offset 8 of
  // each local header; entries are located by scanning signatures.
  const bytes = built.bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const methods = new Map();
  for (let i = 0; i + 30 <= bytes.length; ) {
    if (view.getUint32(i, true) !== 0x04034b50) break;
    const method = view.getUint16(i + 8, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const compLen = view.getUint32(i + 18, true);
    const name = new TextDecoder().decode(bytes.subarray(i + 30, i + 30 + nameLen));
    methods.set(name, method);
    i += 30 + nameLen + extraLen + compLen;
  }
  assert.equal(methods.get('wallet/files/doc_pdf_1.pdf'), 0, 'pdf stored');
  assert.equal(methods.get('wallet/files/doc_png_2.png'), 0, 'png stored');
  assert.equal(methods.get(MANIFEST_ENTRY), 8, 'manifest deflated');
  assert.equal(methods.get(DATA_ENTRY), 8, 'data deflated');
});

// ---- Rejections (staging is pure — nothing stored is ever touched) ----------

test('corrupt bytes are rejected as unreadable', async () => {
  const staged = await stageCompleteBackup(strToU8('this is not a zip at all'), readStateFn);
  assert.equal(staged.ok, false);
  assert.equal(staged.reason, 'unreadable-archive');
});

test('a zip from some other app is not a backup', async () => {
  const alien = zipSync({ 'readme.txt': strToU8('hello') });
  const staged = await stageCompleteBackup(alien, readStateFn);
  assert.equal(staged.ok, false);
  // 'stranger entry' and 'no manifest' both resolve to not-a-backup.
  assert.equal(staged.reason, 'not-a-backup');
});

test('wrong app identity, wrong trail and newer format all reject typed', async () => {
  const built = await buildFixtureBackup();
  for (const [edit, reason] of [
    [(m) => (m.app = 'someone-else'), 'not-a-backup'],
    [(m) => (m.trailId = 'delft-pilot'), 'trail-mismatch'],
    [(m) => (m.backupFormatVersion = 99), 'newer-version'],
  ]) {
    const tampered = tamper(built.bytes, (files) => editJsonEntry(files, MANIFEST_ENTRY, edit));
    const staged = await stageCompleteBackup(tampered, readStateFn);
    assert.equal(staged.ok, false);
    assert.equal(staged.reason, reason);
  }
});

test('state that fails the migration read path rejects as state-invalid', async () => {
  const built = await buildFixtureBackup();
  const tampered = tamper(built.bytes, (files) =>
    editJsonEntry(files, DATA_ENTRY, (envelope) => {
      envelope.state.trailId = 'delft-pilot';
    }),
  );
  const staged = await stageCompleteBackup(tampered, readStateFn);
  assert.equal(staged.ok, false);
  assert.equal(staged.reason, 'state-invalid');
});

test('missing, extra and duplicate attachment entries reject', async () => {
  const built = await buildFixtureBackup();

  const missing = tamper(built.bytes, (files) => {
    delete files['wallet/files/doc_png_2.png'];
    return files;
  });
  assert.equal((await stageCompleteBackup(missing, readStateFn)).reason, 'missing-attachment');

  const extra = tamper(built.bytes, (files) => {
    files['wallet/files/doc_extra.pdf'] = PDF_BYTES;
    return files;
  });
  assert.equal((await stageCompleteBackup(extra, readStateFn)).reason, 'undeclared-attachment');

  const duplicate = tamper(built.bytes, (files) =>
    editJsonEntry(files, WALLET_INDEX_ENTRY, (index) => {
      index.documents.push(index.documents[0]);
    }),
  );
  assert.equal((await stageCompleteBackup(duplicate, readStateFn)).reason, 'duplicate-id');
});

test('wrong declared size and wrong bytes reject before anything applies', async () => {
  const built = await buildFixtureBackup();

  const wrongSize = tamper(built.bytes, (files) =>
    editJsonEntry(files, WALLET_INDEX_ENTRY, (index) => {
      index.documents[0].file.sizeBytes += 1;
    }),
  );
  assert.equal(
    (await stageCompleteBackup(wrongSize, readStateFn)).reason,
    'attachment-size-mismatch',
  );

  const flipped = new Uint8Array(PDF_BYTES);
  flipped[0] ^= 0xff; // same length, different bytes
  const wrongHash = tamper(built.bytes, (files) => {
    files['wallet/files/doc_pdf_1.pdf'] = [flipped, { level: 0 }];
    return files;
  });
  assert.equal(
    (await stageCompleteBackup(wrongHash, readStateFn)).reason,
    'attachment-hash-mismatch',
  );
});

test('path-traversal entries reject the whole archive', async () => {
  const built = await buildFixtureBackup();
  const hostile = tamper(built.bytes, (files) => {
    files['wallet/files/../../evil.pdf'] = PDF_BYTES;
    return files;
  });
  const staged = await stageCompleteBackup(hostile, readStateFn);
  assert.equal(staged.ok, false);
  assert.equal(staged.reason, 'unsafe-entry');
});

// ---- Restore orchestration (fake-indexeddb — real transaction semantics) ----

async function freshDb() {
  await closeWalletDb();
  globalThis.indexedDB = new IDBFactory();
}

const CURRENT_DOC = {
  id: 'doc_current',
  title: 'Old ticket',
  category: 'other',
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
  fileName: 'old.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 3,
};

/** The real browser effects, minus React: exactly what SettingsScreen wires. */
function realEffects(applyState) {
  return {
    snapshotWallet: dumpWalletData,
    replaceWallet: replaceWalletData,
    applyState,
    toStoredFiles: (candidateFiles) =>
      new Map(
        [...candidateFiles].map(([id, f]) => [id, new Blob([f.bytes], { type: f.mimeType })]),
      ),
  };
}

test('restore replaces the wallet atomically and applies state last', async () => {
  await freshDb();
  await addWalletDocument(CURRENT_DOC, new Blob(['old'], { type: 'application/pdf' }));

  const built = await buildFixtureBackup();
  const staged = await stageCompleteBackup(built.bytes, readStateFn);
  assert.equal(staged.ok, true);

  let appliedState = null;
  const result = await applyCompleteRestore(staged, realEffects((s) => (appliedState = s)));
  assert.deepEqual(result, { ok: true, restoredDocuments: 2 });
  assert.equal(appliedState.trip[0].attachmentIds[0], PDF_DOC.id);

  const docs = await listWalletDocuments();
  assert.deepEqual(docs.map((d) => d.id).sort(), [PDF_DOC.id, PNG_DOC.id]);
  assert.ok(docs.every((d) => d.fileMissing !== true), 'every restored document has its file');
  const meta = await readWalletMeta();
  assert.equal(meta.schemaVersion, WALLET_SCHEMA_VERSION);

  // Byte-identical storage: what the backup carried is what the device holds.
  const restoredPdf = await getWalletFile(PDF_DOC.id);
  assert.deepEqual(new Uint8Array(await restoredPdf.arrayBuffer()), PDF_BYTES);
  const restoredPng = await getWalletFile(PNG_DOC.id);
  assert.deepEqual(new Uint8Array(await restoredPng.arrayBuffer()), PNG_BYTES);
});

test('a failing state apply rolls the wallet back to the snapshot', async () => {
  await freshDb();
  await addWalletDocument(CURRENT_DOC, new Blob(['old'], { type: 'application/pdf' }));

  const built = await buildFixtureBackup();
  const staged = await stageCompleteBackup(built.bytes, readStateFn);

  const result = await applyCompleteRestore(
    staged,
    realEffects(() => {
      throw new Error('quota exceeded');
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'state-write-failed');
  assert.equal(result.rolledBack, true);

  // The device is exactly as before the attempt.
  const docs = await listWalletDocuments();
  assert.deepEqual(docs.map((d) => d.id), [CURRENT_DOC.id]);
  const blob = await getWalletFile(CURRENT_DOC.id);
  assert.equal(await blob.text(), 'old');
});

test('a failing wallet write changes nothing and never touches state', async () => {
  await freshDb();
  await addWalletDocument(CURRENT_DOC, new Blob(['old'], { type: 'application/pdf' }));

  const built = await buildFixtureBackup();
  const staged = await stageCompleteBackup(built.bytes, readStateFn);

  let stateTouched = false;
  const result = await applyCompleteRestore(staged, {
    ...realEffects(() => (stateTouched = true)),
    replaceWallet: async () => {
      throw new Error('disk full');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'wallet-write-failed');
  assert.equal(stateTouched, false);
  assert.deepEqual((await listWalletDocuments()).map((d) => d.id), [CURRENT_DOC.id]);
});

test('replaceWalletData is atomic: a mid-fill failure keeps previous contents', async () => {
  await freshDb();
  await addWalletDocument(CURRENT_DOC, new Blob(['old'], { type: 'application/pdf' }));

  // The second document has no file entry at all — the transaction must
  // abort as a whole, leaving the pre-existing wallet untouched.
  await assert.rejects(() =>
    replaceWalletData(
      [PDF_DOC, PNG_DOC],
      new Map([[PDF_DOC.id, new Blob([PDF_BYTES], { type: 'application/pdf' })]]),
    ),
  );
  const docs = await listWalletDocuments();
  assert.deepEqual(docs.map((d) => d.id), [CURRENT_DOC.id]);
  assert.equal(await (await getWalletFile(CURRENT_DOC.id)).text(), 'old');
});

test('a rollback snapshot reproduces a fileMissing document faithfully', async () => {
  await freshDb();
  await addWalletDocument(CURRENT_DOC, new Blob(['old'], { type: 'application/pdf' }));
  // Simulate storage eviction: the blob row disappears out-of-band.
  const { documents, files } = await dumpWalletData();
  files.delete(CURRENT_DOC.id);
  await replaceWalletData(documents, new Map([[CURRENT_DOC.id, null]]));

  const dump = await dumpWalletData();
  assert.equal(dump.documents[0].fileMissing, true);
  assert.equal(dump.files.get(CURRENT_DOC.id), null);

  // Round-trip the snapshot: metadata-only survives, still honestly flagged.
  await replaceWalletData(dump.documents, dump.files);
  const after = await listWalletDocuments();
  assert.equal(after[0].fileMissing, true);
});

test('an export dump refuses to feed a complete backup when a file is missing', async () => {
  await freshDb();
  await addWalletDocument(CURRENT_DOC, new Blob(['old'], { type: 'application/pdf' }));
  const { documents, files } = await dumpWalletData();
  await replaceWalletData(documents, new Map([[CURRENT_DOC.id, null]]));

  const dump = await dumpWalletData();
  const fileBytesById = new Map(
    await Promise.all(
      [...dump.files].map(async ([id, blob]) => [
        id,
        blob ? new Uint8Array(await blob.arrayBuffer()) : null,
      ]),
    ),
  );
  const result = await buildCompleteBackup({
    exportEnvelope: exportEnvelope(defaultState('d1')),
    documents: dump.documents,
    fileBytesById,
    appVersion: '0.27.0',
    exportedAt: '2026-08-08T12:00:00.000Z',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'file-missing');
  assert.deepEqual(result.documents, [{ id: CURRENT_DOC.id, title: CURRENT_DOC.title }]);
});

// ---- The lightweight JSON export: same bytes, platform-safe delivery --------

test('the JSON export contract is unchanged and no longer browser-only', () => {
  const exportImport = readFileSync(join(root, 'src/utils/exportImport.ts'), 'utf8');
  assert.match(exportImport, /app: 'fjallkompis',\s*\n\s*schemaVersion: SCHEMA_VERSION/);
  assert.match(exportImport, /export function parseImport/);
  assert.ok(!/fflate|zip/i.test(exportImport), 'the JSON path gained no archive machinery');

  const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
  // Same envelope, same 2-space stringify downloadJson always produced…
  assert.match(settings, /JSON\.stringify\(buildExport\(state\), null, 2\)/);
  // …delivered through the platform save boundary with the right name and
  // MIME type, so the Android wrapper gets the system picker instead of the
  // WebView's silent blob-URL no-op. No direct browser-only download call
  // remains in Settings.
  assert.match(
    settings,
    /saveGeneratedFile\(\s*`fjallkompis-backup-\$\{todayIso\(\)\}\.json`,[\s\S]{0,120}'application\/json',\s*\)/,
  );
  assert.ok(!/downloadJson\(/.test(settings), 'Settings no longer calls the blob-URL-only helper');
  assert.match(settings, /accept="application\/json,\.json"/);
  // The restore picker accepts both name shapes SAF can produce — the
  // .fjallkompis file as named, and the .zip-suffixed variant Android's
  // save picker creates for the declared application/zip type.
  assert.match(
    settings,
    /accept="\.fjallkompis,\.zip,application\/zip,application\/octet-stream"/,
  );

  // The save boundary itself: browser branch keeps the normal download,
  // native branch is the SAF bridge — one adapter for ANY generated file.
  const fileSave = readFileSync(join(root, 'src/runtime/fileSave.ts'), 'utf8');
  assert.match(fileSave, /export async function saveGeneratedFile/);
  assert.match(fileSave, /if \(!isNativeAndroid\(\)\) \{\s*\n\s*downloadBlobFile\(fileName, blob\)/);
  assert.match(fileSave, /registerPlugin<SaveFileBridge>\('SaveFile'\)/);
  assert.match(fileSave, /USER_CANCELLED/, 'a dismissed picker stays a non-error outcome');
});

test('no generated-file export bypasses the platform save boundary', () => {
  // Every surface that hands the user a file the APP generated. A direct
  // downloadJson/downloadTextFile/downloadBlobFile call here is a silent
  // no-op in the Android wrapper (the WebView ignores blob-URL anchors), so
  // the boundary is the only permitted route. src/runtime/fileSave.ts is
  // deliberately absent: it IS the boundary, and owns the browser branch.
  //
  // Stored-document delivery (opening/saving a Wallet PDF the user attached
  // — src/wallet/documentOpening.ts, TripView's exportDocument) is a
  // DIFFERENT class and deliberately not covered: those hand back bytes the
  // user supplied, and choosing between a save picker and a share sheet is
  // its own decision. They are tracked separately, not silently swept in.
  const GENERATED_FILE_SURFACES = [
    'src/screens/SettingsScreen.tsx',
    'src/components/DayPlanCard.tsx',
  ];
  for (const surface of GENERATED_FILE_SURFACES) {
    const source = readFileSync(join(root, surface), 'utf8');
    // Comments may name the old helper (they explain the migration); calls
    // may not exist, and neither may an import of it.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const helper of ['downloadJson', 'downloadTextFile', 'downloadBlobFile']) {
      assert.ok(
        !new RegExp(`\\b${helper}\\s*\\(`).test(code),
        `${surface} calls ${helper} directly — it must use saveGeneratedFile`,
      );
      assert.ok(
        !new RegExp(`import[^;]*\\b${helper}\\b[^;]*;`).test(code),
        `${surface} imports ${helper} — it must use saveGeneratedFile`,
      );
    }
    assert.match(
      code,
      /saveGeneratedFile\(/,
      `${surface} produces a file, so it must go through the save boundary`,
    );
  }

  // The Day plan recovery export specifically: same filename and payload it
  // has always written, now via the boundary — and a failure is SHOWN,
  // because the button beside it deletes the very data being saved.
  const card = readFileSync(join(root, 'src/components/DayPlanCard.tsx'), 'utf8');
  assert.match(card, /'fjallkompis-day-plan-recovery\.json'/);
  assert.match(card, /kind: 'day-plan-recovery'/);
  assert.match(card, /JSON\.stringify\(payload, null, 2\)/);
  assert.match(card, /'application\/json'/);
  assert.match(card, /setSaveFailed\(true\)/, 'a failed save is surfaced, never silent');
});

// ---- Container preflight (before any bytes are read) ------------------------

test('an oversized selected file is refused from its size alone', async () => {
  const { MAX_BACKUP_FILE_BYTES } = await import('../src/backup/completeBackup.mjs');
  assert.deepEqual(preflightBackupFile(MAX_BACKUP_FILE_BYTES), { ok: true });
  assert.deepEqual(preflightBackupFile(MAX_BACKUP_FILE_BYTES + 1), {
    ok: false,
    reason: 'limits-exceeded',
  });
  assert.deepEqual(preflightBackupFile(Number.NaN), { ok: false, reason: 'unreadable-archive' });
  assert.deepEqual(preflightBackupFile(-1), { ok: false, reason: 'unreadable-archive' });

  // The archive layer re-applies the preflight defensively: a fake "bytes"
  // object whose byteLength busts the cap is rejected before ANY read or
  // unzip work — no property of it other than byteLength is ever touched.
  const untouched = new Proxy(
    { byteLength: MAX_BACKUP_FILE_BYTES + 1 },
    {
      get(target, prop) {
        if (prop !== 'byteLength') throw new Error(`unexpected read of ${String(prop)}`);
        return target.byteLength;
      },
    },
  );
  const staged = await stageCompleteBackup(untouched, readStateFn);
  assert.deepEqual(staged, { ok: false, reason: 'limits-exceeded' });

  // And the UI runs the same preflight BEFORE arrayBuffer() — source order.
  const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
  const handler = settings.slice(
    settings.indexOf('const onBackupFile'),
    settings.indexOf('const doCompleteRestore'),
  );
  const preflightAt = handler.indexOf('preflightBackupFile(file.size)');
  const readAt = handler.indexOf('file.arrayBuffer()');
  assert.ok(preflightAt > 0 && readAt > 0, 'both steps exist in the restore handler');
  assert.ok(preflightAt < readAt, 'the size preflight precedes reading the file into memory');
});

// ---- Integrity helper -------------------------------------------------------

test('sha256Hex matches a known vector', async () => {
  assert.equal(
    await sha256Hex(strToU8('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
