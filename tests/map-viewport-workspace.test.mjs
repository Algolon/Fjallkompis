/**
 * Map destination = viewport-filling, non-scrolling WORKSPACE.
 *
 * The contract these fences protect (Trail Cockpit, step 1):
 *  - the Map root fills the exact height <main> offers and cannot scroll
 *    the shell — panning the map is how you move, not scrolling the page;
 *  - the persistent primary navigation (bottom bar on phones, rail/sidebar
 *    on larger layouts) is untouched and stays visible;
 *  - the browser Fullscreen API is not used anywhere, and MapLibre's native
 *    FullscreenControl is gone (it would take the bottom navigation off
 *    screen with it);
 *  - the map surface fills its slot at every viewport shape instead of the
 *    old width-relative height clamp / 1:1 desktop card, so the camera
 *    constraints (cameraBounds.mjs) are the only thing deciding framing;
 *  - the full-bleed map runs under the top safe area, so everything
 *    floating over it clears that inset itself;
 *  - every control the screen had before is still rendered and reachable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const mapScreen = readFileSync(join(root, 'src/screens/MapScreen.tsx'), 'utf8');
const mapView = readFileSync(join(root, 'src/components/MapView.tsx'), 'utf8');

/** The declaration block of the FIRST rule whose selector text matches. */
function block(selector) {
  const idx = css.indexOf(`${selector} {`);
  assert.notEqual(idx, -1, `${selector} rule exists`);
  return css.slice(idx, css.indexOf('}', idx));
}

// ---- No scrolling on the Map destination -----------------------------------

test('the Map destination turns off <main> scrolling entirely', () => {
  const main = block('.app > main:has(.screen--map)');
  assert.match(main, /overflow: hidden/);
  // …while every other screen keeps the single scroll region.
  assert.match(block('.app > main'), /overflow-y: auto/);
});

test('the Map root fills <main> exactly and clips its own overflow', () => {
  const screen = block('.screen--map');
  assert.match(screen, /height: 100%/, 'fills the available height');
  assert.match(screen, /min-height: 0/, 'shrinks correctly inside the flex column');
  assert.match(screen, /padding: 0/, 'full-bleed: no screen gutters around the map');
  assert.match(screen, /display: flex/);
  assert.match(screen, /overflow: hidden/, 'the workspace itself never scrolls');
});

test('the whole workspace is the map, with the cockpit floating over it', () => {
  const layout = block('.map-layout');
  assert.match(layout, /flex: 1/);
  assert.match(layout, /min-height: 0/);
  assert.match(layout, /flex-direction: column/);

  const canvas = block('.map-canvas-wrap');
  assert.match(canvas, /position: relative/, 'positioning context for map overlays');
  assert.match(canvas, /flex: 1/, 'the map takes the whole workspace');
  assert.match(canvas, /min-height: 0/);

  // The cockpit bands are absolutely positioned over the map and let
  // pointer events through, so panning works between the controls.
  const bands = css.slice(
    css.indexOf('.map-cockpit-top,\n.map-cockpit-bottom {'),
    css.indexOf('}', css.indexOf('.map-cockpit-top,\n.map-cockpit-bottom {')),
  );
  assert.match(bands, /position: absolute/);
  assert.match(bands, /pointer-events: none/);
  assert.match(css, /\.map-cockpit-lead > \*,[\s\S]*?pointer-events: auto;/);
});

test('the map surface fills its slot instead of a fixed height or aspect', () => {
  const view = block('.mapview');
  assert.match(view, /height: 100%/);
  assert.match(view, /width: 100%/);
  assert.ok(!/clamp\(460px/.test(css), 'the width-relative height clamp is gone');
  assert.ok(
    !/\.mapview \{[^}]*aspect-ratio/.test(css) && !/mapview \{\n *aspect-ratio/.test(css),
    'no aspect-ratio on the map surface',
  );
});

test('the retired square-card sizing machinery is gone with it', () => {
  // The old desktop composition sized a 1:1 map card against a hand-measured
  // chrome budget (--map-edge + per-state lean tiers). A workspace that
  // fills <main> needs none of that arithmetic; leaving it behind would
  // silently fight the new layout.
  for (const dead of ['--map-edge', '--map-controls-v', '--map-banner-v', '--map-note-v']) {
    assert.ok(!css.includes(dead), `${dead} no longer exists`);
  }
  assert.ok(!/\.map-card\s*\{/.test(css), 'the paper map card is gone (the map is full-bleed)');
  assert.ok(!mapScreen.includes('map-card'), 'MapScreen no longer wraps the map in a card');
});

// ---- Persistent navigation --------------------------------------------------

test('both navigation instances still bracket <main> in the shell', () => {
  // Unchanged shell contract: rail before <main>, bottom bar after it, CSS
  // shows exactly one. The Map destination must not opt out of either.
  assert.match(app, /<TabBar active=\{nav\.tab\} onChange=\{navigate\} variant="rail" \/>/);
  assert.match(app, /<TabBar active=\{nav\.tab\} onChange=\{navigate\} variant="bar" \/>/);
  const railIdx = app.indexOf('variant="rail"');
  const mainIdx = app.indexOf('<main key={nav.tab}>');
  const barIdx = app.indexOf('variant="bar"');
  assert.ok(railIdx < mainIdx && mainIdx < barIdx, 'rail → main → bar order preserved');
});

test('nothing on the Map hides or repositions the primary navigation', () => {
  assert.ok(!mapScreen.includes('tabbar'), 'MapScreen never touches the navigation');
  // The ONLY display:none on the navigation instances is the adaptive swap
  // (compact hides the rail; ≥760×500 hides the bottom bar).
  const hides = css.match(/\.tabbar--(bar|rail) \{\s*\n\s*display: none;/g) ?? [];
  assert.equal(hides.length, 2, 'exactly the two adaptive-swap rules');
  // The bar stays an in-flow flex child with its own safe-area inset, so the
  // workspace above it is genuinely all the space there is.
  const bar = block('.tabbar');
  assert.match(bar, /flex: 0 0 auto/);
  assert.match(bar, /height: calc\(var\(--tabbar-h\) \+ var\(--safe-bottom\)\)/);
});

// ---- No browser fullscreen --------------------------------------------------

test('the native MapLibre fullscreen control is gone', () => {
  assert.ok(!mapView.includes('FullscreenControl'), 'no FullscreenControl added to the map');
  // The controls that remain are deliberate.
  assert.match(mapView, /new maplibregl\.NavigationControl\(\{ showCompass: false \}\)/);
  assert.match(mapView, /new maplibregl\.ScaleControl\(\{ unit: 'metric' \}\)/);
});

test('no source file uses the browser Fullscreen API', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|mjs|css)$/.test(entry)) {
        const text = readFileSync(p, 'utf8');
        if (/requestFullscreen|fullscreenEnabled|fullscreenElement|exitFullscreen|:fullscreen/.test(text)) {
          offenders.push(p.slice(root.length + 1));
        }
      }
    }
  };
  walk(join(root, 'src'));
  assert.deepEqual(offenders, [], 'the app never enters browser fullscreen');
});

// ---- Safe areas over a full-bleed map ---------------------------------------

test('everything floating over the map clears the top safe area', () => {
  // One band carries the inset for every control inside it.
  assert.match(block('.map-cockpit-top'), /padding: calc\(var\(--safe-top\) \+ 10px\) 10px 10px/);
  assert.match(
    css,
    /\.mapview \.maplibregl-ctrl-top-left,\n\.mapview \.maplibregl-ctrl-top-right \{\n  top: var\(--safe-top\);/,
    "MapLibre's own top control corners are inset too",
  );
  // …and the bottom corners clear the live-tracking pill when there is one
  // (--map-bottom-h is 0px whenever the map is idle).
  assert.match(
    css,
    /\.map-canvas-wrap \.maplibregl-ctrl-bottom-left,\n\.map-canvas-wrap \.maplibregl-ctrl-bottom-right \{\n  bottom: var\(--map-bottom-h, 0px\);/,
  );
});

// ---- Roomy landscape: the map stays dominant --------------------------------

test('roomy landscape keeps the map dominant — no panels around it', () => {
  // The Map's own roomy block (several screens share the media query).
  const anchor = css.indexOf('/* --- Roomy landscape Map (≥ 900×500)');
  assert.notEqual(anchor, -1, 'the roomy-landscape Map block exists');
  const idx = css.indexOf('@media (min-width: 900px) and (min-height: 500px)', anchor);
  const roomy = css.slice(idx, css.indexOf('\n}\n\n', idx));
  // The same cockpit, with more air — never a column layout that shrinks
  // the map back into a card.
  assert.ok(!/flex-direction: row/.test(roomy), 'the map is not put in a row with a panel');
  assert.match(roomy, /\.map-track \{/, 'the tracking pill just gets more air');
  assert.match(roomy, /\.map-cockpit-lead \{\n    max-width: min\(520px/);
  // Full-bleed beside the rail — never a centred column with page gutters.
  const wide = css.slice(css.indexOf('@media (min-width: 760px) and (min-height: 500px)'));
  const wideMap = wide.slice(wide.indexOf('.screen--map {'));
  assert.match(wideMap.slice(0, wideMap.indexOf('}')), /max-width: none/);
});

// ---- Nothing was lost on the way --------------------------------------------

test('every existing Map control is still rendered', () => {
  for (const [needle, what] of [
    ['<MapView', 'the map'],
    ['MapScopeControl', 'route/stage selection'],
    ['onStep={stepStage}', 'previous/next stage'],
    ['MapControlStack', 'layer, fit, locate and tracking controls'],
    ['geo.locate', 'one-shot locate'],
    ['startTracking', 'starting live tracking'],
    ['stopTracking', 'stopping live tracking'],
    ['resumeFollow', 'resuming a paused follow'],
    ['MapTrackingPill', 'live tracking status'],
    ['StopPreview', 'anchored stop preview'],
  ]) {
    assert.ok(mapScreen.includes(needle), `${what} stays on the Map screen`);
  }
  const stack = readFileSync(join(root, 'src/components/MapControlStack.tsx'), 'utf8');
  assert.match(stack, /aria-label="Choose map layer"/, 'terrain/satellite choice');
});

test('the header-less workspace keeps an accessible screen name', () => {
  // The visible ScreenHeader would eat the workspace; the heading remains.
  assert.ok(!mapScreen.includes('ScreenHeader'), 'no visible screen header on the Map');
  assert.match(mapScreen, /<h1 className="sr-only">Map<\/h1>/);
});
