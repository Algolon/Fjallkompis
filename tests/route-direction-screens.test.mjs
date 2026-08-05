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
const today = read('src/components/TodayOnRoute.tsx');
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
  // The physical currentStageId is untouched, so its itinerary day/endpoints
  // are recomputed, not remapped. Since the Day plan feature the action also
  // REMOVES any plan in the same update (a plan describes a journey in one
  // direction) — but it still never rewrites currentStageId.
  assert.match(store, /if \(s\.routeDirection === next\) return s;/);
  assert.match(store, /return \{ \.\.\.s, routeDirection: next, dayPlan: null \};/);
  const action = /const setRouteDirection = useCallback\([\s\S]*?\}, \[\]\);/.exec(store)[0];
  assert.ok(
    !/currentStageId/.test(action),
    'the direction action never rewrites the current stage',
  );
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
  // Confirmation only when the change is consequential — a current stage, or
  // (since the Day plan) a personal plan that the change would remove.
  // Otherwise apply immediately.
  assert.match(
    settings,
    /if \(currentStage \|\| dayPlan\) setPending\(dir\);\s*else setRouteDirection\(dir\);/,
  );
  // Dialog copy + actions per spec. With a Day plan the change is destructive
  // and says so; without one the original copy is unchanged.
  assert.match(settings, /Change route direction\?/);
  assert.match(settings, /packing list, journal and stop notes will stay unchanged/);
  assert.match(settings, /primaryLabel=\{dayPlan \? 'Remove day plan and change direction' : 'Change direction'\}/);
  assert.match(settings, /Remove day plan and change direction\?/);
  // The dialog itself is the shared accessible ConfirmDialog component
  // (extracted so the packing editor can reuse it).
  assert.match(settings, /import \{ ConfirmDialog \} from '\.\.\/components\/ConfirmDialog'/);
  const dialog = readFileSync(join(root, 'src/components/ConfirmDialog.tsx'), 'utf8');
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
});

// ---- Screens consume the active itinerary -----------------------------------

test('Today renders itinerary-ordered stages and days, and the oriented silhouette', () => {
  // Without a Day plan Today renders the ORIGINAL stage view, straight from
  // the active itinerary; with one it renders planned calendar days derived
  // from the same ordered stages. Both flip with direction.
  assert.match(today, /const \{ stages \} = useStore\(\)/);
  assert.match(today, /stages\.map\(\(stage\) =>/);
  assert.match(today, /Day \{stage\.day\} of \{stages\.length\}/);
  assert.match(today, /Day \{day\.number\} of \{dayCount\}/);
  // Silhouettes follow the oriented profiles.
  assert.match(today, /<HeroSilhouette profile=\{stage\.elevationProfile\} \/>/);
  assert.match(today, /<HeroSilhouette profile=\{day\.elevationProfile\} \/>/);
  // Highlights are direction-aware.
  assert.match(today, /stageHighlights\(stage\.id, undefined, routeDirection\)/);
  // A planned day's chips come from that DAY's own leg, read in the LEG's
  // absolute orientation — an opposite leg on a forward journey describes
  // the climb the walker actually makes, never the mirror of it.
  assert.match(today, /stageHighlights\(leadStage\.id, undefined, leadLegDirection\)/);
  assert.match(
    today,
    /leadLeg\?\.orientation === 'opposite' \? REVERSE_DIRECTION : DEFAULT_DIRECTION/,
  );
  // Journey legend reads from the ordered stages (flips with direction).
  assert.match(today, /stages\[0\]\.fromHutId/);
  assert.match(today, /stages\[stages\.length - 1\]\.toHutId/);
});

test('Stages uses the itinerary for order, geometry, guides and header', () => {
  assert.match(
    stages,
    /const \{ state, itinerary, stages, currentStage, setCurrentStage, plannedDays \} = useStore\(\)/,
  );
  assert.match(stages, /stages\.map\(\(stage\) =>/);
  assert.match(stages, /stageGuide\(stage\.id, itinerary\.direction\)/);
  assert.match(stages, /\{itinerary\.displayName\}/);
  // Header is direction-aware (no hard-coded "Abisko to Nikkaluokta").
  assert.match(stages, /from \{startName\} to \{endName\}/);
  // Set-as-current still stores the stable physical id (via the occurrence
  // rule: unambiguous stages go straight through the store).
  assert.match(stages, /setCurrentStage\(stageId\)/);
});

test('Stops renders itinerary order with start-relative distances', () => {
  assert.match(stops, /const \{ itinerary, state, routeDirection \} = useStore\(\)/);
  // A trailhead's transport deep link depends on which way the hiker walks.
  assert.match(stops, /direction=\{routeDirection\}/);
  assert.match(stops, /transportLinkForStop\(stop\.id, direction\)/);
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
  // Progress projection is no longer presented on the Map (the status dock
  // and its sheet were removed); the live session still feeds the CURRENT
  // stage's oriented points to the projector inside useRouteTracking.
  assert.match(map, /stagePoints: currentStage\?\.points \?\? null/);
  assert.match(
    read('src/hooks/useRouteTracking.ts'),
    /projectOntoRoute\(points, fix/,
    'the hook still projects onto the oriented stage points',
  );
  // No presentation-time "100 - percent" reversal anywhere.
  assert.ok(!/100\s*-\s*.*percent/.test(map), 'no 100 − percent hack on Map');
});
