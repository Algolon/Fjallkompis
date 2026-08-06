/**
 * Guide — the read-only trail dossier's home (vNext).
 *
 * Contract: every dossier category is reachable from the index, the data
 * entrance is ACTIVE_TRAIL_CONTENT (the application-facing content
 * boundary), the header makes no global reviewed-on claim, and browsing
 * writes nothing — the Guide home does not even import the store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(join(root, 'src/screens/GuideScreen.tsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');

test('the Guide home indexes every dossier category', () => {
  for (const title of [
    "title: 'Stages'",
    "title: 'Stops & places'",
    "title: 'Highlights & detours'",
    "title: 'Shops & resupply'",
    "title: 'Transport'",
    "title: 'Sources & credits'",
  ]) {
    assert.ok(guide.includes(title), `index row exists: ${title}`);
  }
  // Sources open the existing CreditsSheet — one implementation, no copy.
  assert.match(guide, /<CreditsSheet open=\{creditsOpen\}/);
});

test('every Guide section is rendered by the shell (nothing is orphaned)', () => {
  // The four routed sections all appear in App's guide switch.
  assert.match(app, /case 'stages':[\s\S]*?<StagesScreen/);
  assert.match(app, /case 'stops':[\s\S]*?<StopsScreen/);
  assert.match(app, /case 'shops':[\s\S]*?<GuideShopsScreen/);
  assert.match(app, /case 'transport':[\s\S]*?<GuideTransportScreen/);
  // Each wrapped in the SectionShell with a way back to the Guide home.
  const guideCase = app.slice(app.indexOf("case 'guide':"), app.indexOf("case 'plan':"));
  const shells = guideCase.match(/<SectionShell label="Guide"/g) ?? [];
  assert.equal(shells.length, 4, 'all four sections carry the back affordance');
});

test('Guide reads through the content boundary and shows the honest edition', () => {
  assert.match(
    guide,
    /from '\.\.\/trail\/activeTrailContent'/,
    'ACTIVE_TRAIL_CONTENT is the data entrance',
  );
  assert.ok(!guide.includes("from '../data/"), 'no direct data imports');
  // The trail name and content version come from the dossier view model.
  assert.match(guide, /trailDossierView\(\)/);
  assert.match(guide, /\{dossier\.contentVersionLabel\} \{dossier\.contentVersion\}/);
  // No global freshness claim: the view model's fullyReviewedOn (null until
  // a real whole-dossier review exists) is deliberately not rendered, and
  // no hand-written date claim sneaks in.
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
  // Transport's Add to Trip / View in Trip navigate to Plan → Trip with a
  // one-shot launch payload — the dossier itself stays read-only.
  assert.match(
    guide,
    /onNavigate\('plan', \{ lists: \{ addTransportEntryId: entryId \} \}\)/,
  );
  assert.match(guide, /onNavigate\('plan', \{ lists: \{ tripItemId: itemId \} \}\)/);
});
