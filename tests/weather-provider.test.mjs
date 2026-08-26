/**
 * SMHI snow1g provider (src/weather/smhiProvider.mjs) — URL construction,
 * response normalization and the all-or-nothing refresh contract, driven
 * with an injected fetch. No network anywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SMHI_PROVIDER_ID,
  fetchSmhiRouteSnapshot,
  normalizeSmhiPointForecast,
  smhiPointUrl,
} from '../src/weather/smhiProvider.mjs';
import { availableDates } from '../src/weather/weatherModel.mjs';

const LOCATIONS = [
  { id: 'abisko', name: 'Abisko', lat: 68.358071, lon: 18.78458, elevationM: 387.7 },
  { id: 'salka', name: 'Sälka', lat: 67.946249, lon: 18.282307, elevationM: 826.4 },
];

/** A minimal but faithful snow1g point response. */
const smhiResponse = (overrides = {}) => ({
  approvedTime: '2026-09-03T14:30:00Z',
  referenceTime: '2026-09-03T14:00:00Z',
  geometry: { type: 'Point', coordinates: [18.78458, 68.358071] },
  timeSeries: [
    {
      time: '2026-09-04T06:00:00Z',
      intervalParametersStartTime: '2026-09-04T05:00:00Z',
      data: {
        air_temperature: 6.3,
        wind_speed: 4.1,
        wind_speed_of_gust: 8.7,
        probability_of_precipitation: 40,
        precipitation_amount_mean: 0.4,
        predominant_precipitation_type_at_surface: 3,
        symbol_code: 9,
        relative_humidity: 80, // extra fields must be ignored, not persisted
      },
    },
    {
      time: '2026-09-04T12:00:00Z',
      intervalParametersStartTime: '2026-09-04T06:00:00Z',
      data: {
        air_temperature: 9999, // missing sentinel
        wind_speed: 5.0,
        wind_speed_of_gust: 9999,
        probability_of_precipitation: 70,
        precipitation_amount_mean: 2.1,
        predominant_precipitation_type_at_surface: 1,
        symbol_code: 25,
      },
    },
  ],
  ...overrides,
});

const okFetch = (json) => async () => ({ ok: true, status: 200, json: async () => json });

test('the point URL targets the current snow1g product with capped precision', () => {
  const url = smhiPointUrl(68.35807112345, 18.784580098765);
  assert.equal(
    url,
    'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/18.78458/lat/68.358071/data.json',
  );
  // The retired pmp3g product (404 since 31 Mar 2026) must never come back.
  assert.ok(!url.includes('pmp3g'));
});

test('a snow1g response normalises to the app model, sentinels → null', () => {
  const loc = normalizeSmhiPointForecast(smhiResponse(), LOCATIONS[0]);
  assert.equal(loc.id, 'abisko');
  assert.equal(loc.slots.length, 2);
  const [a, b] = loc.slots;
  assert.equal(a.temperatureC, 6.3);
  assert.equal(a.precipType, 'rain');
  assert.equal(a.conditionCode, 9);
  assert.equal(a.intervalStart, '2026-09-04T05:00:00Z');
  assert.equal(b.temperatureC, null); // 9999 → null, never 9999°C
  assert.equal(b.gustMs, null);
  assert.equal(b.precipType, 'snow');
  // Fields the UI does not use are not persisted.
  assert.ok(!('relative_humidity' in a));
});

test('an empty or malformed response is refused with the location named', () => {
  assert.throws(() => normalizeSmhiPointForecast({}, LOCATIONS[0]), /Abisko/);
  assert.throws(
    () => normalizeSmhiPointForecast({ timeSeries: [] }, LOCATIONS[0]),
    /Abisko/,
  );
});

test('a full refresh assembles one validated snapshot over all locations', async () => {
  const urls = [];
  const snapshot = await fetchSmhiRouteSnapshot(LOCATIONS, {
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => smhiResponse() };
    },
    now: () => new Date('2026-09-03T16:42:00Z'),
  });
  assert.equal(urls.length, 2);
  assert.ok(urls[1].includes('lat/67.946249'));
  assert.equal(snapshot.provider, SMHI_PROVIDER_ID);
  assert.equal(snapshot.downloadedAt, '2026-09-03T16:42:00.000Z');
  assert.equal(snapshot.forecastIssuedAt, '2026-09-03T14:00:00Z');
  assert.equal(snapshot.validThrough, '2026-09-04T12:00:00Z');
  assert.equal(snapshot.locations.length, 2);
  assert.ok(!('referenceTime' in snapshot.locations[0]));
  assert.deepEqual(availableDates(snapshot), ['2026-09-04']);
});

test('ALL-OR-NOTHING: one failing location fails the whole refresh', async () => {
  // HTTP failure on the second point…
  await assert.rejects(
    () =>
      fetchSmhiRouteSnapshot(LOCATIONS, {
        fetchImpl: async (url) =>
          url.includes('67.946249')
            ? { ok: false, status: 500, json: async () => ({}) }
            : { ok: true, status: 200, json: async () => smhiResponse() },
      }),
    /Sälka/,
  );
  // …or an unusable body, or a thrown network error: same contract.
  await assert.rejects(
    () =>
      fetchSmhiRouteSnapshot(LOCATIONS, {
        fetchImpl: async (url) =>
          url.includes('67.946249')
            ? { ok: true, status: 200, json: async () => ({ timeSeries: [] }) }
            : { ok: true, status: 200, json: async () => smhiResponse() },
      }),
    /Sälka/,
  );
  await assert.rejects(() =>
    fetchSmhiRouteSnapshot(LOCATIONS, {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    }),
  );
});

test('the oldest model run across points is reported as issued time', async () => {
  let call = 0;
  const snapshot = await fetchSmhiRouteSnapshot(LOCATIONS, {
    fetchImpl: async () => {
      call += 1;
      const referenceTime =
        call === 1 ? '2026-09-03T14:00:00Z' : '2026-09-03T08:00:00Z';
      return { ok: true, status: 200, json: async () => smhiResponse({ referenceTime }) };
    },
  });
  assert.equal(snapshot.forecastIssuedAt, '2026-09-03T08:00:00Z');
});
