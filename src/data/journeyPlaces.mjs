/**
 * Journey Places — the read-only reference model over every known place a
 * personal Stay can link to (docs/proposals/trip-plan.md → "Places").
 *
 * Plain .mjs (with a sibling .d.mts declaration) so `node --test` can drive
 * the selectors deterministically — the same pattern as src/data/shops.mjs
 * and src/data/transport.mjs. The app imports it through Vite unchanged.
 *
 * A Journey Place is one of two kinds:
 *
 *  - 'route-stop': an ADAPTER over an existing canonical route Stop. The
 *    place's id IS the stable stop id (no namespace — persisted v9
 *    `linkedStopId` values therefore remain valid `linkedPlaceId` values
 *    verbatim), and every curated fact (name, facilities, coordinates,
 *    source) stays in src/data/stops.ts — never duplicated here. Because
 *    this module is deliberately free of route-data imports (the
 *    stateMigration/topology pattern), callers inject the stop registry.
 *
 *  - 'curated-off-route': a manually verified place NEAR the trail but not
 *    on it — reference data for the nights before and after the hike. These
 *    records live in this module and are NEVER part of route data: they do
 *    not enter `STOPS`, itinerary ordering, route kilometres, stage
 *    endpoints or GPX geometry.
 *
 * Ownership boundary: a Place supplies identity, verified facts and safe
 * Stay defaults. It never owns booking status, personal dates, notes,
 * documents or Day-plan overnight selection — those belong to the user's
 * Stay items (src/trip/tripModel.mjs).
 */

// ---- Curated off-route registry ---------------------------------------------

/** ISO date the off-route facts below were last manually verified. */
export const OFF_ROUTE_FACTS_VERIFIED_ON = '2026-07-31';

/**
 * Curated off-route Places — a manually verified snapshot of official
 * information, checked against the linked sources on the date above. Static
 * reference data only: the app never scrapes STF at runtime, none of it is
 * user-editable, and deliberately NO prices, room availability, seasonal
 * restaurant hours or anything else that goes stale between verifications.
 */
export const OFF_ROUTE_PLACES = [
  {
    id: 'stf-kiruna',
    kind: 'curated-off-route',
    name: 'STF Kiruna Hotel & Hostel',
    stayType: 'hotel-hostel',
    locationLabel: 'Kiruna',
    coord: { lat: 67.861748, lng: 20.235069 },
    summary:
      'Hotel and hostel rooms in Kiruna — a practical base for the nights before or after the trail.',
    description:
      'Run at Malmfältens folkhögskola near Kiruna’s new town centre, with hotel rooms, ' +
      'hostel beds and a self-catering guest kitchen. A short ride from the train ' +
      'towards Abisko makes it a natural first or last night of the journey.',
    facilities: [
      { id: 'guest-kitchen', label: 'Guest kitchen' },
      { id: 'sauna', label: 'Sauna' },
      { id: 'wifi', label: 'Wi-Fi' },
      { id: 'restaurant', label: 'Restaurant' },
      { id: 'public-transport', label: 'Public transport', detail: 'Train and bus within 1 km' },
    ],
    address: 'Malmfältens Folkhögskola, Campingvägen 3, 981 35 Kiruna',
    bedCapacity: '76–100 beds',
    checkInTime: 'From 15:00',
    checkOutTime: 'Until 11:00',
    source: {
      label: 'STF — Kiruna Hotel & Hostel',
      url: 'https://www.swedishtouristassociation.com/facilities/stf-kiruna/',
      lastVerified: OFF_ROUTE_FACTS_VERIFIED_ON,
    },
  },
];

const OFF_ROUTE_BY_ID = new Map(OFF_ROUTE_PLACES.map((p) => [p.id, p]));

/** The curated off-route Places, in registry order (never itinerary order). */
export function curatedOffRoutePlaces() {
  return [...OFF_ROUTE_PLACES];
}

// ---- Route-stop adapters ------------------------------------------------------

/** The Journey Place adapter for one stable route-stop id. */
export function routeStopPlace(stopId) {
  return { id: stopId, kind: 'route-stop', stopId };
}

/**
 * Route Places in the ACTIVE itinerary's walking order. Ordering comes
 * entirely from the injected `orderedStops` (the active itinerary's derived
 * stop sequence) — reversing the route reorders these adapters and nothing
 * else; the ids stay the stable physical stop ids.
 */
export function routePlacesInItineraryOrder(orderedStops) {
  if (!Array.isArray(orderedStops)) return [];
  return orderedStops.map((stop) => routeStopPlace(stop.id));
}

/** Every known Journey Place: route Places first (itinerary order), then the
 *  curated off-route registry. Off-route records never join the route part. */
export function allJourneyPlaces(orderedStops) {
  return [...routePlacesInItineraryOrder(orderedStops), ...curatedOffRoutePlaces()];
}

/**
 * Resolve a place id: a stable route-stop id becomes its adapter, an
 * off-route id its curated record, anything else null (the honest
 * "no longer available" state — the caller never invents a place).
 */
export function journeyPlaceById(id, stopsById) {
  if (typeof id !== 'string' || id === '') return null;
  if (stopsById && Object.prototype.hasOwnProperty.call(stopsById, id)) {
    return routeStopPlace(id);
  }
  return OFF_ROUTE_BY_ID.get(id) ?? null;
}

// ---- Display + prefill selectors ----------------------------------------------

/**
 * Official display name of a place, or null when a route Place's stop no
 * longer resolves (callers show an explicit unavailable state, never a
 * fabricated name).
 */
export function placeDisplayName(place, stopsById) {
  if (!place) return null;
  if (place.kind === 'curated-off-route') return place.name;
  return stopsById?.[place.stopId]?.name ?? null;
}

/** Curated stop type → personal stay type (same mapping the route "Track
 *  stay" flow has always used). */
const STAY_TYPE_BY_STOP_TYPE = {
  'mountain-station': 'mountain-station',
  'mountain-cabin': 'mountain-hut',
};

/**
 * Prefill for "Track stay" on any Journey Place — verified source facts
 * ONLY. The official name and classification are safe defaults (and the
 * off-route location label); personal dates, booking references and
 * confirmation status are NEVER invented — the item starts 'planned'
 * because the user chose a concrete place, exactly like the existing
 * route-stop and transport prefills. Null when the place cannot be
 * resolved: an unavailable place must not fabricate defaults.
 */
export function placeStayPrefill(place, stopsById) {
  if (!place) return null;
  if (place.kind === 'curated-off-route') {
    return {
      kind: 'stay',
      title: place.name,
      stayType: place.stayType,
      location: place.locationLabel,
      status: 'planned',
      linkedPlaceId: place.id,
    };
  }
  const stop = stopsById?.[place.stopId];
  if (!stop) return null;
  return {
    kind: 'stay',
    title: stop.name,
    stayType: STAY_TYPE_BY_STOP_TYPE[stop.type] ?? 'other',
    status: 'planned',
    linkedPlaceId: place.id,
  };
}

// ---- Stay ↔ Place association ---------------------------------------------------

/**
 * Every personal Stay linked to this place, in trip order. Several stays may
 * legitimately link the same place (an arrival night and a departure night,
 * two separate bookings) — callers get the full list and NEVER assume the
 * first match is the interesting one.
 */
export function staysLinkedToPlace(trip, placeId) {
  if (!Array.isArray(trip) || typeof placeId !== 'string' || placeId === '') return [];
  return trip.filter((item) => item.kind === 'stay' && item.linkedPlaceId === placeId);
}
