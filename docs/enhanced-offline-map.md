# Enhanced offline map — technical investigation

Status: **investigation only.** No terrain or glyph assets are generated or
committed yet. This document sets the direction and a phased plan; each phase
lands behind its own decision and its own optional download.

## Goal

Make the in-app map a genuinely useful **offline topographic** map for route
awareness and orientation — not just the route line with a few labels. The
target end state combines:

- **general offline labels** rendered from **locally hosted glyphs** (no remote
  fonts); and
- **terrain context** via **contours and/or hillshade**.

These are separate technical capabilities but may be presented as one
user-facing **"Enhanced offline map"** download.

Guardrails (unchanged):

- The existing lightweight vector PMTiles basemap (`kungsleden.pmtiles`, ~3.5
  MB) remains the **dependable default/fallback** and stays small.
- The enhanced topographic layers are an **optional** download, so the mandatory
  app/basemap size does not grow.
- **No remote runtime map, font, glyph or terrain dependencies.** Everything is
  produced at build time and served from local Cache Storage, exactly like the
  current basemap.
- Still **not** primary navigation — a real offline nav device, paper map and
  compass are carried — but "not primary" must not cap how useful the in-app
  map becomes.

---

## 1. Data sources and licences

### Terrain / elevation

The route sits at **~67.8–68.4°N**. This rules out **SRTM** (coverage ends at
60°N) — a common default that would silently produce empty terrain here. Viable
sources:

| Source | Res. | Coverage | Licence | Notes |
| --- | --- | --- | --- | --- |
| **Lantmäteriet — Nationell höjdmodell** (SE national elevation) | 1–2 m grid | Sweden | Open data (CC0-style; **verify current terms + attribution at use**) | Best quality for this region; national agency; ideal for crisp contours. Large source rasters — downsample for tiling. |
| **Copernicus DEM GLO-30** (ESA) | 30 m | Global to 84°N | Free, attribution "© ESA / Copernicus" | Covers 68°N (unlike SRTM); solid for hillshade and coarse contours. |
| **ASTER GDEM v3** | ~30 m | to 83°N | Free, attribution (METI/NASA) | Fallback; noisier than Copernicus. |

Recommendation: prototype contours from **Copernicus GLO-30** (simple, global,
known licence), and evaluate **Lantmäteriet** for the production extract where
its resolution materially improves readability. Confirm the exact Lantmäteriet
licence and attribution string at implementation time — do not assume.

### Labels

The current basemap is **OSM-derived via Protomaps** (ODbL, already attributed).
Protomaps `basemaps` vector tiles already carry `name` fields for places, water
and some natural features — so **general labels are largely a rendering
problem, not a new data download**: what is missing is the **glyph (SDF font)
PBFs** the style needs, which we currently omit to stay offline.

- **Fonts:** self-host glyph PBF ranges generated from an openly licensed font —
  e.g. **Noto Sans** (SIL OFL) or **DejaVu/Bitstream Vera** — covering Latin +
  the Nordic/Sámi diacritics used locally. Generated once at build time with
  `fontnik`/`font-maker` and served locally. Small (see §2).

So "labels" may need **no new tile archive at all** — only local glyphs plus a
styled label layer over the existing (or a slightly richer) base extract.

---

## 2. Estimated download sizes (bounded Kungsleden region)

Region = current `mapCutoutBounds` `[[18.0244, 67.762], [19.2328, 68.4392]]`
≈ **50 km × 75 km ≈ 3,800 km²** (route bounds + ~9 km buffer).

Estimates are **order-of-magnitude**, dominated by **max zoom**, and must be
measured on the real extract before committing to a download budget:

| Layer | Approach | Rough size | Driver |
| --- | --- | --- | --- |
| Glyphs | Noto Sans, Latin + Nordic ranges, 1–2 weights | **~1–3 MB** | number of codepoint ranges/fonts |
| Contours (vector PMTiles) | `gdal_contour` → GeoJSON → `tippecanoe` → PMTiles, 25 m interval, simplified, ≤ z14 | **~10–25 MB** | interval + maxzoom + simplification |
| Hillshade (terrain-RGB raster PMTiles, MapLibre computes shading) | Terrarium/Mapbox-RGB tiles | **~15 MB @ z12 … ~200+ MB @ z14** | **maxzoom** (grows ~4×/level) |
| Hillshade (pre-baked grayscale raster, webp/jpeg) | `gdaldem hillshade` → tiles | ~½–⅓ of terrain-RGB at same zoom | maxzoom, codec |

Key takeaways: **contours are the best orientation value per MB**; **raster
hillshade cost is dominated by maxzoom** and is why the enhanced map must be
optional and zoom-capped (z12–13 is plenty for relief). Glyphs are cheap enough
to ship in the app precache if desired.

---

## 3. Contours vs hillshade

| | Contours (vector) | Hillshade (raster) |
| --- | --- | --- |
| Reads | precise elevation, pass/valley shape, printable-style | intuitive relief "shape" at a glance |
| Zoom | crisp at any zoom (vector) | can blur when overzoomed |
| Storage | smaller | larger (esp. terrain-RGB to high zoom) |
| Render cost | line-heavy at high zoom (mitigate: zoom-dependent intervals, simplify, cap maxzoom) | terrain-RGB → per-tile decode + GPU hillshade compute (heavier on low-end Android); pre-baked raster is cheap to draw |
| Orientation value | high for reading terrain deliberately | high for fast situational awareness |

Best UX is **both** (hillshade underlay + contour lines). For an offline,
size-constrained, battery-conscious app the highest value-per-MB first step is
**contours**, with hillshade as an optional add-on. This matches the stated
preference to do **terrain/contours first**.

---

## 4. One archive or several?

- **PMTiles holds one tile type per archive**, so **vector contours** and
  **raster hillshade/terrain-RGB must be separate archives** regardless.
- **Glyphs** are not tiles — separate small static assets.
- Keeping contours and hillshade as **separate optional archives** also gives
  independent update/removal and lets a user take contours without the heavier
  raster.

Recommendation: **base vector PMTiles (mandatory, unchanged)** + **contours
PMTiles (optional)** + **terrain-RGB/hillshade PMTiles (optional)** + **local
glyphs (small, app-precached)**. Present them together as one **"Enhanced
offline map"** card with per-capability toggles, but store/manage them as
distinct caches.

---

## 5. Offline download / update / removal

Reuse the proven pattern in `src/map/offlineMap.ts` + `OfflineMapCard.tsx`:

- one **dedicated Cache Storage cache per archive** (e.g.
  `fjallkompis-contours-v1`, `fjallkompis-terrain-v1`), separate from the app
  shell and from the base map;
- each stored as a single full `200` response; read via the blob-backed PMTiles
  source, with the service-worker `RangeRequestsPlugin` as belt-and-braces
  (mirror the existing `runtimeCaching` rule per archive);
- **versioning** via filename/date + a small manifest so "update available" is
  detectable and a stale archive can be replaced (needs-update state);
- **removal** deletes just that cache; base map and route are untouched;
- surface **size before download** and clear stored/需要-update states, exactly
  like the current offline-map card.

---

## 6. Android / mobile performance & storage

- **Rendering:** extra vector line layers (contours) and a raster hillshade add
  GPU/CPU load. Mitigations: cap maxzoom (z12–13), zoom-dependent contour
  intervals (e.g. only 100 m index contours below ~z12, add 25 m above),
  `tippecanoe` simplification, and keep the enhanced layers **off by default**.
- **terrain-RGB hillshade** decodes tiles and computes shading on-device —
  noticeably heavier on low-end Android than a **pre-baked** grayscale raster.
  If hillshade ships, prefer pre-baked unless dynamic light direction is worth
  the cost.
- **Storage:** tens of MB, optional and explicit; show sizes, require a tap, and
  tolerate Cache Storage eviction (re-downloadable). Never make it mandatory.
- **Battery:** more layers = more draw cost; default remains the light basemap.

---

## 7. Recommended phased order

Investigation preference confirmed: **terrain/contours first** (route + huts
already have local labels), **then** general labels.

- **Phase 1 — this document.** Options, licences, size method, plan. No assets.
- **Phase 2 — Code-split MapScreen/MapLibre** (small, independent) so the ~1 MB
  MapLibre payload leaves first paint before we add map features. Prerequisite
  cleanup, not part of the terrain data work.
- **Phase 3 — Contours (optional download).** Build-time pipeline
  (Copernicus/Lantmäteriet → `gdal_contour` → `tippecanoe` → PMTiles), a new
  optional-download card, styled contour + label(elevation) layers. Measure real
  size; set interval/maxzoom from that.
- **Phase 4 — Hillshade (optional add-on).** Separate raster archive; evaluate
  terrain-RGB vs pre-baked on real devices; ship the cheaper acceptable option.
- **Phase 5 — General labels via local glyphs.** Self-hosted glyph PBFs +
  styled label layers from the existing OSM vector tiles; verify the base
  extract carries the needed `name` fields (extend the extract if not).
- Phases 3–5 are surfaced to the user as one **"Enhanced offline map"** with
  independent toggles/caches under the hood.

Each phase: no remote runtime dependencies; assets generated by a committed,
documented build script (like `scripts/extract-offline-map.sh`); large binaries
are **downloaded by the user at runtime**, not committed to the repo.
