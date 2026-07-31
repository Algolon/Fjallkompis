/**
 * Journey Place model — the pure read-only reference layer every Stay link
 * resolves through (src/data/journeyPlaces.mjs).
 *
 * Route Places are ADAPTERS over the canonical stop registry (injected, the
 * stateMigration/topology pattern), so these tests drive them with a stub
 * registry; the curated off-route registry is the module's own data and is
 * asserted directly. The screen-level facts (off-route places never render
 * route kilometres, STOPS itself is untouched) are fenced in
 * tests/place-linking.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFF_ROUTE_FACTS_VERIFIED_ON,
  OFF_ROUTE_PLACES,
  allJourneyPlaces,
  curatedOffRoutePlaces,
  journeyPlaceById,
  placeDisplayName,
  placeStayPrefill,
  routePlacesInItineraryOrder,
  staysLinkedToPlace,
} from '../src/data/journeyPlaces.mjs';

/** Minimal stand-in for the STOPS registry (canonical walking order). */
const STOPS_STUB = [
  { id: 'abisko', name: 'STF Abisko Turiststation', type: 'mountain-station' },
  { id: 'salka', name: 'STF Sälka Mountain cabin', type: 'mountain-cabin' },
  { id: 'nikkaluokta', name: 'Nikkaluokta', type: 'village' },
];
const STOPS_BY_ID = Object.fromEntries(STOPS_STUB.map((s) => [s.id, s]));

// ---- Route-stop adapters ------------------------------------------------------

test('a route Place resolves through the existing stop registry — id IS the stable stop id', () => {
  const place = journeyPlaceById('salka', STOPS_BY_ID);
  assert.deepEqual(place, { id: 'salka', kind: 'route-stop', stopId: 'salka' });
  assert.equal(placeDisplayName(place, STOPS_BY_ID), 'STF Sälka Mountain cabin');
});

test('route Places carry NO duplicated curated facts — everything resolves via the stop', () => {
  const place = journeyPlaceById('abisko', STOPS_BY_ID);
  assert.deepEqual(
    Object.keys(place).sort(),
    ['id', 'kind', 'stopId'],
    'adapter holds identity only — name/facilities/coord stay in stops.ts',
  );
});

test('route Places follow the ACTIVE itinerary order; reversal reorders them', () => {
  const forward = routePlacesInItineraryOrder(STOPS_STUB);
  assert.deepEqual(
    forward.map((p) => p.id),
    ['abisko', 'salka', 'nikkaluokta'],
  );
  const reversed = routePlacesInItineraryOrder([...STOPS_STUB].reverse());
  assert.deepEqual(
    reversed.map((p) => p.id),
    ['nikkaluokta', 'salka', 'abisko'],
    'ordering is derived from the injected itinerary, ids stay stable',
  );
});

test('a missing place lookup is null — never a fabricated record, never a throw', () => {
  assert.equal(journeyPlaceById('atlantis', STOPS_BY_ID), null);
  assert.equal(journeyPlaceById('', STOPS_BY_ID), null);
  assert.equal(journeyPlaceById(null, STOPS_BY_ID), null);
  assert.equal(journeyPlaceById(undefined, STOPS_BY_ID), null);
  assert.equal(placeDisplayName(null, STOPS_BY_ID), null);
});

test('a route Place whose stop no longer exists reports an unavailable name (null)', () => {
  const place = journeyPlaceById('salka', STOPS_BY_ID);
  assert.equal(placeDisplayName(place, {}), null);
  assert.equal(placeStayPrefill(place, {}), null, 'no defaults invented for an unresolvable stop');
});

// ---- STF Kiruna (curated off-route) --------------------------------------------

test('STF Kiruna resolves as the one curated off-route Place of this slice', () => {
  assert.deepEqual(
    OFF_ROUTE_PLACES.map((p) => p.id),
    ['stf-kiruna'],
    'v0.27.0 curates exactly one off-route place; additions are deliberate',
  );
  const place = journeyPlaceById('stf-kiruna', STOPS_BY_ID);
  assert.equal(place.kind, 'curated-off-route');
  assert.equal(place.name, 'STF Kiruna Hotel & Hostel');
  assert.equal(place.stayType, 'hotel-hostel');
  assert.equal(place.locationLabel, 'Kiruna');
  assert.equal(placeDisplayName(place, STOPS_BY_ID), 'STF Kiruna Hotel & Hostel');
});

test('the STF Kiruna record carries only source-verified facts', () => {
  const [kiruna] = OFF_ROUTE_PLACES;
  assert.deepEqual(kiruna.coord, { lat: 67.861748, lng: 20.235069 });
  assert.equal(kiruna.address, 'Malmfältens Folkhögskola, Campingvägen 3, 981 35 Kiruna');
  assert.equal(kiruna.bedCapacity, '76–100 beds');
  assert.equal(kiruna.checkInTime, 'From 15:00');
  assert.equal(kiruna.checkOutTime, 'Until 11:00');
  assert.deepEqual(
    kiruna.facilities.map((f) => f.id).sort(),
    ['guest-kitchen', 'public-transport', 'restaurant', 'sauna', 'wifi'],
  );
  assert.equal(
    kiruna.source.url,
    'https://www.swedishtouristassociation.com/facilities/stf-kiruna/',
  );
  assert.equal(kiruna.source.lastVerified, OFF_ROUTE_FACTS_VERIFIED_ON);
  assert.equal(OFF_ROUTE_FACTS_VERIFIED_ON, '2026-07-31');
});

test('no volatile or personal fields are hard-coded onto the curated record', () => {
  const [kiruna] = OFF_ROUTE_PLACES;
  const text = JSON.stringify(kiruna).toLowerCase();
  for (const forbidden of ['price', 'sek', 'availab', 'checkindate', 'checkoutdate', 'booking']) {
    assert.ok(!text.includes(forbidden), `no ${forbidden} on reference data`);
  }
  assert.ok(!('image' in kiruna), 'no unverified image');
  assert.ok(
    kiruna.description.length < 400,
    'descriptive copy is a short paraphrase, not official passages',
  );
});

test('off-route Places never join the route ordering and never gain route kilometres', () => {
  const all = allJourneyPlaces(STOPS_STUB);
  assert.deepEqual(
    all.map((p) => p.id),
    ['abisko', 'salka', 'nikkaluokta', 'stf-kiruna'],
    'route places first in itinerary order, curated registry after',
  );
  const routeOnly = routePlacesInItineraryOrder(STOPS_STUB);
  assert.ok(!routeOnly.some((p) => p.id === 'stf-kiruna'), 'never inside the route section');
  const reversedRoute = routePlacesInItineraryOrder([...STOPS_STUB].reverse());
  assert.ok(!reversedRoute.some((p) => p.id === 'stf-kiruna'), 'reversal cannot pull it in');
  assert.deepEqual(
    curatedOffRoutePlaces().map((p) => p.id),
    ['stf-kiruna'],
    'off-route order is registry order, direction-independent',
  );
  const [kiruna] = OFF_ROUTE_PLACES;
  assert.ok(!('routeKm' in kiruna) && !('distanceKm' in kiruna), 'no trail-km fact exists');
});

// ---- Stay prefill ---------------------------------------------------------------

test('a route Place prefill copies verified stop facts only and links the place id', () => {
  const prefill = placeStayPrefill(journeyPlaceById('salka', STOPS_BY_ID), STOPS_BY_ID);
  assert.deepEqual(prefill, {
    kind: 'stay',
    title: 'STF Sälka Mountain cabin',
    stayType: 'mountain-hut',
    status: 'planned',
    linkedPlaceId: 'salka',
  });
  assert.equal(
    placeStayPrefill(journeyPlaceById('abisko', STOPS_BY_ID), STOPS_BY_ID).stayType,
    'mountain-station',
  );
  assert.equal(
    placeStayPrefill(journeyPlaceById('nikkaluokta', STOPS_BY_ID), STOPS_BY_ID).stayType,
    'other',
    'village stops keep the Other stay default',
  );
});

test('the STF Kiruna prefill sets title, type and location — never dates or bookings', () => {
  const prefill = placeStayPrefill(journeyPlaceById('stf-kiruna', STOPS_BY_ID), STOPS_BY_ID);
  assert.deepEqual(prefill, {
    kind: 'stay',
    title: 'STF Kiruna Hotel & Hostel',
    stayType: 'hotel-hostel',
    location: 'Kiruna',
    status: 'planned',
    linkedPlaceId: 'stf-kiruna',
  });
  for (const never of ['checkInDate', 'checkOutDate', 'bookingReference', 'notes']) {
    assert.ok(!(never in prefill), `${never} is never invented`);
  }
});

test('prefills use the stable place id — route direction cannot corrupt a link', () => {
  // The prefill takes the place record itself; there is no day-number or
  // direction input at all, so reversing the route cannot change the link.
  const prefill = placeStayPrefill(journeyPlaceById('salka', STOPS_BY_ID), STOPS_BY_ID);
  assert.equal(prefill.linkedPlaceId, 'salka');
});

// ---- Stay ↔ Place association ----------------------------------------------------

const linkedStay = (id, linkedPlaceId, extra = {}) => ({
  id,
  kind: 'stay',
  title: id,
  status: 'planned',
  stayType: 'other',
  attachmentIds: [],
  createdAt: 0,
  updatedAt: 0,
  ...(linkedPlaceId ? { linkedPlaceId } : {}),
  ...extra,
});

test('staysLinkedToPlace returns zero, one or SEVERAL matches — never first-match-only', () => {
  const trip = [
    linkedStay('trip_a', 'stf-kiruna'),
    { id: 'trip_bus', kind: 'transport', title: 'Bus', attachmentIds: [], linkedTransportId: 'stf-kiruna' },
    linkedStay('trip_b', 'salka'),
    linkedStay('trip_c', 'stf-kiruna'),
    linkedStay('trip_d', null),
  ];
  assert.deepEqual(staysLinkedToPlace(trip, 'stf-kiruna').map((i) => i.id), ['trip_a', 'trip_c']);
  assert.deepEqual(staysLinkedToPlace(trip, 'salka').map((i) => i.id), ['trip_b']);
  assert.deepEqual(staysLinkedToPlace(trip, 'abisko'), []);
  assert.deepEqual(staysLinkedToPlace(trip, ''), []);
  assert.deepEqual(staysLinkedToPlace(undefined, 'salka'), []);
});

test('a transport item can never claim a Place, whatever its fields say', () => {
  const trip = [
    { id: 'trip_t', kind: 'transport', title: 'Taxi', attachmentIds: [], linkedPlaceId: 'stf-kiruna' },
  ];
  assert.deepEqual(staysLinkedToPlace(trip, 'stf-kiruna'), []);
});
