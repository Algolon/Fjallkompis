import type { RouteDirection } from '../route/direction.mjs';

export interface StageEditorialEntry {
  estimatedHours: number;
  notes: Record<RouteDirection, string>;
}

export const STAGE_EDITORIAL: Record<string, StageEditorialEntry>;

export function stageNote(stageId: string, direction: RouteDirection | string): string;
export function stageEstimatedHours(stageId: string): number;
export function forwardStageNote(stageId: string): string;
