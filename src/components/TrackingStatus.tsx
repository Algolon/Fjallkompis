/**
 * Compact map-level live-tracking status. Rendered INSIDE the MapLibre
 * container (via MapView's `overlay` prop) so it stays visible in the normal
 * and fullscreen map experience.
 *
 * Layout (per the 0.6.0 field feedback — the old bottom-centre stack could
 * overlap the user's own tracking dot while Follow centres the map):
 *
 *  - TOP-RIGHT, beside the Terrain/Satellite toggle: a small "● Live 🔋"
 *    button (blinking dot, battery hint). Tapping it expands a compact
 *    details card below: "Live Tracking: Day X", battery note,
 *    foreground-only note. The damped "GPS signal uncertain" pill appears
 *    underneath when applicable.
 *  - TOP-LEFT, beneath the Terrain/Satellite toggle: a small off-route bar —
 *    compass icon + "You may be off route" + a ⚠ affordance. Tapping it pops
 *    the detail below the bar (approximate distance + "check the map and
 *    your surroundings"), attribution-control style. The bar itself stays
 *    while the debounced status is off-route and disappears immediately on
 *    recovery; only the DETAIL is toggleable.
 *
 * Never a modal, never a toast, no sound/vibration/notifications. Screen
 * readers are told about status TRANSITIONS only (visually-hidden
 * role="status"), never per-fix distance updates. The blink respects
 * reduced-motion.
 */
import { useState } from 'react';
import { UNCERTAIN_UI_CONSECUTIVE } from '../utils/trackingSession.mjs';
import type { TrackingSession } from '../utils/trackingSession.mjs';

/** "approximately 240 m" / "approximately 12.4 km" (sane at any distance). */
export function approxDistanceLabel(m: number): string {
  if (m < 1000) return `approximately ${Math.round(m)} m`;
  if (m < 10_000) return `approximately ${(m / 1000).toFixed(1)} km`;
  return `approximately ${Math.round(m / 1000)} km`;
}

interface TrackingStatusProps {
  session: TrackingSession;
  /** Label of the tracked stage, e.g. "Day 3". */
  stageLabel: string;
}

export function TrackingStatusOverlay({ session, stageLabel }: TrackingStatusProps) {
  const [liveOpen, setLiveOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);

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
    <>
      <span className="sr-only" role="status">
        {announcement}
      </span>

      {/* Top status: beside the Terrain/Satellite toggle. */}
      <div className="map-status-top">
        <button
          type="button"
          className="map-status-pill map-status-live"
          aria-expanded={liveOpen}
          onClick={() => setLiveOpen((o) => !o)}
          title="Live tracking details"
        >
          <span className="map-status-dot" aria-hidden />
          <span>Live</span>
          <span aria-hidden>🔋</span>
        </button>
        {liveOpen ? (
          <div className="map-status-details">
            <div>
              <strong>Live Tracking:</strong> {stageLabel}
            </div>
            <div>🔋 Higher battery usage while active</div>
            <div>
              Foreground only — pauses if the screen locks or you leave the
              Map tab.
            </div>
          </div>
        ) : null}
        {uncertain ? (
          <div className="map-status-pill map-status-muted">
            <span aria-hidden>📡</span>
            <span>GPS signal uncertain</span>
          </div>
        ) : null}
      </div>

      {/* Off-route bar: beneath the Terrain/Satellite toggle. */}
      {offRoute ? (
        <div className="map-status-offroute">
          <button
            type="button"
            className="map-status-pill map-status-warn"
            aria-expanded={warnOpen}
            onClick={() => setWarnOpen((o) => !o)}
            title="Off-route details"
          >
            <span aria-hidden>🧭</span>
            <span>You may be off route</span>
            <span className="map-status-warn-badge" aria-hidden>
              ⚠
            </span>
          </button>
          {warnOpen ? (
            <div className="map-status-details map-status-details-warn">
              {crossTrackM != null && isFinite(crossTrackM)
                ? `${approxDistanceLabel(crossTrackM)} from the mapped route. `
                : ''}
              Check the map and your surroundings.
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
