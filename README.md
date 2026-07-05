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
map. It is fully offline: tiles come from a raster PMTiles archive at
`public/maps/kungsleden-satellite.pmtiles`, resolved exactly like the vector
basemap (downloaded blob → hosted file → unavailable). When no archive exists
the Satellite toggle is disabled — **the archive is not committed; you build it
from your own imagery** with the pipeline below.

### Source imagery

- **Recommended source:** [Copernicus Sentinel-2](https://dataspace.copernicus.eu/)
  Level‑2A (surface reflectance) or an equivalent Sentinel‑2 mosaic — free and
  openly licensed. Do **not** scrape tiles from Google, Bing, Esri or Mapbox.
- **Recommended visual:** true colour — **red = B04, green = B03, blue = B02**.
- **Choosing a scene:** pick a **low-cloud, summer** acquisition (roughly
  June–August; the snow-free window) whose footprint covers **Abisko to
  Nikkaluokta**. In [Copernicus Browser](https://browser.dataspace.copernicus.eu/)
  search that area and date range, sort by cloud cover, and pick a clear tile
  (Sentinel‑2 tiles `33WXP` / `34WDA` cover the route). The build script crops
  to the route bounds, so the scene only needs to *contain* the corridor.
- **Export:** use the browser's download/analysis export to get a
  **georeferenced RGB GeoTIFF** (True Color, TIFF, with the CRS preserved — UTM
  33N/34N or EPSG:4326 are all fine; the script reprojects). Any legally usable
  georeferenced RGB GeoTIFF works.
- Put the file anywhere; a git-ignored spot is `data/source-imagery/`. **The
  source GeoTIFF is never committed.**

### Why max zoom 13

Sentinel‑2 true colour is ~10 m/px. In Web Mercator, zoom **13** is ≈19 m/px at
the equator and finer at this latitude (~7 m/px near 68° N) — the closest zoom
to the native resolution. Going higher only upsamples pixels and inflates the
file, so 13 is the default cap; MapLibre over-zooms beyond it (up to the map's
`maxZoom` 17) so you can still pinch in. The default pyramid is ~z6–13.

### Required tools

- **GDAL** ≥ 3.6 — `gdalinfo`, `gdalwarp`, `gdal_translate`, `gdaladdo`
  (`apt-get install gdal-bin`, `brew install gdal`, or `conda install -c conda-forge gdal`).
- **pmtiles CLI** — [go-pmtiles](https://github.com/protomaps/go-pmtiles/releases)
  (single static binary; put it on `PATH` or set `PMTILES_BIN`).
- **Node** (already required for the app) — used only to read the route bounds.

### Build the archive

```bash
npm run generate:route            # ensure src/generated/kungsleden-route.json exists
npm run generate:map:satellite -- data/source-imagery/your-sentinel2.tif
# options (env): MAXZOOM=13 MINZOOM=6 TILE_FORMAT=WEBP QUALITY=80 DEBUG=1
```

The script reads the crop box from `mapCutoutBounds` in the generated route
JSON (route bounds + ~9 km buffer — never hard-coded), reprojects to
EPSG:3857, tiles it as 256 px WEBP (matching `SATELLITE_TILE_SIZE`), builds the
zoom pyramid, converts to PMTiles, and runs `pmtiles verify`. Output:
**`public/maps/kungsleden-satellite.pmtiles`**.

### Verify manually

```bash
pmtiles verify public/maps/kungsleden-satellite.pmtiles
pmtiles show   public/maps/kungsleden-satellite.pmtiles   # bounds, min/max zoom, tile type
```

Then `npm run build && npm run preview`, open the Map screen, and switch to
**Satellite**. **Settings → Satellite imagery** downloads it for offline use
(independently of the vector map). Attribution shown on the map: *contains
modified Copernicus Sentinel data* — keep this credit for any Sentinel‑2 source
(update `SATELLITE_ATTRIBUTION` in `src/map/mapStyle.ts` for other providers).

### Regenerating & repository size

Re-run the command with a newer/clearer scene to replace the archive. A bounded
z6–13 archive is typically well under GitHub's 100 MB per-file limit and can be
committed like `kungsleden.pmtiles`. **If your real archive is large enough to
bloat the repo** (approaching the 100 MB limit or heavy git history), don't
commit it — publish it as a **GitHub Release asset** or on object storage
instead, and host it at the same `maps/kungsleden-satellite.pmtiles` path (or
wire a configurable URL) so the in-app offline download keeps working. Check the
size (`ls -lh public/maps/kungsleden-satellite.pmtiles`) before committing.

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
