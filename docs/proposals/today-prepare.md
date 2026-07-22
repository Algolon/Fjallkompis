# Today — Prepare (design specification & prototype)

Status: **prototype for owner review — not production-final, not merged**
Branch: `claude/today-prepare` (from `main` @ 55a00b2, v0.23.0, schema v6)
Origin: the Trip plan proposal reserved this view ("a future Today 'Prepare'
view will read the pure trip summary selectors"; docs/proposals/trip-plan.md).

## Product intent

Today supports two contexts, switched manually:

- **Prepare** — before departure: *what is the current state of my trip
  preparation?* Compact, scannable summaries; every card navigates to the
  screen where the data is managed. Not a task manager, itinerary,
  recommendation engine or duplicate of Lists/Trip/Settings.
- **On route** — during the hike: the pre-existing Today experience,
  materially unchanged.

## Owner decisions encoded here

- Manual, accessible mode selector (segmented tabs, never a settings toggle);
  both modes always available; **no** date/GPS/phase-based switching.
- Last selected mode is remembered (see Persistence).
- Prepare fits the bounded Today area **without vertical scrolling** on
  normal supported mobile viewports (measured, see Height budget).
- Summaries, not lists; direct counts, no invented percentages; visible
  status words, never bare codes; whole card = one navigation target.

## Layout (as built)

```text
KUNGSLEDEN                [Online]
Today
Your trip preparation at a glance.

[ ● Prepare | On route ]           ← .seg tablist, spruce selected fill

┌─────────────────────────────────┐
│ ROUTE                           │
│ Abisko → Nikkaluokta         ›  │
│ 7 stages · 104.5 km             │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ PACKING LIST                    │
│ 30 Needed · 28 Ready · 16 Packed│
│ 23 essential not packed · ≥ 5.78 kg
└─────────────────────────────────┘
┌───────────────┐ ┌───────────────┐
│ TRAVEL & STAYS│ │ TRAIL         │
│ 1 Needed      │ │ READINESS     │
│ 2 Planned     │ │ 1 / 4 ready › │
│ 2 Confirmed   │ │ Setup needed  │
│ 3 travel · 2 stays │           │
└───────────────┘ └───────────────┘
```

The topline eyebrow already reads KUNGSLEDEN, so the Route card leads with
the directional endpoints (single source: `itinerary.startStopId/endStopId`,
flips with Route direction) instead of repeating the trail name.

## Content contracts

| Card | Source (single source of truth) | Empty/partial behaviour | Destination |
|---|---|---|---|
| Route | `itinerary` (endpoints, `statistics.distanceKm`), `stages.length` | n/a (static route) | Stages |
| Packing list | `packingSummary(state.packing)` (utils/packingModel.mjs) — row counts, shared with Lists header | `total === 0` → "No items yet"; weight `≥ x` while `weightMissing > 0` (Lists convention), omitted at 0 | Lists → Packing (`{ lists: { section: 'packing' } }`) |
| Travel & stays | `tripPlanSummary(state.trip)` (trip/tripModel.mjs) — documents excluded by the selector | "No travel or stays added" (card stays clickable — it is the entry point) | Lists → Trip (`{ lists: { section: 'trip' } }`) |
| Trail readiness | `useTrailReadiness()` (hooks/) — the SAME aggregate Settings renders | "Checking…" while probing; "Setup needed" (calm) when short | Settings, readiness accordion opened (`{ settings: { section: 'readiness' } }`) |

No trip dates are shown: verified absent from state (all trip-item dates are
optional per-item fields; no trip start/end exists). Nothing is fabricated.

## Mode selector

- `role="tablist"` / `role="tab"` / `aria-selected`, visible labels
  "Prepare" / "On route", decorative lucide icons (ClipboardCheck /
  Footprints, `aria-hidden`).
- Roving tabindex; ArrowLeft/ArrowRight/Home/End move focus and selection
  together; focus never lost on switch.
- Panels: `role="tabpanel"` + `aria-labelledby`, one rendered at a time.
- 44px min touch target; selected = spruce fill + near-white text (not
  colour-only: fill + weight change + aria state).

## Persistence (Option B — device UI preference)

`fjallkompis.todayMode.v1` in localStorage via `utils/todayMode.mjs`;
default `onroute` (the pre-existing experience). NOT in PersistentState:
no schema bump for presentation state, not carried by backup/transfer
(deliberate — device presentation, like PwaLifecycle's session nudge key).
Corrupt/missing values normalise to the default; storage failures are
non-fatal (mode still switches, just isn't remembered).

## Height budget (measured in the prototype, default text size)

| Viewport | Available (`main`) | Prepare content | Spare |
|---|---|---|---|
| 320 × 568 | 512 px | 492 px | **20 px** |
| 360 × 560 (short) | 504 px | 480 px | **24 px** |
| 375 × 667 | 611 px | ~467 px | ~144 px |
| 390 × 844 | 788 px | 467 px | 321 px |

≤340px widths: rhythm tightens 12→10px, tile padding 12→10px. Larger text /
200% zoom: the shell's single scroll region (`.app > main`) takes over —
content is never clipped, the no-scroll promise applies at default size.
Installed-PWA safe areas move with `--safe-top`/`--safe-bottom` exactly as
the existing screens do (no new handling introduced).

## Shared-selector refactors (one source of truth)

- `packingSummary()` added to utils/packingModel.mjs; Lists' PackingView now
  reads it too (was a component-local useMemo).
- `useTrailReadiness()` extracted from Settings' TrailReadinessCard; both
  surfaces read it (fences updated deliberately in
  tests/settings-beta-readiness.test.mjs, settings-route-direction-order.test.mjs).
- `formatGrams()` moved to utils/format.ts (was ListsScreen-local).
- New one-shot `NavPayload.settings` → `SettingsScreen initialSection`
  (same pattern as Stops/Stages/Lists deep links).

## Naming note (owner decision recorded)

The Today card says **Trail readiness**, matching its destination section in
Settings exactly (predictable navigation beats the generic "Offline
readiness"). A consistent all-surfaces rename remains possible later.

## Explicitly out of scope (unchanged)

Automatic/date-based switching, trip start dates, next-action feeds, task
lists, countdowns, weather, transport live data, document previews, editing
inside Today cards, a readiness percentage, new tabs/pages, changes to
Packing/Trip status semantics, On route redesign.
