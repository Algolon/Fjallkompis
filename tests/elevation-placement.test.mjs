/**
 * Elevation information architecture — the route-planning elevation profile
 * lives on STAGES, never on the MAP.
 *
 * The repo has no DOM test runner, so the screen behaviour is pinned as a
 * source contract on MapScreen.tsx / StagesScreen.tsx (same approach as
 * stage-guides.test.mjs), backed by data-integrity checks on the generated
 * route so every stage has authoritative, stage-local hydrated data to draw:
 *
 *  - Map is navigation/positioning only: no ElevationProfile, no combined
 *    route/stage summary card, no "Set as current" action, no elevation
 *    imports left dangling;
 *  - Stages owns the full-route elevation as a collapsed-by-default
 *    disclosure inside the summary card (overview profile + route stats),
 *    and each day guide shows its own stage-local profile + statistics;
 *  - both disclosures are real buttons with wired aria-expanded /
 *    aria-controls and unique panel ids.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const route = require(join(root, 'src/generated/kungsleden-route.json'));

const mapScreen = readFileSync(join(root, 'src/screens/MapScreen.tsx'), 'utf8');
const stagesScreen = readFileSync(join(root, 'src/screens/StagesScreen.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

// ---- Map: information column is content-sized, not stretched ----------------

test('the Map information column is not stretched to the map height', () => {
  // The roomy-landscape grid keeps items at the top of the column…
  assert.match(css, /\.map-layout\s*\{[\s\S]*?align-items:\s*start;/);
  // …and the right-hand column must NOT force a full-height / flex-grown card
  // (the reverted PR #52 regression): the compact position/manual-mode card
  // stays only as tall as its content.
  assert.ok(
    !/\.map-side\s*\{[^}]*align-self:\s*stretch/.test(css),
    'no align-self:stretch on .map-side',
  );
  assert.ok(
    !/\.map-side\s*>\s*\.card:last-child\s*\{[^}]*flex:\s*1/.test(css),
    'no flex-grow on the last .map-side card',
  );
});

// ---- Map: no route-planning summary or elevation profile -------------------

test('Map screen no longer renders any elevation profile', () => {
  assert.ok(!mapScreen.includes('ElevationProfile'), 'no ElevationProfile component on Map');
  assert.ok(
    !mapScreen.includes('OVERVIEW_ELEVATION_PROFILE'),
    'no overview elevation profile imported on Map',
  );
  assert.ok(!/elev-section|elev-heading/.test(mapScreen), 'no elevation section markup on Map');
});

test('Map screen no longer renders the combined route/stage summary card', () => {
  // The planning statistics table and its title logic are gone…
  assert.ok(!mapScreen.includes('summaryTitle'), 'no summary-title logic on Map');
  assert.ok(!/>\s*Distance\s*</.test(mapScreen), 'no Distance statistic block on Map');
  assert.ok(
    !/>\s*Ascent \/ descent\s*</.test(mapScreen),
    'no ascent/descent statistic block on Map',
  );
  assert.ok(!/>\s*Elevation range\s*</.test(mapScreen), 'no elevation-range block on Map');
  // …and the card's "Set as current" action moved to Stages.
  assert.ok(!mapScreen.includes('Set as current'), 'no Set-as-current action on Map');
  assert.ok(!mapScreen.includes('setCurrentStage'), 'Map no longer sets the current stage');
});

test('Map keeps its navigation and tracking controls', () => {
  // Guard rails: the removal must not have taken map navigation with it.
  assert.ok(mapScreen.includes('<MapView'), 'the map itself stays');
  assert.match(mapScreen, /aria-label="Previous stage"/);
  assert.match(mapScreen, /aria-label="Next stage"/);
  assert.match(mapScreen, /Fit \{viewStageId \? 'stage' : 'route'\}/);
  assert.ok(mapScreen.includes('stage-select'), 'stage selector stays on Map');
  assert.ok(mapScreen.includes('geo.locate'), 'Locate stays on Map');
  assert.ok(mapScreen.includes('Live tracking'), 'live tracking stays on Map');
  assert.ok(mapScreen.includes('Follow'), 'Follow stays on Map');
  assert.ok(mapScreen.includes('imagery'), 'terrain/satellite imagery toggle stays on Map');
});

// ---- Stages: full-route elevation disclosure -------------------------------

test('Stages renders the full-route elevation as a collapsed disclosure', () => {
  assert.ok(stagesScreen.includes('ElevationProfile'), 'Stages renders ElevationProfile');
  // Collapsed by default.
  assert.match(stagesScreen, /const \[routeElevOpen, setRouteElevOpen\] = useState\(false\)/);
  // Real disclosure button with wired ARIA and a unique controlled panel id.
  assert.match(stagesScreen, /aria-expanded=\{routeElevOpen\}/);
  assert.match(stagesScreen, /aria-controls=\{routeElevPanelId\}/);
  assert.match(stagesScreen, /routeElevPanelId = 'route-elevation-panel'/);
  // Reuses the established day-guide toggle styling — not a new component.
  const toggles = stagesScreen.match(/className="stage-guide__toggle"/g) ?? [];
  assert.ok(toggles.length >= 2, 'route-elevation toggle reuses the day-guide toggle style');
  assert.match(stagesScreen, /<span>Elevation profile<\/span>/);
});

test('the full-route profile uses the ACTIVE itinerary overview profile and statistics', () => {
  // Direction-aware: the overview profile and statistics come from the active
  // itinerary (oriented, ascent/descent following the walked direction), not
  // the fixed-forward routeData constants.
  assert.match(
    stagesScreen,
    /profile=\{itinerary\.overviewElevationProfile\}[\s\S]*?statistics=\{itinerary\.statistics\}/,
  );
  // No second full-route statistics grid above the chart — the pills own it.
  assert.ok(!/<div className="stat-grid"/.test(stagesScreen), 'no statistics grid on Stages');
});

// ---- Stages: per-stage elevation inside the day guide ----------------------

test('each day guide draws its own oriented stage profile and statistics', () => {
  // The panel takes the ACTIVE itinerary stage and draws its own oriented,
  // stage-local profile + statistics — never a crop of the overview chart.
  assert.match(stagesScreen, /profile=\{stage\.elevationProfile\}/);
  assert.match(stagesScreen, /statistics=\{stage\.statistics\}/);
  assert.match(stagesScreen, /<StageGuidePanel stage=\{stage\} guide=\{guide\}/);
  // A semantic label sits above each stage chart.
  assert.match(stagesScreen, /<span className="stage-guide__label">Elevation profile<\/span>/);
});

test('the day-guide deep link still opens the elevation-bearing guide', () => {
  // Deep link seeds exactly the requested stage open; the elevation chart is
  // part of that opened panel (StageGuidePanel), so it is visible on arrival.
  assert.match(
    stagesScreen,
    /new Set<string>\(initialGuideStageId \? \[initialGuideStageId\] : \[\]\)/,
  );
  assert.ok(
    stagesScreen.indexOf('StageGuidePanel') !== -1,
    'the opened panel is the elevation-bearing StageGuidePanel',
  );
});

// ---- Data integrity: every stage has authoritative, stage-local data -------

test('no stage id is missing hydrated route data to draw', () => {
  assert.equal(route.stages.length, 7, 'seven stages');
  for (const stage of route.stages) {
    assert.ok(Array.isArray(stage.points) && stage.points.length > 1, `${stage.id} has points`);
    // Packed point: [lat, lon, elevationM|null, cumulativeKm].
    const withElevation = stage.points.filter((p) => p[2] != null);
    assert.ok(
      withElevation.length > 1,
      `${stage.id} has ≥ 2 elevation samples for a profile`,
    );
    const st = stage.statistics;
    assert.ok(st && typeof st.distanceKm === 'number' && st.distanceKm > 0, `${stage.id} distance`);
    assert.ok(typeof st.minimumElevationM === 'number', `${stage.id} min elevation`);
    assert.ok(typeof st.maximumElevationM === 'number', `${stage.id} max elevation`);
  }
});

test('every stage profile is stage-local — starts at 0 km, ends at its own distance', () => {
  for (const stage of route.stages) {
    const first = stage.points[0];
    const last = stage.points[stage.points.length - 1];
    assert.ok(Math.abs(first[3]) < 1e-6, `${stage.id} profile starts at 0 km (got ${first[3]})`);
    // The axis ends at the stage's own length, not a full-route cumulative km.
    assert.ok(
      Math.abs(last[3] - stage.statistics.distanceKm) < 0.05,
      `${stage.id} profile ends at its own distance (${last[3]} vs ${stage.statistics.distanceKm})`,
    );
    assert.ok(
      last[3] < route.statistics.distanceKm,
      `${stage.id} axis is stage-local, not the 104.5 km full route`,
    );
  }
});
