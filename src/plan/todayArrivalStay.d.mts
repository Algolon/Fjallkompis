import type { TripItem } from '../types';
import type { PlannedDay } from './plannedDays.mjs';

export declare function resolveTodayArrivalStay(
  day: PlannedDay | null,
  plannedDays: readonly PlannedDay[],
  tripItems: readonly TripItem[],
): PlannedDay | null;
