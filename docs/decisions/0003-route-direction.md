# ADR 0003 — Reversible route direction via one active-itinerary layer

- **Status:** Accepted
- **Date:** 2026-07-13
- **Decision owner:** Omar van der Heijden

## Context

Fjällkompis presents the Kungsleden Abisko → Nikkaluokta as a fixed
north-to-south sequence. The route is a single GPX-derived dataset
(`src/route/routeData.ts`), and its north-to-south order was baked into stage
day numbers, stop order, cumulative distances, elevation profiles, "Tonight"
logic, journey progress, the Map stage selector, route-km labels and the
editorial prose.

A hiker in the field is walking the **same physical route and the same eight
stops in reverse** (Nikkaluokta → Abisko). That is a real, immediate need and
also the first step toward a more modular itinerary model. The requirement is
exactly two supported, validated directions over the same geometry — not a
free-form itinerary builder.

The naive fix — scattering `array.reverse()` and `100 − percent` across screens
— would be fragile, duplicate reversal logic, and silently corrupt progress
projection and editorial meaning.

## Decision

Introduce **one authoritative active-itinerary layer** and make every screen and
store selector consume it. No screen reverses route data itself.

### Canonical route vs active itinerary

- The generated GPX route stays the **canonical physical route**, stored once,
  north-to-south. It is never duplicated for the reverse direction.
- A pure, tested transform — `buildDirectionalItinerary(route, direction)` in
  [`src/route/itinerary.mjs`](../../src/route/itinerary.mjs) — derives the
  **active directional itinerary** from the canonical route + the selected
  direction. A thin TS wrapper
  ([`src/route/activeItinerary.ts`](../../src/route/activeItinerary.ts)) enriches
  it with direction-aware editorial and the ordered stops, memoised per
  direction.
- The store exposes the active itinerary; screens read ordered stages, ordered
  stops, oriented geometry, elevation profiles, statistics, stop-distance and
  display name from it.

### Stable physical identity vs itinerary day

The `d1`…`d7` ids are kept as **stable physical-segment identities** (the
north-to-south generation order) — persisted current-stage state, Map selection,
deep links and tests all key on them. They **no longer mean "itinerary day."**
A separate direction-derived `day` is computed:

- forward: `d1…d7` → Day 1…7;
- reverse: `d7` → Day 1, `d6` → Day 2, … `d1` → Day 7.

The UI always displays the itinerary day, never infers it from the id. Ids are
not renamed, so no data migration of persisted stage ids is needed.

### Correct reverse geometry (never `100 − percent`)

For the reverse direction the transform reverses stage order and endpoints,
reverses each stage's and the overview's point order, and **rebuilds
`cumulativeDistanceKm` from 0 by mirroring the canonical values** (`total −
cum`) — reusing the generator's verified distances, never recomputing from raw
coordinate jitter. GeoJSON is rebuilt from the reversed points; bounds are
preserved. Statistics reuse the canonical verified figures with **ascent/descent
swapped** (distance and elevation extremes unchanged). Progress is then computed
by the existing projection against this correctly oriented geometry — there is
no presentation-time percentage inversion. Canonical arrays are never mutated
(forward returns them by identity; reverse copies).

### Route direction as a persisted preference

Direction is an explicit user choice in **Settings**, never inferred from GPS.
It is added to persisted state (schema **v3 → v4**); older payloads and invalid
values normalise to the canonical `abisko-to-nikkaluokta`. Only the direction is
persisted — the derived itinerary is rebuilt at runtime. Changing direction
reinitialises reactively (no hard reload): current-stage physical id is
preserved (its day/endpoints/ascent-descent/Tonight recompute), the Map browse
state resets to the overview, and one-shot deep-link payloads are dropped.
Packing, journal, stop notes and downloaded map assets are never touched.

### Direction-aware editorial

Editorial that materially changes meaning has direction variants; shared,
direction-neutral content stays single-sourced:

- one-line stage notes ([`stageEditorial.mjs`](../../src/data/stageEditorial.mjs))
  are per-direction;
- day guides ([`stageGuides.mjs`](../../src/data/stageGuides.mjs)) keep shared
  `terrain`/sources/verification and override `overview`/`highlights`/`watchFor`
  for reverse;
- stage-highlight chips ([`stageHighlights.mjs`](../../src/data/stageHighlights.mjs))
  swap climb↔descent variants; direction-neutral chips are reused.

Reverse guidance is reoriented from the same verified facts (no new field
conditions invented) and inherits the existing verification metadata. Walking-
time estimates are **direction-neutral and explicitly approximate** — the GPX
has no timestamps; the per-day up/down difference is modest and route ascent ≈
descent, so forward estimates are reused and labelled `±`. This is documented,
not silently presented as a reverse-specific measurement.

## Consequences

### Positive

- Two validated directions over one canonical dataset; no geometry duplication,
  no larger map archive, offline unchanged.
- Reversal logic lives in one pure, unit-tested function; screens are direction-
  agnostic consumers.
- Stable physical ids keep persisted state, Map selection and deep links valid
  across a direction change with no id migration.
- A future third itinerary would build on the same transform + segment identity.

### Constraints

- The `d1…d7` ids now carry a documented dual history: stable physical id, no
  longer the itinerary day. This ADR and the module docs are the record.
- Reverse editorial and time estimates are cautious approximations, not
  independently field-verified in the reverse direction.

## Out of scope

Arbitrary start/end stops, skipping/combining/splitting stages, custom dates,
alternative branches, camping itineraries, multiple saved itineraries, GPX
import, cloud sync, a second map archive, and automatic GPS direction detection.
