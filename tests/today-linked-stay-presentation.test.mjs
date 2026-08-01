import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const onRoute = readFileSync(join(root, 'src/components/TodayOnRoute.tsx'), 'utf8');

test('a personal Stay linked to a route Stop reuses the canonical Tonight card', () => {
  assert.match(
    onRoute,
    /const overnightStayStopId =\s*overnightStay\?\.kind === 'stay'[\s\S]*overnightStay\.linkedPlaceId[\s\S]*STOPS_BY_ID\[overnightStay\.linkedPlaceId\]/,
  );
  assert.match(onRoute, /const renderedStopId = overnightStopId \?\? overnightStayStopId;/);
  assert.match(onRoute, /\{renderedStopId \? \(\s*<TonightCard stopId=\{renderedStopId\}/);
  assert.match(onRoute, /\) : overnightStay \? \(\s*<StayTonightCard title=\{overnightStay\.title\}/);
});

test('the canonical Tonight card uses compact STF names and keeps facilities', () => {
  const tonight = onRoute.slice(
    onRoute.indexOf('function TonightCard('),
    onRoute.indexOf('function StayTonightCard('),
  );
  assert.match(
    tonight,
    /stop\.type === 'village' \? stopShortName\(stop\) : `STF \$\{stopShortName\(stop\)\}`/,
  );
  assert.match(tonight, /aria-label=\{`Tonight: \$\{displayName\}/);
  assert.match(
    tonight,
    /className="today-action-card__title">\{displayName\}<\/span>/,
  );
  assert.match(tonight, /const facilities = collapsedFacilities\(stop, 5\);/);
  assert.match(tonight, /className="today-stop-facilities"/);
  assert.match(
    tonight,
    /<FacilityIcon\s+id=\{f\.id\}\s+size=\{15\}\s*\/>/,
  );
});
