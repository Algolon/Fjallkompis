/**
 * Complete backup / restore v1 — the pure contract (no zip, no IO, no DOM).
 *
 * WHAT A COMPLETE BACKUP IS. The existing JSON export deliberately carries
 * only PersistentState; Trail Wallet documents live in IndexedDB with the
 * actual PDF/image blobs, so a JSON file can never restore them (and base64
 * inside JSON is explicitly not the answer — it triples memory, breaks
 * streaming, and turns a state file into an opaque blob store). A complete
 * backup is ONE portable ZIP container holding every piece of restorable
 * local user data:
 *
 *   manifest.json          identity + versions + counts (this module)
 *   data.json              the EXISTING ExportEnvelope, verbatim — restore
 *                          runs through the same readState migration path
 *                          as the lightweight JSON import
 *   wallet/index.json      wallet schema version + one entry per document:
 *                          the stored metadata record plus an attachment
 *                          descriptor (entry path, MIME, bytes, SHA-256)
 *   wallet/files/<id>.<ext> the actual binary files, one ZIP entry each
 *
 * Deliberately NOT included: caches, downloaded basemaps, service-worker
 * state, generated assets, secrets — all reproducible or non-user data.
 *
 * VERSIONING. `backupFormatVersion` is the CONTAINER's version and is
 * independent of the app-state schema (data.json carries its own
 * schemaVersion and migrates through readState) and of the wallet schema
 * (wallet/index.json carries walletSchemaVersion). The container version
 * only changes when the PACKAGE shape changes — e.g. a future encrypted
 * variant would bump it and declare the encryption in the manifest, without
 * redefining what a backup contains. Unknown future versions are rejected
 * without touching stored data.
 *
 * FILENAMES. ZIP entry names for attachments are derived from the document
 * id and canonical extension only — never from the user's original filename,
 * which may contain any unicode and lives (losslessly, as JSON) in the
 * metadata record and attachment descriptor instead.
 */
import {
  MAX_WALLET_FILE_BYTES,
  WALLET_SCHEMA_VERSION,
  normalizeWalletDocument,
  resolveWalletMimeType,
} from '../wallet/walletModel.mjs';
import { ACTIVE_TRAIL_ID } from '../data/trailIdentity.mjs';

export const BACKUP_FORMAT = 'fjallkompis-complete-backup';
export const BACKUP_FORMAT_VERSION = 1;
/** The Fjällkompis-specific container extension (a normal ZIP inside). */
export const BACKUP_FILE_EXTENSION = '.fjallkompis';

export const MANIFEST_ENTRY = 'manifest.json';
export const DATA_ENTRY = 'data.json';
export const WALLET_INDEX_ENTRY = 'wallet/index.json';
export const WALLET_FILES_DIR = 'wallet/files/';

// ---- Limits (validated BEFORE any inflation or mutation) --------------------

/**
 * Ceiling for the SELECTED container file itself, checked from the picker's
 * file size BEFORE a single byte is read into memory. Restore reads the
 * whole archive with one `arrayBuffer()` call, so without this preflight an
 * accidentally (or maliciously) huge selection would first allocate hundreds
 * of megabytes of WebView memory and only then hit the inner limits.
 *
 * 256 MiB is deliberately conservative for a mobile-first app and consistent
 * with the v1 contract: attachments are STORED (not deflated) with a 20 MB
 * per-file cap, so the container's size is approximately its payload — a
 * realistic wallet is tens of megabytes, and 256 MiB already leaves room for
 * a dozen maximum-size documents. The inner declared-size limits below stay
 * as SEPARATE validation: they guard what the entries claim to inflate to,
 * this guards what the file physically is.
 */
export const MAX_BACKUP_FILE_BYTES = 256 * 1024 * 1024;
/** Entries a well-formed v1 backup can contain: 3 fixed + one per document. */
export const MAX_BACKUP_ENTRIES = 2048;
/** Ceiling for the sum of declared uncompressed entry sizes. */
export const MAX_BACKUP_TOTAL_BYTES = 512 * 1024 * 1024;
/** data.json is a state blob, not a media store. */
export const MAX_DATA_ENTRY_BYTES = 32 * 1024 * 1024;
/** manifest.json / wallet/index.json are small metadata documents. */
export const MAX_METADATA_ENTRY_BYTES = 8 * 1024 * 1024;

/** Canonical attachment extension per wallet MIME type. */
const EXTENSION_BY_MIME = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Characters allowed in a document id used as a ZIP entry filename. Wallet
 * ids are `doc_<base36>_<base36>` by construction, but imported/legacy data
 * could carry anything — an unsafe id fails the EXPORT with the document
 * named, rather than producing an entry name that needs escaping.
 */
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Strict allowlist for attachment entry paths (no '/', '..' impossible). */
const WALLET_FILE_ENTRY_RE = /^wallet\/files\/[A-Za-z0-9][A-Za-z0-9_-]*\.(pdf|jpg|png|webp)$/;

/** The ZIP entry path for a document's attachment. */
export function walletFileEntryName(documentId, mimeType) {
  return `${WALLET_FILES_DIR}${documentId}.${EXTENSION_BY_MIME[mimeType]}`;
}

/**
 * May a selected file of this size be read into memory at all? The UI calls
 * this with `File.size` before `arrayBuffer()`; the archive layer applies it
 * again defensively. Pure and centralised so the limit is a domain fact, not
 * UI copy.
 */
export function preflightBackupFile(sizeBytes) {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return { ok: false, reason: 'unreadable-archive' };
  }
  if (sizeBytes > MAX_BACKUP_FILE_BYTES) return { ok: false, reason: 'limits-exceeded' };
  return { ok: true };
}

/**
 * Is this entry path safe and expected in a v1 container? Rejects path
 * traversal, absolute paths, backslashes and anything outside the four
 * declared shapes. Directory entries ('wallet/') are tolerated as harmless
 * ZIP furniture only when EXACTLY the two known directories.
 */
export function classifyEntryName(name) {
  if (typeof name !== 'string' || name === '') return 'unexpected';
  if (name.includes('\\') || name.startsWith('/') || name.includes('..')) return 'unsafe';
  if (name === MANIFEST_ENTRY) return 'manifest';
  if (name === DATA_ENTRY) return 'data';
  if (name === WALLET_INDEX_ENTRY) return 'wallet-index';
  if (name === 'wallet/' || name === WALLET_FILES_DIR) return 'directory';
  if (WALLET_FILE_ENTRY_RE.test(name)) return 'wallet-file';
  return 'unexpected';
}

// ---- Export planning --------------------------------------------------------

/**
 * Decide whether a complete backup can honestly be produced from the wallet
 * dump, and lay out exactly what it will contain. Pure: blobs are described
 * by { sizeBytes } only; reading and hashing bytes happens in the archive
 * layer.
 *
 * A complete backup REFUSES to build when any document's file cannot be
 * included — a `fileMissing` record (storage eviction), a missing/empty blob
 * row, or an id that cannot name a ZIP entry. Silently omitting a file would
 * produce a package that CLAIMS to be complete and is not; the refusal names
 * the affected documents so the user can repair or remove them first.
 *
 * @param {Array<object>} documents  normalised wallet documents (fileMissing
 *   annotations included, as listWalletDocuments returns them)
 * @param {Map<string, {sizeBytes:number}|null>} filesById  blob descriptors
 * @returns {{ ok: true, entries: Array<{document:object, entryName:string, mimeType:string, sizeBytes:number}> }
 *         | { ok: false, reason: 'file-missing'|'unsafe-id', documents: Array<{id:string,title:string}> }}
 */
export function planWalletExport(documents, filesById) {
  const missing = [];
  const unsafe = [];
  const entries = [];
  for (const doc of documents) {
    const file = filesById.get(doc.id) ?? null;
    if (doc.fileMissing === true || file === null || file.sizeBytes === 0) {
      missing.push({ id: doc.id, title: doc.title });
      continue;
    }
    if (!SAFE_ID_RE.test(doc.id)) {
      unsafe.push({ id: doc.id, title: doc.title });
      continue;
    }
    entries.push({
      document: doc,
      entryName: walletFileEntryName(doc.id, doc.mimeType),
      mimeType: doc.mimeType,
      sizeBytes: file.sizeBytes,
    });
  }
  if (missing.length > 0) return { ok: false, reason: 'file-missing', documents: missing };
  if (unsafe.length > 0) return { ok: false, reason: 'unsafe-id', documents: unsafe };
  return { ok: true, entries };
}

/** "Trip data · 6 Wallet documents · 12.4 MB" (0 documents stays honest). */
export function backupSummaryText(documentCount, formattedSize) {
  const docs = `${documentCount} Wallet document${documentCount === 1 ? '' : 's'}`;
  return documentCount > 0 ? `Trip data · ${docs} · ${formattedSize}` : 'Trip data · no Wallet documents';
}

/** The dated backup filename: fjallkompis-backup-YYYY-MM-DD.fjallkompis */
export function backupFileName(dateIso) {
  return `fjallkompis-backup-${dateIso}${BACKUP_FILE_EXTENSION}`;
}

// ---- Manifest ---------------------------------------------------------------

/**
 * Build the v1 manifest. All identity facts are explicit so a future reader
 * (or a human with an unzip tool) can tell exactly what this is without
 * opening anything else.
 */
export function buildManifest({ appVersion, exportedAt, stateSchemaVersion, documentCount, totalWalletBytes }) {
  return {
    format: BACKUP_FORMAT,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    app: 'fjallkompis',
    appVersion,
    exportedAt,
    trailId: ACTIVE_TRAIL_ID,
    stateSchemaVersion,
    walletSchemaVersion: WALLET_SCHEMA_VERSION,
    counts: { walletDocuments: documentCount },
    totalWalletBytes,
    contents: { data: DATA_ENTRY, walletIndex: WALLET_INDEX_ENTRY, walletFilesDir: WALLET_FILES_DIR },
  };
}

/**
 * Validate a parsed manifest.json. Reasons are distinct because the user
 * messages must be: a corrupt file, a file from some other app, a backup for
 * another trail and a NEWER backup format are four different situations,
 * and only the last should say "update the app".
 */
export function validateManifest(manifest) {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    return { ok: false, reason: 'not-a-backup' };
  }
  if (manifest.format !== BACKUP_FORMAT || manifest.app !== 'fjallkompis') {
    return { ok: false, reason: 'not-a-backup' };
  }
  const version = manifest.backupFormatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'not-a-backup' };
  }
  if (version > BACKUP_FORMAT_VERSION) {
    return { ok: false, reason: 'newer-version', version };
  }
  // version === 1 is the only shipped shape; when version 2 exists, a
  // migration boundary for OLDER versions lives here, not in the UI.
  if (manifest.trailId !== ACTIVE_TRAIL_ID) {
    return { ok: false, reason: 'trail-mismatch', trailId: manifest.trailId };
  }
  return { ok: true, version };
}

// ---- Wallet index -----------------------------------------------------------

/**
 * Build wallet/index.json from planned entries + computed hashes. The stored
 * metadata record is embedded verbatim (minus the runtime fileMissing
 * annotation, which normalizeWalletDocument strips on read anyway); the
 * attachment descriptor is what restore verifies bytes against.
 */
export function buildWalletIndex(entries) {
  return {
    walletSchemaVersion: WALLET_SCHEMA_VERSION,
    documents: entries.map(({ document, entryName, mimeType, sizeBytes, sha256 }) => {
      const { fileMissing, ...record } = document;
      void fileMissing;
      return {
        document: record,
        file: { entry: entryName, mimeType, sizeBytes, sha256, fileName: record.fileName },
      };
    }),
  };
}

/**
 * Validate a parsed wallet/index.json against the actual set of attachment
 * entries found in the archive. Pure structural validation — hash checking
 * needs the bytes and happens in the archive layer, which calls this first.
 *
 * Guarantees on ok:
 *  - every document normalises (normalizeWalletDocument !== null);
 *  - ids are unique and filename-safe;
 *  - each declared attachment maps to exactly one present entry, with the
 *    entry name derived from the id, a MIME type consistent with metadata
 *    AND filename, a positive size within the per-file cap, and a
 *    64-hex-char sha256;
 *  - no attachment entry exists that the index does not declare.
 */
export function validateWalletIndex(index, presentEntryNames) {
  if (typeof index !== 'object' || index === null || Array.isArray(index)) {
    return { ok: false, reason: 'malformed-index' };
  }
  if (
    typeof index.walletSchemaVersion !== 'number' ||
    index.walletSchemaVersion > WALLET_SCHEMA_VERSION
  ) {
    return { ok: false, reason: 'newer-wallet-schema' };
  }
  if (!Array.isArray(index.documents)) return { ok: false, reason: 'malformed-index' };

  const seenIds = new Set();
  const declaredEntries = new Set();
  const validated = [];
  for (const item of index.documents) {
    const record = item?.document;
    const file = item?.file;
    const doc = normalizeWalletDocument(record);
    if (!doc) return { ok: false, reason: 'malformed-document' };
    if (seenIds.has(doc.id)) return { ok: false, reason: 'duplicate-id', id: doc.id };
    seenIds.add(doc.id);
    if (!SAFE_ID_RE.test(doc.id)) return { ok: false, reason: 'malformed-document' };

    if (typeof file !== 'object' || file === null) return { ok: false, reason: 'malformed-index' };
    const expectedEntry = walletFileEntryName(doc.id, doc.mimeType);
    if (file.entry !== expectedEntry) return { ok: false, reason: 'entry-mismatch', id: doc.id };
    if (file.mimeType !== doc.mimeType) return { ok: false, reason: 'entry-mismatch', id: doc.id };
    // The metadata's original filename must resolve to the same canonical
    // type — a mislabelled pair is refused just like the add flow refuses it.
    if (resolveWalletMimeType(doc.fileName || file.entry, file.mimeType) !== doc.mimeType) {
      return { ok: false, reason: 'entry-mismatch', id: doc.id };
    }
    if (
      typeof file.sizeBytes !== 'number' ||
      !Number.isInteger(file.sizeBytes) ||
      file.sizeBytes <= 0 ||
      file.sizeBytes > MAX_WALLET_FILE_BYTES
    ) {
      return { ok: false, reason: 'bad-attachment-size', id: doc.id };
    }
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      return { ok: false, reason: 'bad-attachment-hash', id: doc.id };
    }
    if (declaredEntries.has(file.entry)) return { ok: false, reason: 'duplicate-id', id: doc.id };
    declaredEntries.add(file.entry);
    if (!presentEntryNames.has(file.entry)) {
      return { ok: false, reason: 'missing-attachment', id: doc.id, entry: file.entry };
    }
    validated.push({ document: doc, file });
  }
  for (const name of presentEntryNames) {
    if (!declaredEntries.has(name)) return { ok: false, reason: 'undeclared-attachment', entry: name };
  }
  return { ok: true, documents: validated };
}

/**
 * One user-facing sentence per rejection reason. Central so the UI, the
 * tests and future surfaces (a CLI, a doctor view) agree on the wording.
 */
export function restoreRejectionText(reason) {
  switch (reason?.reason ?? reason) {
    case 'unreadable-archive':
      return 'That file could not be read as a Fjallkompis backup — it may be corrupted.';
    case 'not-a-backup':
      return 'That file is not a Fjallkompis complete backup.';
    case 'newer-version':
      return 'This backup was made by a newer version of Fjallkompis. Update the app, then restore.';
    case 'trail-mismatch':
      return 'This backup belongs to a different trail, so nothing was restored and your data is unchanged.';
    case 'state-invalid':
      return 'The trip data inside this backup could not be validated, so nothing was restored.';
    case 'limits-exceeded':
      return 'This backup exceeds the size limits Fjallkompis can restore safely.';
    case 'unsafe-entry':
      return 'This backup contains an unexpected file path, so it was refused.';
    case 'attachment-hash-mismatch':
    case 'attachment-size-mismatch':
      return 'A document file inside this backup does not match its integrity record, so nothing was restored.';
    default:
      return 'This backup could not be validated, so nothing was restored.';
  }
}
