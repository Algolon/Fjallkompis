# Symmetric, zoom-aware full-route overview envelope — measured evidence

> Coverage conclusion superseded on 2026-08-11 by
> `../../2026-08-final-map-corrections/README.md`. This PR correctly fixed
> symmetric framing, but later physical Samsung testing disproved its raster
> ancestor-substitution assumption. Terrain v4 now supplies every requested
> overview child through source z11 and tightens to the corridor at z12.

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
- this pass modelled raster coverage as the widest ancestor footprint. That
  assumption was later disproved for raster-dem; current code instead uses
  physical coverage at the effective source zoom;
- contours cannot constrain the overview: every overview zoom measured is
  below 9.5, their style activation threshold.

### Hillshade is a HARD constraint (product decision, 2026-08-06)

An unshaded flank is **not** an acceptable trade for perfect route centring.
In Terrain mode the whole visible viewport must stay inside the renderable
hillshade footprint (16.8750–19.6875 lon, 67.6092–68.6566 lat).

Raster runs 1.7536° west of the route centre but only 1.0589° east, so a
landscape viewport wide enough for the whole route **cannot** be centred on it
and stay shaded. The camera is therefore solved as a **constrained fit**:

1. the desired symmetric route-centred viewport;
2. the renderable envelope for the active mode;
3. when the desired viewport overhangs a raster edge, **translate** it back
   inside at unchanged zoom — clamping the centre into
   `[envWest + halfWidth, envEast − halfWidth]`, which IS the feasible centre
   closest to the desired one;
4. only when the viewport is wider than the envelope itself is the **zoom
   raised**, and then the route over-fills vertically.

Route centring became a preference; hillshade coverage is the guarantee.

#### Re-run feasibility, hillshade binding

| viewport | container | view width | envelope | fits by translation? | translation |
| --- | --- | --- | --- | --- | --- |
| 1366×768 | 1218×768 | 273.2 km | 313.1 km | ✅ | 83.4 px W |
| 1512×860 | 1364×860 | 269.8 km | 313.1 km | ✅ | 86.0 px W |
| 1512×872 *(MacBook)* | 1364×872 | 265.7 km | 313.1 km | ✅ | 76.8 px W |
| 1536×864 | 1388×864 | 273.1 km | 313.1 km | ✅ | 94.9 px W |
| 1920×1080 | 1772×1080 | 273.2 km | 313.1 km | ✅ | 121.4 px W |
| 2560×1080 | 2412×1080 | 371.9 km | 313.1 km | ❌ zoom raised | — |
| 3440×1440 | 3292×1440 | 373.0 km | 313.1 km | ❌ zoom raised | — |

**No geometric conflict through 1920×1080**: complete route + labels, whole
viewport inside hillshade, and the existing overview padding all coexist.

#### Smallest achievable centre deviation (supported landscape)

The route box sits this far east of the padded-rect centre — the minimum
compatible with continuous hillshade:

| viewport | deviation |
| --- | --- |
| 1024×768 · 768×1024 · all portrait | **0 px** |
| 760×500 / 1280×800 / 1440×900 | 14.7 / 15.9 / 19.3 px |
| 1512×872 *(MacBook)* | 76.8 px |
| 1366×768 / 1512×860 / 1536×864 | 83.5 / 86.0 / 94.9 px |
| 1920×1080 | 121.4 px |

#### Ultrawide — vertical overfill, explicitly incomplete

| viewport | zoom raised | route outside viewport |
| --- | --- | --- |
| 2560×1080 | 9.236 (+0.25) | top 23.7 px, bottom 81.7 px |
| 3440×1440 | 9.685 (+0.25) | top 59.9 px, bottom 117.9 px |

The model reports `routeComplete: false` and lists `endpointsOutside`, so an
ultrawide overview is never described as a complete route fit.

## Before → after — Terrain mode

Fresh mount per viewport, DPR 2. `uncovered` is how far the visible viewport
overhangs the active mode's renderable raster envelope — **it must be zero**.

| viewport | container | before T/B | after T/B | centre dev | **uncovered** | blank | zoom / src | endLbl | moves | err |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 320x568 | 320×512 | 83.2 / 29.2 | **83.2 / 29.2** | 0 px | **0 px** | 0 px | 7.667 / z7 | 16.7 | 1 | 0 |
| 360x800 | 360×744 | 125.4 / 121.6 | **163.6 / 109.6** | 0 px | **0 px** | 0 px | 7.9041 / z7 | 16.7 | 1 | 0 |
| 375x667 | 375×611 | 83.7 / 29.7 | **83.7 / 29.7** | 0 px | **0 px** | 0 px | 7.9838 / z7 | 16.7 | 1 | 0 |
| 390x844 | 390×788 | 132.8 / 128.8 | **158.8 / 104.8** | 0 px | **0 px** | 0 px | 8.0594 / z8 | 16.7 | 1 | 0 |
| 412x915 | 412×859 | 144.7 / 140.4 | **174.7 / 120.7** | 0 px | **0 px** | 0 px | 8.1635 / z8 | 16.7 | 1 | 0 |
| 430x932 | 430×876 | 141.8 / 138.5 | **167.1 / 113.1** | 0 px | **0 px** | 0 px | 8.2434 / z8 | 16.7 | 1 | 0 |
| 760x500 | 676×500 | 65.1 / 10.8 | **66 / 12** | 14.7 px | **0 px** | 0 px | 7.746 / z7 | 31.2 | 1 | 0 |
| 768x1024 | 684×1024 | 66 / 12 | **66 / 12** | 0 px | **0 px** | 0 px | 8.9106 / z8 | 31.4 | 1 | 0 |
| 1024x768 | 940×768 | 70 / 12 | **70 / 12** | 0 px | **0 px** | 0 px | 8.447 / z8 | 35.3 | 1 | 0 |
| 1280x800 | 1132×800 | 70 / 12 | **70 / 12** | 15.9 px | **0 px** | 0 px | 8.5128 / z8 | 35.3 | 1 | 0 |
| 1366x768 | 1218×768 | 53.2 / -7.9 | **70 / 12** | 83.5 px | **0 px** | 0 px | 8.447 / z8 | 35.3 | 1 | 0 |
| 1440x900 | 1292×900 | 70 / 12 | **70 / 12** | 19.3 px | **0 px** | 0 px | 8.7009 / z8 | 35.4 | 1 | 0 |
| 1512x860 | 1364×860 | 52.9 / -7.9 | **70 / 12** | 86 px | **0 px** | 0 px | 8.6286 / z8 | 35.4 | 1 | 0 |
| 1512x872 | 1364×872 | — | **70 / 12** | 76.8 px | **0 px** | 0 px | 8.6506 / z8 | 35.4 | 1 | 0 |
| 1536x864 | 1388×864 | 50.7 / -10.4 | **70 / 12** | 94.9 px | **0 px** | 0 px | 8.636 / z8 | 35.4 | 1 | 0 |
| 1920x1080 | 1772×1080 | 44.8 / -16.3 | **70 / 12** | 121.4 px | **0 px** | 0 px | 8.9878 / z8 | 35.5 | 1 | 0 |
| 2560x1080 | 2412×1080 | -25.4 / -95.2 | **-23.7 / -81.7** | 297.9 px | **0 px** | 0 px | 9.236 / z9 | -58.1 | 1 | 0 |
| 3440x1440 | 3292×1440 | -64.4 / -134.4 | **-59.9 / -117.9** | 406.6 px | **0 px** | 0 px | 9.6847 / z9 | -94.1 | 1 | 0 |

## One shared overview path

Every full-route action goes through `applyOverviewCamera()` — initial camera,
imperative `Fit route`, and the **stage → full-route return**. `fitBounds` has
lost its `'overview'` mode entirely, so no bounds-fit can frame the whole route
by accident; stages and focused content keep it unchanged.

Measured (`stage-transition.json`, `capture-stage-transition.mjs`):

| | 1512×860 | 1920×1080 |
| --- | --- | --- |
| mount camera | 18.475894, 68.121213 z8.6286 | 18.460457, 68.116981 z8.9878 |
| after stage → full route | **identical** | **identical** |
| after explicit Fit route | **identical** | **identical** |
| camera moves for the return | **1** | **1** |
| visible extent inside hillshade | ✅ | ✅ |
| console errors | 0 | 0 |

The return had to widen `maxBounds` **unconditionally**: coming back from stage
mode the camera is zoomed in, so the strict interaction bounds are active, and
widening only "if currently expanded" let MapLibre clamp the target — measured
at 1512×860 as centre 18.6286 / zoom 9.4693 instead of 18.4759 / 8.6286. Fenced
by a regression test.

## Mode awareness — measured independently

Coverage comes from the **selected imagery**, not from whichever archive
resolved first (with both present, Satellite overviews used to solve as
Terrain).

| mode | viewports | uncovered px | notes |
| --- | --- | --- | --- |
| Terrain | all 18 | **0** | hillshade envelope 16.8750–19.6875 |
| Satellite | 375×667, 1024×768, 1366×768, 1512×860, 1920×1080, 2560×1080 | **0** | identical framing; same footprint today, derived separately |
| vector-only | unit-tested | n/a | wider envelope, sits closer to the route centre |

Toggling imagery issues no explicit fit/recentre command. Current code does
reapply physical maxBounds immediately, leaving an already-valid camera where
it is while preventing Terrain from entering uncovered z12 ground.

### Acceptance

Supported viewports (through 1920×1080):

| criterion | result |
| --- | --- |
| zero pixels outside renderable hillshade | ✅ **0 px**, every viewport |
| no visible loss of relief at any edge | ✅ visible east edge lands exactly on 19.6875 |
| complete route line visible | ✅ |
| Abisko + Nikkaluokta glyphs and labels visible | ✅ worst label clearance 35.4 px |
| ≥ 12 px route clearance top and bottom | ✅ exactly 70 / 12 on every landscape shape |
| ≥ 8 px endpoint-label clearance | ✅ 35.4 px |
| zero blank vector pixels | ✅ 0 px |
| one camera move | ✅ 1 |
| zero console errors | ✅ 0 |
| centre deviation minimised and measured | ✅ 0–121.4 px, see above |
| portrait preserves PR #100 and PR #111 | ✅ 0 px deviation, unchanged framing |

Ultrawide (> ~2:1):

| criterion | result |
| --- | --- |
| continuous hillshade | ✅ 0 unshaded px; viewport exactly fills the envelope |
| never expose an unshaded flank | ✅ |
| vertical route overfill acceptable | ✅ recorded per endpoint |
| endpoints outside recorded | ✅ 2560×1080 top 23.7 / bottom 81.7 px; 3440×1440 top 59.9 / bottom 117.9 px |
| Fit route stable and predictable | ✅ identical to the initial camera |
| no camera loop or repeated clamping | ✅ 1 settled move |
| not described as a complete fit | ✅ `routeComplete: false` |

### Mode awareness

| mode | envelope | verified |
| --- | --- | --- |
| Terrain | physical per-source coverage (v4 correction) | ✅ current tests enumerate every required child |
| Satellite | satellite renderable, derived independently | ✅ camera obeys it (unit) |
| vector-only fallback | vector overview footprint | ✅ sits closer to the route centre, route complete |

## Files

- `capture-framing.mjs` — the harness (reproduce instructions in its header)
- `before-measurements.json`, `after-measurements.json` — full per-viewport records
- `archive-footprints.json` — probed per-zoom footprints of all four archives
- `before-<viewport>.png`, `after-<viewport>.png`
