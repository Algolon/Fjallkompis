import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

/**
 * Compact "info" trigger that opens its explanatory content in an accessible
 * modal — a bottom sheet on narrow/mobile viewports and a centred dialog on
 * larger screens, both from ONE implementation (the app's `.sheet` <dialog>,
 * responsive via the ≥760px media query in global.css; same surface as the
 * Data sources & credits sheet).
 *
 * Accessibility:
 *  - the trigger is a real <button> with a descriptive `label` (accessible
 *    name) and a ≥44×44px touch target; it never relies on hover/tooltip;
 *  - native <dialog>.showModal() gives focus trapping, Escape-to-close and a
 *    backdrop for free; a visible Close action and backdrop click also close;
 *  - focus returns to the trigger on close (explicitly, so it holds across
 *    every close path).
 *
 * Only EXPLANATORY material belongs here — decision-critical warnings stay
 * rendered inline.
 */
export function ContextHelp({
  label,
  title,
  children,
  variant = 'header',
  triggerText,
  triggerClassName,
  triggerContent,
}: {
  /** Accessible name for the trigger, e.g. "About shop information". */
  label: string;
  /** Heading shown at the top of the sheet. */
  title: string;
  children: ReactNode;
  /** `header` sits beside a screen/section title; `inline` sits within body text. */
  variant?: 'header' | 'inline';
  /** Optional visible label on the trigger (icon + text) — for discoverability. */
  triggerText?: string;
  /** Custom trigger className — makes the trigger look like an existing chip. */
  triggerClassName?: string;
  /** Custom trigger content — replaces the default info icon (e.g. a whole chip). */
  triggerContent?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock(open);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    // Return focus to the trigger across every close path (Close button,
    // Escape, backdrop) so keyboard navigation stays where the user left it.
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={
          triggerClassName ??
          `ctx-help ctx-help--${variant}${triggerText ? ' ctx-help--labelled' : ''}`
        }
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {triggerContent ?? (
          <>
            <Info size={variant === 'header' ? 19 : 16} strokeWidth={2} aria-hidden />
            {triggerText ? <span>{triggerText}</span> : null}
          </>
        )}
      </button>

      <dialog
        ref={dialogRef}
        className="sheet"
        aria-labelledby={titleId}
        onClose={close}
        onClick={(e) => {
          // A click on the backdrop targets the <dialog> element itself.
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="sheet-body">
          <div className="row-between sheet-head">
            <h2 id={titleId}>{title}</h2>
            <button className="ctx-help-close" onClick={close} aria-label="Close">
              <X size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <div className="ctx-help-content">{children}</div>
        </div>
      </dialog>
    </>
  );
}
