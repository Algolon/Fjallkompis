/** The two supported walking directions over the canonical physical route. */
export type RouteDirection = 'abisko-to-nikkaluokta' | 'nikkaluokta-to-abisko';

export const DEFAULT_DIRECTION: 'abisko-to-nikkaluokta';
export const REVERSE_DIRECTION: 'nikkaluokta-to-abisko';
export const ROUTE_DIRECTIONS: readonly RouteDirection[];

export function isRouteDirection(value: unknown): value is RouteDirection;
export function normalizeDirection(value: unknown): RouteDirection;
export function oppositeDirection(value: RouteDirection | string): RouteDirection;
export function isReversed(value: RouteDirection | string): boolean;
