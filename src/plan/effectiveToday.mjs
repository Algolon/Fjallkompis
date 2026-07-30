/**
 * Day plan — which planned day, if any, Today shows.
 *
 * ONE resolution, in a fixed precedence, used by every surface that has to
 * answer "what is today":
 *
 *   1. `currentDayId` points at a planned day  → that day, as an explicit
 *      MANUAL OVERRIDE. The user chose it (Stages → "Set as current"), so it
 *      outranks the calendar.
 *   2. the device's local calendar date equals a planned day's date → that
 *      day. Derived only: nothing is written back, and the plan is never
 *      created, moved or reshaped by the system clock.
 *   3. otherwise → no planned day, and Today renders its original,
 *      date-independent experience from `currentStageId`.
 *
 * So a plan that has not started yet, one that has finished, a gap date inside
 * a plan whose days are not consecutive, and a pointer left dangling by an
 * edit all land on (3) — a populated generic Today. A Day plan existing can
 * never blank the Today page.
 *
 * Dates are compared as 'YYYY-MM-DD' STRINGS, both sides being local calendar
 * days (see `localIsoDate`): a planned day's date is stored as the user's own
 * calendar day, and the clock read reports the device's calendar day, so the
 * comparison never crosses a timezone boundary. No Date object, no UTC
 * instant and no offset arithmetic takes part in it.
 *
 * `todayIso` is INJECTED (the tripModel/walletModel convention), so the whole
 * resolution is pure and testable and the app keeps exactly one clock read.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` exercises it directly.
 */
import { isRealIsoDate } from '../utils/dateTimeField.mjs';

/**
 * How the day Today shows was resolved:
 *   'override' the user's own current-day pointer;
 *   'date'     the device's local calendar date matched a planned day;
 *   'generic'  no planned day applies — the date-independent Today.
 */
export const TODAY_SOURCES = ['override', 'date', 'generic'];

const NONE = { day: null, source: 'generic' };

/** The planned day whose derived date is exactly `iso`, or null. */
export function plannedDayForDate(days, iso) {
  if (!Array.isArray(days) || !isRealIsoDate(iso)) return null;
  return days.find((d) => d.date === iso) ?? null;
}

/**
 * Resolve the effective Today.
 *
 * @param {ReadonlyArray<object>} days  Derived planned days (empty when there
 *   is no plan — the canonical default state).
 * @param {string|null} currentDayId    The plan's own manual pointer.
 * @param {string|null} todayIso        The device's local calendar date.
 * @returns {{ day: object|null, source: 'override'|'date'|'generic' }}
 */
export function resolveEffectiveToday(days, currentDayId, todayIso) {
  if (!Array.isArray(days) || days.length === 0) return NONE;

  // 1. An explicit manual override wins — including over a different date
  //    matching, which is the whole point of being able to override.
  if (typeof currentDayId === 'string' && currentDayId !== '') {
    const chosen = days.find((d) => d.id === currentDayId);
    if (chosen) return { day: chosen, source: 'override' };
    // A dangling pointer is not an error state: it falls through to the date
    // match and then to the generic Today, exactly like no pointer at all.
  }

  // 2. Today's local calendar date, matched exactly against a planned date.
  const matched = plannedDayForDate(days, todayIso);
  if (matched) return { day: matched, source: 'date' };

  // 3. Before the plan, after it, or on a date it does not cover.
  return NONE;
}
