/**
 * Browser binding for the in-app PDF renderer — the ONLY module that knows
 * the app renders PDFs with pdf.js, and the only one that touches its
 * worker and asset wiring. Everything here is local to the app bundle:
 *
 *  - the LIBRARY and the WORKER come from the npm package `pdfjs-dist`
 *    (legacy build: the Android WebView population includes devices whose
 *    System WebView lags current Chrome by years, and the modern build
 *    assumes Promise.withResolvers-era JS);
 *  - the worker is bundled by Vite via the `?url` import below — an asset
 *    inside dist/, never a CDN;
 *  - the auxiliary decoders and fonts (wasm image codecs, ICC profiles, the
 *    14 standard Type1 fonts) ship as static `pdfjs/` assets copied from the
 *    same npm package at build time (vite.config.ts, pdfjsAuxAssets), served
 *    same-origin under the app's BASE_URL. CJK cMaps are deliberately NOT
 *    shipped (~1.7 MB for encodings a Kungsleden ticket wallet is very
 *    unlikely to meet); a PDF that needs them renders its Latin content and
 *    logs a warning instead of costing every install the weight.
 *
 * The import()s make this whole subsystem a LAZY chunk: a user who never
 * opens a PDF never downloads pdf.js. The PWA precaches the chunk and the
 * worker (globPatterns includes .mjs), so offline-first still holds.
 *
 * This module is deliberately platform-ignorant — the same code runs in the
 * browser, the installed PWA and the Capacitor Android WebView.
 */
import { openPdfDocument } from './pdfDocumentSource.mjs';
import type { OpenPdfResult } from './pdfDocumentSource.mjs';

export type { OpenPdfResult };

/** Where the build serves the pdf.js auxiliary assets from (same-origin). */
const AUX_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let libraryPromise: Promise<PdfjsModule> | null = null;

async function loadLibrary(): Promise<PdfjsModule> {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      const [lib, worker] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      ]);
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })();
    // A failed load (interrupted download of the lazy chunk) must stay
    // retryable on the next open — never cache the rejection.
    libraryPromise.catch(() => {
      libraryPromise = null;
    });
  }
  return libraryPromise;
}

/**
 * Open a stored Wallet PDF for in-app rendering. The blob's bytes are copied
 * once into a transferable buffer (pdf.js hands it to its worker); no object
 * URL, no base64, and nothing ever leaves the device.
 */
export async function openWalletPdf(blob: Blob): Promise<OpenPdfResult> {
  let lib: PdfjsModule;
  let data: Uint8Array;
  try {
    [lib, data] = await Promise.all([
      loadLibrary(),
      blob.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    ]);
  } catch (err) {
    console.warn('Fjallkompis: the PDF renderer could not be loaded.', err);
    return { ok: false, reason: 'unreadable' };
  }
  return (await openPdfDocument(lib, data, {
    wasmUrl: `${AUX_BASE}wasm/`,
    iccUrl: `${AUX_BASE}iccs/`,
    standardFontDataUrl: `${AUX_BASE}standard_fonts/`,
  })) as OpenPdfResult;
}
