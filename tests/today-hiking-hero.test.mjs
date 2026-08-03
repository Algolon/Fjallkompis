/** Today hiking-hero derivation, responsive material and navigation contracts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hikingDayRouteFocus, hikingDaySegments } from '../src/plan/hikingDayHero.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = readFileSync(join(root, 'src/components/TodayOnRoute.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const stagesScreen = readFileSync(join(root, 'src/screens/StagesScreen.tsx'), 'utf8');

const points = (base) => [
  { lat: base, lon: base + 0.1 },
  { lat: base + 0.2, lon: base + 0.3 },
];
const stage = (id, from, to, distanceKm, routePoints = points(1)) => ({
  id,
  fromHutId: from,
  toHutId: to,
  distanceKm,
  points: routePoints,
});
const leg = (id, stageValue) => ({ id, stageId: stageValue.id, stage: stageValue });

test('ordinary single-stage hiking day derives one unchanged segment', () => {
  const d3 = stage('d3', 'alesjaure', 'tjaktja', 13.224);
  assert.deepEqual(hikingDaySegments({ legs: [leg('leg-3', d3)] }), [{
    id: 'leg-3',
    stageId: 'd3',
    fromStopId: 'alesjaure',
    toStopId: 'tjaktja',
    distanceKm: 13.224,
  }]);
});

test('two-stage combined day preserves saved walking order', () => {
  const d3 = stage('d3', 'alesjaure', 'tjaktja', 13.224);
  const d4 = stage('d4', 'tjaktja', 'salka', 12.648);
  assert.deepEqual(
    hikingDaySegments({ legs: [leg('leg-3', d3), leg('leg-4', d4)] })
      .map((segment) => [segment.stageId, segment.fromStopId, segment.toStopId]),
    [
      ['d3', 'alesjaure', 'tjaktja'],
      ['d4', 'tjaktja', 'salka'],
    ],
  );
});

test('reverse-route combined day uses its oriented stage views verbatim', () => {
  const d4Reverse = stage('d4', 'salka', 'tjaktja', 12.648, points(4).reverse());
  const d3Reverse = stage('d3', 'tjaktja', 'alesjaure', 13.224, points(3).reverse());
  const day = { legs: [leg('leg-4r', d4Reverse), leg('leg-3r', d3Reverse)] };
  assert.deepEqual(hikingDaySegments(day).map((segment) => segment.stageId), ['d4', 'd3']);
  assert.deepEqual(hikingDaySegments(day).map((segment) => segment.fromStopId), ['salka', 'tjaktja']);
  const focus = hikingDayRouteFocus(day);
  assert.deepEqual(focus.tracks[0][0], { lat: 4.2, lng: 4.3 });
  assert.deepEqual(focus.destination, { lat: 3, lng: 3.1 });
});

test('missing optional distance stays absent instead of being approximated', () => {
  const incomplete = stage('d-x', 'start', 'finish', undefined);
  const [segment] = hikingDaySegments({ legs: [leg('leg-x', incomplete)] });
  assert.equal(segment.distanceKm, null);
  assert.ok(hikingDayRouteFocus({ legs: [leg('leg-x', incomplete)] }), 'verified geometry still works');
});

test('combined route navigation retains one verified track per leg', () => {
  const a = stage('a', 'one', 'two', 1, points(1));
  const b = stage('b', 'far-three', 'far-four', 2, points(8));
  const focus = hikingDayRouteFocus({ legs: [leg('leg-a', a), leg('leg-b', b)] });
  assert.equal(focus.tracks.length, 2);
  assert.deepEqual(focus.tracks[0].at(-1), { lat: 1.2, lng: 1.3 });
  assert.deepEqual(focus.tracks[1][0], { lat: 8, lng: 8.1 });
});

test('combined Stage guide and View route target all day-owned content', () => {
  assert.match(today, /guideStageIds: uniqueGuideStageIds/);
  assert.match(today, /guideReversedStageIds: uniqueReversedStageIds/);
  assert.match(today, /tracks: routeFocus\.tracks/);
  assert.match(app, /initialGuideStageIds=\{nav\.payload\?\.guideStageIds\}/);
  assert.match(stagesScreen, /new Set<string>\(initiallyOpenGuideIds\)/);
});

test('long segment names truncate without pushing out distance or actions', () => {
  assert.match(today, /className="hero-segment__route" title=\{segment\.route\}/);
  assert.match(css, /\.hero-segment__route \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s);
  assert.match(css, /grid-template-columns: 19px minmax\(0, 1fr\) auto/);
});

test('320 px rules retain two 44 px glass actions without horizontal overflow', () => {
  assert.match(css, /\.hero-action \{[^}]*min-width: 0;[^}]*min-height: 44px;/s);
  assert.match(css, /@media \(max-width: 340px\) \{[^}]*\.hero-segment__distance/s);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*?\.hero-action \{\s*padding-inline: 8px;/);
});

test('glass has readable no-filter and reduced-transparency fallbacks', () => {
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)/);
  assert.match(css, /\.hero-action--glass[^}]*backdrop-filter: blur\(12px\) saturate\(1\.2\)/s);
});
