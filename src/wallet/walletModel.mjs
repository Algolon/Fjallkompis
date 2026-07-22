/**
 * Trail Wallet — pure domain logic (no storage, no DOM, no React).
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` can drive
 * validation, sorting and normalisation deterministically without a
 * TypeScript toolchain — the same pattern as src/utils/stateMigration.mjs
 * and src/data/transport.mjs. The app imports it through Vite unchanged.
 *
 * Design notes (docs/proposals/trail-wallet.md):
 *  - The wallet is deliberately narrow: a small number of hiking documents
 *    (memberships, tickets, bookings, insurance references, route PDFs),
 *    stored locally in IndexedDB — never in the localStorage state blob.
 *  - Four file types only: PDF, JPEG, PNG, WebP. Validation uses BOTH the
 *    filename extension and the browser-provided MIME type, because the
 *    latter can be empty or inconsistent across platforms.
 *  - Sorting takes `todayIso` as an argument (the timetableStatus pattern)
 *    so ordering around the date boundary is unit-testable.
 *  - Normalisation is read-time and never throws: malformed records are
 *    repaired where safe and omitted where not (unknown MIME type — the
 *    UI could neither open nor export such a file honestly).
 */

/** Data-level schema of the wallet records (independent of the IDB version). */
export const WALLET_SCHEMA_VERSION = 1;

/** Reserved id of the schema/meta record kept alongside the documents. */
export const WALLET_META_ID = '__meta__';

/**
 * Soft per-file limit (not a total-wallet limit). Centralised so the add
 * dialog, the rejection copy and the tests all agree on one number.
 */
export const MAX_WALLET_FILE_BYTES = 20 * 1024 * 1024;

/**
 * The six standalone-document categories offered for NEW documents, in
 * display order. Since the Trip plan iteration a personal ticket or booking
 * confirmation belongs on a Travel or Stay item (with the file attached), so
 * the standalone categories cover reference material only.
 */
export const WALLET_CATEGORIES = [
  { id: 'membership', title: 'Membership' },
  { id: 'insurance-emergency', title: 'Insurance & emergency' },
  { id: 'identity', title: 'Identity' },
  { id: 'route-reference', title: 'Route reference' },
  { id: 'timetable', title: 'Timetable' },
  { id: 'other', title: 'Other' },
];

/**
 * Historical Trail Wallet categories. Existing records keep these ids
 * VERBATIM (no data loss, no silent reclassification — normalisation stays
 * idempotent) and they still resolve to their historical titles; they are
 * simply no longer offered for new documents.
 */
export const LEGACY_WALLET_CATEGORIES = [
  { id: 'transport', title: 'Transport' },
  { id: 'booking', title: 'Bookings' },
];

const CATEGORY_IDS = new Set(
  [...WALLET_CATEGORIES, ...LEGACY_WALLET_CATEGORIES].map((c) => c.id),
);

/** Display title for a category id ('Other' for unknown ids — never throws). */
export function walletCategoryTitle(id) {
  return (
    WALLET_CATEGORIES.find((c) => c.id === id)?.title ??
    LEGACY_WALLET_CATEGORIES.find((c) => c.id === id)?.title ??
    WALLET_CATEGORIES.find((c) => c.id === 'other').title
  );
}

// ---- Supported file types ---------------------------------------------------

/** Canonical MIME type per accepted filename extension. */
const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const ACCEPTED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

/** Common non-standard aliases some platforms report. */
const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' };

/**
 * The <input accept> allowlist — MIME types AND extensions, because some
 * pickers match on one and some on the other. Single source of truth: the
 * file input must use this constant, never a hand-typed copy.
 */
export const WALLET_FILE_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';

/** Lower-cased final extension of a filename, or null when it has none. */
function fileExtension(fileName) {
  if (typeof fileName !== 'string') return null;
  const m = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * Resolve a (filename, browser MIME type) pair to one of the four canonical
 * wallet MIME types, or null when the file is not supported.
 *
 * Rules — extension and MIME type must agree, and neither alone is trusted:
 *  - a known extension with an empty/generic MIME type resolves by extension
 *    (browsers sometimes report '' or application/octet-stream);
 *  - a known extension with a matching accepted MIME type resolves normally;
 *  - a known extension with a CONFLICTING accepted MIME type is rejected —
 *    something is mislabelled and storing it under either type would lie;
 *  - an unknown extension (heic, docx, zip, …) is rejected even when the
 *    reported MIME type looks acceptable;
 *  - no extension at all falls back to the reported MIME type alone.
 */
export function resolveWalletMimeType(fileName, mimeType) {
  const ext = fileExtension(fileName);
  const raw = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  const mime = MIME_ALIASES[raw] ?? raw;
  const extMime = ext ? MIME_BY_EXTENSION[ext] : undefined;

  if (ext && !extMime) return null; // known-unsupported extension
  if (extMime) {
    if (mime === '' || mime === 'application/octet-stream') return extMime;
    if (!ACCEPTED_MIME_TYPES.has(mime)) return null;
    return mime === extMime ? extMime : null; // conflicting claims → reject
  }
  return ACCEPTED_MIME_TYPES.has(mime) ? mime : null;
}

/**
 * Validate a candidate file (name/type/size — the fields a File provides).
 * Returns a typed result; the UI owns the wording of each reason.
 */
export function validateWalletFile({ name, type, size }) {
  const mimeType = resolveWalletMimeType(name, type);
  if (!mimeType) return { ok: false, reason: 'unsupported-type' };
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return { ok: false, reason: 'unsupported-type' };
  }
  if (size > MAX_WALLET_FILE_BYTES) {
    return { ok: false, reason: 'too-large', sizeBytes: size, maxBytes: MAX_WALLET_FILE_BYTES };
  }
  return { ok: true, mimeType };
}

/**
 * A sensible default document title from an original filename: the known
 * file extension is dropped (an unknown suffix stays — it may be part of the
 * name), separators become spaces, whitespace collapses. Never throws.
 */
export function defaultTitleFromFilename(fileName) {
  if (typeof fileName !== 'string') return '';
  let base = fileName.trim();
  const ext = fileExtension(base);
  if (ext && MIME_BY_EXTENSION[ext]) base = base.slice(0, -(ext.length + 1));
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---- Document records -------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Unique document id (same shape as the packing list's custom-item ids). */
export function newWalletDocumentId() {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Read-time normalisation of one stored record into a WalletDocument, or
 * null when the record cannot be represented honestly (no usable id, the
 * reserved meta id, or an unsupported MIME type — such a file could neither
 * be opened nor exported correctly). Repairable fields fall back to safe
 * defaults instead; never throws. Unknown extra fields (future additive
 * links to stops/stages/days) are preserved verbatim.
 */
export function normalizeWalletDocument(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '' || raw.id === WALLET_META_ID) return null;
  const mimeType = ACCEPTED_MIME_TYPES.has(raw.mimeType) ? raw.mimeType : null;
  if (!mimeType) return null;

  const fileName = typeof raw.fileName === 'string' ? raw.fileName : '';
  const title =
    typeof raw.title === 'string' && raw.title.trim() !== ''
      ? raw.title
      : defaultTitleFromFilename(fileName) || 'Untitled document';
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0;

  // Spread first so unknown extra fields survive, then override every known
  // field with its normalised value — and REMOVE invalid optional fields
  // (the spread would otherwise carry a malformed date/note through).
  const doc = {
    ...raw,
    id: raw.id,
    title,
    category: CATEGORY_IDS.has(raw.category) ? raw.category : 'other',
    pinned: raw.pinned === true,
    createdAt,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : createdAt,
    fileName,
    mimeType,
    sizeBytes:
      typeof raw.sizeBytes === 'number' && Number.isFinite(raw.sizeBytes) && raw.sizeBytes >= 0
        ? raw.sizeBytes
        : 0,
  };
  if (!(typeof raw.date === 'string' && DATE_RE.test(raw.date))) delete doc.date;
  if (!(typeof raw.note === 'string' && raw.note !== '')) delete doc.note;
  return doc;
}

// ---- Sorting ----------------------------------------------------------------

/**
 * Date grouping relative to an injected `todayIso` (yyyy-mm-dd). A document
 * dated TODAY is upcoming, never expired. ISO strings compare correctly as
 * plain strings.
 */
function dateGroup(doc, todayIso) {
  if (!doc.date) return 1; // undated
  return doc.date >= todayIso ? 0 : 2; // upcoming : expired
}

/**
 * Canonical wallet ordering (pure — `todayIso` injected for testability):
 *   1. pinned documents (each pinned/unpinned block internally ordered the same way)
 *   2. upcoming dated documents — nearest date first
 *   3. undated documents — most recently updated first
 *   4. expired documents — most recently expired first
 * Deterministic tie-breaks: updatedAt (newest first), then title, then id.
 * Returns a new array; the input is not mutated.
 */
export function sortWalletDocuments(documents, todayIso) {
  return [...documents].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ga = dateGroup(a, todayIso);
    const gb = dateGroup(b, todayIso);
    if (ga !== gb) return ga - gb;
    if (ga === 0 && a.date !== b.date) return a.date < b.date ? -1 : 1; // soonest first
    if (ga === 2 && a.date !== b.date) return a.date > b.date ? -1 : 1; // freshest first
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---- Storage summary --------------------------------------------------------

/**
 * The subtle "8 documents · 14.2 MB stored locally" line. The size is passed
 * in already formatted (formatBytes lives in the map/offline layer, which
 * plain-node tests do not import).
 */
export function walletSummaryText(count, formattedSize) {
  return `${count} document${count === 1 ? '' : 's'} · ${formattedSize} stored locally`;
}
