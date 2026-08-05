/**
 * Whether MapLibre's own zoom control belongs on the map right now.
 *
 * TWO gates, both necessary:
 *
 * 1. POINTER. Zoom buttons are for pointers: on touch the gesture is pinch,
 *    and permanent buttons would only compete with the cockpit controls for
 *    the map's edges. This gate has always been here.
 *
 * 2. MAP WIDTH. The control is anchored bottom-right, which is exactly where
 *    the full-route overview puts the route's eastern end — on Kungsleden,
 *    Nikkaluokta and its label. Once the overview composition became
 *    horizontally balanced (Map Refinement II PR 1) the eastern clearance
 *    narrowed from 70 px to 48 px, and on narrow fine-pointer layouts the
 *    label ends up underneath the buttons.
 *
 *    Measured collision sweep (fine pointer, marker glyph / label / route
 *    vertex intersecting the control group, widths 320–1280 × heights
 *    667/800/915/1000/1180):
 *
 *      map width  320 340 360 375 390 412 430 460 480 500 520 540 560 | 676+
 *      collides    y   y   y   y   y   y   y   y   y   y   y   y   y  |  no
 *
 *    Collisions depend on BOTH axes (at 560 px wide the overlap appears only
 *    at 915–1000 px tall), so the honest reading is: every container width the
 *    compact layout can produce collides at some height, and every width the
 *    rail layout produces is clean at every height tested.
 *
 *    Real containers are discrete: the compact layout caps the map at 560 px,
 *    and the navigation rail (viewport ≥ 760) starts it at 676 px. Nothing
 *    lands in between. The threshold therefore sits in that gap — 80 px above
 *    the widest colliding container and 36 px below the narrowest clean one —
 *    rather than on a CSS breakpoint, so it stays correct if the rail's own
 *    width is ever retuned.
 *
 * Hiding the control costs no capability: `map.scrollZoom` and `map.keyboard`
 * stay enabled (only ROTATION is disabled, for the north-up policy), so wheel,
 * trackpad, pinch and the keyboard +/− and =/- bindings all still zoom. It is
 * the redundant on-screen buttons that go, on the layouts where they would
 * cover the route.
 *
 * Pure ESM so tests/map-zoom-control.test.mjs can pin the policy in node.
 */

/**
 * Narrowest MAP CONTAINER width (CSS px) that may carry the zoom control.
 * See the sweep above; any value in (560, 676] is equivalent for today's
 * layouts.
 */
export const ZOOM_CONTROL_MIN_MAP_WIDTH = 640;

/**
 * @param {object} o
 * @param {number} o.mapWidth      map CONTAINER width in CSS px (not the window)
 * @param {boolean} o.finePointer  '(hover: hover) and (pointer: fine)'
 * @returns {boolean}
 */
export function shouldShowZoomControl({ mapWidth, finePointer }) {
  return Boolean(finePointer) && Number(mapWidth) >= ZOOM_CONTROL_MIN_MAP_WIDTH;
}
