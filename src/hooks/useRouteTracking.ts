/**
 * Explicit, opt-in foreground live-tracking session — the production hook
 * behind both the Kungsleden Map screen and the temporary Delft pilot.
 * Graduated from the pilot's useLiveTracking after the 2026-07-07 field test
 * (docs/pilot-results/delft-2026-07-07-summary.md).
 *
 * Lifecycle guarantees (enforced by the pure createWatchController and
 * covered by tests/tracking-session.test.mjs):
 *  - at most ONE navigator.geolocation.watchPosition watcher ever exists;
 *  - stop() clears the watcher; the same cleanup runs on unmount, so
 *    leaving the Map tab or switching route context always releases GPS;
 *  - changing the tracked stage (stageId) mid-session stops tracking and
 *    resets the session — data from two stages is never combined;
 *  - permission denial is terminal for the attempt; timeout/unavailable
 *    errors are transient and keep the watcher alive;
 *  - high accuracy is requested; maximumAge 0 avoids replayed cached fixes
 *    (any that slip through are rejected as stale by the session logic).
 *
 * This is FOREGROUND tracking while the app is open and on-screen: when the
 * screen locks or the browser suspends the tab, updates stop until the app
 * is foregrounded again. "Tracking active" is never persisted across
 * reloads.
 *
 * Every reading is folded through the pure session logic in
 * src/utils/trackingSession.mjs with TWO projections: the full route (for
 * on/off-route status) and the current stage (for progress). The session
 * lives only in this hook's React state — in memory, never persisted.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoutePoint } from '../route/types';
import { projectOntoRoute } from '../utils/routeProgress.mjs';
import {
  advanceTrackingSession,
  createTrackingSession,
  createWatchController,
} from '../utils/trackingSession.mjs';
import type { TrackingSession, WatchError } from '../utils/trackingSession.mjs';

function messageFor(err: WatchError): string {
  switch (err.code) {
    case -1:
      return 'This device has no geolocation support.';
    case 1: // PERMISSION_DENIED
      return 'Location permission denied — tracking stopped. Allow location access for this site and start again.';
    case 2: // POSITION_UNAVAILABLE
      return 'Position unavailable right now (no signal / location hardware off). Tracking keeps waiting for a fix.';
    case 3: // TIMEOUT
      return 'No GPS fix within the time limit yet. Tracking keeps waiting — a clearer sky view helps.';
    default:
      return 'Could not get a location update.';
  }
}

export interface RouteTrackingArgs {
  /** Complete route polyline — drives on/off-route status (null = none). */
  routePoints: RoutePoint[] | null;
  /** Current-stage polyline — drives progress (null = no stage selected). */
  stagePoints: RoutePoint[] | null;
  /**
   * Identity of the tracked stage. Changing it while tracking is active
   * stops the watcher and resets the session (never mixes two stages).
   */
  stageId: string | null;
  /** Retain the per-reading diagnostic log (Delft pilot only). */
  keepLog?: boolean;
  /** Retain the breadcrumb trail (Delft pilot only). */
  keepTrail?: boolean;
}

export interface RouteTracking {
  /** True while a geolocation watcher is registered. */
  active: boolean;
  error: string | null;
  session: TrackingSession;
  start: () => void;
  stop: () => void;
  /** Clears the recorded session (log, trail, progress, status). */
  clearSession: () => void;
}

export function useRouteTracking({
  routePoints,
  stagePoints,
  stageId,
  keepLog = false,
  keepTrail = false,
}: RouteTrackingArgs): RouteTracking {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TrackingSession>(() =>
    createTrackingSession({ keepLog, keepTrail }),
  );

  // Latest geometry reachable from the long-lived watcher callback.
  const routeRef = useRef(routePoints);
  routeRef.current = routePoints;
  const stageRef = useRef(stagePoints);
  stageRef.current = stagePoints;
  const optionsRef = useRef({ keepLog, keepTrail });
  optionsRef.current = { keepLog, keepTrail };

  const controller = useMemo(
    () =>
      createWatchController({
        geolocation:
          typeof navigator !== 'undefined' && 'geolocation' in navigator
            ? navigator.geolocation
            : null,
        onFix: (fix) => {
          setError(null);
          setSession((s) => {
            const project = (points: RoutePoint[] | null) =>
              points && points.length >= 2
                ? projectOntoRoute(points, fix, { accuracyM: fix.accuracyM })
                : null;
            return advanceTrackingSession(
              s,
              fix,
              { route: project(routeRef.current), stage: project(stageRef.current) },
              Date.now(),
            );
          });
        },
        onError: (err) => {
          setError(messageFor(err));
          if (err.terminal) setActive(false);
        },
      }),
    [],
  );

  const stop = useCallback(() => {
    controller.stop();
    setActive(false);
  }, [controller]);

  const start = useCallback(() => {
    setError(null);
    if (controller.start()) setActive(true);
  }, [controller]);

  const clearSession = useCallback(
    () => setSession(createTrackingSession(optionsRef.current)),
    [],
  );

  // A different stage means a different session: stop and reset rather than
  // combining projections from two stages. (First render is not a "change".)
  const prevStageIdRef = useRef(stageId);
  useEffect(() => {
    if (prevStageIdRef.current === stageId) return;
    prevStageIdRef.current = stageId;
    stop();
    setSession(createTrackingSession(optionsRef.current));
  }, [stageId, stop]);

  // Unmount = leaving the Map tab / switching panels: always release GPS.
  useEffect(() => stop, [stop]);

  return { active, error, session, start, stop, clearSession };
}
