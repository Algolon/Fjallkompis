/**
 * Live-tracking pill — the Map's only status surface, and only while a
 * foreground tracking session is running.
 *
 * Deliberately small and quiet: a blinking live dot, "Following Day 1", one
 * short route state, and an explicit Stop that is clearly separated from the
 * text (its own 44px button, never the whole pill). Nothing appears here in
 * the idle state — the map keeps the space.
 *
 * The wording comes from the pure map/mapTrackingPill.mjs, which owns the
 * qualified-status rules; this component is presentation and announcement
 * only. Transitions are announced once through a visually-hidden live region;
 * per-fix updates are never read out.
 */
import { Square } from 'lucide-react';
import { trackingAnnouncement } from '../map/mapTrackingPill.mjs';
import type { TrackingPill } from '../map/mapTrackingPill.mjs';

export function MapTrackingPill({
  pill,
  onStop,
}: {
  pill: TrackingPill;
  onStop: () => void;
}) {
  return (
    <div className={`map-track map-track--${pill.tone}`}>
      <span className="sr-only" role="status">
        {trackingAnnouncement(pill)}
      </span>
      <span className={`map-track__dot${pill.following ? ' is-live' : ''}`} aria-hidden />
      <span className="map-track__text">
        <span className="map-track__label">{pill.label}</span>
        <span className="map-track__state">{pill.state}</span>
      </span>
      <button
        type="button"
        className="map-track__stop"
        onClick={onStop}
        aria-label={`${pill.stopLabel} live tracking`}
      >
        <Square size={13} strokeWidth={2.8} aria-hidden />
        {pill.stopLabel}
      </button>
      <span className="sr-only">{pill.note}</span>
    </div>
  );
}
