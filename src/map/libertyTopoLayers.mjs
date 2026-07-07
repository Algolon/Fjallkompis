/**
 * Liberty Topo — adapted to the Fjällkompis offline Protomaps basemap.
 *
 * PROTOTYPE for the three-way map-style comparison (see
 * docs/map-style-comparison.md). Reference style: "Liberty Topo" from the
 * official gpx.studio styles repository
 * (https://github.com/gpxstudio/styles, liberty-topo.json), which is itself
 * derived from OpenFreeMap's Liberty style (MIT, © 2023 Zsolt Ero) and
 * osm-liberty / OSM Bright (code BSD-3-Clause, design CC BY 4.0). Only the
 * style is reused — never gpx.studio's hosted tiles, fonts or sprites.
 *
 * Liberty Topo targets the OpenMapTiles schema plus gpx.studio-hosted
 * hillshading/contour sources. Fjällkompis ships a single bounded Protomaps
 * (tileset v4) PMTiles archive and deliberately has no glyphs or sprites, so
 * this module TRANSLATES the Liberty layers onto the Protomaps source-layers
 * (earth / landcover / landuse / water / roads / buildings / boundaries) and
 * omits what has no offline data. Every layer below is commented with its
 * Liberty origin; the full mapping table (direct / adapted / substituted /
 * omitted) lives in docs/map-style-comparison.md.
 *
 * The builder is palette-driven: LIBERTY_TOPO_PALETTE keeps Liberty Topo's
 * original colours verbatim, NORDIC_TOPO_PALETTE restyles the identical
 * layer structure with the Fjällkompis Nordic Trail design language. Layer
 * order, filters, zoom thresholds and widths are shared between the two so
 * the comparison isolates colour/tone decisions, not data or hierarchy.
 */

/**
 * Colour/opacity tokens consumed by libertyTopoLayers(). A slot set to null
 * skips its layer entirely (used where Liberty has no equivalent styling and
 * faking one would break fidelity).
 */

/** Liberty Topo's own colours, copied verbatim from liberty-topo.json. */
export const LIBERTY_TOPO_PALETTE = {
  id: 'liberty',
  background: '#f8f4f0', // Liberty `background`
  park: 'rgba(216, 232, 200, 0.7)', // `park` #d8e8c8 @ 0.7
  parkOutline: 'rgba(228, 241, 215, 1)', // `park_outline`
  wood: 'rgba(172, 224, 139, 0.28)', // `landcover_wood` hsla(98,61%,72%,0.7) × 0.4
  grass: 'rgba(176, 213, 154, 0.3)', // `landcover_grass` @ 0.3
  // Liberty renders OMT scrub via the grass class; same colour keeps parity.
  scrub: 'rgba(176, 213, 154, 0.3)',
  // SUBSTITUTION: Liberty wetland is a sprite pattern (wetland_bg_11); no
  // sprites offline, so a flat tint approximating the pattern's tone is used.
  wetland: 'rgba(213, 229, 224, 0.8)',
  ice: 'rgba(224, 236, 236, 0.8)', // `landcover_ice`
  sand: 'rgba(247, 239, 195, 1)', // `landcover_sand`
  rock: null, // Liberty leaves bare rock unstyled — keep that.
  cliff: null, // OpenMapTiles has no cliff lines; Liberty styles none.
  residentialLowZoom: 'hsla(0, 3%, 85%, 0.84)', // `landuse_residential` z9
  residentialHighZoom: 'hsla(35, 57%, 88%, 0.49)', // `landuse_residential` z12
  water: 'rgb(158, 189, 255)', // `water`
  waterway: '#a0c8f0', // `waterway_river` / `waterway_other`
  trailCasing: 'hsl(40, 70%, 60%)', // `road_path_pedestrian_trail_casing`
  trail: 'hsl(0, 0%, 100%)', // `road_path_pedestrian_trail` (dashed)
  trackCasing: '#cfcdca', // `road_service_track_casing`
  track: '#fff', // `road_service_track`
  minorCasing: '#cfcdca', // `road_minor_casing`
  minor: '#fff', // `road_minor`
  majorCasing: '#e9ac77', // `road_secondary_tertiary/trunk_primary_casing`
  major: '#fea', // `road_secondary_tertiary` / `road_trunk_primary`
  rail: '#bbb', // `road_major_rail`
  building: 'hsl(35, 8%, 85%)', // `building`
  buildingOutline: 'hsl(35, 6%, 79%)', // `building` fill-outline-color z14
  boundaryCountry: 'hsl(248, 1%, 41%)', // `boundary_2`
  boundaryMinor: 'hsl(0, 0%, 70%)', // `boundary_3` (dashed)
};

/**
 * Nordic Trail restyle of the same Liberty structure: calm desaturated
 * Scandinavian tones from the app palette (src/styles/global.css — spruce,
 * glacier, cloudberry, stone), tuned for outdoor daylight readability. The
 * route overlay (saturated Okabe–Ito lines) must stay the strongest
 * foreground element, so every base tone here is kept muted.
 */
export const NORDIC_TOPO_PALETTE = {
  id: 'liberty-nordic',
  background: '#e9ede5', // stone/paper family
  park: 'rgba(122, 151, 118, 0.10)', // barely-there protected-area tint
  parkOutline: 'rgba(95, 130, 98, 0.35)',
  wood: 'rgba(139, 168, 130, 0.40)', // muted spruce green
  grass: 'rgba(171, 192, 152, 0.32)',
  scrub: 'rgba(157, 182, 138, 0.30)', // fjällbjörk scrub, distinct from grass
  wetland: 'rgba(148, 180, 173, 0.34)', // cool bog tint
  ice: 'rgba(238, 244, 246, 0.92)',
  sand: 'rgba(228, 221, 198, 1)',
  rock: 'rgba(163, 167, 160, 0.28)', // bare rock readable but calm
  cliff: 'rgba(122, 130, 124, 0.7)',
  residentialLowZoom: 'rgba(205, 207, 199, 0.55)',
  residentialHighZoom: 'rgba(205, 207, 199, 0.45)',
  water: '#a3c3cc', // glacial teal — clear contrast, restrained saturation
  waterway: '#7fa9b4',
  trailCasing: '#a5794b', // cloudberry-deep so paths read in daylight
  trail: '#f5f1e8',
  trackCasing: '#b3a98f',
  track: '#f5f1e8',
  minorCasing: '#b6bbae',
  minor: '#f7f5ef',
  majorCasing: '#a98d5f',
  major: '#efe3c6',
  rail: '#9aa39c',
  building: '#cfd2c6',
  buildingOutline: '#b6baab',
  boundaryCountry: '#6d746f',
  boundaryMinor: '#9aa39c',
};

/** Source-layers of the Protomaps tileset the builder is allowed to touch. */
export const PROTOMAPS_SOURCE_LAYERS = [
  'earth',
  'landcover',
  'landuse',
  'water',
  'roads',
  'buildings',
  'boundaries',
];

/**
 * Build the adapted Liberty Topo basemap layers against the Fjällkompis
 * Protomaps vector source. Returns MapLibre layer specs, bottom-to-top,
 * every id prefixed `lt_` so they can never collide with the production
 * (`@protomaps/basemaps`) layer ids.
 *
 * Omitted from Liberty Topo (no offline data / no glyphs / no sprites —
 * recorded in docs/map-style-comparison.md): hillshading, contour lines,
 * every symbol layer (place/POI/peak/road labels, shields, oneway arrows),
 * pattern fills, 3-D buildings, and the separate tunnel/bridge road variants
 * (bridges render like surface roads; the area has no styled tunnels).
 */
export function libertyTopoLayers(sourceId, palette) {
  const p = palette;
  /** @type {any[]} */
  const layers = [];
  const add = (layer) => {
    if (layer) layers.push({ source: sourceId, ...layer });
  };

  // -- Land ----------------------------------------------------------------
  // Liberty `background`; Protomaps also needs the `earth` land polygon.
  layers.push({ id: 'lt_background', type: 'background', paint: { 'background-color': p.background } });
  add({
    id: 'lt_earth',
    type: 'fill',
    'source-layer': 'earth',
    filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': p.background },
  });

  // Low-zoom landcover (Protomaps-only layer, z≲7): keeps the zoomed-out
  // route overview from rendering as blank paper. Colours reuse the palette
  // slots of the corresponding high-zoom landuse layers.
  add({
    id: 'lt_landcover',
    type: 'fill',
    'source-layer': 'landcover',
    paint: {
      'fill-color': [
        'match',
        ['get', 'kind'],
        'glacier', p.ice,
        'forest', p.wood,
        'scrub', p.scrub,
        'grassland', p.grass,
        'barren', p.sand,
        p.background,
      ],
    },
  });

  // Liberty `park` + `park_outline` (OMT park layer → Protomaps landuse kinds).
  add({
    id: 'lt_park',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'national_park', 'nature_reserve', 'park', 'protected_area'],
    paint: { 'fill-color': p.park },
  });
  add({
    id: 'lt_park_outline',
    type: 'line',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'national_park', 'nature_reserve', 'park', 'protected_area'],
    paint: { 'line-color': p.parkOutline, 'line-dasharray': [1, 1.5] },
  });

  // Liberty `landuse_residential` (colour ramp z9→z12, hidden above z12).
  add({
    id: 'lt_residential',
    type: 'fill',
    'source-layer': 'landuse',
    maxzoom: 12,
    filter: ['in', 'kind', 'residential'],
    paint: {
      'fill-color': [
        'interpolate', ['linear'], ['zoom'],
        9, p.residentialLowZoom,
        12, p.residentialHighZoom,
      ],
    },
  });

  // Liberty `landcover_wood` (OMT class wood → Protomaps kinds wood/forest).
  add({
    id: 'lt_wood',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'wood', 'forest'],
    paint: { 'fill-color': p.wood, 'fill-antialias': false },
  });
  // Liberty `landcover_grass`; OMT folds scrub into grass — kept as its own
  // layer here so the Nordic palette can distinguish fjällbjörk scrub.
  add({
    id: 'lt_grass',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'grass', 'grassland', 'meadow', 'village_green'],
    paint: { 'fill-color': p.grass, 'fill-antialias': false },
  });
  add({
    id: 'lt_scrub',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'scrub'],
    paint: { 'fill-color': p.scrub, 'fill-antialias': false },
  });
  // Liberty `landcover_sand`.
  add({
    id: 'lt_sand',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'sand', 'beach'],
    paint: { 'fill-color': p.sand, 'fill-antialias': false },
  });
  // Fjällkompis extra (palette-gated): bare rock — Liberty leaves it
  // unstyled, so LIBERTY_TOPO_PALETTE sets it to null and skips the layer.
  if (p.rock) {
    add({
      id: 'lt_rock',
      type: 'fill',
      'source-layer': 'landuse',
      filter: ['in', 'kind', 'bare_rock', 'scree'],
      paint: { 'fill-color': p.rock, 'fill-antialias': false },
    });
  }
  // Liberty `landcover_wetland` — pattern fill substituted by a flat tint.
  add({
    id: 'lt_wetland',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'wetland', 'bog', 'marsh', 'swamp'],
    paint: { 'fill-color': p.wetland, 'fill-antialias': false },
  });
  // Liberty `landcover_ice` (glaciers — Kebnekaise massif).
  add({
    id: 'lt_ice',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'glacier'],
    paint: { 'fill-color': p.ice, 'fill-antialias': false },
  });
  // Fjällkompis extra (palette-gated): cliff lines from the Protomaps earth
  // layer. No OpenMapTiles equivalent → null (skipped) in the Liberty palette.
  if (p.cliff) {
    add({
      id: 'lt_cliff',
      type: 'line',
      'source-layer': 'earth',
      minzoom: 12,
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'kind', 'cliff']],
      paint: { 'line-color': p.cliff, 'line-width': 0.8 },
    });
  }

  // -- Water ---------------------------------------------------------------
  // Liberty `waterway_other` (streams) and `waterway_river`; Protomaps keeps
  // waterway lines in the water source-layer with line kinds stream/river.
  add({
    id: 'lt_waterway_stream',
    type: 'line',
    'source-layer': 'water',
    filter: ['in', 'kind', 'stream'],
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': p.waterway,
      'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 13, 0.5, 20, 6],
    },
  });
  add({
    id: 'lt_waterway_river',
    type: 'line',
    'source-layer': 'water',
    filter: ['in', 'kind', 'river'],
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': p.waterway,
      'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 11, 0.5, 20, 6],
    },
  });
  // Liberty `water`.
  add({
    id: 'lt_water',
    type: 'fill',
    'source-layer': 'water',
    filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': p.water },
  });

  // -- Roads (Liberty widths; tunnel/bridge variants intentionally folded
  //    into the surface layers — see module docs) ---------------------------
  const roadWidth = (stops) => ['interpolate', ['exponential', 1.2], ['zoom'], ...stops];

  // Liberty `road_minor_casing` / `road_service_track_casing`.
  add({
    id: 'lt_road_minor_casing',
    type: 'line',
    'source-layer': 'roads',
    filter: ['all', ['==', 'kind', 'minor_road'], ['!=', 'kind_detail', 'service']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': p.minorCasing,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 12.5, 1],
      'line-width': roadWidth([12, 0.5, 13, 1, 14, 4, 20, 20]),
    },
  });
  add({
    id: 'lt_road_track_casing',
    type: 'line',
    'source-layer': 'roads',
    minzoom: 12,
    filter: [
      'any',
      ['all', ['==', 'kind', 'path'], ['==', 'kind_detail', 'track']],
      ['all', ['==', 'kind', 'minor_road'], ['==', 'kind_detail', 'service']],
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': p.trackCasing, 'line-width': roadWidth([12, 1, 15, 3, 20, 9]) },
  });
  // Liberty `road_secondary_tertiary_casing` + `road_trunk_primary_casing`.
  add({
    id: 'lt_road_secondary_tertiary_casing',
    type: 'line',
    'source-layer': 'roads',
    filter: ['all', ['==', 'kind', 'major_road'], ['in', 'kind_detail', 'secondary', 'tertiary']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': p.majorCasing, 'line-width': roadWidth([8, 1.5, 20, 17]) },
  });
  add({
    id: 'lt_road_trunk_primary_casing',
    type: 'line',
    'source-layer': 'roads',
    // kind 'highway' (motorway) folded in: none exist in the route corridor.
    filter: [
      'any',
      ['all', ['==', 'kind', 'major_road'], ['in', 'kind_detail', 'trunk', 'primary']],
      ['==', 'kind', 'highway'],
    ],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': p.majorCasing, 'line-width': roadWidth([5, 0.4, 6, 0.7, 7, 1.75, 20, 22]) },
  });

  // Liberty `road_path_pedestrian_trail_casing` + `_trail`: unpaved paths.
  // Protomaps has no surface attribute, so ALL paths (except track/pier)
  // take the trail treatment — correct for this fjäll corridor.
  const trailFilter = ['all', ['==', 'kind', 'path'], ['!in', 'kind_detail', 'track', 'pier']];
  add({
    id: 'lt_trail_casing',
    type: 'line',
    'source-layer': 'roads',
    minzoom: 13,
    filter: trailFilter,
    layout: { 'line-join': 'round' },
    paint: { 'line-color': p.trailCasing, 'line-width': roadWidth([13, 1.6, 15, 4]) },
  });
  add({
    id: 'lt_trail',
    type: 'line',
    'source-layer': 'roads',
    minzoom: 13,
    filter: trailFilter,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': p.trail,
      'line-dasharray': [2.5, 1],
      'line-width': roadWidth([13, 0.8, 15, 2]),
    },
  });

  // Liberty `road_service_track` / `road_minor` / majors — the fills.
  add({
    id: 'lt_road_track',
    type: 'line',
    'source-layer': 'roads',
    minzoom: 12,
    filter: [
      'any',
      ['all', ['==', 'kind', 'path'], ['==', 'kind_detail', 'track']],
      ['all', ['==', 'kind', 'minor_road'], ['==', 'kind_detail', 'service']],
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': p.track, 'line-width': roadWidth([12, 0.5, 15, 2, 20, 7.5]) },
  });
  add({
    id: 'lt_road_minor',
    type: 'line',
    'source-layer': 'roads',
    filter: ['all', ['==', 'kind', 'minor_road'], ['!=', 'kind_detail', 'service']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': p.minor, 'line-width': roadWidth([13.5, 0, 14, 2.5, 20, 18]) },
  });
  add({
    id: 'lt_road_secondary_tertiary',
    type: 'line',
    'source-layer': 'roads',
    filter: ['all', ['==', 'kind', 'major_road'], ['in', 'kind_detail', 'secondary', 'tertiary']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': p.major, 'line-width': roadWidth([6.5, 0, 8, 0.5, 20, 13]) },
  });
  add({
    id: 'lt_road_trunk_primary',
    type: 'line',
    'source-layer': 'roads',
    filter: [
      'any',
      ['all', ['==', 'kind', 'major_road'], ['in', 'kind_detail', 'trunk', 'primary']],
      ['==', 'kind', 'highway'],
    ],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': p.major, 'line-width': roadWidth([5, 0, 7, 1, 20, 18]) },
  });

  // Liberty `road_major_rail` + `_hatching` (Malmbanan at Abisko).
  add({
    id: 'lt_rail',
    type: 'line',
    'source-layer': 'roads',
    filter: ['==', 'kind', 'rail'],
    paint: {
      'line-color': p.rail,
      'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 14, 0.4, 15, 0.75, 20, 2],
    },
  });
  add({
    id: 'lt_rail_hatching',
    type: 'line',
    'source-layer': 'roads',
    filter: ['==', 'kind', 'rail'],
    paint: {
      'line-color': p.rail,
      'line-dasharray': [0.2, 8],
      'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 14.5, 0, 15, 3, 20, 8],
    },
  });

  // -- Buildings & boundaries ------------------------------------------------
  // Liberty `building` (the 3-D `building-3d` variant is omitted).
  add({
    id: 'lt_building',
    type: 'fill',
    'source-layer': 'buildings',
    minzoom: 13,
    paint: { 'fill-color': p.building, 'fill-outline-color': p.buildingOutline },
  });
  // Liberty `boundary_3` (admin 3–6, dashed) — Protomaps kind_detail > 2.
  add({
    id: 'lt_boundary_minor',
    type: 'line',
    'source-layer': 'boundaries',
    filter: ['>', 'kind_detail', 2],
    paint: {
      'line-color': p.boundaryMinor,
      'line-dasharray': [1, 1],
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1, 11, 2],
    },
  });
  // Liberty `boundary_2` (national border — Norway is close to the route).
  add({
    id: 'lt_boundary_country',
    type: 'line',
    'source-layer': 'boundaries',
    filter: ['==', 'kind_detail', 2],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': p.boundaryCountry,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 1],
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 5, 1.2, 12, 3],
    },
  });

  return layers;
}
