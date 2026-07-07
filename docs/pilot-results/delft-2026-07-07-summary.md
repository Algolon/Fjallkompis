# Delft pilot field test — results summary (2026-07-07)

Anonymised summary of the real outdoor Android field test of the Map-tab
pilot (the pilot itself, its assets and its documentation were removed after
the tracking mechanics graduated to the Kungsleden Map screen — see the git
history for `docs/delft-pilot-test.md`). The raw
session export contains location history and stays on the tester's device —
only aggregate findings are recorded here. No coordinates or raw timestamps.

## Outcome

**Functionally successful.** Live GPS followed the walk accurately, turns and
deliberate deviations were represented correctly, route progress reached the
finish (100%), off-route classification eventually activated during
deliberate off-route walking, and no crashes or meaningful GPS errors
occurred.

## Session aggregates

The export deliberately covers only the **final part of the walk** — around
two-thirds in, the tester left the Map tab to exercise lifecycle behaviour.
Tracking correctly stopped when the pilot panel unmounted (the intended
stop-on-unmount design), so the missing earlier portion is expected, not a
defect.

- App version: 0.5.1 (deployed GitHub Pages PWA, Android)
- Exported segment: ~10.5 minutes, **689 accepted fixes, 0 rejected** (~1.1 Hz)
- Reported GPS accuracy: **median ≈ 5 m** (p25 ≈ 3.7 m, p75 ≈ 6.2 m,
  worst ≈ 22 m); no fix exceeded the 40 m "uncertain" accuracy gate
- Fix age at receipt: median ≈ 25 ms (max < 1 s) — no stale replays
- Cross-track distance: median ≈ 4 m on-route; max ≈ 83 m during the
  deliberate off-route excursion
- Projection reliability: 99% of fixes passed the reliability gate
- Status distribution: 555 on-route · 124 uncertain · 10 off-route
- Route completion reached **100%**; the session intentionally continued past
  the finish and backwards along earlier route sections, ending off-route
  with progress correctly frozen ("stale") at the last reliable match

## Known limitation observed (accepted, not a defect)

The export shows one large change in the along-route position (~100% → ~30%)
after finishing, despite small physical movement:

> When geographically close route sections are far apart in route order,
> nearest-segment matching can switch the calculated along-route position
> between those sections. This is not currently blocking and should only be
> revisited if it produces misleading behaviour during actual Kungsleden
> field use.

This is inherent to independent nearest-segment projection of each fix. It is
deliberately **not** being "fixed" with monotonic progress, segment locking or
jump rejection: the displayed value represents the current position along the
route, backwards walking must be allowed, and previous-position bias would
make deliberate backtracking less accurate. No harmful oscillation was
observed during normal route walking.

## Battery

No reliable battery measurement was recorded — **no quantitative battery
conclusion can be drawn** from this test. The pilot UI now states plainly that
live tracking uses additional battery while the screen is open.

## Change resulting from this test

- An inline, non-modal **off-route warning** was added while live tracking is
  active and the debounced session status is *off-route*: "You may be off
  route · approximately X m from the mapped trail. Check the map and your
  surroundings." It never fires for *uncertain*, uses the existing
  accuracy-aware classification and 3-consecutive-fix debounce, and clears
  immediately on recovery.
- An inline **battery note** while tracking is active (no measured
  percentages claimed).

## Final validation (real device, 2026-07-07, app 0.5.2)

The one remaining check — the inline off-route warning added in 0.5.2 — was
confirmed on a real Android device (evidence reviewed privately; no
coordinates recorded here):

- foreground live tracking active, reported GPS accuracy ≈ **±6 m**;
- measured cross-track distance ≈ **105 m**;
- the debounced route status read **Likely off route**;
- the inline warning appeared with an appropriate approximate distance
  ("approximately 105 m from the mapped trail"), phrased as a qualified
  possibility, not a certainty;
- route progress was correctly **withheld** while no reliable route match
  existed (no misleading percentage shown).

**The Delft pilot is complete. No further Delft field-test walk is
required.**

> Delft pilot completed successfully. Functional tracking and off-route
> detection were validated on a real device. Final placement, hierarchy and
> simplification of tracking status messages remain production-UX work for a
> separate Kungsleden integration.

## Production UX direction (documented, not implemented)

The final check also produced a UX finding: the warning **works**, but its
current placement — inside the long pilot controls/diagnostics section — is
not the model for production. On the trail, with the map possibly scrolled
out of view, safety-relevant state must be more immediate and map-centric.

**Map-level tracking status.** For a future Kungsleden integration,
safety-relevant live-tracking states should appear in or directly above the
map as a compact, persistent, non-modal overlay (top-of-map overlay or a
compact banner immediately above the map — final visual design deliberately
not decided here). Relevant states: *Live tracking active*; *You may be off
route · approximately X m*; an accuracy-qualified *GPS signal uncertain*
when appropriate; a compact battery-use indication. The off-route message
must remain visible while the debounced status is off-route, disappear
automatically on recovery, never be a modal or a self-dismissing toast while
the condition persists, require no dismissal, use no sound/vibration/browser
notifications by default, keep the map and key controls accessible, and stay
qualified.

**Battery and active-tracking communication.** The pilot's full battery
paragraph is right for a test, too prominent for production: explain the
battery cost when tracking is *started*; while active, reduce it to a
compact persistent status or icon; always keep a clear Stop tracking action;
keep foreground-only behaviour explicit; keep the current
stop-on-leaving-the-Map-tab lifecycle unless a later product decision
explicitly changes it.

**Pilot diagnostics are not the production layout.** Precise coordinates,
fix age, cross-track metres, accepted/rejected counts and exports were
essential for validation but should not define the normal Kungsleden UI. A
normal user needs: position on the map, route progress, tracking status, the
off-route warning, GPS uncertainty only when relevant, follow/recentre, and
start/stop. Detailed diagnostics may remain behind a debug/test mode only.

## Remaining validation (Kungsleden, before trip-ready 1.0.0)

- Multi-hour battery behaviour with the screen mostly off between checks
- GPS accuracy in mountain terrain (valleys, braided trails) vs urban Delft
- Offline behaviour over multiple days without connectivity
- Whether the nearest-segment limitation above ever misleads on the real
  route's geometry
- Glove/sunlight usability
