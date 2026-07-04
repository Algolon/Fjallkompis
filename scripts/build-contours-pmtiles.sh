#!/usr/bin/env bash
#
# Build an OPTIONAL contour-line vector PMTiles for the Kungsleden route
# corridor from the Copernicus DEM GLO-30.
#
# Source & licence
# ----------------
# Copernicus DEM GLO-30 (~30 m) is free and redistributable with attribution:
#     "Contains modified Copernicus DEM data © ESA"
# Download the GLO-30 tiles covering the route corridor once and pass the DEM
# (a single VRT/GeoTIFF mosaic) via --input.
#
# What it does (per the layered-map plan)
# ---------------------------------------
#   1. crop + reproject the DEM to the route bbox,
#   2. generate minor (20 m) and index (100 m) contours,
#   3. simplify by zoom (tippecanoe),
#   4. package as vector PMTiles,
#   5. record the required attribution in a sidecar manifest.
#
# IMPORTANT: scaffolding for the foundation branch. Requires a DEM you supply;
# no large binary is downloaded or committed here. Copy the resulting .pmtiles
# into public/maps/ only when ready.
#
# Usage:
#   scripts/build-contours-pmtiles.sh --input DEM.tif \
#       [--minor 20] [--index 100] [--maxzoom 14] [--out FILE]
#
# Requires: gdal (gdalwarp, gdal_contour), tippecanoe (>=2.17 for -o *.pmtiles).

set -euo pipefail
cd "$(dirname "$0")/.."

INPUT=""
MINOR=20
INDEX=100
MINZOOM=9
MAXZOOM=14
OUT="public/maps/kungsleden-contours.pmtiles"
ROUTE_JSON="src/generated/kungsleden-route.json"

while [ $# -gt 0 ]; do
  case "$1" in
    --input) INPUT="$2"; shift 2;;
    --minor) MINOR="$2"; shift 2;;
    --index) INDEX="$2"; shift 2;;
    --minzoom) MINZOOM="$2"; shift 2;;
    --maxzoom) MAXZOOM="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    *) echo "Unknown argument: $1" >&2; exit 2;;
  esac
done

for bin in gdalwarp gdal_contour tippecanoe; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' not found." >&2; exit 1; }
done
[ -f "$ROUTE_JSON" ] || { echo "ERROR: $ROUTE_JSON missing — run 'npm run generate:route'." >&2; exit 1; }
[ -n "$INPUT" ] || { echo "ERROR: --input DEM.(tif|vrt) is required." >&2; exit 1; }

read -r WEST SOUTH EAST NORTH <<EOF
$(node -p "const b=require('./${ROUTE_JSON}').mapCutoutBounds; [b[0][0],b[0][1],b[1][0],b[1][1]].join(' ');")
EOF
echo "BBox (route + buffer): $WEST $SOUTH $EAST $NORTH"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. Crop the DEM to the route bbox (keep WGS84 for contouring in metres via
#    a projected intermediate; here we contour in geographic and rely on the
#    DEM's own vertical units, which are metres for Copernicus DEM).
echo "→ cropping DEM to route bbox"
gdalwarp -overwrite -te "$WEST" "$SOUTH" "$EAST" "$NORTH" \
  -r bilinear "$INPUT" "$WORK/dem.tif"

# 2. Minor + index contours. `elevation` carries the height; index lines are
#    where elevation % INDEX == 0 (the style filters on that at render time).
echo "→ generating $MINOR m contours (index every $INDEX m)"
gdal_contour -a elevation -i "$MINOR" -f GeoJSON \
  "$WORK/dem.tif" "$WORK/contours.geojson"

# 3–4. Simplify by zoom and package directly as vector PMTiles. The layer name
#      "contours" must match the style's `source-layer` in mapStyle.ts.
echo "→ tiling + simplifying → $OUT (z$MINZOOM–$MAXZOOM)"
mkdir -p "$(dirname "$OUT")"
tippecanoe -o "$OUT" --force \
  -l contours \
  -Z "$MINZOOM" -z "$MAXZOOM" \
  --simplification=6 --drop-densest-as-needed --extend-zooms-if-still-dropping \
  "$WORK/contours.geojson"

# 5. Sidecar manifest.
SIZE="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
cat > "$OUT.json" <<JSON
{
  "id": "contours",
  "version": "1",
  "kind": "vector",
  "sourceDate": "$(date +%F)",
  "attribution": "Contains modified Copernicus DEM data © ESA",
  "bbox": [$WEST, $SOUTH, $EAST, $NORTH],
  "sizeBytes": $SIZE,
  "tileFormat": "pbf",
  "minZoom": $MINZOOM,
  "maxZoom": $MAXZOOM,
  "contourIntervalM": $MINOR,
  "indexIntervalM": $INDEX
}
JSON

echo
echo "Done. $OUT ($((SIZE/1024/1024)) MB) + $OUT.json"
echo "Next: update OFFLINE_ASSETS.contours.expectedSizeBytes to $SIZE and set available:true."
