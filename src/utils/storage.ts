import type { PersistentState } from '../types';
import { DEFAULT_STAGE_ID } from '../data/stages';
import {
  SCHEMA_VERSION,
  defaultState as buildDefaultState,
  normalizeState as normalizeAgainstSchema,
} from './stateMigration.mjs';

export const STORAGE_KEY = 'fjallkompis:state';
export { SCHEMA_VERSION };

export function defaultState(): PersistentState {
  return buildDefaultState(DEFAULT_STAGE_ID);
}

/**
 * Validate + normalise an unknown blob into PersistentState, migrating
 * schema v1 payloads to v2 (see src/utils/stateMigration.mjs). Unknown or
 * missing fields fall back to defaults rather than throwing.
 */
export function normalizeState(raw: unknown): PersistentState {
  return normalizeAgainstSchema(raw, DEFAULT_STAGE_ID);
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
    return normalizeState(JSON.parse(raw));
  } catch (err) {
    console.warn('Fjällkompis: could not read saved state, starting fresh.', err);
    return defaultState();
  }
}

export function saveState(state: PersistentState): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Most likely quota — non-fatal for a prototype, but surface it.
    console.warn('Fjällkompis: could not save state.', err);
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
