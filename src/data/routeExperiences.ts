import type { ExperienceType, PlanningFit, RouteExperience } from '../types';
import { STAGES_BY_ID } from './stages';
import { STOPS_BY_ID } from './stops';
import { experienceRefErrors, selectForStage } from './experienceModel.mjs';

// Selection, sorting, grouping and validation live in the tested pure module
// experienceModel.mjs; this file owns only the curated data and its labels.
export {
  EXPERIENCE_GROUP_LABEL,
  EXPERIENCE_GROUP_ORDER,
  experienceGroup,
  groupForDisplay,
  hasExperiences,
  isInlineExperience,
} from './experienceModel.mjs';
export type { ExperienceGroupKey } from './experienceModel.mjs';

/**
 * Curated "Along the way" experiences — the experiential route content surfaced
 * per stage on the Stages screen (see docs/proposals/explore-more.md). A
 * manually verified, static snapshot: the app never scrapes anyone at runtime,
 * and none of this is user-editable. Re-verify and update here.
 *
 * Scope discipline:
 *  - EXPERIENTIAL only — things to see / notice / visit / detour to. Facilities
 *    (meals, café, sauna, shop, showers, accommodation, transport/boats) are NOT
 *    experiences; they live on Stops / Lists and must never appear here.
 *  - Anchored to STABLE segment ids (`segmentIds`, d1..d7). A basecamp trip
 *    (Kebnekaise summit, Tarfala) lists BOTH adjacent stages so it appears under
 *    "Larger options" whether the hiker is arriving or leaving.
 *  - Only confidence high (plus a few clearly-marked medium where a scale would
 *    otherwise be unrepresented). Low-confidence / unverified items wait — e.g.
 *    the "Rihdonjira" waterfall name and the Kaitumjaure suspension bridge (which
 *    is on the SOUTHERN spur, off this route) are deliberately absent.
 *  - Diffuse "the walk is pretty" is route character → the Day Guide, not here.
 *    So d3 carries nothing and d5 carries one — uneven coverage is honest.
 */

export const EXPERIENCES_VERIFIED_ON = '2026-07-12';

/** WHAT-it-is → display label. Icon mapping lives in the component (React). */
export const EXPERIENCE_TYPE_LABEL: Record<ExperienceType, string> = {
  viewpoint: 'Viewpoint',
  water: 'Water',
  landform: 'Landform',
  nature: 'Nature',
  culture: 'Culture',
};

/** Human planning-fit → short headline label. */
export const PLANNING_FIT_LABEL: Record<PlanningFit, string> = {
  'directly-on-route': 'Directly on route',
  'adds-under-30': 'Adds < 30 min',
  'adds-1-2h': 'Adds 1–2 h',
  'shorter-hiking-day': 'Needs a shorter day',
  'best-from-overnight': 'Best from an overnight stop',
  'extra-day-recommended': 'Extra day recommended',
  'separate-day-required': 'Separate day required',
};

/** A planning-fit that involves a real time cost gets the glacier (planning) tint. */
export function isPlanningCost(fit: PlanningFit): boolean {
  return fit !== 'directly-on-route';
}

const CURATED: RouteExperience[] = [
  // ── d1 · Abisko → Abiskojaure ─────────────────────────────────────────────
  {
    id: 'lapporten-sightline',
    title: 'Lapporten sightline',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d1'],
    nearestStopId: 'abisko',
    summary: 'The emblematic U-shaped valley on the skyline.',
    whyNotice:
      'Sweden’s most-photographed mountain gap — a textbook glacial U-valley (Čuonjávággi) framing the horizon as you start out. Best light in the evening.',
    source: {
      label: 'Wikipedia — Lapporten',
      url: 'https://en.wikipedia.org/wiki/Lapporten',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'abiskojakka-canyon',
    title: 'Abiskojåkka canyon',
    type: 'water',
    scale: 'mini-detour',
    difficulty: 'easy',
    planningFit: 'adds-under-30',
    segmentIds: ['d1'],
    nearestStopId: 'abisko',
    routeRelationship: 'A short detour at the Abisko trailhead',
    addedTimeText: '+20 min',
    summary: 'A turquoise glacial river in a blasted gorge at the trailhead.',
    whyNotice:
      'The Abiskojåkka has cut a sharp canyon toward Lake Torneträsk; in 1899 the railway builders blasted a tunnel to carry the river rather than bridge it.',
    description:
      'Right by Abisko Turiststation, a short, easy walk follows the Abiskojåkka canyon — dramatic water-in-rock and a piece of railway history. A backward/side detour before you head south, easily combined with the start.',
    weatherSensitivity: 'low',
    source: {
      label: 'STF — Abisko Turiststation',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-abisko-turiststation/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'abisko-birch-birdlife',
    title: 'Mountain-birch forest & birdlife',
    type: 'nature',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d1'],
    nearestStopId: 'abisko',
    summary: 'Sub-arctic birch woodland — the trail’s green opening.',
    whyNotice:
      'The first day threads classic fjäll birch forest — prime birding for bluethroat, redwing and brambling before the treeline gives way to open tundra.',
    source: {
      label: 'STF — Signature Trail: Kungsleden from Abisko',
      url: 'https://www.swedishtouristassociation.com/trails/signature-trail-kungsleden-abisko/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },

  // ── d2 · Abiskojaure → Alesjaure ──────────────────────────────────────────
  {
    id: 'treeline-transition',
    title: 'Crossing the treeline',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d2'],
    nearestStopId: 'alesjaure',
    summary: 'The moment the birch ends and the open fjäll begins.',
    whyNotice:
      'A sustained climb lifts you out of the woods onto open mountain heath — the day the landscape changes character. Look back over the forest you’ve left.',
    source: {
      label: 'STF — stage guide Abiskojaure–Alesjaure',
      url: 'https://www.swedishtouristassociation.com/guides/stages/stf-abiskojaure-stf-alesjaure/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'alesjaure-delta-panorama',
    title: 'Alesjaure delta panorama',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d2'],
    nearestStopId: 'alesjaure',
    summary: 'A braided glacial delta ringed by peaks.',
    whyNotice:
      'The arrival reward: a large glacier-fed lake with a delta-like inflow, mountains all round — one of the route’s signature panoramas, especially from the hut rise.',
    source: {
      label: 'Naturkartan — Abiskojaure–Alesjaure',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd26-mellan-abiskojaure-och-alesjaure_e',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'laevas-sami-fence',
    title: 'Laevas Sámi settlement & reindeer fence',
    type: 'culture',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d2'],
    nearestStopId: 'alesjaure',
    summary: 'A living reindeer-herding cultural landscape.',
    whyNotice:
      'Near Alesjaure you pass the Laevas summer settlement and a reindeer fence marking the Gabna/Laevas community boundary — the strongest Sámi-culture node on the northern half. Northern Sámi place names run throughout.',
    source: {
      label: 'STF — Signature Trail: Kungsleden from Abisko',
      url: 'https://www.swedishtouristassociation.com/trails/signature-trail-kungsleden-abisko/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },

  // ── d3 · Alesjaure → Tjäktja ── deliberately EMPTY (route character → Day Guide)

  // ── d4 · Tjäktja → Sälka (the richest stage) ──────────────────────────────
  {
    id: 'tjaktja-pass-view',
    title: 'Tjäktja Pass viewpoint',
    type: 'viewpoint',
    scale: 'on-route',
    difficulty: 'moderate',
    planningFit: 'directly-on-route',
    segmentIds: ['d4'],
    nearestStopId: 'tjaktja',
    summary: 'The highest point of the Kungsleden — a 30 km valley opens south.',
    whyNotice:
      'At about 1,150 m this is the highest point of the whole Kungsleden. From the top a vast glacial valley (Tjäktjavagge) unrolls south — the grandest single panorama of the week. An unstaffed wind-shelter sits near the top; expect fierce wind, and possibly old snow into summer.',
    source: {
      label: 'Wikipedia — Tjäktjapasset',
      url: 'https://en.wikipedia.org/wiki/Tj%C3%A4ktjapasset',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'tjaktja-moraine',
    title: 'Glacial moraine & valley junction',
    type: 'landform',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d4'],
    nearestStopId: 'tjaktja',
    summary: 'Textbook glacial geomorphology near the pass.',
    whyNotice:
      'Moraine mounds gather where several valleys meet below the pass — U-valley, moraine and hanging side-valleys, all legible in one view.',
    source: {
      label: 'STF — trail section Tjäktja–Sälka',
      url: 'https://www.swedishtouristassociation.com/trail-sections/tjaktja-salka/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'tjaktjavagge-descent',
    title: 'Descent into Tjäktjavagge',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d4'],
    nearestStopId: 'salka',
    summary: 'Widely called the route’s prettiest reveal.',
    whyNotice:
      'Below the pass the valley opens into green grasslands, braided sparkling rivers and veiled arctic peaks — reindeer are often seen here.',
    source: {
      label: 'STF — trail section Tjäktja–Sälka',
      url: 'https://www.swedishtouristassociation.com/trail-sections/tjaktja-salka/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'salka-bathing-stream',
    title: 'Sälka bathing stream',
    type: 'water',
    scale: 'mini-detour',
    difficulty: 'easy',
    planningFit: 'adds-under-30',
    segmentIds: ['d4'],
    nearestStopId: 'salka',
    routeRelationship: 'By Sälka cabin',
    addedTimeText: '+15 min',
    summary: 'A cold dip and reindeer-watching by the cabin.',
    whyNotice:
      'The stream by Sälka is a recognised spot for a bracing plunge (glacial-cold — seconds, not a swim) with reindeer often grazing nearby.',
    weatherSensitivity: 'medium',
    source: {
      label: 'STF — Sälka Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-salka-mountain-cabin/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'medium',
  },
  {
    id: 'sockertoppen',
    title: 'Sockertoppen side-summit',
    type: 'landform',
    scale: 'short-excursion',
    difficulty: 'hard',
    planningFit: 'shorter-hiking-day',
    segmentIds: ['d4'],
    nearestStopId: 'salka',
    routeRelationship: 'From Sälka — a shorter main stage or a rest day',
    addedTimeText: '2–3 h',
    roundTripKm: 6,
    summary: 'A named side-summit scramble with Sarek views.',
    whyNotice:
      'Sälka is a base for peak-bagging; “Sugar Top” is the named nearby summit — a scramble rewarded with wild-strawberry slopes and long views toward Sarek.',
    description:
      'A steepish 2–3 h round trip from near Sälka. Not a casual stroll — expect rough ground and route-finding. Best in clear, settled weather; leave a margin for the main stage.',
    weatherSensitivity: 'high',
    source: {
      label: 'STF — Sälka Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-salka-mountain-cabin/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'medium',
  },
  {
    id: 'nallo-side-valley',
    title: 'Nallo side-valley',
    type: 'landform',
    scale: 'half-full-day',
    difficulty: 'moderate',
    planningFit: 'best-from-overnight',
    segmentIds: ['d4'],
    nearestStopId: 'salka',
    routeRelationship: 'A branch from near Sälka — best from an overnight stop',
    addedTimeText: 'Half day+',
    summary: 'A dramatic side valley and loop alternative.',
    whyNotice:
      'From near Sälka a well-known route branches up a dramatic side valley toward Nallo — a worthwhile detour or loop for hikers with a spare half-day or an extra night.',
    description:
      'Best tackled from an overnight rather than squeezed into a stage. Confirm the exact junction on a current map before committing — sources vary.',
    weatherSensitivity: 'medium',
    source: {
      label: 'STF — trail section Tjäktja–Sälka',
      url: 'https://www.swedishtouristassociation.com/trail-sections/tjaktja-salka/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'medium',
  },

  // ── d5 · Sälka → Singi (sparse) ───────────────────────────────────────────
  {
    id: 'singi-glacier-panorama',
    title: 'Glacier & peak-wall panorama',
    type: 'landform',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d5'],
    nearestStopId: 'singi',
    summary: 'Broad glacier and precipice views along the valley floor.',
    whyNotice:
      'Down broad Tjäktjavagge the trail is framed by steep mountain walls and glacier-bearing peaks — big-mountain scenery on easy ground.',
    source: {
      label: 'Naturkartan — Sälka–Singi',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd38-mellan-salka-och-singi',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },

  // ── d6 · Singi → Kebnekaise Fjällstation ──────────────────────────────────
  {
    id: 'ladtjovagge-reveal',
    title: 'Turn into Ladtjovagge — the massif reveal',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d6'],
    nearestStopId: 'kebnekaise',
    summary: 'The register shifts to high-alpine as the massif appears.',
    whyNotice:
      'Leaving the wide Tjäktjavagge, the route swings east into dramatic Ladtjovagge and Sweden’s highest range comes into view — steep walls and glaciers, a change from pastoral valley to high-alpine.',
    source: {
      label: 'Naturkartan — Singi–Kebnekaise',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd40-mellan-singi-och-kebnekaise-fjallstation',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },

  // ── d7 · Kebnekaise → Nikkaluokta ─────────────────────────────────────────
  {
    id: 'darfaljohka-bridge',
    title: 'Darfáljohka suspension bridge',
    type: 'water',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d7'],
    nearestStopId: 'kebnekaise',
    summary: 'The route’s signature bridge, over a canyon.',
    whyNotice:
      'About 1 km from the station a suspension bridge spans the Darfáljohka canyon — the route’s signature crossing and a strong photo stop in any weather.',
    source: {
      label: 'Naturkartan — Kebnekaise–Nikkaluokta',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd41-mellan-kebnekaise-fjallstation-och-nikkaluokta',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'ladtjojaure-lakeshore',
    title: 'Ladtjojaure lakeshore',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d7'],
    nearestStopId: 'nikkaluokta',
    summary: 'The long lake that dominates the finish.',
    whyNotice:
      'Láddjujávri fills the second half of the last day — birch, water and open views to the road head. (A seasonal boat can shorten the walk — that’s logistics, see Lists → Transport, not an experience.)',
    source: {
      label: 'Kiruna Lappland — Nikkaluokta–Kebnekaise',
      url: 'https://kirunalapland.se/en/plan-your-trip/nikkaluokta-kebnekaise/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },

  // ── Major adventures · Kebnekaise basecamp (segments d6 + d7, "extra day") ──
  {
    id: 'kebnekaise-summit-western',
    title: 'Kebnekaise South Summit',
    shortTitle: 'Kebnekaise summit',
    type: 'landform',
    scale: 'major-adventure',
    difficulty: 'alpine',
    planningFit: 'separate-day-required',
    segmentIds: ['d6', 'd7'],
    nearestStopId: 'kebnekaise',
    routeRelationship: 'Western route · extra day from Kebnekaise Fjällstation',
    roundTripKm: 18,
    elevationGainM: 1700,
    weatherSensitivity: 'high',
    summary: 'Sweden’s highest peak — a full alpine day from the station.',
    whyNotice:
      'The Western route (Västra leden) is the standard ascent of Sweden’s highest mountain. The glaciated south peak has thinned below the ice-free north peak — the summit you climb is now the lower of the two, a measured climate story you stand on top of.',
    description:
      'Marked from the station, it crosses high boulder ground via Kitteldalen and Kaffedalen and finishes over a glacier to the summit. A very long day; conditions and daylight decide feasibility as much as fitness.',
    expedition: {
      extraDayRequired: true,
      guide: {
        recommended: true,
        note: 'STF runs guided ascents with harness, helmet and crampons.',
      },
      equipment: ['Crampons', 'Harness & helmet (guided)', 'Full weather layers'],
      turnaroundAdvice:
        'Agree a hard turnaround time before starting — the descent is long and weather closes fast.',
      season: 'Best July–August',
      warnings: [
        'The final section crosses glacier ice — crampons required; a guide is strongly recommended.',
        'The Eastern route is harder still; guided Eastern tours are suspended for 2026.',
      ],
    },
    source: {
      label: 'STF — Climbing Kebnekaise',
      url: 'https://www.swedishtouristassociation.com/guides/climbing-kebnekaise/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'tarfala-valley',
    title: 'Tarfala Valley & research station',
    shortTitle: 'Tarfala Valley',
    type: 'landform',
    scale: 'half-full-day',
    difficulty: 'hard',
    planningFit: 'extra-day-recommended',
    segmentIds: ['d6', 'd7'],
    nearestStopId: 'kebnekaise',
    routeRelationship: 'A full day from Kebnekaise Fjällstation',
    roundTripKm: 16,
    elevationGainM: 600,
    weatherSensitivity: 'high',
    summary: 'A high-alpine glacier cirque and glaciology research station.',
    whyNotice:
      'A marked trail climbs into a rock-and-ice amphitheatre ringed by glaciers (Storglaciären, Isfallsglaciären). Storglaciären holds the world’s longest continuous glacier mass-balance record — a superb “active rest day” alternative to a summit.',
    description:
      'Roughly 16 km round trip with ~600 m of climbing through birch, over suspension bridges and stone fields — some airy, slippery snow patches. High-alpine terrain; carry food and layers and check the weather.',
    season: { fromMonth: 7, toMonth: 9 },
    source: {
      label: 'STF — Glacier research at Tarfala',
      url: 'https://www.swedishtouristassociation.com/activities/kebnekaise-glacier-research-at-tarfala/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
];

/**
 * Validated experience list. Fails fast at import if an entry references an
 * unknown segment or stop id — cheap guard against typos, mirroring how stops.ts
 * relies on the waypoint map to catch a bad id. The check itself lives in the
 * tested pure module (experienceRefErrors).
 */
const KNOWN_STAGE_IDS = new Set(Object.keys(STAGES_BY_ID));
const KNOWN_STOP_IDS = new Set(Object.keys(STOPS_BY_ID));

export const ROUTE_EXPERIENCES: RouteExperience[] = CURATED.map((x) => {
  const errors = experienceRefErrors(x, KNOWN_STAGE_IDS, KNOWN_STOP_IDS);
  if (errors.length > 0) {
    throw new Error(`Invalid RouteExperience: ${errors.join('; ')}`);
  }
  return x;
});

export const ROUTE_EXPERIENCES_BY_ID: Record<string, RouteExperience> =
  Object.fromEntries(ROUTE_EXPERIENCES.map((x) => [x.id, x]));

/**
 * Experiences along a given stage, by STABLE segment id (d1..d7), commitment-
 * ordered. Direction-agnostic (segment ids are stable). Selection/sorting lives
 * in experienceModel.mjs; this binds it to the curated data.
 */
export function experiencesForStage(stageId: string): RouteExperience[] {
  return selectForStage(ROUTE_EXPERIENCES, stageId);
}
