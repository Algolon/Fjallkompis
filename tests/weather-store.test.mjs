/**
 * Weather IndexedDB adapter (src/weather/weatherStore.mjs) driven against
 * fake-indexeddb — real IndexedDB semantics, matching the wallet-store test
 * pattern. closeWeatherDb() between operations simulates an app restart, so
 * "the saved forecast survives reload / airplane mode" is the literal code
 * path the app runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  WEATHER_DB_NAME,
  clearWeatherSnapshot,
  closeWeatherDb,
  readWeatherSnapshot,
  replaceWeatherSnapshot,
  weatherStorageSupported,
} from '../src/weather/weatherStore.mjs';
import { WEATHER_SCHEMA_VERSION } from '../src/weather/weatherModel.mjs';

async function freshDb() {
  await closeWeatherDb();
  globalThis.indexedDB = new IDBFactory();
}

const SNAPSHOT = {
  schemaVersion: WEATHER_SCHEMA_VERSION,
  provider: 'smhi-snow1g',
  downloadedAt: '2026-09-03T16:42:00Z',
  forecastIssuedAt: '2026-09-03T14:00:00Z',
  validThrough: '2026-09-13T12:00:00Z',
  locations: [
    {
      id: 'abisko',
      name: 'Abisko',
      lat: 68.358071,
      lon: 18.78458,
      elevationM: 388,
      slots: [
        {
          time: '2026-09-04T12:00:00Z',
          intervalStart: null,
          temperatureC: 8,
          windMs: 4,
          gustMs: 8,
          precipProbabilityPct: 40,
          precipMm: 1.2,
          precipType: 'rain',
          conditionCode: 9,
        },
      ],
    },
  ],
};

test('an empty database reads as null — the honest no-forecast state', async () => {
  await freshDb();
  assert.equal(await readWeatherSnapshot(), null);
});

test('a saved snapshot survives an app restart (close + re-open)', async () => {
  await freshDb();
  await replaceWeatherSnapshot(SNAPSHOT);
  await closeWeatherDb(); // restart / airplane mode toggle
  const read = await readWeatherSnapshot();
  assert.deepEqual(read, SNAPSHOT);
  assert.equal(read.locations[0].slots[0].temperatureC, 8);
});

test('replace overwrites the previous snapshot as a unit', async () => {
  await freshDb();
  await replaceWeatherSnapshot(SNAPSHOT);
  const next = {
    ...SNAPSHOT,
    downloadedAt: '2026-09-05T08:00:00Z',
    validThrough: '2026-09-15T12:00:00Z',
  };
  await replaceWeatherSnapshot(next);
  const read = await readWeatherSnapshot();
  assert.equal(read.downloadedAt, '2026-09-05T08:00:00Z');
  assert.equal(read.validThrough, '2026-09-15T12:00:00Z');
});

test('an invalid candidate is refused and the saved snapshot is untouched', async () => {
  await freshDb();
  await replaceWeatherSnapshot(SNAPSHOT);
  // Every way a broken refresh could try to write: rejected before any
  // transaction, so the previous forecast keeps rendering.
  for (const bad of [
    null,
    {},
    { ...SNAPSHOT, schemaVersion: 99 },
    { ...SNAPSHOT, locations: [] },
    { ...SNAPSHOT, downloadedAt: 'garbage' },
  ]) {
    await assert.rejects(() => replaceWeatherSnapshot(bad), /invalid weather snapshot/);
  }
  assert.deepEqual(await readWeatherSnapshot(), SNAPSHOT);
});

test('a corrupt stored record reads as null instead of crashing the screen', async () => {
  await freshDb();
  await replaceWeatherSnapshot(SNAPSHOT);
  // Corrupt the record behind the adapter's back (storage rot / old schema).
  const db = await new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(WEATHER_DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put({ id: 'current', snapshot: { schemaVersion: 42 } });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await closeWeatherDb();
  assert.equal(await readWeatherSnapshot(), null);
});

test('clearWeatherSnapshot removes the forecast; reads stay null after restart', async () => {
  await freshDb();
  await replaceWeatherSnapshot(SNAPSHOT);
  await clearWeatherSnapshot();
  await closeWeatherDb();
  assert.equal(await readWeatherSnapshot(), null);
});

test('an unsupported IndexedDB degrades to null reads and no-op clears', async () => {
  await closeWeatherDb();
  const original = globalThis.indexedDB;
  try {
    delete globalThis.indexedDB;
    assert.equal(weatherStorageSupported(), false);
    assert.equal(await readWeatherSnapshot(), null);
    await clearWeatherSnapshot(); // resolves, nothing to clear
    await assert.rejects(() => replaceWeatherSnapshot(SNAPSHOT));
  } finally {
    globalThis.indexedDB = original;
    await closeWeatherDb();
  }
});
