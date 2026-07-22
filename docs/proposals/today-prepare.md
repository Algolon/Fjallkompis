# Today — Prepare (design specification & prototype)

Status: **prototype v2 for owner review — not production-final, not merged**
Branch: `claude/today-prepare` (from `main` @ 55a00b2, v0.23.0, schema v6)
Origin: the Trip plan proposal reserved this view ("a future Today 'Prepare'
view will read the pure trip summary selectors"; docs/proposals/trip-plan.md).

Revision 2 (owner design review): the mode selector became a compact capsule
in the header title row (no separate content row); the permanent
Online/Offline badge left Today; the screen-header rhythm was standardised
app-wide (fixed 44px title row, accessories never shift the subtitle); Route
became a spruce hero with explicit Map + Stages actions; the summary cards
gained consistent decorative icons; and an explicit STF membership
quick-access (wallet metadata, no schema bump) can sit beside Tonight in
On route.

OnlineBadge decision: removed rather than relocated. navigator.onLine only
reports an up network interface (not reachability, not archive readiness) —
a permanent positive "Online" pill was the exact false-signal this pass
removes. A future compact Map indicator should combine offline-basemap
presence with connectivity only when tiles would actually fail; that is its
own small design task (verify against every map control at 320/375/390) and
is deliberately a follow-up, not smuggled into this pass.

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

## Layout (as built, revision 2)

```text
KUNGSLEDEN
Today            [ ●Prepare | On route ]   ← capsule tablist in the title row
Your trip preparation at a glance.

┌─────────────────────────────────┐
│ ROUTE            (spruce hero)  │
│ Abisko → Nikkaluokta            │
│ 7 stages · 104.5 km             │
│ ( ≈ Map )  ( ⛰ Stages )        │  ← two sibling actions, hero not clickable
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 🎒 PACKING LIST                 │
│ 30 Needed · 28 Ready · 16 Packed│
│ 23 essentials still to pack · ≥ 5.78 kg
└─────────────────────────────────┘
┌───────────────┐ ┌───────────────┐
│ TRAVEL & STAYS│ │ ✓ TRAIL       │
│ 1 Needed      │ │   READINESS   │
│ 2 Planned     │ │ 1 / 4 ready   │
│ 2 Confirmed   │ │ Setup needed  │
│ 🚌 3 travel · 🛏 2 stays        │
└───────────────┘ └───────────────┘

On route additionally (when an STF membership is marked for Today):
┌───────────────────────┐ ┌──────┐
│ TONIGHT  Abiskojaure ›│ │ 🪪   │
│ …                     │ │ STF  │
└───────────────────────┘ └──────┘
```

The eyebrow (standard ScreenHeader slot) reads KUNGSLEDEN, so the Route hero
leads with the directional endpoints (single source:
`itinerary.startStopId/endStopId`, flips with Route direction) instead of
repeating the trail name. Hero action colours follow the day-hero semantics:
Map = glacier (spatial), Stages = cloudberry (information depth).

Compact-width adaptations (measured, honest content only): ≤360px the
half-width tiles drop their chevron column so labels and icon rows hold one
line; ≤340px full-width cards drop chevrons too and rhythm tightens one
step. Cards stay whole-card buttons with pressed states and "Opens …"
accessible names.

## STF membership quick access (wallet metadata)

Two additive optional fields on WalletDocument (IndexedDB records are
schemaless per-record — no DB version bump, no PersistentState change):
`membershipProvider?: 'stf' | 'other'` and `showOnToday?: boolean`. Both are
EXPLICIT editor choices on Membership documents (Organisation select +
"Show quick access on Today", defaulting ON when STF is chosen); nothing is
ever inferred from filenames/titles/notes, and normalisation drops the
fields the moment they stop being meaningful (recategorised documents can't
keep a stale card). Uniqueness is explicit: saving a flagged document runs
`enforceMembershipQuickAccess` (one transaction clears every other flag);
`quickAccessMembership()` still picks deterministically (pinned →
updatedAt → id) should legacy data ever hold two. The Today card renders
only after verifying the blob exists locally — a missing file OMITS the
action (Tonight keeps full width); the honest missing-file notice stays in
Lists → Trip where the document is managed. Opening reuses the shared
`openWalletDocument` helper and the exported TripImageViewer — no new
viewer. No STF logo asset exists in the repo, so the treatment is the
neutral IdCard icon + "STF" monogram, accessible name "Open STF membership
card".

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

## Height budget (measured, revision 2, default text size)

| Viewport | Prepare spare | On route |
|---|---|---|
| 320 × 568 | **13 px** | scrolls (as pre-Prepare) |
| 360 × 560 (short) | **14 px** | scrolls (as pre-Prepare) |
| 375 × 667 | **87 px** | 3 px over (content fully visible; only bottom padding scrolls — better than the ~8 px pre-Prepare baseline) |
| 390 × 844 | **264 px** | fits, 0 overflow |

The compact header control adds NO separate row: the old full-width
selector + topline cost ~69 px of On route height, all recovered. Larger
text / 200% zoom: the shell's single scroll region (`.app > main`) takes
over — content is never clipped, the no-scroll promise applies at default
size. Installed-PWA safe areas move with `--safe-top`/`--safe-bottom`
exactly as the existing screens do (no new handling introduced).

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
