export interface TrackingPill {
  tone: 'neutral' | 'warn';
  following: boolean;
  label: string;
  state: string;
  stopLabel: string;
  note: string;
}

export declare function trackingPill(options?: {
  active?: boolean;
  following?: boolean;
  stageLabel?: string | null;
  routeStatus?: 'on-route' | 'off-route' | 'uncertain' | 'unknown' | null;
  uncertainStreak?: number;
  hasFix?: boolean;
}): TrackingPill | null;

export declare function trackingAnnouncement(pill: TrackingPill | null): string;
