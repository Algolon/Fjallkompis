# Trail Cockpit, step 2 — controls: measured evidence

Captured headlessly (Chrome for Testing, deviceScaleFactor 2) against the dev
server at `#/map`, default state. `route clearance` projects the **route
bounds** onto the screen and measures the gap to each overlay's edge, so a
negative number means geometry is framed under that overlay.

## Layout, framing and touch targets

| Viewport | Map surface | `main` overflow | lead column depth | dock height | route clearance: dock / lead / stack | smallest cockpit target | nav |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 320×568 | 320×512 | **0 px** | 44 px | 70.5 px | **+2** / 30.5 / 18.1 px | 44 px | bar, visible |
| 375×667 | 375×611 | **0 px** | 44 px | 70.5 px | **+11.1** / 21.4 / 36 px | 44 px | bar, visible |
| 390×844 | 390×788 | **0 px** | 44 px | 70.5 px | **+34.2** / 63.8 / 12.9 px | 44 px | bar, visible |
| 430×932 | 430×876 | **0 px** | 44 px | 70.5 px | **+47** / 76.9 / 15 px | 44 px | bar, visible |
| 760×500 | 676×500 | **0 px** | 44 px | 56 px | **+4.3** / −5.6 / 126.3 px | 44 px | rail, visible |
| 768×1024 | 684×1024 | **0 px** | 44 px | 56 px | **+20** / 12 / 70.5 px | 44 px | rail, visible |
| 1024×768 | 940×768 | **0 px** | 44 px | 62 px | **+24** / 12 / 224.7 px | 44 px | rail, visible |
| 1280×800 | 1132×800 | **0 px** | 44 px | 62 px | **+6.3** / −7.5 / 257.5 px | 44 px | rail, visible |

- the map surface is **100 % of `<main>`** at every viewport (step 1 left the
  compact dock occupying up to 44 %; the cockpit gives that back);
- **no route is framed under the status dock anywhere** — the tightest case
  is the 320 px phone at +2 px, where the coverage contract's own bounds are
  the binding constraint (see below);
- the two −5.6 px / −7.5 px "lead" figures are the route BOUNDING BOX's top
  edge against the 44 px scope pill. The pill sits on the left and the
  route's northern end (Abisko) is at the eastern edge of that box, so no
  drawn geometry is actually behind the pill; the measurement is deliberately
  conservative (box, not line);
- every cockpit control measures ≥ 44×44 px;
- MapLibre's zoom control is present only for fine pointers (all captures run
  in a desktop browser, hence `zoomCtrl 1`); the native fullscreen control is
  absent everywhere;
- the dock always sits above the bottom navigation (`dockAboveNav: true`);
- zero console errors at every viewport.

## Why the 320 px case lands at +2 px

The route is 153.9 km tall in Mercator inside 218.2 km of user bounds, so a
512 px workspace has ~151 px of vertical slack — less than the 44 px pill
plus the ~89 px dock band plus margins need. Rather than weaken the coverage
boundary, the overview expansion (which already widens east/west for wide
viewports) now also widens **north/south** by exactly what the padded fit
needs, capped by the physical envelope (the data bounds minus a 2 km margin —
real archive data, never a crop edge) and active only below the zoom
threshold. On a 320 px phone the requirement (~7.8 km per side) exceeds the
cap (~6 km), so the fit lands 2 px clear instead of the ideal 12 px. Every
other viewport honours the padding exactly.

Known limitation: a hut marker's glyph is centred on its coordinate, so at
the very end of a fitted stage the lower half of a marker can overlap the
dock even though the line itself is clear.

## Behaviours (375×667 unless noted)

| Case | Result |
| --- | --- |
| GPS permission denied → Locate | dock turns warn: "Location unavailable" / "Location permission denied. Use manual mode below." / **Retry** |
| Manual fallback (details sheet → manual mode → Set position from stop) | dock reads "Pinned to a stop"; honest "Not reliably matched to Day 1 — progress unavailable" because the pinned stop is not on the current stage |
| One-shot fix granted (68.2735, 18.6635) | dock reads "GPS fix"; GPS source populated; the Follow control appears only now |
| Scope sheet | modal, scroll-locked, focus inside; lists Full route + 7 stages; **Viewing** and **Current** are separate markers |
| Choosing Day 5 | pill → "Day 5 · Sälka → Singi", camera fits the stage, dock adds "Viewing **Day 5** · Tracking **Day 1**"; sheet closed, scroll unlocked |
| Layer sheet | Terrain/Satellite radios; satellite disabled with "Download it in Settings → Satellite imagery" when absent |
| Escape on a sheet | closes it, focus returns to the opener (`Map layer: Terrain`), scroll unlocked |
| Keyboard | Enter on the scope pill opens the sheet with focus inside, Tab stays inside, Escape restores focus to `.map-scope`; Enter on a hut marker opens the preview with focus in it, Escape closes it |
| Route direction reversed | scope sheet reads Day 1 · Nikkaluokta → Kebnekaise … Day 7 · Abiskojaure → Abisko |
| Reduced motion | 0 running animations, `transition-duration: 0s` on the cockpit |
| Reduced transparency / more contrast | `backdrop-filter: none`, solid paper background on the dock |
| Deep link (Today → View route) | navigates to `#/map`, pill shows "Day 1 · Abisko → Abiskojaure", camera fitted to the stage (zoom 10.03) |

Not exercised live: the **point/route** "View on map" focus variants — no
mappable experience or curated place exposes that action in the current data
state, so those paths are covered by source fences only (the focus effect and
the pill's focus label are unchanged in behaviour from before this PR).
