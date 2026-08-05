import type {
  TimetableCoverage,
  TimetablePeriod,
  TimetableStatus,
  TransportContext,
  TransportEntry,
  TransportSchedule,
} from '../types';
import type { RouteDirection } from '../route/direction.mjs';

export declare const TRANSPORT_FACTS_VERIFIED_ON: string;
export declare const BUS_TIMETABLES_REVERIFIED_ON: string;
export declare const SPECIAL_LINE91_SATURDAYS: string[];

export interface TransportSection {
  id: TransportContext;
  title: string;
  /** Endpoint-naming text used when no walking direction is known. */
  blurb: string;
  /** Per-direction wording, on the two trailhead sections only. */
  blurbByDirection?: Record<RouteDirection, string>;
}
export declare const TRANSPORT_SECTIONS: TransportSection[];
export declare const TRANSPORT_ENTRIES: TransportEntry[];

/** One section resolved for a walking direction, ready to render. */
export interface ResolvedTransportSection {
  id: TransportContext;
  title: string;
  blurb: string;
  entries: TransportEntry[];
}

/** The transport reference as one walking direction needs to read it. */
export interface TransportAssembly {
  /** The direction these sections describe; null when none is known. */
  direction: RouteDirection | null;
  toTrail: TransportEntry[];
  alongTrail: TransportEntry[];
  fromTrail: TransportEntry[];
  liveAlternatives: TransportEntry[];
  /** Ordered, non-empty sections — the render list. */
  sections: ResolvedTransportSection[];
}

export declare function transportSectionsFor(
  direction: RouteDirection | string | null | undefined,
): TransportAssembly;
export declare function sectionBlurb(
  section: TransportSection,
  direction: RouteDirection | null,
): string;

export declare function timetablePeriodsFor(
  entry: TransportEntry,
): TimetablePeriod[];
export declare function timetableCoverageFor(
  entry: TransportEntry,
  dateIso: string | null | undefined,
): TimetableCoverage;
export declare function timetableStatus(
  entry: TransportEntry,
  todayIso: string | null | undefined,
): TimetableStatus;
export declare function timetablePeriodProblems(
  entry: TransportEntry,
): string[];
export declare function scheduleRunsOn(
  schedule: TransportSchedule,
  iso: string,
): boolean;
export declare function entriesForContext(
  context: TransportContext,
): TransportEntry[];

/** A resolved deep-link target: exactly what the caller navigates with. */
export interface StopTransportLink {
  via: 'facility' | 'derived';
  label: string;
  context?: TransportContext;
  entryId?: string;
}
/** What the target is, without the `via` the whole stop record carries. */
export type StopTransportTarget = Omit<StopTransportLink, 'via'>;
/** A stop's record: one target, or one per walking direction. */
export type StopTransportLinkRecord =
  | StopTransportLink
  | { via: 'facility' | 'derived'; byDirection: Record<RouteDirection, StopTransportTarget> };

export declare const STOP_TRANSPORT_LINKS: Record<string, StopTransportLinkRecord>;
export declare function transportLinkForStop(
  stopId: string,
  direction: RouteDirection | string | null | undefined,
): StopTransportLink | undefined;
