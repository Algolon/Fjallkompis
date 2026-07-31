import type {
  DayActivity,
  DayActivityKind,
  DayPlanState,
  HikingLegOrientation,
  TripItem,
} from '../types';
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
 * One derived hiking leg: the persisted leg identity resolved to the ORIENTED
 * stage view it references. `stage` is the forward itinerary's stage for a
 * 'canonical' orientation and the reverse itinerary's for an 'opposite' one —
 * both verified transforms of the same physical segment, never recomputed.
 */
export interface DerivedHikingLeg {
  /** The persisted stable leg id. */
  id: string;
  /** The physical canonical stage this leg walks. */
  stageId: string;
  /** The absolute orientation it is walked in. */
  orientation: HikingLegOrientation;
  /** The oriented stage view (endpoints, statistics, geometry, profile). */
  stage: ItineraryStage;
  /** True when this leg is the plan's active occurrence. */
  isCurrent: boolean;
}

/** The oriented stage views the derivation resolves legs against. */
export interface OrientedStageViews {
  canonical: Record<string, ItineraryStage>;
  opposite: Record<string, ItineraryStage>;
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
  /** The day's ordered derived legs. Empty when it does no walking. */
  legs: DerivedHikingLeg[];
  /** The legs' oriented stage views, in leg order (repeats appear twice). */
  stages: ItineraryStage[];
  /** First leg's oriented start stop, or null on a non-hiking day. */
  fromStopId: string | null;
  /** Last leg's oriented end stop, or null on a non-hiking day. */
  toStopId: string | null;
  /** Intermediate oriented boundaries; empty unless several legs. */
  viaStopIds: string[];
  /** Hiking aggregates over the day's LEGS. Zero / null on a non-hiking day. */
  distanceKm: number;
  totalAscentM: number | null;
  totalDescentM: number | null;
  minimumElevationM: number | null;
  maximumElevationM: number | null;
  estimatedHours: number;
  elevationProfile: ElevationSample[];
  /** The effective overnight (explicit, hiking endpoint, carried, or none). */
  overnight: ResolvedOvernight;
  /**
   * What the overnight would be with NO explicit reference stored — the
   * hiking endpoint, a rest day's carried location, or none. Never 'explicit'.
   * The overnight chooser offers this as the way back to derived behaviour.
   */
  derivedOvernight: ResolvedOvernight;
  /** Trip transport items recorded for this date — read-only, matched by date. */
  travelItems: TripItem[];
  /** True when this is the plan's active day. */
  isCurrent: boolean;
}

export declare function buildPlannedDays(
  orientedStages: OrientedStageViews,
  dayPlan: DayPlanState | null,
  tripItems?: readonly TripItem[],
): PlannedDay[];

export declare function currentPlannedDayOf(days: PlannedDay[]): PlannedDay | null;
export declare function plannedDaysForStage(
  days: PlannedDay[],
  stageId: string | null,
): PlannedDay[];
export declare function currentLegIndex(day: PlannedDay | null): number;
