# Fjällkompis roadmap

Canonical roadmap for Fjällkompis. This file — not the README, code comments
or commit messages — is the single source of truth for priority and progress.
Delivered iterations are summarised in [CHANGELOG.md](CHANGELOG.md); versioning
rules live in the [development docs](docs/DEVELOPMENT.md#versioning--releases).

## Current state

Offline-first Kungsleden trail companion PWA (prototype, v0.9.x). The core
trip loop works end to end and offline: verified route with stage statistics
and elevation profiles, along-route GPS progress on the current stage, an
offline vector basemap plus an optional Sentinel-2 satellite layer (each
independently downloadable), a curated stops guide, daily/packing lists,
install/update UX, opt-in foreground live tracking (beta) on the Map
screen, and local backup/restore. The app is one adaptive application:
the same URL works on phones (the protected baseline experience,
portrait-only by design — landscape shows a rotate-to-portrait prompt),
tablets (navigation rail, portrait and landscape) and desktop browsers
(persistent sidebar), with hash-based URLs (`#/today` … `#/settings`) and
working browser Back/Forward. The Map-tab GPS mechanics
(one-shot fix, foreground live tracking, projection, off-route states,
offline basemap handling) were validated in a real-device Delft pilot walk
(docs/pilot-results/delft-2026-07-07-summary.md); the Kungsleden itself has
not been field-tested — still labelled *prototype, not for primary
navigation*.

All personal data remains local to the browser/device in use; moving it
between devices is a manual export → import (device transfer). Automatic
cross-device synchronization is deliberately far down this roadmap.

## Now

1. **Community beta testing** — share the app with real hikers (Kungsleden
   and elsewhere), collect structured feedback through the in-app Feedback
   card and the GitHub beta-feedback issue template, and fold findings back
   into the Map/tracking experience. Kick-off requires nothing more than
   sharing the app link. **Multi-device access (delivered, v0.9.0) is the
   enabling step**: testers can now open the same link on phone, tablet or
   desktop instead of being limited to a phone-width column, which widens
   the tester pool and the range of feedback.
2. **Offline map labels** — self-hosted/local PBF glyphs so the basemap can
   render general text labels without any remote font dependency (hut names
   are already local HTML markers).
3. **Terrain context** — contour lines and/or hillshade from an offline
   terrain PMTiles source, subject to archive-size measurements. Also a
   prerequisite for the Liberty Topo variants to show their defining
   contour/hillshade layers (currently omitted for lack of offline data).
   Design input: the Thunderforest Outdoors benchmark and the prioritised
   Nordic translation plan
   (docs/maps/thunderforest-outdoors-benchmark.md) — the temporary
   online-only comparison layer on the Map screen exists solely to serve
   this restyle work and is removed when it concludes.

## Next

4. **Custom list portability and templates** — an early follow-up to
   multi-device access, and deliberately separate from it. Potential
   capabilities: import a standalone packing list; import or create a custom
   daily list; export an individual list; preview an import before applying
   it; map categories; validate invalid rows; detect duplicates; choose
   between adding, replacing or merging; and keep the current full-state
   backup as a separate function. Scope is list files only — no accounts,
   no sync.
6. **Trim the initial bundle** — lazy-load/code-split MapLibre behind the Map
   screen so first paint doesn't pay for the map engine.

## Later

7. **Real-device field testing on the trail** — battery, GPS accuracy,
   glove/sunlight usability and offline behaviour on the Kungsleden itself;
   a prerequisite for calling any release trip-ready (1.0.0). The Delft
   pilot de-risked the Map-tab portion.

## Much later (optional)

8. **Cross-device synchronization** — automatic sync of personal data
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
