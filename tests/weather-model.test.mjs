/**
 * Weather model (src/weather/weatherModel.mjs) — normalization, Swedish
 * calendar-day grouping, daily summaries, freshness and display formatting.
 * Pure functions, driven with hand-built slots: no React, no network, no
 * IndexedDB.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEATHER_SCHEMA_VERSION,
  availableDates,
  cleanNumber,
  cleanPercent,
  conditionForCode,
  dateChipLabel,
  formatPrecip,
  formatTempRange,
  formatWind,
  freshnessLevel,
  freshnessNotice,
  normalizeWeatherSnapshot,
  precipTypeFromCode,
  shortDateLabel,
  slotIntervalDate,
  snapshotAgeDays,
  stockholmDateOf,
  stockholmHourOf,
  summarizeDayParts,
  summarizeLocationDay,
} from '../src/weather/weatherModel.mjs';

const slot = (overrides = {}) => ({
  time: '2026-09-04T12:00:00Z',
  intervalStart: null,
  temperatureC: null,
  windMs: null,
  gustMs: null,
  precipProbabilityPct: null,
  precipMm: null,
  precipType: null,
  conditionCode: null,
  ...overrides,
});

const location = (slots) => ({
  id: 'abisko',
  name: 'Abisko',
  lat: 68.358071,
  lon: 18.78458,
  elevationM: 388,
  slots,
});

const snapshot = (overrides = {}) => ({
  schemaVersion: WEATHER_SCHEMA_VERSION,
  provider: 'smhi-snow1g',
  downloadedAt: '2026-09-03T16:42:00Z',
  forecastIssuedAt: '2026-09-03T14:00:00Z',
  validThrough: '2026-09-13T12:00:00Z',
  locations: [location([slot({ temperatureC: 8 })])],
  ...overrides,
});

// --- Missing-value hygiene ---------------------------------------------------

test('SMHI 9999 sentinels, NaN and non-numbers normalise to null — never to UI values', () => {
  assert.equal(cleanNumber(9999), null);
  assert.equal(cleanNumber(-9999), null);
  assert.equal(cleanNumber(NaN), null);
  assert.equal(cleanNumber(Infinity), null);
  assert.equal(cleanNumber('7'), null);
  assert.equal(cleanNumber(undefined), null);
  assert.equal(cleanNumber(-12.4), -12.4);
  assert.equal(cleanPercent(140), 100);
  assert.equal(cleanPercent(-5), 0);
  assert.equal(cleanPercent(9999), null);
});

test('precipitation types map the documented 0–6 codes and refuse the rest', () => {
  assert.equal(precipTypeFromCode(0), 'none');
  assert.equal(precipTypeFromCode(1), 'snow');
  assert.equal(precipTypeFromCode(3), 'rain');
  assert.equal(precipTypeFromCode(6), 'freezing-drizzle');
  assert.equal(precipTypeFromCode(7), null);
  assert.equal(precipTypeFromCode(9999), null);
});

test('all 27 SMHI symbol codes carry a condition group; unknown codes do not', () => {
  for (let code = 1; code <= 27; code++) {
    assert.ok(conditionForCode(code), `code ${code} is mapped`);
  }
  assert.equal(conditionForCode(0), null);
  assert.equal(conditionForCode(28), null);
  assert.equal(conditionForCode(9999), null);
});

// --- Swedish calendar days ---------------------------------------------------

test('forecast timestamps group by the Europe/Stockholm calendar date', () => {
  // 22:30 UTC in summer (CEST, +2) is already the NEXT Swedish day.
  assert.equal(stockholmDateOf('2026-09-04T22:30:00Z'), '2026-09-05');
  // …but in winter (CET, +1) 22:30 UTC is still the same Swedish day.
  assert.equal(stockholmDateOf('2026-12-04T22:30:00Z'), '2026-12-04');
  assert.equal(stockholmHourOf('2026-09-04T22:30:00Z'), 0);
  assert.equal(stockholmDateOf('nonsense'), null);
});

test('interval quantities land on the day of the interval midpoint', () => {
  // A 12 h slot stamped midnight covers the PREVIOUS evening: its rain
  // belongs to Sep 4, not Sep 5.
  const s = slot({
    time: '2026-09-04T22:00:00Z', // 00:00 Sep 5 Swedish
    intervalStart: '2026-09-04T10:00:00Z', // 12:00 Sep 4 Swedish
  });
  assert.equal(stockholmDateOf(s.time), '2026-09-05');
  assert.equal(slotIntervalDate(s), '2026-09-04');
  // No interval → the slot time decides.
  assert.equal(slotIntervalDate(slot({ time: '2026-09-04T12:00:00Z' })), '2026-09-04');
});

// --- Daily summaries ---------------------------------------------------------

test('summarizeLocationDay derives extremes, sums precipitation and stays null-safe', () => {
  const loc = location([
    slot({
      time: '2026-09-04T06:00:00Z',
      temperatureC: 3,
      windMs: 4,
      gustMs: 8,
      conditionCode: 3,
    }),
    slot({
      time: '2026-09-04T12:00:00Z',
      intervalStart: '2026-09-04T06:00:00Z',
      temperatureC: 9.6,
      windMs: 6,
      gustMs: 12,
      precipMm: 1.2,
      precipProbabilityPct: 40,
      precipType: 'rain',
      conditionCode: 9,
    }),
    slot({
      time: '2026-09-04T18:00:00Z',
      intervalStart: '2026-09-04T12:00:00Z',
      temperatureC: 9999, // missing — must not poison min/max
      precipMm: 2.3,
      precipProbabilityPct: 70,
      precipType: 'snow',
      conditionCode: 9,
    }),
    slot({ time: '2026-09-05T06:00:00Z', temperatureC: -2 }), // other day
  ]);
  const s = summarizeLocationDay(loc, '2026-09-04');
  assert.equal(s.minTempC, 3);
  assert.equal(s.maxTempC, 9.6);
  assert.equal(s.maxWindMs, 6);
  assert.equal(s.maxGustMs, 12);
  assert.equal(s.totalPrecipMm, 3.5);
  assert.equal(s.maxPrecipProbabilityPct, 70);
  assert.deepEqual([...s.precipTypes].sort(), ['rain', 'snow']);
  assert.equal(s.dominantCondition, 9); // most frequent daytime condition
});

test('a day with no data returns null — the row says so instead of faking values', () => {
  const loc = location([slot({ time: '2026-09-04T12:00:00Z', temperatureC: 8 })]);
  assert.equal(summarizeLocationDay(loc, '2026-09-09'), null);
});

test('a day whose slots all carry missing values still summarises, with null fields', () => {
  const loc = location([
    slot({ time: '2026-09-04T12:00:00Z', temperatureC: 9999, windMs: 9999 }),
  ]);
  const s = summarizeLocationDay(loc, '2026-09-04');
  assert.notEqual(s, null);
  assert.equal(s.minTempC, null);
  assert.equal(s.maxWindMs, null);
  assert.equal(s.dominantCondition, null);
});

test('availableDates unions every location day, ascending', () => {
  const snap = snapshot({
    locations: [
      location([slot({ time: '2026-09-05T12:00:00Z' })]),
      {
        ...location([slot({ time: '2026-09-04T12:00:00Z' })]),
        id: 'salka',
        name: 'Sälka',
      },
    ],
  });
  assert.deepEqual(availableDates(snap), ['2026-09-04', '2026-09-05']);
});

test('day parts (morning/afternoon/evening) come from real slots only', () => {
  const loc = location([
    slot({ time: '2026-09-04T05:00:00Z', temperatureC: 4, conditionCode: 2 }), // 07:00 Swedish
    slot({ time: '2026-09-04T11:00:00Z', temperatureC: 10, conditionCode: 9 }), // 13:00
  ]);
  const [morning, afternoon, evening] = summarizeDayParts(loc, '2026-09-04');
  assert.equal(morning.data.tempMinC, 4);
  assert.equal(afternoon.data.tempMaxC, 10);
  assert.equal(afternoon.data.conditionCode, 9);
  assert.equal(evening.data, null); // no slots — rendered as '—', never invented
});

// --- Snapshot validation -----------------------------------------------------

test('normalizeWeatherSnapshot accepts a sound snapshot and rejects broken ones', () => {
  assert.notEqual(normalizeWeatherSnapshot(snapshot()), null);
  assert.equal(normalizeWeatherSnapshot(null), null);
  assert.equal(normalizeWeatherSnapshot({}), null);
  assert.equal(normalizeWeatherSnapshot(snapshot({ schemaVersion: 2 })), null);
  assert.equal(normalizeWeatherSnapshot(snapshot({ provider: '' })), null);
  assert.equal(normalizeWeatherSnapshot(snapshot({ locations: [] })), null);
  assert.equal(
    normalizeWeatherSnapshot(snapshot({ downloadedAt: 'not-a-time' })),
    null,
  );
});

// --- Freshness ---------------------------------------------------------------

test('freshness is counted in Swedish calendar days', () => {
  const now = '2026-09-05T10:00:00Z';
  assert.equal(snapshotAgeDays('2026-09-05T04:00:00Z', now), 0);
  assert.equal(snapshotAgeDays('2026-09-04T18:00:00Z', now), 1);
  assert.equal(snapshotAgeDays('2026-09-01T18:00:00Z', now), 4);
  // 22:30 UTC on Sep 4 is already Sep 5 in Sweden → age 0.
  assert.equal(snapshotAgeDays('2026-09-04T22:30:00Z', now), 0);
});

test('the age notice never presents old weather as current', () => {
  const now = '2026-09-05T10:00:00Z';
  assert.equal(freshnessNotice('2026-09-05T06:00:00Z', now), null);
  assert.equal(freshnessNotice('2026-09-04T18:00:00Z', now), 'Forecast saved yesterday');
  assert.equal(
    freshnessNotice('2026-09-03T18:00:00Z', now),
    'Saved forecast is 2 days old',
  );
  assert.equal(freshnessLevel('2026-09-05T06:00:00Z', now), 'fresh');
  assert.equal(freshnessLevel('2026-09-04T18:00:00Z', now), 'aging');
  assert.equal(freshnessLevel('2026-09-02T18:00:00Z', now), 'stale');
});

// --- Display formatting ------------------------------------------------------

test('temperature ranges render honestly for every combination', () => {
  assert.equal(formatTempRange(4, 10), '4–10°C');
  assert.equal(formatTempRange(-2, 5), '−2 to 5°C');
  assert.equal(formatTempRange(6.4, 6.4), '6°C');
  assert.equal(formatTempRange(null, 8), '8°C');
  assert.equal(formatTempRange(null, null), '—');
  // No '9999' or 'NaN' can reach here by construction (cleanNumber), and the
  // formatter itself never fabricates a missing bound.
});

test('wind and precipitation lines degrade to honest partial text', () => {
  assert.equal(formatWind(4.6, 8.2), 'Wind 5 m/s · gust 8');
  assert.equal(formatWind(4.6, null), 'Wind 5 m/s · gust —');
  assert.equal(formatWind(null, null), null);
  assert.equal(
    formatPrecip({ maxPrecipProbabilityPct: 40, totalPrecipMm: 1.5, precipTypes: ['rain'] }),
    'Rain 40% · 1.5 mm',
  );
  assert.equal(
    formatPrecip({ maxPrecipProbabilityPct: 60, totalPrecipMm: null, precipTypes: ['snow', 'rain'] }),
    'Rain/snow 60%',
  );
  assert.equal(
    formatPrecip({ maxPrecipProbabilityPct: null, totalPrecipMm: 0.03, precipTypes: [] }),
    null,
  );
});

test('date labels: Today for the current Swedish date, weekday + day otherwise', () => {
  assert.equal(dateChipLabel('2026-09-04', '2026-09-04'), 'Today');
  assert.equal(dateChipLabel('2026-09-04', '2026-09-03'), 'Fri 4');
  assert.equal(shortDateLabel('2026-09-13'), '13 Sep');
  assert.equal(shortDateLabel(null), '—');
});
