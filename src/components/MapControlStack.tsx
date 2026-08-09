/**
 * Map control stack — the compact column of map actions on the top-right edge
 * of the workspace: map layer, fit the current scope, a ONE-SHOT locate, and
 * live tracking / following.
 *
 * Why locate and tracking are two separate controls (and never one control
 * with a double-tap): they are different promises. "Locate me" is a single
 * question answered once — one fix, one recentre, no session, no battery
 * cost. "Start live tracking" opens a foreground session that keeps the GPS
 * awake and moves the camera with you. A hidden second gesture on one button
 * would make the expensive one undiscoverable, unreachable by keyboard and
 * easy to trigger by accident with a cold thumb.
 *
 * Rules these controls follow:
 *  - every target is at least 44×44 px;
 *  - state reads from icon, caption and the accessible name — never colour;
 *  - the paper-glass surface keeps contrast independent of the imagery
 *    underneath, with solid fallbacks;
 *  - no permanent zoom buttons on touch: pinch is the gesture, and MapLibre's
 *    own navigation control is added only for fine pointers (see MapView).
 *
 * CAPTIONS ARE FOR NON-DEFAULT STATES ONLY. A caption that is always present
 * is not state, it is decoration — and it costs real geometry: the caption
 * sits inside the 44px box, so a captioned control's glyph rides ~6px above
 * an uncaptioned one's and the column loses its optical rhythm. So: no
 * caption on the default terrain basemap ("Sat" only when satellite is on),
 * and no caption on idle tracking ("On"/"Hold" only while a session runs,
 * where the text is the only non-colour carrier of a three-way state).
 */
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Crosshair, Layers, Maximize, Navigation } from 'lucide-react';
import type { ImageryMode } from './MapView';
import { useCombinedArchiveStatus } from './OfflineMapCard';
import {
  CONTOURS_ARCHIVE,
  SATELLITE_ARCHIVE,
  TERRAIN_ARCHIVE,
} from '../map/offlineMap';

export function MapControlStack({
  stackRef,
  imagery,
  onImageryChange,
  satelliteAvailable,
  fitLabel,
  onFit,
  onLocate,
  locating,
  locateDisabled,
  trackingActive,
  following,
  onStartTracking,
  onResumeFollow,
}: {
  /** Measured by MapScreen for the camera's right padding. */
  stackRef?: RefObject<HTMLDivElement>;
  imagery: ImageryMode;
  onImageryChange: (mode: ImageryMode) => void;
  satelliteAvailable: boolean;
  /** "Fit route" / "Fit Day 3" — the accessible name of the fit action. */
  fitLabel: string;
  onFit: () => void;
  /** One GPS fix: update the marker, recentre once, start no session. */
  onLocate: () => void;
  locating: boolean;
  locateDisabled: boolean;
  trackingActive: boolean;
  following: boolean;
  onStartTracking: () => void;
  /** Recentre on the latest fix and resume a paused camera follow. */
  onResumeFollow: () => void;
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const layersRef = useRef<HTMLButtonElement>(null);

  // Optional map data, read from the SAME archive-status hook the Settings →
  // Offline maps cards render, so the two surfaces can never disagree about
  // what is on the device.
  const relief = useCombinedArchiveStatus([TERRAIN_ARCHIVE, CONTOURS_ARCHIVE]);
  const satellite = useCombinedArchiveStatus([SATELLITE_ARCHIVE]);
  // A quiet standing fact, not a fault: the default basemap is complete and
  // usable without either of these. It is therefore a small glacier dot (the
  // "cool / technical / spatial" role), never a warning tone, and it is
  // suppressed while the probes are still running so the map never blinks a
  // marker at a hiker on the way to the truth.
  const optionalMissing =
    !relief.checking &&
    !satellite.checking &&
    (!relief.downloaded || !satellite.downloaded);

  // Live tracking has three states, and each one needs its own verb.
  const trackingLabel = !trackingActive
    ? 'Start live tracking'
    : following
      ? 'Following your position'
      : 'Resume following';

  return (
    <div className="map-controls" role="group" aria-label="Map controls" ref={stackRef}>
      <div className="map-ctrl-anchor">
        <button
          ref={layersRef}
          type="button"
          className="map-ctrl"
          aria-haspopup="true"
          aria-expanded={layersOpen}
          // The dot is decorative; the fact it carries belongs in the name, so
          // it is never colour-only for anyone.
          aria-label={
            optionalMissing
              ? 'Choose map layer — some optional map data is not downloaded'
              : 'Choose map layer'
          }
          onClick={() => setLayersOpen((o) => !o)}
        >
          <Layers size={20} strokeWidth={1.9} aria-hidden />
          {imagery === 'satellite' ? (
            <span className="map-ctrl__caption">Sat</span>
          ) : null}
          {optionalMissing ? <span className="map-ctrl__dot" aria-hidden /> : null}
        </button>
        {layersOpen ? (
          <LayerPopover
            imagery={imagery}
            satelliteAvailable={satelliteAvailable}
            reliefDownloaded={relief.downloaded}
            anchorRef={layersRef}
            onChoose={(mode) => {
              onImageryChange(mode);
              setLayersOpen(false);
              layersRef.current?.focus();
            }}
            onClose={() => {
              setLayersOpen(false);
              layersRef.current?.focus();
            }}
          />
        ) : null}
      </div>

      <button type="button" className="map-ctrl" aria-label={fitLabel} onClick={onFit}>
        <Maximize size={20} strokeWidth={1.9} aria-hidden />
      </button>

      <button
        type="button"
        className="map-ctrl"
        aria-label={locating ? 'Locating your position' : 'Locate me'}
        aria-busy={locating}
        // One request at a time: the button is inert while a fix is in flight,
        // and while a live session owns the position.
        disabled={locateDisabled}
        onClick={onLocate}
      >
        <Crosshair size={20} strokeWidth={1.9} aria-hidden />
        {locating ? <span className="map-ctrl__caption">…</span> : null}
      </button>

      <button
        type="button"
        className={`map-ctrl${trackingActive ? ' is-on' : ''}${
          trackingActive && !following ? ' is-paused' : ''
        }`}
        aria-label={trackingLabel}
        aria-pressed={trackingActive}
        onClick={trackingActive ? onResumeFollow : onStartTracking}
      >
        <Navigation size={19} strokeWidth={1.9} aria-hidden />
        {/* Idle needs no word — the arrow and the accessible name already say
            "start tracking". A RUNNING session does: On vs Hold is a real
            distinction that must not rest on colour alone. */}
        {trackingActive ? (
          <span className="map-ctrl__caption">{following ? 'On' : 'Hold'}</span>
        ) : null}
      </button>
    </div>
  );
}

/**
 * Small popover anchored to the layers button — deliberately NOT a bottom
 * sheet: choosing between two basemaps is a one-tap decision that should not
 * take over the screen. It is right-aligned to the stack so it always stays
 * inside the viewport, and it never covers more than a corner of the map.
 *
 * A single-choice radio group with the usual keyboard model: arrows move,
 * Home/End jump, Escape closes, focus returns to the button, and moving focus
 * out or pointing anywhere else closes it.
 */
function LayerPopover({
  imagery,
  satelliteAvailable,
  reliefDownloaded,
  anchorRef,
  onChoose,
  onClose,
}: {
  imagery: ImageryMode;
  satelliteAvailable: boolean;
  /** Terrain relief (hillshade + contours) — an optional enhancement to the
   *  terrain basemap, not a separate mode. Its absence is worth saying here
   *  because this popover is where the dot on the control sends the user. */
  reliefDownloaded: boolean;
  anchorRef: RefObject<HTMLButtonElement>;
  onChoose: (mode: ImageryMode) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const options: { mode: ImageryMode; name: string; note: string; disabled: boolean }[] = [
    {
      mode: 'terrain',
      // The basemap itself is always there; only the relief on top is
      // optional, so the note says which of the two is missing rather than
      // implying the map does not work.
      name: 'Terrain',
      note: reliefDownloaded
        ? 'Offline Nordic basemap with relief'
        : 'Offline Nordic basemap · relief not downloaded',
      disabled: false,
    },
    {
      mode: 'satellite',
      name: 'Satellite',
      // Unavailable satellite is explained right here, in one line — no
      // second surface, and no permanent banner on the map.
      note: satelliteAvailable ? 'Offline Sentinel-2 imagery' : 'Not downloaded',
      disabled: !satelliteAvailable,
    },
  ];

  // Focus starts on the active choice, so keyboard users land where they are.
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (active ?? ref.current?.querySelector('button'))?.focus();
  }, []);

  // Pointing anywhere else closes it — including on the map, which stays
  // interactive behind the popover.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [onClose, anchorRef]);

  const focusOption = (delta: number) => {
    const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(idx + delta + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      ref={ref}
      className="map-popover"
      role="radiogroup"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          focusOption(1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          focusOption(-1);
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
          (e.key === 'Home' ? buttons[0] : buttons[buttons.length - 1])?.focus();
        }
      }}
      // Tabbing past the last option leaves the popover: close it rather than
      // leaving an orphaned surface open behind the focus.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <span className="map-popover__title" id={titleId}>
        Map layer
      </span>
      {options.map((o) => (
        <button
          key={o.mode}
          type="button"
          role="radio"
          aria-checked={imagery === o.mode}
          className="map-popover__option"
          disabled={o.disabled}
          onClick={() => onChoose(o.mode)}
        >
          <span className="map-popover__name">{o.name}</span>
          <span className="map-popover__note">{o.note}</span>
        </button>
      ))}
      {/* One resolution pointer for both optional archives, instead of
          repeating "download this in Settings" on every option that happens
          to be missing. Said once, calmly, and only when there is something
          to resolve. */}
      {!reliefDownloaded || !satelliteAvailable ? (
        <span className="map-popover__foot">
          Add optional map data in Settings → Offline maps.
        </span>
      ) : null}
    </div>
  );
}
