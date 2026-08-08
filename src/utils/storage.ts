import type { PersistentState } from '../types';
import { DEFAULT_STAGE_ID, STAGE_TOPOLOGY } from '../data/stages';
import {
  SCHEMA_VERSION,
  defaultState as buildDefaultState,
  normalizeState as normalizeAgainstSchema,
  readState as readAgainstSchema,
} from './stateMigration.mjs';

export const STORAGE_KEY = 'fjallkompis:state';

/**
 * Where a stored blob belonging to a DIFFERENT trail is set aside, verbatim.
 *
 * Not reachable through any normal product flow — the app writes one trail's
 * data and there is no trail selector — but the normaliser can be handed such
 * a blob (a hand-edited entry, a future migration path), and the app must not
 * destroy it. Returning to defaults would let the first ordinary save
 * overwrite the only copy, so the raw text is copied here FIRST.
 *
 * Deliberately not a general quarantine system: one key, raw text, no schema,
 * no UI. The first foreign blob wins and is never overwritten by a later one —
 * the same "the original the user has not decided about" rule dayPlanRecovery
 * already follows.
 */
export const FOREIGN_STATE_KEY = 'fjallkompis:state:other-trail';

export { SCHEMA_VERSION };

export function defaultState(): PersistentState {
  return buildDefaultState(DEFAULT_STAGE_ID);
}

/**
 * Validate + normalise an unknown blob into PersistentState, migrating legacy
 * payloads forward (see src/utils/stateMigration.mjs). Unknown or missing
 * fields fall back to defaults rather than throwing.
 *
 * The canonical stage topology (ids + endpoints) is passed through so a
 * persisted Day plan's hiking legs can be validated against the real route;
 * the migration module itself stays free of route-data imports.
 */
export function normalizeState(raw: unknown): PersistentState {
  return normalizeAgainstSchema(raw, DEFAULT_STAGE_ID, STAGE_TOPOLOGY);
}

/**
 * Trail-aware read: the same normalisation, but able to say that a blob
 * belongs to a different trail instead of quietly returning defaults. Used by
 * the load and import boundaries, which must not adopt or overwrite foreign
 * data. See readState in src/utils/stateMigration.mjs.
 */
export function readState(raw: unknown) {
  return readAgainstSchema(raw, DEFAULT_STAGE_ID, STAGE_TOPOLOGY);
}

/**
 * Preserve a foreign blob before the app carries on with defaults. Best
 * effort: if it cannot be written (quota, disabled storage) the app still must
 * not adopt the data, so the failure is reported loudly rather than silently
 * changing the outcome.
 */
function setAsideForeignState(rawText: string): void {
  try {
    if (localStorage.getItem(FOREIGN_STATE_KEY) === null) {
      localStorage.setItem(FOREIGN_STATE_KEY, rawText);
    }
  } catch (err) {
    console.warn(
      'Fjallkompis: saved data belongs to another trail and could not be set aside. ' +
        'It will be replaced when this session saves.',
      err,
    );
  }
}

/** True if localStorage is usable (private-mode / disabled-storage safe). */
export function storageAvailable(): boolean {
  try {
    const k = '__fk_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function loadState(): PersistentState {
  if (!storageAvailable()) return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const result = readState(JSON.parse(raw));
    if (!result.ok) {
      // Data for another trail: never adopted (not one personal field is
      // read), never silently destroyed (the raw text is set aside first).
      setAsideForeignState(raw);
      console.warn(
        `Fjallkompis: saved data belongs to another trail (${String(result.trailId)}); ` +
          `starting fresh for ${result.expectedTrailId}. The original was kept under ` +
          `"${FOREIGN_STATE_KEY}".`,
      );
      return defaultState();
    }
    return result.state;
  } catch (err) {
    console.warn('Fjallkompis: could not read saved state, starting fresh.', err);
    return defaultState();
  }
}

export function saveState(state: PersistentState): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Most likely quota — non-fatal for a prototype, but surface it.
    console.warn('Fjallkompis: could not save state.', err);
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
