#!/usr/bin/env bash
#
# Prepare the Lantmäteriet Ortofoto J6 (2024) source references for the
# hybrid satellite archive's z14–15 detail corridor.
#
# This is the SOURCE ACQUISITION step, split off from the generic satellite
# builder on purpose: it owns everything Lantmäteriet-specific (STAC query,
# pagination, de-duplication, contract validation, corridor-coverage proof,
# RGB `/vsicurl/` VRT synthesis) and hands the builder one ordinary GDAL
# dataset. The metadata phase needs NO credentials — the STAC catalog
# answers anonymously and the VRT is generated from catalog geometry without
# opening a single remote COG.
#
# The ~98 GB of native 0.4 m COGs are NEVER downloaded. The builder later
# streams range reads from the COGs' internal overview levels (~1.6 m for
# the z15 target) through the VRT, which is why the whole corridor costs a
# few GB of transfer instead of ~98 GB.
#
# Credentials (only needed by the LATER build/verify steps, HTTP Basic):
#   LM_USERNAME / LM_PASSWORD — environment variables only. They are never
#   written to any file, log, VRT, manifest, or generated asset, never
#   passed on a command line, and must never enter the repository or CI
#   configuration as values.
#
# Usage:
#   scripts/prepare-lantmateriet-orthophoto.sh [ROUTE_ID]   (default: kungsleden)
#
# Output:
#   data/source-imagery/lantmateriet-j6/items.json               manifest
#   data/source-imagery/lantmateriet-j6/lantmateriet-j6-rgb.vrt  RGB mosaic
#
# If LM_USERNAME/LM_PASSWORD are present, the script finishes with a
# minimal authenticated probe (a gdalinfo header read of ONE referenced COG)
# so a typo in the credentials fails here, in seconds, instead of hours into
# the warp. Without them the metadata phase still completes fully.
#
# Requires: node; gdalinfo only for the optional credential probe.

set -euo pipefail
cd "$(dirname "$0")/.."

ROUTE_ID="${1:-kungsleden}"
OUT_DIR="data/source-imagery/lantmateriet-j6"
VRT="$OUT_DIR/lantmateriet-j6-rgb.vrt"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "'node' not found on PATH."
[ -f "src/generated/${ROUTE_ID}-route.json" ] || die "src/generated/${ROUTE_ID}-route.json missing — run 'npm run generate:route' first."

node scripts/lantmateriet-orthophoto.mjs "$ROUTE_ID"

# ---- Optional: authenticated source probe ----------------------------------
if [ -n "${LM_USERNAME:-}" ] && [ -n "${LM_PASSWORD:-}" ]; then
  command -v gdalinfo >/dev/null 2>&1 || die "'gdalinfo' not found on PATH (needed for the credential probe)."
  echo
  echo "── Credential probe (one COG header read) ───────────────────────────"
  FIRST_HREF="$(node -p "require('./$OUT_DIR/items.json').items[0].href")"
  # GDAL_HTTP_USERPWD is read from the environment by GDAL itself; the value
  # never appears on a command line or in any output. EMPTY_DIR suppresses
  # the sibling-file directory scan a plain /vsicurl/ open would attempt.
  if GDAL_HTTP_AUTH=BASIC \
     GDAL_HTTP_USERPWD="${LM_USERNAME}:${LM_PASSWORD}" \
     GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
     CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif" \
     gdalinfo "/vsicurl/${FIRST_HREF}" >/dev/null 2>&1; then
    echo "  ✓ authenticated COG header read succeeded"
  else
    die "authenticated read of ${FIRST_HREF} failed — check LM_USERNAME/LM_PASSWORD."
  fi
else
  echo
  echo "NOTE: LM_USERNAME/LM_PASSWORD not set — metadata phase complete; the"
  echo "      build step (scripts/build-satellite-map.sh) will need them."
fi
