/**
 * Guide — the read-only trail dossier's home (vNext experience pass).
 *
 * Contract: EXACTLY four primary tiles (Stages & highlights, Stops &
 * places, Shops & supplies, Transport) in a 2×2 grid — no Sources &
 * credits tile (Settings owns that), no standalone Highlights tile
 * (highlights live inside the stages, and the stage screen says so). Each
 * tile carries an icon, a title and one descriptive sentence. The data
 * entrance stays the content boundary, the header makes no completeness or
 * reviewed-on claim, and browsing writes nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(join(root, 'src/screens/GuideScreen.tsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

test('the Guide home is exactly the five dossier tiles', () => {
  // Four curated categories in the 2×2 grid, plus the full-width Weather
  // tile (prototype — docs/proposals/weather-section.md): read-only trail
  // reference whose facts are refreshable SMHI forecasts saved on-device.
  const tiles = [...guide.matchAll(/section: '(\w+)',\n\s+title: '([^']+)'/g)].map(
    (m) => ({ section: m[1], title: m[2] }),
  );
  assert.deepEqual(tiles, [
    { section: 'stages', title: 'Stages & highlights' },
    { section: 'stops', title: 'Stops & places' },
    { section: 'shops', title: 'Shops & supplies' },
    { section: 'transport', title: 'Transport' },
    { section: 'weather', title: 'Weather' },
  ]);
  // Retired home entries: Sources & credits belongs to Settings; the
  // standalone Highlights row folded into Stages & highlights.
  assert.ok(!guide.includes('Sources & credits'), 'no sources tile');
  assert.ok(!guide.includes('CreditsSheet'), 'no credits sheet on the home');
  assert.ok(!/title: 'Highlights/.test(guide), 'no standalone highlights tile');
});

test('each tile has an icon, a title and one descriptive sentence', () => {
  assert.match(guide, /guide-tile__icon/);
  assert.match(guide, /guide-tile__title/);
  assert.match(guide, /guide-tile__sub/);
  for (const sub of [
    'Day guides, terrain, viewpoints and side trips',
    'Huts, facilities and places near the route',
    'Food, fuel and resupply along the trail',
    'Buses, boats and trains to and from the trail',
    'Saved route forecast for offline use',
  ]) {
    assert.ok(guide.includes(sub), `description present: ${sub}`);
  }
  // A 2×2 grid, not Settings-style rows; the odd fifth tile (Weather)
  // spans the full width instead of leaving a half-filled third row.
  assert.match(guide, /className="guide-grid"/);
  assert.match(css, /\.guide-grid \{[^}]*grid-template-columns: 1fr 1fr/s);
  assert.match(css, /\.guide-tile--wide \{[^}]*grid-column: 1 \/ -1/s);
});

test('the introduction claims scope, never completeness', () => {
  assert.match(guide, /Trail information for preparing and hiking/);
  assert.ok(!/all (the )?information you need/i.test(guide), 'no absolute claim');
  assert.match(guide, /eyebrow="Trail dossier"/);
});

test('Stages & highlights genuinely reaches the highlights', () => {
  // The tile opens the canonical stage experience…
  assert.match(app, /case 'stages':[\s\S]*?<StagesScreen/);
  const stages = readFileSync(join(root, 'src/screens/StagesScreen.tsx'), 'utf8');
  // …whose header carries the same name, and whose stage cards render the
  // existing per-stage disclosure. The header no longer LISTS the highlight
  // kinds: the intro was three sentences long, and the cards below name what
  // they contain.
  assert.match(stages, /title="Stages & highlights"/);
  assert.match(stages, /HighlightsAndDetours/);
});

test('every Guide section is rendered by the shell (nothing is orphaned)', () => {
  assert.match(app, /case 'stops':[\s\S]*?<StopsScreen/);
  assert.match(app, /case 'shops':[\s\S]*?<GuideShopsScreen/);
  assert.match(app, /case 'transport':[\s\S]*?<GuideTransportScreen/);
  assert.match(app, /case 'weather':[\s\S]*?<GuideWeatherScreen/);
  const guideCase = app.slice(app.indexOf("case 'guide':"), app.indexOf("case 'plan':"));
  const shells = guideCase.match(/<SectionShell label="Guide"/g) ?? [];
  assert.equal(shells.length, 5, 'all five sections carry the back affordance');
});

test('Guide reads through the content boundary and shows the honest edition', () => {
  assert.match(
    guide,
    /from '\.\.\/trail\/activeTrailContent'/,
    'the content boundary is the data entrance',
  );
  assert.ok(!guide.includes("from '../data/"), 'no direct data imports');
  assert.match(guide, /trailDossierView\(\)/);
  // The edition marker is no longer RENDERED on the Guide home: it is
  // edition metadata a hiker cannot act on, and it sat alone below the grid.
  // The value is unchanged and still reported through Settings → Data
  // sources (the diagnostic summary prints Content version).
  assert.ok(
    !/contentVersionLabel/.test(guide),
    'the edition marker is not shown on the dossier home',
  );
  assert.ok(!/BookOpen/.test(guide), 'and its book glyph is gone with it');
  const settings = readFileSync(join(root, 'src/screens/SettingsScreen.tsx'), 'utf8');
  assert.match(
    settings,
    /content: `\$\{dossier\.contentVersion\}/,
    'the content version is still reported where technical facts belong',
  );
  assert.ok(!guide.includes('fullyReviewedOn'), 'no reviewed-on rendering');
  assert.ok(!/reviewed on/i.test(guide), 'no textual review claim');
  assert.ok(!/up to date/i.test(guide), 'no freshness claim');
});

test('browsing the Guide home writes nothing', () => {
  assert.ok(!guide.includes('useStore'), 'the home does not even read the store');
  assert.ok(!guide.includes('localStorage'), 'no direct storage access');
  assert.ok(!guide.includes('indexedDB'), 'no direct storage access');
});

test('Guide keeps its personal actions cross-tab, not in-dossier', () => {
  // Transport's Add to Trip / View in Trip navigate to Plan → Travel &
  // stays with a one-shot launch payload — the dossier itself stays
  // read-only.
  assert.match(
    guide,
    /onNavigate\('plan', \{ lists: \{ addTransportEntryId: entryId \} \}\)/,
  );
  assert.match(guide, /onNavigate\('plan', \{ lists: \{ tripItemId: itemId \} \}\)/);
});
