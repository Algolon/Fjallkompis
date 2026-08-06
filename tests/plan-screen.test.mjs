/**
 * Plan — the home of personal preparation (vNext).
 *
 * Contract: the personal capabilities (day plan, trip/logistics, packing,
 * wallet/documents) are each reachable, only EXISTING personal state is
 * read (no new derivation layer, no score), the header is honest about
 * where the data lives, and no cloud or account concept appears.
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

test('the Plan home indexes every personal capability', () => {
  for (const title of [
    "title: 'Day plan'",
    "title: 'Trip & logistics'",
    "title: 'Packing'",
    "title: 'Wallet & documents'",
  ]) {
    assert.ok(plan.includes(title), `index row exists: ${title}`);
  }
});

test('every Plan section is rendered by the shell (nothing is orphaned)', () => {
  assert.match(app, /case 'day':[\s\S]*?<PlanDayScreen/);
  assert.match(app, /case 'trip':[\s\S]*?<PlanTripScreen/);
  assert.match(app, /case 'packing':[\s\S]*?<PlanPackingScreen/);
  const planCase = app.slice(app.indexOf("case 'plan':"), app.indexOf("case 'settings':"));
  const shells = planCase.match(/<SectionShell label="Plan"/g) ?? [];
  assert.equal(shells.length, 3, 'all three sections carry the back affordance');
});

test('the header says where the data lives — and no cloud or account exists', () => {
  assert.match(
    plan,
    /stored on this\s+device/,
    'the on-device promise is the header',
  );
  for (const forbidden of [/cloud/i, /account/i, /\bsync/i, /sign.?in/i, /log.?in/i]) {
    assert.ok(!forbidden.test(planCode), `no ${forbidden} concept on Plan`);
  }
});

test('the readiness summary restates EXISTING facts — no new model, no score', () => {
  // Day plan summary: the same copy Settings used to show.
  assert.ok(plan.includes('Not set up — plan your journey day by day'));
  // Packing summary: the shared read-only aggregate.
  assert.match(plan, /packingSummary\(state\.packing\)/);
  // Trip summary: a plain count of saved items.
  assert.match(plan, /state\.trip\.length/);
  // No generic score/gamification and no new derivation layer.
  assert.ok(!/score/i.test(planCode), 'no score');
  assert.ok(!/percent/i.test(planCode), 'no derived percentage on the home');
});

test('the sections reuse the existing views and state unchanged', () => {
  assert.match(plan, /<DayPlanCard onNavigate=\{onNavigate\} \/>/);
  assert.match(plan, /<TripView\s*\n?\s*launch=\{launch\}/);
  assert.match(plan, /<PackingView \/>/);
  // Trip's outward link: a linked stay's View place goes back to the
  // dossier (Guide → Stops & places) with the same payload as before.
  assert.match(plan, /onNavigate\('huts', \{ placeId \}\)/);
});

test('Trip deep-links arrive as one-shot launches (item, stay, transport)', () => {
  assert.match(plan, /if \(link\?\.tripItemId\) return \{ kind: 'item', itemId: link\.tripItemId \};/);
  assert.match(plan, /kind: 'add-stay', placeId: link\.trackStayPlaceId/);
  assert.match(plan, /kind: 'add-transport', entryId: link\.addTransportEntryId/);
  // Read once at mount — a fresh visit (no payload) opens the plain Trip.
  assert.match(plan, /useState<TripLaunch \| null>\(\(\) =>\s*\n?\s*initialTripLaunchFor\(deepLink\),?\s*\n?\s*\)/);
});
