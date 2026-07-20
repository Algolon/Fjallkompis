import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalletDocument } from '../types';
import {
  addWalletDocument,
  deleteWalletDocument,
  getWalletFile,
  listWalletDocuments,
  requestPersistentStorage,
  updateWalletDocument,
  walletStorageSupported,
} from '../wallet/walletStore.mjs';

/**
 * Trail Wallet document state for the React layer.
 *
 * All storage access stays behind the walletStore interface — this hook only
 * adds React state, a load/refresh cycle and error surfacing. Nothing here
 * knows about IndexedDB, which is what keeps a future optional sync layer a
 * wrapper around the store rather than a UI rewrite.
 *
 *  - 'loading'      first read in flight;
 *  - 'ready'        documents listed (possibly zero);
 *  - 'unavailable'  IndexedDB missing OR the database could not be
 *                   opened/read (private-browsing modes, denied storage).
 *                   The UI must NOT show the normal empty state then — it
 *                   would misleadingly suggest documents can be added.
 */
export type WalletStatus = 'loading' | 'ready' | 'unavailable';

export interface WalletApi {
  status: WalletStatus;
  documents: WalletDocument[];
  totalBytes: number;
  refresh: () => Promise<void>;
  add: (doc: WalletDocument, blob: Blob) => Promise<void>;
  update: (doc: WalletDocument, blob?: Blob | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getFile: (id: string) => Promise<Blob | null>;
}

export function useWalletDocuments(): WalletApi {
  const [status, setStatus] = useState<WalletStatus>('loading');
  const [documents, setDocuments] = useState<WalletDocument[]>([]);
  // Ask for eviction-resistant storage once per session, after the first
  // successful write — best-effort only, never presented as a guarantee.
  const persistRequested = useRef(false);

  const refresh = useCallback(async () => {
    if (!walletStorageSupported()) {
      setStatus('unavailable');
      setDocuments([]);
      return;
    }
    try {
      const docs = await listWalletDocuments();
      setDocuments(docs);
      setStatus('ready');
    } catch (err) {
      // Opening/reading failed although indexedDB exists — restricted
      // storage behaves like no storage; keep the technical detail in the
      // console (the app's established diagnostics channel).
      console.warn('Fjällkompis: Trail Wallet storage is not readable.', err);
      setDocuments([]);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const afterWrite = useCallback(async () => {
    if (!persistRequested.current) {
      persistRequested.current = true;
      void requestPersistentStorage();
    }
    await refresh();
  }, [refresh]);

  const add = useCallback(
    async (doc: WalletDocument, blob: Blob) => {
      await addWalletDocument(doc, blob);
      await afterWrite();
    },
    [afterWrite],
  );

  const update = useCallback(
    async (doc: WalletDocument, blob: Blob | null = null) => {
      await updateWalletDocument(doc, blob);
      await afterWrite();
    },
    [afterWrite],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteWalletDocument(id);
      await refresh();
    },
    [refresh],
  );

  const getFile = useCallback((id: string) => getWalletFile(id), []);

  const totalBytes = documents.reduce((sum, d) => sum + d.sizeBytes, 0);

  return { status, documents, totalBytes, refresh, add, update, remove, getFile };
}
