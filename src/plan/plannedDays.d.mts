import type { DayActivity, DayActivityKind, DayPlanState, TripItem } from '../types';
import type { ItineraryStage } from '../route/activeItinerary';
import type { ElevationSample } from '../route/types';

/** The effective overnight for a day, with how it was resolved. */
export interface ResolvedOvernight {
  kind: 'stop' | 'stay' | 'none';
  stopId?: string;
  tripItemId?: string;
  /** explicit = the user set it; hiking = the day's endpoint; carried = the
      previous day's (a rest day stays where it was); derived = nothing. */
  source: 'explicit' | 'hiking' | 'carried' | 'derived';
}

/**
 * One derived planned calendar day. Fully derived — never persisted. Exists
 * only while a Day plan does: with no plan the derived list is EMPTY and the
 * app renders its original date-independent experience.
 */
export interface PlannedDay {
  /** The persisted stable day id. */
  id: string;
  /** 0-based position in the journey. */
  index: number;
  /** 1-based day number, as shown ("Day 4 of 9"). */
  number: number;
  /** ISO date (yyyy-mm-dd), derived from startDate + index. */
  date: string | null;
  /** The day's ordered activities. */
  activities: DayActivity[];
  /** The activity kinds, in order — what the day indicator reads. */
  kinds: DayActivityKind[];
  /** Canonical stages this day walks, in route order. Empty when it does not. */
  stages: ItineraryStage[];
  /** First stage's start stop, or null on a non-hiking day. */
  fromStopId: string | null;
  /** Last stage's end stop, or null on a non-hiking day. */
  toStopId: string | null;
  /** Intermediate canonical boundaries; empty unless several stages. */
  viaStopIds: string[];
  /** Hiking aggregates. Zero / null on a non-hiking day. */
  distanceKm: number;
  totalAscentM: number | null;
  totalDescentM: number | null;
  minimumElevationM: number | null;
  maximumElevationM: number | null;
  estimatedHours: number;
  elevationProfile: ElevationSample[];
  /** The effective overnight (explicit, hiking endpoint, carried, or none). */
  overnight: ResolvedOvernight;
  /** Trip transport items recorded for this date — read-only, matched by date. */
  travelItems: TripItem[];
  /** True when this is the plan's active day. */
  isCurrent: boolean;
}

/** One legal endpoint for a hiking day, with the consequence of choosing it. */
export interface HikingEndpointOption {
  stopId: string;
  stages: number;
  distanceKm: number;
  isCurrent: boolean;
  effect: 'none' | 'merge' | 'split';
}

export declare function buildPlannedDays(
  stages: readonly ItineraryStage[],
  dayPlan: DayPlanState | null,
  tripItems?: readonly TripItem[],
): PlannedDay[];

export declare function currentPlannedDayOf(days: PlannedDay[]): PlannedDay | null;
export declare function plannedDayForStage(
  days: PlannedDay[],
  stageId: string | null,
): PlannedDay | null;
export declare function currentPartIndex(
  day: PlannedDay | null,
  currentStageId: string | null,
): number;
export declare function hikingEndpointOptions(
  days: readonly PlannedDay[],
  dayIndex: number,
  stages: readonly ItineraryStage[],
): HikingEndpointOption[];
