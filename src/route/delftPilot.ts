/**
 * TEMPORARY Delft pilot route dataset — a bounded field test of the Map tab
 * (GPS projection, live tracking, offline basemap) on a short walking route
 * in Delft, because the Kungsleden cannot be field-tested from home. See
 * docs/delft-pilot-test.md for the test protocol and removal instructions.
 *
 * Isolation rules:
 *  - only visible when the VITE_ENABLE_DELFT_PILOT build flag is 'true';
 *  - never the default: MapScreen always starts on Kungsleden;
 *  - no pilot state is persisted — route selection, tracking session and the
 *    GPS log are all session-only React state;
 *  - the pilot map archive lives in its own Cache Storage cache
 *    (see DELFT_ARCHIVE in src/map/offlineMap.ts);
 *  - stage ids are p1… and waypoint ids START_DELFT/END_DELFT — disjoint from
 *    every persisted Kungsleden identifier.
 *
 * DELFT_ROUTE is null until public/gpx/delft-pilot.gpx exists and
 * `npm run generate:route` has produced real data (the generator writes an
 * { available: false } stub until then); the pilot UI explains what is
 * missing instead of rendering a route.
 */
import generated from '../generated/delft-pilot-route.json';
import {
  hydrateRoute,
  isMissingRouteStub,
  type GeneratedRoute,
} from './hydrate';
import type { ParsedRoute } from './types';

/** Build-time feature flag; when false the pilot UI is completely hidden. */
export const DELFT_PILOT_ENABLED =
  import.meta.env.VITE_ENABLE_DELFT_PILOT === 'true';

const raw: unknown = generated;

export const DELFT_ROUTE: ParsedRoute | null = isMissingRouteStub(raw)
  ? null
  : hydrateRoute(raw as GeneratedRoute);

/** The single pilot stage (the projection target), when data exists. */
export const DELFT_STAGE = DELFT_ROUTE?.stages[0] ?? null;
