import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Pencil,
  Pin,
  Plus,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import type { WalletDocument } from '../types';
import {
  newWalletDocumentId,
  resolveWalletMimeType,
  sortWalletDocuments,
  walletCategoryTitle,
  walletSummaryText,
} from '../wallet/walletModel.mjs';
import { useWalletDocuments } from '../hooks/useWalletDocuments';
import { WalletEditorSheet, type WalletEditorFields } from './WalletEditorSheet';
import { formatBytes } from '../map/offlineMap';
import { downloadBlobFile } from '../utils/exportImport';
import { todayIso } from '../utils/format';

/** "2 Aug 2026" — unambiguous across season boundaries, still compact. */
function formatWalletDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

type EditorState = { mode: 'add' } | { mode: 'edit'; doc: WalletDocument };

/**
 * Lists → Trail Wallet: a small number of hiking documents (tickets,
 * bookings, memberships, insurance references, route PDFs) kept available
 * offline on this device. Deliberately narrow — not a file manager.
 *
 * Documents and their files live in the dedicated IndexedDB database behind
 * src/wallet/walletStore.mjs; this view only renders and delegates.
 */
export function WalletView() {
  const wallet = useWalletDocuments();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [viewer, setViewer] = useState<{ doc: WalletDocument; url: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = useMemo(
    () => sortWalletDocuments(wallet.documents, todayIso()),
    [wallet.documents],
  );

  const openDocument = async (doc: WalletDocument) => {
    setNotice(null);
    let blob: Blob | null = null;
    try {
      blob = await wallet.getFile(doc.id);
    } catch (err) {
      console.warn('Fjällkompis: could not read the Trail Wallet file.', err);
    }
    if (!blob) {
      // A missing blob should be impossible (spanning transactions), but a
      // partially-evicted database must degrade to honesty, not a crash.
      setNotice(
        `The file for “${doc.title}” is missing from local storage on this device. ` +
          'It may have been removed by the browser — delete the entry and add the document again.',
      );
      return;
    }
    if (doc.mimeType === 'application/pdf') {
      openPdf(doc, blob);
    } else {
      // Images: in-app viewer (object URL revoked when the viewer closes).
      setViewer({ doc, url: URL.createObjectURL(blob) });
    }
  };

  /**
   * PDFs, progressive fallback (docs/proposals/trail-wallet.md §4.2):
   * 1. hand the blob to the platform's own viewer in a new context — fully
   *    offline, the blob never touches the network;
   * 2. where the platform refuses a new window (strict popup handling, some
   *    installed-PWA contexts), download a copy instead so the document is
   *    NEVER unreachable — and say so.
   */
  const openPdf = (doc: WalletDocument, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      // Revoking immediately would break the just-opened viewer; a delayed
      // revoke keeps the session leak-free without a lifecycle dependency.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    URL.revokeObjectURL(url);
    downloadBlobFile(doc.fileName || `${doc.title}.pdf`, blob);
    setNotice(
      'This browser could not open the PDF viewer directly, so a copy was downloaded instead.',
    );
  };

  const exportDocument = async (doc: WalletDocument) => {
    const blob = await wallet.getFile(doc.id);
    if (!blob) {
      setNotice(`The file for “${doc.title}” is missing from local storage on this device.`);
      return;
    }
    downloadBlobFile(doc.fileName || doc.title, blob);
  };

  const saveEditor = async (fields: WalletEditorFields, file: File | null) => {
    const now = Date.now();
    // The editor pre-validates every selected file; resolving again here is
    // the model's canonical answer (extension + MIME type), never a guess.
    const fileMeta = (f: File) => {
      const mimeType = resolveWalletMimeType(f.name, f.type);
      if (!mimeType) throw new Error(`Unsupported wallet file: ${f.name}`);
      return { fileName: f.name, mimeType, sizeBytes: f.size };
    };
    if (editor?.mode === 'edit') {
      const next: WalletDocument = {
        ...editor.doc,
        ...fields,
        updatedAt: now,
        ...(file ? fileMeta(file) : {}),
      };
      if (!fields.date) delete next.date;
      if (!fields.note) delete next.note;
      await wallet.update(next, file);
    } else {
      if (!file) return;
      const doc: WalletDocument = {
        id: newWalletDocumentId(),
        ...fields,
        createdAt: now,
        updatedAt: now,
        ...fileMeta(file),
      };
      await wallet.add(doc, file);
    }
  };

  if (wallet.status === 'loading') {
    return (
      <div className="card empty">
        <p>Loading your documents…</p>
      </div>
    );
  }

  if (wallet.status === 'unavailable') {
    // NOT the normal empty state: adding would fail here, so don't invite it.
    return (
      <div className="card">
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <TriangleAlert size={18} strokeWidth={2} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <span className="card-title">Document storage isn’t available here</span>
            <p className="card-sub" style={{ marginTop: 4 }}>
              This browser — or its private-browsing mode — doesn’t allow the local storage
              Trail Wallet needs, so documents can’t be kept on this device. Try a regular
              browsing window, or install the app.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {notice ? (
        <div className="banner-warn" role="alert" style={{ marginBottom: 14 }}>
          <span aria-hidden>⚠️</span>
          <span>{notice}</span>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <div className="card empty">
          <div className="glyph">
            <Wallet size={30} strokeWidth={1.6} aria-hidden />
          </div>
          <p>
            Keep your important hiking documents in one place — bus and train tickets, hut
            bookings, your STF membership, insurance references and route PDFs. Added files
            are stored on this device and stay available offline on the trail.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={() => setEditor({ mode: 'add' })}
          >
            <Plus size={16} strokeWidth={2} aria-hidden /> Add document
          </button>
        </div>
      ) : (
        <>
          <ul className="wallet-list">
            {sorted.map((doc) => (
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
                      {doc.date ? ` · ${formatWalletDate(doc.date)}` : ''}
                      {' · '}
                      <span className="tnum">{formatBytes(doc.sizeBytes)}</span>
                    </span>
                  </span>
                  <ChevronRight
                    className="wallet-card__chevron"
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
                <button
                  className="pack-edit wallet-card__edit"
                  onClick={() => setEditor({ mode: 'edit', doc })}
                  aria-label={`Edit ${doc.title}`}
                >
                  <Pencil size={15} strokeWidth={1.8} aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 14 }}
            onClick={() => setEditor({ mode: 'add' })}
          >
            <Plus size={16} strokeWidth={2} aria-hidden /> Add document
          </button>

          {/* Informational only — deliberately quiet. */}
          <p className="wallet-summary">
            {walletSummaryText(sorted.length, formatBytes(wallet.totalBytes))}
          </p>
        </>
      )}

      {editor ? (
        <WalletEditorSheet
          doc={editor.mode === 'edit' ? editor.doc : undefined}
          onSave={saveEditor}
          onDelete={
            editor.mode === 'edit' ? () => wallet.remove(editor.doc.id) : undefined
          }
          onExport={
            editor.mode === 'edit' ? () => void exportDocument(editor.doc) : undefined
          }
          onClose={() => setEditor(null)}
        />
      ) : null}

      {viewer ? (
        <WalletImageViewer
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
 * In-app image viewer — the same native `.sheet` <dialog> surface as every
 * other modal. The image scrolls/zooms with native browser behaviour inside
 * the sheet body; the object URL is revoked by the parent on close.
 */
function WalletImageViewer({
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
