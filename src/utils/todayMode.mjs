/**
 * Today mode — remembers whether the Today screen last showed "Prepare"
 * (pre-departure dashboard) or "On route" (the on-trail day view).
 *
 * This is DEVICE PRESENTATION STATE, deliberately kept OUT of the versioned
 * PersistentState blob (fjallkompis:state):
 *   - it changes no trip data and needs no migration, so bumping the schema
 *     to v7 for it would be disproportionate;
 *   - it does not belong in a backup/transfer — a phone restored onto a new
 *     device should simply show whichever mode the user taps next;
 *   - precedent: UI-only dismissal state already lives outside the blob
 *     (PwaLifecycle's sessionStorage install-nudge key).
 * The key follows the same dotted-versioned naming as that precedent.
 *
 * Mode is only ever set by the user tapping the selector — never by dates,
 * trip phase or location (owner decision; see docs/proposals/today-prepare.md).
 *
 * Plain .mjs (with a sibling .d.mts) so `node --test` can exercise the
 * remember/normalize behaviour with a fake storage, no DOM required.
 */

export const TODAY_MODE_KEY = 'fjallkompis.todayMode.v1';

/** 'onroute' is the default: the pre-existing Today experience. */
export const DEFAULT_TODAY_MODE = 'onroute';

const MODES = new Set(['prepare', 'onroute']);

/** Unknown/corrupt stored values fall back to the default, never throw. */
export function normalizeTodayMode(raw) {
  return MODES.has(raw) ? raw : DEFAULT_TODAY_MODE;
}

/**
 * Read the remembered mode. `storage` is Storage-shaped (getItem); private
 * mode / disabled storage yields the default.
 */
export function readTodayMode(storage) {
  try {
    return normalizeTodayMode(storage.getItem(TODAY_MODE_KEY));
  } catch {
    return DEFAULT_TODAY_MODE;
  }
}

/** Remember a mode; quota/private-mode failures are silently non-fatal. */
export function saveTodayMode(storage, mode) {
  if (!MODES.has(mode)) return;
  try {
    storage.setItem(TODAY_MODE_KEY, mode);
  } catch {
    /* ignore — the selector still works, it just won't be remembered */
  }
}
