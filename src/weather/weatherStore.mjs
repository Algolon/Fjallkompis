/**
 * Weather — IndexedDB storage adapter (dependency-free, native API).
 *
 * One dedicated database, deliberately SEPARATE from the localStorage state
 * blob AND from the wallet — the same isolation pattern as
 * src/wallet/walletStore.mjs, for the same reason inverted: weather is
 * externally derived, disposable, refreshable and time-sensitive, so it is
 * neither personal trip data (the blob) nor part of backup/export.
 *
 *   fjallkompis-weather (IDB version 1)
 *   └── snapshots   keyPath 'id' — the '__meta__' schema record plus ONE
 *                   'current' record holding the normalized WeatherSnapshot
 *
 * `replaceWeatherSnapshot` is a single put in a single transaction: the
 * previous snapshot survives ANY failed refresh by construction — the store
 * is only ever handed a complete, validated snapshot, and an aborted
 * transaction commits nothing partial.
 *
 * Plain .mjs (sibling .d.mts) so node --test exercises this exact module
 * against fake-indexeddb. All React/UI access goes through this interface;
 * components never touch IndexedDB directly.
 */
import {
  WEATHER_SCHEMA_VERSION,
  normalizeWeatherSnapshot,
} from './weatherModel.mjs';

export const WEATHER_DB_NAME = 'fjallkompis-weather';
export const WEATHER_DB_VERSION = 1;
export const WEATHER_META_ID = '__meta__';
export const WEATHER_SNAPSHOT_ID = 'current';
const SNAPSHOTS = 'snapshots';

/** True when an IndexedDB factory exists at all (probe before first use). */
export function weatherStorageSupported() {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
}

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

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
    if (!weatherStorageSupported()) {
      reject(new Error('IndexedDB is not available in this browser mode'));
      return;
    }
    const request = globalThis.indexedDB.open(WEATHER_DB_NAME, WEATHER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        db.createObjectStore(SNAPSHOTS, { keyPath: 'id' });
      }
      request.transaction
        .objectStore(SNAPSHOTS)
        .put({ id: WEATHER_META_ID, schemaVersion: WEATHER_SCHEMA_VERSION });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open the weather database'));
  });
  // A failed open (private mode, storage denied) must stay retryable.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Close the cached connection (next call re-opens) — tests' app restart. */
export async function closeWeatherDb() {
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
 * The saved WeatherSnapshot, validated for rendering, or null when nothing
 * usable is stored (absent, corrupt, unknown schema, storage unsupported).
 * Read failures degrade to null — the screen then shows the honest
 * "no saved forecast" state rather than crashing offline.
 */
export async function readWeatherSnapshot() {
  if (!weatherStorageSupported()) return null;
  try {
    const db = await openDb();
    const tx = db.transaction(SNAPSHOTS, 'readonly');
    const record = await requestToPromise(
      tx.objectStore(SNAPSHOTS).get(WEATHER_SNAPSHOT_ID),
    );
    return normalizeWeatherSnapshot(record?.snapshot) ?? null;
  } catch (err) {
    console.warn('Fjallkompis: could not read the saved weather snapshot.', err);
    return null;
  }
}

/**
 * Atomically replace the saved snapshot with a COMPLETE, validated one.
 * Rejects (leaving the previous snapshot untouched) when the candidate does
 * not validate — a failed or partial refresh can never corrupt saved data.
 */
export async function replaceWeatherSnapshot(snapshot) {
  const valid = normalizeWeatherSnapshot(snapshot);
  if (!valid) throw new Error('Refusing to save an invalid weather snapshot');
  const db = await openDb();
  const tx = db.transaction(SNAPSHOTS, 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore(SNAPSHOTS).put({ id: WEATHER_SNAPSHOT_ID, snapshot: valid });
  await done;
}

/**
 * Remove the saved snapshot (schema record stays). No-op when storage is
 * unsupported; a genuine clearing failure rejects so callers can report it.
 */
export async function clearWeatherSnapshot() {
  if (!weatherStorageSupported()) return;
  const db = await openDb();
  const tx = db.transaction(SNAPSHOTS, 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore(SNAPSHOTS).delete(WEATHER_SNAPSHOT_ID);
  await done;
}
