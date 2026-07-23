import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Bed,
  BusFront,
  CarFront,
  FileUp,
  Hotel,
  House,
  Link2,
  Paperclip,
  Plane,
  Route,
  Ship,
  TentTree,
  TrainFront,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import type {
  TripItem,
  TripItemStatus,
  TripStayType,
  TripTransportMode,
  WalletDocument,
} from '../types';
import {
  TRIP_STATUSES,
  TRIP_STAY_TYPES,
  TRIP_TRANSPORT_MODES,
  isStayDateOrderValid,
} from '../trip/tripModel.mjs';
import {
  MAX_WALLET_FILE_BYTES,
  WALLET_FILE_ACCEPT,
  validateWalletFile,
} from '../wallet/walletModel.mjs';
import { TRANSPORT_ENTRIES } from '../data/transport.mjs';
import { STOPS } from '../data/stops';
import { formatBytes } from '../map/offlineMap';
import { ConfirmDialog } from './ConfirmDialog';
import { DateField } from './DateField';
import { TimeField } from './TimeField';
import type { WalletStatus } from '../hooks/useWalletDocuments';
import { useOverlayScrollLock } from '../hooks/useOverlayScrollLock';

/** Mode icon — always paired with a text label; never meaning by icon alone. */
export function TripModeIcon({ mode, size = 16 }: { mode: TripTransportMode; size?: number }) {
  const Icon =
    mode === 'flight'
      ? Plane
      : mode === 'train'
        ? TrainFront
        : mode === 'bus'
          ? BusFront
          : mode === 'boat'
            ? Ship
            : mode === 'taxi-shuttle'
              ? CarFront
              : Route;
  return <Icon size={size} strokeWidth={1.8} aria-hidden />;
}

/** Stay-type icon — always paired with a text label. */
export function TripStayIcon({ stayType, size = 16 }: { stayType: TripStayType; size?: number }) {
  const Icon =
    stayType === 'hotel-hostel'
      ? Hotel
      : stayType === 'mountain-station'
        ? House
        : stayType === 'mountain-hut'
          ? TentTree
          : Bed;
  return <Icon size={size} strokeWidth={1.8} aria-hidden />;
}

/** The editable fields the sheet returns on save (kind-specific ones optional). */
export interface TripItemDraft {
  title: string;
  status: TripItemStatus;
  notes?: string;
  bookingReference?: string;
  /** Final linked EXISTING document ids (order preserved). */
  attachmentIds: string[];
  // Transport
  mode?: TripTransportMode;
  from?: string;
  to?: string;
  date?: string;
  departureTime?: string;
  arrivalTime?: string;
  provider?: string;
  // Stay
  stayType?: TripStayType;
  location?: string;
  checkInDate?: string;
  checkOutDate?: string;
}

/** Add-mode prefill (Add to Trip / Track stay) — verified source facts only. */
export interface TripItemPrefill {
  title?: string;
  status?: TripItemStatus;
  mode?: TripTransportMode;
  from?: string;
  to?: string;
  provider?: string;
  stayType?: TripStayType;
  linkedStopId?: string;
  linkedTransportId?: string;
}

function isTransportItem(item: TripItem | undefined): item is Extract<TripItem, { kind: 'transport' }> {
  return item?.kind === 'transport';
}

function isStayItem(item: TripItem | undefined): item is Extract<TripItem, { kind: 'stay' }> {
  return item?.kind === 'stay';
}

/**
 * Shared add/edit sheet for Travel and Stay items — the app's `.sheet` native
 * <dialog> (bottom sheet on phones, centred modal on larger screens). Every
 * change — fields, attachment links, newly picked files — is applied only on
 * Save, by the parent; Cancel never alters stored data and never creates a
 * stray document.
 *
 * Attachments here are LINKS: removing one keeps the document itself (that is
 * stated in the UI). Deleting an actual file is a separate, explicit action
 * in the Documents group, available once a document is standalone.
 */
export function TripItemSheet({
  kind,
  item,
  prefill,
  documents,
  walletStatus,
  onSave,
  onDelete,
  onOpenDocument,
  onClose,
}: {
  kind: 'transport' | 'stay';
  /** Present in edit mode; absent in add mode. */
  item?: TripItem;
  /** Add-mode prefill from a verified source record. */
  prefill?: TripItemPrefill;
  /** All stored documents (attachment titles + the link-existing picker). */
  documents: WalletDocument[];
  walletStatus: WalletStatus;
  /** Persist the draft (+ newly picked files to store & link). May reject. */
  onSave: (draft: TripItemDraft, pendingFiles: File[]) => Promise<void>;
  /**
   * Edit mode: delete the item. Confirmation happens HERE (the shared
   * accessible ConfirmDialog, rendered inside this sheet's top layer);
   * the callback performs the actual removal. Documents are always kept.
   */
  onDelete?: () => void;
  /** Open a linked document offline (image viewer / PDF handoff). */
  onOpenDocument: (doc: WalletDocument) => void;
  onClose: () => void;
}) {
  const mode = item ? 'edit' : 'add';
  const dialogRef = useRef<HTMLDialogElement>(null);
  useOverlayScrollLock();
  const fileRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const checkOutErrorId = useId();

  const transport = isTransportItem(item) ? item : undefined;
  const stay = isStayItem(item) ? item : undefined;

  const [title, setTitle] = useState(item?.title ?? prefill?.title ?? '');
  const [status, setStatus] = useState<TripItemStatus>(
    item?.status ?? prefill?.status ?? 'needed',
  );
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [bookingReference, setBookingReference] = useState(item?.bookingReference ?? '');

  const [transportMode, setTransportMode] = useState<TripTransportMode>(
    transport?.mode ?? prefill?.mode ?? 'bus',
  );
  const [from, setFrom] = useState(transport?.from ?? prefill?.from ?? '');
  const [to, setTo] = useState(transport?.to ?? prefill?.to ?? '');
  const [date, setDate] = useState(transport?.date ?? '');
  const [departureTime, setDepartureTime] = useState(transport?.departureTime ?? '');
  const [arrivalTime, setArrivalTime] = useState(transport?.arrivalTime ?? '');
  const [provider, setProvider] = useState(transport?.provider ?? prefill?.provider ?? '');

  const [stayType, setStayType] = useState<TripStayType>(
    stay?.stayType ?? prefill?.stayType ?? 'mountain-hut',
  );
  const [location, setLocation] = useState(stay?.location ?? '');
  const [checkInDate, setCheckInDate] = useState(stay?.checkInDate ?? '');
  const [checkOutDate, setCheckOutDate] = useState(stay?.checkOutDate ?? '');

  const [attachmentIds, setAttachmentIds] = useState<string[]>(item?.attachmentIds ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [linkPick, setLinkPick] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);

  // Linked source context — display only, never editable here. The link
  // degrades gracefully when the source record no longer exists.
  const linkedTransportId = item?.linkedTransportId ?? prefill?.linkedTransportId;
  const linkedStopId = item?.linkedStopId ?? prefill?.linkedStopId;
  const linkedSourceText = useMemo(() => {
    if (linkedTransportId) {
      const entry = TRANSPORT_ENTRIES.find((e) => e.id === linkedTransportId);
      return entry
        ? `Linked to the timetable “${entry.title}”. Times and dates there are the general schedule — the plan here is yours.`
        : 'Linked to a timetable that is no longer in the app.';
    }
    if (linkedStopId) {
      const stop = STOPS.find((s) => s.id === linkedStopId);
      return stop
        ? `Linked to the route stop ${stop.name}.`
        : 'Linked to a route stop that is no longer in the app.';
    }
    return null;
  }, [linkedTransportId, linkedStopId]);

  const documentById = useMemo(() => {
    const map = new Map<string, WalletDocument>();
    for (const d of documents) map.set(d.id, d);
    return map;
  }, [documents]);

  // Documents linkable from here: stored, not already linked to THIS item.
  const linkableDocuments = useMemo(
    () => documents.filter((d) => !attachmentIds.includes(d.id)),
    [documents, attachmentIds],
  );

  const stayOrderOk = kind !== 'stay' || isStayDateOrderValid(checkInDate || undefined, checkOutDate || undefined);
  const canSave = title.trim() !== '' && stayOrderOk && !busy;

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const result = validateWalletFile(f);
    if (!result.ok) {
      setFileError(
        result.reason === 'too-large'
          ? `“${f.name}” is ${formatBytes(result.sizeBytes)} — larger than the ` +
            `${formatBytes(MAX_WALLET_FILE_BYTES)} per-file limit, so it was not added. ` +
            'Choose a smaller file.'
          : `“${f.name}” is not a supported format, so it was not added. ` +
            'PDF, JPG, PNG and WebP files only.',
      );
      return;
    }
    setFileError(null);
    setPendingFiles((cur) => [...cur, f]);
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setSaveError(null);
    const clean = (v: string) => (v.trim() !== '' ? v.trim() : undefined);
    const draft: TripItemDraft = {
      title: title.trim(),
      status,
      notes: clean(notes),
      bookingReference: clean(bookingReference),
      attachmentIds,
      ...(kind === 'transport'
        ? {
            mode: transportMode,
            from: clean(from),
            to: clean(to),
            date: clean(date),
            departureTime: clean(departureTime),
            arrivalTime: clean(arrivalTime),
            provider: clean(provider),
          }
        : {
            stayType,
            location: clean(location),
            checkInDate: clean(checkInDate),
            checkOutDate: clean(checkOutDate),
          }),
    };
    try {
      await onSave(draft, pendingFiles);
      onClose();
    } catch (err) {
      console.warn('Fjällkompis: could not save the trip item.', err);
      setSaveError(
        err instanceof DOMException && err.name === 'QuotaExceededError'
          ? 'Not enough local storage space to store the attached file. Free some space and try again.'
          : 'The item could not be saved. Nothing was changed — please try again.',
      );
      setBusy(false);
    }
  };

  const heading =
    mode === 'add'
      ? kind === 'transport'
        ? 'Add transport'
        : 'Add stay'
      : kind === 'transport'
        ? 'Edit transport'
        : 'Edit stay';

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={headingId}
      onClose={onClose}
      onCancel={(e) => {
        // While the delete confirmation is up, Escape belongs to IT (the
        // ConfirmDialog's own key handling) — the sheet must stay open.
        if (confirmingDelete) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !confirmingDelete) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2 id={headingId}>{heading}</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        {linkedSourceText ? <p className="trip-linked-note">{linkedSourceText}</p> : null}

        <label className="field" style={{ marginTop: 12 }}>
          <span>Title</span>
          <input
            className="input"
            value={title}
            placeholder={kind === 'transport' ? 'e.g. Bus to Nikkaluokta' : 'e.g. STF Abisko Turiststation'}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        {kind === 'transport' ? (
          <label className="field">
            <span>Transport mode</span>
            <select
              className="select"
              value={transportMode}
              onChange={(e) => setTransportMode(e.target.value as TripTransportMode)}
            >
              {TRIP_TRANSPORT_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>Stay type</span>
            <select
              className="select"
              value={stayType}
              onChange={(e) => setStayType(e.target.value as TripStayType)}
            >
              {TRIP_STAY_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>Status</span>
          <select
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as TripItemStatus)}
          >
            {TRIP_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>

        {kind === 'transport' ? (
          <>
            <div className="row" style={{ marginTop: 0 }}>
              <label className="field" style={{ flex: 1 }}>
                <span>From (optional)</span>
                <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>To (optional)</span>
                <input className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {/* App-owned pickers (Stage 1 pilot — the transport fields the
                broken Android popup hit hardest). Stay and Documents dates
                stay native until this behaviour is device-approved. */}
            <DateField
              label="Date (optional)"
              dialogTitle="Travel date"
              value={date}
              onChange={setDate}
            />
            <div className="row" style={{ marginTop: 0 }}>
              <TimeField
                label="Departure (optional)"
                dialogTitle="Departure"
                value={departureTime}
                onChange={setDepartureTime}
                style={{ flex: 1 }}
              />
              <TimeField
                label="Arrival (optional)"
                dialogTitle="Arrival"
                value={arrivalTime}
                onChange={setArrivalTime}
                style={{ flex: 1 }}
              />
            </div>
            <label className="field">
              <span>Provider / operator (optional)</span>
              <input
                className="input"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>Location (optional)</span>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>
            <div className="row" style={{ marginTop: 0 }}>
              <label className="field" style={{ flex: 1 }}>
                <span>Check-in (optional)</span>
                <input
                  className="input"
                  type="date"
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Check-out (optional)</span>
                <input
                  className="input"
                  type="date"
                  value={checkOutDate}
                  aria-invalid={!stayOrderOk}
                  aria-describedby={!stayOrderOk ? checkOutErrorId : undefined}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                />
              </label>
            </div>
            {!stayOrderOk ? (
              <p className="wallet-form-error" id={checkOutErrorId} role="alert">
                Check-out can’t be before check-in.
              </p>
            ) : null}
          </>
        )}

        <label className="field">
          <span>Booking reference (optional)</span>
          <input
            className="input"
            value={bookingReference}
            onChange={(e) => setBookingReference(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Notes (optional)</span>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {/* Attachments — links to documents, applied on Save. */}
        <div className="field" role="group" aria-label="Documents">
          <span>Documents (optional)</span>
          {attachmentIds.length > 0 || pendingFiles.length > 0 ? (
            <ul className="trip-attach-list">
              {attachmentIds.map((docId) => {
                const doc = documentById.get(docId);
                const missing = walletStatus === 'ready' && !doc;
                return (
                  <li key={docId} className="trip-attach-row">
                    {doc ? (
                      <button
                        type="button"
                        className="trip-attach-open"
                        onClick={() => onOpenDocument(doc)}
                      >
                        <Paperclip size={14} strokeWidth={1.9} aria-hidden />
                        <span>{doc.title}</span>
                      </button>
                    ) : (
                      <span className="trip-attach-missing">
                        <TriangleAlert size={14} strokeWidth={2} aria-hidden />
                        <span>
                          {missing
                            ? 'Document not available on this device'
                            : 'Document storage unavailable'}
                        </span>
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost trip-attach-remove"
                      onClick={() =>
                        setAttachmentIds((cur) => cur.filter((id) => id !== docId))
                      }
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
              {pendingFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="trip-attach-row">
                  <span className="trip-attach-open" aria-hidden={false}>
                    <FileUp size={14} strokeWidth={1.9} aria-hidden />
                    <span>
                      {f.name} · {formatBytes(f.size)} — stored on save
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost trip-attach-remove"
                    onClick={() => setPendingFiles((cur) => cur.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="trip-attach-hint">
            Removing a document here only unlinks it — the file stays under Documents.
          </p>
          {walletStatus === 'ready' ? (
            <>
              <button
                type="button"
                className="btn btn-block"
                style={{ marginTop: 6 }}
                onClick={() => fileRef.current?.click()}
              >
                <FileUp size={15} strokeWidth={1.9} aria-hidden /> Attach a file (PDF, JPG, PNG or
                WebP)
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={WALLET_FILE_ACCEPT}
                style={{ display: 'none' }}
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {linkableDocuments.length > 0 ? (
                <div className="row" style={{ marginTop: 8 }}>
                  <label className="field" style={{ marginTop: 0, flex: 1 }}>
                    <span className="sr-only">Link an existing document</span>
                    <select
                      className="select"
                      value={linkPick}
                      onChange={(e) => setLinkPick(e.target.value)}
                    >
                      <option value="">Link an existing document…</option>
                      {linkableDocuments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={linkPick === ''}
                    onClick={() => {
                      if (linkPick === '') return;
                      setAttachmentIds((cur) =>
                        cur.includes(linkPick) ? cur : [...cur, linkPick],
                      );
                      setLinkPick('');
                    }}
                  >
                    <Link2 size={15} strokeWidth={1.9} aria-hidden /> Link
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="trip-attach-hint">
              Document storage isn’t available in this browser mode, so files can’t be attached
              here. The item itself still saves.
            </p>
          )}
          {fileError ? (
            <p className="wallet-form-error" role="alert">
              {fileError}
            </p>
          ) : null}
        </div>

        {saveError ? (
          <p className="wallet-form-error" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={!canSave}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>

        {mode === 'edit' && onDelete ? (
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn btn-danger"
              style={{ flex: 1 }}
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
            >
              <Trash2 size={15} strokeWidth={1.8} aria-hidden />
              {kind === 'transport' ? 'Delete transport item' : 'Delete stay'}
            </button>
          </div>
        ) : null}

        {/* Rendered INSIDE the sheet's <dialog> so it stays interactive in
            the modal top layer. Deleting always keeps documents — said here. */}
        {confirmingDelete && item && onDelete ? (
          <ConfirmDialog
            title={`Delete “${item.title}”?`}
            body={
              item.attachmentIds.length > 0
                ? 'It will be removed from your trip plan. Its linked documents are kept and stay available under Documents.'
                : 'It will be removed from your trip plan.'
            }
            primaryLabel="Delete"
            destructive
            onConfirm={() => {
              setConfirmingDelete(false);
              onDelete();
            }}
            onCancel={() => setConfirmingDelete(false)}
          />
        ) : null}
      </div>
    </dialog>
  );
}
