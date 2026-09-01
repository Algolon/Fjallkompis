# Hybrid satellite archive (Sentinel z7–13 + Lantmäteriet z14–15) — rollout

**Status (2026-09-01): pipeline implemented and tested end-to-end with the
SENTINEL-FALLBACK composition (owner decision, 2026-09-01); the production
build is ready to run and needs only `LM_USERNAME`/`LM_PASSWORD` in the
environment.** Nothing in the app changed behaviour yet: the shipped archive
is still all-Sentinel `satellite-data-v4`, and every new contract is fenced
to stay inert until the catalog revision flips.

## What was built

One archive, one optional download, two imagery sources:

| Zooms | Source | Extent |
| --- | --- | --- |
| z7–13 | Sentinel-2 Cloudless 2024 (EOX) | complete z7 overview footprint (5,461 tiles) |
| z14–15 | Sentinel-2 fallback + Lantmäteriet Ortofoto J6 2024 (0.4 m RGB) composited above it | `mapCutoutBounds` tile-aligned at z14 (6,693 + 26,772 tiles, complete) |

Detail-corridor composition (raster production, never runtime): Sentinel-2
is warped to the exact z15 target grid first — the complete underlying
fallback, its containment of the corridor asserted — then the Lantmäteriet
`/vsicurl/` VRT is warped INTO the same raster in GDAL update mode,
restricted by the cataloged-coverage cutline and by the products' declared
unified 0,0,0 no-data (`UNIFIED_SRC_NODATA`). Source priority is therefore
the orthophoto validity mask, applied as a hard per-pixel decision: valid
orthophoto pixel → Lantmäteriet; anything else → Sentinel. No `-cblend`, no
feathering — the visible quality seam at the flight boundary is the honest
rendering. Before/after probe points (derived from the same catalog data)
prove on the real raster that gap pixels keep their Sentinel values,
orthophoto pixels are actually replaced, and nothing is no-data black.

Pipeline: `scripts/prepare-lantmateriet-orthophoto.sh` (STAC acquisition —
anonymous metadata, pagination + de-dup + contract validation +
orthophoto/fallback coverage statistics + RGB-only `/vsicurl/` VRT + WGS84
coverage cutline + probe points; ~94 GB of native COGs is never downloaded)
→ `scripts/build-satellite-map.sh` (Sentinel pyramid as before; corridor
composited as above from COG internal overviews at ~1.6 m; mixed pyramid
merged at the MBTiles stage; 1.9 GiB release-asset size gate with a
detail-quality ladder 80 → 75 → 70; physical per-zoom inventory verified
complete against the contract; measured catalog values printed at the end).
Credentials (`LM_USERNAME`/`LM_PASSWORD`) are environment-only and reach GDAL
through its own env vars; every serialized artifact is screened for
credential material.

## Orthophoto coverage (measured 2026-09-01)

`orto-j6-2024` does **not** fully cover the canonical corridor — verified
three independent ways (sample-grid projection to EPSG:3006, direct STAC
point queries returning zero items, per-z14-tile mapping) — and per the
owner's decision this is now **allowed and filled by Sentinel fallback**;
completeness is enforced on the composited result instead:

- 236 items intersect the z14-aligned corridor (93.7 GiB native; 229 the
  strict `mapCutoutBounds`).
- Of 6,693 z14 corridor tiles: **6,242 fully orthophoto (93.3 %), 72
  partial (visible seam), 379 Sentinel-only — 451 tiles (6.7 %) carry
  fallback pixels**, in two clusters:
  - a **western strip**, lon ≈ 17.864–18.06°E across lat ≈ 68.03–68.50°N
    (z14 columns 9005–9013), reaching ~4 km inside the camera-reachable
    `userBounds`; the route line itself stays ≥ 8 km away;
  - a **northern notch**, lon ≈ 18.77–18.92°E at the corridor's top rows.
- `orto-j6-2018` has the identical footprint — this is the flight-area /
  Norwegian-border boundary, permanent, not a transient gap.
- Boundary cells are published with declared `NODATA_VALUES=0 0 0` (verified
  on product thumbnails), which is exactly what the composition's
  no-data handling keys on.

The fallback areas render Sentinel-2 detail — the same imagery users see
today when over-zooming z13 — so the corridor has **no coverage holes** and
no behavioural regression anywhere.

## Running the build

```bash
scripts/prepare-lantmateriet-orthophoto.sh   # metadata; needs no credentials until the final probe
LM_USERNAME=… LM_PASSWORD=… scripts/build-satellite-map.sh data/source-imagery/sentinel2-kungsleden.tif
```

(Set the credentials in the shell environment only — never in files. The
Sentinel GeoTIFF comes from `scripts/download-kungsleden-satellite.sh .` if
missing.) The build reports Lantmäteriet coverage %, Sentinel-fallback %,
probe proof, per-zoom inventory, size, quality used, SHA-256 and physical
bounds, and writes `public/maps/kungsleden-satellite-provenance.json`.

## Ship checklist (after a successful build)

The build prints the measured values; they land as ONE flag-day change,
fenced by `tests/satellite-hybrid-contract.test.mjs` +
`tests/coverage-contract.test.mjs`:

1. `pmtiles verify` + physical inventory + composition probe checks pass in
   the build (automatic).
2. `src/map/mapCatalog.mjs` satellite entry: new revision id
   (`kungsleden-satellite-data-v5`), measured `bytes`, `sha256`, coverage
   `maxZoom: 15` and `tilesByZoom` from the build output; previous bytes
   (28_292_311) appended to `supersededBytes`; release tag
   `satellite-data-v5`.
3. `src/map/overviewEnvelope.mjs`: `SATELLITE_ARCHIVE_MAX_ZOOM` → 15.
4. `src/data/attribution.ts`: `present: true` on `lantmateriet-ortofoto`.
5. `tests/coverage-contract.test.mjs`: satellite `zooms` literal → `[7, 15]`.
6. README download-size copy (the "~59 MB" optional-downloads figure).
7. Publish the release: maintenance workflow with `publish_release: true`,
   tag `satellite-data-v5` (uploads archive + provenance); the deploy
   pipeline picks identity up from the catalog — no workflow edits needed.
8. `npm test` + `npm run typecheck` + `npm run build`.
