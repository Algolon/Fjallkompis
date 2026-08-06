# Symmetric, zoom-aware full-route overview envelope — measured evidence

Map Refinement II PR 2. Camera framing only: no archive bytes, revision or
caches; no Settings, service worker, route data, active-trail architecture,
scope selector, Map controls, locate or tracking.

## The defect

`overviewEnvelope()` capped the overview to the **z7 tile cell** around the
data bounds. That cell is **1.7536° west** of the route centre but only
**1.0589° east** — the Web-Mercator tile grid is not centred on the route.

A landscape container showing the whole route needs a view far wider than the
route itself (86 km wide against 154 km tall), so wide viewports were clamped
on the **east edge alone**. maxBounds came out both narrower than the fit
needed and off-centre; MapLibre zoomed in to obey it, which pushed the route
east and drove its southern end past the bottom of the viewport.

Reproduced exactly, on a fresh mount per viewport:

| symptom | measured before |
| --- | --- |
| bottom clipping, 1366×768 and 1512×860 | **−7.9 px** |
| bottom clipping, 1536×864 / 1920×1080 | −10.4 px / −16.3 px |
| route centre pushed east, 1920×1080 | **+94.2 px** |
| 2560×1080 / 3440×1440 | −95.2 / −134.4 px, +301.7 / +411.8 px east |

The attached MacBook screenshot is the **1512×860** class (map container
1364×860): `before-1512x860.png` matches it landmark for landmark — Singi's
marker clipped at the bottom edge, Nikkaluokta's marker cut off, the same
empty western margin.

## The corrected coverage model

Measured from the merged production archives, not assumed
(`archive-footprints.json`, probed tile by tile):

| source zoom | vector lon footprint | vector lat footprint |
| --- | --- | --- |
| z7 | 16.8750–22.5000 | 67.6092–68.6566 |
| z8 | 16.8750–21.0938 | 67.6092–68.6566 |
| z9 | 16.8750–20.3906 | 67.6092–68.6566 |
| z10+ | 17.5781–19.6875 (strict corridor, unchanged) | 67.6092–68.5282 |

Terrain, contours and satellite all measure 16.8750–19.6875 at z7–z9.

**Symmetric half-width available about the route centre**: 195.2 km at z7, z8
*and* z9 (west binds at 16.8750 in all three), 116.9 km at z10. Every overview
resolves to z7–z9, so the budget is flat across the whole overview range.

### Feasibility, repeated against the merged archives

Every supported viewport fits, with margin:

- worst horizontal slack **59.4 km**
- worst south slack **32.5 km**, worst north slack **37.5 km**
- both best-effort ultrawide shapes fit too (10.4 km and 9.5 km slack)

## The algorithm

`src/map/overviewEnvelope.mjs` keeps five extents explicitly apart: route
bounds, strict interaction bounds, the **desired** route-centred overview,
**physical vector coverage** at the effective source zoom, and **renderable
raster coverage**. Nothing is hard-coded to a device: everything derives from
route bounds, container size, the existing overview padding, and probed
coverage.

- the desired extent is symmetric about the composition centre — the route
  centre horizontally, the padded rect's centre vertically;
- the cap is applied **symmetrically**: if one side runs out of data the other
  gives up the same amount, so the envelope can shrink but never go lopsided;
- the source zoom is `floor(mapZoom)` of the **fit**, not the live camera, so
  maxBounds is constant for a viewport shape and cannot move under the camera;
- raster coverage is modelled as the widest **ancestor** footprint (MapLibre
  falls back to a parent raster tile), reported, and never used as a cap;
- contours cannot constrain the overview: every overview zoom measured is
  below 9.5, their style activation threshold.

### The one accepted trade

A symmetric composition on wide landscape reaches past terrain/satellite's
east edge (19.6875). Those pixels lose **hillshade, not map** — vector still
draws water, landcover, roads and labels, and blank-vector measures **0 px
everywhere**:

| viewport | unshaded east flank |
| --- | --- |
| every phone, tablet portrait | **0 px** |
| 1280×800 / 1440×900 | 16 / 19 px |
| 1366×768 / 1512×860 / 1536×864 | 83 / 86 / 95 px |
| 1920×1080 | 121 px |
| 2560×1080 / 3440×1440 | 441 / 606 px |

Capping on raster instead would crop the route by more than half its height on
a 21:9 display, so vector binds. Flagged for review rather than hidden.

## Before → after

Fresh mount per viewport, DPR 2, dev server on the merged archives.
`clearance T/B` is the route box's distance to the container edge;
`dev.x` is the route centre's offset from the padded-rect centre;
`endLbl` is the worst Abisko/Nikkaluokta label clearance.

| viewport | map container | before T/B | before dev.x | before endLbl | after T/B | after dev.x | after endLbl | zoom / src | blank | moves | errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 320x568 | 320×512 | 83.2 / 29.2 | 0 | 16.7 | **83.2 / 29.2** | 0 | 16.7 | 7.667 / z7 | 0 | 1 | 0 |
| 360x800 | 360×744 | 125.4 / 121.6 | 0 | 9.4 | **163.6 / 109.6** | 0 | 16.7 | 7.9041 / z7 | 0 | 1 | 0 |
| 375x667 | 375×611 | 83.7 / 29.7 | 0 | 16.7 | **83.7 / 29.7** | 0 | 16.7 | 7.9838 / z7 | 0 | 1 | 0 |
| 390x844 | 390×788 | 132.8 / 128.8 | 0 | 16.2 | **158.8 / 104.8** | 0 | 16.7 | 8.0594 / z8 | 0 | 1 | 0 |
| 412x915 | 412×859 | 144.7 / 140.4 | 0 | 13.9 | **174.7 / 120.7** | 0 | 16.7 | 8.1635 / z8 | 0 | 1 | 0 |
| 430x932 | 430×876 | 141.8 / 138.5 | 0 | 16.7 | **167.1 / 113.1** | 0 | 16.7 | 8.2434 / z8 | 0 | 1 | 0 |
| 760x500 | 676×500 | 65.1 / 10.8 | 18.6 | 30.3 | **66 / 12** | 0 | 31.2 | 7.746 / z7 | 0 | 1 | 0 |
| 768x1024 | 684×1024 | 66 / 12 | 0 | 31.4 | **66 / 12** | 0 | 31.4 | 8.9106 / z8 | 0 | 1 | 0 |
| 1024x768 | 940×768 | 70 / 12 | 0 | 35.3 | **70 / 12** | 0 | 35.3 | 8.447 / z8 | 0 | 1 | 0 |
| 1280x800 | 1132×800 | 70 / 12 | 25.3 | 35.3 | **70 / 12** | 0 | 35.3 | 8.5128 / z8 | 0 | 1 | 0 |
| 1366x768 | 1218×768 | 53.2 / -7.9 | 64.7 | 18.3 | **70 / 12** | 0 | 35.3 | 8.447 / z8 | 0 | 1 | 0 |
| 1440x900 | 1292×900 | 70 / 12 | 30 | 35.4 | **70 / 12** | 0 | 35.4 | 8.7009 / z8 | 0 | 1 | 0 |
| 1512x860 | 1364×860 | 52.9 / -7.9 | 68.2 | 18.2 | **70 / 12** | 0 | 35.4 | 8.6286 / z8 | 0 | 1 | 0 |
| 1536x864 | 1388×864 | 50.7 / -10.4 | 73.6 | 16.1 | **70 / 12** | 0 | 35.4 | 8.636 / z8 | 0 | 1 | 0 |
| 1920x1080 | 1772×1080 | 44.8 / -16.3 | 94.2 | 10.3 | **70 / 12** | 0 | 35.5 | 8.9878 / z8 | 0 | 1 | 0 |
| 2560x1080 | 2412×1080 | -25.4 / -95.2 | 301.7 | -61.6 | **70 / 12** | 0 | 35.5 | 8.9878 / z8 | 0 | 1 | 0 |
| 3440x1440 | 3292×1440 | -64.4 / -134.4 | 411.8 | -98.6 | **70 / 12** | 0 | 35.6 | 9.4322 / z9 | 0 | 1 | 0 |

fitRoute matches initial camera on every viewport: true
all after bottom clearances >= 12: true
all after |dev.x| <= 8: true
all after endpoint label clearance >= 8: true
all after blank px == 0: true
all after moves == 1: true

Every viewport after the change: **route clearance exactly the padding**
(70/12, or the width-bound equivalent), **dev.x = 0**, **blank 0 px**,
**one settled camera move**, **zero console errors**, and the explicit
`Fit route` action lands on the identical camera as the initial fit.

### Acceptance

| criterion | result |
| --- | --- |
| MacBook / 1512×860 / 1536×864: complete route | ✅ |
| Abisko + Nikkaluokta glyphs and labels fully visible | ✅ (worst label clearance 35.4 px) |
| ≥ 12 px route clearance top and bottom | ✅ exactly 70 / 12 |
| ≥ 8 px endpoint-label clearance | ✅ 35.4 px |
| route centre within 8 px of the padded centre | ✅ 0.0 px |
| no blank vector region | ✅ 0 px, every viewport |
| one stable camera, zero console errors | ✅ 1 move, 0 errors |
| 1366×768 bottom clipping removed | ✅ −7.9 px → +12 px |
| 1920×1080 complete, stable at z8 or z9 | ✅ complete; z8 and z9 share the same 195.2 km symmetric budget |
| portrait: PR #100 results preserved | ✅ strict east/west bounds kept; 320×568 and 375×667 byte-identical framing |
| ultrawide | ✅ better than best-effort — both frame the complete route |

## Files

- `capture-framing.mjs` — the harness (reproduce instructions in its header)
- `before-measurements.json`, `after-measurements.json` — full per-viewport records
- `archive-footprints.json` — probed per-zoom footprints of all four archives
- `before-<viewport>.png`, `after-<viewport>.png`
