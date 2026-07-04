# Layered offline map — foundation

This document is the design + status report for the **layered offline map**
direction. It supersedes the earlier "enhanced offline map" note: instead of a
single bundled basemap, the map is composed from a **mutually-exclusive base
map** plus **independent overlays**, each an optional, removable download.

> Scope of the foundation branch: architecture, typed models, the Map-screen
> layer control, an offline-asset registry + download model, generalised
> offline plumbing, build **scripts/scaffolding**, docs and a small test
> fixture. **No large satellite/elevation binaries are produced or committed
> here.**

## Layer model

| Group | Layer | Kind | Ships now? |
|-------|-------|------|-----------|
| Base (exclusive) | **Topographic** — bounded OSM/Protomaps vector | vector PMTiles | ✅ dependable fallback |
| Base (exclusive) | **Satellite** — cloud-free Sentinel-2 natural colour | raster PMTiles | ⛔ optional download (pipeline documented) |
| Overlay | **Hillshade / relief** — Copernicus DEM | raster-dem PMTiles | ⛔ optional |
| Overlay | **Contours** — Copernicus DEM, minor + index | vector PMTiles | ⛔ optional |
| Overlay | **Labels** — general place names (needs a glyph pack) | vector PMTiles | ⛔ optional |
| App (always on) | route overview, day stages, huts/waypoints, GPS + projected progress | GeoJSON / HTML markers | ✅ always above all imagery |

The **topographic** base is the only required asset and always works offline
once downloaded (or streams online, or falls back to a marked placeholder).
Satellite and terrain are optional and never enlarge the core app or the
service-worker precache.

## Proposed / actual file structure

```
scripts/
  build-satellite-pmtiles.sh   # Sentinel-2 → cropped natural-colour JPEG raster PMTiles + manifest
  build-contours-pmtiles.sh    # Copernicus DEM GLO-30 → minor/index contour vector PMTiles + manifest
docs/
  layered-offline-map.md       # this document
  pipelines/
    satellite-pmtiles.md       # detailed satellite pipeline
    contours-pmtiles.md        # detailed contour pipeline
src/map/
  mapConfig.mjs / .d.mts       # typed MapConfig model + normalisation (framework-free)
  mapConfigStore.ts            # localStorage persistence for map preferences
  assetRegistry.mjs / .d.mts   # reusable offline-asset registry + manifest validator (framework-free)
  offlineAssets.ts             # generic download/status/remove over Cache Storage (any asset)
  offlineMap.ts                # thin topographic wrapper over offlineAssets (unchanged public API)
  pmtilesProtocol.ts           # pmtiles:// protocol + per-asset source resolution
  mapStyle.ts                  # base style + base/overlay layer specs + attributions
  layerManager.ts              # reconciles base + overlays on the live map (no recreation)
src/hooks/
  useMapConfig.ts              # React state for base map + overlay toggles, persisted
src/components/
  MapLayerControl.tsx          # compact Map-screen base/overlay control
  OfflineAssetCard.tsx         # reusable Settings download card (any asset)
  OfflineMapCard.tsx           # topographic wrapper over OfflineAssetCard
tests/
  map-config.test.mjs          # config + registry + manifest invariants
  fixtures/map-config/*.json    # valid / partial / corrupt persisted configs
  fixtures/asset-manifest.sample.json  # sample pipeline sidecar
public/maps/
  kungsleden.pmtiles           # topographic (committed, ~3.5 MB)
  kungsleden-satellite.pmtiles # produced out-of-tree, NOT committed here
  kungsleden-*.pmtiles.json    # per-asset manifest sidecars (produced with each archive)
```

## Typed configuration model

```ts
type BaseMapId = 'topographic' | 'satellite';
interface MapConfig {
  baseMap: BaseMapId;      // mutually exclusive
  contoursEnabled: boolean;
  hillshadeEnabled: boolean;
  labelsEnabled: boolean;
}
```

`normalizeMapConfig()` coerces any persisted blob to a valid config (unknown
base map / non-boolean flags → topographic + overlays off) and never throws.

## Offline-asset registry & download model

Each downloadable archive is one `OfflineAsset` descriptor with: `id`, `role`
(base|overlay), `label`, `description`, `path`, **`cacheName`** (a dedicated
Cache Storage cache), **`version`**, **`expectedSizeBytes`** (+`estimatedSize`
flag), **`attribution`**, `kind`, `required`, `available`. The generic manager
(`offlineAssets.ts`) implements **download / status / remove** for any asset;
`offlineMap.ts` is now a thin topographic wrapper so nothing else changed.

Each build script also emits an **asset-manifest sidecar** (`<archive>.json`)
recording `sourceDate`, `attribution`, `bbox`, measured `sizeBytes` and
`tileFormat`; `validateAssetManifest()` checks its shape (covered by the tests).

## Expected runtime behaviour

- The MapLibre map is created **once** from a placeholder-only style. Base maps
  and overlays are attached/removed imperatively by `layerManager.ts`, so
  switching base map or toggling an overlay **never recreates the map**.
- Every base/overlay layer is inserted **below** `route-overview`, so the
  route, day stages, hut markers and GPS/progress layers always stay on top of
  all map imagery.
- Reconciliation is incremental & idempotent — unchanged layers are left alone
  (no tile refetch / flashes).
- An overlay that is enabled but **not downloaded / not yet produced** renders
  nothing; the layer control shows a clear *Not yet available* / *Download in
  Settings* state, and the base falls back gracefully.
- Map preferences persist to `localStorage` (`fjallkompis:mapConfig`),
  independent of the exported trip-data blob.

## Offline / cache design

- Topographic keeps its existing cache **`fjallkompis-offline-map-v1`** — any
  copy a user already downloaded keeps working.
- Every other asset uses its **own** dedicated cache (`fjallkompis-satellite-v1`,
  `…-contours-v1`, `…-hillshade-v1`, `…-labels-v1`), stored as a single full
  `200` response and read directly via a blob-backed PMTiles source (works with
  or without a service worker).
- **None** of these archives are in the Workbox precache (`globPatterns`
  excludes `.pmtiles`); the SW's `.pmtiles` range rule is the belt-and-braces
  path only. Adding a per-asset SW range rule is a one-line follow-up when each
  asset actually ships.

## Attribution requirements

| Asset | Required attribution |
|-------|----------------------|
| Topographic | © OpenStreetMap contributors · Protomaps |
| Satellite (Sentinel-2) | Contains modified Copernicus Sentinel-2 data `<year>` |
| Contours / Hillshade (Copernicus DEM) | Contains modified Copernicus DEM data © ESA |
| Labels (OSM) | © OpenStreetMap contributors |

Attribution strings live on each registry descriptor and are set on the
MapLibre source, so they appear in the map's attribution control automatically.

## Measured bundle impact

Foundation code only (no binaries), production build:

| Artifact | Baseline | With foundation | Δ |
|----------|---------:|----------------:|----:|
| Main JS (raw) | 1,536,809 B | 1,546,482 B | +9,673 B |
| Main JS (gzip) | 443,085 B | 445,774 B | +2,689 B |
| CSS (raw) | 92,370 B | 94,165 B | +1,795 B |
| SW precache entries | 24 (app shell) | 24 (app shell) | 0 |
| Precached `.pmtiles` | 0 | 0 | 0 |

The precache is unchanged and still contains **no** map binaries.

## Storage estimates (need a real extraction)

These are **planning estimates** in the registry (`estimatedSize: true`) until a
real extraction measures them. Corridor ≈ bbox `[18.02, 67.76] – [19.23, 68.44]`
(~50 × 75 km) at z≤14:

| Asset | Rough estimate | Notes |
|-------|---------------:|-------|
| Satellite (JPEG raster) | ~80–160 MB | dominated by z13–14; quality 75–85 |
| Contours (vector) | ~8–15 MB | 20 m interval, simplified by zoom |
| Hillshade (raster-dem) | ~30–50 MB | terrain-RGB, z≤13 usually enough |
| Labels (vector + glyphs) | ~1–3 MB | small; glyph pack extra |

Replace `expectedSizeBytes` with the measured size and set `available: true`
once each archive is produced.

## Next step — produce & test the first satellite PMTiles

1. Fetch a cloud-free summer **Sentinel-2** natural-colour source for the
   corridor (bands B04/B03/B02, or a cloudless mosaic tile).
2. Run `scripts/build-satellite-pmtiles.sh --input … --date YYYY-MM-DD`
   → `public/maps/kungsleden-satellite.pmtiles` + `.json` sidecar (out of tree
   first; verify size before deciding whether to host or ship it).
3. Set `OFFLINE_ASSETS.satellite.expectedSizeBytes` to the measured size and
   `available: true`; add a `.pmtiles`-scoped SW range rule for its cache.
4. In the app: Settings → download **Satellite**, then Map → switch base to
   **Satellite**; confirm route/huts/GPS stay on top, attribution shows, and
   removal reclaims the cache. Go offline and re-verify.

See `docs/pipelines/satellite-pmtiles.md` and
`docs/pipelines/contours-pmtiles.md` for the detailed commands.
