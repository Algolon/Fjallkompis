# Map-style comparison prototype

**Status: DECIDED (v0.10.0) — "Liberty Topo — Nordic" is the production
Terrain style.** The in-app comparison selector has been removed;
`DEFAULT_MAP_STYLE_ID` in `src/map/mapStyles.mjs` is `'liberty-nordic'`.
The registry, the Liberty builder and both palettes are retained, so the
look remains centrally adjustable (`NORDIC_TOPO_PALETTE` in
`src/map/libertyTopoLayers.mjs`) and a future comparison can be re-enabled
by wiring a different id into MapView's `mapStyleId` prop. The rest of this
document is kept as the record of the evaluation setup.

## Purpose

Evaluate three basemap styles side by side, on identical data, to decide
whether:

- the current Fjällkompis style should remain;
- the adapted Liberty Topo style is stronger;
- the Nordic-restyled Liberty Topo should become the future foundation;
- or selected elements should be combined later.

## The three styles

| Option | Source of truth | What it is |
| --- | --- | --- |
| **Current** | `@protomaps/basemaps` "light" flavour via `src/map/mapStyles.mjs` | The production style, unchanged (control version). |
| **Liberty Topo** | `src/map/libertyTopoLayers.mjs` + `LIBERTY_TOPO_PALETTE` | The gpx.studio Liberty Topo style, translated to the Fjällkompis Protomaps schema with Liberty's original colours. |
| **Liberty Topo — Nordic** | same builder + `NORDIC_TOPO_PALETTE` | The identical Liberty structure restyled with the Nordic Trail design language (calm, desaturated, daylight-readable). |

## How to access it

The selector is developer-facing and deliberately unpolished:

1. `npm run dev`, open the **Map** screen.
2. Use the **Style · prototype** dropdown under the Terrain/Satellite toggle.
3. Switching is immediate and in place: the camera (position, zoom, bearing,
   pitch), route overlays, hut markers, GPS dot and all UI state are
   preserved, because only the basemap *paint layers* are swapped on the
   shared vector source (`MapView.tsx`, "Comparison-prototype basemap style
   switch" effect). Nothing is persisted; every session starts on Current.

In dev builds, `window.__fjallkompisMap` exposes the MapLibre map so the
checklist cameras below can be set exactly from the console, e.g.
`__fjallkompisMap.jumpTo({ center: [18.2823, 67.9462], zoom: 13.4 })`.

## Architecture

- `src/map/libertyTopoLayers.mjs` — palette-driven builder producing the
  adapted Liberty Topo layer stack (ids prefixed `lt_`). Layer order,
  filters, zoom thresholds and widths are **shared** between the Liberty and
  Nordic palettes so the comparison isolates colour/tone, not data or
  hierarchy. Each layer is commented with its Liberty origin.
- `src/map/mapStyles.mjs` — the registry (`MAP_STYLE_OPTIONS`,
  `basemapLayersForStyle`). `'current'` returns the same
  `@protomaps/basemaps` call production has always used.
- `src/map/mapStyle.ts` — `buildMapStyle` takes an optional style id
  (default: production).
- All three styles read the **same** bounded vector PMTiles archive, the same
  route GeoJSON, the same overlays, and none needs glyphs, sprites or any
  remote resource — the offline-first behaviour is identical by construction.
- Guarded by `tests/map-styles.test.mjs` (registry, offline compatibility,
  production-style byte-equality, structural fairness, forbidden-endpoint
  scan, licence registration).

## Liberty Topo source and licences

Style reference: [`liberty-topo.json` in gpxstudio/styles](https://github.com/gpxstudio/styles)
(the official gpx.studio styles repository). Only the style design was used —
**no gpx.studio tiles, fonts, sprites or TileJSON endpoints are requested at
any time**, no Liberty Satellite configuration was taken, and no MapTiler or
other keyed/paid dependency was introduced.

Licence lineage (registered in `src/data/attribution.ts` and shown in
Settings → Data sources & credits):

- gpx.studio's Liberty Topo derives from **OpenFreeMap Styles' Liberty**
  — MIT, © 2023 Zsolt Ero — with topo layers from
  [nst-guide/osm-liberty-topo](https://github.com/nst-guide/osm-liberty-topo).
- Liberty itself is a fork of [maputnik/osm-liberty](https://github.com/maputnik/osm-liberty)
  (OSM Bright / Mapbox Open Styles lineage): code BSD-3-Clause, design CC BY 4.0.
- Map data in all three styles: © OpenStreetMap contributors (ODbL), via
  Protomaps — unchanged from production.

## Layer mapping: direct, adapted, substituted, omitted

Liberty Topo targets the OpenMapTiles schema plus gpx.studio-hosted
hillshade/contour sources; Fjällkompis ships a Protomaps (tileset v4) archive
with source-layers `earth, landcover, landuse, water, roads, buildings,
boundaries` (z ≤ 14) and deliberately has no glyphs or sprites. Mapping:

**Adapted (schema translation, same visual intent)**

| Liberty layer(s) | Fjällkompis adaptation |
| --- | --- |
| `background` | `lt_background` + `lt_earth` (Protomaps needs an explicit land fill) |
| `park`, `park_outline` (OMT park) | `lt_park`, `lt_park_outline` on landuse kinds `national_park`, `nature_reserve`, `park`, `protected_area` |
| `landuse_residential` | `lt_residential` (same z9→z12 ramp, hidden above z12) |
| `landcover_wood` | `lt_wood` on landuse kinds `wood`, `forest` |
| `landcover_grass` | `lt_grass` (`grass`, `grassland`, `meadow`, `village_green`) + `lt_scrub` (`scrub`) — OMT folds scrub into grass; split kept so the Nordic palette can distinguish fjällbjörk scrub (Liberty palette colours them identically) |
| `landcover_ice` | `lt_ice` on landuse kind `glacier` |
| `landcover_sand` | `lt_sand` (`sand`, `beach`) |
| `waterway_river` / `waterway_other` | `lt_waterway_river` / `lt_waterway_stream` (Protomaps water line kinds `river`/`stream`), Liberty widths |
| `water` | `lt_water` (water polygons) |
| `road_path_pedestrian_trail(_casing)` | `lt_trail(_casing)`: Protomaps has **no surface attribute**, so *all* paths except `track`/`pier` get the unpaved-trail treatment — correct for this fjäll corridor |
| `road_service_track(_casing)` | `lt_road_track(_casing)` on `path/track` + `minor_road/service` |
| `road_minor(_casing)` | `lt_road_minor(_casing)` |
| `road_secondary_tertiary(_casing)`, `road_trunk_primary(_casing)`, `road_motorway*` | `lt_road_secondary_tertiary` / `lt_road_trunk_primary` (+ casings); motorway (`highway` kind) folded into trunk/primary — none exists in the corridor |
| `road_major_rail(+hatching)` | `lt_rail`, `lt_rail_hatching` (Malmbanan at Abisko) |
| `building` | `lt_building` (kept visible ≥ z13; no maxzoom because the archive over-zooms 14→17) |
| `boundary_2` / `boundary_3` | `lt_boundary_country` / `lt_boundary_minor` (kind_detail 2 / >2) |
| — (Protomaps-only) | `lt_landcover`: low-zoom landcover so the zoomed-out overview isn't blank paper |

**Substituted (no sprites/pattern support offline)**

- `landcover_wetland` (sprite pattern `wetland_bg_11`) → `lt_wetland` flat
  tint. Wetland is *not rendered at all* by the Current style, and it is
  everywhere on this route — a real, called-out data-presentation difference.
- Tunnel/bridge road variants folded into the surface layers (bridges render
  like surface roads; the corridor has no styled tunnels).

**Omitted (no offline data or resource — deliberately not faked)**

- `hillshading` — gpx.studio-hosted source; no offline terrain archive yet
  (roadmap item *Terrain context*).
- `contours_m` / `contours_ft` + contour labels — same reason. This is
  Liberty **Topo**'s defining feature; until an offline contour/terrain
  source ships, the comparison is between the *flat* renditions.
- Every symbol layer: place/POI/peak/water/road labels, shields, oneway
  arrows — the app ships no glyphs or sprites (offline-first; roadmap item
  *Offline map labels*). Hut names remain local HTML markers in all three
  styles.
- `building-3d` (fill-extrusion), `landuse_pitch/track/cemetery/hospital/school`,
  aeroway layers — no data in the corridor or negligible.
- Ferry lines (Ládtjojávri boat) are unstyled — also unstyled in Current.

**Nordic-only, palette-gated extras (documented divergence)**

- `lt_rock` (landuse `bare_rock`/`scree`) and `lt_cliff` (earth `cliff`
  lines): supported by the archive, unstyled by Liberty. Enabled only in the
  Nordic palette per the "rock distinction" design goal; the Liberty palette
  sets them to `null` for fidelity. Both styles read identical data.

## Fairness rules

- One vector source, one archive, identical source-layers, identical route
  and overlay layers, identical camera (switching never moves it).
- Liberty and Nordic share ids, filters, minzoom/maxzoom and widths
  (test-enforced); only palette values differ, plus the two gated extras
  above.
- Current renders some data differently by *style* choice (e.g. no wetland,
  one shared tint for most landuse) — that is exactly what is being compared,
  and is called out above rather than silently equalised.

## Evaluation checklist

Judge each style on: terrain legibility · contour readability (n/a until a
contour source exists) · route prominence · label clarity (HTML hut markers)
· visual calm · outdoor readability (test at full brightness in daylight) ·
path/hut recognisability · consistency with the Fjällkompis UI · performance
while panning/zooming · offline reliability.

Test locations (`__fjallkompisMap.jumpTo({...})` in dev):

| Scenario | Camera |
| --- | --- |
| Full Abisko–Nikkaluokta overview | "Full route" chip, or `fitBounds([[18.2411,67.8428],[19.0161,68.3583]], {padding:40})` |
| Abisko: settlement, E10, railway, river, forest | `{center:[18.79,68.355], zoom:12.3}` |
| Mountainous terrain + glaciers (Kebnekaise) | `{center:[18.62,67.87], zoom:11.5}` |
| Valleys & waterways (Tjäktjavagge) | `{center:[18.30,67.99], zoom:11.5}` |
| Hut surroundings + path junctions (Sälka) | `{center:[18.2823,67.9462], zoom:13.4}` |
| Wetland plains (Alesjaure) | `{center:[18.4149,68.1366], zoom:12.5}` |
| Low zoom | zoom ≤ 8 · High zoom: zoom 15–17 (over-zoomed tiles) |
| Route active | select a stage, confirm the route stays the strongest element |
| GPS | "Use my location" or manual mode; confirm the GPS dot reads clearly |
| Offline | build + preview, download the offline map in Settings, go offline, switch all three styles |

Repeat the mobile checks outdoors on a real device before any decision
(roadmap exit criteria).

## Exit

The roadmap item defines the exit criteria. When the decision is made, the
selector is either promoted into a real setting, revised, or removed — and
this document is updated with the outcome.
