# Satellite imagery build pipeline (Sentinel-2 → raster PMTiles)

Produces the optional **satellite** base map as a raster PMTiles archive from a
legally redistributable Sentinel-2 source. Automated by
`scripts/build-satellite-pmtiles.sh`; this doc explains the steps and inputs.

## Source & licence

- **Sentinel-2 Level-2A** (surface reflectance) or a **cloud-free Sentinel-2
  mosaic**. Copernicus data — free to use and redistribute **with attribution**:
  > Contains modified Copernicus Sentinel-2 data `<year>`
- For a first prototype, use an already **cloud-free summer mosaic** so the
  pipeline needs no cloud masking. Good sources:
  - Copernicus Data Space Ecosystem / Sentinel Hub (download B04, B03, B02),
  - an EOX *Sentinel-2 cloudless* tile for the area.
- The corridor sits around **67.7–68.4° N** — pick a **June–August** scene for
  snow-free ground and long daylight.

## Bounds

The crop uses `mapCutoutBounds` from `src/generated/kungsleden-route.json`
(route bounds + ~9 km buffer): `west 18.0244, south 67.762, east 19.2328,
north 68.4392` (WGS84). This matches the topographic tileset's extent.

## Steps (what the script does)

1. **Composite** — stack B04 (red), B03 (green), B02 (blue) into an RGB VRT
   (`gdalbuildvrt -separate`). Skip if you already have a natural-colour RGB.
2. **Reproject + crop** — `gdalwarp -t_srs EPSG:3857 -te … -te_srs EPSG:4326`
   to Web Mercator, clipped to the corridor (bilinear resampling).
3. **Tile with JPEG** — `gdal_translate -of MBTILES -co TILE_FORMAT=JPEG
   -co QUALITY=80`, then `gdaladdo` for overviews. JPEG keeps the raster small;
   there is no alpha to preserve.
4. **Package** — `pmtiles convert sat.mbtiles kungsleden-satellite.pmtiles`.
5. **Manifest** — write `kungsleden-satellite.pmtiles.json` recording
   `sourceDate`, `attribution`, `bbox`, measured `sizeBytes`, `tileFormat`.

## Run

```bash
# From a single natural-colour RGB source:
scripts/build-satellite-pmtiles.sh --input mosaic_rgb.tif --date 2023-08-05

# Or from separate Sentinel-2 bands:
scripts/build-satellite-pmtiles.sh \
  --red B04.jp2 --green B03.jp2 --blue B02.jp2 --date 2023-08-05 --maxzoom 14
```

Requires **GDAL** and the **pmtiles** CLI. The script refuses to run without a
local input and never downloads bulk imagery — produce the archive out of tree,
check its size, then copy it into `public/maps/` if you decide to ship it.

## Wire-up after producing the archive

1. Set `OFFLINE_ASSETS.satellite.expectedSizeBytes` to the measured size and
   `available: true` in `src/map/assetRegistry.mjs`.
2. Add a `.pmtiles`-scoped Workbox range rule for `fjallkompis-satellite-v1`
   in `vite.config.ts` (mirror the topographic rule).
3. Verify in-app: download in Settings → switch base to Satellite → confirm the
   route/hut/GPS layers stay above the imagery and attribution shows; test
   offline; test removal reclaims the cache.

## Notes

- The MapLibre raster source uses 256 px JPEG tiles (`tileSize: 256`).
- Keep `maxzoom` at 14 to match the topographic tileset and cap file size;
  MapLibre overzooms beyond that.
- The Kungsleden corridor is small, so a single Sentinel-2 tile usually covers
  it; if not, mosaic the inputs first with `gdalbuildvrt`.
