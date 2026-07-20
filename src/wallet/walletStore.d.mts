import type { WalletDocument } from '../types';

export declare const WALLET_DB_NAME: string;
export declare const WALLET_DB_VERSION: number;

export declare function walletStorageSupported(): boolean;
export declare function closeWalletDb(): Promise<void>;
export declare function readWalletMeta(): Promise<{ id: string; schemaVersion: number } | null>;
export declare function listWalletDocuments(): Promise<WalletDocument[]>;
export declare function getWalletFile(id: string): Promise<Blob | null>;
export declare function addWalletDocument(doc: WalletDocument, blob: Blob): Promise<void>;
export declare function updateWalletDocument(
  doc: WalletDocument,
  blob?: Blob | null,
): Promise<void>;
export declare function deleteWalletDocument(id: string): Promise<void>;
export declare function clearWalletData(): Promise<void>;
export declare function requestPersistentStorage(): Promise<boolean | null>;
