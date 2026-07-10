#!/usr/bin/env bash
#
# Build the bounded satellite-imagery raster PMTiles archive for the Kungsleden
# route from a user-provided georeferenced RGB GeoTIFF, into
#   public/maps/kungsleden-satellite.pmtiles
# — the archive the Satellite map layer already consumes (see
# src/map/pmtilesProtocol.ts / src/map/mapStyle.ts).
#
# Recommended source: Copernicus Sentinel-2 true-colour imagery (bands
# B04/B03/B02) exported as a georeferenced GeoTIFF. This converts YOUR OWN
# georeferenced image — it never scrapes raster tiles from Google, Bing, Esri,
# Mapbox or any other commercial tile endpoint.
#
# The crop bounding box is read from the GPX-derived route data (mapCutoutBounds
# in src/generated/kungsleden-route.json = route bounds + ~9 km buffer) — the
# exact same box used for the vector basemap, never hard-coded here. Run
# `npm run generate:route` first if that file is missing.
#
# Usage:
#   scripts/build-satellite-map.sh <source.tif> [MAXZOOM]
#   SATELLITE_SRC=<source.tif> scripts/build-satellite-map.sh
#
# Options (environment variables):
#   MAXZOOM      Maximum zoom stored in the archive. Default 13
#                (~10 m/px, the native resolution of Sentinel-2 true colour;
#                MapLibre over-zooms beyond it up to the map's maxZoom of 17).
#   MINZOOM      Minimum zoom stored in the archive. Default 6.
#   TILE_FORMAT  WEBP (default; lossy + keeps alpha for no-data edges) or
#                JPEG (smaller, but no alpha — no-data areas become black).
#   QUALITY      Lossy tile quality, 1-100. Default 80.
#   DEBUG        Set to keep the intermediate GeoTIFF/MBTiles for inspection.
#
# Requires: GDAL (gdalinfo, gdalwarp, gdal_translate, gdaladdo) and the pmtiles
# CLI (https://github.com/protomaps/go-pmtiles). Node is used only to read the
# route bounds, matching scripts/extract-offline-map.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:-${SATELLITE_SRC:-}}"
MAXZOOM_ARG="${2:-}"
MAXZOOM="${MAXZOOM_ARG:-${MAXZOOM:-13}}"
MINZOOM="${MINZOOM:-6}"
TILE_FORMAT="$(printf '%s' "${TILE_FORMAT:-WEBP}" | tr '[:lower:]' '[:upper:]')"
QUALITY="${QUALITY:-80}"
OUT="public/maps/kungsleden-satellite.pmtiles"
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"
ROUTE_JSON="src/generated/kungsleden-route.json"
# Must match SATELLITE_TILE_SIZE in src/map/mapStyle.ts (the MapLibre raster
# source is configured for 256 px tiles, which is GDAL's MBTiles default).
TILE_SIZE=256

die() { echo "ERROR: $*" >&2; exit 1; }

# ---- 1. Validate input ----------------------------------------------------
[ -n "$SRC" ] || die "no source GeoTIFF given.
Usage: scripts/build-satellite-map.sh <source.tif> [MAXZOOM]
   or: SATELLITE_SRC=<source.tif> scripts/build-satellite-map.sh"
[ -f "$SRC" ] || die "source file not found: $SRC"

case "$TILE_FORMAT" in
  WEBP|JPEG|PNG) ;;
  *) die "TILE_FORMAT must be WEBP, JPEG or PNG (got '$TILE_FORMAT')." ;;
esac
[ "$MAXZOOM" -ge "$MINZOOM" ] 2>/dev/null || die "MAXZOOM ($MAXZOOM) must be >= MINZOOM ($MINZOOM)."

# ---- 2. Validate tools ----------------------------------------------------
for tool in gdalinfo gdalwarp gdal_translate gdaladdo node; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' not found on PATH.
Install GDAL (e.g. 'apt-get install gdal-bin' or 'brew install gdal') and Node."
done
command -v "$PMTILES_BIN" >/dev/null 2>&1 || die "pmtiles CLI not found (looked for '$PMTILES_BIN').
Install from https://github.com/protomaps/go-pmtiles/releases or set PMTILES_BIN."

# ---- 3. Read route bounds (never hard-coded) ------------------------------
[ -f "$ROUTE_JSON" ] || die "$ROUTE_JSON missing — run 'npm run generate:route' first."

# mapCutoutBounds = [[west,south],[east,north]] in EPSG:4326.
read -r WEST SOUTH EAST NORTH <<EOF
$(node -p "
  const b = require('./${ROUTE_JSON}').mapCutoutBounds;
  [b[0][0], b[0][1], b[1][0], b[1][1]].join(' ');
")
EOF
[ -n "$NORTH" ] || die "could not read mapCutoutBounds from $ROUTE_JSON."

# Web Mercator resolution (m/px) at MAXZOOM for 256 px tiles.
RES="$(node -p "156543.03392804097 / (2 ** ${MAXZOOM})")"

echo "── Satellite archive build ──────────────────────────────────────────"
echo "Source file : $SRC"
echo "Crop bounds : W $WEST  S $SOUTH  E $EAST  N $NORTH  (EPSG:4326, from $ROUTE_JSON)"
echo "Zoom range  : $MINZOOM … $MAXZOOM   (target res ${RES} m/px @ z$MAXZOOM)"
echo "Tile format : $TILE_FORMAT (quality $QUALITY), ${TILE_SIZE}px"
echo "Output      : $OUT"
echo

# ---- 4. Inspect source ----------------------------------------------------
echo "── Source raster ────────────────────────────────────────────────────"
# Portable summary (BSD and GNU sed disagree on multi-command blocks).
gdalinfo "$SRC" | grep -E '^Driver|^Size is|^Pixel Size|^Upper Left|^Lower Right|PROJCRS|GEOGCRS' | head -8
BANDS="$(gdalinfo "$SRC" | grep -c '^Band ')"
echo "Bands       : $BANDS"
[ "$BANDS" -ge 3 ] || die "source must be an RGB raster (>=3 bands); found $BANDS."
echo

# ---- Temp workspace -------------------------------------------------------
WORK="$(mktemp -d "${TMPDIR:-/tmp}/satmap.XXXXXX")"
WARPED="$WORK/warped_3857.tif"
MBTILES="$WORK/satellite.mbtiles"
cleanup() { [ -n "${DEBUG:-}" ] || rm -rf "$WORK"; }
trap cleanup EXIT

# ---- 5-8. Crop + reproject to Web Mercator, add alpha for no-data ---------
echo "── Cropping to route bounds + reprojecting to EPSG:3857 ─────────────"
# -te + -te_srs crops in lon/lat; -t_srs 3857 reprojects; -tr pins the output
# resolution to z$MAXZOOM; -tap aligns pixels to that grid; -dstalpha makes
# no-data / outside-source areas transparent so they never render as black.
gdalwarp \
  -overwrite \
  -t_srs EPSG:3857 \
  -te "$WEST" "$SOUTH" "$EAST" "$NORTH" -te_srs EPSG:4326 \
  -tr "$RES" "$RES" -tap \
  -r bilinear \
  -dstalpha \
  -wo NUM_THREADS=ALL_CPUS \
  -co TILED=YES -co COMPRESS=DEFLATE \
  "$SRC" "$WARPED"
echo

# ---- 9-13. Base tiles (MAXZOOM) into an MBTiles, then the zoom pyramid ----
echo "── Writing base tiles (z$MAXZOOM) → MBTiles ($TILE_FORMAT) ──────────"
gdal_translate -of MBTILES \
  -co "TILE_FORMAT=$TILE_FORMAT" \
  -co "QUALITY=$QUALITY" \
  -co "BLOCKSIZE=$TILE_SIZE" \
  "$WARPED" "$MBTILES"

echo "── Building overviews z$((MAXZOOM-1))…z$MINZOOM ─────────────────────"
FACTORS=""
for ((k = 1; k <= MAXZOOM - MINZOOM; k++)); do
  FACTORS="$FACTORS $((2 ** k))"
done
# shellcheck disable=SC2086
gdaladdo -r average "$MBTILES" $FACTORS
echo

# ---- 14. Convert to PMTiles ----------------------------------------------
echo "── Converting MBTiles → PMTiles ────────────────────────────────────"
mkdir -p "$(dirname "$OUT")"
"$PMTILES_BIN" convert "$MBTILES" "$OUT"
echo

# ---- 15. Verify -----------------------------------------------------------
echo "── Verifying archive ───────────────────────────────────────────────"
"$PMTILES_BIN" verify "$OUT"
echo

# ---- 16. Report -----------------------------------------------------------
echo "── Archive summary ─────────────────────────────────────────────────"
"$PMTILES_BIN" show "$OUT" | sed -n '1,30p'
SIZE="$(ls -lh "$OUT" | awk '{print $5}')"
echo
echo "tile size   : ${TILE_SIZE}px (MapLibre SATELLITE_TILE_SIZE)"
echo "file size   : $SIZE"
echo "output      : $OUT"
echo "✓ Done. The Satellite layer will detect this archive on next load."
