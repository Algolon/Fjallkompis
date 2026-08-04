/**
 * Trail Cockpit composition — the Map's three deliberate layers over the
 * viewport-filling workspace (step 2 of the cockpit iteration):
 *
 *   1. the SCOPE control, top-left: which geometry am I looking at, and an
 *      accessible sheet to change it — never seven permanent chips;
 *   2. the MAP CONTROL STACK, top-right: layer, fit, locate, follow, all at
 *      44×44 with state from icon/text and the accessible name;
 *   3. the TRAIL STATUS DOCK, bottom: one compact state line, one action,
 *      the viewed/tracked distinction, and a sheet holding the detailed
 *      readout, errors, live tracking and the manual fallback.
 *
 * Plus the two invariants the composition must not break: scope selection
 * touches ONLY the browsed stage, and the camera padding comes from the
 * screen through a typed prop (map code never measures app DOM).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('src/styles/global.css');
const screen = read('src/screens/MapScreen.tsx');
const scope = read('src/components/MapScopeControl.tsx');
const stack = read('src/components/MapControlStack.tsx');
const dock = read('src/components/MapStatusDock.tsx');
const mapView = read('src/components/MapView.tsx');

function block(selector, from = 0) {
  const idx = css.indexOf(`${selector} {`, from);
  assert.notEqual(idx, -1, `${selector} rule exists`);
  return css.slice(idx, css.indexOf('}', idx));
}

// ---- 1. Scope control --------------------------------------------------------

test('the map carries ONE scope pill, not a permanent chip row', () => {
  assert.match(screen, /<MapScopeControl/);
  assert.match(scope, /className="map-scope"/);
  assert.match(scope, /aria-haspopup="dialog"/);
  assert.match(scope, /aria-expanded=\{open\}/);
  // The old always-on selector is gone from the map surface entirely.
  assert.ok(!screen.includes('stage-select'), 'no permanent stage chips over the map');
  assert.ok(!css.includes('.stage-select'), 'and no styling left behind');
});

test('the scope sheet lists the full route, every stage, and both markers', () => {
  assert.match(scope, /options\.map\(\(o\) =>/);
  assert.match(scope, /aria-pressed=\{viewing\}/, 'the viewed scope is pressed');
  assert.match(scope, /Viewing<\/span>/, 'an explicit VIEWING marker');
  assert.match(scope, /Current<\/span>/, 'a separate CURRENT-stage marker');
  assert.match(scope, /onStep\(-1\)/, 'previous');
  assert.match(scope, /onStep\(1\)/, 'next');
  // Scope options come from the ACTIVE itinerary, in walking order.
  assert.match(screen, /\.\.\.itinerary\.stages\.map\(\(s\) => \(\{/);
  assert.match(screen, /isCurrent: s\.id === currentStage\?\.id/);
});

test('choosing a scope moves the map only — never the persisted stage', () => {
  // The one writer of the browsed stage, and nothing else.
  assert.match(
    screen,
    /const selectScope = \(stageId: string \| null\) => \{\s*setFocusLabel\(null\);\s*setViewStageId\(stageId\);\s*\};/,
  );
  assert.ok(!screen.includes('setCurrentStage'), 'the Map never sets the current stage');
  assert.match(screen, /const setViewStageId = onViewStageChange/, 'browse state is owned by App');
  // Starting live tracking is the ONE deliberate scope move, and it follows
  // the tracked stage (a visible, predictable transition).
  assert.match(
    screen,
    /tracking\.start\(\);[\s\S]{0,200}setViewStageId\(currentStage\.id\)/,
  );
});

// ---- 2. Control stack --------------------------------------------------------

test('the control stack holds exactly the four map actions', () => {
  assert.match(stack, /aria-label="Map controls"/);
  assert.match(stack, /aria-label=\{`Map layer: \$\{imagery === 'satellite' \? 'Satellite' : 'Terrain'\}`\}/);
  assert.match(stack, /aria-label=\{fitLabel\}/);
  assert.match(stack, /aria-label=\{locating \? 'Locating your position' : 'Locate me'\}/);
  assert.match(stack, /aria-label="Follow my position"/);
  assert.match(stack, /aria-pressed=\{follow\}/);
  // Follow only exists once there is a position to follow.
  assert.match(stack, /\{canFollow \? \(/);
  assert.match(screen, /canFollow=\{marker != null\}/);
});

test('every cockpit control is at least a 44px target with a focus ring', () => {
  const ctrl = block('.map-ctrl');
  assert.match(ctrl, /width: 44px/);
  assert.match(ctrl, /min-height: 44px/);
  assert.match(block('.map-scope'), /min-height: 44px/);
  assert.match(block('.map-dock__status'), /min-height: 44px/);
  assert.match(block('.map-dock__action'), /min-height: 44px/);
  for (const selector of [
    '.map-scope:focus-visible',
    '.map-ctrl:focus-visible',
    '.map-dock__status:focus-visible',
    '.scope-option:focus-visible',
  ]) {
    assert.ok(css.includes(selector), `${selector} exists`);
  }
});

test('state never rests on colour alone', () => {
  // Layer: the icon itself changes (summit vs photo) and the name spells it out.
  assert.match(stack, /<Image size=\{20\}/);
  assert.match(stack, /<Mountain size=\{20\}/);
  // Follow: a caption AND aria-pressed alongside the filled treatment.
  assert.match(stack, /\{follow \? 'On' : 'Off'\}/);
  // Scope markers are text pills, not colour swatches.
  assert.match(scope, /pill pill-glacier">Viewing/);
  assert.match(scope, /pill pill-current">Current/);
});

test('no permanent touch zoom buttons; pointer devices keep MapLibre zoom', () => {
  assert.match(
    mapView,
    /window\.matchMedia\?\.\('\(hover: hover\) and \(pointer: fine\)'\)\.matches/,
  );
  assert.match(mapView, /new maplibregl\.NavigationControl\(\{ showCompass: false \}\),\s*'bottom-right'/);
  assert.ok(!stack.includes('Zoom in'), 'the cockpit adds no zoom buttons of its own');
});

test('controls stay readable over any basemap, with a solid fallback', () => {
  const surface = css.slice(
    css.indexOf('.map-scope,\n.map-ctrl,\n.map-note,\n.map-dock {'),
    css.indexOf('/* 1a. Scope control'),
  );
  assert.match(surface, /background: color-mix\(in srgb, var\(--paper\) 93%, transparent\)/);
  assert.match(surface, /backdrop-filter: blur\(3px\)/, 'restrained blur, not a glass slab');
  assert.match(surface, /@supports not \(backdrop-filter: blur\(3px\)\)[\s\S]*background: var\(--paper\)/);
  assert.match(
    surface,
    /@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\)[\s\S]*backdrop-filter: none/,
  );
});

// ---- 3. Status dock ----------------------------------------------------------

test('the dock shows one state, one action, and opens the details sheet', () => {
  assert.match(screen, /<MapStatusDock/);
  assert.match(dock, /className="map-dock__headline" role="status"/, 'transitions are announced');
  assert.match(dock, /aria-haspopup="dialog"/);
  assert.match(dock, /aria-expanded=\{detailsOpen\}/);
  assert.match(dock, /status\.actionKind === 'stop' \? 'btn-danger' : 'btn-primary'/);
  // The dock's wording is derived by the pure state machine, not inline.
  assert.match(screen, /const status = dockStatus\(\{/);
  assert.match(screen, /import \{ dockStatus \} from '\.\.\/map\/mapDockState\.mjs'/);
});

test('the viewed/tracked mismatch is spelled out in the dock', () => {
  assert.match(dock, /Viewing <b>\{mismatch\.viewing\}<\/b> · Tracking <b>\{mismatch\.tracking\}<\/b>/);
  assert.match(screen, /const mismatch = scopeMismatch\(\{/);
  assert.match(screen, /viewedStageId: viewStageId/);
  assert.match(screen, /trackedStageId: currentStage\?\.id \?\? null/);
});

test('the details sheet keeps every readout the screen used to show', () => {
  const sheet = screen.slice(screen.indexOf('<MapStatusSheet'));
  for (const [needle, what] of [
    ['renderLiveProgress(session', 'live progress readout'],
    ['renderProgress(progress', 'one-shot progress readout'],
    ['session.lastFix.accuracyM', 'live accuracy'],
    ['geo.accuracyM', 'one-shot accuracy'],
    ['{tracking.error}', 'tracking errors'],
    ['{geo.error}', 'geolocation errors'],
    ['Live tracking · Beta', 'starting live tracking'],
    ['Stop tracking', 'stopping live tracking'],
    ['Use manual mode instead', 'manual position fallback'],
    ['Set position from stop', 'manual position commit'],
  ]) {
    assert.ok(sheet.includes(needle), `${what} lives in the details sheet`);
  }
});

test('the dock is a compact bar, never a panel across the map', () => {
  const bar = block('.map-dock', css.indexOf('/* 3. Trail status dock. */'));
  assert.match(bar, /max-width: 640px/);
  assert.match(bar, /margin: 0 auto/);
  assert.match(block('.map-dock__detail'), /-webkit-line-clamp: 2/, 'at most two lines');
  // The old permanently-visible progress card is gone from the map surface.
  assert.ok(
    !/className="card"/.test(
      screen.slice(
        screen.indexOf('<div className="screen screen--map">'),
        screen.indexOf('<MapStatusSheet'),
      ),
    ),
    'no permanently visible card over the map',
  );
});

// ---- Sheets: one accessible species ------------------------------------------

test('all three sheets are modal dialogs with Escape, backdrop and focus return', () => {
  for (const [name, src, opener] of [
    ['scope', scope, 'pillRef'],
    ['layer', stack, 'layersRef'],
    ['status', dock, null],
  ]) {
    assert.match(src, /<dialog/, `${name} sheet is a native dialog`);
    assert.match(src, /className="sheet /, `${name} sheet reuses the sheet species`);
    assert.match(src, /dialog\.showModal\(\)/, `${name} sheet is modal (focus trap + Escape)`);
    assert.match(src, /useOverlayScrollLock\(\)/, `${name} sheet holds the scroll lock`);
    assert.match(
      src,
      /onClose=\{\(e\) => \{[\s\S]{0,240}?e\.stopPropagation\(\);/,
      `${name} sheet stops React's re-bubbled close event`,
    );
    assert.match(src, /onCancel=\{\(e\) => e\.stopPropagation\(\)\}/, `${name} sheet scopes Escape`);
    assert.match(
      src,
      /if \(e\.target === ref\.current\) ref\.current\?\.close\(\)/,
      `${name} sheet closes on its backdrop`,
    );
    if (opener) {
      assert.match(src, new RegExp(`${opener}\\.current\\?\\.focus\\(\\)`), `${name} returns focus`);
    }
  }
  // The status sheet's opener is the dock button; the screen owns its state.
  assert.match(screen, /onOpenDetails=\{\(\) => setDetailsOpen\(true\)\}/);
  assert.match(screen, /onClose=\{\(\) => setDetailsOpen\(false\)\}/);
});

// ---- Compact map states ------------------------------------------------------

test('offline and error states are compact map notes or sheet copy, not banners', () => {
  // Satellite-not-downloaded is explained in the layer sheet…
  assert.match(stack, /Not downloaded<\/span>/);
  assert.match(stack, /Download it in Settings → Satellite imagery/);
  assert.match(stack, /disabled=\{!satelliteAvailable\}/);
  // …a missing basemap gets a compact on-map state (it changes the map
  // materially) plus the sheet explanation…
  assert.match(screen, /basemapMode === 'none' \? \(\s*<p className="map-note map-note--warn" role="status">/);
  assert.match(stack, /The offline basemap isn’t on this device/);
  // …and the old permanent full-width banners are gone from the map screen.
  assert.ok(
    !screen.includes('Satellite imagery isn’t on this device yet'),
    'no permanent satellite banner',
  );
  // (The helpers above the component still use .banner-warn inside the
  // details sheet's readouts — the map SURFACE is what must stay clear.)
  const surface = screen.slice(
    screen.indexOf('<div className="screen screen--map">'),
    screen.indexOf('<MapStatusSheet'),
  );
  assert.ok(!surface.includes('banner-warn'), 'no space-consuming banners over the map');
});

test('map notes stay accessible to screen readers', () => {
  const notes = screen.match(/className="map-note map-note--warn" role="status"/g) ?? [];
  assert.ok(notes.length >= 2, 'focused-place note and basemap note both announce');
});

// ---- Camera padding contract -------------------------------------------------

test('the screen measures its overlays and hands MapView a typed padding', () => {
  assert.match(screen, /import \{ cameraPaddingFor \} from '\.\.\/map\/mapPadding\.mjs'/);
  assert.match(screen, /padding=\{padding\}/, 'passed as a prop, not read from the DOM');
  assert.match(screen, /new ResizeObserver\(measurePadding\)/);
  assert.match(screen, /useLayoutEffect\(\(\) => \{\s*measurePadding\(\);/, 'measured before the map builds');
  assert.match(screen, /topInset: depth\(leadRef\.current, 'top'\)/);
  assert.match(screen, /rightInset: depth\(controlsRef\.current, 'right'\)/);
  assert.match(screen, /bottomInset: depth\(dockBandRef\.current, 'bottom'\)/);
});

test('MapView honours the padding everywhere it frames geometry', () => {
  assert.match(mapView, /padding\?: MapPadding;/);
  assert.match(mapView, /paddingRef\.current = padding \?\? DEFAULT_PADDING/);
  assert.match(mapView, /fitBounds\(bounds, \{ padding: paddingRef\.current/, 'fitRoute/fitStage');
  assert.match(mapView, /map\.fitBounds\(b, \{ padding: paddingRef\.current/, 'focused routes');
  assert.match(mapView, /padding: paddingRef\.current,\s*\.\.\.animate\(\),\s*\}\);/, 'focused points');
  assert.match(mapView, /fitBoundsOptions: \{ padding: paddingRef\.current \}/, 'the initial fit');
  assert.match(mapView, /padding: paddingRef\.current,\s*\}\);/, 'the camera constraints');
  // A padding change re-derives the constraints but must NOT move the camera.
  assert.match(mapView, /applyLayoutConstraintsRef\.current\?\.\(\);/);
  assert.ok(
    !/padding\?\.top[\s\S]{0,400}easeTo|padding\?\.top[\s\S]{0,400}fitBounds/.test(mapView),
    'no camera animation on a padding change',
  );
});

test('map code never measures app chrome itself', () => {
  for (const [name, src] of [['MapView', mapView], ['mapPadding', read('src/map/mapPadding.mjs')]]) {
    assert.ok(
      !/querySelector\(['"]\.map-|getBoundingClientRect\(\)/.test(src),
      `${name} does not reach into app DOM for layout`,
    );
  }
});

// ---- Behavioural invariants preserved ----------------------------------------

test('the map instance, follow rules and popup behaviour are untouched', () => {
  // Created once; React updates mutate sources/layers.
  assert.match(mapView, /\/\/ ---- Create the map once/);
  assert.match(mapView, /\}, \[\]\);/);
  // User pan/zoom drops follow; programmatic fits do not.
  assert.match(mapView, /if \(e\.originalEvent\) callbacksRef\.current\.onUserInteract\?\.\(\)/);
  assert.match(screen, /onUserInteract=\{\(\) => setFollow\(false\)\}/);
  // Direction still remounts deliberately.
  assert.match(screen, /key=\{itinerary\.direction\}/);
  // Stop popup + deep links survive.
  assert.match(screen, /onOpenStop\?\.\(selectedStop\.id\)/);
  assert.match(screen, /m\.fitStage\(focus\.stageId\)/);
  assert.match(screen, /m\.focusRoute\(\{/);
  assert.match(screen, /m\.focusPoint\(\{ lat: focus\.coord\.lat, lon: focus\.coord\.lng \}\)/);
  // One position source at a time.
  assert.match(screen, /locateDisabled=\{tracking\.active \|\| geo\.status === 'locating'\}/);
  // No breadcrumb retention.
  assert.match(screen, /keepLog: false,\s*keepTrail: false,/);
});
