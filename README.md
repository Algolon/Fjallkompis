# Fjällkompis 🏔️

An offline-first, mobile-first **trail companion PWA** for a solo hut-to-hut hike
on the Kungsleden (Abisko → Nikkaluokta). A Today homepage, a curated stops
guide, daily + packing lists, route awareness, elevation profiles, and
journaling — all stored locally on your device.

> ⚠️ **Prototype. Not for primary navigation.** Always carry a proper map,
> compass, and an offline navigation/safety device.

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

In the app, **Settings → Offline maps & terrain** downloads the file into a
dedicated Cache Storage cache (separate from the app shell). The map reads it
through a blob-backed PMTiles source (works without a service worker), and the
service worker additionally serves byte-range requests from the cached full
response via Workbox `RangeRequestsPlugin`. Without the download, the basemap
streams online via HTTP range requests; with no network and no download, the
route still renders on a clearly-marked placeholder background.

### Layered offline map (foundation)

The map is built from a **mutually-exclusive base map** (topographic ↔
satellite) plus **independent overlays** (hillshade, contours, labels), each an
optional, removable PMTiles download registered in a reusable **offline-asset
registry** (`src/map/assetRegistry.mjs`). A Map-screen layer control switches
base maps and toggles overlays without recreating the MapLibre map; route, hut
and GPS layers always stay above all imagery. Topographic remains the required
fallback, and optional assets never enlarge the app or the precache.

Satellite and contour build pipelines (Sentinel-2 and Copernicus DEM GLO-30,
both redistributable with attribution) are scripted in
`scripts/build-satellite-pmtiles.sh` and `scripts/build-contours-pmtiles.sh`.
See **`docs/layered-offline-map.md`** for the full design, cache model,
attribution, bundle impact and storage estimates. No large satellite/elevation
binaries are committed — produce them out of tree.

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
├─ scripts/
│  ├─ generate-route-data.mjs   # GPX → JSON preprocessing + validation
│  ├─ extract-offline-map.sh    # bounded topographic PMTiles extraction
│  ├─ build-satellite-pmtiles.sh # Sentinel-2 → raster PMTiles (optional base)
│  └─ build-contours-pmtiles.sh  # Copernicus DEM → contour PMTiles (overlay)
├─ docs/
│  ├─ layered-offline-map.md    # layered-map design + status report
│  └─ pipelines/                # satellite + contour build pipelines
├─ tests/
│  ├─ route-data.test.mjs       # deterministic pipeline validation
│  ├─ state-migration.test.mjs  # localStorage schema v1 → v2 migration
│  ├─ map-config.test.mjs       # map config + asset registry invariants
│  └─ fixtures/                 # config + asset-manifest test fixtures
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
- "Distance to next hut" is straight-line, not along-route progress.
- Stage time estimates are personal guesses; the GPX has no time data.

## Next iteration

1. Route progress: project the GPS fix onto the stage line for "km done / km
   left" instead of straight-line distance.
2. Local glyphs for general map labels (self-hosted PBF fonts), contours or
   hillshade from a terrain PMTiles source.
3. Installable-PWA polish: custom install prompt, SW-update toast, richer
   offline states.
4. Code-split MapLibre behind a lazy route to trim the initial bundle.
