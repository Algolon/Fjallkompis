#!/usr/bin/env bash
set -euo pipefail

# Creates an 8-bit, 3-band RGB GeoTIFF for the Fjällkompis satellite pipeline
# from EOX's public Sentinel-2 cloudless 2024 WMS.
#
# Source attribution:
# Sentinel-2 cloudless — https://s2maps.eu by EOX IT Services GmbH
# Contains modified Copernicus Sentinel data 2024.
#
# Output:
#   data/source-imagery/sentinel2-kungsleden.tif
#
# Required tools:
#   curl
#   GDAL: gdal_translate, gdalbuildvrt, gdalinfo

for cmd in curl gdal_translate gdalbuildvrt gdalinfo; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command '$cmd' is not installed or not on PATH." >&2
    exit 1
  fi
done

ROOT_DIR="${1:-.}"
OUT_DIR="${ROOT_DIR%/}/data/source-imagery"
OUT_TIF="${OUT_DIR}/sentinel2-kungsleden.tif"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$OUT_DIR"

# mapCutoutBounds transformed from EPSG:4326 to EPSG:3857.
# Full extent:
# minX=2006467.029854, minY=10376633.244031
# maxX=2140985.502529, maxY=10578766.925781
#
# Four requests create a 5120 x 7680-pixel mosaic. At the route latitude,
# this is approximately equivalent to Sentinel-2's useful ~10 m ground detail.

WMS="https://tiles.maps.eox.at/wms"
COMMON="FORMAT=image%2Fpng&TRANSPARENT=FALSE&VERSION=1.1.1&SERVICE=WMS&REQUEST=GetMap&LAYERS=s2cloudless-2024_3857&STYLES=&SRS=EPSG%3A3857&WIDTH=2560&HEIGHT=3840"

download_part() {
  local name="$1"
  local bbox="$2"
  local png="${TMP_DIR}/${name}.png"
  local tif="${TMP_DIR}/${name}.tif"

  echo "Downloading ${name}..."
  curl --fail --location --retry 4 --retry-delay 3 \
    "${WMS}?${COMMON}&BBOX=${bbox}" \
    --output "$png"

  case "$name" in
    top_left)
      ullr="2006467.029854 10578766.925781 2073726.266192 10477700.084906"
      ;;
    top_right)
      ullr="2073726.266192 10578766.925781 2140985.502529 10477700.084906"
      ;;
    bottom_left)
      ullr="2006467.029854 10477700.084906 2073726.266192 10376633.244031"
      ;;
    bottom_right)
      ullr="2073726.266192 10477700.084906 2140985.502529 10376633.244031"
      ;;
    *)
      echo "ERROR: unknown part '$name'." >&2
      exit 1
      ;;
  esac

  # Georeference each returned RGB image.
  # Explicitly select RGB bands so an unexpected alpha band is not propagated.
  gdal_translate \
    -of GTiff \
    -a_srs EPSG:3857 \
    -a_ullr $ullr \
    -b 1 -b 2 -b 3 \
    -co TILED=YES \
    -co COMPRESS=DEFLATE \
    "$png" "$tif" >/dev/null
}

download_part \
  top_left \
  "2006467.029854,10477700.084906,2073726.266192,10578766.925781"
download_part \
  top_right \
  "2073726.266192,10477700.084906,2140985.502529,10578766.925781"
download_part \
  bottom_left \
  "2006467.029854,10376633.244031,2073726.266192,10477700.084906"
download_part \
  bottom_right \
  "2073726.266192,10376633.244031,2140985.502529,10477700.084906"

echo "Mosaicking four image parts..."
gdalbuildvrt \
  -resolution highest \
  "${TMP_DIR}/mosaic.vrt" \
  "${TMP_DIR}/top_left.tif" \
  "${TMP_DIR}/top_right.tif" \
  "${TMP_DIR}/bottom_left.tif" \
  "${TMP_DIR}/bottom_right.tif" >/dev/null

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
echo "Attribution required in the app:"
echo "Sentinel-2 cloudless — s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)"
