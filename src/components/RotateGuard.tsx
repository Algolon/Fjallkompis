/**
 * Rotate-to-portrait guard — phones are portrait-only by product decision
 * (see src/utils/orientationGuard.mjs for the classification and why the
 * manifest cannot enforce this without breaking tablet landscape).
 *
 * A native <dialog> shown with showModal():
 *  - it joins the top layer, so it paints above every app surface —
 *    including an already-open <dialog> sheet like Data sources & credits;
 *  - modal semantics announce it to assistive technology and keep focus
 *    inside it (it contains no interactive controls, so focus rests on the
 *    dialog itself);
 *  - closing it lets the component hand focus back explicitly.
 *
 * The component stays mounted and toggles open/closed with `active`. While
 * active it also makes the app shell `inert` + aria-hidden, so the
 * obscured interface is unreachable by pointer, keyboard or screen reader
 * — but the React tree underneath is NEVER unmounted: hash destination,
 * screen state, an in-flight GPS watch / live-tracking session and the
 * MapLibre instance all survive the rotation, and MapView's own
 * ResizeObserver re-fits the map when portrait returns. On deactivation,
 * inert is lifted first and focus returns to the element that had it, so
 * the user resumes exactly where they were (never bounced to Today).
 */
import { useEffect, useRef, type RefObject } from 'react';

export function RotateGuard({
  active,
  shellRef,
}: {
  active: boolean;
  /** The .app shell to make inert while the guard is up. */
  shellRef: RefObject<HTMLElement>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const shell = shellRef.current;
    if (!dialog || !shell) return;

    if (active && !dialog.open) {
      lastFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      shell.setAttribute('inert', '');
      shell.setAttribute('aria-hidden', 'true');
      dialog.showModal();
    } else if (!active && dialog.open) {
      dialog.close();
      // Lift inert BEFORE restoring focus — focus() on an inert subtree is
      // a no-op, and the native dialog restore already ran while the shell
      // was still inert.
      shell.removeAttribute('inert');
      shell.removeAttribute('aria-hidden');
      const target = lastFocusRef.current;
      lastFocusRef.current = null;
      if (target && target.isConnected) target.focus();
    }
  }, [active, shellRef]);

  return (
    <dialog
      ref={dialogRef}
      className="rotate-guard"
      aria-labelledby="rotate-guard-title"
      aria-describedby="rotate-guard-text"
      // Esc must not dismiss the guard: portrait is the only way out.
      onCancel={(e) => e.preventDefault()}
    >
      {/* Decorative — the heading and text carry the full meaning. */}
      <svg
        className="rotate-guard__icon"
        viewBox="0 0 24 24"
        width="44"
        height="44"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="8.5" y="3.5" width="10" height="17" rx="2.2" />
        <path d="M13.5 17.5h.01" />
        <path d="M4.5 13a8 8 0 0 1 2.4-5.4" />
        <path d="M4.5 13l-1.7-1.2M4.5 13l1.9-.7" />
      </svg>
      <h1 id="rotate-guard-title">Rotate your phone</h1>
      <p id="rotate-guard-text">
        Fjällkompis is designed for portrait use on phones.
      </p>
    </dialog>
  );
}
