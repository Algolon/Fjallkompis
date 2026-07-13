/**
 * Route direction: the two supported walking directions over the SAME physical
 * Kungsleden route (same geometry, same seven physical segments, same eight
 * stops). Direction is an explicit, persisted user choice (Settings) — it is
 * never inferred from GPS.
 *
 *  - 'abisko-to-nikkaluokta' — the canonical / default direction (north → south);
 *  - 'nikkaluokta-to-abisko' — the reverse direction (south → north).
 *
 * Plain .mjs (with a sibling .d.mts declaration) so node --test and the
 * persistence layer (src/utils/stateMigration.mjs) can import the validator
 * without a TypeScript toolchain — the same pattern as routeProgress.mjs /
 * stateMigration.mjs. The app imports it through Vite unchanged.
 *
 * See docs/decisions/0003-route-direction.md for the architecture: the
 * canonical GPX-derived route stays authoritative; one pure transformation
 * (src/route/itinerary.mjs) derives the active directional itinerary.
 */

/** The canonical / default direction — what every existing user migrates to. */
export const DEFAULT_DIRECTION = 'abisko-to-nikkaluokta';

/** The reverse direction. */
export const REVERSE_DIRECTION = 'nikkaluokta-to-abisko';

/** Both supported directions, canonical first. */
export const ROUTE_DIRECTIONS = [DEFAULT_DIRECTION, REVERSE_DIRECTION];

const DIRECTION_SET = new Set(ROUTE_DIRECTIONS);

/** True for a recognised RouteDirection string. */
export function isRouteDirection(value) {
  return typeof value === 'string' && DIRECTION_SET.has(value);
}

/**
 * Normalise an unknown value to a valid RouteDirection. Unknown / missing /
 * malformed values fall back to the canonical default, so an older persisted
 * blob (no direction field) or a corrupt import can never produce an invalid
 * direction — it simply loads as Abisko → Nikkaluokta.
 */
export function normalizeDirection(value) {
  return isRouteDirection(value) ? value : DEFAULT_DIRECTION;
}

/** The opposite of a direction (normalising the input first). */
export function oppositeDirection(value) {
  return normalizeDirection(value) === DEFAULT_DIRECTION
    ? REVERSE_DIRECTION
    : DEFAULT_DIRECTION;
}

/** True when this direction reverses the canonical north-to-south geometry. */
export function isReversed(value) {
  return normalizeDirection(value) === REVERSE_DIRECTION;
}
