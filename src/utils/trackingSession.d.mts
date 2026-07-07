/** TypeScript surface for the plain-ESM live-tracking session logic. */

import type { RouteProjection } from './routeProgress.d.mts';

export type FixStatus = 'on-route' | 'uncertain' | 'off-route';
export type SessionRouteStatus = FixStatus | 'unknown';
export type RejectReason = 'invalid' | 'stale' | 'low-accuracy';

export interface TrackingFixInput {
  lat: number;
  lon: number;
  /** Reported accuracy in metres (null when the device gave none). */
  accuracyM: number | null;
  /** Position timestamp (ms epoch, from GeolocationPosition.timestamp). */
  timestamp: number;
}

export interface TrackingLogEntry {
  timestamp: number | null;
  receivedAt: number | null;
  /** Age of the fix at receipt (receivedAt − timestamp), ms. */
  ageMs: number | null;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  /** Full-route cross-track distance, metres. */
  crossTrackM: number | null;
  /** Current-stage along/percent (null when no stage projection). */
  alongKm: number | null;
  percent: number | null;
  /** True when the CURRENT-STAGE projection was reliable. */
  reliable: boolean;
  status: FixStatus;
  accepted: boolean;
  rejectReason: RejectReason | null;
}

export interface TrackingProgress {
  alongKm: number;
  remainingKm: number;
  percent: number;
  timestamp: number;
}

export interface TrackingAcceptedSummary {
  /** Full-route cross-track distance of the latest accepted fix, metres. */
  crossTrackM: number | null;
  status: FixStatus;
  /** True when the FULL-ROUTE projection was reliable. */
  reliable: boolean;
  timestamp: number;
}

export interface TrackingSessionOptions {
  /** Retain the per-reading diagnostic log (Delft pilot only). */
  keepLog: boolean;
  /** Retain the breadcrumb trail geometry (Delft pilot only). */
  keepTrail: boolean;
}

export interface TrackingSession {
  options: TrackingSessionOptions;
  log: TrackingLogEntry[];
  acceptedCount: number;
  rejectedCount: number;
  /** Breadcrumb as [lon, lat] positions (MapLibre order). */
  trail: [number, number][];
  lastFix: TrackingFixInput | null;
  lastAccepted: TrackingAcceptedSummary | null;
  routeStatus: SessionRouteStatus;
  offRouteStreak: number;
  uncertainStreak: number;
  /** True when the latest accepted fix matched the current stage reliably. */
  stageMatched: boolean;
  progress: TrackingProgress | null;
  /** True when newer fixes could not update `progress` (kept, not jumped). */
  progressStale: boolean;
}

export interface TrackingProjections {
  /** Projection against the COMPLETE route (drives route status). */
  route: RouteProjection | null;
  /** Projection against the CURRENT STAGE (drives progress). */
  stage: RouteProjection | null;
}

export const ACCURACY_UNCERTAIN_M: number;
export const MAX_ACCEPT_ACCURACY_M: number;
export const ON_ROUTE_FLOOR_M: number;
export const OFF_ROUTE_FLOOR_M: number;
export const OFF_ROUTE_CONSECUTIVE: number;
export const UNCERTAIN_UI_CONSECUTIVE: number;
export const MIN_TRAIL_STEP_M: number;
export const MAX_LOG_ENTRIES: number;

export function classifyFix(input: {
  crossTrackM: number | null;
  accuracyM: number | null | undefined;
}): FixStatus;

export function createTrackingSession(
  options?: Partial<TrackingSessionOptions>,
): TrackingSession;

export function advanceTrackingSession(
  session: TrackingSession,
  fix: TrackingFixInput | null,
  projections: TrackingProjections | null,
  nowMs: number,
): TrackingSession;

export function sessionToExport(
  session: TrackingSession,
  meta?: Record<string, unknown>,
): Record<string, unknown>;

export function sessionToCsv(session: TrackingSession): string;

// ---- Watcher lifecycle controller ------------------------------------------

export interface WatchError {
  /** GeolocationPositionError.code (1 = permission denied), -1 = no API. */
  code: number;
  /** True when the watcher was auto-stopped (permission denied / no API). */
  terminal: boolean;
}

export interface WatchController {
  isActive(): boolean;
  /** Returns false when already active or geolocation is unavailable. */
  start(): boolean;
  stop(): void;
}

export function createWatchController(args: {
  geolocation: Geolocation | null | undefined;
  onFix: (fix: TrackingFixInput) => void;
  onError?: (err: WatchError) => void;
}): WatchController;
