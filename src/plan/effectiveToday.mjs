/**
 * Day plan — which planned day, if any, Today shows.
 *
 * ONE resolution, in a fixed precedence, used by every surface that has to
 * answer "what is today":
 *
 *   1. `previewDayId` points at a planned day → that day, as a TRANSIENT
 *      PREVIEW (Settings → Preview). Presentation only: it lives in runtime
 *      memory, is never persisted, and implies nothing about where the user
 *      actually is — it exists so a future or past planned day can be
 *      inspected in its Today presentation.
 *   2. `currentDayId` points at a planned day  → that day, as an explicit
 *      MANUAL OVERRIDE. The user chose it (Stages → "Set as current"), so it
 *      outranks the calendar.
 *   3. the device's local calendar date equals a planned day's date → that
 *      day. Derived only: nothing is written back, and the plan is never
 *      created, moved or reshaped by the system clock.
 *   4. otherwise → no planned day, and Today renders its original,
 *      date-independent experience from `currentStageId`.
 *
 * So a plan that has not started yet, one that has finished, a gap date inside
 * a plan whose days are not consecutive, and a pointer left dangling by an
 * edit all land on (4) — a populated generic Today. A Day plan existing can
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
 *   'preview'  a transient, never-persisted preview of a planned day;
 *   'override' the user's own current-day pointer;
 *   'date'     the device's local calendar date matched a planned day;
 *   'generic'  no planned day applies — the date-independent Today.
 */
export const TODAY_SOURCES = ['preview', 'override', 'date', 'generic'];

const NONE = { day: null, source: 'generic' };

/** The planned day whose derived date is exactly `iso`, or null. */
export function plannedDayForDate(days, iso) {
  if (!Array.isArray(days) || !isRealIsoDate(iso)) return null;
  return days.find((d) => d.date === iso) ?? null;
}

/** A day id resolved against the derived days, or null. */
function dayById(days, id) {
  if (typeof id !== 'string' || id === '') return null;
  return days.find((d) => d.id === id) ?? null;
}

/**
 * Resolve the effective Today.
 *
 * @param {ReadonlyArray<object>} days  Derived planned days (empty when there
 *   is no plan — the canonical default state).
 * @param {string|null} previewDayId    The TRANSIENT preview pointer (runtime
 *   memory only — never persisted, cleared by reload).
 * @param {string|null} currentDayId    The plan's own manual pointer.
 * @param {string|null} todayIso        The device's local calendar date.
 * @returns {{ day: object|null, source: 'preview'|'override'|'date'|'generic' }}
 */
export function resolveEffectiveToday(days, previewDayId, currentDayId, todayIso) {
  if (!Array.isArray(days) || days.length === 0) return NONE;

  // 1. A transient preview outranks everything WHILE it is being shown — it
  //    is presentation, not progress, and exiting it reveals 2–4 unchanged.
  //    A dangling preview id (the previewed day was deleted) falls through
  //    silently, exactly like a dangling manual pointer.
  const previewed = dayById(days, previewDayId);
  if (previewed) return { day: previewed, source: 'preview' };

  // 2. An explicit manual override wins — including over a different date
  //    matching, which is the whole point of being able to override.
  const chosen = dayById(days, currentDayId);
  if (chosen) return { day: chosen, source: 'override' };

  // 3. Today's local calendar date, matched exactly against a planned date.
  const matched = plannedDayForDate(days, todayIso);
  if (matched) return { day: matched, source: 'date' };

  // 4. Before the plan, after it, or on a date it does not cover.
  return NONE;
}
