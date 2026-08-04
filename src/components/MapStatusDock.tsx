/**
 * Trail status dock — the compact bar at the bottom of the map workspace,
 * immediately above the persistent bottom navigation.
 *
 * It is the map's answer to "where am I, and how far along am I?", in two
 * lines: a headline state, a detail line, an optional slim progress bar, and
 * ONE primary action (Locate, or Stop while a live session runs). The wording
 * per state is derived by the pure map/mapDockState.mjs — including the rule
 * that an unmatched fix never claims the hiker is off route.
 *
 * When the viewed scope and the tracked stage differ, the dock says both
 * explicitly ("Viewing Day 5 · Tracking Day 4") so stage progress can never
 * be read as belonging to whatever is being browsed.
 *
 * The status area itself is a button: it opens the details sheet with the
 * full progress readout, accuracy, errors, live tracking and the manual
 * position fallback. Nothing that used to be on the screen was dropped —
 * it stopped being permanently in front of the map.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Crosshair, Square } from 'lucide-react';
import type { DockStatus } from '../map/mapDockState.mjs';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

export function MapStatusDock({
  status,
  mismatch,
  onAction,
  onOpenDetails,
  detailsOpen,
}: {
  status: DockStatus;
  /** Viewed vs tracked stage, when they differ. */
  mismatch: { viewing: string; tracking: string } | null;
  onAction: () => void;
  onOpenDetails: () => void;
  detailsOpen: boolean;
}) {
  return (
    <div className={`map-dock map-dock--${status.tone}`}>
      <button
        type="button"
        className="map-dock__status"
        aria-haspopup="dialog"
        aria-expanded={detailsOpen}
        onClick={onOpenDetails}
      >
        {/* Transitions are announced once; the detail line is not a live
            region, so a walking hiker is never read a stream of metres. */}
        <span className="map-dock__headline" role="status">
          {status.headline}
        </span>
        <span className="map-dock__detail">{status.detail}</span>
        {mismatch ? (
          // One compact line rather than two pills: the dock has to stay
          // small enough that the camera can still frame the whole route
          // above it on a 320 px phone (see map/mapPadding.mjs).
          <span className="map-dock__scopes">
            Viewing <b>{mismatch.viewing}</b> · Tracking <b>{mismatch.tracking}</b>
          </span>
        ) : null}
        {status.showProgress && status.percent != null ? (
          <progress
            className="map-dock__bar"
            value={Math.round(status.percent)}
            max={100}
            aria-label={`Current stage completed: ${Math.round(status.percent)}%`}
          />
        ) : null}
      </button>

      {status.actionKind ? (
        <button
          type="button"
          className={`btn ${status.actionKind === 'stop' ? 'btn-danger' : 'btn-primary'} map-dock__action`}
          onClick={onAction}
        >
          {status.actionKind === 'stop' ? (
            <Square size={15} strokeWidth={2.6} aria-hidden />
          ) : (
            <Crosshair size={16} strokeWidth={2} aria-hidden />
          )}
          {status.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The dock's details sheet: same accessible sheet species as the scope and
 * layer sheets (native <dialog>, Escape and backdrop close, scroll lock,
 * focus returned to the opener).
 */
export function MapStatusSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet map-status-sheet"
      aria-labelledby="map-status-title"
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2 id="map-status-title">{title}</h2>
          <button className="link-btn" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
