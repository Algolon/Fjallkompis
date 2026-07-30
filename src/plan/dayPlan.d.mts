import type {
  DayActivity,
  DayActivityKind,
  DayPlanState,
  OvernightRef,
  PlannedDayRecord,
  RouteDirection,
} from '../types';

export declare const DAY_ACTIVITY_KINDS: DayActivityKind[];
export declare const DAY_ACTIVITY_LABELS: Record<DayActivityKind, string>;

export declare function newPlannedDayId(): string;

export declare function hikingActivity(
  day: PlannedDayRecord | null | undefined,
): Extract<DayActivity, { kind: 'hiking' }> | null;
export declare function hikingStagesOf(day: PlannedDayRecord | null | undefined): number;
export declare function hasActivity(
  day: PlannedDayRecord | null | undefined,
  kind: DayActivityKind,
): boolean;
export declare function isValidActivities(activities: unknown): boolean;
export declare function buildActivities(
  kinds: readonly DayActivityKind[],
  existingStages?: number,
): DayActivity[];

export declare function totalHikingStages(days: unknown): number;
export declare function isValidDays(days: unknown, stageCount: number): boolean;
export declare function isValidOvernight(ref: unknown): boolean;
export declare function defaultDays(stageCount: number): PlannedDayRecord[];
export declare function isDefaultDays(days: unknown, stageCount: number): boolean;

export declare function dateForDayIndex(startDate: unknown, index: number): string | null;

export declare function createDayPlan(
  direction: RouteDirection | string,
  startDate: string,
  stageCount: number,
): DayPlanState | null;

export declare function dayIndexById(days: readonly PlannedDayRecord[], dayId: string): number;
export declare function dayIndexForStageIndex(days: unknown, stageIndex: number): number;
export declare function currentDayIdAfterEdit(
  previousDays: readonly PlannedDayRecord[],
  nextDays: readonly PlannedDayRecord[],
  currentDayId: string | null,
  currentStageIndex: number,
): string | null;
export declare function firstStageIndexOfDay(days: unknown, dayIndex: number): number;
export declare function stagesAvailableFrom(days: unknown, dayIndex: number): number;

export declare function setHikingStages(
  days: readonly PlannedDayRecord[],
  dayIndex: number,
  stages: number,
): PlannedDayRecord[];
export declare function insertDay(
  days: readonly PlannedDayRecord[],
  index: number,
  kinds: readonly DayActivityKind[],
): PlannedDayRecord[];
export declare function canInsertHikingDay(days: unknown, index: number): boolean;
export declare function removeDay(
  days: readonly PlannedDayRecord[],
  index: number,
): PlannedDayRecord[];
export declare function canRemoveDay(days: unknown, index: number): boolean;
export declare function setDayActivities(
  days: readonly PlannedDayRecord[],
  index: number,
  kinds: readonly DayActivityKind[],
): PlannedDayRecord[];
export declare function reorderDayActivities(
  days: readonly PlannedDayRecord[],
  index: number,
): PlannedDayRecord[];
export declare function setDayOvernight(
  days: readonly PlannedDayRecord[],
  index: number,
  ref: OvernightRef | undefined | null,
): PlannedDayRecord[];

export declare function normalizeDayPlan(
  raw: unknown,
  activeDirection: RouteDirection | string,
  stageCount: number,
): DayPlanState | null;
