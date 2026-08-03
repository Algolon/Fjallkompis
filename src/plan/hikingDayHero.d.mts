import type { PlannedDay } from './plannedDays.mjs';
import type { LatLng } from '../types';

export interface HikingDaySegment {
  id: string;
  stageId: string;
  fromStopId: string | null;
  toStopId: string | null;
  distanceKm: number | null;
}

export interface HikingDayRouteFocus {
  tracks: LatLng[][];
  start: LatLng;
  destination: LatLng;
}

export declare function hikingDaySegments(day: PlannedDay | null): HikingDaySegment[];
export declare function hikingDayRouteFocus(day: PlannedDay | null): HikingDayRouteFocus | null;
