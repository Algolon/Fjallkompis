import type { WalletDocument, PersistentState } from '../types';
import type { StagedBackup } from './completeBackupArchive.mjs';

export interface RestoreEffects {
  snapshotWallet(): Promise<{ documents: WalletDocument[]; files: Map<string, unknown> }>;
  replaceWallet(documents: WalletDocument[], files: Map<string, unknown>): Promise<void>;
  applyState(state: PersistentState): void;
  toStoredFiles(
    candidateFiles: Map<string, { bytes: Uint8Array; mimeType: string }>,
  ): Map<string, unknown>;
}

export declare function applyCompleteRestore(
  candidate: StagedBackup,
  effects: RestoreEffects,
): Promise<
  | { ok: true; restoredDocuments: number }
  | {
      ok: false;
      reason: 'wallet-write-failed' | 'state-write-failed';
      rolledBack: boolean;
      error: unknown;
    }
>;
