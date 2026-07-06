/**
 * Explicit live GPS tracking session for the TEMPORARY Delft pilot
 * (docs/delft-pilot-test.md). Complements — never replaces — the one-shot
 * useGeolocation hook the Kungsleden screens keep using.
 *
 * Lifecycle guarantees:
 *  - at most ONE navigator.geolocation.watchPosition watcher ever exists:
 *    start() is a no-op while a watcher is registered;
 *  - stop() clears the watcher; the same cleanup runs on unmount, so
 *    switching route context or leaving the Map tab always releases GPS;
 *  - high accuracy is requested; maximumAge 0 avoids replayed cached fixes
 *    (any that slip through are rejected as stale by the session logic).
 *
 * This is FOREGROUND PWA tracking while the app is open and on-screen. It
 * makes no background-tracking claims: when the screen locks or the browser
 * suspends the tab, updates stop until the app is foregrounded again.
 *
 * Every reading is folded through the pure session logic in
 * src/utils/pilotSession.mjs (acceptance, off-route debounce, progress
 * freezing, breadcrumb). The GPS log lives only in this hook's React state —
 * in memory for the current session, never persisted unless exported.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoutePoint } from '../route/types';
import { projectOntoRoute } from '../utils/routeProgress.mjs';
import {
  advancePilotSession,
  createPilotSession,
} from '../utils/pilotSession.mjs';
import type { PilotSession } from '../utils/pilotSession.mjs';

function messageFor(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied — tracking stopped. Allow location access for this site and start again.';
    case err.POSITION_UNAVAILABLE:
      return 'Position unavailable right now (no signal / location hardware off). Tracking keeps waiting for a fix.';
    case err.TIMEOUT:
      return 'No GPS fix within the time limit yet. Tracking keeps waiting — a clearer sky view helps.';
    default:
      return 'Could not get a location update.';
  }
}

export interface LiveTracking {
  /** True while a geolocation watcher is registered. */
  active: boolean;
  error: string | null;
  session: PilotSession;
  start: () => void;
  stop: () => void;
  /** Clears the recorded session (log, trail, progress). Keeps tracking state. */
  clearSession: () => void;
}

/**
 * @param stagePoints Full-resolution polyline of the route stage each fix is
 *                    projected onto (null while route data is unavailable —
 *                    fixes are then logged without projection).
 */
export function useLiveTracking(stagePoints: RoutePoint[] | null): LiveTracking {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PilotSession>(() => createPilotSession());
  const watchIdRef = useRef<number | null>(null);
  // Latest points reachable from the long-lived watcher callback.
  const pointsRef = useRef(stagePoints);
  pointsRef.current = stagePoints;

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setActive(false);
  }, []);

  const start = useCallback(() => {
    // Repeated start actions must never stack a second watcher.
    if (watchIdRef.current != null) return;
    if (!('geolocation' in navigator)) {
      setError('This device has no geolocation support.');
      return;
    }
    setError(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        const fix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy ?? null,
          timestamp: pos.timestamp,
        };
        setSession((s) => {
          const points = pointsRef.current;
          const proj =
            points && points.length >= 2
              ? projectOntoRoute(points, fix, { accuracyM: fix.accuracyM })
              : null;
          return advancePilotSession(s, fix, proj, Date.now());
        });
      },
      (err) => {
        setError(messageFor(err));
        // Only a permission denial is terminal; the watcher cannot recover
        // from it. Timeouts/unavailability are transient — keep watching.
        if (err.code === err.PERMISSION_DENIED) stop();
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
    setActive(true);
  }, [stop]);

  const clearSession = useCallback(() => setSession(createPilotSession()), []);

  // Unmount = leaving the pilot panel or the Map tab: always release GPS.
  useEffect(() => stop, [stop]);

  return { active, error, session, start, stop, clearSession };
}
