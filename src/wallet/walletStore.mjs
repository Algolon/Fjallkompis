/**
 * Trail Wallet — IndexedDB storage adapter (dependency-free, native API).
 *
 * One dedicated database, deliberately SEPARATE from the localStorage state
 * blob (fjallkompis:state) — see docs/proposals/trail-wallet.md §2:
 *
 *   fjallkompis-wallet (IDB version 1)
 *   ├── documents   keyPath 'id' — metadata records + the '__meta__' schema record
 *   └── files       keyPath 'id' — { id, blob } rows, same id as their document
 *
 * Two stores so listing never loads blobs; every mutation that touches both
 * metadata and file content runs in ONE transaction spanning both stores, so
 * they cannot desynchronise (a synchronous failure mid-mutation aborts the
 * whole transaction — nothing partial is ever committed).
 *
 * Plain .mjs (sibling .d.mts declaration) so `node --test` exercises this
 * exact module against fake-indexeddb — real IndexedDB semantics, not an
 * in-memory mock. All React/UI access goes through this small interface;
 * components never touch IndexedDB directly, and a future optional sync
 * layer could wrap these functions without any component changes.
 */
import {
  WALLET_META_ID,
  WALLET_SCHEMA_VERSION,
  normalizeWalletDocument,
} from './walletModel.mjs';

export const WALLET_DB_NAME = 'fjallkompis-wallet';
export const WALLET_DB_VERSION = 1;
const DOCUMENTS = 'documents';
const FILES = 'files';

/** True when an IndexedDB factory exists at all (probe before first use). */
export function walletStorageSupported() {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
}

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Resolves on commit, rejects on abort/error — the atomicity boundary. */
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('The storage transaction was aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('The storage transaction failed'));
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!walletStorageSupported()) {
      reject(new Error('IndexedDB is not available in this browser mode'));
      return;
    }
    const request = globalThis.indexedDB.open(WALLET_DB_NAME, WALLET_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCUMENTS)) {
        db.createObjectStore(DOCUMENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(FILES)) {
        db.createObjectStore(FILES, { keyPath: 'id' });
      }
      // Data-level schema record, written inside the upgrade transaction so
      // a freshly created database always carries it. Future read-time
      // normalisation keys off this, independent of the structural version.
      request.transaction
        .objectStore(DOCUMENTS)
        .put({ id: WALLET_META_ID, schemaVersion: WALLET_SCHEMA_VERSION });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the database must not be blocked forever.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open the wallet database'));
  });
  // A failed open (private mode, storage denied) must stay retryable — never
  // cache the rejection.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/**
 * Close the cached connection (next call re-opens). Used by tests to
 * simulate an app restart, and harmless in the app.
 */
export async function closeWalletDb() {
  if (!dbPromise) return;
  const pending = dbPromise;
  dbPromise = null;
  try {
    (await pending).close();
  } catch {
    /* an already-failed open has nothing to close */
  }
}

/**
 * Run `fn(tx)` inside one readwrite transaction spanning BOTH stores and
 * resolve only on commit. A synchronous throw inside `fn` (e.g. a value
 * structured-clone cannot serialise) aborts the transaction explicitly, so
 * requests queued before the throw never commit — this is what guarantees
 * metadata and blobs move together or not at all.
 */
async function inBothStores(fn) {
  const db = await openDb();
  const tx = db.transaction([DOCUMENTS, FILES], 'readwrite');
  const done = transactionDone(tx);
  try {
    fn(tx);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      /* already aborted */
    }
    await done.catch(() => {});
    throw err;
  }
  await done;
}

/** The stored schema/meta record (null when absent — a pre-meta database). */
export async function readWalletMeta() {
  const db = await openDb();
  const tx = db.transaction(DOCUMENTS, 'readonly');
  return (await requestToPromise(tx.objectStore(DOCUMENTS).get(WALLET_META_ID))) ?? null;
}

/**
 * All wallet documents, normalised and safe to render (unsorted — the view
 * applies sortWalletDocuments). Never throws on bad records:
 *  - the '__meta__' record is filtered out;
 *  - malformed metadata is repaired where safe, omitted where not
 *    (normalizeWalletDocument);
 *  - metadata whose blob row is MISSING (browser storage eviction is real,
 *    even though a spanning transaction makes in-app orphans impossible) is
 *    LISTED with `fileMissing: true` rather than silently hidden — the
 *    document and its item links are still meaningful, and hiding it turned
 *    eviction into an unexplainable disappearance. The flag is a RUNTIME
 *    annotation derived here on every read; the write paths strip it so it
 *    can never be persisted as stored metadata.
 */
export async function listWalletDocuments() {
  const db = await openDb();
  const tx = db.transaction([DOCUMENTS, FILES], 'readonly');
  const [records, fileIds] = await Promise.all([
    requestToPromise(tx.objectStore(DOCUMENTS).getAll()),
    requestToPromise(tx.objectStore(FILES).getAllKeys()),
  ]);
  const blobIds = new Set(fileIds);
  const documents = [];
  for (const record of records) {
    if (record?.id === WALLET_META_ID) continue;
    const doc = normalizeWalletDocument(record);
    if (!doc) {
      console.warn('Fjallkompis: skipping an unreadable Trail Wallet record.', record?.id);
      continue;
    }
    if (!blobIds.has(doc.id)) {
      console.warn('Fjallkompis: Trail Wallet document has no stored file on this device.', doc.id);
      doc.fileMissing = true;
    }
    documents.push(doc);
  }
  return documents;
}

/** A stored record must never carry the runtime `fileMissing` annotation. */
function toStoredRecord(doc) {
  const { fileMissing, ...record } = doc;
  void fileMissing;
  return record;
}

/** The stored file for a document, or null when no blob row exists. */
export async function getWalletFile(id) {
  const db = await openDb();
  const tx = db.transaction(FILES, 'readonly');
  const row = await requestToPromise(tx.objectStore(FILES).get(id));
  return row?.blob ?? null;
}

/** Add a new document: metadata + blob in one atomic transaction. */
export async function addWalletDocument(doc, blob) {
  await inBothStores((tx) => {
    tx.objectStore(DOCUMENTS).add(toStoredRecord(doc));
    tx.objectStore(FILES).add({ id: doc.id, blob });
  });
}

/**
 * Update a document's metadata; when `blob` is given the stored file is
 * replaced in the SAME transaction (put overwrites the old row in place —
 * no orphan is ever left behind). Replacing the file is also the remediation
 * path for a `fileMissing` document — the annotation is stripped on write
 * and re-derived (now false) on the next list.
 */
export async function updateWalletDocument(doc, blob = null) {
  await inBothStores((tx) => {
    tx.objectStore(DOCUMENTS).put(toStoredRecord(doc));
    if (blob !== null) tx.objectStore(FILES).put({ id: doc.id, blob });
  });
}

/**
 * Make `keepId` the ONLY document carrying the Today quick-access flag.
 * One readwrite transaction: every other record with showOnToday loses the
 * flag before commit, so at most one membership card can ever be surfaced
 * (explicit uniqueness — no hidden pick-a-winner heuristics at read time).
 * Run right after saving a document whose showOnToday is true.
 */
export async function enforceMembershipQuickAccess(keepId) {
  await inBothStores((tx) => {
    const store = tx.objectStore(DOCUMENTS);
    store.getAll().onsuccess = (event) => {
      for (const record of event.target.result) {
        if (!record || record.id === WALLET_META_ID || record.id === keepId) continue;
        if (record.showOnToday !== undefined) {
          const next = { ...record };
          delete next.showOnToday;
          store.put(next);
        }
      }
    };
  });
}

/** Delete a document — metadata and blob leave together, atomically. */
export async function deleteWalletDocument(id) {
  await inBothStores((tx) => {
    tx.objectStore(DOCUMENTS).delete(id);
    tx.objectStore(FILES).delete(id);
  });
}

/**
 * Remove every wallet document and file, re-seeding the schema record —
 * the Settings "Reset local data" hook. When IndexedDB is unsupported there
 * is nothing stored, so the reset resolves as a no-op; a genuine clearing
 * failure rejects so Settings can report it honestly instead of claiming
 * success.
 */
export async function clearWalletData() {
  if (!walletStorageSupported()) return;
  await inBothStores((tx) => {
    tx.objectStore(DOCUMENTS).clear();
    tx.objectStore(FILES).clear();
    tx.objectStore(DOCUMENTS).put({ id: WALLET_META_ID, schemaVersion: WALLET_SCHEMA_VERSION });
  });
}

/**
 * One CONSISTENT read of the whole wallet for the complete backup: documents
 * (normalised, with the fileMissing annotation derived exactly as
 * listWalletDocuments derives it) plus every stored blob, all inside ONE
 * readonly transaction spanning both stores — a document added or deleted
 * concurrently can never produce a list/blob mismatch in the export.
 */
export async function dumpWalletData() {
  if (!walletStorageSupported()) return { documents: [], files: new Map() };
  const db = await openDb();
  const tx = db.transaction([DOCUMENTS, FILES], 'readonly');
  const [records, fileRows] = await Promise.all([
    requestToPromise(tx.objectStore(DOCUMENTS).getAll()),
    requestToPromise(tx.objectStore(FILES).getAll()),
  ]);
  const files = new Map(fileRows.map((row) => [row.id, row.blob ?? null]));
  const documents = [];
  for (const record of records) {
    if (record?.id === WALLET_META_ID) continue;
    const doc = normalizeWalletDocument(record);
    if (!doc) continue;
    if (!files.has(doc.id) || files.get(doc.id) === null) {
      doc.fileMissing = true;
      // An explicit null entry, so this dump can round-trip through
      // replaceWalletData as a rollback snapshot (metadata-only document).
      files.set(doc.id, null);
    }
    documents.push(doc);
  }
  return { documents, files };
}

/**
 * Replace the ENTIRE wallet in one atomic transaction spanning both stores —
 * the restore path of the complete backup, and its rollback. Clear + refill
 * happens INSIDE the transaction, so an abort at any point (quota, a blob
 * that cannot be cloned) leaves the previous contents exactly as they were:
 * this is never "clear first, hope the import succeeds".
 *
 * `files` maps document id -> blob. A document with NO map entry at all is a
 * programming error and aborts the transaction (a staged restore candidate
 * always carries every blob). An explicit `null` stores metadata WITHOUT a
 * blob row — that exists solely so the ROLLBACK can reproduce a wallet that
 * already had a fileMissing document (storage eviction) exactly as it was,
 * instead of failing the rollback over a blob nobody has.
 */
export async function replaceWalletData(documents, files) {
  await inBothStores((tx) => {
    const docStore = tx.objectStore(DOCUMENTS);
    const fileStore = tx.objectStore(FILES);
    docStore.clear();
    fileStore.clear();
    docStore.put({ id: WALLET_META_ID, schemaVersion: WALLET_SCHEMA_VERSION });
    for (const doc of documents) {
      if (!files.has(doc.id)) throw new Error(`No file provided for document ${doc.id}`);
      const blob = files.get(doc.id);
      docStore.put(toStoredRecord(doc));
      if (blob !== null) fileStore.put({ id: doc.id, blob });
    }
  });
}

/**
 * Best-effort request for persistent (eviction-resistant) storage. Browsers
 * decide for themselves — installed PWAs usually qualify — and several
 * ignore it; the result must never be presented as a guarantee. Returns
 * true/false when the browser answered, null when unsupported.
 */
export async function requestPersistentStorage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
