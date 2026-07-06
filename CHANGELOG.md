# Changelog

Notable, user-meaningful changes to Fjällkompis. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the
pre-1.0 rules in the [README](README.md#versioning--releases).

> Entries for 0.1.0 and 0.2.0 were reconstructed from git history on
> 2026-07-06, when this changelog was introduced; they are deliberately
> summaries, not complete lists.

## [Unreleased]

## [0.5.0] - 2026-07-06

### Added

- **Delft pilot mode (temporary)**: a feature-flagged
  (`VITE_ENABLE_DELFT_PILOT`) route context on the Map tab for field-testing
  the map functionality on a short walk in Delft before the Kungsleden trip.
  Kungsleden remains the default; the pilot renders its own GPX-derived route
  and bounded PMTiles basemap with a fully separate offline-map cache, and no
  pilot state is ever persisted. Protocol and removal plan in
  [docs/delft-pilot-test.md](docs/delft-pilot-test.md).
- **Live GPS tracking (pilot-only)**: an explicit start/stop foreground
  tracking session (`watchPosition`, high accuracy, single watcher with
  guaranteed cleanup) that updates the position marker, a breadcrumb trail,
  along-route progress and cross-track distance as fixes arrive, plus a
  deliberate follow/recenter mode. Stale, invalid and very-low-accuracy
  readings are rejected; progress freezes (labelled stale) instead of jumping
  when the projection becomes unreliable.
- **Qualified off-route states (pilot-only)**: on route / uncertain / likely
  off route, derived from cross-track distance *and* reported GPS accuracy
  (documented thresholds), with a 3-consecutive-fix debounce before declaring
  off-route and instant recovery.
- **Pilot diagnostics panel**: per-fix log (timestamp, position, accuracy,
  fix age, cross-track, along-route km/%, projection reliability, status,
  acceptance) with JSON/CSV export. The log is session-only and stays on the
  device unless exported.
- Route manifest (`scripts/route-configs.mjs`): the GPX generator, the
  PMTiles extraction script and the app's dataset loading are now driven by
  per-route configuration instead of hard-coded Kungsleden values (structural
  expectations, stage-id prefixes, map buffer, output paths).

### Changed

- `MapView` accepts an optional route dataset, basemap archive and breadcrumb
  trail/follow props (defaults preserve the existing Kungsleden behaviour;
  the map instance is still created exactly once per mount).
- `scripts/extract-offline-map.sh` takes an optional route id
  (`kungsleden` default, `delft-pilot` for the pilot cutout).

## [0.4.0] - 2026-07-06

### Added

- **Along-route progress**: the Map screen projects the GPS fix (or manual
  stop pin) onto the persisted current stage and reports km done, km left and
  percent complete, with a reliability gate (max of 75 m and 3× reported GPS
  accuracy) that qualifies or rejects off-route/low-accuracy fixes instead of
  showing a confident-but-wrong number. Pure projection utility with its own
  test suite.
- **Install app card** in Settings: native install prompt where the browser
  supports it, honest Add-to-Home-Screen guidance elsewhere — never a dead
  button; status updates reactively after install or worker activation.
- **PWA lifecycle toasts**: "Update now / Later" when a new service worker is
  waiting, and a one-shot "ready for offline use" confirmation.

### Changed

- Service-worker updates are now **prompt-based** (single React-controlled
  registration): the app never reloads out from under unsaved input.
- Manual mode records which stop the position was pinned to, so stage
  start/end read exactly 0%/100% and an unrelated stop is flagged.

### Removed

- The straight-line "distance to next hut" metric, superseded by along-route
  progress.
- The static PWA status row in Settings, superseded by the Install app card.

## [0.3.0] - 2026-07-06

### Added

- Optional **Sentinel-2 satellite** overview layer (EOX cloudless 2024) as a
  switchable second basemap on the Map screen.
- Independent **satellite download** and offline storage in Settings, separate
  from the vector basemap archive.
- Verified **deployment-time injection** of the satellite Release asset into
  the GitHub Pages build (SHA-256 and size checked before and after the
  build), plus a reproducible runner-side pipeline to build the archive.
- Central **data-source and licence registry** (`src/data/attribution.ts`)
  feeding the map attribution control, the archive cards and the credits view.
- **Data sources & credits** interface in Settings (bottom sheet with map and
  imagery data, software credits and app information).
- Compact **source & licence disclosures** on the offline archive cards,
  replacing raw asset URLs.
- Version-consistency guard (`npm run check:version`) wired into the test and
  production-build gates.

### Changed

- Settings information architecture now presents user-relevant status,
  downloads, sources and credits.
- Satellite data is served **same-origin** from the GitHub Pages deployment
  (the app no longer needs a cross-origin fetch of the Release asset).
- App versioning now derives from `package.json` via a build-time constant;
  no manually synchronised version strings remain.
- App-wide **Nordic Trail** visual retheme; Today screen contour backdrop;
  tab bar with an active-tab indicator.

### Removed

- The internal, user-facing **Roadmap · TODO** card in Settings (the roadmap
  now lives in [ROADMAP.md](ROADMAP.md)).
- Duplicated hard-coded app-version literals (`src/constants.ts`,
  stale `package-lock.json` root version).
- The **Journal** section (journaling was cut from the prototype scope).

## [0.2.0] - 2026-07-03

Major product iteration: curated **Stops guide** with verified facility
snapshots, reworked **packing list**, redesigned **Today** homepage, and the
compass-mountain app icon.

## [0.1.0] - 2026-07-02

Initial prototype: Today/Stages/Lists/Settings screens with localStorage
persistence and PWA app-shell caching; then the verified-GPX route pipeline,
MapLibre GL map with the offline PMTiles vector basemap, per-stage elevation
profiles, and the Settings offline-map download.
