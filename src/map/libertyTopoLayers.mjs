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
 * original colours and thresholds verbatim (the stable reference),
 * NORDIC_TOPO_PALETTE restyles the shared layer structure with the
 * Fjällkompis Nordic Trail design language. Since the Nordic terrain
 * hierarchy restyle (benchmark Phase 1, docs/maps/
 * thunderforest-outdoors-benchmark.md §7), Nordic deliberately diverges from
 * Liberty in a small, documented set of ways — palette-gated extra layers
 * (rock, cliff, glacier outline, river polygons) and one structural value
 * (trails start at z12 instead of z13). Every divergence is fenced by an
 * explicit exception in tests/map-styles.test.mjs; everything else (layer
 * order, filters, zoom thresholds) stays shared so the styles remain
 * comparable.
 */

/**
 * Paint tokens consumed by libertyTopoLayers(). A slot set to null skips its
 * layer entirely (used where Liberty has no equivalent styling and faking one
 * would break fidelity). Most slots are colours; a few are complete MapLibre
 * paint expressions (opacity/width ramps) or structural values (zoom
 * thresholds), so the Nordic terrain hierarchy — benchmark Phase 1,
 * docs/maps/thunderforest-outdoors-benchmark.md §7 — stays palette-driven
 * while the Liberty reference keeps its verbatim behaviour. Every structural
 * divergence (extra layers, differing zoom thresholds) is mirrored by a
 * documented exception in tests/map-styles.test.mjs.
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
  wetlandOpacity: 1, // Liberty: constant tint (alpha lives in the colour)
  ice: 'rgba(224, 236, 236, 0.8)', // `landcover_ice`
  iceOutline: null, // Liberty draws no glacier outline — keep that.
  sand: 'rgba(247, 239, 195, 1)', // `landcover_sand`
  // Low-zoom `landcover` barren tone; Liberty has no barren class, the
  // adaptation reuses its sand colour (pre-restyle behaviour, kept verbatim).
  barren: 'rgba(247, 239, 195, 1)',
  rock: null, // Liberty leaves bare rock unstyled — keep that.
  rockOpacity: 1,
  cliff: null, // OpenMapTiles has no cliff lines; Liberty styles none.
  // Liberty Topo's defining relief layers (hillshading + contours) target
  // gpx.studio-hosted sources; these slots are the offline SUBSTITUTION on
  // the Fjällkompis terrain archives — tones chosen to sit quietly under
  // Liberty's brighter palette, not copies of gpx.studio values.
  hillshadeShadow: 'rgba(92, 82, 70, 0.22)',
  hillshadeHighlight: 'rgba(255, 255, 255, 0.20)',
  hillshadeExaggeration: 0.35,
  contour: 'rgba(160, 140, 110, 0.4)',
  contourIndex: 'rgba(160, 140, 110, 0.6)',
  residentialLowZoom: 'hsla(0, 3%, 85%, 0.84)', // `landuse_residential` z9
  residentialHighZoom: 'hsla(35, 57%, 88%, 0.49)', // `landuse_residential` z12
  water: 'rgb(158, 189, 255)', // `water`
  waterRiver: null, // Liberty: one colour for all water polygons — keep that.
  waterway: '#a0c8f0', // `waterway_river` / `waterway_other`
  // Waterway line ramps, verbatim from the pre-restyle adaptation.
  riverLineWidth: ['interpolate', ['exponential', 1.2], ['zoom'], 11, 0.5, 20, 6],
  riverLineOpacity: 1,
  streamLineWidth: ['interpolate', ['exponential', 1.3], ['zoom'], 13, 0.5, 20, 6],
  streamLineOpacity: 1,
  trailCasing: 'hsl(40, 70%, 60%)', // `road_path_pedestrian_trail_casing`
  trail: 'hsl(0, 0%, 100%)', // `road_path_pedestrian_trail` (dashed)
  trailMinzoom: 13, // Liberty `road_path_pedestrian_trail` minzoom
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
 *
 * Terrain hierarchy (benchmark §6.1, strongest → calmest base fill):
 * glacier (bright, outlined — safety-relevant) · exposed rock · forest ·
 * scrub/fjällbjörk (the treeline signal) · grassland · open alpine
 * background (deliberately the calmest — the stage, not an actor). Wetland
 * is NOT a base fill: it renders as a semi-transparent cool wash ABOVE
 * wood/grass/scrub, fading in z10→z12, so a wet birch forest reads as both.
 */
export const NORDIC_TOPO_PALETTE = {
  id: 'liberty-nordic',
  background: '#eef0e9', // open fjäll: lightest, slightly cool stone/paper
  park: 'rgba(122, 151, 118, 0.10)', // barely-there protected-area tint
  parkOutline: 'rgba(95, 130, 98, 0.35)',
  wood: 'rgba(118, 152, 106, 0.52)', // birch/spruce forest — the strongest green
  grass: 'rgba(180, 198, 155, 0.32)', // meadow: lighter and quieter than scrub
  scrub: 'rgba(150, 175, 120, 0.45)', // fjällbjörk treeline belt: between forest and grass
  wetland: 'rgb(114, 156, 138)', // cool wet-ground wash — green enough to never read as water
  // Overlay behaviour: invisible until z10, full wash strength by z12 —
  // wetland must read at hut-decision zooms without muddying the overview.
  wetlandOpacity: ['interpolate', ['linear'], ['zoom'], 10, 0.08, 12, 0.4],
  ice: 'rgba(240, 246, 249, 0.94)', // glacier fill: bright, cold
  iceOutline: 'rgba(122, 158, 175, 0.85)', // thin cool rim so tongues read on rock
  sand: 'rgba(228, 221, 198, 1)',
  barren: 'rgba(186, 188, 181, 0.55)', // low-zoom massifs match the rock family
  rock: 'rgb(158, 160, 155)', // exposed rock: muted cool grey, hostile
  rockOpacity: ['interpolate', ['linear'], ['zoom'], 10, 0.3, 12, 0.48],
  cliff: 'rgba(122, 130, 124, 0.7)',
  // Relief (rendered only when the terrain/contour archives are available):
  // muted so valleys and ridges read instantly without stealing contrast
  // from the route, water or wetland — tuned at the benchmark cameras.
  hillshadeShadow: 'rgba(74, 69, 60, 0.2)',
  hillshadeHighlight: 'rgba(255, 255, 250, 0.16)',
  hillshadeExaggeration: 0.32,
  contour: 'rgba(148, 125, 95, 0.38)', // thin warm grey-brown, z13+
  contourIndex: 'rgba(148, 125, 95, 0.6)', // heavier every 100 m, z11+
  residentialLowZoom: 'rgba(205, 207, 199, 0.55)',
  residentialHighZoom: 'rgba(205, 207, 199, 0.45)',
  water: '#a3c3cc', // lakes: glacial teal — the primary orientation anchors
  waterRiver: '#93b9c6', // flowing water: same family, one clear step deeper
  waterway: '#7fa9b4',
  // Valley rivers are the spine of Kungsleden navigation: visible from z9
  // with a gentle ramp instead of popping in at z11.
  riverLineWidth: ['interpolate', ['exponential', 1.2], ['zoom'], 9, 0.6, 12, 1.4, 20, 6],
  riverLineOpacity: ['interpolate', ['linear'], ['zoom'], 8.5, 0, 9.5, 1],
  // Stream crossings are safety-relevant: reliable from z12, restrained before.
  streamLineWidth: ['interpolate', ['exponential', 1.3], ['zoom'], 12, 0.5, 14, 1, 20, 5],
  streamLineOpacity: ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12.5, 0.9],
  trailCasing: '#a5794b', // cloudberry-deep so paths read in daylight
  trail: '#f5f1e8',
  trailMinzoom: 12, // trails one zoom earlier: hut-approach legibility
  trackCasing: '#a19478', // clearly warmer/darker than minor roads at z13
  track: '#f5f1e8',
  minorCasing: '#bcc0b4', // wilderness context: gravel roads matter less than trails
  minor: '#f7f5ef',
  majorCasing: '#a6906a', // E10 stays an orientation line, not a highlight
  major: '#ebe2cd',
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
 * Omitted from Liberty Topo (no glyphs / no sprites — recorded in
 * docs/map-style-comparison.md): every symbol layer (place/POI/peak/road
 * labels, shields, oneway arrows), pattern fills, 3-D buildings, and the
 * separate tunnel/bridge road variants (bridges render like surface roads;
 * the area has no styled tunnels).
 *
 * Liberty Topo's defining relief layers (hillshading + contours) are no
 * longer omitted: when the optional `relief` sources are passed (i.e. the
 * corresponding offline archives are available — see mapStyle.ts), the
 * builder emits a MapLibre `hillshade` layer on the terrain-RGB raster-dem
 * source and two contour line layers on the contour vector source, at their
 * correct stratum positions (above the landcover fills, below cliffs and
 * every water/road line — benchmark §6.1 stratum 2/3). Without the sources
 * the output is exactly the pre-relief style.
 *
 * @param {string} sourceId Vector basemap source id.
 * @param {object} palette LIBERTY_TOPO_PALETTE or NORDIC_TOPO_PALETTE.
 * @param {{ terrainSourceId?: string, contoursSourceId?: string }} [relief]
 *   Optional relief sources; omit any that has no archive available.
 */
export function libertyTopoLayers(sourceId, palette, relief = {}) {
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
        'barren', p.barren,
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
      // NOTE: the corridor archive contains zero `scree` features (measured,
      // benchmark §3.2) — the value is kept only as harmless future-proofing;
      // all rock rendering comes from `bare_rock`.
      filter: ['in', 'kind', 'bare_rock', 'scree'],
      paint: {
        'fill-color': p.rock,
        'fill-opacity': p.rockOpacity,
        'fill-antialias': false,
      },
    });
  }
  // Liberty `landcover_wetland` — pattern fill substituted by a flat tint.
  // Nordic treats this as a semi-transparent OVERLAY WASH above the
  // wood/grass/scrub base fills (layer order already provides that): wet
  // forest reads as both, an open bog reads against the background
  // (benchmark §6.1). The `bog/marsh/swamp` values never occur in the
  // archive (only `wetland`) — kept as future-proofing for a richer build.
  add({
    id: 'lt_wetland',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'wetland', 'bog', 'marsh', 'swamp'],
    paint: {
      'fill-color': p.wetland,
      'fill-opacity': p.wetlandOpacity,
      'fill-antialias': false,
    },
  });
  // Liberty `landcover_ice` (glaciers — Kebnekaise massif).
  add({
    id: 'lt_ice',
    type: 'fill',
    'source-layer': 'landuse',
    filter: ['in', 'kind', 'glacier'],
    paint: { 'fill-color': p.ice, 'fill-antialias': false },
  });
  // Fjällkompis extra (palette-gated): thin cool glacier rim so ice tongues
  // read against rock at z11–14 (Liberty draws none → null skips it).
  if (p.iceOutline) {
    add({
      id: 'lt_ice_outline',
      type: 'line',
      'source-layer': 'landuse',
      minzoom: 10,
      filter: ['in', 'kind', 'glacier'],
      paint: {
        'line-color': p.iceOutline,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.2],
      },
    });
  }
  // -- Relief (benchmark §6.1 stratum 2/3) -----------------------------------
  // Hillshade sits ABOVE every landcover fill and the wetland wash (terrain
  // shading combines with them) but BELOW cliffs, contours and all water and
  // road linework, so lines never lose contrast to shading. Strength comes
  // from the palette (exaggeration + translucent shadow/highlight colours);
  // lakes are drawn later and therefore stay unshaded.
  if (relief.terrainSourceId) {
    layers.push({
      id: 'lt_hillshade',
      type: 'hillshade',
      source: relief.terrainSourceId,
      paint: {
        'hillshade-shadow-color': p.hillshadeShadow,
        'hillshade-highlight-color': p.hillshadeHighlight,
        'hillshade-exaggeration': p.hillshadeExaggeration,
        'hillshade-illumination-direction': 335,
      },
    });
  }
  // Contours: 20 m interval with every 100 m as the heavier index line (the
  // Swedish fjällkartan convention — and the honest resolution of the 30 m
  // Copernicus DEM). Index lines appear from z11 with a fade-in; the full
  // 20 m set joins at z13. Elevation labels are deliberately absent until
  // the offline-glyphs roadmap item ships.
  if (relief.contoursSourceId) {
    layers.push({
      id: 'lt_contour',
      type: 'line',
      source: relief.contoursSourceId,
      'source-layer': 'contours',
      minzoom: 13,
      filter: ['!=', ['%', ['get', 'elev'], 100], 0],
      paint: {
        'line-color': p.contour,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 0.9],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, 1],
      },
    });
    layers.push({
      id: 'lt_contour_index',
      type: 'line',
      source: relief.contoursSourceId,
      'source-layer': 'contours',
      minzoom: 11,
      filter: ['==', ['%', ['get', 'elev'], 100], 0],
      paint: {
        'line-color': p.contourIndex,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 1.4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 1],
      },
    });
  }

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
      'line-width': p.streamLineWidth,
      'line-opacity': p.streamLineOpacity,
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
      'line-width': p.riverLineWidth,
      'line-opacity': p.riverLineOpacity,
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
  // Fjällkompis extra (palette-gated): river/stream POLYGONS one step deeper
  // than lakes so braided deltas (Abisko) read as flowing water. Painted
  // over lt_water — the base water layer keeps covering every polygon.
  if (p.waterRiver) {
    add({
      id: 'lt_water_river',
      type: 'fill',
      'source-layer': 'water',
      filter: [
        'all',
        ['==', '$type', 'Polygon'],
        ['in', 'kind_detail', 'river', 'stream'],
      ],
      paint: { 'fill-color': p.waterRiver },
    });
  }

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
  // Structural palette value (Liberty 13, Nordic 12): the Nordic restyle
  // starts trails one zoom earlier — documented exception in
  // tests/map-styles.test.mjs. Width ramps share the same start zoom.
  const trailFilter = ['all', ['==', 'kind', 'path'], ['!in', 'kind_detail', 'track', 'pier']];
  add({
    id: 'lt_trail_casing',
    type: 'line',
    'source-layer': 'roads',
    minzoom: p.trailMinzoom,
    filter: trailFilter,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': p.trailCasing,
      'line-width': roadWidth([p.trailMinzoom, 1.6, p.trailMinzoom + 2, 4]),
    },
  });
  add({
    id: 'lt_trail',
    type: 'line',
    'source-layer': 'roads',
    minzoom: p.trailMinzoom,
    filter: trailFilter,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': p.trail,
      'line-dasharray': [2.5, 1],
      'line-width': roadWidth([p.trailMinzoom, 0.8, p.trailMinzoom + 2, 2]),
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
