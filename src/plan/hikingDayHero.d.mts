import type { PlannedDay } from './plannedDays.mjs';
import type { LatLng } from '../types';

export interface HikingDayRouteFocus {
  tracks: LatLng[][];
  start: LatLng;
  destination: LatLng;
}

export declare function hikingDayRouteFocus(day: PlannedDay | null): HikingDayRouteFocus | null;
