import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  OFF_ROUTE_PLACES,
  journeyPlaceById,
} from '../src/data/journeyPlaces.mjs';

/**
 * Tonight at a curated off-route Journey Place (STF Kiruna).
 *
 * A personal Stay linked to `stf-kiruna` must get the curated Place Tonight
 * card — verified facilities, no invented elevation, Place navigation —
 * while the place itself stays strictly OFF-ROUTE: never in STOPS, never in
 * the itinerary, no route kilometres, no waypoint. Pure-model behaviour is
 * exercised directly; the component composition is covered by source
 * contracts (the repo's node --test architecture has no DOM renderer).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const onRoute = readFileSync(join(root, 'src/components/TodayOnRoute.tsx'), 'utf8');
const stopsData = readFileSync(join(root, 'src/data/stops.ts'), 'utf8');
const routeJson = JSON.parse(
  readFileSync(join(root, 'src/generated/kungsleden-route.json'), 'utf8'),
);

const curatedCard = onRoute.slice(
  onRoute.indexOf('function CuratedPlaceTonightCard('),
  onRoute.indexOf('function StayTonightCard('),
);

test('stf-kiruna resolves as a curated off-route Place through the shared selector', () => {
  // The injected stop registry deliberately does NOT contain stf-kiruna, so
  // resolution must come from the curated registry.
  const place = journeyPlaceById('stf-kiruna', {});
  assert.ok(place, 'stf-kiruna resolves');
  assert.equal(place.kind, 'curated-off-route');
  assert.equal(place.name, 'STF Kiruna Hotel & Hostel');
  assert.ok(Array.isArray(place.facilities) && place.facilities.length > 0);
  // Unknown ids stay unresolved — nothing is invented.
  assert.equal(journeyPlaceById('hotel-arctic-eden', {}), null);
});

test('the curated Tonight card renders verified facilities, capped at four, in shared priority', () => {
  assert.ok(curatedCard.includes('collapsedFacilityList(place.facilities, 4)'));
  assert.ok(curatedCard.includes('className="tonight-card__facilities"'));
  assert.ok(curatedCard.includes('<FacilityIcon'));
  // The shared collapse over STF Kiruna's record: priority order, max four.
  // (Assert behaviour, not hand-copied values: derive from the registry.)
  const kiruna = OFF_ROUTE_PLACES.find((p) => p.id === 'stf-kiruna');
  const priority = ['shop', 'sauna', 'restaurant', 'guest-kitchen', 'shower', 'cafe', 'wifi', 'gear-rental', 'public-transport', 'staffed'];
  const expected = priority
    .filter((id) => kiruna.facilities.some((f) => f.id === id && !f.importantAbsence))
    .slice(0, 4);
  assert.equal(expected.length, 4, 'STF Kiruna has more than four verified facilities to cap');
  assert.deepEqual(expected, ['sauna', 'restaurant', 'guest-kitchen', 'wifi']);
});

test('the display title remains the personal Stay title, never the Place name', () => {
  assert.ok(onRoute.includes('title={overnightStay.title}'));
  assert.ok(curatedCard.includes('className="tonight-card__title">{title}</span>'));
  assert.ok(!curatedCard.includes('{place.name}'), 'the card never substitutes the official name');
});

test('no elevation is rendered without verified elevation data', () => {
  assert.ok(!curatedCard.includes('tonight-card__elevation'));
  assert.ok(!curatedCard.includes('Mountain'));
  assert.ok(!curatedCard.includes('WAYPOINT_BY_ID'));
  assert.ok(!curatedCard.includes('elevation'));
});

test('the card navigates to the Place (placeId), not a stop', () => {
  assert.ok(curatedCard.includes("onNavigate('huts', { placeId: place.id })"));
  assert.ok(!curatedCard.includes('stopId'));
  assert.ok(curatedCard.includes('Opens place details in Stops & places.'));
});

test('canonical route Stop behaviour is unchanged and outranks the curated card', () => {
  const linkedAt = onRoute.indexOf(') : overnightStayStopId ? (');
  const curatedAt = onRoute.indexOf(') : overnightCuratedPlace && overnightStay ? (');
  const personalAt = onRoute.indexOf(') : overnightStay ? (');
  assert.ok(linkedAt >= 0 && curatedAt > linkedAt && personalAt > curatedAt);
  // Route-stop links still resolve to the canonical TonightCard with the
  // stable stop id.
  assert.ok(onRoute.includes("overnightPlace?.kind === 'route-stop' ? overnightPlace.stopId : null"));
  const place = journeyPlaceById('abiskojaure', { abiskojaure: { id: 'abiskojaure' } });
  assert.equal(place.kind, 'route-stop');
  assert.equal(place.stopId, 'abiskojaure');
});

test('unknown and unlinked stays remain generic Stay cards', () => {
  // An unresolvable link leaves both the stop and curated branches null, so
  // the chain falls through to StayTonightCard with the personal title.
  assert.equal(journeyPlaceById('', {}), null);
  assert.equal(journeyPlaceById(null, {}), null);
  assert.equal(journeyPlaceById('not-a-place', {}), null);
  const stayCard = onRoute.slice(onRoute.indexOf('function StayTonightCard('));
  assert.ok(!stayCard.includes('FacilityIcon'));
  assert.ok(!stayCard.includes('tonight-card__meta'));
});

test('STF Kiruna never enters canonical route data', () => {
  assert.ok(!stopsData.includes('stf-kiruna'), 'not in the curated Stop registry (STOPS/STOPS_BY_ID)');
  const routeText = JSON.stringify(routeJson);
  assert.ok(!routeText.includes('stf-kiruna'), 'no waypoint, stage or GPX geometry');
  assert.ok(!routeText.toLowerCase().includes('kiruna hotel'), 'no route marker for the hostel');
});
