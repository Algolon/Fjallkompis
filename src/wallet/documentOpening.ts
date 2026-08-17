/**
 * App binding for the shared document opener: the behaviour lives in
 * documentDelivery.mjs (where `node --test` exercises it with substituted
 * boundaries); this module wires in the REAL platform boundary and keeps
 * the import surface the screens have always used. Since PDFs render in the
 * app's own viewer on every platform, the only boundary left is saving —
 * the defensive path for a stored type the app cannot display.
 */
import type { WalletDocument } from '../types';
import { saveGeneratedFile } from '../runtime/fileSave';
import { openWalletDocumentWith } from './documentDelivery.mjs';
import type { OpenWalletDocumentResult } from './documentDelivery.mjs';

export type { OpenWalletDocumentResult };

export function openWalletDocument(
  doc: WalletDocument,
  getFile: (id: string) => Promise<Blob | null>,
): Promise<OpenWalletDocumentResult> {
  return openWalletDocumentWith({ saveFile: saveGeneratedFile }, doc, getFile);
}
