import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { walletFileEntryName } from '../../src/backup/completeBackup.mjs';

export const STORE_DEMO_BACKUP_SHA256 =
  'db2b0826b935a21875ef79f05b65df66f0c3126fb4de966d823bedc9876421c2';

export const STORE_CAPTURE_DATE = '2027-09-06T10:00:00+02:00';

export const STORE_PROFILES = Object.freeze([
  Object.freeze({ id: 'phone', viewport: Object.freeze({ width: 360, height: 640 }), deviceScaleFactor: 3, output: Object.freeze({ width: 1080, height: 1920 }) }),
  Object.freeze({ id: 'tablet-7', viewport: Object.freeze({ width: 810, height: 1440 }), deviceScaleFactor: 2, output: Object.freeze({ width: 1620, height: 2880 }) }),
  Object.freeze({ id: 'tablet-10', viewport: Object.freeze({ width: 1080, height: 1920 }), deviceScaleFactor: 1.8, output: Object.freeze({ width: 1944, height: 3456 }) }),
]);

export const STORE_SCENES = Object.freeze([
  Object.freeze({ id: '01-today', title: 'Today', hash: '#/today', caption: 'Your day, at a glance' }),
  Object.freeze({ id: '02-map-terrain', title: 'Terrain Map', hash: '#/map', map: 'terrain', caption: 'Navigate offline' }),
  Object.freeze({ id: '03-map-satellite', title: 'Satellite Map', hash: '#/map', map: 'satellite', caption: 'See the trail in context' }),
  Object.freeze({ id: '04-stage-guide', title: 'Guide / Stage information', hash: '#/guide/stages', setup: 'stage-guide', caption: 'Know what lies ahead' }),
  Object.freeze({ id: '05-packing', title: 'Plan / Packing', hash: '#/plan/packing', caption: 'Plan your adventure' }),
  Object.freeze({ id: '06a-trail-readiness', title: 'Trail Readiness', hash: '#/settings', setup: 'trail-readiness', caption: 'Get trail-ready' }),
  Object.freeze({ id: '06b-wallet', title: 'Wallet candidate', hash: '#/plan/wallet', caption: 'Keep essentials close' }),
]);

const PRIVATE_PATTERNS = Object.freeze([
  ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['private filesystem path', /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/i],
  ['account/device identifier', /\b(?:account|device)[_-]?(?:id|identifier)\b/i],
  ['private note', /\bprivate\s+notes?\b/i],
  ['QR/barcode', /\b(?:qr\s*code|barcode)\b/i],
]);

const REFERENCE_PATTERN =
  /\b(?:booking\s*(?:ref(?:erence)?|id)|reservation\s*(?:code|id)|ticket\s*(?:number|id)|passenger)\b/i;

function looksLikePersonalPhone(text) {
  if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text) || /^[a-f\d]{64}$/i.test(text)) return false;
  const candidates = text.match(/(?:\+?\d[\d ()-]{7,}\d)/g) ?? [];
  return candidates.some((candidate) => {
    if (/\bDEMO\b/i.test(text)) return false;
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 && (/^\+/.test(candidate) || /[ ()]/.test(candidate));
  });
}

export function privacyFindings(text, source = 'text') {
  const value = String(text ?? '');
  const findings = [];
  for (const [kind, pattern] of PRIVATE_PATTERNS) {
    if (pattern.test(value)) findings.push(`${source}: ${kind}`);
  }
  if (looksLikePersonalPhone(value)) findings.push(`${source}: phone-like number`);
  if (REFERENCE_PATTERN.test(value) && !/\b(?:DEMO|SAMPLE|SYNTHETIC|TEST)\b/i.test(value)) {
    findings.push(`${source}: non-demo booking/ticket/passenger reference`);
  }
  return findings;
}

function walkStrings(value, visit, trail = 'root') {
  if (typeof value === 'string') visit(value, trail);
  else if (Array.isArray(value)) value.forEach((item, index) => walkStrings(item, visit, `${trail}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) walkStrings(item, visit, `${trail}.${key}`);
  }
}

export function auditPinnedBackup(backupPath) {
  const bytes = fs.readFileSync(backupPath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== STORE_DEMO_BACKUP_SHA256) {
    throw new Error(
      `Refusing unpinned demo backup: expected ${STORE_DEMO_BACKUP_SHA256}, received ${sha256}.`,
    );
  }

  const files = unzipSync(bytes);
  const findings = [];
  let jsonEntries = 0;
  let walletDocuments = 0;
  for (const [entryName, data] of Object.entries(files)) {
    findings.push(...privacyFindings(entryName, 'archive entry name'));
    const mayBeJson = /\.json$/i.test(entryName) || data[0] === 0x7b || data[0] === 0x5b;
    if (!mayBeJson) continue;
    let parsed;
    try {
      parsed = JSON.parse(strFromU8(data));
    } catch {
      throw new Error(`Demo backup JSON is unreadable (${path.basename(entryName)}).`);
    }
    jsonEntries += 1;
    if (Array.isArray(parsed?.documents)) walletDocuments = parsed.documents.length;
    walkStrings(parsed, (value, trail) => findings.push(...privacyFindings(value, trail)));
  }
  if (findings.length > 0) {
    throw new Error(`Privacy audit rejected the pinned demo backup:\n- ${[...new Set(findings)].join('\n- ')}`);
  }
  if (walletDocuments !== 4) throw new Error(`Expected 4 sanitized Wallet documents, found ${walletDocuments}.`);
  return Object.freeze({ sha256, bytes: bytes.byteLength, entries: Object.keys(files).length, jsonEntries, walletDocuments });
}

/**
 * The privacy sanitizer changed Wallet document ids but deliberately left the
 * opaque ZIP paths alone. Production restore correctly rejects that mismatch.
 * Repair only that capture-input packaging seam in memory; attachment bytes,
 * state, document metadata and the pinned source file remain unchanged.
 */
export function captureRestoreBuffer(backupPath) {
  auditPinnedBackup(backupPath);
  const files = unzipSync(fs.readFileSync(backupPath));
  const indexEntry = Object.keys(files).find((name) => /(?:^|\/)wallet\/index\.json$/i.test(name));
  if (!indexEntry) throw new Error('Pinned demo backup has no Wallet index.');
  const index = JSON.parse(strFromU8(files[indexEntry]));
  for (const record of index.documents ?? []) {
    const oldEntry = record.file?.entry;
    const expectedEntry = walletFileEntryName(record.document?.id, record.document?.mimeType);
    if (!files[oldEntry]) throw new Error('Pinned demo backup is missing a Wallet attachment.');
    if (oldEntry !== expectedEntry) {
      files[expectedEntry] = files[oldEntry];
      delete files[oldEntry];
      record.file.entry = expectedEntry;
    }
  }
  files[indexEntry] = strToU8(JSON.stringify(index, null, 2));
  return Buffer.from(zipSync(files, { level: 6 }));
}

export function pngDimensions(buffer) {
  const bytes = Buffer.from(buffer);
  const signature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== signature) throw new Error('Output is not a PNG.');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function validatePng(buffer, profile, fileName) {
  const dimensions = pngDimensions(buffer);
  if (dimensions.width !== profile.output.width || dimensions.height !== profile.output.height) {
    throw new Error(`${fileName}: expected ${profile.output.width}x${profile.output.height}, got ${dimensions.width}x${dimensions.height}.`);
  }
  // Treat Google's “8 MB” as decimal bytes, the stricter interpretation.
  if (buffer.byteLength > 8_000_000) throw new Error(`${fileName}: exceeds the Google Play 8 MB limit.`);
  if (dimensions.width * 16 !== dimensions.height * 9) throw new Error(`${fileName}: output is not exact portrait 9:16.`);
  return dimensions;
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function parseStoreCaptureArgs(argv) {
  const out = { backup: process.env.STORE_DEMO_BACKUP ?? null, output: 'artifacts/store-capture', skipBuild: false, captions: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--backup') out.backup = argv[++i] ?? null;
    else if (arg === '--output') out.output = argv[++i] ?? out.output;
    else if (arg === '--skip-build') out.skipBuild = true;
    else if (arg === '--no-captions') out.captions = false;
    else if (arg === '--help') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}
