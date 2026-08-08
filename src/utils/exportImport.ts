import type { PersistentState } from '../types';
import { readState, SCHEMA_VERSION } from './storage';

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

/** Trigger a download of an in-memory Blob (used for Trail Wallet exports). */
export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a text-file download in the browser. */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType: string,
): void {
  downloadBlobFile(filename, new Blob([text], { type: mimeType }));
}

/** Trigger a JSON file download in the browser. */
export function downloadJson(filename: string, data: unknown): void {
  downloadTextFile(filename, JSON.stringify(data, null, 2), 'application/json');
}

/** Why an import was refused — distinct causes, distinct messages. */
export type ImportFailureReason = 'invalid-json' | 'unexpected-shape' | 'trail-mismatch';

export type ImportResult =
  | { ok: true; state: PersistentState }
  | { ok: false; error: string; reason: ImportFailureReason };

/**
 * Parse a pasted/loaded JSON string. Accepts either a full export envelope or
 * a bare state object. Never throws — returns a typed result so the UI can
 * show a clear error without losing existing data.
 *
 * ATOMICITY. This function is pure: it parses and validates, and writes
 * nothing. A refused import therefore has no partial effect to undo — the
 * caller applies state only on `ok: true`, so the current state, stored
 * documents and pointers are untouched by a failure.
 *
 * A backup written for a DIFFERENT trail is refused with its own reason, kept
 * distinct from corrupt JSON and from an unexpected shape: the file is
 * perfectly valid, it simply belongs somewhere else, and telling the user it
 * is broken would be wrong.
 */
export function parseImport(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalid-json', error: 'That file is not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      ok: false,
      reason: 'unexpected-shape',
      error: 'Unexpected file shape — expected an object.',
    };
  }

  const maybeEnvelope = parsed as Partial<ExportEnvelope>;
  const candidate =
    maybeEnvelope.app === 'fjallkompis' && maybeEnvelope.state
      ? maybeEnvelope.state
      : parsed;

  const result = readState(candidate);
  if (!result.ok) {
    return {
      ok: false,
      reason: 'trail-mismatch',
      error:
        'This backup belongs to a different trail. Fjallkompis is set up for the ' +
        'Kungsleden, so nothing was imported and your trip data is unchanged.',
    };
  }
  return { ok: true, state: result.state };
}
