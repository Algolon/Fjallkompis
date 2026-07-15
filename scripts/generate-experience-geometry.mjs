#!/usr/bin/env node
/**
 * Parse owner-authored experience GPX files (public/gpx/experiences/*.gpx) into
 * src/generated/experience-geometry.json — the per-experience geometry the app
 * consumes for "View on map" (detour tracks + waypoints). The GPX files are the
 * authoritative source and are NEVER modified here; this only extracts.
 *
 * Stable id convention inside the GPX: waypoint/track names are `exp.<id>.<role>`.
 * The `<id>` is everything between `exp.` and the final `.role`. A documented
 * ALIAS map reconciles a legacy id with the canonical RouteExperience id (the
 * owner's file predates the `-sightline` rename — see docs/proposals/along-the-way-spatial.md).
 *
 * Metrics are derived ONLY from the supplied geometry: distanceKm is the
 * out-and-back length (owner-confirmed both Day-1 detours are out-and-back) =
 * one-way haversine sum × 2; elevationGainM (round trip) = one-way ascent +
 * one-way descent. Rounded so regeneration is byte-stable for CI.
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
  const s = raw.replace(/^exp\./, '');
  const i = s.lastIndexOf('.');
  const rawId = s.slice(0, i);
  return { id: ID_ALIAS[rawId] ?? rawId, rawId, role: s.slice(i + 1) };
}

const experiences = {};
const ensure = (id) =>
  (experiences[id] ??= { sourceFile: '', waypoints: {}, track: null });

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
    const pts = [
      ...t[0].matchAll(/<trkpt lat="([\d.]+)" lon="([\d.]+)">\s*<ele>([\d.]+)</g),
    ].map((p) => ({ lat: +p[1], lon: +p[2], ele: +p[3] }));
    if (pts.length < 2) continue;
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
