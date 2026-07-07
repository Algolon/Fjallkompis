# Fjällkompis roadmap

Canonical roadmap for Fjällkompis. This file — not the README, code comments
or commit messages — is the single source of truth for priority and progress.
Delivered iterations are summarised in [CHANGELOG.md](CHANGELOG.md); versioning
rules live in the [README](README.md#versioning--releases).

## Current state

Offline-first Kungsleden trail companion PWA (prototype, v0.5.x). The core
trip loop works end to end and offline: verified route with stage statistics
and elevation profiles, along-route GPS progress on the current stage, an
offline vector basemap plus an optional Sentinel-2 satellite layer (each
independently downloadable), a curated stops guide, daily/packing lists,
install/update UX, and local backup/restore. The Map-tab GPS mechanics
(one-shot fix, foreground live tracking, projection, off-route states,
offline pilot basemap) were validated in a real-device Delft pilot walk
(docs/pilot-results/delft-2026-07-07-summary.md); the Kungsleden itself has
not been field-tested — still labelled *prototype, not for primary
navigation*.

## Now

1. **Decide the Delft pilot's future** — the field test is complete and the
   pilot code is still in the app behind its flag: either remove the
   temporary pilot and its assets, or refactor the generic live-tracking
   pieces into an opt-in Kungsleden beta (separate PR either way).
2. **Offline map labels** — self-hosted/local PBF glyphs so the basemap can
   render general text labels without any remote font dependency (hut names
   are already local HTML markers).
3. **Terrain context** — contour lines and/or hillshade from an offline
   terrain PMTiles source, subject to archive-size measurements.

## Next

4. **Trim the initial bundle** — lazy-load/code-split MapLibre behind the Map
   screen so first paint doesn't pay for the map engine.

## Later

5. **Real-device field testing on the trail** — battery, GPS accuracy,
   glove/sunlight usability and offline behaviour on the Kungsleden itself;
   a prerequisite for calling any release trip-ready (1.0.0). The Delft
   pilot de-risked the Map-tab portion.

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

- **Delft pilot field test** (2026-07-07): real-device validation of the Map
  tab — live tracking, projection, off-route classification and the offline
  pilot basemap all behaved correctly on a walked route; functionally
  successful (docs/pilot-results/delft-2026-07-07-summary.md).
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
