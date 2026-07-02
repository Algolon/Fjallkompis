import type { PersistentState } from '../types';
import { DEFAULT_STAGE_ID } from '../data/stages';

export const STORAGE_KEY = 'fjallkompis:state';
export const SCHEMA_VERSION = 1;

export function defaultState(): PersistentState {
  return {
    schemaVersion: SCHEMA_VERSION,
    currentStageId: DEFAULT_STAGE_ID,
    checklist: {},
    hutData: {},
    journal: [],
  };
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

/**
 * Validate + normalise an unknown blob into PersistentState.
 * Unknown/missing fields fall back to defaults rather than throwing, so a
 * partially-corrupt or older payload still loads instead of wiping the app.
 */
export function normalizeState(raw: unknown): PersistentState {
  const base = defaultState();
  if (typeof raw !== 'object' || raw === null) return base;
  const obj = raw as Record<string, unknown>;

  return {
    schemaVersion: SCHEMA_VERSION,
    currentStageId:
      typeof obj.currentStageId === 'string' || obj.currentStageId === null
        ? (obj.currentStageId as string | null)
        : base.currentStageId,
    checklist:
      isStringBoolMap(obj.checklist) ? (obj.checklist as Record<string, boolean>) : {},
    hutData: isObject(obj.hutData)
      ? (obj.hutData as PersistentState['hutData'])
      : {},
    journal: Array.isArray(obj.journal)
      ? (obj.journal as PersistentState['journal']).filter(isJournalish)
      : [],
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringBoolMap(v: unknown): boolean {
  if (!isObject(v)) return false;
  return Object.values(v).every((x) => typeof x === 'boolean');
}

function isJournalish(v: unknown): boolean {
  return isObject(v) && typeof (v as { id?: unknown }).id === 'string';
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
