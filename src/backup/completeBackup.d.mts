import type { WalletDocument } from '../types';

export declare const BACKUP_FORMAT: string;
export declare const BACKUP_FORMAT_VERSION: number;
export declare const BACKUP_FILE_EXTENSION: string;
export declare const MANIFEST_ENTRY: string;
export declare const DATA_ENTRY: string;
export declare const WALLET_INDEX_ENTRY: string;
export declare const WALLET_FILES_DIR: string;
export declare const MAX_BACKUP_ENTRIES: number;
export declare const MAX_BACKUP_TOTAL_BYTES: number;
export declare const MAX_DATA_ENTRY_BYTES: number;
export declare const MAX_METADATA_ENTRY_BYTES: number;

export type EntryKind =
  | 'manifest'
  | 'data'
  | 'wallet-index'
  | 'wallet-file'
  | 'directory'
  | 'unsafe'
  | 'unexpected';

export interface BackupManifest {
  format: string;
  backupFormatVersion: number;
  app: 'fjallkompis';
  appVersion: string;
  exportedAt: string;
  trailId: string;
  stateSchemaVersion: number;
  walletSchemaVersion: number;
  counts: { walletDocuments: number };
  totalWalletBytes: number;
  contents: { data: string; walletIndex: string; walletFilesDir: string };
}

export interface WalletExportEntry {
  document: WalletDocument;
  entryName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AttachmentDescriptor {
  entry: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  fileName: string;
}

export declare function walletFileEntryName(documentId: string, mimeType: string): string;
export declare function classifyEntryName(name: string): EntryKind;
export declare function planWalletExport(
  documents: WalletDocument[],
  filesById: Map<string, { sizeBytes: number } | null>,
):
  | { ok: true; entries: WalletExportEntry[] }
  | { ok: false; reason: 'file-missing' | 'unsafe-id'; documents: Array<{ id: string; title: string }> };
export declare function backupSummaryText(documentCount: number, formattedSize: string): string;
export declare function backupFileName(dateIso: string): string;
export declare function buildManifest(input: {
  appVersion: string;
  exportedAt: string;
  stateSchemaVersion: number;
  documentCount: number;
  totalWalletBytes: number;
}): BackupManifest;
export declare function validateManifest(
  manifest: unknown,
):
  | { ok: true; version: number }
  | { ok: false; reason: 'not-a-backup' }
  | { ok: false; reason: 'newer-version'; version: number }
  | { ok: false; reason: 'trail-mismatch'; trailId: unknown };
export declare function buildWalletIndex(
  entries: Array<WalletExportEntry & { sha256: string }>,
): { walletSchemaVersion: number; documents: Array<{ document: object; file: AttachmentDescriptor }> };
export declare function validateWalletIndex(
  index: unknown,
  presentEntryNames: Set<string>,
):
  | { ok: true; documents: Array<{ document: WalletDocument; file: AttachmentDescriptor }> }
  | { ok: false; reason: string; id?: string; entry?: string };
export declare function restoreRejectionText(reason: unknown): string;
