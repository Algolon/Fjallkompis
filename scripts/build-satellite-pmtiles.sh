#!/usr/bin/env bash
#
# Build an OPTIONAL offline satellite raster PMTiles for the Kungsleden route
# corridor from a legally redistributable Sentinel-2 source.
#
# Source & licence
# ----------------
# Sentinel-2 Level-2A (or a cloud-free Sentinel-2 mosaic) is Copernicus data,
# free and redistributable with attribution:
#     "Contains modified Copernicus Sentinel-2 data <YEAR>"
# For a first prototype, prefer an already-cloud-free summer mosaic (e.g. an
# EOX Sentinel-2 cloudless tile, or a mosaic you assembled) so this script does
# not have to do cloud masking.
#
# What it does (per the layered-map plan)
# ---------------------------------------
#   1. crop to the existing Kungsleden bounds + buffer (mapCutoutBounds),
#   2. build a natural-colour composite (B04/B03/B02 → RGB),
#   3. reproject to Web Mercator (EPSG:3857),
#   4. tile with JPEG compression,
#   5. package as raster PMTiles,
#   6. record imagery date + attribution in a sidecar manifest.
#
# IMPORTANT: this script is scaffolding for the foundation branch. It requires
# a local Sentinel-2 input you supply — it deliberately does NOT download tens
# of GB of imagery, and no large binary is committed to the repo. Run it out of
# tree and copy the resulting .pmtiles into public/maps/ only when ready.
#
# Usage:
#   scripts/build-satellite-pmtiles.sh \
#       --input <RGB-or-bands>  --date <YYYY-MM-DD>  [--maxzoom 14] [--out FILE]
#
#   --input   Either a single natural-colour RGB raster, OR a directory/VRT
#             from which B04,B03,B02 can be stacked (see --red/--green/--blue).
#   --date    Acquisition / mosaic date recorded in the sidecar manifest.
#   --maxzoom Maximum tile zoom (default 14 — matches the topographic tileset).
#   --out     Output path (default public/maps/kungsleden-satellite.pmtiles).
#
# Requires: gdal (gdalwarp, gdalbuildvrt, gdal_translate, gdaladdo) and the
# pmtiles CLI (https://github.com/protomaps/go-pmtiles).

set -euo pipefail
cd "$(dirname "$0")/.."

MAXZOOM=14
MINZOOM=8
DATE=""
INPUT=""
RED=""; GREEN=""; BLUE=""
OUT="public/maps/kungsleden-satellite.pmtiles"
ROUTE_JSON="src/generated/kungsleden-route.json"
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"

while [ $# -gt 0 ]; do
  case "$1" in
    --input) INPUT="$2"; shift 2;;
    --red) RED="$2"; shift 2;;
    --green) GREEN="$2"; shift 2;;
    --blue) BLUE="$2"; shift 2;;
    --date) DATE="$2"; shift 2;;
    --maxzoom) MAXZOOM="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    *) echo "Unknown argument: $1" >&2; exit 2;;
  esac
done

for bin in gdalwarp gdal_translate gdaladdo; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found (install GDAL)." >&2; exit 1; }
done
command -v "$PMTILES_BIN" >/dev/null 2>&1 || {
  echo "ERROR: pmtiles CLI not found. Install from https://github.com/protomaps/go-pmtiles." >&2; exit 1; }
[ -f "$ROUTE_JSON" ] || { echo "ERROR: $ROUTE_JSON missing — run 'npm run generate:route'." >&2; exit 1; }
[ -n "$DATE" ] || { echo "ERROR: --date <YYYY-MM-DD> is required (recorded in the manifest)." >&2; exit 1; }
[ -n "$INPUT" ] || [ -n "$RED" ] || { echo "ERROR: provide --input or --red/--green/--blue." >&2; exit 1; }

# GPX-derived padded bounds → "west south east north"
read -r WEST SOUTH EAST NORTH <<EOF
$(node -p "const b=require('./${ROUTE_JSON}').mapCutoutBounds; [b[0][0],b[0][1],b[1][0],b[1][1]].join(' ');")
EOF
echo "BBox (route + buffer): $WEST $SOUTH $EAST $NORTH"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1–2. Natural-colour RGB composite (stack bands if given separately).
if [ -n "$RED" ]; then
  echo "→ stacking B04/B03/B02 into an RGB VRT"
  gdalbuildvrt -separate "$WORK/rgb.vrt" "$RED" "$GREEN" "$BLUE"
  SRC="$WORK/rgb.vrt"
else
  SRC="$INPUT"
fi

# 3. Reproject to Web Mercator and crop to the route bbox (bilinear).
echo "→ reprojecting to EPSG:3857 and cropping"
gdalwarp -overwrite -t_srs EPSG:3857 -te_srs EPSG:4326 \
  -te "$WEST" "$SOUTH" "$EAST" "$NORTH" \
  -r bilinear -of GTiff -co TILED=YES "$SRC" "$WORK/merc.tif"

# 4. JPEG-compressed tiled raster + overviews, then package as MBTiles (JPEG).
echo "→ writing JPEG-compressed MBTiles (z$MINZOOM–$MAXZOOM)"
gdal_translate -of MBTILES \
  -co TILE_FORMAT=JPEG -co QUALITY=80 -co ZOOM_LEVEL_STRATEGY=UPPER \
  "$WORK/merc.tif" "$WORK/sat.mbtiles"
gdaladdo -r average "$WORK/sat.mbtiles" 2 4 8 16

# 5. Convert MBTiles → raster PMTiles.
echo "→ converting to PMTiles: $OUT"
mkdir -p "$(dirname "$OUT")"
"$PMTILES_BIN" convert "$WORK/sat.mbtiles" "$OUT"
"$PMTILES_BIN" verify "$OUT"

# 6. Sidecar manifest (imagery date + attribution + measured size + bbox).
SIZE="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
cat > "$OUT.json" <<JSON
{
  "id": "satellite",
  "version": "1",
  "kind": "raster",
  "sourceDate": "$DATE",
  "attribution": "Contains modified Copernicus Sentinel-2 data ${DATE%%-*}",
  "bbox": [$WEST, $SOUTH, $EAST, $NORTH],
  "sizeBytes": $SIZE,
  "tileFormat": "jpeg",
  "minZoom": $MINZOOM,
  "maxZoom": $MAXZOOM
}
JSON

echo
echo "Done. $OUT ($((SIZE/1024/1024)) MB) + $OUT.json"
echo "Next: update OFFLINE_ASSETS.satellite.expectedSizeBytes to $SIZE and set available:true."
