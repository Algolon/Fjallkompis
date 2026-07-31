/**
 * Day plan — coverage diagnostics.
 *
 * A v10 plan has no full-route invariant: skipping a stage, walking one
 * twice, walking one in reverse, starting late or finishing early are all
 * VALID personal choices. This selector describes how a plan differs from
 * the canonical through-route so the planner can SAY so — informationally,
 * in one compact summary — without ever framing a difference as an error.
 *
 * Everything here is a pure READ. No diagnostic invalidates a plan, blocks
 * an edit or triggers a mutation; resolving one is always the user's own
 * explicit decision on the day they choose to edit.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` exercises
 * the selector directly — the convention shared with dayPlan.mjs.
 */
import { isReversed } from '../route/direction.mjs';
import { hikingLegsOf } from './dayPlan.mjs';
import { orientedLegEndpoints } from './hikingLegs.mjs';

/**
 * Structured coverage diagnostics for a day list over the canonical
 * topology, read in the plan's own direction:
 *
 *   missingStageIds            canonical stages no leg walks (canonical order);
 *   repeatedStages             stages walked by more than one leg, with counts;
 *   oppositeLegIds             legs walked AGAINST the plan's direction (for a
 *                              forward plan: 'opposite' legs; for a reverse
 *                              plan: 'canonical' ones — a reverse plan's own
 *                              natural legs are not "reversed" to its walker);
 *   disconnectedDayBoundaries  consecutive hiking days (any number of travel
 *                              or rest days between) where one day's walk ends
 *                              somewhere other than the next one starts;
 *   omitsCanonicalStart/End    the personal journey does not begin/finish at
 *                              the canonical route's endpoints for the plan's
 *                              direction. Both true for a plan with no walking.
 *
 * @param {ReadonlyArray<object>} days      Persisted or derived day records.
 * @param {string} direction                The plan's stored direction.
 * @param {ReadonlyArray<import('../types').StageTopologyEntry>} topology
 */
export function dayPlanCoverageDiagnostics(days, direction, topology) {
  const list = Array.isArray(days) ? days : [];
  const stages = Array.isArray(topology) ? topology : [];
  const reversed = isReversed(direction);
  const naturalOrientation = reversed ? 'opposite' : 'canonical';
  const routeStartStopId = reversed
    ? (stages[stages.length - 1]?.toStopId ?? null)
    : (stages[0]?.fromStopId ?? null);
  const routeEndStopId = reversed
    ? (stages[0]?.fromStopId ?? null)
    : (stages[stages.length - 1]?.toStopId ?? null);

  const occurrences = new Map(stages.map((s) => [s.id, 0]));
  const oppositeLegIds = [];
  const hikingDays = [];
  for (const day of list) {
    const legs = hikingLegsOf(day);
    if (legs.length === 0) continue;
    hikingDays.push({ day, legs });
    for (const leg of legs) {
      occurrences.set(leg.stageId, (occurrences.get(leg.stageId) ?? 0) + 1);
      if (leg.orientation !== naturalOrientation) oppositeLegIds.push(leg.id);
    }
  }

  const missingStageIds = stages.filter((s) => (occurrences.get(s.id) ?? 0) === 0).map((s) => s.id);
  const repeatedStages = stages
    .filter((s) => (occurrences.get(s.id) ?? 0) > 1)
    .map((s) => ({ stageId: s.id, occurrences: occurrences.get(s.id) }));

  const disconnectedDayBoundaries = [];
  for (let i = 1; i < hikingDays.length; i++) {
    const previous = hikingDays[i - 1];
    const next = hikingDays[i];
    const end = orientedLegEndpoints(previous.legs[previous.legs.length - 1], stages);
    const start = orientedLegEndpoints(next.legs[0], stages);
    if (end && start && end.toStopId !== start.fromStopId) {
      disconnectedDayBoundaries.push({ fromDayId: previous.day.id, toDayId: next.day.id });
    }
  }

  const first = hikingDays[0] ?? null;
  const last = hikingDays[hikingDays.length - 1] ?? null;
  const journeyStart = first ? orientedLegEndpoints(first.legs[0], stages) : null;
  const journeyEnd = last ? orientedLegEndpoints(last.legs[last.legs.length - 1], stages) : null;

  return {
    missingStageIds,
    repeatedStages,
    oppositeLegIds,
    disconnectedDayBoundaries,
    omitsCanonicalStart:
      routeStartStopId != null && journeyStart?.fromStopId !== routeStartStopId,
    omitsCanonicalEnd: routeEndStopId != null && journeyEnd?.toStopId !== routeEndStopId,
  };
}

/** True when the plan differs from the canonical through-route in any way. */
export function hasCoverageDifferences(diagnostics) {
  if (diagnostics == null || typeof diagnostics !== 'object') return false;
  return (
    diagnostics.missingStageIds.length > 0 ||
    diagnostics.repeatedStages.length > 0 ||
    diagnostics.oppositeLegIds.length > 0 ||
    diagnostics.disconnectedDayBoundaries.length > 0 ||
    diagnostics.omitsCanonicalStart === true ||
    diagnostics.omitsCanonicalEnd === true
  );
}

/**
 * The compact summary lines the planner shows — the counted facts only,
 * phrased as information, never as errors. Empty when the plan walks the
 * whole canonical route straight through.
 */
export function coverageSummaryLines(diagnostics) {
  if (!hasCoverageDifferences(diagnostics)) return [];
  const lines = [];
  const n = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
  if (diagnostics.missingStageIds.length > 0) {
    lines.push(
      `${n(diagnostics.missingStageIds.length, 'route section is', 'route sections are')} not planned`,
    );
  }
  if (diagnostics.repeatedStages.length > 0) {
    lines.push(
      `${n(diagnostics.repeatedStages.length, 'section is', 'sections are')} walked more than once`,
    );
  }
  if (diagnostics.oppositeLegIds.length > 0) {
    lines.push(
      `${n(diagnostics.oppositeLegIds.length, 'leg is', 'legs are')} walked in reverse`,
    );
  }
  if (diagnostics.disconnectedDayBoundaries.length > 0) {
    lines.push(
      `${n(
        diagnostics.disconnectedDayBoundaries.length,
        'day starts somewhere other than',
        'days start somewhere other than',
      )} the day before ended`,
    );
  }
  if (diagnostics.omitsCanonicalStart) lines.push('the journey starts after the route’s start');
  if (diagnostics.omitsCanonicalEnd) lines.push('the journey ends before the route’s end');
  return lines;
}
