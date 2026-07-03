# Today screen background (topographic contours)

`contours.svg` is the decorative background of the Today screen: a
single-colour topographic contour drawing on a muted solid base, referenced
from `TodayScreen.tsx` and precached offline by the existing Workbox `svg`
glob.

The asset was derived from a grid-generated contour plot supplied for the
project. The original polylines were grid-derived and stepped, so they were
reprocessed (`scripts` history: RDP simplification → gentle Laplacian
relaxation → Catmull-Rom cubic Bézier conversion) into flowing organic
curves while preserving the terrain structure. Small summit rings are kept
at size; degenerate sliver fragments were dropped.

Rendering choices baked into the file: a single contour-green stroke (`#6f806f`),
`stroke-opacity 0.5` over the `#d4ded1` base for a clear but soft topo texture,
1px stroke with round caps/joins, no fills, no labels or map UI.

To retune subtlety, edit `stroke-opacity` (and/or `stroke-width`) on the
single `<g>` element in `contours.svg`.
