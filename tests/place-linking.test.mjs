/**
 * Stay ↔ Place linking UI contracts — source-text fences in the established
 * style (tests/trip-view.test.mjs). The pure model behaviour lives in
 * tests/journey-places.test.mjs and the normalisation/migration behaviour in
 * tests/trip-model.test.mjs; these tests pin the structural facts the
 * Node-only suite cannot render: the Stay editor's Linked place control, the
 * ownership-boundary copy, the honest unavailable states, and the store's
 * editable-link rules.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const itemSheet = read('src/components/TripItemSheet.tsx');
const tripView = read('src/components/TripView.tsx');
const store = read('src/store/AppStore.tsx');
const stopsData = read('src/data/stops.ts');

// ---- The Linked place control ------------------------------------------------

test('the Place selector exists on the Stay form only — transport never shows it', () => {
  assert.match(itemSheet, /<span>Linked place<\/span>/);
  // It renders inside the stay branch of the kind ternary: the transport
  // branch (From/To/provider fields) carries no linked-place control.
  const transportBranch = itemSheet.slice(
    itemSheet.indexOf("kind === 'transport' ? (\n          <>"),
    itemSheet.indexOf(') : (\n          <>'),
  );
  assert.ok(transportBranch.includes('Provider / operator'), 'sliced the transport branch');
  assert.ok(!transportBranch.includes('Linked place'), 'no place control on transport');
});

test('options are grouped: Not linked, Along the route (itinerary order), Before & after trail', () => {
  assert.match(itemSheet, /<option value="">Not linked<\/option>/);
  assert.match(itemSheet, /<optgroup label="Along the route">/);
  assert.match(itemSheet, /<optgroup label="Before & after trail">/);
  // Route options follow the ACTIVE itinerary's walking order with stable ids.
  assert.match(itemSheet, /itinerary\.orderedStops\.map\(\(stop\) => \(/);
  assert.match(itemSheet, /value=\{stop\.id\}/);
  assert.match(itemSheet, /curatedOffRoutePlaces\(\)\.map\(\(place\) => \(/);
});

test('an unknown linked id stays selectable and is announced as unavailable — never cleared', () => {
  assert.match(itemSheet, /Linked place unavailable/);
  assert.match(itemSheet, /Linked place is no\s+longer available in this version\./);
  assert.ok(
    !/setLinkedPlaceId\(''\)/.test(itemSheet),
    'nothing silently resets the stored link',
  );
});

test('the ownership boundary is stated: reference place, personal dates/booking/notes', () => {
  assert.match(
    itemSheet,
    /The place is reference information\. Your dates, booking and notes stay personal\./,
  );
});

test('the link rides the same draft transaction as every other stay field', () => {
  assert.match(itemSheet, /linkedPlaceId: clean\(linkedPlaceId\)/, 'in the stay draft on Save');
  const transportDraft = itemSheet.slice(
    itemSheet.indexOf("kind === 'transport'\n        ? {"),
    itemSheet.indexOf(': {\n            stayType'),
  );
  assert.ok(!transportDraft.includes('linkedPlaceId'), 'never on a transport draft');
});

test('choosing a place fills only UNTOUCHED fields, and only in add mode', () => {
  assert.match(itemSheet, /if \(mode !== 'add'\) return;/, 'edit mode changes the link only');
  assert.match(itemSheet, /if \(!touched\.current\.title\) setTitle\(defaults\.title\);/);
  assert.match(itemSheet, /if \(!touched\.current\.stayType\) setStayType\(defaults\.stayType\);/);
  assert.match(
    itemSheet,
    /if \(!touched\.current\.location && defaults\.location\) setLocation\(defaults\.location\);/,
  );
});

test('View place is a real button with a complete accessible name, resolved links only', () => {
  assert.match(itemSheet, /linkedPlaceName && onViewPlace \? \(/);
  assert.match(itemSheet, /aria-label=\{`View place \$\{linkedPlaceName\} in Stops & places`\}/);
  assert.match(itemSheet, /View place\s*<\/button>/);
});

// ---- Store rules ----------------------------------------------------------------

test('the store keeps transport provenance immutable but lets a stay relink/unlink', () => {
  assert.match(
    store,
    /i\.kind === 'transport' \? \{ linkedTransportId: i\.linkedTransportId \} : \{\}/,
  );
  assert.ok(!/linkedPlaceId: i\.linkedPlaceId/.test(store), 'place link not pinned');
});

test('link edits go through updateTripItem — Day-plan overnights and other state untouched', () => {
  const block = store.slice(
    store.indexOf('const updateTripItem'),
    store.indexOf('const deleteTripItem'),
  );
  assert.ok(block.includes('trip: s.trip.map'), 'only the trip array is rewritten');
  assert.ok(!/dayPlan/.test(block), 'a link change can never touch the Day plan');
});

// ---- Trip cards -----------------------------------------------------------------

test('a resolved link shows as a concise secondary indicator on the Stay card', () => {
  assert.match(tripView, /`Linked · \$\{name\}`/);
  assert.match(tripView, /stopShortName\(STOPS_BY_ID\[place\.stopId\]\)/, 'route stops use short names');
  assert.match(tripView, /Linked place unavailable/, 'unknown ids stay honest on the card');
  assert.match(
    tripView,
    /if \(item\.kind !== 'stay' \|\| !item\.linkedPlaceId\) return null;/,
    'unlinked stays render exactly as before',
  );
  // Accessible name includes the linked place.
  assert.match(tripView, /\.\.\.\(linked \? \[linked\.text\] : \[\]\),/);
});

// ---- Stops & places screen ---------------------------------------------------------

const stopsScreen = read('src/screens/StopsScreen.tsx');
const chooserSrc = read('src/components/LinkedStaysChooser.tsx');

test('the screen is Stops & places and the header stops claiming everything is a route stop', () => {
  assert.match(stopsScreen, /title="Stops & places"/);
  assert.match(stopsScreen, /The eight route stops in walking order/);
  assert.match(stopsScreen, /plus places to stay before and after the trail/);
  assert.ok(!/Eight stops in walking order\s*\./.test(stopsScreen), 'old absolute claim gone');
});

test('Before & after trail renders the curated registry — never inside the route section', () => {
  assert.match(stopsScreen, /Before &amp; after trail/);
  assert.match(stopsScreen, /const offRoutePlaces = curatedOffRoutePlaces\(\);/);
  assert.match(stopsScreen, /offRoutePlaces\.map\(\(place, j\) => \(/);
  // Route counts and the master-detail grid stay route-only.
  assert.match(stopsScreen, /'--stop-count': stops\.length/);
  assert.match(
    stopsScreen,
    /openId != null && stops\.some\(\(s\) => s\.id === openId\) \? openId : null/,
    'an open off-route card never reshapes the route grid',
  );
});

test('the off-route card carries NO route semantics', () => {
  const card = stopsScreen.slice(
    stopsScreen.indexOf('function OffRoutePlaceCard'),
    stopsScreen.indexOf('export function StopsScreen'),
  );
  assert.ok(card.length > 0, 'sliced the off-route card');
  for (const routeOnly of ['routeKm', 'formatDistanceKm', "'Start'", 'stopDistanceKm', 'Stage']) {
    assert.ok(!card.includes(routeOnly), `off-route card has no ${routeOnly}`);
  }
  // It shows the verified reference facts and the same accessible accordion.
  for (const fact of [
    'tripStayTypeTitle(place.stayType)',
    'place.locationLabel',
    'place.address',
    'place.bedCapacity',
    'place.checkInTime',
    'place.checkOutTime',
    'place.source.url',
    'formatVerifiedDate(place.source.lastVerified)',
    'aria-expanded={open}',
    'aria-controls={panelId}',
  ]) {
    assert.ok(card.includes(fact), `off-route card renders ${fact}`);
  }
});

test('zero/one/several linked stays: prefill, direct open, or the explicit chooser', () => {
  assert.match(stopsScreen, /if \(linked\.length === 0\) \{/);
  assert.match(stopsScreen, /\} else if \(linked\.length === 1\) \{/);
  assert.match(stopsScreen, /setChooser\(\{ placeId, placeName \}\)/);
  assert.match(stopsScreen, /tripItemId: linked\[0\]\.id/, 'the ONE stay opens directly');
  // The chooser only ever renders for a real plurality.
  assert.match(stopsScreen, /chooser && chooserStays\.length > 1 \? \(/);
});

test('the chooser is a labelled modal listing title, status, dates and type/location', () => {
  assert.match(chooserSrc, /aria-labelledby=\{headingId\}/);
  assert.match(chooserSrc, /Stays at \{placeName\}/);
  assert.match(chooserSrc, /tripStatusTitle\(stay\.status\)/);
  assert.match(chooserSrc, /formatTripDate\(stay\.checkInDate\)/);
  assert.match(chooserSrc, /stay\.location \?\? tripStayTypeTitle\(stay\.stayType\)/);
  assert.match(chooserSrc, /Add another stay/);
  assert.match(chooserSrc, /aria-label=\{`Add another stay at \$\{placeName\}`\}/);
  // Focus enters on open and returns to the trigger; backdrop cancels.
  assert.match(chooserSrc, /dialogRef\.current\?\.showModal\(\)/);
  assert.match(chooserSrc, /return \(\) => opener\?\.focus\(\)/);
  assert.match(chooserSrc, /if \(e\.target === dialogRef\.current\) onClose\(\)/);
});

test('accordion keyboard navigation spans both sections in rendered order', () => {
  assert.match(stopsScreen, /const headerCount = stops\.length \+ offRoutePlaces\.length;/);
  assert.match(stopsScreen, /\(i \+ headerCount\) % headerCount/);
  assert.match(stopsScreen, /headerRefs\.current\[stops\.length \+ j\] = el;/);
});

test('the map popup names the renamed destination', () => {
  assert.match(read('src/map/stopMarkers.mjs'), /Open \$\{stopShortName\} details in Stops & places/);
});

// ---- Reference-data integrity -----------------------------------------------------

test('the canonical STOPS registry knows nothing about off-route places', () => {
  assert.ok(!/stf-kiruna/.test(stopsData), 'STF Kiruna never enters route data');
  const journeyPlaces = read('src/data/journeyPlaces.mjs');
  assert.ok(
    !/from '\.\/stops'|from '\.\.\/route/.test(journeyPlaces),
    'the pure place module never imports route data (registries are injected)',
  );
});

test('place reference data never enters PersistentState', () => {
  const migration = read('src/utils/stateMigration.mjs');
  assert.ok(!/journeyPlace|OFF_ROUTE/i.test(migration), 'no place records in the blob');
  assert.ok(!/facilities|bedCapacity/.test(read('src/trip/tripModel.mjs')),
    'trip items store the id association only, never copied place facts');
});
