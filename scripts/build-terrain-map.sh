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
# userBufferKm + dataMarginKm) — the exact same box as the vector and
# satellite archives,
# never hard-coded here. Run `npm run generate:route` first if it is missing.
#
# Design decisions (0.14.0 relief iteration + 0.15.0 bounded-map iteration):
#  - terrarium encoding with heights rounded to 1 m: the blue channel stays
#    zero, which roughly halves the PNG payload; 1 m precision is far below
#    anything hillshading can show from a 30 m DEM;
#  - every zoom level is warped from the source DEM separately (no RGB
#    overviews: averaging encoded channels would corrupt heights) onto the
#    exact 3857 tile grid of that zoom;
#  - REAL DEM EVERYWHERE (0.15.0): tile extents are expanded to whole tiles
#    per zoom, and the SOURCE download covers the tile-aligned footprint of
#    the LOWEST generated zoom — every produced pixel is genuine Copernicus
#    data. The 0.14.0 blanket gdal_fillnodata extrapolation (which rendered
#    as horizontal/vertical streak bands around the crop) is REMOVED. GLO-30
#    codes sea as 0 m; 1° cells that are pure ocean have no object in the
#    bucket and are synthesized as flat 0 m sea surface — real sea level,
#    not fake relief (marked as such in the provenance manifest);
#  - contours: 20 m interval with every 100 m as the index line — selected
#    from the 30 m DEM resolution, visual comparison, contour noise and
#    storage measurements (a 10 m build was rejected: mostly noise at 3-4x
#    the size). 100 m lines get tile minzoom 11, the rest 13; tiles stop at
#    z13 (the DEM has no honest information beyond that — MapLibre
#    overzooms them to the map cap). Contour geometry ends at the data
#    cutout (route + userBufferKm + dataMarginKm), always outside the
#    camera's maxBounds;
#  - terrain spans z7–12: z12 (~14 m/px at 68°N) already out-resolves the
#    30 m source and overzooms above; z7 sits below the maxBounds-derived
#    minimum zoom of every supported viewport, and its tile-aligned
#    footprint (a z7 tile is ~117 km wide) provides real relief for
#    wide-viewport overview states (fullscreen);
#  - after the build, the ACTUAL physical margin between the camera's user
#    bounds and each archive edge is measured and reported — the nominal
#    dataMarginKm is a floor, not the authoritative value.
#
# Usage:
#   scripts/build-terrain-map.sh [ROUTE_ID]     (default: kungsleden)
#
# Options (environment variables):
#   TERRAIN_MINZOOM / TERRAIN_MAXZOOM   default 7 / 12
#   CONTOUR_INTERVAL                    default 20 (metres)
#   CONTOUR_INDEX                       default 100 (metres, must be a
#                                       multiple of the interval)
#   DEBUG                               keep the work directory
#
# Requires: GDAL (incl. gdal_calc.py / gdal_create), tippecanoe, the
# pmtiles CLI (go-pmtiles), node, python3 and curl.

set -euo pipefail
cd "$(dirname "$0")/.."

ROUTE_ID="${1:-kungsleden}"
TERRAIN_MINZOOM="${TERRAIN_MINZOOM:-7}"
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
            gdal_create tippecanoe node python3 curl; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' not found on PATH."
done
command -v "$PMTILES_BIN" >/dev/null 2>&1 || die "pmtiles CLI not found (set PMTILES_BIN)."
[ -f "$ROUTE_JSON" ] || die "$ROUTE_JSON missing — run 'npm run generate:route' first."
[ $((CONTOUR_INDEX % CONTOUR_INTERVAL)) -eq 0 ] || die "CONTOUR_INDEX must be a multiple of CONTOUR_INTERVAL."

# ---- Coverage contract (never hard-coded) ----------------------------------
# mapCutoutBounds = data-generation bounds (route + userBufferKm +
# dataMarginKm); userBounds = camera maxBounds — used here only to MEASURE
# the physical safety margin the build actually produced.
read -r WEST SOUTH EAST NORTH UB_W UB_S UB_E UB_N <<EOF
$(node -p "
  const r = require('./${ROUTE_JSON}');
  const b = r.mapCutoutBounds, u = r.userBounds;
  [b[0][0], b[0][1], b[1][0], b[1][1], u[0][0], u[0][1], u[1][0], u[1][1]].join(' ');
")
EOF
[ -n "$UB_N" ] || die "could not read mapCutoutBounds/userBounds from $ROUTE_JSON."

WORK="$(mktemp -d "${TMPDIR:-/tmp}/terrainmap.XXXXXX")"
cleanup() { [ -n "${DEBUG:-}" ] || rm -rf "$WORK"; }
trap cleanup EXIT

echo "── Terrain relief build ─────────────────────────────────────────────"
echo "Route    : $ROUTE_ID"
echo "Bounds   : W $WEST  S $SOUTH  E $EAST  N $NORTH (from $ROUTE_JSON)"
echo "Terrain  : terrarium PNG z${TERRAIN_MINZOOM}–${TERRAIN_MAXZOOM} → $OUT_TERRAIN"
echo "Contours : ${CONTOUR_INTERVAL} m (index ${CONTOUR_INDEX} m) z11–13 → $OUT_CONTOURS"
echo

# ---- 1. Download GLO-30 for the FULL low-zoom tile footprint ----------------
# The source download must cover the tile-aligned extent of the LOWEST
# generated zoom, not just the data cutout — that is what guarantees real
# DEM under every produced pixel (no extrapolation anywhere).
echo "── Downloading Copernicus GLO-30 DEM tiles ──────────────────────────"
read -r SRC_W SRC_S SRC_E SRC_N <<EOF
$(python3 -c "
import math
z = $TERRAIN_MINZOOM
o = 20037508.342789244
def merc_x(lon): return lon * o / 180.0
def merc_y(lat): return math.log(math.tan((90 + lat) * math.pi / 360.0)) * o / math.pi
def inv_x(x): return x / o * 180.0
def inv_y(y): return math.degrees(2 * math.atan(math.exp(y * math.pi / o)) - math.pi / 2)
tile = 2 * o / 2**z
xmin = math.floor((merc_x($WEST) + o) / tile) * tile - o
xmax = math.ceil((merc_x($EAST) + o) / tile) * tile - o
ymin = math.floor((merc_y($SOUTH) + o) / tile) * tile - o
ymax = math.ceil((merc_y($NORTH) + o) / tile) * tile - o
print(inv_x(xmin), inv_y(ymin), inv_x(xmax), inv_y(ymax))
")
EOF
echo "  z${TERRAIN_MINZOOM} footprint: W $SRC_W  S $SRC_S  E $SRC_E  N $SRC_N"
TILES="$(python3 -c "
import math
for lat in range(math.floor($SRC_S), math.ceil($SRC_N)):
    for lon in range(math.floor($SRC_W), math.ceil($SRC_E)):
        ns = 'N' if lat >= 0 else 'S'
        ew = 'E' if lon >= 0 else 'W'
        print(f'Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM')
")"
: > "$WORK/source-tiles.txt"
for t in $TILES; do
  status=$(curl -sS -w '%{http_code}' -D "$WORK/$t.headers" -o "$WORK/$t.tif" "$DEM_BUCKET/$t/$t.tif" || echo 000)
  if [ "$status" = "200" ]; then
    echo "  $t"
    # Provenance row: name|url|bytes|ETag|sha256 (S3 ETag = MD5 for these
    # single-part objects; the sha256 is computed from the downloaded file).
    printf '%s|%s|%s|%s|%s\n' \
      "$t" "$DEM_BUCKET/$t/$t.tif" "$(stat -f%z "$WORK/$t.tif" 2>/dev/null || stat -c%s "$WORK/$t.tif")" \
      "$(grep -i '^etag:' "$WORK/$t.headers" | tr -d '\r"' | awk '{print $2}')" \
      "$(shasum -a 256 "$WORK/$t.tif" | awk '{print $1}')" >> "$WORK/source-tiles.txt"
  elif [ "$status" = "404" ]; then
    # GLO-30 publishes no object for pure-ocean 1° cells. Synthesize a flat
    # 0 m cell — real sea level, not fake relief. 120 px is plenty: the
    # cell only feeds z7–8 pixels far outside the user bounds.
    echo "  $t — no GLO-30 object (ocean cell) → synthesized 0 m sea surface"
    rm -f "$WORK/$t.tif"
    read -r CELL_W CELL_S <<EOF2
$(python3 -c "
name = '$t'
lat = int(name.split('_10_')[1][1:3]); lon = int(name.split('_00_')[1][1:4])
if name.split('_10_')[1][0] == 'S': lat = -lat
if name.split('_00_')[1][0] == 'W': lon = -lon
print(lon, lat)
")
EOF2
    gdal_create -q -of GTiff -outsize 120 120 -bands 1 -burn 0 -ot Float32 \
      -a_srs EPSG:4326 -a_ullr "$CELL_W" "$((CELL_S + 1))" "$((CELL_W + 1))" "$CELL_S" \
      "$WORK/$t.tif"
    printf '%s|%s|%s|%s|%s\n' \
      "$t" "synthesized:sea-level-0m" "0" "synthesized-ocean-cell" "-" >> "$WORK/source-tiles.txt"
  else
    die "DEM tile download failed with HTTP $status: $t"
  fi
done

gdalbuildvrt -q "$WORK/merged.vrt" "$WORK"/Copernicus_*.tif
# Data-cutout crop: feeds the CONTOURS only. Terrain zoom warps read the
# full merged footprint so their tile-aligned extents stay on real data.
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
  # Warp straight from the merged source footprint: the tile-aligned extent
  # is real DEM at every zoom by construction (see step 1), so there is no
  # no-data to fill and no extrapolation step (0.14.0's streak source).
  gdalwarp -overwrite -q -t_srs EPSG:3857 \
    -te "$TE_XMIN" "$TE_YMIN" "$TE_XMAX" "$TE_YMAX" -tr "$RES" "$RES" \
    -r bilinear "$WORK/merged.vrt" "$WORK/z${z}_f32.tif"
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
import json, sqlite3, subprocess, sys
work = sys.argv[1]
src = set()
with open(f"{work}/contours_tagged.geojsons") as fh:
    for line in fh:
        src.add(json.loads(line)["properties"]["elev"])
db = sqlite3.connect(f"{work}/contours.mbtiles")
meta = json.loads(db.execute("SELECT value FROM metadata WHERE name='json'").fetchone()[0])
attr = next(a for lyr in meta["tilestats"]["layers"] if lyr["layer"] == "contours"
            for a in lyr["attributes"] if a["attribute"] == "elev")
# tilestats caps the `values` array at 100 entries, so for rich datasets it
# is NOT a complete inventory — `count` is the authoritative unique-value
# count. Any source level absent from the capped list is verified by
# decoding tiles until found (a genuinely dropped level fails below).
listed = set(attr["values"])
unverified = sorted(src - listed)
if unverified:
    rows = db.execute("SELECT tile_column, tile_row FROM tiles WHERE zoom_level=13").fetchall()
    remaining = set(unverified)
    for x, y in rows:
        if not remaining:
            break
        out = subprocess.run(
            ["tippecanoe-decode", f"{work}/contours.mbtiles", "13", str(x), str(2**13 - 1 - y)],
            capture_output=True, text=True).stdout
        remaining = {e for e in remaining if f'"elev": {e}' not in out}
    missing = sorted(remaining)
else:
    missing = []
maxsize = {z: s for z, s in db.execute(
    "SELECT zoom_level, MAX(LENGTH(tile_data)) FROM tiles GROUP BY zoom_level")}
print(f"  elevation classes: source {len(src)}, tilestats count {attr.get('count')}, "
      f"decode-verified beyond the 100-value tilestats cap: {len(unverified) - len(missing)}/{len(unverified)}")
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
  --user-bounds "$UB_W,$UB_S,$UB_E,$UB_N" \
  --terrain-zooms "$TERRAIN_MINZOOM,$TERRAIN_MAXZOOM" \
  --contour-intervals "$CONTOUR_INTERVAL,$CONTOUR_INDEX" \
  --out "$OUT_PROVENANCE"

# ---- 5. Physical safety-margin measurement -----------------------------------
# The authoritative safety measurement: distance between each USER-bounds
# edge and the nearest physical archive boundary. Terrain's worst case is
# the z12 tile alignment (smallest expansion); contour GEOMETRY ends at the
# data cutout itself. Fails the build if any margin drops below 2 km.
echo "── Physical safety margins (user bounds → archive edges) ────────────"
python3 - <<EOF
import math, sys
o = 20037508.342789244
def merc(lon, lat):
    return lon * o / 180.0, math.log(math.tan((90 + lat) * math.pi / 360.0)) * o / math.pi
def cos_lat(lat): return math.cos(math.radians(lat))

ub = {'w': $UB_W, 's': $UB_S, 'e': $UB_E, 'n': $UB_N}
cut = {'w': $WEST, 's': $SOUTH, 'e': $EAST, 'n': $NORTH}
midlat = (ub['s'] + ub['n']) / 2

def km_lon(deg, lat=midlat): return deg * 111.320 * cos_lat(lat)
def km_lat(deg): return deg * 110.574

# Terrain z12 tile-aligned extent around the cutout (matches the warp).
z = $TERRAIN_MAXZOOM
tile = 2 * o / 2**z
x0, y0 = merc(cut['w'], cut['s']); x1, y1 = merc(cut['e'], cut['n'])
tx0 = math.floor((x0 + o) / tile) * tile - o
ty0 = math.floor((y0 + o) / tile) * tile - o
tx1 = math.ceil((x1 + o) / tile) * tile - o
ty1 = math.ceil((y1 + o) / tile) * tile - o
ux0, uy0 = merc(ub['w'], ub['s']); ux1, uy1 = merc(ub['e'], ub['n'])
mercator_km = lambda m: m / 1000 * cos_lat(midlat)  # ground km at this latitude
terr = {'W': mercator_km(ux0 - tx0), 'S': mercator_km(uy0 - ty0),
        'E': mercator_km(tx1 - ux1), 'N': mercator_km(ty1 - uy1)}
cont = {'W': km_lon(ub['w'] - cut['w']), 'S': km_lat(ub['s'] - cut['s']),
        'E': km_lon(cut['e'] - ub['e']), 'N': km_lat(cut['n'] - ub['n'])}
print(f"  terrain z{z} tile edge : " + "  ".join(f"{k} {v:5.2f} km" for k, v in terr.items()))
print(f"  contour geometry edge : " + "  ".join(f"{k} {v:5.2f} km" for k, v in cont.items()))
worst = min(min(terr.values()), min(cont.values()))
print(f"  minimum physical margin: {worst:.2f} km")
if worst < 2.0:
    sys.exit("FATAL: physical safety margin below 2 km — enlarge dataMarginKm.")
print("  ✓ every archive edge sits comfortably outside the camera bounds")
EOF

# ---- 6. Report ---------------------------------------------------------------
echo
echo "── Archive summary ──────────────────────────────────────────────────"
for f in "$OUT_TERRAIN" "$OUT_CONTOURS"; do
  ls -lh "$f" | awk '{print $9 " (" $5 ")"}'
  shasum -a 256 "$f" | awk '{print "  sha256 " $1}'
done
echo "✓ Done. The Terrain relief card and map layers detect these archives."
echo "  Upload $OUT_PROVENANCE to the terrain-data release with the archives."
