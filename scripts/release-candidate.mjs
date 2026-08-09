#!/usr/bin/env node
/**
 * The release candidate, derived from committed metadata and nothing else.
 *
 * Answers one question — "what would the next Play upload be, and is it legal?"
 * — from exactly the inputs Gradle uses, with the same formula, so the number
 * printed here cannot drift from the number stamped into the bundle.
 *
 * It DERIVES. It never increments, never writes, never touches the ledger.
 * Advancing `androidBuild` is a committed change a human makes (or the
 * post-release ledger PR proposes); a build script that could bump it would be
 * a build script that could silently consume a versionCode.
 *
 * Fails (exit 1) unless every one of these holds:
 *
 *   1. package.json version is plain MAJOR.MINOR.PATCH;
 *   2. android/version.properties declares one positive androidBuild;
 *   3. every field is inside the width the versionCode formula allows;
 *   4. the computed code is inside Play's 1..2_100_000_000;
 *   5. android/release-ledger.json is internally consistent — strictly
 *      ascending, no duplicates, highestConsumedVersionCode equals the largest
 *      entry;
 *   6. the candidate strictly outranks highestConsumedVersionCode;
 *   7. the candidate appears nowhere in the consumed list.
 *
 * Usage:
 *   node scripts/release-candidate.mjs            # human-readable, exits 1 on any failure
 *   node scripts/release-candidate.mjs --json     # machine-readable on stdout
 *   node scripts/release-candidate.mjs --github-output   # append to $GITHUB_OUTPUT
 *
 * This file is imported by tests/android-release-config.test.mjs, so the fence
 * the workflow enforces and the fence the test enforces are the same code.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

/** The permanent Play identity. Changing this string is changing the app. */
export const APPLICATION_ID = 'com.algolon.fjallkompis';

/**
 * The SHA-256 of the UPLOAD KEY certificate Google Play has registered for
 * com.algolon.fjallkompis, and the trust anchor for "is this our signing key?"
 *
 * WHY THIS IS COMMITTED, and not a repository variable.
 *
 * The threat is an attacker who can rewrite the four ANDROID_UPLOAD_* secrets,
 * substituting a keystore they control. Every in-build check would still pass:
 * the bundle really is signed, really is not the debug key, and really does
 * match "the configured upload key" — because the configured key is the
 * attacker's. Comparing the artifact against a key derived from the same
 * secrets in the same run cannot detect that; the comparison has to be against
 * a value the secrets cannot reach.
 *
 * A repository VARIABLE is not that value. Variables and secrets are the same
 * control plane and the same admin: whoever can swap the keystore can swap the
 * variable in the next click, and neither change is reviewed. A committed
 * constant is different in the way that matters — changing it needs a pull
 * request against a protected branch, so the substitution becomes visible in a
 * diff instead of silent in a settings page.
 *
 * PROVENANCE. Not transcribed from a keystore and not invented. This is the
 * fingerprint the release workflow itself printed for the artifacts Play
 * ACCEPTED as 2700002, 2700003, 2700004 and 2700005 — runs 31249499518,
 * 31260466056, 31271009542 and 31285046146, whose ids are recorded against
 * those entries in android/release-ledger.json. All four agree. Since Play
 * accepted those bundles under Play App Signing, this is by construction the
 * upload key Play has registered.
 *
 * Cross-check it any time against Play Console -> App integrity -> App signing
 * -> Upload key certificate. Certificate fingerprints are public information;
 * Play displays this one. It is not a credential.
 */
export const UPLOAD_KEY_SHA256 =
  '67:6F:10:47:74:6A:B9:BB:51:55:5E:B0:DB:FC:6A:0E:21:90:41:DF:C6:10:1B:9C:05:FF:47:6A:D9:08:56:EB';

/** Fingerprints differ only in punctuation and case between tools. */
export const normaliseFingerprint = (value) =>
  String(value).replace(/[\s:]/g, '').toUpperCase();

/**
 * The ONLY track this repository releases to automatically. A constant, not an
 * input: a free-text track would put "production" one typo away from a
 * rollout that cannot be taken back.
 */
export const RELEASE_TRACK = 'internal';

/** Field weights — identical to android/app/build.gradle. */
export const WEIGHTS = { major: 10_000_000, minor: 100_000, patch: 1_000 };

/** Play's accepted versionCode range. */
export const PLAY_VERSION_CODE_MAX = 2_100_000_000;

export const computeVersionCode = (major, minor, patch, androidBuild) =>
  major * WEIGHTS.major + minor * WEIGHTS.minor + patch * WEIGHTS.patch + androidBuild;

/**
 * Reads and validates the append-only ledger. Throws on any internal
 * inconsistency — a ledger that disagrees with itself must never be used to
 * decide whether a code is free.
 */
export function readLedger(source = read('android/release-ledger.json')) {
  const ledger = JSON.parse(source);

  if (!Array.isArray(ledger.consumed)) {
    throw new Error('android/release-ledger.json: "consumed" must be an array');
  }
  if (!Number.isInteger(ledger.highestConsumedVersionCode)) {
    throw new Error('android/release-ledger.json: "highestConsumedVersionCode" must be an integer');
  }

  const codes = ledger.consumed.map((entry, index) => {
    if (!Number.isInteger(entry.versionCode)) {
      throw new Error(`android/release-ledger.json: consumed[${index}].versionCode is not an integer`);
    }
    for (const field of ['versionName', 'androidBuild', 'playTrack', 'acceptedOn']) {
      if (entry[field] === undefined) {
        throw new Error(`android/release-ledger.json: consumed[${index}] is missing "${field}"`);
      }
    }
    // Re-derive rather than trust: an entry whose code does not follow from its
    // own versionName + androidBuild is a transcription error, and a
    // transcription error in this file is how a consumed code looks free.
    const [major, minor, patch] = String(entry.versionName).split('.').map(Number);
    const derived = computeVersionCode(major, minor, patch, entry.androidBuild);
    if (derived !== entry.versionCode) {
      throw new Error(
        `android/release-ledger.json: consumed[${index}] says versionCode ${entry.versionCode}, ` +
          `but ${entry.versionName} build ${entry.androidBuild} derives ${derived}`,
      );
    }
    return entry.versionCode;
  });

  for (let i = 1; i < codes.length; i += 1) {
    if (codes[i] <= codes[i - 1]) {
      throw new Error(
        `android/release-ledger.json: consumed codes must strictly ascend — ${codes[i]} follows ${codes[i - 1]}`,
      );
    }
  }

  const highest = codes.length > 0 ? codes[codes.length - 1] : 0;
  if (ledger.highestConsumedVersionCode !== highest) {
    throw new Error(
      `android/release-ledger.json: highestConsumedVersionCode is ${ledger.highestConsumedVersionCode}, ` +
        `but the largest consumed entry is ${highest}`,
    );
  }

  return { ...ledger, codes };
}

/**
 * The candidate, plus every reason it might be illegal. Never throws for a
 * *fence* failure — those are returned in `failures` so a caller can report all
 * of them at once. Throws only for malformed inputs.
 */
export function releaseCandidate({
  pkgSource = read('package.json'),
  versionPropsSource = read('android/version.properties'),
  ledgerSource = read('android/release-ledger.json'),
} = {}) {
  const failures = [];

  const pkg = JSON.parse(pkgSource);
  const semver = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(pkg.version ?? ''));
  if (!semver) {
    throw new Error(
      `package.json version "${pkg.version}" is not a plain MAJOR.MINOR.PATCH semver; ` +
        'the versionCode formula cannot be derived from it',
    );
  }
  const [, major, minor, patch] = semver.map(Number);

  const buildMatch = /^androidBuild=(\d+)$/m.exec(versionPropsSource);
  if (!buildMatch) {
    throw new Error('android/version.properties does not declare androidBuild as a plain integer');
  }
  const androidBuild = Number(buildMatch[1]);

  // Field widths — the same guards android/app/build.gradle throws on, checked
  // here too so the failure arrives before a runner is spent on it.
  if (minor >= 100) failures.push(`minor version ${minor} >= 100 overflows the major range`);
  if (patch >= 100) failures.push(`patch version ${patch} >= 100 overflows the minor range`);
  if (androidBuild < 1) failures.push('androidBuild must be >= 1 — Play versionCodes are positive');
  if (androidBuild >= 1000) failures.push(`androidBuild ${androidBuild} >= 1000 collides with the next patch range`);

  const versionCode = computeVersionCode(major, minor, patch, androidBuild);
  if (versionCode < 1 || versionCode > PLAY_VERSION_CODE_MAX) {
    failures.push(`computed versionCode ${versionCode} is outside Play's range (1..${PLAY_VERSION_CODE_MAX})`);
  }

  const ledger = readLedger(ledgerSource);

  if (versionCode <= ledger.highestConsumedVersionCode) {
    failures.push(
      `versionCode ${versionCode} does not outrank the already-consumed ${ledger.highestConsumedVersionCode} — ` +
        'raise androidBuild in android/version.properties, or bump the app version',
    );
  }
  if (ledger.codes.includes(versionCode)) {
    failures.push(
      `versionCode ${versionCode} is already in the append-only ledger — Play accepted it and will never accept it again`,
    );
  }

  return {
    applicationId: APPLICATION_ID,
    track: RELEASE_TRACK,
    versionName: pkg.version,
    versionCode,
    androidBuild,
    highestConsumedVersionCode: ledger.highestConsumedVersionCode,
    consumedVersionCodes: ledger.codes,
    ok: failures.length === 0,
    failures,
  };
}

// --- CLI ---------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  let candidate;
  try {
    candidate = releaseCandidate();
  } catch (error) {
    console.error(`Release candidate could not be derived:\n  ✗ ${error.message}`);
    process.exit(1);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(candidate, null, 2));
  } else if (!process.argv.includes('--github-output')) {
    console.log(`applicationId              ${candidate.applicationId}`);
    console.log(`track                      ${candidate.track}`);
    console.log(`versionName                ${candidate.versionName}`);
    console.log(`versionCode (candidate)    ${candidate.versionCode}`);
    console.log(`androidBuild               ${candidate.androidBuild}`);
    console.log(`highest consumed           ${candidate.highestConsumedVersionCode}`);
  }

  if (!candidate.ok) {
    console.error('\nRelease candidate REFUSED:');
    for (const failure of candidate.failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }

  if (process.argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `applicationId=${candidate.applicationId}`,
        `track=${candidate.track}`,
        `versionName=${candidate.versionName}`,
        `versionCode=${candidate.versionCode}`,
        `androidBuild=${candidate.androidBuild}`,
        `highestConsumedVersionCode=${candidate.highestConsumedVersionCode}`,
        '',
      ].join('\n'),
    );
  }

  if (!process.argv.includes('--json')) {
    console.log(`\n✓ ${candidate.versionCode} is a legal, unconsumed candidate.`);
  }
}
