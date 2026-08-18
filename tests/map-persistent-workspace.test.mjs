/**
 * Persistent pre-initialized Map workspace — the P1 architecture fences.
 *
 * P0 (deferred basemap warm-up + first-useful-render reveal) measured no
 * perceived improvement on the physical Samsung: the dominant remaining cost
 * was that Screens() renders only the active destination, so every deliberate
 * Map open still paid MapView mount → archive resolution → the MapLibre
 * constructor → style/tile load → first useful render. P1 removes that whole
 * chain from the navigation critical path: the shell mounts ONE persistent
 * Map workspace in the deferred startup phase, keeps it alive across tab
 * changes, and navigation merely activates/deactivates it.
 *
 * These fences prove the architecture:
 *  - one workspace, outside the keyed <main> remount, never nav-keyed;
 *  - deferred background mount that cannot block startup, with an immediate
 *    mount when the user (or the #/map hash) beats the idle callback;
 *  - once mounted, no code path unmounts it — leaving the Map deactivates;
 *  - inactive = invisible AND inert to pointer/keyboard/AT; active restores
 *    normal interaction in the exact same viewport slot;
 *  - the ONLY sanctioned rebuild is the walking-direction remount;
 *  - deactivation keeps the tracking hook's documented guarantee ("leaving
 *    the Map tab always releases GPS");
 *  - the one-shot "View on map" focus is consumed via prop transitions now
 *    that unmounting no longer clears it;
 *  - dev-only evidence counters can prove "constructor count = 1 per
 *    session" without production console noise.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const app = read('src/App.tsx');
const workspace = read('src/components/MapWorkspace.tsx');
const mapScreen = read('src/screens/MapScreen.tsx');
const mapView = read('src/components/MapView.tsx');
const evidence = read('src/map/workspaceEvidence.ts');
const css = read('src/styles/global.css');

/** The declaration block of the FIRST rule whose selector text matches. */
function block(selector) {
  const idx = css.indexOf(`${selector} {`);
  assert.notEqual(idx, -1, `${selector} rule exists`);
  return css.slice(idx, css.indexOf('}', idx));
}

// ---------------------------------------------------------------------------
// One persistent workspace, outside the destination remount
// ---------------------------------------------------------------------------

test('the Map workspace lives outside the keyed <main> and is never nav-keyed', () => {
  // Composition: .app-workspaces wraps the keyed <main> AND the workspace,
  // so both occupy the same slot; the workspace element itself carries no
  // key derived from navigation, which is what lets it survive tab changes.
  const wrapper = app.indexOf('<div className="app-workspaces">');
  const main = app.search(/<main\s+key=/);
  const ws = app.indexOf('<MapWorkspace');
  assert.ok(wrapper >= 0 && main > wrapper && ws > main, 'wrapper → keyed main → workspace');
  const wsTag = app.slice(ws, app.indexOf('/>', ws));
  assert.ok(!/key=\{`?\$?\{?nav/.test(wsTag), 'the workspace is not keyed by navigation');
  assert.match(wsTag, /active=\{nav\.tab === 'map'\}/, 'navigation only toggles active');
});

test('Screens() no longer constructs the Map — one instance can exist', () => {
  const mapCase = app.slice(app.indexOf("case 'map':"), app.indexOf("case 'guide':"));
  assert.match(mapCase, /return null;/, 'the map case yields no screen');
  assert.ok(!mapCase.includes('<MapScreen'), 'no second MapScreen from the switch');
  assert.equal(app.match(/<MapWorkspace/g)?.length, 1, 'exactly one workspace element');
  assert.ok(!app.includes("from './screens/MapScreen'"), 'App only knows the workspace');
  assert.equal(
    workspace.match(/<MapScreen/g)?.length,
    1,
    'the workspace hosts exactly one MapScreen',
  );
});

test('once mounted, nothing unmounts the workspace', () => {
  assert.match(app, /const \[mapWorkspaceMounted, setMapWorkspaceMounted\] = useState/);
  const sets = app.match(/setMapWorkspaceMounted\(([^)]*)\)/g) ?? [];
  assert.ok(sets.length > 0, 'the mounted flag is set somewhere');
  for (const call of sets) {
    assert.match(call, /true/, `mount flag only ever moves to true (saw: ${call})`);
  }
});

// ---------------------------------------------------------------------------
// Deferred background initialization that cannot block startup
// ---------------------------------------------------------------------------

test('the workspace mounts in the deferred startup phase, on the shared policy', () => {
  // Reuses the P0 idle/deferred scheduling (requestIdleCallback + bounded
  // timeout, setTimeout fallback) instead of inventing another timer.
  assert.match(app, /scheduleWarmup\(\(\) => setMapWorkspaceMounted\(true\)\)/);
  assert.match(app, /from '\.\/map\/warmupScheduling\.mjs'/);
});

test('a user (or #/map hash) that beats the idle callback mounts immediately', () => {
  // Initial destination IS the map → mount from the first render…
  assert.match(app, /\(\) => nav\.tab === 'map',?\n/, 'hash-start on Map mounts immediately');
  // …and a navigation to the Map before the idle callback fires mounts now;
  // the flag is idempotent, so the in-flight workspace is REUSED, never
  // duplicated.
  assert.match(app, /if \(nav\.tab === 'map'\) setMapWorkspaceMounted\(true\);/);
});

test('startup never waits on the map: the content destinations ignore the flag', () => {
  // <Screens> renders unconditionally inside <main>; only the workspace
  // element is gated on the mounted flag.
  const main = app.slice(app.search(/<main\s+key=/), app.indexOf('</main>'));
  assert.ok(!main.includes('mapWorkspaceMounted'), 'Today/Guide/Plan render regardless');
  assert.match(app, /\{mapWorkspaceMounted \? \(\s*\n\s*<MapWorkspace/);
});

// ---------------------------------------------------------------------------
// Inactive = invisible and inert; active = the same viewport as before
// ---------------------------------------------------------------------------

test('the inactive workspace is hidden from pointer, keyboard and AT — but keeps layout', () => {
  const ws = block('.map-workspace');
  assert.match(ws, /visibility: hidden/, 'hidden-but-laid-out (NOT display:none)');
  assert.match(ws, /pointer-events: none/);
  assert.ok(!ws.includes('display: none'), 'display:none would zero the canvas');
  assert.match(ws, /position: absolute/);
  assert.match(ws, /inset: 0/, 'exactly the slot <main> occupies');
  const active = block('.map-workspace.is-active');
  assert.match(active, /visibility: visible/);
  assert.match(active, /pointer-events: auto/);
  // Explicit, testable semantics on top of visibility.
  assert.match(workspace, /aria-hidden=\{!active\}/);
  assert.match(workspace, /hostRef\.current\.inert = !active/);
});

test('activation re-syncs the canvas with an explicit resize', () => {
  assert.match(mapView, /resize: \(\) => mapRef\.current\?\.resize\(\)/, 'the handle exposes it');
  const gate = mapScreen.slice(
    mapScreen.indexOf('const wasActiveRef'),
    mapScreen.indexOf('}, [active]);'),
  );
  assert.match(gate, /mapRef\.current\?\.resize\(\);/, 'and activation calls it');
});

// ---------------------------------------------------------------------------
// Reset semantics survive persistence
// ---------------------------------------------------------------------------

test('the walking-direction change is the ONE sanctioned rebuild', () => {
  assert.match(workspace, /<MapScreen key=\{direction\}/, 'scoped remount key');
  assert.match(app, /direction=\{routeDirection\}/, 'driven by the store direction');
  // MapView keeps its own belt-and-braces route-identity key inside the screen.
  assert.match(mapScreen, /key=\{itinerary\.direction\}/);
});

test('deactivation releases GPS exactly like the old unmount did', () => {
  // useRouteTracking documents "leaving the Map tab always releases GPS";
  // with no unmount on tab switch, the active→false transition owns it.
  const gate = mapScreen.slice(
    mapScreen.indexOf('const wasActiveRef'),
    mapScreen.indexOf('}, [active]);'),
  );
  assert.match(gate, /if \(tracking\.active\) tracking\.stop\(\);/);
  assert.match(gate, /setFollow\(false\);/);
});

test('the one-shot focus is consumed by prop transitions, not by unmounting', () => {
  // Payload gone (any navigation that does not carry one) → the transient
  // highlight is cleared from the focus source.
  const effect = mapScreen.slice(
    mapScreen.indexOf('if (!focus) {'),
    mapScreen.indexOf('}, [focus]);'),
  );
  assert.match(effect, /m\?\.focusPoint\(null\);/);
});

// ---------------------------------------------------------------------------
// Evidence: provable single-constructor sessions, dev-only
// ---------------------------------------------------------------------------

test('the evidence counters can prove constructor count = 1 per session', () => {
  assert.match(evidence, /mapConstructors: number;/);
  assert.match(evidence, /workspaceMounts: number;/);
  assert.match(evidence, /activationsWhileReady: number;/);
  assert.match(evidence, /activationsWhileInitializing: number;/);
  assert.match(mapView, /recordMapConstructor\(\);/, 'counted at the real constructor');
  assert.match(mapView, /recordMapReady\(\);/, 'ready = P0 first useful render');
  assert.match(workspace, /recordWorkspaceMount\(\);/);
  assert.match(workspace, /recordActivation\(\)/);
  assert.match(workspace, /recordDeactivation\(\)/);
});

test('the evidence is development-only and silent', () => {
  const guards = evidence.match(/if \(!import\.meta\.env\.DEV\) return;/g) ?? [];
  assert.ok(guards.length >= 5, 'every recorder bails in production builds');
  assert.ok(!evidence.includes('console.'), 'no console noise, dev or prod');
});

// ---------------------------------------------------------------------------
// The map's own lifecycle hygiene is unchanged
// ---------------------------------------------------------------------------

test('MapView still tears down completely on the sanctioned remount', () => {
  // The direction remount is the one path that destroys a map; it must keep
  // removing everything (no leaked instances, observers or markers).
  const cleanup = mapView.slice(
    mapView.indexOf('return () => {'),
    mapView.indexOf('// eslint-disable-next-line react-hooks/exhaustive-deps'),
  );
  assert.match(cleanup, /resizeObs\?\.disconnect\(\);/);
  assert.match(cleanup, /markers\.forEach\(\(m\) => m\.remove\(\)\);/);
  assert.match(cleanup, /map\?\.remove\(\);/);
  assert.match(cleanup, /popupRef\.current\?\.remove\(\);/);
});

test('background existence starts no location work', () => {
  // Mounting the workspace must not touch geolocation: the one-shot hook is
  // strictly locate()-driven and the tracking watcher is start()-driven.
  const geo = read('src/hooks/useGeolocation.ts');
  assert.ok(!/useEffect/.test(geo), 'useGeolocation runs nothing on mount');
  const tracking = read('src/hooks/useRouteTracking.ts');
  assert.ok(
    !/useEffect\(\(\) => \{\s*\n?\s*(controller\.)?start/.test(tracking),
    'useRouteTracking never starts itself',
  );
});
