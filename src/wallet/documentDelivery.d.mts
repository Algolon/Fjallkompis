import type { WalletDocument } from '../types';

export type OpenWalletDocumentResult =
  | { kind: 'image'; url: string }
  | { kind: 'pdf-opened' }
  | { kind: 'pdf-saved' }
  | { kind: 'pdf-save-cancelled' }
  | { kind: 'missing' }
  | { kind: 'failed' };

/** The two runtime boundaries the opener delegates platform facts to. */
export interface DocumentOpeningPlatform {
  openInViewer(
    fileName: string,
    blob: Blob,
    mimeType: string,
  ): Promise<'opened' | 'unavailable'>;
  saveFile(fileName: string, blob: Blob, mimeType: string): Promise<'saved' | 'cancelled'>;
}

export declare function openWalletDocumentWith(
  platform: DocumentOpeningPlatform,
  doc: WalletDocument,
  getFile: (id: string) => Promise<Blob | null>,
): Promise<OpenWalletDocumentResult>;
