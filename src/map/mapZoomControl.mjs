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
 *    The threshold is therefore the SMALLEST PROVEN-CLEAN width, 676 px — not
 *    a rounder number inside the 561–675 px gap, which no layout produces and
 *    which was never measured. Real containers are discrete: the compact
 *    layout caps the map at 560 px and the navigation rail (viewport ≥ 760)
 *    starts it at 676 px, so nothing lands in that gap today and picking a
 *    value inside it would only look safer than the evidence supports.
 *
 *    If a future layout ever produces a container between 561 and 675 px, the
 *    sweep has to be extended before this number is lowered.
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
 * Narrowest MAP CONTAINER width (CSS px) that may carry the zoom control:
 * the smallest width the sweep above proved clean at every tested height.
 */
export const ZOOM_CONTROL_MIN_MAP_WIDTH = 676;

/**
 * @param {object} o
 * @param {number} o.mapWidth      map CONTAINER width in CSS px (not the window)
 * @param {boolean} o.finePointer  '(hover: hover) and (pointer: fine)'
 * @returns {boolean}
 */
export function shouldShowZoomControl({ mapWidth, finePointer }) {
  return Boolean(finePointer) && Number(mapWidth) >= ZOOM_CONTROL_MIN_MAP_WIDTH;
}
