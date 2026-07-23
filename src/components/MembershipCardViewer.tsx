import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { WalletDocument } from '../types';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

/**
 * Centred quick credential viewer for the Today STF membership quick access.
 *
 * Deliberately NOT the shared TripImageViewer: that viewer is the generic
 * Lists → Trip document surface and presents as a bottom sheet on mobile
 * (`.sheet`), which reads as "a form is opening". The quick-access use case
 * is showing a membership card at an STF hut reception — the credential
 * should appear front-and-centre immediately. Same native <dialog> modal
 * contract (showModal focus trap, Escape → onClose, backdrop click closes,
 * focus returns to the opener/roundel), different presentation
 * (`.credential-viewer`, centred scale/fade).
 *
 * The CALLER owns the object URL and must revoke it in onClose — identical
 * ownership rule to TripImageViewer, so documentOpening.ts stays the one
 * blob/open/revoke authority.
 */
export function MembershipCardViewer({
  doc,
  url,
  onClose,
}: {
  doc: WalletDocument;
  url: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();
  const headingId = useId();
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="credential-viewer"
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="credential-viewer__body">
        <div className="row-between sheet-head">
          <h2 id={headingId}>STF membership card</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {/* The document's own title is the image's text alternative — the
            dialog heading names the surface, the alt names the document. */}
        <img className="credential-viewer__img" src={url} alt={doc.title} />
      </div>
    </dialog>
  );
}
