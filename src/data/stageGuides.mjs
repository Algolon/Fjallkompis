/**
 * Editorial day-by-day trail guides for the seven stages — the "what does
 * this day feel like" layer that a GPX cannot know.
 *
 * Content rules:
 *  - GPX-derived statistics (distance, ascent/descent, elevation range,
 *    geometry) stay authoritative in src/route/routeData — guides never
 *    restate or override them with figures found online;
 *  - this is static route guidance, NOT live conditions: seasonal or
 *    operational facts (snow, boats, buses, facilities) are deliberately
 *    hedged ("typically", "can", "verify locally");
 *  - every guide cites its sources (GUIDE_SOURCES below) and carries the
 *    date the editorial facts were last verified against them.
 *
 * Plain .mjs (with a sibling .d.mts declaration) so node --test can validate
 * content integrity without a TypeScript toolchain (same pattern as
 * packingSeed.mjs); the app imports it through Vite exactly the same way.
 *
 * Update after re-verifying against the linked sources, then bump
 * lastVerified on the stages you checked.
 */

/** Editorial sources the guides draw on. Keys are referenced by sourceIds. */
export const GUIDE_SOURCES = {
  'stf-kungsleden': {
    label: 'STF — Kungsleden trail overview',
    url: 'https://www.swedishtouristassociation.com/trails/kungsleden/',
  },
  'stf-kungsleden-abisko': {
    label: 'STF — Signature Trail: Kungsleden from Abisko',
    url: 'https://www.swedishtouristassociation.com/trails/signature-trail-kungsleden-abisko/',
  },
  'stf-stage-abiskojaure-alesjaure': {
    label: 'STF — stage guide Abiskojaure–Alesjaure',
    url: 'https://www.swedishtouristassociation.com/guides/stages/stf-abiskojaure-stf-alesjaure/',
  },
  'stf-stage-tjaktja-salka': {
    label: 'STF — trail section Tjäktja–Sälka',
    url: 'https://www.swedishtouristassociation.com/trail-sections/tjaktja-salka/',
  },
  'stf-stage-salka-singi': {
    label: 'STF — stage guide Sälka–Singi',
    url: 'https://www.swedishtouristassociation.com/guides/stages/stf-salka-stf-singi/',
  },
  'stf-stage-singi-kebnekaise': {
    label: 'STF — trail section Singi–Kebnekaise',
    url: 'https://www.swedishtouristassociation.com/trail-sections/stf-singi-stf-kebnekaise/',
  },
  'stf-tjaktja': {
    label: 'STF — Tjäktja Mountain cabin',
    url: 'https://www.swedishtouristassociation.com/facilities/stf-tjaktja-mountain-cabin/',
  },
  'stf-salka': {
    label: 'STF — Sälka Mountain cabin',
    url: 'https://www.swedishtouristassociation.com/facilities/stf-salka-mountain-cabin/',
  },
  'stf-singi': {
    label: 'STF — Singi Mountain cabin',
    url: 'https://www.swedishtouristassociation.com/facilities/stf-singi-mountain-cabin/',
  },
  'stf-kebnekaise': {
    label: 'STF — Kebnekaise Mountain station',
    url: 'https://www.swedishtouristassociation.com/facilities/stf-kebnekaise-mountain-station/',
  },
  'naturkartan-bd21': {
    label: 'Naturkartan (Länsstyrelsen Norrbotten) — Abisko–Abiskojaure',
    url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd21-fran-abisko-till-abiskojaure',
  },
  'naturkartan-bd26': {
    label: 'Naturkartan (Länsstyrelsen Norrbotten) — Abiskojaure–Alesjaure',
    url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd26-mellan-abiskojaure-och-alesjaure_e',
  },
  'naturkartan-bd38': {
    label: 'Naturkartan (Länsstyrelsen Norrbotten) — Sälka–Singi',
    url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd38-mellan-salka-och-singi',
  },
  'naturkartan-bd40': {
    label: 'Naturkartan (Länsstyrelsen Norrbotten) — Singi–Kebnekaise',
    url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd40-mellan-singi-och-kebnekaise-fjallstation',
  },
  'wikipedia-tjaktjapasset': {
    label: 'Wikipedia — Tjäktjapasset',
    url: 'https://en.wikipedia.org/wiki/Tj%C3%A4ktjapasset',
  },
  'kiruna-lappland-nikkaluokta': {
    label: 'Kiruna Lappland — Nikkaluokta–Kebnekaise',
    url: 'https://kirunalapland.se/en/plan-your-trip/nikkaluokta-kebnekaise/',
  },
  'enoks-boat': {
    label: 'Enoks — Láddjujávri boat departures',
    url: 'https://www.enoks.se/en/boat-departures/',
  },
  'nikkaluokta-sarri-transport': {
    label: 'Nikkaluokta Sarri — mountain transport (summer)',
    url: 'https://nikkaluokta.com/en/mountain-transport/summer',
  },
};

/**
 * Guides keyed by stage id (d1–d7, matching src/data/stages.ts).
 * Shape per guide (see stageGuides.d.mts):
 *   overview     – 2–3 sentences: what the day is like;
 *   terrain      – compact underfoot/character description;
 *   highlights   – 2–4 genuinely useful landmarks or transitions;
 *   watchFor     – stage-specific planning considerations only (optional);
 *   sourceIds    – keys into GUIDE_SOURCES;
 *   lastVerified – ISO date the editorial facts were checked.
 */
export const STAGE_GUIDES = {
  d1: {
    overview:
      'A gentle opening day through Abisko National Park — sheltered, mostly ' +
      'wooded and easy to follow, but still a full mountain-trail day. The ' +
      'climbing is gradual, which gives legs and pack time to settle.',
    terrain:
      'Well-trodden path through mountain birch forest, partly rocky ' +
      'underfoot, with boardwalks across the wetter sections.',
    highlights: [
      'The rushing Abiskojåkka river and its canyon right at the start',
      'A limestone bluff a few kilometres in, with wide views over the river',
      'The forest slowly opening toward the fjäll ahead',
      'Lake Abiskojaure, with a sandy beach near the cabins',
    ],
    watchFor: [
      'Abisko is the last full-service stop — cabin shops further on are small, and Tjäktja and Singi have none',
      'This sheltered day is the exception: from tomorrow the route climbs above the treeline',
    ],
    sourceIds: ['stf-kungsleden-abisko', 'naturkartan-bd21'],
    lastVerified: '2026-07-11',
  },
  d2: {
    overview:
      'The longest day of the week, and the one that changes the landscape: ' +
      'a sustained climb lifts you out of the birch forest and above the ' +
      'treeline, and the rest of the day is open fjäll. Wind and weather ' +
      'reach you far more directly from here on.',
    terrain:
      'A steady climb out of the woods, then open, generally clear trail ' +
      'along lake Alisjávri and up the broad valley, with the bigger river ' +
      'crossings bridged.',
    highlights: [
      'Crossing the treeline — wooded national park gives way to open mountain terrain',
      'The suspension bridge over Šiellajohka',
      'Long views along lake Alisjávri',
      'Alesjaure cabins on their hill, overlooking lake and valley for miles',
    ],
    watchFor: [
      'A long, exposed day with few sheltered spots — check the forecast before committing',
      'In high season a small private boat can shorten the walk along Alisjávri; it is seasonal and never guaranteed, so don’t plan around it',
    ],
    sourceIds: [
      'stf-stage-abiskojaure-alesjaure',
      'naturkartan-bd26',
      'stf-kungsleden-abisko',
    ],
    lastVerified: '2026-07-11',
  },
  d3: {
    overview:
      'A shorter day up the broad high valley, trading greenery for ' +
      'progressively sparser, more austere fjäll. This is the transition ' +
      'into the route’s highest section — Tjäktja is the highest cabin on ' +
      'the Kungsleden, a short way below the pass.',
    terrain:
      'Mostly moderate gradients on open valley trail along the river, ' +
      'increasingly stony with height, and a steeper final pull up to the ' +
      'cabin on its bare slope.',
    highlights: [
      'The wide sweep of the upper valley, river braiding below the trail',
      'Vegetation thinning to hardy alpine ground as you gain height',
      'First close views of the barren country around Tjäktjapasset',
    ],
    watchFor: [
      'Tjäktja has no shop and no sauna — carry food from Alesjaure onward',
      'Open and weather-exposed; wind often strengthens toward the pass',
    ],
    sourceIds: ['stf-tjaktja', 'stf-kungsleden'],
    lastVerified: '2026-07-11',
  },
  d4: {
    overview:
      'Over Tjäktjapasset — at about 1,150 m the highest point of the entire ' +
      'Kungsleden. The day’s difficulty comes from exposure, conditions and ' +
      'the descent rather than distance: a barren high crossing, a steep ' +
      'stony drop into vast Tjäktjavagge, then easier valley walking to Sälka.',
    terrain:
      'Barren, rocky high-mountain ground over the pass; the south side ' +
      'begins with a steep, stony descent before the gradient eases into ' +
      'long, gently falling valley trail with streams and wet patches that ' +
      'vary with meltwater.',
    highlights: [
      'Tjäktjapasset itself — the route’s high point, with an unstaffed day shelter near the top',
      'The huge view south over Tjäktjavagge from the pass',
      'The valley unrolling ahead for tens of kilometres as you descend',
    ],
    watchFor: [
      'Snow patches often linger around the pass well into summer — depending on conditions you may cross old snowfields',
      'In poor visibility or hard wind this is the most serious point of the week; the pass shelter is for rest and emergencies, not accommodation',
      'Streams below the descent can run high with meltwater after warm days or rain',
    ],
    sourceIds: [
      'wikipedia-tjaktjapasset',
      'stf-stage-tjaktja-salka',
      'stf-salka',
    ],
    lastVerified: '2026-07-11',
  },
  d5: {
    overview:
      'A recovery-style day on gentler gradients down broad Tjäktjavagge, ' +
      'framed by steep mountainsides and glacier-bearing peaks. It ends at ' +
      'Singi, the junction where this route leaves the main Kungsleden — ' +
      'easier walking, but still open, exposed mountain terrain.',
    terrain:
      'Open valley trail, mostly gentle, with many streams crossed on wooden ' +
      'bridges; the path grows more winding and stony on the approach to Singi.',
    highlights: [
      'The broadest reaches of Tjäktjavagge, big-mountain views on both sides',
      'Suspension bridges over the Gaskkasjohka streams',
      'The Singi junction — the main Kungsleden continues south, this route turns east toward Kebnekaise',
    ],
    watchFor: [
      'Singi has no shop and no sauna — carry what you need from Sälka',
      'Wet sections vary with weather and meltwater, even on this easier day',
    ],
    sourceIds: ['stf-stage-salka-singi', 'naturkartan-bd38', 'stf-singi'],
    lastVerified: '2026-07-11',
  },
  d6: {
    overview:
      'At Singi the route leaves the official Kungsleden and turns east into ' +
      'narrower, more alpine country. Steep valley walls and the peaks of ' +
      'the Kebnekaise massif change the day’s character completely, and it ' +
      'ends at the large, full-service Kebnekaise Mountain Station.',
    terrain:
      'Undulating, sometimes stony trail through a narrow mountain valley ' +
      'that opens into Ladtjovagge (Láddjuvággi), with some climbing before ' +
      'the broader final approach.',
    highlights: [
      'Dramatic valley walls closing in beyond Singi',
      'Duolbagorni (Tolpagorni) with its crater-like hollow appearing to the north as the valley opens',
      'Peaks of the Kebnekaise massif — cloud permitting',
      'A staffed mountain station with restaurant, shop and showers after days of cabins',
    ],
    watchFor: [
      'From Singi you follow the connecting trail toward Nikkaluokta, no longer the official Kungsleden — the way remains clearly marked',
      'The station area is far busier than the cabins: Kebnekaise summit traffic joins here',
    ],
    sourceIds: [
      'stf-stage-singi-kebnekaise',
      'naturkartan-bd40',
      'stf-kebnekaise',
    ],
    lastVerified: '2026-07-11',
  },
  d7: {
    overview:
      'A long but mostly easy finish: out through Ladtjovagge on a well-used ' +
      'trail, gradually descending from open fjäll back into birch forest ' +
      'around lake Láddjujávri, to the road head at Nikkaluokta. It can feel ' +
      'straightforward, yet walking the whole way is still a substantial day.',
    terrain:
      'Broad, well-trodden and often busy trail, generally level or gently ' +
      'descending; the final kilometres run through easy birch woodland.',
    highlights: [
      'Looking back up the valley toward the Kebnekaise massif',
      'Lake Láddjujávri, with the lakeside restaurant at the boat landing (Enoks — famous for its reindeer burger)',
      'Birch forest returning after days at and above the treeline',
      'Nikkaluokta — trail’s end, with a seasonal bus link toward Kiruna',
    ],
    watchFor: [
      'A seasonal boat across Láddjujávri (run by Enoks, typically mid-June to mid-September) can cut roughly 6 km off the day — schedules, capacity and running status must be verified locally; never count on it',
      'The Nikkaluokta–Kiruna bus is seasonal too — check current timetables before the trip',
    ],
    sourceIds: [
      'kiruna-lappland-nikkaluokta',
      'enoks-boat',
      'nikkaluokta-sarri-transport',
    ],
    lastVerified: '2026-07-11',
  },
};

/**
 * Reverse-direction (Nikkaluokta → Abisko) overrides per STABLE physical
 * segment id. Only the DIRECTION-DEPENDENT fields are authored here —
 * `overview`, `highlights` (reordered/reoriented) and `watchFor` (resupply and
 * approach direction). The direction-neutral fields (`terrain`, `sourceIds`,
 * `lastVerified`) are inherited from the forward guide by {@link stageGuide},
 * so trail character and provenance stay single-sourced.
 *
 * This content is REORIENTED from the same verified facts as the forward
 * guides — it is not word-reversed prose, and it invents no new field
 * conditions. No independent reverse-direction field verification was done, so
 * the inherited `lastVerified` continues to mean "these underlying route facts
 * were checked on that date"; the direction wording derives from them. Claims
 * stay cautious and hedged (see docs/decisions/0003-route-direction.md).
 */
export const REVERSE_STAGE_GUIDES = {
  d1: {
    overview:
      'An easy final day back into Abisko National Park: from the lake at ' +
      'Abiskojaure the trail follows the Abiskojåkka down through sheltered ' +
      'birch forest to the Abisko trailhead. Gentle and well-graded, but ' +
      'still a full mountain-trail day out to the road and railway.',
    highlights: [
      'Lake Abiskojaure and its sandy beach by the cabins at the start',
      'The forest gradually closing in as you descend toward Abisko',
      'A limestone bluff with wide river views a few kilometres before Abisko',
      'The rushing Abiskojåkka river and its canyon near the end',
    ],
    watchFor: [
      'Abisko is a full-service stop again — apart from Kebnekaise station, the cabins behind you were small or had no shop',
      'This sheltered forest day is the gentle end of the route; the exposed high fjäll is now behind you',
    ],
  },
  d2: {
    overview:
      'A long day that hands the landscape back: from the open fjäll around ' +
      'Alesjaure the route runs down the broad valley and along lake ' +
      'Alisjávri, then drops through the treeline into the birch forest near ' +
      'Abiskojaure. The exposed miles come first; shelter returns lower down.',
    highlights: [
      'Alesjaure cabins on their hill, overlooking lake and valley, at the start',
      'Long views along lake Alisjávri',
      'The suspension bridge over Šiellajohka',
      'Dropping back below the treeline into sheltered birch forest',
    ],
    watchFor: [
      'A long, exposed day up high with few sheltered spots until the forest — check the forecast before committing',
      'In high season a small private boat can shorten the walk along Alisjávri; it is seasonal and never guaranteed, so don’t plan around it',
    ],
  },
  d3: {
    overview:
      'A shorter day down the broad high valley from Tjäktja — the highest ' +
      'cabin on the Kungsleden, just below the pass — losing height toward ' +
      'greener ground around Alesjaure. Austere fjäll gradually gives way to ' +
      'lower, less sparse country.',
    highlights: [
      'The barren country around Tjäktjapasset close behind you at the start',
      'The wide sweep of the upper valley, river braiding below the trail',
      'Vegetation slowly returning as you lose height toward Alesjaure',
    ],
    watchFor: [
      'Open and weather-exposed up high; wind is often strongest near the pass behind you',
      'Alesjaure ahead has a shop and sauna — the first resupply since Sälka',
    ],
  },
  d4: {
    overview:
      'Up to Tjäktjapasset — at about 1,150 m the highest point of the entire ' +
      'Kungsleden — approached from the south. Long, gently rising valley ' +
      'walking up Tjäktjavagge leads to a steep, stony climb to the pass, ' +
      'with Tjäktja cabin a short way down the far side. The difficulty is ' +
      'exposure, conditions and the climb rather than distance.',
    highlights: [
      'Tjäktjavagge opening out behind you as you gain height',
      'The steep, stony pull to Tjäktjapasset — the route’s high point, with an unstaffed day shelter near the top',
      'Wide views back down the valley from the pass',
    ],
    watchFor: [
      'Snow patches often linger around the pass well into summer — depending on conditions you may cross old snowfields on the climb',
      'In poor visibility or hard wind this is the most serious point of the week; the pass shelter is for rest and emergencies, not accommodation',
      'Valley streams can run high with meltwater after warm days or rain',
      'Tjäktja has no shop or sauna — carry food from Sälka',
    ],
  },
  d5: {
    overview:
      'A gentle valley day up Tjäktjavagge, framed by steep mountainsides and ' +
      'glacier-bearing peaks. It begins at Singi — where this route meets the ' +
      'main Kungsleden — and follows easy gradients to the well-equipped ' +
      'cabin at Sälka.',
    highlights: [
      'The Singi junction — the main Kungsleden runs south from here, and this route comes in from Kebnekaise',
      'Suspension bridges over the Gaskkasjohka streams',
      'The broad reaches of Tjäktjavagge, big-mountain views on both sides toward Sälka',
    ],
    watchFor: [
      'Singi has no shop or sauna — Sälka ahead is the next resupply',
      'Wet sections vary with weather and meltwater, even on this easier day',
    ],
  },
  d6: {
    overview:
      'Leaving the large Kebnekaise Mountain Station, the day heads up ' +
      'Ladtjovagge and back into narrow, alpine country to Singi, where it ' +
      'rejoins the official Kungsleden. Steep valley walls and the peaks of ' +
      'the Kebnekaise massif frame the start.',
    highlights: [
      'Kebnekaise Mountain Station and the massif’s peaks — cloud permitting — at the start',
      'Duolbagorni (Tolpagorni) with its crater-like hollow to the north as you head up the valley',
      'Narrowing, dramatic valley walls on the approach to Singi',
      'Singi, where the connecting trail rejoins the official Kungsleden',
    ],
    watchFor: [
      'As far as Singi you follow the connecting trail from Kebnekaise, not the official Kungsleden — the way remains clearly marked',
      'The station area is far busier than the cabins ahead: Kebnekaise summit traffic gathers here',
      'Singi has no shop or sauna — carry what you need from Kebnekaise',
    ],
  },
  d7: {
    overview:
      'The way in from the road head at Nikkaluokta: a long but mostly easy ' +
      'first day on a well-used trail, rising gently from birch forest around ' +
      'lake Láddjujávri onto open fjäll and up Ladtjovagge to Kebnekaise ' +
      'Mountain Station. Straightforward underfoot, yet a substantial day if ' +
      'walked in full.',
    highlights: [
      'Nikkaluokta trailhead, with a seasonal bus link from Kiruna, at the start',
      'Lake Láddjujávri, with the lakeside restaurant at the boat landing (Enoks — famous for its reindeer burger)',
      'Birch forest giving way to open fjäll as you gain height',
      'The Kebnekaise massif rising ahead up the valley',
    ],
    watchFor: [
      'A seasonal boat across Láddjujávri (run by Enoks, typically mid-June to mid-September) can cut roughly 6 km off the day — schedules, capacity and running status must be verified locally; never count on it',
      'The Kiruna–Nikkaluokta bus is seasonal too — check current timetables before the trip',
    ],
  },
};

/**
 * The resolved day guide for a stage in the given direction. Forward returns
 * the canonical guide unchanged; reverse merges the direction-neutral fields
 * (terrain, sources, verification date) with the reverse overrides above.
 * Unknown stage ids return undefined.
 */
export function stageGuide(stageId, direction) {
  const base = STAGE_GUIDES[stageId];
  if (!base) return undefined;
  if (direction !== 'nikkaluokta-to-abisko') return base;
  const overrides = REVERSE_STAGE_GUIDES[stageId];
  return overrides ? { ...base, ...overrides } : base;
}
