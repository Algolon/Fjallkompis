/**
 * App binding for the shared document opener: the behaviour lives in
 * documentDelivery.mjs (where `node --test` exercises it with substituted
 * boundaries); this module wires in the REAL platform boundaries and keeps
 * the import surface the screens have always used.
 */
import type { WalletDocument } from '../types';
import { openFileInPlatformViewer } from '../runtime/fileView';
import { saveGeneratedFile } from '../runtime/fileSave';
import { openWalletDocumentWith } from './documentDelivery.mjs';
import type { OpenWalletDocumentResult } from './documentDelivery.mjs';

export type { OpenWalletDocumentResult };

export function openWalletDocument(
  doc: WalletDocument,
  getFile: (id: string) => Promise<Blob | null>,
): Promise<OpenWalletDocumentResult> {
  return openWalletDocumentWith(
    { openInViewer: openFileInPlatformViewer, saveFile: saveGeneratedFile },
    doc,
    getFile,
  );
}
