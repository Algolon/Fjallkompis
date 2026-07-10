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

## Map coverage contract (bounded map)

Fjällkompis is a bounded route companion, not a general map browser. One
contract, defined in `scripts/route-configs.mjs` and materialised by
`npm run generate:route` into the route JSON, governs everything:

- **routeBounds** — the GPX bounding box;
- **userBounds** = route + `userBufferKm` (12 km) — the area the camera can
  reach (`maxBounds` in MapView). Selected so the full-route "Fit route"
  view stays inside the bounds on every supported viewport;
- **mapCutoutBounds** = user bounds + `dataMarginKm` (3 km hidden margin) —
  what every archive build (vector, terrain, contours, satellite)
  generates data for, before per-zoom outward tile alignment.

The terrain build MEASURES the physical post-alignment margin between the
user bounds and each archive edge and fails below 2 km;
`tests/coverage-contract.test.mjs` fails when generated bounds or any
locally present archive stop covering the user bounds, and
`tests/camera-bounds.test.mjs` pins the camera maths.

Camera policy (src/map/cameraBounds.mjs + MapView): `maxBounds` is the
authority (it also imposes the real minimum zoom per viewport; a static
`minZoom` 7 is only a backstop), pitch is disabled (`maxPitch: 0`), and the
map is permanently north-up — rotation gestures are off and the compass
control is omitted. Viewports much wider than the bounds' aspect
(fullscreen on landscape monitors) get a temporary east/west "overview
expansion" of `maxBounds`, active only below the zoom threshold where the
viewport already spans the full bounds width; the expanded area renders
real z7–9 relief because the terrain source download covers the
tile-aligned footprint of the lowest generated zoom.

Viewport proportions (global.css): desktop/tablet `.map-layout` maps are
4:5 (route ≈ 85% of map height in one Fit-route view); mobile portrait
height follows `h ≈ 1.073 × width + 80px` (the exact no-expansion fit
relation, shipped as `clamp(460px, calc(108vw + 80px), min(62vh, 560px))`);
`.mapview:fullscreen` uses the whole screen and relies on the camera
constraints instead of CSS shaping.

## Terrain relief (hillshade + contours)

The Nordic terrain style renders **hillshade** (MapLibre's native `hillshade`
layer on a terrain‑RGB `raster-dem` source) and **contour lines** (20 m
interval, 100 m index — selected based on the 30 m DEM resolution, visual
comparison, contour noise and storage measurements; a 10 m variant was
built and rejected as noise) when the two relief archives are available:

- `public/maps/kungsleden-terrain.pmtiles` — terrarium‑encoded PNG tiles,
  z6–12, ~10 MB;
- `public/maps/kungsleden-contours.pmtiles` — contour vectors (layer
  `contours`, property `elev`), z11–13, ~4 MB.

Both are built by `npm run generate:map:terrain`
(`scripts/build-terrain-map.sh`) from **Copernicus DEM GLO‑30 Public —
AWS Open Data mirror, 2021 release** (the exact source; registry entry:
<https://registry.opendata.aws/copernicus-dem/>), streamed straight from the
public bucket (no account). Requires GDAL (incl. the Python utilities),
tippecanoe, the pmtiles CLI, node and python3. The crop box comes from
`mapCutoutBounds` in the generated route JSON, like every other archive. The
script embeds the validated design decisions (per‑zoom warps, terrarium 1 m
rounding, no‑data edge extrapolation, contour minzoom tagging) as comments,
and fails the build if the contour tiling ever drops an elevation class or a
tile approaches tippecanoe's size cap (retention guard).

Every build also writes a **provenance manifest**
(`public/maps/<route>-terrain-provenance.json`, generated by
`scripts/generate-terrain-provenance.mjs`): source tile names/URLs/sizes/
ETags/SHA‑256s, acquisition date, bounds, zoom/interval parameters, tool
versions and output hashes. Attach it to the `terrain-data-vN` release next
to the archives. The pipeline is **repeatable from the manifest, not
bit‑for‑bit reproducible** — the AWS mirror serves one unversioned current
copy per DEM tile, so the manifest is what pins exactly which inputs a
given release consumed.

Distribution follows the satellite model exactly: the binaries are
**git‑ignored**, the canonical copies live on the **`terrain-data-vN`
GitHub Release**, `deploy.yml` downloads and SHA‑verifies them into the
Pages build, and browsers fetch them same‑origin. In the app, **Settings →
Terrain relief** downloads both files as one action for offline use;
resolution order per archive is the same cache‑blob → hosted‑file → absent
chain as the basemap. Without the archives (e.g. a fresh clone) the map
simply renders without relief — nothing else changes, and the style builder
emits no relief sources or layers at all.

Partial sets degrade the same way, by design: the two archives resolve
independently, so if only one is present (e.g. an interrupted two‑file
download) the map renders the **available component** — hillshade without
contours, or contours without hillshade — and never breaks. The Settings
card, by contrast, treats the pair as one unit: a partial set reports
**Not downloaded** and the primary button offers the full download again,
so the UI can never claim offline readiness the map data doesn't have.

Attribution (registered in `src/data/attribution.ts`): the map attribution
control shows the compact description *“Terrain derived from Copernicus DEM
GLO‑30”* (deliberately not a shorthand copyright — a compressed “© DLR/ESA”
would misattribute the copyright and omit Airbus). The complete required
notice is always rendered in the Settings → Terrain relief source block and
in the credits sheet: *Produced using Copernicus WorldDEM‑30 © DLR e.V.
2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under
COPERNICUS by the European Union and ESA; all rights reserved.*

Why these caps: GLO‑30 is a ~30 m model, so terrain tiles stop at z12
(≈14 m/px at 68° N — already finer than the source) and contours at z13;
MapLibre over‑zooms both up to the map cap. 10 m contours were evaluated
and rejected: from a 30 m DSM they mostly add noise and 3–4× the archive
weight. The shipped 20 m/100 m intervals were selected from the DEM
resolution, visual comparison, contour noise and storage measurements.

## Satellite imagery layer

The map has an optional **Satellite** basemap alongside the vector **Terrain**
map. Tiles come from a raster PMTiles archive of **EOX Sentinel‑2 cloudless
2024** imagery, bounded to the route corridor. The archive is **~11 MB and is
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

## Map-style comparison

The 0.8.0 three-way comparison concluded with **Liberty Topo — Nordic as the
production Terrain style** (v0.10.0, recorded in
[map-style-comparison.md](map-style-comparison.md)). The registry
(`src/map/mapStyles.mjs`), the Liberty builder and both palettes were
retained, and the Map screen's **Map comparison — temporary** selector has
been reintroduced for the Nordic-restyle benchmark work. Its *visibility* is
gated by `VITE_ENABLE_MAP_BENCHMARK` (see below): dev builds show it by
default, production only when the flag is exactly `true` — otherwise normal
users get the plain production map with no comparison options at all. The
default style is always Liberty Topo — Nordic; nothing is persisted. It
offers the three offline vector styles rendered from the **same** PMTiles
source — **Current**
(the pre-decision production style), **Liberty Topo** (the
[gpx.studio styles](https://github.com/gpxstudio/styles) design adapted to
the Protomaps schema — style only, never gpx.studio tiles/fonts/sprites) and
**Liberty Topo — Nordic** (the production default) — plus one deliberately
different fourth option, described next. Switching swaps basemap paint layers
in place, so camera, route, markers and GPS are preserved. Guarded by
`tests/map-styles.test.mjs`.

## Thunderforest Outdoors comparison layer (online-only, temporary)

The fourth selector option, **Thunderforest Outdoors — Online preview**, is a
*temporary external cartographic benchmark* for improving the Nordic style —
terrain readability, landcover hierarchy, relief, path hierarchy and label
prioritisation. The analysis and the resulting translation plan live in
[maps/thunderforest-outdoors-benchmark.md](maps/thunderforest-outdoors-benchmark.md).
It is **not** a migration: never the default, never in offline downloads,
never converted to PMTiles, never bulk-cached or proxied, and not a
dependency of anything else. It is selectable only when **both** the
benchmark flag (`VITE_ENABLE_MAP_BENCHMARK`) and the API key are present —
without the flag the whole selector is hidden; with the flag but without a
key the option shows as unavailable and no Thunderforest request is made.

Mechanics (`src/map/thunderforestLayer.mjs`, applied by `MapView.tsx`): a
MapLibre **raster source** on the official Thunderforest Map Tiles API
(`https://api.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=…`, 256 px,
source maxzoom 17), added lazily on the
**first explicit selection** — no tile is requested before that — and then
only toggled by layer visibility, so repeated switching never duplicates
sources, layers or listeners. The raster sits above the vector basemap and
the satellite layer but **below every route/GPS/hut overlay**; the vector
style underneath stays untouched (it reads the local/streamed PMTiles at
zero quota cost). Attribution (required): *Maps © Thunderforest, Data ©
OpenStreetMap contributors* — registered in `src/data/attribution.ts`,
rendered by the map control and, in key-configured builds, the credits
sheet. Guarded by `tests/thunderforest-layer.test.mjs` (key-gating, URL
template, no offline wiring, repository-wide literal-key scan).

### Configuration — local development

1. Copy `.env.example` to `.env.local` (git-ignored via `*.local` and the
   `.env*` rules; never commit a real env file) and set
   `VITE_THUNDERFOREST_API_KEY=<your key>` — a free key comes from the
   [Thunderforest dashboard](https://manage.thunderforest.com). The
   benchmark selector itself needs no flag in dev (`VITE_ENABLE_MAP_BENCHMARK`
   defaults to on for dev builds only).
2. `npm run dev` (Vite reads `.env.local` at startup; restart after edits).
3. Confirm it loaded: the Map screen's **Map comparison — temporary**
   dropdown shows **Thunderforest Outdoors — Online preview** as selectable.
   Without a key the option reads “(unavailable — no API key)”, a concise
   `console.info` note appears in dev builds only, and **no Thunderforest
   request is ever made** — everything else works normally.

### Configuration — GitHub Actions / Pages

1. Benchmark visibility (not sensitive): GitHub → repository **Settings →
   Secrets and variables → Actions → Variables → New repository variable**,
   name exactly `VITE_ENABLE_MAP_BENCHMARK`, value `true`. Without it,
   production builds show the normal map with no comparison selector.
2. API key (sensitive): same page → **Secrets → New repository secret**,
   name exactly `VITE_THUNDERFOREST_API_KEY`.
3. `deploy.yml` passes both as env vars to the `npm run build` step only.
   Both are optional — the build never fails over them.
4. A new deployment is required after changing either (push to `main` or
   run the *Deploy to GitHub Pages* workflow manually). To retire the
   benchmark: remove the variable (selector disappears), then rotate or
   delete the key in the Thunderforest dashboard.

### Security reality check

Environment-variable and GitHub-Secret injection keep the key **out of
tracked files, commit history, docs and prompts — nothing more**. Vite
inlines `VITE_*` values into the built JavaScript, so the deployed browser
app **exposes the key in its bundle and in every tile-request URL**; that is
unavoidable for a client-only static app, and Referer information may be
visible to Thunderforest. Treat the key as publicly visible once deployed.
Relevant controls, in order: use a free-tier key; monitor usage/quota in the
Thunderforest dashboard; keep the deployment temporary (the flag makes
turning it off a one-variable change); rotate or remove the key when the
benchmark work concludes. Thunderforest's public documentation describes
API keys plus IP/Referer/User-Agent association but does **not** clearly
document a user-configurable allowed-origin restriction — use an origin
allowlist only if the dashboard actually offers one. Do not paste the key
into issues, docs, screenshots or committed files.

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
- **Orientation policy (product decision)**: phones are **portrait-only**;
  tablets support portrait AND landscape; desktop windows are responsive.
  A phone-class landscape viewport (landscape aspect + coarse pointer +
  no hover + height < 500px — capability/space signals, never UA
  sniffing; classifier in `src/utils/orientationGuard.mjs`, fenced by
  `tests/orientation-guard.test.mjs`) gets the full-screen RotateGuard
  (`src/components/RotateGuard.tsx`): a top-layer modal `<dialog>` asking
  for portrait while the app shell is made `inert` — the React tree is
  NOT unmounted, so hash destination, screen state, GPS/live tracking
  and the MapLibre instance survive rotation, and focus returns to where
  it was when portrait comes back. Installed phone PWAs also attempt
  `screen.orientation.lock('portrait-primary')` once — progressive
  enhancement only (support varies; iOS has no lock()); **the guard, not
  the API call, is the canonical enforcement**. The manifest deliberately
  stays `orientation: 'any'`: it is one static manifest for all device
  classes, and `'portrait'` there would lock installed tablet PWAs out
  of landscape.
- **Shell**: the compact layout is the untouched mobile baseline — bottom
  tab bar, 560px column, measured `--app-height` sizing
  (`src/utils/viewportHeight.mjs`). The rail activates at ≥ 760px width
  **and ≥ 500px height**; the labelled sidebar at ≥ 1160px width and the
  same height gate. The height condition keeps short mouse-driven
  desktop windows on the compact layout and matches the RotateGuard's
  phone threshold — space-driven media conditions, never device/UA
  detection. Navigation is one component
  (TabBar) rendered twice by the shell: `tabbar--rail` before `<main>`
  (visible in medium/wide, so keyboard focus order matches the visual
  nav-left order) and `tabbar--bar` after `<main>` (compact, its
  production focus position). CSS displays exactly one; the hidden
  instance is `display:none` and out of layout, tab order and the
  accessibility tree. Styling lives in the "Adaptive shell" section at
  the end of `src/styles/global.css`.
- **Screens**: per-screen `screen--*` classes set intentional content
  widths inside the wider shell; at ≥ 900px width (same ≥ 500px height
  gate) selected screens use two-column compositions (Today, Map, Stages,
  Stops, Lists, Settings). Inside these grids, spacing belongs to the
  grid gap — the legacy `.card + .card` stacked margin is reset per grid
  wrapper. MapLibre resize is handled by MapView's own ResizeObserver.
  Two screens carry composition-specific behaviour:
  - **Map** (`.map-layout`): one map-dominant `3fr 2fr` grid — the
    complete map card left; the route selector and the combined
    summary+elevation card right. The canvas height derives from the
    measured viewport (`--app-height`) via `clamp()`, so the primary
    composition fits one screenful at common laptop sizes. On compact,
    the same DOM renders as plain stacked blocks — there is no separate
    elevation panel or Map/Elevation toggle anywhere.
  - **Map stop markers & preview popup**: every rendered waypoint maps to
    a Huts & Stations stop (`src/route/waypointStops.mjs`, fenced by
    `tests/map-stop-markers.test.mjs`), so each renders as a hut-badge
    marker button (44×44 hit area around a ~30px badge; DOM-built static
    SVG, names set via textContent — no innerHTML). Activation opens ONE
    anchored MapLibre `Popup`, reused across selections; its content is a
    React portal from MapView's own tree (`StopPreview` in MapScreen:
    short name, `collapsedFacilities` icons, important absences,
    chevron), so selections never re-create the map or the markers.
    Ownership: MapView owns marker/popup lifecycle, positioning, selected
    styling and close gestures — empty-map click, Escape, and
    re-activating the selected marker (a deliberate toggle-close); in
    fullscreen, Escape only exits fullscreen and the NEXT Escape closes
    the popup. MapScreen owns selection state, waypoint→stop resolution
    and popup content; App supplies the focused `onOpenStop` callback
    that routes to Huts & Stations with the existing one-shot
    `{ stopId }` navigation payload.
  - **Stops** (`.stops-detail`, set while a stop is open): the collapsed
    two-column grid becomes a clustered master-detail — collapsed stops
    stacked tightly in the left column, the open stop as a stable
    top-aligned right-hand detail card spanning every row, with a
    trailing `1fr` row absorbing its extra height so the collapsed list
    never gains artificial whitespace. Same DOM, order and accordion
    semantics as compact.
- **PWA**: the manifest is orientation-neutral (`orientation: 'any'`, see
  the orientation policy above for why); install/update flows, the
  offline app shell and the separate offline-map downloads are unchanged.
  Large offline assets are never auto-downloaded on a new device.

Mobile is the regression baseline: changes to compact behaviour (tab order,
labels, screen hierarchy, interaction patterns) must be deliberate,
documented decisions — not side effects of desktop work. Test compact
layouts at 320×568, 360×800 and 390×844 — plus phone-landscape 800×360,
844×390 and 932×430, which must show ONLY the rotate-to-portrait guard —
before merging layout changes.

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
