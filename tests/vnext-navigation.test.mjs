/**
 * vNext navigation resolver — the "no capability becomes unreachable"
 * guarantee, tested behaviourally.
 *
 * Screen wiring still calls navigate() with the historical internal tab ids
 * ('stages', 'huts', 'checklist'); src/navigation/resolveNavTarget.mjs is
 * the ONE mapping onto the five-tab shell. This file walks every call-site
 * shape that exists in the app and asserts each lands on a real, canonical
 * destination — the behavioural replacement for the retired
 * tests/deeplink-payload-contract.test.mjs (whose header asked to be
 * replaced by exactly this kind of test once a real route layer existed).
 *
 * A small wiring-fence section keeps App.tsx honest about forwarding the
 * one-shot payloads into the destination screens.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveNavTarget } from '../src/navigation/resolveNavTarget.mjs';
import {
  DESTINATION_ROUTES,
  hashForDestination,
} from '../src/navigation/routes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/**
 * Every navigate() call-site shape in the app (grep for `onNavigate(` /
 * `navigate(`), paired with the destination it must reach. If a screen adds
 * a new shape, add it here — this table IS the capability migration matrix.
 */
const CALL_SITES = [
  // (The former Today Prepare cards are gone with the Prepare mode itself —
  //  their preparation summaries live on the Plan dashboard now, which
  //  navigates through openSection, not through legacy targets.)
  // Today
  {
    from: 'Today Stage guide',
    target: ['stages', { guideStageId: 'd3' }],
    dest: { tab: 'guide', section: 'stages' },
  },
  {
    from: 'Today View route',
    target: ['map', { mapFocus: { kind: 'route', stageId: 'd3', label: 'x' } }],
    dest: { tab: 'map', section: null },
  },
  {
    from: 'Today Tonight stop',
    target: ['huts', { stopId: 'stop_saltoluokta' }],
    dest: { tab: 'guide', section: 'stops' },
  },
  {
    from: 'Today curated place',
    target: ['huts', { placeId: 'place_x' }],
    dest: { tab: 'guide', section: 'stops' },
  },
  {
    from: 'Today Trip plan link',
    target: ['checklist', { lists: { section: 'trip' } }],
    dest: { tab: 'plan', section: 'travel' },
  },
  // Map
  {
    from: 'Map stop preview',
    target: ['huts', { stopId: 'stop_x' }],
    dest: { tab: 'guide', section: 'stops' },
  },
  // Stops chips and stays
  {
    from: 'Stops → Shops chip',
    target: ['checklist', { lists: { shopType: 'stf-large' } }],
    dest: { tab: 'guide', section: 'shops' },
  },
  {
    from: 'Stops → Transport chip (entry)',
    target: ['checklist', { lists: { transportId: 'line-91-return' } }],
    dest: { tab: 'guide', section: 'transport' },
  },
  {
    from: 'Stops → Transport chip (context)',
    target: ['checklist', { lists: { transportContext: 'abisko' } }],
    dest: { tab: 'guide', section: 'transport' },
  },
  {
    from: 'Stops → Track stay',
    target: ['checklist', { lists: { section: 'trip', trackStayPlaceId: 'p1' } }],
    dest: { tab: 'plan', section: 'travel' },
  },
  {
    from: 'Stops → View stay',
    target: ['checklist', { lists: { section: 'trip', tripItemId: 't1' } }],
    dest: { tab: 'plan', section: 'travel' },
  },
  // Guide → Transport's Trip launches (vNext cross-tab)
  {
    from: 'Guide Transport → Add to Trip',
    target: ['plan', { lists: { addTransportEntryId: 'line-91-return' } }],
    dest: { tab: 'plan', section: 'travel' },
  },
  {
    from: 'Guide Transport → View in Trip',
    target: ['plan', { lists: { tripItemId: 't1' } }],
    dest: { tab: 'plan', section: 'travel' },
  },
  // Trip → View place (back out to the dossier)
  {
    from: 'Trip View place',
    target: ['huts', { placeId: 'p1' }],
    dest: { tab: 'guide', section: 'stops' },
  },
  // Day plan Preview (now on Plan)
  { from: 'Day plan Preview', target: ['today'], dest: { tab: 'today', section: null } },
  // Bare legacy Lists target (no payload): Lists' old default was Packing.
  { from: 'bare checklist', target: ['checklist'], dest: { tab: 'plan', section: 'packing' } },
  // Tab bar taps land on tab homes (pop-to-root from any section).
  { from: 'tab bar', target: ['guide'], dest: { tab: 'guide', section: null } },
  { from: 'tab bar', target: ['plan'], dest: { tab: 'plan', section: null } },
];

test('every navigate() call-site shape lands on a real canonical destination', () => {
  const known = new Set(
    DESTINATION_ROUTES.map((r) => `${r.tab}/${r.section ?? ''}`),
  );
  for (const { from, target, dest } of CALL_SITES) {
    const resolved = resolveNavTarget(...target);
    assert.deepEqual(resolved, dest, `${from}: ${JSON.stringify(target)}`);
    assert.ok(
      known.has(`${resolved.tab}/${resolved.section ?? ''}`),
      `${from} resolves to a routed destination`,
    );
    // And that destination is addressable — refresh keeps it.
    assert.match(hashForDestination(resolved), /^#\//);
  }
});

test('the resolver mirrors the retired Lists default precedence exactly', () => {
  // Explicit targets win over the section field; nothing defaults to Packing.
  assert.deepEqual(
    resolveNavTarget('checklist', {
      lists: { section: 'packing', shopType: 'stf-small' },
    }),
    { tab: 'guide', section: 'shops' },
  );
  assert.deepEqual(
    resolveNavTarget('checklist', { lists: { section: 'shops' } }),
    { tab: 'guide', section: 'shops' },
  );
  assert.deepEqual(
    resolveNavTarget('checklist', { lists: { section: 'transport' } }),
    { tab: 'guide', section: 'transport' },
  );
  assert.deepEqual(resolveNavTarget('checklist', { lists: {} }), {
    tab: 'plan',
    section: 'packing',
  });
});

test('legacy ids are call-site vocabulary only — never rendered as tabs', () => {
  const tabbar = read('src/components/TabBar.tsx');
  // The rendered tab set comes from TAB_ROUTES (five entries, asserted in
  // tests/navigation-routes.test.mjs); the legacy ids live in a type only.
  assert.match(tabbar, /LegacyNavTarget = 'stages' \| 'huts' \| 'checklist'/);
  assert.ok(!/TAB_ICONS\[.*'huts'/.test(tabbar), 'no icon slot for a legacy id');
});

// ---- App wiring fences (one-shot payload forwarding) -----------------------

test('App forwards the one-shot payloads into the destination screens', () => {
  const app = read('src/App.tsx');
  // Guide → Stops: placeId generalises stopId, place id wins.
  assert.match(
    app,
    /initialPlaceId=\{nav\.payload\?\.placeId \?\? nav\.payload\?\.stopId \?\? null\}/,
  );
  // Guide → Stages: the guide deep-link quartet.
  assert.match(app, /initialGuideStageId=\{nav\.payload\?\.guideStageId \?\? null\}/);
  assert.match(app, /initialGuideStageIds=\{nav\.payload\?\.guideStageIds\}/);
  // Guide → Shops/Transport: the Lists-era payload fields, forwarded.
  assert.match(app, /initialShopType=\{nav\.payload\?\.lists\?\.shopType\}/);
  assert.match(app, /initialEntryId=\{nav\.payload\?\.lists\?\.transportId\}/);
  assert.match(app, /initialContext=\{nav\.payload\?\.lists\?\.transportContext\}/);
  // Plan → Trip: the whole lists payload rides along (launch derivation
  // lives in PlanTripScreen).
  assert.match(app, /deepLink=\{nav\.payload\?\.lists\}/);
  // Map: focus payload and stop-preview callback.
  assert.match(app, /focus=\{nav\.payload\?\.mapFocus \?\? null\}/);
  assert.match(app, /onOpenStop=\{\(stopId\) => navigate\('huts', \{ stopId \}\)\}/);
  // Settings takes no payload: its only deep-link target was the Trail
  // readiness panel, removed in the v1 UX finishing pass, and the plumbing
  // went with it rather than being left dangling.
  assert.match(app, /return <SettingsScreen \/>;/);
  assert.ok(!/initialSection/.test(app), 'no dead deep-link prop remains');
});

test('payloads stay one-shot and in-memory — nothing navigational persists', () => {
  const app = read('src/App.tsx');
  assert.ok(!/localStorage/.test(app), 'the shell never touches storage');
  // The direction-change reset drops the payload but keeps the destination
  // (and the freshTab transition flag — see tests/section-transition.test.mjs).
  assert.match(
    app,
    /setNav\(\(n\) =>\s*\n?\s*n\.payload \? \{ tab: n\.tab, section: n\.section, freshTab: n\.freshTab \} : n,?\s*\n?\s*\)/,
  );
  // Storage/migration/export know nothing about payload fields.
  const mig = read('src/utils/stateMigration.mjs');
  assert.ok(!/guideStageId|mapFocus|deepLink|trackStayPlaceId/.test(mig));
});
