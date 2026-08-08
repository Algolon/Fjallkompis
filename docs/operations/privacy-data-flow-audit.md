# Privacy data-flow audit — Fjallkompis

**Audited tree:** `main` @ `9a873045f3a1e8abaf04765f420e621f0bd5e6a9` (PR #126 merge)
**Audited:** 2026-08-08
**Amended:** 2026-08-09 for the map-parity change (PR #128), which adds a
**native** map-archive downloader. The amendment is scoped: §0, §1, §3, §5, §9
and the fence list below are updated where that change touches them; nothing
else was re-audited, and no finding was re-derived from a newer tree. Amended
passages say so.
**Targets covered:** the GitHub Pages PWA and the Capacitor Android app — one
codebase, two build modes (`vite build` / `vite build --mode native`).

This document records **what the application does**, proven from the tree.
Interpretation for the Google Play Data safety form is deliberately kept
separate, in [play-data-safety-evidence.md](play-data-safety-evidence.md), so
that a change in Google's definitions never silently rewrites the facts.

Every claim below names the file it was read from. Where something could not be
proven from the repository, it says so rather than guessing.

---

## 0. The four categories, kept apart

The audit distinguishes, and the privacy policy repeats, four different things
that are casually collapsed into "data":

| # | Category | In Fjallkompis |
|---|---|---|
| 1 | **Stored locally on the device** | trip state, Trail Wallet documents, offline map archives |
| 2 | **Accessed temporarily for a feature** | device location, while the map screen is open |
| 3 | **Transmitted over the network** | nothing about the user — the app's own files, and the map archives the user downloads |
| 4 | **Ordinary server/network metadata** | what GitHub Pages (and Google Play, for installs) inherently sees |

Categories 3 and 4 are the ones most often conflated. Fjallkompis transmits
nothing about the user in category 3; category 4 exists because loading a web
page is a network request, not because the app reports anything.

### Three kinds of network activity, kept apart

"The app makes N requests" is not a single claim, and collapsing these three
would make the audit either wrong or unfalsifiable. Throughout this document:

- **(N1) Platform resource loading.** The browser or WebView fetching the app's
  own documents, scripts, styles, icons and images — the app shell. Issued by
  the platform because a page is being loaded, not by application code, and
  enumerated by the build (the precache manifest, §7), not by a call site. On
  the PWA the service worker serves most of it from cache after the first load;
  in the APK these assets are packaged and never leave the device.
- **(N2) Explicit runtime requests written in application code, in EITHER
  language.** Requests the app itself issues while running, from a call site a
  person wrote — whether that call site is JavaScript (`fetch`) or native Java
  (`HttpURLConnection` in a Capacitor plugin). These are what §3 enumerates and
  what the regression fences pin, because these are the ones that could carry
  something.

  *Amended 2026-08-09 (PR #128).* N2 previously meant "JavaScript `fetch`",
  because that was the only kind there was. The Android map downloader is
  application-authored, runs while the app runs, and reaches the network — it
  is N2 by every part of the definition, and it would be a fiction to leave the
  category meaning "the requests we happen to count". Note the consequence: a
  scan of `src/` alone no longer enumerates N2, so §3 and the fences now cover
  both languages.
- **(N3) User-initiated navigation to external websites.** The reader tapping a
  link and leaving the app (§4). Not a request the app makes; a page the user
  chose to visit.

Only **N2** is countable from the source tree — now across `src/` **and**
`android/app/src/main/java/` — and only N2 is what "the app sends X" could ever
mean. (These labels are orthogonal to the four data
categories above — N1–N3 are kinds of network activity, 1–4 are kinds of
data.)

---

## 1. Android manifest and native configuration

`android/app/src/main/AndroidManifest.xml`

**Declared permissions — the complete set:**

| Permission | Why |
|---|---|
| `INTERNET` | fetch the app's own files and the optional map archives |
| `ACCESS_COARSE_LOCATION` | "Locate me" / live tracking |
| `ACCESS_FINE_LOCATION` | same; both are declared because that is the pair Capacitor's `WebChromeClient` requests when `navigator.geolocation` first asks |

`<uses-feature android:name="android.hardware.location.gps" android:required="false" />`
— GPS is a convenience, not a requirement.

**Deliberately absent** (asserted by `tests/privacy-policy.test.mjs`):
`ACCESS_BACKGROUND_LOCATION`, any `FOREGROUND_SERVICE*`, `POST_NOTIFICATIONS`,
`CAMERA`, `RECORD_AUDIO`, `READ_CONTACTS`, `READ/WRITE_EXTERNAL_STORAGE`.

**Backup channels are both closed:**

- `android:allowBackup="false"` — no Google Drive Auto Backup.
- `res/xml/data_extraction_rules.xml` excludes every domain (`root`, `database`,
  `sharedpref`, `external`, `file`) from **both** `cloud-backup` and
  `device-transfer`.

So trip state and Trail Wallet documents are not copied to Google Drive or to a
new phone implicitly. *(Device transfer is excluded conservatively — see the
file's own comment; re-enabling it is a product decision, not a privacy defect.)*

**Native components:** `MainActivity` (edge-to-edge + splash), `BootPlugin` (one
method, carries no data), `SaveFilePlugin` (Storage Access Framework writer),
and — *added 2026-08-09 (PR #128)* — `MapArchivePlugin` + `MapArchiveUrlPolicy`
(optional map-archive download, storage and slice-reading; §3 row 4, §5).
Capacitor plugins: `@capacitor/core`, `@capacitor/app` only
(`android/capacitor.settings.gradle`).

`MapArchivePlugin` handles **map data only**. It knows an archive id, a URL, an
expected byte length and an expected digest — all supplied per call from the
compiled-in catalog — and it reads and writes only inside its own directory
under `filesDir`. It touches no trip state, no Wallet document, no location and
no identifier, and **no new permission was added for it**: the existing
`INTERNET` covers the download and app-private internal storage needs none.

**No Firebase / Google Services.** `android/app/build.gradle` applies the
`com.google.gms.google-services` plugin only if `android/app/google-services.json`
exists; **it does not exist** in the tree, and a test asserts it stays absent.

**Release build:** `minifyEnabled false`, `debuggable` not set (so Capacitor's
`webContentsDebuggingEnabled` and `loggingEnabled` derive `false` from
`FLAG_DEBUGGABLE` in release). Signing keys come only from CI environment
variables; no keystore is committed.

**Application id:** `com.algolon.fjallkompis`, unchanged, in both
`capacitor.config.ts` and `android/app/build.gradle` (`applicationId` +
`namespace`).

---

## 2. Location

**Call sites:** `src/hooks/useGeolocation.ts` (one-shot `getCurrentPosition`)
and `src/hooks/useRouteTracking.ts` → `src/utils/trackingSession.mjs`
(`createWatchController` → `navigator.geolocation.watchPosition`). Nothing else
in `src/` touches geolocation.

**Consent:** the platform permission prompt is the gate; the app declares no
special access path.

**Foreground only.** There is no foreground service and no background-location
permission, so the watcher genuinely stops when the app is not in front.

**Where a fix goes.** `useRouteTracking` holds the session in React
`useState`. The session is folded through the pure reducer in
`trackingSession.mjs` and consumed by `MapScreen`. It is:

- **not** written to `localStorage` — the only writer is `saveState()` in
  `src/utils/storage.ts`, called from exactly one place
  (`src/store/AppStore.tsx:284`), and it writes `PersistentState` only;
- **not** in the persisted schema — `src/utils/stateMigration.mjs` and
  `src/types/index.ts` carry no latitude/longitude/breadcrumb field (fenced by
  test);
- **not** in any export — the backup and JSON export serialise `PersistentState`
  and the Wallet stores;
- **not transmitted** — no network call takes a position as input (§3).

A reload or app restart discards it. The per-reading diagnostic log and
breadcrumb trail in `trackingSession.mjs` are behind `keepLog` / `keepTrail`,
both defaulted `false` and documented as a pilot-only aid; `MapScreen.tsx:264`
records that production mode enables neither.

---

## 3. Explicit runtime network requests (N2)

This section covers **N2 only** — requests issued by application code. Platform
resource loading (N1) is covered by §7, and user-initiated navigation to
external sites (N3) by §4.

*Amended 2026-08-09 (PR #128): a fourth call-site, the first in native code.*

**Four explicit application-authored runtime network request call-sites** —
three JavaScript `fetch`, one native:

| # | File | Call | Target | Language |
|---|---|---|---|---|
| 1 | `src/map/pmtilesProtocol.ts:95` | ranged `bytes=0-0` probe | the **basemap** `.pmtiles` | JS |
| 2 | `src/map/archiveStore.ts:140` | full GET of the archive bundled in the app package | app package asset (no network on Android) | JS |
| 3 | `src/map/offlineMap.ts:249` | the user-initiated archive download (**PWA**) | a same-origin `.pmtiles` | JS |
| 4 | `MapArchivePlugin.java:363` | the user-initiated archive download (**Android**) | the pinned GitHub Release asset | **native Java** |

**Why 4 exists and 3 was not enough.** The PWA downloads archives same-origin;
Android cannot, and not for a stylistic reason — GitHub Release assets send no
CORS headers, so a WebView `fetch` cannot read them, and the WebView's own
Cache Storage is quota-evictable and therefore the wrong home for ~90 MB a
hiker needs on day four. The download is therefore native. Rows 3 and 4 are the
same user action, the same bytes and the same revision, reached by the two
mechanisms each platform actually permits.

**None of the four carries a body, a user-supplied parameter, an identifier, a
cookie, or a position.** All four are plain GETs for a static file whose name
comes from the compiled-in catalog (`src/map/mapCatalog.mjs`). Row 4 sends only
`Accept: application/octet-stream`; it attaches no credentials and reads no
response data other than the archive bytes, which are then checked against the
length and SHA-256 the catalog declares.

**Row 4 is constrained at the boundary, not merely by convention.**
`MapArchiveUrlPolicy` refuses any URL that is not HTTPS on `github.com` under
the project's own release-download path, and re-checks every redirect hop
against a host allow-list, before a socket is opened. Without that, a plugin
that opens a JavaScript-supplied URL in native code would be a
general-purpose GET engine outside the WebView's origin and CORS rules —
a privacy and security surface much larger than the feature. Exercised by
`MapArchiveUrlPolicyTest` (18 host-side JUnit cases: plaintext, `file:`/`data:`,
loopback and LAN, foreign hosts, lookalike hosts, credentials-in-authority,
wrong paths on the right host, and redirect escapes).

No `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`
anywhere in `src/` (fenced by test), and no other networking class anywhere in
the app's Java (fenced by test).

**How that count was obtained, and what it does and does not prove.** It is a
static enumeration of call sites at the audited SHA, in `src/` **and** in
`android/app/src/main/java/com/algolon/fjallkompis/`, held in place by two
allow-list fences that fail CI if either set changes
(`tests/privacy-policy.test.mjs` → "the app makes network requests from map code
only" and "the only native code that reaches the network is the map-archive
download"). It proves that application code contains no other request site,
and — together with the dependency fence and the map-style check below — that
no bundled library is configured to call out on the app's behalf. It is **not**
a runtime packet capture, and it makes no claim about what the browser, the
WebView, the OS or Play Services do underneath (see §10).

**Where archive URLs resolve.** *(Amended 2026-08-09.)* On the **PWA**,
`archiveUrl()` in `src/map/offlineMap.ts` uses `sameOriginUrl(spec.path)` — the
app's own origin — for the vector basemap, terrain, and contours. The satellite
archive has one optional override, `VITE_SATELLITE_URL`, a **build-time**
variable; it is unset (`.env.example` ships it commented out and no `.env.local`
is committed), so satellite also resolves same-origin. Deployment downloads the
archives from pinned GitHub Release assets **into the build**, so browsers fetch
them from the app's own origin.

On **Android**, the optional archives are downloaded from those same pinned
Release assets directly (`mapAssetReleaseUrl()`), because the app's own origin
in the native shell is `https://localhost` — Capacitor's in-app asset server,
which does not have them. The release tag is pinned per app version, so an
installed build always receives the archive it was built for. The **bundled**
vector basemap is inside the app package and is read with no network at all.

**What the archive host can see** is therefore the same class of thing GitHub
Pages already sees for the PWA: IP address, requested path, timestamp,
user-agent — §9. Fjallkompis adds nothing to it and receives none of it.

**Map rendering makes no third-party requests.** `src/map/mapStyle.ts` emits no
symbol layers, so the style declares **no `glyphs` and no `sprite` URL**, and
tile data comes from the PMTiles archive (a local blob, or a same-origin ranged
read). There is no tile server, no style server, no font server.

**Dependencies** (`package.json`): `@capacitor/app`, `@capacitor/core`,
`fflate`, `lucide-react`, `maplibre-gl`, `pmtiles`, `react`, `react-dom`.
None initiates a network request of its own; `maplibre-gl` and `pmtiles` fetch
only what the app configures, which is covered above. The set is pinned by test
so a new dependency forces a re-audit.

**Analytics / telemetry / crash reporting: none.** A scan of `src/`, `scripts/`,
`android/app/src/`, `package.json`, `capacitor.config.ts`, `vite.config.ts` and
`index.html` for the usual vendors (Google Analytics, GTM, Firebase,
Crashlytics, Sentry, Bugsnag, Datadog, Mixpanel, PostHog, Amplitude, Segment,
AppsFlyer, Adjust, AdMob, Facebook) returns nothing. Fenced by test.

**Logging** is `console.warn` / `console.error` only — device-local, and off by
default in an Android release build (§1).

---

## 4. External links (N3)

Screens link out to third-party sites (STF, Nikkaluokta Expressen, SJ,
Länstrafiken Norrbotten, OpenStreetMap, Protomaps, Copernicus, Naturkartan,
Wikipedia, the project's own GitHub repository — enumerated in
`src/data/attribution.ts`, `src/trail/…` content and the transport views).

All use `<a target="_blank" rel="noopener noreferrer">`. Following one **leaves**
Fjallkompis: on the PWA it opens a browser tab, and in the Android WebView
Capacitor hands the navigation to the system browser. No app data is appended to
those URLs, and `rel="noopener"` is the standing convention. What the
destination site then observes is that site's own business, and the policy says
so.

---

## 5. Storage on the device

| Mechanism | Key / name | Contents |
|---|---|---|
| `localStorage` | `fjallkompis:state` | the whole `PersistentState` blob: route direction, day plan, trip items, packing list, journal, hut notes, settings (`src/utils/storage.ts`) |
| `localStorage` | `fjallkompis:state:other-trail` | a foreign-trail blob set aside verbatim rather than destroyed; not reachable through any normal flow |
| `sessionStorage` | install-nudge dismissal flag | one `'1'` (`src/components/PwaLifecycle.tsx`) |
| IndexedDB | `fjallkompis-wallet` (v1) | Trail Wallet: `documents` (metadata) + `files` (`{id, blob}`) — passports, insurance, membership cards (`src/wallet/walletStore.mjs`) |
| Cache Storage | Workbox precache | the app shell (JS/CSS/HTML/images), **PWA only** |
| Cache Storage | `fjallkompis-offline-map-v2`, `…-terrain-v1`, `…-contours-v1`, `…-satellite-v1` | user-downloaded map archives, **PWA only** — map data, nothing about the user |
| App-private files (Android) | `filesDir/map-archives/<id>.pmtiles` + `<id>.json` | user-downloaded optional map archives and a sidecar naming the revision — map data, nothing about the user *(added 2026-08-09, PR #128)* |

The Android archive directory is internal app-private storage: no permission,
invisible to other apps, removed on uninstall, and never shared or external
storage. The sidecar holds a revision id, a byte count and the archive's
SHA-256 — provenance for the map file, with nothing about the user in it.

Everything is device-local. There is no account, no sign-in, no sync, and no
backend that Fjallkompis operates.

---

## 6. Backup, export, import

`src/backup/completeBackupRestore.mjs`, `src/utils/exportImport.ts`,
`src/runtime/fileSave.ts`, Settings → Backup & restore.

- **Complete backup** (`.fjallkompis`, a zip via `fflate`) — trip state **and**
  Wallet document files.
- **Data export** (`.json`) — trip state and settings only, no Wallet files.
- **Import / restore** — via `<input type="file">`; restore replaces the
  device's current data (behind a confirm dialog).

**Where the file goes is the user's choice.** On the web it is an `<a download>`
on a blob URL. On Android, `SaveFilePlugin.java` uses
`Intent.ACTION_CREATE_DOCUMENT` (Storage Access Framework): the system picker
chooses the location, **no storage permission is required**, and the bytes cross
the bridge base64-chunked. A dismissed picker is `USER_CANCELLED`; a failed write
best-effort deletes the partial document.

Nothing is uploaded. The export file leaves the app only into the location the
user picked, and the Settings copy already warns that a complete backup contains
personal documents.

---

## 7. Service worker and app-shell loading (N1, PWA only)

`vite.config.ts` → `VitePWA`, `registerType: 'prompt'`, registration handled
explicitly in `src/components/PwaLifecycle.tsx`.

- Precaches the app shell (`**/*.{js,css,html,svg,png,ico,woff2,webp}`).
- Runtime caching: three `CacheFirst` + `rangeRequests` routes, each scoped to a
  **same-origin** `.pmtiles` path. Nothing else is intercepted.
- `navigateFallback: 'index.html'`, now with `navigateFallbackDenylist:
  [/\/privacy\//]` so the app shell cannot be served in place of the policy page.

**The native build has no service worker at all** — `VitePWA` is dropped, the
`virtual:pwa-register/react` module is resolved to an inert stub, and
`scripts/verify-native-build.mjs` refuses to sync a bundle that registers one.

---

## 8. Diagnostics

Settings → "Copy diagnostic summary" (`src/utils/diagnosticSummary.mjs`) builds a
plain-text string from an explicit **allow-list** of eleven technical fields
(app version, content version, schema version, route direction, platform,
display mode, service-worker state, storage availability, and the three offline
map states). Extra keys on the facts object are ignored by construction.

It is written **to the clipboard**. Nothing sends it; the user pastes it if they
choose. Guarded by `tests/diagnostic-summary.test.mjs` and re-fenced here.

---

## 9. Category 4 — infrastructure metadata

Not collection by Fjallkompis, but honest to state:

- **GitHub Pages** serves the app and, for the PWA, the map archives. Like any
  web host, its servers see the ordinary request metadata: IP address, requested
  path, timestamp, user-agent. Fjallkompis adds nothing to it and receives none
  of it.
- **GitHub release storage** serves the optional map archives to the **Android**
  app (`github.com` and its `*.githubusercontent.com` asset CDN). *(Added
  2026-08-09, PR #128.)* Same company, same class of metadata, same conclusion:
  a request for a public static file, carrying nothing about the user beyond
  what making any HTTP request inherently reveals. It is a **different host
  name** from the Pages origin, which is why it is listed separately rather
  than folded into the line above — and why the public policy names it too.
- **Google Play** distributes the Android app; installs and updates are Google's
  transaction with the user, under Google's own policy.
- If `VITE_SATELLITE_URL` were ever set to an off-origin host, that host would
  see the same class of metadata for satellite-archive requests. It is unset
  today, and the policy would need a sentence if that changed.

---

## 10. What could NOT be proven from the repository

Stated rather than assumed:

1. **Runtime behaviour of the WebView and Play Services on a physical device.**
   This audit is static. It proves that the audited source declares no
   analytics and contains no explicit runtime request call-site other than the
   three in §3; it is not a packet capture, and it cannot prove what Android's
   WebView, Play Services or the OEM layer do underneath. That is outside the
   app's control and outside the app's declaration.
2. **The `.env.local` of any individual build machine.** `VITE_SATELLITE_URL` is
   unset in the tree; a local override would not be visible here. CI builds from
   the tree, so the deployed artefact is covered.
3. **What third-party sites do when the user follows a link.** By construction
   we pass nothing, but the destination's own behaviour is theirs.
4. **Whether Google would classify the ephemeral in-memory location fix as
   "collected".** That is a definitional question, not a code question — it is
   raised in the Data safety evidence document instead.

---

## Regression fences

- `tests/privacy-policy.test.mjs` — the URL contract, the page, the Settings
  entry, and the standing code claims (JS fetch call-site allow-list, **native
  network call-site allow-list**, transport allow-list, dependency set,
  analytics scan, Android permissions and identity, backup exclusions, location
  never persisted, diagnostic field list).
- `android/app/src/test/java/…/MapArchiveUrlPolicyTest.java` — the map
  downloader's URL boundary, run host-side by `./gradlew testDebugUnitTest` in
  both Android workflows. *(Added 2026-08-09, PR #128.)*
- `tests/map-parity.test.mjs` — that the native downloader carries no archive
  identity of its own and that its allowed release origin still agrees with the
  catalog. *(Added 2026-08-09, PR #128.)*
- `scripts/verify-privacy-build.mjs` — the built output: the page ships, it has
  no JavaScript, it loads nothing off-origin, it is precached, and the SPA
  fallback cannot shadow it.
- Pre-existing: `tests/android-release-config.test.mjs`,
  `tests/diagnostic-summary.test.mjs`, `scripts/verify-native-build.mjs`.
