# Thunderforest Outdoors — cartographic benchmark & Nordic translation plan

**Status: research complete (v0.12.0); Phases 1–2 executed.** The Nordic
terrain hierarchy restyle (v0.13.0) delivered Phase 1, and the terrain
relief iteration (v0.14.0) delivered the §8.1 contours + hillshade data and
the Phase 2 relief layers (`scripts/build-terrain-map.sh`, Copernicus DEM
GLO-30). Remaining: Phase 3 (paths polish + the glyph-gated label system)
and the optional §8.2 custom tile profile — tracked in ROADMAP.md.

This document is the deliverable of
the temporary **Thunderforest Outdoors — Online preview** comparison layer on
the Map screen: an audit of what the shipped Fjällkompis map data can express,
an analysis of *why* Thunderforest Outdoors works so well for hiking, and a
prioritised, implementation-ready plan for reproducing that functional
quality in the free, offline-capable **Liberty Topo — Nordic** style. The
follow-up restyle PRs execute this plan; they must not need to repeat the
research.

## 1. Purpose and hard non-goals

Thunderforest Outdoors is used **only as an external visual and functional
reference**. It is not a migration target. Permanently out of scope:

- becoming the default basemap (the default stays `liberty-nordic`);
- replacing Nordic Liberty Topo;
- inclusion in offline downloads, PMTiles conversion, bulk download or
  persistent pre-caching (tiles come straight from the Thunderforest API,
  no proxy, no redistribution);
- becoming a dependency of anything else in the app.

Equally out of scope for the *translation*: copying Thunderforest's
proprietary style definitions or assets, sampling and reproducing its exact
colours, scraping or reverse-engineering tile content, or claiming to
reproduce its dataset. The goal is to identify **general cartographic
principles** — landcover hierarchy, relief treatment, path hierarchy, label
prioritisation — and re-express them as an **original Nordic design** on free,
legally usable data (OpenStreetMap via Protomaps, plus the free terrain
sources assessed in §8).

## 2. Comparison setup

The Map screen's **Map comparison — temporary** selector (visible in dev
builds by default; in production only with `VITE_ENABLE_MAP_BENCHMARK=true`)
offers four options on one shared camera — switching swaps styles in place,
so position, zoom, bearing, pitch, route state and every overlay are
identical across styles by construction:

| # | Option | Data | Availability |
| --- | --- | --- | --- |
| 1 | Current | offline vector PMTiles | always |
| 2 | Liberty Topo | same archive | always |
| 3 | Liberty Topo — Nordic (production) | same archive | always |
| 4 | Thunderforest Outdoors — *Online preview* | Thunderforest raster API | only with `VITE_THUNDERFOREST_API_KEY`; online only |

Method: side-by-side within one session. Set a camera (dev builds expose
`window.__fjallkompisMap`, e.g.
`__fjallkompisMap.jumpTo({ center: [18.2823, 67.9462], zoom: 13.4 })`),
cycle the four styles, judge one category at a time. Keep the viewport, the
selected stage and the overlay state fixed while comparing.

### Test areas (representative Kungsleden terrain)

| Scenario | Camera |
| --- | --- |
| Abisko: forest, settlement, E10, railway, river delta | `{center:[18.79,68.355], zoom:12.3}` |
| Forested northern section (birch forest edges) | `{center:[18.72,68.30], zoom:13}` |
| Open alpine terrain (Tjäktja pass area) | `{center:[18.36,68.06], zoom:12.5}` |
| Wetland-rich plains (Alesjaure) | `{center:[18.4149,68.1366], zoom:12.5}` |
| Steep valley terrain (Tjäktjavagge) | `{center:[18.30,67.99], zoom:11.5}` |
| Rocky/exposed + glaciers (Kebnekaise massif) | `{center:[18.62,67.87], zoom:11.5}` |
| Lakes & rivers (Ládtjojávri / Alisjávri chain) | `{center:[18.52,68.14], zoom:11.8}` |
| Hut environment + intersecting trails (Sälka; also Kebnekaise fjällstation) | `{center:[18.2823,67.9462], zoom:13.4}` |

### Zoom levels

Compare at **z10, z12, z14 and z16**, with one honest caveat: the offline
archive contains vector data to **z14** and over-zooms it to the map's cap of
17, while Thunderforest serves native tiles at every zoom. At z16 the vector
styles therefore show magnified z14 geometry against Thunderforest's native
z16 rendering — still valid for judging *hierarchy, density and label
behaviour*, not valid for judging geometry fidelity. z10/z12/z14 are
like-for-like.

## 3. Source & source-layer audit (measured, not assumed)

Audited from the actual archive (`public/maps/kungsleden.pmtiles`, Protomaps
Basemap tileset v4.14.9, built with Planetiler): header + `vector_layers`
metadata, plus a full decode of all 4 648 z14 corridor tiles to enumerate the
attribute values that actually occur. **Online and offline schemas are
identical by construction** — "online" streams the *same* `.pmtiles` file by
HTTP range requests, so no style change can ever diverge between online and
offline use. (The optional satellite layer is a separate raster archive and
is unaffected by everything in this plan.)

### 3.1 Source-layer inventory (source `protomaps`, bounds 18.02–19.23 E, 67.76–68.44 N, z0–14)

| source-layer | zooms | geometry | key properties | values observed in the corridor | styled today by |
| --- | --- | --- | --- | --- | --- |
| `earth` | 0–14 | polygon + line | `kind` | `earth`, `cliff` (lines) | `lt_earth`, `lt_cliff` |
| `landcover` | 0–7 | polygon | `kind` | `barren`, `forest`, `glacier`, `grassland` | `lt_landcover` (low-zoom only) |
| `landuse` | 2–14 | polygon | `kind`, `sort_rank` | `bare_rock`, `beach`, `cemetery`, `commercial`, `forest`, `glacier`, `golf_course`, `grass`, `grassland`, `industrial`, `meadow`, `national_park`, `nature_reserve`, `pitch`, `platform`, `playground`, `railway`, `residential`, `school`, `scrub`, `wetland`, `wood` | `lt_park(_outline)`, `lt_residential`, `lt_wood`, `lt_grass`, `lt_scrub`, `lt_sand`, `lt_rock`, `lt_wetland`, `lt_ice` |
| `water` | 0–14 | polygon + line | `kind`, `kind_detail`, `name`, `bridge`, `tunnel` | polygons: `water/lake`, `water/river`, `water/stream`, `water`, `bay`, `ocean`; lines: `river`, `stream` | `lt_water`, `lt_waterway_river`, `lt_waterway_stream` |
| `roads` | 3–14 | line | `kind`, `kind_detail`, `is_bridge`, `is_tunnel`, `name`, `ref`, `network`, `oneway`, `sort_rank` | `path/{footway,path,pier,sidewalk,steps,track}`, `minor_road/{residential,service,unclassified}`, `major_road/{secondary,tertiary,trunk}`, `rail/rail`, `ferry` | `lt_trail(_casing)`, `lt_road_track(_casing)`, `lt_road_minor(_casing)`, `lt_road_secondary_tertiary(_casing)`, `lt_road_trunk_primary(_casing)`, `lt_rail(+hatching)` |
| `buildings` | 11–14 | polygon | `kind`, `height` | `building` | `lt_building` |
| `boundaries` | 0–14 | line | `kind`, `kind_detail`, `disputed` | `country`(2), `region`(4), `locality`(7) | `lt_boundary_country`, `lt_boundary_minor` |
| `places` | 1–14 | point | `kind`, `kind_detail`, `name`, `population` | `locality/{town,village,hamlet,locality}` | **nothing** (no glyphs) |
| `pois` | 5–14 | point | `kind`, `kind_detail`, `name`, `elevation` | `peak`×154 (with `elevation`), `water`×126 (named lakes), `glacier`×47, `hostel`×8, `alpine_hut`×2, `camp_site`×3, `attraction`, `national_park`, `nature_reserve`, `rest_area`, `supermarket`, `cafe`, `hotel`, `guest_house`, `picnic_site`, `valley`×3, `bay`×2, … | **nothing** (no glyphs/sprites) |

### 3.2 What the data can and cannot express

**Present and unused — the biggest free wins:**

- `pois`: **154 named peaks with an `elevation` attribute**, 126 named water
  features, 47 named glaciers, valleys, camp sites, huts/hostels. Entirely
  unstyled today because the app ships no glyphs (deliberate; ROADMAP item
  *Offline map labels*).
- `places`: settlement labels (Abisko, Nikkaluokta, Kiruna-side villages)
  with `kind_detail` for ranking — unstyled for the same reason.
- `water` polygons carry `kind_detail` (`lake` vs `river` vs `stream`):
  a lake/river visual distinction is **pure styling**, available today.
- `roads.is_bridge` exists: bridge emphasis is pure styling.
- `earth` `cliff` lines exist and are already styled (Nordic only);
  `landuse.meadow` is present in-corridor and correctly covered by
  `lt_grass`'s filter — no action needed, recorded here so nobody re-checks.

**Absent or insufficient in the current archive (measured, corridor-wide):**

| Missing | Detail | Consequence |
| --- | --- | --- |
| Contours | no contour source-layer at all | defining topo feature impossible without new data (§8) |
| Hillshade / DEM | no raster-dem or shading layer | same (§8) |
| Heath / fell vegetation | no `heath` kind anywhere (OSM `natural=heath`/`fell` is not in the Protomaps v4 landuse set) | the dominant Kungsleden ground cover between birch forest and bare rock cannot be distinguished from generic grassland |
| Scree | `lt_rock` filters on `scree` but **zero** `scree` features exist; only `bare_rock` occurs | scree styling silently no-ops; rock relies on `bare_rock` (+ z≤7 `barren`) |
| Marsh/bog/swamp split | only generic `wetland`; `lt_wetland`'s `bog/marsh/swamp` filter values never occur | one flat wetland class only |
| Snow (non-glacier) | no `snow` kind | fold into glacier/ice treatment |
| Passes/saddles | no `saddle`/`pass` POI kind observed | passes only derivable from names or extra data |
| Shelters / wind shelters | no `shelter` kind observed; STF huts appear inconsistently (`alpine_hut`, `hostel`, even `residential`/`yes`) | app-native hut markers (already shipped) remain the authoritative hut layer — do **not** rely on OSM POIs for huts |
| Trail classification | no `surface`, `sac_scale`, `trail_visibility`, no route relations (except ferry) | official-trail vs spontaneous-path distinction not data-driven; the corridor is almost all genuine trail, and the app's own route line already marks the official way |
| Retina rendering | n/a (data) | Thunderforest crispness partly comes from @2x tiles; out of scope by decision |

## 4. Category-by-category benchmark

Columns: **TF principle** = what Thunderforest Outdoors observably does well
(described as principles, not copied values); **Nordic today** = current
`liberty-nordic` behaviour; **Class** = translation classification —
**1** style-only · **2** source-layer remapping · **3** additional free data ·
**4** not feasible with current data · **5** not desirable for Fjällkompis.
Confidence (H/M/L) states how sure we are the recommended treatment will
deliver the intended benefit.

### 4.1 Terrain & landcover

| Category | TF principle | Nordic today | Source / source-layer | Class | Recommended Nordic treatment | Zooms | Conf. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Open alpine terrain | Reads as its own "above the treeline" surface, not as blank paper; forest edge is a strong, legible boundary | Background colour only — open fjäll is the *absence* of other fills | background + `landuse` (no explicit class) | 1 | Keep as background but tune: slightly cooler/lighter than forest so the birch-forest → open-fjäll transition is the strongest landcover edge on the map. Open terrain stays the calmest surface (route must dominate) | 8–17 | H |
| Forest | Unmissable green mass; generalised at low zoom, textured at high | `lt_wood` at 0.40 opacity — present but timid; low-zoom `lt_landcover` `forest` | `landuse` `wood`,`forest`; `landcover` `forest` (z≤7) | 1 | Raise forest presence (opacity/darkness), one deliberate green family; align `lt_landcover` low-zoom tone with `lt_wood` so z7→z8 doesn't jump | 4–17 | H |
| Scrub (fjällbjörk) | Distinct from forest and grass — the "transition belt" is visible | `lt_scrub` separate but nearly identical to grass in value | `landuse` `scrub` | 1 | Keep hue between forest and grassland, raise separation from both (scrub is the treeline signal hikers actually use) | 10–17 | M |
| Heath | Distinct muted moorland tone — a big part of TF's fell readability | **Impossible** — no heath kind in the archive | — | 3 (or 4 short-term) | Short term: accept grassland as proxy. Long term: custom Planetiler profile adding `natural=heath`/`fell` (§8.2) | 11–17 | M |
| Grassland / meadow | Soft green, clearly lighter than forest | `lt_grass` (incl. `meadow`) at 0.32 | `landuse` `grass`,`grassland`,`meadow`,`village_green` | 1 | Keep light; ensure ordering grass < scrub < forest in visual weight | 8–17 | H |
| Wetland | Signature marsh pattern readable at a glance — for Kungsleden the single most navigation-relevant landcover | Flat tint 0.34, already stacked above wood/grass/scrub — visible but not instantly "wet" | `landuse` `wetland` only (no bog/marsh split); polygons overlap wooded/grassy ground | 1 (pattern: 2*) | Treat as a **semi-transparent overlay wash above the base fills** (§6.1), not a competing base fill: cooler tone, fill-opacity ≈ 0.3–0.45, fade in z10→12, so wet forest reads as both. The classic horizontal-dash marsh pattern needs `fill-pattern` → sprites; defer to the glyph/sprite iteration (*infrastructure, not data). Drop the dead `bog/marsh/swamp` filter values or keep as future-proofing — document either way | 10–17 | H |
| Marsh (as distinct class) | TF distinguishes marsh/bog nuances | Cannot — single `wetland` kind | — | 4 (3 with custom profile) | Not worth new data alone; fold into the §8.2 custom-profile wish list | — | M |
| Rock / bare rock | Exposed rock reads as grey, hostile, distinct from soil | `lt_rock` 0.28 grey (Nordic-only extra) | `landuse` `bare_rock` | 1 | Keep; raise slightly at z≥12, and give `lt_landcover` `barren` the same family so low-zoom massifs match | 8–17 | H |
| Scree | Stipple/texture under peaks | Filter exists, **zero features** — silent no-op | — | 4 (3 via custom profile incl. `natural=scree`) | Remove `scree` from the filter comment-honestly or leave harmless; real scree needs the custom profile | — | H |
| Bare ground / sand | Distinct dry-ground tone | `lt_sand` (`sand`,`beach`) — almost no features in corridor | `landuse` `beach` | 1 | Keep as-is; negligible here | 12–17 | H |
| Snow | White with subtle definition | No snow kind; glaciers cover the need | — | 4 | Treat as glacier/ice; do not fake | — | H |
| Glacier | Pale ice-blue with crisp outline — Kebnekaise reads instantly | `lt_ice` 0.92 pale, **no outline** | `landuse` `glacier` (+ `landcover` z≤7; + named `pois` `glacier`) | 1 | Add a thin cool outline line layer (new `lt_ice_outline`) so glacier tongues read against rock at z11–14 | 8–17 | H |

### 4.2 Water

| Category | TF principle | Nordic today | Source | Class | Recommended treatment | Zooms | Conf. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lakes | Calm, uniform, clearly bounded; biggest lakes visible from far out | `lt_water` one colour for ALL water polygons | `water` polygons `kind_detail=lake` | 1 | Keep current tone for lakes; they are the primary orientation anchors — add subtle darker edge only if cheap | 4–17 | H |
| Rivers (polygons) | Slightly distinct from lakes; continuity with line rivers | Same single colour | `water` polygons `kind_detail=river` | 1 | Marginally different value than lakes (same hue family) so braided deltas (Abisko) read as *flowing* water | 10–17 | M |
| Rivers (lines) | Clear width ramp; major rivers visible from mid zoom | `lt_waterway_river` from z11 (width ramp) | `water` lines `kind=river` | 1 | Start majors ~z9–10 with a gentler ramp — valley rivers are the spine of Kungsleden navigation | 9–17 | H |
| Streams | Appear late but *reliably*; every crossing visible at hut-decision zooms | `lt_waterway_stream` width 0.5 @ z13 | `water` lines `kind=stream` | 1 | Slightly earlier (z12) and marginally wider at z14+ — stream crossings are a safety-relevant feature | 12–17 | H |

### 4.3 Relief

| Category | TF principle | Nordic today | Source | Class | Recommended treatment | Zooms | Conf. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hillshade | Soft multidirectional shading gives instant valley/ridge comprehension without stealing contrast from lines | None | **No DEM in archive** | 3 | Terrain-RGB raster-dem PMTiles + MapLibre `hillshade` layer (§8.1), muted illumination so route colours keep dominance | 9–17 | M |
| Intermediate contours | Thin, low-contrast, appear ~z13+ | None | No contour data | 3 | Vector contour PMTiles (§8.1): 10 m interval z14+, thin warm grey | 13–17 | M |
| Index contours | Heavier every 50/100 m, labelled with elevation | None | No contour data | 3 | 50 m index, heavier line z12+; elevation labels only after glyphs ship | 12–17 | M |

### 4.4 Paths & roads

| Category | TF principle | Nordic today | Source | Class | Recommended treatment | Zooms | Conf. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Trails / footpaths | The hero line class: warm dashed treatment, readable on every terrain colour, earlier than other minor ways | `lt_trail(_casing)` z13+, cloudberry casing + light dash — already the strongest basemap line | `roads` `path/{path,footway,sidewalk,steps}` | 1 | Start z12 (over-zoom range is 14+ anyway); keep below the app route in weight — TF has no "active route" concept, Fjällkompis does, and the route must stay #1 | 12–17 | H |
| Official trail vs other footpath | TF differentiates via OSM attributes | No `sac_scale`/route relations in schema | — | 4 (2/3 later) | Skip. The Fjällkompis route line *is* the official-way marker; a generic path split without data would be fake precision | — | H |
| Tracks | Distinct double-line/dash grammar vs footpaths | `lt_road_track(_casing)` z12+ | `roads` `path/track`, `minor_road/service` | 1 | Keep; nudge casing contrast so track vs trail is legible at z13 | 12–17 | H |
| Minor roads | Present, never loud | `lt_road_minor(_casing)` | `roads` `minor_road/*` | 1 | Slightly de-emphasise at z12–14 (wilderness context: a gravel road matters less than a trail) | 10–17 | H |
| Major roads | Visible for orientation (E10), clearly not the point of the map | `lt_road_secondary_tertiary`, `lt_road_trunk_primary` warm fill | `roads` `major_road/*` | 1 | De-saturate the warm fill one step — Abisko's E10 currently outshines the trail network | 6–17 | H |
| Bridges | Emphasised — crossings are decisions | Folded into surface styles | `roads.is_bridge` (present!) | 1 | Add casing emphasis for `is_bridge=true` on trail/track classes (new `lt_trail_bridge` casing) — cheap, real navigation value | 13–17 | M |
| Rail | Understated but present | `lt_rail(+hatching)` | `roads` `rail` | 1 | Keep (Malmbanan is an Abisko orientation anchor) | 11–17 | H |

### 4.5 POIs & labels

All symbol/label work shares one gate: **the app ships no glyphs or sprites**
(offline-first decision; ROADMAP *Offline map labels* is the enabler).
Until that lands, every row below is *designed now, implemented after glyphs*.
Hut names already work today as local HTML markers — that mechanism stays
authoritative for huts.

| Category | TF principle | Nordic today | Source | Class | Recommended treatment | Zooms | Conf. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Huts & shelters | Prominent outdoor-POI icons early (z12+) | App-native HTML hut markers (better: curated, offline, interactive) | app data; OSM `pois` unreliable for huts (see §3.2) | 5 (keep app-native) | Do **not** duplicate huts from OSM POIs — two sources of truth would drift. Keep app markers #1 in the label hierarchy | 8+ | H |
| Peaks | Triangle + name + elevation from ~z12; ruthless prioritisation | Nothing | `pois` `peak` ×154 with `elevation` | 2 (after glyphs) | Highest-value new label class: name + elevation, thin out by elevation rank at z12–13, fuller by z14 | 12–17 | H |
| Passes | Named saddles marked | Nothing; no saddle kind in archive | — | 4 (3 via custom profile) | Defer; Tjäktja pass gets coverage via peak/valley names and the route itself | — | M |
| Outdoor POIs (camp, shelter, viewpoint) | Curated outdoor set, generic urban POIs suppressed | Nothing | `pois` (few: `camp_site`×3, `picnic_site`, …) | 2 (after glyphs) | Small whitelist only (`camp_site`, `picnic_site`, `rest_area`); suppress everything urban | 13–17 | M |
| Natural-place labels (valleys, areas) | Italic, terrain-toned, sparse | Nothing | `pois` `valley`, `earth`/`places` names | 2 (after glyphs) | Valley names at z11–13 are prime Kungsleden orientation (Tjäktjavagge!) — few, italic, never bold | 11–15 | M |
| Water labels | Lake/river names italic blue, early for large features | Nothing | `pois` `water` ×126 named; `water` polygons `name` | 2 (after glyphs) | Named lakes from z11 (they are THE landmark class of this route), rivers z12+ | 11–17 | H |
| Settlement labels | Restrained in wilderness; town > village > hamlet | Nothing | `places` `locality/{town,village,hamlet}` | 2 (after glyphs) | Abisko/Nikkaluokta from z8; hamlets z12+; never compete with hut markers | 8–17 | H |
| Label collision & density | Strong prioritisation; wilderness stays calm | n/a | n/a | 2 | Encode priority via `symbol-sort-key` + `text-padding`; budget: at z12 ≤ ~15 labels on a phone viewport in the corridor | all | M |

### 4.6 Cross-cutting

| Category | TF principle | Nordic today | Class | Recommendation | Conf. |
| --- | --- | --- | --- | --- | --- |
| Zoom-dependent detail | Progressive disclosure: masses → structure → detail; nothing pops in harshly | Mostly inherited from Liberty ramps; z7→z8 landcover handover visibly jumps | 1 | Explicit zoom plan (§6.4); smooth the `lt_landcover` → `lt_*` landuse handover | H |
| Basemap vs app overlays | n/a (TF has no app overlays) | Route/GPS/hut overlays always above basemap; Okabe–Ito stage colours | — | **Non-negotiable invariant**: every Phase gets validated against "route still dominates" (§7 validation criteria) | H |

## 5. Reproducibility estimate (honest, by category)

No single percentage — by mechanism and confidence:

- **Styling alone (Class 1) — high confidence:** landcover hierarchy among
  existing kinds (forest/scrub/grass/wetland/rock/glacier incl. outline),
  water hierarchy (lake vs river polygons, earlier rivers, reliable streams),
  path/track/road hierarchy incl. bridge emphasis and road de-emphasis,
  zoom-transition smoothing. This alone captures a large share of the
  *terrain readability* gap at z10–14 — data richness is NOT the bottleneck
  for these; the archive already contains what TF renders here.
- **Source-layer remapping (Class 2) — medium-high confidence, gated on the
  glyphs roadmap item:** peaks (+elevations), water names, settlement names,
  valley names, small outdoor-POI whitelist from the already-shipped `places`
  and `pois` layers. This is most of TF's *label prioritisation* value.
- **Additional free data (Class 3) — medium confidence:** contours and
  hillshade (§8.1) — TF's *relief treatment* is entirely data-driven and is
  the single biggest remaining experience gap after styling; heath and
  marsh/bog nuance via a custom tile build (§8.2).
- **Cannot / should not reproduce (Class 4/5):** pattern fills and icon
  textures before sprite infrastructure exists; heath/scree/pass data with
  the current archive; official-trail attribution (no data — and the app's
  route line already fills that role better); retina tiles (excluded by
  scope); Thunderforest's global data curation as such.

What drives the TF experience, attributed: **styling** (landcover/line
hierarchy — reproducible now), **data richness** (contours/DEM — §8.1;
heath — §8.2), **label prioritisation** (reproducible once glyphs ship),
**zoom behaviour** (reproducible now), **terrain modelling & curation**
(partially reproducible; not a goal in itself).

## 6. Proposed Nordic hierarchies

### 6.1 Terrain hierarchy — four rendering strata, not one flat ranking

Terrain readability is built from four distinct strata, bottom to top in the
MapLibre layer stack; a category's prominence comes from *which stratum it
lives in* as much as from its colour:

1. **Base landcover fills** (opaque-ish, mutually exclusive by data):
   background/open terrain → grassland/meadow → scrub → forest → rock →
   glacier. Visual weight among the fills, strongest → calmest: glacier &
   ice (bright, outlined — safety-relevant) · exposed rock · forest ·
   scrub/fjällbjörk belt (treeline signal) · grassland · open alpine
   background (deliberately the calmest — the stage, not an actor) ·
   built/artificial (minimal).
2. **Terrain overlays & patterns** (semi-transparent, rendered *above* the
   base fills so they combine with them instead of replacing them):
   **wetland lives here**, plus — when the data ships — hillshade and, as a
   future sprite-based iteration, marsh/scree pattern fills. See the wetland
   note below.
3. **Linework**: cliffs, contours (future), water lines, paths/tracks/roads,
   rail, boundaries — ordered per §6.2.
4. **Application overlays**: route, GPS, warnings, hut markers — always on
   top, never competed with.

**Wetland (high relevance, overlay treatment).** OSM wetland polygons in the
corridor overlap wooded and grassy ground (a birch bog is *both*), so a flat
mutually-exclusive ranking would force a false choice between "wetland
replaces forest" and "forest hides wetland". Instead `lt_wetland` is placed
**after** `lt_wood`/`lt_grass`/`lt_scrub` in layer order (it already is
today) and kept **semi-transparent** (fill-opacity ≈ 0.3–0.45), so where the
data overlaps, wetland reads as a cool wash *over* the underlying landcover:
a wet forest still looks forested, an open bog reads clearly against the
background. Its z-behaviour: fade in from z10, full strength by z12. When
sprite infrastructure lands, the flat wash is upgraded to the classic
horizontal-dash marsh pattern at the same stack position with the pattern's
own transparency — same principle, better glance value. Wetland must still
sit *below* all water polygons/lines (lakes cut through bogs) and below every
stratum-3/4 line.

### 6.2 Lines (top → bottom)

1. Active Fjällkompis route (selected stage + casing)
2. Navigation/warning overlays (GPS, trail breadcrumb, scrub point)
3. All-stages route lines / overview
4. Trails & footpaths (basemap)
5. Tracks
6. Streams/rivers (visually parallel to 4–5, never above the route)
7. Minor roads
8. Major roads (de-emphasised for this map's purpose)
9. Rail
10. Boundaries (weakest; country boundary excepted at low zoom)

### 6.3 Labels (after glyphs ship; hut markers are app-native and always #1)

1. Active app/navigation info (tracking status, off-route)
2. Hut & station markers (existing HTML markers)
3. Peaks (name + elevation) and major natural orientation points
4. Water bodies & rivers
5. Valley and natural-place names
6. Settlements
7. Whitelisted outdoor POIs
8. Everything else: suppressed by default, not merely down-ranked

### 6.4 Zoom plan

| Zoom | Terrain | Lines | Labels (future) | Must NOT appear |
| --- | --- | --- | --- | --- |
| 4–7 | landcover masses (forest/glacier/barren/grassland), lakes | country boundary, route overview | country/town | roads detail, buildings |
| 8–9 | + landuse takeover (smooth handover), rock, wetland masses, major rivers | + major roads (muted), rail | + Abisko/Nikkaluokta, largest lakes | minor roads, paths, POIs |
| 10–11 | full landcover incl. scrub/grass split, river polygons | + minor roads, hillshade (when available) | + valleys, big peaks, named lakes | buildings, generic POIs |
| 12–13 | + index contours (when available), glacier outlines | + trails/footpaths (12), tracks, streams (12) | + peaks w/ elevation (thinned), rivers | urban-POI noise |
| 14+ | + intermediate contours, full detail | + bridges emphasis, buildings (13+) | + full peak set, outdoor POIs, hamlets | anything competing with route/hut markers |

Guardrails encoded by this table: no visual noise at low zoom; terrain
context never disappears at medium zoom (the z7→z8 handover fix); no
general-purpose POI flood at high zoom; labels and contours always lose to
the active route and warning overlays.

## 7. Implementation plan (phased, style-layer exact)

All style work happens in `src/map/libertyTopoLayers.mjs`
(`NORDIC_TOPO_PALETTE` + builder) — one file, palette-driven, already fenced
by `tests/map-styles.test.mjs`. Layer ids below are the exact current ids.

### Phase 1 — Terrain hierarchy foundation (first restyle PR)

Style-only; zero data risk; online/offline identical by construction.

| Change | Layers touched |
| --- | --- |
| Forest presence up; align low-zoom tone | `lt_wood`, `lt_landcover` (match `forest` slot) |
| Wetland as a semi-transparent overlay wash above the base fills (tone + opacity ramp; layer position already correct) | `lt_wetland` |
| Rock slightly stronger, barren aligned | `lt_rock`, `lt_landcover` (`barren`) |
| Glacier outline added | **new** `lt_ice_outline` (line, after `lt_ice`) |
| Lake vs river polygon distinction | `lt_water` → split into `lt_water` (lake/other) + **new** `lt_water_river` (filter `kind_detail=river`) |
| Rivers earlier (z≥9–10), streams z≥12, width ramps | `lt_waterway_river`, `lt_waterway_stream` |
| Scrub separation from grass | `lt_scrub`, `lt_grass` |
| Open-terrain background tuning | `lt_background`, `lt_earth` |
| Smooth z7→z8 landcover handover | `lt_landcover` (+ opacity ramp) |
| Route dominance re-check | none (validation only) |

Validation criteria: at the eight §2 cameras — forest edge legible at z10–12;
wetland instantly identifiable at z12+ at Alesjaure; Kebnekaise glaciers
outlined at z11; braided delta at Abisko reads as river; **the selected stage
line remains the most salient element in every scene**; all
`tests/map-styles.test.mjs` invariants still pass (structure shared with the
Liberty palette where required, or the structural test consciously updated
for the new layers).

### Phase 2 — Landcover & relief refinement

Style-only, after Phase 1 feedback: scrub/heath-proxy tuning, grassland
nuance, bare-ground checks, glacier/snow tone iteration, zoom-transition
polish (`lt_*` opacity ramps), plus — **if §8.1 data ships** — the hillshade
(`raster-dem` source + `hillshade` layer under `lt_waterway_stream`) and
contour layers (**new** `lt_contour`, `lt_contour_index` between landcover
and water lines). Contours/hillshade must be tested against "contours never
overpower route or warning overlays" (muted colour, capped opacity).

### Phase 3 — Paths, labels & outdoor POIs

Trail/track/road hierarchy retune (`lt_trail*`, `lt_road_track*`,
`lt_road_minor*`, `lt_road_secondary_tertiary*`, `lt_road_trunk_primary*`),
bridge emphasis (**new** `lt_trail_bridge_casing`, filter `is_bridge`),
road de-emphasis; then — gated on the *Offline map labels* roadmap item
(local PBF glyphs) — the §6.3 label system: **new** symbol layers
`lt_label_peak`, `lt_label_water`, `lt_label_valley`, `lt_label_place`,
`lt_label_poi` on `pois`/`places`/`water` with `symbol-sort-key` priorities.
(The current no-symbol-layer test invariant will be *deliberately* revised in
that PR — it exists to protect offline reliability, which local glyphs
preserve.)

### Phase 4 — Optional free-data enrichment (only what styling cannot solve)

See §8. Ship order: (a) contours+hillshade, (b) custom tile profile for
heath/marsh/scree, (c) curated pass/POI micro-overlay if still needed.

### Recommended first-PR scope

Phase 1 exactly, as one PR: palette + the two new layers
(`lt_ice_outline`, `lt_water_river`), the zoom-ramp changes, updated
structural tests, before/after screenshots at the §2 cameras. No new data,
no new dependencies, no label work. Everything else follows in
Phase-numbered PRs.

## 8. Additional free data — assessment

### 8.1 Contours + hillshade (the one gap worth new data soon)

| Aspect | Assessment |
| --- | --- |
| Source | **Lantmäteriet Markhöjdmodell (national DEM)** — released as open data (CC0) — or **Copernicus GLO-30** (free, attribution required, global 30 m). Verify current licence terms at download time; both are offline-friendly |
| Products | (a) vector contours: `gdal_contour` 10 m/50 m → PMTiles (planetiler/tippecanoe); (b) hillshade: precomputed `gdaldem hillshade` raster PMTiles, or terrain-RGB raster-dem PMTiles + MapLibre's native `hillshade` layer (client-side, one archive serves future 3-D too) |
| Attribution | CC0: courtesy credit; Copernicus: required notice — both fit the existing registry pattern (`src/data/attribution.ts`) |
| Offline / PMTiles | Fully compatible — same blob-download + range-request model as the satellite archive; reuse `ArchiveSpec` |
| Coverage | Corridor bbox ≈ 120 × 75 km; z9–13 terrain-RGB or contour vectors |
| Storage | Rough order: terrain-RGB z≤12 ≈ 5–15 MB; contours ≈ 2–8 MB. Measure before committing (ROADMAP already conditions this item on size) |
| Pipeline | One repeatable, provenance-recorded script like `build-satellite-map.sh` (the unversioned AWS mirror rules out bit-for-bit reproducibility); GDAL already a documented project tool |
| Maintenance | Near-zero (terrain doesn't change) |
| Verdict | **Necessary** for the relief half of the benchmark — not merely decorative |

### 8.2 Custom Planetiler profile (heath, marsh/bog, scree, saddles)

Same OSM data, same ODbL attribution, but a **self-built tile profile**
instead of the stock Protomaps daily-planet extract. Adds `natural=heath`,
`natural=fell`, `wetland=bog/marsh/swamp` subclasses, `natural=scree`,
`natural=saddle`. Cost: owning a planetiler build pipeline (new build
complexity, ~same archive size) and schema drift risk vs `@protomaps/
basemaps` updates. Verdict: **desirable, not necessary** — do it only after
Phases 1–3 prove insufficient, as its own decision.

### 8.3 Explicitly rejected

- Any Thunderforest-derived data or bulk tile use (licence + project fence).
- Lantmäteriet orthophotos: already tracked separately in ROADMAP (Blocked).
- Global POI datasets: contradict the curated-stops model.

## 9. Unresolved risks & decisions for review

1. **Quota / key exposure**: the deployed app necessarily exposes the API key
   in tile URLs (and Referer information may be visible to Thunderforest); a
   stranger can consume the free-tier quota. Available controls: quota
   monitoring in the Thunderforest dashboard, the `VITE_ENABLE_MAP_BENCHMARK`
   flag keeping the deployment temporary and one variable away from off, and
   key rotation/removal afterwards. Thunderforest's public docs do not
   clearly document a user-configurable allowed-origin restriction — use one
   only if the dashboard actually offers it. Accept this, or keep the key
   out of production (dev-only usage) — owner decision.
2. **Wetland as a semi-transparent overlay above the base landcover fills**
   (§6.1) — a deliberate Kungsleden-specific emphasis (wetland decides where
   you can walk); review tone/opacity against field experience.
3. **Fjällkompis has no heath class** until §8.2 ships; grassland serves as
   proxy — acceptable for now?
4. **Label work is fully gated** on the Offline-map-labels roadmap item;
   Phase 3's label half cannot start before it.
5. The structural fairness test (Liberty ≙ Nordic layer parity) will need a
   documented exception once Phase 1 adds Nordic-only layers — same
   mechanism as today's `lt_rock`/`lt_cliff` gating, but worth a reviewer's
   yes.
