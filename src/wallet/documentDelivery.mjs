/**
 * The ONE offline document-opening behaviour, shared by every surface that
 * references a stored document — the Wallet list, Travel & stays attachments
 * (both in TripView) and the Today quick access (MembershipQuickAccess):
 *
 *   - images: return an object URL for the shared in-app viewer sheet
 *     (the CALLER owns the URL and must revoke it on viewer close);
 *   - PDFs — and defensively any other non-image type: hand the bytes to the
 *     platform's viewer boundary (src/runtime/fileView.ts); where that
 *     reports 'unavailable', fall back to SAVING a copy through the platform
 *     save boundary (src/runtime/fileSave.ts) — and say which happened
 *     (docs/proposals/trail-wallet.md §4.2);
 *   - missing blob: report honestly — never a broken viewer;
 *   - a genuine delivery failure: report 'failed' — never a dead button and
 *     never an unhandled rejection in a click handler.
 *
 * WHY THE VIEWER DECISION LIVES BEHIND A BOUNDARY, NOT HERE. This opener
 * used to call `window.open(blobUrl)` itself and treat a null window as "the
 * platform refused" — which was true on the Android WebView once. Current
 * Chromium WebViews return a real WindowProxy for that call and then silently
 * drop the navigation (no PDF renderer, same-tab disposition), so "did I get
 * a window?" stopped meaning "will the user see the document?" and every PDF
 * surface in the Play build died at once while the PWA kept working. Whether
 * a platform can actually show a file is a platform fact, so it is answered
 * in src/runtime/fileView.ts — this module stays platform-ignorant.
 *
 * Plain .mjs (sibling .d.mts declaration) so `node --test` exercises this
 * exact module with substituted platform boundaries; the app binds the real
 * ones in documentOpening.ts.
 */
import { walletDownloadFileName } from './walletModel.mjs';

/**
 * @param {object} platform - the two runtime boundaries:
 *   openInViewer(fileName, blob, mimeType) -> 'opened' | 'unavailable',
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

  // PDFs — and any non-image type a future schema might store: the in-app
  // image sheet can never show these, so they go to the platform viewer,
  // then to the save fallback. The stored MIME type is passed through, so
  // the platform resolves the right handler and names the file correctly.
  const fileName = walletDownloadFileName(doc);
  const deliveredType = mimeType || 'application/octet-stream';
  try {
    const viewed = await platform.openInViewer(fileName, blob, deliveredType);
    if (viewed === 'opened') return { kind: 'pdf-opened' };
  } catch (err) {
    console.warn('Fjallkompis: the platform viewer failed; falling back to saving a copy.', err);
  }
  try {
    const outcome = await platform.saveFile(fileName, blob, deliveredType);
    return outcome === 'saved' ? { kind: 'pdf-saved' } : { kind: 'pdf-save-cancelled' };
  } catch (err) {
    console.warn('Fjallkompis: the document could not be delivered.', err);
    return { kind: 'failed' };
  }
}
