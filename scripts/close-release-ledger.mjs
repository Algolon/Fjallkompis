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
 *   docs/ANDROID.md               regenerate BOTH marked regions — the
 *                                 versioning table's two live rows, and the
 *                                 status header's current-build line
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

/**
 * The generated regions of docs/ANDROID.md, by marker name.
 *
 *   release-ledger   the versioning table's two live rows
 *   release-current  the one-line "current Internal Testing build" statement
 *
 * Two regions rather than one because they have different owners. Everything
 * outside them — including the physical-validation narrative, which cites older
 * versionCodes as HISTORY and must not move — stays human-written. The status
 * header used to state the current build in that same prose, and went stale the
 * moment a release succeeded: it still named 2700005 after 2700006 shipped.
 */
const MARKERS = ['release-ledger', 'release-current'];

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

/**
 * The one volatile sentence in the status header, derived from the ledger's
 * FINAL accepted entry — never from provenance, and never hand-written.
 *
 * Reading the last entry rather than being handed the release being closed is
 * deliberate: it makes the line a pure function of the committed ledger, so it
 * can be regenerated and verified at any time, by anyone, without a release in
 * flight.
 */
export function currentReleaseLine(ledger) {
  const latest = ledger.consumed[ledger.consumed.length - 1];
  if (!latest) throw new Error('the release ledger records no accepted release to describe');

  // The ledger's own fence and its last entry must agree before either is
  // quoted in prose. readLedger already enforces this; asserting it here too
  // means the sentence cannot be generated from a ledger that disagrees with
  // itself even if this function is ever called with a hand-built object.
  if (latest.versionCode !== ledger.highestConsumedVersionCode) {
    throw new Error(
      `the ledger's last entry (${latest.versionCode}) is not its high-water mark ` +
        `(${ledger.highestConsumedVersionCode}) — refusing to describe a current build`,
    );
  }

  return (
    `**Current Internal Testing build: \`${latest.versionName}\` / versionCode ` +
    `\`${latest.versionCode}\`** — accepted by Google Play on the \`${latest.playTrack}\` ` +
    `track on ${latest.acceptedOn}. The source commit and workflow run that produced ` +
    'it are recorded in [`android/release-ledger.json`](../android/release-ledger.json).'
  );
}

/** Replace one marked region, leaving everything outside it byte-for-byte alone. */
function replaceMarkedSection(source, marker, content) {
  const begin = `<!-- ${marker}:begin -->`;
  const end = `<!-- ${marker}:end -->`;
  const b = source.indexOf(begin);
  const e = source.indexOf(end);
  if (b === -1 || e === -1 || e < b) {
    throw new Error(`docs/ANDROID.md is missing the ${begin} / ${end} markers`);
  }
  if (source.indexOf(begin, b + 1) !== -1 || source.indexOf(end, e + 1) !== -1) {
    throw new Error(`docs/ANDROID.md declares the ${marker} markers more than once`);
  }
  return `${source.slice(0, b + begin.length)}\n${content}\n${source.slice(e)}`;
}

/**
 * Regenerate every marked region of docs/ANDROID.md. One entry point, one
 * marker mechanism — a second document generator would be a second thing to
 * keep in step with the ledger.
 */
export function updateAndroidDoc(source, rows, currentLine) {
  let updated = replaceMarkedSection(source, 'release-ledger', rows);
  if (currentLine !== undefined) {
    updated = replaceMarkedSection(updated, 'release-current', currentLine);
  }
  return updated;
}

export { MARKERS, replaceMarkedSection };

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
  const closedLedger = readLedger(newLedger);
  writeFileSync(
    path('docs/ANDROID.md'),
    updateAndroidDoc(
      read('docs/ANDROID.md'),
      versioningRows(closedLedger, accepted.versionName, nextAndroidBuild),
      currentReleaseLine(closedLedger),
    ),
  );

  console.log(
    `Ledger closed for ${accepted.versionCode}; androidBuild advanced to ${nextAndroidBuild}. ` +
      `Files changed: ${LEDGER_PATHS.join(', ')}`,
  );
}
