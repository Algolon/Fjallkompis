import type {
  TimetableStatus,
  TransportContext,
  TransportEntry,
  TransportSchedule,
} from '../types';

export declare const TRANSPORT_FACTS_VERIFIED_ON: string;
export declare const SPECIAL_LINE91_SATURDAYS: string[];

export interface TransportSection {
  id: TransportContext;
  title: string;
  blurb: string;
}
export declare const TRANSPORT_SECTIONS: TransportSection[];
export declare const TRANSPORT_ENTRIES: TransportEntry[];

export declare function timetableStatus(
  entry: TransportEntry,
  todayIso: string,
): TimetableStatus;
export declare function scheduleRunsOn(
  schedule: TransportSchedule,
  iso: string,
): boolean;
export declare function entriesForContext(
  context: TransportContext,
): TransportEntry[];
