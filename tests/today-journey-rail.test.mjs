import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'src/components/TodayOnRoute.tsx'), 'utf8');
const plannedJourney = source.slice(
  source.indexOf('function PlannedJourney('),
  source.indexOf('function PlannedDayChooser('),
);
const rail = plannedJourney.slice(
  plannedJourney.indexOf('<div className="journey"'),
  plannedJourney.indexOf('<div className="journey-legend'),
);

test('only the Journey heading opens the full planned-day chooser', () => {
  assert.match(plannedJourney, /className="journey-choose"/);
  assert.match(plannedJourney, /onClick=\{\(e\) => openChooser\(e\.currentTarget\)\}/);
  assert.ok(!rail.includes('openChooser'), 'day circles no longer open the chooser');
});

test('personal day circles select their day directly on Today', () => {
  assert.match(plannedJourney, /const \{ setCurrentPlannedDay \} = useStore\(\)/);
  assert.match(rail, /setCurrentPlannedDay\(d\.id\)/);
  assert.match(rail, /Show this day on Today\./);
});

test('the already shown non-preview day is a no-op to preserve its occurrence', () => {
  assert.match(rail, /const alreadyShown = status === 'current' && !previewing/);
  assert.match(rail, /if \(!alreadyShown\) setCurrentPlannedDay\(d\.id\)/);
  assert.match(rail, /Already shown on Today\./);
});

test('inactive Day plan keeps the canonical Stages navigation', () => {
  assert.match(rail, /if \(!journeyActive\) \{\s*onNavigate\('stages'\);\s*return;/s);
  assert.match(rail, /Opens Stages\./);
});
