# Satellite v6 candidate benchmark — z16 / WebP q95 vs the v5 baseline

**Status: EXPERIMENT.** Nothing here changes the shipped product. The
canonical archive stays `satellite-data-v5`
(`kungsleden-satellite.pmtiles`, 293,720,600 bytes, sha256
`29996eec00e5a792284f842ea7556e6015dfb85ae9bde9741061ebe56dd110b9`,
z7–15, detail WebP q80) and `src/map/mapCatalog.mjs` must NOT point at any
candidate produced by this document. The candidate is a locally built,
git-ignored file compared side-by-side against v5 before any shipping
decision.

## Candidate A specification

Identical to v5 in every respect except the two variables under test:

| | v5 baseline | v6 candidate A |
| --- | --- | --- |
| Sentinel overview | z7–13 | z7–13 (unchanged) |
| Detail corridor | `mapCutoutBounds` z14-aligned | same footprint exactly |
| Detail zooms | z14–15 | z14–**16** |
| Detail quality | WebP q80 | WebP q**95** |
| Detail target res | 4.7773 m/px (≈1.78 m ground @ 68.1°N) | 2.3887 m/px (≈0.89 m ground) |
| Expected detail tiles | 6,693 + 26,772 | 6,693 + 26,772 + **107,088** (z16) |
| Size gate | 1.9 GiB enforced | **reported only** (`BENCHMARK=1`) |

Same composition semantics throughout: complete Sentinel fallback under the
corridor, Lantmäteriet orthophoto update-warped above it under the cataloged
coverage cutline and declared no-data, hard per-pixel priority, no
feathering, no runtime API, one archive.

## Why the build is chunked

The z16 corridor raster is 70,656 × 99,328 px = 7.02 Gpx (~19.6 GiB raw
RGB); the v5 monolithic `detail_3857.tif` approach would peak well beyond
what this machine's free disk allows. `DETAIL_CHUNK_ROWS=N` processes the
corridor in horizontal strips of N whole z14 tile rows (aligned to the z14
grid, so every produced tile at every detail zoom lies wholly inside one
strip); each strip is warped, composited, tiled to MBTiles and appended,
then deleted. Peak disk ≈ one strip raster + the accumulating MBTiles + the
final conversion — the physical tile output is identical to the monolithic
path and the per-zoom inventory check still enforces complete rectangles.

## Building candidate A

From a checkout of this branch, with the Sentinel GeoTIFF present
(`scripts/download-kungsleden-satellite.sh .` if not) and the acquisition
artifacts validated (`scripts/prepare-lantmateriet-orthophoto.sh` — reuse is
fine when items/coverage match the manifest):

```bash
LM_USERNAME=… LM_PASSWORD=… \
BENCHMARK=1 MAXZOOM=16 DETAIL_QUALITY=95 DETAIL_CHUNK_ROWS=8 \
SATELLITE_OUT=public/maps/kungsleden-satellite-v6-z16-q95-candidate.pmtiles \
scripts/build-satellite-map.sh data/source-imagery/sentinel2-kungsleden.tif
```

Credentials stay environment-only, exactly as for v5. The build prints the
usual plan (now including the detail-raster dimensions and per-strip disk
estimate), runs every v5 correctness check (containment, probes, complete
per-zoom inventory, `pmtiles verify`), reports phase timings, approximate
remote transfer and peak workspace, and ends with a loud BENCHMARK banner —
its measured values are for comparison, never for the catalog.

## A/B comparison

```bash
pmtiles serve public/maps --port 8081 --cors "*"
open scripts/benchmark/satellite-ab-viewer.html
```

`1` shows v5, `2` shows v6, space swaps at an identical camera; the URL hash
encodes source/zoom/centre so a framing can be reproduced exactly for
screenshots. Preset buttons: Kebnekaise Fjällstation, Singi, Sälka,
Alesjaure, Tjäktja, and the western Sentinel-fallback strip. Judge whether
buildings, paths, watercourses and rock structure become materially more
legible — and check the fallback strip still renders softer Sentinel, never
black.

## Decision gate

After the visual comparison the options are: ship z16/q95 (requires solving
distribution first if >1.9 GiB — GitHub caps each Release *asset* at 2 GiB,
a Release may hold several assets; NOT solved in this iteration), try a
narrower z17 route-HD corridor (separate experiment, not implemented), or
keep v5. Whatever the outcome, v5 remains recoverable from its pinned
release and this branch must not merge before an explicit decision.
