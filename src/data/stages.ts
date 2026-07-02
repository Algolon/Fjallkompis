import type { Stage } from '../types';
import { ROUTE, WAYPOINT_TO_HUT } from '../route/routeData';

/**
 * Stages = GPX-derived geometry/statistics (via src/route/routeData) merged
 * with editorial content that a GPX cannot know.
 *
 * - distanceKm, ascent/descent and elevation extremes come from the GPX and
 *   must never be hand-edited here;
 * - estimatedHours is a personal planning ESTIMATE (the GPX contains no
 *   timestamps) — screens must label it as such;
 * - notes are editorial.
 */
const EDITORIAL: Record<string, { estimatedHours: number; notes: string }> = {
  d1: {
    estimatedHours: 5,
    notes: 'Gentle start through birch forest along the Abiskojåkka river.',
  },
  d2: {
    estimatedHours: 6.5,
    notes: 'Long day climbing above the treeline. Exposed and beautiful.',
  },
  d3: {
    estimatedHours: 4.5,
    notes: 'Open high valley. Wind picks up approaching the pass.',
  },
  d4: {
    estimatedHours: 4.5,
    notes: 'Over the Tjäktja pass (route high point), then down to Sälka.',
  },
  d5: {
    estimatedHours: 4,
    notes: 'Valley walking. Singi is the junction for the Kebnekaise spur.',
  },
  d6: {
    estimatedHours: 5.5,
    notes: 'Leave the main Kungsleden east toward Kebnekaise station.',
  },
  d7: {
    estimatedHours: 6,
    notes: 'Final stretch out to Nikkaluokta. Boat shortcut option on Láddjujávri.',
  },
};

export const STAGES: Stage[] = ROUTE.stages.map((s) => ({
  id: s.id,
  day: s.day,
  fromHutId: WAYPOINT_TO_HUT[s.fromWaypointId],
  toHutId: WAYPOINT_TO_HUT[s.toWaypointId],
  distanceKm: s.statistics.distanceKm,
  estimatedHours: EDITORIAL[s.id]?.estimatedHours ?? 0,
  notes: EDITORIAL[s.id]?.notes ?? '',
  totalAscentM: s.statistics.totalAscentM,
  totalDescentM: s.statistics.totalDescentM,
  minimumElevationM: s.statistics.minimumElevationM,
  maximumElevationM: s.statistics.maximumElevationM,
}));

export const STAGES_BY_ID: Record<string, Stage> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
);

export const DEFAULT_STAGE_ID = STAGES[0].id;
