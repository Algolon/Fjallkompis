/**
 * Complete backup — the restore sequence and its rollback contract.
 *
 * WHY THIS EXISTS AS AN ORCHESTRATOR. PersistentState lives in localStorage
 * and Trail Wallet lives in IndexedDB; there is NO transaction that spans
 * both. That gap cannot be engineered away, so restore safety is explicit
 * sequencing instead:
 *
 *   1. everything is validated and staged in memory FIRST (the archive
 *      layer) — a candidate that fails any check never reaches this module;
 *   2. the CURRENT wallet contents are snapshotted (metadata + blobs);
 *   3. the wallet is replaced inside ONE IndexedDB readwrite transaction
 *      spanning both stores — the strongest atomicity the platform offers;
 *      if that transaction aborts, nothing anywhere has changed;
 *   4. only after the wallet commit does the state apply (an in-memory
 *      replace + localStorage save — the cheap, near-infallible step is
 *      deliberately LAST so the risky multi-megabyte write happens while
 *      current data is still fully intact);
 *   5. if the state apply still throws, the wallet snapshot is written back
 *      (same one-transaction replace) and the error is rethrown — the device
 *      returns to its pre-restore contents.
 *
 * "Never clear current data as the first step": nothing here deletes and
 * then imports. The wallet replacement is clear+refill INSIDE one atomic
 * transaction, and state replacement is a single assignment.
 *
 * Effects are injected so node tests can drive every failure leg (wallet
 * write fails; state apply fails; rollback itself fails) without a browser.
 */

/**
 * @param {object} candidate  staged result from stageCompleteBackup (ok:true)
 * @param {object} effects
 * @param {() => Promise<{documents: Array<object>, files: Map<string, unknown>}>} effects.snapshotWallet
 *   read the CURRENT wallet (metadata + blobs) for rollback
 * @param {(documents: Array<object>, files: Map<string, unknown>) => Promise<void>} effects.replaceWallet
 *   atomic both-stores replacement (walletStore.replaceWalletData)
 * @param {(state: object) => void} effects.applyState
 *   replace the in-memory + persisted PersistentState
 * @param {(candidateFiles: Map<string, {bytes: Uint8Array, mimeType: string}>) => Map<string, unknown>} effects.toStoredFiles
 *   convert staged bytes to the platform's stored form (Blob in the app,
 *   identity in tests)
 * @returns {Promise<{ ok: true, restoredDocuments: number }
 *                 | { ok: false, reason: 'wallet-write-failed'|'state-write-failed', rolledBack: boolean, error: unknown }>}
 */
export async function applyCompleteRestore(candidate, effects) {
  const snapshot = await effects.snapshotWallet();

  try {
    await effects.replaceWallet(
      candidate.walletDocuments,
      effects.toStoredFiles(candidate.walletFiles),
    );
  } catch (error) {
    // The atomic transaction aborted: stored data is untouched by contract.
    return { ok: false, reason: 'wallet-write-failed', rolledBack: false, error };
  }

  try {
    effects.applyState(candidate.state);
  } catch (error) {
    let rolledBack = true;
    try {
      await effects.replaceWallet(snapshot.documents, snapshot.files);
    } catch (rollbackError) {
      // Both the apply and the rollback failed. Nothing can be done silently
      // here — report both, loudly, and leave the caller to tell the user
      // exactly what state the device is in.
      console.error('Fjällkompis: restore rollback failed.', rollbackError);
      rolledBack = false;
    }
    return { ok: false, reason: 'state-write-failed', rolledBack, error };
  }

  return { ok: true, restoredDocuments: candidate.walletDocuments.length };
}
