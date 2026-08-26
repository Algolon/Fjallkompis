export declare const WEATHER_SCHEMA_VERSION: 1;

export type PrecipType =
  | 'none'
  | 'snow'
  | 'snow-and-rain'
  | 'rain'
  | 'drizzle'
  | 'freezing-rain'
  | 'freezing-drizzle';

export type ConditionGroup =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'rain-showers'
  | 'rain'
  | 'sleet'
  | 'snow'
  | 'thunder';

export interface WeatherSlot {
  time: string;
  intervalStart: string | null;
  temperatureC: number | null;
  windMs: number | null;
  gustMs: number | null;
  precipProbabilityPct: number | null;
  precipMm: number | null;
  precipType: PrecipType | null;
  conditionCode: number | null;
}

export interface WeatherLocationForecast {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationM: number | null;
  slots: WeatherSlot[];
}

export interface WeatherSnapshot {
  schemaVersion: 1;
  provider: string;
  downloadedAt: string;
  forecastIssuedAt: string | null;
  validThrough: string;
  locations: WeatherLocationForecast[];
}

export interface WeatherDaySummary {
  date: string;
  minTempC: number | null;
  maxTempC: number | null;
  maxWindMs: number | null;
  maxGustMs: number | null;
  totalPrecipMm: number | null;
  maxPrecipProbabilityPct: number | null;
  precipTypes: PrecipType[];
  dominantCondition: number | null;
}

export interface WeatherDayPart {
  id: 'morning' | 'afternoon' | 'evening';
  label: string;
  fromHour: number;
  toHour: number;
  data: {
    tempMinC: number | null;
    tempMaxC: number | null;
    maxWindMs: number | null;
    maxGustMs: number | null;
    totalPrecipMm: number | null;
    conditionCode: number | null;
  } | null;
}

export declare function cleanNumber(value: unknown): number | null;
export declare function cleanPercent(value: unknown): number | null;
export declare function precipTypeFromCode(code: unknown): PrecipType | null;
export declare function conditionForCode(
  code: unknown,
): { group: ConditionGroup; label: string } | null;
export declare function conditionSeverity(code: number): number;
export declare function stockholmDateOf(isoInstant: string): string | null;
export declare function stockholmHourOf(isoInstant: string): number | null;
export declare function normalizeWeatherSnapshot(value: unknown): WeatherSnapshot | null;
export declare function slotIntervalDate(slot: WeatherSlot): string | null;
export declare function availableDates(snapshot: WeatherSnapshot | null): string[];
export declare function summarizeLocationDay(
  location: WeatherLocationForecast,
  isoDate: string,
): WeatherDaySummary | null;
export declare const DAY_PARTS: ReadonlyArray<Omit<WeatherDayPart, 'data'>>;
export declare function summarizeDayParts(
  location: WeatherLocationForecast,
  isoDate: string,
): WeatherDayPart[];
export declare function snapshotAgeDays(
  downloadedAtIso: string,
  nowIso: string,
): number | null;
export declare function freshnessNotice(
  downloadedAtIso: string,
  nowIso: string,
): string | null;
export declare function freshnessLevel(
  downloadedAtIso: string,
  nowIso: string,
): 'fresh' | 'aging' | 'stale';
export declare function dateChipLabel(isoDate: string, todayIsoDate: string): string;
export declare function shortDateLabel(isoDate: string | null): string;
export declare function formatTempRange(
  minC: number | null,
  maxC: number | null,
): string;
export declare function formatWind(
  windMs: number | null,
  gustMs: number | null,
): string | null;
export declare function formatPrecip(
  summary: WeatherDaySummary | null,
): string | null;
