#!/usr/bin/env bash
#
# Build the hybrid satellite-imagery raster PMTiles archive for the Kungsleden
# route into
#   public/maps/kungsleden-satellite.pmtiles
# — the ONE archive the Satellite map layer consumes (see
# src/map/pmtilesProtocol.ts / src/map/mapStyle.ts). One user-facing layer,
# one optional download, two imagery sources inside:
#
#   z7–13   Sentinel-2 Cloudless 2024 (EOX) from a user-provided georeferenced
#           RGB GeoTIFF (scripts/download-kungsleden-satellite.sh), covering
#           the COMPLETE z7 overview footprint — every descendant tile, exactly
#           as the previous all-Sentinel archive did.
#   z14–15  The compact detail corridor (mapCutoutBounds tile-aligned at z14,
#           the same shape terrain relief takes at z12), COMPOSITED from two
#           sources at raster-production time:
#             1. Sentinel-2 resampled to the exact detail grid — the complete
#                underlying fallback, so the corridor has no coverage holes;
#             2. Lantmäteriet Ortofoto J6 (2024) 0.4 m aerial imagery (RGB
#                bands only) warped ABOVE it wherever valid orthophoto pixels
#                exist — via the /vsicurl/ VRT prepared by
#                scripts/prepare-lantmateriet-orthophoto.sh, streaming range
#                reads from the COGs' internal overviews (~1.6 m for the z15
#                target); the ~94 GB of native imagery is NEVER downloaded.
#           Source priority is the Lantmäteriet VALIDITY mask, applied as a
#           hard per-pixel decision: the overlay warp writes only inside the
#           cataloged coverage cutline AND only where the source pixel is not
#           the declared 0,0,0 no-data — no feathering, no blending (-cblend
#           is deliberately absent). A visible quality seam at the flight
#           boundary is correct; invented blended pixels are not.
#
# The mixed pyramid is assembled at the MBTiles stage (the technique
# build-terrain-map.sh already uses for its z7–11/z12 split) and converted to
# PMTiles once, so browser and Android keep consuming one canonical byte
# stream under the existing optional-download contract.
#
# Every bound is derived from GPX-generated mapCutoutBounds through the
# canonical tile maths in src/map/overviewEnvelope.mjs — never hard-coded.
# Run `npm run generate:route` first if the route JSON is missing.
#
# Credentials: reading the Lantmäteriet COGs requires HTTP Basic auth from
# LM_USERNAME / LM_PASSWORD. They reach GDAL exclusively through its own
# environment variables, are never echoed, never written to any output, and
# must never enter the repository, CI configuration, or generated assets.
#
# Size gate: the archive ships as a single GitHub Release asset, so it must
# stay under SIZE_LIMIT_GIB (default 1.9, safely below GitHub's 2 GiB cap).
# If the initial QUALITY exceeds the gate, the DETAIL zooms are re-encoded at
# quality 75, then 70 — z15 spatial resolution is never downgraded silently;
# if quality 70 still cannot fit, the build FAILS with the measurements.
#
# Usage:
#   scripts/build-satellite-map.sh <sentinel.tif> [MAXZOOM]
#   SATELLITE_SRC=<sentinel.tif> scripts/build-satellite-map.sh
#
# Options (environment variables):
#   MAXZOOM       Maximum zoom stored in the archive. Default 15 (hybrid).
#                 13 builds a legacy all-Sentinel archive (no Lantmäteriet
#                 inputs needed); 14 is the explicit lower-detail fallback.
#   MINZOOM       Minimum zoom stored. Default 7 (runtime coverage contract).
#   ORTHO_VRT     Lantmäteriet RGB mosaic VRT. Default
#                 data/source-imagery/lantmateriet-j6/lantmateriet-j6-rgb.vrt
#   ORTHO_ITEMS   Acquisition manifest (for the build plan / provenance).
#                 Default data/source-imagery/lantmateriet-j6/items.json
#   ORTHO_CUTLINE WGS84 coverage cutline bounding the orthophoto overlay.
#                 Default data/source-imagery/lantmateriet-j6/lantmateriet-j6-coverage.geojson
#   ORTHO_PROBES  Gap/orthophoto probe points proving the composition.
#                 Default data/source-imagery/lantmateriet-j6/probes.json
#   TILE_FORMAT   WEBP (default; lossy + alpha) or JPEG/PNG (legacy builds).
#   QUALITY       Initial lossy tile quality. Default 80.
#   SIZE_LIMIT_GIB  Release-asset safety gate. Default 1.9.
#   DEBUG         Keep the intermediate GeoTIFFs/MBTiles for inspection.
#
# Requires: GDAL (gdalinfo, gdalwarp, gdal_translate, gdaladdo), python3
# (sqlite3 stdlib), the pmtiles CLI (go-pmtiles) and node (route bounds and
# canonical tile maths only).

set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:-${SATELLITE_SRC:-}}"
MAXZOOM_ARG="${2:-}"
MAXZOOM="${MAXZOOM_ARG:-${MAXZOOM:-15}}"
MINZOOM="${MINZOOM:-7}"
TILE_FORMAT="$(printf '%s' "${TILE_FORMAT:-WEBP}" | tr '[:lower:]' '[:upper:]')"
QUALITY="${QUALITY:-80}"
SIZE_LIMIT_GIB="${SIZE_LIMIT_GIB:-1.9}"
ORTHO_VRT="${ORTHO_VRT:-data/source-imagery/lantmateriet-j6/lantmateriet-j6-rgb.vrt}"
ORTHO_ITEMS="${ORTHO_ITEMS:-data/source-imagery/lantmateriet-j6/items.json}"
ORTHO_CUTLINE="${ORTHO_CUTLINE:-data/source-imagery/lantmateriet-j6/lantmateriet-j6-coverage.geojson}"
ORTHO_PROBES="${ORTHO_PROBES:-data/source-imagery/lantmateriet-j6/probes.json}"
OUT="public/maps/kungsleden-satellite.pmtiles"
OUT_PROVENANCE="public/maps/kungsleden-satellite-provenance.json"
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"
ROUTE_JSON="src/generated/kungsleden-route.json"
# Must match SATELLITE_TILE_SIZE in src/map/mapStyle.ts (the MapLibre raster
# source is configured for 256 px tiles, which is GDAL's MBTiles default).
TILE_SIZE=256

die() { echo "ERROR: $*" >&2; exit 1; }

# ---- 1. Validate input ------------------------------------------------------
[ -n "$SRC" ] || die "no Sentinel source GeoTIFF given.
Usage: scripts/build-satellite-map.sh <sentinel.tif> [MAXZOOM]
   or: SATELLITE_SRC=<sentinel.tif> scripts/build-satellite-map.sh"
[ -f "$SRC" ] || die "source file not found: $SRC"

case "$TILE_FORMAT" in
  WEBP|JPEG|PNG) ;;
  *) die "TILE_FORMAT must be WEBP, JPEG or PNG (got '$TILE_FORMAT')." ;;
esac
[ "$MAXZOOM" -ge "$MINZOOM" ] 2>/dev/null || die "MAXZOOM ($MAXZOOM) must be >= MINZOOM ($MINZOOM)."

# ---- 2. Validate tools ------------------------------------------------------
for tool in gdalinfo gdalwarp gdal_translate gdaladdo node python3; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' not found on PATH.
Install GDAL (e.g. 'apt-get install gdal-bin' or 'brew install gdal') and Node."
done
command -v "$PMTILES_BIN" >/dev/null 2>&1 || die "pmtiles CLI not found (looked for '$PMTILES_BIN').
Install from https://github.com/protomaps/go-pmtiles/releases or set PMTILES_BIN."

# ---- 3. Coverage contract (never hard-coded) --------------------------------
[ -f "$ROUTE_JSON" ] || die "$ROUTE_JSON missing — run 'npm run generate:route' first."

# One derivation for everything zoom/extent shaped: the z7-aligned overview
# footprint (Sentinel), the z14-aligned detail corridor (Lantmäteriet, exact
# Mercator metres so the warp lands on the tile grid), the Sentinel segment's
# top zoom, and the expected physical tile inventory per zoom.
CONTRACT="$(BUILD_MAXZOOM="$MAXZOOM" node --input-type=module -e "
  import route from './${ROUTE_JSON}' with { type: 'json' };
  import {
    tileAlignedFootprint,
    RASTER_ARCHIVE_MIN_ZOOM, SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM, SATELLITE_DETAIL_MIN_ZOOM,
  } from './src/map/overviewEnvelope.mjs';
  import { tileRange, detailTileInventory } from './scripts/lib/lantmateriet-stac.mjs';
  const cutout = route.mapCutoutBounds;
  const maxZoom = Number(process.env.BUILD_MAXZOOM);
  const ov = tileAlignedFootprint(cutout, RASTER_ARCHIVE_MIN_ZOOM);
  const ovRange = tileRange(cutout, RASTER_ARCHIVE_MIN_ZOOM);
  const inventory = [];
  for (let z = ${MINZOOM}; z <= Math.min(maxZoom, SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM); z++) {
    const f = 2 ** (z - RASTER_ARCHIVE_MIN_ZOOM);
    inventory.push({
      z,
      xMin: ovRange.xMin * f, xMax: (ovRange.xMax + 1) * f - 1,
      yMin: ovRange.yMin * f, yMax: (ovRange.yMax + 1) * f - 1,
      count: ovRange.count * f * f,
    });
  }
  let detail = null;
  if (maxZoom >= SATELLITE_DETAIL_MIN_ZOOM) {
    const ranges = detailTileInventory(cutout, maxZoom);
    inventory.push(...ranges);
    const r = ranges[0];
    const size = 2 ** SATELLITE_DETAIL_MIN_ZOOM;
    const o = 20037508.342789244;
    const t2m = (t) => (t / size) * 2 * o - o;
    detail = {
      footprint: tileAlignedFootprint(cutout, SATELLITE_DETAIL_MIN_ZOOM),
      merc: { xMin: t2m(r.xMin), xMax: t2m(r.xMax + 1), yMin: -t2m(r.yMax + 1), yMax: -t2m(r.yMin) },
    };
  }
  console.log(JSON.stringify({
    overview: ov,
    sentinelMaxZoom: Math.min(maxZoom, SATELLITE_OVERVIEW_MAX_SOURCE_ZOOM),
    detailMinZoom: SATELLITE_DETAIL_MIN_ZOOM,
    detail,
    inventory,
  }));
")"

contract() { printf '%s' "$CONTRACT" | node -p "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); $1"; }

WEST="$(contract 'c.overview.west')"
SOUTH="$(contract 'c.overview.south')"
EAST="$(contract 'c.overview.east')"
NORTH="$(contract 'c.overview.north')"
SENTINEL_MAXZOOM="$(contract 'c.sentinelMaxZoom')"
DETAIL_MINZOOM="$(contract 'c.detailMinZoom')"
HYBRID=0
[ "$MAXZOOM" -ge "$DETAIL_MINZOOM" ] && HYBRID=1

# Web Mercator resolution (m/px) for 256 px tiles at a zoom.
res_at() { node -p "156543.03392804097 / (2 ** $1)"; }
SENTINEL_RES="$(res_at "$SENTINEL_MAXZOOM")"

# ---- 4. Hybrid inputs -------------------------------------------------------
if [ "$HYBRID" = "1" ]; then
  for f in "$ORTHO_VRT" "$ORTHO_ITEMS" "$ORTHO_CUTLINE" "$ORTHO_PROBES"; do
    [ -f "$f" ] || die "$f missing — run scripts/prepare-lantmateriet-orthophoto.sh first.
(To build a legacy all-Sentinel archive instead, pass MAXZOOM=13 explicitly.)"
  done
  command -v gdallocationinfo >/dev/null 2>&1 || die "'gdallocationinfo' not found on PATH (part of GDAL)."
  [ -n "${LM_USERNAME:-}" ] && [ -n "${LM_PASSWORD:-}" ] || die "LM_USERNAME/LM_PASSWORD must be set to stream Lantmäteriet COGs.
They are read from the environment only and never written anywhere."
  DETAIL_RES="$(res_at "$MAXZOOM")"
  DET_W="$(contract 'c.detail.footprint.west')"
  DET_S="$(contract 'c.detail.footprint.south')"
  DET_E="$(contract 'c.detail.footprint.east')"
  DET_N="$(contract 'c.detail.footprint.north')"
  DET_XMIN="$(contract 'c.detail.merc.xMin')"
  DET_XMAX="$(contract 'c.detail.merc.xMax')"
  DET_YMIN="$(contract 'c.detail.merc.yMin')"
  DET_YMAX="$(contract 'c.detail.merc.yMax')"
  ITEM_COUNT="$(node -p "require('./${ORTHO_ITEMS}').items.length")"
  ITEM_BYTES="$(node -p "require('./${ORTHO_ITEMS}').summary.totalNativeBytes")"
  ITEM_DATES="$(node -p "const s=require('./${ORTHO_ITEMS}').summary; s.acquiredFrom+' … '+s.acquiredTo")"
  ORTHO_PCT="$(node -p "require('./${ORTHO_ITEMS}').coverage?.orthophotoPercent ?? 'n/a'")"
  FALLBACK_PCT="$(node -p "require('./${ORTHO_ITEMS}').coverage?.fallbackPercent ?? 'n/a'")"
  FALLBACK_TILES="$(node -p "require('./${ORTHO_ITEMS}').coverage?.fallbackTiles ?? 'n/a'")"
fi

# ---- 5. Build plan ----------------------------------------------------------
SIZE_LIMIT_BYTES="$(node -p "Math.floor(${SIZE_LIMIT_GIB} * 1024 ** 3)")"
echo "── Hybrid satellite archive build plan ──────────────────────────────"
echo "Sentinel source : $SRC"
echo "Overview extent : W $WEST  S $SOUTH  E $EAST  N $NORTH  (z${MINZOOM}-aligned, from $ROUTE_JSON)"
echo "Sentinel zooms  : $MINZOOM … $SENTINEL_MAXZOOM  (target res ${SENTINEL_RES} m/px @ z$SENTINEL_MAXZOOM)"
if [ "$HYBRID" = "1" ]; then
  echo "Ortho source    : $ORTHO_VRT  ($ITEM_COUNT COG items, $ITEM_BYTES native bytes — streamed, not downloaded)"
  echo "Ortho acquired  : $ITEM_DATES"
  echo "Ortho native res: 0.4 m (RGB bands 1–3 only; COG overviews serve the warp)"
  echo "Detail extent   : W $DET_W  S $DET_S  E $DET_E  N $DET_N  (z${DETAIL_MINZOOM}-aligned corridor)"
  echo "Detail zooms    : $DETAIL_MINZOOM … $MAXZOOM  (target res ${DETAIL_RES} m/px @ z$MAXZOOM ≈ $(node -p "(${DETAIL_RES} * Math.cos((${DET_S}/2+${DET_N}/2) * Math.PI/180)).toFixed(2)") m ground)"
  echo "Composition     : Sentinel fallback everywhere; orthophoto composited above"
  echo "                  (${ORTHO_PCT} % of z${DETAIL_MINZOOM} tiles fully orthophoto; ${FALLBACK_TILES} tiles / ${FALLBACK_PCT} % carry Sentinel-fallback pixels)"
else
  echo "Detail zooms    : none (MAXZOOM=$MAXZOOM — legacy all-Sentinel build)"
fi
echo "Expected tiles  :"
contract 'c.inventory.map(r => `  z${String(r.z).padStart(2)}: x ${r.xMin}–${r.xMax} × y ${r.yMin}–${r.yMax} = ${r.count} tiles`).join("\n")'
echo "Tile format     : $TILE_FORMAT (quality $QUALITY, ladder → 75 → 70 under the size gate), ${TILE_SIZE}px"
echo "Size gate       : ${SIZE_LIMIT_GIB} GiB ($SIZE_LIMIT_BYTES bytes) — single GitHub Release asset"
echo "Free disk       : $(df -h . | awk 'NR==2 {print $4}') available in $(pwd)"
echo "Output          : $OUT"
echo

# ---- 6. Inspect Sentinel source --------------------------------------------
echo "── Sentinel source raster ───────────────────────────────────────────"
gdalinfo "$SRC" | grep -E '^Driver|^Size is|^Pixel Size|^Upper Left|^Lower Right|PROJCRS|GEOGCRS' | head -8
BANDS="$(gdalinfo "$SRC" | grep -c '^Band ')"
echo "Bands       : $BANDS"
[ "$BANDS" -ge 3 ] || die "Sentinel source must be an RGB raster (>=3 bands); found $BANDS."
echo

# ---- Temp workspace ---------------------------------------------------------
WORK="$(mktemp -d "${TMPDIR:-/tmp}/satmap.XXXXXX")"
cleanup() { [ -n "${DEBUG:-}" ] || rm -rf "$WORK"; }
trap cleanup EXIT
echo "Workspace: $WORK"
echo

# ---- 7. Sentinel segment: crop + reproject + tile (unchanged pipeline) ------
echo "── Sentinel z${MINZOOM}–z${SENTINEL_MAXZOOM}: warp → EPSG:3857 ───────"
# -te + -te_srs crops in lon/lat; -tr pins the output resolution to the
# segment's top zoom; -tap aligns pixels to that grid (the Mercator origin is
# an exact multiple of every zoom's resolution); -dstalpha makes outside-source
# areas transparent so they never render as black.
gdalwarp \
  -overwrite \
  -t_srs EPSG:3857 \
  -te "$WEST" "$SOUTH" "$EAST" "$NORTH" -te_srs EPSG:4326 \
  -tr "$SENTINEL_RES" "$SENTINEL_RES" -tap \
  -r bilinear \
  -dstalpha \
  -wo NUM_THREADS=ALL_CPUS \
  -co TILED=YES -co COMPRESS=DEFLATE -co BIGTIFF=IF_SAFER \
  "$SRC" "$WORK/sentinel_3857.tif"
echo

echo "── Sentinel base tiles (z$SENTINEL_MAXZOOM) → MBTiles ($TILE_FORMAT) ─"
gdal_translate -of MBTILES \
  -co "TILE_FORMAT=$TILE_FORMAT" \
  -co "QUALITY=$QUALITY" \
  -co "BLOCKSIZE=$TILE_SIZE" \
  -co ZOOM_LEVEL_STRATEGY=LOWER \
  "$WORK/sentinel_3857.tif" "$WORK/sentinel.mbtiles"

echo "── Sentinel overviews z$((SENTINEL_MAXZOOM-1))…z$MINZOOM ────────────"
FACTORS=""
for ((k = 1; k <= SENTINEL_MAXZOOM - MINZOOM; k++)); do
  FACTORS="$FACTORS $((2 ** k))"
done
# shellcheck disable=SC2086
gdaladdo -r average "$WORK/sentinel.mbtiles" $FACTORS
echo

# ---- 8. Detail segment: Sentinel fallback + Lantmäteriet composited above ---
if [ "$HYBRID" = "1" ]; then
  # Probe helper: sample the composite raster at the acquisition-derived
  # gap/orthophoto probe points. Written as JSON so before/after states can
  # be compared exactly.
  probe_detail() {
    python3 - "$WORK/detail_3857.tif" "$ORTHO_PROBES" "$1" <<'EOF'
import json, subprocess, sys
raster, probes_path, out_path = sys.argv[1:4]
probes = json.load(open(probes_path))
def sample(points):
    values = []
    for p in points:
        out = subprocess.run(
            ["gdallocationinfo", "-valonly", "-wgs84", raster, str(p["lon"]), str(p["lat"])],
            check=True, capture_output=True, text=True).stdout.split()
        values.append([int(float(v)) for v in out])
    return values
json.dump({"gap": sample(probes["gapProbes"]), "ortho": sample(probes["orthoProbes"])},
          open(out_path, "w"))
EOF
  }

  echo "── Detail step 1: Sentinel fallback → exact z${MAXZOOM} corridor grid ─"
  # The complete underlying raster: every corridor pixel gets real Sentinel
  # imagery first, so orthophoto flight-coverage gaps cost detail, never
  # coverage. The Sentinel source covers the whole z7 overview footprint,
  # which strictly contains the corridor — asserted, not assumed.
  python3 - "$SRC" "$DET_XMIN" "$DET_YMIN" "$DET_XMAX" "$DET_YMAX" <<'EOF'
import json, subprocess, sys
src, xmin, ymin, xmax, ymax = sys.argv[1], *map(float, sys.argv[2:6])
info = json.loads(subprocess.run(["gdalinfo", "-json", src],
                                 check=True, capture_output=True, text=True).stdout)
(sx0, sy0), (sx1, sy1) = info["cornerCoordinates"]["lowerLeft"], info["cornerCoordinates"]["upperRight"]
if not (sx0 <= xmin and sy0 <= ymin and sx1 >= xmax and sy1 >= ymax):
    sys.exit(f"FATAL: Sentinel source extent ({sx0},{sy0})–({sx1},{sy1}) does not contain "
             f"the detail corridor ({xmin},{ymin})–({xmax},{ymax}) — no complete fallback possible.")
print("  ✓ Sentinel source fully contains the detail corridor (complete fallback)")
EOF
  gdalwarp \
    -overwrite \
    -t_srs EPSG:3857 \
    -te "$DET_XMIN" "$DET_YMIN" "$DET_XMAX" "$DET_YMAX" \
    -tr "$DETAIL_RES" "$DETAIL_RES" \
    -r cubic \
    -multi -wo NUM_THREADS=ALL_CPUS -wm 1024 \
    -co TILED=YES -co COMPRESS=DEFLATE -co BIGTIFF=YES \
    "$SRC" "$WORK/detail_3857.tif"
  probe_detail "$WORK/probes_fallback.json"
  echo

  echo "── Detail step 2: Lantmäteriet overlay (streaming COG warp) ─────────"
  echo "Remote reads use the COGs' internal overview levels; expect a few GiB"
  echo "of transfer, not the $ITEM_BYTES-byte native dataset."
  # UPDATE-mode warp into the fallback raster (no -overwrite): a pixel is
  # replaced by orthophoto if and only if
  #   1. its centre lies inside the cataloged coverage cutline, and
  #   2. the source pixel is valid — the VRT declares Lantmäteriet's
  #      unified 0,0,0 no-data (UNIFIED_SRC_NODATA), so declared no-data
  #      inside boundary cells keeps the Sentinel pixel instead of going
  #      black.
  # This IS the validity-mask priority rule: hard per-pixel, no -cblend, no
  # feathering — a visible source seam is correct.
  #
  # Credentials reach GDAL through its own environment variables only.
  # EMPTY_DIR suppresses sibling-file directory scans on every COG open;
  # the extension allowlist stops any non-TIFF fetch; retries ride out
  # transient CDN failures mid-warp. Cubic resampling suits continuous-tone
  # aerial imagery (never nearest-neighbour).
  GDAL_HTTP_AUTH=BASIC \
  GDAL_HTTP_USERPWD="${LM_USERNAME}:${LM_PASSWORD}" \
  GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
  CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif" \
  CPL_VSIL_CURL_CACHE_SIZE=268435456 \
  GDAL_HTTP_MAX_RETRY=5 \
  GDAL_HTTP_RETRY_DELAY=5 \
  GDAL_CACHEMAX=2048 \
  gdalwarp \
    -t_srs EPSG:3857 \
    -r cubic \
    -cutline "$ORTHO_CUTLINE" \
    -wo UNIFIED_SRC_NODATA=YES \
    -multi -wo NUM_THREADS=ALL_CPUS -wm 1024 \
    "$ORTHO_VRT" "$WORK/detail_3857.tif"
  echo

  echo "── Detail composition proof (probe points) ──────────────────────────"
  # Gap probes must be untouched Sentinel; orthophoto probes must have been
  # replaced; nothing may be no-data black. Failing any of these means the
  # composition is wrong — a hard stop, not something to discover on a fell.
  probe_detail "$WORK/probes_composite.json"
  python3 - "$WORK/probes_fallback.json" "$WORK/probes_composite.json" <<'EOF'
import json, sys
before = json.load(open(sys.argv[1]))
after = json.load(open(sys.argv[2]))
problems = []
for i, (b, a) in enumerate(zip(before["gap"], after["gap"])):
    if a != b:
        problems.append(f"gap probe {i}: Sentinel pixel {b} was overwritten with {a}")
    if a[:3] == [0, 0, 0]:
        problems.append(f"gap probe {i}: no-data black in the composite")
changed = 0
for i, (b, a) in enumerate(zip(before["ortho"], after["ortho"])):
    if a != b:
        changed += 1
    if a[:3] == [0, 0, 0]:
        problems.append(f"orthophoto probe {i}: no-data black in the composite")
total = len(before["ortho"])
if total and changed < max(1, round(total * 0.8)):
    problems.append(f"only {changed}/{total} orthophoto probes changed — overlay did not take priority")
if problems:
    sys.exit("FATAL: composition proof failed:\n  " + "\n  ".join(problems))
print(f"  ✓ {len(before['gap'])} gap probes kept their Sentinel pixels (no holes, no black)")
print(f"  ✓ {changed}/{total} orthophoto probes replaced by Lantmäteriet (source priority)")
EOF
  echo
fi

# ---- 9. Tile, merge, convert — with the quality ladder under the size gate --
build_detail_mbtiles() {
  local quality="$1"
  echo "── Detail tiles (z$MAXZOOM base @ quality $quality) → MBTiles ───────"
  rm -f "$WORK/detail.mbtiles"
  gdal_translate -of MBTILES \
    -co "TILE_FORMAT=$TILE_FORMAT" \
    -co "QUALITY=$quality" \
    -co "BLOCKSIZE=$TILE_SIZE" \
    -co ZOOM_LEVEL_STRATEGY=LOWER \
    "$WORK/detail_3857.tif" "$WORK/detail.mbtiles"
  if [ "$MAXZOOM" -gt "$DETAIL_MINZOOM" ]; then
    echo "── Detail overviews z$((MAXZOOM-1))…z$DETAIL_MINZOOM ──────────────"
    local factors=""
    for ((k = 1; k <= MAXZOOM - DETAIL_MINZOOM; k++)); do
      factors="$factors $((2 ** k))"
    done
    # shellcheck disable=SC2086
    gdaladdo -r average "$WORK/detail.mbtiles" $factors
  fi
}

merge_and_convert() {
  echo "── Merging zoom segments → one MBTiles ──────────────────────────────"
  printf '%s' "$CONTRACT" > "$WORK/contract.json"
  python3 - "$WORK" "$MINZOOM" "$MAXZOOM" "$HYBRID" "$TILE_FORMAT" <<'EOF'
import json, shutil, sqlite3, sys
work, minz, maxz, hybrid, tile_format = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4] == "1", sys.argv[5]
out = f"{work}/satellite.mbtiles"
shutil.copy(f"{work}/sentinel.mbtiles", out)
db = sqlite3.connect(out)
if hybrid:
    db.execute("ATTACH ? AS detail", (f"{work}/detail.mbtiles",))
    db.execute("INSERT OR REPLACE INTO tiles SELECT * FROM detail.tiles")
    db.commit()
    db.execute("DETACH detail")
db.execute("UPDATE metadata SET value=? WHERE name='minzoom'", (str(minz),))
db.execute("UPDATE metadata SET value=? WHERE name='maxzoom'", (str(maxz),))
db.execute("INSERT OR REPLACE INTO metadata(name,value) VALUES('name','Kungsleden satellite (Sentinel-2 overview + Lantmäteriet orthophoto detail)')")
db.execute("INSERT OR REPLACE INTO metadata(name,value) VALUES('format',?)", (tile_format.lower(),))
db.commit()

# Physical per-zoom inventory (XYZ ranges; MBTiles rows are TMS, flip y),
# verified against the contract-derived expectation: every zoom must be the
# complete expected rectangle — a single missing tile is a hole a hiker
# would find as blank imagery, so it fails the build here.
expected = {r["z"]: r for r in json.load(open(f"{work}/contract.json"))["inventory"]}
inventory = []
problems = []
for z, xmin, xmax, tms_ymin, tms_ymax, count in db.execute(
        "SELECT zoom_level, MIN(tile_column), MAX(tile_column), MIN(tile_row), MAX(tile_row), COUNT(*) "
        "FROM tiles GROUP BY zoom_level ORDER BY zoom_level"):
    ymin = 2**z - 1 - tms_ymax
    ymax = 2**z - 1 - tms_ymin
    inventory.append({"zoom": z, "x": [xmin, xmax], "y": [ymin, ymax], "count": count})
    exp = expected.get(z)
    if exp is None:
        problems.append(f"z{z}: unexpected zoom level present")
    elif [xmin, xmax, ymin, ymax, count] != [exp["xMin"], exp["xMax"], exp["yMin"], exp["yMax"], exp["count"]]:
        problems.append(
            f"z{z}: got x {xmin}-{xmax} y {ymin}-{ymax} count {count}, "
            f"expected x {exp['xMin']}-{exp['xMax']} y {exp['yMin']}-{exp['yMax']} count {exp['count']}")
for z in sorted(set(expected) - {r["zoom"] for r in inventory}):
    problems.append(f"z{z}: expected zoom level missing entirely")
json.dump(inventory, open(f"{work}/inventory.json", "w"))
for row in inventory:
    print(f"  z{row['zoom']:>2}: x {row['x'][0]}–{row['x'][1]} × y {row['y'][0]}–{row['y'][1]} = {row['count']} tiles")
if problems:
    sys.exit("FATAL: physical tile inventory does not match the coverage contract:\n  " + "\n  ".join(problems))
print(f"  ✓ every declared zoom is a complete rectangle ({sum(r['count'] for r in inventory)} tiles total)")
EOF

  echo "── Converting MBTiles → PMTiles ────────────────────────────────────"
  mkdir -p "$(dirname "$OUT")"
  rm -f "$OUT"
  "$PMTILES_BIN" convert "$WORK/satellite.mbtiles" "$OUT"
}

QUALITY_USED="$QUALITY"
if [ "$HYBRID" = "1" ]; then
  LADDER="$QUALITY"
  [ "$QUALITY" -gt 75 ] && LADDER="$LADDER 75"
  [ "$QUALITY" -gt 70 ] && LADDER="$LADDER 70"
  FITTED=0
  for q in $LADDER; do
    QUALITY_USED="$q"
    build_detail_mbtiles "$q"
    merge_and_convert
    BYTES="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")"
    echo "Archive size at detail quality $q: $BYTES bytes ($(node -p "(${BYTES}/1024**3).toFixed(2)") GiB; gate ${SIZE_LIMIT_GIB} GiB)"
    if [ "$BYTES" -le "$SIZE_LIMIT_BYTES" ]; then
      FITTED=1
      break
    fi
    echo "→ over the single-release-asset gate; retrying with lower DETAIL quality (z$MAXZOOM resolution unchanged)…"
  done
  if [ "$FITTED" != "1" ]; then
    die "archive is $BYTES bytes at detail quality $QUALITY_USED — cannot meet the ${SIZE_LIMIT_GIB} GiB
single-release-asset contract even at quality 70. NOT downgrading max zoom silently:
re-run with MAXZOOM=14 only as an explicit decision."
  fi
else
  merge_and_convert
  BYTES="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")"
  [ "$BYTES" -le "$SIZE_LIMIT_BYTES" ] || die "archive is $BYTES bytes — over the ${SIZE_LIMIT_GIB} GiB release-asset gate."
fi
echo

# ---- 10. Verify -------------------------------------------------------------
echo "── Verifying archive ───────────────────────────────────────────────"
"$PMTILES_BIN" verify "$OUT"
echo

# ---- 11. Report + provenance ------------------------------------------------
echo "── Archive summary ─────────────────────────────────────────────────"
"$PMTILES_BIN" show "$OUT" | sed -n '1,30p'
SHA256="$(shasum -a 256 "$OUT" 2>/dev/null | awk '{print $1}' || sha256sum "$OUT" | awk '{print $1}')"
BYTES="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")"

WORKDIR="$WORK" OUT_PATH="$OUT" OUT_BYTES="$BYTES" OUT_SHA="$SHA256" QUALITY_USED="$QUALITY_USED" \
TILE_FORMAT="$TILE_FORMAT" MINZOOM="$MINZOOM" MAXZOOM="$MAXZOOM" HYBRID="$HYBRID" \
ORTHO_ITEMS="$ORTHO_ITEMS" SENTINEL_SRC="$SRC" \
node --input-type=module -e "
  import { readFileSync, writeFileSync } from 'node:fs';
  const env = process.env;
  const contract = JSON.parse(readFileSync(env.WORKDIR + '/contract.json', 'utf8'));
  const inventory = JSON.parse(readFileSync(env.WORKDIR + '/inventory.json', 'utf8'));
  const hybrid = env.HYBRID === '1';
  const ortho = hybrid ? JSON.parse(readFileSync(env.ORTHO_ITEMS, 'utf8')) : null;
  const provenance = {
    generated: new Date().toISOString(),
    archive: {
      path: env.OUT_PATH, bytes: Number(env.OUT_BYTES), sha256: env.OUT_SHA,
      minZoom: Number(env.MINZOOM), maxZoom: Number(env.MAXZOOM),
      tileFormat: env.TILE_FORMAT, detailQuality: Number(env.QUALITY_USED),
      bounds: contract.overview,
      tilesByZoom: inventory,
    },
    sources: {
      sentinel: {
        file: env.SENTINEL_SRC,
        zooms: [Number(env.MINZOOM), contract.sentinelMaxZoom],
        role: hybrid
          ? 'overview zooms + complete fallback raster under the detail corridor'
          : 'all zooms',
        attribution: 'Sentinel-2 cloudless — s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
      },
      lantmateriet: hybrid ? {
        collection: ortho.collection, stacApi: ortho.stacApi,
        zooms: [contract.detailMinZoom, Number(env.MAXZOOM)],
        items: ortho.summary.count, nativeBytes: ortho.summary.totalNativeBytes,
        acquired: [ortho.summary.acquiredFrom, ortho.summary.acquiredTo],
        role: 'detail zooms, composited above the Sentinel fallback wherever valid orthophoto pixels exist',
        coverage: ortho.coverage ?? null,
        attribution: 'Ortofoto © Lantmäteriet (CC BY 4.0), processed/modified for Fjallkompis',
      } : null,
    },
    composition: hybrid ? {
      model: 'sentinel-fallback',
      probes: {
        fallback: JSON.parse(readFileSync(env.WORKDIR + '/probes_fallback.json', 'utf8')),
        composite: JSON.parse(readFileSync(env.WORKDIR + '/probes_composite.json', 'utf8')),
      },
    } : null,
  };
  writeFileSync('${OUT_PROVENANCE}', JSON.stringify(provenance, null, 2) + '\n');
  const b = contract.overview;
  console.log('Provenance  : ${OUT_PROVENANCE}');
  if (hybrid && ortho.coverage) {
    const c = ortho.coverage;
    console.log();
    console.log('── Detail-corridor composition (z' + c.detailMinZoom + ' tiles) ──────────────────────');
    console.log('orthophoto (Lantmäteriet) : ' + c.fullyOrthophoto + '/' + c.totalTiles + ' tiles fully covered (' + c.orthophotoPercent + ' %)');
    console.log('Sentinel fallback         : ' + c.sentinelOnly + ' tiles fully, ' + c.partialOrthophoto + ' tiles partially (' + c.fallbackPercent + ' % carry fallback pixels)');
  }
  console.log();
  console.log('── mapCatalog.mjs revision values (measured, paste into satellite) ──');
  console.log('bytes      :', env.OUT_BYTES);
  console.log('sha256     :', env.OUT_SHA);
  console.log('bounds     : [[' + b.west + ', ' + b.south + '], [' + b.east + ', ' + b.north + ']]');
  console.log('minZoom    :', env.MINZOOM, ' maxZoom:', env.MAXZOOM);
  console.log('tilesByZoom:');
  for (const r of inventory) {
    console.log('  { zoom: ' + r.zoom + ', x: [' + r.x.join(', ') + '], y: [' + r.y.join(', ') + '], count: ' + r.count + ' },');
  }
  if (hybrid) {
    console.log();
    console.log('Remember (hybrid ship checklist):');
    console.log('  - bump the satellite revision id + release tag in src/map/mapCatalog.mjs;');
    console.log('  - move the previous bytes into supersededBytes;');
    console.log('  - set SATELLITE_ARCHIVE_MAX_ZOOM in src/map/overviewEnvelope.mjs to ' + env.MAXZOOM + ';');
    console.log('  - flip present: true on lantmateriet-ortofoto in src/data/attribution.ts;');
    console.log('  - update the satellite zooms literal in tests/coverage-contract.test.mjs.');
  }
"
echo
echo "tile size   : ${TILE_SIZE}px (MapLibre SATELLITE_TILE_SIZE)"
echo "file size   : $BYTES bytes"
echo "sha256      : $SHA256"
echo "output      : $OUT"
echo "✓ Done. The Satellite layer will detect this archive on next load."
