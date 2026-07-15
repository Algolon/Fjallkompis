import type {
  ExperienceAccess,
  ExperienceType,
  RouteDirection,
  RouteExperience,
} from '../types';
import { STAGES_BY_ID } from './stages';
import { STOPS_BY_ID } from './stops';
import { EXPERIENCE_ROUTES } from './experienceRoutes';
import {
  experienceRefErrors,
  gpxRefErrors,
  highlightsAndDetoursForStage,
} from './experienceModel.mjs';

// Selection, ordering, Highlight/Detour classification, provenance and
// validation all live in the tested pure module experienceModel.mjs; this file
// owns only the curated data and its display labels.
export {
  canViewOnMap,
  experienceKind,
  hasExperiences,
  isBasecamp,
  isDetour,
  isHighlight,
  isRouteWide,
  journeyPositionLabel,
  mapDisplayKind,
  provenanceLevel,
} from './experienceModel.mjs';
export type {
  ExperienceKind,
  MapDisplayKind,
  ProvenanceLevel,
  StageHighlightsDetours,
} from './experienceModel.mjs';

/**
 * Curated experience records — experiential route content surfaced per stage on
 * the Stages screen as Highlights & detours (see
 * docs/proposals/highlights-and-detours.md). A manually verified static
 * snapshot; nothing here is user-editable. Re-verify here.
 *
 * Scope discipline:
 *  - EXPERIENTIAL only — things to see / notice / visit / detour to. Facilities
 *    (meals, café, sauna, shop, showers, accommodation, transport/boats) live on
 *    Stops / Lists and must never appear here.
 *  - Anchored to STABLE segment ids (`segmentIds`, d1..d7); a basecamp trip lists
 *    BOTH adjacent stages.
 *  - `location.kind`/`access` are qualitative relationships researched from trail
 *    descriptions; `orderHint` is a COARSE editorial position for ordering only
 *    (never a coordinate). Verified geometry ships ONLY where owner-provided:
 *    the three Day-1 records are `complete` (two owner GPX detours + one
 *    intentionally stage-wide); every other record is `spatialProvenance:
 *    'missing'`, `mapAvailability: 'unavailable'`, `spatialStatus:
 *    'awaiting-input'` — its "View on map" is omitted (not a disabled control)
 *    until the owner supplies data (see docs/proposals/along-the-way-spatial.md).
 *  - Diffuse "the walk is pretty" is route character → the Day Guide, not here,
 *    so d3 carries nothing and d5 carries one — uneven coverage is honest.
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

/** Spatial access → short hiker-facing label (a geometric relationship). */
export const ACCESS_LABEL: Record<ExperienceAccess, string> = {
  'on-trail': 'On the trail',
  'beside-trail': 'Beside the trail',
  'visible-from-trail': 'Seen from the trail',
  'short-detour': 'Short detour',
  'side-route': 'Side trip',
  'basecamp-trip': 'From the station',
};

const CURATED: RouteExperience[] = [
  // ── d1 · Abisko → Abiskojaure ─────────────────────────────────────────────
  {
    id: 'lake-njakajaure-lapporten',
    title: 'Lake Njakajaure & Lapporten views',
    type: 'viewpoint',
    scale: 'mini-detour',
    difficulty: 'easy',
    planningFit: 'adds-under-30',
    icon: 'lake',
    routeShape: 'out-and-back',
    segmentIds: ['d1'],
    // Owner-provided out-and-back detour (day-01-along-the-way.gpx). The Lapporten
    // target is a documented orientation aid ONLY (Wikipedia/Wikidata Q734943,
    // 68.26833/18.97694, ~141° SE) — not a destination, not a guaranteed view; it
    // never alters the owner geometry.
    location: {
      kind: 'route',
      access: 'short-detour',
      orderHint: 0.18,
      spatialProvenance: 'owner-provided',
      mapAvailability: 'verified-route',
      spatialStatus: 'complete',
      gpxAssetId: 'lake-njakajaure-lapporten.detour',
      viewTargetCoord: { lat: 68.26833, lng: 18.97694 },
      viewBearingDeg: 141,
    },
    nearestStopId: 'abisko',
    routeRelationship: 'Short detour off Stage 1 to the lakeside (out-and-back)',
    addedTimeText: '~30 min',
    roundTripKm: 1.23,
    summary:
      'A quiet lakeside detour with open water views and, in clear conditions, a possible view toward Lapporten.',
    whyNotice:
      'Leave the trail for a short out-and-back to Lake Njakajaure — open water framed by the fjäll. On a clear day, look south-east toward Lapporten; whether it shows depends on weather, cloud and atmospheric conditions.',
    description:
      'An optional side trip combining the lake setting, a scenic pause and a potential Lapporten view. Out-and-back to the lakeside viewpoint; return the way you came. Lapporten is far to the south-east and is never a walked destination — treat the view as a bonus, not a certainty.',
    source: {
      label: 'Naturkartan — Abisko–Abiskojaure (Stage 1)',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd21-fran-abisko-till-abiskojaure',
      lastVerified: '2026-07-15',
    },
    confidence: 'medium',
  },
  {
    id: 'abiskojakka-canyon',
    title: 'Abiskojåkka canyon',
    type: 'water',
    scale: 'mini-detour',
    difficulty: 'easy',
    planningFit: 'adds-under-30',
    icon: 'river',
    routeShape: 'out-and-back',
    segmentIds: ['d1'],
    // Owner-provided out-and-back detour (day-01-along-the-way.gpx); geometry +
    // metrics derived from the GPX (rejoin = entry).
    location: {
      kind: 'route',
      access: 'short-detour',
      orderHint: 0.05,
      spatialProvenance: 'owner-provided',
      mapAvailability: 'verified-route',
      spatialStatus: 'complete',
      gpxAssetId: 'abiskojakka-canyon.detour',
    },
    nearestStopId: 'abisko',
    routeRelationship: 'Short marked detour at the Abisko trailhead (out-and-back)',
    addedTimeText: '~10 min',
    roundTripKm: 0.42,
    summary: 'A turquoise glacial river in a blasted gorge at the trailhead.',
    whyNotice:
      'The Abiskojåkka has cut a sharp canyon toward Lake Torneträsk; in 1899 the railway builders blasted a tunnel to carry the river rather than bridge it. A brief detour loop from the start.',
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
    icon: 'wildlife',
    segmentIds: ['d1'],
    // A route-wide observation — something to NOTICE throughout the walk, not a
    // destination or a useful map target, so it deliberately carries no map
    // action. No point, polygon or GPX is fabricated.
    location: {
      kind: 'segment-portion',
      access: 'on-trail',
      orderHint: 0.3,
      spatialProvenance: 'source-verified',
      mapAvailability: 'unavailable',
      spatialStatus: 'complete',
    },
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
  {
    id: 'abisko-limestone-bluff',
    title: 'Limestone bluff over the river',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'viewpoint',
    segmentIds: ['d1'],
    location: { kind: 'vista', access: 'beside-trail', orderHint: 0.4, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'abisko',
    summary: 'A rocky bluff a few kilometres in, wide views over the river.',
    whyNotice:
      'A few kilometres from the trailhead a limestone bluff opens a wide view over the Abiskojåkka valley — a natural pause before the forest closes in again.',
    source: {
      label: 'Naturkartan — Abisko–Abiskojaure (Stage 1)',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd21-fran-abisko-till-abiskojaure',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'medium',
  },
  {
    id: 'abiskojaure-lakeshore',
    title: 'Lake Abiskojaure & its sandy beach',
    type: 'water',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'lake',
    segmentIds: ['d1'],
    location: { kind: 'segment-portion', access: 'beside-trail', orderHint: 0.95, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'abiskojaure',
    summary: 'The lake that ends the day, with a sandy beach by the cabins.',
    whyNotice:
      'The day finishes at Lake Abiskojaure, where a sandy beach near the cabins makes a rare spot for a rest — or a cold dip — after the forest walk.',
    source: {
      label: 'Naturkartan — Abisko–Abiskojaure (Stage 1)',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd21-fran-abisko-till-abiskojaure',
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
    icon: 'forest',
    segmentIds: ['d2'],
    location: { kind: 'segment-portion', access: 'on-trail', orderHint: 0.3, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
    location: { kind: 'vista', access: 'visible-from-trail', orderHint: 0.9, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
    location: { kind: 'area', access: 'beside-trail', orderHint: 0.85, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
  {
    id: 'siellajohka-bridge',
    title: 'Šiellajohka suspension bridge',
    type: 'water',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'bridge',
    segmentIds: ['d2'],
    location: { kind: 'point', access: 'on-trail', orderHint: 0.55, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'alesjaure',
    summary: 'The day’s big river crossing on a suspension bridge.',
    whyNotice:
      'The larger river crossings on this open stage are bridged; the suspension bridge over Šiellajohka is the notable one — a swaying span over fast glacial water.',
    source: {
      label: 'STF — stage guide Abiskojaure–Alesjaure',
      url: 'https://www.swedishtouristassociation.com/guides/stages/stf-abiskojaure-stf-alesjaure/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },

  // ── d3 · Alesjaure → Tjäktja (route character stays in the Day guide; the
  //         concrete features to notice migrate here as Highlights) ──────────
  {
    id: 'upper-valley-braiding',
    title: 'Braided river in the upper valley',
    type: 'water',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'river',
    segmentIds: ['d3'],
    location: { kind: 'segment-portion', access: 'beside-trail', orderHint: 0.35, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'tjaktja',
    summary: 'The wide upper valley, its river braiding below the trail.',
    whyNotice:
      'The trail follows the broad sweep of the upper valley, the river braiding across gravel flats below — open, spacious walking as the greenery thins.',
    source: {
      label: 'STF — Tjäktja Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-tjaktja-mountain-cabin/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'alpine-vegetation-transition',
    title: 'Thinning to alpine ground',
    type: 'nature',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d3'],
    location: { kind: 'segment-portion', access: 'on-trail', orderHint: 0.5, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'tjaktja',
    summary: 'Vegetation thinning to hardy alpine ground as you climb.',
    whyNotice:
      'As you gain height the vegetation thins to low, hardy alpine ground — the living sign that you are entering the route’s highest, most austere section.',
    source: {
      label: 'STF — Kungsleden trail overview',
      url: 'https://www.swedishtouristassociation.com/trails/kungsleden/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'tjaktja-approach-view',
    title: 'First views of the Tjäktjapasset country',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d3'],
    location: { kind: 'vista', access: 'on-trail', orderHint: 0.85, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'tjaktja',
    summary: 'First close views of the barren country around the pass.',
    whyNotice:
      'Near the cabin the first close views open onto the barren, stony country around Tjäktjapasset — a preview of the high crossing to come tomorrow.',
    source: {
      label: 'STF — Tjäktja Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-tjaktja-mountain-cabin/',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'medium',
  },

  // ── d4 · Tjäktja → Sälka (the richest stage) ──────────────────────────────
  {
    id: 'tjaktja-pass-view',
    title: 'Tjäktja Pass viewpoint',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'pass',
    segmentIds: ['d4'],
    location: { kind: 'vista', access: 'on-trail', orderHint: 0.15, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
    icon: 'geology',
    segmentIds: ['d4'],
    location: { kind: 'area', access: 'beside-trail', orderHint: 0.2, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
    location: { kind: 'segment-portion', access: 'on-trail', orderHint: 0.35, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
    routeShape: 'out-and-back',
    segmentIds: ['d4'],
    location: { kind: 'point', access: 'short-detour', orderHint: 0.95, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'salka',
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
    icon: 'summit',
    routeShape: 'out-and-back',
    segmentIds: ['d4'],
    location: { kind: 'route', access: 'side-route', orderHint: 0.95, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
    location: { kind: 'route', access: 'side-route', orderHint: 0.92, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
    icon: 'glacier',
    segmentIds: ['d5'],
    location: { kind: 'segment-portion', access: 'visible-from-trail', orderHint: 0.5, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
  {
    id: 'gaskkasjohka-bridges',
    title: 'Gaskkasjohka suspension bridges',
    type: 'water',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'bridge',
    segmentIds: ['d5'],
    location: { kind: 'point', access: 'on-trail', orderHint: 0.55, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'singi',
    summary: 'Streams crossed on wooden and suspension bridges.',
    whyNotice:
      'Even on this easier day many streams are crossed — the suspension bridges over the Gaskkasjohka are the ones you notice, spanning clear meltwater on the valley floor.',
    source: {
      label: 'STF — stage guide Sälka–Singi',
      url: 'https://www.swedishtouristassociation.com/guides/stages/stf-salka-stf-singi/',
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
    location: { kind: 'segment-portion', access: 'on-trail', orderHint: 0.4, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
  {
    id: 'duolbagorni',
    title: 'Duolbagorni & its crater hollow',
    type: 'landform',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'summit',
    segmentIds: ['d6'],
    location: { kind: 'vista', access: 'visible-from-trail', orderHint: 0.55, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'kebnekaise',
    summary: 'A distinctive peak with a crater-like hollow to the north.',
    whyNotice:
      'As the valley opens, Duolbagorni (Tolpagorni) stands out to the north — a distinctive peak with a crater-like hollow, one of the first landmarks of the Kebnekaise massif.',
    source: {
      label: 'Naturkartan — Singi–Kebnekaise',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd40-mellan-singi-och-kebnekaise-fjallstation',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },

  // ── d7 · Kebnekaise → Nikkaluokta ─────────────────────────────────────────
  {
    id: 'kebnekaise-massif-lookback',
    title: 'Looking back to the Kebnekaise massif',
    type: 'viewpoint',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    segmentIds: ['d7'],
    location: { kind: 'vista', access: 'on-trail', orderHint: 0.1, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'kebnekaise',
    summary: 'The massif behind you as you head down the valley.',
    whyNotice:
      'Early on the way out, turn and look back up Ladtjovagge: Sweden’s highest range fills the head of the valley — the last full view of the massif before the forest returns.',
    source: {
      label: 'Naturkartan — Kebnekaise–Nikkaluokta',
      url: 'https://www.naturkartan.se/en/norrbottens-lan/vandringsled-bd41-mellan-kebnekaise-fjallstation-och-nikkaluokta',
      lastVerified: EXPERIENCES_VERIFIED_ON,
    },
    confidence: 'high',
  },
  {
    id: 'darfaljohka-bridge',
    title: 'Darfáljohka suspension bridge',
    type: 'water',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'bridge',
    segmentIds: ['d7'],
    location: { kind: 'point', access: 'on-trail', orderHint: 0.05, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
    icon: 'lake',
    segmentIds: ['d7'],
    location: { kind: 'segment-portion', access: 'beside-trail', orderHint: 0.65, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
  {
    id: 'abisko-birch-return',
    title: 'Birch forest returns',
    type: 'nature',
    scale: 'on-route',
    planningFit: 'directly-on-route',
    icon: 'forest',
    segmentIds: ['d7'],
    location: { kind: 'segment-portion', access: 'on-trail', orderHint: 0.85, spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
    nearestStopId: 'nikkaluokta',
    summary: 'Sheltered birch woodland returns for the final kilometres.',
    whyNotice:
      'After days at and above the treeline, the last kilometres drop back into sheltered birch forest — a soft, green close to the week before the road head at Nikkaluokta.',
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
    icon: 'summit',
    routeShape: 'out-and-back',
    segmentIds: ['d6', 'd7'],
    location: {
      kind: 'route',
      access: 'basecamp-trip',
      spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input',
    },
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
    icon: 'glacier',
    routeShape: 'out-and-back',
    segmentIds: ['d6', 'd7'],
    location: { kind: 'route', access: 'basecamp-trip', spatialProvenance: 'missing', mapAvailability: 'unavailable', spatialStatus: 'awaiting-input' },
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
 * Validated experience list. Fails fast at import on an unknown segment/stop id
 * or a broken experience↔GPX-asset link — cheap guards against typos. The checks
 * live in the tested pure module (experienceRefErrors / gpxRefErrors).
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

{
  const gpxErrors = gpxRefErrors(ROUTE_EXPERIENCES, EXPERIENCE_ROUTES);
  if (gpxErrors.length > 0) {
    throw new Error(`Broken experience GPX links: ${gpxErrors.join('; ')}`);
  }
}

export const ROUTE_EXPERIENCES_BY_ID: Record<string, RouteExperience> =
  Object.fromEntries(ROUTE_EXPERIENCES.map((x) => [x.id, x]));

/**
 * Combined Highlight + Detour count for a stage (direction-independent, since it
 * is segment-stable) — drives the "Highlights & detours · N" disclosure count.
 */
export function experienceCountForStage(stageId: string): number {
  return ROUTE_EXPERIENCES.filter((x) => x.segmentIds.includes(stageId)).length;
}

/**
 * The stage's Highlights and Detours, journey-ordered and direction-aware
 * (basecamp trips kept last within Detours). The single source for the Stage
 * screen's two internal sections.
 */
export function stageHighlightsAndDetours(stageId: string, direction: RouteDirection) {
  return highlightsAndDetoursForStage(ROUTE_EXPERIENCES, stageId, direction);
}
