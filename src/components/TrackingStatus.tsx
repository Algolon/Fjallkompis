/**
 * Compact map-level live-tracking status stack. Rendered INSIDE the MapLibre
 * container (via MapView's `overlay` prop) so it stays visible in the normal
 * and fullscreen map experience, positioned to avoid the navigation/
 * fullscreen controls (top-right), the imagery toggle (top-left) and the
 * scale/attribution (bottom edges).
 *
 * Priority (top of the stack = highest):
 *  1. off-route  — persistent qualified warning while the debounced session
 *     status is 'off-route'; disappears immediately on recovery. Non-modal,
 *     no dismissal, no sound/vibration/notifications, never a toast.
 *  2. uncertain  — lower-severity "GPS signal uncertain" once accuracy/
 *     distance has been ambiguous for ≥ UNCERTAIN_UI_CONSECUTIVE fixes
 *     (damps flicker without a second status system).
 *  3. active     — always shown while tracking: what's running, which stage,
 *     and that it costs battery.
 *
 * Accessibility: the visible pills are NOT live regions (a live region here
 * would re-announce every metre change). Instead one visually-hidden
 * role="status" element announces only meaningful TRANSITIONS (off-route
 * entered / recovered / GPS uncertain), derived from the debounced status.
 */
import { UNCERTAIN_UI_CONSECUTIVE } from '../utils/trackingSession.mjs';
import type { TrackingSession } from '../utils/trackingSession.mjs';

interface TrackingStatusProps {
  session: TrackingSession;
  /** Label of the tracked stage, e.g. "Day 3". */
  stageLabel: string;
}

export function TrackingStatusOverlay({ session, stageLabel }: TrackingStatusProps) {
  const offRoute = session.routeStatus === 'off-route';
  const uncertain =
    !offRoute &&
    session.routeStatus === 'uncertain' &&
    session.uncertainStreak >= UNCERTAIN_UI_CONSECUTIVE;
  const crossTrackM = session.lastAccepted?.crossTrackM ?? null;

  // Announce transitions only — never per-fix distance updates.
  const announcement = offRoute
    ? 'You may be off route. Check the map and your surroundings.'
    : uncertain
      ? 'GPS signal uncertain, route status unavailable.'
      : session.routeStatus === 'on-route'
        ? 'On route.'
        : '';

  return (
    <div className="map-status-stack">
      <span className="sr-only" role="status">
        {announcement}
      </span>
      {offRoute ? (
        <div className="map-status-pill map-status-warn">
          <span aria-hidden>🧭</span>
          <span>
            You may be off route
            {crossTrackM != null && isFinite(crossTrackM)
              ? ` · approximately ${Math.round(crossTrackM)} m from the mapped route`
              : ''}
            . Check the map and your surroundings.
          </span>
        </div>
      ) : null}
      {uncertain ? (
        <div className="map-status-pill map-status-muted">
          <span aria-hidden>📡</span>
          <span>GPS signal uncertain · route status unavailable</span>
        </div>
      ) : null}
      <div
        className="map-status-pill map-status-live"
        title="Foreground only — updates pause if the screen locks or you leave the Map tab."
      >
        <span className="map-status-dot" aria-hidden />
        <span>
          Live tracking · {stageLabel} · higher battery use
        </span>
      </div>
    </div>
  );
}
