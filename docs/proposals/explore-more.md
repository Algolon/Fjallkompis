# Design Proposal: a Stage-based experience layer for Fjällkompis

Status: Proposal v2 (pre-ADR) · Supersedes v1 (`explore-more-v1-stops.md`)
Scope: Abisko ↔ Nikkaluokta, built to scale

> **Revision history.** v1 anchored optional experiences to **Stops** ("Nearby Adventures" inside each
> Stop card). Prototyping that revealed the wrong mental model: Stops are where a hiker asks *"what's
> available here?"* (practical — beds, food, sauna, shop), and loading experiential content onto them
> turns Stops into catch-all containers. v2 pivots to **Stages** — where the hiker asks *"what will I
> encounter today?"* — and removes everything practical (dinner, sauna, café, boats) that duplicates
> Stops/Lists. This is an information-architecture change, reasoned from first principles below.

---

## 0. Implementation status (MVP slice — draft PR off `main`)

Isolated on branch `claude/along-the-way-mvp` (cut from `origin/main`, **no packing-list changes**):
- `src/types/index.ts` — the `RouteExperience` model.
- `src/data/routeExperiences.ts` — curated, segment-keyed data.
- `src/data/experienceModel.mjs` (+ `.d.mts`) — the pure selection/sort/group/classification/validation
  logic, extracted for `node --test` coverage (repo convention).
- `tests/experience-model.test.mjs` — focused tests: 0/1/many, group ordering, segment stability in both
  directions, multi-segment, inline-vs-detail, invalid refs, the no-empty-disclosure rule.
- `src/components/StageExperiences.tsx` — `ExperienceList` + `ExperienceRow` + `ExperienceDetail`
  (reusable; the Explore Index would reuse them unchanged).
- `src/screens/StagesScreen.tsx` — Option A: the "Along the way · N" disclosure + detail view.
- `src/styles/global.css` — the two-disclosure footer, experience rows, detail styles.

Verified in the running app (mobile 375×812): 0/1/many states (d3 empty, d5 flat "·1", d4 grouped "·6"),
three scale-groups in commitment order, inline-expand for on-route sights vs pushed detail for larger,
the major-adventure expedition block, back-navigation, and **route-direction safety** (reversing keeps
each stage's experiences bound to its physical segment; only day numbers flip). `npm test` (357 pass,
incl. 10 new), `npm run typecheck` and `npm run build` all clean; no console errors. Not shipped: Today
card, Stops integration, Explore Index, Map layer, favourites (all deferred). Open review question: the
Day Guide "Highlights" still narrate a few of the same landmarks — overlap deliberately preserved for
live judgement (do not thin yet).

---

## 1. Revised product definition

**What it is:** a quiet, offline layer that helps a hiker *notice and evaluate* worthwhile things to
see, visit or optionally detour to **along each stage of the walk** — from a waterfall you'd pass in
minutes to a full summit day — without ever obscuring the authoritative itinerary.

**What it is not:**
- Not a tourism directory. It carries *experiential route content*, not facilities.
- Not a facilities list. Meals, cafés, saunas, showers, shops, drying rooms, accommodation, reception,
  transport — those answer *"what's here?"* and stay in **Stops** and **Lists** (§8). An experience may
  *mention* a facility only as logistical context ("return to Kebnekaise Fjällstation"), never list it
  as an experience.
- Not a promotional surface. No hero imagery, no colourful category system, no carousels, no CTAs
  competing with the Stage Guide. Collapsed by default; expands only on request.
- Not a seventh navigation tab. It lives inside the existing Stages interface.

**The single hypothesis MVP must validate:**
> *Hikers value a stage-based layer that helps them notice and evaluate worthwhile experiences along the
> route without obscuring the authoritative itinerary.*

---

## 2. The user-question framework (the decision test)

Placement is decided by *which question the content answers at that point in the journey* — not by where
it visually fits.

| Surface | The user's question here | Therefore it owns… |
|---|---|---|
| **Today** | "What matters for the stage I'm walking *now*?" | The current day; may *echo* the current stage's experiences, owns none. |
| **Stages** | "What will I encounter, notice or optionally experience *along this part of the journey*?" | **Experiential route content — this feature.** |
| **Stops** | "What facilities and services are available *at this location*?" | Practical/amenity data. Never experiences. |
| **Map** | "Where am I, where's the route, how do I navigate?" | Navigation. Not a persistent experience layer. |
| **Explore Index (V2)** | "What's worth seeing or doing across the *whole* route?" | A browse lens over the same data. |

Experiences are about *encountering the landscape while moving through it* — see, notice, photograph,
detour, climb, swim. That is a **Stage** question, not a Stop question. The framework points to Stages
unambiguously; §23 stress-tests where that still leaves gaps.

---

## 3. Architecture comparison (objective)

| Criterion | **A — Stops anchor** ("what can I do near this place?") | **B — Stages anchor** ("what can I experience along this part?") |
|---|---|---|
| User mental model | Place-based; good for basecamp trips | Journey-based; matches "what will today be like?" — **stronger for on-route content** |
| Screen responsibility | Overloads Stops (already practical + dense) | Extends Stages' existing job (describe the day) — **cleaner fit** |
| Information density | Stop cards become catch-all containers | Sits inside the Day-Guide region; contained |
| Discoverability | Only when you open a Stop you've reached | Visible per stage while planning the walk — **better** |
| Route relevance | Weak: a stop is a point, experiences are spread along a segment | Strong: a stage *is* the segment the experiences lie on |
| Planning usefulness | "what's near the hut" | "what will today hold, and does it fit my day" — **better** |
| Duplication risk | High — collides with facilities on the same card | Low — experiences and facilities live on different screens |
| Direction reversal | Stop ids stable (good) | Stage *days* flip; needs stable-segment keys + derived wording (§24) |
| Basecamp/rest-day trips | **Natural** (Kebnekaise summit "from the station") | **Awkward** — a summit isn't "along a walking stage" (mitigated, §23) |
| Scalability (more trails) | Per-stop lists | Per-segment lists; segments are the unit routes are built from |
| Maintenance | One anchor id | One anchor + direction wording |
| Offline | Identical (curated data either way) | Identical |
| Explore Index (V2) | Group by place | Group by stage or category — either works |

**Where B (Stages) is genuinely weaker** — and must be mitigated, not glossed:

1. **Basecamp adventures.** Kebnekaise summit and Tarfala are launched from a *stop* on a rest/extra day,
   not "encountered along a walking stage." Forcing them under "along this stage" is a category error.
2. **Multi-stage access.** The same summit is reachable as an extra day whether you arrive (d6) or leave
   (d7) Kebnekaise. It belongs to *both* adjacent stages, not one.
3. **Rest days / after the route.** Some experiences happen on a day with no walking stage at all.
4. **Direction reversal.** "Before the hut" becomes "after the hut"; day numbers change (§24).
5. **Stop-geography vs stage-experience.** The Alesjaure delta *view* is experienced on the approach
   (a stage), but geographically sits at the Stop.

None of these is fatal, but a naive "one experience → one day-number" model breaks on all five. The
recommended architecture (§4) is shaped specifically to absorb them.

---

## 4. Final architecture recommendation

**Stages are the presentation anchor. One canonical experience record, keyed to stable physical route
segments, with Stop and coordinate as secondary relationships, and direction-aware wording derived at
runtime.** This mirrors the app's proven spine (`ROUTE` → `buildDirectionalItinerary` → memoised
selector; one canonical dataset, derived views).

- **Primary presentation anchor:** the **Stage** (the day the hiker is looking at).
- **Canonical data ownership:** a single `RouteExperience` record in `src/data/routeExperiences.ts`
  (curated, read-only, `source` + `lastVerified`, like `stops.ts`). No duplication across surfaces.
- **Keying (direction-safe):** `associatedStageIds: string[]` uses **stable physical segment ids**
  (`d1`–`d7`, which never change with direction) — *not* display-day numbers. An experience may name
  **multiple** segments (a basecamp trip → both adjacent stages). Solves weaknesses 1–4.
- **Relationship to Stops:** `nearestStopId` is a secondary reference for context and the "return to…"
  logistics line — never the anchor. Solves weakness 5.
- **Relationship to Map:** none by default. The detail view offers *"View location on map"* → a
  transient single-point focus (reuses the one-shot payload + existing marker/popup), not a persistent
  layer. A standing Explore map layer is a separate, later decision (§13).
- **Relationship to the Explore Index (V2):** the Index is a *second lens over the same records* —
  grouped by stage or category, filterable. It reuses the data and the row component; the MVP does not
  depend on it (§12).

Recommended because it is the only model that keeps Stages authoritative, keeps Stops practical, avoids
duplication, and survives direction reversal — while still handling basecamp trips honestly.

---

## 5. Naming

The umbrella label must be calm, make optionality obvious, and fit a *waterfall* and *Kebnekaise* alike.

- **Recommended:** **"Along the way"** — humble, clearly optional, international, scale-agnostic. As a
  collapsed disclosure it reads *"Along the way · 4"*. Groups within it name the commitment
  ("On the route" / "Short detours" / "Larger options").
- Runner-up: **"Explore along this stage"** — more literal, but "Explore" is slightly promotional and is
  better reserved for the V2 **Explore** Index.
- Rejected: "Things to Experience" (promotional), "Adventures" (oversells a viewpoint), "Points of
  interest" (generic app-speak).
- Entity term in data/UI copy: an **experience** (neutral, spans all scales).

---

## 6. Experience scale (and how it renders)

Five ordered scales in data; **three groups** in the UI (the only distinction a hiker needs while
scanning). Terminology is chosen so the *consequence* is obvious.

| Data scale | Meaning | Typical commitment | UI group |
|---|---|---|---|
| `on-route` | On/beside the trail | Minutes, no real detour | **On the route** |
| `mini-detour` | Short deviation | ~10–60 min | **Short detours** |
| `short-excursion` | Side trip that shapes the day | ~1–3 h | **Short detours** |
| `half-full-day` | Substantially changes the day | Several hours; may need an overnight | **Larger options** |
| `major-adventure` | Separate, committing day | Own day; weather/safety-critical | **Larger options** |

A stage with only two experiences shows a flat list (no group headers) — groups appear only when the
count earns them (§21). Scale drives grouping and the depth of the detail treatment (§18): `on-route`
sights expand *inline* to a sentence; `mini-detour` and up open a detail view.

---

## 7. Taxonomy — restrained, and dimensions kept separate

The brief's warning is the design rule: **do not fuse content-type, duration, difficulty and
consequence into one category system.** They are four independent dimensions.

1. **Type — *what* it is** (drives the icon; 5, deliberately tight):
   **Viewpoint · Water · Landform · Nature · Culture.**
   - *Viewpoint* — vistas, panoramas, photogenic spots, sunrise/sunset points.
   - *Water* — waterfalls, lakes, rapids, swim spots, river crossings, notable bridges.
   - *Landform* — mountains, **summits**, valleys, glaciers, moraine, rock formations.
   - *Nature* — flora, wildlife, birdwatching.
   - *Culture* — Sami landscapes/history, historical remains, old trail traces.
2. **Scale — *how big* the commitment** (§6): the 5-value ordered enum.
3. **Difficulty — *how hard physically*:** `easy · moderate · hard · alpine` (shown as filled pips).
4. **Planning fit — *does it fit my day*** (§17): a human judgement, not raw numbers.

**Why "Summit" is not a type** (a deliberate change from the v1 prototype): a summit is a *Landform* you
climb; its "summit-ness" is fully carried by scale (`major-adventure`) and difficulty (`alpine`), which
also drive its safety treatment. Making it a separate type would smuggle scale into the type system —
exactly what §15 forbids. Five types stay MECE and honest.

Colour stays **out** of the taxonomy: categories are told apart by **icon shape + label only**. The
palette is semantic (cloudberry = now, glacier = spatial/planning, danger = warning); colour-coding
types would either dilute those roles or import map-style saturation into controls. The Map is the only
sanctioned home for a distinct palette (Design Authority D8).

---

## 8. What must never appear here (anti-duplication)

Excluded outright (they answer "what's *here*?" → Stops / Lists): restaurant meals, cafés, three-course
dinners, shops, food supplies, toilets, showers, **sauna**, drying rooms, accommodation, reception,
transport/boat timetables. A boat that merely shortens the walk is **Transport (Lists)**, not an
experience. A facility may be *named* only as logistics inside an experience ("return to the station"),
never listed as an experience itself.

*(This is the sharpest correction from v1, which wrongly listed the Kebnekaise dinner, the saunas and
the shortcut boats as "adventures.")*

---

## 9. Stage-by-stage research catalogue

*(Filled from fresh experiential, stage-by-stage research — see the dedicated section at the end of this
document, §RESEARCH. Every entry: title · type · scale · segment(s) · nearest stop · route relationship ·
time · added distance · elevation · difficulty · planning fit · extra-day? · weather sensitivity · why
notice · source · confidence · priority.)*

---

## 10. MVP scope

**Ships:**
- `src/data/routeExperiences.ts` — canonical curated data, ~one to a few experiences per stage where they
  genuinely exist (uneven distribution is fine), each with `source` + `lastVerified` + `confidence`.
- **One "Along the way · N" disclosure** in the Stage card footer, beside the existing "Day guide"
  disclosure (integration option & defence in §11). Collapsed by default.
- **Compact experience rows**, grouped by scale (3 groups) only when the count warrants.
- **Inline expand** for `on-route` sights (a sentence); a **detail view** for `mini-detour` and larger.
- **Richer safety detail** only for `major-adventure` items (§18).
- **Explicit planning-fit** on every row and detail (§17).
- **"View location on map"** as a transient focus from a detail (§13) — *if* it's cheap to reuse the
  existing popup; otherwise defer.

**Does not ship (deferred, each easy to add over the same data):** Today card · Stops integration ·
Explore Index · persistent Map layer · favourites/completion state · hero imagery · GPX per experience.

**Post-critique trims (see §12/§24 below):**
- Drop **"View location on map"** from the very first slice if it isn't a trivial reuse — it's a nice-to-
  have, not the core value.
- Don't build the 3-group renderer until a stage actually needs it; ship the flat list first.
- `on-route` sights may not need a detail *record* at all beyond title + one sentence — keep them cheap.

---

## 11. Stage integration — options, evaluation, recommendation

The Stage card today has exactly **two** deliberately-separated interactions: the *Set as current* pill
(top-right, a state change) and the *Day guide* disclosure (full-bleed footer). The Design Authority
separated them "so neither can be hit by accident." Any addition must be defended against that.

| Option | What | Interactions added | Discoverability | Route hierarchy | Verdict |
|---|---|---|---|---|---|
| **A** Sibling disclosure "Along the way · N" below Day guide | 2nd footer disclosure | +1 (a disclosure, not an action) | **High** — visible at card level | Preserved (quieter than Day guide) | **Recommended** |
| **B** Subsection *inside* the Day guide | 0 | Low — buried a scroll deep | Preserved | Fallback |
| **C** Segmented toggle *Route guide \| Explore* inside the card | +1 (a mode switch) | Medium | **Broken** — makes Explore visually equal to the authoritative guide | Rejected |
| **D** Screen-level mode *Stages \| Explore* | +1 (screen mode) | Medium | Splits experience from stage context; is basically the V2 Index | Defer to V2 |
| **E** Always-visible summary (no disclosure) | 0 | High | Adds permanent density — violates §10 "collapsed by default" | Rejected |

**Recommendation: Option A**, and here is the defence the brief demands. The two-interaction rule guards
against a *state-changing action* sitting next to a disclosure and being mis-hit. Option A adds a
*second disclosure of the identical quiet, full-bleed footer type*, stacked directly beneath the Day
guide, clearly separated from the single top-right *Set as current* pill. The failure mode of a mistaken
tap is "a recoverable panel opens," not "state changed by accident." So it is a **defensible deviation,
not a free one**, and its cost is real and named:

- **Cost:** +1 tap target per stage card; a slightly taller footer; marginally more to scan. Seven cards
  × two footer disclosures is more surface than today.
- **Mitigation / fallback:** if field testing shows the second disclosure crowds the card, collapse to
  **Option B** (fold "Along the way" as the last section *inside* the Day guide, and surface a count on
  the Day-guide trigger — e.g. "Day guide · 4 to see"). That preserves discoverability with zero new
  interactions. A is the bet; B is the safety net.

Discoverability decides it: the MVP hypothesis is *help hikers notice*. A buried subsection (B) fails
"notice"; a loud toggle (C) fails "route stays authoritative." A quiet sibling disclosure (A) is the
smallest thing that lets a hiker see, at the stage level, that today holds things worth stopping for.

---

## 12. Explore Index (V2)

A browse lens over the same `RouteExperience` records — *"what's worth seeing across the whole route?"*
Never an MVP dependency; never a duplicate dataset; never a 7th tab by default.

- **Entry points (evaluate at V2):** a quiet action in the **Stages screen header**; a contextual link
  **below the stage list**; later, a planning entry from Today or Settings. A back-stacked pushed screen,
  not a permanent tab.
- **Capabilities (progressive):** browse by stage → by type → duration/difficulty filters →
  "can combine with stage" / "extra day required" → search → saved items → map relationship.
- **Filters, restrained:** at most **Type · Planning-fit · Difficulty** (mirrors §7's dimensions). The
  brief's ~dozen chips collapse into the ones that map to a decision.
- **Grouping default:** by **stage** (matches the anchor model and reads in route order); a
  direction-independent "by type" view is the alternative.

It reuses the exact experience **row** and **detail** components from the Stage integration — so the
Index is additive, and building the Stage layer first is what makes the Index nearly free later.

---

## 13. Map relationship

No automatic experience markers. The Map keeps its single navigation responsibility; a persistent
experience layer risks clutter, reduced route legibility, navigational/optional marker confusion, offline
complexity, icon proliferation and colour-semantic conflicts. Instead:

- A detail view offers **"View location on map"** → the Map opens focused on **one** temporary point
  (reuse the one-shot payload + the existing reused popup instance), which clears on the next
  interaction. No standing layer, no new marker class persisted.
- A standing Explore map layer (toggleable, category-blind styling) is a **separate later decision**,
  evaluated on its own once there is content and demand.

---

## 14. Revised data model (MVP vs later)

One canonical record. Major adventures carry an optional richer block rather than a separate class —
inheritance is avoided because a single type with an optional `expedition` object is simpler to consume
and keeps one source of truth (§16 of the brief: "only use inheritance if it genuinely simplifies").

```ts
export interface RouteExperience {
  // ── identity ──
  id: string;                    // stable slug: 'tjaktja-pass-view', 'kebnekaise-summit'
  title: string;
  shortTitle?: string;           // for tight rows
  summary: string;               // one calm sentence (row / preview)

  // ── classification (four SEPARATE dimensions) ──
  type: ExperienceType;          // 'viewpoint'|'water'|'landform'|'nature'|'culture'  → icon
  scale: ExperienceScale;        // 'on-route'|'mini-detour'|'short-excursion'|'half-full-day'|'major-adventure'
  difficulty?: Difficulty;       // 'easy'|'moderate'|'hard'|'alpine' — omitted for a pure roadside sight
  planningFit: PlanningFit;      // human judgement (see §17)

  // ── route relationship (direction-safe) ──
  segmentIds: string[];          // stable physical stage ids (d1..d7); may be several
  nearestStopId?: string;        // secondary context only, never the anchor
  routeRelationship: string;     // 'On the trail, ~1 h above Tjäktja cabin' / 'Extra day from Kebnekaise Fjällstation'
  positionHint?: 'near-start'|'mid'|'near-end'|'off-route'; // lets wording flip with direction

  // ── essential content ──
  whyNotice: string;             // "what should I not walk past without noticing"
  description?: string;          // offline long-form (detour+ only; on-route sights may skip it)

  // ── provenance (same discipline as stops.ts) ──
  source: StopSource;            // { label, url, lastVerified }
  confidence: 'high'|'medium'|'low';

  // ── optional planning detail (detour+; not for roadside sights) ──
  addedTimeText?: string;        // '+20 min', '2–3 h'
  detourDistanceKm?: number;
  roundTripKm?: number;
  elevationGainM?: number;
  weatherSensitivity?: 'low'|'medium'|'high';
  season?: SeasonWindow;
  coord?: LatLng;                // for "view location on map"

  // ── major-adventure safety block (ONLY for major-adventure scale) ──
  expedition?: {
    extraDayRequired: boolean;
    guide?: { recommended: boolean; required?: boolean; note?: string };
    booking?: { required: boolean; note?: string };
    equipment?: string[];
    turnaroundAdvice?: string;
    decisionPoints?: string[];
    daylightSensitivity?: boolean;
    warnings?: string[];
  };
}
```

- **MVP essential fields:** id, title, summary, type, scale, planningFit, segmentIds, routeRelationship,
  whyNotice, source, confidence.
- **Optional (detour+):** difficulty, description, addedTimeText/distance/elevation, weatherSensitivity,
  season, coord.
- **Major-only:** the whole `expedition` block. A roadside waterfall never carries turnaround advice.

Direction handling (§24): `segmentIds` are stable; user-facing "before/after the hut" wording is derived
at runtime from `positionHint` + the active direction, so nothing is stored per-direction.

---

## 15. Component hierarchy (reuse vs new)

**Reused unchanged:** `.card`, `.stage-card` (+ `is-current`), the footer-disclosure pattern
(`.stage-guide__toggle` semantics — real `<button>`, `aria-expanded/controls`), `.stat-grid` (major
detail facts), `.banner-warn` / `.banner-info`, `.pill` / `.section-label`, the screen shell & tab bar.

**New primitives (small, and shared with the future Index):**
- `ExperienceDisclosure` — the "Along the way · N" footer disclosure (a second instance of the existing
  disclosure pattern; no new visual language).
- `ExperienceRow` — icon-chip + title + planning-fit + optional metadata; inline-expandable for
  `on-route`, navigational for larger. One row, used on Stages *and* the V2 Index.
- `ScaleGroupLabel` — a `section-label` variant ("On the route" / "Short detours" / "Larger options").
- `PlanningFitTag` — quiet `paper-2` metadata chip carrying the §17 judgement.
- `ExperienceDetail` — light layout for sights; the `expedition` block adds the safety treatment for
  major adventures.

Difficulty pips and the icon-only category treatment carry over from the v1 prototype.

---

## 16. Route direction

`segmentIds` reference stable physical stages, so an experience never re-maps when direction flips — only
its *day number* and its *before/after* wording change, both derived at runtime (the established
`buildDirectionalItinerary` pattern). "On the trail ~1 h above Tjäktja cabin" is written direction-
neutral; where a phrase truly depends on approach ("just before the pass"), `positionHint` + direction
generate it. The Explore Index groups by segment (route order re-orients with direction) or by type
(direction-independent). No experience is authored twice.

---

## 17. Planning fit

The most useful field, and the one most easily faked. A human judgement, shown *instead of* raw numbers
as the headline (numbers are available in the detail):

`Directly on route · Adds < 30 min · Adds 1–2 h · Needs a shorter hiking day · Best from an overnight
stop · Extra day recommended · Separate day required`

Honesty rule (surfaced in copy on larger items): feasibility depends on pace, weather, daylight, pack
weight, fatigue, conditions and transport/accommodation. So a major item reads *"Separate day — weather-
dependent"* rather than a false-precise "6 h." We never present speculative precision as certainty; the
`confidence` field and `lastVerified` back this.

---

## 18. Safety & responsibility

Scale drives treatment; the system must not flatten a summit into a roadside-sight card.

- **On-route / mini / short:** light. Title, why-notice, planning-fit, maybe a one-line "know before"
  in neutral `banner-info`. No alarmist styling for ordinary hiking risk.
- **Major-adventure:** the `expedition` block renders a distinct, heavier detail: guide/booking
  requirement, equipment, **turnaround advice**, decision points, seasonal hazards, daylight
  sensitivity, and multiple `source` links with `lastVerified`. Warnings use muted-sienna `banner-warn`
  ("never alarm-red"), reserved for decisions that materially affect safety.
- A permanent line separates *informational support* from *current safety advice*: the app states
  assumptions and cites sources; it does not replace a live avalanche/weather check or a guide.

---

## 19–20. Prototype content (all four scales)

The prototype demonstrates the system across scales so small sights don't feel overdesigned and major
adventures aren't trivialised:
- **On-route sight** — e.g. Tjäktja Pass viewpoint / a glacial river crossing (inline, one sentence).
- **Short detour** — e.g. a lake or side viewpoint, `+20 min`.
- **Medium excursion** — a 2–3 h side trip that shapes the day.
- **Major adventure** — **Kebnekaise South Summit** and **Tarfala Valley**, with the full safety detail.

(Concrete items drawn from §RESEARCH.)

---

## 21. Handling 0 / 1 / many

- **Zero:** the "Along the way" disclosure is **absent** — no empty row, no "nothing here." Silence is a
  valid, honest state (some stages genuinely have less).
- **One / few (≤3):** disclosure shows "Along the way · N"; expanded content is a **flat list**, no group
  headers.
- **Many:** the three scale groups ("On the route / Short detours / Larger options") appear, in that
  order, so commitment rises down the panel.

---

## 22. Design Authority review

| Principle | Verdict |
|---|---|
| One responsibility per screen | ✅ Stages gains experiential content, which *is* its job ("what's today like"); Stops stay practical. |
| Route hierarchy | ✅ Disclosure is quieter than the itinerary; collapsed by default; groups ordered by rising commitment. |
| Progressive disclosure | ✅ Collapsed by default; inline-expand for sights, detail view for larger. |
| Action vs metadata | ✅ Row is a button; the "· N" count is metadata *on* the disclosure trigger, not a separate tappable. Planning-fit is a non-interactive chip. |
| Semantic colour | ✅ No category colours; cloudberry/glacier/danger roles untouched; type by icon+label. |
| Reuse over invention | ✅ Reuses card, disclosure, stat-grid, banners; 5 small new primitives, all shared with V2. |
| Limited interaction count | ⚠️ **Deviation:** +1 disclosure per stage card (§11). Defended, costed, with Option-B fallback. |
| Content density | ✅ Collapsed by default; on-route sights kept to a sentence. |
| Mobile ergonomics | ✅ ≥44px rows; two footer disclosures stack, clear of the top-right pill. |
| Offline | ✅ Curated data, system fonts, no imagery in MVP. |
| Source & verification | ✅ `source` + `lastVerified` + `confidence` on every record; major items cite multiple. |
| Accessibility | ✅ Icon + text always; pips + words for difficulty; focus-visible; disclosure ARIA. |
| Scalability | ✅ Segment-keyed records; per-segment lists are the unit new trails are built from. |
| Consistency with Today/Stages/Stops/Map | ✅ No new colour/nav; Map untouched; Today/Stops unaffected in MVP. |

**The one deviation** is the second stage-card disclosure. Its cost (density, a third tap target) is
named in §11 and bounded by the Option-B fallback. It is not free.

---

## 23. Where the Stage model still strains (and the mitigation)

Restating the honest weaknesses (§3) with their fixes:

1. **Basecamp trips (Kebnekaise, Tarfala).** Mitigation: `segmentIds` lists *both* adjacent stages
   (d6 + d7); `scale: major-adventure`; `routeRelationship: "Extra day from Kebnekaise Fjällstation"`.
   They appear under **Larger options** on both stages, framed as an extra day — honest, not pretending
   they're "along" the walk.
2. **Multi-stage access.** Handled by the `segmentIds` array — no duplicate records.
3. **Rest days.** A rest-day trip attaches to the arrival stage under "Larger options"; the V2 Index (by
   stage) also surfaces it.
4. **Direction reversal.** `positionHint` + derived wording (§16); segment ids are stable.
5. **Stop-geography vs stage-experience.** `nearestStopId` carries the geography; the *stage* carries the
   experience — the two coexist without the Stop card owning experiential content.

If, in testing, basecamp adventures feel wrong under a *walking* stage, the escape hatch is a single
"Larger options / rest-day" group that reads as clearly separate from on-route content — not a return to
Stop-anchoring.

---

## 24. Self-critique → revisions

Turning the review lens on this proposal:

1. **Overcrowding Stages.** Two footer disclosures per card *is* more density. → **Revision:** ship the
   flat list first; only render scale-groups when a stage needs them; keep on-route sights to one line;
   hold Option B ready.
2. **Weakening the Stage Guide.** "Along the way" could compete with or duplicate the Guide's own
   "Highlights." → **Revision:** the Guide stays the *narrative* of the walk; "Along the way" is the
   *structured, actionable* list. Where they'd overlap, the Guide prose defers to the list ("see Along
   the way"), so there's one home per fact.
3. **Too many interactions.** → Defended once (§11) with a fallback; no *further* actions added — no
   favourites, no map layer, no Today card in MVP.
4. **Ambiguous categorisation.** Five types could still blur (a glacier = Landform or Water?). →
   **Revision:** a short authoring rule — classify by the *dominant* reason to notice it (a glacier is
   noticed as a landform; a swimmable tarn as water). Documented beside the data.
5. **Maintenance burden.** ~2–4 items × 7 stages × `lastVerified`, several time-sensitive. → **Revision:**
   MVP ships only `confidence: high` items; low-confidence entries wait; a `verifyBy` surfaces staleness
   in Settings' data page.
6. **Route-direction complexity.** Deriving wording adds logic. → **Revision:** MVP wording stays
   direction-neutral ("near Tjäktja pass"); `positionHint` derivation is a V1.1 refinement, not a
   blocker.
7. **Duplication.** The hard line in §8 (no facilities) plus `nearestStopId` (context, not content)
   keeps Explore and Stops disjoint.
8. **Feature creep.** Index, map layer, Today card, favourites all explicitly deferred; each is additive
   over the same data.
9. **Safety liability.** Scale-driven treatment + turnaround/guide/sources + the
   information-vs-current-advice line (§18) keep major items from reading as casual recommendations.
10. **Visual inconsistency.** No new colours, no emoji in production, icons from the lucide set — the
    prototype uses the real tokens.

---

## 25. Final recommendation (post-critique)

**Anchor experiences on Stages; ship the smallest slice that lets a hiker notice them.**

- **Data:** one canonical `RouteExperience` per thing worth noticing, keyed to **stable segment ids**,
  with `nearestStopId`/`coord` secondary. Type · scale · difficulty · planning-fit modelled **separately**.
  Five content types (Viewpoint · Water · Landform · Nature · Culture). Facilities never included (§8).
- **UI:** one quiet **"Along the way · N"** disclosure per relevant Stage (Option A, defended, Option B
  as fallback); compact rows; inline-expand for on-route sights, a detail view for larger; a distinct,
  heavier **safety detail** only for major adventures. Planning-fit as the headline, numbers in support.
- **Not now:** Today card · Stops integration · Explore Index · persistent Map layer · favourites. Each
  is a thin later layer over the same records.
- **Direction-safe, offline, sourced, calm.** The route stays the backbone; the experience layer helps
  the hiker *notice* — without turning Fjällkompis into a points-of-interest app.

The test at every step: *what is the user's question at this point in the journey, and is this the
clearest place to answer it?* For "what will I encounter today?", the answer is the Stage — quietly.

---

## §RESEARCH — Stage-by-stage experiential catalogue

Experiential, on-route content only (facilities excluded per §8). Keyed to stable segment ids (d1–d7).
**Scale:** on-route / mini / short / half-full / major. **Fit** = planning fit (§17). **Conf** = source
confidence. **Pri** = implementation priority. *Deliberately uneven* — diffuse "the walk is pretty"
belongs to the Day Guide, not here, so d3/d5 carry few discrete items (§19, §24-#2).

**Two flags carried from research (do not ship as-is):** the "Rihdonjira" waterfall name is unverifiable
(what exists is the Abiskojåkka canyon + Nissonjohka rest node); and the big suspension bridge near Singi
is on the *southern* Kaitumjaure spur — **off** this route (you turn east) — so it must not be listed.

### d1 · Abisko → Abiskojaure
| Experience | Type | Scale | Fit | Diff | Why notice | Conf/Pri |
|---|---|---|---|---|---|---|
| Abiskojåkka canyon & blasted rail tunnel | Water | mini-detour | Adds <30 min | easy | Turquoise glacial river in a blasted gorge at the trailhead | high · P0 |
| Limestone cliff viewpoint over the river | Viewpoint | on-route | Directly on route | — | Open river-canyon view a few km in | high · P1 |
| Mountain-birch forest & birdlife | Nature | on-route | Directly on route | — | Sub-arctic birch; bluethroat, redwing, brambling | high · P1 |
| Lapporten (Čuonjávággi) sightline | Viewpoint | on-route | Directly on route | — | Sweden's emblematic glacial U-valley on the skyline | high · P0 |
| Abiskojaure lake (cold dip) | Water | on-route | Directly on route | easy | Clear glacial lake; bracing seconds-long plunge | high · P2 |

### d2 · Abiskojaure → Alesjaure
| Experience | Type | Scale | Fit | Diff | Why notice | Conf/Pri |
|---|---|---|---|---|---|---|
| Treeline transition ("Kieron" climb) | Viewpoint | on-route | Directly on route | — | The moment the birch ends and the alpine opens | high · P1 |
| Chain of turquoise tundra lakes | Water | on-route | Directly on route | — | Robin's-egg lakes under high peaks | high · P1 |
| Lakeside beach ~6 km before Alesjaure | Water | mini-detour | Adds <30 min | easy | Pebble/sand shore; pause or cold dip | medium · P2 |
| Alesjaure delta panorama | Viewpoint | on-route | Directly on route | — | Braided glacial delta ringed by peaks — a signature vista | high · P0 |
| Laevas Sámi settlement & reindeer fence | Culture | on-route | Directly on route | — | Living reindeer-herding landscape; Gabna/Laevas boundary | high · P0 |

### d3 · Alesjaure → Tjäktja *(sparse — mostly route character → Day Guide)*
| Experience | Type | Scale | Fit | Diff | Why notice | Conf/Pri |
|---|---|---|---|---|---|---|
| Reindeer & tundra birdlife (Alesätno valley) | Nature | on-route | Directly on route | — | Prime reindeer country; golden plover, skua, ptarmigan | medium · P2 |

### d4 · Tjäktja → Sälka *(the richest stage)*
| Experience | Type | Scale | Fit | Diff | Why notice | Conf/Pri |
|---|---|---|---|---|---|---|
| **Tjäktja Pass viewpoint** (1,150 m) + wind shelter | Viewpoint | on-route | Directly on route | moderate | Highest point of Kungsleden; a 30 km valley opens south | high · P0 |
| Glacial moraine & three-valley junction | Landform | on-route | Directly on route | — | Textbook U-valley, moraine, hanging valleys | high · P1 |
| Descent into Tjäktjavagge | Viewpoint | on-route | Directly on route | — | Widely called the route's prettiest reveal | high · P1 |
| Sockertoppen ("Sugar Top") from Sälka | Landform | short-excursion | Needs a shorter day | hard | Named side-summit scramble with Sarek views | medium · P2 |
| Nallo side-valley detour | Landform | half-full-day | Best from an overnight stop | moderate | Dramatic side valley / loop alternative | medium · P2 |
| Sälka bathing stream | Water | mini-detour | Adds <30 min | easy | Cold dip, reindeer watching | medium · P2 |

### d5 · Sälka → Singi *(sparse)*
| Experience | Type | Scale | Fit | Diff | Why notice | Conf/Pri |
|---|---|---|---|---|---|---|
| Glacier & peak-wall panorama (Singitjåkka) | Landform | on-route | Directly on route | — | Broad glacier and precipice views along the valley floor | high · P1 |

### d6 · Singi → Kebnekaise Fjällstation
| Experience | Type | Scale | Fit | Diff | Why notice | Conf/Pri |
|---|---|---|---|---|---|---|
| Turn into Ladtjovagge — the massif reveal | Viewpoint | on-route | Directly on route | — | Register shifts to high-alpine; Sweden's highest range appears | high · P1 |

### d7 · Kebnekaise → Nikkaluokta
| Experience | Type | Scale | Fit | Diff | Why notice | Conf/Pri |
|---|---|---|---|---|---|---|
| Darfáljohka suspension bridge & canyon | Water | on-route | Directly on route | — | The route's signature bridge crossing over a canyon | high · P0 |
| Return into mountain-birch forest | Nature | on-route | Directly on route | — | Bookends the d1 forest; boggy boardwalk stretches | high · P2 |
| Ladtjojaure lakeshore | Viewpoint | on-route | Directly on route | — | Long lake dominating the finish *(boat = Transport, not here)* | high · P2 |

### Major adventures · Kebnekaise basecamp *(segments d6 + d7; "extra day")*
| Experience | Type | Scale | Fit | Diff | Why notice | Conf/Pri |
|---|---|---|---|---|---|---|
| **Kebnekaise South Summit — Western route** | Landform | major-adventure | Separate day required | alpine | Sweden's highest; glacier crossing; South ice-peak now below the North rock-peak | high · P0 |
| **Tarfala Valley & research station** | Landform | half-full-day → major | Extra day recommended | hard | Glacial cirque; world's longest glacier mass-balance record | high · P0 |

**Full-fidelity fields** (added distance, elevation, duration ranges, weather sensitivity, turnaround/
guide/equipment, coordinates, multiple sources) live only on the `major-adventure` records; on-route
sights carry title + type + why-notice + one source. Verify before publishing: Nallo/Vistas junctions,
the "Rihdonjira" name, boat-landing distances.

