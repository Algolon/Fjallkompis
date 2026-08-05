#!/usr/bin/env bash
#
# Extract a bounded, offline-capable OpenStreetMap-derived vector basemap for
# a route's area into public/maps/<route>.pmtiles.
#
# Source: the Protomaps daily planet build (https://maps.protomaps.com/builds/),
# which is OSM-derived and licensed ODbL (attribution: © OpenStreetMap).
# `pmtiles extract` performs HTTP range reads against the remote archive and
# downloads ONLY the tiles inside the bounding box — it never scrapes raster
# tiles and never touches tile.openstreetmap.org.
#
# The bounding box comes from the GPX-derived route data (mapCutoutBounds in
# src/generated/<route>-route.json = route bounds + per-route buffer, see
# scripts/route-configs.mjs). Run `npm run generate:route` first if that file
# is missing.
#
# Usage:
#   scripts/extract-offline-map.sh [BUILD_DATE] [MAXZOOM] [ROUTE_ID]
#
#   BUILD_DATE  Protomaps daily build to extract from, YYYYMMDD.
#               Defaults to yesterday (today's build may not exist yet).
#   MAXZOOM     Maximum zoom level to include. Default 14 (~10 m/px detail;
#               good hiking overview while keeping the file small).
#   ROUTE_ID    Route from scripts/route-configs.mjs. Default: kungsleden.
#
# Requires the pmtiles CLI: https://github.com/protomaps/go-pmtiles/releases
# (single static binary; put it on PATH or set PMTILES_BIN).

set -euo pipefail

cd "$(dirname "$0")/.."

BUILD_DATE="${1:-$(date -v-1d +%Y%m%d 2>/dev/null || date -d yesterday +%Y%m%d)}"
MAXZOOM="${2:-14}"
ROUTE_ID="${3:-kungsleden}"
SOURCE_URL="https://build.protomaps.com/${BUILD_DATE}.pmtiles"
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"

# Route JSON (for the bbox) and output archive path from the route manifest.
route_config_field() {
  node --input-type=module -e "
    import { ROUTE_CONFIG_BY_ID } from './scripts/route-configs.mjs';
    const c = ROUTE_CONFIG_BY_ID[process.argv[1]];
    if (!c) { console.error('Unknown ROUTE_ID: ' + process.argv[1]); process.exit(1); }
    // Dotted paths so nested config (vectorOverview.maxZoom) is readable too.
    const v = process.argv[2].split('.').reduce((o, k) => (o == null ? o : o[k]), c);
    console.log(v);
  " "$ROUTE_ID" "$1"
}
ROUTE_JSON="$(route_config_field outputPath)"
OUT="$(route_config_field pmtilesPath)"

if ! command -v "$PMTILES_BIN" >/dev/null 2>&1; then
  echo "ERROR: pmtiles CLI not found (looked for '$PMTILES_BIN')." >&2
  echo "Install from https://github.com/protomaps/go-pmtiles/releases or set PMTILES_BIN." >&2
  exit 1
fi

if [ ! -f "$ROUTE_JSON" ]; then
  echo "ERROR: $ROUTE_JSON missing — run 'npm run generate:route' first." >&2
  exit 1
fi

# GPX-derived padded bounds -> "west,south,east,north"; fails clearly when the
# JSON is the { available: false } stub (GPX not processed yet).
BBOX="$(node -e "
  const d = require('./${ROUTE_JSON}');
  if (!d.mapCutoutBounds) {
    console.error('ERROR: ${ROUTE_JSON} has no mapCutoutBounds — is the ${ROUTE_ID} GPX present and generate:route run?');
    process.exit(1);
  }
  const b = d.mapCutoutBounds;
  console.log([b[0][0], b[0][1], b[1][0], b[1][1]].join(','));
")"

# OVERVIEW ALLOWANCE (vectorOverview in scripts/route-configs.mjs): the
# low-zoom half of the archive is extracted from a box widened east/west, so a
# horizontally balanced full-route overview stays inside real data on every
# supported viewport. The detail zooms keep the strict cutout corridor. See the
# config for why the tile grid makes EAST the binding side.
OV_MAXZOOM="$(route_config_field 'vectorOverview.maxZoom' 2>/dev/null || echo '')"
OV_MARGIN="$(route_config_field 'vectorOverview.lonMarginDeg' 2>/dev/null || echo '')"

OV_BBOX=""
if [ -n "$OV_MAXZOOM" ] && [ -n "$OV_MARGIN" ] && [ "$OV_MAXZOOM" != "undefined" ]; then
  OV_BBOX="$(node -e "
    const d = require('./${ROUTE_JSON}');
    const b = d.mapCutoutBounds, m = ${OV_MARGIN};
    console.log([b[0][0] - m, b[0][1], b[1][0] + m, b[1][1]].join(','));
  ")"
fi

echo "Route:   $ROUTE_ID"
echo "Source:  $SOURCE_URL"
echo "BBox:    $BBOX (GPX route bounds + buffer)"
echo "Maxzoom: $MAXZOOM"
if [ -n "$OV_BBOX" ]; then
  echo "Overview: z0–z${OV_MAXZOOM} from $OV_BBOX (+${OV_MARGIN}° east/west)"
  echo "Detail:   z$((OV_MAXZOOM + 1))–z${MAXZOOM} from the cutout bbox"
fi
echo

mkdir -p public/maps
if [ -z "$OV_BBOX" ]; then
  "$PMTILES_BIN" extract "$SOURCE_URL" "$OUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"
else
  # Two disjoint zoom ranges, then one merge. Both halves come from the SAME
  # source build, so every tile that already shipped is reproduced byte for
  # byte and only the added overview columns are new.
  TMP_OV="$(mktemp -t fk-ov-XXXX).pmtiles"
  TMP_DT="$(mktemp -t fk-dt-XXXX).pmtiles"
  rm -f "$TMP_OV" "$TMP_DT"
  trap 'rm -f "$TMP_OV" "$TMP_DT"' EXIT

  echo "── Overview zooms (z0–z${OV_MAXZOOM}, widened) ──"
  "$PMTILES_BIN" extract "$SOURCE_URL" "$TMP_OV" --bbox="$OV_BBOX" \
    --minzoom=0 --maxzoom="$OV_MAXZOOM"
  echo
  echo "── Detail zooms (z$((OV_MAXZOOM + 1))–z${MAXZOOM}, strict corridor) ──"
  "$PMTILES_BIN" extract "$SOURCE_URL" "$TMP_DT" --bbox="$BBOX" \
    --minzoom=$((OV_MAXZOOM + 1)) --maxzoom="$MAXZOOM"
  echo
  echo "── Merging ──"
  rm -f "$OUT"
  "$PMTILES_BIN" merge "$TMP_OV" "$TMP_DT" "$OUT"
fi

echo
echo "Verifying archive…"
"$PMTILES_BIN" verify "$OUT"
"$PMTILES_BIN" show "$OUT" | sed -n '1,20p'

echo
ls -lh "$OUT" | awk '{print "Result: " $9 " (" $5 ")"}'
