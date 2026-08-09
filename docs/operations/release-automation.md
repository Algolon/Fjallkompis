# Releasing Fjallkompis

One committed `main` SHA → a verified signed AAB → Google Play Internal Testing
→ a ledger pull request. Production rollout is deliberately not automated and is
not one input away from being automated.

The state this replaced is recorded in
[`release-automation-diagnosis.md`](./release-automation-diagnosis.md).

---

## How to release

**GitHub → Actions → Release Fjallkompis → Run workflow**, from `main`.

| Input | |
| --- | --- |
| `release_notes` | optional, ≤500 characters, shown to testers in Play |
| `dry_run` | build and verify everything, then stop before the upload |

That is the whole interface. There is no version to choose and no track to
choose — both are derived from committed metadata, which is the point.

Pushing to `main` still deploys the PWA to GitHub Pages (`deploy.yml`). This
workflow is the Android half, and it releases the same commit.

---

## What the workflow does

Four jobs, each with the narrowest permission that lets it do its work.

### 1. `preflight` — `contents: read`, `id-token: write`

* Refuses any ref that is not the branch `main`. `workflow_dispatch` lets the
  caller choose a ref, so this is checked, not assumed.
* **Pins the exact `main` SHA** and fails if `main` moved between dispatch and
  start. Every later job checks out *that SHA by name*; nothing re-resolves
  `main`.
* Derives the candidate `versionCode` with `scripts/release-candidate.mjs` —
  the same formula `android/app/build.gradle` uses — and refuses it if it does
  not strictly outrank the consumed fence, or appears in the ledger.
* **Asks Play which versionCodes it already holds** and refuses if the candidate
  is among them. The committed ledger is written *after* a release, so it can be
  stale; Play is the authority.

### 2. `build` — `contents: read`

Every gate that existed before, unchanged, plus two additions. It holds the four
signing secrets and has no Google credential of any kind.

`npm ci` → `npm test` → `npm run typecheck` → `npm run build` →
`npm run build:native` → `npm run verify:native` → privacy verifier → **map
catalog / coverage contract** (new) → `cap sync` → Gradle unit tests →
`bundleRelease` → the artifact verifications: signature, signer fingerprint
equals the upload key, not the debug key, packaged package/versionName/
versionCode via checksum-pinned bundletool, **not debuggable** (new), no
keystore inside, packaged branding pixel-exact, bundled basemap byte-identical,
optional archives absent.

It also proves **Gradle and the release-candidate script derive the same
number**. Two independent implementations of one formula are only useful while
they agree.

### 3. `publish` — `contents: read`, `id-token: write`

Downloads the artifact and inspects it **independently, in a job that never held
the keystore**: same SHA-256 as the build recorded, identity re-derived from
committed metadata rather than taken on trust, manifest re-read, signer pinned
to the fingerprint the build verified, basemap present, optional archives
absent, not debuggable, no keystore inside.

Then, and only then, `scripts/play-release.mjs upload`.

### 4. `ledger` — `contents: write`, `pull-requests: write`

The only job that can write, and it opens a pull request; it cannot reach
`main`. It runs `scripts/close-release-ledger.mjs`, then refuses to push unless
the working tree contains *modifications to exactly three files and nothing
else*.

---

## Play Developer API access — the credential design

**Chosen: GitHub OIDC → Google Workload Identity Federation → service-account
impersonation. No long-lived Google credential exists anywhere.**

### Why, and what it was weighed against

The alternative is the common one: create a service account, download its JSON
private key, paste it into a GitHub secret.

| | Service-account key | OIDC → WIF (chosen) |
| --- | --- | --- |
| Long-lived secret | a private key, valid until manually revoked | none |
| Rotation | manual, and nothing reminds you | not applicable |
| If a secret leaks | full Play API access until someone notices | nothing to leak |
| Scope of a token | whatever the key allows, indefinitely | `androidpublisher` only, 10 minutes |
| Bound to a repository | no — the key works from anywhere | yes, by an attribute condition |
| Extra Google setup | project + service account | project + service account + pool + provider + one IAM binding |

The decisive point is the last row's *smallness*. **A Google Cloud project and a
service account are required either way** — a Play API service account is a GCP
resource. WIF adds a workload identity pool, a provider and one IAM binding:
three one-time UI steps. In exchange the repository stops holding a private key
forever. That is a large safety gain for a small, bounded amount of cloud
configuration, which is the trade this milestone was asked to prefer.

The exchange is implemented in `scripts/lib/google-auth.mjs` — three HTTP calls,
no third-party action between the OIDC token and the Play API, for the same
reason `deploy.yml` hand-rolls the Pages deployment.

### Least privilege

* The impersonated token is scoped to `https://www.googleapis.com/auth/androidpublisher`
  and nothing else, for ten minutes.
* The Play Console account grant is **Release to testing tracks** on the
  Fjallkompis app only. **Not** "Release to production", not account-level
  admin, not access to other apps.
* The provider's attribute condition binds the exchange to **this repository,
  the `main` branch, and this one workflow file** — see below.

### The trust boundary

`assertion.repository == 'Algolon/Fjallkompis'` alone is *necessary but wider
than the release trust boundary*: it would let any workflow in this repository,
on any branch, impersonate the Play service account. The condition is therefore
bound to all three of repository, ref and workflow:

```cel
assertion.repository_id == '1286996996' &&
assertion.repository == 'Algolon/Fjallkompis' &&
assertion.ref == 'refs/heads/main' &&
assertion.workflow_ref == 'Algolon/Fjallkompis/.github/workflows/android-internal-release.yml@refs/heads/main'
```

Why each term:

| Term | What it stops |
| --- | --- |
| `repository_id` | the repository being renamed and the old name reclaimed — Google [recommends](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines) numeric ids precisely because name fields invite typo/cybersquatting |
| `repository` | a different repository entirely (redundant with the id, kept for legibility in the condition) |
| `ref` | a release attempted from a feature branch |
| `workflow_ref` | **any other workflow in this repository** — including a newly added one — minting a Play credential |

`workflow_ref` is a standard GitHub OIDC claim: *"The ref path to the workflow.
For example, `octocat/hello-world/.github/workflows/my-workflow.yml@refs/heads/my_branch`"*
([GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)).
It is the right claim here because this workflow is **not** a reusable workflow;
`job_workflow_ref` is the reusable-workflow variant and would be the wrong
choice. Google attribute conditions can read raw claims as `assertion.<claim>`
with no prior attribute mapping, which is why none of these needs to be mapped.

Because `workflow_ref` embeds the ref, the `ref` term is strictly redundant —
it is kept because a condition that states its intent survives editing better
than one that relies on a substring.

**The workflow's own `main`-only guard stays** as defense in depth. Google's
condition and the workflow guard fail independently; neither is load-bearing
alone.

**Configuring it without guessing:** the first run prints the exact claim values
it presents —

```
Presenting a GitHub OIDC assertion to Google with:
  OIDC repository: Algolon/Fjallkompis
  OIDC ref: refs/heads/main
  OIDC workflow_ref: Algolon/Fjallkompis/.github/workflows/android-internal-release.yml@refs/heads/main
```

Those three claims only, never the token or any other claim. All three are
public facts about a public repository, not credentials. Paste them into the
condition rather than transcribing from this document.

### Remaining human setup

**This is the one thing that cannot be done from a pull request.** Until it is
done, `dry_run: true` is the only usable mode, and a real release fails closed
with a message pointing here.

Nothing below should ever be pasted into a chat, committed, or shown to an
agent. None of it produces a secret to store — that is the design.

**In Google Cloud Console** (a project dedicated to this, e.g. `fjallkompis-release`):

1. Enable the **Google Play Android Developer API**
   (*APIs & Services → Library → search "Google Play Android Developer API" → Enable*).
2. *IAM & Admin → Service Accounts → Create service account*.
   Name it `fjallkompis-play-release`. **Grant it no project roles**, and
   **do not create a key.** Note its email:
   `fjallkompis-play-release@<project>.iam.gserviceaccount.com`.
3. *IAM & Admin → Workload Identity Federation → Create pool*.
   Pool ID `github`. Add a provider:
   * Provider type **OpenID Connect**, provider ID `github`
   * Issuer URL `https://token.actions.githubusercontent.com`
   * Audience: **Allowed audiences** →
     `https://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github`
   * Attribute mapping: `google.subject` = `assertion.sub`,
     `attribute.repository` = `assertion.repository`,
     `attribute.repository_id` = `assertion.repository_id`
   * Attribute condition: the four-term CEL expression under
     [The trust boundary](#the-trust-boundary) — repository id, repository, ref
     **and** `workflow_ref`. Do not stop at the repository term.
4. Grant the pool permission to impersonate the service account:
   *Service Accounts → `fjallkompis-play-release` → Permissions → Grant access*,
   principal
   `principalSet://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/attribute.repository/Algolon/Fjallkompis`,
   role **Workload Identity User** (`roles/iam.workloadIdentityUser`).

**In Google Play Console:**

5. *Users and permissions → Invite new user*, the service-account email.
6. Restrict it to the **Fjallkompis** app only, and grant exactly:
   **Release → Release to testing tracks**. Leave "Release to production,
   exclude devices, and use Play App Signing" **unchecked**, and grant no
   account-level permission.

**In this repository** (*Settings → Secrets and variables → Actions →
Variables*, not Secrets — these are identifiers, not credentials):

| Variable | Value |
| --- | --- |
| `PLAY_WORKLOAD_IDENTITY_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github` |
| `PLAY_SERVICE_ACCOUNT` | `fjallkompis-play-release@<project>.iam.gserviceaccount.com` |

Then run the workflow once with **`dry_run: true`**. It exercises the Play
probe, every gate and the full artifact verification, and uploads nothing.

### The signing trust anchor

`UPLOAD_KEY_SHA256` in `scripts/release-candidate.mjs` is the SHA-256 of the
upload-key certificate Play has registered. Every release checks the packaged
bundle against it, in both the build job and the publish job, and **fails closed
if it is missing or does not match** — including on a dry run.

It exists because the other signer check cannot catch the threat it is for.
"The bundle matches the configured upload key" compares the artifact against a
key derived from the same `ANDROID_UPLOAD_*` secrets in the same run: if those
secrets were replaced with a keystore an attacker controls, that check still
passes. Only a value the secrets cannot reach detects the substitution.

It is **committed, not a repository variable**, and that is the point. Variables
and secrets share one control plane and one admin — whoever can swap the
keystore can swap a variable in the next click, neither change reviewed. A
committed constant moves that substitution into a pull request diff against a
protected branch.

The value was not transcribed from a keystore or invented: it is the fingerprint
the release workflow printed for the four artifacts Play **accepted** as
2700002–2700005, in the runs recorded against those entries in
`android/release-ledger.json`. All four agree. Cross-check any time against
*Play Console → App integrity → App signing → Upload key certificate*.

If the upload key is ever legitimately rotated, change the constant in a
reviewed pull request. If a release fails on it and no rotation happened, treat
the signing secrets as compromised.

---

## versionCode lifecycle

A versionCode is **consumed the moment Play accepts it** — not when CI builds
it, not when the artifact is downloaded. That semantic predates this automation
and is preserved exactly.

```
androidBuild (committed)  ──┐
package.json version     ──┼──► candidate versionCode  ──► fenced against:
                            │                                1. the committed ledger
                            │                                2. Play itself
                            └──► Gradle stamps the same number into the bundle
```

`android/release-ledger.json` is the single authority. It is **append-only**:
entries are added, never edited or removed. `scripts/release-candidate.mjs`
validates it on every read — strictly ascending, no duplicates, fence equal to
the largest entry, and every entry's code re-derived from its own versionName
and build number so a transcription error cannot make a burned code look free.

After Play accepts, the `ledger` job opens a PR that appends the entry, raises
`highestConsumedVersionCode`, advances `androidBuild` by one, and regenerates
the two `docs/ANDROID.md` rows between the `<!-- release-ledger:… -->` markers.
It contains no product or runtime change and still needs CI and a human merge.

### Two fences, and what each one actually guarantees

A release must clear **both**. Neither is sufficient alone, and neither
overrules the other.

| | `android/release-ledger.json` | Play |
| --- | --- | --- |
| Role | the **historical** authority | the **live-state** fence |
| Guarantee | append-only; nothing ever leaves it | whatever Play currently shows |
| Catches | any code ever recorded as consumed | a code Play accepted whose ledger PR has not merged, or that arrived by a route the repository never recorded |
| Blind to | a release that never reached the ledger | anything Play no longer lists |

**Play is deliberately not described as a historical registry.** Google
documents `edits.bundles.list` as *"Lists all current Android App Bundles of the
app and edit"*, and `edits.tracks.list` returns an edit's tracks with their
current releases. Neither is documented as an immutable record of every
versionCode ever accepted, and no such guarantee is offered — so **absence at
Play is not proof that a code is free.** The committed ledger is what carries
that claim.

The converse is solid, and is what the retry safety rests on: a code Play has
*just* accepted is unambiguously part of its current state. It appears in the
post-upload re-read, and it keeps appearing on any retry — which is exactly what
refuses a second release while the ledger PR is still outstanding. The weaker
guarantee above concerns old codes ageing out of a listing, not one accepted
seconds ago.

**So a second release fails closed while the committed ledger still calls the
candidate unconsumed**, because the workflow never relies on the ledger alone.

---

## Failure and retry semantics

Every row fails closed. Nothing here ever concludes "the code is probably still
free".

| Situation | What happens |
| --- | --- |
| **Two releases dispatched at once** | The workflow's concurrency group is the constant `fjallkompis-release` with `cancel-in-progress: false`. The second queues; when it runs, its Play probe sees the code the first consumed and refuses. |
| **Cancelled before upload** | Nothing was consumed. Re-dispatch. |
| **Cancelled during upload** | The edit was never committed. Almost certainly not consumed — but the next run's probe decides, not an assumption. |
| **Play rejects the bundle** | The edit is abandoned, the job fails with Play's reason. Not consumed. |
| **Play accepts but the response is lost** | The upload step re-reads Play after the commit call. If the code is there, it is treated as **consumed** even though the commit call errored. |
| **Commit reported success but Play does not list the code** | Failure, marked *ambiguous*, with an explicit instruction to check Play Console and not assume reusability. |
| **Upload succeeded, ledger PR failed** | Play holds the code; the committed ledger says otherwise. The job summary prints the exact manual close. Meanwhile the Play probe still refuses a re-release, so the stale ledger cannot cause a retry. |
| **`main` advances during the run** | The release is of the *pinned* SHA and the provenance says so. `main` moving after the pin is not a failure; moving *before* the pin is, and preflight catches it. |
| **Retry after Play consumed the code** | Preflight's probe refuses. This is the case every other row funnels into. |

---

## Provenance

Machine-generated per run, never hand-maintained prose. `release-provenance.json`
is attached to the run for 90 days and reproduced in the job summary and the
ledger PR:

`applicationId`, `track`, `versionName`, `versionCode`, `androidBuild`,
`aabFile`, `aabSha256`, `sourceSha`, `workflowRunUrl`, `playResult`.

The build summary additionally records the upload signer's SHA-256 fingerprint
and the bundle size. Certificate fingerprints are public information — Play
displays them — so recording them is safe; no credential appears anywhere in
the output, and every Play error body is scrubbed of token-shaped strings before
it can reach a log.

To answer *"which exact Fjallkompis source produced this Play build?"*: look up
the versionCode in `android/release-ledger.json`; it carries the source SHA and
the workflow run.

---

## `main` branch protection

Repository ruleset **`main protection`**, id **20597178**
([settings](https://github.com/Algolon/Fjallkompis/rules/20597178)), targeting
`~DEFAULT_BRANCH`. Applied and verified 2026-08-09; before it, `main` accepted
direct pushes, force pushes and deletion.

A ruleset rather than legacy branch protection: it targets the default branch
symbolically, its bypass list is explicit rather than an implicit "admins are
exempt" toggle, and it is readable back through one API call.

| Rule | Setting |
| --- | --- |
| Require a pull request | yes, **0 required approvals** |
| Required status check | `Test, typecheck and build` (the `pr-ci.yml` job) |
| Strict / up-to-date required | **no** — merging would otherwise need a rebase every time `main` moves |
| Block force pushes | yes |
| Block branch deletion | yes |
| Merge method | unrestricted — merge commits stay the established strategy |
| Bypass | **Repository admin** (`RepositoryRole` 5), **`pull_request` only** |

The bypass is deliberately **not** `always`. With `always`, a direct push to
`main` stays possible for the admin as an everyday accident — which is most of
what this ruleset exists to prevent, given the admin is the only person here.
`pull_request` keeps the admin able to bypass *when merging through a pull
request* while making a direct push behave like everyone else's: refused.
GitHub documents the mode as *"The actor can only bypass rules on pull
requests"*, and it applies to branch rulesets, which this is.

Verified after applying: all four rules resolve on `main`, the API reports
`current_user_can_bypass: "pull_requests_only"`, and PR #129 — with the only
required check green — reports `mergeStateStatus: CLEAN`, which is what proves
the rule does not deadlock an ordinary merge.

*Not* verified by attempting a real direct push to `main`: that test is only
safe if it fails, and if the rule were misconfigured it would silently land a
commit that force-push protection then makes awkward to remove. `git push
--dry-run` is no substitute — it is a client-side simulation and never reaches
the server-side rule evaluation, so it reports success either way.

Zero required approvals is deliberate: a solo developer must be able to merge
their own work. What the rule buys is that changes arrive *through* a PR with
CI green, and that `main` cannot be force-pushed or deleted by accident.

`Test, typecheck and build` is the only check that runs on a pull request into
`main`. `deploy.yml`'s `build` and `deploy` jobs run on *push* and never report
on a pull request — requiring either would deadlock every merge. That is
precisely the trap GitHub's default "Protect this branch" button walks into,
which is why the ruleset was written against the observed check names.

**Release automation does not bypass this.** The `ledger` job pushes a
`release/ledger-*` branch and opens a PR like anything else; GitHub Actions is
not a bypass actor, and must never become one.

### The ledger PR needs one repository setting

Job-level `permissions:` are necessary but **not sufficient** for the ledger job
to open its pull request. `GITHUB_TOKEN` is additionally gated by a repository
setting, and this repository had it switched off:

| Setting | Value | Why |
| --- | --- | --- |
| *Workflow permissions* → default `GITHUB_TOKEN` scope | **Read repository contents and packages permissions** | least privilege by default. A workflow may still request more in its own `permissions:` block, which is exactly how the `ledger` job gets `contents: write` — so this stays read-only |
| *Allow GitHub Actions to create and approve pull requests* | **enabled** (was disabled) | without it `gh pr create` fails outright, regardless of `pull-requests: write` |

The second setting also permits Actions to *approve* pull requests, which is
worth naming rather than glossing. It grants nothing here: the `main` ruleset
requires **0** approvals, so an approval from any actor — Actions included — is
not a merge gate and cannot be used to bypass one. If required approvals ever
becomes non-zero, revisit this: an Actions-approvable PR would then be a real
escalation path, and the ledger job should push its branch and leave the PR to a
human instead.

Verified with `GET /repos/Algolon/Fjallkompis/actions/permissions/workflow` →
`{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}`.

### Recovery / emergency

The admin bypass is `pull_request`-scoped, so **a direct push to `main` is no
longer an escape hatch** — not even for you. That is intentional. The real
emergency route is one deliberate, auditable step:

* **Merge through a PR, bypassing the checks.** With `pull_request` bypass an
  admin can merge a pull request that has not satisfied the required check —
  enough for almost every "this must land now" situation, without ever leaving
  the reviewed path.
* **If you truly need a direct push**, disable the ruleset, push, re-enable it.
  Two commands, and both appear in the audit log:

  ```bash
  gh api -X PUT repos/Algolon/Fjallkompis/rulesets/20597178 -f enforcement=disabled
  ```

  ```bash
  gh api -X PUT repos/Algolon/Fjallkompis/rulesets/20597178 -f enforcement=active
  ```
* The same switch lives in the UI at *Settings → Rules → Rulesets →
  `main protection` → Enabled/Disabled*.
* **If a required check is renamed**, PRs will hang waiting for a check that
  never reports. Fix the ruleset's `required_status_checks`, or disable it,
  merge, and re-enable. Renaming the `pr-ci.yml` job's `name:` is what would
  cause this.
