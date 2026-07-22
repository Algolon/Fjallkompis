/**
 * Trail Wallet pure-model behaviour (src/wallet/walletModel.mjs):
 * file validation (type + size), default titles, read-time normalisation
 * and the canonical sort order — all pure functions with `todayIso`
 * injected, following the timetableStatus test pattern.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_WALLET_CATEGORIES,
  MAX_WALLET_FILE_BYTES,
  WALLET_CATEGORIES,
  WALLET_FILE_ACCEPT,
  WALLET_META_ID,
  defaultTitleFromFilename,
  normalizeWalletDocument,
  resolveWalletMimeType,
  sortWalletDocuments,
  validateWalletFile,
  walletCategoryTitle,
  walletSummaryText,
} from '../src/wallet/walletModel.mjs';

// ---- Categories -------------------------------------------------------------

test('the six standalone-document categories exist, in display order, with stable ids', () => {
  assert.deepEqual(
    WALLET_CATEGORIES.map((c) => c.id),
    ['membership', 'insurance-emergency', 'identity', 'route-reference', 'timetable', 'other'],
  );
  assert.deepEqual(
    WALLET_CATEGORIES.map((c) => c.title),
    ['Membership', 'Insurance & emergency', 'Identity', 'Route reference', 'Timetable', 'Other'],
  );
});

test('legacy Trail Wallet categories stay valid on existing records — no data loss', () => {
  assert.deepEqual(
    LEGACY_WALLET_CATEGORIES.map((c) => c.id),
    ['transport', 'booking'],
  );
  // Titles still resolve for legacy records…
  assert.equal(walletCategoryTitle('transport'), 'Transport');
  assert.equal(walletCategoryTitle('booking'), 'Bookings');
  // …and normalisation preserves the stored value verbatim (idempotent).
  const doc = normalizeWalletDocument({
    id: 'doc_legacy',
    title: 'Bus ticket',
    category: 'booking',
    mimeType: 'application/pdf',
    fileName: 'ticket.pdf',
  });
  assert.equal(doc.category, 'booking');
  assert.deepEqual(normalizeWalletDocument(doc), doc);
});

test('unknown category ids resolve to the Other title, never a crash', () => {
  assert.equal(walletCategoryTitle('no-such-category'), 'Other');
});

// ---- File-type validation ---------------------------------------------------

test('the four supported formats are accepted via extension, MIME type, or both', () => {
  // Extension + matching MIME type.
  assert.equal(resolveWalletMimeType('ticket.pdf', 'application/pdf'), 'application/pdf');
  assert.equal(resolveWalletMimeType('photo.jpg', 'image/jpeg'), 'image/jpeg');
  assert.equal(resolveWalletMimeType('photo.JPEG', 'image/jpeg'), 'image/jpeg');
  assert.equal(resolveWalletMimeType('map.png', 'image/png'), 'image/png');
  assert.equal(resolveWalletMimeType('scan.webp', 'image/webp'), 'image/webp');
  // Browser gave no/generic MIME type — the extension decides.
  assert.equal(resolveWalletMimeType('ticket.pdf', ''), 'application/pdf');
  assert.equal(resolveWalletMimeType('photo.jpg', 'application/octet-stream'), 'image/jpeg');
  // No extension at all — the accepted MIME type decides.
  assert.equal(resolveWalletMimeType('busticket', 'application/pdf'), 'application/pdf');
  // Non-standard JPEG alias some platforms report.
  assert.equal(resolveWalletMimeType('photo.jpg', 'image/jpg'), 'image/jpeg');
});

test('unsupported formats are rejected: HEIC, Office, ZIP, arbitrary binaries', () => {
  for (const [name, type] of [
    ['photo.heic', 'image/heic'],
    ['photo.heif', 'image/heif'],
    ['booking.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['tickets.zip', 'application/zip'],
    ['tool.exe', 'application/octet-stream'],
    ['track.gpx', 'application/gpx+xml'],
    ['noextension', ''],
    ['noextension', 'application/octet-stream'],
  ]) {
    assert.equal(resolveWalletMimeType(name, type), null, `${name} (${type}) must be rejected`);
  }
});

test('an accepted extension with a CONFLICTING accepted MIME type is rejected', () => {
  // Something is mislabelled — storing it under either type would lie.
  assert.equal(resolveWalletMimeType('photo.png', 'application/pdf'), null);
  assert.equal(resolveWalletMimeType('doc.pdf', 'image/jpeg'), null);
});

test('a HEIC picked from the Files app is rejected even with a misleading MIME type', () => {
  assert.equal(resolveWalletMimeType('IMG_0001.heic', 'image/jpeg'), null);
});

test('validateWalletFile: the ~20 MB per-file limit with exact boundary behaviour', () => {
  assert.equal(MAX_WALLET_FILE_BYTES, 20 * 1024 * 1024, 'the centralised constant is 20 MiB');
  const at = validateWalletFile({ name: 'a.pdf', type: 'application/pdf', size: MAX_WALLET_FILE_BYTES });
  assert.deepEqual(at, { ok: true, mimeType: 'application/pdf' }, 'exactly the limit is allowed');
  const over = validateWalletFile({
    name: 'a.pdf',
    type: 'application/pdf',
    size: MAX_WALLET_FILE_BYTES + 1,
  });
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'too-large');
  assert.equal(over.sizeBytes, MAX_WALLET_FILE_BYTES + 1, 'the rejected size is reported');
  assert.equal(over.maxBytes, MAX_WALLET_FILE_BYTES, 'the limit is reported for the message');
});

test('validateWalletFile rejects unsupported types with a typed reason', () => {
  const res = validateWalletFile({ name: 'a.zip', type: 'application/zip', size: 10 });
  assert.deepEqual(res, { ok: false, reason: 'unsupported-type' });
});

test('the accept allowlist carries both MIME types and extensions, nothing else', () => {
  assert.equal(
    WALLET_FILE_ACCEPT,
    'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp',
  );
});

// ---- Default titles ---------------------------------------------------------

test('default titles drop the known extension and tidy separators', () => {
  assert.equal(defaultTitleFromFilename('STF-membership_2026.pdf'), 'STF membership 2026');
  assert.equal(defaultTitleFromFilename('bus ticket.jpeg'), 'bus ticket');
  // An unknown suffix may be part of the name — kept.
  assert.equal(defaultTitleFromFilename('route.v2'), 'route.v2');
  assert.equal(defaultTitleFromFilename(''), '');
  assert.equal(defaultTitleFromFilename(undefined), '');
});

// ---- Normalisation ----------------------------------------------------------

const GOOD = {
  id: 'doc_1',
  title: 'Hut booking',
  category: 'booking',
  date: '2026-08-02',
  note: 'Ref 4711',
  pinned: true,
  createdAt: 1,
  updatedAt: 2,
  fileName: 'booking.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1234,
};

test('a well-formed record passes through normalisation unchanged', () => {
  assert.deepEqual(normalizeWalletDocument({ ...GOOD }), GOOD);
});

test('repairable fields fall back to safe defaults', () => {
  const doc = normalizeWalletDocument({
    ...GOOD,
    title: '   ',
    category: 'passport-vault', // never a valid category
    date: 'next tuesday',
    note: 42,
    pinned: 'yes',
    updatedAt: 'later',
    sizeBytes: -5,
  });
  assert.equal(doc.title, 'booking', 'title falls back to the filename stem');
  assert.equal(doc.category, 'other');
  assert.ok(!('date' in doc), 'a malformed date is removed, not carried through');
  assert.ok(!('note' in doc), 'a malformed note is removed');
  assert.equal(doc.pinned, false, 'pinned is strictly boolean');
  assert.equal(doc.updatedAt, doc.createdAt, 'updatedAt falls back to createdAt');
  assert.equal(doc.sizeBytes, 0);
});

test('unknown extra fields survive normalisation (future additive links)', () => {
  const doc = normalizeWalletDocument({ ...GOOD, links: { stopId: 'salka' } });
  assert.deepEqual(doc.links, { stopId: 'salka' });
});

test('unrepairable records are omitted: bad id, meta record, unsupported MIME type', () => {
  assert.equal(normalizeWalletDocument(null), null);
  assert.equal(normalizeWalletDocument('nope'), null);
  assert.equal(normalizeWalletDocument({ ...GOOD, id: '' }), null);
  assert.equal(normalizeWalletDocument({ ...GOOD, id: WALLET_META_ID }), null);
  assert.equal(normalizeWalletDocument({ ...GOOD, mimeType: 'application/zip' }), null);
  assert.equal(normalizeWalletDocument({ ...GOOD, mimeType: undefined }), null);
});

// ---- Sorting ----------------------------------------------------------------

const TODAY = '2026-07-20';
const doc = (id, over = {}) => ({
  id,
  title: id,
  category: 'other',
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  fileName: `${id}.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1,
  ...over,
});

test('canonical order: pinned → upcoming → undated → expired', () => {
  const docs = [
    doc('expired', { date: '2026-07-01' }),
    doc('undated'),
    doc('upcoming', { date: '2026-08-01' }),
    doc('pinned-undated', { pinned: true }),
  ];
  assert.deepEqual(
    sortWalletDocuments(docs, TODAY).map((d) => d.id),
    ['pinned-undated', 'upcoming', 'undated', 'expired'],
  );
});

test('a document dated TODAY is upcoming, never expired (boundary)', () => {
  const docs = [
    doc('yesterday', { date: '2026-07-19' }),
    doc('today', { date: '2026-07-20' }),
    doc('tomorrow', { date: '2026-07-21' }),
  ];
  assert.deepEqual(
    sortWalletDocuments(docs, TODAY).map((d) => d.id),
    ['today', 'tomorrow', 'yesterday'],
    'today sorts with (and ahead of) upcoming; yesterday is expired',
  );
});

test('pinned stays primary — a pinned EXPIRED document still leads unpinned upcoming', () => {
  const docs = [
    doc('upcoming', { date: '2026-08-01' }),
    doc('pinned-expired', { pinned: true, date: '2026-06-01' }),
    doc('pinned-upcoming', { pinned: true, date: '2026-07-25' }),
  ];
  assert.deepEqual(
    sortWalletDocuments(docs, TODAY).map((d) => d.id),
    ['pinned-upcoming', 'pinned-expired', 'upcoming'],
    'the pinned block is internally ordered by the same date rules',
  );
});

test('secondary orders: upcoming soonest-first, expired most-recent-first, undated newest-updated-first', () => {
  const docs = [
    doc('up-late', { date: '2026-09-01' }),
    doc('up-soon', { date: '2026-07-22' }),
    doc('ex-old', { date: '2026-05-01' }),
    doc('ex-recent', { date: '2026-07-15' }),
    doc('un-old', { updatedAt: 100 }),
    doc('un-new', { updatedAt: 900 }),
  ];
  assert.deepEqual(
    sortWalletDocuments(docs, TODAY).map((d) => d.id),
    ['up-soon', 'up-late', 'un-new', 'un-old', 'ex-recent', 'ex-old'],
  );
});

test('the sort is deterministic on full ties and does not mutate its input', () => {
  const docs = [doc('b'), doc('a')];
  const frozen = docs.slice();
  const sorted = sortWalletDocuments(docs, TODAY);
  assert.deepEqual(sorted.map((d) => d.id), ['a', 'b'], 'title/id tie-break is stable');
  assert.deepEqual(docs, frozen, 'input untouched');
});

// ---- Storage summary --------------------------------------------------------

test('the storage summary pluralises correctly', () => {
  assert.equal(walletSummaryText(8, '14.2 MB'), '8 documents · 14.2 MB stored locally');
  assert.equal(walletSummaryText(1, '120 kB'), '1 document · 120 kB stored locally');
  assert.equal(walletSummaryText(0, '0 kB'), '0 documents · 0 kB stored locally');
});
