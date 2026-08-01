import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const onRoute = readFileSync(join(root, 'src/components/TodayOnRoute.tsx'), 'utf8');

test('a personal Stay linked to a route Stop reuses the canonical Tonight card', () => {
  assert.ok(onRoute.includes('const overnightStayStopId ='));
  assert.ok(onRoute.includes("overnightStay?.kind === 'stay'"));
  assert.ok(onRoute.includes('overnightStay.linkedPlaceId'));
  // Links resolve through the shared Journey Place selector (route stops AND
  // curated off-route places), with the stop registry injected.
  assert.ok(onRoute.includes('journeyPlaceById(overnightStay.linkedPlaceId, STOPS_BY_ID)'));
  assert.ok(onRoute.includes("overnightPlace?.kind === 'route-stop'"));
  assert.ok(onRoute.includes('<TonightCard stopId={overnightStopId}'));
  assert.ok(onRoute.includes('<TonightCard stopId={overnightStayStopId}'));
  assert.ok(onRoute.includes('<StayTonightCard title={overnightStay.title}'));

  const explicitAt = onRoute.indexOf('{overnightStopId ? (');
  const linkedAt = onRoute.indexOf(') : overnightStayStopId ? (');
  const curatedAt = onRoute.indexOf(') : overnightCuratedPlace && overnightStay ? (');
  const personalAt = onRoute.indexOf(') : overnightStay ? (');
  assert.ok(explicitAt >= 0 && explicitAt < linkedAt);
  assert.ok(linkedAt < curatedAt && curatedAt < personalAt);
});

test('the canonical Tonight card uses compact STF names and keeps facilities', () => {
  const start = onRoute.indexOf('function TonightCard(');
  const end = onRoute.indexOf('function StayTonightCard(');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.ok(end > start);
  const tonight = onRoute.slice(start, end);

  assert.ok(tonight.includes("stop.type === 'village'"));
  assert.ok(tonight.includes('`STF ${stopShortName(stop)}`'));
  assert.ok(tonight.includes('aria-label={`Tonight: ${displayName}'));
  assert.ok(
    tonight.includes('className="tonight-card__title">{displayName}</span>'),
  );
  assert.ok(tonight.includes('const facilities = collapsedFacilities(stop, 4);'));
  assert.ok(tonight.includes('className="tonight-card__facilities"'));
  assert.ok(tonight.includes('<FacilityIcon'));
  assert.ok(tonight.includes('id={f.id}'));
  assert.ok(tonight.includes('size={15}'));
});
