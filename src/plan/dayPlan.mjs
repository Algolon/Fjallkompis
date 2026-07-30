/**
 * Day plan — the pure model.
 *
 * A journey is a sequence of CALENDAR DAYS. Only some of them contain walking:
 * a day holds one or more ordered activities (hiking / travel / rest) and,
 * optionally, an explicit overnight reference. Canonical route STAGES are
 * fixed geographical segments and are never touched here — a hiking activity
 * records only how many ADJACENT stages that day covers, and which stages
 * those are is derived by walking the days in order.
 *
 * Planning is strictly OPT-IN. There is no such thing as an implicit plan:
 * `dayPlan === null` is the canonical default state and this module never
 * manufactures a plan from trip items, route direction or the system clock.
 *
 * The partition invariant that protects the route survives from the earlier
 * hiking-only model, unchanged in force:
 *
 *   Σ (hiking.stages over all days, in order) === canonical stage count
 *
 * so every stage appears exactly once, in route order, in an adjacent run —
 * and a skipped, duplicated, non-adjacent or reordered stage is not
 * representable at all.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` exercises
 * the model directly — the convention shared with routeProgress.mjs,
 * stateMigration.mjs and tripModel.mjs.
 */
import { addDays, isRealIsoDate, parseIsoDate, toIsoDate } from '../utils/dateTimeField.mjs';
import { isRouteDirection, normalizeDirection } from '../route/direction.mjs';

/** The three supported activity kinds. Deliberately closed — no custom kind. */
export const DAY_ACTIVITY_KINDS = ['hiking', 'travel', 'rest'];

/** User-facing labels. 'rest' persists; "Rest & explore" is what it is called. */
export const DAY_ACTIVITY_LABELS = {
  hiking: 'Hiking',
  travel: 'Travel',
  rest: 'Rest & explore',
};

/** Stable day id — same shape as trip item / wallet document / packing ids. */
export function newPlannedDayId() {
  return `day_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Activities -------------------------------------------------------------

/** The day's hiking activity, or null. */
export function hikingActivity(day) {
  return day?.activities?.find((a) => a.kind === 'hiking') ?? null;
}

/** How many canonical stages a day covers (0 when it does no walking). */
export function hikingStagesOf(day) {
  return hikingActivity(day)?.stages ?? 0;
}

export function hasActivity(day, kind) {
  return day?.activities?.some((a) => a.kind === kind) === true;
}

/**
 * Validate an ordered activity list against the SUPPORTED COMBINATIONS —
 * deliberately not a generic "at most N" rule:
 *   - at most one hiking activity;
 *   - at most one travel activity;
 *   - rest is exclusive (a rest day holds nothing else);
 *   - hiking + travel may coexist, and their ARRAY ORDER records whether the
 *     travel happens before or after the walking;
 *   - every hiking activity covers at least one whole stage.
 */
export function isValidActivities(activities) {
  if (!Array.isArray(activities) || activities.length === 0) return false;
  let hiking = 0;
  let travel = 0;
  let rest = 0;
  for (const a of activities) {
    if (a == null || typeof a !== 'object') return false;
    if (a.kind === 'hiking') {
      hiking += 1;
      if (typeof a.stages !== 'number' || !Number.isInteger(a.stages) || a.stages < 1) {
        return false;
      }
    } else if (a.kind === 'travel') travel += 1;
    else if (a.kind === 'rest') rest += 1;
    else return false;
  }
  if (hiking > 1 || travel > 1 || rest > 1) return false;
  if (rest === 1 && activities.length !== 1) return false;
  return true;
}

/**
 * Build a valid activity list from a requested set of kinds, preserving the
 * caller's order. Rest wins outright (it is exclusive); an existing hiking
 * stage count is carried over so changing a day's composition never silently
 * re-allocates the route.
 */
export function buildActivities(kinds, existingStages = 1) {
  const wanted = Array.isArray(kinds) ? kinds.filter((k) => DAY_ACTIVITY_KINDS.includes(k)) : [];
  if (wanted.includes('rest')) return [{ kind: 'rest' }];
  const out = [];
  for (const kind of wanted) {
    if (out.some((a) => a.kind === kind)) continue;
    out.push(kind === 'hiking' ? { kind: 'hiking', stages: Math.max(1, existingStages) } : { kind });
  }
  return out;
}

// ---- Plan structure ---------------------------------------------------------

/** Total canonical stages covered by a day list. NaN for malformed input. */
export function totalHikingStages(days) {
  if (!Array.isArray(days)) return NaN;
  let total = 0;
  for (const day of days) {
    const activity = hikingActivity(day);
    if (!activity) continue;
    if (!Number.isInteger(activity.stages)) return NaN;
    total += activity.stages;
  }
  return total;
}

/**
 * True when `days` is a structurally valid plan for `stageCount` canonical
 * stages: a non-empty list of days with unique ids, valid activity
 * combinations, valid overnight references, and hiking counts that partition
 * the route exactly.
 */
export function isValidDays(days, stageCount) {
  if (!Array.isArray(days) || days.length === 0) return false;
  if (!Number.isInteger(stageCount) || stageCount < 1) return false;
  const ids = new Set();
  for (const day of days) {
    if (day == null || typeof day !== 'object') return false;
    if (typeof day.id !== 'string' || day.id === '' || ids.has(day.id)) return false;
    ids.add(day.id);
    if (!isValidActivities(day.activities)) return false;
    if (day.overnight !== undefined && !isValidOvernight(day.overnight)) return false;
  }
  return totalHikingStages(days) === stageCount;
}

/** True for a well-formed overnight reference. */
export function isValidOvernight(ref) {
  if (ref == null || typeof ref !== 'object') return false;
  if (ref.kind === 'none') return true;
  if (ref.kind === 'stop') return typeof ref.stopId === 'string' && ref.stopId !== '';
  if (ref.kind === 'stay') return typeof ref.tripItemId === 'string' && ref.tripItemId !== '';
  return false;
}

/** The default plan: one hiking day per canonical stage, nothing else. */
export function defaultDays(stageCount) {
  if (!Number.isInteger(stageCount) || stageCount < 1) return [];
  return Array.from({ length: stageCount }, () => ({
    id: newPlannedDayId(),
    activities: [{ kind: 'hiking', stages: 1 }],
  }));
}

/** True when the plan is the default one-hiking-day-per-stage shape. */
export function isDefaultDays(days, stageCount) {
  return (
    isValidDays(days, stageCount) &&
    days.length === stageCount &&
    days.every(
      (d) => d.activities.length === 1 && d.activities[0].kind === 'hiking' && d.overnight === undefined,
    )
  );
}

// ---- Dates ------------------------------------------------------------------

/**
 * The calendar date of the day at `index`: `startDate` shifted by whole days.
 * Journey days are CONSECUTIVE in this iteration — inserting or removing a day
 * shifts every later date, which is what a continuous journey does. Null for a
 * malformed start date.
 *
 * Numeric parts only (see dateTimeField.mjs): never `new Date('YYYY-MM-DD')`,
 * which parses as UTC and shifts a calendar day in western timezones.
 */
export function dateForDayIndex(startDate, index) {
  const parts = parseIsoDate(startDate);
  if (!parts) return null;
  if (!Number.isInteger(index) || index < 0) return null;
  const shifted = addDays(parts.year, parts.month, parts.day, index);
  return toIsoDate(shifted.year, shifted.month, shifted.day);
}

// ---- Creation ---------------------------------------------------------------

/**
 * A fresh default plan. Only ever called from an explicit user action —
 * nothing in the app creates one from the system date or existing trip data.
 */
export function createDayPlan(direction, startDate, stageCount) {
  if (!isRealIsoDate(startDate)) return null;
  if (!Number.isInteger(stageCount) || stageCount < 1) return null;
  const days = defaultDays(stageCount);
  return {
    direction: normalizeDirection(direction),
    startDate,
    currentDayId: null,
    days,
  };
}

// ---- Editing (pure; every helper returns a NEW day list) --------------------

const cloneDay = (day) => ({
  id: day.id,
  activities: day.activities.map((a) => ({ ...a })),
  ...(day.overnight !== undefined ? { overnight: { ...day.overnight } } : {}),
});

const cloneDays = (days) => days.map(cloneDay);

/** Index of the day with this id, or -1. */
export function dayIndexById(days, dayId) {
  if (!Array.isArray(days) || typeof dayId !== 'string') return -1;
  return days.findIndex((d) => d.id === dayId);
}

/**
 * Index of the day covering the canonical stage at `stageIndex` (0-based, in
 * active route order), or -1 when that stage is outside the plan.
 */
export function dayIndexForStageIndex(days, stageIndex) {
  if (!Array.isArray(days)) return -1;
  if (!Number.isInteger(stageIndex) || stageIndex < 0) return -1;
  let seen = 0;
  for (let i = 0; i < days.length; i++) {
    const stages = hikingStagesOf(days[i]);
    if (stages === 0) continue;
    seen += stages;
    if (stageIndex < seen) return i;
  }
  return -1;
}

/**
 * The active-day pointer after a day-list edit.
 *
 * An edit can hand a canonical stage from one calendar day to another —
 * shrinking a two-stage day gives its second stage to a brand-new day, growing
 * one takes a following day's stage back. When the active day was the one
 * WALKING the current stage, it follows that stage to whichever day now owns
 * it: the walker has not moved, so the day shown must be the day containing
 * them. Ownership is answered by `dayIndexForStageIndex`, never by re-deriving
 * the allocation.
 *
 * Otherwise the pointer simply survives while its day does (a travel or rest
 * day carries no stage, so nothing can pull it elsewhere) and degrades to null
 * — "no active day" — when the edit removed it. `currentStageId` is never
 * moved here; route progress is not something a calendar edit may rewrite.
 *
 * @param {ReadonlyArray<object>} previousDays  The day list before the edit.
 * @param {ReadonlyArray<object>} nextDays      The day list after it.
 * @param {string|null} currentDayId            The active day before the edit.
 * @param {number} currentStageIndex            0-based index of `currentStageId`
 *   in the active itinerary, or -1 when it is not on the route.
 * @returns {string|null}
 */
export function currentDayIdAfterEdit(previousDays, nextDays, currentDayId, currentStageIndex) {
  if (!Array.isArray(nextDays) || currentDayId == null) return null;
  const before = dayIndexForStageIndex(previousDays, currentStageIndex);
  const walkedTheCurrentStage = before !== -1 && previousDays[before].id === currentDayId;
  if (walkedTheCurrentStage) {
    const after = dayIndexForStageIndex(nextDays, currentStageIndex);
    if (after !== -1) return nextDays[after].id;
  }
  return nextDays.some((d) => d.id === currentDayId) ? currentDayId : null;
}

/** Index of the FIRST canonical stage covered by the day at `dayIndex`, or -1. */
export function firstStageIndexOfDay(days, dayIndex) {
  if (!Array.isArray(days) || dayIndex < 0 || dayIndex >= days.length) return -1;
  if (hikingStagesOf(days[dayIndex]) === 0) return -1;
  let offset = 0;
  for (let i = 0; i < dayIndex; i++) offset += hikingStagesOf(days[i]);
  return offset;
}

/** Stages still available to a day: its own plus every following hiking day's. */
export function stagesAvailableFrom(days, dayIndex) {
  if (!Array.isArray(days) || dayIndex < 0 || dayIndex >= days.length) return 0;
  let total = 0;
  for (let i = dayIndex; i < days.length; i++) total += hikingStagesOf(days[i]);
  return total;
}

/** Remove a day's hiking activity; drop the whole day when nothing else is left. */
function withoutHiking(day) {
  const rest = day.activities.filter((a) => a.kind !== 'hiking');
  return rest.length ? { ...day, activities: rest } : null;
}

/**
 * Set how many canonical stages the hiking day at `dayIndex` covers.
 *
 * Growing a day CONSUMES stages from the following hiking days in order: a day
 * emptied of walking keeps its other activities, or disappears when it had
 * none. Shrinking a day RELEASES the remainder to the next hiking day, or
 * creates a new hiking day immediately after when there is none. This is what
 * "ends at ⟨stop⟩" compiles down to — merge, split or shift, always explicit.
 *
 * Returns a new day list; the input is never mutated. A no-op when the index
 * is not a hiking day or the count is out of range.
 */
export function setHikingStages(days, dayIndex, stages) {
  if (!Array.isArray(days)) return [];
  const out = cloneDays(days);
  const day = out[dayIndex];
  if (!day || hikingStagesOf(day) === 0) return out;
  if (!Number.isInteger(stages) || stages < 1) return out;
  if (stages > stagesAvailableFrom(out, dayIndex)) return out;

  const current = hikingStagesOf(day);
  if (stages === current) return out;

  const activity = hikingActivity(day);
  if (stages > current) {
    let needed = stages - current;
    activity.stages = stages;
    for (let i = dayIndex + 1; i < out.length && needed > 0; i++) {
      const next = hikingActivity(out[i]);
      if (!next) continue;
      const taken = Math.min(needed, next.stages);
      next.stages -= taken;
      needed -= taken;
      if (next.stages === 0) out[i] = withoutHiking(out[i]);
    }
    return out.filter(Boolean);
  }

  // Shrinking SPLITS: the released walking becomes its own new day right
  // after. It is never folded into the following day — that would silently
  // lengthen a day the user did not touch, and it would stop growing and
  // shrinking being exact inverses of each other.
  const released = current - stages;
  activity.stages = stages;
  out.splice(dayIndex + 1, 0, {
    id: newPlannedDayId(),
    activities: [{ kind: 'hiking', stages: released }],
  });
  return out;
}

/**
 * Insert a day at `index`. A travel or rest day is free. A hiking day has to
 * take a stage from an existing hiking day — the nearest one at or after the
 * insertion point, else the nearest before it — so the partition still holds;
 * when no hiking day has a stage to spare the call is a no-op (the UI disables
 * the action and says why).
 */
export function insertDay(days, index, kinds) {
  if (!Array.isArray(days)) return [];
  const at = Math.max(0, Math.min(Number.isInteger(index) ? index : days.length, days.length));
  const activities = buildActivities(kinds, 1);
  if (!isValidActivities(activities)) return cloneDays(days);
  const out = cloneDays(days);

  if (activities.some((a) => a.kind === 'hiking')) {
    const donor = findDonor(out, at);
    if (donor === -1) return out;
    hikingActivity(out[donor]).stages -= 1;
    if (hikingActivity(out[donor]).stages === 0) {
      const stripped = withoutHiking(out[donor]);
      if (stripped) out[donor] = stripped;
      else out.splice(donor, 1);
    }
  }
  out.splice(at, 0, { id: newPlannedDayId(), activities });
  return out;
}

/** Nearest hiking day with a spare stage: at/after `from` first, then before. */
function findDonor(days, from) {
  for (let i = from; i < days.length; i++) if (hikingStagesOf(days[i]) > 1) return i;
  for (let i = from - 1; i >= 0; i--) if (hikingStagesOf(days[i]) > 1) return i;
  return -1;
}

/** True when a hiking day can be inserted without breaking the partition. */
export function canInsertHikingDay(days, index) {
  return Array.isArray(days) && findDonor(days, Math.max(0, index ?? 0)) !== -1;
}

/**
 * Remove the day at `index`. Its walking, if any, moves to the next hiking day
 * or (failing that) the previous one, so no stage is ever lost. Removing the
 * only day, or the only day that walks, is refused.
 */
export function removeDay(days, index) {
  if (!Array.isArray(days) || days.length <= 1) return cloneDays(days ?? []);
  const out = cloneDays(days);
  const day = out[index];
  if (!day) return out;
  const stages = hikingStagesOf(day);
  if (stages > 0) {
    const heir = findHikingNeighbour(out, index);
    if (heir === -1) return out; // the only walking day — refuse
    hikingActivity(out[heir]).stages += stages;
  }
  out.splice(index, 1);
  return out;
}

/** True when the day at `index` can be removed. */
export function canRemoveDay(days, index) {
  if (!Array.isArray(days) || days.length <= 1) return false;
  const day = days[index];
  if (!day) return false;
  return hikingStagesOf(day) === 0 || findHikingNeighbour(days, index) !== -1;
}

function findHikingNeighbour(days, index) {
  for (let i = index + 1; i < days.length; i++) if (hikingStagesOf(days[i]) > 0) return i;
  for (let i = index - 1; i >= 0; i--) if (hikingStagesOf(days[i]) > 0) return i;
  return -1;
}

/**
 * Replace a day's activity composition. Dropping the walking from the only
 * hiking day is refused (the route must stay covered); its stages otherwise
 * move to a neighbouring hiking day.
 */
export function setDayActivities(days, index, kinds) {
  if (!Array.isArray(days)) return [];
  const out = cloneDays(days);
  const day = out[index];
  if (!day) return out;
  const currentStages = hikingStagesOf(day);
  const activities = buildActivities(kinds, Math.max(1, currentStages));
  if (!isValidActivities(activities)) return out;

  const keepsHiking = activities.some((a) => a.kind === 'hiking');
  if (currentStages > 0 && !keepsHiking) {
    const heir = findHikingNeighbour(out, index);
    if (heir === -1) return out; // refuse: nothing else walks
    hikingActivity(out[heir]).stages += currentStages;
  }
  if (currentStages === 0 && keepsHiking) {
    const donor = findDonor(out, index);
    if (donor === -1) return out; // refuse: no stage to spare
    hikingActivity(out[donor]).stages -= 1;
    if (hikingActivity(out[donor]).stages === 0) {
      const stripped = withoutHiking(out[donor]);
      if (stripped) out[donor] = stripped;
      else out.splice(donor, 1);
    }
    // The donor may have shifted this day's position when it disappeared.
    const self = out.findIndex((d) => d.id === day.id);
    out[self] = { ...out[self], activities };
    return out;
  }
  out[index] = { ...day, activities };
  return out;
}

/** Swap the order of a day's two activities (hike-then-travel ⇄ travel-then-hike). */
export function reorderDayActivities(days, index) {
  if (!Array.isArray(days)) return [];
  const out = cloneDays(days);
  const day = out[index];
  if (!day || day.activities.length !== 2) return out;
  out[index] = { ...day, activities: [day.activities[1], day.activities[0]] };
  return out;
}

/** Set or clear (undefined = derive) a day's explicit overnight reference. */
export function setDayOvernight(days, index, ref) {
  if (!Array.isArray(days)) return [];
  const out = cloneDays(days);
  const day = out[index];
  if (!day) return out;
  if (ref === undefined || ref === null) {
    const { overnight, ...without } = day;
    void overnight;
    out[index] = without;
    return out;
  }
  if (!isValidOvernight(ref)) return out;
  out[index] = { ...day, overnight: { ...ref } };
  return out;
}

// ---- Normalisation ----------------------------------------------------------

function normalizeActivities(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    if (entry.kind === 'hiking') {
      if (!Number.isInteger(entry.stages) || entry.stages < 1) return null;
      out.push({ kind: 'hiking', stages: entry.stages });
    } else if (entry.kind === 'travel' || entry.kind === 'rest') {
      out.push({ kind: entry.kind });
    }
    // Unknown kinds are dropped, never carried through as a custom activity.
  }
  return isValidActivities(out) ? out : null;
}

/**
 * Validate + repair a persisted or imported plan. Never throws, never mutates
 * its input, and never returns a half-valid plan:
 *
 *   - absent / malformed / legacy shape        → null (no plan);
 *   - unreal start date, unknown direction     → null;
 *   - stored direction ≠ ACTIVE direction      → null. A plan authored for one
 *     walking direction describes a different journey in the other, so it is
 *     never mirrored, rebuilt or partially reused;
 *   - any structurally invalid day list        → null;
 *   - dangling / stale `currentDayId`          → null'd, plan kept.
 *
 * The earlier draft's `{ direction, firstDate, groups }` shape has no `days`
 * array and therefore falls out here as null — never partially interpreted.
 *
 * @param {unknown} raw
 * @param {string} activeDirection  The direction the app is currently in.
 * @param {number} stageCount       Canonical stage count of the active itinerary.
 */
export function normalizeDayPlan(raw, activeDirection, stageCount) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Number.isInteger(stageCount) || stageCount < 1) return null;
  if (!isRealIsoDate(raw.startDate)) return null;
  if (!isRouteDirection(raw.direction)) return null;
  if (raw.direction !== normalizeDirection(activeDirection)) return null;
  if (!Array.isArray(raw.days) || raw.days.length === 0) return null;

  const days = [];
  const ids = new Set();
  for (const entry of raw.days) {
    if (entry == null || typeof entry !== 'object') return null;
    if (typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) return null;
    const activities = normalizeActivities(entry.activities);
    if (!activities) return null;
    ids.add(entry.id);
    const day = { id: entry.id, activities };
    if (entry.overnight !== undefined && isValidOvernight(entry.overnight)) {
      day.overnight = { ...entry.overnight };
    }
    days.push(day);
  }
  if (totalHikingStages(days) !== stageCount) return null;

  return {
    direction: raw.direction,
    startDate: raw.startDate,
    // A stale pointer degrades to "no active day", never to a wrong one.
    currentDayId: ids.has(raw.currentDayId) ? raw.currentDayId : null,
    days,
  };
}
