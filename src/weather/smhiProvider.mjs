/**
 * SMHI point-forecast provider (the current SNOW product, snow1g version 1).
 *
 * SMHI retired the long-standing pmp3g point forecast on 31 March 2026; the
 * replacement is category `snow1g` version 1 on the same host:
 *
 *   https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/
 *     geotype/point/lon/{lon}/lat/{lat}/data.json
 *
 * Response shape (verified against SMHI's snow1gv1 documentation and
 * post-migration client implementations, Aug 2026):
 *   { approvedTime, referenceTime, geometry,
 *     timeSeries: [{ time, intervalParametersStartTime,
 *       data: { air_temperature, wind_speed, wind_speed_of_gust,
 *               probability_of_precipitation, precipitation_amount_mean,
 *               predominant_precipitation_type_at_surface, symbol_code, … } }] }
 *
 * Temporal resolution is the provider's own (hourly at first, then
 * increasing steps — per SMHI's docs "e.g. 3, 6 and 12 h" — out to ~10
 * days) and is preserved as-is: the app never assumes a cadence, it reads
 * each entry's own timestamps. Missing values are 9999
 * sentinels, normalised to null in weatherModel. Data are open data
 * (CC BY 4.0) — the Weather screen credits SMHI.
 *
 * ALL-OR-NOTHING: one refresh fetches every route location; if ANY point
 * fails to fetch or validate, the whole refresh throws and the caller keeps
 * rendering the previously saved snapshot. Eight small point requests per
 * deliberate user tap is well inside SMHI's open-data usage expectations.
 *
 * Pure/injectable (fetchImpl, now) so node --test can drive success,
 * failure and partial-failure paths without a network.
 */
import {
  WEATHER_SCHEMA_VERSION,
  cleanNumber,
  cleanPercent,
  precipTypeFromCode,
  conditionForCode,
  normalizeWeatherSnapshot,
} from './weatherModel.mjs';

export const SMHI_PROVIDER_ID = 'smhi-snow1g';
export const SMHI_ATTRIBUTION = 'Forecast data: SMHI (CC BY 4.0)';

const BASE_URL =
  'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point';

/**
 * The only snow1g parameters the app consumes — requested explicitly via
 * the officially supported `?parameters=` filter (comma-separated; see
 * SMHI's snow1gv1 Get Point Forecast docs), so a full-parameter payload is
 * never downloaded just to be discarded by normalization.
 */
export const SMHI_POINT_PARAMETERS = [
  'air_temperature',
  'wind_speed',
  'wind_speed_of_gust',
  'probability_of_precipitation',
  'precipitation_amount_mean',
  'predominant_precipitation_type_at_surface',
  'symbol_code',
];

/** Point-forecast URL for a coordinate (SMHI accepts at most 6 decimals). */
export function smhiPointUrl(lat, lon) {
  const r = (n) => String(Math.round(n * 1e6) / 1e6);
  return `${BASE_URL}/lon/${r(lon)}/lat/${r(lat)}/data.json?parameters=${SMHI_POINT_PARAMETERS.join(',')}`;
}

/** One normalized slot from a snow1g timeSeries entry, or null if unusable. */
function normalizeSlot(entry) {
  if (!entry || typeof entry.time !== 'string') return null;
  if (Number.isNaN(new Date(entry.time).getTime())) return null;
  const data = entry.data ?? {};
  const conditionCode = cleanNumber(data.symbol_code);
  return {
    time: entry.time,
    intervalStart:
      typeof entry.intervalParametersStartTime === 'string'
        ? entry.intervalParametersStartTime
        : null,
    temperatureC: cleanNumber(data.air_temperature),
    windMs: cleanNumber(data.wind_speed),
    gustMs: cleanNumber(data.wind_speed_of_gust),
    precipProbabilityPct: cleanPercent(data.probability_of_precipitation),
    precipMm: cleanNumber(data.precipitation_amount_mean),
    precipType: precipTypeFromCode(data.predominant_precipitation_type_at_surface),
    conditionCode: conditionForCode(conditionCode) ? conditionCode : null,
  };
}

/**
 * Validate + normalise one point response for one named route location.
 * Throws (with the location name) on a structurally unusable response.
 */
export function normalizeSmhiPointForecast(json, location) {
  if (!json || !Array.isArray(json.timeSeries) || json.timeSeries.length === 0) {
    throw new Error(`SMHI returned no forecast series for ${location.name}`);
  }
  const slots = json.timeSeries
    .map(normalizeSlot)
    .filter((slot) => slot !== null);
  if (slots.length === 0) {
    throw new Error(`SMHI returned no usable timeslots for ${location.name}`);
  }
  return {
    id: location.id,
    name: location.name,
    lat: location.lat,
    lon: location.lon,
    elevationM: cleanNumber(location.elevationM),
    slots,
    referenceTime:
      typeof json.referenceTime === 'string' ? json.referenceTime : null,
  };
}

/**
 * Fetch the forecast for every route location and assemble one complete,
 * validated WeatherSnapshot. Throws on ANY failure — the caller's saved
 * snapshot is only ever replaced by a whole new one (weatherStore enforces
 * the same invariant again at write time).
 *
 * `locations`: [{ id, name, lat, lon, elevationM }] — resolved by the
 * caller from the verified trail stops; this module never reaches into the
 * trail data itself.
 */
export async function fetchSmhiRouteSnapshot(
  locations,
  { fetchImpl = globalThis.fetch, now = () => new Date() } = {},
) {
  if (!Array.isArray(locations) || locations.length === 0) {
    throw new Error('No weather locations to update');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch available for the forecast update');
  }

  const results = await Promise.all(
    locations.map(async (location) => {
      const res = await fetchImpl(smhiPointUrl(location.lat, location.lon), {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`SMHI responded ${res.status} for ${location.name}`);
      }
      return normalizeSmhiPointForecast(await res.json(), location);
    }),
  );

  // Oldest model run across the points — never overstates how new it is.
  let forecastIssuedAt = null;
  let validThrough = null;
  for (const loc of results) {
    if (loc.referenceTime && (!forecastIssuedAt || loc.referenceTime < forecastIssuedAt)) {
      forecastIssuedAt = loc.referenceTime;
    }
    for (const slot of loc.slots) {
      if (!validThrough || slot.time > validThrough) validThrough = slot.time;
    }
  }

  const snapshot = {
    schemaVersion: WEATHER_SCHEMA_VERSION,
    provider: SMHI_PROVIDER_ID,
    downloadedAt: now().toISOString(),
    forecastIssuedAt,
    validThrough,
    locations: results.map(({ referenceTime, ...loc }) => {
      void referenceTime;
      return loc;
    }),
  };
  const valid = normalizeWeatherSnapshot(snapshot);
  if (!valid) throw new Error('The assembled forecast snapshot did not validate');
  return valid;
}
