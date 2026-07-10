#!/usr/bin/env bash
#
# Build the two terrain-relief PMTiles archives for a route corridor from the
# Copernicus DEM GLO-30 open elevation model:
#
#   public/maps/kungsleden-terrain.pmtiles   terrain-RGB raster (terrarium
#                                            encoding, 256px PNG, z6–12) for
#                                            MapLibre's native hillshade layer
#   public/maps/kungsleden-contours.pmtiles  contour vectors (layer
#                                            "contours", property `elev`,
#                                            20 m interval, z11–13)
#
# Data source: Copernicus DEM GLO-30 Public — AWS Open Data mirror, 2021
# release (~30 m global DEM), streamed directly from the public bucket (no
# account needed; registry: https://registry.opendata.aws/copernicus-dem/).
# Required credit (already registered in src/data/attribution.ts): "Produced
# using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and
# Space GmbH 2014–2018 provided under COPERNICUS by the European Union and
# ESA; all rights reserved".
#
# Provenance: every run writes public/maps/<route>-terrain-provenance.json
# (source tile names/URLs/sizes/ETags/SHA-256s, tool versions, parameters,
# output hashes) — attach it to the terrain-data release next to the
# archives. The pipeline is REPEATABLE from that manifest, not bit-for-bit
# reproducible: the AWS mirror exposes one current copy per tile (no
# version pinning), so a rerun after an upstream update produces different
# source hashes — the manifest records exactly which inputs a build used.
#
# The crop bounding box is read from the GPX-derived route data
# (mapCutoutBounds in src/generated/kungsleden-route.json = route bounds +
# ~9 km buffer) — the exact same box as the vector and satellite archives,
# never hard-coded here. Run `npm run generate:route` first if it is missing.
#
# Design decisions (validated in the 0.14.0 relief iteration):
#  - terrarium encoding with heights rounded to 1 m: the blue channel stays
#    zero, which roughly halves the PNG payload; 1 m precision is far below
#    anything hillshading can show from a 30 m DEM;
#  - every zoom level is warped from the source DEM separately (no RGB
#    overviews: averaging encoded channels would corrupt heights) onto the
#    exact 3857 tile grid of that zoom;
#  - tile extents are expanded to whole tiles and the no-data margin is
#    filled by smooth extrapolation (gdal_fillnodata), so no tile ever
#    contains padding that would decode as -32768 m and smear the hillshade;
#  - contours: 20 m interval with every 100 m as the index line — selected
#    from the 30 m DEM resolution, visual comparison, contour noise and
#    storage measurements (a 10 m build was rejected: mostly noise at 3-4x
#    the size). 100 m lines get tile minzoom 11, the rest 13; tiles stop at
#    z13 (the DEM has no honest information beyond that — MapLibre
#    overzooms them to the map cap);
#  - terrain tiles stop at z12 (~14 m/px at 68°N, already finer than the
#    30 m source) and overzoom above.
#
# Usage:
#   scripts/build-terrain-map.sh [ROUTE_ID]     (default: kungsleden)
#
# Options (environment variables):
#   TERRAIN_MINZOOM / TERRAIN_MAXZOOM   default 6 / 12
#   CONTOUR_INTERVAL                    default 20 (metres)
#   CONTOUR_INDEX                       default 100 (metres, must be a
#                                       multiple of the interval)
#   DEBUG                               keep the work directory
#
# Requires: GDAL (incl. gdal_calc.py / gdal_fillnodata.py), tippecanoe, the
# pmtiles CLI (go-pmtiles), node, python3 and curl.

set -euo pipefail
cd "$(dirname "$0")/.."

ROUTE_ID="${1:-kungsleden}"
TERRAIN_MINZOOM="${TERRAIN_MINZOOM:-6}"
TERRAIN_MAXZOOM="${TERRAIN_MAXZOOM:-12}"
CONTOUR_INTERVAL="${CONTOUR_INTERVAL:-20}"
CONTOUR_INDEX="${CONTOUR_INDEX:-100}"
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"
ROUTE_JSON="src/generated/${ROUTE_ID}-route.json"
OUT_TERRAIN="public/maps/${ROUTE_ID}-terrain.pmtiles"
OUT_CONTOURS="public/maps/${ROUTE_ID}-contours.pmtiles"
DEM_BUCKET="https://copernicus-dem-30m.s3.amazonaws.com"

die() { echo "ERROR: $*" >&2; exit 1; }

for tool in gdalwarp gdalbuildvrt gdal_translate gdal_contour gdal_calc.py \
            gdal_fillnodata.py tippecanoe node python3 curl; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' not found on PATH."
done
command -v "$PMTILES_BIN" >/dev/null 2>&1 || die "pmtiles CLI not found (set PMTILES_BIN)."
[ -f "$ROUTE_JSON" ] || die "$ROUTE_JSON missing — run 'npm run generate:route' first."
[ $((CONTOUR_INDEX % CONTOUR_INTERVAL)) -eq 0 ] || die "CONTOUR_INDEX must be a multiple of CONTOUR_INTERVAL."

# ---- Route bounds (never hard-coded) ---------------------------------------
read -r WEST SOUTH EAST NORTH <<EOF
$(node -p "
  const b = require('./${ROUTE_JSON}').mapCutoutBounds;
  [b[0][0], b[0][1], b[1][0], b[1][1]].join(' ');
")
EOF
[ -n "$NORTH" ] || die "could not read mapCutoutBounds from $ROUTE_JSON."

WORK="$(mktemp -d "${TMPDIR:-/tmp}/terrainmap.XXXXXX")"
cleanup() { [ -n "${DEBUG:-}" ] || rm -rf "$WORK"; }
trap cleanup EXIT

echo "── Terrain relief build ─────────────────────────────────────────────"
echo "Route    : $ROUTE_ID"
echo "Bounds   : W $WEST  S $SOUTH  E $EAST  N $NORTH (from $ROUTE_JSON)"
echo "Terrain  : terrarium PNG z${TERRAIN_MINZOOM}–${TERRAIN_MAXZOOM} → $OUT_TERRAIN"
echo "Contours : ${CONTOUR_INTERVAL} m (index ${CONTOUR_INDEX} m) z11–13 → $OUT_CONTOURS"
echo

# ---- 1. Download the GLO-30 tiles covering the bounds ----------------------
echo "── Downloading Copernicus GLO-30 DEM tiles ──────────────────────────"
TILES="$(python3 -c "
import math
for lat in range(math.floor($SOUTH), math.ceil($NORTH)):
    for lon in range(math.floor($WEST), math.ceil($EAST)):
        ns = 'N' if lat >= 0 else 'S'
        ew = 'E' if lon >= 0 else 'W'
        print(f'Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM')
")"
: > "$WORK/source-tiles.txt"
for t in $TILES; do
  echo "  $t"
  curl -sfS -D "$WORK/$t.headers" -o "$WORK/$t.tif" "$DEM_BUCKET/$t/$t.tif" \
    || die "DEM tile download failed: $t (no GLO-30 coverage here?)"
  # Provenance row: name|url|bytes|ETag|sha256 (S3 ETag = MD5 for these
  # single-part objects; the sha256 is computed from the downloaded file).
  printf '%s|%s|%s|%s|%s\n' \
    "$t" "$DEM_BUCKET/$t/$t.tif" "$(stat -f%z "$WORK/$t.tif" 2>/dev/null || stat -c%s "$WORK/$t.tif")" \
    "$(grep -i '^etag:' "$WORK/$t.headers" | tr -d '\r"' | awk '{print $2}')" \
    "$(shasum -a 256 "$WORK/$t.tif" | awk '{print $1}')" >> "$WORK/source-tiles.txt"
done

gdalbuildvrt -q "$WORK/merged.vrt" "$WORK"/Copernicus_*.tif
gdalwarp -overwrite -q -te "$WEST" "$SOUTH" "$EAST" "$NORTH" -r bilinear \
  -co COMPRESS=DEFLATE "$WORK/merged.vrt" "$WORK/crop.tif"

# ---- 2. Terrain-RGB (terrarium) archive ------------------------------------
echo "── Terrain-RGB tiles (per-zoom warp → terrarium encode) ─────────────"
for ((z = TERRAIN_MINZOOM; z <= TERRAIN_MAXZOOM; z++)); do
  # Tile-aligned extent: whole 256px tiles of this zoom's 3857 grid.
  read -r TE_XMIN TE_YMIN TE_XMAX TE_YMAX RES <<EOF
$(python3 -c "
import math
res = 156543.03392804097 / 2**$z
tile = 256 * res
o = 20037508.342789244
def merc(lon, lat):
    return lon * o / 180.0, math.log(math.tan((90 + lat) * math.pi / 360.0)) * o / math.pi
x0, y0 = merc($WEST, $SOUTH); x1, y1 = merc($EAST, $NORTH)
print(math.floor((x0 + o) / tile) * tile - o,
      math.floor((y0 + o) / tile) * tile - o,
      math.ceil((x1 + o) / tile) * tile - o,
      math.ceil((y1 + o) / tile) * tile - o, res)
")
EOF
  echo "  z$z (${RES} m/px)"
  gdalwarp -overwrite -q -t_srs EPSG:3857 \
    -te "$TE_XMIN" "$TE_YMIN" "$TE_XMAX" "$TE_YMAX" -tr "$RES" "$RES" \
    -r bilinear -dstnodata -9999 "$WORK/crop.tif" "$WORK/z${z}_nd.tif"
  gdal_fillnodata.py -q -md 100000 "$WORK/z${z}_nd.tif" "$WORK/z${z}_f32.tif"
  # v = round(h) + 32768 ; R = v >> 8 ; G = v & 255 ; B = 0
  gdal_calc.py --overwrite --quiet -A "$WORK/z${z}_f32.tif" --type=Byte \
    --outfile="$WORK/z${z}_r.tif" --calc="numpy.floor((numpy.round(A)+32768)/256.0)"
  gdal_calc.py --overwrite --quiet -A "$WORK/z${z}_f32.tif" --type=Byte \
    --outfile="$WORK/z${z}_g.tif" --calc="numpy.mod(numpy.round(A)+32768,256)"
  gdal_calc.py --overwrite --quiet -A "$WORK/z${z}_f32.tif" --type=Byte \
    --outfile="$WORK/z${z}_b.tif" --calc="A*0"
  gdalbuildvrt -q -separate "$WORK/z${z}_rgb.vrt" \
    "$WORK/z${z}_r.tif" "$WORK/z${z}_g.tif" "$WORK/z${z}_b.tif"
  # Raster already sits on the tile grid: NEAREST is an identity copy.
  gdal_translate -q -of MBTILES -co TILE_FORMAT=PNG -co RESAMPLING=NEAREST \
    -co ZOOM_LEVEL_STRATEGY=LOWER "$WORK/z${z}_rgb.vrt" "$WORK/z${z}.mbtiles"
done

echo "── Merging zoom levels → PMTiles ────────────────────────────────────"
python3 - "$WORK" "$TERRAIN_MINZOOM" "$TERRAIN_MAXZOOM" <<'EOF'
import sqlite3, sys, shutil
work, minz, maxz = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
out = f"{work}/terrain.mbtiles"
shutil.copy(f"{work}/z{maxz}.mbtiles", out)
db = sqlite3.connect(out)
for z in range(minz, maxz):
    db.execute("ATTACH ? AS src", (f"{work}/z{z}.mbtiles",))
    db.execute("INSERT OR REPLACE INTO tiles SELECT * FROM src.tiles")
    db.commit()
    db.execute("DETACH src")
db.execute("UPDATE metadata SET value=? WHERE name='minzoom'", (str(minz),))
db.execute("UPDATE metadata SET value=? WHERE name='maxzoom'", (str(maxz),))
db.execute("INSERT OR REPLACE INTO metadata(name,value) VALUES('name','Terrain (terrarium RGB, Copernicus DEM GLO-30)')")
db.execute("INSERT OR REPLACE INTO metadata(name,value) VALUES('format','png')")
db.commit()
n = db.execute("SELECT COUNT(*) FROM tiles").fetchone()[0]
print(f"  merged {n} terrain tiles (z{minz}–z{maxz})")
EOF
mkdir -p public/maps
rm -f "$OUT_TERRAIN"
"$PMTILES_BIN" convert "$WORK/terrain.mbtiles" "$OUT_TERRAIN" >/dev/null
"$PMTILES_BIN" verify "$OUT_TERRAIN"

# ---- 3. Contour archive -----------------------------------------------------
echo "── Contours (${CONTOUR_INTERVAL} m, index ${CONTOUR_INDEX} m) ───────"
gdal_contour -q -i "$CONTOUR_INTERVAL" -a elev -f GeoJSONSeq \
  "$WORK/crop.tif" "$WORK/contours.geojsons"
node - "$WORK/contours.geojsons" "$WORK/contours_tagged.geojsons" "$CONTOUR_INDEX" <<'EOF'
// Tag per-feature tile minzooms: index contours land in z11 tiles, the
// full interval set in z13 (kept in sync with libertyTopoLayers.mjs).
const readline = require('node:readline');
const fs = require('node:fs');
const [input, output, indexStepArg] = process.argv.slice(2);
const indexStep = Number(indexStepArg);
const rl = readline.createInterface({ input: fs.createReadStream(input) });
const out = fs.createWriteStream(output);
let n = 0;
rl.on('line', (line) => {
  line = line.replace(/^\x1e/, '').trim();
  if (!line) return;
  const f = JSON.parse(line);
  const elev = Math.round(f.properties.elev);
  f.properties = { elev };
  f.tippecanoe = {
    minzoom: elev % indexStep === 0 ? 11 : 13,
    maxzoom: 13,
    layer: 'contours',
  };
  out.write(JSON.stringify(f) + '\n');
  n++;
});
rl.on('close', () => {
  out.end();
  console.log(`  tagged ${n} contour lines`);
});
EOF
tippecanoe -q -o "$WORK/contours.mbtiles" -Z11 -z13 -y elev \
  --drop-densest-as-needed --force "$WORK/contours_tagged.geojsons"

# Retention check: --drop-densest-as-needed is a safety valve for the 500 kB
# tile cap; measured on the 0.14.0 build it never fires (no tile close to
# the cap, all elevation classes retained). This guard fails the build if a
# future terrain/interval change ever makes it silently drop contour levels.
echo "── Contour retention check ──────────────────────────────────────────"
python3 - "$WORK" <<'EOF'
import json, sqlite3, sys
work = sys.argv[1]
src = set()
with open(f"{work}/contours_tagged.geojsons") as fh:
    for line in fh:
        src.add(json.loads(line)["properties"]["elev"])
db = sqlite3.connect(f"{work}/contours.mbtiles")
meta = json.loads(db.execute("SELECT value FROM metadata WHERE name='json'").fetchone()[0])
attr = next(a for lyr in meta["tilestats"]["layers"] if lyr["layer"] == "contours"
            for a in lyr["attributes"] if a["attribute"] == "elev")
tiled = set(attr["values"])
missing = sorted(src - tiled)
maxsize = {z: s for z, s in db.execute(
    "SELECT zoom_level, MAX(LENGTH(tile_data)) FROM tiles GROUP BY zoom_level")}
print(f"  elevation classes: source {len(src)}, in tiles {len(tiled)}")
print("  max tile bytes per zoom:", maxsize, "(tippecanoe cap: 500000)")
if missing:
    sys.exit(f"FATAL: contour levels missing from tiles (dropped?): {missing}")
if any(s > 450_000 for s in maxsize.values()):
    sys.exit("FATAL: a contour tile is within 10% of the 500 kB cap — "
             "the drop-densest safety valve is about to fire; re-evaluate "
             "the interval/zoom split before shipping.")
print("  ✓ all contour levels retained; comfortable tile-size headroom")
EOF

rm -f "$OUT_CONTOURS"
"$PMTILES_BIN" convert "$WORK/contours.mbtiles" "$OUT_CONTOURS" >/dev/null
"$PMTILES_BIN" verify "$OUT_CONTOURS"

# ---- 4. Provenance manifest ---------------------------------------------------
# Attach this file to the terrain-data release next to the two archives; it
# records exactly which upstream inputs and tools produced them (repeatable
# builds — see the header note on why not bit-for-bit reproducible).
OUT_PROVENANCE="public/maps/${ROUTE_ID}-terrain-provenance.json"
node scripts/generate-terrain-provenance.mjs \
  --source-tiles "$WORK/source-tiles.txt" \
  --route "$ROUTE_ID" \
  --bounds "$WEST,$SOUTH,$EAST,$NORTH" \
  --terrain-zooms "$TERRAIN_MINZOOM,$TERRAIN_MAXZOOM" \
  --contour-intervals "$CONTOUR_INTERVAL,$CONTOUR_INDEX" \
  --out "$OUT_PROVENANCE"

# ---- 5. Report ---------------------------------------------------------------
echo
echo "── Archive summary ──────────────────────────────────────────────────"
for f in "$OUT_TERRAIN" "$OUT_CONTOURS"; do
  ls -lh "$f" | awk '{print $9 " (" $5 ")"}'
  shasum -a 256 "$f" | awk '{print "  sha256 " $1}'
done
echo "✓ Done. The Terrain relief card and map layers detect these archives."
echo "  Upload $OUT_PROVENANCE to the terrain-data release with the archives."
