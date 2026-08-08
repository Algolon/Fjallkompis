import type { WalletDocument } from '../types';
import type { BackupManifest } from './completeBackup.mjs';
import type { ExportEnvelope } from '../utils/exportImport';
import type { PersistentState } from '../types';

export declare function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string>;

export declare function buildCompleteBackup(input: {
  exportEnvelope: ExportEnvelope;
  documents: WalletDocument[];
  fileBytesById: Map<string, Uint8Array | null>;
  appVersion: string;
  exportedAt: string;
}): Promise<
  | { ok: true; bytes: Uint8Array; manifest: BackupManifest }
  | { ok: false; reason: string; documents?: Array<{ id: string; title: string }> }
>;

export interface StagedBackup {
  ok: true;
  manifest: BackupManifest;
  state: PersistentState;
  walletDocuments: WalletDocument[];
  walletFiles: Map<string, { bytes: Uint8Array; mimeType: string }>;
}

export declare function stageCompleteBackup(
  bytes: Uint8Array,
  readStateFn: (raw: unknown) => { ok: true; state: PersistentState } | { ok: false },
): Promise<StagedBackup | { ok: false; reason: string; id?: string; entry?: string }>;
