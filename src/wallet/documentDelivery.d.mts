import type { WalletDocument } from '../types';

export type OpenWalletDocumentResult =
  | { kind: 'image'; url: string }
  | { kind: 'pdf'; blob: Blob; fileName: string }
  | { kind: 'saved-copy' }
  | { kind: 'save-cancelled' }
  | { kind: 'missing' }
  | { kind: 'failed' };

/** The one runtime boundary the opener still delegates a platform fact to. */
export interface DocumentOpeningPlatform {
  saveFile(fileName: string, blob: Blob, mimeType: string): Promise<'saved' | 'cancelled'>;
}

export declare function openWalletDocumentWith(
  platform: DocumentOpeningPlatform,
  doc: WalletDocument,
  getFile: (id: string) => Promise<Blob | null>,
): Promise<OpenWalletDocumentResult>;
