# Fjällkompis roadmap

Canonical roadmap for Fjällkompis. This file — not the README, code comments
or commit messages — is the single source of truth for priority and progress.
Delivered iterations are summarised in [CHANGELOG.md](CHANGELOG.md); versioning
rules live in the [development docs](docs/DEVELOPMENT.md#versioning--releases).

## Product identity

Fjällkompis is an **offline hiking companion for the Kungsleden between Abisko
and Nikkaluokta**. It complements appropriate maps, navigation tools and sound
outdoor judgement by bringing the trail information hikers use most into one
bounded, offline-first experience. It is deliberately not positioned as a
general map browser, a turn-by-turn navigator or a replacement for navigation
skills and safety equipment.

This identity should guide product decisions and public language: prioritise
route-specific usefulness, offline trust, low cognitive load and reliable
access to stage, stop, list and map context over expanding into a generic
outdoor platform.

## Current state

Offline-first Kungsleden hiking companion PWA (beta, v0.20.0). The core trip
loop works end to end and offline, in either walking direction (Abisko →
Nikkaluokta or the reverse, chosen in Settings): verified route with stage
statistics and
elevation profiles, researched per-stage day guides (sources and verification
dates auditable in the repo), along-route GPS progress on the current stage,
an offline vector basemap with hillshade and contour relief, plus an optional
Sentinel-2 satellite layer (all independently downloadable), a curated stops
guide, a packing list (the Daily checklist is archived —
docs/archived-features/daily-checklist.md), offline shop-info and transport
reference in Lists (STF cabin-shop assortments with 2025 reference prices;
route buses, boats and the train as validity-bound 2026 planning snapshots —
never live), a personal Trip plan in Lists — structured travel and stay
items with Needed / Planned / Confirmed statuses that ride the JSON backup,
with tickets/bookings attachable to them and standalone important documents
kept available offline on the device (document files stored in IndexedDB,
outside the JSON backup — docs/proposals/trail-wallet.md and
docs/proposals/trip-plan.md), install/update UX, opt-in
foreground live tracking (beta) on the Map screen, and local backup/restore. Fjällkompis is one adaptive
experience: the same URL works on phones (the protected baseline experience,
portrait-only by design — landscape shows a rotate-to-portrait prompt),
tablets (navigation rail, portrait and landscape) and desktop browsers
(persistent sidebar), with hash-based URLs (`#/today` … `#/settings`) and
working browser Back/Forward. The Map-tab GPS mechanics (one-shot fix,
foreground live tracking, projection, off-route states, offline basemap
handling) were validated in a real-device Delft pilot walk
(docs/pilot-results/delft-2026-07-07-summary.md); the Kungsleden itself has not
been field-tested. Fjällkompis therefore remains a beta companion and must be
used alongside appropriate navigation tools.

All personal data remains local to the browser/device in use; moving it
between devices is a manual export → import (device transfer). Automatic
cross-device synchronization is deliberately far down this roadmap.

## Now

1. **Beta trust and trail readiness** — active release scope (originally
   pencilled in as v0.18.0; that number shipped the stage day guides /
   checklist-archive iteration instead),
   tracked in [issue #36](https://github.com/Algolon/Fjallkompis/issues/36).
   Make the beta safer and easier to run before adding larger features:
   documentation and PR-CI hygiene; a consolidated Trail readiness panel at
   the top of Settings; beta feedback with diagnostics; Map navigation that
   opens today's stage when explicitly requested while remembering the viewed
   Map stage only for the current app session; field-legibility/accessibility
   fixes; and the first visual-regression coverage. Manual dependencies:
   published Google Form URL plus real-device sunlight, glove and offline
   validation.
2. **Offline map labels** — self-hosted/local PBF glyphs so the basemap can
   render general text labels without any remote font dependency (hut names
   are already local HTML markers). Now also the gate for the benchmark
   plan's label hierarchy (peaks with elevations, lake/valley/settlement
   names) and for contour elevation labels.
3. **Nordic restyle follow-ups** — the terrain hierarchy restyle (0.13.0),
   terrain relief (0.14.0) and the terrain-legibility iteration (0.17.0 —
   solid Nordic palette, z7→z8 handover fix, earlier contours, comparison
   UI retired) delivered benchmark Phases 1–2 and the production cleanup;
   remaining phases from docs/maps/thunderforest-outdoors-benchmark.md §7:
   bridge emphasis on trails/tracks (`roads.is_bridge`), wetland pattern
   fill once sprite infrastructure exists, and — only if styling proves
   insufficient — the §8.2 custom Planetiler profile (heath/fell, marsh/bog
   split, scree). The Thunderforest comparison layer and its key plumbing
   were removed in 0.17.0; the repository variable/secret can be deleted
   and the key rotated.

## Next

4. **Custom list portability and templates** — an early follow-up to
   multi-device access, and deliberately separate from it. Potential
   capabilities: import a standalone packing list; import or create custom
   recurring lists (any successor to the archived Daily checklist would be
   decided here, as a new product decision); export an individual list;
   preview an import before applying it; map categories; validate invalid
   rows; detect duplicates; choose between adding, replacing or merging; and
   keep the current full-state backup as a separate function. Scope is list
   files only — no accounts, no sync.
5. **Trim the initial bundle** — lazy-load/code-split MapLibre behind the Map
   screen so first paint doesn't pay for the map engine.

## Later

6. **Real-device field testing on the trail** — battery, GPS accuracy,
   glove/sunlight usability and offline behaviour on the Kungsleden itself;
   a prerequisite for calling any release trip-ready (1.0.0). The Delft
   pilot de-risked the Map-tab portion.

## Much later (optional)

7. **Cross-device synchronization** — automatic sync of personal data
   between a user's devices. Explicitly out of scope for the foreseeable
   future: it implies accounts/cloud or pairing infrastructure that
   contradicts the current local-only, no-backend architecture. Manual
   export → import (device transfer) is the supported mechanism until and
   unless this is ever revisited; it must not influence the architecture
   beyond avoiding obviously irreversible decisions.

## Blocked / awaiting external action

- **High-resolution Lantmäteriet orthophoto detail imagery** — awaiting manual
  Lantmäteriet approval and Ortofoto Nedladdning access. Validated direction
  only, not implemented: optional high-resolution offline detail packs layered
  above the existing Sentinel-2 overview, subject to source access,
  sample-quality validation and measured archive sizes. Corridor width and
  pack sizes are not yet decided. The attribution registry already models this
  source (`src/data/attribution.ts`, `present: false`); it must stay hidden
  until its imagery actually ships.

## Completed

- **Today Prepare (v0.24.0)**: Today gained a manual Prepare | On route
  mode — a compact liquid-glass tablist in the header (remembered per
  device, never switched automatically) in front of a preparation
  dashboard: route overview with Map/Stages actions, packing progress,
  Travel & stays status (the Trip plan's summary selectors, now consumed),
  and Trail readiness deep-linking into its Settings panel. Alongside it:
  STF membership quick access on Today (roundel button → centred offline
  card viewer, single-holder toggle in the document editor), app-wide
  pressed-state feedback replacing Android's blue tap flash, and a
  `color-scheme: light` hint for native controls. The Android/Samsung
  date/time dialog overflow was investigated and confirmed to live outside
  the app-controlled DOM/CSS; the decision to keep native pickers native is
  recorded in docs/proposals/today-mode-pill-refinement.md.
- **Personal Trip plan (v0.23.0)**: the Lists Wallet tab became **Trip** — a
  trip-item-first plan of personal Travel movements and Stays with
  Needed / Planned / Confirmed statuses, optional attached documents, and
  standalone documents preserved from the Trail Wallet era. Structured items
  live in the persisted state (schema v6, on top of the personal packing
  list's v5) and ride the JSON backup; document
  files stay in IndexedDB on the device, and missing attachments after a
  device transfer are shown honestly. Transport reference entries gained
  "Add to Trip" (verified facts only) and every stop gained "Track stay",
  both linking by stable source ids. Decision record:
  docs/proposals/trip-plan.md. The Today "Prepare" view reading the pure
  trip summary selectors was deliberately deferred and landed in v0.24.0.

- **Reversible route direction (v0.20.0)**: the route can be walked
  Abisko → Nikkaluokta (default) or Nikkaluokta → Abisko, chosen in Settings.
  One canonical GPX dataset feeds a pure, tested active-itinerary transform
  (reversed order/endpoints/geometry, distances rebuilt from 0, ascent/descent
  swapped, direction-aware editorial); every screen consumes the active
  itinerary rather than reversing data locally. Physical segment ids `d1`–`d7`
  are kept as stable identities (a saved current stage, Map selection and deep
  links survive a direction change) while the displayed day is direction-
  derived. Persisted schema v4 (older data defaults to forward); architecture
  recorded in [ADR 0003](docs/decisions/0003-route-direction.md). First
  architectural step toward a modular itinerary model — still exactly two
  validated directions, not a free-form builder.

- **Stage day guides & Daily checklist archive (v0.18.0)**: every stage card
  on Stages expands into a researched, hedged day guide (overview, trail
  character, highlights, plan-for notes) with sources and last-verified
  dates auditable in `src/data/stageGuides.mjs`; stage-card actions
  redesigned (top-right "Set as current" pill, non-interactive "Current"
  status pill, bottom-of-card guide disclosure); the Daily checklist was
  removed from the active product and archived with a recovery record
  (docs/archived-features/daily-checklist.md), persisted schema v3 dropping
  its data safely while preserving everything else.

- **Nordic terrain legibility & comparison retirement (v0.17.0)**: measured
  archive audit (the generalised z≤7 landcover covers ~100% of the corridor
  and vanishes at z8, leaving most of the map without terrain polygons);
  solid muted vegetation ladder, sage/lichen-green open-fjäll base (a
  cartographic generalisation of the unclassified open ground — not mapped
  grassland), peat-brown wetland wash, firmer rock grey and a smooth z7→z8
  landcover handover; contours appear earlier (100 m index fading in from
  z9.5, 20 m from z11.5 — needs the retiled terrain-data-v3 contours
  archive; graceful with older archives); contour elevation labels assessed
  and deferred to the *Offline map labels* item; the temporary comparison
  selector, the Current/Liberty runtime styles, the Thunderforest online
  preview and the `VITE_ENABLE_MAP_BENCHMARK` flag removed — Liberty Topo —
  Nordic is the single production terrain basemap.

- **Square desktop map layout (v0.16.0)**: corrected the v0.15.0
  desktop/landscape composition — the map viewport is a 1:1 square whose
  card (with its navigation and tracking rows) is exactly as wide as the
  map and fits COMPLETELY inside one viewport (the square consumes only
  the height left after reserving measured space for header, action rows
  and status banners; landscape screens under 700px tall fall back to the
  compact stacked layout), and the route-information column takes all
  remaining width; the east/west coverage for the square full-route view
  was recalculated (~186–220 km fit via the existing overview expansion,
  inside the ~309 km physical z7 envelope — no archive rebuild).

- **Bounded Kungsleden map (v0.15.0)**: coverage contract (route
  + 12 km user bounds as camera maxBounds, + 3 km hidden data margin, all
  archives generated from one source of truth in
  scripts/route-configs.mjs); terrain pipeline rebuilt on real DEM
  coverage (no extrapolation → no edge streaks/rectangle);
  terrain-data-v2 + satellite-data-v3 releases; 4:5 desktop map (superseded
  by the v0.16.0 square layout),
  width-relative mobile map height, full-screen with per-shape camera
  constraints; north-up policy (rotation/pitch disabled); compact mobile
  style selector.

- **Terrain relief — contours & hillshade (v0.14.0)**: the map renders
  hillshade (MapLibre `hillshade` on a terrain-RGB raster-dem source) and
  20 m/100 m contour lines from two bounded PMTiles archives (~15 MB
  together) built from the open Copernicus DEM GLO-30 by
  `scripts/build-terrain-map.sh`. Distribution mirrors the satellite model
  (versioned `terrain-data-vN` release, SHA-verified deploy injection,
  same-origin serving); Settings → Terrain relief downloads both files as
  one action for offline use; without the archives the map renders exactly
  as before. This also unblocked the Liberty Topo styles' defining
  contour/hillshade layers.
- **Nordic terrain hierarchy restyle (v0.13.0)**: benchmark Phase 1
  executed — forest/scrub/grass hierarchy, wetland as a translucent overlay
  wash, stronger rock, outlined glaciers, lake/river distinction, earlier
  rivers and reliable streams, earlier trails, de-emphasised roads. The
  route, GPS and hut overlays remain the most prominent layer everywhere.
- **Thunderforest Outdoors benchmark & Nordic translation plan (v0.12.0,
  deployed)**: temporary, feature-flagged online comparison layer on the Map
  screen (repository variable `VITE_ENABLE_MAP_BENCHMARK`, API-key-gated,
  never offline, never the default), validated live on production Pages; the
  measured source-layer audit and the prioritised, phased translation plan
  (docs/maps/thunderforest-outdoors-benchmark.md) are the design input for
  the *Terrain context* item above. The Nordic terrain restyle itself is NOT
  started — the benchmark layer and its key are removed when that work
  concludes.
- **Map style decided: Liberty Topo — Nordic** is the production Terrain
  style (the Liberty Topo structure restyled with the Nordic Trail design
  language). The comparison prototype's in-app selector was removed; the
  registry and palettes remain so the look stays centrally adjustable
  (docs/map-style-comparison.md records the evaluation and decision).
- **Multi-device access (v0.9.0)**: one adaptive application through the
  same URL on phone, tablet and desktop. Hash-based routing (`#/today` …
  `#/settings`) with working Back/Forward, refresh-safe destinations and
  bookmarkable primary screens; a responsive shell (bottom tab bar on
  compact, navigation rail on tablet, labelled sidebar on desktop — same
  six destinations, order and labels everywhere); wider screen
  compositions for Today/Map/Stages/Stops/Lists/Settings. Phones are
  portrait-only (runtime rotate-to-portrait guard + best-effort lock in
  installed phone PWAs); the manifest stays orientation-neutral so tablet
  PWAs keep landscape. The compact/mobile experience is the protected
  regression baseline and is functionally unchanged. Device transfer
  remains manual export → import, now covered by a round-trip test.
- **Delft pilot removed** after graduation: panel, route/map assets, feature
  flag, workflow and pilot docs deleted; the field-validated tracking core
  lives on as production code. Anonymised results remain in
  docs/pilot-results/.
- **Beta-tester readiness**: user-facing README with a direct app link and
  usage best practices (technical docs moved to docs/DEVELOPMENT.md), an
  in-app Feedback card, a structured GitHub beta-feedback issue template,
  and map-status refinements from the first device feedback (compact
  top-of-map Live Tracking button with expandable details, bottom off-route
  bar with tap-for-detail, one-shot Locate recentring the map).
- **Production live-tracking UX for Kungsleden (beta)**: opt-in,
  foreground-only live tracking on the Map screen with a map-centric status
  overlay (active / GPS-uncertain / qualified off-route), full-route status
  separated from current-stage progress, compact battery communication, and
  none of the pilot diagnostics. Browser-validated with simulated
  geolocation; real Kungsleden trail validation still outstanding (Later).
- **Delft pilot field test** (2026-07-07): real-device validation of the Map
  tab — live tracking, projection, off-route classification, the inline
  off-route warning and the offline pilot basemap all behaved correctly on a
  walked route; functionally successful and fully validated, no further Delft
  testing required (docs/pilot-results/delft-2026-07-07-summary.md).
- Along-route GPS progress (position projected onto the current stage, with a
  reliability gate).
- Installable-PWA polish: install card, prompt-based update toast,
  offline-ready confirmation.
- Verified GPX route pipeline with generated route statistics.
- Per-stage elevation profiles.
- Offline MapLibre + PMTiles vector basemap.
- Sentinel-2 satellite overview layer (EOX cloudless 2024).
- Independent offline downloads for the vector and satellite archives.
- Release-asset → GitHub Pages deployment pipeline for the satellite archive
  (verified SHA-256/size, served same-origin).
- Central source/licence attribution registry feeding the map control,
  archive cards and credits sheet.
- Source & licence disclosures on the Settings archive cards.
- Data sources & credits interface in Settings.
- Backup and restore of local app data.
