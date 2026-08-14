/**
 * The ONE offline document-opening behaviour, shared by every surface that
 * references a stored document — the Wallet list, Travel & stays attachments
 * (both in TripView) and the Today quick access (MembershipQuickAccess):
 *
 *   - images: return an object URL for the shared in-app image sheet
 *     (the CALLER owns the URL and must revoke it on viewer close);
 *   - PDFs: return the stored blob for the app's OWN full-screen viewer
 *     (src/components/WalletPdfViewer.tsx) — every platform renders the
 *     document inside Fjallkompis, so no platform boundary is consulted and
 *     there is nothing to "fall back" from. Whether those bytes actually
 *     parse as a PDF is the VIEWER's question; its error state answers
 *     honestly and offers the save path there;
 *   - defensively, any other non-image type a future schema might store:
 *     the app has no viewer for it, so it goes straight to the platform
 *     SAVE boundary (src/runtime/fileSave.ts) — and the outcome says which
 *     of saved/cancelled happened (docs/proposals/trail-wallet.md §4.2);
 *   - missing blob: report honestly — never a broken viewer;
 *   - a genuine delivery failure: report 'failed' — never a dead button and
 *     never an unhandled rejection in a click handler.
 *
 * HISTORY, because this module has been burnt twice by platform idioms: PDFs
 * used to leave the app — first through `window.open(blobUrl)` (which the
 * Android WebView accepts and silently drops: no PDF renderer), then through
 * a native ACTION_VIEW hand-off to an external viewer app (which worked but
 * was the wrong product: a Fjallkompis document should open IN Fjallkompis).
 * Rendering in-app removes the platform question from this module entirely —
 * the same bytes reach the same viewer everywhere. The remaining platform
 * boundary is saving, and only the defensive non-PDF branch touches it.
 *
 * Plain .mjs (sibling .d.mts declaration) so `node --test` exercises this
 * exact module with substituted platform boundaries; the app binds the real
 * ones in documentOpening.ts.
 */
import { walletDownloadFileName } from './walletModel.mjs';

/**
 * @param {object} platform - the one runtime boundary this opener still has:
 *   saveFile(fileName, blob, mimeType) -> 'saved' | 'cancelled'.
 * @param {object} doc - the wallet document metadata (id, mimeType, ...).
 * @param {(id: string) => Promise<Blob | null>} getFile - wallet blob lookup.
 */
export async function openWalletDocumentWith(platform, doc, getFile) {
  let blob = null;
  try {
    blob = await getFile(doc.id);
  } catch (err) {
    console.warn('Fjallkompis: could not read the stored file.', err);
  }
  if (!blob) return { kind: 'missing' };

  // Routing is by the STORED MIME type (resolved and validated when the
  // document was added — resolveWalletMimeType), never by filename sniffing.
  const mimeType = typeof doc.mimeType === 'string' && doc.mimeType ? doc.mimeType : '';
  if (mimeType.startsWith('image/')) {
    return { kind: 'image', url: URL.createObjectURL(blob) };
  }

  const fileName = walletDownloadFileName(doc);
  if (mimeType === 'application/pdf') {
    // The caller mounts the in-app PDF viewer with exactly the stored bytes.
    return { kind: 'pdf', blob, fileName };
  }

  // No in-app viewer exists for this type (the wallet model only admits
  // images and PDFs today) — deliver a copy through the platform save
  // boundary rather than pretending to display it.
  try {
    const outcome = await platform.saveFile(
      fileName,
      blob,
      mimeType || 'application/octet-stream',
    );
    return outcome === 'saved' ? { kind: 'saved-copy' } : { kind: 'save-cancelled' };
  } catch (err) {
    console.warn('Fjallkompis: the document could not be delivered.', err);
    return { kind: 'failed' };
  }
}
