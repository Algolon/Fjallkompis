import { useCallback, useState } from 'react';
import type { LatLng } from '../types';

export type GeoStatus = 'idle' | 'locating' | 'success' | 'error';

export interface GeoState {
  status: GeoStatus;
  coord: LatLng | null;
  accuracyM: number | null;
  /** How the current coord was obtained — drives along-route matching. */
  source: 'gps' | 'manual' | null;
  /** Manual mode: the stop id the position was pinned to (else null). */
  manualStopId: string | null;
  /** Human-readable error for the UI. */
  error: string | null;
  timestamp: number | null;
}

const initial: GeoState = {
  status: 'idle',
  coord: null,
  accuracyM: null,
  source: null,
  manualStopId: null,
  error: null,
  timestamp: null,
};

function messageFor(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location permission denied. Use manual mode below.';
    case err.POSITION_UNAVAILABLE:
      return 'Position unavailable right now (no signal / hardware off).';
    case err.TIMEOUT:
      return 'Timed out getting a fix. Try again with a clearer sky view.';
    default:
      return 'Could not get your location.';
  }
}

/**
 * One-shot geolocation. We intentionally do NOT watchPosition by default to
 * save battery on a multi-day trip; the user taps "Use my location" when they
 * want a fresh fix. Returns a `locate()` you can wire to a button.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>(initial);

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({
        ...initial,
        status: 'error',
        error: 'This device has no geolocation support.',
      });
      return;
    }

    setState((s) => ({ ...s, status: 'locating', error: null }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'success',
          coord: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracyM: pos.coords.accuracy ?? null,
          source: 'gps',
          manualStopId: null,
          error: null,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        setState({
          status: 'error',
          coord: null,
          accuracyM: null,
          source: null,
          manualStopId: null,
          error: messageFor(err),
          timestamp: null,
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, []);

  const setManual = useCallback((coord: LatLng, stopId: string) => {
    setState({
      status: 'success',
      coord,
      accuracyM: null,
      source: 'manual',
      manualStopId: stopId,
      error: null,
      timestamp: Date.now(),
    });
  }, []);

  const reset = useCallback(() => setState(initial), []);

  return { ...state, locate, setManual, reset };
}
