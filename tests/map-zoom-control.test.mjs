/**
 * MapLibre's bottom-right zoom control — when it may appear.
 *
 * Two gates: a fine pointer (touch gets pinch, not buttons) AND a map
 * container wide enough that the buttons do not cover the route's eastern end.
 * The second gate exists because the balanced full-route overview narrowed the
 * eastern clearance from 70 px to 48 px, which put Nikkaluokta's label under
 * the control on narrow fine-pointer layouts.
 *
 * The measured sweep behind ZOOM_CONTROL_MIN_MAP_WIDTH is in
 * src/map/mapZoomControl.mjs and
 * docs/pr-evidence/2026-08-map-refinement-ii/pr1-framing/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ZOOM_CONTROL_MIN_MAP_WIDTH,
  shouldShowZoomControl,
} from '../src/map/mapZoomControl.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const mapView = read('src/components/MapView.tsx');

// From the measured sweep (widths 320–1280 × heights 667/800/915/1000/1180):
// the widest container observed to collide, and the smallest observed clean at
// EVERY tested height. Real containers never land in the 561–675 gap — the
// compact layout caps the map at 560 and the rail starts it at 676 — and that
// gap was never measured, so the threshold must not sit inside it.
const WIDEST_COLLIDING = 560;
const SMALLEST_PROVEN_CLEAN = 676;

// ---- The policy --------------------------------------------------------------

test('narrow fine-pointer layouts get no zoom control', () => {
  // Includes the whole unmeasured 561–675 gap: the threshold must never be
  // below a width the sweep actually proved clean.
  for (const mapWidth of [320, 360, 375, 412, 430, 500, 560, 600, 640, 675]) {
    assert.equal(
      shouldShowZoomControl({ mapWidth, finePointer: true }),
      false,
      `${mapWidth}px container is narrow enough for the control to cover the route`,
    );
  }
});

test('normal desktop fine pointers keep the zoom control', () => {
  for (const mapWidth of [676, 716, 776, 876, 940, 1036, 1132, 2412]) {
    assert.equal(
      shouldShowZoomControl({ mapWidth, finePointer: true }),
      true,
      `${mapWidth}px container is wide enough`,
    );
  }
});

test('touch never gets the zoom control, however wide the map', () => {
  for (const mapWidth of [320, 375, 676, 1132, 2412]) {
    assert.equal(shouldShowZoomControl({ mapWidth, finePointer: false }), false);
  }
});

test('the threshold is the smallest PROVEN-clean width, not a guess', () => {
  assert.ok(
    ZOOM_CONTROL_MIN_MAP_WIDTH > WIDEST_COLLIDING,
    'above every container width measured to collide',
  );
  // The strict half: never below a width the sweep actually cleared. A lower
  // value would be asserting safety for the unmeasured 561–675 band.
  assert.equal(
    ZOOM_CONTROL_MIN_MAP_WIDTH,
    SMALLEST_PROVEN_CLEAN,
    'the threshold must equal the smallest width measured clean at every tested height',
  );
});

test('the gate is exact at its own boundary', () => {
  const w = ZOOM_CONTROL_MIN_MAP_WIDTH;
  assert.equal(shouldShowZoomControl({ mapWidth: w - 1, finePointer: true }), false);
  assert.equal(shouldShowZoomControl({ mapWidth: w, finePointer: true }), true);
});

test('a degenerate container during layout shows nothing', () => {
  for (const mapWidth of [0, -1, NaN, undefined]) {
    assert.equal(shouldShowZoomControl({ mapWidth, finePointer: true }), false);
  }
});

// ---- How MapView applies it --------------------------------------------------

test('MapView gates on the CONTAINER width and re-syncs on resize', () => {
  assert.match(mapView, /import \{ shouldShowZoomControl \} from '\.\.\/map\/mapZoomControl\.mjs'/);
  // The container, never the window: a rail or a split view changes the map's
  // width without changing innerWidth.
  assert.match(mapView, /mapWidth: containerRef\.current\?\.clientWidth \?\? 0/);
  assert.match(mapView, /finePointer:\s*\n?\s*window\.matchMedia\?\.\('\(hover: hover\) and \(pointer: fine\)'\)\.matches \?\? false/);
  // Added AND removed, so crossing the threshold in either direction works.
  assert.match(mapView, /map\.addControl\(zoomControlRef\.current, 'bottom-right'\)/);
  assert.match(mapView, /map\.removeControl\(zoomControlRef\.current\)/);
  assert.match(mapView, /map\.on\('resize', syncZoomControl\)/);
  assert.match(mapView, /syncZoomControl\(\);/, 'and evaluated once at construction');
});

test('hiding the buttons never disables zooming itself', () => {
  // Only ROTATION is disabled (north-up policy). Wheel/trackpad/pinch and the
  // keyboard bindings must stay, or removing the buttons would remove a
  // capability rather than a redundancy.
  assert.match(mapView, /map\.touchZoomRotate\.disableRotation\(\)/);
  assert.match(mapView, /map\.keyboard\.disableRotation\(\)/);
  for (const forbidden of [
    /scrollZoom\.disable\(/,
    /keyboard\.disable\(\)/,
    /touchZoomRotate\.disable\(\)/,
    /doubleClickZoom\.disable\(/,
  ]) {
    assert.ok(!forbidden.test(mapView), `zoom capability left enabled: ${forbidden}`);
  }
});

test('the control is still never a compass, and never fullscreen', () => {
  assert.match(mapView, /new maplibregl\.NavigationControl\(\{ showCompass: false \}\)/);
  assert.ok(!/FullscreenControl/.test(mapView));
});
