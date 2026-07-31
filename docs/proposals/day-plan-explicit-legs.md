# Day plan: explicit hiking legs (schema v10)

Status: **v0.27.0 release candidate**. Explicit Hiking legs, active personal
Journey/Today, Journey Places and editable Stay ↔ Place linking are complete,
integrated and hardened; the release PR (`v0.27.0-release` → `main`) carries
the version bump and release notes, and merging it deploys v0.27.0 to
production. A wildcamp remains a normal unlinked `Other stay`, not a separate
v0.27.0 feature. The slice sections below are the historical implementation
record of how the milestone was built.

## Why

The released v0.26.x model stored a hiking activity as a COUNT of adjacent
canonical stages (`{ kind: 'hiking', stages: n }`), consumed in walking order
from a shared cursor, with the invariant that all counts partition the route
exactly once. That made a skipped, repeated, reversed or out-and-back section
structurally unrepresentable, forced endpoint edits to merge/split
neighbouring days, and left v0.26.1 refusing Hiking → Rest edits outright
because the freed section had nowhere expressible to go.

## The persisted model

```ts
type DayActivity =
  | { kind: 'hiking'; legs: CanonicalHikingLeg[] }
  | { kind: 'travel' }
  | { kind: 'rest' };

interface CanonicalHikingLeg {
  id: string;                       // stable, unique across the WHOLE plan
  kind: 'canonical-stage';          // deliberately closed; no free-form route
  stageId: string;                  // physical stage id, 'd1'..'d7'
  orientation: 'canonical' | 'opposite';
}

interface DayPlanState {
  direction: RouteDirection;
  startDate: string;
  journeyActive: boolean;           // explicit personal-Today activation
  currentDayId: string | null;      // the active calendar day
  currentLegId: string | null;      // the active hiking OCCURRENCE
  days: PlannedDayRecord[];
}
```

Orientation is ABSOLUTE over the physical stage — 'canonical' is the stored
north-to-south direction, 'opposite' the same verified line in reverse. It is
never relative to the app's selected route direction, so re-reading a plan
can never reinterpret a leg. A reverse-direction plan's natural legs are
'opposite' legs.

Leg ids are identities, not positions: repeats of the same stage are
different legs, ids survive unrelated edits and reloads, and migrated v9
data gets deterministic ids (`leg_<dayId>_<stageId>` — unique because v9
walked every stage exactly once). New legs use the repository id shape
(`leg_<base36>_<random>`).

## Structural validity vs diagnostics

Hard blockers (the plan normalises to null — the honest fallback the
released normaliser already used): unknown stage id, malformed leg, unknown
orientation, duplicate leg id anywhere, an empty hiking activity, or two
consecutive legs within one activity whose oriented endpoints do not
connect. A day's walk is one continuous line on the ground.

Everything else is a DIAGNOSTIC (src/plan/coverageDiagnostics.mjs), shown as
information in the planner's edit mode and never a blocker, an auto-repair
or a mutation: missing sections, repeats, contrary-orientation legs,
disconnected day boundaries, omitted canonical start/end.

## Derivation

Every hiking day derives from its OWN legs (src/plan/plannedDays.mjs). A leg
resolves to the forward itinerary's stage view for 'canonical' and the
reverse itinerary's for 'opposite' — the one verified reversal transform
(src/route/itinerary.mjs: reversed points with mirrored cumulative
distances, swapped ascent/descent, re-derived profile). Nothing is
recomputed or fabricated; repeats count twice; the overnight follows the
LAST leg's oriented end.

## v9 → v10 migration

src/plan/dayPlanMigration.mjs replays the released cursor walk exactly:
the stored direction fixes the walking order, every count becomes explicit
legs in place, day ids / activity order / overnights / dates survive
verbatim, and `currentLegId` derives only when the released pointer pair
(currentDayId + currentStageId) agrees on exactly one migrated leg. Legacy
data the released model could not have persisted (under/over-consumption,
bad counts, unknown direction) refuses to migrate: the active `dayPlan` lands
on `null`, the original plan is preserved verbatim in `dayPlanRecovery`, and
all unrelated state stays untouched.

## The pointer model

- `currentDayId` — the active personal calendar day;
- `currentLegId` — the specific hiking occurrence within that day (a stage
  may be walked several times, so a stage id alone cannot name where the
  user is); only ever honoured together with `currentDayId`, written
  atomically with it and `currentStageId`;
- `currentStageId` — the canonical physical stage context every generic
  (no-plan) screen keeps using, unchanged.

`setCurrentStage` (Stages → "Set as current") follows the stage's planned
occurrences: exactly one → all three pointers move together; none → route
progress moves, the day stays, the leg pointer clears; several → route
progress moves and NO occurrence is picked — an arbitrary first-match would
be a guess. `setCurrentLeg` exists for occurrence-specific selection.

### Integrated interaction decisions

- **Occurrence chooser** — Stages → "Set as current" on a stage the plan
  walks more than once opens a chooser (day number, date, oriented route,
  reverse status, current marker); no pointer moves until the user picks,
  and the first occurrence is never assumed. Zero occurrences move route
  progress only and clear the leg pointer.
- **New-day continuation** — a day taking hiking on never repeats a stage
  silently: exactly one not-yet-planned connecting section auto-proposes by
  name; every other case (a fork, or only already-planned sections) opens
  the explicit StartLegOptions chooser with repeats marked.
- **Reverse guide context** — an opposite leg's Stage Guide deep link opens
  the CANONICAL guide with a contextual note ("your planned leg walks this
  section in the opposite direction; the guide below describes the X → Y
  walk"). The guide prose is never rewritten or presented as editorially
  reversed. FULLER direction-aware guide content (true reverse editorial,
  per-leg prose) remains DEFERRED — it needs researched, verified writing,
  not a mechanical mirror.
- **Migration recovery** — a stored plan that cannot load is set aside
  verbatim in `PersistentState.dayPlanRecovery` with a calm Settings notice
  (download / confirmed removal); nothing is silently destroyed.

The canonical Stages screen deliberately remains a canonical route browser
(cards are not duplicated for repeated planned occurrences), and the Map still
draws single physical stages. A whole-day multi-leg route line remains outside
v0.27.0 scope until real multi-stage map support exists.

## Slice 2: active personal Journey on Today

`journeyActive` is the explicit persisted choice behind **Use Day plan on
Today**. It is not inferred from `currentDayId`: the pointer is a manual day
selection inside personal mode, while activation chooses between the personal
calendar Journey and the generic seven-Stage Journey. New plans, migrated v9
plans, old v10 payloads without the field and malformed values all normalise
inactive. Schema remains v10 because v10 has not shipped and the new field is
additive and safely defaultable; `dayPlanRecovery.dayPlan` remains the user's
verbatim legacy object and is never normalised in place.

Today uses one pure precedence model: valid transient Preview; then, only when
personal Journey is active, valid manual day, exact local-date match, first day
before the plan, or final day after it; finally the generic canonical
`currentStageId`. The resolver only reads and never writes automatic pointers.
Preview remains transient and outranks both modes; exiting it reveals the
active personal result or generic Today.

The Day plan overview marks the effective row **Current** and separates
**Preview** from **Set current day**. Selecting a calendar day stores
`currentDayId`, clears `currentLegId`, and preserves `currentStageId`; it never
guesses a Hiking occurrence. Today’s Journey summary opens a planned-day
chooser with **Follow plan dates**, which clears both personal pointers while
leaving activation and canonical Stage context intact. Before/after/manual
context is carried height-neutrally as **Up next**, **Plan ended**, or
**Selected** in the existing hero/summary lines.

## Slice 3: Places + editable Stay ↔ Place linking

The third v0.27.0 slice adds the **Journey Place** reference layer
(`src/data/journeyPlaces.mjs`) and makes the Stay ↔ Place association
user-editable. Full architecture and decisions live in
docs/proposals/trip-plan.md → "Places & Stay ↔ Place linking (v0.27.0)";
the day-plan-relevant facts are:

- a Place is read-only reference data (route-stop adapters over `STOPS`
  plus one curated off-route record, STF Kiruna); a Stay stays the
  user-owned primary record. `linkedStopId` (v9) migrates verbatim into
  the editable `linkedPlaceId` — route Place ids preserve stable stop ids;
- schema REMAINS v10: v10 had not shipped when this slice landed, so the
  field change is part of the one released v10 shape and v9 → v10 stays
  the public migration boundary.
  `dayPlanRecovery` passes through byte-for-byte untouched;
- Day-plan overnights keep referencing Trip item ids. Linking, relinking
  or unlinking a stay never moves it between days, never changes Tonight,
  and never touches `dayPlan` — link edits rewrite the `trip` array only;
- the canonical route model is untouched: off-route places never enter
  `itinerary.orderedStops`, route kilometres, Stage endpoints, Hiking-leg
  connectivity or GPX geometry;
- a wildcamp or other uncatalogued accommodation remains a plain
  `Stay type: Other stay` (free-text location, no link, valid overnight).
  A dedicated wildcamp model and user-created Places are documented as
  possibilities BEYOND v0.27.0 (ROADMAP → "Personal Journey and Places
  follow-ups").
