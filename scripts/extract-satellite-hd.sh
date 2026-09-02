#!/usr/bin/env bash
#
# Derive the Satellite HD detail add-on from the ACCEPTED z16/q95 hybrid
# candidate — without re-encoding a single tile.
#
#   input   public/maps/kungsleden-satellite-v6-z16-q95-candidate.pmtiles
#           (the measured benchmark build, verified against its provenance)
#   output  public/maps/kungsleden-satellite-hd-north.pmtiles
#           public/maps/kungsleden-satellite-hd-south.pmtiles
#           public/maps/kungsleden-satellite-hd-provenance.json
#
# WHY z16-ONLY, AND WHY SHARDS. Satellite Basic (satellite-data-v5, z7–15)
# stays canonical and untouched; shipping the combined 2.27 GiB candidate
# would duplicate z7–15 and exceed GitHub's 2 GiB per-Release-asset cap.
# The z16-only extract measures ~2.04 GiB — still over the project's
# per-asset gate — so the corridor is split on an exact z16 tile-row
# boundary into two complete, non-overlapping shards (one "HD detail"
# download choice, two assets, exactly like Terrain relief's two archives).
# `pmtiles extract` copies tile payloads verbatim: the accepted q95 WebP
# bytes are preserved bit-for-bit.
#
# Every range is derived from the canonical route contract
# (mapCutoutBounds → detailTileInventory at SATELLITE_HD_MAX_ZOOM); nothing
# is hard-coded. Each output is verified PER COORDINATE: every expected z16
# tile present, a probe ring outside every edge absent — no gaps, no
# overlap, union exactly the declared corridor.
#
# Usage:
#   scripts/extract-satellite-hd.sh [CANDIDATE]
#
# Requires: pmtiles CLI with extract --minzoom/--maxzoom/--bbox and edit
# --header-json (go-pmtiles), node, python3, shasum.

set -euo pipefail
cd "$(dirname "$0")/.."

CANDIDATE="${1:-public/maps/kungsleden-satellite-v6-z16-q95-candidate.pmtiles}"
CANDIDATE_PROV="${CANDIDATE_PROV:-${CANDIDATE%.pmtiles}-provenance.json}"
OUT_PREFIX="public/maps/kungsleden-satellite-hd"
OUT_PROVENANCE="${OUT_PREFIX}-provenance.json"
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"
ROUTE_JSON="src/generated/kungsleden-route.json"
# Project per-release-asset safety gate (same 1.9 GiB used by the Basic
# build; GitHub's hard cap is 2 GiB per asset).
ASSET_GATE_BYTES=$((1997159792))

die() { echo "ERROR: $*" >&2; exit 1; }
for tool in "$PMTILES_BIN" node python3 shasum; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' not found on PATH."
done
[ -f "$CANDIDATE" ] || die "$CANDIDATE missing — run the z16/q95 benchmark build first (docs/operations/satellite-v6-z16-benchmark.md)."
[ -f "$CANDIDATE_PROV" ] || die "$CANDIDATE_PROV missing — the candidate must carry its build provenance."
[ -f "$ROUTE_JSON" ] || die "$ROUTE_JSON missing — run 'npm run generate:route' first."

WORK="$(mktemp -d "${TMPDIR:-/tmp}/sathd.XXXXXX")"
cleanup() { [ -n "${DEBUG:-}" ] || rm -rf "$WORK"; }
trap cleanup EXIT

echo "── Satellite HD extraction ──────────────────────────────────────────"

# ---- 1. Verify the parent candidate against its own provenance -------------
PARENT_BYTES="$(node -p "require('./${CANDIDATE_PROV}').archive.bytes")"
PARENT_SHA="$(node -p "require('./${CANDIDATE_PROV}').archive.sha256")"
PARENT_QUALITY="$(node -p "require('./${CANDIDATE_PROV}').archive.detailQuality")"
ACTUAL_BYTES="$(stat -f%z "$(readlink -f "$CANDIDATE" 2>/dev/null || echo "$CANDIDATE")" 2>/dev/null || stat -c%s "$CANDIDATE")"
[ "$ACTUAL_BYTES" = "$PARENT_BYTES" ] || die "candidate is $ACTUAL_BYTES bytes; provenance declares $PARENT_BYTES."
ACTUAL_SHA="$(shasum -a 256 "$CANDIDATE" | awk '{print $1}')"
[ "$ACTUAL_SHA" = "$PARENT_SHA" ] || die "candidate sha256 $ACTUAL_SHA does not match provenance $PARENT_SHA."
"$PMTILES_BIN" verify "$CANDIDATE"
echo "  ✓ parent candidate verified: $PARENT_BYTES bytes, sha256 $PARENT_SHA, detail quality $PARENT_QUALITY"

# ---- 2. Contract-derived z16 corridor + shard plan --------------------------
CONTRACT="$(node --input-type=module -e "
  import route from './${ROUTE_JSON}' with { type: 'json' };
  import { SATELLITE_HD_MAX_ZOOM } from './src/map/overviewEnvelope.mjs';
  import { detailTileInventory } from './scripts/lib/lantmateriet-stac.mjs';
  const z = SATELLITE_HD_MAX_ZOOM;
  const inv = detailTileInventory(route.mapCutoutBounds, z);
  const r = inv[inv.length - 1];
  if (r.z !== z) throw new Error('inventory does not reach z' + z);
  const size = 2 ** z;
  const lonC = (x) => ((x + 0.5) / size) * 360 - 180;
  const latC = (y) => { const m = Math.PI - (2 * Math.PI * (y + 0.5)) / size; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(m) - Math.exp(-m))); };
  const lonE = (x) => (x / size) * 360 - 180;
  const latE = (y) => { const m = Math.PI - (2 * Math.PI * y) / size; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(m) - Math.exp(-m))); };
  const rows = r.yMax - r.yMin + 1;
  const splitY = r.yMin + Math.ceil(rows / 2) - 1; // last row of the north shard
  const shard = (name, yMin, yMax) => ({
    name,
    rect: { z, xMin: r.xMin, xMax: r.xMax, yMin, yMax },
    count: (r.xMax - r.xMin + 1) * (yMax - yMin + 1),
    bbox: [lonC(r.xMin), latC(yMax), lonC(r.xMax), latC(yMin)].map((v) => v.toFixed(8)).join(','),
    bounds: [lonE(r.xMin), latE(yMax + 1), lonE(r.xMax + 1), latE(yMin)],
  });
  console.log(JSON.stringify({
    z,
    full: { rect: { z, xMin: r.xMin, xMax: r.xMax, yMin: r.yMin, yMax: r.yMax }, count: r.count,
            bounds: [lonE(r.xMin), latE(r.yMax + 1), lonE(r.xMax + 1), latE(r.yMin)] },
    shards: [shard('north', r.yMin, splitY), shard('south', splitY + 1, r.yMax)],
  }));
")"
contract() { printf '%s' "$CONTRACT" | node -p "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); $1"; }
Z="$(contract 'c.z')"
FULL_COUNT="$(contract 'c.full.count')"
echo "  z$Z corridor: $(contract 'c.full.rect.xMin')–$(contract 'c.full.rect.xMax') × $(contract 'c.full.rect.yMin')–$(contract 'c.full.rect.yMax') = $FULL_COUNT tiles"

# ---- 3. Extract z16-only, decide single vs sharded --------------------------
echo "── Extracting z${Z}-only from the candidate (payloads copied verbatim) ─"
"$PMTILES_BIN" extract "$CANDIDATE" "$WORK/hd-all.pmtiles" --minzoom="$Z" --maxzoom="$Z" -q
ALL_BYTES="$(stat -f%z "$WORK/hd-all.pmtiles" 2>/dev/null || stat -c%s "$WORK/hd-all.pmtiles")"
ALL_ADDRESSED="$("$PMTILES_BIN" show "$WORK/hd-all.pmtiles" | awk -F': ' '/addressed tiles count/ {print $2}')"
[ "$ALL_ADDRESSED" = "$FULL_COUNT" ] || die "z${Z} extract addresses $ALL_ADDRESSED tiles; contract expects $FULL_COUNT."
echo "  z${Z}-only archive: $ALL_BYTES bytes, $ALL_ADDRESSED addressed tiles"

if [ "$ALL_BYTES" -le "$ASSET_GATE_BYTES" ]; then
  MODE="single"
  ASSETS="all"
  cp "$WORK/hd-all.pmtiles" "${OUT_PREFIX}.pmtiles"
  echo "  → fits the per-asset gate: ONE archive (${OUT_PREFIX}.pmtiles)"
else
  MODE="sharded"
  ASSETS="north south"
  echo "  → $ALL_BYTES bytes exceeds the $ASSET_GATE_BYTES-byte per-asset gate"
  echo "  → sharding on an exact z${Z} tile-row boundary (quality untouched)"
  for name in $ASSETS; do
    IDX=$([ "$name" = "north" ] && echo 0 || echo 1)
    BBOX="$(contract "c.shards[$IDX].bbox")"
    "$PMTILES_BIN" extract "$WORK/hd-all.pmtiles" "${OUT_PREFIX}-${name}.pmtiles" \
      --minzoom="$Z" --maxzoom="$Z" --bbox="$BBOX" -q
  done
fi

# ---- 4. Per-output: exact header bounds, per-coordinate proof, identity -----
echo "── Verifying every output per coordinate ────────────────────────────"
RESULTS="$WORK/results.json"
echo '[]' > "$RESULTS"
for name in $ASSETS; do
  if [ "$MODE" = "single" ]; then
    OUT_FILE="${OUT_PREFIX}.pmtiles"
    RECT="$(contract 'JSON.stringify(c.full.rect)')"
    BOUNDS="$(contract 'JSON.stringify(c.full.bounds)')"
    EXPECT="$FULL_COUNT"
  else
    IDX=$([ "$name" = "north" ] && echo 0 || echo 1)
    OUT_FILE="${OUT_PREFIX}-${name}.pmtiles"
    RECT="$(contract "JSON.stringify(c.shards[$IDX].rect)")"
    BOUNDS="$(contract "JSON.stringify(c.shards[$IDX].bounds)")"
    EXPECT="$(contract "c.shards[$IDX].count")"
  fi
  # Honest header bounds: the exact tile-aligned physical extent (extract
  # writes the request bbox, which stops at edge-tile centres).
  "$PMTILES_BIN" show "$OUT_FILE" --header-json > "$WORK/header.json"
  node -e "
    const fs = require('fs');
    const h = JSON.parse(fs.readFileSync('$WORK/header.json', 'utf8'));
    const b = $BOUNDS;
    h.bounds = b;
    h.center = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, $Z];
    fs.writeFileSync('$WORK/header.json', JSON.stringify(h));
  "
  "$PMTILES_BIN" edit "$OUT_FILE" --header-json="$WORK/header.json"
  "$PMTILES_BIN" verify "$OUT_FILE"
  OUT_FILE="$OUT_FILE" RECT="$RECT" EXPECT="$EXPECT" RESULTS="$RESULTS" NAME="$name" \
  node --input-type=module -e "
    import { readFileSync, writeFileSync } from 'node:fs';
    import { inspectHeader, verifyExactTileRectangle } from './scripts/lib/pmtiles-inspect.mjs';
    const env = process.env;
    const rect = JSON.parse(env.RECT);
    const header = await inspectHeader(env.OUT_FILE);
    const proof = await verifyExactTileRectangle(env.OUT_FILE, rect);
    const problems = [];
    if (header.minZoom !== rect.z || header.maxZoom !== rect.z) problems.push('zoom range ' + header.minZoom + '-' + header.maxZoom + ' != ' + rect.z);
    if (header.numAddressedTiles !== Number(env.EXPECT)) problems.push('addressed ' + header.numAddressedTiles + ' != ' + env.EXPECT);
    if (!proof.complete) problems.push('tile-set proof failed: missing ' + proof.missingCount + ', unexpected outside ' + proof.unexpectedOutside.length);
    if (problems.length) { console.error('FATAL ' + env.OUT_FILE + ': ' + problems.join('; ')); process.exit(1); }
    const results = JSON.parse(readFileSync(env.RESULTS, 'utf8'));
    results.push({ name: env.NAME, file: env.OUT_FILE, rect, header, proof: { present: proof.present, outsideRingProbes: proof.outsideRingProbes } });
    writeFileSync(env.RESULTS, JSON.stringify(results));
    console.log('  ✓ ' + env.OUT_FILE + ': ' + proof.present + '/' + env.EXPECT + ' tiles present, ' + proof.outsideRingProbes + ' outside probes empty, header exact');
  "
done

# ---- 5. Identity + provenance -----------------------------------------------
echo "── Measuring identities + writing provenance ────────────────────────"
RESULTS="$RESULTS" OUT_PROVENANCE="$OUT_PROVENANCE" CANDIDATE="$CANDIDATE" \
CANDIDATE_PROV="$CANDIDATE_PROV" PARENT_SHA="$PARENT_SHA" PARENT_BYTES="$PARENT_BYTES" \
MODE="$MODE" Z="$Z" PMTILES_VERSION="$("$PMTILES_BIN" version 2>&1 | head -1)" \
node --input-type=module -e "
  import { readFileSync, writeFileSync, statSync } from 'node:fs';
  import { createHash } from 'node:crypto';
  const env = process.env;
  const results = JSON.parse(readFileSync(env.RESULTS, 'utf8'));
  const parent = JSON.parse(readFileSync(env.CANDIDATE_PROV, 'utf8'));
  const assets = results.map((r) => {
    const bytes = statSync(r.file).size;
    const sha256 = createHash('sha256').update(readFileSync(r.file)).digest('hex');
    return {
      name: r.name, file: r.file.split('/').pop(), bytes, sha256,
      minZoom: r.rect.z, maxZoom: r.rect.z,
      bounds: r.header.bounds,
      tilesByZoom: [{ zoom: r.rect.z, x: [r.rect.xMin, r.rect.xMax], y: [r.rect.yMin, r.rect.yMax], count: r.proof.present }],
    };
  });
  const provenance = {
    generated: new Date().toISOString(),
    derivation: {
      parentCandidate: { file: env.CANDIDATE.split('/').pop(), bytes: Number(env.PARENT_BYTES), sha256: env.PARENT_SHA },
      method: 'pmtiles extract --minzoom=' + env.Z + ' --maxzoom=' + env.Z + (env.MODE === 'sharded' ? ' + exact tile-row bbox shards' : '') + ' — tile payloads copied verbatim, never re-encoded',
      tool: env.PMTILES_VERSION,
      mode: env.MODE,
      detailQuality: parent.archive.detailQuality,
      groundResolution: '~0.89 m/px at the route latitude (z' + env.Z + ', 2.3887 Mercator m/px)',
    },
    composition: {
      note: 'z' + env.Z + ' tiles inherit the parent hybrid composition: Lantmäteriet Ortofoto J6 2024 aerial orthophotos over a Sentinel-2 fallback, hard per-pixel source priority.',
      sources: parent.sources ?? null,
    },
    assets,
  };
  writeFileSync(env.OUT_PROVENANCE, JSON.stringify(provenance, null, 2) + '\n');
  console.log('Provenance : ' + env.OUT_PROVENANCE);
  console.log();
  console.log('── mapCatalog.mjs satelliteHd values (measured) ─────────────────────');
  for (const a of assets) {
    console.log(a.name + ':');
    console.log('  file   : ' + a.file);
    console.log('  bytes  : ' + a.bytes);
    console.log('  sha256 : ' + a.sha256);
    console.log('  bounds : [[' + a.bounds[0] + ', ' + a.bounds[1] + '], [' + a.bounds[2] + ', ' + a.bounds[3] + ']]');
    console.log('  tiles  : { zoom: ' + a.tilesByZoom[0].zoom + ', x: [' + a.tilesByZoom[0].x + '], y: [' + a.tilesByZoom[0].y + '], count: ' + a.tilesByZoom[0].count + ' }');
  }
"
echo
echo "✓ Done ($MODE mode). The accepted q95 imagery was never re-encoded."
