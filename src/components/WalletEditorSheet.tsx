import { useEffect, useId, useRef, useState } from 'react';
import { Download, FileUp, Trash2, X } from 'lucide-react';
import type { WalletCategory, WalletDocument } from '../types';
import {
  MAX_WALLET_FILE_BYTES,
  WALLET_CATEGORIES,
  WALLET_FILE_ACCEPT,
  defaultTitleFromFilename,
  validateWalletFile,
} from '../wallet/walletModel.mjs';
import { formatBytes } from '../map/offlineMap';
import { IconCheck } from './Icons';

/** The editable metadata the sheet returns on save. */
export interface WalletEditorFields {
  title: string;
  category: WalletCategory;
  date?: string;
  note?: string;
  pinned: boolean;
}

/**
 * Shared add/edit dialog for Trail Wallet documents — the app's `.sheet`
 * native <dialog> (bottom sheet on phones, centred modal on larger screens;
 * same surface as ContextHelp and the credits sheet). showModal() provides
 * focus trapping, Escape-to-close and the backdrop; a Cancel path never
 * alters the stored record — every change is applied only on Save, by the
 * parent, through the wallet store.
 */
export function WalletEditorSheet({
  doc,
  onSave,
  onDelete,
  onExport,
  onClose,
}: {
  /** Present in edit mode; absent in add mode. */
  doc?: WalletDocument;
  /** Persist the fields (+ the newly selected file, if any). May reject. */
  onSave: (fields: WalletEditorFields, file: File | null) => Promise<void>;
  /** Edit mode: delete the document (confirmation happens here first). */
  onDelete?: () => Promise<void>;
  /** Edit mode: export/download a copy of the stored file. */
  onExport?: () => void;
  onClose: () => void;
}) {
  const mode = doc ? 'edit' : 'add';
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState(doc?.title ?? '');
  const [titleEdited, setTitleEdited] = useState(mode === 'edit');
  const [category, setCategory] = useState<WalletCategory>(doc?.category ?? 'other');
  const [date, setDate] = useState(doc?.date ?? '');
  const [note, setNote] = useState(doc?.note ?? '');
  const [pinned, setPinned] = useState(doc?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The sheet mounts only while open: show the modal once, and return focus
  // to wherever the user was when it closes (native restoration can be lost
  // because the <dialog> unmounts).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const result = validateWalletFile(f);
    if (!result.ok) {
      setFile(null);
      setFileError(
        result.reason === 'too-large'
          ? `“${f.name}” is ${formatBytes(result.sizeBytes)} — larger than the ` +
            `${formatBytes(MAX_WALLET_FILE_BYTES)} per-file limit, so it was not stored. ` +
            'Choose a smaller file.'
          : `“${f.name}” is not a supported format, so it was not stored. ` +
            'Trail Wallet keeps PDF, JPG, PNG and WebP files only.',
      );
      return;
    }
    setFileError(null);
    setFile(f);
    // Sensible default title from the filename — only while the user hasn't
    // typed their own.
    if (!titleEdited) setTitle(defaultTitleFromFilename(f.name));
  };

  const canSave = title.trim() !== '' && (mode === 'edit' || file !== null) && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setSaveError(null);
    try {
      await onSave(
        {
          title: title.trim(),
          category,
          ...(date ? { date } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          pinned,
        },
        file,
      );
      onClose();
    } catch (err) {
      console.warn('Fjällkompis: could not save the Trail Wallet document.', err);
      setSaveError(
        err instanceof DOMException && err.name === 'QuotaExceededError'
          ? 'Not enough local storage space to save this document. Free some space (or remove another document) and try again.'
          : 'The document could not be saved to local storage. Nothing was changed — please try again.',
      );
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!doc || !onDelete) return;
    if (!confirm(`Delete “${doc.title}”? It will be removed from this device.`)) return;
    setBusy(true);
    setSaveError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      console.warn('Fjällkompis: could not delete the Trail Wallet document.', err);
      setSaveError('The document could not be deleted. Nothing was changed — please try again.');
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="row-between sheet-head">
          <h2 id={titleId}>{mode === 'add' ? 'Add document' : 'Edit document'}</h2>
          <button className="ctx-help-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        {/* File selection — required in add mode, optional replacement in edit
            mode. The accept list is the model's single source of truth. */}
        <div className="field" style={{ marginTop: 12 }}>
          <span>{mode === 'add' ? 'File (PDF, JPG, PNG or WebP)' : 'Replace file (optional)'}</span>
          <button
            type="button"
            className="btn btn-block"
            style={{ marginTop: 6 }}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp size={16} strokeWidth={2} aria-hidden />
            {file
              ? `${file.name} · ${formatBytes(file.size)}`
              : mode === 'add'
                ? 'Choose a file'
                : `Keep ${doc?.fileName || 'the current file'} · ${formatBytes(doc?.sizeBytes ?? 0)}`}
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
        </div>
        {fileError ? (
          <p className="wallet-form-error" role="alert">
            {fileError}
          </p>
        ) : null}

        <label className="field">
          <span>Title</span>
          <input
            className="input"
            value={title}
            placeholder="e.g. Bus ticket to Nikkaluokta"
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
          />
        </label>

        <label className="field">
          <span>Category</span>
          <select
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value as WalletCategory)}
          >
            {WALLET_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Date (optional)</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Note (optional)</span>
          <input
            className="input"
            value={note}
            placeholder="e.g. booking reference"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="check"
          aria-pressed={pinned}
          onClick={() => setPinned((v) => !v)}
          style={{ marginTop: 8 }}
        >
          <span className="box">
            <IconCheck />
          </span>
          <span className="label">Pin to the top of the list</span>
        </button>

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

        {mode === 'edit' ? (
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={onExport} disabled={busy}>
              <Download size={15} strokeWidth={1.8} aria-hidden /> Download a copy
            </button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={doDelete} disabled={busy}>
              <Trash2 size={15} strokeWidth={1.8} aria-hidden /> Delete
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
