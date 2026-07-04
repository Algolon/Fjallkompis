# Layered offline map — foundation

Design + status for the **layered offline map** direction: a mutually-exclusive
**base map** plus independent **overlays**, each an optional, removable
download. This branch lands the *foundation* — the configuration model, the
offline-asset registry + safe download architecture, and a compact layer
control — **without** producing any large satellite or elevation binaries and
**without** shipping rendering code for assets that do not exist yet.

## What is implemented in this branch

| Area | Status |
|------|--------|
| Typed `MapConfig` model (base map + overlay flags) + local persistence | ✅ implemented |
| Reusable offline-asset **registry** (id, path, cacheName, version, size, attribution, kind, role, availability) | ✅ implemented |
| Generic offline **download / status / remove**, reused for every asset | ✅ implemented |
| **Safe download**: reject any non-PMTiles response; never store a corrupt entry | ✅ implemented + tested |
| Compact, collapsed-by-default **Layers** control on the Map screen | ✅ implemented |
| Settings **download cards**, incl. "Planned" assets with size + attribution | ✅ implemented |
| Topographic base map (the dependable fallback) | ✅ unchanged, still works offline |

## What is deliberately deferred (to the branch that introduces the data)

The Map control shows **only layers the user can actually use now**. Since no
optional asset has been produced, that is just the topographic base today.

| Deferred | Why |
|----------|-----|
| Satellite / contour / hillshade / label **MapLibre layer specs** | Untestable and unused until real tiles exist; tuned against actual data in that branch. |
| Multi-asset **layer reconciliation** (base-switch / overlay layer manager) | Only meaningful with ≥ 2 bases or an overlay; rebuilt when the second layer ships. |
| Satellite / contour **build scripts** | Cannot be exercised without GDAL/tippecanoe + multi-GB inputs; belong with asset production. The pipelines are documented below. |

Planned assets remain visible in **Settings** as "Planned" (scope, estimated
size, licence/attribution) and in the pipeline docs — so nothing is lost, but
no scaffolding is exposed on the Map screen.

## File structure (this branch)

```
src/map/
  mapConfig.mjs / .d.mts       # typed MapConfig model + normalisation (framework-free)
  mapConfigStore.ts            # localStorage persistence for map preferences
  assetRegistry.mjs / .d.mts   # offline-asset registry + manifest validator (framework-free)
  offlineAssets.ts             # URL + status/blob/remove + downloadAsset (thin)
  offlineDownload.mjs / .d.mts # fetch + validate + cache (injectable deps → unit-tested)
  pmtilesFormat.mjs / .d.mts   # PMTiles magic-byte detection (framework-free)
  offlineMap.ts                # topographic wrapper over offlineAssets (unchanged API)
  pmtilesProtocol.ts           # pmtiles:// protocol + per-asset source resolution
  mapStyle.ts                  # topographic style + route layers (unchanged shape)
src/hooks/useMapConfig.ts      # React state for base map + overlay toggles, persisted
src/components/
  MapLayerControl.tsx          # compact, collapsed Map-screen Layers disclosure
  OfflineAssetCard.tsx         # reusable Settings download card (any asset)
  OfflineMapCard.tsx           # topographic wrapper over OfflineAssetCard
tests/
  map-config.test.mjs          # config + registry + manifest invariants
  offline-download.test.mjs    # download-safety (reject non-PMTiles, no corrupt cache)
  fixtures/…                    # config + asset-manifest fixtures
docs/pipelines/                # satellite + contour build pipelines (planned)
```

## Runtime behaviour

- The topographic map renders exactly as before (route, day stages, hut markers
  and GPS all above the base imagery). No map-recreation behaviour changed.
- The **Layers** control is collapsed by default (a single row showing the
  active base). Expanding shows only available layers — currently the
  topographic base. It sits below the map and never obscures the route, hut
  markers, GPS, attribution or MapLibre controls.
- Map preferences persist to `localStorage` (`fjallkompis:mapConfig`),
  independent of the exported trip-data blob.

## Offline / cache design

- Topographic keeps its existing cache **`fjallkompis-offline-map-v1`** — any
  copy a user already downloaded keeps working.
- The generic download manager (`offlineAssets` → `offlineDownload`) stores each
  archive as one full `200` response in the asset's own dedicated cache, read
  back through a blob-backed PMTiles source. **No** archive is in the Workbox
  precache (`globPatterns` excludes `.pmtiles`).
- **Safe downloads:** `downloadPmtiles` validates the PMTiles magic bytes before
  writing to the cache, so an SPA/HTML fallback, a JSON error page, or any other
  non-tile response is rejected — and, because validation precedes the cache
  write, a failed download never overwrites a previously-valid copy. Covered by
  `tests/offline-download.test.mjs`.

## Attribution requirements

| Asset | Required attribution | Status |
|-------|----------------------|--------|
| Topographic | © OpenStreetMap contributors · Protomaps | live |
| Satellite (Sentinel-2) | Contains modified Copernicus Sentinel-2 data `<year>` | planned |
| Contours / Hillshade (Copernicus DEM) | Contains modified Copernicus DEM data © ESA | planned |
| Labels (OSM) | © OpenStreetMap contributors | planned |

## Measured bundle impact (foundation code only, no binaries)

| Artifact | Baseline | With foundation | Δ |
|----------|---------:|----------------:|----:|
| Main JS (raw) | 1,536,809 B | 1,543,984 B | +7,175 B |
| Main JS (gzip) | 443,085 B | 445,129 B | +2,044 B |
| CSS (raw) | 92,370 B | 94,324 B | +1,954 B |
| SW precache entries | 24 (app shell) | 24 (app shell) | 0 |
| Precached `.pmtiles` | 0 | 0 | 0 |

## Storage estimates (still need a real extraction)

Planning estimates only (`estimatedSize: true` in the registry) for the corridor
bbox `[18.02, 67.76] – [19.23, 68.44]` (~50 × 75 km) at z ≤ 14:

| Asset | Rough estimate |
|-------|---------------:|
| Satellite (JPEG raster) | ~80–160 MB |
| Contours (vector) | ~8–15 MB |
| Hillshade (raster-dem) | ~30–50 MB |
| Labels (vector + glyphs) | ~1–3 MB |

Replace `expectedSizeBytes` with the measured size and set `available: true`
once each archive is produced.

## Next step — the first satellite PMTiles

1. Produce a cropped, natural-colour Sentinel-2 raster PMTiles for the corridor
   (see `docs/pipelines/satellite-pmtiles.md`) **out of tree** — do not commit
   the binary.
2. Add the satellite MapLibre layer spec + base-switch handling (the deferred
   rendering) in that branch, and set `OFFLINE_ASSETS.satellite.available = true`
   with the measured `expectedSizeBytes`.
3. Add a `.pmtiles`-scoped Workbox range rule for `fjallkompis-satellite-v1`.
4. The Layers control then automatically offers Satellite as a base; verify the
   route/hut/GPS layers stay above it, attribution shows, and removal reclaims
   the cache — online and offline.
