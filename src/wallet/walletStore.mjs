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
 *  - metadata whose blob row is MISSING (an orphan that a spanning
 *    transaction should make impossible) is omitted from the list —
 *    non-destructively, with a console warning — rather than shown as a
 *    document that could never open.
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
      console.warn('Fjällkompis: skipping an unreadable Trail Wallet record.', record?.id);
      continue;
    }
    if (!blobIds.has(doc.id)) {
      console.warn('Fjällkompis: Trail Wallet document has no stored file; hiding it.', doc.id);
      continue;
    }
    documents.push(doc);
  }
  return documents;
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
    tx.objectStore(DOCUMENTS).add(doc);
    tx.objectStore(FILES).add({ id: doc.id, blob });
  });
}

/**
 * Update a document's metadata; when `blob` is given the stored file is
 * replaced in the SAME transaction (put overwrites the old row in place —
 * no orphan is ever left behind).
 */
export async function updateWalletDocument(doc, blob = null) {
  await inBothStores((tx) => {
    tx.objectStore(DOCUMENTS).put(doc);
    if (blob !== null) tx.objectStore(FILES).put({ id: doc.id, blob });
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
