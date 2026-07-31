import type { StageTopologyEntry } from '../types';

export declare function isLegacyHikingActivity(activity: unknown): boolean;
export declare function planUsesLegacyHiking(raw: unknown): boolean;
export declare function migrateLegacyDayPlan(
  raw: unknown,
  topology: readonly StageTopologyEntry[],
  currentStageId?: string | null,
): Record<string, unknown> | null;
