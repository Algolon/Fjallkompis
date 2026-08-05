# Vector overview coverage — measured evidence

Prerequisite for Map Refinement II PR 2. Vector basemap only; no camera code,
no raster/contour/satellite archive, no release pin.

## The defect

`mapCutoutBounds` is centred on the route, but the Web-Mercator tile grid is
not. The column holding the route's western end reaches far further west than
the eastern column reaches east, so the shipped archive was lopsided:

| source z | shipped footprint | west margin from route centre (18.6286) | east margin |
| --- | --- | --- | --- |
| z7 / z8 | 16.8750 – 19.6875 | 1.754° | **1.059°** |
| z9 / z10 | 17.5781 – 19.6875 | 1.051° | **1.059°** |

A horizontally balanced full-route overview needs the same margin on both
sides. The widest supported viewport — 1920×1080, map 1772 px after the
labelled rail, with PR #100's overview padding — needs **17.4065 … 19.8507**
(half-width 1.2221°). That is inside the western margin at every zoom and
**0.163° beyond the eastern one at every overview zoom, including z7 and z8**.

East is the binding side. (An earlier note that "z8's 313 km width is enough"
was a width-only comparison and did not account for where the route sits inside
the footprint.)

Which zooms matter: vector source zoom is `floor(mapZoom)`; the supported
overview set resolves to **z7 and z8** (measured 7.67–8.99). **z9** is included
because 1920×1080 lands at zoom 8.994 — six thousandths below the z8→z9
boundary, where the footprint used to narrow by 78 km.

## The change

`vectorOverview` in `scripts/route-configs.mjs`: `maxZoom: 9`,
`lonMarginDeg: 0.5`. `scripts/extract-offline-map.sh` now runs two disjoint
extracts from the **same** source build and merges them — z0–z9 from the
widened box, z10–z14 from the strict cutout corridor.

Source build pinned to **`20260709`**, the build the shipped archive came from
(recorded in its own metadata: `planetiler:osm:osmosisreplicationtime
2026-07-09T04:00:00Z`, `planetiler:version 0.10.2`, githash `0e5588c4a6e8…`).
Rebuild command:

```
bash scripts/extract-offline-map.sh 20260709 14 kungsleden
```

## Before → after

| | before | after |
| --- | --- | --- |
| bytes | 5,603,107 | 5,904,598 (**+301,491 = +294.4 kB**) |
| sha256 | `c1fc1c5e…` | `17d98946…` |
| addressed tiles | 9,054 | 9,065 (**+11**) |
| zoom range | z0–14 | z0–14 |
| header bounds | 17.8799,67.7081 – 19.3773,68.4931 | 17.3799,67.7081 – 19.8773,68.4931 |

### Footprint per zoom

| z | before x | after x | before lon | after lon | Δtiles |
| --- | --- | --- | --- | --- | --- |
| 0–6 | unchanged | unchanged | unchanged | unchanged | 0 |
| 7 | 70..70 | 70..**71** | 16.8750–19.6875 | 16.8750–**22.5000** | +1 |
| 8 | 140..141 | 140..**142** | 16.8750–19.6875 | 16.8750–**21.0938** | +2 |
| 9 | 281..283 | **280**..**284** | 17.5781–19.6875 | **16.8750**–**20.3906** | +8 |
| 10 | 562..567 | 562..567 | 17.5781–19.6875 | unchanged | 0 |
| 11 | 1125..1134 | 1125..1134 | 17.7539–19.5117 | unchanged | 0 |
| 12 | 2251..2268 | 2251..2268 | 17.8418–19.4238 | unchanged | 0 |
| 13 | 4502..4536 | 4502..4536 | 17.8418–19.3799 | unchanged | 0 |
| 14 | 9005..9073 | 9005..9073 | 17.8638–19.3799 | unchanged | 0 |

**y (latitude) ranges are identical at every zoom** — the widening is
longitude-only.

### The 11 added tiles

```
z7 : 71/30
z8 : 142/60  142/61
z9 : 280/120 280/121 280/122 280/123   (west)
     284/120 284/121 284/122 284/123   (east)
```

### Nothing pre-existing changed

Per-tile SHA-256 over every addressed tile in both archives:

- pre-existing tiles **missing** after the rebuild: **0**
- pre-existing tiles with **changed content**: **0**
- **z10+ : 9,030 tiles before, 9,030 after, byte-identical set**

That byte-identity is only possible because the rebuild pins the original
source build; a newer daily build would change the whole archive's OSM vintage.

### The added tiles are real MVT, not placeholders

| tile | gzip bytes | layers |
| --- | --- | --- |
| z7/71/30 *(new)* | 31,124 | boundaries, earth, landcover, landuse, places, pois, roads, water |
| z8/142/60 *(new)* | 28,901 | boundaries, earth, landuse, pois, roads, water |
| z8/142/61 *(new)* | 19,266 | earth, landuse, places, pois, roads, water |
| z9/284/121 *(new, east)* | 14,979 | boundaries, earth, landuse, roads, water |
| z9/280/122 *(new, west)* | 14,060 | boundaries, earth, landuse, water |
| z9/280/120 *(new, west)* | 69,627 | boundaries, earth, landuse, places, roads, water |
| z9/282/121 *(pre-existing, reference)* | 17,150 | earth, landuse, pois, roads, water |
| z8/141/60 *(pre-existing, reference)* | 27,599 | boundaries, earth, landuse, pois, roads, water |

`pmtiles verify` passes.

## Runtime, camera unchanged

Chrome for Testing, SwiftShader, dev server on the regenerated archive.

| viewport | markers | blank west px | zoom | archive HTTP | non-localhost requests | console errors |
| --- | --- | --- | --- | --- | --- | --- |
| 375×667 | 8 | 0 | 7.9838 | 206 | 1 | 0 |
| 1512×860 | 8 | 0 | 8.6956 | 206 | 1 | 0 |
| 1920×1080 | 8 | **0** *(was 180)* | 9.0631 | 206 | 1 | 0 |

All eight stop labels render unchanged (Abisko, Abiskojaure, Alesjaure,
Tjäktja, Sälka, Singi, Kebnekaise, Nikkaluokta). `lt_earth`,
`lt_boundary_country` and `route-overview` all present. Served by range request
(HTTP 206) from the same `public/maps/kungsleden.pmtiles` path, so the Cache
Storage identity and the Workbox range-request path are unchanged — no second
archive is created.

**The 1920×1080 blank western margin is already gone**, before any camera
change: at zoom 9.063 the vector source requests z9, which now reaches 16.8750.

## Why raster and contour archives were not touched

Terrain, contours and satellite are **not** the binding layer. Measured at
1512×860: the terrain source requests z10, whose footprint stops at 17.5781
(screen x 130.7), yet hillshade renders continuously to the map's west edge —
MapLibre serves raster from an ancestor tile when the child is absent. Vector
shows no such fallback, which is why it alone produced a visible blank. Those
archives are also release-pinned assets whose rebuild is explicitly out of
scope here.

## Provenance — verified intact

An earlier draft of this note claimed `pmtiles merge` had dropped the
planetiler metadata keys. **That was wrong**: it came from reading a
`pmtiles show` call that the build script truncated to 20 lines. The archive
retains its full provenance block, byte-checked at review:

```
planetiler:osm:osmosisreplicationtime  2026-07-09T04:00:00Z
planetiler:osm:osmosisreplicationseq   121149
planetiler:osm:osmosisreplicationurl   https://planet.osm.org/replication/hour/
planetiler:version                     0.10.2
planetiler:githash                     0e5588c4a6e8c29a270a33afe8df62027d889604
planetiler:buildtime                   2026-03-28T14:41:39.524Z
version                                4.14.10
```

Identical to the pre-PR archive's block — `pmtiles merge` preserves metadata
from its first input. The truncation in the script has been removed so the
block is visible on every future build, and the same values plus the exact
rebuild command are recorded in the header of
`scripts/extract-offline-map.sh`.

**Reproducibility, verified independently at review:** re-running

```
bash scripts/extract-offline-map.sh 20260709 14 kungsleden
```

in a clean worktree produced a file **byte-identical** to the committed
archive (5 904 598 bytes, sha256
`17d9894664aca247affa11d0a5b3e5763d0898a920f129d1f25f78a2e3fb1b51`).

`BUILD_DATE` is deliberately not defaulted to the pinned date: a rebuild should
be a conscious choice of OSM vintage, and Protomaps retains only some dailies.
