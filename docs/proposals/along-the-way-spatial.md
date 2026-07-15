# Spatial data policy & Day 1 pilot

**Authoritative and current.** Governs how mappable geometry enters the
experience layer (the Highlights & detours architecture lives in
`highlights-and-detours.md`). Status: **awaiting owner sign-off on Day 1**.

> **Presentation note.** The stage UI is now "Highlights & detours". The
> spatial-data policy below is unchanged. The route-wide Day-1 birch record no
> longer opens a full-stage map view (a route-wide observation is not a map
> target), so the `full-stage` map mode is currently unused by any record.

## 1. Policy (non-negotiable)

For hiking/safety data, **missing beats false precision.** Nothing is inferred, guessed,
synthesised or reconstructed from prose. No placeholder coordinates, no draft GPX, no
"approximate trailhead presented as exact." Unknown spatial data stays absent until the
owner supplies/verifies it or an authoritative source is documented.

Two typed dimensions per experience `location`:

**`spatialProvenance`** — `owner-provided` · `source-verified` · `researched` · `missing`

**`mapAvailability`** — behaviour gate (`canViewOnMap` / `mapDisplayKind` in `experienceModel.mjs`):
| value | Map behaviour |
|---|---|
| `exact-point` | precise marker + "View on map" |
| `verified-route` | route line + route action |
| `context-only` | general area / trail section / sight direction, **labelled contextual** — never implies navigation |
| `unavailable` | no marker, route or action |

Rule: draft/inferred/synthetic/missing ⇒ `unavailable`. A major/safety-sensitive route may
expose an actionable route **only** when geometry + source are sufficiently verified.
`orderHint` (0..1) is a **coarse editorial position for ordering/grouping only — never a
coordinate**, never used to synthesise a map location.

**Current state:** all 18 records are `spatialProvenance: 'missing'`, `mapAvailability:
'unavailable'`, no coord/GPX. **"View on map" is off everywhere** until real data lands.
The GPX asset registry (`experienceRoutes.ts`) is intentionally empty.

## 2. Removed in this pass (placeholder purge)
- `public/gpx/experiences/kebnekaise-summit-western.gpx` — fabricated draft track (deleted).
- The Kebnekaise `ExperienceRouteAsset` (draft) and the summit's `gpxAssetId` link.
- `spatialConfidence: 'approx' | 'draft'` and the draft-location badge (replaced by the
  provenance × availability model; nothing renders unverified geometry).
- `coordAtStageProgress` interpolation used to derive a focus point from `orderHint`
  (the false-precision path) — "View on map" now uses a **verified coord only**.

## 3. Day 1 pilot — credible-source findings (for your approval; NOT committed)

Sources ranked: national park / Länsstyrelsen / Naturvårdsverket › STF › official maps ›
Lantmäteriet › OSM/OSM-databases (corroboration only) › reputable guidebooks. A blog pin,
geotagged photo, search snippet or AI estimate is **not** sufficient alone.

**Authoritative anchors (high):** Stage-1 trailhead `68.35890, 18.77922` (Naturkartan BD21);
canyon-trail head `68.36031, 18.78055` (Naturkartan); Lapporten landmark `68.26833, 18.97694`
(Wikipedia/Wikidata) — a *view target*, ~13 km off-route, bearing ~141° SE from the trail.

| Experience | Real spatial form | What's authoritative | What's only OSM-tier (needs your verify) | Recommendation |
|---|---|---|---|---|
| **Abiskojåkka canyon** | **short detour loop**, multiple viewpoints (not one pin); ~1.2 km loop / ~30 min, primary golden-crown overlook only ~150 m from start (<30 min ✓) | canyon-trail head coordinate | golden-crown overlook `68.36001, 18.77645`, deeper overlook `68.35536, 18.76670`, rejoin point | model as `route` (detour) once you provide/verify start + viewpoint(s) + rejoin |
| **Lapporten sightline** | early **trail corridor** + optional primary viewpoint + SE view-direction arrow (never a walked marker) | Lapporten target + bearing ~141° | "Lapporten view" spot `68.36089, 18.79049` (OSM) | `context-only` corridor + `viewBearingDeg: 141`; keep `unavailable` until section verified |
| **Mountain-birch & birdlife** | **route section / corridor** (~first 60% of Day 1) + textual birding context | birch zone (habitat) | no on-route birding coordinate exists; "Bird Hill" is ~400 m OFF-route | keep **non-spatial / context-only**; do not invent an on-route birding pin |

**Verdict:** no item currently clears the bar for an `exact-point` production marker on
owner-independent evidence. All three need either your waypoints/GPX or your confirmation of
the OSM-tier coordinates before `mapAvailability` moves off `unavailable`.

## 4. Owner-input checklist (Day 1)

Provide, per item, one of: exact waypoint(s) · a detour GPX track · trailhead/destination/rejoin ·
a section start+end · a view target/bearing · or "keep non-spatial." Templates:

```yaml
# Canyon — short detour route
experienceId: abiskojakka-canyon
stageId: d1
geometryType: route
sourceType: owner-provided
verifiedBy: Omar
verifiedDate: YYYY-MM-DD
start:      { lat: , lon: , role: detour-start }
points:
  - { lat: , lon: , role: primary-viewpoint }   # golden-crown overlook
end:        { lat: , lon: , role: rejoin }
gpxFile:    day-01-along-the-way.gpx
notes:
```
```yaml
# Lapporten — sightline / view direction
experienceId: lapporten-sightline
stageId: d1
geometryType: view-direction
sourceType: owner-provided
visibleSection: { startLat: , startLon: , endLat: , endLon: }
primaryViewpoint: { lat: , lon: }
target: { lat: 68.26833, lon: 18.97694 }
bearingDegrees: 141
notes:
```
```yaml
# Birch & birdlife — corridor (or confirm non-spatial)
experienceId: abisko-birch-birdlife
stageId: d1
geometryType: segment
sourceType: owner-provided
sectionStart: { lat: , lon: }
sectionEnd:   { lat: , lon: }
observationPoints: []
notes:
```

## 5. Owner GPX authoring convention

One combined file per day is fine: `day-01-along-the-way.gpx`, containing point waypoints,
section-boundary waypoints and detour/excursion tracks. Use **stable ids**, never display
titles or "Waypoint 1":
```
abiskojakka-canyon.detour-start · abiskojakka-canyon.primary-viewpoint · abiskojakka-canyon.rejoin
lapporten-sightline.section-start · lapporten-sightline.primary-viewpoint · lapporten-sightline.section-end · lapporten-sightline.target
abisko-birch-birdlife.section-start · abisko-birch-birdlife.section-end
```
A detour track uses a stable track name e.g. `abiskojakka-canyon.detour`. The app parses the
combined day file into per-experience geometry records + individual route assets — the
production app never treats the day GPX as one indivisible blob.

## 6. Repeatable workflow (Day 2 → Day 7)

For each stage: **A Inventory** (classify each experience: point / segment / area /
view-direction / detour route / basecamp route / non-spatial) → **B Research** (credible
sources, record uncertainty) → **C Owner review** (confirm/correct/supply) → **D Asset
creation** (coordinates for points, real GPX for routes) → **E Validation** (ids exist,
geometry matches, coords valid & plausibly on-stage, referenced asset exists, distance/
elevation don't contradict the track, direction-aware order correct) → **F Map test**
(forward+reverse, marker/route, camera, popup, return flow, no persistent pollution) →
**G Approval** (mark available only after evidence + owner review meet the confidence
threshold). Approximate research is never auto-propagated to production.

## 7. Day 1 implementation gate

New Day 1 spatial values are committed **only after** you approve or supply GPX/coordinates.
Until then the dataset stays `missing`/`unavailable` and View-on-map is off. Once approved,
real-tile Map validation (marker/route/camera/popup/return, forward+reverse) is captured
before the values ship.
