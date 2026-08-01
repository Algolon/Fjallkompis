import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IdCard, Ticket, X } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useWalletDocuments } from '../hooks/useWalletDocuments';
import { quickAccessMembership } from '../wallet/walletModel.mjs';
import { linkedTravelDocuments } from '../wallet/todayQuickAccess.mjs';
import { openWalletDocument } from '../wallet/documentOpening';
import { MembershipCardViewer } from './MembershipCardViewer';
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
 * chooser first. PDFs use the platform viewer/download fallback and images use
 * the same centred quick viewer as the STF membership card.
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
  const [choosingTickets, setChoosingTickets] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

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

  const availableMembership =
    membership && availableIds.has(membership.id) ? membership : null;
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
    if (result.kind === 'image') setViewer({ doc, url: result.url, heading });
    // A race where the file vanished between verification and tap: hide it.
    if (result.kind === 'missing') hideMissing(doc.id);
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
        logoFailed ? (
          <button
            className="today-action-card today-glass today-glass--light stf-card stf-card--boxed"
            onClick={() => void open(availableMembership, 'STF membership card')}
            aria-label="Open STF membership card"
          >
            <IdCard size={22} strokeWidth={1.8} aria-hidden />
            <span className="stf-card__label" aria-hidden>
              STF
            </span>
          </button>
        ) : (
          <button
            className="stf-card"
            onClick={() => void open(availableMembership, 'STF membership card')}
            aria-label="Open STF membership card"
          >
            {/* The button carries the accessible name; the mark is decorative. */}
            <img
              src={STF_LOGO_SRC}
              alt=""
              aria-hidden
              draggable={false}
              onError={() => setLogoFailed(true)}
            />
          </button>
        )
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
