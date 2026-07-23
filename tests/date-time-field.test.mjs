/**
 * Pure calendar/time math behind the app-owned date and time field dialogs.
 *
 * These helpers own the correctness the native pickers used to provide:
 * Gregorian month lengths, leap years, Monday-first alignment, month
 * boundaries, strict ISO parsing (a stored '2027-02-29' must never place
 * the calendar on a day that doesn't exist) and 24-hour time validation
 * with preserved leading zeroes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WEEKDAY_HEADERS,
  addDays,
  addMonths,
  buildMonthGrid,
  clampDay,
  daysInMonth,
  formatDateFieldLabel,
  formatDayAria,
  formatMonthTitle,
  isLeapYear,
  isRealIsoDate,
  pad2,
  parseHourText,
  parseIsoDate,
  parseIsoTime,
  parseMinuteText,
  stepHour,
  stepMinute,
  toIsoDate,
  toIsoTime,
  weekdayIndex,
} from '../src/utils/dateTimeField.mjs';

test('leap years: divisible-by-4 rule with the century exceptions', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(2000), true, 'divisible by 400');
  assert.equal(isLeapYear(1900), false, 'century but not by 400');
  assert.equal(isLeapYear(2100), false);
});

test('month lengths incl. February in and out of leap years', () => {
  assert.deepEqual(
    Array.from({ length: 12 }, (_, i) => daysInMonth(2026, i + 1)),
    [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
  );
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(1900, 2), 28);
});

test('weeks are Monday-first and the grid aligns real weekdays', () => {
  assert.deepEqual(WEEKDAY_HEADERS, ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  // Known anchors: 1 July 2026 is a Wednesday; 1 June 2026 a Monday;
  // 28 February 2026 a Saturday.
  assert.equal(weekdayIndex(2026, 7, 1), 2);
  assert.equal(weekdayIndex(2026, 6, 1), 0);
  assert.equal(weekdayIndex(2026, 2, 28), 5);
});

test('month grid: leading blanks, full weeks, every day exactly once', () => {
  const july = buildMonthGrid(2026, 7);
  assert.equal(july[0][2], 1, 'July 2026 starts in the Wednesday column');
  assert.deepEqual(july[0].slice(0, 2), [null, null]);
  for (const week of july) assert.equal(week.length, 7);
  const days = july.flat().filter((d) => d !== null);
  assert.deepEqual(days, Array.from({ length: 31 }, (_, i) => i + 1));
  // June 2026 starts on Monday: no leading blanks, exactly 5 rows.
  const june = buildMonthGrid(2026, 6);
  assert.equal(june[0][0], 1);
  assert.equal(june.length, 5);
  // February 2026 (28 days, starts Sunday): leading blanks push it to 5 rows.
  const feb = buildMonthGrid(2026, 2);
  assert.equal(feb[0][6], 1);
  assert.equal(feb.flat().filter((d) => d !== null).length, 28);
});

test('previous/next month arithmetic crosses year boundaries', () => {
  assert.deepEqual(addMonths(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(addMonths(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(addMonths(2026, 7, -19), { year: 2024, month: 12 });
  assert.deepEqual(addMonths(2026, 7, 0), { year: 2026, month: 7 });
  // Month paging keeps the focused day real: 31 Jan -> 28 Feb.
  assert.equal(clampDay(2026, 2, 31), 28);
  assert.equal(clampDay(2024, 2, 31), 29);
  assert.equal(clampDay(2026, 4, 31), 30);
  assert.equal(clampDay(2026, 3, 15), 15);
});

test('day arithmetic crosses month and year boundaries (keyboard nav)', () => {
  assert.deepEqual(addDays(2026, 7, 31, 1), { year: 2026, month: 8, day: 1 });
  assert.deepEqual(addDays(2026, 3, 1, -1), { year: 2026, month: 2, day: 28 });
  assert.deepEqual(addDays(2024, 3, 1, -1), { year: 2024, month: 2, day: 29 });
  assert.deepEqual(addDays(2026, 12, 29, 7), { year: 2027, month: 1, day: 5 });
});

test('ISO date parsing is strict: shape AND a real calendar day', () => {
  assert.deepEqual(parseIsoDate('2026-07-23'), { year: 2026, month: 7, day: 23 });
  assert.equal(parseIsoDate('2026-02-30'), null, 'day beyond month length');
  assert.equal(parseIsoDate('2027-02-29'), null, 'leap day outside a leap year');
  assert.deepEqual(parseIsoDate('2024-02-29'), { year: 2024, month: 2, day: 29 });
  for (const bad of ['', '2026-7-3', '23-07-2026', '2026-13-01', '2026-00-10', '2026-01-00', 'garbage', null, undefined, 20260723]) {
    assert.equal(parseIsoDate(bad), null, `rejects ${String(bad)}`);
    assert.equal(isRealIsoDate(bad), false);
  }
});

test('ISO round-trip preserves zero-padding', () => {
  assert.equal(toIsoDate(2026, 7, 3), '2026-07-03');
  assert.equal(toIsoDate(2026, 11, 30), '2026-11-30');
  assert.equal(pad2(0), '00');
  assert.equal(pad2(9), '09');
  assert.equal(pad2(23), '23');
  const iso = '2026-01-05';
  const p = parseIsoDate(iso);
  assert.equal(toIsoDate(p.year, p.month, p.day), iso);
});

test('display labels are fixed English and unambiguous', () => {
  assert.equal(formatMonthTitle(2026, 7), 'July 2026');
  assert.equal(formatDateFieldLabel('2026-07-23'), 'Thu 23 Jul 2026');
  assert.equal(formatDateFieldLabel('2026-02-31'), null, 'malformed stored value degrades to empty, not garbage');
  assert.equal(formatDayAria(2026, 7, 23), 'Thursday 23 July 2026');
});

test('time parsing: 24-hour boundaries, strict shape', () => {
  assert.deepEqual(parseIsoTime('00:00'), { hour: 0, minute: 0 });
  assert.deepEqual(parseIsoTime('23:59'), { hour: 23, minute: 59 });
  for (const bad of ['24:00', '12:60', '7:30', '07:5', '0730', '', null, '12:34:56', '-1:00']) {
    assert.equal(parseIsoTime(bad), null, `rejects ${String(bad)}`);
  }
});

test('typed field text: 1–2 digits, range-checked, nothing else', () => {
  assert.equal(parseHourText('7'), 7);
  assert.equal(parseHourText('07'), 7);
  assert.equal(parseHourText('23'), 23);
  assert.equal(parseHourText('24'), null);
  assert.equal(parseMinuteText('0'), 0);
  assert.equal(parseMinuteText('59'), 59);
  assert.equal(parseMinuteText('60'), null);
  for (const bad of ['', ' 7', '7 ', '1a', '123', '-1']) {
    assert.equal(parseHourText(bad), null);
    assert.equal(parseMinuteText(bad), null);
  }
});

test('commit formatting preserves leading zeroes', () => {
  assert.equal(toIsoTime(7, 5), '07:05');
  assert.equal(toIsoTime(0, 0), '00:00');
  assert.equal(toIsoTime(23, 59), '23:59');
});

test('hour stepper wraps; first press on empty materialises midday', () => {
  assert.equal(stepHour(11, 1), 12);
  assert.equal(stepHour(23, 1), 0);
  assert.equal(stepHour(0, -1), 23);
  assert.equal(stepHour(null, 1), 12);
  assert.equal(stepHour(null, -1), 12);
});

test('minute stepper: ±5, direction-snapped from odd values, hour-edge wrap', () => {
  assert.equal(stepMinute(30, 1), 35);
  assert.equal(stepMinute(30, -1), 25);
  assert.equal(stepMinute(32, 1), 35, 'snaps up to the next multiple');
  assert.equal(stepMinute(32, -1), 30, 'snaps down to the previous multiple');
  assert.equal(stepMinute(55, 1), 0);
  assert.equal(stepMinute(0, -1), 55);
  assert.equal(stepMinute(58, 1), 0, 'snap past the edge wraps too');
  assert.equal(stepMinute(null, 1), 0);
  assert.equal(stepMinute(null, -1), 0);
});
