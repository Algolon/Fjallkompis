/**
 * Guards the hash-route table (src/navigation/routes.mjs) — the single
 * source of truth for navigation order, labels and URLs on every device
 * class. The mobile bottom tab bar renders exactly this table, so this test
 * is the regression fence for the non-negotiable mobile requirement that
 * the six destinations keep their order and labels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAB_ROUTES,
  DEFAULT_TAB,
  hashForTab,
  tabForHash,
} from '../src/navigation/routes.mjs';

test('the six destinations keep their order, labels and hashes', () => {
  assert.deepEqual(TAB_ROUTES, [
    { tab: 'today', hash: '#/today', label: 'Today' },
    { tab: 'map', hash: '#/map', label: 'Map' },
    { tab: 'stages', hash: '#/stages', label: 'Stages' },
    { tab: 'huts', hash: '#/stops', label: 'Stops' },
    { tab: 'checklist', hash: '#/lists', label: 'Lists' },
    { tab: 'settings', hash: '#/settings', label: 'Settings' },
  ]);
});

test('default destination is Today', () => {
  assert.equal(DEFAULT_TAB, 'today');
  assert.equal(hashForTab(DEFAULT_TAB), '#/today');
});

test('hashForTab ↔ tabForHash round-trips every destination', () => {
  for (const { tab, hash } of TAB_ROUTES) {
    assert.equal(hashForTab(tab), hash);
    assert.equal(tabForHash(hash), tab);
  }
});

test('tabForHash tolerates a trailing slash', () => {
  assert.equal(tabForHash('#/map/'), 'map');
  assert.equal(tabForHash('#/stops/'), 'huts');
});

test('unknown or empty hashes resolve to null (caller falls back safely)', () => {
  assert.equal(tabForHash(''), null);
  assert.equal(tabForHash('#/'), null);
  assert.equal(tabForHash('#/nope'), null);
  assert.equal(tabForHash('#/huts'), null); // internal id is not a public URL
  assert.equal(tabForHash('#/checklist'), null);
  assert.equal(tabForHash(undefined), null);
});

test('hashForTab never throws on unknown ids — falls back to the default', () => {
  assert.equal(hashForTab('bogus'), '#/today');
});
