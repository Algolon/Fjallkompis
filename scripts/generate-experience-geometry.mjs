#!/usr/bin/env node
/**
 * Parse owner-authored experience GPX files (public/gpx/experiences/*.gpx) into
 * src/generated/experience-geometry.json — the per-experience geometry the app
 * consumes for "View on map" (detour tracks + waypoints). The GPX files are the
 * authoritative source and are NEVER modified here; this only extracts.
 *
 * Stable id convention inside the GPX: waypoint/track names are `exp.<id>.<role>`.
 * The `<id>` is everything between `exp.` and the final `.role`. Two documented
 * alias layers reconcile the raw owner file names with canonical RouteExperience
 * ids WITHOUT ever editing the source GPX (the files are byte-for-byte
 * authoritative — see docs/proposals/spatial-data-days4-7.md):
 *  - ID_ALIAS: a legacy `<id>` → canonical id (the Day-1 `-sightline` rename);
 *  - NAME_ALIAS: an EXACT source waypoint/track name → { id, role }, for the
 *    Days-4–7 files whose names don't follow the `exp.<id>.<role>` convention
 *    (bare track names like `nallo-side-valley`, un-prefixed waypoints like
 *    `kebnekaise-summit-western.start`, or names with extra dots like
 *    `day5.madirjavri.lake+plateau.viewpoint`). Names not in NAME_ALIAS fall
 *    back to the `exp.<id>.<role>` convention, so Day 1 is unchanged.
 *  - TRACK_REVERSE: canonical ids whose track is stored in the opposite of the
 *    walked direction and must be reversed for display (Nallo is stored
 *    destination → Sälka; presentation is Sälka → destination). Reversing only
 *    reorders points — distance and round-trip ascent are direction-invariant.
 *
 * Metrics are derived ONLY from the supplied geometry: distanceKm is the
 * out-and-back length (one-way haversine sum × 2); elevationGainM (round trip) =
 * one-way ascent + one-way descent. Rounded so regeneration is byte-stable for
 * CI. Point-only objectives (waypoint, no track) get waypoints and no metrics.
 *
 * Run via `npm run generate:experiences` (chained into dev/build/test).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GPX_DIR = join(root, 'public/gpx/experiences');
const OUT = join(root, 'src/generated/experience-geometry.json');

/** Legacy GPX id → canonical RouteExperience id (explicit, documented). */
const ID_ALIAS = {
  'lake-njakajaure-lapporten-sightline': 'lake-njakajaure-lapporten',
};

/**
 * Exact source waypoint/track name → { canonical id, role }. Only the names that
 * do NOT follow the `exp.<id>.<role>` convention need an entry here; everything
 * else falls back to the convention. Keeps the owner GPX unedited.
 */
const NAME_ALIAS = {
  // nallo-side-valley.gpx — bare track name + the separate off-trail objective.
  'nallo-side-valley': { id: 'nallo-side-valley', role: 'detour' },
  'exp.salke-half-summit.lake+viewpoint': {
    id: 'salka-half-summit-lake-viewpoint',
    role: 'destination',
  },
  // tarfala-valley.gpx — bare track name (waypoints already use exp.<id>.<role>).
  'tarfala-valley': { id: 'tarfala-valley', role: 'detour' },
  // kebnekaise-summit-western.gpx — bare track + un-prefixed start/end.
  'kebnekaise-summit-western': { id: 'kebnekaise-summit-western', role: 'detour' },
  'kebnekaise-summit-western.start': { id: 'kebnekaise-summit-western', role: 'entry' },
  'kebnekaise-summit-western.end': { id: 'kebnekaise-summit-western', role: 'summit' },
  // day5-along-the-way.gpx — the track belongs ONLY to the waterfall detour; the
  // Mádírjávri plateau viewpoint is a separate point-only objective.
  'day5-along-the-way': { id: 'day5-waterfall-rapids-bridge', role: 'detour' },
  'day-5-waterfall-along-route.entry': { id: 'day5-waterfall-rapids-bridge', role: 'entry' },
  'day-5-waterfall-along-route': { id: 'day5-waterfall-rapids-bridge', role: 'destination' },
  'day5.madirjavri.lake+plateau.viewpoint': {
    id: 'madirjavri-plateau-viewpoint',
    role: 'destination',
  },
};

/** Canonical ids whose stored track runs opposite the walked direction. */
const TRACK_REVERSE = new Set(['nallo-side-valley']);

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

function parseName(raw) {
  const alias = NAME_ALIAS[raw];
  if (alias) return { id: alias.id, rawId: raw, role: alias.role };
  const s = raw.replace(/^exp\./, '');
  const i = s.lastIndexOf('.');
  const rawId = s.slice(0, i);
  return { id: ID_ALIAS[rawId] ?? rawId, rawId, role: s.slice(i + 1) };
}

const experiences = {};
// Point-only objectives keep just waypoints — no `track` key is written, so the
// generated JSON matches the `track?: number[][]` contract (never null).
const ensure = (id) => (experiences[id] ??= { sourceFile: '', waypoints: {} });

for (const file of readdirSync(GPX_DIR).filter((f) => f.endsWith('.gpx')).sort()) {
  const gpx = readFileSync(join(GPX_DIR, file), 'utf8');

  for (const m of gpx.matchAll(
    /<wpt lat="([\d.]+)" lon="([\d.]+)">\s*<ele>([\d.]+)<\/ele>\s*<name>([^<]+)<\/name>/g,
  )) {
    const { id, role } = parseName(m[4]);
    const e = ensure(id);
    e.sourceFile = file;
    e.waypoints[role] = { lat: +m[1], lon: +m[2], ele: +(+m[3]).toFixed(1) };
  }

  for (const t of gpx.matchAll(/<trk>\s*<name>([^<]+)<\/name>[\s\S]*?<\/trk>/g)) {
    const { id, role } = parseName(t[1]);
    const raw = [
      ...t[0].matchAll(/<trkpt lat="([\d.]+)" lon="([\d.]+)">\s*<ele>([\d.]+)</g),
    ].map((p) => ({ lat: +p[1], lon: +p[2], ele: +p[3] }));
    if (raw.length < 2) continue;
    // Normalise to the WALKED direction for display (source file untouched).
    const pts = TRACK_REVERSE.has(id) ? [...raw].reverse() : raw;
    let len = 0;
    let up = 0;
    let down = 0;
    for (let i = 1; i < pts.length; i++) {
      len += hav(pts[i - 1], pts[i]);
      const d = pts[i].ele - pts[i - 1].ele;
      if (d > 0) up += d;
      else down += -d;
    }
    const e = ensure(id);
    e.sourceFile = file;
    e.trackRole = role;
    e.track = pts.map((p) => [+p.lat.toFixed(6), +p.lon.toFixed(6)]);
    e.roundTripKm = +((len * 2) / 1000).toFixed(2); // out-and-back
    e.elevationGainM = Math.round(up + down); // round-trip ascent
  }
}

// Deterministic (sorted keys) so regeneration is byte-stable.
const sorted = Object.fromEntries(
  Object.keys(experiences)
    .sort()
    .map((k) => [k, experiences[k]]),
);
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
const n = Object.keys(sorted).length;
console.log(`experience-geometry: ${n} experience(s) → ${OUT.replace(root + '/', '')}`);
