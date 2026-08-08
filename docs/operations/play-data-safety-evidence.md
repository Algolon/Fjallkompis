# Google Play Data safety — evidence, not a submission

**Internal working document.** Not user-facing copy. Nothing here has been
submitted to Play Console, and nothing here should be pasted into the form
without the confirmations in §5.

**Facts source:** [privacy-data-flow-audit.md](privacy-data-flow-audit.md),
audited against `main` @ `9a873045f3a1e8abaf04765f420e621f0bd5e6a9` on
2026-08-08, **amended 2026-08-09** for the map-parity change (PR #128).
**Public policy URL:** <https://algolon.github.io/Fjallkompis/privacy/>
**Application id:** `com.algolon.fjallkompis` (unchanged)

**What the 2026-08-09 amendment changes:** F1 and F2 (the network call-site
facts) now cover a **native** call site as well as the JavaScript ones, and F13
is new. **No answer in §3 changes**, and that is the finding rather than an
oversight: the new request is a plain GET for a public static map file that
carries nothing about the user, so every category still fails the "transmitted
off the device" test that "collect" is defined by. The expected declaration
remains **"No data collected"**. Nothing else in Google's answers is
reinterpreted here — the implementation change does not require it.

This document maps audit findings to the Data safety categories. It keeps two
things apart on purpose: **what the code does** (proven, and fenced by tests)
and **how Google's definitions apply to it** (interpretation, which can change
under us when Google revises the guidance).

---

## 1. Official sources consulted

| Source | Retrieved | Used for |
|---|---|---|
| Play Console Help — *Provide information for Google Play's Data safety section* (`support.google.com/googleplay/android-developer/answer/10787469`) | 2026-08-08 | the definitions of "collect" and "share", the disclosure exceptions, the location data types, the privacy-policy requirement |

The definitions quoted below are from that page as retrieved on the date above.
**Re-check them before the actual submission** — this is the part of the
document with a shelf life. If the wording has changed, §3 must be re-derived;
§2 does not change, because §2 is about our code.

The load-bearing definitions:

> "'Collect' means transmitting data from your app off a user's device."

> "User data accessed by your app that is only processed locally on the user's
> device and not sent off device does **not** need to be disclosed."

> "'Sharing' refers to transferring user data collected from your app to a third
> party."

> Ephemeral processing: "accessing and using it while the data is only stored in
> memory and retained for no longer than necessary to service the specific
> request in real-time."

> User-initiated transfer: "Transferring user data to a third party based on a
> specific user-initiated action, where the user reasonably expects the data to
> be shared…" needs no disclosure.

> "Developers must add a privacy policy; this is required to complete the Data
> safety form." — required **even for apps that collect no data**.

---

## 2. The facts the declaration rests on

Each row is proven in the audit and held in place by a named fence.

| # | Fact | Evidence | Fence |
|---|---|---|---|
| F1 | **Four** explicit application-authored runtime network request call-sites were found in the audited source — three JavaScript `fetch` in map modules and one **native** (`MapArchivePlugin.java`, the Android optional-archive download). All are plain GETs for static `.pmtiles` files. This is a static enumeration of call sites, not a packet capture (audit §0 separates it from platform resource loading and from user-initiated navigation to external sites). *(Amended 2026-08-09; was three, all JS.)* | audit §3 | `privacy-policy.test.mjs` → "network requests from map code only" **and** "the only native code that reaches the network is the map-archive download" |
| F2 | None of the four carries a body, an identifier, user content, a cookie or a position. The native one sends only `Accept: application/octet-stream`. | audit §3 | same + "no transport other than fetch" (JS) + the native call-site fence |
| F3 | Map archives resolve to the app's **own origin** on the PWA; on Android the optional archives come from the project's pinned GitHub **Release** assets, because Release assets send no CORS headers and the native shell's own origin (`https://localhost`) does not host them. Same bytes, same revision, same publisher. *(Amended 2026-08-09.)* | `archiveUrl()` / `mapAssetReleaseUrl()`, audit §3, §9 | `map-parity.test.mjs` → release-URL derivation; (build-time `VITE_SATELLITE_URL` unset; see A3) |
| F4 | The map style declares no `glyphs` and no `sprite` URL — no third-party tile/font server | `src/map/mapStyle.ts` | "no glyphs, sprites or tiles from a third party" |
| F5 | No analytics, telemetry, crash-reporting or ad SDK anywhere; no `google-services.json` | audit §1, §3 | "no analytics… SDK is present" |
| F6 | Runtime dependencies are 8 packages, none of which calls out on its own | `package.json` | "runtime dependency set stays free of network/collection SDKs" |
| F7 | Location is foreground-only, held in React state, never persisted, never exported, never transmitted | audit §2 | "location never reaches persistent storage or an export" + permission fence |
| F8 | Declared Android permissions are exactly `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`; no background location | audit §1 | "declared Android permissions are exactly the audited set" |
| F9 | Trip data and Wallet documents are excluded from both Google Drive backup and device transfer | audit §1 | "Android keeps trip data and Wallet documents off Google Drive" |
| F10 | All user data (trip state, Wallet documents) lives in `localStorage` / IndexedDB on the device; no account, no sync, no backend | audit §5 | — (architectural; no backend exists to fence) |
| F11 | Export/backup writes only to a location the user picks in the system picker (SAF on Android) | audit §6 | — |
| F12 | The diagnostic summary is an eleven-field technical allow-list, copied to the clipboard, never sent | audit §8 | "diagnostic summary stays a fixed, non-personal field list" |
| F13 | The native downloader is constrained to the project's own GitHub Release download location before a socket is opened — HTTPS only, exact host, release path prefix, and every redirect hop re-checked against a host allow-list. It is not a general-purpose GET mechanism reachable from page script, and it carries no archive identity of its own (no filename, revision, size or digest in Java). Downloaded archives land in app-private internal storage with **no new permission**. *(New 2026-08-09.)* | audit §1, §3, §5 | `MapArchiveUrlPolicyTest` (18 host-side JUnit cases, run in both Android workflows) + `map-parity.test.mjs` |

---

## 3. Category-by-category mapping

Confidence is stated per row. **Strong** = follows directly from a quoted
definition applied to a fenced fact. **Needs confirmation** = a judgement call
recorded in §5.

### 3.1 Data collection and sharing

| Data type | Collected? | Shared? | Basis | Confidence |
|---|---|---|---|---|
| **Location — precise** | No | No | `ACCESS_FINE_LOCATION` is requested, but the fix is never transmitted off the device (F7). "Collect" = transmitting off the device. On-device-only processing is expressly exempt from disclosure. | **Strong** — but see Q1 |
| **Location — approximate** | No | No | Same. `ACCESS_COARSE_LOCATION` is declared only because that is the pair Capacitor requests. | **Strong** — see Q1 |
| **Personal info** (name, email, address, ID, …) | No | No | The app has no account, no sign-in, and no field that asks for identity (F10). | **Strong** |
| **Financial info** | No | No | No payments, no purchases, no billing code. | **Strong** |
| **Health & fitness** | No | No | The trail-progress feature derives distance along a route from in-memory position; nothing is stored or transmitted (F7). | **Strong** — see Q2 |
| **Messages** | No | No | No messaging feature. | **Strong** |
| **Photos & videos** | No | No | Wallet images are chosen by the user via the WebView file picker and stored in IndexedDB on the device (F10, F11). Never transmitted. | **Strong** |
| **Audio** | No | No | No `RECORD_AUDIO`, no audio feature. | **Strong** |
| **Files & docs** | No | No | Trail Wallet documents (passport scans, insurance, membership cards) are stored locally only. Export writes to a user-chosen location on the same device (F11). | **Strong** — see Q3 |
| **Calendar** | No | No | The day plan is the app's own data structure; no calendar permission, no calendar read. | **Strong** |
| **Contacts** | No | No | No `READ_CONTACTS`. | **Strong** |
| **App activity** (interactions, search history, installed apps, other user-generated content) | No | No | No analytics of any kind (F5). Trip notes and journal entries are user-generated content that never leaves the device (F10). | **Strong** |
| **Web browsing history** | No | No | None recorded. | **Strong** |
| **App info & performance** (crash logs, diagnostics, other) | No | No | No crash-reporting SDK (F5). The diagnostic summary is clipboard-only (F12). | **Strong** — see Q4 |
| **Device or other IDs** | No | No | No advertising ID, no device identifier is read or generated anywhere. | **Strong** |

**Net expected declaration: "No data collected".** Which, per the quoted rule,
still requires the privacy policy URL — that is what this milestone delivers.

### 3.2 Security practices section

| Question | Expected answer | Basis |
|---|---|---|
| Is data encrypted in transit? | *Not applicable / no data collected.* If the form forces an answer: the app is served over HTTPS (GitHub Pages) and the Android WebView loads from `https://localhost`. | audit §3 |
| Can users request data deletion? | **Yes** — Settings → "Reset local data", removing offline maps, or uninstalling. There is no server-side copy to request deletion of. | audit §5, policy page |
| Is the app independently validated against a security standard? | **No.** Do not claim otherwise. | — |
| Does the app follow the Families policy? | **No** — the app is not directed at children. | policy page → "Children" |

### 3.3 Data types the form asks about that do **not** map cleanly

- **"Files and docs"** exists as a Data safety type, but the form asks about
  *collection*, i.e. transmission off-device. Trail Wallet documents are the
  most sensitive data in the product and are, by design, never transmitted. The
  correct answer is "not collected", **and** the privacy policy describes them
  in full anyway — the honest position is not to hide behind the form's
  narrower definition.

---

## 4. What is strongly supported

1. **"No data collected" is the correct Data safety answer** under the quoted
   definition of "collect", because every category above fails the "transmitted
   off the device" test, and every one of those failures is fenced by a test
   that breaks CI if it stops being true.
2. **No sharing**, because there is no collection to share, and no third party
   receives anything.
3. **Location permissions are declared honestly**: foreground only, no
   background-location permission, no foreground service, and the app is fully
   usable without a fix.
4. **The privacy policy URL requirement is satisfied** by a static,
   JavaScript-free page verified in the production build.
5. **Deletion is genuinely user-controlled and complete**, because there is
   nowhere else a copy could be.

---

## 5. What needs human confirmation

These are **not** code questions. They are Omar's to answer before submission.

| # | Question | Why it matters |
|---|---|---|
| ~~**Q0**~~ | ~~**Privacy contact.**~~ **RESOLVED 2026-08-08 by the owner:** the canonical privacy contact is **`fjallkompis@gmail.com`**, published in the Contact section of the policy and held in `PRIVACY_CONTACT_URL` / `PRIVACY_CONTACT_LABEL`. It is a `mailto:`, and `tests/privacy-policy.test.mjs` + `scripts/verify-privacy-build.mjs` pin the **mechanism** (a mailbox, and the visible label being the address itself), not merely the string — so a future edit cannot quietly demote the privacy contact back to a link-only route. The GitHub issue tracker remains on the page as the general bug/feature route, explicitly *not* as the privacy contact. | **No longer blocking.** Confirm the same address is entered as the Play Console developer contact. |
| **Q1** | **Is "accessed but never transmitted" location genuinely exempt for this app?** The quoted rule says on-device-only processing need not be disclosed, and the ephemeral-processing note reinforces it. Our reading is that location is not merely ephemeral but never leaves the device at all — a stronger position than the exception requires. Confirm against the form's own wording at submission time; some developers choose to disclose foreground location anyway, for transparency. | Changes one row of the form. |
| **Q2** | **Does trail progress count as "Health & fitness"?** The app computes distance along a route from live position. Nothing is stored or sent, so it fails the collection test regardless — but if Google's category text is read as covering *access*, the answer would differ. | Low risk; recorded so it is not rediscovered later. |
| **Q3** | **Do user-driven exports need mention?** A complete backup contains passport and insurance scans and is written wherever the user points the system picker. Under the quoted "user-initiated transfer" exception this needs no disclosure, and it is not a transfer to a third party at all — the file stays on the device. The policy describes it plainly anyway. Confirm nothing more is expected. | Interpretive only. |
| **Q4** | **Is GitHub a "service provider" whose request logs matter?** Serving the app is ordinary hosting, not collection by us, and we receive nothing. Since 2026-08-09 this covers two GitHub host names rather than one: Pages serves the app (and the PWA's archives), and GitHub release storage serves the Android app's optional archives. Same company, same class of metadata, one extra host name — no change to the answer, recorded so the framing is confirmed against what the app actually does. | Interpretive only. |
| **Q5** | **Store listing consistency.** The Data safety answers must match the listing and the policy. Nothing in this PR touches the listing. | Process. |
| **Q6** | **Device transfer is currently disabled.** `data_extraction_rules.xml` excludes `device-transfer` as well as `cloud-backup`. That is a conservative product choice, not a privacy requirement; re-enabling it would be a genuinely useful feature and would need one policy sentence. | Product decision. |

---

## 6. Ambiguities in Google's definitions, recorded

1. **"Collect" is defined as transmission, but the form's category names read
   like access.** A reader of "Location — precise: No" could reasonably think
   the app never touches location. It does, with permission, in the foreground.
   The **privacy policy therefore describes location access in full** even where
   the Data safety form does not require disclosure. Where the two disagree in
   emphasis, the policy is the more informative document, and that is
   deliberate.
2. **"Ephemeral" and "on-device only" overlap.** Our case satisfies the stricter
   of the two (never transmitted), so the distinction does not change our
   answer — but it would matter immediately if a feature ever sent a position
   anywhere, even without storing it.
3. **The exceptions list is about *disclosure*, not about *behaviour*.** Nothing
   in it licenses collecting more; it only says what need not be declared. This
   document should never be used to justify a new data flow.

---

## 7. What would change the declaration later

If any of the following ships, **this document and the public policy must be
revised before release**, and the Data safety form re-submitted:

| Change | Consequence |
|---|---|
| Any analytics, telemetry or usage measurement | "App activity" and probably "Device or other IDs" become **collected**. Fence F5 breaks first. |
| Any crash/error reporting service | "App info & performance → Crash logs" becomes **collected**, and typically **shared** with the vendor. |
| Accounts, sign-in, or cloud sync | "Personal info" becomes collected; a data-deletion *request* mechanism becomes mandatory, not just local reset. |
| Any backend that receives trip data or Wallet documents | "Files and docs", "Photos", "App activity" become collected — and this is the most sensitive possible change, because Wallet holds identity documents. |
| Transmitting position anywhere (live sharing, SOS, weather-by-location) | "Location — precise" becomes collected; the ephemeral exception may or may not apply, and background location would need a separate Play declaration and review. |
| Setting `VITE_SATELLITE_URL` to an off-origin host | A third party begins seeing request metadata for archive downloads; the policy's "Network connections" section needs a sentence. Not collection by us, but it changes who sees what. |
| Pointing the native downloader at a host outside GitHub, or relaxing `MapArchiveUrlPolicy` | Same consequence as the row above, and a wider one: the plugin's value to an attacker is that it makes requests outside the WebView's origin and CORS rules. Loosening it needs its own review, not a URL edit. `MapArchiveUrlPolicyTest` breaks first. |
| Sending anything but a plain GET from the native downloader — a header, a query parameter, a body, a credential | The "carries nothing about the user" half of F2 stops being true by construction, and F1's "plain GETs" wording would be wrong. |
| An advertising SDK | Advertising ID, and a materially different form. |
| Re-enabling `device-transfer` in `data_extraction_rules.xml` | Not collection (device to device, no cloud), but the policy's backup section should say so. |

Each of the first four would break at least one test in
`tests/privacy-policy.test.mjs` before it could reach a release — the fences are
placed so that the declaration cannot silently go stale.

---

## 8. Submission checklist (for later — not part of this milestone)

- [ ] Re-read the Data safety help page; confirm the §1 quotes still hold.
- [x] **Q0 (privacy contact) resolved** — `fjallkompis@gmail.com`, published and fenced.
- [ ] Enter that same address as the Play Console developer/privacy contact, so the listing and the policy agree.
- [ ] Confirm `https://algolon.github.io/Fjallkompis/privacy/` resolves publicly.
- [ ] Complete the Data safety form using §3.
- [ ] Confirm the store listing does not contradict §3.
- [ ] Record the submission date and the answers given, here.
