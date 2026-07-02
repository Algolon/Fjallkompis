import type { Hut } from '../types';

/**
 * PROTOTYPE ROUTE DATA — APPROXIMATE COORDINATES.
 * These lat/lng values are hand-estimated to give the route map a plausible
 * shape. They are NOT survey-grade and must be replaced with verified GPX
 * waypoints before any real-world use. The UI surfaces this warning too.
 *
 * Order matters: this array defines the on-foot sequence Abisko -> Nikkaluokta,
 * which the route polyline and stage segments depend on.
 */
export const HUTS: Hut[] = [
  {
    id: 'abisko',
    name: 'Abisko',
    type: 'mountain-station',
    shop: 'yes',
    coord: { lat: 68.349, lng: 18.783 },
    blurb: 'Trailhead. Mountain station with shop, showers and the STF kiosk.',
  },
  {
    id: 'abiskojaure',
    name: 'Abiskojaure',
    type: 'hut',
    shop: 'no',
    coord: { lat: 68.286, lng: 18.681 },
    blurb: 'Lakeside STF hut in the birch forest. Sauna by the water.',
  },
  {
    id: 'alesjaure',
    name: 'Alesjaure',
    type: 'hut',
    shop: 'yes',
    coord: { lat: 68.121, lng: 18.478 },
    blurb: 'High, exposed hut above the lakes. Small provisioning shop.',
  },
  {
    id: 'tjaktja',
    name: 'Tjäktja',
    type: 'hut',
    shop: 'unknown',
    coord: { lat: 68.025, lng: 18.430 },
    blurb: 'Small hut below the Tjäktja pass — the route high point.',
  },
  {
    id: 'salka',
    name: 'Sälka',
    type: 'hut',
    shop: 'yes',
    coord: { lat: 67.918, lng: 18.480 },
    blurb: 'Popular hut in the valley. Sauna and a small shop.',
  },
  {
    id: 'singi',
    name: 'Singi',
    type: 'hut',
    shop: 'no',
    coord: { lat: 67.830, lng: 18.531 },
    blurb: 'Junction hut where the Kebnekaise spur leaves the main Kungsleden.',
  },
  {
    id: 'kebnekaise',
    name: 'Kebnekaise',
    type: 'mountain-station',
    shop: 'yes',
    coord: { lat: 67.851, lng: 18.631 },
    blurb: 'Mountain station at the foot of Sweden\u2019s highest peak. Restaurant + shop.',
  },
  {
    id: 'nikkaluokta',
    name: 'Nikkaluokta',
    type: 'village',
    shop: 'yes',
    coord: { lat: 67.851, lng: 19.012 },
    blurb: 'Trail end. Sami village with cafe, bus connection to Kiruna.',
  },
];

export const HUTS_BY_ID: Record<string, Hut> = Object.fromEntries(
  HUTS.map((h) => [h.id, h]),
);
