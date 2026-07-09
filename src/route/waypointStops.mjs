/**
 * GPX waypoint machine ids ↔ the app's existing hut/stop ids.
 *
 * Personal hut notes and shop overrides are keyed by hut id in localStorage,
 * so this mapping is what keeps them intact across route-data regenerations.
 * It is also what makes every map marker meaningful: each rendered waypoint
 * resolves to a real Huts & Stations stop, so the Map's anchored stop
 * preview can always offer "open details".
 *
 * Plain .mjs so node --test can validate the mapping against the generated
 * route dataset without a TypeScript toolchain (same pattern as
 * routes.mjs / routeProgress.mjs). Re-exported by src/route/routeData.ts.
 */

export const WAYPOINT_TO_HUT = {
  START_ABISKO: 'abisko',
  HUT_ABISKOJAURE: 'abiskojaure',
  HUT_ALESJAURE: 'alesjaure',
  HUT_TJAKTJA: 'tjaktja',
  HUT_SALKA: 'salka',
  HUT_SINGI: 'singi',
  HUT_KEBNEKAISE: 'kebnekaise',
  END_NIKKALUOKTA: 'nikkaluokta',
};

export const HUT_TO_WAYPOINT = Object.fromEntries(
  Object.entries(WAYPOINT_TO_HUT).map(([w, h]) => [h, w]),
);

/** The stop id a waypoint resolves to, or null for an unmapped waypoint. */
export function stopIdForWaypoint(waypointId) {
  return WAYPOINT_TO_HUT[waypointId] ?? null;
}
