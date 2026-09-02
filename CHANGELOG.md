# Changelog

Notable, user-meaningful changes to Fjällkompis. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the
pre-1.0 rules in the [development docs](docs/DEVELOPMENT.md#versioning--releases).

> Entries for 0.1.0 and 0.2.0 were reconstructed from git history on
> 2026-07-06, when this changelog was introduced; they are deliberately
> summaries, not complete lists.

## [Unreleased]

## [1.0.0] - 2026-09-02

First trail-ready stable release. Functionally identical to the
successfully device-tested 0.27.0 Internal Testing build 2700018 — this
release changes version metadata only; no map data was rebuilt or
republished.

### Added

- **The Satellite layer now shows real aerial detail.** Satellite imagery
  is a hybrid archive (~280 MB): Sentinel-2 satellite imagery for the wide
  view, with Lantmäteriet aerial orthophotos along the trail corridor at
  the detailed zooms — noticeably sharper terrain, paths and buildings
  where it matters.
- **Optional HD detail add-on (Android).** A second, larger download
  (~2.04 GB, two files managed as one choice) that sharpens the Satellite
  layer to ~0.9 m per pixel at maximum zoom along the trail. It requires
  Satellite imagery, renders automatically in the same SAT mode, works
  fully offline, and can be removed on its own. Android-only for now —
  the file sizes exceed what the web app's hosting can carry.

- **Weather is a new Guide section (prototype).** Guide → Weather shows a
  saved SMHI forecast for the eight named stops along the route, in
  walking order for your chosen direction. Pick a day on the compact date
  strip and scan conditions, temperatures, precipitation and wind for
  every location at once; tap a location for its morning/afternoon/evening
  detail. One deliberate *Update forecast* tap while online saves the
  whole route forecast on the device — it then stays fully readable in
  airplane mode, and the screen always says when it was saved and how far
  it reaches. A failed update never touches the forecast you already
  saved, an old forecast is labelled as old rather than shown as current,
  and days beyond the saved horizon say so instead of guessing. Today is
  deliberately unchanged; Settings → Trail Readiness gains a single
  "Weather — saved through …" fact.

- **PDFs now open inside Fjallkompis.** Tapping a stored PDF — from the
  Wallet, a Travel & stays attachment, or the Today quick-access ticket
  button — shows the document in the app's own viewer, layered over the
  screen you were on: the page behind stays visible around a dimmed edge,
  the document title sits on top, pages stack below, and closing (the ×,
  tapping outside, or Android Back) puts you back exactly where you were.
  Pinch zooms around your fingers and stays put when you let go; one
  finger scrolls, and pans when zoomed in. No external PDF app opens and
  no browser tab is involved, on Android or in the browser/installed app,
  and everything works fully offline. A file that turns out not to be a
  readable PDF says so honestly and offers to save a copy instead. Images
  keep their existing quick viewers.
- **Terrain relief and satellite imagery now work on Android.** They were
  web-only: the Android app shipped the vector basemap inside the package and
  had no way to reach the other archives at all. Both are now the same
  optional download they have always been in the browser, from the same
  published files — same Settings cards, same wording, same states. The
  downloads go into the app's own private storage (no new permission, nothing
  visible to other apps, removed when you uninstall), are checked against a
  published checksum before they are kept, and can be cancelled part-way. A
  download that is interrupted or arrives damaged is discarded rather than
  half-used, and whatever map you already had is left untouched.
- **Settings tells the truth about the map that ships with the app.** On
  Android the basemap is included in the install and works offline from the
  first launch, but Trail readiness said "Not downloaded" and offered to
  download it. It now reads *Included in the app*, with no download or remove
  button for something there is nothing to fetch or reclaim.

### Changed

- **The Map is ready the moment you open it.** The map is now prepared
  quietly in the background right after the app starts (never delaying
  startup) and then kept running while you use the other tabs — so the
  first deliberate Map open, and every one after it, shows an
  already-drawn map instead of building one on the spot. Your view also
  stays where you left it: the camera position, the stage you were
  browsing, the terrain/satellite choice and an open hut preview all
  survive switching tabs. Leaving the Map still stops any live-tracking
  session (nothing tracks your location in the background), and changing
  walking direction still resets the map to the new route as before.
- **The Map appears sooner on the first open.** On the Android app, the
  first visit to the Map in a session used to show its controls over a
  blank surface for several seconds. Two things changed: the map data
  included with the app is now prepared quietly in the background right
  after the app starts (never delaying startup itself, and never
  downloading anything), and the map now appears as soon as the terrain
  and your route are actually drawn, instead of also waiting for every
  optional layer and animation to settle. Later Map opens in the same
  session were already fast and stay that way.
- **Terrain relief and satellite imagery are now used only from your own
  device.** Previously the browser version could quietly stream them over the
  network when you switched layer, which meant tens of megabytes could start
  downloading because you opened a menu — and it made the same button behave
  differently in the browser than on the phone. Both now stay switched off,
  with one line saying where to get them, until you have downloaded them in
  Settings. The basemap is unaffected: it still loads without any download,
  and on Android it is part of the app.

- **Complete backup & restore.** Settings now offers one portable backup file
  (`fjallkompis-backup-YYYY-MM-DD.fjallkompis`) containing everything needed
  to restore a Fjallkompis setup on another install or device: trip data AND
  the actual PDF and image files stored in the Trail Wallet — the files the
  JSON export has never carried. The backup is refused (with the documents
  named) if any stored document is missing its file, so a "complete" backup
  can never quietly be incomplete. Restoring validates the whole file first
  and asks before replacing anything; if a restore fails midway, the previous
  data is put back. Document links on Travel and Stay items survive the round
  trip. The lightweight JSON export stays available and unchanged, and the
  two are now clearly told apart in Settings. On Android the backup saves
  through the system file picker.

- **The Map became a trail cockpit.** A scope pill in the top-left always
  says what you are looking at — *Full route*, *Day 3 · Alesjaure →
  Tjäktja*, or the place you opened with “View on map” — and opens a sheet
  listing the whole route and every day of your walking direction, marking
  what you are **viewing** and which stage is your **current** one
  separately. A compact control stack on the right holds the map layer, fit,
  **Locate me** and **live tracking**, each with its own button: one taps for
  a single GPS fix, the other opens a foreground tracking session.
- **Choosing the map layer is now a small menu on the button**, not a panel
  from the bottom of the screen. Terrain and Satellite sit in one list;
  when satellite imagery isn’t downloaded it stays visible, disabled, with
  one line saying where to get it.
- **While live tracking runs, a small pill sits above the navigation**: a
  live dot, the stage being followed, a short route state (*On route*,
  *Match uncertain*, *Waiting for GPS*, or an honest *You may be off route*)
  and a clear **Stop**. Panning the map pauses the camera without stopping
  tracking — the control then reads **Resume following** and recentres you
  when you tap it.

### Changed

- **The Map is now a workspace instead of a page.** The map fills the whole
  screen between the status bar and the navigation you already use — no
  screen header above it, no page scrolling under it, and no panel or card
  taking a share of it. Everything that used to sit far below the fold
  (stage selection, Locate, live tracking) is a control on the map itself.
  The bottom navigation on phones and the rail/sidebar on larger screens
  stay exactly where they were.
- The map's own fullscreen button is gone: it took the navigation off
  screen, and the map already uses the whole workspace. No part of the app
  uses the browser's fullscreen mode.
- The map now frames routes, stages and focused places into the part of the
  map you can actually see, instead of centring them under the controls: a
  fitted route no longer disappears behind the status dock. On phones the
  route overview can need a slightly taller view than the normal panning
  bounds allow, so the existing overview widening (already used east/west on
  wide screens) now also applies north/south — still strictly inside the
  downloaded map data, and still only while zoomed out.
- Missing satellite imagery is explained in the map-layer menu instead of a
  permanent banner across the map; a missing offline basemap shows a small
  note on the map itself, since it changes what you are looking at. A
  refused or failed action — location denied, tracking without a current
  stage — says so briefly on the map and then clears itself.
- **The Map no longer carries a permanent status panel.** The idle map shows
  the scope control and the map controls and nothing else; the detailed
  along-route progress readout has left the Map rather than hide in a
  drawer, and will get a deliberate home on Today. Its calculations are
  unchanged.
- Zoom buttons only appear for mouse/trackpad users — on touch, pinch is the
  gesture and the map keeps the space.

### Changed

- **The product is now spelled "Fjallkompis".** The app name shown on your
  home screen, in the browser tab, in the installed-app list and throughout
  the app drops the diaeresis: *Fjällkompis* becomes **Fjallkompis**. This is
  a name change only — nothing about your saved trip, packing lists, Trail
  Wallet documents, downloaded maps or backups is affected, and existing
  backup files restore exactly as before.

### Fixed

- **The Fjallkompis app icon is round on launchers that ask for a round
  icon.** On older Android versions (7.0 and 7.1) the round launcher icon was
  a copy of the square one, so on a home screen that uses circular icons
  Fjallkompis appeared as a square amongst circles. It is now properly
  circular. Newer Android versions were unaffected. The logo itself is
  unchanged, on every platform: the app icon, the browser tab icon, the iOS
  home-screen icon and the Android launcher and startup screen are now all
  produced from one master image, and the build checks they stay that way.

- **The Android app's built-in map renders again on a fresh install.** The
  vector basemap that ships inside the Android app package was being read
  with HTTP byte-range requests, which the app's internal asset server does
  not serve correctly — on a first launch with nothing downloaded, the Map
  tab opened to route lines on a plain background and no map behind them.
  The app now reads its packaged map as one complete file, so the full topo
  map is there from the first launch, with no network and no download step.
  Release builds are additionally checked so an Android package can never
  ship without the map data again. Web and PWA behaviour is unchanged.

### Removed

- **The external PDF hand-off is gone.** Opening a Wallet PDF on Android
  used to hand the document to an installed viewer app (Adobe or similar).
  Now that PDFs open inside Fjallkompis, that system integration — the
  native bridge, its staging cache and its FileProvider entry — has been
  removed entirely; "Download a copy" and the backups are untouched.

## [0.27.0] - 2026-08-01

### Added

- **Your Day plan can become Today’s active Journey.** A persistent, explicit
  **Use Day plan on Today** switch replaces the generic seven-Stage progress
  on Today with your own calendar days — Hiking, Travel, Rest & explore, or a
  mix, in the order you stored them — without hiding the canonical Stages
  browser. Personal Today resolves Preview first, then a manually selected
  day, the matching local date, or an honest first- or final-day view before
  or after the trip. The Journey summary opens a compact day chooser; **Follow
  plan dates** clears manual day/leg pointers without changing the current
  canonical Stage. New and existing plans stay inactive until switched on,
  and Preview remains temporary in either mode.
- **Stops became Stops & places, with STF Kiruna as the first place beyond
  the trail.** A separate **Before & after trail** section joins the eight
  route stops (which keep their walking order, kilometres, facilities and
  deep links). STF Kiruna Hotel & Hostel shows verified reference facts —
  address, capacity, check-in/out times, facilities, the official STF
  source and its last-verified date (2026-07-31) — with no trail
  kilometres and no claim it lies on Kungsleden. Track stay creates a
  correctly linked Hotel / hostel item with no invented dates.
- **A Stay can now be linked to a known place — and relinked, or
  unlinked.** The Stay editor gains a grouped **Linked place** selector
  (route stops in the active walking direction, then Before & after
  trail). The place is reference information: linking, moving or removing
  it never rewrites your title, dates, status, notes, booking reference or
  documents, and Day-plan overnights stay exactly where they were.
  Existing route links (`linkedStopId`) migrate automatically and stay on
  the same stable ids; a link to a place a future version no longer ships
  is kept and shown honestly as unavailable, never silently cleared. A
  stay somewhere the app does not catalogue — a wildcamp night, a private
  address — remains a plain **Other stay** with a free-text location, and
  works everywhere a linked stay does, including as a Day-plan overnight.
- **Several stays at one place are now first-class.** A place with no
  linked stay offers **Track stay**, exactly one linked stay opens
  directly with **View stay in Trip**, and several show **"N stays in
  Trip"** with a focused chooser (title, status, dates, plus **Add
  another stay**) — the app never guesses at a first match. Linked stay
  cards carry a small "Linked · place" line, and **View place** navigates
  back from a stay to its card on Stops & places.
- **The plan says how it differs from the full route.** Edit mode shows
  one compact, informational summary (sections not planned, walked more
  than once, walked in reverse, days that start away from where the
  previous one ended, an early finish) with the specifics behind a
  disclosure. Differences are personal choices, not errors: nothing is
  auto-repaired and no edit is blocked by them.

### Changed

- **A hiking day now owns its exact route legs.** The Day plan's hiking
  model stores explicit ordered legs — each referencing one canonical
  stage with an absolute direction over it — instead of a count of
  adjacent stages consumed from a shared cursor (persisted schema
  v9 → v10; existing plans migrate automatically and render identically).
  A stage can now be skipped, walked twice, walked in reverse, or walked
  on two different days; an out-and-back day (Kebnekaise → Nikkaluokta →
  Kebnekaise) is finally representable; and editing one day can never
  change another day. The route stages themselves — geometry, statistics,
  guides — remain immutable and verified.
- **"Change endpoint" became a focused leg editor.** A hiking day's sheet
  now lists its exact ordered legs and offers only physically connecting
  additions (with route, distance, direction and whether the section is
  already planned elsewhere), plus explicit Reverse, Walk again, reorder
  and remove actions. Removing a day's walking is its own confirmed step —
  never a silent side effect of an activity toggle.
- **Upgrading is automatic — and cautious.** Opening this version once
  migrates stored data from persisted schema v9 to v10: every hiking
  day's stage count becomes the equivalent explicit legs, and existing
  route-linked stays move to place links on the same stable ids. Trip
  items, day ids, overnight choices, attached documents, packing and
  route progress are untouched, and backup export/import and device
  transfer carry the new shape end to end. A stored Day plan that cannot
  be migrated safely is never guessed at or discarded: it is set aside
  verbatim, Settings shows a recovery notice with **Download original
  plan** and an explicit **Remove recovery copy**, and the rest of the
  app keeps working. Until **Use Day plan on Today** is switched on,
  Today keeps the familiar generic seven-Stage experience.

## [0.26.3] - 2026-07-31

### Fixed

- **A previewed day shows what it is again.** The planned-day preview's top
  line traded the Hiking / Travel / Rest & explore glyphs away for the
  PREVIEW marker, so a previewed day no longer said what kind of day it was
  — or, for a mixed day, in which order. The glyphs are back on the same
  line (the eyebrow reads **PREVIEW · DAY N · date** followed by the day's
  activity icons in their stored order), previewing stays height-neutral at
  375×667 with no icon/Exit collision, and very narrow screens wrap the
  icons under the Exit control instead of hiding them. The ordered
  activities remain spoken in the hero's accessible name.
- **Travel recorded by title only is no longer reported as missing.** A
  movement like "Bus Nikkaluokta to Kiruna" saved with empty From/To fields
  appeared when you opened the day's sheet but the compact Day plan row and
  Today both claimed "no travel added yet". All surfaces now share one rule:
  both endpoints show as "From → To", a single known endpoint is shown
  without inventing the other, and a movement with no endpoints falls back
  to its own title — so the three surfaces can never disagree about the
  same bus again. Several movements on one date keep their departure-time
  order, and edits in Lists → Trip still show up everywhere immediately.
- **Linking an existing document can no longer lose your choice.** Attaching
  a stored document to a Travel or Stay item used to take three steps —
  choose it in the picker, press Link, press Save — and pressing Save
  without Link silently discarded the chosen document. Choosing a document
  now adds it to the item immediately (Save persists as before, Cancel
  still discards everything); the separate Link button is gone. The picker
  is also honest about its states: it says "Loading documents…" during the
  first read instead of claiming storage is unavailable, and a document
  whose file has been removed by the browser is no longer silently hidden —
  it stays listed and linkable, marked "file unavailable on this device",
  since re-adding the file restores it. One document can back several
  travel and stay items at once; unlinking from one item never touches the
  others and never deletes the document.

## [0.26.2] - 2026-07-30

### Added

- **Preview any planned day on Today.** Each day in Settings → Day plan now
  carries a small **Preview** action (view mode) that opens that day —
  future or past — in the normal Today presentation: hero, Journey, Tonight
  and all its actions, for every day type. The preview is clearly labelled
  without costing any space — the hero's own top line reads
  **PREVIEW · DAY N · date** with an **Exit** control in its corner, and the
  previewed row in Settings says "Previewing" — and it changes nothing: your
  current stage, the current day, the plan, trips, packing, notes and
  documents are untouched.
  Exiting the preview returns Today to what it was showing — the day matching
  today's date, a manually selected day (with its Follow plan dates row), or
  the generic view. The preview is temporary by design: reloading or
  restarting the app clears it, and choosing a stage in Stages replaces it
  with real progress.
- **Worn clothing, per unit.** Clothing, Rain & insulation and Footwear
  items can now be marked as **Worn** — on the body instead of in the
  backpack — and for multi-quantity rows the marking is per UNIT: "Hiking
  shirts ×3, 1 worn, 2 packed" is a real, representable state. Single
  items keep a simple Worn checkbox below Essential item (and Worn in the
  status button's tap cycle: Needed → Ready → Packed → Worn); rows with
  more than one unit get a compact "Worn [−] 1 [+] of 3" stepper in the
  editor, and their row spells out where every unit is ("1 worn ·
  2 packed"). Every unit has exactly one location: the backpack weight
  counts only carried units, the worn-weight pill counts only worn units,
  and wearing all units of a packed row takes it out of the pack. The
  packing progress header counts packed rows over backpack rows and names
  the worn count right beneath it ("6/69 packed" over "5 worn"); a Worn
  filter pill appears once the first unit is worn and shows every row with
  something on the body — including partially worn ones. Existing lists
  are untouched: every item simply starts un-worn and the screen looks
  exactly as before until you use the feature; lists that already used the
  earlier all-or-nothing Worn marking migrate to one worn unit per marked
  row, never the whole quantity.

## [0.26.1] - 2026-07-30

### Fixed

- **Today is never empty because a Day plan exists.** Creating a plan used to
  leave Today showing only a "No day selected yet" card until you found
  `Make this today` inside a day's edit sheet. Today now resolves the day to
  show in one fixed order: the day you explicitly made current (Stages →
  "Set as current"), otherwise the planned day whose date is today on this
  device, otherwise the same date-independent Today as without a plan. A
  future plan does not replace Today before its first date, a finished plan
  does not blank it afterwards, and nothing about this writes to the plan —
  the date match is display-only, works offline, and compares local calendar
  dates so no timezone can shift the day.
- **`Make this today` removed from the day edit sheet.** The sheet saves every
  change as it is made; a primary button that only set the current-day
  pointer read as a save/confirm action. The close control is how you leave
  the sheet, and the automatic date match plus the generic fallback make the
  button unnecessary. Choosing a stage in Stages still moves the current day
  explicitly — and while that manual choice is overriding the calendar,
  Today says so ("Manually selected day") and offers one quiet
  **Follow plan dates** action that returns to automatic date matching
  without touching your current stage or anything else.
- **Changing a Hiking day no longer silently rewrites another day.** Turning
  a day that walks into Travel or Rest & explore used to hand its route
  stages to a neighbouring hiking day — you edited one day and another day
  changed without an explicit decision. The change is now refused up front:
  the toggle is disabled and the sheet names the route section that still
  needs a hiking day (e.g. "This day still contains the Kebnekaise →
  Nikkaluokta route section"). Move the walking away explicitly first —
  through "Change endpoint", which states its exact consequence — and the day
  is free to change. Actions that do touch a neighbouring day (removing a
  day, adding a hiking day) now name that day before you confirm.

## [0.26.0] - 2026-07-30

### Added

- **An optional Day plan.** Settings → Day plan turns the route into your own
  journey: pick the first day and Fjällkompis lays out one hiking day per
  stage, which you then shape. Add **Travel** days and **Rest & explore**
  days, combine adjacent stages into one longer hiking day (or split them
  apart again), and make a day that both walks and travels. The route stages,
  their guides and their route data never change — only which day you walk
  them on.
- **Tonight, chosen or derived.** Each day ends somewhere: by default where
  the walk ends, and for a Rest & explore day wherever you already were. Pick
  a different stop, an existing stay from your Trip plan, or no overnight at
  all — and go back to "Same as last night" whenever you like, so the day
  follows the one before it again.
- **Travel from your Trip plan.** A Travel day shows the transport you
  already recorded in Lists → Trip for that date, read-only. Nothing is
  copied: Lists → Trip stays the one place travel is edited.
- **Today follows your plan.** With a plan, Today shows the calendar day you
  are on — the date, what the day is, and, on a day that both walks and
  travels, both in the order you put them in. Journey runs over your planned
  days rather than the seven stages.

### Changed

- **Stages are called stages.** The Stages screen and the Map now say
  "Stage 1 … Stage 7" instead of "Day 1 … Day 7". A stage is a fixed piece of
  the route; which day you walk it on is personal, and now lives in the Day
  plan.

### Unchanged (deliberately)

- **Without a Day plan, nothing changes.** No dates, no day types, and the
  same Today, Journey, Tonight, Stages and Map as before. A plan exists only
  once you make one in Settings; upgrading never creates one, and nothing is
  inferred from your Trip plan, your documents or the date. Existing trips,
  packing lists, notes and documents are untouched.
- Journey days are consecutive — this iteration has no date gaps, no
  whole-day combined route on the Map (a multi-stage day opens in Stages),
  and no Wallet ticket shortcut on a Travel day yet.

## [0.25.0] - 2026-07-24

### Added

- **App-owned date and time pickers.** The Trip plan's date and time fields
  no longer open the native Android dialogs (whose OS-rendered action row
  could overflow the screen). Transport's travel date and departure/arrival
  times, and Stay's check-in/check-out, now open Fjällkompis's own
  dialogs: a one-month, Monday-first calendar with today marked and a
  clear selected day, and a digital 24-hour time entry with typing and
  +/− steppers — full keyboard and screen-reader support, Clear / Cancel /
  Set actions that can never overflow, and the same stored values as
  before. Only the Documents date still uses the native control.
- **Check-out opens where the stay is.** With a check-in chosen, an empty
  check-out calendar opens on the check-in's month — or the next month
  when check-in is the last day of its month. It only changes the month
  shown; no date is ever pre-selected.

### Changed

- The calendar dialog keeps a fixed top position while paging through
  months, so its header and controls never jump between 4-, 5- and 6-row
  months.
- Long-pressing app text (dialog titles, calendar labels, buttons) no
  longer starts text selection anywhere — including inside dialogs, which
  had missed the app-wide rule. Typing, selecting and copying inside
  input fields still works everywhere.
- While a sheet, dialog or picker is open, the page behind it is locked:
  no background scrolling and no accidental pull-to-refresh mid-form.
  Closing the last overlay restores the exact scroll position, and normal
  pull-to-refresh returns.

### Removed

- The "Report beta feedback" card in Settings (the beta feedback phase is
  over). Version information in Settings is unchanged.

## [0.24.0] - 2026-07-23

### Added

- **Today now has two views: Prepare and On route.** A compact
  Prepare | On route control in the Today header switches between the
  familiar day view and a new preparation dashboard: the route at a glance
  (endpoints, stages, distance, with Map and Stages actions), packing
  progress, Travel & stays status from the Trip plan, and Trail readiness
  with a direct path to its Settings panel. The choice is remembered on the
  device; nothing switches automatically.
- **STF membership quick access.** A membership document marked
  "Show on Today" appears as the official STF roundel beside Tonight's stop
  and opens a centred, full-size membership card viewer — offline, one tap,
  without leaving Today. Only one document can hold the spot; the toggle
  lives in the document editor.

### Changed

- The Prepare | On route control is a smaller liquid-glass capsule (34px,
  down from its first 44px iteration) matching the material of the Journey
  and Tonight panes, while each tab keeps a full 44px touch target.
- Buttons across the app now give consistent pressed-state feedback, and
  the stray blue tap flash on Android is gone.
- Native date and time fields now ask the browser for light-theme controls
  (`color-scheme: light`), so on browsers that honour it the Android
  date/time dialogs render light to match the app. The dialogs themselves
  remain native: their internal layout is outside the app's control (the
  known Samsung action-row overflow is documented, not fixed — see
  docs/proposals/today-mode-pill-refinement.md).

### Fixed

- Editing a membership document now reliably clears its quick-access
  metadata when the toggle is switched off — the editor's state is
  authoritative.
- At 320px, Tonight's stop name no longer truncates beside the membership
  roundel (the elevation chip yields instead).

## [0.23.0] - 2026-07-22

### Changed

- The Lists **Wallet** tab is now **Trip** — a structured, offline-first Trip
  plan. It is trip-item-first: personal **Travel** movements (flight, train,
  bus, boat, taxi/shuttle, other) and **Stays** (hotel/hostel, mountain
  station, mountain hut, other) are the primary objects, each with a
  Needed / Planned / Confirmed status, and tickets or booking confirmations
  attach to them as supporting documents. All existing Wallet documents are
  preserved and remain available under **Documents**, with their files,
  titles, notes, dates and pinned state untouched.
- Standalone document categories are now Membership, Insurance & emergency,
  Identity, Route reference, Timetable and Other. Documents saved under the
  historical Transport or Bookings categories keep them unchanged.
- The JSON backup now carries the Trip plan's travel and stay items
  (persisted state schema v6, on top of 0.22.0's packing schema v5). Document
  files still stay on the device; after a restore elsewhere, items show
  missing attachments honestly and links can be removed or re-attached.

### Added

- **Add to Trip** on the Transport reference timetables: creates a personal
  transport item prefilled with verified source facts only (mode, endpoints,
  operator) — the travel date, times and booking status stay yours. Already
  linked entries offer **View in Trip** instead, with a deliberate
  "Add to Trip again" for legitimate repeats.
- **Track stay** on every hut and station in Huts & Stations: creates a
  linked Stay item prefilled from the verified stop record (or opens the
  stay you already track there).
- Attachments on Travel/Stay items: attach a new file, link an existing
  document, open it offline, or remove the link (the file itself always
  stays under Documents; deleting a trip item never deletes documents).

## [0.22.0] - 2026-07-22

### Added

- **Cooking, emergency and repair gear in the default packing list.** New
  defaults for the stove kit (compact screw-on gas stove, adapter — "only if
  required", EN417 canister 100–110 g — bought in Sweden, canisters can't
  fly — cook pot with lid, long spoon, lighter, cleaning cloth, waste bags),
  a small repair kit (repair tape, gear patches, zip ties ×4, utility cord,
  needle + thread, spare shoelace, spare buckle), safer navigation extras
  (emergency bivvy / survival bag replacing the emergency blanket,
  waterproof map case, backup flashlight) and first-aid completions
  (personal medication + reserve "if applicable", tweezers + tick remover).
  Existing users receive each new item exactly once; blanket progress
  (status and quantity — not its entered weight, the bivvy is a different
  product) carries onto the bivvy.

### Changed

- **Every packing item is now yours to edit.** The packing list is a fully
  personal copy: any item — default or custom — can be renamed, moved to
  another category, re-weighted, marked essential and deleted, from the same
  inline editor. Renames and deletions of default items now survive reload
  (persisted schema v5 with a packing template version; existing statuses,
  quantities, weights and custom items are preserved on upgrade).
- The single "Reset packing list" action is split into two clear actions:
  **Reset progress** (all statuses back to "Needed", every item and edit
  kept) and **Restore default list** (destructive: back to the default
  template, with a stronger confirmation).
- Deleting a packing item now confirms through the app's accessible dialog
  (naming the exact item) instead of the browser's native popup.
- `Gloves` is now `Gloves + dry spare pair` (×2) and the first aid kit is
  labelled `Walking first aid kit (complete and replenished)` — one item to
  pack and top up, never two competing kits.

## [0.21.1] - 2026-07-21

### Changed

- Default packing list tuned for a typical hut-to-hut Kungsleden hike:
  backpack sized down to 37–42 L, more hiking shirts (×3), underwear (×7)
  and hiking socks (×5), a 1 L water bottle instead of bottles/bladder
  (≥1.5 l), and a compact chair instead of the sit pad. Your own statuses,
  quantities and weights are kept.

### Added

- **Freeze-dried meals ×6** under Food & water.

### Removed

- **Gaiters** — with high hiking boots they add weight without enough
  benefit to be part of the default kit.

## [0.21.0] - 2026-07-20

### Added

- **Trail Wallet** — a new fourth section under **Lists** (Packing / Shops /
  Transport / **Wallet**) for keeping a small number of important hiking
  documents available offline during the journey: bus and train tickets, hut
  bookings, STF membership, insurance references, route PDFs and timetables.
  Add a PDF, JPG, PNG or WebP file (up to 20 MB each), give it a title,
  category, optional date and note, pin the ones you need at hand, open it
  offline (images in an in-app viewer, PDFs in the platform viewer with a
  download fallback), replace or rename it later, download a copy again, or
  delete it. Documents sort by usefulness on the trail: pinned first, then
  upcoming dates (soonest first), undated, and finally expired ones. A quiet
  footer shows how many documents and how much space they take.

  Documents are stored **locally on this device** in the browser's IndexedDB
  (never in the cloud, no account, no network) and are deliberately **not
  part of the JSON backup** — the Backup & restore section and the wallet's
  own intro say so explicitly. Clearing browser/app data removes them.
  **Reset local data** in Settings now also removes Trail Wallet documents
  and says so in its confirmation.

## [0.20.4] - 2026-07-14

### Changed

- **Tidier Settings.** The **Route direction** section now starts collapsed like
  every other Settings section (its collapsed summary shows the direction you're
  currently walking, so the choice stays visible without expanding). **Beta
  testing** is simplified to the single no-login feedback form; the secondary
  "GitHub feedback" issue route has been retired (its issue template is removed
  and the README points to the in-app form). Changing direction and every
  expand/collapse behave exactly as before.

### Changed

- **Simpler Settings and Lists.** Trimmed a few low-value bits of screen text:
  the **Advanced** section (which only repeated the app version — already in the
  footer — and a static "manual checks" reminder) is gone, and **Trail
  readiness** no longer carries the "airplane-mode, sunlight, gloves…" reminder
  line, since the readiness score already says what's ready. On **Lists**, the
  description that changes with the selected tab now sits **directly under the
  Packing / Shops / Transport control** instead of under the page title, so it
  clearly reads as an intro to the chosen list.

### Changed

- **Leaner bottom navigation.** The compact bottom tab bar's content row is
  now 56 px tall (was 64 px), with tighter padding around each tab, so it sits
  at a more native mobile proportion instead of looking vertically stretched.
  The iPhone home-gesture safe area is untouched — it is still reserved in full
  below the row (the bar's total height remains the 56 px row plus
  `env(safe-area-inset-bottom)`, counted once), icons and labels stay above it,
  each tab keeps a ≥ 44 px touch target, and the 0.20.1 standalone-PWA viewport
  fix is unchanged. The tablet/desktop side rail is unaffected.

## [0.20.1] - 2026-07-13

### Fixed

- **The installed iPhone app now fills the whole screen — no blank band
  below the tab bar.** On iOS/iPadOS home-screen (installed) PWAs, WebKit
  reports the visible-viewport height as the display height *minus* the
  safe-area insets under `viewport-fit=cover` (WebKit bug 254868), even
  though the standalone app canvas spans the full display. The app shell was
  sizing itself to that under-reported value, so it stopped ~85 px short of
  the bottom on a notched iPhone and left a stone-coloured empty band beneath
  the bottom navigation. In Apple home-screen standalone mode the shell now
  takes the full-canvas `100vh` authority (WebKit's documented workaround),
  so it reaches the physical bottom and the tab bar sits flush with the
  bottom safe area. The separate Android Chrome protection against a stale,
  oversized viewport after a service-worker update or background resume is
  unchanged, as is browser-mode Safari/Chrome, the keyboard, pinch-zoom,
  orientation and PWA-toast behaviour.

## [0.20.0] - 2026-07-13

### Added

- **Walk the route in either direction.** A new **Route direction** choice —
  the first section in **Settings** — lets you follow the trail **Abisko →
  Nikkaluokta** (the default) or the reverse **Nikkaluokta → Abisko**. The whole
  app follows the direction you pick: Today's stage and Tonight's stop, the
  Journey order and legend,
  the Stages list and day numbers (Day 1–7 for the direction you're walking),
  every from/to and ascent/descent, elevation profiles and silhouettes, the
  Stops order and "x km in" labels, and the Map's stage selector, Prev/Next and
  live/one-shot progress. It's the same physical route, the same eight stops and
  the same offline maps — just presented in the direction you're walking.
- Changing direction shows a short confirmation (your packing list, journal and
  stop notes are never touched) and reorders everything reactively — no reload.
  The choice is saved and survives refresh, reinstall and device transfer.

### Changed

- **Architecture: one active-itinerary layer.** The generated GPX route stays
  the single canonical dataset; a new pure, tested transform derives the active
  directional itinerary (reversed order, endpoints, geometry, distances-from-0
  and swapped ascent/descent) that every screen now reads. Physical segment ids
  (`d1`–`d7`) stay stable identities — so a saved current stage, Map selection
  and deep links keep working across a direction change — while the displayed
  **day** is derived from the direction. Persisted-state schema bumped to v4
  (older data migrates to the default direction). See
  [ADR 0003](docs/decisions/0003-route-direction.md).

## [0.19.0] - 2026-07-13

### Changed

- **Elevation moved from Map to Stages.** The Map screen is now focused on
  navigation and positioning: the combined route/stage summary card — its
  title, the Distance / Ascent-descent / Elevation-range / time statistics,
  the elevation chart and the card's "Set as current" action — has been
  removed. All of the map's navigation and tracking stays (stage selector,
  Prev / Fit / Next, stop previews, Terrain/Satellite, Locate, live tracking,
  Follow, and position & route-progress feedback); on roomy landscape the
  map-dominant square keeps the stage selector and the position/manual-mode
  panel content-sized beside it. Route and stage planning now live in one
  place — **Stages**. The full-route summary card gains a collapsed-by-
  default **Elevation profile** disclosure (the complete 104.5 km profile),
  and each **Day guide**, when opened, now shows that stage's own elevation
  profile — a stage-local axis (0 km → the stage's own distance) drawn from
  the authoritative hydrated stage data — above its written guidance. The
  redundant Map statistics table is not reproduced on Stages; the existing
  summary pills and stage cards remain the information authority.
- **Simpler install prompt.** The beta install toast now leads with a clear
  question — *"Install Fjällkompis on this device?"* — and one line of
  supporting copy. On browsers with a native install prompt it offers
  **Install now** and **Later** directly (the extra "How?" step is gone), and
  everywhere else it shows concise Add-to-Home-Screen guidance straight away.
  A top-right **✕** close button (44 × 44, labelled for assistive tech)
  dismisses it in one tap, exactly like **Later**. The update-available and
  offline-ready notifications are unchanged.

## [0.18.2] - 2026-07-12

### Changed

- **Stops & Shops polish.** The Stops facility grid's interactive **Shop** chip
  now matches the other facility chips exactly (it had inherited the wrong,
  larger font), and its "Important resupply point" / "Useful resupply stop"
  subtitles are gone (the shop's role is already clear). For stops with no shop,
  the redundant "No shop: carry…" and "No sauna is listed by STF" warning
  banners are removed; instead the **No shop** chip is now tappable (whole chip,
  with a circled-ⓘ affordance) and opens a short note — *"Carry all required
  food from the previous stop."* The collapsed-header "No shop" pill stays
  visible. In Lists → Shops, the **Small shop** type button is hidden for now
  (no current route stop uses it and a third chip forced the shop-type row to
  scroll) — the Small catalogue and data remain for future route expansion; the
  selector shows **Large shop** and **Full-service shops**.


## [0.18.1] - 2026-07-12

### Changed

- **Shops is organised by shop TYPE, not route location.** The "Route shop
  overview" (its heading, the All/Large/Small/No-shop filters, the ten
  per-location disclosures with class badges and stock-note triggers) is
  removed — it duplicated information Stops already owns. Shops now has exactly
  three shop-type categories: **Large shop**, **Small shop** and
  **Full-service shops**. Large/Small keep the full STF cabin catalogue
  (categories, product search, Standard/Extra, 2025 reference prices, source &
  validity). **Full-service shops** is a pragmatic combined category for the
  current Abisko–Nikkaluokta scope (Abisko, Kebnekaise, Nikkaluokta): it shows
  a short, accurate per-facility description and an official-information link
  only — no product list or reference prices, because Fjällkompis has no
  reliable inventory for them, and it states this without claiming the three
  share one formal STF classification. A Stop's **Shop** chip now deep-links to
  the matching shop-**type** (Abiskojaure/Alesjaure/Sälka → Large;
  Abisko/Kebnekaise/Nikkaluokta → Full-service) instead of a duplicated
  location card; "No shop" chips stay non-interactive. Stops remains the single
  authority for which route location has a shop. Pinned by
  `tests/shops-by-type.test.mjs`.

### Added

- **Context help + Stops → Lists deep links.** The large explanatory blocks on
  Stops, Shops and Transport were replaced by one reusable `ContextHelp`
  pattern: a quiet info trigger (≥44px, accessible name, no hover/tooltip
  dependency) beside the title that opens the full explanation in an accessible
  bottom sheet / dialog (native `<dialog>` — focus trap, Escape, backdrop and
  explicit Close, with focus returning to the trigger). Decision-critical
  warnings (expired timetables, "No shop", stop/connection warnings, status
  badges, booking deadlines) stay rendered inline. A present **Shop** chip in an
  expanded stop now deep-links to Lists → Shops with that shop opened and
  focused; **Public transport** chips (Abisko → "Getting to the trail"
  section, Nikkaluokta → Nikkaluoktaexpressen) and derived **Boat timetable**
  quick-links (Alesjaure, Kebnekaise) deep-link to the matching Transport
  entry — all via the existing one-shot in-memory navigation payload (no
  persistence, no schema change; a refresh opens the default Packing section,
  and browser Back returns to Stops). Explicit stop→shop/transport mappings live
  next to the data (`shopLocationForStop`, `STOP_TRANSPORT_LINKS`); pinned by
  `tests/context-help-deeplinks.test.mjs`.
- **Shop info in Lists (offline).** A new *Shops* section (peer of Packing)
  answers the resupply questions before you go: a route shop overview classing
  every stop as a mountain-station shop, an STF **Large** or **Small** cabin
  shop, **No shop**, or a **local** shop (filterable All / Large / Small / No
  shop), plus the full STF Small and Large cabin assortments transcribed from
  the official 2025 price lists. Each product is marked **Standard** (in stock
  all season) or **Extra** (while stocks last), organised into expandable
  categories with a product search and a Standard/Extra legend. Mountain-station
  (Abisko, Kebnekaise) and local (Nikkaluokta) shops are flagged as carrying a
  different range from the cabin lists. Prices are shown as **2025 reference
  prices**, never as guaranteed 2026 prices. Static, read-only data
  (`src/data/shops.mjs`), pinned by `tests/shop-info.test.mjs`.
- **Transport in Lists (offline).** A new *Transport* section (peer of Packing),
  organised by journey context — getting to the trail (Länstrafiken bus line
  91), along the trail (the Alesjaure–Abiskojaure and Láddjujávri/Enoks boats),
  leaving the trail (Nikkaluoktaexpressen), and live alternatives (the SJ train)
  — scoped to this route only. Each fixed timetable carries its validity window,
  operating-day rules (including line 91's special 22/29 Aug and 5 Sep
  Saturdays), departures, prices, booking rules and connection notes. Timetables
  are **static planning snapshots**: an out-of-date timetable shows a visible
  *“Timetable expired — check source”* state rather than being hidden, and the
  train is a **live** planner (SJ links, no stored times) — the app never
  presents static data as live or a connection as guaranteed
  (`src/data/transport.mjs`, pinned by `tests/transport.test.mjs`).

### Fixed

- **Stages and Stops cards now share Today's vertical rhythm.** Stacked
  cards on those screens sat 28px apart — the stack's 14px flex gap plus a
  legacy 14px sibling-card margin that flex layout does not collapse —
  while Today's reference layout uses a single 14px step. The stack now
  neutralises the margin so the gap is the only inter-card spacing,
  matching Today exactly and shortening long lists. Lists keeps its
  deliberate labelled-section rhythm; Settings already matched. Fenced by
  `tests/design-system.test.mjs`.

- **External links are no longer default browser blue.** Text links across
  the app (stop sources, credits, official-information links) now use the
  design system's glacier link colour with an underline, hover/visited/
  focus states, and correct styling for links dressed as buttons; the
  MapLibre attribution keeps its compact treatment. The last off-palette
  colour the app could show is gone (Design Review #1, DR-002), fenced by
  `tests/design-system.test.mjs`.

### Changed

- **Completed journey days got their own colour.** The day dots on Today
  for already-walked stages now use a dedicated spruce-hue token
  (`--journey-complete: #4c6b5c`) instead of the shared success green, so
  the week's history sits in the same colour family as the hero above it.
  Packing, checklists, meters and readiness ticks deliberately keep the
  existing `--good` moss green (Design Review #1, DR-001; rationale in
  `docs/VISUAL-DESIGN-AUTHORITY.md`).
- **Design Review #1 (v0.18 pre-field) closed** with judgement *Ready with
  explicit limitations*: the full report, findings DR-001–DR-008, owner
  decisions D1–D8 and the phone-evidence checklist live in
  `docs/design-reviews/2026-07-v0.18-pre-field-review.md`; the visual
  design system's conventions are now codified in
  `docs/VISUAL-DESIGN-AUTHORITY.md`.
- **View Route now looks like a button.** On Today's stage block, View
  Route swapped its translucent glass surface for a solid glacier fill
  (the design system's secondary button colour) so both actions read
  unmistakably as buttons and the quiet glass look belongs to the
  highlight chips alone — metadata and controls can no longer be
  mistaken for each other.
- **Long-press no longer starts native text selection.** Text across the
  app is no longer selectable, so a long-press can't pop the platform's
  select/lookup/share sheet — Fjällkompis behaves like an app, not a
  document. Editable fields (trip notes, journal, packing inputs) keep
  normal selection and copying.
- **Today's stage block became a compact operational summary.** The
  `Day X of 7` hero keeps its day, route endpoints and GPX statistics, and
  now adds up to four static stage-highlight chips (icon + short label:
  exposure, snow patches, the route high point, terrain, treeline, bridged
  crossings, boat option and more) drawn from structured, offline stage
  metadata (`src/data/stageHighlights.mjs`) — deterministic and
  priority-capped, never GPS-, network- or time-dependent, pinned by
  `tests/stage-highlights.test.mjs`. The single top-right "View route"
  button was replaced by two clear follow-up actions: **Stage Guide**
  (primary) opens Stages with today's day guide already expanded and
  scrolled into view, and **View Route** focuses the Map on today's stage
  exactly as before — normal navigation away and back still preserves the
  remembered in-session Map view. Owner-approved direction:
  `docs/design-reviews/2026-07-v0.18-today-stage-block-direction.md`.

## [0.18.0] - 2026-07-11

### Added

- **Every stage now carries a compact day guide.** Each card on Stages
  expands (new "Day guide" disclosure at the bottom of the card, chevron,
  independent per-card accordion, keyboard/`aria-expanded` accessible) into
  a short editorial guide: what to expect, trail character, two to four
  highlights and stage-specific "plan for" notes — treeline transitions,
  the Tjäktjapasset crossing and its day shelter, which cabins have no
  shop, the seasonal Láddjujávri boat (run by Enoks; never guaranteed) and
  the seasonal Nikkaluokta–Kiruna bus. Content was researched against
  official STF, Länsstyrelsen Norrbotten (Naturkartan) and operator pages;
  every guide records its sources and a last-verified date
  (`src/data/stageGuides.mjs`, pinned by `tests/stage-guides.test.mjs`).
  Guides are static, deliberately hedged route guidance — not live
  conditions — and all distances/elevation figures remain GPX-derived.

### Changed

- **Stage-card actions were redesigned.** Setting the current stage moved
  from the full-width bottom button to a compact "Set as current" pill in
  the card's top-right (the current stage shows the familiar
  non-interactive "Current" status pill instead); the bottom of the card
  now belongs to the day-guide disclosure. The two controls are separate
  buttons — expanding a guide can never change the current stage. The
  Stages introduction was rewritten to match.

### Removed

- **The Daily checklist was archived.** The fixed daily routine list is
  gone from Today (its navigation card), Lists (the Daily/Packing switch —
  Lists is now the packing list), the app store and the persisted schema
  (v3 drops the `checklist` map during normalisation). Existing saved data
  and old export files still load, import and migrate safely; only the
  checklist ticks are discarded — everything else (current stage, packing,
  stop notes, journal) is preserved. Rationale and recovery pointers:
  [docs/archived-features/daily-checklist.md](docs/archived-features/daily-checklist.md).

## [0.17.1] - 2026-07-10

### Fixed

- **The desktop map card now truly ends ~20 px above the viewport at
  laptop heights.** v0.16.2 delivered the ~20 px remainder only on tall
  windows (≥ 890 px); shorter desktop windows still reserved the
  worst-case wrapped control rows and three-line banner, leaving a
  60–80 px dead band below the card and a narrower map than necessary.
  The vertical reserves are now state-aware: for each combination of
  status banner / tracking hint actually present in the card, the exact
  single-line reserves apply from the height at which the resulting
  square is provably too wide for anything to wrap (gates at
  700/750/770/820/890 px). At a ~1330×720 desktop window the map grows
  from ~425 px to ~475 px square, the column divider shifts right, the
  information column narrows correspondingly, and the card ends ~20 px
  above the viewport. Visual design (radii, backgrounds, borders,
  spacing) is untouched; mobile portrait and fullscreen are unchanged.
## [0.17.0] - 2026-07-10

### Changed

- **Legible Nordic terrain colours.** The terrain palette was rebuilt on a
  measured audit of the offline archive (which showed the generalised
  low-zoom landcover covering ~100% of the corridor at z7 and vanishing at
  z8, leaving ~85–90% of the map with no terrain polygon at all): the open
  fjäll base — the map's dominant surface — is now a light muted
  sage/lichen green (`#dde3cf`), a deliberate cartographic generalisation
  of open alpine ground rather than a claim of mapped grassland, so the
  landscape finally reads as vegetated fjäll instead of beige paper. The
  explicit, data-driven vegetation fills are solid muted tones on one
  clear ladder above that base (light yellow-green meadow → medium-olive
  fjällbjörk scrub → distinctly darker forest green) instead of
  translucent pastels, wetland is a peat-brown overlay wash clearly
  separate from both water and vegetation, exposed rock is a firmer cool
  grey, and the low-zoom generalised grassland hands over to the sage
  background without the previous green-to-white jump at z7→z8. Glaciers
  keep their bright cool fill and restrained outline; the protected-area
  tint stays barely visible; route, GPS and hut overlays remain the
  strongest elements everywhere.
- **Terrain structure appears earlier.** 100 m index contours now fade in
  from z9.5 and are clearly legible by z11 (previously invisible before
  z11); the 20 m contours fade in from z11.5 and are fully useful by z13
  (previously z13+). Both tiers start at opacity 0 — no pop-in at a zoom
  threshold — and index lines stay heavier than intermediates at every
  zoom. This required retiling the contour archive (index lines into z9+
  tiles, the 20 m set into z12+; `scripts/build-terrain-map.sh`), so the
  earlier contours need the **terrain-data-v3** release; with the old
  archive the map simply keeps the previous z11/z13 behaviour.
- **Map comparison phase retired.** The temporary "Map comparison —
  temporary" dropdown, the legacy *Current* and *Liberty Topo* runtime
  styles, the online-only Thunderforest Outdoors preview (code, API-key
  plumbing, `VITE_ENABLE_MAP_BENCHMARK` flag and `@protomaps/basemaps`
  dependency) were all removed — Liberty Topo — Nordic is the one
  production terrain basemap. The Terrain/Satellite toggle and the
  satellite download/availability behaviour are unchanged. Contour
  elevation labels were assessed and deliberately deferred: they require
  the offline-glyphs roadmap item first (no glyph infrastructure ships in
  the app).

## [0.16.2] - 2026-07-10

### Changed

- **The desktop map now uses the full window height.** The square map's
  fixed 600 px ceiling left a large blank band under both columns on
  taller desktop windows. The square now keeps growing with the window —
  anchored left, taking the released width from the route-information
  column — until only ~20 px of breathing room remains below the map
  card (still zero page scrolling). Width caps protect the composition:
  the information column always keeps at least 38 % of the layout
  (~500 px at the ultrawide screen cap) and never drops below 300 px.
  Camera coverage revalidated for the larger squares (edges up to
  ~838 px fit the full route with ~179 km of east/west view, well inside
  the physical terrain envelope — pinned by tests). Mobile portrait and
  fullscreen are unchanged.

## [0.16.1] - 2026-07-10

### Fixed

- **Flatter elevation chart on desktop so the location panel stays in
  view.** In the two-column Map layout the elevation chart grew with the
  widened information column (~0.42 × its width) and pushed the
  Locate/manual-mode panel below the fold on fullscreen landscape
  screens. The chart now has a height cap on desktop (viewport-scaled,
  120–200 px) and adapts its drawing to the rendered shape at uniform
  scale — labels keep their size, scrubbing stays exact, and the panel
  below the summary card is visible without scrolling. Mobile portrait
  keeps the chart's original proportions.

## [0.16.0] - 2026-07-10

### Changed

- **Square desktop map beside a wider route panel — the whole card fits
  one screen.** On desktop and tablet-landscape layouts (≥ 900×700) the
  map viewport is a 1:1 square, and the map card — including the Prev /
  Fit route / Next and Locate / Live tracking / Follow rows — is exactly
  as wide as the map itself: the empty canvas that v0.15.0 left to the
  right of its 4:5 map inside an oversized panel is gone, and all of the
  reclaimed width goes to the route information column (composition
  capped at 1400 px on ultrawide screens). The square consumes only the
  height left over after reserving measured space for the header, both
  action rows and any status banners (banners and, on narrow cards, the
  action rows render more compactly on desktop), so the complete card —
  map, banners and both button rows — is visible without any vertical
  scrolling (square edge 300–600 px).
  Landscape viewports shorter than 700 px keep the compact stacked
  composition instead of a partially hidden desktop layout.
- **Recalculated east/west coverage for the square full-route view.**
  Fitting the complete north–south route into the padded square needs an
  east/west view of ~186–220 km — wider than the ~150.6 km interaction
  bounds — so the square card uses the bounded map's existing overview
  expansion at Fit-route zooms: the exact fit sits inside the ~309 km
  physical z7 terrain envelope at every supported square size (pinned by
  tests, including the tightest 300 px case), showing comfortable
  real-relief context east and west of the route and never a data edge.
  Zooming in still returns the camera to the strict interaction bounds;
  no archive rebuild was needed. Mobile portrait and fullscreen behaviour
  are unchanged.

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
  to the same coverage as `satellite-data-v3` (~59 MB — rebuilt on the
  same runner toolchain as v1 after an exact-tile comparison showed the
  locally-encoded v2 candidate was visibly softer at identical settings).
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
