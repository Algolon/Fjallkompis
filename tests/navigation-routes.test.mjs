/**
 * Guards the hash-route table (src/navigation/routes.mjs) — the single
 * source of truth for navigation order, labels and URLs on every device
 * class. The mobile bottom tab bar renders exactly this table, so this test
 * is the regression fence for the non-negotiable mobile requirement that
 * the FIVE vNext destinations (Today, Map, Guide, Plan, Settings) keep
 * their order and labels — no sixth destination, no hidden More menu.
 *
 * Sections and legacy aliases: Guide and Plan carry sub-routes (one
 * canonical hash per capability), and the pre-vNext public hashes stay
 * working as aliases so saved links never break.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAB_ROUTES,
  DEFAULT_TAB,
  GUIDE_SECTIONS,
  PLAN_SECTIONS,
  DESTINATION_ROUTES,
  LEGACY_HASH_ALIASES,
  hashForTab,
  hashForDestination,
  destinationForHash,
  tabForHash,
} from '../src/navigation/routes.mjs';

test('the five destinations keep their order, labels and hashes', () => {
  assert.deepEqual(TAB_ROUTES, [
    { tab: 'today', hash: '#/today', label: 'Today' },
    { tab: 'map', hash: '#/map', label: 'Map' },
    { tab: 'guide', hash: '#/guide', label: 'Guide' },
    { tab: 'plan', hash: '#/plan', label: 'Plan' },
    { tab: 'settings', hash: '#/settings', label: 'Settings' },
  ]);
});

test('default destination is Today', () => {
  assert.equal(DEFAULT_TAB, 'today');
  assert.equal(hashForTab(DEFAULT_TAB), '#/today');
});

test('Guide and Plan own exactly the vNext sections, in index order', () => {
  assert.deepEqual(GUIDE_SECTIONS, ['stages', 'stops', 'shops', 'transport']);
  assert.deepEqual(PLAN_SECTIONS, ['day', 'trip', 'packing']);
});

test('every capability has exactly ONE canonical hash', () => {
  const hashes = DESTINATION_ROUTES.map((r) => r.hash);
  assert.equal(new Set(hashes).size, hashes.length, 'no duplicate hashes');
  assert.deepEqual(hashes, [
    '#/today',
    '#/map',
    '#/guide',
    '#/plan',
    '#/settings',
    '#/guide/stages',
    '#/guide/stops',
    '#/guide/shops',
    '#/guide/transport',
    '#/plan/day',
    '#/plan/trip',
    '#/plan/packing',
  ]);
  // An alias never doubles as a canonical address.
  for (const legacy of LEGACY_HASH_ALIASES.keys()) {
    assert.ok(!hashes.includes(legacy), `${legacy} is an alias, not a route`);
  }
});

test('hashForDestination ↔ destinationForHash round-trips every destination', () => {
  for (const { tab, section, hash } of DESTINATION_ROUTES) {
    assert.equal(hashForDestination({ tab, section }), hash);
    assert.deepEqual(destinationForHash(hash), { tab, section });
  }
});

test('hashForTab still answers every tab home (back-compat surface)', () => {
  for (const { tab, hash } of TAB_ROUTES) {
    assert.equal(hashForTab(tab), hash);
    assert.equal(tabForHash(hash), tab);
  }
});

test('the pre-vNext public hashes redirect to their new destination', () => {
  // Saved links and bookmarks keep working (task: no old deep link degrades).
  assert.deepEqual(destinationForHash('#/stages'), {
    tab: 'guide',
    section: 'stages',
  });
  assert.deepEqual(destinationForHash('#/stops'), {
    tab: 'guide',
    section: 'stops',
  });
  // Lists' sections split between Guide and Plan; the honest single target
  // for a saved #/lists link is the Plan home, which reaches them all.
  assert.deepEqual(destinationForHash('#/lists'), { tab: 'plan', section: null });
});

test('destinationForHash tolerates a trailing slash', () => {
  assert.deepEqual(destinationForHash('#/map/'), { tab: 'map', section: null });
  assert.deepEqual(destinationForHash('#/guide/stages/'), {
    tab: 'guide',
    section: 'stages',
  });
  assert.deepEqual(destinationForHash('#/stops/'), {
    tab: 'guide',
    section: 'stops',
  });
});

test('unknown or empty hashes resolve to null (caller falls back safely)', () => {
  assert.equal(destinationForHash(''), null);
  assert.equal(destinationForHash('#/'), null);
  assert.equal(destinationForHash('#/nope'), null);
  assert.equal(destinationForHash('#/huts'), null); // internal id, never a URL
  assert.equal(destinationForHash('#/checklist'), null);
  assert.equal(destinationForHash('#/guide/nope'), null);
  assert.equal(destinationForHash('#/plan/shops'), null); // section on wrong tab
  assert.equal(destinationForHash(undefined), null);
  assert.equal(tabForHash('#/nope'), null);
});

test('hash formatters never throw on unknown input — fall back to safety', () => {
  assert.equal(hashForTab('bogus'), '#/today');
  assert.equal(hashForDestination({ tab: 'bogus', section: null }), '#/today');
  assert.equal(hashForDestination({ tab: 'guide', section: 'bogus' }), '#/guide');
  assert.equal(hashForDestination(undefined), '#/today');
});
