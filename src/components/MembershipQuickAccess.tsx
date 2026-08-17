import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IdCard, Ticket, X } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useWalletDocuments } from '../hooks/useWalletDocuments';
import { quickAccessMembership } from '../wallet/walletModel.mjs';
import { linkedTravelDocuments } from '../wallet/todayQuickAccess.mjs';
import { openWalletDocument } from '../wallet/documentOpening';
import { MembershipCardViewer } from './MembershipCardViewer';
import { WalletPdfViewer } from './WalletPdfViewer';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';
import type { WalletDocument } from '../types';

/**
 * Compact document quick access beside the Tonight card (On route).
 *
 * Membership renders only when a document was explicitly marked for Today
 * (Membership + STF + "Show quick access on Today"). Tickets are the documents
 * explicitly attached to Travel items matching the planned day currently shown
 * on Today; links are never inferred from filenames, categories or dates.
 *
 * Every action is offered only when its file blob is verified locally
 * available. Metadata can outlive a browser-evicted file, so an unavailable
 * document remains honestly managed in Lists → Trip rather than becoming a
 * broken Today button. One ticket opens immediately; several open a compact
 * chooser first. PDFs open in the app's own full-screen viewer (the same
 * WalletPdfViewer as Wallet and Travel & stays) and images use the same
 * centred quick viewer as the STF membership card.
 *
 * The membership button is the STF roundel itself: the same asset this screen
 * shipped before the imagery cleanup, restored on purpose because the mark is
 * what makes the card recognisable at a glance. The provenance on record is
 * that the project owner supplied and approved this file — an owner decision,
 * not a licence granted by STF, and this component claims nothing wider. The
 * unlicensed stop photography withdrawn alongside it stays withdrawn.
 *
 * The mark is decorative (the button carries the accessible name), and a
 * failed image load degrades to the neutral boxed treatment — an IdCard glyph
 * over "STF" letters — so the target is never invisible.
 */
const STF_LOGO_SRC = `${import.meta.env.BASE_URL}images/stf-logo.png`;

export function MembershipQuickAccess() {
  const { currentPlannedDay } = useStore();
  const wallet = useWalletDocuments();
  const membership = useMemo(
    () => quickAccessMembership(wallet.documents),
    [wallet.documents],
  );
  const tickets = useMemo(
    () => linkedTravelDocuments(currentPlannedDay, wallet.documents),
    [currentPlannedDay, wallet.documents],
  );
  const candidates = useMemo(() => {
    const unique = new Map<string, WalletDocument>();
    if (membership) unique.set(membership.id, membership);
    for (const ticket of tickets) unique.set(ticket.id, ticket);
    return [...unique.values()];
  }, [membership, tickets]);
  const candidateKey = candidates.map((doc) => `${doc.id}:${doc.updatedAt}`).join('|');

  const [availableIds, setAvailableIds] = useState<Set<string>>(() => new Set());
  const [viewer, setViewer] = useState<{
    doc: WalletDocument;
    url: string;
    heading: string;
  } | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ doc: WalletDocument; blob: Blob } | null>(
    null,
  );
  const [choosingTickets, setChoosingTickets] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // Transient outcome feedback for the non-viewer results (PDF saved instead,
  // save cancelled, delivery failed, file vanished): Today has no notice
  // banner of its own, so the shared toast treatment carries the message —
  // a tap on a quick-access button must never end in silence.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const showNotice = (text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000);
  };
  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Verify every candidate blob on THIS device before offering an action.
  useEffect(() => {
    let live = true;
    setAvailableIds(new Set());
    if (candidates.length === 0) return;
    Promise.all(
      candidates.map(async (doc) => {
        try {
          return (await wallet.getFile(doc.id)) ? doc.id : null;
        } catch {
          return null;
        }
      }),
    ).then((ids) => {
      if (live) setAvailableIds(new Set(ids.filter((id): id is string => id != null)));
    });
    return () => {
      live = false;
    };
    // candidateKey captures ids + updated metadata; getFile/status are store-owned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey, wallet.status]);

  // Keep the membership contract explicit: metadata alone is not enough;
  // this device must still hold the linked blob before the STF action exists.
  const availableMembership = (() => {
    const doc = membership;
    const availableId = doc && availableIds.has(doc.id) ? doc.id : null;
    if (!doc || availableId !== doc.id) return null;
    return doc;
  })();
  const availableTickets = tickets.filter((doc) => availableIds.has(doc.id));

  const hideMissing = (id: string) => {
    setAvailableIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const open = async (doc: WalletDocument, heading: string) => {
    const result = await openWalletDocument(doc, wallet.getFile);
    if (result.kind === 'image') {
      setViewer({ doc, url: result.url, heading });
    } else if (result.kind === 'pdf') {
      // The app's own full-screen PDF viewer — the same surface Wallet and
      // Travel & stays open, so a ticket looks identical from every door.
      setPdfViewer({ doc, blob: result.blob });
    } else if (result.kind === 'missing') {
      // A race where the file vanished between verification and tap: hide it,
      // and say why the button the user just pressed is gone.
      hideMissing(doc.id);
      showNotice(
        `The file for “${doc.title}” is no longer stored on this device. ` +
          'Manage the document in Lists → Trip.',
      );
    } else if (result.kind === 'saved-copy') {
      showNotice('This document cannot be shown in the app, so a copy was saved instead.');
    } else if (result.kind === 'save-cancelled') {
      showNotice('Saving a copy was cancelled — the document is still stored here.');
    } else if (result.kind === 'failed') {
      showNotice(`“${doc.title}” could not be opened on this device. It is still stored here.`);
    }
  };

  const openTickets = () => {
    if (availableTickets.length === 1) {
      void open(availableTickets[0], availableTickets[0].title);
    } else if (availableTickets.length > 1) {
      setChoosingTickets(true);
    }
  };

  return (
    <>
      {availableMembership ? (
        <button
          className={
            logoFailed
              ? 'today-action-card today-glass today-glass--light stf-card stf-card--boxed'
              : 'stf-card'
          }
          onClick={() => void open(availableMembership, 'STF membership card')}
          aria-label="Open STF membership card"
        >
          {/* The button carries the accessible name, so everything inside it is
              decoration — the mark, the glyph and the letters are all hidden
              and "STF" is never announced twice. */}
          {logoFailed ? (
            <>
              <IdCard size={22} strokeWidth={1.8} aria-hidden />
              <span className="stf-card__label" aria-hidden>
                STF
              </span>
            </>
          ) : (
            <img
              src={STF_LOGO_SRC}
              alt=""
              aria-hidden
              draggable={false}
              onError={() => setLogoFailed(true)}
            />
          )}
        </button>
      ) : null}

      {availableTickets.length > 0 ? (
        <button
          type="button"
          className="ticket-card today-glass today-glass--light"
          onClick={openTickets}
          aria-label={
            availableTickets.length === 1
              ? `Open linked ticket: ${availableTickets[0].title}`
              : `Choose from ${availableTickets.length} linked tickets`
          }
        >
          <Ticket size={27} strokeWidth={1.9} aria-hidden />
          {availableTickets.length > 1 ? (
            <span className="ticket-card__count tnum" aria-hidden>
              {availableTickets.length}
            </span>
          ) : null}
        </button>
      ) : null}

      {choosingTickets ? (
        <TicketChooser
          documents={availableTickets}
          onChoose={(doc) => {
            setChoosingTickets(false);
            window.requestAnimationFrame(() => void open(doc, doc.title));
          }}
          onClose={() => setChoosingTickets(false)}
        />
      ) : null}

      {notice ? (
        <div className="pwa-toast-region" role="status" aria-live="polite" style={{ position: 'fixed' }}>
          <div className="pwa-toast">
            <p className="pwa-toast__msg">{notice}</p>
          </div>
        </div>
      ) : null}

      {viewer ? (
        <MembershipCardViewer
          doc={viewer.doc}
          url={viewer.url}
          heading={viewer.heading}
          onClose={() => {
            URL.revokeObjectURL(viewer.url);
            setViewer(null);
          }}
        />
      ) : null}

      {pdfViewer ? (
        <WalletPdfViewer
          key={pdfViewer.doc.id}
          doc={pdfViewer.doc}
          blob={pdfViewer.blob}
          onClose={() => setPdfViewer(null)}
        />
      ) : null}
    </>
  );
}

function TicketChooser({
  documents,
  onChoose,
  onClose,
}: {
  documents: WalletDocument[];
  onChoose: (doc: WalletDocument) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useOverlayScrollLock();

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="credential-viewer ticket-chooser"
      aria-labelledby={headingId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="credential-viewer__body ticket-chooser__body">
        <div className="row-between sheet-head">
          <h2 id={headingId}>Choose ticket</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close ticket chooser">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="ticket-chooser__list">
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className="ticket-choice"
              onClick={() => onChoose(doc)}
            >
              <Ticket size={20} strokeWidth={1.9} aria-hidden />
              <span>
                <strong>{doc.title}</strong>
                <small>{doc.mimeType === 'application/pdf' ? 'PDF ticket' : 'Image ticket'}</small>
              </span>
              <ChevronRightFallback />
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}

/** Kept local to avoid adding another icon import to the compact button row. */
function ChevronRightFallback() {
  return <span className="ticket-choice__chevron" aria-hidden>›</span>;
}
