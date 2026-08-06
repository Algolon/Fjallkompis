/**
 * Today — the operational centre destination (vNext experience pass).
 *
 * The Prepare mode is REMOVED: Today no longer owns preparation (that
 * dashboard lives on Plan). These tests fence the removal — no mode
 * control, no preparation interface, no per-device mode preference — while
 * pinning what must SURVIVE: the operational day view for every day shape,
 * Stage guide, View route, Tonight and the membership quick access.
 *
 * The behavioural packingSummary / tripPlanSummary suites moved here from
 * the retired tests/today-prepare.test.mjs unchanged: the Plan dashboard
 * now renders exactly these aggregates, so their semantics are what keeps
 * its numbers truthful.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { packingSummary } from '../src/utils/packingModel.mjs';
import { tripPlanSummary } from '../src/trip/tripModel.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const todayScreen = readFileSync(join(root, 'src/screens/TodayScreen.tsx'), 'utf8');
const todayOnRoute = readFileSync(join(root, 'src/components/TodayOnRoute.tsx'), 'utf8');

// ---- The Prepare mode is gone -----------------------------------------------

test('Today has no Prepare mode, mode control or mode preference', () => {
  assert.ok(!todayScreen.includes('MODE_TABS'), 'no mode tab model');
  assert.ok(!todayScreen.includes('today-mode'), 'no mode capsule markup');
  assert.ok(!/role="tablist"/.test(todayScreen), 'no header tablist');
  assert.ok(!/Prepare/.test(todayScreen), 'no Prepare label or copy');
  assert.ok(!todayScreen.includes('todayMode'), 'no per-device mode preference');
  assert.ok(!todayScreen.includes('localStorage'), 'nothing to remember');
  assert.ok(
    !existsSync(join(root, 'src/components/TodayPrepare.tsx')),
    'the Prepare dashboard module is gone',
  );
  assert.ok(
    !existsSync(join(root, 'src/utils/todayMode.mjs')),
    'the mode preference module is gone',
  );
});

test('no preparation-management interface remains on Today', () => {
  for (const forbidden of ['packingSummary', 'tripPlanSummary', 'useTrailReadiness']) {
    assert.ok(!todayScreen.includes(forbidden), `Today does not read ${forbidden}`);
    assert.ok(!todayOnRoute.includes(forbidden), `On route does not read ${forbidden}`);
  }
});

test('the operational day view always renders, for every day shape', () => {
  // One screen, one view: the day resolution and the arrival-stay fallback
  // are untouched; TodayOnRoute itself covers hiking/travel/rest days,
  // before/after the plan, and the no-plan stage view.
  assert.match(todayScreen, /<TodayOnRoute/);
  assert.match(todayScreen, /resolveTodayArrivalStay\(/);
  assert.match(todayScreen, /eyebrow="Kungsleden"/);
  assert.match(todayScreen, /title="Today"/);
  assert.match(todayScreen, /Your day at a glance\. Everything here works offline\./);
});

test('Stage guide and View route stay on the day hero', () => {
  assert.match(todayOnRoute, /> Stage guide\s*<\/button>/);
  assert.match(todayOnRoute, /View route/);
});

test('On route keeps its content, and Tonight pairs with the STF quick access', () => {
  for (const marker of [
    'className="hero"',
    'aria-label="Journey progress"',
    'tonight-card__label">Tonight',
    'Choose a stage',
  ]) {
    assert.ok(todayOnRoute.includes(marker), `On route keeps ${marker}`);
  }
  // Tonight and the membership quick access are SIBLINGS in one row wrapper.
  assert.match(todayOnRoute, /className="tonight-row"/);
  assert.match(todayOnRoute, /<MembershipQuickAccess \/>/);
  const row = todayOnRoute.slice(
    todayOnRoute.indexOf('className="tonight-row"'),
    todayOnRoute.indexOf('<MembershipQuickAccess />'),
  );
  const opens = (row.match(/<button/g) ?? []).length;
  const closes = (row.match(/<\/button>/g) ?? []).length;
  assert.equal(opens, closes, 'the Tonight button closes before the quick access starts — no nesting');
});

test('every content screen uses the shared header; the Map stays a workspace', () => {
  for (const screen of ['TodayScreen', 'StagesScreen', 'StopsScreen', 'GuideScreen', 'PlanScreen', 'SettingsScreen']) {
    const src = readFileSync(join(root, `src/screens/${screen}.tsx`), 'utf8');
    assert.ok(src.includes('<ScreenHeader'), `${screen} renders ScreenHeader`);
  }
  const map = readFileSync(join(root, 'src/screens/MapScreen.tsx'), 'utf8');
  assert.ok(!map.includes('<ScreenHeader'), 'the Map workspace has no header chrome');
  assert.match(map, /<h1 className="sr-only">Map<\/h1>/, 'but keeps an accessible name');
});

// ---- packingSummary — the aggregate behind the Plan Packing dashboard -------

const item = (over = {}) => ({
  id: 'x',
  label: 'Item',
  categoryId: 'clothing',
  quantity: 1,
  status: 'needed',
  essential: false,
  wornQuantity: 0,
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
    worn: 0,
    fullyWorn: 0,
    essentialNotPacked: 0,
    weightedGrams: 0,
    weightMissing: 0,
    wornWeightedGrams: 0,
    wornWeightMissing: 0,
  });
});

test('packingSummary: fully worn rows leave the status buckets; partial rows stay', () => {
  const s = packingSummary([
    item({ status: 'needed' }),
    // Fully worn — outside the backpack flow entirely.
    item({ status: 'ready', wornQuantity: 1 }),
    // Partially worn — 1 worn, 2 packed: a backpack row AND a worn row.
    item({ quantity: 3, status: 'packed', wornQuantity: 1 }),
    // Partially worn — 1 worn, 4 needed.
    item({ quantity: 5, status: 'needed', wornQuantity: 1 }),
    item({ status: 'packed' }),
  ]);
  assert.deepEqual(
    {
      total: s.total,
      needed: s.needed,
      ready: s.ready,
      packed: s.packed,
      worn: s.worn,
      fullyWorn: s.fullyWorn,
    },
    { total: 5, needed: 2, ready: 0, packed: 2, worn: 3, fullyWorn: 1 },
    'worn counts ANY worn unit (overlapping); fullyWorn rows leave needed/ready/packed',
  );
});

test('packingSummary: weight splits per unit — worn share never in the backpack', () => {
  const s = packingSummary([
    // 3 shirts à 150 g, 1 worn: 150 g worn, 300 g backpack.
    item({ quantity: 3, status: 'packed', wornQuantity: 1, weightGrams: 150 }),
    // 5 socks à 60 g, 1 worn, 4 ready: 60 g worn, 240 g backpack.
    item({ quantity: 5, status: 'ready', wornQuantity: 1, weightGrams: 60 }),
    // Fully worn boots à 1400 g: all worn, nothing in the backpack.
    item({ wornQuantity: 1, weightGrams: 1400 }),
    // Un-worn row without a weight: missing on the backpack side only.
    item({ status: 'needed' }),
    // Partially worn row without a weight: missing on BOTH sides.
    item({ quantity: 7, status: 'needed', wornQuantity: 1 }),
  ]);
  assert.equal(s.weightedGrams, 540, 'backpack weight = weight × carried units');
  assert.equal(s.wornWeightedGrams, 1610, 'worn weight = weight × worn units');
  assert.equal(s.weightMissing, 2, 'rows with carried units and no weight');
  assert.equal(s.wornWeightMissing, 1, 'rows with worn units and no weight');
});

test('packingSummary: essential accounting follows the carried units', () => {
  const s = packingSummary([
    // Fully worn essential — on the body, accounted for.
    item({ essential: true, wornQuantity: 1 }),
    // Partially worn essential with carried units still needed — warns.
    item({ essential: true, quantity: 5, status: 'needed', wornQuantity: 1 }),
    // Partially worn essential whose carried units are packed — no warning.
    item({ essential: true, quantity: 3, status: 'packed', wornQuantity: 1 }),
    item({ essential: true, status: 'needed' }),
  ]);
  assert.equal(s.essentialNotPacked, 2, 'worn-on-body and packed-spares essentials are handled');
});

// ---- tripPlanSummary — the aggregate behind the Travel & stays tile ----------

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
});
