/**
 * Day plan — the derived layer.
 *
 * Takes the ORIENTED stage views (one per absolute orientation, both derived
 * from the same verified canonical data by src/route/itinerary.mjs — never
 * recomputed here), the persisted plan and the personal Trip items, and
 * derives the calendar days the UI renders. Nothing here is persisted and no
 * canonical data is touched: a planned day only HOLDS oriented views of the
 * itinerary's own stage objects, so guides, highlights, detours, geometry
 * and statistics stay stage-owned and orientation-correct.
 *
 * **There is no implicit plan.** With `dayPlan == null` this returns an empty
 * list: no dates, no planned calendar days, no activity indicators. The app
 * then renders its original, date-independent experience. Planning is opt-in
 * and a plan exists only because the user made one.
 *
 * Every hiking day reads its OWN explicit legs (schema v10): a leg resolves
 * to the canonical stage view for a 'canonical' orientation and to the
 * reverse-itinerary view — reversed verified coordinates, mirrored cumulative
 * distances, swapped ascent/descent — for an 'opposite' one. A repeated
 * stage is two legs and counts twice; editing one day can never change what
 * another day derives to, because nothing is shared between days any more.
 *
 * Aggregation rules (hiking legs only):
 *   - distance and estimated hours: summed over legs (occurrences, not
 *     unique stages);
 *   - ascent/descent: summed ONLY when every component is present, else null;
 *   - elevation extremes: min/max, never sums;
 *   - elevation profile: the legs' own verified oriented samples concatenated
 *     with cumulative offsets. No geometry is recomputed or synthesised.
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` exercises the derivation
 * directly — the same split as route/itinerary.mjs vs route/activeItinerary.ts.
 */
import { dateForDayIndex, hikingLegsOf } from './dayPlan.mjs';

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
 * Concatenate the legs' verified oriented elevation profiles into one day
 * profile. Each leg's samples keep their verified distances; only a
 * cumulative offset is added, so the result is monotonic and no value is
 * invented. A repeated stage contributes once PER LEG — walking it twice is
 * twice the profile.
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
 *   2. the day's hiking endpoint — where the LAST LEG ends;
 *   3. for a rest day, the previous day's effective overnight (it is based
 *      wherever the user already was);
 *   4. otherwise none.
 *
 * A Travel-only day therefore has NO overnight unless the user sets one:
 * a canonical Stop is never inferred from a trip item's free-text destination.
 */
function deriveOvernight(record, stages, previous) {
  if (stages.length > 0) {
    return { kind: 'stop', stopId: stages[stages.length - 1].toHutId, source: 'hiking' };
  }
  if (record.activities.some((a) => a.kind === 'rest') && previous) {
    return { ...previous, source: 'carried' };
  }
  return { kind: 'none', source: 'derived' };
}

function resolveOvernight(record, stages, previous) {
  if (record.overnight) return { ...record.overnight, source: 'explicit' };
  return deriveOvernight(record, stages, previous);
}

/**
 * Resolve one persisted leg to its derived form: the leg identity plus the
 * ORIENTED stage view it references. Null when the referenced verified data
 * cannot be resolved — the caller then refuses to derive the plan at all
 * rather than rendering a partially-resolved journey.
 */
function resolveLeg(leg, orientedStages, currentLegId) {
  const byId = orientedStages?.[leg.orientation];
  const stage = byId ? byId[leg.stageId] : undefined;
  if (!stage) return null;
  return {
    id: leg.id,
    stageId: leg.stageId,
    orientation: leg.orientation,
    stage,
    isCurrent: currentLegId != null && leg.id === currentLegId,
  };
}

function buildDay(record, index, startDate, legs, pointers, tripItems, previousOvernight) {
  const date = dateForDayIndex(startDate, index);
  const stages = legs.map((l) => l.stage);
  const last = stages[stages.length - 1] ?? null;
  const overnight = resolveOvernight(record, stages, previousOvernight);
  return {
    id: record.id,
    index,
    number: index + 1,
    date,
    activities: record.activities.map((a) =>
      a.kind === 'hiking' ? { kind: 'hiking', legs: a.legs.map((l) => ({ ...l })) } : { ...a },
    ),
    kinds: record.activities.map((a) => a.kind),
    legs,
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
    // What the overnight WOULD be with no explicit reference stored. The
    // chooser needs it to offer the way back to derived behaviour — otherwise
    // a rest day that has been overridden once can never inherit again.
    derivedOvernight: deriveOvernight(record, stages, previousOvernight),
    travelItems: matchTravelItems(tripItems, date),
    isCurrent: pointers.currentDayId != null && record.id === pointers.currentDayId,
  };
}

/**
 * Derive the planned calendar days.
 *
 * Returns an EMPTY list when there is no plan — the canonical default state,
 * in which the app shows no dates and no planned days at all. A plan whose
 * legs cannot all be resolved against the oriented stage views (only
 * reachable transiently) also returns empty rather than rendering a broken
 * journey; the persisted value is repaired independently by normalizeDayPlan.
 *
 * @param {{canonical: Record<string, object>, opposite: Record<string, object>}} orientedStages
 *   The oriented stage views, keyed by absolute orientation then by STABLE
 *   physical stage id. Both views come from the verified itinerary transform
 *   (src/route/activeItinerary.ts) — 'canonical' is the forward itinerary's
 *   stages, 'opposite' the reverse itinerary's.
 * @param {object|null} dayPlan            The persisted plan, or null.
 * @param {ReadonlyArray<object>} tripItems Personal Trip items (read-only).
 */
export function buildPlannedDays(orientedStages, dayPlan, tripItems = []) {
  if (!dayPlan || !Array.isArray(dayPlan.days) || dayPlan.days.length === 0) return [];
  if (orientedStages == null || typeof orientedStages !== 'object') return [];

  const pointers = {
    currentDayId: dayPlan.currentDayId ?? null,
    currentLegId: dayPlan.currentLegId ?? null,
  };

  const resolved = [];
  for (const record of dayPlan.days) {
    const legs = [];
    for (const leg of hikingLegsOf(record)) {
      const derived = resolveLeg(
        leg,
        orientedStages,
        record.id === pointers.currentDayId ? pointers.currentLegId : null,
      );
      if (!derived) return []; // unresolvable verified data — refuse honestly
      legs.push(derived);
    }
    resolved.push({ record, legs });
  }

  const days = [];
  let previousOvernight = null;
  for (let i = 0; i < resolved.length; i++) {
    const { record, legs } = resolved[i];
    const day = buildDay(
      record,
      i,
      dayPlan.startDate,
      legs,
      pointers,
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

/**
 * EVERY planned day walking a canonical stage, in day order. A stage may be
 * planned on no day, one day or several days — callers must handle all
 * three, and no caller may quietly take the first of several occurrences.
 */
export function plannedDaysForStage(days, stageId) {
  if (!Array.isArray(days) || stageId == null) return [];
  return days.filter((d) => d.legs.some((l) => l.stageId === stageId));
}

/** Index of the current LEG within a derived planned day, or -1. */
export function currentLegIndex(day) {
  if (!day || !Array.isArray(day.legs)) return -1;
  return day.legs.findIndex((l) => l.isCurrent);
}
