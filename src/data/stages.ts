import type { Stage } from '../types';
import { ROUTE, WAYPOINT_TO_HUT } from '../route/routeData';
import { forwardStageNote, stageEstimatedHours } from './stageEditorial.mjs';

/**
 * Stages = GPX-derived geometry/statistics (via src/route/routeData) merged
 * with editorial content that a GPX cannot know.
 *
 * - distanceKm, ascent/descent and elevation extremes come from the GPX and
 *   must never be hand-edited here;
 * - estimatedHours is a personal planning ESTIMATE (the GPX contains no
 *   timestamps) — screens must label it as such;
 * - notes are editorial and DIRECTION-AWARE (src/data/stageEditorial.mjs).
 *
 * This is the canonical FORWARD (Abisko → Nikkaluokta) stage list. The active
 * directional itinerary (src/route/activeItinerary.ts) rebuilds an equivalent
 * list oriented to the selected direction — screens consume that, not this.
 */
export const STAGES: Stage[] = ROUTE.stages.map((s) => ({
  id: s.id,
  day: s.day,
  fromHutId: WAYPOINT_TO_HUT[s.fromWaypointId],
  toHutId: WAYPOINT_TO_HUT[s.toWaypointId],
  distanceKm: s.statistics.distanceKm,
  estimatedHours: stageEstimatedHours(s.id),
  notes: forwardStageNote(s.id),
  totalAscentM: s.statistics.totalAscentM,
  totalDescentM: s.statistics.totalDescentM,
  minimumElevationM: s.statistics.minimumElevationM,
  maximumElevationM: s.statistics.maximumElevationM,
}));

export const STAGES_BY_ID: Record<string, Stage> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
);

export const DEFAULT_STAGE_ID = STAGES[0].id;
