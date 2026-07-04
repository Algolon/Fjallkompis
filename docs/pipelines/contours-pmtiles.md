# Contour build pipeline (Copernicus DEM GLO-30 → vector PMTiles)

Produces the optional **contours** overlay as a vector PMTiles archive from the
Copernicus DEM GLO-30. Automated by `scripts/build-contours-pmtiles.sh`.

## Source & licence

- **Copernicus DEM GLO-30** (~30 m global DEM). Free to use and redistribute
  **with attribution**:
  > Contains modified Copernicus DEM data © ESA
- Download the GLO-30 tiles covering the corridor once (Copernicus Data Space
  Ecosystem, OpenTopography, or AWS `copernicus-dem-30m`) and mosaic them into a
  single GeoTIFF/VRT for `--input`.

## Bounds

Same corridor as the satellite pipeline: `mapCutoutBounds` from
`src/generated/kungsleden-route.json` (`west 18.0244, south 67.762, east
19.2328, north 68.4392`, WGS84).

## Steps (what the script does)

1. **Crop** — `gdalwarp -te …` clips the DEM to the corridor.
2. **Contours** — `gdal_contour -a elevation -i 20` writes 20 m **minor**
   contours to GeoJSON, each carrying its height in an `elevation` property.
   **Index** lines (every 100 m) are not a separate file: the map style filters
   `elevation % 100 == 0` to draw them thicker (`mapStyle.ts` →
   `contourOverlayLayers()`).
3. **Simplify by zoom + tile** — `tippecanoe -l contours -Z9 -z14
   --simplification=6 --drop-densest-as-needed` writes the vector PMTiles
   directly. The layer name **`contours`** must match the style's
   `source-layer`.
4. **Manifest** — write `kungsleden-contours.pmtiles.json` with attribution,
   bbox, measured size, and the minor/index intervals.

## Run

```bash
scripts/build-contours-pmtiles.sh --input glo30_mosaic.tif \
  --minor 20 --index 100 --maxzoom 14
```

Requires **GDAL** and **tippecanoe** (≥ 2.17 for direct `-o *.pmtiles`). The
script refuses to run without a local DEM and downloads nothing.

## Wire-up after producing the archive

1. Set `OFFLINE_ASSETS.contours.expectedSizeBytes` to the measured size and
   `available: true` in `src/map/assetRegistry.mjs`.
2. Add a `.pmtiles`-scoped Workbox range rule for `fjallkompis-contours-v1`.
3. Verify in-app: download → enable the Contours overlay → confirm minor/index
   line weights and that contours render **under** the route but **over** the
   base; test offline.

## Notes

- 20 m minor / 100 m index suits 30 m DEM detail at hiking zooms; drop to 25/125
  if lines look busy on lower-relief sections.
- Contour labels would need a glyph pack (see the **labels** overlay); the
  foundation keeps contours glyph-free (line weight distinguishes index lines).
- The same DEM feeds the **hillshade** overlay (terrain-RGB raster) — a natural
  follow-up pipeline reusing this crop.
