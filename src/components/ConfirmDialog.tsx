import { useEffect, useRef } from 'react';

/**
 * Compact, accessible confirmation dialog (extracted from the Settings route
 * direction flow so Lists can reuse it instead of native confirm()). Focus is
 * moved to the primary action on open; Escape and the backdrop cancel. No new
 * design language — reuses the app's button and card classes. `destructive`
 * styles the primary action with the danger treatment for irreversible
 * actions (delete item, restore defaults).
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
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div
        className="card confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
      >
        <span id="confirm-title" className="card-title">{title}</span>
        <p id="confirm-body" className="card-sub" style={{ marginTop: 6 }}>
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
