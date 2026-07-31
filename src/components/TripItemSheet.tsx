import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Bed,
  BusFront,
  CarFront,
  FileUp,
  Hotel,
  House,
  MapPin,
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
import { checkOutMonthHint } from '../utils/dateTimeField.mjs';
import {
  MAX_WALLET_FILE_BYTES,
  WALLET_FILE_ACCEPT,
  validateWalletFile,
} from '../wallet/walletModel.mjs';
import { TRANSPORT_ENTRIES } from '../data/transport.mjs';
import {
  curatedOffRoutePlaces,
  journeyPlaceById,
  placeDisplayName,
  placeStayPrefill,
} from '../data/journeyPlaces.mjs';
import { STOPS_BY_ID, stopShortName } from '../data/stops';
import { useStore } from '../store/AppStore';
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
  /**
   * The stay's Place association as edited in this draft: a place id, or
   * undefined for "Not linked". Always present on a stay draft — an omitted
   * link IS the explicit unlinked state, applied on Save like every other
   * field. Never set on transport drafts.
   */
  linkedPlaceId?: string;
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
  location?: string;
  linkedPlaceId?: string;
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
  onViewPlace,
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
  /**
   * Trip → Place navigation: open this Journey Place on the Stops & places
   * screen (the sheet closes itself first). Offered only for a RESOLVED
   * linked place — an unavailable link states so instead.
   */
  onViewPlace?: (placeId: string) => void;
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
  const [location, setLocation] = useState(stay?.location ?? prefill?.location ?? '');
  const [checkInDate, setCheckInDate] = useState(stay?.checkInDate ?? '');
  const [checkOutDate, setCheckOutDate] = useState(stay?.checkOutDate ?? '');
  // The stay's Place association — part of the draft transaction exactly
  // like every other field ('' = not linked; applied on Save, Cancel keeps
  // the stored link).
  const [linkedPlaceId, setLinkedPlaceId] = useState(
    stay?.linkedPlaceId ?? prefill?.linkedPlaceId ?? '',
  );
  // Which stay fields the user has TYPED in this session. Choosing a place
  // in ADD mode may fill fields that are still untouched (blank-form
  // convenience) — it must never overwrite anything the user already
  // edited, and in EDIT mode it changes only the link itself.
  const touched = useRef({ title: false, stayType: false, location: false });

  // Active-itinerary ordering for the route group; stable ids throughout.
  const { itinerary } = useStore();

  const [attachmentIds, setAttachmentIds] = useState<string[]>(item?.attachmentIds ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);

  // Linked transport context — display only, never editable here. The link
  // degrades gracefully when the source record no longer exists. (A stay's
  // editable Place link renders as the Linked place control below instead.)
  const linkedTransportId = transport?.linkedTransportId ?? prefill?.linkedTransportId;
  const linkedSourceText = useMemo(() => {
    if (kind !== 'transport' || !linkedTransportId) return null;
    const entry = TRANSPORT_ENTRIES.find((e) => e.id === linkedTransportId);
    return entry
      ? `Linked to the timetable “${entry.title}”. Times and dates there are the general schedule — the plan here is yours.`
      : 'Linked to a timetable that is no longer in the app.';
  }, [kind, linkedTransportId]);

  // The draft's linked place, resolved against the CURRENT registries. An id
  // that no longer resolves is kept in the draft (and in the select, as its
  // own honest option) — never silently cleared; the user may relink or
  // choose Not linked explicitly.
  const linkedPlace = journeyPlaceById(linkedPlaceId, STOPS_BY_ID);
  const linkedPlaceName = placeDisplayName(linkedPlace, STOPS_BY_ID);
  const linkUnavailable = linkedPlaceId !== '' && linkedPlaceName === null;

  /**
   * Selecting a place changes ONLY the draft link. In add mode it may also
   * fill title / Stay type / location while those are still untouched —
   * verified defaults on a blank form — but never a field the user edited,
   * and in edit mode never any personal field at all.
   */
  const choosePlace = (placeId: string) => {
    setLinkedPlaceId(placeId);
    if (mode !== 'add') return;
    const defaults = placeStayPrefill(journeyPlaceById(placeId, STOPS_BY_ID), STOPS_BY_ID);
    if (!defaults) return;
    if (!touched.current.title) setTitle(defaults.title);
    if (!touched.current.stayType) setStayType(defaults.stayType);
    if (!touched.current.location && defaults.location) setLocation(defaults.location);
  };

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
            linkedPlaceId: clean(linkedPlaceId),
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
            onChange={(e) => {
              touched.current.title = true;
              setTitle(e.target.value);
            }}
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
              onChange={(e) => {
                touched.current.stayType = true;
                setStayType(e.target.value as TripStayType);
              }}
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
                onChange={(e) => {
                  touched.current.location = true;
                  setLocation(e.target.value);
                }}
              />
            </label>

            {/* The stay's editable Place association. Reference data only —
                choosing, moving or removing the link never rewrites the
                personal fields above (add-mode blank-form fills aside). */}
            <label className="field">
              <span>Linked place</span>
              <select
                className="select"
                value={linkedPlaceId}
                onChange={(e) => choosePlace(e.target.value)}
              >
                <option value="">Not linked</option>
                {linkUnavailable ? (
                  // The stored id no longer resolves: keep it selectable and
                  // honestly labelled instead of silently clearing it.
                  <option value={linkedPlaceId}>Linked place unavailable</option>
                ) : null}
                <optgroup label="Along the route">
                  {itinerary.orderedStops.map((stop) => (
                    <option key={stop.id} value={stop.id}>
                      {stopShortName(stop)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Before & after trail">
                  {curatedOffRoutePlaces().map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <p className="trip-linked-note">
              The place is reference information. Your dates, booking and notes stay personal.
            </p>
            {linkUnavailable ? (
              <p className="trip-linked-note trip-linked-note--warn">
                <TriangleAlert size={14} strokeWidth={2} aria-hidden /> Linked place is no
                longer available in this version.
              </p>
            ) : null}
            {linkedPlaceName && onViewPlace ? (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => onViewPlace(linkedPlaceId)}
                aria-label={`View place ${linkedPlaceName} in Stops & places`}
              >
                <MapPin size={15} strokeWidth={1.9} aria-hidden /> View place
              </button>
            ) : null}
            {/* Stay rollout of the app-owned picker (step 2 of the plan in
                docs/proposals/datetime-picker-system.md §12, after the
                owner's device pass on the transport pilot). The date-order
                rule stays on the draft exactly as before — the pickers
                only read/write the same '' | 'YYYY-MM-DD' strings. */}
            <div className="row trip-daterow" style={{ marginTop: 0 }}>
              <DateField
                label="Check-in (optional)"
                dialogTitle="Check-in"
                value={checkInDate}
                onChange={setCheckInDate}
                style={{ flex: 1 }}
              />
              <DateField
                label="Check-out (optional)"
                dialogTitle="Check-out"
                value={checkOutDate}
                onChange={setCheckOutDate}
                style={{ flex: 1 }}
                invalid={!stayOrderOk}
                describedBy={checkOutErrorId}
                openOnMonthOf={checkOutMonthHint(checkInDate) ?? undefined}
              />
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
                        {doc.fileMissing ? (
                          <TriangleAlert size={14} strokeWidth={2} aria-hidden />
                        ) : (
                          <Paperclip size={14} strokeWidth={1.9} aria-hidden />
                        )}
                        <span>
                          {doc.title}
                          {/* The link stays; the absent FILE is what is named.
                              Opening it states the same thing in full. */}
                          {doc.fileMissing ? ' — file unavailable on this device' : ''}
                        </span>
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
                <label className="field" style={{ marginTop: 8 }}>
                  <span className="sr-only">
                    Link an existing document — choosing one adds it to this item
                  </span>
                  <select
                    className="select"
                    value=""
                    onChange={(e) => {
                      // Choosing a document IS the link: it joins the draft
                      // list immediately (Save persists it, Cancel discards
                      // it) and the picker snaps back to its placeholder.
                      // The old choose → Link → Save chain silently lost a
                      // chosen document when Save came before Link — there
                      // must be no half-committed selection state to lose.
                      const id = e.target.value;
                      if (id === '') return;
                      setAttachmentIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
                    }}
                  >
                    <option value="">Link an existing document…</option>
                    {linkableDocuments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                        {/* A missing file is stated in the option itself:
                            the LINK is still meaningful (the relationship
                            survives re-adding the file), but nothing may
                            pretend the file is available on this device. */}
                        {d.fileMissing ? ' — file unavailable on this device' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : documents.length > 0 ? (
                <p className="trip-attach-hint">
                  Every stored document is already linked to this item.
                </p>
              ) : null}
            </>
          ) : walletStatus === 'loading' ? (
            // Loading is NOT unavailability: the first IndexedDB read can
            // take a moment on a cold start, and claiming "storage isn't
            // available" here sent users away from a working picker.
            <p className="trip-attach-hint">Loading documents…</p>
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
