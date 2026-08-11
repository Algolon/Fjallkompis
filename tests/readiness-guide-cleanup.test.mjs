/** Final Trail Readiness + Guide presentation contracts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAGE_GUIDES } from '../src/data/stageGuides.mjs';
import { OFF_ROUTE_PLACES } from '../src/data/journeyPlaces.mjs';
import { officialInformationLabel } from '../src/utils/officialInformationLabel.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const settings = read('src/screens/SettingsScreen.tsx');
const stages = read('src/screens/StagesScreen.tsx');
const stops = read('src/screens/StopsScreen.tsx');
const stopData = read('src/data/stops.ts');

const readiness = settings.slice(
  settings.indexOf('id="readiness"'),
  settings.indexOf('id="maps"'),
);

test('Trail Readiness contains hiker facts and no technical/PWA score', () => {
  for (const fact of ['Default basemap', 'Terrain relief', 'Satellite', 'Packing']) {
    assert.ok(readiness.includes(fact), `${fact} is included`);
  }
  for (const retired of [
    'App installed',
    'App shell',
    'Browser tab',
    'Manual field test',
    'readiness-score',
    '{passed}/{required}',
  ]) {
    assert.ok(!readiness.includes(retired), `${retired} stays retired`);
  }
});

test('optional map absence is neutral and never an overall failure', () => {
  assert.match(settings, /return optional \? 'Optional · Not downloaded' : 'Not downloaded'/);
  assert.ok(!/Needs attention|Not ready|ready\s+\d+\/\d+|\d+%/.test(readiness));
  assert.match(settings, /useOfflineDiagnostics\(\)/, 'same archive status authority as Offline maps');
});

test('Trail Readiness owns the generic responsibility note', () => {
  const caveats = read('src/data/trailCaveats.mjs');
  assert.match(caveats, /Trail, water and weather conditions vary; check locally\./);
  assert.match(caveats, /Plan ahead and carry a map and compass\./);
  assert.match(readiness, /TRAIL_CAVEATS\.navigation\.full/);
});

test('Stage Guides keep specific content but lose the generic footer', () => {
  assert.match(stages, /guide\.overview/);
  assert.match(stages, /guide\.terrain/);
  assert.match(stages, /guide\.watchFor\.map/);
  assert.match(stages, />Plan for</);
  for (const removed of [
    'Route guidance verified',
    'trail, water and weather conditions vary; check locally',
    'TRAIL_CAVEATS.navigation',
    'stage-guide__verified',
  ]) {
    assert.ok(!stages.includes(removed), `${removed} is absent from Stage Guide UI`);
  }
});

test('ordinary Stops & places cards do not render provenance', () => {
  assert.ok(!stops.includes('Source: {stop.source.label}'));
  assert.ok(!stops.includes('Source: {place.source.label}'));
  assert.ok(!stops.includes('Information checked'));
  assert.ok(!stops.includes('formatVerifiedDate'));
});

test('official link labels are provider-aware without false STF claims', () => {
  assert.equal(officialInformationLabel('STF — Abisko Turiststation'), 'View official STF information');
  assert.equal(officialInformationLabel('STF Kiruna Hotel & Hostel'), 'View official STF information');
  assert.equal(
    officialInformationLabel('Nikkaluokta — accommodation'),
    'View official Nikkaluokta information',
  );
  assert.equal(officialInformationLabel('Naturkartan'), 'View official information');
  assert.match(stops, /officialInformationLabel\(stop\.source\.label\)/);
  assert.match(stops, /officialInformationLabel\(place\.source\.label\)/);
});

test('source URLs, metadata and lastVerified remain in the data', () => {
  assert.match(stopData, /url: 'https:\/\/www\.swedishtouristassociation\.com\/facilities\/stf-abisko/);
  assert.match(stopData, /label: 'Nikkaluokta — accommodation'/);
  assert.match(stopData, /lastVerified: FACTS_VERIFIED_ON/);
  assert.ok(Object.values(STAGE_GUIDES).every((guide) => guide.lastVerified && guide.sourceIds.length));
  assert.ok(OFF_ROUTE_PLACES.every((place) => place.source.url && place.source.lastVerified));
});

test('Data sources and credits remain available in Settings', () => {
  assert.match(settings, /title="Data sources"/);
  assert.match(settings, /Data sources &amp; credits/);
  assert.match(settings, /View sources and licences/);
  assert.match(settings, /<CreditsSheet/);
});
