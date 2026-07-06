# Changelog

Notable, user-meaningful changes to Fjällkompis. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the
pre-1.0 rules in the [README](README.md#versioning--releases).

> Entries for 0.1.0 and 0.2.0 were reconstructed from git history on
> 2026-07-06, when this changelog was introduced; they are deliberately
> summaries, not complete lists.

## [Unreleased]

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
