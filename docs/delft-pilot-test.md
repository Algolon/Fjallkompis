# Delft pilot — Map-tab field test (temporary)

> **Status: COMPLETE.** The field test was performed on 2026-07-07 and was
> functionally successful; the final real-device check of the inline
> off-route warning (added in 0.5.2) also passed. **No further Delft field
> test is required.** Anonymised results and the production-UX direction:
> [pilot-results/delft-2026-07-07-summary.md](pilot-results/delft-2026-07-07-summary.md).
> What remains is the graduation-or-removal decision (see ROADMAP → Now).

A bounded, temporary pilot mode for field-testing the Map tab (route
rendering, offline basemap, one-shot GPS, live tracking, along-route
projection, off-route behaviour) on a short walk in Delft, because the
Kungsleden cannot be field-tested from home.

**Scope guard:** the pilot only exists on the Map tab, only when the
`VITE_ENABLE_DELFT_PILOT` build flag is `true`, and only after explicitly
selecting *Delft pilot* in the route-context selector. Kungsleden remains the
default everywhere; no pilot state is persisted; the pilot map archive lives
in its own cache. Removal instructions are at the bottom.

---

## 1. Producing the assets (required before the pilot works)

The pilot UI ships without its route data. Until both assets below exist, the
pilot panel shows a "route data not built yet" checklist instead of a map.

### 1.1 The GPX route (`public/gpx/delft-pilot.gpx`)

Structure the generator expects (validated by `npm run generate:route` and
`tests/route-data-delft.test.mjs`):

- GPX 1.1, a single `<trk>`;
- **exactly 2 `<trkseg>` segments**: segment 0 = the full overview route,
  segment 1 = pilot stage 1 — the *same* geometry twice, mirroring the
  Kungsleden convention (overview + stages);
- **exactly 2 `<wpt>` waypoints**, carrying machine ids in `<cmt>` (or
  `<desc>`): `START_DELFT` at the start, `END_DELFT` at the end. `<name>` is
  the display name (e.g. "Start" / "Finish");
- track points as `<trkpt lat="…" lon="…">` (gpx.studio's attribute order);
- elevation (`<ele>`) is optional — Delft is flat and the pilot does not
  validate ascent/descent behaviour;
- no timestamps needed.

Route design requirements (for a useful GPS test):

- ~3–6 km, a handful of clear turns;
- does **not** self-intersect and does not run back along the same path in
  the opposite direction;
- start and end sections clearly apart. **Avoid a closed loop with the same
  start/end coordinate** — along-route projection is nearest-point-based, so
  standing at a shared start/end point matches both 0% and 100% ambiguously.
  Keep the endpoints ≥ ~200 m apart (a horseshoe shape is ideal). If you must
  close the loop, expect the readout near the endpoints to be untrustworthy
  and note it in the results;
- include both open-sky stretches and a more obstructed section (narrow
  street / tree cover) to see accuracy degrade;
- include a safe spot where you can deliberately walk 50–150 m away from the
  route (a park or square) for the off-route test;
- enough track points for smooth projection: aim for a point every 10–30 m.
  The generator warns when the median spacing exceeds 60 m.

Producing it in **gpx.studio**:

1. gpx.studio → *New file* → draw the route with the routing tool
   (walking profile). Delete/insert anchor points until the line follows the
   intended pavements.
2. Add two waypoints: at the start, name "Start", **comment/description
   `START_DELFT`**; at the end, name "Finish", comment/description
   `END_DELFT`. (The generator reads `<cmt>`, falling back to `<desc>`.)
3. Duplicate the track geometry as a second segment. gpx.studio does not
   expose segment editing directly, so the simplest reliable path is: export
   the file, open it in a text editor, copy the single
   `<trkseg>…</trkseg>` block and paste it immediately after itself inside
   the same `<trk>` (segment 0 stays the overview, the copy becomes stage 1).
4. Save as `public/gpx/delft-pilot.gpx`.
5. Run `npm run generate:route:delft` — it validates the structure, prints
   the route statistics, and writes `src/generated/delft-pilot-route.json`
   (commit it). Hard violations fail with a clear message.
   (`npm run generate:route` regenerates all routes;
   `npm run generate:route:kungsleden` only the Kungsleden data. Each route
   writes only its own output file — generating one can never touch another.)

### 1.2 The basemap (`public/maps/delft-pilot.pmtiles`)

Reuses the existing Protomaps extraction workflow — range-read extraction
from the Protomaps daily planet build, **never** scraping
tile.openstreetmap.org.

**Preferred: the GitHub Actions workflow** (no local tooling needed). The
GPX and its generated JSON must be committed on the branch first. Then:

1. GitHub → **Actions** → *Delft pilot map data (maintenance)* →
   **Run workflow**;
2. pick the branch (the pilot feature branch, or `main` after merge), leave
   *build_date* empty (= yesterday's Protomaps build), *maxzoom* `15`,
   *commit_to_branch* ticked;
3. press **Run workflow**. The runner extracts the bounded archive, runs
   `pmtiles verify`, uploads a `delft-pilot-map` artifact (archive +
   metadata + checksums) and commits `public/maps/delft-pilot.pmtiles`
   back to the branch (it refuses to commit anything over 30 MB).

   Caveat: GitHub only lists a `workflow_dispatch` workflow in the Actions
   UI once the workflow file exists on the **default branch**. If it is not
   listed yet, either merge the pilot PR first and run it on `main`, or run
   the local command below.

**Local alternative** (requires the
[pmtiles CLI](https://github.com/protomaps/go-pmtiles/releases) on PATH):

```bash
# after generate:route:delft has produced the delft JSON
scripts/extract-offline-map.sh <YYYYMMDD|yesterday's build> 15 delft-pilot
```

The bbox is read from `mapCutoutBounds` in the generated JSON (route bounds
+ 2 km buffer — a modest cutout around the walk, not all of Delft). Max zoom
15 gives useful street-level detail for an urban walk; MapLibre overzooms
beyond it. Expected size for a ~4 km urban route corridor at z15: roughly
5–15 MB.

**Hosting recommendation:** if the archive comes out ≲ 15 MB, commit it to
the repo next to `kungsleden.pmtiles` (~3.5 MB) — simplest, and it is
temporary (the workflow above does exactly this). If it is unexpectedly
large, do NOT commit it; replicate the satellite pattern instead (versioned
GitHub Release asset + deploy-time injection in
`.github/workflows/deploy.yml`).

Attribution is the same as the Kungsleden basemap (© OpenStreetMap
contributors · Protomaps) and is already wired.

---

## 2. Enabling / disabling the pilot

- The flag lives in `.env` at the repo root: `VITE_ENABLE_DELFT_PILOT=true`.
  It is read at **build time**; GitHub Pages deploys build from `main`, so
  merging this branch with `.env` in place enables the pilot on
  https://algolon.github.io/Fjallkompis/ automatically.
- **Disable:** set the value to `false` (or delete the `.env` line) and
  rebuild/redeploy. The selector, panel, download card and all pilot UI
  disappear completely; no user-visible trace remains.
- Local testing: `npm run build && npm run preview` (the service worker and
  same-origin archive serving only exist in the built app).

## 3. Removing the pilot permanently

Delete, in one commit:

- `src/screens/DelftPilotPanel.tsx` and `src/route/delftPilot.ts`
  (the tracking core — `src/hooks/useRouteTracking.ts`,
  `src/utils/trackingSession.mjs` + `.d.mts` — is now shared production
  code behind the Kungsleden live tracking and MUST stay);
- the pilot block in `src/screens/MapScreen.tsx` (`RouteContext`,
  `RouteContextSelector`, the early return, the two imports);
- `DELFT_ARCHIVE` in `src/map/offlineMap.ts` and `DelftPilotMapCard` in
  `src/components/OfflineMapCard.tsx`;
- the `delft-pilot.pmtiles` runtimeCaching rule in `vite.config.ts`;
- `VITE_ENABLE_DELFT_PILOT` in `.env` (or the whole file) and in
  `src/vite-env.d.ts`;
- `DELFT_PILOT_CONFIG` in `scripts/route-configs.mjs` (keep the manifest and
  the generalized generator — they are an improvement, not pilot-only) and
  the `generate:route:delft` npm script;
- `.github/workflows/delft-pilot-map.yml`;
- `public/gpx/delft-pilot.gpx`, `public/maps/delft-pilot.pmtiles`,
  `src/generated/delft-pilot-route.json`;
- `tests/pilot-session.test.mjs`, `tests/route-data-delft.test.mjs`
  (drop the delft entries; keep the kungsleden coverage);
- this document; the `trail-line` layer + `TRAIL_COLOR` in
  `src/map/mapStyle.ts` and the `trail`/`follow` props in `MapView` (or keep
  them — they are generic and harmless).

The generic MapView `route`/`archive` props, `resolveArchiveBasemap`, and the
route manifest are worth keeping either way.

Users who downloaded the pilot map can remove it via the pilot card while it
still exists; after removal, the orphaned cache
(`fjallkompis-delft-pilot-map-v1`) can be cleared from browser site settings
(it is small and harmless otherwise).

---

## 4. How the tracking logic behaves (what you are testing)

- **One-shot fix** (`Use my location`): unchanged Kungsleden behaviour,
  pointed at the Delft route.
- **Live tracking**: `watchPosition`, high accuracy, foreground-only. One
  watcher max; stopping, switching route context, or leaving the tab always
  releases GPS. **No background tracking**: lock the screen and updates stop
  until the app is foregrounded — that is expected, not a defect.
- **Reading acceptance**: non-finite/stale readings and fixes with reported
  accuracy worse than 150 m are logged as rejected and change nothing.
- **Route status** (per fix): accuracy worse than 40 m → *uncertain* (never
  judged on/off route); cross-track ≤ max(30 m, 1.5×accuracy) → *on route*;
  cross-track ≥ max(75 m, 3×accuracy) → *off route*; between → *uncertain*.
- **"Likely off route"** is only declared after 3 consecutive off-route
  fixes; recovery to *on route* is immediate.
- **Progress** (completed / remaining / %) only updates from fixes whose
  projection is reliable (same gate as the Kungsleden readout); otherwise the
  last reliable value is kept and labelled *stale* — walking away must never
  produce a jump in completed distance.
- **Diagnostics log**: in memory only; cleared on leaving the pilot or
  `Clear recorded trail & log`; exportable as JSON or CSV. It never leaves
  the device unless you export it.

---

## 5. Field-test checklist (Android phone, outdoors)

Preparation (at home, on Wi-Fi):

1. Open the deployed GitHub Pages PWA over HTTPS
   (https://algolon.github.io/Fjallkompis/). Install/Add to Home Screen if
   testing the installed experience.
2. Map tab → route selector shows **Kungsleden | Delft pilot**; confirm the
   app still opens on Kungsleden by default and the Kungsleden map behaves
   as before.
3. Select **Delft pilot** → the *Pilot mode · Delft test route* label,
   route line, start/finish markers and basemap render.
4. In the pilot panel, **download the Delft pilot map**; confirm the size
   and "stored on this device". Confirm Settings → Offline map (Kungsleden)
   is unaffected.
5. Airplane mode + reload: app opens, pilot route + basemap render offline.
   Disable airplane mode.

On the route:

6. At the start point: grant location permission when prompted; tap
   **Use my location** → one-shot fix appears with accuracy readout.
7. Tap **Start live tracking** → tracking-active banner; position marker and
   accuracy update every few seconds. Tap **Follow** and confirm the map
   tracks you; pan the map by hand and confirm follow switches off.
8. Walk the route. Watch: position marker on/near the line, breadcrumb trail
   extending, completed/remaining/% increasing, cross-track distance small,
   status *On route*.
9. Tap **Start live tracking** twice / re-enter the panel quickly — confirm
   no duplicate updates or erratic double-marker behaviour (single watcher).
10. In the planned safe spot, walk 50–150 m away from the route. Watch:
    cross-track distance climbing, status degrading to *uncertain* then
    *Likely off route* (after ~3 fixes), progress frozen and labelled stale
    — **not** jumping forward.
11. Return to the route: status recovers to *On route* promptly, progress
    resumes.
12. In an obstructed section, watch the accuracy number worsen and status
    become *uncertain* rather than a confident claim.
13. Lock the screen for a minute mid-walk, unlock: note the gap in the trail
    (expected — foreground only).
14. At the finish: **Stop tracking** → banner disappears, marker/trail stop
    updating.
15. **Export JSON and CSV**; confirm files download and open.
16. Optionally **Clear recorded trail & log** and confirm map + diagnostics
    reset.
17. Switch back to **Kungsleden**: normal map returns, no residue; Android
    status bar location indicator goes off (watcher released).
18. Note battery drain over the walk (Settings → Battery) and general
    usability in sunlight / one-handed.

Record every GPS jump, wrong route match, stale reading, UI confusion or
crash in the template below.

---

## 6. Test-results template

```markdown
# Delft pilot test — <date>

- Device & browser:        (e.g. Pixel 7, Chrome 126, installed PWA)
- App version:             (Settings → App version)
- Date & weather:          (incl. cloud cover — affects GPS)
- Route used:              (GPX name/length; deviations from plan)

## Results
- Permission behaviour:    (prompt shown? re-prompt? denial recovery?)
- Avg apparent accuracy:   (± m typical; best/worst)
- GPS jumps observed:      (count, magnitude, where)
- Off-route behaviour:     (distance at which warning appeared; recovery)
- Progress accuracy:       (readout vs reality at known landmarks; stale freezes)
- Offline-map result:      (airplane-mode rendering; download size)
- Live-tracking session:   (duration; fixes accepted/rejected; watcher cleanup)
- Battery observations:    (% used over the walk, screen-on time)
- Defects:                 (numbered list)
- Recommended follow-up:   (what to fix/verify before the Kungsleden)
```

## 7. Known browser/PWA limitations

- **Foreground only.** Browsers throttle or suspend `watchPosition` when the
  screen locks or the tab is backgrounded; the PWA makes no background
  claims. Keep the screen on while tracking (consider raising the screen
  timeout for the walk).
- **HTTPS required** for geolocation — always test the deployed Pages URL,
  not plain-HTTP LAN serving.
- First fix can take 10–30 s cold; `POSITION_UNAVAILABLE`/`TIMEOUT` early on
  are normal and the watcher keeps waiting.
- Reported accuracy is the device's own estimate; urban multipath in narrow
  streets can produce plausible-looking but shifted fixes — this is exactly
  what the *uncertain* state is for.
- iOS Safari suspends timers/geolocation aggressively; this pilot targets
  Android Chrome first.
- Battery drain of continuous high-accuracy GPS + screen-on is significant;
  that measurement is part of the test.
