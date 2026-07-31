import type { PlannedDay } from './plannedDays.mjs';

/** How the day Today shows was resolved. */
export type TodaySource = 'preview' | 'manual' | 'date' | 'before-plan' | 'after-plan' | 'generic';

export type EffectiveToday =
  | { kind: 'generic'; stageId: string | null; day: null; source: 'generic' }
  | {
      kind: 'planned';
      dayId: string;
      day: PlannedDay;
      source: Exclude<TodaySource, 'generic'>;
    };

export declare const TODAY_SOURCES: TodaySource[];

export declare function plannedDayForDate(
  days: ReadonlyArray<PlannedDay>,
  iso: unknown,
): PlannedDay | null;

export declare function resolveEffectiveToday(
  days: ReadonlyArray<PlannedDay>,
  previewDayId: string | null,
  journeyActive: boolean,
  currentDayId: string | null,
  todayIso: string | null,
  currentStageId?: string | null,
): EffectiveToday;
