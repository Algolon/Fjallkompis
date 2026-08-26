/**
 * Hash-route table for the five primary destinations and their sections.
 *
 * Multi-device access (in scope): the same URL opens on phone, tablet and
 * desktop, browser Back/Forward work, refresh keeps the destination — a
 * refresh on a sub-route reopens that section, never an empty home — and
 * every destination is bookmarkable. Hash routing is used deliberately: it
 * needs no server rewrites, so direct links work unchanged on the GitHub
 * Pages project subpath (/Fjallkompis/#/map).
 *
 * vNext (mobile pilot shell): the six pre-vNext tabs collapsed into five —
 * Today, Map, Guide (the read-only trail dossier), Plan (personal
 * preparation) and Settings. Guide and Plan are the only tabs with
 * sections; each capability has exactly ONE canonical hash, and the old
 * public hashes (#/stages, #/stops, #/lists) stay working as aliases so
 * saved links never break. The historical internal tab ids ('stages',
 * 'huts', 'checklist') survive only as navigate() call-site vocabulary —
 * resolveNavTarget.mjs maps them here; they are not URLs.
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
 *
 * Today sits deliberately in the CENTRE: it is the operational home during
 * the hike, flanked by the two reference tabs (Guide, Map) on the left and
 * the two personal tabs (Plan, Settings) on the right. The tab bar gives
 * the centre item a subtly elevated treatment (TabBar.tsx) — it stays an
 * ordinary navigation destination, never an action button.
 */
export const TAB_ROUTES = [
  { tab: 'guide', hash: '#/guide', label: 'Guide' },
  { tab: 'map', hash: '#/map', label: 'Map' },
  { tab: 'today', hash: '#/today', label: 'Today' },
  { tab: 'plan', hash: '#/plan', label: 'Plan' },
  { tab: 'settings', hash: '#/settings', label: 'Settings' },
];

export const DEFAULT_TAB = 'today';

/** Guide's dossier sections, in index order. */
export const GUIDE_SECTIONS = ['stages', 'stops', 'shops', 'transport', 'weather'];

/** Plan's personal sections, in dashboard order. */
export const PLAN_SECTIONS = ['day', 'packing', 'travel', 'wallet'];

/**
 * Every canonical destination: the five tab homes plus one sub-route per
 * Guide/Plan section. One capability ↔ one hash; aliases below never add a
 * second canonical address.
 */
export const DESTINATION_ROUTES = [
  ...TAB_ROUTES.map(({ tab, hash }) => ({ tab, section: null, hash })),
  ...GUIDE_SECTIONS.map((section) => ({
    tab: 'guide',
    section,
    hash: `#/guide/${section}`,
  })),
  ...PLAN_SECTIONS.map((section) => ({
    tab: 'plan',
    section,
    hash: `#/plan/${section}`,
  })),
];

/**
 * Pre-vNext public hashes → their canonical destination, so bookmarks and
 * saved links keep working. Stages and Stops moved into the Guide dossier;
 * a saved #/lists link opens the Plan home (Lists' sections split between
 * Guide and Plan, so the honest target is the index that reaches them all);
 * the pilot shell's short-lived combined '#/plan/trip' split into Travel &
 * stays and Wallet — a saved trip link opens Travel & stays, where the trip
 * items live. '#/huts' and '#/checklist' were internal ids, never URLs, and
 * still resolve to null.
 */
export const LEGACY_HASH_ALIASES = new Map([
  ['#/stages', '#/guide/stages'],
  ['#/stops', '#/guide/stops'],
  ['#/lists', '#/plan'],
  ['#/plan/trip', '#/plan/travel'],
]);

const HASH_TO_DESTINATION = new Map(DESTINATION_ROUTES.map((r) => [r.hash, r]));
const TAB_TO_HASH = new Map(TAB_ROUTES.map((r) => [r.tab, r.hash]));
const DESTINATION_TO_HASH = new Map(
  DESTINATION_ROUTES.map((r) => [`${r.tab}/${r.section ?? ''}`, r.hash]),
);

/** The location.hash for a tab's home ('#/today' for unknown ids — never throws). */
export function hashForTab(tab) {
  return TAB_TO_HASH.get(tab) ?? TAB_TO_HASH.get(DEFAULT_TAB);
}

/**
 * The canonical location.hash for a destination ({ tab, section }).
 * Unknown tab/section combinations fall back to the tab's home, then to
 * '#/today' — never throws, mirroring hashForTab.
 */
export function hashForDestination(destination) {
  const tab = destination?.tab;
  const section = destination?.section ?? null;
  return (
    DESTINATION_TO_HASH.get(`${tab}/${section ?? ''}`) ?? hashForTab(tab)
  );
}

/**
 * Resolve a raw location.hash to a destination ({ tab, section }), or null
 * when it names no known destination (including '' on a fresh load).
 * Tolerates one trailing slash so hand-typed URLs like #/map/ still land;
 * legacy aliases resolve to their new canonical destination (the caller
 * re-canonicalises the address bar with hashForDestination).
 */
export function destinationForHash(rawHash) {
  if (typeof rawHash !== 'string' || rawHash === '') return null;
  const normalized =
    rawHash.length > 2 && rawHash.endsWith('/')
      ? rawHash.slice(0, -1)
      : rawHash;
  const canonical = LEGACY_HASH_ALIASES.get(normalized) ?? normalized;
  const found = HASH_TO_DESTINATION.get(canonical);
  return found ? { tab: found.tab, section: found.section } : null;
}

/**
 * Resolve a raw location.hash to its tab id (sections resolve to their tab),
 * or null for unknown hashes — the pre-vNext signature, kept because the
 * "unknown → caller falls back" contract is unchanged.
 */
export function tabForHash(rawHash) {
  return destinationForHash(rawHash)?.tab ?? null;
}
