# Fjällkompis roadmap

Canonical roadmap for Fjällkompis. This file — not the README, code comments
or commit messages — is the single source of truth for priority and progress.
Delivered iterations are summarised in [CHANGELOG.md](CHANGELOG.md); versioning
rules live in the [README](README.md#versioning--releases).

## Current state

Offline-first Kungsleden trail companion PWA (prototype, v0.3.x). The core
trip loop works end to end and offline: verified route with stage statistics
and elevation profiles, an offline vector basemap plus an optional Sentinel-2
satellite layer (each independently downloadable), a curated stops guide,
daily/packing lists, and local backup/restore. Not yet field-tested — still
labelled *prototype, not for primary navigation*.

## Now

1. **GPS route progress** — project the live GPS fix onto the route line so
   the app shows along-route "km done / km left" instead of straight-line
   distance to the next hut. Highest-value gap in the daily hiking loop.
2. **Installable-PWA polish** — clearer install prompt, a service-worker
   update toast, and richer offline states, so installing and updating the
   app is understandable without developer knowledge.

## Next

3. **Offline map labels** — self-hosted/local PBF glyphs so the basemap can
   render general text labels without any remote font dependency (hut names
   are already local HTML markers).
4. **Terrain context** — contour lines and/or hillshade from an offline
   terrain PMTiles source, subject to archive-size measurements.

## Later

5. **Trim the initial bundle** — lazy-load/code-split MapLibre behind the Map
   screen so first paint doesn't pay for the map engine.
6. **Real-device field testing** — battery, GPS accuracy, glove/sunlight
   usability and offline behaviour on the trail; a prerequisite for calling
   any release trip-ready (1.0.0).

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
