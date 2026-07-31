import type {
  LatLng,
  StayTripItem,
  StopFacility,
  StopSource,
  TrailStop,
  TripItem,
  TripStayType,
} from '../types';

/**
 * A Journey Place adapter over an existing canonical route Stop. `id` IS the
 * stable stop id (no namespace), so persisted v9 `linkedStopId` values remain
 * valid `linkedPlaceId` values verbatim. All curated facts resolve through
 * the stop registry — never duplicated onto this record.
 */
export interface RouteStopPlace {
  id: string;
  kind: 'route-stop';
  stopId: string;
}

/** A manually verified place near — but never on — the canonical route. */
export interface CuratedOffRoutePlace {
  id: string;
  kind: 'curated-off-route';
  name: string;
  stayType: TripStayType;
  locationLabel: string;
  coord?: LatLng;
  summary: string;
  description: string;
  facilities: StopFacility[];
  address?: string;
  bedCapacity?: string;
  checkInTime?: string;
  checkOutTime?: string;
  source: StopSource;
}

export type JourneyPlace = RouteStopPlace | CuratedOffRoutePlace;

/** Prefill for creating a Stay from a Place — verified source facts only. */
export interface PlaceStayPrefill {
  kind: 'stay';
  title: string;
  stayType: TripStayType;
  location?: string;
  status: 'planned';
  linkedPlaceId: string;
}

export declare const OFF_ROUTE_FACTS_VERIFIED_ON: string;
export declare const OFF_ROUTE_PLACES: CuratedOffRoutePlace[];

export declare function curatedOffRoutePlaces(): CuratedOffRoutePlace[];
export declare function routeStopPlace(stopId: string): RouteStopPlace;
export declare function routePlacesInItineraryOrder(
  orderedStops: readonly Pick<TrailStop, 'id'>[],
): RouteStopPlace[];
export declare function allJourneyPlaces(
  orderedStops: readonly Pick<TrailStop, 'id'>[],
): JourneyPlace[];
export declare function journeyPlaceById(
  id: string | null | undefined,
  stopsById: Record<string, TrailStop>,
): JourneyPlace | null;
export declare function placeDisplayName(
  place: JourneyPlace | null,
  stopsById: Record<string, TrailStop>,
): string | null;
export declare function placeStayPrefill(
  place: JourneyPlace | null,
  stopsById: Record<string, TrailStop>,
): PlaceStayPrefill | null;
export declare function staysLinkedToPlace(
  trip: readonly TripItem[],
  placeId: string,
): StayTripItem[];
