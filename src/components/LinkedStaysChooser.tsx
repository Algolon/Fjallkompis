import { useEffect, useId, useRef } from 'react';
import { BedDouble, ChevronRight, Plus, X } from 'lucide-react';
import type { StayTripItem } from '../types';
import { tripStatusTitle, tripStayTypeTitle } from '../trip/tripModel.mjs';
import { formatTripDate } from '../utils/format';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

/** One chooser row's date summary — check-in/check-out where present. */
function stayDates(stay: StayTripItem): string | null {
  if (stay.checkInDate && stay.checkOutDate) {
    return `${formatTripDate(stay.checkInDate)} – ${formatTripDate(stay.checkOutDate)}`;
  }
  if (stay.checkInDate) return `From ${formatTripDate(stay.checkInDate)}`;
  if (stay.checkOutDate) return `Until ${formatTripDate(stay.checkOutDate)}`;
  return null;
}

/**
 * Several personal stays link the same Journey Place (an arrival night and a
 * departure night, two separate bookings…) — this focused chooser lets the
 * user pick WHICH one to open instead of the app guessing at the first
 * match. The same native `.sheet` <dialog> pattern as every other modal:
 * focus enters on open and returns to the trigger on close; Escape,
 * backdrop and the X all cancel without changing anything.
 */
export function LinkedStaysChooser({
  placeName,
  stays,
  onOpenStay,
  onAddAnother,
  onClose,
}: {
  /** Display name of the place the stays link to (dialog title context). */
  placeName: string;
  stays: StayTripItem[];
  /** Open one stay's editor in the Trip section. */
  onOpenStay: (itemId: string) => void;
  /** Create one more prefilled Stay at this place. */
  onAddAnother: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Capture once during the opening render. React StrictMode replays effects
  // in development; recapturing inside the effect would make its second pass
  // remember the dialog's Close button instead of the external trigger.
  const openerRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useOverlayScrollLock();
  const headingId = useId();
  useEffect(() => {
    dialogRef.current?.showModal();
    return () => openerRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2 id={headingId}>Stays at {placeName}</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <p className="card-sub" style={{ marginTop: 6 }}>
          {stays.length} stays in your Trip plan link this place. Choose one to open.
        </p>
        <ul className="wallet-list" style={{ marginTop: 10 }}>
          {stays.map((stay) => {
            const dates = stayDates(stay);
            const context = stay.location ?? tripStayTypeTitle(stay.stayType);
            const accessible = [
              `${stay.title}, ${tripStatusTitle(stay.status)}`,
              ...(dates ? [dates] : []),
              context,
            ].join(', ');
            return (
              <li key={stay.id} className="card wallet-card">
                <button
                  className="wallet-card__open"
                  onClick={() => onOpenStay(stay.id)}
                  aria-label={`Open ${accessible}`}
                >
                  <span className="wallet-card__icon" aria-hidden>
                    <BedDouble size={20} strokeWidth={1.8} />
                  </span>
                  <span className="wallet-card__main">
                    <span className="wallet-card__title">{stay.title}</span>
                    <span className="wallet-card__sub trip-card__sub">
                      <span className={`trip-status trip-status--${stay.status}`}>
                        {tripStatusTitle(stay.status)}
                      </span>
                      {dates ? <span className="trip-card__detail">{dates}</span> : null}
                      <span className="trip-card__detail">{context}</span>
                    </span>
                  </span>
                  <ChevronRight
                    className="wallet-card__chevron"
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="btn btn-block"
          style={{ marginTop: 10 }}
          onClick={onAddAnother}
          aria-label={`Add another stay at ${placeName}`}
        >
          <Plus size={16} strokeWidth={2} aria-hidden /> Add another stay
        </button>
      </div>
    </dialog>
  );
}
