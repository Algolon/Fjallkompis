# Delft pilot field test — results summary (2026-07-07)

Anonymised summary of the real outdoor Android field test of the Map-tab
pilot (see [docs/delft-pilot-test.md](../delft-pilot-test.md)). The raw
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

## Remaining validation (Kungsleden, before trip-ready 1.0.0)

- Multi-hour battery behaviour with the screen mostly off between checks
- GPS accuracy in mountain terrain (valleys, braided trails) vs urban Delft
- Offline behaviour over multiple days without connectivity
- Whether the nearest-segment limitation above ever misleads on the real
  route's geometry
- Glove/sunlight usability
