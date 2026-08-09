/**
 * Trail Cockpit composition — what floats over the viewport-filling Map, and
 * what deliberately does not.
 *
 *   1. the SCOPE control, top-left: which geometry am I looking at, with an
 *      accessible sheet to change it — never seven permanent chips;
 *   2. the MAP CONTROL STACK, top-right: layer (an anchored popover, not a
 *      sheet), fit, a ONE-SHOT locate and live tracking — two separate
 *      controls, never one button with a hidden second gesture;
 *   3. NOTHING ELSE in the idle state. A compact live pill appears only
 *      while a tracking session runs; refusals and failures are said once in
 *      a transient note. There is no permanent status dock, card or sheet.
 *
 * Plus the invariants the composition must not break: scope selection
 * touches ONLY the browsed stage, and the camera padding comes from the
 * screen through a typed prop (map code never measures app DOM).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = read('src/styles/global.css');
const screen = read('src/screens/MapScreen.tsx');
const scope = read('src/components/MapScopeControl.tsx');
const stack = read('src/components/MapControlStack.tsx');
const pill = read('src/components/MapTrackingPill.tsx');
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
  assert.match(screen, /\.\.\.itinerary\.stages\.map\(\(s\) => \(\{/);
  assert.match(screen, /isCurrent: s\.id === currentStage\?\.id/);
});

test('choosing a scope moves the map only — never the persisted stage', () => {
  assert.match(
    screen,
    /const selectScope = \(stageId: string \| null\) => \{\s*setFocusLabel\(null\);\s*setViewStageId\(stageId\);\s*\};/,
  );
  assert.ok(!screen.includes('setCurrentStage'), 'the Map never sets the current stage');
  assert.match(screen, /const setViewStageId = onViewStageChange/, 'browse state is owned by App');
  // Starting live tracking is the ONE deliberate scope move.
  assert.match(screen, /tracking\.start\(\);[\s\S]{0,200}setViewStageId\(currentStage\.id\)/);
});

// ---- 2. Control stack --------------------------------------------------------

test('the stack holds four controls, with locate and tracking SEPARATE', () => {
  assert.match(stack, /aria-label="Map controls"/);
  // The layers control's accessible name gains a clause when optional map
  // data is absent, so the dot beside the glyph is never the only carrier.
  assert.match(stack, /'Choose map layer — some optional map data is not downloaded'/);
  assert.match(stack, /: 'Choose map layer'/);
  assert.match(stack, /aria-label=\{fitLabel\}/);
  // One-shot locate…
  assert.match(stack, /aria-label=\{locating \? 'Locating your position' : 'Locate me'\}/);
  // …and live tracking, which is its own control with its own verbs.
  assert.match(
    stack,
    /const trackingLabel = !trackingActive\s*\? 'Start live tracking'\s*: following\s*\? 'Following your position'\s*: 'Resume following';/,
  );
  assert.match(stack, /aria-label=\{trackingLabel\}/);
  assert.match(stack, /aria-pressed=\{trackingActive\}/);
  // No hidden second gesture anywhere in the cockpit.
  assert.ok(
    !/onDoubleClick|dblclick|doubleTap|longPress/i.test(stack + screen),
    'no double-click / long-press shortcuts',
  );
});

test('locate is one-shot: no session, no follow, no duplicate requests', () => {
  assert.match(screen, /onLocate=\{geo\.locate\}/);
  assert.match(
    screen,
    /locateDisabled=\{tracking\.active \|\| geo\.status === 'locating'\}/,
    'inert while a request is in flight and while a session owns the position',
  );
  assert.match(stack, /aria-busy=\{locating\}/);
  // The one-shot centre is a single easeTo, not follow mode.
  assert.match(screen, /mapRef\.current\?\.centerOn\(geo\.coord\)/);
});

test('live tracking keeps its foreground-only, no-history contract', () => {
  assert.match(screen, /keepLog: false,\s*keepTrail: false,/);
  assert.match(screen, /onStartTracking=\{startTracking\}/);
  assert.match(screen, /onResumeFollow=\{resumeFollow\}/);
  // Refusal without a current stage is a message, not a sheet.
  assert.match(
    screen,
    /if \(!currentStage\) \{[\s\S]{0,220}say\('Select a current stage in Stages before starting live tracking\.'\)/,
  );
  // A pan pauses following; it must never stop the session.
  assert.match(screen, /onUserInteract=\{\(\) => setFollow\(false\)\}/);
  assert.match(
    screen,
    /const resumeFollow = \(\) => \{\s*if \(marker\) mapRef\.current\?\.centerOn\(marker\);\s*setFollow\(true\);\s*\};/,
  );
  const stopBlock = screen.slice(screen.indexOf('const stopTracking'));
  assert.match(stopBlock.slice(0, 160), /tracking\.stop\(\);\s*setFollow\(false\);/);
});

test('the recentre that resumes following is never cancelled by follow itself', () => {
  // Two regressions this fences, both found live:
  //  - a fresh { lat, lng } object per render made MapView re-ease the camera
  //    on every unrelated re-render while following, which swallowed the
  //    deliberate recentre a beat after it started;
  //  - the follow-toggle snap must yield to a programmatic move already in
  //    flight, or it replaces the recentre's zoom with the old one.
  assert.match(screen, /const marker = useMemo\(/);
  assert.match(screen, /\[liveLat, liveLon, geo\.coord\]/);
  const followEffect = mapView.slice(mapView.indexOf('// ---- Follow toggled on'));
  assert.match(followEffect.slice(0, 800), /if \(map\.isMoving\(\)\) return;/);
});

test('every cockpit control is at least a 44px target with a focus ring', () => {
  const ctrl = block('.map-ctrl');
  assert.match(ctrl, /width: 44px/);
  assert.match(ctrl, /min-height: 44px/);
  assert.match(block('.map-scope'), /min-height: 44px/);
  assert.match(block('.map-popover__option'), /min-height: 44px/);
  assert.match(block('.map-track__stop'), /min-height: 44px/);
  for (const selector of [
    '.map-scope:focus-visible',
    '.map-ctrl:focus-visible',
    '.map-popover__option:focus-visible',
    '.map-track__stop:focus-visible',
    '.scope-option:focus-visible',
  ]) {
    assert.ok(css.includes(selector), `${selector} exists`);
  }
});

test('state never rests on colour alone', () => {
  // Captions are for NON-DEFAULT states only. A caption on every control in
  // every state is decoration, and it costs geometry: the caption sits inside
  // the 44px box, so a captioned control's glyph rode ~6px above an
  // uncaptioned one's and the column lost its optical rhythm.
  //
  // Layer: no caption on the default terrain basemap; "Sat" identifies the
  // non-default one. The checked state is in the popover either way.
  assert.match(stack, /\{imagery === 'satellite' \? \(\s*<span className="map-ctrl__caption">Sat<\/span>\s*\) : null\}/);
  assert.match(stack, /aria-checked=\{imagery === o\.mode\}/);
  assert.ok(!/'Terr'/.test(stack), 'the always-on default-state caption is gone');
  // Tracking: idle needs no word (the arrow and the accessible name say
  // "start"), but a RUNNING session has a three-way state, so On vs Hold
  // stays in text — it must never rest on colour.
  assert.match(stack, /\{trackingActive \? \(\s*<span className="map-ctrl__caption">\{following \? 'On' : 'Hold'\}<\/span>\s*\) : null\}/);
  assert.ok(!/'Live'/.test(stack), 'the idle caption is gone');
  // All three accessible names survive regardless of caption.
  assert.match(stack, /aria-label=\{trackingLabel\}/);
  // The live pill states its route status in words.
  assert.match(pill, /\{pill\.state\}/);
});

test('uncaptioned controls centre their glyph, so the column keeps one rhythm', () => {
  const ctrl = block('.map-ctrl');
  assert.match(ctrl, /justify-content: center/);
  // Captions render conditionally rather than as an always-present empty
  // node, so a captionless control has nothing to offset its icon against.
  assert.ok(
    !/<span className="map-ctrl__caption">\s*\{[^}]*\?[^}]*:\s*''\s*\}/.test(stack),
    'no empty-string caption is rendered to preserve a slot',
  );
});

test('missing optional map data is a quiet standing fact, not an error', () => {
  // A dot on the Layers control, driven by the SAME archive-status hook the
  // Settings → Offline maps cards read, so the two can never disagree.
  assert.match(stack, /useCombinedArchiveStatus\(\[TERRAIN_ARCHIVE, CONTOURS_ARCHIVE\]\)/);
  assert.match(stack, /useCombinedArchiveStatus\(\[SATELLITE_ARCHIVE\]\)/);
  assert.match(stack, /const optionalMissing =/);
  // Suppressed while the probes run, so the map never blinks a marker on the
  // way to the truth…
  assert.match(stack, /!relief\.checking &&\s*!satellite\.checking/);
  // …and it disappears once the data is there.
  assert.match(stack, /\(!relief\.downloaded \|\| !satellite\.downloaded\)/);
  assert.match(stack, /\{optionalMissing \? <span className="map-ctrl__dot" aria-hidden \/> : null\}/);
  // The default basemap remains fully usable, so the dot must not use a
  // warning tone — glacier is the cool/technical/spatial role.
  const dot = block('.map-ctrl__dot');
  assert.match(dot, /background: var\(--glacier\)/);
  assert.ok(!/--danger/.test(dot), 'never a warning colour for a working map');
});

// ---- 3. Layers popover (NOT a sheet) ----------------------------------------

test('the layer chooser is the conventional icon and an anchored popover', () => {
  assert.match(stack, /import \{ Crosshair, Layers, Maximize, Navigation \} from 'lucide-react'/);
  assert.match(stack, /<Layers size=\{20\}/, 'the stacked-layers icon');
  assert.ok(!/Mountain|<Image /.test(stack), 'the mountain/photo icons are gone');
  // A popover, not a dialog/sheet: no <dialog>, no modal, no scroll lock.
  assert.ok(!stack.includes('<dialog'), 'no dialog element');
  assert.ok(!stack.includes('showModal'), 'never modal');
  assert.ok(!stack.includes('useOverlayScrollLock'), 'no page-level scroll lock for a popover');
  assert.ok(!css.includes('.map-layer-sheet'), 'the old layer sheet styling is gone');
  assert.match(stack, /className="map-popover"/);
  assert.match(stack, /role="radiogroup"/);
  assert.match(stack, /role="radio"/);
  // Anchored to the button, right-aligned so it stays on screen.
  assert.match(block('.map-ctrl-anchor'), /position: relative/);
  const pop = block('.map-popover');
  assert.match(pop, /position: absolute/);
  assert.match(pop, /top: calc\(100% \+ 6px\)/);
  assert.match(pop, /right: 0/);
  assert.match(pop, /max-width: calc\(100vw - 24px\)/, 'never wider than the viewport');
  assert.ok(!/width: 100%/.test(pop), 'never a full-width surface');
});

test('the popover closes every way it should, and gives focus back', () => {
  assert.match(stack, /if \(e\.key === 'Escape'\)/, 'Escape');
  assert.match(stack, /document\.addEventListener\('pointerdown', onPointerDown, true\)/, 'outside click');
  assert.match(stack, /onBlur=\{\(e\) => \{\s*if \(!e\.currentTarget\.contains\(e\.relatedTarget as Node \| null\)\) onClose\(\);/);
  const focusReturns = stack.match(/layersRef\.current\?\.focus\(\)/g) ?? [];
  assert.ok(focusReturns.length >= 2, 'focus returns after choosing AND after closing');
  // Choosing applies the layer and closes.
  assert.match(stack, /onChoose=\{\(mode\) => \{\s*onImageryChange\(mode\);\s*setLayersOpen\(false\);/);
  // Keyboard model for a radio group.
  assert.match(stack, /ArrowDown' \|\| e\.key === 'ArrowRight'/);
  assert.match(stack, /ArrowUp' \|\| e\.key === 'ArrowLeft'/);
  assert.match(stack, /e\.key === 'Home' \|\| e\.key === 'End'/);
  assert.match(stack, /\[aria-checked="true"\]/, 'focus starts on the active choice');
});

test('unavailable satellite stays listed, disabled, and explained in one line', () => {
  assert.match(stack, /disabled: !satelliteAvailable/);
  assert.match(stack, /'Not downloaded'/);
  // Layers stays the place where the user SEES what is missing and learns
  // where to resolve it — said once for both optional archives, not repeated
  // per option.
  assert.match(stack, /relief not downloaded/);
  assert.match(stack, /Add optional map data in Settings → Offline maps\./);
  assert.match(block('.map-popover__option'), /min-height: 44px/);
  // …and nothing permanent is reserved on the map for it.
  assert.ok(
    !screen.includes('Satellite imagery isn’t on this device yet'),
    'no permanent satellite banner',
  );
});

// ---- 4. The removed dock -----------------------------------------------------

test('the permanent status dock and its details sheet are GONE', () => {
  for (const gone of [
    'src/components/MapStatusDock.tsx',
    'src/map/mapDockState.mjs',
    'src/map/mapDockState.d.mts',
    'tests/map-status-dock.test.mjs',
    'src/components/TrackingStatus.tsx',
  ]) {
    assert.ok(!existsSync(join(root, gone)), `${gone} no longer exists`);
  }
  for (const dead of ['MapStatusDock', 'MapStatusSheet', 'dockStatus', 'TrackingStatusOverlay']) {
    assert.ok(!screen.includes(dead), `${dead} is not referenced any more`);
  }
  for (const deadCss of ['.map-dock', '--map-dock-h']) {
    assert.ok(!css.includes(deadCss), `${deadCss} styling is gone`);
  }
  // No "Where am I?" headline, no dock copy, no idle progress bar.
  assert.ok(!screen.includes('Where am I?'), 'the dock headline is gone');
  assert.ok(!/<progress/.test(screen), 'no progress bar on the map');
  assert.ok(!screen.includes('ProgressReadout'), 'no progress card on the map');
  // …and no dormant sheet left behind on the Map.
  assert.ok(!screen.includes('<dialog'), 'the Map screen renders no sheet of its own');
});

test('the idle map reserves no bottom band at all', () => {
  // The band is rendered ONLY when a pill exists…
  assert.match(screen, /\{pill \? \(\s*<div className="map-cockpit-bottom" ref=\{attachBottomBand\}>/);
  // …so the camera's bottom inset is zero without one. Measured once and
  // shared by BOTH padding contracts (operational and overview).
  assert.match(screen, /const bottomInset = depth\(bottomBandRef\.current, 'bottom'\)/);
  assert.match(
    css,
    /\.map-canvas-wrap \.maplibregl-ctrl-bottom-left,\n\.map-canvas-wrap \.maplibregl-ctrl-bottom-right \{\n  bottom: var\(--map-bottom-h, 0px\);/,
    "MapLibre's bottom controls drop back down when the pill goes",
  );
});

// ---- 5. The live pill --------------------------------------------------------

test('the pill exists only while tracking, and is small and quiet', () => {
  assert.match(screen, /const pill = trackingPill\(\{/);
  assert.match(screen, /active: tracking\.active/);
  assert.match(screen, /<MapTrackingPill pill=\{pill\} onStop=\{stopTracking\} \/>/);
  const bar = block('.map-track', css.indexOf('/* 2. Live-tracking pill'));
  assert.match(bar, /width: fit-content/, 'never a card spanning the map');
  assert.match(bar, /border-radius: 999px/);
  assert.match(bar, /margin: 0 auto/);
});

test('the pill states the tracked stage, the route state, and Stop', () => {
  assert.match(pill, /\{pill\.label\}/);
  assert.match(pill, /\{pill\.state\}/);
  assert.match(pill, /className="map-track__stop"/);
  assert.match(pill, /aria-label=\{`\$\{pill\.stopLabel\} live tracking`\}/);
  assert.match(pill, /role="status"/, 'transitions are announced');
  assert.match(pill, /trackingAnnouncement\(pill\)/);
  // Stop is its own button, clearly separated from the text.
  assert.ok(!/onClick=\{onStop\}[\s\S]{0,80}map-track__text/.test(pill));
});

test('failures and refusals are transient messages, never surfaces', () => {
  assert.match(screen, /const say = useCallback\(\(text: string\) => \{/);
  assert.match(screen, /window\.setTimeout\(\(\) => setMessage\(null\), 7000\)/);
  assert.match(screen, /if \(geo\.status === 'error' && geo\.error\) say\(geo\.error\)/);
  // During a session the pill carries the live state, so only a
  // session-ending tracking error is spoken.
  assert.match(screen, /if \(tracking\.error && !tracking\.active\) say\(tracking\.error\)/);
  assert.match(screen, /\{message \? \(\s*<p className="map-note map-note--warn" role="status">/);
});

// ---- 6. Camera padding contract ---------------------------------------------

test('the screen measures its overlays and hands MapView a typed padding', () => {
  assert.match(
    screen,
    /import \{ cameraPaddingFor, overviewPaddingFor \} from '\.\.\/map\/mapPadding\.mjs'/,
  );
  assert.match(screen, /padding=\{padding\}/, 'passed as a prop, not read from the DOM');
  assert.match(screen, /overviewPadding=\{overviewPadding\}/, 'so is the overview rectangle');
  assert.match(screen, /new ResizeObserver\(measurePadding\)/);
  assert.match(screen, /useLayoutEffect\(\(\) => \{\s*measurePadding\(\);/, 'measured before the map builds');
  // Insets are measured ONCE and shared, so the two contracts can never
  // disagree about where the chrome is.
  assert.match(screen, /const topInset = depth\(leadRef\.current, 'top'\)/);
  assert.match(screen, /rightInset: depth\(controlsRef\.current, 'right'\)/);
  // The bottom band mounts and unmounts with the pill, so it is observed
  // through a callback ref rather than a static list.
  assert.match(screen, /const attachBottomBand = useCallback\(/);
  assert.match(screen, /observerRef\.current\?\.observe\(node\)/);
});

test('the overview padding is NOT charged the control stack', () => {
  // The whole point of the second rectangle: the stack is a local overlay
  // over one corner, so the full-route composition does not reserve its
  // width for the entire viewport height. Only the operational padding does.
  const call = screen.slice(
    screen.indexOf('overviewPaddingFor({', screen.indexOf('const nextOverview')),
  ).slice(0, 260);
  assert.ok(!/rightInset/.test(call), 'no rightInset in the overview padding call');
  assert.match(call, /topInset,/, 'the scope control really is across the top');
  assert.match(call, /bottomInset,/, 'the tracking pill still counts while it exists');
});

test('MapView frames the route and operational geometry by different contracts', () => {
  assert.match(mapView, /padding\?: MapPadding;/);
  assert.match(mapView, /overviewPadding\?: MapPadding;/);
  assert.match(mapView, /paddingRef\.current = padding \?\? DEFAULT_PADDING/);
  assert.match(
    mapView,
    /overviewPaddingRef\.current = overviewPadding \?\? padding \?\? DEFAULT_PADDING/,
    'falls back rather than losing a padding entirely',
  );
  // ONE operational fit helper for stages and focused content…
  assert.match(mapView, /const fitBounds = \(bounds: \[\[number, number\], \[number, number\]\]\) => \{/);
  assert.match(mapView, /if \(stage\) fitBounds\(stage\.bounds\)/);
  // …and NO 'overview' mode left in it: the full-route camera is a
  // constrained fit that fitBounds cannot express, so it must be impossible
  // to reach a whole-route framing through this helper by accident.
  assert.ok(
    !/fitBounds\([^)]*'overview'\)/.test(mapView),
    'no bounds-fit may frame the full route',
  );
  assert.ok(
    !/mode === 'overview'/.test(mapView),
    "the fit helper no longer carries an 'overview' mode",
  );
  assert.match(mapView, /map\.fitBounds\(b, \{ padding: paddingRef\.current/, 'focused routes');
  // The full-route overview is NOT a bounds-fit: it is a constrained fit
  // (route-centred, then translated back inside the active mode's renderable
  // envelope), which fitBounds cannot express. Both the initial camera and
  // "Fit route" call the SAME solver, which is a stronger guarantee than
  // sharing a padding rectangle — they cannot disagree at all.
  assert.match(
    mapView,
    /const initialCamera = computeOverviewCamera\(\);[\s\S]{0,600}center: \[initialCamera\.camera\.lng, initialCamera\.camera\.lat\],\s*\n\s*zoom: initialCamera\.camera\.zoom,/,
    'the initial camera is the solved overview camera',
  );
  // EVERY full-route path goes through the one solver: initial camera,
  // imperative Fit route, and the return from stage mode.
  assert.match(mapView, /applyOverviewCameraRef\.current = applyOverviewCamera/);
  assert.match(
    mapView,
    /fitRoute: \(\) => \{\s*\n\s*applyOverviewCameraRef\.current\?\.\(\);/,
    'Fit route goes through the shared overview path',
  );
  assert.match(
    mapView,
    /if \(stage\) fitBounds\(stage\.bounds\);\s*\n\s*else applyOverviewCameraRef\.current\?\.\(\);/,
    'stage → full route goes through the same shared overview path',
  );
  // The constraints exist to permit that overview, so they share its rectangle.
  assert.match(mapView, /padding: overviewPaddingRef\.current,\s*\}\);/);
  assert.match(mapView, /applyLayoutConstraintsRef\.current\?\.\(\);/);
});

test('the fit is single-shot: no measure-then-nudge camera correction', () => {
  // A corrective second move would show as a fit followed by an easeTo/
  // panBy/setCenter in the same path. The only easeTo calls are the GPS
  // follow, resume-following and focusPoint — none of them after a fit.
  const fitIdx = mapView.indexOf("fitRoute: () => fitBounds");
  const after = mapView.slice(fitIdx, fitIdx + 400);
  assert.ok(!/panBy|setCenter|jumpTo/.test(after), 'no nudge after the route fit');
  assert.ok(!/requestAnimationFrame[\s\S]{0,120}fitBounds/.test(mapView), 'no deferred re-fit');
  assert.ok(!/queryRenderedFeatures/.test(mapView), 'no collision probing in the fit path');
});

test('map code never measures app chrome itself', () => {
  for (const [name, src] of [['MapView', mapView], ['mapPadding', read('src/map/mapPadding.mjs')]]) {
    assert.ok(
      !/querySelector\(['"]\.map-|getBoundingClientRect\(\)/.test(src),
      `${name} does not reach into app DOM for layout`,
    );
  }
});

// ---- 7. Behavioural invariants preserved -------------------------------------

test('the map instance, follow rules and popup behaviour are untouched', () => {
  assert.match(mapView, /\/\/ ---- Create the map once/);
  assert.match(mapView, /if \(e\.originalEvent\) callbacksRef\.current\.onUserInteract\?\.\(\)/);
  assert.match(screen, /key=\{itinerary\.direction\}/);
  assert.match(screen, /onOpenStop\?\.\(selectedStop\.id\)/);
  assert.match(screen, /m\.fitStage\(focus\.stageId\)/);
  assert.match(screen, /m\.focusRoute\(\{/);
  assert.match(screen, /m\.focusPoint\(\{ lat: focus\.coord\.lat, lon: focus\.coord\.lng \}\)/);
  assert.match(screen, /<StopPreview/);
});

test('the tracking maths and route projection are kept, only their UI changed', () => {
  // The hook still computes complete-route status AND current-stage progress…
  assert.match(screen, /useRouteTracking\(\{\s*routePoints: route\.overviewPoints,\s*stagePoints: currentStage\?\.points \?\? null,/);
  // …and the projection module is untouched and still used by it.
  assert.ok(existsSync(join(root, 'src/utils/routeProgress.mjs')));
  assert.match(read('src/hooks/useRouteTracking.ts'), /trackingSession/);
});
