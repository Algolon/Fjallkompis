import { useEffect, useMemo, useState } from 'react';
import { IdCard } from 'lucide-react';
import { useWalletDocuments } from '../hooks/useWalletDocuments';
import { quickAccessMembership } from '../wallet/walletModel.mjs';
import { openWalletDocument } from '../wallet/documentOpening';
import { TripImageViewer } from './TripView';
import type { WalletDocument } from '../types';

/**
 * Compact STF membership quick access beside the Tonight card (On route).
 * Renders ONLY when a membership document was EXPLICITLY marked for Today in
 * the Trip document editor (category Membership + organisation STF +
 * "Show quick access on Today") AND its file is verified locally available —
 * a missing blob means the action is omitted entirely rather than shown as a
 * button that would fail; the honest missing-file state stays in Lists → Trip
 * where the document is managed. Without an eligible document this renders
 * nothing and Tonight keeps its full width.
 *
 * Opening reuses the shared wallet behaviour (openWalletDocument): PDFs go
 * to the platform viewer (download fallback), images open in the same
 * TripImageViewer sheet as Lists → Trip.
 *
 * The button IS the official STF roundel (owner-provided/approved asset,
 * public/images/stf-logo.png, PWA-precached): a membership badge is exactly
 * what the mark communicates, so no container, monogram or extra card icon —
 * they would say "STF card" twice. The accessible name still carries the
 * full meaning, and the roundel's own SF lettering is the visible label
 * (owner-approved deviation from the icon-supports-text rule). Should the
 * image ever fail to load (edge offline/eviction case), the button falls
 * back to the previous neutral boxed treatment — never an invisible target.
 */
const STF_LOGO_SRC = `${import.meta.env.BASE_URL}images/stf-logo.png`;
export function MembershipQuickAccess() {
  const wallet = useWalletDocuments();
  const doc = useMemo(() => quickAccessMembership(wallet.documents), [wallet.documents]);
  const [availableId, setAvailableId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ doc: WalletDocument; url: string } | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  // Verify the blob actually exists on THIS device before offering the
  // action (metadata can outlive a browser-evicted file).
  useEffect(() => {
    let live = true;
    setAvailableId(null);
    if (!doc) return;
    wallet
      .getFile(doc.id)
      .then((blob) => {
        if (live && blob) setAvailableId(doc.id);
      })
      .catch(() => {
        /* unreadable file → keep the action hidden */
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, doc?.updatedAt, wallet.status]);

  if (!doc || availableId !== doc.id) return null;

  const open = async () => {
    const result = await openWalletDocument(doc, wallet.getFile);
    if (result.kind === 'image') setViewer({ doc, url: result.url });
    // A race where the file vanished between the check and the tap: hide the
    // action from now on (same omission rule as at mount).
    if (result.kind === 'missing') setAvailableId(null);
  };

  return (
    <>
      {logoFailed ? (
        <button
          className="today-action-card today-glass today-glass--light stf-card stf-card--boxed"
          onClick={open}
          aria-label="Open STF membership card"
        >
          <IdCard size={22} strokeWidth={1.8} aria-hidden />
          <span className="stf-card__label" aria-hidden>
            STF
          </span>
        </button>
      ) : (
        <button className="stf-card" onClick={open} aria-label="Open STF membership card">
          {/* The button carries the accessible name; the mark is decorative. */}
          <img
            src={STF_LOGO_SRC}
            alt=""
            aria-hidden
            draggable={false}
            onError={() => setLogoFailed(true)}
          />
        </button>
      )}
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
