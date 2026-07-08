# Fjällkompis — development documentation

Technical documentation for contributors and maintainers. For what the app
is and how to use it, see the user-facing [README](../README.md); priorities
live in [ROADMAP.md](../ROADMAP.md) and delivered changes in
[CHANGELOG.md](../CHANGELOG.md).

## Stack

- Vite + React 18 + TypeScript; no backend, no auth (data in `localStorage`)
- **Route data:** verified GPX (`public/gpx/…`) preprocessed at build time into
  `src/generated/kungsleden-route.json` — no hand-entered geometry anywhere
- **Map:** MapLibre GL JS + a bounded OSM-derived PMTiles vector basemap
  (`public/maps/kungsleden.pmtiles`, ~3.5 MB, zoom ≤ 14), styled fully offline
  via `@protomaps/basemaps` with **no** remote glyphs/sprites/fonts/tiles
- **PWA:** `vite-plugin-pwa` (Workbox) app-shell precache + a separate,
  user-controlled offline-map cache with byte-range support

## Route data pipeline

```
public/gpx/kungsleden-abisko-nikkaluokta.gpx   (gpx.studio export, GPX 1.1)
        │  npm run generate:route  (runs automatically before dev/build/test)
        ▼
scripts/generate-route-data.mjs                (parse, validate, statistics)
        ▼
src/generated/kungsleden-route.json            (committed, deterministic)
        ▼
src/route/routeData.ts                         (typed ParsedRoute model)
```

GPX semantics: **1 track, 8 segments** — segment 0 is the complete overview
route; segments 1–7 are the seven day stages. They describe the same journey
twice and are never concatenated. Eight waypoints carry machine ids in
`cmt`/`desc` (`START_ABISKO`, `HUT_*`, `END_NIKKALUOKTA`).

Statistics: Haversine distances; min/max elevation from raw `<ele>`; total
ascent/descent from a centred 5-point moving average with a 2 m hysteresis
threshold (documented in the generator). The GPX has no timestamps — stage
times in the app are labelled personal estimates.

Validation: `npm test` (node --test) re-runs the pipeline from the GPX and
checks segment/waypoint counts, stage↔waypoint proximity (≤ 250 m), distance
sums (overview 104.48 km vs stage sum within 1 %), elevation presence/range,
bounds and monotonic cumulative distances. The generator itself fails the
build on hard violations. In dev, a route-diagnostics summary is logged to the
console.

## Offline basemap

`scripts/extract-offline-map.sh [BUILD_DATE] [MAXZOOM]` extracts the region
around the route (GPX bounds + 9 km buffer) from the Protomaps daily planet
build using the [pmtiles CLI](https://github.com/protomaps/go-pmtiles) —
range-read extraction only, never raster scraping, never
tile.openstreetmap.org. Output: `public/maps/kungsleden.pmtiles` (committed).
Attribution: © OpenStreetMap contributors · Protomaps (shown on the map).

In the app, **Settings → Offline map** downloads the file into a dedicated
Cache Storage cache (separate from the app shell). The map reads it through a
blob-backed PMTiles source (works without a service worker), and the service
worker additionally serves byte-range requests from the cached full response
via Workbox `RangeRequestsPlugin`. Without the download, the basemap streams
online via HTTP range requests; with no network and no download, the route
still renders on a clearly-marked placeholder background.

## Satellite imagery layer

The map has an optional **Satellite** basemap alongside the vector **Terrain**
map. Tiles come from a raster PMTiles archive of **EOX Sentinel‑2 cloudless
2024** imagery, bounded to the route corridor. The archive is **~42 MB and is
NOT committed to the repo** — the canonical binary lives on a **versioned
GitHub Release** and is injected into the Pages build at deploy time:

```
Release asset (tag satellite-data-v1, kungsleden-satellite.pmtiles)
  → deploy.yml downloads it (gh release download) + verifies SHA-256 & size
  → placed in public/maps before the Vite build → copied to dist/maps
  → GitHub Pages serves it from the app's own origin:
    https://algolon.github.io/Fjallkompis/maps/kungsleden-satellite.pmtiles
```

Browsers therefore fetch it **same‑origin** — no CORS involved. (GitHub Release
assets themselves send no CORS headers, so the app cannot fetch them
cross‑origin directly; the deploy‑time injection sidesteps that without putting
the binary into git history.)

Resolution order in the app (`src/map/pmtilesProtocol.ts`): user‑downloaded
Cache‑Storage blob → the hosted same‑origin file (streamed online) → disabled
toggle. Once downloaded in **Settings → Satellite imagery** it works fully
offline, independently of the vector basemap. A *missing* file (e.g. local dev
without the archive) is detected safely — an HTML/404 fallback is never mistaken
for an archive — and the Satellite toggle simply stays disabled.

`VITE_SATELLITE_URL` remains an **optional** build‑time override for alternative
hosting (the host must then send CORS headers and support Range requests);
production does not require it.

Attribution shown on the map (keep it):

> Sentinel‑2 cloudless — s2maps.eu by EOX IT Services GmbH
> (Contains modified Copernicus Sentinel data 2024)

### Updating the satellite data

New imagery ⇒ **new versioned release** (never mutate an existing tag):

1. Build a new archive (workflow or scripts below) → publish it as release
   `satellite-data-v2` with asset name `kungsleden-satellite.pmtiles`.
2. Update the pinned **tag, SHA‑256 and byte size** in
   `.github/workflows/deploy.yml` (they gate the deployment — a mismatch fails
   the deploy rather than shipping unverified bytes).
3. Merge; the next Pages deploy serves the new file. Users who downloaded the
   old archive re‑download from Settings when they choose to.

### Regenerating the archive (new imagery → satellite-data-v2, …)

Imagery is built on a GitHub runner, not committed. Two reproducible scripts
under `scripts/` do the work:

- `scripts/download-kungsleden-satellite.sh .` — downloads EOX Sentinel‑2
  cloudless for the route corridor into `data/source-imagery/sentinel2-kungsleden.tif`
  (git‑ignored; **never committed**). Requires `curl` + GDAL.
- `npm run generate:map:satellite -- data/source-imagery/sentinel2-kungsleden.tif` —
  the pipeline (`scripts/build-satellite-map.sh`): reads the crop box from
  `mapCutoutBounds` in the generated route JSON (never hard‑coded), reprojects to
  EPSG:3857, tiles as 256 px WEBP (matching `SATELLITE_TILE_SIZE`), builds the
  ~z7–13 pyramid, converts to PMTiles, and runs `pmtiles verify`. Options (env):
  `MAXZOOM=13 TILE_FORMAT=WEBP QUALITY=80 DEBUG=1`.

The easiest path is the **manual maintenance workflow**
`.github/workflows/satellite-data-maintenance.yml` (Actions → *Satellite map
data (maintenance)* → *Run workflow*, available once the workflow is on the
default branch). It runs both scripts on a runner, verifies the archive, uploads
it as a downloadable artifact, and — with `publish_release: true` and a
`release_tag` like `satellite-data-v2` — publishes the versioned Release that
`deploy.yml` consumes. Then update the pinned tag + SHA‑256 + size in
`deploy.yml` (see *Updating the satellite data* above).

### Why max zoom 13

Sentinel‑2 true colour is ~10 m/px. In Web Mercator, zoom **13** is ≈19 m/px at
the equator and finer at this latitude (~7 m/px near 68° N) — the closest zoom
to the native resolution. Going higher only upsamples pixels and inflates the
file, so 13 is the default cap; MapLibre over‑zooms beyond it (up to the map's
`maxZoom` 17) so you can still pinch in. (For this sub‑tile‑sized corridor GDAL
clamps the smallest overview, so archives come out ~z7–13.)

### Required tools (local builds)

- **GDAL** ≥ 3.6 — `gdalinfo`, `gdalwarp`, `gdal_translate`, `gdaladdo`
  (`apt-get install gdal-bin`, `brew install gdal`, or `conda install -c conda-forge gdal`).
- **pmtiles CLI** — [go-pmtiles](https://github.com/protomaps/go-pmtiles/releases)
  (single static binary; put it on `PATH` or set `PMTILES_BIN`).
- **curl** and **Node** (Node is used only to read the route bounds).

### Verify manually

```bash
pmtiles verify public/maps/kungsleden-satellite.pmtiles
pmtiles show   public/maps/kungsleden-satellite.pmtiles   # bounds, min/max zoom, tile type
```

Then place the archive at `public/maps/kungsleden-satellite.pmtiles` and run
`npm run build && npm run preview` — the preview serves it same-origin exactly
like the Pages deployment. Open the Map screen and switch to **Satellite**;
**Settings → Satellite imagery** downloads it for offline use. (Setting
`VITE_SATELLITE_URL` instead only works if that host sends CORS headers and
supports Range requests — plain GitHub Release asset URLs do neither.)

## Map-style comparison prototype

The Map screen has a developer-facing **Style · prototype** selector with
three basemap styles rendered from the **same** offline PMTiles source:
**Current** (production, unchanged), **Liberty Topo** (the
[gpx.studio styles](https://github.com/gpxstudio/styles) Liberty Topo design
adapted to the Protomaps schema — style only, never gpx.studio
tiles/fonts/sprites) and **Liberty Topo — Nordic** (the same structure in the
Nordic Trail palette). Switching swaps basemap paint layers in place, so
camera, route, markers and GPS are preserved, and everything stays glyph-,
sprite- and network-free. **No production style decision has been made** —
the default remains Current. Architecture, licences (MIT / BSD-3-Clause /
CC BY 4.0 lineage), the full layer-mapping table and the evaluation checklist
live in [map-style-comparison.md](map-style-comparison.md); the roadmap item
*Evaluate Current vs Liberty Topo vs Nordic Liberty Topo* holds the exit
criteria. Guarded by `tests/map-styles.test.mjs`.

## Adaptive shell & navigation (multi-device access)

One adaptive application serves phone, tablet and desktop from the same URL
— shared screens, data and components with different layout compositions.
Terminology used consistently in code and docs:

- **Multi-device access** (delivered): the same app opens and works on
  mobile, tablet and desktop through the same URL.
- **Device transfer** (existing, preserved): moving personal data between
  devices is manual full-state export → import in Settings
  (`tests/device-transfer.test.mjs` guards the round trip).
- **Cross-device sync** (out of scope): no accounts, no cloud, no backend,
  no automatic sync — see ROADMAP.md "Much later".

Mechanics:

- **Routing**: a dependency-free hash router. The route table (order,
  labels, `#/…` hashes for the six destinations) lives in
  `src/navigation/routes.mjs` — the single source of truth rendered by the
  TabBar on every device class, fenced by
  `tests/navigation-routes.test.mjs`. Hash routing is deliberate: it needs
  no server rewrites, so deep links work on the GitHub Pages project
  subpath. One-shot navigation payloads (e.g. Today → a specific stop)
  stay in React memory; URLs identify destinations, not entity state.
- **Shell**: the compact layout is the untouched mobile baseline — bottom
  tab bar, 560px column, measured `--app-height` sizing
  (`src/utils/viewportHeight.mjs`). The rail activates at ≥ 760px width
  **and ≥ 500px height**; the labelled sidebar at ≥ 1160px width and the
  same height gate. The height condition keeps landscape phones (≈ 360–
  440px tall) on the exact compact interaction model — space-driven media
  conditions, never device/UA detection. Navigation is one component
  (TabBar) rendered twice by the shell: `tabbar--rail` before `<main>`
  (visible in medium/wide, so keyboard focus order matches the visual
  nav-left order) and `tabbar--bar` after `<main>` (compact, its
  production focus position). CSS displays exactly one; the hidden
  instance is `display:none` and out of layout, tab order and the
  accessibility tree. Styling lives in the "Adaptive shell" section at
  the end of `src/styles/global.css`.
- **Screens**: per-screen `screen--*` classes set intentional content
  widths inside the wider shell; at ≥ 900px width (same ≥ 500px height
  gate) selected screens use two-column compositions (Today, Stages,
  Stops, Lists, Settings; the Map's map+elevation grid predates this
  iteration). Inside these grids, spacing belongs to the grid gap — the
  legacy `.card + .card` stacked margin is reset per grid wrapper.
  MapLibre resize is handled by MapView's own ResizeObserver.
- **PWA**: the manifest orientation lock was removed (`orientation: 'any'`);
  install/update flows, the offline app shell and the separate offline-map
  downloads are unchanged. Large offline assets are never auto-downloaded
  on a new device.

Mobile is the regression baseline: changes to compact behaviour (tab order,
labels, screen hierarchy, interaction patterns) must be deliberate,
documented decisions — not side effects of desktop work. Test compact
layouts at 320×568, 360×800 and 390×844 — plus landscape 800×360 and
844×390, which must keep the bottom tab bar — before merging layout
changes.

## Stops guide data

The Stops screen shows a **curated snapshot** of official facility information
(shops, saunas, opening periods, bed capacity) for the eight places along the
route, manually verified on **2026-07-02** against the STF and Nikkaluokta
websites linked from each card. It is deliberately static: nothing is scraped
at runtime, facility data is not user-editable, and each card states when the
facts were checked. Update `src/data/stops.ts` after re-verifying. Optional
licensed photos go in `public/images/stops/` (see the README there) — without
one, cards render a generated route-silhouette fallback.

Personal data stays separate: per-stop **trip notes**, the **daily list** and
the **packing list** live in one versioned `localStorage` blob
(`src/utils/stateMigration.mjs`, schema v2, defensive v1 migration covered by
`tests/state-migration.test.mjs`).

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173/Fjallkompis/
npm test           # GPX pipeline validation
npm run build && npm run preview   # production PWA (SW active only in build)
```

### Test offline
1. `npm run build && npm run preview`, open the app, let the SW activate.
2. Settings → Offline map → **Download for offline use**.
3. DevTools → Network → Offline, reload: app, basemap, route, elevation all
   still work.

## Deploy

- **GitHub Pages (automatic):** push to `main` runs
  `.github/workflows/deploy.yml` → https://algolon.github.io/Fjallkompis/
  (Settings → Pages → Source: GitHub Actions, one-time).
- **Netlify:** `npm run build`, publish `dist` — change `base` in
  `vite.config.ts` from `/Fjallkompis/` to `/` first.

## Project structure

```
fjallkompis/
├─ ROADMAP.md                   # canonical roadmap (Now/Next/Later/Blocked)
├─ CHANGELOG.md                 # delivered iterations (Keep a Changelog)
├─ scripts/
│  ├─ generate-route-data.mjs   # GPX → JSON preprocessing + validation
│  ├─ extract-offline-map.sh    # bounded PMTiles extraction (pmtiles CLI)
│  └─ check-version-consistency.mjs  # version-drift guard (npm run check:version)
├─ tests/
│  ├─ route-data.test.mjs       # deterministic pipeline validation
│  ├─ state-migration.test.mjs  # localStorage schema v1 → v2 migration
│  └─ version-consistency.test.mjs   # the guard passes AND fails correctly
├─ public/
│  ├─ gpx/…                     # source GPX (verified route)
│  ├─ images/stops/             # optional licensed stop photos (see README there)
│  └─ maps/kungsleden.pmtiles   # bounded offline basemap (~3.5 MB)
└─ src/
   ├─ generated/                # build-time route JSON (committed)
   ├─ route/                    # typed ParsedRoute model + hut↔waypoint map
   ├─ map/                      # offline-map cache, pmtiles protocol, style
   ├─ components/               # MapView, ElevationProfile, OfflineMapCard, …
   ├─ data/                     # stages + curated stops snapshot + packing seed
   ├─ store/ hooks/ utils/ screens/ styles/
   └─ …
```

## Known limitations

- Basemap has no text labels yet (kept glyph/sprite-free for offline
  reliability); hut names are local HTML markers.
- Max zoom 14 (+overzoom) — fine for overview, not for close-up detail.
- Route progress projects GPS fixes onto the mapped line — approximate, and
  off-route or low-accuracy fixes are qualified rather than shown as a
  confident percentage. **Live tracking (beta)** is explicit opt-in and
  foreground-only: it follows the persisted current stage with a single
  high-accuracy `watchPosition` watcher, judges on/off-route against the
  complete route (so standing on another stage is never called "off route"),
  shows a compact in-map status (active / GPS-uncertain / qualified
  off-route), and stops when you leave the Map tab or the screen locks. No
  background tracking, no location history retained or persisted.
- Stage time estimates are personal guesses; the GPX has no time data.

## Project status & roadmap

[ROADMAP.md](../ROADMAP.md) is the single source of truth for priority and
progress (Now / Next / Later / Blocked / Completed). Delivered iterations are
summarised in [CHANGELOG.md](../CHANGELOG.md). Future-work lists are not
duplicated here.

## Versioning & releases

`package.json` is the only place the app version lives — Vite injects it at
build time as `__APP_VERSION__` (exported as `APP_VERSION` from
`src/constants.ts`), and `npm run check:version` fails the test and build
gates on any drift. Bump with `npm version <x.y.z> --no-git-tag-version` so
`package-lock.json` stays aligned.

Versions represent meaningful delivered iterations, not individual commits.
While pre-1.0:

- **no bump** — documentation-only work, tests, internal refactors with no
  delivered change;
- **PATCH** (0.3.0 → 0.3.1) — bug fixes, copy corrections, accessibility
  fixes, small visual refinements;
- **MINOR** (0.3.0 → 0.4.0) — a coherent user-facing feature, meaningful data
  capability or substantial UX iteration;
- **1.0.0** — the first stable, field-tested, trip-ready release.

Release checklist for a meaningful user-facing PR (also in the
[PR template](../.github/pull_request_template.md)):

1. Decide explicitly: no bump, patch, minor or major?
2. Does [CHANGELOG.md](../CHANGELOG.md) need an entry?
3. Did [ROADMAP.md](../ROADMAP.md) priorities or statuses change?
4. Are `package.json` and `package-lock.json` still aligned?
   (`npm run check:version` verifies this.)
