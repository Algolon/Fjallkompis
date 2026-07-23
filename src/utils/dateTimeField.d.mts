export interface DateParts {
  year: number;
  month: number;
  day: number;
}
export interface MonthRef {
  year: number;
  month: number;
}
export interface TimeParts {
  hour: number;
  minute: number;
}

export declare const WEEKDAY_HEADERS: string[];

export declare function pad2(n: number): string;
export declare function isLeapYear(year: number): boolean;
export declare function daysInMonth(year: number, month: number): number;
export declare function parseIsoDate(v: unknown): DateParts | null;
export declare function isRealIsoDate(v: unknown): boolean;
export declare function toIsoDate(year: number, month: number, day: number): string;
export declare function weekdayIndex(year: number, month: number, day: number): number;
export declare function buildMonthGrid(year: number, month: number): (number | null)[][];
export declare function addMonths(year: number, month: number, delta: number): MonthRef;
export declare function clampDay(year: number, month: number, day: number): number;
export declare function addDays(year: number, month: number, day: number, delta: number): DateParts;
export declare function formatMonthTitle(year: number, month: number): string;
export declare function formatDateFieldLabel(iso: unknown): string | null;
export declare function formatDayAria(year: number, month: number, day: number): string;

export declare function parseIsoTime(v: unknown): TimeParts | null;
export declare function isValidHour(n: number): boolean;
export declare function isValidMinute(n: number): boolean;
export declare function toIsoTime(hour: number, minute: number): string;
export declare function parseHourText(text: string): number | null;
export declare function parseMinuteText(text: string): number | null;
export declare function stepHour(hour: number | null, direction: 1 | -1): number;
export declare function stepMinute(minute: number | null, direction: 1 | -1): number;
