import type { DayPlanState, RouteDirection } from '../types';

/** One junction between two consecutive canonical stages, in walking order. */
export interface DayBoundaryState {
  /** 0-based index of the stage BEFORE the junction (walking order). */
  stageIndex: number;
  /** True when a hiking day ends at this junction. */
  active: boolean;
  /** Planned day this junction ends (active) or sits inside (removed). */
  dayIndex: number;
}

export declare function defaultGroups(stageCount: number): number[];
export declare function groupsTotal(groups: unknown): number;
export declare function isValidGroups(groups: unknown, stageCount: number): boolean;
export declare function isDefaultGrouping(groups: unknown, stageCount: number): boolean;
export declare function dayIndexForStageIndex(groups: unknown, stageIndex: number): number;
export declare function firstStageIndexOfDay(groups: unknown, dayIndex: number): number;
export declare function boundaryStates(groups: unknown): DayBoundaryState[];
export declare function combineAt(groups: unknown, stageIndex: number): number[];
export declare function splitAt(groups: unknown, stageIndex: number): number[];
export declare function toggleBoundary(groups: unknown, stageIndex: number): number[];
export declare function dateForDayIndex(
  firstDate: unknown,
  dayIndex: number,
): string | null;
export declare function createDayPlan(
  direction: RouteDirection | string,
  firstDate: string,
  stageCount: number,
): DayPlanState | null;
export declare function normalizeDayPlan(
  raw: unknown,
  activeDirection: RouteDirection | string,
  stageCount: number,
): DayPlanState | null;
