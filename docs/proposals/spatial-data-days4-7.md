# Days 4–7 spatial data & content corrections

Owner-supplied GPX for the remaining detours, plus content re-classification from
the owner's route research. Extends the Highlights & detours layer
(`highlights-and-detours.md`) and follows the spatial-data policy
(`along-the-way-spatial.md`): verified owner geometry only, nothing inferred,
source files kept byte-for-byte.

## Files ingested (unedited, under `public/gpx/experiences/`)

| File | Track | One-way | Round-trip | Round-trip ascent | Notes |
| --- | --- | --- | --- | --- | --- |
| `nallo-side-valley.gpx` | 84 pt | 5.45 km | **10.9 km** | 261 m | stored Nallo→Sälka, **reversed** for display |
| `tarfala-valley.gpx` | 207 pt | 8.00 km | **16.0 km** | 618 m | starts at Kebnekaise Fjällstation |
| `kebnekaise-summit-western.gpx` | 290 pt | 9.21 km | **18.4 km** | 2050 m | station → summit via Vierranvárri |
| `day5-along-the-way.gpx` | 7 pt | 0.14 km | **0.3 km** | 26 m | track = waterfall spur only |

All distances/ascent are **derived from the GPX geometry at build time** and, for
routed detours, injected into the displayed `roundTripKm` at load — no hand-typed
figures (the Day-1 hardcodes were removed too).

## Alias layer (source name → canonical id · role)

The Days-4–7 files don't all follow the Day-1 `exp.<id>.<role>` convention (bare
track names, un-prefixed `…​.start`/`.end`, extra dots in
`day5.madirjavri.lake+plateau.viewpoint`). A `NAME_ALIAS` map in
`scripts/generate-experience-geometry.mjs` reconciles them; names not listed fall
back to the convention, so Day 1 is unchanged.

- `nallo-side-valley` (track) → `nallo-side-valley` · detour *(reversed)*
- `exp.salke-half-summit.lake+viewpoint` → `salka-half-summit-lake-viewpoint` · destination
- `tarfala-valley` (track) → `tarfala-valley` · detour; `exp.tarfala-valley.{destination,research-station,tarfala-cabin,waterfall}` kept as waypoints
- `kebnekaise-summit-western` (track) → detour; `.start`→entry, `.end`→summit, `exp.…​.vierranvarri`→vierranvarri
- `day5-along-the-way` (track) → `day5-waterfall-rapids-bridge` · detour; `day-5-waterfall-along-route.entry`→entry, `day-5-waterfall-along-route`→destination
- `day5.madirjavri.lake+plateau.viewpoint` → `madirjavri-plateau-viewpoint` · destination

## Routed detours vs. off-trail objectives

**Routed** (continuous line + start/destination markers + View on map): Nallo,
Day-5 waterfall bridge, Tarfala, Kebnekaise South Summit — plus the existing
Day-1 canyon and Njakajaure. Each registers one `ownerDetour` asset.

**Unrouted off-trail objectives** (verified destination point, **no line, no
asset**): `salka-half-summit-lake-viewpoint`, `madirjavri-plateau-viewpoint`.
They carry `offTrail: true` + `mapAvailability: 'exact-point'`; the coordinate
resolves from the owner waypoint at runtime. "View point on map" opens the marker
only, with an off-trail note; the card shows `Off-trail · Hard · No marked path`
and honest route-finding/own-risk wording. No route, trailhead or direct line is
invented.

## Content corrections

| Change | From | To |
| --- | --- | --- |
| Sälka bathing stream | Detour (short-detour) | **Highlight** (`beside-station` → "Beside the station") |
| Sockertoppen | Detour (route unverifiable) | **removed**, replaced by `salka-half-summit-lake-viewpoint` (off-trail point) |
| Nallo | "detour or loop", no metrics | **out-and-back**, 10.9 km return, owner route |
| Kebnekaise summit / Tarfala | metrics unavailable | owner routes; 18.4 km / 16.0 km return |
| Day 5 | (none) | + waterfall bridge Detour (routed) + Mádírjávri viewpoint (off-trail) |

Resulting per-stage structure:

- **d4** — Highlights: Tjäktja Pass, moraine, Tjäktjavagge descent, **Sälka bathing stream**. Detours: Nallo, **Sälka high lake & valley viewpoint** (off-trail).
- **d5** — Highlights: glacier panorama, Gaskkasjohka bridges. Detours: **Waterfall & rapids bridge**, **Mádírjávri plateau viewpoint** (off-trail).
- **d6/d7** — basecamp Detours: Kebnekaise South Summit, Tarfala Valley (both now routed).

## Source UI removed

The visible "Source" disclosure is gone from all Detour cards (and the
`Provenance` component + `dt-source` CSS). Source metadata stays on every record
internally; Stops/Transport source UI is untouched.

## Notes / non-goals

- Tarfala's `research-station`, `tarfala-cabin`, `waterfall` waypoints are kept as
  internal route context, **not** map markers (the waterfall sits ~2.7 km off the
  walked line; adding markers would clutter the start/destination+line design).
- Nallo's reversal reorders points only; distance and round-trip ascent are
  direction-invariant, and the source GPX is unchanged.
