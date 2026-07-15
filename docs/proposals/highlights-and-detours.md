# Highlights & detours — content architecture redesign

Supersedes the presentation half of `explore-more.md` / `along-the-way-spatial.md`.
The spatial-data policy (verified geometry only; missing beats false precision) is
unchanged; only the **content architecture and presentation** change here.

## The decision

The Stage screen previously carried an overlap:

- **Day guide → Highlights** — a bullet list inside the day guide.
- **Along the way** — a separate disclosure of `RouteExperience` records.

Both answered "what's worth noticing", from two sources, with drift between them.
This pass splits responsibilities cleanly:

| Layer | Answers | Source |
| --- | --- | --- |
| **Day guide** | Character & demands of the day (terrain, planning, conditions) | `stageGuides.mjs` (no Highlights list) |
| **Highlights & detours** | Concrete things to see / notice / visit | `routeExperiences.ts` only |

- **Highlights** = experienced while following the normal route (`on-trail`,
  `beside-trail`, `visible-from-trail`).
- **Detours** = deliberately leaving the route (`short-detour`, `side-route`,
  `basecamp-trip`).

Grouping is **derived from the existing `access` field** — no new classification
dimension. The main disclosure reads **`Highlights & detours · N`** where
`N = highlights + detours`; the two internal subsections render only when
non-empty.

## Data-model changes (minimal)

- `RouteExperience.icon?` — optional Lucide icon key, overriding the coarse
  `type→icon` default (a bridge is `type: 'water'` but wants a bridge icon).
- `RouteExperience.routeShape?` — `'out-and-back' | 'loop' | 'one-way'`, optional
  editorial route character for the expanded Detour card (Day-1 detours derive it
  from the GPX asset; others state it editorially where known).
- `stageGuides.mjs` loses its `highlights` field (forward + reverse) — migrated.
- `experienceModel.mjs` gains `experienceKind`, `highlightsAndDetoursForStage`,
  and small label helpers. Ordering, basecamp separation, direction-safety,
  `canViewOnMap`, GPX validation and provenance are all **unchanged**.

No coordinates, GPX or synthetic geometry are generated for Days 2–7.

## Per-stage migration

Legend: **H** = Highlight, **D** = Detour, ✎ = new record migrated from a Day
guide bullet, ⤳ = folded into an existing record (bullet removed), ✂ = removed
(facility/logistics/navigation → belongs to Stops/Transport/Day guide).

### d1 · Abisko → Abiskojaure
Existing experiences: `abiskojakka-canyon` (D, GPX), `lake-njakajaure-lapporten`
(D, GPX), `abisko-birch-birdlife` (H).
- Guide "Abiskojåkka river & canyon" ⤳ `abiskojakka-canyon` (D).
- Guide "forest opening toward the fjäll" ⤳ `abisko-birch-birdlife` (H).
- Guide "limestone bluff with river views" ✎ **H** `abisko-limestone-bluff`.
- Guide "Lake Abiskojaure, sandy beach" ✎ **H** `abiskojaure-lakeshore`.
- `abisko-birch-birdlife`: **no View on map** (route-wide observation, not a map
  target) — `mapAvailability: 'unavailable'`.
- **H: 3 · D: 2 → `· 5`**

### d2 · Abiskojaure → Alesjaure
Existing: `treeline-transition` (H), `alesjaure-delta-panorama` (H),
`laevas-sami-fence` (H).
- Guide "Crossing the treeline" ⤳ `treeline-transition` (H).
- Guide "Šiellajohka suspension bridge" ✎ **H** `siellajohka-bridge`.
- Guide "long views along Alisjávri" ⤳ `alesjaure-delta-panorama`.
- Guide "Alesjaure cabins on their hill" ⤳ `alesjaure-delta-panorama`.
- **H: 4 · D: 0 → `· 4`**

### d3 · Alesjaure → Tjäktja (was deliberately empty)
- Guide "wide sweep of upper valley, braided river" ✎ **H** `tjaktjavalley-braiding`.
- Guide "vegetation thinning to alpine ground" ✎ **H** `alpine-vegetation-transition`.
- Guide "first views of barren Tjäktjapasset country" ✎ **H** `tjaktja-approach-view`.
- Day guide keeps the narrative transition (character & demands); Highlights name
  the concrete features — the allowed split, not duplication.
- **H: 3 · D: 0 → `· 3`**

### d4 · Tjäktja → Sälka (richest)
Existing: `tjaktja-pass-view` (H), `tjaktja-moraine` (H), `tjaktjavagge-descent`
(H), `salka-bathing-stream` (D), `sockertoppen` (D), `nallo-side-valley` (D).
- Guide "Tjäktjapasset high point / shelter" ⤳ `tjaktja-pass-view`.
- Guide "huge view south over Tjäktjavagge" ⤳ `tjaktja-pass-view`.
- Guide "valley unrolling ahead as you descend" ⤳ `tjaktjavagge-descent`.
- **H: 3 · D: 3 → `· 6`**

### d5 · Sälka → Singi
Existing: `singi-glacier-panorama` (H).
- Guide "broadest Tjäktjavagge, big-mountain views" ⤳ `singi-glacier-panorama`.
- Guide "suspension bridges over Gaskkasjohka" ✎ **H** `gaskkasjohka-bridges`.
- Guide "Singi junction" ✂ stays Day-guide (navigation/orientation, not a sight).
- **H: 2 · D: 0 → `· 2`**

### d6 · Singi → Kebnekaise
Existing: `ladtjovagge-reveal` (H); basecamp `kebnekaise-summit-western` (D),
`tarfala-valley` (D).
- Guide "Kebnekaise massif peaks" ⤳ `ladtjovagge-reveal`.
- Guide "Duolbagorni crater-like hollow" ✎ **H** `duolbagorni`.
- Guide "dramatic valley walls beyond Singi" ✂ stays Day-guide (route character).
- Guide "staffed station, restaurant/shop/showers" ✂ facility → Stops.
- **H: 2 · D: 2 (basecamp, last) → `· 4`**

### d7 · Kebnekaise → Nikkaluokta
Existing: `darfaljohka-bridge` (H), `ladtjojaure-lakeshore` (H); basecamp
`kebnekaise-summit-western` (D), `tarfala-valley` (D) (shared d6+d7).
- Guide "looking back to the Kebnekaise massif" ✎ **H** `kebnekaise-massif-lookback`.
- Guide "Lake Láddjujávri / lakeside restaurant" ⤳ `ladtjojaure-lakeshore`
  (restaurant is a facility, not surfaced as an experience).
- Guide "birch forest returning" ✎ **H** `abisko-birch-return`.
- Guide "Nikkaluokta trail's end / bus" ✂ facility + transport → Stops/Lists.
- **H: 4 · D: 2 (basecamp, last) → `· 6`**

## Icon mapping (Lucide, one restrained treatment — no category colour)

`type` gives the default; `icon` overrides where the feature is more specific.

| Meaning | Lucide | Used for |
| --- | --- | --- |
| viewpoint (default) | `Binoculars` | panoramas, reveals, look-backs |
| water (default) | `Waves` | rivers, lakes, canyons |
| landform (default) | `Mountain` | valleys, moraine, summits |
| nature (default) | `Leaf` | vegetation transitions |
| culture (default) | `Tent` | Sámi landscape |
| bridge | `Milestone` | Šiellajohka, Gaskkasjohka, Darfáljohka |
| lake / lakeshore | `Waves` | Abiskojaure, Láddjujávri |
| birdlife / wildlife | `Bird` | birch-birdlife |
| pass / high point | `MountainSnow` | Tjäktja pass |
| glacier / geology | `Gem` | moraine, glacier panoramas |
| forest | `Trees` | birch return |
| viewpoint bluff | `Binoculars` | limestone bluff |

Icons carry an `aria-hidden` glyph; the accessible name is always the title +
relationship text, never the icon alone.

## Internal terminology removed from UI copy

- `lake-njakajaure-lapporten.description`: "An **owner-researched** optional side
  trip…" → "An optional side trip…".
- `abisko-birch-birdlife.mapNote` removed (no longer opens the map).
- All `spatialProvenance` / `mapAvailability` / `spatialStatus` values stay
  internal fields only — never rendered.

## Files changed

- `src/types/index.ts` — `icon?`, `routeShape?` on `RouteExperience`.
- `src/data/experienceModel.mjs` (+ `.d.mts`) — kind classifier, section builder,
  labels.
- `src/data/routeExperiences.ts` — new highlight records, Day-1 detour difficulty,
  birch map-off, icons, copy fix.
- `src/data/stageGuides.mjs` (+ `.d.mts`) — drop `highlights`.
- `src/components/StageExperiences.tsx` — rebuilt as Highlights & detours (no
  detail page, no modal).
- `src/screens/StagesScreen.tsx` — combined disclosure, remove push-detail view.
- `src/styles/global.css` — Highlights rows + inline Detour cards.
- `tests/experience-model.test.mjs`, `tests/stage-guides.test.mjs`,
  `tests/highlights-detours.test.mjs` (new).

## Day-1 GPX / map regression risks & mitigations

- The two Day-1 detours keep `gpxAssetId`, owner geometry, derived metrics,
  `viewOnMap` (`kind: 'route'` with track + start + destination) and the
  `buildFocusFeatures` clean rendering — the `viewOnMap` builder and `canViewOnMap`
  gate are **untouched**; only the row that hosts the "View on map" button moves
  from a pushed detail page to an inline expanded card.
- `experienceGeometry` / `experienceRoutes` / `generate-experience-geometry.mjs`
  are untouched.
- Risk: removing the pushed detail view drops the only host of the summit's
  "Before you commit" (expedition) block. Mitigation: that block is preserved
  inline in the expanded Detour card.
