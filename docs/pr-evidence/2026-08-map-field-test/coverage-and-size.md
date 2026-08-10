# Map field-test coverage evidence

Base: `141c64cc39cebcddf5d8e20ca1bb3404056596f9` (remote `main`, fetched
2026-08-10 after the 2700007 ledger closure).

## Camera and archive contract

| Extent | West, south | East, north |
|---|---:|---:|
| Route | 18.241127, 67.842819 | 19.016074, 68.358310 |
| Normal interaction (`userBounds`) | 17.952100, 67.735000 | 19.305100, 68.466100 |
| High-zoom data cutout | 17.879900, 67.708100 | 19.377300, 68.493100 |
| Physical z7 raster envelope | 16.875000, 67.609221 | 19.687500, 68.656555 |
| Supported raster camera envelope (2 km inset) | 16.892966, 67.616063 | 19.669534, 68.650015 |
| Vector header | 17.379900, 67.708100 | 19.877300, 68.493100 |

`userBounds` remains unchanged. At overview zoom the active Terrain or
Satellite mode uses the supported raster envelope; at ordinary zoom the map
returns to `userBounds`. The 2 km inset is product justification for the small
overview-bound adjustment: a reachable `maxBounds` edge must not equal the
last real raster pixel because bilinear sampling and touch movement can expose
that physical edge.

## Terrain and contours

No archive regeneration was needed. The shipped terrain pyramid already has
real Copernicus GLO-30 pixels across the full z7 ancestor tile, and contours
contain `userBounds` with the existing hidden margin. Only the runtime's
overclaimed zero-margin raster camera envelope changed.

| Archive | Revision | Bounds | Bytes | SHA256 |
|---|---|---|---:|---|
| Terrain old/new | `kungsleden-terrain-data-v3` | 17.841797,67.676085–19.423828,68.496040 (header); z7 ancestor 16.875000,67.609221–19.687500,68.656555 | 19,297,735 | `89eef71787ceb1f4b827b9eee1906fd799d89c4d4d587be31a4d944efb399aa5` |
| Contours old/new | `kungsleden-contours-data-v3` | 17.879900,67.708100–19.377300,68.493100 | 9,271,029 | `3e8fbcfa6ee1ea8df9abaec641d836e11602867c09c83f77173e522826b7d573` |

The pinned `terrain-data-v3` provenance identifies Copernicus DEM GLO-30,
acquired 2026-07-10, terrarium PNG z7–12, 20 m contours (100 m index) z9–13,
GDAL 3.13.1, tippecanoe 2.79.0 and the exact eight source DEM hashes.

## Satellite stop-gate

The v3 PMTiles header nominally claimed the cutout and its tile pyramid had
entries across the z7 ancestor tile, but its real image pixels were cropped to
the cutout. The transparent pixels outside that crop are why terrain remained
visible beside a selectable Satellite layer.

| | Old v3 | Proposed/final v4 |
|---|---:|---:|
| Real imagery bounds | 17.879734,67.708078–19.377308,68.493145 | 16.875000,67.609221–19.687500,68.656555 |
| Zooms / tiles / format | z7–13 / 256 px / WEBP q80 | z7–13 / 256 px / WEBP q80 |
| Source resolution | ~26.3 Mercator m/px (~10 m ground at 68°N) | unchanged |
| Archive bytes | 61,704,169 | 28,292,311 |
| Absolute delta |  | **−33,411,858** |
| Percentage delta |  | **−54.15%** |
| SHA256 | `b94714526b48bc07220a851e4cc05684800e5d2967804b6907f72a922258c694` | `4e5d4a90e43f522d2215c4fb46d0702018bf3b6f4bef92963ab9b00d5f5a4d52` |

The stop-gate passes: coherent coverage is materially smaller, not
disproportionately larger. The source remains EOX Sentinel-2 cloudless 2024
(`s2cloudless-2024_3857`; Contains modified Copernicus Sentinel data 2024).
The measured source GeoTIFF was 32,475,763 bytes with SHA256
`129998615b861095d56c066797bc1efc9758de7c565080c557771524a3b6146a`.
GDAL 3.13.1 generated the candidate; `pmtiles verify` passed.

## Attribution root cause

MapLibre 5.24.0's `AttributionControl.onAdd()` deliberately puts compact
controls in `open` + `maplibregl-compact-show`. Fjällkompis removed those only
from the asynchronous map `load` handler, after an expanded control could
paint. A second part of the cause is that source credits arrive asynchronously:
an initially empty control is treated as newly compact and expanded again.
The replacement supplies MapLibre's standard credit immediately and removes
the expanded state from the detached element before `onAdd()` returns. The same
native `details`/`summary` control is then attached and remains accessible;
there is no timeout or delayed hiding.

## Validation

- Real archives: catalog byte/SHA verification passed for terrain, contours,
  and satellite; `pmtiles verify` passed for satellite v4.
- Automated with all real archives present: full `npm test` passed (1,850/1,850),
  attribution first-state regression, archive/catalog coverage, PWA/Android
  revision parity, typecheck, and whitespace checks.
- Builds: web/PWA production build, native Capacitor build, native-content
  verifier, Android debug APK assembly, web brand verifier, web/native privacy
  verifier, and packaged APK branding verifier passed.
- Real-data visual QA in the app browser covered entry from Today, the first
  visible attribution state and its accessible reopen, full-route framing,
  north/south route ends, west/east pan limits, portrait and landscape, Terrain
  relief, and Satellite. Samsung hardware remains the final device gate.
