/** TypeScript surface for the plain-ESM Delft-pilot tracking session logic. */

import type { RouteProjection } from './routeProgress.d.mts';

export type FixStatus = 'on-route' | 'uncertain' | 'off-route';
export type SessionRouteStatus = FixStatus | 'unknown';
export type RejectReason = 'invalid' | 'stale' | 'low-accuracy';

export interface PilotFixInput {
  lat: number;
  lon: number;
  /** Reported accuracy in metres (null when the device gave none). */
  accuracyM: number | null;
  /** Position timestamp (ms epoch, from GeolocationPosition.timestamp). */
  timestamp: number;
}

export interface PilotLogEntry {
  timestamp: number | null;
  receivedAt: number | null;
  /** Age of the fix at receipt (receivedAt − timestamp), ms. */
  ageMs: number | null;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  crossTrackM: number | null;
  alongKm: number | null;
  percent: number | null;
  reliable: boolean;
  status: FixStatus;
  accepted: boolean;
  rejectReason: RejectReason | null;
}

export interface PilotProgress {
  alongKm: number;
  remainingKm: number;
  percent: number;
  timestamp: number;
}

export interface PilotSession {
  log: PilotLogEntry[];
  acceptedCount: number;
  rejectedCount: number;
  /** Breadcrumb as [lon, lat] positions (MapLibre order). */
  trail: [number, number][];
  lastFix: PilotFixInput | null;
  routeStatus: SessionRouteStatus;
  offRouteStreak: number;
  progress: PilotProgress | null;
  /** True when newer fixes could not update `progress` (kept, not jumped). */
  progressStale: boolean;
}

export const ACCURACY_UNCERTAIN_M: number;
export const MAX_ACCEPT_ACCURACY_M: number;
export const ON_ROUTE_FLOOR_M: number;
export const OFF_ROUTE_FLOOR_M: number;
export const OFF_ROUTE_CONSECUTIVE: number;
export const MIN_TRAIL_STEP_M: number;
export const MAX_LOG_ENTRIES: number;

export function classifyFix(input: {
  crossTrackM: number | null;
  accuracyM: number | null | undefined;
}): FixStatus;

export function createPilotSession(): PilotSession;

export function advancePilotSession(
  session: PilotSession,
  fix: PilotFixInput | null,
  projection: RouteProjection | null,
  nowMs: number,
): PilotSession;

export function sessionToExport(
  session: PilotSession,
  meta?: Record<string, unknown>,
): Record<string, unknown>;

export function sessionToCsv(session: PilotSession): string;
