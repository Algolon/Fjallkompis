/**
 * Route-direction screen contracts. The repo has no DOM test runner, so screen
 * behaviour is pinned as source contracts (the same approach as
 * stage-guides.test.mjs / elevation-placement.test.mjs): every screen consumes
 * the ACTIVE itinerary from the store rather than reversing route data itself,
 * and the Settings control + confirmation dialog meet the accessibility rules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const store = read('src/store/AppStore.tsx');
const app = read('src/App.tsx');
const settings = read('src/screens/SettingsScreen.tsx');
const today = read('src/screens/TodayScreen.tsx');
const stages = read('src/screens/StagesScreen.tsx');
const stops = read('src/screens/StopsScreen.tsx');
const map = read('src/screens/MapScreen.tsx');

// ---- Store: single authoritative itinerary, direction persisted -------------

test('the store derives the active itinerary from the persisted direction', () => {
  assert.match(store, /getActiveItinerary\(state\.routeDirection\)/);
  assert.match(store, /useMemo<ActiveItinerary>/);
  // Current stage resolves the STABLE physical id against the itinerary.
  assert.match(store, /itinerary\.stageById\[state\.currentStageId\]/);
  // Only the direction is persisted; the itinerary is derived, never stored:
  // it is not part of the PersistentState shape.
  const types = read('src/types/index.ts');
  assert.match(types, /routeDirection: RouteDirection;/);
  assert.ok(!/^\s*itinerary\??:/m.test(types), 'no itinerary field in the persisted state');
  assert.match(store, /saveState\(state\)/);
  assert.match(store, /setRouteDirection/);
});

test('changing direction keeps the stable current-stage id (no numeric remap)', () => {
  // setRouteDirection only writes routeDirection — the physical currentStageId
  // is untouched, so its itinerary day/endpoints are recomputed, not remapped.
  assert.match(store, /if \(s\.routeDirection === next\) return s;/);
  assert.match(store, /return \{ \.\.\.s, routeDirection: next \};/);
});

// ---- App: reset transient Map browse state on direction change --------------

test('App resets the in-memory Map browse state when direction changes', () => {
  assert.match(app, /const prevDirectionRef = useRef\(routeDirection\)/);
  assert.match(app, /setMapViewStageId\(INITIAL_MAP_VIEW_STAGE_ID\)/);
  // The reactive reset uses app state, not a hard reload.
  assert.ok(!/location\.reload/.test(app), 'no hard reload on direction change');
});

// ---- Settings: accessible radio group + confirmation ------------------------

test('Settings exposes a real radio group with two mutually exclusive options', () => {
  assert.match(settings, /role="radiogroup"/);
  assert.match(settings, /type="radio"/);
  assert.match(settings, /name="route-direction"/);
  assert.match(settings, /ROUTE_DIRECTIONS\.map/);
  // Selected state is signalled beyond colour (a check glyph + is-selected class).
  assert.match(settings, /direction-option__check/);
  assert.match(settings, /is-selected/);
  // The supporting copy avoids technical jargon.
  assert.match(settings, /Choose the direction you are walking/);
  assert.ok(!/reverse geometry|PWA/.test(settings), 'no technical jargon in the copy');
});

test('Settings confirms a consequential direction change and never the active one', () => {
  assert.match(settings, /if \(dir === routeDirection\) return;/);
  // Confirmation only when a current stage exists; otherwise apply immediately.
  assert.match(settings, /if \(currentStage\) setPending\(dir\);\s*else setRouteDirection\(dir\);/);
  // Dialog copy + actions per spec.
  assert.match(settings, /Change route direction\?/);
  assert.match(settings, /packing list, journal and stop notes will stay unchanged/);
  assert.match(settings, /primaryLabel="Change direction"/);
  // The dialog itself is the shared accessible ConfirmDialog component
  // (extracted so the packing editor can reuse it).
  assert.match(settings, /import \{ ConfirmDialog \} from '\.\.\/components\/ConfirmDialog'/);
  const dialog = readFileSync(join(root, 'src/components/ConfirmDialog.tsx'), 'utf8');
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
});

// ---- Screens consume the active itinerary -----------------------------------

test('Today renders itinerary-ordered stages and the oriented silhouette', () => {
  assert.match(today, /const \{ currentStage, stages, routeDirection \} = useStore\(\)/);
  assert.match(today, /stages\.map\(\(stage\) =>/);
  assert.match(today, /Day \{currentStage\.day\} of \{stages\.length\}/);
  // Silhouette follows the active stage's oriented profile.
  assert.match(today, /<HeroSilhouette profile=\{currentStage\.elevationProfile\} \/>/);
  // Highlights are direction-aware.
  assert.match(today, /stageHighlights\(currentStage\.id, undefined, routeDirection\)/);
  // Journey legend reads from the ordered stages (flips with direction).
  assert.match(today, /stages\[0\]\.fromHutId/);
  assert.match(today, /stages\[stages\.length - 1\]\.toHutId/);
});

test('Stages uses the itinerary for order, geometry, guides and header', () => {
  assert.match(stages, /const \{ state, itinerary, stages, currentStage, setCurrentStage \} = useStore\(\)/);
  assert.match(stages, /stages\.map\(\(stage\) =>/);
  assert.match(stages, /stageGuide\(stage\.id, itinerary\.direction\)/);
  assert.match(stages, /\{itinerary\.displayName\}/);
  // Header is direction-aware (no hard-coded "Abisko to Nikkaluokta").
  assert.match(stages, /from \{startName\} to \{endName\}/);
  // Set-as-current still stores the stable physical id.
  assert.match(stages, /setCurrentStage\(stage\.id\)/);
});

test('Stops renders itinerary order with start-relative distances', () => {
  assert.match(stops, /const \{ itinerary, state \} = useStore\(\)/);
  assert.match(stops, /const stops = itinerary\.orderedStops/);
  assert.match(stops, /routeKm=\{itinerary\.stopDistanceKm\[stop\.id\] \?\? 0\}/);
  // The first stop shows "Start"; others show recomputed "x km in".
  assert.match(stops, /routeKm > 0 \? `\$\{formatDistanceKm\(routeKm\)\} in` : 'Start'/);
  // Header no longer hard-codes north-to-south.
  assert.ok(!/north to south/.test(stops), 'Stops header is direction-aware');
  // Keyboard navigation follows the rendered (itinerary) order.
  assert.match(stops, /stops\.length/);
});

test('Map feeds the oriented geometry to MapView and remounts on direction flip', () => {
  assert.match(map, /const \{ itinerary, currentStage \} = useStore\(\)/);
  assert.match(map, /const route = itinerary\.route/);
  assert.match(map, /key=\{itinerary\.direction\}/);
  assert.match(map, /route=\{route\}/);
  // Selector + prev/next follow the itinerary order; progress uses oriented points.
  assert.match(map, /route\.stages\.map\(\(s\) =>/);
  assert.match(map, /\[null, \.\.\.route\.stages\.map\(\(s\) => s\.id\)\]/);
  assert.match(map, /projectOntoRoute\(\s*currentStage\.points/);
  // No presentation-time "100 - percent" reversal anywhere.
  assert.ok(!/100\s*-\s*.*percent/.test(map), 'no 100 − percent hack on Map');
});
