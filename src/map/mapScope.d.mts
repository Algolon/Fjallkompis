export interface StageScope {
  day: number;
  fromName: string;
  toName: string;
}

export declare const FULL_ROUTE_LABEL: string;
export declare function stageScopeLabel(stage: StageScope): string;
export declare function stageShortLabel(day: number): string;
export declare function scopePillLabel(options?: {
  focusLabel?: string | null;
  viewStage?: StageScope | null;
}): string;
export declare function scopeMismatch(options?: {
  viewedStageId?: string | null;
  viewedDay?: number | null;
  /** The persisted current stage — read-only here; the store owns it. */
  trackedStageId?: string | null;
  trackedDay?: number | null;
}): { viewing: string; tracking: string } | null;
