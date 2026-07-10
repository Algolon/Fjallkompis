/**
 * Liberty Topo — Nordic: the PRODUCTION Fjällkompis basemap style, built on
 * the offline Protomaps archive.
 *
 * Origin: the style structure is adapted from "Liberty Topo" in the official
 * gpx.studio styles repository (https://github.com/gpxstudio/styles,
 * liberty-topo.json), itself derived from OpenFreeMap's Liberty style (MIT,
 * © 2023 Zsolt Ero) and osm-liberty / OSM Bright (code BSD-3-Clause, design
 * CC BY 4.0). Only the style design is reused — never gpx.studio's hosted
 * tiles, fonts or sprites (licence lineage: src/data/attribution.ts). The
 * three-way comparison prototype and the temporary Thunderforest benchmark
 * that produced this style are CONCLUDED (docs/map-style-comparison.md,
 * docs/maps/thunderforest-outdoors-benchmark.md); the Liberty reference
 * palette and the comparison selector were removed with that decision.
 *
 * Liberty Topo targets the OpenMapTiles schema plus gpx.studio-hosted
 * hillshading/contour sources. Fjällkompis ships a single bounded Protomaps
 * (tileset v4) PMTiles archive and deliberately has no glyphs or sprites, so
 * this module TRANSLATES the Liberty layers onto the Protomaps source-layers
 * (earth / landcover / landuse / water / roads / buildings / boundaries) and
 * omits what has no offline data (all symbol layers, pattern fills, 3-D
 * buildings). Relief (hillshade + contours) renders from the two optional
 * offline terrain archives when they are available.
 *
 * The builder stays palette-driven so the look remains centrally adjustable:
 * every colour, opacity ramp and structural threshold the design owns lives
 * in NORDIC_TOPO_PALETTE below, and tests/map-styles.test.mjs fences the
 * terrain-hierarchy relationships between the slots.
 */

/**
 * Nordic Trail palette: calm desaturated Scandinavian tones from the app
 * palette (src/styles/global.css — spruce, glacier, cloudberry, stone),
 * tuned for outdoor daylight readability. The route overlay (saturated
 * Okabe–Ito lines) must stay the strongest foreground element, so every
 * base tone here is kept muted. A slot set to null skips its layer.
 *
 * Terrain hierarchy (0.17.0 legibility iteration — measured against the
 * archive audit in docs/maps/thunderforest-outdoors-benchmark.md §3):
 * the base landcover fills are now SOLID colours on a single muted ladder,
 * because the earlier semi-transparent fills mixed with the background into
 * near-indistinguishable pastels. Strongest → calmest base fill:
 * glacier (bright, outlined — safety-relevant) · forest (deepest green) ·
 * scrub/fjällbjörk (olive treeline belt) · grassland/meadow (light
 * yellow-green) · exposed rock (cool neutral grey) · open-fjäll background
 * (calm warm-grey stone — no longer near-white). Wetland is NOT a base
 * fill: it renders as a translucent peat-brown wash ABOVE wood/grass/scrub,
 * fading in z10→z12, so a wet birch forest reads as both. The protected-
 * area tint stays barely visible and greyer than every vegetation green.
 */

export const NORDIC_TOPO_PALETTE = {
  id: 'liberty-nordic',
  // Open fjäll: calm warm-grey stone. Deliberately DEEPER than the old
  // near-white #eef0e9 — the audit showed ~85–90% of the corridor has no
  // terrain polygon at z8+, so this colour IS the open-fjäll surface.
  background: '#e7e7da',
  // Low-zoom (z≤7) landcover 'grassland': the generalised polygon covers
  // essentially the whole corridor at z7 and vanishes at z8, so it must
  // sit CLOSE to the open-fjäll background (a faint green hint, not the
  // meadow green) — that is what removes the z7→z8 colour jump.
  landcoverGrassland: '#e1e4cf',
  park: 'rgba(122, 151, 118, 0.08)', // barely-there protected-area tint
  parkOutline: 'rgba(95, 130, 98, 0.35)',
  // Vegetation ladder — solid muted tones, one hue family, three clear
  // steps (the old translucent fills collapsed into near-white pastels):
  wood: 'rgb(148, 172, 126)', // birch/spruce forest — deepest green
  grass: 'rgb(207, 216, 171)', // meadow/grassland: light muted yellow-green
  scrub: 'rgb(174, 188, 133)', // fjällbjörk treeline belt: olive, between the two
  // Wetland wash: muted peat/moss olive-brown — hue-separated from every
  // vegetation green AND from the water teals (never "shallow water").
  wetland: 'rgb(146, 132, 88)',
  // Overlay behaviour: invisible until z10, full wash strength by z12 —
  // wetland must read at hut-decision zooms without muddying the overview.
  wetlandOpacity: ['interpolate', ['linear'], ['zoom'], 10, 0.12, 12, 0.45],
  ice: 'rgba(242, 247, 250, 0.96)', // glacier fill: bright, cold
  iceOutline: 'rgba(116, 154, 173, 0.9)', // thin cool rim so tongues read on rock
  sand: 'rgba(228, 221, 198, 1)',
  barren: 'rgb(199, 200, 192)', // low-zoom massifs match the rock family
  rock: 'rgb(169, 172, 164)', // exposed rock: muted cool grey, hostile
  rockOpacity: ['interpolate', ['linear'], ['zoom'], 10, 0.5, 12, 0.7],
  cliff: 'rgba(122, 130, 124, 0.7)',
  // Relief (rendered only when the terrain/contour archives are available):
  // muted so valleys and ridges read instantly without stealing contrast
  // from the route, water or wetland — tuned at the benchmark cameras.
  hillshadeShadow: 'rgba(74, 69, 60, 0.2)',
  hillshadeHighlight: 'rgba(255, 255, 250, 0.16)',
  hillshadeExaggeration: 0.32,
  contour: 'rgba(148, 125, 95, 0.4)', // thin warm grey-brown, fading in z11.5→13
  contourIndex: 'rgba(148, 125, 95, 0.62)', // heavier every 100 m, fading in z9.5→11
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
 * Build the production basemap layers against the Fjällkompis Protomaps
 * vector source. Returns MapLibre layer specs, bottom-to-top, every id
 * prefixed `lt_` so they can never collide with the runtime layer ids
 * (route, GPS, satellite — see tests/map-styles.test.mjs).
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
 * @param {object} palette NORDIC_TOPO_PALETTE (the builder stays
 *   palette-driven so the design remains centrally adjustable).
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

  // Low-zoom landcover (Protomaps-only layer, exists ONLY in z0–7 tiles):
  // keeps the zoomed-out route overview from rendering as blank paper.
  // Measured behaviour (archive audit, 0.17.0): at z7 the generalised
  // 'grassland' polygon covers ~100% of the corridor and the whole layer
  // disappears at z8, where sparse OSM landuse takes over on the bare
  // background. 'grassland' therefore gets its own near-background tone
  // (landcoverGrassland) so the z7→z8 handover doesn't jump from green to
  // stone; forest/glacier/barren reuse the landuse slots and hand over to
  // the corresponding OSM polygons.
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
        'grassland', p.landcoverGrassland,
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
  // unstyled; a palette with rock:null would skip the layer.
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
  // read against rock at z11–14 (Liberty draws none; null would skip it).
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
  // Contours: 20 m interval with every 100 m as the heavier index line —
  // selected from the 30 m DEM resolution, visual comparison, contour noise
  // and storage measurements. Earlier-contours iteration (0.17.0): index
  // lines fade in from z9.5 and are clearly legible by z11; the 20 m set
  // fades in from z11.5 and is fully useful by z13. Both ramps start at
  // opacity 0 so neither tier pops at a threshold. The archive tags index
  // lines into z9+ tiles and the full set into z12+ tiles
  // (scripts/build-terrain-map.sh — keep in sync); with an older archive
  // (terrain-data-v2, tiles z11–13) the same style degrades gracefully:
  // nothing renders below the archive's own tile minzooms. Elevation labels
  // are deliberately absent until the offline-glyphs roadmap item ships.
  if (relief.contoursSourceId) {
    layers.push({
      id: 'lt_contour',
      type: 'line',
      source: relief.contoursSourceId,
      'source-layer': 'contours',
      minzoom: 11.5,
      filter: ['!=', ['%', ['get', 'elev'], 100], 0],
      paint: {
        'line-color': p.contour,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11.5, 0.35, 13, 0.55, 16, 0.9],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 13, 0.85],
      },
    });
    layers.push({
      id: 'lt_contour_index',
      type: 'line',
      source: relief.contoursSourceId,
      'source-layer': 'contours',
      minzoom: 9.5,
      filter: ['==', ['%', ['get', 'elev'], 100], 0],
      paint: {
        'line-color': p.contourIndex,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9.5, 0.55, 13, 1, 16, 1.5],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0, 11, 0.9],
      },
    });
  }

  // Fjällkompis extra (palette-gated): cliff lines from the Protomaps earth
  // layer. No OpenMapTiles equivalent exists; Liberty styles no cliffs.
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
  // Structural palette value: Nordic starts trails at z12, one zoom earlier
  // than Liberty's verbatim 13 (hut-approach legibility). Width ramps share
  // the same start zoom.
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
