# Final Map correction evidence

Base: `50fd648ed94d5f15c8e74c0f402e67c5521afe11` (fetched remote `main`,
2026-08-11).

## Cold first entry

The real production archives were cached and the 375×812 app browser was
entered from Today. Dev lifecycle instrumentation recorded:

| Event | ms after MapView mount |
|---|---:|
| archive resolution start | 0.0 |
| Satellite / Terrain / Contours resolved | 5.9 / 6.3 / 6.3 |
| basemap resolved / all archives ready | 7.5 / 7.5 |
| MapLibre constructor start / end | 7.6 / 16.9 |
| first source loading | 22.0 |
| first style data | 24.4 |
| ResizeObserver correction | 25.1 |
| first MapLibre render | 42.9 |
| `load` | 190.5 |
| first post-route-layer `idle` | 520.0 |

Before this correction `.mapview` was visible from mount, so the 42.9 ms
render and the following tile/style assembly through 520.0 ms were exposed.
The controls are composed outside `.mapview`, explaining why they appeared
before useful map content. Archive resolution completed in 7.5 ms and the
resize occurred before the first render; neither was the long pole or a second
camera move. The actual gap was `first render → load → idle`, while the canvas
had no visibility gate.

The corrected contract keeps only the MapLibre surface at opacity zero and
non-interactive until the first `idle` registered at the end of the `load`
handler, after route sources/layers and markers are installed. `idle` means
all requested tiles are loaded and no transition is pending; no timeout,
spinner, screenshot, persistent map instance or modal participates. Controls
remain accessible throughout, attribution starts compact in `onAdd`, and the
global reduced-motion rule removes the 140 ms reveal transition.

Captured states:

- `cold-entry-today-375x812.png`
- `cold-entry-first-observed-375x812.png`
- `cold-entry-100ms-375x812.png`
- `cold-entry-ready-375x812.png`

## Terrain v3 diagnosis

The real `terrain-data-v3` archive passed `pmtiles verify`. All 639 addressed
tiles decode as opaque 256×256 PNG Terrain-RGB and every per-zoom rectangle is
contiguous. The defect is coverage, not corruption, PMTiles range resolution,
style visibility or decoding:

| z | v3 XYZ x | v3 XYZ y | tiles | physical west,south → east,north |
|---:|---:|---:|---:|---|
| 7 | 70–70 | 30–30 | 1 | 16.875000,67.609221 → 19.687500,68.656555 |
| 8 | 140–141 | 60–61 | 4 | 16.875000,67.609221 → 19.687500,68.656555 |
| 9 | 281–283 | 120–123 | 12 | 17.578125,67.609221 → 19.687500,68.656555 |
| 10 | 562–567 | 241–247 | 42 | 17.578125,67.609221 → 19.687500,68.528235 |
| 11 | 1125–1134 | 482–494 | 130 | 17.753906,67.676085 → 19.511719,68.528235 |
| 12 | 2251–2268 | 965–989 | 450 | 17.841797,67.676085 → 19.423828,68.496040 |

Concrete browser reproduction: the real 1512×860 viewport (including the app
shell/nav) settles at centre `18.457927,68.121213`, displayed zoom `8.628560`,
visible bounds `17.246321,67.834777 → 19.669534,68.404127`. MapLibre raster sources use
`round(displayZoom + log2(512/256))`, so the DEM request is z10. The viewport
needs x561–567/y241–246; v3 has only x562–567. Missing real children
`10/561/241–246` return empty through PMTiles. (The pure 1512×860 map-box
contract is wider still and also requires x560.) Vector
tiles are a separate, complete source, so topo remains while hillshade ends at
the x562 tile boundary. The encoded ancestor-fallback guarantee was therefore
incorrect for this raster-dem use.

## Terrain v4 coverage and stop-gate

Terrain v4 carries every descendant of the z7 overview tile through source
z11, the highest source zoom reachable by the existing supported 3440×1440
overview regression viewport. Source z12 returns to the compact corridor;
MapView tightens to interaction bounds exactly at the displayed 10.5 boundary
where MapLibre starts selecting z12.

| z | v4 XYZ x | v4 XYZ y | v3 tiles | v4 tiles | v4 footprint |
|---:|---:|---:|---:|---:|---|
| 7 | 70–70 | 30–30 | 1 | 1 | 16.875000,67.609221 → 19.687500,68.656555 |
| 8 | 140–141 | 60–61 | 4 | 4 | same |
| 9 | 280–283 | 120–123 | 12 | 16 | same |
| 10 | 560–567 | 240–247 | 42 | 64 | same |
| 11 | 1120–1135 | 480–495 | 130 | 256 | same |
| 12 | 2251–2268 | 965–989 | 450 | 450 | 17.841797,67.676085 → 19.423828,68.496040 |

All 791 required tiles physically exist, decode to opaque 256×256 PNGs and
form complete rectangles. The regression enumerates every real PMTiles tile,
plus overview cameras for 320×568, 375×812, 412×915, 812×375, 1366×768,
1512×860 and 3440×1440.

| | Terrain v3 | Terrain v4 | delta |
|---|---:|---:|---:|
| bytes | 19,297,735 | 25,073,452 | +5,775,717 (+29.93%) |
| tiles | 639 | 791 | +152 (+23.79%) |
| SHA256 | `89eef71787ceb1f4b827b9eee1906fd799d89c4d4d587be31a4d944efb399aa5` | `c90481a568668bfe9cefeebfbf82a2313d38f47b88e1f1b7550fce9fad2bbae9` | |

All eight Copernicus input byte sizes, ETags and SHA256 hashes are identical to
v3. `pmtiles verify` passes. The 29.93% increase is bounded to the 152 tiles
mathematically required by the camera/source-zoom contract, so the stop-gate
passes.

Contours were not regenerated: revision `kungsleden-contours-data-v3`,
9,271,029 bytes and SHA256
`3e8fbcfa6ee1ea8df9abaec641d836e11602867c09c83f77173e522826b7d573`
remain byte-identical. Their geometry contains `userBounds` plus the existing
~3 km margin; expanded overview affects hillshade, while contours remain a
route-corridor overlay and make no full-viewport relief claim.

## Camera, imagery and viewport validation

The settled 1512×860 Terrain overview is captured in
`terrain-overview-ready-1512x860.png`. Continuous wheel zoom crossed the real
raster source boundary without exposing a rectangular relief edge:

| state | displayed zoom | effective Terrain source | visible bounds |
|---|---:|---:|---|
| expanded overview | 8.628560 | z10 | 17.246321,67.834777 → 19.669534,68.404127 |
| expanded, close to boundary | 9.541492 | z11 | 17.952100,67.969527 → 19.239080,68.271906 |
| compact corridor | 10.668113 | z12 | 18.285538,68.051866 → 18.874958,68.190352 |

`terrain-source-z11-1512x860.png` and
`terrain-source-z12-1512x860.png` show the two physical source regimes. The
z12 state is inside interaction bounds as required. Switching the same state
to Satellite left centre, zoom and visible bounds byte-for-byte unchanged;
`satellite-source-z12-1512x860.png` records the visual result.

The real-archive pan sweep at displayed z10.020583 / source z11 reached the
north route end (centre latitude 68.288463), south end (67.978003), exact west
interaction limit (visible west 17.952100) and exact east limit (visible east
19.305100) without a relief edge. Evidence:

- `terrain-north-z11-1512x860.png`
- `terrain-south-z11-1512x860.png`
- `terrain-west-limit-z11-1512x860.png`
- `terrain-east-limit-z11-1512x860.png`

Continuous wheel input exercised effective sources z9, z10, z11 and z12.
Source z7/z8 transitions cannot be reached by any supported viewport because
maxBounds stops zoom-out first; their complete physical tile matrices are
still decoded by the archive regression. Displayed z13.230659 correctly
overzooms the archive's z12 DEM, captured in
`terrain-overzoom-1512x860.png`.

At 320×568, Fit route settled at displayed z7.667038 / Terrain source z9 with
bounds 18.075067,67.804633 → 19.182134,68.464271. The full trail, hillshade,
labels, scale, attribution, Map controls and bottom navigation remain visible
in `terrain-overview-320x568.png`. The 375×812 cold-entry sequence above covers
the primary phone viewport.

## Layer-control cleanup

The Layers toolbar button remains a 44 px icon-only target in both imagery
modes and retains its `Choose map layer` accessible name and optional-data
dot. Its radiogroup now exposes exactly the accessible names `Terrain` and
`Satellite`, with normal radio checked/disabled semantics and keyboard
handling. Permanent explanatory notes and their CSS are removed; the single
Settings handoff remains only when optional data is missing.

`layer-picker-1512x860.png` and `layer-picker-satellite-320x568.png` verify the
quieter chooser at desktop and minimum requested width. The 320 px snapshot
also verifies that Satellite selection does not add a `Sat` toolbar caption or
alter control geometry.
