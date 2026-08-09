import type { WalletDocument } from '../types';
import { saveGeneratedFile } from '../runtime/fileSave';
import { walletDownloadFileName } from './walletModel.mjs';

/**
 * The ONE offline document-opening behaviour (extracted from TripView so the
 * Today membership quick-access reuses it instead of inventing a viewer):
 *   - PDFs: hand the blob to the platform viewer in a new context; where the
 *     runtime refuses a window, fall back to SAVING a copy through the
 *     platform save boundary — and say which happened
 *     (docs/proposals/trail-wallet.md §4.2);
 *   - images: return an object URL for the shared TripImageViewer sheet
 *     (the CALLER owns the URL and must revoke it on viewer close);
 *   - missing blob: report honestly — never a broken viewer.
 *
 * WHY THE FALLBACK GOES THROUGH src/runtime/fileSave.ts. It used to call
 * `downloadBlobFile` — an `<a download>` on a blob: URL, which the Android
 * WebView ignores entirely (SaveFilePlugin.java documents the emulator-verified
 * no-op). In the wrapper, `window.open` on a blob: URL also yields no window,
 * so the PDF branch reached the fallback and then did NOTHING, while the caller
 * told the user a copy had been downloaded. The save boundary already solves
 * this for every file the app generates; a stored document is different only in
 * where the bytes came from, not in how a platform hands a file to its user.
 */
export type OpenWalletDocumentResult =
  | { kind: 'image'; url: string }
  | { kind: 'pdf-opened' }
  | { kind: 'pdf-saved' }
  | { kind: 'pdf-save-cancelled' }
  | { kind: 'missing' };

export async function openWalletDocument(
  doc: WalletDocument,
  getFile: (id: string) => Promise<Blob | null>,
): Promise<OpenWalletDocumentResult> {
  let blob: Blob | null = null;
  try {
    blob = await getFile(doc.id);
  } catch (err) {
    console.warn('Fjallkompis: could not read the stored file.', err);
  }
  if (!blob) return { kind: 'missing' };

  if (doc.mimeType === 'application/pdf') {
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { kind: 'pdf-opened' };
    }
    URL.revokeObjectURL(url);
    // The stored MIME type is passed through, so the Android picker offers the
    // right handler and the browser names the file correctly.
    const outcome = await saveGeneratedFile(walletDownloadFileName(doc), blob, doc.mimeType);
    return outcome === 'saved' ? { kind: 'pdf-saved' } : { kind: 'pdf-save-cancelled' };
  }
  return { kind: 'image', url: URL.createObjectURL(blob) };
}
