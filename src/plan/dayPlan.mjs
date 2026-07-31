/**
 * Day plan — the pure model.
 *
 * A journey is a sequence of CALENDAR DAYS. Only some of them contain walking:
 * a day holds one or more ordered activities (hiking / travel / rest) and,
 * optionally, an explicit overnight reference. Canonical route STAGES are
 * fixed geographical segments and are never touched here — a hiking activity
 * owns an ordered list of explicit LEGS (src/plan/hikingLegs.mjs), each
 * referencing one physical canonical stage with an absolute orientation.
 *
 * Planning is strictly OPT-IN. There is no such thing as an implicit plan:
 * `dayPlan === null` is the canonical default state and this module never
 * manufactures a plan from trip items, route direction or the system clock.
 *
 * Since schema v10 there is NO route partition invariant: a canonical stage
 * may be walked on no day, one day, several days, or twice on the same day
 * (an out-and-back). What structural validity still requires:
 *
 *   - the legs WITHIN one hiking activity connect physically end-to-start;
 *   - every leg resolves to a real canonical stage with a valid orientation;
 *   - leg ids are unique across the WHOLE plan;
 *   - a hiking activity has at least one leg.
 *
 * Everything else — a skipped stage, a repeat, a reverse walk, an early
 * finish — is a DIAGNOSTIC (src/plan/coverageDiagnostics.mjs), never an
 * error, and editing one planned day NEVER changes another day.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` exercises
 * the model directly — the convention shared with routeProgress.mjs,
 * stateMigration.mjs and tripModel.mjs.
 */
import { addDays, isRealIsoDate, parseIsoDate, toIsoDate } from '../utils/dateTimeField.mjs';
import { isRouteDirection, isReversed, normalizeDirection } from '../route/direction.mjs';
import {
  isHikingLegOrientation,
  isValidHikingLegs,
  legCandidatesFrom,
  legCandidatesTo,
  newHikingLegId,
  normalizeHikingLeg,
  orientedLegEndpoints,
  topologyStage,
  withLegAdded,
  withLegMoved,
  withLegRemoved,
  withLegRepeated,
  withLegReversed,
} from './hikingLegs.mjs';
import { migrateLegacyDayPlan, planUsesLegacyHiking } from './dayPlanMigration.mjs';

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

/** The day's ordered hiking legs ([] when it does no walking). */
export function hikingLegsOf(day) {
  const legs = hikingActivity(day)?.legs;
  return Array.isArray(legs) ? legs : [];
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
 *   - a hiking activity's legs are a non-empty, physically connected sequence
 *     of well-formed legs over the canonical topology.
 */
export function isValidActivities(activities, topology) {
  if (!Array.isArray(activities) || activities.length === 0) return false;
  let hiking = 0;
  let travel = 0;
  let rest = 0;
  for (const a of activities) {
    if (a == null || typeof a !== 'object') return false;
    if (a.kind === 'hiking') {
      hiking += 1;
      if (!isValidHikingLegs(a.legs, topology)) return false;
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
 * caller's order. Rest wins outright (it is exclusive). A hiking entry
 * carries `legs` — the existing legs when the day already walks, so changing
 * a day's composition never rewrites its route.
 */
export function buildActivities(kinds, legs = []) {
  const wanted = Array.isArray(kinds) ? kinds.filter((k) => DAY_ACTIVITY_KINDS.includes(k)) : [];
  if (wanted.includes('rest')) return [{ kind: 'rest' }];
  const out = [];
  for (const kind of wanted) {
    if (out.some((a) => a.kind === kind)) continue;
    out.push(kind === 'hiking' ? { kind: 'hiking', legs: legs.map((l) => ({ ...l })) } : { kind });
  }
  return out;
}

// ---- Plan structure ---------------------------------------------------------

/** Every leg in the plan, in day order then leg order. */
export function allPlanLegs(days) {
  if (!Array.isArray(days)) return [];
  return days.flatMap((day) => hikingLegsOf(day));
}

/**
 * True when `days` is a structurally valid plan over the canonical topology:
 * a non-empty list of days with unique ids, valid activity combinations,
 * valid overnight references, and leg ids unique across the WHOLE plan.
 * There is deliberately no coverage requirement — a plan that walks nothing
 * at all (only travel and rest days) is structurally sound.
 */
export function isValidDays(days, topology) {
  if (!Array.isArray(days) || days.length === 0) return false;
  const ids = new Set();
  for (const day of days) {
    if (day == null || typeof day !== 'object') return false;
    if (typeof day.id !== 'string' || day.id === '' || ids.has(day.id)) return false;
    ids.add(day.id);
    if (!isValidActivities(day.activities, topology)) return false;
    if (day.overnight !== undefined && !isValidOvernight(day.overnight)) return false;
  }
  const legIds = new Set();
  for (const leg of allPlanLegs(days)) {
    if (legIds.has(leg.id)) return false;
    legIds.add(leg.id);
  }
  return true;
}

/** True for a well-formed overnight reference. */
export function isValidOvernight(ref) {
  if (ref == null || typeof ref !== 'object') return false;
  if (ref.kind === 'none') return true;
  if (ref.kind === 'stop') return typeof ref.stopId === 'string' && ref.stopId !== '';
  if (ref.kind === 'stay') return typeof ref.tripItemId === 'string' && ref.tripItemId !== '';
  return false;
}

/**
 * The default plan's days: one hiking day per canonical stage, walked through
 * in the given direction — forward as 'canonical' legs over d1..dN, reverse
 * as 'opposite' legs over dN..d1. Orientation is recorded ABSOLUTELY so the
 * plan never needs the direction consulted again to interpret a leg.
 */
export function defaultDays(direction, topology) {
  if (!Array.isArray(topology) || topology.length === 0) return [];
  const reversed = isReversed(direction);
  const order = reversed ? [...topology].reverse() : topology;
  const orientation = reversed ? 'opposite' : 'canonical';
  return order.map((stage) => ({
    id: newPlannedDayId(),
    activities: [
      {
        kind: 'hiking',
        legs: [{ id: newHikingLegId(), kind: 'canonical-stage', stageId: stage.id, orientation }],
      },
    ],
  }));
}

/** True when the plan is the default one-hiking-day-per-stage shape. */
export function isDefaultDays(days, direction, topology) {
  if (!isValidDays(days, topology)) return false;
  if (!Array.isArray(topology) || days.length !== topology.length) return false;
  const reversed = isReversed(direction);
  const order = reversed ? [...topology].reverse() : topology;
  const orientation = reversed ? 'opposite' : 'canonical';
  return days.every((day, i) => {
    if (day.activities.length !== 1 || day.overnight !== undefined) return false;
    const legs = hikingLegsOf(day);
    return (
      legs.length === 1 && legs[0].stageId === order[i].id && legs[0].orientation === orientation
    );
  });
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
export function createDayPlan(direction, startDate, topology) {
  if (!isRealIsoDate(startDate)) return null;
  const days = defaultDays(direction, topology);
  if (days.length === 0) return null;
  return {
    direction: normalizeDirection(direction),
    startDate,
    journeyActive: false,
    currentDayId: null,
    currentLegId: null,
    days,
  };
}

// ---- Editing (pure; every helper returns a NEW day list) --------------------

const cloneLeg = (leg) => ({ ...leg });

const cloneActivity = (a) =>
  a.kind === 'hiking' ? { kind: 'hiking', legs: a.legs.map(cloneLeg) } : { ...a };

const cloneDay = (day) => ({
  id: day.id,
  activities: day.activities.map(cloneActivity),
  ...(day.overnight !== undefined ? { overnight: { ...day.overnight } } : {}),
});

const cloneDays = (days) => days.map(cloneDay);

/** Index of the day with this id, or -1. */
export function dayIndexById(days, dayId) {
  if (!Array.isArray(days) || typeof dayId !== 'string') return -1;
  return days.findIndex((d) => d.id === dayId);
}

/**
 * The pointers after a day-list edit. Since v10 an edit NEVER moves walking
 * between days, so the rule is simple honesty:
 *
 *   - the active day survives while it exists, and degrades to null when the
 *     edit removed it — never to a different day;
 *   - the active leg survives while it is still one of the active day's own
 *     hiking legs, and degrades to null otherwise.
 *
 * `currentStageId` is never touched here; route progress is not something a
 * calendar edit may rewrite.
 */
export function pointersAfterEdit(nextDays, currentDayId, currentLegId) {
  if (!Array.isArray(nextDays) || currentDayId == null) {
    return { currentDayId: null, currentLegId: null };
  }
  const day = nextDays.find((d) => d.id === currentDayId) ?? null;
  if (!day) return { currentDayId: null, currentLegId: null };
  const leg =
    currentLegId != null ? (hikingLegsOf(day).find((l) => l.id === currentLegId) ?? null) : null;
  return { currentDayId, currentLegId: leg ? leg.id : null };
}

/**
 * The physically valid STARTING sections a day could walk when it takes on
 * hiking at `index` (a new hiking day, or a travel/rest day switched to
 * hiking) — the candidates the UI must put in front of the user, never a
 * silent automatic pick:
 *
 *   1. the nearest hiking day BEFORE the insertion point ends somewhere:
 *      every section departing from there;
 *   2. else the nearest hiking day AFTER starts somewhere: every section
 *      arriving there;
 *   3. else (no hiking day at all) the plan direction's first stage.
 *
 * Each candidate carries `alreadyPlanned`: whether some leg in the plan
 * already walks that stage. Repeating a stage is always the user's explicit
 * selection — a caller may auto-proceed ONLY when exactly one candidate is
 * not yet planned, and must open a chooser otherwise.
 */
export function newDayLegCandidates(days, index, direction, topology) {
  if (!Array.isArray(topology) || topology.length === 0) return [];
  const list = Array.isArray(days) ? days : [];
  const at = Math.max(0, Math.min(Number.isInteger(index) ? index : list.length, list.length));
  const withPlanned = (candidate) => ({
    ...candidate,
    alreadyPlanned: stageOccurrences(list, candidate.stageId).length > 0,
  });

  for (let i = at - 1; i >= 0; i--) {
    const legs = hikingLegsOf(list[i]);
    if (legs.length === 0) continue;
    const end = orientedLegEndpoints(legs[legs.length - 1], topology);
    return end ? legCandidatesFrom(topology, end.toStopId).map(withPlanned) : [];
  }
  for (let i = at; i < list.length; i++) {
    const legs = hikingLegsOf(list[i]);
    if (legs.length === 0) continue;
    const start = orientedLegEndpoints(legs[0], topology);
    return start ? legCandidatesTo(topology, start.fromStopId).map(withPlanned) : [];
  }
  const reversed = isReversed(direction);
  const stage = reversed ? topology[topology.length - 1] : topology[0];
  return [
    withPlanned({
      stageId: stage.id,
      orientation: reversed ? 'opposite' : 'canonical',
      fromStopId: reversed ? stage.toStopId : stage.fromStopId,
      toStopId: reversed ? stage.fromStopId : stage.toStopId,
    }),
  ];
}

/** A fresh leg from an EXPLICITLY chosen starting section, or null. */
function legFromStart(startLeg, topology) {
  if (startLeg == null || typeof startLeg !== 'object') return null;
  if (!topologyStage(topology, startLeg.stageId)) return null;
  if (!isHikingLegOrientation(startLeg.orientation)) return null;
  return {
    id: newHikingLegId(),
    kind: 'canonical-stage',
    stageId: startLeg.stageId,
    orientation: startLeg.orientation,
  };
}

/**
 * Insert a day at `index`. A travel or rest day is free. A hiking day walks
 * the EXPLICITLY chosen `startLeg` ({ stageId, orientation }) — the model
 * never picks a section by itself, so a repeated stage can only ever be the
 * user's own selection (see `newDayLegCandidates`). Refused (unchanged)
 * without a resolvable start. No other day is touched either way.
 */
export function insertDay(days, index, kinds, topology, startLeg) {
  if (!Array.isArray(days)) return [];
  const at = Math.max(0, Math.min(Number.isInteger(index) ? index : days.length, days.length));
  const wantsHiking = Array.isArray(kinds) && kinds.includes('hiking');
  const leg = wantsHiking ? legFromStart(startLeg, topology) : null;
  if (wantsHiking && !leg) return cloneDays(days);
  const activities = buildActivities(kinds, leg ? [leg] : []);
  if (!isValidActivities(activities, topology)) return cloneDays(days);
  const out = cloneDays(days);
  out.splice(at, 0, { id: newPlannedDayId(), activities });
  return out;
}

/**
 * Remove the day at `index`. Its legs — if any — are removed WITH it: no
 * other day inherits, lengthens or changes, and the coverage difference is a
 * diagnostic, not an error. Removing the only day is refused (a plan is a
 * non-empty list; removing the plan itself is a separate, confirmed action).
 */
export function removeDay(days, index) {
  if (!Array.isArray(days) || days.length <= 1) return cloneDays(days ?? []);
  const out = cloneDays(days);
  if (!out[index]) return out;
  out.splice(index, 1);
  return out;
}

/** True when the day at `index` can be removed. */
export function canRemoveDay(days, index) {
  return Array.isArray(days) && days.length > 1 && days[index] != null;
}

/**
 * Replace a day's activity composition.
 *
 * REFUSED when it would drop the walking from a day that walks: a hiking
 * activity's legs are an explicit route and silently discarding them is a
 * data loss, not a toggle. The explicit path is `dropHikingFromDay`, which
 * the UI reaches through its own named, confirmed action.
 *
 * Taking walking ON needs an EXPLICITLY chosen `startLeg` — the model
 * never picks a section by itself (see `newDayLegCandidates`), so a
 * repeated stage can only be the user's own selection. No other day
 * changes either way.
 */
export function setDayActivities(days, index, kinds, topology, startLeg) {
  if (!Array.isArray(days)) return [];
  const out = cloneDays(days);
  const day = out[index];
  if (!day) return out;
  const currentLegs = hikingLegsOf(day);
  const keepsHiking = Array.isArray(kinds) && kinds.includes('hiking');
  if (currentLegs.length > 0 && !keepsHiking) return out; // refuse: explicit removal only
  let legs = currentLegs;
  if (currentLegs.length === 0 && keepsHiking) {
    const leg = legFromStart(startLeg, topology);
    if (!leg) return out; // refuse: no silent section pick
    legs = [leg];
  }
  const activities = buildActivities(kinds, legs);
  if (!isValidActivities(activities, topology)) return out;
  out[index] = { ...day, activities };
  return out;
}

/**
 * The EXPLICIT removal of a day's walking: drops the hiking activity and its
 * legs, replacing the day's composition with `replacementKinds` (which must
 * not include hiking). The UI names the route section being removed and
 * confirms first — this is the one supported way a walking day stops
 * walking, and it never touches any other day.
 */
export function dropHikingFromDay(days, index, replacementKinds) {
  if (!Array.isArray(days)) return [];
  const out = cloneDays(days);
  const day = out[index];
  if (!day || hikingLegsOf(day).length === 0) return out;
  const kinds = Array.isArray(replacementKinds)
    ? replacementKinds.filter((k) => k !== 'hiking')
    : [];
  const activities = buildActivities(kinds);
  if (activities.length === 0) return out; // a day always does something
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

// ---- Editing: a day's legs --------------------------------------------------
//
// Thin day-level wrappers over the pure leg operations. Each one touches
// EXACTLY the day at `index`; a refusal at the leg level (disconnection, the
// final leg, an unknown id) comes back as an unchanged day list.

function patchLegs(days, index, patch) {
  if (!Array.isArray(days)) return [];
  const out = cloneDays(days);
  const day = out[index];
  if (!day) return out;
  const activity = hikingActivity(day);
  if (!activity) return out;
  const next = patch(activity.legs);
  if (next === activity.legs) return cloneDays(days); // refused — unchanged
  activity.legs = next;
  return out;
}

/** Add a connecting leg at the start or end of the day's walk. */
export function addLegToDay(days, index, stageId, orientation, position, topology) {
  return patchLegs(days, index, (legs) =>
    withLegAdded(legs, stageId, orientation, position, topology),
  );
}

/** Remove a leg (refused for the final leg — see dropHikingFromDay). */
export function removeLegFromDay(days, index, legId, topology) {
  return patchLegs(days, index, (legs) => withLegRemoved(legs, legId, topology));
}

/** Flip a leg's absolute orientation where the sequence stays connected. */
export function reverseLegInDay(days, index, legId, topology) {
  return patchLegs(days, index, (legs) => withLegReversed(legs, legId, topology));
}

/** Walk a leg's stage again (a second occurrence, back the other way). */
export function repeatLegInDay(days, index, legId, topology) {
  return patchLegs(days, index, (legs) => withLegRepeated(legs, legId, topology));
}

/** Reorder legs where the moved sequence stays connected. */
export function moveLegInDay(days, index, fromIndex, toIndex, topology) {
  return patchLegs(days, index, (legs) => withLegMoved(legs, fromIndex, toIndex, topology));
}

// ---- Normalisation ----------------------------------------------------------

function normalizeActivities(raw, topology) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    if (entry.kind === 'hiking') {
      if (!Array.isArray(entry.legs)) return null;
      const legs = entry.legs.map((leg) => normalizeHikingLeg(leg, topology));
      if (legs.some((leg) => leg === null)) return null;
      out.push({ kind: 'hiking', legs });
    } else if (entry.kind === 'travel' || entry.kind === 'rest') {
      out.push({ kind: entry.kind });
    }
    // Unknown kinds are dropped, never carried through as a custom activity.
  }
  return isValidActivities(out, topology) ? out : null;
}

/**
 * Validate + repair a persisted or imported plan. Never throws, never mutates
 * its input, and never returns a half-valid plan:
 *
 *   - absent / malformed / legacy-draft shape    → null (no plan);
 *   - v9 stage-count hiking activities           → migrated to explicit legs
 *     first (src/plan/dayPlanMigration.mjs) and then validated like any v10
 *     plan; a legacy payload the released model could not have persisted
 *     refuses to migrate and lands on null;
 *   - unreal start date, unknown direction       → null;
 *   - stored direction ≠ ACTIVE direction        → null. A plan authored for
 *     one walking direction describes a different journey in the other, so it
 *     is never mirrored, rebuilt or partially reused;
 *   - any structurally invalid day list          → null;
 *   - dangling / stale `currentDayId`            → null'd, plan kept;
 *   - a `currentLegId` that is not one of the current day's own hiking legs
 *     → null'd, plan kept — the pointer pair is only ever honoured together.
 *
 * @param {unknown} raw
 * @param {string} activeDirection  The direction the app is currently in.
 * @param {ReadonlyArray<import('../types').StageTopologyEntry>} topology
 *   Canonical stages in canonical order (see src/utils/storage.ts).
 * @param {string|null} currentStageId  The blob's route-progress pointer —
 *   used ONLY to derive `currentLegId` during the v9 → v10 migration.
 */
export function normalizeDayPlan(raw, activeDirection, topology, currentStageId = null) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Array.isArray(topology) || topology.length === 0) return null;

  const source = planUsesLegacyHiking(raw)
    ? migrateLegacyDayPlan(raw, topology, currentStageId)
    : raw;
  if (source == null) return null;

  if (!isRealIsoDate(source.startDate)) return null;
  if (!isRouteDirection(source.direction)) return null;
  if (source.direction !== normalizeDirection(activeDirection)) return null;
  if (!Array.isArray(source.days) || source.days.length === 0) return null;

  const days = [];
  const ids = new Set();
  for (const entry of source.days) {
    if (entry == null || typeof entry !== 'object') return null;
    if (typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) return null;
    const activities = normalizeActivities(entry.activities, topology);
    if (!activities) return null;
    ids.add(entry.id);
    const day = { id: entry.id, activities };
    if (entry.overnight !== undefined && isValidOvernight(entry.overnight)) {
      day.overnight = { ...entry.overnight };
    }
    days.push(day);
  }
  const legIds = new Set();
  for (const leg of allPlanLegs(days)) {
    if (legIds.has(leg.id)) return null; // duplicate leg identity is invalid
    legIds.add(leg.id);
  }

  // Stale pointers degrade to "none", never to a wrong day or leg — and the
  // leg pointer is only honoured on the current day itself.
  const currentDayId = ids.has(source.currentDayId) ? source.currentDayId : null;
  const currentDay = currentDayId ? days.find((d) => d.id === currentDayId) : null;
  const currentLegId =
    currentDay && typeof source.currentLegId === 'string'
      ? (hikingLegsOf(currentDay).find((l) => l.id === source.currentLegId)?.id ?? null)
      : null;

  return {
    direction: source.direction,
    startDate: source.startDate,
    // Additive schema-v10 field: old/malformed values are deliberately off.
    // A pointer in an old payload is not consent to replace generic Today.
    journeyActive: source.journeyActive === true,
    currentDayId,
    currentLegId,
    days,
  };
}

// ---- Occurrences ------------------------------------------------------------

/**
 * Every (day, leg) occurrence of a canonical stage in the plan, in day order.
 * The v10 answer to "which day walks stage X" — callers must handle 0, 1 or
 * MANY, and no code may quietly take the first of several (see the pointer
 * rules in src/store/AppStore.tsx).
 */
export function stageOccurrences(days, stageId) {
  if (!Array.isArray(days) || typeof stageId !== 'string') return [];
  const out = [];
  for (const day of days) {
    for (const leg of hikingLegsOf(day)) {
      if (leg.stageId === stageId) out.push({ dayId: day.id, legId: leg.id });
    }
  }
  return out;
}
