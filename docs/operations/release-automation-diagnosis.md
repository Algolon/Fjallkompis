# Release architecture — diagnosis before automation

Written against `main` at **`ae1a66ef9c59052e4983ae719ba14bd605e55ac6`** (PR #128,
"Map parity"), before any change in this milestone. It records what the release
path *was*, so the automation that follows can be judged against reality rather
than against a remembered version of it.

Nothing in this document is a proposal. The design lives in
[`release-automation.md`](./release-automation.md).

---

## 1. Everything that can build, deploy or release

Five workflows existed. Only three can produce something a user could receive.

| Workflow | Trigger | Permissions | Can reach a user? |
| --- | --- | --- | --- |
| `deploy.yml` | `push` to `main`, `workflow_dispatch` | `contents: read`, `pages: write`, `id-token: write` | **Yes** — publishes the PWA to GitHub Pages |
| `android-internal-release.yml` | `workflow_dispatch` only | `contents: read` | **Indirectly** — emits a signed AAB a human then uploads |
| `android-spike.yml` | `push` to `agent/android-capacitor-spike`, `workflow_dispatch` | `contents: read` | No — debug APK artifact |
| `pr-ci.yml` | `pull_request` → `main`, `v*-integration` | `contents: read` | No |
| `satellite-data-maintenance.yml` | `workflow_dispatch` | `contents: write` | No — publishes map archives to GitHub Releases |

`satellite-data-maintenance.yml` is the only workflow holding `contents: write`,
and it writes Release assets, not the source tree.

**No workflow could write to `main`.** Verified by reading every `permissions:`
block: `contents: write` appears once, and that job pushes no commits.

## 2. Pages trigger and provenance

`deploy.yml` fires on every push to `main`. It builds, fetches the optional map
archives from their pinned GitHub Releases, verifies them against
`src/map/mapCatalog.mjs`, verifies the privacy policy landed, then creates a
Pages deployment by hand through the Pages REST API — `pages_build_version:
context.sha` — and polls for up to 45 minutes rather than trusting
`actions/deploy-pages@v4`'s 10-minute internal cap.

Provenance is therefore already good on the web side: the deployed commit is
recorded in the Pages deployment itself. What does *not* exist is any link
between that deployment and the Android artifact built from the same commit.

## 3. Android release trigger and signing

`android-internal-release.yml`, manual dispatch only, with a deliberate comment
forbidding the reintroduction of a push trigger. It:

1. fails fast if any of the four upload-signing secrets is empty;
2. runs `npm ci`, `npm test`, `npm run typecheck`, `npm run build`;
3. runs `npm run build:native`, `npm run verify:native`,
   `scripts/verify-privacy-build.mjs`;
4. `npx cap sync android`;
5. reconstructs the upload keystore into `$RUNNER_TEMP` under `umask 077`;
6. classifies keystore/password/alias failures *before* spending a build on them;
7. reads the release identity from Gradle (`:app:printReleaseIdentity`);
8. runs the Gradle host-side unit tests (`testDebugUnitTest` — the map
   downloader URL policy);
9. `bundleRelease`;
10. verifies the artifact: `jarsigner -verify`, signer fingerprint equals the
    configured upload key, signer is not `CN=Android Debug`, packaged manifest
    package/versionName/versionCode read with a pinned checksum-verified
    bundletool, no keystore inside the bundle;
11. verifies packaged branding (pixel-exact), the packaged vector basemap
    (byte-identical to `public/maps/kungsleden.pmtiles`), and the *absence* of
    terrain/contours/satellite;
12. uploads the AAB as a 30-day workflow artifact;
13. shreds the keystore in an `if: always()` step.

**There is no Google Play Developer API call anywhere.** The file says so in its
header, and `tests/android-release-config.test.mjs` enforces it with a regex
that fails on `androidpublisher`, `play-store`, `r0adkll` or
`upload-google-play`.

### Secret handling

Four repository secrets, all consumed as `env:` on the step that needs them and
never printed. The keystore lives outside `$GITHUB_WORKSPACE` so
`upload-artifact` cannot sweep it up. Certificate *fingerprints* are printed
deliberately — those are public information that Play itself displays.

## 4. Version derivation

`versionName` is `package.json.version`, read by Gradle with `JsonSlurper`.
`versionCode` is computed, never written:

```
versionCode = major*10_000_000 + minor*100_000 + patch*1_000 + androidBuild
```

`androidBuild` is the single hand-edited number, in `android/version.properties`.
Gradle refuses to build if any field overflows its parent's range, if
`androidBuild < 1` or `>= 1000`, or if the result leaves Play's `1..2_100_000_000`.

Current state: `package.json` `0.27.0`, `androidBuild=6`, so the next candidate
is **2700006**.

## 5. The consumed-code ledger, as it stood

This was the weakest link, and the reason this milestone needed a diagnosis.

The ledger existed in **three places, in three formats, with no machine-readable
form at all**:

| Where | Form | Read by |
| --- | --- | --- |
| `android/version.properties` | prose comments, `2700001`…`2700005` | humans; a test greps for each literal |
| `tests/android-release-config.test.mjs` | `const HIGHEST_CONSUMED_VERSION_CODE = 2700005` | that one test |
| `docs/ANDROID.md` "Versioning" | a prose table | humans |

The fence itself was real and correct — the test recomputes the candidate from
`package.json` + `version.properties` and fails unless it strictly outranks
`HIGHEST_CONSUMED_VERSION_CODE`. But the authority for "what has been consumed"
was **a constant inside a test file**. Nothing outside that test could ask the
question, and any automation would have had to either parse a test or duplicate
the number a fourth time.

### What makes a versionCode "consumed"

Google Play accepting the upload — nothing earlier. Building a bundle with a
code, or downloading the artifact, consumes nothing. Every entry in the history
records a code that was uploaded *and* published to Internal Testing *and*
(2700001–2700005) physically validated on the Samsung test device. That
semantic is correct and must survive automation: a code is burned when Play
takes it, not when CI produces it.

## 6. What the release path does not have

Established by inspection, not assumption:

* **No Play Developer API credential of any kind.** The repository's Actions
  secrets are exactly `ANDROID_UPLOAD_KEYSTORE_BASE64`,
  `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`,
  `ANDROID_UPLOAD_KEY_PASSWORD` and a stale `VITE_THUNDERFOREST_API_KEY`. There
  is no service-account JSON, no Workload Identity Federation configuration, no
  GCP project reference anywhere in the tree.

  Upload *signing* working proves only that a keystore exists. Play API access
  is a separate capability that has never been configured, and assuming
  otherwise because installs work would have been the single most expensive
  mistake available in this milestone.

* **No repository environments** other than `github-pages` (created by Pages
  itself).

* **No branch protection and no rulesets.** `GET /repos/Algolon/Fjallkompis/rulesets`
  returns `[]`; `GET .../branches/main/protection` returns 404 "Branch not
  protected". `main` accepts direct pushes, force pushes and deletion from
  anyone with write access.

* **No link between a Play build and its source commit** beyond a `Commit:` row
  in a job summary that expires with the run's retention.

## 7. Merge strategy and check names

Merge commits, squash and rebase are all enabled; the established Fjallkompis
strategy is **merge commits** (every recent `main` entry is a
`Merge pull request #NNN from …`).

The only check that runs on a pull request into `main` is the `pr-ci.yml` job
`validate`, whose **check name is `Test, typecheck and build`** (the job's
`name:`, not the job id). Confirmed against PR #128.

`deploy.yml`'s jobs appear on `main` commits as `build` and `deploy` — they run
on push, never on `pull_request`. Requiring either as a merge gate would
deadlock every PR, because neither ever reports on a pull request. This is
exactly the trap that GitHub's default "Protect this branch" walks into.

## 8. Retention

Release AABs: 30 days as workflow artifacts. After that the only surviving
evidence of a build is the job summary, which expires with the run. Nothing is
persisted in the repository.

---

## Conclusions carried into the design

1. Play API access must be **built from nothing** — there is no credential to
   reuse, so the credential *shape* is a free choice and should be the safest
   one available.
2. The consumed-code ledger must become **machine-readable and single-authority**
   before anything automated is allowed to read it.
3. The committed ledger cannot be the *only* fence, because it is updated after
   the fact: Play itself must be asked what it already holds.
4. The required status check for `main` is `Test, typecheck and build` — and
   only that one.
5. Nothing in the existing gate set may be relaxed to make uploading easier.
   Every check listed in §3 is load-bearing and several were written in response
   to a specific failure that reached a device.
