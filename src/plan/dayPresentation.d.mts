import type { TripItem } from '../types';
import type { PlannedDay } from './plannedDays.mjs';

/** How a day's travel activity reads, relative to its walking. */
export interface TravelPresentation {
  /** Where the line sits: alone, above the walk, or below it. */
  position: 'only' | 'before' | 'after';
  /** The sequencing lead word ("Travel" / "then travel"), null when alone. */
  lead: string | null;
  /** The matched movements as text; empty when nothing matched the date. */
  text: string;
  isEmpty: boolean;
  /** The ready-to-render sentence, including lead word and empty state. */
  line: string;
}

export declare function activityOrderPhrase(day: PlannedDay | null | undefined): string;
export declare function travelItemsText(items: readonly TripItem[] | undefined): string;
export declare function travelPresentation(
  day: PlannedDay | null | undefined,
): TravelPresentation | null;
export declare function hikingLead(day: PlannedDay | null | undefined): string | null;
