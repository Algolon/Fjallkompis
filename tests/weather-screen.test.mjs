/**
 * Guide → Weather (prototype) — the screen's structural contracts, asserted
 * against the source the app ships (same style as guide-screen.test.mjs):
 *
 *  1. the section rides the canonical Guide routing (#/guide/weather);
 *  2. locations come from the ACTIVE ITINERARY's ordered stops (verified
 *     coordinates, direction-aware, canonical data never duplicated);
 *  3. the screen owns its freshness/offline copy — the honest states exist;
 *  4. Today stays weather-free (explicit prototype constraint);
 *  5. storage stays isolated: no weather in the PersistentState blob, in
 *     backup/export, or touched directly by components;
 *  6. icons are local Lucide glyphs — no remote weather assets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const weather = read('src/screens/WeatherScreen.tsx');
const app = read('src/App.tsx');
const css = read('src/styles/global.css');

test('#/guide/weather is a canonical destination and the shell renders it', () => {
  const routes = read('src/navigation/routes.mjs');
  assert.match(routes, /'stages', 'stops', 'shops', 'transport', 'weather'/);
  assert.match(app, /case 'weather':[\s\S]*?<GuideWeatherScreen \/>/);
  assert.match(app, /<SectionShell label="Guide" onBack=\{\(\) => openSection\('guide', null\)\}>\s*<GuideWeatherScreen/);
});

test('weather locations are the itinerary stops — verified data, walking order', () => {
  // The screen maps itinerary.orderedStops and rides the GPX waypoint
  // elevations; it never declares its own coordinates.
  assert.match(weather, /itinerary\.orderedStops\.map/);
  assert.match(weather, /WAYPOINT_BY_ID\[HUT_TO_WAYPOINT\[stop\.id\]\]/);
  assert.ok(!/lat:\s*\d/.test(weather), 'no hand-entered latitudes');
  assert.ok(!/lon:\s*\d/.test(weather), 'no hand-entered longitudes');
  // Direction-awareness is inherited from the one itinerary authority the
  // screen reads (useStore().itinerary → getActiveItinerary): that
  // stopOrder exactly reverses between directions is proven end-to-end
  // against the real dataset in tests/itinerary.test.mjs — the screen must
  // simply keep reading orderedStops (asserted above) to inherit it.
  assert.match(weather, /const \{ itinerary, state \} = useStore\(\)/);
});

test('the screen owns every honest data state the brief demands', () => {
  for (const copy of [
    'Offline forecast',
    'Update',
    'Updating…',
    'Updated',
    'Forecast updated',
    'Download forecast',
    'Downloading forecast…',
    'No forecast saved yet',
    'No offline forecast saved',
    'No saved forecast for this date',
    'No connection — the saved forecast still works.',
    'Your previously saved forecast is still available',
  ]) {
    assert.ok(weather.includes(copy), `state copy present: ${copy}`);
  }
  // The stale wording lives in the tested model, not ad hoc in the screen.
  assert.match(weather, /freshnessNotice/);
  // False precision is named, quietly, on the screen itself.
  assert.match(weather, /Route forecasts, saved for offline use\./);
  assert.match(
    weather,
    /Mountain\s+weather can vary quickly between forecast locations and with\s+elevation/,
  );
  // Provider credit (SMHI open data) is visible.
  assert.match(weather, /SMHI/);
});

test('sync status stays compact: secondary Update with a saved forecast, primary CTA only when empty', () => {
  // With a snapshot the action is the compact secondary button (primary
  // fill only once the snapshot is genuinely stale)…
  assert.match(
    weather,
    /className=\{`btn weather-sync__btn\$\{\s*level === 'stale' \? ' btn-primary' : ''\s*\}`\}/,
  );
  // …and the full-width primary CTA exists ONLY in the no-snapshot branch.
  const ctas = weather.match(/btn btn-primary btn-block/g) ?? [];
  assert.equal(ctas.length, 1, 'exactly one full-width primary CTA');
  assert.match(weather, /btn btn-primary btn-block weather-sync__cta/);
  // The transient success confirmation clears itself — no permanent
  // "Forecast updated" sentence; the announcement is screen-reader-only.
  assert.match(weather, /setTimeout\(\(\) => setPhase\(\{ kind: 'idle' \}\), 4000\)/);
  assert.match(weather, /className="sr-only" role="status"/);
  // A duplicate refresh is impossible while one runs.
  assert.match(weather, /disabled=\{updating \|\| !online\}/);
});

test('the date strip is sticky, safe-area aware, and keeps the selected day in view', () => {
  const dates = css.slice(css.indexOf('.weather-dates {'), css.indexOf('.weather-date-chip {'));
  assert.match(dates, /position: sticky/);
  assert.match(dates, /top: var\(--safe-top\)/);
  // Legible over scrolling cards: an opaque fallback always, translucency
  // only where backdrop blur is actually supported.
  assert.match(dates, /background: var\(--section-surface, var\(--stone-bg\)\)/);
  assert.match(dates, /@supports \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\)/);
  // The selected chip is brought into view when the active day changes.
  assert.match(weather, /scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\)/);
  assert.match(weather, /\[activeDate\]\);/);
});

test('location rows carry a rotating disclosure affordance', () => {
  assert.match(weather, /className="weather-row__chev"/);
  assert.match(
    css,
    /\.weather-row__head\[aria-expanded='true'\] \.weather-row__chev \{\s*transform: rotate\(180deg\);/,
  );
});

test('a failed update keeps rendering the previous snapshot', () => {
  // The update path replaces state ONLY from a successfully saved snapshot;
  // the catch path records failure without touching `snapshot`.
  const doUpdate = weather.slice(
    weather.indexOf('const doUpdate'),
    weather.indexOf('const updating'),
  );
  assert.match(doUpdate, /await replaceWeatherSnapshot\(next\);\s*setSnapshot\(next\)/);
  assert.match(doUpdate, /catch[\s\S]*setPhase\(\{ kind: 'failed'/);
  assert.ok(
    !/catch[\s\S]*setSnapshot/.test(doUpdate),
    'the catch path never touches the snapshot',
  );
});

test('Today stays weather-free (explicit prototype constraint)', () => {
  for (const file of [
    'src/screens/TodayScreen.tsx',
    'src/components/TodayHero.tsx',
    'src/components/TodayOnRoute.tsx',
  ]) {
    assert.ok(
      !/weather/i.test(read(file)),
      `${file} mentions weather — Today must keep its compact contract`,
    );
  }
});

test('weather storage stays isolated from the state blob and from backups', () => {
  // Not in the persisted localStorage state or its migrations…
  assert.ok(!/weather/i.test(read('src/utils/stateMigration.mjs')));
  assert.ok(!/weather/i.test(read('src/utils/storage.ts')));
  assert.ok(!/[wW]eather/.test(read('src/store/AppStore.tsx')));
  // …not in the complete backup…
  assert.ok(!/weather/i.test(read('src/backup/completeBackup.mjs')));
  assert.ok(!/weather/i.test(read('src/backup/completeBackupArchive.mjs')));
  // …and components go through the adapter, never IndexedDB directly.
  assert.ok(!/indexedDB/.test(weather));
  assert.match(weather, /from '\.\.\/weather\/weatherStore\.mjs'/);
  // Its own database, separate from the wallet's.
  const store = read('src/weather/weatherStore.mjs');
  assert.match(store, /fjallkompis-weather/);
});

test('icons are local (Lucide) — no remote weather assets', () => {
  assert.match(weather, /from 'lucide-react'/);
  assert.ok(!/img src=|http.*\.(png|svg|gif)/.test(weather), 'no remote imagery');
  // The provider link is the single allowed external reference.
  const externals = weather.match(/https?:\/\/[^\s'"]+/g) ?? [];
  assert.deepEqual(externals, ['https://www.smhi.se']);
});

test('Settings carries ONE compact weather readiness fact, nothing more', () => {
  const settings = read('src/screens/SettingsScreen.tsx');
  assert.match(settings, /Saved through/);
  assert.match(settings, /'Not saved'/);
  assert.ok(
    !settings.includes('Update forecast'),
    'the update action lives in Guide → Weather only',
  );
  assert.ok(
    !settings.includes('freshnessNotice'),
    'detailed freshness lives in Guide → Weather only',
  );
});

test('the date strip and rows use the shared design primitives', () => {
  assert.match(weather, /className="chip weather-date-chip"/);
  assert.match(weather, /aria-pressed=\{date === activeDate\}/);
  assert.match(css, /\.weather-dates \{[^}]*overflow-x: auto/s);
  assert.match(css, /\.weather-row\b/);
  // The rows are cards in the app's own visual language.
  assert.match(weather, /className="card weather-row"/);
});
