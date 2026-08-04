export type DockKind = 'idle' | 'no-stage' | 'locating' | 'error' | 'fix' | 'live';

export interface DockStatus {
  kind: DockKind;
  tone: 'neutral' | 'warn';
  headline: string;
  detail: string;
  actionKind: 'locate' | 'stop' | null;
  actionLabel: string | null;
  showProgress: boolean;
  percent: number | null;
}

export declare function dockStatus(options?: {
  trackingActive?: boolean;
  locating?: boolean;
  error?: string | null;
  hasCurrentStage?: boolean;
  stageLabel?: string | null;
  hasFix?: boolean;
  fixSource?: 'gps' | 'manual' | null;
  matched?: boolean;
  routeStatus?: 'on-route' | 'off-route' | 'uncertain' | 'unknown' | null;
  progressStale?: boolean;
  percent?: number | null;
  remainingLabel?: string | null;
}): DockStatus;
