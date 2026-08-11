# Trail Readiness + Guide cleanup evidence

Base: `2084e8e61eb69c4496d1ae5c1592717b2d0a6062`

## Compact-screen findings

- At 375×812, the collapsed Settings list gains one standard accordion row.
  The header, Route direction, Trail Readiness and Offline maps remain visible
  together, preserving the existing scan pattern.
- The expanded section fits the four readiness facts, Offline maps handoff and
  full two-line responsibility note in one phone viewport.
- At 320×568, the layout has no horizontal overflow (`scrollWidth === 320`).
  Long values wrap inside the existing card rather than widening it.
- Opening `Open Offline maps` closes Trail Readiness and opens the existing
  Offline maps accordion, so download controls remain single-owned.

## Captures

Before:

- `before/settings-collapsed-375x812.png`
- `before/stf-stop-375x812.png`
- `before/non-stf-stop-375x812.png`
- `before/stage-guide-375x812.png`

After:

- `after/settings-collapsed-375x812.png`
- `after/readiness-expanded-375x812.png`
- `after/offline-maps-handoff-375x812.png`
- `after/settings-collapsed-320x568.png`
- `after/readiness-expanded-320x568.png`
- `after/stf-stop-375x812.png`
- `after/non-stf-stop-375x812.png`
- `after/off-route-stf-375x812.png`
- `after/stage-guide-375x812.png`
