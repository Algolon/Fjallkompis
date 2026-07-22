/**
 * Today — Prepare mode: the manual Prepare | On route selector and the
 * compact preparation dashboard (docs/proposals/today-prepare.md).
 *
 * Two layers, matching the repo's testing style:
 *   - pure-logic tests over the node-runnable modules (todayMode.mjs,
 *     packingModel.mjs packingSummary);
 *   - source-text contracts over the React surfaces (TodayScreen.tsx,
 *     TodayPrepare.tsx) pinning the accessibility semantics, the deep-link
 *     payloads, the single-source aggregates and the owner decisions
 *     (manual switching only, no date logic, no schema bump).
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

// ---- Mode selector: semantics and owner decisions ---------------------------

test('Today has a semantic Prepare | On route tablist with visible labels', () => {
  assert.match(todayScreen, /role="tablist"/);
  assert.match(todayScreen, /aria-label="Today view"/);
  assert.match(todayScreen, /role="tab"/);
  assert.match(todayScreen, /aria-selected=\{mode === t\.id\}/);
  // Visible text labels; icons are decorative supplements.
  assert.match(todayScreen, /label: 'Prepare'/);
  assert.match(todayScreen, /label: 'On route'/);
  assert.match(todayScreen, /<ModeIcon size=\{15\} strokeWidth=\{2\} aria-hidden \/>/);
  // Roving tabindex + arrow keys (selection follows focus).
  assert.match(todayScreen, /tabIndex=\{mode === t\.id \? 0 : -1\}/);
  assert.match(todayScreen, /ArrowRight/);
  assert.match(todayScreen, /ArrowLeft/);
  // Panels are associated with their tabs.
  assert.match(todayScreen, /role="tabpanel"/);
  assert.match(todayScreen, /aria-labelledby="today-tab-prepare"/);
  assert.match(todayScreen, /aria-labelledby="today-tab-onroute"/);
});

test('switching is manual and remembered — never automatic', () => {
  assert.match(todayScreen, /readTodayMode\(window\.localStorage\)/);
  assert.match(todayScreen, /saveTodayMode\(window\.localStorage, next\)/);
  // No date/GPS/phase input may pick the mode.
  for (const source of [todayScreen, prepare]) {
    assert.ok(!source.includes('Date.now'), 'no clock input');
    assert.ok(!source.includes('new Date'), 'no date input');
    assert.ok(!/todayIso|getCurrentPosition|geolocation/i.test(source), 'no date/GPS mode input');
  }
});

test('On route stays reachable and its content untouched inside its panel', () => {
  // The pre-existing On route blocks all still render (their own contracts
  // live in stage-highlights/route-direction tests; this pins presence).
  for (const marker of [
    'className="hero"',
    'aria-label="Journey progress"',
    'today-action-card__label">Tonight',
    'Choose a stage',
  ]) {
    assert.ok(todayScreen.includes(marker), `On route keeps ${marker}`);
  }
});

// ---- Prepare dashboard: single sources, honest aggregation ------------------

test('Prepare reads only the shared aggregates — no duplicate models', () => {
  assert.match(prepare, /packingSummary\(state\.packing\)/);
  assert.match(prepare, /tripPlanSummary\(state\.trip\)/);
  assert.match(prepare, /useTrailReadiness\(\)/);
  // No private re-derivations of status counts.
  assert.ok(!prepare.includes('.filter((i)'), 'no ad-hoc filtering over packing/trip items');
  // Read-only: the view must not import any store mutators.
  assert.ok(!/setPackingStatus|updateTripItem|addTripItem|deleteTripItem|updatePackingItem/.test(prepare));
});

test('Trip documents never enter the Travel & stays counts', () => {
  // tripPlanSummary itself excludes non transport/stay records…
  const summary = tripPlanSummary([
    { kind: 'transport', status: 'needed' },
    { kind: 'stay', status: 'confirmed' },
    { kind: 'document', status: 'needed' },
  ]);
  assert.deepEqual(
    { total: summary.total, travel: summary.travelCount, stays: summary.stayCount },
    { total: 2, travel: 1, stays: 1 },
  );
  // …and the card must not read wallet/document state at all.
  assert.ok(
    !/from '\.\.\/wallet|useWalletDocuments|attachmentIds|state\.wallet/.test(prepare),
    'Prepare never touches document state',
  );
});

test('every Prepare card is one button with a chevron and no nested controls', () => {
  const body = prepare.slice(prepare.indexOf('return ('));
  const buttons = body.split('<button').slice(1);
  assert.equal(buttons.length, 4, 'route, packing, travel & stays, readiness');
  for (const b of buttons) {
    const inner = b.slice(0, b.indexOf('</button>'));
    assert.ok(!inner.includes('<button'), 'no nested interactive elements');
    assert.ok(inner.includes('today-action-card__chevron'), 'chevron affordance');
    assert.ok(inner.includes('aria-label='), 'sentence-level accessible name');
  }
});

test('Prepare cards deep-link to the existing destinations', () => {
  assert.ok(prepare.includes("onNavigate('stages')"), 'Route → Stages');
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
  // App routes the one-shot settings payload (same pattern as the others).
  assert.match(appTsx, /initialSection=\{nav\.payload\?\.settings\?\.section \?\? null\}/);
});

test('empty and partial states are explicit and honest', () => {
  assert.ok(prepare.includes('No travel or stays added'));
  assert.ok(prepare.includes('No items yet'));
  // Partial pack weight is a lower bound (Lists convention), never bare 0 kg.
  assert.match(prepare, /weightMissing > 0 \? '≥ ' : ''/);
  assert.match(prepare, /weightedGrams > 0/);
  assert.ok(prepare.includes('Setup needed'), 'incomplete readiness is calm, not alarmist');
});
