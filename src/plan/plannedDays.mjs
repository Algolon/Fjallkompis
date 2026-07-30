/**
 * The derived planned-day layer.
 *
 * Takes the ACTIVE directional itinerary's ordered stages (canonical,
 * untouched), the persisted day plan and the persisted `currentStageId`, and
 * derives the hiking days the UI renders. Nothing here is persisted and
 * nothing here touches canonical data: each planned day simply *holds* the
 * itinerary's own stage objects, so guides, highlights, detours, geometry and
 * statistics stay stage-owned and direction-correct.
 *
 * When there is NO plan (`dayPlan == null`) this derives one planned day per
 * canonical stage with `date: null` — behaviourally the app's pre-feature
 * state, through a single code path so Today never needs two renderers.
 *
 * Aggregation rules:
 *   - distance and estimated hours: summed;
 *   - ascent/descent: summed only when EVERY component value is present,
 *     otherwise null — a partial sum would understate a day's climbing;
 *   - elevation extremes: min/max across the day's stages, never sums;
 *   - elevation profile: the stages' own verified profiles concatenated with
 *     cumulative distance offsets. No geometry is recomputed or synthesised.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` exercises the derivation
 * directly — the same split as route/itinerary.mjs vs route/activeItinerary.ts.
 */
import { dateForDayIndex, defaultGroups, isValidGroups } from './dayPlan.mjs';

/**
 * Geometry length of a stage: the cumulative distance at its last point, or
 * the GPX statistic when a stage has no points. The same convention the Map
 * already uses for along-stage progress.
 */
function stageLengthKm(stage) {
  const points = Array.isArray(stage.points) ? stage.points : [];
  const last = points[points.length - 1]?.cumulativeDistanceKm;
  return typeof last === 'number' && Number.isFinite(last) ? last : stage.distanceKm;
}

/** Sum, or null when any component value is absent. */
function sumOrNull(values) {
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
 * Each stage's samples keep their own verified distances; only a cumulative
 * offset is added, so the result is monotonic in distance and no elevation,
 * coordinate or distance value is invented.
 */
function concatProfiles(stages) {
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

function buildDay(stages, index, date, currentStageId) {
  const last = stages[stages.length - 1];
  return {
    number: index + 1,
    index,
    date,
    stages,
    fromStopId: stages[0].fromHutId,
    toStopId: last.toHutId,
    // Every internal boundary — the stop where one canonical stage hands over
    // to the next inside this day.
    viaStopIds: stages.slice(0, -1).map((s) => s.toHutId),
    distanceKm: stages.reduce((sum, s) => sum + s.distanceKm, 0),
    totalAscentM: sumOrNull(stages.map((s) => s.totalAscentM)),
    totalDescentM: sumOrNull(stages.map((s) => s.totalDescentM)),
    minimumElevationM: extremeOrNull(stages.map((s) => s.minimumElevationM), Math.min),
    maximumElevationM: extremeOrNull(stages.map((s) => s.maximumElevationM), Math.max),
    estimatedHours: stages.reduce((sum, s) => sum + s.estimatedHours, 0),
    elevationProfile: concatProfiles(stages),
    isCurrent: currentStageId != null && stages.some((s) => s.id === currentStageId),
  };
}

/**
 * Derive the planned hiking days from the active itinerary's ordered stages.
 *
 * A plan whose grouping does not partition the active stage sequence (only
 * reachable transiently) falls back to one stage per day rather than
 * rendering a broken plan; the persisted value is repaired independently by
 * normalizeDayPlan.
 *
 * @param {ReadonlyArray<object>} stages  Active itinerary stages, walking order.
 * @param {object|null} dayPlan           The persisted plan, or null.
 * @param {string|null} currentStageId    The one persisted position pointer.
 */
export function buildPlannedDays(stages, dayPlan, currentStageId) {
  if (!Array.isArray(stages) || stages.length === 0) return [];

  const groups =
    dayPlan && isValidGroups(dayPlan.groups, stages.length)
      ? dayPlan.groups
      : defaultGroups(stages.length);

  const days = [];
  let offset = 0;
  for (let i = 0; i < groups.length; i++) {
    const slice = stages.slice(offset, offset + groups[i]);
    offset += groups[i];
    days.push(
      buildDay(
        slice,
        i,
        dayPlan ? dateForDayIndex(dayPlan.firstDate, i) : null,
        currentStageId ?? null,
      ),
    );
  }
  return days;
}

/** The planned day containing the current stage, or null when none does. */
export function currentPlannedDayOf(days) {
  if (!Array.isArray(days)) return null;
  return days.find((d) => d.isCurrent) ?? null;
}

/** Index of the current stage WITHIN its planned day, or -1. */
export function currentPartIndex(day, currentStageId) {
  if (!day || currentStageId == null) return -1;
  return day.stages.findIndex((s) => s.id === currentStageId);
}
