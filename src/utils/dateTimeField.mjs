/**
 * Pure helpers for the app-owned date and time field dialogs (Stage 1 of the
 * custom picker system — see docs/proposals/datetime-picker-system.md).
 *
 * Conventions:
 *  - Stored values stay exactly what the native inputs emitted: 'YYYY-MM-DD'
 *    and 'HH:mm' (24-hour). These helpers never introduce another wire shape.
 *  - `month` and `day` are 1-based everywhere in this module (January = 1).
 *    The JS Date 0-based month never leaks past an internal call site.
 *  - Weeks are Monday-first (index 0 = Monday), matching Swedish/European
 *    calendars on a Kungsleden app.
 *  - Display names are fixed English — the app's UI language — so labels are
 *    deterministic offline and in tests, independent of browser locale.
 *  - No `new Date('YYYY-MM-DD')` string parsing anywhere: that form is UTC
 *    in ES2015+ and shifts a calendar day in western timezones. Dates are
 *    built from numeric parts only.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/** Column headers for the calendar grid, Monday first. */
export const WEEKDAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a month; `month` is 1–12. */
export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strict parse of a stored 'YYYY-MM-DD' into numeric parts, or null.
 * Stricter than the storage regex: the day must exist in that month
 * ('2027-02-29' is rejected), so a malformed stored value can never place
 * the calendar on a day that isn't real.
 */
export function parseIsoDate(v) {
  if (typeof v !== 'string') return null;
  const m = DATE_RE.exec(v);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** True for a stored date string that is also a real calendar day. */
export function isRealIsoDate(v) {
  return parseIsoDate(v) !== null;
}

/** Numeric parts -> 'YYYY-MM-DD' (zero-padded). */
export function toIsoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/** Monday-first weekday index (0 = Monday … 6 = Sunday) for a real date. */
export function weekdayIndex(year, month, day) {
  // Local Date built from numeric parts — calendar-safe (no UTC parsing).
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

/**
 * The month as rows of 7 cells, Monday-first: `null` for leading/trailing
 * blanks, a day number otherwise. Always 4–6 rows of exactly 7.
 */
export function buildMonthGrid(year, month) {
  const lead = weekdayIndex(year, month, 1);
  const days = daysInMonth(year, month);
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Shift a (year, month) pair by whole months; month stays 1–12. */
export function addMonths(year, month, delta) {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: ((zero % 12) + 12) % 12 + 1 };
}

/** Keep a day-of-month valid after a month change (31 Jan -> 28 Feb). */
export function clampDay(year, month, day) {
  return Math.min(day, daysInMonth(year, month));
}

/** Shift a full date by days, crossing month/year boundaries correctly. */
export function addDays(year, month, day, delta) {
  const d = new Date(year, month - 1, day + delta);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/** "July 2026" — the calendar header. */
export function formatMonthTitle(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}

/** "Wed 22 Jul 2026" — the closed field. Null when the value isn't a real date. */
export function formatDateFieldLabel(iso) {
  const p = parseIsoDate(iso);
  if (!p) return null;
  const wd = WEEKDAYS[weekdayIndex(p.year, p.month, p.day)].slice(0, 3);
  return `${wd} ${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}`;
}

/** "Wednesday 22 July 2026" — a day button's accessible name. */
export function formatDayAria(year, month, day) {
  return `${WEEKDAYS[weekdayIndex(year, month, day)]} ${day} ${MONTHS[month - 1]} ${year}`;
}

// --- Time (24-hour 'HH:mm') --------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Strict parse of a stored 'HH:mm' into numbers, or null. */
export function parseIsoTime(v) {
  if (typeof v !== 'string') return null;
  const m = TIME_RE.exec(v);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

export function isValidHour(n) {
  return Number.isInteger(n) && n >= 0 && n <= 23;
}

export function isValidMinute(n) {
  return Number.isInteger(n) && n >= 0 && n <= 59;
}

/** Numbers -> 'HH:mm' (zero-padded). Caller guarantees validity. */
export function toIsoTime(hour, minute) {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/**
 * Field text -> hour number or null. Accepts what a person types into a
 * two-digit box ('7', '07', '19'); rejects empty, non-digits and 24+.
 */
export function parseHourText(text) {
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  return isValidHour(n) ? n : null;
}

/** Field text -> minute number or null (same shape rules as hours). */
export function parseMinuteText(text) {
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  return isValidMinute(n) ? n : null;
}

/**
 * Stepper behaviour, hour column: ±1 with wrap-around (23 ▲ -> 0, 0 ▼ -> 23).
 * From an empty field the FIRST press materialises a starting value (12,
 * midday) without stepping — so the tap that makes a number appear never
 * also changes it.
 */
export function stepHour(hour, direction) {
  if (hour === null) return 12;
  return ((hour + direction) % 24 + 24) % 24;
}

/**
 * Stepper behaviour, minute column: ±5 snapped to the nearest multiple in
 * the pressed direction (32 ▲ -> 35, 32 ▼ -> 30), wrap-around at the hour
 * edge (55 ▲ -> 0, 0 ▼ -> 55). Typed values stay exact — snapping only
 * happens on a stepper press. Empty materialises 0 first.
 */
export function stepMinute(minute, direction) {
  if (minute === null) return 0;
  let next;
  if (minute % 5 !== 0) {
    next = direction > 0 ? Math.ceil(minute / 5) * 5 : Math.floor(minute / 5) * 5;
  } else {
    next = minute + direction * 5;
  }
  return ((next % 60) + 60) % 60;
}
