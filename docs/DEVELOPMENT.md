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
  (`public/maps/kungsleden.pmtiles`, ~5.3 MB, zoom ≤ 14), styled fully offline
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
- **userBounds** = route + `userBufferKm` (12 km) — the **interaction
  bounds**: the area of regular panning/zooming (`maxBounds` in MapView).
  Selected so the full-route "Fit route" view stays inside the bounds on
  every supported portrait viewport. Viewports wider than the bounds'
  aspect — the square 1:1 desktop/tablet map card and fullscreen landscape
  monitors — additionally get temporary, deterministic **overview bounds**
  (an east/west widening active only below that viewport's overview zoom
  threshold, clamped per-edge to the physical z7 terrain envelope — see
  src/map/cameraBounds.mjs for the full three-level model). Recalculated
  for the square card (2026-07-10): across its supported 300–838px edges
  the full-route fit spans ~179–220 km east/west against ~150.6 km of
  user bounds, an exact fit that always sits inside the ~309 km envelope
  with headroom (pinned by tests/camera-bounds.test.mjs — the smallest
  300px square is the tightest case);
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

Viewport proportions (global.css): desktop/tablet-landscape (≥ 900×700)
`.map-layout` maps are square 1:1 — the map card is exactly the grid
column (`min(--map-edge, 56%)`), so the card and its action rows are
precisely as wide as the map and the route-information column takes all
remaining width (screen capped at 1400px for readable line lengths). The
governing contract is the VERTICAL FIT: `--map-edge = max(300px,
app-height − 132px − controls − banner/note allowances)` — the square
consumes ALL the height left over after reserving measured space for the
header chrome, both action rows, any status banners (`:has()`-gated
allowances; banners render compact on desktop), the tracking hint, and a
deliberate ~20px remainder below the card (= the Map screen's bottom
padding), so the complete card always fits one viewport without page
scrolling and without a dead band beneath it. The row/banner reserves
are STATE-AWARE LEAN TIERS: for each combination of banner/hint present
in the card there is a viewport height (gates at 700/750/770/820/890px)
above which the lean reserve (single-line rows, two-line banner) still
yields a ≥ ~440px square — wide enough that nothing can wrap — so the
reserve is exact and the card really ends ~20px above the viewport;
below its gate a state keeps the wrapped worst-case reserve.
Width is the only ceiling: the grid track is `min(--map-edge, 62%,
100% − 314px)`, so the information column keeps ≥ 38% of the layout
(~500px at the 1400px screen cap) and never drops under 300px. Landscape
viewports shorter than 700px fall back to the compact stacked
composition instead of a partially hidden desktop layout.
The full-route Fit-route view fills the padded square height with the
route at ≈ 45% of the width (comfortable east/west terrain context via
the overview bounds above). Mobile portrait
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
  z7–12, ~18 MB;
- `public/maps/kungsleden-contours.pmtiles` — contour vectors (layer
  `contours`, property `elev`), z9–13, ~9 MB. Since the 0.17.0
  earlier‑contours iteration (terrain-data-v3), 100 m index lines are tiled
  from z9 and the full 20 m set from z12, so the style can fade the index
  tier in from z9.5 and the 20 m tier from z11.5 (MapLibre never underzooms
  vector tiles — the tagging in `scripts/build-terrain-map.sh` and the
  `lt_contour*` ramps in `libertyTopoLayers.mjs` must stay in sync). An
  older v2 archive (tiles z11–13) still renders with the same style; the
  contours then simply appear from z11/z13 as before.

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
2024** imagery, bounded to the route corridor. The archive is **~59 MB and is
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
   `satellite-data-v4` with asset name `kungsleden-satellite.pmtiles`.
2. Update the pinned **tag, SHA‑256 and byte size** in
   `.github/workflows/deploy.yml` (they gate the deployment — a mismatch fails
   the deploy rather than shipping unverified bytes).
3. Merge; the next Pages deploy serves the new file. Users who downloaded the
   old archive re‑download from Settings when they choose to.

### Regenerating the archive (new imagery → satellite-data-v4, …)

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
`release_tag` like `satellite-data-v4` — publishes the versioned Release that
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

## Map style (production)

The 0.8.0 three-way comparison and the 0.12.0 Thunderforest Outdoors
benchmark are **concluded and retired (v0.17.0)**: the app ships exactly one
terrain basemap style, **Liberty Topo — Nordic**, built by
`libertyTopoLayers()` + `NORDIC_TOPO_PALETTE` in
`src/map/libertyTopoLayers.mjs` (palette-driven, so the look stays centrally
adjustable) and assembled into the offline MapLibre style by
`src/map/mapStyle.ts`. The comparison selector, the style registry, the
*Current*/*Liberty Topo* runtime styles, the Thunderforest online preview
and the `VITE_ENABLE_MAP_BENCHMARK`/`VITE_THUNDERFOREST_API_KEY` build
inputs were all removed; the repository variable can be deleted and the
Thunderforest key rotated/removed in its dashboard. The evaluation record
lives in [map-style-comparison.md](map-style-comparison.md); the measured
source-layer audit and translation plan (still the design input for terrain
work) live in
[maps/thunderforest-outdoors-benchmark.md](maps/thunderforest-outdoors-benchmark.md).
Guarded by `tests/map-styles.test.mjs` (offline invariants, the Nordic
terrain-hierarchy relationships, contour ramps, retirement scan, licence
attribution).

In dev builds `window.__fjallkompisMap` exposes the MapLibre map so the
benchmark cameras (benchmark doc §2) can be set exactly from the console,
e.g. `__fjallkompisMap.jumpTo({ center: [18.2823, 67.9462], zoom: 13.4 })`.

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

Personal data stays separate: per-stop **trip notes** and the **packing
list** live in one versioned `localStorage` blob
(`src/utils/stateMigration.mjs`, schema v3; defensive v1/v2 migration covered
by `tests/state-migration.test.mjs` — v3 drops the archived Daily checklist's
data while preserving everything else, see
[archived-features/daily-checklist.md](archived-features/daily-checklist.md)).

## Stage day-guide data

The Stages screen expands each day into a **curated editorial guide**
(`src/data/stageGuides.mjs`): overview, trail character, highlights and
stage-specific planning notes. Like the stops snapshot it is deliberately
static and hedged — "typically", "can be", "verify locally" — because it
describes the route, **not live conditions**. Three layers must never blur:

- **GPX-derived statistics** (distance, ascent/descent, elevation range)
  come from `src/route/routeData` and are never restated or overridden by
  guide text;
- **personal time estimates** (`estimatedHours` in `src/data/stages.ts`)
  are labelled as estimates in the UI;
- **editorial guidance** carries `sourceIds` into the `GUIDE_SOURCES`
  registry (official STF, Länsstyrelsen Norrbotten/Naturkartan and operator
  pages) plus a `lastVerified` ISO date per stage.

`tests/stage-guides.test.mjs` pins all of this: every stage has a guide,
every guide resolves its sources and verification date, and stage statistics
keep coming from the generated route data. Update the module after
re-verifying against the linked sources and bump `lastVerified`.

## Shop & transport info data

The Lists screen's **Shops** and **Transport** sections (peers of the packing
list) are static, read-only reference datasets — the same discipline as the
stops snapshot and stage guides: nothing is scraped at runtime, none of it is
user-editable, and it all works offline once installed. There is **no**
persisted-state or routing change; the schema v3 blob and existing user data
are untouched.

**Authority split (important):** *Stops* owns location-specific shop
availability — whether a given route stop has a shop, and its "No shop"
warning. *Shops* owns shop-TYPE and assortment information and never re-lists
the route locations. A Stop's Shop chip deep-links to the matching shop *type*
(`shopTypeForStop`), not a location card.

- **Data lives in plain `.mjs` (typed by a sibling `.d.mts`)** so `node --test`
  imports it directly and the app imports it through Vite the same way (the
  `packingSeed.mjs` / `stageGuides.mjs` pattern):
  - `src/data/shops.mjs` — the underlying route shop locations with their STF
    classification (`station | large | small | none | local`), the unified
    **2025** Small/Large product catalogue (each product a per-size listing —
    the source's **bold**=`standard` vs *italic*=`extra`, since availability
    and price can differ between the two lists, e.g. 500 g pasta), and the
    Shops-screen structure: the three shop-type categories (`SHOP_CATEGORIES`
    — Large / Small / **Full-service**), `shopTypeForStop()` and
    `FULL_SERVICE_SHOPS`. **Full-service** is a deliberate combined category
    for the current Abisko–Nikkaluokta scope (the Abisko/Kebnekaise STF station
    shops + the independent Nikkaluokta shop): it has *no* standard assortment
    or reference-price list and does not claim one formal STF classification.
    Future route expansion may justify splitting it into precise
    tourist-station / mountain-station / independent-local types — a scope
    limitation, not a defect.
  - `src/data/transport.mjs` — the route-relevant services grouped by journey
    context, plus `timetableStatus()` / `scheduleRunsOn()` — the pure validity
    logic (upcoming / valid / **expired** / live / undated).
- **Types** live in `src/types/index.ts` (`ShopLocation`, `AssortmentProduct`,
  `TransportEntry`, `SourceMeta`, …). `SourceMeta` is the shared provenance
  shape: title, url, publisher, source year, validity range, `lastVerified`,
  and `kind: 'static' | 'live'`.
- **Why timetable data is static and validity-bound.** A hut-to-hut app must
  work with no signal, so timetables are bundled snapshots with an explicit
  validity window. When today is outside that window the card shows a visible
  *“Timetable expired — check source”* state — old data is never silently
  hidden, and the official source is always one tap away.
- **Why the train uses live links, not a hard-coded time.** The Kiruna–Abisko
  train has no fixed seasonal timetable equivalent to the bus, so it is modelled
  as a `live` alternative (`kind: 'live'`, no stored departures) with SJ planner
  and traffic-information links. The app never presents static data as live, and
  never states a connection as guaranteed.
- **Why 2025 shop prices are reference-only.** STF's downloadable price lists
  are labelled 2025. They are shown as `SHOP_PRICE_REFERENCE_YEAR` (2025)
  *reference* prices — never as guaranteed 2026 prices.
- **Updating the data.** Re-verify against the sources, edit the `.mjs`
  dataset, and bump each entry's `lastVerified`. Presentation
  (`src/components/ShopInfoView.tsx`, `TransportView.tsx`,
  `ListDisclosure.tsx`) is deliberately separate from the data, so a new season
  usually means editing only the datasets. Tests in `tests/shop-info.test.mjs`
  and `tests/transport.test.mjs` lock the classifications, standard/extra
  semantics, price-reference labelling and validity/expired logic.
- **Sources** (checked 2026-07-12): STF mountain shops overview and the Small /
  Large 2025 price-list PDFs; Länstrafiken line 91 (17 Aug – 20 Sep 2026);
  STF mountain boats + Enoks (Láddjujávri); Nikkaluoktaexpressen
  (10 Aug – 20 Sep 2026); SJ (train, live). All are listed in the in-app
  *Data sources & credits* sheet (`src/data/attribution.ts`).

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173/Fjallkompis/
npm test           # GPX pipeline validation
npm run typecheck  # TypeScript project references
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
- **Pull requests:** `.github/workflows/pr-ci.yml` runs `npm ci`,
  `npm test`, `npm run typecheck` and `npm run build` without fetching
  release-hosted map archives or deploying Pages.
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
│  ├─ state-migration.test.mjs  # localStorage schema migrations (v1 → v3)
│  ├─ shop-info.test.mjs        # shop classifications + assortment semantics
│  ├─ shops-by-type.test.mjs    # 3 shop-type categories + stop→type deep links
│  ├─ transport.test.mjs        # timetable validity / expired-state logic
│  ├─ stage-guides.test.mjs     # day-guide content/sources integrity
│  ├─ checklist-removal.test.mjs # archived Daily checklist stays absent
│  └─ version-consistency.test.mjs   # the guard passes AND fails correctly
├─ public/
│  ├─ gpx/…                     # source GPX (verified route)
│  ├─ images/stops/             # optional licensed stop photos (see README there)
│  └─ maps/kungsleden.pmtiles   # bounded offline basemap (~5.3 MB)
└─ src/
   ├─ generated/                # build-time route JSON (committed)
   ├─ route/                    # typed ParsedRoute model + hut↔waypoint map
   ├─ map/                      # offline-map cache, pmtiles protocol, style
   ├─ components/               # MapView, ElevationProfile, OfflineMapCard, …
   ├─ data/                     # stages + day guides + stops snapshot + packing
   │                            #   seed + shops.mjs + transport.mjs (Lists)
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
