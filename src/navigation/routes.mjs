/**
 * Hash-route table for the six primary destinations.
 *
 * Multi-device access (in scope): the same URL opens on phone, tablet and
 * desktop, browser Back/Forward work, refresh keeps the destination, and
 * primary destinations are bookmarkable. Hash routing is used deliberately:
 * it needs no server rewrites, so direct links work unchanged on the GitHub
 * Pages project subpath (/Fjallkompis/#/map).
 *
 * Internal tab ids ('huts', 'checklist') are historical — persisted state and
 * screen wiring reference them — while the public hash segments use the
 * user-facing names ('stops', 'lists'). This module owns that mapping.
 *
 * Plain .mjs so node --test can validate the table and the parse/format
 * round-trip without a TypeScript toolchain (same pattern as
 * routeProgress.mjs / stateMigration.mjs).
 */

/**
 * Canonical tab order — the single source of truth for navigation order on
 * every device class (bottom tab bar, rail and sidebar all render this).
 * Guarded by tests/navigation-routes.test.mjs: changing mobile tab order is
 * a deliberate act, not a side effect.
 */
export const TAB_ROUTES = [
  { tab: 'today', hash: '#/today', label: 'Today' },
  { tab: 'map', hash: '#/map', label: 'Map' },
  { tab: 'stages', hash: '#/stages', label: 'Stages' },
  { tab: 'huts', hash: '#/stops', label: 'Stops' },
  { tab: 'checklist', hash: '#/lists', label: 'Lists' },
  { tab: 'settings', hash: '#/settings', label: 'Settings' },
];

export const DEFAULT_TAB = 'today';

const HASH_TO_TAB = new Map(TAB_ROUTES.map((r) => [r.hash, r.tab]));
const TAB_TO_HASH = new Map(TAB_ROUTES.map((r) => [r.tab, r.hash]));

/** The location.hash for a tab id ('#/today' for unknown ids — never throws). */
export function hashForTab(tab) {
  return TAB_TO_HASH.get(tab) ?? TAB_TO_HASH.get(DEFAULT_TAB);
}

/**
 * Resolve a raw location.hash to a tab id, or null when it names no known
 * destination (including '' on a fresh load). Tolerates a trailing slash so
 * hand-typed URLs like #/map/ still land.
 */
export function tabForHash(rawHash) {
  if (typeof rawHash !== 'string' || rawHash === '') return null;
  const normalized = rawHash.length > 2 && rawHash.endsWith('/')
    ? rawHash.slice(0, -1)
    : rawHash;
  return HASH_TO_TAB.get(normalized) ?? null;
}
