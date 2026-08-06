/**
 * Plan — the preparation and personal-data dashboard (vNext experience
 * pass).
 *
 * Contract: the EXACT composition — Day plan (full-width soft hero),
 * Packing (full-width dashboard card), then Travel & stays and Wallet as
 * the compact lower row — with truthful summaries: every number restates an
 * EXISTING selector, absent weights say "not set" (never 0), the
 * essentials warning is conditional, and Travel and Wallet are SEPARATE
 * destinations that never render the same unfiltered page. No cloud, no
 * account, no schema change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plan = readFileSync(join(root, 'src/screens/PlanScreen.tsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
/** Negative wording checks apply to CODE and COPY, not to explanatory comments. */
const planCode = plan
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/^ \* .*$/gm, '');

test('the dashboard renders exactly Day plan, Packing, then the tile row', () => {
  const hero = plan.indexOf("onOpenSection('day')");
  const packing = plan.indexOf("onOpenSection('packing')");
  const travel = plan.indexOf("onOpenSection('travel')");
  const wallet = plan.indexOf("onOpenSection('wallet')");
  assert.ok(hero > 0 && packing > hero && travel > packing && wallet > travel,
    'order: Day plan, Packing, Travel & stays, Wallet');
  // Day plan and Packing are full-width members of the stack; Travel &
  // stays and Wallet sit inside the two-column tile row.
  assert.match(plan, /className="card today-glass plan-hero"/);
  assert.match(plan, /plan-card--packing/);
  const tilesBlock = plan.slice(plan.indexOf('className="plan-tiles"'));
  assert.ok(tilesBlock.includes("onOpenSection('travel')"), 'Travel tile in the row');
  assert.ok(tilesBlock.includes("onOpenSection('wallet')"), 'Wallet tile in the row');
  const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
  assert.match(css, /\.plan-tiles \{[^}]*grid-template-columns: 1fr 1fr/s);
});

test('the Day plan hero merges route identity and plan status, one action', () => {
  // Route identity from the active itinerary (flips with direction)…
  assert.match(plan, /itinerary\.startStopId/);
  assert.match(plan, /formatDistanceKm\(itinerary\.statistics\.distanceKm\)/);
  // …the plan status from existing state (the old Settings summary copy)…
  assert.ok(plan.includes('Not set up — plan your journey day by day'));
  // …one clear text action, and NO duplicated Map/Stages buttons (both are
  // primary tabs already).
  assert.ok(plan.includes('Open day plan'));
  const heroBlock = plan.slice(
    plan.indexOf("onOpenSection('day')"),
    plan.indexOf("onOpenSection('packing')"),
  );
  assert.ok(!/>\s*Map\s*</.test(heroBlock), 'no Map button on the hero');
  assert.ok(!/>\s*Stages\s*</.test(heroBlock), 'no Stages button on the hero');
});

test('Packing restates packingSummary only — no invented metrics', () => {
  assert.match(plan, /packingSummary\(state\.packing\)/);
  // Row-count semantics: Needed / Ready / Packed (+ Worn only when worn).
  assert.match(plan, /\{packing\.needed\} Needed/);
  assert.match(plan, /\{packing\.ready\} Ready/);
  assert.match(plan, /\{packing\.packed\} Packed/);
  assert.match(plan, /packing\.worn > 0 \?/);
  // The two conceptual columns exist.
  assert.match(plan, /plan-packing__cols/);
  assert.ok(plan.includes('>Progress<') && plan.includes('>Weight<'));
});

test('weights follow the Lists convention: lower bounds and no false zeroes', () => {
  // "≥" while any carried row lacks a weight; nothing shown as 0.
  assert.match(
    plan,
    /packing\.weightedGrams > 0\s*\n?\s*\? `\$\{packing\.weightMissing > 0 \? '≥ ' : ''\}\$\{formatGrams\(packing\.weightedGrams\)\}`\s*\n?\s*: null/,
  );
  assert.ok(
    plan.includes("packWeight ? `Pack ${packWeight}` : 'Not set'"),
    'absent weight says Not set — never 0',
  );
  // Worn weight only exists when worn units exist; same lower-bound rule.
  assert.match(plan, /packing\.wornWeightedGrams > 0/);
  assert.match(plan, /wornWeightMissing > 0 \? '≥ '/);
  // The accessible name spells the bound out.
  assert.match(plan, /at least/);
});

test('the essentials warning is conditional and uses the existing concept', () => {
  // essentialNotPacked is packingSummary's EXISTING definition; the warning
  // renders only when it is non-zero — no reserved dead space, no new
  // classification.
  assert.match(plan, /packing\.essentialNotPacked > 0 \? \(/);
  assert.match(plan, /essential\s*\n?\s*\{packing\.essentialNotPacked === 1 \? '' : 's'\} still to pack/);
  assert.ok(!plan.includes('essentialsMissing'), 'no parallel concept');
});

test('empty states support the user instead of showing zeros', () => {
  assert.ok(
    plan.includes(
      'Build your packing list and track what is ready, packed and\n              carried.',
    ) || /Build your packing list and track what is ready, packed and\s+carried\./.test(plan),
  );
  assert.match(plan, /Organize your stays and transport here\./);
  assert.match(plan, /Add and organize your bookings, tickets and other travel\s+documents\./);
});

test('the header says where the data lives — and no cloud or account exists', () => {
  assert.match(plan, /stored on this\s+device/);
  for (const forbidden of [/cloud/i, /account/i, /\bsync/i, /sign.?in/i, /log.?in/i]) {
    assert.ok(!forbidden.test(planCode), `no ${forbidden} concept on Plan`);
  }
});

test('Travel & stays and Wallet are separate destinations with distinct views', () => {
  // Four distinct sections, all rendered by the shell.
  assert.match(app, /case 'day':[\s\S]*?<PlanDayScreen/);
  assert.match(app, /case 'packing':[\s\S]*?<PlanPackingScreen/);
  assert.match(app, /case 'travel':[\s\S]*?<PlanTravelScreen/);
  assert.match(app, /case 'wallet':[\s\S]*?<PlanWalletScreen/);
  const planCase = app.slice(app.indexOf("case 'plan':"), app.indexOf("case 'settings':"));
  const shells = planCase.match(/<SectionShell label="Plan"/g) ?? [];
  assert.equal(shells.length, 4, 'all four sections carry the back affordance');
  // The two views are purposeful filters over the same stores — the shared
  // TripView renders the trip ITEMS for travel and the DOCUMENTS for
  // wallet, never one unfiltered page twice.
  assert.match(plan, /<TripView\s*\n?\s*view="travel"/);
  assert.match(plan, /<TripView view="wallet" \/>/);
  const tripView = readFileSync(join(root, 'src/components/TripView.tsx'), 'utf8');
  assert.match(tripView, /view: 'travel' \| 'wallet'/);
});

test('the sections reuse the existing views and state unchanged', () => {
  assert.match(plan, /<DayPlanCard onNavigate=\{onNavigate\} \/>/);
  assert.match(plan, /<PackingView \/>/);
  // Travel's outward link: a linked stay's View place goes back to the
  // dossier (Guide → Stops & places) with the same payload as before.
  assert.match(plan, /onNavigate\('huts', \{ placeId \}\)/);
  // Wallet summary reads the existing wallet hook; membership presence uses
  // the existing category, never a new classification.
  assert.match(plan, /useWalletDocuments\(\)/);
  assert.match(plan, /d\.category === 'membership'/);
});

test('Travel deep-links arrive as one-shot launches (item, stay, transport)', () => {
  assert.match(plan, /if \(link\?\.tripItemId\) return \{ kind: 'item' as const, itemId: link\.tripItemId \};/);
  assert.match(plan, /kind: 'add-stay' as const, placeId: link\.trackStayPlaceId/);
  assert.match(plan, /kind: 'add-transport' as const, entryId: link\.addTransportEntryId/);
});
