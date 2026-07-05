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
2024** imagery, bounded to the route corridor. The archive is **~42 MB, so it is
NOT committed to the repo** — it is hosted off‑repo as a **versioned GitHub
Release asset** and the app streams or downloads it from there:

```
https://github.com/Algolon/Fjallkompis/releases/download/satellite-data-v1/kungsleden-satellite.pmtiles
```

Resolution order in the app (`src/map/pmtilesProtocol.ts`): user‑downloaded
Cache‑Storage blob → the hosted Release asset (streamed online) → disabled
toggle. Once downloaded in **Settings → Satellite imagery** it works fully
offline, independently of the vector basemap. The Terrain/vector basemap is
unchanged and still same‑origin.

Attribution shown on the map (keep it):

> Sentinel‑2 cloudless — s2maps.eu by EOX IT Services GmbH
> (Contains modified Copernicus Sentinel data 2024)

### Configuring the archive URL

The production URL is injected at build time via **`VITE_SATELLITE_URL`** (see
`.github/workflows/deploy.yml`). When unset (local dev), the app falls back to
the same‑origin `maps/kungsleden-satellite.pmtiles`; a *missing* local file is
correctly detected as absent (HTML/404 is never mistaken for an archive) and the
toggle stays disabled. To point at a new release, bump the tag in `deploy.yml`
(and any `.env`).

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
data (maintenance)* → *Run workflow*). It runs both scripts on a runner,
verifies the archive, uploads it as an artifact, and — with `publish_release:
true` and a `release_tag` — publishes the versioned Release asset and CORS/range‑
checks it. Use a **new tag** (`satellite-data-v2`) for new imagery so caching and
`VITE_SATELLITE_URL` stay predictable, then bump the tag in `deploy.yml`.

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

Then `VITE_SATELLITE_URL=<release-url> npm run build && npm run preview`, open the
Map screen, and switch to **Satellite**; **Settings → Satellite imagery**
downloads it for offline use.

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
│  └─ extract-offline-map.sh    # bounded PMTiles extraction (pmtiles CLI)
├─ tests/
│  ├─ route-data.test.mjs       # deterministic pipeline validation
│  └─ state-migration.test.mjs  # localStorage schema v1 → v2 migration
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
