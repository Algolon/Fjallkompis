import type { PersistentState } from '../types';
import { normalizeState, SCHEMA_VERSION } from './storage';

export interface ExportEnvelope {
  app: 'fjallkompis';
  schemaVersion: number;
  exportedAt: string;
  state: PersistentState;
}

export function buildExport(state: PersistentState): ExportEnvelope {
  return {
    app: 'fjallkompis',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
}

/** Trigger a file download in the browser. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type ImportResult =
  | { ok: true; state: PersistentState }
  | { ok: false; error: string };

/**
 * Parse a pasted/loaded JSON string. Accepts either a full export envelope or
 * a bare state object. Never throws — returns a typed result so the UI can
 * show a clear error without losing existing data.
 */
export function parseImport(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Unexpected file shape — expected an object.' };
  }

  const maybeEnvelope = parsed as Partial<ExportEnvelope>;
  const candidate =
    maybeEnvelope.app === 'fjallkompis' && maybeEnvelope.state
      ? maybeEnvelope.state
      : parsed;

  const state = normalizeState(candidate);
  return { ok: true, state };
}
