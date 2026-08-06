# Guide screen background (topographic contours)

`contours.svg` is the decorative background of the Guide home: a
single-colour topographic contour drawing (muted blue `#5c7b8a`, opacity
baked into the file) rendered over the pale blue-grey base colour that lives
in CSS (`.screen-bg--guide`). Precached offline by the existing Workbox
`svg` glob.

## Provenance

- **Source:** the app's own contour vector archive
  `kungsleden-contours.pmtiles` (layer `contours`, property `elev`), built by
  `scripts/build-terrain-map.sh` from the **Copernicus GLO-30 DEM** — the
  same data behind the in-app terrain download, covered by the same
  attribution shown in the app's terrain credits.
- **Region:** z11 tile 1128/489 — approximately 68.073°N 18.281°E to
  68.008°N 18.457°E: the **Tjäktja pass area**, the route's high crossing.
  A geographically real crop, but purely decorative — no labels, no scale,
  never a navigation surface.
- **Extraction:** `scripts/generate-contour-backgrounds.mjs` (deterministic;
  prerequisites and pipeline documented in the script). z11 carries only the
  100 m index contours, matching the visual density of the Today asset.
- **Processing:** Ramer–Douglas–Peucker simplification, sliver-fragment
  drop, Catmull-Rom → cubic Bézier smoothing — the same reprocessing
  character as `public/images/today/contours.svg`.

To retune subtlety, edit `stroke-opacity` (and/or `stroke-width`) on the
single `<g>` element, or regenerate with adjusted constants in the script.
