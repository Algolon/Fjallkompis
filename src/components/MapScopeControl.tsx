/**
 * Scope control — the Map's top-left pill and its stage-selection sheet.
 *
 * The pill answers one question at a glance: WHICH geometry am I looking at
 * (the full route, one day, or a temporarily focused place/route opened
 * through "View on map")? Activating it opens an accessible sheet listing
 * the full route and every stage of the ACTIVE itinerary, where two
 * different things are marked separately and never merged:
 *
 *   · "Viewing"  — the stage the map is browsing (this control changes it);
 *   · "Current"  — the persisted trip stage that progress and live tracking
 *                  are computed from (only Stages changes that).
 *
 * The map itself is the surface, so the compact map never renders seven
 * permanent stage chips: the sheet holds them.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Route as RouteIcon } from 'lucide-react';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

export interface ScopeOption {
  /** Stage id, or null for the full-route overview. */
  id: string | null;
  label: string;
  /** Marked as the persisted current trip stage. */
  isCurrent: boolean;
}

export function MapScopeControl({
  label,
  options,
  viewStageId,
  onSelect,
  onStep,
}: {
  /** What the pill reads right now (scope or temporary focus label). */
  label: string;
  options: ScopeOption[];
  viewStageId: string | null;
  onSelect: (stageId: string | null) => void;
  /** Previous / next scope in itinerary order (overview → Day 1 … Day N). */
  onStep: (direction: 1 | -1) => void;
}) {
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        className="map-scope"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <RouteIcon size={17} strokeWidth={2.1} aria-hidden />
        <span className="map-scope__label">{label}</span>
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden />
      </button>
      {open ? (
        <ScopeSheet
          options={options}
          viewStageId={viewStageId}
          onSelect={(id) => {
            onSelect(id);
            setOpen(false);
          }}
          onStep={onStep}
          onClose={() => {
            setOpen(false);
            // Keyboard users return to the control they opened.
            pillRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function ScopeSheet({
  options,
  viewStageId,
  onSelect,
  onStep,
  onClose,
}: {
  options: ScopeOption[];
  viewStageId: string | null;
  onSelect: (stageId: string | null) => void;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Mounted only while open, so the mount lifecycle IS the lock lifecycle.
  useOverlayScrollLock();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet map-scope-sheet"
      aria-labelledby="map-scope-title"
      onClose={(e) => {
        // A dialog nested inside another surface must not let React's
        // re-bubbled close event reach the surface behind it.
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
          <h2 id="map-scope-title">View on the map</h2>
          <button className="link-btn" onClick={() => ref.current?.close()}>
            Close
          </button>
        </div>
        <p className="card-sub">
          Choosing what to view moves the map only. Route progress and live
          tracking stay on your current stage, which you set in Stages.
        </p>

        <div className="scope-list">
          {options.map((o) => {
            const viewing = o.id === viewStageId;
            return (
              <button
                key={o.id ?? 'full'}
                type="button"
                className="scope-option"
                aria-pressed={viewing}
                onClick={() => onSelect(o.id)}
              >
                <span className="scope-option__label">{o.label}</span>
                <span className="scope-option__marks">
                  {viewing ? <span className="pill pill-glacier">Viewing</span> : null}
                  {o.isCurrent ? <span className="pill pill-current">Current</span> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="row scope-steps">
          <button className="btn btn-ghost" onClick={() => onStep(-1)}>
            ‹ Previous
          </button>
          <button className="btn btn-ghost" onClick={() => onStep(1)}>
            Next ›
          </button>
        </div>
      </div>
    </dialog>
  );
}
