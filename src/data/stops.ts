import type { FacilityId, StopFacility, StopImage, TrailStop } from '../types';
import { HUT_TO_WAYPOINT, WAYPOINT_BY_ID } from '../route/routeData';

/**
 * Curated stop guide — a manually verified snapshot of official facility
 * information, checked on 2026-07-02 against the linked sources. This data
 * is deliberately static: the app never scrapes STF (or anyone else) at
 * runtime, and none of it is user-editable. Re-verify and update here.
 *
 * Positions come from the GPX waypoints (via src/route/routeData) — ids match
 * the original hut ids so persisted notes, HUT_TO_WAYPOINT mappings and stage
 * from/to references all keep working untouched.
 *
 * Order matters: this array is the on-foot sequence Abisko → Nikkaluokta.
 */

export const FACTS_VERIFIED_ON = '2026-07-02';

const FACILITY_LABELS: Record<FacilityId, string> = {
  'guest-kitchen': 'Guest kitchen',
  shop: 'Shop',
  sauna: 'Sauna',
  shower: 'Shower',
  restaurant: 'Restaurant',
  cafe: 'Café',
  wifi: 'Wi-Fi',
  'gear-rental': 'Gear rental',
  'public-transport': 'Public transport',
  staffed: 'Staffed',
};

export function facilityLabel(id: FacilityId): string {
  return FACILITY_LABELS[id];
}

const has = (id: FacilityId, detail?: string): StopFacility => ({
  id,
  label: FACILITY_LABELS[id],
  ...(detail ? { detail } : {}),
});

/** The *absence* of this facility is the important, planning-relevant fact. */
const lacks = (id: FacilityId): StopFacility => ({
  id,
  label: `No ${FACILITY_LABELS[id].toLowerCase()}`,
  importantAbsence: true,
});

const coordOf = (stopId: string) => {
  const w = WAYPOINT_BY_ID[HUT_TO_WAYPOINT[stopId]];
  return { lat: w.lat, lng: w.lon };
};

/**
 * TEMPORARY placeholder photos (public/images/stops-placeholder/) for private
 * use only — most are STF press/website photos and are NOT licensed for
 * redistribution. Replace with own trip photos in public/images/stops/
 * (see the README there) before sharing the app or repo publicly.
 */
const placeholder = (stopId: string, alt: string, credit = 'STF'): StopImage => ({
  src: `${import.meta.env.BASE_URL}images/stops-placeholder/${stopId}.webp`,
  alt,
  credit,
  license: 'temporary placeholder — do not redistribute',
});

const CURATED: Omit<TrailStop, 'coord'>[] = [
  {
    id: 'abisko',
    image: placeholder('abisko', 'STF Abisko Turiststation buildings above the Abiskojåkka canyon'),
    name: 'STF Abisko Turiststation',
    type: 'mountain-station',
    summary:
      'Full-service trailhead in Abisko National Park, directly beside the train station.',
    description:
      'The northern starting point of the route. Abisko offers accommodation, self-catering facilities, meals, showers, sauna, Wi-Fi and a well-stocked shop. It is the best place to complete final preparations before entering the mountain-cabin section.',
    facilities: [
      has('guest-kitchen'),
      has('shop'),
      has('sauna'),
      has('shower'),
      has('restaurant'),
      has('cafe'),
      has('wifi'),
      has('gear-rental'),
      has('public-transport', 'Train station next door'),
      has('staffed'),
    ],
    summerOpening2026: '1 January – 31 December',
    bedCapacity: 'More than 100 beds',
    source: {
      label: 'STF — Abisko Turiststation',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-abisko-turiststation/',
      lastVerified: FACTS_VERIFIED_ON,
    },
  },
  {
    id: 'abiskojaure',
    image: placeholder('abiskojaure', 'Red cabins of STF Abiskojaure among birch trees, reached by a boardwalk'),
    name: 'STF Abiskojaure Mountain cabin',
    type: 'mountain-cabin',
    summary: 'Lakeside mountain cabin in the birch forest, with a shop and sauna.',
    description:
      'The first mountain cabin south of Abisko. Guests use shared self-catering facilities and fetch water locally. The nearby lake and wood-heated sauna make this a distinctive first overnight stop.',
    facilities: [
      has('guest-kitchen'),
      has('shop'),
      has('sauna', 'Wood-heated'),
      has('staffed'),
    ],
    summerOpening2026: '18 June – 13 September',
    bedCapacity: '51–75 beds',
    source: {
      label: 'STF — Abiskojaure Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-abiskojaure-mountain-cabin/',
      lastVerified: FACTS_VERIFIED_ON,
    },
  },
  {
    id: 'alesjaure',
    image: placeholder('alesjaure', 'Aerial view of the STF Alesjaure cabins on a knoll above the braided lake delta'),
    name: 'STF Alesjaure Mountain cabin',
    type: 'mountain-cabin',
    summary:
      'Large mountain cabin with panoramic views, a provisioning shop and sauna.',
    description:
      'STF’s largest mountain cabin, positioned above the Alesjaure landscape. It is an important resupply point and offers a guest kitchen, shop and wood-heated sauna.',
    facilities: [
      has('guest-kitchen'),
      has('shop'),
      has('sauna', 'Wood-heated'),
      has('staffed'),
    ],
    summerOpening2026: '18 June – 13 September',
    bedCapacity: '76–100 beds',
    source: {
      label: 'STF — Alesjaure Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-alesjaure-mountain-cabin/',
      lastVerified: FACTS_VERIFIED_ON,
    },
  },
  {
    id: 'tjaktja',
    image: placeholder('tjaktja', 'The lone STF Tjäktja cabin in the barren high valley below Tjäktja Pass'),
    name: 'STF Tjäktja Mountain cabin',
    type: 'mountain-cabin',
    summary: 'Small, exposed mountain cabin below Tjäktja Pass.',
    description:
      'A simple and comparatively small cabin close to the highest part of the route. It provides shared self-catering facilities but no shop, so food planning is important before leaving Alesjaure.',
    facilities: [has('guest-kitchen'), has('staffed'), lacks('shop'), lacks('sauna')],
    summerOpening2026: '18 June – 13 September',
    bedCapacity: '11–25 beds',
    source: {
      label: 'STF — Tjäktja Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-tjaktja-mountain-cabin/',
      lastVerified: FACTS_VERIFIED_ON,
    },
  },
  {
    id: 'salka',
    image: placeholder('salka', 'Row of STF Sälka cabins beside the stream, a reindeer grazing nearby'),
    name: 'STF Sälka Mountain cabin',
    type: 'mountain-cabin',
    summary: 'Well-equipped valley cabin with shop and sauna.',
    description:
      'A popular mountain cabin at the meeting point of two valleys. Sälka is a useful resupply stop and offers a shared guest kitchen, shop and sauna.',
    facilities: [
      has('guest-kitchen'),
      has('shop'),
      has('sauna'),
      has('staffed'),
    ],
    summerOpening2026: '18 June – 13 September',
    bedCapacity: '51–75 beds',
    source: {
      label: 'STF — Sälka Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-salka-mountain-cabin/',
      lastVerified: FACTS_VERIFIED_ON,
    },
  },
  {
    id: 'singi',
    image: placeholder('singi', 'STF Singi cabin on the open heath beneath a steep valley wall'),
    name: 'STF Singi Mountain cabin',
    type: 'mountain-cabin',
    summary: 'Remote junction cabin where the route turns toward Kebnekaise.',
    description:
      'Singi lies where several valleys and trails meet. It provides simple staffed accommodation and a shared kitchen, but no shop. From here, the Fjällkompis route leaves the official Kungsleden toward Kebnekaise.',
    facilities: [has('guest-kitchen'), has('staffed'), lacks('shop'), lacks('sauna')],
    summerOpening2026: '18 June – 13 September',
    bedCapacity: '26–50 beds',
    source: {
      label: 'STF — Singi Mountain cabin',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-singi-mountain-cabin/',
      lastVerified: FACTS_VERIFIED_ON,
    },
  },
  {
    id: 'kebnekaise',
    image: placeholder('kebnekaise', 'The stone main building of STF Kebnekaise Mountain Station under the peaks'),
    name: 'STF Kebnekaise Mountain Station',
    type: 'mountain-station',
    summary: 'Full-service mountain station at the foot of Sweden’s highest mountain.',
    description:
      'A major service stop with accommodation, meals, self-catering, showers, sauna, Wi-Fi, shop and equipment rental. It is significantly more developed than the mountain cabins and is the final overnight stop before Nikkaluokta.',
    facilities: [
      has('guest-kitchen'),
      has('shop'),
      has('sauna'),
      has('shower'),
      has('restaurant'),
      has('cafe'),
      has('wifi'),
      has('gear-rental'),
      has('staffed'),
    ],
    summerOpening2026: '12 June – 20 September',
    bedCapacity: 'More than 100 beds',
    source: {
      label: 'STF — Kebnekaise Mountain Station',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-kebnekaise-mountain-station/',
      lastVerified: FACTS_VERIFIED_ON,
    },
  },
  {
    id: 'nikkaluokta',
    image: placeholder('nikkaluokta', 'Red lodge buildings at Nikkaluokta, the southern end of the trail', 'Wikimedia Commons'),
    name: 'Nikkaluokta',
    type: 'village',
    summary:
      'Southern trail endpoint with accommodation, meals and bus transport to Kiruna.',
    description:
      'Nikkaluokta is not an STF accommodation. It offers cabins and apartments, self-catering facilities, showers, sauna, restaurant, café and a shop. Buses connect the village with Kiruna.',
    facilities: [
      has('guest-kitchen'),
      has('shop'),
      has('sauna'),
      has('shower'),
      has('restaurant'),
      has('cafe'),
      has('public-transport', 'Bus to Kiruna'),
      has('staffed'),
    ],
    bedCapacity: '56 beds across cabins and apartments',
    source: {
      label: 'Nikkaluokta — accommodation',
      url: 'https://nikkaluokta.com/en/accomodation',
      lastVerified: FACTS_VERIFIED_ON,
    },
  },
];

/**
 * Optional local, licensed images. Files are expected under
 * public/images/stops/<id>.webp — see public/images/stops/README.md for how
 * to add one. No STF or third-party photos are hotlinked or bundled; stops
 * without an image get a generated route-silhouette fallback in the UI.
 */
export const STOPS: TrailStop[] = CURATED.map((s) => ({ ...s, coord: coordOf(s.id) }));

export const STOPS_BY_ID: Record<string, TrailStop> = Object.fromEntries(
  STOPS.map((s) => [s.id, s]),
);

/** Short display name for tight UI (strips the STF prefix/suffix wording). */
export function stopShortName(stop: TrailStop): string {
  return stop.name
    .replace(/^STF\s+/, '')
    .replace(/\s+(Turiststation|Mountain cabin|Mountain Station)$/i, '');
}

/**
 * Facility icon order for the collapsed accordion row: most planning-relevant
 * first, capped by the caller (max five shown on a card).
 */
const COLLAPSED_PRIORITY: FacilityId[] = [
  'shop',
  'sauna',
  'restaurant',
  'guest-kitchen',
  'shower',
  'cafe',
  'wifi',
  'gear-rental',
  'public-transport',
  'staffed',
];

export function collapsedFacilities(stop: TrailStop, max = 5): StopFacility[] {
  const present = stop.facilities.filter((f) => !f.importantAbsence);
  return COLLAPSED_PRIORITY.map((id) => present.find((f) => f.id === id))
    .filter((f): f is StopFacility => f != null)
    .slice(0, max);
}

/** Facilities whose absence must be flagged (e.g. "No shop" at Tjäktja/Singi). */
export function importantAbsences(stop: TrailStop): StopFacility[] {
  return stop.facilities.filter((f) => f.importantAbsence);
}
