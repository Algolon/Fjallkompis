# Trail Cockpit — corrected design: measured evidence

Captured headlessly (Chrome for Testing, deviceScaleFactor 2) against the dev
server at `#/map`, default state. `route clearance` projects the **route
bounds** onto the screen and measures the gap to each overlay's edge.

This supersedes the first cockpit round: the permanent "Where am I?" status
dock and its details sheet were rejected in review and removed, the layer
sheet became an anchored popover, and one-shot locate and live tracking are
now two separate controls.

## Layout, framing and touch targets (idle map)

| Viewport | Map surface | `main` / document overflow | idle bottom band | route clearance: lead / stack | gap below route | smallest control | nav |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 320×568 | 320×512 (100 %) | **0 / 0 px** | none (`--map-bottom-h: 0px`) | 20.3 / 16 px | 20.3 px | 44 px | bar, visible |
| 375×667 | 375×611 (100 %) | **0 / 0 px** | none | 20.8 / 16 px | 20.8 px | 44 px | bar, visible |
| 390×844 | 390×788 (100 %) | **0 / 0 px** | none | 63.8 / 12.9 px | 114.7 px | 44 px | bar, visible |
| 430×932 | 430×876 (100 %) | **0 / 0 px** | none | 76.9 / 15 px | 127.5 px | 44 px | bar, visible |
| 760×500 | 676×500 (100 %) | **0 / 0 px** | none | 11.1 / 146.5 px | 10.8 px | 44 px | rail, visible |
| 768×1024 | 684×1024 (100 %) | **0 / 0 px** | none | 12 / 49.8 px | 12 px | 44 px | rail, visible |
| 1024×768 | 940×768 (100 %) | **0 / 0 px** | none | 12 / 243.2 px | 12 px | 44 px | rail, visible |
| 1280×800 | 1132×800 (100 %) | **0 / 0 px** | none | 12 / 281.5 px | 12 px | 44 px | rail, visible |

- the map is **100 % of `<main>`** everywhere, and with the dock gone there
  is **no reserved band at the bottom at all** — the camera's bottom inset
  is the 12 px base margin only, and `--map-bottom-h` (which lifts MapLibre's
  scale/attribution/zoom controls) is `0px` until a tracking pill exists;
- the route now ends 20 px above the map's bottom edge on a phone instead of
  2 px above a dock, and 115–128 px above it on tall phones;
- every control measures ≥ 44×44 px; MapLibre's zoom control is present only
  for fine pointers (all captures run in a desktop browser); the native
  fullscreen control is absent everywhere;
- zero console errors at every viewport.

While a tracking session runs, the pill's band measures 74 px at 375×667 and
is reflected in both the camera padding and `--map-bottom-h`.

## Layers popover (not a sheet)

| Viewport | Element | Role | Fits in viewport | Share of the map it covers | Width |
| --- | --- | --- | --- | --- | --- |
| 320×568 | `div.map-popover` | `radiogroup` (options `radio`) | yes | **16.4 %** | 196 px |
| 1280×800 | `div.map-popover` | `radiogroup` | yes | **3.4 %** | 224 px |

Behaviour: Enter on the button opens it with focus on the checked option
(Terrain); ArrowDown moves to Satellite; Escape closes and returns focus to
`Choose map layer`; choosing Satellite applies the layer (`satellite`
visibility → `visible`, button caption → `Sat`) and closes; a pointer press
anywhere else closes it. With the satellite archive blocked, the option stays
listed, is `disabled`, and reads *Download in Settings first* — with **no**
permanent note on the map.

## Location and tracking

| Case | Result |
| --- | --- |
| One-shot **Locate me** (fix 68.2735, 18.6635) | camera centres on the fix; **no** session, **no** pill, **no** bottom band; the tracking control still reads *Start live tracking* |
| Duplicate activation while a request is in flight | the control becomes *Locating your position*, `disabled`, `aria-busy="true"` — `Locate me` is not reachable |
| Location permission denied | transient note: *Location permission denied. Allow location access for this site and try again.* — no pill, no band, no sheet |
| **Start live tracking** with no current stage | transient note: *Select a current stage in Stages before starting live tracking.* — nothing starts |
| Live tracking started (walking along Day 1) | pill: live dot + *Following Day 1* + *On route* + *Stop live tracking*; control reads *Following your position* (`aria-pressed=true`); band 74 px |
| Deliberate pan while tracking | pill switches to *Tracking Day 1* (dot stops blinking), control becomes *Resume following* — **the session stays alive** |
| **Resume following** | camera recentres exactly on the last fix (18.732703, 68.315942) at zoom 13 and follow resumes |
| **Stop** | pill and band removed, `--map-bottom-h` back to `0px`, control back to *Start live tracking* |

Route-state wording is unit-fenced (`tests/map-tracking-pill.test.mjs`):
off-route only for a debounced off-route status, uncertainty damped, waiting
before the first fix, and no progress numbers on the map at all.

## Everything else still holding

| Case | Result |
| --- | --- |
| Route direction reversed | scope sheet reads Day 1 · Nikkaluokta → Kebnekaise … Day 7 · Abiskojaure → Abisko |
| Stop marker (keyboard) | preview opens on Enter with focus inside (*Abisko*), Escape closes it |
| Today → *View route* deep link | `#/map`, scope pill *Day 1 · Abisko → Abiskojaure*, camera fitted to the stage (zoom 10.03) |
| Reduced motion | 0 running animations, `transition-duration: 0s` |
| Reduced transparency / more contrast | `backdrop-filter: none`, solid paper surfaces |
| Browser Fullscreen API | not used anywhere (repo-wide scan is part of the suite) |

## Deferred

**Full-route overview framing / additional surrounding terrain, including
Tjäktja label clearance.** The overview still frames the route tightly enough
that the Tjäktja label clips at the left edge on narrow phones. Nothing in
this pass changed the route-overview framing or the camera envelope; it needs
its own iteration.
