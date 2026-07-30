/**
 * Hiking days — Today integration (src/screens/TodayScreen.tsx).
 *
 * Two halves:
 *   1. behavioural assertions over the DERIVED days the screen renders (the
 *      real module, real route data) — what Today shows for a day holding
 *      one, two or three canonical stages, and with no plan at all;
 *   2. source-text contracts over the React surface for the structural rules
 *      that cannot be observed from data: which actions a combined day may
 *      offer, that stage content is never merged across parts, and that the
 *      current part is marked.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPlannedDays, currentPlannedDayOf, currentPartIndex } from '../src/plan/plannedDays.mjs';
import { buildDirectionalItinerary } from '../src/route/itinerary.mjs';
import { WAYPOINT_TO_HUT } from '../src/route/waypointStops.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const today = read('src/screens/TodayScreen.tsx');
const css = read('src/styles/global.css');

/** Rendered markup only — block and line comments removed. */
const stripComments = (src) =>
  src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');

// ---- Real derived days ------------------------------------------------------

const raw = JSON.parse(read('src/generated/kungsleden-route.json'));
const unpack = (pts) =>
  pts.map(([lat, lon, elevation, cumulativeDistanceKm]) => ({
    lat,
    lon,
    elevation,
    cumulativeDistanceKm,
  }));
const toProfile = (points) =>
  points
    .filter((p) => p.elevation != null)
    .map((p) => ({
      distanceKm: p.cumulativeDistanceKm,
      elevationM: p.elevation,
      lat: p.lat,
      lon: p.lon,
    }));

const canonical = {
  name: raw.name,
  overviewPoints: unpack(raw.overview.points),
  overviewGeoJson: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
  stages: raw.stages.map((g) => {
    const points = unpack(g.points);
    return {
      id: g.id,
      day: g.day,
      fromWaypointId: g.fromWaypointId,
      toWaypointId: g.toWaypointId,
      points,
      geoJson: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      bounds: g.bounds,
      statistics: g.statistics,
      elevationProfile: toProfile(points),
    };
  }),
  waypoints: raw.waypoints,
  bounds: raw.bounds,
  statistics: raw.statistics,
  userBounds: raw.userBounds,
  mapCutoutBounds: raw.mapCutoutBounds,
};

/** The itinerary stages Today reads (mirrors activeItinerary.ts enrichment). */
function stagesFor(direction) {
  return buildDirectionalItinerary(canonical, direction).route.stages.map((s) => ({
    id: s.id,
    day: s.day,
    fromHutId: WAYPOINT_TO_HUT[s.fromWaypointId],
    toHutId: WAYPOINT_TO_HUT[s.toWaypointId],
    distanceKm: s.statistics.distanceKm,
    estimatedHours: 4,
    notes: '',
    totalAscentM: s.statistics.totalAscentM,
    totalDescentM: s.statistics.totalDescentM,
    minimumElevationM: s.statistics.minimumElevationM,
    maximumElevationM: s.statistics.maximumElevationM,
    points: s.points,
    elevationProfile: s.elevationProfile,
  }));
}

const FORWARD = 'abisko-to-nikkaluokta';
const forwardStages = stagesFor(FORWARD);
const plan = (groups) => ({ direction: FORWARD, firstDate: '2026-09-03', groups });

test('with NO plan Today shows seven undated days, one per canonical stage', () => {
  const days = buildPlannedDays(forwardStages, null, 'd1');
  assert.equal(days.length, 7, 'Day 1 of 7, exactly as before the feature');
  const current = currentPlannedDayOf(days);
  assert.equal(current.number, 1);
  assert.equal(current.date, null, 'no date is shown without a plan');
  assert.equal(current.stages.length, 1);
  assert.equal(current.fromStopId, 'abisko');
  assert.equal(current.toStopId, 'abiskojaure', 'Tonight is the stage end');
  assert.deepEqual(current.viaStopIds, [], 'nothing to show as "via"');
});

test('a one-stage planned day reads exactly like its canonical stage, plus a date', () => {
  const days = buildPlannedDays(forwardStages, plan([1, 1, 1, 1, 1, 1, 1]), 'd1');
  const current = currentPlannedDayOf(days);
  const stage = forwardStages[0];
  assert.equal(days.length, 7);
  assert.equal(current.date, '2026-09-03');
  assert.equal(current.distanceKm, stage.distanceKm);
  assert.equal(current.totalAscentM, stage.totalAscentM);
  assert.equal(current.totalDescentM, stage.totalDescentM);
  assert.equal(current.elevationProfile, stage.elevationProfile);
});

test('a two-stage day: Day 3 of 6, via one stop, summed statistics, Tonight = Sälka', () => {
  // Alesjaure → Tjäktja + Tjäktja → Sälka on one day.
  const days = buildPlannedDays(forwardStages, plan([1, 1, 2, 1, 1, 1]), 'd3');
  assert.equal(days.length, 6);
  const current = currentPlannedDayOf(days);
  assert.equal(current.number, 3);
  assert.equal(current.date, '2026-09-05');
  assert.equal(current.fromStopId, 'alesjaure');
  assert.equal(current.toStopId, 'salka', 'Tonight is the day’s FINAL stop');
  assert.deepEqual(current.viaStopIds, ['tjaktja'], 'the intermediate stop is a via');
  const [a, b] = current.stages;
  assert.equal(current.distanceKm, a.distanceKm + b.distanceKm);
  assert.equal(current.totalAscentM, a.totalAscentM + b.totalAscentM);
  assert.equal(current.totalDescentM, a.totalDescentM + b.totalDescentM);
  assert.equal(current.minimumElevationM, Math.min(a.minimumElevationM, b.minimumElevationM));
  assert.equal(current.maximumElevationM, Math.max(a.maximumElevationM, b.maximumElevationM));
});

test('a three-stage day lists both intermediate stops as via', () => {
  const days = buildPlannedDays(forwardStages, plan([1, 1, 3, 1, 1]), 'd3');
  assert.equal(days.length, 5);
  const current = currentPlannedDayOf(days);
  assert.equal(current.stages.length, 3);
  assert.deepEqual(current.viaStopIds, ['tjaktja', 'salka']);
  assert.equal(current.fromStopId, 'alesjaure');
  assert.equal(current.toStopId, 'singi');
});

test('the current PART is identified wherever it sits inside the day', () => {
  const groups = plan([1, 1, 3, 1, 1]);
  for (const [stageId, part] of [['d3', 0], ['d4', 1], ['d5', 2]]) {
    const days = buildPlannedDays(forwardStages, groups, stageId);
    const current = currentPlannedDayOf(days);
    assert.equal(current.number, 3, `${stageId} still resolves to day 3`);
    assert.equal(currentPartIndex(current, stageId), part);
  }
});

test('the journey rail has one marker per PLANNED day, not per stage', () => {
  assert.equal(buildPlannedDays(forwardStages, null, 'd1').length, 7);
  assert.equal(buildPlannedDays(forwardStages, plan([1, 1, 2, 1, 1, 1]), 'd1').length, 6);
  assert.equal(buildPlannedDays(forwardStages, plan([7]), 'd1').length, 1);
});

test('the rail’s end labels stay the route endpoints under any grouping', () => {
  for (const groups of [null, plan([1, 1, 2, 1, 1, 1]), plan([3, 4]), plan([7])]) {
    const days = buildPlannedDays(forwardStages, groups, 'd1');
    assert.equal(days[0].fromStopId, 'abisko');
    assert.equal(days[days.length - 1].toStopId, 'nikkaluokta');
  }
});

// ---- Screen contracts -------------------------------------------------------

test('the hero shows the planned day number, count and date', () => {
  assert.match(today, /Day \{day\.number\} of \{plannedDays\.length\}/);
  assert.match(today, /\{dayDate \? <span className="hero-day__date"> · \{dayDate\}<\/span> : null\}/);
  // No plan means no date — never a fabricated one.
  assert.match(today, /const dayDate = day\?\.date \? formatDayDate\(day\.date\) : null;/);
});

test('the hero shows aggregate statistics and via-stops for a combined day', () => {
  assert.match(today, /formatDistanceKm\(day\.distanceKm\)/);
  assert.match(today, /↗ \{day\.totalAscentM \?\? '—'\} m · ↘ \{day\.totalDescentM \?\? '—'\} m/);
  assert.match(today, /formatHoursEstimate\(day\.estimatedHours\)/);
  assert.match(today, /multiStage \? \(\s*<p className="hero-via">/);
  assert.match(today, /via \{day\.viaStopIds\.map/);
});

test('a combined day never offers a hero action narrower than its claim', () => {
  const hero = today.slice(today.indexOf('className="hero"'), today.indexOf('Today’s stages'));
  // Rendered markup only: the comments in this branch legitimately NAME the
  // actions they explain away.
  const combined = stripComments(
    hero.slice(hero.indexOf('multiStage ? ('), hero.indexOf(') : (')),
  );
  assert.ok(!/Stage Guide/.test(combined), 'no singular Stage Guide on a combined day');
  assert.ok(!/View Route/.test(combined), 'no whole-day View Route on a combined day');
  assert.ok(!/guideStageId|mapStageId/.test(combined), 'no per-stage payload from the hero');
  assert.match(combined, /View today’s stages/);
  // It moves focus to the parts, so keyboard users follow the same path.
  assert.match(combined, /partsRef\.current\?\.scrollIntoView/);
  assert.match(combined, /partsRef\.current\?\.focus\(\)/);
});

test('hero chips stay for a single-stage day and are omitted for a combined one', () => {
  assert.match(
    today,
    /currentStage && !multiStage\s*\?\s*stageHighlights\(currentStage\.id, undefined, routeDirection\)\s*:\s*\[\]/,
  );
});

test('each part keeps its own identity, statistics, chips and links', () => {
  const parts = today.slice(today.indexOf('today-parts__list'), today.indexOf('Journey progress'));
  assert.match(parts, /Part \{i \+ 1\}/);
  assert.match(parts, /formatDistanceKm\(stage\.distanceKm\)/);
  assert.match(parts, /stageHighlights\(stage\.id, 3, routeDirection\)/);
  assert.match(parts, /onNavigate\('stages', \{ guideStageId: stage\.id \}\)/);
  assert.match(parts, /onNavigate\('map', \{ mapStageId: stage\.id \}\)/);
  // Nothing is merged, re-ranked or capped ACROSS stages.
  assert.ok(!/flatMap|concat\(/.test(parts), 'stage content is never merged across parts');
});

test('the current part is marked, because progress follows that canonical stage', () => {
  assert.match(today, /const isCurrentPart = stage\.id === currentStage\.id;/);
  assert.match(today, /Current stage/);
  assert.match(css, /\.today-part\.is-current \{\s*border-color: var\(--cloudberry\);/);
});

test('Tonight is the planned day’s final stop, never an intermediate one', () => {
  assert.match(today, /const to = day \? STOPS_BY_ID\[day\.toStopId\] : null;/);
  assert.match(today, /const nextStop = to;/);
});

test('the day silhouette uses the derived profile, never a re-sampled one', () => {
  assert.match(today, /<HeroSilhouette profile=\{day\.elevationProfile\} \/>/);
});

test('Today reads no clock: the date comes from the plan, not the system', () => {
  assert.ok(!/todayIso|Date\.now|new Date\(/.test(today));
  assert.match(today, /formatDateFieldLabel/);
});

test('the parts section is only rendered for a day with several stages', () => {
  assert.match(today, /const multiStage = \(day\?\.stages\.length \?\? 0\) > 1;/);
  assert.match(today, /\{multiStage \? \(\s*<section\s*\n\s*className="card today-glass today-glass--light today-parts"/);
});

test('the parts card is reachable and focusable for the hero action', () => {
  assert.match(today, /ref=\{partsRef\}/);
  assert.match(today, /tabIndex=\{-1\}/);
  assert.match(today, /aria-labelledby="today-parts-heading"/);
  assert.match(css, /\.today-parts:focus-visible \{\s*outline: 2px solid var\(--glacier-700\);/);
});

test('the desktop grid keeps Journey and Tonight in their original columns', () => {
  // The parts card spans like the hero it belongs to; without this it would
  // take column 1 and push Journey out of the pre-existing composition.
  assert.match(
    css,
    /\.today-screen \[role='tabpanel'\] > section\.today-parts \{\s*grid-column: 1 \/ -1;/,
  );
  assert.match(css, /\.today-screen \[role='tabpanel'\] > \.tonight-row \{\s*grid-column: 2;/);
});

test('part actions meet the touch-target and focus conventions', () => {
  assert.match(css, /\.today-part__action \{[^}]*min-height: 40px;[^}]*padding: 8px 12px;/s);
  assert.match(css, /\.today-part__action:focus-visible \{\s*outline: 2px solid var\(--glacier-700\);/);
  assert.match(css, /\.today-part__action:active \{\s*transform: scale\(0\.97\);/);
  // Stacked full-width on the smallest phones rather than overflowing.
  assert.match(css, /@media \(max-width: 340px\) \{\s*\.today-part__actions \{\s*flex-direction: column;/);
});
