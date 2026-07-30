import type { DayPlanState } from '../types';
import type { ItineraryStage } from '../route/activeItinerary';
import type { ElevationSample } from '../route/types';

/**
 * One planned hiking day: one or more ADJACENT canonical stages walked on the
 * same date. Fully derived — never persisted (see DayPlanState).
 */
export interface PlannedDay {
  /** 1-based planned day number, in walking order. */
  number: number;
  /** 0-based index — what the store's boundary/activation actions address. */
  index: number;
  /** ISO date (yyyy-mm-dd), or null when no plan is configured. */
  date: string | null;
  /** Canonical stages in walking order — always at least one. */
  stages: ItineraryStage[];
  /** The day's starting stop (first stage's start). */
  fromStopId: string;
  /** The day's destination stop (last stage's end) — Today's "Tonight". */
  toStopId: string;
  /** Intermediate canonical boundaries; empty for a single-stage day. */
  viaStopIds: string[];
  /** Sum of the stages' GPX distances, in km. */
  distanceKm: number;
  /** Sums, or null when any component value is missing. */
  totalAscentM: number | null;
  totalDescentM: number | null;
  /** Extremes across the day's stages — never sums. */
  minimumElevationM: number | null;
  maximumElevationM: number | null;
  /** Sum of the per-stage personal estimates (always shown as an estimate). */
  estimatedHours: number;
  /** The stages' verified profiles, concatenated with cumulative offsets. */
  elevationProfile: ElevationSample[];
  /** True when this day contains the persisted current stage. */
  isCurrent: boolean;
}

export declare function buildPlannedDays(
  stages: readonly ItineraryStage[],
  dayPlan: DayPlanState | null,
  currentStageId: string | null,
): PlannedDay[];

export declare function currentPlannedDayOf(days: PlannedDay[]): PlannedDay | null;

export declare function currentPartIndex(
  day: PlannedDay | null,
  currentStageId: string | null,
): number;
