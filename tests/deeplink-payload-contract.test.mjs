/**
 * STRUCTURAL SOURCE CONTRACT — the cross-tab navigation payload.
 *
 * READ THIS FIRST: unlike the other four contract files added alongside it,
 * this one is NOT a runtime behaviour test. `NavPayload` is a TypeScript
 * interface whose producers are JSX click handlers and whose consumers are
 * React props and `useState` initialisers; there is no pure module and no DOM
 * runner in this repo, so what is fenced here is the WIRING — which field
 * exists, who sends it, who reads it, and which field wins when two overlap.
 * A green run means the wiring still matches; it does not prove a click
 * navigates.
 *
 * Why it is still worth having: the payload is the only thing holding the six
 * destinations together today, and vNext collapses Stages + Stops into Guide
 * and Lists + parts of Settings into Plan. Every one of these fields either
 * moves, merges or disappears in that cutover, and a field silently losing
 * its consumer would show up as "the deep link just opens the plain screen" —
 * a bug nobody notices in review.
 *
 * WHAT REPLACES THIS: the bookmarkable Guide stage/place routes the blueprint
 * calls for. Once a real route layer parses `#/guide/stage/d3` into a typed
 * destination, these become behavioural parse/format tests against that pure
 * module — exactly like tests/navigation-routes.test.mjs already is for the
 * tab table — and this file should be deleted rather than extended.
 *
 * Regressions this catches: a payload field added to the type but never
 * consumed (or renamed on one side only); `stopId` overtaking `placeId`; the
 * map stage selection losing its "key present" distinction so that focusing a
 * detour stops deselecting the stage; a Lists deep link losing its section
 * precedence; and any attempt to persist a one-shot payload or put it in the
 * URL.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const app = read('src/App.tsx');
const todayScreen = read('src/screens/TodayScreen.tsx');
const stagesScreen = read('src/screens/StagesScreen.tsx');
const stopsScreen = read('src/screens/StopsScreen.tsx');
const listsScreen = read('src/screens/ListsScreen.tsx');
const settingsScreen = read('src/screens/SettingsScreen.tsx');
const mapScreen = read('src/screens/MapScreen.tsx');
const todayOnRoute = read('src/components/TodayOnRoute.tsx');
const todayPrepare = read('src/components/TodayPrepare.tsx');

const declaration = /export interface NavPayload \{[\s\S]*?\n\}/.exec(todayScreen)[0];

// ---- The field inventory ----------------------------------------------------

test('the payload carries exactly these fields — an addition must be wired here', () => {
  // Read off the type itself rather than hard-coded prose, so a new field
  // cannot be added without this file being updated to say who sends and who
  // reads it.
  const fields = [...declaration.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual(fields, [
    'stopId',
    'placeId',
    'mapStageId',
    'guideStageId',
    'guideStageIds',
    'guideReversed',
    'guideReversedStageIds',
    'lists',
    'settings',
    'mapFocus',
  ]);
  // Every field is optional: a payload is always a partial hint, never a
  // required argument, so a destination must render without one.
  for (const field of fields) {
    assert.match(declaration, new RegExp(`^ {2}${field}\\?:`, 'm'), `${field} is optional`);
  }
});

test('every payload field has a producer, and is read by the app shell', () => {
  // Producers are the screens/components that call navigate(); the app shell
  // is the one place that reads a payload and hands it to its destination.
  const producers = {
    stopId: [todayOnRoute, app],
    placeId: [todayOnRoute, listsScreen],
    mapStageId: [todayOnRoute],
    guideStageId: [todayOnRoute],
    guideStageIds: [todayOnRoute],
    guideReversed: [todayOnRoute],
    guideReversedStageIds: [todayOnRoute],
    lists: [stopsScreen, todayPrepare],
    settings: [todayPrepare],
    mapFocus: [stagesScreen, todayOnRoute],
  };
  for (const [field, sources] of Object.entries(producers)) {
    assert.ok(
      sources.some((src) => src.includes(field)),
      `${field} has no producer`,
    );
    assert.ok(
      new RegExp(`payload(\\?\\.|\\.)${field}\\b`).test(app),
      `${field} is never consumed by the app shell`,
    );
  }
});

// ---- Priority rules ---------------------------------------------------------

test('placeId WINS over stopId — the generalised id beats the legacy one', () => {
  // Both name a destination in Stops & places; `placeId` additionally covers
  // curated off-route places, so it must be read first. Existing Today/Map
  // links still send the older `stopId`, which is why both are read at all.
  assert.match(
    app,
    /initialPlaceId=\{nav\.payload\?\.placeId \?\? nav\.payload\?\.stopId \?\? null\}/,
  );
  assert.match(stopsScreen, /initialPlaceId\?: string \| null;/);
  assert.match(todayOnRoute, /onNavigate\('huts', \{ placeId: place\.id \}\)/);
  assert.match(todayOnRoute, /onNavigate\('huts', \{ stopId: stop\.id \}\)/);
  assert.match(app, /onOpenStop=\{\(stopId\) => navigate\('huts', \{ stopId \}\)\}/);
});

test('the map stage selection distinguishes an ABSENT key from an explicit null', () => {
  // `{ mapStageId: null }` deselects the browsed stage; a payload without the
  // key leaves the Map's in-memory browse state alone. `in` is what carries
  // that distinction — `?? null` alone would collapse the two.
  assert.match(app, /if \(tab === 'map' && 'mapStageId' in \(payload \?\? \{\}\)\)/);
  assert.match(app, /setMapViewStageId\(payload\?\.mapStageId \?\? null\);/);
  assert.match(todayScreen, /mapStageId\?: string \| null;/, 'the type allows the explicit null');
});

test('a full-stage focus selects the stage; a point or route focus DESELECTS it', () => {
  // Otherwise the stage would re-fit the camera and bury the detour the user
  // asked to see.
  assert.match(
    app,
    /payload\.mapFocus\.kind === 'stage' \? payload\.mapFocus\.stageId : null,/,
  );
  assert.match(app, /if \(tab === 'map' && payload\?\.mapFocus\)/);
  assert.match(app, /focus=\{nav\.payload\?\.mapFocus \?\? null\}/);
});

test('the three focus kinds are a closed union, each with a producer and a handler', () => {
  assert.match(declaration, /kind: 'point' \| 'route' \| 'stage';/);
  // Producers: Stages sends all three, Today's hiking hero sends a route.
  assert.match(stagesScreen, /mapFocus: \{ kind: 'stage'/);
  assert.match(stagesScreen, /kind: 'route',/);
  assert.match(stagesScreen, /kind: 'point',/);
  assert.match(todayOnRoute, /mapFocus: \{\s*kind: 'route',/);
  // Consumer: the Map fits the stage, the supplied track(s), or the point —
  // and never invents geometry for a kind it did not receive.
  assert.match(mapScreen, /if \(focus\.kind === 'stage'\)/);
  assert.match(mapScreen, /m\.fitStage\(focus\.stageId\);/);
  assert.match(mapScreen, /focus\.kind === 'route' &&/);
  assert.match(mapScreen, /m\.focusRoute\(\{/);
  assert.match(mapScreen, /\} else if \(focus\.coord\) \{/);
  assert.match(mapScreen, /m\.focusPoint\(\{ lat: focus\.coord\.lat, lon: focus\.coord\.lng \}\);/);
});

test('the guide payload sends the combined day, and reversal is presentation context only', () => {
  // Today's "Stage guide" opens every stage of a combined hiking day; the
  // scroll target is the first. `guideReversed` says the planned leg walks
  // the stage the other way — a note on the card, never a rewritten guide.
  assert.match(todayOnRoute, /guideStageId: uniqueGuideStageIds\[0\],/);
  assert.match(todayOnRoute, /guideStageIds: uniqueGuideStageIds,/);
  assert.match(todayOnRoute, /guideReversedStageIds: uniqueReversedStageIds,/);
  assert.match(app, /initialGuideStageId=\{nav\.payload\?\.guideStageId \?\? null\}/);
  assert.match(app, /initialGuideStageIds=\{nav\.payload\?\.guideStageIds\}/);
  assert.match(app, /initialGuideReversed=\{nav\.payload\?\.guideReversed === true\}/);
  assert.match(app, /initialGuideReversedStageIds=\{nav\.payload\?\.guideReversedStageIds\}/);
  // The plural list wins over the single id; the single id is the fallback.
  assert.match(
    stagesScreen,
    /initialGuideStageIds\?\.length\s*\n?\s*\? initialGuideStageIds\s*\n?\s*: initialGuideStageId/,
  );
});

test('the Lists deep link resolves its section in a fixed precedence', () => {
  const section = /function initialSectionFor\(link\?: ListsDeepLink\): ListsSection \{[\s\S]*?\n\}/.exec(
    listsScreen,
  )[0];
  assert.match(section, /if \(!link\) return 'packing';/);
  assert.match(section, /if \(link\.shopType\) return 'shops';/);
  assert.match(section, /if \(link\.transportId \|\| link\.transportContext\) return 'transport';/);
  assert.match(section, /if \(link\.tripItemId \|\| link\.trackStayPlaceId\) return 'trip';/);
  assert.match(section, /return link\.section \?\? 'packing';/);
  // A payload-carried intent therefore always beats the bare `section` hint.
  const launch = /function initialTripLaunchFor\(link\?: ListsDeepLink\)[\s\S]*?\n\}/.exec(
    listsScreen,
  )[0];
  assert.match(launch, /if \(link\?\.tripItemId\) return \{ kind: 'item', itemId: link\.tripItemId \};/);
  assert.match(
    launch,
    /if \(link\?\.trackStayPlaceId\) return \{ kind: 'add-stay', placeId: link\.trackStayPlaceId \};/,
  );
  assert.match(launch, /return null;/);
});

test('the Lists deep-link shape is closed, and every member has a producer', () => {
  const listsDeepLink = /export interface ListsDeepLink \{[\s\S]*?\n\}/.exec(listsScreen)[0];
  const members = [...listsDeepLink.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
  assert.deepEqual(members, [
    'section',
    'shopType',
    'transportId',
    'transportContext',
    'tripItemId',
    'trackStayPlaceId',
  ]);
  for (const member of members) {
    assert.ok(
      stopsScreen.includes(member) || todayPrepare.includes(member) || listsScreen.includes(member),
      `${member} has no producer`,
    );
  }
  assert.match(app, /<ListsScreen deepLink=\{nav\.payload\?\.lists\}/);
});

test('the Settings deep link opens exactly one documented section', () => {
  assert.match(settingsScreen, /export type SettingsDeepLinkSection = 'readiness';/);
  assert.match(todayPrepare, /onNavigate\('settings', \{ settings: \{ section: 'readiness' \} \}\)/);
  assert.match(app, /initialSection=\{nav\.payload\?\.settings\?\.section \?\? null\}/);
  assert.match(settingsScreen, /useState\(initialSection === 'readiness'\)/);
});

// ---- One-shot semantics -----------------------------------------------------

test('a payload lives in React memory only — never in the URL, never persisted', () => {
  // The hash carries the destination and nothing else, which is exactly why a
  // bookmarked or refreshed URL opens the plain screen.
  assert.match(app, /setNav\(\{ tab, payload \}\);/);
  assert.match(app, /tab: tabForHash\(window\.location\.hash\) \?\? DEFAULT_TAB,/);
  const routes = read('src/navigation/routes.mjs');
  const persistence = [
    ['routes', routes],
    ['storage', read('src/utils/storage.ts')],
    ['stateMigration', read('src/utils/stateMigration.mjs')],
    ['exportImport', read('src/utils/exportImport.ts')],
  ];
  // Only the distinctive field names — 'lists' and 'settings' are also
  // destination names and legitimately appear in the route table.
  for (const [name, src] of persistence) {
    for (const field of [
      'stopId',
      'placeId',
      'mapStageId',
      'guideStageId',
      'guideReversed',
      'mapFocus',
      'NavPayload',
    ]) {
      assert.ok(!src.includes(field), `${name} must know nothing about ${field}`);
    }
  }
});

test('navigating to the tab you are already on keeps the payload alive', () => {
  // navigate() sets state first and only then touches the hash; the resulting
  // hashchange sees the same tab and returns early, which is what stops it
  // wiping the payload that was just set.
  assert.match(app, /if \(tab === navRef\.current\.tab\) return;/);
  assert.match(app, /if \(window\.location\.hash !== hashForTab\(tab\)\) \{/);
  // Back/Forward to a DIFFERENT tab replaces the whole nav — payload dropped.
  assert.match(app, /setNav\(\{ tab \}\);/);
});

test('an unknown hash falls back without stacking history', () => {
  assert.match(app, /const tab = tabForHash\(window\.location\.hash\);/);
  assert.match(app, /if \(tab === null\) \{/);
  assert.match(
    app,
    /window\.history\.replaceState\(null, '', hashForTab\(navRef\.current\.tab\)\);/,
  );
});

test('a direction change drops any one-shot payload but keeps the destination', () => {
  // A payload names stages, stops or geometry from the previous itinerary;
  // carrying it across a reversal would deep-link to something that no longer
  // means what it did. The TAB survives — only the payload is dropped.
  assert.match(app, /setNav\(\(n\) => \(n\.payload \? \{ tab: n\.tab \} : n\)\);/);
  assert.match(app, /setMapViewStageId\(INITIAL_MAP_VIEW_STAGE_ID\);/);
  assert.match(app, /if \(prevDirectionRef\.current === routeDirection\) return;/);
});

test('destinations consume a payload once, on mount — never as a live prop', () => {
  // Each consumer seeds local state from the payload; nothing re-applies it
  // on a later render, so returning to the tab shows the plain screen.
  assert.match(stopsScreen, /useState<string \| null>\(initialPlaceId \?\? null\)/);
  assert.match(stopsScreen, /useRef\(initialPlaceId \?\? null\)/);
  assert.match(listsScreen, /useState<ListsSection>\(\(\) => initialSectionFor\(deepLink\)\)/);
  assert.match(listsScreen, /initialTripLaunchFor\(deepLink\)/);
  assert.match(settingsScreen, /useState\(initialSection === 'readiness'\)/);
});
