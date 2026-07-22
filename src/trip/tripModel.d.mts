import type {
  StayTripItem,
  TransportTripItem,
  TripItem,
  TripItemStatus,
  TripPlanSummary,
  TripStatusInfo,
  TripStayTypeInfo,
  TripTransportModeInfo,
} from '../types';

export declare const TRIP_STATUSES: TripStatusInfo[];
export declare const TRIP_TRANSPORT_MODES: TripTransportModeInfo[];
export declare const TRIP_STAY_TYPES: TripStayTypeInfo[];

export declare function isTripStatus(v: unknown): v is TripItemStatus;
export declare function tripStatusTitle(id: string): string;
export declare function tripModeTitle(id: string): string;
export declare function tripStayTypeTitle(id: string): string;

export declare function isTripDate(v: unknown): boolean;
export declare function isTripTime(v: unknown): boolean;
export declare function isStayDateOrderValid(
  checkInDate: string | undefined,
  checkOutDate: string | undefined,
): boolean;

export declare function newTripItemId(): string;
export declare function normalizeTripItem(raw: unknown): TripItem | null;
export declare function normalizeTripItems(raw: unknown): TripItem[];

export declare function sortTravelItems(
  items: TransportTripItem[],
  todayIso: string,
): TransportTripItem[];
export declare function sortStayItems(items: StayTripItem[], todayIso: string): StayTripItem[];

export declare function tripPlanSummary(items: TripItem[]): TripPlanSummary;

/** Prefill (not yet an item — no id/timestamps) for "Add to Trip". */
export interface TransportTripPrefill {
  kind: 'transport';
  title: string;
  mode: TransportTripItem['mode'];
  status: TripItemStatus;
  linkedTransportId?: string;
  provider?: string;
  from?: string;
  to?: string;
}

/** Prefill (not yet an item — no id/timestamps) for "Track stay". */
export interface StayTripPrefill {
  kind: 'stay';
  title: string;
  stayType: StayTripItem['stayType'];
  status: TripItemStatus;
  linkedStopId?: string;
}

export declare function transportPrefillFromEntry(entry: unknown): TransportTripPrefill;
export declare function stayPrefillFromStop(stop: unknown): StayTripPrefill;

export type { TripItem, TransportTripItem, StayTripItem };
