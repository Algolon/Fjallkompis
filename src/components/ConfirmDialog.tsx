import { useEffect, useId, useRef } from 'react';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

/** Everything reachable by Tab inside the dialog (buttons today, but kept
 *  general so a future field in a dialog stays trapped too). */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Compact, accessible confirmation dialog (extracted from the Settings route
 * direction flow so Lists can reuse it instead of native confirm()).
 *
 * Focus management: on open, the element that had focus is remembered and
 * focus moves to the primary action; Tab/Shift+Tab are trapped inside the
 * dialog (small local trap — no dependency); Escape and the backdrop cancel;
 * on close/unmount, focus returns to the remembered opener element.
 *
 * No new design language — reuses the app's button and card classes.
 * `destructive` styles the primary action with the danger treatment for
 * irreversible actions (delete item, restore defaults).
 */
export function ConfirmDialog({
  title,
  body,
  primaryLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useOverlayScrollLock();
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Latest cancel callback behind a stable ref, so the mount effect (focus
  // capture/restore + key handling) runs exactly once per dialog lifetime
  // even when the parent recreates the closure on re-render.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && dialog.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Restore focus to wherever the user was before the dialog opened
      // (skipped automatically if that element left the document, e.g. a
      // deleted item's own button — focus() on a detached node is a no-op).
      opener?.focus();
    };
  }, []);

  return (
    <div className="confirm-backdrop" onClick={() => onCancel()}>
      <div
        ref={dialogRef}
        className="card confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={(e) => e.stopPropagation()}
      >
        <span id={titleId} className="card-title">{title}</span>
        <p id={bodyId} className="card-sub" style={{ marginTop: 6 }}>
          {body}
        </p>
        <div className="row" style={{ marginTop: 14, gap: 10 }}>
          <button
            ref={confirmRef}
            className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`}
            style={{ flex: 1 }}
            onClick={onConfirm}
          >
            {primaryLabel}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
