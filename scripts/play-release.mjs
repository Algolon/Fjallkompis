#!/usr/bin/env node
/**
 * Google Play Internal Testing release — the only thing in this repository that
 * can consume a versionCode.
 *
 * A versionCode Play accepts is burned forever. So every decision here is
 * arranged to fail closed: the track is a constant rather than an input, the
 * candidate is derived from committed metadata rather than chosen, and Play
 * itself is asked what it already holds before anything is uploaded — because
 * the committed ledger is written *after* a release and a lost response would
 * leave it stale.
 *
 * COMMANDS
 *
 *   probe   — resolve credentials, ask Play which versionCodes it already
 *             holds, and refuse if the candidate is among them. Consumes
 *             nothing. This is also the dry-run boundary.
 *
 *   upload  — probe, then upload the bundle, assign it to the internal track,
 *             and commit the edit. Verifies the bundle Play received is
 *             byte-identical to the one built (SHA-256 round-trip) and that
 *             the accepted versionCode is the candidate, then re-reads Play to
 *             prove acceptance rather than trusting the commit response.
 *
 * Usage:
 *   node scripts/play-release.mjs probe
 *   node scripts/play-release.mjs upload --aab <path> [--notes <text>] \
 *        --source-sha <sha> --run-url <url>
 *
 * Environment (never printed):
 *   PLAY_WORKLOAD_IDENTITY_PROVIDER   projects/<n>/locations/global/workloadIdentityPools/<pool>/providers/<provider>
 *   PLAY_SERVICE_ACCOUNT              <name>@<project>.iam.gserviceaccount.com
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { releaseCandidate, APPLICATION_ID, RELEASE_TRACK } from './release-candidate.mjs';
import { playAccessToken, scrub } from './lib/google-auth.mjs';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD_API = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

/**
 * Tracks that must never be written by automation. Listed explicitly rather
 * than "anything that is not internal", so that adding a track to Play cannot
 * quietly widen what this script is allowed to touch.
 */
const FORBIDDEN_TRACKS = ['production', 'beta', 'alpha', 'qa', 'open', 'closed'];

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

async function api(token, path, { method = 'GET', body, headers = {}, raw } = {}) {
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(raw ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Play API ${method} ${path} failed (HTTP ${response.status}): ${scrub(text)}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : {};
}

/** An edit opened purely to read state. Always deleted, even on failure. */
async function withReadOnlyEdit(token, fn) {
  const edit = await api(token, `/applications/${APPLICATION_ID}/edits`, { method: 'POST', body: {} });
  try {
    return await fn(edit.id);
  } finally {
    // Best effort: a leaked read-only edit expires by itself, and failing the
    // release because cleanup failed would be the wrong trade.
    try {
      await api(token, `/applications/${APPLICATION_ID}/edits/${edit.id}`, { method: 'DELETE' });
    } catch (error) {
      console.warn(`::warning::could not delete the read-only edit: ${scrub(error.message)}`);
    }
  }
}

/**
 * The versionCodes Play CURRENTLY SHOWS for this app, from two independent
 * readings: the bundle list and every track's releases. Two, because a bundle
 * can exist without being on a track and a track can reference a code whose
 * bundle the list no longer returns.
 *
 * READ THE NAME LITERALLY. This is live state, not history.
 *
 * `edits.bundles.list` is documented as "Lists all current Android App Bundles
 * of the app and edit", and `edits.tracks.list` returns the tracks of an edit
 * with their current releases. Neither is documented as an immutable registry
 * of every versionCode Play has ever accepted, and Google guarantees no such
 * thing — so this function must never be treated as one. A code that is absent
 * here is NOT thereby proven to be free.
 *
 * That is exactly why there are two fences and not one:
 *
 *   android/release-ledger.json  the append-only HISTORICAL authority. Nothing
 *                                ever leaves it, so a code it names is burned
 *                                whether or not Play still shows it.
 *   this function                the independent LIVE fence. It catches the
 *                                case the ledger structurally cannot: a code
 *                                Play accepted whose ledger PR has not merged
 *                                yet, and any code that arrived by some route
 *                                the repository never recorded.
 *
 * A release must clear BOTH. Neither is sufficient alone, and neither is
 * allowed to overrule the other.
 */
async function visibleAtPlay(token) {
  return withReadOnlyEdit(token, async (editId) => {
    const base = `/applications/${APPLICATION_ID}/edits/${editId}`;
    const bundles = await api(token, `${base}/bundles`);
    const tracks = await api(token, `${base}/tracks`);

    const fromBundles = (bundles.bundles ?? []).map((b) => Number(b.versionCode));
    const fromTracks = (tracks.tracks ?? []).flatMap((track) =>
      (track.releases ?? []).flatMap((release) => (release.versionCodes ?? []).map(Number)),
    );
    return {
      codes: [...new Set([...fromBundles, ...fromTracks])].filter(Number.isInteger).sort((a, b) => a - b),
      tracks: (tracks.tracks ?? []).map((t) => t.track),
    };
  });
}

function resolveCredentials() {
  const workloadIdentityProvider = process.env.PLAY_WORKLOAD_IDENTITY_PROVIDER;
  const serviceAccount = process.env.PLAY_SERVICE_ACCOUNT;
  if (!workloadIdentityProvider || !serviceAccount) {
    fail(
      'Google Play access is not configured. Set the PLAY_WORKLOAD_IDENTITY_PROVIDER and ' +
        'PLAY_SERVICE_ACCOUNT repository variables — see "Play Developer API access" in ' +
        'docs/operations/release-automation.md. There is deliberately no service-account key ' +
        'fallback: this path holds no long-lived Google credential at all.',
    );
  }
  return { workloadIdentityProvider, serviceAccount };
}

/** The candidate, refused loudly if the committed metadata says it is illegal. */
function candidateOrDie() {
  let candidate;
  try {
    candidate = releaseCandidate();
  } catch (error) {
    fail(error.message);
  }
  if (!candidate.ok) {
    for (const failure of candidate.failures) console.error(`::error::${failure}`);
    process.exit(1);
  }
  if (candidate.track !== RELEASE_TRACK || RELEASE_TRACK !== 'internal') {
    fail(`refusing to release to track "${candidate.track}" — this workflow releases to internal only`);
  }
  return candidate;
}

async function probe() {
  // Fence 1 — the committed, append-only HISTORY. This is the authority on what
  // has ever been consumed, and it is checked first because it is the one that
  // cannot silently forget.
  const candidate = candidateOrDie();

  // Fence 2 — Play's CURRENT state, independent of anything this repository
  // believes.
  const token = await playAccessToken(resolveCredentials());
  const { codes, tracks } = await visibleAtPlay(token);

  console.log(`Play currently shows ${codes.length} versionCode(s): ${codes.join(', ') || '(none)'}`);
  console.log(`Tracks visible to this service account: ${tracks.join(', ') || '(none)'}`);

  if (codes.includes(candidate.versionCode)) {
    fail(
      `Play ALREADY SHOWS versionCode ${candidate.versionCode}. It is consumed and can never be ` +
        're-uploaded. The committed ledger (android/release-ledger.json) is stale — close it for ' +
        `${candidate.versionCode}, raise androidBuild, and release the next code.`,
    );
  }

  // A visible code above ours means Play knows about a release the committed
  // ledger does not. Uploading would probably succeed, and the ledger would
  // then be wrong in a way nobody notices, so stop and reconcile.
  const ahead = codes.filter((code) => code > candidate.versionCode);
  if (ahead.length > 0) {
    fail(
      `Play shows versionCode(s) ${ahead.join(', ')} above the candidate ${candidate.versionCode}. ` +
        'The committed ledger is behind reality — reconcile android/release-ledger.json before releasing.',
    );
  }

  // Deliberately NOT "the code is free". Play showing nothing is not proof that
  // nothing was ever accepted — see visibleAtPlay. What has been established is
  // the conjunction of both fences, which is what the release is allowed to
  // proceed on.
  console.log(
    `✓ ${candidate.versionCode} is absent from Play's current state and unconsumed in the committed ledger.`,
  );
  return { candidate, token, playCodes: codes };
}

async function upload() {
  const aabPath = arg('aab');
  const notes = arg('notes', '')?.trim() ?? '';
  const sourceSha = arg('source-sha', '');
  const runUrl = arg('run-url', '');
  const provenancePath = arg('provenance', 'release-provenance.json');

  if (!aabPath || !existsSync(aabPath)) fail(`--aab must point at an existing bundle (got "${aabPath}")`);

  const { candidate, token } = await probe();

  const bytes = readFileSync(aabPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  console.log(`Uploading ${aabPath} (${statSync(aabPath).size} bytes, sha256 ${sha256})`);

  // From here a failure may or may not have consumed the code. Every exit path
  // below says which of the two it is; none of them guesses.
  const edit = await api(token, `/applications/${APPLICATION_ID}/edits`, { method: 'POST', body: {} });
  const base = `/applications/${APPLICATION_ID}/edits/${edit.id}`;
  console.log(`Opened edit ${edit.id}`);

  let uploaded;
  try {
    uploaded = await api(
      token,
      `${UPLOAD_API}/applications/${APPLICATION_ID}/edits/${edit.id}/bundles?uploadType=media`,
      { method: 'POST', raw: bytes, headers: { 'content-type': 'application/octet-stream' } },
    );
  } catch (error) {
    // The edit was never committed, so nothing was published. Play does not
    // burn a code for an abandoned edit — but this script will not assert that
    // on the caller's behalf either; the next run's probe is what decides.
    fail(
      `the bundle upload failed and the edit was abandoned: ${error.message}\n` +
        `The edit was NOT committed, so versionCode ${candidate.versionCode} was almost certainly not ` +
        'consumed — but do not assume it. Re-run the workflow: its probe asks Play directly and will ' +
        'refuse if the code turns out to be taken.',
    );
  }

  const acceptedCode = Number(uploaded.versionCode);
  if (acceptedCode !== candidate.versionCode) {
    fail(
      `Play recorded versionCode ${acceptedCode} for the uploaded bundle, but the committed metadata ` +
        `derives ${candidate.versionCode}. Refusing to commit this edit.`,
    );
  }
  // Round-trip the digest: proves the bytes Play holds are the bytes that were
  // built and verified, not a truncated or re-encoded upload.
  if (uploaded.sha256 && uploaded.sha256.toLowerCase() !== sha256) {
    fail(
      `Play received a bundle whose SHA-256 (${uploaded.sha256}) differs from the artifact that was ` +
        `verified (${sha256}). Refusing to commit this edit.`,
    );
  }
  console.log(`Play accepted the bundle into the edit: versionCode ${acceptedCode}, sha256 verified.`);

  // The track assignment. RELEASE_TRACK is a module constant; this asserts it
  // one more time at the moment of use, because this single request is the
  // difference between an internal test and a public rollout.
  if (FORBIDDEN_TRACKS.includes(RELEASE_TRACK)) {
    fail(`RELEASE_TRACK is "${RELEASE_TRACK}" — this script releases to internal only`);
  }
  const release = {
    versionCodes: [String(candidate.versionCode)],
    status: 'completed',
    ...(notes ? { releaseNotes: [{ language: 'en-US', text: notes.slice(0, 500) }] } : {}),
  };
  await api(token, `${base}/tracks/${RELEASE_TRACK}`, {
    method: 'PUT',
    body: { track: RELEASE_TRACK, releases: [release] },
  });
  console.log(`Assigned ${candidate.versionCode} to the "${RELEASE_TRACK}" track only.`);

  let committed = false;
  let commitError;
  try {
    await api(token, `${base}:commit`, { method: 'POST', body: {} });
    committed = true;
  } catch (error) {
    commitError = error;
  }

  // Whether or not the commit response arrived, ask Play what is true. A lost
  // response is the case this exists for: the release may well have succeeded.
  //
  // This read is where the live fence earns its keep. A code Play has just
  // accepted is unambiguously part of its current state, so it WILL appear
  // here — and it will keep appearing on any retry, which is what stops a
  // second release while the ledger PR is still open. The weaker guarantee
  // discussed in visibleAtPlay concerns old codes ageing out of the listing,
  // not one accepted seconds ago.
  const after = await visibleAtPlay(token);
  const present = after.codes.includes(candidate.versionCode);

  if (!committed && !present) {
    fail(
      `the edit failed to commit and Play does not hold ${candidate.versionCode}: ${commitError.message}\n` +
        'Nothing was released, and Play does not show the candidate. That is not by itself proof it ' +
          'is reusable — the next run re-checks both the committed ledger and Play before trusting it.',
    );
  }
  if (!committed && present) {
    console.warn(
      `::warning::the commit call failed (${scrub(commitError.message)}) but Play now holds ` +
        `${candidate.versionCode}. Treating it as CONSUMED — that is the fail-closed reading.`,
    );
  }
  if (!present) {
    fail(
      `the edit reported a successful commit, but Play does not list ${candidate.versionCode}. ` +
        'State is ambiguous: check Play Console before any retry, and do NOT assume the code is reusable.',
    );
  }

  const provenance = {
    applicationId: APPLICATION_ID,
    track: RELEASE_TRACK,
    versionName: candidate.versionName,
    versionCode: candidate.versionCode,
    androidBuild: candidate.androidBuild,
    aabFile: aabPath.split('/').pop(),
    aabSha256: sha256,
    sourceSha,
    workflowRunUrl: runUrl,
    playResult: committed ? 'accepted' : 'accepted (commit response lost, confirmed by re-read)',
    releaseNotes: notes || null,
  };
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`✓ ${candidate.versionCode} released to Internal Testing. Provenance written to ${provenancePath}.`);
}

const command = process.argv[2];
try {
  if (command === 'probe') await probe();
  else if (command === 'upload') await upload();
  else fail(`unknown command "${command ?? ''}" — expected "probe" or "upload"`);
} catch (error) {
  fail(scrub(error.stack ?? error.message));
}
