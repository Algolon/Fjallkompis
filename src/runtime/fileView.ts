/**
 * Platform boundary for VIEWING a locally stored file — the sibling of
 * fileSave.ts (which delivers a file the user keeps; this one shows a file
 * the user looks at). The Trail Wallet's PDF opening is the only caller,
 * through the shared opener in src/wallet/documentDelivery.mjs.
 *
 *  - Browser / PWA: a new tab on a blob: URL — every real browser brings its
 *    own PDF viewer, and this is the behaviour the PWA has always had. A
 *    `window.open` that returns no window (popup rules) reports
 *    'unavailable' so the caller can fall back.
 *  - Capacitor Android: `window.open` is a TRAP here and must never be
 *    tried. The WebView has no PDF renderer, and current Chromium WebViews
 *    (emulator-verified on Chrome 133) return a real WindowProxy and then
 *    silently drop the same-tab blob navigation — success is reported, the
 *    fallback never runs, and the user gets a dead button. That is exactly
 *    the regression that broke Wallet/Travel/Today PDF opening in the Play
 *    build while the PWA kept working. So on Android the bytes cross the
 *    bridge in base64 chunks to ViewFilePlugin.java, which stages them in an
 *    app-private cache file and hands a temporary content-URI read grant to
 *    the viewer the platform resolves (ACTION_VIEW) — fully offline, no
 *    storage permission, no raw path leaves the app. A device with no
 *    PDF-capable app reports 'unavailable' (plugin code NO_VIEWER), and the
 *    caller falls back to the SAF save path.
 *
 * Lives in src/runtime/ because it is platform plumbing: screens and the
 * wallet opener call this narrow function and never learn which platform
 * they are on.
 */
import { registerPlugin } from '@capacitor/core';
import { isNativeAndroid } from './platform';
import { streamBlobInChunks } from './fileSave';

interface ViewFileBridge {
  begin(options: { fileName: string; mimeType: string }): Promise<void>;
  writeChunk(options: { data: string }): Promise<void>;
  view(): Promise<void>;
  abort(): Promise<void>;
}

const ViewFile = registerPlugin<ViewFileBridge>('ViewFile');

/**
 * 'unavailable' means "this platform cannot show it right now" — a state the
 * caller answers with the save fallback, never an error.
 */
export type ViewFileOutcome = 'opened' | 'unavailable';

/**
 * How long the opened browser tab gets to adopt the blob before the URL is
 * revoked (the tab keeps working afterwards; the window is for slow loads).
 */
const REVOKE_AFTER_MS = 60_000;

export async function openFileInPlatformViewer(
  fileName: string,
  blob: Blob,
  mimeType: string,
): Promise<ViewFileOutcome> {
  if (!isNativeAndroid()) {
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
      return 'opened';
    }
    URL.revokeObjectURL(url);
    return 'unavailable';
  }

  try {
    await ViewFile.begin({ fileName, mimeType });
  } catch (err) {
    console.warn('Fjallkompis: could not stage the document for viewing.', err);
    return 'unavailable';
  }
  try {
    await streamBlobInChunks(blob, (data) => ViewFile.writeChunk({ data }));
    await ViewFile.view();
    return 'opened';
  } catch (err) {
    // The plugin has already discarded the staged file; only the stream
    // bookkeeping needs closing here.
    await ViewFile.abort().catch(() => {});
    if ((err as { code?: string })?.code !== 'NO_VIEWER') {
      console.warn('Fjallkompis: the platform viewer refused the document.', err);
    }
    return 'unavailable';
  }
}
