/**
 * Trail Wallet IndexedDB adapter (src/wallet/walletStore.mjs) driven against
 * fake-indexeddb — REAL IndexedDB semantics (transactions, structured clone,
 * abort behaviour), not an in-memory mock that bypasses them.
 *
 * Each test gets a pristine IDBFactory; closeWalletDb() between opens
 * simulates an app restart, so "documents load after reload / offline"
 * is the literal code path the app runs (IndexedDB is local by
 * construction — no network is involved anywhere in the wallet modules).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  WALLET_DB_NAME,
  WALLET_DB_VERSION,
  addWalletDocument,
  clearWalletData,
  closeWalletDb,
  deleteWalletDocument,
  getWalletFile,
  listWalletDocuments,
  readWalletMeta,
  updateWalletDocument,
  walletStorageSupported,
} from '../src/wallet/walletStore.mjs';
import { WALLET_META_ID, WALLET_SCHEMA_VERSION } from '../src/wallet/walletModel.mjs';

/** Fresh factory per test — no cross-test state, like a brand-new browser profile. */
async function freshDb() {
  await closeWalletDb();
  globalThis.indexedDB = new IDBFactory();
}

const DOC = {
  id: 'doc_a',
  title: 'Bus ticket',
  category: 'transport',
  date: '2026-07-24',
  pinned: false,
  createdAt: 10,
  updatedAt: 10,
  fileName: 'bus-ticket.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 4,
};

const blobOf = (text) => new Blob([text], { type: 'application/pdf' });

/** Raw escape hatch for corrupting/inspecting the database around the adapter. */
function rawStore(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const open = globalThis.indexedDB.open(WALLET_DB_NAME, WALLET_DB_VERSION);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(storeName, mode);
      const result = fn(tx.objectStore(storeName));
      tx.oncomplete = () => {
        db.close();
        resolve(result?.result !== undefined ? result.result : undefined);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

test('storage support probe reflects the environment', async () => {
  await freshDb();
  assert.equal(walletStorageSupported(), true);
  const saved = globalThis.indexedDB;
  // eslint-disable-next-line no-global-assign
  delete globalThis.indexedDB;
  assert.equal(walletStorageSupported(), false);
  globalThis.indexedDB = saved;
});

test('first use creates the database with both stores and the schema meta record', async () => {
  await freshDb();
  assert.deepEqual(await listWalletDocuments(), [], 'an empty wallet lists as empty');
  const meta = await readWalletMeta();
  assert.deepEqual(meta, { id: WALLET_META_ID, schemaVersion: WALLET_SCHEMA_VERSION });
});

test('add → list → get round trip, and the meta record never lists as a document', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('PDFBYTES'));
  const docs = await listWalletDocuments();
  assert.equal(docs.length, 1);
  assert.deepEqual(docs[0], DOC);
  const blob = await getWalletFile('doc_a');
  assert.ok(blob instanceof Blob);
  assert.equal(await blob.text(), 'PDFBYTES');
});

test('documents survive a restart — the offline reload path', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('KEEP'));
  await closeWalletDb(); // app closed; same origin storage remains
  const docs = await listWalletDocuments(); // fresh connection, no network anywhere
  assert.equal(docs.length, 1);
  assert.equal(await (await getWalletFile('doc_a')).text(), 'KEEP');
});

test('rename/metadata edits leave the stored file untouched', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('ORIGINAL'));
  await updateWalletDocument({ ...DOC, title: 'Bus ticket (return)', updatedAt: 20 });
  const [doc] = await listWalletDocuments();
  assert.equal(doc.title, 'Bus ticket (return)');
  assert.equal(doc.updatedAt, 20);
  assert.equal(await (await getWalletFile('doc_a')).text(), 'ORIGINAL');
});

test('replacing a file swaps blob + file metadata atomically, leaving no orphan row', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('OLD'));
  await updateWalletDocument(
    { ...DOC, fileName: 'bus-ticket-v2.png', mimeType: 'image/png', sizeBytes: 3, updatedAt: 30 },
    blobOf('NEW'),
  );
  const [doc] = await listWalletDocuments();
  assert.equal(doc.fileName, 'bus-ticket-v2.png');
  assert.equal(doc.mimeType, 'image/png');
  assert.equal(doc.sizeBytes, 3);
  assert.equal(await (await getWalletFile('doc_a')).text(), 'NEW');
  const fileCount = await rawStore('files', 'readonly', (s) => s.count());
  assert.equal(fileCount, 1, 'the old blob row was overwritten in place — no orphan');
});

test('delete removes metadata and blob in one transaction', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('X'));
  await deleteWalletDocument('doc_a');
  assert.deepEqual(await listWalletDocuments(), []);
  assert.equal(await getWalletFile('doc_a'), null);
  const fileCount = await rawStore('files', 'readonly', (s) => s.count());
  assert.equal(fileCount, 0);
});

test('a failed add commits NOTHING — metadata never appears without its blob', async () => {
  await freshDb();
  // A function cannot be structured-cloned: the file put throws inside the
  // transaction and the adapter aborts it, so the already-queued metadata
  // put must not survive.
  await assert.rejects(addWalletDocument({ ...DOC, id: 'doc_bad' }, () => {}));
  assert.deepEqual(await listWalletDocuments(), []);
  const docCount = await rawStore('documents', 'readonly', (s) => s.count());
  assert.equal(docCount, 1, 'only the meta record remains');
});

test('a failed replace leaves the previous document fully intact', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('SAFE'));
  await assert.rejects(
    updateWalletDocument({ ...DOC, title: 'Half-updated', updatedAt: 99 }, () => {}),
  );
  const [docAfter] = await listWalletDocuments();
  assert.equal(docAfter.title, 'Bus ticket', 'the aborted transaction rolled the metadata back');
  assert.equal(await (await getWalletFile('doc_a')).text(), 'SAFE');
});

test('adding a duplicate id rejects (add is add, not upsert) and stays consistent', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('ONE'));
  await assert.rejects(addWalletDocument(DOC, blobOf('TWO')));
  assert.equal((await listWalletDocuments()).length, 1);
  assert.equal(await (await getWalletFile('doc_a')).text(), 'ONE');
});

test('corrupted legacy records are normalised or omitted at read time — never a crash', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('GOOD'));
  // Corrupt records written behind the adapter's back: one repairable, one not.
  await rawStore('documents', 'readwrite', (s) => {
    s.put({
      id: 'doc_repairable',
      title: '',
      category: 'no-such-category',
      date: 'not-a-date',
      pinned: 'yes',
      createdAt: 5,
      updatedAt: 'nope',
      fileName: 'old.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2,
    });
    s.put({ id: 'doc_hopeless', mimeType: 'application/zip' });
  });
  await rawStore('files', 'readwrite', (s) => {
    s.put({ id: 'doc_repairable', blob: blobOf('R') });
    s.put({ id: 'doc_hopeless', blob: blobOf('H') });
  });
  const docs = await listWalletDocuments();
  assert.deepEqual(docs.map((d) => d.id).sort(), ['doc_a', 'doc_repairable']);
  const repaired = docs.find((d) => d.id === 'doc_repairable');
  assert.equal(repaired.category, 'other');
  assert.equal(repaired.title, 'old', 'title recovered from the filename');
  assert.ok(!('date' in repaired));
  assert.equal(repaired.pinned, false);
});

test('metadata whose blob is missing is hidden from the list, non-destructively', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('OK'));
  await rawStore('documents', 'readwrite', (s) => s.put({ ...DOC, id: 'doc_orphan' }));
  const docs = await listWalletDocuments();
  assert.deepEqual(docs.map((d) => d.id), ['doc_a'], 'the orphan is omitted');
  const docCount = await rawStore('documents', 'readonly', (s) => s.count());
  assert.equal(docCount, 3, 'nothing was deleted (meta + 2 records still stored)');
});

test('getWalletFile returns null for an id with no stored file', async () => {
  await freshDb();
  assert.equal(await getWalletFile('doc_never_existed'), null);
});

test('clearWalletData empties both stores and re-seeds the schema record', async () => {
  await freshDb();
  await addWalletDocument(DOC, blobOf('A'));
  await addWalletDocument({ ...DOC, id: 'doc_b' }, blobOf('B'));
  await clearWalletData();
  assert.deepEqual(await listWalletDocuments(), []);
  const fileCount = await rawStore('files', 'readonly', (s) => s.count());
  assert.equal(fileCount, 0);
  assert.deepEqual(await readWalletMeta(), {
    id: WALLET_META_ID,
    schemaVersion: WALLET_SCHEMA_VERSION,
  });
});

test('clearWalletData is a safe no-op when IndexedDB is unavailable', async () => {
  await freshDb();
  const saved = globalThis.indexedDB;
  delete globalThis.indexedDB;
  await assert.doesNotReject(clearWalletData());
  globalThis.indexedDB = saved;
});

test('an unavailable IndexedDB rejects reads with a clear error and stays retryable', async () => {
  await freshDb();
  const saved = globalThis.indexedDB;
  delete globalThis.indexedDB;
  await closeWalletDb();
  await assert.rejects(listWalletDocuments(), /IndexedDB is not available/);
  globalThis.indexedDB = saved;
  // The failed open was not cached — the next call succeeds.
  assert.deepEqual(await listWalletDocuments(), []);
});
