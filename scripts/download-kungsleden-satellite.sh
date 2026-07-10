#!/usr/bin/env bash
set -euo pipefail

# Creates an 8-bit, 3-band RGB GeoTIFF for the Fjällkompis satellite pipeline
# from EOX's public Sentinel-2 cloudless 2024 WMS.
#
# Source attribution:
# Sentinel-2 cloudless — https://s2maps.eu by EOX IT Services GmbH
# Contains modified Copernicus Sentinel data 2024.
#
# Coverage comes from the route coverage contract — mapCutoutBounds (route +
# userBufferKm + dataMarginKm) in src/generated/kungsleden-route.json — the
# exact same extent as the vector and terrain archives. Never hard-coded
# here (0.15.0 bounded-map iteration; the previous revision froze the old
# 9 km cutout as literal EPSG:3857 numbers, which silently diverged when
# the contract changed). Run `npm run generate:route` first if missing.
#
# The extent is fetched as a dynamic grid of WMS GetMap parts (each at most
# 2560×3840 px) at ~26.3 Mercator-metres/px — ≈10 m ground resolution at the
# route's latitude, matching Sentinel-2's useful true-colour detail.
#
# Output:
#   data/source-imagery/sentinel2-kungsleden.tif
#
# Required tools: curl, GDAL (gdal_translate, gdalbuildvrt, gdalinfo), node,
# python3.

for cmd in curl gdal_translate gdalbuildvrt gdalinfo node python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command '$cmd' is not installed or not on PATH." >&2
    exit 1
  fi
done

ROOT_DIR="${1:-.}"
ROUTE_JSON="${ROOT_DIR%/}/src/generated/kungsleden-route.json"
OUT_DIR="${ROOT_DIR%/}/data/source-imagery"
OUT_TIF="${OUT_DIR}/sentinel2-kungsleden.tif"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

[ -f "$ROUTE_JSON" ] || { echo "ERROR: $ROUTE_JSON missing — run 'npm run generate:route' first." >&2; exit 1; }
mkdir -p "$OUT_DIR"

WMS="https://tiles.maps.eox.at/wms"
# Mercator metres per pixel (≈10 m ground at 68°N) and per-part pixel caps.
RES_M=26.2734
MAX_W=2560
MAX_H=3840

read -r WEST SOUTH EAST NORTH <<EOF
$(node -p "
  const b = require('./${ROUTE_JSON#./}').mapCutoutBounds;
  [b[0][0], b[0][1], b[1][0], b[1][1]].join(' ');
")
EOF

# Emit the part plan: name|bbox(minx,miny,maxx,maxy)|ullr|width|height
PLAN="$(python3 -c "
import math
R = 6378137.0
def mx(lon): return math.radians(lon) * R
def my(lat): return R * math.log(math.tan(math.pi/4 + math.radians(lat)/2))
x0, y0, x1, y1 = mx($WEST), my($SOUTH), mx($EAST), my($NORTH)
res, max_w, max_h = $RES_M, $MAX_W, $MAX_H
total_w = (x1 - x0) / res
total_h = (y1 - y0) / res
cols = math.ceil(total_w / max_w)
rows = math.ceil(total_h / max_h)
print(f'# extent {x1-x0:.0f} x {y1-y0:.0f} m → {total_w:.0f} x {total_h:.0f} px → grid {cols} x {rows}')
for r in range(rows):
    for c in range(cols):
        px0 = x0 + (x1 - x0) * c / cols
        px1 = x0 + (x1 - x0) * (c + 1) / cols
        py1 = y1 - (y1 - y0) * r / rows          # top
        py0 = y1 - (y1 - y0) * (r + 1) / rows    # bottom
        w = round((px1 - px0) / res)
        h = round((py1 - py0) / res)
        print(f'part_r{r}c{c}|{px0:.6f},{py0:.6f},{px1:.6f},{py1:.6f}|{px0:.6f} {py1:.6f} {px1:.6f} {py0:.6f}|{w}|{h}')
")"
echo "$PLAN" | head -1
PARTS="$(echo "$PLAN" | grep -v '^#')"

TIFS=()
while IFS='|' read -r name bbox ullr width height; do
  png="${TMP_DIR}/${name}.png"
  tif="${TMP_DIR}/${name}.tif"
  echo "Downloading ${name} (${width}x${height})..."
  curl --fail --location --retry 4 --retry-delay 3 \
    "${WMS}?FORMAT=image%2Fpng&TRANSPARENT=FALSE&VERSION=1.1.1&SERVICE=WMS&REQUEST=GetMap&LAYERS=s2cloudless-2024_3857&STYLES=&SRS=EPSG%3A3857&WIDTH=${width}&HEIGHT=${height}&BBOX=${bbox}" \
    --output "$png"
  # Georeference each returned RGB image; select RGB bands explicitly so an
  # unexpected alpha band is not propagated.
  gdal_translate \
    -of GTiff \
    -a_srs EPSG:3857 \
    -a_ullr $ullr \
    -b 1 -b 2 -b 3 \
    -co TILED=YES \
    -co COMPRESS=DEFLATE \
    "$png" "$tif" >/dev/null
  TIFS+=("$tif")
done <<< "$PARTS"

echo "Mosaicking ${#TIFS[@]} image parts..."
gdalbuildvrt -resolution highest "${TMP_DIR}/mosaic.vrt" "${TIFS[@]}" >/dev/null

echo "Writing compressed RGB GeoTIFF..."
gdal_translate \
  -of GTiff \
  -b 1 -b 2 -b 3 \
  -co TILED=YES \
  -co COMPRESS=JPEG \
  -co JPEG_QUALITY=90 \
  -co PHOTOMETRIC=YCBCR \
  -co BIGTIFF=IF_SAFER \
  "${TMP_DIR}/mosaic.vrt" \
  "$OUT_TIF" >/dev/null

echo
echo "Created: $OUT_TIF"
ls -lh "$OUT_TIF"
echo
echo "Validation summary:"
gdalinfo "$OUT_TIF" | sed -n '1,45p'
echo