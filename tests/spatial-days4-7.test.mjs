/**
 * Guards the Days-4–7 owner spatial data (four GPX files + reclassification):
 * the per-file alias mapping, Nallo's build-time direction normalisation, the
 * routed-vs-point distinction, the reclassifications and the removal of the
 * visible Source UI. Geometry is checked against the GENERATED JSON and the
 * (unedited) source GPX; the endpoint-marker shape itself lives in
 * focus-features.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFocusFeatures } from '../src/map/focusFeatures.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const geo = JSON.parse(read('src/generated/experience-geometry.json'));
const data = read('src/data/routeExperiences.ts');
const routes = read('src/data/experienceRoutes.ts');
const component = read('src/components/StageExperiences.tsx');

// ── Alias mapping (source GPX names → canonical ids/roles) ────────────────────

test('Days-4–7 files map to canonical ids without editing the source GPX', () => {
  // Bare track names + un-prefixed / multi-dot waypoints resolve to canon ids.
  assert.ok(geo['nallo-side-valley']?.track, 'nallo track');
  assert.ok(geo['tarfala-valley']?.track, 'tarfala track');
  assert.ok(geo['kebnekaise-summit-western']?.track, 'kebnekaise track');
  assert.ok(geo['day5-waterfall-rapids-bridge']?.track, 'day5 waterfall track');

  // Kebnekaise start/end (un-prefixed in the GPX) alias to entry/summit.
  const keb = geo['kebnekaise-summit-western'].waypoints;
  assert.ok(keb.entry && keb.summit && keb.vierranvarri, 'entry/summit/vierranvarri present');

  // Tarfala's intermediate POIs are preserved as waypoints (route context).
  const tar = geo['tarfala-valley'].waypoints;
  for (const role of ['destination', 'research-station', 'tarfala-cabin', 'waterfall']) {
    assert.ok(tar[role], `tarfala ${role} waypoint`);
  }
});

// ── Nallo direction normalisation (source untouched) ─────────────────────────

test('Nallo track is normalised to walked Sälka → Nallo without editing source', () => {
  const t = geo['nallo-side-valley'].track;
  const first = t[0];
  const last = t[t.length - 1];
  const entry = geo['nallo-side-valley'].waypoints.entry; // Sälka
  const dest = geo['nallo-side-valley'].waypoints.destination; // Nallo
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  assert.ok(near(first[0], entry.lat) && near(first[1], entry.lon), 'starts at Sälka');
  assert.ok(near(last[0], dest.lat) && near(last[1], dest.lon), 'ends at Nallo');
  // The SOURCE file is unchanged: its first trackpoint is still the Nallo end.
  const src = read('public/gpx/experiences/nallo-side-valley.gpx');
  const firstSrc = src.match(/<trkpt lat="([\d.]+)" lon="([\d.]+)"/);
  assert.ok(near(+firstSrc[1], dest.lat), 'source GPX still stored destination→Sälka');
});

// ── Routed detours vs point-only off-trail objectives ────────────────────────

test('routed detours carry a track; off-trail objectives are point-only', () => {
  // Routed: track present.
  for (const id of ['nallo-side-valley', 'day5-waterfall-rapids-bridge', 'tarfala-valley', 'kebnekaise-summit-western']) {
    assert.ok(geo[id].track && geo[id].track.length >= 2, `${id} has a track`);
  }
  // Point-only: a destination waypoint and NO track (no fake line).
  for (const id of ['salka-half-summit-lake-viewpoint', 'madirjavri-plateau-viewpoint']) {
    assert.ok(geo[id].waypoints.destination, `${id} has a destination point`);
    assert.equal(geo[id].track, undefined, `${id} has no track`);
  }
});

test('the Day-5 track belongs to the waterfall detour, not the Mádírjávri viewpoint', () => {
  assert.equal(geo['day5-waterfall-rapids-bridge'].sourceFile, 'day5-along-the-way.gpx');
  assert.equal(geo['madirjavri-plateau-viewpoint'].sourceFile, 'day5-along-the-way.gpx');
  assert.ok(geo['day5-waterfall-rapids-bridge'].track.length >= 2, 'waterfall has the track');
  assert.equal(geo['madirjavri-plateau-viewpoint'].track, undefined, 'viewpoint inherits no track');
});

test('point-only off-trail objectives register no route asset', () => {
  // The asset registry builds one ownerDetour per ROUTED detour only.
  for (const id of ['nallo-side-valley', 'day5-waterfall-rapids-bridge', 'tarfala-valley', 'kebnekaise-summit-western']) {
    assert.ok(routes.includes(`ownerDetour('${id}'`), `${id} has a route asset`);
  }
  for (const id of ['salka-half-summit-lake-viewpoint', 'madirjavri-plateau-viewpoint']) {
    assert.ok(!routes.includes(`ownerDetour('${id}'`), `${id} has NO route asset`);
    // …and no gpxAssetId in the record → the point never draws a line.
    const rec = data.slice(data.indexOf(`id: '${id}'`), data.indexOf(`id: '${id}'`) + 900);
    assert.ok(!rec.includes('gpxAssetId'), `${id} record has no gpxAssetId`);
    assert.ok(rec.includes("mapAvailability: 'exact-point'"), `${id} is an exact point`);
    assert.ok(rec.includes('offTrail: true'), `${id} is flagged off-trail`);
  }
});

// ── A routed detour still emits one line + two endpoint markers ──────────────

test('a Days-4–7 routed detour emits one LineString + start/destination points', () => {
  const g = geo['tarfala-valley'];
  const track = g.track.map(([lat, lng]) => ({ lat, lng }));
  const fc = buildFocusFeatures({
    track,
    start: track[0],
    destination: { lat: g.waypoints.destination.lat, lng: g.waypoints.destination.lon },
  });
  assert.equal(fc.features.filter((f) => f.geometry.type === 'LineString').length, 1);
  assert.equal(fc.features.filter((f) => f.geometry.type === 'Point').length, 2);
});

// ── Reclassification (source contracts on the curated data) ──────────────────

test('Sälka bathing stream is a Highlight (beside the station), not a Detour', () => {
  const rec = data.slice(data.indexOf("id: 'salka-bathing-stream'"));
  const block = rec.slice(0, rec.indexOf('confidence:'));
  assert.ok(block.includes("access: 'beside-station'"), 'reclassified beside-station');
  assert.ok(!block.includes("access: 'short-detour'"), 'no longer a short-detour');
  assert.ok(!/addedTimeText/.test(block), 'the added-time detour pill is gone');
});

test('Sockertoppen is removed and replaced by the off-trail Sälka high-lake objective', () => {
  assert.ok(!data.includes("id: 'sockertoppen'"), 'sockertoppen record removed');
  assert.ok(!/title: 'Sockertoppen/.test(data), 'no Sockertoppen title/copy in the UI data');
  assert.ok(data.includes("id: 'salka-half-summit-lake-viewpoint'"), 'replacement present');
});

test('the new Day-5 items exist with the right kinds', () => {
  assert.ok(data.includes("id: 'day5-waterfall-rapids-bridge'"), 'waterfall detour');
  assert.ok(data.includes("id: 'madirjavri-plateau-viewpoint'"), 'plateau viewpoint');
});

test('routed detours derive distance from GPX (no hand-typed roundTripKm)', () => {
  // The only roundTripKm in the data module is the geometry-derived assignment.
  const literals = [...data.matchAll(/roundTripKm:/g)];
  assert.equal(literals.length, 1, 'exactly one roundTripKm (the derived one)');
  assert.ok(data.includes('g?.roundTripKm'), 'roundTripKm comes from geometry');
});

// ── Source UI removal (metadata retained internally) ─────────────────────────

test('the visible Source UI is gone from Detour cards', () => {
  assert.ok(!component.includes('Provenance'), 'no Provenance component');
  assert.ok(!component.includes('dt-source'), 'no source disclosure markup');
  assert.ok(!component.includes('provenanceLevel'), 'no provenance-level gating in the card');
  assert.ok(!/>\s*Source\s*</.test(component), 'no "Source" label rendered');
});

test('source metadata is retained internally on every experience', () => {
  // Still one source block per record (the data is kept, only the UI is removed).
  const sources = [...data.matchAll(/\n\s*source:\s*\{/g)];
  assert.ok(sources.length >= 20, `every record keeps its source (${sources.length})`);
});
