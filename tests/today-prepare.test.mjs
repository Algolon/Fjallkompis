/**
 * Today — Prepare mode: the compact header Prepare | On route control, the
 * preparation dashboard with its Route hero, and the shared screen-header
 * rhythm (docs/proposals/today-prepare.md).
 *
 * Two layers, matching the repo's testing style:
 *   - pure-logic tests over the node-runnable modules (todayMode.mjs,
 *     packingModel.mjs packingSummary);
 *   - source-text contracts over the React surfaces (TodayScreen.tsx,
 *     TodayPrepare.tsx, ui.tsx) pinning the accessibility semantics, the
 *     deep-link payloads, the single-source aggregates and the owner
 *     decisions (manual switching only, no date logic, no schema bump).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEFAULT_TODAY_MODE,
  TODAY_MODE_KEY,
  normalizeTodayMode,
  readTodayMode,
  saveTodayMode,
} from '../src/utils/todayMode.mjs';
import { packingSummary } from '../src/utils/packingModel.mjs';
import { tripPlanSummary } from '../src/trip/tripModel.mjs';
import { SCHEMA_VERSION, defaultState } from '../src/utils/stateMigration.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const todayScreen = readFileSync(join(root, 'src/screens/TodayScreen.tsx'), 'utf8');
const prepare = readFileSync(join(root, 'src/components/TodayPrepare.tsx'), 'utf8');
const appTsx = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const uiTsx = readFileSync(join(root, 'src/components/ui.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');

// ---- Mode persistence (device UI preference, not schema state) --------------

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test('the remembered mode round-trips through storage', () => {
  const storage = fakeStorage();
  assert.equal(readTodayMode(storage), DEFAULT_TODAY_MODE);
  saveTodayMode(storage, 'prepare');
  assert.equal(readTodayMode(storage), 'prepare');
  saveTodayMode(storage, 'onroute');
  assert.equal(readTodayMode(storage), 'onroute');
});

test('corrupt or unknown stored values fall back to On route, never throw', () => {
  assert.equal(normalizeTodayMode('sideways'), 'onroute');
  assert.equal(normalizeTodayMode(null), 'onroute');
  assert.equal(normalizeTodayMode(42), 'onroute');
  const broken = {
    getItem: () => {
      throw new Error('private mode');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.equal(readTodayMode(broken), DEFAULT_TODAY_MODE);
  assert.doesNotThrow(() => saveTodayMode(broken, 'prepare'));
  const storage = fakeStorage({ [TODAY_MODE_KEY]: 'prepare' });
  saveTodayMode(storage, 'not-a-mode');
  assert.equal(readTodayMode(storage), 'prepare', 'invalid saves are ignored');
});

test('the mode lives OUTSIDE the versioned state blob (no schema bump)', () => {
  assert.equal(SCHEMA_VERSION, 6, 'Prepare mode must not bump the schema');
  assert.ok(
    !('todayMode' in defaultState('d1')),
    'todayMode is not a PersistentState field',
  );
  assert.ok(
    TODAY_MODE_KEY.startsWith('fjallkompis.'),
    'own namespaced key, separate from fjallkompis:state',
  );
});

// ---- packingSummary: the shared read-only aggregate -------------------------

const item = (over = {}) => ({
  id: 'x',
  label: 'Item',
  categoryId: 'clothing',
  quantity: 1,
  status: 'needed',
  essential: false,
  custom: false,
  ...over,
});

test('packingSummary counts item rows per status (not quantities)', () => {
  const s = packingSummary([
    item({ status: 'needed', quantity: 3 }),
    item({ status: 'ready' }),
    item({ status: 'ready' }),
    item({ status: 'packed' }),
  ]);
  assert.deepEqual(
    { total: s.total, needed: s.needed, ready: s.ready, packed: s.packed },
    { total: 4, needed: 1, ready: 2, packed: 1 },
  );
});

test('packingSummary: essentials not packed, weight × quantity, missing weights', () => {
  const s = packingSummary([
    item({ essential: true, status: 'needed' }),
    item({ essential: true, status: 'ready', weightGrams: 200, quantity: 2 }),
    item({ essential: true, status: 'packed', weightGrams: 500 }),
    item({ status: 'needed' }),
  ]);
  assert.equal(s.essentialNotPacked, 2, 'needed + ready essentials count; packed does not');
  assert.equal(s.weightedGrams, 900, 'weight multiplies quantity');
  assert.equal(s.weightMissing, 2, 'rows without a weight are counted, never summed as 0');
});

test('packingSummary: empty list is honest zeros (never “ready”)', () => {
  assert.deepEqual(packingSummary([]), {
    total: 0,
    needed: 0,
    ready: 0,
    packed: 0,
    essentialNotPacked: 0,
    weightedGrams: 0,
    weightMissing: 0,
  });
});

// ---- Compact header mode control --------------------------------------------

test('the mode control is the header accessory — no separate selector row', () => {
  // Semantic tabs live inside the ScreenHeader action slot…
  assert.match(
    todayScreen,
    /<ScreenHeader[\s\S]*?action=\{\s*<div\s+className="today-mode"\s+role="tablist"/,
    'tablist renders as the header accessory',
  );
  assert.match(todayScreen, /aria-label="Today view"/);
  assert.match(todayScreen, /aria-selected=\{mode === t\.id\}/);
  // …and the old full-width selector row is gone everywhere.
  assert.ok(!todayScreen.includes('today-seg'), 'full-width selector removed');
  assert.ok(!css.includes('today-seg'), 'full-width selector CSS removed');
  assert.ok(!todayScreen.includes('today-topline'), 'the old topline row is gone');
});

test('the control keeps full visible labels and stays text-only', () => {
  assert.match(todayScreen, /label: 'Prepare'/);
  assert.match(todayScreen, /label: 'On route'/);
  // No icons inside the compact tabs — they would force a wider control.
  const tablist = todayScreen.slice(
    todayScreen.indexOf('className="today-mode"'),
    todayScreen.indexOf('</ScreenHeader>'),
  );
  assert.ok(!/size=\{1[0-9]\}/.test(tablist), 'no icon components inside the tabs');
});

test('the capsule is compact liquid glass, not a flat opaque badge', () => {
  const capsule = css.slice(css.indexOf('.today-mode {'), css.indexOf('.today-mode__tab {'));
  // Same material system as the Journey/Tonight panes: translucent fill +
  // backdrop lift + hairline rim + top catch-light…
  assert.match(capsule, /background: var\(--glass-fill-light\)/, 'translucent glass fill');
  assert.match(capsule, /backdrop-filter: blur\(var\(--glass-blur\)\)/, 'backdrop lift');
  assert.match(capsule, /inset 0 0 0 var\(--glass-rim-w\) var\(--glass-rim\)/, 'hairline rim');
  assert.match(capsule, /inset 0 1px 0 var\(--glass-highlight\)/, 'top catch-light');
  // …but with control-scale shadows: the card-scale --glass-shadow (16px/40px
  // drop) would make a 36px control float like a card.
  assert.ok(!capsule.includes('var(--glass-shadow)'), 'no card-scale shadow on the capsule');
  assert.match(css, /@supports not \(backdrop-filter: blur\(1px\)\)[\s\S]{0,400}\.today-mode \{/,
    'no-blur fallback keeps the capsule readable');
});

test('compact tab geometry keeps a safe touch target', () => {
  const tab = css.slice(css.indexOf('.today-mode__tab {'), css.indexOf('.today-mode__tab:active'));
  assert.match(tab, /min-height: 32px/, 'visual height is capsule-compact');
  assert.match(tab, /font-size: 12px/, 'label size steps down with the capsule');
  // The visual capsule is 36px tall; each tab extends its hit area
  // vertically (never horizontally — the boundary between the two tabs
  // must stay exact) back to ~44px.
  assert.match(css, /\.today-mode__tab::after \{[^}]*inset: -6px 0/,
    'invisible vertical hit-area extension');
});

test('keyboard behaviour and remembered mode are unchanged', () => {
  assert.match(todayScreen, /tabIndex=\{mode === t\.id \? 0 : -1\}/, 'roving tabindex');
  assert.match(todayScreen, /ArrowRight/);
  assert.match(todayScreen, /ArrowLeft/);
  assert.match(todayScreen, /'Home'/);
  assert.match(todayScreen, /'End'/);
  assert.match(todayScreen, /readTodayMode\(window\.localStorage\)/);
  assert.match(todayScreen, /saveTodayMode\(window\.localStorage, next\)/);
  assert.match(todayScreen, /role="tabpanel"/);
  assert.match(todayScreen, /aria-labelledby="today-tab-prepare"/);
  assert.match(todayScreen, /aria-labelledby="today-tab-onroute"/);
});

test('switching is manual — never automatic', () => {
  for (const source of [todayScreen, prepare]) {
    assert.ok(!source.includes('Date.now'), 'no clock input');
    assert.ok(!source.includes('new Date'), 'no date input');
    assert.ok(!/todayIso|getCurrentPosition|geolocation/i.test(source), 'no date/GPS mode input');
  }
});

// ---- Shared screen-header rhythm --------------------------------------------

test('ScreenHeader owns the accessory slot and the fixed rhythm', () => {
  assert.match(uiTsx, /action\s*\?\s*<div className="screen-head-action">/);
  assert.match(css, /\.screen-head-row\s*\{[^}]*min-height:\s*44px/,
    'the title row has a fixed min-height so accessories never move the subtitle');
  assert.match(css, /\.screen-head-action\s*\{[^}]*max-height:\s*44px/,
    'accessories may not exceed the row rhythm');
});

test('every primary screen uses the shared header (Today includes its eyebrow)', () => {
  for (const screen of ['TodayScreen', 'MapScreen', 'StagesScreen', 'StopsScreen', 'ListsScreen', 'SettingsScreen']) {
    const src = readFileSync(join(root, `src/screens/${screen}.tsx`), 'utf8');
    assert.ok(src.includes('<ScreenHeader'), `${screen} renders ScreenHeader`);
  }
  assert.match(todayScreen, /eyebrow="Kungsleden"/, 'the trail eyebrow uses the standard slot');
  assert.ok(!todayScreen.includes('OnlineBadge'), 'the permanent Online badge is gone from Today');
  const srcFiles = ['src/components/ui.tsx', 'src/screens/TodayScreen.tsx'];
  for (const f of srcFiles) {
    assert.ok(!readFileSync(join(root, f), 'utf8').includes('useOnlineStatus'),
      `${f} no longer reads raw connectivity`);
  }
});

// ---- Route hero -------------------------------------------------------------

test('the Route hero has two explicit actions and no third click target', () => {
  const hero = prepare.slice(
    prepare.indexOf('className="prepare-hero"'),
    prepare.indexOf('</section>'),
  );
  assert.ok(prepare.includes('<section'), 'hero wrapper is a section, not a button');
  assert.match(hero, /onClick=\{\(\) => onNavigate\('map'\)\}/, 'Map action navigates to Map');
  assert.match(hero, /onClick=\{\(\) => onNavigate\('stages'\)\}/, 'Stages action navigates to Stages');
  assert.match(hero, /<Route size=\{15\}/, 'Map action reuses the route icon');
  assert.match(hero, /<Mountain size=\{15\}/, 'Stages action reuses the mountain icon');
  const buttons = (hero.match(/<button/g) ?? []).length;
  assert.equal(buttons, 2, 'exactly two interactive targets inside the hero');
  // Direction-aware title + stats from the itinerary (single source).
  assert.match(prepare, /itinerary\.startStopId/);
  assert.match(prepare, /itinerary\.statistics\.distanceKm/);
  assert.match(prepare, /\{stages\.length\} stages/);
});

// ---- Prepare dashboard: single sources, honest aggregation ------------------

test('Prepare reads only the shared aggregates — no duplicate models', () => {
  assert.match(prepare, /packingSummary\(state\.packing\)/);
  assert.match(prepare, /tripPlanSummary\(state\.trip\)/);
  assert.match(prepare, /useTrailReadiness\(\)/);
  assert.ok(!prepare.includes('.filter((i)'), 'no ad-hoc filtering over packing/trip items');
  assert.ok(!/setPackingStatus|updateTripItem|addTripItem|deleteTripItem|updatePackingItem/.test(prepare));
});

test('Trip documents never enter the Travel & stays counts', () => {
  const summary = tripPlanSummary([
    { kind: 'transport', status: 'needed' },
    { kind: 'stay', status: 'confirmed' },
    { kind: 'document', status: 'needed' },
  ]);
  assert.deepEqual(
    { total: summary.total, travel: summary.travelCount, stays: summary.stayCount },
    { total: 2, travel: 1, stays: 1 },
  );
  assert.ok(
    !/from '\.\.\/wallet|useWalletDocuments|attachmentIds|state\.wallet/.test(prepare),
    'Prepare never touches document state',
  );
});

test('every summary card is one button with a chevron and no nested controls', () => {
  const stack = prepare.slice(prepare.indexOf('</section>'));
  const buttons = stack.split('<button').slice(1);
  assert.equal(buttons.length, 3, 'packing, travel & stays, readiness');
  for (const b of buttons) {
    const inner = b.slice(0, b.indexOf('</button>'));
    assert.ok(!inner.includes('<button'), 'no nested interactive elements');
    assert.ok(inner.includes('today-action-card__chevron'), 'chevron affordance');
    assert.ok(inner.includes('aria-label='), 'sentence-level accessible name');
  }
});

test('Prepare cards deep-link to the existing destinations', () => {
  assert.ok(
    prepare.includes("onNavigate('checklist', { lists: { section: 'packing' } })"),
    'Packing → Lists → Packing',
  );
  assert.ok(
    prepare.includes("onNavigate('checklist', { lists: { section: 'trip' } })"),
    'Travel & stays → Lists → Trip',
  );
  assert.ok(
    prepare.includes("onNavigate('settings', { settings: { section: 'readiness' } })"),
    'Readiness → Settings, readiness section',
  );
  assert.match(appTsx, /initialSection=\{nav\.payload\?\.settings\?\.section \?\? null\}/);
});

// ---- Iconography ------------------------------------------------------------

test('card icons supplement visible labels, never replace them', () => {
  assert.match(prepare, /<Backpack size=\{14\}[^/]*aria-hidden \/> Packing list/);
  assert.match(prepare, /<CheckCircle2 size=\{14\}[^/]*aria-hidden \/> Trail readiness/);
  // Travel/stay counts reuse the Trip add-menu icon pair, text kept.
  assert.match(prepare, /<BusFront size=\{14\}[^/]*aria-hidden \/> \{trip\.travelCount\} travel/);
  assert.match(prepare, /<BedDouble size=\{14\}[^/]*aria-hidden \/> \{trip\.stayCount\}/);
  // Every icon in the Prepare view is decorative.
  const iconTags = prepare.match(/<[A-Z][A-Za-z]+ size=\{\d+\}[^>]*\/>/g) ?? [];
  for (const tag of iconTags) {
    assert.ok(tag.includes('aria-hidden'), `decorative icon: ${tag}`);
  }
});

// ---- Copy & honest aggregation ----------------------------------------------

test('empty and partial states are explicit and honest', () => {
  assert.ok(prepare.includes('No travel or stays added'));
  assert.ok(prepare.includes('No items yet'));
  assert.ok(prepare.includes('essentials still to pack'), 'calm pre-departure wording');
  // Partial pack weight is a lower bound — the exact Lists pill convention;
  // the accessible label spells the ≥ out.
  assert.match(prepare, /weightMissing > 0 \? '≥ ' : ''/);
  assert.match(prepare, /at least/, 'aria label explains the lower bound');
  assert.match(prepare, /packing\.weightedGrams > 0/, 'no weight line at 0');
  assert.ok(prepare.includes('Setup needed'), 'incomplete readiness is calm, not alarmist');
});

// ---- On route regressions ---------------------------------------------------

test('On route keeps its content, and Tonight pairs with the STF quick access', () => {
  for (const marker of [
    'className="hero"',
    'aria-label="Journey progress"',
    'today-action-card__label">Tonight',
    'Choose a stage',
  ]) {
    assert.ok(todayScreen.includes(marker), `On route keeps ${marker}`);
  }
  // Tonight and the membership quick access are SIBLINGS in one row wrapper.
  assert.match(todayScreen, /className="tonight-row"/);
  assert.match(todayScreen, /<MembershipQuickAccess \/>/);
  const row = todayScreen.slice(
    todayScreen.indexOf('className="tonight-row"'),
    todayScreen.indexOf('<MembershipQuickAccess />'),
  );
  const opens = (row.match(/<button/g) ?? []).length;
  const closes = (row.match(/<\/button>/g) ?? []).length;
  assert.equal(opens, closes, 'the Tonight button closes before the quick access starts — no nesting');
});
