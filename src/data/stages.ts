import type { Stage } from '../types';

/**
 * Seven day-stages connecting the eight huts in order.
 * distanceKm and estimatedHours are PROTOTYPE ESTIMATES — replace with values
 * derived from verified GPX. Times assume a loaded pack on rough fjäll terrain
 * (~3 km/h effective incl. breaks); adjust to your own pace.
 */
export const STAGES: Stage[] = [
  {
    id: 'd1',
    day: 1,
    fromHutId: 'abisko',
    toHutId: 'abiskojaure',
    distanceKm: 15,
    estimatedHours: 5,
    notes: 'Gentle start through birch forest along the Abiskojåkka river.',
  },
  {
    id: 'd2',
    day: 2,
    fromHutId: 'abiskojaure',
    toHutId: 'alesjaure',
    distanceKm: 20,
    estimatedHours: 6.5,
    notes: 'Long day climbing above the treeline. Exposed and beautiful.',
  },
  {
    id: 'd3',
    day: 3,
    fromHutId: 'alesjaure',
    toHutId: 'tjaktja',
    distanceKm: 13,
    estimatedHours: 4.5,
    notes: 'Open high valley. Wind picks up approaching the pass.',
  },
  {
    id: 'd4',
    day: 4,
    fromHutId: 'tjaktja',
    toHutId: 'salka',
    distanceKm: 12,
    estimatedHours: 4.5,
    notes: 'Over the Tjäktja pass (route high point), then down to Sälka.',
  },
  {
    id: 'd5',
    day: 5,
    fromHutId: 'salka',
    toHutId: 'singi',
    distanceKm: 12,
    estimatedHours: 4,
    notes: 'Valley walking. Singi is the junction for the Kebnekaise spur.',
  },
  {
    id: 'd6',
    day: 6,
    fromHutId: 'singi',
    toHutId: 'kebnekaise',
    distanceKm: 14.5,
    estimatedHours: 5.5,
    notes: 'Leave the main Kungsleden east toward Kebnekaise station.',
  },
  {
    id: 'd7',
    day: 7,
    fromHutId: 'kebnekaise',
    toHutId: 'nikkaluokta',
    distanceKm: 19,
    estimatedHours: 6,
    notes: 'Final stretch out to Nikkaluokta. Boat shortcut option on Láddjujávri.',
  },
];

export const STAGES_BY_ID: Record<string, Stage> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
);

export const DEFAULT_STAGE_ID = STAGES[0].id;
