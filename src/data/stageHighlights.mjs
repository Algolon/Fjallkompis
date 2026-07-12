/**
 * Stage-highlight metadata for the Today stage block — the "what kind of day
 * is this" chips (owner-approved direction:
 * docs/design-reviews/2026-07-v0.18-today-stage-block-direction.md).
 *
 * Model rules:
 *  - STRUCTURED, STATIC metadata: highlights are hand-assigned per stage from
 *    the verified editorial guides (src/data/stageGuides.mjs) — never parsed
 *    out of prose, never dependent on GPS, live tracking, time of day or
 *    network state;
 *  - each highlight TYPE has one canonical concise label (one line, ≤ 17
 *    characters — pinned by tests; measured at the 320px viewport, longer
 *    labels force one-chip-per-row wrapping), an icon key resolved to a
 *    lucide icon in the UI layer, and a unique priority. Labels stay short
 *    on purpose: the full nuance lives in the day guide, one tap away;
 *  - a stage lists type ids only; stageHighlights() returns them sorted by
 *    priority and capped at MAX_STAGE_HIGHLIGHTS (4). Four is a ceiling, not
 *    a target — stages carry only genuinely need-to-know characteristics,
 *    and may carry MORE than four ids, in which case the priority order
 *    decides what is shown;
 *  - the taxonomy deliberately EXCLUDES anything another Today element or
 *    screen already owns: numeric statistics (hero stats row), destination
 *    facilities and shop warnings (Tonight's stop card / Stops), weather,
 *    elevation detail and live progress (authoritative screens). This is the
 *    block's anti-growth guardrail in data form.
 *
 * PRIORITY ORDER (lower number = shown first, survives the cap):
 *  safety and exposure first (1–2), then defining terrain difficulty (3–6),
 *  then route character/orientation (7–9), then footing comfort (10), then
 *  opportunities and ambience (11–13). Rationale: when only four chips fit,
 *  the ones a hiker must not miss are the ones that change how they prepare
 *  and behave, not the pleasant ones.
 *
 * Reusable for future trail datasets: nothing in the taxonomy or selector is
 * Kungsleden-specific except the STAGE_HIGHLIGHT_IDS assignments (and the
 * 'kungsleden-junction' type's label, which names the trail on purpose).
 *
 * Plain .mjs (with a sibling .d.mts declaration) so node --test can validate
 * the model without a TypeScript toolchain — the same pattern as
 * stageGuides.mjs; the app imports it through Vite exactly the same way.
 */

/**
 * The highlight taxonomy. Icon keys map to lucide-react icons in
 * src/screens/TodayScreen.tsx (HIGHLIGHT_ICONS — the mapping is fenced by
 * tests/stage-highlights.test.mjs so a new type cannot ship without its
 * icon). Priorities are unique so selection stays deterministic.
 */
export const HIGHLIGHT_TYPES = {
  exposed: { label: 'Exposed', icon: 'wind', priority: 1 },
  'snow-patches': { label: 'Snow patches', icon: 'snowflake', priority: 2 },
  'route-high-point': { label: 'High point', icon: 'mountain-snow', priority: 3 },
  'steep-descent': { label: 'Steep descent', icon: 'trending-down', priority: 4 },
  'sustained-climb': { label: 'Long climb', icon: 'trending-up', priority: 5 },
  'rocky-terrain': { label: 'Rocky trail', icon: 'mountain', priority: 6 },
  'treeline-crossing': { label: 'Above treeline', icon: 'trees', priority: 7 },
  'kungsleden-junction': { label: 'Leaves Kungsleden', icon: 'signpost', priority: 8 },
  'bridge-crossings': { label: 'Bridges', icon: 'waves', priority: 9 },
  'wet-ground': { label: 'Wet sections', icon: 'droplets', priority: 10 },
  'boat-option': { label: 'Boat possible', icon: 'sailboat', priority: 11 },
  'busy-trail': { label: 'Busy trail', icon: 'users', priority: 12 },
  forest: { label: 'Sheltered forest', icon: 'tree-pine', priority: 13 },
};

/** Display ceiling — four is a maximum, never a target to fill. */
export const MAX_STAGE_HIGHLIGHTS = 4;

/**
 * Need-to-know characteristics per stage (ids into HIGHLIGHT_TYPES; stage
 * ids d1–d7 match src/data/stages.ts). Every assignment traces to a fact in
 * the stage's verified day guide (src/data/stageGuides.mjs) — the per-stage
 * notes below record WHY each highlight earned its place. Counts vary on
 * purpose (2–5): easy days honestly show fewer, and d2 carries five so the
 * priority cap is exercised in production data, not just in tests.
 */
export const STAGE_HIGHLIGHT_IDS = {
  // d1 Abisko → Abiskojaure: the sheltered exception of the week (guide:
  // birch-forest day, "partly rocky underfoot", boardwalks over the wetter
  // sections). No exposure/climb chips — flagging them here would dilute
  // their meaning on the days that earn them.
  d1: ['forest', 'rocky-terrain', 'wet-ground'],
  // d2 Abiskojaure → Alesjaure: the week's character change. Guide: sustained
  // climb above the treeline, long exposed day with few sheltered spots,
  // Šiellajohka suspension bridge, seasonal (never guaranteed) Alisjávri
  // boat. Five apply — the cap drops the lowest priority (boat-option,
  // the explicitly don't-plan-around-it item).
  d2: ['exposed', 'sustained-climb', 'treeline-crossing', 'bridge-crossings', 'boat-option'],
  // d3 Alesjaure → Tjäktja: open, weather-exposed high valley ("wind often
  // strengthens toward the pass"), a climbing day to the trail's highest
  // cabin with a steeper final pull, increasingly stony with height.
  // (Tjäktja's missing shop is Tonight-card/Stops territory, not a chip.)
  d3: ['exposed', 'sustained-climb', 'rocky-terrain'],
  // d4 Tjäktja → Sälka: the serious day — the only stage that earns all
  // four. Guide: Tjäktjapasset is the route high point (~1,150 m), snow
  // patches often linger into summer, the south side starts with a steep
  // stony descent, and in poor weather this is the most serious point of
  // the week.
  d4: ['exposed', 'snow-patches', 'route-high-point', 'steep-descent'],
  // d5 Sälka → Singi: the recovery day — honestly just two. Guide: many
  // streams crossed on wooden/suspension bridges, wet sections varying
  // with meltwater. Inventing a third would be filler.
  d5: ['bridge-crossings', 'wet-ground'],
  // d6 Singi → Kebnekaise: route-finding fact of the week (leaves the
  // official Kungsleden at Singi), undulating stony trail in a narrow
  // alpine valley, and summit traffic makes the trail markedly busier
  // near the station.
  d6: ['kungsleden-junction', 'rocky-terrain', 'busy-trail'],
  // d7 Kebnekaise → Nikkaluokta: the Láddjujávri boat can cut ~6 km
  // (seasonal, verify locally), the trail is broad and busy, and birch
  // forest returns for the sheltered finish.
  d7: ['boat-option', 'busy-trail', 'forest'],
};

/**
 * The highlights to display for a stage: resolved, priority-sorted, capped.
 * Unknown stage ids return [] — the UI renders no chip row at all (no empty
 * placeholder). Deterministic: same input, same output, no clock/location.
 */
export function stageHighlights(stageId, max = MAX_STAGE_HIGHLIGHTS) {
  const ids = STAGE_HIGHLIGHT_IDS[stageId] ?? [];
  return ids
    .map((id) => ({ id, ...HIGHLIGHT_TYPES[id] }))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, max);
}
