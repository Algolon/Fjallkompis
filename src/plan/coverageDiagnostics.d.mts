import type { RouteDirection, StageTopologyEntry } from '../types';

export interface DayPlanCoverageDiagnostics {
  missingStageIds: string[];
  repeatedStages: Array<{ stageId: string; occurrences: number }>;
  oppositeLegIds: string[];
  disconnectedDayBoundaries: Array<{ fromDayId: string; toDayId: string }>;
  omitsCanonicalStart: boolean;
  omitsCanonicalEnd: boolean;
}

export declare function dayPlanCoverageDiagnostics(
  days: unknown,
  direction: RouteDirection | string,
  topology: readonly StageTopologyEntry[],
): DayPlanCoverageDiagnostics;

export declare function hasCoverageDifferences(
  diagnostics: DayPlanCoverageDiagnostics | null | undefined,
): boolean;

export declare function coverageSummaryLines(
  diagnostics: DayPlanCoverageDiagnostics | null | undefined,
): string[];
