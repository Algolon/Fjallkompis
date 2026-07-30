import type { PlannedDay } from './plannedDays.mjs';

/** How the day Today shows was resolved. */
export type TodaySource = 'override' | 'date' | 'generic';

export interface EffectiveToday {
  /** The planned day Today shows, or null for the generic Today. */
  day: PlannedDay | null;
  source: TodaySource;
}

export declare const TODAY_SOURCES: TodaySource[];

export declare function plannedDayForDate(
  days: ReadonlyArray<PlannedDay>,
  iso: unknown,
): PlannedDay | null;

export declare function resolveEffectiveToday(
  days: ReadonlyArray<PlannedDay>,
  currentDayId: string | null,
  todayIso: string | null,
): EffectiveToday;
