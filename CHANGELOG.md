# Changelog

Notable, user-meaningful changes to Fjällkompis. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the
pre-1.0 rules in the [development docs](docs/DEVELOPMENT.md#versioning--releases).

> Entries for 0.1.0 and 0.2.0 were reconstructed from git history on
> 2026-07-06, when this changelog was introduced; they are deliberately
> summaries, not complete lists.

## [Unreleased]

## [0.15.0] - 2026-07-10

### Changed

- **A deliberately bounded Kungsleden map.** The map is now a route
  companion with a defined supported area instead of an accidental world
  browser: the camera is fenced to the route plus ~12 km of surrounding
  terrain (`maxBounds` from the new coverage contract), zooming out stops
  at a complete overview of that area, pitch is off and the map stays
  north-up (rotation gestures disabled — the compass control is gone
  because there is nothing to reset). Every archive — vector, hillshade,
  contours, satellite — is generated for the same contract with a hidden
  safety margin, so no camera position can show a data edge.
- **Terrain relief without edge artefacts.** The relief pipeline now
  downloads real Copernicus DEM for the full tile-aligned footprint of
  every generated zoom and drops the no-data extrapolation entirely: the
  horizontal/vertical shading streaks, the visible relief rectangle and
  the abrupt relief disappearance seen in v0.14.0 on real devices are
  gone. Relief data ships as `terrain-data-v2` (terrain z7–12, ~18 MB;
  contours unchanged in style, ~6 MB); satellite imagery was regenerated
  to the same coverage as `satellite-data-v2` (~11 MB, down from 42 MB).
- **Map viewport proportions.** Desktop and tablet-landscape use a compact
  4:5 map beside the route panel (the full route fills ~85% of the map
  height in one "Fit route" view) instead of stretching across the layout;
  mobile portrait grows from a fixed 420 px to a width-relative height so
  the full-route view fits inside the supported bounds; fullscreen uses
  the whole screen with camera constraints recomputed for its shape.
- **Compact map-style selector on phones** (temporary comparison control):
  the long caption collapses to "Style" and option labels no longer
  truncate; all four styles stay usable with unchanged accessible labels.

## [0.14.0] - 2026-07-10

### Added

- **Terrain relief: hillshade and contour lines.** The Terrain map now
  shows the shape of the landscape: soft multidirectional-feeling hillshade
  (MapLibre's native `hillshade` layer on a terrain-RGB elevation source)
  and contour lines at a 20 m interval with a heavier line every 100 m —
  chosen from the 30 m DEM resolution, visual comparison, contour noise and
  storage measurements. Index contours appear from z11, the full
  set from z13; lakes stay unshaded and every route, water, road and hut
  element keeps its contrast above the relief. The data ships as two
  bounded PMTiles archives (~15 MB together) derived from the open
  Copernicus DEM GLO-30 elevation model by the new
  `scripts/build-terrain-map.sh` pipeline — repeatable from the recorded
  provenance manifest (not guaranteed bit-for-bit reproducible; the AWS
  mirror is unversioned) — hosted as a versioned GitHub Release and
  injected into deploys exactly like the satellite archive.
- **Settings → Terrain relief**: downloads both relief files as one action
  for fully offline hillshade and contours (independent of the basemap and
  satellite downloads), with the same status/progress/remove interface as
  the other archives, plus the Copernicus source and licence disclosure.
  Without the download (or the hosted files), the map renders exactly as
  before — relief is always optional.

## [0.13.0] - 2026-07-10

### Changed

- **Nordic terrain hierarchy restyle** (benchmark Phase 1,
  docs/maps/thunderforest-outdoors-benchmark.md §7): the production
  Liberty Topo — Nordic style now renders a deliberate terrain hierarchy
  instead of a uniform tint. Forest is clearly present (the birch-forest →
  open-fjäll edge is the strongest landcover boundary), the fjällbjörk
  scrub belt separates visibly from both forest and grassland, wetland
  becomes a semi-transparent cool wash *above* the underlying landcover
  (fading in z10→z12) so wet forest reads as both, exposed rock reads as a
  muted cool grey that strengthens at z12+, and glaciers gain a thin cool
  outline. Open alpine terrain stays the lightest, calmest surface.
- **Water hierarchy**: river and stream polygons render one step deeper
  than lakes (braided deltas read as flowing water), river lines fade in
  from z9 with a gentler width ramp, and streams appear reliably from z12
  — stream crossings are a safety-relevant feature.
- **Line hierarchy**: trails start one zoom earlier (z12) and keep their
  cloudberry treatment; track casings gain contrast against minor roads;
  the E10/major-road fill is desaturated a step so it no longer outshines
  the trail network. The active route, GPS and hut markers remain the most
  prominent elements on every screen.

## [0.12.0] - 2026-07-09

### Added

- **Thunderforest Outdoors comparison layer (online preview, temporary)**:
  the Map screen gains a **Map comparison — temporary** selector with four
  options — the three offline vector styles (Current, Liberty Topo, Liberty
  Topo — Nordic) plus **Thunderforest Outdoors — Online preview**, an
  online-only raster reference for improving the Nordic terrain style. The
  selector is feature-flagged (`VITE_ENABLE_MAP_BENCHMARK`): dev builds show
  it by default, production only when the flag is `true` — normal users keep
  the unchanged production map. The preview streams tiles from the official
  `api.thunderforest.com` endpoint only after being explicitly selected,
  needs a build-time API key (`VITE_THUNDERFOREST_API_KEY`; without it the
  option shows as unavailable and no Thunderforest request is made), is
  never part of offline downloads, and keeps all route, GPS and hut overlays
  on top. Switching styles preserves the camera and every overlay.
  Attribution: Maps © Thunderforest, Data © OpenStreetMap contributors.
- **Cartographic benchmark and Nordic translation plan**
  (docs/maps/thunderforest-outdoors-benchmark.md): a source-layer audit of
  the shipped PMTiles archive (including the so-far-unused `places` and
  `pois` label layers) and a prioritised, implementation-ready plan for
  reproducing Thunderforest-class terrain readability in the free,
  offline-capable Nordic style — without copying proprietary styling or
  data.

## [0.11.1] - 2026-07-09

### Changed

- **Compact hut-marker badge**: the marker's paper container shrinks from
  30px to 25px while the hut glyph keeps its size — less blank margin
  around the icon. The 44×44 touch target and the anchored coordinate are
  unchanged.
- **Position panel beside the map**: the Locate/live-tracking/manual-mode
  card moved from below the Map composition into the right-hand column,
  directly under the Day/Full-route summary panel. On mobile the stacking
  order is unchanged.
- **Map credits start collapsed**: the map's attribution ⓘ no longer
  opens expanded over the map on load; tap it to read the credits (also
  in Settings → Data sources & credits).

## [0.11.0] - 2026-07-09

### Added

- **Hut markers on the Map**: every mapped stop is now drawn as a clear
  hut/cabin badge (the same glyph as the Huts tab) instead of a generic
  dot, so "this is a hut or station" reads before any interaction. The
  route's start and end (Abisko, Nikkaluokta) keep the hut badge with a
  subtle cloudberry accent. Markers are real keyboard-focusable buttons
  with a 44×44 touch target around the ~30px badge, visible focus rings,
  and distinct hover and selected states.
- **Anchored stop previews**: tapping or keyboard-activating a hut marker
  opens a compact popup pinned to that stop — short name, up to four
  facility icons (same meaning and iconography as Huts & Stations), a
  "No shop"-style warning where relevant, and a chevron. The whole card
  is one action: it opens that stop's full details in Huts & Stations
  (mobile: the accordion expands and scrolls into view; landscape
  tablet/desktop: the existing master-detail panel). One popup at a
  time; it follows the map through pan, zoom and fullscreen; empty-map
  click, Escape, or tapping the selected marker again closes it. For
  assistive technology the preview announces one concise facility
  summary instead of a run of icons.

### Changed

- **The Map opens on the Full route by default.** The Map's browsing
  selection is now decoupled from the current trip stage: a fresh install
  (including loading directly at `#/map`) shows the complete route,
  full-route statistics and the full elevation profile first. Day 1
  remains the default current trip stage everywhere else (Today,
  Tonight's stop, Stages, live tracking, progress), selecting a day on
  the Map still never changes the persisted trip stage, and starting
  live tracking still focuses the tracked stage.

### Removed

- The below-map "waypoint detail" card. Every rendered waypoint is a real
  stop, so the anchored preview (and Huts & Stations behind it) replaces
  that panel — no more selecting a marker and seeing nothing happen
  because the result rendered off-screen.

## [0.10.2] - 2026-07-09

### Changed

- **Map screen copy**: the basemap hint moved from below the map to the
  screen subtitle — directly under the "Map" heading, above the map — and
  now reads "An offline basemap of the route. Tap a stage line or stop."

### Removed

- The small elevation figures beneath the elevation chart (start → end,
  min–max, ascent/descent): they duplicated the statistics grid directly
  above the chart in the combined summary card.

## [0.10.1] - 2026-07-09

Focused layout and UX refinements following the first real multi-device
test of the 0.9.0 adaptive shell, rebuilt on top of the 0.10.0 map-style
and tracking-overlay release. No new capability; app data, tracking,
offline behaviour, routing, map sources and device transfer are untouched.

### Changed

- **Narrower desktop sidebar**: the labelled sidebar (≥ 1160px) shrinks
  from 236px to 148px — icons, one-line labels, active states and focus
  rings all still fit. The tablet icon rail keeps its 84px, and every
  layout offset that follows the sidebar (Today's contour background, the
  PWA toast region) follows automatically.
- **Today subtitle**: the "Kungsleden" eyebrow above the Today heading is
  now uppercase ("KUNGSLEDEN"), matching the eyebrow styling of the other
  primary screens. Nothing else on Today changed.
- **Map information consolidated**: elevation now lives inside the
  Day/Full-route summary card — title and current-stage action first, the
  2×2 statistics, then a visually separated "ELEVATION" section with the
  chart. One panel instead of three overlapping surfaces; scrubbing the
  chart still moves the marker on the map.
- **Map on landscape tablet/desktop** (≥ 900×500): one map-dominant
  two-column composition — the complete map card on the left; a compact
  route selector ("Full route" then days 1–7 in one row) directly above
  the combined summary/elevation panel on the right. The canvas height
  follows the viewport, so heading, selector, map, statistics and chart
  share one screenful at 1024×768 up to 1440×900 without page scrolling
  (optional waypoint/position panels below may still scroll).
- **Huts & Stations on landscape** (≥ 900×500): opening a stop now
  switches the two-column grid to a clustered master-detail — every other
  stop stacked tightly on the left, the open stop as a full detail card
  in a stable right-hand column. No more large blank grid area beside a
  tall expanded card; selecting another stop no longer means scrolling
  through whitespace. Mobile and tablet portrait keep the single-column
  accordion, and the one-open-at-a-time, keyboard-navigation and
  Today → Tonight's-stop behaviours are unchanged.

### Removed

- The Map screen's Map/Elevation segmented control, the separate
  elevation panel with its duplicated title and distance, and the
  "Drag across the profile…" helper text. The map is always visible as
  the primary surface; elevation is part of the summary card everywhere.

## [0.10.0] - 2026-07-09

### Changed

- **The map's Terrain style is now "Liberty Topo — Nordic"** — the outcome
  of the three-way style comparison: the Liberty Topo cartography restyled
  with the Nordic Trail design language. The temporary *Style · prototype*
  selector is gone; the alternatives remain in code so the look stays
  centrally adjustable later.
- The live-tracking map pill is now minimal — blinking dot, "Live", battery
  icon; its expanded details read "Live Tracking: Day X".
- The off-route bar moved from the bottom edge of the map to directly
  beneath the Terrain/Satellite toggle; its distance/guidance detail now
  pops below the bar.

## [0.9.0] - 2026-07-09

### Added

- **Multi-device access**: the same app URL now works properly on phones,
  tablets (portrait and landscape) and desktop/laptop browsers — one
  adaptive application, one codebase, no separate versions. The existing
  phone experience is the protected baseline and is functionally
  unchanged: same bottom tab bar, same six destinations in the same order,
  same screens, actions and touch interactions.
- **URL-aware navigation**: hash-based routes for the six primary
  destinations (`#/today`, `#/map`, `#/stages`, `#/stops`, `#/lists`,
  `#/settings`). Browser Back/Forward work, refreshing keeps you on the
  same screen, and primary destinations are bookmarkable — including on
  the GitHub Pages subpath. Unknown hashes fall back safely.
- **Adaptive navigation**: the bottom tab bar (compact), a vertical
  navigation rail (tablet, ≥ 760px wide and ≥ 500px tall) and a
  persistent sidebar with visible labels (desktop, ≥ 1160px wide, same
  height gate) are one and the same component with identical
  destinations, order and active-state meaning. On tablet/desktop the
  navigation precedes the content in focus order — keyboard and
  screen-reader order match what you see.
- **Portrait-only phones**: on phones Fjällkompis is a portrait-only
  trail companion. Rotating a phone to landscape shows an accessible
  full-screen "Rotate your phone" prompt instead of a landscape layout;
  rotating back resumes exactly where you were (same screen, same state,
  GPS/live tracking untouched). Detection is capability- and space-based
  (touch + no hover + phone-short viewport), never device sniffing, so
  tablets keep both portrait and landscape and desktop windows are
  unaffected. Installed phone PWAs additionally attempt a best-effort
  system portrait lock where the browser supports it.
- **Wider screen compositions** (≥ 900px): Today places the journey card
  beside the Tonight/Daily cards under a full-width hero; Map keeps its
  existing side-by-side map + elevation layout, now with a taller canvas
  and readable-width cards beneath; Stages and Stops use two-column card
  grids; Lists shows categories in two columns; Settings arranges its
  cards in two columns. Section order and actions are unchanged
  everywhere.
- A device-transfer round-trip test (`tests/device-transfer.test.mjs`)
  protecting the full-state export/import: current stage, daily-list
  ticks, packing statuses/quantities/custom items, stop notes and journal
  entries all survive export → import. (They already did — the test
  fences that behaviour.)
- A navigation-route test (`tests/navigation-routes.test.mjs`) fencing the
  six destinations' order, labels and URLs.

### Changed

- The PWA manifest no longer forces portrait orientation globally
  (`orientation: 'any'`), so installed **tablet** PWAs can use landscape
  and desktop PWA windows stay responsive. Phones remain portrait-only —
  enforced at runtime by the rotation prompt (and a best-effort system
  lock in installed phone PWAs), because a single static manifest cannot
  express "portrait on phones, any on tablets".
- Bottom sheets (Data sources & credits) become centred modal dialogs on
  wider screens; update/offline toasts anchor to the content area instead
  of a phone-width column.

### Unchanged (deliberately)

- No backend, no accounts, no synchronization. Personal data stays local
  to each browser/device; offline maps are downloaded separately per
  device; moving data between devices remains manual export → import in
  Settings.

## [0.8.0] - 2026-07-07

### Added

- **Map-style comparison prototype**: a developer-facing "Style · prototype"
  selector on the Map screen renders three basemap styles from the same
  offline PMTiles source — **Current** (production, unchanged), **Liberty
  Topo** (the gpx.studio Liberty Topo design adapted to the Protomaps
  schema; style only, no gpx.studio tiles/fonts/sprites) and **Liberty Topo
  — Nordic** (the same structure in the Nordic Trail palette). Switching is
  instant and in place: camera, route overlays, hut markers, GPS dot and UI
  state are preserved, and all three stay glyph-, sprite- and network-free.
  Architecture, licence lineage, the Liberty layer-mapping table and the
  evaluation checklist are documented in `docs/map-style-comparison.md`;
  guarded by `tests/map-styles.test.mjs`. **No production style decision has
  been made** — the default style is unchanged.
- Liberty Topo / OSM Liberty style attribution (MIT · BSD-3-Clause ·
  CC BY 4.0 lineage) registered in the central credits registry and shown in
  Settings → Data sources & credits.

## [0.7.0] - 2026-07-07

### Added

- **Feedback path for beta testers**: a Feedback card in Settings linking to
  a structured GitHub *Beta feedback* issue form (app version, device,
  screen, what happened, privacy checkbox — never exact coordinates). A free
  GitHub account is required to submit; the card says so honestly.
- **Tap-for-detail map status**: the off-route warning is now a compact bar
  at the bottom edge of the map (between the scale and the attribution ⓘ) —
  compass icon, "You may be off route", and a ⚠ affordance that pops the
  approximate distance ("… m"/"… km" as appropriate) and guidance above it.
  It no longer covers the tracking dot while Follow centres the map.
- One-shot **Locate now recentres the map** on the fix (previously it only
  placed the marker, which read as "nothing happened").

### Changed

- The live-tracking status is a compact "● Live Tracking 🔋" button on the
  top edge of the map beside the layer toggle; tapping it expands the
  details (tracked day, battery note, foreground-only note).
- **README rewritten for app users** — what Fjällkompis is, a direct link to
  the app, getting-started steps and on-trail best practices; all technical
  documentation moved to docs/DEVELOPMENT.md.

### Removed

- **The temporary Delft pilot**, completed and graduated: pilot panel, route
  context selector, Delft GPX/PMTiles/generated data, feature flag, map
  cache rule, Actions workflow and pilot docs. The validated tracking core
  remains as production code; anonymised field-test results remain in
  docs/pilot-results/.

## [0.6.0] - 2026-07-07

### Added

- **Live tracking (beta) on the Kungsleden Map screen**: explicit opt-in,
  foreground-only GPS tracking of the persisted current stage, graduated
  from the field-validated Delft pilot mechanics. A compact control row
  under the map offers one-shot Locate, Start/Stop live tracking and a
  deliberate Follow mode (auto-disabled by manual panning); starting focuses
  the tracked stage and enables Follow. Requires a current stage; never
  persists "tracking active" or any location history.
- **In-map tracking status overlay** (visible in fullscreen too): a compact
  status stack showing *Live tracking · Day X · higher battery use*, a
  damped *GPS signal uncertain* state, and — highest priority — the
  persistent, qualified off-route warning ("You may be off route ·
  approximately X m from the mapped route") that clears immediately on
  recovery. Non-modal, no sound/vibration/notifications; screen readers are
  told about status transitions only, never per-fix updates.
- **Full-route vs current-stage separation**: on/off-route status is judged
  against the complete Kungsleden route, while completed/remaining/percent
  progress uses the current stage only — standing on a different stage reads
  "On the mapped route, but not reliably matched to today's stage" instead
  of a false off-route warning or a misleading percentage.

### Changed

- The pilot tracking core is now shared production code
  (`src/utils/trackingSession.mjs`, `src/hooks/useRouteTracking.ts`) with
  the validated classification, debounce and acceptance rules unchanged;
  the Delft pilot runs on the same core with its diagnostics log, breadcrumb
  and exports enabled — production Kungsleden tracking keeps none of those
  (no per-reading log, no breadcrumb, no exports, no raw coordinates).
- The Kungsleden position card no longer prints raw coordinates; it shows
  the position source and accuracy instead (the map marker is the position).
- One position source at a time: one-shot Locate and manual mode are
  disabled/hidden while a live session is running.

## [0.5.2] - 2026-07-07

### Added

- **Inline off-route warning during live tracking** (pilot): while tracking
  is active and the debounced session status is *off-route*, a non-modal
  banner states "You may be off route · approximately X m from the mapped
  trail. Check the map and your surroundings." It never appears for
  *uncertain*, reuses the accuracy-aware classification and 3-fix debounce,
  and clears immediately on recovery. No notifications, vibration or sound.
- **Battery note while live tracking is active** (pilot): plain statement
  that high-accuracy location stays active while the screen is open — no
  measured percentages claimed.
- Anonymised Delft field-test results
  (docs/pilot-results/delft-2026-07-07-summary.md): the pilot was
  functionally successful; documents the accepted nearest-segment
  along-route ambiguity between geographically close route sections.

## [0.5.1] - 2026-07-06

### Changed

- **Delft pilot route replaced** with the final walkable version (2.0 km,
  81 points, distinct start/end 513 m apart); the pilot offline basemap is
  re-extracted around the new route corridor (+2 km buffer). Kungsleden data
  is untouched.

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
