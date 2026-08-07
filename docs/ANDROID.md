# Android wrapper (Capacitor) — technical spike

**Status: spike. Not a release, not on Google Play, not merged.**

Fjällkompis is a web app. This document describes an *additional delivery
target* for that same app: a thin [Capacitor](https://capacitorjs.com) shell
that runs the existing build inside an Android WebView and can be installed as
an APK.

The PWA remains the primary product and the fast preview. Nothing here changes
how it is built, deployed or behaves.

---

## What the wrapper is — and is not

**Is:** one extra build mode, one 60-line platform adapter, one Android Studio
project, one CI job.

**Is not:** a native rewrite. There are no native screens, no native database,
no second navigation system, no background location, no accounts, no
telemetry, no remote configuration, no live-update channel. React screens,
trail content, stores and business rules are shared verbatim — if you change
a screen, you change it for both targets at once, because there is only one
copy of it.

---

## The two build targets

Both come from the same source tree and the same `npm run generate` step, so
neither can ship different trail content. They differ in exactly two ways.

|                | `npm run build` (web / PWA)  | `npm run build:native` (Android) |
| -------------- | ---------------------------- | -------------------------------- |
| Vite mode      | default                      | `native`                         |
| `base`         | `/Fjallkompis/`              | `/`                              |
| Service worker | VitePWA, `registerType: prompt` | none — plugin not loaded      |
| Web manifest   | emitted                      | not emitted                      |
| Output         | `dist/`                      | `dist/` *(same directory)*       |

### Why the native base is `/` and not `./`

Capacitor always serves the app from the root of `https://localhost` — it has
no notion of a path prefix — so a root-absolute base is correct there.

A relative `./` base looks like the more portable choice and is not. It was
tried, and the three contour backdrops 404'd at
`/assets/images/…/contours.svg`. Today, Guide and Plan pass their backdrop URL
through a **CSS custom property** (`--screen-bg-image: url("…")`), and a
relative `url()` inside a custom property is resolved against the stylesheet
where the `var()` is *substituted* — `global.css`, shipped as
`/assets/index-*.css` — not against the document. `/` is immune to that whole
class of surprise, which also covers `new URL(x, import.meta.url)` and any
future CSS-side asset. A test and `verify-native-build.mjs` both keep it that
way.

### `dist/` is shared — mind the order

Capacitor's `webDir` is `dist`, so **whichever build ran last is what
`cap sync` would package.** Syncing a Pages build into the APK produces an app
that builds cleanly and then fails on the device: every asset 404s under
`/Fjallkompis/`, and a service worker tries to register.

That mistake cannot happen silently. `npm run build:native` stamps
`dist/.native-build`, and `npm run cap:sync:android` runs
`scripts/verify-native-build.mjs` first, which refuses to sync unless it finds
that marker, a root-absolute `index.html`, `viewport-fit=cover`, no worker
artefacts, no `serviceWorker.register` in any chunk, and the vector basemap.
Run `npm run verify:native` any time you want that report on demand.

GitHub Pages is never at risk from this: `deploy.yml` builds from a clean
checkout with `npm run build` and is untouched by the wrapper.

---

## Commands

```bash
npm run build            # GitHub Pages / PWA build — unchanged
npm run build:native     # WebView build (root base, no service worker)
npm run verify:native    # prove the above about the real dist/ output
npm run cap:sync:android # verify, then copy dist/ into the Android project
npm run android:open     # open the project in Android Studio
npm run android:assemble # ./gradlew assembleDebug
```

A typical loop:

```bash
npm run build:native && npm run cap:sync:android && npm run android:assemble
```

**Toolchain:** Node 22, JDK 21, Android Studio 2025.2.1 or newer (Capacitor 8's
stated minimum). `compileSdk`/`targetSdk` 36, `minSdk` 24, AGP 8.13.0, Gradle
8.14.3 — all from Capacitor's own template, none of them hand-edited.

You do **not** need any of this to work on the app itself. `npm run dev` and
`npm test` are unchanged.

---

## Getting the APK without a local toolchain

The `Android spike APK` workflow (`.github/workflows/android-spike.yml`) runs
the full test suite, the typecheck, the web build (as a regression gate), the
native build, `cap sync`, and `gradlew assembleDebug`, then uploads the debug
APK as the artifact **`fjallkompis-android-spike-debug`**.

It runs on pushes to `agent/android-capacitor-spike` and on
`workflow_dispatch`. It holds only `contents: read`, has its own concurrency
group, and has no deployment step of any kind — it cannot reach Pages or Play.
The APK is signed with the standard debug keystore Gradle generates on the
runner; no release signing material exists in this repository.

---

## Runtime detection and the platform adapter

`src/runtime/platform.ts` is the only file that knows which shell the app is
in. It uses Capacitor's own `isNativePlatform()` / `getPlatform()` — **never**
user-agent sniffing — and exposes five things:

| Export                       | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `getRuntime()`               | `'web' \| 'pwa' \| 'native-android'`                 |
| `isNativeAndroid()`          | the one predicate the shell branches on              |
| `markRuntimeOnDocument()`    | stamps `<html data-runtime="…">` before first paint  |
| `initializeNativeShell()`    | per-bar system-bar icon contrast                     |
| `subscribeAndroidBackButton()` | wires Android Back to the app's hash history       |

Only `src/App.tsx` and `src/main.tsx` may import it — `tests/native-runtime.test.mjs`
fails the build if anything else does. **If you are about to write
`if (isNativeAndroid())` inside a screen or a store, put the behaviour here
instead.**

---

## Edge-to-edge, insets and the system bars

This is the part with the most moving pieces, so it is worth reading before
changing any of it.

1. **`MainActivity` calls `EdgeToEdge.enable(this)` before `super.onCreate()`.**
   Android 15+ enforces edge-to-edge for `targetSdk` 35+, but `minSdk` is 24 —
   on Android 7–14 nothing enables it automatically, and without this the
   WebView is letterboxed between opaque bars and the bottom navigation cannot
   reach the screen edge.
2. **`setNavigationBarContrastEnforced(false)` (API 29+).** With a transparent
   navigation bar, Android draws its own translucent scrim behind the
   *three-button* navigation area. That scrim would grey down the tab-bar green
   the web layer paints there. Gesture navigation enforces no scrim and is
   unaffected. The deprecated `statusBarColor` / `navigationBarColor` window
   properties are deliberately not used — they are no-ops for `targetSdk` 35+.
3. **Capacitor's SystemBars plugin injects the inset values.** Android WebView
   does not reliably populate `env(safe-area-inset-*)`, so with
   `insetsHandling: 'css'` the plugin measures the real window insets natively
   and writes `--safe-area-inset-top/right/bottom/left` onto `<html>` on every
   change: rotation, keyboard, gesture ↔ three-button switch. It reports `0`
   for the bottom while the keyboard is up, which is correct.
4. **`global.css` re-points the app's own variables at those values,** scoped
   under `html[data-runtime='native-android']`:
   `--safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`, and
   the same for the other three sides. Every existing consumer — screen
   padding, the sub-nav row, the tab bar, the MapLibre control corners, the
   navigation rail — therefore becomes inset-correct with no new rule.
5. **Top:** `.app::before` paints a `--spruce` band exactly `--safe-top` tall,
   `pointer-events: none`. No control is ever inside the inset. The status bar
   is set to light icons to suit it.
6. **Bottom, web side:** `.tabbar` already sizes itself as
   `--tabbar-h + --safe-bottom` with `padding-bottom: --safe-bottom`, so where
   the WebView receives real insets its own surface reaches the physical edge
   while its five controls — including the elevated centre Today disc — stay
   above the inset. The navigation bar is set to dark icons to suit that light
   surface. This remains the preferred, primary mechanism.
7. **Bottom, native side:** MainActivity adds one **protection view** — an
   opaque band in `@color/fjallkompisTabbar` (`#d4ded1`, the tab bar's own
   opaque token) pinned to the window bottom, behind the three-button
   navigation buttons. The Samsung test showed why: on the padded inset path
   the web layer physically ends above the system buttons, and the window
   showed the *launch* green (`#dce4d8`) behind them — a visible seam between
   two greens. The band's height is **measured** from
   `WindowInsetsCompat` on every inset change — `navigationBars().bottom`
   when `tappableElement().bottom > 0` (the three-button signature), zero
   otherwise — never a fixed dp value, so gesture navigation is untouched and
   the pill area stays app-drawn. The view is non-interactive and invisible
   to accessibility; when the web tab bar does reach the edge the two
   surfaces are the same colour, so the band changes nothing.
   `tests/native-runtime.test.mjs` fails if the native token and the CSS
   `--tabbar-surface-opaque` ever differ.

**Do not** add blanket safe-area padding to `<html>`. It would pull the tab bar
away from the screen edge and defeat the whole design; a test enforces this.

### The degraded inset path is real — the Samsung walks it

Capacitor passes the real insets through to the WebView only when the WebView
is **version 140 or newer** *and* the page declares `viewport-fit=cover` (it
does). Otherwise Capacitor pads the WebView's parent and reports zero insets —
the app sits *between* the system bars rather than behind them. The physical
Samsung test ran on this padded path, which is exactly what exposed the two
defects fixed after it: the stale decor background above the app (splash
handoff, below) and the launch-green band below it (protection view, above).
Both fixes are inert on the pass-through path.

### The splash handoff (why the logo can never linger again)

A window resolves its background from whatever theme the activity wears at the
moment its decor view is FIRST created — and keeps it. `EdgeToEdge.enable()`
touches the decor view; in the first APK it ran while the activity still wore
the launch theme, so the decor froze the splash drawable (launch colour +
centred mark) as its permanent background, and on the padded path the
status-bar band exposed it above every screen as a ~120 px phantom header.

The fix is the supported AndroidX handoff, not timing: the launch theme
declares `postSplashScreenTheme = AppTheme.NoActionBar`, and
`SplashScreen.installSplashScreen(this)` is the **first statement** of
`onCreate`, swapping the theme before anything can create the decor. After the
handoff the activity's `windowBackground` is a plain colour
(`@color/fjallkompisLaunch`), visible only for the instant before the
WebView's first paint. The splash drawable may be referenced from the launch
theme only; tests enforce the call order, the post-theme's plainness, and the
drawable's launch-only status.

---

## Android Back

`@capacitor/app` registers an always-enabled back callback that **consumes
every back press**, and with no JS listener it does nothing at all once the
WebView cannot go back — a dead button. So the adapter subscribes, and:

- **app history remains** → `history.back()`. The app's existing hash routing
  decides the destination, so `#/guide/stages` → Guide and `#/plan/packing` →
  Plan, and Back/Forward behave exactly as in the browser. This is deliberately
  a delegation, not a second navigation model.
- **no app history left** → `App.minimizeApp()`. The activity goes to the
  background with its state intact. `exitApp()` would force-kill the process
  and discard an in-progress form.

"Is there app history?" is answered by the Navigation API's `navigation.canGoBack`,
which reports precisely the contiguous same-origin entries of this document;
`history.length` cannot answer it and is only the fallback.

### Known limitation

**An open sheet, dialog or picker does not close on Back** — the shell
navigates underneath it instead. The app's overlays are a mix of native
`<dialog>` elements and `role="dialog"` containers with their own Escape
handling; unifying them is a product change, not wrapper plumbing. Deliberately
out of scope for this spike.

---

## Storage — read this before testing

The wrapper has its **own sandbox**. `com.algolon.fjallkompis` gets a private
WebView data directory; its `localStorage` and IndexedDB are entirely separate
from Chrome's and from the installed PWA's. Installing the wrapper does not
touch, migrate, read or delete PWA data, and there is no automatic migration —
by design.

To move a trip across:

1. In the **PWA**, Settings → export the JSON backup.
2. In the **wrapper**, Settings → import that file.

**The JSON backup does not include Trail Wallet document images.** Those blobs
live in the `fjallkompis-wallet` IndexedDB database and are not part of the
export envelope. After importing, re-add wallet documents by hand, or simply
use a fresh test profile in the wrapper.

Nothing about storage changed for the wrapper: `SCHEMA_VERSION`, the
`fjallkompis:state` key, the `fjallkompis-wallet` database and the export
format are all untouched, and a test asserts it.

**Platform backup is off.** `allowBackup="false"` plus a `data_extraction_rules.xml`
that excludes both cloud backup and device transfer — the spike is not allowed
to introduce cloud storage, and wallet documents are exactly the kind of data
that should not leave the device implicitly.

---

## Map

The committed **vector basemap** (`public/maps/kungsleden.pmtiles`, ~5.6 MB)
ships inside the APK through the ordinary Vite build and is verified present
before every sync. Route and stage overlays are drawn from the bundled GeoJSON,
so the Map tab works offline from first launch with no download step.

### ✓ Closed risk: byte-range reads from the APK's own assets

**Physically verified working (Samsung, 2026-08-07).** The bundled vector map
rendered correctly inside the real Capacitor WebView on the device: full route
Abisko → Nikkaluokta, all seven stage colours, hut markers and labels.

This deserved its "open risk" label while it had one: PMTiles is a byte-range
format, and a source-level read of Capacitor's `WebViewLocalServer` range
branch showed it building a `Content-Range: bytes a-b/total` header around a
stream it never seeks (`no skip(fromRange)` in the path) — which predicted
wrong bytes for every non-zero-offset read. That failure **did not reproduce
on the device**, so the delivery path in real use is fine and no `BlobSource`
workaround is needed or planned. The desktop cross-check (the same `dist/`
served by a Range-conformant static server, 89.6 kB of `206` reads out of the
5.6 MB archive) still stands as evidence that the bundle and archive are
correct in themselves.

Keep the history in mind only if a future Capacitor major changes the local
server: the first symptom would be a blank or garbled Map tab in the wrapper
while the same build renders in a browser.

**Terrain, contour and satellite archives are not in the APK.** They are not
part of the Vite build at all: `deploy.yml` fetches them from pinned GitHub
Releases and injects them into the Pages output. The wrapper deliberately does
not duplicate that logic and does not download them silently. Requests for them
fail the same way they already fail when a Pages user has not downloaded
them — the app degrades honestly rather than crashing.

### Phase two, if the spike is accepted

| | A. Bundle archives in a "full trail" APK | B. Download into native storage after install |
| --- | --- | --- |
| Size | +~45 MB satellite, +~25 MB terrain/contours → a **~80–90 MB** APK | APK stays ~15 MB |
| Offline | Works the moment it is installed — the strongest story for a hut-to-hut trail with no signal | Needs one deliberate Wi-Fi step before departure |
| Updating imagery | Requires a new APK | Independent of the app version |
| Play Store | Over the 150 MB APK limit? No. But it makes every update a full re-download | Fine |
| Work required | Wire the release-asset fetch into the Android build | A native filesystem plugin plus a new download/verify/repair UI, duplicating logic the web `OfflineMapCard` already owns |

**Recommendation: A**, with the vector basemap and terrain/contours bundled and
satellite left as an optional download. The users are hikers who lose signal for
a week; an app that is complete at install time is worth 80 MB, and A adds no
new plugin, no new storage code and no new failure mode. Revisit B only if
bundle size becomes a real distribution constraint.

Neither is implemented. This is a recommendation, not a plan of record.

---

## Distribution — physical-test finding and the path after the spike

Installing the debug APK on the Samsung required bypassing normal device
security: allowing installs from an unauthorised source for the browser/file
app, and getting past **Samsung Auto Blocker**. That is acceptable exactly
once, for this technical spike — it is **not** an acceptable installation or
update experience for Fjällkompis.

What follows from that, recorded here as the standing plan:

- **GitHub-hosted debug APKs stay development artifacts.** They prove the
  build; they are never the way anyone, including Omar, routinely gets the
  app.
- **A manually signed release APK is not the answer either.** Sideloading a
  release-signed APK still requires unknown-source permissions and still
  collides with Auto Blocker; signing it ourselves changes nothing about the
  experience.
- **The next iteration after physical approval is Google Play Internal
  Testing**, as its own separately-scoped piece of work: produce a signed
  **Android App Bundle**, enrol in **Play App Signing**, and distribute
  privately through the Play Store — initially to Omar's Google account only.
  Installs and updates then arrive the normal, unbypassed way.
- **Nothing is uploaded to Play yet.** Creating the app in Play Console
  effectively **freezes the application id** — `com.algolon.fjallkompis` is
  still provisional, and confirming it permanent is an explicit decision that
  must happen *before* the first upload, not after.
- Production tracks, open testing and public discoverability stay out of
  scope.
- The upload keystore and its credentials are never committed — same rule as
  every other signing secret in this repository.

---

## Permissions

Declared: `INTERNET`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`. That is
all, and a test fails if the list grows.

Both location permissions are declared because that is the exact pair
Capacitor's WebChromeClient requests when `navigator.geolocation` first asks;
declaring only `FINE` would make Android 12+'s "Approximate" choice fail rather
than degrade.

Not declared, deliberately: `ACCESS_BACKGROUND_LOCATION`, any
`FOREGROUND_SERVICE*`, `POST_NOTIFICATIONS`, `CAMERA`, `RECORD_AUDIO`,
`READ_CONTACTS`, storage permissions. **Location is foreground-only.** Tracking
stops when the app is not in front, exactly as it does in the browser. Do not
describe this app as supporting background tracking.

---

## Application id

`com.algolon.fjallkompis` is **provisional**.

On Android the application id is the app's permanent identity. Once a build
carrying it is distributed publicly, changing it creates a *different* app:
existing users are not offered an update, they are offered a second install
alongside the first, with its own storage sandbox and no migration path.

Nothing has been published, so the id is still free to change. That window
closes at first public release — decide before then, not after.

---

## Icons and splash

Both reuse existing owned artwork; the logo is not redesigned and no
third-party imagery was added.

- `res/drawable-nodpi/fjallkompis_mark.png` is a byte-identical copy of
  `public/icons/icon-512.png` (a test asserts this).
- The adaptive icon insets that mark by 16%. This is not decoration: an
  adaptive foreground is masked to the central 66.7%, and the source artwork is
  drawn edge-to-edge, so used raw the compass points would be sliced off.
- Legacy (API 24–25) PNG icons are `public/icons/icon-maskable-512.png`
  downscaled; the adaptive background `#e9edeb` is that file's own background,
  so the two match.
- The splash is the launch colour `#dce4d8` (the PWA manifest's
  `background_color`) plus the same mark — via `windowSplashScreen*` on
  Android 12+, and a layer-list window background below that.
- **The mark appears on the launch splash only.** After
  `SplashScreen.installSplashScreen()` hands off (see "The splash handoff"
  above), no theme, window or view in the running app references the splash
  drawable — the Samsung test showed what happens otherwise, and tests now
  enforce it.
