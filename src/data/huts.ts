import type { Hut } from '../types';
import { HUT_TO_WAYPOINT, WAYPOINT_BY_ID } from '../route/routeData';

/**
 * Hut positions come from the GPX waypoints (via src/route/routeData) — the
 * old hand-estimated coordinates are gone. Editorial fields (type, shop,
 * blurb) stay here because a GPX cannot know them. Personal notes and shop
 * overrides live in localStorage keyed by hut id and are untouched by route
 * regeneration.
 *
 * Order matters: this array is the on-foot sequence Abisko → Nikkaluokta.
 */
const coordOf = (hutId: string) => {
  const w = WAYPOINT_BY_ID[HUT_TO_WAYPOINT[hutId]];
  return { lat: w.lat, lng: w.lon };
};

const EDITORIAL: Omit<Hut, 'coord'>[] = [
  {
    id: 'abisko',
    name: 'Abisko',
    type: 'mountain-station',
    shop: 'yes',
    blurb: 'Trailhead. Mountain station with shop, showers and the STF kiosk.',
  },
  {
    id: 'abiskojaure',
    name: 'Abiskojaure',
    type: 'hut',
    shop: 'no',
    blurb: 'Lakeside STF hut in the birch forest. Sauna by the water.',
  },
  {
    id: 'alesjaure',
    name: 'Alesjaure',
    type: 'hut',
    shop: 'yes',
    blurb: 'High, exposed hut above the lakes. Small provisioning shop.',
  },
  {
    id: 'tjaktja',
    name: 'Tjäktja',
    type: 'hut',
    shop: 'unknown',
    blurb: 'Small hut below the Tjäktja pass — the route high point.',
  },
  {
    id: 'salka',
    name: 'Sälka',
    type: 'hut',
    shop: 'yes',
    blurb: 'Popular hut in the valley. Sauna and a small shop.',
  },
  {
    id: 'singi',
    name: 'Singi',
    type: 'hut',
    shop: 'no',
    blurb: 'Junction hut where the Kebnekaise spur leaves the main Kungsleden.',
  },
  {
    id: 'kebnekaise',
    name: 'Kebnekaise',
    type: 'mountain-station',
    shop: 'yes',
    blurb: 'Mountain station at the foot of Sweden’s highest peak. Restaurant + shop.',
  },
  {
    id: 'nikkaluokta',
    name: 'Nikkaluokta',
    type: 'village',
    shop: 'yes',
    blurb: 'Trail end. Sami village with cafe, bus connection to Kiruna.',
  },
];

export const HUTS: Hut[] = EDITORIAL.map((h) => ({ ...h, coord: coordOf(h.id) }));

export const HUTS_BY_ID: Record<string, Hut> = Object.fromEntries(
  HUTS.map((h) => [h.id, h]),
);
