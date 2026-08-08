/**
 * Complete backup — ZIP assembly and staged parsing.
 *
 * DEPENDENCY NOTE. The container is a normal ZIP. The platform offers no ZIP
 * API (CompressionStream does raw deflate/gzip streams, not archives), so a
 * library is required. fflate is chosen deliberately: it ALREADY ships in the
 * production bundle as pmtiles' decompression backend, so declaring it as a
 * direct dependency adds zero new supply chain and ~zero bundle bytes, it is
 * small and maintained, and its `unzipSync` filter callback exposes declared
 * sizes BEFORE inflation — which is what lets the limits below reject a
 * decompression bomb without inflating it.
 *
 * Attachments are STORED (level 0) — PDFs/JPEG/PNG/WebP are already
 * compressed and deflating them again wastes time for ~0 gain; the JSON
 * entries are deflated.
 *
 * Hashing uses WebCrypto SHA-256 (secure contexts and node:test both have
 * it). Hashes are computed from the exact bytes written, and verified on the
 * exact bytes read, BEFORE anything is applied.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  DATA_ENTRY,
  MANIFEST_ENTRY,
  MAX_BACKUP_ENTRIES,
  MAX_BACKUP_TOTAL_BYTES,
  MAX_DATA_ENTRY_BYTES,
  MAX_METADATA_ENTRY_BYTES,
  WALLET_INDEX_ENTRY,
  buildManifest,
  buildWalletIndex,
  classifyEntryName,
  planWalletExport,
  preflightBackupFile,
  validateManifest,
  validateWalletIndex,
} from './completeBackup.mjs';
import { MAX_WALLET_FILE_BYTES } from '../wallet/walletModel.mjs';

/** Lower-case hex SHA-256 of a byte array. */
export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the complete backup as ZIP bytes.
 *
 * @param {object} input
 * @param {object} input.exportEnvelope  the EXISTING JSON export envelope
 *   (buildExport(state)) — data.json is byte-for-byte the lightweight export
 * @param {Array<object>} input.documents  normalised wallet documents
 * @param {Map<string, Uint8Array|null>} input.fileBytesById  attachment bytes
 * @param {string} input.appVersion
 * @param {string} input.exportedAt  ISO timestamp (injected for determinism)
 * @returns {Promise<{ ok: true, bytes: Uint8Array, manifest: object }
 *                 | { ok: false, reason: string, documents?: Array<{id:string,title:string}> }>}
 */
export async function buildCompleteBackup({ exportEnvelope, documents, fileBytesById, appVersion, exportedAt }) {
  const descriptors = new Map(
    [...fileBytesById].map(([id, bytes]) => [id, bytes ? { sizeBytes: bytes.byteLength } : null]),
  );
  const plan = planWalletExport(documents, descriptors);
  if (!plan.ok) return plan;

  const entriesWithHashes = [];
  for (const entry of plan.entries) {
    const bytes = fileBytesById.get(entry.document.id);
    entriesWithHashes.push({ ...entry, sha256: await sha256Hex(bytes) });
  }

  const totalWalletBytes = entriesWithHashes.reduce((sum, e) => sum + e.sizeBytes, 0);
  const manifest = buildManifest({
    appVersion,
    exportedAt,
    stateSchemaVersion: exportEnvelope.schemaVersion,
    documentCount: entriesWithHashes.length,
    totalWalletBytes,
  });
  const walletIndex = buildWalletIndex(entriesWithHashes);

  // Fixed mtime (the export moment) keeps rebuilt packages comparable.
  const mtime = new Date(exportedAt);
  const zipInput = {
    [MANIFEST_ENTRY]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6, mtime }],
    [DATA_ENTRY]: [strToU8(JSON.stringify(exportEnvelope, null, 2)), { level: 6, mtime }],
    [WALLET_INDEX_ENTRY]: [strToU8(JSON.stringify(walletIndex, null, 2)), { level: 6, mtime }],
  };
  for (const entry of entriesWithHashes) {
    zipInput[entry.entryName] = [fileBytesById.get(entry.document.id), { level: 0, mtime }];
  }
  return { ok: true, bytes: zipSync(zipInput), manifest };
}

/**
 * Open and fully validate a candidate backup, WITHOUT touching any stored
 * data. Returns a staged candidate carrying everything a restore needs, or a
 * typed rejection. Order matters and is deliberate:
 *
 *   1. structural unzip with declared-size limits (bomb-safe: an entry whose
 *      DECLARED inflated size busts a limit is never inflated);
 *   2. entry-name safety (path traversal, unexpected paths);
 *   3. manifest identity/version/trail;
 *   4. data.json through readStateFn — the same migration/validation path
 *      the lightweight JSON import uses;
 *   5. wallet index structure ↔ present entries (ids, uniqueness, MIME
 *      agreement, declared sizes/hashes, no missing/undeclared attachments);
 *   6. actual byte sizes and SHA-256 of every attachment against the index.
 *
 * @param {Uint8Array} bytes
 * @param {(raw: unknown) => ({ok:true,state:object}|{ok:false})} readStateFn
 */
export async function stageCompleteBackup(bytes, readStateFn) {
  // Defensive re-check of the container preflight the UI already ran on the
  // File's size — the domain layer must be safe for any caller.
  const preflight = preflightBackupFile(bytes.byteLength);
  if (!preflight.ok) return preflight;

  let files;
  const oversized = [];
  let totalDeclared = 0;
  let entryCount = 0;
  try {
    files = unzipSync(bytes, {
      filter(info) {
        entryCount += 1;
        totalDeclared += info.originalSize;
        const kind = classifyEntryName(info.name);
        const perEntryCap =
          kind === 'wallet-file'
            ? MAX_WALLET_FILE_BYTES
            : kind === 'data'
              ? MAX_DATA_ENTRY_BYTES
              : MAX_METADATA_ENTRY_BYTES;
        if (
          entryCount > MAX_BACKUP_ENTRIES ||
          totalDeclared > MAX_BACKUP_TOTAL_BYTES ||
          info.originalSize > perEntryCap
        ) {
          oversized.push(info.name);
          return false;
        }
        return kind !== 'directory';
      },
    });
  } catch {
    return { ok: false, reason: 'unreadable-archive' };
  }
  if (oversized.length > 0) return { ok: false, reason: 'limits-exceeded' };

  const names = Object.keys(files);
  for (const name of names) {
    const kind = classifyEntryName(name);
    if (kind === 'unsafe') return { ok: false, reason: 'unsafe-entry', entry: name };
    if (kind === 'unexpected') return { ok: false, reason: 'not-a-backup', entry: name };
  }
  if (!files[MANIFEST_ENTRY]) return { ok: false, reason: 'not-a-backup' };
  if (!files[DATA_ENTRY] || !files[WALLET_INDEX_ENTRY]) {
    return { ok: false, reason: 'unreadable-archive' };
  }

  let manifest;
  let dataEnvelope;
  let walletIndex;
  try {
    manifest = JSON.parse(strFromU8(files[MANIFEST_ENTRY]));
    dataEnvelope = JSON.parse(strFromU8(files[DATA_ENTRY]));
    walletIndex = JSON.parse(strFromU8(files[WALLET_INDEX_ENTRY]));
  } catch {
    return { ok: false, reason: 'unreadable-archive' };
  }

  const manifestVerdict = validateManifest(manifest);
  if (!manifestVerdict.ok) return manifestVerdict;

  // The same read path as the lightweight import: envelope or bare state,
  // trail-checked, migrated forward. Nothing about data.json is bespoke.
  const stateResult = readStateFn(
    dataEnvelope?.app === 'fjallkompis' && dataEnvelope.state ? dataEnvelope.state : dataEnvelope,
  );
  if (!stateResult.ok) return { ok: false, reason: 'state-invalid' };

  const presentEntryNames = new Set(names.filter((n) => classifyEntryName(n) === 'wallet-file'));
  const indexVerdict = validateWalletIndex(walletIndex, presentEntryNames);
  if (!indexVerdict.ok) return indexVerdict;

  const walletFiles = new Map();
  for (const { document, file } of indexVerdict.documents) {
    const entryBytes = files[file.entry];
    if (entryBytes.byteLength !== file.sizeBytes) {
      return { ok: false, reason: 'attachment-size-mismatch', id: document.id };
    }
    if ((await sha256Hex(entryBytes)) !== file.sha256) {
      return { ok: false, reason: 'attachment-hash-mismatch', id: document.id };
    }
    walletFiles.set(document.id, { bytes: entryBytes, mimeType: file.mimeType });
  }

  return {
    ok: true,
    manifest,
    state: stateResult.state,
    walletDocuments: indexVerdict.documents.map((d) => d.document),
    walletFiles,
  };
}
