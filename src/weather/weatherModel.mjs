/**
 * Weather — the normalized, provider-independent forecast model and its pure
 * derivations (Guide → Weather prototype; docs/proposals/weather-section.md).
 *
 * The persisted WeatherSnapshot carries ONLY what the UI needs, at the
 * provider's real temporal resolution — never interpolated, never a raw
 * provider response:
 *
 *   {
 *     schemaVersion: 1,
 *     provider: 'smhi-snow1g',
 *     downloadedAt: ISO instant (when this device saved it),
 *     forecastIssuedAt: ISO instant | null (provider model run),
 *     validThrough: ISO instant (last forecast slot),
 *     locations: [{ id, name, lat, lon, elevationM,
 *       slots: [{ time, intervalStart, temperatureC, windMs, gustMs,
 *                 precipProbabilityPct, precipMm, precipType,
 *                 conditionCode }] }],
 *   }
 *
 * Missing provider values are explicit `null`s (SMHI's 9999 sentinels are
 * caught here) and render as "—" — they can never surface as 9999°C or NaN.
 *
 * CALENDAR DAYS ARE SWEDISH. The trail is in Sweden, so every slot is
 * grouped by its Europe/Stockholm calendar date (DST-safe via
 * Intl.DateTimeFormat parts), never by the device timezone and never by
 * parsing a date-only string as UTC.
 *
 * Plain .mjs (sibling .d.mts) so node --test exercises normalization,
 * grouping and the daily summaries without a TypeScript toolchain — the
 * same pattern as routes.mjs / walletModel.mjs.
 */
import { parseIsoDate, weekdayIndex } from '../utils/dateTimeField.mjs';

export const WEATHER_SCHEMA_VERSION = 1;

/** SMHI marks a missing value as 9999 (any sign); treat ≥ |9000| as absent. */
const MISSING_SENTINEL = 9000;

/** A finite, non-sentinel number, or null. Never lets NaN/9999 through. */
export function cleanNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Math.abs(value) >= MISSING_SENTINEL) return null;
  return value;
}

/** cleanNumber clamped to 0–100 (probabilities). */
export function cleanPercent(value) {
  const n = cleanNumber(value);
  if (n === null) return null;
  return Math.min(100, Math.max(0, n));
}

/**
 * SMHI `predominant_precipitation_type_at_surface` (0–6) → stable app ids.
 * Unknown/missing codes normalise to null, never to a guessed type.
 */
const PRECIP_TYPES = [
  'none', // 0
  'snow', // 1
  'snow-and-rain', // 2
  'rain', // 3
  'drizzle', // 4
  'freezing-rain', // 5
  'freezing-drizzle', // 6
];

export function precipTypeFromCode(code) {
  const n = cleanNumber(code);
  if (n === null || !Number.isInteger(n)) return null;
  return PRECIP_TYPES[n] ?? null;
}

/**
 * Condition groups for the 27 SMHI symbol codes (the Wsymb2 scale, kept as
 * `symbol_code` in snow1g). The GROUP drives the icon and short label; the
 * ORDER of `CONDITION_SEVERITY` below drives "worse" comparisons. Codes are
 * data, groups are presentation vocabulary — the snapshot stores the code.
 */
const CONDITION_BY_CODE = {
  1: { group: 'clear', label: 'Clear' },
  2: { group: 'clear', label: 'Mostly clear' },
  3: { group: 'partly-cloudy', label: 'Variable clouds' },
  4: { group: 'partly-cloudy', label: 'Half clear' },
  5: { group: 'cloudy', label: 'Cloudy' },
  6: { group: 'cloudy', label: 'Overcast' },
  7: { group: 'fog', label: 'Fog' },
  8: { group: 'rain-showers', label: 'Light rain showers' },
  9: { group: 'rain-showers', label: 'Rain showers' },
  10: { group: 'rain-showers', label: 'Heavy rain showers' },
  11: { group: 'thunder', label: 'Thunderstorm' },
  12: { group: 'sleet', label: 'Light sleet showers' },
  13: { group: 'sleet', label: 'Sleet showers' },
  14: { group: 'sleet', label: 'Heavy sleet showers' },
  15: { group: 'snow', label: 'Light snow showers' },
  16: { group: 'snow', label: 'Snow showers' },
  17: { group: 'snow', label: 'Heavy snow showers' },
  18: { group: 'rain', label: 'Light rain' },
  19: { group: 'rain', label: 'Rain' },
  20: { group: 'rain', label: 'Heavy rain' },
  21: { group: 'thunder', label: 'Thunder' },
  22: { group: 'sleet', label: 'Light sleet' },
  23: { group: 'sleet', label: 'Sleet' },
  24: { group: 'sleet', label: 'Heavy sleet' },
  25: { group: 'snow', label: 'Light snowfall' },
  26: { group: 'snow', label: 'Snowfall' },
  27: { group: 'snow', label: 'Heavy snowfall' },
};

/** Symbol codes ordered mildest → most severe (index = severity rank). */
const CONDITION_SEVERITY = [
  1, 2, 3, 4, 5, 6, 7, // dry sky states, then fog
  8, 18, 9, 19, 10, 20, // rain, light → heavy (showers beside steady)
  12, 22, 13, 23, 14, 24, // sleet
  15, 25, 16, 26, 17, 27, // snow
  21, 11, // thunder, thunderstorm
];
const SEVERITY_RANK = new Map(CONDITION_SEVERITY.map((code, i) => [code, i]));

/** { group, label } for a symbol code, or null for unknown/missing codes. */
export function conditionForCode(code) {
  const n = cleanNumber(code);
  if (n === null || !Number.isInteger(n)) return null;
  return CONDITION_BY_CODE[n] ?? null;
}

export function conditionSeverity(code) {
  return SEVERITY_RANK.get(code) ?? -1;
}

// --- Swedish calendar days ---------------------------------------------------

// en-CA yields YYYY-MM-DD directly; hour12:false + 2-digit parts keep the
// hour extraction below deterministic across ICU versions.
const STOCKHOLM_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const STOCKHOLM_HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Stockholm',
  hour: '2-digit',
  hourCycle: 'h23',
});

/**
 * The Europe/Stockholm calendar date ('YYYY-MM-DD') of an ISO instant, or
 * null for an unparseable input. This is the ONE day-grouping rule for
 * forecast data; device-local grouping is deliberately not used.
 */
export function stockholmDateOf(isoInstant) {
  if (typeof isoInstant !== 'string') return null;
  const d = new Date(isoInstant);
  if (Number.isNaN(d.getTime())) return null;
  return STOCKHOLM_DATE.format(d);
}

/** The Europe/Stockholm hour (0–23) of an ISO instant, or null. */
export function stockholmHourOf(isoInstant) {
  if (typeof isoInstant !== 'string') return null;
  const d = new Date(isoInstant);
  if (Number.isNaN(d.getTime())) return null;
  return Number(STOCKHOLM_HOUR.format(d));
}

// --- Snapshot validation -----------------------------------------------------

/**
 * Validate a stored/candidate snapshot for rendering. Returns the snapshot
 * when structurally sound, null otherwise — a corrupt or future-schema
 * record renders as "no saved forecast", never as broken rows.
 */
export function normalizeWeatherSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.schemaVersion !== WEATHER_SCHEMA_VERSION) return null;
  if (typeof value.provider !== 'string' || value.provider === '') return null;
  if (stockholmDateOf(value.downloadedAt) === null) return null;
  if (stockholmDateOf(value.validThrough) === null) return null;
  if (!Array.isArray(value.locations) || value.locations.length === 0) return null;
  for (const loc of value.locations) {
    if (!loc || typeof loc.id !== 'string' || typeof loc.name !== 'string') return null;
    if (!Array.isArray(loc.slots)) return null;
  }
  return value;
}

// --- Day list and summaries --------------------------------------------------

/**
 * Which Stockholm calendar date a slot's INTERVAL quantities (precipitation
 * amount/probability) belong to: the interval midpoint when the provider
 * gave one, else the slot time. A 12-hourly slot stamped 00:00 covers the
 * PREVIOUS evening — midpoint assignment keeps its rain on the day it
 * actually falls.
 */
export function slotIntervalDate(slot) {
  const end = typeof slot?.time === 'string' ? new Date(slot.time) : null;
  if (!end || Number.isNaN(end.getTime())) return null;
  const start =
    typeof slot.intervalStart === 'string' ? new Date(slot.intervalStart) : null;
  if (!start || Number.isNaN(start.getTime()) || start >= end) {
    return stockholmDateOf(slot.time);
  }
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  return stockholmDateOf(mid.toISOString());
}

/**
 * Every Stockholm calendar date any location has data for, ascending.
 * ISO 'YYYY-MM-DD' strings sort lexicographically = chronologically.
 */
export function availableDates(snapshot) {
  const days = new Set();
  for (const loc of snapshot?.locations ?? []) {
    for (const slot of loc.slots) {
      const instant = stockholmDateOf(slot.time);
      if (instant) days.add(instant);
      const interval = slotIntervalDate(slot);
      if (interval) days.add(interval);
    }
  }
  return [...days].sort();
}

/**
 * The daily summary one location row renders for one Swedish calendar date,
 * or null when the location has NO data at all for that date (the row then
 * says "No saved forecast for this date" — never fake values).
 *
 * Semantics per field:
 *  - min/maxTempC, maxWindMs, maxGustMs — extremes over the date's
 *    instantaneous slots;
 *  - totalPrecipMm — SUM of interval mean amounts whose interval falls on
 *    the date (period amounts for ONE geographic point; never summed
 *    across locations);
 *  - maxPrecipProbabilityPct — max over the date's intervals;
 *  - precipTypes — distinct types observed (for "Rain/snow" wording);
 *  - dominantCondition — most frequent condition among daytime (06–18)
 *    slots, ties to the more severe; falls back to all of the date's slots.
 * Any field can be null when the provider had no value.
 */
export function summarizeLocationDay(location, isoDate) {
  if (!location || typeof isoDate !== 'string') return null;
  let any = false;
  let minTempC = null;
  let maxTempC = null;
  let maxWindMs = null;
  let maxGustMs = null;
  let totalPrecipMm = null;
  let maxPrecipProbabilityPct = null;
  const precipTypes = new Set();
  const conditionCounts = new Map();
  const daytimeCounts = new Map();

  for (const slot of location.slots) {
    const instantDate = stockholmDateOf(slot.time);
    if (instantDate === isoDate) {
      any = true;
      const t = cleanNumber(slot.temperatureC);
      if (t !== null) {
        minTempC = minTempC === null ? t : Math.min(minTempC, t);
        maxTempC = maxTempC === null ? t : Math.max(maxTempC, t);
      }
      const w = cleanNumber(slot.windMs);
      if (w !== null) maxWindMs = maxWindMs === null ? w : Math.max(maxWindMs, w);
      const g = cleanNumber(slot.gustMs);
      if (g !== null) maxGustMs = maxGustMs === null ? g : Math.max(maxGustMs, g);
      const code = slot.conditionCode;
      if (conditionForCode(code)) {
        const hour = stockholmHourOf(slot.time);
        conditionCounts.set(code, (conditionCounts.get(code) ?? 0) + 1);
        if (hour !== null && hour >= 6 && hour <= 18) {
          daytimeCounts.set(code, (daytimeCounts.get(code) ?? 0) + 1);
        }
      }
    }
    if (slotIntervalDate(slot) === isoDate) {
      any = true;
      const mm = cleanNumber(slot.precipMm);
      if (mm !== null) totalPrecipMm = (totalPrecipMm ?? 0) + mm;
      const p = cleanPercent(slot.precipProbabilityPct);
      if (p !== null) {
        maxPrecipProbabilityPct =
          maxPrecipProbabilityPct === null ? p : Math.max(maxPrecipProbabilityPct, p);
      }
      if (typeof slot.precipType === 'string' && slot.precipType !== 'none') {
        precipTypes.add(slot.precipType);
      }
    }
  }
  if (!any) return null;

  const pick = (counts) => {
    let best = null;
    for (const [code, count] of counts) {
      if (
        best === null ||
        count > best.count ||
        (count === best.count && conditionSeverity(code) > conditionSeverity(best.code))
      ) {
        best = { code, count };
      }
    }
    return best?.code ?? null;
  };
  const dominantCondition = pick(daytimeCounts.size ? daytimeCounts : conditionCounts);

  return {
    date: isoDate,
    minTempC,
    maxTempC,
    maxWindMs,
    maxGustMs,
    totalPrecipMm: totalPrecipMm === null ? null : Math.round(totalPrecipMm * 10) / 10,
    maxPrecipProbabilityPct,
    precipTypes: [...precipTypes],
    dominantCondition,
  };
}

/**
 * Morning / afternoon / evening sub-summaries for the expanded row —
 * derived from the SAME real slots (Stockholm hours 06–12 / 12–18 / 18–24),
 * never interpolated. A part with no slot data is null and renders "—".
 */
export const DAY_PARTS = [
  { id: 'morning', label: 'Morning', fromHour: 6, toHour: 12 },
  { id: 'afternoon', label: 'Afternoon', fromHour: 12, toHour: 18 },
  { id: 'evening', label: 'Evening', fromHour: 18, toHour: 24 },
];

export function summarizeDayParts(location, isoDate) {
  return DAY_PARTS.map((part) => {
    let tempMin = null;
    let tempMax = null;
    let wind = null;
    let gust = null;
    let precip = null;
    let code = null;
    let codeSeverity = -1;
    let any = false;
    for (const slot of location?.slots ?? []) {
      if (stockholmDateOf(slot.time) !== isoDate) continue;
      const hour = stockholmHourOf(slot.time);
      if (hour === null || hour < part.fromHour || hour >= part.toHour) continue;
      any = true;
      const t = cleanNumber(slot.temperatureC);
      if (t !== null) {
        tempMin = tempMin === null ? t : Math.min(tempMin, t);
        tempMax = tempMax === null ? t : Math.max(tempMax, t);
      }
      const w = cleanNumber(slot.windMs);
      if (w !== null) wind = wind === null ? w : Math.max(wind, w);
      const g = cleanNumber(slot.gustMs);
      if (g !== null) gust = gust === null ? g : Math.max(gust, g);
      const mm = cleanNumber(slot.precipMm);
      if (mm !== null) precip = (precip ?? 0) + mm;
      if (conditionForCode(slot.conditionCode)) {
        const sev = conditionSeverity(slot.conditionCode);
        if (sev > codeSeverity) {
          codeSeverity = sev;
          code = slot.conditionCode;
        }
      }
    }
    if (!any) return { ...part, data: null };
    return {
      ...part,
      data: {
        tempMinC: tempMin,
        tempMaxC: tempMax,
        maxWindMs: wind,
        maxGustMs: gust,
        totalPrecipMm: precip === null ? null : Math.round(precip * 10) / 10,
        conditionCode: code,
      },
    };
  });
}

// --- Freshness ---------------------------------------------------------------

/**
 * How old the saved snapshot is, in Swedish calendar days (0 = saved today).
 * Day-based on purpose: "saved yesterday evening" matters on the trail;
 * "saved 90 minutes ago" does not. Null for malformed input.
 */
export function snapshotAgeDays(downloadedAtIso, nowIso) {
  const saved = parseIsoDate(stockholmDateOf(downloadedAtIso));
  const today = parseIsoDate(stockholmDateOf(nowIso));
  if (!saved || !today) return null;
  const savedUtc = Date.UTC(saved.year, saved.month - 1, saved.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.round((todayUtc - savedUtc) / 86400000);
}

/**
 * The quiet age notice for a saved snapshot: null while saved today (the
 * status line already says "Saved today HH:mm"), then wording that never
 * presents old weather as current but stays informative, not alarmist.
 */
export function freshnessNotice(downloadedAtIso, nowIso) {
  const age = snapshotAgeDays(downloadedAtIso, nowIso);
  if (age === null || age <= 0) return null;
  if (age === 1) return 'Forecast saved yesterday';
  return `Saved forecast is ${age} days old`;
}

/** 'stale' from two days on — drives the notice's visual weight only. */
export function freshnessLevel(downloadedAtIso, nowIso) {
  const age = snapshotAgeDays(downloadedAtIso, nowIso);
  if (age === null || age <= 0) return 'fresh';
  return age === 1 ? 'aging' : 'stale';
}

// --- Display labels ----------------------------------------------------------

const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Date-chip label: 'Today' for the current Swedish date, else 'Thu 4'.
 * Pure calendar arithmetic on the date parts — no UTC parsing.
 */
export function dateChipLabel(isoDate, todayIsoDate) {
  if (isoDate === todayIsoDate) return 'Today';
  const p = parseIsoDate(isoDate);
  if (!p) return isoDate;
  return `${WEEKDAYS_SHORT[weekdayIndex(p.year, p.month, p.day)]} ${p.day}`;
}

/** '13 Sep' — the "Forecast through" wording. */
export function shortDateLabel(isoDate) {
  const p = parseIsoDate(isoDate);
  if (!p) return isoDate ?? '—';
  return `${p.day} ${MONTHS_SHORT[p.month - 1]}`;
}

/**
 * '4–10°C' (en dash), or '−2 to 5°C' once a bound is negative — a minus
 * sign directly beside an en dash is unreadable. '—' when a bound is
 * missing; a single known value renders alone ('6°C'), never invented.
 */
export function formatTempRange(minC, maxC) {
  if (minC === null && maxC === null) return '—';
  const f = (n) => `${Math.round(n)}`.replace('-', '−');
  if (minC === null || maxC === null) return `${f(minC ?? maxC)}°C`;
  const lo = Math.round(minC);
  const hi = Math.round(maxC);
  if (lo === hi) return `${f(lo)}°C`;
  return lo < 0 || hi < 0 ? `${f(lo)} to ${f(hi)}°C` : `${lo}–${hi}°C`;
}

/** Wind line: 'Wind 5 m/s · gust 10' ('—' pieces when missing). */
export function formatWind(windMs, gustMs) {
  if (windMs === null && gustMs === null) return null;
  const w = windMs === null ? '—' : Math.round(windMs);
  const g = gustMs === null ? '—' : Math.round(gustMs);
  return `Wind ${w} m/s · gust ${g}`;
}

/**
 * Precipitation line: 'Rain 40% · 1.5 mm', 'Rain/snow 60%', or null when
 * nothing is known. Sub-0.1 mm totals read as dry — no '0 mm' noise.
 */
export function formatPrecip(summary) {
  if (!summary) return null;
  const { maxPrecipProbabilityPct: prob, totalPrecipMm: mm, precipTypes } = summary;
  if (prob === null && (mm === null || mm < 0.1)) return null;
  const hasSnow = precipTypes.some((t) => t.includes('snow'));
  const hasRain = precipTypes.some(
    (t) => t.includes('rain') || t.includes('drizzle'),
  );
  const word = hasSnow && hasRain ? 'Rain/snow' : hasSnow ? 'Snow' : 'Rain';
  const parts = [];
  if (prob !== null) parts.push(`${word} ${Math.round(prob)}%`);
  if (mm !== null && mm >= 0.1) {
    parts.push(prob !== null ? `${mm} mm` : `${word} ${mm} mm`);
  }
  return parts.join(' · ');
}
