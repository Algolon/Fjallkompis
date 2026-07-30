/**
 * Day plan — the derived layer.
 *
 * Takes the ACTIVE directional itinerary's ordered stages, the persisted plan,
 * the persisted `currentStageId` and the personal Trip items, and derives the
 * calendar days the UI renders. Nothing here is persisted and no canonical
 * data is touched: a planned day only HOLDS the itinerary's own stage objects,
 * so guides, highlights, detours, geometry and statistics stay stage-owned and
 * direction-correct.
 *
 * **There is no implicit plan.** With `dayPlan == null` this returns an empty
 * list: no dates, no planned calendar days, no activity indicators. The app
 * then renders its original, date-independent experience. Planning is opt-in
 * and a plan exists only because the user made one.
 *
 * Aggregation rules (hiking activities only):
 *   - distance and estimated hours: summed;
 *   - ascent/descent: summed ONLY when every component is present, else null;
 *   - elevation extremes: min/max, never sums;
 *   - elevation profile: the stages' own verified samples concatenated with
 *     cumulative offsets. No geometry is recomputed or synthesised.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` exercises the derivation
 * directly — the same split as route/itinerary.mjs vs route/activeItinerary.ts.
 */
import { dateForDayIndex, hikingStagesOf } from './dayPlan.mjs';

/**
 * Geometry length of a stage: the cumulative distance at its last point, or
 * the GPX statistic when a stage has no points. The convention the Map already
 * uses for along-stage progress.
 */
function stageLengthKm(stage) {
  const points = Array.isArray(stage.points) ? stage.points : [];
  const last = points[points.length - 1]?.cumulativeDistanceKm;
  return typeof last === 'number' && Number.isFinite(last) ? last : stage.distanceKm;
}

/**
 * Sum, or null when any component value is absent. An EMPTY list is null too,
 * not 0: a day that does no walking has no climb to report, and "↗ 0 m" would
 * be a claim about terrain rather than the absence of a walk.
 */
function sumOrNull(values) {
  if (values.length === 0) return null;
  let total = 0;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) return null;
    total += v;
  }
  return total;
}

function extremeOrNull(values, pick) {
  const present = values.filter((v) => v != null && Number.isFinite(v));
  return present.length ? pick(...present) : null;
}

/**
 * Concatenate the stages' verified elevation profiles into one day profile.
 * Each stage's samples keep their verified distances; only a cumulative offset
 * is added, so the result is monotonic and no value is invented.
 */
function concatProfiles(stages) {
  if (stages.length === 0) return [];
  if (stages.length === 1) return stages[0].elevationProfile ?? [];
  const out = [];
  let offset = 0;
  for (const stage of stages) {
    for (const sample of stage.elevationProfile ?? []) {
      out.push({
        distanceKm: sample.distanceKm + offset,
        elevationM: sample.elevationM,
        lat: sample.lat,
        lon: sample.lon,
      });
    }
    offset += stageLengthKm(stage);
  }
  return out;
}

/**
 * Transport items the user has recorded for this date, in departure order.
 *
 * Matching is by DATE ONLY and is read-only: the Day plan never copies a
 * movement's endpoints, times, provider or documents, and never claims a
 * permanent relationship — the trip item keeps its own date and remains the
 * single source of truth in Lists → Trip. Items with a valid departure time
 * sort chronologically ahead of untimed ones; otherwise the user's existing
 * order is preserved.
 */
function matchTravelItems(tripItems, date) {
  if (!Array.isArray(tripItems) || date == null) return [];
  const matched = [];
  for (let i = 0; i < tripItems.length; i++) {
    const item = tripItems[i];
    if (item?.kind !== 'transport' || item.date !== date) continue;
    matched.push({ item, order: i });
  }
  matched.sort((a, b) => {
    const at = a.item.departureTime;
    const bt = b.item.departureTime;
    if (at && bt && at !== bt) return at < bt ? -1 : 1;
    if (at && !bt) return -1;
    if (!at && bt) return 1;
    return a.order - b.order;
  });
  return matched.map((m) => m.item);
}

/**
 * The effective overnight for a day, in the fixed resolution order:
 *   1. an explicit reference on the day;
 *   2. the day's hiking endpoint;
 *   3. for a rest day, the previous day's effective overnight (it is based
 *      wherever the user already was);
 *   4. otherwise none.
 *
 * A Travel-only day therefore has NO overnight unless the user sets one:
 * a canonical Stop is never inferred from a trip item's free-text destination.
 */
function resolveOvernight(record, stages, previous) {
  if (record.overnight) return { ...record.overnight, source: 'explicit' };
  if (stages.length > 0) {
    return { kind: 'stop', stopId: stages[stages.length - 1].toHutId, source: 'hiking' };
  }
  if (record.activities.some((a) => a.kind === 'rest') && previous) {
    return { ...previous, source: 'carried' };
  }
  return { kind: 'none', source: 'derived' };
}

function buildDay(record, index, startDate, stages, currentDayId, tripItems, previousOvernight) {
  const date = dateForDayIndex(startDate, index);
  const last = stages[stages.length - 1] ?? null;
  const overnight = resolveOvernight(record, stages, previousOvernight);
  return {
    id: record.id,
    index,
    number: index + 1,
    date,
    activities: record.activities.map((a) => ({ ...a })),
    kinds: record.activities.map((a) => a.kind),
    stages,
    fromStopId: stages.length ? stages[0].fromHutId : null,
    toStopId: last ? last.toHutId : null,
    viaStopIds: stages.slice(0, -1).map((s) => s.toHutId),
    distanceKm: stages.reduce((sum, s) => sum + s.distanceKm, 0),
    totalAscentM: sumOrNull(stages.map((s) => s.totalAscentM)),
    totalDescentM: sumOrNull(stages.map((s) => s.totalDescentM)),
    minimumElevationM: extremeOrNull(stages.map((s) => s.minimumElevationM), Math.min),
    maximumElevationM: extremeOrNull(stages.map((s) => s.maximumElevationM), Math.max),
    estimatedHours: stages.reduce((sum, s) => sum + s.estimatedHours, 0),
    elevationProfile: concatProfiles(stages),
    overnight,
    travelItems: matchTravelItems(tripItems, date),
    isCurrent: currentDayId != null && record.id === currentDayId,
  };
}

/**
 * Derive the planned calendar days.
 *
 * Returns an EMPTY list when there is no plan — the canonical default state,
 * in which the app shows no dates and no planned days at all. A plan whose
 * hiking counts do not partition the active stage sequence (only reachable
 * transiently) also returns empty rather than rendering a broken journey; the
 * persisted value is repaired independently by normalizeDayPlan.
 *
 * @param {ReadonlyArray<object>} stages   Active itinerary stages, walking order.
 * @param {object|null} dayPlan            The persisted plan, or null.
 * @param {ReadonlyArray<object>} tripItems Personal Trip items (read-only).
 */
export function buildPlannedDays(stages, dayPlan, tripItems = []) {
  if (!dayPlan || !Array.isArray(dayPlan.days) || dayPlan.days.length === 0) return [];
  if (!Array.isArray(stages) || stages.length === 0) return [];

  let covered = 0;
  for (const record of dayPlan.days) covered += hikingStagesOf(record);
  if (covered !== stages.length) return [];

  const days = [];
  let cursor = 0;
  let previousOvernight = null;
  for (let i = 0; i < dayPlan.days.length; i++) {
    const record = dayPlan.days[i];
    const count = hikingStagesOf(record);
    const slice = count > 0 ? stages.slice(cursor, cursor + count) : [];
    cursor += count;
    const day = buildDay(
      record,
      i,
      dayPlan.startDate,
      slice,
      dayPlan.currentDayId ?? null,
      tripItems,
      previousOvernight,
    );
    if (day.overnight.kind !== 'none') {
      previousOvernight = { kind: day.overnight.kind, stopId: day.overnight.stopId, tripItemId: day.overnight.tripItemId };
      if (previousOvernight.stopId === undefined) delete previousOvernight.stopId;
      if (previousOvernight.tripItemId === undefined) delete previousOvernight.tripItemId;
    }
    days.push(day);
  }
  return days;
}

/** The active planned day, or null. Driven by the plan's own currentDayId. */
export function currentPlannedDayOf(days) {
  if (!Array.isArray(days)) return null;
  return days.find((d) => d.isCurrent) ?? null;
}

/** The planned day covering a canonical stage id, or null. */
export function plannedDayForStage(days, stageId) {
  if (!Array.isArray(days) || stageId == null) return null;
  return days.find((d) => d.stages.some((s) => s.id === stageId)) ?? null;
}

/** Index of the current stage WITHIN a planned day, or -1. */
export function currentPartIndex(day, currentStageId) {
  if (!day || currentStageId == null) return -1;
  return day.stages.findIndex((s) => s.id === currentStageId);
}

/**
 * Legal endpoints for a hiking day: every stop reachable by 1..N adjacent
 * stages from where the day starts, with the consequence of choosing it. Used
 * by the "Change endpoint" chooser — the one place the planner shows distance,
 * because how far to walk in a day IS the decision being made.
 */
export function hikingEndpointOptions(days, dayIndex, stages) {
  if (!Array.isArray(days) || !Array.isArray(stages)) return [];
  const day = days[dayIndex];
  if (!day || day.stages.length === 0) return [];
  const startStageIndex = stages.findIndex((s) => s.id === day.stages[0].id);
  if (startStageIndex === -1) return [];

  let available = 0;
  for (let i = dayIndex; i < days.length; i++) available += days[i].stages.length;

  const options = [];
  let distanceKm = 0;
  for (let n = 1; n <= available; n++) {
    const stage = stages[startStageIndex + n - 1];
    if (!stage) break;
    distanceKm += stage.distanceKm;
    options.push({
      stopId: stage.toHutId,
      stages: n,
      distanceKm,
      isCurrent: n === day.stages.length,
      // What choosing this option does to the surrounding days.
      effect: n === day.stages.length ? 'none' : n > day.stages.length ? 'merge' : 'split',
    });
  }
  return options;
}
