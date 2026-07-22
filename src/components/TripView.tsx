import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BedDouble,
  BusFront,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Luggage,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { StayTripItem, TransportTripItem, TripItem, WalletDocument } from '../types';
import {
  sortStayItems,
  sortTravelItems,
  stayPrefillFromStop,
  transportPrefillFromEntry,
  tripStatusTitle,
} from '../trip/tripModel.mjs';
import {
  applyMembershipMetadata,
  defaultTitleFromFilename,
  newWalletDocumentId,
  resolveWalletMimeType,
  sortWalletDocuments,
  walletCategoryTitle,
  walletSummaryText,
} from '../wallet/walletModel.mjs';
import { useWalletDocuments } from '../hooks/useWalletDocuments';
import { enforceMembershipQuickAccess } from '../wallet/walletStore.mjs';
import { openWalletDocument } from '../wallet/documentOpening';
import { useStore } from '../store/AppStore';
import { WalletEditorSheet, type WalletEditorFields } from './WalletEditorSheet';
import {
  TripItemSheet,
  TripModeIcon,
  TripStayIcon,
  type TripItemDraft,
  type TripItemPrefill,
} from './TripItemSheet';
import { TRANSPORT_ENTRIES } from '../data/transport.mjs';
import { STOPS_BY_ID } from '../data/stops';
import { formatBytes } from '../map/offlineMap';
import { downloadBlobFile } from '../utils/exportImport';
import { todayIso } from '../utils/format';

/** "2 Aug 2026" — unambiguous across season boundaries, still compact. */
function formatTripDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * One-shot launch instruction from another screen or tab (Add to Trip on a
 * Transport reference, Track stay on a route stop, a deep link to one item).
 * In-memory only — a refresh opens the plain Trip section.
 */
export type TripLaunch =
  | { kind: 'item'; itemId: string }
  | { kind: 'add-transport'; entryId: string }
  | { kind: 'add-stay'; stopId: string };

type EditorState =
  | { mode: 'chooser' }
  | { mode: 'add'; kind: 'transport' | 'stay'; prefill?: TripItemPrefill }
  | { mode: 'edit'; item: TripItem }
  | { mode: 'doc-add' }
  | { mode: 'doc-edit'; doc: WalletDocument };

function initialEditorFor(launch: TripLaunch | undefined, items: TripItem[]): EditorState | null {
  if (!launch) return null;
  if (launch.kind === 'item') {
    const item = items.find((i) => i.id === launch.itemId);
    return item ? { mode: 'edit', item } : null;
  }
  if (launch.kind === 'add-transport') {
    const entry = TRANSPORT_ENTRIES.find((e) => e.id === launch.entryId);
    return entry
      ? { mode: 'add', kind: 'transport', prefill: transportPrefillFromEntry(entry) }
      : { mode: 'add', kind: 'transport' };
  }
  const stop = STOPS_BY_ID[launch.stopId];
  return stop ? { mode: 'add', kind: 'stay', prefill: stayPrefillFromStop(stop) } : { mode: 'add', kind: 'stay' };
}

/**
 * Lists → Trip: the personal Trip plan. Structured Travel and Stay items
 * (PersistentState — they ride the JSON backup) plus standalone documents
 * (metadata + files in the dedicated IndexedDB database, offline on this
 * device only). Trip items are the primary objects; documents attach to them
 * as supporting material or stay standalone.
 */
export function TripView({ launch }: { launch?: TripLaunch | null }) {
  const { state, addTripItem, updateTripItem, deleteTripItem, removeTripAttachmentReferences } =
    useStore();
  const wallet = useWalletDocuments();
  const [editor, setEditor] = useState<EditorState | null>(() =>
    initialEditorFor(launch ?? undefined, state.trip),
  );
  const [viewer, setViewer] = useState<{ doc: WalletDocument; url: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const today = useMemo(() => todayIso(), []);

  const travel = useMemo(
    () =>
      sortTravelItems(
        state.trip.filter((i): i is TransportTripItem => i.kind === 'transport'),
        today,
      ),
    [state.trip, today],
  );
  const stays = useMemo(
    () =>
      sortStayItems(
        state.trip.filter((i): i is StayTripItem => i.kind === 'stay'),
        today,
      ),
    [state.trip, today],
  );

  /** Documents referenced by any item — they render on their item, not below. */
  const linkedDocIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of state.trip) for (const id of item.attachmentIds) ids.add(id);
    return ids;
  }, [state.trip]);

  const standaloneDocs = useMemo(
    () => sortWalletDocuments(wallet.documents.filter((d) => !linkedDocIds.has(d.id)), today),
    [wallet.documents, linkedDocIds, today],
  );

  const documentById = useMemo(() => {
    const map = new Map<string, WalletDocument>();
    for (const d of wallet.documents) map.set(d.id, d);
    return map;
  }, [wallet.documents]);

  // ---- Document opening (fully offline — the blob never touches the network)

  // PDF/image/missing behaviour lives in the shared openWalletDocument helper
  // (also used by the Today membership quick-access) — only the notices and
  // the viewer state are view-local here.
  const openDocument = async (doc: WalletDocument) => {
    setNotice(null);
    const result = await openWalletDocument(doc, wallet.getFile);
    if (result.kind === 'missing') {
      setNotice(
        `The file for “${doc.title}” is missing from local storage on this device. ` +
          'It may have been removed by the browser — delete the entry and add the document again.',
      );
    } else if (result.kind === 'pdf-downloaded') {
      setNotice(
        'This browser could not open the PDF viewer directly, so a copy was downloaded instead.',
      );
    } else if (result.kind === 'image') {
      setViewer({ doc, url: result.url });
    }
  };

  const exportDocument = async (doc: WalletDocument) => {
    const blob = await wallet.getFile(doc.id);
    if (!blob) {
      setNotice(`The file for “${doc.title}” is missing from local storage on this device.`);
      return;
    }
    downloadBlobFile(doc.fileName || doc.title, blob);
  };

  // ---- Persistence handlers ---------------------------------------------------

  /** Store newly picked files as documents, then save the item with the links. */
  const saveTripItem = async (draft: TripItemDraft, pendingFiles: File[]) => {
    const newIds: string[] = [];
    for (const file of pendingFiles) {
      const mimeType = resolveWalletMimeType(file.name, file.type);
      if (!mimeType) throw new Error(`Unsupported file: ${file.name}`);
      const now = Date.now();
      const doc: WalletDocument = {
        id: newWalletDocumentId(),
        title: defaultTitleFromFilename(file.name) || 'Untitled document',
        category: 'other',
        pinned: false,
        createdAt: now,
        updatedAt: now,
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      };
      await wallet.add(doc, file);
      newIds.push(doc.id);
    }
    const attachmentIds = [...draft.attachmentIds, ...newIds];

    if (editor?.mode === 'edit') {
      updateTripItem(editor.item.id, { ...draft, attachmentIds } as Partial<TripItem>);
    } else if (editor?.mode === 'add') {
      addTripItem({
        kind: editor.kind,
        ...draft,
        attachmentIds,
        ...(editor.prefill?.linkedTransportId
          ? { linkedTransportId: editor.prefill.linkedTransportId }
          : {}),
        ...(editor.prefill?.linkedStopId ? { linkedStopId: editor.prefill.linkedStopId } : {}),
      } as Omit<TripItem, 'id' | 'createdAt' | 'updatedAt'>);
    }
  };

  /**
   * Deleting an item always keeps its documents. Confirmation happens in the
   * item sheet through the shared accessible ConfirmDialog (which states the
   * documents-are-kept rule); by the time this runs the user has confirmed.
   */
  const deleteItem = (item: TripItem) => {
    deleteTripItem(item.id);
    setEditor(null);
  };

  const saveDocumentEditor = async (fields: WalletEditorFields, file: File | null) => {
    const now = Date.now();
    const fileMeta = (f: File) => {
      const mimeType = resolveWalletMimeType(f.name, f.type);
      if (!mimeType) throw new Error(`Unsupported file: ${f.name}`);
      return { fileName: f.name, mimeType, sizeBytes: f.size };
    };
    // Membership metadata: the editor's submitted fields are AUTHORITATIVE.
    // applyMembershipMetadata clears both fields from the merged draft and
    // re-adds only what the submission carries — the editor omits the keys
    // when the organisation is unset or the toggle is off, so a plain
    // spread merge would let the document's previous values survive.
    //
    // Uniqueness is a SECOND transaction after the save (the store keeps
    // per-document writes simple). If it were ever to fail, the save itself
    // has still succeeded — so it must not reject into the editor's
    // "nothing was changed" error copy; quickAccessMembership stays
    // deterministic regardless, and the next flagged save re-enforces.
    const makeUnique = async (id: string) => {
      try {
        await enforceMembershipQuickAccess(id);
      } catch (err) {
        console.warn(
          'Fjällkompis: could not clear the previous Today quick-access flag; the newest choice still wins deterministically.',
          err,
        );
      }
    };
    if (editor?.mode === 'doc-edit') {
      const next: WalletDocument = applyMembershipMetadata(
        {
          ...editor.doc,
          ...fields,
          updatedAt: now,
          ...(file ? fileMeta(file) : {}),
        },
        fields,
      );
      if (!fields.date) delete next.date;
      if (!fields.note) delete next.note;
      await wallet.update(next, file);
      if (next.showOnToday) await makeUnique(next.id);
      await wallet.refresh();
    } else {
      if (!file) return;
      const doc: WalletDocument = applyMembershipMetadata(
        {
          id: newWalletDocumentId(),
          ...fields,
          createdAt: now,
          updatedAt: now,
          ...fileMeta(file),
        },
        fields,
      );
      await wallet.add(doc, file);
      if (doc.showOnToday) await makeUnique(doc.id);
      await wallet.refresh();
    }
  };

  /** Document deletion also clears any (stale) item references to it. */
  const removeDocument = async (id: string) => {
    await wallet.remove(id);
    removeTripAttachmentReferences(id);
  };

  // ---- Cards ------------------------------------------------------------------

  const attachmentInfo = (item: TripItem): { text: string; missing: boolean } | null => {
    const count = item.attachmentIds.length;
    if (count === 0) return null;
    const missing =
      wallet.status === 'ready' && item.attachmentIds.some((id) => !documentById.has(id));
    return {
      text: missing
        ? `${count} document${count === 1 ? '' : 's'} — some not on this device`
        : `${count} document${count === 1 ? '' : 's'}`,
      missing,
    };
  };

  const itemCard = (item: TripItem) => {
    const attach = attachmentInfo(item);
    const details: string[] = [];
    if (item.kind === 'transport') {
      if (item.from && item.to) details.push(`${item.from} → ${item.to}`);
      else if (item.from || item.to) details.push(item.from ?? item.to ?? '');
      if (item.date) {
        details.push(
          item.departureTime
            ? `${formatTripDate(item.date)} · ${item.departureTime}`
            : formatTripDate(item.date),
        );
      }
    } else {
      if (item.location) details.push(item.location);
      if (item.checkInDate && item.checkOutDate) {
        details.push(`${formatTripDate(item.checkInDate)} – ${formatTripDate(item.checkOutDate)}`);
      } else if (item.checkInDate) {
        details.push(`From ${formatTripDate(item.checkInDate)}`);
      } else if (item.checkOutDate) {
        details.push(`Until ${formatTripDate(item.checkOutDate)}`);
      }
    }
    const accessible = [
      `${item.title}, ${tripStatusTitle(item.status)}`,
      ...details,
      ...(attach ? [attach.text] : []),
    ].join(', ');
    return (
      <li key={item.id} className="card wallet-card">
        <button
          className="wallet-card__open"
          onClick={() => setEditor({ mode: 'edit', item })}
          aria-label={`Open ${accessible}`}
        >
          <span className="wallet-card__icon" aria-hidden>
            {item.kind === 'transport' ? (
              <TripModeIcon mode={item.mode} size={20} />
            ) : (
              <TripStayIcon stayType={item.stayType} size={20} />
            )}
          </span>
          <span className="wallet-card__main">
            <span className="wallet-card__title">{item.title}</span>
            <span className="wallet-card__sub trip-card__sub">
              <span className={`trip-status trip-status--${item.status}`}>
                {tripStatusTitle(item.status)}
              </span>
              {details.map((d) => (
                <span key={d} className="trip-card__detail">
                  {d}
                </span>
              ))}
              {attach ? (
                <span className={`trip-card__attach${attach.missing ? ' is-missing' : ''}`}>
                  {attach.missing ? (
                    <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
                  ) : (
                    <Paperclip size={12} strokeWidth={2.2} aria-hidden />
                  )}
                  {attach.text}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronRight className="wallet-card__chevron" size={18} strokeWidth={2} aria-hidden />
        </button>
      </li>
    );
  };

  const documentCard = (doc: WalletDocument) => (
    <li key={doc.id} className="card wallet-card">
      <button
        className="wallet-card__open"
        onClick={() => void openDocument(doc)}
        aria-label={`Open ${doc.title}${doc.pinned ? ' (pinned)' : ''}`}
      >
        <span className="wallet-card__icon" aria-hidden>
          {doc.mimeType === 'application/pdf' ? (
            <FileText size={20} strokeWidth={1.8} />
          ) : (
            <ImageIcon size={20} strokeWidth={1.8} />
          )}
        </span>
        <span className="wallet-card__main">
          <span className="wallet-card__title">
            {doc.pinned ? (
              <Pin className="wallet-card__pin" size={13} strokeWidth={2.2} aria-hidden />
            ) : null}
            {doc.title}
          </span>
          <span className="wallet-card__sub">
            {doc.pinned ? 'Pinned · ' : ''}
            {walletCategoryTitle(doc.category)}
            {doc.date ? ` · ${formatTripDate(doc.date)}` : ''}
            {' · '}
            <span className="tnum">{formatBytes(doc.sizeBytes)}</span>
          </span>
        </span>
        <ChevronRight className="wallet-card__chevron" size={18} strokeWidth={2} aria-hidden />
      </button>
      <button
        className="pack-edit wallet-card__edit"
        onClick={() => setEditor({ mode: 'doc-edit', doc })}
        aria-label={`Edit ${doc.title}`}
      >
        <Pencil size={15} strokeWidth={1.8} aria-hidden />
      </button>
    </li>
  );

  // ---- Render -----------------------------------------------------------------

  const hasItems = state.trip.length > 0;
  const hasDocs = wallet.status === 'ready' && standaloneDocs.length > 0;
  const everythingEmpty = !hasItems && !hasDocs && wallet.status !== 'loading';

  const addChooser = editor?.mode === 'chooser';

  return (
    <>
      {notice ? (
        <div className="banner-warn" role="alert" style={{ marginBottom: 14 }}>
          <span aria-hidden>⚠️</span>
          <span>{notice}</span>
        </div>
      ) : null}

      {wallet.status === 'unavailable' && !hasItems ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <TriangleAlert
              size={18}
              strokeWidth={2}
              aria-hidden
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <div>
              <span className="card-title">Document storage isn’t available here</span>
              <p className="card-sub" style={{ marginTop: 4 }}>
                This browser — or its private-browsing mode — doesn’t allow the local storage
                documents need, so files can’t be kept on this device. Travel and stay items
                still work; try a regular browsing window or install the app for documents.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {everythingEmpty && wallet.status !== 'unavailable' ? (
        <div className="card empty">
          <div className="glyph">
            <Luggage size={30} strokeWidth={1.6} aria-hidden />
          </div>
          <p>
            Add transport, stays and important documents for your trip. Everything is stored on
            this device and stays available offline on the trail — tickets and bookings can be
            attached to the plans they belong to.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => setEditor({ mode: 'chooser' })}
          >
            <Plus size={16} strokeWidth={2} aria-hidden /> Add item
          </button>
        </div>
      ) : (
        <>
          {travel.length > 0 ? (
            <section aria-label="Travel">
              <div className="section-label">Travel</div>
              <ul className="wallet-list">{travel.map(itemCard)}</ul>
            </section>
          ) : null}

          {stays.length > 0 ? (
            <section aria-label="Stays" style={{ marginTop: travel.length > 0 ? 16 : 0 }}>
              <div className="section-label">Stays</div>
              <ul className="wallet-list">{stays.map(itemCard)}</ul>
            </section>
          ) : null}

          {hasDocs ? (
            <section
              aria-label="Documents"
              style={{ marginTop: travel.length > 0 || stays.length > 0 ? 16 : 0 }}
            >
              <div className="section-label">Documents</div>
              <ul className="wallet-list">{standaloneDocs.map(documentCard)}</ul>
            </section>
          ) : null}

          {wallet.status === 'loading' ? (
            <p className="wallet-summary">Loading your documents…</p>
          ) : null}

          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 14 }}
            onClick={() => setEditor({ mode: 'chooser' })}
          >
            <Plus size={16} strokeWidth={2} aria-hidden /> Add item
          </button>

          {wallet.status === 'ready' && wallet.documents.length > 0 ? (
            <p className="wallet-summary">
              {walletSummaryText(wallet.documents.length, formatBytes(wallet.totalBytes))}
            </p>
          ) : null}
        </>
      )}

      {addChooser ? (
        <AddItemChooser
          onPick={(pick) => {
            if (pick === 'document') {
              if (wallet.status !== 'ready') {
                setEditor(null);
                setNotice(
                  'Document storage isn’t available in this browser mode, so a document can’t be added here.',
                );
                return;
              }
              setEditor({ mode: 'doc-add' });
            } else {
              setEditor({ mode: 'add', kind: pick });
            }
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {editor?.mode === 'add' || editor?.mode === 'edit' ? (
        <TripItemSheet
          kind={editor.mode === 'edit' ? editor.item.kind : editor.kind}
          item={editor.mode === 'edit' ? editor.item : undefined}
          prefill={editor.mode === 'add' ? editor.prefill : undefined}
          documents={wallet.documents}
          walletStatus={wallet.status}
          onSave={saveTripItem}
          onDelete={editor.mode === 'edit' ? () => deleteItem(editor.item) : undefined}
          onOpenDocument={(doc) => void openDocument(doc)}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {editor?.mode === 'doc-add' || editor?.mode === 'doc-edit' ? (
        <WalletEditorSheet
          doc={editor.mode === 'doc-edit' ? editor.doc : undefined}
          onSave={saveDocumentEditor}
          onDelete={
            editor.mode === 'doc-edit' ? () => removeDocument(editor.doc.id) : undefined
          }
          onExport={
            editor.mode === 'doc-edit' ? () => void exportDocument(editor.doc) : undefined
          }
          onClose={() => setEditor(null)}
        />
      ) : null}

      {viewer ? (
        <TripImageViewer
          doc={viewer.doc}
          url={viewer.url}
          onClose={() => {
            URL.revokeObjectURL(viewer.url);
            setViewer(null);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The Add item chooser: a trip item is transport, a stay or a standalone
 * document — never one enormous shared form.
 */
function AddItemChooser({
  onPick,
  onClose,
}: {
  onPick: (pick: 'transport' | 'stay' | 'document') => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
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
          <h2 id={headingId}>Add item</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <p className="card-sub" style={{ marginTop: 6 }}>
          What would you like to add to your trip plan?
        </p>
        <div className="trip-chooser">
          <button type="button" className="btn btn-block" onClick={() => onPick('transport')}>
            <BusFront size={16} strokeWidth={1.9} aria-hidden /> Transport
          </button>
          <button type="button" className="btn btn-block" onClick={() => onPick('stay')}>
            <BedDouble size={16} strokeWidth={1.9} aria-hidden /> Stay
          </button>
          <button type="button" className="btn btn-block" onClick={() => onPick('document')}>
            <FileText size={16} strokeWidth={1.9} aria-hidden /> Document
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * In-app image viewer — the same native `.sheet` <dialog> surface as every
 * other modal. The object URL is revoked by the parent on close. (The Today
 * membership quick-access uses its own centred MembershipCardViewer — a
 * credential view, not this generic document sheet.)
 */
export function TripImageViewer({
  doc,
  url,
  onClose,
}: {
  doc: WalletDocument;
  url: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sheet wallet-viewer"
      aria-label={doc.title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2>{doc.title}</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="wallet-viewer__frame">
          <img src={url} alt={doc.title} />
        </div>
      </div>
    </dialog>
  );
}
