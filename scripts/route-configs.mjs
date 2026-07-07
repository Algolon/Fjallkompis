/**
 * Route manifest: one entry per GPX route dataset processed by
 * scripts/generate-route-data.mjs. This is the single place that knows which
 * routes exist, where their GPX lives, what structure the GPX must have and
 * where the generated JSON / PMTiles archives go.
 *
 * The Kungsleden entry is the permanent, canonical route. Optional entries
 * (required: false) may be added for bounded tests; a missing optional GPX
 * yields an { available: false } stub instead of failing the build.
 */

export const KUNGSLEDEN_CONFIG = {
  id: 'kungsleden',
  gpxPath: 'public/gpx/kungsleden-abisko-nikkaluokta.gpx',
  outputPath: 'src/generated/kungsleden-route.json',
  pmtilesPath: 'public/maps/kungsleden.pmtiles',
  /** A missing GPX fails the build (this is the app's core dataset). */
  required: true,
  /** 1 overview segment + N stage segments. */
  expectedSegments: 8,
  expectedWaypoints: 8,
  /** Stage → [fromWaypointId, toWaypointId], in route order. */
  stageWaypoints: [
    ['START_ABISKO', 'HUT_ABISKOJAURE'],
    ['HUT_ABISKOJAURE', 'HUT_ALESJAURE'],
    ['HUT_ALESJAURE', 'HUT_TJAKTJA'],
    ['HUT_TJAKTJA', 'HUT_SALKA'],
    ['HUT_SALKA', 'HUT_SINGI'],
    ['HUT_SINGI', 'HUT_KEBNEKAISE'],
    ['HUT_KEBNEKAISE', 'END_NIKKALUOKTA'],
  ],
  /** Stage ids become `${stageIdPrefix}${n}` (d1..d7 match persisted state). */
  stageIdPrefix: 'd',
  /** Mountain route: a GPX without elevation data is a hard error. */
  requireElevation: true,
  /** Padding around the route bounds for the basemap cutout. */
  mapBufferKm: 9,
  /** Display-name overrides for waypoint ids whose GPX names are too formal. */
  nameOverrides: { START_ABISKO: 'Abisko' },
};


export const ROUTE_CONFIGS = [KUNGSLEDEN_CONFIG];

export const ROUTE_CONFIG_BY_ID = Object.fromEntries(
  ROUTE_CONFIGS.map((c) => [c.id, c]),
);
