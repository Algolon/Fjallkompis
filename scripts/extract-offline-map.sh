#!/usr/bin/env bash
#
# Extract a bounded, offline-capable OpenStreetMap-derived vector basemap for
# the Kungsleden route area into public/maps/kungsleden.pmtiles.
#
# Source: the Protomaps daily planet build (https://maps.protomaps.com/builds/),
# which is OSM-derived and licensed ODbL (attribution: © OpenStreetMap).
# `pmtiles extract` performs HTTP range reads against the remote archive and
# downloads ONLY the tiles inside the bounding box — it never scrapes raster
# tiles and never touches tile.openstreetmap.org.
#
# The bounding box comes from the GPX-derived route data (mapCutoutBounds in
# src/generated/kungsleden-route.json = route bounds + 9 km buffer). Run
# `npm run generate:route` first if that file is missing.
#
# Usage:
#   scripts/extract-offline-map.sh [BUILD_DATE] [MAXZOOM]
#
#   BUILD_DATE  Protomaps daily build to extract from, YYYYMMDD.
#               Defaults to yesterday (today's build may not exist yet).
#   MAXZOOM     Maximum zoom level to include. Default 14 (~10 m/px detail;
#               good hiking overview while keeping the file small).
#
# Requires the pmtiles CLI: https://github.com/protomaps/go-pmtiles/releases
# (single static binary; put it on PATH or set PMTILES_BIN).

set -euo pipefail

cd "$(dirname "$0")/.."

BUILD_DATE="${1:-$(date -v-1d +%Y%m%d 2>/dev/null || date -d yesterday +%Y%m%d)}"
MAXZOOM="${2:-14}"
SOURCE_URL="https://build.protomaps.com/${BUILD_DATE}.pmtiles"
OUT="public/maps/kungsleden.pmtiles"
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"
ROUTE_JSON="src/generated/kungsleden-route.json"

if ! command -v "$PMTILES_BIN" >/dev/null 2>&1; then
  echo "ERROR: pmtiles CLI not found (looked for '$PMTILES_BIN')." >&2
  echo "Install from https://github.com/protomaps/go-pmtiles/releases or set PMTILES_BIN." >&2
  exit 1
fi

if [ ! -f "$ROUTE_JSON" ]; then
  echo "ERROR: $ROUTE_JSON missing — run 'npm run generate:route' first." >&2
  exit 1
fi

# GPX-derived padded bounds -> "west,south,east,north"
BBOX="$(node -p "
  const b = require('./${ROUTE_JSON}').mapCutoutBounds;
  [b[0][0], b[0][1], b[1][0], b[1][1]].join(',');
")"

echo "Source:  $SOURCE_URL"
echo "BBox:    $BBOX (GPX route bounds + buffer)"
echo "Maxzoom: $MAXZOOM"
echo

mkdir -p public/maps
"$PMTILES_BIN" extract "$SOURCE_URL" "$OUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"

echo
echo "Verifying archive…"
"$PMTILES_BIN" verify "$OUT"
"$PMTILES_BIN" show "$OUT" | sed -n '1,20p'

echo
ls -lh "$OUT" | awk '{print "Result: " $9 " (" $5 ")"}'
