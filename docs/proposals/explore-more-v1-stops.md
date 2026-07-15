# Design Proposal: "Explore" — an optional-experiences layer for Fjällkompis

Status: Proposal (pre-ADR) · Author: product/UX design pass · Scope: Abisko ↔ Nikkaluokta, built to scale

> Working title in the brief was "Explore More." Recommended name: **Explore** (surface) /
> **Nearby** (contextual label on a Stop). Data entity: **Adventure**. Rationale in §12.

> **Decision (confirmed).** MVP = **"Nearby Adventures" on Stops + an Adventure Detail page**, with
> an optional small contextual card on **Today**. **No** Explore tab, browse index or Map lens yet —
> but the data model and IA are built so those bolt on later without refactoring. Build order:
> **(1) architectural foundation first** — types + `adventures.ts` dataset, no UI — for review; then
> **(2)** the smallest UI slice in a later iteration. This step delivers **(1)**:
> `Adventure` types in `src/types/index.ts` and the curated `src/data/adventures.ts`. Aligns with the
> Design Authority: architecture first, smallest validated increment, evidence-driven evolution.

---

## 1. Product vision

Fjällkompis today answers one question with total clarity: **"Where do I walk, and what do I need?"**
The itinerary is the spine; every tab has one job; nothing optional is allowed to blur the line.

There is a second question a hiker asks — but only *after* the first is settled:

> **"I'm here. I have some energy and maybe a spare afternoon. What's worth doing?"**

That question is currently unanswered inside the app, so hikers answer it with screenshots, blog
tabs, and half-remembered advice — offline, in a valley, exactly where those fail.

**Vision:** Fjällkompis becomes a calm offline companion that, *without ever weakening the
itinerary*, can quietly tell you what's worth experiencing near where you already are — a summit,
a sauna, a glacier valley, a Sami café — with just enough honest information to decide *go / no-go*
and prepare safely.

Three non-negotiable principles, inherited from the app's DNA:

1. **The walk stays sacred.** Optional content never appears *as if* it were part of the route.
   "I must walk here" and "I could explore this" are rendered as visibly different things.
2. **Places, not segments, are the anchor.** A hiker thinks "I've reached Kebnekaise," not
   "I'm on Stage 6." (§2 shows this is not just intuition — the codebase *requires* it.)
3. **One curated source of truth, derived views.** Same discipline as `stops.ts` and the route:
   one dataset, `lastVerified` provenance, surfaced through lenses, never duplicated.

---

## 2. The finding that settles the architecture

The brief hypothesises that the anchor should be **Stops, not Stages**. That is correct — and the
reason is stronger than "hikers think in places." It's baked into the code:

- **Stages are directional.** The app supports reversing the route (ADR 0003). `buildDirectionalItinerary`
  re-derives stage **day numbers** on every flip: Stage `d6` is "Day 6" northbound and a different day
  southbound. A stage's *identity as a day* is not stable.
- **Stops are stable.** `TrailStop` ids (`abisko`, `salka`, `kebnekaise`, …) never change with direction.
  Kebnekaise summit launches from Kebnekaise Fjällstation whether you're walking north or south.

So anchoring adventures to **Stage/day** would mean re-mapping every adventure whenever the user flips
direction. Anchoring to **Stop** is not just the better mental model — it's the only anchor that
survives the app's own route-direction transform. **Anchor on Stops. Reference Stages read-only.**

### A distinction the brief blurs (and we must not)

There are two different things hiding under "optional experiences":

| | **On-trail highlight** | **Off-trail adventure** (the feature) |
|---|---|---|
| Example | Tjäktja Pass view, Lapporten silhouette, the Abisko canyon glimpse | Kebnekaise summit, Tarfala valley, Aurora Sky Station, the saunas |
| Cost | Zero — you pass it anyway | A deliberate decision to spend time/energy |
| Belongs to | The **walk** → a line in the Stage day-guide | **Explore** → anchored to a Stop |

If we let on-trail highlights into "Explore," we recreate exactly the itinerary-blurring the brief
fears. **Explore is only for things that require a decision to do them.** On-trail highlights stay as
prose in `stageGuides.mjs` where they already live. This single cut removes ~30% of the apparent scope
and sharpens the mental model.

---

## 3. Architecture comparison

One dataset (`adventures.ts`) is a given in every option — the question is only *which surfaces
consume it*.

| Option | What it is | Strength | Fatal weakness | Verdict |
|---|---|---|---|---|
| **A — Separate Explore tab** | 7th bottom-nav tab, browsable catalogue | Great for browsing/planning; scales to many trails | A 7th tab in a deliberately-minimal 6-tab bar; competes with the itinerary for attention; reads as "a second app" | Over-built for MVP |
| **B — Inside Stops** | "Nearby" group in each StopCard | Perfectly contextual; place-anchored; zero nav cost; reuses accordion | Can't survey the *whole* menu ("show me every summit"); weak for at-home planning | **Primary surface** |
| **C — Inside Map** | Adventure markers only | Spatial discovery near you | Map is already dense; poor for reading/deciding; not everyone thinks spatially first | **Lens, not home** |
| **D — Hybrid** | One dataset, several lenses, one named primary | Contextual *and* browsable; each surface does one job | "Hybrid" is a cop-out unless the primary is named and the others are secondary | **Winner, once specified** |

The failure of A and C is the same: they make Explore a *destination* that competes with the walk.
The failure of B alone is that it can't answer the *planning* question ("what could I do on this trip?").
The answer is D — but disciplined: **B is the primary surface; Map and a browse Index are secondary
lenses over the same data; nothing gets a permanent tab until the catalogue outgrows one trail.**

---

## 4. Recommended architecture

**One curated dataset, a Stop-anchored primary surface, two derived lenses. No new bottom-nav tab (yet).**

```
                       src/data/adventures.ts          ← ONE curated source of truth
                   (stable slug ids · anchorStopId · source+lastVerified)
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                       ▼
   PRIMARY  (in the field)     LENS (spatial)         LENS (planning)
   ────────────────────       ──────────────         ──────────────────
   Stops → "Nearby (N)"        Map → optional         "Explore" index:
   in each StopCard            Adventure layer        filter · search · browse
   → Adventure detail          (toggle, off by        (reached from Today card +
                                default)               Stops header action —
   Stages → read-only                                 NOT a permanent tab in MVP)
   "Nearby (N) →" that
   deep-links to the Stop
```

Why no new tab in MVP:

- The bottom bar already holds 6 tabs — the practical ceiling on a phone. A 7th costs *every* screen's
  calm to serve a job (browsing the whole catalogue) done a handful of times per trip.
- The two real jobs have different frequencies:
  - **Decide in the field** (repeated, contextual) → served by Stops. ✔ the brief's hypothesis.
  - **Plan the menu** (rare, once or twice) → doesn't need permanent real estate. A card on **Today**
    ("Explore side trips along your route →") and a header action on **Stops** open a full **Explore
    index** via the existing one-shot deep-link payload pattern.
- Promote Explore to a real tab *only* when it spans multiple trails and browsing becomes a primary,
  frequent job. That's a V3 decision, made with usage data — not an MVP assumption.

This mirrors the app's own spine: **one canonical dataset + derived views consumed everywhere**, exactly
like `ROUTE` → `buildDirectionalItinerary` → memoised selector.

---

## 5. User journey

**Before the trip (planning, at home, online):**
Today screen → "Explore side trips (12) →" → Explore index → filter *Time: Needs a day* → sees
Kebnekaise summit + Tarfala → opens each → reads "Know before you go" (guide recommended, crampons,
book dinner) → mentally budgets one rest day at Kebnekaise. *(Later: bookmarks/favourites — V2.)*

**In the field (deciding, offline, at a hut):**
Arrives Kebnekaise Fjällstation → opens Stops → Kebnekaise card → **Nearby (4)**: *Summit · Tarfala ·
Three-course dinner · Sauna* → taps **Tarfala valley** → quick-facts strip: *Moderate–hard · 16 km rt ·
600 m · 5–6 h · Full day* → decides it fits tomorrow's rest day → "Show on map" to see the valley →
back to the Stop for facilities/beds. Route never touched.

**Reversed direction (southbound → northbound):**
User flips direction in Settings. Day numbers change; **Kebnekaise's Nearby list is identical** because
adventures anchor to the Stop, not the day. Nothing to re-map. (This is §2 in action.)

---

## 6. Navigation flow

```
Today ──"Explore side trips (N) →"──────────────► Explore index ──tap──► Adventure detail
                                                     ▲   │                     │
Stops ──header action "Explore"──────────────────────┘   │ filter/search       │ "Show on map"
  │                                                       ▼                     ▼
  └─ StopCard ─ "Nearby (N)" ─ tap ─► Adventure detail ◄──┘               Map (adventure
        ▲                                  │                               layer on, pin
        └──── "From basecamp" link ────────┘                               focused)
Stages ─ stage-card ─ "Nearby (N) →" ─► deep-links to that Stop's card (no duplication)
Map ─ [Adventures] toggle ─► markers ─ tap ─► preview popup ─ "open details" ─► Adventure detail
```

All cross-surface jumps use the existing **one-shot in-memory payload** (`navigate(tab, payload)`) —
never URL params — so a bookmarked/refreshed URL opens the plain destination. Consistent with how
Stops→Lists and Map→Stops already work.

---

## 7. Wireframe sketches

### 7a. Stop card with "Nearby" (primary surface)

```
┌─────────────────────────────────────────────┐
│ Kebnekaise Fjällstation      mountain-station│
│ Bed capacity · Sauna · Restaurant · Shop     │
│ ─────────────────────────────────────────── │
│ ▸ Facilities                                 │
│ ▸ Trip note                                  │
│ ▾ Nearby · 4                                 │  ← new disclosure group
│    🏔  Kebnekaise summit      Alpine · full+ │
│    🥾  Tarfala valley          Hard · full   │
│    🔥  Three-course dinner     Comfort       │
│    🔥  Sauna & shower          Comfort       │
│         (tap a row → Adventure detail)       │
└─────────────────────────────────────────────┘
```

### 7b. Adventure detail (no hero image in MVP — see §11)

```
┌─────────────────────────────────────────────┐
│ 🏔  Kebnekaise summit                        │
│ From Kebnekaise Fjällstation · leaves trail  │
│ ┌───────── quick facts ─────────┐            │
│ │ Alpine · 18 km rt · 1,700 m ↑ │            │
│ │ 9–15 h · Needs a day          │            │
│ └───────────────────────────────┘            │
│                                              │
│ Why it's worth it                            │
│ Sweden's highest peak. The South (glacier)   │
│ peak is melting below the North peak — a     │
│ climate story you stand on top of.           │
│                                              │
│ Highlights                                   │
│ • Views over the whole massif                │
│ • Kaffedalen · the security cabin            │
│                                              │
│ ⚠ Know before you go                         │
│ • Guide strongly recommended (glacier)       │
│ • Crampons; final section over ice           │
│ • Western route is the standard; Eastern     │
│   guided tours suspended for 2026            │
│ • Best July–August                           │
│                                              │
│ [ Show on map ]   [ From basecamp → ]        │
│                                              │
│ Source: STF · verified 2026-07              │
└─────────────────────────────────────────────┘
```

### 7c. Explore index (planning lens)

```
┌─────────────────────────────────────────────┐
│ Explore            🔍 search                  │
│ [ Category ▾ ] [ Time ▾ ] [ Difficulty ▾ ]   │  ← exactly 3 filters (§10)
│ ─────────────────────────────────────────── │
│ Abisko                                       │
│  🌄 Aurora Sky Station    Easy · half-day    │
│  🏔 Nuolja summit         Moderate · half    │
│  🧊 Abisko canyon         Easy · combines    │
│ Alesjaure                                    │
│  🔥 Wood-fired sauna      Comfort            │
│  🛶 Alesjaure boat        Time-saver         │
│ Kebnekaise Fjällstation                      │
│  🏔 Kebnekaise summit     Alpine · needs day │
│  🥾 Tarfala valley        Hard · full-day    │
│  …                                           │
└─────────────────────────────────────────────┘
```

### 7d. Map lens

```
Map  [Route ✓] [Huts ✓] [Adventures ○]  ← new toggle, OFF by default (keeps map calm)
        turning it on drops category-colored pins; tap → preview → "open details"
```

---

## 8. Data model proposal

Placed in `src/types/index.ts` (shared types) with curated data in `src/data/adventures.ts`, following
`stops.ts` exactly: stable slug ids, `source` + `lastVerified`, coordinates where useful.

```ts
export interface Adventure {
  id: string;                     // stable slug: 'kebnekaise-summit', 'alesjaure-sauna'
  title: string;
  category: AdventureCategory;    // ONE primary category → drives icon/color
  tags: AdventureTag[];           // secondary attributes for search: 'photography','wildlife','time-saver'...

  anchorStopId: string;           // PRIMARY basecamp — stable Stop id (never a stage/day)
  alsoFromStopIds?: string[];     // rare: reachable from a second stop
  alongStageIds?: string[];       // stages this sits "along" (for the read-only Stage reference)

  leavesTrail: boolean;           // true = real detour; false = at/beside the hut (sauna, dinner)
  timeCommitment: TimeCommitment; // 'combines-with-day' | 'half-day' | 'full-day' | 'extra-day'
  effort: EffortProfile;

  summary: string;                // one calm sentence (list/preview)
  description: string;            // offline long-form: why it's worth it
  highlights?: string[];          // 2–4 bullets
  knowBeforeYouGo?: string[];     // warnings, season, prep — safety-forward
  season?: SeasonWindow;          // { fromMonth, toMonth, note? }
  coord?: LatLng;                 // destination or trailhead, for the map lens

  booking?: { required: boolean; note?: string; url?: string };
  guide?: { recommended: boolean; required?: boolean; note?: string };

  source: StopSource;             // { label, url, lastVerified } — SAME provenance discipline as stops
}

export interface EffortProfile {
  difficulty: 'easy' | 'moderate' | 'hard' | 'alpine';  // 4 plain words, not a 10-point scale
  distanceKm?: number;            // round trip from anchor
  ascentM?: number;
  durationHoursRange?: [number, number]; // a RANGE — sources genuinely disagree (Kebnekaise 9–15 h)
}

export type TimeCommitment = 'combines-with-day' | 'half-day' | 'full-day' | 'extra-day';

export type AdventureCategory =
  | 'summit'      // 🏔
  | 'day-hike'    // 🥾  walk-based detours (Tarfala, Kaitumjaure, Nuolja)
  | 'viewpoint'   // 🌄  Lapporten, Tjäktja pass, Aurora terrace
  | 'glacier'     // 🧊  glacier & geology
  | 'comfort'     // 🔥  sauna, dinner, café (at-the-hut rewards, no walking)
  | 'water'       // 🛶  boats & lakes (also the time-savers)
  | 'culture';    // 📖  Sami, history, research station, chapel
// (photography · wildlife · flora · night-sky · time-saver are TAGS, not categories — see §12)
```

### What we KEEP / CUT / DEFER from the brief's field list

The brief lists ~45 possible fields. Most fail the test "does this change a go/no-go decision, help
preparation, or work offline — without duplicating a Stop?"

- **KEEP** (decision & prep): title, category, anchor Stop, along-stages (ref), leavesTrail,
  timeCommitment, difficulty, distance, ascent, duration-range, summary, description, highlights,
  know-before-you-go, season, coord, booking, guide, source/lastVerified.
- **ADD** (missing from the brief, high value): **`leavesTrail`** and **`timeCommitment`** — the single
  most important thing a hiker needs is *"does this cost me a day, or fit into today's walk?"*
  And **`durationHoursRange`** as a tuple, because false precision would betray the app's `verified` ethos.
- **CUT — belongs to the Stop, not the Adventure** (anti-duplication, mirrors `importantAbsence`):
  water available, food available, restrooms, cell coverage, emergency exits, nearby facilities.
  The anchor Stop already carries these; the detail page links back ("From basecamp →").
- **CUT — false precision / maintenance cost for one trail**: technical difficulty, navigation
  difficulty, fitness required, weather-dependency as a *structured* field (fold the real ones into
  `knowBeforeYouGo` prose), decision points.
- **DEFER to V2 — user-owned state, not curated data**: `favourite`, `completed`/done, personal notes.
  These belong in `PersistentState` (like packing/journal), behind a schema bump — *not* on the curated
  `Adventure`. Keeping curated vs. user data separate is a load-bearing convention here.
- **DEFER to V2 — offline weight**: hero photo, gallery, GPX track, official-links list. Each is a real
  precache cost against the zero-CDN ethos; description prose covers the essentials first (§11).

---

## 9. Research catalogue (Abisko → Nikkaluokta)

Anchored to real Stop ids (`abisko`, `abiskojaure`, `alesjaure`, `tjaktja`, `salka`, `singi`,
`kebnekaise`, `nikkaluokta`) and forward-direction stages (`d1`–`d7`). Numbers are honest ranges;
**⚑ = verify before publishing** (see flags at the end).

| Adventure | Cat | Stop | Stage | Duration | Dist (rt) | Ascent | Difficulty | Extra day? | Combines? | Weather-dep | Priority | Why go |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Kebnekaise summit (Western)** | 🏔 | kebnekaise | d6/d7 | 9–15 h | ~18 km | ~1,700 m | Alpine | Yes | No | High | **P0** | Sweden's highest; glacier vs. rock summit climate story |
| **Tarfala valley & research station** | 🥾 | kebnekaise | d7 | 5–6 h | ~16 km | ~600 m | Hard | Usually | Rest-day | Med | **P0** | High-alpine glacier amphitheatre; world's longest glacier record |
| **Aurora Sky Station / Nuolja lift** | 🌄 | abisko | d1 | 2–4 h | lift | — | Easy | No | Yes (start) | Med | **P0** | Iconic viewpoint; aurora (autumn) / midnight-sun terrace |
| **Three-course dinner ("Elsa's kitchen")** | 🔥 | kebnekaise | d6 | 2 h | — | — | Easy | No | Yes | Low | **P0** | Reward meal; ~495 SEK; book ahead |
| **Alesjaure wood-fired sauna** | 🔥 | alesjaure | d3 | 1–2 h | — | — | Easy | No | Yes | Low | **P1** | Lake-view wood sauna; arrival ritual |
| **Alesjaure boat (Alisjávri)** | 🛶 | alesjaure | d3 | ~30 min | — | — | Easy | No | Yes | Med | **P1** | Saves ~6 km; summer only ⚑schedule |
| **Nikkaluokta boat (Ladtjojaure)** | 🛶 | nikkaluokta | d7 | ~20 min | — | — | Easy | No | Yes | Med | **P1** | Saves ~6 km on the last stage ⚑schedule |
| **Restaurant Enoks / Enok's kåta** | 📖 | nikkaluokta | d7 | 1 h | — | — | Easy | No | Yes | Low | **P1** | Sami food, cloudberry waffles, reindeer; living Sami history |
| **Tjäktja Pass viewpoint** | 🌄 | tjaktja | d3/d4 | +1 h | on-trail | — | Moderate | No | **Yes** | High | **P1** | Highest point of the section; signature view *(see §2 — arguably a stage-guide highlight, not Explore)* |
| **Nuolja / Njulla summit hike** | 🏔 | abisko | d1 | half-day ⚑ | ⚑ | ~1,169 m top | Moderate | No | Maybe | High | **P2** | Walk the viewpoint instead of the lift; waterfall loop |
| **Abisko canyon (Abiskojåkka)** | 🧊 | abisko | d1 | 30–60 m | short | — | Easy | No | **Yes** | Low | **P2** | Dramatic gorge at the trailhead |
| **Lapporten viewpoint** | 🌄 | abisko | d1 | — | view | — | Easy | No | Yes | Low | **P2** | Iconic U-valley silhouette; glacial-geology story |
| **Kaitumjaure detour (via Singi)** | 🥾 | singi | d5 | full-day+ | ~26 km rt | low | Moderate | Yes | No | Med | **P2** | Lakeside hut w/ sauna; suspension bridge; quiet alt. |
| **Sälka side-peaks (Sockertoppen)** | 🏔 | salka | d4/d5 | ~2–4 h | ⚑ | ⚑ | Moderate–hard | No | Rest | High | **P2** | Wild-strawberry viewpoint toward Sarek |
| **Kebnekaise sauna & shower** | 🔥 | kebnekaise | d6 | 1 h | — | — | Easy | No | Yes | Low | **P2** | Recovery before/after the summit |
| **Sälka sauna** | 🔥 | salka | d4 | 1 h | — | — | Easy | No | Yes | Low | **⚑ hold** | ⚑ Likely closed since 2022 fire — verify before listing |
| **Abiskojaure boat/sauna** | 🔥🛶 | abiskojaure | d1 | 1 h | — | — | Easy | No | Yes | Low | **P3** | Barrier-free hut; sauna; boat access ⚑ |
| **Björling glacier viewpoint / Durlingsdalen** | 🧊 | kebnekaise | d7 | ⚑ | ⚑ | ⚑ | ⚑ | ⚑ | ⚑ | High | **⚑ hold** | ⚑ Unconfirmed as marked day-hikes — verify or drop |

**Reliability flags (do not ship hard numbers until checked):** Sälka sauna (2022 fire); Björling/
Durlingsdalen/Kittelbäcken as named routes (unconfirmed); "Rávttasjávri" Sami village (unverified —
use Alisjávri/Leavas); Eastern-route guiding suspended 2026 (time-sensitive, recheck yearly); all boat
schedules; Kebnekaise–Tarfala distance (8 km one-way vs 16 km rt — reconcile); Kebnekaise Western stats
vary by source (present as ranges). Every row carries `source` + `lastVerified` like `stops.ts`.

---

## 10. Filters

The brief lists ~25 filter chips. That is information overload and a maintenance/QA burden. Filters must
map to **decisions**, not attributes. Three dimensions cover ~95% of "what can I actually do":

1. **Category** — the 7 icons (summit, day-hike, viewpoint, glacier, comfort, water, culture).
2. **Time** — *Combines with today · Half day · Full day · Needs a day.* The single most useful filter:
   it answers "does this fit my plan?" directly.
3. **Difficulty** — *Easy · Moderate · Hard · Alpine.*

Plus free-text **search** (matches title + tags, so "wildlife"/"photography"/"family" still find things
without being top-level chips), and automatic **"From this stop"** scoping when the index is opened
contextually. Everything else the brief listed (scenic, family-friendly, wildlife, historical…) becomes
a **tag**, surfaced through search — not a permanent chip.

---

## 11. Adventure detail page — decisions

Hierarchy (top to bottom): **title + category + anchor/leaves-trail → quick-facts strip → why it's
worth it → highlights → know-before-you-go → map link → basecamp link → source.** Rationale:

- **Quick-facts strip is the hero, not a photo.** The decision is *go/no-go*, and that's driven by
  difficulty/distance/ascent/duration/time-commitment — put them first, above the fold, as a scannable
  strip. A category color-band + icon carries visual identity.
- **No hero image in MVP.** Photos are a real offline-weight cost against the app's zero-CDN, precache-
  everything ethos (every image ships in the Workbox precache). Ship words first; add *small, precached,
  WebP* photos in V2 only if they earn their bytes.
- **Safety is a fixed section, not a footnote.** "Know before you go" (guide, crampons, booking, season)
  is always present for anything that leaves the trail — this is a mountain app.
- **"From basecamp →" instead of duplicating facilities.** Water/food/beds/cell live on the Stop; the
  detail links back. No duplication (the app's core discipline).
- **V2 additions**: personal note (reuse `TripNote`), done-toggle, gallery, GPX "show track," official
  links — all additive, none blocking the decision.

---

## 12. Naming

"Explore More" is two words doing one job and slightly overpromises for a sauna. Recommendation:

- **Surface / browse index:** **Explore** — a calm verb, invites without hype.
- **Contextual label on a Stop:** **Nearby** — "Nearby · 3" reads beautifully and honestly.
- **Data entity:** **Adventure** — neutral internal term spanning summit→sauna ("an optional thing you
  can do"). Users rarely see the word; they see the category icon + title.
- **Runner-up considered:** "Side Trips" (good, but mis-frames the at-hut sauna/dinner and the boats);
  "Detours" (undersells arrival rewards). "Nearby + Explore" wins on calm and accuracy.

---

## 13. Implementation roadmap

### MVP — validate the concept at zero nav cost
- `src/data/adventures.ts` + `Adventure`/`EffortProfile` types; ~12 **P0/P1** items only, each with
  `source`+`lastVerified`. Curated, read-only. No schema bump (no persisted state yet).
- **Nearby** disclosure group in `StopCard` (reuse the accordion + ARIA pattern) → **Adventure detail**
  (a disclosure or focused overlay, same visual language as the Stop cards).
- **Stages**: read-only "Nearby (N) →" chip on each stage-card that deep-links to the anchor Stop
  (one-shot payload). Zero duplication.
- Ship the two P0 anchors done well: **Kebnekaise summit** and **Tarfala** at Kebnekaise; **Aurora Sky
  Station** at Abisko. Prove the mental model before breadth.

### V2 — lenses & light personalisation (only if MVP validates)
- **Explore index**: filterable/searchable browse screen, reached from a **Today** card + **Stops**
  header action (still not a permanent tab). Filters per §10.
- **Map lens**: toggleable Adventure layer (off by default), category-colored pins reusing the marker/
  popup machinery.
- **User state**: `favourite` + `done` per adventure in `PersistentState` (schema bump + `normalizeState`
  migration + store mutators, exactly like packing); personal note via `TripNote`.
- Small precached WebP photos where they earn their weight.

### Long-term — scale beyond one trail
- Generalise `anchorStopId` so adventures attach to any trail's stops; introduce a `trailId` when a
  second route exists.
- GPX per adventure (reuse `generate-route-data.mjs`), CSV/JSON export of a personal "want to do" list
  (reuse `packingSpreadsheet`/`exportImport`).
- **Only now** consider promoting **Explore** to a real bottom-nav tab — when browsing across many
  trails is a frequent, primary job. Decide with usage data, and write an ADR.

---

## 14. Rigorous self-critique

Turning the design-review lens on this proposal:

1. **Two surfaces risk becoming "a second app."** Even without a tab, an Explore index + Map layer +
   per-Stop Nearby is three surfaces. *Risk: feature creep.* → **Revision:** cut the Explore index and
   Map lens from **MVP entirely.** MVP = Nearby-on-Stops only. That alone tests the whole hypothesis.
2. **The on-trail vs off-trail line may confuse users.** Tjäktja Pass is genuinely borderline.
   *Risk: UX confusion.* → **Revision:** keep Tjäktja Pass, Lapporten, Abisko canyon as **stage-guide
   prose**, not Explore items. If a hiker looks for them under Nearby and they're absent, that's the
   *correct* signal ("that's just part of the walk"). Explore = only things that cost a decision.
3. **Boats overlap the existing Transport sub-section (in Lists).** *Risk: inconsistency/duplication.*
   → **Revision:** the boats' *logistics* (schedule, price) stay in **Transport**; Explore shows them as
   an *experience* with a "See in Transport →" link. One fact, two framings, no copy.
4. **Category count (7) is still a lot to maintain and QA.** → **Revision:** ship MVP with **5**
   (summit, day-hike, viewpoint, comfort, water); fold glacier→viewpoint and culture→(description) until
   there's enough content to justify their own icon. Grow the taxonomy from data, not speculation.
5. **`lastVerified` on 15–30 items is a real maintenance tax**, and several facts are time-sensitive
   (Eastern-route guiding, boat schedules, Sälka sauna). *Risk: stale content erodes trust — the app's
   core value.* → **Revision:** MVP ships only ~10 items whose facts are stable; anything flagged ⚑ is
   held until verified. Better empty than wrong. Add a `verifyBy` date surfaced in Settings' data page.
6. **Offline weight.** Hero images would bloat the precache. → Already cut from MVP (§11).
7. **Scalability of Stop-anchoring for off-route adventures.** A few things (Kaitumjaure) live past a
   junction, not at a Stop. → `alongStageIds` + `alsoFromStopIds` handle the rare cases; the primary
   `anchorStopId` still holds. No new anchor type needed.
8. **Does it make Fjällkompis calmer?** The honest answer for a full Explore tab is *no*. For a quiet
   "Nearby" group that appears only when you open a Stop you've reached — *yes.*

---

## 15. Final recommendation (post-critique)

**Ship the smallest thing that proves the idea, and let data pull the rest.**

- **MVP = one dataset + "Nearby" on Stops.** `adventures.ts` (~10 stable, verified P0/P1 items), a
  **Nearby · N** disclosure in each StopCard, an Adventure detail whose hero is a **quick-facts strip**
  (no image), a fixed **safety** section, and a **"From basecamp →"** link instead of duplicated
  facilities. Stages get a read-only "Nearby (N) →" reference. **5 categories. No new tab. No Map layer.
  No user state. No photos.** On-trail highlights stay in the stage guides.
- **Anchor on Stops, always** — not merely because hikers think in places, but because Stop ids are the
  only anchor stable under the route-direction transform.
- **Earn each expansion.** Explore index and Map lens in V2 *only if* Nearby is used. Favourites/done in
  V2 via the packing-state pattern. A real Explore tab only at multi-trail scale, with an ADR.

This keeps the walk sacred, adds the second layer the trail deserves, and does it the way Fjällkompis
already does everything else: one curated source of truth, honest provenance, derived views, and
nothing on screen that a hiker at a hut doesn't need. If a proposed addition doesn't make the app feel
like a calmer, more trustworthy companion — it waits.
