/**
 * Platform boundary for DELIVERING the complete-backup file to the user.
 *
 * The domain layer (src/backup/*) builds bytes and knows nothing about
 * platforms; this adapter owns the one genuinely platform-specific step:
 *
 *  - Browser / PWA: a normal `<a download>` on a blob URL — the same
 *    mechanism the lightweight JSON export has always used.
 *  - Capacitor Android: the WebView does NOT turn blob-URL anchors into
 *    downloads (no DownloadListener; blob: has no meaning outside the page),
 *    so the bytes cross the bridge in base64 chunks to SaveFilePlugin.java,
 *    which runs the system's ACTION_CREATE_DOCUMENT picker — the user
 *    chooses the location, no storage permission exists or is asked for.
 *
 * RESTORE needs no adapter: `<input type="file">` works identically in the
 * browser and in the Capacitor WebView (the wallet's attach-file flow
 *  already relies on it on the device).
 *
 * Lives in src/runtime/ because it is runtime plumbing in the same sense as
 * platform.ts — screens call this narrow function and never touch Capacitor.
 */
import { registerPlugin } from '@capacitor/core';
import { isNativeAndroid } from './platform';
import { downloadBlobFile } from '../utils/exportImport';

interface SaveFileBridge {
  begin(options: { fileName: string; mimeType: string }): Promise<void>;
  writeChunk(options: { data: string }): Promise<void>;
  finish(): Promise<void>;
  abort(): Promise<void>;
}

const SaveFile = registerPlugin<SaveFileBridge>('SaveFile');

/** 'cancelled' is the user dismissing the system picker — not an error. */
export type SaveBackupOutcome = 'saved' | 'cancelled';

/** Bridge messages stay ~1.3 MB as base64 — small enough per call. */
const CHUNK_BYTES = 1024 * 1024;

/** Base64 of a byte slice without blowing the argument-count limit. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
}

export async function saveBackupFile(fileName: string, blob: Blob): Promise<SaveBackupOutcome> {
  if (!isNativeAndroid()) {
    downloadBlobFile(fileName, blob);
    return 'saved';
  }

  try {
    // The container is a plain ZIP; application/zip is what SAF understands.
    // The .fjallkompis extension in fileName survives into the created file.
    await SaveFile.begin({ fileName, mimeType: 'application/zip' });
  } catch (err) {
    if ((err as { code?: string })?.code === 'USER_CANCELLED') return 'cancelled';
    throw err;
  }

  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      await SaveFile.writeChunk({ data: toBase64(bytes.subarray(offset, offset + CHUNK_BYTES)) });
    }
    await SaveFile.finish();
    return 'saved';
  } catch (err) {
    // The plugin deletes the half-written document; nothing to clean up but
    // the stream bookkeeping.
    await SaveFile.abort().catch(() => {});
    throw err;
  }
}
