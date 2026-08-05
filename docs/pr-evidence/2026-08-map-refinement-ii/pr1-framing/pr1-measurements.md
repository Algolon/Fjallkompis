# PR 1 — full-route portrait framing contract: measured evidence

Base `ce41b7b` · branch `agent/map-refinement-ii-pr1-framing`.

Captured headlessly (Chrome for Testing, SwiftShader, `deviceScaleFactor 2`)
against the dev server at `#/map`, default **Full route** state, PWA install
nudge dismissed, camera settled. Machine-readable output: `pr1-measurements.json`.

Coordinates are **map-container** space. `map.project()` is already
container-relative; DOM rectangles are viewport-relative and were normalised by
the wrap origin. `map.getPadding()` is useless here — MapLibre does not persist
`fitBounds` padding on the transform — so both padding contracts are re-derived
with the same arithmetic the app uses.

**Before** figures come from the Map Refinement II Phase A capture at `55fa715`,
using the identical harness and conditions. `git diff 55fa715..ce41b7b` touches
no Map file (only `trailId` persistence from PR #98), so that capture is a
valid baseline for this change.

## What changed

1. `cameraConstraintsFor` derived the overview scale from the padded HEIGHT
   alone. Every phone-portrait viewport is width-bound, so the scale was
   underestimated by 3.3–43.6 %, no overview expansion was granted, and
   `maxBounds` clamped the requested fit.
2. The full-route fit used the operational padding, which charges the
   top-right control stack as a right inset for the whole viewport height
   (measured L16 / R70), and reserved no allowance for the centred marker
   labels. The route's westernmost vertex is a waypoint, so its label clipped.

## Portrait acceptance set

Δ = east clearance − west clearance. Tjäktja label/glyph = smallest clearance
to any container edge; negative means off-screen.

| Viewport | before W/E (Δ) | before tj label | before tj glyph | after W/E (Δ) | after tj label | after tj glyph | route clipped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 320×568 | 16 / 70 (**+54**) | **−1.6** | +3.8 | 48 / 48 (**0.0**) | **+30.4** | +35.8 | none |
| 375×667 | 16 / 70 (**+54**) | **−1.5** | +3.8 | 48 / 48 (**0.0**) | **+30.5** | +35.8 | none |
| 390×844 | 11.6 / 66.9 (**+55.3**) | **−5.9** | **−0.6** | 47.4 / 47.4 (**0.0**) | **+29.9** | +35.3 | none |
| 430×932 | 14.7 / 69 (**+54.3**) | **−2.8** | +2.6 | 48 / 48 (**0.0**) | **+30.5** | +35.9 | none |
| 360×800 *(Galaxy S class)* | — | — | — | 40.7 / 40.7 (**0.0**) | **+23.1** | +28.5 | none |
| 412×915 *(Pixel class)* | — | — | — | 45.1 / 45.1 (**0.0**) | **+27.7** | +33.0 | none |
| 360×1000 *(synthetic)* | −43.4 / 30.2 (+73.6) | −60.8 | −55.4 | 3.2 / 3.2 (0.0) | **−14.2** | **−8.9** | none *(was **W −43.4**)* |

Acceptance — complete route visible, no route geometry clipped, whole Tjäktja
glyph visible, Tjäktja label ≥ 8 px from the left edge, |Δ| ≤ 8 px, no second
camera move, navigation visible, zero overflow:

| Viewport | verdict |
| --- | --- |
| 320×568 · 375×667 · 390×844 · 430×932 · 360×800 · 412×915 | **PASS** |
| 360×1000 | **FAIL on label clearance** — see "Deferred" below |

`360×800` and `412×915` were added because `360×1000` is a synthetic worst case
invented for the Phase A audit, not a measured device. Every real phone shape
passes.

## Landscape regression set

PR 1 must not make landscape worse.

| Viewport | before W/E (Δ) | after W/E (Δ) | change | route clipped before → after | glyphs clipped before → after |
| --- | --- | --- | --- | --- | --- |
| 760×500 | 237.8 / 200.5 (−37.3) | 237.8 / 200.5 (−37.3) | **identical** | none → none | none → none |
| 768×1024 | 49.8 / 103.8 (+54.0) | 76.8 / 76.8 (**0.0**) | **improved** | none → none | none → none |
| 1024×768 | 254.2 / 301.2 (+47.0) | 277.7 / 277.7 (**0.0**) | **improved** | none → none | none → none |
| 1280×800 | 390 / 339.5 (−50.5) | 390 / 339.5 (−50.5) | **identical** | none → none | none → none |
| 1366×768 | 471.1 / 341.7 (−129.4) | 471.1 / 341.7 (−129.4) | **identical** | S −7.9 → S −7.9 | Singi −9.0, Nikkaluokta −9.2 → identical |
| 1440×900 | 446.6 / 386.7 (−59.9) | 446.6 / 386.7 (−59.9) | **identical** | none → none | none → none |
| 1512×860 | 521.7 / 385.3 (−136.4) | 521.7 / 385.3 (−136.4) | **identical** | S −7.9 → S −7.9 | Singi −7.6, Nikkaluokta −7.8 → identical |

The five "identical" rows are the viewports whose camera is governed by the
overview **envelope**, not by padding — `maxBounds` already binds there, so a
padding change cannot move them. That is why PR 1 neither helps nor harms them.

## Blank (uncovered) map margin

Scanned inward from each edge with `queryRenderedFeatures(..., {layers:['lt_earth']})`
until the basemap land polygon is hit.

| Viewport | W | E | N | S |
| --- | --- | --- | --- | --- |
| all 14 supported shapes above | **0** | **0** | **0** | **0** |
| 1920×1080 | 180 | 0 | 0 | 0 |

The 180 px at 1920×1080 is **unchanged** from the Phase A measurement — a
pre-existing envelope issue owned by PR 2, not a regression. No new blank area
appears anywhere.

## Contracts still holding

| Check | Result |
| --- | --- |
| Document / `<main>` overflow | **0 / 0 / 0** at every viewport |
| Navigation visible | yes at every viewport |
| Bearing / pitch | 0 / 0 everywhere (north-up) |
| Console errors | **0** at every viewport |
| Second corrective camera move | none — camera identical when re-sampled 1.2 s after settling, at every viewport |
| Markers occluded by the control stack | **none** at any viewport, despite the overview no longer reserving its width |

## Deferred to PR 2 (envelope), with proof

**1. `360×1000` cannot meet the label criterion at all today.** Not a padding
choice — a physical-coverage ceiling:

```
route                 86.3 km wide × 153.9 km tall (Mercator)
userBounds                          218.2 km tall
overviewEnvelope                    230.3 km tall   <- the hard ceiling
                                    (6.0 km of headroom per edge)
```

A width-bound fit at 360×1000 asks for a 308.5 km-tall view. The envelope
permits 230.3 km, so `maxBounds` clamps the scale to 244.0 m/px, at which the
route draws 353.6 px wide inside a 360 px viewport — leaving **3.2 px** per
side. No padding contract can produce 48 px there. The same arithmetic for real
phones: 360×800 → 40.7 px available, 412×915 → 45.1 px, 390×844 → 47.4 px
(which is exactly the 47.4 px measured), all comfortably above the ~25.9 px
Tjäktja's label needs.

PR 1 still removes the route-line clipping there (**−43.4 px → none**) and cuts
the label clip from −60.8 px to −14.2 px.

The vertical envelope is derived from the data bounds with no tile-grid
extension claimed. Making it zoom-aware (PR 2) should release the headroom this
shape needs, because the tile-aligned footprint at the z8 tiles it renders is
far larger than the declared bounds.

**2. Bottom route clipping of 7.9 px at 1366×768 and 1512×860**, with the
associated Singi / Nikkaluokta glyph clipping — byte-identical before and after.

**3. 180 px blank western margin at 1920×1080** and worse above it.

## Zoom-control collision — surfaced by the rebalance, and FIXED

The balanced overview narrowed the eastern clearance from 70 px to 48 px, which
put Nikkaluokta's label under MapLibre's bottom-right zoom control on narrow
fine-pointer layouts. Fixed by adding a second gate on the control, not by
touching the composition.

### Choosing the threshold — measured, not assumed

Sweep: fine pointer, marker glyph / label / route vertex intersecting the
control group, widths 320–1280 × heights 667 / 800 / 915 / 1000 / 1180
(`zoom-sweep.json`).

| map container width | 320 | 340 | 360 | 375 | 390 | 412 | 430 | 460 | 480 | 500 | 520 | 540 | 560 | **676+** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| collides at some height | y | y | y | y | y | y | y | y | y | y | y | y | y | **no** |

Two things the sweep settles:

- **375 px is not the boundary.** Collisions occur at every container width the
  compact layout can produce, up to and including 560 px. They depend on both
  axes — at 560 px wide the overlap appears only at 915–1000 px tall — because
  what actually matters is where the composition puts Nikkaluokta.
- **Real containers are discrete.** The compact layout caps the map at 560 px;
  the navigation rail (viewport ≥ 760) starts it at 676 px. Nothing lands in
  between.

`ZOOM_CONTROL_MIN_MAP_WIDTH = 640` therefore sits in that gap — **80 px above
the widest colliding container, 36 px below the narrowest clean one** — and is
deliberately not a CSS breakpoint, so it stays correct if the rail's own width
is retuned.

### Result

| Case | map width | fine pointer | zoom control | overlapping markers | wheel / keyboard / dbl-click / touch zoom | console |
| --- | --- | --- | --- | --- | --- | --- |
| 375×667 fine | 375 | yes | **absent** | **none** | all enabled | 0 |
| 375×667 touch | 375 | no | absent | none | all enabled | 0 |
| 760×500 fine | 676 | yes | **present** | none | all enabled | 0 |
| 1280×800 fine | 1132 | yes | present | none | all enabled | 0 |
| 1512×860 fine | 1364 | yes | present | none | all enabled | 0 |

Accessible names preserved where the control shows: `Zoom in`, `Zoom out`.

### Resize across the threshold, one page, no reload

| step | viewport | map width | zoom control |
| --- | --- | --- | --- |
| 1 | 1280×800 | 1132 | present |
| 2 | 700×800 | 560 | **removed** |
| 3 | 1280×800 | 1132 | **re-added** |
| 4 | 560×800 | 560 | removed |
| 5 | 900×800 | 816 | re-added |

Both directions, repeatedly. The gate is evaluated on the map's own `resize`
event against `containerRef.clientWidth` — the **container**, not the window,
so a rail or split view is handled correctly.

### The composition is untouched

Every framing number is identical with and without the gate — 375×667 still
48 / 48, Δ 0.0, zoom 7.9838. The gate adds no padding, moves no camera, and
changes no route centring. Hiding the buttons removes a redundancy, not a
capability: `scrollZoom`, `keyboard`, `doubleClickZoom` and `touchZoomRotate`
all remain enabled (only rotation is disabled, for the north-up policy).
