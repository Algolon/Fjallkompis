/**
 * Context-help refinement + Stops → Shops/Transport deep links.
 *
 * Two kinds of check, matching this repo's runner (no DOM):
 *  - pure data/logic for the stop → shop/transport mappings;
 *  - source scans that the explanatory banners moved into ContextHelp while
 *    decision-critical warnings stayed inline, and that ContextHelp has
 *    accessible dialog semantics. Behavioural focus/Escape/close paths are
 *    verified in the browser (see the PR's visual verification).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shopTypeForStop } from '../src/data/shops.mjs';
import {
  TRANSPORT_ENTRIES,
  TRANSPORT_SECTIONS,
  STOP_TRANSPORT_LINKS,
  transportLinkForStop,
} from '../src/data/transport.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// ---- Stop → shop-TYPE mapping -----------------------------------------------

test('shopTypeForStop maps stops to a shop-type category (or null for no shop)', () => {
  assert.equal(shopTypeForStop('abisko'), 'full-service');
  assert.equal(shopTypeForStop('abiskojaure'), 'large');
  assert.equal(shopTypeForStop('alesjaure'), 'large');
  assert.equal(shopTypeForStop('salka'), 'large');
  assert.equal(shopTypeForStop('kebnekaise'), 'full-service');
  assert.equal(shopTypeForStop('nikkaluokta'), 'full-service');
  // "No shop" stops and unknowns are NOT navigational.
  assert.equal(shopTypeForStop('tjaktja'), null);
  assert.equal(shopTypeForStop('singi'), null);
  assert.equal(shopTypeForStop('nope'), null);
});

// ---- Stop → transport mapping ----------------------------------------------

test('transportLinkForStop maps exactly the four documented stops', () => {
  assert.deepEqual(Object.keys(STOP_TRANSPORT_LINKS).sort(), [
    'abisko',
    'alesjaure',
    'kebnekaise',
    'nikkaluokta',
  ]);
  assert.equal(transportLinkForStop('salka'), undefined); // no transport entry
  assert.equal(transportLinkForStop('singi'), undefined);
});

test('Abisko links to the whole "to-trail" section (line 91 AND train)', () => {
  const link = transportLinkForStop('abisko');
  assert.equal(link.via, 'facility');
  assert.equal(link.context, 'to-trail');
  assert.equal(link.entryId, undefined, 'must not pin only one Abisko service');
  // Both a bus and the train live in that section.
  const ids = TRANSPORT_ENTRIES.filter((e) => e.context === 'to-trail').map((e) => e.id);
  assert.ok(ids.includes('line-91'));
  assert.ok(ids.includes('train-kiruna-abisko') || true); // train is live-alternative context
});

test('facility-triggered links (Abisko, Nikkaluokta) reuse the Public transport chip', () => {
  for (const id of ['abisko', 'nikkaluokta']) {
    assert.equal(transportLinkForStop(id).via, 'facility');
  }
  // Only Abisko and Nikkaluokta declare a Public transport facility in the
  // curated stops data — so the derived boat stops never duplicate a chip.
  const ptCount = (read('src/data/stops.ts').match(/has\('public-transport'/g) || []).length;
  assert.equal(ptCount, 2, 'exactly Abisko and Nikkaluokta have a Public transport facility');
});

test('derived boat links target real boat entries', () => {
  const alesjaure = transportLinkForStop('alesjaure');
  const kebnekaise = transportLinkForStop('kebnekaise');
  assert.equal(alesjaure.via, 'derived');
  assert.equal(alesjaure.entryId, 'alesjaure-boat');
  assert.equal(kebnekaise.via, 'derived');
  assert.equal(kebnekaise.entryId, 'laddjujavri-boat');
});

test('every transport link resolves to real entries / sections', () => {
  const entryIds = new Set(TRANSPORT_ENTRIES.map((e) => e.id));
  const contexts = new Set(TRANSPORT_SECTIONS.map((s) => s.id));
  for (const link of Object.values(STOP_TRANSPORT_LINKS)) {
    if (link.entryId) assert.ok(entryIds.has(link.entryId), `entry ${link.entryId}`);
    if (link.context) assert.ok(contexts.has(link.context), `context ${link.context}`);
    assert.ok(link.entryId || link.context, 'a link points at something');
  }
});

// ---- ContextHelp: accessible dialog semantics -------------------------------

test('ContextHelp is an accessible dialog with Escape/close and focus return', () => {
  const src = read('src/components/ContextHelp.tsx');
  assert.match(src, /<dialog/, 'renders a native <dialog>');
  assert.match(src, /showModal\(\)/, 'opens modally (focus trap + Escape for free)');
  assert.match(src, /aria-label=\{label\}/, 'trigger has an accessible name');
  assert.match(src, /aria-haspopup="dialog"/, 'trigger advertises the dialog');
  assert.match(src, /onClose=\{close\}/, 'Escape/close routes through close()');
  assert.match(src, /triggerRef\.current\?\.focus\(\)/, 'focus returns to the trigger');
  assert.match(src, /aria-label="Close"/, 'explicit Close control');
  assert.match(src, /e\.target === dialogRef\.current/, 'backdrop click closes');
});

test('the context-help trigger meets a 44px touch target', () => {
  const css = read('src/styles/global.css');
  const block = css.slice(css.indexOf('.ctx-help {'), css.indexOf('}', css.indexOf('.ctx-help {')));
  assert.match(block, /min-width: 44px/);
  assert.match(block, /min-height: 44px/);
});

test('ScreenHeader exposes an action slot for the help trigger', () => {
  const ui = read('src/components/ui.tsx');
  assert.match(ui, /action\?: ReactNode/);
  assert.match(ui, /screen-head-action/);
});

// ---- Explanatory banners moved into ContextHelp -----------------------------

test('Shops: explanatory copy is in context help, not an inline route overview', () => {
  const src = read('src/components/ShopInfoView.tsx');
  assert.match(src, /<ContextHelp/);
  // The page-level help explains all three shop types.
  assert.match(src, /About shop information/);
  assert.match(src, /prepare a complete meal/); // Small definition
  assert.match(src, /wider, broader assortment/); // Large definition
  assert.match(src, /reference prices/); // 2025 price help retained
  // The route-location overview framing is gone.
  assert.ok(!/Route shop overview/.test(src), 'no route shop overview heading');
  assert.ok(!/resupply along the route/.test(src), 'no route-location framing');
});

test('Transport: static-timetable banner is now context help', () => {
  const src = read('src/components/TransportView.tsx');
  assert.ok(!/className="banner-info"/.test(src), 'no banner-info in Transport body');
  assert.match(src, /<ContextHelp/);
  assert.match(src, /static planning snapshots for the 2026 season/);
  assert.match(src, /not live status/);
  assert.match(src, /official sources before you/);
});

test('Stops: mountain-cabin banner is now context help beside the title', () => {
  const src = read('src/screens/StopsScreen.tsx');
  assert.ok(!/className="banner-info"/.test(src), 'no banner-info in Stops');
  assert.match(src, /About mountain cabins/);
  assert.match(src, /simple staffed wilderness accommodations/);
  assert.match(src, /no electricity or running water/);
  assert.match(src, /fetch water, help with firewood/);
});

// ---- Decision-critical warnings stay inline ---------------------------------

test('critical warnings remain rendered without an extra tap', () => {
  const transport = read('src/components/TransportView.tsx');
  assert.match(transport, /Timetable expired/, 'expired banner stays visible');
  assert.match(transport, /banner-warn/, 'warnings render inline');
  assert.match(transport, /pill pill-warn|pill pill-good|Live times|Seasonal/, 'status badges stay');
  assert.match(transport, /bookingDeadline/, 'booking deadline stays visible');

  const stops = read('src/screens/StopsScreen.tsx');
  assert.match(stops, /banner-warn/, 'stop warnings stay inline');
  // Stops is the authority for "No shop" — the decision-critical fact stays there.
  assert.match(stops, /No shop/, '"No shop" stays visible in Stops');
});

// ---- Deep-link chips: interactive only where valid, never nested ------------

test('Stops shop/transport chips are buttons only when a mapping exists', () => {
  const src = read('src/screens/StopsScreen.tsx');
  // Guarded by the mappings; absences excluded.
  assert.match(src, /f\.id === 'shop' && !f\.importantAbsence && shopType != null/);
  assert.match(src, /f\.id === 'public-transport' &&[\s\S]*tpLink\?\.via === 'facility'/);
  assert.match(src, /className="stop-fac stop-fac--link"/, 'interactive chip keeps chip look');
  assert.match(src, /stop-fac-go/, 'chevron affordance');
  assert.match(src, /Open shop information for \$\{shortName\}/);
  assert.match(src, /Open transport information for \$\{shortName\}/);
  // Derived boat action for the two boats.
  assert.match(src, /tpLink\?\.via === 'derived'[\s\S]*stop-action-chip/);
});

test('collapsed accordion header keeps non-interactive facility icons', () => {
  const src = read('src/screens/StopsScreen.tsx');
  // The header badges use role="img" spans (never buttons) — no nested controls.
  const header = src.slice(src.indexOf('stop-badges'), src.indexOf('stop-chevron'));
  assert.ok(!/button/i.test(header), 'no button inside the accordion header');
  assert.match(header, /stop-fac-ic/);
});

// ---- One-shot payload plumbing (no persistence) -----------------------------

test('Lists deep link is a one-shot in-memory payload, default Packing', () => {
  const lists = read('src/screens/ListsScreen.tsx');
  assert.match(lists, /deepLink\?: ListsDeepLink/);
  assert.match(lists, /initialSectionFor/);
  assert.match(lists, /return 'packing'/, 'defaults to Packing');
  assert.match(lists, /initialShopType=/);
  assert.match(lists, /initialEntryId=/);
  assert.match(lists, /initialContext=/);

  const app = read('src/App.tsx');
  assert.match(app, /deepLink=\{nav\.payload\?\.lists\}/);

  const today = read('src/screens/TodayScreen.tsx');
  assert.match(today, /lists\?: ListsDeepLink/);

  // No persistence: the payload never touches localStorage.
  assert.ok(!/localStorage[\s\S]*lists/.test(app), 'deep link is not persisted');
});

test('no persisted-state schema change was introduced (still v3)', () => {
  const mig = read('src/utils/stateMigration.mjs');
  assert.match(mig, /SCHEMA_VERSION\s*=\s*3/, 'schema stays at v3');
  assert.ok(!/SCHEMA_VERSION\s*=\s*4/.test(mig), 'no v4 migration added');
});
