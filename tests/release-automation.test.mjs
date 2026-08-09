/**
 * Release automation — the fences, and proof that they actually refuse.
 *
 * Everything here guards something irreversible. A versionCode Play accepts is
 * burned forever; a release to Production cannot be recalled; a workflow with
 * more permission than it needs is a standing offer. So these are not style
 * checks, and several of them are MUTATION tests: they feed the fence a broken
 * input and assert it says no. A fence that has never been seen to refuse is
 * not known to be a fence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  releaseCandidate,
  readLedger,
  computeVersionCode,
  RELEASE_TRACK,
  APPLICATION_ID,
} from '../scripts/release-candidate.mjs';
import { LEDGER_PATHS, appendToLedger, updateAndroidDoc } from '../scripts/close-release-ledger.mjs';
import { scrub } from '../scripts/lib/google-auth.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const workflow = read('.github/workflows/android-internal-release.yml');
const playRelease = read('scripts/play-release.mjs');
const candidateScript = read('scripts/release-candidate.mjs');
const ledgerSource = read('android/release-ledger.json');
const versionProps = read('android/version.properties');

/** Strip comments so prose describing a refusal cannot satisfy a check. */
const codeOf = (source) => source.replace(/^\s*#.*$/gm, '');

/**
 * The workflow's jobs, split on the two-space job keys under `jobs:`. Enough
 * structure to assert per-job permissions without adding a YAML dependency to
 * a project that has deliberately stayed dependency-light.
 */
function jobs(yaml) {
  const body = yaml.slice(yaml.indexOf('\njobs:\n') + '\njobs:\n'.length);
  const names = [...body.matchAll(/^ {2}([a-z][a-z0-9_-]*):$/gm)];
  const found = {};
  names.forEach((match, index) => {
    const start = match.index;
    const end = index + 1 < names.length ? names[index + 1].index : body.length;
    found[match[1]] = body.slice(start, end);
  });
  return found;
}

const JOBS = jobs(workflow);

/** The permissions block of one job, as a {scope: level} map. */
function permissionsOf(job) {
  const block = job.match(/^ {4}permissions:\n((?: {6}\S.*\n)+)/m);
  if (!block) return null;
  return Object.fromEntries(
    [...block[1].matchAll(/^ {6}([a-z-]+):\s*(\S+)/gm)].map(([, scope, level]) => [scope, level]),
  );
}

// --- The dispatch boundary ---------------------------------------------------

test('the release workflow accepts main and nothing else', () => {
  // workflow_dispatch lets the caller pick any ref, so "it lives on main" is
  // not the same as "it releases main".
  assert.match(JOBS.preflight, /REF_NAME: \$\{\{ github\.ref_name \}\}/);
  assert.match(JOBS.preflight, /REF_TYPE: \$\{\{ github\.ref_type \}\}/);
  assert.match(
    JOBS.preflight,
    /\[ "\$REF_TYPE" != "branch" \] \|\| \[ "\$REF_NAME" != "main" \]/,
    'the guard tests both the ref type and the branch name',
  );
  assert.match(JOBS.preflight, /releases committed main only/);

  // Manual dispatch only — no push, no schedule, no pull_request.
  const triggers = workflow.slice(workflow.indexOf('\non:\n'), workflow.indexOf('\npermissions:'));
  assert.match(triggers, /^\s{2}workflow_dispatch:/m);
  for (const forbidden of ['push:', 'schedule:', 'pull_request:', 'pull_request_target:', 'repository_dispatch:']) {
    assert.ok(!codeOf(triggers).includes(forbidden), `a release must not fire on ${forbidden}`);
  }
});

test('the released SHA is pinned, and a stale dispatch is refused', () => {
  assert.match(JOBS.preflight, /source_sha=\$PINNED/, 'the dispatched SHA is pinned as an output');
  assert.match(JOBS.preflight, /main advanced between dispatch and start/);
  // Every later job checks out the PINNED sha, never a re-resolved `main`.
  for (const name of ['build', 'publish', 'ledger']) {
    assert.match(
      JOBS[name],
      /ref: \$\{\{ needs\.preflight\.outputs\.source_sha \}\}/,
      `the ${name} job checks out the pinned SHA`,
    );
  }
  assert.ok(
    !/ref: main/.test(codeOf(workflow)),
    'no job may check out the moving `main` ref',
  );
});

// --- The track ---------------------------------------------------------------

test('Internal Testing cannot drift to Production', () => {
  // The track is a CONSTANT, not an input. A free-text track input would put
  // "production" one typo away from a rollout that cannot be recalled.
  assert.equal(RELEASE_TRACK, 'internal');
  assert.match(candidateScript, /export const RELEASE_TRACK = 'internal'/);

  const inputs = workflow.slice(workflow.indexOf('inputs:'), workflow.indexOf('\npermissions:'));
  assert.ok(!/track/i.test(inputs), 'no workflow input may name a track');

  // And the uploader refuses every other track by name, so adding a track in
  // Play Console cannot quietly widen what automation may touch.
  for (const forbidden of ['production', 'beta', 'alpha', 'qa', 'open', 'closed']) {
    assert.ok(
      new RegExp(`'${forbidden}'`).test(playRelease),
      `scripts/play-release.mjs names "${forbidden}" as forbidden`,
    );
  }
  assert.match(playRelease, /const FORBIDDEN_TRACKS = \[/);
  assert.match(playRelease, /tracks\/\$\{RELEASE_TRACK\}/, 'the track URL is built from the constant');
  assert.ok(
    !/tracks\/\$\{[^}]*(input|arg|process\.env)/.test(playRelease),
    'the track must never come from an input, an argument or the environment',
  );
});

test('the uploader refuses a non-internal track even if the constant were changed', () => {
  // Mutation: pretend RELEASE_TRACK became "production". Both guards must fire.
  const mutated = playRelease.replace(/const FORBIDDEN_TRACKS = \[[^\]]*\]/, "const FORBIDDEN_TRACKS = ['production']");
  assert.ok(mutated.includes("'production'"), 'the mutation applied');
  // The candidate module's own assertion is the second guard, and it is a
  // literal comparison against 'internal' rather than a comparison to itself.
  assert.match(playRelease, /RELEASE_TRACK !== 'internal'/, 'the constant is checked against a literal');
});

// --- The versionCode ---------------------------------------------------------

test('the versionCode comes from committed metadata and is never incremented', () => {
  const candidate = releaseCandidate();
  assert.equal(candidate.versionCode, 2700006, 'the candidate on this commit');
  assert.equal(candidate.androidBuild, 6);
  assert.equal(candidate.applicationId, APPLICATION_ID);

  // No writer anywhere in the derivation path. A script that could bump
  // androidBuild is a script that could consume a code without a commit.
  assert.ok(
    !/writeFileSync|appendFileSync\(\s*['"]/.test(
      candidateScript.replace(/appendFileSync\(\s*\n?\s*process\.env\.GITHUB_OUTPUT/g, ''),
    ),
    'scripts/release-candidate.mjs must not write to the source tree',
  );
  assert.ok(!/androidBuild\s*\+\+|androidBuild \+ 1/.test(candidateScript), 'it never increments the counter');
  assert.match(candidateScript, /It DERIVES\. It never increments/);

  // Gradle and the script are two independent derivations, and the workflow
  // makes them prove they agree before signing anything.
  assert.match(JOBS.build, /Gradle must agree with the derived candidate/);
  assert.match(JOBS.build, /Gradle versionCode '\$GRADLE_CODE' != derived/);
});

test('a consumed versionCode cannot be re-released', () => {
  const ledger = readLedger(ledgerSource);
  assert.deepEqual(ledger.codes, [2700001, 2700002, 2700003, 2700004, 2700005]);
  assert.equal(ledger.highestConsumedVersionCode, 2700005);

  // Mutation: rewind the counter so the candidate lands on a consumed code.
  const rewound = versionProps.replace(/^androidBuild=\d+$/m, 'androidBuild=3');
  const refused = releaseCandidate({ versionPropsSource: rewound });
  assert.equal(refused.versionCode, 2700003);
  assert.equal(refused.ok, false);
  assert.ok(
    refused.failures.some((f) => f.includes('does not outrank')),
    'the fence refuses a code at or below the consumed high-water mark',
  );
  assert.ok(
    refused.failures.some((f) => f.includes('already in the append-only ledger')),
    'and refuses it again for being in the list, independently of the fence',
  );

  // Mutation: exactly the consumed high-water mark is refused too — the
  // comparison must be strict.
  const equal = releaseCandidate({ versionPropsSource: versionProps.replace(/^androidBuild=\d+$/m, 'androidBuild=5') });
  assert.equal(equal.ok, false, '2700005 is consumed; equalling the fence is not outranking it');
});

test('a ledger that disagrees with itself is refused rather than trusted', () => {
  const parsed = JSON.parse(ledgerSource);

  // A fence lowered by hand while the list still holds higher codes.
  const lowered = JSON.stringify({ ...parsed, highestConsumedVersionCode: 2700001 });
  assert.throws(() => readLedger(lowered), /largest consumed entry/);

  // An entry whose versionCode does not follow from its own versionName and
  // build number — a transcription error is how a consumed code looks free.
  const mistyped = structuredClone(parsed);
  mistyped.consumed[2].versionCode = 2700099;
  mistyped.highestConsumedVersionCode = 2700099;
  assert.throws(() => readLedger(JSON.stringify(mistyped)), /derives 2700003/);

  // Out-of-order entries: append-only means ascending.
  const shuffled = structuredClone(parsed);
  [shuffled.consumed[1], shuffled.consumed[2]] = [shuffled.consumed[2], shuffled.consumed[1]];
  assert.throws(() => readLedger(JSON.stringify(shuffled)), /strictly ascend/);
});

test('Play itself is asked what it holds, because the committed ledger can be stale', () => {
  // The ledger is written AFTER a release. A lost upload response leaves it
  // saying a burned code is free, which is the one failure that must never
  // result in a retry.
  assert.match(JOBS.preflight, /node scripts\/play-release\.mjs probe/);
  assert.match(playRelease, /Play ALREADY HOLDS versionCode/);
  assert.match(playRelease, /above the candidate/, 'a ledger that is behind reality also stops the release');
  // Two independent readings of Play's state, not one.
  assert.match(playRelease, /\$\{base\}\/bundles/);
  assert.match(playRelease, /\$\{base\}\/tracks/);
  // And the probe runs again inside upload, immediately before anything is
  // consumed — `upload` calls `probe`, it does not re-implement it.
  assert.match(playRelease, /const \{ candidate, token \} = await probe\(\)/);
});

test('an ambiguous Play response never resolves to "the code is reusable"', () => {
  assert.match(playRelease, /Treating it as CONSUMED — that is the fail-closed reading/);
  assert.match(playRelease, /State is ambiguous: check Play Console before any retry/);
  assert.match(playRelease, /do NOT assume the code is reusable/);
  // Acceptance is proven by re-reading Play, not by trusting the commit call.
  assert.match(playRelease, /const after = await consumedAtPlay\(token\)/);
});

// --- The gates ---------------------------------------------------------------

test('every release gate still runs in the real release workflow', () => {
  for (const gate of [
    'npm ci',
    'npm test',
    'npm run typecheck',
    'npm run build',
    'npm run build:native',
    'npm run verify:native',
    'node scripts/verify-privacy-build.mjs',
    'node scripts/verify-packaged-branding.mjs',
    'npx cap sync android',
    './gradlew --no-daemon testDebugUnitTest',
    'bundleRelease',
  ]) {
    assert.ok(JOBS.build.includes(gate), `the build job runs ${gate}`);
  }
  // Map catalog / archive-revision parity, added with this milestone.
  assert.match(JOBS.build, /tests\/map-parity\.test\.mjs/);
  assert.match(JOBS.build, /tests\/coverage-contract\.test\.mjs/);
  // The web gates precede the native artifact, and everything precedes signing.
  assert.ok(JOBS.build.indexOf('npm test') < JOBS.build.indexOf('bundleRelease'));
  assert.ok(JOBS.build.indexOf('npm run build\n') < JOBS.build.indexOf('npm run build:native'));
  assert.ok(JOBS.build.indexOf('verify-privacy-build') < JOBS.build.indexOf('bundleRelease'));
});

test('signer and package identity are proven against the packaged artifact', () => {
  assert.match(JOBS.build, /jarsigner -verify/);
  assert.match(JOBS.build, /signer does not match the configured upload key/);
  assert.match(JOBS.build, /CN=Android Debug/);
  assert.match(JOBS.build, /bundletool\.jar"? dump manifest/, 'the proto manifest is decoded, not scraped');
  assert.match(JOBS.build, /--xpath=\/manifest\/@package/);
  assert.match(JOBS.build, /the packaged application is DEBUGGABLE/, 'a debuggable release is refused');
  assert.match(JOBS.build, /a keystore is present INSIDE the bundle/);
});

test('optional map archives cannot enter the AAB, and the basemap cannot leave it', () => {
  for (const job of [JOBS.build, JOBS.publish]) {
    assert.match(job, /base\/assets\/public\/maps\/kungsleden\.pmtiles/, 'the bundled basemap is required');
    for (const optional of [
      'kungsleden-terrain.pmtiles',
      'kungsleden-contours.pmtiles',
      'kungsleden-satellite.pmtiles',
    ]) {
      assert.ok(job.includes(optional), `${optional} is checked for absence`);
    }
  }
  assert.match(JOBS.build, /must not be packaged in the AAB/);
  assert.match(JOBS.publish, /optional archive \$f is packaged in the artifact/);
});

test('the artifact is inspected again by a job that never held the keystore', () => {
  // The independent inspection is the point: the publish job re-derives the
  // expected identity from committed metadata rather than trusting the build.
  assert.ok(!/ANDROID_UPLOAD_KEYSTORE|ANDROID_UPLOAD_KEY_/.test(JOBS.publish),
    'the publish job must hold no signing secret');
  assert.match(JOBS.publish, /re-derived versionCode \$derived_code/);
  assert.match(JOBS.publish, /downloaded artifact sha256 \$sha != the built/);
  assert.match(JOBS.publish, /artifact signer \$signer != the signer the build job verified/);
});

// --- Permissions and concurrency --------------------------------------------

test('workflow permissions stay inside the declared least-privilege boundary', () => {
  assert.match(workflow, /^permissions:\n  contents: read\n/m, 'the workflow default is read-only');

  const expected = {
    preflight: { contents: 'read', 'id-token': 'write' },
    build: { contents: 'read' },
    publish: { contents: 'read', 'id-token': 'write' },
    ledger: { contents: 'write', 'pull-requests': 'write' },
  };
  assert.deepEqual(Object.keys(JOBS).sort(), Object.keys(expected).sort(), 'no undeclared job exists');
  for (const [name, want] of Object.entries(expected)) {
    assert.deepEqual(permissionsOf(JOBS[name]), want, `${name} holds exactly its declared permissions`);
  }

  // The build job must not be able to reach Google, and no job may deploy.
  // Read structurally — the build job's comments deliberately NAME id-token to
  // say it is absent, and a grep over prose would fail on the explanation.
  assert.ok(!('id-token' in permissionsOf(JOBS.build)), 'the build job has no OIDC token');
  assert.ok(!/^\s+pages: /m.test(workflow), 'no job may touch GitHub Pages');
  // Exactly one job may write to the REPOSITORY. id-token: write is not a
  // repository write — it mints an identity assertion — so it is excluded
  // deliberately rather than by an accident of pattern matching.
  const repoWriters = Object.entries(JOBS)
    .filter(([, job]) =>
      Object.entries(permissionsOf(job) ?? {}).some(([scope, level]) => level === 'write' && scope !== 'id-token'),
    )
    .map(([name]) => name);
  assert.deepEqual(repoWriters, ['ledger'], 'only the ledger job may write to the repository');
  assert.equal(permissionsOf(JOBS.ledger).contents, 'write');
  assert.ok(!('id-token' in permissionsOf(JOBS.ledger)), 'the ledger job needs no Google credential');
});

test('signing secrets are reachable only from the trusted main release path', () => {
  // The four signing secrets appear in exactly one job, which only ever runs
  // after the preflight has proven the dispatch is main.
  for (const secret of [
    'ANDROID_UPLOAD_KEYSTORE_BASE64',
    'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
    'ANDROID_UPLOAD_KEY_ALIAS',
    'ANDROID_UPLOAD_KEY_PASSWORD',
  ]) {
    const holders = Object.entries(JOBS).filter(([, job]) => job.includes(`secrets.${secret}`));
    assert.deepEqual(holders.map(([name]) => name), ['build'], `${secret} is reachable only from the build job`);
  }
  assert.match(JOBS.build, /needs: preflight/, 'the build job cannot start before the main guard has passed');
  // No secret is ever echoed.
  assert.ok(!/(echo|printf|cat)[^\n]*\$\{?\{?\s*secrets\./.test(workflow), 'a secret must never be echoed');
});

test('caller-supplied release notes never reach a shell as an expansion', () => {
  // ${{ inputs.* }} inside a run: block is textual substitution into the
  // script. Free text must arrive as an environment variable instead.
  const runBlocks = [...workflow.matchAll(/^\s+run: \|\n((?:\s{10}.*\n|\n)*)/gm)].map((m) => m[1]);
  for (const block of runBlocks) {
    assert.ok(
      !/\$\{\{\s*inputs\./.test(block),
      `a run: block interpolates a workflow input directly:\n${block.slice(0, 200)}`,
    );
  }
  assert.match(JOBS.publish, /RELEASE_NOTES: \$\{\{ inputs\.release_notes \}\}/);
  assert.match(JOBS.publish, /--notes "\$RELEASE_NOTES"/);
});

test('two releases cannot race', () => {
  const concurrency = workflow.match(/^concurrency:\n((?: {2}.*\n)+)/m)?.[1];
  assert.ok(concurrency, 'the workflow declares concurrency');
  assert.match(concurrency, /group: fjallkompis-release/);
  assert.match(concurrency, /cancel-in-progress: false/, 'cancelling mid-upload is worse than queueing');
  assert.ok(
    !/github\.(ref|run_id|sha)/.test(concurrency),
    'the group must be constant — a ref-scoped group is not a lock',
  );
});

// --- The ledger pull request -------------------------------------------------

test('the ledger job can only modify release metadata', () => {
  assert.deepEqual(LEDGER_PATHS, [
    'android/release-ledger.json',
    'android/version.properties',
    'docs/ANDROID.md',
  ]);
  // Enforced at runtime, not merely asserted here: whatever the script did,
  // only these files may leave the job.
  assert.match(JOBS.ledger, /Refuse anything outside the release-metadata allowlist/);
  assert.match(JOBS.ledger, /allowed="android\/release-ledger\.json android\/version\.properties docs\/ANDROID\.md"/);
  assert.match(JOBS.ledger, /which is not release metadata/);
  assert.match(JOBS.ledger, /the ledger script changed nothing/, 'a no-op ledger close is also a failure');

  // `git status --porcelain`, not `git diff --name-only`: the latter cannot see
  // a NEW file, so a script that created one would slip past the allowlist.
  assert.match(JOBS.ledger, /git status --porcelain/);
  assert.ok(!/git diff --name-only/.test(codeOf(JOBS.ledger)), 'the check must see untracked files too');
  assert.match(JOBS.ledger, /may only MODIFY files/, 'additions and deletions are refused, not just wrong paths');
  // Every scratch file lives outside the working tree, so the tree can be
  // required to hold nothing but the three allowed edits.
  assert.ok(
    !/^\s+\} > [a-z-]+\.(md|txt|json)$/m.test(JOBS.ledger),
    'scratch files must be written to RUNNER_TEMP, not the working tree',
  );
  assert.match(JOBS.ledger, /path: \$\{\{ runner\.temp \}\}\/provenance/);

  // It opens a pull request; it never pushes to main.
  assert.match(JOBS.ledger, /git push origin "\$branch"/);
  assert.match(JOBS.ledger, /branch="release\/ledger-\$\{VERSION_CODE\}"/);
  assert.match(JOBS.ledger, /gh pr create/);
  assert.ok(!/push origin main|push origin HEAD:main|--force/.test(JOBS.ledger), 'the ledger job never pushes to main');
});

test('the ledger is only closed for a release Play actually accepted', () => {
  const closer = read('scripts/close-release-ledger.mjs');
  assert.match(closer, /playResult is "\$\{provenance\.playResult\}", not an acceptance/);
  assert.match(closer, /refusing to close the ledger for track/);
  assert.match(JOBS.ledger, /needs\.publish\.result == 'success'/);

  // Appending a code that is already recorded, or that does not advance the
  // fence, is refused.
  assert.throws(
    () => appendToLedger(ledgerSource, { versionCode: 2700005, versionName: '0.27.0', androidBuild: 5 }),
    /already recorded/,
  );
  assert.throws(
    () => appendToLedger(ledgerSource, { versionCode: 2700000, versionName: '0.27.0', androidBuild: 0 }),
    /does not exceed the recorded fence/,
  );

  // The happy path leaves a ledger that still validates, with the fence raised.
  const closed = appendToLedger(ledgerSource, {
    versionCode: 2700006,
    versionName: '0.27.0',
    androidBuild: 6,
    track: 'internal',
    acceptedOn: '2026-08-09',
    sourceSha: 'deadbee',
    workflowRunUrl: 'https://example.invalid/run',
    note: 'test',
  });
  const reread = readLedger(closed);
  assert.equal(reread.highestConsumedVersionCode, 2700006);
  assert.ok(reread.codes.includes(2700006));
  // And the next candidate is then refused until androidBuild advances.
  assert.equal(releaseCandidate({ ledgerSource: closed }).ok, false);
});

test('the generated ANDROID.md rows have somewhere to be generated into', () => {
  const doc = read('docs/ANDROID.md');
  assert.ok(doc.includes('<!-- release-ledger:begin -->'), 'the begin marker exists');
  assert.ok(doc.includes('<!-- release-ledger:end -->'), 'the end marker exists');
  assert.ok(doc.indexOf('<!-- release-ledger:begin -->') < doc.indexOf('<!-- release-ledger:end -->'));
  assert.throws(() => updateAndroidDoc('no markers here', 'rows'), /missing the/);
});

// --- Credentials -------------------------------------------------------------

test('Play access uses federated identity, never a stored key', () => {
  const auth = read('scripts/lib/google-auth.mjs');
  assert.match(auth, /workloadIdentityPools/);
  assert.match(auth, /urn:ietf:params:oauth:grant-type:token-exchange/);
  assert.match(auth, /generateAccessToken/);
  // The impersonated token is scoped to androidpublisher only.
  assert.match(auth, /scope: \[ANDROIDPUBLISHER_SCOPE\]/);
  assert.match(auth, /ANDROIDPUBLISHER_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/androidpublisher'/);

  // No long-lived credential anywhere: a service-account KEY must not be
  // readable by this path, or the whole design collapses to the thing it
  // deliberately rejected.
  assert.ok(
    !/private_key|GOOGLE_APPLICATION_CREDENTIALS|SERVICE_ACCOUNT_JSON|credentials_json/i.test(auth + playRelease),
    'no service-account key material may be referenced',
  );
  assert.ok(
    !/secrets\.PLAY_/.test(workflow),
    'Play access uses repository VARIABLES (non-secret identifiers), never a secret',
  );
  assert.match(workflow, /vars\.PLAY_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(workflow, /vars\.PLAY_SERVICE_ACCOUNT/);
  // id-token: write is what makes OIDC possible, and only two jobs hold it.
  assert.equal(permissionsOf(JOBS.preflight)['id-token'], 'write');
  assert.equal(permissionsOf(JOBS.publish)['id-token'], 'write');
  assert.ok(!('id-token' in permissionsOf(JOBS.build)));
  assert.ok(!('id-token' in permissionsOf(JOBS.ledger)));
});

test('nothing token-shaped can reach a log', () => {
  assert.equal(scrub('header.eyJhbGciOiJSUzI1NiJ9xxxxxxxxxx.signature-part'), 'header.eyJhbGciOiJSUzI1NiJ9xxxxxxxxxx.signature-part');
  assert.match(scrub('sent eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef'), /«jwt redacted»/);
  assert.match(scrub('token ya29.a0AfH6SMBx-example-value'), /«access token redacted»/);
  assert.ok(scrub('x'.repeat(5000)).length <= 800, 'error bodies are truncated');
  // Every Play API error goes through it.
  assert.match(playRelease, /scrub\(text\)/);
});

// --- The dry-run boundary ----------------------------------------------------

test('a dry run builds and verifies everything, and uploads nothing', () => {
  assert.match(workflow, /dry_run:\n\s+description: 'Build and verify everything, then STOP before the Play upload'/);
  assert.match(workflow, /default: false/);
  assert.match(JOBS.publish, /if: \$\{\{ !inputs\.dry_run \}\}/);
  assert.match(JOBS.ledger, /if: \$\{\{ !inputs\.dry_run && needs\.publish\.result == 'success' \}\}/);
  // The build job is NOT conditional: a dry run must exercise the real gates.
  assert.ok(!/^ {4}if:/m.test(JOBS.build.split('steps:')[0]), 'the build runs in a dry run too');
});

test('a real release cannot proceed without Play credentials configured', () => {
  // The probe is skipped only for a dry run on a repository that has not
  // finished the Google setup. A non-dry run always probes, and the probe
  // fails closed when the variables are empty.
  assert.match(
    JOBS.preflight,
    /if: \$\{\{ !inputs\.dry_run \|\| \(vars\.PLAY_WORKLOAD_IDENTITY_PROVIDER != '' && vars\.PLAY_SERVICE_ACCOUNT != ''\) \}\}/,
  );
  assert.match(playRelease, /Google Play access is not configured/);
  assert.match(playRelease, /There is deliberately no service-account key/);
});

// --- Cross-checks with the rest of the release configuration ------------------

test('the release identity constants agree everywhere', () => {
  assert.equal(APPLICATION_ID, 'com.algolon.fjallkompis');
  assert.match(read('android/app/build.gradle'), /applicationId "com\.algolon\.fjallkompis"/);
  assert.equal(computeVersionCode(0, 27, 0, 6), 2700006);
  // The formula in the script matches the one in Gradle, field weight for
  // field weight.
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /versionMajor \* 10000000/);
  assert.match(gradle, /versionMinor \* 100000/);
  assert.match(gradle, /versionPatch \* 1000/);
});
