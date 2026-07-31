import type {
  CanonicalHikingLeg,
  DayActivity,
  DayActivityKind,
  DayPlanState,
  HikingLegOrientation,
  OvernightRef,
  PlannedDayRecord,
  RouteDirection,
  StageTopologyEntry,
} from '../types';

export declare const DAY_ACTIVITY_KINDS: DayActivityKind[];
export declare const DAY_ACTIVITY_LABELS: Record<DayActivityKind, string>;

export declare function newPlannedDayId(): string;

/** Anything day-shaped: the persisted record or the derived planned day. */
type DayLike = { activities?: readonly DayActivity[] } | null | undefined;

export declare function hikingActivity(day: DayLike): Extract<DayActivity, { kind: 'hiking' }> | null;
export declare function hikingLegsOf(day: DayLike): CanonicalHikingLeg[];
export declare function hasActivity(day: DayLike, kind: DayActivityKind): boolean;
export declare function isValidActivities(activities: unknown, topology: unknown): boolean;
export declare function buildActivities(
  kinds: readonly DayActivityKind[],
  legs?: readonly CanonicalHikingLeg[],
): DayActivity[];

export declare function allPlanLegs(days: unknown): CanonicalHikingLeg[];
export declare function isValidDays(days: unknown, topology: unknown): boolean;
export declare function isValidOvernight(ref: unknown): boolean;
export declare function defaultDays(
  direction: RouteDirection | string,
  topology: readonly StageTopologyEntry[],
): PlannedDayRecord[];
export declare function isDefaultDays(
  days: unknown,
  direction: RouteDirection | string,
  topology: readonly StageTopologyEntry[],
): boolean;

export declare function dateForDayIndex(startDate: unknown, index: number): string | null;

export declare function createDayPlan(
  direction: RouteDirection | string,
  startDate: string,
  topology: readonly StageTopologyEntry[],
): DayPlanState | null;

export declare function dayIndexById(days: readonly PlannedDayRecord[], dayId: string): number;
export declare function pointersAfterEdit(
  nextDays: readonly PlannedDayRecord[],
  currentDayId: string | null,
  currentLegId: string | null,
): { currentDayId: string | null; currentLegId: string | null };

export declare function defaultLegsForNewDay(
  days: unknown,
  index: number,
  direction: RouteDirection | string,
  topology: readonly StageTopologyEntry[],
): CanonicalHikingLeg[];
export declare function insertDay(
  days: readonly PlannedDayRecord[],
  index: number,
  kinds: readonly DayActivityKind[],
  direction: RouteDirection | string,
  topology: readonly StageTopologyEntry[],
): PlannedDayRecord[];
export declare function removeDay(
  days: readonly PlannedDayRecord[],
  index: number,
): PlannedDayRecord[];
export declare function canRemoveDay(days: unknown, index: number): boolean;
export declare function setDayActivities(
  days: readonly PlannedDayRecord[],
  index: number,
  kinds: readonly DayActivityKind[],
  direction: RouteDirection | string,
  topology: readonly StageTopologyEntry[],
): PlannedDayRecord[];
export declare function dropHikingFromDay(
  days: readonly PlannedDayRecord[],
  index: number,
  replacementKinds: readonly DayActivityKind[],
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

export declare function addLegToDay(
  days: readonly PlannedDayRecord[],
  index: number,
  stageId: string,
  orientation: HikingLegOrientation,
  position: 'start' | 'end',
  topology: readonly StageTopologyEntry[],
): PlannedDayRecord[];
export declare function removeLegFromDay(
  days: readonly PlannedDayRecord[],
  index: number,
  legId: string,
  topology: readonly StageTopologyEntry[],
): PlannedDayRecord[];
export declare function reverseLegInDay(
  days: readonly PlannedDayRecord[],
  index: number,
  legId: string,
  topology: readonly StageTopologyEntry[],
): PlannedDayRecord[];
export declare function repeatLegInDay(
  days: readonly PlannedDayRecord[],
  index: number,
  legId: string,
  topology: readonly StageTopologyEntry[],
): PlannedDayRecord[];
export declare function moveLegInDay(
  days: readonly PlannedDayRecord[],
  index: number,
  fromIndex: number,
  toIndex: number,
  topology: readonly StageTopologyEntry[],
): PlannedDayRecord[];

export declare function normalizeDayPlan(
  raw: unknown,
  activeDirection: RouteDirection | string,
  topology: readonly StageTopologyEntry[],
  currentStageId?: string | null,
): DayPlanState | null;

export declare function stageOccurrences(
  days: unknown,
  stageId: string,
): Array<{ dayId: string; legId: string }>;
