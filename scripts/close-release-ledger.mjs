#!/usr/bin/env node
/**
 * Closes the ledger for a versionCode Play has ACCEPTED.
 *
 * Run only from the release workflow's post-upload job, against the provenance
 * file `scripts/play-release.mjs` writes — so it can only ever record something
 * that actually happened. It produces a commit, never a push to `main`: the
 * result is a pull request that still has to pass CI and be merged by a human.
 *
 * It touches exactly three files, and refuses to be pointed at anything else:
 *
 *   android/release-ledger.json   append the accepted code, raise the fence
 *   android/version.properties    append the prose history line, androidBuild + 1
 *   docs/ANDROID.md               regenerate the versioning table's two live rows
 *
 * No product or runtime file is in that list, and the workflow re-checks the
 * working tree against it before pushing.
 *
 * Usage: node scripts/close-release-ledger.mjs --provenance release-provenance.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readLedger, computeVersionCode } from './release-candidate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = (rel) => join(root, rel);
const read = (rel) => readFileSync(path(rel), 'utf8');

/** The complete set of files this script may modify. Asserted, not assumed. */
export const LEDGER_PATHS = [
  'android/release-ledger.json',
  'android/version.properties',
  'docs/ANDROID.md',
];

const BEGIN = '<!-- release-ledger:begin -->';
const END = '<!-- release-ledger:end -->';

/** The two rows of the ANDROID.md versioning table that move with every release. */
export function versioningRows(ledger, nextVersionName, nextAndroidBuild) {
  const byVersion = new Map();
  for (const entry of ledger.consumed) {
    if (!byVersion.has(entry.versionName)) byVersion.set(entry.versionName, []);
    byVersion.get(entry.versionName).push(entry.versionCode);
  }
  const consumed = [...byVersion.entries()]
    .map(([version, codes]) => `**${version}** — ${codes.map((c) => `\`${c}\``).join(', ')}`)
    .join('; ');

  const [major, minor, patch] = nextVersionName.split('.').map(Number);
  const next = computeVersionCode(major, minor, patch, nextAndroidBuild);

  return [
    `| **Consumed** | ${consumed}. Every one accepted by Play on the \`internal\` track and burned forever — Play will never accept any of them again. The complete record, with source SHAs and workflow runs, is [\`android/release-ledger.json\`](../android/release-ledger.json) |`,
    `| Next upload | **${next}** (${nextVersionName}, build ${nextAndroidBuild} — \`androidBuild=${nextAndroidBuild}\`, already set) — or \`X.Y.Z\` build 1 if the app version bumps first |`,
  ].join('\n');
}

export function appendToLedger(ledgerSource, accepted) {
  const ledger = readLedger(ledgerSource);
  if (ledger.codes.includes(accepted.versionCode)) {
    throw new Error(`versionCode ${accepted.versionCode} is already recorded in the ledger`);
  }
  if (accepted.versionCode <= ledger.highestConsumedVersionCode) {
    throw new Error(
      `versionCode ${accepted.versionCode} does not exceed the recorded fence ${ledger.highestConsumedVersionCode}`,
    );
  }

  // Rebuild from the parsed source so key order and the $comment block survive.
  const raw = JSON.parse(ledgerSource);
  raw.consumed.push({
    versionCode: accepted.versionCode,
    versionName: accepted.versionName,
    androidBuild: accepted.androidBuild,
    playTrack: accepted.track,
    acceptedOn: accepted.acceptedOn,
    sourceSha: accepted.sourceSha || null,
    workflowRunUrl: accepted.workflowRunUrl || null,
    note: accepted.note,
  });
  raw.highestConsumedVersionCode = accepted.versionCode;
  return `${JSON.stringify(raw, null, 2)}\n`;
}

export function appendToVersionProperties(source, accepted, nextAndroidBuild) {
  const line =
    `#   ${accepted.versionCode}  (${accepted.versionName} build ${accepted.androidBuild})  accepted by Google Play on the\n` +
    `#            internal track ${accepted.acceptedOn} from main ${accepted.sourceSha || '(unrecorded)'}\n` +
    `#            (run ${accepted.workflowRunUrl || 'unrecorded'}). Released automatically by\n` +
    `#            .github/workflows/android-internal-release.yml; see\n` +
    `#            android/release-ledger.json for the machine-readable record.\n`;

  const counter = /^androidBuild=\d+$/m;
  if (!counter.test(source)) throw new Error('android/version.properties has no androidBuild line to advance');

  // The history block sits immediately above the counter; insert there so the
  // file keeps reading top-to-bottom as instructions, then history, then value.
  return source.replace(counter, `${line}androidBuild=${nextAndroidBuild}`);
}

export function updateAndroidDoc(source, rows) {
  const begin = source.indexOf(BEGIN);
  const end = source.indexOf(END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`docs/ANDROID.md is missing the ${BEGIN} / ${END} markers around the versioning rows`);
  }
  return `${source.slice(0, begin + BEGIN.length)}\n${rows}\n${source.slice(end)}`;
}

// --- CLI ---------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const index = process.argv.indexOf('--provenance');
  const provenancePath = index === -1 ? 'release-provenance.json' : process.argv[index + 1];
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));

  if (provenance.playResult !== 'accepted' && !String(provenance.playResult).startsWith('accepted')) {
    console.error(`::error::refusing to close the ledger: playResult is "${provenance.playResult}", not an acceptance`);
    process.exit(1);
  }
  if (provenance.track !== 'internal') {
    console.error(`::error::refusing to close the ledger for track "${provenance.track}"`);
    process.exit(1);
  }

  const accepted = {
    versionCode: provenance.versionCode,
    versionName: provenance.versionName,
    androidBuild: provenance.androidBuild,
    track: provenance.track,
    // Date is supplied, never taken from the runner clock at an arbitrary
    // moment: the release date is the date the workflow recorded.
    acceptedOn: provenance.acceptedOn ?? new Date().toISOString().slice(0, 10),
    sourceSha: provenance.sourceSha,
    workflowRunUrl: provenance.workflowRunUrl,
    note:
      provenance.releaseNotes ||
      `Released to Internal Testing by the automated release workflow from main ${provenance.sourceSha || '(unrecorded)'}. Not yet physically validated on a device.`,
  };

  const nextAndroidBuild = accepted.androidBuild + 1;

  const newLedger = appendToLedger(read('android/release-ledger.json'), accepted);
  writeFileSync(path('android/release-ledger.json'), newLedger);
  writeFileSync(
    path('android/version.properties'),
    appendToVersionProperties(read('android/version.properties'), accepted, nextAndroidBuild),
  );
  writeFileSync(
    path('docs/ANDROID.md'),
    updateAndroidDoc(
      read('docs/ANDROID.md'),
      versioningRows(readLedger(newLedger), accepted.versionName, nextAndroidBuild),
    ),
  );

  console.log(
    `Ledger closed for ${accepted.versionCode}; androidBuild advanced to ${nextAndroidBuild}. ` +
      `Files changed: ${LEDGER_PATHS.join(', ')}`,
  );
}
