import type {
  WalletCategory,
  WalletCategoryInfo,
  WalletDocument,
  WalletFileValidation,
  WalletMimeType,
} from '../types';

export declare const WALLET_SCHEMA_VERSION: number;
export declare const WALLET_META_ID: string;
export declare const MAX_WALLET_FILE_BYTES: number;
export declare const WALLET_CATEGORIES: WalletCategoryInfo[];
export declare const LEGACY_WALLET_CATEGORIES: WalletCategoryInfo[];
export declare const WALLET_FILE_ACCEPT: string;

export declare function walletCategoryTitle(id: string): string;
export declare function resolveWalletMimeType(
  fileName: string,
  mimeType: string,
): WalletMimeType | null;
export declare function validateWalletFile(file: {
  name: string;
  type: string;
  size: number;
}): WalletFileValidation;
export declare function defaultTitleFromFilename(fileName: string): string;
export declare function newWalletDocumentId(): string;
export declare function normalizeWalletDocument(raw: unknown): WalletDocument | null;
export declare function sortWalletDocuments(
  documents: WalletDocument[],
  todayIso: string,
): WalletDocument[];
export declare function quickAccessMembership(
  documents: WalletDocument[],
): WalletDocument | null;
export declare function applyMembershipMetadata(
  doc: WalletDocument,
  fields: { membershipProvider?: 'stf' | 'other'; showOnToday?: boolean },
): WalletDocument;
export declare function walletSummaryText(count: number, formattedSize: string): string;

/** Category id union re-exported for convenience in UI code. */
export type { WalletCategory };
