/**
 * Hiking days — the pure day-plan model.
 *
 * A canonical STAGE is a fixed geographical route segment (verified GPX,
 * statistics, guide content, highlights, detours). A PLANNED HIKING DAY is a
 * personal scheduling decision: one or more ADJACENT canonical stages walked
 * on the same calendar day. This module owns that second concept and nothing
 * else — it never sees geometry, never mutates canonical data, and never
 * knows a stage id.
 *
 * The persisted shape is deliberately three primitives:
 *
 *   { direction, firstDate, groups }
 *
 * `groups` is a PARTITION of the active ordered stage sequence: the number of
 * adjacent stages in each planned day, in walking order. Storing counts rather
 * than stage-id arrays is what makes the product invariants structural instead
 * of validated:
 *   - every stage appears exactly once      (sum(groups) === stage count);
 *   - stage order is preserved              (a partition cannot reorder);
 *   - only adjacent stages share a day      (a partition cannot skip);
 *   - every day holds at least one stage    (every group >= 1);
 * so a skipped, duplicated or reordered stage is not representable at all.
 *
 * Everything else — day numbers, dates, endpoints, via-stops, totals,
 * elevation profiles, which day is current — is DERIVED at runtime
 * (src/plan/plannedDays.ts), exactly like the direction-derived active
 * itinerary is derived from the persisted `routeDirection`.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` exercises
 * the model directly — the same convention as routeProgress.mjs /
 * stateMigration.mjs / tripModel.mjs.
 */
import { addDays, isRealIsoDate, parseIsoDate, toIsoDate } from '../utils/dateTimeField.mjs';
import { isRouteDirection, normalizeDirection } from '../route/direction.mjs';

/**
 * The default plan: one canonical stage per hiking day. Derived from the ACTUAL
 * stage count of the active itinerary — never a hardcoded seven.
 */
export function defaultGroups(stageCount) {
  if (!Number.isInteger(stageCount) || stageCount < 1) return [];
  return new Array(stageCount).fill(1);
}

/** Sum of a groups array (0 for anything that isn't an array). */
export function groupsTotal(groups) {
  if (!Array.isArray(groups)) return 0;
  let total = 0;
  for (const n of groups) {
    if (!Number.isInteger(n)) return NaN;
    total += n;
  }
  return total;
}

/**
 * True when `groups` is a valid partition of `stageCount` adjacent stages:
 * a non-empty array of integers >= 1 summing to exactly the stage count.
 * Fractional, negative, zero, non-number and non-finite entries all fail.
 */
export function isValidGroups(groups, stageCount) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  if (!Number.isInteger(stageCount) || stageCount < 1) return false;
  let total = 0;
  for (const n of groups) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return false;
    total += n;
  }
  return total === stageCount;
}

/** True when the plan is in its default one-stage-per-day grouping. */
export function isDefaultGrouping(groups, stageCount) {
  return isValidGroups(groups, stageCount) && groups.length === stageCount;
}

/**
 * Index of the planned day containing the stage at `stageIndex` (both
 * 0-based, in walking order), or -1 when the index falls outside the plan.
 */
export function dayIndexForStageIndex(groups, stageIndex) {
  if (!Array.isArray(groups)) return -1;
  if (!Number.isInteger(stageIndex) || stageIndex < 0) return -1;
  let seen = 0;
  for (let day = 0; day < groups.length; day++) {
    seen += groups[day];
    if (stageIndex < seen) return day;
  }
  return -1;
}

/** Index of the FIRST stage (0-based, walking order) of planned day `dayIndex`. */
export function firstStageIndexOfDay(groups, dayIndex) {
  if (!Array.isArray(groups)) return -1;
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= groups.length) return -1;
  let offset = 0;
  for (let day = 0; day < dayIndex; day++) offset += groups[day];
  return offset;
}

/**
 * Boundary states between consecutive canonical stages, in walking order.
 *
 * There is one boundary per stage junction — `stageCount - 1` of them — and a
 * boundary is ACTIVE when a hiking day ends there. Boundary `i` sits between
 * the stages at index `i` and `i + 1`.
 *
 * Each entry carries what a control needs without recomputing the partition:
 *   { stageIndex, active, dayIndex }
 * where `dayIndex` is the planned day the boundary sits inside (when removed)
 * or the day that ENDS there (when active).
 */
export function boundaryStates(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return [];
  const out = [];
  let stageIndex = 0;
  for (let day = 0; day < groups.length; day++) {
    for (let within = 0; within < groups[day]; within++) {
      // The junction AFTER this stage; the very last stage has no boundary.
      const isLastOfDay = within === groups[day] - 1;
      const isLastDay = day === groups.length - 1;
      if (isLastOfDay && isLastDay) break;
      out.push({ stageIndex, active: isLastOfDay, dayIndex: day });
      stageIndex++;
    }
    if (day === groups.length - 1) break;
  }
  return out;
}

/**
 * Remove the boundary after the stage at `stageIndex`: the day ending there
 * merges with the following day. Returns a NEW array; the input is never
 * mutated. A no-op (returns an equal copy) when the boundary is already
 * removed or the index is out of range.
 */
export function combineAt(groups, stageIndex) {
  if (!Array.isArray(groups)) return [];
  const boundary = boundaryStates(groups).find((b) => b.stageIndex === stageIndex);
  if (!boundary || !boundary.active) return [...groups];
  const day = boundary.dayIndex;
  if (day + 1 >= groups.length) return [...groups];
  const next = [...groups];
  next.splice(day, 2, groups[day] + groups[day + 1]);
  return next;
}

/**
 * Add a boundary after the stage at `stageIndex`: the day containing it is
 * split in two there. Returns a NEW array; the input is never mutated. A
 * no-op (returns an equal copy) when the boundary already exists or the index
 * is out of range.
 */
export function splitAt(groups, stageIndex) {
  if (!Array.isArray(groups)) return [];
  const boundary = boundaryStates(groups).find((b) => b.stageIndex === stageIndex);
  if (!boundary || boundary.active) return [...groups];
  const day = boundary.dayIndex;
  const dayStart = firstStageIndexOfDay(groups, day);
  const left = stageIndex - dayStart + 1;
  const right = groups[day] - left;
  if (left < 1 || right < 1) return [...groups];
  const next = [...groups];
  next.splice(day, 1, left, right);
  return next;
}

/**
 * Toggle the boundary after the stage at `stageIndex`. Combining and splitting
 * are exact inverses, so one control can express both directions of the same
 * decision. Returns a NEW array; the input is never mutated.
 */
export function toggleBoundary(groups, stageIndex) {
  if (!Array.isArray(groups)) return [];
  const boundary = boundaryStates(groups).find((b) => b.stageIndex === stageIndex);
  if (!boundary) return [...groups];
  return boundary.active ? combineAt(groups, stageIndex) : splitAt(groups, stageIndex);
}

/**
 * The calendar date of planned day `dayIndex` (0-based): `firstDate` shifted
 * by whole days. Dates in this version assume CONSECUTIVE hiking days — there
 * are no rest or travel days to skip over. Null for a malformed first date.
 *
 * Numeric parts only (see dateTimeField.mjs): never `new Date('YYYY-MM-DD')`,
 * which parses as UTC and shifts a calendar day in western timezones.
 */
export function dateForDayIndex(firstDate, dayIndex) {
  const parts = parseIsoDate(firstDate);
  if (!parts) return null;
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null;
  const shifted = addDays(parts.year, parts.month, parts.day, dayIndex);
  return toIsoDate(shifted.year, shifted.month, shifted.day);
}

/** A fresh default plan for a direction, first date and stage count. */
export function createDayPlan(direction, firstDate, stageCount) {
  if (!isRealIsoDate(firstDate)) return null;
  if (!Number.isInteger(stageCount) || stageCount < 1) return null;
  return {
    direction: normalizeDirection(direction),
    firstDate,
    groups: defaultGroups(stageCount),
  };
}

/**
 * Validate + repair a persisted or imported day plan. Never throws, never
 * mutates its input, and never returns a half-valid plan:
 *
 *   - not an object / absent            → null (no plan; existing behaviour);
 *   - malformed or unreal first date    → null (the date is the plan's anchor);
 *   - unknown direction                 → null;
 *   - stored direction ≠ ACTIVE         → keep the date, adopt the active
 *                                         direction, reset to default groups.
 *                                         A grouping authored for one walking
 *                                         direction is never silently applied
 *                                         to the other one;
 *   - invalid groups (wrong sum, empty
 *     day, fractional, negative, …)     → keep the date and direction, reset
 *                                         to default groups.
 *
 * @param {unknown} raw
 * @param {string} activeDirection  The direction the app is currently in.
 * @param {number} stageCount       Stage count of the active itinerary.
 */
export function normalizeDayPlan(raw, activeDirection, stageCount) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Number.isInteger(stageCount) || stageCount < 1) return null;
  if (!isRealIsoDate(raw.firstDate)) return null;
  if (!isRouteDirection(raw.direction)) return null;

  const active = normalizeDirection(activeDirection);
  const sameDirection = raw.direction === active;
  const groups =
    sameDirection && isValidGroups(raw.groups, stageCount)
      ? [...raw.groups]
      : defaultGroups(stageCount);

  return { direction: active, firstDate: raw.firstDate, groups };
}
