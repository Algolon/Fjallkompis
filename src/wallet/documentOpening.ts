import type { WalletDocument } from '../types';
import { downloadBlobFile } from '../utils/exportImport';

/**
 * The ONE offline document-opening behaviour (extracted from TripView so the
 * Today membership quick-access reuses it instead of inventing a viewer):
 *   - PDFs: hand the blob to the platform viewer in a new context; where the
 *     browser refuses a window, download a copy instead — and say so
 *     (docs/proposals/trail-wallet.md §4.2);
 *   - images: return an object URL for the shared TripImageViewer sheet
 *     (the CALLER owns the URL and must revoke it on viewer close);
 *   - missing blob: report honestly — never a broken viewer.
 */
export type OpenWalletDocumentResult =
  | { kind: 'image'; url: string }
  | { kind: 'pdf-opened' }
  | { kind: 'pdf-downloaded' }
  | { kind: 'missing' };

export async function openWalletDocument(
  doc: WalletDocument,
  getFile: (id: string) => Promise<Blob | null>,
): Promise<OpenWalletDocumentResult> {
  let blob: Blob | null = null;
  try {
    blob = await getFile(doc.id);
  } catch (err) {
    console.warn('Fjällkompis: could not read the stored file.', err);
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
    downloadBlobFile(doc.fileName || `${doc.title}.pdf`, blob);
    return { kind: 'pdf-downloaded' };
  }
  return { kind: 'image', url: URL.createObjectURL(blob) };
}
